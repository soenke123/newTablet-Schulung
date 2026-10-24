/* ══════════════════════════════════════════════════════════════
   admin/mfa.js — 2FA für Admins (Migration 0223)
   ══════════════════════════════════════════════════════════════
   Admin-Rechte gelten in der Datenbank und in api/admin_*.js nur mit
   einer Sitzung auf Stufe aal2 (Code aus der Authenticator-App).
   Diese Datei bringt die Sitzung dorthin, bevor das Panel lädt:

     - Faktor vorhanden, Sitzung noch aal1 → Code abfragen.
     - Noch kein Faktor → einrichten: QR-Code scannen, Code eingeben.

   Die bestätigte Sitzung gilt danach auf der ganzen Seite (gleicher
   Supabase-Client), also auch im GameHub und in MPSkills.

   AdminMFA.ensure(mask) → Promise, löst sich, sobald aal2 erreicht
   ist. mask ist das Element, in dem der Dialog erscheint (bootMask).
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CODE_RE = /^\d{6}$/;

  async function level(sb) {
    const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data;  // { currentLevel, nextLevel }
  }

  // Neuen Token sofort übernehmen — api() in app.js liest __accessToken.
  async function syncToken(sb) {
    const { data } = await sb.auth.getSession();
    window.__accessToken = data?.session?.access_token ?? window.__accessToken;
  }

  function render(mask, html) {
    mask.innerHTML = `<div class="mfa-card" role="dialog" aria-labelledby="mfaTitle">${html}</div>`;
    mask.classList.add('mfa');
  }

  // Ein Code-Feld + Knopf; onCode(code) wirft bei falschem Code.
  function wireCode(mask, onCode) {
    const form  = mask.querySelector('form');
    const input = mask.querySelector('input[name=code]');
    const msg   = mask.querySelector('.mfa-msg');
    const btn   = form.querySelector('button[type=submit]');
    input.focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const code = input.value.replace(/\s/g, '');
      if (!CODE_RE.test(code)) { msg.textContent = 'Der Code hat 6 Ziffern.'; return; }
      btn.disabled = true; msg.textContent = 'Prüfe …';
      try {
        await onCode(code);
      } catch (e) {
        console.warn('[mfa]', e);
        msg.textContent = 'Der Code stimmt nicht oder ist abgelaufen. Bitte den aktuellen Code eingeben.';
        input.select();
        btn.disabled = false;
      }
    });
  }

  const CODE_FIELD = `
    <form class="mfa-form" autocomplete="off">
      <input name="code" inputmode="numeric" autocomplete="one-time-code"
             maxlength="7" placeholder="123456" aria-label="6-stelliger Code">
      <button type="submit" class="btn primary">Bestätigen</button>
    </form>
    <p class="mfa-msg" aria-live="polite"></p>`;

  const LOGOUT = `<p class="mfa-foot"><a href="../index.html" data-mfa-logout>Abmelden</a></p>`;

  function wireLogout(mask, sb) {
    mask.querySelector('[data-mfa-logout]')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      try { await sb.auth.signOut(); } catch {}
      location.replace('../index.html');
    });
  }

  function askCode(mask, sb, factor) {
    return new Promise((resolve) => {
      render(mask, `
        <h2 id="mfaTitle">Zwei-Faktor-Anmeldung</h2>
        <p>Für den Admin-Bereich bitte den 6-stelligen Code aus deiner Authenticator-App eingeben.</p>
        ${CODE_FIELD}
        <p class="mfa-hint">Handy verloren? Der Betreiber löscht den Faktor im Supabase-Dashboard, danach richtest du ihn neu ein.</p>
        ${LOGOUT}`);
      wireLogout(mask, sb);
      wireCode(mask, async (code) => {
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (error) throw error;
        resolve();
      });
    });
  }

  async function enroll(mask, sb) {
    // Ein abgebrochener Versuch hinterlässt einen unbestätigten Faktor;
    // der würde den Namen blockieren und bringt nichts.
    const { data: list } = await sb.auth.mfa.listFactors();
    for (const f of (list?.all || [])) {
      if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await sb.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Admin ' + new Date().toISOString().slice(0, 10),
      issuer: 'MPS Lernwelt Admin',
    });
    if (error) throw error;

    return new Promise((resolve) => {
      render(mask, `
        <h2 id="mfaTitle">2FA einrichten</h2>
        <p>Admin-Rechte gibt es nur mit Zwei-Faktor-Anmeldung. Einmal einrichten, danach fragt das Panel bei jeder neuen Anmeldung nach dem Code.</p>
        <ol class="mfa-steps">
          <li>Eine Authenticator-App öffnen (z. B. Microsoft Authenticator, Google Authenticator, Aegis, 2FAS).</li>
          <li>Diesen QR-Code scannen.</li>
          <li>Den 6-stelligen Code aus der App hier eingeben.</li>
        </ol>
        <img class="mfa-qr" src="${esc(data.totp.qr_code)}" alt="QR-Code für die Authenticator-App" width="200" height="200">
        <details class="mfa-secret"><summary>QR-Code geht nicht? Schlüssel abtippen</summary>
          <code>${esc(data.totp.secret)}</code></details>
        ${CODE_FIELD}
        ${LOGOUT}`);
      wireLogout(mask, sb);
      wireCode(mask, async (code) => {
        const { error: e2 } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code });
        if (e2) throw e2;
        resolve();
      });
    });
  }

  async function ensure(mask) {
    const sb = window.supabaseClient;
    const lv = await level(sb);
    if (lv.currentLevel === 'aal2') return;

    if (lv.nextLevel === 'aal2') {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) throw error;
      const factor = (data?.totp || [])[0];
      if (factor) await askCode(mask, sb, factor);
      else await enroll(mask, sb);
    } else {
      await enroll(mask, sb);
    }

    await syncToken(sb);
    if ((await level(sb)).currentLevel !== 'aal2') {
      throw new Error('2FA-Bestätigung ist nicht angekommen. Bitte Seite neu laden.');
    }
    mask.classList.remove('mfa');
    mask.textContent = 'Lade …';
  }

  window.AdminMFA = { ensure };
})();
