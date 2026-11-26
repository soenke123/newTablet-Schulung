import sqlite3
d=sqlite3.connect(':memory:')
d.executescript("""
CREATE TABLE Kunde(Vorname VARCHAR(30), Nachname VARCHAR(30), Alter_ INT, Telefon INT, Wohnort VARCHAR(40), PRIMARY KEY(Vorname,Nachname));
CREATE TABLE Autor(Id INT PRIMARY KEY, Name VARCHAR(60), Nationalitaet VARCHAR(30));
CREATE TABLE Buch(ISBN VARCHAR(17) PRIMARY KEY, Titel VARCHAR(80), Autor_Id INT REFERENCES Autor(Id), Genre VARCHAR(60), Preis DECIMAL(5,2), Verlag VARCHAR(40), Verlagsort VARCHAR(40), Bestand INT);
CREATE TABLE Kauf(Nr INT PRIMARY KEY, Vorname VARCHAR(30), Nachname VARCHAR(30), ISBN VARCHAR(17), Datum DATE);
""")
K=[("Bastian","Bux",12,1712233445,"Hamburg"),("Mia","Kaya",17,1523456789,"Kiel"),("Jonas","Weber",34,405123456,"Hamburg"),("Anna","Schmidt",68,451234567,"Lübeck"),("Leonie","Park",15,1605551234,"Hamburg")]
A=[(1,"Michael Ende","deutsch"),(2,"J. K. Rowling","britisch"),(3,"Cornelia Funke","deutsch"),(4,"Terry Pratchett & Neil Gaiman","britisch"),(5,"Robert Galbraith","britisch"),(6,"Kirsten Boie","deutsch")]
B=[("978-3-522-20260-1","Die unendliche Geschichte",1,"Fantasy, Jugendbuch",22.00,"Thienemann","Stuttgart",3),
("978-3-522-17684-2","Momo",1,"Fantasy, Kinderbuch",15.00,"Thienemann","Stuttgart",5),
("978-3-551-55167-3","Harry Potter und der Stein der Weisen",2,"Fantasy, Jugendbuch",20.00,"Carlsen","Hamburg",4),
("978-3-551-55168-4","Harry Potter und die Kammer des Schreckens",2,"Fantasy",20.00,"Carlsen","Hamburg",2),
("978-3-7915-0465-5","Tintenherz",3,"Fantasy, Jugendbuch",24.00,"Dressler","Hamburg",1),
("978-3-453-43123-6","Ein gutes Omen",4,"Fantasy, Humor",12.00,"Heyne","München",2),
("978-3-7645-0567-7","Der Ruf des Kuckucks",5,"Krimi",14.00,"Blanvalet","München",1),
("978-3-7891-0812-8","Sommerby",6,"Kinderbuch",15.00,"Oetinger","Hamburg",3)]
U=[(1,"Bastian","Bux","978-3-522-20260-1","2026-03-02"),(2,"Bastian","Bux","978-3-7915-0465-5","2026-03-02"),(3,"Mia","Kaya","978-3-551-55167-3","2026-04-11"),(4,"Anna","Schmidt","978-3-522-20260-1","2026-05-20"),(5,"Mia","Kaya","978-3-453-43123-6","2026-06-01"),(6,"Jonas","Weber","978-3-7645-0567-7","2026-06-01"),(7,"Leonie","Park","978-3-551-55168-4","2026-07-15"),(8,"Bastian","Bux","978-3-522-17684-2","2026-09-03")]
d.executemany("insert into Kunde values(?,?,?,?,?)",K);d.executemany("insert into Autor values(?,?,?)",A);d.executemany("insert into Buch values(?,?,?,?,?,?,?,?)",B);d.executemany("insert into Kauf values(?,?,?,?,?)",U)
Q={"a":"SELECT Titel, Preis FROM Buch WHERE Preis < 20",
"b":"SELECT Titel, Genre, Preis FROM Buch WHERE Genre LIKE '%Fantasy%' ORDER BY Preis DESC",
"c":"SELECT Autor.Name, COUNT(*) AS Anzahl_Buecher FROM Autor JOIN Buch ON Buch.Autor_Id = Autor.Id GROUP BY Autor.Name",
"d":"SELECT Kauf.Vorname, Kauf.Nachname, Buch.Titel FROM Kauf JOIN Buch ON Kauf.ISBN = Buch.ISBN JOIN Autor ON Buch.Autor_Id = Autor.Id WHERE Autor.Name = 'Michael Ende'",
"e":"SELECT Kunde.Vorname, Kunde.Nachname, SUM(Buch.Preis) AS Umsatz FROM Kunde JOIN Kauf ON Kauf.Vorname = Kunde.Vorname AND Kauf.Nachname = Kunde.Nachname JOIN Buch ON Buch.ISBN = Kauf.ISBN GROUP BY Kunde.Vorname, Kunde.Nachname ORDER BY Umsatz DESC"}
for k,q in Q.items(): print(k,d.execute(q).fetchall())
