// Changing text that is already in a PDF (tab "Bearbeiten" → "Text ändern"): the page content stream is read
// operator by operator, every glyph gets its position on the page (text matrix, CTM, font widths), and glyphs inside a
// rectangle are taken out of their Tj/TJ operator – their advance is kept as a TJ offset, so everything after them on
// the line stays exactly where it was. The new text is written with the same text matrix, size and colour, in the
// original font when it contains all needed characters (ToUnicode), otherwise in a PDF standard font.
// Not supported (the app then covers the old text instead): text inside form XObjects, vertical fonts, CMaps without
// codespace ranges. Pure apart from pdf-lib, unit-tested in tests/textedit.test.js.
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFStream, decodePDFRawStream } from '../lib/pdf-lib/pdf-lib.esm.min.js';

const WS = new Set([0, 9, 10, 12, 13, 32]), DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
const isNum = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const ascii = (bytes, a, b) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(bytes[i]); return s; };

/**
 * Operators of a content stream (or CMap): `[{op, args, start, end}]`, `start` = first operand, `end` = after the
 * operator. Values: numbers, `{name}`, `{bytes, hex}` strings, arrays, `{dict: Map}`, true/false/null. Inline images
 * (BI … ID … EI) are one operator 'BI' without arguments.
 */
export function tokenize(bytes) {
  const ops = [], n = bytes.length;
  let i = 0, args = [], argStart = -1;
  const stack = [];
  const push = (value, start) => {
    if (stack.length) { const top = stack.at(-1); top.items.push(value); return; }
    if (argStart < 0) argStart = start;
    args.push(value);
  };
  while (i < n) {
    const c = bytes[i];
    if (WS.has(c)) { i++; continue; }
    const start = i;
    if (c === 37) { while (i < n && bytes[i] !== 10 && bytes[i] !== 13) i++; continue; }
    if (c === 40) { // literal string
      const out = [];
      let depth = 1; i++;
      while (i < n && depth) {
        let b = bytes[i++];
        if (b === 92) {
          const e = bytes[i++];
          const map = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };
          if (e in map) out.push(map[e]);
          else if (e >= 48 && e <= 55) { let v = e - 48; for (let k = 0; k < 2 && bytes[i] >= 48 && bytes[i] <= 55; k++) v = v * 8 + bytes[i++] - 48; out.push(v & 255); }
          else if (e === 13) { if (bytes[i] === 10) i++; }
          else if (e !== 10) out.push(e);
          continue;
        }
        if (b === 40) depth++;
        else if (b === 41 && !--depth) break;
        out.push(b);
      }
      push({ bytes: Uint8Array.from(out), hex: false }, start);
      continue;
    }
    if (c === 60 && bytes[i + 1] === 60) { stack.push({ dict: true, items: [], start }); i += 2; continue; }
    if (c === 62 && bytes[i + 1] === 62) {
      i += 2;
      const top = stack.pop();
      if (!top) continue;
      const dict = new Map();
      for (let k = 0; k + 1 < top.items.length; k += 2) if (top.items[k]?.name != null) dict.set(top.items[k].name, top.items[k + 1]);
      push({ dict }, top.start);
      continue;
    }
    if (c === 60) { // hex string
      i++;
      let hex = '';
      while (i < n && bytes[i] !== 62) { const ch = String.fromCharCode(bytes[i++]); if (/[0-9a-fA-F]/.test(ch)) hex += ch; }
      i++;
      if (hex.length % 2) hex += '0';
      const out = new Uint8Array(hex.length / 2);
      for (let k = 0; k < out.length; k++) out[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
      push({ bytes: out, hex: true }, start);
      continue;
    }
    if (c === 91) { stack.push({ items: [], start }); i++; continue; }
    if (c === 93) { i++; const top = stack.pop(); if (top) push(top.items, top.start); continue; }
    if (c === 123 || c === 125 || c === 41 || c === 62) { i++; continue; }
    if (c === 47) { // name
      i++;
      let name = '';
      while (i < n && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) {
        if (bytes[i] === 35 && i + 2 < n) { name += String.fromCharCode(parseInt(ascii(bytes, i + 1, i + 3), 16)); i += 3; }
        else name += String.fromCharCode(bytes[i++]);
      }
      push({ name }, start);
      continue;
    }
    while (i < n && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) i++;
    const word = ascii(bytes, start, i);
    if (isNum.test(word)) { push(Number(word), start); continue; }
    if (word === 'true' || word === 'false') { push(word === 'true', start); continue; }
    if (word === 'null') { push(null, start); continue; }
    if (stack.length) continue; // stray keyword inside an array: ignore
    if (word === 'BI') {
      // Skip to "ID", then the binary data up to an "EI" between white space.
      let j = i;
      while (j < n - 1 && !(bytes[j] === 73 && bytes[j + 1] === 68 && WS.has(bytes[j - 1]) && (WS.has(bytes[j + 2]) || j + 2 >= n))) j++;
      j += 3;
      while (j < n - 1 && !(bytes[j] === 69 && bytes[j + 1] === 73 && WS.has(bytes[j - 1]) && (j + 2 >= n || WS.has(bytes[j + 2]) || DELIM.has(bytes[j + 2])))) j++;
      i = Math.min(n, j + 2);
      ops.push({ op: 'BI', args: [], start: argStart >= 0 ? argStart : start, end: i });
    } else ops.push({ op: word, args, start: argStart >= 0 ? argStart : start, end: i });
    args = []; argStart = -1;
  }
  return ops;
}

