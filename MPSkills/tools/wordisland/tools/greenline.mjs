/* ══════════════════════════════════════════════════════════════
   MPSkills — Lehrwerksliste → Wordisland
   ══════════════════════════════════════════════════════════════
   Macht aus einer Klett-Vokabelliste (PDF, „Green Line G9 2019")
   eine Migration und eine Kontrolldatei:

     supabase/migrations/NNNN_vocab_greenline_g9_<J>.sql
     <Ordner des PDF>/Klasse<J>_G9_kontrolle.tsv   zum Drüberlesen

   Aufruf:
     node MPSkills/tools/wordisland/tools/greenline.mjs \
          "…/Vokabelliste_Klasse 5_G9.pdf" --jahrgang 5

   Läuft er ein zweites Mal für denselben Jahrgang, schreibt er
   DIESELBE Migration neu — und nicht die nächste Nummer.

   ⚠️ „dieselbe" heißt: dieselbe Datei DIESES Lehrwerks. Gesucht wird
   nach `greenline_g9_<J>`, und das trifft die alten Dateien 0160 und
   0163 (Green Line 2021, `greenline_<J>`) absichtlich NICHT. Sie sind
   längst eingespielt; Supabase sieht eine Migration genau einmal an,
   und eine Datei neu zu schreiben, die schon gelaufen ist, ändert an
   der Datenbank nichts und an der Chronik alles. Der alte Bestand
   geht statt dessen in 0170 von Bord.

   ⚠️ Das PDF selbst bleibt draußen: `.gitignore` sperrt den Ordner
   mit den Verlagslisten aus, im Repo stehen nur die daraus
   gewonnenen Wortpaare. Dass der Bestand als Migration mitgeliefert
   wird, ist Sönkes Entscheid vom 20.09.2026 („ich migriere das
   gerne … das soll ganz allgemein drin sein") und weicht bewusst von
   der Notiz in 0130 ab, die Lehrwerksinhalt beim Import der
   Lehrkraft sah.

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
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';


/* ─── 1) Das Buch ───────────────────────────────────────────────
   Die Kürzel der ersten beiden Spalten. Belegt über das
   Inhaltsverzeichnis des jeweiligen Bandes (assets.klett.de,
   `8350…_IHV.pdf`) — dort stehen Kapitelfolge, Kapiteltitel und die
   Abschnittsnamen einer Unit.

   `kennung` geht in JEDE Nummer dieses Bandes ein (siehe `nummer`).
   Sie ist der Grund, warum der alte Bestand und dieser hier sich
   nicht ins Gehege kommen: „Unit 1 · Check-in" von Green Line 2021
   und von Green Line G9 sind zwei verschiedene Stationen, auch wenn
   Kürzel und Abschnittsname gleich lauten. Ohne die Kennung bekämen
   sie dieselbe uuid, und eine Stationsauswahl, die irgendwo als
   blankes JSON liegt (`wi_solo_learners.settings->'sets'`), zeigte
   nach dem Austausch stillschweigend auf fremden Inhalt.

   Die Titel stehen so da, wie der Verlag sie führt. Wo das
   Inhaltsverzeichnis einem Kapitel keine Überschrift gibt (Trailer
   in Band 2 und 3, Across cultures in Band 3), steht hier auch
   keine — eine erfundene wäre eine Behauptung über das Buch. */
