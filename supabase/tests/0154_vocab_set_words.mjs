/* Prüfstand für Migration 0154 — die Wörter einer Station ansehen.
   Echt gerechnet in pglite, Stubs wie in 0136…0153.

   Die Kernzusagen:
     1. Die Liste kommt vollständig und in BUCHREIHENFOLGE (sort_order),
        nicht alphabetisch und nicht in Einfügereihenfolge.
     2. Nebenformen fahren mit (`a`/`at`) — „pupil / student" ist EIN
        Eintrag mit zwei gültigen Fassungen.
     3. Der Kopf nennt Unit und Jahrgang, damit die Übersicht sagt, wo
        die Station hängt.
     4. Sichtbar ist nur, was auch vocab_sets_list zeigt: mitgeliefert
        oder die EIGENE Liste. Die fremde Liste einer anderen Lehrkraft
        sieht aus wie nicht vorhanden.
     5. Kein Lehrer-Konto → not_authenticated, keine Lehrkraft →
        not_a_teacher.
     6. wi_set_words bindet den Aufruf an den EIGENEN Raum: ein
        falscher Code kommt nicht an die Wörter.
     7. Die Migration läuft zweimal (Idempotenz).

   Aufruf:  node supabase/tests/0154_vocab_set_words.mjs */
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
  blocked boolean not null default false,
  blocked_at timestamptz,
  last_seen_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create table if not exists _teach (yes boolean);
insert into _teach (yes) values (true);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select coalesce((select yes from _teach limit 1), false) $$;
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

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    if (e.position) console.error(`  Stelle: …${sql.slice(Math.max(0, e.position - 240), Number(e.position) + 60)}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

const BIS_0153 = [
  '0130_vocab_content.sql', '0131_wordisland_game.sql', '0133_wordisland_lobby.sql',
  '0134_wordisland_back_to_lobby.sql', '0135_wordisland_eight_factions.sql',
  '0136_wordisland_solo.sql', '0137_wordisland_solo_pgcrypto.sql',
  '0138_wordisland_solo_stats.sql', '0139_wordisland_solo_points.sql',
  '0140_wordisland_solo_bag_choice.sql', '0141_wordisland_solo_pass_percent.sql',
  '0142_wordisland_solo_units.sql', '0143_wordisland_solo_avatar.sql',
  '0145_wordisland_solo_level.sql', '0146_wordisland_ruins.sql',
  '0147_wordisland_solo_day_berlin.sql', '0148_wordisland_streak_every_three.sql',
  '0149_wordisland_streak_twelve.sql', '0150_vocab_units.sql',
  '0151_wordisland_choice_streak_lock.sql', '0152_wordisland_blocked_out.sql',
  '0153_wordisland_round_words.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0153) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0153 laufen durch —\n');

await run(mig('0154_vocab_set_words.sql'), '0154');
await run(mig('0154_vocab_set_words.sql'), '0154 (zweiter Lauf)');
console.log('— 0154 läuft zweimal durch —\n');

const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const T2     = 'e0000000-0000-4000-8000-000000000002';
const ROOM   = 'b0000000-0000-4000-8000-000000000001';
const CODE   = 'ABCDEF';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}'), ('${T2}','${SCHOOL}');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','${SCHOOL}','Testraum');
`);

const wer = uid => db.exec(`update _who set uid = ${uid ? `'${uid}'` : 'null'}`);
const lehrkraft = yes => db.exec(`update _teach set yes = ${yes}`);

const schule = (await one(`select id from vocab_sets where title like '%Schule%'`)).id;
const woerter = async (set) => (await one(`select vocab_set_words($1) v`, [set])).v;

/* ══ 1) Vollständig und in Buchreihenfolge ═════════════════════ */
const a = await woerter(schule);
ok('die Liste kommt', a.ok === true, JSON.stringify(a).slice(0, 120));

const anzahl = Number((await one(
  `select count(*) k from vocab_items where set_id = $1`, [schule])).k);
ok('sie ist vollständig', (a.words || []).length === anzahl,
   `${(a.words || []).length} von ${anzahl}`);

const soll = (await db.query(
  `select term from vocab_items where set_id = $1 order by sort_order, term`,
  [schule])).rows.map(r => r.term);
ok('… und steht in Buchreihenfolge (sort_order), nicht alphabetisch',
   a.words.map(w => w.t).join('|') === soll.join('|'),
   a.words.slice(0, 3).map(w => w.t).join(' · '));
/* ⚠️ Die Übersicht ist zum LESEN da. Fehlte eine Seite, merkte es
   niemand — deshalb die Gegenprobe, dass beide Sprachen dastehen. */
ok('jede Zeile trägt beide Sprachen',
   a.words.every(w => typeof w.t === 'string' && w.t.length > 0 &&
                      typeof w.x === 'string' && w.x.length > 0));

/* ══ 2) Nebenformen ════════════════════════════════════════════ */
await db.exec(`
  insert into vocab_items (set_id, term, translation, alt, alt_term, sort_order)
  values ('${schule}', 'der Schüler (Test)', 'pupil', '{student}', '{"die Schülerin (Test)"}', 999)`);
const b = await woerter(schule);
const schueler = b.words.find(w => w.t === 'der Schüler (Test)');
ok('Nebenformen der Übersetzung fahren mit',
   !!schueler && Array.isArray(schueler.a) && schueler.a.includes('student'),
   JSON.stringify(schueler && schueler.a));
