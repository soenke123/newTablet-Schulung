// Erzeugt die System-Datenbanken für SQL Studio (deterministisch, gleicher Zufall bei jedem Lauf).
// Aufruf:  node MPSkills/tools/SQLStudio/data/erzeugen.cjs MPSkills/tools/SQLStudio/data
const fs = require('fs');
const out = process.argv[2];
let seed = 20261023;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const lit = v => v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const ins = (t, cols, rows) => `INSERT INTO ${t} (${cols.join(', ')}) VALUES\n` + rows.map(r => '  (' + r.map(lit).join(', ') + ')').join(',\n') + ';\n';
const pad = n => String(n).padStart(2, '0');
const date = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const VW = ['Mia','Emma','Hannah','Sofia','Lina','Mila','Ella','Lea','Clara','Marie','Leni','Emilia','Ida','Lia','Frieda','Anna','Lara','Paula','Zoe','Amira','Elif','Nele','Greta','Luisa','Maja','Noah','Leon','Paul','Elias','Finn','Felix','Ben','Jonas','Emil','Luis','Henry','Theo','Anton','Jakob','Liam','Moritz','Malte','Ole','Can','Yusuf','Mats','Tom','Jan','Luca','Milan'];
const NN = ['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann','Koch','Richter','Klein','Wolf','Schröder','Neumann','Schwarz','Braun','Hofmann','Zimmermann','Hansen','Petersen','Jensen','Lange','Krüger','Peters','Möller','Yilmaz','Kaya','Nowak','Kowalski','Ivanov','Rossi','Lorenz','Vogel','Jung','Hahn','Brandt','Thomsen','Carstens'];
const ORTE = ['Kiel','Flensburg','Rendsburg','Eckernförde','Neumünster','Schleswig','Plön','Preetz','Heide','Husum'];

// ── Haustiere ─────────────────────────────────────────────
function haustiere() {
  let s = `-- Haustiere — die Einstiegs-Datenbank von SQL Studio
-- Zwei Tabellen: wer hat welches Tier? Gut für die ersten SELECTs,
-- für WHERE, ORDER BY und den ersten JOIN.

CREATE TABLE besitzer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vorname VARCHAR(40) NOT NULL,
  nachname VARCHAR(40) NOT NULL,
  wohnort VARCHAR(40),
  telefon VARCHAR(20)
);

CREATE TABLE tier (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  art ENUM('Hund','Katze','Kaninchen','Meerschweinchen','Wellensittich','Pferd','Hamster','Schildkröte') NOT NULL,
  rasse VARCHAR(40),
  geburtsjahr INT,
  gewicht_kg DECIMAL(5,2),
  besitzer_id INT,
  FOREIGN KEY (besitzer_id) REFERENCES besitzer(id)
);

`;
  const bes = [];
  for (let i = 1; i <= 14; i++) bes.push([i, pick(VW), pick(NN), pick(ORTE), '04' + int(31, 99) + ' ' + int(100000, 999999)]);
  s += ins('besitzer', ['id', 'vorname', 'nachname', 'wohnort', 'telefon'], bes) + '\n';
  const ARTEN = {
    Hund: [['Labrador', 25, 35], ['Dackel', 7, 11], ['Schäferhund', 28, 40], ['Mischling', 8, 30], ['Pudel', 5, 25], ['Beagle', 9, 14]],
    Katze: [['Europäisch Kurzhaar', 3.5, 6], ['Maine Coon', 5, 9], ['Perser', 3, 5.5], ['Siam', 2.5, 5]],
    Kaninchen: [['Zwergkaninchen', 1, 2.5], ['Widder', 2, 4]],
    Meerschweinchen: [['Glatthaar', 0.7, 1.2], ['Rosette', 0.7, 1.2]],
    Wellensittich: [[null, 0.03, 0.05]],
    Pferd: [['Haflinger', 450, 600], ['Holsteiner', 550, 700]],
    Hamster: [['Goldhamster', 0.1, 0.18]],
    'Schildkröte': [['Griechische Landschildkröte', 0.8, 2]]
  };
  const NAMEN = ['Bello','Luna','Balu','Mimi','Felix','Nala','Rocky','Coco','Sammy','Lucky','Kira','Momo','Paula','Krümel','Flocke','Max','Leo','Simba','Lilly','Bruno','Pünktchen','Tiger','Snoopy','Fanny','Hansi','Blitz','Speedy','Oskar','Wuschel','Jacky'];
  const tiere = [];
  const artList = ['Hund','Hund','Hund','Katze','Katze','Katze','Kaninchen','Meerschweinchen','Wellensittich','Pferd','Hamster','Schildkröte'];
  for (let i = 1; i <= 32; i++) {
    const art = pick(artList);
    const [rasse, a, b] = pick(ARTEN[art]);
    const g = Math.round((a + rnd() * (b - a)) * (b < 1 ? 1000 : 100)) / (b < 1 ? 1000 : 100);
    tiere.push([i, NAMEN[(i * 7) % NAMEN.length], art, rasse, int(2008, 2025), Number(g.toFixed(2)), i > 29 ? null : int(1, 14)]);
  }
  s += ins('tier', ['id', 'name', 'art', 'rasse', 'geburtsjahr', 'gewicht_kg', 'besitzer_id'], tiere);
  return s;
}

