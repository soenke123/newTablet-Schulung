/* ══════════════════════════════════════════════════════════════
   SYNIR — szmenue.js   ·   Das Szenario-Menü
   ══════════════════════════════════════════════════════════════
   Ersetzt das frühere <select id="szenario">. Ein natives Auswahl-
   feld kann keine Reiter und keine Knöpfe hinter einem Eintrag —
   und genau das braucht die Lehrkraft im Raum: „Öffentlich" und
   „Eigene", und hinter jedem Szenario den Schalter „geteilt".

   Drei Rollen, EIN Menü (dieselbe Optik überall, gewünscht):

     solo         Die Seite läuft für sich (ohne MPSkills). Nur die
                  mitgelieferten Szenarien, keine Reiter, keine
                  Schalter — so wie vorher das Auswahlfeld.
     presenter    Die Lehrkraft. Zwei Reiter (public / private),
                  hinter jedem Eintrag das Teilen-Symbol; geteilte
                  Einträge sind grün hinterlegt. Eigene lassen sich
                  löschen.
     participant  Ein Tablet. Nur die geteilten Szenarien, ohne
                  Reiter und ohne Symbole.

   Das Menü LÄDT nichts. Es meldet eine Wahl (onPick) und einen
   Schalter (onShare, onLoeschen); was daraus wird, entscheidet
   app.js bzw. im Raum die Brücke. So bleibt es dasselbe Stück
   Oberfläche, ob ein Szenario aus dem Code kommt oder vom Server.

   Ein Eintrag ist { id, titel }. Die mitgelieferten tragen die ID
   „builtin:<schlüssel>" — dieselbe, die im Raum in `shared` steht.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Das Teilen-Symbol: drei verbundene Punkte. Gezeichnet wie der
     Rest der Anwendung (currentColor, Strich 1.6). */
  const ICON_TEILEN =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" '
    + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/>'
    + '<path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4"/></svg>';

  function SzMenue(opts) {
    const knopf = opts.knopf;
    const pop   = opts.pop;
    const cfg = { rolle: 'solo', public: [], private: [], shared: [], tab: 'public' };

    function istGeteilt(id) { return cfg.shared.indexOf(id) >= 0; }

    function liste() {
      if (cfg.rolle === 'participant') return cfg.sharedListe || [];
      if (cfg.rolle === 'presenter' && cfg.tab === 'private') return cfg.private;
      return cfg.public;
    }

    function leerText() {
      if (cfg.rolle === 'participant') return 'Noch kein Szenario freigegeben.';
      if (cfg.tab === 'private') {
        return 'Noch keine eigenen Szenarien. Lade ein Szenario, ändere es und wähle dann '
          + '<strong>Speichern → Als Szenario speichern</strong>.';
      }
      return 'Keine Szenarien.';
    }

    function render() {
      const lehrer = cfg.rolle === 'presenter';
      let html = '';
      if (lehrer) {
        html += '<div class="szm-tabs" role="tablist">'
          + '<button type="button" role="tab" class="szm-tab' + (cfg.tab === 'public' ? ' is-on' : '')
          + '" data-tab="public">Öffentlich <span class="szm-sub">public</span></button>'
          + '<button type="button" role="tab" class="szm-tab' + (cfg.tab === 'private' ? ' is-on' : '')
          + '" data-tab="private">Eigene <span class="szm-sub">private</span></button>'
          + '</div>';
      }
      const l = liste();
      if (!l.length) {
        html += '<p class="szm-leer">' + leerText() + '</p>';
      } else {
        html += '<ul class="szm-list">';
        for (const it of l) {
          const an = lehrer && istGeteilt(it.id);
          html += '<li class="szm-item' + (an ? ' is-shared' : '') + '" data-id="' + esc(it.id) + '">'
            + '<button type="button" class="szm-name" data-act="pick">' + esc(it.titel) + '</button>';
          if (lehrer) {
            html += '<button type="button" class="szm-share' + (an ? ' is-on' : '') + '" data-act="share" '
              + 'aria-pressed="' + an + '" title="' + (an ? 'geteilt — die Klasse sieht es. Tippen zum Zurücknehmen.'
                                                         : 'nicht geteilt — tippen, um es der Klasse freizugeben.') + '">'
              + ICON_TEILEN + '<span>' + (an ? 'geteilt' : 'teilen') + '</span></button>';
            if (cfg.tab === 'private') {
              html += '<button type="button" class="szm-del" data-act="del" title="Szenario löschen">×</button>';
            }
          }
          html += '</li>';
        }
        html += '</ul>';
      }
      pop.innerHTML = html;
    }

    function offen() { return !pop.hidden; }
    function auf() { render(); pop.hidden = false; knopf.setAttribute('aria-expanded', 'true'); }
    function zu()  { pop.hidden = true; knopf.setAttribute('aria-expanded', 'false'); }

    knopf.addEventListener('click', (e) => { e.stopPropagation(); if (offen()) zu(); else auf(); });

    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const tab = e.target.closest('[data-tab]');
      if (tab) { cfg.tab = tab.dataset.tab; render(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const li = b.closest('.szm-item');
      const id = li && li.dataset.id;
      if (!id) return;
      const it = liste().find(x => x.id === id);
      if (b.dataset.act === 'pick') { zu(); if (opts.onPick) opts.onPick(id, it); }
      else if (b.dataset.act === 'share') { if (opts.onShare) opts.onShare(id, !istGeteilt(id), it); }
      else if (b.dataset.act === 'del') { if (opts.onLoeschen) opts.onLoeschen(id, it); }
    });

    document.addEventListener('click', () => { if (offen()) zu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && offen()) zu(); });

    return {
      /* Nimmt jede Teilmenge von { rolle, public, private, shared,
         sharedListe } — was fehlt, bleibt wie es war. */
      setzen(c) {
        for (const k in c) if (c[k] !== undefined) cfg[k] = c[k];
        if (offen()) render();
      },
      auf, zu,
      get cfg() { return cfg; }
    };
  }

  window.SzMenue = SzMenue;
})();
