"""Render deterministic close-up motion sequences using the shipped rig."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--mode',choices=['work','walk'],required=True);p.add_argument('--output',default='.build/motion-polish');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.output;frames_dir=out/(a.mode+'-frames');frames_dir.mkdir(parents=True,exist_ok=True)
env=os.environ.copy();env['APPDATA']=env['LOCALAPPDATA']=str(root/'.build/godot-profile')
r=subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64.exe','--path',str(root/'game'),'--rendering-method','gl_compatibility','--disable-vsync','--fixed-fps','24','--script','res://tests/motion-polish-visual.gd','--','--mode='+a.mode,'--output='+str(frames_dir)],env=env,capture_output=True,timeout=150,creationflags=subprocess.CREATE_NO_WINDOW)
log=(r.stdout+r.stderr).decode('utf-8',errors='replace');(out/(a.mode+'-visual.log')).write_text(log,encoding='utf-8')
assert r.returncode==0 and 'SCRIPT ERROR:' not in log,log[-5000:]
frames=[Image.open(frames_dir/f'frame-{i:03d}.png').convert('RGB') for i in range(96)]
frames[0].save(out/(a.mode+'.gif'),save_all=True,append_images=frames[1:],duration=[42,42,41]*32,loop=0,optimize=True)
sheet=Image.new('RGB',(1800,1080),'#c4c0ae')
for i,frame in enumerate([0,12,20,28,40,48,60,72,90]):sheet.paste(frames[frame].resize((600,360)),((i%3)*600,(i//3)*360))
sheet.save(out/(a.mode+'-sheet.jpg'),quality=94)
record={'passed':True,'frames':96,'fps':24,'sources':{n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in ['game/scripts/unit_rig.gd','game/scripts/motion_clips.gd','game/scripts/work_props.gd','game/tests/motion-polish-visual.gd','game/assets/world.json']},'artifacts':{n:hashlib.sha256((out/n).read_bytes()).hexdigest() for n in [a.mode+'.gif',a.mode+'-sheet.jpg']}}
(out/(a.mode+'-capture.json')).write_text(json.dumps(record,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'mode':a.mode,'frames':96}))
