"""Real-input usability regressions; --baseline records failures without stopping."""
import argparse,hashlib,json,math
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--baseline',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.output;out.mkdir(parents=True,exist_ok=True);url='http://127.0.0.1:8767/'
report={'passed':False,'checks':[],'errors':[],'baseline':a.baseline}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe',headless=True)
 page=browser.new_page(viewport={'width':1280,'height':800});page.set_default_timeout(20000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def state():return page.evaluate('__yongchang.state')
 def frame():
  n=page.evaluate('window.__yongchang?.state?.frame ?? -1');page.wait_for_function('(n)=>window.__yongchang?.state?.frame!==undefined && __yongchang.state.frame!==n',arg=n)
 def click(label,touch=False):
  page.wait_for_function('(s)=>Object.keys(window.__yongchang?.ui||{}).some(k=>k.split("\\n")[0]===s)',arg=label)
  # Screen transitions report their new label before container layout settles.
  frame()
  r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label);c=page.locator('#canvas').bounding_box()
  pos=(c['x']+(r['x']+r['width']/2)*c['width']/1600,c['y']+(r['y']+r['height']/2)*c['height']/1000)
  if touch:page.touchscreen.tap(*pos)
  else:page.mouse.click(*pos,delay=100)
  frame();frame()
 def check(name,ok,detail=None):
  report['checks'].append({'name':name,'passed':bool(ok),'detail':detail});print(name,bool(ok),flush=True)
 def capture(name):page.screenshot(path=str(out/(name+'.png')))
 def keys():
  for key in ['q','2','t','r']:page.keyboard.press(key);frame()
 try:
  receipt=page.request.get(url+'BUILD.json').json();report['pckSha256']=receipt['sha256'];assert hashlib.sha256(page.request.get(url+'game.pck').body()).hexdigest()==receipt['sha256']
  page.goto(url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
  click('步入永昌卫城');click('开始守望');page.wait_for_function('__yongchang.state.state==="play"');page.wait_for_timeout(1000);capture('first-play');report['initial']=state()
  click('营造 B');capture('build-list');page.keyboard.press('Escape');frame();s=state()
  check('Escape closes cards before pausing',s['state']=='play' and s['tray']=='',s['state'])
  if s['state']=='pause':click('继续守望')
  if state()['tray']=='build':click('营造 B')
  click('营造 B');click('江南水车稻田');click('募勇');capture('build-to-recruit');s=state()
  check('recruit menu cancels placement',s['selected_build']=='' and s['tray']=='army',s['selected_build'])
  click('募勇')
  if state()['selected_build']:click('取消')
  click('暂停');before=state();keys();after=state();capture('pause')
  check('battle hotkeys blocked during pause',before['camera_yaw']==after['camera_yaw'] and before.get('speed',1)==after.get('speed',1) and before['stance']==after['stance'] and before.get('build_rotation',0)==after.get('build_rotation',0),{'before':before,'after':after})
  click('操作与史料');before=state();keys();after=state();capture('help')
  check('battle hotkeys blocked in help',before.get('speed',1)==after.get('speed',1) and before.get('build_rotation',0)==after.get('build_rotation',0) and before['camera_yaw']==after['camera_yaw'])
  page.keyboard.press('Escape');frame();check('Escape returns to pause',state()['screen']=='pause')
  click('继续守望')
  if not a.baseline:
   check('opening goal visible',bool(state().get('objective')) and '伐木' in state()['objective'])
   click('营造 B');click('水乡民生');click('下一页');capture('economy-next-page')
   check('last economy cards reachable by button','江南粉墙民居' in '\n'.join(page.evaluate('Object.keys(__yongchang.ui)')))
   click('江南粉墙民居');check('last card enters placement',state()['selected_build']=='hovel');click('取消')
   click('募勇');click('温州藤牌刀兵');check('recruit success reports squad', '募得' in state().get('message',''))
   click('温州藤牌刀兵');click('温州藤牌刀兵');capture('recruit-shortage');check('shortage identifies missing resource','甲' in state().get('message','') and '差' in state().get('message',''))
   page.keyboard.press('Escape');frame();check('recruit cards close before pause',state()['state']=='play' and state()['tray']=='')
   click('营造 B');click('暂停');page.keyboard.press('Escape');frame();check('Escape resumes with cards preserved',state()['state']=='play' and state()['tray']=='build');page.keyboard.press('Escape');frame()
   click('暂停');paused_run=state();click('返回标题');capture('confirm-return');check('restart asks before discarding live run',state()['screen']=='confirm_return');page.keyboard.press('Escape');frame();check('cancel return preserves run',state()['screen']=='pause' and state()['resources']==paused_run['resources'] and state()['units']==paused_run['units'] and state()['time']==paused_run['time'])
   click('返回标题');click('确认返回');page.wait_for_function('window.__yongchang?.state?.screen==="title"');check('confirmed return starts fresh',state()['stats']['built']==0 and state()['time']==0)
   page.close();context=browser.new_context(viewport={'width':1280,'height':800},has_touch=True);page=context.new_page()
   page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
   page.goto(url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000);click('步入永昌卫城',True);click('开始守望',True)
   click('营造 B',True);click('下一页',True);click('江南粉墙民居',True);check('touch reaches last economy card',state()['selected_build']=='hovel');click('取消',True)
   capture('touch-desktop');report['touch']=state()
   for width,height in [(844,390),(390,844)]:
    page.set_viewport_size({'width':width,'height':height});frame();capture('touch-'+str(width)+'x'+str(height));rects=page.evaluate('__yongchang.ui');c=page.locator('#canvas').bounding_box();scale=c['width']/1600
    report.setdefault('smallScreen',[]).append({'viewport':[width,height],'scale':scale,'minButtonCssPx':min(min(v['width'],v['height'])*scale for v in rects.values()),'buttonsBelow44CssPx':[k for k,v in rects.items() if min(v['width'],v['height'])*scale<44]})
  assert not report['errors'],report['errors'];report['passed']=all(c['passed'] for c in report['checks'])
 except Exception as exc:
  report['failure']=str(exc);report['lastState']=page.evaluate('window.__yongchang?.state');capture('failure');raise
 finally:
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
raise SystemExit(0 if report['passed'] or a.baseline else 1)
