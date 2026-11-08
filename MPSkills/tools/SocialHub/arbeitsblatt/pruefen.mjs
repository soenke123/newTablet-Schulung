import { load, run } from './db.mjs';
import { DOC } from './inhalt.mjs';
const only = process.argv[2];
const fmt = r => r.kind === 'error' ? 'FEHLER ' + r.message : r.rows ? (r.rows.length + ' Zeilen: ' + r.rows.slice(0, 4).map(x => x.map(v => String(v).slice(0, 28)).join('|')).join(' ; ')) : ('ok ' + (r.changes ?? ''));
export function exec(sqls, pre) {
  const db = load('2026-11-07');
  if (pre) run(db, pre);
  return [].concat(sqls).map(s => { const res = run(db, s); const e = res.find(x => x.kind === 'error'); return e || res[res.length - 1]; });
}
let bad = 0;
for (const b of DOC) {
  if ((b.t === 'syntax' || b.t === 'code') && b.result && !only) {
    const [r] = exec(b.sql); console.log('BEISPIEL ' + b.title + ' → ' + fmt(r)); if (r.kind === 'error') bad++;
  }
  if (b.t !== 'task' || (only && String(b.n) !== only)) continue;
  b.items.forEach((it, i) => {
    if (!it.sol) return;
    const rs = exec(it.sol, it.pre);
    rs.forEach((r, j) => { const err = r.kind === 'error'; if (err && !it.error) bad++; console.log(`A${b.n}${String.fromCharCode(97 + i)}${rs.length > 1 ? '.' + (j + 1) : ''} → ${fmt(r)}`); });
  });
}
console.log(bad ? bad + ' FEHLER' : 'alles ok');
