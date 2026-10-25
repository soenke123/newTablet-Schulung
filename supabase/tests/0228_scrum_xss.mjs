/* Prüfstand für Migration 0228 — Scrum Werkstatt: kein HTML/Skript über
   Product Goal, Bilder und Avatar. Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Bestand: Avatar mit " dahinter → null; fremde Bilder fallen aus der
        Liste; Goal mit <img onerror> → nur noch Text.
     2. scrum_save: Goal mit <img>/<script>/on…=/javascript: in Tags →
        invalid_input; normales Editor-HTML, auch „online = …“ und
        „javascript:“ im Text → ok.
     3. scrum_save: Bild ohne vollständige data-URL → invalid_input.
     4. scrum_member_update: Avatar mit " → abgelehnt, echter → ok.
     5. scrum_room_restore (Import der Lehrkraft) prüft genauso.

   Aufruf:  node supabase/tests/0228_scrum_xss.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

const STUBS = `
create schema if not exists auth; create schema if not exists extensions;
set search_path = public, extensions;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;  -- 0223: Admins nur mit 2FA
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create role service_role; create role authenticated; create role anon;
create publication supabase_realtime;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const BEKANNT = new Set(['0087']);

await db.exec(STUBS);
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
const run = async (list) => {
  for (const f of list) {
    try { await db.exec(mig(f)); }
    catch (e) {
      if (BEKANNT.has(f.slice(0, 4))) continue;
      console.error(`FEHLER in ${f}: ${e.message}`);
      process.exit(1);
    }
  }
};
await run(FILES.filter(f => f.slice(0, 4) < '0228'));

const T = 'e0000000-0000-4000-8000-000000000a01';
const S = (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status) values ($1, $2, 'l', 'L', 'approved')`, [T, S]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('SCRUMX', 'scrum', $1, $2, 'Team X') returning id`, [T, S])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 3) g`);
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
await call(`scrum_enter('t1', 'member')`);
await call(`scrum_enter('t2', 'member')`);
const P1 = (await one(`select id from skill_participants where token = 't1'`)).id;
const P2 = (await one(`select id from skill_participants where token = 't2'`)).id;

const IMG  = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const EVIL_AV = 'data:image/png;base64," onerror="alert(1)';
const EVIL_GOAL = '<p>Ziel</p><img src=x onerror="fetch(1)">';

// Bestand, so wie ihn ein Angreifer VOR 0228 hinterlassen konnte
await db.query(`update scrum_members set avatar = $1 where participant_id = $2`, [EVIL_AV, P1]);
await db.query(`update scrum_members set avatar = $1 where participant_id = $2`, [IMG, P2]);
await db.query(`insert into scrum_items (room_id, kind, item_id, data) values
                 ($1, 'product', 'goal', $2), ($1, 'product', 'main', $3)
                 on conflict (room_id, kind, item_id) do update set data = excluded.data`,
  [R, JSON.stringify({ goal: EVIL_GOAL, images: [IMG, 'x" onerror="y', 42] }), JSON.stringify({ name: 'Proj' })]);

await run(FILES.filter(f => f.slice(0, 4) >= '0228'));
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

// 1
const av = (await db.query(`select participant_id p, avatar from scrum_members where room_id = $1 order by participant_id = $2 desc`, [R, P1])).rows;
ok('Bestand: Avatar mit " → null', av[0].avatar === null);
ok('Bestand: echter Avatar bleibt', av[1].avatar === IMG);
const g = (await one(`select data from scrum_items where room_id = $1 and kind = 'product' and item_id = 'goal'`, [R])).data;
ok('Bestand: nur gültige Bilder bleiben', JSON.stringify(g.images) === JSON.stringify([IMG]), JSON.stringify(g.images));
ok('Bestand: Goal ohne Tags, Wortlaut bleibt', !/[<>]/.test(g.goal) && g.goal.includes('Ziel'), g.goal);

// 2 + 3
const v = async () => (await one(`select version from scrum_items where room_id = $1 and kind = 'product' and item_id = 'goal'`, [R])).version;
const putGoal = async (data) => call(`scrum_save('t1', $1)`, [JSON.stringify([{ op: 'put', kind: 'product', id: 'goal', v: await v(), data }])]);
const bad = [
  ['<img src=x onerror=alert(1)>', 'img'],
  ['<p>x</p><script>alert(1)</script>', 'script'],
  ['<svg onload=alert(1)>', 'svg'],
  ['<b onmouseover="alert(1)">x</b>', 'on…= im Tag'],
  ['<div style="x" onclick=alert(1)>x</div>', 'onclick im Tag'],
  ['<a href="javascript:alert(1)">x</a>', 'javascript: im Tag'],
  ['<IFRAME src=//x>', 'iframe groß'],
];
for (const [goal, label] of bad) {
  const r = await putGoal({ goal, images: [] });
  ok(`scrum_save: ${label} → invalid_input`, r.error === 'invalid_input', JSON.stringify(r).slice(0, 80));
}
const fine = '<h2>Worum geht es?</h2><p>Wir messen <strong>online = schnell</strong> und lernen javascript: Grundlagen &lt;script&gt; als Text.</p><ul><li>Eins</li></ul>';
let r = await putGoal({ goal: fine, images: [IMG] });
ok('scrum_save: normales Editor-HTML ok (auch „online =“, „javascript:“, &lt;script&gt; im Text)', r.ok === true, JSON.stringify(r).slice(0, 120));
r = await putGoal({ goal: fine, images: ['data:image/png;base64,AAAA" onerror="x'] });
ok('scrum_save: Bild mit " → invalid_input', r.error === 'invalid_input');
r = await putGoal({ goal: fine, images: ['https://evil.example/x.png'] });
ok('scrum_save: Bild als fremde Adresse → invalid_input', r.error === 'invalid_input');
r = await putGoal({ goal: fine, images: [IMG, IMG, IMG, IMG, IMG, IMG] });
ok('scrum_save: mehr als 5 Bilder → invalid_input', r.error === 'invalid_input');
r = await call(`scrum_save('t1', $1)`, [JSON.stringify([{ op: 'put', kind: 'story', id: 's1', v: 0, data: { id: 's1', title: '<img src=x onerror=1>', status: 'todo' } }])]);
ok('scrum_save: Stories unberührt (werden überall maskiert angezeigt)', r.ok === true);

// 4
r = await call(`scrum_member_update('t1', $1, $2)`, [P1, JSON.stringify({ avatar: EVIL_AV })]);
// Die Funktion meldet seit 0196 für Form und Größe denselben Fehler.
ok('scrum_member_update: Avatar mit " → abgelehnt, nichts gespeichert',
   r.ok === false && (await one(`select avatar from scrum_members where participant_id = $1`, [P1])).avatar === null, JSON.stringify(r));
r = await call(`scrum_member_update('t1', $1, $2)`, [P1, JSON.stringify({ avatar: IMG })]);
ok('scrum_member_update: echter Avatar ok', r.ok === true, JSON.stringify(r));

// 5
await als(T);
const items = (goal) => JSON.stringify([
  { kind: 'product', id: 'main', data: { name: 'Proj' } },
  { kind: 'product', id: 'goal', data: { goal, images: [] } }]);
r = await call(`scrum_room_restore('SCRUMX', $1, 0, 0)`, [items(EVIL_GOAL)]);
ok('scrum_room_restore: Goal mit <img onerror> → invalid_input', r.error === 'invalid_input', JSON.stringify(r));
r = await call(`scrum_room_restore('SCRUMX', $1, 0, 0)`, [items(fine)]);
ok('scrum_room_restore: normales Goal ok', r.ok === true, JSON.stringify(r).slice(0, 100));

// Rechte
const pr = await one(`select has_function_privilege('anon', 'scrum_html_ok(text)', 'execute') a,
                             has_function_privilege('authenticated', 'scrum_product_ok(jsonb)', 'execute') b`);
ok('Prüf-Helfer für niemanden', !pr.a && !pr.b);

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
