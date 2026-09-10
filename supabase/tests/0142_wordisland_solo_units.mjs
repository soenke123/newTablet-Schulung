/* Prüfstand für Migration 0142 — die Unit am Wort.
   Echt gerechnet in pglite, Stubs wie in 0136…0141.

   Zweistufig wie die Prüfstände zu 0140/0141, damit auch der
   AUSGANGSZUSTAND mitgeprüft wird: erst laufen 0130…0141 — da gibt
   es weder `u` noch wi_solo_unit —, dann kommt 0142 obendrauf.

   Neun Zusagen:
     1. Vor 0142 trägt words_list kein `u`, und wi_solo_unit fehlt.
     2. Danach steht an jedem Wort seine Unit, und zwar die richtige.
     3. Auch die Wörter ABGEWÄHLTER Units stehen weiter drin — daran
        hängt das blasse Tier auf der Insel.
     4. wi_solo_unit liefert Kopf, Wortliste und Reihenfolge.
     5. Ein Wort ohne Chronik kommt mit leerem `st` (das Gerät liest
        vier Nullen daraus).
     6. Nach echten Antworten stimmen die vier Zahlen je Richtung —
        und `total` ist die Summe der Wortzeilen.
     7. `s` ist die Stufe aus wi_solo_stages und nicht nachgerechnet.
     8. Eine fremde Unit ist `not_found`, ein fremder Token auch.
     9. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0142_wordisland_solo_units.mjs  */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite();

const STUBS = `
set search_path = public, extensions;
create schema if not exists auth;
create table if not exists schools (id uuid primary key default gen_random_uuid(), slug text);
create table if not exists profiles (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id));
create table if not exists skill_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique, owner_id uuid, school_id uuid, title text,
  expires_at timestamptz not null default now() + interval '60 days');
create table if not exists skill_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references skill_rooms(id) on delete cascade,
  token text unique, seat int not null, name text,
  last_seen_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
/* ⚠️ In SCHEMA extensions — siehe 0136/0137. */
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(n int) returns bytea language sql as
  $$ select decode(md5(random()::text) || md5(random()::text), 'hex') $$;
create table if not exists skill_tools (
  id text primary key, title text not null, blurb text, icon text, folder text not null,
  subject text not null default 'Fächerübergreifend',
  multi_room boolean not null default true,
  max_participants int not null default 60, max_rooms int not null default 5,
  limits jsonb not null default '{}'::jsonb, active boolean not null default true,
  sort_order int not null default 100);
create role service_role; create role authenticated; create role anon;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const js = v => JSON.stringify(v);
const n = v => Number(v);

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

await run(STUBS, 'Stubs');
for (const f of ['0130_vocab_content.sql', '0131_wordisland_game.sql',
                 '0133_wordisland_lobby.sql', '0134_wordisland_back_to_lobby.sql',
                 '0135_wordisland_eight_factions.sql', '0136_wordisland_solo.sql',
                 '0137_wordisland_solo_pgcrypto.sql', '0138_wordisland_solo_stats.sql',
                 '0139_wordisland_solo_points.sql', '0140_wordisland_solo_bag_choice.sql',
                 '0141_wordisland_solo_pass_percent.sql']) {
  await run(mig(f), f.slice(0, 4));
}
console.log('— 0130 … 0141 laufen durch —\n');

/* ── Bühne ──────────────────────────────────────────────────── */
const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const R1     = 'b0000000-0000-4000-8000-000000000001';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}');
  insert into _who (uid) values (null);
  insert into skill_rooms (id, code, owner_id, school_id, title) values
    ('${R1}','AAAAAA','${T}','${SCHOOL}','Stunde 1');
  insert into skill_participants (room_id, token, seat, name) values
    ('${R1}','rt-anon-1', 1, 'Mia'),
    ('${R1}','rt-anon-2', 2, 'Ben');
`);
const SCHULE = (await one(`select id from vocab_sets where title = 'Schule'`)).id;
const ZUHAUS = (await one(`select id from vocab_sets where title <> 'Schule' order by title limit 1`)).id;
const FREMD  = (await one(
  `insert into vocab_sets (title, owner_id, school_id) values ('Fremde Unit', $1, $2)
   returning id`, [T, SCHOOL])).id;
