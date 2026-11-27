"""Play a complete economy/defence/overseas offensive through real H5 input.

The harness reads observation snapshots and projects ground coordinates. Every
state-changing action is a mouse click/key through the game's existing UI.
"""
import argparse, hashlib, json, math, time
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8767/')
p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe')
p.add_argument('--output',default='.build/offshore-camp/live-economy');p.add_argument('--reload-during-crossing',action='store_true');a=p.parse_args()
out=(root/a.output).resolve();out.mkdir(parents=True,exist_ok=True)
world=json.loads((root/'game/assets/world.json').read_text('utf-8'));layout=world['map'];w,h=layout['width'],layout['height']
plan=[('farm',47,54),('farm',48,55),('farm',50,56),('woodcutter',45,38),('woodcutter',42,35),
      ('quarry',21,39),('ironMine',22,62),('fletcher',46,54),('blacksmith',49,54),
      ('ballista',51,46),('ballista',51,50),('ballista',46,42),('ballista',46,38),('ballista',48,42),('ballista',49,47),
      ('hovel',41,50),('hovel',41,52),('hovel',43,53),('hovel',45,57),('hovel',50,58),('hovel',45,60),
      ('tower',51,48),('tower',47,40),('wall',50,46),('wall',49,46)]
roles=['trebuchet','ram','trebuchet','ram','archer','swordsman','knight','trebuchet','ram','archer','swordsman','knight','trebuchet','ram','trebuchet','ram','trebuchet','ram','swordsman']
report={'passed':False,'staged':False,'actions':[],'timeline':[],'errors':[]}