// ── Schule ────────────────────────────────────────────────
function schule() {
  let s = `-- Schule — Klassen, Schülerinnen und Schüler, Lehrkräfte, Fächer, Noten
-- Gut für JOINs über mehrere Tabellen, GROUP BY (Notenschnitt) und
-- eine n:m-Beziehung (unterricht: welche Lehrkraft unterrichtet
-- welches Fach in welcher Klasse).

CREATE TABLE lehrkraft (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kuerzel CHAR(3) NOT NULL UNIQUE,
  vorname VARCHAR(40) NOT NULL,
  nachname VARCHAR(40) NOT NULL
);

CREATE TABLE klasse (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bezeichnung VARCHAR(5) NOT NULL UNIQUE,
  stufe INT NOT NULL,
  raum VARCHAR(6),
  klassenlehrkraft_id INT,
  FOREIGN KEY (klassenlehrkraft_id) REFERENCES lehrkraft(id)
);

CREATE TABLE schueler (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vorname VARCHAR(40) NOT NULL,
  nachname VARCHAR(40) NOT NULL,
  geburtsdatum DATE,
  wohnort VARCHAR(40),
  klasse_id INT NOT NULL,
  FOREIGN KEY (klasse_id) REFERENCES klasse(id)
);

CREATE TABLE fach (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  kuerzel VARCHAR(4) NOT NULL UNIQUE
);

CREATE TABLE unterricht (
  klasse_id INT NOT NULL,
  fach_id INT NOT NULL,
  lehrkraft_id INT NOT NULL,
  wochenstunden INT NOT NULL DEFAULT 2,
  PRIMARY KEY (klasse_id, fach_id),
  FOREIGN KEY (klasse_id) REFERENCES klasse(id),
  FOREIGN KEY (fach_id) REFERENCES fach(id),
  FOREIGN KEY (lehrkraft_id) REFERENCES lehrkraft(id)
);

CREATE TABLE note (
  id INT AUTO_INCREMENT PRIMARY KEY,
  schueler_id INT NOT NULL,
  fach_id INT NOT NULL,
  note INT NOT NULL CHECK (note BETWEEN 1 AND 6),
  art ENUM('Klassenarbeit','Test','Mündlich','Referat') NOT NULL,
  datum DATE NOT NULL,
  FOREIGN KEY (schueler_id) REFERENCES schueler(id),
  FOREIGN KEY (fach_id) REFERENCES fach(id)
);

`;
  const lk = [];
  const used = new Set();
  for (let i = 1; i <= 14; i++) {
    let vn = pick(VW), nn = pick(NN), k;
    do { k = (nn.slice(0, 2) + vn[0]).toUpperCase().replace('Ü', 'U').replace('Ö', 'O').replace('Ä', 'A'); if (used.has(k)) { nn = pick(NN); } } while (used.has(k));
    used.add(k);
    lk.push([i, k, vn, nn]);
  }
  s += ins('lehrkraft', ['id', 'kuerzel', 'vorname', 'nachname'], lk) + '\n';
  const kl = [['5a', 5], ['5b', 5], ['7a', 7], ['7b', 7], ['9a', 9], ['10c', 10]].map((k, i) => [i + 1, k[0], k[1], (k[1] < 10 ? 'A' : 'B') + (100 + i * 3 + 1), i + 1]);
  s += ins('klasse', ['id', 'bezeichnung', 'stufe', 'raum', 'klassenlehrkraft_id'], kl) + '\n';
  const sch = [];
  let id = 1;
  for (const k of kl) {
    const n = int(18, 24);
    const yr = 2026 - k[2] - 5;
    for (let j = 0; j < n; j++) sch.push([id++, pick(VW), pick(NN), date(yr + (rnd() < 0.3 ? 0 : -1) + 0, int(1, 12), int(1, 28)), pick(ORTE), k[0]]);
  }
  s += ins('schueler', ['id', 'vorname', 'nachname', 'geburtsdatum', 'wohnort', 'klasse_id'], sch) + '\n';
  const F = [['Deutsch', 'D'], ['Mathematik', 'M'], ['Englisch', 'E'], ['Biologie', 'BI'], ['Geschichte', 'G'], ['Informatik', 'INF'], ['Sport', 'SP'], ['Kunst', 'KU']];
  s += ins('fach', ['id', 'name', 'kuerzel'], F.map((f, i) => [i + 1, f[0], f[1]])) + '\n';
  const un = [];
  for (const k of kl) for (let f = 1; f <= F.length; f++) {
    if (f === 6 && k[2] < 7) continue;
    un.push([k[0], f, ((k[0] * 3 + f * 5) % 14) + 1, f <= 3 ? 4 : f === 7 ? 3 : 2]);
  }
  s += ins('unterricht', ['klasse_id', 'fach_id', 'lehrkraft_id', 'wochenstunden'], un) + '\n';
  const no = [];
  let nid = 1;
  const arten = ['Klassenarbeit', 'Test', 'Mündlich', 'Referat'];
  for (const st of sch) {
    const talent = rnd();
    for (const f of [1, 2, 3, 4, 6]) {
      if (f === 6 && kl[st[5] - 1][2] < 7) continue;
      const cnt = int(1, 3);
      for (let c = 0; c < cnt; c++) {
        let n = Math.round(1 + talent * 3 + (rnd() - 0.5) * 2.4);
        n = Math.max(1, Math.min(6, n));
        no.push([nid++, st[0], f, n, pick(arten), date(2026, pick([8, 9, 10]), int(1, 28))]);
      }
    }
  }
  for (let i = 0; i < no.length; i += 200) s += ins('note', ['id', 'schueler_id', 'fach_id', 'note', 'art', 'datum'], no.slice(i, i + 200));
  return s;
}

