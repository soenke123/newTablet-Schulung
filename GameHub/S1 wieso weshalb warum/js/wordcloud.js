/* „Warum Tablets?" — eine Wortwolke für den Einstieg in Season 1.

   Abgeleitet vom Reality-Check-Board (GameHub/S3 Zukunftsboard). Der
   Wolken-Apparat ist von dort unverändert übernommen — Spirale,
   Kollisionsprüfung, virtuelle Tafel, Lupe, Gesten, die drei Kanäle der
   Zustimmung. Weg ist alles, was aus einer Unterrichtsreihe kommt und
   nicht aus einem Einstieg: sechs Bereiche, drei Haltungen, die
   Themen-Achse, die Recherche-Phase mit Quellenzwang, die vorbereiteten
   Karten der Lehrkraft, das Wachstum.

   Übrig bleibt: eine Frage, zehn Zettel pro Kopf, Zustimmung per
   Doppeltipp, zwei Phasen. Die CSS-Klassen heißen weiter `bd-` — die
   Datei ist eine Kopie von board.css, und ein Umbenennen über 1100
   Zeilen machte jeden späteren Abgleich unmöglich.

   Grundregel wie dort: der Server entscheidet. Phase, Eigentum,
   Kontingent und Textlänge prüft wc_upsert_note (Migration 0075) noch
   einmal komplett. Was hier passiert, ist Komfort — blasse Knöpfe und
   Fehlermeldungen in verständlichem Deutsch, keine Sicherheit.

   Kein localStorage: die Zettel gehören dem Kurs und leben auf dem
   Server. Ansichts-Einstellungen liegen im sessionStorage, damit auf
   einem geteilten Tablet nichts vom Vorgänger übrig bleibt.          */
