/* ══════════════════════════════════════════════════════════════
   MPSkills — Lehrwerksliste → Wordisland
   ══════════════════════════════════════════════════════════════
   Macht aus einer Klett-Vokabelliste (PDF, „Green Line 2021")
   zwei Dateien:

     <Name>_kontrolle.tsv   zum Drüberlesen, eine Zeile je Wort
     <Name>_einspielen.sql  zum Einfügen im Supabase-Dashboard

   Aufruf:
     node MPSkills/tools/wordisland/tools/greenline.mjs \
          "…/Vokabelliste_Klasse 5.pdf" --jahrgang 5 --konto soenke

   ⚠️ DER INHALT GEHÖRT NICHT INS REPO. Eine Wortliste ist als
   Sammlung geschützt (dieselbe Überlegung wie in Migration 0130:
   mitgeliefert wird nur, was selbst zusammengestellt ist). Deshalb
   steht hier die REGEL und nicht das Ergebnis — und deshalb
   schreibt das Werkzeug seine Dateien neben das PDF, in einen
   Ordner, den .gitignore aussperrt.

   ── Warum überhaupt ein Werkzeug ───────────────────────────────
   914 Wortpaare von Hand zu übertragen ist keine Frage von Fleiß,
   sondern von Fehlern. Vor allem aber steckt die eigentliche
   Arbeit nicht im Abtippen, sondern in der Notation: Klett trennt
   Bedeutungen mit „;" und benutzt „/" INNERHALB von Wörtern
   („Freund/-in"), Wordisland macht es genau andersherum. Diese
   Umrechnung will an einer Stelle stehen und nicht 914-mal im
   Kopf.
   ══════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';


/* ─── 1) Das Buch ───────────────────────────────────────────────
   Die Kürzel der ersten beiden Spalten. Belegt über die Reihenfolge
   im Inhaltsverzeichnis (klett.de) und das Lehrerbuch, das die
   Abschnitte einer Unit beim Namen nennt: Check-in, Station 1–3,
   Story, Check-out.

   Zwei Kürzel sind erschlossen und nicht belegt: `UT` (nur wenige
   Wörter, steht immer zwischen Story und Check-out — „Unit task")
   und `GRS` (Position ist eindeutig das Auftaktkapitel). Wenn sich
   herausstellt, dass sie anders heißen, ist das hier EINE Zeile. */
const BUCH = {
  5: {
    titel: 'Green Line 1',
    units: [
      ['GRS', 'Hello! (Grundschulübergang)'],
      ['U1',  'Unit 1 — A new school'],
      ['MS1', 'Media smart 1'],
      ['U2',  'Unit 2 — At home'],
      ['AC1', 'Across cultures 1'],
      ['U3',  'Unit 3 — Our Greenwich'],
      ['AC2', 'Across cultures 2'],
      ['U4',  'Unit 4 — Happy Birthday'],
      ['TR',  'Trailer']
    ]
  },
  6: {
    titel: 'Green Line 2',
    units: [
      ['WB',  'Welcome back!'],
      ['U1',  'Unit 1 — The new boy'],
      ['MS1', 'Media smart 1'],
      ['AC1', 'Across cultures 1'],
      ['U2',  'Unit 2 — London: Wow!'],
      ['U3',  'Unit 3 — Star of the internet'],
      ['AC2', 'Across cultures 2'],
      ['U4',  'Unit 4 — What’s your sport?'],
      ['U5',  'Unit 5 — Scotland, here we come!'],
      ['T1',  'Text 1'], ['T2', 'Text 2'], ['T3', 'Text 3'],
      ['T4',  'Text 4'], ['T5', 'Text 5'], ['T6', 'Text 6']
    ]
  }
};

/* Die Abschnitte innerhalb einer Unit, in Buchreihenfolge. Die Zahl
   ist `vocab_sets.sort_order` — die Stationsnummer, nach der beide
   Oberflächen sortieren. */
const STATION = {
  CI: ['Check-in',  1],
  S1: ['Station 1', 2],
  S2: ['Station 2', 3],
  S3: ['Station 3', 4],
  ST: ['Story',     5],
  UT: ['Unit task', 6],
  CO: ['Check-out', 7]
};


