/* ══════════════════════════════════════════════════════════════
   MPSkills — quiz.js   ·   Quiz-Editor ohne Raum
   ══════════════════════════════════════════════════════════════
   Die Knowledge-Stack-Kachel hat neben „+ Raum öffnen" einen
   zweiten Knopf: „Quiz-Editor". Er führt hierher. Wer eine Stunde
   vorbereitet, will seine Fragen schreiben, ohne dafür einen Raum
   aufzumachen, in dem dann niemand sitzt.

   Der Editor selbst ist derselbe wie im Raum (editor.js,
   KSEditor.create) — hier steht nur der Gastgeber: Anmeldung,
   Serveraufrufe ohne Raum-Code, und wohin „Zurück" führt. Die
   Kataloge liegen ohnehin unabhängig vom Raum (ks_catalogs, 0174);
   was hier gespeichert wird, steht im Raum in der Lobby zur Wahl.

   Serveraufrufe: die Fassungen OHNE p_code (0176/0186/0194) —
   ks_catalogs_list, ks_catalog_get, ks_catalog_save,
   ks_catalog_delete, ks_catalog_set_visibility, ks_catalog_peek,
   ks_catalog_thumbs. Alle prüfen selbst auf auth.uid(): ändern und
   löschen nur Eigenes, Vorlagen werden als Kopie gespeichert.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const EIGENE = {
    title_required: 'Bitte einen Titel eingeben.',
    not_found:      'Dieses Quiz gibt es nicht (mehr) — oder es gehört jemand anderem.',
    image_too_big:  'Ein Foto ist zu groß zum Speichern. Bitte ein kleineres nehmen.',
    thumb_too_big:  'Das Vorschaubild ist zu groß. Bitte ein anderes nehmen.',
    not_allowed:    'Veröffentlichen dürfen nur freigeschaltete Lehrkräfte.',
    no_school:      'Deinem Konto ist keine Schule zugeordnet — für „Schule" geht das nicht.',
    bad_visibility: 'Unbekannte Sichtbarkeit.'
  };
  const errText = code => window.MPTool
    ? window.MPTool.errText(code, EIGENE)
    : (EIGENE[code] || 'Unerwarteter Fehler (' + code + ').');

  /* ─── Toast ─── */
  let toastTimer = null;
  function toast(message, err) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
  }

  /* ─── Serveraufruf ─────────────────────────────────────────
     Wie trpc in lehrer.js: der Access-Token wird bei JEDEM Aufruf
     frisch gelesen — die Seite steht beim Vorbereiten lange offen.
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
        body: JSON.stringify(args || {})
      });
      if (!res.ok) {
        console.warn('[quiz]', fn, res.status, (await res.text()).slice(0, 200));
        return { ok: false, error: res.status === 404 ? 'fn_missing' : 'server_error', fn };
      }
      const r = await res.json();
      return (r && typeof r === 'object') ? r : { ok: false, error: 'bad_response' };
    } catch (e) {
      console.warn('[quiz]', fn, e && e.message);
      return { ok: false, error: 'network' };
    }
  }

  /* ─── Der Editor ─── */
  let catalogs = [];
  let categories = [];
  let editor = null;
  let stage = null;

  async function ladeKataloge() {
    const r = await call('ks_catalogs_list', {});
    if (!r.ok) { toast(errText(r.error), true); return; }
    catalogs = Array.isArray(r.catalogs) ? r.catalogs : [];
    categories = (Array.isArray(r.categories) ? r.categories : []).map(k => k.name);
  }

  function zeichne() {
    if (!stage || !editor) return;
    stage.innerHTML = editor.html();
    editor.bind(stage);
  }

  function zurueck() {
    location.href = 'index.html';
  }

  async function start() {
    $('quizHost').innerHTML = '<div class="ks-frame ks-frame--beam ks-frame--seite">'
      + '<div class="ks-stage ks-stage--beam ks-stage--editor"></div></div>';
    stage = $('quizHost').querySelector('.ks-stage');

    if (!document.getElementById('kse-css')) {
      const st = document.createElement('style');
      st.id = 'kse-css';
      st.textContent = window.KSEditor.CSS;
      document.head.appendChild(st);
    }

    editor = window.KSEditor.create({
      call,
      catalogs:       () => catalogs,
      categories:     () => categories,
      reloadCatalogs: ladeKataloge,
      redraw:         zeichne,
      toast,
      confirm:        m => Promise.resolve(window.confirm(m)),
      errText,
      closeLabel:     '← MPSkills',
      onClose:        zurueck
      // kein onPlay: ohne Raum gibt es kein Brett, auf das ein
      // Katalog gelegt werden könnte — gespielt wird im Raum.
    });

    await ladeKataloge();
    editor.openList();
  }

  /* Wer mitten im Tippen die Seite verlässt, verliert alles —
     dieselbe Frage, die „← Zurück" im Editor stellt. */
  window.addEventListener('beforeunload', ev => {
    if (editor && editor.dirty) { ev.preventDefault(); ev.returnValue = ''; }
  });

  function hinweis(titel, text) {
    const host = $('quizHost');
    host.classList.add('wrap--narrow');
    host.innerHTML = `<div class="card card--join">
        <h1 class="join-h">${titel}</h1>
        <p class="join-sub">${text}</p>
        <a class="btn btn--primary btn--wide" href="index.html">Zu MPSkills</a>
      </div>`;
  }

  (async function boot() {
    window.MPUserBar?.mount();
    await (window.waitForSession?.() ?? Promise.resolve());
    const s = window.getSessionUser?.();

    if (!s) {
      hinweis('Bitte anmelden', 'Quizze schreibt, wer als Lehrkraft angemeldet ist.');
      return;
    }
    if (!(s.is_admin || s.is_superadmin) && s.teacher_status !== 'approved') {
      hinweis('Noch nicht freigeschaltet', 'Für MPSkills bist du noch nicht als Lehrkraft freigeschaltet.');
      return;
    }
    if (!window.KSEditor || !window.KSParse) {
      hinweis('Editor nicht geladen', 'Der Quiz-Editor ließ sich nicht laden. Lade die Seite neu.');
      return;
    }
    await start();
  })();
})();
