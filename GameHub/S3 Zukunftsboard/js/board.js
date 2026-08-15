/* Reality Check — Oberfläche.

   Ordner, Spiel-ID (game19) und der interne kind-Wert 'fakt' heißen aus
   Migrations-Gründen weiter wie früher; umbenannt ist nur, was die SuS
   lesen.

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
     die Post-Its, in Phase 2 die Recherchen. Man sieht immer genau eines
     von beiden — deshalb tragen die Texte hier zusätzlich, WAS man gerade
     vor sich hat.

     Gegenwart, nicht Zukunft: gefragt ist, was KI und Social Media JETZT
     mit uns machen. Und was in Phase 2 dazukommt, heißt „Recherche" und
     nicht „Fakt" — man kann im Netz auch Müll finden, das Wort darf das
     Urteil nicht vorwegnehmen. Ob eine Recherche trägt, klärt Phase 3.

     Die Kontingent-Zahlen stehen als {ideas}/{facts} drin und werden
     erst beim Anzeigen aus der Server-Antwort gefüllt (phaseTask()) —
     die Zahl gehört dem Server, der sie auch durchsetzt, und soll nicht
     zusätzlich in einem Text stehen, den beim nächsten Mal jemand
     übersieht.

     Gezeigt wird der Auftrag nicht mehr dauerhaft, sondern als Modal:
     beim Öffnen des Boards, beim Phasenwechsel und über das ? in der
     Kopfzeile. Deshalb ist er hier in Überschrift und Fließtext
     getrennt. */
  const PHASE_INFO = {
    1: { name: 'Sammeln',
         task: 'Was bewirken KI, Social Media und Handy-Games gerade bei uns? Halte fest, was dir dazu einfällt — als Chance, als Risiko oder als Vermutung. Du hast {ideas} Post-Its.' },
    2: { name: 'Recherchieren',
         task: 'Such dir einen Punkt aus und finde heraus, was wirklich dazu bekannt ist. Eine Recherche ist Pflicht, bis zu {facts} sind möglich — jeweils mit vollständiger Quelle: Link, wer es geschrieben hat und wann.' },
    3: { name: 'Besprechen',
         task: 'Das Board ist eingefroren — es kommt nichts mehr dazu und nichts wird mehr geändert. Jetzt schauen wir gemeinsam drauf. Zustimmen kannst du weiter.' }
  };

  const KIND_LABEL = { idee: 'Post-It', fakt: 'Recherche' };

  const ERROR_TEXT = {
    not_authenticated:     'Du bist nicht mehr angemeldet. Lade die Seite neu.',
    session_expired:       'Deine Anmeldung ist abgelaufen. Lade die Seite neu (F5) — dein Board bleibt erhalten.',
    no_cluster:            'Du gehörst noch zu keinem Kurs — ohne Kurs gibt es kein Board.',
    no_profile:            'Zu deinem Konto fehlt ein Profil. Melde dich bei deiner Lehrkraft.',
    account_not_active:    'Dein Konto ist noch nicht freigeschaltet.',
    season_locked:         'Reality Check gehört zu Season 3 und ist für deinen Kurs noch nicht offen.',
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
    fact_not_likable:      'Bei einer Recherche zählt die Quelle, nicht die Mehrheit — Zustimmung gibt es nur auf Post-Its.',
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
    viewPhase: 1,               // welches Fach man ansieht: 1 = Post-Its, 2 = Recherchen
    viewPhaseSaved: false,      // lag beim Start schon eine Wahl im sessionStorage?
    lastPhase: null,            // letzte Kurs-Phase — zum Mitziehen beim Wechsel
    slide:     0,               // Richtung der Einblendung beim Wechsel
    sort:      { col: 'created_at', dir: 'desc' },
    lastSig:   null,
    editing:   null,   // { id|null, kind, category, stance }
    detailId:  null,   // offene Karten-Ansicht
    confirmFn: null,
    shuffle:   0,      // Mischzähler für „neu anordnen" — rein lokal
    failStreak: 0,     // wie viele stille Polls hintereinander fehlschlugen
    rewardBusy: false, // läuft gerade ein Belohnungs-Abruf oder eine Sequenz?
    rewardDue:  false  // Phasenwechsel kam, während ein Formular offen war
  };

  /* Die Wolke hat zwei Ebenen, die einander ins Wort fallen können:
     Tippen/Wischen auf den Karten (in wire()) und Schieben/Zoomen im
     Fenster (in wirePort()). Damit die Lupe das Tippen abbestellen
     kann, ohne dass beide im selben Gültigkeitsbereich liegen müssen,
     hängen die beiden Abbrecher hier. */
  const gesture = { cancelTap: () => {}, cancelSwipe: () => {} };

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

  // Quellendatum ist ein Monatsfeld (der Tag ist für eine Quellenangabe
  // irrelevant) — Vergleich und max-Attribut brauchen darum "YYYY-MM"
  // statt das volle todayIso().
  function monthIso() {
    return todayIso().slice(0, 7);
  }

  function formatMonthYear(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 7) + '-01T00:00:00');
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' });
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
    return `${esc(note.source_author)} (${formatMonthYear(note.source_date)}): ${link}`;
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
     Post-Its in Phase 1, Recherchen ab Phase 2. Ändern und Löschen sind
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

  /* Zustimmung gibt es nur auf Post-Its. Eine Recherche steht oder fällt
     mit ihrer Quelle — ob sie einem gefällt, ändert daran nichts. */
  function canLike(note) {
    return note.kind !== 'fakt' && !note.is_mine;
  }

  /* ── Fächer: Phase 1 = Post-Its, Phase 2 = Recherchen ────
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
  // Recherche-Raster, Tabelle und die Zähler in der Leiste.
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
       den Recherchen landen — sonst sitzt der halbe Kurs weiter vor den
       Post-Its und wundert sich, wo der Plus-Knopf hin ist. Beim Sprung
       auf Phase 3 wird nicht umgeschaltet: dort gibt es kein eigenes
       Fach, und wer gerade etwas ansieht, soll es behalten. */
    const p = res.phase ?? 1;
    const firstLoad  = state.lastPhase === null;
    const switched   = !firstLoad && p !== state.lastPhase;
    if (state.lastPhase === null) {
      // Erster Ladevorgang: wer neu dazukommt, während der Kurs schon
      // bei den Recherchen ist, soll auch dort landen — es sei denn, er hat
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

    /* Der Auftrag kommt von selbst: einmal beim Öffnen und danach immer
       dann, wenn die Lehrkraft weiterschaltet — der Wechsel erreicht
       jedes Tablet über den 5-Sekunden-Poll, und ohne Ansage merkt ihn
       niemand außer daran, dass der Plus-Knopf plötzlich anders aussieht.

       Ausnahme: wer gerade ein Formular ausgefüllt hat, verliert es
       nicht an ein Fenster, das sich von selbst davorschiebt. Dann nur
       eine Zeile — die Absage kommt beim Speichern ohnehin vom Server,
       und das ? holt den Auftrag jederzeit nach.

       Ein offenes Detail oder eine offene Rückfrage dagegen darf das
       Fenster verdrängen: dort geht nichts verloren.                  */
    if (firstLoad || switched) {
      if (!$('bdModal').hidden) {
        if (switched) toast(`Phase ${p} · ${PHASE_INFO[p].name} läuft jetzt.`);
        // Vorgemerkt statt abgeholt: der RPC gibt seine Belohnung genau
        // einmal aus, und wer sie jetzt einlöste, verlöre die halb
        // getippte Karte an die Sequenz. Der nächste Poll ohne offenes
        // Formular holt sie nach.
        state.rewardDue = true;
      } else {
        if (!$('bdConfirm').hidden) { $('bdConfirm').hidden = true; state.confirmFn = null; }
        closeDetail();
        // Erst die Belohnung, dann der Auftrag: das Ei schlüpft VOR dem
        // Phasen-Modal, sonst stünde die neue Aufgabe schon da, während
        // das Ergebnis der alten noch aussteht.
        state.rewardDue = false;
        await maybeClaimReward();
        openPhaseInfo();
      }
    } else if (state.rewardDue && $('bdModal').hidden) {
      // Nachgeholt: das Formular ist zu, der Auftrag stand schon als
      // Toast da — jetzt fehlt nur noch die Belohnung.
      state.rewardDue = false;
      closeDetail();
      await maybeClaimReward();
    }
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
    const p   = phase();
    const max = maxViewPhase();

    $('bdPhases').hidden = false;
    document.querySelectorAll('.bd-phase').forEach(el => {
      const n      = Number(el.dataset.phase);
      const locked = n < 3 && n > max;

      el.classList.toggle('bd-phase--running', n === p);
      el.classList.toggle('bd-phase--shown',   n < 3 && n === state.viewPhase);
      el.classList.toggle('bd-phase--locked',  locked);

      if (el.tagName !== 'BUTTON') return;
      el.disabled = locked;
      el.setAttribute('aria-pressed', String(n === state.viewPhase));
      el.title = locked
        ? 'Diese Phase hat deine Lehrkraft noch nicht freigeschaltet.'
        : (n === 1 ? 'Die Post-Its des Kurses ansehen' : 'Die Recherchen des Kurses ansehen');
    });
  }

  /* Das Kontingent kommt aus board_get — dort wird es auch durchgesetzt.
     Die Zahlen daneben sind nur der Notnagel für den Moment vor dem
     ersten Laden; weicht der Server ab, gilt der Server. */
  const ideasMax = () => state.data?.me?.ideas_max ?? 10;
  const factsMax = () => state.data?.me?.facts_max ?? 5;

  const phaseTask = p => PHASE_INFO[p].task
    .replace('{ideas}', ideasMax())
    .replace('{facts}', factsMax());

  /* ── Auftrag der Phase ───────────────────────────────────
     Kommt von selbst, wenn er gebraucht wird — beim Öffnen des Boards
     und wenn die Lehrkraft weiterschaltet — und sonst auf Anfrage über
     das ? in der Kopfzeile. Als Dauertext über dem Board kostete er
     Platz, den die Wolke besser gebrauchen kann, und war nach dem
     zweiten Blick ohnehin Tapete. */
  function openPhaseInfo() {
    const p = phase();
    $('bdPhaseInfoNo').textContent    = p;
    $('bdPhaseInfoTitle').textContent = `Phase ${p} · ${PHASE_INFO[p].name}`;
    $('bdPhaseInfoText').textContent  = phaseTask(p);

    /* Wer gerade ein anderes Fach ansieht, als der Kurs bearbeitet,
       braucht die Einordnung dazu — das war früher der einzige Teil der
       Hinweiszeile, der nicht in der Phase selbst steht. */
    const v    = state.viewPhase;
    const note = $('bdPhaseInfoNote');
    const show = p >= 3 || v !== p;
    note.hidden = !show;
    if (show) {
      note.textContent = p >= 3
        ? `Du siehst gerade ${v === 1 ? 'die Post-Its' : 'die Recherchen'} — oben in der Kopfzeile wechselst du zwischen beidem.`
        : v === 1
          ? 'Du siehst gerade die Post-Its aus Phase 1. Neue kommen keine mehr dazu — zustimmen und nachbessern kannst du weiter.'
          : 'Du siehst gerade die Recherchen. Oben in der Kopfzeile wechselst du zwischen beiden Phasen.';
    }

    $('bdPhaseInfo').hidden = false;
    $('bdPhaseInfoOk').focus();
  }

  function closePhaseInfo() { $('bdPhaseInfo').hidden = true; }

  /* ── Belohnung ───────────────────────────────────────────
     Reality Check ist die einzige Kachel, deren Monster an einer
     Handlung der LEHRKRAFT hängt: Phase 1 beendet ⇒ es schlüpft,
     Phase 2 beendet ⇒ es wächst. Gerechnet und vergeben wird das
     serverseitig (board_claim_reward, Migration 0067) — hier wird nur
     gezeigt, was zurückkommt.

     Warum die Sequenz auf DIESER Seite läuft und nicht erst im Hub wie
     bei Startup Story: der Kurs sitzt in diesem Moment zusammen. Wenn
     die Lehrkraft weiterschaltet, schlüpft es auf allen Tablets
     gleichzeitig. Für alle, die gerade nicht auf der Seite waren, holt
     der Hub dieselbe Sequenz beim nächsten Besuch nach — der Server
     gibt jede Stufe genau einmal aus, doppelt kann es also nicht
     kommen.

     Absichtlich steht nirgends, WORAN das Monster hängt. Weder die
     Zahl der Post-Its noch die Zustimmungen werden erwähnt. */
  async function maybeClaimReward() {
    if (state.rewardBusy) return;
    // Admins moderieren, sie sammeln nicht — der Server weist sie ohnehin
    // ab, aber ein Aufruf je Phasenwechsel und Kurs wäre reine Last.
    if (state.isAdmin) return;
    state.rewardBusy = true;
    try {
      /* Bis zu zwei Stufen am Stück: wer erst in Phase 3 dazukommt, hat
         Schlüpfen UND Wachsen offen. Der Server gibt pro Aufruf eine
         Stufe aus, also einmal nachfassen. Die Schleife endet an
         'none' — mehr als zwei Stufen gibt es nicht. */
      for (let i = 0; i < 2; i++) {
        const rv = await window.BoardAPI.claimReward(state.clusterId);
        if (!rv || !rv.ok || rv.event === 'none' || !rv.event) return;
        // Wer sich an den Zustimmungen gar nicht beteiligt hat, wächst
        // um 0 und verdient nichts. Die Vergabe ist damit erledigt (der
        // Server hat sie vermerkt), aber ein Fenster, das „Dein Monster
        // wächst!" über einen unveränderten Balken schreibt, wäre eine
        // Lüge. Also still übergehen.
        const nothing = rv.event === 'grow'
          && (rv.growth_after || 0) <= (rv.growth_before || 0)
          && !(rv.coins_gained || 0) && !(rv.bonbons_gained || 0);
        if (!nothing) await runReveal(rv);
      }
    } catch (e) {
      console.warn('[BOARD] claimReward:', e.message);
    } finally {
      state.rewardBusy = false;
    }
  }

  /* Zeigt die Sequenz und löst auf, wenn sie durch ist. Der Aufrufer
     wartet darauf, damit das Phasen-Modal erst danach kommt. */
  function runReveal(rv) {
    // Ohne creatures.js gäbe es weder Ei noch Bild. Dann lieber eine
    // Zeile als ein leeres Fenster — vergeben ist die Belohnung ja
    // trotzdem, der Hub zeigt sie beim nächsten Besuch richtig.
    if (typeof getCreatureHTML !== 'function' || typeof getEggSVG !== 'function') {
      toast(rv.event === 'hatch' ? 'Dein Monster ist geschlüpft! Schau im Hub nach.'
                                 : 'Dein Monster ist gewachsen! Schau im Hub nach.');
      return Promise.resolve();
    }

    const creature = rv.creature;
    const from     = rv.event === 'hatch' ? -1 : getGrowthStage(rv.growth_before  || 0);
    const to       = rv.event === 'hatch' ?  0 : getGrowthStage(rv.growth_after   || 0);
    const growth   = rv.event === 'hatch' ?  0 : (rv.growth_after || 0);

    /* Schritt-Liste. Beim Schlüpfen erst das Ei, dann das Baby. Beim
       Wachsen jede erreichte Stufe einzeln — wer drei Stufen auf einmal
       geschafft hat, soll sie auch drei Mal sehen. Bleibt der Zuwachs
       innerhalb einer Stufe, gibt es trotzdem ein Bild, sonst spränge
       die Sequenz direkt zur Ausbeute. */
    const steps = [];
    if (rv.event === 'hatch') {
      steps.push({ kind: 'egg' });
      steps.push({ kind: 'grow', stage: 0 });
    } else {
      if (to > from) for (let s = from + 1; s <= to; s++) steps.push({ kind: 'grow', stage: s });
      else           steps.push({ kind: 'grow', stage: Math.max(0, to) });
      if ((rv.coins_gained || 0) > 0 || (rv.bonbons_gained || 0) > 0) steps.push({ kind: 'gains' });
    }

    const box   = $('bdReveal');
    const badge = $('bdRevealBadge');
    const art   = $('bdRevealArt');
    const name  = $('bdRevealName');
    const bar   = $('bdRevealBar');
    const sub   = $('bdRevealSub');
    const gains = $('bdRevealGains');
    const next  = $('bdRevealNext');

    let i = 0;
    let eggTimer = null;

    return new Promise(resolve => {
      function finish() {
        clearInterval(eggTimer);
        box.hidden = true;
        next.removeEventListener('click', onNext);
        document.removeEventListener('keydown', onEsc);
        resolve();
      }
      function onNext() { i++; (i < steps.length) ? draw() : finish(); }
      function onEsc(ev) { if (ev.key === 'Escape') finish(); }

      function draw() {
        const step = steps[i];
        clearInterval(eggTimer);
        badge.hidden = true;
        name.hidden  = true;
        bar.hidden   = true;
        gains.hidden = true;
        next.textContent = (i === steps.length - 1) ? 'Fertig' : 'Weiter';

        if (step.kind === 'egg') {
          $('bdRevealTitle').textContent = 'Da tut sich was…';
          sub.textContent = 'Euer Board hat die erste Phase hinter sich.';
          art.innerHTML = getEggSVG(0);
          // Risse durchlaufen und stehen lassen — die Auflösung ist der
          // nächste Schritt und gehört dem Kind, nicht einem Timer.
          let f = 0;
          eggTimer = setInterval(() => {
            f++;
            art.innerHTML = getEggSVG(f);
            if (f >= 4) clearInterval(eggTimer);
          }, 420);
          return;
        }

        if (step.kind === 'grow') {
          const hatching = rv.event === 'hatch';
          $('bdRevealTitle').textContent = hatching ? 'Es ist geschlüpft!' : 'Dein Monster wächst!';
          sub.textContent = hatching
            ? 'Es zieht mit dir in die Lernwelt — du findest es dort auf der Reality-Check-Kachel.'
            : '';
          art.innerHTML  = getCreatureHTML(creature, step.stage);
          name.hidden    = false;
          name.textContent = `${CREATURE_NAMES[creature] ?? creature} · ${GROWTH_LABELS[step.stage]}`;

          if (isRare(creature))      { badge.hidden = false; badge.textContent = '✦ Selten ✦';  badge.className = 'bd-reveal__badge bd-reveal__badge--rare'; }
          else if (isEpic(creature)) { badge.hidden = false; badge.textContent = '✦ Episch ✦'; badge.className = 'bd-reveal__badge bd-reveal__badge--epic'; }

          if (!hatching) {
            bar.hidden = false;
            $('bdRevealBarFill').style.width =
              Math.min(100, growth / GROWTH_MAX * 100) + '%';
          }
          return;
        }

        // Ausbeute. Bewusst nur der Zuwachs und keine Gesamtsumme: die
        // Stände stehen im localStorage des Hubs, den diese Seite nicht
        // führt — eine Bank mit falscher Summe wäre schlimmer als keine.
        $('bdRevealTitle').textContent = 'Deine Ausbeute';
        sub.textContent = '';
        art.innerHTML   = '';
        gains.hidden    = false;
        gains.innerHTML =
          ((rv.coins_gained   || 0) > 0 ? `<div class="bd-reveal__gain">🪙 <strong>+${rv.coins_gained}</strong> Münzen</div>`   : '') +
          ((rv.bonbons_gained || 0) > 0 ? `<div class="bd-reveal__gain">🍬 <strong>+${rv.bonbons_gained}</strong> Bonbons</div>` : '');
      }

      next.addEventListener('click', onNext);
      document.addEventListener('keydown', onEsc);
      draw();
      box.hidden = false;
      next.focus();
    });
  }

  /* Voll? Dann bleibt der Plus-Knopf anklickbar und sagt es beim
     Drücken. Ein toter Knopf beantwortet die Frage „warum geht das
     nicht?" nicht, und ein verschwundener nimmt sie mit. */
  function quotaFull() {
    const me = state.data.me || {};
    if (state.isAdmin) return false;
    return state.viewPhase === 1
      ? (me.ideas_used ?? 0) >= ideasMax()
      : (me.facts_used ?? 0) >= factsMax();
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

  const LIKE_SIZE_MIN = 0.88;   // rem — Karte ohne Zustimmung
  const LIKE_SIZE_MAX = 2.20;   // rem — Karte mit den meisten
  const LIKE_SPAN_REF = 5;      // ab so vielen Zustimmungen ist die Spanne voll

  /* Größe aus der Zustimmung.

     Zwei Regeln stecken drin. Erstens ein Exponent unter 1: der Sprung
     von 0 auf 1 Zustimmung soll sichtbar sein, der von 8 auf 9 kaum
     noch — sonst erdrückt eine einzelne Karte die ganze Wolke.

     Zweitens wird die Spanne selbst erst mit dem Board größer. Sonst
     wäre auf einem frischen Board die erste Karte mit einer einzigen
     Zustimmung sofort doppelt so groß wie alle anderen — eine Aussage
     über den Kurs, die eine Stimme nicht trägt. Erst ab ~5
     Zustimmungen auf der Spitzenkarte wird die volle Spanne genutzt. */
  function sizeFor(likes, maxLikes) {
    const l = Math.max(0, Number(likes) || 0);
    if (maxLikes <= 0 || l <= 0) return LIKE_SIZE_MIN;
    const span = (LIKE_SIZE_MAX - LIKE_SIZE_MIN) * Math.min(1, maxLikes / LIKE_SPAN_REF);
    return LIKE_SIZE_MIN + Math.pow(Math.min(l, maxLikes) / maxLikes, 0.65) * span;
  }

  function cardHTML(note, opts) {
    const o = opts || {};
    /* Größere Karten dürfen auch breiter werden, sonst wird eine
       2-rem-Karte zu einem schmalen hohen Turm — und kleine bleiben
       schmal, damit sie sich am Rand zwischen die großen fügen.

       Bewusst ohne `100%`: die Wolke wird auf einer virtuellen Tafel
       gepackt, die immer breit genug ist, und danach als Ganzes
       skaliert. Eine Karte, die sich an die Gerätebreite klemmt, würde
       auf dem Handy die ganze Spalte füllen — dann bleibt der Spirale
       kein Platz mehr und die Wolke wird zum Stapel. */
    const style = o.size
      ? ` style="font-size:${o.size.toFixed(2)}rem;max-width:${Math.round(150 + (o.size - LIKE_SIZE_MIN) * 145)}px"`
      : '';

    const hint = note.is_mine
      ? 'Antippen: deine Karte ansehen, ändern oder löschen'
      : canLike(note)
        ? 'Antippen für Details · Doppeltippen zum Zustimmen'
        : 'Antippen für Details und Quelle';

    // Bewusst ohne role="button": die Karte ist zwar antippbar, aber
    // role="button" macht ihren Inhalt für Screenreader zu reiner
    // Dekoration — und der Inhalt ist hier die ganze Information.
    // Der Daumen gilt nur dort, wo man zustimmen kann. Auf einer
    // Recherche wäre er ein Versprechen, das der Doppeltipp nicht hält.
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
     außen, wer zuerst drankommt, landet in der Mitte. Recherchen stehen
     im Raster und dort schlicht nach Alter; eine Reihenfolge nach
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
       die Frage nach der Kategorie im Formular erledigt.

       Anklickbar bleibt er auch bei vollem Kontingent — die Absage
       kommt beim Drücken als kurze Meldung. Und wie viele Karten noch
       offen sind, steht erst dahinter im Formular („Neues Post-It 4 von
       10"): in der Kopfzeile stand die Zahl dauerhaft und wurde
       dauerhaft überlesen. */
    const kind = viewKind();
    const add  = $('bdCatAdd');
    add.hidden = !canAdd(kind);
    if (!add.hidden) {
      add.disabled = false;
      add.title = `Neue${kind === 'fakt' ? ' Recherche' : 's Post-It'} in „${cat.label}“`;
      add.setAttribute('aria-label', add.title);
      add.classList.toggle('bd-catadd--fact', kind === 'fakt');
      add.classList.toggle('bd-catadd--full', quotaFull());
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

    /* Recherchen stehen im festen Raster, nicht in der Wolke: eine
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

    /* Drei Schichten, jede mit genau einer Aufgabe:
       .bd-port  — das Fenster. Feste Höhe, schneidet ab, fängt die
                   Finger. Hier drin wird geschoben und gezoomt.
       .bd-stage — die Lupe. Trägt translate+scale, sonst nichts.
       .bd-cloud — die virtuelle Tafel. Wird in ihrer eigenen Breite
                   gepackt, ohne von der Gerätebreite zu wissen.
       Getrennt, weil sonst das Zoomen die Anordnung verändern würde —
       und eine Wolke, die sich beim Hineinzoomen umsortiert, ist keine
       Karte mehr, auf der man sich zurechtfindet.                    */
    $('bdBoard').innerHTML =
      `<div class="bd-port${slide}" id="bdPort">
         <div class="bd-stage" id="bdStage">
           <div class="bd-cloud" id="bdCloud">${inCat.map(n => cardHTML(n, {
             size: sizeFor(Number(n.likes || 0), maxLikes)
           })).join('')}</div>
         </div>
         <div class="bd-zoom" id="bdZoom">
           <button type="button" data-zoom="out"     aria-label="Herauszoomen" title="Herauszoomen">−</button>
           <button type="button" data-zoom="fit"     aria-label="Alles zeigen" title="Alles zeigen">⤢</button>
           <button type="button" data-zoom="in"      aria-label="Hineinzoomen" title="Hineinzoomen">＋</button>
           <button type="button" data-zoom="shuffle" aria-label="Neu anordnen"
                   title="Neu anordnen — nur auf diesem Gerät, niemand sonst merkt etwas davon">⟳</button>
         </div>
       </div>`;

    layoutClouds();
    wirePort($('bdPort'));
  }

  function emptyText() {
    if (viewKind() === 'fakt') {
      return 'Für diesen Bereich gibt es noch keine Recherche. ' +
             (canAdd('fakt') ? 'Trag die erste ein — mit Link, Autorin oder Autor und Datum.' : '');
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
     offsetWidth/offsetHeight.

     Gepackt wird NICHT in der Gerätebreite, sondern auf einer
     virtuellen Tafel, deren Breite sich aus der Kartenfläche ergibt.
     Der Grund steht in cloudWidth(): auf einem Handy ist eine Karte
     fast so breit wie der Bildschirm, und eine Spirale, die überall an
     den Rand stößt, ist keine Wolke mehr, sondern ein Stapel. Was auf
     den Bildschirm passt, entscheidet danach die Lupe (fitView) — und
     zur Not die zwei Finger.                                          */

  const CLOUD_GAP   = 10;     // Sichtabstand zwischen zwei Zetteln
  const CLOUD_PAD   = 12;     // Luft zwischen Wolke und Fensterkante
  const CLOUD_MIN_W = 380;    // schmalste virtuelle Tafel
  const CLOUD_MAX_W = 2400;   // breiteste — darüber wächst sie in die Höhe
  const CLOUD_ASPECT = 0.52;  // Wunschverhältnis Höhe zu Breite
  const CLOUD_INIT_MIN = 0.45; // so weit wird höchstens herausgezoomt beim Öffnen

  /* Sechs Neigungen im Wechsel. Stehen seit dem Zoom im Skript und
     nicht mehr im Stylesheet: die Platzierung rechnet mit
     achsenparallelen Rechtecken und muss den Winkel jeder Karte KENNEN,
     um ihn einrechnen zu können — ein um 2,4° gedrehter breiter Zettel
     ist gut 13 px höher als der ungedrehte. Genau das war die Ursache
     der senkrechten Überlappungen: ein pauschaler Abstand deckt die
     Drehung einer 300-px-Karte nicht ab. */
  const TILTS = [-1.8, 1.4, -0.7, 2.2, -2.4, 0.9];

  function tiltFor(id, seed) {
    let h = 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return TILTS[(h + seed) % TILTS.length];
  }

  function overlaps(a, b) {
    return !(a.x + a.w + CLOUD_GAP <= b.x || b.x + b.w + CLOUD_GAP <= a.x ||
             a.y + a.h + CLOUD_GAP <= b.y || b.y + b.h + CLOUD_GAP <= a.y);
  }

  /* Breite der virtuellen Tafel.

     Erst die Fläche schätzen, die die Karten brauchen (Faktor 2,1 —
     eine gepackte Wolke erreicht knapp die halbe Fläche), daraus eine
     angenehm liegende Breite ableiten und in Stufen von 20 px runden.

     Das Runden hat denselben Grund wie früher beim Seitenverhältnis:
     die Karten werden nacheinander gesetzt, jede nur gegen die schon
     liegenden. Eine neue Karte ohne Zustimmung sortiert sich ans Ende
     und lässt alle anderen, wo sie waren — solange die Tafelbreite
     gleich bleibt. Ohne Stufen kippte sie bei jeder neuen Karte um ein
     paar Pixel, und die ganze Wolke ordnete sich im 5-Sekunden-Takt
     neu. Mitten in einer Stunde, in der 30 Leute gleichzeitig
     schreiben, wäre das unlesbar. */
  function cloudWidth(items) {
    const area   = items.reduce((s, it) => s + it.bw * it.bh, 0) * 2.1;
    const widest = items.reduce((m, it) => Math.max(m, it.bw), 0);
    const ideal  = Math.sqrt(area / CLOUD_ASPECT);
    /* Untergrenze: die erste (größte) Karte liegt in der Mitte. Damit
       daneben überhaupt eine zweite Platz findet, muss die Tafel deren
       halbe Breite plus eine ganze zweite Karte auf JEDER Seite fassen —
       also gut das Dreifache der breitesten. Mit weniger legt die
       Spirale alles untereinander, und genau das war die „Liste" auf
       schmalen Geräten. */
    const need = items.length > 1 ? widest * 3 + 4 * CLOUD_GAP : widest + 2 * CLOUD_GAP;
    const w = Math.max(need, Math.min(CLOUD_MAX_W, Math.max(CLOUD_MIN_W, ideal)));
    return Math.round(w / 20) * 20;
  }

  /* Der Platz für eine Karte. Kandidaten außerhalb der Tafelbreite
     werden VERWORFEN, nicht an den Rand geklemmt — geklemmt landen sie
     alle auf demselben x-Wert, kollidieren dort miteinander und die
     Wolke fällt zum Stapel zusammen. Verworfen wächst sie stattdessen
     nach unten, und das ist genau richtig: die Tafel darf hoch werden,
     denn man kann sie ja verschieben. */
  function findSpot(w, h, placed, boxW, ratio, seed) {
    const cx   = boxW / 2;
    const maxX = Math.max(0, boxW - w);
    const mid  = Math.min(maxX, Math.max(0, cx - w / 2));

    if (!placed.length) return { x: mid, y: -h / 2, w, h };

    // Startwinkel aus dem Mischzähler: sonst ordnete „neu anordnen"
    // exakt dieselbe Wolke wieder an und der Knopf täte scheinbar nichts.
    const off = seed * 0.9;

    for (let i = 1; i <= 20000; i++) {
      const a = off + i * 0.07;    // Winkel — feine Schritte, dichtere Packung
      const r = 1.6 * (i * 0.07);  // Radius wächst linear mit dem Winkel
      const x = cx + r * Math.cos(a) - w / 2;
      const y = r * ratio * Math.sin(a) - h / 2;
      if (x < 0 || x > maxX) continue;

      const cand = { x, y, w, h };
      let hit = false;
      for (let k = 0; k < placed.length; k++) {
        if (overlaps(cand, placed[k])) { hit = true; break; }
      }
      if (!hit) return cand;
    }

    // Notausgang: unter alles legen. Sollte mit verworfenen statt
    // geklemmten Kandidaten nicht mehr vorkommen — bleibt trotzdem
    // stehen, gestapelt ist besser als übereinander.
    const bottom = placed.reduce((m, p) => Math.max(m, p.y + p.h), 0);
    return { x: mid, y: bottom + CLOUD_GAP, w, h };
  }

  function layoutCloud(box, seed) {
    const cards = Array.prototype.slice.call(box.children);
    if (!cards.length) return null;

    /* Messen auf voller Tafelbreite. Die Karten haben eine feste
       Höchstbreite in px (siehe cardHTML), sind also von der Tafel
       unabhängig — solange die Tafel breiter ist als die breiteste
       Karte. Deshalb erst großzügig aufziehen, dann messen. */
    box.style.width = CLOUD_MAX_W + 'px';

    const items = cards.map(el => {
      const tilt = tiltFor(el.dataset.note || '', seed);
      el.style.setProperty('--tilt', tilt + 'deg');
      const w = el.offsetWidth, h = el.offsetHeight;
      // Das achsenparallele Rechteck der GEDREHTEN Karte. Damit rechnet
      // die Kollisionsprüfung; die Drehung selbst macht das Stylesheet.
      const rad = Math.abs(tilt) * Math.PI / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      return { el, w, h, bw: w * c + h * s, bh: w * s + h * c };
    });

    const boxW  = cloudWidth(items);
    const area  = items.reduce((s, it) => s + it.bw * it.bh, 0) * 2.1;
    // Höhe folgt aus Fläche und Breite; das Verhältnis steuert, wie
    // rund oder flach die Spirale läuft.
    const ratio = Math.round(Math.max(0.3, Math.min(1.7, area / (boxW * boxW))) / 0.05) * 0.05;

    const placed = [];
    for (const it of items) {
      it.spot = findSpot(it.bw, it.bh, placed, boxW, ratio, seed);
      placed.push(it.spot);
    }

    const minX = placed.reduce((m, p) => Math.min(m, p.x), Infinity);
    const maxX = placed.reduce((m, p) => Math.max(m, p.x + p.w), -Infinity);
    const minY = placed.reduce((m, p) => Math.min(m, p.y), Infinity);
    const maxY = placed.reduce((m, p) => Math.max(m, p.y + p.h), -Infinity);

    /* Frisch gezeichnete Karten sollen an ihrem Platz ERSCHEINEN, nicht
       aus der Ecke dorthin fliegen.

       Der Verdacht liegt nahe, dass neue Elemente ohnehin nicht
       animieren — sie haben ja keinen Vorzustand. Das stimmt hier aber
       nicht: die Messschleife oben liest `offsetWidth`, und das erzwingt
       eine Style-Berechnung. Damit steht `left: 0` (aus dem
       Stylesheet) als Ausgangswert fest, und das anschließende Setzen
       wird zu einer echten Bewegung aus der linken oberen Ecke — bei
       jedem Zeichnen, also auch bei jedem Poll, der etwas Neues bringt.

       Die Bewegung ist nur für den Fall gedacht, dass DIESELBEN Karten
       neu angeordnet werden (Tablet gedreht, Fenster verzogen, „neu
       anordnen" gedrückt). Also wird sie genau für die Karten kurz
       abgeschaltet, die zum ersten Mal einen Platz bekommen. */
    const fresh = items.filter(it => !it.el.dataset.placed);
    for (const it of fresh) it.el.style.transition = 'none';

    for (const it of items) {
      // Gerechnet wurde mit dem gedrehten Rechteck, gesetzt wird das
      // ungedrehte — es sitzt mittig darin, die Drehung geht ja um den
      // Mittelpunkt.
      it.el.style.left = Math.round(it.spot.x - minX + (it.bw - it.w) / 2) + 'px';
      it.el.style.top  = Math.round(it.spot.y - minY + (it.bh - it.h) / 2) + 'px';
    }

    if (fresh.length) {
      void box.offsetHeight;   // Stellung festschreiben, bevor die Bewegung zurückkommt
      for (const it of fresh) {
        it.el.style.transition = '';
        it.el.dataset.placed = '1';
      }
    }

    // Die Tafel auf ihren Inhalt zuschneiden — daraus rechnet die Lupe
    // ihren Maßstab. +2 px gegen Rundungsreste, damit keine Karte in
    // der letzten Zeile neu umbricht.
    const w = Math.max(1, Math.round(maxX - minX) + 2);
    const h = Math.max(1, Math.round(maxY - minY) + 2);
    box.style.width  = w + 'px';
    box.style.height = h + 'px';
    return { w, h };
  }

  /* ── Lupe: Maßstab und Ausschnitt ────────────────────────
     Die Wolke wird in ihrer eigenen Breite gepackt und danach als
     Ganzes skaliert. Das trennt zwei Fragen sauber: „wie liegen die
     Karten zueinander" (Layout) und „wie viel davon sehe ich gerade"
     (Lupe). Auf dem Beamer ist beides dasselbe, auf dem Handy nicht —
     dort passt der Überblick nur verkleinert, und zum Lesen zieht man
     mit zwei Fingern auf.                                            */
  const vp = {
    scale: 1, fit: 1, tx: 0, ty: 0,
    w: 0, h: 0,          // Maße der Wolke
    key: '',             // Bereich+Fach — wechselt der, gilt der Ausschnitt nicht mehr
    touched: false,      // hat jemand selbst gezoomt oder geschoben?
    movedAt: 0           // wann zuletzt geschoben — unterdrückt den Klick danach
  };

  const ZOOM_MAX = 3;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Weiter als bis zum vollen Überblick muss niemand herauszoomen —
  // dahinter kommt nur noch leere Fläche.
  const minScale = () => vp.fit;
  // Ohne Fenster gibt es keinen Zoom — im Recherche-Raster und in der
  // Tabelle stünden sonst noch die Werte der zuletzt gesehenen Wolke
  // und das Wischen zwischen den Bereichen wäre dort abgeschaltet.
  const isZoomed = () => !!$('bdPort') && vp.scale > vp.fit * 1.02;

  /* Wem gehört der eine Finger?

     Solange niemand selbst gezoomt hat, blättert er durch die Bereiche —
     auch wenn die Wolke beim Öffnen nicht ganz aufs Handy passt.
     Verschieben geht dann mit zwei Fingern, und das ist auch die Geste,
     die man dafür sucht. Erst wer selbst aufgezogen hat, ist im
     Erkunden und will mit einem Finger schieben; ⤢ bringt ihn zurück. */
  const isPanMode = () => vp.touched && isZoomed();

  function applyView() {
    const stage = $('bdStage'), port = $('bdPort');
    if (!stage || !port) return;
    stage.style.transform =
      `translate(${Math.round(vp.tx)}px,${Math.round(vp.ty)}px) scale(${vp.scale.toFixed(4)})`;
    // Solange alles hineinpasst, bleibt ein Finger fürs Blättern
    // zuständig; erst im Zoom wird er zum Schieber.
    port.classList.toggle('bd-port--zoomed', isPanMode());
  }

  /* Ausschnitt im Fenster halten. Passt die Wolke ganz hinein, wird sie
     zentriert — sonst nur so weit begrenzt, dass keine leere Fläche
     hereinwandert, während auf der anderen Seite Karten verschwinden. */
  function clampView() {
    const port = $('bdPort');
    if (!port) return;
    const pw = port.clientWidth, ph = port.clientHeight;
    const cw = vp.w * vp.scale,  ch = vp.h * vp.scale;
    vp.tx = cw <= pw ? (pw - cw) / 2 : clamp(vp.tx, pw - cw, 0);
    vp.ty = ch <= ph ? (ph - ch) / 2 : clamp(vp.ty, ph - ch, 0);
  }

  /* Fensterhöhe und Anfangsmaßstab.

     Die Höhe folgt dem Inhalt: so hoch, wie die Wolke bei voller Breite
     braucht — aber nie höher als knapp zwei Drittel des Bildschirms,
     sonst schiebt das Board seine eigene Bedienung aus dem Blick.

     Der Anfangsmaßstab ist der Überblick — außer der wäre so klein,
     dass nichts mehr zu erkennen ist. Auf einem Handy passen 40 Karten
     nur bei 15 % auf den Schirm, und ein Feld aus grauen Strichen
     hilft niemandem. Dann wird stattdessen die Mitte gezeigt, wo die
     meistgetragenen Karten liegen, und der Rest ist einen Wisch oder
     einen Druck auf ⤢ entfernt. */
  function fitView(port, opts) {
    const availW  = Math.max(80, port.clientWidth - 2 * CLOUD_PAD);
    const maxH    = Math.max(300, Math.round(window.innerHeight * 0.62));
    const byWidth = Math.min(1, availW / vp.w);

    // Wird ohnehin ausschnittweise gezeigt, darf das Fenster den ganzen
    // erlaubten Platz nehmen — sonst bliebe ein flacher Streifen übrig.
    port.style.height = (byWidth < CLOUD_INIT_MIN
      ? maxH
      : clamp(Math.ceil(vp.h * byWidth) + 2 * CLOUD_PAD, 240, maxH)) + 'px';

    const availH = Math.max(80, port.clientHeight - 2 * CLOUD_PAD);

    vp.fit   = Math.min(1, availW / vp.w, availH / vp.h);
    // ⤢ heißt „alles zeigen" und meint es auch. Beim Öffnen dagegen
    // gilt die Lesbarkeitsgrenze.
    vp.scale = (opts && opts.full) ? vp.fit
                                   : Math.max(vp.fit, Math.min(1, CLOUD_INIT_MIN));
    // Auf die Mitte setzen — dort liegen die meistgetragenen Karten.
    // Ohne das begänne ein Ausschnitt in der linken oberen Ecke.
    vp.tx = (port.clientWidth  - vp.w * vp.scale) / 2;
    vp.ty = (port.clientHeight - vp.h * vp.scale) / 2;
    clampView();
    applyView();
  }

  function zoomAt(next, px, py) {
    const s = clamp(next, minScale(), ZOOM_MAX);
    if (s === vp.scale) return;
    // Der Punkt unter dem Finger bleibt unter dem Finger.
    vp.tx = px - (px - vp.tx) * (s / vp.scale);
    vp.ty = py - (py - vp.ty) * (s / vp.scale);
    vp.scale = s;
    vp.touched = true;
    clampView();
    applyView();
  }

  function zoomStep(f) {
    const port = $('bdPort');
    if (!port) return;
    zoomAt(vp.scale * f, port.clientWidth / 2, port.clientHeight / 2);
  }

  function layoutClouds(opts) {
    const box  = $('bdCloud');
    const port = $('bdPort');
    if (!box || !port) return;

    const key  = state.cat + '|' + viewKind();
    // Ausschnitt behalten, solange derselbe Bereich zu sehen ist und
    // jemand ihn selbst eingestellt hat: ein Poll alle 5 Sekunden darf
    // niemandem die Lupe aus der Hand schlagen.
    const keep = vp.touched && vp.key === key && !(opts && opts.refit);
    const old  = { scale: vp.scale, tx: vp.tx, ty: vp.ty };

    try {
      const size = layoutCloud(box, state.shuffle);
      if (!size) return;
      vp.w = size.w; vp.h = size.h; vp.key = key;
      if (!keep) vp.touched = false;

      fitView(port);
      if (keep) {
        vp.scale = clamp(old.scale, minScale(), ZOOM_MAX);
        vp.tx = old.tx; vp.ty = old.ty;
        vp.touched = true;
        clampView();
        applyView();
      }
      port.classList.remove('bd-port--plain');
    } catch (e) {
      // Lieber untereinander als übereinander: die Karten bleiben
      // lesbar, auch wenn die Platzierung schiefgeht.
      console.warn('[BOARD] Wolken-Layout fehlgeschlagen:', e.message);
      box.classList.add('bd-cloud--plain');
      box.style.width = ''; box.style.height = '';
      port.classList.add('bd-port--plain');
      port.style.height = '';
      $('bdStage').style.transform = '';
    }
  }

  /* ── Finger und Maus im Fenster ──────────────────────────
     Zwei Finger schieben und zoomen — immer, auch im Überblick, und
     mit derselben Geste: der Punkt zwischen den Fingern bleibt zwischen
     den Fingern.

     Der eine Finger gehört dagegen zunächst dem Blättern zwischen den
     Bereichen; erst wer selbst aufgezogen hat, schiebt damit den
     Ausschnitt (isPanMode). Sonst müsste man sich zwischen zwei
     nützlichen Gesten entscheiden, bevor man weiß, welche man
     braucht.                                                          */
  function wirePort(port) {
    if (!port || port.dataset.wired) return;
    port.dataset.wired = '1';

    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid  = t => {
      const r = port.getBoundingClientRect();
      return { x: (t[0].clientX + t[1].clientX) / 2 - r.left,
               y: (t[0].clientY + t[1].clientY) / 2 - r.top };
    };

    let pinch = null, drag = null;

    port.addEventListener('touchstart', ev => {
      if (ev.touches.length === 2) {
        const m = mid(ev.touches);
        pinch = { d: Math.max(1, dist(ev.touches)), s: vp.scale, mx: m.x, my: m.y, tx: vp.tx, ty: vp.ty };
        drag  = null;
        // Ein Doppeltipp beginnt wie ein Zwei-Finger-Griff nun einmal
        // mit einem Finger — beides abbestellen, sonst öffnet sich beim
        // Aufziehen ein Detail oder es wird ungewollt zugestimmt.
        gesture.cancelTap();
        gesture.cancelSwipe();
      } else if (ev.touches.length === 1 && isPanMode()) {
        drag = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, tx: vp.tx, ty: vp.ty, on: false };
      }
    }, { passive: true });

    port.addEventListener('touchmove', ev => {
      if (pinch && ev.touches.length === 2) {
        // cancelable prüfen: hat der Browser die Geste schon als
        // Seiten-Scrollen übernommen, ist preventDefault wirkungslos und
        // wirft nur eine Warnung in die Konsole.
        if (ev.cancelable) ev.preventDefault();
        const m = mid(ev.touches);
        const s = clamp(pinch.s * (dist(ev.touches) / pinch.d), minScale(), ZOOM_MAX);
        // Der Punkt, der beim Aufsetzen zwischen den Fingern lag, bleibt
        // zwischen den Fingern — dadurch zoomt und schiebt dieselbe Geste.
        vp.tx = m.x - (pinch.mx - pinch.tx) / pinch.s * s;
        vp.ty = m.y - (pinch.my - pinch.ty) / pinch.s * s;
        vp.scale = s;
        vp.touched = true;
        vp.movedAt = Date.now();
        clampView(); applyView();
        return;
      }
      if (drag && ev.touches.length === 1) {
        const dx = ev.touches[0].clientX - drag.x, dy = ev.touches[0].clientY - drag.y;
        if (!drag.on && Math.abs(dx) + Math.abs(dy) < 8) return;   // Wackeln ist kein Schieben
        if (!drag.on) { drag.on = true; gesture.cancelTap(); gesture.cancelSwipe(); }
        if (ev.cancelable) ev.preventDefault();
        vp.tx = drag.tx + dx; vp.ty = drag.ty + dy;
        vp.movedAt = Date.now();
        clampView(); applyView();
      }
    }, { passive: false });

    const end = ev => {
      if (ev.touches.length < 2) pinch = null;
      if (ev.touches.length === 0) drag = null;
    };
    port.addEventListener('touchend', end,    { passive: true });
    port.addEventListener('touchcancel', end, { passive: true });

    // Maus: Strg/⌘ + Rad zoomt. Ohne Zusatztaste bleibt das Rad beim
    // Scrollen der Seite — ein Board, das man nicht mehr verlassen kann,
    // weil das Rad in der Wolke hängen bleibt, wäre schlimmer.
    port.addEventListener('wheel', ev => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const r = port.getBoundingClientRect();
      zoomAt(vp.scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });

    // Am Rechner wird mit gedrückter Taste geschoben, sobald es etwas
    // zu schieben gibt.
    port.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'touch' || ev.button !== 0 || !isPanMode()) return;
      if (ev.target.closest('.bd-zoom')) return;
      drag = { x: ev.clientX, y: ev.clientY, tx: vp.tx, ty: vp.ty, on: false, id: ev.pointerId };
    });
    port.addEventListener('pointermove', ev => {
      if (!drag || drag.id !== ev.pointerId) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.on && Math.abs(dx) + Math.abs(dy) < 6) return;
      if (!drag.on) { drag.on = true; port.setPointerCapture(ev.pointerId); gesture.cancelTap(); }
      vp.tx = drag.tx + dx; vp.ty = drag.ty + dy;
      vp.movedAt = Date.now();
      clampView(); applyView();
    });
    const stopDrag = ev => { if (drag && drag.id === ev.pointerId) drag = null; };
    port.addEventListener('pointerup', stopDrag);
    // Ohne das bliebe ein Schieben hängen, wenn der Zeiger das Fenster
    // verlässt oder das System die Geste abbricht.
    port.addEventListener('pointercancel', stopDrag);

    $('bdZoom').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-zoom]'); if (!b) return;
      ev.stopPropagation();
      if (b.dataset.zoom === 'in')  zoomStep(1.35);
      if (b.dataset.zoom === 'out') zoomStep(1 / 1.35);
      if (b.dataset.zoom === 'fit') { vp.touched = false; fitView(port, { full: true }); }
      if (b.dataset.zoom === 'shuffle') {
        // Nur dieses Gerät. Die Anordnung wird hier gerechnet, der
        // Server kennt bloß Text und Zustimmungen — niemand im Kurs
        // merkt etwas davon.
        state.shuffle = (state.shuffle + 1) % 6;
        vp.touched = false;
        layoutClouds({ refit: true });
        toast('Neu angeordnet — nur auf deinem Bildschirm.');
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
           viewKind() === 'fakt' ? 'Noch keine Recherchen im Kurs.' : 'Noch keine Post-Its im Kurs.'
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

    /* Beim Anlegen steht das Kontingent im Titel — „Neues Post-It 4 von
       10". Hier ist es die Antwort auf eine Frage, die man sich gerade
       stellt; in der Kopfzeile war es eine Zahl, die immer dastand.
       Admins bekommen keine: für sie gilt das Kontingent nicht. */
    const me   = state.data?.me || {};
    const used = kind === 'fakt' ? (me.facts_used ?? 0) : (me.ideas_used ?? 0);
    const max  = kind === 'fakt' ? factsMax() : ideasMax();
    const nth  = state.isAdmin ? '' : ` ${Math.min(used + 1, max)} von ${max}`;

    $('bdModalTitle').textContent = note
      ? (kind === 'fakt' ? 'Recherche bearbeiten' : 'Post-It bearbeiten')
      : (kind === 'fakt' ? `Neue Recherche${nth}` : `Neues Post-It${nth}`);

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
    $('bdSrcDate').value   = note?.source_date ? String(note.source_date).slice(0, 7) : '';
    $('bdSrcDate').max     = monthIso();

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
      date:   isFact && (!$('bdSrcDate').value || $('bdSrcDate').value > monthIso())
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
      // Nur Monat/Jahr sind erfassbar — der Tag ist für die Quellenangabe
      // irrelevant, die DB-Spalte ist aber `date`. Fixer Tag 1, wird nie
      // wieder ausgelesen (formatMonthYear zeigt ihn nicht an).
      source_date:   isFact && $('bdSrcDate').value ? $('bdSrcDate').value + '-01' : null,
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
      (note.kind === 'fakt' ? '<span class="bd-pill bd-pill--fakt">📎 Recherche</span>' : '');

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
    // Bei einer Recherche steht keine Zustimmungszeile: was zählt, ist
    // die Quelle darüber, nicht wie viele sie mögen.
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

    $('bdPhaseHelp').addEventListener('click', openPhaseInfo);
    $('bdPhaseInfoOk').addEventListener('click', closePhaseInfo);
    $('bdPhaseInfo').addEventListener('click', ev => {
      if (ev.target === $('bdPhaseInfo')) closePhaseInfo();
    });

    /* Neue Karte: Art aus dem Fach, Bereich aus dem Wechsler daneben.
       Ist das Kontingent aufgebraucht, sagt der Knopf das hier — kurz,
       und ohne ein Formular zu öffnen, das nachher nur abgewiesen
       würde. */
    $('bdCatAdd').addEventListener('click', () => {
      const kind = viewKind();
      if (quotaFull()) {
        toast(kind === 'fakt'
          ? `Du hast alle ${factsMax()} Recherchen erstellt.`
          : `Du hast alle ${ideasMax()} Post-Its erstellt.`, true);
        return;
      }
      openModal(kind, null, state.cat);
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
      if (ev.key === 'Escape') {
        if (!$('bdModal').hidden)     closeModal();
        if (!$('bdDetail').hidden)    closeDetail();
        if (!$('bdPhaseInfo').hidden) closePhaseInfo();
        if (!$('bdConfirm').hidden)   { $('bdConfirm').hidden = true; state.confirmFn = null; }
        return;
      }

      // Pfeiltasten blättern durch die Bereiche — am Beamer steht man
      // meist an der Tastatur und nicht am Tablet. Nicht, solange ein
      // Fenster offen ist oder jemand in einem Feld schreibt.
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      if (state.view !== 'board') return;
      if (!$('bdModal').hidden || !$('bdDetail').hidden || !$('bdConfirm').hidden
          || !$('bdPhaseInfo').hidden || !$('bdReveal').hidden) return;
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
    gesture.cancelTap = clearTap;

    async function cardTapped(card) {
      // Wer gerade geschoben oder gezoomt hat, wollte keine Karte
      // öffnen — der Finger kam nur zufällig auf einer zum Liegen.
      if (Date.now() - vp.movedAt < 350) return;

      const note = state.data?.notes.find(n => n.id === card.dataset.note);
      if (!note) return;

      // Wo nicht zugestimmt werden kann — eigene Karte, oder Recherche —
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
       waagerechter war als senkrecht.

       Wer selbst hineingezoomt hat, schiebt mit dem Finger, statt zu
       blättern (isPanMode, siehe wirePort) — sonst käme man aus einem
       vergrößerten Ausschnitt nicht mehr heraus, ohne den Bereich zu
       wechseln. */
    let tx = 0, ty = 0, tt = 0;
    gesture.cancelSwipe = () => { tt = 0; };

    $('bdBoard').addEventListener('touchstart', ev => {
      if (ev.touches.length !== 1 || isPanMode()) { tt = 0; return; }
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

    // Dreht jemand das Tablet, ändert sich das Fenster — die Anordnung
    // der Karten zueinander nicht, aber der Maßstab. Neu einpassen,
    // nicht neu laden: die Karten stehen ja schon im DOM.
    let resizeT = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => layoutClouds({ refit: true }), 180);
    });

    // Inter kommt per @import nach. Bis sie da ist, misst der Browser
    // die Karten in der Ersatzschrift — danach passen die Kästen nicht
    // mehr zum Text, also einmal nachrechnen.
    if (document.fonts?.ready) document.fonts.ready.then(() => layoutClouds({ refit: true })).catch(() => {});
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
      showStatus('Reality Check gehört deinem Kurs — dafür musst du angemeldet sein.', true);
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
