"""Run fortress topology, transport and honest economy scenarios on the shared rules."""
import argparse, hashlib, json, os, subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
p = argparse.ArgumentParser()
p.add_argument('--godot', default=r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe')
p.add_argument('--mode', choices=['all', 'layout', 'rush', 'economy', 'siege'], default='all')
p.add_argument('--output', default='.build/offshore-camp')
a = p.parse_args()
out = (root / a.output).resolve();out.mkdir(parents=True, exist_ok=True)
report = out / (a.mode + '-report.json')
report.write_text('{"passed":false,"status":"running"}', encoding='utf-8')
env = os.environ.copy();env['APPDATA'] = env['LOCALAPPDATA'] = str(root / '.build/godot-profile')
inputs = ['game/assets/world.json', 'game/scripts/session.gd','game/scripts/unit_separation.gd', 'game/scripts/terrain_surface.gd', 'game/tests/fortress-check.gd']
hashes = {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in inputs}
run = subprocess.run([a.godot, '--headless', '--path', str(root / 'game'), '--script',
    'res://tests/fortress-check.gd', '--', '--mode=' + a.mode, '--report=' + str(report)],
    env=env, capture_output=True, timeout=300)
log = (run.stdout + run.stderr).decode('utf-8', errors='replace')
(out / (a.mode + '.log')).write_text(log, encoding='utf-8')
result = json.loads(report.read_text('utf-8'))
ok = not run.returncode and 'SCRIPT ERROR:' not in log and result.get('passed') and result.get('content_hash') == hashlib.sha256((root / 'game/assets/world.json').read_bytes()).hexdigest()
ok = ok and all(hashlib.sha256((root/name).read_bytes()).hexdigest() == value for name, value in hashes.items())
result.update(passed=bool(ok), sourceHashes=hashes)
report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': bool(ok), 'checks': [{k: c[k] for k in ('name', 'passed')} for c in result.get('checks', [])], 'log': str(out / (a.mode + '.log'))}))
if not ok:
    print(log[-3000:])
raise SystemExit(0 if ok else 1)
