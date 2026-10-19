/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/balance.js   ·   Schaufenster für Balance of Nature
   ══════════════════════════════════════════════════════════════
   Im Modal läuft die ECHTE Simulation im Rahmen, mit ?demo=1 — dann
   erzählt sie ihre Geschichte von selbst (tools/balance of nature/
   js/ui/demo.js): die Insel mit Wölfen und Hirschen samt Seitenleiste
   und echten Diagrammen (Jahresmittel, 90 Jahre im Zeitraffer), dann
   landen Menschen, legen eine Schafweide an, und die Schafe brechen
   aus. Die Schleife steckt im Rahmen; das Drehbuch hier wartet nur.

   Das Standbild für die Kachel: ein Bild der Insel (aus der echten
   Karte, assets/vorschau_insel.jpg) mit einem kleinen Diagramm der
   zwei versetzten Wellen darüber. Feste Farben wie in der App, die
   ihr eigenes Kleid hat und nicht in den Darkmode kippt.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';
  const IMG = 'tools/balance%20of%20nature/assets/vorschau_insel.jpg';

  function view() {
    return { role: ROLE, room: { title: 'Balance of Nature', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  async function play(api) {
    if (!await api.waitFor('.chart canvas', 15000)) return;
    await api.wait(60000);
  }

  function wave(shift, amp, base) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const x = 8 + i * 2.4;
      const y = base - amp * Math.sin(i / 60 * 2 * Math.PI * 3.2 - shift);
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    return pts.join(' ');
  }

  function tile() {
    return `<div class="tprev" aria-hidden="true" style="background:#14435f url(${IMG}) center/cover no-repeat">
      <svg viewBox="0 0 160 70" style="position:absolute;left:8px;bottom:8px;width:52%;height:auto;
           background:rgba(16,53,75,.88);border:1px solid #2d6684;border-radius:8px">
        <text x="8" y="11" font-size="7" font-weight="700" fill="#e8f1f4">Bestand</text>
        <text x="152" y="11" font-size="6" fill="#f2c94c" text-anchor="end">90 Jahre</text>
        <line x1="8" x2="152" y1="62" y2="62" stroke="#e8f1f4" stroke-opacity=".25"/>
        <polyline points="${wave(0, 14, 38)}" fill="none" stroke="#d95926" stroke-width="2" stroke-linejoin="round"/>
        <polyline points="${wave(Math.PI / 2, 10, 46)}" fill="none" stroke="#9085e9" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>`;
  }

  window.MPPreview.register('balance', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Eine <strong>Insel mit eigenem Ökosystem</strong>: Zwerghirsche, Laufvögel, Inselwölfe und
         Inseladler, dazu Pflanzen, Jahreszeiten und gute wie magere Jahre. Die Klasse
         programmiert nichts, sie <strong>beobachtet und greift ein</strong>.</p>
      <p>Im Raum gibt es <strong>vier Szenarien</strong>: Wolf und Hirsch · Adler und Laufvogel ·
         alle vier · alle vier mit Menschen. Die Lehrkraft startet sie für sich oder
         <strong>teilt</strong> sie mit der Klasse und kann sie wieder entziehen. Hinter dem
         <em>i</em> jeder Kachel stehen kurze Infos für den Unterricht: Räuber-Beute-Wellen,
         knappe Nahrung, eingeschleppte Arten.</p>
      <p>Jedes Tablet rechnet seine eigene Insel. Diagramme, Todesursachen und Karten für die
         Menschen (Landung, Schafweide, Jagd, Ratten …) gehören dazu. Der Skill ist noch in der
         <strong>Beta</strong>.</p>`
  });
})();