await db.exec(`insert into wi_room_sets (room_id, set_id) values
                 ('${R1}','${SCHULE}'), ('${R1}','${ZUHAUS}')`);

async function insel(rt, richtung, modus, sets = [SCHULE]) {
  const tok = (await one(`select wi_solo_claim($1, null) v`, [rt])).v.token;
  const lid = (await one(`select id from wi_solo_learners where token = $1`, [tok])).id;
  await one(`select wi_solo_settings($1, $2::uuid[], $3, $4) v`, [tok, sets, richtung, modus]);
  return { tok, lid };
}
const view    = async tok => (await one(`select wi_solo_view($1) v`, [tok])).v;
const unit    = async (tok, s) => (await one(`select wi_solo_unit($1, $2) v`, [tok, s])).v;
const loesung = async lid => (await one(
  `select (vocab_answers(l.current_item, l.current_dir))[1] a
     from wi_solo_learners l where l.id = $1`, [lid])).a;
const frei = lid => db.exec(`update wi_solo_learners set lock_until = null where id = '${lid}'`);

/* ── 1. Vor 0142 gibt es beides nicht ───────────────────────── */
const mia = await insel('rt-anon-1', 'mixed', 'type');
const altV = await view(mia.tok);
ok('OHNE 0142 trägt words_list nur i und s',
   altV.words_list.length > 0 && altV.words_list[0].u === undefined,
   js(altV.words_list[0]));
const kenntUnit = (await one(
  `select count(*) c from pg_proc where proname = 'wi_solo_unit'`)).c;
ok('und wi_solo_unit gibt es noch gar nicht', n(kenntUnit) === 0, js(kenntUnit));

/* ── 0142 ───────────────────────────────────────────────────── */
await run(mig('0142_wordisland_solo_units.sql'), '0142');
console.log('\n— 0142 läuft durch —\n');

/* ── 2./3. Die Unit steht am Wort ───────────────────────────── */
const v = await view(mia.tok);
const proSet = {};
for (const w of v.words_list) proSet[w.u] = (proSet[w.u] || 0) + 1;
const zaehl = async s => n((await one(
  `select count(*) c from vocab_items where set_id = $1`, [s])).c);
ok('jedes Wort trägt jetzt seine Unit',
   v.words_list.every(w => typeof w.u === 'string' && w.u.length === 36),
   js(v.words_list[0]));
ok('und zwar die richtige — Wortzahl je Unit deckt sich mit vocab_items',
   proSet[SCHULE] === await zaehl(SCHULE) && proSet[ZUHAUS] === await zaehl(ZUHAUS),
   js(proSet));
// Mia hat nur „Schule" gewählt. Die Tiere von „Zuhause" stehen
// trotzdem auf ihrer Insel — sonst gäbe es nichts zu entsättigen.
ok('auch die abgewählte Unit ist dabei (das blasse Tier braucht sie)',
   proSet[ZUHAUS] > 0, js(Object.keys(proSet).length));

/* ── 4./5. Eine Unit vollständig ────────────────────────────── */
const u = await unit(mia.tok, SCHULE);
ok('wi_solo_unit antwortet mit Kopf, Summe und Wortliste',
   u.ok === true && u.set.title === 'Schule' && Array.isArray(u.words), js(u.set));
ok('die Wortliste ist so lang wie die Unit',
   u.words.length === await zaehl(SCHULE) && n(u.set.count) === u.words.length,
   js([u.words.length, u.set.count]));
const soll = (await db.query(
  `select term from vocab_items where set_id = $1 order by sort_order, term`, [SCHULE])).rows
  .map(r => r.term);
ok('und in derselben Reihenfolge wie im Heft (sort_order, term)',
   js(u.words.map(w => w.t)) === js(soll), js(u.words.slice(0, 3).map(w => w.t)));
ok('jedes Wort bringt Text, Übersetzung und Stufe mit',
   u.words.every(w => w.t && w.x && typeof w.s === 'number'), js(u.words[0]));
