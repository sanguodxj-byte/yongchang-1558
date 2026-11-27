"""Measure exported H5 via real input, engine render callbacks, no image readback."""
import argparse,ctypes,hashlib,json,math,os,time,threading
from pathlib import Path
import numpy as np
import psutil
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8767/');p.add_argument('--output',required=True);p.add_argument('--seconds',type=float,default=15);p.add_argument('--cpu-throttle',type=float,default=1);p.add_argument('--restart-cycles',type=int,default=0);a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.output;out.mkdir(parents=True,exist_ok=True);world=json.loads((root/'game/assets/world.json').read_text('utf-8'))
report={'passed':False,'samples':[],'errors':[],'throttle':a.cpu_throttle,'profile':'1600x1000 logical pixels, DPR 1, WebGL 2, MSAA 4x (project enum 2), hardware renderer, headless Edge; render callbacks, not display scanout'}
nv=None
try:
 nv=ctypes.WinDLL('nvml.dll');assert nv.nvmlInit_v2()==0
 gpu_device=ctypes.c_void_p();assert nv.nvmlDeviceGetHandleByIndex_v2(0,ctypes.byref(gpu_device))==0
except (OSError,AssertionError):nv=None
class Util(ctypes.Structure):_fields_=[('gpu',ctypes.c_uint),('memory',ctypes.c_uint)]
def sub(x,y):return [a-b for a,b in zip(x,y)]
def dot(x,y):return sum(a*b for a,b in zip(x,y))
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def norm(v):return [x/math.sqrt(dot(v,v)) for x in v]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe',headless=True)
 page=browser.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(20000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 cdp=page.context.new_cdp_session(page);cdp.send('Emulation.setCPUThrottlingRate',{'rate':a.cpu_throttle});system=browser.new_browser_cdp_session()
 def state():return page.evaluate('__yongchang.state')
 def frame():
  page.wait_for_function('window.__yongchang?.state?.frame!==undefined')
  f=state()['frame'];page.wait_for_function('(f)=>window.__yongchang?.state?.frame>f',arg=f)
 def click(text):
  page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',arg=text)
  r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',text)
  for _ in range(8) if r['y']>730 and r['width']==144 else []:
   if 348<=r['x'] and r['x']+r['width']<=1286:break
   page.mouse.move(850,r['y']+r['height']+8);page.mouse.down();frame();page.mouse.move(1240 if r['x']>1200 else 360,r['y']+r['height']+8,steps=12);page.mouse.up();frame();r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',text)
  page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2,delay=100);frame()
 def new_game():
  click('步入永昌卫城');click('开始守望')
  page.wait_for_function('__yongchang.state.state==="play" || __yongchang.state.screen==="confirm_new"')
  if state()['screen']=='confirm_new':click('确认新局')
  page.wait_for_function('__yongchang.state.state==="play"')
 def build(kind,x,z):
  m=state()['minimap'];page.mouse.click(m['x']+6+(x+.5)/224*(m['width']-12),m['y']+6+(z+.5)/96*(m['height']-12),delay=100);frame()
  click('营造 B');click('水乡民生');click(world['buildings'][kind]['name']);page.wait_for_function('(k)=>__yongchang.state.selected_build===k',arg=kind)
  s=state();forward=norm(sub(s['camera_target'],s['camera_position']));right=norm(cross(forward,[0,1,0]));up=cross(right,forward);at=[x+.5-112,world['cells'][z*224+x]['h'],z+.5-48];delta=sub(at,s['camera_target']);before=s['stats']['built']
  page.mouse.click(800+dot(delta,right)*1000/s['zoom'],500-dot(delta,up)*1000/s['zoom'],delay=100);page.wait_for_function('(n)=>__yongchang.state.stats.built===n+1',arg=before);page.keyboard.press('Escape');frame()
 def sample(label):
  # Leave serialization outside the measured window. The HUD observation is
  # refreshed every 180 ms; 500 ms also excludes its stale frame watermark.
  page.wait_for_timeout(2000);page.evaluate('__yongchangPerf.read()');page.wait_for_timeout(500);initial=state();start=initial['frame'];cpus=[];memory=[];loads=[];tracked={}
  for process in psutil.process_iter(['pid']):
   try:process.cpu_percent();tracked[process.pid]=process
   except psutil.Error:pass
  begin=time.monotonic();psutil.cpu_percent()
  while time.monotonic()-begin<a.seconds:
   page.wait_for_timeout(1000);cpus.append(psutil.cpu_percent());perf=cdp.send('Performance.getMetrics');mem={m['name']:m['value'] for m in perf['metrics'] if m['name'] in ['JSHeapUsedSize','JSHeapTotalSize','Nodes']};processes=[]
   for process in system.send('SystemInfo.getProcessInfo')['processInfo']:
    try:processes.append({**process,'rssBytes':psutil.Process(process['id']).memory_info().rss})
    except psutil.Error:pass
   mem['processes']=processes;mem['browserRssBytes']=sum(p['rssBytes'] for p in processes);memory.append(mem)
   entry={'time':time.time(),'cpuPercent':cpus[-1],'competitors':[]};browser_ids={p['id'] for p in processes}
   for pid,process in tracked.items():
    try:
     cpu=process.cpu_percent()
     if pid not in browser_ids and pid and cpu>10:entry['competitors'].append({'pid':pid,'name':process.name(),'cpuPercent':cpu,'command':process.cmdline()})
    except (psutil.Error,OSError):pass
   if nv:
    util=Util()
    if nv.nvmlDeviceGetUtilizationRates(gpu_device,ctypes.byref(util))==0:entry.update(gpuPercent=util.gpu,gpuMemoryPercent=util.memory)
   loads.append(entry)
  page.evaluate('__yongchangPerf.read()');rows=page.evaluate('(start)=>__yongchangPerf.rows.filter(r=>r[0]>start)',start);final=state()
  columns=page.evaluate('__yongchangPerf.columns');data=np.asarray(rows,dtype=float);assert len(data)>10
  summary={}
  for name in ['interval_ms','simulation_ms','camera_ms','visuals_ms','hud_ms','script_ms','draw_calls','primitives','static_bytes','nodes']:
   values=data[:,columns.index(name)];summary[name]={'p50':float(np.percentile(values,50)),'p95':float(np.percentile(values,95)),'p99':float(np.percentile(values,99)),'mean':float(np.mean(values)),'max':float(np.max(values))}
  summary['over33ms']=int(np.sum(data[:,2]>33.333));summary['frames']=len(rows);summary['engineFramesAdvanced']=int(data[-1,-1]-data[0,-1]);summary['onePercentLowFps']=1000/float(np.mean(np.sort(data[:,2])[-max(1,len(data)//100):]))
  report['samples'].append({'scenario':label,'initial':initial,'final':final,'columns':columns,'rows':rows,'summary':summary,'machineCpuPercent':cpus,'memory':memory,'load':loads});print(json.dumps({'scenario':label,'frames':len(rows),'p95':summary['interval_ms']['p95'],'scriptP95':summary['script_ms']['p95'],'visualsP95':summary['visuals_ms']['p95']}),flush=True)
 try:
  receipt=page.request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256'];assert hashlib.sha256(page.request.get(a.url+'game.pck').body()).hexdigest()==receipt['sha256']
  cdp.send('Performance.enable');page.goto(a.url+'?profile');page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
  report['renderer']=page.evaluate("(()=>{const g=document.querySelector('canvas').getContext('webgl2');const e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)})()")
  assert not any(s in report['renderer'].lower() for s in ['swiftshader','llvmpipe'])
  new_game();sample('village')
  click('宗族');click('义捐');click('义捐');click('驰援');click('驻祠');click('宗族')
  for item in [('quarry',19,39),('oxPost',22,41),('stockpile',25,42),('farm',47,54),('woodcutter',45,38)]:build(*item)
  m=state()['minimap'];page.mouse.click(m['x']+6+46.5/224*(m['width']-12),m['y']+6+48.5/96*(m['height']-12),delay=100);frame();sample('production')
  for x,z in [(41,50),(41,52),(43,53)]:build('hovel',x,z)
  click('募勇')
  for role in ['archer','spearman','ram']:
   click(world['units'][role]['name'])
  click('募勇');sample('army')
  click('全图 M');sample('overview');click('暂停');sample('paused')
  for cycle in range(a.restart_cycles):
   click('返回标题');page.wait_for_function('__yongchang.state.screen==="title" || __yongchang.state.screen==="confirm_return"')
   if state()['screen']=='confirm_return':click('确认返回')
   page.wait_for_function('__yongchang.state.screen==="title"');new_game();sample('restart-'+str(cycle+1));click('暂停')
  assert not report['errors'],report['errors'];report['passed']=True
 finally:
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
  if nv:nv.nvmlShutdown()