const BUCH = {
  5: {
    titel: 'Green Line G9 1',
    kennung: 'glg9:1',
    kurz: 'Klasse5_G9',
    units: [
      ['PUA', 'Pick-up A — We’re from Greenwich'],
      ['U1',  'Unit 1 — It’s fun at home'],
      ['PUB', 'Pick-up B — This is fun!'],
      ['U2',  'Unit 2 — I’m new at TTS'],
      ['U3',  'Unit 3 — I like my busy days'],
      ['AC1', 'Across cultures 1 — How to be polite in English'],
      ['U4',  'Unit 4 — Let’s do something fun'],
      ['U5',  'Unit 5 — Let’s go shopping'],
      ['AC2', 'Across cultures 2 — Food in the UK'],
      ['TR1', 'Trailer — Plans for the school holidays']
    ]
  },
  6: {
    titel: 'Green Line G9 2',
    kennung: 'glg9:2',
    kurz: 'Klasse6_G9',
    /* ⚠️ Reihenfolge nach dem BUCH und nicht nach der Vokabelliste:
       das Inhaltsverzeichnis setzt Across cultures 2 zwischen Unit 5
       und Unit 6, die Liste des Verlags hängt es hinter Unit 6. Die
       Unit-Leiste soll neben dem aufgeschlagenen Heft stimmen
       (Sönke, 24.09.2026: „mach es so wie im buch"). */
    units: [
      ['AC1', 'Across cultures 1 — Let’s discover TTS'],
      ['U1',  'Unit 1 — It’s my party'],
      ['U2',  'Unit 2 — My friends and I'],
      ['U3',  'Unit 3 — London is amazing!'],
      ['U4',  'Unit 4 — Sport is good for you!'],
      ['U5',  'Unit 5 — Stay in touch'],
      ['AC2', 'Across cultures 2 — British legends and stories'],
      ['U6',  'Unit 6 — Goodbye Greenwich'],
      ['TR1', 'Trailer 1'], ['TR2', 'Trailer 2'], ['TR3', 'Trailer 3']
    ]
  },
  7: {
    titel: 'Green Line G9 3',
    kennung: 'glg9:3',
    kurz: 'Klasse7_G9',
    /* `TMS` ist der Lehrgang „Text and media smart", den Band 3 neu
       mitbringt — zwei Kapitel mit eigenen Stationen, Klett nennt
       ihre Themen „Songs and poems" und „On- and offline
       communication". Der Wortschatz passt dazu (songwriter, poet,
       shape poem · informal, recipient, to abbreviate). */
    units: [
      ['U1',   'Unit 1 — Find your place'],
      ['TMS1', 'Text and media smart 1 — Songs and poems'],
      ['AC1',  'Across cultures 1'],
      ['U2',   'Unit 2 — Let’s go to Scotland!'],
      ['AC2',  'Across cultures 2'],
      ['U3',   'Unit 3 — What was it like?'],
      ['TMS2', 'Text and media smart 2 — On- and offline communication'],
      ['AC3',  'Across cultures 3'],
      ['U4',   'Unit 4 — On the move'],
      ['TR1',  'Trailer 1'], ['TR2', 'Trailer 2'], ['TR3', 'Trailer 3']
    ]
  }
};

/* ─── Lücken im Buch ────────────────────────────────────────────
   Zeilen, bei denen in der Vorlage das Stationskürzel schlicht
   FEHLT, obwohl das Kapitel Stationen hat. Das ist etwas anderes
   als ein Kapitel ohne Stationen (Across cultures, Trailer,
   Pick-up) — dort ist die leere Spalte der Normalfall.

   Beide Fälle sind dasselbe Muster: das TITELWORT der Unit steht
   als erste Zeile unter der Kopfzeile, ohne Kürzel, unmittelbar
   über dem Check-in-Block. Ohne Eintrag hier bekäme dieses eine
   Wort eine eigene Station, die den Titel der Unit trägt und noch
   vor dem Check-in steht.

   Eingetragen wird von HAND und je Jahrgang, damit die Entscheidung
   im Quelltext steht und nicht in einer Ausgabedatei. Eine neue
   Lücke meldet sich von selbst (siehe `baue`). */
const LUECKEN = {
  6: { 'U5|to stay in touch (with)': 'CI' }
};

