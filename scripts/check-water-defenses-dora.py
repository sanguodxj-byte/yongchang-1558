"""Exercise the shipped water gate using Dora pointer/key input and read-only state."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='.build/water-defenses/dora')
args = parser.parse_args()
out = (root / args.output).resolve();out.mkdir(parents=True, exist_ok=True)
runtime = root / '.build/dora-opengl/Dora.exe'
project = root / 'dist/dora'
report = {'passed': False, 'pckSha256': hashlib.sha256((project/'game.pck').read_bytes()).hexdigest()}

def cli(arguments, timeout=90):
    result = subprocess.run([str(runtime), 'cli', *arguments], cwd=runtime.parent, capture_output=True, timeout=timeout)
    text = (result.stdout + result.stderr).decode('utf-8', errors='replace')
    assert result.returncode == 0, text
    return text

try:
    (out/'run.json').write_text(cli(['run', '-p', str(project), '--entry', 'init.lua', '--timeout', '40']), encoding='utf-8')
    code = r'''
local D=require("Dora");local g
D.Director.ui:traverseAll(function(n)local node=D.tolua.cast(n,"GodotNode");if node then g=node end return false end);assert(g)
local began=D.App.runningTime
while not g.running do assert(g.lastError=="",g.lastError);assert(D.App.runningTime-began<35);D.sleep()end
local function state()
 local result
 D.GodotNode:inspectRuntimeSceneAsync(g.projectPath,D.json.encode({nodePath="Yongchang",maxNodes=1,properties={"script:audit_construction_json","script:audit_input_json","script:audit_state","script:audit_screen","script:audit_enter_button","script:audit_start_button","script:audit_confirm_new_button","script:audit_build_button","script:audit_viewport","script:audit_map_origin","script:audit_map_extent","script:content_hash"}}),function(ok,text)assert(ok,text);result=D.json.decode(text)end)
 while not result do D.sleep()end;assert(result.success)
 local s={};for k,v in pairs(result.nodes[1].properties)do assert(not v.truncated,k.." truncated");s[k:gsub("script:","")]=v.value end
 s.construction=D.json.decode(s.audit_construction_json);s.camera=D.json.decode(s.audit_input_json)
 return s
end
local function click(p)
 g:sendPointerMove(p[1],p[2]);D.sleep(.18);g:sendPointer(p[1],p[2],1,true);D.sleep(.12);g:sendPointer(p[1],p[2],1,false);D.sleep(.45)
end
local function key(k)g:sendKey(k,true);D.sleep(.12);g:sendKey(k,false);D.sleep(.4)end
local checks={}
local function check(name,ok,detail)checks[#checks+1]={name=name,passed=ok,detail=detail};assert(ok,name.." "..D.json.encode(detail or {}))end
D.sleep(.5);local s=state();assert(s.audit_screen=="title")
click(s.audit_enter_button);click(state().audit_start_button)
if state().audit_screen=="confirm_new"then click(state().audit_confirm_new_button)end
s=state();check("native play",s.audit_state=="play")
local m,e=s.audit_map_origin,s.audit_map_extent
click({m[1]+6+38.5/224*(e[1]-12),m[2]+6+38.5/96*(e[2]-12)})
click(state().audit_build_button);click(assert(state().construction.buttons.castle));click(assert(state().construction.buttons.waterGate))
s=state();check("native watergate card",s.construction.selected=="waterGate")
local before=s.construction;local c=s.camera;local v=s.audit_viewport
local dx=38.5-112-c.camera[1]/100;local dy=-.22-c.camera[2]/100;local dz=38.5-48-c.camera[3]/100
local x=v[1]/2+(dx*math.cos(c.yaw)-dz*math.sin(c.yaw))*v[2]/c.zoom
local y=v[2]/2-(-dx*math.sin(c.yaw)+dy-dz*math.cos(c.yaw))/math.sqrt(2)*v[2]/c.zoom
key("R");click({x,y});s=state()
check("native wrong rotation has no charge",not s.construction.valid and s.construction.waterGates==0 and s.construction.stone==before.stone,s.construction)
key("R");click({x,y});s=state()
check("native paid watergate",s.construction.waterGates==1 and s.construction.stone==before.stone-16 and s.construction.wood==before.wood-4 and s.construction.iron==before.iron-2,s.construction)
key("Escape")
local scope=D.Director:beginGameCapture();assert(scope);D.sleep(.2)
local done=false;assert(D.Director:captureGameAsync(CAPTURE_PATH,function(ok)assert(ok);done=true end));while not done do D.sleep()end;D.Director:endGameCapture()
print("WATER_DEFENSES "..D.json.encode({passed=true,checks=checks,worldHash=s.content_hash,lastError=g.lastError}))
local unloaded=false;g:unloadAsync(function(ok,err)assert(ok,err);unloaded=true end);while not unloaded do D.sleep()end
'''
    code = code.replace('CAPTURE_PATH', json.dumps((out/'built.png').as_posix()))
    request = out/'request.json';request.write_text(json.dumps({'mode': 'lua', 'code': code, 'timeoutSeconds': 90}), encoding='utf-8')
    response = json.loads(cli(['agent', 'command', '-p', str(project), '--input', str(request), '--timeout', '100'], timeout=115))
    (out/'command.json').write_text(json.dumps(response, ensure_ascii=False, indent=2), encoding='utf-8')
    assert response.get('success'), response
    result = json.loads(response['output'].split('WATER_DEFENSES ', 1)[1])
    assert result['passed'] and result['lastError'] == ''
    report.update(result)
finally:
    (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=True))