/* ─── 2) Das PDF lesen ──────────────────────────────────────────
   Die Textschicht liegt als Einzelstücke mit Koordinaten vor. Zeilen
   entstehen über die Höhe (y), Spalten über die Position (x).

   Die Grenzen stehen fest und werden nicht aus der Kopfzeile
   gerechnet: die Überschriften sind zentriert, die Zellen darunter
   linksbündig — „Englisch" steht bei x=153, seine Spalte beginnt
   aber bei 119. Eine Kopfzeilen-Automatik würde also genau die
   Spalte verfehlen, um die es geht. Geprüft wird stattdessen am
   Ergebnis (siehe `pruefe`). */
const SPALTE = [92, 115, 222, 330, 438];   // Unit | Station | Englisch | Phonetik | Deutsch
const KOPF = /^(Vokabular zu |Lektion$|Englisch$|Phonetik$|Deutsch$|Ukrainisch$|©|Passend zu)/;

function spalteVon(x) {
  let i = 0;
  while (i < SPALTE.length && x >= SPALTE[i]) i++;
  return i;   // 0 Unit · 1 Station · 2 Englisch · 3 Phonetik · 4 Deutsch · 5 Ukrainisch
}

async function lies(pdf) {
  const doc = await getDocument({
    data: new Uint8Array(fs.readFileSync(pdf)),
    useSystemFonts: true,
    verbosity: 0
  }).promise;

  const zeilen = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const stuecke = (await doc.getPage(p).then(s => s.getTextContent())).items
      .filter(i => i.str && i.str.trim())
      .map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str }))
      .sort((a, b) => (b.y - a.y) || (a.x - b.x));

    let lauf = null;
    for (const st of stuecke) {
      if (!lauf || Math.abs(lauf.y - st.y) > 3) { lauf = { y: st.y, teile: [] }; zeilen.push(lauf); }
      lauf.teile.push(st);
    }
  }

  /* Aus Zeilen werden Zeilen der TABELLE. Eine Wortzeile fängt mit
     einem Unit-Kürzel an; alles ohne Kürzel ist der Umbruch einer zu
     langen Zelle und gehört an die Zeile davor. */
  const raus = [];
  for (const z of zeilen) {
    const zelle = ['', '', '', '', '', ''];
    for (const t of z.teile.sort((a, b) => a.x - b.x)) {
      if (KOPF.test(t.s.trim())) { zelle.length = 0; break; }
      const k = spalteVon(t.x);
      zelle[k] = zelle[k] ? (zelle[k] + t.s) : t.s;
    }
    if (!zelle.length) continue;

    const fertig = zelle.map(s => s.replace(/\s+/g, ' ').trim());
    if (fertig[0]) raus.push({ unit: fertig[0], station: fertig[1], en: fertig[2], de: fertig[4] });
    else if (raus.length) {
      const vor = raus[raus.length - 1];
      if (fertig[2]) vor.en = (vor.en + ' ' + fertig[2]).trim();
      if (fertig[4]) vor.de = (vor.de + ' ' + fertig[4]).trim();
    }
  }
  return raus;
}


/* ─── 3) Eine Zelle in Fassungen zerlegen ───────────────────────
   Klett schreibt eine Zelle wie „der; die (auch Pl.); das" oder
   „Freund/-in". Wordisland will die erste Fassung als Lösung und die
   übrigen in `alt` / `alt_term` — dort zählt jede davon als richtig.

   Drei Muster, in dieser Reihenfolge:

     „;"           trennt Bedeutungen        → eigene Fassungen
     „Wort/-ung"   trennt Endungen           → Freund · Freundin
     „Wort/Wort"   trennt ganze Wörter       → Cousin · Cousine

   Was in Klammern steht, wird dabei zugehalten: in „gehen (zu/nach)"
   trennt der Schrägstrich nichts, er gehört zum Hinweis. */

const MASKE_AUF = '', MASKE_ZU = '';

function maskiere(text) {
  const klammern = [];
  const maske = text.replace(/\([^)]*\)/g, m => `${MASKE_AUF}${klammern.push(m) - 1}${MASKE_ZU}`);
  return [maske, s => s.replace(/(\d+)/g, (_, i) => klammern[+i])];
}

