/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — editor.js   ·   Fragen-Editor für Lehrkräfte
   ══════════════════════════════════════════════════════════════
   Wird von tool.js bei Bedarf nachgeladen (wie creatures.js).
   Exportiert window.KSEditor = { build, css }.

   Drei Ansichten:
     list     Katalog-Übersicht, gruppiert nach Fach (subject)
     edit     Visueller Fragen-Editor mit Drag & Drop
     preview  Beamer-Vorschau einer einzelnen Frage

   Der Editor lebt INNERHALB des ks-stage und nutzt dieselben
   --ks-* Variablen. Er hat keinen eigenen Takt — die Lobby pollt
   weiter, und der Editor sperrt nur das Beamer-Bild.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Vorgabe-Fächer ─── */
  const FAECHER = [
    'Alles Mögliche', 'Mathematik', 'Deutsch', 'Englisch',
    'Informatik', 'Biologie', 'Geschichte', 'Geografie',
    'Physik', 'Chemie', 'Musik', 'Kunst', 'Sport',
    'Politik', 'Religion', 'Tablet-Schulung'
  ];

  const esc = s => String(s || '').replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const LABELS = ['A', 'B', 'C', 'D'];

  /* ═══════════════════════════════════════════════════════════
     1) KATALOG-ÜBERSICHT (list)
     ═══════════════════════════════════════════════════════════ */
  function buildList(catalogs) {
    // Nach Fach gruppieren
    const gruppen = new Map();
    for (const c of catalogs) {
      const fach = c.subject || 'Alles Mögliche';
      if (!gruppen.has(fach)) gruppen.set(fach, []);
      gruppen.get(fach).push(c);
    }

    let h = `
      <div class="kse-wrap">
        <header class="kse-head">
          <h1 class="kse-h1">📚 Quiz-Kataloge</h1>
          <div class="kse-headr">
            <button type="button" class="kse-btn kse-btn--gruen" data-ed="new">
              + Neues Quiz
            </button>
            <button type="button" class="kse-btn kse-btn--cyan" data-ed="imp-open"
                    title="Fragen aus Text einfügen — Copy &amp; Paste">
              📋 Aus Text
            </button>
            <button type="button" class="kse-btn kse-btn--soft" data-ed="close">
              ← Zurück
            </button>
          </div>
        </header>
        <div class="kse-list">`;

    if (gruppen.size === 0) {
      h += '<p class="kse-leer">Noch keine Kataloge. Erstelle dein erstes Quiz!</p>';
    }

    for (const [fach, kats] of gruppen) {
      h += `<div class="kse-gruppe">
        <h2 class="kse-fach">${esc(fach)}</h2>
        <div class="kse-karten">`;
      for (const c of kats) {
        h += `
          <div class="kse-karte${c.is_template ? ' kse-karte--tmpl' : ''}">
            <div class="kse-karte-body">
              <h3 class="kse-ktitel">${esc(c.title)}</h3>
              <span class="kse-kinfo">${c.count} ${c.count === 1 ? 'Frage' : 'Fragen'}</span>
              ${c.is_template ? '<span class="kse-tag">Vorlage</span>' : ''}
            </div>
            <div class="kse-karte-acts">
              <button type="button" class="kse-btn kse-btn--small kse-btn--cyan"
                      data-ed="play" data-cat="${esc(c.id)}"
                      title="Diesen Katalog im Raum verwenden">▶ Spielen</button>
              <button type="button" class="kse-btn kse-btn--small"
                      data-ed="edit" data-cat="${esc(c.id)}"
                      title="Bearbeiten">✏️</button>
              ${!c.is_template && c.mine ? `
                <button type="button" class="kse-btn kse-btn--small kse-btn--rot"
                        data-ed="del" data-cat="${esc(c.id)}" data-title="${esc(c.title)}"
                        title="Löschen">🗑</button>` : ''}
            </div>
          </div>`;
      }
      h += '</div></div>';
    }

    h += '</div></div>';
    return h;
  }


  /* ═══════════════════════════════════════════════════════════
     2) VISUELLER EDITOR (edit)
     ═══════════════════════════════════════════════════════════ */
  function buildEditor(catalog) {
    const qs = catalog.questions || [];
    const title = catalog.title || '';
    const subject = catalog.subject || 'Alles Mögliche';
    const isNew = !catalog.catalog_id;

    // Fach-Options
    const fachOpts = FAECHER.map(f =>
      '<option value="' + esc(f) + '"' + (f === subject ? ' selected' : '') + '>'
      + esc(f) + '</option>'
    ).join('');
    // Falls das Fach nicht in der Liste ist
    const customFach = !FAECHER.includes(subject) && subject
      ? '<option value="' + esc(subject) + '" selected>' + esc(subject) + '</option>'
      : '';

    let h = `
      <div class="kse-wrap">
        <header class="kse-head">
          <div class="kse-headl">
            <input type="text" class="kse-input kse-input--titel" data-ed-field="title"
                   value="${esc(title)}" placeholder="Quiz-Titel eingeben…" />
            <select class="kse-select" data-ed-field="subject">
              ${customFach}${fachOpts}
            </select>
          </div>
          <div class="kse-headr">
            <button type="button" class="kse-btn kse-btn--cyan" data-ed="imp-open-append"
                    title="Weitere Fragen aus Text einfügen">📋 Aus Text</button>
            <button type="button" class="kse-btn kse-btn--soft" data-ed="preview"
                    title="Vorschau">👁️ Vorschau</button>
            <button type="button" class="kse-btn kse-btn--gruen" data-ed="save"
                    title="Speichern">💾 Speichern</button>
            <button type="button" class="kse-btn kse-btn--soft" data-ed="back"
                    title="Zurück zur Übersicht">← Zurück</button>
          </div>
        </header>
        <div class="kse-fragen" data-ed-list="questions">`;

    for (let i = 0; i < qs.length; i++) {
      h += frageKarte(qs[i], i);
    }

    h += `</div>
        <div class="kse-add-wrap">
          <button type="button" class="kse-btn kse-btn--add" data-ed="addq">
            + Frage hinzufügen
          </button>
        </div>
      </div>`;

    return h;
  }

  function frageKarte(q, idx) {
    const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];
    // correct_indices hat Vorrang, Fallback auf correct_idx
    const ci = Array.isArray(q.correct_indices) && q.correct_indices.length > 0
      ? q.correct_indices
      : (q.correct_idx != null ? [q.correct_idx] : [0]);

    return `
      <div class="kse-frage" draggable="true" data-qi="${idx}">
        <div class="kse-frage-griff" title="Zum Verschieben ziehen">⠿</div>
        <div class="kse-frage-body">
          <div class="kse-frage-head">
            <span class="kse-fnr">Frage ${idx + 1}</span>
            <button type="button" class="kse-btn kse-btn--del" data-ed="delq" data-qi="${idx}"
                    title="Frage löschen">−</button>
          </div>
          <textarea class="kse-input kse-ftext" data-qi="${idx}" data-field="question_text"
                    placeholder="Fragetext eingeben…" rows="2">${esc(q.question_text || '')}</textarea>
          <div class="kse-optionen">
            ${opts.map((o, oi) => `
              <div class="kse-opt kse-opt--${oi}">
                <span class="kse-olabel">${LABELS[oi]}</span>
                <input type="text" class="kse-input kse-oinput" data-qi="${idx}" data-oi="${oi}"
                       data-field="option" value="${esc(o)}" placeholder="Antwort ${LABELS[oi]}…" />
                <button type="button" class="kse-haken${ci.includes(oi) ? ' is-richtig' : ''}"
                        data-qi="${idx}" data-oi="${oi}" data-ed="toggle"
                        title="Als richtig markieren">
                  ${ci.includes(oi) ? '✅' : '⬜'}
                </button>
              </div>
            `).join('')}
          </div>
          <div class="kse-frage-meta">
            <label class="kse-meta-label">⏱
              <input type="number" class="kse-input kse-input--mini" data-qi="${idx}"
                     data-field="time_limit_sec" value="${q.time_limit_sec || 20}" min="5" max="120" />
              Sek.
            </label>
            <label class="kse-meta-label">💡
              <input type="text" class="kse-input kse-input--expl" data-qi="${idx}"
                     data-field="explanation" value="${esc(q.explanation || '')}"
                     placeholder="Erklärung (optional)…" />
            </label>
          </div>
        </div>
      </div>`;
  }


  /* ═══════════════════════════════════════════════════════════
     3) BEAMER-VORSCHAU (preview)
     ═══════════════════════════════════════════════════════════ */
  function buildPreview(q, idx, total) {
    const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];
    const ci = Array.isArray(q.correct_indices) && q.correct_indices.length > 0
      ? q.correct_indices
      : (q.correct_idx != null ? [q.correct_idx] : [0]);

    return `
      <div class="kse-wrap kse-wrap--preview">
        <header class="kse-head">
          <span class="kse-fnr">Vorschau — Frage ${idx + 1} / ${total}</span>
          <div class="kse-headr">
            <button type="button" class="kse-btn kse-btn--soft" data-ed="prev-q"
                    ${idx <= 0 ? 'disabled' : ''}>◀</button>
            <button type="button" class="kse-btn kse-btn--soft" data-ed="next-q"
                    ${idx >= total - 1 ? 'disabled' : ''}>▶</button>
            <button type="button" class="kse-btn kse-btn--soft" data-ed="back-edit">
              ← Zum Editor
            </button>
          </div>
        </header>
        <div class="kse-pv-qbox">
          <h2 class="kse-pv-q" contenteditable="true" data-ed-pv="text">${esc(q.question_text || '(Kein Text)')}</h2>
        </div>
        <div class="kse-pv-kacheln">
          ${opts.map((o, i) => `
            <div class="kse-pv-k kse-pv-k--${i} ${ci.includes(i) ? 'is-richtig' : ''}">
              <span class="kse-pv-kk">${ci.includes(i) ? '✅' : LABELS[i]}</span>
              <span class="kse-pv-kt" contenteditable="true"
                    data-ed-pv="opt" data-oi="${i}">${esc(o || '…')}</span>
            </div>
          `).join('')}
        </div>
        ${q.explanation ? '<p class="kse-pv-expl">💡 ' + esc(q.explanation) + '</p>' : ''}
      </div>`;
  }



  /* ═══════════════════════════════════════════════════════════
     3b) TEXT-IMPORT (import) — Copy & Paste, live erkannt
     ═══════════════════════════════════════════════════════════ */
  /* Deckungsgleiche Zweitschicht hinter dem Textfeld: jede Rohzeile in
     einem Span, nur Hintergrund (kein Padding, keine Schrift — sonst
     verrutscht der Umbruch gegenüber dem Textfeld). */
  function importOverlay(text, parsed) {
    const raw = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const qs = parsed.questions;
    return raw.map((ln, i) => {
      const info = parsed.lines[i] || { kind: 'n', qi: -1 };
      const q = info.qi >= 0 ? qs[info.qi] : null;
      let cls = 'kse-hl-' + info.kind;
      if (q && q.status !== 'ok' && (info.kind === 'q')) cls += ' kse-hl-warn';
      return '<span class="' + cls + '">' + esc(ln) + '</span>';
    }).join('\n') + '\n​';
  }

  function importResult(parsed) {
    const st = parsed.stats;
    if (!st.questions) {
      return '<p class="kse-leer kse-leer--klein">Hier erscheint, was erkannt wurde, sobald du etwas eingibst.</p>';
    }
    let h = '<div class="kse-imp-sum">'
      + '<span class="kse-chip">' + st.questions + (st.questions === 1 ? ' Frage' : ' Fragen') + '</span>'
      + '<span class="kse-chip">' + st.answers + (st.answers === 1 ? ' Antwort' : ' Antworten') + '</span>';
    if (st.onlyQuestions) h += '<span class="kse-chip kse-chip--info">' + st.onlyQuestions + ' nur Frage</span>';
    if (st.noCorrect) h += '<span class="kse-chip kse-chip--warn">' + st.noCorrect + ' ohne Richtig-Markierung</span>';
    h += '</div>';
    h += parsed.questions.map((q, i) => {
      const filled = q.options.map((o, oi) => ({ o, oi })).filter(x => x.o);
      return '<div class="kse-imp-q' + (q.status === 'ok' ? '' : ' is-hinweis') + '">'
        + '<div class="kse-imp-qt"><b>' + (i + 1) + '.</b> '
        + (q.question_text ? esc(q.question_text) : '<i>(Fragetext fehlt)</i>') + '</div>'
        + (filled.length
          ? '<ul class="kse-imp-ans">' + filled.map(x =>
              '<li class="' + (q.correct_indices.includes(x.oi) && q.status !== 'keine-richtige' ? 'is-richtig' : '') + '">'
              + '<span class="kse-olabel">' + LABELS[x.oi] + '</span>' + esc(x.o)
              + (q.correct_indices.includes(x.oi) && q.status !== 'keine-richtige' ? ' ✅' : '') + '</li>').join('')
            + '</ul>'
          : '')
        + (q.explanation ? '<div class="kse-imp-ex">💡 ' + esc(q.explanation) + '</div>' : '')
        + q.notes.map(n => '<div class="kse-imp-note">⚠ ' + esc(n) + '</div>').join('')
        + '</div>';
    }).join('');
    return h;
  }

  function buildImport(state, parsed) {
    const isNew = state.mode === 'new';
    const subject = state.subject || 'Alles Mögliche';
    const fachOpts = FAECHER.map(f =>
      '<option value="' + esc(f) + '"' + (f === subject ? ' selected' : '') + '>' + esc(f) + '</option>').join('');
    const n = parsed.stats.questions;

    return `
      <div class="kse-wrap kse-wrap--import">
        <header class="kse-head">
          <h1 class="kse-h1">📋 Quiz aus Text${isNew ? '' : ' ergänzen'}</h1>
          <div class="kse-headr">
            <button type="button" class="kse-btn kse-btn--gruen" data-ed="imp-apply"
                    data-imp="apply" ${n ? '' : 'disabled'}>
              ✔ Übernehmen${n ? ' (' + n + ')' : ''}
            </button>
            <button type="button" class="kse-btn kse-btn--soft" data-ed="imp-back">← Zurück</button>
          </div>
        </header>

        <div class="kse-imp-info">
          <b>So klappt's am besten:</b>
          Fragen nummerieren (<code>1.</code> <code>2.</code> …), Antworten mit Buchstaben
          (<code>a)</code> <code>b)</code> …). Die richtige Antwort mit <code>*</code> oder <code>✓</code>
          dahinter, oder als Zeile <code>Lösung: b</code>.
          Eine Erklärung (wird nach der Antwort am Beamer gezeigt) kommt als eigene Zeile
          darunter: <code>Erklärung: …</code>.
          <span class="kse-imp-offen">Aber nichts davon ist Pflicht: Der Text wird großzügig gelesen —
          fehlende Nummern, andere Zeichen, Zeilenumbrüche oder nur Fragen ohne Antworten gehen auch.
          Nach dem Übernehmen kannst du alles noch Feld für Feld anpassen.</span>
        </div>

        <div class="kse-imp-meta">
          ${isNew ? `
            <input type="text" class="kse-input kse-input--titel" data-imp="title"
                   value="${esc(state.title || '')}" placeholder="Quiz-Titel (oder oben im Text: „Quiz: …")" />
            <select class="kse-select" data-imp="subject">${fachOpts}</select>` : ''}
          <button type="button" class="kse-btn kse-btn--small kse-btn--soft" data-ed="imp-example">Beispiel einfügen</button>
          <button type="button" class="kse-btn kse-btn--small kse-btn--soft" data-ed="imp-clear">Leeren</button>
        </div>

        <div class="kse-imp-grid">
          <div class="kse-imp-edit">
            <div class="kse-imp-legende">
              <span class="kse-hl-q">Frage</span>
              <span class="kse-hl-a">Antwort</span>
              <span class="kse-hl-c">richtig</span>
              <span class="kse-hl-expl">Erklärung</span>
            </div>
            <div class="kse-imp-box">
              <div class="kse-imp-back" data-imp="overlay" aria-hidden="true">${importOverlay(state.text, parsed)}</div>
              <textarea class="kse-imp-ta" data-imp="text" spellcheck="false" rows="12"
                        placeholder="Hier Text einfügen oder tippen …&#10;&#10;1. Wie heißt die Hauptstadt von Frankreich?&#10;a) Berlin&#10;b) Paris *&#10;c) Rom">${esc(state.text || '')}</textarea>
            </div>
          </div>
          <div class="kse-imp-out" data-imp="result">${importResult(parsed)}</div>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     4) CSS (eingefügt in <style> bei Bedarf)
     ═══════════════════════════════════════════════════════════ */
  const CSS = `
