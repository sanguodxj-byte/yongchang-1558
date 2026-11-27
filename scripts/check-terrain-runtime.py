"""Capture the shipped terrain through actual UI/camera input on both platforms."""
import argparse,hashlib,json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8767/');p.add_argument('--runtime',default='.build/dora-opengl/Dora.exe');p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe');p.add_argument('--output',required=True);a=p.parse_args()
out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True);exe=(root/a.runtime).resolve();project=root/'dist/dora'
layout=json.loads((root/'game/assets/world.json').read_text('utf-8'))['map'];width,height=layout['width'],layout['height']
report={'passed':False,'errors':[]};targets={'village':[46,47],'ridge':[10,56],'quarry':[22,42],'fields':[49,70],'estuary':[94,81],'island':[layout['island']['x']+3,43]}
def cli(arguments,timeout=55):
 r=subprocess.run([str(exe),'cli',*arguments],cwd=exe.parent,capture_output=True,timeout=timeout);text=(r.stdout+r.stderr).decode('utf-8',errors='replace');assert r.returncode==0,text;return text
def command(code,name):
 path=root/'.build'/('terrain-'+name+'.json');path.write_text(json.dumps({'mode':'lua','code':code,'timeoutSeconds':45}),encoding='utf-8');result=json.loads(cli(['agent','command','-p',str(project),'--input',str(path)]));(out/(name+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');assert result['success'],result;return result
try:
 command('local D=require("Dora");D.Director:endGameCapture();local nodes={};D.Director.ui:traverseAll(function(n)local g=D.tolua.cast(n,"GodotNode");if g then nodes[#nodes+1]=g end return false end);for _,g in ipairs(nodes)do local done=false;g:unloadAsync(function(ok,e)assert(ok,e);done=true end);while not done do D.sleep() end end','unload')
 cli(['stop'])
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=a.browser,headless=True);page=b.new_page(viewport={'width':1600,'height':1000});page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
  receipt=page.request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256'];assert receipt['sha256']==hashlib.sha256((project/'game.pck').read_bytes()).hexdigest()
  page.goto(a.url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
  def frame():
   n=page.evaluate('__yongchang.state.frame');page.wait_for_function('(n)=>__yongchang.state.frame>n',arg=n)
  def click(label):
   page.wait_for_function('(s)=>__yongchang.ui[s]!==undefined',arg=label);r=page.evaluate('(s)=>__yongchang.ui[s]',label);page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2,delay=160);frame()
  click('步入永昌卫城');click('开始守望');report['web']={}
  for name,(x,z) in targets.items():
   m=page.evaluate('__yongchang.state.minimap');page.mouse.click(m['x']+6+x/width*(m['width']-12),m['y']+6+z/height*(m['height']-12),delay=160);frame();frame()
   state=page.evaluate('__yongchang.state');assert abs(state['camera'][0]-(x-width/2))<=width/(m['width']-12) and abs(state['camera'][1]-(z-height/2))<=height/(m['height']-12),state
   assert state['terrain_version']==2;page.screenshot(path=str(out/('h5-'+name+'.png')));report['web'][name]=state
  page.keyboard.press('m');frame();page.wait_for_function('__yongchang.state.zoom===150');page.screenshot(path=str(out/'h5-overview.png'))
  # Bounded camera rotation samples; each is an actual key event and rendered frame.
  for i in range(4):page.keyboard.press('q');frame();page.screenshot(path=str(out/f'h5-angle-{i}.png'))
  assert not report['errors'],report['errors'];b.close()
 cli(['run','-p',str(project),'--entry','init.lua','--timeout','40'])
 code=r'''
local D=require("Dora");local game
D.Director.ui:traverseAll(function(n)local g=D.tolua.cast(n,"GodotNode");if g then game=g end return false end)
assert(game);local start=D.App.runningTime
while not game.running do assert(game.lastError=="",game.lastError);assert(D.App.runningTime-start<30);D.sleep() end;D.sleep(.5)
local function state()
 local result
 D.GodotNode:inspectRuntimeSceneAsync(game.projectPath,D.json.encode({nodePath="Yongchang",maxNodes=1,properties={"script:audit_screen","script:audit_enter_button","script:audit_start_button","script:audit_map_origin","script:audit_map_extent","script:audit_terrain_version","script:content_hash","script:camera_target","script:zoom"}}),function(ok,text)assert(ok,text);result=D.json.decode(text)end)
 while not result do D.sleep() end;assert(result.success and #result.nodes==1);local values={}
 for k,v in pairs(result.nodes[1].properties)do values[k:gsub("script:","")]=v.value end;return values
end
local function click(x,y)game:sendPointerMove(x,y);D.sleep(.12);game:sendPointer(x,y,1,true);D.sleep(.15);game:sendPointer(x,y,1,false);D.sleep(.45)end
local initial=state();click(initial.audit_enter_button[1],initial.audit_enter_button[2]);local menu=state();click(menu.audit_start_button[1],menu.audit_start_button[2])
local width,height=MAP_WIDTH,MAP_HEIGHT
local results={};local targets=D.json.decode(TARGETS)
local function capture(name)
 assert(D.Director:beginGameCapture());D.sleep(.1);local done=false;assert(D.Director:captureGameAsync(OUTPUT.."/dora-"..name..".png",function(ok)assert(ok);done=true end));while not done do D.sleep() end;D.Director:endGameCapture()
end
for _,item in ipairs(targets)do
 local name,point=item[1],item[2];local s=state();local at,size=s.audit_map_origin,s.audit_map_extent
 click(at[1]+6+point[1]/width*(size[1]-12),at[2]+6+point[2]/height*(size[2]-12));local actual=state()
 assert(actual.audit_terrain_version==2);assert(math.abs(actual.camera_target[1]-(point[1]-width/2))<=width/(size[1]-12) and math.abs(actual.camera_target[3]-(point[2]-height/2))<=height/(size[2]-12),name)
 results[name]=actual;capture(name)
end
game:sendKey("M",true);D.sleep(.15);game:sendKey("M",false);D.sleep(.45);assert(state().zoom==150);capture("overview")
print("TERRAIN_CAPTURE "..D.json.encode(results))
'''.replace('MAP_WIDTH',str(width)).replace('MAP_HEIGHT',str(height)).replace('TARGETS',json.dumps(json.dumps(list(targets.items())))).replace('OUTPUT',json.dumps(out.as_posix()))
 r=command(code,'native');report['dora']=json.loads(r['output'].split('TERRAIN_CAPTURE ',1)[1]);report['passed']=True
finally:(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'pckSha256':report.get('pckSha256'),'views':len(targets)+1}))