/* „Freund/-in" → Freund · Freundin      (Endung hinten angehängt)
   „der-/die-/dasselbe" → derselbe · dieselbe · dasselbe
      Ein Zweig, der auf „-" endet, ist ein ANFANG; sein Rest steht im
      letzten Zweig. Ein Fall im ganzen Buch, aber die Regel kostet
      drei Zeilen und die Ausnahme von Hand würde jedes Jahr neu
      übersehen. */
function endungen(wort) {
  const zweige = wort.split('/');
  const stamm = zweige[0].replace(/[-–]$/, '');
  const letzte = zweige[zweige.length - 1];

  // Anfangsform: „der-/die-/dasselbe". Der Rest steht im letzten
  // Zweig, und zwar hinter einem gleich langen Anfang.
  if (zweige.some(z => z.endsWith('-'))) {
    const rest = letzte.slice(stamm.length);
    return zweige.map(z => z.endsWith('-') ? z.slice(0, -1) + rest : z);
  }
  return zweige.map((z, i) => {
    if (i === 0) return z;
    if (z.startsWith('-')) return stamm + z.slice(1);
    return istEndung(z) ? stamm + z : z;   // „Mein/e" → Mein · Meine
  });
}

/* Ist dieser Zweig eine Endung? Mit Bindestrich steht es da („-in"),
   und einmal im Buch ohne: „Mein/e". Ein EINZELNER Kleinbuchstabe
   ist nie ein eigenes Wort — „quarter past/to" bleibt davon
   unberührt, denn „to" sind zwei. */
const istEndung = z => z.startsWith('-') || /^[a-zäöüß]$/.test(z);

/* Ein angewachsener Klammerzusatz ist eine zweite Schreibweise und
   kein Hinweis: „gym(nasium)" ist auch „gymnasium", „(ein)hundert"
   auch „einhundert". Nur wenn die Klammer am Wort KLEBT — „skates
   (pl)" bleibt außen vor, dort steht eine Auskunft über das Wort. */
function angewachsen(text) {
  if (!/[\wäöüß]\([^)]*\)|\([^)]*\)[\wäöüß]/i.test(text)) return null;
  const voll = text.replace(/[()]/g, '');
  return voll === text ? null : voll;
}

/* Von Hand nachgebessert — gefüllt aus der Nachbesserungsdatei,
   bevor gelesen wird. VORSCHLAG sammelt umgekehrt ein, was das
   Werkzeug bei strittigen Zellen selbst gebaut hat; daraus entsteht
   der Erstentwurf derselben Datei. */
let HANDBUCH = new Map();
const VORSCHLAG = new Map();