// Matrices [a b c d e f] as in PDF (row vectors): mul(A, B) applies A first.
export const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
export const apply = (m, x, y) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
const ID = [1, 0, 0, 1, 0, 0];

/** Code → Unicode text, codespace ranges and code → CID from a CMap (ToUnicode or embedded encoding CMap). */
export function parseCMap(bytes) {
  const unicode = new Map(), cids = new Map(), spaces = [], cidRanges = [];
  const num = s => s.bytes.reduce((v, b) => v * 256 + b, 0);
  const utf16 = b => { let s = ''; for (let k = 0; k + 1 < b.length; k += 2) s += String.fromCharCode((b[k] << 8) | b[k + 1]); if (b.length % 2) s += String.fromCharCode(b.at(-1)); return s; };
  for (const { op, args } of tokenize(bytes)) {
    if (op === 'endcodespacerange') for (let k = 0; k + 1 < args.length; k += 2) spaces.push({ len: args[k].bytes.length, lo: [...args[k].bytes], hi: [...args[k + 1].bytes] });
    else if (op === 'endbfchar') for (let k = 0; k + 1 < args.length; k += 2) { if (args[k]?.bytes && args[k + 1]?.bytes) unicode.set(num(args[k]), utf16(args[k + 1].bytes)); else if (args[k]?.bytes && args[k + 1]?.name) unicode.set(num(args[k]), args[k + 1].name); }
    else if (op === 'endbfrange') for (let k = 0; k + 2 < args.length; k += 3) {
      const lo = num(args[k]), hi = num(args[k + 1]), dst = args[k + 2];
      if (hi - lo > 65535) continue;
      if (Array.isArray(dst)) dst.forEach((d, j) => { if (d?.bytes && lo + j <= hi) unicode.set(lo + j, utf16(d.bytes)); });
      else if (dst?.bytes) { const base = [...dst.bytes]; for (let code = lo; code <= hi; code++) { const b = base.slice(); let carry = code - lo; for (let p = b.length - 1; p >= 0 && carry; p--) { const v = b[p] + carry; b[p] = v & 255; carry = v >> 8; } unicode.set(code, utf16(b)); } }
    } else if (op === 'endcidchar') for (let k = 0; k + 1 < args.length; k += 2) cids.set(num(args[k]), args[k + 1]);
    else if (op === 'endcidrange') for (let k = 0; k + 2 < args.length; k += 3) cidRanges.push([num(args[k]), num(args[k + 1]), args[k + 2]]);
  }
  const cid = code => {
    if (cids.has(code)) return cids.get(code);
    const range = cidRanges.find(([lo, hi]) => code >= lo && code <= hi);
    return range ? code - range[0] + range[2] : null;
  };
  return { unicode, spaces, cid };
}

