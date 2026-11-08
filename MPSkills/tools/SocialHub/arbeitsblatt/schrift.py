"""Ersatz für Consolas beim Bauen der PDFs (nur auf dem Rechner, der baut).

LibreOffice kennt Consolas nicht und nimmt sonst DejaVu Sans Mono – die ist
rund 10 % breiter und hat höhere Zeilen. Dann laufen die Code-Kästen länger
als in Word und die Seiten brechen anders um (Sönke: in Word 25 Seiten, im
PDF 28). Dieses Skript baut aus DejaVu Sans Mono eine Schrift namens
„Consolas“ mit den Maßen von Consolas (Zeichenbreite 1126/2048 em,
Ober-/Unterlänge 1521/527) und legt sie nach ~/.local/share/fonts.

    python3 MPSkills/tools/SocialHub/arbeitsblatt/schrift.py      (braucht fonttools)

Nichts davon wird ausgeliefert – Word nutzt das echte Consolas.
"""
import os, sys, glob, subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

SRC = '/usr/share/fonts/truetype/dejavu/'
OUT = os.path.expanduser('~/.local/share/fonts/')
STYLES = {'DejaVuSansMono.ttf': 'Regular', 'DejaVuSansMono-Bold.ttf': 'Bold',
          'DejaVuSansMono-Oblique.ttf': 'Italic', 'DejaVuSansMono-BoldOblique.ttf': 'Bold Italic'}
ADV, ASC, DESC = 1126 / 2048, 1521 / 2048, 527 / 2048   # Consolas, in em

os.makedirs(OUT, exist_ok=True)
for f, style in STYLES.items():
    font = TTFont(SRC + f)
    upm = font['head'].unitsPerEm
    adv_old = font['hmtx']['M'][0]
    sx = ADV * upm / adv_old
    gs = font.getGlyphSet()
    glyf = font['glyf']
    for name in font.getGlyphOrder():
        g = glyf[name]
        if g.isComposite():
            for c in g.components: c.x = round(c.x * sx)
        elif g.numberOfContours > 0:
            pen = TTGlyphPen(gs)
            gs[name].draw(TransformPen(pen, (sx, 0, 0, 1, 0, 0)))
            glyf[name] = pen.glyph()
        w, lsb = font['hmtx'][name]
        font['hmtx'][name] = (round(w * sx), round(lsb * sx))
    a, d = round(ASC * upm), round(DESC * upm)
    font['hhea'].ascent, font['hhea'].descent, font['hhea'].lineGap = a, -d, 0
    os2 = font['OS/2']
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = a, -d, 0
    os2.usWinAscent, os2.usWinDescent = a, d
    os2.xAvgCharWidth = round(ADV * upm)
    if 'hdmx' in font: del font['hdmx']
    if 'LTSH' in font: del font['LTSH']
    for rec in font['name'].names:
        if rec.nameID in (1, 16): rec.string = 'Consolas'
        elif rec.nameID in (2, 17): rec.string = style
        elif rec.nameID == 4: rec.string = 'Consolas ' + style
        elif rec.nameID == 6: rec.string = 'Consolas-' + style.replace(' ', '')
    font.save(OUT + 'ConsolasErsatz-' + style.replace(' ', '') + '.ttf')
subprocess.run(['fc-cache', '-f', OUT], check=False)
print('fertig:', subprocess.run(['fc-match', 'Consolas'], capture_output=True, text=True).stdout.strip())
