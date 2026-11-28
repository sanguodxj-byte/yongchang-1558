"""Validate and collect local review materials; does not publish or submit anything."""
import hashlib
import json
import shutil
import subprocess
import zipfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
out = root / 'dist/submission'
out.mkdir(parents=True, exist_ok=True)
fields = json.loads((root / 'content/submission/fields.json').read_text('utf-8'))
cover = root / fields['cover']
assert Image.open(cover).size == (1600, 900) and cover.stat().st_size <= 2_000_000
video = root / fields['videoFile']
receipt = json.loads((video.parent / 'video-receipt.json').read_text('utf-8'))
assert receipt['passed'] and receipt['baseCommit'] == fields['verifiedGameplayCommit']
assert hashlib.sha256(video.read_bytes()).hexdigest() == receipt['sha256']
media = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(video)]))
assert 0 < float(media['format']['duration']) <= 300
stream = next(s for s in media['streams'] if s['codec_type'] == 'video')
assert (stream['width'], stream['height']) == (1920, 1080) and stream['codec_name'] == 'h264'
assert any(s['codec_type'] == 'audio' for s in media['streams'])
source = json.loads((root / '.build/submission/source-check/report.json').read_text('utf-8'))
assert source['passed'] and source['commit'] == fields['verifiedGameplayCommit']
assert sum(x['points'] for x in fields['suggestedScoringFocus']) == 2

files = [root / 'README.md', root / 'ASSET_LICENSE.md', root / 'THIRD_PARTY.md', root / 'LICENSE']
files += list((root / 'docs/submission').glob('*.md'))
files += [p for p in (root / 'docs').glob('*.md') if p.name != 'development-state.md']
files += list((root / 'licenses').glob('*.txt'))
files += [p for p in (root / 'content/submission').rglob('*') if p.is_file()]
for p in files:
    dest = out / p.relative_to(root)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)
for p, name in [(video, video.name), (video.parent / 'video-receipt.json', 'video-receipt.json'),
                (root / '.build/submission/source-check/report.json', 'source-startup-report.json')]:
    shutil.copy2(p, out / name)
intro = '''提交材料包（本地审阅版）

队伍：格尼尔工作室；队长/提交人：三哒锅酱。
封面：content/submission/cover-1600x900.jpg。
演示：守望1558-参赛演示.mp4。
作品简介、B站发布文案与三篇日志：docs/submission/。

视频以已推送的2843e00为基点，另含结算页音效按钮有效性检查补丁；工作区后续地形/RTS改动未纳入。
本包只完成本地制作与技术校验。尚需本人核对声明、观看/听审、发布B站及3篇日志，
填写真实链接和最终评审SHA，再在官网提交。所有未完成字段均保留为空。
源码参评启动方法见README；Dora兼容包可使用同目录之外保存的已验证基线包。
'''
(out / '先读我.txt').write_text(intro, encoding='utf-8')
manifest = {'localMaterialChecksPassed': True, 'readyForFinalSubmission': False,
            'baseCommit': fields['verifiedGameplayCommit'], 'durationSeconds': float(media['format']['duration']),
            'coverBytes': cover.stat().st_size, 'scoringFocus': fields['suggestedScoringFocus'],
            'pending': ['队长补全事实声明并审阅', 'B站公开发布与链接', '3篇社媒日志公开链接', '最终评审SHA及官网提交', 'Dora奖社区条件及规定互评'],
            'files': {p.relative_to(out).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in out.rglob('*') if p.is_file() and p.name != 'MANIFEST.json'}}
(out / 'MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
archive = root / 'dist/OSGJ2026-提交材料-审阅版.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for p in sorted(out.rglob('*')):
        if p.is_file():z.write(p, p.relative_to(out).as_posix())
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
print(json.dumps({'passed': True, 'archive': str(archive), 'videoSeconds': manifest['durationSeconds'], 'coverBytes': manifest['coverBytes'], 'pending': manifest['pending']}, ensure_ascii=False, indent=2))
