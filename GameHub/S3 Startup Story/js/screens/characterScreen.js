/* Charakter-Auswahl – Onboarding-Schritt 1.
   Spieler:in gibt einen Namen ein und wählt einen von vier Avataren.
   Schreibt name + avatar in den State und führt zur Plattform-Auswahl. */
(function (RT) {
  'use strict';

  var selectedAvatar = null;
  var inputEl = null;
  var confirmBtn = null;

  function avatarCardHTML(av) {
    var src = RT.assets.avatarSrc(av.id, 'body');
    return ''
      + '<button type="button" class="rt-avatar" data-avatar="' + av.id + '">'
      + '  <img class="rt-avatar__img" src="' + src + '" alt="' + av.label + '">'
      + '  <span class="rt-avatar__label">' + av.label + '</span>'
      + '</button>';
  }

  function enter(container) {
    document.body.classList.add('rt-onboarding-active');
    var player = RT.state.current.player || {};
    selectedAvatar = player.avatar || null;

    var grid = RT.assets.avatarList().map(avatarCardHTML).join('');
    var prefName = player.name ? (' value="' + escapeAttr(player.name) + '"') : '';

    container.innerHTML = ''
      + '<section class="rt-screen rt-onboarding">'
      + '  <header class="rt-onboarding__head">'
      + '    <div class="rt-step-badge">Schritt 1 / 2</div>'
      + '    <h1>Wer bist du überhaupt?</h1>'
      + '    <p class="rt-onboarding__lead">Wähl deinen Namen und das Tier, das dich am besten beschreibt.</p>'
      + '  </header>'
      + '  <div class="rt-card rt-onboarding__card">'
      + '    <label class="rt-field">'
      + '      <span class="rt-field__label">Dein Name</span>'
      + '      <input type="text" class="rt-input" id="rt-name" maxlength="20"'
      + '             placeholder="z.B. Anna" autocomplete="off"' + prefName + '>'
      + '    </label>'
      + '    <div class="rt-field__label" style="margin-top: var(--rt-space-4);">Dein Charakter</div>'
      + '    <div class="rt-avatar-grid">' + grid + '</div>'
      + '  </div>'
      + '  <div class="rt-onboarding__actions">'
      + '    <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-confirm" disabled>'
      + '      ✓ Das bin ich'
      + '    </button>'
      + '  </div>'
      + '</section>';

    inputEl = container.querySelector('#rt-name');
    confirmBtn = container.querySelector('#rt-confirm');

    var cards = container.querySelectorAll('.rt-avatar');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        selectedAvatar = card.getAttribute('data-avatar');
        cards.forEach(function (c) { c.classList.remove('is-selected'); });
        card.classList.add('is-selected');
        var def = RT.assets.AVATARS[selectedAvatar].defaultName;
        if (def && isSuggestion(inputEl.value)) { inputEl.value = def; inputEl.select(); }
        updateConfirmState();
      });
      if (card.getAttribute('data-avatar') === selectedAvatar) {
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

  /* Der Vorschlagsname wird nur gesetzt, solange nichts Eigenes im Feld steht.
     Ein leeres Feld oder ein anderer Vorschlag darf ersetzt werden – ein selbst
     getippter Name nie, sonst nimmt die Tierwahl ihn wieder weg. */
  function isSuggestion(value) {
    var name = (value || '').trim();
    if (!name) return true;
    return Object.keys(RT.assets.AVATARS).some(function (id) {
      return RT.assets.AVATARS[id].defaultName === name;
    });
  }

  function updateConfirmState() {
    var name = (inputEl.value || '').trim();
    var ok = name.length > 0 && selectedAvatar !== null;
    confirmBtn.disabled = !ok;
  }

  function onConfirm() {
    var name = (inputEl.value || '').trim();
    if (!name || !selectedAvatar) return;
    RT.state.setPlayer({ name: name, avatar: selectedAvatar });
    RT.bus.emit('state:changed');
    RT.screens.show('platform');
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function exit() {
    selectedAvatar = null;
    inputEl = null;
    confirmBtn = null;
  }

  RT.screens.register('character', { enter: enter, exit: exit });
})(window.RT3);
