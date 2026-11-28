"""Render the actual water gate model, assembled city and shared construction UI."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--portrait', action='store_true')
parser.add_argument('--output', default='.build/water-defenses/views')
args = parser.parse_args()
out = (root / args.output).resolve()
out.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
env['APPDATA'] = env['LOCALAPPDATA'] = str(root / '.build/godot-profile')
live = open(out.with_suffix(".live.log") if out.suffix else out / "live.log", "wb")
run = subprocess.run([r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe',
                      '--path', str(root / 'game'), '--script', 'res://tests/water-defenses-visual.gd',
                      '--', '--output=' + str(out), *(['--portrait'] if args.portrait else [])],
                     env=env, stdout=live, stderr=subprocess.STDOUT, timeout=150)
live.close()
log = Path(live.name).read_text('utf-8', errors='replace')
(out / ('portrait.log' if args.portrait else 'render.log')).write_text(log, encoding='utf-8')
if run.returncode or 'SCRIPT ERROR:' in log or 'ERROR:' in log:
    raise SystemExit(log.encode('ascii', errors='backslashreplace').decode())
if args.portrait:
    shutil.copy2(out / 'buildings-waterGate.png', root / 'game/assets/ui/buildings-waterGate.png')
    print('Rendered model portrait into game/assets/ui/buildings-waterGate.png')
else:
    report = json.loads((out / 'visual.json').read_text('utf-8'))
    report['sourceHashes'] = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in (root / 'game/scripts').glob('*.gd')}
    (out / 'visual.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report['checks'], ensure_ascii=True))
    raise SystemExit(0 if report['passed'] else 1)