// ── Bibliothek ────────────────────────────────────────────
function bibliothek() {
  let s = `-- Schulbibliothek — Bücher, Autorinnen und Autoren, Verlage, Ausleihen
-- Mit einer n:m-Beziehung (buch_autor) und Ausleihen, die noch
-- offen sind (zurueck_am IS NULL) — gut für LEFT JOIN und IS NULL.

CREATE TABLE verlag (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  ort VARCHAR(40)
);

CREATE TABLE autor (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vorname VARCHAR(40),
  nachname VARCHAR(40) NOT NULL,
  land VARCHAR(30)
);

CREATE TABLE buch (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titel VARCHAR(120) NOT NULL,
  erscheinungsjahr INT,
  genre VARCHAR(30),
  seiten INT,
  verlag_id INT,
  FOREIGN KEY (verlag_id) REFERENCES verlag(id)
);

CREATE TABLE buch_autor (
  buch_id INT NOT NULL,
  autor_id INT NOT NULL,
  PRIMARY KEY (buch_id, autor_id),
  FOREIGN KEY (buch_id) REFERENCES buch(id),
  FOREIGN KEY (autor_id) REFERENCES autor(id)
);

CREATE TABLE leser (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ausweis_nr VARCHAR(8) NOT NULL UNIQUE,
  vorname VARCHAR(40) NOT NULL,
  nachname VARCHAR(40) NOT NULL,
  klasse VARCHAR(5)
);

CREATE TABLE ausleihe (
  id INT AUTO_INCREMENT PRIMARY KEY,
  buch_id INT NOT NULL,
  leser_id INT NOT NULL,
  ausgeliehen_am DATE NOT NULL,
  rueckgabe_bis DATE NOT NULL,
  zurueck_am DATE,
  FOREIGN KEY (buch_id) REFERENCES buch(id),
  FOREIGN KEY (leser_id) REFERENCES leser(id)
);

`;
  const V = [['Carlsen', 'Hamburg'], ['dtv', 'München'], ['Oetinger', 'Hamburg'], ['Thienemann', 'Stuttgart'], ['Reclam', 'Ditzingen'], ['Ravensburger', 'Ravensburg'], ['Beltz & Gelberg', 'Weinheim']];
  s += ins('verlag', ['id', 'name', 'ort'], V.map((v, i) => [i + 1, v[0], v[1]])) + '\n';
  const A = [['Michael', 'Ende', 'Deutschland'], ['Cornelia', 'Funke', 'Deutschland'], ['Astrid', 'Lindgren', 'Schweden'], ['Erich', 'Kästner', 'Deutschland'], ['Otfried', 'Preußler', 'Deutschland'], ['J. K.', 'Rowling', 'Großbritannien'], ['Kirsten', 'Boie', 'Deutschland'], ['Andreas', 'Steinhöfel', 'Deutschland'], ['Wolfgang', 'Herrndorf', 'Deutschland'], ['Rick', 'Riordan', 'USA'], ['Suzanne', 'Collins', 'USA'], ['Jostein', 'Gaarder', 'Norwegen'], ['Paul', 'Maar', 'Deutschland'], ['Ursula', 'Poznanski', 'Österreich'], ['Marc-Uwe', 'Kling', 'Deutschland'], ['Anne', 'Frank', 'Niederlande'], ['Theodor', 'Storm', 'Deutschland'], ['Friedrich', 'Schiller', 'Deutschland'], ['Christopher', 'Paolini', 'USA'], ['Sabine', 'Ludwig', 'Deutschland']];
  s += ins('autor', ['id', 'vorname', 'nachname', 'land'], A.map((a, i) => [i + 1, a[0], a[1], a[2]])) + '\n';
  const B = [
    ['Momo', 1973, 'Fantasy', 304, 4, [1]], ['Die unendliche Geschichte', 1979, 'Fantasy', 480, 4, [1]], ['Jim Knopf und Lukas der Lokomotivführer', 1960, 'Kinderbuch', 272, 4, [1]],
    ['Tintenherz', 2003, 'Fantasy', 576, 3, [2]], ['Herr der Diebe', 2000, 'Abenteuer', 384, 3, [2]], ['Drachenreiter', 1997, 'Fantasy', 448, 3, [2]],
    ['Ronja Räubertochter', 1981, 'Abenteuer', 240, 3, [3]], ['Pippi Langstrumpf', 1945, 'Kinderbuch', 176, 3, [3]], ['Die Brüder Löwenherz', 1973, 'Fantasy', 256, 3, [3]],
    ['Emil und die Detektive', 1929, 'Krimi', 192, 2, [4]], ['Das fliegende Klassenzimmer', 1933, 'Kinderbuch', 176, 2, [4]],
    ['Krabat', 1971, 'Fantasy', 320, 4, [5]], ['Der Räuber Hotzenplotz', 1962, 'Kinderbuch', 128, 4, [5]],
    ['Harry Potter und der Stein der Weisen', 1997, 'Fantasy', 336, 1, [6]], ['Harry Potter und die Kammer des Schreckens', 1998, 'Fantasy', 352, 1, [6]],
    ['Wir Kinder aus dem Möwenweg', 2000, 'Kinderbuch', 160, 3, [7]], ['Rico, Oskar und die Tieferschatten', 2008, 'Krimi', 224, 1, [8]],
    ['Tschick', 2010, 'Jugendroman', 256, 6, [9]], ['Percy Jackson – Diebe im Olymp', 2005, 'Fantasy', 448, 1, [10]],
    ['Die Tribute von Panem', 2008, 'Science-Fiction', 416, 3, [11]], ['Sofies Welt', 1991, 'Jugendroman', 624, 2, [12]],
    ['Eine Woche voller Samstage', 1973, 'Kinderbuch', 160, 3, [13]], ['Erebos', 2010, 'Thriller', 496, 6, [14]], ['Die Känguru-Chroniken', 2009, 'Humor', 272, 2, [15]],
    ['Das Tagebuch der Anne Frank', 1947, 'Biografie', 320, 2, [16]], ['Der Schimmelreiter', 1888, 'Klassiker', 160, 5, [17]], ['Wilhelm Tell', 1804, 'Klassiker', 128, 5, [18]],
    ['Eragon – Das Vermächtnis der Drachenreiter', 2003, 'Fantasy', 736, 1, [19]], ['Der 7bte Zwerg', 2004, 'Kinderbuch', 256, 4, [20]],
    ['Tintenblut', 2005, 'Fantasy', 720, 3, [2]], ['Die Mitte der Welt', 1998, 'Jugendroman', 464, 1, [8]], ['Bilder deiner großen Liebe', 2014, 'Jugendroman', 144, 6, [9]],
    ['Klassiker der Weltliteratur – Sammelband', 2015, 'Klassiker', 512, 5, [17, 18]]
  ];
  s += ins('buch', ['id', 'titel', 'erscheinungsjahr', 'genre', 'seiten', 'verlag_id'], B.map((b, i) => [i + 1, b[0], b[1], b[2], b[3], b[4]])) + '\n';
  const ba = [];
  B.forEach((b, i) => b[5].forEach(a => ba.push([i + 1, a])));
  s += ins('buch_autor', ['buch_id', 'autor_id'], ba) + '\n';
  const kl = ['5a', '5b', '6a', '7a', '7b', '8c', '9a', '10b'];
  const le = [];
  for (let i = 1; i <= 40; i++) le.push([i, 'L' + String(1000 + i * 37).slice(-4) + String.fromCharCode(65 + i % 26), pick(VW), pick(NN), i > 37 ? null : pick(kl)]);
  s += ins('leser', ['id', 'ausweis_nr', 'vorname', 'nachname', 'klasse'], le) + '\n';
  const au = [];
  for (let i = 1; i <= 90; i++) {
    const start = date(2026, int(3, 10), int(1, 28));
    const bis = addDays(start, 21);
    let zur = null;
    if (start < '2026-10-01' || rnd() < 0.3) zur = addDays(start, int(3, 30));
    if (zur && zur > '2026-10-22') zur = null;
    au.push([i, int(1, B.length), int(1, 37), start, bis, zur]);
  }
  au.sort((a, b) => a[3] < b[3] ? -1 : 1).forEach((a, i) => { a[0] = i + 1; });
  s += ins('ausleihe', ['id', 'buch_id', 'leser_id', 'ausgeliehen_am', 'rueckgabe_bis', 'zurueck_am'], au);
  return s;
}

