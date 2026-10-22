// Vorlesen: Text in sprechbare Stücke teilen und das Wort finden, das gerade gelesen wird (reine Funktionen, ohne DOM).

const SPACE = /\s/;
const SENTENCE_END = /[.!?…:;]["')\]»“”]*(\s|$)|\n/g;

// [from, to) des Seitentexts in Stücke von höchstens max Zeichen, bevorzugt an Satzenden, sonst an Leerzeichen. Offsets bleiben die des Seitentexts.
export function speechChunks(text, from = 0, to = text.length, max = 220) {
  const out = [];
  const end = Math.min(to, text.length);
  let pos = Math.max(0, from);
  while (pos < end) {
    while (pos < end && SPACE.test(text[pos])) pos++;
    if (pos >= end) break;
    let stop = Math.min(end, pos + max);
    if (stop < end) {
      const win = text.slice(pos, stop);
      let cut = -1;
      SENTENCE_END.lastIndex = 0;
      for (let m; (m = SENTENCE_END.exec(win));) cut = m.index + m[0].length;
      if (cut < max * 0.35) {
        const space = win.lastIndexOf(' ');
        if (space > max * 0.35) cut = space + 1;
        else if (cut < 1) cut = win.length;
      }
      stop = pos + cut;
    }
    out.push({ start: pos, end: stop });
    pos = stop;
  }
  return out;
}

// Wort ab/um index (liegt index mitten im Wort, beginnt es vorn), ohne Satzzeichen am Rand; null, wenn bis limit nur Leerraum kommt.
export function spokenWordAt(text, index, limit = text.length) {
  let start = Math.max(0, index);
  while (start < limit && SPACE.test(text[start])) start++;
  if (start >= limit) return null;
  while (start > 0 && !SPACE.test(text[start - 1])) start--;
  let end = start;
  while (end < text.length && !SPACE.test(text[end])) end++;
  const raw = text.slice(start, end);
  const lead = raw.match(/^[^\p{L}\p{N}]*/u)[0].length;
  const trail = raw.match(/[^\p{L}\p{N}]*$/u)[0].length;
  return lead + trail >= raw.length ? { start, end } : { start: start + lead, end: end - trail };
}
