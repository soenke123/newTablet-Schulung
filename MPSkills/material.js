/* ══════════════════════════════════════════════════════════════
   MPSkills — material.js   ·   Arbeitsmaterial zu einem Skill
   ══════════════════════════════════════════════════════════════
   Aufruf: material.html?tool=socialhub&raum=CODE (Knopf auf der
   Startseite der Lehrkraft in YourSozialNet; ohne raum geht es auch,
   dann merkt sich nur das Gerät die Häkchen).

   Nur für freigeschaltete Lehrkräfte und Admins. Die Seite zeigt:
     1. Downloads: Skript (Word, PDF – offen unter tools/<Skill>/material/)
        und Lösungsheft (nicht offen: RPC skill_material_file_get, 0280).
        Admins laden das Lösungsheft hier hoch (skill_material_file_put,
        braucht 2FA – sonst 'not_admin').
     2. Für die Klasse: Kapitel I als Stand (I-1 … I-4, wächst mit),
        Kapitel II als Häkchen je Abschnitt, Knöpfe für die Unterrichts-
        stufen. Gespeichert je Kurs = Raum (skill_material_marks_set).
     3. „Schüler-PDF“: setzt Deckblatt + Stand + abgehakte Teile im
        Browser zusammen (pdf-lib aus Master PDF Skill, nichts verlässt
        das Gerät) und stempelt neue Seitenzahlen.

   Was es gibt, steht in material.json neben dem Skript – das schreibt
   tools/SocialHub/arbeitsblatt/build.mjs beim Bauen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const TOOLS = {
    socialhub: { dir: 'tools/SocialHub/material/', skill: 'YourSozialNet' }
  };
  const PDFLIB = './tools/Master%20PDF%20Skill/lib/pdf-lib/pdf-lib.esm.min.js';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = new URLSearchParams(location.search);
  const TOOL = (P.get('tool') || '').toLowerCase();
  const CODE = (P.get('raum') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const T = TOOLS[TOOL];
  const LS = 'mps.material.' + TOOL;

  const ERR = {
    not_logged_in: 'Bitte anmelden.',
    not_teacher: 'Dafür musst du Lehrkraft in diesem Raum sein.',
    not_admin: 'Hochladen dürfen nur Admins – und nur nach der Anmeldung mit 2FA im Admin-Panel.',
    not_found: 'Diese Datei wurde noch nicht hochgeladen.',
    too_big: 'Die Datei ist zu groß (höchstens 12 MB).',
    bad_mime: 'Nur Word (.docx) oder PDF.',
    bad_name: 'Ungültiger Dateiname.',
    bad_teile: 'Die Auswahl ließ sich nicht speichern.'
  };
  const errText = c => ERR[c] || ('Unerwarteter Fehler (' + c + ').');

  let toastTimer = null;
  function toast(message, err) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
  }

  async function rpc(fn, args) {
    const { data, error } = await window.supabaseClient.rpc(fn, args);
    if (error) throw new Error(error.message);
    if (data && data.error) { const e = new Error(data.error); e.code = data.error; throw e; }
    return data;
  }

  function hinweis(titel, text) {
    const host = $('matHost');
    host.classList.add('wrap--narrow');
    host.innerHTML = '<div class="card card--join"><h1 class="join-h">' + titel + '</h1><p class="join-sub">' + text + '</p>' +
      '<a class="btn btn--primary btn--wide" href="index.html">Zu MPSkills</a></div>';
  }

  /* ── Zustand ─────────────────────────────────────────────── */
  const S = { man: null, sel: new Set(), room: null, files: [], admin: false, saveT: null };

  const stand = () => { // höchster gewählter Stand aus Kapitel I (Index 0 … 3) oder -1
    let k = -1;
    S.man.staende.forEach((x, i) => { if (S.sel.has(x.id)) k = i; });
    return k;
  };
  function setStand(k) {
    S.man.staende.forEach(x => S.sel.delete(x.id));
    if (k >= 0) S.sel.add(S.man.staende[k].id);
  }

  function chosen() {
    const parts = [S.man.deckblatt];
    const k = stand();
    if (k >= 0) parts.push(S.man.staende[k].datei);
    for (const t of S.man.teile) if (S.sel.has(t.id)) parts.push(t.datei);
    return parts;
  }
  function pageCount() {
    let n = 1;
    const k = stand();
    if (k >= 0) n += S.man.staende[k].seiten;
    for (const t of S.man.teile) if (S.sel.has(t.id)) n += t.seiten;
    return n;
  }

  /* ── Speichern: je Kurs auf dem Server, sonst im Gerät ───── */
  function save() {
    clearTimeout(S.saveT);
    const list = [...S.sel];
    if (!CODE) { try { localStorage.setItem(LS, JSON.stringify(list)); } catch (e) { /* egal */ } paintState('Im Gerät gemerkt'); return; }
    paintState('Speichert …');
    S.saveT = setTimeout(async () => {
      try { await rpc('skill_material_marks_set', { p_code: CODE, p_tool: TOOL, p_teile: list }); paintState('Für diesen Kurs gespeichert'); }
      catch (e) { paintState('Nicht gespeichert'); toast(errText(e.code || e.message), true); }
    }, 500);
  }
  function paintState(txt) {
    const el = $('matSaved'); if (el) el.textContent = txt;
    const n = $('matPages'); if (n) n.textContent = pageCount() + ' Seiten';
    const b = $('matBuild'); if (b) b.disabled = pageCount() <= 1;
  }

  /* ── Oberfläche ──────────────────────────────────────────── */
  function render() {
    const m = S.man;
    const k = stand();
    const sol = name => S.files.find(f => f.name === name);
    let h = '<h1 class="mat-h">Arbeitsmaterial <span class="mat-sub">' + esc(T.skill) + ' · ' + esc(m.titel) + '</span></h1>';

    h += '<section class="card"><h2 class="card-h">Für dich</h2><div class="mat-dl">' +
      '<a class="mat-file" href="' + esc(T.dir + m.dateien.word) + '" download>' + icon('doc') + '<span><b>Skript</b><small>Word, zum Bearbeiten</small></span></a>' +
      '<a class="mat-file" href="' + esc(T.dir + m.dateien.pdf) + '" download>' + icon('pdf') + '<span><b>Skript</b><small>PDF, alle Kapitel</small></span></a>' +
      m.loesungen.map(l => {
        const f = sol(l.name);
        return '<button type="button" class="mat-file mat-file--sol" data-sol="' + esc(l.name) + '"' + (f ? '' : ' disabled') + '>' + icon(/\.pdf$/.test(l.name) ? 'pdf' : 'doc') +
          '<span><b>' + esc(l.label.replace(/ \(.*\)$/, '')) + '</b><small>' + (f ? esc((/\.pdf$/.test(l.name) ? 'PDF' : 'Word') + ' · nur für Lehrkräfte') : 'noch nicht hochgeladen') + '</small></span></button>';
      }).join('') + '</div>' +
      (S.admin ? '<div class="mat-admin"><b>Admin:</b> Lösungsheft hochladen <label class="btn btn--sm">Datei wählen<input type="file" id="matUp" accept=".docx,.pdf" multiple hidden></label>' +
        '<span class="mat-faint">Name wie im Skript: ' + m.loesungen.map(l => '<code>' + esc(l.name) + '</code>').join(' · ') + '</span></div>' : '') +
      '</section>';

    h += '<section class="card"><h2 class="card-h">Für die Klasse' + (S.room ? ' <span class="card-h-note">Kurs „' + esc(S.room) + '“</span>' : '') + '</h2>' +
      (CODE ? '' : '<p class="mat-note">Ohne Raum merkt sich nur dieses Gerät die Häkchen. Öffne die Seite aus deinem Raum, dann gelten sie für den Kurs.</p>') +
      '<p class="mat-faint">Hake an, was die Klasse schon hat. Das Schüler-PDF enthält immer alles Abgehakte – mit Deckblatt und neuen Seitenzahlen.</p>' +
      (m.stufen && m.stufen.length ? '<div class="mat-stufen"><span class="mat-l">Schnell setzen:</span>' + m.stufen.map((s, i) =>
        '<button type="button" class="btn btn--sm" data-stufe="' + i + '" title="' + esc(s.hint) + '">' + esc(s.label) + '</button>').join('') + '</div>' : '') +
      '<div class="mat-cols">' +
        '<div class="mat-col"><h3 class="mat-kap">I. Begriffe <small>wächst mit – wähle den Stand</small></h3>' +
          '<label class="mat-row"><input type="radio" name="stand" value="-1"' + (k < 0 ? ' checked' : '') + '><span>noch nichts</span></label>' +
          m.staende.map((x, i) => '<label class="mat-row"><input type="radio" name="stand" value="' + i + '"' + (k === i ? ' checked' : '') + '><span>' +
            (i ? 'bis ' : '') + esc(x.label) + '<small>' + x.seiten + ' S.</small></span></label>').join('') + '</div>' +
        '<div class="mat-col"><h3 class="mat-kap">II. SQL</h3>' +
          m.teile.map(t => '<label class="mat-row"><input type="checkbox" data-teil="' + esc(t.id) + '"' + (S.sel.has(t.id) ? ' checked' : '') + '><span>' + esc(t.label) +
            '<small>' + (t.aufg ? 'Aufgabe ' + esc(t.aufg) + ' · ' : '') + t.seiten + ' S.' + (t.optional ? ' · <i>optional</i>' : '') + '</small></span></label>').join('') + '</div>' +
      '</div>' +
      '<div class="mat-go"><button type="button" class="btn btn--primary" id="matBuild">Schüler-PDF herunterladen</button>' +
        '<span class="mat-faint"><span id="matPages"></span> · <span id="matSaved">' + (CODE ? 'Für diesen Kurs gespeichert' : 'Im Gerät') + '</span></span></div>' +
      '</section>';
    h += '<p class="mat-faint mat-ver">Stand des Materials: ' + esc(m.erstellt) + '</p>';
    $('matHost').innerHTML = h;
    paintState($('matSaved').textContent);
  }

  function icon(kind) {
    return kind === 'pdf'
      ? '<svg viewBox="0 0 24 24" class="mat-ic mat-ic--pdf" aria-hidden="true"><path d="M6 2h8l5 5v15H6z" fill="currentColor" opacity=".14"/><path d="M6 2h8l5 5v15H6zM14 2v5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><text x="12.5" y="18" text-anchor="middle" font-size="5.6" font-weight="700" fill="currentColor" font-family="Inter,sans-serif">PDF</text></svg>'
      : '<svg viewBox="0 0 24 24" class="mat-ic mat-ic--doc" aria-hidden="true"><path d="M6 2h8l5 5v15H6z" fill="currentColor" opacity=".14"/><path d="M6 2h8l5 5v15H6zM14 2v5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><text x="12.5" y="18" text-anchor="middle" font-size="5.6" font-weight="700" fill="currentColor" font-family="Inter,sans-serif">W</text></svg>';
  }

  /* ── Ereignisse ──────────────────────────────────────────── */
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.name === 'stand') { setStand(+t.value); save(); return; }
    if (t.dataset && t.dataset.teil) { t.checked ? S.sel.add(t.dataset.teil) : S.sel.delete(t.dataset.teil); save(); return; }
    if (t.id === 'matUp') { await upload([...t.files]); t.value = ''; }
  });
  document.addEventListener('click', async e => {
    const st = e.target.closest('[data-stufe]');
    if (st) {
      const upto = S.man.stufen.slice(0, +st.dataset.stufe + 1);
      const ids = upto.flatMap(s => s.teile);
      const I = S.man.staende.map(x => x.id);
      let k = stand();
      for (const id of ids) { const i = I.indexOf(id); if (i >= 0) k = Math.max(k, i); else S.sel.add(id); }
      setStand(k);
      render(); save();
      toast(S.man.stufen[+st.dataset.stufe].label + ' gesetzt');
      return;
    }
    const so = e.target.closest('[data-sol]');
    if (so && !so.disabled) { await downloadSolution(so.dataset.sol, so); return; }
    if (e.target.closest('#matBuild')) await buildPdf(e.target.closest('#matBuild'));
  });

  /* ── Lösungsheft ─────────────────────────────────────────── */
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function downloadSolution(name, btn) {
    btn.disabled = true;
    try {
      const r = await rpc('skill_material_file_get', { p_tool: TOOL, p_name: name });
      const bin = atob(r.data), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      saveBlob(new Blob([u8], { type: r.mime }), name);
    } catch (e) { toast(errText(e.code || e.message), true); }
    btn.disabled = false;
  }
  async function upload(files) {
    for (const f of files) {
      const mime = /\.pdf$/i.test(f.name) ? 'application/pdf' : /\.docx$/i.test(f.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : null;
      const target = S.man.loesungen.find(l => l.name.toLowerCase() === f.name.toLowerCase())
        || S.man.loesungen.find(l => (mime === 'application/pdf') === /\.pdf$/.test(l.name));
      if (!mime || !target) { toast('„' + f.name + '“: nur Word oder PDF', true); continue; }
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
      try { await rpc('skill_material_file_put', { p_tool: TOOL, p_name: target.name, p_mime: mime, p_data: b64 }); toast(target.label + ' hochgeladen'); }
      catch (e) { toast(errText(e.code || e.message), true); }
    }
    await loadFiles(); render();
  }
  async function loadFiles() {
    try { S.files = (await rpc('skill_material_files_list', { p_tool: TOOL })).files || []; } catch (e) { S.files = []; }
  }

  /* ── Schüler-PDF ─────────────────────────────────────────── */
  async function buildPdf(btn) {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Setze zusammen …';
    try {
      const { PDFDocument, StandardFonts, rgb } = await import(PDFLIB);
      const out = await PDFDocument.create();
      for (const f of chosen()) {
        const src = await PDFDocument.load(await (await fetch(T.dir + f + '?v=' + encodeURIComponent(S.man.version))).arrayBuffer());
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
      }
      // Seitenzahlen wie im Skript: rechts unten, fett, Akzentfarbe; das Deckblatt ohne
      const font = await out.embedFont(StandardFonts.HelveticaBold);
      out.getPages().forEach((p, i) => {
        if (i === 0) return;
        const t = String(i + 1), size = 7.5, w = font.widthOfTextAtSize(t, size);
        p.drawText(t, { x: p.getWidth() - 56.7 - w, y: 37.7, size, font, color: rgb(0.31, 0.275, 0.898) });
      });
      out.setTitle(S.man.titel);
      out.setAuthor('');
      const name = S.man.titel + (S.room ? ' - ' + S.room : '') + '.pdf';   // kein Gedankenstrich: Chrome verwirft dann den Namen
      saveBlob(new Blob([await out.save()], { type: 'application/pdf' }), name.replace(/[\\/:*?"<>|]/g, ''));
    } catch (e) {
      console.error(e);
      toast('Das PDF ließ sich nicht erstellen: ' + e.message, true);
    }
    btn.textContent = old;
    btn.disabled = false;
  }

  /* ── Start ───────────────────────────────────────────────── */
  (async function boot() {
    window.MPUserBar?.mount();
    if (!T) { hinweis('Kein Material', 'Zu diesem Skill gibt es (noch) kein Arbeitsmaterial.'); return; }
    await (window.waitForSession?.() ?? Promise.resolve());
    const s = window.getSessionUser?.();
    if (!s) { hinweis('Bitte anmelden', 'Arbeitsmaterial gibt es für angemeldete Lehrkräfte.'); return; }
    S.admin = !!(s.is_admin || s.is_superadmin);
    if (!S.admin && s.teacher_status !== 'approved') { hinweis('Noch nicht freigeschaltet', 'Für MPSkills bist du noch nicht als Lehrkraft freigeschaltet.'); return; }
    try { S.man = await (await fetch(T.dir + 'material.json', { cache: 'no-cache' })).json(); }
    catch (e) { hinweis('Material fehlt', 'Das Material ließ sich nicht laden. Lade die Seite neu.'); return; }
    document.title = 'Arbeitsmaterial · ' + S.man.titel + ' · MPSkills';
    if (CODE) {
      try {
        const r = await rpc('skill_material_marks_get', { p_code: CODE, p_tool: TOOL });
        (r.teile || []).forEach(x => S.sel.add(x));
        S.room = r.title || CODE;
      } catch (e) { hinweis('Kein Zugriff', 'Diesen Raum leitest du nicht – oder es gibt ihn nicht mehr.'); return; }
    } else {
      try { JSON.parse(localStorage.getItem(LS) || '[]').forEach(x => S.sel.add(x)); } catch (e) { /* egal */ }
    }
    // nur ids, die es im Material gibt
    const known = new Set([...S.man.staende, ...S.man.teile].map(x => x.id));
    [...S.sel].forEach(x => { if (!known.has(x)) S.sel.delete(x); });
    await loadFiles();
    render();
  })();
})();
