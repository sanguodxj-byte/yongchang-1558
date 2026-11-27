"""Exercise the shipped H5 package with real mouse/key/touch input and read-only state."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:8767/')
p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe')
p.add_argument('--output',required=True)
p.add_argument('--skip-touch',action='store_true')
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
report={'passed':False,'errors':[],'requests':[],'actions':[]}

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=a.browser,headless=True)
 page=None
 try:
  receipt=browser.new_context().request.get(a.url+'BUILD.json').json()
  report['pckSha256']=receipt['sha256']

  def boot(touch=False):
   global page
   context=browser.new_context(viewport={'width':1100 if touch else 1600,'height':700 if touch else 1000},has_touch=touch)
   current=context.new_page();page=current;current.set_default_timeout(20000)
   network=context.new_cdp_session(current)
   network.send('Network.enable',{'maxTotalBufferSize':256*1024*1024,'maxResourceBufferSize':100*1024*1024})
   current.on('pageerror',lambda e:report['errors'].append(str(e)))
   current.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
   current.on('requestfailed',lambda r:report['errors'].append(r.url+': '+str(r.failure)))
   current.on('request',lambda r:report['requests'].append(r.url))
   loaded={}
   def response(event):
    name=urlparse(event['response']['url']).path.rsplit('/',1)[-1] or 'index.html'
    if name in receipt['files']:loaded[name]=event['requestId']
   network.on('Network.responseReceived',response)
   current.goto(a.url,wait_until='load')
   current.wait_for_function('window.__yongchang?.state?.state==="title"',timeout=120000)
   for name in ['index.html','game.js','game.wasm','game.pck']:
    assert name in loaded, 'Missing runtime response: '+name
    body=network.send('Network.getResponseBody',{'requestId':loaded[name]})
    raw=base64.b64decode(body['body']) if body['base64Encoded'] else body['body'].encode('utf-8')
    assert hashlib.sha256(raw).hexdigest()==receipt['files'][name], 'Served file mismatch: '+name
   return current

  def state():return page.evaluate('__yongchang.state')
  def wait(expression):page.wait_for_function(expression)
  def frame():
   # Returning to the title recreates the observation object and resets frames.
   previous=page.evaluate('window.__yongchang?.state?.frame ?? -1')
   page.wait_for_function('(n)=>window.__yongchang?.state?.frame!==undefined && window.__yongchang.state.frame!==n',arg=previous)
  def point(x,y):
   canvas=page.locator('#canvas').bounding_box();view=state()['viewport']
   return canvas['x']+x*canvas['width']/view[0],canvas['y']+y*canvas['height']/view[1]
  def tap(x,y,touch=False):
   x,y=point(x,y)
   if touch:page.touchscreen.tap(x,y)
   else:
    page.mouse.move(x,y);frame()
    page.mouse.down();frame();page.mouse.up()
   frame()
  def click(label,touch=False):
   prefix=label.split('\n')[0]
   page.wait_for_function('(p)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===p)',arg=prefix)
   rect=page.evaluate('(p)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===p)[1]',prefix)
   tap(rect['x']+rect['width']/2,rect['y']+rect['height']/2,touch)
   report['actions'].append(('touch: ' if touch else '')+prefix)
  def key(name):
   page.keyboard.down(name);frame();page.keyboard.up(name);frame()

  page=boot();report['initial']=state();assert report['initial']['map']==[224,96] and report['initial']['fortress']['gates']==2 and report['initial']['fortress']['towers']==4 and report['initial']['fortress']['keep_max_hp']==5000;page.screenshot(path=str(out/'title.png'))
  click('步入永昌卫城');wait('__yongchang.state.screen==="menu"');click('开始守望');wait('__yongchang.state.state==="play"')
  page.screenshot(path=str(out/'play.png'))
  initial_ui=page.evaluate('__yongchang.ui')
  assert set(initial_ui)=={'宗族','速度','暂停','全图 M','营造 B','募勇','军令','资源定位','定位下一步'},initial_ui
  report['persistentButtons']=len(initial_ui)
  click('宗族');wait('__yongchang.state.context==="clan"')
  assert '乡约' in page.evaluate('__yongchang.ui')
  click('乡约');wait('__yongchang.state.policy==="harsh"')
  click('乡约');click('乡约');wait('__yongchang.state.policy==="balanced"')
  key('Escape');wait('__yongchang.state.context==="" && __yongchang.state.state==="play"')
  click('军令');wait('__yongchang.state.context==="command"')
  # Outside tap dismisses without pausing or issuing an order.
  tap(800,500);wait('__yongchang.state.context==="" && __yongchang.state.state==="play"')
  key('Escape');wait('__yongchang.state.state==="pause"')
  paused=state()['resources']['gold'];frame();frame()
  assert state()['resources']['gold']==paused
  click('继续守望');wait('__yongchang.state.state==="play"')
  click('营造 B');wait('__yongchang.state.tray==="build"')
  page.screenshot(path=str(out/'build-menu.png'))
  before=state()['resources']['wood']
  click('江南水车稻田');wait('__yongchang.state.selected_build==="farm" && __yongchang.state.tray===""')
  probe=page.evaluate('__yongchang.buildProbe');tap(probe['x'],probe['y'])
  wait('__yongchang.state.stats.built===1')
  assert state()['resources']['wood']==before-10,state()
  key('Escape');wait('__yongchang.state.selected_build==="" && __yongchang.state.state==="play"')
  # A context action appears only after its real building exists.
  world=json.loads((Path(__file__).resolve().parent.parent/'game/assets/world.json').read_text('utf-8'))
  click('营造 B');click('永昌城防');click(world['buildings']['demolish']['name'])
  wait('__yongchang.state.selected_build==="demolish"')
  probe=page.evaluate('__yongchang.buildProbe');tap(probe['x'],probe['y'])
  wait('__yongchang.state.buildings==='+str(report['initial']['buildings']));key('Escape')
  click('营造 B');click(world['buildings']['pitch']['name'])
  wait('__yongchang.state.selected_build==="pitch"')
  probe=page.evaluate('__yongchang.buildProbe');tap(probe['x'],probe['y'])
  wait('__yongchang.state.stats.built===2 && __yongchang.ui["引火"]!==undefined')
  key('Escape');page.screenshot(path=str(out/'context-fire.png'))
  click('引火');wait('__yongchang.ui["引火"]===undefined')
  assert '修城' not in page.evaluate('__yongchang.ui')
  report['contextFire']=True
  click('募勇');wait('__yongchang.state.tray==="army"')
  page.screenshot(path=str(out/'army-menu.png'))
  click('毛竹狼筅乡勇');wait('__yongchang.state.units===30')
  click('募勇');wait('__yongchang.state.tray===""')
  click('宗族');wait('__yongchang.state.context==="clan"');click('义捐');wait('__yongchang.state.donations===1');click('宗族')
  click('宗族');click('义捐');wait('__yongchang.state.donations===2 && __yongchang.ui["义捐"]===undefined')
  click('驰援');wait('__yongchang.state.guard_used && __yongchang.ui["驰援"]===undefined')
  page.screenshot(path=str(out/'clan-exhausted.png'));click('宗族')
  report['exhaustedActionsHidden']=True
  click('军令');wait('__yongchang.state.context==="command"');click('进攻');wait('__yongchang.state.stance==="attack" && __yongchang.state.context===""')
  key('m');wait('__yongchang.state.zoom===150')
  page.screenshot(path=str(out/'overview.png'))
  page.set_viewport_size({'width':1100,'height':700});frame();frame()
  page.screenshot(path=str(out/'compact.png'));report['desktop']=state()
  click('暂停');wait('__yongchang.state.state==="pause"')
  click('声音 开 / 关');wait('__yongchang.state.sound_enabled===false')
  click('开源与授权');page.screenshot(path=str(out/'licenses.png'))
  assert '获取完整对应源码' in page.evaluate('__yongchang.ui')
  source=page.request.get(a.url+'SOURCE.zip')
  assert source.ok and hashlib.sha256(source.body()).hexdigest()==receipt['files']['SOURCE.zip']
  click('返回');click('返回标题');wait('__yongchang.state.screen==="confirm_return"');click('确认返回');wait('__yongchang.state.state==="title" && __yongchang.state.stats.built===0')
  assert state()['resources']['wood']==92
  click('步入永昌卫城');wait('__yongchang.state.screen==="menu"')
  rect=page.evaluate('__yongchang.ui["开始守望"]');x,y=point(rect['x']+rect['width']/2,rect['y']+rect['height']/2)
  page.mouse.click(x,y);wait('__yongchang.state.screen==="confirm_new"');click('确认新局');wait('__yongchang.state.state==="play"');report['fastClick']=True
  page.context.close()

  if not a.skip_touch:
   page=boot(True);click('步入永昌卫城',True);wait('__yongchang.state.screen==="menu"');click('开始守望',True);wait('__yongchang.state.state==="play"')
   click('营造 B',True);wait('__yongchang.state.tray==="build"')
   click('江南水车稻田',True);wait('__yongchang.state.selected_build==="farm"')
   cdp=page.context.new_cdp_session(page);initial=state()
   def touches(kind,coords):
    cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'id':i,'radiusX':2,'radiusY':2,'force':1} for i,(x,y) in enumerate(coords)]});frame()
   touches('touchStart',[(470,310),(630,310)])
   touches('touchMove',[(420,330),(680,330)])
   wait('__yongchang.state.zoom<24')
   touches('touchEnd',[]);wait('__yongchang.state.touches===0 && !__yongchang.state.touch_gesture')
   assert state()['stats']['built']==0 and state()['camera']!=initial['camera'],state()
   probe=page.evaluate('__yongchang.buildProbe');tap(probe['x'],probe['y'],True)
   wait('__yongchang.state.stats.built===1')
   assert state()['resources']['wood']==82
   click('取消',True);click('募勇',True);wait('__yongchang.state.tray==="army"')
   click('毛竹狼筅乡勇',True);wait('__yongchang.state.units===30')
   click('募勇',True);click('宗族',True);wait('__yongchang.state.context==="clan"');click('宗族',True);click('军令',True);click('进攻',True);wait('__yongchang.state.stance==="attack"');click('暂停',True);wait('__yongchang.state.state==="pause"')
   click('继续守望',True);wait('__yongchang.state.state==="play"')
   report['touchEmulation']=state();page.screenshot(path=str(out/'touch.png'))
  report['remoteRequests']=[u for u in report['requests'] if not u.startswith(a.url) and not u.startswith('blob:')]
  assert not report['remoteRequests'] and not report['errors'],{'count':len(report['errors']),'first':report['errors'][:12]}
  report['passed']=True
 except Exception as exc:
  report['failure']=str(exc)
  if page and not page.is_closed():
   report['lastState']=page.evaluate('window.__yongchang || null')
   page.screenshot(path=str(out/'failure.png'))
  raise
 finally:
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
  browser.close()
print(json.dumps({'passed':report['passed'],'pckSha256':report['pckSha256'],'touchEmulation':bool(report.get('touchEmulation'))}))
