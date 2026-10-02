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
| 1 | **Fund-Filter im Mitschnitt** (erst für E-Mail) | nichts | klein | ☑ 2026-09-30 |
| 2 | **Web-Anwendung mit Anmeldung** | nichts (macht 1 und 4 lohnender) | mittel | ☑ 2026-09-30 |
| 3 | **WLAN-Lauschen** (jetzt: **Mitlesende**) | nichts | mittel | ☑ 2026-10-01 |
| 4 | **HTTPS / TLS-Schale** (und Mail-Haken) | 2 | mittel | ☑ 2026-10-01 |
| 5 | **VPN** | 4 (Verschlüsselung), NAT | groß | ☑ 2026-10-01 |

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

**Umgesetzt (2026-09-30), so entschieden:**
* **Hervorhebung:** Pille **🔑 Zugangsdaten** vor dem Text der Zeile (Klasse `.tr-z`, Farbe `--warn`,
  keine Netzfarbe) und eine eigene Schale *Zugangsdaten* (Verfahren · Benutzer · Passwort) beim
  Aufklappen; der Satz dazu steht im Kurzhinweis (`title`) am **i** der Schale.
* **Nur im Mitschnitt**, keine Marke am Gerät.
* **Wortlaut:** *Zugangsdaten*. Chip in der Leiste (`data-proto="ZUGANG"`, läuft durch den
  Protokollfilter `filter.proto`).
* **CWW:** Zeilen der Internet-Karte tragen die Pille **☁ Internet** (Kurzhinweis: *Ausgang ins
  Internet — alles, was dein Netz verlässt*) und in der Ethernet-Schale die Zeile *Ort*.
* Erkennung: `zugangVon()` in `js/mitschnitt.js` — heute nur POP3 `PASS`; der Benutzer wird aus
  dem `USER`-Segment davor derselben Verbindung geholt. SMTP kennt kein AUTH. Neue Verfahren
  (Basic, Formular, Cookie) kommen in Schritt 2 **an derselben Stelle** dazu.
* Nicht gebaut: Base64-Dekodierung (es gibt noch kein Base64-Verfahren).

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

**Entschieden (2026-09-30):**
* **Anmeldung per Formular (CSP-Weg), Test bestanden** (Chromium, Probeseite im Scratchpad):
  `<iframe sandbox="allow-scripts allow-forms">` (**ohne** `allow-same-origin`) + im `srcdoc`
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';
  img-src data:; script-src 'nonce-…'">` + ein Brückenskript mit demselben Nonce. Schülerskripte,
  `onerror`/`onclick`, `javascript:` und erfundener Nonce laufen **nicht**; nur die Brücke läuft, fängt
  `submit` (auch per Enter) und Linkklicks ab und meldet per `postMessage` an den Simulator.
  ⚠️ `allow-forms` ist nötig, sonst blockt Chromium das Absenden schon **vor** dem `submit`-Ereignis.
  Der Simulator nimmt Nachrichten nur von `iframe.contentWindow` mit dem passenden Nonce an und
  lehnt `javascript:`-Ziele ab.
* **Programm „Streaming-Server"** (Netflix-/Spotify-artig). Der Betreiber vergibt im Serverfenster
  einen **Dienstnamen** (steht als Kopfzeile im Browser) und wählt aus **4 Filmen genau 2**, die
  angezeigt werden (Plakate = PNG vom Nutzer, Titel reicht er nach).
* **Seiten:** Landing mit Anmelden/Registrieren → nach Anmeldung die Filmseite (Kacheln, Like,
  Kommentar; alle Angemeldeten sehen alles) → **„Mein Konto"** mit den gespeicherten Bankdaten.
  Ohne Anmeldung kommt man an die Filmseite nicht heran.
* **Registrierung im Browser:** Name, E-Mail, **Bankdaten (ausgedacht)**. Das **Passwort kommt per
  Mail** (`smtpSenden` in `js/mail.js`), abgeholt per POP3. Anmeldung und Registrierung laufen
  im Klartext über HTTP — genau das, was Schritt 4 (HTTPS) später schließt.
* **Fund-Filter** (Schritt 1) wird um Formularfelder (`passwort=`, `iban=` …) erweitert.

