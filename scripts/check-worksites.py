"""Production, placement and actual skeleton regression checks in Godot."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--output',default='.build/worksites');a=p.parse_args()
out=root/a.output;out.mkdir(parents=True,exist_ok=True)
report=out/'report.json'
report.unlink(missing_ok=True)
inputs=['game/assets/world.json','game/assets/geometry.bin.z','game/scripts/session.gd','game/scripts/unit_separation.gd','game/scripts/assets.gd','game/scripts/unit_rig.gd','game/scripts/motion_clips.gd','game/tests/worksites-check.gd']
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in inputs}
env=os.environ.copy();env['APPDATA']=env['LOCALAPPDATA']=str(root/'.build/godot-profile')
r=subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe','--headless','--path',str(root/'game'),'--script','res://tests/worksites-check.gd','--','--report='+str(report)],env=env,capture_output=True,timeout=240)
log=(r.stdout+r.stderr).decode('utf-8',errors='replace');(out/'check.log').write_text(log,encoding='utf-8')
result=json.loads(report.read_text('utf-8')) if report.exists() else {'passed':False}
result['passed']=bool(result['passed'] and r.returncode==0 and 'SCRIPT ERROR:' not in log and all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in hashes.items()))
result['sourceHashes']=hashes;report.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print(log)
raise SystemExit(0 if result['passed'] else 1)
