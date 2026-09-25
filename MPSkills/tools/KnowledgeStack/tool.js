/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — tool.js
   Live-Quiz mit 36 Wesen, Leaderboard & taktilem Touch-Interface
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
  let questionStartTime = 0;
  let selectedOption = null;

  const POLL_MS = 2500;

  // Shapes & Farbkombinationen für 4 Antwortkarten
  const SHAPES = ['🔺', '🔷', '🟡', '🟢'];

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

  function getCreatureSVG(id, skin, emote, size) {
    if (window.KSCreatures && window.KSCreatures.svg) {
      return window.KSCreatures.svg(id, skin, emote, size);
    }
    return '<div style="width:' + size + 'px;height:' + size + 'px;background:#334155;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;">👾</div>';
  }

  /* ─── Polling-Schleife ─── */
  async function pollTick() {
    if (busy || !ctx || !root) return;
    busy = true;

    try {
      if (role === 'presenter') {
        const sigRes = await ctx.actions.call('ks_room_sig', {});
        if (sigRes && sigRes.ok) {
          if (sigRes.sig !== lastSig || !lastView) {
            lastSig = sigRes.sig;
            const viewRes = await ctx.actions.call('ks_room_get', {});
            if (viewRes && viewRes.ok) {
              lastView = viewRes;
              renderPresenter(viewRes);
            }
          }
        }
      } else {
        const sigRes = await ctx.actions.call('ks_sig', {});
        if (sigRes && sigRes.ok) {
          if (sigRes.sig !== lastSig || !lastView) {
            lastSig = sigRes.sig;
            const viewRes = await ctx.actions.call('ks_view', {});
            if (viewRes && viewRes.ok) {
              lastView = viewRes;
              renderParticipant(viewRes);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[KnowledgeStack] Polling-Fehler:', err);
    } finally {
      busy = false;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     PRESENTER (Beamer / lehrer.html)
     ══════════════════════════════════════════════════════════════ */

  function renderPresenter(v) {
    if (!root) return;
    const phase = v.phase || 'lobby';

    let html = '<div class="ks-container">';
    html += renderPresenterTopBar(v);

    if (phase === 'lobby') {
      html += renderPresenterLobby(v);
    } else if (phase === 'question') {
      html += renderPresenterQuestion(v);
    } else if (phase === 'reveal') {
      html += renderPresenterReveal(v);
    } else if (phase === 'podium') {
      html += renderPresenterPodium(v);
    } else if (phase === 'ended') {
      html += renderPresenterEnded(v);
    }

    html += '</div>';
    root.innerHTML = html;
    bindPresenterEvents(v);
  }

  function renderPresenterTopBar(v) {
    const qCount = v.question_count || 12;
    const qIdx = (v.current_q_idx || 0) + 1;
    const roomCode = ctx && ctx.room ? ctx.room.code : '';

    return `
      <div class="ks-topbar">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="ks-badge ks-pin-pill">🕹️ PIN: ${roomCode}</span>
          ${v.phase !== 'lobby' ? `<span class="ks-badge" style="background:#1e1b4b;color:#a5b4fc;border-color:#6366f1;">FRAGE ${qIdx} / ${qCount}</span>` : ''}
        </div>
        <div>
          ${v.phase_ends_at ? `<span class="ks-badge ks-timer-pill" id="ks-live-timer">⏱️ ...</span>` : ''}
        </div>
      </div>
    `;
  }

  function renderPresenterLobby(v) {
    const players = v.players || [];
    const roomCode = ctx && ctx.room ? ctx.room.code : '';

    return `
      <div class="ks-lobby-grid">
        <div class="ks-card ks-lobby-sidebar" style="padding:24px;">
          <h2 style="margin:0 0 12px 0;font-size:24px;font-weight:900;">Knowledge Stack</h2>
          <p style="color:#94a3b8;font-size:14px;margin-bottom:16px;">
            Schülerinnen und Schüler scannen den QR-Code oder geben den Code <strong>${roomCode}</strong> ein.
          </p>
          <div id="ks-qr-mount" style="background:#fff;padding:12px;border-radius:16px;text-align:center;box-shadow:4px 4px 0px 0px #000;"></div>
          <button id="ks-btn-start" class="ks-btn" style="background:#10b981;color:#000;padding:16px;font-size:18px;margin-top:16px;">
            🚀 Quiz starten (${players.length} bereit)
          </button>
        </div>

        <div class="ks-card" style="padding:24px;display:flex;flex-direction:column;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;font-size:20px;font-weight:800;">Angemeldete Avatare (${players.length})</h3>
            <span style="font-size:13px;color:#94a3b8;">Wählen ihr Wesen live am Tablet</span>
          </div>
          <div class="ks-player-wall">
            ${players.length === 0 ? '<p style="color:#64748b;grid-column:1/-1;text-align:center;padding:40px 0;">Noch keine Schüler beigetreten...</p>' : ''}
            ${players.map(p => `
              <div class="ks-player-card">
                ${p.last_emote ? `<span class="ks-player-emote">${getEmoteChar(p.last_emote)}</span>` : ''}
                ${getCreatureSVG(p.creature_id, p.skin_idx, 'c-idle', 64)}
                <span class="ks-player-name">${escapeHTML(p.nickname)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderPresenterQuestion(v) {
    const q = v.question || { text: 'Lade Frage...', options: [], time_limit: 20 };
    const options = Array.isArray(q.options) ? q.options : [];
    const players = v.players || [];
    const answeredCount = players.filter(p => p.answered).length;

    return `
      <div style="max-width:960px;margin:0 auto;width:100%;flex:1;display:flex;flex-direction:column;">
        <div class="ks-question-box">
          <h1 class="ks-question-text">${escapeHTML(q.text)}</h1>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <span style="font-weight:700;color:#94a3b8;">Antworten: <strong style="color:#fff;">${answeredCount} / ${players.length}</strong></span>
          <button id="ks-btn-force-reveal" class="ks-btn" style="background:#ffe600;color:#000;padding:8px 16px;font-size:13px;">
            ⏱️ Jetzt auflösen
          </button>
        </div>

        <div class="ks-answers-grid">
          ${options.map((opt, idx) => `
            <div class="ks-ans-card c-${idx} disabled">
              <span class="ks-ans-shape">${SHAPES[idx]}</span>
              <span style="flex:1;">${escapeHTML(opt)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderPresenterReveal(v) {
    const q = v.question || { text: '', options: [] };
    const options = Array.isArray(q.options) ? q.options : [];
    const dist = v.answers_dist || {};
    const totalAns = Object.values(dist).reduce((a, b) => a + b, 0);

    return `
      <div style="max-width:960px;margin:0 auto;width:100%;flex:1;display:flex;flex-direction:column;">
        <div class="ks-question-box" style="border-color:#10b981;box-shadow:8px 8px 0px 0px #10b981;">
          <h1 class="ks-question-text">${escapeHTML(q.text)}</h1>
          ${q.explanation ? `<p style="color:#a7f3d0;font-size:16px;margin:12px 0 0 0;font-weight:600;">💡 ${escapeHTML(q.explanation)}</p>` : ''}
        </div>

        <div style="text-align:right;margin-bottom:16px;">
          <button id="ks-btn-next-podium" class="ks-btn" style="background:#00f0ff;color:#000;padding:12px 24px;font-size:16px;">
            📊 Zum Zwischenstand ➔
          </button>
        </div>

        <div class="ks-answers-grid">
          ${options.map((opt, idx) => {
            const isCorrect = (idx === q.correct_idx);
            const count = dist[idx] || 0;
            const pct = totalAns > 0 ? Math.round((count / totalAns) * 100) : 0;
            return `
              <div class="ks-ans-card c-${idx} ${isCorrect ? 'correct-highlight' : 'wrong-fade'}">
                <span class="ks-ans-shape">${isCorrect ? '✅' : SHAPES[idx]}</span>
                <span style="flex:1;">${escapeHTML(opt)}</span>
                <span class="ks-badge" style="background:rgba(0,0,0,0.4);border-color:#000;color:#fff;">
                  ${count} (${pct}%)
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderPresenterPodium(v) {
    const top5 = v.leaderboard || [];
    const podiumOrder = [
      top5[3], // 4. Platz ganz links
      top5[1], // 2. Platz links
      top5[0], // 1. Platz mittig groß
      top5[2], // 3. Platz rechts
      top5[4]  // 5. Platz ganz rechts
    ].filter(Boolean);

    return `
      <div style="max-width:960px;margin:0 auto;width:100%;flex:1;display:flex;flex-direction:column;justify-content:space-between;">
        <div style="text-align:center;margin-top:10px;">
          <h2 style="font-size:32px;font-weight:900;margin:0;">🏆 Top 5 Rangliste</h2>
          <p style="color:#94a3b8;font-size:15px;margin-top:4px;">Positionen nach Frage ${(v.current_q_idx || 0) + 1}</p>
        </div>

        <div class="ks-podium-stage">
          ${podiumOrder.map(p => {
            const delta = p.rank_change || 0;
            const deltaClass = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'same');
            const deltaText = delta > 0 ? `▲ +${delta}` : (delta < 0 ? `▼ ${delta}` : '–');
            const emote = (p.rank === 1 || delta > 0) ? 'c-cheer' : 'c-idle';

            return `
              <div class="ks-podium-slot rank-${p.rank}">
                ${getCreatureSVG(p.creature_id, p.skin_idx, emote, p.rank === 1 ? 96 : 72)}
                <span style="font-weight:800;font-size:15px;margin:8px 0 4px 0;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${escapeHTML(p.nickname)}
                </span>
                <span class="ks-podium-delta ${deltaClass}">${deltaText}</span>
                <div class="ks-pedestal">
                  <span style="font-size:24px;">#${p.rank}</span>
                  <span style="font-size:13px;opacity:0.9;">${p.score} Pkt</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="text-align:center;margin-bottom:20px;">
          <button id="ks-btn-advance" class="ks-btn" style="background:#10b981;color:#000;padding:16px 36px;font-size:18px;">
            ${(v.current_q_idx + 1 < v.question_count) ? '➡️ Nächste Frage' : '🏁 Siegerehrung'}
          </button>
        </div>
      </div>
    `;
  }

  function renderPresenterEnded(v) {
    const top5 = v.leaderboard || [];
    const winner = top5[0];

    return `
      <div style="max-width:700px;margin:30px auto;text-align:center;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="font-size:64px;">👑</span>
        <h1 style="font-size:42px;font-weight:900;margin:10px 0;">Quiz abgeschlossen!</h1>
        ${winner ? `
          <div class="ks-card-white" style="padding:32px;margin:24px 0;width:100%;max-width:400px;background:#1e1b4b;">
            ${getCreatureSVG(winner.creature_id, winner.skin_idx, 'c-cheer', 120)}
            <h2 style="font-size:28px;font-weight:900;margin:12px 0 4px 0;color:#facc15;">1. Platz: ${escapeHTML(winner.nickname)}</h2>
            <span class="ks-badge ks-timer-pill">${winner.score} Punkte</span>
          </div>
        ` : ''}
        <button id="ks-btn-reset-lobby" class="ks-btn" style="background:#ffe600;color:#000;padding:16px 32px;font-size:16px;">
          🔄 Zurück zur Lobby
        </button>
      </div>
    `;
  }

  function bindPresenterEvents(v) {
    // QR Code zeichnen
    if (v.phase === 'lobby') {
      const qrEl = root.querySelector('#ks-qr-mount');
      if (qrEl && window.MPRoom && window.MPRoom.qrSVG) {
        qrEl.innerHTML = window.MPRoom.qrSVG(180);
      }
    }

    // Start-Knopf
    const btnStart = root.querySelector('#ks-btn-start');
    if (btnStart) {
      btnStart.onclick = async () => {
        btnStart.disabled = true;
        await ctx.actions.call('ks_advance', {});
        pollTick();
      };
    }

    // Force Reveal
    const btnForce = root.querySelector('#ks-btn-force-reveal');
    if (btnForce) {
      btnForce.onclick = async () => {
        btnForce.disabled = true;
        await ctx.actions.call('ks_advance', {});
        pollTick();
      };
    }

    // Next to Podium
    const btnNextPodium = root.querySelector('#ks-btn-next-podium');
    if (btnNextPodium) {
      btnNextPodium.onclick = async () => {
        btnNextPodium.disabled = true;
        await ctx.actions.call('ks_advance', {});
        pollTick();
      };
    }

    // Advance Question or End
    const btnAdv = root.querySelector('#ks-btn-advance');
    if (btnAdv) {
      btnAdv.onclick = async () => {
        btnAdv.disabled = true;
        await ctx.actions.call('ks_advance', {});
        pollTick();
      };
    }

    // Reset to Lobby
    const btnReset = root.querySelector('#ks-btn-reset-lobby');
    if (btnReset) {
      btnReset.onclick = async () => {
        btnReset.disabled = true;
        await ctx.actions.call('ks_advance', {});
        pollTick();
      };
    }

    startLocalCountdown(v.phase_ends_at);
  }

  /* ══════════════════════════════════════════════════════════════
     PARTICIPANT (iPad / Smartphone / j.html)
     ══════════════════════════════════════════════════════════════ */

  function renderParticipant(v) {
    if (!root) return;
    const phase = v.phase || 'lobby';
    const me = v.me || {};

    if (me.nickname && !myNickname) myNickname = me.nickname;
    if (me.creature_id != null) myCreatureId = me.creature_id;
    if (me.skin_idx != null) mySkinIdx = me.skin_idx;

    let html = '<div class="ks-container">';
    html += renderParticipantTopBar(v);

    if (phase === 'lobby') {
      html += renderParticipantLobby(v);
    } else if (phase === 'question') {
      html += renderParticipantQuestion(v);
    } else if (phase === 'reveal') {
      html += renderParticipantReveal(v);
    } else if (phase === 'podium' || phase === 'ended') {
      html += renderParticipantPodium(v);
    }

    html += '</div>';
    root.innerHTML = html;
    bindParticipantEvents(v);
  }

  function renderParticipantTopBar(v) {
    const me = v.me || {};
    return `
      <div class="ks-topbar">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:800;font-size:15px;">${escapeHTML(me.nickname || 'Dein Avatar')}</span>
          <span class="ks-badge" style="background:#1e1b4b;color:#facc15;border-color:#facc15;padding:4px 8px;font-size:11px;">
            ${me.score || 0} Pkt
          </span>
        </div>
        <div>
          ${v.phase_ends_at ? `<span class="ks-badge ks-timer-pill" id="ks-live-timer">⏱️ ...</span>` : ''}
        </div>
      </div>
    `;
  }

  function renderParticipantLobby(v) {
    const creatures = window.KSCreatures ? window.KSCreatures.list : [];

    return `
      <div style="max-width:540px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:16px;">
        <div class="ks-card" style="padding:20px;text-align:center;">
          <h2 style="margin:0 0 12px 0;font-size:22px;font-weight:900;">Wähle deinen Avatar</h2>
          <div style="display:flex;justify-content:center;margin-bottom:12px;">
            <div id="ks-avatar-preview" style="background:#13141f;padding:12px;border-radius:24px;border:3px solid #facc15;">
              ${getCreatureSVG(myCreatureId, mySkinIdx, 'c-wave', 90)}
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <label style="font-size:13px;color:#94a3b8;font-weight:700;display:block;margin-bottom:4px;">Dein Nickname:</label>
            <input type="text" id="ks-inp-nick" value="${escapeHTML(myNickname)}" placeholder="Dein Name"
                   style="width:80%;max-width:260px;padding:10px 14px;border-radius:12px;border:2px solid #000;font-family:inherit;font-weight:700;font-size:15px;background:#0f172a;color:#fff;text-align:center;" />
          </div>

          <div style="margin-bottom:8px;">
            <span style="font-size:12px;color:#94a3b8;font-weight:700;">Wesen (1–36):</span>
            <div class="ks-picker-grid">
              ${creatures.map(c => `
                <div class="ks-picker-item ${c.id === myCreatureId ? 'active' : ''}" data-cid="${c.id}">
                  ${getCreatureSVG(c.id, mySkinIdx, 'c-idle', 44)}
                  <span style="font-size:10px;font-weight:700;margin-top:2px;">${c.name}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <span style="font-size:12px;color:#94a3b8;font-weight:700;">Farbschema:</span>
            <div style="display:flex;justify-content:center;gap:12px;margin-top:6px;">
              ${[0, 1, 2].map(s => `
                <button class="ks-btn ks-skin-btn ${s === mySkinIdx ? 'selected' : ''}" data-skin="${s}"
                        style="padding:6px 14px;font-size:12px;background:${s === mySkinIdx ? '#facc15' : '#1e293b'};color:${s === mySkinIdx ? '#000' : '#fff'};">
                  Skin ${s + 1}
                </button>
              `).join('')}
            </div>
          </div>

          <button id="ks-btn-save-profile" class="ks-btn" style="background:#10b981;color:#000;padding:12px 24px;font-size:15px;width:100%;">
            💾 Avatar speichern
          </button>
        </div>

        <!-- Emote-Bar -->
        <div style="text-align:center;">
          <span style="font-size:12px;color:#94a3b8;font-weight:700;">Sende ein Emote an die Tafel:</span>
          <div class="ks-emote-bar">
            <button class="ks-emote-btn" data-emote="wave">👋</button>
            <button class="ks-emote-btn" data-emote="dance">🕺</button>
            <button class="ks-emote-btn" data-emote="cheer">🎉</button>
            <button class="ks-emote-btn" data-emote="sleep">😴</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderParticipantQuestion(v) {
    const q = v.question || { text: '', options: [] };
    const options = Array.isArray(q.options) ? q.options : [];
    const myAns = v.my_answer;

    if (!questionStartTime) questionStartTime = Date.now();

    return `
      <div style="max-width:700px;margin:0 auto;width:100%;flex:1;display:flex;flex-direction:column;">
        <div class="ks-question-box" style="padding:16px 20px;margin-bottom:16px;">
          <h2 class="ks-question-text" style="font-size:22px;">${escapeHTML(q.text)}</h2>
        </div>

        ${myAns ? `
          <div class="ks-card-white" style="padding:20px;text-align:center;background:#1e1b4b;margin-bottom:16px;">
            <span style="font-size:32px;">🔒</span>
            <h3 style="margin:8px 0;font-size:18px;font-weight:900;color:#facc15;">Antwort eingeloggt!</h3>
            <p style="color:#94a3b8;font-size:13px;margin:0;">Warten auf die anderen Schüler...</p>
          </div>
        ` : ''}

        <div class="ks-answers-grid">
          ${options.map((opt, idx) => {
            const isSel = (myAns && myAns.chosen_idx === idx) || (selectedOption === idx);
            const isDis = !!myAns;
            return `
              <div class="ks-ans-card c-${idx} ${isSel ? 'selected' : ''} ${isDis ? 'disabled' : ''}" data-idx="${idx}">
                <span class="ks-ans-shape">${SHAPES[idx]}</span>
                <span style="flex:1;">${escapeHTML(opt)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderParticipantReveal(v) {
    const myAns = v.my_answer;
    const isCorrect = myAns && myAns.is_correct;
    const points = myAns ? myAns.points_awarded : 0;
    const me = v.me || {};

    return `
      <div style="max-width:540px;margin:20px auto;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div class="ks-card" style="padding:32px;width:100%;border-color:${isCorrect ? '#10b981' : '#ef4444'};box-shadow:8px 8px 0px 0px ${isCorrect ? '#10b981' : '#ef4444'};">
          ${getCreatureSVG(me.creature_id, me.skin_idx, isCorrect ? 'c-cheer' : 'c-sad', 110)}
          <h1 style="font-size:32px;font-weight:900;margin:16px 0 6px 0;color:${isCorrect ? '#34d399' : '#f87171'};">
            ${isCorrect ? '🎉 Richtig!' : '❌ Leider daneben!'}
          </h1>
          <p style="font-size:18px;font-weight:800;margin:0 0 12px 0;">
            ${isCorrect ? `+${points} Punkte verdient` : '0 Punkte'}
          </p>
          ${me.streak > 1 ? `
            <span class="ks-badge" style="background:#f97316;color:#fff;">
              🔥 ${me.streak}er Streak! (+${Math.round((me.streak * 10))}% Bonus)
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderParticipantPodium(v) {
    const me = v.me || {};
    const before = v.neighbor_before;
    const after = v.neighbor_after;
    const delta = me.rank_change || 0;
    const deltaClass = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'same');
    const deltaText = delta > 0 ? `▲ +${delta}` : (delta < 0 ? `▼ ${delta}` : '–');

    return `
      <div style="max-width:600px;margin:0 auto;width:100%;flex:1;display:flex;flex-direction:column;justify-content:space-between;">
        <div style="text-align:center;margin-top:10px;">
          <h2 style="font-size:26px;font-weight:900;margin:0;">Dein Rang</h2>
        </div>

        <div class="ks-my-rank-stage">
          <!-- Vorgänger (überholen!) -->
          ${before ? `
            <div class="ks-neighbor-card">
              <span style="font-size:12px;font-weight:700;color:#94a3b8;">#${before.rank} Vorgänger</span>
              ${getCreatureSVG(before.creature_id, before.skin_idx, 'c-idle', 50)}
              <span style="font-weight:700;font-size:12px;margin-top:4px;">${escapeHTML(before.nickname)}</span>
              <span style="font-size:11px;color:#94a3b8;">${before.score} Pkt</span>
            </div>
          ` : '<div style="flex:1;"></div>'}

          <!-- Ich (Mitte groß) -->
          <div class="ks-my-center-card">
            ${getCreatureSVG(me.creature_id, me.skin_idx, delta > 0 ? 'c-cheer' : 'c-idle', 96)}
            <h3 style="margin:8px 0 2px 0;font-size:22px;font-weight:900;color:#facc15;">#${me.rank} ${escapeHTML(me.nickname)}</h3>
            <span class="ks-podium-delta ${deltaClass}" style="margin-bottom:8px;">${deltaText} Plätze</span>
            <span class="ks-badge ks-timer-pill" style="font-size:14px;">${me.score} Pkt</span>
          </div>

          <!-- Nachfolger (Verfolger abwehren!) -->
          ${after ? `
            <div class="ks-neighbor-card">
              <span style="font-size:12px;font-weight:700;color:#94a3b8;">#${after.rank} Verfolger</span>
              ${getCreatureSVG(after.creature_id, after.skin_idx, 'c-idle', 50)}
              <span style="font-weight:700;font-size:12px;margin-top:4px;">${escapeHTML(after.nickname)}</span>
              <span style="font-size:11px;color:#94a3b8;">${after.score} Pkt</span>
            </div>
          ` : '<div style="flex:1;"></div>'}
        </div>

        <!-- Emote Bar -->
        <div style="text-align:center;margin-bottom:20px;">
          <span style="font-size:12px;color:#94a3b8;font-weight:700;">Reagiere mit deinem Avatar:</span>
          <div class="ks-emote-bar">
            <button class="ks-emote-btn" data-emote="cheer">🎉</button>
            <button class="ks-emote-btn" data-emote="dance">🕺</button>
            <button class="ks-emote-btn" data-emote="wave">👋</button>
            <button class="ks-emote-btn" data-emote="sleep">😴</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindParticipantEvents(v) {
    // Profil / Avatar Auswahl
    const pickerItems = root.querySelectorAll('.ks-picker-item');
    pickerItems.forEach(item => {
      item.onclick = () => {
        myCreatureId = parseInt(item.dataset.cid, 10);
        updateAvatarPreview();
        pickerItems.forEach(pi => pi.classList.remove('active'));
        item.classList.add('active');
      };
    });

    const skinBtns = root.querySelectorAll('.ks-skin-btn');
    skinBtns.forEach(btn => {
      btn.onclick = () => {
        mySkinIdx = parseInt(btn.dataset.skin, 10);
        updateAvatarPreview();
        skinBtns.forEach(sb => {
          sb.style.background = '#1e293b';
          sb.style.color = '#fff';
        });
        btn.style.background = '#facc15';
        btn.style.color = '#000';
      };
    });

    const btnSave = root.querySelector('#ks-btn-save-profile');
    if (btnSave) {
      btnSave.onclick = async () => {
        const inp = root.querySelector('#ks-inp-nick');
        myNickname = inp ? inp.value.trim() : myNickname;
        btnSave.disabled = true;
        btnSave.textContent = 'Wird gespeichert...';
        await ctx.actions.call('ks_join', {
          p_nickname: myNickname,
          p_creature: myCreatureId,
          p_skin: mySkinIdx
        });
        btnSave.textContent = '✅ Gespeichert!';
        setTimeout(() => { if (btnSave) btnSave.disabled = false; }, 1000);
      };
    }

    // Emotes senden
    const emoteBtns = root.querySelectorAll('.ks-emote-btn');
    emoteBtns.forEach(eb => {
      eb.onclick = async () => {
        const emote = eb.dataset.emote;
        eb.style.transform = 'scale(1.2)';
        setTimeout(() => { if (eb) eb.style.transform = ''; }, 200);
        await ctx.actions.call('ks_emote', { p_emote: emote });
      };
    });

    // Antwort abgeben
    const ansCards = root.querySelectorAll('.ks-ans-card:not(.disabled)');
    ansCards.forEach(card => {
      card.onclick = async () => {
        const idx = parseInt(card.dataset.idx, 10);
        selectedOption = idx;
        const responseMs = Date.now() - questionStartTime;
        ansCards.forEach(c => c.classList.add('disabled'));
        card.classList.add('selected');

        await ctx.actions.call('ks_answer', {
          p_question_idx: v.current_q_idx || 0,
          p_chosen: idx,
          p_response_ms: responseMs
        });
        pollTick();
      };
    });

    startLocalCountdown(v.phase_ends_at);
  }

  function updateAvatarPreview() {
    const prev = root.querySelector('#ks-avatar-preview');
    if (prev) {
      prev.innerHTML = getCreatureSVG(myCreatureId, mySkinIdx, 'c-wave', 90);
    }
  }

  /* ─── Lokaler Countdown-Timer ─── */
  function startLocalCountdown(phaseEndsAt) {
    if (localTimer) clearInterval(localTimer);
    if (!phaseEndsAt) return;

    const targetMs = new Date(phaseEndsAt).getTime();

    function tick() {
      const el = root ? root.querySelector('#ks-live-timer') : null;
      if (!el) return;
      const leftSec = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
      el.textContent = '⏱️ ' + leftSec + 's';
      if (leftSec <= 0) {
        clearInterval(localTimer);
        pollTick();
      }
    }

    tick();
    localTimer = setInterval(tick, 1000);
  }

  /* ─── Hilfsfunktionen ─── */
  function getEmoteChar(e) {
    switch (e) {
      case 'wave': return '👋';
      case 'dance': return '🕺';
      case 'cheer': return '🎉';
      case 'sleep': return '😴';
      case 'sad': return '😢';
      default: return '✨';
    }
  }

  function escapeHTML(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ══════════════════════════════════════════════════════════════
     WERKZEUG-SCHNITTSTELLE (lib/tool.js)
     ══════════════════════════════════════════════════════════════ */

  window.MPTool.register('knowledgestack', {
    mount: async function (el, context) {
      root = el;
      ctx = context;
      role = context.role;
      lastSig = null;
      lastView = null;
      busy = false;
      questionStartTime = 0;
      selectedOption = null;

      await ensureCreatures();

      pollTick();
      pollTimer = setInterval(pollTick, POLL_MS);
    },

    update: function (view) {
      // Host-Update triggert sofort einen frischen Poll
      pollTick();
    },

    unmount: function () {
      if (pollTimer) clearInterval(pollTimer);
      if (localTimer) clearInterval(localTimer);
      pollTimer = null;
      localTimer = null;
      root = null;
      ctx = null;
      role = null;
      lastSig = null;
      lastView = null;
    }
  });

})();
