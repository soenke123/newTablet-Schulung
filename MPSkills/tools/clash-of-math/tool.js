/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Clash of Math"  ·  tool.js  (Grundgerüst)
   ══════════════════════════════════════════════════════════════
   Vierter Skill, erster im Fach „Mathematik", und der erste, der
   NICHT über die generische Inhaltsschicht (0080/0086/0087) läuft —
   Clash of Math bringt eigene Tabellen und eigene RPC-Namen mit
   (Migration 0093). Wie jedes Werkzeug EIN Modul für beide Rollen
   (ctx.role unterscheidet Teilnehmer/Beamer), aber weil die
   generischen Verben (upsert/vote/…) hier keine Rolle spielen,
   benutzt dieses Werkzeug ausschließlich `ctx.actions.call(fn, args)`
   — den generischen Durchreich-Baustein aus lib/tool.js, der Token
   bzw. Code automatisch mitgibt, ohne dass lib/tool.js einen
   Clash-RPC-Namen kennen müsste.

   ── Eigener Takt statt der Seiten-Aktualisierung ───────────────
   Der Aufrufer (j.js/lehrer.js) pollt bereits die GENERISCHEN RPCs
   (skill_view/skill_room_get) und ruft update(view) bei jeder
   Änderung — aber solange Clash nichts an der generischen Schicht
   anfasst, ändert sich deren Signatur während einer laufenden Runde
   kaum. Dieses Werkzeug führt deshalb SEINEN EIGENEN, unabhängigen
   Takt: eine billige Signatur (clash_sig/clash_room_sig) alle paar
   Sekunden als Sicherheitsnetz, plus einen Realtime-Broadcast-Kanal
   als schnellen Weg — jede erfolgreiche Eroberung sendet ein „jetzt
   nachfragen"-Signal an alle im selben Raum, OHNE dass der Inhalt des
   Broadcasts selbst als Wahrheit gilt (das bleibt ausschließlich die
   RPC-Antwort). Ein verpasstes oder gefälschtes Broadcast-Event kostet
   höchstens einen überflüssigen Abruf, nie einen falschen Spielstand.

   ── Grundgerüst-Umfang ──────────────────────────────────────────
   Team-Zuordnung (Vorschau vor dem Start), Board-Erzeugung, 5s-
   Countdown, einfache Addition bis 100, Eroberung, Elimination
   (Zuschauer-Platzhalter), Sieg. Platzhalterfarben statt der acht
   Fraktionsbilder im Ordner — die kommen mit Sönkes Ausbau-Punkt 1.

   ── Fixes aus dem ersten Feature-Feedback (Migration 0094) ──────
   (1) Rundenende auf Zeit (5s Test / 1..5 Min, siehe cmTimerSet/
       cmTimerRun) — Sieger ist dann, wer die meisten Felder besitzt.
   (2) Die Beamer-Karte füllt den freien Platz (fitPresenterMap,
       body.tool-fill) statt an einer festen Breite zu stehen — der
       Teilnehmer behält seine begrenzte Karte in der Seite.
   (3) Die Tastatur bleibt beim Antworten offen (onSubmit fokussiert
       das Feld direkt nach dem Absenden erneut).
   (4) Team-Zuordnung hängt an „online" (last_seen_at < 90s, wie
       0079) statt an „dem Raum zugeordnet" — reine Server-Änderung
       (0094), hier nichts Neues außer den online_count/room_total-
       Feldern in der Lobby-Anzeige.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const TEAM_NAMES  = ['Rot', 'Blau', 'Grün', 'Gelb', 'Lila', 'Türkis', 'Magenta', 'Rosa'];
  const TEAM_FILL   = ['rgba(239,68,68,.75)', 'rgba(59,130,246,.75)', 'rgba(16,185,129,.75)',
                       'rgba(245,158,11,.75)', 'rgba(168,85,247,.75)', 'rgba(6,182,212,.75)',
                       'rgba(217,70,160,.75)', 'rgba(244,114,182,.75)'];
  const TEAM_STROKE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b',
                       '#a855f7', '#06b6d4', '#d946a0', '#f472b6'];

  const teamName  = i => TEAM_NAMES[i] ?? ('Team ' + (i + 1));
  const teamFill  = i => TEAM_FILL[i]  ?? '#9994';
  const teamStroke = i => TEAM_STROKE[i] ?? '#999';

  let root = null, ctx = null, role = null;
  let els = {};
  let pollTimer = null, countdownTimer = null, matchTimerHandle = null, resizeObs = null, onWinResize = null;
  let channel = null, channelKey = null;
  let lastSig = null, lastView = null, busy = false, destroyed = false;
  let submitting = false;

  const MAP_GAP = 12, MAP_MIN = 260, MAP_MAX = 1400;

  /* ─── Hex-Zeichnen ──────────────────────────────────────────
     Dieselbe Geometrie wie im Prototyp (versetzte Reihen, spitze
     Hexagone) — hier aber ein einmaliges Zeichnen je Aktualisierung
     statt einer requestAnimationFrame-Schleife: das Board ändert
     sich höchstens ein paarmal pro Sekunde, nicht 60×. */
  function paintBoard(canvas, view, opts) {
    if (!canvas || !view || !view.rows || !view.cols) return;
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, Math.round(rect.width  * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, rect.width, rect.height);

    const rows = view.rows, cols = view.cols;
    const hexRadius = Math.min(
      rect.width  / ((cols + 0.5) * Math.sqrt(3)),
      rect.height / ((rows + 0.5) * 1.5)
    );
    const hexWidth  = Math.sqrt(3) * hexRadius;
    const hexHeight = 2 * hexRadius;
    const center = (r, c) => {
      const xOff = (r % 2 === 1) ? hexWidth / 2 : 0;
      return {
        x: (c + 0.5) * hexWidth + xOff + (rect.width  - cols * hexWidth) / 2,
        y: (r + 0.5) * (hexHeight * 0.75) + (rect.height - rows * hexHeight * 0.75) / 2
      };
    };

    const mine = opts && opts.highlightTeam;
    (view.tiles || []).forEach(t => {
      const p = center(t.r, t.c);
      const isMine = (mine != null && t.team === mine);
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - (Math.PI / 6);
        const hx = p.x + (hexRadius - 1.5) * Math.cos(angle);
        const hy = p.y + (hexRadius - 1.5) * Math.sin(angle);
        if (i === 0) g.moveTo(hx, hy); else g.lineTo(hx, hy);
      }
      g.closePath();
      g.fillStyle = teamFill(t.team);
      g.fill();
      g.lineWidth = t.castle ? 3 : (isMine ? 2.5 : 1);
      g.strokeStyle = isMine ? '#ffffff' : teamStroke(t.team);
      g.stroke();
      if (t.castle) {
        g.font = Math.max(10, Math.round(hexRadius * 0.9)) + 'px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('🏰', p.x, p.y);
      }
    });
  }

  /* ─── Beamer: Karte nimmt den ganzen freien Platz ───────────
     „Volles Bild" statt einer festen Kartenbreite, wie beim
     Teilnehmer — anders als NeuroLab/Cäsar aber kein Vollbild-
     Fenster mit Zoom/Pan, sondern ein möglichst großes Quadrat
     (Höhe UND Breite ausnutzen, nicht nur eine Achse). Dieselbe
     spaceBelow()-Rechnung wie dort — jetzt ein viertes Mal im
     Projekt (siehe MEMORY „spaceBelow() steht jetzt dreimal"). */
  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fitPresenterMap() {
    if (role !== 'presenter' || !els.boardWrap || !els.mapWrap) return;
    if (els.boardWrap.classList.contains('cm-hide')) return; // unsichtbar hat keine verlässlichen Maße
    const top = els.boardWrap.getBoundingClientRect().top;
    const h = Math.max(MAP_MIN, window.innerHeight - top - spaceBelow(els.boardWrap) - MAP_GAP);
    els.boardWrap.style.height = h + 'px';

    const used = (els.statusBar ? els.statusBar.offsetHeight : 0) +
                 (els.timerBar  ? els.timerBar.offsetHeight  : 0);
    const availH = Math.max(160, h - used - MAP_GAP);
    const availW = els.boardWrap.clientWidth;
    const size = Math.max(160, Math.min(availW, availH, MAP_MAX));
    els.mapWrap.style.width  = size + 'px';
    els.mapWrap.style.height = size + 'px';
    if (els.map) paintBoard(els.map, lastView, {});
  }

  /* ─── Rundenende-Timer (Anzeige) ─────────────────────────────
     Eigenständig von der 5s-Start-Countdown-Anzeige (startCountdown),
     die nur während phase='countdown' läuft — dieser Timer läuft nur
     während phase='running' und mit match_ends_at gesetzt. Die
     tatsächliche Phase kommt weiterhin ausschließlich vom Server
     (clash_maybe_advance_phase); hier wird nur mitgezählt. */
  function fmtMMSS(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function startMatchTimer(endsAtIso) {
    stopMatchTimer();
    const endsAt = new Date(endsAtIso).getTime();
    const step = () => {
      const leftMs = endsAt - Date.now();
      const txt = fmtMMSS(leftMs / 1000);
      if (els.timeLeft)  els.timeLeft.textContent = txt;
      if (els.timeLeftP) { els.timeLeftP.textContent = '⏱ ' + txt; els.timeLeftP.classList.remove('cm-hide'); }
      if (leftMs <= 0) { stopMatchTimer(); tick(true); }
    };
    step();
    matchTimerHandle = setInterval(step, 500);
  }
  function stopMatchTimer() {
    if (matchTimerHandle) clearInterval(matchTimerHandle);
    matchTimerHandle = null;
    if (els.timeLeftP) els.timeLeftP.classList.add('cm-hide');
  }

  /* ─── Eigener Takt ──────────────────────────────────────────
     sig zuerst (billig), volle Ansicht nur bei Änderung — dasselbe
     Muster wie MPRoom.poll, nur unabhängig davon getaktet. */
  async function tick(force) {
    if (destroyed || busy) return;
    if (!force && document.hidden) return;
    busy = true;
    try {
      const sigFn = role === 'presenter' ? 'clash_room_sig' : 'clash_sig';
      const s = await ctx.actions.call(sigFn, {});
      if (destroyed) return;
      if (!s || !s.ok) return; // Netzfehler/room_gone: beim nächsten Takt erneut versuchen
      if (s.sig === lastSig && !force) return;

      const viewFn = role === 'presenter' ? 'clash_room_get' : 'clash_view';
      const v = await ctx.actions.call(viewFn, {});
      if (destroyed || !v || !v.ok) return;
      lastSig = s.sig;
      applyView(v);
    } finally {
      busy = false;
    }
  }

  function applyView(v) {
    lastView = v;
    ensureChannel(v.broadcast_key);
    if (role === 'presenter') renderPresenter(v); else renderParticipant(v);
  }

  /* ─── Broadcast: Signal, nicht Wahrheit ─────────────────────
     `self:false`, weil die eigene Antwort schon aus der RPC selbst
     kommt — ein zweiter Abruf für die eigene Aktion wäre doppelte
     Arbeit. Empfangen wird das Event nur als Anstoß, sofort
     nachzufragen; sein Inhalt wird nirgends gelesen. */
  function ensureChannel(key) {
    if (!key || !window.supabaseClient || channelKey === key) return;
    if (channel) {
      try { window.supabaseClient.removeChannel(channel); } catch (e) { /* egal */ }
    }
    channelKey = key;
    channel = window.supabaseClient.channel('clash:' + key, {
      config: { broadcast: { self: false } }
    });
    channel.on('broadcast', { event: 'move' }, () => tick(true));
    channel.subscribe();
  }

  function nudge() {
    if (!channel) return;
    try { channel.send({ type: 'broadcast', event: 'move', payload: {} }); }
    catch (e) { /* egal — der Sicherheits-Poll holt es nach */ }
  }

  /* ─── Countdown ─────────────────────────────────────────────
     Eigene 1s-Anzeige aus countdown_ends_at; sobald die Zeit um ist,
     wird nicht selbst umgeschaltet, sondern tick(true) angestoßen —
     die tatsächliche Phase kommt vom Server (clash_maybe_advance_phase). */
  function startCountdown(endsAtIso) {
    stopCountdown();
    const endsAt = new Date(endsAtIso).getTime();
    const step = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (els.countNum)  els.countNum.textContent  = String(left);
      if (els.countNumP) els.countNumP.textContent = String(left);
      if (left <= 0) { stopCountdown(); tick(true); }
    };
    step();
    countdownTimer = setInterval(step, 250);
  }
  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  /* ─── Team-Übersicht (Lobby) ─────────────────────────────────
     `teams` ist {team_index: anzahl} — als Objekt, weil jsonb_object_agg
     die Schlüssel als Zeichenketten liefert. */
  function rosterHTML(teams, teamCount, myTeam) {
    let out = '';
    for (let i = 0; i < teamCount; i++) {
      const n = (teams && teams[String(i)]) || 0;
      const mine = (myTeam === i) ? ' cm-rchip--mine' : '';
      out += `<span class="cm-rchip${mine}">` +
        `<span class="cm-dot" style="background:${teamStroke(i)}"></span>` +
        `${ctx.esc(teamName(i))} · ${n}</span>`;
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     Teilnehmer
     ══════════════════════════════════════════════════════════ */
  function buildParticipantDOM() {
    root.innerHTML =
      '<div class="cm-host">' +
        '<div class="cm-pane" id="cmLobby">' +
          '<p class="cm-lead">Dein vorläufiges Team: <b id="cmMyTeamName">…</b></p>' +
          '<div class="cm-roster" id="cmRoster"></div>' +
          '<p class="cm-hint" id="cmOnlineHint"></p>' +
          '<p class="cm-hint">Sobald deine Lehrkraft startet, geht es los.</p>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmCountdown">' +
          '<div class="cm-countdown">' +
            '<div class="cm-count" id="cmCountNum">5</div>' +
            '<p class="cm-hint">Gleich geht’s los …</p>' +
          '</div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmGame">' +
          '<div class="cm-topbar">' +
            '<span class="cm-teampill" id="cmTeamPill"></span>' +
            '<span class="cm-streak" id="cmStreak">🔥 0</span>' +
            '<span class="cm-timeleft cm-hide" id="cmTimeLeftP"></span>' +
          '</div>' +
          '<div class="cm-mapwrap cm-mapwrap--sm"><canvas id="cmMiniMap"></canvas></div>' +
          '<div class="cm-question">' +
            '<div class="cm-q" id="cmQ">? + ? =</div>' +
            '<form id="cmForm" class="cm-form">' +
              '<input id="cmAnswer" type="number" inputmode="numeric" autocomplete="off" placeholder="Antwort" required>' +
              '<button type="submit">Absenden</button>' +
            '</form>' +
            '<div class="cm-feedback" id="cmFeedback"></div>' +
          '</div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmOut">' +
          '<p class="cm-lead">Dein Team ist ausgeschieden.</p>' +
          '<p class="cm-hint">Du siehst weiter zu, wie es weitergeht.</p>' +
          '<div class="cm-mapwrap cm-mapwrap--sm"><canvas id="cmMiniMap2"></canvas></div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmEnded">' +
          '<div class="cm-result" id="cmResult"></div>' +
        '</div>' +
      '</div>';

    els = {
      lobby: root.querySelector('#cmLobby'),
      countdown: root.querySelector('#cmCountdown'),
      countNum: root.querySelector('#cmCountNum'),
      game: root.querySelector('#cmGame'),
      teamPill: root.querySelector('#cmTeamPill'),
      streak: root.querySelector('#cmStreak'),
      map: root.querySelector('#cmMiniMap'),
      q: root.querySelector('#cmQ'),
      form: root.querySelector('#cmForm'),
      answer: root.querySelector('#cmAnswer'),
      feedback: root.querySelector('#cmFeedback'),
      out: root.querySelector('#cmOut'),
      map2: root.querySelector('#cmMiniMap2'),
      ended: root.querySelector('#cmEnded'),
      result: root.querySelector('#cmResult'),
      myTeamName: root.querySelector('#cmMyTeamName'),
      roster: root.querySelector('#cmRoster'),
      onlineHint: root.querySelector('#cmOnlineHint'),
      timeLeftP: root.querySelector('#cmTimeLeftP')
    };

    els.form.addEventListener('submit', onSubmit);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const val = parseInt(els.answer.value, 10);
    if (!Number.isFinite(val)) return;
    submitting = true;
    els.answer.value = '';
    // Tastatur soll offen bleiben: manche virtuellen Tastaturen
    // schließen sich sonst, wenn das Feld per Enter/„Los" abgeschickt
    // und der Wert danach programmatisch geleert wird. Direkt danach
    // erneut fokussieren hält die Klasse im Frage-Antwort-Takt, ohne
    // dass jemand die Tastatur wieder von Hand öffnen muss.
    els.answer.focus({ preventScroll: true });
    const r = await ctx.actions.call('clash_submit_answer', { p_answer: val });
    submitting = false;
    els.answer.focus({ preventScroll: true });
    if (!r || !r.ok) {
      els.feedback.textContent = ctx.errText((r && r.error) || 'network');
      els.feedback.className = 'cm-feedback cm-feedback--warn';
      if (r && r.error === 'team_eliminated') tick(true);
      return;
    }
    if (r.correct === true) {
      els.feedback.textContent = r.captured ? '✅ Feld erobert!' : '✅ Richtig!';
      els.feedback.className = 'cm-feedback cm-feedback--ok';
      // Eigene Antwort ist Wahrheit — lokal patchen statt auf den
      // nächsten Takt zu warten, und die anderen anstoßen.
      if (lastView && r.captured) {
        const t = (lastView.tiles || []).find(x => x.r === r.captured.r && x.c === r.captured.c);
        if (t) t.team = lastView.me.team;
        paintBoard(els.map, lastView, { highlightTeam: lastView.me.team });
      }
      nudge();
    } else if (r.correct === false) {
      els.feedback.textContent = '❌ Leider nicht.';
      els.feedback.className = 'cm-feedback cm-feedback--warn';
    } else {
      els.feedback.textContent = '';
    }
    if (r.streak != null && els.streak) els.streak.textContent = '🔥 ' + r.streak;
    if (r.question && els.q) els.q.textContent = r.question.a + ' + ' + r.question.b + ' = ?';
  }

  function renderParticipant(v) {
    const teamCount = v.team_count;
    const myTeam = v.me.team;

    if (v.phase === 'lobby') {
      show('lobby');
      // myTeam ist für den Aufrufer selbst praktisch immer gesetzt
      // (wer clash_view gerade aufruft, ist per Definition online) —
      // die Prüfung ist trotzdem defensiv statt „Team NaN" anzuzeigen.
      if (myTeam == null) {
        els.myTeamName.textContent = '…';
      } else {
        els.myTeamName.textContent = teamName(myTeam);
        els.myTeamName.style.color = teamStroke(myTeam);
      }
      els.roster.innerHTML = rosterHTML(v.teams, teamCount, myTeam);
      if (els.onlineHint) {
        els.onlineHint.textContent = (v.online_count != null && v.room_total != null && v.room_total > v.online_count)
          ? `${v.online_count} von ${v.room_total} im Raum sind bereit (online).`
          : '';
      }
      return;
    }
    if (v.phase === 'countdown') {
      show('countdown');
      startCountdown(v.countdown_ends_at);
      return;
    }
    stopCountdown();
    stopMatchTimer();
    if (v.phase === 'ended') {
      show('ended');
      const won = v.winner_team === myTeam;
      els.result.innerHTML =
        `<b style="color:${teamStroke(v.winner_team)}">${ctx.esc(teamName(v.winner_team))} gewinnt!</b>` +
        `<p>${won ? 'Euer Team hat das Spielfeld erobert. 🎉' : 'Diesmal nicht — schaut euch an, wer gewonnen hat.'}</p>`;
      return;
    }
    // running
    if (!v.me.alive) {
      show('out');
      paintBoard(els.map2, v, { highlightTeam: myTeam });
      return;
    }
    show('game');
    els.teamPill.textContent = teamName(myTeam);
    els.teamPill.style.background = teamStroke(myTeam);
    els.streak.textContent = '🔥 ' + (v.me.streak || 0);
    if (v.match_ends_at) startMatchTimer(v.match_ends_at); else stopMatchTimer();
    if (v.me.question) els.q.textContent = v.me.question.a + ' + ' + v.me.question.b + ' = ?';
    paintBoard(els.map, v, { highlightTeam: myTeam });
  }

  function show(which) {
    ['lobby', 'countdown', 'game', 'out', 'ended'].forEach(k => {
      if (els[k]) els[k].classList.toggle('cm-hide', k !== which);
    });
    if (which !== 'countdown') stopCountdown();
  }

  /* ══════════════════════════════════════════════════════════
     Beamer / Lehrkraft
     ══════════════════════════════════════════════════════════ */
  function buildPresenterDOM() {
    root.innerHTML =
      '<div class="cm-host cm-host--presenter">' +
        '<div class="cm-pane" id="cmSetup">' +
          '<div class="cm-setup">' +
            '<div class="cm-setuprow">' +
              '<label>Teams: <input type="number" id="cmTeamCount" min="2" max="8" value="4"></label>' +
              '<button type="button" class="cm-btn" id="cmStartBtn">▶ Spiel starten</button>' +
            '</div>' +
            '<div class="cm-roster" id="cmRosterP"></div>' +
            '<p class="cm-hint" id="cmOnlineHintP"></p>' +
          '</div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmCountdownP">' +
          '<div class="cm-countdown">' +
            '<div class="cm-count" id="cmCountNumP">5</div>' +
          '</div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmBoardWrap">' +
          '<div class="cm-statusbar" id="cmStatusBar"></div>' +
          '<div class="cm-timerbar" id="cmTimerBar">' +
            '<div class="cm-timerset" id="cmTimerSet">' +
              '<span class="cm-hint">Runde beenden in:</span>' +
              '<button type="button" class="cm-chip" data-secs="5">5s (Test)</button>' +
              '<button type="button" class="cm-chip" data-secs="60">1 Min</button>' +
              '<button type="button" class="cm-chip" data-secs="120">2 Min</button>' +
              '<button type="button" class="cm-chip" data-secs="180">3 Min</button>' +
              '<button type="button" class="cm-chip" data-secs="240">4 Min</button>' +
              '<button type="button" class="cm-chip" data-secs="300">5 Min</button>' +
            '</div>' +
            '<div class="cm-timerrun cm-hide" id="cmTimerRun">' +
              '<span class="cm-hint">Rundenende in <b id="cmTimeLeft">--:--</b> — wer dann am meisten Feld hat, gewinnt.</span>' +
              '<button type="button" class="cm-btn cm-btn--ghost" id="cmTimerCancel">Timer abbrechen</button>' +
            '</div>' +
          '</div>' +
          '<div class="cm-mapwrap" id="cmMapWrap"><canvas id="cmMap"></canvas></div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmEndedP">' +
          '<div class="cm-result" id="cmResultP"></div>' +
          '<button type="button" class="cm-btn cm-btn--ghost" id="cmResetBtn">🔄 Neues Spiel</button>' +
        '</div>' +
      '</div>';

    els = {
      setup: root.querySelector('#cmSetup'),
      teamCount: root.querySelector('#cmTeamCount'),
      startBtn: root.querySelector('#cmStartBtn'),
      rosterP: root.querySelector('#cmRosterP'),
      onlineHintP: root.querySelector('#cmOnlineHintP'),
      countdownP: root.querySelector('#cmCountdownP'),
      countNumP: root.querySelector('#cmCountNumP'),
      boardWrap: root.querySelector('#cmBoardWrap'),
      statusBar: root.querySelector('#cmStatusBar'),
      timerBar: root.querySelector('#cmTimerBar'),
      timerSet: root.querySelector('#cmTimerSet'),
      timerRun: root.querySelector('#cmTimerRun'),
      timeLeft: root.querySelector('#cmTimeLeft'),
      timerCancel: root.querySelector('#cmTimerCancel'),
      mapWrap: root.querySelector('#cmMapWrap'),
      map: root.querySelector('#cmMap'),
      endedP: root.querySelector('#cmEndedP'),
      resultP: root.querySelector('#cmResultP'),
      resetBtn: root.querySelector('#cmResetBtn')
    };

    // Delegiert statt sechs einzelner Listener — dieselbe Handlung für
    // jeden Knopf, nur mit anderer Sekundenzahl.
    els.timerSet.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-secs]');
      if (!btn) return;
      const secs = parseInt(btn.dataset.secs, 10);
      btn.disabled = true;
      const r = await ctx.actions.call('clash_room_set_match_timer', { p_seconds: secs });
      btn.disabled = false;
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });
    els.timerCancel.addEventListener('click', async () => {
      const r = await ctx.actions.call('clash_room_clear_match_timer', {});
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });

    els.teamCount.addEventListener('change', async () => {
      const n = Math.max(2, Math.min(8, parseInt(els.teamCount.value, 10) || 4));
      els.teamCount.value = n;
      const r = await ctx.actions.call('clash_room_set_team_count', { p_team_count: n });
      if (!r || !r.ok) ctx.toast(ctx.errText((r && r.error) || 'network'), true);
      tick(true);
    });

    els.startBtn.addEventListener('click', async () => {
      els.startBtn.disabled = true;
      const r = await ctx.actions.call('clash_room_start', {});
      els.startBtn.disabled = false;
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });

    els.resetBtn.addEventListener('click', async () => {
      if (!(await ctx.confirm('Neues Spiel starten? Der bisherige Spielstand geht verloren.'))) return;
      const r = await ctx.actions.call('clash_room_reset', {});
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });
  }

  function statusBarHTML(v) {
    let out = '';
    for (let i = 0; i < v.team_count; i++) {
      const n = (v.team_tile_counts && v.team_tile_counts[String(i)]) || 0;
      const out_ = n === 0;
      out += `<div class="cm-scard${out_ ? ' cm-scard--out' : ''}">` +
        `<span class="cm-dot" style="background:${teamStroke(i)}"></span>` +
        `${ctx.esc(teamName(i))} · ${n} Felder</div>`;
    }
    return out;
  }

  function renderPresenter(v) {
    if (v.phase === 'lobby') {
      show2('setup');
      els.teamCount.value = v.team_count;
      els.rosterP.innerHTML = rosterHTML(v.teams, v.team_count, null);
      if (els.onlineHintP) {
        els.onlineHintP.textContent = (v.online_count != null && v.room_total != null && v.room_total > v.online_count)
          ? `${v.online_count} von ${v.room_total} bereit (online) — nur sie bekommen beim Start ein Team.`
          : '';
      }
      return;
    }
    if (v.phase === 'countdown') {
      show2('countdownP');
      startCountdown(v.countdown_ends_at);
      return;
    }
    stopCountdown();
    stopMatchTimer();
    if (v.phase === 'ended') {
      show2('endedP');
      els.resultP.innerHTML =
        `<b style="color:${teamStroke(v.winner_team)}">${ctx.esc(teamName(v.winner_team))} gewinnt!</b>`;
      return;
    }
    show2('boardWrap');
    els.statusBar.innerHTML = statusBarHTML(v);
    if (v.match_ends_at) {
      els.timerSet.classList.add('cm-hide');
      els.timerRun.classList.remove('cm-hide');
      startMatchTimer(v.match_ends_at);
    } else {
      els.timerSet.classList.remove('cm-hide');
      els.timerRun.classList.add('cm-hide');
      stopMatchTimer();
    }
    fitPresenterMap();
    requestAnimationFrame(fitPresenterMap);
  }

  function show2(which) {
    ['setup', 'countdownP', 'boardWrap', 'endedP'].forEach(k => {
      const el = { setup: els.setup, countdownP: els.countdownP,
                   boardWrap: els.boardWrap, endedP: els.endedP }[k];
      if (el) el.classList.toggle('cm-hide', k !== which);
    });
    if (which !== 'countdownP') stopCountdown();
  }

  /* ══════════════════════════════════════════════════════════
     Werkzeug-Schnittstelle
     ══════════════════════════════════════════════════════════ */
  window.MPTool.register('clash-of-math', {
    // Team-Zahl lebt bewusst NICHT im generischen Einstellungen-Fach:
    // sie ist über eine eigene RPC gesperrt, solange phase<>lobby, und
    // das lässt sich mit has_participants/has_entries (0084) nicht
    // ausdrücken. Der Regler steht deshalb im Werkzeug selbst
    // (Fach 3, Beamer-Rolle). Leere Liste = „keine Angabe hier".
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c; role = ctx.role;
      destroyed = false; lastSig = null; lastView = null; channelKey = null;

      if (role === 'presenter') buildPresenterDOM(); else buildParticipantDOM();

      // Beamer: die Karte soll den ganzen freien Platz nehmen (Fix 2)
      // — dieselbe „tool-fill"-Klasse wie bei NeuroLab/Cäsar, hier nur
      // für die Lehrkraft-Rolle. Der Teilnehmer behält seine begrenzte
      // Karte in der Seite, siehe Kopfkommentar der Datei.
      if (role === 'presenter' && !(ctx && ctx.preview)) {
        document.body.classList.add('tool-fill');
        onWinResize = () => fitPresenterMap();
        window.addEventListener('resize', onWinResize);
      }

      resizeObs = new ResizeObserver(() => {
        if (!lastView) return;
        if (role === 'presenter') { fitPresenterMap(); }
        else {
          const myTeam = lastView.me && lastView.me.team;
          if (els.map)  paintBoard(els.map,  lastView, { highlightTeam: myTeam });
          if (els.map2) paintBoard(els.map2, lastView, { highlightTeam: myTeam });
        }
      });
      resizeObs.observe(root);

      // Sicherheitsnetz: alle 8s eine billige Signatur — der schnelle
      // Weg ist der Broadcast-Kanal (siehe ensureChannel/nudge).
      pollTimer = setInterval(() => tick(false), 8000);
      tick(true);
    },

    // Wird vom generischen Seiten-Poller aufgerufen (skill_view/
    // skill_room_get) — für Clash meist ohne eigene Bedeutung, aber
    // ein billiger zusätzlicher Anstoß schadet nicht: irgendjemand
    // im Raum ist gerade aktiv genug, dass sich die generische
    // Ansicht geändert hat.
    update() { tick(false); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      stopCountdown();
      stopMatchTimer();
      if (onWinResize) window.removeEventListener('resize', onWinResize);
      onWinResize = null;
      document.body.classList.remove('tool-fill');
      if (resizeObs) { try { resizeObs.disconnect(); } catch (e) {} }
      resizeObs = null;
      if (channel && window.supabaseClient) {
        try { window.supabaseClient.removeChannel(channel); } catch (e) {}
      }
      channel = null; channelKey = null;
      root = ctx = null; role = null;
      els = {}; lastView = null; lastSig = null; busy = false; submitting = false;
    }
  });
})();
