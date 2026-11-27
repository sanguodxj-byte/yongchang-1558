"""Control browser/GPU-process lifetime while alternating real exported builds."""
import argparse,ctypes,hashlib,json,time
from pathlib import Path
import numpy as np
import psutil
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',default='.build/performance/web-process-pair');p.add_argument('--baseline-url',default='http://127.0.0.1:8768/');p.add_argument('--url',default='http://127.0.0.1:8767/');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.output;out.mkdir(parents=True,exist_ok=True)
nv=ctypes.WinDLL('nvml.dll');assert nv.nvmlInit_v2()==0
device=ctypes.c_void_p();assert nv.nvmlDeviceGetHandleByIndex_v2(0,ctypes.byref(device))==0
class Util(ctypes.Structure):_fields_=[('gpu',ctypes.c_uint),('memory',ctypes.c_uint)]
report={'passed':False,'samples':[],'errors':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe',headless=True)
 page=browser.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(60000)
 cdp=page.context.new_cdp_session(page);cdp.send('Performance.enable');system=browser.new_browser_cdp_session()
 page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def metrics():return {v['name']:v['value'] for v in cdp.send('Performance.getMetrics')['metrics']}
 def click(label):
  page.wait_for_function('(s)=>Object.keys(window.__yongchang?.ui||{}).some(k=>k.split("\\n")[0]===s)',arg=label)
  r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
  page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2,delay=100)
 try:
  for name,url in [('A1',a.baseline_url),('B1',a.url),('A2',a.baseline_url),('B2',a.url)]:
   receipt=page.request.get(url+'BUILD.json').json()
   assert hashlib.sha256(page.request.get(url+'game.pck').body()).hexdigest()==receipt['sha256']
   page.goto(url+'?profile');page.wait_for_function('window.__yongchang?.state?.screen==="title"');click('步入永昌卫城');click('开始守望')
   page.wait_for_function('__yongchang.state.state==="play" || __yongchang.state.screen==="confirm_new"')
   if page.evaluate('__yongchang.state.screen')=='confirm_new':click('确认新局')
   page.wait_for_function('__yongchang.state.state==="play"');page.wait_for_timeout(5000)
   page.evaluate('__yongchangPerf.read()');page.wait_for_timeout(500);start=page.evaluate('__yongchang.state.frame');initial=page.evaluate('__yongchang.state')
   loads=[];before=metrics();psutil.cpu_percent()
   for i in range(15):
    page.wait_for_timeout(1000);util=Util();assert nv.nvmlDeviceGetUtilizationRates(device,ctypes.byref(util))==0
    processes=[]
    for p in system.send('SystemInfo.getProcessInfo')['processInfo']:
     try:p['priority']=int(psutil.Process(p['id']).nice());processes.append(p)
     except psutil.Error:pass
    loads.append({'cpuPercent':psutil.cpu_percent(),'gpuPercent':util.gpu,'gpuMemoryPercent':util.memory,'metrics':metrics(),'processes':processes})
   after=metrics();page.evaluate('__yongchangPerf.read()');rows=page.evaluate('(f)=>__yongchangPerf.rows.filter(r=>r[0]>f)',start);columns=page.evaluate('__yongchangPerf.columns');x=np.asarray(rows)
   summary={}
   for key in ['interval_ms','simulation_ms','visuals_ms','script_ms','draw_calls','primitives']:
    v=x[:,columns.index(key)];summary[key]={'mean':float(np.mean(v)),'p50':float(np.percentile(v,50)),'p95':float(np.percentile(v,95)),'p99':float(np.percentile(v,99))}
   report['samples'].append({'name':name,'pckSha256':receipt['sha256'],'initial':initial,'final':page.evaluate('__yongchang.state'),'columns':columns,'rows':rows,'summary':summary,'load':loads,'browserMetricDelta':{k:after[k]-before[k] for k in ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskOtherDuration'] if k in after}})
   print(name,'frame P95',round(summary['interval_ms']['p95'],2),'script mean',round(summary['script_ms']['mean'],2),'GPU range',[min(v['gpuPercent'] for v in loads),max(v['gpuPercent'] for v in loads)],flush=True)
  assert not report['errors'];report['passed']=True
 finally:
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close();nv.nvmlShutdown()
