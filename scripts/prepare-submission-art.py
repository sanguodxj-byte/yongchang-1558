"""Compose the OSGJ cover from the existing in-game painting and licensed font."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

root = Path(__file__).resolve().parent.parent
out = root / 'content/submission'
out.mkdir(parents=True, exist_ok=True)
theme = json.loads((root / 'game/assets/ui/theme.json').read_text('utf-8'))['colors']
color = lambda name: '#' + theme[name]
font_path = root / 'game/assets/title-kai.ttf'
font = lambda size: ImageFont.truetype(str(font_path), size)
source = root / 'game/assets/ui/title-guohua.png'
cover = ImageOps.fit(Image.open(source).convert('RGB'), (1600, 900), method=Image.Resampling.LANCZOS, centering=(.5, .5))
draw = ImageDraw.Draw(cover)
draw.rectangle((38, 38, 1561, 861), outline=color('rule'), width=2)
draw.text((112, 106), '2026 开源游戏开发大赛 · 守·望', font=font(25), fill=color('muted'))
draw.line((112, 161, 526, 161), fill=color('rule'), width=2)
draw.text((110, 208), '守望 1558', font=font(61), fill=color('vermilion'))
draw.text((104, 299), '永昌风云', font=font(112), fill=color('ink'))
draw.text((112, 474), '从四户村落，守住一方乡土', font=font(32), fill=color('ink'))
draw.text((112, 535), '筑城  ·  耕战  ·  海防', font=font(29), fill=color('jade'))
draw.text((112, 755), '格尼尔工作室', font=font(28), fill=color('ink'))
draw.text((112, 800), '国风低模海防筑城策略游戏', font=font(22), fill=color('muted'))
target = out / 'cover-1600x900.jpg'
cover.save(target, quality=95, subsampling=0, optimize=True)
assert Image.open(target).size == (1600, 900) and target.stat().st_size <= 2_000_000
receipt = {
    'passed': True, 'dimensions': [1600, 900], 'bytes': target.stat().st_size,
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'artworkSource': source.relative_to(root).as_posix(),
    'artworkSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'fontSource': font_path.relative_to(root).as_posix(),
    'fontSha256': hashlib.sha256(font_path.read_bytes()).hexdigest(),
    'method': 'Center crop existing 2560x1600 title painting to 16:9, resize, add title and team typography. No new generative image call.',
    'license': 'CC BY 4.0 for original cover composition; original font remains SIL OFL 1.1.',
    'attribution': '守望1558：永昌风云 / 格尼尔工作室（三哒锅酱）及项目贡献者',
}
(out / 'cover-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(receipt, ensure_ascii=False, indent=2))
