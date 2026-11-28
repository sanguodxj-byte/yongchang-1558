"""Render all 21 map sectors plus focal ground/bridge/shore views in Godot."""
import argparse,json,os,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

p=argparse.ArgumentParser();p.add_argument('--project',default='game');p.add_argument('--output',required=True);p.add_argument('--motion',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=(root/a.output).resolve();out.mkdir(parents=True,exist_ok=True)
project=(root/a.project).resolve();env=os.environ.copy();env['APPDATA']=str(root/'.build/godot-profile');env['LOCALAPPDATA']=env['APPDATA']
run=subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe','--path',str(project),'--script','res://tests/landscape-capture.gd','--','--output='+str(out)]+(['--motion'] if a.motion else []),env=env,capture_output=True,timeout=150)
log=(run.stdout+run.stderr).decode('utf-8',errors='replace');(out/'render.log').write_text(log,encoding='utf-8')
if run.returncode or 'SCRIPT ERROR:' in log or not (out/'cameras.json').exists():raise SystemExit(log[-6000:])
record=json.loads((out/'cameras.json').read_text('utf-8'))
assert all(c['passed'] for c in record['cameraChecks']),[c for c in record['cameraChecks'] if not c['passed']]
sheet=Image.new('RGB',(7*384,3*264),'#202a21');draw=ImageDraw.Draw(sheet)
font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',17)
for z in range(3):
 for x in range(7):
  im=Image.open(out/f'tile-{x}-{z}.png').convert('RGB');im.thumbnail((384,240));sheet.paste(im,(x*384,z*264))
  draw.text((x*384+8,z*264+242),f'X {x*32:03d}-{(x+1)*32:03d}  Z {z*32:02d}-{(z+1)*32:02d}',font=font,fill='#e8e3c9')
sheet.save(out/'whole-map-sheet.jpg',quality=93)
if a.motion:
 for take in ['bridge','coast']:
  paths=sorted(out.glob('motion-'+take+'-*.png'));frames=[]
  for path in paths:
   im=Image.open(path).convert('RGB');im.thumbnail((800,500));frames.append(im)
  frames[0].save(out/('motion-'+take+'.gif'),save_all=True,append_images=frames[1:],duration=70,loop=0)
  for path in paths:path.unlink()
print(json.dumps({'passed':True,'views':len(json.loads((out/'cameras.json').read_text('utf-8'))['shots']),'output':str(out)}))
