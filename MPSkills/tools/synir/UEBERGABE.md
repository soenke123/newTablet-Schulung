# Übergabe — Stand 2026-09-28

Für die nächste KI oder den nächsten Menschen, der hier weitermacht.
**Erst `LIESMICH.md` lesen, dann das hier.** Dieses Blatt sagt nur, was in
dieser Runde passiert ist und was als Nächstes dran ist.

---

## 000a · Das cww-Fenster neu gegliedert (2026-09-29)

Auf Wunsch des Nutzers drei Reiter *Internet · Netzwerkkarten · Allgemein* (Beschreibung
in LIESMICH, Abschnitt *Das Class Wide Web*). Neu: `supabase/migrations/0182_synir_cww_bereiche.sql`
(die Antwort von `synir_cww_tausch` trägt `bereiche`), `internet.andere()`, die
Weiterleitungstabelle am cww mit voreingetragenen Bereichen, die DNS-Liste als Unterseite.
Berührt: `js/konfig.js`, `js/internet.js`, `js/bruecke.js`, `js/app.js`, `tool.js`, `css/app.css`,
`tests/uitest.js`, `tests/raumtest.js`, `supabase/tests/0181_synir_cww.mjs`.
**Vor dem Einsatz im Raum muss 0182 auf dem Server laufen** — ohne sie bleibt die Liste
leer („Noch niemand sonst im Raum"), sonst geht alles wie bisher.
Offen: im Aktionsmodus frischt sich das offene Kärtchen nicht im Takt des Raums auf
(`internetNeu` läuft nur im Entwurf, siehe dort); wer neu dazukommt, sieht es beim
nächsten Öffnen.

---

## 000 · Das Class Wide Web (diese Runde)

**808 kopflose + 839 Browser-Prüfungen + 67 im Raum + 34 RPC-Prüfungen grün.**
Neu: `js/internet.js`, `supabase/migrations/0181_synir_cww.sql`,
`supabase/tests/0181_synir_cww.mjs`. Berührt: `js/netz.js`, `js/schichten.js`,
`js/engine.js`, `js/tcp.js`, `js/dienste.js`, `js/rip.js`, `js/mitschnitt.js`,
`js/subnetze.js`, `js/flaeche.js`, `js/konfig.js`, `js/weiterleitung.js`,
`js/geraet.js`, `js/app.js`, `js/bruecke.js`, `js/szenarien.js`, `tool.js`,
`tool.css`, `index.html`, `css/app.css`, alle drei Prüfstände, alle drei Blätter.
Die Beschreibung steht in LIESMICH, Abschnitt *Das Class Wide Web*.

Der Auftrag, zusammengefasst: *ein Modem wie in Filius, das alle Geräte im Raum
verbindet. Als Wolke mit „cww". Jedes Kind bekommt einen Adressbereich (erste Zahl
50…150), ohne zu erfahren, wem welcher gehört. Ein öffentlicher DNS unter 8.8.8.8,
in den man hineinsehen, aber nichts eintragen kann. Nur wer sein Subnetz wirklich
benutzt, ist verbunden. Das cww als Gateway, nach innen eine Weiterleitungstabelle
nur für das eigene Netz.* Entschieden mit dem Nutzer: Namen gehören dem, der zuerst
kommt; die Lehrkraft hat fest 100; ohne Raum ein Übungsnetz 50 mit 8.8.8.8 lokal;
nach innen von Hand plus RIP-Haken.

### 1 · ⚠️ Ein alter Fehler in der Engine, den erst das cww gezeigt hat

`runUntil` sah vorn in der Schlange ein **abgesagtes** Ereignis, prüfte dessen
Zeit gegen das Ziel — und `step` übersprang es und führte das NÄCHSTE aus, ohne
dessen Zeit je zu prüfen. Bisher fiel das nicht auf, weil die Fristen kurz waren.
Mit der 30-s-Frist eines Pings in ein fremdes Netz lief die Frist nach 0,9 s ab,
und die Uhr sprang vor und wieder zurück. Jetzt räumt `runUntil` tote Ereignisse
selbst ab; eine Prüfung im Abschnitt *Engine* wacht darüber.

### 2 · Die Uhren — die eigentliche Schwierigkeit

Jedes Tablet rechnet in seiner eigenen virtuellen Zeit, mit seinem eigenen Tempo.
Ein Paket in ein anderes Netz wartet dazwischen auf echte Sekunden (die Abfrage
des Raums). Gelöst mit `FERN_FAKTOR = 10` für alles, was auf eine Antwort aus
einem fremden Netz wartet (`stack.fern`: kein Gerät auf der Fläche hat die
Adresse, und sie ist nicht privat). Wer das ändert: bei Turbo (Tempo 2) sind 30 s
Frist 15 echte Sekunden — gut für ein paar Abfragen hin und zurück, nicht für mehr.

### 3 · Was nicht in die Datei gehört

Der Adressbereich hängt am **Kind im Raum**, nicht am Netz. `toJSON` schreibt die
Adresse der Internet-Karte deshalb leer, und `fromJSON` setzt sie aus
`netz.setInternet` wieder ein. Eine Datei aus einem anderen Raum hat danach innen
die falschen Adressen — das cww zeigt dann ein „!" mit dem Satz, dass das Netz so
nicht verbunden ist. Genau so ist es gemeint.

Deshalb hat **Szenario 8** auch keine öffentlichen Adressen: `X.0.0.1` steht im
Auftrag, die Zahl findet das Kind im Reiter *Internet*.

### 4 · ⚠️ Was wieder nur das BILD gezeigt hat

* Die 8.8.8.8-Liste als Tabelle mit vier Spalten brach im Kärtchen
  „drucker.anna.de" mitten im Wort. Jetzt zwei Zeilen je Eintrag.
* Im Aktionsmodus schloss das Auffrischen der Liste (im Takt des Raums) das
  Kärtchen — `panels.renderKarte` räumt dort Gerätekärtchen ab. Aufgefrischt wird
  nur noch im Entwurf.
* Szenario 8 hatte den Laptop unter dem Bildrand.

### 5 · Offen geblieben

* **Der Beamer zeigt kein Gesamtbild.** Die Lehrkraft sieht in *Internet der
  Klasse* eine Liste (Bereich · Name · 8er-Adresse · Namen), aber keine Karte aller
  Netze. Eine Fläche mit allen cwws als Wolken wäre der naheliegende nächste Schritt.
* **Lokale DNS-Server fragen 8.8.8.8 nicht weiter** (keine Weiterleitung). Wer
  draußen etwas finden will, trägt am Gerät 8.8.8.8 als DNS ein. Ein
  „Forwarder"-Haken am DNS-Server wäre echt und klein.
* **Nur A- und MX-Einträge.** Keine Delegation, keine Wurzelserver — siehe die
  Vereinfachung in LIESMICH.
* Im Aktionsmodus füllt sich die 8.8.8.8-Liste nicht von selbst nach (nur beim
  Öffnen des Kärtchens) — siehe 4.
* **Last:** jedes Tablet mit cww fragt alle 0,7–3 s. Bei 30 Tablets sind das in
  Ruhe 10 Aufrufe je Sekunde an Supabase. Ist das zu viel, ist Supabase Realtime
  (Broadcast) der Weg — dann aber mit eigener Anmeldung für Teilnehmer.

---

## 00 · Eine Tabelle statt zwei — und das Router-Kärtchen wird still (vorige Runde)

**760 kopflose + 779 Browser-Prüfungen grün.** Berührt: `js/weiterleitung.js`,
`js/konfig.js`, `js/schichten.js`, `js/app.js`, `index.html`, `css/app.css`,
`tests/uitest.js`, alle drei Blätter.

Der Auftrag, wörtlich: *„Ich hätte da auch nur — wie in Filius — gerne einen
sauberen Bereich für die Tabelle. Die Standards stehen auch drin, nur grau und
nicht bearbeitbar. Mit einem Haken kann ich sie wegmachen wie in Filius. Du
schreibst mir in dem Modal für Router viel zu viel: da steht Automatisches
Routing mit dem Haken, und da drunter die Weiterleitungstabelle und dann der
Button. Kein ‚Neue Zeile', kein Blabla drum herum, maximal ein Erklärsatz."*

### 1 · Das Fenster: EINE Tabelle

Vorher zwei Blöcke untereinander — „Von Hand eingetragen" (Felder) und „Alle
Einträge" (`<table>`, nur lesbar). Jetzt **ein Gitter**, gefüllt aus
`stack.routingTable()` in genau dessen Reihenfolge.

* Zeilen mit `kind === 'eingetragen'` werden zu **Feldern**.
* Alles andere (direkt · RIP · Standard) steht **grau als Text** — `.wlt-c.is-auto`.
  ⚠️ **Kein `disabled`-Feld:** ein graues Eingabefeld lädt zum Hineinklicken ein
  und antwortet dann nicht. Text sagt dasselbe und verspricht nichts.
