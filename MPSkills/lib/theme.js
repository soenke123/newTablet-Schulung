/* ══════════════════════════════════════════════════════════════
   MPSkills — lib/theme.js  ·  hell oder dunkel
   ══════════════════════════════════════════════════════════════
   Setzt `data-theme` am <html>. Alles Weitere macht style.css: dort
   steht unter :root der helle und unter :root[data-theme="dark"]
   der dunkle Wertesatz derselben Variablen.

   ⚠️ Diese Datei MUSS im <head> stehen und blockierend geladen
   werden — nicht defer, nicht am Seitenende. Sonst zeichnet der
   Browser die Seite zuerst hell und schaltet danach um: ein
   weißer Blitz, der im abgedunkelten Klassenraum unangenehmer ist
   als der ganze Darkmode nützt. Sie ist absichtlich winzig und
   ohne Abhängigkeiten, damit dieses Blockieren nichts kostet.

   ── Wer entscheidet ───────────────────────────────────────────
   Vorgabe ist das Gerät (prefers-color-scheme). Hat jemand selbst
   gewählt, gilt seine Wahl — und die steht im localStorage, NICHT
   im Profil. Zwei Gründe: ein geteiltes Lehrer-Tablet und das
   eigene Handy wollen verschiedene Antworten, und die Schülerseite
   (j.html) hat gar kein Konto, an dem etwas hängen könnte.

   ── Wo der Umschalter steht ───────────────────────────────────
   An drei Orten, und deshalb steht sein Markup HIER und nicht dort:
   drei Kopien liefen beim nächsten Umbau auseinander.

     Angemeldet   im Menü hinter dem eigenen Namen (lib/userbar.js)
     Als Gast     in der Kopfzeile neben Einloggen/Registrieren
     Im Raum      rechts in der Reiterleiste (j.js, lehrer.js)

   Im Raum steht er sichtbar und nicht in einem Menü: dort hängt ein
   Beamer dran, und „abdunkeln" ist eine Sache von einem Griff.

   Bedient werden alle drei von dem einen delegierten Listener weiter
   unten — jeder Knopf mit data-theme-set wirkt, egal wer ihn
   gezeichnet hat und wann. Und apply() zieht ALLE Knöpfe auf der
   Seite nach, nicht nur den gedrückten: sonst behauptete der zweite
   Schalter weiter, es sei hell.

   Ohne Umschalter bleibt nur eine Stelle: die Code-Eingabe auf
   j.html, bevor jemand in einem Raum ist. Dort gilt das Gerät — und
   das ist die richtige Antwort für einen Bildschirm, den man zehn
   Sekunden lang sieht.

   ── Kein Umschalten ohne Not ──────────────────────────────────
   Ändert das GERÄT seine Einstellung, ziehen wir nur mit, solange
   niemand selbst gewählt hat. Und wer in einem zweiten Tab
   umschaltet, sieht es hier auch — dafür der storage-Listener. Ein
   Beamer-Tab, der mitten in der Stunde von selbst umspringt, wäre
   das schlimmere Übel; deshalb hängt das ausschließlich an einer
   ausdrücklichen Wahl und nicht an einer Uhrzeit.
   ══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const KEY = 'mpskills_theme';
  const mq  = window.matchMedia?.('(prefers-color-scheme: dark)') ?? { matches: false };

  /* localStorage kann werfen (Safari im privaten Modus, gesperrte
     Speicher-Rechte). Dann gilt eben immer das Gerät — kaputt ist
     das nicht, nur weniger. */
  function stored() {
    try {
      const v = localStorage.getItem(KEY);
      return (v === 'dark' || v === 'light') ? v : null;
    } catch { return null; }
  }

  const effective = () => stored() || (mq.matches ? 'dark' : 'light');

  function apply() {
    document.documentElement.setAttribute('data-theme', effective());
    sync();
  }

  /* Zieht jeden Schalter auf der Seite nach — auch den, der gerade
     nicht gedrückt wurde, und auch den, der von einem zweiten Tab
     aus umgestellt wird. Beim allerersten Lauf gibt es noch kein
     <body>; querySelectorAll findet dann nichts, und das ist in
     Ordnung. Die frisch gezeichneten Knöpfe holen sich ihren Zustand
     ohnehin aus segmentHTML(). */
  function sync() {
    const now = effective();
    document.querySelectorAll('[data-theme-set]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === now));
    });
  }

  apply();   // sofort, noch vor dem <body>

  mq.addEventListener?.('change', () => { if (!stored()) apply(); });

  /* Ein Listener für alle drei Orte. Delegiert am document, weil die
     Schalter in Markup stecken, das laufend neu gezeichnet wird
     (Session-Wechsel, Raum betreten, Reiterleiste) — Listener an
     ersetzten Knoten wären danach weg. */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-theme-set]');
    if (btn) window.MPTheme.set(btn.dataset.themeSet);
  });

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { apply(); fire(); }
  });

  function fire() {
    window.dispatchEvent(new CustomEvent('mpskills:theme', { detail: effective() }));
  }

  window.MPTheme = {
    /** 'light' | 'dark' — was gerade gilt. */
    get: effective,
    /** true, solange niemand selbst gewählt hat. */
    isAuto: () => stored() === null,
    /** 'light' | 'dark' setzen, null = zurück auf die Gerätevorgabe. */
    set(t) {
      try {
        if (t === 'light' || t === 'dark') localStorage.setItem(KEY, t);
        else localStorage.removeItem(KEY);
      } catch { /* siehe oben */ }
      apply();
      fire();
    },

    /* ── Das Markup ─────────────────────────────────────────────
       Zwei Knöpfe statt eines Umschalters: ein einzelner Eintrag
       „Dunkelmodus" müsste erst gelesen werden, um zu verraten, wo
       man gerade steht. Hier ist die geltende Antwort gefüllt, und
       die andere steht daneben.

       Gedrückt wird aria-pressed und nicht eine Klasse — der
       Zustand gehört zur Bedeutung des Knopfes und nicht zu seinem
       Aussehen; eine Sprachausgabe liest ihn damit mit.

         label  gesetzt  → mit Beschriftung davor (fürs Menü, wo
                           daneben lauter benannte Zeilen stehen)
                leer     → nur die zwei Knöpfe (Leisten, wo der
                           Platz knapp und der Zusammenhang klar ist)
         tone   'bar'    → auf dem dunklen Balken der Kopfzeile,
                           also --chrome-* statt der Seitenfarben

       data-ub="theme" steht mit drin und ist NICHT tot: das Menü in
       userbar.js schließt bei jedem Klick, der auf keinem [data-ub]
       landet. Ohne das Attribut klappte es beim Umschalten zu — und
       genau dabei will man ja sehen, was passiert. */
    segmentHTML({ label = '', tone = '' } = {}) {
      const now = effective();
      const b = (v, icon, name) =>
        `<button type="button" data-ub="theme" data-theme-set="${v}"`
        + ` aria-pressed="${now === v}" title="${name}" aria-label="${name}">${icon}</button>`;

      const seg =
        `<div class="ub-theme-seg${tone === 'bar' ? ' ub-theme-seg--bar' : ''}"`
        + ` role="group" aria-label="Hell oder dunkel">`
        + `${b('light', '☀', 'Hell')}${b('dark', '☾', 'Dunkel')}</div>`;

      return label
        ? `<div class="ub-theme"><span class="ub-theme-l">${label}</span>${seg}</div>`
        : seg;
    }
  };
})();
