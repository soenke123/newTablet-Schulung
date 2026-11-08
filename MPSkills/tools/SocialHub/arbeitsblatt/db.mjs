import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const R = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');
const SH = R + '/MPSkills/tools/SocialHub';
const lib = R + '/MPSkills/tools/SQLStudio/lib';
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename', readFileSync(join(lib, 'sql-wasm.js'), 'utf8'))(mod, mod.exports, createRequire(import.meta.url), lib, join(lib, 'sql-wasm.js'));
const SQL = await mod.exports({ locateFile: f => join(lib, f) });
new Function(readFileSync(R + '/MPSkills/tools/SQLStudio/js/core.js', 'utf8'))();
export const C = globalThis.SQLCore;
new Function(readFileSync(SH + '/dummy/daten.js', 'utf8'))();
new Function(readFileSync(SH + '/dummy/generator.js', 'utf8'))();
const G = globalThis.SHDummy;
const bmod = { exports: {} };
new Function('module', 'exports', 'self', 'window', 'define', readFileSync(R + '/vendor/bcryptjs-2.4.3.min.js', 'utf8'))(bmod, bmod.exports, undefined, undefined, undefined);
const bcrypt = bmod.exports.hashSync ? bmod.exports : (globalThis.dcodeIO && globalThis.dcodeIO.bcrypt);
bcrypt.setRandomFallback(n => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n))));
const dbjs = readFileSync(SH + '/js/db.js', 'utf8');
const ddlSrc = dbjs.slice(dbjs.indexOf('const DDL = {') + 12, dbjs.indexOf('// Eltern vor Kindern'));
export const DDL = new Function('return ' + ddlSrc.trim().replace(/;\s*$/, ''))();
export const ORDER = ['users', 'tags', 'photos', 'sessions', 'comments', 'follows', 'likes', 'photo_tag', 'views', 'ads'];
const lit = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
export function load(day = '2026-11-07', { hash = true, tables = ORDER } = {}) {
  const data = G.build({ stichtag: day, netz: 'Liky' });
  const db = C.open(SQL, null);
  const f = (name, fn) => db.create_function(name, fn);
  f('PASSWORD_HASH', v => v === null ? null : bcrypt.hashSync(String(v), 4));
  f('PASSWORD_VERIFY', (pw, h) => { try { return pw !== null && h !== null && bcrypt.compareSync(String(pw), String(h)) ? 1 : 0; } catch (e) { return 0; } });
  let script = '';
  for (const t of ORDER) if (tables.includes(t)) script += DDL[t] + '\n';
  for (const t of ORDER) {
    if (!tables.includes(t)) continue;
    const { cols, rows } = data[t];
    const pi = cols.indexOf('password');
    for (let i = 0; i < rows.length; i += 200) script += 'INSERT INTO ' + t + ' (' + cols.join(', ') + ') VALUES\n' + rows.slice(i, i + 200).map(r => '(' + r.map((v, j) => (j === pi && hash && v) ? lit(bcrypt.hashSync(String(v), 4)) : lit(v)).join(', ') + ')').join(',\n') + ';\n';
  }
  const r = C.run(db, script, { rights: 'create', maxRows: 1 });
  const err = r.results.find(x => x.kind === 'error');
  if (err) throw new Error(err.message);
  // NOW() auf den Stichtag festnageln (wie am Stichtag abends)
  f('NOW', () => day + ' 18:00:00');
  return db;
}
export function run(db, sql, rights = 'use') {
  const r = C.run(db, sql, { rights, maxRows: 5000 });
  return r.results;
}
export function q(db, sql) {
  const res = run(db, sql);
  const err = res.find(x => x.kind === 'error');
  if (err) return { error: err.message };
  const last = res[res.length - 1];
  return { cols: last.columns || [], rows: last.rows || [], changes: last.changes, kind: last.kind };
}
