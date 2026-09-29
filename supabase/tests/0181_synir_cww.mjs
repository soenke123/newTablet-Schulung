/* Prüfstand für Migration 0181 — SYNIR: das Class Wide Web.
   Echt gerechnet in pglite: jedes Tablet bekommt ein eigenes /8
   (die Lehrkraft immer 100), Pakete gehen nur an das /8, dem die
   Zieladresse gehört, ein fremder Absender kommt nicht durch, und
   ein Name gehört dem, der ihn zuerst anmeldet.
*/
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const db = new PGlite();

const STUBS = `
set search_path = public, extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create table if not exists schools (id uuid primary key default gen_random_uuid(), slug text);
create table if not exists profiles (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id));
create table if not exists skill_tools (
  id text primary key, title text not null, blurb text, icon text, folder text not null,
  subject text not null default 'Fächerübergreifend',
  multi_room boolean not null default true,
  max_participants int not null default 150, max_rooms int not null default 5,
  limits jsonb not null default '{}'::jsonb, active boolean not null default true,
  sort_order int not null default 100);
create table if not exists skill_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique, tool_id text not null, owner_id uuid not null references profiles(id),
  school_id uuid, title text,
  expires_at timestamptz not null default now() + interval '60 days');
create table if not exists skill_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references skill_rooms(id) on delete cascade,
  token text not null unique, seat int not null, name text,
  blocked boolean not null default false);
create table if not exists skill_room_state (
  room_id uuid primary key references skill_rooms(id) on delete cascade,
  phase int not null default 1, data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create role service_role; create role authenticated; create role anon;
`;

let passed = 0, failed = 0;
function ok(desc, cond, extra = '') {
  if (cond) { passed++; console.log('ok    ' + desc + (extra ? '   ' + extra : '')); }
  else      { failed++; console.error('FAIL  ' + desc + (extra ? '   ' + extra : '')); }
}

async function asUser(uid, fn) {
  await db.query('delete from _who');
  if (uid) await db.query('insert into _who values ($1)', [uid]);
  try { return await fn(); }
  finally { await db.query('delete from _who'); }
}

const q1 = async (sql, args) => (await db.query(sql, args)).rows[0].r;

