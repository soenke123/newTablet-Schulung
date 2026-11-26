"""Rechnet die SQL-Lösungen der Klausur gegen daten.json nach.  python3 pruefen.py"""
import json, sqlite3, os
D = json.load(open(os.path.join(os.path.dirname(__file__), 'daten.json'), encoding='utf-8'))
db = sqlite3.connect(':memory:')
for t, v in D.items():
    db.execute(f'CREATE TABLE {t} ({", ".join(c + (" REAL" if c == "Preis" else "") for c in v["cols"])})')
    db.executemany(f'INSERT INTO {t} VALUES ({",".join("?" * len(v["cols"]))})', v['rows'])
Q = {
 '2a': "SELECT Titel, Preis FROM Buch WHERE Preis < 20",
 '2b': "SELECT Titel, Genre, Preis FROM Buch WHERE Genre LIKE '%Fantasy%' ORDER BY Preis DESC",
 '2c': "SELECT Titel, Verlagsort, Bestand FROM Buch WHERE Verlagsort = 'Hamburg' AND Bestand < 3",
 '2e': "SELECT DISTINCT Kunde.Vorname, Kunde.Nachname FROM Kunde JOIN Kauf ON Kauf.Vorname = Kunde.Vorname WHERE Kauf.Zeitpunkt LIKE '2026-11-30%'",
 '2d': "SELECT Autor.Name, COUNT(*) AS Anzahl_Buecher FROM Autor JOIN Buch_Autor ON Buch_Autor.Autor_Id = Autor.Id GROUP BY Autor.Name",
 '2f': "SELECT Kunde.Vorname, Kunde.Nachname, SUM(Buch.Preis) AS Umsatz FROM Kunde JOIN Kauf ON Kauf.Vorname = Kunde.Vorname JOIN Buch ON Buch.ISBN = Kauf.ISBN GROUP BY Kunde.Vorname, Kunde.Nachname ORDER BY Umsatz DESC",
 '5 Ecken': "SELECT Standort, COUNT(DISTINCT Geraet) AS Geraete FROM Bewegung GROUP BY Standort ORDER BY Geraete DESC",
 '5 Kasse': "SELECT Bewegung.Geraet, Bewegung.Zeitpunkt, Kauf.Vorname FROM Bewegung JOIN Kauf ON Kauf.Zeitpunkt >= Bewegung.Zeitpunkt AND Kauf.Zeitpunkt <= datetime(Bewegung.Zeitpunkt, '+2 minutes') WHERE Bewegung.Standort = 'Kasse'",
}
for k, q in Q.items():
    print(k, db.execute(q).fetchall())