/* Die Abschnitte innerhalb einer Unit. Nur der NAME steht hier; die
   Reihenfolge kommt aus der Liste selbst (siehe `baue`).

   ⚠️ Eine feste Reihenfolge hat es bis Green Line 2021 getan und
   trägt bei G9 nicht mehr: das Buch ordnet je Unit anders — Band 1
   Unit 2 hat Skills → Unit task → Story, Band 2 Unit 3 hat
   Action UK! → Skills → Unit task → Story, Band 2 Unit 2 hat Story
   → Unit task. Eine Tabelle wäre bei der Hälfte der Units falsch,
   und zwar unauffällig falsch.

   Die angehängte Ziffer bei SK/ST/UT steht wirklich so in der Zelle,
   wechselt aber unmotiviert (Band 2: SK1 in Unit 1–2, SK2 ab Unit 3;
   Band 1 nur SK2, dafür ST und UT ohne Ziffer). Sie darf wegfallen,
   weil jedes dieser Kürzel INNERHALB einer Unit höchstens einmal
   vorkommt — nachgezählt über alle 33 Units der drei Bände.

   `FP` ist die Filmseite „Action UK!". Belegt über die Stelle (immer
   dort, wo das Inhaltsverzeichnis Action UK! führt) und über den
   Inhalt: Band 1 Unit 4, Action UK! S. 86 heißt im IHV „Ein
   Outdoor-Hobby kennenlernen", und U4/FP führt geocaching, GPS
   device, cache. */
