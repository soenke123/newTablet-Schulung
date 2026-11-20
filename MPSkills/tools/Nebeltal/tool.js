/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Nebeltal"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Prototyp (Migration 0290, nur für Admins sichtbar): Wie lernt ein
   neuronales Netz? Man sucht im Nebel den tiefsten Punkt einer 3D-
   Landschaft und sieht nur die Stelle, an der man steht.

   Eingerahmt wie Reinforce Yourself: die Anwendung ist eine eigene
   Seite (index.html, labor.html, erarbeitung.html) im <iframe>. Diese
   Datei ist nur die Brücke zum Raum (Gegenstück: js/raum.js):

   · Freigaben (Migration 0290, ohne Tabelle): skill_room_state.data.levels
     = [1, 2, 'erarb', 8 …], gesetzt von der Lehrkraft über das
     Teilen-Symbol an der Kachel. Fehlt = nichts freigegeben.
   · Ansicht der Übersicht (ohne Migration, 19.11.2026): data.view =
     'pfad' (Lernpfad, Vorgabe) | 'frei' (freie Nutzung), die Lehrkraft
     schaltet um, die Tablets folgen.
   · Profilbilder (Migration 0299): ein geschafftes Level meldet die Seite
     mit fn 'earn' → nt_earn (Tablet) bzw. nt_room_earn (Lehrkraft).
   · Gemeinsam spielen (Migration 0296): data.mp = 1 setzt der Server
     (nt_room_act 'on'/'off'). Danach fragt die Seite im Rahmen selbst
     nach (nt_play bzw. nt_room_get/nt_room_act) – über diese Brücke,
     weil nur der Rahmen Token bzw. Raum-Code kennt.

     hinein   { type: 'nt:cmd', levels, mp, view }
     heraus   { type: 'nt:ready' } · { type: 'nt:levels', levels } · { type: 'nt:view', view }
              { type: 'nt:rpc', id, fn: 'play'|'get'|'act', args }
     zurück   { type: 'nt:res', id, res }

   Im Schaufenster (?demo=1) ist alles offen und es gibt keinen Raum.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261120b';
  let root = null, frame = null, ctx = null, view = null, onResize = null, onMsg = null;
  let ready = false, lastSent = '', levels = null, vw = null;

  const GAP = 12, MIN = 460;
  const isPresenter = () => !!ctx && ctx.role === 'presenter';
  const data = () => (view && view.state && view.state.data) || {};
  const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 'erarb'];
  const norm = list => KEYS.filter(k => (list || []).some(x => String(x) === String(k)));
  const serverLevels = () => Array.isArray(data().levels) ? norm(data().levels) : [];
  const currentLevels = () => levels || serverLevels();

  function post(force) {
    if (!ready || !frame || !frame.contentWindow) return;
    const msg = { type: 'nt:cmd', levels: currentLevels(), mp: data().mp ? 1 : 0, view: vw || (data().view === 'frei' ? 'frei' : 'pfad') };
    const key = JSON.stringify(msg);
    if (key === lastSent && !force) return;
    lastSent = key;
    try { frame.contentWindow.postMessage(msg, location.origin); } catch (e) { /* zu */ }
  }

  /* skill_room_set_state ersetzt `data` als GANZES – darum geht der ganze
     Stand hinaus (mp bleibt so, wie der Server es zuletzt gesagt hat). */
  async function setPatch(patch) {
    if ('levels' in patch) levels = patch.levels;
    if ('view' in patch) vw = patch.view;
    post();
    const next = Object.assign({}, data(), patch);
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    const res = await ctx.actions.setData(next);
    if (res && !res.ok && res.error !== 'network') ctx.toast(ctx.errText(res.error));
    levels = null; vw = null;
    ctx.refresh();
  }
  const setLevels = list => setPatch({ levels: list });

  async function rpc(m) {
    const a = m.args || {};
    let res;
    if (!ctx || ctx.preview) res = { ok: false, error: 'no_room' };
    else if (m.fn === 'play' && !isPresenter()) res = await ctx.actions.call('nt_play', { p: a.p || {} });
    else if (m.fn === 'get' && isPresenter()) res = await ctx.actions.call('nt_room_get', {});
    else if (m.fn === 'act' && isPresenter()) res = await ctx.actions.call('nt_room_act', { p_act: String(a.act || ''), p_args: a.args || {} });
    else if (m.fn === 'earn') {
      // Level geschafft → Profilbilder (Migration 0299); neue Bilder: Hinweis + Punkt am Profilbild
      const lv = Math.round(+a.level) || 0;
      res = await ctx.actions.call(isPresenter() ? 'nt_room_earn' : 'nt_earn', { p_level: lv });
      if (res && res.ok && Array.isArray(res.new) && res.new.length) {
        ctx.toast(res.new.length === 1 ? 'Neues Profilbild freigeschaltet!' : res.new.length + ' neue Profilbilder freigeschaltet!');
        if (window.loadMpskillsUnlocks) window.loadMpskillsUnlocks();
      }
    }
    else res = { ok: false, error: 'not_allowed' };
    // Gemeinsam-Signal geändert (an/aus): sofort den Raum nachladen statt bis zum nächsten Takt
    if (m.fn === 'act' && (a.act === 'on' || a.act === 'off') && res && res.ok) {
      const d = Object.assign({}, data(), { mp: a.act === 'on' ? 1 : 0 });
      if (view) view.state = Object.assign({}, view.state || {}, { data: d });
      ctx.refresh();
    }
    if (frame && frame.contentWindow) {
      try { frame.contentWindow.postMessage({ type: 'nt:res', id: m.id, res }, location.origin); } catch (e) { /* zu */ }
    }
  }

  // Platz unter dem Rahmen — dieselbe Rechnung wie in tools/NeuroLab/tool.js
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

  window.MPTool.register('nebeltal', {
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c; ready = false; lastSent = '';
      const q = ctx && ctx.preview ? '?demo=1&v=' + V
              : '?raum=' + (isPresenter() ? 'lehrer' : 'schueler') + '&v=' + V;
      root.innerHTML =
        '<div class="nt-host">' +
          '<iframe class="nt-frame" src="tools/Nebeltal/index.html' + q + '" ' +
                  'title="Nebeltal" loading="eager" allow="fullscreen"></iframe>' +
        '</div>';
      frame = root.querySelector('.nt-frame');
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');
      onMsg = (e) => {
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
        const m = e.data || {};
        if (m.type === 'nt:ready') { ready = true; post(true); }
        else if (m.type === 'nt:levels' && isPresenter() && !ctx.preview && Array.isArray(m.levels)) setLevels(norm(m.levels));
        else if (m.type === 'nt:view' && isPresenter() && !ctx.preview) setPatch({ view: m.view === 'frei' ? 'frei' : 'pfad' });
        else if (m.type === 'nt:rpc' && m.id) rpc(m);
      };
      window.addEventListener('message', onMsg);
      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();
      requestAnimationFrame(fit);
    },

    update(v) {
      view = v;
      post();
    },

    unmount() {
      if (onMsg) window.removeEventListener('message', onMsg);
      if (onResize) window.removeEventListener('resize', onResize);
      onMsg = onResize = null;
      document.body.classList.remove('tool-fill');
      frame = root = ctx = view = null;
      levels = null; vw = null;
    }
  });
})();
