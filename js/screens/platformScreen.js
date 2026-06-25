/* Plattform-Setup – Onboarding-Schritt 2.
   Spieler:in benennt ihre Plattform und wählt ein Logo. Klick auf ein Logo
   färbt die ganze Seite live in die Themenfarbe um (RT.theme.apply).
   Nach Confirm öffnet sich ein „Das bist du"-Modal mit voller Figur + Logo. */
(function (RT) {
  'use strict';

  var selectedLogo = null;
  var inputEl = null;
  var confirmBtn = null;

  function logoCardHTML(logo) {
    var src = RT.assets.logoSrc(logo.id);
    return ''
      + '<button type="button" class="rt-logo" data-logo="' + logo.id + '">'
      + '  <img class="rt-logo__img" src="' + src + '" alt="' + logo.label + '">'
      + '  <span class="rt-logo__label">' + logo.label + '</span>'
      + '</button>';
  }

  function enter(container) {
    var player = RT.state.get().player;
    selectedLogo = player.platformLogo || null;

    var grid = RT.assets.logoList().map(logoCardHTML).join('');
    var prefName = player.platformName ? (' value="' + escapeAttr(player.platformName) + '"') : '';

    container.innerHTML = ''
      + '<section class="rt-screen rt-onboarding">'
      + '  <header class="rt-onboarding__head">'
      + '    <div class="rt-step-badge">Schritt 2 / 2</div>'
      + '    <h1>Was ist deine Idee?</h1>'
      + '    <p class="rt-onboarding__lead">Gib deinem Netzwerk einen Namen und such ein Logo aus.</p>'
      + '  </header>'
      + '  <div class="rt-card rt-onboarding__card">'
      + '    <label class="rt-field">'
      + '      <span class="rt-field__label">Name der Plattform</span>'
      + '      <input type="text" class="rt-input" id="rt-platform-name" maxlength="24"'
      + '             placeholder="z.B. Connectly" autocomplete="off"' + prefName + '>'
      + '    </label>'
      + '    <div class="rt-field__label" style="margin-top: var(--rt-space-4);">Logo</div>'
      + '    <div class="rt-logo-grid">' + grid + '</div>'
        + '  </div>'
      + '  <div class="rt-onboarding__actions">'
      + '    <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-confirm" disabled>'
      + '      🛠️ Auf in die Garage'
      + '    </button>'
      + '  </div>'
      + '</section>';

    inputEl = container.querySelector('#rt-platform-name');
    confirmBtn = container.querySelector('#rt-confirm');

    var cards = container.querySelectorAll('.rt-logo');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        selectedLogo = card.getAttribute('data-logo');
        cards.forEach(function (c) { c.classList.remove('is-selected'); });
        card.classList.add('is-selected');
        // Live-Preview: das gesamte Farbschema springt sofort auf die Logo-Farbe.
        // Persistiert wird erst im onConfirm via SET_PLAYER.
        RT.theme.apply(selectedLogo);
        updateConfirmState();
      });
      if (card.getAttribute('data-logo') === selectedLogo) {
        card.classList.add('is-selected');
      }
    });

    inputEl.addEventListener('input', updateConfirmState);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !confirmBtn.disabled) onConfirm();
    });
    confirmBtn.addEventListener('click', onConfirm);

    updateConfirmState();
    if (window.matchMedia && window.matchMedia('(min-width: 600px)').matches) {
      inputEl.focus();
    }
  }

  function updateConfirmState() {
    var name = (inputEl.value || '').trim();
    var ok = name.length > 0 && selectedLogo !== null;
    confirmBtn.disabled = !ok;
  }

  function onConfirm() {
    var name = (inputEl.value || '').trim();
    if (!name || !selectedLogo) return;
    // State setzen, bevor das Modal rendert – das Modal liest dann
    // einfach Avatar + Logo + Namen aus dem State.
    RT.state.dispatch('SET_PLAYER', { platformName: name, platformLogo: selectedLogo });
    showIdentityModal();
  }

  // Bestätigungs-Modal: zeigt die ganze Identität (Figur + Logo + Namen) als
  // kurzen „so siehst du aus"-Moment, bevor Phase 0 (Garage) startet.
  function showIdentityModal() {
    var player = RT.state.get().player;
    var bodySrc = RT.assets.avatarSrc(player.avatar, 'body');
    var logoSrc = RT.assets.logoSrc(player.platformLogo);
    var name = RT.ui.escapeHTML(player.name || '');
    var platform = RT.ui.escapeHTML(player.platformName || '');

    var overlay = document.createElement('div');
    overlay.className = 'rt-modal-overlay is-open';
    overlay.innerHTML = ''
      + '<div class="rt-modal rt-identity-modal">'
      + '  <div class="rt-identity-modal__eyebrow">Das bist du</div>'
      + '  <div class="rt-identity-modal__hero">'
      + '    <div class="rt-identity-modal__col">'
      +        (bodySrc ? '<img class="rt-identity-modal__figure" src="' + bodySrc + '" alt="">' : '')
      + '      <div class="rt-identity-modal__caption">' + name + '</div>'
      + '    </div>'
      + '    <div class="rt-identity-modal__col">'
      +        (logoSrc ? '<img class="rt-identity-modal__logo" src="' + logoSrc + '" alt="">' : '')
      + '      <div class="rt-identity-modal__caption">' + platform + '</div>'
      + '    </div>'
      + '  </div>'
      + '  <p class="rt-identity-modal__text">'
      + '    Bereit, deine Idee in die Welt zu bringen?'
      + '  </p>'
      + '  <div class="rt-modal__actions">'
      + '    <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-identity-go">'
      + '      🛠️ Auf in die Garage'
      + '    </button>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#rt-identity-go').addEventListener('click', function () {
      document.body.removeChild(overlay);
      RT.screens.show('garage');
    });
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function exit() {
    selectedLogo = null;
    inputEl = null;
    confirmBtn = null;
  }

  RT.screens.register('platform', { enter: enter, exit: exit });
})(window.RT);
