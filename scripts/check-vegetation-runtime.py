"""Inspect the exported woodland through player input; time frames without capture."""
import argparse,hashlib,json,time
from pathlib import Path
import numpy as np
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8776/');p.add_argument('--output',default='.build/vegetation-cover/live')
p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe');a=p.parse_args()
out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True);report={'passed':False,'errors':[],'views':[],'timing':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=a.browser,headless=True);page=browser.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(30000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def state():return page.evaluate('__yongchang.state')
 def frame():
  before=state()['frame'];page.wait_for_function('(f)=>__yongchang.state.frame!==f',arg=before)
 def click(label):
  page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',arg=label)
  r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
  page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2,delay=100);frame()
 def navigate(x,z):
  s=state();m=s['minimap'];page.mouse.click(m['x']+6+x/s['map'][0]*(m['width']-12),m['y']+6+z/s['map'][1]*(m['height']-12),delay=80);frame();page.mouse.move(800,500)
 def timing(name):
  page.wait_for_timeout(2500)
  marker=state()['frame'];page.wait_for_timeout(4000)
  data=page.evaluate('(()=>{__yongchangPerf.read();return {columns:__yongchangPerf.columns,rows:__yongchangPerf.rows}})()')
  rows=np.array([row for row in data['rows'] if row[0]>marker],float)
  assert len(rows)>20,(name,len(rows));columns=data['columns'];values=rows[:,columns.index('interval_ms')]
  report['timing'].append({'scene':name,'frames':len(rows),'frameMsP50':float(np.percentile(values,50)),'frameMsP95':float(np.percentile(values,95)),'scriptMsP95':float(np.percentile(rows[:,columns.index('script_ms')],95)),'drawCallsMedian':float(np.median(rows[:,columns.index('draw_calls')])),'trianglesMedian':float(np.median(rows[:,columns.index('primitives')])),'captureDuringSample':False})
 try:
  receipt=page.request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256'];assert hashlib.sha256(page.request.get(a.url+'game.pck').body()).hexdigest()==receipt['sha256']
  page.goto(a.url+'?profile');page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
  click('步入永昌卫城');click('开始守望')
  for name,x,z in [('village',46,47),('foothills',24,41),('western-woodland',14,50),('eastern-woodland',72,32),('island-woodland',206,62)]:
   navigate(x,z)
   if name in ['village','western-woodland']:timing(name)
   page.screenshot(path=str(out/(name+'.png')));report['views'].append({'name':name,'camera':state()['camera'],'zoom':state()['zoom']})
  page.keyboard.press('m');frame();timing('overview');page.screenshot(path=str(out/'overview.png'))
  assert not report['errors'],report['errors'];report['passed']=True
 except Exception as e:
  report['failure']=str(e)
  try:report['lastState']=state();page.screenshot(path=str(out/'failure.png'))
  except Exception:pass
  raise
 finally:
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
print(json.dumps({'passed':report['passed'],'timing':report['timing'],'pckSha256':report['pckSha256']}))
