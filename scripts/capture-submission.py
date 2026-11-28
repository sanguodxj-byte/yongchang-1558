"""Render a labeled, under-five-minute gameplay demonstration from a frozen checkout."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

p = argparse.ArgumentParser()
p.add_argument('--project', default='.build/submission/source')
p.add_argument('--output', default='.build/submission')
p.add_argument('--godot', default=r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe')
p.add_argument('--only', help='Render one named shot; final assembly waits for all shots.')
p.add_argument('--reuse-captures', action='store_true', help='Encode existing AVI and frame receipts without recording again.')
p.add_argument('--assemble-only', action='store_true', help='Assemble existing encoded shots and regenerate their version receipt.')
a = p.parse_args()
root = Path(__file__).resolve().parent.parent
project, out = (root / a.project).resolve(), (root / a.output).resolve()
assert project.is_relative_to(root / '.build'), 'Use a dedicated capture checkout'
out.mkdir(parents=True, exist_ok=True)
shots = [
    ('build', '01  从四户村落开始', '选择稻田、落地营造，民丁自动上岗；先让粮食持续入库。'),
    ('quarry', '02  让运输成为经营的一部分', '石场独立生产；另建绑牛桩，每批6石增至9石，由牛车运往堆场。'),
    ('farm', '03  工种决定工具与动作', '耕作、伐木、采石分别持对应工具；工人完成采集、加工与运送。'),
    ('village', '04  堡内耕战，自给自守', '生产送达后才能用于筑防和军工；丁口、粮械与城防相互牵动。'),
    ('defence', '05  布置两路防线', '守护宗祠与宗长，利用炮台和部队抵挡来袭；战局持续推进。'),
    ('clan', '06  守望也是宗族互助', '义捐、驰援、驻祠与乡约共同参与决策；可用次数和资源都有约束。'),
    ('army', '07  从守城走向远征', '军令下达后，部队前往渡口集结；步兵、冲车和炮车各有用途。'),
    ('sea', '08  乘舟渡海', '约30秒的海上航程，由实际船只承载部队；岛寨是玩法虚构。'),
    ('siege', '09  突破双重岛寨', '炮车压制岸防，冲车破门，护卫推进；资源准备最终落实到战场。'),
    ('finale', '10  海波平定，守望家园', '攻破敌营并击败倭酋，完成本局；可保存进度，也可再守一局。'),
]
font_path = root / 'game/assets/title-kai.ttf'
font = lambda size: ImageFont.truetype(str(font_path), size)
env = os.environ.copy()
env['APPDATA'] = env['LOCALAPPDATA'] = str(out / 'capture-profile')
shutil.copy2(root / 'scripts/submission-capture.gd', project / 'game/tests/submission-capture.gd')
# The shipped sound cooldown uses wall time. Offline capture needs its identical
# 80 ms rule measured on the movie clock; keep this patch in the capture checkout.
sound = project / 'game/scripts/sound.gd'
original = subprocess.check_output(['git', '-C', str(project), 'show', 'HEAD:game/scripts/sound.gd']).decode('utf-8')
sound.write_text(original.replace('Time.get_ticks_msec()', 'roundi(Engine.get_process_frames()*1000.0/24.0)'), encoding='utf-8')


def run(command, log, timeout):
    with log.open('w', encoding='utf-8') as handle:
        r = subprocess.run(command, cwd=root, env=env, stdout=handle, stderr=subprocess.STDOUT, timeout=timeout)
    text = log.read_text('utf-8', errors='replace')
    assert r.returncode == 0 and 'SCRIPT ERROR:' not in text, text[-6000:]


if not (out / 'states.bin').exists():
    run([a.godot, '--headless', '--path', str(project/'game'), '--script', 'res://tests/submission-capture.gd',
         '--', '--prepare', '--output='+str(out)], out/'prepare-capture.log', 300)


for key, title, caption in shots:
    if a.assemble_only:
        continue
    if a.only and key != a.only:
        continue
    print('Rendering', key, flush=True)
    avi = out / (key + '.avi')
    if not a.reuse_captures or not avi.exists():
        run([a.godot, '--path', str(project / 'game'), '--rendering-method', 'gl_compatibility', '--resolution', '1600x1000',
             '--disable-vsync', '--fixed-fps', '24', '--write-movie', str(avi), '--script', 'res://tests/submission-capture.gd',
             '--', '--output=' + str(out), '--shot=' + key], out / (key + '.log'), 300)
    receipt = json.loads((out / (key + '.json')).read_text('utf-8'))
    assert receipt['passed']
    overlay = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, 0, 1919, 59), fill='#f4f0e2')
    draw.rectangle((0, 1020, 1919, 1079), fill='#f4f0e2')
    draw.text((192, 13), title, font=font(28), fill='#263e38')
    draw.text((1338, 17), '守望1558 · 格尼尔工作室', font=font(22), fill='#5e6c60')
    draw.text((192, 1036), caption, font=font(25), fill='#263e38')
    overlay.save(out / (key + '-overlay.png'))
    run(['ffmpeg', '-y', '-ss', str(receipt['startFrame']/24), '-i', str(avi), '-i', str(out / (key + '-overlay.png')),
         '-filter_complex', '[0:v]scale=1536:960,pad=1920:1080:192:60:color=0xf4f0e2[game];[game][1:v]overlay=0:0,scale=1920:1080,setsar=1,format=yuv420p[v]',
         '-map', '[v]', '-map', '0:a:0', '-t', str(receipt['frames']/24), '-r', '24', '-c:v', 'libx264', '-preset', 'fast',
         '-crf', '18', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
         str(out / (key + '.mp4'))], out / (key + '-encode.log'), 240)
    print('Recorded', key, receipt['frames']/24, 'seconds;', receipt['initial']['time'], '->', receipt['final']['time'], flush=True)

if all((out / (s[0] + '.mp4')).exists() for s in shots):
    # Opening / ending cards identify the team and the nature of this recording.
    for key in ['opening', 'ending']:
        if key == 'opening':
            card = Image.open(root / 'content/submission/cover-1600x900.jpg').resize((1920, 1080), Image.Resampling.LANCZOS)
        else:
            card = Image.new('RGB', (1920, 1080), '#f4f0e2');draw = ImageDraw.Draw(card)
            for y, text, size in [(250, '守望1558：永昌风云', 78), (390, '格尼尔工作室 · 三哒锅酱', 38),
                                  (510, '正常资源规则 · 自动演示 · 段落剪辑', 32),
                                  (575, '游戏采用 Godot，同一工程支持 Dora 与 H5', 30),
                                  (685, '2026 开源游戏开发大赛 · 守·望', 30)]:
                width=draw.textlength(text,font=font(size));draw.text(((1920-width)/2,y),text,font=font(size),fill='#263e38')
        card.save(out / (key + '.png'))
        run(['ffmpeg', '-y', '-loop', '1', '-i', str(out / (key + '.png')), '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
             '-t', '4' if key=='opening' else '6', '-r', '24', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
             '-threads', '2', '-c:a', 'aac', '-b:a', '160k', str(out / (key + '.mp4'))], out / (key + '-encode.log'), 120)
    names = ['opening', *[s[0] for s in shots], 'ending']
    # All files are task-owned names; ffconcat paths use forward slashes.
    (out / 'sequence.txt').write_text('\n'.join("file '" + (out / (key + '.mp4')).as_posix() + "'" for key in names), encoding='utf-8')
    final = out / '守望1558-参赛演示.mp4'
    run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(out / 'sequence.txt'), '-c', 'copy', '-movflags', '+faststart', str(final)], out / 'assemble.log', 120)
    metadata = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(final)]))
    assert float(metadata['format']['duration']) <= 300
    report = {'passed': True, 'file': final.name, 'bytes': final.stat().st_size, 'sha256': hashlib.sha256(final.read_bytes()).hexdigest(),
              'baseCommit': subprocess.check_output(['git', '-C', str(project), 'rev-parse', 'HEAD']).decode().strip(),
              'captureOnlyChanges': ['Added scripted normal-cost replay driver under tests/', 'Sound cooldown uses fixed 24 fps clock, preserving 80 ms limit'],
              'gameplayPatchSinceBase': 'mobile_ui.gd guards a freed sound button on result-screen refresh; also applied to the working game',
              'gameSources': {p.relative_to(project).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in (project / 'game/scripts').glob('*.gd')},
              'worldSha256': hashlib.sha256((project/'game/assets/world.json').read_bytes()).hexdigest(),
              'geometrySha256': hashlib.sha256((project/'game/assets/geometry.bin.z').read_bytes()).hexdigest(),
              'shots': [json.loads((out / (s[0]+'.json')).read_text('utf-8')) for s in shots], 'media': metadata,
              'humanListeningReview': False, 'published': False}
    (out / 'video-receipt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('DEMO READY', final, metadata['format']['duration'], flush=True)
