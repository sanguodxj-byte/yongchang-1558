"""Compose a portrait devlog cover from Yongchang's existing title illustration."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
out = root/'content/submission/xiaohongshu-20261128'
out.mkdir(parents=True, exist_ok=True)
theme_path = root/'game/assets/ui/theme.json'
colors = json.loads(theme_path.read_text('utf-8'))['colors']
rgb = lambda name: tuple(bytes.fromhex(colors[name]))
source = root/'game/assets/ui/title-guohua.png'
font_path = root/'game/assets/title-kai.ttf'
plain_font = root/'game/assets/font.ttf'
scale = 2
width, height = 1080, 1440
canvas = Image.new('RGB', (width*scale, height*scale), rgb('paper'))

# Keep the mountain, village, sailboat and gate together in the portrait crop.
art = Image.open(source).convert('RGB').crop((790, 0, 2550, 1600))
art = art.resize((width*scale, 982*scale), Image.Resampling.LANCZOS)
mask = np.ones(982*scale, dtype=float)
mask[:110*scale] = np.linspace(0, 1, 110*scale)
mask[-130*scale:] = np.linspace(1, 0, 130*scale)
mask = Image.fromarray(np.repeat((mask*255).astype('uint8')[:, None], width*scale, axis=1))
canvas.paste(art, (0, 418*scale), mask)
draw = ImageDraw.Draw(canvas)
boxes = []


def text(x, y, value, size, color='ink', plain=False):
    font = ImageFont.truetype(str(plain_font if plain else font_path), size*scale)
    position = (x*scale, y*scale)
    bbox = draw.textbbox(position, value, font=font, anchor='lt')
    assert bbox[0] >= 0 and bbox[1] >= 0 and bbox[2] <= width*scale and bbox[3] <= height*scale, (value, bbox)
    draw.text(position, value, font=font, fill=rgb(color), anchor='lt')
    boxes.append({'text': value, 'bounds': [round(v/scale, 1) for v in bbox], 'fontSize': size})


draw.line((64*scale, 70*scale, 102*scale, 70*scale), fill=rgb('vermilion'), width=4*scale)
text(121, 52, '守望1558：永昌风云', 30, 'ink')
text(64, 145, '做国风筑城游戏', 66)
text(60, 246, '被几块石头', 106)
text(60, 369, '难住了。', 106, 'vermilion')
text(68, 502, '山林、矿点，又改了一轮', 30, 'muted')

# One compact cinnabar seal, matching the game's existing visual language.
seal = (900*scale, 140*scale, 1006*scale, 342*scale)
draw.rectangle(seal, fill=rgb('vermilion'))
draw.rectangle((908*scale,148*scale,998*scale,334*scale), outline=rgb('onDark'), width=scale)
for i, value in enumerate('开发手记'):
    text(933, 160+i*40, value, 32, 'onDark')

draw.line((64*scale, 1336*scale, 1016*scale, 1336*scale), fill=rgb('rule'), width=scale)
text(64, 1362, '格尼尔工作室', 28)
text(696, 1364, '国风筑城 · 开发记录', 24, 'muted')

canvas = canvas.resize((width, height), Image.Resampling.LANCZOS)
target = out/'cover-1080x1440.jpg'
canvas.save(target, quality=96, subsampling=0, optimize=True)
canvas.save(out/'cover-1080x1440.png', optimize=True)
thumbnail = canvas.resize((360, 480), Image.Resampling.LANCZOS)
thumbnail.save(out/'thumbnail-360x480.jpg', quality=94)


def luminance(color):
    channels = np.array(color)/255
    channels = np.where(channels <= .04045, channels/12.92, ((channels+.055)/1.055)**2.4)
    return float(channels @ [.2126, .7152, .0722])


contrast = {}
for front, back in [('ink','paper'),('vermilion','paper'),('muted','paper'),('onDark','vermilion')]:
    a, b = sorted([luminance(rgb(front)), luminance(rgb(back))])
    contrast[front+'/'+back] = round((b+.05)/(a+.05), 2)
assert min(contrast.values()) >= 4.5
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
receipt = {'dimensions':[width,height], 'aspectRatio':'3:4', 'method':'Crop and typeset existing game title illustration; no new image generation',
           'artwork':source.relative_to(root).as_posix(), 'artworkSha256':sha(source),
           'artworkProvenance':'content/cover-generation.json', 'font':font_path.relative_to(root).as_posix(),
           'fontSha256':sha(font_path), 'theme':theme_path.relative_to(root).as_posix(),
           'textBoxes':boxes, 'contrast':contrast,
           'files':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(out.glob('*.jpg'))} }
(out/'cover-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'cover':str(target), 'dimensions':[width,height], 'bytes':target.stat().st_size, 'contrast':contrast},ensure_ascii=False))
