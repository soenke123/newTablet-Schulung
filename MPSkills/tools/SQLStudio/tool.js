/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „SQL Studio"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Ein Datenbank-Werkzeug wie phpMyAdmin, entschlackt für die Schule
   (Migrationen 0220/0221, Beta, nur für Admins sichtbar).

   Die Anwendung ist eine eigene Seite (index.html + js/ + css/) und
   steckt in einem <iframe>. Die Datenbanken laufen als SQLite im
   Browser (sql.js im Web Worker), der Server führt kein SQL aus.

   Dieses Modul ist nur die Brücke — die ganze Logik steht in der App
   (js/app.js). Über postMessage, nur gleicher Ursprung, nur dieser
   Rahmen:

     App → hier   sqls:hello                 bin bereit, bitte Zustand
                  sqls:call    {id, fn, args} → ctx.actions.call (nur sql_*)
                  sqls:setData {id, data}     → ctx.actions.setData (nur Lehrkraft)
     hier → App   sqls:state   {data}         skill_room_state.data, bei jeder Änderung
                  sqls:result  {id, res}

   Der Rahmen entsteht erst mit dem ersten update() (wie bei SYNIR):
   seine Adresse trägt den Raumcode, und den kennt erst die view.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261023b';
  let root = null;
  let ctx = null;
  let view = null;
  let frame = null;
  let ready = false;
  let lastState = '';
  let onResize = null;
  let onMsg = null;

  const GAP = 12;
  const MIN = 520;     // darunter wird die Werkbank zu eng

  const isPresenter = () => !!ctx && ctx.role === 'presenter';
  const data = () => (view && view.state && view.state.data) || {};

  /* Platz unter dem Rahmen — dieselbe Rechnung wie in
     tools/NeuroLab/tool.js (Begründung dort). */
  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight
             + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fit() {
    if (!frame) return;
    const top = frame.getBoundingClientRect().top;
    const h = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP);
    frame.style.height = h + 'px';
  }

  function post(msg) {
    if (!frame || !frame.contentWindow) return;
    try { frame.contentWindow.postMessage(msg, location.origin); } catch (e) { /* zu */ }
  }

  /* Den Zustand nur schicken, wenn er sich geändert hat — update()
     kommt bei jedem Takt, die App soll nicht jedes Mal neu zeichnen. */
  function pushState(force) {
    if (!ready) return;
    const s = JSON.stringify(data());
    if (!force && s === lastState) return;
    lastState = s;
    post({ type: 'sqls:state', data: data() });
  }

  async function handle(ev) {
    if (!frame || ev.source !== frame.contentWindow || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || typeof m.type !== 'string' || m.type.indexOf('sqls:') !== 0) return;
    if (m.type === 'sqls:hello') { ready = true; pushState(true); return; }
    if (m.type === 'sqls:call') {
      // Nur die eigenen Aufrufe dieses Skills, keine anderen RPCs.
      const res = /^sql_[a-z_]+$/.test(String(m.fn || ''))
        ? await ctx.actions.call(m.fn, m.args && typeof m.args === 'object' ? m.args : {})
        : { ok: false, error: 'not_allowed' };
      post({ type: 'sqls:result', id: m.id, res });
      return;
    }
    if (m.type === 'sqls:setData') {
      if (!isPresenter() || ctx.preview) { post({ type: 'sqls:result', id: m.id, res: { ok: false, error: 'not_allowed' } }); return; }
      const next = m.data && typeof m.data === 'object' ? m.data : {};
      // Gleich lokal einsetzen, damit der nächste Takt nicht das Alte
      // zurückschickt, bevor der Server geantwortet hat.
      if (view) view.state = Object.assign({}, view.state || {}, { data: next });
      lastState = JSON.stringify(next);
      const res = await ctx.actions.setData(next);
      post({ type: 'sqls:result', id: m.id, res });
      ctx.refresh();
    }
  }

  function build() {
    if (frame || !root) return;
    const code = (view && view.room && view.room.code) || (ctx && ctx.preview ? 'VORSCHAU' : 'RAUM');
    const src = 'tools/SQLStudio/index.html?v=' + V +
      '&raum=' + encodeURIComponent(code) + '&rolle=' + (isPresenter() ? 'presenter' : 'participant');
    root.querySelector('.sqls-host').innerHTML =
      '<iframe class="sqls-frame" src="' + src + '" title="SQL Studio" loading="eager"></iframe>';
    frame = root.querySelector('.sqls-frame');
    fit();
    requestAnimationFrame(fit);
  }

  window.MPTool.register('sqlstudio', {

    /* Nichts beim Anlegen abzufragen: was die Klasse bekommt,
       entscheidet die Lehrkraft IM Raum (Teilen, Rechte). */
    settingsFields: [],

    mount(el, context) {
      root = el;
      ctx = context;
      view = null;
      frame = null;
      ready = false;
      lastState = '';
      root.innerHTML = '<div class="sqls-host"></div>';
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