**Umgesetzt (2026-09-30):** Programm **Streaming-Server** (`js/stream.js`, Fenster `bauStream` in
`js/prog-web.js`, Kennung `streamingserver`, Dienst `stream`, Marke „Stream"). Port 80 teilt er sich
mit dem Webserver: nur einer läuft (Streaming-Server hat Vorrang; beide Fenster sperren „Starten",
`dienste.sync` sichert im Netz). Seiten: `/`, `/anmelden`, `/registrieren`, `/filme`, `/konto`,
`/plakat/N.svg`; POST auf `/anmelden`, `/registrieren`, `/like`, `/kommentar`, `/abmelden`.
Sitzung per Cookie `sid` (Laufzeit, nicht im Speicherformat); Konten/Likes/Kommentare/Filmwahl/
Dienstname/Mailserver im Speicherformat (`node.streamServer`, `netz.streamConf`).
Der Browser (`js/http.js`, `js/prog-web.js`) kann jetzt `POST`, Cookies (Laufzeit, je Gerät und
Server), Weiterleitungen (301/302/303, höchstens 4) und Links im Rahmen.
* **Noch Platzhalter:** Titel „Film 1–4" und Verlaufs-Plakate (`FILME` in `js/stream.js`; ein Eintrag
  bekommt ein PNG über `bild: 'data:image/png;base64,…'`). Die echten Plakate und Titel reicht der
  Nutzer nach.
* Registrierung ohne Mailserver oder mit abgelehnter Mail: Seite sagt warum (500), kein Konto.
* **Fund-Filter** erweitert (`httpZugang` in `js/mitschnitt.js`): `passwort=`, `iban=`/`bic=`/`karte=`/
  `pin=`, `Cookie:` und `Set-Cookie:` — Schale zeigt die Felder (`z.felder`).
* Nicht gebaut: Base64, Konto ändern/löschen, eigene Filme.

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


**Entschieden und umgesetzt (2026-10-01), Gespräch mit dem Nutzer — ersetzt die „Idee" oben:**

* **Mithören ist immer an**, kein Schalter am Gerät. Auch am Heimrouter-WLAN.
* **Funk ist ein gemeinsames Medium, keine virtuelle Buchse je Gast.** Der Zugangspunkt hat eine Antenne; alles,
  was gesendet wird, empfangen alle in der Zelle (`netz.funkSenden`). Die Karte verwirft Fremdes erst danach.
* **Ein Chip „Mitlesende" ersetzt den Fund-Filter** (🔑 Zugangsdaten entfällt als Chip). Zwei Wege, ein Gedanke:
  **📡 Funk** (Rundruf) und **↔ Unterwegs** (Router, Heimrouter-Routing, cww). Der **Switch zählt nicht** — er
  schaut nur auf die MAC. Der Chip zeigt nur Pakete **mit Inhalt**. Was ein Mitleser sieht, ist im Klartext
  lesbar, bei HTTPS sieht er nur Salat (🔒).
* **Anzeige:** Pille `👁 📡 Funk` bzw. `👁 ↔ Unterwegs` in der Zeile, `🔓 Zugangsdaten` bei Klartext-Zugang,
  aufgeklappt Schale *Mitlesende* (wer dasselbe Paket gesehen hat). Auch die Zeile des Absenders nennt seine Mitleser.
* **Prüfen:** `tests/kerntest.js` (*Mitlesende: Funk ist ein Rundruf*, Mitlesende im Abschnitt *Router*, *WLAN*).
* **Nicht gebaut:** Mithör-Schalter, Feldstärke/Reichweite, WLAN-Verschlüsselung (WPA).

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

**Entschieden (2026-10-01), Gespräch mit dem Nutzer — das ersetzt die „Bausteine (Vorschlag)" oben:**

