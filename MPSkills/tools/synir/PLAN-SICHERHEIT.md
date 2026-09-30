# Plan „Sicherheit im Netz" — Werkzeuge in SYNIR

Stand 2026-09-30. Entstanden in einem Gespräch über „Was kann man mit dem CWW noch
anstellen?". **Erst `LIESMICH.md` lesen, dann das hier.** Arbeitsweise: ein Schritt nach
dem anderen, zu jedem Schritt vorher gemeinsam besprechen (Abschnitt „Zu klären"),
dann bauen, dann hier abhaken. **Nicht drei Schritte vorausdenken.**

## Vorgaben des Nutzers

* **Es geht nur um die Werkzeuge, nicht um Schüler-Szenarien.** Keine Aufgaben, keine
  Unterrichtsreihe bauen.
* Ziel: *Sicherheit im Netz* erlebbar machen, in dieser Reihenfolge der Aussagen:
  1. HTTP/E-Mail sind offen — wer an der Leitung sitzt, liest alles mit.
  2. HTTPS — der Inhalt ist weg, **wer mit wem** spricht, bleibt sichtbar.
  3. VPN — der Umweg: der Router sieht das Ziel nicht mehr, nur noch den VPN-Server.
* **Jeder liest nur den Verkehr seines eigenen CWW-Anschlusses** (Mitschnitt, Gerät
  antippen). Kein Mitschneiden fremder Verbindungen, **keine Serveränderung, keine
  Rechtefrage.** Mitlesen zwischen Schülern ergibt sich von selbst: wer einen Server
  betreibt, sieht im eigenen Mitschnitt, was bei ihm ankommt (auch Zugangsdaten der
  anderen).
* Bleibt bei Filius als Bedienmodell (Wortlaut, wenig Text, i-Buttons statt Erklärsätzen,
  keine modalen Dialoge, Entwurf/Aktion-Trennung).

## Was schon da ist (geprüft)

* Der **Mitschnitt** zeichnet alle Rahmen aller Geräte auf, auch die **Internet-Karte
  des CWW** (`js/mitschnitt.js:97-111`, Ereignisse `inet-raus` / `inet-rein`, Anzeige als
  „Wolke"). Gerät antippen schränkt auf dieses Gerät ein.
* Ein Paket ist eine verschachtelte Zwiebel (Ethernet → IP → TCP/UDP → `data` als
  **Klartext-String**). HTTP, SMTP und POP3 stehen schon im Klartext im Mitschnitt
  (`js/mitschnitt.js:340-420`, `:553-590`). E-Mail: `USER anna`, **`PASS geheim`**, `RETR 1`.
* **E-Mail läuft auf SMTP (25) und POP3 (110), nicht auf HTTP.**
* `js/http.js`: HTTP/1.0, eine Verbindung je Anfrage, **kein POST, keine Formulare, keine
  Cookies** (bewusst, siehe Kopfkommentar). Der Browser (`js/prog-web.js`) zeigt die Seite
  in `<iframe sandbox>` **ohne** `allow-scripts`.
* CWW: jedes Paket zwischen Tablets läuft durch `synir_cww_tausch_intern`
  (`supabase/migrations/0181_synir_cww.sql`). Das **CWW ist ein einziger Sprung** —
  es gibt keine sichtbare Router-Kette dazwischen.
* Namen im 8.8.8.8-Verzeichnis gehören dem, der sie zuerst anmeldet; A-Einträge müssen ins
  eigene /8 zeigen (Server prüft). Mögliche Grundlage einer „globalen
  Zertifizierungsstelle" in Schritt 4.
* Switch: lernende MAC-Tabelle, Fluten bei unbekanntem Ziel. **WLAN** ist heute
  **keine geteilte Funkstrecke**: jedes WLAN-Gerät hat eine eigene virtuelle Verbindung
  zum Zugangspunkt. ⚠️ Die WLAN-Zustellung in `schichten.js`/`netz.js` ist **noch nicht
  gelesen** — vor Schritt 3 prüfen.

## Die Schritte

| # | Schritt | Abhängig von | Größe | Status |
|---|---|---|---|---|
| 1 | **Fund-Filter im Mitschnitt** (erst für E-Mail) | nichts | klein | ☐ |
| 2 | **Web-Anwendung mit Anmeldung** | nichts (macht 1 und 4 lohnender) | mittel | ☐ |
| 3 | **WLAN-Lauschen** | nichts | klein bis mittel | ☐ |
| 4 | **HTTPS / TLS-Schale** (und Mail-Haken) | 2 | mittel | ☐ |
| 5 | **VPN** | 4 (Verschlüsselung), NAT | groß | ☐ |

Reihenfolge ist Empfehlung; jede Stufe ist einzeln nutzbar.

---

### Schritt 1 · Fund-Filter im Mitschnitt

**Ziel:** Zugangsdaten und andere sensible Felder im Mitschnitt finden und hervorheben.
Mit E-Mail geht es sofort, weil `PASS geheim` schon im Klartext durchläuft.

**Was gebaut würde (Vorschlag):**
* Erkennung im Mitschnitt für `PASS …` (POP3), `AUTH`/Base64-Zugang (SMTP, falls vorhanden),
  später `Authorization: Basic …`, `password=…`, `Cookie:`/`Set-Cookie:` (aus Schritt 2).
* Ein Chip **Zugangsdaten** in der Leiste, der nur diese Zeilen zeigt.
* Aufgeklappt eine Schale mit *Benutzer: anna · Passwort: geheim* (bei Base64 mit
  Dekodierung und dem Satz, dass Base64 **keine** Verschlüsselung ist).
* Das **CWW-Gerät** im Mitschnitt leichter auffindbar machen („Ausgang ins Internet —
  alles, was dein Netz verlässt").

**Zu klären, bevor es losgeht:**
* Wie stark soll die Hervorhebung sein (Pille, Zeilenfarbe, eigenes Symbol)? Farbe heißt auf
  der Fläche „Netz" — **keine neue Farbe für Netze belegen**.
* Schlägt der Filter nur im Mitschnitt an, oder auch eine Marke am Gerät?
* Wortlaut: Filius hat dafür nichts; eigenen knappen Begriff wählen.

**Prüfen:** `tests/kerntest.js` (kopflos, Mail-Anmeldung über Kabel und über das CWW),
`tests/uitest.js` (Browser), Bild-Prüfung wie in UEBERGABE beschrieben.

---

### Schritt 2 · Web-Anwendung mit Anmeldung

**Ziel:** Ein Serverprogramm mit Konten und etwas Privatem dahinter (Notizen, Zwitscher-
Beiträge), damit es im Mitschnitt etwas Geheimes gibt, das über HTTP läuft.

**Bausteine:**
* Neues Programm **„Web-Anwendung"** im Appstore (`PROGRAMME` in `js/geraet.js`), aufgespielt
  und gestartet wie der Mailserver; hat eine **Kontenliste** und eine kleine **Datenhaltung
  im Gerät** (die „Datenbank" steckt im Programm). Feste kleine Funktionen, **kein frei
  programmierbarer Serverkode**.
* `js/http.js`: **`POST` mit Körper**, `Set-Cookie` / `Cookie` für die Sitzung.
* Anmeldung im Browser — **das technische Kernproblem:** Die Sandbox ohne JavaScript kann
  Formulare nicht abfangen. **Idee (ungeprüft):** `sandbox` ohne `allow-same-origin`
  beibehalten und zusätzlich eine **CSP mit Einmalschlüssel (nonce)** in das `srcdoc`
  setzen. Dann läuft nur das eigene kleine Brückenskript (fängt `submit` ab, `postMessage`
  an den Simulator), Schülerskripte sind vom Browser selbst gesperrt. Muss vorher in
  Chromium **ausprobiert** werden. Alternative: Anmeldefenster des Browsers (Basic Auth,
  `401` + `Authorization`-Kopf) — einfacher, weniger eindrucksvoll.
* Persistenz: Konten/Daten in `netz.toJSON()` oder nicht? (Dateiinhalte stehen bewusst
  nicht darin, wegen der Verlaufsgröße — hier bewusst entscheiden.)

**Zu klären:**
* Anmeldung per Formular (CSP-Weg) oder Basic Auth?
* Was kann die Anwendung? (Notizen privat · Zwitscher: alle posten, jeder liest ·
  beides?) Name des Programms.
* Kontenanlage: Selbstregistrierung auf der Seite oder nur durch den Betreiber im Fenster?
* Sitzung per Cookie: im Mitschnitt sichtbar machen (Cookie-Diebstahl = Schritt 1).

**Achtung beim Bauen:** Kennungen in Programmfenstern sind **eindeutig** (siehe
UEBERGABE, Abschnitt 0ab — kopflose Prüfung „Kennungen in den Programmfenstern", neue
Fensterdatei dort eintragen). Die Prüfung mit dem Browser tippt wie ein Kind
(`page.keyboard`, nicht `fill()`).

---

### Schritt 3 · WLAN-Lauschen

**Ziel:** Sichtbar machen, dass **Funk ein Rundruf ist** und ein Switch nicht: im selben
WLAN empfängt ein mithörendes Gerät auch Rahmen, die nicht an es gerichtet sind.

**Vorher prüfen:** wie WLAN-Verbindungen zugestellt werden (heute vermutlich je Gerät
eine eigene virtuelle Strecke zum Zugangspunkt, ohne Mithören).

**Idee:** Rahmen über Funk werden an **alle** im selben Funknetz zugestellt; Geräte
verwerfen fremde, **ein Gerät im Mithör-Modus** nicht. Im Mitschnitt des Geräts stehen
sie dann; das Gegenstück ist der Switch, an dem der Nachbar nichts bekommt (außer dem
Fluten bei unbekanntem Ziel).

**Zu klären:** Wie schaltet man das Mithören ein (Haken am Endgerät? nur im Entwurf?),
wie sieht es im Mitschnitt aus (Marke „nicht für mich"), und wie bleibt die Bedeutung von
„gestrichelt = Funk" erhalten.

---

### Schritt 4 · HTTPS / TLS-Schale

**Ziel:** Zeigen, dass HTTPS den Inhalt verbirgt, nicht aber **wer mit wem** spricht (und
den Servernamen). Danach liest der Fund-Filter aus Schritt 1 nichts mehr.

**Bausteine (Vorschlag):**
* Browser: Vorsatz `http://` / `https://`, Port **443**. Webserver: Haken „HTTPS".
* **TLS-Schale** zwischen TCP und HTTP: ClientHello (mit Servername), ServerHello mit
  Zertifikat, Schlüsseltausch, danach nur noch `🔒 verschlüsselt, N Byte`.
* Verschlüsselt wird **beim absendenden Gerät**, bevor das Paket ins CWW geht — im Mitschnitt
  und im CWW steht nur Salat. Klartext nur an den beiden Enden (aufgeklappt, „entschlüsselt
  — nur hier sichtbar").
* **Keine echte Kryptographie:** deterministisches Durcheinanderwürfeln mit einem beim
  Handschlag vereinbarten Schlüssel (wiederholbar). **Die Verschlüsselungsfunktion als
  gemeinsame Hilfe bauen — Schritt 5 (VPN) braucht sie wieder.**
* Gleiche Schicht für Mail: Haken **„Verschlüsselte Verbindung (SSL/TLS)"** im Mail-Konto
  (SMTPS 465, POP3S 995).
* **Zertifikate:** erst ein Haken am Server; danach Zertifizierungsstelle als Programm +
  **Vertrauensliste** im Browser, Warnungen (Name passt nicht / nicht unterschrieben).
  Lokale Stelle (Programm auf einem Gerät) oder „globale" (8.8.8.8: Zertifikat nur für
  Namen, die dem /8 gehören) — **noch offen.**

**Zu klären:** nur Browser oder gleich Mail; Stufe mit Zertifizierungsstelle jetzt oder
später; wie zeigt der Mitschnitt „das Schloss" (Pille, Schale).

---

### Schritt 5 · VPN

**Ziel:** Der Umweg: Router/Anbieter sehen nicht mehr das Ziel, nur noch *Laptop →
VPN-Server*. Das Vertrauen verlagert sich auf den VPN-Server, der alles sieht.

**Bausteine:**
* Programm **VPN-Server** (auf einem Gerät mit öffentlicher Adresse) und **VPN-Client**
  (Haken am Endgerät); der Client bekommt eine **Tunnel-Netzwerkkarte** mit eigener
  Adresse (z. B. `10.8.0.x`).
* Jedes Paket wird in ein neues verpackt, **verschlüsselt** (Hilfe aus Schritt 4) und an
  den VPN-Server geschickt; der packt aus, tauscht den Absender (NAT) und leitet weiter.
* `js/schichten.js`: `routeFor` kennt eine virtuelle Karte; Ein-/Auspacken; der Server
  leitet mit Quell-NAT weiter (`js/nat.js` ansehen).
* Im Mitschnitt: außen nur Laptop → VPN-Server (Tunnelschale), aufgeklappt das innere
  Paket; am VPN-Server sieht man das Ziel.

**Zu klären:** Protokoll/Port des Tunnels, wie viel vom inneren Paket der Mitschnitt
außen verraten darf, DNS durch den Tunnel, Fristen bei `FERN_FAKTOR` (Abschnitt *Das
Class Wide Web* in der LIESMICH).

---

## Regeln fürs Weiterarbeiten

* Pro Schritt: besprechen → bauen → **beide Prüfstände** (`node tests/kerntest.js`,
  `node tests/uitest.js`) → ein **Bild** ansehen, nicht nur Prüfungen → hier abhaken →
  Eintrag oben in `UEBERGABE.md` (Format wie die bisherigen Abschnitte).
* Neue Wörter auf der Oberfläche sparsam; Erklärungen hinter i-Buttons.
* Dieser Plan ist **kein Auftrag für alle fünf Schritte**, sondern eine Landkarte.
