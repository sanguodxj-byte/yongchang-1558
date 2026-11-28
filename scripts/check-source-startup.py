"""Verify the README's source-only Dora route in an explicitly supplied checkout."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--project', required=True, type=Path)
p.add_argument('--runtime', required=True, type=Path)
p.add_argument('--output', required=True, type=Path)
a = p.parse_args()
project, runtime, out = a.project.resolve(), a.runtime.resolve(), a.output.resolve()
out.mkdir(parents=True, exist_ok=True)
assert not (project / 'game.pck').exists(), 'This check must load source, not a PCK'
sources = {f.relative_to(project).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest()
           for f in [project / 'init.lua', project / 'game/project.godot', *sorted((project / 'game/scripts').glob('*.gd'))]}
report = {'passed': False, 'project': str(project), 'sourceHashes': sources}


def cli(arguments, timeout=70):
    r = subprocess.run([str(runtime), 'cli', *arguments], cwd=runtime.parent, capture_output=True, timeout=timeout)
    text = (r.stdout + r.stderr).decode('utf-8', errors='replace')
    assert r.returncode == 0, text
    return text


try:
    report['commit'] = subprocess.check_output(['git', '-C', str(project), 'rev-parse', 'HEAD']).decode().strip()
    (out / 'run.json').write_text(cli(['run', '-p', str(project), '--entry', 'init.lua', '--timeout', '45']), encoding='utf-8')
    code = r'''
local D=require("Dora"); local game
D.Director.ui:traverseAll(function(n)local g=D.tolua.cast(n,"GodotNode");if g then game=g end return false end)
assert(game,"Missing GodotNode");local began=D.App.runningTime
while not game.running do assert(game.lastError=="",game.lastError);assert(D.App.runningTime-began<35,"Source startup timeout");D.sleep() end
assert(not game.projectPath:match("%.pck$"),"Loaded PCK instead of source")
local function state()
 local result
 D.GodotNode:inspectRuntimeSceneAsync(game.projectPath,D.json.encode({nodePath="Yongchang",maxNodes=1,properties={"script:audit_state","script:audit_screen","script:audit_enter_button","script:audit_start_button","script:audit_confirm_new_button","script:audit_build_button","script:audit_farm_button","script:audit_build_probe","script:audit_built","script:audit_wood","script:audit_gold","script:content_hash"}}),function(ok,text)assert(ok,text);result=D.json.decode(text)end)
 while not result do D.sleep() end
 assert(result.success and #result.nodes==1,"No running scene")
 local values={};for k,v in pairs(result.nodes[1].properties)do values[k:gsub("script:","")]=v.value end
 return values
end
local function click(p)
 game:sendPointerMove(p[1],p[2]);D.sleep(.1);game:sendPointer(p[1],p[2],1,true);D.sleep(.1);game:sendPointer(p[1],p[2],1,false);D.sleep(.7)
end
D.sleep(.7);local initial=state();assert(initial.audit_state=="title")
click(initial.audit_enter_button);assert(state().audit_screen=="menu");click(state().audit_start_button)
if state().audit_screen=="confirm_new" then click(state().audit_confirm_new_button) end
assert(state().audit_state=="play");click(state().audit_build_button);click(state().audit_farm_button)
local before=state();click(before.audit_build_probe);local after=state()
assert(after.audit_built==before.audit_built+1 and after.audit_wood==before.audit_wood-10,"Source build input failed")
print("SOURCE_CHECK "..D.json.encode({passed=true,sourcePath=game.projectPath,initial=initial,built=after,lastError=game.lastError}))
local done=false;game:unloadAsync(function(ok,err)assert(ok,err);done=true end);while not done do D.sleep() end
'''
    request = out / 'request.json'
    request.write_text(json.dumps({'mode': 'lua', 'code': code, 'timeoutSeconds': 70}), encoding='utf-8')
    result = json.loads(cli(['agent', 'command', '-p', str(project), '--input', str(request), '--timeout', '85'], 100))
    (out / 'command.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    assert result.get('success'), result
    details = json.loads(result['output'].split('SOURCE_CHECK ', 1)[1])
    assert details['passed'] and details['lastError'] == ''
    assert all(hashlib.sha256((project / f).read_bytes()).hexdigest() == h for f, h in sources.items())
    report.update(passed=True, runtime=details)
finally:
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': report['passed'], 'commit': report.get('commit'), 'project': str(project)}, ensure_ascii=False))