function fassungen(zelle, merker) {
  const raus = [];
  for (const teil of String(zelle || '').split(';').map(s => s.trim()).filter(Boolean)) {
    if (HANDBUCH.has(teil)) { raus.push(...HANDBUCH.get(teil)); continue; }
    const [maske, zurueck] = maskiere(teil);
    const woerter = maske.split(' ');
    const treffer = woerter.map((w, i) => w.includes('/') ? i : -1).filter(i => i >= 0);

    const dazu = s => { raus.push(s); const v = angewachsen(s); if (v) raus.push(v); };

    if (!treffer.length) { dazu(zurueck(maske)); continue; }

    /* Nur Endungen? Dann darf jedes betroffene Wort für sich
       aufgefaltet werden — auch zwei in einer Phrase („ein/-e
       andere/-r/-s"). Die Obergrenze fängt das Kreuzprodukt ab. */
    const nurEndungen = treffer.every(i => {
      const z = woerter[i].split('/');
      return z.slice(1).every(istEndung) || z.some(x => x.endsWith('-'));
    });

    if (nurEndungen) {
      let bau = [[]];
      for (let i = 0; i < woerter.length; i++) {
        const wahl = treffer.includes(i) ? endungen(woerter[i]) : [woerter[i]];
        bau = bau.flatMap(v => wahl.map(w => v.concat(w)));
        if (bau.length > 12) bau = bau.slice(0, 12);
      }
      bau.forEach(v => dazu(zurueck(v.join(' '))));
      continue;
    }

    /* Ein einzelnes Wort mit Schrägstrich in einer KURZEN Zelle
       ersetzt sich sauber: „Cousin/Cousine", „Viertel nach/vor",
       „im Weg sein/stehen". */
    const ersetzt = i => woerter[i].split('/').map(w =>
      zurueck(woerter.map((alt, j) => j === i ? w : alt).join(' ')));

    if (treffer.length === 1 && woerter.length <= 3) {
      ersetzt(treffer[0]).forEach(dazu);
      continue;
    }

    /* Sonst trennt der Schrägstrich womöglich ganze SATZTEILE —
       „Woher kommst du/kommt ihr/kommen Sie?", „Was kannst du/könnt
       ihr hören?" — und wo ein Satzteil anfängt, steht nirgends.
       Mechanisch aufzulösen hieße raten.

       Also bleibt die BUCHFORM die Lösung (sie ist das, was im Heft
       steht, und sie ist nie falsch), und dazu kommen die beiden
       Lesarten, die sich ausrechnen lassen: einmal ohne alles hinter
       dem ersten Schrägstrich („Woher kommst du?"), einmal mit dem
       Schwanz des letzten Zweigs („Was kannst du hören?"). Eine der
       beiden trifft; die andere tippt ohnehin niemand.

       Diese Zellen landen in der Nachbesserungsdatei (`--hand`).
       Dort steht je Zelle eine Zeile mit dem Vorschlag; wer sie
       geraderückt, bekommt sie beim nächsten Lauf so, wie sie
       dasteht. Es sind eine Handvoll im Jahrgang — das von Hand zu
       prüfen ist weniger Arbeit, als die Regel dafür zu erfinden,
       und ehrlicher als eine Regel, die manchmal rät. */
    const zweige = maske.split('/');
    const schluss = (teil.match(/[.!?]$/) || [''])[0];
    const vorher = raus.length;

    dazu(zurueck(maske));
    dazu(zurueck(zweige[0].trim()) + schluss);
    // Nur bei EINEM betroffenen Wort: dann ersetzt sich der Zweig
    // sauber. Bei mehreren entstünden Fassungen, in denen noch
    // Schrägstriche stehen — die stehen dann im Wörter-Fenster.
    if (treffer.length === 1) ersetzt(treffer[0]).forEach(dazu);
    VORSCHLAG.set(teil, raus.slice(vorher));
    if (merker) merker.push(teil);
  }

  /* Doppeltes fliegt raus, Reihenfolge bleibt. Acht Fassungen sind
     die Grenze: was danach käme, ist bei „würde/-st/-n/-t" die
     vierte Personalform und bei einer Mehrwortzelle Zufall. */
  const gesehen = new Set();
  return raus.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => {
    const k = s.toLowerCase();
    if (!s || gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  }).slice(0, 8);
}


/* ─── 4) Aus Zeilen werden Stationen ────────────────────────────
   Zusammengelegt wird nach dem DEUTSCHEN Wort: `vocab_items` hat
   einen Riegel gegen doppelte Wörter im selben Satz (0130), und der
   würde sonst still das zweite Paar verschlucken. Zwei englische
   Wörter mit derselben deutschen Bedeutung sind ohnehin genau das,
   wofür `alt` da ist. */
