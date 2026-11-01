// Password-protected PDFs: decrypted once on open, so PDF.js (view) and pdf-lib (export) both work on a plain copy.
// Standard security handler, revisions 2–6: RC4 40/128 bit, AES-128 (AESV2) and AES-256 (AESV3, R5/R6), with the user
// or the owner password (an empty user password – files that only restrict printing/copying – is tried silently).
// pdf-lib does not decrypt, and it would read encrypted object streams as garbage; their contents are therefore
// decrypted before pdf-lib parses them (two passes, see decryptPdf). MD5 and RC4 here, SHA-2 and AES via WebCrypto.
// The opened file loses its password; on export it can get a new one (encryptPdf: AES-256, revision 6).
import { PDFDocument, PDFHeader, PDFParser, PDFObjectStreamParser, PDFRawStream, PDFDict, PDFArray, PDFName, PDFNumber, PDFString, PDFHexString, PDFRef } from '../lib/pdf-lib/pdf-lib.esm.min.js';

const PAD = Uint8Array.from([0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08, 0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A]);
const subtle = globalThis.crypto?.subtle;

/** Quick check: does the file contain an encryption dictionary at all? (The trailer is never compressed.) */
export function looksEncrypted(bytes) {
  const needle = [47, 69, 110, 99, 114, 121, 112, 116]; // "/Encrypt"
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle[k]) continue outer;
    return true;
  }
  return false;
}

export class PasswordError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const equal = (a, b, n = a.length) => { for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };

/** MD5 (RFC 1321), as the PDF key derivation needs it. */
export function md5(data) {
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const len = data.length, total = ((len + 8) >> 6) + 1 << 6, msg = new Uint8Array(total);
  msg.set(data); msg[len] = 0x80;
  const bits = len * 8;
  for (let i = 0; i < 8; i++) msg[total - 8 + i] = i < 4 ? (bits >>> (8 * i)) & 255 : Math.floor(bits / 2 ** (8 * i)) & 255;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = msg[off + i * 4] | msg[off + i * 4 + 1] << 8 | msg[off + i * 4 + 2] << 16 | msg[off + i * 4 + 3] << 24;
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => { for (let k = 0; k < 4; k++) out[i * 4 + k] = (v >>> (8 * k)) & 255; });
  return out;
}

export function rc4(key, data) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]];
    out[n] = data[n] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

const sha = async (name, data) => new Uint8Array(await subtle.digest(name, data));
const aesKey = (key, usage) => subtle.importKey('raw', key, 'AES-CBC', false, [usage]);
/** AES-CBC with PKCS#7 padding (strings and streams): first 16 bytes are the IV. Bad data → null. */
async function aesDecrypt(key, data) {
  if (data.length < 32 || data.length % 16) return data.length === 16 ? new Uint8Array(0) : null;
  try { return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv: data.subarray(0, 16) }, await aesKey(key, 'decrypt'), data.subarray(16))); } catch { return null; }
}
/** AES-CBC without padding (key derivation of R6): WebCrypto always pads, the extra block is cut off. */
async function aesEncryptRaw(key, iv, data) {
  return new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv }, await aesKey(key, 'encrypt'), data)).subarray(0, data.length);
}
/** AES-CBC decryption of data without padding: a valid padding block is encrypted and appended first. */
async function aesDecryptRaw(key, iv, data) {
  const last = data.subarray(data.length - 16), pad = new Uint8Array(16).fill(16);
  const extra = (await aesEncryptRaw(key, last, pad)).subarray(0, 16);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv }, await aesKey(key, 'decrypt'), concat(data, extra)));
}

/** Hash of revision 6 (ISO 32000-2, algorithm 2.B); revision 5 is a plain SHA-256. */
async function hashR6(password, salt, udata, revision) {
  let k = await sha('SHA-256', concat(password, salt, udata));
  if (revision === 5) return k;
  let e = new Uint8Array(0);
  for (let i = 0; i < 64 || e[e.length - 1] > i - 32; i++) {
    const one = concat(password, k, udata), k1 = new Uint8Array(one.length * 64);
    for (let j = 0; j < 64; j++) k1.set(one, j * one.length);
    e = await aesEncryptRaw(k.subarray(0, 16), k.subarray(16, 32), k1);
    const mod = e.subarray(0, 16).reduce((a, b) => a + b, 0) % 3;
    k = await sha(['SHA-256', 'SHA-384', 'SHA-512'][mod], e);
  }
  return k.subarray(0, 32);
}

