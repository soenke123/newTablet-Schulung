# Was Filius kann — und was davon hier steht

Abgeglichen am 2026-09-24 gegen Filius 2.14.0 aus diesem Repo, nachgezogen am
2026-09-27 (Weiterleitung von Hand, RIP, Portfreigaben — und in einer zweiten
Runde desselben Tages: statische DHCP-Zuweisung, `traceroute`, Einfuhr echter
Dateien, Anmeldung im E-Mail-Programm) und am 2026-09-28 (die
Weiterleitungstabelle als Fenster, NAT ohne Schalter, Reiterreihenfolge am
Heimrouter). Quellen des Abgleichs, nicht der Erinnerung:

* `src/main/resources/config/Desktop_de_DE.txt` — die 13 Anwendungen
* `src/main/resources/filius/messages/MessagesBundle_de_DE.properties` — jede Beschriftung
* `src/main/java/filius/hardware/knoten/` — die Gerätearten
* `src/main/java/filius/software/` — die Protokolle und Dienste
* `src/main/java/filius/gui/` — die Ansichten und Dialoge

Zeichen: **✅** vorhanden · **🟡** teilweise · **❌** fehlt · **⛔** bewusst nicht

---

## 1 Geräte

| Filius | hier | Anmerkung |
|---|---|---|
| Rechner (heißt hier **Endgerät**) | ✅ | |
| Notebook (gleiche Fähigkeiten, anderes Bild) | ✅ | hier heißen die weiteren Bilder **Server** und **Handy** — gleiches Prinzip, drei Bilder desselben Geräts. In der Leiste stehen sie als eine Gruppe *Endgeräte* nebeneinander. |
| — (Filius hat kein Handy) | ⭐ | Dasselbe Gerät mit einem eigenen **Bildschirmlayout**: hochkant, Raster statt Schreibtisch, ein Programm im Vollbild, Leiste unten. Nichts im Kern fragt die Geräteart ab, um etwas zu erlauben — der kopflose Prüfstand bewacht das mit einem Ping vom Handy zum Rechner. ⭐ **Seit 2026-09-27 hat es keine Kabelbuchse** und geht nur über WLAN ins Netz; das steht als Merkmal am KIND (nurFunk) und nicht als Abfrage auf die Geräteart. Filius kennt die Unterscheidung nicht — es kennt aber auch kein Handy. |
| Switch | ✅ | |
| — feste **24 Anschlüsse**, Meldung „Maximale Anzahl angeschlossener Geräte überschritten" | ⭐ | Hier **wächst der Switch von selbst**: jedes Kabel bekommt eine Buchse, fünf sind es beim Ablegen, bis 50 Geräte gehen, dann erst eine Meldung (`netz.js`, `freieNic`, seit 2026-09-28). Es gibt am Switch **keinen Knopf** *Schnittstelle hinzufügen* mehr. Nutzerentscheidung: „Die können einfach Geräte verbinden und fertig … Erweiterung der Zugänge, die müssen simpel und einfach sein." ⭐ Die Begründung ist didaktisch und nicht bequem: **dass ein Switch verteilt, ist keine Aufgabe** — die Zahl der Löcher in seinem Gehäuse ist für nichts der Gegenstand. Beim **Router** ist es genau umgekehrt (jedes neue Netz braucht eine eigene Adresse), und der behält seinen Knopf mitsamt der Filius-Grenze 8 |
| — SAT-Tabelle als eigenes Fenster (Kontextmenü) | 🟡 | steht im Gerätefenster hinter *Mehr ›*, im Aktionsmodus direkt beim Antippen |
| — Gültigkeitsdauer SAT-Einträge einstellbar | ❌ | `MAC_TTL` ist fest verdrahtet |
| — „als Wolke darstellen" | ❌ | Switch als Wolke = „hier ist ein Netz, egal wie" |
| — WLAN-Zugangspunkt, Feld „Name WLAN (SSID)" | ✅ | Abschnitt *WLAN* im Gerätefenster. **Eine Zutat:** ein Schalter *WLAN ausstrahlen* davor. In Filius IST der leere Name das Aus — dann heißt „WLAN abschalten" aber „den Namen löschen", und beim Einschalten ist er weg. Beim ersten Einschalten wird ein Name vorgeschlagen (`WLAN-SW1`). **Funkgeräte belegen keinen der nummerierten Anschlüsse** (Filius nimmt dort `holeFreienPort()`) — ein Switch mit drei Handys wäre sonst fast voll, und das behauptet etwas Falsches über die Hardware |
| Vermittlungsrechner (Router) | ✅ | |
| — Reiter im Konfigurationsfenster (`JTabbedPane`: *Allgemein*, *Netzwerkkarte 1…n*, *Weiterleitungstabelle*) | 🟡 | hier zwei Reiter: *Allgemein* und *Netzwerkkarten* — alle Karten stehen **untereinander in einem** Reiter, weil „welche Adresse hat welche Karte" sonst nur durch Hin- und Herklicken zu beantworten wäre. Aufgeschlagen ist *Netzwerkkarten*, nicht wie dort *Allgemein* |
| — Weiterleitungstabelle, Einträge von Hand | ✅ | Seit 2026-09-27 im Reiter *Allgemein* (Filius: eigener Reiter). Spalten wie dort: *Ziel · Netzmaske · Nächstes Gateway*. ⚠️ Der Knopf *Neue Zeile* (`msg2`) steht seit 2026-09-28 **nur noch im Fenster** — im Kärtchen stehen dort die Überschrift, **ein** Erklärsatz und der Knopf ins Fenster, sonst nichts (Nutzer: „kein ‚Neue Zeile', kein Blabla drum herum, maximal ein Erklärsatz"). ⭐ **Eine Abweichung, und sie ist eine Verbesserung:** die vierte Spalte *Über Schnittstelle* ist hier **kein Feld, sondern eine Auskunft**. Sie FOLGT aus dem Gateway; in Filius tippt man sie mit und kann damit eine Zeile bauen, die sich selbst widerspricht. Nebenertrag: wer ein Gateway einträgt, das in keinem eigenen Netz liegt, sieht das sofort statt beim Ping. ⚠️ Seit 2026-09-28 **nicht mehr beim Heimrouter** (Nutzerentscheidung — er hat genau zwei Seiten und schickt alles Fremde nach draußen); weitergeleitet wird dort unverändert |
| — Knopf „Als Fenster öffnen" (`msg14`, 600×400-Dialog) | ⭐ | Seit 2026-09-28 der Knopf *Zur Weiterleitungstabelle* — und dahinter kein Dialog, sondern eine Leiste **unten über die ganze Breite** (`js/weiterleitung.js`) mit **einem Reiter je Router**. Dort erst hat die Tabelle die **vier Spalten mit echter Kopfzeile**, die Filius hat (im schmalen Kärtchen passen die Namen in keine). ⭐ Die Reiter sind die Zutat: drei Router nacheinander einrichten, ohne ein Fenster zu suchen — und das Gerät des Reiters ist auf der Fläche markiert und zeigt dort seine Netze. ⚠️ Der Knopf steht nur, solange *Automatisches Routing* AUS ist; mit Haken steht unter der Überschrift nur „Wird beim automatischen Routing nicht benötigt." Filius sperrt dort denselben Zustand, indem es den ganzen Reiter ausgraut (`setEnabledAt(…, !isRipEnabled())`) — ein ausgegrauter Reiter sagt aber nicht, warum |
| — „Alle Einträge anzeigen" (`msg11`, auch die automatischen) | ✅ | Seit 2026-09-28 **wörtlich wie in Filius**: ein Haken in der Kopfleiste des Fensters, und wie dort **zuerst gesetzt**. Die automatischen Zeilen (direkt · RIP · Standard) stehen **in derselben Tabelle** wie die von Hand — **grau und ohne Feld**, also nicht zu bearbeiten. Dazu eine Spalte *Herkunft*, die Filius nicht hat. ⚠️ Hier standen eine Runde lang **zwei Tabellen untereinander** („Von Hand eingetragen" / „Alle Einträge"); vom Nutzer gestrichen — ein Router hat EINE Weiterleitungstabelle, und die Reihenfolge der Zeilen ist genau die Rangfolge, nach der `routeFor` entscheidet |
| — Firewall einrichten | ⭐ | Seit 2026-10-02, `js/firewall.js`. Bei **Router, Heimrouter und cww** — an den Geräten, die Wege vermitteln. Im Reiter *Allgemein* ganz unten ein Knopf **Firewall**, der zeigt, ob sie läuft (grün, pulsierender Punkt) oder nicht (grau); dahinter eine Seite mit dem Haken *Firewall aktivieren* zuoberst, dem **Listentyp** (Blacklist / Whitelist) und der Liste. Auf der Fläche trägt ein laufendes Gerät **unten links** ein farbiges Zeichen (Mauer mit Flamme); es weicht dem Aus-Zeichen und den WAN/LAN-Schildchen aus. Siehe unten beim Regelwerk |
| — Automatisches Routing (RIP) | ✅ | Seit 2026-09-27, `js/rip.js`. Distanzvektor über UDP 520 (gesendet von 521, Rundruf), **Unendlich = 16**, **Split Horizon**, Ansage außer der Reihe, ablaufende Wege — Verfahren und Zahlen aus `filius/software/rip/`. Nur am Router, wie dort (die Gateway-Konfiguration hat den Schalter auch in Filius nicht). ⚠️ **Eine bewusste Abweichung:** hier ERGÄNZT RIP die Tabelle von Hand, in Filius ERSETZT es sie (`holeWeiterleitungsEintrag` nimmt entweder die eine oder die andere). Wer dort eine Zeile einträgt und danach RIP anschaltet, sieht seinen Eintrag stillschweigend außer Kraft treten. Hier gilt die Rangfolge echter Geräte: bei gleicher Maske schlägt „von Hand" das „vom Nachbarn gehört". ⛔ Nicht dabei: Poison Reverse (hat Filius auch nicht), RIPv2, Request/Response |
| — Dialog „Verbindungen verwalten" (Kabel umstecken) | ❌ | hier zieht man das Kabel neu — eher besser |
| **Gateway / Heimrouter** (`Gateway.java`, `hw_gateway_msg1`) | ✅ | Karte 0 = WAN, Karten 1…n = LAN, NAT, DHCP-Server auf LAN, DHCP-Client auf WAN — alles wie dort. ⚠️ **Abweichung seit 2026-09-26:** er kommt **leer** aus der Leiste, während Filius im Konstruktor Adressen setzt. Nutzerentscheidung: „Ein Heimrouter braucht nichts defaultmäßig ausgefüllt." Ein vorausgefülltes Feld nimmt die Frage vorweg, die die Aufgabe stellt. Es bleiben nur die Eigenschaften, die keine Angabe sind: WAN fragt den Anbieter, NAT an, WLAN aus |
| — Heimrouter mit genau **einem** LAN-Anschluss | ⭐ | Hier **mehrere**, „so wie richtige Heimrouter" (Nutzerentscheidung). Die LAN-Buchsen sind ein **eingebauter Switch**: EIN Rundrufbereich, EINE IP- und MAC-Adresse. Damit steht die Frage im Raum, die Filius gar nicht erst stellt — vier Buchsen, aber nur eine Adresse? —, und ihre Antwort ist die Wahrheit über das Gerät |
| — Reiter des Heimrouter-Dialogs (`JTabbedPane`: *Allgemein*, *Netzwerkkarte*, *Netzwerkkarte*) | 🟡 | hier seit 2026-09-28 **Allgemein · WAN · LAN**, aufgeschlagen *LAN* — dieselbe Reihenfolge wie dort (Nutzer: „Mach beim Heimrouter auch den Allgemeinreiter als erstes, wie beim Router"). Die Stelle im Band sagt, wohin etwas gehört, nicht, womit man anfängt: gebaut wird auf der LAN-Seite. Filius nennt **beide** Kartenreiter „Netzwerkkarte" und unterscheidet sie nur über ihre Stelle im Band — „trag es in der zweiten Netzwerkkarte ein" ist keine Anweisung, die ein Kind nachprüfen kann. Die zwei Wörter stehen auch auf dem Gehäuse |
| — Portfreigaben (`JPortForwardingDialog`) | ✅ | Seit 2026-09-27. Spalten von dort: *Protokoll · Portfreigabe · LAN-Adresse · LAN-Port* (`jportforwarding_msg4…7`). Filius hat dafür einen eigenen Dialog; hier steht die Liste **direkt unter dem NAT-Satz** — der behauptet „von außen kann niemand anfangen", und das hier ist die einzige Ausnahme davon. ⭐ Umgesetzt als **dieselbe Liste für beide Richtungen**, nicht als künstliche Zeile in der dynamischen Tabelle: sonst könnte der Rückweg anders antworten als der Hinweg (die Antwort ginge mit einer vergebenen 40001 hinaus statt mit dem freigegebenen Port). In der NAT-Tabelle steht sie mit der Spalte *woher* — `Freigabe` gegen `Gespräch` — und zwar **bevor das erste Paket lief** |
| — Firewall auf dem Heimrouter | ⭐ | Wie beim Router, derselbe Knopf, dieselbe Seite. Geprüft wird **nach der Wegewahl und VOR NAT**: beim Hinausgehen sehen die Regeln noch die private Adresse, beim Hereinkommen hat NAT die Antwort schon zurückübersetzt |
| Modem (verbindet zwei Filius-Instanzen über TCP) | ⭐ | Seit 2026-09-28 das **Class Wide Web (cww)** — eine Wolke mit „cww" darin (`js/internet.js`, Migration `0181_synir_cww.sql`). Filius verbindet genau **zwei** Instanzen Punkt zu Punkt; hier hängen **alle Tablets eines Raums** zusammen, jedes mit einem eigenen /8 (die Lehrkraft 100), und der Raum trägt die Pakete. Höchstens ein cww je Netz. Nach innen ein Router (Tabelle nur für das eigene /8, RIP, DHCP-Server), nach draußen fest „alles andere → Internet". ⭐ **Zutaten, die Filius nicht hat:** die Absenderprüfung (BCP 38: nur Adressen aus dem eigenen /8 kommen hinaus, am cww UND am Server geprüft), „Ziel nicht erreichbar" für ein /8, das niemandem gehört, und **8.8.8.8** als öffentlicher DNS, der die Namen aller von draußen erreichbaren DNS-Server kennt (wer zuerst kommt, bekommt den Namen). ⚠️ **Die eine bewusste Vereinfachung:** der echte 8.8.8.8 fragt die zuständigen Server rekursiv; hier ist er ein Sammelverzeichnis, in das man hineinsehen kann |
| Kabel | ✅ | In Filius hat ein Kabel **gar keine Eigenschaften** (`Kabel.java` ist eine leere Klasse mit einem Namen). Hier zusätzlich **Laufzeit je Kabel einstellbar** (10–600 ms) und **Paketverlust** (0–50 %, der Zufall hängt am Startwert der Uhr). ⚠️ Die Laufzeit ist eine **Dauer und keine Datenrate** — Glasfaser gegen Kupfer lässt sich damit nicht zeigen, und der Hilfetext sagt das seit dem 2026-09-28 selbst. Eine Bandbreite könnte erst etwas zeigen, wenn eine Datei aus vielen Rahmen besteht; es gibt hier bewusst keine MSS und keine Fragmentierung |
| Endgerät mit **mehreren** Netzwerkkarten + „IP-Weiterleitung aktivieren" | ❌ | in Filius kann ein Rechner selbst zum Router werden |
| „IP-Adresse als Name verwenden" / „MAC-Adresse als Name verwenden" | ❌ | Kleinigkeit, aber im Unterricht nützlich (Gerät ohne erfundenen Namen) |

## 2 Protokolle

| Filius | hier | Anmerkung |
|---|---|---|
| Ethernet, Rahmen, Switch mit MAC-Lernen und Fluten | ✅ | |
| ARP | ✅ | |
| IP mit Weiterleitungstabelle, TTL | ✅ | |
| ICMP (Echo, unerreichbar, Zeit abgelaufen) | ✅ | |
| UDP mit Ports und Sockets | ✅ | ⚠️ **Eine Anwendung, in der ein Kind UDP zu Gesicht bekommt, gibt es weder hier noch dort.** Benutzt wird es in Filius von DHCP, DNS und RIP, hier von denselben dreien. Filius' Echo-Paar ist fest TCP: `ServerBaustein extends TCPServerAnwendung`, `ClientBaustein.initialisiereSocket` baut einen `TCPSocket`, und im Javadoc darüber steht ausdrücklich, für UDP müsse man die Methode überschreiben — was nirgends passiert. `UDPServerAnwendung` liegt dort ungenutzt herum. Ein Schalter TCP/UDP im Echo-Paar wäre also eine **Zutat** und keine Nachbildung; siehe die Reihenfolge unten |
| **TCP** (Segmente, Drei-Wege-Handschlag, Sockets, ServerSocket) | ✅ | Seit 2026-09-26, `js/tcp.js`. Handschlag, Bestätigung, Vier-Wege-Abbau, RST, **eine** Wiederholung je Segment. Sequenznummern zählen Bytes, SYN und FIN verbrauchen je eine. ⛔ Bewusst nicht: Fenstergröße und Flusskontrolle, Überlastregelung, Puffer für die falsche Reihenfolge, TIME-WAIT |
| DHCP: Discover/Offer/Request/Ack | ✅ | |
| — statische Adresszuweisung MAC → IP | ✅ | seit 2026-09-27. Wortlaut von dort (`jdhcpkonfiguration_msg11…15`: *Statische Adresszuweisung*, *MAC-Adresse*, *IP-Adresse*, *Hinzufügen*, *Entfernen*), und wie dort gewinnt sie vor dem Bereich und muss **nicht** darin liegen. ⭐ **Zutat:** die MAC-Adressen der Endgeräte stehen als anklickbare Kürzel darunter — dort tippt man siebzehn Zeichen ab, und eine Reservierung, die an einem Zeichen scheitert, sieht aus wie ein kaputtes DHCP |
| — die Vergabe ist nicht vorhersehbar | ⭐ | Gewürfelt wird an drei Stellen: **wann ein Client fragt** (RFC 2131 verlangt das ohnehin), **wann ein Server antwortet** und **wo im Bereich** gesucht wird. Filius zählt einen Ring über `lastOfferedAddress` hoch und beantwortet damit „wer bekommt was" aus der Reihenfolge der Geräte. ⚠️ Reproduzierbar bleibt es: alles hängt am Startwert des Würfels |
| — „Manuelle Einstellungen" (eigene statt übernommener Werte) | 🟡 | hier stehen Maske/Gateway/DNS immer im Formular; Filius übernimmt sonst die des Servers |
| DNS: A-Record, Auflöser mit Zwischenspeicher | ✅ | |
| — **NS-Record** (Verweis auf einen anderen DNS-Server, Rekursion) | ❌ | Filius kann eine Domain an einen zweiten Server delegieren — das ist die eigentliche Aussage über DNS |
| — **MX-Record** | ✅ | Eigene Liste im DNS-Fenster (*Maildomain* / *Domainname Mailserver*, Wortlaut von dort; Filius hat dafür einen eigenen Reiter). ⚠️ Der Zwischenspeicher gilt nur für A-Einträge — ein MX-Ergebnis ist ein NAME und keine Adresse |
| NAT (Quell-NAT mit Portübersetzung, NAT-Tabelle) | ✅ | `js/nat.js`. NAPT nach RFC 3022: **UDP- und TCP-Port** bzw. ICMP-Kennung werden mitübersetzt, sonst wäre der Rückweg nicht eindeutig. Tabelle steht bei den anderen Tabellen des Geräts (Filius hat dafür ein eigenes Fenster, `NatViewer`). ⚠️ **Seit 2026-09-28 ohne Schalter**, wie in Filius: dort installiert `GatewayFirmware` die NAT-Anwendung fest und es gibt kein Kontrollkästchen. Hier stand eine Weile eines (Begründung: ohne NAT sieht man im Mitschnitt, dass nichts zurückkommt). Vom Nutzer gestrichen — „Heimrouter nutzen immer NAT. Das sollte dann auch da stehen." An seiner Stelle steht der Satz. Im Modell (`node.nat.on`) gibt es das Aus weiter, und der kopflose Prüfstand fährt es auch weiter |
| — Portfreigaben | ✅ | siehe oben beim Heimrouter |
| — Übersetzung der Adressen in ICMP-Fehlermeldungen von außen | ❌ | ein „Ziel nicht erreichbar" aus dem Internet landet beim Heimrouter statt beim Rechner, der gefragt hat. Dafür müsste der eingepackte Originalkopf mitübersetzt werden |
| RIP (Routing-Protokoll) | ✅ | `js/rip.js` — Einzelheiten oben beim Router. Im Mitschnitt ein eigener Chip **RIP** mit eigener Farbe, Klartextzeile („ich kenne 192.168.3.0 (1), …") und einer Anwendungsschale auf **Schicht 7** — es benutzt UDP, es ist keins. ⚠️ **Die Zeiten sind skaliert:** Filius nimmt 30 s Takt und 75 s Frist in ECHTEN Sekunden; hier zählt simulierte Zeit, also **5 s und 12,5 s** — Filius' Verhältnis 5/2 bei Zahlen, die eine Unterrichtsstunde aushält |
| Firewall: Regelwerk (Quell-/Ziel-IP + Maske, Port, Protokoll, akzeptieren/verwerfen, Reihenfolge, Standardaktion, ICMP filtern, nur SYN verwerfen) | 🟡 | Seit 2026-10-02, **bewusst einfacher als Filius** (Nutzerentscheidung: „die Firewall soll einfach alles blockieren"). **Eine Liste, ein Typ:** *Blacklist* (die Liste wird gesperrt) oder *Whitelist* (nur die Liste kommt durch). Eine Zeile = **Adresse + Netzmaske** (ohne Maske: genau ein Gerät) oder ein **Name** (wird aufgelöst, gesperrt wird die Adresse); sie trifft **Absender oder Ziel**, also in beide Richtungen. Unter jeder Zeile steht, was daraus folgt („von … bis … · N Adressen"). ⭐ **Zutaten, die Filius nicht hat:** die zweite Art des Sperrens **ablehnen** neben *verwerfen* (sofort ICMP 3/13 „verboten" statt Stille — der Unterschied zwischen DROP und REJECT im Mitschnitt), **Namen** als Eintrag, **Treffer je Zeile** mit Zählern, und im Mitschnitt die gesperrte Zeile mit ihrer Nummer (auch in der Voreinstellung „nur raus"). ⛔ **Nicht dabei, absichtlich:** Port, Protokoll, Schnittstelle, Reihenfolge und Ausnahmen innerhalb einer Liste, *nur SYN verwerfen* (TCP-Flags), und Pakete an das Gerät SELBST (die Wand schützt das Netz dahinter, nicht den Router) |
| WLAN (drahtlose Verbindungen, SSID, Zugangspunkt) | ✅ | Wie dort: eine Funkverbindung ist im Modell ein **Kabel mit `funk: true`** und geht denselben Weg (MAC-Lernen, ARP-Rundruf, Mitschnitt, Subnetzfärbung). Gezeichnet **gestrichelt**, wie in Filius (`JCablePanel`, dash 10) — nur nicht zusätzlich grau, denn sie gehört zu einem Subnetz wie jede andere Verbindung. Zugangspunkt: Switch und Heimrouter. Gerät: *Kabelgebunden (LAN)* / *Drahtlos (WLAN)* + Auswahlliste „Bitte auswählen", Wortlaut aus `jhostkonfiguration_msg13…16` |
| — WLAN-Verschlüsselung, Feldstärke, Reichweite | ⛔ | gibt es in Filius auch nicht. Bei gleichem Namen zweimal gewinnt der erste in der Liste — nachvollziehbar und immer derselbe; eine erfundene Feldstärke hieße, eine Verbindung von einer unsichtbaren Zahl abhängig zu machen |

## 3 Anwendungen — die 13 Einträge aus `Desktop_de_DE.txt`

| Filius | hier | braucht | Anmerkung |
|---|---|---|---|
| Befehlszeile | ✅ | | Befehlssatz siehe Abschnitt 4 |
| DNS-Server | ✅ | | nur A-Records |
| **Webbrowser** | ✅ | | Adresszeile mit festem Vorsatz `http://` (Filius schreibt ihn INS Feld), Knopf *Start*, Fehlerseiten mit dem Wortlaut von dort. ⭐ **Zusätzlich: unter der Seite steht, was für sie geholt wurde** — drei Marken mit Status. Gezeichnet in einem `<iframe sandbox>` ohne `allow-scripts`: echtes CSS (Filius rendert mit Swing-HTML-3.2), kein JavaScript. Ein **Port im URL** ist hier erlaubt, in Filius nicht (`WebBrowser.java:108` verdrahtet 80) |
| **Webserver** | ✅ | | Ordner `/webserver`, Port 80, Standardseite bei der Installation — alles wie dort, nur mit eigenem Text und drei statt zwei Dateien (die Stildatei ist der Grund für die zweite Anfrage). ⛔ Bewusst nicht: **virtuelle Hosts** (Kontrollkästchen „Verwende virtuelle Hosts" + Tabelle Hostname/Unterverzeichnis) und die **Plug-in-Schnittstelle**. Der `Host:`-Kopf wird mitgeschickt und angezeigt, aber nicht ausgewertet |
| E-Mail-Programm | ✅ | | Ein Konto je Gerät (wie dort), Wortlaut von dort: *Posteingang* / *Gesendete* / *E-Mails abrufen* / *Neue E-Mail verfassen* / *An:* / *Betreff:* / *Senden*, Konto mit *POP3-Port* und *SMTP-Port* vorbelegt, dazu *E-Mail beantworten* (msg9) mit *RE:* (msg18), *schrieb:* (msg19) und zitiertem Text — in Filius ein Symbol in der Kopfleiste, hier ein Knopf unter der Nachricht. ⭐ **Zwei Zutaten:** statt *E-Mail-Adresse* wird die **Maildomain** getippt und die Adresse daraus abgeleitet (Filius tippt die ganze Adresse), und ein Knopf **Anmelden** prüft die Angaben einmal bei POP3 UND SMTP, bevor der Posteingang aufgeht. Filius hat keinen Login — dort merkt man beim ersten Senden, ob es stimmt, und ein Tippfehler im Servernamen sieht aus wie ein fehlender MX-Eintrag. ⛔ Kein Adressbuch, kein CC/BCC, keine Anhänge. 🟡 Keine Reiter — Formular und Liste stehen untereinander |
| E-Mail-Server | ✅ | | *Maildomain*, *Neues Konto* (Benutzername, Vorname und Nachname, Passwort), *Konten-Liste* mit *E-Mail Adresse* und *Anzahl Mails* — Wortlaut von dort. SMTP auf 25, POP3 auf 110, ein Schalter für beides. Post an eine fremde Domain wird über den **MX-Eintrag** weitergereicht. ⭐ **Beim Anlegen eines Kontos meldet der Server jeden der vier Fälle** — Wortlaut von dort, wo es ihn gibt (msg24 Leerzeichen, msg25 leere Angabe, msg22+23 angelegt). Für „Name schon vergeben" hat Filius KEINEN Text: dort gibt benutzerHinzufuegen still false zurück und das Fenster meldet trotzdem „wurde angelegt". ⚠️ Und der Vergleich ist hier case-insensitiv, wie die Kontensuche in POP3 — „Anna" und „anna" wären sonst zwei Konten, von denen POP3 immer nur das erste findet. ⛔ Kein Log-Reiter |
| Echo-Server | ❌ | TCP | Port wählbar — das kleinste denkbare Serverprogramm. Wortlaut von dort: *Port:* / *Starten* / *Anhalten* |
| Einfacher Client | ❌ | TCP | Gegenstück dazu; zusammen erklären die zwei „Port". Wortlaut: *Server-Adresse:* / *Server-Port:* / *Verbinden* / *Nachricht:* / *Senden* / *Trennen* |
| Firewall (auf dem Endgerät, nicht nur im Router) | ❌ | TCP | Seit 2026-10-02 gibt es sie nur an den drei Vermittlungsgeräten (Router, Heimrouter, cww) — Nutzerentscheidung: „das nur bei Routern bauen" |
| Text-Editor | ⭐ | | **Keine eigene Anwendung** — eine Ansicht des Datei-Explorers. Ein Klick auf eine Textdatei öffnet sie. Dazu **Hervorhebung für HTML und CSS**, die Filius nicht hat, und JavaScript durchgestrichen mit einem Satz dazu. Wörter von dort: *Neu · Öffnen · Speichern · Speichern unter* |
| Bildbetrachter | ⭐ | | **Keine eigene Anwendung** — ein Klick auf ein Bild zeigt es. Bilder liegen ab Werk im Ordner **`/Bilder`** (vier eingebaute SVGs, seit 2026-09-28) oder kommen **von der Festplatte** (seit 2026-09-27; Filius deckelt bei 150 KB, hier 2 MB je Datei und 4 MB je Netz) |
| Datei-Explorer | ✅ | | **Ohne Installation auf jedem Endgerät** (in Filius installierbar). ⭐ **Ein Klick öffnet die Datei** — das kann der Explorer dort gar nicht. Knöpfe statt Rechtsklickmenü (auf einem Tablet gibt es keinen Rechtsklick), gefragt wird in der Zeile statt im Systemdialog. **Drei Knöpfe** seit 2026-09-28: *Ordner erstellen · Neue Textdatei · Datei hochladen* — der letzte nimmt **Bild und Text**, die Endung entscheidet. Vorher waren es vier, weil eine Galerie der eingebauten Bilder einen eigenen hatte; die Bilder liegen jetzt als Ordner da und brauchen keinen |
| Gnutella (Peer-to-Peer) | ❌ | TCP, Dateisystem | Ping/Pong/Query/QueryHit — didaktisch stark, aber teuer |
| Software-Installation (Verfügbar / Installiert) | ⭐ | | Seit 2026-09-26 ein **Appstore**: ein Kachelraster statt zweier Spalten, Haken auf der Kachel statt Spaltenwechsel, Frage *„… deinstallieren?"* **in der Kachel** statt eines Systemdialogs. Filius' Zwischenschritt „Änderungen annehmen" gab es hier nie. ⚠️ Die Frage darf **kein** `confirm()` sein: der Browser-Prüfstand nimmt Dialoge automatisch an und wäre dort blind |

**Dateisystem je Endgerät** (`software/system/Dateisystem.java`, Ordnerbaum,
Dateien, Import echter Dateien von der Festplatte): ✅ seit 2026-09-26,
`js/dateien.js`. **Flach statt Baum** (Pfad → Eintrag), weil das schon JSON ist
und damit ohne Übersetzung durch Speichern, Strg+Z und Einfügen geht; ein Ordner
ist ein eigener Eintrag, damit es leere Ordner geben kann. ⭐ **Ein neues Gerät
hat einen Ordner `/Bilder`** mit den vier eingebauten Bildern (seit
2026-09-28) — dort besteht der Baum aus `root` und sonst nichts. Der Bruch ist
eine Nutzerentscheidung und kleiner, als er aussieht: die Regel „was dasteht,
hat jemand hingestellt" richtet sich gegen vorweggenommene **Antworten** (eine
eingetragene IP-Adresse), und Bilder sind **Material**. Sie kosten keinen Platz
(es sind Verweise) und lassen sich wegwerfen wie jede andere Datei — `fromJSON`
legt sie NICHT wieder an. ✅ Das **Hochladen echter Dateien** seit 2026-09-27:
Text bis 64 KB bleibt im Eintrag (und damit im Editor bearbeitbar), alles andere
liegt im **Inhaltsspeicher** neben dem Netz. Grenzen 2 MB je Datei und 4 MB je
Netz (Filius: 150 KB), gemessen an der Daten-URI. ⚠️ Der Umweg ist nötig, weil
das Speicherformat auch das Format des VERLAUFS ist — sechzig Stände mal ein
Foto wären zäh.

## 4 Terminal-Befehle

Filius kennt 25, hier sind es 19.

| | |
|---|---|
| **beide** | `ping` · `traceroute`/`tracert` · `ipconfig` · `arp` · `route` · `nslookup` · `netstat` · `help`/`hilfe` · `ls`/`dir` · `cd` · `pwd` · `cat`/`type` · `mkdir` · `touch` · `rm`/`del` |
| **nur Filius, ohne Dateisystem** | `tcpdump` · `host` · `arpsend` |
| **nur Filius, mit Dateisystem** | `cp`/`copy` · `mv`/`move` |
| **nur hier** | `dhcp [neu]` · `mactabelle` · `vergiss` |

`traceroute` war der lohnendste davon und ist seit 2026-09-27 gebaut: eine
Stufe nach der anderen (nicht drei Pakete gleichzeitig wie echte Werkzeuge —
hier soll man zusehen können), Obergrenze 15 statt 30.

## 5 Ansichten und Werkzeuge

| Filius | hier | Anmerkung |
|---|---|---|
| Entwurfsmodus / Aktionsmodus | ✅ | wie dort: eingestellt wird im **Entwurf** am Kärtchen (Filius: `JHostKonfiguration` am Netzplan). ⚠️ Eine Runde lang gab es dafür ein Programm *Einstellungen* auf dem Bildschirm des Geräts; am 2026-09-26 auf Wunsch des Nutzers zurückgenommen („Einstellungen kann weg"). Im Aktionsmodus bleibt die Adresse **lesbar** — Kopfzeile des Bildschirms und `ipconfig` |
| Simulationsgeschwindigkeit | ✅ | hier fünf geeichte Stufen statt eines Zahlenreglers |
| Datenaustausch je Gerät (Lauscher) | ✅ | Filius: Rechtsklick → *Datenaustausch anzeigen (192.168.1.10)*, ein Eintrag je Netzwerkkarte, ein Reiter je Karte. Hier: ein Gerät **antippen** schränkt den Mitschnitt darauf ein (Chip *nur Endgerät 1* in der Leiste löst es wieder). Damit gibt es beides — den Weg quer durchs Netz *und* den Blick auf eine Station. ⚠️ Eingeschränkt wird auf **ein** Gerät: bei mehreren markierten zeigt die Liste wieder alles, denn die Frage „warum reden die beiden nicht" ist eine über den Verkehr *zwischen* ihnen |
| Beide Richtungen je Karte aufzeichnen | ✅ | wie dort (`Ethernet.java` beim Senden, `EthernetThread.java` beim Empfangen). Gezeigt wird voreingestellt nur „gesendet", sonst stünde über das ganze Netz gesehen jeder Rahmen zwei- bis viermal da; bei gewähltem Gerät kippt es auf „beide". Der Knopf nennt die Zahl der ausgeblendeten Zeilen. Spalte mit ↑ / ↓ |
| Schichtensicht: **eine Zeile je Schicht** (Spalten Nr. · Zeit · Quelle · Ziel · Protokoll · Schicht · Bemerkungen) | ✅ | Filius' `LayeredMessageTable`, nachgebaut mit seinen Spalten, seinen vier Schichtnamen (*Netzzugang · Vermittlung · Transport · Anwendung*, `rp_lauscher_msg8…11`) und seinen Farben (`LayerColorVar`). Umschaltbar über *Zeilen / Schichten*. Die Aussage dahinter ist Filius' bester didaktischer Einfall: **Quelle und Ziel wechseln mit der Schicht** — MAC, dann IP, dann Portnummer, untereinander in derselben Spalte. ⚠️ Zwei Abweichungen, beide bewusst: die Protokollspalte der Ethernet-Zeile steht bei Filius **leer**, hier steht „Ethernet"; und ein Ping bekommt hier **drei** Zeilen (Ethernet · IP · ICMP) statt zwei, weil die TTL im IP-Kopf steht und nicht im ICMP-Paket |
| Aggregierte Ansicht des Datenaustauschs (Sequenzdiagramm zwischen Geräten) | ❌ | Filius zeichnet Pfeile zwischen Gerätespalten — das ist die Ansicht, die im Unterricht an die Wand gehört |
| Schichtensicht als **verschachtelte Kästen** (`MessageDetailsTable`) | 🟡 | hier als aufklappbare Schalen unter der Zeile, nicht als ineinandergezeichnete Rechtecke |
| **Dokumentationsmodus** (Textfelder und Gliederungsflächen auf dem Netzplan, Farbe, Schriftstil, Schriftgröße) | ❌ | Filius' Antwort auf „wie beschriftet die Lehrkraft eine Aufgabe" |
| Als Bild exportieren | ❌ | |
| Report als PDF (Übersicht, Komponenten, Basiskonfiguration, Schnittstellen, Anwendungen, Weiterleitungstabelle, DNS-Konfiguration, Datenaustausch) | ❌ | für ein Arbeitsblatt oder zum Abgeben |
| Drucken | ❌ | |
| Projekt laden/speichern (`.fls`) | ✅ | hier JSON statt `java.beans.XMLEncoder` — und automatisch im localStorage |
| Beispielnetze (`beispiele/`) | 🟡 | hier sieben Szenarien **mit Auftrag** statt bloßer Netze |
| Hilfe (eingebautes Handbuch) | ❌ | |
| Einstellungen (Sprache u. a.) | ❌ | |
| Software-Assistent (eigene Java-Anwendungen schreiben und zur Laufzeit übersetzen) | ⛔ | |
| Kontextmenü am Gerät: Desktop anzeigen · Datenaustausch anzeigen · Konfigurieren · Verbindung entfernen · Alle Verbindungen entfernen · Löschen | 🟡 | hier über Klick und Werkzeuge; „alle Verbindungen entfernen" fehlt |
| Geräteleiste **senkrecht am linken Rand** | ✅ | wie dort — hier zusätzlich **einklappbar** und mit Wort neben dem Bild. Filius hat an dieser Stelle Bildchen ohne Beschriftung; auf einem Beamer aus zehn Metern ist das nicht zu erkennen und für eine 7. Klasse nicht zu erraten. |
| Netzplan **zoomen und verschieben** | ⭐ | Gibt es in Filius nicht: die Fläche ist dort so groß wie das Fenster, und ablegen kann man nur dort, wo gerade Platz ist. Hier ist das Feld 2400 × 1560, man sieht einen Ausschnitt davon, und *Einpassen* holt alle Geräte ins Bild. Verschoben wird durch **Ziehen** (auch Alt + Ziehen und Mittelklick); ⚠️ das Rechteck zum Markieren hängt an **Strg** — eine Runde lang war es umgekehrt, und weil dieses Feld größer ist als das Fenster, gehört der nackte Zug dem Verschieben. |
| **Rückgängig / Wiederherstellen** | ⭐ | Gibt es in Filius nicht. Wer dort ein Gerät löscht, baut es neu — mitsamt allen Adressen, die darin standen. Hier `Strg+Z` / `Strg+Y` (`js/verlauf.js`). |
| **Mehrere Geräte markieren** (Strg + Rechteck, Strg-Klick, gemeinsam verschieben) | ⭐ | Filius kennt nur ein ausgewähltes Gerät. |
| Desktop am **Vermittlungsrechner** und am **Switch** | ✅ | Filius hat dort keinen, und hier seit 2026-09-26 auch nicht mehr (er war eine Weile da). Vom Nutzer gesetzt: „Router, Switch und Heimrouter haben keine Desktop-Oberfläche." Sie bekommen ein **Gerätefenster** — Hinweissatz, Einstellungen, Tabellen, beim Router und Heimrouter dazu ein **Terminal** als Reiter. Das Terminal ist die einzige Zutat gegenüber Filius, und es ist keine Anwendung auf einem Bildschirm, sondern der Zugang von außen |
| **Kopieren und Einfügen** (`Strg+C/X/V`) | ⭐ | Gibt es in Filius nicht. Mit allen Einstellungen, aber neuen MAC-Adressen. |

## 6 Was hier schon anders und besser ist

Damit die Liste nicht nur nach Rückstand aussieht — das steht ausführlich in
`LIESMICH.md`:

* **Ereigniswarteschlange statt Threads** — wiederholbar, anhaltbar, einzeln
  schrittbar, prüfbar. Filius kann keines davon.
* **Netzteil und Geräteteil in Farbe**, im Adressfeld selbst und auf der Fläche.
* **Subnetze sichtbar** — in Filius gibt es dazu gar nichts, und es ist die
  Neuerung, auf die dieser Prototyp hinausläuft. Ring um jedes Gerät in der
  Farbe seines Netzes, dieselbe Farbe am Kabel und am Block der Netzwerkkarte
  im Gerätefenster; ein Router trägt so viele Ringe, wie er Netze verbindet.
  Der Knopf *Subnetze* zeigt alle auf einmal und listet links die Adressräume —
  mit Netz und Maske in zwei Spalten (wie in der Weiterleitungstabelle von
  Filius) und dem Adressbereich von–bis, der auch bei krummen Masken stimmt.
  Siehe `js/subnetze.js` und den Abschnitt in `LIESMICH.md`.
* **Unter dem Vermittlungsgerät steht die Adresse, die GEMEINT ist.** In Filius
  steht unter einem Vermittlungsrechner überhaupt keine Adresse — nur ein
  *Rechner* kann seine IP als Namen tragen (`Host.holeAnzeigeName`), und auch
  nur die der ersten Karte; alle Adressen eines Routers gibt es dort
  ausschließlich im Tooltip (`jsidebar_tooltip_ipAddress`). Hier steht im
  Ruhezustand `2 IP-Adressen` — und sobald ein Gerät markiert ist, das mit
  diesem Router ein Netz teilt, **dessen** Adresse mit `+1` für die übrigen.
  Bei einem Endgerät ohne Gateway ist das genau die Zahl, die zwei Zentimeter
  weiter oben in sein leeres Feld gehört. `relevanteNic()` in `flaeche.js`
  fragt dafür `Subnetze.berechnen()` — dieselbe Rechnung, die Ringe und Kabel
  färbt, damit die Farbe nicht das eine und die Zahl das andere Netz meint.
* **WAN und LAN sind am Heimrouter zu SEHEN** — ein Schildchen auf der
  Kachelkante an jedem Kabel (`WAN` gefüllt, `LAN 1…n` umrandet), und im
  Fenster heißen die Reiter so. Filius nennt beide Kartenreiter
  „Netzwerkkarte" und zeigt auf dem Netzplan gar nichts davon; welches Kabel
  ins Internet geht, ist dort nur durch Ausprobieren zu erfahren.
* **Der Heimrouter hat mehrere LAN-Buchsen**, und sie sind ein eingebauter
  Switch mit EINER Adresse. Damit lässt sich zeigen, dass „der Router zu
  Hause" gar kein Router ist, sondern drei Geräte in einem Gehäuse.
* **Wer WLAN ausstrahlt, trägt seinen Netznamen unter der Kachel** — dieselbe
  Marke wie DHCP, in einer eigenen Farbe. In Filius ist an einem Switch mit
  SSID von außen nichts zu sehen.
* **Unter der Kachel steht, was ein Gerät TUT** — `DHCP`, `DNS`, `Web`, `Mail`,
  jede Marke in ihrer Farbe, und **nur solange der Dienst wirklich läuft**
  (installiert allein genügt nicht, ausgeschaltet gilt nicht). Filius zeigt auf
  dem Netzplan nichts davon: „welcher von den sieben Rechnern ist der
  DNS-Server" lässt sich dort nur beantworten, indem man sie der Reihe nach
  aufmacht — und genau das passiert im Unterricht ständig, weil es die erste
  Frage jeder Fehlersuche ist.
* **Einstellungen neben dem Gerät** statt modaler Dialog über dem Netzplan —
  und **mehrere Geräte gleichzeitig** (Strg-Klick). Zwei Adressen nebeneinander
  beantworten „warum reden die beiden nicht miteinander" beim Hinsehen; in
  Filius muss man dafür zwei modale Dialoge nacheinander öffnen und die erste
  Adresse im Kopf behalten.
* **Die Bürokürzel** — `Strg+Z/Y`, `Strg+C/X/V`, `Strg+A`, `Entf`, Rechteck
  aufziehen. Filius hat davon nichts. Sie kosten keine Erklärung, weil jedes
  Kind sie aus dem Textprogramm kennt, und sie machen den teuersten Fehler des
  Unterrichts billig: etwas versehentlich kaputtzumachen.
* **Fehler als Warnzeichen auf der Fläche** statt in einem Fenster, das man
  erst öffnen muss; ein fehlgeschlagener Ping sagt, woran es lag. ⚠️ Die
  **doppelt vergebene Adresse gehört seit 2026-09-26 nicht mehr dazu**: mit
  Heimroutern und privaten Adressen ist dieselbe Zahl in zwei Netzen die Regel.
  Im selben Netz zeigt sie sich im Mitschnitt — zwei Antworten auf eine
  ARP-Anfrage.
* **Kabellaufzeit je Kabel einstellbar**, ein Paket ist immer auf genau einem
  Kabel.
* **Jede Zeile der Weiterleitungstabelle sagt, WOHER sie kommt** — direkt,
  eingetragen, RIP (mit der Zahl der Sprünge), Standard. Filius setzt
  höchstens die manuellen Zeilen farblich ab. Die Spalte ist der Grund, warum
  diese Tabelle im Unterricht etwas erklärt: drei Zeilen können dasselbe Ziel
  meinen, und welche gilt, hängt an ihrer Herkunft.
* **„Über Schnittstelle" ist eine Auskunft und kein Feld.** Sie folgt aus dem
  Gateway, also steht sie als Ergebnis unter der Zeile — grün, wenn es passt,
  rot mit Grund, wenn das Gateway in keinem eigenen Netz liegt. In Filius ist
  es ein viertes Eingabefeld, und damit kann man eine Zeile bauen, die sich
  selbst widerspricht.
* **RIP ergänzt die Tabelle von Hand, statt sie abzuschalten.** Filius nimmt
  bei eingeschaltetem RIP ausschließlich die dynamische Tabelle — ein
  eingetragener Weg hört stillschweigend auf zu gelten. Hier gilt die
  Rangfolge echter Geräte: bei gleicher Maske schlägt „von Hand" das „vom
  Nachbarn gehört", und der Kurzhinweis sagt es auch.
* **Was RIP lernt, schreibt das Terminal mit** („Weg zu 192.168.3.0 über
  192.168.2.2 · 1 Sprung"). Ein Router, in dessen Tabelle plötzlich Wege
  stehen, die niemand eingetragen hat, wäre sonst genau die Sorte Magie, die
  dieses Programm meidet.
* **Eine Portfreigabe steht in derselben Tabelle wie die Übersetzungen**, nur
  mit der Spalte *woher* — und sie steht dort, **bevor das erste Paket lief**.
  Genau darin besteht der Unterschied zwischen „schon da" und „beim
  Hinausgehen entstanden", und Filius zeigt beides in zwei getrennten Fenstern.
* **Aufträge statt bloßer Beispielnetze.**

## 7 Die Reihenfolge

Seit dem 2026-09-26 ist sie **beauftragt** und nicht mehr nur ein Vorschlag
(„mehr Programme auf dem PC"). Stufe 0 ist gebaut; Einzelheiten im Planblatt
und in `UEBERGABE.md`, Abschnitt 3.

| | | Zustand |
|---|---|---|
| **0** | Appstore · *Einstellungen* keine Kachel mehr · Adresse unter dem Vermittlungsgerät | ✅ gebaut |
| **1** | **TCP** — daran hängen sieben der dreizehn Anwendungen. Dazu **Ports sichtbar**: TCP- und UDP-Schale im Mitschnitt, `netstat` | ✅ gebaut |
| **2** | **Dateisystem** und darauf **Datei-Explorer** (feste Kachel), **Texteditor** und **Bildbetrachter** als dessen Ansichten. Dazu sieben Dateibefehle im Terminal | ✅ gebaut |
| **3** | **Webserver und Webbrowser** — der erste Punkt, an dem der Simulator zeigt, was ein Kind täglich tut | ✅ gebaut |
| **4** | **E-Mail-Server und E-Mail-Programm**, dazu die MX-Liste im DNS-Fenster | ✅ gebaut |
| **5** | **Portfreigaben** am Heimrouter — die Gegenprobe zu NAT: von außen kann niemand anfangen, außer man lässt ihn | ✅ gebaut (2026-09-27) |
| **6** | **Weiterleitung von Hand** und **automatisches Routing (RIP)** — erst die Frage, dann ihre Antwort | ✅ gebaut (2026-09-27), Fenster mit Reitern nachgelegt (2026-09-28) |
| **7** | **Echo-Server + Einfacher Client** — das Paar, das „Port" erklärt | offen |

Unabhängig davon, in dieser Reihenfolge:

1. **Ein Szenario zum Routing** — drei Netze, zwei Router, erst von Hand
   eintragen, dann den Haken setzen. In dieser Reihenfolge, denn das
   automatische Routing beantwortet eine Frage, die man gestellt haben muss.
   Dazu fehlt weiter ein **Szenario mit Heimrouter**; mit den Portfreigaben
   gibt es dafür jetzt einen zweiten Auftrag („der Webserver im Haus soll von
   draußen erreichbar sein"). Seit dem 2026-09-27 kommt ein drittes dazu: ein
   Netz mit **zwei DHCP-Servern** ist jetzt eine echte Frage, weil nicht mehr
   feststeht, wer gewinnt.
2. **Echo-Server + Einfacher Client** — und dort die Entscheidung über den
   **Schalter TCP/UDP** (siehe Abschnitt 2, UDP): eine Zutat, aber die
   lohnendste offene. Derselbe Auftrag sind über UDP zwei Zeilen im Mitschnitt
   und über TCP zehn Segmente; mit Kabelverlust holt TCP es nach und UDP nicht.
4. **DNS mit NS-Record** — erst damit wird DNS zu einem verteilten System und
   nicht zu einer Liste.
5. **Sequenzdiagramm des Datenaustauschs** — die Beameransicht.
6. **Dokumentationsmodus** — Beschriftung des Netzplans durch die Lehrkraft.
   In MPSkills womöglich überflüssig, wenn der Auftrag ohnehin aus dem Raum
   kommt; dann stattdessen **Bildexport**.
7. Firewall, Gnutella — zuletzt, jedes für sich eine eigene Runde.

*(NAT, Heimrouter und WLAN standen bis zum 2026-09-25 auf dieser Liste;
Weiterleitung von Hand, RIP und Portfreigaben bis zum 2026-09-27. Alles
gebaut.)*
