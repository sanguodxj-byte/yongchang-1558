"""Build the new worksites through actual H5 input and observe working bones."""
import argparse,hashlib,json,math,time
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--output',default='.build/worksites/live');args=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/args.output;out.mkdir(parents=True,exist_ok=True)
world=json.loads((root/'game/assets/world.json').read_text('utf-8'));w,h=world['map']['width'],world['map']['height'];base='http://127.0.0.1:8767/'
report={'passed':False,'errors':[],'actions':[],'samples':[]}
def sub(a,b):return [x-y for x,y in zip(a,b)]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def norm(a):return [v/math.sqrt(dot(a,a)) for v in a]

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe',headless=True)
 page=browser.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(20000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def state():return page.evaluate('__yongchang.state')
 def frame():
  before=state()['frame'];page.wait_for_function('(n)=>__yongchang.state.frame>n',arg=before)
 def click(label):
  page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',arg=label)
  rect=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
  # Economy has nine cards: scroll the actual tray to reach an offscreen card.
  for _ in range(8) if rect['y']>730 and rect['width']==144 else []:
   if 348<=rect['x'] and rect['x']+rect['width']<=1286:break
   page.mouse.move(850,rect['y']+rect['height']+8);page.mouse.down();frame();page.mouse.move(1240 if rect['x']>1200 else 360,rect['y']+rect['height']+8,steps=12);page.mouse.up();frame()
   rect=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
  page.mouse.click(rect['x']+rect['width']/2,rect['y']+rect['height']/2,delay=100);frame()
 def center(x,z):
  m=state()['minimap'];page.mouse.click(m['x']+6+(x+.5)/w*(m['width']-12),m['y']+6+(z+.5)/h*(m['height']-12),delay=100);frame()
 def point(x,z):
  s=state();forward=norm(sub(s['camera_target'],s['camera_position']));right=norm(cross(forward,[0,1,0]));up=cross(right,forward)
  delta=sub([x+.5-w/2,world['cells'][z*int(w)+x]['h'],z+.5-h/2],s['camera_target'])
  return 800+dot(delta,right)*1000/s['zoom'],500-dot(delta,up)*1000/s['zoom']
 def build(kind,x,z):
  center(x,z);click('营造 B');click('水乡民生');click(world['buildings'][kind]['name'])
  page.wait_for_function('(k)=>__yongchang.state.selected_build===k',arg=kind)
  before=state();page.mouse.click(*point(x,z),delay=100)
  page.wait_for_function('(n)=>__yongchang.state.stats.built===n+1',arg=before['stats']['built'])
  page.keyboard.press('Escape');frame();report['actions'].append({'build':kind,'cell':[x,z],'at':state()['time']})
 try:
  receipt=page.request.get(base+'BUILD.json').json();report['pckSha256']=receipt['sha256'];assert hashlib.sha256(page.request.get(base+'game.pck').body()).hexdigest()==receipt['sha256']
  page.goto(base);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
  click('步入永昌卫城');click('开始守望');assert state()['rigged_units']>=12
  click('宗族');click('驻祠');click('宗族')
  build('quarry',19,39);page.wait_for_function('__yongchang.state.workers.some(w=>w.job==="quarry")')
  assert not any(v['job']=='oxPost' for v in state()['workers'])
  build('oxPost',22,41);build('stockpile',25,42);build('farm',47,54);build('woodcutter',45,38)
  center(22,41);page.mouse.wheel(0,-700);frame();page.screenshot(path=str(out/'stoneworks.png'))
  initial=state()['resources']['stone'];start=time.monotonic();poses={};delivered=False
  while time.monotonic()-start<110:
   s=state();assert s['state']=='play',s['state'];report['samples'].append({'time':s['time'],'stone':s['resources']['stone'],'workers':s['workers']})
   for worker in s['workers']:
    if worker['state'] in ['gather','process']:
     poses.setdefault(worker['job'],set()).add(round(worker['arm'],2))
   delivered=s['resources']['stone']>initial
   if delivered and all(len(poses.get(job,[]))>=3 for job in ['quarry','farm','woodcutter']):break
   page.wait_for_timeout(180)
  assert delivered,'No physical ox delivery'
  assert all(len(poses.get(job,[]))>=3 for job in ['quarry','farm','woodcutter']),poses
  assert all(v['tool']==({'quarry':'hammer','farm':'hammer','woodcutter':'saw'} if v['state']=='process' else {'quarry':'pickaxe','farm':'sickle','woodcutter':'axe'}).get(v['job'],'') for v in state()['workers'])
  report['stoneDelivered']=state()['resources']['stone']-initial;report['animatedJobs']={k:len(v) for k,v in poses.items()}
  foot_errors=[];grip_errors=[]
  for sample in report['samples']:
   for worker in sample['workers']:
    grip_errors.append(worker.get('grip_error',0))
    for foot in worker.get('feet',[]):foot_errors.append(max(0,foot['ground']-foot['position'][1]))
  assert foot_errors and max(foot_errors)<.02,('Foot penetration',max(foot_errors,default=-1))
  assert max(grip_errors,default=0)<.015,('Unreachable hand target',max(grip_errors))
  report['motionContact']={'maxFootPenetration':max(foot_errors),'maxGripError':max(grip_errors),'sampledFeet':len(foot_errors)}
  page.screenshot(path=str(out/'working-quarry.png'));center(195,48);page.screenshot(path=str(out/'island.png'))
  center(47,54);page.screenshot(path=str(out/'village.png'));click('暂停');page.wait_for_function('__yongchang.state.state==="pause"')
  paused=state()['workers'];page.wait_for_timeout(500);assert state()['workers']==paused,'Work animation changed during pause'
  assert not report['errors'],report['errors'];report['passed']=True
 finally:
  if page and not page.is_closed():page.screenshot(path=str(out/'last-state.png'))
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
print(json.dumps({k:v for k,v in report.items() if k!='samples'},ensure_ascii=False))
