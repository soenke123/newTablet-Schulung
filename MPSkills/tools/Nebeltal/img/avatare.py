# Nebeltal: Profilbilder (Migration 0299, 20.11.2026) – nur bei neuen Bildern nötig.
# Büste aus Sönkes Pinguinen (volle Auflösung, um den Kopf zentriert) + die 3D-Figur aus dem Spiel.
# Aufruf vom Repo-Ordner aus (pip install pillow numpy scipy):
#   node MPSkills/tools/Nebeltal/img/avatar3d.cjs <tmp>/f      → <tmp>/f_000000.png + f_ffffff.png
#   python3 MPSkills/tools/Nebeltal/img/avatare.py "avatare MPSkills/Nebeltal" <tmp>/f_000000.png <tmp>/f_ffffff.png
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
SRC=os.path.dirname(os.path.abspath(__file__))
OUT=sys.argv[1]; os.makedirs(OUT, exist_ok=True)
def trim(im):
    a=np.array(im.getchannel('A')); ys,xs=np.where(a>8)
    return im.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
def halves(path):
    im=Image.open(path).convert('RGBA'); a=np.array(im.getchannel('A'))>8
    xs=np.where(a.sum(0)>0)[0]; gaps=[(xs[i+1]-xs[i],xs[i]) for i in range(len(xs)-1)]
    g,at=max(gaps); cut=at+g//2
    return [trim(im.crop((0,0,cut,im.height))), trim(im.crop((cut,0,im.width,im.height)))]
def bust(im, frac=0.56, name=None, dx=0.0):
    # Quadrat um den Kopf: Mitte = Kopf (obere 16 % der Figur), oben 9 % Luft
    w,h=im.size; side=int(h*frac)
    a=np.array(im.getchannel('A'))[:int(h*0.16)]>8; cx=np.where(a)[1].mean()+dx*side
    x0=int(cx-side/2); y0=-int(side*0.09)
    c=Image.new('RGBA',(side,side),(0,0,0,0)); c.alpha_composite(im.crop((max(0,x0),0,min(w,x0+side),min(h,side+y0))),(max(0,-x0),-y0))
    c=c.resize((256,256),Image.LANCZOS); c.save(os.path.join(OUT,name)); return c
def cutout(path,tol=62):
    im=Image.open(path).convert('RGB'); im=im.crop((4,4,im.width-4,im.height-4))
    rgb=np.array(im).astype(np.int16)
    border=np.concatenate([rgb[0],rgb[-1],rgb[:,0],rgb[:,-1]]); bg=np.median(border,axis=0)
    d=np.abs(rgb-bg).max(axis=2); near=d<tol
    lab,n=ndimage.label(near); edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bgm=np.isin(lab,list(edge)); alpha=np.where(bgm,0,255).astype(np.float32)
    soft=np.clip((d-10)/(tol-10),0,1)*255
    ring=ndimage.binary_dilation(bgm,iterations=2)&~ndimage.binary_erosion(bgm,iterations=2)
    alpha=np.where(ring&bgm,soft,alpha)
    fg=alpha>0; lab2,n2=ndimage.label(fg); sizes=ndimage.sum(fg,lab2,range(1,n2+1))
    keep=np.isin(lab2,[i+1 for i,s in enumerate(sizes) if s>400]); alpha=np.where(keep,alpha,0)
    return trim(Image.fromarray(np.dstack([np.array(im),alpha.astype(np.uint8)]),'RGBA'))
bust(halves(SRC+'/AdelinPinguine.png')[0],name='adelie_avatar.png')
bust(halves(SRC+'/Zügelpinguine.png')[0],name='zuegel_avatar.png')
bust(halves(SRC+'/Eselspinguine.png')[0],name='esel_avatar.png')
bust(cutout(SRC+'/Pinguin Main.jpeg'),name='main_avatar.png')
# 3D: Differenz-Freistellung aus schwarzem und weißem Hintergrund
k=np.array(Image.open(sys.argv[2]).convert('RGB')).astype(float); w=np.array(Image.open(sys.argv[3]).convert('RGB')).astype(float)
a=np.clip(1-(w-k).mean(2)/255,0,1); c=np.where(a[...,None]>0.003,k/np.maximum(a[...,None],1e-3),0)
Image.fromarray(np.dstack([np.clip(c,0,255),a*255]).astype(np.uint8),'RGBA').resize((256,256),Image.LANCZOS).save(os.path.join(OUT,'pinguin3d_avatar.png'))
