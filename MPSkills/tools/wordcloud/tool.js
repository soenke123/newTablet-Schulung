/* ══════════════════════════════════════════════════════════════
   MPSkills — Werkzeug „Wortwolke"
   ══════════════════════════════════════════════════════════════
   Eine Frage, viele kurze Antworten. Wer zustimmt, macht eine
   Antwort größer — was die Gruppe trägt, steht am Ende in der
   Mitte.

   ── Herkunft ─────────────────────────────────────────────────
   Portiert aus GameHub/S1 wieso weshalb warum (Migration 0075),
   das seinerseits vom Reality-Check-Board abstammt. Der ganze
   WOLKEN-APPARAT ist von dort unverändert übernommen: Spirale mit
   Kollisionsprüfung, virtuelle Tafel, Lupe, Gesten, TILTS,
   NOTE_RAMPS, strength(), CLOUD_GAP = 17 samt SHEET_REACH.
   Wer dort etwas repariert, sollte hier mitziehen — und
   umgekehrt.

   Weg ist alles, was aus der Schulung kam und nicht aus dem
   Werkzeug: Kreatur, Wachstum, Münzen, Season-Gate, Kurs-Bezug,
   die Belohnungs-Sequenz. Die Frage steht nicht mehr im Code,
   sondern im Raum (settings.question) — die Lehrkraft tippt sie
   beim Anlegen ein.

   ── Warum die Wolke als erstes Werkzeug ──────────────────────
   Sie ist das einzige erprobte Stück der Kette. Klemmt beim
   ersten Klassentest etwas, liegt es mit hoher Wahrscheinlichkeit
   am neuen Fundament — Raum, Token, Aktualisierung — und nicht am
   Werkzeug. Ein neu gebautes hätte diese Aussagekraft nicht.

   ── Grundregel ───────────────────────────────────────────────
   Der Server entscheidet. Phase, Eigentum, Kontingent und
   Textlänge prüft skill_entry_upsert (Migration 0080) noch einmal
   vollständig. Was hier passiert, ist Komfort — blasse Knöpfe und
   Meldungen in verständlichem Deutsch, keine Sicherheit.

   Die CSS-Klassen heißen weiter `bd-`: tool.css ist eine Kopie
   von wc.css, und ein Umbenennen über 1100 Zeilen machte jeden
   späteren Abgleich unmöglich.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Zwei Phasen, und anders als beim Reality Check sind sie KEINE
     Fächer: es liegen immer dieselben Zettel da. Phase 2 ändert nur,
     was man mit ihnen tun darf — nämlich nichts mehr außer zustimmen
     und lesen.

     {frage} und {anzahl} werden erst beim Anzeigen gefüllt: die Frage
     gehört dem Raum, die Zahl dem Server, der sie auch durchsetzt. */
  const PHASE_INFO = {
    1: { name: 'Sammeln',
         task: '{frage} Schreib auf, was dir einfällt — ein Begriff oder ein paar Worte, pro Zettel eine Sache. Du hast {anzahl} Zettel. Und schau dir an, was die anderen schreiben: was du auch so siehst, kannst du mit einem Doppeltipp bestätigen.' },
    2: { name: 'Besprechen',
         task: 'Eure Wolke steht. Je öfter etwas bestätigt wurde, desto größer steht es da. Jetzt schauen wir gemeinsam drauf — neue Zettel kommen keine mehr dazu, zustimmen kannst du weiter.' }
  };

  const PRESENTER_TASK = {
    1: 'Die Klasse sammelt. Du siehst die Wolke live mitwachsen — schalte weiter, wenn genug dasteht.',
    2: 'Besprechen. Neue Zettel kommen keine mehr dazu; zustimmen darf die Klasse weiter.'
  };

  // Werkzeug-eigene Fehlerfälle. Alles Übrige erbt es aus lib/tool.js.
  const ERRORS = {
    phase_locked:   'Die Sammelrunde ist vorbei — jetzt wird nur noch besprochen.',
    quota_exceeded: 'Du hast schon alle deine Zettel geschrieben.',
    invalid_input:  'Mit dem Text stimmt etwas nicht — 3 bis 60 Zeichen.',
    own_entry:      'Deinem eigenen Zettel kannst du nicht zustimmen.',
    not_found:      'Diesen Zettel gibt es nicht mehr.'
  };

  const VIEW_KEY = 'wc_view';

  /* ── Zustand ──────────────────────────────────────────────
     Ein Werkzeug je Seite, deshalb Modulzustand statt Fabrik. mount()
     füllt ihn, unmount() räumt ihn ab — ein zweites mount() ohne
     unmount() gibt es nicht. */
  let root = null, ctx = null;
  const state = {
    view:      null,   // letzte Antwort von skill_view / skill_room_get
    notes:     [],     // daraus abgeleitet, siehe toNotes()
    mode:      'board',
    sort:      { col: 'created_at', dir: 'desc' },
    lastSig:   null,
    lastPhase: null,
    editing:   null,
    detailId:  null,
    confirmFn: null,
    shuffle:   0,
    busy:      {}      // id → läuft gerade eine Zustimmung?
  };

  /* Die Wolke hat zwei Ebenen, die einander ins Wort fallen können:
     Tippen auf den Karten und Schieben/Zoomen im Fenster. Damit die
     Lupe das Tippen abbestellen kann, ohne dass beide im selben
     Gültigkeitsbereich liegen müssen, hängt der Abbrecher hier. */
  const gesture = { cancelTap: () => {}, cancelSwipe: () => {} };

  /* Alles, was am Dokument hängt, wird hier mitgeschrieben — sonst
     bliebe beim Verlassen des Raums ein Listener auf einer Seite
     zurück, die es nicht mehr gibt. */
  const docListeners = [];
  function onDoc(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    docListeners.push([target, type, fn, opts]);
  }

  const $   = id => root && root.querySelector('#' + id);
  const esc = s => ctx.esc(s);

  function formatDate(iso) {
    if (!iso) return '';
    // 'T00:00:00' erzwingt lokale Mitternacht. Ohne das liest der Browser
    // ein reines Datum als UTC und zeigt westlich von Greenwich den Vortag.
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const errText = e => ERRORS[e] || ctx.errText(e);

  /* ── Vom Beitrag zum Zettel ───────────────────────────────
     Die generische Schicht kennt nur payload; was darin steht, weiß
     allein das Werkzeug. Genau hier wird aus einem Beitrag ein
     Zettel — der einzige Ort, an dem diese Datei etwas über das
     Datenmodell des Servers annimmt. */
  function toNotes(view) {
    return (view.entries || []).map(e => ({
      id:          e.id,
      text:        String(e.payload?.text ?? ''),
      likes:       Number(e.votes || 0),
      liked_by_me: !!e.voted,
      is_mine:     !!e.is_mine,
      by_admin:    !!e.by_teacher,      // Klassenname aus wc.css, siehe Kopf
      hidden:      !!e.hidden,
      author:      e.author || '',
      created_at:  e.created_at,
      updated_at:  e.updated_at
    }));
  }

  /* ── Rechte — dieselbe Logik wie serverseitig (0080) ─────── */
  const isPresenter = () => ctx.role === 'presenter';
  const phase       = () => state.view?.state?.phase ?? 1;
  const limits      = () => state.view?.limits || {};
  const termsMax    = () => Number(limits().max_entries) || 10;
  const question    = () => state.view?.room?.settings?.question || 'Was fällt euch dazu ein?';

  // Die Lehrkraft schreibt in jeder Phase: sie hat sie ja gesetzt.
  // Für alle anderen hat der Server die Antwort schon mitgeschickt.
  function canWrite() {
    return isPresenter() ? true : (state.view?.me?.may_write !== false);
  }
  // Ändern und Löschen hängen an derselben Phase wie das Anlegen —
  // ist der Inhalt eingefroren, ist er es in beide Richtungen.
  function canEdit(note) {
    if (isPresenter()) return !!note.by_admin;   // nur die eigenen
    return !!note.is_mine && canWrite();
  }
  const canLike = note => !isPresenter() && !note.is_mine;

  function quotaFull() {
    if (isPresenter()) return false;
    return (state.view?.me?.entries_used ?? 0) >= termsMax();
  }

  /* ══════════════════════════════════════════════════════════
     Aufbau
     ══════════════════════════════════════════════════════════ */
  const TEMPLATE = `
  <div class="bd-tool">
    <nav class="bd-catnav" id="bdCatNav" hidden>
      <div class="bd-catnav__title">
        <span class="bd-catnav__name" id="bdCatName"></span>
        <button type="button" class="bd-catadd" id="bdCatAdd" hidden>＋</button>
      </div>
      <div class="bd-catnav__right">
        <div class="bd-phases" id="bdPhases" hidden></div>
        <button type="button" class="bd-phasehelp" id="bdPhaseHelp"
                aria-label="Auftrag der aktuellen Phase ansehen"
                title="Was ist gerade zu tun?">?</button>
        <div class="bd-viewswitch" id="bdViewSwitch">
          <button type="button" data-view="board" class="active">Wolke</button>
          <button type="button" data-view="table">Liste</button>
        </div>
      </div>
    </nav>

    <div class="bd-adminbar" id="bdAdminBar" hidden>
      <span class="bd-adminbar__label">🛡️ Moderation</span>
      <button type="button" id="bdPhasePrev" class="bd-btn bd-btn--ghost">◀ Phase zurück</button>
      <button type="button" id="bdPhaseNext" class="bd-btn">Nächste Phase ▶</button>
      <span class="bd-adminbar__spacer"></span>
      <button type="button" id="bdReset" class="bd-btn bd-btn--danger">Wolke leeren</button>
    </div>

    <div class="bd-status" id="bdStatus" hidden>Lade …</div>

    <section id="bdBoard" class="bd-surface" hidden></section>
    <section id="bdTable" hidden></section>

    <!-- Erfassung: ein Feld, sonst nichts. -->
    <div class="bd-modal-backdrop" id="bdModal" hidden>
      <div class="bd-modal" role="dialog" aria-modal="true" aria-labelledby="bdModalTitle">
        <div class="bd-modal__titlerow"><h2 id="bdModalTitle">Neuer Zettel</h2></div>
        <div class="bd-modal__cat" id="bdModalCat"></div>
        <label class="bd-field-label" for="bdText">Dein Zettel</label>
        <input type="text" id="bdText" maxlength="60"
               placeholder="Ein Begriff oder ein paar Worte"
               autocomplete="off" enterkeyhint="done">
        <div class="bd-counter"><span id="bdTextCount">0</span>/60</div>
        <p class="bd-error" id="bdModalError" hidden></p>
        <div class="bd-modal__actions">
          <button type="button" id="bdCancel" class="bd-btn bd-btn--ghost">Abbrechen</button>
          <button type="button" id="bdSave" class="bd-btn" disabled>Speichern</button>
        </div>
      </div>
    </div>

    <!-- Detail: was die Karte in der Wolke bewusst weglässt. -->
    <div class="bd-modal-backdrop" id="bdDetail" hidden>
      <div class="bd-modal bd-modal--detail" role="dialog" aria-modal="true" aria-labelledby="bdDetailText">
        <p class="bd-detail__text" id="bdDetailText"></p>
        <div class="bd-detail__meta" id="bdDetailMeta"></div>
        <div class="bd-modal__actions bd-detail__actions">
          <button type="button" id="bdDetailLike"  class="bd-btn bd-btn--like" hidden></button>
          <span class="bd-detail__spacer"></span>
          <button type="button" id="bdDetailHide"  class="bd-btn bd-btn--ghost" hidden></button>
          <button type="button" id="bdDetailDel"   class="bd-btn bd-btn--danger" hidden>🗑️ Löschen</button>
          <button type="button" id="bdDetailEdit"  class="bd-btn" hidden>✏️ Bearbeiten</button>
          <button type="button" id="bdDetailClose" class="bd-btn bd-btn--ghost">Schließen</button>
        </div>
      </div>
    </div>

    <!-- Auftrag der Phase -->
    <div class="bd-modal-backdrop" id="bdPhaseInfo" hidden>
      <div class="bd-modal bd-modal--phase" role="dialog" aria-modal="true" aria-labelledby="bdPhaseInfoTitle">
        <div class="bd-phaseinfo__head">
          <span class="bd-phaseinfo__no" id="bdPhaseInfoNo">1</span>
          <h2 id="bdPhaseInfoTitle">Sammeln</h2>
        </div>
        <p id="bdPhaseInfoText"></p>
        <div class="bd-modal__actions">
          <button type="button" id="bdPhaseInfoOk" class="bd-btn">Alles klar</button>
        </div>
      </div>
    </div>

    <div class="bd-modal-backdrop" id="bdConfirm" hidden>
      <div class="bd-modal bd-modal--small" role="dialog" aria-modal="true">
        <h2 id="bdConfirmTitle">Sicher?</h2>
        <p id="bdConfirmText"></p>
        <div class="bd-modal__actions">
          <button type="button" id="bdConfirmNo"  class="bd-btn bd-btn--ghost">Abbrechen</button>
          <button type="button" id="bdConfirmYes" class="bd-btn bd-btn--danger">Ja, machen</button>
        </div>
      </div>
    </div>
  </div>`;

  /* ══════════════════════════════════════════════════════════
     Zeichnen
     ══════════════════════════════════════════════════════════ */
  function signature() {
    const v = state.view;
    if (!v) return '';
    return JSON.stringify([
      phase(), ctx.role, state.mode, state.sort,
      v.me?.entries_used, question(),
      // likes gehören in die Signatur: sonst bliebe eine Zustimmung aus
      // einem anderen Tablet unsichtbar, weil updated_at sich dabei
      // nicht ändert — und der eigene Doppeltipp würde ebenso verschluckt.
      state.notes.map(n => [n.id, n.updated_at, n.likes, n.liked_by_me, n.hidden])
    ]);
  }

  function render() {
    // Unverändert? Dann DOM in Ruhe lassen. Das ist der Normalfall beim
    // Poll und hält Scrollposition und Fokus stabil.
    const sig = signature();
    if (sig === state.lastSig) return;
    state.lastSig = sig;

    $('bdStatus').hidden = true;
    renderPhases();
    renderAdminBar();

    root.querySelectorAll('#bdViewSwitch button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === state.mode);
    });

    if (state.mode === 'board') {
      $('bdTable').hidden = true;
      $('bdBoard').hidden = false;
      renderQuestionBar();
      renderBoard();
    } else {
      $('bdBoard').hidden  = true;
      $('bdTable').hidden  = false;
      renderQuestionBar();
      renderTable();
    }

    // Offenes Detail mitziehen: sonst zeigt es nach einer Zustimmung
    // von einem anderen Gerät noch den alten Zählerstand.
    if (state.detailId && !$('bdDetail').hidden) renderDetail();
  }

  /* Reine Anzeige für die Klasse, Umschalter für die Lehrkraft — sie
     bekommt ihre Knöpfe aber in der Moderationsleiste, nicht hier.
     Zwei Wege zur selben Handlung wären einer zu viel. */
  function renderPhases() {
    const p = phase();
    const box = $('bdPhases');
    box.hidden = false;
    box.innerHTML = [1, 2].map(n => `
      <div class="bd-phase${n === p ? ' bd-phase--running' : ''}${n > p ? ' bd-phase--locked' : ''}"
           data-phase="${n}">
        <span class="bd-phase__no">${n}</span>
        <span class="bd-phase__name">${esc(PHASE_INFO[n].name)}</span>
      </div>`).join('');
  }

  function renderAdminBar() {
    const bar = $('bdAdminBar');
    if (!isPresenter()) { bar.hidden = true; return; }
    bar.hidden = false;
    $('bdPhasePrev').disabled = phase() <= 1;
    $('bdPhaseNext').disabled = phase() >= 2;
  }

  const phaseTask = p => isPresenter()
    ? PRESENTER_TASK[p]
    : PHASE_INFO[p].task.replace('{frage}', question()).replace('{anzahl}', termsMax());

  function openPhaseInfo() {
    const p = phase();
    $('bdPhaseInfoNo').textContent    = p;
    $('bdPhaseInfoTitle').textContent = `Phase ${p} · ${PHASE_INFO[p].name}`;
    $('bdPhaseInfoText').textContent  = phaseTask(p);
    $('bdPhaseInfo').hidden = false;
    $('bdPhaseInfoOk').focus();
  }
  const closePhaseInfo = () => { $('bdPhaseInfo').hidden = true; };

  /* ── Karten in der Wolke ─────────────────────────────────
     Auf der Karte steht nur der Text. Kein Name, keine Zahl, keine
     Knöpfe — das alles steht im Detail, einen Tipp entfernt. Wie stark
     eine Aussage getragen wird, sagen drei Kanäle und keine Ziffer: die
     Größe der Karte, die Sättigung ihrer Farbe und der Stapel unter ihr.

     Drei Kanäle für dieselbe Zahl, weil einer davon lügt: die Größe ist
     ein Schriftgrad, gelesen wird aber die Fläche — und in die geht die
     Textlänge mit ein. Ein langer Zettel mit zwei Zustimmungen belegt
     mehr Platz als ein kurzer mit sieben. Farbe und Stapel sind dagegen
     von der Textmenge unabhängig und korrigieren genau das.           */

  const LIKE_SIZE_MIN = 0.88;   // rem — Karte ohne Zustimmung
  const LIKE_SIZE_MAX = 2.20;   // rem — Karte mit den meisten
  const LIKE_SPAN_REF = 5;      // ab so vielen Zustimmungen ist die Spanne voll

  /* ── Die eine Zahl ───────────────────────────────────────
     Alle drei Kanäle hängen an diesem einen normierten Wert zwischen 0
     und 1 — und das ist keine Sparsamkeit, sondern der Punkt. Käme die
     Farbe aus den rohen Zustimmungen und die Größe aus einer gedämpften
     Kurve, gäbe es Karten, die groß, aber blass sind.

     Zwei Regeln stecken drin. Erstens ein Exponent unter 1: der Sprung
     von 0 auf 1 Zustimmung soll sichtbar sein, der von 8 auf 9 kaum
     noch. Zweitens wird die Spanne selbst erst mit der Wolke größer —
     sonst wäre am Anfang der erste Zettel mit einer einzigen Stimme
     sofort doppelt so groß wie alle anderen.                          */
  function strength(likes, maxLikes) {
    const l = Math.max(0, Number(likes) || 0);
    if (maxLikes <= 0 || l <= 0) return 0;
    return Math.pow(Math.min(l, maxLikes) / maxLikes, 0.65) *
           Math.min(1, maxLikes / LIKE_SPAN_REF);
  }

  const sizeFor = t => LIKE_SIZE_MIN + t * (LIKE_SIZE_MAX - LIKE_SIZE_MIN);

  /* ── Kanal 2: die Sättigung ──────────────────────────────
     Sechs Zettelfarben. Die Farbe sagt hier NICHTS aus, sie gliedert
     nur — Klebezettel auf einer echten Tafel sind auch bunt. Je Farbe
     zwei Enden, dazwischen wird linear gemischt; der FARBTON bleibt
     dabei derselbe, nur Sättigung und Helligkeit wandern.

     Das blasse Ende hört bewusst VOR Weiß auf: ein Zettel ohne
     Zustimmung soll wie ein Zettel aussehen und nicht wie eine
     ausgegraute Fläche.                                              */
  const NOTE_RAMPS = [
    { fillP: [237,248,238], fillS: [147,211,160], lineP: [215,236,217], lineS: [111,190,128] }, // Grün
    { fillP: [253,238,236], fillS: [242,164,154], lineP: [247,222,217], lineS: [232,131,118] }, // Rosa
    { fillP: [254,248,230], fillS: [245,210,113], lineP: [244,233,200], lineS: [223,184,69]  }, // Gelb
    { fillP: [235,244,252], fillS: [146,190,235], lineP: [212,230,246], lineS: [107,163,219] }, // Blau
    { fillP: [245,240,252], fillS: [186,166,226], lineP: [230,222,246], lineS: [154,130,205] }, // Lila
    { fillP: [254,243,231], fillS: [246,186,120], lineP: [248,228,206], lineS: [228,159,86]  }  // Pfirsich
  ];

  /* Welcher Zettel welche Farbe bekommt: aus der ID gerechnet, nicht
     gespeichert. Die Farbe ist Anzeige und keine Aussage.

     Zwei Folgen, beide gewollt. Erstens sieht jedes Gerät dieselbe
     Farbe: am Beamer und auf dem Tablet ist derselbe Zettel derselbe
     Zettel. Zweitens geht der Mischzähler (⟳) hier bewusst NICHT ein —
     wer „den blauen da oben" sagt, soll ihn danach wiederfinden.

     Eigener Hash-Faktor, nicht der aus tiltFor: beide Listen haben
     sechs Einträge, und mit demselben Streuwert läge jeder grüne Zettel
     im selben Winkel. */
  function rampFor(id) {
    let h = 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 100003;
    return NOTE_RAMPS[h % NOTE_RAMPS.length];
  }

  const mixRGB = (a, b, t) =>
    'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
             Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
             Math.round(a[2] + (b[2] - a[2]) * t) + ')';

  /* ── Kanal 3: der Stapel ─────────────────────────────────
     Blätter unter der Karte. Bewusst grob — drei Zustände, nicht
     zwölf: der Stapel beantwortet „viel oder wenig", keine Rangfolge.
     Die Feinauflösung leisten Größe und Sättigung. */
  const sheetsFor = t => (t >= 0.72 ? 2 : t >= 0.40 ? 1 : 0);

  function cardHTML(note, opts) {
    const o = opts || {};
    const hasStrength = typeof o.strength === 'number';
    const t    = hasStrength ? o.strength : 0;
    const size = hasStrength ? sizeFor(t) : 0;

    /* Größere Karten dürfen auch breiter werden, sonst wird eine
       2-rem-Karte zu einem schmalen hohen Turm — und kleine bleiben
       schmal, damit sie sich am Rand zwischen die großen fügen.

       Bewusst ohne `100%`: die Wolke wird auf einer virtuellen Tafel
       gepackt, die immer breit genug ist, und danach als Ganzes
       skaliert. */
    let style = '';
    if (hasStrength) {
      const ramp = rampFor(note.id);
      style = ` style="font-size:${size.toFixed(2)}rem` +
              `;max-width:${Math.round(150 + (size - LIKE_SIZE_MIN) * 145)}px` +
              `;--cn-fill:${mixRGB(ramp.fillP, ramp.fillS, t)}` +
              `;--cn-line:${mixRGB(ramp.lineP, ramp.lineS, t)}"`;
    }

    const sheets = hasStrength ? sheetsFor(t) : 0;
    const hint = (note.by_admin ? 'Von der Lehrkraft · ' : '') + (note.is_mine
      ? 'Antippen: deinen Zettel ansehen, ändern oder löschen'
      : (canLike(note) ? 'Antippen für Details · Doppeltippen zum Zustimmen' : 'Antippen für Details'));

    // Bewusst ohne role="button": die Karte ist zwar antippbar, aber
    // role="button" macht ihren Inhalt für Screenreader zu reiner
    // Dekoration — und der Inhalt ist hier die ganze Information.
    const liked = !!note.liked_by_me;

    return `<article class="bd-cn${note.by_admin ? ' bd-cn--admin' : ''}${note.is_mine ? ' bd-cn--mine' : ''}${liked ? ' bd-cn--liked' : ''}${note.hidden ? ' bd-cn--hidden' : ''}${sheets ? ` bd-cn--st${sheets}` : ''}"
             data-note="${esc(note.id)}"${style}
             tabindex="0" title="${hint}">
        ${liked ? '<span class="bd-cn__liked" title="Du hast zugestimmt">👍</span>' : ''}
        ${note.hidden ? '<span class="bd-cn__hidden" title="Ausgeblendet — die Klasse sieht das nicht">🚫</span>' : ''}
        <p class="bd-cn__text">${esc(note.text)}</p>
      </article>`;
  }

  /* Nach Zustimmung sortiert — die Platzierung läuft von innen nach
     außen, wer zuerst drankommt, landet in der Mitte. Bei Gleichstand
     das Alter, sonst tauschten zwei Zettel mit gleich vielen Stimmen
     bei jedem Poll die Plätze. */
  const sortedNotes = () => state.notes.slice().sort((a, b) =>
    (Number(b.likes || 0) - Number(a.likes || 0)) ||
    String(a.created_at).localeCompare(String(b.created_at)));

  function renderQuestionBar() {
    $('bdCatNav').hidden = false;
    $('bdCatName').innerHTML =
      `${esc(question())} <span class="bd-catnav__count">${state.notes.length}</span>`;

    /* Anklickbar bleibt der Knopf auch bei vollem Kontingent — die
       Absage kommt beim Drücken als kurze Meldung. Ein toter Knopf
       beantwortet die Frage „warum geht das nicht?" nicht, und ein
       verschwundener nimmt sie mit. */
    const add = $('bdCatAdd');
    add.hidden = !canWrite();
    if (!add.hidden) {
      add.disabled = false;
      add.title = isPresenter() ? 'Eigenen Zettel dazuschreiben' : 'Neuen Zettel schreiben';
      add.setAttribute('aria-label', add.title);
      add.classList.toggle('bd-catadd--full', quotaFull());
    }
  }

  /* In der Wolken-Ansicht reicht die Tafel bis an die untere
     Bildschirmkante — darunter steht nichts mehr, also braucht die
     Seite dort auch keinen Fuß. */
  const fillPage = on => document.body.classList.toggle('bd-fill', !!on);

  function fitBoardHeight() {
    const b = $('bdBoard');
    b.style.minHeight = '';
    b.style.minHeight = portHeight(b) + 'px';
  }

  function renderBoard() {
    const notes = sortedNotes();
    const board = $('bdBoard');
    fillPage(true);   // vor dem Messen: ohne Fuß kommt eine andere Höhe heraus

    if (!notes.length) {
      board.innerHTML = `<p class="bd-cloud-sec__empty">${esc(emptyText())}</p>`;
      fitBoardHeight();
      return;
    }

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
       Karte mehr, auf der man sich zurechtfindet. */
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
    if (isPresenter()) return 'Noch nichts da. Sobald jemand etwas schreibt, wächst hier die Wolke.';
    return 'Hier steht noch nichts. ' + (canWrite() ? 'Schreib den ersten Zettel.' : '');
  }

  /* ── Wolken-Layout ───────────────────────────────────────
     Archimedische Spirale von innen nach außen mit Kollisionsprüfung —
     dasselbe Grundprinzip wie bei einer klassischen Wordcloud, nur mit
     Karten statt Wörtern. Alle Karten stehen waagerecht; sie liegen
     absolut, gemessen wird über offsetWidth/offsetHeight (das sind die
     Maße VOR dem transform).

     Gepackt wird NICHT in der Gerätebreite, sondern auf einer
     virtuellen Tafel: auf einem Handy ist eine Karte fast so breit wie
     der Bildschirm, und eine Spirale, die überall an den Rand stößt,
     ist keine Wolke mehr, sondern ein Stapel. Was auf den Bildschirm
     passt, entscheidet danach die Lupe.                              */

  /* Sichtabstand zwischen zwei Zetteln. 17 und nicht 10 wegen des
     Stapels: die Blätter liegen bis zu 10/12 px nach rechts unten
     versetzt und ragen damit über die gemessene Karte hinaus. */
  const CLOUD_GAP     = 17;
  const SHEET_REACH_X = 12;
  const SHEET_REACH_Y = 14;
  const CLOUD_PAD     = 12;     // Luft zwischen Wolke und Fensterkante
  const CLOUD_MIN_W   = 380;    // schmalste virtuelle Tafel
  const CLOUD_MAX_W   = 2400;   // breiteste — darüber wächst sie in die Höhe
  const CLOUD_MIN_H   = 260;    // Untergrenze fürs Fenster (Handy quer, Tastatur offen)

  const CLOUD_ASPECT_MIN = 0.35;
  const CLOUD_ASPECT_MAX = 1.60;

  /* Sechs Neigungen im Wechsel. Stehen im Skript und nicht im
     Stylesheet: die Platzierung rechnet mit achsenparallelen Rechtecken
     und muss den Winkel jeder Karte KENNEN — ein um 2,4° gedrehter
     breiter Zettel ist gut 13 px höher als der ungedrehte. Genau das
     war die Ursache der senkrechten Überlappungen.

     Der Winkel hängt an der Karten-ID, nicht an der Position — sonst
     zitterte die Wolke bei jedem Poll. */
  const TILTS = [-1.8, 1.4, -0.7, 2.2, -2.4, 0.9];

  function tiltFor(id, seed) {
    let h = 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return TILTS[(h + seed) % TILTS.length];
  }

  const overlaps = (a, b) =>
    !(a.x + a.w + CLOUD_GAP <= b.x || b.x + b.w + CLOUD_GAP <= a.x ||
      a.y + a.h + CLOUD_GAP <= b.y || b.y + b.h + CLOUD_GAP <= a.y);

  /* Breite der virtuellen Tafel.

     Erst die Fläche schätzen, die die Karten brauchen (Faktor 2,1 —
     eine gepackte Wolke erreicht knapp die halbe Fläche), daraus eine
     angenehm liegende Breite ableiten und in Stufen von 20 px runden.

     Das Runden hat einen handfesten Grund: die Karten werden
     nacheinander gesetzt, jede nur gegen die schon liegenden. Ein neuer
     Zettel ohne Zustimmung sortiert sich ans Ende und lässt alle
     anderen, wo sie waren — solange die Tafelbreite gleich bleibt. Ohne
     Stufen kippte sie bei jeder neuen Karte um ein paar Pixel, und die
     ganze Wolke ordnete sich im Sekundentakt neu. */
  function cloudWidth(items, aspect) {
    const area   = items.reduce((s, it) => s + it.bw * it.bh, 0) * 2.1;
    const widest = items.reduce((m, it) => Math.max(m, it.bw), 0);
    const ideal  = Math.sqrt(area / aspect);
    /* Untergrenze: die erste (größte) Karte liegt in der Mitte. Damit
       daneben überhaupt eine zweite Platz findet, muss die Tafel deren
       halbe Breite plus eine ganze zweite Karte auf JEDER Seite fassen. */
    const need = items.length > 1 ? widest * 3 + 4 * CLOUD_GAP : widest + 2 * CLOUD_GAP;
    const w = Math.max(need, Math.min(CLOUD_MAX_W, Math.max(CLOUD_MIN_W, ideal)));
    return Math.round(w / 20) * 20;
  }

  /* Der Platz für eine Karte. Kandidaten außerhalb der Tafelbreite
     werden VERWORFEN, nicht an den Rand geklemmt — geklemmt landen sie
     alle auf demselben x-Wert, kollidieren dort miteinander und die
     Wolke fällt zum Stapel zusammen. Verworfen wächst sie stattdessen
     nach unten, und das ist richtig: die Tafel darf hoch werden, denn
     man kann sie ja verschieben. */
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

    const boxW  = cloudWidth(items, aspect);
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
       nicht: die Messschleife oben liest offsetWidth, und das erzwingt
       eine Style-Berechnung. Damit steht `left: 0` (aus dem Stylesheet)
       als Ausgangswert fest, und das anschließende Setzen wird zu einer
       echten Bewegung aus der linken oberen Ecke — bei jedem Zeichnen.

       Die Bewegung ist nur für den Fall gedacht, dass DIESELBEN Karten
       neu angeordnet werden (Tablet gedreht, „neu anordnen" gedrückt). */
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
     (Lupe). Auf dem Beamer ist beides dasselbe, auf dem Handy nicht. */
  const vp = {
    scale: 1, fit: 1, tx: 0, ty: 0,
    w: 0, h: 0,          // Maße der Wolke
    ready: false,        // gab es schon eine Wolke? (sonst gilt kein Ausschnitt)
    touched: false,      // hat jemand selbst gezoomt oder geschoben?
    movedAt: 0           // wann zuletzt geschoben — unterdrückt den Klick danach
  };

  const ZOOM_MAX = 3;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Weiter als bis zum vollen Überblick muss niemand herauszoomen.
  const minScale = () => vp.fit;
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
    port.classList.toggle('bd-port--zoomed', isPanMode());
  }

  /* Ausschnitt im Fenster halten — aber ohne Fessel. Es zählt nur: die
     Wolke darf das Fenster nicht verlassen. Ist sie größer, sind ihre
     Ränder erreichbar; ist sie kleiner, lässt sie sich frei darin
     herumschieben. */
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
     steckt, plus alles, was darunter noch im Fluss steht. */
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

  /* Die Höhe des Feldes — unabhängig davon, was darin liegt. Das Feld
     nimmt IMMER den Platz bis zur unteren Bildschirmkante. Genau bis
     zur Kante und keinen Punkt weiter: was darunter läge, kann man
     weder sehen noch antippen, und beim Schieben im Zoom verschwände
     der Inhalt im unsichtbaren Teil. */
  function portHeight(el) {
    // Oberkante im Dokument. Über getBoundingClientRect, weil die nicht
    // davon abhängt, welcher Kasten gerade als offsetParent gilt.
    const top = el.getBoundingClientRect().top + window.scrollY;
    return Math.max(CLOUD_MIN_H, Math.round(window.innerHeight - top - spaceBelow(el)));
  }

  /* Das Format, in dem gepackt wird: das des Feldes. Damit legen sich
     die Zettel um die Mitte herum statt in ein flaches Band, und der
     Überblick wird so groß wie möglich.

     Der Preis: zwei verschieden geformte Bildschirme ordnen
     unterschiedlich an. Was bleibt, ist das Entscheidende — die
     Reihenfolge ist überall dieselbe, also liegt am Beamer und auf dem
     Handy derselbe Zettel in der Mitte. In Stufen gerundet, sonst
     ordnete sich die Wolke bei jedem Pixel Fensteränderung neu. */
  function cloudAspect(port) {
    const w = Math.max(120, port.clientWidth  - 2 * CLOUD_PAD);
    const h = Math.max(120, port.clientHeight - 2 * CLOUD_PAD);
    return Math.round(clamp(h / w, CLOUD_ASPECT_MIN, CLOUD_ASPECT_MAX) / 0.05) * 0.05;
  }

  /* Anfangsmaßstab: der volle Überblick, immer. Ein Überblick, in dem
     die kleinen Zettel nur als Fläche wirken, sagt mehr als ein
     lesbarer Ausschnitt, von dem man nicht weiß, wovon er einer ist —
     heranholen kann man sie mit zwei Fingern. */
  function fitView(port) {
    const availW = Math.max(80, port.clientWidth  - 2 * CLOUD_PAD);
    const availH = Math.max(80, port.clientHeight - 2 * CLOUD_PAD);

    vp.fit   = Math.min(1, availW / vp.w, availH / vp.h);
    vp.scale = vp.fit;
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
    // ein Poll darf niemandem die Lupe aus der Hand schlagen.
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
      console.warn('[wordcloud] Layout fehlgeschlagen:', e.message);
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
     Handy nicht mehr scrollen. */
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
        // Seiten-Scrollen übernommen, ist preventDefault wirkungslos.
        if (ev.cancelable) ev.preventDefault();
        const m = mid(ev.touches);
        const s = clamp(pinch.s * (dist(ev.touches) / pinch.d), minScale(), ZOOM_MAX);
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

    port.addEventListener('pointerdown', ev => {
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
           Server kennt bloß Text und Zustimmungen — niemand sonst merkt
           etwas davon. Die FARBEN bleiben dabei stehen (siehe rampFor). */
        state.shuffle = (state.shuffle + 1) % 6;
        vp.touched = false;
        layoutClouds({ refit: true });
        ctx.toast('Neu angeordnet — nur auf deinem Bildschirm.');
      }
    });
  }

  /* ── Liste ───────────────────────────────────────────────
     Dieselben Zettel, nur lesbar sortiert — für die Lehrkraft und für
     alle, denen die Wolke zu unruhig ist. */
  const tableCols = () => [
    { key: 'text',       label: 'Zettel' },
    { key: 'likes',      label: '👍'     },
    { key: 'author',     label: 'Von'    },
    { key: 'created_at', label: 'Wann'   }
  ];

  const sortValue = (note, key) =>
    key === 'likes' ? Number(note.likes || 0) : (note[key] || '');

  function renderTable() {
    fillPage(false);
    $('bdBoard').style.minHeight = '';
    const cols = tableCols();

    const rows = state.notes.slice().sort((a, b) => {
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
        case 'text':   return `<td>${n.hidden ? '🚫 ' : ''}${esc(n.text)}</td>`;
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
      `<tr data-note="${esc(n.id)}"${n.hidden ? ' class="bd-tr--hidden"' : ''} tabindex="0"
           title="Antippen für Details">${cols.map(c => cell(n, c.key)).join('')}</tr>`
    ).join('');

    $('bdTable').innerHTML = rows.length
      ? `<div class="bd-table-wrap"><table class="bd-table">
           <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
      : `<p class="bd-cloud-sec__empty">Noch keine Zettel.</p>`;
  }

  /* ── Erfassungs-Modal ────────────────────────────────────
     Ein Feld. Kategorie, Haltung, Thema und Quelle gibt es hier nicht —
     jede dieser Fragen wäre eine ohne Antwortmöglichkeit. */
  function openModal(note) {
    state.editing = { id: note?.id ?? null };

    /* Beim Anlegen steht das Kontingent im Titel — „Neuer Zettel 4 von
       10". Hier ist es die Antwort auf eine Frage, die man sich gerade
       stellt; in der Kopfzeile wäre es eine Zahl, die immer dasteht.
       Die Lehrkraft bekommt keine: für sie gilt das Kontingent nicht. */
    const used = state.view?.me?.entries_used ?? 0;
    const max  = termsMax();
    const nth  = isPresenter() ? '' : ` ${Math.min(used + 1, max)} von ${max}`;

    $('bdModalTitle').textContent = note ? 'Zettel bearbeiten' : `Neuer Zettel${nth}`;
    $('bdModalCat').innerHTML =
      `<span class="bd-modal__cat-label">Die Frage</span><strong>${esc(question())}</strong>`;

    $('bdText').value = note?.text ?? '';
    $('bdTextCount').textContent = ($('bdText').value || '').length;
    $('bdText').classList.remove('bd-invalid');

    $('bdModalError').hidden = true;
    $('bdModal').hidden = false;
    validate();
    $('bdText').focus();
  }

  const closeModal = () => { $('bdModal').hidden = true; state.editing = null; };

  /* Gibt zurück, was noch fehlt — und markiert das Feld. Genau dieselben
     Grenzen wie skill_entry_upsert; die RPC bleibt aber die Instanz,
     die entscheidet. */
  function validate() {
    if (!state.editing) return false;
    const text = $('bdText').value.trim();
    const min  = Number(limits().min_len) || 3;
    const max  = Number(limits().max_len) || 60;
    const bad  = text.length < min || text.length > max;

    // Rot erst markieren, wenn im Feld überhaupt etwas steht — sonst
    // leuchtet das Formular schon vor dem ersten Tastendruck rot.
    $('bdText').classList.toggle('bd-invalid', bad && text.length > 0);
    $('bdSave').disabled = bad;
    return !bad;
  }

  async function save() {
    if (!validate()) return;
    $('bdSave').disabled = true;

    const res = await ctx.actions.upsert({ text: $('bdText').value.trim() }, state.editing.id);
    if (!res.ok) {
      $('bdModalError').textContent = errText(res.error);
      $('bdModalError').hidden = false;
      $('bdSave').disabled = false;
      return;
    }

    closeModal();
    ctx.toast(res.updated ? 'Gespeichert.' : 'Hängt an der Wand!');
    ctx.refresh();
  }

  async function toggleLike(id) {
    if (state.busy[id]) return;
    state.busy[id] = true;
    const res = await ctx.actions.vote(id);
    delete state.busy[id];

    if (!res.ok) { ctx.toast(errText(res.error), true); return; }

    // Antwort direkt in den lokalen Stand übernehmen und neu zeichnen,
    // statt auf den nächsten Poll zu warten — ein Tipp muss sofort
    // wirken. likes steckt in der Signatur, render() greift also, und
    // die Karte wächst sofort auf ihre neue Größe.
    const note = state.notes.find(n => n.id === id);
    if (note) { note.likes = res.votes; note.liked_by_me = res.voted; }
    render();
    // Und trotzdem nachladen: die Zahl stimmt jetzt für den eigenen
    // Tipp, aber nicht für die vier, die im selben Moment auch getippt
    // haben.
    ctx.refresh();
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
     hat, wie viele zugestimmt haben — und die Knöpfe. Das hält die
     Wolke ruhig und macht trotzdem nichts unerreichbar. */
  function openDetail(id) {
    state.detailId = id;
    if (!renderDetail()) return;
    $('bdDetail').hidden = false;
    $('bdDetailClose').focus();
  }

  const closeDetail = () => { $('bdDetail').hidden = true; state.detailId = null; };

  function renderDetail() {
    const note = state.notes.find(n => n.id === state.detailId);
    if (!note) { closeDetail(); return false; }

    $('bdDetailText').textContent = note.text;

    const likes = Number(note.likes || 0);
    $('bdDetailMeta').innerHTML =
      `<div class="bd-detail__row"><span>Von</span><strong>${esc(note.author || 'Unbekannt')}${note.is_mine ? ' (du)' : ''}${
         note.by_admin ? ' <span class="bd-pill bd-pill--admin">🛡️ Lehrkraft</span>' : ''
       }</strong></div>
       <div class="bd-detail__row"><span>Zustimmung</span><strong>👍 ${likes}${
         note.is_mine && likes > 0 ? ' <span class="bd-detail__none">— so viele sehen das auch so</span>' : ''
       }</strong></div>${note.hidden ? `
       <div class="bd-detail__row"><span>Zustand</span><strong>🚫 ausgeblendet</strong></div>` : ''}`;

    // Zustimmen und Zurücknehmen sitzen am selben Knopf — er sagt immer,
    // was der nächste Druck bewirkt.
    const likeBtn = $('bdDetailLike');
    likeBtn.hidden = !canLike(note);
    if (!likeBtn.hidden) {
      likeBtn.textContent = note.liked_by_me ? '👍 Zustimmung zurücknehmen' : '👍 Sehe ich auch so';
      likeBtn.classList.toggle('bd-btn--like-on', !!note.liked_by_me);
      likeBtn.setAttribute('aria-pressed', String(!!note.liked_by_me));
    }

    // Ausblenden ist das Moderationswerkzeug: umkehrbar, und die Arbeit
    // einer Schülerin bleibt erhalten. Deshalb steht es bei fremden
    // Karten anstelle des Löschens.
    const hideBtn = $('bdDetailHide');
    hideBtn.hidden = !isPresenter();
    if (!hideBtn.hidden) {
      hideBtn.textContent = note.hidden ? '👁️ Wieder einblenden' : '🚫 Ausblenden';
    }

    const mayEdit = canEdit(note);
    // Die Lehrkraft kann ihre eigenen Zettel nicht ändern, nur löschen
    // — es gibt serverseitig keinen Schreibweg dafür (lib/tool.js).
    $('bdDetailEdit').hidden = !mayEdit || isPresenter();
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

  /* ══════════════════════════════════════════════════════════
     Verdrahtung
     ══════════════════════════════════════════════════════════ */
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
        ctx.toast(`Du hast alle ${termsMax()} Zettel geschrieben.`, true);
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

    $('bdConfirmNo').addEventListener('click', () => {
      $('bdConfirm').hidden = true; state.confirmFn = null;
    });
    $('bdConfirmYes').addEventListener('click', async () => {
      const fn = state.confirmFn;
      $('bdConfirm').hidden = true; state.confirmFn = null;
      if (fn) await fn();
    });

    onDoc(document, 'keydown', ev => {
      if (ev.key !== 'Escape' || !root) return;
      if (!$('bdModal').hidden)     closeModal();
      if (!$('bdDetail').hidden)    closeDetail();
      if (!$('bdPhaseInfo').hidden) closePhaseInfo();
      if (!$('bdConfirm').hidden)   { $('bdConfirm').hidden = true; state.confirmFn = null; }
    });

    /* Karten: einmal tippen öffnet das Detail, zweimal stimmt zu.

       Beides auf demselben Ziel geht nur mit einer kurzen Wartezeit —
       ein Doppeltipp beginnt nun einmal als einfacher Tipp. Also wird
       das Öffnen um 260 ms verzögert und abgebrochen, falls ein zweiter
       Tipp kommt. Wo gar nicht zugestimmt werden kann (eigene Karte,
       Beamer), entfällt das: dort öffnet der erste Tipp sofort.       */
    const TAP_MS = 260;
    let tapTimer = null, tapId = null;

    function clearTap() { clearTimeout(tapTimer); tapTimer = null; tapId = null; }
    gesture.cancelTap = clearTap;

    async function cardTapped(card) {
      // Wer gerade geschoben oder gezoomt hat, wollte keine Karte
      // öffnen — der Finger kam nur zufällig auf einer zum Liegen.
      if (Date.now() - vp.movedAt < 350) return;

      const note = state.notes.find(n => n.id === card.dataset.note);
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
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault(); clearTap(); openDetail(card.dataset.note);
      }
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
      const note = state.notes.find(n => n.id === state.detailId);
      if (!note) return;
      closeDetail();
      openModal(note);
    });

    $('bdDetailHide').addEventListener('click', async () => {
      const note = state.notes.find(n => n.id === state.detailId);
      if (!note) return;
      const res = await ctx.actions.hide(note.id, !note.hidden);
      if (!res.ok) { ctx.toast(errText(res.error), true); return; }
      closeDetail();
      ctx.toast(note.hidden ? 'Wieder eingeblendet.' : 'Ausgeblendet — die Klasse sieht das nicht mehr.');
      ctx.refresh();
    });

    $('bdDetailDel').addEventListener('click', () => {
      const note = state.notes.find(n => n.id === state.detailId);
      if (!note) return;
      closeDetail();
      confirmAsk('Zettel löschen?',
        `„${note.text}" wird gelöscht. Das lässt sich nicht rückgängig machen.`,
        async () => {
          const res = await ctx.actions.remove(note.id);
          if (!res.ok) { ctx.toast(errText(res.error), true); return; }
          ctx.toast('Gelöscht.');
          ctx.refresh();
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

    $('bdViewSwitch').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-view]'); if (!b) return;
      state.mode = b.dataset.view;
      try { sessionStorage.setItem(VIEW_KEY, state.mode); } catch (e) {}
      render();
    });

    // ── Moderation ──
    const setPhase = async p => {
      const res = await ctx.actions.setPhase(p);
      if (!res.ok) { ctx.toast(errText(res.error), true); return; }
      ctx.toast(`Phase ${p} läuft.`);
      ctx.refresh();
    };
    $('bdPhaseNext').addEventListener('click', () => setPhase(Math.min(2, phase() + 1)));
    $('bdPhasePrev').addEventListener('click', () => setPhase(Math.max(1, phase() - 1)));

    $('bdReset').addEventListener('click', () => {
      const n = state.notes.length;
      confirmAsk('Wolke leeren?',
        `Alle ${n} Zettel werden gelöscht und die Phase geht zurück auf 1. Wer im Raum ist, `
        + 'bleibt drin — nur der Inhalt ist weg. Das lässt sich nicht rückgängig machen.',
        async () => {
          const res = await ctx.actions.reset();
          if (!res.ok) { ctx.toast(errText(res.error), true); return; }
          ctx.toast(`Wolke geleert (${res.deleted} Zettel).`);
          state.lastPhase = null;
          ctx.refresh();
        });
    });

    // Dreht jemand das Tablet, ändert sich das Fenster — die Anordnung
    // der Karten zueinander nicht, aber der Maßstab. Neu einpassen,
    // nicht neu laden: die Karten stehen ja schon im DOM.
    let resizeT = null;
    onDoc(window, 'resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        if (!root) return;
        if ($('bdPort')) layoutClouds({ refit: true });
        else if (!$('bdBoard').hidden) fitBoardHeight();
      }, 180);
    });

    // Inter kommt per @import nach. Bis sie da ist, misst der Browser
    // die Karten in der Ersatzschrift — danach passen die Kästen nicht
    // mehr zum Text, also einmal nachrechnen.
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => { if (root) layoutClouds({ refit: true }); }).catch(() => {});
    }
  }

  /* ══════════════════════════════════════════════════════════
     Schnittstelle nach außen
     ══════════════════════════════════════════════════════════ */
  window.MPTool.register('wordcloud', {

    /* Was beim Anlegen eines Raums abgefragt wird. Steht hier und nicht
       in lehrer.js: die Frage ist Sache des Skills, das Fach
       „Einstellungen" sammelt sie nur ein. Landet in
       skill_rooms.settings.

       Ohne `hint`: das Formular zeigt seit dem Umbau vom 19.08.2026
       keine Erklärungssätze mehr unter den Feldern. Was ein Feld
       will, muss aus Beschriftung und Platzhalter hervorgehen. */
    settingsFields: [
      { key: 'question', label: 'Eure Frage', type: 'text', maxlength: 140, required: true,
        placeholder: 'z. B. Was macht guten Unterricht aus?',
        // Der Vorgabewert ist nicht Bequemlichkeit, sondern der Inhalt
        // des Testraums: der wird von der Landing aus mit einem Klick
        // angelegt, ganz ohne Dialog (siehe app.js). Ohne Vorgabe
        // stünde dort eine Wolke ohne Frage.
        default: 'Was fällt euch dazu ein?' }
    ],

    mount(el, context) {
      root = el;
      ctx  = context;
      state.lastSig   = null;
      state.lastPhase = null;
      state.notes     = [];
      state.view      = null;
      vp.ready = false; vp.touched = false;

      root.innerHTML = TEMPLATE;
      try { state.mode = sessionStorage.getItem(VIEW_KEY) || 'board'; } catch (e) {}
      wire();
    },

    /* Kommt bei jeder Änderung — der Poller der Seite entscheidet wann,
       nicht dieses Werkzeug. */
    update(view) {
      state.view  = view;
      state.notes = toNotes(view);
      render();

      /* Der Auftrag kommt von selbst: einmal beim Öffnen und danach
         immer dann, wenn die Lehrkraft weiterschaltet — der Wechsel
         erreicht jedes Tablet über den Poll, und ohne Ansage merkt ihn
         niemand außer daran, dass der Plus-Knopf plötzlich weg ist.

         Ausnahme: wer gerade ein Formular ausgefüllt hat, verliert es
         nicht an ein Fenster, das sich von selbst davorschiebt. Dann
         nur eine Zeile — die Absage kommt beim Speichern ohnehin vom
         Server, und das ? holt den Auftrag jederzeit nach. */
      const p = phase();
      const first    = state.lastPhase === null;
      const switched = !first && p !== state.lastPhase;
      state.lastPhase = p;

      if (first || switched) {
        if (isPresenter()) {
          /* Am Beamer NICHT von selbst: dort hat die Lehrkraft die
             Phase gerade selbst geschaltet, sie muss ihr niemand
             ansagen — und ein Fenster, das sich vor der Klasse über
             die Wolke schiebt, muss sie erst wegklicken. Nachlesen
             geht über das ?. */
          if (switched) ctx.toast(`Phase ${p} · ${PHASE_INFO[p].name} läuft.`);
        } else if (!$('bdModal').hidden) {
          if (switched) ctx.toast(`Phase ${p} · ${PHASE_INFO[p].name} läuft jetzt.`);
        } else {
          if (!$('bdConfirm').hidden) { $('bdConfirm').hidden = true; state.confirmFn = null; }
          closeDetail();
          openPhaseInfo();
        }
      }
    },

    unmount() {
      for (const [t, type, fn, opts] of docListeners) t.removeEventListener(type, fn, opts);
      docListeners.length = 0;
      fillPage(false);
      gesture.cancelTap = () => {};
      root = null;
      ctx  = null;
      state.view = null;
      state.notes = [];
      state.lastSig = null;
      state.lastPhase = null;
      state.detailId = null;
      state.editing = null;
    }
  });
})();