// ── Online-Shop ───────────────────────────────────────────
function shop() {
  let s = `-- Online-Shop — Kunden, Produkte, Kategorien, Bestellungen
-- bestellposition verbindet Bestellung und Produkt (n:m) und trägt
-- Menge und Einzelpreis — gut für SUM(menge * einzelpreis),
-- GROUP BY und HAVING.

CREATE TABLE kategorie (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE produkt (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  preis DECIMAL(8,2) NOT NULL CHECK (preis >= 0),
  lagerbestand INT NOT NULL DEFAULT 0,
  kategorie_id INT NOT NULL,
  FOREIGN KEY (kategorie_id) REFERENCES kategorie(id)
);

CREATE TABLE kunde (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vorname VARCHAR(40) NOT NULL,
  nachname VARCHAR(40) NOT NULL,
  email VARCHAR(80) NOT NULL UNIQUE,
  plz CHAR(5),
  ort VARCHAR(40),
  registriert_am DATE
);

CREATE TABLE bestellung (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kunde_id INT NOT NULL,
  bestelldatum DATE NOT NULL,
  status ENUM('offen','bezahlt','versendet','geliefert','storniert') NOT NULL DEFAULT 'offen',
  FOREIGN KEY (kunde_id) REFERENCES kunde(id)
);

CREATE TABLE bestellposition (
  bestellung_id INT NOT NULL,
  produkt_id INT NOT NULL,
  menge INT NOT NULL DEFAULT 1,
  einzelpreis DECIMAL(8,2) NOT NULL,
  PRIMARY KEY (bestellung_id, produkt_id),
  FOREIGN KEY (bestellung_id) REFERENCES bestellung(id),
  FOREIGN KEY (produkt_id) REFERENCES produkt(id)
);

`;
  const K = ['Schreibwaren', 'Technik', 'Bücher', 'Sport', 'Spiele', 'Kleidung'];
  s += ins('kategorie', ['id', 'name'], K.map((k, i) => [i + 1, k])) + '\n';
  const P = [
    ['Füller Classic', 12.99, 1], ['Collegeblock A4 kariert', 2.49, 1], ['Textmarker 6er-Set', 4.99, 1], ['Geodreieck', 1.89, 1], ['Taschenrechner FX-87', 19.95, 1], ['Federmappe', 14.5, 1],
    ['USB-Stick 64 GB', 9.99, 2], ['Kopfhörer kabellos', 49.9, 2], ['Tablet-Hülle', 24.99, 2], ['Eingabestift', 29.0, 2], ['Powerbank 10000 mAh', 21.99, 2], ['Ladekabel USB-C', 7.49, 2],
    ['Duden – Rechtschreibung', 30.0, 3], ['Atlas Weltkarten', 27.5, 3], ['Comic: Asterix', 7.99, 3], ['Kochbuch für Einsteiger', 16.9, 3],
    ['Fußball Größe 5', 19.99, 4], ['Springseil', 6.5, 4], ['Trinkflasche 0,75 l', 11.95, 4], ['Turnbeutel', 8.99, 4],
    ['Brettspiel: Siedler', 34.99, 5], ['Kartenspiel UNO', 9.49, 5], ['Puzzle 1000 Teile', 14.99, 5], ['Zauberwürfel', 12.0, 5],
    ['Kapuzenpulli', 39.95, 6], ['Schul-T-Shirt', 15.0, 6], ['Mütze', 12.95, 6], ['Regenjacke', 59.0, 6]
  ];
  s += ins('produkt', ['id', 'name', 'preis', 'lagerbestand', 'kategorie_id'], P.map((p, i) => [i + 1, p[0], p[1], i === 9 ? 0 : int(0, 120), p[2]])) + '\n';
  const PLZ = { Kiel: '24103', Flensburg: '24937', Rendsburg: '24768', 'Eckernförde': '24340', 'Neumünster': '24534', Schleswig: '24837', 'Plön': '24306', Preetz: '24211', Heide: '25746', Husum: '25813' };
  const ku = [];
  const mails = new Set();
  for (let i = 1; i <= 30; i++) {
    const vn = pick(VW), nn = pick(NN), o = pick(ORTE);
    let m = (vn + '.' + nn).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss') + '@example.org';
    if (mails.has(m)) m = m.replace('@', i + '@');
    mails.add(m);
    ku.push([i, vn, nn, m, PLZ[o], o, date(int(2023, 2026), int(1, 9), int(1, 28))]);
  }
  s += ins('kunde', ['id', 'vorname', 'nachname', 'email', 'plz', 'ort', 'registriert_am'], ku) + '\n';
  const be = [], bp = [];
  for (let i = 1; i <= 70; i++) {
    const d = date(2026, int(1, 10), int(1, 28));
    const st = d > '2026-10-15' ? pick(['offen', 'bezahlt']) : pick(['geliefert', 'geliefert', 'geliefert', 'versendet', 'storniert']);
    be.push([i, i <= 4 ? i : int(1, 27), d, st]);
  }
  be.sort((a, b) => a[2] < b[2] ? -1 : 1);
  const remap = {};
  be.forEach((b, i) => { remap[b[0]] = i + 1; b[0] = i + 1; });
  for (const b of be) {
    const n = int(1, 4);
    const ps = new Set();
    while (ps.size < n) ps.add(int(1, P.length));
    for (const p of ps) bp.push([b[0], p, int(1, 3), P[p - 1][1]]);
  }
  s += ins('bestellung', ['id', 'kunde_id', 'bestelldatum', 'status'], be) + '\n';
  s += ins('bestellposition', ['bestellung_id', 'produkt_id', 'menge', 'einzelpreis'], bp);
  return s;
}

fs.writeFileSync(out + '/haustiere.sql', haustiere());
fs.writeFileSync(out + '/schule.sql', schule());
fs.writeFileSync(out + '/bibliothek.sql', bibliothek());
fs.writeFileSync(out + '/shop.sql', shop());
