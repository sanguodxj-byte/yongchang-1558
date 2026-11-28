"""Capture mineral outcrops from four sides, material passes and a short camera arc."""
import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='.build/rock-repair/views')
args = parser.parse_args()
out = (root/args.output).resolve();out.mkdir(parents=True, exist_ok=True)
env = os.environ.copy();env['APPDATA'] = env['LOCALAPPDATA'] = str(root/'.build/godot-profile')
run = subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe',
                      '--path', str(root/'game'), '--script', 'res://tests/rock-capture.gd',
                      '--', '--output='+str(out)], env=env, capture_output=True, timeout=150)
log = (run.stdout+run.stderr).decode('utf-8', errors='replace')
(out/'render.log').write_text(log, encoding='utf-8')
if run.returncode or 'SCRIPT ERROR:' in log or not (out/'cameras.json').exists():
    raise SystemExit(log[-6000:])
record = json.loads((out/'cameras.json').read_text('utf-8'))
assert record['contentHash'] == hashlib.sha256((root/'game/assets/world.json').read_bytes()).hexdigest()
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 20)
for kind in ['stone','iron']:
    paths = sorted(out.glob('motion-'+kind+'-*.png'));frames = []
    for path in paths:
        image = Image.open(path).convert('RGB');image.thumbnail((800,500));frames.append(image)
    frames[0].save(out/(kind+'-orbit.gif'), save_all=True, append_images=frames[1:], duration=90, loop=0)
    for path in paths:path.unlink()
    labels = [s['name'] for s in record['shots'] if s['name'].startswith(kind+'-')]
    sheet = Image.new('RGB',(4*640,2*430),'#1b241b');draw=ImageDraw.Draw(sheet)
    for i,label in enumerate(labels):
        image=Image.open(out/(label+'.png')).convert('RGB');image.thumbnail((640,400))
        x=i%4*640;y=i//4*430;sheet.paste(image,(x,y));draw.text((x+8,y+403),label,font=font,fill='white')
    sheet.save(out/(kind+'-sheet.jpg'),quality=93)
print(json.dumps({'passed':True,'shots':len(record['shots']),'resourceMeshes':record['resourceMeshes'],'output':str(out)}))