const STATION = {
  CI:  'Check-in',
  S1:  'Station 1',
  S2:  'Station 2',
  S3:  'Station 3',
  SK:  'Skills',    SK1: 'Skills',    SK2: 'Skills',
  UT:  'Unit task', UT1: 'Unit task', UT2: 'Unit task',
  ST:  'Story',     ST1: 'Story',     ST2: 'Story',
  FP:  'Action UK!',
  CO:  'Check-out'
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

    /* Eine Zeile fängt an, wenn der Abstand nach oben zu groß ist —
       ODER wenn ein Unit-Kürzel auf einer ANDEREN Höhe steht als die
       Zeile, die gerade läuft.

       ⚠️ Der zweite Fall sieht nach Feinschliff aus und ist ein
       Datenverlust. Green Line G9 3, Seite 7: „haggis" hat eine
       dreizeilige deutsche Zelle, und deren letzte Zeile (y 118,08)
       liegt nur 1,68 über der nächsten Wortzeile „tartan" (y 116,40).
       Mit der 3er-Toleranz allein wird beides EINE Zeile: die Spalte
       Deutsch bekommt zwei Stücke aneinandergeklebt, „tartan" erbt
       den Schwanz von „haggis" — und weil die Zeile ein Kürzel hat,
       wird sie eine neue Zeile und der Rest von haggis ist weg.

       Die Toleranz zu senken wäre die falsche Antwort: innerhalb
       einer echten Zeile haben alle Stücke exakt dieselbe Höhe, der
       Abstand zur Fortsetzungszeile darüber schwankt aber mit der
       Zeilenzahl der Zelle. Das Kürzel ist das verlässliche
       Merkmal — es steht immer am Anfang seiner eigenen Zeile. */
    let lauf = null;
    for (const st of stuecke) {
      const kuerzel = st.x < SPALTE[0];
      if (!lauf || Math.abs(lauf.y - st.y) > 3 || (kuerzel && Math.abs(lauf.y - st.y) > .5)) {
        lauf = { y: st.y, teile: [] };
        zeilen.push(lauf);
      }
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
  const luecken = LUECKEN[jahrgang] || {};

  /* Welche Kapitel überhaupt Stationen haben. Erst damit lässt sich
     „leere Spalte" von „fehlendes Kürzel" unterscheiden: bei Media
     smart ist leer richtig, bei Unit 4 ist leer ein Setzfehler. */
  const mitStationen = new Set();
  for (const z of zeilen) if (STATION[z.station]) mitStationen.add(z.unit);

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
    //
    // ⚠️ LEER heißt „dieses Kapitel hat keine Stationen" und ist der
    // Normalfall. Etwas ANDERES als ein bekanntes Kürzel heißt „hier
    // ist beim Lesen etwas verrutscht" — und das darf nicht dasselbe
    // sein. Ohne diese Meldung landet so eine Zeile still in einer
    // Station, die den Titel der Unit trägt, und in einem Kapitel mit
    // Stationen steht sie dann VOR dem Check-in (Klasse 6, Unit 4).
    let code = z.station;
    if (!code && mitStationen.has(uKey)) {
      code = luecken[uKey + '|' + z.en] || '';
      if (!code) meldungen.push(['Station fehlt im Buch', uKey, z.en, z.de]);
    }
    if (code && !STATION[code]) {
      meldungen.push(['Stationskürzel unbekannt: ' + code, uKey, z.en, z.de]);
    }
    /* Der NAME ist der Schlüssel und nicht das Kürzel: SK1 und SK2
       heißen beide „Skills" und müssten, stünden sie je zusammen in
       einer Unit, auch in derselben Station landen. */
    const sName = STATION[code] || null;
    const sKey  = sName || '—';
    if (!unit.stationen.has(sKey)) {
      unit.stationen.set(sKey, {
        titel: sName || unit.titel,
        /* Die Reihenfolge ist die des ersten Auftretens in der Liste,
           und die Liste steht in Buchreihenfolge. Siehe STATION. */
        ord: unit.stationen.size + 1,
        woerter: new Map()
      });
    }
    const station = unit.stationen.get(sKey);

    const merk = [];
    const de = fassungen(z.de, merk);
    const en = fassungen(z.en, merk);
    if (!de.length || !en.length) { meldungen.push(['leer', uKey + ' ' + sKey, z.en, z.de]); continue; }
    for (const m of merk) meldungen.push(['mehrwort', uKey + ' ' + sKey, z.en, m]);

    /* vocab_items: term und translation dürfen 120 Zeichen haben
       (0170 — bis dahin waren es 60). Passt die erste Fassung nicht,
       rückt die kürzeste vor — und die Zeile steht in der
       Kontrolldatei.

       Warum 60 nicht reichte: die deutsche Seite einer
       Lehrwerksliste ist nicht immer ein Wort, manchmal ist sie eine
       Erklärung — „cyber bully → jemand, der andere in sozialen
       Netzwerken belästigt oder mobbt". In Green Line G9 sind das
       sechs Einträge, und bei DREIEN davon war es genau EIN Zeichen
       zu viel. Eine Grenze, die für ein Zeichen ein Wort verschluckt,
       ist für diese Daten die falsche Grenze. */
    const GRENZE = 120;
    const kurz = (liste, was) => {
      if (liste[0].length <= GRENZE) return liste;
      const beste = [...liste].sort((a, b) => a.length - b.length)[0];
      if (beste.length > GRENZE) return null;
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
   wenn eine Korrektur nachgeschoben wird.

   Der Schlüssel fängt mit der `kennung` des Bandes an und nicht mit
   dem Inselschlüssel. Der Unterschied fällt erst bei einem Wechsel
   des Lehrwerks auf, und dann sofort: „en:5|U1|Check-in" ist in
   jedem Englischbuch für Klasse 5 derselbe Text und wäre damit
   dieselbe uuid. */
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

/* Der Bestand ist MITGELIEFERT: owner_id und school_id bleiben null,
   wie bei den drei Beispiellisten aus 0130. Das ist die Form, die es
   ohne jede Zuordnung gibt — kein Konto, an dem sie hängt, keine
   Schule, die sie besitzt, und nichts, was beim Löschen eines
   Profils mitginge (Sönke, 20.09.2026: „das soll ganz allgemein
   drin sein").

   Herauskommt eine MIGRATION und kein Skript zum Einfügen: sie soll
   bei jedem Aufsetzen der Datenbank mitlaufen, an derselben Stelle
   wie die Beispielvokabeln. */
function migration(units, jahrgang, nummerText) {
  const insel = `en:${jahrgang}`;
  const kenn = BUCH[jahrgang].kennung;
  const zeilen = [];
  const P = s => zeilen.push(s);
  const wörter = units.reduce((n, u) => n + u.stationen.reduce((m, s) => m + s.woerter.size, 0), 0);
  const stationen = units.reduce((n, u) => n + u.stationen.length, 0);

  P(`-- ══════════════════════════════════════════════════════════════`);
  P(`-- Migration ${nummerText} — ${BUCH[jahrgang].titel}, Jahrgang ${jahrgang}`);
  P(`-- ══════════════════════════════════════════════════════════════`);
  P(`-- ${wörter} Wortpaare in ${stationen} Stationen unter ${units.length} Kapiteln.`);
  P(`--`);
  P(`-- ⚠️ ERZEUGT — nicht von Hand ändern. Die Quelle ist die`);
  P(`-- Vokabelliste des Verlags (PDF), die Regel steht in`);
  P(`-- MPSkills/tools/wordisland/tools/greenline.mjs:`);
  P(`--`);
  P(`--   node MPSkills/tools/wordisland/tools/greenline.mjs \\`);
  P(`--        "…/Vokabelliste_Klasse ${jahrgang}_G9.pdf" --jahrgang ${jahrgang}`);
  P(`--`);
  P(`-- Was dort passiert, in einem Satz: der Verlag trennt`);
  P(`-- Bedeutungen mit „;" und benutzt „/" INNERHALB von Wörtern`);
  P(`-- („Freund/-in"), Wordisland macht es andersherum — die`);
  P(`-- Umrechnung steht an EINER Stelle und nicht ${wörter}-mal hier.`);
  P(`--`);
  P(`-- ── Mitgeliefert ──────────────────────────────────────────────`);
  P(`-- owner_id und school_id bleiben null: der Bestand gehört`);
  P(`-- niemandem und ist für jede Lehrkraft da, genau wie die drei`);
  P(`-- Beispiellisten aus 0130.`);
  P(`--`);
  P(`-- ── Setzt 0170 voraus ─────────────────────────────────────────`);
  P(`-- Dort geht der alte Bestand (Green Line 2021, Migrationen 0160`);
  P(`-- bis 0163) von Bord. Beides nebeneinander wäre zweimal Klasse`);
  P(`-- ${jahrgang} in derselben Unit-Leiste.`);
  P(`--`);
  P(`-- ── Die Kürzel des Buchs ──────────────────────────────────────`);
  P(`-- Spalte „Lektion" im PDF sind zwei Spalten: Kapitel und`);
  P(`-- Abschnitt. Sie werden hier zu Unit und Station —`);
  P(`-- CI Check-in · S1–S3 Station 1–3 · SK Skills · UT Unit task ·`);
  P(`-- ST Story · FP Action UK! · CO Check-out. Kapitel ohne`);
  P(`-- Abschnitte (Pick-up, Across cultures, Trailer) sind eine Unit`);
  P(`-- am Stück (0150).`);
  P(`--`);
  P(`-- Die REIHENFOLGE der Stationen kommt aus der Liste und nicht`);
  P(`-- aus einer Tabelle: G9 ordnet je Unit anders (mal Skills vor`);
  P(`-- der Story, mal danach, mal Action UK! vor Skills).`);
  P(`--`);
  P(`-- ── Feste Nummern ─────────────────────────────────────────────`);
  P(`-- Aus dem Inhalt gerechnet und nicht gewürfelt. Ein zweiter Lauf`);
  P(`-- der Migration trifft damit dieselben Zeilen (\`on conflict do`);
  P(`-- update\`) — und der Lernstand jedes Kindes bleibt stehen, auch`);
  P(`-- wenn eine Korrektur nachgeschoben wird. In den Schlüssel geht`);
  P(`-- die Kennung des Bandes ('${kenn}') ein, damit keine Nummer`);
  P(`-- dieses Bestands je einer aus einem anderen Lehrwerk gleicht.`);
  P(`--`);
  P(`-- Setzt 0159 voraus: „Ich bin aus …" gilt dort mit und ohne`);
  P(`-- Punkte, „skates (pl)" auch als „skates". Und 0169: „BC`);
  P(`-- (= before Christ)" gilt auch als „before Christ".`);
  P(`--`);
  P(`-- Kein DROP — Idempotenz per \`on conflict\`.`);
  P(`-- ══════════════════════════════════════════════════════════════`);
  P(``);

  P(`-- ─────────────────────────────────────────────────────────────`);
  P(`-- 1) Die Kapitel`);
  P(`-- ─────────────────────────────────────────────────────────────`);
  P(`-- \`grade\` trägt den Jahrgang und damit den Inselschlüssel:`);
  P(`-- vocab_units.island_key ist daraus generiert und steht für alle`);
  P(`-- ${units.length} auf '${insel}'.`);
  P(`insert into vocab_units (id, title, lang_from, lang_to, grade, sort_order) values`);
  P(units.map(u =>
    `  (${q(nummer(`${kenn}|${u.code}`))}, ${q(u.titel)}, 'de', 'en', ${jahrgang}, ${u.ord})`
  ).join(',\n'));
  P(`on conflict (id) do update set`);
  P(`  title = excluded.title, grade = excluded.grade, sort_order = excluded.sort_order;`);
  P(``);

  P(`-- ─────────────────────────────────────────────────────────────`);
  P(`-- 2) Die Stationen`);
  P(`-- ─────────────────────────────────────────────────────────────`);
  P(`-- \`sort_order\` ist die Nummer innerhalb der Unit und damit die`);
  P(`-- Reihenfolge im Pult und auf der Insel.`);
  P(`insert into vocab_sets (id, title, lang_from, lang_to, level, unit_id, sort_order) values`);
  const sZeilen = [];
  for (const u of units) {
    for (const st of u.stationen) {
      sZeilen.push(`  (${q(nummer(`${kenn}|${u.code}|${st.titel}`))}, ${q(st.titel)}, ` +
                   `'de', 'en', ${q(String(jahrgang))}, ${q(nummer(`${kenn}|${u.code}`))}, ${st.ord})`);
    }
  }
  P(sZeilen.join(',\n'));
  P(`on conflict (id) do update set`);
  P(`  title = excluded.title, level = excluded.level,`);
  P(`  unit_id = excluded.unit_id, sort_order = excluded.sort_order;`);
  P(``);

  P(`-- ─────────────────────────────────────────────────────────────`);
  P(`-- 3) Die Wörter`);
  P(`-- ─────────────────────────────────────────────────────────────`);
  P(`-- term = Deutsch, translation = Englisch (so herum seit 0130).`);
  P(`-- alt und alt_term sind die weiteren gültigen Fassungen: „Freund"`);
  P(`-- und „Freundin" sind EIN Wortpaar mit zwei Lösungen, nicht zwei.`);
  P(`--`);
  P(`-- Der Riegel \`(set_id, lower(term))\` aus 0130 ist hier die Angel`);
  P(`-- des \`on conflict\`. Zwei englische Wörter mit derselben`);
  P(`-- deutschen Bedeutung hat der Umwandler deshalb schon`);
  P(`-- zusammengelegt — sonst verschluckte der Riegel hier still das`);
  P(`-- zweite.`);
  P(`insert into vocab_items (set_id, term, translation, alt, alt_term, sort_order) values`);
  const wZeilen = [];
  for (const u of units) {
    for (const st of u.stationen) {
      const set = nummer(`${kenn}|${u.code}|${st.titel}`);
      for (const w of st.woerter.values()) {
        wZeilen.push(`  (${q(set)}, ${q(w.de[0])}, ${q(w.en[0])}, ` +
                     `${arr(w.en.slice(1))}, ${arr(w.de.slice(1))}, ${w.nr})`);
      }
    }
  }
  P(wZeilen.join(',\n'));
  P(`on conflict (set_id, lower(term)) do update set`);
  P(`  translation = excluded.translation, alt = excluded.alt,`);
  P(`  alt_term = excluded.alt_term, sort_order = excluded.sort_order;`);

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
// Pfad. Sonst schluckt „--jahrgang 5" sein eigenes Argument.
const frei = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const pdf = frei[0];

if (!pdf) {
  console.error('Aufruf: node greenline.mjs "<pfad zur Vokabelliste.pdf>" --jahrgang 5 [--nr 0171]');
  process.exit(1);
}

const jahrgang = Number(wert('jahrgang', 5));
if (!BUCH[jahrgang]) {
  console.error(`Für Jahrgang ${jahrgang} steht kein Buch in BUCH — bekannt sind ${Object.keys(BUCH).join(', ')}.`);
  process.exit(1);
}
const kurz = BUCH[jahrgang].kurz;
// Die Kontrolldateien liegen beim PDF (und damit außerhalb des
// Repos), die Migration liegt bei den Migrationen.
const ziel = wert('ziel', path.dirname(pdf));
const migDir = wert('migrationen',
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations'));
if (!fs.existsSync(migDir)) {
  console.error(`Kein Migrationsordner unter ${migDir} — mit --migrationen <pfad> nachhelfen.`);
  process.exit(1);
}
/* Die Nachbesserungsdatei trägt die Kennung des Bandes im Namen: was
   für Green Line 2021 von Hand geradegerückt wurde, ist keine Aussage
   über G9 — von den zwölf alten Einträgen kommen in den neuen Listen
   noch zwei vor. Eine gemeinsame Datei wäre also zu neun Zehnteln
   Karteileiche, und man sähe ihr das nicht an. */
const hand = wert('hand', path.join(ziel, `${kurz}_nachbessern.tsv`));

HANDBUCH = handLies(hand);

const zeilen = await lies(pdf);
const meldungen = [];
const units = baue(zeilen, jahrgang, meldungen);

const fehler = pruefe(zeilen, units);
if (fehler.length) {
  console.error('Abbruch:\n  ' + fehler.join('\n  '));
  process.exit(2);
}

/* Die Migrationsnummer: gegeben oder die nächste freie. Gesucht wird
   nach einer, die diesen Jahrgang DIESES Lehrwerks schon trägt —
   sonst bekäme jede Korrektur eine neue Nummer, und in der Datenbank
   stünde derselbe Bestand zweimal untereinander.

   ⚠️ `greenline_g9_5` und nicht `greenline_5`: das zweite trifft auch
   0160 und 0163, die Dateien des alten Lehrwerks. Die sind
   eingespielt und werden nie wieder angesehen. */
const migName = (() => {
  const da = fs.existsSync(migDir) ? fs.readdirSync(migDir) : [];
  const schon = da.find(f => f.includes(`greenline_g9_${jahrgang}`));
  if (schon) return schon;
  const nr = wert('nr', String(Math.max(0, ...da.map(f => parseInt(f, 10) || 0)) + 1).padStart(4, '0'));
  return `${nr}_vocab_greenline_g9_${jahrgang}.sql`;
})();

fs.writeFileSync(path.join(ziel, `${kurz}_kontrolle.tsv`), tsv(units, meldungen), 'utf8');
fs.writeFileSync(path.join(migDir, migName),
                 migration(units, jahrgang, migName.slice(0, 4)), 'utf8');

const gesamt = units.reduce((n, u) => n + u.stationen.reduce((m, s) => m + s.woerter.size, 0), 0);
console.log(`${BUCH[jahrgang].titel} · Jahrgang ${jahrgang}`);
for (const u of units) {
  const n = u.stationen.reduce((m, s) => m + s.woerter.size, 0);
  console.log(`  ${u.titel.padEnd(56)} ${String(n).padStart(4)} Wörter  ` +
              u.stationen.map(s => `${s.titel}:${s.woerter.size}`).join(' '));
}
console.log(`  ${'—'.repeat(56)} ${String(gesamt).padStart(4)} Wörter in ` +
            `${units.reduce((n, u) => n + u.stationen.length, 0)} Stationen`);
const offen = meldungen.filter(m => m[0] === 'mehrwort').map(m => m[3]);
const neu = handSchreib(hand, offen, VORSCHLAG);

console.log(`\nMigration:  supabase/migrations/${migName}`);
console.log(`Kontrolle:  ${path.join(ziel, `${kurz}_kontrolle.tsv`)}`);
if (meldungen.length) console.log(`${meldungen.length} Zeilen zum Nachsehen — unten in der Kontrolldatei.`);
if (neu) console.log(`${neu} strittige Zelle(n) in ${path.basename(hand)} — dort geraderücken und noch einmal laufen lassen.`);
else if (HANDBUCH.size) console.log(`${HANDBUCH.size} Zelle(n) aus ${path.basename(hand)} übernommen.`);
