"""Check crowd/audio behaviour and, optionally, their shared-game regressions."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
p = argparse.ArgumentParser()
p.add_argument('--output', default='.build/polish-v2/checks')
p.add_argument('--full', action='store_true')
p.add_argument('--godot', default=r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe')
a = p.parse_args()
out = (ROOT / a.output).resolve()
out.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
env['APPDATA'] = env['LOCALAPPDATA'] = str(out / 'profile')
inputs = [f for folder in ['scripts', 'shaders', 'tests', 'assets/music']
          for f in (ROOT / 'game' / folder).rglob('*') if f.is_file()]
inputs += [ROOT / 'game/assets/world.json', ROOT / 'game/assets/geometry.bin.z']
hashes = {f.relative_to(ROOT).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest() for f in inputs}
result = {'passed': False, 'sourceHashes': hashes, 'checks': []}
receipt = out / 'report.json'
receipt.write_text(json.dumps(result, indent=2), encoding='utf-8')
jobs = []
for name in ['crowd', 'audio']:
    report = out / (name + '.json')
    jobs.append((name, [a.godot, '--headless', '--path', str(ROOT / 'game'), '--script',
                       'res://tests/' + name + '-check.gd', '--', '--report=' + str(report)], report))
if a.full:
    jobs.extend([
        ('common', [sys.executable, '-X', 'utf8', 'scripts/test-common.py'], ROOT / '.build/common-report.json'),
        ('fortress', [sys.executable, '-X', 'utf8', 'scripts/check-fortress.py', '--output', str(out / 'fortress')], out / 'fortress/all-report.json'),
        ('worksites', [sys.executable, '-X', 'utf8', 'scripts/check-worksites.py', '--output', str(out / 'worksites')], out / 'worksites/report.json'),
        ('motion', [sys.executable, '-X', 'utf8', 'scripts/check-motion-physics.py', '--output', str(out / 'motion')], out / 'motion/report.json'),
        ('rts', [sys.executable, '-X', 'utf8', 'scripts/check-rts.py', '--output', str(out / 'rts.json')], out / 'rts.json'),
        ('archive', [sys.executable, '-X', 'utf8', 'scripts/check-archive.py'], ROOT / '.build/completion/archive/report.json'),
    ])
for name, command, report in jobs:
    report.unlink(missing_ok=True)
    try:
        run = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, timeout=360)
        log = (run.stdout + run.stderr).decode('utf-8', errors='replace')
        (out / (name + '.log')).write_text(log, encoding='utf-8')
        data = json.loads(report.read_text('utf-8')) if report.exists() else {}
        passed = run.returncode == 0 and data.get('passed') is True and 'SCRIPT ERROR:' not in log
        if name in ['common', 'archive']:
            (out / (name + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        item = {'name': name, 'passed': passed, 'count': len(data.get('checks', [])), 'report': str(report)}
    except (subprocess.TimeoutExpired, OSError, ValueError) as exc:
        item = {'name': name, 'passed': False, 'error': str(exc)}
    result['checks'].append(item)
    receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(item, ensure_ascii=False), flush=True)
result['sourcesStable'] = all((ROOT / path).is_file() and hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == value for path, value in hashes.items())
result['passed'] = result['sourcesStable'] and all(c['passed'] for c in result['checks'])
receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
raise SystemExit(0 if result['passed'] else 1)
