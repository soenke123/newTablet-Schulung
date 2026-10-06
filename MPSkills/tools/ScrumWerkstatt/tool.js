/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Scrum Werkstatt"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Neunter Skill (Migration 0196). Ein Raum ist EIN Scrum-Team, das
   darin über Wochen sein Projekt organisiert.

   ── Warum ein <iframe> ────────────────────────────────────────
   Die Werkstatt ist als eigene, vollständige Seite entstanden
   (index.html, ~2.500 Zeilen) mit eigenem Kopf, eigenen Reitern und
   einem Stylesheet, das auf body, header und main geht. Dieselbe
   Abwägung wie bei NeuroLab: der Rahmen isoliert CSS und JS, und die
   Seite bleibt eine Datei, die man auch allein öffnen kann (dann
   speichert sie im localStorage, wie der Prototyp).

   ── Wer was macht ─────────────────────────────────────────────
   Dieses Modul: Rahmen einhängen und messen, den Stand vom Server
   holen (eigener Takt: scrum_sig → scrum_view bzw. scrum_room_sig →
   scrum_room_get) und in den Rahmen reichen, Aufrufe aus dem Rahmen
   an den Server weitergeben. Token bzw. Raum-Code hängt
   ctx.actions.call an — der Rahmen kennt keinen von beiden.

   bridge.js im Rahmen: aus der Ansicht das S-Objekt des Prototyps
   bauen, Änderungen als Liste nach oben schicken.

   ── Nur geänderte Objekte über das Netz ───────────────────────
   scrum_view nimmt p_have ({ "story:u3": 4, … }) und lässt bei allem,
   was das Gerät schon in dieser Version hat, die Daten weg. Das hier
   gemerkte `cache` füllt sie wieder auf, bevor die Ansicht in den
   Rahmen geht — die Bilder im Product Goal wandern so nur einmal.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Welche Aufrufe der Rahmen auslösen darf. Ein Rahmen ist derselbe
     Ursprung und eigentlich vertrauenswürdig — die Liste ist trotzdem
     da, damit ein Fehler im Rahmen nicht irgendeine RPC erreicht. */
  const ALLOWED = {
    participant: ['scrum_save', 'scrum_enter', 'scrum_member_update'],
    presenter:   ['scrum_room_save', 'scrum_room_member_update', 'scrum_room_rekey',
                  'scrum_room_restore', 'scrum_room_backups', 'scrum_room_backup_get']
  };

  const GAP = 12;
  const MIN = 460;

  let root = null, frame = null, ctx = null, role = null;
  let ready = false, destroyed = false, busy = false;
  let lastSig = null, pollTimer = null, onResize = null, onMsg = null;
  let cache = {};          // 'story:u3' → { v, data }
  let lastView = null;

  /* ─── Rahmenhöhe (wie NeuroLab) ─────────────────────────── */
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

  function fit() {
    if (!frame) return;
    const top = frame.getBoundingClientRect().top;
    frame.style.height = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP) + 'px';
  }

  /* ─── Zum Rahmen ────────────────────────────────────────── */
  function post(msg) {
    if (!frame || !frame.contentWindow) return;
    try { frame.contentWindow.postMessage(Object.assign({ sw: 1 }, msg), location.origin); } catch (e) { /* zu */ }
  }

  /* ─── Eigener Takt ──────────────────────────────────────── */
  async function tick(force) {
    if (destroyed || busy || !ready) return;
    if (!force && document.hidden) return;
    busy = true;
    try {
      const presenter = role === 'presenter';
      const s = await ctx.actions.call(presenter ? 'scrum_room_sig' : 'scrum_sig', {});
      if (destroyed || !s || !s.ok) return;
      if (s.sig === lastSig && !force) return;

      const have = {};
      Object.keys(cache).forEach(k => { have[k] = cache[k].v; });
      const v = await ctx.actions.call(presenter ? 'scrum_room_get' : 'scrum_view', { p_have: have });
      if (destroyed) return;
      if (!v || !v.ok) {
        // 404: Die Migration fehlt. Das muss die Lehrkraft sehen, sonst
        // steht ein leeres Board da und niemand weiß, warum.
        if (v && v.error === 'fn_missing') ctx.toast(ctx.errText('fn_missing'), true);
        return;
      }
      lastSig = s.sig;

      const next = {};
      v.items = (v.items || []).map(it => {
        const k = it.kind + ':' + it.id;
        if (it.data === undefined && cache[k] && cache[k].v === it.v) it = Object.assign({}, it, { data: cache[k].data });
        if (it.data !== undefined) next[k] = { v: it.v, data: it.data };
        return it;
      });
      cache = next;
      lastView = v;
      post({ type: 'view', view: v });
    } finally {
      busy = false;
    }
  }

  async function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.sw !== 1) return;

    if (m.type === 'ready') {
      ready = true;
      lastSig = null;
      // Nach einem Neuladen des Rahmens hat er nichts — also alles
      // schicken, nicht nur, was sich seit dem letzten Takt geändert hat.
      if (lastView) post({ type: 'view', view: lastView });
      tick(true);
      return;
    }
    if (m.type === 'refresh') { lastSig = null; tick(true); return; }
    if (m.type === 'call') {
      const ok = (ALLOWED[role] || []).includes(m.fn);
      const res = ok ? await ctx.actions.call(m.fn, m.args || {})
                     : { ok: false, error: role === 'presenter' ? 'read_only' : 'not_allowed' };
      post({ type: 'reply', rid: m.rid, res });
    }
  }

  window.MPTool.register('scrum', {

    // Ein Team-Raum braucht keine Einstellungen beim Öffnen: Product
    // Goal, Sprints und Rollen trägt das Team selbst ein.
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c; role = c.role; destroyed = false;

      // Im Schaufenster ohne Raum: das Beispielprojekt, und nichts
      // bleibt hängen (?demo=1, siehe bridge.js).
      const q = (ctx.preview ? '?demo=1&' : '?') + 'v=20261007';
      root.innerHTML =
        '<div class="sw-host">' +
          '<iframe class="sw-frame" src="tools/ScrumWerkstatt/index.html' + q + '" ' +
                  'title="Scrum Werkstatt" loading="eager"></iframe>' +
        '</div>';
      frame = root.querySelector('.sw-frame');

      if (!ctx.preview) {
        document.body.classList.add('tool-fill');
        onMsg = onMessage;
        window.addEventListener('message', onMsg);
        pollTimer = setInterval(() => tick(false), 4000);
      }

      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();
      requestAnimationFrame(fit);
    },

    // Der Seiten-Poller (skill_view) meldet sich, wenn sich im Raum
    // etwas tut — ein billiger Anstoß für den eigenen Takt.
    update() { tick(false); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (onResize) window.removeEventListener('resize', onResize);
      if (onMsg) window.removeEventListener('message', onMsg);
      document.body.classList.remove('tool-fill');
      pollTimer = onResize = onMsg = null;
      frame = root = ctx = role = null;
      ready = false; busy = false; lastSig = null; cache = {}; lastView = null;
    }
  });
})();
