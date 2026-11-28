"""Run canal construction, enclosure, breach and save checks in the game engine."""
import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--godot', default=r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe')
parser.add_argument('--output', default='.build/water-defenses/logic.json')
args = parser.parse_args()
out = (root / args.output).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
sources = ['game/assets/world.json', 'game/scripts/session.gd', 'game/scripts/canal_defenses.gd',
           'game/scripts/unit_separation.gd', 'game/scripts/session_archive.gd', 'game/tests/water-defenses-check.gd']
hashes = {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in sources}
env = os.environ.copy()
env['APPDATA'] = env['LOCALAPPDATA'] = str(root / '.build/godot-profile')
if out.exists():
    out.unlink()
live = open(out.with_suffix(".live.log") if out.suffix else out / "live.log", "wb")
run = subprocess.run([args.godot, '--headless', '--path', str(root / 'game'), '--script',
                      'res://tests/water-defenses-check.gd', '--', '--report=' + str(out)],
                     env=env, stdout=live, stderr=subprocess.STDOUT, timeout=150)
live.close()
log = Path(live.name).read_text('utf-8', errors='replace')
out.with_suffix('.log').write_text(log, encoding='utf-8')
print(log.encode('ascii', errors='backslashreplace').decode())
report = json.loads(out.read_text('utf-8')) if out.exists() else {}
ok = run.returncode == 0 and 'SCRIPT ERROR:' not in log and report.get('passed', False)
ok = ok and all(hashlib.sha256((root / p).read_bytes()).hexdigest() == h for p, h in hashes.items())
report.update(passed=bool(ok), sourceHashes=hashes)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
raise SystemExit(0 if ok else 1)
