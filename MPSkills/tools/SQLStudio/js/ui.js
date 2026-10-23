/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/ui.js   ·   Kleine Bausteine
   ══════════════════════════════════════════════════════════════
   Was mehrere Reiter brauchen: Meldung unten (toast), Fenster mit
   Knöpfen (dialog), Herunterladen, Ergebnistabelle, Zeichen.
   Keine Abhängigkeit zu irgendetwas außer dem DOM.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Zeichen, einfarbig aus Linien wie im Rest von MPSkills. */
  const P = {
    db: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10"/>',
    view: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    play: '<path d="M7 4.8v14.4L19 12z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    upload: '<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 19.5h14"/>',
    download: '<path d="M12 4.5v11M7.5 11 12 15.5 16.5 11M5 19.5h14"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7M10.5 10.5v5.5M13.5 10.5v5.5"/>',
    edit: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/>',
    key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17 12v3M20 12v2.5"/>',
    link: '<path d="M10 14l4-4M8.5 11.5l-1.6 1.6a3 3 0 0 0 4.2 4.2l1.6-1.6M15.5 12.5l1.6-1.6a3 3 0 0 0-4.2-4.2l-1.6 1.6"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    book: '<path d="M5 5.5A2 2 0 0 1 7 4h12v14H7a2 2 0 0 0-2 2z"/><path d="M5 20V5.5M9 8h6"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
    warn: '<path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4.5M12 17v.2"/>',
    refresh: '<path d="M19 12a7 7 0 1 1-2.1-5M19 4.5v4h-4"/>',
    arrange: '<rect x="3.5" y="4" width="7" height="6" rx="1.2"/><rect x="13.5" y="14" width="7" height="6" rx="1.2"/><path d="M10.5 7h3a2 2 0 0 1 2 2v5"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    zin: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11h5M11 8.5v5"/>',
    zout: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11h5"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/>',
    reset: '<path d="M5 12a7 7 0 1 0 2.1-5M5 4.5v4h4"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    chevl: '<path d="M14.5 6l-6 6 6 6"/>',
    chevr: '<path d="M9.5 6l6 6-6 6"/>',
    sort: '<path d="M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3"/>',
    up: '<path d="M6 14l6-6 6 6"/>',
    down: '<path d="M6 10l6 6 6-6"/>',
    share: '<circle cx="17.5" cy="6" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="M8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6"/>'
  };
  const icon = (n, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>';

  /* ── Meldung ─────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(msg, kind) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.className = 'toast show' + (kind ? ' toast--' + kind : '');
    t.innerHTML = icon(kind === 'error' ? 'warn' : 'check') + '<span>' + esc(msg) + '</span>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, kind === 'error' ? 5000 : 2600);
  }

  /* ── Fenster ─────────────────────────────────────────────── */
  /* dialog({ title, body (HTML), buttons: [{ label, value, kind }], onOpen(root), wide })
     → Promise mit value des gedrückten Knopfs (null bei Abbruch).
     Ein Knopf mit `submit: true` schickt das Formular ab; vorher darf
     `validate(root)` einen Fehlertext liefern, dann bleibt es offen. */
  function dialog(o) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'dlg-back';
      back.innerHTML =
        '<form class="dlg' + (o.wide ? ' dlg--wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title || '') + '">' +
          (o.title ? '<h2 class="dlg-title">' + esc(o.title) + '</h2>' : '') +
          '<div class="dlg-body">' + (o.body || '') + '</div>' +
          '<div class="dlg-err" hidden></div>' +
          '<div class="dlg-btns">' + (o.buttons || [{ label: 'OK', value: true, kind: 'primary', submit: true }]).map((b, i) =>
            '<button type="' + (b.submit ? 'submit' : 'button') + '" class="btn ' + (b.kind ? 'btn--' + b.kind : '') + '" data-i="' + i + '">' + esc(b.label) + '</button>'
          ).join('') + '</div>' +
        '</form>';
      document.body.appendChild(back);
      const form = back.querySelector('form');
      const errBox = back.querySelector('.dlg-err');
      const buttons = o.buttons || [{ label: 'OK', value: true, kind: 'primary', submit: true }];
      let done = false;
      const close = (v) => {
        if (done) return;
        done = true;
        back.classList.add('out');
        setTimeout(() => back.remove(), 140);
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
      const fire = async (b) => {
        if (b.submit && o.validate) {
          errBox.hidden = true;
          const err = await o.validate(form, b.value);
          if (err) { errBox.textContent = err; errBox.hidden = false; return; }
        }
        close(typeof b.value === 'function' ? b.value(form) : b.value);
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const b = buttons.find(x => x.submit);
        if (b) fire(b);
      });
      back.querySelectorAll('.dlg-btns button').forEach(btn => {
        const b = buttons[+btn.dataset.i];
        if (!b.submit) btn.addEventListener('click', () => fire(b));
      });
      requestAnimationFrame(() => back.classList.add('in'));
      if (o.onOpen) o.onOpen(form, errBox);
      const f = form.querySelector('[autofocus]') || form.querySelector('input,select,textarea');
      if (f) setTimeout(() => f.focus(), 30);
      else { const p = form.querySelector('.btn--primary'); if (p) setTimeout(() => p.focus(), 30); }
    });
  }

  const confirm = (title, text, label, kind) => dialog({
    title, body: '<p>' + text + '</p>',
    buttons: [{ label: 'Abbrechen', value: false }, { label: label || 'OK', value: true, kind: kind || 'primary', submit: true }]
  });

  /* ── Herunterladen ───────────────────────────────────────── */
  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  /* ── Ergebnistabelle ─────────────────────────────────────── */
  function cell(v) {
    if (v === null || v === undefined) return '<td class="c-null">NULL</td>';
    if (typeof v === 'object' && v.blob !== undefined) return '<td class="c-blob">[BLOB · ' + v.blob + ' Byte]</td>';
    if (typeof v === 'number') return '<td class="c-num">' + esc(fmtNum(v)) + '</td>';
    const s = String(v);
    if (s.length > 240) return '<td title="' + esc(s.slice(0, 2000)) + '">' + esc(s.slice(0, 240)) + '…</td>';
    return '<td>' + esc(s) + '</td>';
  }
  function fmtNum(v) {
    if (Number.isInteger(v)) return String(v);
    // 3.3000000000000003 → 3.3
    return String(Math.round(v * 1e10) / 1e10);
  }
  function tableHTML(columns, rows) {
    return '<div class="res-scroll"><table class="res-table"><thead><tr><th class="c-rn">#</th>' +
      columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r, i) => '<tr><td class="c-rn">' + (i + 1) + '</td>' + r.map(cell).join('') + '</tr>').join('') +
      '</tbody></table></div>';
  }
  function csv(columns, rows) {
    const f = v => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return '';
      const s = String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // Semikolon: so öffnet ein deutsches Excel die Datei richtig
    return '﻿' + [columns.map(f).join(';')].concat(rows.map(r => r.map(f).join(';'))).join('\r\n');
  }

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const ms = n => n < 1 ? '< 1 ms' : n + ' ms';

  window.SQLUI = { $, $$, esc, icon, toast, dialog, confirm, download, tableHTML, cell, csv, plural, ms, fmtNum };
})();