async function run() {
  await db.exec(STUBS);
  const mig0 = readFileSync(`${REPO}/supabase/migrations/0180_synir.sql`, 'utf8');
  await db.exec(mig0);
  const mig = readFileSync(`${REPO}/supabase/migrations/0181_synir_cww.sql`, 'utf8');
  await db.exec(mig);
  await db.exec(mig);
  ok('Migration läuft zweimal durch', true);
  // 0182 ersetzt nur synir_cww_tausch_intern und fügt `bereiche` an.
  const mig2 = readFileSync(`${REPO}/supabase/migrations/0182_synir_cww_bereiche.sql`, 'utf8');
  await db.exec(mig2);
  await db.exec(mig2);
  ok('Migration 0182 läuft zweimal durch', true);

  const L = (await db.query(`insert into profiles default values returning id`)).rows[0].id;
  const room = (await db.query(
    `insert into skill_rooms (code, tool_id, owner_id, title) values ('CWWCWW','synir',$1,'7b') returning id`, [L])).rows[0].id;
  const room2 = (await db.query(
    `insert into skill_rooms (code, tool_id, owner_id, title) values ('ANDERS','synir',$1,'8c') returning id`, [L])).rows[0].id;
  for (const [t, s, n, r] of [['tA', 1, 'Anna', room], ['tB', 2, 'Ben', room], ['tC', 3, 'Cem', room], ['tX', 1, 'Xaver', room2]])
    await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1,$2,$3,$4)`, [r, t, s, n]);

  // ── Anmelden ──────────────────────────────────────────────
  const a = await q1(`select synir_cww_anmelden('tA') as r`);
  const b = await q1(`select synir_cww_anmelden('tB') as r`);
  const x = await q1(`select synir_cww_anmelden('tX') as r`);
  ok('Tablet bekommt ein /8 aus 50…150, nie 100', a.ok && a.prefix >= 50 && a.prefix <= 150 && a.prefix !== 100, JSON.stringify(a));
  ok('und eine 8er-Adresse', /^8\.\d+\.\d+\.\d+$/.test(a.backbone) && a.backbone !== '8.8.8.8', a.backbone);
  ok('zwei Tablets, zwei Bereiche', b.ok && b.prefix !== a.prefix);
  const a2 = await q1(`select synir_cww_anmelden('tA') as r`);
  ok('nochmal anmelden: derselbe Bereich', a2.prefix === a.prefix && a2.backbone === a.backbone);
  ok('unbekannter Token', (await q1(`select synir_cww_anmelden('nix') as r`)).error === 'unknown_token');

  let r = await asUser(null, () => q1(`select synir_cww_anmelden_lehrer('CWWCWW') as r`));
  ok('Lehrkraft ohne Anmeldung: not_authenticated', r.error === 'not_authenticated');
  const l = await asUser(L, () => q1(`select synir_cww_anmelden_lehrer('CWWCWW') as r`));
  ok('Lehrkraft hat immer 100', l.ok && l.prefix === 100, JSON.stringify(l));
  const fremd = (await db.query(`insert into profiles default values returning id`)).rows[0].id;
  r = await asUser(fremd, () => q1(`select synir_cww_anmelden_lehrer('CWWCWW') as r`));
  ok('fremde Lehrkraft: nichts', r.error === 'not_found');

  // ── Pakete ────────────────────────────────────────────────
  const ping = (src, dst) => ({ src, dst, ttl: 60, proto: 'icmp', id: 1, payload: { type: 8, code: 0, id: 1, seq: 1 } });
  const A_IP = a.prefix + '.0.0.10', B_IP = b.prefix + '.0.0.20';
  r = await q1(`select synir_cww_tausch('tA', $1, null) as r`, [[ping(A_IP, B_IP)]]);
  ok('A schickt an B', r.ok && r.unzustellbar.length === 0, JSON.stringify(r));
  r = await q1(`select synir_cww_tausch('tB', null, null) as r`);
  ok('B holt es ab', r.ok && r.pakete.length === 1 && r.pakete[0].dst === B_IP, JSON.stringify(r.pakete));
  r = await q1(`select synir_cww_tausch('tB', null, null) as r`);
  ok('abholen heißt löschen', r.ok && r.pakete.length === 0);

  r = await q1(`select synir_cww_tausch('tA', $1, null) as r`, [[ping(B_IP, B_IP)]]);
  await q1(`select synir_cww_tausch('tB', null, null) as r`);
  r = await q1(`select synir_cww_tausch('tB', null, null) as r`);
  ok('fremder Absender kommt nicht durch (BCP 38)', r.pakete.length === 0);

  r = await q1(`select synir_cww_tausch('tA', $1, null) as r`, [[ping(A_IP, '99.1.2.3')]]);
  ok('ein /8, das niemandem gehört: unzustellbar', r.unzustellbar.length === 1, JSON.stringify(r.unzustellbar));

  r = await q1(`select synir_cww_tausch('tA', $1, null) as r`, [[ping(A_IP, b.backbone)]]);
  r = await q1(`select synir_cww_tausch('tB', null, null) as r`);
  ok('an die 8er-Adresse von B', r.pakete.length === 1 && r.pakete[0].dst === b.backbone);

  await q1(`select synir_cww_tausch('tX', null, null) as r`);
  r = await q1(`select synir_cww_tausch('tA', $1, null) as r`, [[ping(A_IP, x.backbone)]]);
  ok('ein cww in einem anderen Raum ist nicht erreichbar', r.unzustellbar.length === 1, JSON.stringify(r.unzustellbar));

  // Lehrkraft erreicht Tablet und umgekehrt
  r = await asUser(L, () => q1(`select synir_cww_tausch_lehrer('CWWCWW', $1, null) as r`, [[ping('100.0.0.5', A_IP)]]));
  ok('Lehrkraft sendet', r.ok, JSON.stringify(r));
  r = await q1(`select synir_cww_tausch('tA', null, null) as r`);
  ok('Tablet bekommt es', r.pakete.length === 1 && r.pakete[0].src === '100.0.0.5');

  // Nicht mehr da: C hat sich angemeldet, fragt aber seit 30 s nicht
  const c = await q1(`select synir_cww_anmelden('tC') as r`);
  await db.query(`update synir_cww_netz set seen_at = now() - interval '30 seconds' where prefix = $1 and room_id = $2`, [c.prefix, room]);
  r = await q1(`select synir_cww_tausch('tA', $1, null) as r`, [[ping(A_IP, c.prefix + '.0.0.1')]]);
  ok('ein Tablet, das nicht mehr fragt: unzustellbar', r.unzustellbar.length === 1);

  // ── Die Bereiche der anderen (0182) ───────────────────────
  r = await q1(`select synir_cww_tausch('tA', null, null) as r`);
  ok('A sieht die Bereiche von B und der Lehrkraft', Array.isArray(r.bereiche)
     && r.bereiche.includes(b.prefix) && r.bereiche.includes(100), JSON.stringify(r.bereiche));
  ok('nicht den eigenen', !r.bereiche.includes(a.prefix));
  ok('nicht den von C, der nicht mehr fragt', !r.bereiche.includes(c.prefix));
  ok('nicht den aus einem anderen Raum', !r.bereiche.includes(x.prefix));
  ok('nur Zahlen, sortiert', r.bereiche.every(n => typeof n === 'number')
     && r.bereiche.join() === [...r.bereiche].sort((m, n) => m - n).join());

  r = await q1(`select synir_cww_tausch('tA', $1, null) as r`, [Array.from({ length: 201 }, () => ping(A_IP, B_IP))]);
  ok('mehr als 200 Pakete: abgelehnt', r.error === 'payload_too_big');

  // ── Namen ─────────────────────────────────────────────────
  r = await q1(`select synir_cww_tausch('tB', null, $1) as r`,
    [[{ typ: 'A', name: 'www.ben.de', wert: B_IP }, { typ: 'A', name: 'klau.de', wert: A_IP }]]);
  ok('B meldet seinen Namen an', r.verzeichnis.some(e => e.name === 'www.ben.de' && e.wert === B_IP));
  ok('ein Name auf eine fremde Adresse wird nicht angenommen', !r.verzeichnis.some(e => e.name === 'klau.de'));
  ok('das Verzeichnis nennt keinen Besitzer', r.verzeichnis.every(e => !('prefix' in e)));
  r = await q1(`select synir_cww_tausch('tA', null, $1) as r`, [[{ typ: 'A', name: 'www.ben.de', wert: A_IP }]]);
  ok('wer später kommt: vergeben', r.vergeben.length === 1 && r.vergeben[0].name === 'www.ben.de');
  ok('und der Name zeigt weiter auf B', r.verzeichnis.find(e => e.name === 'www.ben.de').wert === B_IP);
  r = await q1(`select synir_cww_tausch('tB', null, '[]'::jsonb) as r`);
  ok('B gibt den Namen frei', !r.verzeichnis.some(e => e.name === 'www.ben.de'));
  r = await q1(`select synir_cww_tausch('tA', null, $1) as r`, [[{ typ: 'A', name: 'www.ben.de', wert: A_IP }]]);
  ok('jetzt bekommt ihn A', r.vergeben.length === 0 && r.verzeichnis.find(e => e.name === 'www.ben.de').wert === A_IP);
  r = await q1(`select synir_cww_tausch('tX', null, null) as r`);
  ok('ein anderer Raum sieht den Namen nicht', !r.verzeichnis.some(e => e.name === 'www.ben.de'));

  // ── Blind und stillgelegt ─────────────────────────────────
  await db.query(`insert into skill_room_state (room_id, data) values ($1, $2)`, [room, { blind: true }]);
  r = await q1(`select synir_cww_tausch('tA', null, null) as r`);
  ok('blind: kein Tausch', r.error === 'blind');
  r = await asUser(L, () => q1(`select synir_cww_tausch_lehrer('CWWCWW', null, null) as r`));
  ok('die Lehrkraft tauscht weiter', r.ok);
  await db.query(`update skill_room_state set data = '{}'::jsonb where room_id = $1`, [room]);
  await db.query(`update skill_participants set blocked = true where token = 'tA'`);
  r = await q1(`select synir_cww_tausch('tA', null, null) as r`);
  ok('stillgelegt: kein Tausch', r.error === 'blocked');

  // ── Karte ─────────────────────────────────────────────────
  r = await asUser(L, () => q1(`select synir_cww_karte('CWWCWW') as r`));
  ok('die Lehrkraft sieht, wem was gehört',
     r.ok && r.items.length === 4 && r.items.some(i => i.name === 'Anna' && i.prefix === a.prefix)
     && r.items.some(i => i.name === 'Lehrkraft' && i.prefix === 100), JSON.stringify(r.items));
  r = await asUser(fremd, () => q1(`select synir_cww_karte('CWWCWW') as r`));
  ok('eine fremde Lehrkraft nicht', r.error === 'not_found');

  // ── Voll ──────────────────────────────────────────────────
  for (let i = 0; i < 100; i++)
    await db.query(`insert into skill_participants (room_id, token, seat) values ($1,$2,$3)`, [room2, 'v' + i, i + 10]);
  let voll = null, vergeben = 1;
  for (let i = 0; i < 100; i++) {
    const v = await q1(`select synir_cww_anmelden($1) as r`, ['v' + i]);
    if (v.ok) vergeben++; else { voll = v; break; }
  }
  ok('nach 100 Bereichen ist Schluss', vergeben === 100 && voll && voll.error === 'cww_voll', vergeben + ' ' + JSON.stringify(voll));

  console.log(`\n${passed} ok, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
