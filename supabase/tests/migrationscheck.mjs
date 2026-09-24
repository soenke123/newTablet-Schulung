/* Prüft den Migrations-Check selbst: einmal mit 0158, einmal ohne.
   Die Zusage ist nicht „die Abfrage läuft", sondern „sie kippt genau
   dann, wenn die Migration fehlt". */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const CHECK = readFileSync(`${REPO}/supabase/migrationscheck.sql`, 'utf8');

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
  token text unique, seat int not null, name text, blocked boolean not null default false,
  last_seen_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
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

const KETTE = [
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
  '0153_wordisland_round_words.sql', '0154_vocab_set_words.sql',
  '0157_wordisland_sets_push.sql', '0158_wordisland_view_restore.sql',
  '0165_wordisland_ruins_balance.sql',
  '0166_wordisland_island_size.sql', '0167_wordisland_round_end_timer.sql',
  '0168_wordisland_trainer_island.sql',
  '0169_vocab_apostroph_und_leerer_topf.sql',
  /* Seit 24.09.2026 gehört der INHALT in die Kette. Vorher stand hier
     nur die Mechanik — und eine Zeile wie „der alte Bestand ist von
     Bord" wäre dann immer grün gewesen, weil er nie da war. */
  '0159_vocab_lehrwerk.sql', '0160_vocab_greenline_5.sql',
  '0161_vocab_test_units_out.sql', '0162_vocab_greenline_5_hello.sql',
  '0163_vocab_greenline_6.sql',
  '0170_vocab_lehrwerkwechsel.sql', '0171_vocab_greenline_g9_5.sql',
  '0172_vocab_greenline_g9_6.sql', '0173_vocab_greenline_g9_7.sql'
];

/* `ohne` ist eine Liste von Nummern-Anfängen. Sie muss eine Liste
   sein und keine einzelne: 0171–0173 brauchen die Längengrenze aus
   0170 und brächen sonst mit einer Fehlermeldung ab, statt eine
   Zeile FEHLT zu melden. Wer 0170 auslässt, lässt sie alle aus —
   genau so sähe es auch im Dashboard aus. */
async function lauf(ohne) {
  const liste = ohne ? (Array.isArray(ohne) ? ohne : [ohne]) : [];
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of KETTE) {
    if (liste.some(n => f.startsWith(n))) continue;
    try { await db.exec(mig(f)); }
    catch (e) { console.error(`FEHLER in ${f}: ${e.message}`); process.exit(1); }
  }
  const rows = (await db.query(CHECK)).rows;
  await db.close();
  return rows;
}

console.log('═══ 1) volle Kette (alles eingespielt) ═══');
const voll = await lauf(null);
for (const r of voll) console.log(`${r.nr.padEnd(7)} ${r.status.padEnd(14)} ${r.was}`);
const fehlen = voll.filter(r => r.status !== 'DRIN');
console.log(fehlen.length === 0
  ? '\nok    alle Zeilen DRIN — keine Falschmeldung\n'
  : `\nFAIL  ${fehlen.length} Zeile(n) melden FEHLT, obwohl alles drin ist: ` +
    fehlen.map(r => r.nr).join(', ') + '\n');

console.log('═══ 2) Gegenprobe: 0158 weggelassen ═══');
const ohne = await lauf('0158');
/* 0152 kippt MIT: ohne 0158 steht in der DB die 0157-Fassung von
   wi_view, und die ist vom Stand 0131 aus geschrieben — der
   blocked-Riegel aus 0152 ist dort ebenfalls weg. Genau das ist der
   Schaden, den 0158 behoben hat; die Abfrage soll ihn zeigen. */
const erwartet = ['0152', '0158a', '0158b', '0158c', '0158d'];
const gekippt = ohne.filter(r => r.status !== 'DRIN').map(r => r.nr);
console.log('meldet FEHLT:', gekippt.join(', ') || '(nichts)');
const genau = erwartet.every(n => gekippt.includes(n)) && gekippt.length === erwartet.length;
console.log(genau
  ? 'ok    genau die 0158-Zeilen kippen (0152 gehoert dazu, siehe oben)\n'
  : `FAIL  erwartet ${erwartet.join(', ')}\n`);

/* 0169 hat zwei Zeilen, und sie suchen an zwei verschiedenen Orten
   (eine Funktion, die es vorher nicht gab — und ein Textstueck im
   Rumpf einer, die es schon gab). Die zweite ist die anfaellige:
   `create or replace` mit gleicher Signatur sieht von aussen aus
   wie vorher. */
console.log('═══ 3) Gegenprobe: 0169 weggelassen ═══');
const ohne69 = await lauf('0169');
const erw69 = ['0169a', '0169b'];
const kipp69 = ohne69.filter(r => r.status !== 'DRIN').map(r => r.nr);
console.log('meldet FEHLT:', kipp69.join(', ') || '(nichts)');
const genau69 = erw69.every(n => kipp69.includes(n)) && kipp69.length === erw69.length;
console.log(genau69
  ? 'ok    genau die beiden 0169-Zeilen kippen\n'
  : `FAIL  erwartet ${erw69.join(', ')}\n`);

/* Der Lehrwerkswechsel hängt an einem Stück: ohne 0170 passen die
   langen Einträge nicht in die Spalte, also kommen auch 0171–0173
   nicht herein. Fünf Zeilen, eine Ursache — und genau so soll es im
   Dashboard aussehen, damit niemand an drei Stellen sucht. */
console.log('═══ 4) Gegenprobe: der Lehrwerkswechsel fehlt ═══');
const ohne70 = await lauf(['0170', '0171', '0172', '0173']);
const erw70 = ['0170a', '0170b', '0171', '0172', '0173'];
const kipp70 = ohne70.filter(r => r.status !== 'DRIN').map(r => r.nr);
console.log('meldet FEHLT:', kipp70.join(', ') || '(nichts)');
const genau70 = erw70.every(n => kipp70.includes(n)) && kipp70.length === erw70.length;
console.log(genau70
  ? 'ok    genau die fuenf Zeilen des Wechsels kippen\n'
  : `FAIL  erwartet ${erw70.join(', ')}\n`);

process.exit((fehlen.length === 0 && genau && genau69 && genau70) ? 0 : 1);
