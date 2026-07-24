// Kategorien-Katalog. Reine Daten — hier kann inhaltlich nachgeschärft
// werden, ohne Spiel-Logik anzufassen. Zielgruppe: 12–16 Jahre.
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};

  // sampleTexts: kurze Fake-Post-Zeilen (max ~26 Zeichen), die zufällig
  // als "Vorschaubereich" der Karte angezeigt werden. Bewusst plakativ.
  //
  // `icon` ist eine Iconify-ID (Material Design Icons, filled) — geladen
  // in render.js via https://api.iconify.design/<id>.svg
  const CATS = [
    // ─── GUT ───────────────────────────────────────────────────────────
    {
      id:'source_ok', type:'good', icon:'mdi:paperclip', label:'Quelle belegt', bonus:+10,
      handles:['@nachgehakt','@quelle_direkt','@doku.tv','@evidenz.de'],
      sampleTexts:['Studie verlinkt ↓','Original: uni-…','Beleg im Post']
    },
    {
      id:'factcheck', type:'good', icon:'mdi:check-decagram', label:'Faktencheck', bonus:+12,
      handles:['@correctiv','@dpa.faktencheck','@mimikama'],
      sampleTexts:['Faktencheck ✓','Behauptung geprüft','Falschmeldung entlarvt']
    },
    {
      id:'pubmedia', type:'good', icon:'mdi:bank', label:'Öffentl.-rechtlich', bonus:+10,
      handles:['@tagesschau','@ARDde','@ZDFheute','@NDR'],
      sampleTexts:['Redaktion prüft','Aktuelle Meldung','tagesschau.de']
    },
    {
      id:'science', type:'good', icon:'mdi:flask', label:'Wissenschaft', bonus:+15,
      handles:['@maiLab','@harald.lesch','@spektrum.de'],
      sampleTexts:['Peer-reviewed','Neue Studie','Studienlage klar']
    },
    {
      id:'ai_labeled', type:'good', icon:'mdi:label', label:'KI transparent', bonus:+8,
      handles:['@ai.erklaert','@promptlab.de','@midjourney_daily','@ki.transparent'],
      sampleTexts:['Bild: KI-generiert','#AIgenerated','Made with AI']
    },

    // ─── SCHLECHT ──────────────────────────────────────────────────────
    {
      id:'clickbait', type:'bad', icon:'mdi:alert-decagram', label:'Klickbait', bonus:-15,
      handles:['@viral.clips','@krass.news','@nurheute24'],
      sampleTexts:['DU WIRST NIE…','SCHOCK! Er hat…','Nummer 7 ist irre']
    },
    {
      id:'no_source', type:'bad', icon:'mdi:help-circle', label:'Ohne Quelle', bonus:-10,
      handles:['@einfach.so','@irgendwer_23','@saghmalso','@unbelegt'],
      sampleTexts:['Ich habe gehört…','Freund sagt:','Alle wissen doch…']
    },
    {
      id:'conspiracy', type:'bad', icon:'mdi:eye', label:'Verschwörung', bonus:-20,
      handles:['@wahrheit_247','@wach_auf_de','@augen_offen','@die_anderen'],
      sampleTexts:['Was DIE verheimlichen','Wach auf!','Alles gesteuert']
    },
    {
      id:'urgency', type:'bad', icon:'mdi:clock-alert', label:'FOMO / Dringlichkeit', bonus:-12,
      handles:['@nur_heute','@sofort.teilen','@last.chance','@bevor_zu_spaet'],
      sampleTexts:['NUR HEUTE!','Sofort teilen!','Bevor es zu spät ist']
    },
    {
      id:'ai_hidden', type:'bad', icon:'mdi:incognito', label:'KI (versteckt)', bonus:-18,
      handles:['@perfect.people','@dreamlife_hd','@too.good.real','@notreal.gram'],
      sampleTexts:['So schön echt','Unglaublich real','Kein Filter, ehrlich']
    }
  ];

  const BY_ID = Object.fromEntries(CATS.map(c => [c.id, c]));
  const GOOD = CATS.filter(c => c.type === 'good');
  const BAD  = CATS.filter(c => c.type === 'bad');

  // Kategorien-Rampe: die ersten paar Zeilen ziehen nur aus diesem
  // kleineren Pool, damit Anfänger nicht sofort mit 10 Zeichen überflutet
  // werden. Nach 15 Zeilen erweitern wir auf alle.
  const STARTER_GOOD = ['source_ok','pubmedia'];
  const STARTER_BAD  = ['clickbait','urgency'];

  function pickHandle(cat){
    return cat.handles[(Math.random() * cat.handles.length) | 0];
  }
  function pickSampleText(cat){
    return cat.sampleTexts[(Math.random() * cat.sampleTexts.length) | 0];
  }

  FE.categories = {
    ALL: CATS,
    GOOD, BAD,
    BY_ID,
    STARTER_GOOD, STARTER_BAD,
    pickHandle, pickSampleText
  };
})();
