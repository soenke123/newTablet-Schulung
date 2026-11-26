"""Rechnet die SQL-Lösungen der Klausur gegen daten.json nach.  python3 pruefen.py"""
import json, sqlite3, os
D = json.load(open(os.path.join(os.path.dirname(__file__), 'daten.json'), encoding='utf-8'))
db = sqlite3.connect(':memory:')
for t, v in D.items():
    db.execute(f'CREATE TABLE {t} ({", ".join(c + (" REAL" if c == "Preis" else "") for c in v["cols"])})')
    db.executemany(f'INSERT INTO {t} VALUES ({",".join("?" * len(v["cols"]))})', v['rows'])
Q = {
 '3a': "SELECT Titel, Preis FROM Buch WHERE Preis < 20",
 '3b': "SELECT Titel, Genre, Preis FROM Buch WHERE Genre LIKE '%Fantasy%' ORDER BY Preis DESC",
 '3c': "SELECT Autor.Name, COUNT(*) AS Anzahl_Buecher FROM Autor JOIN Buch_Autor ON Buch_Autor.Autor_Id = Autor.Id GROUP BY Autor.Name",
 '3d': "SELECT Kunde.Vorname, Kunde.Nachname, Buch.Titel FROM Kunde JOIN Kauf ON Kauf.Vorname = Kunde.Vorname JOIN Buch ON Buch.ISBN = Kauf.ISBN JOIN Buch_Autor ON Buch_Autor.ISBN = Buch.ISBN JOIN Autor ON Autor.Id = Buch_Autor.Autor_Id WHERE Autor.Name = 'Michael Ende'",
 '3e': "SELECT Kunde.Vorname, Kunde.Nachname, SUM(Buch.Preis) AS Umsatz FROM Kunde JOIN Kauf ON Kauf.Vorname = Kunde.Vorname JOIN Buch ON Buch.ISBN = Kauf.ISBN GROUP BY Kunde.Vorname, Kunde.Nachname ORDER BY Umsatz DESC",
 '5 Ecken': "SELECT Sensor.Ort, COUNT(DISTINCT Bewegung.Geraet) AS Geraete FROM Sensor LEFT JOIN Bewegung ON Bewegung.Sensor_Id = Sensor.Id GROUP BY Sensor.Ort ORDER BY Geraete DESC",
 '5 Kasse': "SELECT Bewegung.Geraet, Bewegung.Zeitpunkt, Kauf.Vorname FROM Bewegung JOIN Kauf ON substr(Kauf.Zeitpunkt,1,10) = substr(Bewegung.Zeitpunkt,1,10) AND Kauf.Zeitpunkt >= Bewegung.Zeitpunkt AND Kauf.Zeitpunkt <= datetime(Bewegung.Zeitpunkt, '+2 minutes') WHERE Bewegung.Sensor_Id = 5",
}
for k, q in Q.items():
    print(k, db.execute(q).fetchall())