/* ── Editor Wrapper ── */
.kse-wrap {
  max-width: 900px; margin: 0 auto; width: 100%;
  display: flex; flex-direction: column; gap: 16px;
  padding: 10px 0;
}
.kse-head {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 10px; padding-bottom: 10px;
  border-bottom: 2px solid var(--ks-linie);
}
.kse-headl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.kse-headr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kse-h1 { font-size: 22px; font-weight: 900; margin: 0; color: var(--ks-ink); }

/* ── Buttons ── */
.kse-btn {
  font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 13px;
  cursor: pointer; border: 2px solid var(--ks-kante); border-radius: 12px;
  box-shadow: 3px 3px 0 0 var(--ks-kante); padding: 7px 14px;
  background: var(--ks-erhoben); color: var(--ks-ink);
  transition: transform .1s, box-shadow .1s; user-select: none;
  display: inline-flex; align-items: center; gap: 6px;
}
.kse-btn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 0 var(--ks-kante); }
.kse-btn--gruen { background: var(--ks-gruen); color: #fff; }
.kse-btn--cyan  { background: var(--ks-cyan); color: #000; }
.kse-btn--rot   { background: var(--ks-rot); color: #fff; }
.kse-btn--soft  { background: var(--ks-erhoben); }
.kse-btn--small { font-size: 12px; padding: 5px 10px; }
.kse-btn--add {
  width: 100%; padding: 14px; font-size: 15px;
  background: var(--ks-tief); border-style: dashed;
}
.kse-btn--del {
  background: var(--ks-rot); color: #fff; border-radius: 50%;
  width: 28px; height: 28px; padding: 0; font-size: 18px;
  display: flex; align-items: center; justify-content: center;
}

/* ── Inputs ── */
.kse-input {
  font-family: inherit; font-size: 14px; font-weight: 600;
  background: var(--ks-tief); color: var(--ks-ink);
  border: 2px solid var(--ks-linie); border-radius: 10px;
  padding: 8px 12px; box-sizing: border-box; width: 100%;
}
.kse-input:focus { border-color: var(--ks-gold); outline: none; }
.kse-input--titel { font-size: 18px; font-weight: 800; max-width: 400px; }
.kse-input--mini { width: 60px; text-align: center; }
.kse-input--expl { flex: 1; }
.kse-select {
  font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700;
  background: var(--ks-tief); color: var(--ks-ink);
  border: 2px solid var(--ks-linie); border-radius: 10px;
  padding: 6px 10px; cursor: pointer;
}

/* ── Katalog-Liste ── */
.kse-list { display: flex; flex-direction: column; gap: 20px; }
.kse-leer { color: var(--ks-soft); text-align: center; padding: 40px 0; font-size: 16px; }
.kse-gruppe { }
.kse-fach {
  font-size: 15px; font-weight: 800; color: var(--ks-soft);
  text-transform: uppercase; letter-spacing: .05em;
  margin: 0 0 8px; padding-bottom: 4px;
  border-bottom: 1px solid var(--ks-linie);
}
.kse-karten { display: flex; flex-direction: column; gap: 8px; }
.kse-karte {
  background: var(--ks-flaeche); border: 2px solid var(--ks-linie);
  border-radius: 14px; padding: 12px 16px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.kse-karte--tmpl { border-left: 4px solid var(--ks-gold); }
.kse-karte-body { flex: 1; min-width: 180px; }
.kse-ktitel { font-size: 15px; font-weight: 800; margin: 0 0 2px; color: var(--ks-ink); }
.kse-kinfo { font-size: 12px; color: var(--ks-soft); }
.kse-tag {
  display: inline-block; font-size: 10px; font-weight: 800;
  background: var(--ks-goldf); color: var(--ks-goldt);
  padding: 2px 8px; border-radius: 6px; margin-left: 6px;
  text-transform: uppercase;
}
.kse-karte-acts { display: flex; gap: 6px; flex-shrink: 0; }

/* ── Fragen-Editor ── */
.kse-fragen { display: flex; flex-direction: column; gap: 12px; }
.kse-frage {
  background: var(--ks-flaeche); border: 2px solid var(--ks-linie);
  border-radius: 16px; padding: 0;
  display: flex; gap: 0; overflow: hidden;
  transition: box-shadow .15s, border-color .15s;
}
.kse-frage.is-dragging { opacity: .5; border-color: var(--ks-gold); }
.kse-frage.is-over { box-shadow: 0 -3px 0 0 var(--ks-gold); }

.kse-frage-griff {
  display: flex; align-items: center; justify-content: center;
  width: 36px; min-height: 100%; background: var(--ks-tief);
  cursor: grab; font-size: 16px; color: var(--ks-soft);
  flex-shrink: 0; user-select: none; border-right: 1px solid var(--ks-linie);
}
.kse-frage-griff:active { cursor: grabbing; }

.kse-frage-body { flex: 1; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.kse-frage-head {
  display: flex; align-items: center; justify-content: space-between;
}
.kse-fnr { font-size: 13px; font-weight: 800; color: var(--ks-soft); }
.kse-ftext { resize: vertical; min-height: 44px; font-weight: 700; }

/* ── Antwort-Optionen ── */
.kse-optionen { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
@media (max-width: 600px) { .kse-optionen { grid-template-columns: 1fr; } }
.kse-opt {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-radius: 12px; border: 2px solid transparent;
}
.kse-opt--0 { background: rgba(225,29,72,.15); border-color: rgba(225,29,72,.3); }
.kse-opt--1 { background: rgba(37,99,235,.15); border-color: rgba(37,99,235,.3); }
.kse-opt--2 { background: rgba(234,179,8,.15); border-color: rgba(234,179,8,.3); }
.kse-opt--3 { background: rgba(5,150,105,.15); border-color: rgba(5,150,105,.3); }

.kse-olabel {
  font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 900;
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.15); border-radius: 8px; flex-shrink: 0;
  color: var(--ks-ink);
}
.kse-oinput { flex: 1; border: none; background: transparent; padding: 6px 8px;
  color: var(--ks-ink); font-weight: 700; }
.kse-oinput:focus { outline: none; background: var(--ks-tief); border-radius: 8px; }

.kse-haken {
  cursor: pointer; border: none; background: none; font-size: 20px;
  padding: 4px; border-radius: 8px; transition: transform .1s;
}
.kse-haken:hover { transform: scale(1.2); }
.kse-haken.is-richtig { background: var(--ks-gruenf); }

.kse-frage-meta {
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
}
.kse-meta-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 700; color: var(--ks-soft);
}
.kse-add-wrap { padding: 4px 0; }

/* ── Vorschau ── */
.kse-wrap--preview { max-width: 960px; }
.kse-pv-qbox {
  background: var(--ks-flaeche); border: 3px solid var(--ks-qrahmen);
  border-radius: 20px; padding: 24px 28px; text-align: center;
  box-shadow: 5px 5px 0 0 var(--ks-kante);
}
.kse-pv-q {
  font-size: 24px; font-weight: 800; line-height: 1.35; margin: 0;
  outline: none; min-height: 1em;
}
.kse-pv-q:focus { border-bottom: 2px dashed var(--ks-gold); }
.kse-pv-kacheln { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 600px) { .kse-pv-kacheln { grid-template-columns: 1fr; } }
.kse-pv-k {
  border: 3px solid #000; border-radius: 18px;
  padding: 16px 20px; display: flex; align-items: center; gap: 14px;
  font-size: 18px; font-weight: 800; color: #fff;
  box-shadow: 4px 4px 0 0 #000;
}
.kse-pv-k--0 { background: var(--ks-a0); }
.kse-pv-k--1 { background: var(--ks-a1); }
.kse-pv-k--2 { background: var(--ks-a2); }
.kse-pv-k--3 { background: var(--ks-a3); }
.kse-pv-k.is-richtig { outline: 4px solid var(--ks-cyan); }
.kse-pv-kk {
  font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 900;
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.25); border-radius: 10px; flex-shrink: 0;
}
.kse-pv-kt { flex: 1; outline: none; }
.kse-pv-kt:focus { border-bottom: 2px dashed rgba(255,255,255,.5); }
.kse-pv-expl {
  font-size: 15px; font-weight: 600; color: var(--ks-gruent);
  background: var(--ks-gruenf); padding: 10px 16px; border-radius: 12px;
}
/* ── Text-Import ── */
.kse-wrap--import { max-width: 1100px; }
.kse-imp-info {
  background: var(--ks-goldf); color: var(--ks-ink); border: 2px solid var(--ks-gold);
  border-radius: 12px; padding: 10px 14px; font-size: 13px; line-height: 1.5;
}
.kse-imp-info code {
  font-family: 'JetBrains Mono', monospace; background: rgba(0,0,0,.12);
  padding: 0 5px; border-radius: 5px;
}
.kse-imp-offen { display: block; margin-top: 4px; color: var(--ks-soft); }
.kse-imp-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.kse-imp-meta .kse-input--titel { flex: 1; min-width: 200px; font-size: 15px; }
.kse-imp-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; align-items: start; }
@media (max-width: 800px) { .kse-imp-grid { grid-template-columns: 1fr; } }
.kse-imp-legende { display: flex; gap: 6px; font-size: 11px; font-weight: 800; margin-bottom: 6px; flex-wrap: wrap; }
.kse-imp-legende span { padding: 1px 8px; border-radius: 6px; color: var(--ks-ink); }

/* Zwei Schichten in EINER Gitterzelle: Rückseite bestimmt die Höhe,
   das Textfeld füllt sie. Gleiche Schrift, gleiche Ränder, kein Scrollen. */
.kse-imp-box {
  display: grid; background: var(--ks-tief); border: 2px solid var(--ks-linie);
  border-radius: 12px; overflow: hidden; min-height: 280px;
}
.kse-imp-box:focus-within { border-color: var(--ks-gold); }
.kse-imp-back, .kse-imp-ta {
  grid-area: 1 / 1; margin: 0; padding: 12px 14px; border: 0; box-sizing: border-box;
  font: 600 14px/1.65 'JetBrains Mono', ui-monospace, monospace;
  letter-spacing: 0; tab-size: 4;
  white-space: pre-wrap; overflow-wrap: break-word; word-break: normal;
  width: 100%;
}
.kse-imp-back { color: transparent; pointer-events: none; }
.kse-imp-ta {
  background: transparent; color: var(--ks-ink); resize: none; overflow: hidden;
  outline: none; height: 100%; caret-color: var(--ks-gold);
}
.kse-hl-q, .kse-hl-title { background: rgba(37,99,235,.28); }
.kse-hl-a    { background: rgba(168,85,247,.20); }
.kse-hl-c    { background: rgba(5,150,105,.35); }
.kse-hl-expl { background: rgba(234,179,8,.25); }
.kse-hl-sol, .kse-hl-key { background: rgba(5,150,105,.20); }
.kse-hl-title { background: rgba(37,99,235,.14); }
.kse-hl-warn { text-decoration: underline wavy rgba(225,29,72,.9); text-decoration-color: rgba(225,29,72,.9); }

.kse-imp-out { display: flex; flex-direction: column; gap: 8px; }
.kse-leer--klein { font-size: 13px; padding: 20px 0; }
.kse-imp-sum { display: flex; gap: 6px; flex-wrap: wrap; }
.kse-chip {
  font-size: 12px; font-weight: 800; padding: 3px 10px; border-radius: 999px;
  background: var(--ks-gruenf); color: var(--ks-gruent);
}
.kse-chip--info { background: rgba(37,99,235,.2); color: var(--ks-ink); }
.kse-chip--warn { background: rgba(225,29,72,.2); color: var(--ks-ink); }
.kse-imp-q {
  background: var(--ks-flaeche); border: 2px solid var(--ks-linie); border-radius: 12px;
  padding: 8px 12px; font-size: 13px;
}
.kse-imp-q.is-hinweis { border-color: var(--ks-gold); }
.kse-imp-qt { font-weight: 800; color: var(--ks-ink); }
.kse-imp-ans { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.kse-imp-ans li { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--ks-ink); }
.kse-imp-ans li.is-richtig { color: var(--ks-gruent); font-weight: 800; }
.kse-imp-ans .kse-olabel { width: 22px; height: 22px; font-size: 12px; }
.kse-imp-ex { margin-top: 4px; font-size: 12px; color: var(--ks-gruent); }
.kse-imp-note { margin-top: 4px; font-size: 12px; color: var(--ks-soft); }
`;


  /* ═══════════════════════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════════════════════ */
  window.KSEditor = {
    buildList:    buildList,
    buildEditor:  buildEditor,
    buildPreview: buildPreview,
    buildImport:  buildImport,
    importOverlay: importOverlay,
    importResult: importResult,
    frageKarte:   frageKarte,
    CSS:          CSS
  };
})();
