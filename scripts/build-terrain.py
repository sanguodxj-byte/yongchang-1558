"""Compile the authored Yongchang terrain into the one shared Dora/H5 world."""
import argparse,copy,hashlib,json,math,struct,zlib
from collections import deque,Counter
from pathlib import Path
import numpy as np
from terrain_field import Landscape,smooth,noise,rect_distance
from fortress_layout import structures as fortress_structures

ROOT=Path(__file__).resolve().parent.parent
LIB=ROOT/'content/model-library'
OUT=ROOT/'game/assets'
SPEC=ROOT/'content/yongchang-map.json'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def node(name,geo=None,position=None,**extra):
 n={'name':name,'position':position or [0,0,0],'quaternion':[0,0,0,1],'scale':[1,1,1],'visible':True,'children':[]}
 if geo is not None:n.update(geo=geo,tint=[1,1,1],opacity=1,water=False,emissive=False)
 n.update(extra);return n

class Geometry:
 def __init__(self):self.bytes=bytearray();self.items=[]
 def add(self,vertices,indices):
  vertices=np.asarray(vertices,dtype='<f4').reshape(-1,12);indices=np.asarray(indices,dtype='<u4').reshape(-1)
  self.items.append({'count':len(vertices),'indexCount':len(indices),'offset':len(self.bytes)})
  self.bytes.extend(vertices.tobytes());self.bytes.extend(indices.tobytes());return len(self.items)-1
 def copy(self,blob,g):
  start=g['offset'];count=g['count'];end=start+count*48
  return self.add(np.frombuffer(blob[start:end],dtype='<f4').reshape(-1,12),np.frombuffer(blob[end:end+g['indexCount']*4],dtype='<u4'))

def mesh_arrays(x,z,h,c,res,w,d,terrain_id=11):
 dz,dx=np.gradient(h,1/res,1/res);normals=np.stack([-dx,np.ones_like(h),-dz],axis=-1);normals/=np.linalg.norm(normals,axis=-1,keepdims=True)
 vertices=np.zeros((*h.shape,12),dtype=np.float32);vertices[:,:,0]=x-w/2;vertices[:,:,1]=h;vertices[:,:,2]=z-d/2;vertices[:,:,3:6]=normals;vertices[:,:,6:9]=c;vertices[:,:,9]=1;vertices[:,:,10]=terrain_id
 idx=np.arange(h.size,dtype=np.uint32).reshape(h.shape);a=idx[:-1,:-1].ravel();b=idx[:-1,1:].ravel();cc=idx[1:,:-1].ravel();dd=idx[1:,1:].ravel()
 # Godot's front faces are clockwise (opposite the imported Three.js source).
 triangles=np.stack([a,b,dd,a,dd,cc],axis=1).reshape(-1,3)
 return vertices.reshape(-1,12),triangles,np.hypot(dx,dz)

