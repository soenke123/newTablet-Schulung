# Setzt nummerierte Kreise auf die Gesamt-Screenshots (bilder/pN-gesamt.png -> bilder/pN-gesamt-nr.png).
# Koordinaten in Pixeln der 2732 x 1880 großen Bilder (Ansicht 1366 px, Faktor 2).
from PIL import Image, ImageDraw, ImageFont
import os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bilder')
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 50)
K = 2.82
P = {
  'p1': [(25, 95), (285, 70), (515, 70), (748, 70), (762, 22)],
  'p2': [(25, 93), (282, 82), (515, 82), (748, 82), (748, 365)],
  'p3': [(40 / K * 1.366, 170 / K * 1.366), (575 / K * 1.366, 150 / K * 1.366), (1055 / K * 1.366, 150 / K * 1.366), (1535 / K * 1.366, 150 / K * 1.366)],
  'p4': [(25, 93), (282, 81), (282, 321), (515, 321), (748, 321)],
}
for name, pts in P.items():
    im = Image.open(f'{D}/{name}-gesamt.png').convert('RGB')
    d = ImageDraw.Draw(im)
    for i, (x, y) in enumerate(pts, 1):
        x, y, r = x * K, y * K, 44
        d.ellipse((x - r - 6, y - r - 6, x + r + 6, y + r + 6), fill='white')
        d.ellipse((x - r, y - r, x + r, y + r), fill='#6d4aff')
        d.text((x, y + 2), str(i), font=F, fill='white', anchor='mm')
    im.save(f'{D}/{name}-gesamt-nr.png')
    print('ok', name)
