import argparse,os,subprocess,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--godot',default=r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe')
a=p.parse_args();root=Path(__file__).resolve().parent.parent;out=root/'.build';out.mkdir(exist_ok=True)
env=os.environ.copy();env['APPDATA']=str(out/'godot-profile');env['LOCALAPPDATA']=str(out/'godot-profile')
command=[a.godot,'--headless','--path',str(root/'game'),'--script','res://tests/common-check.gd','--','--report='+str(out/'common-report.json')]
report=out/'common-report.json'
if report.exists(): report.unlink()
inputs=['game/assets/world.json','game/scripts/session.gd','game/scripts/unit_separation.gd','game/scripts/terrain_surface.gd','game/tests/common-check.gd']
hashes={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in inputs}
r=subprocess.run(command,env=env,capture_output=True,timeout=180)
text=(r.stdout+r.stderr).decode('utf-8',errors='replace');(out/'common-test.log').write_text(text,encoding='utf-8');print(text)
result=json.loads(report.read_text('utf-8')) if report.exists() else {'passed':False}
ok=not r.returncode and 'SCRIPT ERROR:' not in text and result.get('passed') and all(hashlib.sha256((root/name).read_bytes()).hexdigest()==value for name,value in hashes.items())
result.update(passed=bool(ok),sourceHashes=hashes);report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
raise SystemExit(0 if ok else 1)
