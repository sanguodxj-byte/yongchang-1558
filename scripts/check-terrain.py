"""Independent checks of shipped terrain geometry against walk/build/support data."""
import argparse,hashlib,json,zlib,math
from pathlib import Path
from collections import deque
import numpy as np
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--output',default='.build/terrain/audit.json');a=p.parse_args()
d=json.loads((root/'game/assets/world.json').read_text('utf-8'));blob=zlib.decompress((root/'game/assets/geometry.bin.z').read_bytes());w,h=map(int,[d['map']['width'],d['map']['height']]);checks=[]
def check(name,passed,detail=None):
 checks.append({'name':name,'passed':bool(passed),'detail':detail});print(name, bool(passed),detail)
def geo(n):
 g=d['geometries'][n['geo']];v=np.frombuffer(blob,dtype='<f4',count=g['count']*12,offset=g['offset']).reshape(-1,12);tri=np.frombuffer(blob,dtype='<u4',count=g['indexCount'],offset=g['offset']+g['count']*48).reshape(-1,3);return v,tri
terrain=next(n for n in d['staticNodes'] if n.get('terrain'));vertices,triangles=geo(terrain)
cross=np.cross(vertices[triangles[:,1],:3]-vertices[triangles[:,0],:3],vertices[triangles[:,2],:3]-vertices[triangles[:,0],:3])
check('Godot clockwise land faces',np.all(cross[:,1]<-.001),{'triangles':len(triangles)})
water=next(n for n in d['staticNodes'] if n.get('water'));wv,wt=geo(water)
check('flat consistent water level',np.max(abs(wv[:,1]-d['terrain']['waterLevel']))<1e-6,{'vertices':len(wv)})
resolution=d['terrain']['resolution'];heights=np.asarray(d['terrain']['heights']).reshape(d['terrain']['depth'],d['terrain']['width'])
xgrid=np.rint((vertices[:,0]+w/2)*resolution).astype(int);zgrid=np.rint((vertices[:,2]+h/2)*resolution).astype(int)
inside=(xgrid>=0)&(zgrid>=0)&(xgrid<heights.shape[1])&(zgrid<heights.shape[0]);error=np.max(np.abs(vertices[inside,1]-heights[zgrid[inside],xgrid[inside]]))
check('rendered vertices equal support heightfield',error<2e-6,{'samples':int(np.count_nonzero(inside)),'maxError':float(error)})
walk=np.asarray([c['walkable'] for c in d['cells']]).reshape(h,w);build=np.asarray([c['buildable'] for c in d['cells']]).reshape(h,w)
check('no building on water bridge or steep ground',all(not c['buildable'] or c['walkable'] and not c['bridge'] and c['relief']<=d['terrain']['maxBuildRelief'] for c in d['cells']))
check('large settlement construction reserve',int(build[24:78,29:65].sum())>1100,{'cells':int(build[24:78,29:65].sum())})
blocked=walk.copy()
for t in d['trees']:blocked[t['gz'],t['gx']]=False
for t in d['deposits']:blocked[t['gz'],t['gx']]=False
components=np.full((h,w),-1,dtype=int);sizes=[]
for z in range(h):
 for x in range(w):
  if not blocked[z,x] or components[z,x]>=0:continue
  ident=len(sizes);queue=deque([(x,z)]);components[z,x]=ident;count=0
  while queue:
   xx,zz=queue.popleft();count+=1
   for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
    nx,nz=xx+dx,zz+dz
    if 0<=nx<w and 0<=nz<h and blocked[nz,nx] and components[nz,nx]<0:components[nz,nx]=ident;queue.append((nx,nz))
  sizes.append(count)
main=components[45,48];ix,iz=d["map"]["ports"]["island"]["landing"];island=components[iz,ix]
check('mainland and island separated by sea',main>=0 and island>=0 and main!=island,{'mainlandCells':sizes[main],'islandCells':sizes[island]})
check('both mainland landing sites reachable',all(components[p['landing'][1],p['landing'][0]]==main for name,p in d['map']['ports'].items() if name!='island'))
resource_access=[]
for dep in d['deposits']:
 x,z=dep['gx'],dep['gz'];neighbors=[components[z+dz,x+dx] for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]]
 resource_access.append(main in neighbors)
check('all resource deposits accessible',all(resource_access),{'deposits':len(resource_access)})
def sampled_height(x,z):
 x=(x+w/2)*resolution;z=(z+h/2)*resolution;ix=int(x);iz=int(z);tx=x-ix;tz=z-iz
 a,b,c,dd=heights[iz,ix],heights[iz,ix+1],heights[iz+1,ix],heights[iz+1,ix+1]
 return a*(1-tx)+b*(tx-tz)+dd*tz if tx>=tz else a*(1-tz)+dd*tx+c*(tz-tx)
check('forest trunk bases are planted into actual slope',all(-.26<t['model']['position'][1]-sampled_height(t['x'],t['z'])<.035 for t in d['trees']),{'trees':len(d['trees'])})
check('terrain has no per-cell rock proxy meshes',not any('rock obstacles' in n['name'].lower() for n in d['staticNodes']))
bad=[]
for i,c in enumerate(d['cells']):
 if c['buildable'] or c['bridge'] or c['ground']=='water':continue
 patch=heights[(i//w)*resolution:(i//w+1)*resolution+1,(i%w)*resolution:(i%w+1)*resolution+1]
 valid=c['slope']>d['terrain']['maxWalkSlope'] or patch.min()<=d['terrain']['waterLevel']+.0151 or c['ground']=='tidal_mud' and c['h']<d['terrain']['waterLevel']+.30
 if not valid:bad.append([i%w,i//w])
check('dry terrain restrictions come from actual slope water or wet soil',not bad,{'unexplained':bad[:10]})
for name,x,z in [('west-ridge',8,48),('village',43,43),('coastal-plain',86,49)]:
 c=d['cells'][z*w+x];print('Height anchor',name,c['h'])
check('western ridges dominate low plain',d['cells'][48*w+8]['h']>4 and d['cells'][43*w+43]['h']<1 and d['cells'][49*w+86]['h']<1)
# Detection control: flipping a genuine terrain face must fail the winding criterion.
planted=triangles[0,[0,2,1]];n=np.cross(vertices[planted[1],:3]-vertices[planted[0],:3],vertices[planted[2],:3]-vertices[planted[0],:3])
check('winding detector rejects reversed face',n[1]>0)
report={'passed':all(c['passed'] for c in checks),'checks':checks,'contentHash':hashlib.sha256((root/'game/assets/world.json').read_bytes()).hexdigest()}
out=root/a.output;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');raise SystemExit(0 if report['passed'] else 1)
