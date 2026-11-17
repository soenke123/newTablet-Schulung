# Nebeltal: Sönkes Bilder freistellen (17.11.2026) – nur bei neuen Bildern nötig.
# Aufruf (pip install pillow numpy scipy):
#   python3 img/freistellen.py img img/frei
# Arten-PNGs (2 Varianten je Bild) werden an der Lücke geteilt, JPEGs (Haupt-Pinguin, Nester)
# vom hellen Hintergrund befreit; main_a/main_b = Schal orange/violett (Level 7, Figur A/B).
import sys, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
SRC = sys.argv[1]; OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
H = 420  # Zielhöhe

def trim(im):
    a = np.array(im.getchannel('A'))
    ys, xs = np.where(a > 8)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

def save(im, name, h=H):
    im = trim(im)
    if im.height > h:
        im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6)
    print(name, im.size, os.path.getsize(os.path.join(OUT, name + '.webp')))
    return im

def split(path, names):
    im = Image.open(path).convert('RGBA')
    a = np.array(im.getchannel('A')) > 8
    col = a.sum(0)
    # größte Lücke in der Mitte
    xs = np.where(col > 0)[0]
    gaps = [(xs[i+1]-xs[i], xs[i]) for i in range(len(xs)-1)]
    g, at = max(gaps)
    cut = at + g // 2
    for (n, box) in zip(names, [(0, 0, cut, im.height), (cut, 0, im.width, im.height)]):
        save(im.crop(box), n)

def cutout(path, name, h=H, tol=34):
    im = Image.open(path).convert('RGB')
    im = im.crop((4, 4, im.width - 4, im.height - 4))   # Naht am Rand der JPEGs
    rgb = np.array(im).astype(np.int16)
    # Hintergrund ≈ hellgrau/weiß: Abstand zur Randfarbe
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    d = np.abs(rgb - bg).max(axis=2)
    near = d < tol
    lab, n = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge))
    # weicher Rand: Alpha aus Abstand am Übergang
    alpha = np.where(bgmask, 0, 255).astype(np.float32)
    soft = np.clip((d - 10) / (tol - 10), 0, 1) * 255
    ring = ndimage.binary_dilation(bgmask, iterations=2) & ~ndimage.binary_erosion(bgmask, iterations=2)
    alpha = np.where(ring & bgmask, soft, alpha)
    # kleine Inseln (Staub/Schatten) entfernen
    fg = alpha > 0
    lab2, n2 = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab2, range(1, n2 + 1))
    keep = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > 400])
    alpha = np.where(keep, alpha, 0)
    out = np.dstack([np.array(im), alpha.astype(np.uint8)])
    res = Image.fromarray(out, 'RGBA')
    return save(res, name, h), res

split(os.path.join(SRC, 'AdelinPinguine.png'), ['adelie_1', 'adelie_2'])
split(os.path.join(SRC, 'Zügelpinguine.png'), ['chin_1', 'chin_2'])
split(os.path.join(SRC, 'Eselspinguine.png'), ['gentoo_1', 'gentoo_2'])
cutout(os.path.join(SRC, 'Nest.jpeg'), 'nest', 300)
cutout(os.path.join(SRC, 'Nest Female.jpeg'), 'nest_mama', 300)
cutout(os.path.join(SRC, 'Neste Male.jpeg'), 'nest_papa', 300)
cutout(os.path.join(SRC, 'Nest male Female.jpeg'), 'nest_beide', 300)
_, main = cutout(os.path.join(SRC, 'Pinguin Main.jpeg'), 'main', H, 62)

# Schal umfärben (türkis → orange / violett) für Level 7 (Figur A / B)
import colorsys
arr = np.array(main).astype(np.float32) / 255
r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
mx = arr[..., :3].max(-1); mn = arr[..., :3].min(-1)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
hsv = np.vectorize(colorsys.rgb_to_hsv)
hh, ss, vv = hsv(r, g, b)
scarf = (np.abs(hh - 0.5) < 0.09) & (ss > 0.22)
scarf = ndimage.binary_closing(scarf, iterations=1)
for nm, hue, sm, vm in [('main_a', 0.07, 1.6, 1.12), ('main_b', 0.73, 1.0, 1.0)]:
    nh = np.where(scarf, hue, hh)
    ns = np.where(scarf, np.clip(ss * sm, 0, 1), ss)
    nv = np.where(scarf, np.clip(vv * vm, 0, 1), vv)
    rgb2 = np.vectorize(colorsys.hsv_to_rgb)
    nr, ng, nb = rgb2(nh, ns, nv)
    o = np.dstack([nr, ng, nb, a]) * 255
    save(Image.fromarray(o.astype(np.uint8), 'RGBA'), nm)
