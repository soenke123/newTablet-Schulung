/* ══════════════════════════════════════════════════════════════
   SYNIR — aufgabe.js   ·   Aufgabentext und Dialoge
   ══════════════════════════════════════════════════════════════
   Drei Dinge, die zusammengehören, weil sie alle „die Lehrkraft
   schreibt etwas, das die Klasse liest" sind:

   1. reinigen(html) — der Türsteher. Ein Aufgabentext wird mit
      innerHTML in den Auftrag gesetzt (showAufgabe in app.js), und
      im Raum kommt er von einem Server auf das Tablet eines Kindes.
      Übrig bleibt nur, was die mitgelieferten Aufträge auch
      benutzen: Absätze, fett, kursiv, Code, Aufzählungen — und die
      Klassen `dim` (grauer Hinweis) und `fs-s`/`fs-l` (klein/groß).
      Alles andere wird ausgepackt: der Text bleibt, das Etikett
      geht. Ein <script> geht ganz.

   2. editor() — das Fenster „Aufgabentext". Ein Feld zum Schreiben
      mit vier Knöpfen: F, K, Aufzählung und die Schriftgröße (ein
      Knopf, drei Stufen: normal → groß → klein → normal). Jedes
      Szenario hat genau EINEN Auftrag, also genau ein Fenster.

   3. frage() / name() — zwei kleine Dialoge für „Speichern": wohin
      (PC oder Szenario), und unter welchem Namen.

   Alle Dialoge geben ein Promise zurück und bauen ihr DOM selbst —
   index.html bleibt davon frei, und die Seite ohne Raum lädt diese
   Datei zwar, ruft aber nur reinigen() auf.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── 1. Reinigen ─────────────────────────────────────────── */
  const ERLAUBT = {
    P: 'p', DIV: 'p', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em',
    CODE: 'code', UL: 'ul', OL: 'ol', LI: 'li', BR: 'br'
  };
  const WEG = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, TEMPLATE: 1, NOSCRIPT: 1 };
  const KLASSEN = ['dim', 'fs-s', 'fs-l'];

  function reinigen(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString('<body>' + String(html) + '</body>', 'text/html');
    const out = document.createElement('div');
    (function walk(src, dst) {
      for (const n of Array.from(src.childNodes)) {
        if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1 || WEG[n.tagName]) continue;
        const tag = ERLAUBT[n.tagName];
        if (!tag) { walk(n, dst); continue; }
        const el = document.createElement(tag);
        if (tag !== 'br') {
          if (tag === 'p' || tag === 'li') {
            const k = (n.getAttribute('class') || '').split(/\s+/).filter(c => KLASSEN.indexOf(c) >= 0);
            if (k.length) el.className = k.join(' ');
          }
          walk(n, el);
        }
        dst.appendChild(el);
      }
    })(doc.body, out);
    return out.innerHTML.trim();
  }

  /* ─── Dialog-Gerüst ───────────────────────────────────────── */
  function dialog(inner, breit) {
    const wrap = document.createElement('div');
    wrap.className = 'sy-dlg';
    wrap.innerHTML = '<div class="sy-dlg-box' + (breit ? ' sy-dlg-box--breit' : '')
      + '" role="dialog" aria-modal="true">' + inner + '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ─── 2. Der Editor ───────────────────────────────────────── */
  const STUFEN = [
    { k: '',     label: 'normal' },
    { k: 'fs-l', label: 'groß' },
    { k: 'fs-s', label: 'klein' }
  ];

  function editor(start) {
    start = start || {};
    return new Promise((resolve) => {
      const w = dialog(
        '<div class="sy-dlg-h"><strong>Aufgabentext</strong>'
        + '<button type="button" class="sy-dlg-x" data-x title="schließen">×</button></div>'
        + '<label class="sy-dlg-l">Überschrift'
        + '<input type="text" class="sy-dlg-in" data-titel maxlength="80" value="' + esc(start.titel || '') + '" '
        + 'placeholder="z. B. Zwei Netze, ein Router"></label>'
        + '<div class="aed-bar" role="toolbar" aria-label="Formatierung">'
        +   '<button type="button" class="aed-b" data-cmd="bold" title="fett"><b>F</b></button>'
        +   '<button type="button" class="aed-b" data-cmd="italic" title="kursiv"><i>K</i></button>'
        +   '<button type="button" class="aed-b" data-cmd="insertUnorderedList" title="Aufzählung">'
        +     '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" '
        +     'stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/>'
        +     '<circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>'
        +   '</button>'
        +   '<button type="button" class="aed-b aed-gr" data-cmd="groesse" title="Schriftgröße des Absatzes: normal → groß → klein">'
        +     'Aa <span data-stufe>normal</span></button>'
        + '</div>'
        + '<div class="aed-feld auf-b" contenteditable="true" spellcheck="true" data-feld></div>'
        + '<div class="sy-dlg-f">'
        +   '<button type="button" class="tbtn" data-x>Abbrechen</button>'
        +   '<button type="button" class="tbtn tbtn--prim" data-ok>Übernehmen</button>'
        + '</div>', true);

      const feld  = w.querySelector('[data-feld]');
      const titel = w.querySelector('[data-titel]');
      const stufe = w.querySelector('[data-stufe]');
      feld.innerHTML = reinigen(start.aufgabe) || '<p><br></p>';
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* alt */ }

      /* Der Absatz, in dem die Einfügemarke steht. Nur Absätze und
         Listenpunkte tragen eine Größe — ein <strong> mittendrin
         ist kein Ort für „dieser Absatz ist groß". */
      function block() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let n = sel.getRangeAt(0).startContainer;
        if (n.nodeType === 3) n = n.parentNode;
        if (!feld.contains(n)) return null;
        const b = n.closest && n.closest('p, li');
        if (b && feld.contains(b)) return b;
        // Nackter Text direkt im Feld: erst in einen Absatz packen.
        try { document.execCommand('formatBlock', false, 'p'); } catch (e) { /* egal */ }
        return block2();
      }
      function block2() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let n = sel.getRangeAt(0).startContainer;
        if (n.nodeType === 3) n = n.parentNode;
        const b = n.closest && n.closest('p, li');
        return b && feld.contains(b) ? b : null;
      }
      function stufeVon(b) {
        if (!b) return 0;
        for (let i = 1; i < STUFEN.length; i++) if (b.classList.contains(STUFEN[i].k)) return i;
        return 0;
      }
      function zeigeStufe() { stufe.textContent = STUFEN[stufeVon(block2())].label; }

      const bar = w.querySelector('.aed-bar');
      // mousedown statt click: sonst ist die Auswahl im Feld weg,
      // bevor der Befehl ankommt.
      bar.addEventListener('mousedown', (e) => { if (e.target.closest('.aed-b')) e.preventDefault(); });
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('.aed-b');
        if (!b) return;
        feld.focus();
        if (b.dataset.cmd === 'groesse') {
          const blk = block();
          if (!blk) return;
          const i = (stufeVon(blk) + 1) % STUFEN.length;
          STUFEN.forEach(s => s.k && blk.classList.remove(s.k));
          if (STUFEN[i].k) blk.classList.add(STUFEN[i].k);
          zeigeStufe();
          return;
        }
        try { document.execCommand(b.dataset.cmd, false, null); } catch (err) { /* egal */ }
      });
      document.addEventListener('selectionchange', zeigeStufe);

      function fertig(val) {
        document.removeEventListener('selectionchange', zeigeStufe);
        w.remove();
        resolve(val);
      }
      w.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]')) fertig(null);
        else if (e.target.closest('[data-ok]')) {
          let html = reinigen(feld.innerHTML);
          // Ein Feld, in dem nur ein leerer Absatz steht, ist leer.
          if (!feld.textContent.trim()) html = '';
          fertig({ titel: titel.value.trim(), aufgabe: html });
        }
      });
      w.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fertig(null); } });
      setTimeout(() => feld.focus(), 0);
    });
  }

  /* ─── 3. Kleine Dialoge ───────────────────────────────────── */
  /* frage({ titel, text, knoepfe: [{ id, label, prim }] }) → id | null */
  function frage(o) {
    return new Promise((resolve) => {
      const w = dialog(
        '<div class="sy-dlg-h"><strong>' + esc(o.titel) + '</strong>'
        + '<button type="button" class="sy-dlg-x" data-x title="schließen">×</button></div>'
        + (o.text ? '<p class="sy-dlg-t">' + o.text + '</p>' : '')
        + '<div class="sy-dlg-wahl">'
        + o.knoepfe.map(k => '<button type="button" class="sy-wahl' + (k.prim ? ' is-prim' : '') + '" data-id="'
            + esc(k.id) + '"><strong>' + esc(k.label) + '</strong>'
            + (k.sub ? '<span>' + esc(k.sub) + '</span>' : '') + '</button>').join('')
        + '</div>');
      function fertig(v) { w.remove(); resolve(v); }
      w.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (b) fertig(b.dataset.id);
        else if (e.target.closest('[data-x]') || e.target === w) fertig(null);
      });
      w.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fertig(null); } });
      const erst = w.querySelector('.sy-wahl');
      if (erst) setTimeout(() => erst.focus(), 0);
    });
  }

  /* name({ vorschlag, ueberschreiben }) → { name, neu } | null
     `ueberschreiben`: das geladene Szenario gehört schon der
     Lehrkraft — dann gibt es zwei Wege hinaus. */
  function name(o) {
    return new Promise((resolve) => {
      const w = dialog(
        '<div class="sy-dlg-h"><strong>Als Szenario speichern</strong>'
        + '<button type="button" class="sy-dlg-x" data-x title="schließen">×</button></div>'
        + '<label class="sy-dlg-l">Name des Szenarios'
        + '<input type="text" class="sy-dlg-in" data-name maxlength="80" value="' + esc(o.vorschlag || '') + '"></label>'
        + '<p class="sy-dlg-t dim">Eigene Szenarien hängen an dir, nicht am Raum — du findest sie in jedem '
        + 'neuen Raum unter <strong>Eigene</strong> wieder.</p>'
        + '<div class="sy-dlg-f">'
        +   '<button type="button" class="tbtn" data-x>Abbrechen</button>'
        +   (o.ueberschreiben ? '<button type="button" class="tbtn" data-ok="ueber">Überschreiben</button>' : '')
        +   '<button type="button" class="tbtn tbtn--prim" data-ok="neu">'
        +     (o.ueberschreiben ? 'Als neues speichern' : 'Speichern') + '</button>'
        + '</div>');
      const inp = w.querySelector('[data-name]');
      function fertig(v) { w.remove(); resolve(v); }
      function ok(modus) {
        const n = inp.value.trim();
        if (!n) { inp.focus(); inp.classList.add('is-err'); return; }
        fertig({ name: n, neu: modus !== 'ueber' });
      }
      w.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ok]');
        if (b) ok(b.dataset.ok);
        else if (e.target.closest('[data-x]')) fertig(null);
      });
      w.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); fertig(null); }
        // Enter legt immer NEU an: Überschreiben ist der Weg, der
        // etwas kostet, und der braucht einen gezielten Tipp.
        else if (e.key === 'Enter' && e.target === inp) ok('neu');
      });
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    });
  }

  window.Aufgabe = { reinigen, editor, frage, name };
})();
