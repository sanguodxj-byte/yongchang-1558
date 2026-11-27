"""Equivalence checks and a planted delay verify the optimization and its meter."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--output',default='.build/performance/check');a=p.parse_args()
out=root/a.output;out.mkdir(parents=True,exist_ok=True)
report=out/'report.json';report.unlink(missing_ok=True)
files=['game/scripts/session.gd','game/scripts/unit_separation.gd','game/scripts/performance_probe.gd','game/tests/performance-check.gd']
hashes={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files}
env=os.environ.copy();env['APPDATA']=env['LOCALAPPDATA']=str(root/'.build/godot-profile')
r=subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64.exe','--path',str(root/'game'),'--rendering-method','gl_compatibility','--script','res://tests/performance-check.gd','--','--profile','--report='+str(report)],env=env,capture_output=True,timeout=90,creationflags=subprocess.CREATE_NO_WINDOW)
log=(r.stdout+r.stderr).decode('utf-8',errors='replace');(out/'run.log').write_text(log,encoding='utf-8')
data=json.loads(report.read_text('utf-8')) if report.exists() else {'passed':False}
data['passed']=bool(data['passed'] and not r.returncode and 'SCRIPT ERROR:' not in log and all(hashlib.sha256((root/f).read_bytes()).hexdigest()==h for f,h in hashes.items()))
data['sourceHashes']=hashes;report.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(log);raise SystemExit(0 if data['passed'] else 1)
