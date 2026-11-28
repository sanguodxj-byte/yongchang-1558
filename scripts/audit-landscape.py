"""Full-map audit from shipped terrain triangles, water and visible object bases."""
import argparse,hashlib,json,zlib
from collections import Counter,deque
from pathlib import Path
import numpy as np

parser=argparse.ArgumentParser();parser.add_argument('--output',default='.build/landscape-audit/physics.json');a=parser.parse_args()
root=Path(__file__).resolve().parent.parent
world_path=root/'game/assets/world.json';d=json.loads(world_path.read_text('utf-8'))
blob=zlib.decompress((root/'game/assets/geometry.bin.z').read_bytes())
w,depth=int(d['map']['width']),int(d['map']['height']);res=int(d['terrain']['resolution']);level=d['terrain']['waterLevel']
heights=np.array(d['terrain']['heights']).reshape(d['terrain']['depth'],d['terrain']['width'])
results=[]

def check(name,passed,count,detail=None):
 results.append({'name':name,'passed':bool(passed),'examined':int(count),'detail':detail})
 print(name,bool(passed),detail)

def geometry(n):
 g=d['geometries'][n['geo']]
 v=np.frombuffer(blob,dtype='<f4',count=g['count']*12,offset=g['offset']).reshape(-1,12)
 tri=np.frombuffer(blob,dtype='<u4',count=g['indexCount'],offset=g['offset']+g['count']*48).reshape(-1,3)
 return v,tri

land=next(n for n in d['staticNodes'] if n.get('terrain'));lv,lt=geometry(land)
# Decode the rendered grid, including the 64-cell context beyond the playable map.
xs=np.unique(lv[:,0]);zs=np.unique(lv[:,2]);rendered=lv[:,1].reshape(len(zs),len(xs))
def height(x,z):
 x=np.clip((np.asarray(x,dtype=float)-xs[0])*res,0,len(xs)-1.00001);z=np.clip((np.asarray(z,dtype=float)-zs[0])*res,0,len(zs)-1.00001)
 ix=x.astype(int);iz=z.astype(int);tx=x-ix;tz=z-iz
 aa=rendered[iz,ix];bb=rendered[iz,ix+1];cc=rendered[iz+1,ix];dd=rendered[iz+1,ix+1]
 return np.where(tx>=tz,aa*(1-tx)+bb*(tx-tz)+dd*tz,aa*(1-tz)+dd*tx+cc*(tz-tx))

def transform(n):
 q=np.array(n.get('quaternion',[0,0,0,1]),float);x,y,z,t=q
 rotation=np.array([[1-2*(y*y+z*z),2*(x*y-z*t),2*(x*z+y*t)],
                    [2*(x*y+z*t),1-2*(x*x+z*z),2*(y*z-x*t)],
                    [2*(x*z-y*t),2*(y*z+x*t),1-2*(x*x+y*y)]])
 m=np.eye(4);m[:3,:3]=rotation@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('position',[0,0,0]);return m

def vertices(n,parent=None):
 m=(np.eye(4) if parent is None else parent)@transform(n);parts=[]
 if 'geo' in n:
  v,_=geometry(n);parts.append(v[:,:3]@m[:3,:3].T+m[:3,3])
 for child in n.get('children',[]):parts.extend(vertices(child,m))
 return parts

def components(mask):
 seen=np.zeros(mask.shape,bool);sizes=[]
 for row,col in np.argwhere(mask):
  if seen[row,col]:continue
  todo=deque([(row,col)]);seen[row,col]=1;count=0;edge=False
  while todo:
   z,x=todo.popleft();count+=1
   edge|=z in (0,mask.shape[0]-1) or x in (0,mask.shape[1]-1)
   for zz,xx in [(z-1,x),(z+1,x),(z,x-1),(z,x+1)]:
    if 0<=zz<mask.shape[0] and 0<=xx<mask.shape[1] and mask[zz,xx] and not seen[zz,xx]:seen[zz,xx]=1;todo.append((zz,xx))
  sizes.append({'samples':count,'touchesBoundary':edge})
 return sorted(sizes,key=lambda c:-c['samples'])

