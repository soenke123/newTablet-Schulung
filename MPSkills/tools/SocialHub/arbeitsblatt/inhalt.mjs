/* Inhalt des Skripts „Datenbanksysteme“ (YourSozialNet-Fassung)
   Bausteine: h1/h2/h3, p, list, img, syntax (Aufbau + Beispiel), code, compare,
   box (tipp | achtung | denk), table, task (mit Lösungen), page.
   Text: **fett**, *kursiv*, `Code`. */

const h1 = t => ({ t: 'h1', text: t });
const h2 = t => ({ t: 'h2', text: t });
const h3 = t => ({ t: 'h3', text: t });
const p = t => ({ t: 'p', text: t });
const list = (...items) => ({ t: 'list', items });
const img = (file, cm, caption) => ({ t: 'img', file, cm, caption });
const box = (kind, title, ...text) => ({ t: 'box', kind, title, text });
const page = () => ({ t: 'page' });
// Aufbau + Beispiel; result = Ergebnis aus den Dummy-Daten zeigen (Anzahl Zeilen)
const syntax = (title, aufbau, sql, result) => ({ t: 'syntax', title, aufbau, sql, result });
const code = (title, sql, result) => ({ t: 'code', title, sql, result });
const compare = (title, a, b) => ({ t: 'compare', title, a, b });
const table = (head, rows, widths) => ({ t: 'table', head, rows, widths });
const task = (n, intro, items, extra) => ({ t: 'task', n, intro, items, ...extra });
// Teilaufgabe: text, sol (SQL oder Liste), note (Hinweis für die Lehrkraft), star (Knobel)
const a = (text, sol, note, opt) => ({ text, sol, note, ...opt });

const NOTIERE = 'Notiere für die folgenden Abfragen einen SQL-Befehl. Deine Ausgabe sollte eine geeignete Auswahl an Attributen haben. Halte diesen digital oder analog fest!';
const AGE = 'FLOOR(DATEDIFF(NOW(), birthday) / 365)';

