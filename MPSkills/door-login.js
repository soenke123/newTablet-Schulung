/* ══════════════════════════════════════════════════════════════
   MPSkills — door-login.js  ·  Anmelden auf der Beitrittsseite
   ══════════════════════════════════════════════════════════════
   Unter dem Namensfeld von j.html. Teilnehmer brauchen KEIN Konto
   (das steht im Hinweis ganz vorn); wer sich trotzdem anmeldet,
   bekommt den Raum an sein Konto gehängt (MPRoom.join schickt das
   Zugangstoken mit) und findet ihn auf jedem Gerät wieder.

   Anmelden und Registrieren sind dieselben Wege wie auf der Landing
   (app.js): Fake-Mail aus Accountname + Schule, /api/signup mit
   context='mpskills'. Unterschied: teacher_request:false — wer sich
   hier registriert, ist in aller Regel Schüler und stellt keinen
   Lehrkraft-Antrag. Das Konto steht trotzdem auf Status
   „über MPSkills“ (Migration 0212).

   Nach dem Anmelden macht diese Datei nichts weiter: j.js hört auf
   lernwelt:session-changed und zeichnet die Seite neu.
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));
  const DEFAULT_SCHOOL = 'mps';

  const SIGNUP_ERRORS = {
    account_name_invalid:  'Der Name ist ungültig. 2–20 Zeichen, nur a–z, 0–9, . _ -',
    account_name_blocked:  'Dieser Name ist nicht erlaubt.',
    account_name_taken:    'Dieser Name ist an der Schule schon vergeben.',
    display_name_invalid:  'Der Anzeigename ist ungültig. 2–24 Zeichen.',
    display_name_blocked:  'Dieser Anzeigename ist nicht erlaubt.',
    school_unknown:        'Diese Schule ist nicht bekannt.',
    rate_limit:            'Zu viele Versuche. Bitte später erneut probieren.'
  };

  let schools = null;
  async function loadSchools() {
    if (schools) return schools;
    try {
      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/schools?select=slug,name&active=eq.true&order=name`,
        { headers: { apikey: window.SUPABASE_ANON_KEY,
                     Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
                     Accept: 'application/json' } });
      if (!res.ok) throw new Error(`schools ${res.status}`);
      schools = await res.json();
    } catch (e) {
      console.warn('[mpskills] Schulliste:', e.message);
      schools = [];
    }
    if (!schools.length) schools = [{ slug: DEFAULT_SCHOOL, name: 'MPS' }];
    return schools;
  }

  function html() {
    return `
      <section class="door-login" id="doorLogin">
        <h2 class="door-login-h">Anmelden</h2>
        <p class="door-login-note"><strong>Du brauchst keinen Account.</strong>
          Wenn du dich anmeldest, wird der Raum mit deinem Account verknüpft —
          du findest ihn dann auf jedem Gerät wieder.</p>
        <div class="msg msg--err" id="dlError" hidden></div>

        <form id="dlLoginForm" novalidate>
          <label class="field" data-dl-school hidden>Schule
            <select id="dlSchool"></select>
          </label>
          <label class="field">Name
            <input type="text" id="dlAccount" autocomplete="username"
                   autocapitalize="none" autocorrect="off" spellcheck="false" required />
          </label>
          <label class="field">Passwort
            <input type="password" id="dlPassword" autocomplete="current-password" required />
          </label>
          <button type="submit" class="btn btn--wide" id="dlLoginBtn">Anmelden</button>
        </form>

        <form id="dlRegForm" novalidate hidden>
          <label class="field" data-dl-school hidden>Schule
            <select id="dlRegSchool"></select>
          </label>
          <label class="field">Name zum Anmelden
            <input type="text" id="dlRegAccount" autocomplete="username"
                   autocapitalize="none" autocorrect="off" spellcheck="false" required />
            <span class="rule">2–20 Zeichen · nur Kleinbuchstaben (a–z), Ziffern und . _ -</span>
          </label>
          <label class="field">Anzeigename
            <input type="text" id="dlRegDisplay" autocomplete="name" required />
            <span class="rule">Den sieht die Klasse.</span>
          </label>
          <label class="field">Passwort
            <input type="password" id="dlRegPw" autocomplete="new-password" required />
            <span class="rule">Mindestens 8 Zeichen, mit Buchstabe und Zahl.</span>
          </label>
          <label class="field">Passwort wiederholen
            <input type="password" id="dlRegPw2" autocomplete="new-password" required />
          </label>
          <button type="submit" class="btn btn--primary btn--wide" id="dlRegBtn">Konto anlegen</button>
        </form>

        <p class="door-login-switch">
          <button type="button" class="btn btn--ghost btn--wide" id="dlSwitch">Registrieren</button>
        </p>
      </section>`;
  }

  async function wire() {
    const root = document.getElementById('doorLogin');
    if (!root) return;
    const $ = (id) => document.getElementById(id);
    const err = $('dlError');
    const showErr = (m) => { err.textContent = m; err.hidden = !m; };

    const list = await loadSchools();
    if (!document.getElementById('doorLogin')) return;   // Seite hat inzwischen gewechselt
    const opts = list.map(s => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`).join('');
    for (const id of ['dlSchool', 'dlRegSchool']) {
      const el = $(id);
      el.innerHTML = opts;
      if (list.some(s => s.slug === DEFAULT_SCHOOL)) el.value = DEFAULT_SCHOOL;
    }
    // Bei nur einer Schule gibt es nichts zu wählen.
    if (list.length > 1) root.querySelectorAll('[data-dl-school]').forEach(l => { l.hidden = false; });

    let registering = false;
    $('dlSwitch').addEventListener('click', () => {
      registering = !registering;
      $('dlLoginForm').hidden = registering;
      $('dlRegForm').hidden   = !registering;
      $('dlSwitch').textContent = registering ? 'Zurück zum Anmelden' : 'Registrieren';
      showErr('');
      setTimeout(() => $(registering ? 'dlRegAccount' : 'dlAccount').focus(), 30);
    });

    $('dlLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      showErr('');
      const account  = $('dlAccount').value.trim().toLowerCase();
      const password = $('dlPassword').value;
      if (!account || !password) return;
      if (!window.supabaseClient) { showErr('Verbindung nicht bereit. Bitte Seite neu laden.'); return; }
      const btn = $('dlLoginBtn');
      btn.disabled = true;
      try {
        const email = `${account}@${$('dlSchool').value}.${window.FAKE_EMAIL_DOMAIN}`;
        const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) showErr('Anmeldung fehlgeschlagen. Name, Schule oder Passwort stimmt nicht.');
        // Erfolg: lernwelt:session-changed → j.js zeichnet neu.
      } catch (ex) {
        showErr('Fehler bei der Anmeldung: ' + (ex?.message ?? ex));
      } finally {
        btn.disabled = false;
      }
    });

    $('dlRegForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      showErr('');
      const account_name = $('dlRegAccount').value.trim().toLowerCase();
      const display_name = $('dlRegDisplay').value.trim();
      const password     = $('dlRegPw').value;
      if (password !== $('dlRegPw2').value) { showErr('Die beiden Passwörter stimmen nicht überein.'); return; }
      if (!account_name || !display_name || !password) return;
      const btn = $('dlRegBtn');
      btn.disabled = true;
      try {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_slug: $('dlRegSchool').value, account_name, display_name, password,
            context: 'mpskills', teacher_request: false
          })
        });
        let body = {};
        try { body = JSON.parse(await res.text() || '{}'); } catch (ex) { /* leer */ }
        if (!res.ok || !body.ok) {
          showErr(SIGNUP_ERRORS[body.error]
            || (body.error === 'password_policy' ? (body.message || 'Das Passwort erfüllt die Regeln nicht.') : '')
            || `Registrierung fehlgeschlagen (HTTP ${res.status}${body.error ? ' · ' + body.error : ''}).`);
          return;
        }
        const { error } = await window.supabaseClient.auth.signInWithPassword({ email: body.email, password });
        if (error) showErr('Konto angelegt, aber die Anmeldung schlug fehl: ' + error.message);
      } catch (ex) {
        showErr('Netzwerkfehler: ' + (ex?.message ?? ex));
      } finally {
        btn.disabled = false;
      }
    });
  }

  window.DoorLogin = { html, wire };
})();