max_step=max(np.abs(np.diff(rendered,axis=0)).max(),np.abs(np.diff(rendered,axis=1)).max())
check('no narrow highland trenches across full visible terrain',max_step<1.6,rendered.size,{'maxHalfCellStep':float(max_step),'before':11.25597})
fake=rendered[:8,:8].copy();fake[3,3]+=8
check('trench detector rejects planted height spike',max(np.abs(np.diff(fake,axis=0)).max(),np.abs(np.diff(fake,axis=1)).max())>1.6,fake.size)
gx,gz=np.meshgrid(np.arange(w*res+1)/res-w/2,np.arange(depth*res+1)/res-depth/2)
check('support data equals actually rendered ground',np.max(abs(height(gx,gz)-heights))<2e-6,heights.size)
water_nodes=[n for n in d['staticNodes'] if n.get('water')];wv,wt=geometry(water_nodes[0])
check('all water stays level and above its own bed',np.max(abs(wv[:,1]-level))<1e-6 and np.max(height(wv[:,0],wv[:,2])-wv[:,1])<3e-5,len(wv))
parts=components(heights<level)
check('both branches and sea are one connected water body',len(parts)==1,heights.size,parts)
plant=heights<level;plant=plant.copy();plant[40:45,40:45]=False;plant[42,42]=True
check('water audit catches a disconnected inland pocket',len(components(plant))>1,plant.size)
rocks=[n for n in d['staticNodes'] if 'rock obstacles' in n['name'].lower() or 'exposed granite' in n['name'].lower()]
check('no grid of decorative rock blockers',not rocks,len(d['staticNodes']),{'rockProps':sum(len(n.get('instances',[])) for n in rocks)})

bad=[];counts=Counter();slope_limit=d['terrain']['maxWalkSlope']
for i,c in enumerate(d['cells']):
 x,z=i%w,i//w;patch=heights[z*res:(z+1)*res+1,x*res:(x+1)*res+1]
 low=float(patch.min());counts[c.get('obstacle','')]+=1
 if c['bridge'] or c['ground']=='water' or c['buildable']:continue
 reason=c.get('obstacle')
 valid=reason=='slope' and c['slope']>slope_limit or reason=='bank' and low<=level+.0151 or reason=='marsh' and c['h']<level+.30
 if not valid:bad.append([x,z,reason])
check('every blocked dry cell has visible terrain evidence',not bad,len(d['cells']),{'restrictions':dict(counts),'unexplained':bad[:20]})

def root_gaps(n):
 points=np.concatenate(vertices(n))
 if n.get('naturalOutcrop'):
  # Embedded bedrock has a closed buried underside. Inspect the outer footprint
  # skirt, not the lowest vertex anywhere inside a sloping solid.
  footprint=sorted(set(map(tuple,points[:,[0,2]])))
  def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
  lower=[];upper=[]
  for xy in footprint:
   while len(lower)>=2 and cross(lower[-2],lower[-1],xy)<=0:lower.pop()
   lower.append(xy)
  for xy in reversed(footprint):
   while len(upper)>=2 and cross(upper[-2],upper[-1],xy)<=0:upper.pop()
   upper.append(xy)
  base=[]
  for x,z in lower[:-1]+upper[:-1]:
   column=points[(points[:,0]==x)&(points[:,2]==z)]
   base.append(column[np.argmin(column[:,1])])
  base=np.asarray(base)
 else:
  bottom=points[:,1].min();base=points[points[:,1]<=bottom+.04]
 return base[:,1]-height(base[:,0],base[:,2])

for label,items in [('trees',d['trees']),('resource deposits',d['deposits'])]:
 gaps=[root_gaps(t['model']) for t in items];upper=max(g.max() for g in gaps);lower=min(g.min() for g in gaps)
 check(label+' visible bases contact ground',upper<.09 and lower>-.26,len(items),{'largestGap':float(upper),'deepestBase':float(lower)})
 check('root audit detects raised '+label+' geometry',all(float(g.max()+.4)>.09 for g in gaps),len(items))

cover=[];phases=[];root_points=0
for n in d['staticNodes']:
 if not n.get('naturalCover'):continue
 v,_=geometry(n);base=v[v[:,1]<.001,:3]
 for ins in n['instances']:
  m=np.array(ins['matrix']).reshape(4,4).T;points=base@m[:3,:3].T+m[:3,3];gap=points[:,1]-height(points[:,0],points[:,2]);cover.append([gap.max(),gap.min()]);root_points+=len(base)
  phases.append([m[0,3]+w/2,m[2,3]+depth/2])