export const DOC = [
  { t: 'title' },

  /* ═══════════════════ I. Begriffe ═══════════════════ */
  h1('I. Begriffe rund um die Datenwelt'),
  h2('1. Grundbegriffe'),
  p('Eine Datenbank ist eine Sammlung von Daten, die von einem **Datenbankmanagementsystem (DBMS)** verwaltet wird. Der Ort, an dem die eigentlichen Daten gesammelt werden, wird als **Datenbank** bezeichnet. Eine solche Datenbank kann zum Beispiel aus einzelnen Tabellen bestehen. In welcher Form die Daten in der Datenbank abgelegt werden, muss auch definiert und beschrieben werden. Es handelt sich um die **Metadaten**. Die Metadaten sind also die Datenbank zur Datenbank.'),
  p('Auf die Datenbank selbst wird durch die Anwendungsprogramme zugegriffen. Das geschieht ausschließlich über das Datenbankmanagementsystem (DBMS). Das DBMS stellt die Schnittstelle zwischen den Anwendungsprogrammen und der Datenbank dar. Auf Seiten der Datenbank erfolgt der Zugriff über standardisierte Schnittstellen, zum Beispiel mit Hilfe der Abfragesprache **SQL** (**Structured Query Language**). Die Anwendungsprogramme senden ihrerseits ihre Anfragen an das DBMS, und diese werden dann an die Datenbank weitergeleitet. So entsteht eine maximale Entkopplung von Anwendungssoftware und Datenbank, d. h. man kann sowohl die Datenbank oder auch die Anwendungssoftware verändern, aktualisieren oder sogar austauschen. Das Gesamtsystem ist das **Datenbanksystem**.'),
  img('abb_dbms', 15.5, 'Abb. 1: Komponenten eines Datenbanksystems – am Beispiel von YourSozialNet'),
  p('Bei YourSozialNet ist das genauso: Die App (Feed, Profil, Posten) und der Adminbereich (SQL) sind zwei Anwendungsprogramme. Beide schicken ihre Anfragen an dasselbe DBMS – und landen in derselben Datenbank.'),

  page(),
  h2('2. Datenbanken mit mehreren Tabellen'),
  p('Relationale Datenbanken bestehen in der Regel nicht nur aus einer einzelnen Tabelle, sondern aus mehreren Tabellen. Oft werden bei einer SQL-Anfrage Daten gewünscht, die aus verschiedenen Tabellen stammen. Dazu müssen die Tabellen verknüpft werden. Solche Verknüpfungen nennt man **JOINS** (mehr dazu im Abschnitt II.2).'),
  p('Wie diese Tabellen zusammenhängen, stellen wir – wie in Java – in einem **Klassendiagramm** dar. So sieht es auch im Programm aus (YourSozialNet: Adminbereich → Diagramm):'),
  list(
    'Jede **Klasse** (Tabelle) ist ein Kasten. Oben steht ihr Name, darunter ihre **Attribute** (Spalten) mit Datentyp.',
    'Der **Primärschlüssel** ist unterstrichen und hat einen Schlüssel 🔑 davor.',
    'Ein **Fremdschlüssel** hat ein ↑ hinter dem Namen (und eine Kette davor). Er zeigt auf den Primärschlüssel einer anderen Klasse.',
    'Die **Linie** verbindet Fremdschlüssel und Primärschlüssel. An den Enden steht die **Kardinalität**: **1** auf der Seite des Primärschlüssels, **n** auf der Seite des Fremdschlüssels.'
  ),
  p('Als Beispiel dient in diesem Kapitel unsere Schule: Schüler gehen in eine Klasse und belegen mehrere Kurse.'),

  h3('2.1 Primärschlüssel (Primary Key)'),
  p('Da Zeilen sich stark ähneln können (zwei SchülerInnen könnten den gleichen Namen haben, in demselben Haus wohnen und in die gleiche Klasse gehen), gibt es Attribute, die ein Objekt eindeutig identifizieren sollen. Ohne einen solchen Primärschlüssel könnte der Datensatz einer Tabelle nicht eindeutig angesprochen werden. Der oder die Primärschlüssel einer Klasse werden im Klassendiagramm unterstrichen. Es gibt verschiedene Arten von Primärschlüsseln:'),
  list(
    '**Eindeutiger Primärschlüssel:** Es wird ein eindeutiges Attribut einer Tabelle als Schlüssel verwendet, *z. B. die Bezeichnung einer Klasse (es gibt genau eine 5b), E-Mail-Adressen bei Accounts oder die Personalausweisnummer.*',
    '**Zusammengesetzter Primärschlüssel:** Mehrere Attribute einer Tabelle werden kombiniert und als Schlüssel definiert, *z. B. Nachname, Ort und Geburtstag.* Hierbei muss sichergestellt werden, dass jede Kombination nur einmal vorhanden ist.',
    '**Künstlicher Primärschlüssel:** Gibt es in einer Tabelle keine eindeutigen Schlüssel, so kann man einen künstlichen Schlüssel definieren. Hierzu wird meist eine fortlaufende Nummer als ID verwendet.'
  ),

  page(),
  h3('2.2 Fremdschlüssel (Foreign Key)'),
  p('Ein Fremdschlüssel ist ein Attribut einer Tabelle, das auf einen Primärschlüssel einer anderen Tabelle verweist. Er dient dazu, Verbindungen zwischen verschiedenen Tabellen herstellen zu können. *Ein Schüler hat beispielsweise das Attribut „klasse“. Dies ist der Fremdschlüssel, der den Primärschlüssel der Tabelle klasse enthält.*'),

  h3('2.3 1-zu-n-Kardinalität'),
  p('Jedes Objekt einer Klasse steht mit beliebig vielen Objekten der anderen Klasse in Beziehung. In der Gegenrichtung steht jedes Objekt nur mit genau einem Objekt der anderen Klasse in Verbindung. *In eine Klasse (Schule) gehen mehrere Schülerinnen und Schüler, jedoch geht jede Schülerin und jeder Schüler in genau eine Klasse.*'),
  img('schule_1n', 12, 'Abb. 2: 1-zu-n – der Fremdschlüssel klasse ↑ steht auf der n-Seite'),
  p('In den Tabellen sieht das so aus: Der Fremdschlüssel **klasse** in schueler enthält jeweils einen Wert, den es in klasse als Primärschlüssel **bezeichnung** gibt.'),
  { t: 'tables2', left: { title: 'klasse', head: ['bezeichnung 🔑', 'klassenlehrkraft'], rows: [['5b', 'Frau Jansen'], ['7a', 'Herr Okafor'], ['10c', 'Frau Graf']] },
    right: { title: 'schueler', head: ['s_nr 🔑', 'name', 'adresse', 'klasse ↑'], rows: [['1', 'Mila', 'Ostring 4', '7a'], ['2', 'Jonas', 'Hafenweg 1', '5b'], ['4', 'Ida', 'Ostring 4', '7a'], ['5', 'Tarek', 'Am Deich 9', '10c']] } },

  h3('2.4 n-zu-m-Kardinalität'),
  p('Jedes Objekt einer Klasse steht mit beliebig vielen Objekten der anderen Klasse in Beziehung. In der Gegenrichtung gilt das Gleiche. *In einen Kurs gehen mehrere Schülerinnen und Schüler, und eine Schülerin oder ein Schüler geht in mehrere Kurse.*'),
  p('Diese Beziehung lässt sich nicht durch einen Fremdschlüssel in einer der beiden Klassen darstellen (ein Attribut kann nicht „Ma1, If3, De2“ enthalten). Dazu wird eine **Hilfstabelle** benötigt, welche die Fremdschlüssel der Klassen verknüpft. Aus einer n-zu-m-Beziehung werden so zwei 1-zu-n-Beziehungen:'),
  img('schule_nm', 17, 'Abb. 3: Die Hilfstabelle belegung verbindet schueler und kurs'),
  table(['id 🔑', 'kurs ↑', 's_nr ↑'], [['1', 'Ma1', '1'], ['2', 'Ma1', '2'], ['3', 'If3', '1'], ['4', 'If3', '4'], ['5', 'If3', '5']], [1600, 2200, 2200]),
  p('An diese Tabelle können weitere Attribute ergänzt werden, falls man diesen Zusammenhang spezifizieren will (*z. B. die Note im Kurs*). Diese Tabelle gilt nicht als neue Klasse, sondern nur als Hilfstabelle, damit der Zusammenhang der n-zu-m-Kardinalität in der Datenbank umgesetzt werden kann.'),

  page(),
  /* ═══════════════════ II. SQL ═══════════════════ */
  h1('II. SQL (Structured Query Language)'),
  p('SQL ist die Datenbanksprache. Mit dieser können Datenbanken erstellt und verändert werden. Außerdem können Abfragen vorgenommen werden. Jeder Zugriff aus der Anwender-Software wird in einen SQL-Befehl umgewandelt – auch jedes Like, das du in einer App setzt.'),
  h2('1. Datenbankabfragen mit SQL'),
  p('In einer relationalen Datenbank werden Informationen in Tabellen (**Klassen**) repräsentiert. Die Zeilen dieser Tabelle heißen **Objekte**, die Spalten **Attribute**. Am Anfang hat dein Netzwerk nur eine einzige Klasse: **users**.'),
  img('db_users', 6.2, 'Abb. 4: Die Klasse users im Diagramm von YourSozialNet'),
  p('So sehen einige Objekte der Klasse users aus:'),
  img('abb_tabelle', 16.5, 'Abb. 5: Ausschnitt aus der Tabelle users'),
  p('Damit in der Datenbank nicht händisch nach Informationen gesucht werden muss, können mit SQL-Befehlen die Inhalte der Datenbank gezielt ausgewählt oder sortiert werden. Das Ergebnis einer SQL-Abfrage ist immer wieder eine Tabelle, welche sich aus der Abfrage ergibt.'),
  img('abb_sql', 16.5, 'Abb. 6: Eine SQL-Abfrage wählt Spalten und Zeilen aus'),
  p('Dabei folgen SQL-Befehle immer einer bestimmten Grundstruktur:'),
  list(
    'Der **SELECT**-Befehl gibt an, welche Attribute ausgegeben werden sollen. Mit einem **\\*** werden alle Attribute einer Klasse ausgegeben.',
    'Im **FROM**-Befehl wird die Klasse angegeben, welche betrachtet wird.',
    'Im **WHERE**-Befehl können noch weitere Bedingungen gesetzt werden.'
  ),
  syntax('Personen, die kleiner als 1,60 m sind', 'SELECT <Liste von Attributen>\nFROM <Klasse>\nWHERE <Bedingung>', 'SELECT id, name, centimeter\nFROM users\nWHERE centimeter < 160', true),

  h3('1.1 Projektion (Ausdrücke und Auswahl von Attributen)'),
  p('Bei einer Projektion wird eine Klasse gezielt auf bestimmte Spalten reduziert. Es können auch Spalten neu gebildet werden, wenn Inhalte zusammengefasst oder umgerechnet werden sollen. Diese zusätzlichen Spalten werden mit dem Keyword **AS** benannt. Ausdrücke können Attribute, konstante Werte, arithmetische Operationen (+, -, \\*, /) oder Funktionen (`NOW()`) sein.'),
  syntax('Größe in Meter umgerechnet', 'SELECT <Liste von Attributen>,\n       <Ausdruck> AS <Name>\nFROM <Klasse>', "SELECT id, name,\n       centimeter / 100 AS meter\nFROM users", true),
  table(['Funktion', 'Bedeutung'], [
    ['`NOW()`', 'liefert das aktuelle Datum mit Uhrzeit'],
    ['`DATEDIFF(<datum1>, <datum2>)`', 'liefert die Anzahl der Tage, die zwischen den beiden Daten liegen'],
    ['`FLOOR(<x>)`', 'rundet `<x>` ab auf eine ganze Zahl'],
    ['`YEAR(<datum>)`', 'liefert das Jahr eines Datums (genauso `MONTH`, `DAY`, `HOUR`)']
  ], [3600, 6000]),
  task(1, NOTIERE, [
    a('Gib alle Einträge aus der Tabelle users aus.', 'SELECT * FROM users'),
    a('Gib alle Benutzernamen (username) aus users aus.', 'SELECT username FROM users'),
    a('Gib alle Benutzernamen (username) und echten Namen (name) aller Einträge aus users aus.', 'SELECT username, name FROM users'),
    a('Gib die Wohnorte aller Mitglieder aus.', 'SELECT username, city FROM users'),
    a('Gib die Größe der User in Fuß (feet) an (1 cm = 0,0328 ft).', 'SELECT username, centimeter * 0.0328 AS feet FROM users', 'Achtung: Dezimalpunkt statt Komma. User ohne Größe (NULL) bleiben leer.'),
    a('Berechne das Alter der User und zeige den Namen und das Alter an.', `SELECT name, ${AGE} AS jahre FROM users`, 'Ohne FLOOR entstehen Kommazahlen. Die Ungenauigkeit (Schaltjahre) greift Aufgabe 7 m) auf.')
  ]),

  h3('1.2 Sortierung und Doppelungen'),
  p('**DISTINCT** kann nach dem **SELECT**-Befehl eingefügt werden. Dieser verhindert Doppelungen in der Ausgabe. Es werden identische Zeilen zusammengefügt. Dies ist praktisch, wenn nur bestimmte Attribute betrachtet werden. Beispielsweise können so alle Länder ausgegeben werden.'),
  syntax('Herkunftsländer der User', 'SELECT DISTINCT <Liste von Attributen>\nFROM <Klasse>', 'SELECT DISTINCT country\nFROM users', true),
  p('**ORDER BY** – Um Ergebnisse nach einem Attribut zu sortieren, kann der Befehl **ORDER BY <Attribut>** angefügt werden. Dieser sortiert die Liste alphabetisch bzw. nach Größe. **ASC** sorgt für eine ansteigende und **DESC** für eine absteigende Sortierung.'),
  p('**LIMIT** – Mit **LIMIT <Anzahl>** wird die Ausgabe auf die ersten Zeilen begrenzt. Zusammen mit ORDER BY erhältst du so z. B. die „Top 3“.'),
  syntax('Die drei größten User', 'SELECT <Liste von Attributen>\nFROM <Klasse>\nORDER BY <Attribut> ASC/DESC\nLIMIT <Anzahl>', 'SELECT name, centimeter\nFROM users\nORDER BY centimeter DESC\nLIMIT 3', true),
  task(2, NOTIERE, [
    a('Gib alle Wohnorte in einer sortierten Liste aus, bei der jede Stadt einmalig auftritt.', 'SELECT DISTINCT city FROM users ORDER BY city', 'Hier fallen schon „Hamburg“, „hamburg“, „Hambrug“ und eine leere Zeile (NULL) auf.'),
    a('Ordne die Mitglieder nach ihrem Benutzernamen in alphabetischer Reihenfolge.', 'SELECT username, name FROM users ORDER BY username ASC'),
    a('Ordne die Mitglieder nach ihrer Größe absteigend.', 'SELECT name, centimeter FROM users ORDER BY centimeter DESC', 'Ganz oben: Ronny Pfeiffer mit 250 cm – eine Falschangabe des Trolls. Gesprächsanlass: Wie verlässlich sind selbst angegebene Daten?'),
    a('Kehre die Reihenfolge der Tabelle **users** um.', 'SELECT * FROM users ORDER BY id DESC'),
    a('Gib die fünf zuletzt registrierten User aus.', 'SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 5', 'Auf Platz 1 steht jule.w – außer jemand aus der Klasse hat sich danach registriert (das eigene Admin-Konto!).')
  ]),

  page(),
  h3('1.3 Selektion (Auswahl von Objekten)'),
  p('Bei der Selektion im WHERE-Befehl können Objekte (Zeilen) einer Klasse mithilfe von Bedingungen ausgewählt werden.'),
  syntax('Alle User aus Kiel', "SELECT <Liste von Attributen>\nFROM <Klasse>\nWHERE <Bedingung>", "SELECT *\nFROM users\nWHERE city = 'Kiel'", true),
  p('**Vergleichsoperationen** – In SQL wird die Gleichheit mit „=“ und nicht mit „==“ überprüft. Texte stehen in einfachen Anführungszeichen `\'Kiel\'`, Zahlen ohne. Sonstige Operationen sind analog zu Java.'),
  table(['Gleich', 'Ungleich', 'Größer', 'Kleiner', 'Größergleich', 'Kleinergleich'], [['`=`', '`!=`', '`>`', '`<`', '`>=`', '`<=`']], [1600, 1600, 1600, 1600, 1600, 1600]),
  p('**Ähnlichkeit (LIKE)** – Mit dem Schlüsselwort LIKE kann man Objekte auswählen, deren Attribute einer vorgegebenen Zeichenkette ähnlich sind. Das Zeichen `_` dient als Platzhalter für ein beliebiges Zeichen und `%` als Platzhalter für eine Zeichenkette beliebiger Länge. Die Bedingung `username LIKE \'levi%\'` erfüllen beispielsweise Objekte mit dem Username „levi.kicks“ oder „levi_fan_09“, jedoch nicht „mama_von_levi“. LIKE unterscheidet dabei nicht zwischen Groß- und Kleinschreibung.'),
  syntax('Alle User, deren username mit „levi“ beginnt', "SELECT <Liste von Attributen>\nFROM <Klasse>\nWHERE <Attribut> LIKE <Muster>", "SELECT username, name\nFROM users\nWHERE username LIKE 'levi%'", true),
  p('**Logische Operationen (AND, OR, NOT)** – Auch die logischen Operationen gibt es in SQL. Diese können den **WHERE**-Befehl erweitern.'),
  code('Alle User, die aus Berlin kommen und Felix heißen', "SELECT username, name, city\nFROM users\nWHERE city = 'Berlin' AND name LIKE 'Felix%'", true),
  code('Alle User, die aus Berlin kommen oder Felix heißen', "SELECT username, name, city\nFROM users\nWHERE city = 'Berlin' OR name LIKE 'Felix%'", false),
  code('Alle User, die aus Berlin kommen und nicht Felix heißen', "SELECT username, name, city\nFROM users\nWHERE city = 'Berlin' AND name NOT LIKE 'Felix%'", false),
  p('*Hinweis:* `AND name NOT LIKE` lässt sich in SQL auch mit `AND NOT name LIKE` schreiben.'),
  p('**Leere Werte (IS NULL)** – Hat ein User etwas nicht angegeben, steht dort **NULL** („nichts“). NULL ist kein Wert: `city = NULL` findet deshalb nie etwas. Stattdessen schreibt man `city IS NULL` bzw. `city IS NOT NULL`.'),
  p('**Wechselwirkungen von Einschränkungen** – AND bindet stärker als OR (wie Punkt- vor Strichrechnung). Um Bedingungen logisch zu kapseln, können – wie in der Mathematik – Klammern genutzt werden.'),
  compare('Alle User aus Kiel, egal ob männlich oder weiblich – nur eine Möglichkeit funktioniert',
    { title: 'Möglichkeit 1', sql: "SELECT name, city, gender\nFROM users\nWHERE city = 'Kiel' AND\n      gender = 'male' OR\n      gender = 'female'" },
    { title: 'Möglichkeit 2', sql: "SELECT name, city, gender\nFROM users\nWHERE city = 'Kiel' AND\n      (gender = 'male' OR\n       gender = 'female')" }),
  task(3, 'Notiere für die folgenden Abfragen (ab Aufgabe b) einen SQL-Befehl. Deine Ausgabe sollte eine geeignete Auswahl an Attributen haben. Halte diesen digital oder analog fest!', [
    a('Teste beide Möglichkeiten vom letzten Abschnitt und finde heraus, worin der Unterschied der Ausgaben liegt. Welche Möglichkeit passt zur Aufgabe?', ["SELECT name, city, gender FROM users WHERE city = 'Kiel' AND gender = 'male' OR gender = 'female'", "SELECT name, city, gender FROM users WHERE city = 'Kiel' AND (gender = 'male' OR gender = 'female')"], 'Möglichkeit 1 liefert Kieler Männer und ALLE Frauen (AND vor OR). Möglichkeit 2 ist richtig.'),
    a('Gib alle weiblichen User aus.', "SELECT username, name FROM users WHERE gender = 'female'"),
    a('Gib alle User aus, die nicht aus Deutschland kommen. Schau dir dein Ergebnis genau an: Stimmt es wirklich?', "SELECT username, name, country FROM users WHERE country != 'Deutschland'", 'Falle: „Germany“, „deutschland“ und „DE“ tauchen auf, User mit NULL fehlen ganz. Gelöst wird das in Aufgabe 7 a) mit IN.'),
    a('Zeige nur Levi Schumacher an. Wie viele Treffer bekommst du? Wie kannst du sicherstellen, dass du genau einen bestimmten Levi bekommst?', "SELECT * FROM users WHERE name = 'Levi Schumacher'", 'Zwei Treffer (levi.kicks aus Kiel, levi.berlin aus Berlin). Eindeutig nur über den Primärschlüssel id (oder den eindeutigen username) – Rückbezug zu I.2.1.'),
    a('Welche Rollen kann man in deinem Netzwerk haben?', 'SELECT DISTINCT role FROM users', 'user und admin – admin ist das eigene Konto. Die Rollen erlaubt das ENUM im Diagramm.'),
    a('Gib alle User aus, die mindestens 1,80 m groß sind.', 'SELECT name, centimeter FROM users WHERE centimeter >= 180'),
    a('Prüfe, ob es minderjährige User gibt.', `SELECT name, ${AGE} AS jahre FROM users WHERE ${AGE} < 18`, 'Ja, viele (22 laut Formel, in Wahrheit 23: noah.sz wird erst morgen 18 – siehe Aufgabe 7 m).'),
    a('Finde zuerst heraus, wann levi.kicks geboren ist. Gib dann alle User aus, die im selben Jahr geboren sind, und ordne sie nach Geburtsdatum.', ["SELECT birthday FROM users WHERE username = 'levi.kicks'", "SELECT name, birthday FROM users WHERE YEAR(birthday) = YEAR((SELECT birthday FROM users WHERE username = 'levi.kicks')) ORDER BY birthday"], 'Schüler setzen das Jahr von Hand ein (z. B. `WHERE birthday LIKE \'2009%\'`). In einem Befehl geht es erst mit Unterabfrage (Aufgabe 7 e).'),
    a('Gib alle User aus, deren Benutzername ein „a“ enthält.', "SELECT username FROM users WHERE username LIKE '%a%'"),
    a('Erstelle eine Liste mit Usern, deren E-Mail-Adresse zu deinem Netzwerk gehört (sie endet auf *@name-deines-netzwerks.test*).', "SELECT username, email FROM users WHERE email LIKE '%@liky.test'", 'Der Name hängt vom Netzwerk ab (hier „Liky“). Die Domain steht klein und ohne Sonderzeichen.'),
    a('Erstelle eine Liste aller User, die Levi heißen und aus Kiel kommen.', "SELECT username, name, city FROM users WHERE name LIKE 'Levi%' AND city = 'Kiel'", 'Zwei: Levi Schumacher und Levi Nowak.'),
    a('Gib eine Liste aller männlichen User an, die größer als 1,85 m sind. Ordne die Liste nach Wohnort.', "SELECT name, city, centimeter FROM users WHERE gender = 'male' AND centimeter > 185 ORDER BY city"),
    a('Prüfe, ob es einen User gibt, der Felix heißt und nicht aus Berlin kommt.', "SELECT username, name, city FROM users WHERE name LIKE 'Felix%' AND city != 'Berlin'", 'Nur Felix Ude (Bremen). `name = \'Felix\'` findet niemanden – im Attribut name steht der ganze Name.'),
    a('Die Bundeswehr sucht Rekrutinnen und Rekruten. Gib die Namen und das Alter aller Männer über 165 cm und aller Frauen über 160 cm aus (es werden keine Panzerfahrerinnen und Panzerfahrer gesucht).', `SELECT name, gender, centimeter, ${AGE} AS jahre FROM users WHERE (gender = 'male' AND centimeter > 165) OR (gender = 'female' AND centimeter > 160)`, 'Klammern nötig. Wer will, filtert zusätzlich nach Alter ≥ 18.'),
    a('Erna Lüders sucht ihren Enkel. Sein Vorname war entweder Lasse oder Lars. Er kommt wohl aus Berlin. Kannst du herausfinden, ob ihr Enkel in deinem Netzwerk ist?', "SELECT username, name, city FROM users WHERE (name LIKE 'Lasse%' OR name LIKE 'Lars%') AND city = 'Berlin'", 'Zwei Kandidaten: Lasse Lüders und Lars-Ole Kunz. Der Nachname verrät Lasse. Endgültig klärt es Aufgabe 6 j) über follows.')
  ]),

  page(),
  h3('1.4 Gruppierungen und Aggregatfunktionen'),
  p('In SQL können Zeilen nach bestimmten Kriterien zusammengefasst werden.'),
  table(['Befehl', 'Bedeutung'], [
    ['`MIN(<Attribut>)` / `MAX(<Attribut>)`', 'kleinster bzw. größter Wert eines Attributs'],
    ['`SUM(<Attribut>)` / `AVG(<Attribut>)`', 'Summe bzw. Durchschnitt der Werte eines Attributs'],
    ['`COUNT(*)` / `COUNT(<Attribut>)`', 'zählt die Zeilen bzw. die Zeilen, in denen das Attribut nicht NULL ist'],
    ['`GROUP BY <Attribut>`', 'fasst alle Zeilen mit gleichem Wert zu einer Gruppe zusammen; die Funktionen oben rechnen dann je Gruppe']
  ], [3800, 5800]),
  code('Größe des größten Users', 'SELECT MAX(centimeter) AS maximale_groesse\nFROM users', true),
  code('Anzahl der User aus Kiel', "SELECT COUNT(*) AS anzahl\nFROM users\nWHERE city = 'Kiel'", true),
  code('Liste der Städte und der jeweiligen User-Anzahl', 'SELECT city, COUNT(*) AS anzahl\nFROM users\nGROUP BY city\nORDER BY anzahl DESC', true),
  task(4, NOTIERE, [
    a('Gib an, wann sich zuletzt ein Mitglied registriert hat.', 'SELECT MAX(created_at) FROM users'),
    a('Gib das Alter des ältesten Mitglieds an.', `SELECT MAX(${AGE}) AS jahre FROM users`, 'Erna Lüders, 78.'),
    a('Betrachte die beiden Befehle und überlege, was diese ausgeben sollen. Teste deine Vermutung. Zu welchem Wert gehört der Name im zweiten Befehl? Erkläre, warum das Ergebnis anders ist als erwartet.', ['SELECT name, MAX(centimeter) FROM users', 'SELECT name, MAX(centimeter), MIN(centimeter) FROM users'], 'Befehl 1: Ronny Pfeiffer, 250. Befehl 2: Lotta Berg, 250, 150 – der Name gehört zum MIN, steht aber neben dem MAX. Eine Gruppe hat nur EINE Zeile; welcher Name dort steht, legt SQL fest, nicht die Funktion. Saubere Lösung mit Unterabfrage: Aufgabe 7 d).',
      { compare: ['SELECT name, MAX(centimeter)\nFROM users', 'SELECT name, MAX(centimeter),\n       MIN(centimeter)\nFROM users'] }),
    a('Gib das Durchschnittsalter der User aus.', `SELECT AVG(${AGE}) AS durchschnitt FROM users`),
    a('Ermittle, wie viele männliche und wie viele weibliche User dein Netzwerk hat. Was steht außerdem in der Ausgabe?', 'SELECT gender, COUNT(*) FROM users GROUP BY gender', 'Zusätzlich diverse und eine Gruppe NULL (keine Angabe).'),
    a('Prüfe, ob es User gibt, die am gleichen Tag Geburtstag haben. Wer ist es?', ['SELECT birthday, COUNT(*) AS anzahl FROM users WHERE birthday IS NOT NULL GROUP BY birthday ORDER BY anzahl DESC LIMIT 3', "SELECT name, birthday FROM users WHERE birthday = (SELECT birthday FROM users WHERE birthday IS NOT NULL GROUP BY birthday ORDER BY COUNT(*) DESC LIMIT 1)"], 'Jakob Huber und Yusuf Demir. Ohne `IS NOT NULL` steht die Gruppe NULL (3 User ohne Geburtstag) ganz oben. Falle: Mila Hoffmann und Elisa Brandt haben am selben Tag, aber in verschiedenen Jahren Geburtstag – zählt das als „gleicher Tag“? Diskussion.'),
    a('Ermittle die Anzahl der Nutzer, die aus München kommen.', "SELECT COUNT(*) FROM users WHERE city = 'München'"),
    a('Gib die Namen der drei Städte mit den meisten Usern an.', 'SELECT city, COUNT(*) AS anzahl FROM users GROUP BY city ORDER BY anzahl DESC LIMIT 3', 'Kiel 11, dann München und Berlin mit je 7.'),
    a('Vergleiche die beiden Befehle. Warum kommen verschiedene Zahlen heraus? Finde die User, die im zweiten Befehl fehlen.', ['SELECT COUNT(*), COUNT(centimeter) FROM users', 'SELECT username, centimeter FROM users WHERE centimeter IS NULL'], 'COUNT(*) zählt alle 70 Zeilen, COUNT(centimeter) nur die 65 mit Angabe. Auch AVG lässt NULL einfach weg.',
      { compare: ['SELECT COUNT(*)\nFROM users', 'SELECT COUNT(centimeter)\nFROM users'] }),
    a('Wie viele User kommen aus Hamburg? Vergleiche `city = \'Hamburg\'` mit `city LIKE \'Hamburg%\'`. Hast du wirklich alle Hamburger gefunden?', ["SELECT COUNT(*) FROM users WHERE city = 'Hamburg'", "SELECT city, COUNT(*) FROM users WHERE city LIKE 'Ham%' GROUP BY city"], '= findet 1, LIKE \'Hamburg%\' findet 3 (Hamburg, hamburg, „Hamburg “ mit Leerzeichen). „Hambrug“ (Tippfehler) findet nur ein genauer Blick. LIKE unterscheidet nicht zwischen Groß- und Kleinschreibung.'),
    a('In welchen Ländern wohnen die User, und wie viele jeweils? Was fällt dir bei Deutschland auf?', 'SELECT country, COUNT(*) AS anzahl FROM users GROUP BY country ORDER BY anzahl DESC', 'Deutschland, Germany, deutschland, DE – vier Schreibweisen für dasselbe Land. Datenqualität!')
  ]),

  page(),
  /* ═══════════════════ 2. Photos und Comments ═══════════════════ */
  h2('2. Photos und Comments'),
  p('YourSozialNet wäre kein echtes soziales Netzwerk, wenn es keine Bilder geben würde. Daher erweitern wir unser Netzwerk nun um zwei weitere Klassen: **photos** und **comments**.'),
  list(
    '**photos** ist der Klassiker einer 1-zu-n-Beziehung: Ein User kann mehrere Fotos posten, jedes Foto gehört aber genau einem User. Der Fremdschlüssel `user_id ↑` steht deshalb in photos.',
    '**comments** hat gleich **zwei** 1-zu-n-Beziehungen: Ein User schreibt viele Kommentare (`user_id ↑`) und ein Foto hat viele Kommentare (`photo_id ↑`). Jeder Kommentar gehört zu genau einem Verfasser und genau einem Foto.'
  ),
  img('db_photos', 16.5, 'Abb. 7: users, photos und comments'),
  h3('JOIN'),
  p('Es gibt zahlreiche Möglichkeiten, in SQL auf zwei Tabellen zuzugreifen. Meistens werden dazu JOIN-Befehle genutzt. Wir beschränken uns zuerst auf den (INNER) JOIN. Nach **ON** steht, welcher Fremdschlüssel zu welchem Primärschlüssel gehört. Da Attributnamen zum Teil in beiden Klassen auftauchen (z. B. `id`), können bzw. müssen diese eindeutig mit der Punktnotation (wie in Java) angegeben werden: `photos.user_id`, `users.id`.'),
  img('abb_join', 16.5, 'Abb. 8: Der JOIN hängt an jedes Foto die Zeile seines Users'),
  syntax('Bilder und ihre Besitzer', 'SELECT <Liste von Attributen>\nFROM <Klasse1>\nJOIN <Klasse2>\n  ON <Fremdschlüssel> = <Primärschlüssel>\nWHERE <Bedingung>', 'SELECT username, image, description\nFROM users\nJOIN photos\n  ON photos.user_id = users.id\nORDER BY username', true),
  task(5, NOTIERE, [
    a('Gib alle Fotos zusammen mit dem Benutzernamen des Besitzers aus.', 'SELECT users.username, photos.image, photos.description FROM photos JOIN users ON photos.user_id = users.id'),
    a('Gib eine absteigend sortierte Tabelle aus, in der die User und die Anzahl ihrer geposteten Fotos stehen.', 'SELECT users.username, COUNT(*) AS fotos FROM users JOIN photos ON photos.user_id = users.id GROUP BY users.id ORDER BY fotos DESC', 'Spitze: alina.daily mit 7. User ohne Foto fehlen hier (INNER JOIN) – das greift Aufgabe 7 k) auf.'),
    a('Welcher User hat als Letztes ein Foto gepostet?', 'SELECT users.username, photos.created_at FROM photos JOIN users ON photos.user_id = users.id ORDER BY photos.created_at DESC LIMIT 1', 'noah.sz (Geburtstagskerzen „Morgen ist es so weit“) – außer jemand aus der Klasse hat schon gepostet.'),
    a('Gib alle Fotos von Levi Schumacher aus Kiel mit ihrer Beschreibung aus.', "SELECT photos.image, photos.description FROM photos JOIN users ON photos.user_id = users.id WHERE users.username = 'levi.kicks'", 'Wer mit `name = \'Levi Schumacher\'` sucht, bekommt auch die Fotos von levi.berlin.'),
    a('Gib alle Kommentare und die Benutzernamen der Verfasser aus München aus.', "SELECT users.username, comments.body FROM comments JOIN users ON comments.user_id = users.id WHERE users.city = 'München'"),
    a('Erstelle eine Liste, in der für jedes Leipziger Mitglied die Anzahl seiner Fotos aufgeführt ist.', "SELECT users.username, COUNT(*) AS fotos FROM users JOIN photos ON photos.user_id = users.id WHERE users.city = 'Leipzig' GROUP BY users.id"),
    a('Gib alle Kommentare aus, die unter dem Foto mit der Ostsee (`dummy/linus_seascape.webp`) stehen.', "SELECT comments.body, comments.created_at FROM comments JOIN photos ON comments.photo_id = photos.id WHERE photos.image = 'dummy/linus_seascape.webp'"),
    a('Welches Foto hat die meisten Kommentare?', 'SELECT photos.image, photos.description, COUNT(*) AS kommentare FROM comments JOIN photos ON comments.photo_id = photos.id GROUP BY photos.id ORDER BY kommentare DESC LIMIT 1', 'Gewinnspiel-Post von giulia.glow (16). Wem das Foto gehört, kommt in Aufgabe 6 b).'),
    a('Ein Kommentar taucht auffällig oft auf. Finde ihn und seinen Verfasser.', 'SELECT users.username, comments.body, COUNT(*) AS anzahl FROM comments JOIN users ON comments.user_id = users.id GROUP BY comments.body ORDER BY anzahl DESC LIMIT 1', '„Gratis Follower 💰👉 Link in Bio“ von gewinn_jetzt_2026, 30-mal – ein Spam-Bot.'),
    a('Gib alle Kommentar-Inhalte des Users aaron183 aus. Wie würdest du ihn beschreiben?', "SELECT comments.body FROM comments JOIN users ON comments.user_id = users.id WHERE users.username = 'aaron183'", 'Ein Troll („cringe“, „Geh lieber lernen“).'),
    a('Die Moderation deines Netzwerks bittet um Mithilfe: Einige User verbreiten, andere seien „Echsenmenschen von der Rückseite des Mondes“. Wer hat solche Kommentare geschrieben? Gib E-Mail, Benutzername und Kommentar aus. Prüfe dein Ergebnis: Sind wirklich alle Treffer Verschwörungstheoretiker?', "SELECT users.email, users.username, comments.body FROM comments JOIN users ON comments.user_id = users.id WHERE comments.body LIKE '%Echse%'", 'Die Theoretiker: mondrueckseite (Ronny Pfeiffer) und echsenwache (Sven Kühn). Falle: Treffer sind auch harmlose Kommentare („Süße Echse!!“ unter Sofias Bartagame) und Antworten anderer, die @echsenwache erwähnen. Unter welchen Bildern sie stehen, kommt in Aufgabe 6 a). Wichtig für Aufgabe 11 e).')
  ]),

  page(),
  /* ═══════════════════ 3. Follows, Likes, Tags ═══════════════════ */
  h2('3. Tags, Follows und Likes'),
  p('Natürlich gibt es noch ein paar weitere Funktionen in YourSozialNet, die du auch von anderen Netzwerken kennst. Alle drei sind **n-zu-m-Kardinalitäten**, weswegen – wie bei den Kursen in Kapitel I – Hilfstabellen benötigt werden.'),
  list(
    '**tags**: Ein Foto kann viele Tags haben (#kiel, #segeln), und ein Tag steht an vielen Fotos. Die Klasse **tags** speichert jeden Tag nur einmal, die Hilfstabelle **photo_tag** verknüpft Fotos und Tags. Das ist die „klassische“ n-zu-m-Beziehung.',
    '**follows**: Ein User folgt vielen Usern und hat viele Follower. Hier verbindet die Hilfstabelle die Klasse users **mit sich selbst**: `follower_id ↑` (wer folgt) und `following_id ↑` (wem gefolgt wird) zeigen beide auf users.',
    '**likes**: Ein User liked viele Fotos, ein Foto wird von vielen Usern gelikt. Die Hilfstabelle bekommt ein zusätzliches Attribut **kind** – die Art des Likes (heart, thumb, laugh).'
  ),
  p('Bei den drei Hilfstabellen ist der Primärschlüssel **zusammengesetzt** (siehe I.2.1): `(photo_id, tag_id)`, `(follower_id, following_id)` und `(user_id, photo_id)`. So kann niemand ein Foto zweimal liken.'),
  img('db_nm', 16.5, 'Abb. 9: Das Netzwerk mit Tags, Follows und Likes'),
  page(),
  h3('JOIN über eine Hilfstabelle'),
  p('Um eine n-zu-m-Beziehung auszugeben, geht man über die Hilfstabelle: von der einen Klasse zur Hilfstabelle und von dort zur anderen Klasse. Es werden also drei Tabellen verbunden.'),
  syntax('Alle Tags des Fotos mit der Ostsee (seascape)', 'SELECT <Liste von Attributen>\nFROM <Klasse1>\nJOIN <Hilfstabelle>\n  ON <Fremdschlüssel1> = <Primärschlüssel1>\nJOIN <Klasse2>\n  ON <Primärschlüssel2> = <Fremdschlüssel2>\nWHERE <Bedingung>', "SELECT photos.image, tags.name\nFROM photos\nJOIN photo_tag ON photo_tag.photo_id = photos.id\nJOIN tags      ON tags.id = photo_tag.tag_id\nWHERE photos.image = 'dummy/linus_seascape.webp'", true),
  p('*Übrigens:* comments funktioniert genauso. Ein Kommentar verbindet einen User mit einem Foto – wer von users über comments zu photos will, braucht also auch zwei JOINs.'),
  code('Kommentare mit Verfasser und Foto', 'SELECT users.username, comments.body, photos.image\nFROM users\nJOIN comments ON comments.user_id = users.id\nJOIN photos   ON comments.photo_id = photos.id', false),
  code('Alle User, die das Foto mit der Ostsee gelikt haben – und wie', "SELECT users.username, likes.kind\nFROM users\nJOIN likes  ON likes.user_id = users.id\nJOIN photos ON likes.photo_id = photos.id\nWHERE photos.image = 'dummy/linus_seascape.webp'", true),
  h3('Eine Klasse zweimal: Aliasse'),
  p('Bei follows braucht man die Klasse users **zweimal**: einmal für den, der folgt, und einmal für den, dem gefolgt wird. Damit SQL die beiden auseinanderhalten kann, bekommt jede einen eigenen Namen, einen **Alias**: `users AS fan` und `users AS star`.'),
  code('Wem folgt levi.kicks?', "SELECT fan.username AS folgt, star.username AS wem\nFROM follows\nJOIN users AS fan  ON follows.follower_id  = fan.id\nJOIN users AS star ON follows.following_id = star.id\nWHERE fan.username = 'levi.kicks'", true),
  task(6, NOTIERE, [
    a('Unter welchen Bildern stehen die Echsen-Kommentare aus Aufgabe 5 k)? Gib Benutzername, Kommentar und Bild aus.', "SELECT users.username, comments.body, photos.image FROM users JOIN comments ON comments.user_id = users.id JOIN photos ON comments.photo_id = photos.id WHERE comments.body LIKE '%Echse%'"),
    a('Welches Foto hat die meisten Kommentare – und wem gehört es? *Achtung: Hier gibt es zwei verschiedene User – den Verfasser des Kommentars und den Besitzer des Fotos.*', 'SELECT photos.image, users.username AS besitzer, COUNT(*) AS kommentare FROM comments JOIN photos ON comments.photo_id = photos.id JOIN users ON photos.user_id = users.id GROUP BY photos.id ORDER BY kommentare DESC LIMIT 1', 'giulia.glow (16, Gewinnspiel). Wer users über comments.user_id joint, bekommt die Verfasser statt der Besitzerin.'),
    a('Gib eine Tabelle aus, in der alle Fotos zusammen mit ihren Tags stehen.', 'SELECT photos.image, tags.name FROM photos JOIN photo_tag ON photo_tag.photo_id = photos.id JOIN tags ON tags.id = photo_tag.tag_id'),
    a('Welche Tags wurden am häufigsten verwendet?', 'SELECT tags.name, COUNT(*) AS anzahl FROM tags JOIN photo_tag ON photo_tag.tag_id = tags.id GROUP BY tags.id ORDER BY anzahl DESC LIMIT 5', 'gaming 15, reisen 13, fussball 11.'),
    a('Wie viele Bilder haben den Tag „abenteuerlust“? Vergleiche dein Ergebnis mit `LIKE \'%abenteuer%\'`. Welche Zahl ist richtig?', ["SELECT COUNT(*) FROM photo_tag JOIN tags ON tags.id = photo_tag.tag_id WHERE tags.name = 'abenteuerlust'", "SELECT tags.name, COUNT(*) FROM photo_tag JOIN tags ON tags.id = photo_tag.tag_id WHERE tags.name LIKE '%abenteuer%' GROUP BY tags.name"], 'Genau: 4. Mit LIKE 6, weil es auch „abenteuer“ und „abenteuer_lust“ gibt. Je nach Frage ist beides vertretbar.'),
    a('Welche Tags hat Alina Keller genutzt?', "SELECT DISTINCT tags.name FROM users JOIN photos ON photos.user_id = users.id JOIN photo_tag ON photo_tag.photo_id = photos.id JOIN tags ON tags.id = photo_tag.tag_id WHERE users.name = 'Alina Keller'", 'Vier Tabellen. Ohne DISTINCT erscheinen Tags doppelt.'),
    a('Gib die 10 beliebtesten Fotos aus (die meisten Likes) – mit dem Benutzernamen des Besitzers.', 'SELECT photos.image, users.username, COUNT(*) AS likes FROM likes JOIN photos ON likes.photo_id = photos.id JOIN users ON photos.user_id = users.id GROUP BY photos.id ORDER BY likes DESC LIMIT 10'),
    a('Brigitte (backmitbrigitte) hat versprochen: „60 Likes = Rezept!“. Muss sie das Rezept verraten?', "SELECT photos.description, COUNT(*) AS likes FROM likes JOIN photos ON likes.photo_id = photos.id WHERE photos.description LIKE '60 Likes%' GROUP BY photos.id", 'Knapp nicht: 59 Likes.'),
    a('Welche Art Like (heart, thumb, laugh) wird am häufigsten vergeben?', 'SELECT kind, COUNT(*) AS anzahl FROM likes GROUP BY kind ORDER BY anzahl DESC'),
    a('Erinnerst du dich an Erna aus Aufgabe 3 o)? Wem folgt sie? Ist ihr Enkel dabei?', "SELECT star.username, star.name FROM follows JOIN users AS fan ON follows.follower_id = fan.id JOIN users AS star ON follows.following_id = star.id WHERE fan.username = 'erna.lueders'", 'Ja: lasse.ld.'),
    a('Wer folgt levi.kicks? Findest du darunter seine Mutter?', "SELECT fan.username, fan.name FROM follows JOIN users AS fan ON follows.follower_id = fan.id JOIN users AS star ON follows.following_id = star.id WHERE star.username = 'levi.kicks'", 'sandra.schu (Sandra Schumacher). Dazu viele aus Kiel und levi_fan_09.'),
    a('Wer hat die meisten Follower?', 'SELECT users.username, COUNT(*) AS follower FROM follows JOIN users ON follows.following_id = users.id GROUP BY users.id ORDER BY follower DESC LIMIT 3', 'finn.kielwasser mit 25. Wer über follower_id joint, zählt, wem jemand folgt.'),
    a('Welche User haben über ein Foto von wachtauf_marco gelacht (Like-Art laugh)?', "SELECT DISTINCT fan.username FROM likes JOIN users AS fan ON likes.user_id = fan.id JOIN photos ON likes.photo_id = photos.id JOIN users AS besitzer ON photos.user_id = besitzer.id WHERE besitzer.username = 'wachtauf_marco' AND likes.kind = 'laugh'", 'Auch hier zwei verschiedene User – also zweimal users mit Alias.'),
    a('Welche User folgen sich gegenseitig?', 'SELECT a.username, b.username FROM follows AS f1 JOIN follows AS f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id JOIN users AS a ON a.id = f1.follower_id JOIN users AS b ON b.id = f1.following_id WHERE a.id < b.id', 'follows zweimal mit Alias. `a.id < b.id` verhindert, dass jedes Paar doppelt erscheint.', { star: true })
  ]),

  page(),
  /* ═══════════════════ 4. Tiefer in SQL ═══════════════════ */
  h2('4. Tiefer in SQL'),
  p('Mit SELECT, WHERE, GROUP BY und JOIN kannst du schon sehr viel herausfinden. Manche Fragen brauchen aber mehr: eine Menge von Werten, ein Ergebnis, mit dem man weiterrechnet, oder Zeilen, die es auf der anderen Seite gar nicht gibt.'),
  h3('4.1 IN'),
  p('Der IN-Befehl wird in der WHERE-Klausel verwendet, um zu prüfen, ob ein Wert zu einer bestimmten Menge von Werten gehört. Er ist eine übersichtliche Alternative zu mehreren OR-Bedingungen. **NOT IN** prüft das Gegenteil.'),
  syntax('Alle User, die in der Schweiz oder in Österreich wohnen', 'SELECT <Liste von Attributen>\nFROM <Klasse>\nWHERE <Attribut> IN (<Menge von Werten>)', "SELECT username, country\nFROM users\nWHERE country IN ('Schweiz', 'Österreich')", true),
  h3('4.2 Geschachtelte Abfragen (Kapselung)'),
  p('Das Ergebnis einer SQL-Abfrage ist immer eine Tabelle. Deshalb kann man eine Abfrage in eine andere hineinschreiben – in Klammern. Man nennt das eine **Unterabfrage** (oder Kapselung). Die **innere** Abfrage wird zuerst ausgeführt, mit ihrem Ergebnis rechnet dann die **äußere** Abfrage weiter.'),
  img('abb_kapselung', 14, 'Abb. 10: Die innere Abfrage liefert den Wert, mit dem die äußere rechnet'),
  p('Eine Unterabfrage kann an drei Stellen stehen. Je nachdem, wo sie steht, muss sie etwas anderes liefern:'),
  table(['Wo?', 'Was muss die Unterabfrage liefern?', 'Beispiel'], [
    ['nach `=`, `<`, `>` …', 'genau **einen Wert** (eine Zeile, eine Spalte)', '`WHERE centimeter > (SELECT AVG(centimeter) FROM users)`'],
    ['nach `IN` / `NOT IN`', 'eine **Liste** (eine Spalte, beliebig viele Zeilen)', '`WHERE id IN (SELECT user_id FROM photos)`'],
    ['nach `FROM`', 'eine ganze **Tabelle** – sie braucht einen Namen mit AS', '`FROM (SELECT …) AS t`']
  ], [2200, 3300, 4100]),
  code('Ein Wert: Alle User, die größer als der Durchschnitt sind', 'SELECT name, centimeter\nFROM users\nWHERE centimeter > (SELECT AVG(centimeter)\n                    FROM users)', true),
  h3('4.3 HAVING'),
  p('**WHERE** filtert einzelne Datensätze **vor** der Gruppierung (GROUP BY) und entscheidet damit, welche Zeilen überhaupt in die Gruppenbildung eingehen. Aggregatfunktionen wie SUM oder COUNT sind hier nicht erlaubt.'),
  p('**HAVING** filtert **nach** der Gruppierung und legt fest, welche gebildeten Gruppen im Ergebnis erscheinen. Dabei dürfen Aggregatfunktionen verwendet werden, da sich die Bedingung auf berechnete Gruppenwerte bezieht.'),
  syntax('Alle User aus Kiel mit mehr als 5 Bildern', 'SELECT <Liste von Attributen>\nFROM <Klasse>\nWHERE <Bedingung für Zeilen>\nGROUP BY <Attribut>\nHAVING <Bedingung für Gruppen>', "SELECT users.name, COUNT(photos.id) AS fotos\nFROM users\nJOIN photos ON users.id = photos.user_id\nWHERE users.city = 'Kiel'\nGROUP BY users.id\nHAVING COUNT(photos.id) > 5", true),
  h3('4.4 JOIN: mehr Varianten'),
  p('Neben dem „Standard“-JOIN gibt es noch mehr Möglichkeiten, zwei Tabellen zusammenzufügen. Sie werden auch mit einem ON und deren Primär-/Fremdschlüssel verknüpft.'),
  img('abb_venn', 16.5, 'Abb. 11: Welche Zeilen bleiben bei welchem JOIN übrig?'),
  list(
    'Der **INNER JOIN** gibt nur die Informationen zurück, die in beiden Tabellen Übereinstimmungen besitzen (INNER JOIN = JOIN).',
    'Der **LEFT JOIN** gibt alle Informationen der linken Tabelle (Tabelle 1) zurück, sowie die Informationen, die mit der rechten Tabelle (Tabelle 2) übereinstimmen. Gibt es keine Übereinstimmung, wird NULL ausgegeben.',
    'Der **RIGHT JOIN** gibt alle Informationen der rechten Tabelle (Tabelle 2) zurück, sowie die Informationen, die mit der linken Tabelle (Tabelle 1) übereinstimmen. Gibt es keine Übereinstimmung, wird NULL ausgegeben.',
    'Der **FULL (OUTER) JOIN** gibt alle Informationen aus beiden Tabellen aus. Sollten Werte, egal aus welcher Tabelle, keine Übereinstimmung haben, wird NULL ausgegeben.'
  ),
  syntax('Alle User mit ihren Bildern – auch die ohne Bilder', 'SELECT <Liste von Attributen>\nFROM <Klasse1>\n[LEFT | RIGHT | FULL] JOIN <Klasse2>\n  ON <Fremdschlüssel> = <Primärschlüssel>\nWHERE <Bedingung>', 'SELECT users.name, photos.image\nFROM users\nLEFT JOIN photos ON photos.user_id = users.id\nORDER BY users.name', true),
  p('Der Trick: Wer **keinen** Partner hat, bekommt NULL. Mit `WHERE photos.id IS NULL` bleiben also genau die User ohne Foto übrig.'),
  task(7, NOTIERE, [
    a('Liste alle User auf, die aus Deutschland kommen – egal, ob sie „Deutschland“, „Germany“, „deutschland“ oder „DE“ angegeben haben.', "SELECT username, country FROM users WHERE country IN ('Deutschland', 'Germany', 'deutschland', 'DE')"),
    a('Gib alle User aus, die noch nie ein Foto gepostet haben. Nutze NOT IN.', 'SELECT username FROM users WHERE id NOT IN (SELECT user_id FROM photos)', '16 User (die Trolle, Kommentierer und leeren Konten).'),
    a('Wer ist größer als der Durchschnitt aller User aus Kiel?', "SELECT name, centimeter FROM users WHERE centimeter > (SELECT AVG(centimeter) FROM users WHERE city = 'Kiel')"),
    a('Gib den Namen der größten Person aus – diesmal sicher richtig (vgl. Aufgabe 4 c).', 'SELECT name, centimeter FROM users WHERE centimeter = (SELECT MAX(centimeter) FROM users)'),
    a('Gib alle User aus, die im selben Jahr wie levi.kicks geboren sind – diesmal in einem einzigen Befehl (vgl. Aufgabe 3 h).', "SELECT name, birthday FROM users WHERE YEAR(birthday) = (SELECT YEAR(birthday) FROM users WHERE username = 'levi.kicks') ORDER BY birthday"),
    a('Welche Tags wurden mindestens 8-mal verwendet?', 'SELECT tags.name, COUNT(*) AS anzahl FROM tags JOIN photo_tag ON photo_tag.tag_id = tags.id GROUP BY tags.id HAVING COUNT(*) >= 8 ORDER BY anzahl DESC'),
    a('Welche User haben mehr als 30 Likes verteilt?', 'SELECT users.username, COUNT(*) AS likes FROM users JOIN likes ON likes.user_id = users.id GROUP BY users.id HAVING COUNT(*) > 30 ORDER BY likes DESC'),
    a('Finde die 5 Fotos, die von niemandem gelikt wurden. Nutze den LEFT JOIN.', 'SELECT photos.image, photos.description FROM photos LEFT JOIN likes ON likes.photo_id = photos.id WHERE likes.photo_id IS NULL', 'ole_04, ralf_02, ben_01, larsole_01, jakob_01.'),
    a('Liste alle Bilder auf, die keinen Tag haben. Nutze den LEFT JOIN.', 'SELECT photos.image, photos.description FROM photos LEFT JOIN photo_tag ON photo_tag.photo_id = photos.id WHERE photo_tag.photo_id IS NULL', 'Vier: hugo_03, alina_07, ole_04, ben_01.'),
    a('Liste die Bilder, die nicht gelikt wurden, noch einmal auf – diesmal mit dem RIGHT JOIN. Was musst du gegenüber Aufgabe h) ändern?', 'SELECT photos.image FROM likes RIGHT JOIN photos ON likes.photo_id = photos.id WHERE likes.photo_id IS NULL', 'Die Reihenfolge der Tabellen tauschen: photos muss rechts stehen.'),
    a('Beide Befehle sollen zählen, wie viele Fotos jeder User hat. Bei manchen Usern unterscheiden sich die Zahlen. Bei wem und warum?', ['SELECT users.username, COUNT(*) FROM users LEFT JOIN photos ON photos.user_id = users.id GROUP BY users.id ORDER BY 2', 'SELECT users.username, COUNT(photos.id) FROM users LEFT JOIN photos ON photos.user_id = users.id GROUP BY users.id ORDER BY 2'], 'User ohne Foto: COUNT(*) zählt ihre eine Zeile mit NULL als 1, COUNT(photos.id) zählt NULL nicht und gibt 0.',
      { compare: ['SELECT users.username, COUNT(*)\nFROM users\nLEFT JOIN photos\n  ON photos.user_id = users.id\nGROUP BY users.id', 'SELECT users.username, COUNT(photos.id)\nFROM users\nLEFT JOIN photos\n  ON photos.user_id = users.id\nGROUP BY users.id'] }),
    a('Einer der beiden Befehle läuft nicht. Welcher, und warum? Was musst du ändern?', ['SELECT city, COUNT(*) FROM users GROUP BY city HAVING COUNT(*) > 4'], 'WHERE COUNT(*) > 4 ist ein Fehler: WHERE kommt vor der Gruppierung, da gibt es noch kein COUNT. Richtig: HAVING.',
      { compare: ['SELECT city, COUNT(*)\nFROM users\nWHERE COUNT(*) > 4\nGROUP BY city', 'SELECT city, COUNT(*)\nFROM users\nGROUP BY city\nHAVING COUNT(*) > 4'] }),
    a('Noah (noah.sz) postet „Morgen ist es so weit 🎉“ – er wird morgen 18. Berechne sein Alter mit der Formel aus Aufgabe 1 f). Was stimmt nicht, und warum? Teste auch den zweiten Befehl rechts und erkläre, wie er rechnet.', [`SELECT name, ${AGE} FROM users WHERE username = 'noah.sz'`, "SELECT name, YEAR(NOW()) - YEAR(birthday) - (DATE_FORMAT(NOW(), '%m-%d') < DATE_FORMAT(birthday, '%m-%d')) AS jahre FROM users WHERE username = 'noah.sz'"], 'Die Formel sagt 18: In 18 Jahren liegen 4–5 Schalttage, also sind 17 Jahre und 364 Tage schon mehr als 18·365 Tage. Der zweite Befehl rechnet Jahre und zieht 1 ab, wenn der Geburtstag in diesem Jahr noch nicht war (ein Vergleich ergibt 1 oder 0).', { star: true,
      compare: [`SELECT name,\n  ${AGE}\nFROM users\nWHERE username = 'noah.sz'`, "SELECT name,\n  YEAR(NOW()) - YEAR(birthday)\n  - (DATE_FORMAT(NOW(), '%m-%d')\n     < DATE_FORMAT(birthday, '%m-%d'))\nFROM users\nWHERE username = 'noah.sz'"] }),
    a('Welche User haben mehr Fotos gepostet als der Durchschnitt aller User, die posten?', 'SELECT users.username, COUNT(*) AS fotos FROM users JOIN photos ON photos.user_id = users.id GROUP BY users.id HAVING COUNT(*) > (SELECT AVG(anzahl) FROM (SELECT COUNT(*) AS anzahl FROM photos GROUP BY user_id) AS t)', 'Unterabfrage in der Unterabfrage – nach HAVING.', { star: true })
  ]),

  page(),
  /* ═══════════════════ 5. Übung ═══════════════════ */
  h2('5. Alles zusammen: 10 Aufgaben zum Üben'),
  p('Hier kommt alles vor, was du bisher gelernt hast: Projektion, Selektion, Sortierung, Gruppierung, JOIN und Unterabfragen. Überlege bei jeder Aufgabe zuerst: *Welche Tabellen brauche ich?* Schau dazu ins Diagramm.'),
  task(8, NOTIERE, [
    a('Gib eine Liste aus, in der alle User (Username, Name, Country) sortiert nach ihrem Namen stehen.', 'SELECT username, name, country FROM users ORDER BY name'),
    a('Erstelle eine Liste, in der steht, wie viele User aus den jeweiligen Städten kommen – sortiert nach der Anzahl der User.', 'SELECT city, COUNT(*) AS anzahl FROM users GROUP BY city ORDER BY anzahl DESC'),
    a('Wie viele User haben eine E-Mail-Adresse deines Netzwerks und wie viele eine externe?', ["SELECT COUNT(*) FROM users WHERE email LIKE '%@liky.test'", "SELECT COUNT(*) FROM users WHERE email NOT LIKE '%@liky.test'"], 'Vorsicht: Konten ohne E-Mail (NULL) zählt keiner der beiden Befehle.'),
    a('Gib die drei jüngsten User aus.', 'SELECT name, birthday FROM users WHERE birthday IS NOT NULL ORDER BY birthday DESC LIMIT 3', 'Ohne `IS NOT NULL` kann je nach Datenbank NULL ganz oben stehen.'),
    a('Welcher User hat die meisten Fotos gepostet?', 'SELECT users.username, COUNT(*) AS fotos FROM users JOIN photos ON photos.user_id = users.id GROUP BY users.id ORDER BY fotos DESC LIMIT 1'),
    a('Gib eine Liste aus, in der für jeden User die Anzahl der von ihm verteilten Likes steht – auch für User ohne Like.', 'SELECT users.username, COUNT(likes.photo_id) AS likes FROM users LEFT JOIN likes ON likes.user_id = users.id GROUP BY users.id ORDER BY likes DESC'),
    a('Welche Fotos hat hugo.ranked kommentiert, und was hat er geschrieben?', "SELECT photos.image, comments.body FROM comments JOIN users ON comments.user_id = users.id JOIN photos ON comments.photo_id = photos.id WHERE users.username = 'hugo.ranked'"),
    a('Gib eine Liste aus, in der alle Bildbeschreibungen stehen, die von Laura Mauer oder Marlo Eberhart gelikt wurden.', "SELECT DISTINCT photos.description FROM photos JOIN likes ON likes.photo_id = photos.id JOIN users ON likes.user_id = users.id WHERE users.name IN ('Laura Mauer', 'Marlo Eberhart')"),
    a('Welcher Tag wird von den meisten verschiedenen Usern benutzt?', 'SELECT tags.name, COUNT(DISTINCT photos.user_id) AS user FROM tags JOIN photo_tag ON photo_tag.tag_id = tags.id JOIN photos ON photos.id = photo_tag.photo_id GROUP BY tags.id ORDER BY user DESC LIMIT 1', 'COUNT(DISTINCT …) zählt jeden User nur einmal.'),
    a('Welche User haben noch nie etwas gepostet, gelikt oder kommentiert?', 'SELECT username FROM users WHERE id NOT IN (SELECT user_id FROM photos) AND id NOT IN (SELECT user_id FROM likes) AND id NOT IN (SELECT user_id FROM comments)', 'Die leeren Konten (max.mueller, test_account, jule.w, geloescht_4711) – und das eigene Admin-Konto.')
  ]),

  page(),
  /* ═══════════════════ 6. Ändern ═══════════════════ */
  h2('6. Datenbankinhalte ändern'),
  p('SQL verwaltet nicht nur die Abfragen einer Datenbank. Die gesamte Datenbank wird durch SQL erstellt und verändert. Dazu gibt es weitere Befehle, die analog zum SELECT-Befehl genutzt werden können: Mit **INSERT** werden neue Daten in die Datenbank eingefügt, mit **UPDATE** können vorhandene Daten verändert werden und **DELETE** löscht Daten.'),
  h3('6.1 Einfügen'),
  p('Das Einfügen von Daten geschieht über **INSERT**. Dabei müssen die entsprechende Tabelle und deren Attribute nach **INTO** angegeben werden. Die Liste der Attribute muss nicht vollständig sein, ausgelassene Attribute werden mit NULL oder ihrem Standardwert (*DEFAULT*) gefüllt. **VALUES** leitet dann die Werte für das neue Objekt ein. Es können mehrere Objekte gleichzeitig eingefügt werden.'),
  syntax('Erstelle den neuen User Günther', 'INSERT INTO <Klasse>\n  (<Liste der Attribute>)\nVALUES\n  (<Werte vom 1. Objekt>),\n  (<Werte vom 2. Objekt>);', "INSERT INTO users\n  (username, name, email, password,\n   gender, birthday, city, country,\n   centimeter)\nVALUES\n  ('guenther37', 'Günther Müller',\n   'guenther@mail.test', '123passwort',\n   'male', '1987-07-07', 'Kiel',\n   'Deutschland', 178);", false),
  p('Statt fester Werte kann INSERT auch das Ergebnis einer Abfrage einfügen – wieder eine Kapselung. Dann fällt VALUES weg:'),
  code('Alle User aus Kiel folgen dem User mit der id 71', "INSERT INTO follows (follower_id, following_id)\nSELECT id, 71\nFROM users\nWHERE city = 'Kiel'", false),
  task(9, 'Notiere für die folgenden Aufgaben einen SQL-Befehl und führe ihn aus. Kontrolliere das Ergebnis in der App.', [
    a('Füge eine fiktive Person zu deiner Datenbank hinzu.', "INSERT INTO users (username, name, email, password, gender, birthday, city, country, centimeter) VALUES ('guenther37', 'Günther Müller', 'guenther@mail.test', '123passwort', 'male', '1987-07-07', 'Kiel', 'Deutschland', 178)"),
    a('Überprüfe, welche id diese Person bekommen hat, obwohl du sie nicht angegeben hast. Welche Werte stehen in role und created_at? Woher kommen sie? (Schau ins Diagramm.)', "SELECT id, role, created_at FROM users WHERE username = 'guenther37'", 'id fortlaufend (AUTO_INCREMENT), role = user (DEFAULT), created_at = jetzt (DEFAULT CURRENT_TIMESTAMP).', { pre: "INSERT INTO users (username, name, password) VALUES ('guenther37', 'Günther Müller', '123passwort')" }),
    a('Melde dich in der App mit dieser Person an. Es klappt nicht! Aber warum? Finde heraus, woran es liegt.', ["SELECT username, password FROM users WHERE username IN ('guenther37', 'pixelpaul')", "UPDATE users SET password = PASSWORD_HASH('123passwort') WHERE username = 'guenther37'"], 'Bei pixelpaul steht ein bcrypt-Hash ($2a$08$…), bei der neuen Person der Klartext. Die App vergleicht nur Hashes. Gespräch: Warum speichert man Passwörter nie im Klartext? Siehe Kasten.', { pre: "INSERT INTO users (username, name, password) VALUES ('guenther37', 'Günther Müller', '123passwort')" }),
    a('Schreibe unter ein Foto deiner Wahl Kommentare im Namen von mindestens drei verschiedenen Usern. Schau in der App nach: Kann man erkennen, dass die Kommentare nicht echt sind?', "INSERT INTO comments (user_id, photo_id, body) VALUES (8, 1, 'Wow, wie schön!'), (15, 1, 'Bestes Foto 🔥'), (22, 1, 'Das will ich auch!')", 'Nicht zu erkennen. Gespräch: Wer kann so etwas auf echten Plattformen? Fake-Kommentare und gekaufte Follower.'),
    a('Gönn dir ein paar mehr Follower: Alle User aus München sollen deinem Admin-Konto folgen. Erstelle dafür keine neuen Personen.', "INSERT INTO follows (follower_id, following_id) SELECT id, 71 FROM users WHERE city = 'München'", 'Die eigene id zuerst mit SELECT herausfinden (hier 71). Folgt schon jemand, bricht der Befehl mit Fehler ab (zusammengesetzter Primärschlüssel).', { pre: "INSERT INTO users (id, username, password) VALUES (71, 'admin', 'x')" }),
    a('Lass 20 User ein Foto deiner Wahl mit 😂 (laugh) liken. Was passiert, wenn einer von ihnen das Foto schon gelikt hat? Lies die Fehlermeldung und erkläre sie mit dem Diagramm.', "INSERT INTO likes (user_id, photo_id, kind) SELECT id, 5, 'laugh' FROM users WHERE id NOT IN (SELECT user_id FROM likes WHERE photo_id = 5) LIMIT 20", 'Ohne NOT IN: Fehler wegen des Primärschlüssels (user_id, photo_id) – jede Kombination darf es nur einmal geben.')
  ]),
  h3('6.2 Verändern'),
  p('Zum Verändern von Daten wird der **UPDATE**-Befehl genutzt. Hierbei können einzelne Attribute beliebig neu besetzt werden. Bei welchen Objekten die Daten geändert werden, wird im WHERE-Befehl definiert. **Ohne WHERE werden alle Zeilen geändert!**'),
  syntax('Alle Hamburger ziehen nach Kiel, weil besser', 'UPDATE <Klasse>\nSET <Attribut> = <neuer Wert>,\n    <Attribut> = <neuer Wert>, …\nWHERE <Bedingung>', "UPDATE users\nSET city = 'Kiel'\nWHERE city = 'Hamburg'", false),
  task(10, 'Notiere für die folgenden Aufgaben einen SQL-Befehl und führe ihn aus.', [
    a('Versuche, das Geschlecht aller User aus Dresden auf „keine Angabe“ zu setzen. Lies die Fehlermeldung: Welche Werte sind erlaubt? Wo im Diagramm steht das? Warum ist so eine Einschränkung sinnvoll?', "UPDATE users SET gender = 'keine Angabe' WHERE city = 'Dresden'", 'Fehler: gender ist ein ENUM mit male, female, diverse. „Keine Angabe“ wäre NULL.', { error: true }),
    a('Ändere die Stadt der zuletzt hinzugefügten Person auf Tokio und das Land auf Japan. Die id kannst du mit einem extra SELECT-Befehl ermitteln – oder mit einer Unterabfrage.', "UPDATE users SET city = 'Tokio', country = 'Japan' WHERE id = (SELECT MAX(id) FROM users)", 'In MySQL ginge die Unterabfrage auf dieselbe Tabelle nicht – in YourSozialNet schon.'),
    a('Suche dir 10 Bilder von anderen Usern deiner Datenbank aus und mache sie zu deinen Bildern. Wie sieht dein Profil danach aus?', 'UPDATE photos SET user_id = 71 WHERE id IN (3, 17, 24, 38, 51, 66, 72, 90, 104, 120)', 'Likes und Kommentare wandern mit – sie hängen am Foto, nicht am User.', { pre: "INSERT INTO users (id, username, password) VALUES (71, 'admin', 'x')" }),
    a('Lenke alle Likes auf eines deiner Bilder um. Warum klappt das nicht? *Tipp: Schau dir den Primärschlüssel von likes an.* Schaffst du es, wenigstens die Likes umzulenken, die möglich sind?', ["UPDATE likes SET photo_id = 5", "UPDATE likes SET photo_id = 5 WHERE user_id NOT IN (SELECT user_id FROM likes WHERE photo_id = 5) AND (user_id, photo_id) IN (SELECT user_id, MIN(photo_id) FROM likes GROUP BY user_id)"], 'Der erste Befehl scheitert: Jeder User hat viele Likes, nach dem UPDATE gäbe es (user_id, 5) mehrfach. Die zweite Lösung nimmt je User nur ein Like und lässt User aus, die Foto 5 schon liken.', { star: true, error: true }),
    a('Ersetze die Körpergröße aller User durch `FLOOR(RAND() * 50) + 150`. Was erzeugt dieser Befehl? Führe ihn zweimal aus und vergleiche.', 'UPDATE users SET centimeter = FLOOR(RAND() * 50) + 150', 'Zufällige Größen zwischen 150 und 199 cm – bei jedem Ausführen andere.'),
    a('User, die ihre Boote fotografiert haben, möchten ihren Wohnort durch „auf hoher See“ ersetzen. Zwei Admins schlagen verschiedene Befehle vor (rechts). Welcher erfüllt den Wunsch besser? Prüfe es erst mit SELECT.', ["SELECT DISTINCT users.username FROM users JOIN photos ON photos.user_id = users.id JOIN photo_tag ON photo_tag.photo_id = photos.id JOIN tags ON tags.id = photo_tag.tag_id WHERE tags.name = 'boot'", "UPDATE users SET city = 'auf hoher See' WHERE id IN (SELECT photos.user_id FROM photos JOIN photo_tag ON photo_tag.photo_id = photos.id JOIN tags ON tags.id = photo_tag.tag_id WHERE tags.name = 'boot')"], 'Über den Tag „boot“: finn.kielwasser, werner.angelt, mikkel.s. Die Textsuche trifft auch fitbyfee („Bootcamp im Park“).',
      { compare: ["UPDATE users\nSET city = 'auf hoher See'\nWHERE id IN\n  (SELECT user_id FROM photos\n   WHERE description\n     LIKE '%boot%')", "UPDATE users\nSET city = 'auf hoher See'\nWHERE id IN\n  (SELECT photos.user_id\n   FROM photos\n   JOIN photo_tag ON …\n   JOIN tags ON …\n   WHERE tags.name = 'boot')"] }),
    a('hugo.ranked hat sein Passwort vergessen. Setze es neu und melde dich danach als Hugo an.', "UPDATE users SET password = PASSWORD_HASH('neu123') WHERE username = 'hugo.ranked'"),
    a('Der Sicherheitsbeauftragte vermutet, dass manche User sehr schwache Passwörter haben. Finde mit `PASSWORD_VERIFY` heraus, wer „123456“ benutzt. Probiere auch „passwort“ und „hallo123“. Erkläre: Warum kann man den Hash nicht zurückrechnen, die Passwörter aber trotzdem finden?', ["SELECT username FROM users WHERE PASSWORD_VERIFY('123456', password)", "SELECT username FROM users WHERE PASSWORD_VERIFY('passwort', password) OR PASSWORD_VERIFY('hallo123', password)"], '123456: coach_ralf, werner.angelt; passwort: hugo.ranked; hallo123: ida.hsn. Man rät Passwörter und vergleicht die Hashes – bei häufigen Passwörtern klappt das schnell. Darum: lange, eigene Passwörter.')
  ]),
  page(),
  h3('6.3 Löschen'),
  p('Löschen funktioniert auf die gleiche Art und Weise, nur ohne den SET-Befehl. Auch hier gilt: **Ohne WHERE wird alles gelöscht!**'),
  syntax('Alle Fotos des Users mit der id 3 werden gelöscht', 'DELETE FROM <Klasse>\nWHERE <Bedingung>', 'DELETE FROM photos\nWHERE user_id = 3', false),
  box('denk', 'Was passiert mit den Kindern?', 'Löschst du ein Foto, gehören die Likes und Kommentare daran zu einem Foto, das es nicht mehr gibt. In YourSozialNet sind die Fremdschlüssel deshalb mit **ON DELETE CASCADE** angelegt: Die abhängigen Zeilen werden automatisch mitgelöscht.'),
  task(11, 'Notiere für die folgenden Aufgaben einen SQL-Befehl. Prüfe vorher mit SELECT, was du löschst!', [
    a('Lösche alle Lisas aus deiner Datenbank. Vergleiche vorher `name LIKE \'Lisa%\'` und `name LIKE \'%Lisa%\'`. Wie viele Lisas gibt es wirklich?', ["SELECT name FROM users WHERE name LIKE '%Lisa%'", "DELETE FROM users WHERE name LIKE 'Lisa%'"], '%Lisa% trifft auch Elisa Brandt und Annalisa Ferri. Lisas: Lisa Meier und Lisa-Marie Kraft.'),
    a('Lösche alle Bilder von Alexander Achen. Was passiert mit den Likes und Kommentaren an seinen Bildern?', "DELETE FROM photos WHERE user_id = (SELECT id FROM users WHERE name = 'Alexander Achen')", 'CASCADE: Likes, Kommentare und Tag-Zuordnungen seiner Fotos verschwinden mit.'),
    a('Lösche alles, was mit Henriette Zimmerman in Verbindung steht, ihren Account jedoch nicht: alle Fotos, alle Kommentare, alle Follower, alle Abos und ihr Profilbild. *Tipp: Das Profilbild ist kein eigenes Objekt.*', ["DELETE FROM photos WHERE user_id = 19", "DELETE FROM comments WHERE user_id = 19", "DELETE FROM follows WHERE follower_id = 19 OR following_id = 19", "DELETE FROM likes WHERE user_id = 19", "UPDATE users SET avatar = NULL WHERE id = 19"], 'id von wuffi_und_ich zuerst mit SELECT ermitteln (hier 19). Das Profilbild ist ein Attribut → UPDATE auf NULL, kein DELETE.'),
    a('Lösche alle Personen unter 18. Wie viele Personen waren das? Prüfe vorher, ob noah.sz dabei ist (vgl. Aufgabe 7 m).', `DELETE FROM users WHERE ${AGE} < 18`, 'Mit der einfachen Formel 22, richtig wären 23 (Noah). Achtung: Danach fehlen in Kapitel 7 u. a. tim.richter und ida.hsn – Lehrkraft füllt die Daten vorher neu.'),
    a('Verschwörungstheorien über Echsenmenschen werden in deinem Netzwerk nicht geduldet. Lösche alle Kommentare der Echsen-Theoretiker – aber nur diese! Sofias harmlose Bartagame und die Antworten anderer User sollen bleiben. Vergleiche dazu die beiden Befehle rechts mit SELECT (vgl. Aufgabe 5 k).', ["SELECT COUNT(*) FROM comments WHERE body LIKE '%Echse%'", "DELETE FROM comments WHERE body LIKE '%Echse%' AND user_id IN (SELECT id FROM users WHERE username IN ('mondrueckseite', 'echsenwache'))"], 'Nur nach Text zu filtern löscht zu viel (26 Treffer), nur nach User löscht auch Kommentare ohne Echsen. Am besten beides kombinieren – und vorher die Trolle per SELECT bestimmen.',
      { compare: ["DELETE FROM comments\nWHERE body LIKE '%Echse%'", "DELETE FROM comments\nWHERE body LIKE '%Echse%'\n  AND user_id IN\n  (SELECT id FROM users\n   WHERE username IN\n   ('mondrueckseite',\n    'echsenwache'))"] }),
    a('Lösche den User aaron183. Zähle vorher und nachher alle Kommentare. Warum fehlen danach Kommentare, obwohl du in comments gar nichts gelöscht hast?', ['SELECT COUNT(*) FROM comments', "DELETE FROM users WHERE username = 'aaron183'", 'SELECT COUNT(*) FROM comments'], 'ON DELETE CASCADE: Mit dem User verschwinden seine 18 Kommentare, Likes und Follows.')
  ]),

  page(),
  /* ═══════════════════ 7. Analytics ═══════════════════ */
  h2('7. Analytics'),
  p('YourSozialNet hat einiges über euch gespeichert – ohne dass ihr gefragt wurdet. Jedes Mal, wenn ein User das Netzwerk öffnet, beginnt eine **Session** (ein Besuch). Dabei merkt sich das Netzwerk, mit welchem Gerät, Browser und Bildschirm, von welcher IP-Adresse, in welcher Sprache und Zeitzone ihr unterwegs seid. Und jedes Foto, das ihr im Feed anschaut, wird als **View** gespeichert – mit der Zeit, die ihr darauf geblieben seid.'),
  img('db_analytics', 11.5, 'Abb. 12: sessions und views'),
  table(['Attribut', 'Bedeutung'], [
    ['`sessions.started_at`, `ended_at`', 'Beginn und Ende des Besuchs'],
    ['`sessions.ip`', 'IP-Adresse: ungefährer Ort; gleiche IP = gleiches WLAN'],
    ['`browser`, `os`, `device_type`, `device`', 'Browser, Betriebssystem, phone/tablet/desktop, Gerätemodell'],
    ['`screen_width`, `language`, `timezone`, `dark_mode`', 'Bildschirm, Sprache, Zeitzone, Hell/Dunkel'],
    ['`allow_location`, `allow_camera`, …', 'Hat der User auf „Zulassen“ (1) oder „Blockieren“ (0) getippt?'],
    ['`views.duration_ms`', 'wie lange ein Foto angeschaut wurde (in Millisekunden)'],
    ['`views.feed`, `position`, `ended_by`', 'in welchem Feed, an welcher Stelle, und wie es endete (weiter wischen, liken, kommentieren …)']
  ], [3800, 5800]),
  box('denk', 'Nur nachgebaut', 'Die Fenster „… möchte deinen Standort verwenden“ sind in YourSozialNet nur nachgebaut: Gespeichert wird nur, was ihr angetippt habt – gemessen wird nichts. Eine echte App hätte nach „Zulassen“ euren genauen Ort bekommen.'),
  task(12, 'Findet so viel wie möglich über die User heraus – in eurem Netzwerk oder über den Kurs im Klassen-Netz. Es gibt keine feste Lösung: Jede und jeder darf etwas anderes entdecken. Nutzt dazu nicht nur sessions und views, sondern auch alle bekannten Tabellen. Notiert eure SQL-Befehle und was ihr herausgefunden habt.', [], {
    open: true,
    ideas: [
      '**Browser und Geräte:** Wer nutzt welchen Browser, welches Handy, welches Betriebssystem?',
      '**IP-Adressen:** Wer war am selben Ort? Wer hat auffällig viele verschiedene IPs?',
      '**Online-Zeiten:** Wann ist wer online – auch nachts?',
      '**Verbindungen:** WLAN oder Mobilfunk? Hell- oder Dunkelmodus? Sprache, Zeitzone?',
      '**Erlaubnisse:** Wer hat Standort, Kamera, Mikrofon „zugelassen“?',
      '**Interessen:** Welche Fotos schaut jemand am längsten an – auch ohne sie zu liken?',
      '**Eine Person:** Was weiß das Netzwerk alles über eine bestimmte Person (mit ihrem Einverständnis!)?'
    ],
    examples: [
      a('Beliebteste Desktop-Browser', "SELECT browser, COUNT(*) AS sessions FROM sessions WHERE device_type = 'desktop' GROUP BY browser ORDER BY sessions DESC"),
      a('Gleiche IP = gleicher Ort', 'SELECT ip, GROUP_CONCAT(DISTINCT users.username) AS user FROM sessions JOIN users ON sessions.user_id = users.id GROUP BY ip HAVING COUNT(DISTINCT sessions.user_id) > 1', 'lasse.ld und larsole teilen eine Heim-IP. Im Klassen-Netz haben alle die Schul-IP.'),
      a('Viele IPs (VPN?)', 'SELECT users.username, COUNT(DISTINCT sessions.ip) AS ips FROM sessions JOIN users ON sessions.user_id = users.id GROUP BY users.id HAVING COUNT(DISTINCT sessions.ip) > 5', 'vanlife_tomasz (9) und der Bot gewinn_jetzt_2026 (14).'),
      a('Nachts online', `SELECT DISTINCT users.username, ${AGE} AS jahre FROM sessions JOIN users ON sessions.user_id = users.id WHERE HOUR(sessions.started_at) BETWEEN 1 AND 3`, 'u. a. tim.richter (14) und ida.hsn (13) – passt zur Werbung „Nachtschicht Snacks“.'),
      a('Verbindung und Hell/Dunkel', 'SELECT connection, dark_mode, COUNT(*) FROM sessions GROUP BY connection, dark_mode'),
      a('Erlaubnisse', 'SELECT allow_location, COUNT(*) FROM sessions GROUP BY allow_location'),
      a('Interessen über die Verweildauer (tim.richter)', "SELECT tags.name, AVG(views.duration_ms) / 1000 AS sekunden FROM views JOIN users ON views.user_id = users.id JOIN photo_tag ON photo_tag.photo_id = views.photo_id JOIN tags ON tags.id = photo_tag.tag_id WHERE users.username = 'tim.richter' GROUP BY tags.id ORDER BY sekunden DESC LIMIT 5", 'Gaming-Tags weit vorn, obwohl er kaum liked.')
    ],
    note: 'Im Klassen-Netz braucht man Admin-Rechte (`UPDATE users SET role = \'admin\' WHERE …`). Abschluss: „Was weiß das Netzwerk über mich?“ auslösen.'
  }),

  page(),
  /* ═══════════════════ 8. Werbung ═══════════════════ */
  h2('8. Werbung'),
  { t: 'side', file: 'abb_werbung_cap', cm: 9.6, left: [
  p('Ein richtiges soziales Netzwerk kommt nicht ohne Werbung aus – damit verdient es sein Geld. Jedoch bekommen nicht alle die gleiche Werbung. Je nach Interessen wird die Werbung möglichst **personalisiert** geschaltet. Und woher kennt das Netzwerk die Interessen? Aus genau den Daten, die du in den letzten Kapiteln abgefragt hast.')
  ] },
  table(['Art (kind)', 'Wo erscheint sie?', 'Was braucht sie?'], [
    ['**Feed-Werbung** (`feed`)', 'als eigene Karte zwischen den Fotos im Feed, z. B. nach jedem 5. Foto', 'Bild, Titel, Text, Knopf und **„Wem?“**'],
    ['**Foto-Label** (`label`)', 'direkt an bestimmten Fotos und über deren Kommentaren', 'Bild, Titel, Text, **„Wem?“** und **„An welchen Fotos?“**'],
    ['**Beworbener Post** (`boost`)', 'ein normales Foto rutscht im Feed „Für dich“ ganz nach vorn, mit „Gesponsert“', '**„Wem?“** und **„Was?“** (welche Fotos)']
  ], [2500, 4100, 3000]),
  { t: 'side', file: 'db_ads', cm: 7.2, caption: 'Abb. 14: Die Klasse ads', left: [
  p('Auch die Werbung ist in der Datenbank organisiert – in der Klasse **ads**:'),
  list(
    '**id** – fortlaufende Nummer als Primärschlüssel; **user_id ↑** – welcher Admin die Kampagne angelegt hat (NULL = die Plattform selbst)',
    '**name** – Name der Kampagne zum Wiederfinden; **kind** – feed, label oder boost',
    '**title**, **body**, **image**, **button** – was auf der Anzeige steht',
    '**target_sql** – **„Wem?“**: ein SQL-Befehl, der bestimmt, welche User die Werbung sehen',
    '**content_sql** – **„An welchen Fotos?“** (Label) bzw. **„Was?“** (Boost): ein SQL-Befehl, der eine Liste von Foto-ids liefert',
    '**active** – ist die Kampagne eingeschaltet?; **created_at** – wann sie angelegt wurde'
  )
  ] },
  h3('„Wem?“ – die Zielgruppe als SQL-Befehl'),
  p('Der Befehl in target_sql kann zwei Formen haben. Ist er leer, sehen **alle** User die Werbung.'),
  table(['Form', 'So wird geprüft'], [
    ['**Mit `$user`**', '`$user` ist ein Platzhalter für die id des Users, der gerade scrollt. Der Befehl wird für jeden User einzeln ausgeführt und liefert **einen Wert**: wahr (1) = Werbung passt, falsch (0) oder kein Ergebnis = passt nicht.'],
    ['**Ohne `$user`**', 'Der Befehl liefert eine **Liste von User-ids** (erste Spalte). Ist der User in der Liste, passt die Werbung.']
  ], [2300, 7300]),
  code('Form 1 (mit $user): Werbung nur für Userinnen – „Glow Skin“', "SELECT CASE gender\n         WHEN 'female' THEN true\n         ELSE false\n       END\nFROM users\nWHERE id = $user", false),
  p('`CASE … WHEN … THEN … ELSE … END` funktioniert wie ein if-else in Java: Ist gender gleich „female“, ist das Ergebnis true, sonst false.'),
  code('Form 2 (Liste): Alle User, die mindestens 3 Gaming-Fotos gelikt haben – „VOLTA Energy“', "SELECT likes.user_id\nFROM likes\nJOIN photo_tag ON photo_tag.photo_id = likes.photo_id\nJOIN tags      ON tags.id = photo_tag.tag_id\nWHERE tags.name IN ('gaming', 'setup', 'stream')\nGROUP BY likes.user_id\nHAVING COUNT(*) >= 3", true),
  code('„An welchen Fotos?“: Alle Fotos von Haustieren – „Pfotenglück“', "SELECT photo_tag.photo_id\nFROM photo_tag\nJOIN tags ON tags.id = photo_tag.tag_id\nWHERE tags.name IN ('hund', 'katze', 'hamster', 'haustier')", true),
  task(13, 'Neben dem Betreiben deines unglaublich erfolgreichen sozialen Netzwerks leitest du auch die Werbeabteilung.', [
    a('Schau dir die Kampagnen in deinem Netzwerk an (`SELECT * FROM ads` oder Reiter **Werbung**). Wer sieht sie und warum? Welche findest du problematisch?', 'SELECT name, kind, target_sql, content_sql FROM ads', 'Problematisch z. B. „Nachtschicht Snacks“ (nachts online – oft Minderjährige) und „Wahrheit.tv“ (Flacherde-Posts für Leute, die so etwas liken).'),
    a('Denkt euch einen Werbekunden aus (Produkt, Firma, Partei oder Organisation) und überlegt, welche User-Gruppen ihr wie ansprechen wollt.', null),
    a('Entwickelt **drei Werbungen** für euren Kunden – eine **Feed-Werbung**, ein **Foto-Label** und einen **beworbenen Post**, jede mit eigener Zielgruppe per SQL. Testet sie in eurem Netzwerk (Probelauf, Vorschau) und schaltet sie dann im **Klassen-Netz**: Möglichst jede Person im Kurs soll eine passende Werbung bekommen.', null, 'Im Klassen-Netz brauchen die Gruppen Admin-Rechte und es gibt dort keine Dummy-User – die Zielgruppen müssen auf die echten Daten des Kurses passen.')
  ])
];
