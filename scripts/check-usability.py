"""Exercise gameplay boundary cases and real Godot UI state transitions."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--output',default='.build/usability/rules');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.output;out.mkdir(parents=True,exist_ok=True);report=out/'report.json';report.unlink(missing_ok=True)
inputs=['game/scripts/session.gd','game/scripts/main.gd','game/scripts/mobile_ui.gd','game/scripts/player_guidance.gd','game/tests/usability-check.gd','game/assets/world.json']
hashes={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in inputs}
env=os.environ.copy();env['APPDATA']=env['LOCALAPPDATA']=str(root/'.build/godot-profile')
r=subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe','--headless','--path',str(root/'game'),'--script','res://tests/usability-check.gd','--','--report='+str(report)],env=env,capture_output=True,timeout=120)
log=(r.stdout+r.stderr).decode('utf-8',errors='replace');(out/'run.log').write_text(log,encoding='utf-8');print(log)
data=json.loads(report.read_text('utf-8')) if report.exists() else {'passed':False}
data['passed']=bool(data['passed'] and not r.returncode and 'SCRIPT ERROR:' not in log and all(hashlib.sha256((root/f).read_bytes()).hexdigest()==h for f,h in hashes.items()));data['sourceHashes']=hashes
report.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');raise SystemExit(0 if data['passed'] else 1)
