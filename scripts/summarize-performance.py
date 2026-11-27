"""Combine interleaved runs; fail if staged gameplay differs between A and B."""
import argparse,json,statistics
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--directory',default='.build/performance');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/a.directory
names=['paired-a1','paired-b1','paired-a2','paired-b2']
runs={n:json.loads((out/n/'raw.json').read_text('utf-8')) for n in names}
reports={n:json.loads((out/n/'report.json').read_text('utf-8')) for n in names}
result={'passed':False,'runs':names,'scenarios':[],'load':{},'notes':['Fixed 1/60 engine delta; 480 warmup frames and 600 sampled frames per scene and run.','Frame times are uncapped native render callbacks, not 60 Hz display presentation.','Shared CPU/GPU; frame-tail changes are observations, use measured script cost for optimization conclusions.']}
for n,r in reports.items():
 entries=r['load'];game=[v.get('gameCpuPercent',0)/r['machine']['logicalCores'] for v in entries]
 result['load'][n]={'totalCpuMeanPercent':statistics.mean(v['cpuPercent'] for v in entries),'gameCpuMeanAllCoresPercent':statistics.mean(game),'gameRssPeakBytes':max(v.get('gameRssBytes',0) for v in entries)}
for index,scene in enumerate(runs[names[0]]['scenarios']):
 row={'scenario':scene['scenario'],'staged':scene['staged'],'stateMatches':True}
 for n in names:
  s=runs[n]['scenarios'][index]
  assert s['initial']==scene['initial'] and s['final']==scene['final'],f'Gameplay differs: {n}, {scene["scenario"]}'
  assert s['viewInitial']==scene['viewInitial'] and s['viewFinal']==scene['viewFinal'],f'View differs: {n}, {scene["scenario"]}'
  for key in ['stateInitialSha256','stateFinalSha256']:
   assert s[key]==scene[key],f'Full simulation state differs: {n}, {scene["scenario"]}, {key}'
 row['fullStateMatches']=True
 for label,ids in [('baseline',['paired-a1','paired-a2']),('optimized',['paired-b1','paired-b2'])]:
  values=np.concatenate([np.asarray(runs[n]['scenarios'][index]['rows'],dtype=float) for n in ids]);cols=scene['columns'];metrics={}
  for key in ['interval_ms','simulation_ms','visuals_ms','hud_ms','script_ms','draw_calls','primitives','static_bytes','nodes']:
   v=values[:,cols.index(key)];v=v[v>0] if key=='interval_ms' else v
   metrics[key]={k:float(x) for k,x in zip(['mean','p50','p95','p99','max'],[np.mean(v),*np.percentile(v,[50,95,99]),max(v)])}
  metrics['runScriptMeans']=[reports[n]['scenarios'][index]['script_ms']['mean'] for n in ids]
  v=values[:,2];v=v[v>0];metrics['onePercentLowFps']=1000/np.mean(np.sort(v)[-max(1,len(v)//100):]);metrics['over33ms']=int(sum(v>33.333));metrics['over2xMedian']=int(sum(v>np.median(v)*2));metrics['frames']=len(values)
  row[label]=metrics
 row['scriptMeanReductionPercent']=100*(1-row['optimized']['script_ms']['mean']/row['baseline']['script_ms']['mean'])
 row['drawMedianChangePercent']=100*(row['optimized']['draw_calls']['p50']/row['baseline']['draw_calls']['p50']-1)
 assert abs(row['drawMedianChangePercent'])<2,f'Content draw count changed: {row}'
 result['scenarios'].append(row)
result['passed']=True;(out/'comparison.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
for r in result['scenarios']:
 print(r['scenario'], 'script mean',round(r['baseline']['script_ms']['mean'],2),'->',round(r['optimized']['script_ms']['mean'],2),'ms;',round(r['scriptMeanReductionPercent'],1),'% less')