cover=np.array(cover);phases=np.mod(phases,1)
check('every drawn grass and reed root contacts ground',len(cover)>0 and cover[:,0].max()<.09 and cover[:,1].min()>-.26,root_points,{'instances':len(cover),'gap':float(cover[:,0].max()),'buried':float(cover[:,1].min())})
hist,_=np.histogram(phases[:,0],bins=np.linspace(0,1,9))
check('vegetation offsets do not repeat a grid stencil',hist.min()>0 and hist.max()/max(hist.sum(),1)<.25,len(phases),{'phaseHistogram':hist.tolist()})

background_gaps=[]
for n in d['staticNodes']:
 if not n.get('naturalWoodland'):continue
 v,_=geometry(n);base=v[v[:,1]<v[:,1].min()+.025,:3]
 for instance in n['instances']:
  m=np.array(instance['matrix']).reshape(4,4).T;points=base@m[:3,:3].T+m[:3,3]
  gap=points[:,1]-height(points[:,0],points[:,2]);background_gaps.append([gap.max(),gap.min()])
if background_gaps:
 background_gaps=np.array(background_gaps)
 check('backdrop trees root in the visible context terrain',background_gaps[:,0].max()<.09 and background_gaps[:,1].min()>-.26,len(background_gaps),{'largestGap':float(background_gaps[:,0].max()),'deepestBase':float(background_gaps[:,1].min())})

bridges=[n for n in d['staticNodes'] if n.get('bridge')];approach_errors=[];deck_ties=[]
for n in bridges:
 x0,z0,x1,z1=n['bridge'];z=np.linspace(z0+.25,z1-.25,7)-depth/2
 for x in [x0,x1]:approach_errors.extend((height(np.full_like(z,x-w/2),z)-.4).tolist())
 xx,zz=np.meshgrid(np.linspace(x0+.25,x1-.25,13)-w/2,np.linspace(z0+.25,z1-.25,7)-depth/2)
 deck_ties.extend((.4-height(xx,zz)).ravel().tolist())
check('all five bridge approaches meet deck',max(abs(np.array(approach_errors)))<.07,len(approach_errors),{'maxError':float(max(abs(np.array(approach_errors))))})
check('ground does not intersect timber deck interiors',min(deck_ties)>.04,len(deck_ties),{'minimumSeparation':float(min(deck_ties))})

# Inspect floors of initial structures over their actual gameplay footprints.
structure_gaps=[]
for b in d['structures']:
 points=[(cell[0]+dx-w/2,cell[1]+dz-depth/2) for cell in b['cells'] for dx,dz in [(.2,.2),(.8,.2),(.2,.8),(.8,.8)]]
 xs0,zs0=np.array(points).T;support=height(xs0,zs0);structure_gaps.append({'name':b['label'],'cell':[b['gx'],b['gz']],'gap':float(b['y']-support.min()),'buried':float(support.max()-b['y'])})
check('initial building floors have local support',all(v['gap']<.16 and v['buried']<.16 for v in structure_gaps),len(structure_gaps),sorted(structure_gaps,key=lambda v:max(v['gap'],v['buried']),reverse=True)[:8])
regions=[]
for z in range(3):
 for x in range(7):
  cells=[d['cells'][zz*w+xx] for zz in range(z*32,(z+1)*32) for xx in range(x*32,(x+1)*32)]
  regions.append({'tile':[x,z],'cells':len(cells),'walkable':sum(c['walkable'] for c in cells),'buildable':sum(c['buildable'] for c in cells),'heightRange':[min(c['h'] for c in cells),max(c['h'] for c in cells)]})
check('full map partition includes every cell once',sum(v['cells'] for v in regions)==w*depth,len(regions),{'cells':w*depth})
report={'passed':all(r['passed'] for r in results),'checks':results,'regions':regions,'worldSha256':hashlib.sha256(world_path.read_bytes()).hexdigest()}
out=root/a.output;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');raise SystemExit(0 if report['passed'] else 1)
