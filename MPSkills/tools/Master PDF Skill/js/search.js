// Text search on PDF.js text content: build a page string from the text items, find matches, map them back to item pieces and rectangles.

// items: PDF.js text items ({str, hasEOL, transform, width, height}). spans remember which characters of text belong to which item.
export function buildPageText(items) {
  let text = '';
  const spans = [];
  items.forEach((item, index) => {
    const str = item.str || '';
    if (str) { spans.push({ start: text.length, end: text.length + str.length, item: index }); text += str; }
    if (item.hasEOL) text += '\n';
  });
  return { text, spans };
}

// Case-insensitive; whitespace in the query also matches missing or different whitespace (PDF text items often lack spaces or break lines).
export function searchPattern(query) {
  const words = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'giu');
}

export function findMatches(text, pattern) {
  const matches = [];
  if (!pattern) return matches;
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (!match[0].length) { pattern.lastIndex++; continue; }
    matches.push({ start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

// Character range [start, end) of the page text → pieces per text item, with offsets inside item.str.
export function matchPieces(spans, start, end) {
  return spans.filter(span => span.end > start && span.start < end)
    .map(span => ({ item: span.item, from: Math.max(start, span.start) - span.start, to: Math.min(end, span.end) - span.start }));
}

export function snippet(text, start, end, radius = 40) {
  const clean = s => s.replace(/\s+/g, ' ');
  const from = Math.max(0, start - radius), to = Math.min(text.length, end + radius);
  return {
    before: (from > 0 ? '…' : '') + clean(text.slice(from, start)).trimStart(),
    match: clean(text.slice(start, end)),
    after: clean(text.slice(end, to)).trimEnd() + (to < text.length ? '…' : '')
  };
}

// Rectangle [x1, y1, x2, y2] in PDF user space around characters from..to of a text item (proportional per character; also for rotated text).
export function pieceRect(item, from, to) {
  const [a, b, c, d, e, f] = item.transform;
  const length = item.str.length || 1;
  const scaleX = Math.hypot(a, b) || 1, scaleY = Math.hypot(c, d);
  const dir = [a / scaleX, b / scaleX];
  const up = scaleY ? [c / scaleY, d / scaleY] : [-dir[1], dir[0]];
  const height = item.height || scaleY || scaleX;
  const s0 = item.width * from / length, s1 = item.width * to / length;
  const corners = [[s0, -0.22 * height], [s1, -0.22 * height], [s0, 0.95 * height], [s1, 0.95 * height]]
    .map(([s, t]) => [e + dir[0] * s + up[0] * t, f + dir[1] * s + up[1] * t]);
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
