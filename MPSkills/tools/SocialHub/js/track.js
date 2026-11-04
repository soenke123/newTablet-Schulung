/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/track.js   ·   Analytics / Tracking (0270)
   ══════════════════════════════════════════════════════════════
   Läuft, sobald die Lehrkraft die Tabelle sessions erstellt hat – wie
   auf einer echten Seite: kein Banner, kein Haken für die Schüler. Der
   Browser sammelt Ereignisse und schickt sie alle 10 s gebündelt an
   sh_track (ein Aufruf). Beim ersten Mal legt der Server die Session an
   und gibt eine id (vsid) zurück, die danach mitgeschickt wird.

   Ohne Fragen (Tabelle sessions): IP, Browser, Betriebssystem, Gerät,
   Bildschirm, Sprache, Zeitzone, Hell/Dunkel. Tabelle views: jedes Foto
   mit Verweildauer.

   Standort, Kamera, Mikrofon, Benachrichtigungen: NUR NACHGEBAUT. Ein
   Fenster wie beim Browser fragt „Zulassen / Blockieren“; gespeichert
   wird, was angeklickt wurde. Der Browser selbst wird nie gefragt, es
   wird nichts gemessen oder aufgenommen. Die Antwort merkt sich das
   Gerät je User (wie echte Seiten), gefragt wird also nur einmal.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const FLUSH_MS = 10000;      // alle 10 s senden
  const NOTIF_AFTER = 30000;   // Benachrichtigungen erst nach 30 s fragen

  let call = null;             // (fn, args) → Promise, mit p_hub/p_session gebunden (hcall)
  let running = false;
  let vsid = null;             // Session-id vom Server
  let ip = undefined;          // einmal geholt (null = keine)
  let device = null;
  const perms = { location: null, camera: null, microphone: null, notifications: null };
  let views = [];              // Warteschlange
  let flushT = null, notifT = null;
  let sending = false;
  let permKey = null;          // Gerät + Netzwerk + User: dort liegen die Antworten
  let netName = '';
  const queue = [];            // wartende Abfragen (immer nur eine sichtbar)
  let popEl = null;

  /* ── Gerät erkennen (grob, aus dem User-Agent) ──────────────── */
  function readDevice() {
    const ua = navigator.userAgent || '';
    let os = 'unbekannt', browser = 'unbekannt', dev = '', type = 'desktop';
    let m;
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) { os = 'iPadOS'; dev = 'iPad'; type = 'tablet'; }
    else if (/iPhone/.test(ua)) { os = 'iOS'; dev = 'iPhone'; type = 'phone'; }
    else if ((m = /Android[ /]?([0-9.]+)?/.exec(ua))) { os = 'Android' + (m[1] ? ' ' + m[1] : ''); type = /Mobile/.test(ua) ? 'phone' : 'tablet';
      const d = /;\s?([^;)]+)\s+Build/.exec(ua) || /Android[^;]*;\s?([^;)]+)\)/.exec(ua); if (d) dev = d[1].trim(); }
    else if ((m = /Windows NT ([0-9.]+)/.exec(ua))) { os = m[1] === '10.0' ? 'Windows 10/11' : 'Windows'; }
    else if (/Mac OS X/.test(ua)) { os = 'macOS'; }
    else if (/Linux/.test(ua)) { os = 'Linux'; }
    if ((m = /Edg\/([0-9.]+)/.exec(ua))) browser = 'Edge ' + m[1].split('.')[0];
    else if ((m = /OPR\/([0-9.]+)/.exec(ua))) browser = 'Opera ' + m[1].split('.')[0];
    else if ((m = /Firefox\/([0-9.]+)/.exec(ua))) browser = 'Firefox ' + m[1].split('.')[0];
    else if ((m = /Chrome\/([0-9.]+)/.exec(ua))) browser = 'Chrome ' + m[1].split('.')[0];
    else if ((m = /Version\/([0-9.]+).*Safari/.exec(ua))) browser = 'Safari ' + m[1].split('.')[0];
    else if (/Safari/.test(ua)) browser = 'Safari';
    let conn = null;
    try { const c = navigator.connection; if (c && c.effectiveType) conn = c.effectiveType; } catch (e) { /* egal */ }
    return {
      user_agent: ua.slice(0, 400),
      browser, os, device: dev || null, device_type: type,
      screen_width: window.screen ? window.screen.width : null,
      screen_height: window.screen ? window.screen.height : null,
      pixel_ratio: Math.round((window.devicePixelRatio || 1) * 10) / 10,
      language: navigator.language || null,
      timezone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })(),
      dark_mode: !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches),
      connection: conn
    };
  }

  /* ── Nachgebaute „Zulassen?“-Abfragen ───────────────────────── */
  const ASK = {
    location:      { ic: '<svg viewBox="0 0 24 24"><path d="M12 21.5s-6.5-6.2-6.5-11.5a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11.5-6.5 11.5z"/><circle cx="12" cy="10" r="2.4"/></svg>', t: 'Deinen Standort verwenden' },
    notifications: { ic: '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>', t: 'Dir Benachrichtigungen senden' },
    camera:        { ic: '<svg viewBox="0 0 24 24"><path d="M4.5 7.5h3l1.5-2.5h6l1.5 2.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="12" cy="13" r="3.5"/></svg>', t: 'Deine Kamera verwenden' },
    microphone:    { ic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>', t: 'Dein Mikrofon verwenden' }
  };
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const store = () => { try { return window.localStorage; } catch (e) { return null; } };
  function loadAnswers() {
    try { const st = store(), v = st && JSON.parse(st.getItem(permKey) || '{}'); if (v) Object.assign(perms, v); } catch (e) { /* egal */ }
  }
  function saveAnswers() {
    try { const st = store(); if (st) st.setItem(permKey, JSON.stringify(perms)); } catch (e) { /* egal */ }
  }
  // Abfrage stellen (einmal je User und Gerät). Antwort → Haken, sonst nichts.
  function ask(kind) {
    if (!running || perms[kind] != null || queue.indexOf(kind) >= 0) return;
    queue.push(kind);
    if (!popEl) showNext();
  }
  function showNext() {
    const kind = queue[0];
    if (!kind || !running) { popEl = null; return; }
    const a = ASK[kind];
    popEl = document.createElement('div');
    popEl.className = 'perm-pop';
    popEl.setAttribute('role', 'dialog');
    popEl.innerHTML = '<div class="pp-h"><b>' + esc(netName || 'Dieses Netzwerk') + '</b> möchte</div>' +
      '<div class="pp-what">' + a.ic + '<span>' + a.t + '</span></div>' +
      '<div class="pp-acts"><button type="button" data-pp="0">Blockieren</button><button type="button" data-pp="1" class="pp-ok">Zulassen</button></div>';
    popEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pp]');
      if (!b) return;
      perms[kind] = b.dataset.pp === '1';
      saveAnswers();
      queue.shift();
      popEl.remove();
      popEl = null;
      flush(false);
      setTimeout(showNext, 700);
    });
    document.body.appendChild(popEl);
  }
  function clearPop() { queue.length = 0; if (popEl) popEl.remove(); popEl = null; }

  async function getIp() {
    if (ip !== undefined) return ip;
    ip = null;
    try { const r = await fetch('/api/my_ip'); if (r.ok) { const j = await r.json(); ip = j && j.ip ? String(j.ip).slice(0, 45) : null; } } catch (e) { ip = null; }
    return ip;
  }

  /* ── Senden ─────────────────────────────────────────────────── */
  // force: auch nach stop() noch einmal senden (Session-Ende)
  async function flush(end, force) {
    const c = call;
    if ((!running && !force) || sending || !c) return;
    sending = true;
    const batch = views; views = [];
    try {
      const ipNow = vsid == null ? await getIp() : null;
      const r = await c('sh_track', {
        p_vsid: vsid,
        p_device: vsid == null ? device : null,            // Gerät nur beim Anlegen
        p_perms: Object.assign({}, perms),
        p_views: batch,
        p_end: !!end,
        p_ip: ipNow
      });
      if (r && r.ok) {
        if (r.tracked === false) { stop(true); return; }   // sessions entzogen → aufhören
        if (r.vsid != null) vsid = r.vsid;
      } else {
        views = batch.concat(views);                        // nicht angekommen: zurück in die Schlange
      }
    } catch (e) {
      views = batch.concat(views);
    } finally { sending = false; }
  }

  function schedule() {
    clearTimeout(flushT);
    flushT = setTimeout(() => { flush(false).finally(schedule); }, FLUSH_MS);
  }

  const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
  const onBye = () => { flush(true); };

  /* ── Öffentlich ─────────────────────────────────────────────── */
  // key = Netzwerk + User (die Antworten gelten je User), name = Netzwerkname im Fenster
  async function start(hcall, key, name) {
    const pk = 'sh.perm.' + ((window.SHApi && window.SHApi.CODE) || '') + '.' + (key || '');
    if (running && pk === permKey) { call = hcall; return; }
    if (running) stop();
    call = hcall;
    running = true;
    permKey = pk;
    netName = name || '';
    vsid = null;
    views = [];
    Object.keys(perms).forEach(k => { perms[k] = null; });
    loadAnswers();
    device = readDevice();
    await flush(false);                 // legt die Session an (vsid)
    if (!running) return;
    clearTimeout(notifT);
    setTimeout(() => ask('location'), 2500);                 // kurz nach dem Start: Standort
    notifT = setTimeout(() => ask('notifications'), NOTIF_AFTER);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onBye);
    schedule();
  }

  function stop(hard) {
    if (!running) return;
    running = false;
    clearTimeout(flushT); clearTimeout(notifT);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onBye);
    clearPop();
    if (!hard && vsid != null) flush(true, true);       // Session-Ende melden (call wird vorher festgehalten)
    call = null;
  }

  // Ein angesehenes Foto. ms = wie lange im Bild, feed = foryou|following|…
  function view(photo, ms, feed, pos, endedBy) {
    if (!running || !photo || ms < 300) return;            // Kurzflüge (<0,3 s) zählen nicht
    views.push({ photo: String(photo), ms: Math.round(ms), feed: feed || null, pos: pos == null ? null : pos, end: endedBy || 'swipe' });
    if (views.length >= 50) flush(false);
  }

  window.SHTrack = {
    start, stop, view, isOn: () => running,
    askCamera: () => ask('camera'),         // beim Öffnen von ＋
    askMic: () => ask('microphone')         // beim Posten
  };
})();
