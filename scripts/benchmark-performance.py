"""Run Godot production scenes without captures, and report measured frame tails."""
import argparse,hashlib,json,os,platform,subprocess,time,threading
from pathlib import Path
import numpy as np
import psutil
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--game',default='game');p.add_argument('--duration',type=float,default=20);p.add_argument('--deterministic',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.output;out.mkdir(parents=True,exist_ok=True);project=(root/a.game).resolve()
env=os.environ.copy();env['APPDATA']=env['LOCALAPPDATA']=str(out/'profile');stop=threading.Event();load=[];child=None
inputs=list((project/'scripts').glob('*.gd'))+list((project/'shaders').glob('*.gdshader'))+[project/'tests/performance-benchmark.gd',project/'project.godot',project/'main.tscn',project/'assets/world.json',project/'assets/geometry.bin.z']
hashes={str(p.relative_to(project)):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
def monitor():
 psutil.cpu_percent()
 processes={}
 while not stop.wait(1):
  entry={'time':time.time(),'cpuPercent':psutil.cpu_percent(),'availableRam':psutil.virtual_memory().available}
  competitors=[]
  for process in psutil.process_iter(['pid','name']):
   try:
    if process.pid==0:continue
    if process.pid not in processes:process.cpu_percent();processes[process.pid]=process;continue
    process=processes[process.pid];cpu=process.cpu_percent()
    if child and process.pid==child.pid:entry.update(gameCpuPercent=cpu,gameRssBytes=process.memory_info().rss)
    elif cpu>10:competitors.append({'pid':process.pid,'name':process.name(),'cpuPercent':cpu,'command':process.cmdline()})
   except (psutil.Error,OSError):pass
  entry['competitors']=competitors
  load.append(entry)
t=threading.Thread(target=monitor);t.start()
command=[r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64.exe','--path',str(project),'--rendering-method','gl_compatibility','--disable-vsync','--max-fps','0','--script','res://tests/performance-benchmark.gd','--','--profile','--duration='+str(a.duration),'--output='+str(out/'raw.json')]
if a.deterministic:command[1:1]=['--fixed-fps','60'];command.append('--deterministic')
try:
 with (out/'run.log').open('w',encoding='utf-8') as log_file:
  child=subprocess.Popen(command,env=env,stdout=log_file,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  try:child.wait(timeout=360)
  except subprocess.TimeoutExpired:child.kill();child.wait();raise
finally:stop.set();t.join()
log=(out/'run.log').read_text('utf-8',errors='replace');assert child.returncode==0 and 'SCRIPT ERROR:' not in log,log[-5000:]
assert all(hashlib.sha256((project/p).read_bytes()).hexdigest()==h for p,h in hashes.items()),'Sources changed during benchmark'
raw=json.loads((out/'raw.json').read_text('utf-8'));assert raw['passed'];summary=[]
for scenario in raw['scenarios']:
 expected='pause' if scenario['scenario']=='paused' else 'play'
 assert scenario['initial']['state']==scenario['final']['state']==expected,'Scenario was interrupted: '+scenario['scenario']
 elapsed=scenario['final']['time']-scenario['initial']['time']
 assert (elapsed==0 if expected=='pause' else elapsed>=a.duration*.85),'Simulation did not advance for the timed window: '+scenario['scenario']
for scenario in raw['scenarios']:
 data=np.asarray(scenario['rows'],dtype=float);columns=scenario['columns'];row={'scenario':scenario['scenario'],'frames':len(data),'staged':scenario['staged']}
 for name in ['interval_ms','simulation_ms','camera_ms','visuals_ms','hud_ms','script_ms','draw_calls','primitives','objects','static_bytes','nodes']:
  values=data[:,columns.index(name)];values=values[values>0] if name=='interval_ms' else values
  row[name]={'p50':float(np.percentile(values,50)),'p95':float(np.percentile(values,95)),'p99':float(np.percentile(values,99)),'mean':float(np.mean(values)),'max':float(np.max(values))}
 values=data[1:,2];median=np.median(values);row['over33ms']=int(np.sum(values>33.333));row['over2xMedian']=int(np.sum(values>median*2));row['onePercentLowFps']=1000/float(np.mean(np.sort(values)[-max(1,len(values)//100):]));summary.append(row)
result={'passed':True,'runtime':'Godot 4.7.2 OpenGL native uncapped','deterministic':a.deterministic,'profile':raw.get('profile',{}),'renderer':raw['renderer'],'machine':{'logicalCores':os.cpu_count(),'ramBytes':psutil.virtual_memory().total},'load':load,'scenarios':summary,'sourceHashes':hashes}
(out/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
for r in summary:print(json.dumps({'scenario':r['scenario'],'frames':r['frames'],'frameP95':r['interval_ms']['p95'],'scriptP95':r['script_ms']['p95'],'visualsP95':r['visuals_ms']['p95'],'drawCalls':r['draw_calls']['p50']}),flush=True)
