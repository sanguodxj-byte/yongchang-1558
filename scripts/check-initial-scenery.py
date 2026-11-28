"""Audit actual startup geometry: no free scenery structures, five timber bridges."""
import argparse,json,zlib
from pathlib import Path
import numpy as np

p=argparse.ArgumentParser();p.add_argument('--output',default='.build/natural-start/scenery.json');a=p.parse_args()
root=Path(__file__).resolve().parent.parent
data=json.loads((root/'game/assets/world.json').read_text('utf-8'))
spec=json.loads((root/'content/yongchang-map.json').read_text('utf-8'))
blob=zlib.decompress((root/'game/assets/geometry.bin.z').read_bytes());checks=[]

def check(name,passed,detail=None):
 checks.append({'name':name,'passed':bool(passed),'detail':detail});print(name,bool(passed),detail)

def geometry(node):
 g=data['geometries'][node['geo']]
 v=np.frombuffer(blob,dtype='<f4',count=g['count']*12,offset=g['offset']).reshape(-1,12)
 t=np.frombuffer(blob,dtype='<u4',count=g['indexCount'],offset=g['offset']+g['count']*48).reshape(-1,3)
 return v,t

natural_names={'Yongchang terrain','Tidal channels and sea','Batched grass','Batched reeds','Unbuildable reed marsh'}
natural_names.update('Terrain rock obstacles '+str(i) for i in range(3))
natural_names.update('Exposed granite '+str(i) for i in range(3))
unexpected=[n['name'] for n in data['staticNodes'] if n['name'] not in natural_names and n.get('initialBuilding')!='campfire' and not n.get('bridge') and not n.get('naturalWoodland')]
check('no unregistered manmade startup scenery',not unexpected,unexpected)
bridges=[n for n in data['staticNodes'] if n.get('bridge')]
check('exactly five authored wooden crossings',len(bridges)==5 and sorted(n['bridge'] for n in bridges)==sorted(b['rect'] for b in spec['bridges']))
for i,n in enumerate(bridges):
 v,t=geometry(n);rect=n['bridge'];length=rect[2]-rect[0];width=rect[3]-rect[1]
 check('bridge %d has only real timber surfaces'%i,np.all(v[:,10]==4) and len(t)>100,{'triangles':len(t)})
 cross=np.cross(v[t[:,1],:3]-v[t[:,0],:3],v[t[:,2],:3]-v[t[:,0],:3])
 check('bridge %d winding matches outward normals'%i,np.all(np.sum(cross*v[t[:,0],3:6],axis=1)<-1e-8))
 top=(abs(v[:,1]-.4)<1e-6)&(v[:,4]>.9)
 check('bridge %d deck matches navigation height and full footprint'%i,top.sum()>40 and abs(v[top,0].max()-v[top,0].min()-length)<.03 and abs(v[top,2].max()-v[top,2].min()-width)<.01)
expected={(x,z) for b in spec['bridges'] for x in range(b['rect'][0],b['rect'][2]) for z in range(b['rect'][1],b['rect'][3])}
w=int(data['map']['width']);actual={(i%w,i//w) for i,c in enumerate(data['cells']) if c['bridge']}
check('no invisible quay or bridge collision remains',actual==expected,{'bridgeCells':len(actual)})
check('no paved roads tilled fields or masonry banks',all(c['ground'] not in ['dirt_road','paddy'] for c in data['cells']) and not any('masonry' in n['name'].lower() for n in data['staticNodes']))
check('pitch resource is an unworked seep',all(d['model']['name']=='Natural pitch seep' for d in data['deposits'] if d['kind']=='pitch'))
for name,port in data['map']['ports'].items():
 x,z=port.get('rally',port['landing']);c=data['cells'][z*w+x]
 check(name+' embarks from real dry walkable land',not c['bridge'] and c['walkable'] and c['ground']!='water' and c['h']>data['terrain']['waterLevel'])
report={'passed':all(c['passed'] for c in checks),'checks':checks}
out=root/a.output;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
raise SystemExit(0 if report['passed'] else 1)
