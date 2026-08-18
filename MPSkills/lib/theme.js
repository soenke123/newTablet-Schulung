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

   Folge, und sie ist gewollt: der Umschalter sitzt im Menü hinter
   dem eigenen Namen (lib/userbar.js) und steht damit nur
   Angemeldeten zur Verfügung. Alle anderen — Gäste auf der Landing
   und die ganze Schülerseite — bekommen, was ihr Gerät sagt. Das
   ist dort auch die bessere Antwort: wer abends im Dunkeln sein
   Handy auf Dunkel gestellt hat, will nicht erst eine Einstellung
   suchen, die es für ihn ohnehin nur einmal gibt.

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
  }

  apply();   // sofort, noch vor dem <body>

  mq.addEventListener?.('change', () => { if (!stored()) apply(); });

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
    }
  };
})();
