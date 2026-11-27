"""Actual compact/desktop input, persistent saves and recoverable storage failure."""
import argparse,hashlib,json,math,time
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8768/');p.add_argument('--output',default='.build/completion/live');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.output;out.mkdir(parents=True,exist_ok=True);world=json.loads((root/'game/assets/world.json').read_text('utf-8'))
report={'passed':False,'checks':[],'screens':{},'errors':[]}
def check(name,ok,detail=None):
 report['checks'].append({'name':name,'passed':bool(ok),'detail':detail});print(name,bool(ok),flush=True);assert ok,(name,detail)
def norm(v):return [x/math.sqrt(sum(q*q for q in v)) for x in v]
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe',headless=True)
 page=None
 def state():return page.evaluate('__yongchang.state')
 def frame():
  n=page.evaluate('window.__yongchang?.state?.frame ?? -1');page.wait_for_function('(n)=>window.__yongchang?.state?.frame!==undefined && __yongchang.state.frame!==n',arg=n)
 def xy(x,y):
  c=page.locator('#canvas').bounding_box();v=state()['viewport'];return c['x']+x*c['width']/v[0],c['y']+y*c['height']/v[1]
 def click(label,touch=False):
  page.wait_for_function('(s)=>Object.keys(window.__yongchang?.ui||{}).some(k=>k.split("\\n")[0]===s)',arg=label);frame()
  for _ in range(10):
   r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label);v=state()['viewport']
   layout=next(x for x in state()['layout'] if x['label'].split('\n')[0]==label)
   if r['y']>=20 and r['y']+r['height']<=v[1]-8 and layout['visible_rect'][3]>=r['height']-.5:break
   direction=1 if r['y']>v[1]/2 else -1
   x,y=xy(v[0]*.75,v[1]*.5)
   if touch:
    cdp=page.context.new_cdp_session(page);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':0}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-direction*min(100,v[1]*.2),'id':0}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach()
   else:page.mouse.move(x,y);page.mouse.wheel(0,direction*240)
   page.wait_for_timeout(300);frame()
  point=xy(r['x']+r['width']/2,r['y']+r['height']/2)
  if touch:page.touchscreen.tap(*point)
  else:page.mouse.click(*point,delay=100)
  frame();frame()
 def capture(name):
  frame();frame();s=state();c=page.locator('#canvas').bounding_box();scale=c['width']/s['viewport'][0]
  visible=[x for x in s['layout'] if x['visible_rect'][2]>0 and x['visible_rect'][3]>0]
  full=[x for x in visible if x['visible_rect'][2]>=x['rect'][2]-.5 and x['visible_rect'][3]>=x['rect'][3]-.5]
  if s['compact']:check(name+' touch targets >=48',all(min(x['rect'][2:])*scale>=47.5 for x in full),[(x['label'],x['rect'][2:]) for x in full])
  report['screens'][name]={'screen':s['screen'],'viewport':s['viewport'],'canvas':c,'buttons':visible,'save':s['save_notice']};page.screenshot(path=str(out/(name+'.png')))
 def boot(w,h,storage=None):
  context=browser.new_context(viewport={'width':w,'height':h},has_touch=True,storage_state=storage)
  q=context.new_page();q.set_default_timeout(25000);q.on('pageerror',lambda e:report['errors'].append(str(e)));q.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None);q.goto(a.url);q.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000);return q
 def ground_point(x,z):
  s=state();f=norm([a-b for a,b in zip(s['camera_target'],s['camera_position'])]);right=norm(cross(f,[0,1,0]));up=cross(right,f);at=[x+.5-112,world['cells'][z*224+x]['h'],z+.5-48];delta=[a-b for a,b in zip(at,s['camera_target'])];v=s['viewport'];factor=v[1]/s['zoom']
  return xy(v[0]/2+sum(a*b for a,b in zip(delta,right))*factor,v[1]/2-sum(a*b for a,b in zip(delta,up))*factor)
 try:
  receipt=browser.new_context().request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256']
  for w,h in [(844,390),(390,844),(360,740)]:
   prefix=str(w);page=boot(w,h);capture(prefix+'-title');click('步入永昌卫城',True);capture(prefix+'-menu');click('新手准备',True)
   check(prefix+' training boot',state()['training'] and state()['state']=='play');capture(prefix+'-play')
   click('地图',True);capture(prefix+'-map');before=state()['camera'];click('山麓石矿',True);check(prefix+' locates stone',math.dist(state()['camera'],[-91.5,-8.5])<1);capture(prefix+'-stone')
   click('营造 B',True);capture(prefix+'-build');click('下一页',True);capture(prefix+'-cards-next');click('收起',True)
   click('地图',True);click('宗祠与村落',True);click('营造 B',True);click('水乡民生',True)
   for _ in range(5):
    if '江南水车稻田' in '\n'.join(page.evaluate('Object.keys(__yongchang.ui)')):break
    click('下一页',True)
   click('江南水车稻田',True);page.touchscreen.tap(*ground_point(47,54));page.wait_for_function('__yongchang.state.stats.built===1');click('取消',True);check(prefix+' actual touch builds farm',state()['stats']['built']==1)
   page.touchscreen.tap(*ground_point(47,54));page.wait_for_function('__yongchang.state.context==="site"');capture(prefix+'-site');click('收起',True)
   click('宗族',True);capture(prefix+'-clan');click('收起',True);click('军令',True);capture(prefix+'-command');click('收起',True)
   click('指引',True);capture(prefix+'-guide');click('准备迎敌',True);check(prefix+' begins regular countdown',not state()['training'] and state()['wave']==1)
   click('暂停',True);capture(prefix+'-pause');click('保存进度',True);check(prefix+' storage succeeds','已保存' in state()['save_notice'])
   click('操作与史料',True);capture(prefix+'-help');click('返回',True);page.context.close()
  page=boot(1280,800);click('步入永昌卫城');click('新手准备');click('营造 B');click('江南水车稻田');page.mouse.click(*ground_point(47,54),delay=100);page.wait_for_function('__yongchang.state.stats.built===1');click('取消');page.wait_for_timeout(1200)
  page.mouse.click(*ground_point(47,54),delay=100);page.wait_for_function('__yongchang.state.context==="site"');check('workshop shows live worker', '民丁' in state()['site']['text']);capture('desktop-site');click('收起')
  click('资源定位');click('山麓石矿');check('desktop resource locator moves camera',math.dist(state()['camera'],[-91.5,-8.5])<1)
  click('暂停');click('保存进度');saved=state();page.context.storage_state(path=str(out/'browser-save.json'));check('saved world contains built farm',saved['stats']['built']==1)
  page.reload();page.wait_for_function('window.__yongchang?.state?.screen==="title"');click('步入永昌卫城');check('reload offers save',state()['has_save']);click('继续上次守望');page.wait_for_function('window.__yongchang?.state?.screen==="pause" && __yongchang.state.stats.built===1');restored=state()
  check('reload preserves resources and time exactly',restored['resources']==saved['resources'] and restored['time']==saved['time'] and restored['stats']==saved['stats'])
  check('reload preserves camera',restored['camera']==saved['camera']);capture('desktop-restored');click('继续守望')
  page.set_viewport_size({'width':390,'height':844});page.wait_for_function('__yongchang.state.compact && __yongchang.state.viewport[0]===390');capture('rotated-portrait');check('resize preserves built world',state()['stats']['built']==1)
  page.set_viewport_size({'width':844,'height':390});page.wait_for_function('__yongchang.state.viewport[0]===844');capture('rotated-landscape');check('rotation preserves world',state()['stats']['built']==1)
  click('暂停');click('保存进度');good=page.evaluate('localStorage.getItem("yongchang1558.save.v1")')
  # Deliberate storage failure: reject writes, without changing gameplay state.
  page.evaluate('(()=>{window.__originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("test quota", "QuotaExceededError")}})()')
  click('保存进度');check('storage failure visible and old slot retained','未能保存' in state()['save_notice'] and page.evaluate('localStorage.getItem("yongchang1558.save.v1")')==good);capture('storage-failure')
  page.evaluate('(()=>{Storage.prototype.setItem=window.__originalSet})()');click('保存进度');check('storage can recover','已保存' in state()['save_notice']);page.context.close()
  # Read persistence in a fresh context, simulating a browser restart.
  page=boot(844,390,str(out/'browser-save.json'));click('步入永昌卫城',True);click('继续上次守望',True);page.wait_for_function('window.__yongchang?.state?.screen==="pause" && __yongchang.state.stats.built===1');capture('fresh-browser-resume');check('fresh browser resumes saved game',state()['stats']['built']==1)
  assert not report['errors'],report['errors'];report['passed']=True
 except Exception as exc:
  report['failure']=str(exc)
  if page and not page.is_closed():report['lastState']=page.evaluate('window.__yongchang?.state');page.screenshot(path=str(out/'failure.png'))
  raise
 finally:(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
