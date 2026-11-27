"""Measure the authored vertices at the reported farm/tower/shed intersections."""
import argparse,hashlib,json,zlib
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--assets',default='game/assets');p.add_argument('--output',default='.build/worksites/clearance.json');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;directory=root/a.assets
world=json.loads((directory/'world.json').read_text('utf-8'));blob=zlib.decompress((directory/'geometry.bin.z').read_bytes());checks=[]
def check(name,ok,detail):checks.append({'name':name,'passed':bool(ok),'detail':detail})
def vertices(n,parent=np.eye(4)):
 x,y,z,q=n['quaternion'];m=np.eye(4)
 m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*q),2*(x*z+y*q)],[2*(x*y+z*q),1-2*(x*x+z*z),2*(y*z-x*q)],[2*(x*z-y*q),2*(y*z+x*q),1-2*(x*x+y*y)]])@np.diag(n['scale'])
 m[:3,3]=n['position'];m=parent@m;items=[]
 if 'geo' in n:
  g=world['geometries'][n['geo']];v=np.frombuffer(blob,dtype='<f4',count=g['count']*12,offset=g['offset']).reshape(-1,12).copy();v[:,:3]=v[:,:3]@m[:3,:3].T+m[:3,3];items.append(v)
 for child in n['children']:items+=vertices(child,m)
 return items
farm=world['models']['player_farm'];wheel=farm['children'][-1];wp=np.vstack(vertices(wheel));body=np.vstack(vertices(farm['children'][0]));roof=body[np.isclose(body[:,10],5)]
gap=float(roof[:,0].min()-wp[:,0].max());check('waterwheel clears shed roof',gap>.1,{'gap':gap})
tower=next(s for s in world['structures'] if s['team']=='enemy' and s['type']=='tower');tp=np.vstack(vertices(tower['model']));cloth=tp[np.isclose(tp[:,10],11)]
archer=np.vstack(vertices(world['models']['enemy_unit_archer']));head_top=float(archer[:,1].max())
gap=float(cloth[:,1].min()-tower['y']-1.81-head_top);check('standing garrison clears canopy',gap>.08,{'headClearance':gap})
shed=next(s for s in world['structures'] if s['label']=='索具仓棚');cannon=next(s for s in world['structures'] if s['team']=='enemy' and s['type']=='ballista' and s['gz']==52)
sv=np.vstack(vertices(shed['model']))[:,:3];cv=np.vstack(vertices(cannon['model']))[:,:3];overlap=np.minimum(sv.max(0),cv.max(0))-np.maximum(sv.min(0),cv.min(0))
check('south cannon clears rigging shed',bool(np.any(overlap<0)),{'axisOverlap':overlap.tolist()})
for kind in ['stockpile','oxPost']:
 model=world['models'].get('player_'+kind);spec=world['buildings'].get(kind,{})
 if model:
  v=np.vstack(vertices(model));half=np.asarray(spec.get('footprint',[0,0]))*.5
  check(kind+' mesh fits reserved footprint',bool(np.all(np.abs(v[:,[0,2]])<=half+.001)),{'footprint':spec.get('footprint')})
 else:check(kind+' mesh fits reserved footprint',False,{'missingModel':True})
report={'passed':all(c['passed'] for c in checks),'checks':checks,'sourceHashes':{f.relative_to(root).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in [directory/'world.json',directory/'geometry.bin.z',Path(__file__)]}};out=root/a.output;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2));raise SystemExit(0 if report['passed'] else 1)
