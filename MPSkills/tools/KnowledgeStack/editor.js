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
     list     Fragenkatalog: alle sichtbaren Quizze nach Themenfeld, mit
              Suche, Filtern, Status (Privat/Schule/Hub), Autor, Thumbnail
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

  /* ─── Themenfelder ───
     Die Liste steht in ks_categories (Migration 0194); der Server
     schickt sie mit ks_catalogs_list mit. Lehrkräfte legen keine neuen
     an. Diese Liste ist nur der Notnagel, falls der Server noch keine
     schickt (alte Datenbank). */
  const THEMEN = [
    'Mathematik', 'Deutsch', 'Englisch', 'Biologie', 'Physik', 'Chemie',
    'Informatik', 'Geschichte', 'Geografie', 'Politik & Gesellschaft',
    'Religion & Ethik', 'Musik', 'Kunst', 'Sport', 'Allgemeinwissen',
    'Spaß & Rätsel', 'Kennenlernen & Klasse', 'Tablet & Medien',
    'Natur & Umwelt', 'Alltag & Beruf', 'Andere'
  ];
  const STANDARD_THEMA = 'Allgemeinwissen';

  /* ─── Status: wer sieht das Quiz? Mehr Stufen gibt es nicht. ─── */
  const STATUS = {
    private: { ico: '🔒', label: 'Privat', hint: 'Nur du siehst dieses Quiz.' },
    school:  { ico: '🏫', label: 'Schule', hint: 'Alle Lehrkräfte deiner Schule sehen es.' },
    hub:     { ico: '🌍', label: 'Hub',    hint: 'Alle Lehrkräfte im ganzen Hub sehen es.' }
  };
  const statusVon = c => STATUS[c.visibility] ? c.visibility
    : ((c.mine && !c.is_template) ? 'private' : 'hub');

  const LOGO = '../LogoMPSkills.png';

  const esc = s => String(s || '').replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const LABELS = ['A', 'B', 'C', 'D'];

  /* ═══════════════════════════════════════════════════════════
     1) KATALOG-ÜBERSICHT (list)
     ═══════════════════════════════════════════════════════════ */
  /* Text für die Suche: klein, ä → ae, ß → ss, sonst ohne Akzente. */
  const norm = t => String(t || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const neuFilter = () => ({
    q: '', own: false, vis: 'all', cats: [], sort: 'new', closed: {}, peek: {}
  });
  const filterAktiv = lf => !!(lf.q.trim() || lf.own || lf.vis !== 'all' || lf.cats.length);

  function filtere(catalogs, lf) {
    const tokens = norm(lf.q).split(/\s+/).filter(Boolean);
    const out = catalogs.filter(c => {
      if (lf.own && !c.mine) return false;
      if (lf.vis !== 'all' && statusVon(c) !== lf.vis) return false;
      if (lf.cats.length && !lf.cats.includes(c.subject || 'Andere')) return false;
      if (tokens.length) {
        const hay = norm([c.title, c.author_name, c.subject, STATUS[statusVon(c)].label,
                          c.search].join(' · '));
        if (!tokens.every(t => hay.includes(t))) return false;
      }
      return true;
    });
    const zeit = c => String(c.updated_at || c.created_at || '');
    if (lf.sort === 'az')         out.sort((x, y) => String(x.title).localeCompare(String(y.title), 'de'));
    else if (lf.sort === 'count') out.sort((x, y) => (y.count | 0) - (x.count | 0));
    else                          out.sort((x, y) => zeit(y).localeCompare(zeit(x)));
    return out;
  }

  function thumbHtml(c, cache) {
    const url = cache && cache[c.id];
    if (url) return '<img class="kse-kk-img" src="' + esc(url) + '" alt="" loading="lazy" />';
    return '<img class="kse-kk-img kse-kk-img--logo" src="' + LOGO + '" alt="" loading="lazy" />';
  }

  function karte(c, ctx) {
    const st = statusVon(c);
    const S = STATUS[st];
    const eigen = !!c.mine && !c.is_template;
    const n = c.count | 0;
    const offen = !!ctx.lf.peek[c.id];
    const aktiv = ctx.current && ctx.current === c.id;
    const peek = ctx.peek[c.id];
    const needThumb = c.has_thumb && !(ctx.thumbs && ctx.thumbs[c.id]);

    let acts = '';
    if (ctx.play) {
      acts += `<button type="button" class="kse-btn kse-btn--small kse-btn--cyan"
                data-ed="play" data-cat="${esc(c.id)}"
                title="Dieses Quiz im Raum verwenden">▶ Spielen</button>`;
    }
    if (eigen) {
      acts += `<button type="button" class="kse-btn kse-btn--small" data-ed="edit"
                data-cat="${esc(c.id)}" title="Bearbeiten">✏️ Bearbeiten</button>`;
    } else {
      acts += `<button type="button" class="kse-btn kse-btn--small" data-ed="edit"
                data-cat="${esc(c.id)}"
                title="Als eigene Kopie öffnen — das Original bleibt, wie es ist">⧉ Kopie</button>`;
    }
    if (eigen) {
      acts += `<button type="button" class="kse-btn kse-btn--small kse-btn--rot" data-ed="del"
                data-cat="${esc(c.id)}" data-title="${esc(c.title)}" data-vis="${st}"
                title="Löschen">🗑</button>`;
    } else if (c.can_admin) {
      acts += `<button type="button" class="kse-btn kse-btn--small kse-btn--soft" data-ed="kk-private"
                data-cat="${esc(c.id)}" data-title="${esc(c.title)}"
                title="Admin: wieder auf privat stellen (nur der Autor sieht es dann)">↩ Auf privat</button>
               <button type="button" class="kse-btn kse-btn--small kse-btn--rot" data-ed="del"
                data-cat="${esc(c.id)}" data-title="${esc(c.title)}" data-vis="${st}" data-admin="1"
                title="Admin: löschen">🗑</button>`;
    }

    let veroeff = '';
    if (eigen) {
      veroeff = `<div class="kse-kk-vis" role="group" aria-label="Wer sieht dieses Quiz?">
        <span class="kse-kk-vis-l">Sichtbar für</span>
        ${['private', 'school', 'hub'].map(v => `
          <button type="button" class="kse-seg kse-seg--${v}${v === st ? ' is-an' : ''}"
                  data-ed="kk-vis" data-cat="${esc(c.id)}" data-v="${v}" data-title="${esc(c.title)}"
                  aria-pressed="${v === st}" title="${esc(STATUS[v].hint)}">${STATUS[v].ico} ${STATUS[v].label}</button>`).join('')}
      </div>`;
    }

    let peekHtml = '';
    if (offen) {
      peekHtml = '<div class="kse-kk-peek">'
        + (peek === undefined ? '<p class="kse-kk-peekleer">Lädt …</p>'
          : (peek && peek.length
              ? '<ol>' + peek.map(t => '<li>' + esc(t || '(ohne Text)') + '</li>').join('') + '</ol>'
              : '<p class="kse-kk-peekleer">Dieses Quiz hat noch keine Fragen.</p>'))
        + '</div>';
    }

    return `
      <article class="kse-kk kse-kk--${st}${aktiv ? ' is-aktiv' : ''}" data-kk="${esc(c.id)}">
        <div class="kse-kk-top">
          <div class="kse-kk-thumb"${needThumb ? ' data-th-need="' + esc(c.id) + '"' : ''}>${thumbHtml(c, ctx.thumbs)}</div>
          <div class="kse-kk-main">
            <h3 class="kse-kk-title">${esc(c.title)}</h3>
            <div class="kse-kk-by">von <b>${esc(c.author_name || (c.is_template ? 'MPSkills' : 'Unbekannt'))}</b>${eigen ? ' (du)' : ''}</div>
            <div class="kse-kk-chips">
              <span class="kse-chip kse-chip--${st}" title="${esc(S.hint)}">${S.ico} ${S.label}</span>
              ${eigen ? '<span class="kse-chip kse-chip--eigen">Eigenes</span>' : ''}
              ${aktiv ? '<span class="kse-chip kse-chip--aktiv">✔ Läuft gerade</span>' : ''}
              <span class="kse-chip kse-chip--info">${n} ${n === 1 ? 'Frage' : 'Fragen'}</span>
            </div>
          </div>
          <button type="button" class="kse-kk-eye${offen ? ' is-an' : ''}" data-ed="kk-peek"
                  data-cat="${esc(c.id)}" aria-expanded="${offen}"
                  title="${offen ? 'Fragen zuklappen' : 'Fragen kurz ansehen'}"
                  aria-label="${offen ? 'Fragen zuklappen' : 'Fragen kurz ansehen'}">${offen ? '▴' : '👁'}</button>
        </div>
        ${peekHtml}
        <div class="kse-kk-acts">${acts}</div>
        ${veroeff}
      </article>`;
  }

  /* Filterleiste + Ergebnis. Wird beim Tippen und Filtern NEU gebaut —
     das Suchfeld darüber bleibt unangetastet (Cursor, Tastatur). */
  function listeBar(catalogs, lf, cats) {
    const zahl = pred => catalogs.filter(pred).length;
    const chip = (act, on, label, extra) => `<button type="button" class="kse-fchip${on ? ' is-an' : ''}"
      data-ed="${act}" ${extra || ''} aria-pressed="${on}">${label}</button>`;
    const vorhanden = {};
    for (const c of catalogs) { const f = c.subject || 'Andere'; vorhanden[f] = (vorhanden[f] || 0) + 1; }
    const themen = cats.filter(k => vorhanden[k]);

    return `
      <div class="kse-frow">
        ${chip('lf-own', lf.own, '👤 Eigene <b>' + zahl(c => c.mine && !c.is_template) + '</b>')}
        <span class="kse-fsep"></span>
        ${chip('lf-vis', lf.vis === 'all', 'Alle', 'data-v="all"')}
        ${['private', 'school', 'hub'].map(v => chip('lf-vis', lf.vis === v,
            STATUS[v].ico + ' ' + STATUS[v].label + ' <b>' + zahl(c => statusVon(c) === v) + '</b>',
            'data-v="' + v + '"')).join('')}
        <span class="kse-fgrow"></span>
        <label class="kse-fsort">Sortieren
          <select class="kse-select" data-lf="sort">
            <option value="new"${lf.sort === 'new' ? ' selected' : ''}>Neueste zuerst</option>
            <option value="az"${lf.sort === 'az' ? ' selected' : ''}>A – Z</option>
            <option value="count"${lf.sort === 'count' ? ' selected' : ''}>Meiste Fragen</option>
          </select>
        </label>
      </div>
      <div class="kse-frow kse-frow--themen" role="group" aria-label="Themenfeld">
        ${themen.map(k => chip('lf-cat', lf.cats.includes(k), esc(k) + ' <b>' + vorhanden[k] + '</b>',
            'data-c="' + esc(k) + '"')).join('')}
      </div>`;
  }

  function listeErgebnis(catalogs, lf, cats, ctx) {
    const treffer = filtere(catalogs, lf);
    const aktiv = filterAktiv(lf);
    const zaehler = `<p class="kse-fzahl" role="status">${treffer.length} von ${catalogs.length}
      ${catalogs.length === 1 ? 'Quiz' : 'Quizzen'}${aktiv
        ? ' · <button type="button" class="kse-link" data-ed="lf-reset">Filter zurücksetzen</button>' : ''}</p>`;

    if (!catalogs.length) {
      return '<p class="kse-leer">Noch keine Quizze. Erstelle dein erstes Quiz!</p>';
    }
    if (!treffer.length) {
      return zaehler + '<p class="kse-leer">Kein Quiz passt dazu.<br>'
        + '<button type="button" class="kse-btn kse-btn--small" data-ed="lf-reset">Filter zurücksetzen</button></p>';
    }

    const gruppen = new Map();
    for (const c of treffer) {
      const f = c.subject || 'Andere';
      if (!gruppen.has(f)) gruppen.set(f, []);
      gruppen.get(f).push(c);
    }
    const reihe = cats.filter(k => gruppen.has(k))
      .concat(Array.from(gruppen.keys()).filter(k => !cats.includes(k)));
    const suche = !!lf.q.trim();

    let h = zaehler;
    for (const fach of reihe) {
      const kats = gruppen.get(fach);
      const zu = !!lf.closed[fach] && !suche;
      h += `<section class="kse-gruppe">
        <h2 class="kse-fach"><button type="button" class="kse-fach-btn" data-ed="lf-group"
            data-c="${esc(fach)}" aria-expanded="${!zu}">
          <span class="kse-fach-pfeil">${zu ? '▸' : '▾'}</span> ${esc(fach)}
          <span class="kse-fach-n">${kats.length}</span></button></h2>`;
      if (!zu) h += '<div class="kse-karten">' + kats.map(c => karte(c, ctx)).join('') + '</div>';
      h += '</section>';
    }
    return h;
  }

  /* opts.play    — „▶ Spielen" anbieten (nur im Raum: dort gibt es ein
                    Brett, in das der Katalog geladen werden kann).
     opts.close   — Aufschrift des Zurück-Knopfs.
     opts.current — id des Katalogs, der im Raum gerade läuft. */
  function buildList(catalogs, opts, lf, cats, caches) {
    opts = opts || {};
    lf = lf || neuFilter();
    cats = (cats && cats.length) ? cats : THEMEN;
    caches = caches || { thumbs: {}, peek: {} };
    const ctx = { lf, play: opts.play !== false, current: opts.current,
                  thumbs: caches.thumbs, peek: caches.peek };

    return `
      <div class="kse-wrap kse-wrap--katalog">
        <header class="kse-head">
          <h1 class="kse-h1">📚 Quiz-Katalog</h1>
          <div class="kse-headr">
            <button type="button" class="kse-btn kse-btn--gruen" data-ed="new">+ Neues Quiz</button>
            <button type="button" class="kse-btn kse-btn--cyan" data-ed="imp-open"
                    title="Fragen aus Text einfügen — Copy &amp; Paste">📋 Aus Text</button>
            <button type="button" class="kse-btn kse-btn--soft" data-ed="close">
              ${esc(opts.close || '← Zurück')}</button>
          </div>
        </header>
        <div class="kse-suche">
          <span class="kse-suche-ico" aria-hidden="true">🔍</span>
          <input type="search" class="kse-input kse-suche-in" data-lf="q" value="${esc(lf.q)}"
                 placeholder="Suchen: Titel, Autor, Themenfeld, Fragen …" autocomplete="off"
                 aria-label="Quizze durchsuchen" />
        </div>
        <div class="kse-fbar" data-kl="bar">${listeBar(catalogs, lf, cats)}</div>
        <div class="kse-list" data-kl="res">${listeErgebnis(catalogs, lf, cats, ctx)}</div>
      </div>`;
  }


  /* ═══════════════════════════════════════════════════════════
     2) VISUELLER EDITOR (edit)
     ═══════════════════════════════════════════════════════════ */
  function themenOptionen(cats, gewaehlt) {
    cats = (cats && cats.length) ? cats : THEMEN;
    const liste = cats.includes(gewaehlt) || !gewaehlt ? cats : cats.concat([gewaehlt]);
    return liste.map(f => '<option value="' + esc(f) + '"' + (f === gewaehlt ? ' selected' : '') + '>'
      + esc(f) + '</option>').join('');
  }

  function buildEditor(catalog, cats) {
    const qs = catalog.questions || [];
    const title = catalog.title || '';
    const subject = catalog.subject || STANDARD_THEMA;
    const vis = STATUS[catalog.visibility] ? catalog.visibility : 'private';
    const isNew = !catalog.catalog_id;
    const eigenBild = catalog.thumb_custom && catalog.thumbnail ? catalog.thumbnail : null;
    const foto = (qs.find(q => q.image) || {}).image || null;
    const bild = eigenBild || foto || LOGO;
    const bildArt = eigenBild ? 'Eigenes Bild' : (foto ? 'Foto aus Frage ' + (qs.findIndex(q => q.image) + 1)
                                                      : 'MPSkills-Logo');

    let h = `
      <div class="kse-wrap">
        <header class="kse-head">
          <div class="kse-headl">
            <input type="text" class="kse-input kse-input--titel" data-ed-field="title"
                   value="${esc(title)}" placeholder="Quiz-Titel eingeben…" />
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
        <section class="kse-meta" aria-label="Einstellungen des Quiz">
          <div class="kse-meta-feld">
            <label class="kse-meta-l" for="kseThema">Themenfeld</label>
            <select class="kse-select" id="kseThema" data-ed-field="subject">
              ${themenOptionen(cats, subject)}
            </select>
          </div>
          <div class="kse-meta-feld">
            <span class="kse-meta-l">Wer sieht das Quiz?</span>
            <div class="kse-segs" role="group" aria-label="Wer sieht das Quiz?">
              ${['private', 'school', 'hub'].map(v => `
                <button type="button" class="kse-seg kse-seg--${v}${v === vis ? ' is-an' : ''}"
                        data-ed="set-vis" data-v="${v}" aria-pressed="${v === vis}"
                        title="${esc(STATUS[v].hint)}">${STATUS[v].ico} ${STATUS[v].label}</button>`).join('')}
            </div>
            <span class="kse-meta-hint">${esc(STATUS[vis].hint)}${isNew ? '' : ' Bearbeiten und Löschen kannst du es trotzdem jederzeit.'}</span>
          </div>
          <div class="kse-meta-feld kse-meta-feld--bild">
            <span class="kse-meta-l">Vorschaubild</span>
            <div class="kse-thumbbox">
              <div class="kse-kk-thumb kse-kk-thumb--gross"><img class="kse-kk-img${bild === LOGO ? ' kse-kk-img--logo' : ''}" src="${esc(bild)}" alt="" /></div>
              <div class="kse-thumbacts">
                <span class="kse-meta-hint">${esc(bildArt)}</span>
                <label class="kse-btn kse-btn--small kse-btn--soft kse-filebtn">🖼 Bild wählen
                  <input type="file" accept="image/*" data-thumb-file hidden />
                </label>
                ${eigenBild ? '<button type="button" class="kse-btn kse-btn--small kse-btn--soft" data-ed="thumb-del">Entfernen</button>' : ''}
                <span class="kse-meta-hint">Ohne Bild nehmen wir ein Foto aus den Fragen, sonst das MPSkills-Logo.</span>
              </div>
            </div>
          </div>
        </section>
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

  function buildImport(state, parsed, cats) {
    const isNew = state.mode === 'new';
    const subject = state.subject || STANDARD_THEMA;
    const fachOpts = themenOptionen(cats, subject);
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

/* ── Quiz-Katalog ── */
.kse-wrap--katalog { max-width: 1240px; }
.kse-suche { position: relative; }
.kse-suche-ico { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
.kse-suche-in { padding: 12px 14px 12px 42px; font-size: 16px; border-radius: 14px; min-height: 48px; }
.kse-fbar { display: flex; flex-direction: column; gap: 8px; }
.kse-frow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.kse-frow--themen { gap: 6px; }
.kse-fsep { width: 1px; height: 22px; background: var(--ks-linie); margin: 0 2px; }
.kse-fgrow { flex: 1 1 auto; }
.kse-fsort { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--ks-soft); }
.kse-fchip {
  font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
  color: var(--ks-ink); background: var(--ks-tief);
  border: 2px solid var(--ks-linie); border-radius: 999px;
  padding: 6px 12px; min-height: 36px;
  display: inline-flex; align-items: center; gap: 6px;
}
.kse-fchip b { font-size: 11px; color: var(--ks-soft); font-weight: 800; }
.kse-fchip:hover { border-color: var(--ks-soft); }
.kse-fchip.is-an { background: var(--ks-gold); color: #1a1300; border-color: var(--ks-gold); }
.kse-fchip.is-an b { color: inherit; }
.kse-fzahl { margin: 0; font-size: 13px; font-weight: 700; color: var(--ks-soft); }
.kse-link { font: inherit; font-weight: 800; background: none; border: 0; padding: 0; cursor: pointer; color: var(--ks-cyant); text-decoration: underline; }
.kse-list { display: flex; flex-direction: column; gap: 22px; }
.kse-leer { color: var(--ks-soft); text-align: center; padding: 40px 0; font-size: 16px; line-height: 2; }
.kse-gruppe { }
.kse-fach { margin: 0 0 10px; padding-bottom: 4px; border-bottom: 2px solid var(--ks-linie); font-size: 15px; }
.kse-fach-btn {
  font: inherit; font-weight: 900; font-size: 15px; letter-spacing: .02em;
  background: none; border: 0; cursor: pointer; color: var(--ks-ink);
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 4px 0; min-height: 36px;
}
.kse-fach-pfeil { color: var(--ks-soft); width: 14px; }
.kse-fach-n { font-size: 12px; font-weight: 800; color: var(--ks-soft); background: var(--ks-tief); border-radius: 999px; padding: 1px 9px; }
.kse-karten { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr)); gap: 12px; align-items: start; }

/* Karte: Thumbnail links, Name · Autor · Status rechts */
.kse-kk {
  background: var(--ks-flaeche); border: 2px solid var(--ks-linie); border-left-width: 6px;
  border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-width: 0;
}
.kse-kk--private { border-left-color: var(--ks-soft); }
.kse-kk--school  { border-left-color: var(--ks-cyan); }
.kse-kk--hub     { border-left-color: var(--ks-gruen); }
.kse-kk.is-aktiv { box-shadow: 0 0 0 3px var(--ks-gold); }
.kse-kk-top { display: flex; gap: 12px; align-items: flex-start; }
.kse-kk-thumb {
  flex: 0 0 auto; width: 112px; aspect-ratio: 4 / 3; border-radius: 10px; overflow: hidden;
  background: var(--ks-tief); border: 1px solid var(--ks-linie);
  display: flex; align-items: center; justify-content: center;
}
.kse-kk-thumb--gross { width: 160px; }
.kse-kk-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.kse-kk-img--logo { object-fit: contain; padding: 14%; box-sizing: border-box; opacity: .85; }
.kse-kk-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.kse-kk-title { margin: 0; font-size: 16px; font-weight: 800; line-height: 1.25; color: var(--ks-ink);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.kse-kk-by { font-size: 13px; color: var(--ks-soft); }
.kse-kk-by b { color: var(--ks-ink); font-weight: 700; }
.kse-kk-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
.kse-chip {
  display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800;
  border-radius: 999px; padding: 3px 10px; border: 1.5px solid var(--ks-linie);
  background: var(--ks-tief); color: var(--ks-ink); white-space: nowrap;
}
.kse-chip--private { border-color: var(--ks-soft); color: var(--ks-ink); }
.kse-chip--school  { border-color: var(--ks-cyan); color: var(--ks-cyant); }
.kse-chip--hub     { border-color: var(--ks-gruen); background: var(--ks-gruenf); color: var(--ks-gruent); }
.kse-chip--eigen   { background: var(--ks-goldf); border-color: var(--ks-gold); color: var(--ks-goldt); }
.kse-chip--aktiv   { background: var(--ks-gold); border-color: var(--ks-gold); color: #1a1300; }
.kse-chip--info    { font-weight: 700; color: var(--ks-soft); }
.kse-kk-eye {
  flex: 0 0 auto; width: 44px; height: 44px; font-size: 18px; cursor: pointer; border-radius: 12px;
  background: var(--ks-tief); color: var(--ks-ink); border: 2px solid var(--ks-linie);
}
.kse-kk-eye.is-an { background: var(--ks-gold); border-color: var(--ks-gold); color: #1a1300; }
.kse-kk-peek { background: var(--ks-tief); border-radius: 10px; padding: 8px 12px; max-height: 220px; overflow-y: auto; }
.kse-kk-peek ol { margin: 0; padding-left: 22px; font-size: 13px; line-height: 1.5; color: var(--ks-ink); }
.kse-kk-peek li { padding: 2px 0; overflow-wrap: anywhere; }
.kse-kk-peekleer { margin: 0; font-size: 13px; color: var(--ks-soft); }
.kse-kk-acts { display: flex; flex-wrap: wrap; gap: 6px; }
.kse-kk-vis { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 8px; border-top: 1px dashed var(--ks-linie); }
.kse-kk-vis-l { font-size: 12px; font-weight: 700; color: var(--ks-soft); margin-right: 2px; }

/* Segment-Knöpfe (Status wählen) */
.kse-segs { display: flex; flex-wrap: wrap; gap: 6px; }
.kse-segs .kse-seg { white-space: nowrap; }
.kse-seg {
  font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; min-height: 38px;
  background: var(--ks-tief); color: var(--ks-ink); border: 2px solid var(--ks-linie);
  border-radius: 10px; padding: 6px 12px;
}
.kse-kk-vis .kse-seg { min-height: 34px; padding: 4px 10px; font-size: 12px; }
.kse-seg.is-an { color: #fff; border-color: transparent; }
.kse-seg--private.is-an { background: #475569; }
.kse-seg--school.is-an  { background: #0e7490; }
.kse-seg--hub.is-an     { background: #047857; }

/* Editor: Einstellungen unter der Kopfzeile */
.kse-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;
  background: var(--ks-flaeche); border: 2px solid var(--ks-linie); border-radius: 14px; padding: 12px 14px; }
.kse-meta-feld { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.kse-meta-feld--bild { grid-column: 1 / -1; }
.kse-meta-l { font-size: 12px; font-weight: 800; color: var(--ks-soft); text-transform: uppercase; letter-spacing: .05em; }
.kse-meta-hint { font-size: 12px; color: var(--ks-soft); }
.kse-thumbbox { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.kse-thumbacts { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.kse-filebtn { cursor: pointer; }

@media (max-width: 560px) {
  .kse-kk-thumb { width: 92px; }
  .kse-kk-thumb--gross { width: 128px; }
}

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
    let lf = neuFilter();          // Suche und Filter der Übersicht (bleiben beim Zurückkehren)
    const caches = { thumbs: {}, peek: {} };   // Thumbnails und Fragenlisten, je Katalog-id
    const thumbBusy = new Set();
    let thumbT = null, io = null;
    const kategorien = () => (o.categories && o.categories()) || THEMEN;

    const toast = (m, e) => o.toast && o.toast(m, e);
    const fehler = code => (o.errText ? o.errText(code) : 'Fehler (' + code + ')');
    const redraw = () => { if (!dead) o.redraw(); };

    function reset() { mode = null; data = null; dirty = false; imp = null; pvIdx = 0; }

    function key() {
      return mode ? mode + '|' + (mode === 'preview' ? pvIdx : '-') : null;
    }

    function html() {
      if (mode === 'list')   return buildList(o.catalogs() || [],
        { play: !!o.onPlay, close: o.closeLabel, current: o.current && o.current() },
        lf, kategorien(), caches);
      if (mode === 'edit')   return buildEditor(data || { questions: [] }, kategorien());
      if (mode === 'import') return buildImport(imp, window.KSParse.parse(imp.text), kategorien());
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
      const sort = ev.target && ev.target.closest && ev.target.closest('[data-lf=sort]');
      if (sort && mode === 'list') { lf.sort = sort.value; listeNeu(); return; }
      const th = ev.target && ev.target.closest && ev.target.closest('[data-thumb-file]');
      if (th && mode === 'edit') {
        const f = th.files && th.files[0];
        th.value = '';
        if (f) ladeThumb(f);
        return;
      }
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

    /* ─── Übersicht: nur Leiste und Ergebnis neu bauen ───────── */
    function listeNeu() {
      if (!el || mode !== 'list') return;
      const cats = kategorien();
      const alle = o.catalogs() || [];
      const ctx = { lf, play: !!o.onPlay, current: o.current && o.current(),
                    thumbs: caches.thumbs, peek: caches.peek };
      const bar = el.querySelector('[data-kl=bar]');
      const res = el.querySelector('[data-kl=res]');
      if (bar) bar.innerHTML = listeBar(alle, lf, cats);
      if (res) res.innerHTML = listeErgebnis(alle, lf, cats, ctx);
      thumbsNachladen();
    }

    /* Thumbnails kommen NICHT mit der Liste (40 KB je Quiz), sondern
       je 24 nachgeladen — und nur die, die ins Bild kommen. */
    function thumbsAnwenden(id) {
      if (!el) return;
      const url = caches.thumbs[id];
      if (!url) return;
      el.querySelectorAll('[data-th-need="' + id + '"]').forEach(box => {
        const img = box.querySelector('img');
        if (img) { img.setAttribute('src', url); img.classList.remove('kse-kk-img--logo'); }
        box.removeAttribute('data-th-need');
      });
    }

    const wartend = [];
    async function thumbsHolen() {
      thumbT = null;
      while (wartend.length) {
        const ids = wartend.splice(0, 24);
        const r = await o.call('ks_catalog_thumbs', { p_ids: ids });
        for (const id of ids) {
          thumbBusy.delete(id);
          caches.thumbs[id] = (r && r.ok && r.thumbs && r.thumbs[id]) || null;
          thumbsAnwenden(id);
        }
        if (dead) return;
      }
    }
    function thumbBraucht(id) {
      if (id in caches.thumbs || thumbBusy.has(id)) return;
      thumbBusy.add(id);
      wartend.push(id);
      if (!thumbT) thumbT = setTimeout(thumbsHolen, 60);
    }
    function thumbsNachladen() {
      if (!el) return;
      const boxen = Array.from(el.querySelectorAll('[data-th-need]'));
      for (const box of boxen) {
        const id = box.getAttribute('data-th-need');
        if (caches.thumbs[id]) { thumbsAnwenden(id); continue; }
        if (typeof IntersectionObserver === 'function') {
          if (!io) io = new IntersectionObserver(es => es.forEach(e => {
            if (e.isIntersecting) { io.unobserve(e.target); thumbBraucht(e.target.getAttribute('data-th-need')); }
          }), { rootMargin: '300px' });
          io.observe(box);
        } else {
          thumbBraucht(id);
        }
      }
    }

    /* ─── Vorschaubild des Quiz (Editor) ─────────────────────
       4:3, 480 Punkte breit, JPEG: etwa 30–50 KB. Quelle ist eine
       Datei oder eine data:-URL (das Foto der ersten Frage). */
    async function thumbVon(quelle) {
      const img = typeof quelle === 'string'
        ? await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('unlesbar')); i.src = quelle; })
        : await bildAusDatei(quelle);
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) throw new Error('unlesbar');
      const W = 480, H = 360;
      const f = Math.max(W / w0, H / h0);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.drawImage(img, (W - w0 * f) / 2, (H - h0 * f) / 2, w0 * f, h0 * f);
      return c.toDataURL('image/jpeg', .75);
    }

    async function ladeThumb(file) {
      if (!/^image\//.test(file.type || '')) { toast('Das ist kein Bild.', true); return; }
      try {
        sammle();
        data.thumbnail = await thumbVon(file);
        data.thumb_custom = true;
        dirty = true;
        redraw();
      } catch (e) {
        toast('Dieses Bild kann der Browser nicht lesen. Bitte als JPG oder PNG speichern.', true);
      }
    }

    /* Text-Import: bei jedem Tastendruck neu erkennen und NUR die
       Einfärbung und die Ergebnisliste flicken — das Textfeld bleibt
       unangetastet (Cursor, Auswahl, Tastatur). */
    function onInput(ev) {
      if (mode === 'list') {
        const q = ev.target.closest && ev.target.closest('[data-lf=q]');
        if (q) { lf.q = q.value; listeNeu(); }
        return;
      }
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
          subject: imp.subject || STANDARD_THEMA,
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
            imp = { text: '', mode: append ? 'append' : 'new', title: '', subject: STANDARD_THEMA };
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

        // ── Übersicht: Filter ──
        if (a === 'lf-own')   { lf.own = !lf.own; listeNeu(); return; }
        if (a === 'lf-vis')   { lf.vis = ed.dataset.v || 'all'; listeNeu(); return; }
        if (a === 'lf-cat')   {
          const k = ed.dataset.c;
          lf.cats = lf.cats.includes(k) ? lf.cats.filter(x => x !== k) : lf.cats.concat([k]);
          listeNeu(); return;
        }
        if (a === 'lf-reset') {
          const sort = lf.sort;
          lf = neuFilter(); lf.sort = sort;
          const inp = el && el.querySelector('[data-lf=q]');
          if (inp) inp.value = '';
          listeNeu(); return;
        }
        if (a === 'lf-group') { lf.closed[ed.dataset.c] = !lf.closed[ed.dataset.c]; listeNeu(); return; }

        // Fragen kurz ansehen (nur die Texte)
        if (a === 'kk-peek') {
          const id = ed.dataset.cat;
          if (lf.peek[id]) { delete lf.peek[id]; listeNeu(); return; }
          lf.peek[id] = true;
          if (!(id in caches.peek)) {
            listeNeu();
            const r = await o.call('ks_catalog_peek', { p_catalog_id: id });
            caches.peek[id] = (r && r.ok) ? (r.questions || []) : [];
            if (!(r && r.ok)) toast(fehler(r && r.error), true);
          }
          listeNeu(); return;
        }

        // Status eines eigenen Quiz in der Übersicht ändern
        if (a === 'kk-vis') {
          const id = ed.dataset.cat, v = ed.dataset.v;
          const c = (o.catalogs() || []).find(x => x.id === id);
          if (!c || statusVon(c) === v) return;
          if (v === 'hub' && !(await o.confirm('„' + (ed.dataset.title || 'Quiz') + '" für ALLE Lehrkräfte im Hub veröffentlichen?'))) return;
          if (v === 'school' && !(await o.confirm('„' + (ed.dataset.title || 'Quiz') + '" für alle Lehrkräfte deiner Schule veröffentlichen?'))) return;
          const r = await o.call('ks_catalog_set_visibility', { p_catalog_id: id, p_visibility: v });
          if (!r.ok) { toast(fehler(r.error), true); return; }
          c.visibility = v;
          toast(STATUS[v].ico + ' „' + (ed.dataset.title || 'Quiz') + '": ' + STATUS[v].label + '.');
          await o.reloadCatalogs();
          listeNeu(); return;
        }

        // Admin: ein veröffentlichtes Quiz wieder auf privat stellen
        if (a === 'kk-private') {
          const t = ed.dataset.title || 'Quiz';
          if (!(await o.confirm('„' + t + '" auf privat stellen? Nur der Autor sieht es dann noch.'))) return;
          const r = await o.call('ks_catalog_set_visibility', { p_catalog_id: ed.dataset.cat, p_visibility: 'private' });
          if (!r.ok) { toast(fehler(r.error), true); return; }
          toast('„' + t + '" ist jetzt privat.');
          await o.reloadCatalogs();
          listeNeu(); return;
        }

        // Editor: Status und Vorschaubild
        if (a === 'set-vis') {
          const v = ed.dataset.v;
          sammle();
          if (!data || data.visibility === v || (!data.visibility && v === 'private')) return;
          if (v === 'hub' && !(await o.confirm('Im Hub sehen alle Lehrkräfte dieses Quiz. Trotzdem?'))) return;
          data.visibility = v; dirty = true;
          redraw(); return;
        }
        if (a === 'thumb-del') {
          sammle();
          data.thumbnail = null; data.thumb_custom = false; dirty = true;
          redraw(); return;
        }

        // Neues Quiz anlegen
        if (a === 'new') {
          data = {
            catalog_id: null, title: '', subject: STANDARD_THEMA, visibility: 'private',
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
            data.visibility = 'private';
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
          const veroeff = ed.dataset.vis && ed.dataset.vis !== 'private';
          const ok = await o.confirm('„' + title + '" wirklich löschen?'
            + (veroeff ? ' Es ist veröffentlicht — andere Lehrkräfte können es dann nicht mehr verwenden.' : ''));
          if (!ok) return;
          ed.disabled = true;
          const r = await o.call('ks_catalog_delete', { p_catalog_id: ed.dataset.cat });
          ed.disabled = false;
          if (!r.ok) { toast(fehler(r.error), true); return; }
          toast('„' + title + '" gelöscht.');
          delete caches.thumbs[ed.dataset.cat]; delete caches.peek[ed.dataset.cat];
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
          /* Vorschaubild: das eigene — sonst das Foto der ersten Frage,
             die eines hat — sonst keins (dann zeigt der Katalog das Logo). */
          let thumb = null, eigen = false;
          if (data.thumb_custom && data.thumbnail) { thumb = data.thumbnail; eigen = true; }
          else {
            const q1 = data.questions.find(q => q.image);
            if (q1) { try { thumb = await thumbVon(q1.image); } catch (e) { thumb = null; } }
          }
          const r = await o.call('ks_catalog_save', {
            p_catalog_id:   data.catalog_id || null,
            p_title:        data.title.trim(),
            p_subject:      data.subject || STANDARD_THEMA,
            p_questions:    qs,
            p_visibility:   data.visibility || 'private',
            p_thumbnail:    thumb,
            p_thumb_custom: eigen
          });
          ed.disabled = false; ed.textContent = '💾 Speichern';

          if (!r.ok) { toast(fehler(r.error), true); return; }
          data.catalog_id = r.catalog_id;
          data.mine = true;
          dirty = false;
          delete caches.thumbs[r.catalog_id]; delete caches.peek[r.catalog_id];
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
      if (mode === 'list') thumbsNachladen();
    }

    return {
      get mode() { return mode; },
      get dirty() { return !!(mode && dirty); },
      key, html, bind, onClick, reset,
      openList() { imp = null; data = null; dirty = false; mode = 'list'; redraw(); },
      destroy() { dead = true; reset(); el = null; if (io) io.disconnect(); clearTimeout(thumbT); }
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
