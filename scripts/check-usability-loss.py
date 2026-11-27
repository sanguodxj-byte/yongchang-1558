"""Unstaged passive defence failure and real-input replay of the shipped H5."""
import hashlib,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent;out=root/'.build/usability/live-defeat';out.mkdir(parents=True,exist_ok=True);url='http://127.0.0.1:8767/'
report={'passed':False,'staged':False,'strategy':'passive defence at the shipped 2x speed; no building, donation or injected state','timeline':[],'errors':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe',headless=True)
 page=browser.new_page(viewport={'width':1280,'height':800});page.set_default_timeout(20000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def state():return page.evaluate('__yongchang.state')
 def click(label):
  page.wait_for_function('(s)=>__yongchang.ui[s]!==undefined',arg=label);r=page.evaluate('(s)=>__yongchang.ui[s]',label)
  page.mouse.click((r['x']+r['width']/2)*.8,(r['y']+r['height']/2)*.8,delay=100);page.wait_for_timeout(250)
 try:
  receipt=page.request.get(url+'BUILD.json').json();report['pckSha256']=receipt['sha256'];assert hashlib.sha256(page.request.get(url+'game.pck').body()).hexdigest()==receipt['sha256']
  page.goto(url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000);click('步入永昌卫城');click('开始守望');click('速度');report['initial']=state();deadline=time.monotonic()+420;last=-20
  while time.monotonic()<deadline and state()['state']=='play':
   s=state()
   if s['time']-last>20:
    last=s['time'];report['timeline'].append(s);print('PASSIVE',round(s['time']),round(s['player_hp']),flush=True)
   page.wait_for_timeout(1000)
  page.wait_for_function('__yongchang.state.screen==="defeat"');report['final']=state();page.screenshot(path=str(out/'defeat.png'))
  assert report['final']['player_hp']<=0 and '阵亡' in report['final']['result'] and '再守一局' in page.evaluate('__yongchang.ui')
  click('再守一局');page.wait_for_function('window.__yongchang?.state?.state==="play" && __yongchang.state.time<5');report['replayed']=state()
  assert state()['player_hp']==1550 and state()['stats']['built']==0 and state()['stats']['kills']==0 and state()['resources']['wood']==92 and state()['speed']==1
  page.screenshot(path=str(out/'replay.png'));assert not report['errors'];report['passed']=True
 finally:
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
