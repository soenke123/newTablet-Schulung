"""Bereitet Sönkes Wesen-Bilder (Kreaturen/) für die Insel auf -> wesen/.

Je Bild: auf den sichtbaren Teil zuschneiden, je Stufe auf eine feste
Größe bringen und unten mittig auf ein Quadrat (N x N) setzen — so
stehen alle Wesen mit den Füßen auf derselben Linie (96 % der Höhe)
und werden mit jeder Stufe größer.

Schlafende Fassung (<name>_schlaf.png, freigestellt mit freistellen.py):
bekommt dieselbe sichtbare Fläche wie das wache Wesen (zusammengerollt
ist es breiter und flacher, soll aber nicht größer oder kleiner wirken),
höchstens so groß, dass es ins Quadrat passt. Ergebnis <name>_schlaf.webp.
Genauso die fliegende (<name>_flug.png, Vögel) und die stehende Fassung
(<name>_steh.png, Waldfeen, deren Hauptbild schon schwebt).
Aufruf: python3 wesen/aufbereiten.py
"""
import os
from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
QUELLE = os.path.join(HIER, '..', 'Kreaturen')
N = 320
GROESSE = {0: 0.46, 1: 0.56, 2: 0.68, 3: 0.80, 4: 0.92, 5: 1.0}   # längste Seite je Stufe (Anteil von N)
FUSS = 0.96
ZUSATZ = ('_schlaf', '_flug', '_steh')   # Fassungen neben dem wachen Bild


def zuschneiden(pfad):
    im = Image.open(pfad).convert('RGBA')
    a = im.split()[3].point(lambda v: 255 if v > 24 else 0)
    return im.crop(a.getbbox())


def flaeche(im):
    return sum(im.split()[3].histogram()[25:])


def setzen(im, k, ziel):
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    out.paste(im, ((N - im.width) // 2, round(N * FUSS) - im.height), im)
    out.save(os.path.join(HIER, ziel), 'WEBP', quality=86, method=6)
    return im.size


for f in sorted(os.listdir(QUELLE)):
    if not f.endswith('.png') or f.endswith(tuple(z + '.png' for z in ZUSATZ)):
        continue
    stufe = int(f[0])
    im = zuschneiden(os.path.join(QUELLE, f))
    k = GROESSE[stufe] * N / max(im.size)
    name = f.replace('0_Ei_', 'ei').replace('1_Baby', 'baby').replace('2_klein_', 'k_').replace('3_mittel_', 'm_') \
            .replace('4_gross_', 'g_').replace('5_fertig_', 'f_').replace('.png', '')
    print(name, setzen(im, k, name + '.webp'))
    for z in ZUSATZ:
        neben = os.path.join(QUELLE, f.replace('.png', z + '.png'))
        if not os.path.exists(neben):
            continue
        zs = zuschneiden(neben)
        ks = k * (flaeche(im) / flaeche(zs)) ** 0.5
        ks = min(ks, N * 0.98 / zs.width, N * FUSS * 0.98 / zs.height)
        print(name + z, setzen(zs, ks, name + z + '.webp'))
