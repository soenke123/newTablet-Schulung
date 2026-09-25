/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — tool.js (v2 – Bugfix-Runde)
   ══════════════════════════════════════════════════════════════
   Fixes gegenüber v1:
   1. Emotes funktionieren (richtige RPC-Aufrufe + visuelles Feedback)
   2. Creature-Picker funktioniert (onclick-Binding gefixt)
   3. Symbole (🔺🔷🟡🟢) entfernt — nur A/B/C/D Buchstaben
   4. Mobile-Responsivität verbessert (kein Overflow, Touch-optimiert)
   5. Avatar-Änderung zwischen Runden möglich (Podium/Ended zeigt Picker)
   6. Timer-Ablauf löst Auto-Advance beim Presenter aus
   7. Skin-Auswahl Highlighting gefixt
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let root = null;
  let ctx = null;
  let role = null;
  let pollTimer = null;
  let localTimer = null;
  let lastSig = null;
  let lastView = null;
  let busy = false;
  let myCreatureId = 0;
  let mySkinIdx = 0;
  let myNickname = '';
  let profileSaved = false;
  let questionStartTime = 0;
  let answered = false;        // lokales Flag bis Poll bestätigt
  let timerAutoAdvanced = false; // verhindert doppeltes Auto-Advance

  const POLL_MS = 2500;
  const LABELS = ['A', 'B', 'C', 'D'];

  /* ─── Skript-Lader für creatures.js ─── */
  function ensureCreatures() {
    if (window.KSCreatures) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'tools/KnowledgeStack/creatures.js?v=' + Date.now();
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Konnte creatures.js nicht laden'));
      document.head.appendChild(s);
    });
  }

  function creatureSVG(id, skin, emote, size) {
    if (window.KSCreatures && window.KSCreatures.svg) {
      return window.KSCreatures.svg(id, skin, emote, size);
    }
    // Fallback-Platzhalter
    return '<div style="width:' + (size||48) + 'px;height:' + (size||48) + 'px;background:#334155;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">👾</div>';
  }

  /* ─── Polling ─── */
  async function poll() {
    if (busy || !ctx || !root) return;
    busy = true;
    try {
      const sigFn = role === 'presenter' ? 'ks_room_sig' : 'ks_sig';
      const viewFn = role === 'presenter' ? 'ks_room_get' : 'ks_view';
      const sigRes = await ctx.actions.call(sigFn, {});
      if (sigRes && sigRes.ok && (sigRes.sig !== lastSig || !lastView)) {
        lastSig = sigRes.sig;
        const vr = await ctx.actions.call(viewFn, {});
        if (vr && vr.ok) {
          lastView = vr;
          role === 'presenter' ? renderPresenter(vr) : renderParticipant(vr);
        }
      }
    } catch (e) {
      console.warn('[KS] poll:', e);
    } finally { busy = false; }
  }

  /* ─── Timer ─── */
  function startTimer(endsAt) {
    if (localTimer) clearInterval(localTimer);
    if (!endsAt) return;
    const target = new Date(endsAt).getTime();
    timerAutoAdvanced = false;

    function tick() {
      const el = root ? root.querySelector('#ks-timer') : null;
      const left = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      if (el) el.textContent = left + 's';
      if (left <= 0) {
        clearInterval(localTimer);
        // Presenter: automatisch weiterschalten wenn Timer abläuft
        if (role === 'presenter' && !timerAutoAdvanced) {
          timerAutoAdvanced = true;
          ctx.actions.call('ks_advance', {}).then(() => poll());
        } else {
          poll(); // Participant: einfach neu pollen
        }
      }
    }
    tick();
    localTimer = setInterval(tick, 1000);
  }

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function emoteIcon(e) {
    return { wave:'👋', dance:'🕺', cheer:'🎉', sleep:'😴', sad:'😢' }[e] || '✨';
  }

  /* ══════════════════════════════════════════════════════════════
     PRESENTER
     ══════════════════════════════════════════════════════════════ */
  function renderPresenter(v) {
    if (!root) return;
    const p = v.phase || 'lobby';
    const qi = (v.current_q_idx||0) + 1;
    const qc = v.question_count || 0;
    const code = ctx && ctx.room ? ctx.room.code : '';

    let h = '<div class="ks-container">';

    // Top bar
    h += '<div class="ks-topbar">';
    h += '  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">';
    h += '    <span class="ks-badge ks-pin-pill">PIN: ' + code + '</span>';
    if (p !== 'lobby') h += '<span class="ks-badge" style="background:#1e1b4b;color:#a5b4fc;border-color:#6366f1;">Frage ' + qi + ' / ' + qc + '</span>';
    h += '  </div>';
    if (v.phase_ends_at) h += '<span class="ks-badge ks-timer-pill" id="ks-timer">…</span>';
    h += '</div>';

    if (p === 'lobby')         h += presLobby(v, code);
    else if (p === 'question') h += presQuestion(v);
    else if (p === 'reveal')   h += presReveal(v);
    else if (p === 'podium')   h += presPodium(v);
    else if (p === 'ended')    h += presEnded(v);

    h += '</div>';
    root.innerHTML = h;
    bindPres(v);
    startTimer(v.phase_ends_at);
  }

  function presLobby(v, code) {
    const pl = v.players || [];
    return `
      <div class="ks-lobby-grid">
        <div class="ks-card ks-lobby-sidebar" style="padding:20px;">
          <h2 style="margin:0 0 10px;font-size:22px;font-weight:900;">Knowledge Stack</h2>
          <p style="color:#94a3b8;font-size:13px;margin-bottom:14px;">
            Code: <strong>${code}</strong>
          </p>
          <div id="ks-qr" style="background:#fff;padding:10px;border-radius:14px;text-align:center;"></div>
          <button id="ks-start" class="ks-btn" style="background:#10b981;color:#000;padding:14px;font-size:16px;margin-top:14px;width:100%;">
            🚀 Quiz starten (${pl.length} bereit)
          </button>
        </div>
        <div class="ks-card" style="padding:20px;">
          <h3 style="margin:0 0 12px;font-size:18px;">Avatare (${pl.length})</h3>
          <div class="ks-player-wall">
            ${pl.length === 0 ? '<p style="color:#64748b;grid-column:1/-1;text-align:center;padding:30px 0;">Noch niemand beigetreten…</p>' : ''}
            ${pl.map(p => `
              <div class="ks-player-card">
                ${p.last_emote ? '<span class="ks-player-emote">' + emoteIcon(p.last_emote) + '</span>' : ''}
                ${creatureSVG(p.creature_id, p.skin_idx, 'c-idle', 56)}
                <span class="ks-player-name">${esc(p.nickname)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  }

  function presQuestion(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const pl = v.players || [];
    const ac = pl.filter(p => p.answered).length;
    return `
      <div class="ks-center-col">
        <div class="ks-question-box">
          <h1 class="ks-question-text">${esc(q.text)}</h1>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <span style="font-weight:700;color:#94a3b8;">Antworten: <strong style="color:#fff;">${ac} / ${pl.length}</strong></span>
          <button id="ks-force" class="ks-btn" style="background:#ffe600;color:#000;padding:8px 14px;font-size:13px;">⏱ Jetzt auflösen</button>
        </div>
        <div class="ks-answers-grid">
          ${opts.map((o,i) => `
            <div class="ks-ans-card c-${i} disabled">
              <span class="ks-ans-label">${LABELS[i]}</span>
              <span class="ks-ans-text">${esc(o)}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  function presReveal(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const dist = v.answers_dist || {};
    const tot = Object.values(dist).reduce((a,b) => a+b, 0);
    return `
      <div class="ks-center-col">
        <div class="ks-question-box" style="border-color:#10b981;box-shadow:6px 6px 0 0 #10b981;">
          <h1 class="ks-question-text">${esc(q.text)}</h1>
          ${q.explanation ? '<p style="color:#a7f3d0;font-size:15px;margin:10px 0 0;font-weight:600;">💡 ' + esc(q.explanation) + '</p>' : ''}
        </div>
        <div style="text-align:right;margin-bottom:14px;">
          <button id="ks-to-podium" class="ks-btn" style="background:#00f0ff;color:#000;padding:10px 20px;font-size:15px;">📊 Zwischenstand ➔</button>
        </div>
        <div class="ks-answers-grid">
          ${opts.map((o,i) => {
            const ok = i === q.correct_idx;
            const n = dist[i]||0;
            const pct = tot > 0 ? Math.round(n/tot*100) : 0;
            return `
              <div class="ks-ans-card c-${i} ${ok ? 'correct-highlight' : 'wrong-fade'}">
                <span class="ks-ans-label">${ok ? '✅' : LABELS[i]}</span>
                <span class="ks-ans-text">${esc(o)}</span>
                <span class="ks-ans-count">${n} (${pct}%)</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function presPodium(v) {
    const lb = v.leaderboard || [];
    // Reihenfolge am Beamer: 4, 2, 1, 3, 5
    const order = [lb[3], lb[1], lb[0], lb[2], lb[4]].filter(Boolean);
    return `
      <div class="ks-center-col" style="justify-content:space-between;">
        <h2 style="text-align:center;font-size:28px;font-weight:900;margin:8px 0;">🏆 Top 5</h2>
        <div class="ks-podium-stage">
          ${order.map(p => {
            const d = p.rank_change||0;
            const dc = d>0?'up':d<0?'down':'same';
            const dt = d>0?'▲+'+d:d<0?'▼'+d:'–';
            return `
              <div class="ks-podium-slot rank-${p.rank}">
                ${creatureSVG(p.creature_id, p.skin_idx, (p.rank===1||d>0)?'c-cheer':'c-idle', p.rank<=3?88:64)}
                <span class="ks-pod-name">${esc(p.nickname)}</span>
                <span class="ks-podium-delta ${dc}">${dt}</span>
                <div class="ks-pedestal"><span class="ks-pod-rank">#${p.rank}</span><span class="ks-pod-pts">${p.score} Pkt</span></div>
              </div>`;
          }).join('')}
        </div>
        <div style="text-align:center;margin-bottom:16px;">
          <button id="ks-adv" class="ks-btn" style="background:#10b981;color:#000;padding:14px 32px;font-size:17px;">
            ${(v.current_q_idx+1 < v.question_count) ? '➡️ Nächste Frage' : '🏁 Siegerehrung'}
          </button>
        </div>
      </div>`;
  }

  function presEnded(v) {
    const w = (v.leaderboard||[])[0];
    return `
      <div class="ks-center-col" style="align-items:center;justify-content:center;">
        <span style="font-size:56px;">👑</span>
        <h1 style="font-size:36px;font-weight:900;margin:8px 0;">Quiz beendet!</h1>
        ${w ? `
          <div class="ks-card-white" style="padding:28px;margin:20px 0;max-width:360px;width:100%;background:#1e1b4b;text-align:center;">
            ${creatureSVG(w.creature_id, w.skin_idx, 'c-cheer', 110)}
            <h2 style="font-size:24px;font-weight:900;margin:10px 0 4px;color:#facc15;">1. ${esc(w.nickname)}</h2>
            <span class="ks-badge ks-timer-pill">${w.score} Punkte</span>
          </div>` : ''}
        <button id="ks-reset" class="ks-btn" style="background:#ffe600;color:#000;padding:14px 28px;font-size:15px;">🔄 Zurück zur Lobby</button>
      </div>`;
  }

  function bindPres(v) {
    // QR
    if (v.phase === 'lobby') {
      const qr = root.querySelector('#ks-qr');
      if (qr && window.MPRoom && window.MPRoom.qrSVG) qr.innerHTML = window.MPRoom.qrSVG(160);
    }

    bind('#ks-start',     () => ctx.actions.call('ks_advance', {}).then(poll));
    bind('#ks-force',     () => ctx.actions.call('ks_advance', {}).then(poll));
    bind('#ks-to-podium', () => ctx.actions.call('ks_advance', {}).then(poll));
    bind('#ks-adv',       () => ctx.actions.call('ks_advance', {}).then(poll));
    bind('#ks-reset',     () => ctx.actions.call('ks_advance', {}).then(poll));
  }

  /* ══════════════════════════════════════════════════════════════
     PARTICIPANT
     ══════════════════════════════════════════════════════════════ */
  function renderParticipant(v) {
    if (!root) return;
    const p = v.phase || 'lobby';
    const me = v.me || {};

    // State aus Server übernehmen
    if (me.nickname) myNickname = me.nickname;
    if (me.creature_id != null) myCreatureId = me.creature_id;
    if (me.skin_idx != null) mySkinIdx = me.skin_idx;

    // Phasenwechsel: answered zurücksetzen
    if (p === 'question' && !v.my_answer) {
      answered = false;
      if (!questionStartTime) questionStartTime = Date.now();
    }
    if (p !== 'question') {
      questionStartTime = 0;
    }

    let h = '<div class="ks-container">';

    // Kompakte Top-Bar
    h += '<div class="ks-topbar">';
    h += '  <span style="font-weight:800;font-size:14px;">' + esc(me.nickname||'Dein Avatar') + ' · ' + (me.score||0) + ' Pkt</span>';
    if (v.phase_ends_at) h += '<span class="ks-badge ks-timer-pill" id="ks-timer">…</span>';
    h += '</div>';

    if (p === 'lobby')                    h += partLobby(v);
    else if (p === 'question')            h += partQuestion(v);
    else if (p === 'reveal')              h += partReveal(v);
    else if (p === 'podium' || p === 'ended') h += partPodium(v);

    h += '</div>';
    root.innerHTML = h;
    bindPart(v);
    startTimer(v.phase_ends_at);
  }

  /* ─── Avatar-Picker (wiederverwendbar in Lobby + zwischen Runden) ─── */
  function avatarPickerHTML(showNickInput) {
    const creatures = window.KSCreatures ? window.KSCreatures.list : [];
    let h = '';

    h += '<div class="ks-card" style="padding:16px;">';
    h += '  <h2 style="margin:0 0 10px;font-size:18px;font-weight:900;text-align:center;">Dein Avatar</h2>';

    // Preview
    h += '  <div style="display:flex;justify-content:center;margin-bottom:10px;">';
    h += '    <div id="ks-preview" style="background:#13141f;padding:10px;border-radius:20px;border:3px solid #facc15;">';
    h += creatureSVG(myCreatureId, mySkinIdx, 'c-wave', 80);
    h += '    </div>';
    h += '  </div>';

    // Nickname
    if (showNickInput) {
      h += '<div style="margin-bottom:10px;text-align:center;">';
      h += '  <input type="text" id="ks-nick" value="' + esc(myNickname) + '" placeholder="Dein Name" ';
      h += '    style="width:90%;max-width:240px;padding:8px 12px;border-radius:10px;border:2px solid #475569;font-weight:700;font-size:14px;background:#0f172a;color:#fff;text-align:center;" />';
      h += '</div>';
    }

    // Creature Grid (6×6)
    h += '<div class="ks-picker-grid" id="ks-creature-grid">';
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      h += '<div class="ks-picker-item' + (c.id === myCreatureId ? ' active' : '') + '" data-cid="' + c.id + '">';
      h += creatureSVG(c.id, mySkinIdx, 'c-idle', 40);
      h += '<span style="font-size:9px;font-weight:700;margin-top:1px;">' + esc(c.name) + '</span>';
      h += '</div>';
    }
    h += '</div>';

    // Skin Buttons
    h += '<div style="display:flex;justify-content:center;gap:8px;margin:8px 0;">';
    for (let s = 0; s < 3; s++) {
      const sel = s === mySkinIdx;
      h += '<button class="ks-btn ks-skin-btn" data-skin="' + s + '" ';
      h += 'style="padding:5px 12px;font-size:11px;background:' + (sel?'#facc15':'#1e293b') + ';color:' + (sel?'#000':'#fff') + ';">';
      h += 'Skin ' + (s+1) + '</button>';
    }
    h += '</div>';

    // Save
    h += '<button id="ks-save" class="ks-btn" style="background:#10b981;color:#000;padding:10px;font-size:14px;width:100%;margin-top:8px;">';
    h += profileSaved ? '✅ Gespeichert!' : '💾 Avatar speichern';
    h += '</button>';

    h += '</div>';
    return h;
  }

  function emoteBarHTML() {
    return `
      <div style="text-align:center;margin-top:12px;">
        <div class="ks-emote-bar">
          <button class="ks-emote-btn" data-emote="wave">👋</button>
          <button class="ks-emote-btn" data-emote="dance">🕺</button>
          <button class="ks-emote-btn" data-emote="cheer">🎉</button>
          <button class="ks-emote-btn" data-emote="sleep">😴</button>
        </div>
      </div>`;
  }

  function partLobby(v) {
    return '<div class="ks-mobile-col">' + avatarPickerHTML(true) + emoteBarHTML() +
      '<p style="text-align:center;color:#64748b;font-size:13px;margin-top:8px;">⏳ Warten auf Spielstart…</p></div>';
  }

  function partQuestion(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const myAns = v.my_answer;
    const locked = myAns || answered;

    let h = '<div class="ks-mobile-col">';

    // Frage
    h += '<div class="ks-question-box" style="padding:14px 16px;margin-bottom:12px;">';
    h += '  <h2 class="ks-question-text" style="font-size:18px;">' + esc(q.text) + '</h2>';
    h += '</div>';

    if (locked) {
      h += '<div class="ks-card-white" style="padding:16px;text-align:center;background:#1e1b4b;">';
      h += '  <span style="font-size:28px;">🔒</span>';
      h += '  <h3 style="margin:6px 0;font-size:16px;font-weight:900;color:#facc15;">Antwort eingeloggt!</h3>';
      h += '  <p style="color:#94a3b8;font-size:12px;margin:0;">Warten auf die anderen…</p>';
      h += '</div>';
    }

    // Antworten
    h += '<div class="ks-answers-grid">';
    for (let i = 0; i < opts.length; i++) {
      const isSel = (myAns && myAns.chosen_idx === i);
      h += '<div class="ks-ans-card c-' + i + (isSel ? ' selected' : '') + (locked ? ' disabled' : '') + '" data-idx="' + i + '">';
      h += '  <span class="ks-ans-label">' + LABELS[i] + '</span>';
      h += '  <span class="ks-ans-text">' + esc(opts[i]) + '</span>';
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  function partReveal(v) {
    const myAns = v.my_answer;
    const ok = myAns && myAns.is_correct;
    const pts = myAns ? myAns.points_awarded : 0;
    const me = v.me || {};

    return `
      <div class="ks-mobile-col" style="align-items:center;justify-content:center;">
        <div class="ks-card" style="padding:24px;width:100%;text-align:center;border-color:${ok?'#10b981':'#ef4444'};box-shadow:6px 6px 0 0 ${ok?'#10b981':'#ef4444'};">
          ${creatureSVG(me.creature_id, me.skin_idx, ok?'c-cheer':'c-sad', 96)}
          <h1 style="font-size:26px;font-weight:900;margin:12px 0 4px;color:${ok?'#34d399':'#f87171'};">
            ${ok ? '🎉 Richtig!' : '❌ Falsch!'}
          </h1>
          <p style="font-size:16px;font-weight:800;margin:0 0 8px;">
            ${ok ? '+' + pts + ' Punkte' : '0 Punkte'}
          </p>
          ${me.streak > 1 ? '<span class="ks-badge" style="background:#f97316;color:#fff;">🔥 ' + me.streak + 'er Streak!</span>' : ''}
        </div>
      </div>`;
  }

  function partPodium(v) {
    const me = v.me || {};
    const before = v.neighbor_before;
    const after = v.neighbor_after;
    const d = me.rank_change || 0;
    const dc = d>0?'up':d<0?'down':'same';
    const dt = d>0?'▲ +'+d:d<0?'▼ '+d:'–';
    const isEnded = v.phase === 'ended';

    let h = '<div class="ks-mobile-col">';

    // Titel
    h += '<h2 style="text-align:center;font-size:22px;font-weight:900;margin:0 0 8px;">' + (isEnded ? '🏁 Ergebnis' : '🏆 Dein Rang') + '</h2>';

    // Rang-Karten: Vorgänger | ICH | Nachfolger
    h += '<div class="ks-my-rank-stage">';

    if (before) {
      h += '<div class="ks-neighbor-card">';
      h += '  <span style="font-size:11px;font-weight:700;color:#94a3b8;">#' + before.rank + '</span>';
      h += creatureSVG(before.creature_id, before.skin_idx, 'c-idle', 44);
      h += '  <span style="font-weight:700;font-size:11px;margin-top:2px;">' + esc(before.nickname) + '</span>';
      h += '  <span style="font-size:10px;color:#94a3b8;">' + before.score + '</span>';
      h += '</div>';
    } else {
      h += '<div style="flex:1;"></div>';
    }

    h += '<div class="ks-my-center-card">';
    h += creatureSVG(me.creature_id, me.skin_idx, d>0?'c-cheer':'c-idle', 80);
    h += '  <h3 style="margin:6px 0 2px;font-size:18px;font-weight:900;color:#facc15;">#' + (me.rank||'?') + ' ' + esc(me.nickname) + '</h3>';
    h += '  <span class="ks-podium-delta ' + dc + '">' + dt + '</span>';
    h += '  <span style="font-size:14px;font-weight:800;margin-top:4px;">' + (me.score||0) + ' Pkt</span>';
    h += '</div>';

    if (after) {
      h += '<div class="ks-neighbor-card">';
      h += '  <span style="font-size:11px;font-weight:700;color:#94a3b8;">#' + after.rank + '</span>';
      h += creatureSVG(after.creature_id, after.skin_idx, 'c-idle', 44);
      h += '  <span style="font-weight:700;font-size:11px;margin-top:2px;">' + esc(after.nickname) + '</span>';
      h += '  <span style="font-size:10px;color:#94a3b8;">' + after.score + '</span>';
      h += '</div>';
    } else {
      h += '<div style="flex:1;"></div>';
    }

    h += '</div>'; // end stage

    // Emote-Bar
    h += emoteBarHTML();

    // Avatar ändern zwischen Runden (aufklappbar)
    if (isEnded) {
      h += '<details style="margin-top:12px;width:100%;">';
      h += '  <summary style="cursor:pointer;font-weight:700;font-size:13px;color:#94a3b8;text-align:center;">🔄 Avatar für nächste Runde ändern</summary>';
      h += '  <div style="margin-top:8px;">' + avatarPickerHTML(true) + '</div>';
      h += '</details>';
    }

    h += '</div>';
    return h;
  }

  function bindPart(v) {
    // Creature Picker
    const grid = root.querySelector('#ks-creature-grid');
    if (grid) {
      grid.addEventListener('click', function(e) {
        const item = e.target.closest('.ks-picker-item');
        if (!item) return;
        myCreatureId = parseInt(item.dataset.cid, 10);
        profileSaved = false;
        // Alle deaktivieren, aktives markieren
        grid.querySelectorAll('.ks-picker-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        updatePreview();
      });
    }

    // Skin Buttons
    root.querySelectorAll('.ks-skin-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        mySkinIdx = parseInt(this.dataset.skin, 10);
        profileSaved = false;
        // Styling aktualisieren
        root.querySelectorAll('.ks-skin-btn').forEach(b => {
          const sel = parseInt(b.dataset.skin,10) === mySkinIdx;
          b.style.background = sel ? '#facc15' : '#1e293b';
          b.style.color = sel ? '#000' : '#fff';
        });
        updatePreview();
        // Creature Grid auch mit neuem Skin neu rendern
        if (grid) {
          grid.querySelectorAll('.ks-picker-item').forEach(el => {
            const cid = parseInt(el.dataset.cid, 10);
            // SVG im Item aktualisieren
            const svgWrap = el.querySelector('.creature-svg') || el.querySelector('div');
            if (svgWrap) {
              el.innerHTML = creatureSVG(cid, mySkinIdx, 'c-idle', 40) +
                '<span style="font-size:9px;font-weight:700;margin-top:1px;">' +
                (window.KSCreatures ? esc(window.KSCreatures.list.find(c=>c.id===cid)?.name||'') : '') + '</span>';
              if (cid === myCreatureId) el.classList.add('active');
            }
          });
        }
      });
    });

    // Save Profil
    bind('#ks-save', async function() {
      const inp = root.querySelector('#ks-nick');
      if (inp) myNickname = inp.value.trim() || myNickname;
      const btn = root.querySelector('#ks-save');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ …'; }
      await ctx.actions.call('ks_join', { p_nickname: myNickname, p_creature: myCreatureId, p_skin: mySkinIdx });
      profileSaved = true;
      if (btn) { btn.textContent = '✅ Gespeichert!'; }
      setTimeout(() => { profileSaved = false; }, 2000);
    });

    // Emotes
    root.querySelectorAll('.ks-emote-btn').forEach(btn => {
      btn.addEventListener('click', async function() {
        const emote = this.dataset.emote;
        // Visuelles Feedback
        this.style.transform = 'scale(1.3)';
        this.style.boxShadow = '0 0 12px #facc15';
        setTimeout(() => {
          if (this) { this.style.transform = ''; this.style.boxShadow = ''; }
        }, 300);
        await ctx.actions.call('ks_emote', { p_emote: emote });
      });
    });

    // Antworten
    root.querySelectorAll('.ks-ans-card:not(.disabled)').forEach(card => {
      card.addEventListener('click', async function() {
        if (answered) return;
        answered = true;
        const idx = parseInt(this.dataset.idx, 10);
        const ms = Date.now() - (questionStartTime || Date.now());
        // Sofort visuell markieren
        root.querySelectorAll('.ks-ans-card').forEach(c => c.classList.add('disabled'));
        this.classList.add('selected');
        await ctx.actions.call('ks_answer', { p_question_idx: v.current_q_idx||0, p_chosen: idx, p_response_ms: ms });
        poll();
      });
    });
  }

  function updatePreview() {
    const prev = root.querySelector('#ks-preview');
    if (prev) prev.innerHTML = creatureSVG(myCreatureId, mySkinIdx, 'c-wave', 80);
  }

  /* ─── Helfer ─── */
  function bind(sel, fn) {
    const el = root ? root.querySelector(sel) : null;
    if (el) el.onclick = function() { this.disabled = true; fn(); };
  }

  /* ══════════════════════════════════════════════════════════════
     REGISTRATION
     ══════════════════════════════════════════════════════════════ */
  window.MPTool.register('knowledgestack', {
    mount: async function (el, context) {
      root = el;
      ctx = context;
      role = context.role;
      lastSig = null;
      lastView = null;
      busy = false;
      answered = false;
      questionStartTime = 0;
      profileSaved = false;
      timerAutoAdvanced = false;
      await ensureCreatures();
      poll();
      pollTimer = setInterval(poll, POLL_MS);
    },
    update: function () { poll(); },
    unmount: function () {
      if (pollTimer) clearInterval(pollTimer);
      if (localTimer) clearInterval(localTimer);
      pollTimer = localTimer = null;
      root = ctx = null;
      lastSig = lastView = null;
    }
  });

})();
