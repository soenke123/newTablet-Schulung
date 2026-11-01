import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PDFDocument, decodePDFRawStream } from '../lib/pdf-lib/pdf-lib.esm.min.js';
import { md5, rc4, decryptPdf, encryptPdf, looksEncrypted, PasswordError } from '../js/crypt.js';
import { createBlankPdf } from '../js/export.js';

// Fixtures (tests/fixtures): one page "Elternbrief", Titel „Elternbrief“, user password "geheim", owner password
// "besitzer"; written by pypdf (RC4-40/128, AES-128/256, R5) and qpdf/pikepdf (with object streams).
const fixture = name => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

test('MD5 und RC4 liefern die Prüfwerte', () => {
  assert.equal(hex(md5(new Uint8Array(0))), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(hex(md5(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))), '9e107d9d372bb6826bd81d3542a419d6');
  assert.equal(hex(rc4(new TextEncoder().encode('Key'), new TextEncoder().encode('Plaintext'))), 'bbf316e8d940af0ad3');
});

async function opened(bytes) {
  const doc = await PDFDocument.load(bytes);
  const c = doc.getPage(0).node.Contents(), stream = doc.context.lookup(c.asArray ? c.asArray()[0] : c);
  return { title: doc.getTitle(), content: new TextDecoder().decode(decodePDFRawStream(stream).decode()) };
}

for (const name of ['rc4-40.pdf', 'rc4-128.pdf', 'aes-128.pdf', 'aes-256-r5.pdf', 'aes-256.pdf', 'objstm-rc4-128.pdf', 'objstm-aes-256.pdf']) {
  test(`Entschlüsseln: ${name} mit Benutzer- und Besitzerpasswort`, async () => {
    const bytes = fixture(name);
    assert.ok(looksEncrypted(bytes));
    for (const password of ['geheim', 'besitzer']) {
      const plain = await decryptPdf(bytes, password);
      assert.ok(!looksEncrypted(plain));
      const { title, content } = await opened(plain);
      assert.equal(title, 'Elternbrief');
      assert.match(content, /Tf/);
    }
    await assert.rejects(decryptPdf(bytes, 'falsch'), e => e instanceof PasswordError && e.code === 'password');
    await assert.rejects(decryptPdf(bytes, ''), e => e.code === 'password');
  });
}

test('Nur Besitzerpasswort: öffnet ohne Abfrage', async () => {
  const plain = await decryptPdf(fixture('nur-besitzer.pdf'), '');
  assert.equal((await opened(plain)).title, 'Elternbrief');
});

test('Unverschlüsselte Dateien bleiben unangetastet', async () => {
  const bytes = await createBlankPdf(100, 100);
  assert.equal(looksEncrypted(bytes), false);
  assert.equal(await decryptPdf(bytes, ''), null);
});

test('Verschlüsseln (AES-256, R6): nur mit dem Passwort wieder lesbar, Inhalt bleibt', async () => {
  for (const name of ['aes-128.pdf', 'objstm-aes-256.pdf']) {
    const plain = await decryptPdf(fixture(name), 'geheim');
    for (const password of ['geheim', 'Schüler!23 ß€']) {
      const locked = await encryptPdf(plain, password);
      assert.ok(looksEncrypted(locked));
      const text = new TextDecoder('latin1').decode(locked);
      assert.match(text, /\/R 6/);
      assert.match(text, /\/CFM \/AESV3/);
      assert.doesNotMatch(text, /Elternbrief|ObjStm/);
      const back = await decryptPdf(locked, password);
      const { title, content } = await opened(back);
      assert.equal(title, 'Elternbrief');
      assert.match(content, /Tf/);
      await assert.rejects(decryptPdf(locked, 'falsch'), e => e.code === 'password');
      await assert.rejects(decryptPdf(locked, ''), e => e.code === 'password');
    }
  }
});

test('Verschlüsseln: ohne Passwort gibt es keine Datei', async () => {
  await assert.rejects(encryptPdf(await createBlankPdf(100, 100), ''));
});