ok('… und die des Wortes auch',
   !!schueler && schueler.at.includes('die Schülerin (Test)'),
   JSON.stringify(schueler && schueler.at));

/* ══ 3) Der Kopf sagt, wo die Station hängt ════════════════════ */
/* Seit 0150 heißen die mitgelieferten Sätze „Station n — …". */
ok('der Kopf nennt die Station', /Schule/.test(String(b.set.title)), String(b.set.title));
ok('… ihre Unit (seit 0150)', typeof b.set.utitle === 'string' && b.set.utitle.length > 0,
   String(b.set.utitle));
ok('… den Jahrgang', Number(b.set.grade) > 0, String(b.set.grade));
ok('… und beide Sprachen', b.set.from === 'de' && b.set.to === 'en',
   `${b.set.from} → ${b.set.to}`);
ok('mitgeliefert ist als solche erkennbar', b.set.mine === '0', String(b.set.mine));

/* ══ 4) Fremde Listen sind nicht auffindbar ════════════════════
   Dieselbe Bauart wie vocab_set_delete: fremd und nicht vorhanden
   sehen gleich aus. */
const fremd = (await one(`
  insert into vocab_sets (title, owner_id, school_id) values ('Fremd', '${T2}', '${SCHOOL}')
  returning id`)).id;
await db.exec(`insert into vocab_items (set_id, term, translation, sort_order)
               values ('${fremd}', 'geheim', 'secret', 1)`);
const c = await woerter(fremd);
ok('die Liste einer anderen Lehrkraft ist nicht auffindbar',
   c.ok === false && c.error === 'not_found', JSON.stringify(c));

/* Die eigene sehr wohl. */
const eigen = (await one(`
  insert into vocab_sets (title, owner_id, school_id) values ('Meine', '${T}', '${SCHOOL}')
  returning id`)).id;
await db.exec(`insert into vocab_items (set_id, term, translation, sort_order)
               values ('${eigen}', 'das Haus', 'house', 1)`);
const d = await woerter(eigen);
ok('die eigene Liste schon', d.ok === true && d.words.length === 1 &&
   d.words[0].x === 'house', JSON.stringify(d).slice(0, 120));
ok('… und ist als eigene erkennbar', d.set.mine === '1', String(d.set.mine));
/* Eine eigene Liste ohne Unit-Dach: der Kopf sagt dann ehrlich null,
   statt einen Jahrgang zu erfinden. */
ok('eine Liste ohne Unit trägt keinen Jahrgang', d.set.grade === null,
   JSON.stringify(d.set.grade));

/* Eine leere Station ist kein Fehler — sie ist leer. */
const leer = (await one(`
  insert into vocab_sets (title, owner_id, school_id) values ('Leer', '${T}', '${SCHOOL}')
  returning id`)).id;
const e = await woerter(leer);
ok('eine leere Station kommt als leere Liste, nicht als Fehler',
   e.ok === true && Array.isArray(e.words) && e.words.length === 0,
   JSON.stringify(e).slice(0, 120));

/* ══ 5) Wer darf hinsehen ══════════════════════════════════════ */
await lehrkraft(false);
const f = await woerter(schule);
ok('ohne Lehrkraft-Rolle: not_a_teacher', f.error === 'not_a_teacher', JSON.stringify(f));
await lehrkraft(true);

await wer(null);
const g = await woerter(schule);
ok('ohne Anmeldung: not_authenticated', g.error === 'not_authenticated', JSON.stringify(g));
await wer(T);

/* ══ 6) Der Durchreicher bindet an den eigenen Raum ════════════ */
const ausRaum = async (code, set) =>
  (await one(`select wi_set_words($1, $2) v`, [code, set])).v;

const h = await ausRaum(CODE, schule);
ok('wi_set_words liefert dieselbe Liste wie vocab_set_words',
   h.ok === true && h.words.length === b.words.length,
   `${(h.words || []).length} ↔ ${b.words.length}`);

const i = await ausRaum('ZZZZZZ', schule);
ok('… aber nur für den EIGENEN Raum', i.ok === false && i.error === 'not_found',
   JSON.stringify(i));

/* Ein Raum, der jemand anderem gehört, ist derselbe Fall. */
await db.exec(`
  insert into skill_rooms (code, owner_id, school_id, title)
    values ('FREMDR', '${T2}', '${SCHOOL}', 'Fremder Raum')`);
const j = await ausRaum('FREMDR', schule);
ok('… und der Raum einer anderen Lehrkraft zählt nicht dazu',
   j.ok === false && j.error === 'not_found', JSON.stringify(j));

/* ══ 7) Die Türen stehen richtig ═══════════════════════════════ */
const rechte = (await db.query(`
  select p.proname, has_function_privilege('authenticated', p.oid, 'execute') auth_darf,
         has_function_privilege('anon', p.oid, 'execute') anon_darf
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('vocab_set_words','wi_set_words')
   order by p.proname`)).rows;
ok('beide Funktionen sind angelegt', rechte.length === 2,
   rechte.map(r => r.proname).join(', '));
ok('angemeldete Lehrkräfte dürfen', rechte.every(r => r.auth_darf === true));
ok('anon nicht', rechte.every(r => r.anon_darf === false));

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