function baue(zeilen, jahrgang, meldungen) {
  const buch = BUCH[jahrgang];
  if (!buch) throw new Error(`Für Jahrgang ${jahrgang} steht kein Buch in BUCH.`);

  const reihe = new Map(buch.units.map(([k], i) => [k, i + 1]));
  const units = new Map();

  for (const z of zeilen) {
    if (!reihe.has(z.unit)) { meldungen.push(['unbekannt', z.unit, z.en, z.de]); continue; }
    if (!z.en || !z.de) { meldungen.push(['leer', z.unit + ' ' + z.station, z.en, z.de]); continue; }

    const uKey = z.unit;
    if (!units.has(uKey)) {
      units.set(uKey, {
        code: uKey,
        titel: buch.units.find(([k]) => k === uKey)[1],
        ord: reihe.get(uKey),
        stationen: new Map()
      });
    }
    const unit = units.get(uKey);

    // Kapitel ohne Stationen (Media smart, Across cultures, Trailer)
    // werden eine „Unit am Stück": ein Dach, eine Station (0150).
    const sKey = STATION[z.station] ? z.station : '—';
    if (!unit.stationen.has(sKey)) {
      unit.stationen.set(sKey, {
        titel: STATION[sKey] ? STATION[sKey][0] : unit.titel,
        ord: STATION[sKey] ? STATION[sKey][1] : 1,
        woerter: new Map()
      });
    }
    const station = unit.stationen.get(sKey);

    const merk = [];
    const de = fassungen(z.de, merk);
    const en = fassungen(z.en, merk);
    if (!de.length || !en.length) { meldungen.push(['leer', uKey + ' ' + sKey, z.en, z.de]); continue; }
    for (const m of merk) meldungen.push(['mehrwort', uKey + ' ' + sKey, z.en, m]);

    // vocab_items: term und translation dürfen 60 Zeichen haben.
    // Passt die erste Fassung nicht, rückt die kürzeste vor — und
    // die Zeile steht in der Kontrolldatei.
    const kurz = (liste, was) => {
      if (liste[0].length <= 60) return liste;
      const beste = [...liste].sort((a, b) => a.length - b.length)[0];
      if (beste.length > 60) return null;
      meldungen.push(['gekürzt/' + was, uKey + ' ' + sKey, z.en, liste[0]]);
      return [beste, ...liste.filter(s => s !== beste)];
    };

    const deK = kurz(de, 'de'), enK = kurz(en, 'en');
    if (!deK || !enK) { meldungen.push(['zu lang', uKey + ' ' + sKey, z.en, z.de]); continue; }

    const schluessel = deK[0].toLowerCase();
    const schon = station.woerter.get(schluessel);
    if (schon) {
      meldungen.push(['zusammengelegt', uKey + ' ' + sKey, schon.en[0] + ' + ' + enK[0], deK[0]]);
      for (const e of enK) if (!schon.en.some(x => x.toLowerCase() === e.toLowerCase())) schon.en.push(e);
      for (const d of deK) if (!schon.de.some(x => x.toLowerCase() === d.toLowerCase())) schon.de.push(d);
      continue;
    }
    station.woerter.set(schluessel, { de: deK, en: enK, nr: station.woerter.size + 1 });
  }

  return [...units.values()].sort((a, b) => a.ord - b.ord)
    .map(u => ({ ...u, stationen: [...u.stationen.values()].sort((a, b) => a.ord - b.ord) }));
}


/* ─── 5) Nummern, die beim zweiten Lauf dieselben sind ──────────
   Aus dem Schlüssel gerechnet statt gewürfelt. Nur so trifft ein
   zweiter Lauf des Skripts dieselben Zeilen (`on conflict do
   update`) — und nur so bleibt der Lernstand jedes Kindes stehen,
   wenn eine Korrektur nachgeschoben wird. */
function nummer(schluessel) {
  const h = crypto.createHash('md5').update('wordisland:vocab:' + schluessel).digest();
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}