ok('ein ungeübtes Wort kommt mit leerem st — nicht mit erfundenen Nullen',
   u.words.every(w => js(w.st) === '{}') && js(u.total) === '{}', js(u.words[0].st));

/* ── 6./7. Nach echten Antworten ────────────────────────────── */
// Ben übt „Schule" gemischt und tippt zwanzigmal richtig. Danach
// müssen drei Dinge zusammenpassen: die Zahlen am Wort, die Summe
// der Unit, und die Stufe des Tieres.
const ben = await insel('rt-anon-2', 'mixed', 'type');
await one(`select wi_solo_start($1) v`, [ben.tok]);
for (let i = 0; i < 20; i++) {
  await frei(ben.lid);
  await one(`select wi_solo_answer($1, $2) v`, [ben.tok, await loesung(ben.lid)]);
}
// Einmal danebengreifen, damit die vierte Spalte auch etwas zeigt.
await frei(ben.lid);
await one(`select wi_solo_answer($1, $2) v`, [ben.tok, 'völlig daneben']);
await frei(ben.lid);
await one(`select wi_solo_answer($1, $2) v`, [ben.tok, 'völlig daneben']);

const ub = await unit(ben.tok, SCHULE);
const summe = { de_en: [0, 0, 0, 0], en_de: [0, 0, 0, 0] };
for (const w of ub.words) {
  for (const d of ['de_en', 'en_de']) {
    const z = w.st[d] || [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) summe[d][k] += n(z[k]);
  }
}
const echt = (await db.query(
  `select p.dir, sum(p.clean)::int c, sum(p.helped)::int h,
          sum(p.seen)::int s, sum(p.wrong)::int w
     from wi_solo_progress p join vocab_items i on i.id = p.item_id
    where p.learner_id = $1 and i.set_id = $2 group by p.dir order by p.dir`,
  [ben.lid, SCHULE])).rows;
ok('die Zahlen am Wort sind die Chronik und nicht das Punktekonto',
   ub.words.some(w => w.st.de_en || w.st.en_de), js(ub.words.find(w => w.st.de_en)?.st));
ok('total ist die Summe der Wortzeilen',
   echt.every(r => js(summe[r.dir]) === js([n(r.c), n(r.h), n(r.s), n(r.w)])),
   js([summe, echt]));
ok('und die Reihenfolge ist [richtig, mit Hilfe, gesamt, falsch] wie beim „i"',
   echt.every(r => n((ub.total[r.dir] || [])[2]) === n(r.s)), js(ub.total));
ok('mindestens ein Fehler ist angekommen',
   Object.values(ub.total).some(z => n(z[3]) > 0), js(ub.total));

const stufen = (await db.query(`select item_id, stage from wi_solo_stages($1)`, [ben.lid])).rows;
const nachId = new Map(stufen.map(r => [r.item_id, n(r.stage)]));
ok('`s` kommt aus wi_solo_stages — kein zweiter Rechenweg',
   ub.words.every(w => n(w.s) === nachId.get(w.i)),
   js(ub.words.slice(0, 3).map(w => [w.s, nachId.get(w.i)])));

/* ── 8. Die Riegel ──────────────────────────────────────────── */
const fremd = await unit(mia.tok, FREMD);
ok('eine fremde Unit ist not_found und nicht etwa leer',
   fremd.ok === false && fremd.error === 'not_found', js(fremd));
const ohne = await unit('gibt-es-nicht', SCHULE);
ok('ein unbekannter Token ebenso', ohne.ok === false && ohne.error === 'not_found', js(ohne));
const rechte = (await one(
  `select has_function_privilege('anon', 'wi_solo_unit(text, uuid)', 'execute') e`)).e;
ok('anon darf sie aufrufen (Kinder ohne Konto haben auch Inseln)', rechte === true, js(rechte));

/* ── 9. Zweimal läuft auch ──────────────────────────────────── */
const vorLauf2 = await unit(ben.tok, SCHULE);
await run(mig('0142_wordisland_solo_units.sql'), '0142 (2. Lauf)');
ok('die Migration läuft zweimal und ändert dabei nichts',
   js(await unit(ben.tok, SCHULE)) === js(vorLauf2), js(vorLauf2.set));

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
