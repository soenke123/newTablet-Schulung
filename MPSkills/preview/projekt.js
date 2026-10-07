/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/projekt.js   ·   Schaufenster für die Projektarbeit
   ══════════════════════════════════════════════════════════════
   Wie bei der Scrum Werkstatt läuft im Modal die ECHTE Projektarbeit
   im Rahmen, mit ?demo=1 — dann spielt sie die Lehrkraft einer
   Beispielklasse (siehe tools/Projektarbeit/bridge.js, DEMO) und
   merkt sich nichts. Das Drehbuch zeigt die Übersicht, öffnet den
   Planungsraum der Gruppe mit dem offenen Antrag und blättert durch
   Board, Stunden und Anträge.

   Das Standbild für die Kachel ist ein leichter Nachbau der
   Übersicht: links die Lobby, rechts drei Gruppenkarten, an einer
   die rote Zahl. Feste Farben aus dem Kleid der Projektarbeit
   (Papier, Petrol, Marker) — es kippt nicht in den Darkmode.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'Projektarbeit', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  async function play(api) {
    if (!await api.waitFor('[data-open]', 6000)) return;
    if (!await api.wait(3200)) return;
    api.click('[data-open]');
    if (!await api.wait(2600)) return;
    api.click('.tab[data-view="work"]');
    if (!await api.wait(3000)) return;
    api.click('.tab[data-view="hours"]');
    if (!await api.wait(2600)) return;
    api.click('.tab[data-view="requests"]');
    if (!await api.wait(2800)) return;
    api.click('#btnBack');
    await api.wait(1500);
  }

  function tile() {
    const chip = (x, y, w, c) => `
      <rect x="${x}" y="${y}" width="${w}" height="15" rx="7.5" fill="#f2eee5" stroke="#d9d2c2"/>
      <circle cx="${x + 7.5}" cy="${y + 7.5}" r="5" fill="${c}"/>
      <rect x="${x + 16}" y="${y + 5.5}" width="${w - 26}" height="4" rx="2" fill="rgba(0,0,0,.22)"/>`;
    const card = (x, y, open, n, badge) => `
      <rect x="${x}" y="${y}" width="106" height="72" rx="7" fill="#fbf9f4" stroke="#d9d2c2"/>
      <rect x="${x}" y="${y}" width="3.5" height="72" rx="1.5" fill="${badge ? '#d23a2c' : open ? '#1d5955' : '#d9d2c2'}"/>
      <rect x="${x + 10}" y="${y + 9}" width="54" height="5.5" rx="2.5" fill="#1b1a16"/>
      ${Array.from({ length: n }, (_, i) => chip(x + 9, y + 20 + i * 17, 70, ['#ca5a1c', '#2b6694', '#2d7a4d'][i % 3])).join('')}
      ${open ? `<rect x="${x + 60}" y="${y + 58}" width="40" height="9" rx="3" fill="#1d5955"/>` : ''}
      ${badge ? `<circle cx="${x + 104}" cy="${y + 2}" r="8" fill="#d23a2c" stroke="#fff" stroke-width="2"/>
        <text x="${x + 104}" y="${y + 5.5}" font-size="9.5" font-weight="700" fill="#fff" text-anchor="middle">${badge}</text>` : ''}`;
    return `<div class="tprev" aria-hidden="true" style="background:#e8e2d5">
      <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">
        <rect x="0" y="0" width="340" height="22" fill="#17302e"/>
        <circle cx="14" cy="11" r="6" fill="#ca5a1c"/>
        <text x="26" y="15" font-size="9" font-weight="700" fill="#eef3f1">Projektarbeit · Klasse 8b</text>
        <rect x="8" y="32" width="96" height="150" rx="8" fill="#fbf9f4" stroke="#d9d2c2"/>
        <text x="16" y="47" font-size="8.5" font-weight="700" fill="#514d43">LOBBY</text>
        ${chip(14, 55, 84, '#7a3f6d')}${chip(14, 74, 84, '#8a5a1a')}${chip(14, 93, 84, '#53407e')}
        ${card(114, 32, true, 2, 1)}${card(226, 32, true, 2, 0)}${card(114, 112, false, 2, 0)}
        <rect x="226" y="112" width="106" height="68" rx="7" fill="none" stroke="#c9c0ac" stroke-dasharray="4 3"/>
        <text x="279" y="149" font-size="8" font-weight="600" fill="#837d6e" text-anchor="middle">+ neue Gruppe</text>
      </svg>
    </div>`;
  }

  window.MPPreview.register('projekt', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Gruppenarbeit über Wochen: Alle treten dem Raum bei und stehen in der
         <strong>Lobby</strong>. Die Lehrkraft zieht sie per Drag &amp; Drop zu Gruppen
         zusammen und öffnet für jede Gruppe — oder Einzelperson — einen
         <strong>Planungsraum</strong>.</p>
      <p>Darin: <strong>Projektziel</strong> mit Fertig-Datum, die <strong>To-dos</strong> mit Zeitschätzung,
         die <strong>Dokumentation</strong>, <strong>Anträge</strong> für das Lernen außerhalb
         des Schulgeländes (eine rote Zahl in der Übersicht zeigt, wo einer wartet), das Team mit den
         Einwilligungen der Eltern und die Regeln. Eine Klassenliste zeigt, wer heute woanders lernt.
         Jede:r bekommt einen persönlichen Code und findet das Projekt damit auf jedem Gerät wieder.</p>`
  });
})();
