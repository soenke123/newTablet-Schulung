/* YourSozialNet – Dummy-Daten (handgeschrieben)
   Zu MPSkills/PLAN_DUMMYDATEN.md und dummy/LISTE.md.

   Alles ist RELATIV zum Stichtag (= Raum erstellt):
     a:   [Jahre, Tage]  → birthday = (Stichtag − Tage) − Jahre  (gleiche Tage = gleicher Tag/Monat)
                           (Tage < 0: Geburtstag liegt noch vor uns, z. B. [18, -1] = wird morgen 18)
     reg: Tage vor dem Stichtag registriert
     ago: Tage vor dem Stichtag gepostet (sonst verteilt der Generator)
   In E-Mails steht {netz} für den Namen des Netzwerks (klein, ohne Sonderzeichen).

   Was hier steht, ist von Hand gemacht: User, Fotos, Diskussionen.
   Likes, Follows, Füll-Kommentare, sessions und views erzeugt generator.js
   nach festen Regeln (gleicher Stichtag + Seed = gleiche Daten). */
(function (root) {
  'use strict';

  /* Interessen: gaming fussball fitness lifestyle reisen kreativ musik food tiere segeln flacheerde wissenschaft
     r: cc = Content Creator · n = Normalo · k = kommentiert/liked nur · t = Troll · l = leeres Konto
     dev: Hauptgerät (siehe DEVICES in generator.js) · home: gemeinsame Heim-IP (gleicher Schlüssel = gleiche IP) */
  const USERS = [
    // ── Content Creators ────────────────────────────────────────────────
    { k: 'pixelpaul', n: 'Paul Brandt', a: [19, 140], g: 'male', c: 'Leipzig', l: 'Deutschland', cm: 182,
      m: 'paul.brandt@{netz}.test', bio: '🎮 Streamer | jeden Mi + Fr 20 Uhr live | Leipzig', av: 'av_paul',
      reg: 720, r: 'cc', i: ['gaming'], dev: ['desktop_win', 'android'] },
    { k: 'noobqueen', n: 'Mia Sander', a: [17, 52], g: 'female', c: 'Kiel', l: 'Deutschland', cm: 165,
      m: 'mia.sander@gmx.test', bio: 'cozy games & fanart ☁️🍄', av: 'av_mia',
      reg: 540, r: 'cc', i: ['gaming', 'kreativ'], dev: ['iphone'] },
    { k: 'hugo.ranked', n: 'Hugo Wendt', a: [15, 301], g: 'male', c: 'Berlin', l: 'Deutschland', cm: 171,
      m: 'hugo.ist.der.beste@web.test', pw: 'passwort', bio: 'GOLD 🏆 bald Platin', av: 'av_hugo',
      reg: 300, r: 'cc', i: ['gaming'], dev: ['android', 'desktop_win'] },
    { k: 'levi.kicks', n: 'Levi Schumacher', a: [17, 210], g: 'male', c: 'Kiel', l: 'Deutschland', cm: 184,
      m: 'levi.schumacher@{netz}.test', bio: '⚽ #10 | C→B-Jugend | Kiel', av: 'av_levi',
      reg: 610, r: 'cc', i: ['fussball', 'fitness'], dev: ['iphone'] },
    { k: 'fitbyfee', n: 'Fee Lorenz', a: [24, 33], g: 'female', c: 'München', l: 'Germany', cm: 168,
      m: 'kontakt.fitbyfee@gmail.test', bio: 'Fitness 🏋️‍♀️ | Rezepte | Kooperationen per Mail', av: 'av_fee',
      reg: 800, r: 'cc', i: ['fitness', 'food'], dev: ['iphone', 'mac'] },
    { k: 'coach_ralf', n: 'Ralf Opitz', a: [46, 120], g: 'male', c: 'Kiel', l: 'Deutschland', cm: 179,
      m: 'r.opitz@t-online.test', pw: '123456', bio: 'Trainer C-Jugend TSV Förde', av: 'av_ralf',
      reg: 450, r: 'cc', i: ['fussball'], dev: ['android'] },
    { k: 'finn.kielwasser', n: 'Finn Lüdtke', a: [27, 260], g: 'male', c: 'Kiel', l: 'Deutschland', cm: 188,
      m: 'finn@{netz}.test', bio: '⛵ Regatta | Kieler Woche jedes Jahr', av: 'av_finn',
      reg: 690, r: 'cc', i: ['segeln', 'reisen'], dev: ['iphone', 'mac'] },
    { k: 'alina.daily', n: 'Alina Keller', a: [21, 77], g: 'female', c: 'Hamburg', l: 'Deutschland', cm: 170,
      m: 'alina.keller@{netz}.test', bio: 'coffee • outfits • sunsets 🍂 Hamburg', av: 'av_alina',
      reg: 760, r: 'cc', i: ['lifestyle', 'reisen'], dev: ['iphone', 'mac'] },
    { k: 'jona.sneaks', n: 'Jona Petersen', a: [18, 190], g: 'diverse', c: 'Köln', l: 'Deutschland', cm: 176,
      m: 'jonasneaks@posteo.test', bio: 'Sneaker 👟 Thrift ♻️ they/them', av: 'av_jona',
      reg: 410, r: 'cc', i: ['lifestyle'], dev: ['android'] },
    { k: 'giulia.glow', n: 'Giulia Romano', a: [20, 15], g: 'female', c: 'München', l: 'Deutschland', cm: 163,
      m: 'giulia.romano@{netz}.test', bio: 'Make-up 💜 Produkte, die ich wirklich benutze', av: 'av_giulia',
      reg: 500, r: 'cc', i: ['lifestyle'], dev: ['iphone'] },
    { k: 'lostwithlena', n: 'Lena Vogt', a: [26, 330], g: 'female', c: 'Freiburg', l: 'Deutschland', cm: 172,
      m: 'lena.unterwegs@gmx.test', bio: '🎒 37 Länder | #abenteuerlust', av: 'av_lena',
      reg: 880, r: 'cc', i: ['reisen'], dev: ['android', 'desktop_mac_ff'] },
    { k: 'vanlife_tomasz', n: 'Tomasz Kowalski', a: [31, 45], g: 'male', c: null, l: 'Polen', cm: 186,
      m: 'tomasz.k@{netz}.test', bio: 'Zuhause ist, wo ich parke 🚐', av: 'av_tomasz',
      reg: 650, r: 'cc', i: ['reisen'], dev: ['android', 'desktop_linux'], vpn: true },
    { k: 'alex.achen', n: 'Alexander Achen', a: [29, 99], g: 'male', c: 'Aachen', l: 'Deutschland', cm: 181,
      m: 'alexander.achen@web.test', bio: 'Städte, Architektur, Croissants', av: 'av_alex',
      reg: 590, r: 'cc', i: ['reisen', 'food'], dev: ['iphone', 'mac'] },
    { k: 'inkandmila', n: 'Mila Hoffmann', a: [16, 200], g: 'female', c: 'Leipzig', l: 'Deutschland', cm: 160,
      m: 'mila.zeichnet@{netz}.test', bio: '✏️ Inktober jeden Tag | keine Anfragen', av: 'av_mila',
      reg: 430, r: 'cc', i: ['kreativ'], dev: ['ipad', 'iphone'] },
    { k: 'linus.lens', n: 'Linus Graf', a: [22, 280], g: 'male', c: 'Rostock', l: 'Deutschland', cm: 183,
      m: 'linus.graf@{netz}.test', bio: '📷 Langzeitbelichtung | Ostsee', av: 'av_linus',
      reg: 700, r: 'cc', i: ['kreativ', 'reisen'], dev: ['desktop_win_ff', 'android'] },
    { k: 'beatsbyamara', n: 'Amara Okafor', a: [19, 63], g: 'female', c: 'Berlin', l: 'Deutschland', cm: 174,
      m: 'amara.okafor@{netz}.test', bio: '🎧 Producer | neuer Beat jeden Freitag', av: 'av_amara',
      reg: 380, r: 'cc', i: ['musik'], dev: ['mac', 'iphone'] },
    { k: 'backmitbrigitte', n: 'Brigitte Lang', a: [52, 180], g: 'female', c: 'Stuttgart', l: 'Deutschland', cm: 164,
      m: 'brigitte.lang@t-online.test', bio: 'Backen wie bei Oma 🍰 Rezepte gibt es ab 60 Likes!', av: 'av_brigitte',
      reg: 560, r: 'cc', i: ['food'], dev: ['ipad'] },
    { k: 'ole.kocht.billig', n: 'Ole Jansen', a: [23, 140], g: 'male', c: 'Münster', l: 'Deutschland', cm: 190,
      m: 'olejansen@{netz}.test', bio: 'Kochen für unter 3 € 🍝 Student', av: 'av_ole',
      reg: 330, r: 'cc', i: ['food'], dev: ['android'] },
    { k: 'wuffi_und_ich', n: 'Henriette Zimmerman', a: [34, 222], g: 'female', c: 'Kiel', l: 'Deutschland', cm: 169,
      m: 'henriette.zimmerman@{netz}.test', bio: 'Bruno 🐶 Golden Retriever, 3 Jahre', av: 'av_henriette',
      reg: 640, r: 'cc', i: ['tiere'], dev: ['iphone'] },
    { k: 'katzenkram', n: 'Sofia Weber', a: [14, 150], g: 'female', c: 'Hannover', l: 'Deutschland', cm: 158,
      m: 'katzenliebe2000@gmx.test', bio: '🐱 Mimi 🐹 Pausbacke 🦎 Rocky', av: 'av_sofia',
      reg: 260, r: 'cc', i: ['tiere'], dev: ['android'] },
    { k: 'wachtauf_marco', n: 'Marco Brenner', a: [38, 70], g: 'male', c: 'Dresden', l: 'Deutschland', cm: 177,
      m: 'die.wahrheit@wachtauf.test', pw: 'wahrheit', bio: 'Selber denken! 🌍 ist flach. Mehr auf wacht-auf.test', av: 'av_marco',
      reg: 520, r: 'cc', i: ['flacheerde'], dev: ['desktop_win_edge', 'android'] },
    { k: 'frag_frieda', n: 'Frieda Ahrens', a: [25, 305], g: 'female', c: 'Göttingen', l: 'Deutschland', cm: 166,
      m: 'frieda.ahrens@{netz}.test', bio: 'Physik-Studentin 🔭 Ich erkläre, ihr fragt', av: 'av_frieda',
      reg: 470, r: 'cc', i: ['wissenschaft'], dev: ['desktop_linux', 'android'] },

    // ── Kommentierer und Trolle ─────────────────────────────────────────
    { k: 'aaron183', n: 'Aaron Krämer', a: [16, 95], g: 'male', c: 'Bochum', l: 'Deutschland', cm: 175,
      m: 'aaron183@{netz}.test', bio: '', av: null,
      reg: 280, r: 't', i: ['gaming', 'fussball'], dev: ['android'] },
    { k: 'realtalk_dennis', n: 'Dennis Vogel', a: [22, 12], g: 'male', c: 'Magdeburg', l: 'Deutschland', cm: 180,
      m: 'sagt.nur.die.wahrheit@web.test', bio: 'Sag ich halt, was alle denken', av: null,
      reg: 350, r: 't', i: ['lifestyle', 'fitness'], dev: ['android'] },
    { k: 'mondrueckseite', n: 'Ronny Pfeiffer', a: [41, 160], g: 'male', c: 'Chemnitz', l: 'Deutschland', cm: 250,
      m: 'echsenjaeger@aluhut.test', bio: '🦎🌑 Ich sehe, was ihr nicht seht.', av: 'av_ronny',
      reg: 400, r: 't', i: ['flacheerde', 'tiere'], dev: ['desktop_win_edge'] },
    { k: 'echsenwache', n: 'Sven Kühn', a: [35, 40], g: 'male', c: 'Zwickau', l: 'Deutschland', cm: 178,
      m: 'sven.kuehn@{netz}.test', bio: 'Augen auf 👀', av: 'av_sven',
      reg: 260, r: 't', i: ['flacheerde', 'tiere', 'food'], dev: ['android'] },
    { k: 'marco_hat_recht', n: 'Uwe Fink', a: [52, 300], g: 'male', c: 'Dresden', l: 'deutschland', cm: 173,
      m: 'uwe.fink1972@t-online.test', pw: 'marco_hat_recht', bio: 'Marco for President', av: 'av_uwe',
      reg: 480, r: 'k', i: ['flacheerde'], dev: ['desktop_win_edge'] },
    { k: 'nina.netz', n: 'Nina Lehmann', a: [19, 250], g: 'female', c: 'Kiel', l: 'Deutschland', cm: 171,
      m: 'nina.lehmann@{netz}.test', bio: 'Sei nett. Ist kostenlos. 💛', av: 'av_nina',
      reg: 390, r: 'k', i: ['lifestyle', 'tiere'], dev: ['iphone'] },
    { k: 'levi_fan_09', n: 'Marie Schuster', a: [14, 30], g: 'female', c: 'Kiel', l: 'Deutschland', cm: 157,
      m: 'levi.ist.mein.held@gmx.test', bio: '🔥 @levi.kicks 🔥', av: 'av_marie',
      reg: 200, r: 'k', i: ['fussball'], dev: ['android'] },
    { k: 'gewinn_jetzt_2026', n: null, a: null, g: null, c: null, l: null, cm: null,
      m: 'noreply@gratis-follower.test', bio: '💰 GRATIS FOLLOWER 👉 Link in Bio', av: 'av_bot',
      reg: 40, r: 'k', i: [], dev: ['desktop_linux'], bot: true },
    { k: 'stefan.b', n: 'Stefan Busch', a: [30, 110], g: 'male', c: 'Hannover', l: 'Deutschland', cm: 185,
      m: 'stefan.busch@{netz}.test', bio: '', av: null,
      reg: 600, r: 'k', i: ['reisen', 'food', 'fussball'], dev: ['desktop_win', 'iphone'], silent: true },
    { k: 'patte_witzig', n: 'Patrick Lindner', a: [18, 170], g: 'male', c: 'Bremen', l: 'Deutschland', cm: 176,
      m: 'ich.bin.lustig@web.test', bio: 'Wortspiele sind mein Sport 🦆', av: 'av_patrick',
      reg: 320, r: 'k', i: ['gaming', 'food', 'flacheerde'], dev: ['android'] },

    // ── Normalos ────────────────────────────────────────────────────────
    { k: 'lasse.ld', n: 'Lasse Lüders', a: [16, 61], g: 'male', c: 'Berlin', l: 'Deutschland', cm: 178,
      m: 'lasse.lueders@{netz}.test', bio: 'Berlin | 🛹', av: 'av_lasse',
      reg: 360, r: 'n', i: ['gaming', 'food'], dev: ['iphone'], home: 'berlin_nachbarn' },
    { k: 'erna.lueders', n: 'Erna Lüders', a: [78, 140], g: 'female', c: 'Lübeck', l: 'Deutschland', cm: 158,
      m: 'ERNA.LUEDERS@T-ONLINE.TEST', pw: 'lasse', bio: 'Oma von Lasse 🌹', av: 'av_erna',
      reg: 90, r: 'n', i: ['food', 'tiere'], dev: ['ipad_alt'] },
    { k: 'lars_p', n: 'Lars Peters', a: [17, 280], g: 'male', c: 'Hamburg ', l: 'Deutschland', cm: 186,
      m: 'lars.peters@{netz}.test', bio: '', av: null,
      reg: 300, r: 'n', i: ['fussball'], dev: ['android'] },
    { k: 'larsole', n: 'Lars-Ole Kunz', a: [19, 33], g: 'male', c: 'Berlin', l: 'Deutschland', cm: 181,
      m: 'larsole.kunz@web.test', bio: 'Zocken, Zug fahren, Döner', av: null,
      reg: 340, r: 'n', i: ['gaming'], dev: ['desktop_win', 'android'], home: 'berlin_nachbarn' },
    { k: 'levi.berlin', n: 'Levi Schumacher', a: [34, 188], g: 'male', c: 'Berlin', l: 'Deutschland', cm: 179,
      m: 'levi.schumacher@web.test', bio: 'Radfahren, Reisen, Berlin', av: 'av_leviberlin',
      reg: 510, r: 'n', i: ['reisen'], dev: ['iphone', 'mac'] },
    { k: 'levi_nwk', n: 'Levi Nowak', a: [16, 17], g: 'male', c: 'Kiel', l: 'Deutschland', cm: 174,
      m: 'levi.nowak@{netz}.test', bio: '', av: null,
      reg: 240, r: 'n', i: ['fussball', 'gaming'], dev: ['android'] },
    { k: 'felix.b', n: 'Felix Brandt', a: [18, 210], g: 'male', c: 'Berlin', l: 'Deutschland', cm: 183,
      m: 'felix.brandt@{netz}.test', bio: '', av: null,
      reg: 270, r: 'n', i: ['gaming'], dev: ['android'] },
    { k: 'felix_ude', n: 'Felix Ude', a: [25, 90], g: 'male', c: 'Bremen', l: 'Deutschland', cm: 177,
      m: 'felixude@gmail.test', bio: 'Laufen 🏃 Weser', av: 'av_felixude',
      reg: 480, r: 'n', i: ['fitness'], dev: ['iphone'] },
    { k: 'fmroth', n: 'Felix-Maximilian Roth', a: [16, 120], g: 'male', c: 'Berlin', l: 'Deutschland', cm: 169,
      m: 'fmr@{netz}.test', bio: '', av: null,
      reg: 150, r: 'n', i: ['gaming'], dev: ['android'] },
    { k: 'lisa.mei', n: 'Lisa Meier', a: [15, 240], g: 'female', c: 'München', l: 'Deutschland', cm: 162,
      m: 'lisa.meier@{netz}.test', bio: 'BFF 💕', av: null,
      reg: 210, r: 'n', i: ['lifestyle'], dev: ['iphone'] },
    { k: 'lisamarie.k', n: 'Lisa-Marie Kraft', a: [22, 66], g: 'female', c: 'Leipzig', l: 'Deutschland', cm: 167,
      m: 'lisamarie.kraft@posteo.test', bio: 'Lehramt Geo/Bio 🌍', av: null,
      reg: 420, r: 'n', i: ['reisen', 'wissenschaft'], dev: ['android'] },
    { k: 'elisa_b', n: 'Elisa Brandt', a: [17, 200], g: 'female', c: 'Leipzig', l: 'Deutschland', cm: 165,
      m: 'elisa.brandt@{netz}.test', bio: 'Kunst-LK 🎨', av: null,
      reg: 330, r: 'n', i: ['kreativ'], dev: ['iphone'] },
    { k: 'annalisa.f', n: 'Annalisa Ferri', a: [24, 155], g: 'female', c: 'München', l: 'Italien', cm: 166,
      m: 'annalisa.ferri@gmail.test', bio: 'Pasta 🍝 come la nonna', av: null,
      reg: 370, r: 'n', i: ['food'], dev: ['iphone'] },
    { k: 'laura.mauer', n: 'Laura Mauer', a: [20, 300], g: 'female', c: 'hamburg', l: 'Deutschland', cm: 169,
      m: 'laura.mauer@{netz}.test', bio: 'Fernweh ✈️ Fischbrötchen 🐟', av: 'av_laura',
      reg: 460, r: 'n', i: ['reisen', 'food'], dev: ['iphone'] },
    { k: 'sandra.schu', n: 'Sandra Schumacher', a: [44, 80], g: 'female', c: 'Kiel', l: 'Deutschland', cm: 168,
      m: 'sandra.schumacher@t-online.test', bio: 'Mama von Levi ⚽❤️', av: null,
      reg: 500, r: 'n', i: ['fussball'], dev: ['android'] },
    { k: 'marlo.eb', n: 'Marlo Eberhart', a: [23, 180], g: 'male', c: 'Köln', l: 'Germany', cm: 180,
      m: 'marlo.eberhart@{netz}.test', bio: '📷 analog | Reisetagebuch', av: 'av_marlo',
      reg: 440, r: 'n', i: ['reisen', 'kreativ'], dev: ['android'] },
    { k: 'jakob.hu', n: 'Jakob Huber', a: [15, 100], g: 'male', c: 'München', l: 'Deutschland', cm: 172,
      m: 'jakob.huber@{netz}.test', bio: '', av: null,
      reg: 190, r: 'n', i: ['fussball'], dev: ['android'] },
    { k: 'yusuf.dmr', n: 'Yusuf Demir', a: [15, 100], g: 'male', c: 'Gelsenkirchen', l: 'Deutschland', cm: 170,
      m: 'yusuf.demir@{netz}.test', bio: 'Königsblau ⚽', av: null,
      reg: 230, r: 'n', i: ['fussball', 'gaming'], dev: ['android'] },
    { k: 'ana.kovac', n: 'Ana Kovač', a: [18, 120], g: 'female', c: 'München', l: 'Deutschland', cm: 173,
      m: 'ana.kovac@gmx.test', bio: 'Yoga 🧘‍♀️ Mode 🤍', av: 'av_ana',
      reg: 290, r: 'n', i: ['fitness', 'lifestyle'], dev: ['iphone'] },
    { k: 'tim.richter', n: 'Tim Richter', a: [14, 260], g: 'male', c: 'Leipzig', l: 'Deutschland', cm: 163,
      m: 'tim.richter@{netz}.test', bio: '', av: null,
      reg: 180, r: 'n', i: ['gaming'], dev: ['android'], night: true },
    { k: 'ida.hsn', n: 'Ida Hansen', a: [13, 90], g: 'female', c: 'Kiel', l: 'Deutschland', cm: 155,
      m: 'ida.hansen@{netz}.test', pw: 'hallo123', bio: '7b 🏫 Keks 🐹', av: 'av_ida',
      reg: 120, r: 'n', i: ['tiere'], dev: ['iphone'], night: true },
    { k: 'lotta.b', n: 'Lotta Berg', a: [12, 205], g: 'female', c: 'Kassel', l: 'Deutschland', cm: 150,
      m: 'lotta.einhorn@gmx.test', bio: '🦄🐴', av: null,
      reg: 60, r: 'n', i: ['tiere', 'kreativ'], dev: ['android_tablet'] },
    { k: 'noah.sz', n: 'Noah Schulz', a: [18, -1], g: 'male', c: 'Bochum', l: 'Deutschland', cm: 181,
      m: 'noah.schulz@{netz}.test', bio: '', av: null,
      reg: 250, r: 'n', i: ['gaming'], dev: ['android'] },
    { k: 'emma.kr', n: 'Emma Krüger', a: [18, 1], g: 'female', c: 'Bonn', l: 'Deutschland', cm: 167,
      m: 'emma.krueger@{netz}.test', bio: '', av: null,
      reg: 310, r: 'n', i: ['lifestyle'], dev: ['iphone'] },
    { k: 'jannik.wolf', n: 'Jannik Wolf', a: [18, 140], g: 'male', c: 'Hambrug', l: 'DE', cm: 191,
      m: 'jannik.w@web.test', bio: 'Hamburger Jung ⚓', av: null,
      reg: 280, r: 'n', i: ['fussball'], dev: ['android'] },
    { k: 'werner.angelt', n: 'Werner Kaiser', a: [63, 210], g: 'male', c: 'Rostock', l: 'Deutschland', cm: 176,
      m: 'werner.kaiser@t-online.test', pw: '123456', bio: '40 Jahre zur See. Jetzt angeln.', av: 'av_werner',
      reg: 380, r: 'n', i: ['segeln'], dev: ['ipad_alt'] },
    { k: 'sophie.db', n: 'Sophie Dubois', a: [21, 130], g: 'female', c: 'Straßburg', l: 'Frankreich', cm: 164,
      m: 'sophie.dubois@{netz}.test', bio: 'Croquis & voyages ✏️', av: 'av_sophie',
      reg: 350, r: 'n', i: ['reisen', 'kreativ'], dev: ['iphone'] },
    { k: 'mikkel.s', n: 'Mikkel Sørensen', a: [24, 55], g: 'male', c: 'Aarhus', l: 'Dänemark', cm: 193,
      m: 'mikkel.sorensen@gmail.test', bio: '⛵ hygge', av: null,
      reg: 400, r: 'n', i: ['segeln'], dev: ['iphone'] },
    { k: 'leila.hd', n: 'Leila Haddad', a: [17, 310], g: 'female', c: 'Frankfurt', l: 'Deutschland', cm: 166,
      m: 'leila.haddad@{netz}.test', bio: '🎸 erster Song kommt', av: null,
      reg: 220, r: 'n', i: ['kreativ', 'musik'], dev: ['iphone'] },
    { k: 'nikos.pap', n: 'Nikos Papadopoulos', a: [27, 170], g: 'male', c: 'Wien', l: 'Österreich', cm: 178,
      m: 'nikos.pap@{netz}.test', bio: 'Essen ist Liebe', av: 'av_nikos',
      reg: 450, r: 'n', i: ['food', 'reisen'], dev: ['android', 'desktop_win'] },
    { k: 'aylin.ylmz', n: 'Aylin Yılmaz', a: [16, 230], g: 'female', c: 'Duisburg', l: 'Deutschland', cm: 161,
      m: 'aylin.yilmaz@{netz}.test', bio: 'Konzerte > alles', av: 'av_aylin',
      reg: 260, r: 'n', i: ['lifestyle', 'musik'], dev: ['iphone'] },
    { k: 'matteo.bi', n: 'Matteo Bianchi', a: [19, 280], g: 'male', c: 'Zürich', l: 'Schweiz', cm: 187,
      m: 'matteo.bianchi@gmail.test', bio: 'Gym mit Aussicht 🏔️', av: null,
      reg: 300, r: 'n', i: ['fitness'], dev: ['iphone'] },
    { k: 'priya.sh', n: 'Priya Sharma', a: [20, 140], g: 'female', c: 'Darmstadt', l: 'Deutschland', cm: 160,
      m: 'priya.sharma@{netz}.test', bio: 'Astro-Nerd 🪐', av: 'av_priya',
      reg: 340, r: 'n', i: ['wissenschaft'], dev: ['android', 'desktop_linux'] },
    { k: 'ben.fischer', n: 'Ben Fischer', a: [16, 330], g: 'male', c: 'Bremen', l: null, cm: null,
      m: 'ben.fischer@{netz}.test', bio: '', av: null,
      reg: 170, r: 'n', i: ['fussball'], dev: ['android'] },

    // ── leere Konten ────────────────────────────────────────────────────
    { k: 'max.mueller', n: 'Max Müller', a: [15, 20], g: 'male', c: 'München', l: 'Deutschland', cm: null,
      m: 'max.mueller@{netz}.test', bio: '', av: null, reg: 140, r: 'l', i: [], dev: [] },
    { k: 'test_account', n: null, a: null, g: null, c: null, l: null, cm: null,
      m: null, bio: null, av: null, reg: 700, r: 'l', i: [], dev: [] },
    { k: 'jule.w', n: 'Jule Winter', a: [19, 10], g: 'female', c: 'Kiel', l: 'Deutschland', cm: 170,
      m: 'jule.winter@{netz}.test', bio: '', av: null, reg: 2, r: 'l', i: [], dev: [] },
    { k: 'geloescht_4711', n: 'Gelöschter Nutzer', a: null, g: null, c: null, l: null, cm: null,
      m: null, bio: null, av: null, reg: 520, r: 'l', i: [], dev: [] }
  ];

  /* Fotos: [Datei, Besitzer, Post-Text (null = keiner), Tags, ago (optional), Uhrzeit (optional)]
     Reihenfolge je Besitzer = älteste zuerst. noLike = bekommt nie ein Like. */
  const PHOTOS = [
    ['paul_01', 'pixelpaul', 'Setup ist endlich fertig 😍', ['gaming', 'setup']],
    ['paul_02', 'pixelpaul', 'Stream heute 20 Uhr!', ['gaming', 'stream']],
    ['paul_03', 'pixelpaul', 'Platz 1 beim Leipziger Turnier 🏆', ['gaming', 'turnier', 'leipzig']],
    ['paul_04', 'pixelpaul', 'Zu viel? 😅', ['gaming']],
    ['paul_05', 'pixelpaul', 'Welcher ist euer Favorit?', ['gaming', 'retro']],
    ['paul_06', 'pixelpaul', 'GG an @hugo.ranked 😏', ['gaming', 'ranked'], 12, '22:40'],
    ['mia_01', 'noobqueen', 'Sonntag = Cozy-Gaming ☁️', ['gaming', 'cozy']],
    ['mia_02', 'noobqueen', 'Fanart fertig ✨', ['fanart', 'zeichnen']],
    ['mia_03', 'noobqueen', 'Endlich da!!', ['gaming', 'nintendo']],
    ['mia_04', 'noobqueen', null, ['cozy']],
    ['mia_05', 'noobqueen', 'Regen = Zocken', ['kiel']],
    ['hugo_01', 'hugo.ranked', 'GOLD. Wer noch?? 😎', ['gaming', 'ranked'], 40, '23:10'],
    ['hugo_02', 'hugo.ranked', '1v5 clutch', ['gaming']],
    ['hugo_03', 'hugo.ranked', 'Gamer-Food', []],
    ['hugo_04', 'hugo.ranked', 'Lag. Eindeutig Lag.', ['gaming', 'ranked'], 13, '21:55'],
    ['levi_01', 'levi.kicks', 'Neue Treter 🔥', ['fussball']],
    ['levi_02', 'levi.kicks', 'Heimspiel heute!', ['fussball', 'kiel']],
    ['levi_03', 'levi.kicks', 'Tor in der 89. ⚽', ['fussball', 'tor']],
    ['levi_04', 'levi.kicks', 'Team 💪', ['fussball', 'team']],
    ['levi_05', 'levi.kicks', '6 Uhr Training. Wer ist so verrückt?', ['training']],
    ['levi_06', 'levi.kicks', 'Kreismeister!!!', ['fussball', 'kiel'], 9, '18:30'],
    ['fee_01', 'fitbyfee', 'Leg Day 🦵', ['fitness', 'gym']],
    ['fee_02', 'fitbyfee', 'Mein Frühstück – Rezept in den Kommentaren', ['rezept', 'fitness']],
    ['fee_03', 'fitbyfee', 'Bootcamp im Park ☀️', ['fitness', 'muenchen']],
    ['fee_04', 'fitbyfee', 'Progress', ['fitness']],
    ['fee_05', 'fitbyfee', null, ['fitness']],
    ['ralf_01', 'coach_ralf', 'Stolz auf die Jungs!', ['fussball', 'team', 'kiel']],
    ['ralf_02', 'coach_ralf', 'Plan für Samstag', ['fussball'], null, null, { noLike: true }],
    ['ralf_03', 'coach_ralf', 'Saisonabschluss 🌭', ['verein']],
    ['ralf_04', 'coach_ralf', 'Ausflug mit der Mannschaft ins Museum', ['ausflug']],
    ['finn_01', 'finn.kielwasser', 'Regatta Tag 2 – Platz 4!', ['segeln', 'boot', 'kiel']],
    ['finn_02', 'finn.kielwasser', 'Kieler Woche 🌊', ['segeln', 'kiel']],
    ['finn_03', 'finn.kielwasser', 'Feierabend', ['boot', 'hafen', 'sonnenuntergang']],
    ['finn_04', 'finn.kielwasser', null, ['segeln']],
    ['finn_05', 'finn.kielwasser', 'Erst der Mast, dann das Schiff 😉', ['segeln', 'boot']],
    ['finn_06', 'finn.kielwasser', 'Palstek im Schlaf', ['segeln']],
    ['alina_01', 'alina.daily', 'Herbst-OOTD 🍂', ['ootd', 'fashion', 'herbst']],
    ['alina_02', 'alina.daily', 'Montag 😮‍💨', ['kaffee']],
    ['alina_03', 'alina.daily', 'Hamburg kann\'s', ['sonnenuntergang', 'hamburg']],
    ['alina_04', 'alina.daily', 'Haul kommt morgen!', ['fashion', 'shopping']],
    ['alina_05', 'alina.daily', 'Mutig? 😄', ['ootd', 'fashion'], 20, '17:05'],
    ['alina_06', 'alina.daily', 'Kurz raus ☀️', ['reisen', 'abenteuerlust']],
    ['alina_07', 'alina.daily', null, []],
    ['jona_01', 'jona.sneaks', 'Neue Paare 👟', ['sneaker']],
    ['jona_02', 'jona.sneaks', 'Alles unter 20 € 🙌', ['thrift', 'fashion']],
    ['jona_03', 'jona.sneaks', 'Köln Ehrenfeld', ['fashion', 'koeln']],
    ['jona_04', 'jona.sneaks', 'Sammlung wächst', ['sneaker']],
    ['giulia_01', 'giulia.glow', 'Neue Lieblingsfarben 💜', ['makeup']],
    ['giulia_02', 'giulia.glow', null, ['makeup', 'nails']],
    ['giulia_03', 'giulia.glow', '🎁 GEWINNSPIEL: markiere 2 Freunde! Gewinner am Sonntag', ['makeup', 'gewinnspiel'], 25, '12:00'],
    ['giulia_04', 'giulia.glow', 'Clean brushes = happy skin', ['makeup']],
    ['lena_01', 'lostwithlena', 'Drei Tage kein Netz. Bestes Gefühl.', ['reisen', 'abenteuerlust', 'norwegen']],
    ['lena_02', 'lostwithlena', 'Sternenhotel ✨', ['abenteuerlust', 'camping']],
    ['lena_03', 'lostwithlena', 'Hat sich gelohnt', ['abenteuer']],
    ['lena_04', 'lostwithlena', null, ['reisen', 'berge']],
    ['lena_05', 'lostwithlena', 'Keine Ahnung, was ich gegessen hab 😂', ['reisen', 'food']],
    ['lena_06', 'lostwithlena', 'Nächster Stopp?', ['reisen', 'abenteuer_lust']],
    ['tomasz_01', 'vanlife_tomasz', 'Zuhause ist, wo ich parke', ['vanlife', 'norwegen']],
    ['tomasz_02', 'vanlife_tomasz', 'Portugal Morgen ☕', ['vanlife', 'portugal']],
    ['tomasz_03', 'vanlife_tomasz', '5000 km', ['vanlife', 'reisen']],
    ['tomasz_04', 'vanlife_tomasz', 'Ab auf die Fähre', ['reisen']],
    ['tomasz_05', 'vanlife_tomasz', 'Remote work 💻', ['vanlife']],
    ['alex_01', 'alex.achen', 'Zuhause 🏛️', ['aachen', 'citytrip']],
    ['alex_02', 'alex.achen', 'Barcelona, ich komme!', ['reisen', 'citytrip']],
    ['alex_03', 'alex.achen', 'Wow.', ['citytrip', 'barcelona']],
    ['alex_04', 'alex.achen', 'Klischee, aber muss sein', ['citytrip', 'paris']],
    ['alex_05', 'alex.achen', null, ['food', 'paris']],
    ['mila_01', 'inkandmila', 'Inktober Tag 1', ['zeichnen', 'kunst']],
    ['mila_02', 'inkandmila', 'Neues Spielzeug 🎨', ['kunst']],
    ['mila_03', 'inkandmila', 'Wie findet ihr ihn?', ['zeichnen', 'fanart']],
    ['mila_04', 'inkandmila', null, ['kunst']],
    ['mila_05', 'inkandmila', 'Ein Jahr Zeichnen', ['zeichnen', 'kunst']],
    ['linus_seascape', 'linus.lens', '90 Sekunden Belichtung', ['seascape', 'fotografie', 'langzeitbelichtung']],
    ['linus_02', 'linus.lens', 'Blaue Stunde ✨', ['fotografie', 'rostock']],
    ['linus_03', 'linus.lens', 'Mein Werkzeug', ['fotografie']],
    ['linus_04', 'linus.lens', '1/4000 s', ['fotografie', 'tiere']],
    ['linus_05', 'linus.lens', 'Das hier in Deutschland?!', ['fotografie', 'polarlicht']],
    ['linus_06', 'linus.lens', null, ['fotografie']],
    ['amara_01', 'beatsbyamara', 'Neuer Beat kommt Freitag 🎧', ['musik', 'beats']],
    ['amara_02', 'beatsbyamara', 'Studio-Tag', ['musik']],
    ['amara_03', 'beatsbyamara', 'Danke Berlin!!', ['musik', 'konzert', 'berlin']],
    ['amara_04', 'beatsbyamara', null, ['musik']],
    ['brigitte_01', 'backmitbrigitte', 'Omas Rezept ❤️', ['backen', 'kuchen']],
    ['brigitte_02', 'backmitbrigitte', 'Waldmeister-Torte zum Geburtstag', ['backen']],
    ['brigitte_03', 'backmitbrigitte', 'Sonntag', ['backen']],
    ['brigitte_04', 'backmitbrigitte', 'Schon wieder Weihnachten bald 🎄', ['backen', 'weihnachten']],
    ['brigitte_05', 'backmitbrigitte', '60 Likes = Rezept!', ['backen', 'kuchen']],
    ['ole_01', 'ole.kocht.billig', '1,80 € pro Portion', ['food', 'studentenkueche']],
    ['ole_02', 'ole.kocht.billig', 'Wocheneinkauf 23 €', ['studentenkueche']],
    ['ole_03', 'ole.kocht.billig', 'Ich kann kochen. Glaube ich.', ['food']],
    ['ole_04', 'ole.kocht.billig', null, [], null, null, { noLike: true }],
    ['henriette_01', 'wuffi_und_ich', 'Bruno liebt die Ostsee 🐶', ['hund', 'bruno', 'kiel']],
    ['henriette_02', 'wuffi_und_ich', 'Er hat was gesehen 👀', ['hund', 'bruno']],
    ['henriette_03', 'wuffi_und_ich', '3 Jahre!', ['hund', 'geburtstag']],
    ['henriette_04', 'wuffi_und_ich', 'Feierabend zu zweit', ['hund']],
    ['henriette_05', 'wuffi_und_ich', null, ['hund', 'strand']],
    ['sofia_01', 'katzenkram', 'Wenn der Karton besser ist als das Geschenk', ['katze', 'haustier']],
    ['sofia_02', 'katzenkram', 'Pausbacke 🐹', ['hamster', 'haustier']],
    ['sofia_03', 'katzenkram', 'Rocky hat sich gehäutet 🦎', ['echse', 'haustier']],
    ['sofia_04', 'katzenkram', 'Spannung 😂', ['katze', 'hamster']],
    ['marco_01', 'wachtauf_marco', 'Die Wasserwaage lügt nicht 🌊 #wachtauf', ['flacheerde', 'wachtauf'], 30, '19:45'],
    ['marco_02', 'wachtauf_marco', 'Seht ihr eine Krümmung? Ich nicht.', ['flacheerde', 'wahrheit']],
    ['marco_03', 'wachtauf_marco', 'Das hier ist Propaganda 🙃', ['flacheerde']],
    ['marco_04', 'wachtauf_marco', 'Warum fliegen die nicht übers Ende? 🤔', ['wahrheit']],
    ['marco_05', 'wachtauf_marco', 'Verteile heute in Dresden. Wer hilft?', ['wachtauf', 'dresden']],
    ['marco_06', 'wachtauf_marco', 'So ist unsere Welt WIRKLICH aufgebaut. Das zeigt euch keine Schule. Teilen!! 🌍🧱', ['flacheerde', 'wahrheit', 'wachtauf'], 18, '21:15'],
    ['frieda_01', 'frag_frieda', 'Warum sieht man erst den Mast? 🧵', ['physik', 'wissenschaft'], 28, '16:20'],
    ['frieda_02', 'frag_frieda', 'Der Erdschatten ist rund. Immer.', ['wissenschaft', 'mond']],
    ['frieda_03', 'frag_frieda', 'Tag & Nacht in 30 Sekunden erklärt', ['physik']],
    ['frieda_04', 'frag_frieda', 'Unser Ballon aus 30 km Höhe 🎈🌍', ['wissenschaft', 'erde']],
    // Normalos
    ['lasse_01', 'lasse.ld', 'Bester in Kreuzberg', ['food', 'berlin']],
    ['lasse_02', 'lasse.ld', 'Abschlussfahrt-Hoodies sind da', ['schule', 'freunde'], 15, '16:10'],
    ['erna_01', 'erna.lueders', 'Für meinen Lasse', ['backen'], 14, '10:30'],
    ['lars_01', 'lars_p', 'Derby 🔥', ['fussball', 'hamburg']],
    ['larsole_01', 'larsole', null, ['gaming'], null, null, { noLike: true }],
    ['leviberlin_01', 'levi.berlin', 'Urlaub 🌴', ['urlaub', 'reisen']],
    ['leviberlin_02', 'levi.berlin', 'Pendeln mal anders', ['berlin']],
    ['levinwk_01', 'levi_nwk', 'Kicken nach der Schule', ['fussball', 'kiel']],
    ['felixb_01', 'felix.b', 'Neue Konsole!!', ['gaming']],
    ['felixude_01', 'felix_ude', '10 km ✔️', ['fitness', 'laufen']],
    ['felixude_02', 'felix_ude', null, ['sonnenuntergang']],
    ['lisa_01', 'lisa.mei', 'Beste Freundinnen 💕', ['freunde']],
    ['lisamarie_01', 'lisamarie.k', 'Wochenende Wien', ['reisen', 'citytrip']],
    ['lisamarie_02', 'lisamarie.k', 'Harz 🥾', ['abenteuerlust']],
    ['elisa_01', 'elisa_b', 'Kunst-LK Projekt', ['kunst']],
    ['annalisa_01', 'annalisa.f', 'Wie bei Nonna 🍝', ['food']],
    ['laura_01', 'laura.mauer', 'Hamburg 🐟', ['food', 'hamburg']],
    ['marlo_01', 'marlo.eb', 'Film ist zurück 📷', ['fotografie', 'reisen']],
    ['jakob_01', 'jakob.hu', null, ['fussball'], null, null, { noLike: true }],
    ['yusuf_01', 'yusuf.dmr', 'Heute mit Papa ⚽', ['fussball']],
    ['yusuf_02', 'yusuf.dmr', 'FIFA-Abend', ['gaming']],
    ['ana_01', 'ana.kovac', 'Morgenroutine', ['fitness']],
    ['ana_02', 'ana.kovac', 'Neu 🤍', ['fashion']],
    ['tim_01', 'tim.richter', 'Noch eine Runde', ['gaming'], 6, '02:14'],
    ['ida_01', 'ida.hsn', 'Das ist Keks 🐹', ['haustier']],
    ['lotta_01', 'lotta.b', 'Für Oma', ['zeichnen']],
    ['noah_01', 'noah.sz', 'Morgen ist es so weit 🎉', ['geburtstag'], 0, '08:12'],
    ['emma_01', 'emma.kr', '18!!! Danke für alles ❤️', ['geburtstag'], 1, '20:03'],
    ['jannik_01', 'jannik.wolf', 'Meine Stadt ⚓', ['hamburg']],
    ['werner_01', 'werner.angelt', 'Mein Schmuckstück', ['boot', 'angeln']],
    ['werner_02', 'werner.angelt', 'Dorsch des Tages 🎣', ['angeln']],
    ['sophie_01', 'sophie.db', 'Petite France 💛', ['reisen']],
    ['sophie_02', 'sophie.db', null, ['zeichnen']],
    ['mikkel_01', 'mikkel.s', 'Hygge på vandet ⛵', ['segeln', 'boot']],
    ['leila_01', 'leila.hd', 'Ersten Song geschrieben 🎸', ['musik']],
    ['nikos_01', 'nikos.pap', 'Wie in Thessaloniki', ['food']],
    ['nikos_02', 'nikos.pap', 'Wien 🎡', ['reisen', 'wien']],
    ['aylin_01', 'aylin.ylmz', 'ICH WAR DA 😭', ['musik', 'konzert']],
    ['matteo_01', 'matteo.bi', 'Gym mit Aussicht', ['fitness']],
    ['priya_01', 'priya.sh', 'Jupiter gesehen!!', ['wissenschaft']],
    ['ben_01', 'ben.fischer', null, [], null, null, { noLike: true }]
  ];

  /* Zu welchem Thema (Interesse) zählt ein Tag? Grundlage für Likes, Views, Werbung. */
  const TOPIC = {
    gaming: ['gaming', 'setup', 'stream', 'turnier', 'retro', 'ranked', 'cozy', 'nintendo'],
    fussball: ['fussball', 'tor', 'team', 'training', 'verein'],
    fitness: ['fitness', 'gym', 'rezept', 'laufen'],
    lifestyle: ['ootd', 'fashion', 'herbst', 'kaffee', 'shopping', 'sneaker', 'thrift', 'makeup', 'nails', 'gewinnspiel', 'freunde'],
    reisen: ['reisen', 'abenteuerlust', 'abenteuer', 'abenteuer_lust', 'norwegen', 'camping', 'berge', 'vanlife', 'portugal', 'citytrip', 'barcelona', 'paris', 'urlaub', 'wien', 'aachen'],
    kreativ: ['zeichnen', 'kunst', 'fanart', 'fotografie', 'seascape', 'langzeitbelichtung', 'polarlicht'],
    musik: ['musik', 'beats', 'konzert'],
    food: ['food', 'backen', 'kuchen', 'weihnachten', 'studentenkueche'],
    tiere: ['hund', 'bruno', 'katze', 'hamster', 'echse', 'haustier'],
    segeln: ['segeln', 'boot', 'hafen', 'angeln'],
    flacheerde: ['flacheerde', 'wachtauf', 'wahrheit'],
    wissenschaft: ['physik', 'wissenschaft', 'mond', 'erde']
  };

  /* Handgeschriebene Diskussionen: Foto → [[wer, Text, Minuten nach dem Post], …]
     Antworten beginnen mit @username (wie bei Instagram), Reihenfolge = Zeit. */
  const THREADS = {
    // Die zwei Verschwörer streiten sich
    marco_01: [
      ['wachtauf_marco', 'Seht ihr? Horizont gerade. Wasserwaage gerade. Erde flach. Punkt.', 2],
      ['marco_hat_recht', 'Marco hat recht!! 👏👏', 9],
      ['mondrueckseite', 'Flache Erde ist doch nur Ablenkung 🙄 Die Echsenmenschen von der Mondrückseite WOLLEN, dass wir uns über die Form streiten.', 25],
      ['wachtauf_marco', '@mondrueckseite Mond? Der Mond ist ein Scheinwerfer. Der hat gar keine Rückseite.', 31],
      ['mondrueckseite', '@wachtauf_marco Genau das sollst du glauben. Klassischer Echsen-Trick.', 40],
      ['echsenwache', '@marco_hat_recht Uwe, wer bezahlt dich eigentlich? 🦎', 52],
      ['frag_frieda', 'Ihr widersprecht euch gerade gegenseitig 😅 Wenn der Mond eine Rückseite hat, ist er eine Kugel – wie die Erde.', 70],
      ['priya.sh', '@frag_frieda 😂 Mic drop.', 74],
      ['wachtauf_marco', '@frag_frieda Studierte Leute glauben alles, was im Buch steht.', 95],
      ['patte_witzig', 'Ich hol Popcorn 🍿', 101],
      ['werner.angelt', 'Ich bin 40 Jahre zur See gefahren. Man sieht zuerst den Mast.', 180],
      ['mondrueckseite', '@werner.angelt Zur See oder hinter die Mondrückseite? 🤔', 200],
      ['lisamarie.k', 'Wasserwaagen messen, ob etwas waagerecht ist – nicht, ob die Erde krumm ist. Auf 30 cm sieht man keine Krümmung.', 260],
      ['marco_hat_recht', '@lisamarie.k Lehrerin halt 🙄', 275]
    ],
    marco_02: [
      ['patte_witzig', 'Ich seh auch keine Krümmung. Ich seh Kühe 🐄', 15],
      ['frag_frieda', 'Auf 5 km fällt die Erde nur um ca. 2 Meter ab – das sieht man auf einem Feld nicht. Am Meer mit Fernglas schon!', 50],
      ['wachtauf_marco', '@frag_frieda Hast du das selbst gemessen? Na also.', 61],
      ['frag_frieda', '@wachtauf_marco Ja, letzten Sommer an der Ostsee. Post kommt 😉', 66]
    ],
    marco_03: [
      ['echsenwache', 'Der Globus ist von Echsen designt. Sieht man an der grünen Farbe.', 20],
      ['wachtauf_marco', '@echsenwache Du bist echt nicht ganz dicht.', 33],
      ['priya.sh', 'Ein Verschwörer nennt den anderen verrückt. Ich liebe dieses Netzwerk 😂', 40]
    ],
    // Grafik des Flache-Erde-Modells: Fragen statt Spott
    marco_06: [
      ['marco_hat_recht', 'Endlich zeigt es mal jemand richtig! Geteilt 👍', 6],
      ['frag_frieda', 'Ehrliche Frage zum Modell: Wenn die Sonne über der Scheibe kreist und nie untergeht – warum ist es dann in Australien Nacht, während bei uns Tag ist? Wir müssten sie doch alle gleichzeitig sehen 🤔', 40],
      ['priya.sh', 'Und wie fliegt man von Australien nach Südamerika? Auf dieser Karte wäre das einmal quer über die ganze Scheibe, in echt sind es 13 Stunden 😅', 55],
      ['wachtauf_marco', '@priya.sh Die echten Flugrouten werden geheim gehalten.', 70],
      ['mondrueckseite', 'Die Kuppel haben die Echsen gebaut, das sieht man doch an der Form 🦎', 85],
      ['wachtauf_marco', '@mondrueckseite Bitte nicht schon wieder.', 90],
      ['patte_witzig', 'Wer putzt eigentlich die Kuppel? 🧽', 120],
      ['lisamarie.k', 'Spannend, wie überzeugend so eine Grafik aussieht. Nehme ich mit in den Unterricht – als Beispiel, wie man Quellen prüft.', 240]
    ],
    marco_05: [
      ['marco_hat_recht', 'Bin dabei! Wo treffen wir uns?', 30],
      ['nina.netz', 'Bitte nicht in der Schule verteilen 🙏', 90]
    ],
    frieda_01: [
      ['frag_frieda', 'Kurz erklärt: Die Erde ist gekrümmt, deshalb verschwindet zuerst der Rumpf hinter dem Horizont. Mit dem Tele sieht man nur noch die Aufbauten. 🧵', 1],
      ['finn.kielwasser', 'Kann ich bestätigen. Auf See siehst du erst den Mast. Jedes Mal.', 30],
      ['mondrueckseite', 'Typisch Echsen-Propaganda. Die Mondrückseite zeigt uns keiner, warum wohl?', 45],
      ['priya.sh', '@mondrueckseite Die Rückseite wurde schon 1959 fotografiert 🙂', 52],
      ['mondrueckseite', '@priya.sh Von wem? Na? Echsen.', 60],
      ['wachtauf_marco', 'Optische Täuschung durch Luftspiegelung.', 120],
      ['frag_frieda', '@wachtauf_marco Luftspiegelung gibt es, ja – aber dann würde es bei jedem Wetter anders aussehen. Tut es nicht 🙂', 140],
      ['lisamarie.k', 'Den Post zeige ich meiner Klasse!', 300]
    ],
    frieda_02: [
      ['echsenwache', 'Und wer wirft den Schatten? 🦎', 25],
      ['frag_frieda', '@echsenwache Die Erde. Die Sonne steht hinter ihr. Kein Echsenmensch nötig 😄', 40]
    ],
    // Echsen-Trolle überall
    ralf_01: [
      ['sandra.schu', 'Stolze Mama 😍', 30],
      ['mondrueckseite', 'Schaut euch die Augen vom Trainer an 👀 eindeutig ein Echsenmensch von der Rückseite des Mondes 🦎🌑', 90],
      ['coach_ralf', '@mondrueckseite Ich schau nur so, wenn wir 0:3 hinten liegen.', 120],
      ['levi.kicks', '@coach_ralf 😂😂', 125]
    ],
    henriette_02: [
      ['echsenwache', 'Hunde spüren das. Bruno bellt, weil da ein Echsenmensch vorbeiläuft 🦎', 40],
      ['wuffi_und_ich', '@echsenwache Da lief der Postbote vorbei 😅', 70],
      ['echsenwache', '@wuffi_und_ich Eben.', 75],
      ['nina.netz', 'Bruno ist der Beste, egal wer vorbeiläuft 🐶💛', 100]
    ],
    alina_03: [
      ['echsenwache', 'Die Sonne ist ein Signal an die Echsen. Wacht auf.', 50],
      ['alina.daily', '@echsenwache Okay? 😄', 80]
    ],
    brigitte_02: [
      ['mondrueckseite', 'Grüne Glasur 🤨 Ich sag nur: Echsen.', 60],
      ['backmitbrigitte', '@mondrueckseite Das ist Waldmeister, junger Mann.', 95],
      ['erna.lueders', 'Sieht köstlich aus. Rezept bitte!', 300]
    ],
    linus_05: [
      ['mondrueckseite', 'Polarlicht = Raumschiffe der Echsen beim Landeanflug. Sorry, ist so.', 30],
      ['linus.lens', '@mondrueckseite Es war ein Sonnensturm. Aber schöne Idee für ein Sci-Fi-Buch.', 65]
    ],
    // Die harmlose Echse (Falle beim pauschalen Löschen)
    sofia_03: [
      ['ida.hsn', 'Süße Echse!!', 12],
      ['lotta.b', 'Darf ich die mal streicheln?? 🦎', 40],
      ['katzenkram', '@lotta.b Rocky mag das eigentlich nicht so 😅', 55],
      ['echsenwache', 'Echsen erkennen Echsen 👀', 90],
      ['nina.netz', '@echsenwache Lass doch die Kinder in Ruhe.', 100]
    ],
    // Gaming-Streit
    hugo_01: [
      ['pixelpaul', 'Glückwunsch! Gold ist ein guter Anfang 😉', 30],
      ['hugo.ranked', '@pixelpaul Anfang?? Was bist du denn?', 34],
      ['pixelpaul', '@hugo.ranked Diamant. Aber alles gut, jeder fängt mal an.', 50],
      ['aaron183', 'Paul macht dich fertig 😂', 55],
      ['hugo.ranked', '@pixelpaul 1v1 am Samstag. Wenn du dich traust.', 70]
    ],
    hugo_04: [
      ['aaron183', 'Silber 💀 hahaha', 10],
      ['patte_witzig', 'Gold-Hugo ist jetzt Silber-Hugo. Nächste Woche Bronze-Hugo? 🥉', 20],
      ['hugo.ranked', '@patte_witzig Halt die Klappe 😤', 25],
      ['noobqueen', 'Lass dich nicht ärgern, Ranked ist halt Glück', 90]
    ],
    paul_06: [
      ['hugo.ranked', 'Nächstes Mal gewinne ich. Aber war fair 🤝', 15],
      ['pixelpaul', '@hugo.ranked Respekt! Komm doch mal in den Stream.', 22],
      ['larsole', 'Endlich vertragen 😂', 40]
    ],
    // Outfit: mehrere gegen eine
    alina_05: [
      ['aaron183', 'cringe 😬', 5],
      ['realtalk_dennis', 'Die Hose ist ein Verbrechen. Sorry, muss mal gesagt werden.', 12],
      ['aaron183', '@realtalk_dennis haha richtig', 14],
      ['realtalk_dennis', 'Meine Oma hat die gleiche Tischdecke 😂', 20],
      ['nina.netz', 'Wie wäre es, einfach nichts zu schreiben, wenn es einem nicht gefällt?', 30],
      ['ana.kovac', 'Ich finde sie richtig cool!! Wo ist die her?', 35],
      ['emma.kr', 'Sieht mega aus ❤️', 40],
      ['realtalk_dennis', '@nina.netz Ist ein freies Land.', 45],
      ['alina.daily', 'Danke euch 🤍 Und @realtalk_dennis: Grüß deine Oma, sie hat Geschmack 😄', 60],
      ['aylin.ylmz', '@alina.daily Beste Antwort 😂', 64]
    ],
    jona_03: [
      ['aaron183', 'Wer kauft sowas 😂', 20],
      ['jona.sneaks', '@aaron183 Ich. Für 8 €. 😎', 40]
    ],
    mila_03: [
      ['aaron183', 'Sieht aus wie aus dem Kindergarten', 30],
      ['elisa_b', 'Die Schuppen sind so gut gemacht!', 45],
      ['inkandmila', '@elisa_b Danke 🥹 3 Stunden!', 60]
    ],
    // Oma Erna
    lasse_01: [
      ['erna.lueders', 'Schön, mein Junge ❤️ Iss auch mal Gemüse. Oma', 120],
      ['larsole', 'haha Oma 😂', 130],
      ['felix.b', 'OMA ist auf YourSozialNet 😂😂', 135],
      ['lasse.ld', 'Danke Oma 🙈', 200]
    ],
    lasse_02: [
      ['erna.lueders', 'Der Pulli steht dir gut. Ist der warm genug?', 90],
      ['lasse.ld', '@erna.lueders Ja Oma 🙈', 140]
    ],
    erna_01: [
      ['lasse.ld', 'Danke Oma ❤️ war der beste', 60],
      ['backmitbrigitte', 'Sieht wunderbar aus! Mit Zimt?', 120],
      ['erna.lueders', '@backmitbrigitte Natürlich mit Zimt!', 400]
    ],
    // Levi
    levi_06: [
      ['sandra.schu', 'Stolz auf dich ❤️', 20],
      ['coach_ralf', 'Verdient, Jungs!', 25],
      ['levi_fan_09', '🔥🔥🔥', 26],
      ['levi_fan_09', 'Bester Spieler 🔥', 27],
      ['levi_nwk', 'Wir sind Kreismeister!! 🏆', 40]
    ],
    // Geburtstage
    noah_01: [
      ['tim.richter', 'Endlich Führerschein 😂', 40],
      ['noah.sz', '@tim.richter Erstmal Prüfung 😅', 60]
    ],
    emma_01: [
      ['ana.kovac', 'Alles Gute!! 🎉', 30],
      ['aylin.ylmz', 'Happy Birthday ❤️', 45]
    ],
    // Nachtaktiv
    tim_01: [
      ['ida.hsn', 'Geh schlafen 😂', 20],
      ['tim.richter', '@ida.hsn Du doch auch nicht', 24]
    ]
  };

  /* Füll-Kommentare je Thema: der Generator nimmt Leute, die geliked haben */
  const FILL = {
    gaming: ['GG 🎮', 'Welches Spiel?', 'Krass 🔥', 'Hab ich auch!', 'Wann streamst du?', 'Sauber!'],
    fussball: ['Stark ⚽', 'Weiter so!', 'Welcher Verein?', '💪💪', 'Geiles Tor!'],
    fitness: ['Motivation 💪', 'Rezept bitte!', 'Wie oft trainierst du?', 'Respekt!'],
    lifestyle: ['So schön 😍', 'Wo ist das her?', 'Love it 🤍', 'Steht dir!', 'Mega!'],
    reisen: ['Wo ist das?', 'Will auch hin 😍', 'Traumhaft', 'Fernweh!!', 'Wie lange warst du da?'],
    kreativ: ['Wow, Talent!', 'Wie lange hast du gebraucht?', 'So schön 😍', 'Welche Kamera?', 'Hammer'],
    musik: ['🔥🔥', 'Läuft auf Dauerschleife', 'Wann kommt der Song?', 'Gänsehaut'],
    food: ['Lecker 😋', 'Rezept bitte!', 'Hunger 😩', 'Sieht köstlich aus'],
    tiere: ['Süüüß 😍', 'Wie heißt er?', 'Zuckersüß', '❤️❤️'],
    segeln: ['Schönes Boot!', 'Ahoi ⛵', 'Wo liegt sie?', 'Traumwetter'],
    flacheerde: ['Wacht auf! 👁️', 'Genau so!', '🤔'],
    wissenschaft: ['Super erklärt!', 'Endlich versteh ich das', 'Mehr davon!'],
    alle: ['😍', '🔥', 'Nice!', 'Cool', '👍', 'Schön!']
  };

  const SPAM = 'Gratis Follower 💰👉 Link in Bio';

  /* Werbung (Migration 0276): Kampagnen der Plattform (user_id NULL).
     Die Abfragen nutzen nur Tags, Likes, Geschlecht, Geräte, Uhrzeiten und
     Verweildauer – (bis auf Glow Skin) keine Dummy-Namen –, damit sie auch im Klassen-Netz
     (ohne Dummy-User) funktionieren. Bild: dummy/img/wb_<schlüssel>.webp.
     Drei Arten (0278):
       feed  = Feed-Werbung (Karte im Feed), nur „Wem?“ – 4 Beispiele
       label = Foto-Label (am Foto), „Wem?“ + content_sql = an welchen Fotos – 2 Beispiele
       boost = Beworbener Post, „Wem?“ + content_sql = „Was?“ (Foto-ids) – 3 Beispiele
     Ausnahme: Glow Skin hängt an den Fotos von @giulia.glow (Dummy-Creatorin) –
     im Klassen-Netz ohne Dummy-User trifft das Label deshalb kein Foto.
     [schlüssel, name, kind, title, body, button, target_sql, content_sql, Tage davor] */
  const ADS = [
    // ── Feed-Werbung (4): Karte im Feed, nur „Wem?“
    ['volta', 'VOLTA Energy', 'feed', 'Noch eine Runde?', 'VOLTA – der Energydrink für lange Nächte am Controller. Jetzt mit Geschmack Blue Rush.', 'Jetzt probieren',
      "SELECT l.user_id\nFROM likes l\nJOIN photo_tag pt ON pt.photo_id = l.photo_id\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN ('gaming', 'setup', 'stream', 'ranked', 'nintendo', 'retro')\nGROUP BY l.user_id\nHAVING COUNT(*) >= 3", null, 12],
    ['snacks', 'Nachtschicht Snacks', 'feed', 'Hunger um 2 Uhr?', 'Chips, Pizza, Cola – in 20 Minuten an deiner Tür. Auch mitten in der Nacht.', 'Bestellen',
      "SELECT COUNT(*) > 0\nFROM sessions\nWHERE user_id = $user\n  AND HOUR(started_at) BETWEEN 0 AND 4", null, 9],
    ['speedphone', 'SpeedPhone X', 'feed', 'Zeit für ein Upgrade', 'Dein Handy ist zu langsam? Das SpeedPhone X lädt in 15 Minuten auf 80 %.', 'Angebot ansehen',
      "SELECT COUNT(*) > 0\nFROM sessions\nWHERE user_id = $user\n  AND os LIKE 'Android%'", null, 5],
    ['plus', 'Plus-Abo', 'feed', 'Ohne Werbung scrollen?', 'Mit dem Plus-Abo siehst du keine Anzeigen mehr – für nur 4,99 € im Monat.', 'Plus holen',
      null, null, 2],
    // ── Beworbene Posts (3): „Wem?“ + „Was?“ (Fotos aus dem Netzwerk, kein eigenes Bild)
    ['sternwarte', 'Sternwarte Pro', 'boost', null, null, null,
      "SELECT l.user_id\nFROM likes l\nJOIN photo_tag pt ON pt.photo_id = l.photo_id\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN ('wissenschaft', 'physik', 'mond')\nGROUP BY l.user_id\nHAVING COUNT(*) >= 2",
      "SELECT pt.photo_id\nFROM photo_tag pt\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN ('wissenschaft', 'physik', 'mond')", 8],
    ['fernweh', 'Fernweh Reisen', 'boost', null, null, null,
      "SELECT v.user_id\nFROM views v\nJOIN photo_tag pt ON pt.photo_id = v.photo_id\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN ('reisen', 'urlaub', 'camping', 'berge', 'citytrip')\nGROUP BY v.user_id\nHAVING AVG(v.duration_ms) > 4000",
      "SELECT pt.photo_id\nFROM photo_tag pt\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN ('reisen', 'urlaub', 'citytrip')", 7],
    ['wahrheit', 'Wahrheit.tv', 'boost', null, null, null,
      "SELECT DISTINCT l.user_id\nFROM likes l\nJOIN photo_tag pt ON pt.photo_id = l.photo_id\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN ('flacheerde', 'wachtauf', 'wahrheit')",
      "SELECT pt.photo_id\nFROM photo_tag pt\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN ('flacheerde', 'wachtauf')", 4],
    // ── Foto-Labels (2): „Wem?“ + „An welchen Fotos?“
    // Glow Skin: Influencer-Werbung – an den Fotos der Creatorin @giulia.glow, nur für Userinnen
    ['glow', 'Glow Skin', 'label', 'Dein Glow-up beginnt heute', 'Die Pflege, die Giulia benutzt – nur diese Woche 30 % günstiger.', 'Zum Shop',
      "SELECT\n  CASE gender\n    WHEN 'female' THEN true\n    ELSE false\n  END\nFROM users\nWHERE id = $user",
      "SELECT p.id\nFROM photos p\nJOIN users u ON u.id = p.user_id\nWHERE u.username = 'giulia.glow'", 6],
    // Pfotenglück: keine Zielgruppe, aber nur an Tier-Fotos → Kontext-Werbung
    ['pfoten', 'Pfotenglück', 'label', 'Für deinen Liebling', 'Futter, Spielzeug, Leckerlis – Pfotenglück liefert alles für Hund, Katze und Hamster.', 'Mehr erfahren',
      null, "SELECT pt.photo_id\nFROM photo_tag pt\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN ('hund', 'katze', 'hamster', 'haustier')", 3]
  ];

  root.SHDummyDaten = { USERS, PHOTOS, TOPIC, THREADS, FILL, SPAM, ADS };
})(typeof self !== 'undefined' ? self : globalThis);
