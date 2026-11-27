"""Run contact and joint assertions on the actual Godot animation rig."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--output',default='.build/motion-polish/physics');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.output;out.mkdir(parents=True,exist_ok=True);report=out/'report.json';report.unlink(missing_ok=True)
env=os.environ.copy();env['APPDATA']=env['LOCALAPPDATA']=str(root/'.build/godot-profile')
r=subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe','--headless','--path',str(root/'game'),'--script','res://tests/motion-physics-check.gd','--','--report='+str(report)],env=env,capture_output=True,timeout=120)
log=(r.stdout+r.stderr).decode('utf-8',errors='replace');(out/'run.log').write_text(log,encoding='utf-8');print(log)
data=json.loads(report.read_text('utf-8')) if report.exists() else {'passed':False}
data['passed']=bool(data['passed'] and r.returncode==0 and 'SCRIPT ERROR:' not in log and not any(line.startswith('ERROR:') and 'root certificate store' not in line for line in log.splitlines()))
data['sourceHashes']={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['game/scripts/unit_rig.gd','game/scripts/motion_clips.gd','game/scripts/work_props.gd','game/scripts/main.gd','game/scripts/session.gd','game/scripts/unit_separation.gd','game/assets/world.json','game/tests/motion-physics-check.gd']}
report.write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8');raise SystemExit(0 if data['passed'] else 1)
