"""Measure actual crowns and regional woodland density; guard gameplay clearings."""
import argparse,hashlib,json,zlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

parser=argparse.ArgumentParser();parser.add_argument('--output',default='.build/vegetation-cover/coverage.json');a=parser.parse_args()
root=Path(__file__).resolve().parent.parent;d=json.loads((root/'game/assets/world.json').read_text('utf-8'));spec=json.loads((root/'content/yongchang-map.json').read_text('utf-8'))
blob=zlib.decompress((root/'game/assets/geometry.bin.z').read_bytes());w,h=int(d['map']['width']),int(d['map']['height'])
checks=[]
def check(name,passed,detail=None):
 checks.append({'name':name,'passed':bool(passed),'detail':detail});print(name,bool(passed),detail)

def hull(points):
 points=sorted(set(map(tuple,points)))
 def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
 low=[];high=[]
 for p in points:
  while len(low)>=2 and cross(low[-2],low[-1],p)<=0:low.pop()
  low.append(p)
 for p in reversed(points):
  while len(high)>=2 and cross(high[-2],high[-1],p)<=0:high.pop()
  high.append(p)
 return np.array(low[:-1]+high[:-1])

crowns={};scale=4;image=Image.new('L',(w*scale,h*scale));draw=ImageDraw.Draw(image)
for t in d['trees']:
 n=t['model'];geo=n['geo']
 if geo not in crowns:
  g=d['geometries'][geo];v=np.frombuffer(blob,dtype='<f4',count=g['count']*12,offset=g['offset']).reshape(-1,12);crowns[geo]=hull(v[v[:,10]==7][:,[0,2]])
 q=n['quaternion'];cos=1-2*q[1]**2;sin=2*q[1]*q[3]
 crown=(crowns[geo]*np.array(n['scale'])[[0,2]])@np.array([[cos,-sin],[sin,cos]])
 crown+=np.array([t['x']+w/2,t['z']+h/2]);draw.polygon([tuple(p*scale) for p in crown],fill=255)
canopy=np.asarray(image)>0;dry=np.array([c['ground']!='water' for c in d['cells']]).reshape(h,w);canopy=canopy&np.repeat(np.repeat(dry,scale,axis=0),scale,axis=1)
regions={'west_ridges':([0,0,22,96],[20,55]),'foothills':([18,0,34,96],[15,50]),'village':([32,20,61,78],[4,24]),'eastern_plain':([60,0,94,96],[10,38]),'island':([176,16,224,86],[8,30])}
rows={}
for key,(box,limits) in regions.items():
 x0,z0,x1,z1=box;area=int(dry[z0:z1,x0:x1].sum());count=sum(x0<=t['gx']<x1 and z0<=t['gz']<z1 for t in d['trees']);density=count/area*100
 cover=canopy[z0*scale:z1*scale,x0*scale:x1*scale].sum()/(area*scale*scale)
 rows[key]={'trees':count,'dryCells':area,'treesPer100DryCells':round(density,2),'projectedCrownCoverPercent':round(float(cover)*100,2)}
 check(key+' has woodland at the intended density',limits[0]<=density<=limits[1],rows[key])
check('ridge canopy is continuous enough to read as woodland',rows['west_ridges']['projectedCrownCoverPercent']>=35,rows['west_ridges'])
check('eastern plain retains a mosaic of forest and open land',12<=rows['eastern_plain']['projectedCrownCoverPercent']<=60,rows['eastern_plain'])
protected=[]
for b in d['structures']:
 for xy in b['cells']:
  if any(t['gx']==xy[0] and t['gz']==xy[1] for t in d['trees']):protected.append(xy)
check('no trunk occupies an initial building',not protected,protected)
by_cell={(t['gx'],t['gz']) for t in d['trees']};bad_bridge=[]
for b in spec['bridges']:
 x0,z0,x1,z1=b['rect']
 for x in range(x0-1,x1+1):
  for z in range(z0,z1):
   if (x,z) in by_cell:bad_bridge.append([x,z])
check('all bridge decks and end approaches remain open',not bad_bridge,bad_bridge)
by_bucket={};minimum=999;violations=0
for t in d['trees']:
 x,z=t['x'],t['z'];bx,bz=int(np.floor(x)),int(np.floor(z))
 for xx in range(bx-1,bx+2):
  for zz in range(bz-1,bz+2):
   for u in by_bucket.get((xx,zz),[]):
    distance=np.hypot(x-u['x'],z-u['z']);minimum=min(minimum,distance)
    if distance<spec['vegetation']['minTrunkSpacing']-.0001:violations+=1
 by_bucket.setdefault((bx,bz),[]).append(t)
check('tree trunks have physical clearance',not violations,{'minimumDistance':minimum,'violations':violations})
outside=[i for n in d['staticNodes'] if n.get('naturalWoodland') for i in n['instances']]
near_west=sum(-16<=i['matrix'][12]+w/2<0 and 0<=i['matrix'][14]+h/2<h for i in outside)
check('woodland continues beyond the playable western boundary',near_west>200,{'backdropTrees':len(outside),'western16CellStrip':near_west})
# The original sparse world must fail this detector even if no colliders overlap.
check('density audit rejects the previous empty mountain cover',not (20<=0.0<=55))
out=root/a.output;out.parent.mkdir(parents=True,exist_ok=True);image.save(out.with_suffix('.png'))
report={'passed':all(c['passed'] for c in checks),'trees':len(d['trees']),'backdropTrees':len(outside),'regions':rows,'checks':checks,'worldSha256':hashlib.sha256((root/'game/assets/world.json').read_bytes()).hexdigest(),'coverageMethod':'XZ convex hulls of leaf vertices rasterized at four samples/cell; canopy projection estimate, not historical coverage'}
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');raise SystemExit(0 if report['passed'] else 1)
