/* ─── Accountname: Prüfung im Formular ────────────────────────────
   Gleiche Regel wie api/signup.js (ACCOUNT_NAME_RE): 2–20 Zeichen,
   nur a–z, 0–9, . _ -
   Die Prüfung läuft schon beim Tippen, damit ein Großbuchstabe (das
   Tablet schreibt den ersten Buchstaben gern groß) nicht erst beim
   Absenden als unklarer Fehler auffällt. Das Feld wird rot, und der
   Hinweis darunter sagt genau, was nicht passt.

   Nutzung:
     const acc = AccountName.attach(inputEl, hintEl);
     if (!acc.check()) return;          // beim Absenden
     acc.showProblem('Text');           // Fehler vom Server anzeigen
     acc.reset();                       // Formular zurückgesetzt
*/
(function () {
  const ALLOWED = /^[a-z0-9._-]$/;

  // Liefert die Fehlermeldung oder null. `final` = beim Absenden
  // (dann zählen auch leer und zu kurz; beim Tippen noch nicht).
  function problem(raw, final) {
    const v = String(raw ?? '').trim();
    if (!v) return final ? 'Bitte einen Accountnamen eingeben.' : null;

    if (/[A-ZÄÖÜ]/.test(v)) {
      const lower = v.toLowerCase();
      return /^[a-z0-9._-]+$/.test(lower)
        ? `Keine Großbuchstaben: Bitte alles kleinschreiben, also „${lower}“.`
        : 'Keine Großbuchstaben: Bitte alles kleinschreiben.';
    }
    if (/\s/.test(v)) {
      return 'Keine Leerzeichen: Nimm stattdessen einen Punkt, Unterstrich oder Bindestrich (z. B. „max.muster“).';
    }
    if (/[äöüß]/.test(v)) {
      return 'Keine Umlaute oder ß: Schreib ae, oe, ue und ss (z. B. „mueller“ statt „müller“).';
    }
    const bad = [...new Set([...v].filter(c => !ALLOWED.test(c)))];
    if (bad.length) {
      return `Nicht erlaubt: ${bad.map(c => '„' + c + '“').join(' ')}. Erlaubt sind nur a–z, 0–9 sowie . _ -`;
    }
    if (v.length > 20) return `Zu lang: ${v.length} Zeichen, höchstens 20 sind erlaubt.`;
    if (final && v.length < 2) return 'Zu kurz: Mindestens 2 Zeichen.';
    return null;
  }

  function attach(input, hint) {
    const defaultHint = hint ? hint.textContent : '';

    function show(msg) {
      input.classList.toggle('is-invalid', !!msg);
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      if (hint) {
        hint.textContent = msg || defaultHint;
        hint.classList.toggle('is-invalid', !!msg);
        if (msg) hint.setAttribute('role', 'alert');
        else hint.removeAttribute('role');
      }
    }

    input.addEventListener('input', () => show(problem(input.value, false)));
    input.addEventListener('blur', () => {
      if (input.value.trim()) show(problem(input.value, true));
    });

    return {
      check() {
        const msg = problem(input.value, true);
        show(msg);
        if (msg) input.focus();
        return !msg;
      },
      showProblem(msg) { show(msg); input.focus(); },
      reset() { show(null); }
    };
  }

  window.AccountName = { problem, attach };
})();