/* ─── 6) Ausgabe ────────────────────────────────────────────────── */
const q = s => `'` + String(s).replace(/'/g, `''`) + `'`;
const arr = liste => liste.length ? `array[${liste.map(q).join(', ')}]::text[]` : `'{}'::text[]`;

/* Die Besitzerfrage, einmal formuliert. Steht in drei Anweisungen
   und liest beide Male dieselbe Sitzungseinstellung von ganz oben. */
const LOOKUP =
  `(select p.id, p.school_id from profiles p join schools s on s.id = p.school_id
     where lower(p.account_name) = lower(current_setting('wordisland.konto'))
       and (current_setting('wordisland.schule') = ''
            or lower(s.slug) = lower(current_setting('wordisland.schule'))))`;

function sql(units, jahrgang, konto, schule) {
  const insel = `en:${jahrgang}`;
  const zeilen = [];
  const P = s => zeilen.push(s);

  P(`-- ══════════════════════════════════════════════════════════════`);
  P(`-- ${BUCH[jahrgang].titel} · Jahrgang ${jahrgang} → Myth of Wordisland`);
  P(`-- Erzeugt von MPSkills/tools/wordisland/tools/greenline.mjs`);
  P(`--`);
  P(`-- Im Supabase-Dashboard einfügen und ausführen. Läuft mehrfach:`);
  P(`-- Nummern sind aus dem Inhalt gerechnet, jeder weitere Lauf`);
  P(`-- aktualisiert dieselben Zeilen und legt keine Kopien an.`);
  P(`--`);
  P(`-- Setzt Migration 0159 voraus (Spalte \`shared\`).`);
  P(`-- ══════════════════════════════════════════════════════════════`);
  P(``);
  P(`-- ── EINE Stelle zum Eintragen ─────────────────────────────────`);
  P(`-- Wem gehört das Lehrwerk? Es liegt auf einem Lehrkraft-Konto und`);
  P(`-- ist für die ganze Schule sichtbar (shared). Der Schul-Kurzname`);
  P(`-- darf leer bleiben, solange es den Kontonamen nur einmal gibt.`);
  P(`select set_config('wordisland.konto',  ${q(konto)}, false),`);
  P(`       set_config('wordisland.schule', ${q(schule || '')}, false);`);
  P(``);
  P(`-- Stimmt der Name nicht, bricht das Skript ab, statt still nichts`);
  P(`-- zu tun: ein \`cross join\` ohne Treffer fügt geräuschlos null`);
  P(`-- Zeilen ein, und das sähe wie Erfolg aus.`);
  P(`do $$`);
  P(`declare v_n int;`);
  P(`begin`);
  P(`  select count(*) into v_n from ${LOOKUP} k;`);
  P(`  if v_n <> 1 then`);
  P(`    raise exception 'Kein eindeutiges Lehrkraft-Konto für %, gefunden: %',`);
  P(`      current_setting('wordisland.konto'), v_n;`);
  P(`  end if;`);
  P(`end $$;`);
  P(``);

  // Units
  P(`-- ── Die Kapitel ───────────────────────────────────────────────`);
  P(`insert into vocab_units (id, title, lang_from, lang_to, grade, sort_order, owner_id, school_id, shared)`);
  P(`select v.id, v.titel, 'de', 'en', ${jahrgang}, v.ord, p.id, p.school_id, true`);
  P(`  from (values`);
  P(units.map(u =>
    `        (${q(nummer(`${insel}|${u.code}`))}::uuid, ${q(u.titel)}, ${u.ord})`).join(',\n'));
  P(`       ) as v(id, titel, ord)`);
  P(`  cross join ${LOOKUP} p`);
  P(`on conflict (id) do update set`);
  P(`  title = excluded.title, grade = excluded.grade,`);
  P(`  sort_order = excluded.sort_order, shared = excluded.shared,`);
  P(`  owner_id = excluded.owner_id, school_id = excluded.school_id;`);
  P(``);

  // Stationen
  P(`-- ── Die Stationen ─────────────────────────────────────────────`);
  P(`insert into vocab_sets (id, title, lang_from, lang_to, level, unit_id, sort_order, owner_id, school_id, shared)`);
  P(`select v.id, v.titel, 'de', 'en', ${q(String(jahrgang))}, v.unit, v.ord, p.id, p.school_id, true`);
  P(`  from (values`);
  const sZeilen = [];
  for (const u of units) {
    for (const st of u.stationen) {
      sZeilen.push(`        (${q(nummer(`${insel}|${u.code}|${st.titel}`))}::uuid, ${q(st.titel)}, ` +
                   `${q(nummer(`${insel}|${u.code}`))}::uuid, ${st.ord})`);
    }
  }
  P(sZeilen.join(',\n'));
  P(`       ) as v(id, titel, unit, ord)`);
  P(`  cross join ${LOOKUP} p`);
  P(`on conflict (id) do update set`);
  P(`  title = excluded.title, unit_id = excluded.unit_id,`);
  P(`  sort_order = excluded.sort_order, shared = excluded.shared,`);
  P(`  owner_id = excluded.owner_id, school_id = excluded.school_id;`);
  P(``);

  // Wörter
  P(`-- ── Die Wörter ────────────────────────────────────────────────`);
  P(`-- term = Deutsch, translation = Englisch (so herum seit 0130).`);
  P(`-- alt / alt_term sind die weiteren gültigen Fassungen.`);
  P(`insert into vocab_items (set_id, term, translation, alt, alt_term, sort_order) values`);
  const wZeilen = [];
  for (const u of units) {
    for (const st of u.stationen) {
      const set = nummer(`${insel}|${u.code}|${st.titel}`);
      for (const w of st.woerter.values()) {
        wZeilen.push(`  (${q(set)}::uuid, ${q(w.de[0])}, ${q(w.en[0])}, ` +
                     `${arr(w.en.slice(1))}, ${arr(w.de.slice(1))}, ${w.nr})`);
      }
    }
  }
  P(wZeilen.join(',\n'));
  P(`on conflict (set_id, lower(term)) do update set`);
  P(`  translation = excluded.translation, alt = excluded.alt,`);
  P(`  alt_term = excluded.alt_term, sort_order = excluded.sort_order;`);
  P(``);
  P(`-- ── Was jetzt drinsteht ───────────────────────────────────────`);
  P(`select u.sort_order as unit_nr, u.title as unit, s.sort_order as st_nr,`);
  P(`       s.title as station, count(i.id) as woerter`);
  P(`  from vocab_units u`);
  P(`  join vocab_sets  s on s.unit_id = u.id`);
  P(`  left join vocab_items i on i.set_id = s.id`);
  P(` where u.island_key = ${q(insel)} and u.shared`);
  P(` group by 1, 2, 3, 4`);
  P(` order by 1, 3;`);

  return zeilen.join('\n') + '\n';
}

