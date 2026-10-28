"""Stellt Wesen-Bilder mit weißem Hintergrund frei (JPEG → PNG mit Durchsicht).

Für Vorlagen, die als weißes JPEG kommen (die schlafenden, fliegenden
und stehenden Fassungen):
Weiß, das vom Rand her erreichbar ist, wird durchsichtig, dazu größere
weiße Löcher im Inneren (zwischen Schwanz und Körper, unter den Flügeln);
kleine weiße Stellen (Glanzlichter, Augen) bleiben. Am Rand wird das Weiß
aus den Kantenpixeln herausgerechnet, damit kein heller Saum bleibt.

Liegt neben dem Ziel <name>_schlaf.png / _flug.png / _steh.png das wache
<name>.png, wird das Ergebnis auf dessen Maßstab gebracht (gleiche
sichtbare Fläche).

Aufruf: python3 wesen/freistellen.py QUELLE.jpeg ZIEL.png [...]
        (je zwei Pfade: Quelle, Ziel). Braucht numpy, scipy, Pillow.
"""
import os
import re
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

RAND = 3          # Pixel am Bildrand, die immer Hintergrund sind (JPEG-Kante)
LOCH = 0.00004   # weiße Löcher innen ab diesem Anteil der Bildfläche (≈ 40 px) = Hintergrund
SAUM = 2          # so breit wird am Rand weich gerechnet


def freistellen(src, dst):
    rgb = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    h, w, _ = rgb.shape
    mn, mx = rgb.min(2), rgb.max(2)
    weiss = (mn > 226) & (mx - mn < 20)
    weiss[:RAND, :] = weiss[-RAND:, :] = True
    weiss[:, :RAND] = weiss[:, -RAND:] = True
    lab, n = ndimage.label(weiss)
    rand = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    groesse = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    hell = ndimage.mean(mn, lab, index=np.arange(1, n + 1))
    bg = np.zeros(n + 1, bool)
    for i in range(1, n + 1):
        bg[i] = i in rand or (groesse[i - 1] > LOCH * h * w and hell[i - 1] > 247)
    hinter = bg[lab]
    # vereinzelte Krümel (JPEG-Rauschen im Weiß) gehören zum Hintergrund
    lab2, n2 = ndimage.label(~hinter)
    if n2:
        gr2 = ndimage.sum(np.ones_like(lab2), lab2, index=np.arange(1, n2 + 1))
        hinter |= np.isin(lab2, 1 + np.nonzero(gr2 < 40)[0])
    a = np.where(hinter, 0.0, 1.0)
    # weicher Saum: Pixel nahe am Hintergrund bekommen Deckkraft nach ihrem Abstand von Weiß
    ring = ~hinter & ndimage.binary_dilation(hinter, iterations=SAUM)
    abst = np.clip((255 - rgb.mean(2)) / 70.0, 0, 1)
    a = np.where(ring, abst, a)
    # Weiß aus den halbdurchsichtigen Pixeln herausrechnen
    aa = np.maximum(a, 1e-3)[..., None]
    farbe = np.clip((rgb - (1 - aa) * 255) / aa, 0, 255)
    out = np.dstack([farbe, a * 255]).round().astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    im = im.crop(im.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox())
    wach = re.sub(r'_(schlaf|flug|steh)\.png$', '.png', dst)
    if wach != dst and os.path.exists(wach):
        flaeche = lambda b: sum(b.split()[3].histogram()[25:])
        k = (flaeche(Image.open(wach).convert('RGBA')) / flaeche(im)) ** 0.5
        if k < 1:
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    im.save(dst, optimize=True)
    return im.size


if __name__ == '__main__':
    args = sys.argv[1:]
    for s, d in zip(args[::2], args[1::2]):
        print(d, freistellen(s, d))
