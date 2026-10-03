/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — editor.js   ·   Fragen-Editor für Lehrkräfte
   ══════════════════════════════════════════════════════════════
   Zwei Gastgeber, ein Editor:
     tool.js     im Raum am Beamer, Lobby → „📚 Editor"; lädt diese
                 Datei bei Bedarf nach (wie creatures.js).
     quiz.js     eigene Seite MPSkills/quiz.html, ohne Raum — der
                 Knopf „Quiz-Editor" auf der Knowledge-Stack-Kachel.
   Exportiert window.KSEditor = { buildList, buildEditor, …,
   create, CSS }. create(opts) (Abschnitt 5) hält Zustand und
   Bedienung; der Gastgeber zeichnet nur und reicht Aufrufe durch.

   Drei Ansichten:
     list     Katalog-Übersicht, gruppiert nach Fach (subject)
     edit     Visueller Fragen-Editor mit Drag & Drop
     preview  Beamer-Vorschau einer einzelnen Frage

   Fotos: eins je Frage (q.image als data:-URL, q.image_name). Im
   Editor hinten an der Karte, in der Vorschau groß über den Kacheln.
   Im Text-Import gibt es keine Fotos. Auf dem Tablet nie.

   Der Editor lebt INNERHALB eines ks-stage und nutzt dieselben
   --ks-* Variablen (tool.css). Er hat keinen eigenen Takt — im Raum
   pollt die Lobby weiter, und der Editor sperrt nur das Beamer-Bild.

   Vorlagen (fremde Kataloge) öffnet „⧉ Kopie": Speichern legt dann
   einen eigenen Katalog an, die Vorlage bleibt unverändert.
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
  /* opts.play  — „▶ Spielen" anbieten (nur im Raum: dort gibt es ein
                  Brett, in das der Katalog geladen werden kann).
     opts.close — Aufschrift des Zurück-Knopfs. */
  function buildList(catalogs, opts) {
    opts = opts || {};
    const play = opts.play !== false;
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
              ${esc(opts.close || '← Zurück')}
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
        // Sichtbar sind nur Vorlagen und Eigenes (ks_catalogs_list,
        // ks_room_get) — was nicht meins ist, ist eine Vorlage. Die
        // Raumansicht schickt is_template gar nicht mit.
        const vorlage = c.is_template || !c.mine;
        h += `
          <div class="kse-karte${vorlage ? ' kse-karte--tmpl' : ''}">
            <div class="kse-karte-body">
              <h3 class="kse-ktitel">${esc(c.title)}</h3>
              <span class="kse-kinfo">${c.count} ${c.count === 1 ? 'Frage' : 'Fragen'}</span>
              ${vorlage ? '<span class="kse-tag">Vorlage</span>' : ''}
            </div>
            <div class="kse-karte-acts">
              ${play ? `
                <button type="button" class="kse-btn kse-btn--small kse-btn--cyan"
                        data-ed="play" data-cat="${esc(c.id)}"
                        title="Diesen Katalog im Raum verwenden">▶ Spielen</button>` : ''}
              ${c.mine ? `
                <button type="button" class="kse-btn kse-btn--small"
                        data-ed="edit" data-cat="${esc(c.id)}"
                        title="Bearbeiten">✏️</button>` : `
                <button type="button" class="kse-btn kse-btn--small"
                        data-ed="edit" data-cat="${esc(c.id)}"
                        title="Als eigene Kopie bearbeiten — die Vorlage bleibt, wie sie ist">⧉ Kopie</button>`}
              ${!vorlage ? `
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
        <div class="kse-foto${q.image ? ' has-bild' : ''}" data-foto="${idx}">${fotoZelle(q, idx)}</div>
      </div>`;
  }

  /* Die Fotospalte hinten an der Fragekarte. Ein Foto je Frage; es
     steht nur am Beamer, nie auf dem Tablet. Hochladen per Knopf ODER
     per Ziehen auf die Karte (tool.js, bindeEditorDnD). Das <input>
     steckt im <label>: so öffnet ein Tipp die Auswahl auch auf dem
     iPad, ohne dass ein Skript .click() rufen muss. */
  function fotoZelle(q, idx) {
    if (q.image) {
      return `
        <img class="kse-foto-mini" src="${esc(q.image)}" alt="" />
        <span class="kse-foto-name" title="${esc(q.image_name || 'Foto')}">${esc(q.image_name || 'Foto')}</span>
        <button type="button" class="kse-btn kse-btn--small kse-btn--rot" data-ed="foto-del"
                data-qi="${idx}" title="Foto entfernen">🗑</button>`;
    }
    return `
      <label class="kse-btn kse-btn--small kse-foto-btn" title="Foto zu dieser Frage hochladen">
        <input type="file" accept="image/*" data-foto-file="${idx}" hidden />📷 Foto
      </label>
      <span class="kse-foto-tipp">oder hierher ziehen</span>`;
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
        ${q.image ? `
          <div class="kse-pv-bild" data-foto="pv">
            <img src="${esc(q.image)}" alt="${esc(q.image_name || 'Foto')}" />
            <div class="kse-pv-bildacts">
              <label class="kse-btn kse-btn--small kse-btn--soft" title="Anderes Foto hochladen">
                <input type="file" accept="image/*" data-foto-file="pv" hidden />📷 Ersetzen
              </label>
              <button type="button" class="kse-btn kse-btn--small kse-btn--rot" data-ed="foto-del"
                      data-qi="pv" title="Foto entfernen">🗑</button>
            </div>
          </div>` : `
          <label class="kse-pv-bildleer" data-foto="pv" title="Foto zu dieser Frage hochladen">
            <input type="file" accept="image/*" data-foto-file="pv" hidden />
            📷 Foto hochladen <span>oder hierher ziehen — erscheint nur am Beamer</span>
          </label>`}
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
/* Die Bühne (.ks-stage) schneidet ab — rollen muss der Editor selbst. */
.ks-stage > .kse-wrap { flex: 1 1 auto; overflow-y: auto; padding: 10px 4px; box-sizing: border-box; }
.kse-wrap > * { flex-shrink: 0; }
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
/* ── Foto je Frage ── */
.kse-foto {
  flex: 0 0 132px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 6px; padding: 10px 8px; text-align: center;
  background: var(--ks-tief); border-left: 1px solid var(--ks-linie);
  font-size: 11px; color: var(--ks-soft);
}
.kse-foto-btn { cursor: pointer; }
.kse-foto-tipp { font-size: 11px; line-height: 1.3; }
.kse-foto-mini {
  width: 100%; max-height: 84px; object-fit: contain; border-radius: 8px;
  background: var(--ks-flaeche);
}
.kse-foto-name {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 700; color: var(--ks-ink);
}
.kse-frage.is-fotoziel, .kse-wrap--preview.is-fotoziel .kse-pv-bild,
.kse-wrap--preview.is-fotoziel .kse-pv-bildleer {
  outline: 3px dashed var(--ks-cyan); outline-offset: 2px;
}
.kse-frage.is-fotoziel .kse-foto { background: rgba(34,211,238,.15); }
.kse-foto.is-laedt::after { content: '⏳'; font-size: 18px; }
@media (max-width: 600px) {
  .kse-frage { flex-wrap: wrap; }
  .kse-frage-body { flex-basis: calc(100% - 36px); }
  .kse-foto { flex: 1 1 100%; flex-direction: row; flex-wrap: wrap; border-left: 0;
              border-top: 1px solid var(--ks-linie); }
  .kse-foto-mini { width: 72px; max-height: 54px; }
}
.kse-pv-bild {
  position: relative; display: flex; justify-content: center; align-items: center;
  background: var(--ks-tief); border: 2px solid var(--ks-linie); border-radius: 16px;
  padding: 8px; min-height: 120px;
}
.kse-pv-bild img { max-width: 100%; max-height: 40vh; object-fit: contain; border-radius: 10px; }
.kse-pv-bildacts { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; }
.kse-pv-bildleer {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  padding: 18px; border: 2px dashed var(--ks-linie2); border-radius: 16px; cursor: pointer;
  font-weight: 800; font-size: 15px; color: var(--ks-ink); background: var(--ks-tief);
}
.kse-pv-bildleer span { font-weight: 600; font-size: 12px; color: var(--ks-soft); }
.kse-pv-bildleer:hover { border-color: var(--ks-cyan); }

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
     5) STEUERUNG — create(opts)
     ═══════════════════════════════════════════════════════════
     Zustand und Bedienung des Editors, ohne zu wissen, WO er steht.
     Zwei Gastgeber:

       tool.js       im Raum, am Beamer (Lobby → „📚 Editor")
       quiz.js       eigene Seite MPSkills/quiz.html, ohne Raum —
                     von der Knowledge-Stack-Kachel aus erreichbar

     Der Gastgeber zeichnet (redraw: html() in seine Fläche, dann
     bind()) und reicht die Serveraufrufe durch. opts:

       call(fn, args)   → Promise<{ok, …}>  ks_catalog_get/_save/_delete
       catalogs()       → die aktuelle Katalogliste
       reloadCatalogs() → Promise, holt die Liste neu
       redraw()         → html() neu einsetzen und bind() rufen
       toast(msg, err) · confirm(msg) → Promise<bool> · errText(code)
       onClose()        → „← Zurück" in der Übersicht
       onPlay(catId)    → Promise<{ok, error}>; fehlt es, gibt es
                          keinen „▶ Spielen"-Knopf
       closeLabel       → Aufschrift des Zurück-Knopfs
     ═══════════════════════════════════════════════════════════ */
  function create(o) {
    // null = zu, 'list' = Katalog-Übersicht, 'edit' = Fragen-Editor,
    // 'import' = Text-Import, 'preview' = Beamer-Vorschau einer Frage.
    let mode = null;
    let data = null;       // { catalog_id, title, subject, questions: [] }
    let pvIdx = 0;         // welche Frage in der Vorschau
    let dirty = false;     // ungespeicherte Änderungen?
    let imp = null;        // Text-Import: { text, mode: 'new'|'append', title, subject }
    let el = null;         // die Fläche, in der der Editor gerade steht
    let dead = false;

    const toast = (m, e) => o.toast && o.toast(m, e);
    const fehler = code => (o.errText ? o.errText(code) : 'Fehler (' + code + ')');
    const redraw = () => { if (!dead) o.redraw(); };

    function reset() { mode = null; data = null; dirty = false; imp = null; pvIdx = 0; }

    function key() {
      return mode ? mode + '|' + (mode === 'preview' ? pvIdx : '-') : null;
    }

    function html() {
      if (mode === 'list')   return buildList(o.catalogs() || [], { play: !!o.onPlay, close: o.closeLabel });
      if (mode === 'edit')   return buildEditor(data || { questions: [] });
      if (mode === 'import') return buildImport(imp, window.KSParse.parse(imp.text));
      if (mode === 'preview') {
        const qs = (data && data.questions) || [];
        const q = qs[pvIdx] || { question_text: '', options: ['', '', '', ''], correct_idx: 0 };
        return buildPreview(q, pvIdx, qs.length);
      }
      return '';
    }

    /* Frageninhalte aus den DOM-Feldern sammeln */
    function sammle() {
      if (!data || !el) return;
      const tInp = el.querySelector('[data-ed-field=title]');
      if (tInp) data.title = tInp.value;
      const sInp = el.querySelector('[data-ed-field=subject]');
      if (sInp) data.subject = sInp.value;
      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i];
        const ft = el.querySelector('[data-qi="' + i + '"][data-field=question_text]');
        if (ft) q.question_text = ft.value;
        for (let oi = 0; oi < 4; oi++) {
          const oinp = el.querySelector('[data-qi="' + i + '"][data-oi="' + oi + '"][data-field=option]');
          if (oinp && Array.isArray(q.options)) q.options[oi] = oinp.value;
        }
        const tl = el.querySelector('[data-qi="' + i + '"][data-field=time_limit_sec]');
        if (tl) q.time_limit_sec = Math.max(5, Math.min(120, parseInt(tl.value, 10) || 20));
        const expl = el.querySelector('[data-qi="' + i + '"][data-field=explanation]');
        if (expl) q.explanation = expl.value || null;
      }
    }

    /* In der Vorschau editierte Texte (contenteditable) zurückschreiben */
    function sammleVorschau() {
      if (!data || !data.questions || !el) return;
      const q = data.questions[pvIdx];
      if (!q) return;
      const qEl = el.querySelector('[data-ed-pv=text]');
      if (qEl) q.question_text = qEl.textContent.trim();
      el.querySelectorAll('[data-ed-pv=opt]').forEach(x => {
        const oi = parseInt(x.dataset.oi, 10);
        if (!isNaN(oi) && Array.isArray(q.options)) q.options[oi] = x.textContent.trim();
      });
      dirty = true;
    }

    /* Drag & Drop für Fragen-Reihenfolge */
    function bindeDnD() {
      const list = el.querySelector('[data-ed-list=questions]');
      if (!list) return;
      let dragIdx = null;

      // Eine Datei von außen (Foto) oder eine Karte von innen?
      const istDatei = ev => !!(ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes('Files'));
      const ziel = ev => ev.target.closest && ev.target.closest('.kse-frage');

      list.addEventListener('dragstart', ev => {
        const card = ev.target.closest('.kse-frage');
        if (!card) return;
        dragIdx = parseInt(card.dataset.qi, 10);
        card.classList.add('is-dragging');
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', String(dragIdx));
      });

      list.addEventListener('dragover', ev => {
        ev.preventDefault();
        const card = ziel(ev);
        if (istDatei(ev)) {
          ev.dataTransfer.dropEffect = card ? 'copy' : 'none';
          list.querySelectorAll('.kse-frage').forEach(c => c.classList.toggle('is-fotoziel', c === card));
          return;
        }
        ev.dataTransfer.dropEffect = 'move';
        list.querySelectorAll('.kse-frage').forEach(c => c.classList.remove('is-over'));
        if (card) card.classList.add('is-over');
      });

      list.addEventListener('dragleave', ev => {
        const card = ziel(ev);
        if (card && !card.contains(ev.relatedTarget)) card.classList.remove('is-over', 'is-fotoziel');
      });

      list.addEventListener('drop', ev => {
        ev.preventDefault();
        list.querySelectorAll('.kse-frage').forEach(c =>
          c.classList.remove('is-dragging', 'is-over', 'is-fotoziel'));
        const card = ziel(ev);
        if (istDatei(ev)) {
          const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
          if (card && f) ladeFotoFuer(card.dataset.qi, f);
          return;
        }
        if (!card || dragIdx == null || !data) return;
        const dropIdx = parseInt(card.dataset.qi, 10);
        if (dragIdx === dropIdx) return;
        // Erst aus DOM-Feldern lesen, dann verschieben
        sammle();
        const qs = data.questions;
        const [moved] = qs.splice(dragIdx, 1);
        qs.splice(dropIdx, 0, moved);
        dirty = true;
        // Neu zeichnen
        redraw();
      });

      list.addEventListener('dragend', () => {
        dragIdx = null;
        list.querySelectorAll('.kse-frage').forEach(c =>
          c.classList.remove('is-dragging', 'is-over'));
      });
    }

    /* ─── Fotos je Frage ─────────────────────────────────────
       Verkleinert im Browser, bevor es zum Server geht: ein Handyfoto
       hat 4–12 MB, am Beamer reichen 1600 Punkte Kantenlänge. JPEG mit
       weißem Grund (ein durchsichtiges PNG würde sonst schwarz). */
    const FOTO_KANTE = 1600;
    const FOTO_MAX = 1400000;     // Zeichen der data:-URL; Server: 1,5 Mio.

    function bildAusDatei(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unlesbar')); };
        img.src = url;
      });
    }

    async function verkleinere(file) {
      const img = await bildAusDatei(file);
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) throw new Error('unlesbar');
      for (const [kante, q] of [[FOTO_KANTE, .85], [1280, .78], [1024, .7], [800, .65]]) {
        const f = Math.min(1, kante / Math.max(w0, h0));
        const c = document.createElement('canvas');
        c.width = Math.round(w0 * f); c.height = Math.round(h0 * f);
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', q);
        if (data.length <= FOTO_MAX) return data;
      }
      throw new Error('zu_gross');
    }

    /* qi ist eine Fragennummer — oder 'pv' für die Frage, die gerade
       in der Vorschau steht. */
    function fotoFrage(qi) {
      if (!data || !data.questions) return null;
      const i = qi === 'pv' ? pvIdx : parseInt(qi, 10);
      return data.questions[i] || null;
    }

    async function ladeFotoFuer(qi, file) {
      if (!file || !/^image\//.test(file.type || '')) {
        toast('Das ist kein Bild. Bitte ein Foto (JPG, PNG …) nehmen.', true); return;
      }
      const zelle = el && el.querySelector('[data-foto="' + qi + '"]');
      if (zelle) zelle.classList.add('is-laedt');
      let data;
      try {
        data = await verkleinere(file);
      } catch (e) {
        if (zelle) zelle.classList.remove('is-laedt');
        toast(e && e.message === 'zu_gross'
          ? 'Das Foto ist zu groß, auch verkleinert. Bitte ein anderes nehmen.'
          : 'Dieses Bild kann der Browser nicht lesen. Bitte als JPG oder PNG speichern.', true);
        return;
      }
      if (dead || !mode) return;
      setzeFoto(qi, { image: data, image_name: file.name || 'Foto' });
    }

    /* Ein Foto setzen oder (foto = null) entfernen. Im Editor wird NUR
       die Fotospalte der Karte neu geschrieben — sonst spränge die Liste
       an den Anfang und alles Getippte müsste erst eingesammelt werden.
       In der Vorschau wird neu gebaut (dort steht das Foto mitten im Bild). */
    function setzeFoto(qi, foto) {
      if (mode === 'preview') sammleVorschau();
      const q = fotoFrage(qi);
      if (!q) return;
      q.image = foto ? foto.image : null;
      q.image_name = foto ? foto.image_name : null;
      dirty = true;
      if (mode === 'preview') { redraw(); return; }
      const zelle = el && el.querySelector('[data-foto="' + qi + '"]');
      if (zelle) {
        zelle.classList.remove('is-laedt');
        zelle.classList.toggle('has-bild', !!q.image);
        zelle.innerHTML = fotoZelle(q, parseInt(qi, 10));
      }
    }

    function schluckeDatei(ev) {
      if (mode && ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes('Files')) {
        ev.preventDefault();
      }
    }

    function onFotoWahl(ev) {
      const inp = ev.target && ev.target.closest && ev.target.closest('[data-foto-file]');
      if (!inp || !mode) return;
      const f = inp.files && inp.files[0];
      if (f) ladeFotoFuer(inp.dataset.fotoFile, f);
      inp.value = '';
    }

    /* In der Vorschau: ein Foto irgendwo auf das Bild ziehen setzt es
       für die Frage, die gerade zu sehen ist. */
    function bindeVorschau() {
      const wrap = el.querySelector('.kse-wrap--preview');
      if (!wrap) return;
      const istDatei = ev => !!(ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes('Files'));
      wrap.addEventListener('dragover', ev => {
        if (!istDatei(ev)) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
        wrap.classList.add('is-fotoziel');
      });
      wrap.addEventListener('dragleave', ev => {
        if (!wrap.contains(ev.relatedTarget)) wrap.classList.remove('is-fotoziel');
      });
      wrap.addEventListener('drop', ev => {
        if (!istDatei(ev)) return;
        ev.preventDefault();
        wrap.classList.remove('is-fotoziel');
        const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (f) ladeFotoFuer('pv', f);
      });
    }

    /* Text-Import: bei jedem Tastendruck neu erkennen und NUR die
       Einfärbung und die Ergebnisliste flicken — das Textfeld bleibt
       unangetastet (Cursor, Auswahl, Tastatur). */
    function onInput(ev) {
      if (mode !== 'import' || !imp) return;
      const f = ev.target.closest('[data-imp]');
      if (!f) return;
      const k = f.dataset.imp;
      if (k === 'title')   { imp.title = f.value; return; }
      if (k === 'subject') { imp.subject = f.value; return; }
      if (k !== 'text') return;
      imp.text = f.value;
      importNeu();
    }

    function importNeu() {
      const P = window.KSParse;
      if (!P || !el) return;
      const parsed = P.parse(imp.text);
      const ov = el.querySelector('[data-imp=overlay]');
      if (ov) ov.innerHTML = importOverlay(imp.text, parsed);
      const res = el.querySelector('[data-imp=result]');
      if (res) res.innerHTML = importResult(parsed);
      const ap = el.querySelector('[data-imp=apply]');
      if (ap) {
        const n = parsed.stats.questions;
        ap.disabled = !n;
        ap.textContent = '✔ Übernehmen' + (n ? ' (' + n + ')' : '');
      }
    }

    /* Erkanntes übernehmen: neu → Editor mit neuen Fragen,
       ergänzen → hinten anhängen (eine leere Startfrage entfällt). */
    function importUebernehmen() {
      const P = window.KSParse;
      const parsed = P.parse(imp.text);
      if (!parsed.questions.length) { toast('Noch keine Fragen erkannt.', true); return; }
      const qs = parsed.questions.map(q => ({
        question_text: q.question_text, options: q.options,
        correct_idx: q.correct_idx, correct_indices: q.correct_indices,
        time_limit_sec: q.time_limit_sec, explanation: q.explanation
      }));
      if (imp.mode === 'append' && data) {
        const leer = x => !x.question_text && !(x.options || []).some(Boolean);
        data.questions = data.questions.filter(x => !leer(x)).concat(qs);
        if (!data.title && parsed.title) data.title = parsed.title;
      } else {
        data = {
          catalog_id: null,
          title: (imp.title || '').trim() || parsed.title || '',
          subject: imp.subject || 'Alles Mögliche',
          questions: qs
        };
      }
      dirty = true;
      imp = null;
      mode = 'edit';
      redraw();
      const nur = parsed.stats.onlyQuestions;
      toast('✅ ' + qs.length + (qs.length === 1 ? ' Frage' : ' Fragen') + ' übernommen'
        + (nur ? ' — ' + nur + ' noch ohne Antworten.' : '.'));
    }

    /* Ein Klick auf etwas mit data-ed. Gibt true zurück, wenn er
       hierher gehörte — der Gastgeber fragt dann nicht weiter. */
    function onClick(ev) {
      const ed = ev.target.closest && ev.target.closest('[data-ed]');
      if (!ed || !mode || dead) return false;
      handle(ed);
      return true;
    }

    async function handle(ed) {
        const a = ed.dataset.ed;

        // Katalog-Übersicht → Editor schließen
        if (a === 'close') {
          reset();
          if (o.onClose) o.onClose(); else redraw();
          return;
        }

        // Text-Import öffnen (neues Quiz bzw. an das geöffnete anhängen)
        if (a === 'imp-open' || a === 'imp-open-append') {
          const append = a === 'imp-open-append';
          if (append) sammle();
          if (!imp || imp.mode !== (append ? 'append' : 'new')) {
            imp = { text: '', mode: append ? 'append' : 'new', title: '', subject: 'Alles Mögliche' };
          }
          mode = 'import';
          redraw(); return;
        }
        if (a === 'imp-example') {
          imp.text = window.KSParse.EXAMPLE;
          redraw(); return;
        }
        if (a === 'imp-clear') {
          imp.text = '';
          redraw(); return;
        }
        if (a === 'imp-back') {
          if (imp.text.trim()) {
            const ok = await o.confirm('Der eingefügte Text geht verloren. Trotzdem zurück?');
            if (!ok) return;
          }
          const append = imp.mode === 'append' && data;
          imp = null;
          mode = append ? 'edit' : 'list';
          redraw(); return;
        }
        if (a === 'imp-apply') { importUebernehmen(); return; }

        // Neues Quiz anlegen
        if (a === 'new') {
          data = {
            catalog_id: null, title: '', subject: 'Alles Mögliche',
            questions: [{ question_text: '', options: ['','','',''], correct_idx: 0,
                          correct_indices: [0], time_limit_sec: 20, explanation: null }]
          };
          mode = 'edit'; dirty = true;
          redraw(); return;
        }

        // Katalog zum Bearbeiten laden
        if (a === 'edit') {
          const catId = ed.dataset.cat;
          ed.disabled = true;
          const r = await o.call('ks_catalog_get', { p_catalog_id: catId });
          ed.disabled = false;
          if (!r.ok) { toast(fehler(r.error), true); return; }
          data = r; mode = 'edit'; dirty = false;
          /* Eine Vorlage gehört niemandem, ks_catalog_save ändert sie
             nicht (not_found). Also wird sie als EIGENE Kopie geöffnet:
             ohne catalog_id legt Speichern einen neuen Katalog an. */
          if (!r.mine) {
            data.catalog_id = null;
            data.title = (r.title || 'Quiz') + ' (Kopie)';
            dirty = true;
            toast('Vorlage geöffnet — Speichern legt eine eigene Kopie an.');
          }
          redraw(); return;
        }

        // Katalog direkt zum Spielen auswählen
        if (a === 'play') {
          const catId = ed.dataset.cat;
          ed.disabled = true;
          const r = await o.onPlay(catId);
          ed.disabled = false;
          if (!r || !r.ok) { toast(fehler(r && r.error), true); return; }
          reset();
          redraw(); return;
        }

        // Katalog löschen
        if (a === 'del') {
          const title = ed.dataset.title || 'Quiz';
          const ok = await o.confirm('„' + title + '" wirklich löschen?');
          if (!ok) return;
          ed.disabled = true;
          const r = await o.call('ks_catalog_delete', { p_catalog_id: ed.dataset.cat });
          ed.disabled = false;
          if (!r.ok) { toast(fehler(r.error), true); return; }
          toast('"' + title + '" gelöscht.');
          // Katalogliste neu laden
          await o.reloadCatalogs();
          redraw(); return;
        }

        // Zurück zur Katalog-Liste (aus dem Editor)
        if (a === 'back') {
          if (dirty) {
            const ok = await o.confirm('Ungespeicherte Änderungen gehen verloren. Trotzdem zurück?');
            if (!ok) return;
          }
          mode = 'list'; data = null; dirty = false;
          redraw(); return;
        }

        // Vorschau öffnen
        if (a === 'preview') {
          if (!data || !data.questions.length) {
            toast('Erst mindestens eine Frage eingeben.', true); return;
          }
          sammle();
          pvIdx = 0; mode = 'preview';
          redraw(); return;
        }

        // Vorschau: Fragen blättern
        if (a === 'prev-q') {
          sammleVorschau();
          pvIdx = Math.max(0, pvIdx - 1);
          redraw(); return;
        }
        if (a === 'next-q') {
          sammleVorschau();
          const max = (data && data.questions) ? data.questions.length - 1 : 0;
          pvIdx = Math.min(max, pvIdx + 1);
          redraw(); return;
        }

        // Zurück zum Editor (aus der Vorschau)
        if (a === 'back-edit') {
          sammleVorschau();
          mode = 'edit'; redraw(); return;
        }

        // Frage hinzufügen
        if (a === 'addq') {
          sammle();
          data.questions.push({
            question_text: '', options: ['','','',''], correct_idx: 0,
            correct_indices: [0], time_limit_sec: 20, explanation: null
          });
          dirty = true;
          redraw();
          // Ans Ende scrollen
          setTimeout(() => {
            const cards = el ? el.querySelectorAll('.kse-frage') : [];
            if (cards.length && typeof cards[cards.length - 1].scrollIntoView === 'function') {
              cards[cards.length - 1].scrollIntoView({ behavior: 'smooth' });
            }
          }, 50);
          return;
        }

        // Frage löschen
        if (a === 'delq') {
          sammle();
          const qi = parseInt(ed.dataset.qi, 10);
          data.questions.splice(qi, 1);
          dirty = true;
          redraw(); return;
        }

        // Foto entfernen (Karte im Editor oder Vorschau)
        if (a === 'foto-del') {
          setzeFoto(ed.dataset.qi, null);
          return;
        }

        // Richtig-Haken umschalten
        if (a === 'toggle') {
          sammle();
          const qi = parseInt(ed.dataset.qi, 10);
          const oi = parseInt(ed.dataset.oi, 10);
          const q = data.questions[qi];
          if (!q) return;
          let ci = Array.isArray(q.correct_indices) ? [...q.correct_indices] : [q.correct_idx || 0];
          if (ci.includes(oi)) {
            ci = ci.filter(x => x !== oi);
            if (ci.length === 0) ci = [oi]; // mindestens einer bleibt
          } else {
            ci.push(oi);
          }
          q.correct_indices = ci;
          q.correct_idx = ci[0];
          dirty = true;
          // Nur den Haken-Button aktualisieren, nicht alles neu bauen
          ed.classList.toggle('is-richtig', ci.includes(oi));
          ed.textContent = ci.includes(oi) ? '✅' : '⬜';
          return;
        }

        // Speichern
        if (a === 'save') {
          sammle();
          if (!data.title || !data.title.trim()) {
            toast('Bitte einen Titel eingeben.', true); return;
          }
          if (!data.questions.length) {
            toast('Mindestens eine Frage ist nötig.', true); return;
          }
          // Fragen für den Server aufbereiten
          const qs = data.questions.map((q, i) => ({
            question_text:   q.question_text || '',
            options:         q.options || ['','','',''],
            correct_idx:     (Array.isArray(q.correct_indices) && q.correct_indices.length)
                               ? q.correct_indices[0] : (q.correct_idx || 0),
            correct_indices: q.correct_indices || [q.correct_idx || 0],
            time_limit_sec:  q.time_limit_sec || 20,
            explanation:     q.explanation || null,
            image:           q.image || null,
            image_name:      q.image ? (q.image_name || 'Foto') : null
          }));

          ed.disabled = true; ed.textContent = '⏳ …';
          const r = await o.call('ks_catalog_save', {
            p_catalog_id: data.catalog_id || null,
            p_title:      data.title.trim(),
            p_subject:    data.subject || 'Alles Mögliche',
            p_questions:  qs
          });
          ed.disabled = false; ed.textContent = '💾 Speichern';

          if (!r.ok) { toast(fehler(r.error), true); return; }
          data.catalog_id = r.catalog_id;
          dirty = false;
          toast('✅ Quiz gespeichert! (' + r.count + ' Fragen)');
          // Katalogliste im Hintergrund aktualisieren
          o.reloadCatalogs();
          return;
        }

    }

    /* Nach jedem html(): die Fläche merken und anbinden. Dieselben
       Funktionen an derselben Fläche zählen nur einmal
       (addEventListener), also darf das je Bild gerufen werden. */
    function bind(host) {
      el = host;
      host.addEventListener('click', onClick);
      host.addEventListener('input', onInput);
      host.addEventListener('change', onFotoWahl);
      host.addEventListener('dragover', schluckeDatei);
      host.addEventListener('drop', schluckeDatei);
      if (mode === 'edit') bindeDnD();
      if (mode === 'preview') bindeVorschau();
    }

    return {
      get mode() { return mode; },
      get dirty() { return !!(mode && dirty); },
      key, html, bind, onClick, reset,
      openList() { imp = null; data = null; dirty = false; mode = 'list'; redraw(); },
      destroy() { dead = true; reset(); el = null; }
    };
  }

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
    fotoZelle:    fotoZelle,
    create:       create,
    CSS:          CSS
  };
})();
