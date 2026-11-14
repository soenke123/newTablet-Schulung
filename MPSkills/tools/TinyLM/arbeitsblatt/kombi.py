# Setzt zwei Handy-Screenshots nebeneinander (für die kurzen Arbeitsblätter): bilder/k-*.png
from PIL import Image
import os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bilder')
for name, files in {
    'k-p1-ngramm': ['p1-handy-1gramm', 'p1-handy-6gramm'],
    'k-p2-fallen': ['p2-handy-eiffelturm', 'p2-handy-erde'],
    'k-p4-fragestaerke': ['p4-handy', 'p4-handy-fragestaerke3'],
}.items():
    ims = [Image.open(f'{D}/{f}.png').convert('RGB') for f in files]
    gap = 40
    c = Image.new('RGB', (sum(i.width for i in ims) + gap, max(i.height for i in ims)), 'white')
    x = 0
    for i in ims:
        c.paste(i, (x, 0)); x += i.width + gap
    c.save(f'{D}/{name}.png'); print('ok', name)