def sub(a,b):return [x-y for x,y in zip(a,b)]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def norm(a):return [v/math.sqrt(dot(a,a)) for v in a]

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=a.browser,headless=True)
 page=browser.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(20000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 page.on('requestfailed',lambda r:report['errors'].append(r.url+': '+str(r.failure)))
 def state():return page.evaluate('__yongchang.state')
 def frame():
  old=page.evaluate('window.__yongchang?.state?.frame ?? -1');page.wait_for_function('(n)=>window.__yongchang?.state?.frame!==undefined && __yongchang.state.frame!==n',arg=old)
 def ui():return page.evaluate('__yongchang.ui')
 def click(label):
  page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',arg=label)
  rect=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
  for _ in range(8) if rect['y']>730 and rect['width']==144 else []:
   if 348<=rect['x'] and rect['x']+rect['width']<=1286:break
   page.mouse.move(850,rect['y']+rect['height']+8);page.mouse.down();frame();page.mouse.move(1240 if rect['x']>1200 else 360,rect['y']+rect['height']+8,steps=12);page.mouse.up();frame()
   rect=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
  page.mouse.click(rect['x']+rect['width']/2,rect['y']+rect['height']/2,delay=90);frame()
 def center(x,z):
  m=state()['minimap'];page.mouse.click(m['x']+6+(x+.5)/w*(m['width']-12),m['y']+6+(z+.5)/h*(m['height']-12),delay=90);frame()
 def project(at):
  s=state();f=norm(sub(s['camera_target'],s['camera_position']));right=norm(cross(f,[0,1,0]));up=cross(right,f);delta=sub(at,s['camera_target'])
  return 800+dot(delta,right)*1000/s['zoom'],500-dot(delta,up)*1000/s['zoom']
 def ground(x,z):return [x+.5-w/2,world['cells'][z*int(w)+x]['h'],z+.5-h/2]
 def afford(cost):return all(state()['resources'][k]>=v for k,v in cost.items())
 def save():
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 try:
  receipt=page.request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256']
  assert hashlib.sha256(page.request.get(a.url+'game.pck').body()).hexdigest()==receipt['sha256']
  page.goto(a.url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
  click('步入永昌卫城');click('开始守望');report['initial']=state()
  assert report['initial']['map']==[224,96] and report['initial']['fortress']['gates']==2
  probe=page.evaluate('__yongchang.buildProbe');calculated=project(ground(47,54))
  assert math.hypot(probe['x']-calculated[0],probe['y']-calculated[1])<1,(probe,calculated)
  click('宗族');click('义捐');click('义捐');click('驰援');click('驻祠');click('宗族')
  build_index=0;recruit_index=0;last_log=-20;last_repair=-3;attack_at=None;sped=False;deadline=time.monotonic()+1000
  while time.monotonic()<deadline:
   s=state()
   if s['state']!='play':break
   if s['time']-last_log>=20:
    last_log=s['time'];report['timeline'].append(s);save();print(json.dumps({'time':round(s['time'],1),'builds':build_index,'recruited':recruit_index,'state':s['state'],'fortress':s['fortress']}),flush=True)
   if '修城' in ui() and s['resources']['stone']>=5 and s['time']-last_repair>=2:click('修城');last_repair=s['time']
   if build_index<len(plan):
    kind,x,z=plan[build_index]
    if afford(world['buildings'][kind]['cost']):
     # Keep the placement clear of the on-screen rotation/cancel controls.
     center(x,z)
     click('营造 B');click({'econ':'水乡民生','castle':'永昌城防','military':'神机军工'}[world['buildings'][kind]['cat']]);click(world['buildings'][kind]['name'])
     page.wait_for_function('(k)=>__yongchang.state.selected_build===k',arg=kind)
     before=state()['stats']['built'];px,py=project(ground(x,z));report['lastAttempt']={'type':kind,'cell':[x,z],'screen':[px,py],'state':state()};page.mouse.click(px,py,delay=100)
     page.wait_for_function('(n)=>__yongchang.state.stats.built===n+1',arg=before);page.keyboard.press('Escape');frame()
     report['actions'].append({'action':'build','type':kind,'cell':[x,z],'time':state()['time']});build_index+=1
   if build_index>=15 and recruit_index<len(roles):
    role=roles[recruit_index];spec=world['units'][role];cost=spec['cost'].copy()
    if state()['martial_bonus'] and role in ['knight','swordsman']:cost={k:math.ceil(v*.8) for k,v in cost.items()}
    if afford(cost) and state()['resources']['peasants']>=spec['popCost']:
     center(46,47);click('募勇');before=[sq['id'] for sq in state()['player_squads']];click(spec['name']);frame()
     added=[sq for sq in state()['player_squads'] if sq['id'] not in before];click('募勇')
     if added:
      squad=added[0];at=squad['members'][0]['position'];px,py=project([at[0],world['cells'][int(at[2]+h/2)*int(w)+int(at[0]+w/2)]['h'],at[2]])
      page.mouse.click(px,py,delay=100);frame();assert state()['selected_squad']==squad['id'],('selection',squad,state()['selected_squad'])
      px,py=project(ground(46,59));page.mouse.click(px,py,button='right',delay=100);frame()
      report['actions'].append({'action':'recruit','role':role,'time':state()['time']});recruit_index+=1
   if build_index==len(plan) and not sped:click('速度');sped=True;page.screenshot(path=str(out/'developed-village.png'))
   if recruit_index==len(roles) and s['wave']>=4 and attack_at is None:
    click('宗族');click('乡约');click('乡约');click('宗族');click('军令');click('进攻');attack_at=state()['time'];report['attackAt']=attack_at
    click('全图 M');page.screenshot(path=str(out/'offensive-overview.png'))
   if attack_at is not None and state()['stats']['player_landed']>0 and not report.get('landingCaptured'):
    click('全图 M');center(190,49);page.screenshot(path=str(out/'island-assault.png'));report['landingCaptured']=True
   if a.reload_during_crossing and attack_at is not None and not report.get('crossingReload') and any(u['transit'] for sq in state()['player_squads'] for u in sq['members']):
    click('暂停');click('保存进度');paused=state();assert '已保存' in paused['save_notice']
    page.reload();page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000);click('步入永昌卫城');click('继续上次守望');page.wait_for_function('window.__yongchang?.state?.screen==="pause" && __yongchang.state.stats.built===25')
    restored=state()
    for field in ['time','resources','stats','player_squads','fortress']:assert restored[field]==paused[field],('reload mismatch',field)
    report['crossingReload']={'time':restored['time'],'transitUnits':sum(u['transit'] for sq in restored['player_squads'] for u in sq['members']),'sameState':True}
    page.screenshot(path=str(out/'restored-crossing.png'));click('继续守望')
   if attack_at is not None and s['time']-attack_at>130:
    assert state()['stats']['player_landed']>0,'Offensive stalled before any landing'
   if s['time']>1000:break
   page.wait_for_timeout(150)
  report['final']=state();page.screenshot(path=str(out/'final.png'))
  assert report['final']['state']=='victory',report['final']
  assert report['attackAt']>=300 and report['final']['stats']['deliveries']>0 and report['final']['fortress']['keep_hp']==0
  if a.reload_during_crossing:assert report.get('crossingReload',{}).get('sameState')
  assert not report['errors'],report['errors']
  assert '再守一局' in ui() and '用时' in state().get('result',''),'Victory summary or replay missing'
  click('再守一局');page.wait_for_function('window.__yongchang?.state?.state==="play" && __yongchang.state.stats.built===0 && __yongchang.state.time<5')
  report['replayed']=state();page.screenshot(path=str(out/'replay.png'))
  assert state()['resources']['wood']==world['initial_resources']['wood'] and not state()['player_squads']
  report['passed']=True
 finally:
  if page and not page.is_closed():
   report['lastState']=state();page.screenshot(path=str(out/'last-state.png'))
  save();browser.close()
print(json.dumps({'passed':report['passed'],'time':report.get('final',{}).get('time'),'pckSha256':report['pckSha256']}))
