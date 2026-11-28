"""Real Dora bridge mouse/key input against the same packaged controls as H5."""
import argparse,json,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--project',default='.build/control-repair/package/dora');p.add_argument('--output',default='.build/control-repair/native-input');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;project=(root/a.project).resolve();out=(root/a.output).resolve();out.mkdir(parents=True,exist_ok=True);exe=root/'.build/dora-opengl/Dora.exe'
def cli(args,timeout=160):
    r=subprocess.run([str(exe),'cli',*args],cwd=exe.parent,capture_output=True,timeout=timeout);text=(r.stdout+r.stderr).decode('utf-8',errors='replace');assert r.returncode==0,text;return text
code=r'''
local D=require("Dora")
local g;D.Director.ui:traverseAll(function(n)local x=D.tolua.cast(n,"GodotNode");if x then g=x end return false end);assert(g)
local report={passed=false,checks={}}
local function state()
 local result
 D.GodotNode:inspectRuntimeSceneAsync(g.projectPath,D.json.encode({nodePath="Yongchang",maxNodes=1,properties={"script:audit_input_json","script:audit_ui_json","script:audit_state","script:audit_screen","script:audit_built","script:build_rotation","script:selected_build","script:audit_enter_button","script:audit_start_button","script:audit_confirm_new_button","script:audit_build_button","script:audit_army_button","script:audit_clan_button","script:audit_command_button","script:audit_farm_button","script:audit_spearman_button","script:audit_attack_button"}}),function(ok,text)assert(ok,text);result=D.json.decode(text)end)
 while not result do D.sleep()end
 local p=result.nodes[1].properties;assert(not p["script:audit_input_json"].truncated,"Input observation truncated");local raw=p["script:audit_input_json"] and p["script:audit_input_json"].value or "{}";local s=assert(D.json.decode(raw),"Invalid input observation")
 s.ui=D.json.decode(p["script:audit_ui_json"].value or "{}") or {};s.state=p["script:audit_state"].value;s.screen=p["script:audit_screen"].value;s.built=p["script:audit_built"].value;s.rotation=p["script:build_rotation"].value;s.build=p["script:selected_build"].value
 local function rawvalue(q)if not q then return nil end;if type(q.value)=="table" then return q.value end;return D.json.decode(q.value or "") end
 local aliases={enter="audit_enter_button",start="audit_start_button",confirm_new="audit_confirm_new_button",build="audit_build_button",army="audit_army_button",clan="audit_clan_button",command="audit_command_button",farm="audit_farm_button",spearman="audit_spearman_button",attack="audit_attack_button"}
 for label,key in pairs(aliases)do local v=rawvalue(p["script:"..key]);if v and v[1] and v[1]>0 then s.ui[label]={x=v[1]-30,y=v[2]-20,width=60,height=40}end end
 return s
end
local function pointer(x,y,button,down)g:sendPointerMove(x,y);g:sendPointer(x,y,button,down);D.sleep(.12)end
local function click(x,y,button)pointer(x,y,button or 1,true);pointer(x,y,button or 1,false);D.sleep(.3)end
local function button(label)
 local ui=state().ui;local r=ui[label]
 if not r then local map={ ["步入永昌卫城"]="enter",["开始守望"]="start",["确认新局"]="confirm_new",["营造 B"]="build",["募勇"]="army",["宗族"]="clan",["军令"]="command",["江南水车稻田"]="farm",["毛竹狼筅乡勇"]="spearman"};r=ui[map[label] or ""] end
 if not r then for k,v in pairs(ui)do if k:match("^[^\n]+") == label then r=v;break end end end
 assert(r,"Missing control "..label);click(r.x+r.width/2,r.y+r.height/2)
end
local function key(k)g:sendKey(k,true);D.sleep(.12);g:sendKey(k,false);D.sleep(.35)end
local function distance(a,b)return math.sqrt((a[1]-b[1])^2+(a[3]-b[3])^2)/100 end
local function check(name,ok,detail)report.checks[#report.checks+1]={name=name,passed=ok,detail=detail};assert(ok,name.." "..D.json.encode(detail or {}))end
local s=state()
if s.screen=="play" then button("暂停");s=state()end
if s.screen=="pause" or s.screen=="defeat" or s.screen=="victory" then button("返回标题");s=state();if s.screen=="confirm_return"then button("确认返回")end;D.sleep(1)end
button("步入永昌卫城");button("开始守望");if state().screen=="confirm_new"then button("确认新局")end
check("native playable world",state().state=="play")
local before=state().camera
pointer(850,500,2,true);for i=1,10 do g:sendPointerMove(850+i*8,500+i*2);D.sleep(.04)end;pointer(930,520,2,false);D.sleep(.3)
check("native right drag pans",distance(before,state().camera)>.5)
before=state().camera;g:sendPointerMove(900,500);D.sleep(.4);check("native right release ends pan",distance(before,state().camera)<.01)
key("H");button("募勇");button("毛竹狼筅乡勇");button("募勇");s=state();check("native recruit selects",#s.selected==1)
local position=s.squads[1].positions[1]
click(900,670,2);s=state();check("native right click orders",#s.squads[1].order==2)
D.sleep(1.5);check("native commanded squad moves",distance(position,state().squads[1].positions[1])>.3)
key("S");check("native stop clears order",#state().squads[1].order==0)
s=state();local selected=s.selected[1];before=s.camera
pointer(900,500,2,true);for i=1,10 do g:sendPointerMove(900+i*6,500+i*2);D.sleep(.04)end;pointer(960,520,2,false);D.sleep(.3)
s=state();check("native pan keeps selection and does not issue move",s.selected[1]==selected and #s.squads[1].order==0 and distance(before,s.camera)>.3)
local pts=s.squads[1].screens;local x0,y0,x1,y1=2000,2000,0,0;for _,p in ipairs(pts)do x0=math.min(x0,p[1]);y0=math.min(y0,p[2]);x1=math.max(x1,p[1]);y1=math.max(y1,p[2])end
pointer(x0-15,y0-15,1,true);for i=1,8 do g:sendPointerMove(x0-15+(x1-x0+30)*i/8,y0-15+(y1-y0+30)*i/8);D.sleep(.04)end;pointer(x1+15,y1+15,1,false);D.sleep(.3)
check("native box selects",state().selected[1]==selected)
click(1200,800,2);local first_order=state().squads[1].order;g:sendKey("Shift",true);D.sleep(.2);click(1100,820,2);g:sendKey("Shift",false);check("native Shift queues waypoint",state().squads[1].queue==1,{first=first_order,after=state().squads[1]});key("S")
key("A");click(900,630);check("native attack move gets order",#state().squads[1].order==2);key("S")
local yaw=state().yaw;key("Q");check("native keyboard rotates",state().yaw~=yaw);key("E")
report.passed=true;print("INPUT_REPORT "..D.json.encode(report))
'''
request=out/'request.json';request.write_text(json.dumps({'mode':'lua','code':code,'timeoutSeconds':120}),encoding='utf-8')
report={'passed':False,'pckSha256':hashlib.sha256((project/'game.pck').read_bytes()).hexdigest()}
try:
    cli(['stop'])
    cli(['run','-p',str(project),'--entry','init.lua','--timeout','40'],55)
    raw=cli(['agent','command','-p',str(project),'--input',str(request),'--timeout','135']);(out/'command.json').write_text(raw,encoding='utf-8');result=json.loads(raw);assert result.get('success'),result
    report.update(json.loads(result['output'].split('INPUT_REPORT ',1)[1]));print(json.dumps(report,ensure_ascii=False))
finally:(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
