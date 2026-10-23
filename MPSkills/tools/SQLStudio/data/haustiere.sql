-- Haustiere — die Einstiegs-Datenbank von SQL Studio
-- Zwei Tabellen: wer hat welches Tier? Gut für die ersten SELECTs,
-- für WHERE, ORDER BY und den ersten JOIN.

CREATE TABLE besitzer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vorname VARCHAR(40) NOT NULL,
  nachname VARCHAR(40) NOT NULL,
  wohnort VARCHAR(40),
  telefon VARCHAR(20)
);

CREATE TABLE tier (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  art ENUM('Hund','Katze','Kaninchen','Meerschweinchen','Wellensittich','Pferd','Hamster','Schildkröte') NOT NULL,
  rasse VARCHAR(40),
  geburtsjahr INT,
  gewicht_kg DECIMAL(5,2),
  besitzer_id INT,
  FOREIGN KEY (besitzer_id) REFERENCES besitzer(id)
);

INSERT INTO besitzer (id, vorname, nachname, wohnort, telefon) VALUES
  (1, 'Milan', 'Carstens', 'Rendsburg', '0491 924288'),
  (2, 'Leni', 'Koch', 'Preetz', '0473 562283'),
  (3, 'Luis', 'Hansen', 'Heide', '0474 567304'),
  (4, 'Ida', 'Schulz', 'Schleswig', '0468 736098'),
  (5, 'Nele', 'Müller', 'Rendsburg', '0499 615231'),
  (6, 'Can', 'Carstens', 'Flensburg', '0491 743276'),
  (7, 'Leon', 'Petersen', 'Eckernförde', '0473 622899'),
  (8, 'Ben', 'Koch', 'Plön', '0446 554603'),
  (9, 'Jonas', 'Jensen', 'Eckernförde', '0445 767713'),
  (10, 'Ben', 'Vogel', 'Plön', '0443 715484'),
  (11, 'Jonas', 'Becker', 'Heide', '0498 496103'),
  (12, 'Yusuf', 'Meyer', 'Preetz', '0436 568103'),
  (13, 'Malte', 'Hofmann', 'Preetz', '0477 987223'),
  (14, 'Luisa', 'Hoffmann', 'Rendsburg', '0480 342114');

INSERT INTO tier (id, name, art, rasse, geburtsjahr, gewicht_kg, besitzer_id) VALUES
  (1, 'Coco', 'Kaninchen', 'Widder', 2022, 3, 2),
  (2, 'Flocke', 'Schildkröte', 'Griechische Landschildkröte', 2011, 1.03, 2),
  (3, 'Tiger', 'Pferd', 'Holsteiner', 2022, 610.11, 7),
  (4, 'Wuschel', 'Katze', 'Siam', 2016, 4.3, 12),
  (5, 'Nala', 'Meerschweinchen', 'Glatthaar', 2015, 0.84, 12),
  (6, 'Paula', 'Hund', 'Dackel', 2018, 8.63, 13),
  (7, 'Bruno', 'Wellensittich', NULL, 2014, 0.05, 4),
  (8, 'Speedy', 'Hund', 'Schäferhund', 2014, 28.87, 4),
  (9, 'Mimi', 'Hamster', 'Goldhamster', 2017, 0.1, 10),
  (10, 'Kira', 'Hund', 'Dackel', 2009, 9.9, 7),
  (11, 'Simba', 'Pferd', 'Holsteiner', 2014, 596.89, 11),
  (12, 'Hansi', 'Hund', 'Labrador', 2019, 26.63, 2),
  (13, 'Luna', 'Pferd', 'Holsteiner', 2010, 589.16, 4),
  (14, 'Sammy', 'Kaninchen', 'Zwergkaninchen', 2009, 1.44, 7),
  (15, 'Max', 'Katze', 'Siam', 2022, 4.44, 7),
  (16, 'Snoopy', 'Hund', 'Pudel', 2014, 9.73, 8),
  (17, 'Jacky', 'Meerschweinchen', 'Rosette', 2024, 1.03, 2),
  (18, 'Rocky', 'Kaninchen', 'Zwergkaninchen', 2019, 1.78, 8),
  (19, 'Krümel', 'Katze', 'Europäisch Kurzhaar', 2018, 4.89, 1),
  (20, 'Pünktchen', 'Wellensittich', NULL, 2016, 0.03, 14),
  (21, 'Oskar', 'Hund', 'Mischling', 2009, 22.81, 9),
  (22, 'Felix', 'Katze', 'Siam', 2023, 4.06, 2),
  (23, 'Momo', 'Hund', 'Mischling', 2021, 16.9, 14),
  (24, 'Lilly', 'Katze', 'Perser', 2013, 3.11, 6),
  (25, 'Blitz', 'Schildkröte', 'Griechische Landschildkröte', 2012, 0.87, 14),
  (26, 'Balu', 'Hamster', 'Goldhamster', 2023, 0.17, 1),
  (27, 'Lucky', 'Pferd', 'Holsteiner', 2019, 605.73, 4),
  (28, 'Leo', 'Hund', 'Pudel', 2013, 5.25, 2),
  (29, 'Fanny', 'Hamster', 'Goldhamster', 2015, 0.18, 5),
  (30, 'Bello', 'Hamster', 'Goldhamster', 2017, 0.14, NULL),
  (31, 'Coco', 'Hund', 'Beagle', 2022, 11.95, NULL),
  (32, 'Flocke', 'Hund', 'Schäferhund', 2024, 36.47, NULL);
