/** Page range helpers for the export dialog: 1-based user input, 0-based indices in code. */

const pagesText = n => (n === 1 ? '1 Seite' : `${n} Seiten`);

/**
 * Parses input like "1-3, 4, 10-12" into 0-based page indices in the typed order.
 * Also accepts open ranges ("-3", "10-") and descending ranges ("5-3"). Empty input means all pages.
 * Returns `{ indices }` or `{ error }` with a German message.
 */
export function parsePageRanges(text, total) {
  const parts = String(text ?? '').split(/[,;]/).map(part => part.trim()).filter(Boolean);
  if (!parts.length) return { indices: Array.from({ length: total }, (_, i) => i) };
  const indices = [];
  for (const part of parts) {
    const single = /^\d+$/.test(part);
    const range = /^(\d*)\s*[-–—]\s*(\d*)$/.exec(part);
    if (!single && (!range || (!range[1] && !range[2]))) return { error: `„${part}“ ist keine gültige Seitenangabe. Beispiel: 1-3, 4, 10-12` };
    const from = single ? Number(part) : range[1] ? Number(range[1]) : 1;
    const to = single ? from : range[2] ? Number(range[2]) : total;
    for (const n of [from, to]) if (n < 1 || n > total) return { error: `Seite ${n} gibt es nicht – das Dokument hat ${pagesText(total)}.` };
    const step = from <= to ? 1 : -1;
    for (let n = from; n !== to + step; n += step) indices.push(n - 1);
  }
  return { indices };
}

/** Formats 0-based indices as compact 1-based ranges, e.g. [0,1,2,6] → "1-3, 7". */
export function formatPageRanges(indices) {
  const parts = [];
  let start = null, prev = null;
  const flush = () => { if (start !== null) parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`); };
  for (const i of indices) {
    if (start !== null && i === prev + 1) { prev = i; continue; }
    flush();
    start = prev = i;
  }
  flush();
  return parts.join(', ');
}
