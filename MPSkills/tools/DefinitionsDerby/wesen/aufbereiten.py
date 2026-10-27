"""Bereitet Sönkes Wesen-Bilder (Kreaturen/) für die Insel auf -> wesen/.

Je Bild: auf den sichtbaren Teil zuschneiden, je Stufe auf eine feste
Größe bringen und unten mittig auf ein Quadrat (N x N) setzen — so
stehen alle Wesen mit den Füßen auf derselben Linie (96 % der Höhe)
und werden mit jeder Stufe größer. Aufruf: python3 wesen/aufbereiten.py
"""
import os, sys
from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
QUELLE = os.path.join(HIER, '..', 'Kreaturen')
N = 320
GROESSE = {0: 0.46, 1: 0.56, 2: 0.68, 3: 0.80, 4: 0.92, 5: 1.0}   # längste Seite je Stufe (Anteil von N)
FUSS = 0.96

for f in sorted(os.listdir(QUELLE)):
    if not f.endswith('.png'):
        continue
    stufe = int(f[0])
    im = Image.open(os.path.join(QUELLE, f)).convert('RGBA')
    a = im.split()[3].point(lambda v: 255 if v > 24 else 0)
    im = im.crop(a.getbbox())
    k = GROESSE[stufe] * N / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    out.paste(im, ((N - im.width) // 2, round(N * FUSS) - im.height), im)
    name = f.replace('0_Ei_', 'ei').replace('1_Baby', 'baby').replace('2_klein_', 'k_').replace('3_mittel_', 'm_') \
            .replace('4_gross_', 'g_').replace('5_fertig_', 'f_')
    out.save(os.path.join(HIER, name.replace('.png', '.webp')), 'WEBP', quality=86, method=6)
    print(name, im.size)