const bytesOf = obj => obj instanceof PDFHexString || obj instanceof PDFString ? obj.asBytes() : new Uint8Array(0);
const num = obj => obj instanceof PDFNumber ? obj.asNumber() : null;
const latin = text => Uint8Array.from(String(text), ch => ch.charCodeAt(0) & 255);

/** File key for the password, or null when it is wrong. */
export async function fileKey(enc, id0, password) {
  const R = num(enc.lookup(PDFName.of('R'))) ?? 2, V = num(enc.lookup(PDFName.of('V'))) ?? 0;
  const O = bytesOf(enc.lookup(PDFName.of('O'))), U = bytesOf(enc.lookup(PDFName.of('U')));
  if (R >= 5) {
    const pw = new TextEncoder().encode(String(password)).subarray(0, 127);
    if (equal(await hashR6(pw, U.subarray(32, 40), new Uint8Array(0), R), U, 32)) {
      return aesDecryptRaw(await hashR6(pw, U.subarray(40, 48), new Uint8Array(0), R), new Uint8Array(16), bytesOf(enc.lookup(PDFName.of('UE'))));
    }
    const u48 = U.subarray(0, 48);
    if (equal(await hashR6(pw, O.subarray(32, 40), u48, R), O, 32)) {
      return aesDecryptRaw(await hashR6(pw, O.subarray(40, 48), u48, R), new Uint8Array(16), bytesOf(enc.lookup(PDFName.of('OE'))));
    }
    return null;
  }
  const n = R === 2 ? 5 : Math.max(5, Math.min(16, (num(enc.lookup(PDFName.of('Length'))) ?? 40) / 8));
  const P = (num(enc.lookup(PDFName.of('P'))) ?? 0) >>> 0;
  const meta = enc.lookup(PDFName.of('EncryptMetadata'));
  const padded = pw => concat(pw, PAD).subarray(0, 32);
  const keyFor = pw32 => {
    let h = md5(concat(pw32, O.subarray(0, 32), Uint8Array.from([P & 255, (P >>> 8) & 255, (P >>> 16) & 255, (P >>> 24) & 255]), id0, R >= 4 && String(meta) === 'false' ? Uint8Array.from([255, 255, 255, 255]) : new Uint8Array(0)));
    if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
    return h.subarray(0, n);
  };
  const userOk = key => {
    if (R === 2) return equal(rc4(key, PAD), U, 32);
    let x = rc4(key, md5(concat(PAD, id0)));
    for (let i = 1; i <= 19; i++) x = rc4(key.map(b => b ^ i), x);
    return equal(x, U, 16);
  };
  const pw = latin(password);
  let key = keyFor(padded(pw));
  if (userOk(key)) return key;
  // Owner password: it decrypts O to the (padded) user password.
  let h = md5(padded(pw));
  if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h);
  const ok = h.subarray(0, n);
  let user = O.subarray(0, 32);
  if (R === 2) user = rc4(ok, user);
  else for (let i = 19; i >= 0; i--) user = rc4(ok.map(b => b ^ i), user);
  key = keyFor(user);
  return userOk(key) ? key : null;
}

/** How strings and streams are encrypted: 'rc4' | 'aesv2' | 'aesv3' | 'none' (crypt filters of V4/V5). */
function methods(enc) {
  const V = num(enc.lookup(PDFName.of('V'))) ?? 0;
  if (V < 4) return { string: 'rc4', stream: 'rc4' };
  const cf = enc.lookup(PDFName.of('CF'));
  const of = name => {
    const filter = name instanceof PDFName ? name.asString().slice(1) : 'Identity';
    if (filter === 'Identity') return 'none';
    const cfm = cf instanceof PDFDict ? cf.lookup(PDFName.of(filter))?.lookup?.(PDFName.of('CFM')) : null;
    const m = cfm instanceof PDFName ? cfm.asString() : '/V2';
    return m === '/AESV2' ? 'aesv2' : m === '/AESV3' ? 'aesv3' : m === '/None' ? 'none' : 'rc4';
  };
  return { string: of(enc.get(PDFName.of('StrF'))), stream: of(enc.get(PDFName.of('StmF'))) };
}

function objectKey(key, method, ref) {
  if (method === 'aesv3') return key;
  const n = ref.objectNumber, g = ref.generationNumber;
  const extra = method === 'aesv2' ? Uint8Array.from([0x73, 0x41, 0x6c, 0x54]) : new Uint8Array(0);
  return md5(concat(key, Uint8Array.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, g & 255, (g >> 8) & 255]), extra)).subarray(0, Math.min(key.length + 5, 16));
}
async function decryptWith(method, key, ref, data) {
  if (method === 'none') return data;
  const k = objectKey(key, method, ref);
  if (method === 'rc4') return rc4(k, data);
  return (await aesDecrypt(k, data)) ?? data;
}