* **HTTP bleibt der Standard.** HTTPS bekommt ein Server erst, wenn ihm eine
  **Zertifizierungsstelle (ZS)** ein Zertifikat ausgestellt hat. Vorher ist der Haken „HTTPS" im
  Serverfenster ausgegraut („Zertifikat fehlt"). Das gilt für **Webserver, Streaming-Server und
  E-Mail-Server** (Mail: SMTPS 465, POP3S 995, im Mail-Konto der Haken „Verschlüsselte Verbindung").
  Ist HTTPS an, laufen **beide** Ports (80 und 443) — HTTP geht weiter, damit man es vergleichen kann.
* **Die ZS ist ein Programm** (Appstore, Kennung `zertstelle`), das auf **jedem** Gerät laufen kann
  (lokal im Schulnetz, im Internet-Bereich, auf dem Tablet des Nachbarn). Es gibt **keine
  fest eingebaute globale ZS.** Die ZS hat einen **Namen**, ein **Schlüsselpaar** und eine Einstellung
  **„DNS-Server für die Prüfung"** (die ZS sucht sich den DNS aus, dem sie glaubt).
* **Antrag (wie bei ACME / HTTP-01):** Der Betreiber trägt im Serverfenster den **Namen** (vorbelegt,
  wenn ein DNS im Netz auf dieses Gerät zeigt) und die **Adresse der ZS** ein (vorbelegt, wenn genau
  eine ZS im Netz läuft). Die ZS fragt **ihren DNS** nach dem Namen, bekommt eine IP, **besucht diese
  IP auf Port 80** (`/.well-known/zs-pruefung`) und prüft ein Einmalwort, das nur der echte Betreiber
  ausliefern kann. Beim Antrag lauscht das Gerät kurz selbst auf Port 80, falls kein Webserver dort
  hängt (wie `certbot --standalone`) — so geht es auch für den Mailserver.
  ⚠️ Hinter einem Heimrouter muss Port 80 weitergeleitet sein, sonst scheitert die Prüfung — und
  Port 443 für den Betrieb. Das ist gewollt (steht dann im Mitschnitt).
* **Freigabe mit Klick:** Der Antrag liegt bei der ZS als *„Name geprüft ✓ / ✗"*; erst der **Klick des
  ZS-Betreibers** („Freigeben" / „Ablehnen") stellt das Zertifikat aus. Der Antragsteller holt es mit
  **„Zertifikat abholen"** (wie Post bei POP3: es wird abgeholt, nicht zugestellt). Drei Zustände im
  Serverfenster: *kein Zertifikat · Antrag bei <ZS> wartet · Zertifikat gültig für <Name>*.
* **Ein Zertifikat gilt für einen Namen.** Wer `https://<IP>` tippt, bekommt die Warnung „Zertifikat
  gehört zu <Name>, nicht zu dieser Adresse".
* **Browser findet die ZS nicht — er KENNT sie.** Er hat eine **Vertrauensliste (am Anfang leer)**.
  Ein Eintrag entsteht, indem der Nutzer im Browser unter **„Zertifikate"** eine ZS-Adresse eingibt;
  der Browser holt deren ZS-Zertifikat und zeigt den **Fingerabdruck** (der steht auch im ZS-Fenster —
  vergleichen!) mit dem Knopf „Vertrauen". Die Liste gilt für das ganze Gerät (Browser **und**
  Mail-Programm). Ohne Eintrag: Warnung „Aussteller unbekannt".
* **Browser:** `http://` bleibt immer möglich. Die Adresszeile zeigt den Vorsatz: bei HTTP „Nicht
  sicher", bei gültigem HTTPS **🔒** (Tipp auf das Schloss: Zertifikat in Klartext, kein modaler
  Dialog). Bei Fehler: **Warnseite** (Name passt nicht · Aussteller unbekannt · Unterschrift ungültig ·
  Besitz nicht bewiesen · Gegenstelle spricht kein TLS) mit **„Zurück"** und dem kleinen
  **„Trotzdem fortfahren (unsicher)"**. Nach dem Fortfahren verschlüsselt die Verbindung trotzdem —
  aber vielleicht an den Falschen. Die Ausnahme gilt nur für dieses Gerät und diese Sitzung.
* **TLS-Ablauf (TLS-1.3-Form, vereinfacht):** `ClientHello` (Servername **im Klartext**, Zufall,
  Schlüsselanteil) → `ServerHello` (Zufall, Schlüsselanteil, **Zertifikat**, **Beweis** = Unterschrift
  über den Ablauf mit dem privaten Schlüssel) → ab da nur noch `🔒 verschlüsselt, N Byte`.
  Das Zertifikat bleibt der Anschaulichkeit halber offen (echtes TLS 1.3 verschlüsselt es).
* **Fachlich richtig, aber winzig:** Schlüsselaustausch **Diffie-Hellman** (p = 2³¹−1, ablesbar),
  Zertifikat und Beweis **RSA-Unterschrift** (≈ 60 Bit, `BigInt`), Datenstrom als Stromchiffre mit
  Prüfsumme. Alles **Spielzeug** (echt: 2048 Bit, SHA-256, AES-GCM) — es geht um die Struktur, nicht um
  Sicherheit; das steht im Kopf von `js/tls.js`. Zufall nur aus `engine.randInt` (wiederholbar).
  Die Funktion zum Ver- und Entschlüsseln ist eine gemeinsame Hilfe — **Schritt 5 (VPN) benutzt sie.**