(function () {
  'use strict';

  /* ── Die eine Frage ──────────────────────────────────────
     Sie steht dauerhaft über der Wolke und noch einmal im Formular.
     Beim Reality Check saß an dieser Stelle der Bereichs-Wechsler; hier
     gibt es nichts zu wechseln, und der Platz gehört dem Auftrag. */
  const QUESTION = 'Warum wollt ihr ein Tablet in der Schule nutzen?';

  /* Zwei Phasen, und anders als beim Reality Check sind sie KEINE
     Fächer: es liegen immer dieselben Zettel da. Phase 2 ändert nur,
     was man mit ihnen tun darf — nämlich nichts mehr außer zustimmen
     und lesen.

     Die Kontingent-Zahl steht als {terms} drin und wird erst beim
     Anzeigen aus der Server-Antwort gefüllt (phaseTask()): die Zahl
     gehört dem Server, der sie auch durchsetzt. */
  const PHASE_INFO = {
    1: { name: 'Sammeln',
         task: QUESTION + ' Schreib auf, was dir einfällt — ein Begriff oder ein paar Worte, pro Zettel eine Sache. Du hast {terms} Zettel. Und schau dir an, was die anderen schreiben: was du auch so siehst, kannst du mit einem Doppeltipp bestätigen.' },
    2: { name: 'Besprechen',
         task: 'Eure Wolke steht. Je öfter etwas bestätigt wurde, desto größer steht es da. Jetzt schauen wir gemeinsam drauf — neue Zettel kommen keine mehr dazu, zustimmen kannst du weiter.' }
  };

  const ERROR_TEXT = {
    not_authenticated:  'Du bist nicht mehr angemeldet. Lade die Seite neu.',
    session_expired:    'Deine Anmeldung ist abgelaufen. Lade die Seite neu (F5) — eure Wolke bleibt erhalten.',
    no_cluster:         'Du gehörst noch zu keinem Kurs — ohne Kurs gibt es keine Wolke.',
    no_profile:         'Zu deinem Konto fehlt ein Profil. Melde dich bei deiner Lehrkraft.',
    account_not_active: 'Dein Konto ist noch nicht freigeschaltet.',
    season_locked:      'Diese Kachel ist für deinen Kurs noch nicht offen.',
    invalid_board:      'Diese Wolke gibt es nicht.',
    phase_locked:       'Die Sammelrunde ist vorbei — jetzt wird nur noch besprochen.',
    quota_exceeded:     'Du hast schon alle deine Zettel geschrieben.',
    not_owner:          'Das ist nicht dein Zettel.',
    not_admin:          'Das dürfen nur Admins.',
    not_found:          'Diesen Zettel gibt es nicht mehr.',
    invalid_input:      'Mit dem Text stimmt etwas nicht.',
    own_note:           'Deinem eigenen Zettel kannst du nicht zustimmen.',
    network:            'Keine Verbindung zum Server. Versuch es gleich nochmal.'
  };

  const CLUSTER_KEY = 'wc_cluster';
  const VIEW_KEY    = 'wc_view';
  const POLL_MS     = 5000;

  /* ── Zustand ─────────────────────────────────────────── */
  const state = {
    data:      null,   // letzte Antwort von wc_get
    isAdmin:   false,
    clusters:  [],
    clusterId: null,   // nur Admins wählen aktiv; Schüler bleiben auf null
    view:      'board',
    lastPhase: null,   // letzte Kurs-Phase — erkennt den Wechsel
    sort:      { col: 'created_at', dir: 'desc' },
    lastSig:   null,
    editing:   null,   // { id|null }
    detailId:  null,   // offene Karten-Ansicht
    confirmFn: null,
    shuffle:   0,      // Mischzähler für „neu anordnen" — rein lokal
    failStreak: 0,     // wie viele stille Polls hintereinander fehlschlugen
    rewardBusy: false, // läuft gerade ein Belohnungs-Abruf oder eine Sequenz?
    rewardDue:  false  // Phasenwechsel kam, während ein Formular offen war
  };

  /* Die Wolke hat zwei Ebenen, die einander ins Wort fallen können:
     Tippen auf den Karten (in wire()) und Schieben/Zoomen im Fenster
     (in wirePort()). Damit die Lupe das Tippen abbestellen kann, ohne
     dass beide im selben Gültigkeitsbereich liegen müssen, hängt der
     Abbrecher hier.

     cancelSwipe bleibt als No-Op stehen: wirePort ruft es auf, und beim
     Reality Check hing daran das Blättern zwischen den sechs Bereichen.
     Hier gibt es nur einen — der eine Finger gehört im Überblick der
     Seite, nicht einem Wechsler. */
  const gesture = { cancelTap: () => {}, cancelSwipe: () => {} };

  /* ── Kleinkram ───────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHtml
    ? window.escapeHtml(s)
    : String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));

  function formatDate(iso) {
    if (!iso) return '';
    // 'T00:00:00' erzwingt lokale Mitternacht. Ohne das liest der Browser
    // ein reines Datum als UTC und zeigt westlich von Greenwich den Vortag.
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

  /* ── Rechte — dieselbe Logik wie serverseitig (0075) ─────
     In Phase 2 ist der Inhalt eingefroren: keine neuen Zettel, keine
     Änderungen, kein Löschen. Anders als beim Reality Check gibt es
     hier keine zweite Arbeitsphase, in der man nachbessern würde.
     Zustimmen bleibt in beiden Phasen möglich — das Einfrieren gilt
     dem Inhalt, nicht dem Gespräch.                                  */
  function phase() { return state.data?.phase ?? 1; }

  function canWrite() { return state.isAdmin || phase() === 1; }
  function canEdit(note) { return state.isAdmin || (!!note.is_mine && phase() === 1); }
  function canLike(note) { return !note.is_mine; }

  /* ── Laden ───────────────────────────────────────────── */
  async function load(opts) {
    const quiet = opts && opts.quiet;
    const res = await window.WordcloudAPI.get(state.clusterId);

    if (!res || !res.ok) {
      // Beim stillen Poll keinen Ladefehler über eine funktionierende
      // Wolke legen — ein Aussetzer im WLAN ist kein Grund, dem Kurs den
      // Inhalt wegzunehmen.
      if (quiet && state.data) {
        // Stumm bleiben darf es aber nicht auf Dauer: eine Seite, die
        // aussieht wie immer und in Wahrheit seit Minuten nichts mehr
        // holt, ist im Unterricht schlimmer als eine Fehlermeldung.
        state.failStreak++;
        if (state.failStreak === 3) {
          toast(res?.error === 'session_expired'
            ? ERROR_TEXT.session_expired
            : 'Keine Verbindung — die Wolke zeigt gerade einen alten Stand.', true);
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

    const p = res.phase ?? 1;
    const firstLoad = state.lastPhase === null;
    const switched  = !firstLoad && p !== state.lastPhase;
    state.lastPhase = p;

    render();

    /* Der Auftrag kommt von selbst: einmal beim Öffnen und danach immer
       dann, wenn die Lehrkraft weiterschaltet — der Wechsel erreicht
       jedes Tablet über den 5-Sekunden-Poll, und ohne Ansage merkt ihn
       niemand außer daran, dass der Plus-Knopf plötzlich weg ist.

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
        // einmal aus, und wer sie jetzt einlöste, verlöre den halb
        // getippten Zettel an die Sequenz. Der nächste Poll ohne offenes
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
    $('bdPhases').hidden = true;
    $('bdViewSwitch').hidden = true;
    fillPage(false);
    // Signatur verwerfen: sonst hält render() beim nächsten erfolgreichen
    // Laden die Daten für „unverändert", steigt früh aus — und die
    // Fehlermeldung bliebe über einer versteckten Wolke stehen.
    state.lastSig = null;
  }

  /* ── Rendern ─────────────────────────────────────────── */
  function signature() {
    const d = state.data;
    if (!d) return '';
    return JSON.stringify([
      d.cluster_id, d.phase, d.is_admin, state.view, state.sort,
      d.me?.terms_used,
      // likes gehören in die Signatur: sonst bliebe eine Zustimmung aus
      // einem anderen Tablet unsichtbar, weil updated_at sich dabei
      // nicht ändert — und der eigene Doppeltipp würde ebenso verschluckt.
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
      renderQuestionBar();
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

  /* Die Phasenleiste zeigt nur, wo der Kurs steht — sie schaltet nichts
     um. Beim Reality Check war sie zugleich der Wechsler zwischen zwei
     Fächern; hier gibt es nur eines. */
  function renderPhases() {
    const p = phase();
    $('bdPhases').hidden = false;
    document.querySelectorAll('.bd-phase').forEach(el => {
      const n = Number(el.dataset.phase);
      el.classList.toggle('bd-phase--running', n === p);
      el.classList.toggle('bd-phase--locked',  n > p);
    });
  }

  /* Das Kontingent kommt aus wc_get — dort wird es auch durchgesetzt.
     Die Zahl daneben ist nur der Notnagel für den Moment vor dem ersten
     Laden; weicht der Server ab, gilt der Server. */
  const termsMax = () => state.data?.me?.terms_max ?? 10;

  const phaseTask = p => PHASE_INFO[p].task.replace('{terms}', termsMax());

  /* ── Auftrag der Phase ───────────────────────────────────
     Kommt von selbst, wenn er gebraucht wird — beim Öffnen und wenn die
     Lehrkraft weiterschaltet — und sonst auf Anfrage über das ? in der
     Kopfzeile. */
  function openPhaseInfo() {
    const p = phase();
    $('bdPhaseInfoNo').textContent    = p;
    $('bdPhaseInfoTitle').textContent = `Phase ${p} · ${PHASE_INFO[p].name}`;
    $('bdPhaseInfoText').textContent  = phaseTask(p);
    $('bdPhaseInfo').hidden = false;
    $('bdPhaseInfoOk').focus();
  }

  function closePhaseInfo() { $('bdPhaseInfo').hidden = true; }

  /* ── Belohnung ───────────────────────────────────────────
     Das Monster hängt an einer Handlung der LEHRKRAFT: Sammelphase
     beendet ⇒ es schlüpft. Gerechnet und vergeben wird serverseitig
     (wc_claim_reward, Migration 0075) — hier wird nur gezeigt, was
     zurückkommt.

     Warum die Sequenz auf DIESER Seite läuft und nicht erst im Hub: der
     Kurs sitzt in diesem Moment zusammen. Wenn die Lehrkraft
     weiterschaltet, schlüpft es auf allen Tablets gleichzeitig. Für
     alle, die gerade nicht auf der Seite waren, holt der Hub dieselbe
     Sequenz beim nächsten Besuch nach — der Server gibt sie genau
     einmal aus, doppelt kann es also nicht kommen.

     Anders als beim Reality Check hängt hier NICHTS an der eigenen
     Leistung: jeder im Kurs bekommt dasselbe. Das ist die erste Kachel
     einer Schulung und der erste Moment, in dem überhaupt ein Monster
     auftaucht — dafür braucht es keine Bemessungsgrundlage.           */
  async function maybeClaimReward() {
    if (state.rewardBusy) return;
    // Admins moderieren, sie sammeln nicht — der Server weist sie ohnehin
    // ab, aber ein Aufruf je Phasenwechsel und Kurs wäre reine Last.
    if (state.isAdmin) return;
    state.rewardBusy = true;
    try {
      const rv = await window.WordcloudAPI.claimReward(state.clusterId);
      if (!rv || !rv.ok || rv.event !== 'hatch') return;
      await runReveal(rv);
    } catch (e) {
      console.warn('[WC] claimReward:', e.message);
    } finally {
      state.rewardBusy = false;
    }
  }

  /* Zeigt die Sequenz und löst auf, wenn sie durch ist. Der Aufrufer
     wartet darauf, damit das Phasen-Modal erst danach kommt.

     Drei Schritte und kein Wachstumsbalken: diese Kachel wächst nicht.
     Ei → Baby → Ausbeute. */
  function runReveal(rv) {
    // Ohne creatures.js gäbe es weder Ei noch Bild. Dann lieber eine
    // Zeile als ein leeres Fenster — vergeben ist die Belohnung ja
    // trotzdem, der Hub zeigt sie beim nächsten Besuch richtig.
    if (typeof getCreatureHTML !== 'function' || typeof getEggSVG !== 'function') {
      toast('Dein Monster ist geschlüpft! Schau im Hub nach.');
      return Promise.resolve();
    }

    const creature = rv.creature;
    const steps = [{ kind: 'egg' }, { kind: 'grow' }];
    if ((rv.coins_gained || 0) > 0) steps.push({ kind: 'gains' });

    const box   = $('bdReveal');
    const art   = $('bdRevealArt');
    const name  = $('bdRevealName');
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
        name.hidden  = true;
        gains.hidden = true;
        next.textContent = (i === steps.length - 1) ? 'Fertig' : 'Weiter';

        if (step.kind === 'egg') {
          $('bdRevealTitle').textContent = 'Da tut sich was…';
          sub.textContent = 'Eure Wolke steht — und da war doch noch etwas.';
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
          $('bdRevealTitle').textContent = 'Es ist geschlüpft!';
          sub.textContent = 'Es zieht mit dir in die Lernwelt — du findest es dort auf der Kachel „Warum Tablets?".';
          art.innerHTML   = getCreatureHTML(creature, 0);
          name.hidden     = false;
          name.textContent = `${CREATURE_NAMES[creature] ?? creature} · ${GROWTH_LABELS[0]}`;
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
          `<div class="bd-reveal__gain">🪙 <strong>+${rv.coins_gained}</strong> Münzen</div>`;
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
    if (state.isAdmin) return false;
    return (state.data?.me?.terms_used ?? 0) >= termsMax();
  }

  /* ── Karten in der Wolke ─────────────────────────────────
     Auf der Karte steht nur der Text. Kein Name, keine Zahl, keine
     Knöpfe — das alles steht im Detail, einen Tipp entfernt. Wie stark
     eine Aussage getragen wird, sagen drei Kanäle und keine Ziffer: die
     Größe der Karte, die Sättigung ihrer Farbe und der Stapel unter ihr.

     Drei Kanäle für dieselbe Zahl, weil einer davon lügt: die Größe ist
     ein Schriftgrad, gelesen wird aber die Fläche — und in die geht die
     Textlänge mit ein. Ein langer Zettel mit zwei Zustimmungen belegt
     mehr Platz als ein kurzer mit sieben. Farbe und Stapel sind dagegen
     von der Textmenge unabhängig und korrigieren genau das.

     Eine einzige Ausnahme: hat man selbst zugestimmt, sitzt ein kleiner
     Daumen in der Ecke. Ohne den weiß niemand mehr, wo er schon
     zugestimmt hat — und ein zweiter Doppeltipp nähme die Zustimmung
     wieder weg, ohne dass man es merkt.                               */

  const LIKE_SIZE_MIN = 0.88;   // rem — Karte ohne Zustimmung
  const LIKE_SIZE_MAX = 2.20;   // rem — Karte mit den meisten
  const LIKE_SPAN_REF = 5;      // ab so vielen Zustimmungen ist die Spanne voll

  /* ── Die eine Zahl ───────────────────────────────────────
     Alle drei Kanäle hängen an diesem einen normierten Wert zwischen 0
     und 1 — und das ist keine Sparsamkeit, sondern der Punkt. Käme die
     Farbe aus den rohen Zustimmungen und die Größe aus einer gedämpften
     Kurve, gäbe es Karten, die groß, aber blass sind. Ein Widerspruch
     zwischen zwei Kanälen derselben Größe ist schlimmer als ein Kanal
     weniger.

     Zwei Regeln stecken drin. Erstens ein Exponent unter 1: der Sprung
     von 0 auf 1 Zustimmung soll sichtbar sein, der von 8 auf 9 kaum
     noch — sonst erdrückt eine einzelne Karte die ganze Wolke.

     Zweitens wird die Spanne selbst erst mit der Wolke größer. Sonst
     wäre am Anfang der erste Zettel mit einer einzigen Zustimmung
     sofort doppelt so groß wie alle anderen — eine Aussage über den
     Kurs, die eine Stimme nicht trägt. Erst ab ~5 Zustimmungen auf der
     Spitzenkarte wird die volle Spanne genutzt. Weil alle drei Kanäle
     daran hängen, greift die Dämpfung auch für Farbe und Stapel.     */
  function strength(likes, maxLikes) {
    const l = Math.max(0, Number(likes) || 0);
    if (maxLikes <= 0 || l <= 0) return 0;
    return Math.pow(Math.min(l, maxLikes) / maxLikes, 0.65) *
           Math.min(1, maxLikes / LIKE_SPAN_REF);
  }

  function sizeFor(t) {
    return LIKE_SIZE_MIN + t * (LIKE_SIZE_MAX - LIKE_SIZE_MIN);
  }

  /* ── Kanal 2: die Sättigung ──────────────────────────────
     Sechs Zettelfarben statt der drei Haltungsfarben des Reality Check:
     dort sagte die Farbe „Chance / Risiko / Vermutung", hier gibt es
     nichts zu unterscheiden — also wird sie das, was Klebezettel auf
     einer echten Tafel auch sind, nämlich bunt. Die Wolke bekommt
     dadurch Struktur, ohne dass die Farbe etwas behauptet.

     Je Farbe zwei Enden, dazwischen wird linear gemischt. Der FARBTON
     bleibt über die ganze Rampe derselbe — nur Sättigung und Helligkeit
     wandern. Sättigung ist eine zweite Achse INNERHALB der Zettelfarbe,
     keine siebte Farbe.

     Alle sechs Töne halten dieselbe Helligkeit und Sättigung wie die
     drei aus board.js übernommenen. Sonst wäre die Wolke ein Farbkasten
     und kein Block Klebezettel.

     Das blasse Ende hört bewusst VOR Weiß auf: ein Zettel ohne
     Zustimmung soll wie ein Zettel aussehen und nicht wie eine
     ausgegraute Fläche.

     Warum die Werte hier stehen und nicht im Stylesheet: zwischen den
     Enden muss gerechnet werden, und dafür muss das Skript sie kennen.
     Derselbe Grund, aus dem auch TILTS hier steht. In wc.css bleibt die
     Mitte der Rampe als Rückfall für Karten ohne Rampe stehen — wer
     hier schraubt, sollte dort mitziehen.                             */
  const NOTE_RAMPS = [
    // Grün
    { fillP: [237,248,238], fillS: [147,211,160], lineP: [215,236,217], lineS: [111,190,128] },
    // Rosa
    { fillP: [253,238,236], fillS: [242,164,154], lineP: [247,222,217], lineS: [232,131,118] },
    // Gelb
    { fillP: [254,248,230], fillS: [245,210,113], lineP: [244,233,200], lineS: [223,184,69]  },
    // Blau
    { fillP: [235,244,252], fillS: [146,190,235], lineP: [212,230,246], lineS: [107,163,219] },
    // Lila
    { fillP: [245,240,252], fillS: [186,166,226], lineP: [230,222,246], lineS: [154,130,205] },
    // Pfirsich
    { fillP: [254,243,231], fillS: [246,186,120], lineP: [248,228,206], lineS: [228,159,86]  }
  ];

  /* Welcher Zettel welche Farbe bekommt: aus der Notiz-ID gerechnet,
     nicht gespeichert. Die Farbe ist Anzeige und keine Aussage — sie
     gehört nicht in die Datenbank.

     Zwei Folgen, beide gewollt. Erstens sieht jedes Gerät dieselbe
     Farbe: am Beamer und auf dem Tablet ist derselbe Zettel derselbe
     Zettel. Zweitens geht der Mischzähler (⟳ „neu anordnen") hier
     bewusst NICHT ein — wer „den blauen da oben" sagt, soll ihn nach
     dem Neuanordnen wiederfinden. Die Neigung darf wechseln, die Farbe
     nicht.

     Eigener Hash-Faktor, nicht der aus tiltFor: beide Listen haben
     sechs Einträge, und mit demselben Streuwert läge jeder grüne Zettel
     im selben Winkel. Ein Muster, das niemand beabsichtigt hat, sieht
     man trotzdem. */
  function rampFor(id) {
    let h = 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 100003;
    return NOTE_RAMPS[h % NOTE_RAMPS.length];
  }

  function mixRGB(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
                    Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
                    Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  /* ── Kanal 3: der Stapel ─────────────────────────────────
     Anzahl der Blätter unter der Karte. Bewusst grob — drei Zustände,
     nicht zwölf: der Stapel beantwortet „viel oder wenig", keine
     Rangfolge. Die Feinauflösung leisten Größe und Sättigung, die
     stufenlos laufen. Gezeichnet wird er in wc.css (--st1/--st2). */
  function sheetsFor(t) { return t >= 0.72 ? 2 : t >= 0.40 ? 1 : 0; }

  function cardHTML(note, opts) {
    const o = opts || {};

    /* Die drei Kanäle gelten NUR in der Wolke, also nur dort, wo eine
       Stärke mitkommt. Ohne --cn-fill greift in wc.css überall der
       Rückfall, und die Blätter sind transparent. */
    const hasStrength = typeof o.strength === 'number';
    const t    = hasStrength ? o.strength : 0;
    const size = hasStrength ? sizeFor(t) : 0;

    /* Größere Karten dürfen auch breiter werden, sonst wird eine
       2-rem-Karte zu einem schmalen hohen Turm — und kleine bleiben
       schmal, damit sie sich am Rand zwischen die großen fügen.

       Bewusst ohne `100%`: die Wolke wird auf einer virtuellen Tafel
       gepackt, die immer breit genug ist, und danach als Ganzes
       skaliert. Eine Karte, die sich an die Gerätebreite klemmt, würde
       auf dem Handy die ganze Spalte füllen — dann bleibt der Spirale
       kein Platz mehr und die Wolke wird zum Stapel. */
    let style = '';
    if (hasStrength) {
      const ramp = rampFor(note.id);
      style = ` style="font-size:${size.toFixed(2)}rem` +
              `;max-width:${Math.round(150 + (size - LIKE_SIZE_MIN) * 145)}px` +
              `;--cn-fill:${mixRGB(ramp.fillP, ramp.fillS, t)}` +
              `;--cn-line:${mixRGB(ramp.lineP, ramp.lineS, t)}"`;
    }

    // Die Blätter unter der Karte. Nur in der Wolke, siehe oben.
    const sheets = hasStrength ? sheetsFor(t) : 0;

    /* Zettel der Lehrkraft tragen einen Rahmen (bd-cn--admin, gezeichnet
       in wc.css). Das ist die einzige Ausnahme von „auf der Karte steht
       nur der Text" außer dem Daumen — wer sie nicht sieht, hält den
       Zettel für den einer Mitschülerin. Der Rahmen sagt „nicht aus dem
       Kurs", nicht „richtiger", deshalb ist er anthrazit und keine
       siebte Zettelfarbe. */
    const hint = (note.by_admin ? 'Von deiner Lehrkraft · ' : '') + (note.is_mine
      ? 'Antippen: deinen Zettel ansehen, ändern oder löschen'
      : 'Antippen für Details · Doppeltippen zum Zustimmen');

    // Bewusst ohne role="button": die Karte ist zwar antippbar, aber
    // role="button" macht ihren Inhalt für Screenreader zu reiner
    // Dekoration — und der Inhalt ist hier die ganze Information.
    const liked = !!note.liked_by_me;

    return `<article class="bd-cn${note.by_admin ? ' bd-cn--admin' : ''}${note.is_mine ? ' bd-cn--mine' : ''}${liked ? ' bd-cn--liked' : ''}${sheets ? ` bd-cn--st${sheets}` : ''}"
             data-note="${esc(note.id)}"${style}
             tabindex="0" title="${hint}">
        ${liked ? '<span class="bd-cn__liked" title="Du hast zugestimmt">👍</span>' : ''}
        <p class="bd-cn__text">${esc(note.text)}</p>
      </article>`;
  }

  /* Nach Zustimmung sortiert — die Platzierung in der Wolke läuft von
     innen nach außen, wer zuerst drankommt, landet in der Mitte. Bei
     Gleichstand das Alter, sonst tauschten zwei Zettel mit gleich vielen
     Stimmen bei jedem Poll die Plätze. */
  function sortedNotes() {
    return (state.data?.notes || []).slice().sort((a, b) =>
      (Number(b.likes || 0) - Number(a.likes || 0)) ||
      String(a.created_at).localeCompare(String(b.created_at)));
  }

  /* Die Frage und der Plus-Knopf. Beim Reality Check stand hier der
     Bereichs-Wechsler; die Leiste bleibt (sie klebt beim Scrollen oben
     fest), ihr Inhalt ist ein anderer. */
  function renderQuestionBar() {
    $('bdCatNav').hidden = false;

    const n = (state.data?.notes || []).length;
    $('bdCatName').innerHTML =
      `${esc(QUESTION)} <span class="bd-catnav__count">${n}</span>`;

    /* Anklickbar bleibt der Knopf auch bei vollem Kontingent — die
       Absage kommt beim Drücken als kurze Meldung. Und wie viele Zettel
       noch offen sind, steht erst dahinter im Formular („Neuer Zettel 4
       von 10"): als Dauerzähler in der Kopfzeile wird die Zahl
       dauerhaft überlesen. */
    const add = $('bdCatAdd');
    add.hidden = !canWrite();
    if (!add.hidden) {
      add.disabled = false;
      add.title = 'Neuen Zettel schreiben';
      add.setAttribute('aria-label', add.title);
      add.classList.toggle('bd-catadd--full', quotaFull());
    }
  }

  /* In der Wolken-Ansicht reicht die Tafel bis an die untere
     Bildschirmkante — darunter steht nichts mehr, also braucht die
     Seite dort auch keinen Fuß. Das Polster gehört der Liste, die
     weiterwächst. */
  const fillPage = on => document.body.classList.toggle('bd-fill', !!on);

  /* Die Tafel ist die Bühne und nicht der Inhalt: sie behält ihre
     Größe, auch wenn wenig darauf liegt. In der Wolken-Ansicht erledigt
     das die Höhe des Fensters, in der leeren Wolke diese Mindesthöhe. */
  function fitBoardHeight() {
    const b = $('bdBoard');
    b.style.minHeight = '';
    b.style.minHeight = portHeight(b) + 'px';
  }

  function renderBoard() {
    const notes = sortedNotes();
    const board = $('bdBoard');
    // Vor dem Messen: ohne Fuß kommt eine andere Höhe heraus.
    fillPage(true);

    if (!notes.length) {
      board.innerHTML = `<p class="bd-cloud-sec__empty">${emptyText()}</p>`;
      fitBoardHeight();
      return;
    }

    // Bezugsgröße für die Schriftgrade ist das Maximum über die ganze
    // Wolke.
    const maxLikes = notes.reduce((m, n) => Math.max(m, Number(n.likes || 0)), 0);

    /* Drei Schichten, jede mit genau einer Aufgabe:
       .bd-port  — das Fenster. Feste Höhe, schneidet ab, fängt die
                   Finger. Hier drin wird geschoben und gezoomt.
       .bd-stage — die Lupe. Trägt translate+scale, sonst nichts.
       .bd-cloud — die virtuelle Tafel. Wird in ihrer eigenen Breite
                   gepackt; vom Gerät kennt sie nur das Format des
                   Feldes (cloudAspect), nicht dessen Pixel.
       Getrennt, weil sonst das Zoomen die Anordnung verändern würde —
       und eine Wolke, die sich beim Hineinzoomen umsortiert, ist keine
       Karte mehr, auf der man sich zurechtfindet.

       Die Lupenknöpfe stehen NEBEN dem Fenster, nicht darin: sie
       bedienen die Ansicht und sollen deshalb nicht mitwandern. Ihr
       Platz ist die untere rechte Ecke der Tafel.                      */
    // Hier setzt das Fenster die Höhe — eine Mindesthöhe an der Tafel
    // aus einem vorherigen Zustand würde sie nur nach unten schieben.
    board.style.minHeight = '';
    board.innerHTML =
      `<div class="bd-port" id="bdPort">
         <div class="bd-stage" id="bdStage">
           <div class="bd-cloud" id="bdCloud">${notes.map(n => cardHTML(n, {
             strength: strength(Number(n.likes || 0), maxLikes)
           })).join('')}</div>
         </div>
       </div>
       <div class="bd-zoom" id="bdZoom">
         <button type="button" data-zoom="out"     aria-label="Herauszoomen" title="Herauszoomen">−</button>
         <button type="button" data-zoom="fit"     aria-label="Alles zeigen" title="Alles zeigen">⤢</button>
         <button type="button" data-zoom="in"      aria-label="Hineinzoomen" title="Hineinzoomen">＋</button>
         <button type="button" data-zoom="shuffle" aria-label="Neu anordnen"
                 title="Neu anordnen — nur auf diesem Gerät, niemand sonst merkt etwas davon">⟳</button>
       </div>`;

    layoutClouds();
    wirePort($('bdPort'));
  }

  function emptyText() {
    return 'Hier steht noch nichts. ' +
           (canWrite() ? 'Schreib den ersten Zettel.' : '');
  }

  /* ── Wolken-Layout ───────────────────────────────────────
     Archimedische Spirale von innen nach außen mit Kollisionsprüfung —
     dasselbe Grundprinzip wie bei einer klassischen Wordcloud, nur mit
     Karten statt Wörtern. Alle Karten stehen waagerecht; sie liegen
     absolut, gemessen wird über offsetWidth/offsetHeight (das sind die
     Maße VOR dem transform).

     Gepackt wird NICHT in der Gerätebreite, sondern auf einer
     virtuellen Tafel, deren Breite sich aus der Kartenfläche und dem
     Format des Feldes ergibt (cloudAspect: die Wolke nimmt die Form an,
     in der sie gezeigt wird — sonst läge sie als flaches Band in einem
     hohen Fenster).
     Der Grund steht in cloudWidth(): auf einem Handy ist eine Karte
     fast so breit wie der Bildschirm, und eine Spirale, die überall an
     den Rand stößt, ist keine Wolke mehr, sondern ein Stapel. Was auf
     den Bildschirm passt, entscheidet danach die Lupe (fitView) — und
     zur Not die zwei Finger.                                          */

  /* Sichtabstand zwischen zwei Zetteln. 17 und nicht 10 wegen des
     Stapels: die Blätter liegen bis zu 10/12 px nach rechts unten
     versetzt und ragen damit über die gemessene Karte hinaus. Mit
     weniger legte sich das unterste Blatt einer stark getragenen Karte
     über den Nachbarn — und ausgerechnet die wichtigsten Karten sähen
     aus wie ein Fehler. */
  const CLOUD_GAP   = 17;

  /* Wie weit der Stapel über die gemessene Karte hinausragt. Die
     Blätter liegen nach rechts unten versetzt (10/12 px plus 1 px
     Kante, siehe --st2 in wc.css), und offsetWidth/offsetHeight kennen
     sie nicht — Schatten zählen nicht zur Elementgröße.

     Zwei Stellen brauchen das: der Abstand oben (CLOUD_GAP liegt
     bewusst darüber, sonst schöbe sich ein Blatt über den Nachbarn)
     und der Zuschnitt der Tafel ganz unten in layoutCloud. Ohne den
     schnitte das Fenster den Randkarten ihr unterstes Blatt ab — die
     Tafel wird eng auf die Karten zugeschnitten, und der Rest liegt
     außerhalb. */
  const SHEET_REACH_X = 12;
  const SHEET_REACH_Y = 14;
  const CLOUD_PAD   = 12;     // Luft zwischen Wolke und Fensterkante
  const CLOUD_MIN_W = 380;    // schmalste virtuelle Tafel
  const CLOUD_MAX_W = 2400;   // breiteste — darüber wächst sie in die Höhe
  /* Untergrenze für das Fenster. Greift nur, wo der Platz wirklich
     ausgeht — Handy im Querformat, aufgeklappte Bildschirmtastatur. */
  const CLOUD_MIN_H = 260;

  /* Grenzen für das Format, in dem gepackt wird. Die Wolke nimmt das
     Format des Feldes an (cloudAspect), aber nicht bis zum Äußersten:
     ein sehr flaches oder sehr hohes Fenster bekäme sonst eine Wolke,
     in der die Spirale nur noch in eine Richtung läuft. */
  const CLOUD_ASPECT_MIN = 0.35;
  const CLOUD_ASPECT_MAX = 1.60;

  /* Sechs Neigungen im Wechsel. Stehen im Skript und nicht im
     Stylesheet: die Platzierung rechnet mit achsenparallelen Rechtecken
     und muss den Winkel jeder Karte KENNEN, um ihn einrechnen zu können
     — ein um 2,4° gedrehter breiter Zettel ist gut 13 px höher als der
     ungedrehte. Genau das war die Ursache der senkrechten
     Überlappungen: ein pauschaler Abstand deckt die Drehung einer
     300-px-Karte nicht ab.

     Der Winkel hängt an der Karten-ID, nicht an der Position — sonst
     zitterte die Wolke bei jedem Poll. */
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

     Das Runden hat einen handfesten Grund: die Karten werden
     nacheinander gesetzt, jede nur gegen die schon liegenden. Ein neuer
     Zettel ohne Zustimmung sortiert sich ans Ende und lässt alle
     anderen, wo sie waren — solange die Tafelbreite gleich bleibt. Ohne
     Stufen kippte sie bei jeder neuen Karte um ein paar Pixel, und die
     ganze Wolke ordnete sich im 5-Sekunden-Takt neu. Mitten in einer
     Stunde, in der 30 Leute gleichzeitig schreiben, wäre das
     unlesbar. */
  function cloudWidth(items, aspect) {
    const area   = items.reduce((s, it) => s + it.bw * it.bh, 0) * 2.1;
    const widest = items.reduce((m, it) => Math.max(m, it.bw), 0);
    const ideal  = Math.sqrt(area / aspect);
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

  function layoutCloud(box, seed, aspect) {
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

    /* Die Spirale läuft im Format des Feldes: `ratio` ist das Verhältnis
       der beiden Halbachsen, also genau die Form, die die Wolke am Ende
       annimmt. Damit legen sich die Zettel um die Mitte herum,
       waagerecht wie senkrecht. */
    const boxW = cloudWidth(items, aspect);
    const ratio = aspect;

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
       eine Style-Berechnung. Damit steht `left: 0` (aus dem Stylesheet)
       als Ausgangswert fest, und das anschließende Setzen wird zu einer
       echten Bewegung aus der linken oberen Ecke — bei jedem Zeichnen,
       also auch bei jedem Poll, der etwas Neues bringt.

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
    // ihren Maßstab. +2 px gegen Rundungsreste, dazu der Überstand des
    // Stapels, der rechts und unten über die gemessenen Karten
    // hinausragt und sonst am Fensterrand abgeschnitten würde.
    const w = Math.max(1, Math.round(maxX - minX) + 2 + SHEET_REACH_X);
    const h = Math.max(1, Math.round(maxY - minY) + 2 + SHEET_REACH_Y);
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
    ready: false,        // gab es schon eine Wolke? (sonst gilt kein Ausschnitt)
    touched: false,      // hat jemand selbst gezoomt oder geschoben?
    movedAt: 0           // wann zuletzt geschoben — unterdrückt den Klick danach
  };

  const ZOOM_MAX = 3;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Weiter als bis zum vollen Überblick muss niemand herauszoomen —
  // dahinter kommt nur noch leere Fläche.
  const minScale = () => vp.fit;
  // Ohne Fenster gibt es keinen Zoom — in der Tabelle stünden sonst noch
  // die Werte der zuletzt gesehenen Wolke.
  const isZoomed = () => !!$('bdPort') && vp.scale > vp.fit * 1.02;

  /* Wem gehört der eine Finger?

     Solange niemand selbst gezoomt hat, gehört er der Seite — man
     scrollt damit, auch wenn die Wolke beim Öffnen nicht ganz aufs
     Handy passt. Verschieben geht dann mit zwei Fingern, und das ist
     auch die Geste, die man dafür sucht. Erst wer selbst aufgezogen
     hat, ist im Erkunden und will mit einem Finger schieben; ⤢ bringt
     ihn zurück. */
  const isPanMode = () => vp.touched && isZoomed();

  function applyView() {
    const stage = $('bdStage'), port = $('bdPort');
    if (!stage || !port) return;
    stage.style.transform =
      `translate(${Math.round(vp.tx)}px,${Math.round(vp.ty)}px) scale(${vp.scale.toFixed(4)})`;
    // Solange alles hineinpasst, bleibt ein Finger fürs Scrollen
    // zuständig; erst im Zoom wird er zum Schieber.
    port.classList.toggle('bd-port--zoomed', isPanMode());
  }

  /* Ausschnitt im Fenster halten — aber ohne Fessel.

     Es zählt nur: die Wolke darf das Fenster nicht verlassen. Ist sie
     größer, sind ihre Ränder erreichbar (mit etwas Luft); ist sie
     kleiner, lässt sie sich innerhalb des Fensters frei herumschieben.
     Die Mitte ist damit kein Zwang, sondern nur der Startwert aus
     fitView. */
  function clampView() {
    const port = $('bdPort');
    if (!port) return;
    const pw = port.clientWidth, ph = port.clientHeight;
    const cw = vp.w * vp.scale,  ch = vp.h * vp.scale;
    const slack = CLOUD_PAD;
    vp.tx = clamp(vp.tx, Math.min(0, pw - cw) - slack, Math.max(0, pw - cw) + slack);
    vp.ty = clamp(vp.ty, Math.min(0, ph - ch) - slack, Math.max(0, ph - ch) + slack);
  }

  /* Wie viel Seite steht unter dem Fenster noch an?

     Gerechnet, nicht gemessen: solange das Fenster seine Höhe noch
     nicht hat, ist die Tafel nur so hoch wie ihre Mindesthöhe — eine
     Messung an document.body zählte genau die mit und machte das
     Fenster um eben diesen Betrag zu klein. Also werden die unteren
     Polster und Kanten aller Kästen aufsummiert, in denen das Fenster
     steckt, plus alles, was darunter noch im Fluss steht. Damit stimmen
     auch die schmale Fassung (@media) und die Moderationsleiste, ohne
     dass hier eine einzige Zahl steht. */
  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);

      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        // Ausgeblendetes und alles, was aus dem Fluss genommen ist
        // (Modale, Toast), braucht keinen Platz.
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight
             + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  /* Die Höhe des Feldes — und zwar unabhängig davon, was darin liegt.

     Das Feld nimmt IMMER den ganzen Platz bis zur unteren
     Bildschirmkante. Genau bis zur Kante und keinen Punkt weiter: was
     darunter läge, kann man weder sehen noch antippen, und beim
     Schieben im Zoom verschwände der Inhalt im unsichtbaren Teil.
     Ausgemessen statt geschätzt (spaceBelow), damit die Rechnung mit
     Moderationsleiste und in der schmalen Fassung stimmt. */
  function portHeight(el) {
    // Oberkante im Dokument. Über getBoundingClientRect, weil die nicht
    // davon abhängt, welcher Kasten gerade als offsetParent gilt.
    const top = el.getBoundingClientRect().top + window.scrollY;
    return Math.max(CLOUD_MIN_H, Math.round(window.innerHeight - top - spaceBelow(el)));
  }

  /* Das Format, in dem gepackt wird: das des Feldes.

     Damit legen sich die Zettel um die Mitte herum statt in ein flaches
     Band, und der Überblick wird so groß wie möglich — eine Wolke im
     Format des Fensters lässt an keiner Kante Platz liegen.

     Der Preis: zwei verschieden geformte Bildschirme ordnen
     unterschiedlich an. Was bleibt, ist das Entscheidende — die
     Reihenfolge ist überall dieselbe, also liegt am Beamer und auf dem
     Handy derselbe Zettel in der Mitte, und der zweitgrößte daneben.
     In Stufen gerundet, sonst ordnete sich die Wolke bei jedem Pixel
     Fensteränderung neu. */
  function cloudAspect(port) {
    const w = Math.max(120, port.clientWidth  - 2 * CLOUD_PAD);
    const h = Math.max(120, port.clientHeight - 2 * CLOUD_PAD);
    return Math.round(clamp(h / w, CLOUD_ASPECT_MIN, CLOUD_ASPECT_MAX) / 0.05) * 0.05;
  }

  /* Anfangsmaßstab: der volle Überblick, immer. Alles ist so groß, wie
     es sein kann, ohne dass etwas aus dem Bild fällt. Ein Überblick, in
     dem die kleinen Zettel nur als Fläche wirken, sagt mehr als ein
     lesbarer Ausschnitt, von dem man nicht weiß, wovon er einer ist —
     heranholen kann man sie mit zwei Fingern. */
  function fitView(port) {
    const availW = Math.max(80, port.clientWidth  - 2 * CLOUD_PAD);
    const availH = Math.max(80, port.clientHeight - 2 * CLOUD_PAD);

    vp.fit   = Math.min(1, availW / vp.w, availH / vp.h);
    vp.scale = vp.fit;
    // In die Mitte des Feldes — waagerecht wie senkrecht.
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

    // Ausschnitt behalten, solange jemand ihn selbst eingestellt hat:
    // ein Poll alle 5 Sekunden darf niemandem die Lupe aus der Hand
    // schlagen. Beim Reality Check hing das zusätzlich am Bereich —
    // hier gibt es nur einen.
    const keep = vp.touched && vp.ready && !(opts && opts.refit);
    const old  = { scale: vp.scale, tx: vp.tx, ty: vp.ty };

    try {
      /* Erst das Feld, dann die Wolke hinein. Das MUSS in dieser
         Reihenfolge gehen, weil die Wolke im Format des Feldes gepackt
         wird (cloudAspect). */
      port.style.height = portHeight(port) + 'px';

      const size = layoutCloud(box, state.shuffle, cloudAspect(port));
      if (!size) return;
      vp.w = size.w; vp.h = size.h; vp.ready = true;
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
      console.warn('[WC] Wolken-Layout fehlgeschlagen:', e.message);
      // Im Notfall-Layout fließen die Karten wieder nach unten weiter —
      // dann braucht die Seite ihren Fuß zurück.
      fillPage(false);
      $('bdBoard').style.minHeight = '';
      box.classList.add('bd-cloud--plain');
      box.style.width = ''; box.style.height = '';
      port.classList.add('bd-port--plain');
      port.style.height = '';
      $('bdStage').style.transform = '';
    }
  }

  /* ── Finger und Maus im Fenster ──────────────────────────
     Zwei Finger schieben und zoomen — immer, auch im Überblick, und mit
     derselben Geste: der Punkt zwischen den Fingern bleibt zwischen den
     Fingern.

     Der eine Finger gehört dagegen zunächst der Seite (Scrollen); erst
     wer selbst aufgezogen hat, schiebt damit den Ausschnitt
     (isPanMode). Deshalb steht touch-action: pan-y am Fenster und wird
     nur im Schiebe-Modus zu none — sonst ließe sich die Seite auf dem
     Handy nicht mehr scrollen.                                        */
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
        // mit einem Finger — abbestellen, sonst öffnet sich beim
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
    // Scrollen der Seite — eine Seite, die man nicht mehr verlassen kann,
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
      // Die Lupenknöpfe brauchen hier keine Ausnahme: sie stehen neben
      // dem Fenster, ein Druck auf sie kommt gar nicht erst an.
      if (ev.pointerType === 'touch' || ev.button !== 0 || !isPanMode()) return;
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
      if (b.dataset.zoom === 'fit') { vp.touched = false; fitView(port); }
      if (b.dataset.zoom === 'shuffle') {
        /* Nur dieses Gerät. Die Anordnung wird hier gerechnet, der
           Server kennt bloß Text und Zustimmungen — niemand im Kurs
           merkt etwas davon. Die FARBEN bleiben dabei stehen (siehe
           rampFor): wer „den blauen da oben" sagt, soll ihn danach
           wiederfinden. */
        state.shuffle = (state.shuffle + 1) % 6;
        vp.touched = false;
        layoutClouds({ refit: true });
        toast('Neu angeordnet — nur auf deinem Bildschirm.');
      }
    });
  }

  /* ── Liste ───────────────────────────────────────────────
     Dieselben Zettel, nur lesbar sortiert — für die Lehrkraft am
     Beamer und für alle, denen die Wolke zu unruhig ist. */
  function tableCols() {
    return [
      { key: 'text',       label: 'Zettel' },
      { key: 'likes',      label: '👍'     },
      { key: 'author',     label: 'Von'    },
      { key: 'created_at', label: 'Wann'   }
    ];
  }

  function sortValue(note, key) {
    if (key === 'likes') return Number(note.likes || 0);
    return note[key] || '';
  }

  function renderTable() {
    fillPage(false);
    const cols = tableCols();

    const rows = (state.data?.notes || []).slice().sort((a, b) => {
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
        case 'text':   return `<td>${esc(n.text)}</td>`;
        case 'likes':  return `<td class="bd-td-likes">${Number(n.likes || 0) || '—'}</td>`;
        // Das Schild steht auch hier: in der Liste gibt es keinen
        // Rahmen, und „von wem" ist genau die Spalte, die es beantwortet.
        case 'author': return `<td>${n.by_admin ? '🛡️ ' : ''}${esc(n.author || '—')}</td>`;
        default:       return `<td>${formatDate(n.created_at)}</td>`;
      }
    }

    // Auch hier führt die Zeile ins Detail — dieselbe Karte, dieselben
    // Knöpfe. Die Liste ist eine andere Sicht auf dieselbe Wolke, keine
    // Sackgasse.
    const body = rows.map(n =>
      `<tr data-note="${esc(n.id)}" tabindex="0" title="Antippen für Details">${
        cols.map(c => cell(n, c.key)).join('')
      }</tr>`
    ).join('');

    $('bdTable').innerHTML = rows.length
      ? `<div class="bd-table-wrap"><table class="bd-table">
           <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
      : `<p class="bd-cloud-sec__empty">Noch keine Zettel im Kurs.</p>`;
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
    $('bdPhaseNext').disabled = phase() >= 2;
  }

  /* ── Erfassungs-Modal ──────────────────────────────────────
     Ein Feld. Kategorie, Haltung, Thema und Quelle gibt es hier nicht —
     jede dieser Fragen wäre eine ohne Antwortmöglichkeit. */
  function openModal(note) {
    state.editing = { id: note?.id ?? null };

    /* Beim Anlegen steht das Kontingent im Titel — „Neuer Zettel 4 von
       10". Hier ist es die Antwort auf eine Frage, die man sich gerade
       stellt; in der Kopfzeile wäre es eine Zahl, die immer dasteht.
       Admins bekommen keine: für sie gilt das Kontingent nicht. */
    const used = state.data?.me?.terms_used ?? 0;
    const max  = termsMax();
    const nth  = state.isAdmin ? '' : ` ${Math.min(used + 1, max)} von ${max}`;

    $('bdModalTitle').textContent = note ? 'Zettel bearbeiten' : `Neuer Zettel${nth}`;
    $('bdModalCat').innerHTML =
      `<span class="bd-modal__cat-label">Die Frage</span><strong>${esc(QUESTION)}</strong>`;

    $('bdText').value = note?.text ?? '';
    $('bdTextCount').textContent = ($('bdText').value || '').length;
    $('bdText').classList.remove('bd-invalid');

    $('bdModalError').hidden = true;
    $('bdModal').hidden = false;
    validate();
    $('bdText').focus();
  }

  function closeModal() {
    $('bdModal').hidden = true;
    state.editing = null;
  }

  /* Gibt zurück, was noch fehlt — und markiert das Feld. Genau dieselben
     Grenzen wie wc_upsert_note; die RPC bleibt aber die Instanz, die
     entscheidet. */
  function validate() {
    if (!state.editing) return false;
    const text = $('bdText').value.trim();
    const bad  = text.length < 3 || text.length > 60;

    // Rot erst markieren, wenn im Feld überhaupt etwas steht — sonst
    // leuchtet das Formular schon vor dem ersten Tastendruck rot.
    $('bdText').classList.toggle('bd-invalid', bad && text.length > 0);

    $('bdSave').disabled = bad;
    return !bad;
  }

  async function save() {
    if (!validate()) return;

    $('bdSave').disabled = true;
    const res = await window.WordcloudAPI.upsert({
      id:         state.editing.id,
      text:       $('bdText').value.trim(),
      cluster_id: state.clusterId
    });

    if (!res || !res.ok) {
      $('bdModalError').textContent = errText(res?.error);
      $('bdModalError').hidden = false;
      $('bdSave').disabled = false;
      return;
    }

    closeModal();
    toast(res.updated ? 'Gespeichert.' : 'Hängt an der Wand!');
    await load();
  }

  async function toggleLike(id) {
    const note = state.data?.notes.find(n => n.id === id);
    if (!note || note._busy) return;
    note._busy = true;
    const res = await window.WordcloudAPI.toggleLike(id);
    note._busy = false;
    if (!res || !res.ok) { toast(errText(res?.error), true); render(); return; }
    // Antwort direkt in den lokalen Stand übernehmen und neu zeichnen,
    // statt auf den nächsten Poll zu warten — ein Tipp muss sofort
    // wirken. likes steckt in der Signatur, render() greift also, und
    // die Karte wächst sofort auf ihre neue Größe.
    note.likes       = res.likes;
    note.liked_by_me = res.liked;
    render();
  }

  /* Kurze Rückmeldung am Finger. Muss sein, weil die Karte keine Zahl
     trägt — sonst bliebe von einem Doppeltipp nur, dass die Karte ein
     bisschen anders liegt. Hängt bewusst am <body> und nicht an der
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
     Alles, was die Karte in der Wolke nicht zeigt: wer sie geschrieben
     hat, wie viele zugestimmt haben — und die Knöpfe zum Ändern und
     Löschen. Das hält die Wolke ruhig und macht trotzdem nichts
     unerreichbar.                                                     */
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

    $('bdDetailText').textContent = note.text;

    const likes = Number(note.likes || 0);
    $('bdDetailMeta').innerHTML =
      `<div class="bd-detail__row"><span>Von</span><strong>${esc(note.author || 'Unbekannt')}${note.is_mine ? ' (du)' : ''}${
         note.by_admin ? ' <span class="bd-pill bd-pill--admin">🛡️ Lehrkraft</span>' : ''
       }</strong></div>
       <div class="bd-detail__row"><span>Zustimmung</span><strong>👍 ${likes}${
         note.is_mine && likes > 0 ? ' <span class="bd-detail__none">— so viele sehen das auch so</span>' : ''
       }</strong></div>`;

    // Zustimmen und Zurücknehmen sitzen am selben Knopf — er sagt immer,
    // was der nächste Druck bewirkt.
    const likeBtn = $('bdDetailLike');
    likeBtn.hidden = !canLike(note);
    if (!likeBtn.hidden) {
      likeBtn.textContent = note.liked_by_me ? '👍 Zustimmung zurücknehmen' : '👍 Sehe ich auch so';
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
    $('bdPhaseHelp').addEventListener('click', openPhaseInfo);
    $('bdPhaseInfoOk').addEventListener('click', closePhaseInfo);
    $('bdPhaseInfo').addEventListener('click', ev => {
      if (ev.target === $('bdPhaseInfo')) closePhaseInfo();
    });

    /* Neuer Zettel. Ist das Kontingent aufgebraucht, sagt der Knopf das
       hier — kurz, und ohne ein Formular zu öffnen, das nachher nur
       abgewiesen würde. */
    $('bdCatAdd').addEventListener('click', () => {
      if (quotaFull()) {
        toast(`Du hast alle ${termsMax()} Zettel geschrieben.`, true);
        return;
      }
      openModal(null);
    });

    $('bdText').addEventListener('input', () => {
      $('bdTextCount').textContent = $('bdText').value.length;
      validate();
    });
    // Ein einzeiliges Feld will mit Enter abgeschickt werden — auf der
    // Bildschirmtastatur ist das der große Knopf unten rechts.
    $('bdText').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); save(); }
    });

    $('bdSave').addEventListener('click', save);
    $('bdCancel').addEventListener('click', closeModal);
    $('bdModal').addEventListener('click', ev => {
      if (ev.target === $('bdModal')) closeModal();
    });

    $('bdConfirmNo').addEventListener('click', () => { $('bdConfirm').hidden = true; state.confirmFn = null; });
    $('bdConfirmYes').addEventListener('click', async () => {
      const fn = state.confirmFn;
      $('bdConfirm').hidden = true; state.confirmFn = null;
      if (fn) await fn();
    });

    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      if (!$('bdModal').hidden)     closeModal();
      if (!$('bdDetail').hidden)    closeDetail();
      if (!$('bdPhaseInfo').hidden) closePhaseInfo();
      if (!$('bdConfirm').hidden)   { $('bdConfirm').hidden = true; state.confirmFn = null; }
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
      const card = ev.target.closest('[data-note]');
      if (card) cardTapped(card);
    });
    $('bdBoard').addEventListener('keydown', ev => {
      const card = ev.target.closest('[data-note]');
      if (!card) return;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); clearTap(); openDetail(card.dataset.note); }
    });

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
      openModal(note);
    });
    $('bdDetailDel').addEventListener('click', () => {
      const note = state.data?.notes.find(n => n.id === state.detailId);
      if (!note) return;
      closeDetail();
      confirmAsk('Zettel löschen?', `„${note.text}" wird gelöscht. Das lässt sich nicht rückgängig machen.`,
        async () => {
          const res = await window.WordcloudAPI.remove(note.id);
          if (!res || !res.ok) { toast(errText(res?.error), true); return; }
          toast('Gelöscht.');
          await load();
        });
    });

    // Liste: Kopf sortiert, Zeile öffnet das Detail.
    $('bdTable').addEventListener('click', ev => {
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
      // Anderer Kurs = andere Wolke: der Phasen-Merker darf nicht den
      // Wechsel des vorherigen Kurses mitschleppen.
      state.lastPhase = null;
      await load();
    });

    const setPhase = async p => {
      const res = await window.WordcloudAPI.setPhase(state.clusterId, p);
      if (!res || !res.ok) { toast(errText(res?.error), true); return; }
      toast(`Phase ${p} läuft.`);
      await load();
    };
    $('bdPhaseNext').addEventListener('click', () => setPhase(Math.min(2, phase() + 1)));
    $('bdPhasePrev').addEventListener('click', () => setPhase(Math.max(1, phase() - 1)));

    $('bdReset').addEventListener('click', () => {
      const n = state.data?.notes.length ?? 0;
      confirmAsk('Wolke zurücksetzen?',
        `Alle ${n} Zettel dieses Kurses werden gelöscht und die Phase geht zurück auf 1. Das lässt sich nicht rückgängig machen.`,
        async () => {
          const res = await window.WordcloudAPI.reset(state.clusterId);
          if (!res || !res.ok) { toast(errText(res?.error), true); return; }
          toast(`Wolke geleert (${res.deleted} Zettel).`);
          state.lastPhase = null;
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
      resizeT = setTimeout(() => {
        // Ohne Wolke gibt es nichts einzupassen — die Tafel soll aber
        // auch dann wieder bis zur Bildschirmkante reichen.
        if ($('bdPort')) layoutClouds({ refit: true });
        else if (!$('bdBoard').hidden) fitBoardHeight();
      }, 180);
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
    } catch (e) {}

    if (!window.waitForSession) {
      showStatus('Der Session-Layer fehlt — lade die Seite neu.', true);
      return;
    }
    await window.waitForSession();

    const s = window.getSessionUser && window.getSessionUser();
    if (!s) {
      showStatus('Diese Wolke gehört deinem Kurs — dafür musst du angemeldet sein.', true);
      return;
    }

    state.isAdmin = !!(s.is_admin || s.is_superadmin);

    if (state.isAdmin) {
      // Admins hängen in keinem oder in einem fremden Kurs — sie wählen
      // aus. Die Auswahl liegt im sessionStorage: auf einem geteilten
      // Gerät soll sie mit dem Tab verschwinden.
      state.clusters = await window.WordcloudAPI.listClusters();
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