/**
 * Plain copy of an encrypted PDF, or null when it is not encrypted. Throws PasswordError with code 'password' (wrong or
 * missing password) or 'unsupported' (other security handlers, e.g. certificates).
 */
export async function decryptPdf(bytes, password = '') {
  if (!looksEncrypted(bytes)) return null;
  if (!subtle) throw new PasswordError('WebCrypto fehlt', 'unsupported');
  const objectStreams = new Map();
  let current = null;
  const header = PDFParser.prototype.parseIndirectObjectHeader, forStream = PDFObjectStreamParser.forStream;
  PDFParser.prototype.parseIndirectObjectHeader = function () { current = header.call(this); return current; };
  let doc;
  try {
    // Pass 1: trailer and encryption dictionary; object streams are only collected.
    PDFObjectStreamParser.forStream = stream => { if (current) objectStreams.set(`${current.objectNumber} ${current.generationNumber}`, { ref: current, stream }); return { parseIntoContext: async () => {} }; };
    const first = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    const encRef = first.context.trailerInfo.Encrypt, enc = first.context.lookup(encRef);
    if (!(enc instanceof PDFDict)) return null;
    if (enc.lookup(PDFName.of('Filter'))?.asString?.() !== '/Standard') throw new PasswordError('Andere Verschlüsselung', 'unsupported');
    const ids = first.context.lookup(first.context.trailerInfo.ID);
    const id0 = ids instanceof PDFArray ? bytesOf(ids.lookup(0)) : new Uint8Array(0);
    const key = await fileKey(enc, id0, password);
    if (!key) throw new PasswordError('Falsches Passwort', 'password');
    const how = methods(enc), encryptMeta = String(enc.lookup(PDFName.of('EncryptMetadata'))) !== 'false';
    const plainStreams = new Map();
    for (const [k, { ref, stream }] of objectStreams) plainStreams.set(k, await decryptWith(how.stream, key, ref, stream.contents));
    // Pass 2: object streams are read from their decrypted copies; their objects are not encrypted on their own.
    const inside = new Set();
    PDFObjectStreamParser.forStream = (stream, tick) => {
      const plain = current && plainStreams.get(`${current.objectNumber} ${current.generationNumber}`);
      // The dict of this pass: the parser puts the objects into the context its dict belongs to.
      const parser = forStream.call(PDFObjectStreamParser, plain ? PDFRawStream.of(stream.dict, plain) : stream, tick);
      const run = parser.parseIntoContext.bind(parser);
      parser.parseIntoContext = async () => {
        const context = stream.dict.context, assign = context.assign;
        context.assign = function (ref, obj) { inside.add(ref); return assign.call(this, ref, obj); };
        try { return await run(); } finally { context.assign = assign; }
      };
      return parser;
    };
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    const context = doc.context, encryptRef = context.trailerInfo.Encrypt;
    const walk = async (obj, ref) => {
      if (obj instanceof PDFDict) for (const [k, v] of obj.entries()) { if (v instanceof PDFString || v instanceof PDFHexString) obj.set(k, PDFHexString.of(hexOf(await decryptWith(how.string, key, ref, v.asBytes())))); else await walk(v, ref); }
      else if (obj instanceof PDFArray) for (let i = 0; i < obj.size(); i++) { const v = obj.get(i); if (v instanceof PDFString || v instanceof PDFHexString) obj.set(i, PDFHexString.of(hexOf(await decryptWith(how.string, key, ref, v.asBytes())))); else await walk(v, ref); }
    };
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      if (inside.has(ref) || (encryptRef instanceof PDFRef && ref === encryptRef)) continue;
      if (obj instanceof PDFRawStream) {
        const type = obj.dict.lookup(PDFName.of('Type'));
        if (type === PDFName.of('XRef')) continue;
        await walk(obj.dict, ref);
        if (type === PDFName.of('Metadata') && !encryptMeta) continue;
        context.assign(ref, PDFRawStream.of(obj.dict, await decryptWith(how.stream, key, ref, obj.contents)));
      } else await walk(obj, ref);
    }
    delete context.trailerInfo.Encrypt;
    if (encryptRef instanceof PDFRef) context.delete(encryptRef);
  } finally {
    PDFParser.prototype.parseIndirectObjectHeader = header;
    PDFObjectStreamParser.forStream = forStream;
  }
  return doc.save({ updateFieldAppearances: false });
}

