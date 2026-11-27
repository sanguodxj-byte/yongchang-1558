import hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent;out=root/'.build/completion/archive';out.mkdir(parents=True,exist_ok=True);report=out/'report.json';report.unlink(missing_ok=True)
inputs=['game/scripts/session.gd','game/scripts/session_archive.gd','game/scripts/save_store.gd','game/scripts/site_inspector.gd','game/tests/archive-check.gd']
hashes={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in inputs};env=os.environ.copy();env['APPDATA']=env['LOCALAPPDATA']=str(out/'profile')
r=subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe','--headless','--path',str(root/'game'),'--script','res://tests/archive-check.gd','--','--report='+str(report)],env=env,capture_output=True,timeout=180)
log=(r.stdout+r.stderr).decode('utf-8',errors='replace');(out/'run.log').write_text(log,encoding='utf-8');print(log)
d=json.loads(report.read_text('utf-8')) if report.exists() else {'passed':False};d['passed']=bool(d['passed'] and not r.returncode and 'SCRIPT ERROR:' not in log);d['sourceHashes']=hashes;report.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8');raise SystemExit(0 if d['passed'] else 1)
