"""Real browser gestures against an exported PCK; observation never mutates the game."""
import argparse, hashlib, json
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:8773/')
p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe')
p.add_argument('--output',default='.build/rts-terrain/live')
p.add_argument('--package',default='.build/rts-terrain/package')
a=p.parse_args();root=Path(__file__).resolve().parent.parent;out=(root/a.output).resolve();out.mkdir(parents=True,exist_ok=True)
report={'passed':False,'checks':[],'errors':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=a.browser,headless=True)
 page=browser.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(20000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def state():return page.evaluate('__yongchang.state')
 def frame():
  old=state()['frame'];page.wait_for_function('(n)=>__yongchang.state.frame!==n',arg=old)
 def wait(test):page.wait_for_function(test)
 def check(name,ok,detail=None):
  report['checks'].append({'name':name,'passed':bool(ok),'detail':detail});assert ok,(name,detail)
 def click(label):
  page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',arg=label)
  r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
  page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2,delay=100);frame()
 def key(code):page.keyboard.press(code);frame()
 def shot(name):page.screenshot(path=str(out/(name+'.png')))
 def world_screen(gx,gz,y=.4):
  # Orthographic projection from the read-only camera basis published by Godot.
  import numpy as np
  s=state();c=np.array(s['camera_position']);t=np.array(s['camera_target']);forward=(t-c);forward/=np.linalg.norm(forward)
  right=np.cross(forward,np.array([0,1,0]));right/=np.linalg.norm(right);up=np.cross(right,forward)
  point=np.array([gx-112,y,gz-48])-c;scale=1000/s['zoom']
  return 800+float(point@right)*scale,500-float(point@up)*scale
 def map_at(x,z):
  r=state()['minimap'];page.mouse.click(r['x']+6+x/224*(r['width']-12),r['y']+6+z/96*(r['height']-12),delay=100);frame()
 try:
  receipt=page.request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256']
  check('both platform PCK files match served content',hashlib.sha256((root/a.package/'dora/game.pck').read_bytes()).hexdigest()==receipt['sha256'] and hashlib.sha256(page.request.get(a.url+'game.pck').body()).hexdigest()==receipt['sha256'])
  page.goto(a.url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
  click('步入永昌卫城');click('开始守望');shot('village')
  click('营造 B');click('江南水车稻田')
  probe=page.evaluate('__yongchang.buildProbe');page.mouse.move(probe['x'],probe['y']);frame()
  wait('__yongchang.state.placement.valid && __yongchang.state.placement.hint.includes("可营造")');shot('build-valid')
  before=state()['resources']['wood'];page.mouse.click(probe['x'],probe['y']);wait('__yongchang.state.stats.built===1')
  check('real placement charges exactly once',state()['resources']['wood']==before-10)
  water=world_screen(37.5,44.5,-.22);page.mouse.move(*water);frame();wait('!__yongchang.state.placement.valid');shot('build-blocked')
  before=state()['resources']['wood'];page.mouse.click(*water);frame()
  check('blocked click preserves resources',state()['resources']['wood']==before and state()['stats']['built']==1,state()['placement'])
  page.mouse.click(*water,button='right');wait('__yongchang.state.selected_build===""')
  check('right click cancels placement',state()['selected_build']=='')
  click('募勇');click('毛竹狼筅乡勇');click('毛竹狼筅乡勇');click('募勇')
  s=state();ids=[q['id'] for q in s['player_squads'] if q['role']=='spearman'];check('two recruited squads',len(ids)==2)
  # Move them apart so subsequent selection gestures have unambiguous targets.
  point=world_screen(48,58);page.mouse.click(*point,button='right');frame()
  wait('__yongchang.state.player_squads.filter(q=>q.role==="spearman")[1].members.every(u=>u.position[2]>7)')
  s=state();first=next(q for q in s['player_squads'] if q['id']==ids[0]);page.mouse.click(*first['members'][0]['screen']);frame()
  check('left click selects squad',state()['selected_squads']==[ids[0]],state()['selected_squads'])
  page.mouse.click(*world_screen(45,57),button='right');frame()
  wait('__yongchang.state.player_squads.filter(q=>q.role==="spearman")[0].members.every(u=>u.position[2]>6)')
  key('s');s=state();members=[u for q in s['player_squads'] if q['id'] in ids for u in q['members']]
  xs=[u['screen'][0] for u in members];ys=[u['screen'][1] for u in members]
  page.mouse.move(min(xs)-25,min(ys)-25);page.mouse.down();page.mouse.move(max(xs)+25,max(ys)+25,steps=12);frame();shot('box-select');page.mouse.up();frame()
  check('box selects both squads',set(state()['selected_squads'])==set(ids),state()['selected_squads'])
  current={q['id']:q for q in state()['player_squads'] if q['id'] in ids}
  page.mouse.click(*current[ids[0]]['members'][0]['screen']);frame()
  page.keyboard.down('Shift');page.mouse.click(*current[ids[1]]['members'][0]['screen']);page.keyboard.up('Shift');frame()
  check('Shift click adds another squad',set(state()['selected_squads'])==set(ids),state()['selected_squads'])
  page.mouse.dblclick(*current[ids[1]]['members'][0]['screen'],delay=100);frame()
  check('double click selects visible matching squads',set(state()['selected_squads'])==set(ids),state()['selected_squads'])
  key('Control+1');page.mouse.click(*world_screen(50,60));frame()
  check('left ground click clears without issuing move',state()['selected_squads']==[])
  key('1');check('control group restores selection',set(state()['selected_squads'])==set(ids))
  first_target=world_screen(47,65);page.mouse.click(*first_target,button='right');frame()
  page.keyboard.down('Shift');page.mouse.click(*world_screen(49,69),button='right');page.keyboard.up('Shift');frame()
  check('Shift right click queues for both squads',all(q['queue']==1 for q in state()['player_squads'] if q['id'] in ids))
  key('s');check('S stops and clears queues',all(q['order']==[] and q['queue']==0 for q in state()['player_squads'] if q['id'] in ids))
  key('a');check('A arms attack move',state()['attack_armed']);page.mouse.click(*world_screen(48,62));frame();check('attack move commits on left click',not state()['attack_armed'])
  shot('orders');key('s')
  r=state()['minimap'];before=state()['camera'];page.mouse.click(r['x']+6+46/224*(r['width']-12),r['y']+6+64/96*(r['height']-12),button='right');frame()
  check('minimap right click orders without moving camera',state()['camera']==before and all(q['order'] for q in state()['player_squads'] if q['id'] in ids));key('s')
  # Building selection must not leak through a UI release, nor pan after a middle release on UI.
  before=state()['camera'];page.mouse.move(900,500);page.mouse.down(button='middle');page.mouse.move(1000,550,steps=8);page.mouse.up(button='middle');frame()
  check('middle drag pans camera',state()['camera']!=before)
  # Release over the HUD must still end a camera gesture.
  page.mouse.down(button='middle');page.mouse.move(900,70,steps=5);page.mouse.up(button='middle');frame();before=state()['camera']
  page.mouse.move(900,500);frame();check('middle release over UI ends panning',state()['camera']==before)
  before=state()['zoom'];page.mouse.wheel(0,-120);frame();check('wheel zoom responds',state()['zoom']<before)
  before=state()['camera'];page.mouse.move(1595,700);page.wait_for_function('(p)=>Math.hypot(__yongchang.state.camera[0]-p[0],__yongchang.state.camera[1]-p[1])>.5',arg=before);page.mouse.move(900,500);frame();check('screen edge pans',state()['camera']!=before)
  map_at(46,62);click('营造 B');click('永昌城防')
  world=json.loads((root/'game/assets/world.json').read_text('utf-8'));click(world['buildings']['wall']['name'])
  start=world_screen(46.5,63.5);end=world_screen(46.5,66.5);page.mouse.move(*start);page.mouse.down();page.mouse.move(*end,steps=10);frame()
  check('wall drag previews the whole line',state()['placement']['count']>=3,state()['placement']);shot('wall-line')
  before=state()['stats']['built'];page.mouse.up();frame();check('wall drag builds multiple cells',state()['stats']['built']>=before+3)
  # A right click on the HUD cancels placement too.
  page.mouse.click(900,70,button='right');frame();check('right click over UI cancels construction',state()['selected_build']=='')
  key('h');map_at(88,60);shot('coastal-clear-ground')
  click('营造 B');click('水乡民生');click('江南水车稻田');point=world_screen(88.5,60.5);page.mouse.move(*point);frame();shot('coastal-build')
  check('former hidden exclusion now previews valid',state()['placement']['valid'],state()['placement'])
  page.mouse.click(*point,button='right');frame()
  map_at(24,43);shot('rock-obstacles');map_at(94,76);shot('marsh-obstacles')
  key('m');shot('overview')
  check('no browser or Godot runtime errors',not report['errors'],report['errors'])
  report['passed']=True
 except Exception as e:
  report['failure']=str(e)
  try:report['lastState']=state();shot('failure')
  except Exception:pass
  raise
 finally:
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'pck':report['pckSha256']}))
