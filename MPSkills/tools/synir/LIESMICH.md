# Netzwerk — Prototyp

Ein Netzwerksimulator für den Unterricht, im Browser. Erster Schritt auf dem Weg
zu einem MPSkills-Skill; Filius war das didaktische Vorbild, nicht die Codevorlage.

## Starten

`index.html` doppelklicken. Kein Server, kein Build, keine Abhängigkeiten.

Falls der Browser bei `file://` zickt (manche Einstellungen sperren dort den
localStorage), aus diesem Ordner heraus einen kleinen Server starten:

```
npx serve .
```

## Was es kann

| | |
|---|---|
| **Zwei Modi** | **Entwurf** — bauen, verkabeln, adressieren; die Uhr steht. **Aktion** — die Uhr läuft, ein Tipp öffnet die Oberfläche des Geräts. Welcher gilt, sagt die Farbe der Leisten (Indigo / Mint) und das Raster, das nur im Entwurf auf dem Tisch liegt. |
| **Tippen ≠ Ziehen** | Jede Geste hat genau eine Bedeutung. **Tippen** auf ein Gerät öffnet sein Fenster, **noch einmal tippen** macht es zu. **Ziehen** verschiebt (Entwurf) und öffnet nichts. Entschieden wird erst beim Loslassen, an einer Schwelle von 4 Punkten mit der Maus und 10 mit dem Finger — darunter bewegt sich nichts, damit ein Tipp auf dem Tablet den Plan nicht verrückt. |
| **Bürokürzel** ⭐ | Was jedes Textprogramm kann, kann dieses auch — **ohne einen einzigen Knopf dafür**. **Strg+Z / Strg+Y** (auch Strg+Umschalt+Z) nehmen zurück und holen zurück; zwölf Tastendrücke in einem Adressfeld sind dabei **ein** Schritt. **Strg+C / X / V** kopieren, schneiden aus und fügen ein — mit allen Einstellungen, aber **neuen MAC-Adressen**; die IP-Adresse kommt mit, und die Kurzmeldung sagt es. **Strg+A** markiert alles, **Entf** löscht die Markierung (in **beiden** Modi, ohne Rückfrage — es gibt ja Strg+Z). In einem Eingabefeld gehören alle diese Tasten dem **Feld**. |
| **Mehrere markieren** ⭐ | **Strg + Ziehen** auf dem leeren Feld spannt ein **Rechteck** auf und nimmt alles darin zur Auswahl dazu; **Strg-Klick** auf ein Gerät nimmt es dazu oder wieder heraus. Der nackte Zug gehört dem **Verschieben des Feldes** — Strg heißt an allen drei Stellen dasselbe (Klick, Rechteck, Strg+A). Ein **markierter Verband verschiebt sich gemeinsam**, und die Abstände bleiben dabei genau erhalten. Der Unterschied zwischen den beiden Wegen ist Absicht: das **Rechteck öffnet keine Fenster** (acht Kärtchen wären keine Auswahl, sondern eine Wand), der **Strg-Klick öffnet bei jedem angeklickten Gerät sein Kärtchen** — so stehen zwei oder drei Adressen nebeneinander, und „warum reden E1 und E2 nicht miteinander" beantwortet sich beim Hinsehen. |
| **Geräte** | Die Leiste steht **senkrecht am linken Rand** wie in Filius und lässt sich **einklappen** (dann bleiben die Symbole stehen, die Wörter gehen in den Tooltip). Oben die Gruppe **Endgeräte** mit **Laptop · Server · Handy nebeneinander** — das sind **drei Bilder DESSELBEN Geräts**, wie Rechner und Notebook in Filius; darunter *Verteilen* (Switch), *Vermittlungsgeräte* (**Router · Heimrouter nebeneinander**) und *Werkzeug* (Zeiger, Kabel). Die Gliederung ist selbst schon Unterricht: ein Switch **verteilt** innerhalb eines Netzes (Schicht 2), ein Router **vermittelt** zwischen Netzen (Schicht 3) — stünden beide unter einer Überschrift, wäre der Unterschied, um den es geht, genau dort weggeräumt, wo man ihn zum ersten Mal sieht. Man **zieht ein Gerät aus der Leiste auf die Fläche**; **antippen legt nichts an, sondern erklärt es** (drei bis vier Sätze, mit dem Filius-Wort dazu, wo es eines gibt). Schnittstellen lassen sich beim **Router nachträglich anbauen** (bis 8, wie dort); der **Heimrouter hat seine 1 WAN + 8 LAN fest eingebaut** — beim **Switch nicht mehr**: dort **kommt eine Buchse von selbst mit dem Kabel**, bis 50 Geräte. Dass ein Switch Geräte verbindet, ist keine Aufgabe; dass ein Router je Netz eine Adresse braucht, ist eine. |
| **Heimrouter** | Das Gerät aus dem eigenen Wohnzimmer — und in Wahrheit **drei Geräte in einem Gehäuse**: ein Router (oben **WAN** zum Anbieter, unten **LAN** ins Haus), ein Switch (die LAN-Buchsen) und ein WLAN-Zugangspunkt. In Filius heißt er ebenso (`Gateway.java`, `hw_gateway_msg1`), hat dort aber nur **einen** LAN-Anschluss; hier sind es ⭐ **acht, fest eingebaut** (seit 2026-09-28; nichts anzubauen, alte Stände werden aufgefüllt). ⭐ **Die LAN-Buchsen teilen sich EINE IP- und MAC-Adresse** — sie sind ein eingebauter Switch, und genau das ist die Aussage. Er kommt **leer aus dem Karton**: kein Feld ist vorausgefüllt, die Klasse trägt Adresse und DHCP-Bereich selbst ein. Was bleibt, ist keine Angabe, sondern die Natur des Geräts — die **WAN-Seite fragt den Anbieter** (das tut ein WAN-Anschluss), **NAT ist an** (sonst hieße es Router), **WLAN ist aus** (einen Namen vergibt der Mensch). Unter der Kachel steht **immer die LAN-Adresse**, nie die vom Anbieter: die Frage an diesem Gerät lautet „unter welcher Adresse erreiche ich es von hier aus". Im Fenster drei Reiter: **Allgemein · WAN · LAN** (Filius nennt beide Kartenreiter „Netzwerkkarte" und unterscheidet sie nur über ihre Stelle im Band). ⭐ **Klein** steht auf dem LAN-Reiter nur **LAN 1** mit seiner Adresse; Buchsenreihe, WLAN, DHCP-Server, NAT und Portfreigaben gibt es erst **groß**. |
| **NAT** | Innen viele Adressen, außen genau eine. NAPT nach RFC 3022: übersetzt wird Adresse **und** Nummer (UDP-/TCP-Port bzw. ICMP-Kennung) — erst die macht den Rückweg eindeutig. Die **NAT-Tabelle** steht bei den anderen Tabellen des Geräts; solange keine Zeile dasteht, findet keine Antwort zurück, und **deshalb kann von außen niemand anfangen**. Der Schalter lässt sich **ausmachen**: dann geht das Paket hinaus und die Antwort kommt nie — im Mitschnitt zu sehen und mehr wert als jede Erklärung. |
| **Portfreigaben** ⭐ | Die Gegenprobe zu genau diesem Satz, und sie steht **direkt darunter** (Filius hat dafür einen eigenen Dialog). Spalten wie dort: **Protokoll · Portfreigabe · LAN-Adresse · LAN-Port**. ⭐ Eine Freigabe ist **dieselbe Übersetzung, nur von Hand eingetragen statt beim Hinausgehen entstanden** — sie steht deshalb in derselben NAT-Tabelle, mit der Spalte *woher*: `Freigabe` oder `Gespräch`. Und sie steht dort **sofort**, bevor das erste Paket lief; genau das ist der Unterschied. Damit kann ein Webserver im Haus von draußen aufgerufen werden, und der Rechner draußen kennt dabei **nur die WAN-Adresse**. Bleibt der LAN-Port leer, gilt derselbe — was dabei herauskommt, steht in der Tabelle. |
| **WLAN** | **Switch und Heimrouter** können ein Funknetz ausstrahlen, mit **Namen** (`Name WLAN (SSID)`, Wortlaut aus Filius). Am Endgerät wählt man **Kabelgebunden (LAN)** oder **Drahtlos (WLAN)** und dann das Netz aus einer Liste — **beim Handy entfällt die Wahl**, es kann nur funken —, einer Liste, die nur enthält, was gerade ausgestrahlt wird — ein Gerät **findet** ein Funknetz, es erfindet keines. Die Verbindung entsteht und vergeht mit dieser Einstellung; **gezogen wird sie nicht**. Auf der Fläche ist sie **gestrichelt** (wie in Filius), und wer ausstrahlt, trägt unter der Kachel eine **violette Marke mit dem Netznamen**. Funkgeräte belegen dabei **keinen der nummerierten Anschlüsse** — ein Switch mit drei Handys wäre sonst fast voll. |
| **Was ein Gerät tut** ⭐ | Unter der Kachel stehen **Marken**: `DHCP` (Bernstein), `DNS` (Blau), `Web` (Petrol), `Mail` (Magenta) und das **WLAN** mit seinem Netznamen (Violett). Damit ist „wer ist hier der DNS-Server" vom Rand des Raumes aus zu beantworten, statt jedes Gerät einzeln aufzumachen. ⚠️ **Eine Marke steht nur da, wenn der Dienst wirklich läuft** — installiert allein genügt nicht, und ein ausgeschaltetes Gerät trägt keine. Das ist die Gegenprobe zur Software-Installation: ein Serverprogramm wird aufgespielt **und** gestartet, und dazwischen liegt genau dieser Unterschied. Auf der Pille steht die Kurzform, der ganze Satz im Kurzhinweis. Werden es zu viele für eine Reihe, bricht sie um (vier Marken stehen zwei und zwei). Die drei Farben, die es auch im Mitschnitt gibt, sind dieselben — die blauen Pakete laufen zum blauen Gerät. |
| **WAN oder LAN?** | An jedem Kabel eines Heimrouters sitzt auf der Kachelkante ein **Schildchen**: `WAN` gefüllt (es gibt genau eines), `LAN 1…n` umrandet. Ein **Wort** und keine Farbe, weil Farbe hier schon „Netz" heißt, Dicke „hervorgehoben" und gestrichelt „Funk" — und weil man es vorlesen kann („steck das ins WAN"). |
| **Das Feld** | Das Feld ist **2400 × 1560 groß und damit größer als jedes Fenster**; man sieht einen Ausschnitt davon. **Ziehen** verschiebt ihn (mit der Maus wie mit dem Finger, dazu **Alt + Ziehen** und **Mittelklick**), **Mausrad** rollt, **Strg + Mausrad** (und die Zusammenziehgeste auf dem Rechenbrett) zoomt; dazu drei Knöpfe unten in der Leiste und eine Prozentzahl, die angeklickt den Startausschnitt zurückholt. Solange niemand selbst gezoomt hat, passt sich der Ausschnitt bei jeder Fenstergröße von selbst ein — danach bleibt er stehen, wo er hingestellt wurde. ⚠️ Das **Ziehen mit der Maus** gehörte eine Runde lang dem Rechteck und verschiebt seit der Beanstandung wieder — das Rechteck hängt an **Strg**. Der Grund: dieses Feld ist größer als das Fenster, das Verschieben ist damit der Weg zu allem, was nicht im Bild ist, und nicht eine gelegentliche Zurechtrückerei. Warum nicht die Leertaste wie in vielen Zeichenprogrammen: die hält hier die **Uhr** an. |
| **Kurznamen** | Auf der Fläche steht **E1 · S1 · H1 · R1 · SW1**, darunter die Adresse, groß. Der ausgeschriebene Name (*Endgerät 1*) steht im Fensterkopf und als Kurzhinweis am Gerät. Namen sind **nicht änderbar** — ein umbenennbares Gerät ist eines, über das eine Klasse diskutiert, statt über Adressen. |
| **Gerätefenster** | Ein Tipp im Entwurf öffnet die Einstellungen **direkt neben dem Gerät**, in genau den Zeilen, die Filius in `JHostKonfiguration` oben hat: MAC-Adresse, IP-Adresse, Netzmaske, Gateway, Domain Name System. **„Mehr ›"** schiebt dasselbe Fenster an den rechten Rand und zeigt dort DHCP, Netzwerkkarten, die Farblegende zu Netz- und Geräteteil und die Tabellen, die sich das Gerät selbst gebaut hat. Beide Größen ziehen beim Verschieben mit und lassen sich am Kopf frei hinlegen. **Mit Strg-Klick gehen mehrere Kärtchen gleichzeitig auf**; sie weichen einander aus und stellen sich notfalls in eine Reihe. **„Mehr ›" gibt es dann nicht** — die große Ansicht ist ein Brett über die ganze Höhe, und zwei davon passen nicht nebeneinander. |
| **Schloss** | Eine Adresse, die vom DHCP-Server kommt, trägt auf der Fläche hinter der Zahl ein Schloss, und im Fenster steht es vor jedem gesperrten Feld. Ein Gerät, das Adressen **verteilt**, trägt an der Kachel ein DHCP-Zeichen. |
| **Adresse in Farbe** | **Im Adressfeld selbst** und unter jedem Gerät steht die Adresse in zwei Farben: **Netzteil** und **Geräteteil**, nach der Maske getrennt. Liegt die Grenze mitten in einem Block (Maske `255.255.255.192`), ist der gestreift. |
| **Subnetze sichtbar** ⭐ | Die eine Neuerung, für die es in Filius kein Vorbild gibt. Ein angetipptes Gerät zeigt einen **Ring in der Farbe seines Netzes**; alle anderen Geräte dieses Netzes und die **Kabel dazwischen** tragen dieselbe Farbe. Ein **Router hat mehrere Ringe in mehreren Farben** — so viele, wie er Netze verbindet. Der Knopf **Subnetze** in der Kopfzeile zeigt alle auf einmal und schlägt links die **Liste der Adressräume** auf. Switche bleiben ungefärbt (sie haben keine IP-Adresse), ein Gerät allein ist kein Netz. Im Gerätefenster ist **jede Netzwerkkarte in der Farbe ihres Netzes umrandet**. |
| **Binärdarstellung** | Unter *Ansicht & Tools*, ein- und ausschaltbar. IP-Adresse und Netzmaske stehen im Gerätefenster (groß und im Aktionsmodus) und in der Subnetz-Liste zusätzlich als **32 Bit in vier Achtergruppen**. Die Farben bleiben, gelten aber je Bit: **blau** = Netzteil (Maske hat 1), **braun** = Geräteteil (Maske hat 0). So sieht man auch eine Grenze mitten in einer Zahl (z. B. `255.255.255.192`). Gebraucht in II.5. Die Wahl bleibt auf dem Gerät stehen. |
| **Reiter beim Router** | *Allgemein* (Gateway, DNS, die Netze dieses Geräts, der Haken *Automatisches Routing*, die Weiterleitungstabelle) und *Netzwerkkarten* — wie in Filius, wo `JVermittlungsrechnerKonfiguration` ebenfalls ein `JTabbedPane` mit genau diesen Reitern ist. Wer auf einen **Kartenblock zeigt** (oder mit dem Schreibstrich darin steht), sieht draußen **ihr Kabel**: dicker, mit einem Hof auf der ganzen Treffbreite und einem langsamen Puls — in **seiner eigenen Netzfarbe**, denn Farbe heißt auf dieser Fläche ausschließlich „Netz". |
| **Schicht 2** | Ethernet-Rahmen, Switch mit lernender MAC-Tabelle, Fluten bei unbekanntem Ziel. Jede Karte hat ihre MAC-Adresse vom Anlegen an. |
| **Schicht 3** | ARP mit Wartewarteschlange, IP mit Weiterleitungstabelle, TTL, ICMP (Echo, unerreichbar, Zeit abgelaufen) |
| **Weiterleitung von Hand** | Im Reiter *Allgemein* des **Routers** steht die **Weiterleitungstabelle**: je Zeile **Ziel · Netzmaske · Nächstes Gateway** (Spaltennamen aus Filius). ⚠️ **Angelegt wird eine Zeile nur im Fenster** — im Kärtchen stehen die Überschrift, *ein* Erklärsatz und der Knopf ins Fenster, sonst nichts. ⭐ **„Über Schnittstelle" ist hier kein Feld, sondern eine Auskunft** — sie FOLGT aus dem Gateway („über Netzwerkkarte 2 · 192.168.2.1"). In Filius tippt man sie mit und kann damit eine Zeile bauen, die sich selbst widerspricht. Wer ein Gateway einträgt, das in keinem eigenen Netz liegt, sieht das **sofort** statt beim Ping. ⚠️ Der **Heimrouter hat keine** — er hat genau zwei Seiten und schickt alles Fremde nach draußen. |
| **Die Tabelle als Fenster** ⭐ | Ein Knopf *Zur Weiterleitungstabelle* schlägt sie **unten über die ganze Breite** auf (`js/weiterleitung.js`), mit **einem Reiter je Router** und vier echten Spalten samt Kopfzeile — im schmalen Kärtchen passen die Namen in keine. Filius hat dafür *Als Fenster öffnen* und macht einen 600×400-Dialog daraus; die Reiter sind die Zutat: drei Router nacheinander einrichten, ohne ein Fenster zu suchen. ⚠️ **Das Fenster hat keinen eigenen Auswahlzustand** — ein Reiterklick wählt das Gerät auf der *Fläche* aus, und damit geschieht alles Übrige von selbst: es ist markiert, zeigt dort seine Netze, und sein Kärtchen geht auf. Umgekehrt folgt der Reiter der Auswahl. ⭐ **Es ist EINE Tabelle**: was der Router von selbst weiß (direkt · RIP · Standard), steht **grau und ohne Feld** zwischen den Zeilen von Hand — in der Reihenfolge, nach der `routeFor` entscheidet, mit der Spalte **Herkunft**, die Filius nicht hat. Der Haken **Alle Einträge anzeigen** (Wortlaut und Vorgabe aus Filius, `msg11`) nimmt die grauen weg. So ist die Antwort auf „hat meine Zeile etwas bewirkt" und auf „warum steht da schon was" dieselbe Tabelle. |
| **Automatisches Routing (RIP)** ⭐ | Ein Haken *Automatisches Routing (RIP)* am **Router** — nur dort, wie in Filius (die Gateway-Konfiguration hat ihn dort auch nicht), und **direkt unter DNS**, also VOR der Weiterleitungstabelle: er entscheidet, ob es sie überhaupt braucht. Ist er gesetzt, steht unter der Überschrift nur noch *„Wird beim automatischen Routing nicht benötigt."* Die Router rufen sich im Takt zu, welche Netze sie kennen und wie weit sie weg sind; wer zuhört, zählt einen Sprung dazu. Nach wenigen Sekunden steht jedes Netz in jeder Tabelle, **ohne dass jemand eine Zeile eingetragen hat**. Distanzvektor mit **Unendlich = 16**, **Split Horizon**, Ansage außer der Reihe bei Änderungen, ablaufende Wege (`js/rip.js`, Zahlen und Verfahren aus `filius/software/rip/`). Läuft nur im Aktionsmodus — es ist das erste Protokoll hier, das **ohne Zutun** redet. ⚠️ Anders als in Filius **ersetzt** RIP die Tabelle von Hand nicht, es ergänzt sie: bei gleicher Maske geht der eingetragene Weg vor. Dort schaltet ein eingeschaltetes RIP die Einträge von Hand stillschweigend aus. |
| **Schicht 4** | **UDP** mit Portnummern und Sockets — die Grundlage, auf der DHCP und DNS sitzen. Dazu **TCP** (`js/tcp.js`): Dreiwege-Handschlag, Bestätigung jedes Bytes, Vier-Wege-Abbau, **RST** auf einen Port ohne Zuhörer, eine Wiederholung je unbestätigtem Segment. Die Sequenznummer zählt **Bytes**, SYN und FIN verbrauchen je eine — nur so geht „Seq 1000, 24 Byte, also als Nächstes 1024" im Mitschnitt auf. |
| **Ports sehen** | Im Mitschnitt hat jedes Paket seine **Schale** mit Absender- und Zielport (UDP wie TCP), bei TCP dazu Flags, Sequenz- und Bestätigungsnummer. Im Terminal beantwortet **`netstat`** die Frage, an der in Filius das Ausprobieren anfing: *wer hört auf dieser Nummer?* — mit einer Spalte **Programm**, die es dort nicht gibt. Der fliegende Punkt ist bei TCP **hohl**, solange kein Byte darin ist (Handschlag, Abbau), und gefüllt, sobald Daten fliegen. |
| **DHCP** | Wie in Filius: Kontrollkästchen *DHCP zur Konfiguration verwenden* und Knopf *DHCP-Server einrichten* (Adress-Untergrenze, Adress-Obergrenze, Netzmaske, Gateway, DNS-Server, *DHCP aktivieren*) — beides beim Endgerät, nicht beim Router, und beides hinter *Mehr ›*. Die Felder sind beim Öffnen der Seite schon gefüllt, abgeleitet aus der eigenen Adresse; die Netzmaske steht auch dann da, wenn es noch keine gibt (`255.255.255.0`). Alle vier Nachrichten: Discover → Offer → Request → Ack. **Beim Gerät, das sich seine Adresse holt, stehen alle vier Felder einheitlich leer** — IP-Adresse, Netzmaske, Gateway, DNS, jedes mit dem Platzhalter *— vom DHCP-Server* und einem Schloss. Sie füllen sich erst, wenn ein Server geantwortet hat, und sind mit dem Leihvertrag auch wieder weg (`netz.dhcpLeeren`). Ein solches Gerät bekommt **kein Warnzeichen**: es liegt vor dem ersten Durchlauf in keinem Netz, und welches es wird, entscheidet der Server, der zuerst antwortet. ⭐ **Statische Adresszuweisung** (Filius' zweiter Reiter): eine Liste MAC → IP, die vor dem Bereich gewinnt und nicht darin liegen muss; die MAC-Adressen der Endgeräte stehen als anklickbare Kürzel darunter. ⭐ **Die Vergabe ist nicht vorhersehbar** — jeder Client wartet eine gewürfelte Weile, bevor er fragt (so verlangt es RFC 2131), jeder Server wartet eine, bevor er antwortet, und die Adresse wird an einer gewürfelten Stelle des Bereichs gesucht. Bei zwei Servern ist damit offen, wer gewinnt. **Jeder Start des Aktionsmodus vergibt neu.** Reproduzierbar bleibt es trotzdem: alles hängt am Startwert des Würfels (`window.NETSIM_SEED` nagelt ihn fest). |
| **DNS** | Ein **Programm**, das man aufspielt und startet — nicht ein Schalter am Gerät. Liste aus Host-/Domainnamen und Adressen, Auflöser mit Zwischenspeicher. `ping www.schule.de` löst zuerst auf und zeigt das. Solange er läuft, trägt der Server unter der Kachel die Marke `DNS`. ⚠️ **Jeder Name wird einzeln eingetragen** — einen Knopf „alle Geräte auf einmal" gab es, und er ist wieder weg: er nahm genau die Arbeit ab, um die es geht. Wer die Liste selbst führt, merkt, dass sie jemand führen muss und dass ein Tippfehler darin ein fehlerfreies Netz lahmlegt. |
| **E-Mail** ⭐ | **E-Mail-Server** (Maildomain, Postfächer mit Benutzername und Passwort) und **E-Mail-Programm** (ein Konto je Gerät: Name, Benutzername, Passwort, **Maildomain**, POP3- und SMTP-Server samt Port). ⭐ **Die E-Mail-Adresse wird nicht getippt** — sie ergibt sich als `benutzer@domain`, genau wie in der Kontenliste des Servers. ⭐ **Ein Knopf *Anmelden*** prüft die Angaben einmal bei BEIDEN Servern (POP3 mit Benutzer und Passwort, SMTP mit der eigenen Adresse); danach sind die Felder fest und die Adresse steht da, *Abmelden* gibt sie frei. Filius hat das nicht — dort merkt man beim ersten Senden, ob es stimmt, und ein Tippfehler im Servernamen sieht aus wie ein fehlender MX-Eintrag. Unter einer Nachricht steht **E-Mail beantworten** (Filius-Wortlaut, mit `RE: `, *schrieb:* und Zitat). **SMTP (25)** bringt die Post hin, **POP3 (110)** holt sie ab — und genau dazwischen liegt die Aussage, die überrascht: **eine E-Mail wird nicht zugestellt, sie wird abgeholt.** Beim Empfänger bleibt der Posteingang leer, bis er *E-Mails abrufen* drückt. Beides sind **Zeilendialoge**, und jede Zeile steht im Mitschnitt: `MAIL FROM: <anna@schule.de>`, `250 OK`, `RETR 1`. ⭐ Auch `PASS geheim` — im Klartext, denn das IST POP3. Post an eine **fremde Domain** reicht der Server weiter; dafür fragt er im DNS nach dem **MX-Eintrag** (eigene Liste im DNS-Fenster, Wortlaut aus Filius). |
| **Webserver** | Ein Programm, das man aufspielt und startet — dabei entstehen Ordner `/webserver` und eine **Standardseite** aus drei Dateien (Seite, Stildatei, Bild), wie in Filius. Ordner und **Port 80** stehen im Fenster als *Angabe*, nicht als Feld: sie sind festgelegt. Darunter die Dateien (ein Klick öffnet sie im Datei-Explorer) und ein Protokoll der **Zugriffe** — wer wann was geholt hat. |
| **Webbrowser** ⭐ | Adresszeile mit festem Vorsatz `http://`, Knopf *Start*. Eine **Adresse** (`192.168.2.30`) oder ein **Name** (`www.schule.de`, über DNS), wahlweise mit `:8080` — Filius kann im URL gar keinen Port angeben. ⭐ **Unter der Seite steht, was für sie geholt wurde:** `/ 200` · `/stil.css 200` · `/mpskills-logo.png 200` · `/synir-logo.png 200` und „4 Anfragen für eine Seite" (die Standardseite trägt die Logos von MPSkills und SYNIR). Genau das ist die Aussage — eine Seite ist nicht eine Datei. Fehlt eine, ist genau die eine Marke rot und der Rest steht trotzdem da. Gezeichnet wird in einem `<iframe sandbox>` **ohne** `allow-scripts`: echtes HTML, echtes CSS, **kein JavaScript** — und nichts davon kann den Simulator erreichen oder eine Anfrage ins echte Internet stellen. |
| **Dateien** ⭐ | Jedes Endgerät hat ein **Dateisystem** (`js/dateien.js`) — und darin ab Werk **einen Ordner `/Bilder`** mit sechs eingebauten Bildern (vier SVGs, dazu die Logos von MPSkills und SYNIR als PNG). (Das ist die eine Abweichung von „leer wie in Filius": Bilder nehmen keine Frage weg, sie sind Material — ohne sie hat der Bildbetrachter auf einem frischen Gerät keinen Gegenstand. Sie kosten nichts, es sind Verweise, und wer sie wegwirft, ist sie los.) Der **Datei-Explorer** ist von Anfang an da (keine Installation) und hat **drei Knöpfe**: *Ordner erstellen · Neue Textdatei · Datei hochladen*. Umbenennen und Löschen fragen **in der Zeile**, nicht in einem Systemdialog. ⭐ **Ein Klick auf eine Datei öffnet sie** — Texte im **Editor**, Bilder im **Betrachter**. In Filius sind das drei Programme, die man einzeln installiert, und der Explorer dort kann gar keine Datei öffnen; man braucht für jede Ansicht einen eigenen Dateiauswahldialog. Der Editor **färbt HTML und CSS ein**, in beiden Sprachen mit derselben Bedeutung (Marke/Selektor blau, Attribut/Eigenschaft violett, Wert orange); **JavaScript steht durchgestrichen** da, samt einem Satz darunter: es wird gespeichert, aber nicht ausgeführt. ⭐ **Datei hochladen** liest eine echte Datei von der Platte ein — **Bild oder Text mit demselben Knopf**, die Endung entscheidet (Text bis 64 KB bleibt im Editor bearbeitbar, alles andere landet im Inhaltsspeicher; **2 MB je Datei, 4 MB je Netz**, und darunter steht, wie voll es ist). Filius deckelt bei 150 KB. ⚠️ **Die Inhalte stehen NICHT in `netz.toJSON()`** — das ist auch das Format des Verlaufs, und sechzig Stände mal ein Foto wären zäh. |
| **Software-Installation** ⭐ | Ein **Appstore**: eine Kachel je Programm, in derselben Form wie die Symbole auf dem Bildschirm. Ein Klick spielt auf, die Kachel bekommt einen **Haken**; ein Klick auf eine Kachel mit Haken fragt *„… deinstallieren?"* mit *Ja* / *Nein* — **in der Kachel**, nicht in einem Systemdialog. Filius hat dafür zwei Spalten (*Verfügbar* / *Installiert*) und darunter *Änderungen annehmen*; beides ist ein Schritt mehr als nötig. Die Liste steht in `PROGRAMME` in `js/geraet.js`. |
| **Geräteoberfläche** | Ein **Bildschirm**, kein Knopfbrett: Rahmen, Tapete, oben die Leiste mit Gerätename und Ausschalter, auf der Tapete die **Symbole** der Programme, unten der **Schnellzugriff** aus Glas. Ein Programm öffnet ein Fenster mit eigener Kopfzeile, und das **liegt auf den Symbolen** — sie bleiben stehen, sind dann aber verdeckt. Gewechselt wird über den **Schnellzugriff unten**; genau dafür ist er da. Bei Laptop, Server und Handy gilt dieselbe Regel. ⭐ **Den Bildschirm gibt es nur bei Rechner, Server und Handy.** |
| **Geräte ohne Bildschirm** ⭐ | **Router, Heimrouter und Switch haben keine Desktop-Oberfläche** — an keinem dieser Kästen ist ein Bildschirm, keiner hat ein Betriebssystem, auf dem man ein Programm startet. Sie bekommen die Stufe darunter: ein **Gerätefenster** (helle Fläche, dünne Kante — Werkzeug statt Bildschirm). ⭐ Seit 2026-09-28 ist es eine **kompakte Leseansicht** (`konfig.kompakt`): kein Erklärsatz, keine Reiter, **kein Terminal**, **nichts zum Einstellen** (auch das WLAN des Switch schaltet man nur im Entwurf) — alle Angaben aus den Kärtchen als Zeilen auf einer Seite, darunter die Tabellen, die sich das Gerät gebaut hat, und *Tabellen vergessen*. Vom Nutzer: „Einstellungen kann ich jetzt nicht mehr ändern! Terminal brauche ich hier nicht.“ Die Befehle selbst (`ipconfig`, `route` …) gibt es im Kern weiter. |
| **Der Handy-Bildschirm** | Dasselbe Gerät, dasselbe Terminal, dieselben Programme — nur hochkant: Raster statt Schreibtisch, Leiste unten, **ein Programm im Vollbild**, unten der Strich. ⭐ **Der einzige Unterschied im Modell: es hat keine Kabelbuchse** und geht nur über WLAN ins Netz. Filius kennt kein Handy; hier gibt es eines, weil es die Frage beantwortet, ob das eigene Telefon auch „so ein Rechner“ ist. |
| **Terminal** | `ping` (auch mit Namen), ⭐ `traceroute`/`tracert`, `nslookup`, `dhcp [neu]`, `ipconfig`, `arp`, `route`, `netstat`, `mactabelle`, `vergiss`, `hilfe` — dazu die Dateibefehle `ls`/`dir`, `cd`, `pwd`, `cat`/`type`, `mkdir`, `touch`, `rm`/`del`. `route` nennt zu jeder Zeile die **Herkunft**, bei einem gelernten Weg mit der Zahl der Sprünge: `RIP (2)`. Was RIP gerade gelernt hat, schreibt das Terminal **mit** — sonst stünden dort Wege, die niemand eingetragen hat. ⭐ **Befehle-Menü und Abbrechen** (2026-09-29): die Schnellknöpfe unter der Ausgabe sind weg; oben im Terminal steht dezent *Befehle ▾* mit einer Kurzerklärung je Eintrag. Ein laufender `ping`/`traceroute`/Namensfrage hat eine **Frist in echter Zeit** (6 s je Anfrage, nach zwei verlorenen endet der Befehl) — die Frist des Netzes zählt in simulierter Zeit und wäre bei Tempo 0,1 eine halbe Minute. Abbrechen: **Esc** oder der Knopf *■ Abbrechen* (das Tablet hat kein Esc). |
| **Karte (Lehrkraft)** ⭐ | Knopf *Karte* neben *Internet der Klasse*: großes Fenster über allem mit dem Netzplan der ganzen Klasse — in der Mitte die Wolke, von ihr je Schülernetz **ein Kabel**, Farbe und **Adressbereich** je Subnetz darüber, Geräte klein wie im Netzwerkplan (keine Bilder). Zoom mit Mausrad, zwei Fingern, +/−, *Alles zeigen*; Ziehen verschiebt; Esc schließt. Die Daten kommen aus `synir_cww_karte`, `synir_work_list` und `synir_work_get` (keine neue Migration); zusammengeführt wird über den Namen. DHCP-Adressen stehen nicht im gespeicherten Stand — das Subnetz solcher Geräte wird aus dem Nachbargerät (durch Switches hindurch) oder dem DHCP-Bereich gelesen. Das Netz der Lehrkraft meldet ihr eigener Rahmen (`lehrerstand`, nur an das Pult, nicht in die Datenbank). Netze, die seit 20 s nichts gemeldet haben, sind gestrichelt und blass. |
| **Mitschnitt** | ⭐ Ein Knopf **Mitschnitt** neben *Subnetze*, **nur im Aktionsmodus**; die Leiste unten steht nur da, solange er an ist. Wer hochgerollt hat, **bleibt stehen**, wenn neue Rahmen kommen (nur wer unten ist, rollt mit). Die **vier Schichten sind farbig** (Filius' Farben): in der Schichtenansicht hinterlegt und als Pille, aufgeklappt je Schale. Alle Rahmen des ganzen Netzes in einer Liste, aufklappbar bis in die Felder. Ein gefluteter Rundruf steht als **eine** Zeile mit „× 4". **Ein Gerät antippen schränkt auf dieses Gerät ein** (Filius: Rechtsklick → *Datenaustausch anzeigen*), Richtungspfeile ↑ / ↓ für gesendet und empfangen, und umschaltbar auf **Filius' Schichtenansicht**: eine Zeile je Schicht mit den Spalten Nr. · Zeit · Quelle · Ziel · Protokoll · Schicht · Bemerkungen. |
| **Szenarien** | sechs Aufgaben, von „zwei Endgeräte" über Fehlersuche bis DHCP und DNS |
| **Speichern** | automatisch im localStorage, dazu Export/Import als JSON |
| **Menüleiste** ⭐ | Oben rechts zwei Reiter wie in klassischen Programmen (`js/menuleiste.js`). **Datei**: Neu · Öffnen · Sichern (als Datei auf den PC) · darunter, getönt abgesetzt, **Szenarien** (Untermenü mit der Auswahl), *Als Szenario speichern* und *Aufgabentext* (beides nur Lehrkraft). **Ansicht & Tools**: *Dark Mode* (gilt für ganz MPSkills — derselbe Schlüssel `mpskills_theme`), *Subnetze* und *Mitschnitt* (im Entwurf grau; ist eines noch an, bleibt es abschaltbar). ↑ ↓ ← → Esc, Darüberfahren wechselt den Reiter. Das gelbe *Aufgabe*-Kärtchen steht daneben, unverändert. |
| **Hilfe für Lehrkräfte** ⭐ | Knopf **Hilfe** ganz rechts in der Kopfzeile (auch **F1**), nur Lehrkraft und Einzelbetrieb — auf den Tablets der Klasse gibt es ihn nicht. Eine Anleitung über der **rechten Hälfte** (`js/hilfe.js`, Text in `js/hilfe-inhalt.js`): **Suchfeld** (Umlaute egal, mehrere Wörter), **Inhaltsverzeichnis** mit acht Kapiteln (Erste Schritte · Hardware · Einstellen im Entwurf · Software · Werkzeuge · Datei & Szenarien · Im Klassenraum · Wenn etwas nicht klappt), je Abschnitt Kurzsatz, **Bildschirmfoto der echten Oberfläche**, *So geht's*, *Gut zu wissen*, *Im Unterricht*. ⭐ **Solange sie offen ist, schlägt jeder Klick auf ein Ding in SYNIR dessen Abschnitt auf** — Gerät auf der Fläche, Reiter im Kärtchen, Programm auf dem Bildschirm, Menüpunkt, sogar die Knöpfe am Pult (über die Brücke). SYNIR bleibt dabei bedienbar, die Arbeitsfläche rückt nach links. Der Knopf **◎ Zeigen** umrandet umgekehrt das Ding auf dem Bildschirm. |
| **Modus-Schalter** | Groß (52 px, Zeichen + Wort + Untertitel). Die **Geräteleiste folgt dem Modus**: Entwurf → ausgeklappt, Aktion → eingeklappt; von Hand umlegen geht, bis zum nächsten Wechsel. |
| **Kontrast** | `--ink-2`/`--ink-3`, Linien und der helle Akzent sind dunkler (Mint `#0a8a69`); jeder Abschnitt in den Fenstern (`.k-sec`) ist ein getönter Balken mit Streifen in der Modusfarbe. |

Bedienung: Leertaste hält an, Punkt macht einen Einzelschritt, Escape schließt das
Gerätefenster. Tempo von Zeitlupe bis Turbo, Vorgabe ist die Mitte.

Alle Tasten auf einen Blick:

| Taste | was sie tut |
|---|---|
| `Strg+Z` · `Strg+Y` · `Strg+Umschalt+Z` | zurück, vor, vor |
| `Strg+C` · `Strg+X` · `Strg+V` | kopieren, ausschneiden, einfügen |
| `Strg+A` | alle Geräte markieren |
| `Entf` · `Rücktaste` | die Markierung löschen (in beiden Modi) |
| `Leertaste` | Uhr anhalten / laufen lassen |
| `.` | ein Einzelschritt |
| `Esc` | Gerätefenster und Kärtchen zu |
| Ziehen auf leerem Feld | Ausschnitt verschieben |
| `Strg` + Ziehen | Rechteck aufspannen und alles darin dazunehmen |
| `Strg` + Klick auf ein Gerät | dazunehmen und sein Kärtchen aufmachen |
| `Alt` + Ziehen · Mittelklick | Ausschnitt verschieben |
| Mausrad · `Strg` + Mausrad | rollen · zoomen |

In einem Eingabefeld gelten die Kürzel dem Feld und nicht dem Netz — `Entf`
löscht dort ein Zeichen und kein Gerät.

## Was aus Filius übernommen ist — und warum das die Regel ist

Der Code entsteht nach Spezifikation neu (GPL, siehe unten). Das
**Bedienmodell** dagegen ist Filius, wo immer Filius eine Antwort hat. Nicht aus
Bequemlichkeit, sondern weil eine Lehrkraft, die Filius kennt, dieses Programm
ohne Einarbeitung benutzen können soll — und weil jedes selbst erfundene Wort
eine Erklärung kostet, die der Unterricht nicht bezahlen will.

Konkret übernommen:

* **Endgerät und Server sind dasselbe Gerät.** Filius hat Rechner und Notebook:
  gleiche Fähigkeiten, anderes Bild. Ein Server ist kein Gerätetyp, sondern ein
  Rechner, auf dem ein Serverprogramm läuft. Nichts in diesem Programm darf
  `kind === 'server'` abfragen, um etwas zu erlauben oder zu verbieten.
* **Software wird aufgespielt.** DNS-Server ist ein Programm aus der
  Software-Installation, kein Schalter im Einstellformular. Erst installieren,
  dann starten — die Erfahrung, die ein Kind von einem Rechner hat.
* **DHCP sitzt beim Endgerät, nicht beim Router.** In Filius hat der
  Vermittlungsrechner gar keine DHCP-Einstellungen. Die Aussage dahinter ist
  genau die, um die es geht: DHCP ist ein Dienst, den ein Gerät anbietet, und
  keine Eigenschaft des Vermittelns.
* **Der Wortlaut.** „Netzwerkkarte", „Schnittstelle hinzufügen", „Gateway",
  „Domain Name Server", „DHCP zur Konfiguration verwenden", „DHCP-Server
  einrichten", „Adress-Untergrenze", „Adressen (A)", „Verfügbar / Installiert".
  Alles aus der deutschen Oberfläche von Filius.
* **Keine Präfixschreibweise.** In Filius kommt `/24` nirgends vor. Hier stand
  sie eine Runde lang im Kärtchen und in der Weiterleitungstabelle; sie ist
  wieder weg. Netz und Maske stehen als zwei Spalten nebeneinander, so wie
  dort.
* **Kein Portnummern-Unterricht.** Der Mitschnitt hatte eine eigene Schale
  „UDP" mit Absender- und Zielport. Für DHCP ist das die Wahrheit, aber nicht
  das, was an dieser Stelle gelernt wird. Die Ports stecken weiter in der
  Simulation; wenn HTTP dazukommt, ist dort der Platz dafür.

## Der Unterschied zum Original

**Die Uhr.** Filius baut die Simulation aus Threads und `Thread.sleep` — je Kabel
zwei Threads, dazu einer je Protokollschicht je Gerät. Hier gibt es eine einzige
Ereigniswarteschlange über virtueller Zeit (`js/engine.js`). Das bringt vier
Dinge, die im Unterricht zählen:

* **Wiederholbar** — derselbe Startwert ergibt denselben Ablauf. Ein Fehler, den
  eine Klasse gerade gesehen hat, lässt sich noch einmal zeigen.
* **Anhaltbar** — Einzelschritt durch ein Ereignis nach dem anderen.
* **Regelbar** — Zeitlupe bis Turbo, ohne dass sich die Ergebnisse ändern.
* **Prüfbar** — 762 Prüfungen laufen kopflos in Node durch, 820 weitere im
  echten Browser (`node tests/kerntest.js`, `node tests/uitest.js`).

Außerdem läuft das Ganze in JavaScript, wo es gar keine Threads gibt.

**Die Optik heißt „Glastisch" — und sie ordnet über die Höhe.** Es gibt drei
Arten von Flächen, und man soll sehen, welche man vor sich hat, bevor man ein
Wort gelesen hat:

| | | |
|---|---|---|
| **Auftrag** | liegt flach auf dem Tisch | kein Schatten, halb durchscheinend, eine Klammer am oberen Rand, als einziges Stück im Programm ein warmer Ton. Er gehört der Lehrkraft, nicht der Anwendung. ⭐ Am Kopf **frei verschiebbar**; ein × gibt es nicht, **Minimieren** legt ihn als gelbe Kachel *Aufgabe* links neben das Szenario-Menü. |
| **Gerätefenster** | schwebt ein wenig | links eine Griffleiste — die Geste eines Werkzeugs, das man anfasst und hinlegt. |
| **Geräteoberfläche** | schwebt hoch | Rahmen, Tapete, Leiste oben, **Dock** unten. Kein Fenster des Programms, sondern ein Bildschirm. |

⭐ Diese drei Zeilen beantworten auch die Frage, wie ein **Router** im
Aktionsmodus aussieht: Er hat keinen Bildschirm, also bekommt er auch keinen —
er fällt eine Stufe tiefer auf *Gerätefenster*, also auf Werkzeug. Die Ordnung
in der Höhe ist damit nicht nur Optik, sondern eine Aussage über das Gerät.

Die Kopfzeile ist **Glas statt Schwarz**: ein durchgehend dunkler Riegel über
einer hellen Fläche gehört zu nichts, was darunter liegt.

Der Akzent bleibt **Mint** (hell) bzw. **Violett** (dunkel), obwohl der Entwurf
Indigo hatte. Indigo liegt genau auf `--sn-0`, der Subnetzfarbe Blau — ein
leuchtendes Kabel wäre von einem Kabel im blauen Netz nicht mehr zu
unterscheiden. Farbe heißt auf dieser Fläche „Netz“ und ist damit vergeben;
Indigo kommt nur dort vor, wo es kein Netz gibt: im Tisch, in der Tapete — und
in der Rahmung, wo es seit Neuem den **Entwurfsmodus** bezeichnet (siehe unten).

**Weniger Text (2026-09-28).** Vom Nutzer: „Die Oberfläche sollte mit weniger Texten auskommen. Baue lieber i-Buttons ein.“ Erklärsätze stehen deshalb hinter einem runden **„i“** an der Abschnittsüberschrift (`sec()` in konfig.js) und nur im **großen** Kärtchen; das kleine zeigt nur das Wichtigste (am Router keine Weiterleitungstabelle). Stehen bleiben Fehlermeldungen und Zustände („2 Geräte verbunden“).

**Die Bedienung.** Keine modalen Dialoge, und die Einstellungen stehen **neben
dem Gerät**, nicht am Bildschirmrand und nicht in einem Fenster über der Fläche.
Filius öffnet für eine IP-Adresse einen Dialog in der Fenstermitte; man sieht
dann die Adresse und nicht mehr das Gerät, zu dem sie gehört, nicht den
Nachbarn, mit dem sie sich streitet, und nicht die Fläche.

Es gab hier einmal eine **Inspektorspalte** am rechten Rand, die dieselben
Adressen noch einmal zeigte, nur zum Lesen. Sie ist weg. Zwei Ansichten
derselben Adresse sind keine Hilfe — man sucht dann erst die richtige —, und die
Spalte nahm der Fläche 340 px ab, dauerhaft, auch wenn gar nichts ausgewählt
war. Was nur sie konnte, die Tabellen eines Geräts, steht jetzt hinter **„Mehr ›"**
im selben Fenster: der Knopf schiebt es an den rechten Rand, genau dorthin, wo
die Spalte stand. Wer die Tabellen will, hat sie; wer sie nicht will, hat die
ganze Fläche.

**Und es gibt Strg+Z.** Filius hat es nicht: wer dort ein Gerät löscht, baut es
neu, mitsamt allen Adressen, die darin standen. Das ist einer der Punkte, an
denen eine Klasse aufgibt — und einer der wenigen, an denen ein Zusatz nichts
kostet. Das Bedienmodell bleibt Filius, es kommt nur eine Umkehrtaste dazu, und
zwar genau die, die jedes Kind schon kennt. Dass es sie gibt, verändert auch
anderes: **Entf löscht ohne Rückfrage**, weil ein Bestätigungsfenster für etwas
Umkehrbares eine Frage ist, auf die niemand „nein" antwortet. Stattdessen sagt
die Kurzmeldung, wie man es zurückholt.

Änderungen wirken beim Tippen. Verkabeln heißt von Gerät zu Gerät ziehen.
Konfigurationsfehler (Gateway im falschen Netz, Netzadresse als Geräteadresse,
Kabel ohne Adresse) stehen als Warnzeichen auf der Fläche und als Satz im
Kärtchen, nicht in einem Fenster, das man erst öffnen muss. Ein fehlgeschlagener
Ping sagt, woran es lag.

⚠️ **Die doppelt vergebene Adresse gehört seit 2026-09-26 NICHT mehr dazu.** Sie
war die erste Zeile dieser Liste und ist jetzt gar keine Meldung mehr — vom
Nutzer abbestellt: „Wenn mehrere Geräte die gleiche IP haben, soll es keinen
Fehler geben. Das ist mir zu viel Support, auch nun mit den lokalen IPs auch
einfach falsch." Das zweite Argument wiegt schwerer als das erste: seit es
Heimrouter und NAT gibt, stehen auf einer Fläche mehrere Häuser nebeneinander,
und `192.168.1.10` zweimal zu vergeben ist dann nicht erlaubt, sondern der
Punkt — private Adressen sind nur in ihrem eigenen Netz eindeutig. Im **selben**
Netz meldet sich der Zusammenstoß ohnehin von selbst und besser: zwei Geräte
antworten auf dieselbe ARP-Anfrage, und beide Antworten stehen im Mitschnitt.
Genau das ist seit dieser Runde der erste Fehler in Szenario 4.

**Netzteil und Geräteteil in Farbe.** Der Begriff, an dem in der Mittelstufe
alles hängt — und aus vier Zahlen mit Punkten ist er nicht abzulesen. Die
Adresse ist **im Eingabefeld selbst** eingefärbt: hinter dem Feld liegt eine
Spiegelschicht mit denselben Zeichen, der vordere Teil blau (Netz), der hintere
braun (Gerät). Sie stand einmal als zweite Zeile unter dem Feld — dieselbe Zahl
zweimal untereinander, und das Fenster dafür eine Zeile höher. Dieselbe
Darstellung steht auf der Fläche unter jedem Gerät: gleicher blauer Anfang heißt
gleiches Netz, und das sieht man auch aus der letzten Reihe. Liegt die Grenze
mitten in einem Block (bei `/26` zum Beispiel), ist dieser Block gestreift statt
einer Seite zugeschlagen — dort liegt gerade der Lernstoff. Solange die Adresse
noch getippt wird, steht sie ungefärbt da: die Grenze zwischen den beiden Teilen
steht erst fest, wenn die vier Blöcke vollständig sind — zu sehen sein muss aber
jedes Zeichen von Anfang an.

**Welches Kabel gehört zu dieser Netzwerkkarte?** Wird im Gerätefenster eine
Netzwerkkarte angefasst — mit dem Zeiger darüber oder dem Schreibstrich in ihrem
Feld —, leuchtet draußen auf der Fläche ihr Kabel auf. Im Formular steht sonst
nur „Kabel zu Switch 1", und bei einem Router mit drei Karten und drei Switches
ist das die Frage, die man sich nicht mehr selbst beantworten kann. Beim Switch
tun die Anschlussfelder dasselbe.

**Eine Zeile je Angabe.** Beschriftung links, Feld rechts: „MAC-Adresse: …",
„IP-Adresse: …". Vorgaben in leeren Feldern sind blass und damit als Vorgabe
erkennbar; bei Gateway und DNS steht gar keine, denn beide dürfen leer
bleiben — eine Beispieladresse in einem leeren Pflichtfeld sieht aus wie ein
Eintrag, den es nicht gibt.

**Keine Uhr.** In der Kopfzeile stand eine Anzeige der Simulationszeit samt
Länge der Ereigniswarteschlange. Für die Fehlersuche war sie nützlich, im
Unterricht war sie ein Zahlenfeld, das sich unablässig bewegt und keine Frage
beantwortet — kein Auftrag in diesem Programm lautet „wie viele Mikrosekunden".
Wer die Zeit braucht, findet sie im Mitschnitt an jedem Rahmen, dort steht sie
bei dem Ereignis, zu dem sie gehört.

**Die Modi — übernommen, aber entschärft.** Entwurf und Aktion trennt Filius zu
Recht: derselbe Klick kann nicht beim Bauen etwas anderes heißen als im Betrieb.
Eingestellt wird wie dort im **Entwurf**, am Kärtchen neben dem Gerät — das ist
in Filius der Konfigurationsdialog am Netzplan (`JHostKonfiguration`), und auf
dem Bildschirm eines Rechners hat die eigene Adresse nichts zu suchen. ⚠️ Das war
eine Runde lang anders (ein Programm *Einstellungen* auf dem Desktop) und ist am
2026-09-26 auf Wunsch des Nutzers zurückgenommen worden. **Lesbar** bleibt die
Adresse im Aktionsmodus an zwei Stellen: in der Kopfzeile des Bildschirms und
über `ipconfig`. Bei Router, Heimrouter und Switch — den Geräten **ohne**
Bildschirm — steht das Formular weiterhin im Gerätefenster; dort ist es kein
Programm, sondern der ganze Inhalt.

**Und man sieht, in welchem Modus man steckt, ohne den Schalter zu suchen.** Der
Umschalter allein reicht nicht: er steht oben in der Mitte, die Augen sind auf
der Fläche, und die Frage kommt dann als „warum passiert nichts, wenn ich auf den
Rechner klicke". Jeder Modus hat deshalb eine Farbe — **Indigo** für den Entwurf
(Blaupause, Reißbrett), **Mint/Grün** für die Aktion (es läuft) — und sie steht
an vier Stellen zugleich:

* ein **3-px-Streifen** über die ganze Breite, ganz oben am Bildschirmrand;
* ein Hauch derselben Farbe in Kopf- und Werkzeugleiste, dazu deren untere Kante;
* der **Umschalter selbst** und alles, was in der jeweiligen Leiste „an" ist
  (Zeiger/Kabel im Entwurf, der Play-Knopf in der Aktion) — damit ist der
  Umschalter zugleich die Legende für den Streifen;
* ein **Raster auf dem Tisch**, das es nur im Entwurf gibt.

Das Raster ist das wichtigere Zeichen, weil es dort liegt, wo hingesehen wird.
Es ist ausdrücklich **farblos** (Tinte mit 5 % Deckung): ein eingefärbter
Untergrund hieße auf dieser Fläche „gehört zu einem Netz". Und die beiden
Modusfarben bleiben in der Rahmung — auf der Fläche heißt Farbe weiterhin nur
„Netz".

**Der Mitschnitt.** Eine Liste über das ganze Netz statt einer Tabelle je Gerät.
Man liest den Weg eines Pakets von oben nach unten.

Filius' Blick auf eine einzelne Station ist damit nicht verloren: **ein Gerät
antippen schränkt die Liste darauf ein** — das ist dieselbe Ansicht, die dort
der Rechtsklick auf *Datenaustausch anzeigen* öffnet, nur ohne Rechtsklick und
ohne Reiter. Das Chip *nur Endgerät 1* in der Leiste löst es wieder.

Und weil ein Gerät beides sieht, was es sendet **und** was bei ihm ankommt,
wird beides aufgezeichnet und mit ↑ / ↓ unterschieden. Über das ganze Netz
gesehen zeigt die Liste voreingestellt nur die Abgänge — sonst stünde jeder
Rahmen zwei- bis viermal da (Absender, Switch rein, Switch raus, Empfänger) und
die Geschichte verschwände in ihren eigenen Wiederholungen. Der Knopf sagt, wie
viele Zeilen er gerade verschweigt. Bei gewähltem Gerät kippt er von selbst auf
„beide", denn dort ist die halbe Antwort keine.

**Und die Schichten als Tabelle.** Der Knopf *Zeilen / Schichten* schaltet auf
Filius' Datenaustausch-Fenster um: eine Zeile je **Schicht**, alle Zeilen eines
Rahmens unter derselben Nummer, nach Schicht eingefärbt — mit seinen Spalten
(Nr. · Zeit · Quelle · Ziel · Protokoll · Schicht · Bemerkungen), seinen vier
Schichtnamen (*Netzzugang · Vermittlung · Transport · Anwendung*) und seinen
Farben.

Dafür lohnt sich das Umschalten, und es ist Filius' bester didaktischer
Einfall: **dieselben zwei Spalten „Quelle" und „Ziel" tragen auf jeder Schicht
etwas anderes** — erst MAC-Adressen, dann IP-Adressen, dann Portnummern,
untereinander im Bild. Daran begreift man, dass jede Schicht ihr eigenes
Adressierungssystem hat und die darunterliegende gar nicht kennt. In der
kompakten Ansicht steht das nur in den aufgeklappten Schalen, und dort muss man
es suchen.

```
 NR.   ZEIT      GERÄT        QUELLE             ZIEL               PROTOKOLL  SCHICHT      BEMERKUNGEN
   9   400.2 ms ↑ Endgerät 1  02:99:72:da:ab:2c  02:86:45:9f:dd:78  Ethernet   Netzzugang   IP-Paket
                              192.168.1.10       192.168.1.20       IP         Vermittlung  Protokoll: TCP, TTL: 64
                              56523              80                 TCP        Transport    [SYN]  Seq: 1336
```

### Subnetze in Farbe — das einzige, was es in Filius gar nicht gibt

Ein Netzplan in Filius ist grau. Ob `192.168.1.10` und `192.168.2.10`
zusammengehören, muss man rechnen — und genau daran scheitert der Einstieg in
Schicht 3: die Klasse verkabelt richtig, trägt Adressen ein, und nichts geht,
weil zwei Geräte am selben Draht in zwei verschiedenen Netzen liegen. Das ist
unsichtbar, solange niemand es färbt.

Ein Subnetz braucht hier **zwei** Dinge, und beide sind der Unterrichtsstoff:

1. **über Kabel erreichbar, ohne Router dazwischen.** Ein Switch reicht durch
   (Schicht 2 — er verbindet alle seine Anschlüsse zu einem Draht), ein Endgerät
   oder Router tut das nicht. Genau deshalb liegt ein Router in mehreren Netzen
   und ein Switch in gar keinem.
2. **gleicher Netzanteil.** Netzadresse *und* Netzmaske. `192.168.1.10` mit
   `255.255.255.0` und `192.168.1.20` mit `255.255.255.128` liegen **nicht**
   zusammen, obwohl die ersten drei Blöcke gleich aussehen.

Ein Gerät allein ist kein Netz: „Netz" heißt mindestens zwei, die sich erreichen
könnten. Und Switche bekommen keine Farbe — sie haben keine IP-Adresse; ihre
Kabel sind gefärbt, sie selbst nicht.

Dieselbe Farbe steht an **drei** Orten, weil dort dieselbe Frage gestellt wird:
Ring um das Gerät · Kabel · Block der Netzwerkkarte im Gerätefenster.

**Wie ein Adressraum aufgeschrieben wird.** Die Frage, an der jede Darstellung
hängt, sobald die Maske nicht auf einer Blockgrenze endet. Deshalb steht je Netz
nicht eine Zeile, sondern drei — und die letzte stimmt immer:

| | `255.255.255.0` | `255.255.255.192` |
|---|---|---|
| Kurzform | `192.168.1.__` | `192.168.1.64` — letzter Block **gestreift** |
| Netz · Maske | `192.168.1.0` · `255.255.255.0` | `192.168.1.64` · `255.255.255.192` |
| Adressen | `192.168.1.1 – 192.168.1.254` | `192.168.1.65 – 192.168.1.126` |

Die Zeile **Adressen** ist die Antwort auf krumme Masken: von der ersten bis zur
letzten Adresse, die ein Gerät bekommen darf, ohne dass jemand Bits zählt.
Präfixschreibweise (`/26`) kommt nirgends vor — sie gibt es in Filius nicht.

**Zwei Dinge, die erst das Bild im Browser gezeigt hat:**

* Die Liste lag über E1 und E2 des dritten Szenarios — über genau den Geräten,
  deren Farbe sie erklärt. Derselbe Fehler wie einst die Auftragskarte über
  Rechner 1, nur schlimmer: die Karte kann man wegklicken, diese Liste will man
  offen haben. Jetzt macht sie der Fläche Platz (`body.sub-open`), statt sie zu
  verdecken.
* Von acht Farben trugen zwei nicht. Ein **schiefergraues** Subnetz sah aus wie
  ein ungefärbtes, und **Ocker neben Orange** hält über die Breite eines
  Netzplans niemand auseinander. Jetzt sechs kräftige Töne. Aus demselben Grund
  ist die **Auswahl** eines Geräts nicht mehr im Akzent markiert: der ist hell
  Mint und dunkel Violett, und beides gibt es als Subnetzfarbe. Auf dieser
  Fläche heißt Farbe ab sofort ausschließlich „Netz".

## Aufbau

```
index.html
css/app.css          Optik „Glastisch", hell und dunkel
js/
  util.js            Adressrechnen (auch Netz-/Geräteteil), Haufen, Würfel
  engine.js          ⭐ Ereigniswarteschlange über virtueller Zeit
  netz.js            Geräte, Anschlüsse, Kabel — und das Speicherformat.
                     Hier und NUR hier: WAN/LAN des Heimrouters, die
                     LAN-Brücke und der Funkabgleich. Dazu `ausschnitt`
                     und `einfuegen` für Kopieren/Einfügen
  verlauf.js         ⭐ Rückgängig und Wiederherstellen — Stände, keine
                     Befehle
  nat.js             ⭐ die Übersetzung an der Haustür (NAPT, RFC 3022)
                     samt den Portfreigaben — dieselbe Liste für beide
                     Richtungen
  tcp.js             Handschlag, Bestätigung, Vier-Wege-Abbau, RST
  rip.js             ⭐ automatisches Routing (Distanzvektor, Split
                     Horizon, Unendlich = 16). Erzeugt in `Stack`, weil
                     `routeFor` sein Ergebnis bei jedem Paket braucht;
                     geschaltet von `dienste.sync()`
  dateien.js         Dateisystem je Gerät (flach: Pfad → Eintrag)
                     und ⭐ der INHALTSSPEICHER für hochgeladene
                     Dateien — er liegt NEBEN dem Netz, nicht
                     darin, damit der Verlauf klein bleibt
  http.js            HTTP/1.0 und der Webserver-Dienst; der Browser-Teil
                     (auch POST, Cookies, https:// und „Trotzdem fortfahren")
  stream.js          Streaming-Server: Konten, Filme, Anmeldung per Cookie
  tls.js             ⭐ die TLS-Schale zwischen TCP und Programm: Handschlag
                     (ClientHello/ServerHello, Diffie-Hellman, Zertifikat,
                     Beweis) und der verschlüsselte Datenstrom. Dazu die
                     reinen Rechenfunktionen (`Tls.Krypto`) — Spielzeug, siehe
                     Dateikopf; Schritt 5 (VPN) benutzt sie wieder
  zs.js              ⭐ die Zertifizierungsstelle (Port 8200): Antrag,
                     Prüfbesuch, Freigabe, Abholen — und die Seite des
                     Antragstellers; Vertrauensliste eines Geräts
  mail.js            SMTP · POP3 · Postfächer (mit TLS: 465 und 995)
  schichten.js       Ethernet · ARP · IP · ICMP · UDP mit Ports.
                     `routeFor` entscheidet den Weg: längste Maske,
                     bei Gleichstand die Herkunft (direkt · eingetragen
                     · RIP · Standardgateway). Zwei Haken zu nat.js,
                     im Code mit ⟨NAT⟩ markiert
  dienste.js         DHCP (Server und Client) · DNS (Server und
                     Auflöser) · und das An/Aus von Webserver,
                     Mailserver und RIP
  internet.js        ⭐ das Class Wide Web: was hinter der
                     Internet-Karte des cww liegt — der Ausgang in
                     den Raum, 8.8.8.8 und das Verzeichnis. Die
                     EINZIGE Datei im Kern, die weiß, dass es andere
                     Tablets gibt
  mitschnitt.js      Paketaufzeichnung und ihre Beschreibung
  terminal.js        Kommandozeile
  subnetze.js        ⭐ wer liegt mit wem im Netz — Farben, Adressräume
  flaeche.js         SVG-Feld: Ausschnitt (Zoomen, Verschieben), Ziehen,
                     fliegende Pakete, Subnetzringe, Mehrfachauswahl
                     (Rechteck, Strg-Klick, Verband verschieben)
  konfig.js          ⭐ EIN Einstellformular, klein und groß — darin
                     auch Weiterleitungstabelle, RIP-Haken und
                     Portfreigaben
  weiterleitung.js   ⭐ dieselbe Tabelle als Fenster unten über die
                     ganze Breite, ein Reiter je Router. Holt
                     `wegStand` aus konfig.js, statt es zweimal zu
                     schreiben — dieselbe Zeile muss an beiden Orten
                     dasselbe sagen
  panels.js          Gerätefenster (mehrere gleichzeitig),
                     Mitschnittliste, Terminalfenster
  geraet.js          Oberfläche eines Geräts — hier steht PROGRAMME,
                     die Liste der Anwendungen samt Installation, und
                     OHNE_SCHIRM: wer keinen Bildschirm hat (Router,
                     Heimrouter, Switch) und was stattdessen dasteht
  prog-dateien.js    Datei-Explorer, Editor, Bildbetrachter
  prog-web.js        Webserver- und Webbrowser-Fenster
  prog-zert.js       ⭐ Zertifikate in der Oberfläche: der Kasten
                     „Verschlüsselung" in den Serverfenstern, das Fenster
                     der Zertifizierungsstelle, die Vertrauensliste im Browser
  prog-vpn.js        ⭐ VPN-Server- und VPN-Client-Fenster (Logik: vpn.js)
  prog-mail.js       E-Mail-Programm und E-Mail-Server-Fenster
  szenarien.js       acht vorbereitete Netze mit Auftrag
  hilfe-inhalt.js    ⭐ der Text der Hilfe für Lehrkräfte (nur Inhalt)
  hilfe.js           ⭐ die Hilfe: Blatt rechts, Suche, Verzeichnis, und
                     `zielVon` — welches angeklickte Ding zu welchem
                     Abschnitt gehört
hilfe/*.webp         Bildschirmfotos der Hilfe, gemacht von
                     tests/hilfe-bilder.js; hilfe/masse.js = ihre Maße
  app.js             Zusammenbau, localStorage
```

**Warum `konfig.js` eine eigene Datei ist.** Dasselbe Formular stand einmal
zweimal da — einmal am Rand, einmal in der Geräteoberfläche. Zwei Kopien
heißt: eine neue Einstellung muss an zwei Stellen eingebaut werden, und beim
dritten Mal vergisst man eine. Mit DHCP, DNS und den anbaubaren Anschlüssen
wären daraus zwei Formulare mit je zehn Feldern geworden.

**Warum `dienste.js` beide Protokolle enthält.** Weil sie dasselbe Muster haben
und dasselbe brauchen: einen Port, einen Behandler, einen Zeitgeber fürs
Aufgeben. Wer die zwei nebeneinander liest, sieht das Muster — und das dritte
Programm (Webserver) schreibt sich danach fast von selbst.

**Warum `verlauf.js` ZUSTÄNDE merkt und keine Befehle.** Ein Netz wird an
ungefähr zwanzig Stellen verändert — jedes Adressfeld, DHCP, Netzwerkkarten
an- und abbauen, Kabel, Ein/Aus, Löschen, Verschieben, Verkabeln, Anlegen,
Einfügen. Ein Verlauf aus umkehrbaren Befehlen müsste an jeder dieser Stellen
gepflegt werden, und eine vergessene fällt nicht auf: der Stapel wäre dann
nicht leer, sondern **falsch** — Strg+Z stellte einen Stand her, den es nie
gab. `netz.toJSON()` gibt es dagegen schon, es ist geprüft, und es ist genau
die Bauanleitung des Netzes. Was nicht darin steht (geliehene DHCP-Angaben,
Funkbuchsen, ARP-Tabellen), gehört auch nicht in den Verlauf. Sechzig Stände
sind wenige hundert Kilobyte Text.

**Warum `nat.js` eine eigene Datei ist.** Es ist ein abgeschlossenes Thema mit
genau **zwei** Berührungspunkten zur Protokollschicht: einer auf dem Weg
hinaus, einer auf dem Weg herein. Beide sind in `schichten.js` mit `⟨NAT⟩`
markiert. ⚠️ Der Rückweg muss **vor** der Frage „für mich?" stehen — die
Antwort aus dem Internet trägt als Ziel die Adresse des Heimrouters und ist
trotzdem nicht für ihn.

**Warum WAN, LAN und Funk nur in `netz.js` stehen.** Vier Fragen —„ist das die
WAN-Karte?", „welche Karte trägt hier die Adresse?", „welche Buchsen gehören
zusammen?", „wie heißt dieser Anschluss?" — werden an genau einer Stelle
beantwortet (`istWan`, `brueckeNic`, `bruecke`, `portLabel`). Stünde
`kind === 'heimrouter' && i === 0` irgendwo sonst noch einmal, liefe es beim
nächsten Umbau auseinander, und zwar lautlos: beide Zweige sähen plausibel aus.

Klassische `<script>`-Einbindung mit globalen Namen, kein Modulsystem — dieselbe
Bauweise wie MPSkills, damit der Ordner später ohne Umbau nach
`MPSkills/tools/…/` wandern kann.

## Die Hilfe für Lehrkräfte

*(seit 2026-10-02 · `js/hilfe.js`, `js/hilfe-inhalt.js`, `css/hilfe.css`, Bilder in `hilfe/`,
Prüfstand `tests/hilfetest.js`)*

* **Wer:** Lehrkraft im Raum und Einzelbetrieb (`body[data-rolle]` ≠ `participant`).
* **Wo:** ein Blatt über der rechten Hälfte, unter der Kopfzeile. Damit Fenster, die rechts
  aufgehen (Gerätebildschirm, großes Kärtchen), nicht darunter verschwinden, rücken `.main`,
  Weiterleitungstabelle, Mitschnitt, Terminal und Kurzmeldung zur Seite (`body.hilfe-offen`).
  Unter 900 px Breite liegt die Hilfe über allem (`hilfe-schmal`).
* **Breite:** am **linken Rand ziehen** — von 300 px bis zur ganzen Seite; bleibt für SYNIR weniger
  als 380 px übrig, liegt die Hilfe darüber (`hilfe-voll`) statt die Fläche auf null zu drücken.
  Knopf ⤢ im Kopf: ganze/halbe Breite; Doppeltipp auf den Rand: zurück. Das **Verzeichnis** hat
  einen eigenen Griff (Mitte) und den Knopf ‹/›: schmal = nur Kapitelnummern. Beides bleibt im
  Gerät gemerkt (`localStorage` `synir.hilfe.breite` als Anteil, `synir.hilfe.toc` in px). Ob das
  Verzeichnis über den Text klappt, entscheidet die Breite des **Blatts** (Container-Abfrage
  `@container hilfe`), nicht die des Bildschirms.
* **Klick → Abschnitt:** `zielVon(el)` in `hilfe.js`, vom Speziellen zum Allgemeinen (Knöpfe
  und Reiter, Felder `data-k`/`data-f`, Überschriften `.k-sec` im Kärtchen, Programm des
  Bildschirms, Geräteart auf der Fläche). Gelesen wird pointerdown/-up im Einfangen, nie
  angehalten — die Hilfe hört zu, sie greift nicht ein. Ziehen zählt nicht, der leere Tisch
  auch nicht. Das Pult in `tool.js` schickt `{ hilfe: '<abschnitt>' }` in den Rahmen.
* ⚠️ **Wer etwas Neues in die Oberfläche baut**, ergänzt einen Abschnitt in
  `hilfe-inhalt.js`, eine Zeile in `zielVon` (falls es ein eigenes Fenster/Knopf ist) und
  lässt die Bilder neu machen:
  `NODE_PATH=<playwright-core> node tests/hilfe-bilder.js [name …]` (braucht ImageMagick).
  Das Skript schreibt auch `hilfe/masse.js` — ohne die Maße verrutschen Sprünge, weil
  nachladende Bilder den Text verschieben.

## Im Raum (MPSkills)

Seit dem 2026-09-28 ist SYNIR ein Skill in MPSkills (Migration `0180_synir.sql`,
Eintrag `synir` in `MPSkills/tools.js`). Die Anwendung läuft dabei **eingerahmt** in
einem `<iframe>`, genau wie Wild Clusters. Dieselbe `index.html` geht weiterhin auch
für sich.

| Datei | Rolle |
|---|---|
| `tool.js` / `tool.css` | Die Tür auf der MPSkills-Seite. Sie baut das Pult der Lehrkraft, ruft den Server und schickt Befehle in den Rahmen. |
| `js/bruecke.js` | Die Gegenseite im Rahmen (`synir:cmd` rein, `synir:event` raus). **Ohne Rahmen tut sie nichts.** |
| `js/szmenue.js` | Das Szenario-Menü: ohne Raum nur die mitgelieferten, bei der Lehrkraft Reiter *Öffentlich (public)* / *Eigene (private)* mit Teilen-Schalter, auf dem Tablet nur die geteilten. |
| `js/aufgabe.js` | `reinigen()` (der Türsteher für jeden Aufgabentext), der Editor „Aufgabentext" und die Speichern-Dialoge. |

**Was die Lehrkraft hat:**

* **Teilen.** Das Symbol hinter jedem Szenario schaltet die Freigabe. Geteilte Szenarien
  sind grün hinterlegt. Die Freigabe steht in `skill_room_state.data.shared`
  (`[{id, t}]`); mitgelieferte tragen die ID `builtin:<schlüssel>`.
* **Eigene Szenarien.** Unter **Speichern → Als Szenario speichern** fragt ein Dialog nach
  einem Namen. Ist das geladene Szenario schon ein eigenes, gibt es „Überschreiben" und
  „Als neues speichern". Eigene Szenarien liegen in `synir_scenarios`, hängen an der
  Lehrkraft und nicht am Raum, und stehen in jedem neuen Raum unter **Eigene**.
* **Aufgabentext.** Der Editor bietet F, K, Aufzählung und einen Knopf für die
  Schriftgröße (normal → groß → klein, als Klassen `fs-l`/`fs-s` am Absatz). Jedes
  Szenario hat genau einen Auftrag.
* **Stand der Klasse und Spiegelung.** Jedes Tablet meldet seinen Stand
  (gebremst auf 1,5 s, in `synir_work`). Ein Tipp auf eine Person legt deren Netz auf
  den Beamer, und der Beamer folgt, solange das Kind arbeitet.
  * Sobald die Lehrkraft **selbst** etwas tut (Netz, Auftrag oder Umschalten auf Aktion),
    wird es ihre Kopie. Der Hinweis wechselt dann auf „Kopie von …".
  * Die Lehrkraft schreibt nie in den Stand eines Kindes.
  * „Beenden" legt das eigene Netz der Lehrkraft zurück.
* **Schüler blind.** Legt auf jedes Tablet das Logo mit „Wir machen jetzt am Beamer
  weiter.". Der Schleier fängt Zeiger und Tasten ab, und `synir_work_put` lehnt ab,
  solange er liegt.

**Was die Klasse hat:**

* Nur die geteilten Szenarien.
* Die Meldung „Neues Szenario verfügbar", sobald etwas dazukommt.
* Speichern nur auf dem PC. Die Datei trägt jetzt auch den Auftrag (`titel`, `aufgabe`,
  `szenario` im Stand); vorher ging er beim Speichern verloren.

**Der Gerätespeicher** ist eingerahmt je Raum und Rolle getrennt
(`netzsim.stand.v1:<rolle>:<raumcode>`).

**Große Dateien:** Ein Stand über ca. 250 KB geht ohne seine hochgeladenen Dateien nach
vorn. Am Beamer steht dann ein Schild „Datei liegt nur auf dem Tablet".

**Prüfstände:**

| Aufruf | Was er prüft |
|---|---|
| `node tests/raumtest.js` | Lehrkraft und Tablet im Browser gegen die echte Migration in pglite |
| `node supabase/tests/0180_synir.mjs` (aus der Wurzel) | die RPCs allein |

Ohne installiertes Chrome den Pfad in `CHROME_PATH` setzen (gilt auch für `uitest.js`).

⚠️ **Cache-Stempel.**
* Wer `tool.js` oder `tool.css` anfasst, zieht den Stempel in `MPSkills/lib/tool.js`
  (und die fünf Stellen, die dort stehen).
* Wer `index.html`, `css/` oder `js/` anfasst, zieht zusätzlich `V` in `tool.js` **und**
  die `?v=` in `index.html`.

## Das Class Wide Web (cww)

Das Modem aus Filius — nur dass am anderen Ende nicht **eine** zweite Instanz
hängt, sondern die Netze **aller Tablets im Raum**. Seit dem 2026-09-28.

**Das Bild, das dahintersteht.**

| Im cww | Im echten Internet |
|---|---|
| jedes Kind hat ein /8 aus 50…150 (z. B. `67.0.0.0/8`), die Lehrkraft immer `100.0.0.0/8` | ein Adressblock, den eine Vergabestelle zuteilt |
| das cww | der Grenzrouter des Anbieters |
| das 8er-Netz (`8.x.y.z`), in dem alle cwws hängen | der Knoten, an dem sich Anbieter treffen |
| nur Absender aus dem eigenen /8 kommen hinaus | Ingress-Filtering (BCP 38) |
| 8.8.8.8 | der öffentliche DNS — hier als Sammelverzeichnis |

Wem welches /8 gehört, sieht nur die Lehrkraft (Pult → *Internet der Klasse*).
Die Klasse soll es herausfinden müssen — mit `traceroute`, mit 8.8.8.8, mit Fragen.

**Das Gerät** (`netz.js`, KIND `cww`, `einmalig`). Höchstens eines je Netz. Karte 0
ist der Anschluss ins Internet (`istInternet`) — kein Kabel, feste Adresse im
8er-Netz, vom Raum vergeben und **nicht** in der Datei (`toJSON` schreibt sie leer,
genau wie den eigenen Bereich: der hängt am Kind, nicht am Netz). Karten ab 1 zeigen
nach innen. Das Einstellfenster hat drei Reiter (seit 2026-09-29, in dieser
Reihenfolge — außen, innen, Einstellungen):

| Reiter | Inhalt |
|---|---|
| *Internet* | der Weg nach draußen: Adresse in der Wolke (`8.x.y.z`) und Netzmaske; darunter die **Bereiche der anderen** im Raum (`13.0.0.0/8`, `14.0.0.0/8`, …) — nur die Zahlen, nur lesen |
| *Netzwerkkarten* | der eigene Adressbereich, groß; darunter die Karten nach innen |
| *Allgemein* | DHCP-Server, DNS (die Adresse `8.8.8.8` fest und gesperrt, auch im kleinen Kärtchen und im Aktionsmodus; Knopf „DNS-Liste öffnen" → Unterseite mit der Liste von 8.8.8.8, auch im Aktionsmodus lesbar), Routing: RIP-Haken und Weiterleitungstabelle, in der die Bereiche der anderen **schon voreingetragen** stehen („vom CWW", nur lesen; eigene Zeilen kommen darunter) |

Bearbeiten geht nur im Entwurf. Im Aktionsmodus zeigt `konfig.kompakt` dieselben
Blöcke in derselben Reihenfolge als Zeilen, ohne Reiter — Lehrkraft und Kinder sehen
dasselbe. Die Bereiche der anderen kommen mit jedem Tausch vom Server
(`bereiche`, Migration 0182: alle anderen /8 im Raum, die in den letzten 20 s gefragt
haben) und stehen in `internet.andere()`; ohne Raum und in der Spiegelung ist die
Liste leer. Sie sind reine Anzeige: beim Routen ändern sie nichts. Bereiche, DNS-Liste
und die voreingetragenen Zeilen frischen sich alle 3 s selbst auf (`data-live`-Kästen,
`konfig.cwwAuffrischen`, ohne Neubau des Fensters).

**Die Weiterleitung** (`schichten.js`, `routeFor`). Ein neuer Rang `Internet`
(nach dem Standardgateway): alles außerhalb des eigenen /8 geht an Karte 0.
Eingetragene und gelernte Wege gelten am cww nur für Ziele im eigenen /8 — sonst
holte ein Eintrag fremde Pakete ins eigene Netz. In `onIp` die zwei Regeln der
Haustür: hinaus nur mit eigenem Absender, herein nur, was ins eigene /8 will
(`drop-quelle` im Ereignisstrom).

**Wie ein Paket zu einem anderen Tablet kommt.**

1. Das cww übergibt es `internet.raus` (statt ARP und Kabel).
2. Die Brücke holt den Ausgang ab (`cww`-Ereignis, 30 ms gebündelt).
3. `tool.js` tauscht mit dem Server: `synir_cww_tausch` nimmt, was hinaus soll,
   und gibt zurück, was für dieses /8 da ist — **ein** Aufruf, alle 0,7 s solange
   etwas fließt, sonst alle 3 s, und gar nicht, solange kein cww auf der Fläche liegt.
4. Beim Empfänger speist `stack.vonInternet` es an SEINER Karte 0 ein, 200 ms
   später in seiner eigenen Uhr.

Jedes Tablet rechnet dabei mit seiner eigenen Uhr weiter. Deshalb warten **alle
Fristen für fremde Ziele zehnmal so lang** (`FERN_FAKTOR`: Ping, DNS, TCP) — sonst
liefe bei „Turbo" die Frist ab, während das Paket nur auf die nächste Abfrage des
Raums wartet. Ein Tablet, das seit 20 s nicht gefragt hat (zugeklappt, Reiter im
Hintergrund), ist „nicht erreichbar" — gewollt realistisch.

**8.8.8.8** steht in der Wolke und nicht auf der Fläche. Es beantwortet Pings und
DNS-Fragen (A und MX). Was es weiß, melden die Tablets mit jedem Tausch: jeder
Eintrag eines DNS-Servers, der läuft, eine Adresse im eigenen /8 hat und vom cww
erreichbar ist — und nur A-Einträge, die ins **eigene** /8 zeigen (auch das prüft
der Server). Private Adressen erscheinen im Fenster grau mit Grund. Ein Name gehört
dem, der ihn zuerst anmeldet; wer später kommt, sieht „vergeben". ⚠️ Die bewusste
Vereinfachung: der echte 8.8.8.8 fragt rekursiv (Wurzel → .de → Server der Domain);
hier ist er ein Verzeichnis, in das man hineinsehen kann.

**Ohne Raum** läuft das cww im Übungsbetrieb: Bereich `50.0.0.0/8`, 8.8.8.8 kennt
nur die eigenen Namen, alles andere ist „nicht erreichbar". **In der Spiegelung**
(Beamer sieht einem Kind zu) ist der Anschluss aus — die Lehrkraft funkt nie im
Namen eines Kindes.

**Szenario 8 „Ins Internet"** hat bewusst **keine** öffentlichen Adressen: jedes
Kind hat ein anderes /8, und das Eintragen aus dem eigenen Bereich ist der Auftrag.

**Prüfstände:** `tests/kerntest.js` (Abschnitte „Class Wide Web" — zwei Tablets in
einem Prozess, die Wolke ist dort eine Schleife), `supabase/tests/0181_synir_cww.mjs`
(die RPCs, auch 0182), `tests/raumtest.js` (zwei Tablets und die Lehrkraft im Browser gegen
pglite: Ping, 8.8.8.8, Webseite über den Raum).

## Das Tempo — und was daran hängt

Der Regler hat fünf Stufen. Rechts steht, wie lange ein Paket dann für **ein
Kabel** auf dem Bildschirm braucht:

| | Tempo | je Kabel | |
|---|---|---|---|
| Zeitlupe | 0,025 | 4 s | einem einzelnen Rahmen zusehen |
| langsam | 0,05 | 2 s | |
| **normal** | **0,1** | **1 s** | **Voreinstellung, Mitte des Reglers** |
| schnell | 0,4 | 250 ms | |
| Turbo | 2 | 50 ms | Tabellen füllen, nicht zusehen |

Vorher war „normal" die Echtzeit (Tempo 1). Physikalisch ehrlich und didaktisch
falsch: bei Echtzeit ist ein Ping durch drei Geräte nach einer halben Sekunde
durch, und von dem, was man sehen wollte, bleibt ein Flackern. Die ganze Anlage
dieses Programms — der sichtbare Punkt, das leuchtende Kabel, die Reihenfolge
der Kabel — setzt voraus, dass man mitkommt.

**Und daran hängen alle Fristen der Protokolle.** Sie stehen in *simulierter*
Zeit; auf dem Bildschirm werden sie durch das Tempo geteilt. Bei 0,1 wird aus
einer simulierten Sekunde eine echte Zehntelminute. Vier Zahlen müssen deshalb
in dieser Reihenfolge stehen, und drei davon haben beim Umeichen zuerst falsch
gestanden:

```
Kabel 100 ms   <   ARP-Geduld 0,8 s   <   Ping-Frist 3 s
                   × 3 = 2,4 s
                                           DNS-Frist 2,5 s  (> ARP + 8 Kabel)
```

* **ARP-Geduld zu kurz** (0,4 s = genau eine Runde über einen Switch): jede
  ARP-Anfrage stand zweimal im Mitschnitt, weil die Wiederholung im selben
  Augenblick hinausging, in dem die Antwort kam.
* **Ping-Frist zu kurz** (1,6 s = genau der ehrliche Weg über einen Router mit
  zwei Adressauflösungen): Ping Nr. 1 meldete „Zeitüberschreitung", Nr. 2 bis 4
  kamen an. Ein Kind lernt daraus, dass Netze eben manchmal nicht gehen.
* **DNS-Frist zu kurz** (1,5 s): die Frage ging zweimal hinaus, und die zweite
  Antwort landete auf einem Port, den das Endgerät schon geschlossen hatte —
  „Port nicht erreichbar" als Schlusspunkt einer *geglückten* Auflösung.

Alle drei bewacht jetzt eine Prüfung (`tests/kerntest.js`, Abschnitte „Fristen"
und „DNS über einen Router"). Dazu kommt ein **Nachklang für gescheitertes
ARP** (2 s): ohne ihn zahlt jede der vier Ping-Anfragen die vollen 2,4 s Geduld,
und ein Ping auf eine Adresse, die es nicht gibt, dauert bei Tempo 0,1
anderthalb Minuten.

## Drei Zahlen, die absichtlich unrealistisch sind

**Kabellaufzeit 100 ms.** Ein echtes LAN-Kabel braucht Mikrosekunden. Das wäre
unsichtbar — und dass Leitungen dauern, ist die Kernaussage der Schicht 1.
Filius trifft dieselbe Entscheidung, nur kleiner (mindestens 5 ms). Warum nicht
10 ms wie anfangs hier: der Bildschirm zeichnet alle 16 ms ein Bild, ein
10-ms-Kabel ist kürzer als ein Bild. Bei 100 ms sind es sechs Bilder je Kabel,
und daraus wird eine Bewegung, der man folgen kann. Je Kabel einstellbar
(10–600 ms), damit sich eine langsame Strecke zeigen lässt.

**Flugzeit = Laufzeit ÷ Tempo, ohne Mindestwert.** Hier stand einmal ein
Mindestwert von 250 ms je Punkt. Der war der Grund, warum auf dem Bildschirm
alle Kabel gleichzeitig leuchteten: das Paket war nach 10 ms längst zwei Geräte
weiter, während der erste Punkt noch flog. Jetzt ist ein Paket zu jedem
Zeitpunkt auf genau einem Kabel — so wie in der Simulation auch. Eine Prüfung
im Browser wacht darüber (*nie mehr als ein Kabel gleichzeitig*).

**Ping-Takt 0,2 s.** Beim echten `ping` ist es eine Sekunde. Bei Tempo 0,1 wären
das zehn echte Sekunden Pause zwischen zwei Zeilen und vierzig Sekunden für
einen Ping, der gelingt. 0,2 s sind zwei echte Sekunden: getrennt genug, um die
vier Anfragen zu zählen und zu sehen, dass die erste länger dauert (ARP!), kurz
genug, um dabei zu bleiben. Nach einem Fehlschlag gibt es gar keine Pause — vier
Fehlschläge hintereinander sagen nicht mehr als einer.

**Und eine vierte, die man beim Dateiimport im Kopf haben muss:** eine große
Datei geht als **EIN TCP-Segment in EINEM IP-Paket** über die Leitung. Es gibt
hier bewusst keine MSS und keine Fragmentierung (siehe den Kopf von
`schichten.js`) — ein hochgeladenes Bild von 2 MB ist über HTTP also ein
einziger fliegender Punkt, so lang wie ein Ping. Das ist kein Grund, das
Hochladen zu lassen, aber es ist eine Stelle, an der die Simulation vom echten
Netz abweicht, ohne es zu sagen. Wer einmal Fragmentierung baut, hat hier
seinen Anlass.

**Und deshalb ist die Laufzeit eines Kabels keine Datenrate.** Die Frage kam
vom Nutzer („kann ich damit Glasfaser vs Kupfer darstellen?"), und die Antwort
ist nein: der Regler verzögert, er überträgt nicht. Glasfaser und Kupfer
unterscheiden sich in der Bandbreite, und eine Bandbreite kann erst etwas
zeigen, wenn eine große Datei aus VIELEN Rahmen besteht — also genau dann, wenn
es MSS und Fragmentierung gibt. Was die Laufzeit zeigt, ist die Entfernung:
Kabel im Raum gegen Leitung über Land. Der Hilfetext am Kabel sagt das seit dem
2026-09-28 selbst.

## Die Firewall

*(seit 2026-10-02 · `js/firewall.js`, Prüfstände `tests/kerntest.js` Abschnitte
„Firewall" und „Firewall: Namen" sowie `tests/fwuitest.js`)*

Eine Firewall entscheidet bei jedem Paket, das ein Gerät **weiterleitet**:
durchlassen oder nicht. Mehr ist sie nicht, und genau das ist der Unterricht —
„Geoblocking" ist nichts anderes als eine Liste von Adressbereichen, die jemand
einem Land zugeordnet hat.

| | |
|---|---|
| **Wo** | **Router, Heimrouter, cww** — die drei Geräte, die Wege vermitteln. Der Switch sieht keine IP-Adressen, der Rechner ist ein Ziel und kein Weg. Vom Nutzer so gesetzt („das nur bei Routern bauen"). |
| **Einstellen** | Im Entwurf, im Reiter *Allgemein* ganz unten: der Knopf **Firewall**. Er zeigt, ob sie läuft (grün, pulsierender Punkt · „läuft · Blacklist · 3 Einträge") oder nicht (grau · „läuft nicht"). Dahinter eine Seite wie beim DHCP-Server, mit **Zurück**: oben der Haken *Firewall aktivieren*, dann der **Listentyp**, dann die Liste. Nur in der großen Ansicht. |
| **Auf der Fläche** | Ein laufendes Gerät trägt **unten links** ein farbiges Zeichen (Ziegelmauer mit Flamme, nach dem Vorbild des Nutzers). Es steht **nur**, wenn sie läuft — ausgeschaltet bleibt die Liste stehen, das Zeichen verschwindet. Es ist keine Pille unter der Kachel: die Pillen sagen, was ein Gerät **tut** (Server-Dienste); die Firewall sagt, was auf dem **Weg** geschieht. Ist das Gerät aus, rückt das Zeichen neben das Aus-Zeichen; beim Heimrouter weicht es einem WAN/LAN-Schildchen in die nächste freie Ecke aus (`fwPlatz` in `flaeche.js`). |
| **Aktionsmodus** | Die Kompaktansicht (nur lesen, wie alles dort) zeigt einen Block *Firewall*: läuft/läuft nicht, Listentyp, Art des Sperrens, die Liste mit ihrer Wirkung und **Treffern je Zeile**, dazu Zähler (durchgelassen · verworfen · abgelehnt), die beim Laufen mitzählen. |

### Eine Liste, ein Typ

Es gibt **eine** Liste und einen Schalter, was sie bedeutet — beides in einer
Liste zu mischen ergäbe keinen Sinn:

* **Blacklist** — was auf der Liste steht, wird **gesperrt**; alles andere kommt durch.
* **Whitelist** — **nur** was auf der Liste steht, kommt durch; alles andere wird gesperrt.

Die Liste bleibt beim Umschalten stehen, nur ihre Bedeutung wechselt (und die
Überschrift: *Gesperrt* / *Erlaubt*). Eine leere Blacklist sperrt nichts, eine leere
Whitelist alles — das steht im Fenster.

Eine Zeile trifft ein Paket, wenn ihre Adresse der **Absender oder das Ziel** ist
(„alles von und zu diesem Bereich"). Damit gilt sie in beide Richtungen; ein „rein"
oder „raus" gibt es nicht, und weil die **Antwort** auf ein erlaubtes Paket dieselbe
Adresse trägt, braucht es auch kein „Verbindungen merken". Die Schnittstelle, das
Protokoll und der Port spielen **keine** Rolle — vom Nutzer gestrichen („die
Firewall soll einfach alles blockieren"). Damit entfallen auch Ausnahmen innerhalb
einer Liste und die Reihenfolge („erste passende gewinnt").

### Was eine Zeile sein kann

| Eingabe | Bedeutung |
|---|---|
| **Adresse + Netzmaske** (`192.0.0.0` · `255.0.0.0`) | der ganze Bereich — hier alles von 192.0.0.0 bis 192.255.255.255 |
| **Adresse allein** (`192.168.2.1`) | **genau dieses Gerät** |
| **ein Name** (`www.beispiel.de`) | wird in eine Adresse aufgelöst, gesperrt wird DIESE |

⚠️ Eine Adresse ohne Maske ist **ein Gerät**, nicht „das Netz, in dem sie liegt". Aus
`192.0.0.0` das Netz 192.x.x.x zu erraten wäre Magie, und gerade die Zahlen mit den
Nullen sind die, bei denen die Maske vergessen wird. Deshalb steht **unter jeder
Zeile, was daraus folgt**: *„von 192.0.0.0 bis 192.255.255.255 · 16.777.216 Adressen"*
oder *„genau dieses Gerät"*. Die Maske darf auch als Präfix kommen (`8`, `/8`). Eine
leere Adresse ist **nicht** „beliebig", sondern *unfertig* — wie eine krumme Angabe
(rotes Feld, ein Satz): die Zeile tut dann nichts, behält aber ihre Nummer.

**Namen** — eine Firewall sieht nur Adressen. Der Router löst den Namen mit seinem
eigenen DNS auf (das cww fragt 8.8.8.8), sobald die **Uhr läuft** und die Firewall an
ist, und danach alle 60 s Simulationszeit neu. Das ist die Aussage dahinter: ändert
der Name seine Adresse, greift die Sperre erst bei der nächsten Auflösung; teilen sich
zwei Namen eine Adresse, ist der zweite mit gesperrt; ist der Name nicht aufzulösen,
tut die Zeile nichts — und das Fenster sagt es mit Grund. Unter der Zeile steht live
*noch nicht aufgelöst (die Uhr läuft nicht)* → *wird aufgelöst …* → *→ 84.12.5.1*.

### Wie gesperrt wird

Eine Einstellung der ganzen Firewall (nicht der Zeile):

* **still verwerfen** — das Paket verschwindet, der Absender wartet bis zur Zeitüberschreitung (wie DROP);
* **ablehnen** — es verschwindet, und der Absender bekommt **sofort** „Verboten — die Firewall von 192.168.1.1 lässt das nicht durch" (ICMP Typ 3, Code 13; wie REJECT).

### Wo sie im Paketweg sitzt

`schichten.js`, `onIp`, **eine** Stelle: nach der Wegewahl, **vor NAT**.
Das hat eine Folge, die man im Unterricht gern vergisst: beim Hinausgehen sehen
die Regeln noch die **private** Adresse (192.168.1.37), beim Hereinkommen hat NAT
die Antwort schon zurückübersetzt. ⚠️ **Pakete an das Gerät selbst und Pakete, die
es selbst losschickt, prüft die Firewall nicht** — sie schützt das Netz hinter dem
Gerät, nicht das Gerät. Das lässt sich mit einem zweiten Router dahinter zeigen
(und ist ein guter Auftrag).

### Im Mitschnitt

Ein gesperrtes Paket steht als **verlorene Zeile** da: *„— von der Firewall
verworfen: Zeile 2 (Blacklist)"* bzw. *„nicht auf der Whitelist"*, bei *ablehnen* mit
dem Zusatz „Absender wird benachrichtigt". Diese Zeilen zeigt auch die Voreinstellung
„nur raus" — sonst wäre es genau die eine, die verschwindet. Auf dem Router steht
dasselbe im Terminal.

### Länder

Echte GeoIP-Datenbanken gibt es nicht und braucht es nicht: die Welt in SYNIR ist
erfunden. „Länder" sind **benannte Adressbereiche im Szenario** (z. B. `10.1.0.0` ·
`255.255.0.0` = „Land A"); die Firewall kennt nur Bereiche. Das ist die Aussage —
Geoblocking ist eine IP-Liste. Ein Szenario, das Bereichen Namen gibt, ist ein
eigener nächster Schritt.

## Was noch fehlt

**Echo-Server und Einfacher Client** (das Paar, das „Port" erklärt),
**Gnutella**, **NS-Einträge im DNS**, das
**Sequenzdiagramm** des Datenaustauschs, der **Dokumentationsmodus** und der
Bildexport, pcap-Export. *(Das Modem gibt es seit dem 2026-09-28 — als Class
Wide Web, siehe unten.)*

*(Heimrouter, NAT und WLAN standen bis zum 2026-09-25 auf dieser Liste; TCP,
Dateisystem, Web, E-Mail bis zum 2026-09-26; **`traceroute`** und die
**Einfuhr echter Dateien** bis zum 2026-09-27; **Weiterleitung von Hand,
automatisches Routing und Portfreigaben** bis zum 2026-09-27. Alles gebaut.)*

Ein Punkt ist ausdrücklich vertagt: die **vier Standardbilder** in `/Bilder`
sind Platzhalter und sollen ersetzt werden („die können wir später noch
ändern"). Sie stehen als SVG in `SAMMLUNG` (`js/dateien.js`); wer sie
austauscht, behält die Schlüssel `@schule`, `@foto`, `@logo`, `@smiley` — an
ihnen hängen der Webserver-Ordner, die Szenarien und jeder gespeicherte Stand.

Es fehlen noch **Szenarien** zu den jüngsten Sachen: eines mit **Heimrouter**
(das Gerät kann alles dafür, es fehlt nur der Auftrag in `js/szenarien.js`) und
eines zum **Routing** — drei Netze, zwei Router, erst von Hand eintragen und
dann den Haken setzen. Genau in dieser Reihenfolge, denn das automatische
Routing beantwortet eine Frage, die man erst gestellt haben muss.

Das **Paar Echo-Server + Einfacher Client** ist der nächste inhaltliche Schritt.
⚠️ Dabei eine Entscheidung, die keine Nachbildung ist: In Filius sind **beide
fest TCP** (`ServerBaustein extends TCPServerAnwendung`, `ClientBaustein` baut
einen `TCPSocket`; im Javadoc steht ausdrücklich, für UDP müsse man die Methode
überschreiben — was nirgends passiert). **Es gibt dort also keine einzige
Anwendung, in der ein Kind UDP zu Gesicht bekommt.** Ein Schalter TCP/UDP in
diesem Paar wäre eine **Zutat** — und die lohnendste, die offen ist: derselbe
Auftrag sind über UDP zwei Zeilen im Mitschnitt und über TCP zehn Segmente, und
mit Kabelverlust holt TCP es nach und UDP nicht.

## Offene Ecken in der Oberfläche

* Ein **Switch schrumpft nicht wieder**. Er lässt mit jedem Kabel eine Buchse
  nachwachsen, aber wenn die Kabel weg sind, bleiben die leeren Buchsen stehen.
  Das ist Absicht — Anschlüsse abzubauen verschiebt Nummern, an denen Kabel
  hängen —, sieht aber an einem Gerät, an dem einmal zwanzig Kabel steckten,
  nach einer Unordnung aus, die niemand aufräumen kann.
* Das Gerätefenster wird eng, wenn gleichzeitig der Mitschnitt offen ist. Es
  lässt sich am Kopf verschieben, aber eine bessere Lösung wäre, es bei wenig
  Platz an den Rand zu docken statt über die Fläche zu legen.
* ~~Die Geräte sind für einen Beamer aus zehn Metern zu klein, und es gibt kein
  „alles einpassen".~~ **Erledigt.** Das Feld lässt sich zoomen (bis 250 %) und
  verschieben, und *Einpassen* holt alle Geräte ins Bild. Damit ist auch die
  zweite Hälfte des Problems weg: bisher machte jedes Gerät, das dazukam, alle
  anderen kleiner, weil die ganze Fläche immer hineinpassen musste.
* Bei **offenem Mitschnitt UND offener Weiterleitungstabelle** bleibt von der
  Fläche wenig übrig — beide sind Gitterzeilen und nehmen zusammen gut die
  Hälfte der Höhe. Auf einem Tablet hochkant ist das eine zu viel.
* Bei offener Subnetzliste bricht die Überschrift des Auftrags auf drei Zeilen
  um (die Karte wird dann auf 258 px schmal). Lesbar, aber unschön.
* Die Subnetzringe sind auf vier je Gerät ausgelegt. Ein Router mit acht
  Schnittstellen in acht Netzen bekäme vier Ringe und für den Rest nichts —
  ein Fall, den es im Unterricht nicht gibt, der aber nirgends gemeldet wird.
* Ein **Rechteck lässt sich nicht dort beginnen, wo ein Fenster liegt** — auf
  der Auftragskarte, der Subnetzliste oder einem Kärtchen fängt der Zeigerdruck
  im Fenster an und nicht auf der Fläche. Man setzt dann eine Handbreit daneben
  an. Dasselbe gilt seit jeher fürs Verschieben des Ausschnitts.
* **Mehr als drei Kärtchen** passen bei 1500 px nebeneinander nicht mehr ohne
  Überlappung; ab dem vierten legen sie sich aufeinander. Jedes lässt sich am
  Kopf packen und hinlegen — aber „vier Geräte vergleichen" ist damit
  Handarbeit. Auf einem Tablet hochkant sind es schon zwei.
* Die **Liste der Subnetze hebt nur EIN Gerät hervor**, auch wenn mehrere
  markiert sind. Die Fläche färbt dagegen alle Netze der ganzen Auswahl.
