"""Compare rendered UI geometry and captures across Dora and H5 viewport sizes."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:8767/')
p.add_argument('--runtime',default='.build/dora-opengl/Dora.exe')
p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe')
p.add_argument('--output',required=True)
p.add_argument('--native-only',action='store_true')
a=p.parse_args();root=Path(__file__).resolve().parent.parent
out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
exe=(root/a.runtime).resolve();project=root/'dist/dora'
report=json.loads((out/'report.json').read_text('utf-8')) if a.native_only else {'passed':False,'web':{},'errors':[]}
report['passed']=False
if a.native_only:
 assert len(report['web'])==4 and not report['errors']
 assert report['pckSha256']==hashlib.sha256((project/'game.pck').read_bytes()).hexdigest()

def cli(arguments,timeout=50):
 r=subprocess.run([str(exe),'cli',*arguments],cwd=exe.parent,capture_output=True,timeout=timeout)
 result=(r.stdout+r.stderr).decode('utf-8',errors='replace')
 if r.returncode:raise RuntimeError(result)
 return result

def command(code,name):
 path=root/'.build'/('ui-parity-'+name+'.json')
 path.write_text(json.dumps({'mode':'lua','code':code,'timeoutSeconds':120}),encoding='utf-8')
 result=json.loads(cli(['agent','command','-p',str(project),'--input',str(path),'--timeout','135'],145))
 (out/(name+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 assert result.get('success'),result
 return result

try:
 # Avoid measuring browser rendering while the other renderer is active.
 command('local D=require("Dora");D.Director:endGameCapture();local nodes={};D.Director.ui:traverseAll(function(n)local g=D.tolua.cast(n,"GodotNode");if g then nodes[#nodes+1]=g end return false end);for _,g in ipairs(nodes)do local done=false;g:unloadAsync(function(ok,e)assert(ok,e);done=true end);while not done do D.sleep() end end','unload')
 cli(['stop'])
 if not a.native_only:
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path=a.browser,headless=True)
   for width,height,dpr in [(1280,720,1),(1100,700,1),(1000,1000,1),(1920,1080,1.5)]:
    key=f'{width}x{height}@{dpr}'
    context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=dpr)
    page=context.new_page();page.set_default_timeout(20000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    response=page.request.get(a.url+'BUILD.json');receipt=response.json()
    local_hash=hashlib.sha256((project/'game.pck').read_bytes()).hexdigest()
    assert receipt['sha256']==local_hash
    report['pckSha256']=local_hash
    page.goto(a.url)
    page.wait_for_function('window.__yongchang?.state?.state==="title"',timeout=120000)
    states={};report['web'][key]=states

    def frame():
     before=page.evaluate('__yongchang.state.frame')
     page.wait_for_function('(n)=>__yongchang.state.frame>n',arg=before)
    def click(label):
     page.wait_for_function('(k)=>__yongchang.ui[k]!==undefined',arg=label)
     rect=page.evaluate('(k)=>__yongchang.ui[k]',label);canvas=page.locator('#canvas').bounding_box()
     x=canvas['x']+(rect['x']+rect['width']/2)*canvas['width']/1600
     y=canvas['y']+(rect['y']+rect['height']/2)*canvas['height']/1000
     page.mouse.move(x,y);frame();page.mouse.down();frame();page.mouse.up();frame()
    def capture(name):
     frame();frame()
     state=page.evaluate('__yongchang.state');ui=page.evaluate('__yongchang.ui');canvas=page.locator('#canvas').bounding_box()
     assert state['viewport']==[1600,1000],(key,name,state['viewport'])
     scale=min(width/1600,height/1000)
     expected={'width':1600*scale,'height':1000*scale,'x':(width-1600*scale)/2,'y':(height-1000*scale)/2}
     assert all(abs(canvas[k]-v)<.1 for k,v in expected.items()),(key,canvas,expected)
     states[name]={'ui':ui,'uiHash':state['ui_hash'],'viewport':state['viewport'],'canvas':canvas,'state':state['state']}
     if key!='1280x720@1':
      assert states[name]['uiHash']==report['web']['1280x720@1'][name]['uiHash'],(key,name,'UI layout changed')
     page.screenshot(path=str(out/f'h5-{key}-{name}.png'))

    capture('title');click('步入永昌卫城');capture('menu');click('开始守望');page.wait_for_function('__yongchang.state.state==="play"');capture('play')
    assert set(page.evaluate('__yongchang.ui'))=={'宗族','速度','暂停','全图 M','营造 B','募勇','军令','资源定位','定位下一步'}
    click('宗族');capture('clan');click('宗族');click('军令');capture('command');click('军令')
    click('营造 B');page.wait_for_function('__yongchang.state.tray==="build"');capture('build')
    click('永昌城防');capture('castle');click('神机军工');capture('military')
    click('营造 B');click('募勇');page.wait_for_function('__yongchang.state.tray==="army"');capture('army')
    click('募勇');click('暂停');page.wait_for_function('__yongchang.state.state==="pause"');capture('pause')
    click('操作与史料');capture('help');click('返回');click('开源与授权');capture('license')
    context.close()
    print('H5 UI matched: '+key,flush=True)
   browser.close()

 baseline=report['web']['1280x720@1']
 cli(['run','-p',str(project),'--entry','init.lua','--timeout','40'])
 code=r'''
local D=require("Dora");local game
D.Director.ui:traverseAll(function(n)local g=D.tolua.cast(n,"GodotNode");if g then game=g end return false end)
assert(game,"No GodotNode");local started=D.App.runningTime
while not game.running do assert(game.lastError=="",game.lastError);assert(D.App.runningTime-started<30,"Startup timeout");D.sleep() end
D.sleep(.5)
local reference=D.json.decode(REFERENCE);local results={}
local function state()
 local result
 D.GodotNode:inspectRuntimeSceneAsync(game.projectPath,D.json.encode({nodePath="Yongchang",maxNodes=1,properties={"script:audit_ui_hash","script:audit_viewport","script:audit_state","script:audit_screen","script:audit_confirm_new_button"}}),function(ok,text)assert(ok,text);result=D.json.decode(text)end)
 while not result do D.sleep() end
 assert(result.success and #result.nodes==1);local p=result.nodes[1].properties
 return {uiHash=p["script:audit_ui_hash"].value,viewport=p["script:audit_viewport"].value,state=p["script:audit_state"].value,screen=p["script:audit_screen"].value,confirm=p["script:audit_confirm_new_button"].value}
end
local function click(stage,label)
 local r=reference[stage].ui[label];assert(r,label)
 local x,y=r.x+r.width/2,r.y+r.height/2
 game:sendPointerMove(x,y);D.sleep(.15);game:sendPointer(x,y,1,true);D.sleep(.15);game:sendPointer(x,y,1,false);D.sleep(.5)
end
local function capture(name)
 local actual=state();local began=D.App.runningTime;local matches=0
 while matches<2 and D.App.runningTime-began<6 do
  if actual.uiHash==reference[name].uiHash then matches=matches+1 else matches=0 end
  if matches<2 then D.sleep(.25);actual=state() end
 end
 actual.layoutWaitSeconds=D.App.runningTime-began;results[name]=actual
 assert(actual.uiHash==reference[name].uiHash,"Dora UI mismatch: "..name.." "..D.json.encode(actual))
 assert(actual.viewport[1]==1600 and actual.viewport[2]==1000,"Dora viewport changed")
 assert(D.Director:beginGameCapture());D.sleep(.1);local done=false
 assert(D.Director:captureGameAsync(OUTPUT.."/dora-"..name..".png",function(ok)assert(ok);done=true end))
 while not done do D.sleep() end;D.Director:endGameCapture()
end
capture("title");click("title","步入永昌卫城");capture("menu");click("menu","开始守望");if state().screen=="confirm_new" then local p=state().confirm;game:sendPointer(p[1],p[2],1,true);D.sleep(.2);game:sendPointer(p[1],p[2],1,false);D.sleep(.6) end;capture("play")
click("play","宗族");capture("clan");click("clan","宗族");click("play","军令");capture("command");click("command","军令")
click("play","营造 B");capture("build");click("build","永昌城防");capture("castle");click("castle","神机军工");capture("military");click("military","营造 B");click("play","募勇");capture("army")
click("army","募勇");click("play","暂停");capture("pause")
click("pause","操作与史料");capture("help");click("help","返回");click("pause","开源与授权");capture("license")
print("UI_PARITY "..D.json.encode(results))
'''
 code=code.replace('REFERENCE',json.dumps(json.dumps(baseline,ensure_ascii=False),ensure_ascii=False)).replace('OUTPUT',json.dumps(out.as_posix()))
 result=command(code,'native')
 report['dora']=json.loads(result['output'].split('UI_PARITY ',1)[1])
 assert not report['errors'],report['errors']
 report['passed']=True
finally:
 (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'pckSha256':report['pckSha256'],'screens':12,'webConfigurations':4}))
