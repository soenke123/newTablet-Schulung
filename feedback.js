/* ══════════════════════════════════════════════════════════════
   feedback.js — „Feedback & Fragen"
   ══════════════════════════════════════════════════════════════
   Der Dialog hinter dem Menüpunkt „Feedback & Fragen" im Profil-
   Menü. Eine Datei für beide Bereiche: Tablet-Schulung (index.html,
   profil.html, GameHub) bindet sie per <script> ein, MPSkills lädt
   sie über lib/userbar.js erst beim ersten Klick nach.

   Oben die Kategorie, darunter der Freitext, unten Abbrechen /
   Senden. Gesendet wird über die RPC submit_feedback (Migration
   0179); sie prüft die Berechtigung selbst noch einmal. Die
   Nachrichten liest nur der Volladmin im Admin-Panel, Reiter
   „Tickets".

   Wer den Menüpunkt sieht, entscheidet canSend(session) — dieselbe
   Regel wie can_send_feedback() in der Datenbank:
     Admin · freigeschaltete Lehrkraft · Kurs mit Feedback-Schalter

   Optik: der Dialog bringt sein eigenes CSS mit und borgt sich die
   Farben der Seite (--surface, --ink/--text, --accent). So sieht er
   in der hellen Schulung, in MPSkills hell/dunkel und — über die
   --clr-*-Variablen — im dunklen GameHub jeweils passend aus.

   Abhängigkeiten: window.supabaseClient aus session.js. Optional
   viewport.js (--vv-top/--vv-h), damit die Tastatur auf dem Tablet
   die Knöpfe nicht verdeckt.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.MPSFeedback) return;

  var MAX = 4000;

  var CATEGORIES = [
    { id: 'question', icon: '❓', label: 'Ich habe eine Frage' },
    { id: 'bug',      icon: '🐞', label: 'Ich habe einen Fehler gefunden' },
    { id: 'idea',     icon: '💡', label: 'Ich habe eine Idee zur Verbesserung / Erweiterung' },
    { id: 'other',    icon: '💬', label: 'Etwas anderes' }
  ];

  var ERRORS = {
    not_logged_in: 'Du bist nicht mehr eingeloggt. Bitte melde dich neu an.',
    not_allowed:   'Für deinen Account ist „Feedback & Fragen" nicht freigeschaltet.',
    bad_category:  'Bitte wähle oben aus, worum es geht.',
    empty:         'Bitte schreib zuerst etwas in das Textfeld.',
    too_long:      'Die Nachricht ist zu lang (höchstens ' + MAX + ' Zeichen).',
    rate_limited:  'Du hast in der letzten Stunde schon viele Nachrichten geschickt. Bitte versuch es später noch einmal.'
  };

  function canSend(s) {
    if (!s) return false;
    return !!(s.is_admin || s.is_superadmin
      || s.teacher_status === 'approved'
      || s.cluster_feedback_enabled);
  }

  /* ── CSS ─────────────────────────────────────────────────── */
  var CSS = [
    '.fb-overlay{--fb-surface:var(--surface,#fff);--fb-soft:var(--surface-2,var(--surface-soft,#f6f6f4));',
    '--fb-ink:var(--ink,var(--text,#1f1f1f));--fb-muted:var(--ink-soft,var(--muted,#666));',
    '--fb-line:var(--line,rgba(0,0,0,.14));--fb-accent:var(--accent,#b56a3c);--fb-on-accent:#fff;--fb-err:#c0392b;',
    'position:fixed;left:0;right:0;top:var(--vv-top,0);height:var(--vv-h,100vh);z-index:10000;',
    'background:rgba(10,12,12,.55);display:flex;align-items:center;justify-content:center;',
    'padding:16px;overflow-y:auto;box-sizing:border-box;font-family:inherit;}',
    '.fb-overlay[hidden]{display:none;}',
    '.fb-overlay.fb-hub{--fb-surface:var(--clr-surface,#2b1a0d);--fb-soft:var(--clr-surface2,#3a2410);',
    '--fb-ink:var(--clr-cream,#f5e6c8);--fb-muted:var(--clr-cream-dim,#c9b38a);--fb-line:var(--clr-border,#6b3f1a);',
    '--fb-accent:var(--clr-gold,#f0b429);--fb-on-accent:#1a0e05;--fb-err:#ff8a8a;font-family:var(--font-body,inherit);}',
    '.fb-box{background:var(--fb-surface);color:var(--fb-ink);width:100%;max-width:560px;margin:auto;',
    'border-radius:18px;border:1px solid var(--fb-line);box-shadow:0 20px 60px rgba(0,0,0,.35);',
    'padding:22px 22px 18px;box-sizing:border-box;text-align:left;}',
    '.fb-box *{box-sizing:border-box;}',
    '.fb-box h2{margin:0 0 4px;font-size:1.3rem;line-height:1.25;color:var(--fb-ink);}',
    '.fb-sub{margin:0 0 16px;color:var(--fb-muted);font-size:.92rem;line-height:1.4;}',
    '.fb-label{display:block;font-weight:600;font-size:.9rem;margin:0 0 8px;color:var(--fb-ink);}',
    '.fb-cats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 16px;}',
    '@media (max-width:480px){.fb-cats{grid-template-columns:1fr;}}',
    '.fb-cat{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:12px;',
    'border:1.5px solid var(--fb-line);background:var(--fb-soft);color:var(--fb-ink);font:inherit;',
    'font-size:.92rem;text-align:left;cursor:pointer;line-height:1.3;transition:border-color .15s,background .15s;}',
    '.fb-cat:hover{border-color:var(--fb-accent);}',
    '.fb-cat[aria-checked="true"]{border-color:var(--fb-accent);',
    'background:color-mix(in srgb,var(--fb-accent) 16%,var(--fb-surface));font-weight:600;box-shadow:inset 0 0 0 1px var(--fb-accent);}',
    '.fb-cat:focus-visible,.fb-btn:focus-visible,.fb-text:focus-visible{outline:2px solid var(--fb-accent);outline-offset:2px;}',
    '.fb-cat-ic{font-size:1.25rem;flex:none;}',
    '.fb-text{display:block;width:100%;min-height:150px;resize:vertical;padding:12px;border-radius:12px;',
    'border:1.5px solid var(--fb-line);background:var(--fb-soft);color:var(--fb-ink);font:inherit;font-size:.95rem;line-height:1.45;}',
    '.fb-text::placeholder{color:var(--fb-muted);opacity:1;}',
    '.fb-count{text-align:right;font-size:.78rem;color:var(--fb-muted);margin:4px 0 0;}',
    '.fb-count.over{color:var(--fb-err);font-weight:600;}',
    '.fb-msg{min-height:1.2em;margin:10px 0 0;font-size:.9rem;color:var(--fb-err);}',
    '.fb-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px;flex-wrap:wrap;}',
    '.fb-btn{font:inherit;font-size:.95rem;font-weight:600;padding:10px 18px;border-radius:999px;cursor:pointer;',
    'border:1.5px solid var(--fb-line);background:transparent;color:var(--fb-ink);}',
    '.fb-btn.primary{background:var(--fb-accent);border-color:var(--fb-accent);color:var(--fb-on-accent);}',
    '.fb-btn:disabled{opacity:.45;cursor:not-allowed;}',
    '.fb-done{text-align:center;padding:18px 4px 6px;}',
    '.fb-done-ic{font-size:2.6rem;line-height:1;margin-bottom:10px;}',
    '.fb-done p{margin:0 0 18px;font-size:1.05rem;font-weight:600;}'
  ].join('');

  var overlay = null;
  var state = { cat: null, busy: false, lastFocus: null, closeTimer: null };

  function el(id) { return overlay.querySelector('[data-fb="' + id + '"]'); }

  function build() {
    if (overlay) return;
    var style = document.createElement('style');
    style.id = 'fbStyle';
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'fb-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="fb-box" role="dialog" aria-modal="true" aria-labelledby="fbTitle">'
      + '<div data-fb="form">'
      +   '<h2 id="fbTitle">Feedback &amp; Fragen</h2>'
      +   '<p class="fb-sub">Deine Nachricht geht direkt an das MPSkills-Team.</p>'
      +   '<span class="fb-label" id="fbCatLabel">Worum geht es?</span>'
      +   '<div class="fb-cats" role="radiogroup" aria-labelledby="fbCatLabel" data-fb="cats">'
      +     CATEGORIES.map(function (c) {
              return '<button type="button" class="fb-cat" role="radio" aria-checked="false" data-cat="' + c.id + '">'
                + '<span class="fb-cat-ic" aria-hidden="true">' + c.icon + '</span><span>' + c.label + '</span></button>';
            }).join('')
      +   '</div>'
      +   '<label class="fb-label" for="fbText">Deine Nachricht</label>'
      +   '<textarea class="fb-text" id="fbText" data-fb="text" maxlength="' + (MAX + 200) + '" '
      +     'placeholder="Schreib hier rein, was du uns mitteilen willst. Vergiss nicht zu erwähnen, um welches Spiel, welchen Inhalt oder welchen Skill es geht."></textarea>'
      +   '<p class="fb-count" data-fb="count">0 / ' + MAX + '</p>'
      +   '<p class="fb-msg" role="alert" data-fb="msg"></p>'
      +   '<div class="fb-actions">'
      +     '<button type="button" class="fb-btn" data-fb="cancel">Abbrechen</button>'
      +     '<button type="button" class="fb-btn primary" data-fb="send" disabled>Senden</button>'
      +   '</div>'
      + '</div>'
      + '<div class="fb-done" data-fb="done" hidden>'
      +   '<div class="fb-done-ic" aria-hidden="true">✅</div>'
      +   '<p>Das MPSkills-Team hat deine Nachricht erhalten.</p>'
      +   '<button type="button" class="fb-btn primary" data-fb="ok">Schließen</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(overlay);

    el('cats').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      selectCat(b.dataset.cat);
      el('text').focus();
    });
    el('cats').addEventListener('keydown', function (e) {
      var keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!keys[e.key]) return;
      e.preventDefault();
      var i = CATEGORIES.findIndex(function (c) { return c.id === state.cat; });
      i = (i + keys[e.key] + CATEGORIES.length) % CATEGORIES.length;
      selectCat(CATEGORIES[i].id);
      el('cats').querySelector('[data-cat="' + CATEGORIES[i].id + '"]').focus();
    });
    el('text').addEventListener('input', refresh);
    el('cancel').addEventListener('click', close);
    el('ok').addEventListener('click', close);
    el('send').addEventListener('click', send);
    overlay.addEventListener('click', function (e) { if (e.target === overlay && !state.busy) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden && !state.busy) close();
    });
  }

  function selectCat(id) {
    state.cat = id;
    overlay.querySelectorAll('[data-cat]').forEach(function (b) {
      var on = b.dataset.cat === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    el('msg').textContent = '';
    refresh();
  }

  function refresh() {
    var len = el('text').value.trim().length;
    var count = el('count');
    count.textContent = len + ' / ' + MAX;
    count.classList.toggle('over', len > MAX);
    el('send').disabled = state.busy || !state.cat || len === 0 || len > MAX;
  }

  function reset() {
    state.cat = null;
    state.busy = false;
    el('text').value = '';
    el('msg').textContent = '';
    el('form').hidden = false;
    el('done').hidden = true;
    el('send').textContent = 'Senden';
    overlay.querySelectorAll('[data-cat]').forEach(function (b, i) {
      b.setAttribute('aria-checked', 'false');
      b.tabIndex = i === 0 ? 0 : -1;
    });
    refresh();
  }

  function open() {
    build();
    clearTimeout(state.closeTimer);
    reset();
    // GameHub: dort gibt es kein --surface, sondern --clr-* — und die
    // Kreaturen-Themes setzen sie am <body> um, deshalb von dort lesen.
    var bodyStyle = getComputedStyle(document.body);
    overlay.classList.toggle('fb-hub', !!bodyStyle.getPropertyValue('--clr-surface').trim());
    state.lastFocus = document.activeElement;
    overlay.hidden = false;
    var first = overlay.querySelector('[data-cat]');
    if (first) first.focus();
  }

  function close() {
    if (!overlay) return;
    clearTimeout(state.closeTimer);
    overlay.hidden = true;
    if (state.lastFocus && state.lastFocus.focus) {
      try { state.lastFocus.focus(); } catch (e) {}
    }
  }

  async function send() {
    var body = el('text').value.trim();
    if (!state.cat || !body || body.length > MAX || state.busy) return;
    var client = window.supabaseClient;
    if (!client) { el('msg').textContent = 'Verbindung zum Server fehlt. Bitte lade die Seite neu.'; return; }

    state.busy = true;
    el('send').textContent = 'Sende …';
    el('msg').textContent = '';
    refresh();
    try {
      var res = await client.rpc('submit_feedback', {
        p_category: state.cat,
        p_body:     body,
        p_page:     location.pathname
      });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (!data.ok) {
        el('msg').textContent = ERRORS[data.error] || 'Das hat leider nicht geklappt. Bitte versuch es noch einmal.';
        return;
      }
      el('form').hidden = true;
      el('done').hidden = false;
      el('ok').focus();
      state.closeTimer = setTimeout(close, 4000);
    } catch (err) {
      console.warn('[feedback] submit fehlgeschlagen', err);
      el('msg').textContent = 'Keine Verbindung zum Server. Bitte versuch es gleich noch einmal.';
    } finally {
      state.busy = false;
      el('send').textContent = 'Senden';
      refresh();
    }
  }

  window.MPSFeedback = { open: open, close: close, canSend: canSend, CATEGORIES: CATEGORIES };
})();
