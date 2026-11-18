#!/usr/bin/env python3
"""Build card images (cards/*.webp) + data/cards.json + data/embedded_data.js from data/selection.json.
Run with a Python that has Pillow:  python3 scripts/build_cards.py"""
import json, os
from PIL import Image, ImageOps
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sel = json.load(open('data/selection.json'))
REG_ORDER = ['epaule','coude','main-poignet','rachis','bassin-hanche','genou','cheville-pied','os-entier','parties-molles']
RAR_ORDER = ['commune','peu-commune','rare','legendaire']
SRC_LABEL = {'quiz':'Quiz Imagerie — cas Cochin','cotten-epaule':'Cotten — Épaule','cotten-gen':'Cotten — Pathologies générales','sims':'SIMS 2025'}

def trim(im):
    """Remove light/dark uniform frames (book figure borders)."""
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    def row_uniform(y):
        vals = [px[x, y] for x in range(0, w, max(1, w // 120))]
        return (min(vals) > 215) or (max(vals) - min(vals) < 10)
    def col_uniform(x):
        vals = [px[x, y] for y in range(0, h, max(1, h // 120))]
        return (min(vals) > 215) or (max(vals) - min(vals) < 10)
    t, b, l, r = 0, h - 1, 0, w - 1
    lim = 0.12
    while t < h * lim and row_uniform(t): t += 1
    while b > h * (1 - lim) and row_uniform(b): b -= 1
    while l < w * lim and col_uniform(l): l += 1
    while r > w * (1 - lim) and col_uniform(r): r -= 1
    return im.crop((l, t, r + 1, b + 1))

os.makedirs('cards', exist_ok=True)
sel.sort(key=lambda s: (REG_ORDER.index(s['region']), RAR_ORDER.index(s['rarity']), s['i']))
cards = []
for n, s in enumerate(sel, 1):
    im = Image.open(s['path'])
    im = im.convert('RGB')
    if s.get('crop'):
        a, b, c, d = s['crop']; W, H = im.size
        im = im.crop((int(a * W), int(b * H), int(c * W), int(d * H)))
    im = trim(im)
    im.thumbnail((1000, 1000), Image.LANCZOS)
    cid = f"c{s['i']:03d}"
    im.save(f'cards/{cid}.webp', 'WEBP', quality=82, method=6)
    cards.append(dict(id=cid, n=n, title=s['title'], desc=s['desc'], region=s['region'],
                      modality=s['modality'], rarity=s['rarity'], source=SRC_LABEL[s['src']],
                      img=f'cards/{cid}.webp', w=im.width, h=im.height))
json.dump(cards, open('data/cards.json', 'w'), ensure_ascii=False, indent=1)
open('data/embedded_data.js', 'w').write('window.MSK_CARDS = ' + json.dumps(cards, ensure_ascii=False) + ';\n')
print(len(cards), 'cards')
