/* Zugang zum Online-Tool (01.11.2026, Sönke): „Downloaden darf man ohne
   Account. Aber das Online-Tool darf man nur als Lehrer nutzen, wenn man
   eingeloggt ist."

   Klassisches Skript im <head>, damit die Seite gar nicht erst sichtbar
   wird. Es lässt durch:
     - die Windows-Fassung (window.__TAURI__) – die ist der Download und
       hat keine Anmeldung; prepare.mjs kopiert diese Datei mit, hier
       passiert dann nichts;
     - das Schaufenster der MPSkills-Startseite (?demo=1 im iframe);
     - angemeldete Lehrkräfte (teacher_status 'approved') und Admins.
   Alle anderen sehen statt der App einen Kasten mit Anmeldung und dem
   Windows-Download. Die App läuft weiter ganz im Browser – geprüft wird
   nur, wer sie öffnen darf, nicht was mit den Dateien passiert. */
(function () {
  'use strict';
  if (window.__TAURI__) return;
  var demo = /[?&]demo=1(&|$)/.test(location.search);
  var framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }
  if (demo && framed) return;

  var ROOT = '../../../';                  // Webauftritt-Wurzel
  var MPS = '../../index.html';            // MPSkills-Startseite
  var DL = ROOT + 'downloads/master-pdf/MasterPDFSkill-Setup.exe';

  var root = document.documentElement;
  root.classList.add('mps-gate');
  var css = document.createElement('style');
  css.textContent =
    'html.mps-gate body>*:not(#mps-gate){visibility:hidden!important}' +
    '#mps-gate{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;background:#f4f6fb;color:#1c2333;font:16px/1.5 system-ui,sans-serif;text-align:center}' +
    '#mps-gate .box{max-width:30em;background:#fff;border-radius:14px;padding:28px 24px;box-shadow:0 8px 30px rgba(23,43,77,.12)}' +
    '#mps-gate img{width:56px;height:56px}' +
    '#mps-gate h1{font-size:20px;margin:10px 0 6px}' +
    '#mps-gate p{margin:0 0 16px;color:#4a5568}' +
    '#mps-gate .row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}' +
    '#mps-gate a{display:inline-block;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600;border:1px solid #172b4d;color:#172b4d}' +
    '#mps-gate a.pri{background:#172b4d;color:#fff}' +
    '@media (prefers-color-scheme:dark){#mps-gate{background:#11161f;color:#e6e9ef}#mps-gate .box{background:#1b2230}#mps-gate p{color:#aab3c2}#mps-gate a{border-color:#9fb4d8;color:#dfe7f5}#mps-gate a.pri{background:#9fb4d8;color:#11161f}}';
  document.head.appendChild(css);

  function box(html) {
    var el = document.getElementById('mps-gate');
    if (!el) { el = document.createElement('div'); el.id = 'mps-gate'; el.setAttribute('role', 'dialog'); document.body.appendChild(el); }
    el.innerHTML = '<div class="box"><img src="MasterPDFSkill%20Logo.png" alt="">' + html + '</div>';
  }
  function whenBody(fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  }
  function open() {
    root.classList.remove('mps-gate');
    var el = document.getElementById('mps-gate');
    if (el) el.remove();
  }
  function deny(loggedIn) {
    whenBody(function () {
      box('<h1>Nur für Lehrkräfte</h1>' +
        (loggedIn
          ? '<p>Das Online-Tool können angemeldete Lehrkräfte mit freigeschaltetem MPSkills-Zugang nutzen. Die Windows-Fassung gibt es ohne Konto.</p>'
          : '<p>Bitte melde dich bei MPSkills als Lehrkraft an, um den Master PDF Skill im Browser zu nutzen. Die Windows-Fassung gibt es ohne Konto zum Herunterladen.</p>') +
        '<div class="row">' +
        '<a class="pri" href="' + MPS + '">' + (loggedIn ? 'Zu MPSkills' : 'Anmelden') + '</a>' +
        '<a href="' + DL + '" download>Download für Windows</a>' +
        '</div>');
    });
  }

  whenBody(function () { box('<h1>Master PDF Skill</h1><p>Anmeldung wird geprüft …</p>'); });

  function load(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }
  load(ROOT + 'vendor/supabase-js-2.116.0.min.js')
    .then(function () { return load(ROOT + 'supabase-config.js'); })
    .then(function () { return load(ROOT + 'session.js?v=20260817'); })
    .then(function () {
      // Ohne Netz hinge waitForSession() – nach 12 s gilt: nicht angemeldet.
      var wait = window.waitForSession ? window.waitForSession() : null;
      return Promise.race([wait, new Promise(function (ok) { setTimeout(ok, 12000); })]);
    })
    .then(function () {
      var s = window.getSessionUser ? window.getSessionUser() : null;
      if (s && (s.is_admin || s.is_superadmin || s.teacher_status === 'approved')) open();
      else deny(!!s);
    })
    .catch(function () { deny(false); });
})();
