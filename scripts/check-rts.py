"""Check terrain readability and RTS command behavior in the actual Godot session."""
import argparse, json, os, subprocess
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--godot',default=r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe')
p.add_argument('--output',default='.build/rts-terrain/logic.json')
a=p.parse_args();root=Path(__file__).resolve().parent.parent
out=(root/a.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
env=os.environ.copy();env['APPDATA']=str(root/'.build/godot-profile');env['LOCALAPPDATA']=env['APPDATA']
if out.exists():out.unlink()
r=subprocess.run([a.godot,'--headless','--path',str(root/'game'),'--script','res://tests/rts-check.gd','--','--report='+str(out)],env=env,capture_output=True,timeout=120)
log=(r.stdout+r.stderr).decode('utf-8',errors='replace');out.with_suffix('.log').write_text(log,encoding='utf-8')
print(log.encode('ascii',errors='backslashreplace').decode())
report=json.loads(out.read_text('utf-8')) if out.exists() else {}
raise SystemExit(0 if not r.returncode and report.get('passed') and 'SCRIPT ERROR:' not in log else 1)