const hexOf = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/**
 * Password protection for the export (encryptPdf): standard security handler V5/R6 with AES-256 (AESV3), which
 * Adobe Reader/Acrobat (X and newer), Chrome, Edge, Firefox, macOS Preview, pdf.js, poppler and qpdf open.
 * User and owner password are the same: whoever knows it may also print, copy, change or remove the protection
 * there. Strings and streams of every object are encrypted (random IV each); the result has no object streams, so
 * every object is encrypted on its own, and a classic xref table (nothing to leave out but /Encrypt).
 */
const random = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
const ZERO_IV = new Uint8Array(16);
/** Password bytes for R6: UTF-8 after normalising (stand-in for SASLprep), at most 127 bytes. */
export const passwordBytes = password => new TextEncoder().encode(String(password).normalize('NFKC')).subarray(0, 127);

async function aesEncrypt(key, data) {
  const iv = random(16);
  return concat(iv, new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv }, await aesKey(key, 'encrypt'), data)));
}

/** Validation entries of the encryption dictionary (ISO 32000-2, algorithms 8–10) for one password. */
export async function securityEntries(password, key, P = -4) {
  const pw = passwordBytes(password);
  const uSalt = random(16), U = concat(await hashR6(pw, uSalt.subarray(0, 8), new Uint8Array(0), 6), uSalt);
  const UE = await aesEncryptRaw(await hashR6(pw, uSalt.subarray(8, 16), new Uint8Array(0), 6), ZERO_IV, key);
  const oSalt = random(16), O = concat(await hashR6(pw, oSalt.subarray(0, 8), U, 6), oSalt);
  const OE = await aesEncryptRaw(await hashR6(pw, oSalt.subarray(8, 16), U, 6), ZERO_IV, key);
  const p = P >>> 0, perms = concat(Uint8Array.from([p & 255, (p >>> 8) & 255, (p >>> 16) & 255, (p >>> 24) & 255, 255, 255, 255, 255, 0x54, 0x61, 0x64, 0x62]), random(4));
  return { U, UE, O, OE, Perms: await aesEncryptRaw(key, ZERO_IV, perms) };
}

/** Copy of the PDF that opens only with the password (empty password → Error). */
export async function encryptPdf(bytes, password) {
  if (!subtle) throw new Error('WebCrypto fehlt – Verschlüsseln geht in diesem Browser nicht.');
  if (!String(password)) throw new Error('Kein Passwort angegeben');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  const context = doc.context;
  if (context.trailerInfo.Encrypt) throw new Error('Die Datei ist schon verschlüsselt');
  const key = random(32), seen = new Set();
  const lock = async v => PDFHexString.of(hexOf(await aesEncrypt(key, v.asBytes())));
  const walk = async obj => {
    if (seen.has(obj)) return;
    if (obj instanceof PDFDict) { seen.add(obj); for (const [k, v] of obj.entries()) { if (v instanceof PDFString || v instanceof PDFHexString) obj.set(k, await lock(v)); else await walk(v); } }
    else if (obj instanceof PDFArray) { seen.add(obj); for (let i = 0; i < obj.size(); i++) { const v = obj.get(i); if (v instanceof PDFString || v instanceof PDFHexString) obj.set(i, await lock(v)); else await walk(v); } }
  };
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFString || obj instanceof PDFHexString) { context.assign(ref, await lock(obj)); continue; }
    if (obj?.dict instanceof PDFDict && typeof obj.getContents === 'function') {
      await walk(obj.dict);
      context.assign(ref, PDFRawStream.of(obj.dict, await aesEncrypt(key, obj.getContents())));
      continue;
    }
    await walk(obj);
  }
  const e = await securityEntries(password, key);
  const hex = b => PDFHexString.of(hexOf(b));
  const enc = context.obj({
    Filter: 'Standard', V: 5, R: 6, Length: 256, P: -4, EncryptMetadata: true,
    CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 } }, StmF: 'StdCF', StrF: 'StdCF',
  });
  for (const k of ['O', 'U', 'OE', 'UE', 'Perms']) enc.set(PDFName.of(k), hex(e[k]));
  context.trailerInfo.Encrypt = context.register(enc);
  // AES-256 belongs to PDF 2.0 / Adobe's extension level 8 of PDF 1.7.
  if (!(context.header?.toString?.() || '').startsWith('%PDF-2')) context.header = PDFHeader.forVersion(1, 7);
  doc.catalog.set(PDFName.of('Extensions'), context.obj({ ADBE: { BaseVersion: PDFName.of('1.7'), ExtensionLevel: 8 } }));
  const ids = context.lookup(context.trailerInfo.ID);
  if (!(ids instanceof PDFArray) || ids.size() < 2) { const id = hex(random(16)); context.trailerInfo.ID = context.obj([id, id]); }
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false, addDefaultPage: false });
}