// WinAnsi codes 128–159 (everything else equals Latin-1), for simple fonts without ToUnicode.
const WIN_ANSI = { 128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ' };
const STANDARD_14 = /^(Times|Helvetica|Courier|Symbol|ZapfDingbats)/;

function streamBytes(obj) {
  if (obj instanceof PDFRawStream) return decodePDFRawStream(obj).decode();
  if (obj instanceof PDFStream && typeof obj.getUnencodedContents === 'function') return obj.getUnencodedContents();
  return null;
}
const numberOf = v => v instanceof PDFNumber ? v.asNumber() : typeof v?.asNumber === 'function' ? v.asNumber() : null;

/**
 * What the content stream needs from a font: `read(bytes, k)` → code length at k, `width(code)` (text space units per
 * 1 pt font size), `unicode(code)`, `encode(text)` → bytes or null (some character missing), `vertical`.
 * `stdWidth(baseFont, char)` measures the 14 standard fonts, which may come without /Widths.
 */
export function fontInfo(dict, context, stdWidth = () => 0.5) {
  const look = key => dict.lookup(PDFName.of(key));
  const subtype = look('Subtype')?.asString?.() || '';
  const base = (look('BaseFont')?.asString?.() || '').replace(/^\//, '').replace(/^[A-Z]{6}\+/, '');
  const toUni = look('ToUnicode'), cmap = toUni ? (() => { try { return parseCMap(streamBytes(toUni)); } catch { return null; } })() : null;
  const descriptorOf = d => d?.lookup(PDFName.of('FontDescriptor'));
  if (subtype === '/Type0') {
    const enc = look('Encoding');
    const desc = look('DescendantFonts') instanceof PDFArray ? look('DescendantFonts').lookup(0) : null;
    let encoding = null, vertical = false;
    if (enc instanceof PDFName) {
      const name = enc.asString();
      if (name === '/Identity-H' || name === '/Identity-V') { vertical = name === '/Identity-V'; encoding = { spaces: [{ len: 2, lo: [0, 0], hi: [255, 255] }], cid: code => code }; }
    } else if (enc) {
      try { encoding = parseCMap(streamBytes(enc)); } catch { encoding = null; }
      vertical = numberOf(enc.dict?.lookup?.(PDFName.of('WMode'))) === 1;
    }
    if (!encoding?.spaces?.length) return null;
    const widths = new Map();
    const dw = numberOf(desc?.lookup(PDFName.of('DW'))) ?? 1000;
    const w = desc?.lookup(PDFName.of('W'));
    if (w instanceof PDFArray) {
      const arr = w.asArray().map(v => context.lookup(v));
      for (let k = 0; k < arr.length;) {
        const first = numberOf(arr[k]);
        if (arr[k + 1] instanceof PDFArray) { arr[k + 1].asArray().forEach((v, j) => widths.set(first + j, numberOf(context.lookup(v)))); k += 2; }
        else { const last = numberOf(arr[k + 1]), value = numberOf(arr[k + 2]); for (let c = first; c <= last && c - first < 65536; c++) widths.set(c, value); k += 3; }
      }
    }
    const read = (bytes, k) => codeLength(encoding.spaces, bytes, k);
    return makeInfo({ base, read, width: code => { const cid = encoding.cid(code) ?? code; return (widths.get(cid) ?? dw) / 1000; }, cmap, vertical, descriptor: descriptorOf(desc), twoByte: true });
  }
  const first = numberOf(look('FirstChar')) ?? 0, list = look('Widths');
  const widths = list instanceof PDFArray ? list.asArray().map(v => numberOf(context.lookup(v)) ?? 0) : null;
  const descriptor = descriptorOf(dict), missing = numberOf(descriptor?.lookup(PDFName.of('MissingWidth'))) ?? 0;
  let scale = 1 / 1000;
  if (subtype === '/Type3') { const m = look('FontMatrix'); scale = m instanceof PDFArray ? numberOf(m.lookup(0)) ?? 0.001 : 0.001; }
  const enc = look('Encoding');
  const winAnsi = !enc || (enc instanceof PDFName && enc.asString() === '/WinAnsiEncoding') || (enc instanceof PDFDict && !enc.has(PDFName.of('Differences')));
  const latin = code => WIN_ANSI[code] || (code >= 32 && code !== 127 ? String.fromCharCode(code) : null);
  const width = code => {
    if (widths && code >= first && code < first + widths.length) return widths[code - first] * scale;
    if (!widths && STANDARD_14.test(base)) return stdWidth(base, latin(code) || ' ');
    return missing * scale || (widths ? 0 : 0.5);
  };
  return makeInfo({ base, read: () => 1, width, cmap, vertical: false, descriptor, fallbackUnicode: winAnsi ? latin : null });
}

function codeLength(spaces, bytes, k) {
  for (let len = 1; len <= 4; len++) {
    if (k + len > bytes.length) break;
    if (spaces.some(s => s.len === len && s.lo.every((lo, j) => bytes[k + j] >= lo && bytes[k + j] <= s.hi[j]))) return len;
  }
  return Math.min(Math.min(...spaces.map(s => s.len)) || 1, bytes.length - k);
}

function makeInfo({ base, read, width, cmap, vertical, descriptor, fallbackUnicode = null, twoByte = false }) {
  const unicode = code => cmap?.unicode.get(code) ?? fallbackUnicode?.(code) ?? null;
  const reverse = new Map();
  if (cmap) for (const [code, text] of cmap.unicode) { if (!reverse.has(text)) reverse.set(text, code); }
  if (!cmap && fallbackUnicode) for (let code = 32; code < 256; code++) { const t = fallbackUnicode(code); if (t && !reverse.has(t)) reverse.set(t, code); }
  const len = twoByte ? 2 : 1;
  const ascent = numberOf(descriptor?.lookup(PDFName.of('Ascent'))), descent = numberOf(descriptor?.lookup(PDFName.of('Descent')));
  return {
    base, vertical, read, width, unicode, twoByte,
    ascent: ascent > 0 && ascent < 2000 ? ascent / 1000 : 0.85, descent: descent < 0 && descent > -1000 ? descent / 1000 : -0.22,
    bold: /bold|black|heavy|semibold|demi/i.test(base), italic: /italic|oblique/i.test(base),
    family: /courier|mono|consol/i.test(base) ? 'mono' : /times|serif|roman|cambria|georgia|garamond|book/i.test(base) && !/sans/i.test(base) ? 'serif' : 'sans',
    /** Codes for the text in this font, or null when a character is missing (each code needs a ToUnicode entry). */
    encode(text) {
      const out = [];
      for (const ch of String(text)) {
        const code = reverse.get(ch);
        if (code == null || code >= 256 ** len) return null;
        for (let k = len - 1; k >= 0; k--) out.push((code >> (8 * k)) & 255);
      }
      return Uint8Array.from(out);
    },
  };
}

const colorHex = c => {
  let rgb = [0, 0, 0];
  if (c.length === 1) rgb = [c[0], c[0], c[0]];
  else if (c.length === 3) rgb = c;
  else if (c.length === 4) rgb = [0, 1, 2].map(k => (1 - c[k]) * (1 - c[3]));
  return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
};

/**
 * Every glyph of the content stream with its place on the page (user space): `{op, part, at, len, code, text,
 * origin, center, corners, matrix (text matrix × CTM at the glyph), size, th, tc, rise, font (resource name), color,
 * invisible, vertical, shift (TJ number that replaces the glyph's advance)}`. `fontFor(name)` returns fontInfo or null.
 */
export function readGlyphs(ops, fontFor) {
  const glyphs = [], opInfo = [];
  let fresh = true;
  let gs = { ctm: ID, tc: 0, tw: 0, th: 1, tl: 0, font: null, name: null, size: 0, rise: 0, tr: 0, fill: [0] };
  const stack = [];
  let tm = ID, tlm = ID;
  const show = (opIndex, items) => {
    const font = gs.font;
    const startTrm = mul([gs.size * gs.th, 0, 0, gs.size, 0, gs.rise], mul(tm, gs.ctm));
    opInfo[opIndex] = { fresh, start: apply(startTrm, 0, 0), size: gs.size, th: gs.th, scale: Math.hypot(...mul(tm, gs.ctm).slice(0, 2)), font: gs.name };
    fresh = false;
    items.forEach((item, part) => {
      if (typeof item === 'number') { tm = mul([1, 0, 0, 1, -item / 1000 * gs.size * gs.th, 0], tm); return; }
      if (!item?.bytes) return;
      const b = item.bytes;
      for (let k = 0; k < b.length;) {
        const len = font ? font.read(b, k) : 1;
        let code = 0;
        for (let j = 0; j < len; j++) code = code * 256 + (b[k + j] ?? 0);
        const w0 = font ? font.width(code) : 0.5;
        const space = len === 1 && code === 32 ? gs.tw : 0;
        const tx = (w0 * gs.size + gs.tc + space) * gs.th;
        const trm = mul([gs.size * gs.th, 0, 0, gs.size, 0, gs.rise], mul(tm, gs.ctm));
        const asc = font?.ascent ?? 0.85, desc = font?.descent ?? -0.22;
        glyphs.push({
          op: opIndex, part, at: k, len, code, text: font?.unicode(code) ?? '',
          origin: apply(trm, 0, 0), center: apply(trm, w0 / 2, 0.3), corners: [apply(trm, 0, desc), apply(trm, w0, desc), apply(trm, w0, asc), apply(trm, 0, asc)],
          matrix: mul(tm, gs.ctm), size: gs.size, th: gs.th, tc: gs.tc, tw: gs.tw, rise: gs.rise, font: gs.name, color: colorHex(gs.fill),
          invisible: gs.tr === 3 || gs.tr === 7, vertical: !font || font.vertical, shift: gs.size * gs.th ? -tx * 1000 / (gs.size * gs.th) : null,
          adv: tx * Math.hypot(...mul(tm, gs.ctm).slice(0, 2)), w0,
        });
        tm = mul([1, 0, 0, 1, tx, 0], tm);
        k += len;
      }
    });
    opInfo[opIndex].end = apply(mul([gs.size * gs.th, 0, 0, gs.size, 0, gs.rise], mul(tm, gs.ctm)), 0, 0);
  };
  ops.forEach(({ op, args }, i) => {
    const a = args;
    switch (op) {
      case 'q': stack.push({ ...gs }); break;
      case 'Q': if (stack.length) gs = stack.pop(); break;
      case 'cm': if (a.length === 6) gs.ctm = mul(a, gs.ctm); break;
      case 'BT': fresh = true; tm = tlm = ID; break;
      case 'Tc': gs.tc = a[0] ?? 0; break;
      case 'Tw': gs.tw = a[0] ?? 0; break;
      case 'Tz': gs.th = (a[0] ?? 100) / 100; break;
      case 'TL': gs.tl = a[0] ?? 0; break;
      case 'Ts': gs.rise = a[0] ?? 0; break;
      case 'Tr': gs.tr = a[0] ?? 0; break;
      case 'Tf': gs.name = a[0]?.name ?? null; gs.font = gs.name ? fontFor(gs.name) : null; gs.size = a[1] ?? 0; break;
      case 'Td': fresh = true; tlm = tm = mul([1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0], tlm); break;
      case 'TD': fresh = true; gs.tl = -(a[1] ?? 0); tlm = tm = mul([1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0], tlm); break;
      case 'Tm': fresh = true; if (a.length === 6) tlm = tm = a.slice(); break;
      case 'T*': fresh = true; tlm = tm = mul([1, 0, 0, 1, 0, -gs.tl], tlm); break;
      case 'Tj': show(i, [a[0]]); break;
      case 'TJ': show(i, Array.isArray(a[0]) ? a[0] : []); break;
      case "'": fresh = true; tlm = tm = mul([1, 0, 0, 1, 0, -gs.tl], tlm); show(i, [a[0]]); break;
      case '"': fresh = true; gs.tw = a[0] ?? 0; gs.tc = a[1] ?? 0; tlm = tm = mul([1, 0, 0, 1, 0, -gs.tl], tlm); show(i, [a[2]]); break;
      case 'g': gs.fill = [a[0] ?? 0]; break;
      case 'rg': gs.fill = a.slice(0, 3); break;
      case 'k': gs.fill = a.slice(0, 4); break;
      case 'cs': gs.fill = [0]; break;
      case 'sc': case 'scn': { const v = a.filter(x => typeof x === 'number'); gs.fill = [1, 3, 4].includes(v.length) ? v : [0]; break; }
    }
  });
  glyphs.ops = opInfo;
  return glyphs;
}

/** Decoded content (all /Contents streams joined) and the page's font resources. */
export function pageContent(page) {
  const node = page.node, context = node.context;
  const contents = node.Contents?.() ?? node.lookup(PDFName.of('Contents'));
  const parts = [];
  const list = contents instanceof PDFArray ? contents.asArray().map(r => context.lookup(r)) : contents ? [contents] : [];
  for (const stream of list) { const b = streamBytes(stream); if (b) parts.push(b); }
  const total = parts.reduce((n, b) => n + b.length + 1, 0), bytes = new Uint8Array(total);
  let at = 0;
  for (const b of parts) { bytes.set(b, at); at += b.length; bytes[at++] = 10; }
  const resources = node.Resources?.() ?? node.lookup(PDFName.of('Resources'));
  const fontDict = resources instanceof PDFDict ? resources.lookup(PDFName.of('Font')) : null;
  return { bytes, fontDict: fontDict instanceof PDFDict ? fontDict : null, context };
}

/** Content, operators, glyphs and fonts of a pdf-lib page (see readGlyphs). */
export function analyzePage(page, stdWidth) {
  return analyzeContent(page, null, stdWidth);
}

/** Like analyzePage, for other content bytes (null = the page's own) with the page's fonts; fonts added later are found too. */
export function analyzeContent(page, content, stdWidth) {
  const { bytes: own, context } = content ? { bytes: null, context: page.node.context } : pageContent(page);
  const bytes = content || own;
  const fontDict = () => { const r = page.node.Resources?.() ?? page.node.lookup(PDFName.of('Resources')); const f = r instanceof PDFDict ? r.lookup(PDFName.of('Font')) : null; return f instanceof PDFDict ? f : null; };
  const fonts = new Map();
  const fontFor = name => {
    if (!fonts.has(name)) {
      let info = null;
      try { const dict = fontDict()?.lookup(PDFName.of(name)); info = dict instanceof PDFDict ? fontInfo(dict, context, stdWidth) : null; } catch { info = null; }
      fonts.set(name, info);
    }
    return fonts.get(name);
  };
  const ops = tokenize(bytes);
  return { bytes, ops, glyphs: readGlyphs(ops, fontFor), fonts, fontFor };
}

/** Indices of the glyphs whose centre lies inside one of the rectangles [x0, y0, x1, y1] (PDF space). */
export function glyphsIn(glyphs, rects, pad = 0.3) {
  const out = [];
  glyphs.forEach((g, i) => { if (rects.some(([x0, y0, x1, y1]) => g.center[0] >= Math.min(x0, x1) - pad && g.center[0] <= Math.max(x0, x1) + pad && g.center[1] >= Math.min(y0, y1) - pad && g.center[1] <= Math.max(y0, y1) + pad)) out.push(i); });
  return out;
}

const fmt = v => { const s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
const hex = bytes => '<' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') + '>';
const enc = new TextEncoder();

/**
 * Content without the glyphs `remove` (indices into analysis.glyphs): each changed text operator becomes a TJ in which
 * the removed glyphs are replaced by their advance, so the rest of the line keeps its place. Returns null when a glyph
 * cannot be removed this way (no advance known).
 */
export function removeGlyphs(analysis, remove) {
  const { bytes, ops, glyphs } = analysis;
  const byOp = new Map();
  for (const i of remove) {
    const g = glyphs[i];
    if (g.shift == null) return null;
    if (!byOp.has(g.op)) byOp.set(g.op, []);
    byOp.get(g.op).push(g);
  }
  const pieces = [];
  let last = 0;
  [...byOp.keys()].sort((a, b) => a - b).forEach(opIndex => {
    const op = ops[opIndex], gone = byOp.get(opIndex);
    const items = op.op === 'TJ' ? op.args[0] : op.op === '"' ? [op.args[2]] : [op.args[0]];
    const out = [];
    let pending = 0;
    const flush = () => { if (pending) { out.push(fmt(pending)); pending = 0; } };
    items.forEach((item, part) => {
      if (typeof item === 'number') { pending += item; return; }
      if (!item?.bytes) return;
      const cut = gone.filter(g => g.part === part).sort((a, b) => a.at - b.at);
      let k = 0;
      for (const g of cut) {
        if (g.at > k) { flush(); out.push(hex(item.bytes.subarray(k, g.at))); }
        pending += g.shift;
        k = g.at + g.len;
      }
      if (k < item.bytes.length) { flush(); out.push(hex(item.bytes.subarray(k))); }
    });
    flush();
    let text = `[${out.join(' ')}] TJ`;
    if (op.op === "'") text = `T* ${text}`;
    if (op.op === '"') text = `${fmt(op.args[0] ?? 0)} Tw ${fmt(op.args[1] ?? 0)} Tc T* ${text}`;
    pieces.push(bytes.subarray(last, op.start), enc.encode(text));
    last = op.end;
  });
  pieces.push(bytes.subarray(last));
  const total = pieces.reduce((n, p) => n + p.length, 0), result = new Uint8Array(total);
  let at = 0;
  for (const p of pieces) { result.set(p, at); at += p.length; }
  return result;
}

/** Content operators that write `codes` (bytes, or a ready "<hex>" string) like the glyph `style`: same font resource, size, matrix and colour. */
export function textOps(style, font, codes, color) {
  const [r, g, b] = [1, 3, 5].map(k => parseInt((color || '#000000').slice(k, k + 2), 16) / 255 || 0);
  return `q BT /${font} ${fmt(style.size)} Tf ${fmt(style.th * 100)} Tz ${fmt(style.tc || 0)} Tc ${fmt(style.rise || 0)} Ts 0 Tr ${fmt(r)} ${fmt(g)} ${fmt(b)} rg ${style.matrix.map(fmt).join(' ')} Tm ${typeof codes === 'string' ? codes : hex(codes)} Tj ET Q\n`;
}

/** A filled rectangle (the old text of a scanned page is covered). */
export function coverOps([x0, y0, x1, y1], color) {
  const [r, g, b] = [1, 3, 5].map(k => parseInt(color.slice(k, k + 2), 16) / 255);
  return `q ${fmt(r)} ${fmt(g)} ${fmt(b)} rg ${fmt(Math.min(x0, x1))} ${fmt(Math.min(y0, y1))} ${fmt(Math.abs(x1 - x0))} ${fmt(Math.abs(y1 - y0))} re f Q\n`;
}

/**
 * Replaces the glyphs under `rect` by `text` right inside the text operators, so the rest of the line moves along:
 * the first operator gets the new codes (in the original font when it has every character, otherwise a switch to the
 * standard font `std` = {res, widthOf(text, size), encode(text) → "<hex>"} and back), and every later glyph on the same
 * line – up to a wide gap (another column) – is shifted by the difference in width. Kerning stays, because each kept
 * glyph is placed at its old position (+ shift) with TJ offsets. Returns {bytes, original} or null when there is no
 * visible glyph in the rectangle (scans, form XObjects, vertical fonts: the app covers the old text instead).
 */
export function replaceText(analysis, rect, text, std = null) {
  const { bytes, ops, glyphs } = analysis, info = glyphs.ops || [];
  const hit = glyphsIn(glyphs, [rect]).filter(i => !glyphs[i].vertical && glyphs[i].shift != null);
  if (!hit.length || hit.every(i => glyphs[i].invisible)) return null;
  const removed = new Set(hit);
  const first = glyphs[hit.reduce((best, i) => projected(glyphs[i], glyphs[best]) < 0 ? i : best, hit[0])];
  const m = first.matrix, ml = Math.hypot(m[0], m[1]) || 1, dir = [m[0] / ml, m[1] / ml], normal = [-dir[1], dir[0]];
  const sOf = p => (p[0] - first.origin[0]) * dir[0] + (p[1] - first.origin[1]) * dir[1];
  const dOf = p => (p[0] - first.origin[0]) * normal[0] + (p[1] - first.origin[1]) * normal[1];
  const sizeUser = first.size * Math.hypot(m[2], m[3]);
  const sameLine = g => Math.abs(dOf(g.origin) - (g.rise - first.rise) * Math.hypot(g.matrix[2], g.matrix[3])) < 0.35 * sizeUser
    && Math.abs((g.matrix[0] * dir[0] + g.matrix[1] * dir[1]) / (Math.hypot(g.matrix[0], g.matrix[1]) || 1) - 1) < 0.01;
  // New text: codes in the original font, or the standard font.
  const font = analysis.fontFor(first.font), codes = font?.encode(text) ?? null, useStd = !codes && !!text;
  if (useStd && !std) return null;
  const k = first.size * first.th * ml;
  let width = 0;
  if (codes) for (let j = 0; j < codes.length;) { const len = font.read(codes, j); let code = 0; for (let n = 0; n < len; n++) code = code * 256 + codes[j + n]; width += (font.width(code) * first.size + first.tc + (len === 1 && code === 32 ? first.tw : 0)) * first.th * ml; j += len; }
  else if (text) for (const ch of text) width += (std.widthOf(ch, first.size) + first.tc + (ch === ' ' ? first.tw : 0)) * first.th * ml;
  const lastRemovedEnd = Math.max(...hit.map(i => sOf(glyphs[i].origin) + glyphs[i].adv));
  const removedWidth = lastRemovedEnd - sOf(first.origin);
  const delta = width - removedWidth;
  // Glyphs after the replaced ones on the same line, up to a gap wider than three font sizes.
  const after = glyphs.map((g, i) => ({ g, i, s: sOf(g.origin) })).filter(x => !removed.has(x.i) && sameLine(x.g) && x.s >= lastRemovedEnd - 0.01 * sizeUser).sort((a, b) => a.s - b.s);
  const shifted = new Set();
  let reach = lastRemovedEnd;
  for (const x of after) { if (x.s - reach > 3 * sizeUser) break; shifted.add(x.i); reach = Math.max(reach, x.s + x.g.adv); }
  const target = i => sOf(glyphs[i].origin) + (shifted.has(i) ? delta : 0);
  // Operators to rewrite: those with removed or shifted glyphs, and those that simply continue after one of them.
  const byOp = new Map();
  glyphs.forEach((g, i) => { if (!byOp.has(g.op)) byOp.set(g.op, []); byOp.get(g.op).push(i); });
  const showOps = [...byOp.keys()].sort((a, b) => a - b);
  const rewrite = new Set(showOps.filter(o => byOp.get(o).some(i => removed.has(i) || shifted.has(i))));
  for (let n = 1; n < showOps.length; n++) if (rewrite.has(showOps[n - 1]) && !info[showOps[n]]?.fresh && byOp.get(showOps[n]).some(i => sameLine(glyphs[i]))) rewrite.add(showOps[n]);
  if (!rewrite.size) return null;
  const pieces = [];
  let last = 0, pen = null, original = !useStd;
  for (const o of [...rewrite].sort((a, b) => a - b)) {
    const op = ops[o], gi = byOp.get(o), opk = info[o].size * info[o].th * info[o].scale || k;
    const before = showOps[showOps.indexOf(o) - 1];
    // A continuing operator starts where the one before it now ends; otherwise at its own place.
    pen = info[o].fresh || pen == null || !rewrite.has(before) ? sOf(info[o].start) : pen;
    const parts = [];
    let arr = [], run = [];
    const flushRun = () => { if (run.length) { arr.push(hex(Uint8Array.from(run))); run = []; } };
    const move = to => { if (Math.abs(to - pen) > 0.001) { flushRun(); arr.push(fmt(-(to - pen) / opk * 1000)); pen = to; } };
    const close = () => { flushRun(); if (arr.length) parts.push(`[${arr.join(' ')}] TJ`); arr = []; };
    const items = op.op === 'TJ' ? op.args[0] : op.op === '"' ? [op.args[2]] : [op.args[0]];
    for (const i of gi) {
      const g = glyphs[i];
      if (g === first) {
        move(sOf(first.origin));
        if (codes?.length) { flushRun(); arr.push(hex(codes)); }
        else if (useStd) { close(); parts.push(`/${std.res} ${fmt(first.size)} Tf ${std.encode(text)} Tj /${first.font} ${fmt(first.size)} Tf`); }
        pen = sOf(first.origin) + width;
        continue;
      }
      if (removed.has(i)) continue;
      move(target(i));
      const item = items[g.part];
      run.push(...item.bytes.subarray(g.at, g.at + g.len));
      pen = target(i) + g.adv;
    }
    const lastGlyph = gi.at(-1), endTarget = sOf(info[o].end) + (shifted.has(lastGlyph) || removed.has(lastGlyph) ? delta : 0);
    move(endTarget);
    close();
    let textOut = parts.join(' ');
    if (!textOut) textOut = '[] TJ';
    if (op.op === "'") textOut = `T* ${textOut}`;
    if (op.op === '"') textOut = `${fmt(op.args[0] ?? 0)} Tw ${fmt(op.args[1] ?? 0)} Tc T* ${textOut}`;
    pieces.push(bytes.subarray(last, op.start), enc.encode(textOut));
    last = op.end;
  }
  pieces.push(bytes.subarray(last));
  const total = pieces.reduce((n, p) => n + p.length, 0), result = new Uint8Array(total);
  let at = 0;
  for (const p of pieces) { result.set(p, at); at += p.length; }
  return { bytes: result, original, delta };
}

// Order along the line: negative when glyph a comes before b.
function projected(a, b) {
  const m = b.matrix, l = Math.hypot(m[0], m[1]) || 1;
  return ((a.origin[0] - b.origin[0]) * m[0] + (a.origin[1] - b.origin[1]) * m[1]) / l;
}