* **Mitschnitt:** Chip **TLS** (Port 443/465/995), Pille **🔒**, Schale *TLS* (Handschlag mit
  Servername und Zertifikat bzw. `verschlüsselt, N Byte`). Der Fund-Filter findet bei HTTPS **nichts**
  mehr (die Lehre). Auch der ZS-Verkehr (Port 8200) steht lesbar im Mitschnitt.
* **Umgesetzt (2026-10-01):** `js/tls.js` (Schale + Rechenwerkzeuge `Tls.Krypto`), `js/zs.js`
  (Zertifizierungsstelle, Programm `zertstelle`, Port 8200), `js/prog-zert.js` (Oberfläche). Anpassungen in
  `http.js` (https://, 443, `holen` mit TLS und `opt.ip`, Ausnahmen, Prüfantwort), `stream.js`, `mail.js`
  (465/995, Konto-Haken `tls`), `dienste.js` (`resolve` mit eigenem DNS-Server), `netz.js` (`zsConf`,
  `zertConf`, `vertrauen`, Speicherformat), `mitschnitt.js` (Chip **TLS**/**ZS**, Schale, Ports),
  `prog-web.js` (Vorsatz-Knopf, Schloss, Info-Fläche, Warnseite, „Zertifikate"), `prog-mail.js`.
  **Wichtig beim Weiterbauen (für VPN):** `Tls.Krypto.versiegeln/oeffnen` sind zustandslos (Schlüssel,
  Richtung `c`/`s`, laufende Nummer); `sitzungsschluessel` + `dhAnteil/dhGeheim` für einen Tunnelaufbau.
* **Abweichungen vom Vorschlag oben, so entschieden beim Bauen:**
  — Der Browser holt das ZS-Zertifikat **direkt von der ZS** (`ZS-ZERTIFIKAT`) und zeigt den Fingerabdruck;
  es gibt keine Datei zum Herumtragen (es gibt keinen Weg, Dateien zwischen Geräten zu schicken).
  — Der Prüfbesuch läuft auf Port 80 **mit dem Einmalwort der ZS**; das Gerät lauscht dafür selbst, wenn dort
  kein Server hängt (auch für reine Mailserver).
  — Wer eine Zahlenadresse als Namen beantragt, wird abgewiesen: **kein Zertifikat für IPs.**
  — Unter einer Zahlenadresse sendet der Client **keinen Servernamen** (SNI) mit; geprüft wird trotzdem gegen
  die getippte Adresse (Warnung „name").
  — Eine **Ausnahme** („Trotzdem fortfahren") gilt je Name und Port, nur auf diesem Gerät, nur im laufenden
  Netz (`node.state.tlsAusnahmen`; „von vorn" löscht sie) und nur bei Zertifikatsfehlern — nicht bei
  `kein-tls`.
  — Die Passwort-Mails des Streaming-Servers und die Weitergabe zwischen Mailservern bleiben unverschlüsselt.
* **Prüfen:** `tests/kerntest.js` (Abschnitte *TLS: die Rechenwerkzeuge*, *HTTPS: Zertifizierungsstelle,
  Browser, Server*, *Anträge, die scheitern*, *Streaming-Server und E-Mail (TLS-Ports)*), `tests/uitest.js`
  (*HTTPS und Zertifizierungsstelle*); Bilder `tests/shot-zs.png`, `shot-https-*.png`.
* **Bewusst nicht gebaut:** Ablaufdatum und Widerruf von Zertifikaten, Zertifikatsketten
  (Zwischenstellen), STARTTLS, Umleitung 80 → 443, Sitzungswiederaufnahme (jede Verbindung macht den
  Handschlag neu — im Mitschnitt gut zu sehen), TLS zwischen Mailservern beim Weiterreichen, TLS für die
  Passwort-Mails des Streaming-Servers.

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


**Entschieden und umgesetzt (2026-10-01), Gespräch mit dem Nutzer — das ersetzt „Bausteine" und „Zu klären" oben:**

* **Zwei Programme** (Appstore): **VPN-Server** (`vpnserver`, Port **1194**, Konten, Zertifikat) und **VPN-Client**
  (`vpnclient`: Server · Benutzer · Passwort · Verbinden). Der Server **startet erst mit Zertifikat** von einer ZS
  (derselbe Kasten wie bei Web- und Mailserver, `ProgZert.abschnitt` mit `ohneHaken`). Der Client prüft es gegen die
  Vertrauensliste seines Geräts — mit denselben Warnungen und dem Knopf „Trotzdem verbinden (unsicher)"; Knopf
  „Zertifikate" öffnet die Vertrauensliste.
* ⭐ **Der Tunnel ist eine TLS-Verbindung (TCP 1194), kein eigenes Protokoll auf UDP** — so gibt es Zertifikat,
  Handschlag, Warnungen und `🔒 verschlüsselt` ohne zweite Implementierung (wie ein „SSL-VPN": OpenVPN über TCP,
  SSTP). Die Anmeldung (Konto, Passwort) läuft erst **nach** dem Handschlag, verschlüsselt. Innen sind es JSON-Sätze:
  `Anmelden` · `OK {ip, gateway}` · `Fehler` · `Paket {pkt}` (siehe Kopf von `js/vpn.js`).
* **Alles durch den Tunnel, auch DNS.** Ausgenommen nur das Gespräch mit dem VPN-Server selbst (sonst eine
  Schleife), die eigenen Adressen und `127.*`. Der Client bekommt vom Server eine **Tunnel-Adresse** (`10.8.0.x`;
  Server `10.8.0.1`), mit der er sendet. Der Haken im Netzstapel: `schichten.js` ⟨VPN⟩ in `sendIp` (Hinweg) und `onIp`
  (Rückweg), eingehängt von `dienste.js` über `stack.setVpn`.
* **Der Server tauscht den Absender (NAT, eigene kleine Tabelle, Außenports 40000–49000)** und schickt weiter; die
  Antwort wird vor „für mich?" erkannt und in den Tunnel gepackt. Für Webseiten ist der Absender der VPN-Server.
* ⭐ **Das Vertrauen wandert:** im Mitschnitt des **VPN-Servers** stehen die inneren Pakete im Klartext, mit den
  Pillen `◯ Tunnel` und `👁 ↔ Unterwegs` (er liest mit). Wer dazwischen sitzt (Router, Wolke), sieht nur
  `🔒 verschlüsselt` zwischen Client und Server — kein Ziel, keinen Inhalt, keinen Namen aus dem DNS.
* **Oberfläche:** Pille **◯ VPN aktiv** hinter dem Gerätenamen im Desktop; **Ring um jedes Tunnelpaket** auf den
  Kabeln (TCP von/zu Port 1194, Klasse `nf-ring`, Farbe `--vpn`; **kein Schloss**); am Server die Marke **VPN**
  unter der Kachel; im Mitschnitt Zeilen `◯ Tunnel` (inneres Paket am Client und am Server).
* **Das Schild (🛡) oben rechts ist in Browser, E-Mail-Programm und VPN-Client dasselbe** (`ProgZert.schildKnopf`):
  es öffnet die Vertrauensliste des Geräts; orange, solange sie leer ist, grün mit mindestens einer ZS. Die Server
  (Web, Streaming, Mail, VPN) nutzen alle denselben Kasten `ProgZert.abschnitt` — der VPN-Server ohne Haken, weil
  er ohne Zertifikat nicht startet.
* **Geht durch das CWW** (zwei Tablets: Tunnel zu Tablet B, Name und DNS über 8.8.8.8, dann Webseite aus B). In der
  Wolke von A stehen nur noch Pakete zu/von dem VPN-Server.
* **Prüfen:** `tests/kerntest.js` (*VPN: Tunnel, Anmeldung, Übersetzung*, *VPN: durch das Class Wide Web*);
  Bilder wurden mit einem Einmal-Skript geprüft (Fenster, Pille, Ring, Mitschnitt bei Server und Client).
* **Bewusst nicht gebaut:** mehrere Tunnel je Gerät, „nur dieses Netz durch den Tunnel", Wiederaufbau nach
  Abbruch, Ablauf von NAT-Zeilen, Ausnahmen für Dienste auf dem Client (wer Server im Heimnetz betreibt, während der
  Tunnel steht, wird nicht mehr erreicht — das ist ehrlich so), ICMP-Fehler aus dem Netz hinter dem Server werden
  nicht zurückübersetzt (wie bei `nat.js`).

---

## Regeln fürs Weiterarbeiten

* Pro Schritt: besprechen → bauen → **beide Prüfstände** (`node tests/kerntest.js`,
  `node tests/uitest.js`) → ein **Bild** ansehen, nicht nur Prüfungen → hier abhaken →
  Eintrag oben in `UEBERGABE.md` (Format wie die bisherigen Abschnitte).
* Neue Wörter auf der Oberfläche sparsam; Erklärungen hinter i-Buttons.
* Dieser Plan ist **kein Auftrag für alle fünf Schritte**, sondern eine Landkarte.
