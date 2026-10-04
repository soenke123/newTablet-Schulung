/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — tool.js   ·   Das Live-Quiz der Klasse
   ══════════════════════════════════════════════════════════════
   Ein Werkzeug, zwei Rollen (lib/tool.js): am Beamer steht die
   Frage, auf den Tablets stehen die Antworten. Wer was sieht, ist
   keine Geschmacksfrage, sondern die Spielregel:

     Beamer    Frage · Uhr · vier Antwortfelder · Auflösung mit den
               fünf Ersten und den Füllständen · Siegerehrung.
     Tablet    Das EIGENE Wesen und vier Antwortfelder. KEINE Frage
               — sonst sehen 28 Köpfe nach unten statt nach vorn.
               In der Auflösung: der Nachbar vor mir, ich, der
               Nachbar hinter mir. Unten vier Emote-Knöpfe.

   ── Was hier anders ist als in der ersten Fassung ─────────────

   1. EIN Bild passt auf EINEN Bildschirm. Der Rahmen wird gemessen
      (fit(), wie NeuroLab und Cäsar) und gibt seine Höhe als
      --ks-h weiter; alles darin rechnet daraus. Vorher stand
      `min-height: 100vh` im tool.css — und weil über dem Werkzeug
      die Kopfzeile und die Reiterleiste stehen, war die Bühne
      garantiert höher als der Bildschirm. Auf dem Beamer sah das
      aus wie ein Fehler, und auf dem Tablet fehlte der vierte
      Antwortknopf.

   2. Es wird GEFLICKT, nicht neu gebaut. Ein `innerHTML =` je Takt
      reißt jede CSS-Animation ab: die Wesen atmeten nicht, ein
      Winken dauerte höchstens einen Takt, und die Uhr sprang. Jetzt
      entsteht das DOM einmal je Bild (frameKey) und danach ändern
      sich nur Zahlen, Breiten und Emote-Klassen.

   3. Die Emote-Klassen heißen jetzt so, wie sie in creatures.css
      wirklich stehen: `wave-7 state-wave`, `cheer-7 state-cheer`,
      `c-dance-7 state-dance`. Vorher standen dort `c-wave`,
      `c-cheer`, `c-sad` — Klassen, die es nirgends gibt. Deshalb
      hat in der ersten Fassung KEIN Emote etwas getan, und es sah
      aus, als käme der Klick nicht an.

   4. Kein PIN und kein QR-Code mehr im Werkzeug. Beides stand
      vorher hier — und blieb leer, weil es dafür ctx.room.code und
      MPRoom.qrSVG gebraucht hätte, und keines von beiden gibt es.
      Es gehört auch nicht hierher: der Code steht in der
      Reiterleiste auf JEDEM Fach, der QR-Code am Griff am rechten
      Rand (lehrer.js). Ein zweiter Ort für dieselbe Sache wäre der,
      der irgendwann nicht mitgezogen wird.

   5. Kein Namensfeld. Den Namen hat das Kind beim Betreten des
      Raums schon eingegeben (j.js) — hier noch einmal danach zu
      fragen, erzeugte zwei Namen für ein Kind.

   6. Die Uhr läuft auf dem Server ab (Migration 0175). Diese Datei
      zeigt sie nur an; bei 0 holt sie einmal nach. Vorher schaltete
      sie selbst weiter — und wenn der Beamer-Tab im Hintergrund
      lag, drosselte der Browser den Takt und die Frage blieb offen.
      Dazu wird die Uhr gegen `server_now` gestellt: ein iPad, das
      zwei Minuten falsch geht, zeigte sonst zwei Minuten falsch.

   7. Die Antworten erscheinen auf ALLEN Geräten im selben Augenblick
      (Oktober 2026). Die 5 Sekunden Vorlesezeit (0178) reichen dafür
      nur, wenn jedes Gerät die Serveruhr genau kennt. Vorher wurde
      `skew` aus einer einzigen Antwort gesetzt und die Laufzeit der
      Antwort vergessen: ein Tablet im vollen WLAN, bei dem die
      Antwort eine Sekunde unterwegs war, deckte eine Sekunde zu spät
      auf. Jetzt wie bei NTP: jeder Aufruf misst Hin- und Rückweg,
      der Server stand in der Mitte, und es gilt die Messung mit dem
      kürzesten Weg (`uhrProbe`). Aufgedeckt wird nicht beim nächsten
      250-ms-Schlag, sondern mit einem Wecker auf die Millisekunde
      (`weckerAufdecken`). Die Zeit, die ein Tipp zum Server braucht,
      rechnet ks_answer seit 0189 nicht mehr gegen das Kind.

   ── Cache ─────────────────────────────────────────────────────
   ASSET_V gilt für creatures.js UND creatures.css. Beides wird von
   hier geladen und nicht per @import aus dem tool.css: sonst gäbe
   es zwei Stempel für dieselbe Sache, und der zweite wäre der
   vergessene. Der Stempel dieser Datei selbst steht in lib/tool.js
   — und dessen eigener in j.html, lehrer.html, insel.html und
   lib/preview.js (siehe Kopf von lib/tool.js: fünf Stellen).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const ASSET_V = '20261004a';

  /* Takt je Phase, in Millisekunden. Während der Frage muss der
     Beamer zügig mitzählen („17 von 28 haben geantwortet") — in der
     Lobby reicht gemütlich. Das Tablet fragt etwas seltener: 28
     Geräte im Sekundentakt sind 28 Anfragen je Sekunde, und zu
     sehen gibt es dort während der Frage ohnehin nur die Uhr, und
     die läuft lokal. In Lobby und Auflösung aber nicht zu selten:
     von dort startet die nächste Frage, und das Tablet muss davon
     wissen, bevor die 5 Sekunden Vorlesezeit um sind. */
  const TAKT = {
    presenter:   { lobby: 2500, question: 1000, reveal: 1500, ended: 2500 },
    participant: { lobby: 2000, question: 1500, reveal: 1500, ended: 3000 }
  };

  const LABELS  = ['A', 'B', 'C', 'D'];
  /* Fünf Knöpfe, und der Sprung ist der fünfte. Er lag von Anfang
     an fertig da — creatures.css hat 36 eigene Sprünge, ks_emote
     lässt 'jump' durch (Migration 0175), und das Zeichen stand
     unten in EMOTE_ICON. Nur in dieser Liste fehlte er, also gab es
     keinen Knopf dafür. Nachgetragen am 26.09.2026. */
  /* Die Knopfzeichen sind eigene, geometrische SVGs und keine Emojis.
     Jedes hat seine eigene Farbwelt: --c (kräftig) und --c2 (heller),
     gesetzt am <svg> und am Knopf. Formen: .p/.q gefüllt, .l/.m
     als Linie. */
  const ICO = (c, c2, inner) => '<svg class="ks-ico" viewBox="0 0 24 24" aria-hidden="true" style="--c:'
    + c + ';--c2:' + c2 + '">' + inner + '</svg>';
  const STAR = (x, y, r, cls) => '<path class="' + cls + '" d="M' + x + ' ' + (y - r) + 'C' + (x + r * .15) + ' ' + (y - r * .3) + ' ' + (x + r * .3) + ' ' + (y - r * .15) + ' ' + (x + r) + ' ' + y
    + 'C' + (x + r * .3) + ' ' + (y + r * .15) + ' ' + (x + r * .15) + ' ' + (y + r * .3) + ' ' + x + ' ' + (y + r)
    + 'C' + (x - r * .15) + ' ' + (y + r * .3) + ' ' + (x - r * .3) + ' ' + (y + r * .15) + ' ' + (x - r) + ' ' + y
    + 'C' + (x - r * .3) + ' ' + (y - r * .15) + ' ' + (x - r * .15) + ' ' + (y - r * .3) + ' ' + x + ' ' + (y - r) + 'z"/>';
  const ICONS = {
    // Offene Hand, leicht gekippt, als würde sie winken
    wave:  ICO('#22d3ee', '#a5f3fc',
      '<g transform="rotate(14 12 13)">'
      + '<rect class="q" x="6.200" y="4.500" width="3.200" height="10" rx="1.600"/>'
      + '<rect class="q" x="9.800" y="2.500" width="3.200" height="12" rx="1.600"/>'
      + '<rect class="q" x="13.400" y="3" width="3.200" height="11.500" rx="1.600"/>'
      + '<rect class="q" x="17" y="5.500" width="3.200" height="9" rx="1.600"/>'
      + '<rect class="q" x="2.200" y="11.500" width="3.200" height="8" rx="1.600" transform="rotate(-38 3.800 15.500)"/>'
      + '<rect class="p" x="5.600" y="11" width="14.600" height="10.500" rx="5"/></g>'),
    // Doppelter Aufwärtsschub
    jump:  ICO('#a3e635', '#d9f99d',
      '<path class="l" d="M4.500 11.500L12 4l7.500 7.500"/>'
      + '<path class="m" d="M4.500 19L12 11.500 19.500 19"/>'),
    // Große Glitzersterne
    cheer: ICO('#facc15', '#fde68a',
      STAR(11, 13, 9.500, 'p') + STAR(20, 4.500, 3.500, 'q') + STAR(3.800, 4.800, 2.600, 'q')),
    // Zwei verbundene Noten
    dance: ICO('#f472b6', '#fbcfe8',
      '<path class="q" d="M8.800 5.500l12.400-2.300v4.600L8.800 10.200z"/>'
      + '<rect class="p" x="8.800" y="5" width="2.400" height="13" rx="1.200"/>'
      + '<rect class="p" x="18.800" y="3" width="2.400" height="13" rx="1.200"/>'
      + '<ellipse class="p" cx="7" cy="18.500" rx="3.800" ry="3.100" transform="rotate(-18 7 18.500)"/>'
      + '<ellipse class="p" cx="17" cy="16.500" rx="3.800" ry="3.100" transform="rotate(-18 17 16.500)"/>'),
    // Mond mit Stern
    sleep: ICO('#a78bfa', '#ddd6fe',
      '<path class="p" d="M19.500 15A9 9 0 1 1 9 4.500a7.200 7.200 0 0 0 10.500 10.500z"/>'
      + STAR(18.500, 5.500, 3.600, 'q')),
    // Regenwolke
    sad:   ICO('#60a5fa', '#bfdbfe',
      '<path class="p" d="M7 15a4.500 4.500 0 0 1-.4-9A6.200 6.200 0 0 1 18 7.400 3.800 3.800 0 0 1 17.500 15z"/>'
      + '<path class="m" d="M8 18l-1.200 3M13 18l-1.200 3M18 18l-1.200 3"/>')
  };
  const EMOTES  = [
    { id: 'wave',  icon: ICONS.wave,  title: 'Winken',   c: '#22d3ee' },
    { id: 'jump',  icon: ICONS.jump,  title: 'Springen', c: '#a3e635' },
    { id: 'cheer', icon: ICONS.cheer, title: 'Jubeln',   c: '#facc15' },
    { id: 'dance', icon: ICONS.dance, title: 'Tanzen',   c: '#f472b6' },
    { id: 'sleep', icon: ICONS.sleep, title: 'Schlafen', c: '#a78bfa' }
  ];
  const EMOTE_ICON = ICONS;

  /* Wie lange ein Emote zu sehen ist. MUSS zu den 3,5 Sekunden in
     Migration 0175 passen: der Server gibt ein älteres Emote nicht
     mehr heraus, und was hier länger stehenblieb, verschwände beim
     nächsten Takt mitten in der Bewegung. */
  const EMOTE_MS = 3500;

  /* Die Fehler, die nur dieses Werkzeug kennt. Die generischen
     stehen in lib/tool.js und werden von dort geerbt; durchgereicht
     werden kann eine eigene Liste nicht (makeCtx bekommt `errors`
     nur von der Seite), also steht sie hier davor. Ohne das läse die
     Lehrkraft „Unerwarteter Fehler (no_questions)" — und das ist
     keine Auskunft, sondern ein Rätsel. */
  const EIGENE = {
    no_questions:       'In diesem Fragenkatalog steht keine einzige Frage. '
                      + 'Wähle oben einen anderen.',
    not_active:         'Diese Frage ist schon vorbei.',
    time_up:            'Die Zeit war um.',
    already_answered:   'Du hast schon geantwortet.',
    reading_phase:      'Die Frage wird noch vorgelesen — gleich geht es los!',
    question_not_found: 'Diese Frage gibt es nicht mehr — der Katalog hat sich geändert.',
    phase_locked:       'Das geht nur zwischen zwei Fragen.',
    image_too_big:      'Ein Foto ist zu groß zum Speichern. Bitte ein kleineres nehmen.'
  };
  const fehlerText = code => EIGENE[code] || ctx.errText(code);

  /* ─── Zustand ───────────────────────────────────────────── */
  let root = null, ctx = null, role = null;
  let frame = null;              // der gemessene Rahmen
  let stage = null;              // das Bild darin
  let els = {};                  // benannte Stellen des aktuellen Bildes
  let pollTimer = null, clockTimer = null, onResize = null;
  let destroyed = false, busy = false;
  let lastSig = null, lastFrame = null, view = null;
  let skew = 0;                  // Serveruhr minus Geräteuhr, in ms
  let uhrProben = [];            // [{ off, rtt, at }] — siehe uhrProbe
  let aufdeckT = null;           // Wecker fürs Aufdecken der Antworten
  let myCreature = 0, mySkin = 0;
  let profileT = null;           // Entprellung des Wesen-Speicherns
  let localEmote = null, localEmoteT = null;
  let answering = false;         // gedrückt, Antwort noch unterwegs
  let catalogs = [];
  /* Die Wesenwahl nach der Siegerehrung. Sie steckt im frameKey und
     nicht in einem <details>: ein aufgeklappter Kasten wäre beim
     nächsten Takt wieder zu — und sie muss auch dann stehenbleiben,
     wenn nebenher noch Punkte und Emotes hereinkommen. */
  let pickerOffen = false;
  /* ─── Editor ────────────────────────────────────────────── */
  // KSEditor.create(…) aus editor.js — Zustand und Bedienung stehen
  // dort, weil derselbe Editor auch ohne Raum läuft (quiz.html).
  // Hier nur: wann er das Beamer-Bild übernimmt.
  let editor = null;
  /* Das Foto der laufenden Frage am Beamer. Es steht NICHT in der
     Ansicht (die kommt bei jeder Antwort neu), sondern wird einmal je
     Frage über ks_room_image geholt und hier gemerkt (Migration 0186). */
  let bild = { qid: null, src: null, laedt: false };
  /* Wer in der letzten Auflösung wo auf dem Podest stand — daraus
     weiß die nächste, wer wohin laufen muss. pid → { rank, cid, skin } */
  let podestVorher = new Map();

  /* ══════════════════════════════════════════════════════════
     Bausteine
     ══════════════════════════════════════════════════════════ */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Die Klassen, mit denen creatures.css ein Wesen bewegt. Der Name
     trägt die Wesen-Nummer, weil jedes der 36 Wesen sein eigenes
     Winken hat (ein Krebs winkt mit der Schere). `state-…` schaltet
     zusätzlich das Gesicht um. */
  function emoteClass(emote, cid) {
    if (!emote || emote === 'idle') return 'c-idle';
    if (emote === 'dance') return 'c-dance-' + cid + ' state-dance';
    // Klatschen gibt es nur als gemeinsame Bewegung (creatures.css),
    // kein Wesen klatscht anders — also keine Klasse mit Nummer.
    if (emote === 'clap') return 'state-clap';
    return emote + '-' + cid + ' state-' + emote;
  }

  function wesen(cid, skin, emote, sizeCss) {
    const id = Number(cid) || 0;
    const inner = (window.KSCreatures && window.KSCreatures.svg)
      ? window.KSCreatures.svg(id, Number(skin) || 0, emoteClass(emote, id), null)
      : '<svg class="creature-svg" viewBox="0 0 100 100"></svg>';
    return '<span class="ks-wesen"'
      + (sizeCss ? ' style="--ks-wsize:' + sizeCss + '"' : '') + '>' + inner + '</span>';
  }

  /* Ein bestehendes Wesen umschalten, ohne das SVG neu zu bauen —
     sonst fängt das Atmen bei jedem Takt von vorn an.

     `host` ist immer das FENSTER, in dem das Wesen steht (.ks-kpic,
     .ks-spic, .ks-npic, .ks-ipic, .ks-tme, die Vorschau) und nie das
     SVG selbst. Daran hängt `ks-springt`: nur während eines Sprungs
     darf das Fenster offen sein, damit das Wesen darüber
     hinauskommt (siehe tool.css). Die Zeile steht VOR dem Vergleich
     der SVG-Klasse — sonst bliebe das Fenster offen, wenn das Emote
     sich nicht geändert hat. */
  function setEmote(host, emote, cid) {
    if (!host) return;
    const svg = host.matches && host.matches('svg') ? host : host.querySelector('svg');
    if (!svg) return;
    if (host.classList) host.classList.toggle('ks-springt', emote === 'jump');
    const want = 'creature-svg ' + emoteClass(emote, cid);
    if (svg.getAttribute('class') !== want) svg.setAttribute('class', want);
  }

  const pkt = n => (Number(n) || 0).toLocaleString('de-DE');

  const wesenDaten = cid => ((window.KSCreatures && window.KSCreatures.list) || [])
    .find(c => c.id === (cid | 0)) || null;
  const wesenName = cid => (wesenDaten(cid) || {}).name || '';

  /* Die drei Farbknöpfe. Sie tragen die Namen aus creatures.js
     („Neon Slime") und nicht „Farbe 1" — dieselbe Benennung wie im
     Showroom, und ein Name bleibt im Kopf, wo eine Zahl nichts sagt.
     Weil sie je Wesen anders heißen, werden sie beim Wechsel des
     Wesens mitgezogen (malVorschau). */
  function skinKnoepfe() {
    const namen = (wesenDaten(myCreature) || {}).skins || ['Farbe 1', 'Farbe 2', 'Farbe 3'];
    return namen.map((n, s) => '<button type="button" class="ks-skin'
      + (s === mySkin ? ' is-on' : '') + '" data-skin="' + s + '">'
      + esc(n) + '</button>').join('');
  }

  function deltaHTML(d) {
    const v = Number(d) || 0;
    const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'same';
    const txt = v > 0 ? '▲ ' + v : v < 0 ? '▼ ' + Math.abs(v) : '–';
    return '<span class="ks-delta ks-delta--' + cls + '">' + txt + '</span>';
  }

  /* ══════════════════════════════════════════════════════════
     Höhe: einmal gemessen, überall gerechnet
     ══════════════════════════════════════════════════════════
     Über dem Rahmen steht je Rolle etwas anderes (Kopfzeile,
     Reiterleiste), und je Breite ist das unterschiedlich hoch.
     getBoundingClientRect().top ist die einzige Angabe, die das
     ohne eine Liste von Sonderfällen beantwortet — dieselbe
     Rechnung wie in tools/NeuroLab/tool.js.

     Genommen wird `--vv-h` (viewport.js) und nicht innerHeight:
     auf dem iPad steht beim Tippen die Tastatur im Bild, und
     innerHeight weiß davon nichts.                             */
  const LUFT = 10;
  /* Die Untergrenze. 240 und nicht 380: ein Handy im Querformat ist
     390 Punkte hoch, davon gehen Kopfzeile und Reiterleiste ab — es
     bleiben knapp 280. Mit 380 schob sich der Rahmen 99 Punkte unter
     die Bildschirmkante, und genau dort steht auf dem Tablet die
     vierte Antwortkachel. 240 ist die Höhe, bei der ein Kopf, ein
     Zeitbalken und vier Kacheln mit 48 Punkten noch hineingehen. */
  const MIN = 240;

  function raumDarunter(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fit() {
    if (!frame) return;
    const sicht = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--vv-h')) || window.innerHeight;
    const top = frame.getBoundingClientRect().top;
    const h = Math.max(MIN, Math.round(sicht - top - raumDarunter(frame) - LUFT));
    frame.style.height = h + 'px';
    frame.style.setProperty('--ks-h', h + 'px');
    /* Unter 360 Punkten wird es eng — ein Handy im Querformat, oder
       ein iPad mit offener Tastatur. Dann fällt weg, was begleitet
       (Hinweise, der Name des Wesens), damit stehen bleibt, was
       bedient wird. Als Klasse und nicht als Media Query: gemessen
       wird der RAHMEN und nicht der Bildschirm, und dazwischen liegt
       die halbe Seite. */
    frame.classList.toggle('ks-frame--flach', h < 360);
  }

  /* ══════════════════════════════════════════════════════════
     Die Uhr & Vorlesezeit (5 Sekunden)
     ══════════════════════════════════════════════════════════ */
  const READ_TIME_SEC = 5;

  /* Der Auftritt vor der ersten Frage („Quiz startet", Oktober 2026).
     Er steht NICHT in einer eigenen Phase, sondern in der Vorlesezeit
     der ersten Frage: ks_step legt phase_ends_at dieser einen Frage
     INTRO_SEC weiter nach hinten (Migration 0191), und was über den
     5 Sekunden Vorlesezeit liegt, ist Auftritt. So kennt jedes Gerät
     den Moment, in dem die Frage kommt, aus derselben Serveruhr —
     und ein Tablet, das mittendrin neu lädt, steigt an der richtigen
     Stelle ein. MUSS zu v_intro in Migration 0191 passen. Ohne die
     Migration ist der Rest nie größer als 5 Sekunden: dann gibt es
     keinen Auftritt, und alles läuft wie vorher. */
  const INTRO_SEC = 10;
  const INTRO_MS  = INTRO_SEC * 1000;

  /* Zeitstempel vom Server lesen. Postgres schreibt Mikrosekunden
     („…:05.123456+00:00"); darauf hat sich Safari früher verschluckt
     und NaN geliefert — dann gab es keine Vorlesezeit, und das
     iPad zeigte die Antworten sofort. Deshalb von Hand. */
  function zeit(s) {
    if (!s) return NaN;
    const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)(?:[.,](\d+))?\s*(Z|[+-]\d\d(?::?\d\d)?)?$/i
      .exec(String(s).trim());
    if (!m) return new Date(s).getTime();
    const ms = m[7] ? Number((m[7] + '00').slice(0, 3)) : 0;
    let t = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
    const z = m[8];
    if (z && z.toUpperCase() !== 'Z') {
      const sg = z[0] === '-' ? -1 : 1;
      const d = z.slice(1).replace(':', '');
      t -= sg * (Number(d.slice(0, 2)) * 60 + Number(d.slice(2, 4) || 0)) * 60000;
    }
    return t;
  }

  /* Uhrabgleich wie bei NTP. t0 = abgeschickt, t1 = angekommen; der
     Server las seine Uhr irgendwo dazwischen, am wahrscheinlichsten
     in der Mitte. Der Fehler ist höchstens der halbe Weg — also gilt
     die Probe mit dem kürzesten Weg unter den letzten zwölf (ältere
     als zehn Minuten fliegen raus: Geräteuhren laufen weg). */
  function uhrProbe(t0, t1, serverNow) {
    const s = zeit(serverNow);
    if (isNaN(s) || !(t1 >= t0)) return;
    uhrProben.push({ off: s - (t0 + t1) / 2, rtt: t1 - t0, at: t1 });
    uhrProben = uhrProben.filter(p => t1 - p.at < 600000).slice(-12);
    let best = uhrProben[0];
    uhrProben.forEach(p => { if (p.rtt < best.rtt) best = p; });
    skew = best.off;
  }

  async function gemessen(fn, args) {
    const t0 = Date.now();
    const r = await ctx.actions.call(fn, args);
    if (r && r.server_now) uhrProbe(t0, Date.now(), r.server_now);
    return r;
  }

  function restMs() {
    if (!view || !view.phase_ends_at) return null;
    const ende = zeit(view.phase_ends_at);
    if (isNaN(ende)) return null;
    return ende - (Date.now() + skew);
  }

  function isReadingPhase() {
    if (!view || view.phase !== 'question' || !view.phase_ends_at) return false;
    const ms = restMs();
    if (ms == null) return false;
    const lim = ((view.question && view.question.time_limit) || 20) * 1000;
    return ms > lim;
  }

  function readingRestSec() {
    const ms = restMs();
    if (ms == null) return 0;
    const lim = ((view.question && view.question.time_limit) || 20) * 1000;
    return Math.max(0, Math.ceil((ms - lim) / 1000));
  }

  /* Läuft gerade der Auftritt? Nur bei der ersten Frage, und nur,
     solange mehr als die 5 Sekunden Vorlesezeit übrig sind. */
  function introAn() {
    if (!view || view.phase !== 'question' || (view.current_q_idx | 0) !== 0) return false;
    if (!view.phase_ends_at) return false;
    const ms = restMs();
    if (ms == null) return false;
    const lim = ((view.question && view.question.time_limit) || 20) * 1000;
    return ms - lim > READ_TIME_SEC * 1000;
  }

  // Wie weit der Auftritt ist (0 … INTRO_MS) — für den Einstieg mittendrin.
  function introVorbei() {
    const ms = restMs();
    if (ms == null) return 0;
    const lim = ((view.question && view.question.time_limit) || 20) * 1000;
    return klemme(INTRO_MS - (ms - lim - READ_TIME_SEC * 1000), 0, INTRO_MS);
  }

  function clockTick() {
    const ms = restMs();
    if (ms == null) return;
    // Der Auftritt ist zu Ende: das Bild wechselt zur Frage.
    if (lastFrame && lastFrame.indexOf('|intro') >= 0 && !introAn()) { zeichne(); return; }
    const lim = (view.question && view.question.time_limit) || 20;
    const reading = view.phase === 'question' && ms > (lim * 1000);

    if (reading) {
      const rSek = Math.max(1, Math.ceil((ms - (lim * 1000)) / 1000));
      if (els.clock) {
        els.clock.textContent = String(rSek);
        els.clock.classList.add('ks-clock--reading');
        els.clock.classList.remove('ks-clock--eilig');
      }
      const rAnteil = Math.max(0, Math.min(1, (ms - (lim * 1000)) / (READ_TIME_SEC * 1000)));
      if (els.bar) {
        els.bar.style.width = (rAnteil * 100).toFixed(1) + '%';
        els.bar.classList.remove('ks-bar--eilig');
      }
      if (els.uhr) {
        els.uhr.style.setProperty('--uhr-p', (1 - rAnteil).toFixed(3));
        els.uhr.classList.add('ks-uhr--lesen');
        els.uhr.classList.remove('ks-uhr--eilig');
      }
      const rCounts = stage.querySelectorAll('[data-ks=reading-count]');
      rCounts.forEach(c => { c.textContent = String(rSek); });
      stage.querySelectorAll('[data-ks=reading-bar]').forEach(b => {
        b.style.transform = 'scaleX(' + rAnteil.toFixed(3) + ')';
      });
      weckerAufdecken(ms - lim * 1000);
      return;
    }

    // Reguläre Antwortzeit / nicht in der Vorlesezeit
    const sek = Math.max(0, Math.ceil(ms / 1000));
    if (els.clock) {
      els.clock.textContent = String(sek);
      els.clock.classList.remove('ks-clock--reading');
      els.clock.classList.toggle('ks-clock--eilig', sek <= 5);
    }
    if (els.bar) {
      const anteil = Math.max(0, Math.min(1, ms / (lim * 1000)));
      els.bar.style.width = (anteil * 100).toFixed(1) + '%';
      els.bar.classList.toggle('ks-bar--eilig', sek <= 5);
    }
    // Die Scheibe füllt sich mit der VERSTRICHENEN Zeit — voll heißt: um.
    if (els.uhr) {
      const anteil = Math.max(0, Math.min(1, ms / (lim * 1000)));
      els.uhr.style.setProperty('--uhr-p', (1 - anteil).toFixed(3));
      els.uhr.classList.remove('ks-uhr--lesen');
      els.uhr.classList.toggle('ks-uhr--eilig', sek <= 5);
    }

    // Wenn gerade von Vorlesezeit auf Antwortzeit umgeschaltet wurde: Kacheln aufdecken
    if (view.phase === 'question') {
      const rBox = stage.querySelector('[data-ks=reading]');
      if (rBox && !rBox.hidden) {
        rBox.hidden = true;
        const kacheln = stage.querySelector('.ks-kacheln');
        if (kacheln && kacheln.hidden) {
          kacheln.hidden = false;
          kacheln.classList.add('ks-popin');
        }
        const meta = stage.querySelector('.ks-meta');
        if (meta && meta.hidden) meta.hidden = false;
        // Auf dem Tablet: Kacheln entsperren (sofern noch nicht geantwortet)
        if (role === 'participant') {
          const gesperrt = !!view.my_answer || answering;
          els.tiles.forEach(t => {
            t.disabled = gesperrt;
            t.classList.toggle('is-still', gesperrt);
          });
        }
      }
    }

    // Bei 0 einmal nachfragen: geschlossen hat die Frage der Server
    // (ks_ensure_board), hier wird es nur sichtbar gemacht.
    if (ms <= 0) {
      stopClock();
      poll();
    }
  }

  /* Der 250-ms-Schlag deckte bis zu einer Viertelsekunde zu spät auf
     — und jedes Gerät anders spät. Kurz vor dem Augenblick wird
     deshalb ein Wecker genau darauf gestellt. */
  function weckerAufdecken(bisMs) {
    if (aufdeckT || bisMs > 400) return;
    aufdeckT = setTimeout(() => { aufdeckT = null; clockTick(); }, Math.max(0, bisMs) + 2);
  }

  function startClock() {
    stopClock();
    if (restMs() == null) return;
    clockTick();
    clockTimer = setInterval(clockTick, 250);
  }
  function stopClock() {
    if (clockTimer) clearInterval(clockTimer); clockTimer = null;
    if (aufdeckT) clearTimeout(aufdeckT); aufdeckT = null;
  }

  /* ══════════════════════════════════════════════════════════
     Takt
     ══════════════════════════════════════════════════════════ */
  function takt() {
    const ph = (view && view.phase) || 'lobby';
    return (TAKT[role] && TAKT[role][ph]) || 2500;
  }

  function planPoll() {
    if (pollTimer) clearTimeout(pollTimer);
    if (destroyed) return;
    pollTimer = setTimeout(poll, takt());
  }

  async function poll() {
    if (destroyed || busy || !ctx) { if (!destroyed) planPoll(); return; }
    busy = true;
    try {
      const sigFn  = role === 'presenter' ? 'ks_room_sig' : 'ks_sig';
      const viewFn = role === 'presenter' ? 'ks_room_get' : 'ks_view';

      const s = await gemessen(sigFn, {});
      if (destroyed) return;
      if (!s || !s.ok) { zeigeFehler(s && s.error); return; }

      if (s.sig === lastSig && view) return;

      const v = await gemessen(viewFn, {});
      if (destroyed) return;
      if (!v || !v.ok) { zeigeFehler(v && v.error); return; }

      lastSig = s.sig;
      uebernimm(v);
    } catch (e) {
      console.warn('[knowledgestack] Takt:', e && e.message);
    } finally {
      busy = false;
      if (!destroyed) planPoll();
    }
  }

  function zeigeFehler(code) {
    if (!code) return;
    // 'unknown_token' und Freunde nur EINMAL melden: ein Toast je
    // Takt wäre eine Wand aus Meldungen.
    if (zeigeFehler.last === code) return;
    zeigeFehler.last = code;
    ctx.toast(fehlerText(code), true);
  }

  function uebernimm(v) {
    zeigeFehler.last = null;
    // Die Uhr stellt gemessen() (mit Laufzeit). Nur wenn es noch
    // gar keine Probe gibt, grob von hier.
    if (v.server_now && !uhrProben.length) {
      const t = zeit(v.server_now);
      if (!isNaN(t)) skew = t - Date.now();
    }
    if (Array.isArray(v.catalogs)) catalogs = v.catalogs;
    if (v.me) {
      // Wer sein Wesen gerade ausgewählt hat, soll es nicht durch
      // eine Serverantwort zurückgesetzt bekommen, die noch von
      // davor stammt. Deshalb nur übernehmen, solange nichts
      // ungespeichert aussteht.
      if (!profileT) { myCreature = v.me.creature_id | 0; mySkin = v.me.skin_idx | 0; }
    }
    view = v;
    zeichne();
  }

  /* ══════════════════════════════════════════════════════════
     Zeichnen: einmal bauen je Bild, danach flicken
     ══════════════════════════════════════════════════════════ */
  function frameKey(v) {
    if (editorAuf()) return 'editor|' + editor.key();
    const ph = v.phase || 'lobby';
    return role + '|' + ph
      + '|' + (ph === 'question' || ph === 'reveal' ? v.current_q_idx : '-')
      + '|' + (pickerOffen ? 'pick' : '-')
      + (introAn() ? '|intro' : '')
      + (role === 'participant' && ph === 'ended' ? (endeFertig() ? '|fertig' : '|feier') : '');
  }

  function zeichne() {
    if (!stage || !view) return;
    if (view.phase !== 'ended') endeGesehen = 0;
    const key = frameKey(view);
    if (key !== lastFrame) {
      lastFrame = key;
      answering = false;
      els = {};
      stopBewegung();
      stage.className = 'ks-stage ks-stage--' + (role === 'presenter' ? 'beam' : 'tab')
                     + ' ks-stage--' + view.phase
                     + (introAn() ? ' ks-stage--intro' : '')
                     + (role === 'presenter' && !editorAuf() && view.phase === 'question'
                        && view.question && view.question.has_image ? ' ks-stage--mitbild' : '');
      stage.innerHTML = (role === 'presenter' ? baueBeam : baueTab)(view);
      sammle();
      binde();
      fit();
      startClock();
      if (role === 'presenter' && !editorAuf()) startBewegung(view);
      // Genau zum Ende des Auftritts umschalten, nicht erst beim
      // nächsten 250-ms-Schlag der Uhr.
      if (role === 'participant' && view.phase === 'ended' && bewegtSich()) {
        const t = stage.querySelector('.ks-tende--platz');
        if (t) konfetti(t, (view.me && view.me.rank | 0) <= 3 ? 90 : 0);
      }
      if (role === 'participant' && view.phase === 'ended' && !endeFertig() && !pickerOffen) {
        spaeter(zeichne, Math.max(0, feierDauerMs(view.leaderboard) - (Date.now() - endeGesehen)) + 50);
      }
      if (introAn()) {
        const lim = ((view.question && view.question.time_limit) || 20) * 1000;
        spaeter(zeichne, Math.max(0, restMs() - lim - READ_TIME_SEC * 1000) + 30);
      }
    }
    (role === 'presenter' ? flickeBeam : flickeTab)(view);
  }

  function sammle() {
    els.clock  = stage.querySelector('[data-ks=clock]');
    els.bar    = stage.querySelector('[data-ks=bar]');
    els.uhr    = stage.querySelector('[data-ks=uhr]');
    els.wall   = stage.querySelector('[data-ks=wall]');
    els.count  = stage.querySelector('[data-ks=count]');
    els.total  = stage.querySelector('[data-ks=total]');
    els.tiles  = Array.from(stage.querySelectorAll('[data-idx]'));
    els.top    = Array.from(stage.querySelectorAll('[data-rank]'));
    els.trio   = Array.from(stage.querySelectorAll('[data-slot]'));
  }

  /* ══════════════════════════════════════════════════════════
     BEAMER
     ══════════════════════════════════════════════════════════ */
  function baueBeam(v) {
    if (editorAuf()) return editor.html();
    if (v.phase === 'lobby')    return beamLobby(v);
    if (v.phase === 'question') return introAn() ? beamIntro(v) : beamFrage(v);
    if (v.phase === 'reveal')   return beamAufloesung(v);
    return beamEnde(v);
  }

  function beamLobby(v) {
    const n = (v.players || []).length;
    const opts = catalogs.map(c =>
      '<option value="' + esc(c.id) + '"' + (c.id === v.catalog_id ? ' selected' : '') + '>'
      + esc(c.title) + ' · ' + c.count + (c.count === 1 ? ' Frage' : ' Fragen')
      + '</option>').join('');

    return `
      <header class="ks-head">
        <div class="ks-headl">
          <h1 class="ks-title">Knowledge Stack</h1>
          <label class="ks-catwrap">Fragen
            <select class="ks-cat" data-ks="cat">${opts || '<option>keine Kataloge</option>'}</select>
          </label>
        </div>
        <div class="ks-headr">
          <span class="ks-pill"><b data-ks="total">${n}</b> dabei</span>
          <button type="button" class="ks-go ks-go--edit" data-act="editor"
                  title="Eigene Quizze erstellen und verwalten">📚 Editor</button>
          <button type="button" class="ks-go" data-act="start"
                  ${v.question_count > 0 ? '' : 'disabled'}>Quiz starten</button>
        </div>
      </header>
      <div class="ks-wall${bewegtSich() ? ' ks-wiese' : ''}" data-ks="wall"></div>
      <p class="ks-leer" data-ks="leer" ${n ? 'hidden' : ''}>
        Der Code steht oben in der Leiste — der QR-Code am Griff rechts am Rand.
      </p>
      <p class="ks-weg" data-ks="weg" ${wegHTML(v) ? '' : 'hidden'}>${wegHTML(v)}</p>`;
  }

  /* Wer im Raum ist, aber nicht auf der Wiese steht (0187): offline
     (auch stillgelegt UND offline) und stillgelegt. Dieselbe Zeile wie
     in Kingdoms und Wordisland. Leer, wenn niemand fehlt. */
  function wegHTML(v) {
    const off   = Array.isArray(v.offline_members) ? v.offline_members : [];
    const still = Array.isArray(v.blocked_members) ? v.blocked_members : [];
    let out = '';
    if (off.length) {
      out += '<span class="ks-weglabel">Offline (' + off.length + '):</span>'
           + off.map(x => '<span class="ks-wegname">' + esc(x) + '</span>').join('');
    }
    if (still.length) {
      out += '<span class="ks-weglabel">Stillgelegt (' + still.length + '):</span>'
           + still.map(x => '<span class="ks-wegname ks-wegname--still">🔇 ' + esc(x) + '</span>').join('');
    }
    return out;
  }

  /* Die Frage am Beamer. Von oben nach unten: Frage · Mitte · Antworten.
     Die Mitte ist das Foto, links daneben die drei Füllstände (Uhr,
     Fragen, Antworten), rechts die zwei Knöpfe (Beenden, Auflösen).
     Ohne Foto schrumpft die Mitte auf eine Zeile, und Frage und
     Antworten bekommen den Platz. Die Antworten tragen hier KEIN
     A/B/C/D — die Farbe sagt es, und der Platz geht an die Schrift. */
  function beamFrage(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const reading = isReadingPhase();
    const rSek = readingRestSec();
    const nr = (v.current_q_idx | 0) + 1;
    const n = v.question_count | 0;
    return `
      <div class="ks-qbox"><h2 class="ks-q">${esc(q.text)}</h2></div>
      <div class="ks-mitte${q.has_image ? ' ks-mitte--bild' : ''}">
        <div class="ks-status">
          <div class="ks-stat ks-stat--uhr">
            <span class="ks-uhr" data-ks="uhr"></span>
            <span class="ks-stxt"><b class="ks-clock" data-ks="clock">–</b><i>s</i></span>
          </div>
          <div class="ks-stat">
            <span class="ks-quad"><span class="ks-quadf" style="height:${n ? (nr / n * 100).toFixed(1) : 0}%"></span></span>
            <span class="ks-stxt"><b>${nr}/${n}</b> Fragen</span>
          </div>
          <div class="ks-stat">
            <span class="ks-eck" data-ks="eck"></span>
            <span class="ks-stxt"><b><span data-ks="count">0</span>/<span data-ks="total">0</span></b> Antworten</span>
          </div>
        </div>
        ${q.has_image ? '<div class="ks-bild" data-ks="bild">'
          + (bild.qid === q.qid && bild.src ? '<img src="' + esc(bild.src) + '" alt="" />' : '')
          + '</div>' : '<div class="ks-luecke"></div>'}
        <div class="ks-knoepfe">
          <button type="button" class="ks-ctl ks-ctl--stop" data-act="finish"
                  title="Quiz beenden — direkt zur Siegerehrung">⏹ Beenden</button>
          <button type="button" class="ks-now" data-act="now">Jetzt auflösen</button>
        </div>
      </div>
      <div class="ks-reading-banner" data-ks="reading" ${reading ? '' : 'hidden'}>
        <b class="ks-reading-zahl" data-ks="reading-count">${rSek}</b>
        <div class="ks-reading-info">
          <span class="ks-reading-title">Frage lesen …</span>
          <span class="ks-reading-sub">Die Antworten erscheinen gleich — überall gleichzeitig.</span>
          <span class="ks-reading-lauf"><span data-ks="reading-bar"></span></span>
        </div>
      </div>
      ${kachelnHTML(opts, { modus: 'still', seed: mischKey(v), hidden: reading, ohneBuchstabe: true })}`;
  }

  /* ─── Der Auftritt vor der ersten Frage ───────────────────────
     Oben „Quiz startet" und der Name des Fragenkatalogs, groß und auf
     einem Kasten (er muss vom letzten Platz im Raum lesbar sein).
     Dahinter regnen alle Wesen herein — leicht versetzt, jedes an
     seiner eigenen Stelle —, landen auf dem Boden und laufen rechts
     aus dem Bild. Danach kommt die Frage (der Wechsel steht in
     zeichne). Die Bahn liegt HINTER dem Kasten: ein Wesen, das beim
     Fallen den Titel kreuzt, verdeckt ihn nicht. */
  function beamIntro(v) {
    return `
      <div class="ks-intro">
        <div class="ks-intro-bahn" data-ks="bahn"></div>
        <div class="ks-intro-titel">
          <p class="ks-intro-kicker">Quiz startet</p>
          <h1 class="ks-intro-name">${esc(v.catalog_title || 'Knowledge Stack')}</h1>
        </div>
      </div>`;
  }

  function introStart(v) {
    const bahn = stage.querySelector('[data-ks=bahn]');
    const spieler = (v.players || []).slice();
    const n = spieler.length;
    if (!bahn || !n) return;
    const W = bahn.clientWidth, H = bahn.clientHeight;
    if (!W || !H) return;

    const s = Math.round(klemme(Math.min(H * .26, W / Math.max(4, n * .62)), 44, 130));
    const reihen = n > 12 ? 3 : 2;
    const stufe = s * .3;
    bahn.style.setProperty('--is', s + 'px');

    // Jedes Wesen bekommt einen eigenen Streifen quer (gemischt) und
    // eine Reihe in der Tiefe. Der Regen fällt in einer anderen
    // Reihenfolge als die Streifen — sonst fiele er von links nach rechts.
    const mische = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const streifen = mische(spieler.map((_, i) => i));
    const folge = mische(spieler.map((_, i) => i));
    const breit = Math.max(1, W - s);
    const lueck = Math.min(180, 2000 / n);
    const speed = (W + s) / 3600;                      // Punkte je ms
    const zeigt = bewegtSich();
    const vorbei = introVorbei();

    const figs = spieler.map((p, i) => {
      const x = (streifen[i] + .5) / n * breit + zufall(-.3, .3) * breit / n;
      return { p, x: klemme(x, 0, breit), reihe: i % reihen, fall: 700 + folge[i] * lueck + zufall(0, 150) };
    });
    // Wer rechts steht, geht zuerst — sonst liefe einer durch den anderen.
    const nachX = figs.slice().sort((a, b) => b.x - a.x);
    nachX.forEach((f, r) => { f.geht = 5000 + r * Math.min(60, 500 / n); });

    figs.forEach(f => {
      const cid = f.p.creature_id | 0;
      const el = document.createElement('div');
      el.className = 'ks-ifig';
      el.style.width = s + 'px';
      el.style.bottom = (f.reihe * stufe + 6) + 'px';
      el.style.zIndex = String(10 + reihen - f.reihe);
      el.innerHTML = '<div class="ks-ifp" style="height:' + s + 'px">' + wesen(cid, f.p.skin_idx, 'idle')
        + '</div><span class="ks-ifname">' + esc(f.p.nickname) + '</span>';
      bahn.appendChild(el);
      if (!zeigt) { el.style.transform = 'translateX(' + f.x.toFixed(1) + 'px)'; return; }

      const hoch = -(H + s * 1.6);
      const dauer = Math.min(INTRO_MS - 400, f.geht + (W + s - f.x) / speed);
      const t = ms => klemme(ms / INTRO_MS, 0, 1);
      const pos = (y, sk) => 'translate(' + f.x.toFixed(1) + 'px,' + y + 'px)' + (sk ? ' scale(' + sk + ')' : '');
      const a = el.animate([
        { transform: pos(hoch), offset: 0 },
        { transform: pos(hoch), offset: t(f.fall), easing: 'cubic-bezier(.5, 0, 1, .55)' },
        { transform: pos(0), offset: t(f.fall + 750) },
        { transform: pos(0, '1.16,.84'), offset: t(f.fall + 900), easing: 'ease-out' },
        { transform: pos(0, '1,1'), offset: t(f.fall + 1100) },
        { transform: pos(0), offset: t(f.geht), easing: 'linear' },
        { transform: 'translate(' + (W + s) + 'px,0)', offset: t(dauer) },
        { transform: 'translate(' + (W + s) + 'px,0)', offset: 1 }
      ], { duration: INTRO_MS, fill: 'both', easing: 'linear' });
      a.currentTime = vorbei;
      spaeter(() => setAktion(el.querySelector('.ks-ifp'), 'walk', cid, 'right'), Math.max(0, f.geht - vorbei));
    });
  }

  /* Das n-Eck der Antworten: ein Dreieck je Kind, gefüllt, sobald es
     geantwortet hat. Bei einem oder zwei Kindern ein Quadrat (eins:
     ganz, zwei: zwei Hälften über die Diagonale). */
  function eckSVG(n) {
    const pt = (x, y) => x.toFixed(2) + ',' + y.toFixed(2);
    let teile = [];
    if (n <= 2) {
      const a = [5, 5], b = [95, 5], c = [95, 95], d = [5, 95];
      if (n <= 1) teile = [[a, b, c, d]];
      else teile = [[a, b, c], [a, c, d]];
    } else {
      const ecken = [];
      for (let i = 0; i < n; i++) {
        const w = -Math.PI / 2 + i * 2 * Math.PI / n;
        ecken.push([50 + 46 * Math.cos(w), 50 + 46 * Math.sin(w)]);
      }
      teile = ecken.map((e, i) => [[50, 50], e, ecken[(i + 1) % n]]);
    }
    const rand = n <= 2 ? [[5, 5], [95, 5], [95, 95], [5, 95]]
      : teile.map(t => t[1]);
    return '<svg viewBox="0 0 100 100" aria-hidden="true">'
      + teile.map(t => '<polygon class="ks-seg" points="' + t.map(p => pt(p[0], p[1])).join(' ') + '"/>').join('')
      + '<polygon class="ks-eckrand" points="' + rand.map(p => pt(p[0], p[1])).join(' ') + '"/>'
      + '</svg>';
  }

  function flickeEck(antw, n) {
    const host = stage.querySelector('[data-ks=eck]');
    if (!host) return;
    if (Number(host.dataset.n) !== n || !host.firstChild) {
      host.dataset.n = String(n);
      host.innerHTML = eckSVG(n);
    }
    const segs = host.querySelectorAll('.ks-seg');
    const voll = n ? Math.min(segs.length, Math.round(antw / n * segs.length)) : 0;
    segs.forEach((g, i) => g.classList.toggle('is-voll', i < voll));
  }

  function beamAufloesung(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const letzte = (v.current_q_idx | 0) + 1 >= v.question_count;
    return `
      <header class="ks-head ks-head--rv">
        <span class="ks-qnr">Frage ${(v.current_q_idx | 0) + 1} <i>/ ${v.question_count}</i></span>
        <h2 class="ks-qsmall">${esc(q.text)}</h2>
        <button type="button" class="ks-go" data-act="next">
          ${letzte ? 'Siegerehrung' : 'Nächste Frage'}</button>
        ${steuerHTML(letzte)}
      </header>
      ${podestHTML(v.leaderboard || [], 'rv')}
      ${kachelnHTML(opts, { modus: 'fuell', seed: mischKey(v), correct: q.correct_idx, correct_indices: q.correct_indices })}
      ${q.explanation ? '<p class="ks-expl">' + esc(q.explanation) + '</p>' : ''}`;
  }

  function beamEnde(v) {
    return `
      <header class="ks-head ks-head--end">
        <h1 class="ks-title">Siegerehrung</h1>
        <div class="ks-headr">
          <button type="button" class="ks-go ks-go--edit" data-act="restart"
                  title="Dasselbe Quiz noch einmal — alle Punkte auf 0">↺ Nochmal</button>
          <button type="button" class="ks-go" data-act="reset">Zurück zur Lobby</button>
        </div>
      </header>
      <div class="ks-feier" data-ks="feier">
        <p class="ks-ansage" data-ks="ansage" aria-live="polite"></p>
        ${treppeHTML(v.leaderboard || [])}
      </div>
      <div class="ks-wall ks-wall--end" data-ks="wall"></div>`;
  }

  /* Das Treppchen der Siegerehrung: in der Mitte und am höchsten
     Platz 1, links Platz 2, rechts Platz 3 — so, wie man es von
     jeder Siegerehrung kennt. Hier und nicht in der Auflösung: dort
     zählen fünf Plätze in Leserichtung, hier die drei auf der Treppe.
     Platz 4 und 5 stehen mit allen anderen unten in der Menge. */
  function treppeHTML(lb) {
    if (!lb.length) return '<div class="ks-treppe ks-treppe--leer">Noch keine Punkte.</div>';
    return '<div class="ks-treppe">' + [2, 1, 3].map(r => {
      const p = lb.find(q => q.rank === r);
      if (!p) return '<div class="ks-stufe ks-stufe--' + r + ' is-frei"><div class="ks-sblock"></div></div>';
      return `
        <div class="ks-stufe ks-stufe--${r}" data-rank="${r}" data-cid="${p.creature_id | 0}"
             data-pid="${esc(p.participant_id)}">
          <span class="ks-kbubble" hidden></span>
          <span class="ks-sname">${esc(p.nickname)}</span>
          <div class="ks-spic">${wesen(p.creature_id, p.skin_idx, endWunsch(p, 'oben'))}</div>
          <div class="ks-sblock"><span class="ks-srank">${r}</span><span class="ks-spkt">${pkt(p.score)}</span></div>
        </div>`;
    }).join('') + '</div>';
  }

  /* Abbrechen und Neustarten, während das Quiz läuft. Klein und
     rechts außen: es sind Notknöpfe, nicht der nächste Schritt. In
     der Auflösung der letzten Frage fehlt „Beenden" — dort führt
     „Siegerehrung" ohnehin genau dahin. */
  function steuerHTML(ohneEnde) {
    return '<span class="ks-steuer">'
      + '<button type="button" class="ks-ctl" data-act="restart" title="Quiz neu starten — alle Punkte auf 0"'
      + ' aria-label="Quiz neu starten">↺</button>'
      + (ohneEnde ? '' : '<button type="button" class="ks-ctl ks-ctl--stop" data-act="finish"'
        + ' title="Quiz beenden — direkt zur Siegerehrung" aria-label="Quiz beenden">⏹</button>')
      + '</span>';
  }

  /* Das Foto der Frage holen — einmal je Frage, nur am Beamer. */
  async function holeBild(q) {
    if (!q || !q.has_image || !q.qid) return;
    if (bild.qid === q.qid && (bild.src || bild.laedt)) return;
    bild = { qid: q.qid, src: null, laedt: true };
    const r = await ctx.actions.call('ks_room_image', {});
    if (destroyed || bild.qid !== q.qid) return;
    bild.laedt = false;
    if (!r || !r.ok || r.qid !== q.qid || !r.image) { bild.qid = null; return; }
    bild.src = r.image;
    const box = stage && stage.querySelector('[data-ks=bild]');
    if (box && !box.querySelector('img')) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = r.image;
      box.appendChild(img);
    }
  }

  /* Die fünf Ersten — dort, wo während der Frage die Frage stand.
     Reihenfolge von links nach rechts: Platz 1 … Platz 5. Name
     darüber, Punkte darunter (so und nicht andersherum: der Name
     sagt, WER, und darum geht es zuerst). */
  function podestHTML(lb, art) {
    if (!lb.length) return '<div class="ks-podest ks-podest--leer">Noch keine Punkte.</div>';
    return '<div class="ks-podest ks-podest--' + art + '">' + lb.map(p => `
      <div class="ks-slot ks-slot--${p.rank}" data-rank="${p.rank}" data-cid="${p.creature_id | 0}">
        <span class="ks-sname">${esc(p.nickname)}</span>
        <div class="ks-spic">${wesen(p.creature_id, p.skin_idx,
          p.emote || (p.rank === 1 ? 'cheer' : (p.correct === true ? 'cheer' : p.correct === false ? 'sad' : 'idle')))}</div>
        <div class="ks-sfoot">
          <span class="ks-srank">#${p.rank}</span>
          <span class="ks-spkt">${pkt(p.score)}</span>
          ${deltaHTML(p.rank_change)}
        </div>
      </div>`).join('') + '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     Die vier Antwortfelder
     ══════════════════════════════════════════════════════════
     Dieselben Kacheln in drei Rollen, und das ist der Kern des
     Spiels: die Klasse soll in der Auflösung nicht nach der
     Antwort suchen, die sie gerade gewählt hat — sie steht an
     genau derselben Stelle, nur mit einem Füllstand dahinter.

       still   Beamer während der Frage (nicht anklickbar)
       wahl    Tablet während der Frage (anklickbar)
       fuell   Auflösung: Füllstand + absolute Zahl

     Die Reihenfolge ist je Frage gemischt (Oktober 2026), damit die
     richtige Antwort nicht immer an derselben Stelle steht. Gemischt
     wird mit Fragennummer + Antworttexten als Startwert (mischKey) —
     NICHT mit der qid, denn die bekommt nur der Beamer, das Tablet
     nicht. So rechnen Beamer und alle Tablets dieselbe Reihenfolge,
     und Frage und Auflösung auch — die
     Regel oben gilt weiter. Farbe und Buchstabe gehören zur STELLE
     (oben links ist immer A und rot), data-idx und Füllstand zur
     ursprünglichen Antwort, denn die kennt der Server.               */
  function mischKey(v) {
    const q = (v && v.question) || {};
    return (v.current_q_idx | 0) + '|' + (Array.isArray(q.options) ? q.options : []).join('|');
  }

  function mischung(opts, seed) {
    const voll = [], leer = [];
    opts.forEach((t, i) => (String(t || '').trim() ? voll : leer).push(i));
    // FNV-1a über die qid, dann ein kleiner Zufallsgenerator (mulberry32)
    let h = 2166136261;
    const str = String(seed == null ? '' : seed);
    for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
    const rnd = () => {
      h = (h + 0x6D2B79F5) | 0;
      let x = Math.imul(h ^ (h >>> 15), 1 | h);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    for (let k = voll.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [voll[k], voll[j]] = [voll[j], voll[k]];
    }
    // Leere Felder bleiben hinten, sonst stünde bei Ja/Nein ein Loch vorn
    return voll.concat(leer);
  }

  function kachelnHTML(opts, o) {
    const n = opts.length || 4;
    return '<div class="ks-kacheln"' + (o.hidden ? ' hidden' : '') + ' data-n="' + n + '" data-modus="' + o.modus + '">'
      + mischung(opts, o.seed).map((i, pos) => {
        const t = opts[i];
        const richtig = (Array.isArray(o.correct_indices) && o.correct_indices.length > 0)
          ? o.correct_indices.includes(i)
          : (o.correct != null && i === o.correct);
        const gewaehlt = o.chosen != null && i === o.chosen;
        const cls = ['ks-k', 'ks-k--' + pos];
        /* Am Beamer bekommt die Kachel KEINE Abblendung. `is-still`
           heißt „du hast schon geantwortet" und gehört dem Tablet —
           am Beamer hieße dasselbe „aus der letzten Reihe schlechter
           zu lesen", und genau dafür hängt das Bild vorn. Nicht
           anklickbar ist sie dort ohnehin: sie ist ein <div>. */
        if (o.modus === 'fuell') cls.push(richtig ? 'is-richtig' : 'is-blass');
        if (gewaehlt) cls.push('is-meine');
        return `
          <${o.modus === 'wahl' ? 'button type="button"' : 'div'} class="${cls.join(' ')}" data-idx="${i}">
            ${o.modus === 'fuell' ? '<span class="ks-fuell" data-fuell="' + i + '"></span>' : ''}
            ${o.ohneBuchstabe ? '' : '<span class="ks-kk ' + (richtig ? 'ks-kk--richtig' : '') + '">' + (richtig ? '✓' : LABELS[pos]) + '</span>'}
            <span class="ks-kt">${esc(t)}</span>
            ${o.modus === 'fuell' ? '<span class="ks-kn" data-kn="' + i + '">0</span>' : ''}
            ${gewaehlt ? '<span class="ks-kmein">deine Wahl</span>' : ''}
          </${o.modus === 'wahl' ? 'button' : 'div'}>`;
      }).join('') + '</div>';
  }

  /* ─── Beamer flicken ─────────────────────────────────────── */
  function flickeBeam(v) {
    if (v.phase === 'question' && v.question && v.question.has_image) holeBild(v.question);
    if (v.phase === 'question' && introAn()) return;     // Auftritt: nichts zu flicken
    if (els.total) els.total.textContent = String((v.players || []).length);
    if (els.count) els.count.textContent = String(v.answers_total || 0);
    if (v.phase === 'question') flickeEck(v.answers_total || 0, (v.players || []).length);

    if (v.phase === 'lobby') {
      flickeWall(v.players || [], false);
      const leer = stage.querySelector('[data-ks=leer]');
      if (leer) leer.hidden = (v.players || []).length > 0;
      const weg = stage.querySelector('[data-ks=weg]');
      if (weg) {
        const html = wegHTML(v);
        if (weg.innerHTML !== html) weg.innerHTML = html;
        weg.hidden = !html;
      }
      const go = stage.querySelector('[data-act=start]');
      if (go) go.disabled = !(v.question_count > 0);
      const cat = stage.querySelector('[data-ks=cat]');
      if (cat && cat.value !== v.catalog_id && document.activeElement !== cat) {
        cat.value = v.catalog_id || '';
      }
      return;
    }

    if (v.phase === 'reveal' || v.phase === 'ended') {
      flickePodest(v.leaderboard || []);
    }
    if (v.phase === 'ended') flickeWall(v.players || [], true);

    if (v.phase === 'reveal') {
      const dist = v.answers_dist || {};
      const tot = v.answers_total || 0;
      for (let i = 0; i < 4; i++) {
        const f = stage.querySelector('[data-fuell="' + i + '"]');
        const nEl = stage.querySelector('[data-kn="' + i + '"]');
        const n = Number(dist[i] || dist[String(i)] || 0);
        if (f) f.style.width = (tot > 0 ? (n / tot * 100) : 0).toFixed(1) + '%';
        if (nEl) nEl.textContent = String(n);
      }
    }
  }

  /* Was ein Wesen auf dem Podest tut, wenn es selbst nichts will.
     In der Auflösung: der Erste jubelt, sonst je nach Antwort. */
  function podestWunsch(p) {
    return p.emote || (p.rank === 1 ? 'cheer'
      : p.correct === true ? 'cheer' : p.correct === false ? 'sad' : 'idle');
  }

  function flickePodest(lb) {
    const ende = view && view.phase === 'ended';
    for (const p of lb) {
      const slot = stage.querySelector('[data-rank="' + p.rank + '"]');
      if (!slot) continue;
      const nm = slot.querySelector('.ks-sname');
      if (nm && nm.textContent !== p.nickname) nm.textContent = p.nickname;
      const pk = slot.querySelector('.ks-spkt');
      if (pk) pk.textContent = pkt(p.score);
      // Das Wesen kann wechseln (anderes Kind auf diesem Platz) —
      // dann muss das SVG neu, sonst nur die Bewegung.
      const pic = slot.querySelector('.ks-spic');
      const cid = p.creature_id | 0;
      const wanted = ende ? endWunsch(p, 'oben') : podestWunsch(p);
      if (pic && Number(slot.dataset.cid) !== cid) {
        slot.dataset.cid = String(cid);
        pic.innerHTML = wesen(cid, p.skin_idx, wanted);
      }
      if (ende) flickeBubble(slot.querySelector('.ks-kbubble'), p.emote);
      // Wer gerade läuft oder springt, behält seine Bewegung, bis er
      // angekommen ist — sonst bliebe er mitten im Schritt stehen.
      if (slot.dataset.laeuft || slot.classList.contains('is-leer')) continue;
      zeigeWunsch(pic, wanted, cid);
    }
    // Wer stillgelegt wird oder offline geht, fällt aus der Rangliste
    // (0188). Sein Platz bleibt dann leer, statt das alte Wesen weiter
    // zu zeigen — die Plätze werden nur einmal je Bild gebaut.
    stage.querySelectorAll('.ks-slot[data-rank], .ks-stufe[data-rank]').forEach(sl => {
      sl.style.visibility = lb.some(p => p.rank === Number(sl.dataset.rank)) ? '' : 'hidden';
    });
    if (!ende) podestVorher = new Map(lb.map(p => [String(p.participant_id),
      { rank: p.rank, cid: p.creature_id | 0, skin: p.skin_idx | 0 }]));
  }

  /* Das Emote-Zeichen über einem Wesen. Nur neu angestoßen, wenn ein
     ANDERES Emote kommt — sonst flackerte es bei jedem Takt. */
  function flickeBubble(bub, emote) {
    if (!bub) return;
    if (emote) {
      if (bub.dataset.e !== emote) {
        bub.dataset.e = emote;
        bub.innerHTML = EMOTE_ICON[emote] || ICONS.cheer;
        // Animation neu anstoßen: ohne den Neustart bliebe das
        // Zeichen aus dem letzten Takt einfach unsichtbar stehen.
        bub.hidden = true; void bub.offsetWidth; bub.hidden = false;
      }
    } else if (!bub.hidden) {
      bub.hidden = true; bub.dataset.e = '';
    }
  }

  /* Die Wesen-Wand. Geflickt und nicht neu gebaut: 28 SVGs je Takt
     neu zu schreiben kostet nicht nur Rechenzeit, es setzt auch
     jedes Atmen und jedes Winken zurück.

     In der Lobby (mit Bewegung) ist die Wand eine Wiese: dort stehen
     die Karten nicht im Raster, sondern laufen herum — WO und WIE,
     macht wieseTakt. Hier wird nur angemeldet, was der Server sagt. */
  function flickeWall(players, mitPunkten) {
    if (!els.wall) return;
    const wiese = bew.wiese && bew.wiese.el === els.wall ? bew.wiese : null;
    const ende = view && view.phase === 'ended';
    const da = new Map();
    els.wall.querySelectorAll('[data-pid]').forEach(el => da.set(el.dataset.pid, el));
    if (wiese) wiese.neu = 0;

    players.forEach(p => {
      const id = String(p.participant_id);
      let card = da.get(id);
      const cid = p.creature_id | 0;

      if (!card) {
        card = document.createElement('div');
        card.className = 'ks-karte';
        card.dataset.pid = id;
        card.dataset.cid = String(cid);
        card.dataset.skin = String(p.skin_idx | 0);
        card.innerHTML =
          '<span class="ks-kbubble" hidden></span>'
          + '<div class="ks-kpic">' + wesen(cid, p.skin_idx, p.emote || 'idle') + '</div>'
          + '<span class="ks-kname"></span>'
          + (mitPunkten ? '<span class="ks-kpkt"></span>' : '');
        els.wall.appendChild(card);
      } else {
        da.delete(id);
      }

      if (Number(card.dataset.cid) !== cid || Number(card.dataset.skin) !== (p.skin_idx | 0)) {
        card.dataset.cid = String(cid);
        card.dataset.skin = String(p.skin_idx | 0);
        card.querySelector('.ks-kpic').innerHTML = wesen(cid, p.skin_idx, p.emote || 'idle');
      }
      if (wiese) wieseMelde(wiese, card, p, cid);
      else if (ende) {
        card.classList.toggle('is-oben', istOben(p));
        zeigeWunsch(card.querySelector('.ks-kpic'), endWunsch(p, 'unten'), cid);
      } else setEmote(card.querySelector('.ks-kpic'), p.emote || 'idle', cid);

      const nm = card.querySelector('.ks-kname');
      if (nm.textContent !== p.nickname) nm.textContent = p.nickname;
      const pk = card.querySelector('.ks-kpkt');
      if (pk) pk.textContent = pkt(p.score) + ' Pkt';

      flickeBubble(card.querySelector('.ks-kbubble'), p.emote);

      // Grün heißt „hat geantwortet" — das gilt nur während einer Frage.
      card.classList.toggle('is-fertig', !ende && !!p.answered);
    });

    // Wer nicht mehr in der Liste steht, hat den Raum verlassen.
    da.forEach(el => el.remove());
  }

  /* ══════════════════════════════════════════════════════════
     BEWEGUNG am Beamer (Oktober 2026)
     ══════════════════════════════════════════════════════════
     Drei Auftritte, alle nur am Beamer:

       Lobby         Wer den Raum betritt, fällt von oben herein,
                     plumpst auf den Hintern, steht auf und läuft
                     herum — hin und her, nach vorn und nach hinten.
                     Wer emotet, bleibt stehen, dreht sich nach vorn,
                     emotet 3,5 bis 5 Sekunden und läuft weiter.
       Auflösung     Die fünf Ersten laufen auf ihre Plätze: wer den
                     Platz wechselt, läuft hinüber, wer neu dabei ist,
                     kommt von rechts herein, wer herausfällt, geht
                     rechts hinaus.
       Siegerehrung  Alle stehen klein unten. Platz 3 springt aufs
                     Treppchen, dann Platz 2, dann — mit Trommelwirbel
                     — Platz 1. Danach klatschen alle, und oben wird
                     gejubelt. Emotes gehen überall dazwischen.

     Wer Bewegung abgestellt hat (prefers-reduced-motion), bekommt
     sofort das Endbild: die Wand im Raster, das Treppchen besetzt.
     Genauso der Prüfstand ohne Browser (uitest.js) — er prüft, WAS
     im Bild steht, und das ist im Endbild dasselbe. */
  function bewegtSich() {
    return typeof window.requestAnimationFrame === 'function'
      && typeof window.matchMedia === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  }

  /* Alles, was eine Bewegung an Uhren hält. Es gehört zum BILD: wird
     das Bild neu gebaut (frameKey), endet jede Bewegung darin. */
  let bew = { timers: [], raf: 0, wiese: null, feier: null };

  function spaeter(fn, ms) {
    const t = setTimeout(() => {
      bew.timers = bew.timers.filter(x => x !== t);
      if (!destroyed) fn();
    }, ms);
    bew.timers.push(t);
  }

  function stopBewegung() {
    bew.timers.forEach(clearTimeout);
    if (bew.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(bew.raf);
    bew = { timers: [], raf: 0, wiese: null, feier: null };
  }

  function startBewegung(v) {
    if (v.phase === 'lobby' || (v.phase === 'question' && (v.current_q_idx | 0) === 0)) {
      podestVorher = new Map();      // neue Runde, neues Podest
    }
    if (!bewegtSich()) return;
    if (v.phase === 'lobby' && els.wall) wieseStart(els.wall);
    if (v.phase === 'question' && introAn()) introStart(v);
    if (v.phase === 'reveal') podestAuftritt(v.leaderboard || []);
    if (v.phase === 'ended') feierStart(v);
  }

  /* Die Bewegungen, die keine Emotes sind (gehen, plumpsen, aufstehen),
     kommen aus KSCreatures.cls. Wie setEmote: nur die Klasse am <svg>
     wird getauscht, das Bild bleibt. */
  function setAktion(host, action, cid, dir) {
    if (!host) return;
    const svg = host.querySelector('svg');
    if (!svg) return;
    host.classList.remove('ks-springt');
    const C = window.KSCreatures;
    const want = 'creature-svg ' + (C && C.cls ? C.cls(action, cid, dir) : 'c-idle');
    if (svg.getAttribute('class') !== want) svg.setAttribute('class', want);
  }

  /* Ein Wunsch ist ein Emote — oder 'tippeln' (auf der Stelle gehen,
     von vorn: die Menge beim Trommelwirbel). */
  function zeigeWunsch(host, w, cid) {
    if (w === 'tippeln') setAktion(host, 'walk', cid, 'front');
    else setEmote(host, w, cid);
  }

  /* ─── Lobby: die Wiese ───────────────────────────────────────
     Jede Figur hat eine Stelle auf der Wiese: x quer (0 links …
     1 rechts) und y in die Tiefe (0 hinten … 1 vorn). Hinten ist
     kleiner und weiter oben, vorn größer und weiter unten, und wer
     vorn steht, verdeckt, wer hinten steht. Gezeichnet wird über
     transform — die Karten liegen absolut auf der Wiese. */
  function wieseStart(el) {
    bew.wiese = { el, figs: new Map(), neu: 0, last: 0, s: 0 };
    bew.raf = requestAnimationFrame(wieseTakt);
  }

  const zufall = (a, b) => a + Math.random() * (b - a);
  const klemme = (x, a, b) => Math.max(a, Math.min(b, x));

  function wieseMelde(W, card, p, cid) {
    const id = card.dataset.pid;
    const jetzt = performance.now();
    let f = W.figs.get(id);
    if (!f) {
      f = {
        card, pic: card.querySelector('.ks-kpic'), cid,
        x: Math.random(), y: zufall(.1, 1),
        // Wer gleichzeitig kommt (beim ersten Bild: alle), fällt
        // nacheinander — ein Regen aus Wesen, kein Klumpen.
        zustand: 'wartet', bis: jetzt + W.neu++ * 170 + zufall(0, 200),
        off: 0, vy: 0, tx: 0, ty: 0, dir: 'front',
        server: null, gesehen: null, emote: null, ab: 0, cls: ''
      };
      card.classList.add('ks-figur', 'is-wartet');
      W.figs.set(id, f);
    }
    // Neues SVG (anderes Wesen, andere Farbe) → Bewegung neu setzen.
    if (f.cid !== cid || f.svg !== f.pic.querySelector('svg')) { f.cid = cid; f.cls = ''; }
    f.server = p.emote || null;
    if (!f.server) f.gesehen = null;
    // Ein Emote nimmt nur, wer schon steht: im Fallen und Plumpsen
    // wartet es. Der Server hält es 3,5 s, der nächste Takt sieht es.
    if (f.server && f.server !== f.gesehen && (f.zustand === 'geht' || f.zustand === 'ruht')) {
      f.gesehen = f.server;
      f.emote = f.server;
      f.zustand = 'emote';
      f.ab = jetzt;
      f.bis = jetzt + EMOTE_MS;
    }
  }

  function figurZeigt(f, action, dir) {
    const key = action + '|' + (dir || '');
    const svg = f.pic.querySelector('svg');
    if (f.cls === key && f.svg === svg) return;
    f.cls = key; f.svg = svg;
    if (action === 'walk' || action === 'plop' || action === 'getup') setAktion(f.pic, action, f.cid, dir);
    else setEmote(f.pic, action, f.cid);
  }

  function neuesZiel(f, w, tiefe) {
    if (Math.random() < .55) {
      // hin und her
      const weit = zufall(.18, .45) * (Math.random() < .5 ? -1 : 1);
      f.tx = klemme(f.x + weit, 0, 1);
      if (Math.abs(f.tx - f.x) < .1) f.tx = klemme(f.x - weit, 0, 1);
      f.ty = klemme(f.y + zufall(-.08, .08), 0, 1);
    } else {
      // nach vorn oder zurück
      f.ty = f.y < .5 ? zufall(.65, 1) : zufall(0, .35);
      f.tx = klemme(f.x + zufall(-.06, .06), 0, 1);
    }
    const dx = (f.tx - f.x) * w, dy = (f.ty - f.y) * tiefe;
    f.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back');
  }

  function plumps(f) {
    const d = document.createElement('span');
    d.className = 'ks-plums';
    d.innerHTML = '<i></i><i></i><b>plumps!</b>';
    f.card.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  function wieseTakt(now) {
    const W = bew.wiese;
    if (!W || destroyed) return;
    if (!W.el.isConnected) { bew.wiese = null; bew.raf = 0; return; }
    bew.raf = requestAnimationFrame(wieseTakt);
    const dt = Math.min(.05, W.last ? (now - W.last) / 1000 : 0);
    W.last = now;

    W.figs.forEach((f, id) => { if (!f.card.isConnected) W.figs.delete(id); });
    const w = W.el.clientWidth, h = W.el.clientHeight;
    if (!w || !h) return;

    // Figurgröße: so groß wie eine Karte am Beamer, und kleiner,
    // wenn es so viele werden, dass sie sich sonst stapeln.
    const n = Math.max(1, W.figs.size);
    const s = Math.round(klemme(Math.sqrt(w * h * .45 / n) * .8, 40, Math.min(124, h * .3)));
    if (s !== W.s) { W.s = s; W.el.style.setProperty('--fs', s + 'px'); }
    const fussVorn = h - s * .3 - 4;                 // Platz für den Namen
    const fussHinten = Math.min(fussVorn, Math.max(s * .8, h * .38));
    const tiefe = fussVorn - fussHinten;
    const breite = Math.max(1, w - s);
    const schritt = s * 1.1;                         // Punkte je Sekunde

    W.figs.forEach(f => {
      switch (f.zustand) {
        case 'wartet':
          if (now < f.bis) break;
          f.zustand = 'faellt';
          f.off = -(fussHinten + (fussVorn - fussHinten) * f.y + s * 1.3);
          f.vy = 0;
          f.card.classList.remove('is-wartet');
          f.card.classList.add('is-faellt');
          figurZeigt(f, 'idle');
          break;
        case 'faellt':
          f.vy += 2600 * dt;
          f.off += f.vy * dt;
          if (f.off >= 0) {
            f.off = 0;
            f.zustand = 'plumpst'; f.bis = now + 1000;
            f.card.classList.remove('is-faellt');
            figurZeigt(f, 'plop');
            plumps(f);
          }
          break;
        case 'plumpst':
          if (now >= f.bis) { f.zustand = 'steht'; f.bis = now + 1200; figurZeigt(f, 'getup', 'sit'); }
          break;
        case 'steht':
          if (now >= f.bis) { f.zustand = 'ruht'; f.bis = now + zufall(200, 1400); figurZeigt(f, 'idle'); }
          break;
        case 'ruht':
          figurZeigt(f, 'idle');
          if (now >= f.bis) { neuesZiel(f, breite, tiefe); f.zustand = 'geht'; }
          break;
        case 'geht': {
          figurZeigt(f, 'walk', f.dir);
          const dx = (f.tx - f.x) * breite, dy = (f.ty - f.y) * tiefe;
          const weg = Math.hypot(dx, dy);
          const kann = schritt * (.75 + .25 * f.y) * dt;  // hinten wirkt langsamer
          if (weg <= kann || weg < .5) {
            f.x = f.tx; f.y = f.ty;
            f.zustand = 'ruht'; f.bis = now + zufall(700, 3200);
          } else {
            f.x += (f.tx - f.x) * kann / weg;
            f.y += (f.ty - f.y) * kann / weg;
          }
          break;
        }
        case 'emote':
          // Nach vorn gedreht ist jedes Emote von selbst. Es endet
          // frühestens nach 3,5 s und spätestens nach 5 s.
          figurZeigt(f, f.emote);
          if (now >= f.bis && (f.server !== f.emote || now - f.ab >= 5000)) {
            f.zustand = 'ruht'; f.bis = now + zufall(300, 900);
          }
          break;
      }
      const sk = .68 + .32 * f.y;
      const fx = s / 2 + f.x * breite;
      const fy = fussHinten + tiefe * f.y + f.off;
      f.card.style.transform = 'translate(' + (fx - s / 2).toFixed(1) + 'px,'
        + (fy - s).toFixed(1) + 'px) scale(' + sk.toFixed(3) + ')';
      const z = String(10 + Math.round(f.y * 100) + (f.zustand === 'faellt' ? 200 : 0));
      if (f.card.style.zIndex !== z) f.card.style.zIndex = z;
    });
  }

  /* ─── Auflösung: Plätze tauschen ─────────────────────────────
     FLIP: das neue Podest ist schon gebaut, jedes Wesen steht auf
     seinem neuen Platz. Wer vorher woanders stand, wird dorthin
     zurückversetzt und läuft herüber. */
  function podestAuftritt(lb) {
    const box = stage.querySelector('.ks-podest');
    if (!box || !lb.length) return;
    const slots = new Map();
    box.querySelectorAll('[data-rank]').forEach(sl => slots.set(Number(sl.dataset.rank), sl));
    const boxR = box.getBoundingClientRect();
    if (!boxR.width) return;
    const neu = new Set(lb.map(p => String(p.participant_id)));

    // Wer herausfällt, geht rechts hinaus — als Doppelgänger, denn
    // auf dem neuen Podest hat er keinen Platz mehr.
    let raus = 0;
    podestVorher.forEach((alt, pid) => {
      if (neu.has(pid)) return;
      const sl = slots.get(alt.rank);
      if (!sl) return;
      const r = sl.querySelector('.ks-spic').getBoundingClientRect();
      const g = document.createElement('div');
      g.className = 'ks-geist';
      g.style.left = (r.left - boxR.left) + 'px';
      g.style.top = (r.top - boxR.top) + 'px';
      g.style.width = r.width + 'px';
      g.style.height = r.height + 'px';
      g.innerHTML = wesen(alt.cid, alt.skin, 'idle');
      box.appendChild(g);
      setAktion(g, 'walk', alt.cid, 'right');
      const weit = boxR.right - r.left + 30;
      const a = g.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + weit + 'px)' }],
        { duration: 500 + weit / Math.max(40, r.width) * 420, delay: raus++ * 150, easing: 'linear', fill: 'forwards' });
      a.onfinish = () => g.remove();
    });

    let rein = 0;
    // Von hinten nach vorn: wer neu kommt, betritt zuerst die
    // hinteren Plätze — sonst liefe Platz 1 durch alle anderen.
    lb.slice().sort((a, b) => b.rank - a.rank).forEach(p => {
      const sl = slots.get(p.rank);
      if (!sl) return;
      const alt = podestVorher.get(String(p.participant_id));
      if (alt && alt.rank === p.rank) return;
      const von = alt && slots.get(alt.rank);
      const links = sl.getBoundingClientRect().left;
      const dx = von ? von.getBoundingClientRect().left - links : boxR.right - links + 10;
      const warte = von ? 350 : 600 + rein++ * 280;
      laufeAufPlatz(sl, dx, warte, p.creature_id | 0);
    });
  }

  function laufeAufPlatz(sl, dx, warte, cid) {
    const pic = sl.querySelector('.ks-spic');
    if (!pic) return;
    sl.dataset.laeuft = '1';
    sl.classList.add('is-laeuft');
    pic.style.transform = 'translateX(' + dx + 'px)';
    setEmote(pic, 'idle', cid);
    const breit = pic.getBoundingClientRect().width || 80;
    const dauer = 500 + Math.abs(dx) / breit * 400;
    spaeter(() => {
      pic.style.transform = '';
      setAktion(pic, 'walk', cid, dx > 0 ? 'left' : 'right');
      const a = pic.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'translateX(0)' }],
        { duration: dauer, easing: 'linear' });
      a.onfinish = () => {
        delete sl.dataset.laeuft;
        sl.classList.remove('is-laeuft');
        if (view && view.phase === 'reveal') flickePodest(view.leaderboard || []);
      };
    }, warte);
  }

  /* ─── Siegerehrung: das Treppchen ────────────────────────────
     bew.feier.stufe:  start → spannung (Trommelwirbel) → fertig
     Ohne Bewegung gibt es kein bew.feier — dann gilt das Endbild. */
  function istOben(p) {
    if (!(p.rank >= 1 && p.rank <= 3)) return false;
    const F = bew.feier;
    return !F || F.oben.has(p.rank);
  }

  function endWunsch(p, ort) {
    if (p.emote) return p.emote;
    const F = bew.feier;
    const klatscht = F ? F.stufe === 'fertig' && Date.now() < F.klatschBis : false;
    if (ort === 'oben') {
      if (p.rank === 1) return 'cheer';
      if (!F) return 'clap';
      return klatscht ? 'clap' : (F.stufe === 'fertig' ? 'idle' : 'wave');
    }
    if (!F) return 'idle';
    if (F.stufe === 'spannung') return 'tippeln';
    return klatscht ? 'clap' : 'idle';
  }

  function ansage(txt, art) {
    const el = stage && stage.querySelector('[data-ks=ansage]');
    if (!el) return;
    el.textContent = txt;
    el.className = 'ks-ansage' + (art ? ' ks-ansage--' + art : '');
    // Die Ansage springt bei jedem neuen Satz neu herein.
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }

  /* Zeiten der Siegerehrung am Beamer — das Tablet rechnet damit, wann
     es seinen Platz zeigen darf (feierDauerMs). */
  const FEIER_START = 1600, FEIER_SPANNUNG = 3400, FEIER_ANSAGE = 700,
        FEIER_SPRUNG1 = 1000, FEIER_SPRUNG = 1900, FEIER_SCHLUSS = 2500,
        FEIER_PUFFER = 3500;     // Takt des Beamers + Netz

  function feierDauerMs(lb) {
    const n = Array.isArray(lb) && lb.length
      ? [3, 2, 1].filter(r => lb.some(p => p.rank === r)).length : 3;
    let t = FEIER_START;
    for (let i = 0; i < n; i++) {
      const r = n - i;                       // 3, 2, 1 (oder weniger)
      t += (r === 1 && n > 1 ? FEIER_SPANNUNG : FEIER_ANSAGE)
         + (r === 1 ? FEIER_SPRUNG1 : FEIER_SPRUNG);
    }
    return t + FEIER_SCHLUSS + FEIER_PUFFER;
  }

  /* Tablet: ist die Siegerehrung vorn schon vorbei? Die Uhr startet,
     sobald dieses Tablet das Ende zum ersten Mal sieht. */
  let endeGesehen = 0;
  function endeFertig() {
    if (!view || view.phase !== 'ended') return false;
    if (!endeGesehen) endeGesehen = Date.now();
    return Date.now() - endeGesehen >= feierDauerMs(view.leaderboard);
  }

  function feierStart(v) {
    const lb = v.leaderboard || [];
    const feier = stage.querySelector('[data-ks=feier]');
    if (!feier || !lb.length) return;
    const F = bew.feier = { stufe: 'start', oben: new Set(), klatschBis: 0 };
    stage.querySelectorAll('.ks-stufe[data-rank]').forEach(sl => sl.classList.add('is-leer'));
    const plaetze = [3, 2, 1].filter(r => stage.querySelector('.ks-stufe[data-rank="' + r + '"]'));
    const sieger = lb.find(p => p.rank === 1);

    ansage('🏆 Siegerehrung');
    let t = FEIER_START;
    plaetze.forEach(r => {
      if (r === 1 && plaetze.length > 1) {
        spaeter(() => {
          F.stufe = 'spannung';
          feier.classList.add('ist-spannung');
          ansage('🥁 Und Platz 1 geht an …', 'spannung');
          flickeBeam(view);
        }, t);
        t += FEIER_SPANNUNG;
      } else {
        spaeter(() => ansage('Platz ' + r), t);
        t += FEIER_ANSAGE;
      }
      spaeter(() => springeAufsTreppchen(r), t);
      t += r === 1 ? FEIER_SPRUNG1 : FEIER_SPRUNG;
    });
    spaeter(() => {
      F.stufe = 'fertig';
      F.klatschBis = Date.now() + 8000;
      feier.classList.remove('ist-spannung');
      feier.classList.add('ist-fertig');
      ansage(sieger ? '🏆 ' + sieger.nickname + ' gewinnt!' : '🏆', 'sieg');
      konfetti(feier);
      flickeBeam(view);
      spaeter(() => flickeBeam(view), 8100);   // Klatschen hört auf
    }, t);
  }

  function springeAufsTreppchen(rank) {
    const F = bew.feier;
    const sl = stage.querySelector('.ks-stufe[data-rank="' + rank + '"]');
    if (!F || !sl) return;
    const pic = sl.querySelector('.ks-spic');
    const karte = els.wall && els.wall.querySelector('[data-pid="' + sl.dataset.pid + '"]');
    const cid = Number(sl.dataset.cid) | 0;
    const von = karte && karte.querySelector('.ks-kpic').getBoundingClientRect();
    F.oben.add(rank);
    sl.classList.remove('is-leer');
    if (karte) karte.classList.add('is-oben');
    const nach = pic.getBoundingClientRect();
    if (!von || !von.width || !nach.width) { flickeBeam(view); return; }

    // Vom Platz in der Menge in einem Bogen aufs Treppchen.
    // transform-origin ist unten Mitte (tool.css) — also rechnen
    // wir von Fuß zu Fuß.
    const sk = von.width / nach.width;
    const dx = (von.left + von.width / 2) - (nach.left + nach.width / 2);
    const dy = von.bottom - nach.bottom;
    const gipfel = Math.min(dy, 0) - nach.height * .7;
    sl.dataset.laeuft = '1';
    setEmote(pic, 'cheer', cid);
    const a = pic.animate([
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sk + ')', offset: 0 },
      { transform: 'translate(' + dx + 'px,' + (dy + nach.height * .06 * sk) + 'px) scale(' + (sk * 1.15) + ',' + (sk * .8) + ')', offset: .15 },
      { transform: 'translate(' + (dx * .4) + 'px,' + gipfel + 'px) scale(' + ((sk + 1) / 2) + ')', offset: .6 },
      { transform: 'translate(0,0) scale(1)', offset: 1 }
    ], { duration: 1000, easing: 'ease-in-out' });
    a.onfinish = () => {
      delete sl.dataset.laeuft;
      sl.classList.add('ks-landet');
      setTimeout(() => sl.classList.remove('ks-landet'), 600);
      flickeBeam(view);
    };
  }

  function konfetti(feier, anzahl) {
    if (anzahl === 0) return;
    const farben = ['--ks-a0', '--ks-a1', '--ks-a2', '--ks-a3', '--ks-gold'];
    const box = document.createElement('div');
    box.className = 'ks-konfetti';
    let html = '';
    for (let i = 0; i < (anzahl || 60); i++) {
      html += '<i style="left:' + zufall(4, 94).toFixed(1) + '%;background:var(' + farben[i % 5] + ');'
        + 'animation-delay:' + zufall(0, .9).toFixed(2) + 's;animation-duration:' + zufall(2.2, 3.6).toFixed(2) + 's;'
        + '--dreh:' + Math.round(zufall(-720, 720)) + 'deg;--weit:' + Math.round(zufall(-40, 40)) + 'px"></i>';
    }
    box.innerHTML = html;
    feier.appendChild(box);
    spaeter(() => box.remove(), 5000);
  }

  /* ══════════════════════════════════════════════════════════
     TABLET
     ══════════════════════════════════════════════════════════ */
  function baueTab(v) {
    if (v.phase === 'lobby')                 return tabLobby(v);
    if (v.phase === 'ended' && pickerOffen)  return tabLobby(v, true);
    if (v.phase === 'question')              return introAn() ? tabIntro(v) : tabFrage(v);
    if (v.phase === 'ended')                 return tabEnde(v);
    return tabRang(v);                       // reveal
  }

  function tabLobby(v, nachher) {
    const liste = (window.KSCreatures && window.KSCreatures.list) || [];
    const me = v.me || {};
    return `
      <header class="ks-thead">
        <span class="ks-tname">${esc(me.nickname || 'Du')}</span>
        ${nachher
          ? '<button type="button" class="ks-fertig" data-act="fertig">Fertig</button>'
          : '<span class="ks-twait">Wähle dein Wesen</span>'}
      </header>
      <div class="ks-vorschau" data-ks="vorschau" data-cid="${myCreature}">
        ${wesen(myCreature, mySkin, 'wave')}
      </div>
      <span class="ks-wname" data-ks="wname">${esc(wesenName(myCreature))}</span>
      <div class="ks-skins" data-ks="skins">${skinKnoepfe()}</div>
      <div class="ks-picker" data-ks="picker">
        ${liste.map(c => '<button type="button" class="ks-pick'
          + (c.id === myCreature ? ' is-on' : '') + '" data-cid="' + c.id
          + '" title="' + esc(c.name) + '">' + wesen(c.id, mySkin, 'idle')
          + '<span>' + esc(c.name) + '</span></button>').join('')}
      </div>
      <div class="ks-emobar">${emoteBarHTML()}</div>
      <p class="ks-twarte">${nachher
        ? 'Gespeichert. Beim nächsten Quiz bist du dieses Wesen.'
        : 'Warten auf den Start …'}</p>`;
  }

  /* Die Frage steht hier NICHT. Oben das eigene Wesen — es ist die
     Stelle, an der man sich selbst wiederfindet, wenn man vom
     Beamer auf das Tablet sieht. */
  function tabFrage(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const me = v.me || {};
    const my = v.my_answer;
    const reading = isReadingPhase();
    const rSek = readingRestSec();
    return `
      <header class="ks-thead ks-thead--q">
        <div class="ks-tme" data-ks="tme" data-cid="${me.creature_id | 0}">
          ${wesen(me.creature_id, me.skin_idx, 'idle')}
        </div>
        <div class="ks-tinfo">
          <span class="ks-tname">${esc(me.nickname || 'Du')}</span>
          <span class="ks-trang">#${me.rank || '?'} · ${pkt(me.score)} Pkt</span>
        </div>
        <span class="ks-clock" data-ks="clock">–</span>
      </header>
      <div class="ks-barwrap"><div class="ks-bar" data-ks="bar"></div></div>
      <div class="ks-reading-card" data-ks="reading" ${reading ? '' : 'hidden'}>
        <div class="ks-reading-pic">👀</div>
        <h3 class="ks-reading-title">Blick nach vorn zum Beamer!</h3>
        <b class="ks-reading-zahl" data-ks="reading-count">${rSek}</b>
        <span class="ks-reading-lauf"><span data-ks="reading-bar"></span></span>
        <p class="ks-reading-sub">Lies die Frage. Die Antworten erscheinen bei allen gleichzeitig.</p>
      </div>
      ${kachelnHTML(opts, { modus: 'wahl', seed: mischKey(v), chosen: my ? my.chosen_idx : null, hidden: reading, ohneBuchstabe: true })}
      <p class="ks-gesperrt" data-ks="lock" ${my && !reading ? '' : 'hidden'}>
        Antwort abgegeben — jetzt zum Beamer sehen.</p>`;
  }

  /* Auflösung und Siegerehrung auf dem Tablet: links der Nachbar
     vor mir, in der Mitte ich, rechts der Nachbar hinter mir.
     Darunter die Punkte, ganz unten die vier Emote-Knöpfe. */
  function tabRang(v) {
    const me = v.me || {};
    const my = v.my_answer;
    const richtig = my && my.is_correct;

    const urteil = my
        ? '<div class="ks-urteil ks-urteil--' + (richtig ? 'ok' : 'nein') + '">'
          + (richtig ? 'Richtig · +' + pkt(my.points_awarded) : 'Leider falsch')
          + ((me.streak > 1 && richtig) ? ' <i>🔥 ' + me.streak + 'er Serie</i>' : '')
          + '</div>'
        : '<div class="ks-urteil ks-urteil--weg">Keine Antwort abgegeben</div>';

    return `
      ${urteil}
      <div class="ks-trio">
        ${nachbarHTML(v.neighbor_before, 'vor')}
        <div class="ks-ich" data-slot="ich" data-cid="${me.creature_id | 0}">
          <span class="ks-inr">#${me.rank || '?'}</span>
          <div class="ks-ipic">${wesen(me.creature_id, me.skin_idx,
            localEmote || (richtig ? 'cheer' : my ? 'sad' : 'idle'))}</div>
          <span class="ks-iname">${esc(me.nickname || 'Du')}</span>
          <span class="ks-ipkt" data-ks="mypkt">${pkt(me.score)}</span>
          ${deltaHTML(me.rank_change)}
        </div>
        ${nachbarHTML(v.neighbor_after, 'nach')}
      </div>
      <div class="ks-emobar">${emoteBarHTML()}</div>`;
  }

  /* Auf dem Tablet steht während des Auftritts nur das eigene Wesen
     und die Ansage — keine Antworten, keine Emote-Leiste. Die Augen
     gehören nach vorn. */
  function tabIntro(v) {
    const me = v.me || {};
    return `
      <div class="ks-tintro">
        <div class="ks-tintro-pic" data-cid="${me.creature_id | 0}">
          ${wesen(me.creature_id, me.skin_idx, 'wave')}
        </div>
        <span class="ks-tintro-name">${esc(me.nickname || 'Du')}</span>
        <p class="ks-tintro-text">Gleich geht’s los —<br>pass auf!</p>
      </div>`;
  }

  /* Siegerehrung auf dem Tablet: erst nur „Siegerehrung am Beamer".
     Erst wenn die Ehrung vorn vorbei ist (endeFertig), steht hier der
     eigene Platz — Platz 1–3 mit großem Auftritt, alle anderen
     schlicht mit Platz und Punkten. */
  function tabEnde(v) {
    const me = v.me || {};
    if (!endeFertig()) {
      return `
        <div class="ks-tende ks-tende--warte" data-ks="tende">
          <div class="ks-tsieg-pic" data-cid="${me.creature_id | 0}">
            <div class="ks-ipic">${wesen(me.creature_id, me.skin_idx, localEmote || 'wave')}</div>
          </div>
          <h2 class="ks-tsieg-titel">🏆 Siegerehrung am Beamer</h2>
        </div>
        <div class="ks-emobar">${emoteBarHTML()}</div>`;
    }
    const rank = me.rank | 0;
    const top = rank >= 1 && rank <= 3;
    const medaille = ['', '🥇', '🥈', '🥉'][rank] || '';
    const titel = rank === 1 ? 'Du hast gewonnen!' : top ? 'Du stehst auf dem Treppchen!' : 'Dein Platz';
    return `
      <div class="ks-tende ks-tende--platz${top ? ' ks-tende--top ks-tende--p' + rank : ''}" data-ks="tende">
        <div class="ks-tsieg-pic" data-slot="ich" data-cid="${me.creature_id | 0}">
          <div class="ks-ipic">${wesen(me.creature_id, me.skin_idx, localEmote || me.emote || (top ? 'cheer' : 'idle'))}</div>
        </div>
        ${top ? '<span class="ks-tmedaille" aria-hidden="true">' + medaille + '</span>' : ''}
        <h2 class="ks-tsieg-titel">${top ? '🏆 ' : ''}${titel}</h2>
        <span class="ks-tplatz">Platz ${rank || '?'}</span>
        <span class="ks-tsieg-pkt">${pkt(me.score)} Punkte</span>
      </div>
      <div class="ks-emobar">${emoteBarHTML()}</div>`;
  }

  function nachbarHTML(p, slot) {
    if (!p) return '<div class="ks-nb ks-nb--leer" data-slot="' + slot + '"></div>';
    return `
      <div class="ks-nb" data-slot="${slot}" data-cid="${p.creature_id | 0}">
        <span class="ks-nnr">#${p.rank}</span>
        <div class="ks-npic">${wesen(p.creature_id, p.skin_idx, p.emote || 'idle')}</div>
        <span class="ks-nname">${esc(p.nickname)}</span>
        <span class="ks-npkt">${pkt(p.score)}</span>
      </div>`;
  }

  function emoteBarHTML() {
    return EMOTES.map(e => '<button type="button" class="ks-emo" data-emote="' + e.id
      + '" style="--c:' + e.c + '" title="' + e.title + '" aria-label="' + e.title + '">' + e.icon + '</button>').join('');
  }

  /* ─── Tablet flicken ────────────────────────────────────── */
  function flickeTab(v) {
    if (v.phase === 'question' && introAn()) return;
    if (v.phase === 'question') {
      const reading = isReadingPhase();
      const lock = stage.querySelector('[data-ks=lock]');
      const gesperrt = !!v.my_answer || answering || reading;
      if (lock) lock.hidden = !v.my_answer || reading;
      els.tiles.forEach(t => {
        const mein = v.my_answer && v.my_answer.chosen_idx === Number(t.dataset.idx);
        t.classList.toggle('is-meine', !!mein);
        t.disabled = gesperrt;
        t.classList.toggle('is-still', (gesperrt && !reading) && !mein);
      });
      const tme = stage.querySelector('[data-ks=tme]');
      if (tme) setEmote(tme, localEmote || (gesperrt && !reading ? 'sleep' : 'idle'), v.me.creature_id | 0);
      return;
    }

    if (v.phase === 'reveal' || v.phase === 'ended') {
      const me = v.me || {};
      const pk = stage.querySelector('[data-ks=mypkt]');
      if (pk) pk.textContent = pkt(me.score);
      flickeNachbar('vor', v.neighbor_before);
      flickeNachbar('nach', v.neighbor_after);
      // Das eigene Wesen: was ich GERADE gedrückt habe, gewinnt —
      // es soll sich sofort bewegen und nicht erst beim nächsten
      // Takt. Danach übernimmt wieder der Server.
      const ich = stage.querySelector('[data-slot=ich] .ks-ipic');
      const my = v.my_answer;
      setEmote(ich, localEmote || me.emote
        || (v.phase === 'ended' ? 'cheer' : my ? (my.is_correct ? 'cheer' : 'sad') : 'idle'),
        me.creature_id | 0);
    }
  }

  function flickeNachbar(slot, p) {
    const box = stage.querySelector('[data-slot="' + slot + '"]');
    if (!box) return;
    if (!p) { box.className = 'ks-nb ks-nb--leer'; box.innerHTML = ''; return; }
    if (box.classList.contains('ks-nb--leer') || Number(box.dataset.cid) !== (p.creature_id | 0)) {
      box.className = 'ks-nb';
      box.dataset.cid = String(p.creature_id | 0);
      box.innerHTML = `<span class="ks-nnr">#${p.rank}</span>
        <div class="ks-npic">${wesen(p.creature_id, p.skin_idx, p.emote || 'idle')}</div>
        <span class="ks-nname">${esc(p.nickname)}</span>
        <span class="ks-npkt">${pkt(p.score)}</span>`;
      // Auch am frisch gebauten Kasten: setEmote setzt nicht nur die
      // Bewegung, sondern auch `ks-springt` am Fenster.
      setEmote(box.querySelector('.ks-npic'), p.emote || 'idle', p.creature_id | 0);
      return;
    }
    box.querySelector('.ks-nnr').textContent = '#' + p.rank;
    box.querySelector('.ks-nname').textContent = p.nickname;
    box.querySelector('.ks-npkt').textContent = pkt(p.score);
    setEmote(box.querySelector('.ks-npic'), p.emote || 'idle', p.creature_id | 0);
  }

  /* ══════════════════════════════════════════════════════════
     EDITOR (nur Presenter, nur in der Lobby)
     ══════════════════════════════════════════════════════════ */
  function ladeSkript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'tools/KnowledgeStack/' + src + '?v=' + ASSET_V;
      s.onload = resolve;
      s.onerror = () => reject(new Error(src + ' konnte nicht geladen werden'));
      document.head.appendChild(s);
    });
  }

  function ladeEditor() {
    if (window.KSEditor && window.KSParse) return Promise.resolve();
    return (window.KSParse ? Promise.resolve() : ladeSkript('parse.js')).then(() => new Promise((resolve, reject) => {
      if (window.KSEditor) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'tools/KnowledgeStack/editor.js?v=' + ASSET_V;
      s.onload = () => {
        // CSS einmalig einfügen
        if (!document.getElementById('kse-css')) {
          const st = document.createElement('style');
          st.id = 'kse-css';
          st.textContent = window.KSEditor.CSS;
          document.head.appendChild(st);
        }
        resolve();
      };
      s.onerror = () => reject(new Error('editor.js konnte nicht geladen werden'));
      document.head.appendChild(s);
    }));
  }

  function editorAuf() { return !!(editor && editor.mode); }

  function holeEditor() {
    if (editor) return editor;
    editor = window.KSEditor.create({
      call:           (fn, args) => ctx.actions.call(fn, args),
      catalogs:       () => catalogs,
      reloadCatalogs: () => { lastSig = null; return poll(); },
      redraw:         () => { lastFrame = null; zeichne(); },
      onClose:        () => { lastFrame = null; zeichne(); },
      toast:          (m, e) => ctx.toast(m, e),
      confirm:        m => ctx.confirm(m),
      errText:        fehlerText,
      // „▶ Spielen" in der Übersicht: den Katalog aufs Brett legen.
      onPlay: async catId => {
        const r = await ctx.actions.call('ks_room_setup', { p_catalog: catId });
        if (r && r.ok) { lastSig = null; poll(); }
        return r;
      }
    });
    return editor;
  }

  /* ══════════════════════════════════════════════════════════
     Bedienung
     ══════════════════════════════════════════════════════════ */
  function binde() {
    stage.addEventListener('click', onClick);
    const sel = stage.querySelector('[data-ks=cat]');
    if (sel) sel.addEventListener('change', async () => {
      const r = await ctx.actions.call('ks_room_setup', { p_catalog: sel.value });
      if (!r.ok) { ctx.toast(fehlerText(r.error), true); return; }
      lastSig = null;
      poll();
    });
    // Editor: Klicks auf data-ed, Text-Import, Fotos, Ziehen.
    if (editorAuf()) editor.bind(stage);
  }

  /* Ein Listener je Bild und fünf getrennte Fragen danach, WAS
     getroffen wurde. Nicht ein closest() über alle data-Attribute
     zusammen: `.ks-wesen` trägt selbst ein data-cid, und ein Klick
     mitten auf ein Wesen in der Wesenwahl fand dann das SVG statt
     des Knopfes darum. */
   async function onClick(ev) {
    if (!ctx || !view) return;
    const act  = ev.target.closest('[data-act]');
    const ed   = ev.target.closest('[data-ed]');
    const emo  = ev.target.closest('[data-emote]');
    const tile = ev.target.closest('.ks-k');
    const pick = ev.target.closest('.ks-pick');
    const skin = ev.target.closest('.ks-skin');

    /* ─── Editor-Aktionen (data-ed) ─────────────────────────
       Gehören editor.js — der hat seinen eigenen Listener. */
    if (ed) return;

    /* ─── Pult: weiterschalten ───────────────────────────── */
    if (act) {
      if (act.dataset.act === 'wechsel') { pickerOffen = true; lastFrame = null; zeichne(); return; }
      if (act.dataset.act === 'fertig')  { pickerOffen = false; lastFrame = null; zeichne(); return; }

      // Editor öffnen (Lobby-Button)
      if (act.dataset.act === 'editor') {
        try { await ladeEditor(); }
        catch (e) { ctx.toast(e.message, true); return; }
        if (destroyed) return;
        holeEditor().openList();
        return;
      }

      if (act.dataset.act === 'finish' || act.dataset.act === 'restart') {
        const fertig = act.dataset.act === 'finish';
        const ok = await ctx.confirm(fertig
          ? 'Quiz jetzt beenden und direkt zur Siegerehrung?'
          : 'Quiz von vorn starten? Alle Punkte werden auf 0 gesetzt.');
        if (!ok) return;
        act.disabled = true;
        const r = await ctx.actions.call(fertig ? 'ks_finish' : 'ks_restart', {});
        if (!r.ok) { act.disabled = false; ctx.toast(fehlerText(r.error), true); return; }
        lastSig = null;
        poll();
        return;
      }

      act.disabled = true;
      // p_from: aus WELCHER Phase heraus geklickt wurde. Ist die Uhr
      // im selben Augenblick abgelaufen, verpufft der Klick statt
      // eine Frage zu überspringen (Migration 0175).
      const r = await ctx.actions.call('ks_step', { p_from: view.phase });
      if (!r.ok) { act.disabled = false; ctx.toast(fehlerText(r.error), true); return; }
      lastSig = null;
      poll();
      return;
    }

    /* ─── Emote ──────────────────────────────────────────── */
    if (emo) {
      const e = emo.dataset.emote;
      emo.classList.add('is-gedrueckt');
      setTimeout(() => emo.classList.remove('is-gedrueckt'), 220);
      // Sofort auf dem eigenen Gerät, ohne auf den Server zu warten:
      // ein Knopf, der erst beim nächsten Takt etwas tut, fühlt sich
      // kaputt an. Der Beamer bekommt es über den Server.
      zeigeLokalesEmote(e);
      const r = await ctx.actions.call('ks_emote', { p_emote: e });
      if (!r.ok && r.error !== 'invalid_input') ctx.toast(fehlerText(r.error), true);
      return;
    }

    /* ─── Antwort ────────────────────────────────────────── */
    if (tile && role === 'participant' && view.phase === 'question') {
      if (isReadingPhase()) return;
      const el = tile;
      if (answering || view.my_answer) return;
      answering = true;
      const idx = Number(el.dataset.idx);
      els.tiles.forEach(t => { t.disabled = true; if (t !== el) t.classList.add('is-still'); });
      el.classList.add('is-meine');
      const lock = stage.querySelector('[data-ks=lock]');
      if (lock) lock.hidden = false;

      const r = await ctx.actions.call('ks_answer', {
        p_question_idx: view.current_q_idx | 0,
        p_chosen: idx,
        // Die Zeit seit dem Aufdecken, auf DIESEM Gerät gemessen.
        // Der Server nimmt sie, solange sie zu seiner eigenen passt
        // (höchstens 1,5 s darunter, 0189) — so kostet ein langsames
        // WLAN keine Punkte.
        p_response_ms: Math.max(0, Math.round(
          ((view.question && view.question.time_limit) || 20) * 1000 - (restMs() || 0)))
      });
      if (!r.ok) {
        answering = false;
        if (r.error !== 'already_answered') {
          ctx.toast(fehlerText(r.error), true);
          els.tiles.forEach(t => { t.disabled = false; t.classList.remove('is-still', 'is-meine'); });
          if (lock) lock.hidden = true;
        }
      }
      lastSig = null;
      poll();
      return;
    }

    /* ─── Wesen / Farbe wählen ───────────────────────────── */
    if (pick) {
      myCreature = Number(pick.dataset.cid);
      stage.querySelectorAll('.ks-pick').forEach(b => b.classList.toggle('is-on', b === pick));
      malVorschau();
      speicherWesen();
      return;
    }
    if (skin) {
      mySkin = Number(skin.dataset.skin);
      stage.querySelectorAll('.ks-skin').forEach(b =>
        b.classList.toggle('is-on', Number(b.dataset.skin) === mySkin));
      // Auch die Auswahl selbst umfärben — sonst zeigt sie 36 Wesen
      // in der alten Farbe und die Vorschau in der neuen.
      stage.querySelectorAll('.ks-pick').forEach(b => {
        const cid = Number(b.dataset.cid);
        const name = b.querySelector('span');
        b.innerHTML = wesen(cid, mySkin, 'idle')
          + '<span>' + esc(name ? name.textContent : '') + '</span>';
      });
      malVorschau();
      speicherWesen();
    }
  }

  function malVorschau() {
    const v = stage.querySelector('[data-ks=vorschau]');
    if (!v) return;
    v.dataset.cid = String(myCreature);
    v.innerHTML = wesen(myCreature, mySkin, 'wave');
    const nm = stage.querySelector('[data-ks=wname]');
    if (nm) nm.textContent = wesenName(myCreature);
    // Die Farbnamen gehören zum Wesen und wechseln mit ihm.
    const sk = stage.querySelector('[data-ks=skins]');
    if (sk) sk.innerHTML = skinKnoepfe();
  }

  /* Entprellt: wer sich durch die 36 Wesen tippt, soll nicht 36
     Aufrufe erzeugen. 500 ms sind lang genug, um das Durchtippen
     zusammenzufassen, und kurz genug, dass es vor dem Start da ist. */
  function speicherWesen() {
    if (profileT) clearTimeout(profileT);
    profileT = setTimeout(async () => {
      profileT = null;
      const r = await ctx.actions.call('ks_join', {
        p_creature: myCreature, p_skin: mySkin
      });
      if (!r.ok) ctx.toast(fehlerText(r.error), true);
      lastSig = null;
    }, 500);
  }

  /* Zurück auf ein Wesen, das gerade nicht ausgewählt ist: der Takt
     darf die Wesenwahl nicht wegräumen. Steht sie offen, ist das
     Bild „ended|pick" — und weil pickerOffen im frameKey steckt,
     bleibt es das, bis „Fertig" gedrückt wird. */
  function zeigeLokalesEmote(e) {
    localEmote = e;
    if (localEmoteT) clearTimeout(localEmoteT);
    const ziel = stage.querySelector('[data-slot=ich] .ks-ipic')
              || stage.querySelector('[data-ks=vorschau]')
              || stage.querySelector('[data-ks=tme]');
    const cid = (view && view.me ? view.me.creature_id : myCreature) | 0;
    setEmote(ziel, e, cid);
    localEmoteT = setTimeout(() => {
      localEmote = null;
      if (destroyed || !view) return;
      /* In der Lobby flickt niemand — dort gibt es keine Punkte und
         keine Nachbarn, also kennt flickeTab die Phase gar nicht.
         Ohne diese Zeile bliebe das Wesen in der Vorschau ewig in
         der letzten Bewegung stehen (und bei einem Sprung bliebe
         auch `ks-springt` am Fenster hängen). Zurück auf das
         Winken, mit dem die Vorschau gebaut wird. */
      if (view.phase === 'lobby' || (view.phase === 'ended' && pickerOffen)) {
        setEmote(stage.querySelector('[data-ks=vorschau]'), 'wave', myCreature);
        return;
      }
      flickeTab(view);
    }, EMOTE_MS);
  }

  /* ══════════════════════════════════════════════════════════
     Anmeldung
     ══════════════════════════════════════════════════════════ */
  function ladeAssets() {
    if (!document.querySelector('link[data-ks-creatures]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'tools/KnowledgeStack/creatures.css?v=' + ASSET_V;
      l.setAttribute('data-ks-creatures', '1');
      document.head.appendChild(l);
    }
    if (window.KSCreatures) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'tools/KnowledgeStack/creatures.js?v=' + ASSET_V;
      s.onload = res;
      s.onerror = () => rej(new Error('creatures.js nicht gefunden'));
      document.head.appendChild(s);
    });
  }

  window.MPTool.register('knowledgestack', {

    /* Nichts abzufragen, und das ist eine Angabe: lehrer.js
       unterscheidet daran „dieser Skill hat keine Einstellungen"
       von „die Einstellungen sind noch nicht geladen". Der Katalog
       wird nicht hier gewählt, sondern in der Lobby — dort sieht
       die Lehrkraft, wie viele Fragen darin stehen, und kann ihn
       vor dem Start noch tauschen. */
    settingsFields: [],

    async mount(el, context) {
      root = el; ctx = context; role = context.role;
      destroyed = false; busy = false;
      lastSig = null; lastFrame = null; view = null;
      els = {}; catalogs = []; skew = 0; uhrProben = [];
      localEmote = null; answering = false; pickerOffen = false;
      if (editor) editor.destroy();
      editor = null;
      bild = { qid: null, src: null, laedt: false };

      root.innerHTML = '<div class="ks-frame"><div class="ks-stage">'
        + '<p class="ks-booting">Quiz wird geladen …</p></div></div>';
      frame = root.querySelector('.ks-frame');
      stage = root.querySelector('.ks-stage');
      frame.classList.add(role === 'presenter' ? 'ks-frame--beam' : 'ks-frame--tab');

      // Am Beamer wie auf dem Tablet gehört dem Quiz der ganze
      // Rest der Seite — dieselbe Klasse wie bei NeuroLab, Cäsar,
      // Clash und Wordisland.
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');

      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();

      try {
        await ladeAssets();
      } catch (e) {
        console.error('[knowledgestack]', e);
        stage.innerHTML = '<div class="ks-booting">Die Wesen ließen sich nicht laden. '
          + 'Lade die Seite neu.</div>';
        return;
      }
      if (destroyed) return;
      poll();
    },

    // Der Seiten-Poller hat etwas gesehen. Für uns meist
    // bedeutungslos (wir haben unseren eigenen Takt), aber ein
    // billiger zusätzlicher Anstoß.
    update() { if (!destroyed) poll(); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearTimeout(pollTimer);
      stopClock();
      if (profileT) clearTimeout(profileT);
      if (localEmoteT) clearTimeout(localEmoteT);
      pollTimer = profileT = localEmoteT = null;
      stopBewegung();
      podestVorher = new Map();
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      document.body.classList.remove('tool-fill');
      root = ctx = frame = stage = null;
      role = null; view = null; els = {};
      lastSig = lastFrame = null;
      pickerOffen = false; localEmote = null;
      if (editor) editor.destroy();
      editor = null;
      bild = { qid: null, src: null, laedt: false };
      zeigeFehler.last = null;
    }
  });

})();