function tsv(units, meldungen) {
  const zeilen = ['Unit\tStation\tNr\tDeutsch\tweitere deutsche\tEnglisch\tweitere englische'];
  for (const u of units) {
    for (const st of u.stationen) {
      for (const w of st.woerter.values()) {
        zeilen.push([u.titel, st.titel, w.nr, w.de[0], w.de.slice(1).join(' · '),
                     w.en[0], w.en.slice(1).join(' · ')].join('\t'));
      }
    }
  }
  if (meldungen.length) {
    zeilen.push('', '── Zum Nachsehen ──', 'Art\tStelle\tEnglisch\tDeutsch');
    for (const m of meldungen) zeilen.push(m.join('\t'));
  }
  return zeilen.join('\n') + '\n';
}


/* ─── 6b) Die Nachbesserung ─────────────────────────────────────
   Eine Zeile je strittiger Zelle:

     Buchform <TAB> Fassung · Fassung · Fassung

   Links steht die Zelle so, wie sie im PDF steht — daran findet das
   Werkzeug sie wieder. Rechts steht, was gelten soll; die erste
   Fassung ist die Lösung, die übrigen zählen mit.

   Die Datei wird ERGÄNZT und nie überschrieben: was einmal von Hand
   geradegerückt ist, überlebt jeden weiteren Lauf. */
function handLies(datei) {
  if (!fs.existsSync(datei)) return new Map();
  const map = new Map();
  for (const zeile of fs.readFileSync(datei, 'utf8').split('\n')) {
    if (!zeile.trim() || zeile.startsWith('#')) continue;
    const [links, rechts] = zeile.split('\t');
    if (!links || !rechts) continue;
    const fassungen = rechts.split('·').map(s => s.trim()).filter(Boolean);
    if (fassungen.length) map.set(links.trim(), fassungen);
  }
  return map;
}

function handSchreib(datei, offen, vorschlag) {
  const neu = offen.filter(t => !HANDBUCH.has(t));
  if (!neu.length && fs.existsSync(datei)) return 0;

  const kopf = [
    '# Zellen, deren Schrägstrich ganze Satzteile trennt.',
    '# Links die Buchform, rechts die Fassungen mit „ · " getrennt.',
    '# Die erste Fassung ist die Lösung. Zeilen mit # zählen nicht.',
    '# Nach dem Ändern das Werkzeug noch einmal laufen lassen.',
    ''
  ];
  const alt = [...HANDBUCH.entries()].map(([k, v]) => `${k}\t${v.join(' · ')}`);
  const frisch = [...new Set(neu)].map(t => `${t}\t${(vorschlag.get(t) || [t]).join(' · ')}`);
  fs.writeFileSync(datei, kopf.concat(alt, frisch).join('\n') + '\n', 'utf8');
  return frisch.length;
}


