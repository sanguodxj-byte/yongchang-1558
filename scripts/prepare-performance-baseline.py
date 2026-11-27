"""Copy today's game and restore only the pre-optimization hot paths for A/B.

The reference is an archived, unoptimized scripts directory. The copy keeps
current rules, UI, saves and graphics. It never changes the working game.
"""
import argparse
import difflib
import hashlib
import json
import re
import shutil
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--reference', default='.build/performance/original/game/scripts')
p.add_argument('--output', required=True)
a = p.parse_args()
root = Path(__file__).resolve().parent.parent
out = (root / a.output).resolve()
reference = (root / a.reference).resolve()
assert out.is_relative_to(root / '.build') and not out.exists(), 'Use a new .build directory'


def function(text, name):
    match = re.search(r'^(?:static )?func ' + name + r'\(.*?(?=^(?:static )?func |\Z)', text, re.M | re.S)
    assert match, name
    return match.group()


shutil.copytree(root / 'game', out / 'game', ignore=shutil.ignore_patterns('.godot'))
changes = {}
for name in ['unit_rig.gd', 'session.gd', 'main.gd']:
    path = out / 'game/scripts' / name
    before = path.read_text('utf-8')
    old = (reference / name).read_text('utf-8')
    after = before
    if name == 'unit_rig.gd':
        after = old
    elif name == 'main.gd':
        after = after.replace(function(after, '_sync_visuals'), function(old, '_sync_visuals'), 1)
    else:
        for method in ['nearest_enemy', 'closest_structure', 'structure_by_id']:
            after = after.replace(function(after, method), function(old, method), 1)
        original_combat = function(old, '_combat')
        original_squad = original_combat[original_combat.index('\t\tvar sq={}'):original_combat.index('\t\tvar port=')]
        needle = '\t\tvar sq=squad_index.get(u.squad,{})\n'
        assert after.count(needle) == 1
        after = after.replace(needle, original_squad, 1)
        original_separation = original_combat[original_combat.index('\tvar actors=units+workers'):original_combat.index('\tfor s in structures:')]
        needle = '\tUnitSeparation.apply(self,units+workers)\n'
        assert after.count(needle) == 1
        after = after.replace(needle, original_separation, 1)
    assert after != before
    path.write_text(after, encoding='utf-8', newline='\n')
    (out / (name + '.diff')).write_text(''.join(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile='current/' + name, tofile='baseline/' + name)), encoding='utf-8')
    changes[name] = {'current': hashlib.sha256(before.encode()).hexdigest(), 'reference': hashlib.sha256(old.encode()).hexdigest(), 'baseline': hashlib.sha256(after.encode()).hexdigest()}

(out / 'baseline.json').write_text(json.dumps({'changes': changes, 'note': 'Current game with original rig, unconditional visual writes, linear queries and all-pairs separation. Index maintenance is retained for save compatibility.'}, indent=2), encoding='utf-8')
print(out)
