/* ══════════════════════════════════════════════════════════════
   MPSkills — derby.js   ·   Stapel-Editor ohne Raum
   ══════════════════════════════════════════════════════════════
   Die Definitions-Derby-Kachel hat neben „+ Raum öffnen" einen
   zweiten Knopf: „Stapel-Editor". Er führt hierher. Wer eine Stunde
   vorbereitet, will Begriffe und Definitionen schreiben, ohne dafür
   einen Raum aufzumachen, in dem dann niemand sitzt.

   Die Oberfläche ist dieselbe wie im Raum (tools/DefinitionsDerby/
   tool.js) — hier steht nur der Gastgeber: Anmeldung, Serveraufrufe
   ohne Raum-Code und die Kennzeichnung ctx.standalone (kein Teilen,
   das passiert im Raum). Die Stapel liegen am Konto (dd_stacks,
   Migration 0233) und stehen deshalb in jedem Raum der Lehrkraft.

   Serveraufrufe: dieselben dd_*-Funktionen wie im Raum, mit
   p_code = null (sie gehören der Person, nicht dem Raum).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  let toastTimer = null;
  function toast(message, err) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
  }

  /* Wie quiz.js: der Access-Token wird bei JEDEM Aufruf frisch gelesen,
     Fehler kommen als { ok:false, error } zurück, nie als Ausnahme. */
  async function call(fn, args) {
    try {
      const token = window.__accessToken;
      if (!token) return { ok: false, error: 'not_authenticated' };
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(Object.assign({ p_code: null }, args || {}))
      });
      if (!res.ok) {
        console.warn('[derby]', fn, res.status, (await res.text()).slice(0, 200));
        return { ok: false, error: res.status === 404 ? 'fn_missing' : 'server_error', fn };
      }
      const r = await res.json();
      return (r && typeof r === 'object') ? r : { ok: false, error: 'bad_response' };
    } catch (e) {
      console.warn('[derby]', fn, e && e.message);
      return { ok: false, error: 'network' };
    }
  }

  function hinweis(titel, text) {
    const host = $('derbyHost');
    host.classList.add('wrap--narrow');
    host.innerHTML = `<div class="card card--join">
        <h1 class="join-h">${titel}</h1>
        <p class="join-sub">${text}</p>
        <a class="btn btn--primary btn--wide" href="index.html">Zu MPSkills</a>
      </div>`;
  }

  async function start() {
    const host = $('derbyHost');
    host.innerHTML = '';
    try { await window.MPTool.load('derby', 'DefinitionsDerby'); }
    catch (e) { hinweis('Nicht geladen', 'Der Stapel-Editor ließ sich nicht laden. Lade die Seite neu.'); return; }

    const impl = window.MPTool.get('derby');
    const noop = () => Promise.resolve({ ok: false, error: 'not_allowed' });
    const actions = {
      role: 'presenter', call,
      upsert: noop, remove: noop, vote: noop, move: noop, hide: noop,
      setPhase: noop, setData: noop, reset: noop
    };
    const ctx = window.MPTool.makeCtx({
      actions, title: 'Stapel-Editor',
      toast: m => toast(m),
      confirm: m => Promise.resolve(window.confirm(m))
    });
    ctx.standalone = true;
    impl.mount(host, ctx);
    window.addEventListener('pagehide', () => impl.unmount());
  }

  (async function boot() {
    window.MPUserBar?.mount();
    await (window.waitForSession?.() ?? Promise.resolve());
    const s = window.getSessionUser?.();

    if (!s) {
      hinweis('Bitte anmelden', 'Stapel legt an, wer als Lehrkraft angemeldet ist.');
      return;
    }
    if (!(s.is_admin || s.is_superadmin) && s.teacher_status !== 'approved') {
      hinweis('Noch nicht freigeschaltet', 'Für MPSkills bist du noch nicht als Lehrkraft freigeschaltet.');
      return;
    }
    await start();
  })();
})();
