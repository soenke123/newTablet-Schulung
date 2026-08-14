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

  /* Die Phasen sind auch die beiden Fächer des Boards: in Phase 1 liegen
     die Post-Its, in Phase 2 die Fakten. Man sieht immer genau eines von
     beiden — deshalb tragen die Texte hier zusätzlich, WAS man gerade
     vor sich hat. */
  const PHASE_HINT = {
    1: 'Phase 1 · Sammeln — Was könnten KI, Social Media und Handy-Games bewirken? Halte Chancen, Risiken und Vermutungen fest. Du hast 8 Post-Its.',
    2: 'Phase 2 · Belegen — Such dir einen Punkt aus und finde einen echten Fakt dazu. Einer ist Pflicht, zwei sind möglich — jeweils mit vollständiger Quelle.',
    3: 'Phase 3 · Besprechen — Das Board ist eingefroren. Jetzt schauen wir gemeinsam drauf.'
  };

  const KIND_LABEL = { idee: 'Post-It', fakt: 'Fakt' };

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
    fact_not_likable:      'Fakten sind belegt, nicht gemeint — Zustimmung gibt es nur auf Post-Its.',
    network:               'Keine Verbindung zum Server. Versuch es gleich nochmal.'
  };

  const CLUSTER_KEY = 'bd_cluster';
  const VIEW_KEY    = 'bd_view';
  const CAT_KEY     = 'bd_cat';
  const VPHASE_KEY  = 'bd_vphase';
  const POLL_MS     = 5000;

  /* ── Zustand ─────────────────────────────────────────── */
  const state = {
    data:      null,   // letzte Antwort von board_get
    isAdmin:   false,
    clusters:  [],
    clusterId: null,   // nur Admins wählen aktiv; Schüler bleiben auf null
    view:      'board',
    cat:       'persoenlich',   // sichtbare Kategorie in der Wolken-Ansicht
    viewPhase: 1,               // welches Fach man ansieht: 1 = Post-Its, 2 = Fakten
    viewPhaseSaved: false,      // lag beim Start schon eine Wahl im sessionStorage?
    lastPhase: null,            // letzte Kurs-Phase — zum Mitziehen beim Wechsel
    slide:     0,               // Richtung der Einblendung beim Wechsel
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

  /* ── Rechte — dieselbe Logik wie serverseitig (0062/0064) ─
     Neu anlegen darf man nur in der Phase, der die Kartenart gehört:
     Post-Its in Phase 1, Fakten ab Phase 2. Ändern und Löschen sind
     davon getrennt — ein Post-It bleibt auch in Phase 2 noch
     korrigierbar, man sieht es ja im Rückblick weiter. Was fertig ist,
     nachbessern zu dürfen, ist etwas anderes, als nachträglich Neues
     nachzuschieben.                                                   */
  function phase() { return state.data?.phase ?? 1; }

  function canAdd(kind) {
    if (state.isAdmin) return true;
    if (phase() >= 3) return false;
    return kind === 'fakt' ? phase() >= 2 : phase() === 1;
  }

  function canEdit(note) {
    if (state.isAdmin) return true;
    if (!note.is_mine) return false;
    if (phase() >= 3) return false;
    return note.kind === 'fakt' ? phase() >= 2 : true;
  }

  /* Zustimmung gibt es nur auf Post-Its. Ein Fakt steht oder fällt mit
     seiner Quelle — ob er einem gefällt, ändert daran nichts. */
  function canLike(note) {
    return note.kind !== 'fakt' && !note.is_mine;
  }

  /* ── Fächer: Phase 1 = Post-Its, Phase 2 = Fakten ────────
     Sichtbar ist immer genau eines. Welches, sagt state.viewPhase —
     umschaltbar über die Phasenleiste, aber nur so weit, wie der Kurs
     schon ist. */
  function maxViewPhase() { return phase() >= 2 ? 2 : 1; }
  function viewKind()     { return state.viewPhase === 2 ? 'fakt' : 'idee'; }

  function setViewPhase(n, opts) {
    const v = Math.max(1, Math.min(maxViewPhase(), Number(n) || 1));
    if (v === state.viewPhase && !(opts && opts.force)) return;
    state.viewPhase = v;
    state.slide = 0;
    try { sessionStorage.setItem(VPHASE_KEY, String(v)); } catch (e) {}
    if (!(opts && opts.silent)) render();
  }

  // Alle Karten des sichtbaren Fachs — die Grundlage für Wolke,
  // Fakten-Raster, Tabelle und die Zähler in der Leiste.
  function visibleNotes() {
    return (state.data?.notes || []).filter(n => n.kind === viewKind());
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

    /* Schaltet die Lehrkraft auf Phase 2, sollen alle Tablets auch bei
       den Fakten landen — sonst sitzt der halbe Kurs weiter vor den
       Post-Its und wundert sich, wo der Plus-Knopf hin ist. Beim Sprung
       auf Phase 3 wird nicht umgeschaltet: dort gibt es kein eigenes
       Fach, und wer gerade etwas ansieht, soll es behalten. */
    const p = res.phase ?? 1;
    if (state.lastPhase === null) {
      // Erster Ladevorgang: wer neu dazukommt, während der Kurs schon
      // bei den Fakten ist, soll auch dort landen — es sei denn, er hat
      // in diesem Tab schon selbst umgeschaltet.
      if (!state.viewPhaseSaved) setViewPhase(Math.min(p, 2), { silent: true });
    } else if (p !== state.lastPhase && p <= 2) {
      setViewPhase(p, { silent: true });
    }
    state.lastPhase = p;
    // Phase zurückgedreht? Dann kann das gewählte Fach zu weit vorn
    // liegen — hart auf das begrenzen, was offen ist.
    setViewPhase(state.viewPhase, { silent: true });

    render();
  }

  function showStatus(msg, isError) {
    const s = $('bdStatus');
    s.textContent = msg;
    s.className = 'bd-status' + (isError ? ' bd-status--error' : '');
    s.hidden = false;
    $('bdBoard').hidden = true;
    $('bdTable').hidden = true;
    $('bdCatNav').hidden = true;
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
      d.cluster_id, d.phase, d.is_admin, state.view, state.cat, state.sort,
      state.viewPhase,
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
    renderAdminBar();

    $('bdViewSwitch').hidden = false;
    document.querySelectorAll('#bdViewSwitch button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === state.view);
    });

    if (state.view === 'board') {
      $('bdTable').hidden = true;
      $('bdBoard').hidden = false;
      renderCatNav();
      renderBoard();
    } else {
      $('bdBoard').hidden  = true;
      $('bdCatNav').hidden = true;
      $('bdTable').hidden  = false;
      renderTable();
    }

    // Offenes Detail mitziehen: sonst zeigt es nach einer Zustimmung
    // von einem anderen Tablet noch den alten Zählerstand.
    if (state.detailId && !$('bdDetail').hidden) renderDetail();
  }

  /* Die Phasenleiste ist zweierlei zugleich: Anzeige, wo der Kurs steht
     (goldener Rand), und Umschalter zwischen den beiden Fächern
     (gefüllt = das sieht man gerade). Getrennte Signale für zwei
     getrennte Fragen — „wo sind wir?" und „was schaue ich an?". */
  function renderPhases() {
    const p    = phase();
    const max  = maxViewPhase();
    const cnt  = { 1: 0, 2: 0 };
    (state.data.notes || []).forEach(n => { cnt[n.kind === 'fakt' ? 2 : 1]++; });

    $('bdPhases').hidden = false;
    document.querySelectorAll('.bd-phase').forEach(el => {
      const n      = Number(el.dataset.phase);
      const locked = n < 3 && n > max;

      el.classList.toggle('bd-phase--running', n === p);
      el.classList.toggle('bd-phase--shown',   n < 3 && n === state.viewPhase);
      el.classList.toggle('bd-phase--locked',  locked);

      const c = el.querySelector('.bd-phase__count');
      if (c) c.textContent = locked ? '·' : cnt[n];

      if (el.tagName !== 'BUTTON') return;
      el.disabled = locked;
      el.setAttribute('aria-pressed', String(n === state.viewPhase));
      el.title = locked
        ? 'Diese Phase hat deine Lehrkraft noch nicht freigeschaltet.'
        : (n === 1 ? 'Die Post-Its des Kurses ansehen' : 'Die belegten Fakten ansehen');
    });
  }

  function renderHint() {
    const h = $('bdHint');
    const p = phase(), v = state.viewPhase;
    const fach = v === 1 ? 'die Post-Its' : 'die belegten Fakten';

    h.textContent =
      p >= 3
        ? `${PHASE_HINT[3]} Du siehst gerade ${fach} — oben wechselst du zwischen beidem.`
      : v === p
        ? PHASE_HINT[p]
      : v === 1
        ? 'Rückblick auf Phase 1 · Sammeln — hier stehen die Post-Its des Kurses. Neue kommen jetzt keine mehr dazu; zustimmen kannst du weiter.'
        : PHASE_HINT[2];

    h.hidden = false;
  }

  /* Nur das Kontingent des Fachs, das man ansieht. Die andere Zahl
     stünde nur daneben und wäre gerade nicht die Frage. */
  function renderQuota() {
    const me = state.data.me || {};
    if (state.isAdmin) {
      $('bdQuota').innerHTML = `${visibleNotes().length} von ${state.data.notes.length} Karten im Kurs`;
      return;
    }
    $('bdQuota').innerHTML = state.viewPhase === 1
      ? `Post-Its <strong>${me.ideas_used ?? 0}/${me.ideas_max ?? 8}</strong>`
      : `Fakten <strong>${me.facts_used ?? 0}/${me.facts_max ?? 2}</strong>`;
  }

  /* Voll? Dann bleibt der Plus-Knopf sichtbar, aber tot — verschwinden
     würde die Frage „wo kann ich schreiben?" mit sich nehmen, ohne sie
     zu beantworten. */
  function quotaFull() {
    const me = state.data.me || {};
    if (state.isAdmin) return false;
    return state.viewPhase === 1
      ? (me.ideas_used ?? 0) >= (me.ideas_max ?? 8)
      : (me.facts_used ?? 0) >= (me.facts_max ?? 2);
  }

  /* ── Karten in der Wolke ─────────────────────────────────
     Auf der Karte steht nur der Text. Kein Kategorie-Icon (die
     Kategorie ist der Reiter darüber), keine Themen-Symbole, kein
     Name, keine Zahl, keine Knöpfe — das alles steht im Detail, einen
     Tipp entfernt. Wie stark eine Aussage getragen wird, sagt die
     Größe der Karte, nicht eine Ziffer daneben.

     Eine einzige Ausnahme: hat man selbst zugestimmt, sitzt ein
     kleiner Daumen in der Ecke. Ohne den weiß niemand mehr, wo er
     schon zugestimmt hat — und ein zweiter Doppeltipp nähme die
     Zustimmung wieder weg, ohne dass man es merkt.                  */

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

  function cardHTML(note, opts) {
    const o = opts || {};
    // Größere Karten dürfen etwas breiter werden, sonst wird eine
    // 2-rem-Karte zu einem schmalen hohen Turm. min(…,100%) hält sie
    // auf schmalen Geräten trotzdem in der Spalte.
    const style = o.size
      ? ` style="font-size:${o.size.toFixed(2)}rem;max-width:min(${Math.round(200 + (o.size - LIKE_SIZE_MIN) * 130)}px,100%)"`
      : '';

    const hint = note.is_mine
      ? 'Antippen: deine Karte ansehen, ändern oder löschen'
      : canLike(note)
        ? 'Antippen für Details · Doppeltippen zum Zustimmen'
        : 'Antippen für Details und Quelle';

    // Bewusst ohne role="button": die Karte ist zwar antippbar, aber
    // role="button" macht ihren Inhalt für Screenreader zu reiner
    // Dekoration — und der Inhalt ist hier die ganze Information.
    // Der Daumen gilt nur dort, wo man zustimmen kann. Auf einem Fakt
    // wäre er ein Versprechen, das der Doppeltipp nicht hält.
    const liked = !!note.liked_by_me && note.kind !== 'fakt';

    return `<article class="bd-cn bd-cn--${esc(note.stance)}${note.is_mine ? ' bd-cn--mine' : ''}${liked ? ' bd-cn--liked' : ''}"
             data-note="${esc(note.id)}"${style}
             tabindex="0" title="${hint}">
        ${liked ? '<span class="bd-cn__liked" title="Du hast zugestimmt">👍</span>' : ''}
        <p class="bd-cn__text">${esc(note.text)}</p>
        ${o.cite ? `<div class="bd-source-cite"><span class="bd-source-cite__body">${o.cite}</span></div>` : ''}
      </article>`;
  }

  /* Karten des sichtbaren Fachs in einer Kategorie. Post-Its nach
     Zustimmung — die Platzierung in der Wolke läuft von innen nach
     außen, wer zuerst drankommt, landet in der Mitte. Fakten stehen im
     Raster und dort schlicht nach Alter; eine Reihenfolge nach
     Zustimmung gäbe es dort ohnehin nicht mehr. */
  function notesOf(catId) {
    const list = visibleNotes().filter(n => n.category === catId);
    return viewKind() === 'fakt'
      ? list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      : list.sort((a, b) => (Number(b.likes || 0) - Number(a.likes || 0)) ||
                            String(a.created_at).localeCompare(String(b.created_at)));
  }

  function catIndex() {
    const i = CATEGORIES.findIndex(c => c.id === state.cat);
    return i < 0 ? 0 : i;
  }

  /* Reihum, nicht am Ende anstoßen: beim Wischen soll es weitergehen,
     nicht plötzlich klemmen. */
  function gotoCat(delta) {
    const i = (catIndex() + delta + CATEGORIES.length) % CATEGORIES.length;
    setCat(CATEGORIES[i].id, delta);
  }

  function setCat(id, dir) {
    if (id === state.cat) return;
    state.cat   = id;
    state.slide = dir || 0;
    try { sessionStorage.setItem(CAT_KEY, id); } catch (e) {}
    render();
  }

  function renderCatNav() {
    $('bdCatNav').hidden = false;

    $('bdCatTabs').innerHTML = CATEGORIES.map(c => {
      const n = notesOf(c.id).length;
      return `<button type="button" role="tab" data-cat="${c.id}"
                class="bd-cattab${c.id === state.cat ? ' bd-cattab--on' : ''}"
                aria-selected="${c.id === state.cat}" title="${esc(c.label)}">
                <span class="bd-cattab__icon">${c.icon}</span>
                <span class="bd-cattab__count">${n}</span>
              </button>`;
    }).join('');

    const cat = catOf(state.cat);
    const n   = notesOf(state.cat).length;
    $('bdCatName').innerHTML =
      `${esc(cat.label)} <span class="bd-catnav__count">${n}</span>`;

    /* Der Plus-Knopf gehört zum Bereichsnamen, nicht in eine eigene
       Leiste: was man schreibt, landet genau in dem Bereich, der
       danebensteht — und im Fach, das man gerade ansieht. Damit ist
       die Frage nach der Kategorie im Formular erledigt. */
    const kind = viewKind();
    const add  = $('bdCatAdd');
    add.hidden = !canAdd(kind);
    if (!add.hidden) {
      const full = quotaFull();
      add.disabled = full;
      add.title = full
        ? (kind === 'fakt' ? 'Deine 2 Fakten sind vergeben.' : 'Deine 8 Post-Its sind vergeben.')
        : `Neue${kind === 'fakt' ? 'n Fakt' : 's Post-It'} in „${cat.label}“`;
      add.setAttribute('aria-label', add.title);
      add.classList.toggle('bd-catadd--fact', kind === 'fakt');
    }
  }

  function renderBoard() {
    const inCat = notesOf(state.cat);

    // Richtung der Einblendung: beim Wischen nach links kommt die neue
    // Wolke von rechts herein. Wird nach dem Zeichnen zurückgesetzt,
    // damit ein stiller Poll nicht jedes Mal neu animiert.
    const slide = state.slide > 0 ? ' bd-cloud--from-right'
                : state.slide < 0 ? ' bd-cloud--from-left' : '';
    state.slide = 0;

    if (!inCat.length) {
      $('bdBoard').innerHTML = `<p class="bd-cloud-sec__empty">${emptyText()}</p>`;
      return;
    }

    /* Fakten stehen im festen Raster, nicht in der Wolke: eine
       Quellenangabe will gelesen und nicht gepackt werden — und ohne
       Zustimmung gäbe es auch keine Größe, die etwas erzählt. */
    if (viewKind() === 'fakt') {
      $('bdBoard').innerHTML =
        `<div class="bd-factgrid${slide}">${
          inCat.map(n => cardHTML(n, { cite: formatSource(n) })).join('')
        }</div>`;
      return;
    }

    // Bezugsgröße für die Schriftgrade ist das Maximum über das ganze
    // Board, nicht je Kategorie. Sonst wäre die einzige Karte einer
    // stillen Kategorie genauso groß wie der Publikumsliebling.
    const maxLikes = visibleNotes().reduce((m, n) => Math.max(m, Number(n.likes || 0)), 0);

    $('bdBoard').innerHTML =
      `<div class="bd-cloud${slide}">${inCat.map(n => cardHTML(n, {
         size: sizeFor(Number(n.likes || 0), maxLikes)
       })).join('')}</div>`;

    layoutClouds();
  }

  function emptyText() {
    if (viewKind() === 'fakt') {
      return 'Für diesen Bereich gibt es noch keinen belegten Fakt. ' +
             (canAdd('fakt') ? 'Trag den ersten ein — mit Link, Autorin oder Autor und Datum.' : '');
    }
    return 'Hier steht noch nichts. ' +
           (canAdd('idee') ? 'Schreib das erste Post-It für diesen Bereich.' : '');
  }

  /* ── Wolken-Layout ───────────────────────────────────────
     Archimedische Spirale von innen nach außen mit Kollisionsprüfung —
     dasselbe Grundprinzip wie bei einer klassischen Wordcloud, nur mit
     Karten statt Wörtern. Alle Karten stehen waagerecht; gedrehte gab
     es einmal, sie kosteten aber mehr Lesbarkeit als sie an Wirkung
     brachten. Die Karten liegen absolut, gemessen wird über
     offsetWidth/offsetHeight.                                        */

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
    const items = cards.map(el => ({
      el,
      // Nie breiter als die Spalte rechnen — sonst findet findSpot
      // keinen gültigen x-Wert und alles landet im Notausgang.
      w: Math.min(el.offsetWidth, boxW),
      h: el.offsetHeight
    }));

    const ratio  = cloudRatio(items, boxW);
    const placed = [];
    for (const it of items) {
      it.spot = findSpot(it.w, it.h, placed, boxW, ratio);
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
      it.el.style.left = Math.round(it.spot.x + shift) + 'px';
      it.el.style.top  = Math.round(it.spot.y - minY) + 'px';
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

  /* Die Spalten hängen am Fach: eine „Art"-Spalte, in der überall
     dasselbe steht, ist keine Information — und eine Quellenspalte
     voller Striche (Post-Its haben keine) genauso wenig. */
  function tableCols() {
    const cols = [
      { key: 'category', label: 'Bereich' },
      { key: 'stance',   label: 'Typ'     },
      { key: 'topics',   label: 'Thema'   },
      { key: 'text',     label: 'Text'    }
    ];
    cols.push(viewKind() === 'fakt'
      ? { key: 'source', label: 'Quelle' }
      : { key: 'likes',  label: '👍'     });
    cols.push({ key: 'author',     label: 'Von'  });
    cols.push({ key: 'created_at', label: 'Wann' });
    return cols;
  }

  function sortValue(note, key) {
    if (key === 'category') return catOf(note.category).label;
    if (key === 'stance')   return stanceOf(note.stance).label;
    if (key === 'source')   return note.source_author || '';
    if (key === 'topics')   return topicsOf(note).map(t => topicOf(t).label).join(', ');
    if (key === 'likes')    return Number(note.likes || 0);
    return note[key] || '';
  }

  function renderTable() {
    const cols = tableCols();
    // Beim Fachwechsel kann die Sortierspalte verschwinden (👍 ↔ Quelle).
    // Dann still auf das Alter zurückfallen statt nach einem Wert zu
    // sortieren, den die Tabelle gar nicht mehr zeigt.
    if (!cols.some(c => c.key === state.sort.col)) {
      state.sort = { col: 'created_at', dir: 'desc' };
    }

    const rows = visibleNotes().slice().sort((a, b) => {
      const av = sortValue(a, state.sort.col);
      const bv = sortValue(b, state.sort.col);
      // Zustimmungen sind Zahlen — als Text sortiert stünde 10 vor 2.
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : (String(av).toLowerCase() < String(bv).toLowerCase() ? -1
          : String(av).toLowerCase() > String(bv).toLowerCase() ?  1 : 0);
      return state.sort.dir === 'asc' ? cmp : -cmp;
    });

    const head = cols.map(c => {
      const arrow = state.sort.col === c.key ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th data-col="${c.key}">${esc(c.label)}${arrow}</th>`;
    }).join('');

    /* Eine Zelle je Spalte — dieselbe Liste, die auch den Kopf baut,
       sonst rutschen Kopf und Körper früher oder später auseinander. */
    function cell(n, key) {
      switch (key) {
        case 'category': return `<td>${catOf(n.category).icon} ${esc(catOf(n.category).label)}</td>`;
        case 'stance':   return `<td><span class="bd-pill bd-pill--${esc(n.stance)}">${esc(stanceOf(n.stance).label)}</span></td>`;
        // In der Tabelle ist Platz — hier steht das Thema ausgeschrieben.
        case 'topics':   return `<td class="bd-td-topics">${
                            topicsOf(n).map(t => `${topicOf(t).icon} ${esc(topicOf(t).label)}`).join('<br>') || '—'
                          }</td>`;
        case 'text':     return `<td>${esc(n.text)}</td>`;
        case 'source':   return `<td>${formatSource(n) || '—'}</td>`;
        case 'likes':    return `<td class="bd-td-likes">${Number(n.likes || 0) || '—'}</td>`;
        case 'author':   return `<td>${esc(n.author || '—')}</td>`;
        default:         return `<td>${formatDate(n.created_at)}</td>`;
      }
    }

    // Auch hier führt die Zeile ins Detail — dieselbe Karte, dieselben
    // Knöpfe. Die Liste ist eine andere Sicht auf dasselbe Board, keine
    // Sackgasse.
    const body = rows.map(n =>
      `<tr data-note="${esc(n.id)}" tabindex="0" title="Antippen für Details">${
        cols.map(c => cell(n, c.key)).join('')
      }</tr>`
    ).join('');

    $('bdTable').innerHTML = rows.length
      ? `<div class="bd-table-wrap"><table class="bd-table">
           <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
      : `<p class="bd-cloud-sec__empty">${
           viewKind() === 'fakt' ? 'Noch keine belegten Fakten im Kurs.' : 'Noch keine Post-Its im Kurs.'
         }</p>`;
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

  /* ── Erfassungs-Modal ──────────────────────────────────────
     Der Bereich wird hier nicht mehr gewählt: neue Karten erben ihn
     von dem Bereich, in dem der Plus-Knopf steht, bestehende behalten
     ihren. Eine Entscheidung weniger im Formular — und keine Karte
     mehr, die in einem Bereich landet, den man gerade nicht ansieht. */
  function openModal(kind, note, category) {
    const cat = note?.category ?? category ?? state.cat;

    state.editing = {
      id:       note?.id ?? null,
      kind:     kind,
      category: cat,
      stance:   note?.stance ?? null,
      topics:   note ? topicsOf(note).slice() : []
    };

    $('bdModalTitle').textContent = note
      ? (kind === 'fakt' ? 'Fakt bearbeiten' : 'Post-It bearbeiten')
      : (kind === 'fakt' ? 'Neuer Fakt'      : 'Neues Post-It');

    const c = catOf(cat);
    $('bdModalCat').innerHTML =
      `<span class="bd-modal__cat-label">Bereich</span>
       <strong>${c.icon} ${esc(c.label)}</strong>`;

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

  async function toggleLike(id) {
    const note = state.data?.notes.find(n => n.id === id);
    if (!note || note._busy) return;
    note._busy = true;
    const res = await window.BoardAPI.toggleLike(id);
    note._busy = false;
    if (!res || !res.ok) { toast(errText(res?.error), true); render(); return; }
    // Antwort direkt in den lokalen Stand übernehmen und neu zeichnen,
    // statt auf den nächsten Poll zu warten — ein Tipp muss sofort
    // wirken. likes steckt in der Signatur, render() greift also,
    // und die Karte wächst sofort auf ihre neue Größe.
    note.likes       = res.likes;
    note.liked_by_me = res.liked;
    render();
  }

  /* Kurze Rückmeldung am Finger. Muss sein, seit die Karte keine Zahl
     mehr trägt — sonst bliebe von einem Doppeltipp nur, dass die Karte
     ein bisschen anders liegt. Hängt bewusst am <body> und nicht an der
     Karte: die Wolke wird gleich neu gezeichnet, und dabei verschwände
     alles, was in ihr steckt. */
  function likeBurst(card, on) {
    const r = card.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = 'bd-burst' + (on ? '' : ' bd-burst--off');
    b.textContent = on ? '👍' : '↩';
    b.style.left = (r.left + r.width / 2) + 'px';
    b.style.top  = (r.top + r.height / 2) + 'px';
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 700);
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

    const likes = Number(note.likes || 0);
    // Bei einem Fakt steht keine Zustimmungszeile: er ist belegt, nicht
    // gemeint — was zählt, ist die Quelle darüber.
    const likeRow = note.kind === 'fakt' ? '' :
      `<div class="bd-detail__row"><span>Zustimmung</span><strong>👍 ${likes}${
         note.is_mine && likes > 0 ? ' <span class="bd-detail__none">— so viele stimmen dir zu</span>' : ''
       }</strong></div>`;

    $('bdDetailMeta').innerHTML =
      `<div class="bd-detail__row"><span>Bereich</span><strong>${cat.icon} ${esc(cat.label)}</strong></div>
       <div class="bd-detail__row"><span>Thema</span><strong>${topics || '<em class="bd-detail__none">nichts angegeben</em>'}</strong></div>
       <div class="bd-detail__row"><span>Von</span><strong>${esc(note.author || 'Unbekannt')}${note.is_mine ? ' (du)' : ''}</strong></div>
       ${likeRow}`;

    // Zustimmen und Zurücknehmen sitzen am selben Knopf — er sagt immer,
    // was der nächste Druck bewirkt.
    const likeBtn = $('bdDetailLike');
    likeBtn.hidden = !canLike(note);
    if (!likeBtn.hidden) {
      likeBtn.textContent = note.liked_by_me ? '👍 Zustimmung zurücknehmen' : '👍 Ich stimme zu';
      likeBtn.classList.toggle('bd-btn--like-on', !!note.liked_by_me);
      likeBtn.setAttribute('aria-pressed', String(!!note.liked_by_me));
    }

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
    // Phasenleiste = Fachwechsel. Gesperrte Knöpfe sind disabled, der
    // Klick kommt hier also gar nicht erst an.
    $('bdPhases').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-phase]'); if (!b) return;
      setViewPhase(Number(b.dataset.phase));
    });

    // Neue Karte: Art aus dem Fach, Bereich aus dem Wechsler daneben.
    $('bdCatAdd').addEventListener('click', () => openModal(viewKind(), null, state.cat));

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
      if (ev.key === 'Escape') {
        if (!$('bdModal').hidden)   closeModal();
        if (!$('bdDetail').hidden)  closeDetail();
        if (!$('bdConfirm').hidden) { $('bdConfirm').hidden = true; state.confirmFn = null; }
        return;
      }

      // Pfeiltasten blättern durch die Bereiche — am Beamer steht man
      // meist an der Tastatur und nicht am Tablet. Nicht, solange ein
      // Fenster offen ist oder jemand in einem Feld schreibt.
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      if (state.view !== 'board') return;
      if (!$('bdModal').hidden || !$('bdDetail').hidden || !$('bdConfirm').hidden) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
      ev.preventDefault();
      gotoCat(ev.key === 'ArrowRight' ? 1 : -1);
    });

    /* Karten: einmal tippen öffnet das Detail, zweimal stimmt zu.

       Beides auf demselben Ziel geht nur mit einer kurzen Wartezeit —
       ein Doppeltipp beginnt nun einmal als einfacher Tipp. Also wird
       das Öffnen um 260 ms verzögert und abgebrochen, falls ein zweiter
       Tipp kommt. Auf eigenen Karten entfällt das: dort ist Zustimmen
       gar nicht möglich, und niemand soll auf eine Wirkung warten, die
       es nicht gibt.                                                  */
    const TAP_MS = 260;
    let tapTimer = null, tapId = null;

    function clearTap() { clearTimeout(tapTimer); tapTimer = null; tapId = null; }

    async function cardTapped(card) {
      const note = state.data?.notes.find(n => n.id === card.dataset.note);
      if (!note) return;

      // Wo nicht zugestimmt werden kann — eigene Karte, oder ein Fakt —
      // gibt es nichts zu verzögern: direkt öffnen. Niemand soll auf
      // eine Wirkung warten, die es nicht gibt.
      if (!canLike(note)) { clearTap(); openDetail(note.id); return; }

      if (tapId === note.id && tapTimer) {      // zweiter Tipp
        clearTap();
        likeBurst(card, !note.liked_by_me);
        await toggleLike(note.id);
        return;
      }
      clearTap();
      tapId = note.id;
      tapTimer = setTimeout(() => { clearTap(); openDetail(note.id); }, TAP_MS);
    }

    $('bdBoard').addEventListener('click', ev => {
      // Der Link in einer Quellenangabe soll die Quelle öffnen, nicht
      // das Detail.
      if (ev.target.closest('a')) return;
      const card = ev.target.closest('[data-note]');
      if (card) cardTapped(card);
    });
    $('bdBoard').addEventListener('keydown', ev => {
      const card = ev.target.closest('[data-note]');
      if (!card) return;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); clearTap(); openDetail(card.dataset.note); }
    });

    // ── Kategorie-Wechsler ──
    $('bdCatTabs').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-cat]'); if (!b) return;
      const from = catIndex();
      const to   = CATEGORIES.findIndex(c => c.id === b.dataset.cat);
      setCat(b.dataset.cat, to > from ? 1 : -1);
    });
    $('bdCatPrev').addEventListener('click', () => gotoCat(-1));
    $('bdCatNext').addEventListener('click', () => gotoCat(1));

    /* Wischen. Bewusst passiv: preventDefault würde das senkrechte
       Scrollen mit abwürgen. Deshalb entscheidet erst der Fingerabheber,
       ob es ein Wischer war — und nur, wenn die Bewegung deutlich
       waagerechter war als senkrecht. */
    let tx = 0, ty = 0, tt = 0;
    $('bdBoard').addEventListener('touchstart', ev => {
      if (ev.touches.length !== 1) { tt = 0; return; }
      tx = ev.touches[0].clientX; ty = ev.touches[0].clientY; tt = Date.now();
    }, { passive: true });

    $('bdBoard').addEventListener('touchend', ev => {
      if (!tt || state.view !== 'board') return;
      const t = ev.changedTouches[0];
      const dx = t.clientX - tx, dy = t.clientY - ty, dt = Date.now() - tt;
      tt = 0;
      if (dt > 800 || Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      clearTap();          // Wischen ist kein Tippen — kein Detail öffnen
      gotoCat(dx < 0 ? 1 : -1);
    }, { passive: true });

    // ── Detail-Ansicht ──
    $('bdDetailLike').addEventListener('click', async () => {
      const id = state.detailId;
      if (!id) return;
      $('bdDetailLike').disabled = true;
      await toggleLike(id);
      $('bdDetailLike').disabled = false;
      // render() zieht das offene Detail mit — der Knopf beschriftet
      // sich also selbst um, und die Karte dahinter wächst schon.
    });
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

    // Tabelle: Kopf sortiert, Zeile öffnet das Detail.
    $('bdTable').addEventListener('click', ev => {
      if (ev.target.closest('a')) return;   // Quellen-Link bleibt Link

      const th = ev.target.closest('th[data-col]');
      if (th) {
        const col = th.dataset.col;
        state.sort = (state.sort.col === col)
          ? { col, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { col, dir: 'asc' };
        render();
        return;
      }

      const tr = ev.target.closest('tr[data-note]');
      if (tr) openDetail(tr.dataset.note);
    });
    $('bdTable').addEventListener('keydown', ev => {
      const tr = ev.target.closest('tr[data-note]'); if (!tr) return;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDetail(tr.dataset.note); }
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

    try {
      state.view = sessionStorage.getItem(VIEW_KEY) || 'board';
      const cat  = sessionStorage.getItem(CAT_KEY);
      if (cat && CATEGORIES.some(c => c.id === cat)) state.cat = cat;
      // Nur merken, nicht prüfen: ob Phase 2 überhaupt offen ist, weiß
      // erst load() — dort wird das Fach auf das Erlaubte begrenzt.
      const vp = Number(sessionStorage.getItem(VPHASE_KEY));
      if (vp === 1 || vp === 2) { state.viewPhase = vp; state.viewPhaseSaved = true; }
    } catch (e) {}

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