def build():
 spec=json.loads(SPEC.read_text('utf-8'));base=json.loads((LIB/'world.json').read_text('utf-8'));blob=zlib.decompress((LIB/'geometry.bin.z').read_bytes())
 w,d=spec['grid'];res=spec['samplesPerCell'];margin=spec['contextMargin'];field=Landscape(spec);rng=np.random.default_rng(spec['seed'])
 print('Sampling shared landscape',flush=True)
 xs=np.arange(-margin,w+margin+1/res,1/res);zs=np.arange(-margin,d+margin+1/res,1/res);x,z=np.meshgrid(xs,zs);f=field.sample(x,z)
 h=np.round(f['height'],5);dz,dx=np.gradient(h,1/res,1/res);slope=np.hypot(dx,dz)
 rock=smooth(.45,1.0,slope)*.8+smooth(4,11,h)*.25;rock=np.clip(rock,0,1)
 color=f['color']*(1-rock[:,:,None])+f['rock']*rock[:,:,None]
 geometry=Geometry();old_ids={}
 def remap(n):
  if 'geo' in n:
   old=n['geo']
   if old not in old_ids:old_ids[old]=geometry.copy(blob,base['geometries'][old])
   n['geo']=old_ids[old]
  for child in n['children']:remap(child)
  return n
 data=copy.deepcopy(base);data['schema']=2;data['map']=copy.deepcopy(spec['map']);data['map']['terrainVersion']=2;data['map']['routeChecks']=spec['routeChecks'];data['staticNodes']=[]
 data['structures']=fortress_structures(base,spec)
 island_shift=spec['map']['island']['x']-base['map']['island']['x'];origin_shift=(w-base['map']['width'])/2
 # Keep only the original model library and actual bridges/docks/boats, not old terrain or baked dressing.
 for model in data['models'].values():remap(model)
 inset=margin*res;core=h[inset:inset+d*res+1,inset:inset+w*res+1].copy()
 def sample_height(gx,gz):
  xx=float(np.clip(gx*res,0,w*res-.00001));zz=float(np.clip(gz*res,0,d*res-.00001));ix=int(xx);iz=int(zz);tx=xx-ix;tz=zz-iz
  a,b,c,dd=core[iz,ix],core[iz,ix+1],core[iz+1,ix],core[iz+1,ix+1]
  return float(a*(1-tx)+b*(tx-tz)+dd*tz if tx>=tz else a*(1-tz)+dd*tx+c*(tz-tx))
 def support(gx,gz):
  if any(r[0]<=gx<r[2] and r[1]<=gz<r[3] for r in field.bridges):return .4
  return sample_height(gx,gz)
 # Structures keep their original meshes and grid footprints; only the island moves.
 for s in data['structures']:
  s['y']=support(s['x']+w/2,s['z']+d/2)
  if 'model' in s:s['model']['position'][1]=s['y'];remap(s['model'])
 for i in [3,5,6,7,8,9,10,12,13]:
  n=copy.deepcopy(base['staticNodes'][i])
  if i in [5,6,12,13]:
   # These imported batches have world-space vertices and identity transforms.
   # Move each disconnected island prop/dock without stretching any triangle.
   def relocate_batch(part):
    if 'geo' in part:
     g=base['geometries'][part['geo']];start=g['offset'];end=start+g['count']*48
     vv=np.frombuffer(blob[start:end],dtype='<f4').reshape(-1,12).copy();ii=np.frombuffer(blob[end:end+g['indexCount']*4],dtype='<u4')
     offshore=vv[:,0]>=28
     assert np.all(np.ptp(offshore[ii.reshape(-1,3)].astype(int),axis=1)==0),'Prop crosses relocation boundary'
     vv[:,0]+=offshore*island_shift-origin_shift;part['geo']=geometry.add(vv,ii)
    for child in part['children']:relocate_batch(child)
   relocate_batch(n)
  else:
   remap(n);n['position'][0]+=(island_shift if i in [7,8,9,10] else 0)-origin_shift
  if i in [3,4]:n['position'][1]=support(n['position'][0]+w/2,n['position'][2]+d/2)
  data['staticNodes'].append(n)
 for deposit in data['deposits']:
  deposit['x']-=origin_shift
  deposit['y']=support(deposit['gx']+.5,deposit['gz']+.5)
  if deposit['model']:deposit['model']['position'][0]-=origin_shift;deposit['model']['position'][1]=deposit['y'];remap(deposit['model'])
 print('Building terrain and shoreline meshes',flush=True)
 vertices,triangles,slope=mesh_arrays(x,z,h,color,res,w,d)
 terrain_geo=geometry.add(vertices,triangles);data['staticNodes'].insert(0,node('Yongchang terrain',terrain_geo,terrain=True))
 # Clip the water surface to the same triangles which define the dry bank. No square water tiles.
 water_vertices=[];water_indices=[];level=spec['waterLevel'];below=vertices[:,1]<level
 for tri in triangles[np.any(below[triangles],axis=1)]:
  points=[vertices[j,:3].astype(float) for j in tri];poly=[]
  for a,b in zip(points,points[1:]+points[:1]):
   if a[1]<level:poly.append(a)
   if (a[1]<level)!=(b[1]<level):poly.append(a+(b-a)*((level-a[1])/(b[1]-a[1])))
  if len(poly)<3:continue
  start=len(water_vertices)
  for p in poly:water_vertices.append([p[0],level,p[2],0,1,0,1,1,1,1,0,.72*math.exp((p[1]-level)/.22)])
  for j in range(1,len(poly)-1):water_indices.extend([start,start+j,start+j+1])
 water_geo=geometry.add(water_vertices,water_indices);data['staticNodes'].insert(1,node('Tidal channels and sea',water_geo,water=True))
 # Logical cells derive from the exact render height grid, including triangle interpolation.
 cx,cz=np.meshgrid(np.arange(w)+.5,np.arange(d)+.5);cf=field.sample(cx,cz);cells=[]
 for gz in range(d):
  for gx in range(w):
   heights=core[gz*res:(gz+1)*res+1,gx*res:(gx+1)*res+1]
   hh=sample_height(gx+.5,gz+.5);sl=float(np.max(slope[inset+gz*res:inset+(gz+1)*res+1,inset+gx*res:inset+(gx+1)*res+1]));relief=float(heights.max()-heights.min())
   bridge=any(r[0]<=gx+.5<r[2] and r[1]<=gz+.5<r[3] for r in field.bridges)
   water=hh<level;walk=not water and sl<=spec['maxWalkSlope']
   ground='water' if water else 'bedrock' if sl>spec['maxWalkSlope'] else 'dirt_road' if cf['road'][gz,gx]<.2 else 'paddy' if cf['field'][gz,gx]>0 else 'tidal_mud' if cf['coast'][gz,gx]<6 else 'upland_grass'
   biome='river' if water else 'cliff' if not walk else 'road' if ground=='dirt_road' else 'paddy' if ground=='paddy' else 'wetland' if ground=='tidal_mud' else 'plains'
   if bridge:ground='bridge';biome='road';walk=True;hh=.4;relief=0;sl=0
   for name,px,pz,radius in [('limestone',21,41,4.2),('iron',22,63,4.2),('pitchBog',81,65,3.1)]:
    if math.hypot(gx+.5-px,gz+.5-pz)<radius and walk and not bridge:biome=name
   buildable=walk and not bridge and relief<=spec['maxBuildRelief'] and ground!='tidal_mud'
   c={'h':round(hh,5),'ground':ground,'biome':biome,'bridge':bridge,'walkable':bool(walk),'buildable':bool(buildable),'slope':round(sl,5),'relief':round(relief,5),'color':[round(float(v),4) for v in color[inset+gz*res+1,inset+gx*res+1]]}
   cells.append(c)
 data['cells']=cells
 # Forests have a dense interior, feathered irregular edges, and preserved lane clearances.
 print('Planting forest groups and low dressing',flush=True)
 templates=[];seen=set()
 for tree in base['trees']:
  if tree['model'].get('geo') in seen:continue
  seen.add(tree['model'].get('geo'));templates.append(tree['model'])
 protected=set()
 for s in data['structures']:
  for gx,gz in s['cells']:
   for a in range(-2,3):
    for b in range(-2,3):protected.add((gx+a,gz+b))
 for gx,gz in [[47,54],[45,38],[46,54],[49,54],[47,55],[48,55],[50,56],[47,57]]:
  for a in range(-1,2):
   for b in range(-1,2):protected.add((gx+a,gz+b))
 for dep in data['deposits']:
  for a in range(-2,3):
   for b in range(-2,3):protected.add((dep['gx']+a,dep['gz']+b))
 trees=[]
 for gz in range(2,d-2):
  for gx in range(2,w-2):
   c=cells[gz*w+gx]
   if not c['walkable'] or c['bridge'] or (gx,gz) in protected or c['slope']>.42 or cf['road'][gz,gx]<1.8 or cf['field'][gz,gx]>0 or cf['coast'][gz,gx]<3 or cf['canal'][gz,gx]<1:continue
   probability=cf['forest'][gz,gx]
   # A few riparian trees connect forest groups without carpeting construction space.
   if 25<gx<90 and 1.0<cf['canal'][gz,gx]<2.5:probability=max(probability,.13)
   if rng.random()>probability:continue
   model=remap(copy.deepcopy(templates[int(rng.integers(len(templates)))]));xx=gx+.5+float(rng.uniform(-.13,.13));zz=gz+.5+float(rng.uniform(-.13,.13));scale=float(rng.uniform(.9,1.25));angle=float(rng.uniform(0,math.tau))
   model['position']=[xx-w/2,support(xx,zz),zz-d/2];model['quaternion']=[0,math.sin(angle/2),0,math.cos(angle/2)];model['scale']=[scale]*3
   trees.append({'gx':gx,'gz':gz,'x':xx-w/2,'z':zz-d/2,'wood':40,'model':model})
 # Ensure the first lumber mill has a nearby real wood source.
 if not any(math.hypot(t['gx']-45,t['gz']-38)<9 for t in trees):
  for gx,gz in [(42,33),(45,32),(48,33)]:
   if cells[gz*w+gx]['walkable'] and (gx,gz) not in protected:
    model=remap(copy.deepcopy(templates[0]));model['position']=[gx+.5-w/2,support(gx+.5,gz+.5),gz+.5-d/2]
    trees.append({'gx':gx,'gz':gz,'x':gx+.5-w/2,'z':gz+.5-d/2,'wood':40,'model':model})
 data['trees']=trees
 # Batched grass/reeds: visual ground cover is ankle-high and never substitutes for solid blockers.
 def blades(reed=False):
  vv=[];ii=[]
  for i in range(5 if reed else 3):
   angle=i*2.399;xx=math.cos(angle)*.11;zz=math.sin(angle)*.11;height=.42+i*.07 if reed else .16+i*.035;width=.025 if reed else .045
   color=[.17,.24,.095] if not reed else [.22,.29,.12]
   start=len(vv)
   for p in [[xx-width,0,zz],[xx+width,0,zz],[xx+.06,height,zz+.03]]:vv.append([*p,0,1,0,*color,1,11,0])
   ii.extend([start,start+2,start+1])
  return geometry.add(vv,ii)
 grass_geo=blades();reed_geo=blades(True);dress={'grass':[],'reeds':[]}
 points=rng.uniform([1,1],[w-1,d-1],(6500,2));pf=field.sample(points[:,0],points[:,1])
 for i,(xx,zz) in enumerate(points):
  gx,gz=int(xx),int(zz);c=cells[gz*w+gx]
  if not c['walkable'] or c['bridge'] or (gx,gz) in protected or pf['road'][i]<.8 or pf['field'][i]>0:continue
  reed=pf['coast'][i]<5 or pf['canal'][i]<2.2
  if not reed and pf['forest'][i]<.12 and rng.random()>.15:continue
  scale=float(rng.uniform(.7,1.4));angle=float(rng.uniform(0,math.tau));co=math.cos(angle)*scale;si=math.sin(angle)*scale
  matrix=[co,0,-si,0,0,scale,0,0,si,0,co,0,float(xx-w/2),support(xx,zz),float(zz-d/2),1]
  dress['reeds' if reed else 'grass'].append({'matrix':matrix,'color':[1,1,1]})
 for key,geo in [('grass',grass_geo),('reeds',reed_geo)]:data['staticNodes'].append(node('Batched '+key,geo,instances=dress[key]))
 # Low stone ledges read as exposed bedrock. Large boulders are restricted to
 # already impassable slopes, so solid-looking art never blocks an open lane.
 def rock_mesh(seed):
  rr=np.random.default_rng(seed);vertices=[]
  for y,radius in [(-.20,.85),(.15,1.0),(.65,.60)]:
   for i in range(7):
    a=i*math.tau/7;rad=radius*rr.uniform(.86,1.12);vertices.append([math.cos(a)*rad,y+rr.uniform(-.07,.07),math.sin(a)*rad])
  vertices.append([.1,.82,-.05]);faces=[]
  for row in range(2):
   for i in range(7):
    j=(i+1)%7;a=row*7+i;b=row*7+j;c=(row+1)*7+i;dd=(row+1)*7+j
    faces.extend([[a,b,dd],[a,dd,c]])
  for i in range(7):faces.append([14+i,14+(i+1)%7,21])
  vv=[];indices=[];positions=np.asarray(vertices)
  for face in faces:
   a,b,c=positions[face];normal=np.cross(b-a,c-a);normal/=np.linalg.norm(normal)
   if np.dot(normal,(a+b+c)/3)<0:face=face[::-1];a,b,c=positions[face];normal=-normal
   tint=rr.uniform(.90,1.08)*np.array([.16,.18,.17]);start=len(vv)
   for p in [a,b,c]:vv.append([*p,*normal,*tint,1,11,0])
   indices.extend([start,start+2,start+1])
  return geometry.add(vv,indices)
 rock_geos=[rock_mesh(121+i) for i in range(3)];rock_instances=[[],[],[]]
 for gz in range(1,d-1):
  for gx in range(1,w-1):
   c=cells[gz*w+gx]
   if c['biome']!='cliff' or c['h']<1.6 or cf['road'][gz,gx]<3 or rng.random()>.15:continue
   xx=gx+.5;zz=gz+.5
   # Keep silhouettes safely within blocked terrain.
   if any(cells[(gz+b)*w+gx+a]['walkable'] for a,b in [(-1,0),(1,0),(0,-1),(0,1)]):continue
   k=int(rng.integers(3));scale=float(rng.uniform(.65,1.6));sy=float(rng.uniform(.5,1.1));angle=float(rng.uniform(0,math.tau));co=math.cos(angle)*scale;si=math.sin(angle)*scale
   rock_instances[k].append({'matrix':[co,0,-si,0,0,sy,0,0,si,0,co,0,xx-w/2,support(xx,zz)-.12,zz-d/2,1],'color':[1,1,1]})
 for i,geo in enumerate(rock_geos):data['staticNodes'].append(node('Exposed granite '+str(i),geo,instances=rock_instances[i]))
 data['terrain']={'version':2,'resolution':res,'width':w*res+1,'depth':d*res+1,'heights':[round(float(v),5) for v in core.ravel()], 'waterLevel':level,'maxWalkSlope':spec['maxWalkSlope'],'maxBuildRelief':spec['maxBuildRelief'],'specSha256':sha(SPEC),'heightMinimum':float(core.min()),'heightMaximum':float(core.max())}
 data['geometries']=geometry.items;data['geometryCount']=len(geometry.items);data['map']['camera']['home']=[46,47]
 data['map']['terrainMarkers']=[{'name':'大罗山麓','cell':[13,48]},{'name':'永昌村落','cell':[43,43]},{'name':'渠田平原','cell':[49,68]},{'name':'滨海湿地','cell':[91,75]},{'name':'黑鲨岛寨（虚构）','cell':spec['map']['enemyKeep']}]
 # Compact away the unused old terrain/flora geometry. Asset model vertices are copied exactly.
 (OUT/'world.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 (OUT/'geometry.bin.z').write_bytes(zlib.compress(geometry.bytes,9))
 source_files=[SPEC,Path(__file__),ROOT/'scripts/terrain_field.py',ROOT/'scripts/fortress_layout.py',LIB/'world.json',LIB/'geometry.bin.z']
 receipt={'schema':2,'sources':{p.relative_to(ROOT).as_posix():sha(p) for p in source_files},'outputs':{name:sha(OUT/name) for name in ['world.json','geometry.bin.z']},'geometryBytes':len(geometry.bytes),'triangles':sum(g['indexCount']//3 for g in geometry.items),'trees':len(trees),'dressing':{k:len(v) for k,v in dress.items()},'cells':dict(Counter(c['ground'] for c in cells)),'history':spec['history']}
 (OUT/'terrain-build.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
 preview(spec,data,cf)
 print(json.dumps({'trees':len(trees),'geometryBytes':len(geometry.bytes),'compressedBytes':(OUT/'geometry.bin.z').stat().st_size,'cells':receipt['cells']},ensure_ascii=False),flush=True)

def preview(spec,data,cf):
 from PIL import Image,ImageDraw,ImageFont
 out=ROOT/'.build/terrain';out.mkdir(parents=True,exist_ok=True);w,d=spec['grid'];scale=8
 image=Image.new('RGB',(w,d));pixels=image.load()
 for z in range(d):
  for x in range(w):
   c=data['cells'][z*w+x];color=[int(np.clip(v**(1/2.2)*255,0,255)) for v in c['color']]
   if c['ground']=='water':color=[43,89,106]
   if c['bridge']:color=[207,186,143]
   pixels[x,z]=tuple(color)
 image=image.resize((w*scale,d*scale),Image.Resampling.NEAREST);draw=ImageDraw.Draw(image)
 for t in data['trees']:
  x,z=t['gx']*scale,t['gz']*scale;draw.ellipse((x-2,z-2,x+3,z+3),fill='#254d30')
 font=ImageFont.truetype(str(ROOT/'game/assets/font.ttf'),18)
 for marker in data['map']['terrainMarkers']:
  x,z=marker['cell'];draw.text((x*scale,z*scale),marker['name'],font=font,fill='white',stroke_width=2,stroke_fill='#18313c')
 image.save(out/'terrain-plan.png')

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args()
 if a.check:
  receipt=json.loads((OUT/'terrain-build.json').read_text('utf-8'))
  for name,digest in receipt['sources'].items():assert sha(ROOT/name)==digest,'Terrain source changed; run scripts/build-terrain.py: '+name
  for name,digest in receipt['outputs'].items():assert sha(OUT/name)==digest,'Generated terrain changed: '+name
  print('Terrain inputs and outputs match')
 else:build()