/* ─── 7) Prüfen, bevor etwas geschrieben wird ────────────────────
   Das PDF ist nicht dafür gemacht, gelesen zu werden — eine
   verrutschte Spaltengrenze fällt beim Durchsehen von 900 Zeilen
   nicht auf, wohl aber hier. */
function pruefe(zeilen, units) {
  const fehler = [];
  if (zeilen.length < 100) fehler.push(`Nur ${zeilen.length} Zeilen gelesen — stimmt das PDF?`);
  const ohne = zeilen.filter(z => !z.en || !z.de).length;
  if (ohne > zeilen.length * .05) fehler.push(`${ohne} Zeilen ohne Englisch oder Deutsch.`);
  const woerter = units.reduce((n, u) => n + u.stationen.reduce((m, s) => m + s.woerter.size, 0), 0);
  if (!woerter) fehler.push('Kein einziges Wort übrig.');
  for (const u of units) for (const s of u.stationen) {
    if (s.woerter.size > 300) fehler.push(`${u.titel} · ${s.titel}: ${s.woerter.size} Wörter (Grenze 300).`);
  }
  return fehler;
}


/* ─── 8) Aufruf ─────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const wert = (name, vorgabe) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : vorgabe;
};
// Alles, was weder Schalter noch Wert eines Schalters ist, ist der
// Pfad. Sonst schluckt „--konto soenke" sein eigenes Argument.
const frei = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const pdf = frei[0];

if (!pdf) {
  console.error('Aufruf: node greenline.mjs "<pfad zur Vokabelliste.pdf>" --jahrgang 5 --konto <account_name> [--schule mps]');
  process.exit(1);
}

const jahrgang = Number(wert('jahrgang', 5));
const konto = wert('konto', 'LEHRKRAFT-KONTO-EINTRAGEN');
const schule = wert('schule', '');
const ziel = wert('ziel', path.dirname(pdf));
const hand = wert('hand', path.join(ziel, `Klasse${jahrgang}_nachbessern.tsv`));

HANDBUCH = handLies(hand);

const zeilen = await lies(pdf);
const meldungen = [];
const units = baue(zeilen, jahrgang, meldungen);

const fehler = pruefe(zeilen, units);
if (fehler.length) {
  console.error('Abbruch:\n  ' + fehler.join('\n  '));
  process.exit(2);
}

const name = `Klasse${jahrgang}`;
fs.writeFileSync(path.join(ziel, `${name}_kontrolle.tsv`), tsv(units, meldungen), 'utf8');
fs.writeFileSync(path.join(ziel, `${name}_einspielen.sql`), sql(units, jahrgang, konto, schule), 'utf8');

const gesamt = units.reduce((n, u) => n + u.stationen.reduce((m, s) => m + s.woerter.size, 0), 0);
console.log(`${BUCH[jahrgang].titel} · Jahrgang ${jahrgang}`);
for (const u of units) {
  const n = u.stationen.reduce((m, s) => m + s.woerter.size, 0);
  console.log(`  ${u.titel.padEnd(32)} ${String(n).padStart(4)} Wörter  ` +
              u.stationen.map(s => `${s.titel}:${s.woerter.size}`).join(' '));
}
console.log(`  ${'—'.repeat(32)} ${String(gesamt).padStart(4)} Wörter in ` +
            `${units.reduce((n, u) => n + u.stationen.length, 0)} Stationen`);
const offen = meldungen.filter(m => m[0] === 'mehrwort').map(m => m[3]);
const neu = handSchreib(hand, offen, VORSCHLAG);

console.log(`\nGeschrieben nach ${ziel}`);
if (meldungen.length) console.log(`${meldungen.length} Zeilen zum Nachsehen — unten in der Kontrolldatei.`);
if (neu) console.log(`${neu} strittige Zelle(n) in ${path.basename(hand)} — dort geraderücken und noch einmal laufen lassen.`);
else if (HANDBUCH.size) console.log(`${HANDBUCH.size} Zelle(n) aus ${path.basename(hand)} übernommen.`);
