"""Run the packaged game inside Dora, send native bridge input, read live state."""
import argparse,json,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--runtime',default=r'D:\123\Dora.exe');p.add_argument('--output',required=True);p.add_argument('--project',default='dist/dora')
a=p.parse_args();root=Path(__file__).resolve().parent.parent;out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
exe=Path(a.runtime).resolve();project=(root/a.project).resolve()
(out/'dora-report.json').write_text(json.dumps({'passed':False,'status':'running','pckSha256':hashlib.sha256((project/'game.pck').read_bytes()).hexdigest()}),encoding='utf-8')
def cli(args,timeout=55):
 r=subprocess.run([str(exe),'cli',*args],cwd=exe.parent,capture_output=True,timeout=timeout)
 text=(r.stdout+r.stderr).decode('utf-8',errors='replace')
 if r.returncode:raise RuntimeError(text)
 return text
cleanup='local D=require("Dora"); D.Director:endGameCapture(); local nodes={}; D.Director.ui:traverseAll(function(n) local g=D.tolua.cast(n,"GodotNode"); if g then nodes[#nodes+1]=g end return false end); for _,g in ipairs(nodes)do local done=false; g:unloadAsync(function(ok,err)assert(ok,err);done=true end); while not done do D.sleep() end end'
request=root/'.build/dora-cleanup.json';request.write_text(json.dumps({'mode':'lua','code':cleanup,'timeoutSeconds':20}),encoding='utf-8')
clean=json.loads(cli(['agent','command','-p',str(project),'--input',str(request)]))
assert clean.get('success'),clean
cli(['stop'])
cli(['run','-p',str(project),'--entry','init.lua','--timeout','40'])
code=r'''
local D = require("Dora")
local game
D.Director.ui:traverseAll(function(node)
 local g = D.tolua.cast(node,"GodotNode")
 if g then game = g end
 return false
end)
assert(game,"No GodotNode in Dora")
local started=D.App.runningTime
while not game.running do assert(game.lastError=="",game.lastError);assert(D.App.runningTime-started<30,"Dora startup timeout");D.sleep() end
D.sleep(.6)
local function state()
 local result
 D.GodotNode:inspectRuntimeSceneAsync(game.projectPath,D.json.encode({nodePath="Yongchang",maxNodes=1,properties={"script:audit_state","script:audit_screen","script:audit_context","script:audit_clan_button","script:audit_command_button","script:audit_fortress_json","script:audit_map_size","script:audit_enter_button","script:audit_wood","script:audit_gold","script:audit_built","script:audit_units","script:audit_rigged_units","script:audit_workers","script:audit_build_probe","script:content_hash","script:audit_start_button","script:audit_confirm_new_button","script:audit_build_button","script:audit_farm_button","script:audit_army_button","script:audit_spearman_button","script:audit_attack_button","script:audit_donate_button","script:audit_stance","script:audit_donations","script:zoom","script:build_rotation","script:selected_build"}}),function(ok,text)
  assert(ok,text);result=D.json.decode(text)
 end)
 while not result do D.sleep() end
 assert(result.success and #result.nodes==1,"Live state missing")
 local values={}
 for k,v in pairs(result.nodes[1].properties)do values[k:gsub("script:","")]=v.value end
 return values
end
local function click(x,y)
 game:sendPointerMove(x,y);D.sleep(.15);game:sendPointer(x,y,1,true);D.sleep(.15);game:sendPointer(x,y,1,false);D.sleep(.6)
end
local function key(name)
 game:sendKey(name,true);D.sleep(.15);game:sendKey(name,false);D.sleep(.6)
end
local function button(name)
 local p=state()["audit_"..name.."_button"];assert(p and p[1]>0,"Missing button "..name);click(p[1],p[2])
end
local report={initial=state(),runtime=D.App.version,project=game.projectPath,checks={}}
local function check(name,ok,detail)
 report.checks[#report.checks+1]={name=name,passed=ok,detail=detail}
 assert(ok,name.." "..D.json.encode(detail or {}))
end
check("title",report.initial.audit_state=="title")
check("articulated unit rigs",report.initial.audit_rigged_units>=12,report.initial.audit_rigged_units)
local battle=D.json.decode(report.initial.audit_fortress_json)
check("offshore fortress",battle.gates==2 and battle.towers==4 and battle.cannons==2 and battle.keep_max_hp==5000 and battle.crossing_seconds>29,battle)
button("enter");check("main menu",state().audit_screen=="menu")
button("start")
if state().audit_screen=="confirm_new" then button("confirm_new") end
local playing=state();check("start",playing.audit_state=="play",playing)
key("Escape");local paused=state();D.sleep(.6);local still=state()
check("pause",paused.audit_state=="pause" and paused.audit_gold==still.audit_gold,still)
key("Escape");check("resume",state().audit_state=="play")
button("build")
button("farm")
key("R");check("rotate",state().build_rotation==1)
local before=state();local point=before.audit_build_probe
click(point[1],point[2]);local built=state()
check("build farm",built.audit_built==1 and built.audit_wood==before.audit_wood-10,built)
check("worker skeleton spawned",built.audit_workers>=1 and built.audit_rigged_units>playing.audit_rigged_units,built.audit_rigged_units)
key("Escape");button("army");button("spearman")
local recruited=state();check("recruit",recruited.audit_units>playing.audit_units,recruited)
button("army");button("clan");check("clan actions",state().audit_context=="clan");button("donate");check("donate",state().audit_donations==1)
button("clan");button("command");check("command options",state().audit_context=="command");button("attack");check("attack",state().audit_stance=="attack")
key("M");check("overview",state().zoom==150)
report.final=state();report.passed=true
local scope=D.Director:beginGameCapture()
assert(scope,"Cannot begin capture")
D.sleep(.2)
local done=false
assert(D.Director:captureGameAsync(CAPTURE_PATH,function(ok)assert(ok,"Capture failed");done=true end))
while not done do D.sleep() end
D.Director:endGameCapture()
print("DORA_REPORT "..D.json.encode(report))
'''
code=code.replace('CAPTURE_PATH',json.dumps((out/'dora-play.png').as_posix()))
# Observe and operate the same sound controls as H5; keep the engine output
# meter distinct from a human listening review.
code=code.replace('"script:audit_state","script:audit_screen"', '"script:audit_audio_json","script:audit_ui_json","script:audit_state","script:audit_screen"')
audio_check=r'''
D.sleep(4)
local score=D.json.decode(state().audit_audio_json)
check("native battle music",score.music=="battle" and score.musicPlaying,score)
local pause=D.json.decode(state().audit_ui_json)["暂停"];assert(pause,"Pause control missing");click(pause.x+pause.width/2,pause.y+pause.height/2)
check("native pause sound menu",state().audit_state=="pause")
local function sound_button()
 local r=D.json.decode(state().audit_ui_json)["声音 开 / 关"];assert(r,"Sound control missing");click(r.x+r.width/2,r.y+r.height/2)
end
sound_button();D.sleep(3)
local muted=D.json.decode(state().audit_audio_json)
check("native sound mute",not muted.enabled and muted.voices==0 and muted.musicDb<=-79,muted)
sound_button();D.sleep(3)
local restored=D.json.decode(state().audit_audio_json)
check("native score preserved across pause and mute",restored.enabled and restored.musicPlaying and restored.music=="battle" and restored.musicDb>=-30,restored)
key("Escape")
'''
code=code.replace('report.final=state();report.passed=true',audio_check+'\nreport.final=state();report.passed=true')
request=root/'.build/dora-check-request.json';request.write_text(json.dumps({'mode':'lua','code':code,'timeoutSeconds':120}),encoding='utf-8')
text=cli(['agent','command','-p',str(project),'--input',str(request),'--timeout','135'],145)
(out/'dora-command.json').write_text(text,encoding='utf-8')
result=json.loads(text)
if not result.get('success'):raise SystemExit(result.get('message',text))
report=json.loads(result['output'].split('DORA_REPORT ',1)[1])
report['pckSha256']=hashlib.sha256((project/'game.pck').read_bytes()).hexdigest()
(out/'dora-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True))
