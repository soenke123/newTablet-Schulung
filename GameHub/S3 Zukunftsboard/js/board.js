/* Zukunftsboard — Oberfläche.

   Grundregel: der Server entscheidet. Phase, Eigentum, Kontingent und
   Quellen-Vollständigkeit prüft board_upsert_note (Migration 0062)
   noch einmal komplett. Was hier passiert, ist Komfort — deaktivierte
   Knöpfe und Fehlermeldungen in verständlichem Deutsch, keine Sicherheit.

   Kein localStorage: die Karten gehören dem Kurs und leben auf dem
   Server. Ansichts-Einstellungen liegen im sessionStorage, damit auf
   einem geteilten Tablet nichts vom Vorgänger übrig bleibt.          */
(function () {
  'use strict';

  /* ── Stammdaten ──────────────────────────────────────── */
  const CATEGORIES = [
    { id: 'persoenlich',      icon: '🧍', label: 'Persönlich'       },
    { id: 'gesellschaftlich', icon: '👥', label: 'Gesellschaftlich' },
    { id: 'politisch',        icon: '🏛️', label: 'Politisch'         },
    { id: 'bildung',          icon: '📚', label: 'Wissen & Bildung' },
    { id: 'wirtschaftlich',   icon: '💶', label: 'Wirtschaftlich'   },
    { id: 'umwelt',           icon: '🌱', label: 'Umwelt'           }
  ];
  const STANCES = [
    { id: 'chance',    icon: '🟢', label: 'Chance'    },
    { id: 'risiko',    icon: '🔴', label: 'Risiko'    },
    { id: 'vermutung', icon: '🟡', label: 'Vermutung' }
  ];
  // Freiwillige Mehrfachauswahl — eine Aussage kann auf mehrere
  // Technologien zeigen oder auf keine bestimmte.
  const TOPICS = [
    { id: 'ki',          icon: '🤖', label: 'KI'           },
    { id: 'socialmedia', icon: '📱', label: 'Social Media' },
    { id: 'gaming',      icon: '🎮', label: 'Gaming'       }
  ];

  const PHASE_HINT = {
    1: 'Phase 1 · Sammeln — Was könnten KI, Social Media und Handy-Games bewirken? Halte Chancen, Risiken und Vermutungen fest. Du hast 8 Post-Its.',
    2: 'Phase 2 · Belegen — Such dir einen Punkt aus und finde einen echten Fakt dazu. Einer ist Pflicht, zwei sind möglich — jeweils mit vollständiger Quelle.',
    3: 'Phase 3 · Besprechen — Das Board ist eingefroren. Jetzt schauen wir gemeinsam drauf.'
  };

  const ERROR_TEXT = {
    not_authenticated:     'Du bist nicht mehr angemeldet. Lade die Seite neu.',
    session_expired:       'Deine Anmeldung ist abgelaufen. Lade die Seite neu (F5) — dein Board bleibt erhalten.',
    no_cluster:            'Du gehörst noch zu keinem Kurs — ohne Kurs gibt es kein Board.',
    no_profile:            'Zu deinem Konto fehlt ein Profil. Melde dich bei deiner Lehrkraft.',
    account_not_active:    'Dein Konto ist noch nicht freigeschaltet.',
    season_locked:         'Das Zukunftsboard gehört zu Season 3 und ist für deinen Kurs noch nicht offen.',
    phase_locked:          'In dieser Phase lässt sich das nicht mehr ändern.',
    quota_exceeded:        'Du hast schon alle Karten dieser Art vergeben.',
    not_owner:             'Das ist nicht deine Karte.',
    not_admin:             'Das dürfen nur Admins.',
    not_found:             'Diese Karte gibt es nicht mehr.',
    invalid_input:         'Mit den Eingaben stimmt etwas nicht.',
    invalid_source_url:    'Der Link muss vollständig sein und mit https:// beginnen.',
    invalid_source_author: 'Trag ein, wer den Text geschrieben hat.',
    invalid_source_date:   'Das Veröffentlichungsdatum fehlt oder liegt in der Zukunft.',
    invalid_topics:        'Dieses Thema gibt es nicht.',
    own_note:              'Deinem eigenen Beitrag kannst du nicht zustimmen.',
    network:               'Keine Verbindung zum Server. Versuch es gleich nochmal.'
  };

  const CLUSTER_KEY = 'bd_cluster';
  const VIEW_KEY    = 'bd_view';
  const POLL_MS     = 5000;

  /* ── Zustand ─────────────────────────────────────────── */
  const state = {
    data:      null,   // letzte Antwort von board_get
    isAdmin:   false,
    clusters:  [],
    clusterId: null,   // nur Admins wählen aktiv; Schüler bleiben auf null
    view:      'board',
    sort:      { col: 'created_at', dir: 'desc' },
    lastSig:   null,
    editing:   null,   // { id|null, kind, category, stance }
    detailId:  null,   // offene Karten-Ansicht
    confirmFn: null,
    failStreak: 0      // wie viele stille Polls hintereinander fehlschlugen
  };

  /* ── Kleinkram ───────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHtml
    ? window.escapeHtml(s)
    : String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));

  const catOf    = id => CATEGORIES.find(c => c.id === id) || { icon: '•', label: id };
  const stanceOf = id => STANCES.find(s => s.id === id)    || { icon: '•', label: id };
  const topicOf  = id => TOPICS.find(t => t.id === id)     || { icon: '•', label: id };
  // Reihenfolge kommt kanonisch vom Server (board_upsert_note sortiert),
  // hier nur noch absichern, falls das Feld mal fehlt.
  const topicsOf = note => Array.isArray(note.topics) ? note.topics : [];

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDate(iso) {
    if (!iso) return '';
    // 'T00:00:00' erzwingt lokale Mitternacht. Ohne das liest der Browser
    // ein reines Datum als UTC und zeigt westlich von Greenwich den Vortag.
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./i, ''); }
    catch (e) { return url; }
  }

  const isSafeUrl = u => /^https?:\/\/[^\s]+\.[^\s]+/i.test(String(u || ''));

  /* Quellenangabe in Schul-Zitierweise. Eine einzige Funktion für Karte
     und Tabelle — zwei Codepfade würden garantiert auseinanderlaufen. */
  function formatSource(note) {
    if (note.kind !== 'fakt' || !note.source_url) return '';
    const link = isSafeUrl(note.source_url)
      ? `<a href="${esc(note.source_url)}" target="_blank" rel="noopener noreferrer" title="${esc(note.source_url)}">${esc(domainOf(note.source_url))} ↗</a>`
      : esc(note.source_url);   // kein Link — javascript: & Co. bleiben Text
    return `${esc(note.source_author)} (${formatDate(note.source_date)}): ${link}`;
  }

  function toast(msg, isError) {
    const t = $('bdToast');
    t.textContent = msg;
    t.className = 'bd-toast' + (isError ? ' bd-toast--error' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  const errText = err => ERROR_TEXT[err] || `Unerwarteter Fehler (${err}).`;

  /* ── Rechte — dieselbe Logik wie serverseitig in 0062 ─── */
  function phase() { return state.data?.phase ?? 1; }

  function canWrite(kind) {
    if (state.isAdmin) return true;
    if (phase() >= 3) return false;
    if (kind === 'fakt') return phase() >= 2;
    return true;
  }

  function canEdit(note) {
    if (state.isAdmin) return true;
    if (!note.is_mine) return false;
    return canWrite(note.kind);
  }

  /* ── Laden ───────────────────────────────────────────── */
  async function load(opts) {
    const quiet = opts && opts.quiet;
    const res = await window.BoardAPI.get(state.clusterId);

    if (!res || !res.ok) {
      // Beim stillen Poll keinen Ladefehler über ein funktionierendes
      // Board legen — ein Aussetzer im WLAN ist kein Grund, dem Kurs
      // den Inhalt wegzunehmen.
      if (quiet && state.data) {
        // Stumm bleiben darf es aber nicht auf Dauer: ein Board, das
        // aussieht wie immer und in Wahrheit seit Minuten nichts mehr
        // holt, ist im Unterricht schlimmer als eine Fehlermeldung.
        state.failStreak++;
        if (state.failStreak === 3) {
          toast(res?.error === 'session_expired'
            ? ERROR_TEXT.session_expired
            : 'Keine Verbindung — das Board zeigt gerade einen alten Stand.', true);
        }
        return;
      }
      showStatus(errText(res?.error), true);
      return;
    }

    state.failStreak = 0;
    state.data = res;
    state.isAdmin = !!res.is_admin;
    if (!state.clusterId) state.clusterId = res.cluster_id;
    render();
  }

  function showStatus(msg, isError) {
    const s = $('bdStatus');
    s.textContent = msg;
    s.className = 'bd-status' + (isError ? ' bd-status--error' : '');
    s.hidden = false;
    $('bdBoard').hidden = true;
    $('bdTable').hidden = true;
    $('bdActions').hidden = true;
    $('bdPhases').hidden  = true;
    $('bdHint').hidden    = true;
    $('bdViewSwitch').hidden = true;
    // Signatur verwerfen: sonst hält render() beim nächsten erfolgreichen
    // Laden die Daten für „unverändert", steigt früh aus — und die
    // Fehlermeldung bliebe über einem versteckten Board stehen.
    state.lastSig = null;
  }

  /* ── Rendern ─────────────────────────────────────────── */
  function signature() {
    const d = state.data;
    if (!d) return '';
    return JSON.stringify([
      d.cluster_id, d.phase, d.is_admin, state.view, state.sort,
      d.me?.ideas_used, d.me?.facts_used,
      // likes gehören in die Signatur: sonst bliebe eine Zustimmung aus
      // einem anderen Tablet unsichtbar, weil updated_at sich dabei
      // nicht ändert — und der eigene Klick würde ebenso verschluckt.
      d.notes.map(n => [n.id, n.updated_at, n.likes, n.liked_by_me])
    ]);
  }

  function render() {
    // Unverändert? Dann DOM in Ruhe lassen. Das ist der Normalfall beim
    // 5-Sekunden-Poll und hält Scrollposition und Fokus stabil.
    const sig = signature();
    if (sig === state.lastSig) return;
    state.lastSig = sig;

    const d = state.data;
    $('bdStatus').hidden = true;
    $('bdCourse').textContent = d.cluster_name ? `Kurs: ${d.cluster_name}` : '';

    renderPhases();
    renderHint();
    renderQuota();
    renderActions();
    renderAdminBar();

    $('bdViewSwitch').hidden = false;
    document.querySelectorAll('#bdViewSwitch button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === state.view);
    });

    if (state.view === 'board') {
      $('bdTable').hidden = true;
      $('bdBoard').hidden = false;
      renderBoard();
    } else {
      $('bdBoard').hidden = true;
      $('bdTable').hidden = false;
      renderTable();
    }

    // Offenes Detail mitziehen: sonst zeigt es nach einer Zustimmung
    // von einem anderen Tablet noch den alten Zählerstand.
    if (state.detailId && !$('bdDetail').hidden) renderDetail();
  }

  function renderPhases() {
    const p = phase();
    $('bdPhases').hidden = false;
    document.querySelectorAll('.bd-phase').forEach(el => {
      const n = Number(el.dataset.phase);
      el.classList.toggle('bd-phase--active', n === p);
      el.classList.toggle('bd-phase--done', n < p);
    });
  }

  function renderHint() {
    const h = $('bdHint');
    h.textContent = PHASE_HINT[phase()] || '';
    h.hidden = false;
  }

  function renderQuota() {
    const me = state.data.me || {};
    if (state.isAdmin) {
      $('bdQuota').innerHTML = `${state.data.notes.length} Karten im Kurs`;
      return;
    }
    $('bdQuota').innerHTML =
      `Post-Its <strong>${me.ideas_used ?? 0}/${me.ideas_max ?? 8}</strong>` +
      ` · Fakten <strong>${me.facts_used ?? 0}/${me.facts_max ?? 2}</strong>`;
  }

  function renderActions() {
    const me = state.data.me || {};
    const box = $('bdActions');
    box.hidden = false;

    const ideaBtn = $('bdNewIdea');
    const factBtn = $('bdNewFact');

    const ideaFull = !state.isAdmin && (me.ideas_used ?? 0) >= (me.ideas_max ?? 8);
    const factFull = !state.isAdmin && (me.facts_used ?? 0) >= (me.facts_max ?? 2);

    ideaBtn.hidden = !canWrite('idee');
    factBtn.hidden = !canWrite('fakt');
    ideaBtn.disabled = ideaFull;
    factBtn.disabled = factFull;
    ideaBtn.title = ideaFull ? 'Deine 8 Post-Its sind vergeben.' : '';
    factBtn.title = factFull ? 'Deine 2 Fakten sind vergeben.' : '';

    box.hidden = ideaBtn.hidden && factBtn.hidden;
  }

  /* ── Karten in der Wolke ─────────────────────────────────
     Bewusst reduziert: der Text ist die Karte. Kein Kategorie-Icon
     (die Kategorie ist schon die Überschrift der Wolke), kein Name,
     keine Knöpfe — die stehen alle im Detail, einen Klick entfernt.
     Übrig bleiben oben die Themen-Icons und unten rechts die
     Zustimmung, weil die Zustimmung die Größe der Karte steuert und
     deshalb sichtbar sein muss.                                     */

  const LIKE_SIZE_MIN = 0.95;   // rem — Karte ohne Zustimmung
  const LIKE_SIZE_MAX = 2.15;   // rem — Karte mit den meisten

  /* Größe aus der Zustimmung. Wurzel statt linear: der Sprung von 0 auf 1
     Zustimmung soll sichtbar sein, der von 8 auf 9 kaum noch — sonst
     erdrückt eine einzelne Karte die ganze Wolke. */
  function sizeFor(likes, maxLikes) {
    if (maxLikes <= 0) return LIKE_SIZE_MIN;
    const f = Math.sqrt(Math.max(0, Math.min(likes, maxLikes)) / maxLikes);
    return LIKE_SIZE_MIN + f * (LIKE_SIZE_MAX - LIKE_SIZE_MIN);
  }

  /* Hochkant nur für kurze Texte: ein gedrehter Halbsatz liest sich
     noch, ein gedrehter 200-Zeichen-Satz nicht mehr. Die Entscheidung
     hängt an der id, damit dieselbe Karte nach jedem Poll wieder
     gleich liegt und die Wolke nicht bei jeder Zustimmung umspringt. */
  function wantsRotate(note) {
    if (String(note.text || '').length > 34) return false;
    let h = 0;
    const s = String(note.id || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 3 === 0;
  }

  function likeHTML(note) {
    const likes = Number(note.likes || 0);
    // Der eigenen Karte kann man nicht zustimmen — dort steht die Zahl
    // ohne Knopf, damit die Karte trotzdem zeigt, wie sie ankommt.
    if (note.is_mine) {
      return likes > 0
        ? `<span class="bd-like bd-like--own" title="So viele stimmen dir zu">👍 ${likes}</span>`
        : '';
    }
    return `<button class="bd-like${note.liked_by_me ? ' bd-like--on' : ''}" data-like="${esc(note.id)}"
              title="${note.liked_by_me ? 'Zustimmung zurückziehen' : 'Ich stimme zu'}"
              aria-pressed="${!!note.liked_by_me}">👍${likes > 0 ? ' ' + likes : ''}</button>`;
  }

  function topicsHTML(note) {
    return topicsOf(note).map(t => {
      const info = topicOf(t);
      return `<span class="bd-topic" title="${esc(info.label)}">${info.icon}</span>`;
    }).join('');
  }

  function cardHTML(note, opts) {
    const o      = opts || {};
    const rot    = !!o.rotate;
    const topics = topicsHTML(note);
    const head   = topics + (note.kind === 'fakt' ? '<span class="bd-cn__fact" title="Belegter Fakt">📎</span>' : '');
    // Größere Karten dürfen etwas breiter werden, sonst wird eine
    // 2-rem-Karte zu einem schmalen hohen Turm. min(…,100%) hält sie
    // auf schmalen Geräten trotzdem in der Spalte.
    const style  = o.size
      ? ` style="font-size:${o.size.toFixed(2)}rem;max-width:min(${Math.round(200 + (o.size - LIKE_SIZE_MIN) * 130)}px,100%)"`
      : '';

    // Bewusst ohne role="button": die Karte enthält selbst einen Knopf
    // (Zustimmen), und Inhalt innerhalb von role="button" gilt als
    // rein darstellend — der Knopf verschwände für Screenreader.
    // tabindex + Enter/Leertaste reichen hier.
    return `<article class="bd-cn bd-cn--${esc(note.stance)}${note.is_mine ? ' bd-cn--mine' : ''}${rot ? ' bd-cn--rot' : ''}"
             data-note="${esc(note.id)}"${rot ? ' data-rot="1"' : ''}${style}
             tabindex="0" title="Öffnen für Verfasser:in und Details">
        ${head ? `<div class="bd-cn__top">${head}</div>` : ''}
        <p class="bd-cn__text">${esc(note.text)}</p>
        ${o.cite ? `<div class="bd-source-cite"><span class="bd-source-cite__body">${o.cite}</span></div>` : ''}
        <div class="bd-cn__foot">${likeHTML(note)}</div>
      </article>`;
  }

  function renderBoard() {
    const notes = state.data.notes;
    const facts = notes.filter(n => n.kind === 'fakt');

    // Bezugsgröße für die Schriftgrade ist das Maximum über das ganze
    // Board, nicht je Kategorie. Sonst wäre die einzige Karte einer
    // stillen Kategorie genauso groß wie der Publikumsliebling.
    const maxLikes = notes.reduce((m, n) => Math.max(m, Number(n.likes || 0)), 0);

    let html = '';

    // Ab Phase 2 stehen die Fakten oben — sie sind das Ergebnis der
    // Recherche und der Anker für das Gespräch in Phase 3. Als festes
    // Raster, nicht als Wolke: eine Quellenangabe will gelesen werden.
    if (phase() >= 2 && facts.length > 0) {
      html += `<div class="bd-facts">
                 <h2 class="bd-facts__head">📎 Belegte Fakten <span>${facts.length}</span></h2>
                 <div class="bd-facts__grid">${
                   facts.map(n => cardHTML(n, { cite: formatSource(n) })).join('')
                 }</div>
               </div>`;
    }

    html += '<div class="bd-clouds">';
    for (const cat of CATEGORIES) {
      const inCat = notes
        .filter(n => n.category === cat.id && (phase() < 2 || n.kind !== 'fakt'))
        // Meistgelikte zuerst: die Platzierung läuft von innen nach
        // außen, wer zuerst drankommt, landet in der Mitte.
        .sort((a, b) => (Number(b.likes || 0) - Number(a.likes || 0)) ||
                        String(a.created_at).localeCompare(String(b.created_at)));

      html += `<section class="bd-cloud-sec">
                 <h2 class="bd-cloud-sec__head">
                   <span class="bd-cloud-sec__icon">${cat.icon}</span>
                   <span>${esc(cat.label)}</span>
                   <span class="bd-cloud-sec__count">${inCat.length}</span>
                 </h2>
                 ${inCat.length
                   ? `<div class="bd-cloud">${inCat.map(n => cardHTML(n, {
                       size:   sizeFor(Number(n.likes || 0), maxLikes),
                       rotate: wantsRotate(n)
                     })).join('')}</div>`
                   : '<p class="bd-cloud-sec__empty">Noch nichts hier.</p>'}
               </section>`;
    }
    html += '</div>';

    $('bdBoard').innerHTML = html;
    layoutClouds();
  }

  /* ── Wolken-Layout ───────────────────────────────────────
     Archimedische Spirale von innen nach außen mit Kollisionsprüfung —
     dasselbe Grundprinzip wie bei einer klassischen Wordcloud, nur mit
     Karten statt Wörtern. Die Karten liegen absolut; gemessen wird über
     offsetWidth/offsetHeight, weil das die Maße VOR der Drehung liefert
     und die Rechnung damit unabhängig vom transform bleibt.          */

  const CLOUD_GAP = 10;

  function overlaps(a, b) {
    return !(a.x + a.w + CLOUD_GAP <= b.x || b.x + b.w + CLOUD_GAP <= a.x ||
             a.y + a.h + CLOUD_GAP <= b.y || b.y + b.h + CLOUD_GAP <= a.y);
  }

  /* Seitenverhältnis der Spirale.

     Eine kreisrunde Spirale in einem breiten Kasten wäre falsch: sie
     liefe oben und unten ins Leere, während links und rechts Platz
     frei bleibt. Eine ganz flache wäre aber genauso falsch — bei
     wenigen Karten muss sich die Wolke nicht über die volle Breite
     ziehen. Sie würde dann an den Rändern abgeschnitten, und weil die
     Kandidaten dort alle auf denselben x-Wert geklemmt werden, landen
     ausgerechnet die großen Karten nicht mehr in der Mitte.

     Also: erst die Fläche schätzen, die die Karten brauchen (Faktor 2,
     eine gepackte Wolke erreicht gut die halbe Fläche), daraus eine
     angenehm liegende Wunschgröße ableiten — und nur wenn die breiter
     wäre als die Spalte, an der Spalte abknicken und in die Höhe gehen. */
  const CLOUD_ASPECT = 0.45;   // Wunschverhältnis Höhe zu Breite

  function cloudRatio(items, boxW) {
    const area   = items.reduce((s, it) => s + it.ow * it.oh, 0) * 2;
    const idealW = Math.min(boxW, Math.sqrt(area / CLOUD_ASPECT));
    const idealH = area / Math.max(1, idealW);
    const ratio  = Math.max(0.35, Math.min(1.8, idealH / Math.max(1, idealW)));
    // In Stufen runden. Die Karten werden nacheinander gesetzt, jede nur
    // gegen die schon liegenden — eine neue Karte mit wenig Zustimmung
    // sortiert sich ans Ende und ließe alle anderen dort, wo sie waren.
    // Ohne das Runden würde aber die Fläche und damit die Ellipse bei
    // JEDER neuen Karte minimal kippen, und die ganze Wolke ordnete sich
    // im 5-Sekunden-Takt neu. Mitten in einer Unterrichtsstunde, in der
    // 30 Leute gleichzeitig schreiben, wäre das unlesbar.
    return Math.round(ratio / 0.05) * 0.05;
  }

  function findSpot(w, h, placed, boxW, ratio) {
    const cx   = boxW / 2;
    const maxX = Math.max(0, boxW - w);
    const mid  = Math.min(maxX, Math.max(0, cx - w / 2));

    if (!placed.length) return { x: mid, y: -h / 2, w, h };

    for (let i = 1; i <= 9000; i++) {
      const a = i * 0.12;          // Winkel — feine Schritte, dichtere Packung
      const r = 2 * a;             // Radius wächst linear mit dem Winkel
      let   x = cx + r * Math.cos(a) - w / 2;
      const y = r * ratio * Math.sin(a) - h / 2;
      // An den Rand klemmen statt verwerfen: sonst fällt in schmalen
      // Spalten fast jeder Kandidat weg und die Wolke wird zum Stapel.
      if (x < 0) x = 0; else if (x > maxX) x = maxX;

      const cand = { x, y, w, h };
      let hit = false;
      for (let k = 0; k < placed.length; k++) {
        if (overlaps(cand, placed[k])) { hit = true; break; }
      }
      if (!hit) return cand;
    }

    // Notausgang: unter alles legen. Passiert praktisch nur, wenn eine
    // Karte breiter ist als die Spalte — gestapelt ist besser als gar nicht.
    const bottom = placed.reduce((m, p) => Math.max(m, p.y + p.h), 0);
    return { x: mid, y: bottom + CLOUD_GAP, w, h };
  }

  function layoutCloud(box) {
    const cards = Array.prototype.slice.call(box.children);
    if (!cards.length) return;
    const boxW = box.clientWidth;
    if (!boxW) return;   // unsichtbar — später beim Anzeigen nochmal

    // Erst messen, dann platzieren: das Seitenverhältnis der Spirale
    // hängt an der Gesamtfläche, die muss vorher feststehen.
    const items = cards.map(el => {
      const w   = el.offsetWidth;
      const h   = el.offsetHeight;
      const rot = el.dataset.rot === '1';
      // Gedreht tauschen Breite und Höhe die Rollen. Belegt wird das
      // gedrehte Rechteck, gesetzt wird das ungedrehte Element.
      return { el, w, h, ow: rot ? h : w, oh: rot ? w : h };
    });

    const ratio  = cloudRatio(items, boxW);
    const placed = [];
    for (const it of items) {
      // Nie breiter als die Spalte rechnen — sonst findet findSpot
      // keinen gültigen x-Wert und alles landet im Notausgang.
      it.ow   = Math.min(it.ow, boxW);
      it.spot = findSpot(it.ow, it.oh, placed, boxW, ratio);
      placed.push(it.spot);
    }

    const minY = placed.reduce((m, p) => Math.min(m, p.y), Infinity);
    const maxY = placed.reduce((m, p) => Math.max(m, p.y + p.h), -Infinity);

    // Die Spirale trifft die Mitte nie exakt — je nachdem, wo zufällig
    // Platz war, hängt die ganze Wolke ein Stück links oder rechts und
    // lässt auf der anderen Seite eine leere Bahn. Deshalb am Ende das
    // umschließende Rechteck in der Spalte zentrieren.
    const minX  = placed.reduce((m, p) => Math.min(m, p.x), Infinity);
    const maxX  = placed.reduce((m, p) => Math.max(m, p.x + p.w), -Infinity);
    const shift = Math.round((boxW - (maxX - minX)) / 2 - minX);

    for (const it of items) {
      it.spot.x += shift;
    }

    for (const it of items) {
      // Das Element wird über seinen Mittelpunkt gesetzt: die Drehung
      // läuft um die Mitte, also muss die Mitte des ungedrehten
      // Elements auf die Mitte des belegten Rechtecks fallen.
      it.el.style.left = Math.round(it.spot.x + it.ow / 2 - it.w / 2) + 'px';
      it.el.style.top  = Math.round(it.spot.y - minY + it.oh / 2 - it.h / 2) + 'px';
    }

    box.style.height = Math.max(0, Math.round(maxY - minY)) + 'px';
  }

  function layoutClouds() {
    document.querySelectorAll('.bd-cloud').forEach(box => {
      try { layoutCloud(box); }
      catch (e) {
        // Lieber untereinander als übereinander: die Karten bleiben
        // lesbar, auch wenn die Platzierung schiefgeht.
        console.warn('[BOARD] Wolken-Layout fehlgeschlagen:', e.message);
        box.classList.add('bd-cloud--plain');
      }
    });
  }

  const TABLE_COLS = [
    { key: 'category',   label: 'Bereich'  },
    { key: 'stance',     label: 'Typ'      },
    { key: 'topics',     label: 'Thema'    },
    { key: 'kind',       label: 'Art'      },
    { key: 'text',       label: 'Text'     },
    { key: 'source',     label: 'Quelle'   },
    { key: 'author',     label: 'Von'      },
    { key: 'likes',      label: '👍'       },
    { key: 'created_at', label: 'Wann'     }
  ];

  function sortValue(note, key) {
    if (key === 'category') return catOf(note.category).label;
    if (key === 'stance')   return stanceOf(note.stance).label;
    if (key === 'kind')     return note.kind === 'fakt' ? 'Fakt' : 'Post-It';
    if (key === 'source')   return note.source_author || '';
    if (key === 'topics')   return topicsOf(note).map(t => topicOf(t).label).join(', ');
    if (key === 'likes')    return Number(note.likes || 0);
    return note[key] || '';
  }

  function renderTable() {
    const rows = state.data.notes.slice().sort((a, b) => {
      const av = sortValue(a, state.sort.col);
      const bv = sortValue(b, state.sort.col);
      // Zustimmungen sind Zahlen — als Text sortiert stünde 10 vor 2.
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : (String(av).toLowerCase() < String(bv).toLowerCase() ? -1
          : String(av).toLowerCase() > String(bv).toLowerCase() ?  1 : 0);
      return state.sort.dir === 'asc' ? cmp : -cmp;
    });

    const head = TABLE_COLS.map(c => {
      const arrow = state.sort.col === c.key ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th data-col="${c.key}">${esc(c.label)}${arrow}</th>`;
    }).join('');

    const body = rows.map(n => {
      const st = stanceOf(n.stance);
      const cite = formatSource(n);
      // In der Tabelle ist Platz — hier steht das Thema ausgeschrieben.
      const topics = topicsOf(n).map(t => `${topicOf(t).icon} ${esc(topicOf(t).label)}`).join('<br>');
      return `<tr>
        <td>${catOf(n.category).icon} ${esc(catOf(n.category).label)}</td>
        <td><span class="bd-pill bd-pill--${esc(n.stance)}">${esc(st.label)}</span></td>
        <td class="bd-td-topics">${topics || '—'}</td>
        <td>${n.kind === 'fakt' ? '📎 Fakt' : 'Post-It'}</td>
        <td>${esc(n.text)}</td>
        <td>${cite || '—'}</td>
        <td>${esc(n.author || '—')}</td>
        <td class="bd-td-likes">${Number(n.likes || 0) || '—'}</td>
        <td>${formatDate(n.created_at)}</td>
      </tr>`;
    }).join('');

    $('bdTable').innerHTML = rows.length
      ? `<div class="bd-table-wrap"><table class="bd-table">
           <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
      : '<p class="bd-cloud-sec__empty">Noch nichts auf dem Board.</p>';
  }

  function renderAdminBar() {
    const bar = $('bdAdminBar');
    if (!state.isAdmin) { bar.hidden = true; return; }
    bar.hidden = false;

    const sel = $('bdClusterSelect');
    const wanted = state.clusterId || state.data.cluster_id;
    const optsSig = state.clusters.map(c => c.id).join(',') + '|' + wanted;
    if (sel.dataset.sig !== optsSig) {
      sel.innerHTML = state.clusters.map(c =>
        `<option value="${esc(c.id)}"${c.id === wanted ? ' selected' : ''}>${esc(c.name)} (S${c.season})</option>`
      ).join('');
      sel.dataset.sig = optsSig;
    }

    $('bdPhasePrev').disabled = phase() <= 1;
    $('bdPhaseNext').disabled = phase() >= 3;
  }

  /* ── Erfassungs-Modal ────────────────────────────────── */
  function openModal(kind, note) {
    state.editing = {
      id:       note?.id ?? null,
      kind:     kind,
      category: note?.category ?? null,
      stance:   note?.stance ?? null,
      topics:   note ? topicsOf(note).slice() : []
    };

    $('bdModalTitle').textContent = note
      ? (kind === 'fakt' ? 'Fakt bearbeiten' : 'Post-It bearbeiten')
      : (kind === 'fakt' ? 'Neuer Fakt'      : 'Neues Post-It');

    $('bdCatChoice').innerHTML = CATEGORIES.map(c =>
      `<button type="button" data-val="${c.id}" aria-pressed="${c.id === state.editing.category}">${c.icon} ${esc(c.label)}</button>`
    ).join('');
    $('bdStanceChoice').innerHTML = STANCES.map(s =>
      `<button type="button" data-val="${s.id}" aria-pressed="${s.id === state.editing.stance}">${s.icon} ${esc(s.label)}</button>`
    ).join('');
    $('bdTopicChoice').innerHTML = TOPICS.map(t =>
      `<button type="button" data-val="${t.id}" aria-pressed="${state.editing.topics.includes(t.id)}">${t.icon} ${esc(t.label)}</button>`
    ).join('');

    $('bdText').value = note?.text ?? '';
    $('bdTextCount').textContent = ($('bdText').value || '').length;

    const isFact = kind === 'fakt';
    $('bdSource').hidden = !isFact;
    $('bdSrcUrl').value    = note?.source_url    ?? '';
    $('bdSrcAuthor').value = note?.source_author ?? '';
    $('bdSrcDate').value   = note?.source_date ? String(note.source_date).slice(0, 10) : '';
    $('bdSrcDate').max     = todayIso();

    ['bdText', 'bdSrcUrl', 'bdSrcAuthor', 'bdSrcDate'].forEach(id => $(id).classList.remove('bd-invalid'));
    $('bdModalError').hidden = true;
    $('bdModal').hidden = false;
    validate();
    $('bdText').focus();
  }

  function closeModal() {
    $('bdModal').hidden = true;
    state.editing = null;
  }

  /* Gibt zurück, was noch fehlt — und markiert die Felder. Genau
     dieselben Grenzen wie board_upsert_note; die RPC bleibt aber die
     Instanz, die entscheidet. */
  function validate() {
    if (!state.editing) return false;
    const isFact = state.editing.kind === 'fakt';
    const text   = $('bdText').value.trim();

    const bad = {
      text:   text.length < 3 || text.length > 200,
      url:    isFact && !isSafeUrl($('bdSrcUrl').value.trim()),
      author: isFact && ($('bdSrcAuthor').value.trim().length < 2 || $('bdSrcAuthor').value.trim().length > 120),
      date:   isFact && (!$('bdSrcDate').value || $('bdSrcDate').value > todayIso())
    };

    // Rot erst markieren, wenn im Feld überhaupt etwas steht — sonst
    // leuchtet das Formular schon vor dem ersten Tastendruck rot.
    $('bdText')     .classList.toggle('bd-invalid', bad.text   && text.length > 0);
    $('bdSrcUrl')   .classList.toggle('bd-invalid', bad.url    && $('bdSrcUrl').value.trim().length > 0);
    $('bdSrcAuthor').classList.toggle('bd-invalid', bad.author && $('bdSrcAuthor').value.trim().length > 0);
    $('bdSrcDate')  .classList.toggle('bd-invalid', bad.date   && !!$('bdSrcDate').value);

    const ok = !bad.text && !bad.url && !bad.author && !bad.date
            && !!state.editing.category && !!state.editing.stance;
    $('bdSave').disabled = !ok;
    return ok;
  }

  async function save() {
    if (!validate()) return;
    const e = state.editing;
    const isFact = e.kind === 'fakt';

    $('bdSave').disabled = true;
    const res = await window.BoardAPI.upsert({
      id:            e.id,
      kind:          e.kind,
      category:      e.category,
      stance:        e.stance,
      topics:        e.topics.slice(),
      text:          $('bdText').value.trim(),
      source_url:    isFact ? $('bdSrcUrl').value.trim()    : null,
      source_author: isFact ? $('bdSrcAuthor').value.trim() : null,
      source_date:   isFact ? $('bdSrcDate').value          : null,
      cluster_id:    state.clusterId
    });

    if (!res || !res.ok) {
      $('bdModalError').textContent = errText(res?.error);
      $('bdModalError').hidden = false;
      $('bdSave').disabled = false;
      return;
    }

    closeModal();
    toast(res.updated ? 'Gespeichert.' : 'Auf dem Board!');
    await load();
  }

  async function toggleLike(btn) {
    const note = state.data?.notes.find(n => n.id === btn.dataset.like);
    if (!note) return;
    btn.disabled = true;
    const res = await window.BoardAPI.toggleLike(note.id);
    if (!res || !res.ok) { btn.disabled = false; toast(errText(res?.error), true); return; }
    // Antwort direkt in den lokalen Stand übernehmen und neu zeichnen,
    // statt auf den nächsten Poll zu warten — ein Klick muss sofort
    // sichtbar sein. likes steckt in der Signatur, render() greift also,
    // und die Karte wächst sofort auf ihre neue Größe.
    note.likes       = res.likes;
    note.liked_by_me = res.liked;
    render();
  }

  /* ── Detail einer Karte ──────────────────────────────────
     Alles, was die Karte in der Wolke nicht zeigt, steht hier: wer sie
     geschrieben hat, in welche Kategorie sie gehört, die Quelle — und
     die Knöpfe zum Ändern und Löschen. Das hält die Wolke ruhig und
     macht trotzdem nichts unerreichbar.                              */
  function openDetail(id) {
    state.detailId = id;
    if (!renderDetail()) return;
    $('bdDetail').hidden = false;
    $('bdDetailClose').focus();
  }

  function closeDetail() {
    $('bdDetail').hidden = true;
    state.detailId = null;
  }

  function renderDetail() {
    const note = state.data?.notes.find(n => n.id === state.detailId);
    if (!note) { closeDetail(); return false; }

    const st  = stanceOf(note.stance);
    const cat = catOf(note.category);

    $('bdDetail').querySelector('.bd-modal').className =
      `bd-modal bd-modal--detail bd-detail--${note.stance}`;

    $('bdDetailStance').innerHTML =
      `<span class="bd-pill bd-pill--${esc(note.stance)}">${st.icon} ${esc(st.label)}</span>` +
      (note.kind === 'fakt' ? '<span class="bd-pill bd-pill--fakt">📎 Fakt</span>' : '');

    $('bdDetailText').textContent = note.text;

    const cite = formatSource(note);
    $('bdDetailCite').hidden = !cite;
    if (cite) {
      $('bdDetailCite').innerHTML =
        `<span class="bd-source-cite__label">Quelle</span>
         <span class="bd-source-cite__body">${cite}</span>`;
    }

    const topics = topicsOf(note).map(t => {
      const i = topicOf(t);
      return `<span class="bd-detail__topic">${i.icon} ${esc(i.label)}</span>`;
    }).join('');

    $('bdDetailMeta').innerHTML =
      `<div class="bd-detail__row"><span>Bereich</span><strong>${cat.icon} ${esc(cat.label)}</strong></div>
       ${topics ? `<div class="bd-detail__row"><span>Thema</span><strong>${topics}</strong></div>` : ''}
       <div class="bd-detail__row"><span>Von</span><strong>${esc(note.author || 'Unbekannt')}${note.is_mine ? ' (du)' : ''}</strong></div>
       <div class="bd-detail__row"><span>Zustimmung</span><strong>👍 ${Number(note.likes || 0)}</strong></div>`;

    const mayEdit = canEdit(note);
    $('bdDetailEdit').hidden = !mayEdit;
    $('bdDetailDel').hidden  = !mayEdit;
    return true;
  }

  /* ── Bestätigen ──────────────────────────────────────── */
  function confirmAsk(title, text, fn) {
    $('bdConfirmTitle').textContent = title;
    $('bdConfirmText').textContent  = text;
    state.confirmFn = fn;
    $('bdConfirm').hidden = false;
  }

  /* ── Verdrahtung ─────────────────────────────────────── */
  function wire() {
    $('bdNewIdea').addEventListener('click', () => openModal('idee', null));
    $('bdNewFact').addEventListener('click', () => openModal('fakt', null));

    $('bdCatChoice').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || !state.editing) return;
      state.editing.category = b.dataset.val;
      $('bdCatChoice').querySelectorAll('button').forEach(x =>
        x.setAttribute('aria-pressed', String(x === b)));
      validate();
    });
    $('bdStanceChoice').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || !state.editing) return;
      state.editing.stance = b.dataset.val;
      $('bdStanceChoice').querySelectorAll('button').forEach(x =>
        x.setAttribute('aria-pressed', String(x === b)));
      validate();
    });

    // Themen sind Mehrfachauswahl: jeder Klick schaltet einzeln um,
    // keiner hebt die anderen auf. Keine Pflicht — validate() prüft
    // die Auswahl deshalb gar nicht.
    $('bdTopicChoice').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || !state.editing) return;
      const id = b.dataset.val;
      const i  = state.editing.topics.indexOf(id);
      if (i >= 0) state.editing.topics.splice(i, 1);
      else        state.editing.topics.push(id);
      b.setAttribute('aria-pressed', String(i < 0));
    });

    $('bdText').addEventListener('input', () => {
      $('bdTextCount').textContent = $('bdText').value.length;
      validate();
    });
    ['bdSrcUrl', 'bdSrcAuthor', 'bdSrcDate'].forEach(id =>
      $(id).addEventListener('input', validate));

    $('bdSave').addEventListener('click', save);
    $('bdCancel').addEventListener('click', closeModal);
    $('bdModal').addEventListener('click', ev => { if (ev.target === $('bdModal')) closeModal(); });

    $('bdConfirmNo').addEventListener('click', () => { $('bdConfirm').hidden = true; state.confirmFn = null; });
    $('bdConfirmYes').addEventListener('click', async () => {
      const fn = state.confirmFn;
      $('bdConfirm').hidden = true; state.confirmFn = null;
      if (fn) await fn();
    });

    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      if (!$('bdModal').hidden)   closeModal();
      if (!$('bdDetail').hidden)  closeDetail();
      if (!$('bdConfirm').hidden) { $('bdConfirm').hidden = true; state.confirmFn = null; }
    });

    // Karten (Event-Delegation — die Karten werden bei jedem Poll neu gebaut)
    $('bdBoard').addEventListener('click', async ev => {
      const likeBtn = ev.target.closest('[data-like]');
      if (likeBtn) {
        // Zustimmen, ohne das Detail zu öffnen: der Knopf liegt auf der
        // Karte, und die Karte ist selbst klickbar.
        ev.stopPropagation();
        await toggleLike(likeBtn);
        return;
      }
      const card = ev.target.closest('[data-note]');
      if (card) openDetail(card.dataset.note);
    });

    // Tastatur: die Karten sind role="button", also müssen Enter und
    // Leertaste dasselbe tun wie ein Klick.
    $('bdBoard').addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('[data-note]');
      if (!card || ev.target.closest('[data-like]')) return;
      ev.preventDefault();
      openDetail(card.dataset.note);
    });

    // ── Detail-Ansicht ──
    $('bdDetailClose').addEventListener('click', closeDetail);
    $('bdDetail').addEventListener('click', ev => { if (ev.target === $('bdDetail')) closeDetail(); });
    $('bdDetailEdit').addEventListener('click', () => {
      const note = state.data?.notes.find(n => n.id === state.detailId);
      if (!note) return;
      closeDetail();
      openModal(note.kind, note);
    });
    $('bdDetailDel').addEventListener('click', () => {
      const note = state.data?.notes.find(n => n.id === state.detailId);
      if (!note) return;
      closeDetail();
      confirmAsk('Karte löschen?', `„${note.text}" wird gelöscht. Das lässt sich nicht rückgängig machen.`,
        async () => {
          const res = await window.BoardAPI.remove(note.id);
          if (!res || !res.ok) { toast(errText(res?.error), true); return; }
          toast('Gelöscht.');
          await load();
        });
    });

    // Tabellen-Sortierung
    $('bdTable').addEventListener('click', ev => {
      const th = ev.target.closest('th[data-col]'); if (!th) return;
      const col = th.dataset.col;
      state.sort = (state.sort.col === col)
        ? { col, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' };
      render();
    });

    // Ansichts-Umschalter
    $('bdViewSwitch').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-view]'); if (!b) return;
      state.view = b.dataset.view;
      try { sessionStorage.setItem(VIEW_KEY, state.view); } catch (e) {}
      render();
    });

    // ── Admin-Leiste ──
    $('bdClusterSelect').addEventListener('change', async ev => {
      state.clusterId = ev.target.value;
      try { sessionStorage.setItem(CLUSTER_KEY, state.clusterId); } catch (e) {}
      state.lastSig = null;
      await load();
    });

    const setPhase = async p => {
      const res = await window.BoardAPI.setPhase(state.clusterId, p);
      if (!res || !res.ok) { toast(errText(res?.error), true); return; }
      toast(`Phase ${p} läuft.`);
      await load();
    };
    $('bdPhaseNext').addEventListener('click', () => setPhase(Math.min(3, phase() + 1)));
    $('bdPhasePrev').addEventListener('click', () => setPhase(Math.max(1, phase() - 1)));

    $('bdReset').addEventListener('click', () => {
      const n = state.data?.notes.length ?? 0;
      confirmAsk('Board zurücksetzen?',
        `Alle ${n} Karten dieses Kurses werden gelöscht und die Phase geht zurück auf 1. Das lässt sich nicht rückgängig machen.`,
        async () => {
          const res = await window.BoardAPI.reset(state.clusterId);
          if (!res || !res.ok) { toast(errText(res?.error), true); return; }
          toast(`Board geleert (${res.deleted} Karten).`);
          await load();
        });
    });

    // Zurückkehren an den Tab = sofort frisch, nicht erst beim nächsten Takt.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load({ quiet: true });
    });

    // Die Wolke ist auf die Spaltenbreite gerechnet — dreht jemand das
    // Tablet, muss sie neu gepackt werden. Nur neu platzieren, nicht neu
    // laden: die Karten stehen ja schon im DOM.
    let resizeT = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(layoutClouds, 180);
    });

    // Cinzel und Nunito kommen per @import nach. Bis sie da sind, misst
    // der Browser die Karten in der Ersatzschrift — danach passen die
    // Kästen nicht mehr zum Text, also einmal nachrechnen.
    if (document.fonts?.ready) document.fonts.ready.then(layoutClouds).catch(() => {});
  }

  /* ── Boot ────────────────────────────────────────────── */
  async function boot() {
    wire();

    try { state.view = sessionStorage.getItem(VIEW_KEY) || 'board'; } catch (e) {}

    if (!window.waitForSession) {
      showStatus('Der Session-Layer fehlt — lade die Seite neu.', true);
      return;
    }
    await window.waitForSession();

    const s = window.getSessionUser && window.getSessionUser();
    if (!s) {
      showStatus('Das Zukunftsboard gehört deinem Kurs — dafür musst du angemeldet sein.', true);
      return;
    }

    state.isAdmin = !!(s.is_admin || s.is_superadmin);

    if (state.isAdmin) {
      // Admins hängen in keinem oder in einem fremden Kurs — sie wählen
      // aus. Die Auswahl liegt im sessionStorage: auf einem geteilten
      // Gerät soll sie mit dem Tab verschwinden.
      state.clusters = await window.BoardAPI.listClusters();
      let saved = null;
      try { saved = sessionStorage.getItem(CLUSTER_KEY); } catch (e) {}
      const known = id => state.clusters.some(c => c.id === id);
      state.clusterId = (saved && known(saved)) ? saved
                      : (s.cluster_id && known(s.cluster_id)) ? s.cluster_id
                      : (state.clusters[0]?.id ?? null);
      if (!state.clusterId) {
        showStatus('Für deine Schule ist noch kein Kurs angelegt.', true);
        return;
      }
    }

    await load();
    setInterval(() => {
      if (document.visibilityState === 'visible') load({ quiet: true });
    }, POLL_MS);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