* Der Haken **„Alle Einträge anzeigen"** (`#wltAlle`) steht in der **Kopfleiste**
  und nicht im Körper — der Körper wird bei jedem `render()` neu geschrieben,
  ein Haken darin verlöre seinen Stand. Wortlaut und Vorgabe („zuerst gesetzt")
  aus Filius, `jvermittlungsrechnerkonfiguration_msg11`.
* Sechste Spalte **Herkunft**, die Filius nicht hat.
* ⭐ **Warum das die ehrlichere Fassung ist:** ein Router hat EINE
  Weiterleitungstabelle. Die Reihenfolge der Zeilen ist die Rangfolge, nach der
  `routeFor` entscheidet — auf zwei Blätter verteilt wäre „wer gewinnt?" nicht
  mehr abzulesen.

⚠️ **`stack.routingTable()` trägt jetzt `idx`** — die Nummer der Zeile in
`node.routes`. Ohne sie müsste das Fenster die eingetragenen Zeilen mitzählen
und hätte damit eine zweite Annahme über die Reihenfolge in `schichten.js` drin.

⚠️ **`malen()` fasst die grauen Zeilen nicht an.** Sie hängen an den
Netzwerkkarten, am Standardgateway und an RIP — an nichts davon ändert eine
getippte Ziffer etwas, und sie neu zu schreiben hieße, das Gitter neu zu bauen,
in dem gerade jemand steht. Dieselbe Regel, die dieses Programm schon einen
Abend gekostet hat.

### 2 · Das Kärtchen: Überschrift, ein Satz, Knopf

Weggefallen sind **vier** Stellen, und jede war für sich richtig:

* die Aufzählung der drei Angaben („welches Netz, welche Maske, an welchen
  Nachbarn") — die Spalten im Fenster sagen dasselbe,
* die Zeile mit den Spaltennamen unter der Tabelle,
* der Absatz „Keine Zeile eingetragen. Dieser Router erreicht damit nur …",
* der Knopf **„Neue Zeile"** (`data-k="wegneu"`) samt Empfänger.

Zusammen ergaben sie in einem Kasten von 340 px mehr Text als Tabelle. Auch der
RIP-Satz ist von vier Sätzen auf einen zusammengezogen.

⭐ **Angelegt wird nur noch im Fenster** — dort stehen die Spaltennamen über den
Feldern, dort steht daneben, was der Router ohnehin schon weiß, und dort
wechselt man von Router zu Router. Zwei Orte zum Anlegen waren zwei Orte, an
denen dieselbe Zeile anders aussah. **Gelöscht** wird weiterhin an beiden
Orten: ein × neben einer Zeile, die dasteht, ist kein zweiter Ort zum Anlegen,
sondern der kürzeste Weg weg von etwas Falschem.

### 3 · Offen geblieben

* **Die Tabelle „Wege"** unter *Was dieses Gerät gelernt hat* zeigt im selben
  Kärtchen noch einmal dieselben Zeilen. Sie ist jetzt eine Wiederholung des
  Fensters — noch nicht angefasst, weil der Auftrag sie nicht nannte.
* **Kein Szenario mit mehr als einem Router.** Damit gibt es weiterhin keine
  Aufgabe, bei der ein Kind überhaupt etwas eintragen MUSS — alle Netze sind
  direkt angeschlossen. Vom Nutzer auf später vertagt („Szenarien machen wir
  später, und dann einmal alle zusammen").

---

## 0 · Die Weiterleitungstabelle bekommt ein Fenster — und der Heimrouter wird aufgeräumt (vorige Runde)

**760 kopflose + 769 Browser-Prüfungen grün** (vorher 758 + 735). **Eine neue
Datei** (`js/weiterleitung.js`), zwei neue Bilder
(`tests/shot-weiterleitung.png`, `tests/shot-router-allgemein.png`). Berührt:
`js/konfig.js`, `js/netz.js`, `js/panels.js`, `js/app.js`, `index.html`,
`css/app.css`, beide Prüfstände, alle drei Blätter.

Zwei Aufträge vom Nutzer. Der erste: *„Die Weiterleitungstabellen sind mir zu
minimalistisch in der Simulation. Die muss näher an Filius ran."* Der zweite:
*„Bei Heimroutern müssen wir das Menü etwas aufräumen."*

⚠️ **Der Auftragstext widersprach sich an einer Stelle** — einmal „wenn der
Haken nicht gesetzt ist, tauchen unten die Weiterleitungstabellen auf", einmal
„sobald der Haken gesetzt ist, erscheint ein Button". Nachgefragt statt geraten;
die Antwort war: **der Knopf gehört zum ausgeschalteten Routing.** Das ist auch
die Fassung, die Filius hat — dort wird der Reiter *Weiterleitungstabelle*
gesperrt, sobald RIP läuft (`setEnabledAt(…, !bs.isRipEnabled())`).

### 1 · Die neue Reihenfolge im Reiter „Allgemein"

Vorher: Gateway → DNS → **Weiterleitungstabelle** → RIP-Haken.
Jetzt: Gateway → DNS → **Netze an diesem Gerät** → **Automatisches Routing** →
Weiterleitungstabelle.

⭐ **Die Begründung ist stärker als die alte und sie stand im Auftrag:** der
Haken ENTSCHEIDET, ob es die Tabelle braucht. Er gehörte also darüber, nicht
darunter. Filius macht es genauso — dort sitzt *Automatisches Routing* (`msg26`)
direkt unter dem Gateway-Feld. Die alte Ordnung folgte dem Unterricht (erst von
Hand, dann die Einsicht, dass das nicht skaliert); das ist weiterhin die
Reihenfolge, in der man die zwei ZUSTÄNDE durchläuft, aber nicht die, in der
sie untereinander stehen müssen.

`wegeBlock` ist dafür in drei Funktionen zerfallen: `netzeBlock`, `ripBlock`,
`wegeBlock`. **Nicht über Flags im selben String** — eine Reihenfolge, die aus
`if`-Zweigen in einer Zeichenkette entsteht, lässt sich beim nächsten Wunsch
nicht umstellen.

Mit Haken steht unter der Überschrift nur noch *„Wird beim automatischen
Routing nicht benötigt."* ⚠️ Und darunter, **wenn Zeilen dastehen**, der Satz,
dass sie gültig bleiben und vorgehen. Der musste bleiben: anders als in Filius
ERSETZT RIP hier die Tabelle von Hand nicht, und eine Zeile, die still
weiterwirkt, ist genau der Fehler, den niemand findet.

### 2 · „Netze an diesem Gerät" — und warum diese Zeile nötig wurde

Der Nutzer wollte, dass die Subnetze des gewählten Routers „in seinem Minimodal
zu sehen" sind. Sie waren es längst — aber **nur im Reiter *Netzwerkkarten***
(`k-nic-sub`, je Karte ein Punkt). Und genau der ist nicht offen, wenn man aus
dem Weiterleitungsfenster kommt: dessen Reiterwechsel schlägt das Kärtchen auf,
und das steht auf *Allgemein*.

⭐ **Die Lehre, die sich lohnt:** „steht schon da" ist keine Antwort, solange
nicht auch der WEG dorthin führt. Die Auskunft gab es, der Weg nicht.

### 3 · `js/weiterleitung.js` — das Fenster

Gebaut wie der **Mitschnitt** und nicht wie ein Kärtchen: ein Fenster über die
ganze Breite braucht keine Platzsuche, sondern eine Gitterzeile. `body` hat
jetzt vier Zeilen (`auto 1fr auto auto`), die neue steht **zwischen** Fläche und
Mitschnitt — der Mitschnitt läuft während einer Übertragung mit und gehört an
den unteren Rand, wo das Auge ihn sucht.

⭐ **Die Entscheidung, die das Ding klein hält: das Fenster hat KEINEN eigenen
Auswahlzustand.** Ein Reiterklick ruft `flaeche.select(id)` — den gewöhnlichen
Klick. Damit geschieht alles Übrige von selbst: markiert, Netze sichtbar,
Kärtchen auf. Umgekehrt folgt der Reiter der Auswahl. Ein zweiter Zustand neben
dem ersten wäre die Frage gewesen, welcher von beiden recht hat.
Gemerkt wird nur `aktiv` — wird ein Endgerät gewählt, bleibt der Reiter stehen,
sonst stünde das Fenster leer da, sobald jemand nebenbei auf einen Rechner
tippt.

Vier Spalten mit echter Kopfzeile: **Ziel · Netzmaske · Nächstes Gateway · Über
Schnittstelle** (`jweiterleitungstabelle_msg3…6`). Die Kopfzeile steht **immer**
da, auch ohne eine einzige Zeile — sie ist der halbe Grund für dieses Fenster,
denn im Kärtchen passen die Namen in keine und stehen dort als Text unter der
Tabelle. Darunter ein zweiter, nur lesbarer Block **Alle Einträge** aus
`stack.routingTable(node)`: die Antwort auf „hat meine Zeile etwas bewirkt".

⚠️ **Dieselbe Zeile steht jetzt an ZWEI Orten**, und das ist der Teil, der
Arbeit gemacht hat:
* `wegStand` und `ueberKarte` werden aus `konfig.js` **exportiert** statt ein
  zweites Mal geschrieben. Zwei Fassungen sagten beim ersten Sonderfall
  Verschiedenes.
* Beim Tippen wird **nachgemalt, nicht neu gebaut** — in beide Richtungen
  (`konfig.wegeMalen` ⇄ `weiterleitung.malen`). Ein `rebuild()` nähme dem Feld
  den Schreibstrich bzw. setzte bei jedem Tastendruck den Bildlauf des
  Kärtchens zurück.
* ⚠️ Das Feld, in dem der Schreibstrich steht, wird beim Nachmalen
  **ausgelassen** (`inp === document.activeElement`). Ohne diese Zeile schriebe
  man sich beim Tippen den eigenen halb getippten Wert um.
* Die Formularnamen heißen im Fenster `wltnet`/`wltmask`/`wltgw` und im
  Kärtchen `wegnet`/`wegmask`/`weggw`. **Beide Formulare stehen gleichzeitig im
  Dokument** — ein Empfänger, der beide trifft, schriebe die Zeile zweimal.
  Das ist [[feedback_eine_kennung_ein_element]] eine Ebene höher.

Empfänger hängen **einmal am Behälter**, nicht je Zeile: der Körper wird bei
jedem `render()` neu geschrieben.

### 4 · Der Heimrouter

* **Reiter: *Allgemein · WAN · LAN***, aufgeschlagen bleibt **LAN**. Damit
  dieselbe Ordnung wie beim Router — vorn steht, wohin etwas gehört, auf geht
  die Seite, auf der gebaut wird.
* **Gateway und DNS vor NAT.**
* **Keine Weiterleitungstabelle mehr.** ⚠️ `KIND.heimrouter.routes` bleibt
  `true` — daran entscheidet `schichten.js`, ob ein Gerät überhaupt
  weiterleitet. Geändert ist die Oberfläche, nicht das Gerät.
* **Der NAT-Schalter ist weg**, NAT ist eine Aussage. Das ist eine **Rücknahme**
  einer ausdrücklich begründeten Entscheidung (Abschnitt 0b: „Ausschalten darf
  man ihn, und das ist Absicht — im Mitschnitt zu sehen, dass nichts
  zurückkommt, ist besserer Unterricht als jede Erklärung"). Der Nutzer hat
  anders entschieden, und Filius steht auf seiner Seite: `GatewayFirmware`
  installiert NAT fest, ein Kontrollkästchen gibt es dort nicht.
  ⚠️ **Im Modell bleibt `node.nat.on`**, und die zwei kopflosen Prüfungen, die
  es auf `false` setzen, bleiben auch — sie prüfen die Simulation, nicht die
  Oberfläche. Neu ist `netz.natLaden()`: ein **gespeicherter Stand mit
  ausgeschaltetem NAT** käme sonst herein, und niemand könnte es wieder
  anschalten. Ein Fall, den man beim Bauen nicht sieht und beim Benutzen nur
  als „geht nicht" bemerkt; dafür gibt es jetzt eine eigene Prüfung.
* **Die NAT- und Portfreigabetexte sind gekürzt** („richtig und genau richtig.
  Aber da ist zu viel Text."). Weggefallen ist, was die Tabelle daneben ohnehin
  zeigt — nicht der Satz, der sagt, wozu es das gibt. Der Zweig „ohne NAT gibt
  es nichts freizugeben" ist mit dem Schalter verschwunden: er war unerreichbar
  geworden.

### 5 · ⚠️ Was wieder nur das BILD gezeigt hat

Beide Prüfstände waren grün, und trotzdem war es falsch: **das FENSTER geht
über die ganze Breite — die TABELLE darf es nicht.** Auf 1500 px war ein Feld
für eine IP-Adresse 310 px breit, das `×` stand einen halben Bildschirm von
seiner Zeile entfernt, und zwischen der Überschrift *Ziel* und dem Wert
darunter lag mehr Weiß als zwischen zwei Spalten. Jetzt `max-width: 1040px`
(Filius' Dialog ist 600 px breit).

⭐ Und ein Fallstrick, der beim Bauen aufgefallen ist, bevor er weh tat: **das
Terminal rechnete seinen Abstand gegen `--trace-h`.** Mit zwei Leisten unten
liegt es sonst auf der neuen. Jetzt gibt es `--unten` am `body`, mit allen vier
Kombinationen ausgeschrieben — hässlicher als eine Formel, aber die einzige
Fassung, die beim dritten Fenster nicht stillschweigend wieder falsch wird.

---

## 0aa · Bilder, Knöpfe, ein wachsender Switch — und ein Kabel, das zu spät kam (Runde davor)

**758 kopflose + 727 Browser-Prüfungen grün** (vorher 734 + 720). Keine neue
Datei, ein neues Bild (`tests/shot-dateien.png`). Berührt:
`js/dateien.js`, `js/netz.js`, `js/szenarien.js`, `js/prog-dateien.js`,
`js/flaeche.js`, `js/konfig.js`, `js/panels.js`, `js/http.js`, `js/app.js`,
`css/app.css`, beide Prüfstände, alle drei Blätter.

Sechs Punkte vom Nutzer, dazu eine Rücknahme. Einer ist ein **echter Fehler**
(Punkt 1), drei sind Vereinfachungen der Bedienung (2–4), einer ist eine Zahl
(5), und einer war gar kein Auftrag, sondern eine **Frage, die die Oberfläche
falsch beantwortet hat** (6). Punkt 7 ist der, der nach der Rückfrage
zurückgenommen wurde.

### 1 · ⚠️ „Neue Kabel tauchen verspätet auf"

Wörtlich: *„Ich setze sie durch Ziehen, und dann sind sie kurz weg, danach sind
sie wieder da."*

**Ursache: `connect()` legte das Kabel im Modell an und niemand zeichnete die
Fläche neu.** `pointerup` (`flaeche.js`) nimmt die Geisterlinie weg, `onMoved`
(`app.js`) speichert, meldet und färbt die Subnetze — aber keiner dieser Wege
baut das SVG. Und `netz.changed()` hat gar keinen Zeichen-Abonnenten:

```js
const r = netz.addCable(aId, ia, bId, ib);
if (!r.ok) toast(r.error);
else if (opts.onMoved) opts.onMoved('verkabelt');   // ← und dann NICHTS
```

Sichtbar wurde das Kabel erst beim nächsten beliebigen `draw()` — beim nächsten
Klick auf ein Gerät oder beim nächsten Kabelzug, der mit `select()` anfängt.
Genau daher das „danach sind sie wieder da": es war der übernächste Zug, der
das vorige Kabel nachtrug.

⚠️ Die zweite Hälfte des Fehlers hat niemand gemeldet, weil man sie nicht
sieht: solange das `<g class="nf-cable">` fehlt, findet `kabelUnter()` es nicht.
Das frische Kabel war **nicht anklickbar** (kein Kärtchen, keine Laufzeit) und
hätte bei einer sofort gestarteten Übertragung **nicht geleuchtet**.

⭐ **Die Lehre, dritte Fassung: EIN NEUES ELEMENT IM MODELL IST NOCH KEIN
ELEMENT IM DOM.** Die erste Fassung war *„ein `click` auf etwas, das beim
Loslassen neu gezeichnet wird, feuert nicht"* (Kabel-Runde), die zweite *„eine
Kennung gehört EINEM Element"* (Mail-Runde). Alle drei kommen aus derselben
Ecke: dieses Programm baut sein DOM neu, und wer eine Änderung nur im Modell
macht, hat nichts getan.

Das Ablegen eines Geräts (`app.js`: `addNode(); neuZeichnen(); select()`) und
das Löschen eines Kabels (`loeschenKabel`) machen es seit je richtig. Das
Anlegen eines Kabels war die einzige Änderung, die in `flaeche.js` **anfängt
und endet** — und genau die hat es vergessen.

⚠️ **Nicht** über `netz.changed()` gelöst: das wirft die ARP- und MAC-Tabellen
weg (`schichten.js`). Beim Verkabeln im Entwurf wäre das richtig, mitten in
einer laufenden Aktion nicht.

**Warum kein Prüfstand es gefangen hat** — der lehrreiche Teil: die Prüfung
*„Ziehen legt ein Kabel"* fragte `netz.cableList().length`. Das Modell war
immer richtig. Jetzt steht eine Zeile daneben, die **Modell gegen DOM** zählt,
ohne einen Klick dazwischen:

```js
document.querySelectorAll('.nf-cable').length === window.SIM.netz.cableList().length
```

### 2 · Der Switch wächst von selbst (bis 50)

Vorher: fünf Buchsen beim Ablegen, Obergrenze 16, und ab der fünften Leitung
musste man von Hand *Schnittstelle hinzufügen* drücken. Vom Nutzer abbestellt:
*„Bitte nimm die Begrenzung bei Switches raus, die können einfach Geräte
verbinden und fertig. Vllt sagen wir maximal 50 Geräte und dann kommt eine
Meldung. Erweiterung der Zugänge, die müssen simpel und einfach sein. Beim
Heimrouter lassen wir das so wie es ist."*

⚠️ **Das war dieselbe Falle, die in diesem Blatt schon als verlorene Stunde
steht** (Abschnitt 0b, Punkt 5: „das vierte Endgerät an Buchse 5 bekam still kein Kabel
— und die Prüfung meldete *ein Gerät hat keine Adresse*, als wäre DHCP
schuld"). Sie ist jetzt weg, nicht umgangen.

Gebaut als **`netz.freieNic(nodeId)`** — die eine Stelle, an der ein Anschluss
von selbst entsteht. Sie steht in `netz.js` und nicht in der Fläche, aus
demselben Grund wie `istWan` und `bruecke`: die Frage „hat dieses Gerät noch
eine Buchse?" darf nur EINE Antwort haben. Geschaltet wird sie über
**`waechst: true`** im KIND-Block, nicht über `kind === 'switch'` irgendwo im
Code — und dasselbe Merkmal blendet in `konfig.js` den Knopf aus.

⭐ **Die Begründung ist didaktisch und nicht bequem:** dass ein Switch
verteilt, ist keine Aufgabe — die Zahl der Löcher in seinem Gehäuse ist für
nichts der Gegenstand. Beim **Router** ist es umgekehrt (jedes neue Netz
braucht eine eigene Adresse), und beim **Heimrouter** zählt die Rückseite des
echten Geräts. Beide behalten ihren Knopf und ihre 8.

Die Meldung beim 51. Gerät nennt die Zahl (`keinAnschlussSatz`): an einem
Gerät, das eben noch von selbst gewachsen ist, wäre „kein freier Anschluss" ein
Rätsel und keine Auskunft. Filius hat hier feste 24 und „Maximale Anzahl
angeschlossener Geräte überschritten" — die Abweichung steht in
`FILIUS-ABGLEICH.md`.

### 3 · `/Bilder` ab Werk — und warum das die Regel NICHT bricht

*„Es gibt standardmäßig einen Ordner ‚Bilder' auf dem Gerät. Da sind die
default Bilder von dir drin … Und die default Bilder von dir sind auf jedem
Gerät."*

Die vier eingebauten SVGs liegen jetzt als `/Bilder/schule.svg`,
`landschaft.svg`, `marke.svg`, `smiley.svg` auf jedem Gerät mit Bildschirm
(`Dateien.grundbestand`, gerufen aus `netz.addNode` bei `dateien: true`).

⚠️ Das steht gegen zwei Sätze, die in diesem Projekt oft gefallen sind: „ein
neues Gerät hat nichts darin, wie in Filius" und „lieber leer als vorbelegt".
**Der Widerspruch ist kleiner, als er aussieht, und die Unterscheidung lohnt
sich für das nächste Mal:** die Regel richtet sich gegen vorweggenommene
**ANTWORTEN**. Eine eingetragene IP-Adresse nimmt die Frage weg, um die es
geht. Bilder nehmen keine Frage weg — sie sind **MATERIAL**. Ohne sie ist der
Bildbetrachter auf einem frischen Gerät ein Programm ohne Gegenstand, und vor
der ersten Webseite stünde „hol dir erst ein Bild von der Festplatte".

Drei Dinge, die es tragfähig machen:

* Sie sind **Verweise** (`bild: '@schule'`), keine Daten — `verbrauch()` bleibt
  bei 0, auch bei zwanzig Geräten. Eine Prüfung wacht darüber.
* Sie lassen sich **wegwerfen wie jede andere Datei**, und sie bleiben weg:
  `grundbestand` läuft in `addNode` und **nicht** in `fromJSON`. Auch dafür
  gibt es jetzt eine Prüfung — sie ist die wichtigste in diesem Abschnitt,
  denn ein Ordner, der nach jedem Laden wiederkommt, ist ein Fehler, auf dessen
  Ursache niemand kommt.
* ⚠️ **Szenarien brauchten eine eigene Zeile.** Ein Szenario geht durch
  `fromJSON` und nicht durch `addNode` — die Bilder fehlten dort also. Gemeldet
  hat es der Browser-Prüfstand, eine Stunde nachdem der Ordner gebaut war
  („Endgerät 1" des sechsten Szenarios hatte keinen Ordner). Gesetzt wird er
  jetzt im Helfer `dev()` in `szenarien.js` — das ist im Ablauf dieselbe Stelle
  wie `addNode`, nämlich dort, wo das Gerät GEBAUT wird, und nicht dort, wo es
  geladen wird.

Nebenbefund beim Bauen: die MIME-Tabelle des Webservers (`http.js`) kannte
`svg`, `gif` und `webp` nicht, obwohl `dateien.js` sie als Bildendungen führt.
Seit ein Bild aus `/Bilder` in den Webserver-Ordner zu kopieren der kürzeste
Weg zu einer Seite mit Bild ist, war das keine Lücke mehr, die man liegen
lassen kann.

### 4 · Drei Knöpfe statt vier

*„Es gibt die Knöpfe ‚Ordner erstellen', ‚neue Text Datei', ‚Datei hochladen'
… Das vereint die Buttons, die du als 2 hast."*

Es standen zwei nebeneinander, die beide eine Datei anlegten: *Bild einfügen*
schlug eine Galerie der eingebauten Bilder auf, *Datei einführen* las eine
echte von der Platte. Jetzt: **Ordner erstellen · Neue Textdatei · Datei
hochladen**, und der dritte nimmt **Bild und Text** — die Endung entscheidet,
wie schon vorher (`TEXT_ENDUNGEN` inline, alles andere in den Inhaltsspeicher).

⭐ Möglich wurde das erst durch Punkt 3: die Galerie war nur der Umweg zu
Bildern, die jetzt als Ordner dastehen. **Eine Zusammenlegung, die etwas
wegnimmt, braucht vorher einen anderen Weg zum selben Ziel** — sonst ist sie
nur eine Streichung.

Das `accept` des Feldes wird aus `BILD_ENDUNGEN + TEXT_ENDUNGEN` gerechnet und
nicht abgeschrieben. Und das Wort auf dem Knopf ist das des Nutzers
(„hochladen", nicht Filius' „importieren") — dafür heißen jetzt auch der Toast,
der Platzbalken und die Fehlermeldungen so. Ein Knopf und eine Meldung, die
zwei verschiedene Wörter für dieselbe Sache benutzen, sind zwei Sachen.

### 5 · 2 MB je Datei, 4 MB je Netz

*„Echte Dateien sollten bis 2 MB groß sein dürfen (gerade ist es 1 MB)."*

Eine Zeile in `dateien.js`. Zum Netzbudget kam die Rückfrage, dass der
localStorage nur rund 5 MB für den GANZEN Stand hat — Antwort des Nutzers:
*„Das wird ja später nicht im localStorage gespeichert, wir wechseln bald auf
eine Datenbank. Also mach 4 MB."* ⚠️ Bis dahin kann also der Toast „Speicher
ist voll" (`app.js`) im Unterricht auftreten. Er ist gebaut und verliert
nichts; die Grenze richtet sich nach dem Ziel und nicht nach dem
Zwischenschritt.

### 6 · Die Laufzeit ist keine Datenrate — und „Rahmen" musste weg

*„Geschwindigkeit ist ganz nett. Ist das die wirkliche Geschwindigkeit? Also
kann ich damit Glasfaser vs Kupfer darstellen? Ich verstehe hier die
Formulierung mit ‚Rahmen' nicht."*

Zwei Fragen, eine Ursache: **der Regler sieht aus wie eine Geschwindigkeit und
ist eine Dauer.** Er verzögert (`netz.js`, `sendFrame`) und bestimmt die
Flugzeit des Punkts (`flaeche.js`); er überträgt nicht. Also:

* **Glasfaser gegen Kupfer geht nicht.** Die beiden unterscheiden sich in der
  Bandbreite, und eine Bandbreite kann erst etwas zeigen, wenn eine große
  Datei aus VIELEN Rahmen besteht — also erst mit MSS und Fragmentierung, die
  es hier bewusst nicht gibt. Was die Laufzeit zeigt, ist die **Entfernung**.
* **„Rahmen" ist weg** — aus diesem einen Satz. Das Wort ist richtig und steht
  weiter im Mitschnitt und am Switch; hier beantwortete es die falsche Frage.
  Der Hilfetext sagt jetzt selbst, was die Zahl NICHT ist: *„Wie lange ein
  Paket auf dieser Leitung unterwegs ist. Ein Kabel im Raum ist kurz, eine
  Leitung über Land lang — es ist keine Datenrate (kein Mbit/s)."*

⭐ **Eine Beschriftung, die eine falsche Erwartung weckt, kostet mehr als eine,
die fehlt.** Die Frage kam von der Lehrkraft, die das Programm gebaut haben
will — im Unterricht hätte sie ein Kind gestellt, und dann in einer Stunde, in
der es um etwas anderes ging.

### 7 · Paketverlust: bleibt

Der Wunsch war *„Ich brauche das Paketverlust-Ding nicht… bitte nimm auch
Aufgaben raus, falls du dazu welche hast."* Nach dem Hinweis, dass der
Prüfstand ihn braucht (*TCP wiederholt ein verlorenes Segment* — die eine
Sache, die TCP kann und UDP nicht) und dass er in drei Blättern als Grundlage
des geplanten Vergleichs TCP/UDP vorgemerkt ist: *„Ok wir lassen ihn drin. Du
hast mich überzeugt."* **An Modell, Regler, Mitschnitt und Prüfungen ist
deshalb nichts geändert.** Aufgaben dazu gab es ohnehin keine — der Hilfetext
am Regler („für Aufgaben") verspricht seit je etwas, das niemand eingelöst hat.

---

## 0ab · Das Mailfenster: ein Fehler und vier Beanstandungen (frühere Runde)

**734 kopflose + 720 Browser-Prüfungen grün** (vorher 729 + 701). Keine neue
Datei. Berührt: `js/prog-mail.js`, `css/app.css`, `index.html`, beide
Prüfstände. Drei neue Bilder: `tests/shot-mail-konto.png`,
`shot-mail-eingang.png`, `shot-mail-neu.png`.

Fünf Punkte vom Nutzer, alle im E-Mail-Programm. Der erste ist ein echter
Fehler, die vier anderen sind Oberfläche.

### 1 · ⚠️ „Ich kann beim Empfänger nichts eintragen"

Wörtlich: *„wenn ich eine Mail schreiben will und auf das Inputfeld zum
Empfänger klicke, dann prüft er was und nichts passiert. Ich kann da somit
nichts eintragen."*

**Ursache: zwei Elemente teilten sich die Kennung `mlAn`.** Der Knopf
*Anmelden* auf der Kontoseite hieß so — und das Feld *An:* beim Verfassen
hieß genauso. Das Fenster zeichnet **alle seine Seiten in DIESELBE Box**; die
Zeile, die den Anmelde-Empfänger verdrahtet, lief aber auf jeder Seite:

```js
const anKnopf = box.querySelector('#mlAn');   // ← findet beim
if (anKnopf) anKnopf.addEventListener('click', …);  //   Verfassen das FELD
```

Ein Tipp ins Empfängerfeld hat also eine Anmeldung ausgelöst („Wird geprüft
…"), das Fenster neu gezeichnet — und das frische Feld hatte keinen
Schreibstrich mehr. Genau das hat der Nutzer beschrieben, Wort für Wort.

⭐ **Die Lehre: eine Kennung gehört EINEM Element.** Das ist die Kehrseite der
Lehre aus der Kabel-Runde (*„ein `click` auf etwas, das beim Loslassen neu
gezeichnet wird, feuert nicht"*): dort ging ein Empfänger verloren, hier bekam
einer zu viel. Beides kommt daher, dass **ein neu gezeichnetes DOM keine
Namensräume hat**. Ein Fenster mit Seiten braucht deshalb Kennungen, die nach
der Tätigkeit heißen, nicht nach der Beschriftung — `mlAn` war die Abkürzung
von „An", und „An" heißt an zwei Stellen etwas anderes.

Behoben in `js/prog-mail.js`, doppelt:
* `mlAn`/`mlAus` → **`mlAnmelden`/`mlAbmelden`**. Das Feld behält `mlAn` und
  steht damit sauber neben `mlBetreff` und `mlText`.
* Die zwei Empfänger hängen jetzt an **`st.seite === 'konto'`**. Die Kennungen
  sind eindeutig; aber ein Empfänger, der auf jeder Seite nach seinem Knopf
  sucht, findet eines Tages wieder etwas Fremdes.

⚠️ **Warum beide Prüfstände grün waren** — und das ist der lehrreichere Teil:
`uitest.js` füllte das Feld mit **`fill()`**. Das setzt den Wert und feuert
`input`, **aber es klickt nicht**. Der Prüfstand ging einen Weg, den kein Kind
geht. Jetzt steht dort `click()`, dann `page.keyboard.type()`.

⚠️ **Und die Gegenprobe hat eine zweite Bequemlichkeit aufgedeckt:** mit
`locator.pressSequentially()` blieb die Zeile *„und man kann hineinschreiben"*
grün, obwohl der Fehler nachgebaut war — ein Locator setzt vor dem Tippen
selbst den Schreibstrich und rettet damit genau den Zustand, den die Prüfung
sucht. **`page.keyboard` schreibt dorthin, wo der Strich wirklich steht.**

⭐ Dazu eine **kopflose** Prüfung, die die ganze Fehlerklasse abdeckt
(`kerntest.js`, Abschnitt *Kennungen in den Programmfenstern*): sie liest
`prog-mail.js`, `prog-web.js`, `prog-dateien.js`, `konfig.js` und `geraet.js`
als Text und zählt jede `id="…"`. Zwei gleiche = Fehler. **Der Browser kann das
gar nicht finden** — dort steht immer nur EINE Seite im DOM, und innerhalb
einer Seite war die Kennung ja eindeutig. Wer eine neue Fensterdatei anlegt,
gehört in diese Liste.

### 2 · SMTP unter POP3

Verlangt: *„beim Konto einrichten hätte ich gerne vom Layout das so, dass die
SMTP Felder unter POP3 stehen."*

`.ml-konto` war `repeat(auto-fit, minmax(130px, 1fr))` — bei der Breite dieses
Fensters **drei** Spalten. Damit stand „SMTP-Server" unter „Maildomain",
während „POP3-Port" noch eine Zeile höher hing. Die Reihenfolge im HTML war
immer richtig; eine Prüfung darauf hätte das nie gefunden. **Deshalb misst die
neue Prüfung Koordinaten.**

Jetzt zwei Blöcke: die vier Kontoangaben als **2 × 2**
(`.ml-konto--zwei`), darunter **`.ml-paar`** mit fest zwei Spalten
(Server breit · Port schmal, 86 px) — POP3-Zeile über SMTP-Zeile.

⭐ Der Grund, warum das Gitter hier **fest** sein muss: die zwei Zeilen sind
dieselbe Angabe zweimal, Rechner und Tür. Untereinander sieht man auf einen
Blick, dass beide Male derselbe Rechner steht und nur die Nummer verschieden
ist. Über drei Spalten verteilt sind es vier zusammenhanglose Felder. Eine
Anordnung, die das nur bei bestimmten Fensterbreiten zeigt, ist keine
Anordnung.

`max(130px, 40%)` deckelt bei zwei Spalten (drei wären 120 %) und fällt unter
~270 px trotzdem auf eine zurück — auf dem Handy die einzige Anordnung, die
trägt. Das **Serverfenster** („Neues Konto") behält seine drei Spalten.

⚠️ **Das zweite davon hat erst das BILD gezeigt**, nachdem die Serverzeilen
schon stimmten: „Maildomain" stand allein in seiner Zeile, mit zwei leeren
Feldern daneben — wie ein Nachtrag statt wie die vierte Angabe.

### 3 · Die zwei Knöpfe im Posteingang

Verlangt: *„die Buttons E-Mails abrufen und E-Mails senden hätte ich gerne
bisschen deutlicher."*

Sie trugen **`.k-add`** — die gestrichelte Fläche für „hier kann noch etwas
dazukommen" (Netzwerkkarte, Konto, Datei). Die ist absichtlich leise. Diese
zwei sind aber das, worum es im ganzen Programm geht, und der leere
Posteingang nennt „E-Mails abrufen" zwei Zeilen darüber **namentlich**.

Neu `.ml-akt`: 11 px Polster, 12,5 px halbfett, Symbol davor, ≥ 36 px hoch.
Zwei neue Zeichen im Satz in `index.html` — **`ic-abrufen`** (Pfeil nach unten
in eine Ablage: die Post liegt beim Server und kommt von dort herunter) und
**`ic-verfassen`** (Stift). ⚠️ Kein Pfeil nach oben fürs Senden: gesendet wird
mit dem Knopf *Senden*, und zwei Pfeile in entgegengesetzte Richtungen wären
die eine Stelle, an der man sich vergreift.

⭐ **Gefüllt ist nur EINER** — der, den der Satz darüber nennt. Zwei gefüllte
Knöpfe nebeneinander heben sich gegenseitig auf; dann ist wieder keiner der
erste. Dieselbe Regel wie `.sw-ok` neben `.sw-nein`. Im Dunkelmodus ist die
Füllung Violett (der dunkle Akzent) mit dunkler Schrift — geprüft.

### 4 · Der Haken am Reiter

Verlangt: *„wenn ich eingeloggt bin hätte ich gerne einen Hacken beim ‚Konto
einrichten' an dem Reiter."* `.ml-hk` mit `ic-haken` in `--ok`.

Er beantwortet von den anderen zwei Seiten aus die Frage, für die man sonst
hierher klicken müsste. ⚠️ **Nicht** in der Pillenform von `.ml-reg em` — die
trägt am Posteingang die ANZAHL, und ein Haken in Zahlenform liest sich als
Zahl, die man nicht entziffern kann.

### 5 · Luft über „Senden"

Verlangt: *„der Senden Button und Abbrechen Button sind etwas zu nah an dem
Textfeld darüber."* Das Schreibfeld ist kein `.ml-f` und hatte deshalb keinen
Abstand nach unten; die Knöpfe berührten seine Kante und lasen sich als Teil
des Felds. `.ml-neu .ml-knoepfe { margin-top: 13px }` — **nur beim Verfassen**,
im Brief steht darüber ein `<pre>` mit eigenem Abstand.

### Was offen blieb

* **„Senden" ist jetzt der kleinste gefüllte Knopf im Fenster**, während
  „E-Mails abrufen" eine Seite weiter groß ist. Bewusst nicht angefasst:
  `.sw-ok`/`.sw-nein` ist das Paar der ganzen Oberfläche (Löschdialoge,
  Appstore), und es hier allein zu vergrößern hieße, es überall zu prüfen.
  Wenn, dann als eigene Runde.
* **Die Portfelder haben keine Prüfung auf Unsinn.** Wer 11 statt 110 tippt,
  sieht es nur im Mitschnitt — das ist so gewollt, aber niemand hat es je
  ausprobiert.
* Alles aus den Listen der Runden davor gilt unverändert weiter.

---

## 0b · Elf Änderungswünsche (frühere Runde)

**729 kopflose + 701 Browser-Prüfungen grün** (vorher 647 + 625). Keine neue
Datei. Berührt: `js/flaeche.js`, `js/panels.js`, `js/app.js`, `js/netz.js`,
`js/konfig.js`, `js/dienste.js`, `js/schichten.js`, `js/terminal.js`,
`js/dateien.js`, `js/prog-dateien.js`, `js/mail.js`, `js/prog-mail.js`,
`js/geraet.js`, `css/app.css`, `index.html`, beide Prüfstände.

Elf Wünsche auf einmal, verteilt auf sechs Ecken. Die Klammer darum: **der
Simulator war an mehreren Stellen glatter, als der Unterricht es braucht.**

---

### 1 · Kabel: warum es „nicht geklappt hat"

Verlangt war „wenn ein Kabel angeklickt wurde, soll es mit Entf entfernt werden
können". Beim Nachsehen waren es **zwei** Ursachen, und die zweite ist die
interessantere.

⚠️ **Ein Kabel hielt seinen Zeigerdruck nicht auf** — anders als der Kommentar
in `flaeche.js` behauptete („Geräte und Kabel halten ihr Ereignis selbst auf").
Geräte tun das, Kabel nie. Der Druck startete also ein Verschieben des
Ausschnitts; das Loslassen ohne Zug rief `select(null)`, und **`draw()` baut
dabei das ganze SVG neu**. Das `click`-Ereignis, an dem die Kabelauswahl hing,
erreichte danach ein Element, das es nicht mehr gab — und wurde gar nicht erst
ausgelöst. Ein Kabel anzuklicken tat seit der Gesten-Runde schlicht nichts.

⭐ **Die Lehre: ein `click`-Empfänger auf etwas, das beim Loslassen neu gezeichnet
wird, feuert nicht.** Das ist kein Sonderfall dieser Fläche — es gilt überall,
wo ein Zeigerereignis das DOM ersetzt. Die Auswahl entscheidet jetzt der
`pointerup`, genau wie bei den Geräten („eine Geste, eine Bedeutung — und
entschieden wird erst beim Loslassen").

Dazu: `selKabel` in `flaeche.js` (schließt sich mit der Geräteauswahl
gegenseitig aus), `.nf-cable.is-sel` im CSS (**derselbe Hof wie `is-betont`,
aber ohne Puls** — `is-betont` kommt und geht von selbst und darf sich bewegen,
eine Auswahl bleibt stehen und würde im Bild herumzappeln), `loeschenKabel()`
in `app.js` als **einzige** Stelle für beide Wege (Taste und Knopf im
Kärtchen — vorher meldete der Knopf „Einstellung geändert" in den Verlauf).

Und `renderKarte()` in `panels.js` behält **Kabelkärtchen im Aktionsmodus**. Die
Regel „dort tritt die Geräteoberfläche an ihre Stelle" gilt für Geräte; ein
Kabel hat keine. Vorher ging es auf und beim nächsten Neuzeichnen wieder zu.

### 2 · Das Programmfenster liegt über den Kacheln

Verlangt: „genau wie beim Handy". ⚠️ **Das Handy tat es aber gar nicht** — es
blendete die Kacheln aus (`display:none`); Laptop und Server schoben sie in
eine 176-px-Spalte. Drei Modelle für eine Sache.

Jetzt **eine Regel für alle**: `.dt-apps` behält immer das
Startbildschirm-Raster, `.dt-fenster` (neuer Wrapper in `index.html`) liegt
absolut darüber, `.dt-dock` mit `z-index: 3` über allem. Damit ist der
Schnellzugriff der Weg von einem Programm zum nächsten — die Kacheln sind bei
offenem Fenster verdeckt. Genau deshalb bleibt er stehen.

⚠️ **Zwei Fallen dabei:**

* **`.dt--kein`** (Router, Switch, Heimrouter) überstimmt das Grid mit
  `display:flex`. Ein absolut gesetzter Wrapper risse dort das Formular aus der
  Anordnung — `.dt--kein .dt-fenster { position: static }`.
* ⭐ **Ein absoluter Kasten trägt nichts zur Höhe bei.** Vorher zog `.dt-win`
  im Fluss den Bildschirm mit; danach blieb er bei seinen 360 px stehen, und
  der Datei-Explorer hatte **155 px** für Liste UND Knöpfe. Gemessen, nicht
  geschätzt. Deshalb `.dt.is-app:not(.dt--kein) { min-height: min(560px, …) }`.
  Das hat nur das Bild gezeigt.

Im Prüfstand ersetzt **`programmAuf(page, id)`** jeden
`[data-app="…"].click()`: vom Startbildschirm über die Kachel, bei offenem
Fenster über das Dock, bei `.dt--kein` über den Reiter. Sechzehn Aufrufe.

### 3 · Smartphones nur über WLAN

`KIND.handy` bekommt **`nurFunk: true`** — ein Merkmal am KIND und **keine
Abfrage auf `kind === 'handy'`** (darüber wacht `kerntest.js` seit der
Handy-Runde). Durchgesetzt an genau einer Stelle: **`funkErzwingen(node)`** in
`netz.js`, gerufen aus `addNode`, `addNic`, `fromJSON` und `einfuegen`.

⚠️ **`fromJSON` zieht alte Stände nach** — ein gespeichertes Handy mit
Kabelkarte wird auf Funk gestellt, und sein Kabel wird beim Lesen gar nicht
erst eingehängt (`if (na.funk || nb.funk) continue`). Sonst hinge auf der Fläche
ein Strich, den kein Formular mehr erklärt.

Die Meldung nennt das **Gerät**, nicht die Karte: „Ein Smartphone hat keine
Kabelbuchse." Die vorhandene Zeile „… funkt — stell sie auf Kabelgebunden"
zeigte auf einen Knopf, den es beim Handy nicht gibt.

### 4 · DHCP: statisch, neu, und nicht mehr vorhersehbar

**a) Statische Adresszuweisung** — Filius' zweiter Reiter, samt Wortlaut
(`jdhcpkonfiguration_msg11…15`): *MAC-Adresse* / *IP-Adresse*, *Hinzufügen*,
*Entfernen*. `conf.statisch = [{mac, ip}]`, in `waehleIp` **vor** allem anderen
gefragt, und ihre Adressen sind im Pool gesperrt. Sie muss **nicht** im Bereich
liegen — auch das aus Filius (`findStaticOffer` fragt den Bereich gar nicht),
und sachlich richtig: eine Ausnahme, die innerhalb der Regel liegen muss, ist
keine.

⭐ **Eine Zutat gegenüber Filius:** die MAC-Adressen der Endgeräte stehen als
anklickbare Kürzel darunter. Dort tippt man siebzehn Zeichen aus zwei Alphabeten
ab — und eine Reservierung, die an einem Zeichen scheitert, sieht aus wie ein
kaputtes DHCP. Es ist keine Vorbelegung: das Feld bleibt leer.
⚠️ **Nur Endgeräte** (`!routes && !wlan`). Ein Router hat mehrere Karten, und
`feste(n)[0]` wäre nicht unbedingt die in diesem Netz — das Kürzel hätte
manchmal gestimmt und manchmal nicht, und dieser Fehler meldet sich nie.

**b) Jeder Aktionsstart vergibt neu.** `setModus('aktion')` ruft jetzt **immer**
`vonVorn()` und nicht nur nach einem Umbau. ⚠️ Und es muss das ganze `vonVorn()`
sein: neue Adressen zu verteilen, während ARP- und MAC-Tabellen die alten
enthalten, wäre ein halber Zustand. Preis: der Mitschnitt geht bei jedem
Wechsel weg. Das ist die ehrliche Bedeutung von „die Adressen werden neu
vergeben".

**c) Der Zufall — und zwar an zwei Stellen.** Erst war nur die eine gebaut:

1. **Gewürfelte Startverzögerung je Client** (`discoverBald`, 0–300 ms). RFC
   2131 verlangt sie ohnehin. Damit ist unvorhersehbar, wessen DISCOVER zuerst
   auf der Leitung ist. Vorher lief `sync()` über `netz.list()` und schickte
   sofort — die Reihenfolge auf der Leitung war die Reihenfolge auf der Fläche.
2. **Gewürfelter Startpunkt im Adressbereich** (`waehleIp`), dann ringförmig
   weiter — wie Filius' `lastOfferedAddress`, nur mit zufälligem Anfang.

⚠️ **Und das reichte nicht.** In acht Durchgängen gewann **immer derselbe
Server**: ein Client nimmt das erste Angebot, und ohne Bearbeitungszeit kommt
immer das des Servers zuerst an, der weiter vorn am Switch steckt. Also bekam
auch die **Antwort des Servers** eine gewürfelte Weile (`DHCP_ANTWORT`, 0–120 ms;
kleiner als die Client-Verzögerung, sonst stünde ein Offer vor seinem Discover).
Erst damit ist die Frage „von welchem Server?" offen.

⭐ **Zufall UND Wiederholbarkeit.** `vonVorn()` würfelt einen neuen Startwert aus
`Date.now()` — nicht aus `Math.random` (die Regel aus `util.js` gilt weiter).
**`window.NETSIM_SEED` nagelt ihn fest**; der Browser-Prüfstand setzt ihn per
`addInitScript`, sonst wäre jede Adressprüfung Glückssache.

### 5 · TTL: es fehlte nur `traceroute`

Dekrement, ICMP Time Exceeded und TTL im Mitschnitt gab es längst. Neu:

* **`ping(node, dst, seq, frist, cb, ttl)`** — `sendIp` nahm `opts.ttl` schon
  an, es setzte nur nie jemand.
* ⭐ **`origKopf(pkt)`**: eine ICMP-Fehlermeldung trägt jetzt Kennung und
  Folgenummer des Originals mit. Das ist keine Zutat — ein echtes ICMP-Fehlerpaket
  trägt den IP-Kopf plus die ersten acht Datenbytes, und bei einem Ping stehen
  genau dort id und seq. Vorher ging jede Fehlermeldung an „den ersten offenen
  Ping"; für `traceroute` (mehrere Anfragen gleichzeitig) wäre das eine Spalte
  Stationen neben einer Spalte Nummern, die nichts miteinander zu tun haben.
  ⚠️ Findet sich kein passender Ping, steht die Meldung jetzt im Terminal statt
  bei irgendeinem anderen, den sie nichts angeht.
* **`CMDS.traceroute` / `tracert`** in `terminal.js`, eine Stufe nach der
  anderen (nicht drei Pakete gleichzeitig wie echte Werkzeuge — hier soll man
  zusehen können), Obergrenze 15.
* **`say('ttl', …)` hatte gar keinen Empfänger.** Jetzt schreibt der Router ins
  Terminal, dass er etwas wegwirft — dieselbe Lücke wie damals bei `dhcp-ok`.

Die Ausgabe, und die steigenden Zeiten sind der halbe Unterricht:

```
Weg zu 192.168.2.20 — höchstens 15 Stationen
   1  192.168.1.1   400.2 ms
   2  10.0.0.2      600.4 ms
   3  192.168.2.20  800.6 ms   ← Ziel
```

⚠️ Zwei Kleinigkeiten zeigte erst die Ausgabe: die Fehlerzeile nannte die
Adresse **doppelt** (`r.from` davor, und der Text sagt „Meldung von …"), und die
Zwischenstationen hatten keine Zeit — obwohl sie das Paket ja bekommen haben.

### 6 · Echte Dateien einführen

Der Kern ist nicht die Einfuhr, sondern **wo die Inhalte liegen**.

⚠️ `netz.toJSON()` ist auch das Format des **Verlaufs**: `verlauf.js` legt bei
jeder Änderung einen vollständigen Stand als Zeichenkette ab und hält sechzig
davon. Ein Foto von 1 MB wäre als Base64 rund 1,4 MB — sechzigmal im Speicher
und bei jedem Geräteverschieben neu serialisiert. Der Kopf von `verlauf.js`
rechnet mit „wenige Kilobyte je Stand", und das soll so bleiben.

Also ein **Inhaltsspeicher** in `dateien.js`: der Eintrag hält
`bild: 'blob:7f3a2c…'`, der Inhalt liegt daneben. Der Schlüssel ist ein
Streuwert über den Inhalt (wie bei git) — dieselbe Datei zweimal eingeführt
kostet einmal Platz, und Kopieren/Einfügen eines Geräts kopiert von selbst nur
den Schlüssel.

⭐ **Deshalb wird im Betrieb NIE ein Inhalt gelöscht**: nach einem Strg+Z muss
die eben gelöschte Datei noch da sein. Aufgeräumt wird nur, wo auch der Verlauf
geleert wird (`blobsLeeren` bei Neu, Szenario, Öffnen).

Zwei Regeln, die nicht offensichtlich sind:

* **Text bis 64 KB bleibt INLINE.** Nur so kann der Editor ihn öffnen — und
  eine eingeführte HTML-Seite zu bearbeiten ist der Grund, aus dem man sie
  einführt.
* **Grenzen gelten für die Daten-URI, nicht für `file.size`** (Base64 bläht um
  ein Drittel). 1 MB je Datei, 3 MB je Netz. Filius: 150 000 Bytes.

Dazu eine dritte Inhaltsform `daten:` für Dateien, die dieses Gerät nicht
anzeigen kann (`art()` → `unbekannt`) — Filius führt auch jede Datei ein und
kann nur die bekannten Endungen darstellen.

⚠️ **Und der stumme `catch` in `app.js` ist weg**: ein voller localStorage
scheiterte mit `console.warn` und sonst nichts. Das Netz sah gespeichert aus und
war beim nächsten Öffnen der Stand von vorhin. Jetzt eine Kurzmeldung, einmal je
Sitzung.

⚠️ Zeigte nur das Bild: `Math.round(n/1024)` schrieb bei einem kleinen Bild
**„0 KB von 3 MB belegt"** — während die Datei in der Liste darüber stand.

### 7 · E-Mail

**a) Das Textfeld.** Ursache: **`textarea` kam im ganzen Stylesheet nicht vor.**
Breite bekamen nur `input.f, select.f`; das Feld stand auf der Browservorgabe
von ~20 Zeichen. Der Editor hatte sich seinerzeit mit `.ed-in` beholfen —
deshalb fiel es erst im zweiten Programm mit Textfeld auf. Eine Zeile.

**b) „E-Mail beantworten"** (`emailanwendung_msg9`), unter der Nachricht statt
als Symbol in der Kopfleiste — man steht dort, wenn der Gedanke kommt. Aufbau
wörtlich nach Filius: `RE: ` (msg18), „<Absender> schrieb:" (msg19), Zitat mit
`> `. ⚠️ Zweimal antworten bleibt bei **einem** „RE: ".
⚠️ Und: **HTML verschluckt genau einen Zeilenumbruch direkt nach `<textarea>`** —
ohne ein zusätzliches `\n` fehlte der Antwort die erste Leerzeile. Der Prüfstand
hat es gefunden.

**c) Maildomain statt E-Mail-Adresse.** Das Feld „E-Mail-Adresse" ist weg, dafür
**„Maildomain:"** — Filius' eigenes Wort, nur von der anderen Seite
(`emailserver_msg4` im Serverfenster). Dass beide Seiten dasselbe Wort benutzen,
ist der halbe Unterricht.
⚠️ **`k.adresse` bleibt im Modell** und wird abgeleitet (`mail.adresseVon`).
`senden`, `abholen`, die Szenarien und mehrere Prüfungen lesen sie; sie
herauszureißen, um dieselbe Zeichenkette anderswo neu zu bilden, wäre Arbeit
ohne Ertrag. `netz.mailKonto` liest bei alten Ständen Domain und Benutzername
aus der gespeicherten Adresse heraus.

**d) Anmelden.** Neu: **`mail.anmelden(node, cb)`**, zwei Gespräche —
POP3 `USER`/`PASS` (die einzige echte Anmeldung) und SMTP
`HELO`/`MAIL FROM`/`RCPT TO`/`QUIT`. Der Fehlertext ist die **Zeile des
Servers**.

⚠️ **Zwei Dinge musste der Prüfstand erst herausfinden:**
* `RCPT TO` antwortete **immer** mit 250 — geprüft wurde erst nach dem
  Brieftext. Jetzt prüft es dort (`kannZustellen`), so wie echtes SMTP, und im
  Mitschnitt steht die Ablehnung beim Befehl mit dem Empfänger darin statt
  zwanzig Zeilen später.
* Eine **falsche Maildomain** fiel damit trotzdem nicht auf (fremde Domains
  werden ja weitergereicht — dafür gibt es MX). Sie steht in der **Begrüßung**:
  `220 schule.de Willkommen`. Dafür hat `gespraech` jetzt ein optionales
  `pruefe(zeile)` — eine Antwort kann die richtige Form haben und trotzdem das
  Falsche sagen.

Nach dem Anmelden sind die Felder gesperrt und die Adresse steht da.
⭐ **Ohne Schloss** — anders als bei DHCP: dort erklärt nichts sonst, warum ein
Feld zu ist, hier steht der grüne Balken zwei Zentimeter darunter. Aus demselben
Grund fällt die abgeleitete Adresszeile im angemeldeten Zustand weg: sie stand
doppelt da, und **das hat das Bild gezeigt**.

`dienste.reset()` meldet ab — „von vorn" heißt auch hier von vorn.

**e) Doppelte Benutzernamen.** Der Knopf brach in **drei** Fällen stumm ab
(leer, Leerzeichen, Dublette): er tat nichts, die Felder blieben stehen, es sah
aus wie ein kaputter Knopf. ⚠️ **Und der Vergleich war zusätzlich falsch:**
`===`, während `mail.konto()` `toLowerCase()` benutzt — „Anna" und „anna" ließen
sich beide anlegen, POP3 nahm danach immer das erste. Wortlaut aus Filius, wo es
ihn gibt (`emailserver_msg24/25`, `msg22+23`); für die Dublette hat Filius
keinen (dort gibt `benutzerHinzufuegen` still `false` zurück und das Fenster
meldet trotzdem „wurde angelegt").

### ⚠️ Fallen im Prüfstand, die diese Runde gekostet haben

1. **`selectOption('#szenario', …)` auf einen bereits gewählten Wert lädt
   nichts neu.** Die Kabelprüfung lief dann auf dem umgebauten Netz des
   vorigen Abschnitts. Wer hier ein Szenario braucht, wählt erst ein anderes.
2. **Ein Szenariowechsel fragt per `confirm` nach.** Ohne
   `page.on('dialog', d => d.accept())` verwirft Playwright ihn stillschweigend
   — betrifft jedes eigene Skript neben `uitest.js`.
3. **`[data-seite="eingang"]` trifft zwei Elemente**: den Reiter und den
   Abbrechen-Knopf beim Verfassen. `.ml-reg[data-seite="eingang"]`.
4. **Der Haken `angemeldet` muss NACH `setModus('aktion')` gesetzt werden** —
   der Wechsel ruft `vonVorn()` → `dienste.reset()` und meldet ab. Genau wie
   gewollt, aber im Prüfstand eine halbe Stunde.
5. ~~**Ein Switch hat fünf Buchsen (0–4).** Das vierte Endgerät an Buchse 5
   bekam still kein Kabel — und die Prüfung meldete „ein Gerät hat keine
   Adresse", als wäre DHCP schuld.~~ **Am 2026-09-28 an der Wurzel behoben:**
   der Switch lässt eine Buchse nachwachsen (Abschnitt 0, Punkt 2).

### Was offen blieb

* **Kein Szenario zu den neuen Sachen.** Weiterhin die größte Lücke: ein Netz
  mit zwei DHCP-Servern wäre jetzt eine echte Frage („von wem bekommst du deine
  Adresse — und warum wisst ihr das vorher nicht?"), und `traceroute` hätte am
  Routing-Szenario seinen Platz.
* **Das Handy hat keine Rolle in einem Szenario.** Seit es nur noch funkt, wäre
  „bring dein Telefon ins Schul-WLAN" ein Auftrag mit einer Reihenfolge.
* **Eingeführte Dateien reisen nicht durchs Netz, ohne dass es weh tut.** Eine
  große Datei geht als EIN TCP-Segment in EINEM IP-Paket über die Leitung (es
  gibt bewusst keine MSS und keine Fragmentierung) — ein 1-MB-Bild über HTTP ist
  ein einziger fliegender Punkt. Steht jetzt in `LIESMICH.md` bei den absichtlich
  unrealistischen Zahlen.
* **Der Platzbalken zählt nur eingeführte Dateien**, nicht den ganzen Stand. Wer
  dreißig Geräte mit Postfächern baut, sieht dort weiter „0 Byte".
* **Die Anmeldung ist nicht im Mitschnitt als solche erkennbar** — sie sieht aus
  wie ein POP3- und ein SMTP-Gespräch, was sie ja auch ist. Ein eigener Chip
  wäre falsch; eine Klartextzeile „Anna meldet sich an" vielleicht richtig.

---

## 0c · Wege: von Hand, von selbst, und die Tür nach innen (frühere Runde)

**647 kopflose + 625 Browser-Prüfungen grün** (vorher 558 + 547). **Eine neue
Datei:** `js/rip.js` (~400 Zeilen). Berührt: `js/schichten.js`, `js/nat.js`,
`js/netz.js`, `js/konfig.js`, `js/dienste.js`, `js/mitschnitt.js`,
`js/terminal.js`, `js/flaeche.js`, `js/app.js`, `css/app.css`, `index.html`,
beide Prüfstände.

Auftrag des Nutzers, in einem Satz: *„Bau bitte händische Weiterleitung ein und
automatisches Routing sowie die Portfreigabe im Heimrouter."* Drei Sachen, und
sie hängen enger zusammen, als sie aussehen — die ersten zwei sind dieselbe
Frage in zwei Antworten, die dritte ist die Zeile, die NAT schon immer gebraucht
hätte.

### 1 · Die Weiterleitungstabelle — und die Spalte, die kein Feld ist

`node.routes` lag seit jeher im Modell und wurde in `routeFor` gelesen; es
fehlte nur das Formular. Es steht jetzt im Reiter *Allgemein* von Router und
Heimrouter (`wegeBlock` in `konfig.js`), mit Filius' Spalten *Ziel · Netzmaske ·
Nächstes Gateway* und seinem Knopf *Neue Zeile*.

⭐ **Die vierte Filius-Spalte — *Über Schnittstelle* — ist hier kein Feld,
sondern eine Auskunft unter der Zeile.** Sie FOLGT aus dem Gateway: das muss in
einem Netz liegen, das dieses Gerät erreicht, sonst gibt es keinen Weg. In
Filius tippt man sie mit und kann damit eine Zeile bauen, die sich selbst
widerspricht (Gateway im Netz der ersten Karte, eingetragen über die zweite).

Der Nebenertrag ist größer als die Entscheidung: unter jeder Zeile steht in
drei Zuständen, was sie tut — *noch nicht vollständig* (blass), *10.0.0.1 liegt
in keinem Netz dieses Geräts* (rot), *über Netzwerkkarte 2 · 192.168.2.1*
(grün). Das ist der häufigste Fehler an dieser Tabelle, und er fällt jetzt beim
Tippen auf statt beim Ping.

⚠️ `wegStand()` steht **in einer** Funktion, weil zwei Stellen sie brauchen: der
Aufbau des Formulars und `wegMalen()` beim Tippen. Zweimal geschrieben sagten
sie beim ersten Sonderfall Verschiedenes — und dann behauptet das Formular
während des Tippens etwas anderes als danach.

### 2 · `routeFor` hat jetzt eine Rangfolge — und das ist die heikelste Stelle

Bis hierher galt allein: **längste passende Maske gewinnt.** Mit RIP kommen
Kandidaten aus einer dritten Quelle dazu, und dann reicht das nicht.

Neu, in `schichten.js`:

```
1. längste Maske               (wie bisher, unverändert)
2. bei GLEICHER Maske: Rang    direkt 0 · eingetragen 1 · RIP 2 · Standard 3
```

Das ist die administrative Distanz echter Geräte. ⚠️ **Der Rang wird erst bei
gleicher Maske gefragt** — sonst gewönne ein Standardgateway gegen jeden
gelernten Weg, nur weil ein Mensch es eingetragen hat, und RIP wäre für nichts
eingeschaltet.

⚠️ **Und hier weicht das Programm bewusst von Filius ab.** Dort schaltet ein
eingeschaltetes RIP die Tabelle von Hand komplett aus:
`Weiterleitungstabelle.holeWeiterleitungsEintrag` nimmt *entweder* die
statische *oder* die dynamische. Wer dort eine Zeile einträgt und danach das
automatische Routing anschaltet, sieht seinen Eintrag stillschweigend außer
Kraft treten — das ist die Sorte Fehler, die eine Klasse nicht findet. Hier
ergänzen sich die beiden, und der Kurzhinweis unter dem Haken sagt es auch.

Das Standardgateway ist dabei von `if (!best)` auf einen normalen Kandidaten
mit Maske /0 umgestellt. Das Ergebnis ist identisch (kürzer als /0 geht nicht),
aber es ist jetzt dieselbe Regel statt einer zweiten daneben.

### 3 · RIP — `js/rip.js`

Distanzvektor, wie in `filius/software/rip/`: UDP **520** (gesendet von 521, als
Rundruf), **Unendlich = 16**, **Split Horizon**, Ansage außer der Reihe bei
Änderungen, ablaufende Wege werden auf unendlich gesetzt statt gelöscht.

**Wo es andockt — drei Stellen, mehr nicht:**

1. Erzeugt in `Stack`, neben `nat` und `tcp`. Das ist begründungsbedürftig, denn
   RIP ist ein Anwendungsprotokoll und gehörte der Bauart nach in `dienste.js`.
   Der Grund ist `routeFor`: ein Dienst, dessen Ergebnis die Vermittlungsschicht
   bei JEDEM Paket braucht, gehört dorthin, wo diese Schicht ihn ohne Umweg
   fragen kann. Über `dienste.js` liefe eine Rückreferenz.
2. `dienste.sync()` ruft `stack.ripAn/ripAus` — stumpf, wie bei DHCP und DNS.
3. `dienste.reset()` räumt die Tabelle weg, wie bei NAT.

**Die Zeiten sind skaliert und das muss so sein.** Filius: 30 s Takt, 75 s Frist
— in ECHTEN Sekunden. Hier zählt simulierte Zeit, und bei Tempo 0,1 wären das
fünf echte Minuten bis zur ersten Ansage. Also **5 s und 12,5 s**, Filius'
Verhältnis 5/2. Eine kopflose Prüfung bewacht, dass die Frist über dem Takt
bleibt: wäre sie kürzer, liefe ein Weg ab, bevor die nächste Ansage ihn
bestätigen kann, und die Tabelle flackerte im Takt.

**Zwei Abweichungen von Filius, beide zum Besseren:**

* **Die eigenen Netze stehen NICHT in der Tabelle**, sondern werden bei jeder
  Ansage neu ausgerechnet (`lokale()`). Filius legt sie einmal beim Starten
  hinein — dann steht dort nach dem Ändern einer Adresse das Netz von vorhin.
  Wichtiger noch: so KANN ein gelernter Weg einen eigenen nicht überschreiben,
  weil sie nicht in derselben Liste liegen.
* **Die Ansage außer der Reihe stört den Takt nicht.** Filius setzt dafür den
  nächsten Takt auf sofort; ein gleichmäßiger Grundrhythmus plus gelegentliche
  Zwischenrufe ist im Mitschnitt zu lesen, ein ständig verschobener Takt nicht.

⚠️ **Nur am Router, nicht am Heimrouter** — und das ist aus Filius übernommen,
nicht ausgedacht: `jvermittlungsrechnerkonfiguration_msg26` gibt es, ein
Gegenstück in `jgatewayconfiguration_*` nicht. Es ist auch sachlich richtig: ein
Heimrouter, der dem Anbieter die Netze im Haus zuruft, stellt nichts nach.

Im Mitschnitt: eigener Chip **RIP**, eigene Farbe `--rip` (grün, neben `--ping`
— es ist der einzige Verkehr, den niemand angestoßen hat), der fliegende Punkt
**hohl** wie beim SYN (eine Ansage trägt keine Nutzdaten), Klartextzeile und
eine Anwendungsschale auf **Schicht 7**. Die Sieben ist die Stelle, an der DHCP
und DNS schon einmal falsch standen — RIP benutzt UDP, es ist keins.

### 4 · Portfreigaben — dieselbe Liste für beide Richtungen

`nat.js` hatte im Dateikopf seit jeher stehen, eine Portfreigabe sei „nichts
anderes als eine Zeile in dieser Tabelle, die von Hand eingetragen wird statt
beim Hinausgehen zu entstehen". Genau so ist sie jetzt gebaut.

⭐ **Der Entwurf, der sich als richtig erwiesen hat:** KEINE künstliche Zeile in
der dynamischen Tabelle (so macht es Filius mit `DynamicEnryFromStatic`),
sondern **beide Richtungen fragen dieselbe Liste** — `herein()` nach dem Fehlen
einer dynamischen Zeile, `hinaus()` VOR dem Vergeben einer neuen Nummer.

Die zweite Hälfte ist die, die man vergisst: ohne sie ginge die Antwort des
Webservers im Haus mit einer frisch vergebenen 40001 hinaus, und draußen wartet
jemand auf eine Antwort von Port 80. Mit einer gemeinsamen Liste kann die eine
Richtung nicht anders antworten als die andere.

`node.nat.frei` liegt bei den Einstellungen und nicht in `node.state` — es ist
eine Einstellung und keine Tabelle, die sich füllt. Entsprechend überlebt es
Speichern und „von vorn"; die Gespräche nicht.

⭐ **Leerer LAN-Port heißt „derselbe".** Das ist keine vorweggenommene Antwort
(das Feld bleibt leer, ein Satz darunter sagt es) — und damit nichts unsichtbar
passiert, steht das Ergebnis in der NAT-Tabelle. Die hat dafür eine dritte
Spalte bekommen: *woher* — `Freigabe` gegen `Gespräch`.

### 5 · ⚠️ Drei Fehler, und wer sie gefunden hat

1. **`nat.tabelle()` gab bei ausgeschaltetem NAT die Freigaben heraus.**
   *(Kopfloser Prüfstand.)* Im Fenster wäre es nie aufgefallen — die Tabelle
   wird ohnehin nur bei aktivem NAT gezeichnet. Aber eine Funktion, die
   Übersetzungen meldet, wo nichts übersetzt wird, wartet nur auf den nächsten
   Aufrufer, der ihr glaubt. Jetzt steht `if (!aktiv(node)) return []` ganz oben.
2. **Die NAT- und die Wegetabelle gingen beim Tippen nicht mit.**
   *(Browser-Prüfstand.)* Beide Formulare versprechen im Kurzhinweis, unten
   stehe, was dabei herauskommt. Das stimmte erst beim nächsten beliebigen
   Neuzeichnen, also irgendwann — und ein Versprechen, das später eingelöst
   wird, sieht aus wie ein Formular ohne Wirkung. `malenTabellen()` wird jetzt
   aus dem Eingabe-Rückruf mitgerufen; der Fokus ist dabei sicher, weil der
   Tabellenkasten außerhalb der Eingabezeilen liegt.
3. **Meldungen erreichten das Terminal im Gerätefenster nie.**
   *(Browser-Prüfstand.)* `app.js` fragte nur `panels.termNode` — das Terminal
   am Netzplan. Router, Switch und Heimrouter haben aber keinen Bildschirm, ihr
   Terminal steht als Reiter im **Gerätefenster**, und genau dort sucht man, was
   ein Router gelernt hat. Neu ist `termOffen(id)`, das beide Orte kennt.
   ⚠️ **Das betraf nicht nur RIP** — `dhcp-ok`, `unreachable` und `arp-fail`
   schrieben dort seit jeher nichts hin. Der Fehler ist also älter als diese
   Runde und wurde nur durch sie sichtbar.

### 6 · ⚠️ Zwei Fallen im Prüfstand selbst

* **`Mehr ›` ist ein UMSCHALTER und bleibt über den Gerätewechsel stehen.** Ein
  blinder Klick macht das Kärtchen deshalb je nach vorherigem Abschnitt groß
  ODER klein — der Prüfstand lief dann an einer Stelle ins Leere, die mit den
  neuen Sachen nichts zu tun hatte. Neu: `grossMachen()` sieht erst nach.
* **Das Terminal zeigt, was passiert, WÄHREND es offen ist.** Die erste Fassung
  der RIP-Prüfung ließ die Uhr laufen und machte danach das Gerätefenster auf —
  dann steht dort eine volle Tabelle und kein Wort darüber, woher sie kommt. Die
  Prüfung macht es jetzt so, wie eine Lehrkraft es machen würde: Router
  aufmachen, dann zusehen.

### Was offen blieb

* **Kein Szenario zu den drei Sachen.** Das ist die größte Lücke dieser Runde:
  ein Netz aus drei Netzen und zwei Routern, in dem man erst von Hand einträgt
  und dann den Haken setzt, wäre der Auftrag, der beides zusammenbindet. Dazu
  ein zweiter Auftrag am (weiterhin fehlenden) Heimrouter-Szenario: „der
  Webserver im Haus soll von draußen erreichbar sein."
* **`traceroute` wiegt jetzt schwerer.** Solange alle Wege eingetragen waren,
  war „welchen Weg nimmt das Paket" im Formular nachzulesen. Mit gelernten Wegen
  ist es eine echte Frage — und TTL liegt bereit.
* **Der Mitschnitt wird im Dauerbetrieb voll.** Zwei Router mit RIP erzeugen
  alle fünf Sekunden Ansagen, für immer. Der Ringpuffer (12000) fängt das ab,
  aber wer eine Stunde laufen lässt und dann nach dem Ping von vorhin sucht,
  findet ihn nicht mehr. Der Chip **RIP** lässt sich nicht negieren — ein
  „alles AUSSER RIP" wäre die eigentlich gebrauchte Geste. Rund zehn Zeilen.
* **Poison Reverse** fehlt (Filius hat es auch nicht), ebenso RIPv2 und die
  Unterscheidung Request/Response.

---

## 0d · Nachtrag: der Mitschnitt nach Filius (frühere Runde)

**558 kopflose + 547 Browser-Prüfungen grün** (vorher 520 + 528). Berührt:
`js/mitschnitt.js`, `js/panels.js`, `js/app.js`, `js/geraet.js`, `index.html`,
`css/app.css`, beide Prüfstände. Keine neue Datei.

Der Nutzer wollte den Mitschnitt gegen Filius abgeglichen wissen — „ob die
Schichten und sowas wie Three-Way-Handshakes eingebaut sind" — und fragte,
wo man das sieht: „bei Filius kann ich auf einzelne Geräte klicken und dann
dort die Kommunikation sehen. Ist das bei dir genauso?"

Der Abgleich ergab: **TCP war richtig** (SYN · SYN,ACK · ACK einzeln im
Mitschnitt, Sequenznummern zählen Bytes, Vier-Wege-Abbau — an einer Stelle
sogar genauer als Filius, das bei einem SYN+ACK das Wort ACK gar nicht
schreibt, nur die Nummer). **Drei andere Sachen stimmten nicht**, und daraus
wurde diese Runde.

### 1 · Der Gerätefilter war gebaut, aber nie angeschlossen

`filter.node` stand seit jeher in `mitschnitt.js`, und der Dateikopf behauptete
ausdrücklich „ein Klick auf ein Gerät auf der Fläche schränkt ein". Gerufen
wurde `setFilter` aber nur mit `text` und `proto` — **die Oberfläche hat das
nie getan.** Ein Kommentar ist keine Funktion.

Jetzt folgt der Mitschnitt der Auswahl, und zwar an genau zwei Stellen:

* **Entwurfsmodus** — `traceFolgen()` in `panels.js`, gerufen aus `showNode`,
  `dazuNode`, `showCable`, `closeKarte`, `nurBehalten`. Die Regel: **genau ein
  Kärtchen offen → dieses Gerät; keines oder mehrere → das ganze Netz.**
* **Aktionsmodus** — dort gibt es keine Kärtchen, also meldet `geraet.js`
  selbst über den neuen Rückruf `opts.onGeraet`. ⚠️ Die Meldung steht in
  `open()`/`close()` und **nicht** bei den neun Stellen, die `close()` rufen
  (Moduswechsel, Löschen, Rückgängig, Zurücksetzen, Szenario laden …). Neun
  Aufrufer an dieselbe Nebenpflicht zu erinnern ist die Sorte Buchhaltung, bei
  der beim zehnten einer fehlt.

In der Leiste steht dann das Chip *nur Endgerät 1 ×*, in der Akzentfarbe —
es ist der einzige Filter, den man nicht angeklickt hat, und man muss ihn
sehen, um ihn loszuwerden.

### 2 · Nur die Hälfte wurde aufgezeichnet

Filius zeichnet an jeder Netzwerkkarte **beide** Richtungen auf
(`Ethernet.java` beim Senden, `EthernetThread.java` beim Empfangen). Hier
lief nur `dir === 'out'` in die Liste — mit der damals richtigen Begründung,
dass sonst jeder Rahmen doppelt dasteht. Mit einem Gerätefilter kippt die
Rechnung: „was hat dieses Gerät gesehen" ist mit der halben Antwort keine.

Also: **aufgezeichnet wird beides, gefiltert wird beim Ansehen.** Voreinstellung
über das ganze Netz ist „nur gesendet" (sonst steht ein Rahmen zwei- bis
viermal da: Absender, Switch rein, Switch raus, Empfänger); bei gewähltem Gerät
kippt `setGeraet` die Richtung auf „beide". Der Knopf nennt die Zahl der
ausgeblendeten Zeilen — ein Filter, der nicht zeigt, wie viel er wegnimmt, ist
eine Falle.

⚠️ Zwei Folgen, die man leicht übersieht:

* Die Zusammenfassung des Flutens (`× 4`) vergleicht jetzt auch die
  **Richtung**. Ohne das verschmelzen Ankunft und Abgang am Switch zu einer
  Zeile — der Mitschnitt behauptete dann, ein Switch habe zweimal gesendet.
* Der Ringpuffer musste von 4000 auf **12000** wachsen. Derselbe Verkehr
  erzeugt jetzt zwei- bis dreimal so viele Zeilen; ohne die Anhebung wäre die
  sichtbare Vergangenheit um genau diesen Faktor kürzer geworden.

### 3 · Die Schichtenansicht — und drei falsche Schichtnummern

Neu ist der Knopf *Zeilen / Schichten*. „Schichten" ist Filius'
`LayeredMessageTable`: eine Zeile je Schicht, alle unter derselben Nummer, mit
seinen Spalten, seinen vier Schichtnamen (`rp_lauscher_msg8…11`) und seinen
Farben (`AggregatedMessageTable.LayerColorVar`).

⭐ Die Aussage, für die es sie gibt: **Quelle und Ziel wechseln mit der
Schicht** — MAC, dann IP, dann Portnummer, untereinander in derselben Spalte.

Gebaut ist es als **eine** Funktion für beide Ansichten: `layers()` liefert
jetzt neben `fields` (die aufklappbare Schale) auch `schicht`, `proto`,
`quelle`, `ziel`, `details` (die Tabellenzeile). Zwei getrennte Funktionen
wären zwei Wahrheiten über denselben Rahmen, und sie liefen beim ersten
Protokoll auseinander, das jemand nur an einer Stelle nachträgt.

Beim Einbauen fielen **drei falsche Schichtnummern** auf, alle aus demselben
Grund — „steckt in UDP/IP" war mit „ist auf derselben Schicht" verwechselt:

| | war | ist | warum |
|---|---|---|---|
| ICMP | 4 | **3** | kein Transportprotokoll: keine Ports, keine Verbindung, und es meldet Fehler der Vermittlung |
| DHCP | 4 | **7** | benutzt UDP, so wie HTTP TCP benutzt — und HTTP stand längst richtig auf 7 |
| DNS | 4 | **7** | dasselbe |

Dazu hatten **SMTP und POP3 gar keine Anwendungsschale** — aufgeklappt endete
ein Mailsegment bei TCP. Ausgerechnet die zwei Protokolle, die man im
Unterricht mitliest. Jetzt steht dort die Zeile, die über die Leitung ging.

⚠️ Die alte Browser-Prüfung hieß „Schicht 4 ist ICMP" und prüfte
`lagen[2].includes('ICMP')` — die **Nummer stand nur im Namen der Prüfung**,
nicht in der Bedingung. Sie war grün, während sie falsch war. Alle drei
Nummern werden jetzt mitgeprüft.

### 4 · ⚠️ Der Fehler dieser Runde: eine Leiste, die umbricht

Das neue Geräte-Chip ließ die Mitschnitt-Leiste umbrechen (`flex-wrap: wrap`).
Die Leiste steht mit der Zeichenfläche **in einem Raster**: wird sie höher,
wird die Fläche kürzer, und das SVG rechnet seinen Maßstab neu. Ein Gerät
antippen ließ also das Chip erscheinen, die Leiste umbrechen, die Fläche um
44 px schrumpfen — **und das gerade angetippte Gerät sprang unter dem Finger
weg.**

Gefunden hat es der Browser-Prüfstand: der Strg-Klick auf das zweite Endgerät
traf danach ins Leere. Mit dem Auge wäre es als „ruckelt manchmal"
durchgegangen.

Die Leiste ist jetzt **eine Zeile fester Höhe** (`height: var(--trace-head)`,
`flex-wrap: nowrap`, notfalls waagerecht scrollend). `--trace-head` war ohnehin
schon als feste Größe gedacht — das Terminal rechnet seinen Abstand damit.
Bisher war das eine Behauptung, jetzt ist es wahr. Nebenwirkung: die
Beschriftungen mussten kurz werden (*↑ gesendet +8*, *Schichten*), der ganze
Satz steht im Kurzhinweis.

### 5 · Eine Falle im Prüfstand, die zufällig hochging

Im Abschnitt „Subnetze" von `kerntest.js` stand eine **zweite Funktion `bau()`
in einem Block**. Die Datei läuft als Skript und nicht als Modul, also hebt
JavaScript sie an die Dateiebene — sie überschrieb die obere für alles, was
danach kommt. Der Fehler trifft damit nie den Abschnitt, der ihn enthält,
sondern den nächsten, den jemand unten anhängt, und er sieht aus, als sei
`Stack` kaputt.

Genau das ist beim Anhängen der neuen Prüfungen passiert. `heimBau()` weiter
unten war schon als Umgehung gebaut und im Kommentar erklärt. Jetzt heißt die
innere Funktion `bauSN()` und die Falle ist weg.

### Was offen blieb

* Die **aggregierte Ansicht** (Sequenzdiagramm mit Pfeilen zwischen
  Gerätespalten) fehlt weiter — das ist in Filius sogar die *voreingestellte*
  (`isOldExchangeDialog = false`), und es ist die Ansicht für den Beamer.
* Filius' **verschachtelte Kästen** (`MessageDetailsTable`) gibt es hier als
  aufklappbare Schalen, nicht als ineinandergezeichnete Rechtecke.
* Die Rahmennummer ist **global** und nicht je Karte von 1 an wie in Filius.
  Das ist Absicht: bei einer Liste über das ganze Netz sagen die Lücken
  („9, dann 16"), dass dazwischen anderswo etwas passiert ist. Filius' Zählung
  je Reiter macht den Vergleich zwischen Geräten unmöglich.

---

## 0e · Nachtrag: die Dienstmarken — was ein Gerät TUT (frühere Runde)

**520 kopflose + 528 Browser-Prüfungen grün** (vorher 504 + 498). Berührt:
`js/netz.js`, `js/flaeche.js`, `js/geraet.js`, `js/dienste.js`, `js/http.js`,
`js/mail.js`, `js/konfig.js`, `css/app.css`, beide Prüfstände. Keine neue Datei.

Drei Sätze vom Nutzer:

> „Der DNS soll auch ein Symbol unter sich bekommen wie der DHCP, sodass man
> sieht, dass es ein DNS ist. Die Funktion ‚alle Geräte einpflegen' soll weg —
> man trägt jedes Gerät ein. Mail Server und Webserver brauchen auch ein Symbol.
> Die sollen nur da sein, wenn sie **aktiv** sind. Also wirklich aktiv sind.
> Nicht nur installiert."

### 1 · Vier Marken statt einer

Unter der Kachel stand bisher **DHCP** (und WLAN mit dem Netznamen). Jetzt
stehen dort bis zu vier Pillen, jede in ihrer Farbe:

| Marke | Farbe | Bedingung |
|---|---|---|
| **DHCP** | Bernstein (`--dhcp`) | Server eingerichtet **und** aktiviert |
| **DNS** | Blau (`--dns`) | `dns` installiert **und** gestartet |
| **Web** | Petrol (`--web`, neu) | `webserver` installiert **und** gestartet |
| **Mail** | Magenta (`--mail`, neu) | `mailserver` installiert **und** gestartet |
| **WLAN** | Violett (`--wlan`) | strahlt aus, mit Namen |

Drei der Farben gab es schon als **Protokollfarbe im Mitschnitt**. Die Marke
nimmt dieselbe: die blauen Pakete laufen zum blauen Gerät — das ist die Antwort
auf „wer hat das eigentlich beantwortet", ohne ein Wort dafür.

Auf der Pille steht die **Kurzform** („Web", nicht „Webserver"). Mit den Namen
aus der Software-Installation wäre eine einzige Marke breiter als die Kachel,
und ein Schulserver trägt leicht drei davon. Der ganze Satz steht im
Kurzhinweis: *„Auf diesem Gerät läuft ein Webserver: er liefert Seiten aus."*

### 2 · ⭐ Die Regel, um die es ging: installiert ist nicht aktiv

`netz.dienstLaeuft(node, art)` — **drei** Bedingungen: das Programm ist
installiert, es ist **gestartet**, und das Gerät ist an. `laufendeDienste(node)`
gibt sie in fester Reihenfolge zurück (dhcp · dns · web · mail), damit die
Pillen nicht die Plätze tauschen, wenn eine dazukommt.

⚠️ **Die Funktion steht in `netz.js` und nirgends sonst.** Dieselbe Frage
stellen zwei ganz verschiedene Stellen: die Simulation („wer lauscht auf welchem
Port?", `dienste.sync`) und die Fläche („was schreibe ich unter die Kachel?").
`http.laeuft` und `mail.laeuft` sind seither nur noch Weiterleitungen dorthin,
und `dienste.sync` fragt für DHCP und DNS ebenfalls dort nach. Zwei Stellen mit
derselben Frage laufen beim nächsten Dienst auseinander — und **dieser Fehler
meldet sich nicht**: eine Marke, die etwas behauptet, was nicht läuft, schickt
die Fehlersuche genau dorthin, wo nichts zu finden ist.

Was `sync()` davorbehält, ist nur die **Uhr** (`laeuft` in `dienste.js`): im
Entwurfsmodus lauscht niemand, die Marke steht trotzdem da. Sonst wäre „welches
Gerät ist der DNS-Server" in genau dem Modus unbeantwortbar, in dem man das Netz
baut.

### 3 · ⚠️ Der Weg vom Knopf zur Fläche — `dienstGeschaltet()`

`opts.onDirty` speichert und merkt den Schritt für Strg+Z, aber es **zeichnet
die Fläche nicht neu**. Ohne einen zweiten Aufruf erschien die Marke erst beim
nächsten beliebigen Neuzeichnen, also irgendwann — und „Starten" sähe aus wie
ein Knopf ohne Wirkung.

Deshalb gibt es in `geraet.js` **eine Tür** für alles, was einen Dienst
umlegt — `dienstGeschaltet()` (sync + Fläche neu). Durch sie gehen: der Knopf
*Starten/Beenden* im DNS-Fenster, `webCtx().sync` (und damit die Knöpfe in
`prog-web.js` und `prog-mail.js`), das **Aufspielen** und das **Entfernen** im
Appstore. Der DHCP-Haken in `konfig.js` hatte seinen `redraw()` schon.

### 4 · Der Knopf „Alle Geräte eintragen" ist weg

Er trug jedem Gerät mit Adresse auf einmal einen Namen ein — begründet mit der
gesparten Tipparbeit. Er nahm damit **genau die Arbeit ab, die die Aufgabe
IST**: wer die Liste von Hand führt, merkt, dass sie jemand führen muss und dass
ein Tippfehler darin ein fehlerfreies Netz lahmlegt. Dieselbe Regel wie beim
leeren Heimrouter — ein ausgefülltes Feld ist eine vorweggenommene Antwort.

Mit ihm fiel `konfig.namensform()` weg (es hatte genau diesen einen Aufrufer)
und `.k-row` im CSS. Eine Browser-Prüfung wacht darüber, dass der Knopf nicht
zurückkommt: ein Bequemlichkeitsknopf entsteht beim nächsten Umbau leicht wieder.

### 5 · ⚠️ Zwei Dinge, die wieder nur das BILD entschieden hat

* **Der Umbruch trennte „Mail" ab.** Bei einem Maß von 104 Punkten je Reihe
  ergab DNS · Web · Mail (105) eine volle Zeile plus eine einzelne Pille
  darunter — das liest sich als Nachtrag, nicht als dritte Aussage. Jetzt
  **112**, und die Zahl der Zeilen wird **vor** der Aufteilung bestimmt
  (`Math.ceil(ges / MARK_BREIT)`), damit vier Marken **zwei und zwei** werden
  statt drei und eine. Nebenbei steht der Heimrouter damit wieder wie vorher da:
  DHCP und „Zuhause" in einer Reihe.
* **Magenta und Petrol waren im Dunkelmodus zu blass** (`#f088cc` / `#3fc2d4`).
  Die Marken tragen weiße Schrift; auf dem Bild war „Mail" kaum noch zu lesen,
  auf einem Beamer erst recht nicht. Jetzt liegen beide in der Helligkeit bei
  `--wlan`, wo Weiß trägt.

### 6 · Prüfstände

* **Kopflos:** ein eigener Abschnitt *Dienstmarken* (alle vier Dienste, die
  feste Reihenfolge, deinstalliert-aber-`on`, Gerät aus, unbekannte Art) — und
  im Abschnitt *Software* steht `dienstLaeuft` jetzt **Zeile für Zeile neben**
  der Frage, ob der Dienst wirklich antwortet. Beide Antworten müssen dieselbe
  sein; getrennt geprüft wäre genau die Lücke offen, um die es hier geht.
* **Browser:** `markenAn(page, name, art)` zählt die Pillen an einer Kachel.
  ⚠️ Eingeschränkt auf `.nf` — die Subnetzliste benutzt `data-node` für ihre
  Chips ebenfalls. Geschaltet wird in den Prüfungen über den **Knopf**, nicht
  über das Modell: der Weg dazwischen ist das, was ausfallen kann. (Wo der
  Aufbau eines Abschnitts den Dienst per `page.evaluate` startet, weiß die
  Fläche nichts davon — das ist in Ordnung, ein Kind kann nur den Knopf
  drücken.)

---

## 0f · Nachtrag: E-Mail — SMTP, POP3 und der MX-Eintrag (frühere Runde)

**504 kopflose + 498 Browser-Prüfungen grün** (vorher 483 + 483). **Zwei neue
Dateien:** `js/mail.js` (Protokolle und Dienst) und `js/prog-mail.js` (die zwei
Fenster). Berührt: `js/dienste.js` (MX im DNS), `js/netz.js`, `js/geraet.js`
(MX-Liste im DNS-Fenster), `js/mitschnitt.js`, `css/app.css`, `index.html`,
beide Prüfstände.

**Stufe 4** — und damit sind alle vier Stufen des Auftrags „mehr Programme auf
dem PC" gebaut. Auf einem Endgerät liegen jetzt bis zu **acht** Kacheln.

### 1 · Zwei Protokolle, zwei Ports, zwei Aufgaben

**SMTP (25)** bringt eine Nachricht HIN, **POP3 (110)** holt sie AB. Dazwischen
liegt die Aussage, die im Unterricht am meisten überrascht und die dieses
Programm zum ersten Mal zeigen kann: **eine E-Mail wird nicht zugestellt, sie
wird abgeholt.** Sie liegt auf dem Server, bis jemand danach fragt — der
Browser-Prüfstand prüft genau das (Posteingang beim Empfänger leer, obwohl die
Nachricht beim Server schon im Postfach liegt).

Beide sind **Zeilendialoge aus lesbarem Text**, und jede Zeile geht als eigenes
Segment hinaus. Im Mitschnitt steht `MAIL FROM: <anna@schule.de>` und darunter
`250 OK` — man liest das Gespräch mit, ohne dass es jemand übersetzt.

⭐ **Und deshalb steht `PASS birne` im Klartext im Mitschnitt.** Das ist kein
Mangel der Nachbildung — das IST POP3, und es ist eine der wenigen Stellen, an
denen Sicherheit ohne Zusatzstoff vorkommt. Beide Prüfstände sichern es ab.

### 2 · Der MX-Eintrag — DNS zum zweiten Mal

Post an eine **fremde** Domain reicht der eigene Server weiter. Dafür muss er
erst herausfinden, WER dort zuständig ist: ein **MX-Eintrag** im DNS. Das ist
der Punkt, an dem DNS ein zweites Mal gebraucht wird — und diesmal nicht, um
eine Zahl zu sparen, sondern um eine **Zuständigkeit** nachzuschlagen.

* `resolve(node, name, cb, typ)` kennt jetzt `'A'` (Vorgabe) und `'MX'`. ⚠️ Der
  **Zwischenspeicher gilt nur für A**: ein MX-Ergebnis ist ein NAME und keine
  Adresse, und beides in einer Tabelle wäre der Fehler, bei dem später
  `www.schule.de` als Mailserver herauskommt.
* Im DNS-Fenster gibt es dafür die Liste **Mailaustausch (MX)** mit *Maildomain*
  und *Domainname Mailserver* — Filius hat dafür einen eigenen Reiter, hier
  steht sie unter „Adressen (A)".
* ⚠️ Der **Server selbst braucht einen DNS-Server** (`node.dns`), sonst kann er
  nicht weiterreichen. Das ist leicht zu übersehen: bisher brauchten nur
  Endgeräte einen.

### 3 · ⚠️ Zwei Fehler im Schrittwerk, beide vom Prüfstand

1. **Das HELO fiel ganz aus.** Das Gespräch war als Liste „erwarte X, sende Y"
   gebaut — und der Code sendete das Y des NÄCHSTEN Schritts. Auf die Begrüßung
   ging gleich `MAIL FROM` hinaus, alles lief einen Schritt versetzt, und es
   scheiterte erst drei Zeilen später an `354`. Der Fehler ist harmlos zu
   beheben und unmöglich zu sehen, wenn man nur auf das Ergebnis schaut.
2. **POP3 verschluckte die Zeile „+OK Nachricht folgt"** und schrieb sie als
   erste Zeile IN den Brief. Ursache: die Schleife („so oft holen, wie es
   Nachrichten gibt") war in dieselbe Schrittliste gezwängt. Jetzt ist das
   Abholen ein **ausgeschriebener Zustandsautomat** und das Senden bleibt eine
   Liste — die zwei sind verschieden genug, dass ein gemeinsamer Mechanismus
   nur Schaden anrichtet.

⚠️ Dazu ein Fehler, der beim Umbau entstand und **nur durch das Mitlesen des
Mitschnitts** auffiel: aus `split(/\s+/)` war `split(/s+/)` geworden (ein
Backslash beim maschinellen Einsetzen verloren). Folge: `+OK 1` wurde als „0
Nachrichten" gelesen, POP3 sagte sofort `QUIT`, und alles blieb grün außer der
einen Zählprüfung. **Wer Code über ein Skript einsetzt, muss die Regexe
danach ansehen.**

### 4 · Im Mitschnitt

`protoOf` liefert **SMTP** und **POP3** — erkannt am Port, aber **nur bei
Segmenten mit Inhalt**. Handschlag, Bestätigungen und Abbau bleiben TCP, so wie
es auch ein echter Mitschnitt hält; sonst zeigte der Chip „SMTP" zur Hälfte
Segmente ohne ein einziges Wort SMTP darin. In der Zeile steht die Zeile, die
über die Leitung geht. Zwei neue Chips, und die DNS-Zeile unterscheidet jetzt
die beiden Fragen („welche Adresse hat …" ↔ „wer nimmt die Post für …").

### Was beim Prüfen auffiel

* **Acht Kacheln auf einem Endgerät** (drei feste, fünf installierbare). Bei
  1500 × 950 passen sie ohne Bildlauf, bei 820 × 1180 (Tablet hochkant) auch —
  gemessen, nicht geschätzt. Der **Schnellzugriff unten läuft dort aber über**
  und muss gewischt werden; er hat `overflow-x: auto`, also funktioniert es,
  sieht aber eher nach „abgeschnitten" aus als nach „hier geht es weiter". Ein
  Verlauf am Rand wäre die Antwort. Steht in Abschnitt 3.
* Eine Browser-Prüfung hing daran, dass auf Endgerät 2 vorher **nichts**
  installiert war (`software.length === 0`). Seit die Mail-Prüfung dort ein
  Programm aufspielt, zählt sie den DNS-Eintrag statt der Listenlänge.
  ⚠️ **Lehre: eine Prüfung, die eine LÄNGE zählt, gehört einem Zustand, den
  niemand sonst anfasst** — und in einem Prüfstand, der ein einziges Netz durch
  zwanzig Abschnitte trägt, gibt es den nicht.

---

## 0g · Nachtrag: Webserver und Webbrowser (frühere Runde)

**483 kopflose + 483 Browser-Prüfungen grün** (vorher 442 + 464). **Zwei neue
Dateien:** `js/http.js` (Protokoll und Dienst) und `js/prog-web.js` (die zwei
Fenster). Berührt: `js/dienste.js`, `js/netz.js`, `js/geraet.js`,
`js/mitschnitt.js`, `js/szenarien.js`, `css/app.css`, `index.html`, beide
Prüfstände.

**Stufe 3** des Auftrags — der Punkt, an dem der Simulator zum ersten Mal zeigt,
was ein Kind täglich tut, und der erste Auftrag, bei dem es etwas HERSTELLT,
das es danach ansehen kann.

### 1 · Eine Seite sind mehrere Anfragen

Die Lernaussage dieser Runde, und der Grund, warum die Standardseite aus **drei**
Dateien besteht (Filius liefert zwei): `index.html` holt über `<link>` die
Stildatei und über `<img>` das Bild nach. Unter der Seite steht deshalb eine
Reihe Marken — `/ 200` · `/stil.css 200` · `/logo.png 200` — und darunter der
Satz „3 Anfragen für eine Seite". Fehlt das Bild, ist genau **eine** davon rot,
und der Rest der Seite steht trotzdem da.

**Eine Verbindung je Anfrage** (HTTP/1.0, wie in Filius): der Server schließt,
sobald er geantwortet hat. Der Preis steht im Mitschnitt (siehe unten), der
Gewinn ist, dass „aufbauen · fragen · antworten · schließen" eine vollständige
Geschichte ist, die dreimal nebeneinander steht.

### 2 · Die Seite wird in einem `<iframe sandbox srcdoc>` gezeigt

Die Entscheidung mit den meisten Folgen. Vier Gründe, alle im Kopf von
`prog-web.js`:

1. Echtes HTML und echtes CSS **ohne eigenen Renderer**.
2. `sandbox` **ohne `allow-scripts`** heißt: JavaScript läuft nicht. Der Wunsch
   („der akzeptiert kein JS") ist damit eine Eigenschaft der Umgebung und keine
   Prüfung, die man umgehen kann. `http.js` ersetzt Skriptblöcke zusätzlich durch
   einen Kommentar — ⚠️ **das ist die Auskunft, nicht die Sicherung.**
3. Kein Weg in die Oberfläche: CSS der Schülerseite erreicht den Simulator nicht.
4. **Nichts verlässt den Rechner.** Was die Seite nachlädt, hat der Simulator
   schon geholt und steht als `<style>` bzw. als Daten-URI drin; der echte
   Browser stellt keine einzige Anfrage ins Netz.

Der Browser-Prüfstand sichert alle vier: er schreibt ein `<script>` in die Datei,
das die Überschrift überschreiben würde, und prüft danach, dass sie unverändert
dasteht — dazu `sandbox === ''`, das geladene Bild (`naturalWidth > 0`) und die
Farbe der Überschrift (also dass die Stildatei wirklich gewirkt hat).

### 3 · Wo alles andockt

* **`dienste.js` erzeugt `http`** und schaltet den Webserver in `sync()` an und
  ab — installiert UND gestartet, dasselbe Muster wie DNS. `dienste.http` ist
  zugleich der Weg, über den die Fenster an das Protokoll kommen.
* **`netz.webConf(node)`** ist der Schalter (`{ on: false }`), gespeichert wie
  `dnsServer`. Ordner und Port stehen NICHT darin: sie sind festgelegt und
  stehen im Fenster als **Angabe**, nicht als Feld — wie in Filius.
* **`BEIM_AUFSPIELEN`** in `geraet.js`, das Gegenstück zu `STOPPT`: beim
  Installieren entstehen Ordner und Standardseite (`WebServer.java` tut genau
  das). Beim Entfernen bleiben die Dateien liegen — ein Rechner vergisst seine
  Dateien nicht, wenn ein Programm geht.
* Ein Klick auf eine Datei im Webserver-Fenster **springt in den
  Datei-Explorer** (`ProgDateien.zeigen` + `ctx.starte('dateien')`). Das ist der
  kürzeste Weg von „mein Server läuft" zu „das ist meine Seite".

### 4 · Der Mitschnitt spricht jetzt HTTP

`protoOf` liefert **HTTP**, sobald in einem TCP-Segment eine HTTP-Nachricht
steckt — erkannt am Inhalt und nicht an der Portnummer (ein Webserver auf 8080
ist immer noch einer). In der Zeile steht dann die Anfragezeile
(`GET /stil.css`) bzw. die Antwortzeile (`200 OK text/css, 177 Byte`) statt
Portnummern und Flags; die stehen weiter in der aufgeklappten Schale, und
darunter gibt es jetzt eine fünfte: **HTTP** mit Art, Pfad, Host bzw. Antwort,
Inhaltstyp, Länge und den ersten 60 Zeichen des Inhalts.

⚠️ **Die Zahl, die dabei herauskam: eine Seite über einen Router sind 152
Zeilen im Mitschnitt.** Mit dem Chip **HTTP** sind es 24, mit zusätzlichem
Gerätefilter 6. Das ist benutzbar, aber es ist die Bestätigung des offenen
Punktes aus der TCP-Runde: ein Schalter „nur Absender und Empfänger" würde die
24 auf 6 bringen, ohne ein Gerät auszuwählen. Rund 30 Zeilen; steht in
Abschnitt 3 als Entscheidung, nicht als Reparatur.

### 5 · Szenario 7 — „Eine Seite im Schulnetz"

Drei Aufträge, jeder fügt genau eine Sache hinzu: über die **Adresse** aufrufen
(geht der Server?), den **Namen** eintragen (wozu DNS?), die **Datei** ändern
(es ist eine Datei auf einem Rechner). Webserver und Browser sind schon
installiert — das Aufspielen hat Szenario 6 gezeigt, und zwei Lernsachen in
einem Auftrag sind eine zu viel. Der DNS-Server kommt **leer**.

⚠️ Der kopflose Prüfstand spielt alle drei Aufträge durch. Ein Szenario, dessen
Auftrag 1 nicht funktioniert, merkt sonst erst die Klasse. Dabei fällt als
Nebenertrag eine hübsche Prüfung ab: nach Auftrag 3 ist es nur noch **eine**
Anfrage, weil die neue Seite nichts mehr nachlädt.

`dev()` in `szenarien.js` kann jetzt `webServer` und `dateien` — ein Szenario
mit einem laufenden Webserver muss seine Seite mitbringen, weil die
Installation sie nur beim Aufspielen anlegt.

### ⚠️ Der Fehler dieser Runde: schon wieder `.k-add`

**Die Adresszeile des Browsers war unsichtbar.** „Start" ist ein `.k-add`, und
das ist ein Blockknopf über die ganze Breite — genau derselbe Fehler wie eine
Stufe zuvor in der Editorleiste, und wieder haben ihn beide Prüfstände grün
gemeldet. Die Rücknahme steht jetzt an **einer** Stelle und sammelt die Reihen
(`.fx-knoepfe`, `.fx-leiste`, `.wb-leiste`); wer eine neue Reihe mit `.k-add`
baut, trägt sie dort ein.

⭐ Und diesmal gibt es eine Prüfung dagegen, die nicht auf ein Bild wartet: der
Browser-Prüfstand **misst**, dass die Adresszeile breiter ist als der Knopf
daneben.

---

## 0h · Nachtrag: das Dateisystem und seine drei Ansichten (frühere Runde)

**442 kopflose + 464 Browser-Prüfungen grün** (vorher 384 + 437). **Zwei neue
Dateien:** `js/dateien.js` (304 Zeilen, Modell) und `js/prog-dateien.js`
(488 Zeilen, die Fenster). Berührt: `js/netz.js`, `js/geraet.js`,
`js/terminal.js`, `js/app.js`, `css/app.css`, `index.html`, beide Prüfstände.

Das ist **Stufe 2** des Auftrags „mehr Programme auf dem PC" — nach TCP die
zweite Voraussetzung für alles Weitere: Webserver-Inhalte, E-Mail-Anhänge und
vier der dreizehn Filius-Anwendungen hängen daran.

### 1 · Flach statt Baum

`node.dateien` ist eine Zuordnung **Pfad → Eintrag**, kein Baum:

```js
{ '/webserver': { ordner: true },
  '/webserver/index.html': { text: '<html>…' },
  '/webserver/logo.png':   { bild: '@schule' } }
```

Der Grund ist das Speicherformat: das IST schon JSON und geht ohne Übersetzung
durch `toJSON`/`fromJSON`, durch Strg+Z und durch Kopieren und Einfügen. Ein
Baum bräuchte an jeder dieser vier Stellen eine. Was ein Baum besser kann —
einen Ast woanders hinhängen — gibt es hier nicht; umbenennen zieht die Kinder
mit, und das sind acht Zeilen.

⚠️ **Ein Ordner ist ein eigener Eintrag** (`ordner: true`) und nicht bloß ein
Pfadanfang. Sonst gäbe es keinen **leeren** Ordner — und genau der ist der erste,
den ein Kind anlegt.

⚠️ **Ein neues Gerät hat NICHTS**, kein `/home`, kein `/eigene`. So ist es auch
in Filius (`Dateisystem.java`: der Baum besteht aus `root` und sonst nichts), und
es ist dieselbe Regel wie beim leeren Heimrouter. Ordner entstehen mit der
Installation eines Programms — `/webserver` kommt in Stufe 3.

**Kopieren und Einfügen:** Dateien kommen **mit**, die MAC-Adresse nicht. Eine
doppelte MAC ist der Fehler, den niemand findet; ein zweiter Webserver mit
leerem Ordner wäre dagegen eine Überraschung.

**Bilder** sind vier eingebaute SVGs (`@schule`, `@foto`, `@logo`, `@smiley`) als
Daten-URI — derselbe String passt in den Bildbetrachter, später in `<img src>`
des Webbrowsers und in einen E-Mail-Anhang. Die Einfuhr echter Dateien (Filius
kann das, mit 150 KB Deckel) fehlt weiter; der ganze Stand liegt im
localStorage.

### 2 · Ein Programm, drei Ansichten

⚠️ **Die größte bewusste Abweichung dieser Runde.** In Filius sind das DREI
Einträge in `Desktop_de_DE.txt`, die man einzeln installiert und startet — und
der Datei-Explorer kann dort **gar keine Datei öffnen**: kein Doppelklick,
nichts. Text-Editor und Bildbetrachter bringen je einen eigenen
Dateiauswahldialog mit (`DMTNFileChooser`), in dem man sich erneut durch den
Baum klickt. Das Handbuch muss deshalb ausdrücklich erklären, dass man zum
Bearbeiten der `index.html` zusätzlich einen Texteditor installiert.

Hier ist es **eine** Kachel ohne `install: true` (der Explorer ist von Anfang an
da), und ein Klick auf eine Datei öffnet sie. Gespart: zwei Kacheln, ein Dialog,
eine Erklärung.

Gefragt wird **in der Zeile** — Löschen wie Umbenennen, kein `confirm()`, kein
`prompt()`. Derselbe Grund wie im Appstore: der Browser-Prüfstand nimmt Dialoge
automatisch an und wäre dort blind.

### 3 · Der Editor: ein Spiegel unter dem Eingabefeld

Durchsichtiges `<textarea>` über einem eingefärbten `<pre>`. ⭐ **Das Verfahren
steckte schon im Programm** — `konfig.malen()` legt genau so die zweifarbige IP
hinter das Adressfeld.

* Vier Sorten, in **beiden** Sprachen mit derselben Bedeutung: Marke/Selektor
  (blau), Attribut/Eigenschaft (violett), Wert (orange), Text. ⚠️ Bei CSS war es
  eine Runde lang umgekehrt — dann lernt ein Kind beim Wechsel von der Seite zur
  Stildatei zweierlei.
* **JavaScript wird durchgestrichen und blass** gezeichnet, samt seiner Marken,
  dazu ein Satz unter dem Feld. Es steht da, es wird gespeichert, es wird nur
  nicht ausgeführt — ohne diese Auskunft sucht ein Kind den Fehler im eigenen
  Skript.
* ⚠️ **Spiegel und Feld müssen Zeichen für Zeichen dieselben Maße haben**
  (Schrift, Zeilenhöhe, Innenabstand, Umbruch). Weicht etwas ab, wandert der
  Textcursor von seiner Farbe weg, und zwar umso weiter, je länger der Text ist.
  Eine Browser-Prüfung vergleicht die berechneten Stile und die Position.
* Das **abschließende Leerzeichen** in `faerben()` ist kein Versehen: ohne es
  endet der Spiegel eine Zeile früher, sobald der Text mit einem Umbruch aufhört.
* **Zurückgehen sichert den Text auch ohne Klick auf *Speichern*** — ebenso das
  Schließen des Programms (`PROGRAMME.schliessen` bekommt dafür jetzt das Gerät
  übergeben). Ein getippter Text, der beim Zumachen weg ist, wäre der teuerste
  Fehler dieses Programms.

### 4 · Sieben Befehle mehr im Terminal

`pwd` · `ls`/`dir` · `cd` · `cat`/`type` · `mkdir` · `touch` · `rm`/`del`. Der
aktuelle Ordner steht in der Sitzung des Geräts, nicht am Gerät. ⚠️ Wer den
Ordner löscht, in dem er steht, landet eine Stufe höher — sonst scheitert der
nächste Befehl an etwas, das mit ihm nichts zu tun hat.

⚠️ **`Terminal` hat einen fünften Parameter bekommen** (`opts.onDirty`): seit es
`mkdir` gibt, ändert auch das Terminal den Stand, und das gehört in den Verlauf.
Vorher war es ein reines Auskunftsprogramm.

### ⚠️ Zwei Fehler, beide nur im BILD zu sehen

1. **`.k-add` ist ein Blockknopf** (`display:block; width:100%`) — so steht er im
   Einstellformular unter einer Liste. In der Editorleiste nahm er die ganze
   Zeile: „Speichern" war so breit wie das Fenster, und **der Dateiname war
   ganz verschwunden**. Beide Prüfstände grün. Jetzt nimmt
   `.fx-knoepfe .k-add, .fx-leiste .k-add` das zurück.
2. **„Anlegen" war rot.** Rot heißt auf dieser Oberfläche „nimmt etwas weg"
   (deinstallieren, löschen) — unter einem Knopf, der etwas ANLEGT, sagt es das
   Gegenteil. Neu: `.sw-ok` in der Akzentfarbe für Anlegen und für das OK beim
   Umbenennen; `.sw-ja` bleibt dem Entfernen. Eine Browser-Prüfung vergleicht
   die Farbe gegen die des Löschknopfes (und nicht gegen einen Zahlenwert — der
   wäre beim nächsten Themenwechsel falsch).

### Was dabei noch auffiel

* **`prog-dateien.js` wird vom KOPFLOSEN Prüfstand geladen**, obwohl es eine
  Browser-Datei ist. Grund: der Zerteiler für die Hervorhebung ist pure
  Zeichenkettenarbeit, und ihn durch einen echten Browser zu prüfen wäre teurer
  und ungenauer. Das geht nur, weil die Datei beim **Laden** kein DOM anfasst —
  wer das ändert, muss sie dort herausnehmen.
* Der **Editor ist schmal** (~330 px), weil das Gerätefenster 56 % der Fläche
  einnimmt und die Symbolspalte davon 176 px. Eine HTML-Zeile bricht damit
  mitten im Attribut um. Das ist die schon bekannte offene Ecke „Gerätefenster
  wird eng" — mit dem Editor wiegt sie schwerer als vorher.

---

## 0i · Nachtrag: TCP — und damit die Ports (frühere Runde)

**384 kopflose + 437 Browser-Prüfungen grün** (vorher 345 + 426). **Eine neue
Datei: `js/tcp.js`** (~430 Zeilen). Berührt: `js/schichten.js`, `js/nat.js`,
`js/dienste.js`, `js/mitschnitt.js`, `js/terminal.js`, `js/flaeche.js`,
`css/app.css`, `index.html`, beide Prüfstände.

Das ist **Stufe 1** des Auftrags „mehr Programme auf dem PC". Sie ist die Lücke,
an der sieben der dreizehn Filius-Anwendungen hängen — ohne TCP kein Webserver,
kein Webbrowser, keine E-Mail.

### Wo TCP andockt (drei Stellen, mehr nicht)

1. **Erzeugt wird es in `Stack`**, genau wie `nat.js`:
   `window.Tcp.erzeugen(engine, netz, { sendIp, say, PROC })`. ⚠️ Das steht ganz
   oben in `Stack`, obwohl `sendIp` und `say` erst weiter unten stehen — beides
   sind Funktions-DEKLARATIONEN und damit schon da. Es braucht deshalb **keine**
   Registrierungs-Schnittstelle und keine Verdrahtung in `app.js`.
2. **Der Rückweg ist eine Zeile** in `handleIpLocal`:
   `if (pkt.proto === 'tcp' && tcp) { tcp.empfangen(...); return; }`
3. **`dienste.sync()`** ruft `stack.tcpAufraeumen(node)` für alles, was aus ist.
   Das gehört dorthin und nicht an den Ausschalter: `sync()` räumt nach jedem
   Ein- und Ausschalten ohnehin auf, und eine zweite Stelle wäre die, die man
   beim nächsten Umbau vergisst.

### Was das Modell kann und was bewusst fehlt

Dreiwege-Handschlag, Datenübertragung mit Bestätigung, Vier-Wege-Abbau, **RST**
auf einen Port ohne Zuhörer, **eine** Wiederholung je unbestätigtem Segment.
Sequenznummern zählen **Bytes**, SYN und FIN verbrauchen je eine — nur so geht
die Rechnung „Seq 1000, 24 Byte, also als Nächstes 1024" im Mitschnitt auf.
Anfangsnummer vierstellig und gewürfelt (echt sind es 32 Bit), damit sie ablesbar
bleibt.

Nicht da, und im Dateikopf begründet: Fenstergröße und Flusskontrolle,
Überlastregelung, selektive Bestätigung, ein Puffer für Segmente in falscher
Reihenfolge, TIME-WAIT.

⚠️ **`TCP_FRIST = 3 s` muss über der Geduld von ARP liegen** (0,8 s × 3 = 2,4 s).
Wäre sie kürzer, ginge ein zweites SYN hinaus, während ARP noch fragt — im
Mitschnitt stünde ein Verlust, den es nie gab. Und sie muss unter dem bleiben,
was ein Mensch aushält (Tempo 0,1 macht aus 3 s eine halbe echte Minute). Zwei
kopflose Prüfungen bewachen beide Richtungen. **Eine** Wiederholung, nicht drei:
die Lehre steht nach der ersten, die zweite kostet nur Wartezeit.

### Ports sichtbar — zwei Rücknahmen und ein neuer Befehl

* **Die UDP-Schale im Mitschnitt ist zurück** (sie war vom 2026-09-24 bis
  2026-09-26 draußen), dazu eine neue **TCP-Schale** mit Ports, Flags,
  Sequenz- und Bestätigungsnummer. Begründung des Nutzers: mit HTTP und E-Mail
  IST der Port der Unterrichtsgegenstand. Stünde er bei TCP, aber nicht bei
  DHCP, hätte dasselbe Wort in zwei Zeilen zwei Sichtbarkeiten.
* **`netstat`** im Terminal — der Befehl, der die Frage beantwortet, an der in
  Filius das Ausprobieren anfing: *wer hört auf dieser Nummer?* Mit einer Spalte
  **Programm**, die Filius nicht hat.
* Neuer Filterchip **TCP**, eigene Farbe für den fliegenden Punkt — **hohl** beim
  Handschlag und beim Abbau, gefüllt bei Daten. Keine zweite Farbe, sondern
  dieselbe in anderer Form, und sie behauptet das Richtige: ein SYN trägt kein
  einziges Byte.
* `listen()` nimmt jetzt einen vierten Parameter: den **Programmnamen**. Er
  dient nur der Auskunft, deshalb steht er in einer eigenen Tabelle
  (`state.sockNamen`) und nicht im Behandler.
* **NAT übersetzt jetzt auch TCP-Ports** (`nat.js`, zwei Zeilen). Ohne das käme
  aus dem Internet keine Antwort zurück — und es ist zugleich die Vorarbeit für
  die Portfreigabe: die ist nichts anderes als eine Zeile in derselben Tabelle,
  von Hand eingetragen statt beim Hinausgehen entstanden.

### ⚠️ Drei Fehler — und wer sie gefunden hat

1. **Der Abbau endete mit einem RST statt mit einem ACK.** *(Prüfstand.)* Der
   erste Entwurf warf die Verbindung weg, sobald das eigene FIN bestätigt war —
   also bevor das FIN der Gegenseite ankam. Das traf dann auf eine Verbindung,
   die es nicht mehr gab. **Genau dafür hat das echte TCP seinen
   TIME-WAIT-Zustand.** Jetzt zwei Merker (`finRein`, `finRaus`), weggeworfen
   wird erst, wenn beide ihr FIN geschickt haben und nichts mehr offen ist.
2. **Eine Prüfung, die ARP getestet hat statt TCP.** *(Beim Hinsehen.)* Sie
   setzte den Kabelverlust auf 1, BEVOR die Verbindung stand — verloren ging die
   ARP-Anfrage, wiederholt hat ARP, und das SYN lag derweil in dessen
   Warteschlange. Grün, aber ohne Aussage. Der Verlust muss **nach** dem
   Handschlag anfangen. Dieselbe Falle wie damals bei der Ping-Frist: *was ARP
   ausbügelt, sieht aus, als hätte es TCP getan.*
3. **Der Mitschnitt zog zwei VERSCHIEDENE Bestätigungen zu „× 2" zusammen.**
   *(Nur das Bild.)* Beim Abbau schickt eine Seite zwei ACKs in derselben
   Mikrosekunde (eines für die Daten, eines für das FIN); im Text unterscheiden
   sie sich nicht, nur in der Bestätigungsnummer. Zusammengefasst behauptete der
   Mitschnitt, derselbe Rahmen sei zweimal gegangen. **Verglichen wird jetzt der
   RAHMEN und nicht sein Text** (`sig()` in `mitschnitt.js`, gerechnet erst,
   wenn Zeit, Gerät und Text schon gleich sind — also so gut wie nie). Die
   Gegenprobe steht daneben: ein Rundruf über einen Switch gehört weiterhin in
   EINE Zeile.
   ⭐ Und dann zeigte dasselbe Bild den Anschlussfehler: zwei Zeilen, die
   Zeichen für Zeichen gleich aussehen, liest ein Kind als Anzeigefehler.
   Deshalb steht die **Bestätigungsnummer jetzt in der Zeile** („bestätigt
   8396"), nicht nur in der aufgeklappten Schale.

### ⚠️ Und einer, den erst das Bild im Gerätefenster zeigte

**`netstat` brach im schmalen Fenster um.** Filius' Kopfzeile (Proto · Lokale
Adresse · Entfernte Adresse · Zustand) ist 72 Zeichen breit; das Terminal steht
aber auch IM Gerätefenster, und das ist rund 330 px schmal. Aus jeder Zeile
wurden zwei, von einer Tabelle war nichts mehr zu erkennen. Jetzt vier Spalten
(**Proto · Port · Zustand · Programm**, ≤ 46 Zeichen), die eigene Adresse steht
in der Kopfzeile des Geräts und nicht in jeder Zeile, und die Gegenstelle
bekommt eine Folgezeile — die es nur gibt, wo es sie wirklich gibt. Eine
Browser-Prüfung misst die Zeilenlänge.

⚠️ **Dasselbe Problem hat `route` (72 Zeichen) und es ist NICHT behoben** — es
ist älter als diese Runde und betrifft eine Tabelle, deren Spalten aus Filius
stammen. Wer es anfasst, sollte beide Befehle zusammen umbauen.

### Was der Mitschnitt jetzt braucht

Ein Segment steht **einmal je Sprung** darin (Endgerät → Switch → Router →
Switch). Bei einem Ping fällt das nicht auf, bei TCP schon: ein Gespräch mit
Handschlag, Daten und Abbau sind zehn Segmente, über einen Router also vierzig
Zeilen. Mit HTTP in Stufe 3 (drei Anfragen je Seite) wird es mehr. Der Filter
nach Gerät gibt es schon; ob es zusätzlich einen „nur Absender und Empfänger"
braucht, ist eine Entscheidung für Stufe 3 — sie steht in Abschnitt 3.

---

## 0j · Nachtrag: Appstore, Einstellungen weg, Router-Adresse (frühere Runde)

**345 kopflose + 426 Browser-Prüfungen grün** (vorher 345 + 410). Keine neue
Datei; berührt: `js/geraet.js`, `js/flaeche.js`, `css/app.css`, `index.html`,
`tests/uitest.js`.

Das ist die **Stufe 0** eines größeren Auftrags („mehr Programme auf dem PC" —
Dateisystem, Webbrowser, Webserver, E-Mail, und darunter TCP mit Ports). Nur die
drei Punkte, die an der Oberfläche hängen und von allem anderen unabhängig sind.
Die Reihenfolge der weiteren Stufen steht in Abschnitt 3.

### 1 · „Einstellungen" ist keine Programmkachel mehr

Vom Nutzer gesetzt: *„Einstellungen kann weg."* Der Eintrag in `PROGRAMME`
(`geraet.js`) **bleibt stehen**, aber sein `fuer` nennt jetzt
`['router','heimrouter','switch']` statt der drei Endgerätebilder.

⚠️ **Nicht löschen.** Bei Router, Heimrouter und Switch IST dieses Formular der
Inhalt des Gerätefensters, und `rendereOhneSchirm()` holt Name, Symbol und
Erklärzeile seiner Reiter aus genau diesem Eintrag. Ohne ihn fiele es in den
Notnagel `{ name: id, ic: 'gear' }`, und der Router hätte einen Reiter ohne Wort.
`programmeFuer()` filtert die Kachel auf dem Bildschirm von selbst weg — es
braucht keine Sonderabfrage.

Damit ist es wieder Filius' Modell: dort ist die Adresse eines Rechners Sache des
Konfigurationsdialogs am Netzplan (`JHostKonfiguration`), nicht eines Programms
auf dem Desktop. Am Gerät bleibt sie **lesbar** — in der Kopfzeile des
Bildschirms (`untertitel()`) und über `ipconfig` —, geändert wird sie im Entwurf
am Kärtchen. Genau das prüft der Browser-Prüfstand jetzt, im Abschnitt
*Die Adresse im Aktionsmodus*: die alte Prüfung („Adresse vom Gerät aus
geändert") ist durch ihr Gegenteil ersetzt.

### 2 · Software-Installation ist ein Appstore

Vom Nutzer: *„die Software ding soll viel mehr wie ein Appstore wirken (ich habe
hier auch einfach die Kacheln) … klicke ich auf ein installiertes Programm kommt
die Frage ob ich die wieder deinstallieren will … ganz simpel gelöst."*

Aus den zwei Spalten *Verfügbar* / *Installiert* (Filius' Aufbau) wird **ein
Kachelraster** in derselben Form wie die Programmkacheln auf dem Bildschirm
(`.dt-app`), nur in den hellen Farbtoken — die Kacheln liegen in einem Fenster
und nicht auf der Tapete. Installiert = getönte Kachel, Symbol im Akzent, Haken
in der Ecke (drei Zeichen für dieselbe Aussage, damit es auch auf einem Beamer
aus zehn Metern trägt).

* Klick auf eine ruhige Kachel spielt **sofort** auf. Filius' Zwischenschritt
  „Änderungen annehmen" gab es hier noch nie und gibt es weiter nicht.
* Klick auf eine Kachel mit Haken macht die Kachel zur **Frage**
  („DNS-Server · deinstallieren? · [Ja] [Nein]").

⚠️ **Warum die Frage in der Kachel steht und nicht in einem `confirm()`:** ein
Systemdialog blockiert die Uhr, sieht nicht nach diesem Programm aus — **und der
Browser-Prüfstand nimmt Dialoge automatisch an.** Er wäre an genau dieser Stelle
blind, niemand würde merken, wenn die Frage ausfällt.

⚠️ `swFrage` (welche Kachel fragt) steht **außerhalb** von `bauSoftware`, weil
jedes `render()` den Fensterinhalt neu baut; eine Frage, die einen Neuaufbau
nicht übersteht, verschwände unter der Hand. Zurückgesetzt wird sie in
`closeApp`/`closeAppQuiet`.

Dazu die Tabelle **`STOPPT = { dns: 'dnsServer' }`**: was aufhört zu laufen, wenn
ein Programm vom Rechner geht. Vorher `if (id === 'dns' && n.dnsServer)`; mit
Webserver und E-Mail-Server wären das drei gleichlautende Zeilen, und die dritte
vergisst man. **Jede neue Anwendung mit einem Dienst trägt sich dort mit einer
Zeile ein.**

Nebenbei gefunden: `.sw-ic` bekam vorher `esc(p.ic)` — also den **Namen** des
Symbols („globe") als Text. Fiel mit dem Umbau auf `U.icon(p.ic)` weg. Neues
Zeichen `#ic-haken` in `index.html`.

### 3 · Unter dem Vermittlungsgerät steht die Adresse, die GEMEINT ist

Vom Nutzer: *„unter diesen steht nicht mehr die wirkliche IP-Adresse, da es nur
eine von vielen ist … klicke ich ein Gerät an, welches mit dem Gerät in einem
Subnetz ist, wird die IP-Adresse angezeigt, die das Gerät wissen will."*

Vorher stand dort `mitIp[0]` — die Karte mit der kleinsten Nummer. Das war
geraten: ein Router hat keine Hauptadresse, jede seiner Adressen gilt in genau
einem Netz. Jetzt:

| Fall | unter der Kachel |
|---|---|
| eine Adresse | die Adresse, zweifarbig (wie bisher) |
| mehrere, nichts Passendes markiert | `2 IP-Adressen`, grau, in der **Textschrift** |
| mehrere, markiert ist ein Gerät aus einem seiner Netze | **dessen** Adresse, zweifarbig, mit `+1` |
| Switch | weiterhin gar keine Zeile |
| Heimrouter | unverändert die LAN-Adresse (siehe den Nachtrag *Heimrouter, NAT und WLAN*) |

⭐ **Die Aussage, die dabei entsteht**, sieht man erst im Bild: markiert man ein
Endgerät ohne Gateway, steht sein leeres Feld *Gateway* im Kärtchen — und zwei
Zentimeter darunter, unter dem Router, genau die Zahl, die hineingehört.

Gerechnet wird **nichts** neu: `relevanteNic()` in `flaeche.js` fragt
`Subnetze.berechnen()`, dieselbe Rechnung, die Ringe und Kabel färbt. Eine
zweite Adressrechnung könnte von der ersten abweichen, und dann trüge ein Gerät
den Ring des einen und die Adresse des anderen Netzes. ⚠️ **Genau EINE Karte,
sonst keine** — dieselbe Regel, mit der `subnetze.js` die Farbe eines Kabels
entscheidet. Zwei markierte Geräte aus zwei Netzen desselben Routers: jede
Antwort wäre geraten, also zählt die Zeile wieder.

Neue Klasse `.nf-ip--zahl` (grau, Textschrift, kein farbiger Grund, kein
Schloss) — es ist keine Adresse, also sieht es auch nicht wie eine aus.

⚠️ **Eine Falle im Prüfstand, die der erste Versuch geliefert hat:** die Prüfung
suchte sich das Paar „Gerät + zugehörige Router-Adresse" selbst mit
`U.sameNet(...)` gegen die Maske des Endgeräts zusammen. Damit wäre sie grün
geblieben, **auch wenn die Anzeige etwas anderes zeigt** — und sie brach ab,
sobald diese Rechnung kein Gerät fand. Jetzt kommt das Paar aus
`Subnetze.berechnen()`, also aus derselben Quelle wie die Anzeige, und es gibt
die **Gegenprobe** von der anderen Seite des Routers: sonst könnte die Zeile
schlicht immer die erste Karte zeigen und wäre trotzdem grün.

### Was beim Prüfen auffiel

* Neues Bild `tests/shot-store.png` (Bildschirm mit Appstore). Bei diesem
  Projekt hat zweimal **nur das Bild** einen Fehler gezeigt, den beide
  Prüfstände grün gemeldet haben; mit jeder weiteren Anwendung wird das Raster
  voller, und dann ist dieses Bild die schnellste Gegenprobe.
* Die **fragende Kachel wird rund 25 px höher** als die anderen. Hingenommen und
  im CSS vermerkt: ein Mindestabstand an allen Kacheln kostet dauerhaft Platz
  (auf einem Handy hochkant eine halbe Reihe), die Frage steht nur kurz, und
  waagerecht rückt nichts.
* Zwei Prüfungen hingen daran, dass der Klick auf „Einstellungen" **vom Terminal
  wegschaltete**, bevor der nächste Abschnitt es aufschlug. Ohne diesen Klick
  hätte der nächste Klick auf die Terminal-Kachel es **zugeklappt** (ein zweiter
  Klick auf ein laufendes Programm schließt es), und der Ping danach wäre in ein
  geschlossenes Fenster gelaufen. Jetzt schaltet der Abschnitt zum Appstore
  weiter — das ist zugleich seine erste Rauchprobe.
* Zwei Zählprüfungen standen auf „drei Programme" (Rechner und Handy). Jetzt
  zwei. ⚠️ Mit dem Datei-Explorer in Stufe 2 werden es wieder drei — die Zahlen
  stehen in `uitest.js` an vier Stellen.

---

## 0k · Nachtrag: sechs Beanstandungen (frühere Runde)

**345 kopflose + 410 Browser-Prüfungen grün** (vorher 345 + 380). Keine neue
Datei; berührt: `js/flaeche.js`, `js/netz.js`, `js/geraet.js`, `js/app.js`,
`js/szenarien.js`, `css/app.css`, `index.html`, beide Prüfstände.

Diese Runde besteht aus sechs Punkten vom Nutzer, und **zwei davon drehen eine
frühere Entscheidung zurück**. Beide Rücknahmen stehen hier mit Begründung, weil
die Versuchung groß ist, sie beim nächsten Mal wieder „richtig" zu machen.

### 1 · Die doppelte Adresse ist kein Fehler mehr

> „Wenn mehrere Geräte die gleiche IP haben, soll es keinen Fehler geben. Das
> ist mir zu viel Support auch nun mit den lokalen IPs auch einfach falsch."

Das zweite Argument wiegt schwerer als das erste. Seit es **Heimrouter und NAT**
gibt, stehen auf EINER Fläche mehrere Häuser nebeneinander — `192.168.1.10`
zweimal zu vergeben ist dann nicht erlaubt, sondern **der Punkt**: private
Adressen sind nur in ihrem eigenen Netz eindeutig. Das „!" behauptete das
Gegenteil, und es behauptete es ausgerechnet an dem Aufbau, der die Lektion
trägt.

⚠️ **Der Fehler im selben Netz ist damit nicht weg, er wird nur anders
gefunden:** zwei Geräte antworten auf dieselbe ARP-Anfrage, beide Antworten
stehen im Mitschnitt. Das ist der ehrlichere Weg, weil er den Unterschied
zwischen „dieselbe Zahl in zwei Netzen" (richtig) und „dieselbe Zahl in einem
Netz" (falsch) überhaupt erst zeigt — ein Zeichen an der Kachel kann das nicht.
`kerntest.js` bewacht das jetzt mit einer eigenen Prüfung, sonst wäre
**Szenario 4 still unlösbar geworden**; sein Auftragstext sagt seither „EIN
Warnzeichen, zwei stumme Fehler" statt „zwei und einer".

`netz.duplicateIps()` bleibt — der DHCP-Server weicht einer fest vergebenen
Adresse aus, und die Kurzmeldung beim Einfügen einer Kopie sagt weiter, dass
jetzt zweimal dieselbe Adresse dasteht.

### 2 · ⚠️ Rücknahme: Ziehen verschiebt wieder das Feld, Strg zieht das Rechteck

> „Das markieren vielen mehreren Geräten über ‚gedrückt halten und ziehen'
> beißt sich mit dem schönen Drag n drop auf dem Feld bewegen. Einfachen Drag n
> Drop soll wieder bewegen auf dem Feld sein. Wenn ich strg gedrückt halten will
> ich mehre markieren können."

In der Runde davor war es andersherum entschieden worden, mit der Begründung
„man markiert öfter, als man das Feld verschiebt". **Das stimmt für ein
Zeichenprogramm und nicht für dieses Feld:** es ist 2400 × 1560 groß und damit
größer als jedes Fenster — Verschieben ist hier der Weg zu allem, was gerade
nicht im Bild ist, und keine gelegentliche Zurechtrückerei.

Das Markieren verliert dabei nichts, weil es sein Vorzeichen ohnehin schon hat:
**Strg**. Strg-Klick nimmt ein Gerät dazu, Strg+A nimmt alle, Strg+Ziehen nimmt
jetzt ein Rechteck voll dazu. `dazu` ist beim Rechteck deshalb **immer wahr** —
ein Strg-Rechteck, das die bisherige Auswahl wegwirft, hieße an einer Stelle das
Gegenteil dessen, was dieselbe Taste zwei Zentimeter weiter bedeutet.

Unverändert: Rechteck öffnet **keine** Kärtchen, Strg-Klick öffnet **je eines**.

### 3 · Entf löscht in beiden Modi

Bisher stand in `app.js` `if (modus !== 'entwurf') return;` — „im Aktionsmodus
wird nicht gebaut". Der Nutzer schrieb den Satz ohne Modus, und das ist richtig:
**eine Taste, die manchmal wirkt und manchmal nicht, ohne dass etwas sichtbar
anders ist, liest sich als kaputte Tastatur und nicht als Regel.** Zu
verantworten ist es, weil `removeNode` die Zeitgeber des Geräts mitnimmt
(`engine.dropOwner`) und Strg+Z den ganzen Stand zurückholt. In einem
**Eingabefeld** gehört Entf weiterhin dem Feld — das bleibt, es ist der
teuerste Fehlgriff, den diese Oberfläche zu bieten hätte.

### 4 · ⚠️ Rücknahme: der Heimrouter kommt LEER aus dem Karton

> „Ein Heim Router braucht nichts Default mäßig ausgefüllt."

Bisher stand er fertig eingerichtet da (LAN `192.168.1.1`, DHCP-Bereich .100
bis .150, Gateway, Maske) — mit der Begründung „anstecken, läuft", so wie das
Ding im Wohnzimmer, und Filius macht es genauso (`42.0.0.10` im Konstruktor von
`Gateway.java`). Was die Begründung übersah: **ausgefüllte Felder sind hier
keine Bequemlichkeit, sondern eine vorweggenommene Antwort.** Wer ein Gerät auf
die Fläche zieht, in dem die Adresse schon steht, hat die Frage „welche Adresse
gibst du dem Netz im Haus" nicht mehr.

Was BLEIBT, und warum es kein Widerspruch ist — es sind keine ausgefüllten
Angaben, sondern die Natur des Geräts:

| | |
|---|---|
| WAN = DHCP-Client | Das tut ein WAN-Anschluss. Die Adresse kommt vom Anbieter. |
| NAT an | Der Grund, warum das Gerät nicht „Router" heißt. Abschaltbar bleibt es. |
| WLAN aus | Ein Funknetz hätte sonst einen Namen, den niemand vergeben hat. |

Der DHCP-Server ist eingerichtet (`nic: LAN`), aber **aus und ohne Bereich**:
ein Server, der Adressen aus einem Netz verteilt, das es noch nicht gibt,
verteilt Unsinn. Sobald jemand die LAN-Adresse einträgt und *DHCP-Server
einrichten* aufschlägt, füllt `dhcpVorgabe` den Bereich daraus — die Bequemlich­
keit ist also nicht weg, sie kommt nur **nach** der Entscheidung.

⚠️ Damit ist auch die Hochzählerei (`192.168.1.1`, `192.168.2.1`, …) für den
zweiten Heimrouter weg. Sie gab es nur, damit nicht zwei Geräte dieselbe
Adresse tragen — und das ist seit Punkt 1 ohnehin kein Fehler mehr.

### 5 · Unter der Kachel steht die LAN-Adresse, nie die vom Anbieter

Die WAN-Karte wurde bisher nur **nach hinten sortiert**. Solange das Gerät
eingerichtet aus dem Karton kam, sah man deshalb immer die richtige Zahl — und
der Fehler blieb unsichtbar. Seit Punkt 4 ist die WAN-Adresse regelmäßig die
**einzige**, die es gibt (sie kommt ja von allein), und dann rutschte sie nach
vorn: unter dem Gerät stand die Adresse aus dem Netz des Anbieters, als wäre sie
die des Hauses. Jetzt filtert `flaeche.js` die WAN-Karte **heraus** statt sie zu
sortieren, und dasselbe gilt für „holt Adresse (DHCP)". Steht unten nichts, ist
das die Wahrheit über das Gerät und keine Lücke.

**Die Lehre, die über diesen Fall hinausgeht:** eine Sortierung, die den
richtigen Fall zufällig trifft, ist keine Regel. Gefragt war nie „welche zuerst",
sondern „welche überhaupt".

### 6 · Router, Switch und Heimrouter haben keine Desktop-Oberfläche

Vom Nutzer als Aussage gesetzt, und sie stimmt: an keinem dieser drei Kästen ist
ein Bildschirm, keiner hat ein Betriebssystem, auf dem man ein Programm startet.
Router und Heimrouter bekamen trotzdem Tapete, Programmkacheln und
Schnellzugriff; nur der Switch war ausgenommen.

⭐ **Die Antwort stand schon im Stylesheet.** Der Kopf von `app.css` nennt drei
Höhen: Auftrag liegt flach, **Gerätefenster schwebt ein wenig (Werkzeug)**,
**Geräteoberfläche schwebt hoch — „kein Fenster des Programms, das ist ein
Bildschirm"**. Wer keinen Bildschirm hat, fällt also eine Stufe tiefer. Neu ist
`OHNE_SCHIRM` in `geraet.js` (Titel, Satz, Knöpfe je Geräteart) und `.dt--kein`
in `app.css` — **kein eigenes Bauteil**, dasselbe Fenster mit anderen Maßen, wie
beim Handy.

* Oben **ein Satz, was für ein Ding das ist** — und zwar ÜBER dem Fenster, nicht
  darin: er handelt vom Gerät und nicht vom Inhalt, also bleibt er stehen, wenn
  man aufs Terminal umschaltet.
* Darunter beim Router und Heimrouter **zwei schmale Reiter** (Einstellungen ·
  Terminal), beim Switch keine — er hat nur eine Ansicht.
* ⚠️ **Das Terminal bleibt.** Es ist kein Programm auf einem Bildschirm, sondern
  der Zugang von außen (seriell, SSH). Ohne es gäbe es an einem Router kein
  `route` und kein `ping` — und damit keinen Weg, seine Sicht zu prüfen.
* ⚠️ **Ein zweiter Klick auf denselben Reiter macht NICHT zu.** Auf einem
  Bildschirm heißt das „Programm schließen" und ist richtig, weil darunter die
  Symbole liegen. Hier läge darunter nichts.
* `PROGRAMME.fuer` nennt jetzt nur noch `host`, `server`, `handy` — das Feld
  heißt „liegt auf dem Bildschirm", und den gibt es hier nicht mehr.
* Der **Switch** bekommt damit zum ersten Mal auch im Aktionsmodus seine
  Einstellungen (WLAN-Name!), nicht nur seine MAC-Tabelle.

### Was beim Prüfen auffiel

* Der Einleitungssatz des Switch sagte fast wörtlich dasselbe wie die
  `k-note` des Formulars zwei Zentimeter darunter („Schicht 2 … welche
  MAC-Adresse an welchem Anschluss"). **Zwei Kästen übereinander, die dasselbe
  erklären, liest kein Kind zweimal — es liest keinen davon.** Jetzt sagt der
  obere nur noch, was das Gerät IST.
* Die Prüfstände sind an der Heimrouter-Stelle **umgebaut, nicht abgeschwächt**:
  `kerntest.js` hat jetzt `heimEinrichten()` / `heimNeu()`, und jede Prüfung,
  die ein laufendes Heimnetz braucht, richtet es zuerst ein. Dass das nötig ist,
  ist die Probe aufs Exempel — es gibt keinen Weg mehr zu einem Heimnetz, ohne
  es eingerichtet zu haben.
* Im `uitest.js` hing eine ganze Kette an der Rechteck-Geste: weil der Zug
  plötzlich **verschob**, lagen die Endgeräte danach unter der Auftragskarte,
  und sieben folgende Prüfungen scheiterten an Klicks ins Leere. Der Zug wird
  dort jetzt mit derselben Hand **zurückgezogen** und nicht mit `einpassen()`
  aufgeräumt — das rechnete einen anderen Ausschnitt und legte die Geräte
  wieder unter die Karte.

---

## 0l · Nachtrag: die Bürokürzel (frühere Runde)

**345 kopflose + 380 Browser-Prüfungen grün** (vorher 306 + 339). Eine neue
Datei (`js/verlauf.js`), berührt: `js/netz.js`, `js/flaeche.js`, `js/panels.js`,
`js/app.js`, `index.html`, `css/app.css`, beide Prüfstände.

### Was verlangt war, wörtlich

> „Ich will die Standard Office short Cuts haben. Vor allem bei Geräten. Strg z
> und strg y. Mehrere markieren durch Rechteck auf spannen. Und durch strg
> gedrückt halten. Markiere Objekte verschieben. Copy Paste mit strg v/c. Ich
> brauche dafür keine Buttons in der ui. Das sind einfach Standard Effekt.
> Noch eine Besonderheit. Wenn ich die Geräte per Maus/Rechteck aufziehen
> markiere, dann öffnen sich die minimodale nicht. Halte ich strg Gedrückt und
> ich klicke mehrere Geräte an, dann markiere ich auch mehrere Geräte aber ich
> offen bei allen das Mini Modal so kann ich die Einstellungen von mehreren
> Geräten gleichzeit einsehen"

Der letzte Satz ist der wichtigste, und er ist mehr als Bequemlichkeit: „warum
reden E1 und E2 nicht miteinander" ist eine Frage über **zwei** Geräte, und
bisher konnte man immer nur eines ansehen. Zwei Kärtchen nebeneinander stellen
die zwei Adressen untereinander, und die Antwort steht da, ohne dass sie jemand
vorlesen muss. Das ist das Gegenstück in Zahlen zu dem, was die Subnetzfarben
im Bild tun. Bilder: `tests/shot-karten.png` (hell/dunkel).

### Die eine Entscheidung, die etwas Bisheriges umwirft

> **Ziehen mit der Maus auf dem leeren Feld spannt ein Rechteck auf. Das
> Verschieben des Ausschnitts wandert auf Alt + Ziehen und den Mittelklick.**

Eine Geste, eine Bedeutung — die Regel aus der Runde davor gilt weiter, also
musste eine der beiden weichen. Entschieden wurde für das Rechteck, weil man
öfter markiert als verschiebt und weil es fürs Verschieben drei andere Wege
gibt (Alt, Mittelklick, Mausrad) und fürs Markieren keinen. ⚠️ **Nicht** die
Leertaste wie in vielen Zeichenprogrammen: die hält hier die **Uhr** an, und
eine Taste mit zwei Bedeutungen wäre genau der Fehler, der hier behoben wird.
Mit dem **Finger** bleibt alles, wie es war (dort gibt es kein Strg, also auch
kein Rechteck); der Hinweistext in der Leiste sagt beides.

### Wo was steht

| | |
|---|---|
| `verlauf.js` | Rückgängig über **Zustände**, nicht über Befehle. Die Begründung steht im Kopf der Datei und in `LIESMICH.md` — kurz: ein Netz wird an zwanzig Stellen verändert, und eine vergessene Gegenoperation macht den Stapel nicht leer, sondern **falsch**. Verschmelzen gleichartiger Änderungen innerhalb von 600 ms (sonst braucht eine Adresse zwölf Strg+Z), Tiefe 60, ein unveränderter Stand kommt gar nicht erst darauf. |
| `netz.js` | `ausschnitt(ids)` und `einfuegen(data, dx, dy)`. ⚠️ **Die MAC-Adresse wird NEU vergeben, die IP-Adresse mitkopiert.** Kopierte MACs wären der Fehler, den niemand findet (der Switch lernt zwei Anschlüsse für eine Adresse); doppelte IPs melden sich dagegen von selbst mit „!" und sind die ehrlichere Antwort als eine stille Änderung. |
| `flaeche.js` | `markiert` (eine Menge) statt `selected`. ⚠️ Sie heißt so und nicht `auswahl`, weil unter diesem Namen beim Zeichnen schon die Menge der sichtbaren **Subnetze** läuft. `select` ersetzt, `umschalten` nimmt dazu/heraus, `setAuswahl` setzt eine ganze Menge. Beim Verschieben mehrerer wird die **Strecke** am Hüllrechteck geklemmt, nicht jede Stelle einzeln — sonst rutschen die Geräte am Rand zusammen, während die in der Mitte weiterwandern. `draw()` räumt zu Beginn Kennungen weg, die es nicht mehr gibt. |
| `panels.js` | Aus dem einen `#karte` wird ein **Vorrat**: das Element aus `index.html` behält seine Kennungen und hat Vorrang, weitere sind Abzüge **ohne** Kennungen. Je Kärtchen eigener Zustand (`mehr`, freie Stelle), Empfänger **einmal je Element** verdrahtet (Vorrat!), Platzierung weicht anderen aus. |
| `app.js` | `aenderung(label, umbau)` ersetzt überall das bisherige `save()` — **die einzige Stelle**, an der `verlauf.merken()` gerufen wird. Dazu die Tastatur, die interne Zwischenablage und `einfuegeVersatz`. |

### Zwei Dinge, die sich aus der Sache ergeben haben

* **„Mehr ›" gibt es nur, solange EIN Kärtchen offen ist.** Die große Ansicht
  ist ein Brett am rechten Rand über die ganze Höhe; zwei davon können nicht
  nebeneinander stehen. Ein Knopf, der sichtbar ist und dann etwas anderes tut
  als versprochen, ist schlimmer als einer, der weg ist.
* **Entf fragt nicht nach.** Das ist erst seit dieser Runde zu verantworten:
  vorher gab es keinen Weg zurück. Ein Bestätigungsfenster für etwas
  Umkehrbares ist eine Frage, auf die niemand „nein" antwortet — die
  Kurzmeldung sagt stattdessen „Strg+Z holt sie zurück".

### ⚠️ Zwei Fehler, die der Prüfstand gefunden hat

* **„Mehr ›" blieb am ERSTEN Kärtchen stehen.** Wer ein zweites aufmachte,
  baute nur dieses auf — das erste behielt seinen Knopf. Gedrückt hätte er ein
  Brett über die ganze Höhe aufgeschlagen und das zweite begraben. Jede der
  beiden Stellen sah für sich richtig aus; die Regel „nur allein gibt es Mehr"
  gilt aber für den **Zustand aller** Kärtchen und nicht für einen Vorgang.
  Jetzt gibt es `knoepfeAbgleich()`.
* **Das Ausweichen beim Platzieren PENDELTE.** Die erste Fassung wich nach
  unten aus und, wenn unten kein Platz war, nach oben — in jedem Durchgang neu
  entschieden. Unten passte es nicht, oben stieß es an, unten wieder nicht …
  und nach vierzehn Durchgängen lag das Kärtchen genau dort, wo es angefangen
  hatte. **Die Lehre: bei einer Ausweichsuche gehört die Richtung in die LISTE
  der Kandidaten und nicht in eine Entscheidung, die jeder Durchgang neu
  fällt.** Jetzt eine feste Reihenfolge: neben sein Gerät (gestuft), andere
  Seite, und zuletzt **neben ein Kärtchen, das schon liegt** — und genau das
  ist beim Vergleichen ohnehin die richtige Anordnung, eine Reihe.

### Noch offen an dieser Ecke

* Ab dem **vierten Kärtchen** ist bei 1500 px kein Platz mehr; sie legen sich
  aufeinander und müssen von Hand verteilt werden.
* Die **Subnetzliste** hebt weiterhin nur ein Gerät hervor, die Fläche färbt
  alle Netze der ganzen Auswahl.
* Ein **Rechteck** lässt sich nicht auf einem Fenster beginnen (Auftrag,
  Subnetzliste, Kärtchen) — derselbe Umstand wie beim Verschieben des
  Ausschnitts.
* Im **Aktionsmodus** öffnet Strg-Klick bewusst keine zweite Geräteoberfläche:
  ein Bildschirm ist ein ganzes Programmfenster, kein Kärtchen mit fünf Zeilen.

---

## 0m · Nachtrag: Heimrouter, NAT und WLAN (frühere Runde)

**306 kopflose + 339 Browser-Prüfungen grün.** Eine neue Datei (`js/nat.js`),
berührt: `js/netz.js`, `js/schichten.js`, `js/dienste.js`, `js/subnetze.js`,
`js/konfig.js`, `js/flaeche.js`, `js/geraet.js`, `js/terminal.js`, `js/app.js`,
`index.html`, `css/app.css`, beide Prüfstände.

### Was verlangt war, wörtlich

> „Wir brauchen ein neues Gerät (Heim Router) dieser soll wie in Filius
> umgesetzt sein (Lokale IPs NAT und so WAN /LAN). Router und Heimrouter werden
> dann -wie endgeräte- aus vermittlungsgeräte geklustert. Ich möchte das
> Heimrouter einen WAN ausgang haben aber mehrere LAN ausgänge… so wie richtige
> heimrouter…. Switche, und heimrouter sollen die möglichkeit WLAN auszustrahlen.
> […] Ich muss auch gut sehen können, welches Kabel WAN und welche LAN sind.
> (WLAN wird gestrichelt dargstellt). […] ich möchte nur, den WLANs einen namen
> geben können, sodass geräte das leichter finden. Auch farblich markiert,
> Geräte die WLAN ausstrahlen"

Filius hat für **beides** schon eine Antwort, und sie ist übernommen:
`hw_gateway_msg1 = Heimrouter` (`Gateway.java`: Karte 0 = WAN, Karte 1 = LAN,
NAT, DHCP-Server auf LAN, DHCP-Client auf WAN) und `hw_switch_msg1 =
Switch / WLAN` mit `jswitchkonfiguration_msg4 = Name WLAN (SSID)`; am Rechner
`Kabelgebunden (LAN)` / `Drahtlos (WLAN)` plus Auswahlliste, und Funkstrecken
werden in `JCablePanel` **gestrichelt** gezeichnet.

### Die eine Entscheidung, die alles andere nach sich zieht

> **Die LAN-Buchsen eines Heimrouters sind ein eingebauter SWITCH.**

Filius hat genau **einen** LAN-Anschluss; der Nutzer wollte mehrere. Damit steht
sofort die Frage im Raum, die Filius gar nicht erst stellt: vier Buchsen, aber
nur eine Adresse? Die Antwort ist die Wahrheit über das Gerät — und sie ist der
eigentliche Gewinn dieser Abweichung. Im Code heißt das:

| | |
|---|---|
| `netz.js` | `WAN = 0`, `LAN = 1`. `brueckeNic(node, i)` gibt für jede LAN-Buchse **dieselbe** Karte zurück (Adresse **und** MAC); `bruecke(node, i)` alle Buchsen eines Anschlusses. ⚠️ **Diese vier Fragen werden NUR hier beantwortet.** Stünde `kind === 'heimrouter' && i === 0` irgendwo sonst noch einmal, liefe es beim nächsten Umbau lautlos auseinander. |
| `schichten.js` | `deliver()` lernt an einer LAN-Buchse die MAC **und** flutet zu den anderen Buchsen **und** prüft „für mich?" — alle drei, denn ein Rundruf ist beides. `sendOnNic()` wählt auf der LAN-Seite über die MAC-Tabelle die richtige Buchse. Auf die WAN-Seite darf dabei **nichts**: das wäre kein Switch mehr, sondern ein Loch in der Haustür. |
| `subnetze.js` | Die Verbandsuche verbindet die LAN-Buchsen wie die Anschlüsse eines Switches — und `gehoert()` fragt nach dem **Anschluss**, nicht nach der Buchse. Ohne die zweite Zeile bliebe das Kabel an LAN 3 grau, während das an LAN 1 farbig ist. |
| `dienste.js` | `onServer()` fragte nach der Buchsennummer (`m.nic !== conf.nic`). Damit bekam **nur das Gerät an LAN 1** eine Adresse; die anderen drei bekamen eine Belehrung über den falschen Anschluss. Jetzt `netz.bruecke(…).indexOf(m.nic)`. |
| `terminal.js` | `ipconfig` zählt **Anschlüsse** auf, nicht Löcher — sonst stünden drei Blöcke „— keine —" unter einem mit Adresse, und man läse daraus drei kaputte Karten. |

### NAT — `js/nat.js`, und zwei Haken in `schichten.js`

NAPT nach RFC 3022: übersetzt wird Adresse **und** Nummer (UDP-Port bzw.
ICMP-Kennung), denn erst die macht den Rückweg eindeutig. Die beiden
Berührungspunkte sind im Code mit `⟨NAT⟩` markiert.

⚠️ **Der Rückweg muss VOR der Frage „für mich?" stehen.** Die Antwort aus dem
Internet trägt als Ziel die Adresse des Heimrouters und ist trotzdem nicht für
ihn. Stünde die Frage zuerst, verschluckte er jede Antwort auf jede Anfrage aus
dem Heimnetz — ohne Fehlermeldung, denn formal war das Paket an ihn gerichtet.

Der Schalter lässt sich **ausmachen**, und das ist Absicht: ohne NAT geht das
Paket hinaus und die Antwort findet nicht zurück. Das im Mitschnitt zu sehen ist
ein besserer Unterricht als jede Erklärung, warum man NAT braucht. Beide
Richtungen sind geprüft.

### WLAN — eine Verbindung, die niemand steckt

Eine Funkverbindung ist im Modell ein **Kabel mit `funk: true`** und geht
denselben Weg: MAC-Lernen, ARP als Rundruf, Mitschnitt, Subnetzfärbung. Ein
zweiter Zustellweg daneben wäre dieselbe Welt noch einmal und hätte nichts zu
erklären, was am Kabel nicht auch zu erklären ist.

⚠️ **`funkAbgleich()` räumt ERST alles Funk weg und baut dann neu.** Der
bequemere Weg — nachsehen, was noch stimmt — hat einen Haken, der sich nicht
zeigt, sondern anwächst: bliebe eine Buchse stehen, die niemand mehr braucht,
hätte der Switch nach zehn Schulstunden zwanzig Löcher.

⚠️ **Funkbuchsen und Funkkabel stehen NICHT in der Datei.** Gespeichert wird,
wonach GESUCHT wird (`nic.funk`, `nic.ssid`), nicht, was gerade gefunden wurde;
`fromJSON` ruft am Ende `funkAbgleich()`. Filius belegt dagegen einen echten
Anschluss (`holeFreienPort()`) — hier nicht: ein Switch mit drei Handys wäre
sonst fast voll, und das behauptet etwas Falsches über die Hardware.

Zwei bewusste Zutaten gegenüber Filius: ein **Schalter** vor dem Namensfeld
(dort IST der leere Name das Aus — dann heißt „WLAN abschalten" aber „den Namen
löschen", und beim Einschalten ist er weg) und ein **Namensvorschlag**
(`WLAN-SW1`) beim ersten Einschalten.

### Die drei Zeichen auf der Fläche

| | |
|---|---|
| **WAN/LAN-Schildchen** | Auf der **Kachelkante**, an jedem Kabel eines Heimrouters. `WAN` gefüllt (es gibt genau eines), `LAN 1…n` umrandet. Gewählt wurde ein **Wort**, weil alle anderen Merkmale vergeben sind: Farbe heißt „Netz", Dicke heißt „hervorgehoben", gestrichelt heißt „Funk". |
| **Gestrichelte Kabel** | `stroke-dasharray: 9 7` — bewusst anders als das gezogene Kabel (`3 9`): das eine ist ein Fehler, das andere keiner, und aus der letzten Reihe unterscheidet man sie nur an der Länge der Striche. |
| **Die Marken unter der Kachel** | DHCP (Bernstein) und WLAN + Netzname (Violett), in einer Reihe. *(Seit Abschnitt 0 kommen DNS, Web und Mail dazu, und aus der Reihe werden bei Bedarf zwei.)* |

### ⚠️ Drei Fehler, die erst das BILD gezeigt hat

* **„DHCIWAN".** Das DHCP-Zeichen saß oben links an der Kachel, das
  WAN-Schildchen sitzt auf der Oberkante — und das WAN-Kabel geht meistens nach
  oben. Zwei Pillen übereinander, beide unlesbar. Jede Stelle sah für sich
  richtig aus. Deshalb stehen beide Marken jetzt in einer **Reihe unter** der
  Kachel (`marken()` in `flaeche.js`); die zwei Ecken bleiben den Zeichen, die
  einen ZUSTAND melden („!" und „aus").
* **Ein Schloss hinter einer selbst eingetragenen Adresse.** Es hing an „holt
  IRGENDEINE Karte per DHCP" — beim Heimrouter ist das die WAN-Karte, während
  unter der Kachel die von Hand eingetragene LAN-Adresse steht. Das Schloss
  behauptete über genau diese Zahl, sie komme vom Server und sei nicht änderbar.
  Jetzt fragt es die Karte, deren Adresse dasteht.
* **„LAN 5" am Funkkabel** und vier Schildchen als Kranz um die Kachel, zwei
  davon mitten auf der IP-Adresse. Der erste Versuch setzte sie 17 Punkte vor
  die Kante. Auf der Kante ist jedes Schild dort, wo sein Kabel ins Gehäuse
  geht — es liest sich als **Buchse** statt als Beschriftung, und das ist
  ohnehin die richtige Aussage.

Dazu ein Fehler, den nur das Bild zeigen konnte, obwohl er im Modell saß: der
**Heimrouter zeigte die WAN-Adresse groß unter der Kachel**. Unter der Kachel
ist Platz für EINE, und die Frage an diesem Gerät lautet „unter welcher Adresse
erreiche ich es von hier aus" — das ist die im Haus.

### ⚠️ Eine Falle im Prüfstand, die zwanzig Minuten gekostet hat

`tests/kerntest.js` hat **zwei** Funktionen namens `bau()` — die obere auf
Dateiebene, eine zweite im Abschnitt *Subnetze* innerhalb eines Blocks. Weil die
Datei als **Skript** läuft und nicht als Modul, wird die innere an die
Dateiebene gehoben und überschreibt die äußere. Alles nach diesem Abschnitt
bekommt bei `bau()` ein `{engine, netz, setz}` ohne Stack, und der Fehler
(`Cannot read properties of undefined`) sieht aus, als sei `Stack` kaputt.
Neue Abschnitte benutzen deshalb `heimBau()`.

### Noch offen

* **Portfreigaben** (Filius: `JPortForwardingDialog`) — die Gegenprobe zu „von
  außen kann niemand anfangen". Der Platz dafür ist der Reiter *Allgemein*.
* Ein **Szenario mit Heimrouter** („Zuhause"): WAN ans Modem, zwei Geräte am
  Kabel, eines im WLAN, Ping nach draußen und ein Blick in die NAT-Tabelle.
  Das Gerät kann alles dafür — es fehlt nur der Auftrag in `js/szenarien.js`.
* ICMP-Fehlermeldungen von außen werden nicht zurückübersetzt; ein „Ziel nicht
  erreichbar" aus dem Internet landet beim Heimrouter statt beim Rechner, der
  gefragt hat.
* ~~Die Marken-Reihe kann breiter werden als die Kachel, wenn DHCP **und** ein
  langer Netzname zusammenkommen.~~ **Erledigt in Abschnitt 0:** ab 112 Punkten
  bricht die Reihe um (`MARK_BREIT` in `flaeche.js`).

---

## 0n · Nachtrag: die Oberfläche (frühere Runde)

Fünf Punkte vom Nutzer, alle umgesetzt. **250 kopflose + 301 Browser-Prüfungen
grün.** Berührt: `index.html`, `css/app.css`, `js/flaeche.js`, `js/geraet.js`,
`js/netz.js`, `js/app.js`, `js/util.js`, `js/konfig.js`, `js/panels.js`,
`js/szenarien.js`, beide Prüfstände.

### Was verlangt war, wörtlich

> „ich will bei den Geräten, die ich auswählen kann, einen Bereich ‚endgeräte'
> haben hier sind die Server, Laptops und Handys drin. Alles gleiche geräte
> unterschiedlicher Optik. […] Das soll beides genau die Optik vom Glastisch
> haben. also genau so (insbesondere die desktop ikons und der schnellzugriff
> unten). […] ich will alle drei Endgeräte neben einander sehen nur geclustert
> in Endgeräte… und mache die auswahl der Endgeräte, zeiger kabel auch an den
> Linken rand. (so wie filius). Ich will diese leiste nur auch minimieren können
> und ausfahren können. […] Das Feld muss scrollbar sein. Also ich möchte in der
> ui das feld zoomen und scrollen können. Gerade kann ich Geräte auch nicht auf
> dem ganzen feld platzieren."

### Die fünf Stücke

| | |
|---|---|
| **Die Leiste am linken Rand** | Senkrecht wie in Filius, statt als waagerechtes Band über der Fläche. Drei Gruppen: **Endgeräte** (Laptop · Server · Handy **nebeneinander**), *Verbinden* (Switch, Router), *Werkzeug* (Zeiger, Kabel). Unten der Ausschnitt. |
| **Einklappen** | Ein Griff oben rechts in der Leiste: 186 px → 58 px. Die **Symbole bleiben stehen**, nur die Wörter gehen in den Tooltip. Der Zustand steht in `netzsim.leiste.v1` und überlebt das Neuladen. |
| **Das Handy** | Eine neue Geräteart in `netz.KIND` — und sonst nichts. Dasselbe Modell, dieselben Programme, dieselbe Konfiguration. |
| **Der Bildschirm im Glastisch-Aufbau** | Symbole auf der Tapete, Schnellzugriff unten, Programmfenster mit eigener Kopfzeile. Beim Handy hochkant mit Vollbild-Programm. |
| **Feld zoomen und verschieben** | Das Feld ist jetzt **2400 × 1560** und größer als jedes Fenster; `view` in `flaeche.js` sagt, welchen Ausschnitt man sieht. |

### Die drei Regeln, die man kennen muss, bevor man hier etwas ändert

1. **Das Handy ist keine Geräteart, es ist ein Bild.** Genau wie Server. Die
   einzige Stelle im ganzen Programm, die `kind === 'handy'` abfragt, ist eine
   CSS-Klasse in `geraet.js` (`dt--handy`). Sobald irgendwo sonst danach
   gefragt wird, um etwas zu **erlauben oder zu verbieten**, steht im Code das
   Gegenteil dessen, was der Unterricht sagen soll. Der kopflose Prüfstand
   bewacht das mit einem Ping vom Handy zum Rechner.
   ⚠️ Deshalb steht in `konfig.js` jetzt `kind !== 'switch' && kind !== 'router'`
   statt der Aufzählung `host || server`: ein viertes Bild soll dort nichts zu
   ändern haben.

2. **„Laptop" ist der Name des BILDES, „Endgerät" der des Geräts.** Auf der
   Fläche steht weiter E1, in jedem gespeicherten Stand „Endgerät 1". Daran
   wurde nichts geändert — daran hängen Aufträge, Kürzel und alte Dateien. Die
   Erklärkarte sagt den Zusammenhang ausdrücklich („auf der Fläche steht er als
   Endgerät 1, kurz E1"), weil das sonst eine stille Unstimmigkeit wäre.

3. **Der Ausschnitt gehört dem Benutzer, sobald er ihn angefasst hat.**
   `selbstGewaehlt` in `flaeche.js`. Solange niemand gezoomt oder verschoben
   hat, passt sich der Ausschnitt bei jeder Fenstergröße neu ein
   (`einpassenRechteck(START)`); danach bleibt er stehen. Die Prozentzahl in der
   Leiste ist der Rückweg: sie setzt das Flag zurück.

### ⚠️ Vier Fehler, die erst der Prüfstand oder das BILD gezeigt haben

* **Der erste Versuch, auf Fenstergrößen zu reagieren, schaukelte sich auf.** Er
  behielt die Breite des Ausschnitts und rechnete nur die Höhe neu. Über
  mehrere Größenänderungen hinweg wurde immer mehr leeres Feld sichtbar; auf
  einem Tablet hochkant standen die Geräte am Ende bei **41 %** und waren nicht
  mehr zu lesen. Nichts war falsch gerechnet — es fehlte nur ein fester Bezug.
  Deshalb jetzt `einpassenRechteck(START)`: berechenbar, egal wie oft.
* **Umgekehrt fiel beim Aufschlagen des Mitschnitts der untere Teil des Netzes
  aus dem Bild** — lautlos, weil ein verschiebbares Feld nicht nach einem Fehler
  aussieht, sondern nach „da war nie etwas". Der Switch des Startnetzes lag
  danach unterhalb des Bildes, und der Prüfstand konnte kein Kabel mehr ziehen.
  Gefunden hat es `tests/uitest.js` — die Meldung nennt seither ausdrücklich,
  **was** an der Stelle liegt, an der geklickt werden sollte.
* **Das Raster musste ins SVG umziehen.** Es lag als CSS-Muster auf der Bühne;
  mit einem verschiebbaren Ausschnitt bleibt es stehen, während die Geräte
  darüber wandern — das Netz sähe aus, als schwebe es über dem Tisch. Jetzt
  gehört es zum Feld (`nf-raster`), und seine Maschen sind eine Länge auf dem
  **Feld**, nicht auf dem Bildschirm.
* **„Einstellun…" und „255.255.255".** Beides nur im Bild zu sehen: die Symbole
  auf dem Bildschirm standen in drei Spalten (so steht es im Showroom, aber
  dort heißen die Programme „Software" und „Dateien"), und im schmalen
  Handy-Formular blieben neben der Beschriftung 144 px für den Wert. Jetzt zwei
  Spalten — und auf dem Handy steht die Beschriftung **über** dem Feld, so wie
  auf jedem Telefon.

### Was `freeSpot()` jetzt zusätzlich prüft

Es fragt den Browser (`document.elementFromPoint`), ob an der gefundenen Stelle
auf dem **Bildschirm** wirklich die Fläche liegt — und nicht der Auftrag, die
Subnetzliste, ein Gerätefenster oder das Terminal. Eine Aufzählung dieser
Fenster im Code wäre beim nächsten neuen Fenster still veraltet.

---

## 0o · Nachtrag: die Gesten (frühere Runde)

Vier Punkte vom Nutzer, alle umgesetzt. **240 kopflose + 263 Browser-Prüfungen
grün.** Berührt: `js/flaeche.js`, `js/app.js`, `js/panels.js`, `index.html`,
`css/app.css`, `tests/uitest.js`.

### Die Regel dahinter, in einem Satz

> **Eine Geste, eine Bedeutung — und entschieden wird erst beim Loslassen.**

Bisher tat der Zeigerdruck zwei Dinge gleichzeitig: er wählte aus *und* schlug
ein Fenster auf *und* begann ein Ziehen. Jetzt markiert das Aufsetzen nur (Ringe,
Liste); ob daraus ein **Tipp** oder ein **Zug** wird, steht erst beim Heben fest.
Die Schwelle steht in `flaeche.js` als `ZUG_MAUS = 4` / `ZUG_FINGER = 10` und
wird in **Bildschirmpunkten** gemessen — sie darf sich nicht ändern, nur weil das
Fenster kleiner ist. Unterhalb der Schwelle bewegt sich **nichts**; sonst wäre
jeder Tipp auf einem Tablet zugleich ein winziges Verschieben.

| | |
|---|---|
| **Tippen** auf ein Gerät | öffnet sein Fenster. Im Entwurf die Einstellungen, in der Aktion die Geräteoberfläche. |
| **Noch einmal tippen** | macht es wieder zu. Vorher gab es dafür nur das `×` — auf einem Tablet der kleinste Knopf auf dem Bildschirm. |
| **Ziehen** | verschiebt (Entwurf) und öffnet **nichts** — auch in der Aktion nicht, wo gar nichts mitgeht. |

⚠️ **Der Fehler, den erst der Prüfstand gefunden hat:** die Abfrage im
`pointerup` lautete `if (d.mode === 'move' && d.zug)`. Im Aktionsmodus heißt der
Modus aber `'tipp'` — ein Wisch übers Gerät fiel durch und schlug die
Geräteoberfläche doch auf, also genau über den Paketen, denen man zusehen
wollte. Jetzt wird `d.zug` zuerst geprüft, unabhängig vom Modus.

### Die vier Punkte im Einzelnen

1. **Tippen ≠ Ziehen** (oben). `flaeche.select(id, still)` hat ein zweites
   Argument bekommen: *nur markieren*. Was beim Tippen aufgeht, entscheidet
   `opts.onTapNode` in `app.js` — die Fläche weiß nicht, was gerade offen ist.
   Dazu `panels.karteOffen` als Auskunft.

2. **Beim Kabelziehen wird nichts mehr markiert.** Drei Schichten, weil eine
   nicht reicht: `preventDefault()` im `pointerdown` (die Markierung fängt gar
   nicht erst an), `.nf { user-select: none }` (die Fläche selbst) und
   `body.is-ziehen` für die Dauer eines Zugs (der Zeiger ist dann auf die
   Fläche gefangen, die Markierung wandert aber trotzdem über alles darunter).

3. **Geräte zieht man aus der Leiste, man klickt sie nicht an.** Der Klick legte
   sie bisher an eine ausgerechnete freie Stelle — bequem und trotzdem falsch:
   die Stelle war nie die gewünschte, und wer nachlesen wollte, *was* ein Switch
   ist, hatte danach einen Switch. Jetzt: ziehen legt ab, wo man loslässt
   (Schattengerät `.gdrag` am Zeiger, `.is-ok` zeigt „hier geht es"),
   **antippen erklärt** (`#ginfo`, Texte in `GERAETE_INFO` in `app.js`, mit dem
   Filius-Wort dazu: *Rechner*, *Vermittlungsrechner*). Neue Fläche-API:
   `flaeche.ablegen(clientX, clientY)` → SVG-Punkt oder `null`.

4. **Das hervorgehobene Kabel ist jetzt zu sehen.** Dicker (5 → 9,5 im Puls),
   mit einem Hof auf der ganzen Treffbreite (`.nf-cable-hit`, 18 Punkte) und
   einem langsamen Puls (1,3 s).

⚠️ **Und das ist der Punkt, den nur das BILD gezeigt hat:** vorher nahm das
hervorgehobene Kabel die **Akzentfarbe** an, und die ist in Hell Mint — also
eine der sechs Netzfarben (`--sn-2`). Wer beim Router auf *Netzwerkkarte 1*
zeigte (Netz `192.168.1.`, blau), bekam ihr Kabel in **Mint** zu sehen, der
Farbe des *anderen* Netzes. Beide Prüfstände waren dabei grün.
Jetzt behält das Kabel seine eigene Farbe, der Hof trägt dieselbe
(`.is-betont.is-sub .nf-cable-hit { stroke: var(--sub) }`), und hervorgehoben
wird über **Dicke und Bewegung** — die einzigen zwei Merkmale, die auf dieser
Fläche noch keine andere Bedeutung tragen. Ein grauer Hof um ein blaues Kabel
war der erste Versuch und sah aus wie „ausgegraut" statt „gemeint".

Dieselbe Regel wie bei der Geräteauswahl, die aus demselben Grund in `--ink`
steht und nicht im Akzent: **Farbe heißt auf dieser Fläche ausschließlich
„Netz".**

---

## 1 · Was der Auftrag war

Zwei Punkte vom Nutzer (Sönke), wörtlich:

1. **„beim Router würde ich gerne die allgemeinen einstellungen (Gateway DNS,
   später noch routing) gerne von den Netzanschlüssen trennen. In den modalen
   gibt es oben 2 reiter. Einmal ‚allgemein' hier finde ich gateway und so. und
   einmal netzwerkkarten, hier finde ich -so wie jetzt- die netzwerkkarten
   untereinander"**

2. **„Haupterneuerung im Vergleich zu Filius soll die Sichtbarkeit der Subnetze
   sein!"** — Geräte desselben Subnetzes und ihre Kabel tragen dieselbe Farbe;
   das angeklickte Gerät ist eindeutig hervorgehoben; ein Router liegt in
   mehreren Netzen und bekommt mehrere Ringe; Switche werden nicht markiert;
   ein Gerät allein ist kein Subnetz; die Netzwerkkarten im Fenster sind in der
   Farbe ihres Netzes umrandet; ein Knopf **„Subnetze anzeigen"** neben *Aktion*
   zeigt alle auf einmal und öffnet links eine Liste der IP-Adressräume.

   Dazu die Frage: **„klappt das auch bei komplizierten subnetzmasken, wie
   werden adressräume gut dargestellt?"**

---

## 2 · Was fertig ist

**Beides vollständig gebaut, beide Prüfstände grün:
240 kopflose + 215 Browser-Prüfungen.**

### Neue Datei

| | |
|---|---|
| `js/subnetze.js` | Die ganze Rechnung plus die Liste am linken Rand. Einzige neue Datei. |

### Geänderte Dateien

| Datei | was |
|---|---|
| `js/flaeche.js` | Subnetzringe am Gerät, Kabel in Netzfarbe, `setSubnetze()`; Adresse unter der Kachel 9 px tiefer (`IP_Y`), damit die Ringe Platz haben; `toStage()` misst gegen die **Bühne** statt gegen die Fläche |
| `js/konfig.js` | Reiter *Allgemein* / *Netzwerkkarten* beim Router; jeder Kartenblock in der Farbe seines Netzes (`--sub`, `has-sub`) |
| `js/panels.js` | `dataset.reiter` beim Gerätewechsel zurücksetzen |
| `js/app.js` | Knopf `#subBtn`, `subnetzeZeigen()`, `neuZeichnen()` (= `flaeche.draw()` + Liste); `body.sub-open`; DHCP-Meldung im Terminal ohne `/24` |
| `js/szenarien.js` | Auftrag von Szenario 3 ohne `/24` |
| `index.html` | `<script src="js/subnetze.js">`, Knopf, `<aside class="sn" id="subnetze">` |
| `css/app.css` | `--sn-0…5`, `.nf-ring`, `.nf-cable.is-sub`, `.sn…`, `.k-reiter…`, `.k-nic.has-sub`, `body.sub-open` |
| `tests/kerntest.js` | Abschnitt *Subnetze* (~40 Prüfungen) |
| `tests/uitest.js` | Abschnitt *Subnetze* (~30 Prüfungen), zwei alte Router-Prüfungen auf die Reiter umgestellt |
| `LIESMICH.md`, `FILIUS-ABGLEICH.md` | nachgezogen |

### Die Antwort auf die Frage nach krummen Masken

Je Netz stehen **drei** Zeilen, und die letzte stimmt immer:

| | `255.255.255.0` | `255.255.255.192` |
|---|---|---|
| Kurzform | `192.168.1.__` | `192.168.1.64` — letzter Block **gestreift** |
| Netz · Maske | `192.168.1.0` · `255.255.255.0` | `192.168.1.64` · `255.255.255.192` |
| Adressen | `192.168.1.1 – 192.168.1.254` | `192.168.1.65 – 192.168.1.126` |

Keine Präfixschreibweise (`/26`) — die gibt es in Filius nicht.

### Drei Entscheidungen, die man kennen muss, bevor man etwas ändert

1. **Ein Subnetz braucht ZWEI Bedingungen** (`js/subnetze.js`, Kopfkommentar):
   über Kabel erreichbar ohne Router dazwischen (Switche reichen durch,
   Endgeräte und Router nicht) **und** gleiche Netzadresse *und* gleiche Maske.
   Weniger als zwei Geräte = kein Netz.
2. **Farbe heißt auf der Fläche ausschließlich „Netz".** Die Auswahl eines
   Geräts ist deshalb **nicht** im Akzent markiert, sondern in der Schriftfarbe
   (`--ink`): der Akzent ist hell Mint und dunkel Violett, und beides gibt es
   als Subnetzfarbe.
3. **Sechs Farben, nicht acht.** Acht waren es; Schiefergrau sah aus wie
   „kein Netz", Ocker war von Orange nicht zu unterscheiden. Wer die Palette
   erweitern will, muss beides im Bild prüfen — nicht im Code.

### Zwei Fehler, die erst das Bild im Browser gezeigt hat

Beide behoben, beide in den Prüfständen bewacht:

* Die Liste lag **über E1 und E2** des dritten Szenarios. Jetzt macht sie der
  Fläche Platz (`body.sub-open .canvas { left: 292px }`), statt sie zu
  verdecken. Dazu musste `toStage()` in `flaeche.js` gegen die Bühne messen —
  sonst lag das Gerätefenster um 292 px daneben.
* `<aside hidden>` mit `display: flex` ist **nicht** versteckt: die Liste fing
  im geschlossenen Zustand alle Klicks in der linken Hälfte ab. `.sn[hidden]
  { display: none }`.

---

## 3 · Was noch zu tun ist

### Unmittelbar offen aus der Routing-Runde

| | Aufwand | |
|---|---|---|
| **Kein Szenario zu Routing und Portfreigabe** | klein | Die größte Lücke dieser Runde. Ein Netz aus drei Netzen und zwei Routern, in dem man **erst von Hand einträgt und dann den Haken setzt** — in dieser Reihenfolge, denn das automatische Routing beantwortet eine Frage, die man gestellt haben muss. Dazu ein zweiter Auftrag am Heimrouter-Szenario (das ohnehin fehlt): „der Webserver im Haus soll von draußen erreichbar sein." |
| ~~`traceroute`~~ | — | **Erledigt am 2026-09-27**, siehe Abschnitt *Elf Änderungswünsche*. |
| **Der Mitschnitt läuft im Dauerbetrieb voll** | klein | Zwei Router mit RIP erzeugen alle fünf Sekunden Ansagen, für immer. Der Ringpuffer (12000) fängt es ab, aber wer eine Stunde laufen lässt, findet den Ping von vorhin nicht mehr. Der Chip **RIP** lässt sich nicht negieren — ein **„alles AUSSER RIP"** wäre die eigentlich gebrauchte Geste. Rund zehn Zeilen. |
| **Kein Warnzeichen bei einer Zeile, die nichts tut** | klein | Im Formular ist eine unvollständige oder widersprüchliche Zeile rot beschriftet — auf der **Fläche** sieht man davon nichts. Ein Router mit drei Zeilen, von denen zwei ins Leere zeigen, sieht von außen aus wie jeder andere. ⚠️ Wenn, dann als Warnzeichen wie bei den anderen Fehlern (`problemOf` in `flaeche.js`), nicht als Fenster. |

### Unmittelbar offen aus der E-Mail-Runde

| | Aufwand | |
|---|---|---|
| **Der Schnellzugriff läuft auf einem Tablet hochkant über** | klein | Acht Kacheln passen bei 820 × 1180 auf den Bildschirm, das Dock unten ist dort aber breiter als das Fenster. Es hat `overflow-x: auto`, funktioniert also — sieht aber nach „abgeschnitten" aus statt nach „hier geht es weiter". Ein Verlauf am rechten Rand wäre die Antwort. Gemessen, nicht geschätzt. |
| **Kein Szenario für E-Mail** | klein | Szenario 7 gibt es für den Web-Teil; für die Post fehlt der Auftrag. Er läge nahe: zwei Konten auf einem Server, Anna schreibt an Bernd — und die Klasse sieht, dass beim Empfänger nichts ankommt, bis er abruft. |

### Unmittelbar offen aus der TCP-Runde

| | Aufwand | |
|---|---|---|
| **Der Mitschnitt zeigt jedes Segment einmal je Sprung** | mittel | ⚠️ **Gemessen, seit es HTTP gibt: eine Seite über einen Router sind 152 Zeilen.** Mit dem Chip HTTP sind es 24, mit zusätzlichem Gerätefilter 6. Es gibt schon den Filter nach Gerät; die Frage ist, ob zusätzlich ein Schalter **„nur Absender und Empfänger"** gehört — er würde die Zwischenstationen ausblenden und die Geschichte übrig lassen. ⚠️ Das ist eine Entscheidung, keine Reparatur: die Zwischenstationen sind bei ARP und beim Fluten genau der Unterrichtsgegenstand. Spätestens mit Stufe 3 zu beantworten. |
| **`route` bricht im Gerätefenster um** | klein | Dieselbe Sache, die bei `netstat` in dieser Runde behoben wurde: 72 Zeichen Kopfzeile gegen ein rund 330 px schmales Fenster. Nicht angefasst, weil die Spalten aus Filius stammen (`jweiterleitungstabelle_msg3…6`) und es die Tabelle auch im breiten Terminal gibt. Wer es anfasst, baut beide Befehle zusammen um. |

### Unmittelbar offen aus dieser Runde

| | Aufwand | |
|---|---|---|
| **Die vier Standardbilder austauschen** | klein | Ausdrücklich vom Nutzer angekündigt: „Da sind die default Bilder von dir drin. **Die können wir später noch ändern.**" Sie stehen als SVG-Quelltext in `SAMMLUNG` (`js/dateien.js`) und heißen im Ordner `schule.svg`, `landschaft.svg`, `marke.svg`, `smiley.svg`. ⚠️ Wer ein Bild ERSETZT, muss den Schlüssel (`@schule` …) behalten oder alle Fundstellen mitziehen — `http.js` und `szenarien.js` legen Dateien mit `bild: '@schule'` an, und ein gespeicherter Stand hält denselben Verweis. |
| **Ein Switch schrumpft nicht wieder** | klein | Er wächst mit jedem Kabel, aber leere Buchsen verschwinden nicht, wenn die Kabel weg sind. Bewusst so: `removeNic` verschiebt Nummern, an denen Kabel hängen, und freie Buchsen schaden nichts. Ein Switch, an dem einmal 30 Geräte hingen, zeigt danach dauerhaft 30 Buchsen in der Reihe. |
| **Große Dateien und der localStorage** | — | 4 MB je Netz stehen über dem, was der localStorage für den GANZEN Stand hat. Gewollt (die Datenbank kommt), aber bis dahin kann „Speicher ist voll" auftreten. Siehe Abschnitt 0, Punkt 5. |

### Unmittelbar offen aus der Runde davor

| | Aufwand | |
|---|---|---|
| **Ein Szenario mit Heimrouter** | klein | Steht seit der NAT-Runde auf dieser Liste und ist jetzt **mehr wert als vorher**: seit das Gerät leer aus dem Karton kommt, ist „richte dein Heimnetz ein" eine echte Aufgabe mit einer Reihenfolge (LAN-Adresse → DHCP-Bereich → Gerät anstecken → ping nach draußen). Das Gerät kann alles dafür, es fehlt der Auftrag. |
| **Der Heimrouter sagt nicht, dass er noch nichts kann** | klein | Er trägt jetzt regelmäßig „keine IP" unter der Kachel und verteilt nichts, und das ist richtig so — aber ein Kind, das ihn ansteckt und wartet, bekommt keinen Hinweis, wo es anfangen soll. Ein Satz im LAN-Reiter („trag hier die Adresse deines Heimnetzes ein") wäre die halbe Miete. **Nicht** als Warnzeichen: nichts ist falsch. |

### Unmittelbar offen aus der Oberflächen-Runde

| | Aufwand | |
|---|---|---|
| **Die Kopfzeile bricht auf schmalen Geräten auf drei Zeilen um** | mittel | Bei 820 px hochkant frisst sie 145 px Höhe. Sie ist ein `flex-wrap`-Band aus drei Gruppen; auf einem Tablet gehörte davon einiges in ein Menü. Betrifft nur die Kopfzeile, nicht die neue Leiste. |
| **Das Gerätefenster deckt auf einem Tablet hochkant viel Fläche zu** | klein | Es ist jetzt `56 %` breit statt fest, aber bei 672 px Fläche sind das immer noch 376 px. Andocken an den Rand statt Auflegen wäre die bessere Antwort (steht schon länger auf dieser Liste). |
| **Mehr als vier Programme auf dem Bildschirm** | klein | Die Symbolspalte ist bei offenem Fenster 176 px breit und zweispaltig. Ab sechs Programmen (Webbrowser, Webserver kommen) wird sie hoch; dann braucht sie eine eigene Bildlaufleiste. |

### Unmittelbar offen aus der Subnetz-Runde

| | Aufwand | |
|---|---|---|
| ~~Weiterleitungstabelle von Hand~~ | — | **Erledigt am 2026-09-27**, siehe Abschnitt 0. |
| Überschrift des Auftrags bricht bei offener Liste auf drei Zeilen um | klein | Die Karte wird dann 258 px schmal (`body.sub-open .aufgabe`). Lesbar, aber unschön. |
| Mehr als vier Subnetze an einem Gerät | klein | `RING_MAX = 4` in `flaeche.js`. Ab dem fünften liegen die Ringe aufeinander, und nichts meldet es. Ein Router mit acht Schnittstellen in acht Netzen kommt im Unterricht nicht vor — aber es ist stillschweigend falsch. |

### Der laufende Auftrag: „mehr Programme auf dem PC"

Abschnitt 0 ist **Stufe 0** davon. Der Rest ist vom Nutzer beauftragt und steht
ausführlich im Planblatt (`~/.claude/plans/clever-moseying-wave.md`); hier die
Kurzfassung mit den Entscheidungen, die schon gefallen sind.

| Stufe | Inhalt | Neue Dateien |
|---|---|---|
| ~~**1**~~ | ~~**TCP**~~ — **gebaut**, siehe Abschnitt 0. | `js/tcp.js` ✅ |
| ~~**2**~~ | ~~**Dateisystem**~~ — **gebaut**, siehe Abschnitt 0. | `js/dateien.js`, `js/prog-dateien.js` ✅ |
| ~~**3**~~ | ~~**Webserver und Webbrowser**~~ — **gebaut**, siehe Abschnitt 0. | `js/http.js`, `js/prog-web.js` ✅ |
| ~~**4**~~ | ~~**E-Mail**~~ — **gebaut**, siehe Abschnitt 0. | `js/mail.js`, `js/prog-mail.js` ✅ |
| ~~**5**~~ | ~~**Portfreigaben**~~ — **gebaut**, siehe Abschnitt 0. | — ✅ |
| ~~**6**~~ | ~~**Weiterleitung von Hand und RIP**~~ — **gebaut**, siehe Abschnitt 0. | `js/rip.js` ✅ |
| **7** | **Echo-Server + Einfacher Client** — das Paar, das „Port" erklärt. Firewall und Gnutella ausdrücklich nicht. ⚠️ Dabei die Entscheidung über einen **Schalter TCP/UDP**: in Filius sind beide fest TCP (`ServerBaustein extends TCPServerAnwendung`; `ClientBaustein` baut einen `TCPSocket`, und im Javadoc steht, für UDP müsse man die Methode überschreiben — was nirgends passiert). Es gibt dort also **keine Anwendung, in der ein Kind UDP sieht**. Ein Schalter wäre eine Zutat, und die lohnendste offene: derselbe Auftrag sind über UDP zwei Zeilen im Mitschnitt und über TCP zehn Segmente, und mit Kabelverlust holt TCP es nach und UDP nicht. | — |

⚠️ **Die Antwort auf die Frage des Nutzers** („macht es Sinn das Port-Ding
einzubauen, damit ich im lokalen Netz einen Webserver betreiben kann?"): das sind
zwei verschiedene Dinge. **Portnummern** braucht der Webserver immer, auch im
lokalen Netz — sie sagen nicht *welches Gerät*, sondern *welches Programm auf dem
Gerät*. **Portfreigaben** braucht man nur, wenn jemand von außen durch das NAT
des Heimrouters soll. Für einen Webserver im Schulnetz genügt Stufe 1.

### Unabhängig davon weiter offen

1. **DNS mit NS-Record.**
2. **Sequenzdiagramm des Datenaustauschs** — die Beameransicht.
3. **Firewall.**

*(NAT, Heimrouter und WLAN standen bis zum 2026-09-25 auf dieser Liste; siehe
den Nachtrag *Heimrouter, NAT und WLAN*. Die **Weiterleitungstabelle von Hand**
stand bis zum 2026-09-27 hier; siehe den Nachtrag *Wege: von Hand, von
selbst*. **`traceroute`** stand bis zum 2026-09-27 hier; siehe den Abschnitt
*Elf Änderungswünsche*.)*

⚠️ **Verweise auf Nachträge bitte beim NAMEN nennen, nicht beim Buchstaben.**
Jede neue Runde kommt oben dazu und schiebt alle Buchstaben um eins weiter;
diese beiden Verweise zeigten schon vor dem 2026-09-26 ins Leere, weil das
zweimal passiert war, ohne dass sie mitgewandert sind.

---

## 4 · Wie man hier arbeitet

**Die eine Regel, die über allem steht** (vom Nutzer gesetzt, wörtlich:
*„du entfernst dich zu sehr von Filius"*):

> Der **Code** entsteht neu (GPL — ein Port wäre ein abgeleitetes Werk).
> Das **Bedienmodell** ist Filius: Aufbau, Reihenfolge, Wortlaut. Abweichen ist
> erlaubt, wo Filius nachweislich etwas falsch macht — aber dann bewusst,
> begründet und im Kommentar festgehalten. Nie aus Unkenntnis.

Nachsehen statt erfinden, die Quellen liegen im selben Repo:

* `src/main/resources/filius/messages/MessagesBundle_de_DE.properties` — jeder
  Beschriftungstext im Original
* `src/main/resources/config/Desktop_de_DE.txt` — welche Anwendungen es gibt
* `src/main/java/filius/gui/netzwerksicht/JHostKonfiguration.java`,
  `JDHCPKonfiguration.java`, `JVermittlungsrechnerKonfiguration.java`,
  `JGatewayConfiguration.java`, `JSwitchKonfiguration.java`
* `src/main/java/filius/hardware/knoten/Gateway.java` und
  `src/main/java/filius/software/system/GatewayFirmware.java` — der Heimrouter

Die **Subnetzfärbung ist die eine Ausnahme**: dafür gibt es in Filius kein
Vorbild, weil es das dort gar nicht gibt. Hier war also zu erfinden — und
entsprechend engmaschig ist geprüft.

### Prüfen

```
node tests/kerntest.js     758 Prüfungen, kopflos, ~15 s
node tests/uitest.js       727 Prüfungen im echten Chrome, ~300 s
```

⚠️ Seit der Gesten-Runde legt **kein Klick mehr ein Gerät an**. Wer im Prüfstand
eines braucht, nimmt `geraetZiehen(page, 'router')` — den Helfer oben in
`tests/uitest.js`. Ein `page.locator('[data-add="…"]').click()` öffnet jetzt das
Erklärkärtchen und sonst nichts.

⚠️ `tests/kerntest.js` hat **zwei** Funktionen namens `bau()` — die zweite steht
im Abschnitt *Subnetze* in einem Block und überschreibt die erste, weil die
Datei als Skript läuft und nicht als Modul. Alles danach nimmt `heimBau()`.
Ein Heimrouter, der **laufen** soll, kommt aus `heimNeu(netz, x, y)` — seit er
leer aus dem Karton kommt, richtet ihn keine Vorgabe mehr ein.

⚠️ Das **Ziehen mit der Maus auf dem leeren Feld verschiebt den Ausschnitt**
(wieder, seit der Beanstandung). Wer im Prüfstand ein **Rechteck** aufziehen
will, hält **Strg** (`page.keyboard.down('Control')`). Ein Rechteck darf nicht
auf einem Fenster anfangen — im Router-Szenario liegt links oben die
Auftragskarte, deshalb zieht der Prüfstand dort von rechts unten nach links
oben.

⚠️ **Und wer im Prüfstand verschiebt, muss zurückverschieben.** Nicht mit
`flaeche.einpassen()`: das rechnet einen ANDEREN Ausschnitt (alle Geräte mit
Luft), in dem die Endgeräte des Router-Szenarios unter der Auftragskarte
liegen — die folgenden Prüfungen klicken dann ins Leere. Denselben Zug mit
derselben Hand zurück, dann stimmt es.

Beide müssen grün sein. `tests/uitest.js` legt außerdem Bilder ab
(`shot-hell.png`, `shot-karten.png`, `shot-karten-dunkel.png`,
`shot-dhcp.png`, `shot-dunkel.png`); dazu kommen `shot-subnetze.png`,
`shot-subnetze-dunkel.png`, `shot-heimrouter.png`,
`shot-heimrouter-dunkel.png`, die drei Mailbilder und `shot-dateien.png`
(der Datei-Explorer mit `/Bilder` und der neuen Knopfreihe).

**⚠️ Die Bilder sind kein Beiwerk.** Beide Fehler aus Abschnitt 2 oben waren in
beiden Prüfständen grün und im Bild sofort zu sehen. Wer etwas an der Fläche
ändert, muss hinsehen — nicht nur messen.

### Fehlersuche

`window.SIM` in der Konsole: `engine`, `netz`, `stack`, `flaeche`, `panels`,
`geraet`, `dienste`, `konfig`, `subnetze`, `subnetzeZeigen`, `setModus`,
`leisteSetzen`, `leisteZu`.
Die aktuelle Subnetzrechnung steht in `SIM.flaeche.subnetze`, der Ausschnitt
hinter `SIM.flaeche.zoom` / `.zoomIn()` / `.zoomOut()` / `.einpassen()` /
`.zoomZurueck()`.

Für Heimrouter und WLAN:
`SIM.stack.natTabelle(node)` zeigt, wer hinter welchem Außenport steckt,
`SIM.netz.zugangspunkte()` alle ausgestrahlten Netznamen,
`SIM.netz.funkAbgleich()` stellt die Funkverbindungen neu her, und
`SIM.netz.portLabel(node, i)` / `.brueckeNic(node, i)` / `.bruecke(node, i)`
beantworten „welcher Anschluss ist das" und „welche Buchsen gehören zusammen".
⚠️ **Nach jeder Änderung am Modell aus der Konsole** braucht es
`SIM.flaeche.draw()` — `netz.changed()` zeichnet die Fläche nicht neu.
