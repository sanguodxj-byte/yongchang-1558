"""Typeset new devlog covers from the verified game render; no generated artwork."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--capture', default='.build/water-defenses/views')
args = parser.parse_args()
capture = root / args.capture
out = root / 'content/submission/water-defenses-20261128'
out.mkdir(parents=True, exist_ok=True)
theme = root / 'game/assets/ui/theme.json'
colors = json.loads(theme.read_text('utf-8'))['colors']
font_path = root / 'game/assets/title-kai.ttf'
scale = 2
boxes = {}
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()

for name in ['north-watergate', 'complete-city', 'bridgehead']:
    target = out / (name + '.png')
    if (capture / target.name).exists():
        shutil.copy2(capture / target.name, target)
    if not target.exists():
        raise SystemExit('Missing verified capture: ' + str(capture / target.name))


def compose(width, height, name):
    image = Image.new('RGB', (width * scale, height * scale), '#' + colors['paper'])
    draw = ImageDraw.Draw(image)
    boxes[name] = []

    def text(x, y, value, size, role='ink'):
        font = ImageFont.truetype(str(font_path), size * scale)
        position = (x * scale, y * scale)
        bounds = draw.textbbox(position, value, font=font, anchor='lt')
        assert min(bounds[:2]) >= 0 and bounds[2] <= width * scale and bounds[3] <= height * scale, (value, bounds)
        draw.text(position, value, font=font, anchor='lt', fill='#' + colors[role])
        boxes[name].append({'text': value, 'bounds': [round(n / scale, 2) for n in bounds]})

    def line(x, y, end, role='rule', weight=1):
        draw.line((x * scale, y * scale, end * scale, y * scale), fill='#' + colors[role], width=weight * scale)

    def photo(filename, rectangle, crop=None):
        x, y, w, h = rectangle
        source = Image.open(out / filename).convert('RGB')
        if crop:
            assert 0 <= crop[0] < crop[2] <= source.width and 0 <= crop[1] < crop[3] <= source.height, (filename, crop)
            source = source.crop(crop)
        source = ImageOps.fit(source, (w * scale, h * scale), method=Image.Resampling.LANCZOS)
        image.paste(source, (x * scale, y * scale))
        draw.rectangle((x * scale, y * scale, (x + w) * scale - 1, (y + h) * scale - 1), outline='#' + colors['rule'], width=scale)

    if width == 1080:
        line(64, 76, 100, 'vermilion', 4)
        text(122, 57, '守望1558：永昌风云', 30)
        text(62, 148, '河道穿城', 110)
        text(62, 274, '城墙闭合', 110, 'vermilion')
        text(68, 415, '水门 · 岸边石基 · 桥头城门', 32, 'muted')
        draw.rectangle((918 * scale, 146 * scale, 1008 * scale, 347 * scale), fill='#' + colors['vermilion'])
        for i, character in enumerate('开发手记'):
            text(945, 163 + i * 42, character, 30, 'onDark')
        photo('north-watergate.png', (48, 485, 984, 615))
        text(64, 1122, '本轮游戏实景 · 围城验收布局', 25, 'muted')
        photo('complete-city.png', (64, 1171, 178, 188), (404, 144, 856, 625))
        text(278, 1183, '双渠四口，连成一圈', 42)
        text(280, 1253, '水从拱下过，敌军须破防。', 30, 'muted')
        text(280, 1304, '开局仍是村落，城防由你修筑。', 28, 'muted')
        line(64, 1380, 1016)
        text(64, 1399, '格尼尔工作室', 25)
        text(669, 1401, '2026.11.28  /  05', 24, 'muted')
    else:
        line(64, 80, 100, 'vermilion', 4)
        text(120, 63, '守望1558：永昌风云', 28)
        text(60, 185, '河道穿城', 94)
        text(60, 302, '城墙闭合', 94, 'vermilion')
        text(68, 449, '水门 · 岸边石基 · 桥头城门', 28, 'muted')
        text(68, 531, '双渠四口，连成一圈', 36)
        text(68, 594, '水从拱下过，敌军须破防。', 28, 'muted')
        photo('north-watergate.png', (638, 62, 898, 675), (136, 0, 1198, 798))
        text(650, 762, '游戏实景 · 围城验收布局，开局仍由玩家修筑', 27, 'muted')
        line(64, 820, 1536)
        text(64, 843, '格尼尔工作室 · 开发手记 05', 26)
        text(1300, 845, '2026.11.28', 24, 'muted')
    image = image.resize((width, height), Image.Resampling.LANCZOS)
    image.save(out / (name + '.jpg'), quality=95, subsampling=0, optimize=True)
    return image


vertical = compose(1080, 1440, 'cover-1080x1440')
vertical.resize((360, 480), Image.Resampling.LANCZOS).save(out / 'thumbnail-360x480.jpg', quality=94)
compose(1600, 900, 'cover-1600x900')


def luminance(value):
    channels = [int(value[i:i + 2], 16) / 255 for i in [0, 2, 4]]
    channels = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(v * w for v, w in zip(channels, [.2126, .7152, .0722]))


contrast = {}
for a, b in [('ink', 'paper'), ('vermilion', 'paper'), ('muted', 'paper'), ('onDark', 'vermilion')]:
    low, high = sorted([luminance(colors[a]), luminance(colors[b])])
    contrast[a + '/' + b] = round((high + .05) / (low + .05), 2)
assert min(contrast.values()) >= 4.5
receipt = {'method': 'Typeset current game screenshots; no generative image call or scene alteration.',
           'captureScript': 'game/tests/water-defenses-visual.gd',
           'fixture': 'Paid construction calls with supplied test materials and cleared perimeter trees; not the starting village or an economy playthrough.',
           'font': font_path.relative_to(root).as_posix(), 'fontSha256': sha(font_path),
           'theme': theme.relative_to(root).as_posix(), 'contrast': contrast, 'textBoxes': boxes,
           'files': {p.name: {'sha256': sha(p), 'bytes': p.stat().st_size, 'dimensions': list(Image.open(p).size)}
                     for p in sorted(out.iterdir()) if p.suffix.lower() in ['.jpg', '.png']},
           'license': 'CC BY 4.0 for original game screenshots and cover composition; SIL OFL 1.1 for the unmodified font.'}
(out / 'cover-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'output': str(out), 'covers': ['cover-1080x1440.jpg', 'cover-1600x900.jpg'], 'contrast': contrast}, ensure_ascii=True))
