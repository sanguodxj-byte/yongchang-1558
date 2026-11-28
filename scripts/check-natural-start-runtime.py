"""Capture the actual starting map and cross a wooden bridge using real input."""
import argparse,hashlib,json
from pathlib import Path
from playwright.sync_api import sync_playwright
import numpy as np

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8774/');p.add_argument('--output',default='.build/natural-start/live')
p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe');a=p.parse_args()
out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
report={'passed':False,'errors':[],'checks':[]}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=a.browser,headless=True)
 page=b.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(30000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def state():return page.evaluate('__yongchang.state')
 def frame():
  old=state()['frame'];page.wait_for_function('(n)=>__yongchang.state.frame!==n',arg=old)
 def click(name):
  page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',arg=name)
  rect=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',name)
  page.mouse.click(rect['x']+rect['width']/2,rect['y']+rect['height']/2,delay=100);frame()
 def navigate(x,z):
  s=state();m=s['minimap'];page.mouse.click(m['x']+6+x/s['map'][0]*(m['width']-12),m['y']+6+z/s['map'][1]*(m['height']-12),delay=80);frame()
 def shot(name):page.screenshot(path=str(out/(name+'.png')))
 def check(name,passed,detail=None):
  report['checks'].append({'name':name,'passed':bool(passed),'detail':detail});assert passed,(name,detail)
 def project(x,z):
  s=state();c=np.array(s['camera_position']);target=np.array(s['camera_target']);forward=target-c;forward/=np.linalg.norm(forward)
  right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
  delta=np.array([x-s['map'][0]/2,.4,z-s['map'][1]/2])-c
  return 800+float(delta@right)*1000/s['zoom'],500-float(delta@up)*1000/s['zoom']
 try:
  receipt=page.request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256']
  check('served PCK matches build receipt',hashlib.sha256(page.request.get(a.url+'game.pck').body()).hexdigest()==receipt['sha256'])
  page.goto(a.url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
  click('步入永昌卫城');click('开始守望');shot('village')
  check('opening has no free production or player fortification',all(s['type'] in ['keep','campfire','stockpile','granary','armory','dwelling'] for s in state()['player_buildings']))
  click('募勇');click('毛竹狼筅乡勇');click('募勇');squad=state()['selected_squad']
  navigate(38,49);page.mouse.move(800,500)
  for i in range(4):page.mouse.wheel(0,-120);frame()
  navigate(38,49);shot('wooden-bridge')
  page.mouse.click(*project(32.5,49.5),button='right');frame()
  page.wait_for_function('(id)=>__yongchang.state.player_squads.find(q=>q.id===id).members.every(u=>u.position[0]<-76)',arg=squad)
  check('real squad crosses wooden bridge westwards',True);shot('bridge-crossed-west')
  page.mouse.click(*project(43.5,49.5),button='right');frame()
  page.wait_for_function('(id)=>__yongchang.state.player_squads.find(q=>q.id===id).members.every(u=>u.position[0]>-72)',arg=squad)
  check('real squad crosses wooden bridge eastwards',True);shot('bridge-crossed-east')
  page.keyboard.press('s');frame()
  for name,point in [('north-bridge',(38,29)),('south-bridge',(38,69)),('east-bridge',(54,49)),('east-south-bridge',(54,69)),('natural-fields',(48,70)),('natural-mainland-landing',(94,49)),('natural-north-landing',(98,22)),('natural-island-landing',(181,49)),('natural-resource',(81,65))]:
   navigate(*point);shot(name)
  check('no browser or Godot errors',not report['errors'],report['errors']);report['passed']=True
 except Exception as e:
  report['failure']=str(e)
  try:report['lastState']=state();shot('failure')
  except Exception:pass
  raise
 finally:
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');b.close()
print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'pckSha256':report['pckSha256']}))
