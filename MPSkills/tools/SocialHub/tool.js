/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „YourSozialNet" (bis 0265 „Social Hub")  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Eine soziale Plattform im Stil von TikTok, an der die Klasse
   Datenbanken lernt (Migration 0262, Beta, nur für Admins sichtbar).
   Doku: tools/SocialHub/CLAUDE.md, Plan: MPSkills/PLAN_FEED_SKILL.md.

   Die App ist eine eigene Seite (index.html + js/ + css/) im
   <iframe>. Dieses Modul ist nur die Brücke, wie bei SQL Studio.
   postMessage nur gleicher Ursprung und nur dieser Rahmen:

     App → hier   sh:hello                 bin bereit, bitte Zustand
                  sh:call    {id, fn, args} → ctx.actions.call (nur sh_*)
                  sh:setData {id, data}     → ctx.actions.setData (nur Lehrkraft)
     hier → App   sh:state   {data}         skill_room_state.data
                  sh:result  {id, res}
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261104g';
  let root = null;
  let ctx = null;
  let view = null;
  let frame = null;
  let ready = false;
  let lastState = '';
  let onResize = null;
  let onMsg = null;

  const GAP = 12;
  const MIN = 560;

  const isPresenter = () => !!ctx && ctx.role === 'presenter';
  const data = () => (view && view.state && view.state.data) || {};

  // Platz unter dem Rahmen — dieselbe Rechnung wie tools/SQLStudio/tool.js.
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

  function post(msg) {
    if (!frame || !frame.contentWindow) return;
    try { frame.contentWindow.postMessage(msg, location.origin); } catch (e) { /* zu */ }
  }

  function pushState(force) {
    if (!ready) return;
    const s = JSON.stringify(data());
    if (!force && s === lastState) return;
    lastState = s;
    post({ type: 'sh:state', data: data() });
  }

  async function handle(ev) {
    if (!frame || ev.source !== frame.contentWindow || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || typeof m.type !== 'string' || m.type.indexOf('sh:') !== 0) return;
    if (m.type === 'sh:hello') { ready = true; pushState(true); return; }
    if (m.type === 'sh:call') {
      const res = /^sh_[a-z_]+$/.test(String(m.fn || ''))
        ? await ctx.actions.call(m.fn, m.args && typeof m.args === 'object' ? m.args : {})
        : { ok: false, error: 'not_allowed' };
      post({ type: 'sh:result', id: m.id, res });
      return;
    }
    if (m.type === 'sh:setData') {
      if (!isPresenter() || ctx.preview) { post({ type: 'sh:result', id: m.id, res: { ok: false, error: 'not_allowed' } }); return; }
      const next = m.data && typeof m.data === 'object' ? m.data : {};
      if (view) view.state = Object.assign({}, view.state || {}, { data: next });
      lastState = JSON.stringify(next);
      const res = await ctx.actions.setData(next);
      post({ type: 'sh:result', id: m.id, res });
      ctx.refresh();
    }
  }

  function build() {
    if (frame || !root) return;
    const code = (view && view.room && view.room.code) || 'RAUM';
    const src = ctx && ctx.preview
      ? 'tools/SocialHub/index.html?demo=1&v=' + V
      : 'tools/SocialHub/index.html?v=' + V +
        '&raum=' + encodeURIComponent(code) + '&rolle=' + (isPresenter() ? 'presenter' : 'participant');
    root.querySelector('.sh-host').innerHTML =
      '<iframe class="sh-frame" src="' + src + '" title="YourSozialNet" loading="eager" allow="camera"></iframe>';
    frame = root.querySelector('.sh-frame');
    fit();
    requestAnimationFrame(fit);
  }

  window.MPTool.register('socialhub', {

    // Was die Klasse bekommt (Tabellen, Upload), stellt die Lehrkraft IM Raum ein.
    settingsFields: [],

    mount(el, context) {
      root = el;
      ctx = context;
      view = null;
      frame = null;
      ready = false;
      lastState = '';
      root.innerHTML = '<div class="sh-host"></div>';
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');
      onResize = () => fit();
      window.addEventListener('resize', onResize);
      onMsg = (ev) => { handle(ev); };
      window.addEventListener('message', onMsg);
      if (ctx && ctx.preview) build();
    },

    update(v) {
      view = v;
      build();
      pushState(false);
    },

    unmount() {
      if (onResize) window.removeEventListener('resize', onResize);
      if (onMsg) window.removeEventListener('message', onMsg);
      onResize = null;
      onMsg = null;
      document.body.classList.remove('tool-fill');
      frame = null;
      root = null;
      ctx = null;
      view = null;
    }
  });
})();
