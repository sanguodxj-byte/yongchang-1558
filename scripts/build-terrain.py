"""Compile the authored Yongchang terrain into the one shared Dora/H5 world."""
import argparse,copy,hashlib,json,math,struct,zlib
from collections import deque,Counter
from pathlib import Path
import numpy as np
from terrain_field import Landscape,smooth,noise,rect_distance
from fortress_layout import structures as fortress_structures
from natural_scenery import wooden_bridge,pitch_seep,bedrock_outcrop

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
 initial_structures=fortress_structures(base,spec)
 print('Sampling shared landscape',flush=True)
 xs=np.arange(-margin,w+margin+1/res,1/res);zs=np.arange(-margin,d+margin+1/res,1/res);x,z=np.meshgrid(xs,zs);f=field.sample(x,z)
 h=f['height'].copy()
 # Only real initial building footprints have a fitted foundation seat.
 # No resource-yard rectangle or road corridor is carved into the landscape.
 for structure in initial_structures:
  cells0=np.asarray(structure['cells']);lo=cells0.min(axis=0);hi=cells0.max(axis=0)+1
  rect=[lo[0],lo[1],hi[0],hi[1]];cx,cz=(lo+hi)*.5
  iy=int(round((cz+margin)*res));ix=int(round((cx+margin)*res));target=float(f['height'][iy,ix])
  seat=1-smooth(0,.65,rect_distance(x,z,rect))
  h=h*(1-seat)+target*seat
 h=np.round(h,5);dz,dx=np.gradient(h,1/res,1/res);slope=np.hypot(dx,dz)
 # Bedrock is exposed by slope and erosion, with soil/lichen breaking up the
 # margins. A shared palette keeps resource exposures part of the same mountain.
 exposure=.68+noise(x*.23,z*.19,417)*.32
 rock=np.clip(smooth(.38,.88,slope)*exposure+smooth(5,12,h)*.23,0,1)
 # Weathered seams continue upslope into the ridge rather than leaving resource
 # tokens standing in a clean grass circle. This is colour only, not a new wall.
 for kind in ['stone','iron']:
  for gx,gz in spec['map']['deposits'][kind]:
   seam=np.exp(-((x-(gx-.7))/2.0)**2-((z-(gz+.5))/.95)**2)
   rock=np.maximum(rock,seam*(.32+noise(x*.65,z*.45,71)*.22))
 # Soft eroded stream banks are soil, never granite walls.
 rock*=smooth(1.7,3.8,f['canal'])
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
 data['structures']=initial_structures
 island_shift=spec['map']['island']['x']-base['map']['island']['x'];origin_shift=(w-base['map']['width'])/2
 # Models remain available for paid construction and transport during play.
 # Starting terrain does not inherit unregistered manmade decoration batches.
 for model in data['models'].values():remap(model)
 inset=margin*res;core=h[inset:inset+d*res+1,inset:inset+w*res+1].copy()
 def sample_height(gx,gz):
  xx=float(np.clip(gx*res,0,w*res-.00001));zz=float(np.clip(gz*res,0,d*res-.00001));ix=int(xx);iz=int(zz);tx=xx-ix;tz=zz-iz
  a,b,c,dd=core[iz,ix],core[iz,ix+1],core[iz+1,ix],core[iz+1,ix+1]
  return float(a*(1-tx)+b*(tx-tz)+dd*tz if tx>=tz else a*(1-tz)+dd*tx+c*(tz-tx))
 def support(gx,gz):
  if any(r[0]<=gx<r[2] and r[1]<=gz<r[3] for r in field.bridges):return .4
  return sample_height(gx,gz)
 def context_height(gx,gz):
  xx=float(np.clip((gx+margin)*res,0,h.shape[1]-1.00001));zz=float(np.clip((gz+margin)*res,0,h.shape[0]-1.00001));ix=int(xx);iz=int(zz);tx=xx-ix;tz=zz-iz
  a,b,c,dd=h[iz,ix],h[iz,ix+1],h[iz+1,ix],h[iz+1,ix+1]
  return float(a*(1-tx)+b*(tx-tz)+dd*tz if tx>=tz else a*(1-tz)+dd*tx+c*(tz-tx))
 # Structures keep their original meshes and grid footprints; only the island moves.
 for s in data['structures']:
  s['y']=support(s['x']+w/2,s['z']+d/2)
  if 'model' in s:s['model']['position'][1]=s['y'];remap(s['model'])
 campfire=remap(copy.deepcopy(base['staticNodes'][3]));campfire['position'][0]-=origin_shift
 campfire['position'][1]=support(campfire['position'][0]+w/2,campfire['position'][2]+d/2)
 campfire.update(name='Initial village campfire',initialBuilding='campfire');data['staticNodes'].append(campfire)
 for bridge in spec['bridges']:
  x0,z0,x1,z1=bridge['rect'];geo=wooden_bridge(geometry,x1-x0,z1-z0)
  data['staticNodes'].append(node('Wooden village bridge '+bridge['name'],geo,[(x0+x1)/2-w/2,0,(z0+z1)/2-d/2],bridge=bridge['rect'],material='timber'))
 for deposit in data['deposits']:
  deposit['x']-=origin_shift
  deposit['y']=support(deposit['gx']+.5,deposit['gz']+.5)
  if deposit['kind']=='pitch':deposit['model']=node('Natural pitch seep',pitch_seep(geometry,1558+deposit['gx']),[deposit['x'],deposit['y'],deposit['z']])
  elif deposit['kind'] in ['stone','iron']:
   geo=bedrock_outcrop(geometry,deposit['kind'],spec['seed']+deposit['gx']*83+deposit['gz']*193,
                      (deposit['gx']+.5,deposit['gz']+.5),sample_height,spec['geology'])
   deposit['model']=node('Weathered '+deposit['kind']+' bedrock exposure',geo,
                         [deposit['x'],deposit['y'],deposit['z']],naturalOutcrop=True)
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
 water_array=np.asarray(water_vertices)
 wx=np.clip(np.rint((water_array[:,0]+w/2+margin)*res).astype(int),0,len(xs)-1)
 wz=np.clip(np.rint((water_array[:,2]+d/2+margin)*res).astype(int),0,len(zs)-1)
 water_array[:,10]=1-smooth(2,8,f['coast'][wz,wx])
 water_geo=geometry.add(water_array,water_indices);data['staticNodes'].insert(1,node('Tidal channels and sea',water_geo,water=True))
 # Logical cells derive from the exact render height grid, including triangle interpolation.
 cx,cz=np.meshgrid(np.arange(w)+.5,np.arange(d)+.5);cf=field.sample(cx,cz);cells=[]
 for gz in range(d):
  for gx in range(w):
   heights=core[gz*res:(gz+1)*res+1,gx*res:(gx+1)*res+1]
   hh=sample_height(gx+.5,gz+.5);sl=float(np.max(slope[inset+gz*res:inset+(gz+1)*res+1,inset+gx*res:inset+(gx+1)*res+1]));relief=float(heights.max()-heights.min())
   bridge=any(r[0]<=gx+.5<r[2] and r[1]<=gz+.5<r[3] for r in field.bridges)
   low=float(heights.min());high=float(heights.max())
   water=hh<level;walk=not water and sl<=spec['maxWalkSlope']
   ground='water' if water else 'bedrock' if sl>spec['maxWalkSlope'] else 'tidal_mud' if cf['wet'][gz,gx]>.42 else 'upland_grass'
   biome='river' if water else 'cliff' if not walk else 'road' if ground=='dirt_road' else 'paddy' if ground=='paddy' else 'wetland' if ground=='tidal_mud' else 'plains'
   if bridge:ground='bridge';biome='road';walk=True;hh=.4;relief=0;sl=0
   for name,px,pz,radius in [('limestone',21,41,4.2),('iron',22,63,4.2),('pitchBog',81,65,3.1)]:
    if math.hypot(gx+.5-px,gz+.5-pz)<radius and walk and not bridge:biome=name
   buildable=walk and not bridge and low>level+.015 and ground!='tidal_mud'
   obstacle='' if buildable or bridge or water else 'marsh' if ground=='tidal_mud' else 'bank' if low<=level+.015 else 'slope'
   c={'h':round(hh,5),'ground':ground,'biome':biome,'bridge':bridge,'walkable':bool(walk),'buildable':bool(buildable),'obstacle':obstacle,'minHeight':round(low,5),'maxHeight':round(high,5),'slope':round(sl,5),'relief':round(relief,5),'color':[round(float(v),4) for v in color[inset+gz*res+1,inset+gx*res+1]]}
   cells.append(c)
 data['cells']=cells
 # Forests have a dense interior, feathered irregular edges, and preserved lane clearances.
 print('Planting forest groups and low dressing',flush=True)
 templates=[];template_roots=[];template_species=[];template_autumn=[];seen=set()
 for tree in base['trees']:
  if tree['model'].get('geo') in seen:continue
  seen.add(tree['model'].get('geo'));templates.append(tree['model'])
  g=base['geometries'][tree['model']['geo']];v=np.frombuffer(blob,dtype='<f4',count=g['count']*12,offset=g['offset']).reshape(-1,12)
  template_roots.append(v[v[:,1]<.025,:3])
  # The preserved library contains three variants each: willow, pine, broadleaf, bamboo.
  height=float(v[:,1].max());template_species.append('willow' if height<2.1 else 'bamboo' if height>2.5 else 'broadleaf' if 2.25<height<2.4 else 'pine')
  leaves=v[v[:,10]==7,6:9];template_autumn.append(bool(len(leaves) and leaves[:,0].mean()>leaves[:,1].mean()*1.1))
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
 trees=[];tree_cells=set();tree_points=[];tree_buckets={}
 vegetation=spec['vegetation'];spacing=vegetation['minTrunkSpacing']
 candidates=rng.uniform([.4,.4],[w-.4,d-.4],(vegetation['candidateCount'],2));candidate_field=field.sample(candidates[:,0],candidates[:,1])
 for i,(xx,zz) in enumerate(candidates):
  gx,gz=int(xx),int(zz);c=cells[gz*w+gx]
  if (gx,gz) in tree_cells or (gx,gz) in protected or c['ground']=='water' or c['bridge'] or c['slope']>vegetation['maxTreeSlope'] or candidate_field['wet'][i]>.15 or candidate_field['road'][i]<1.1 or candidate_field['canal'][i]<1.45:continue
  probability=candidate_field['forest'][i]
  # Future farming clearings have irregular wooded fringes, not a categorical ban.
  if candidate_field['field'][i]>0:probability*=.14
  if rng.random()>probability*.95:continue
  nearby=[p for bx in range(gx-1,gx+2) for bz in range(gz-1,gz+2) for p in tree_buckets.get((bx,bz),[])]
  if any((xx-a)**2+(zz-b)**2<spacing**2 for a,b in nearby):continue
  weights=[]
  for template_index,species in enumerate(template_species):
   weight={'pine':.65,'broadleaf':1.8,'bamboo':.8,'willow':.08}[species]
   if c['h']>2 or c['slope']>.35:weight={'pine':2.2,'broadleaf':1.0,'bamboo':.12,'willow':0}[species]
   elif candidate_field['canal'][i]<5:weight={'pine':.1,'broadleaf':1.1,'bamboo':1.0,'willow':2.2}[species]
   if template_autumn[template_index]:weight*=vegetation['autumnVariantWeight']
   weights.append(weight)
  weights=np.array(weights);idx=int(rng.choice(len(templates),p=weights/weights.sum()))
  scale=float(rng.uniform(.88,1.2));angle=float(rng.uniform(0,math.tau));co=math.cos(angle);si=math.sin(angle)
  roots=template_roots[idx]*scale;root_x=xx+roots[:,0]*co+roots[:,2]*si;root_z=zz-roots[:,0]*si+roots[:,2]*co
  supports=np.array([support(a,b) for a,b in zip(root_x,root_z)])
  # Reject exposed ledges and seat the actual visible root ring into its soil.
  if np.ptp(supports)>.23 or supports.min()<level+.035:continue
  model=remap(copy.deepcopy(templates[idx]));base_y=float(supports.min())-.02
  model['position']=[float(xx-w/2),base_y,float(zz-d/2)];model['quaternion']=[0,math.sin(angle/2),0,math.cos(angle/2)];model['scale']=[scale]*3
  trees.append({'gx':gx,'gz':gz,'x':float(xx-w/2),'z':float(zz-d/2),'wood':40,'species':template_species[idx],'model':model});tree_cells.add((gx,gz));tree_points.append((xx,zz));tree_buckets.setdefault((gx,gz),[]).append((xx,zz))
 if not any(math.hypot(t['gx']-45,t['gz']-38)<9 for t in trees):
  for gx,gz in [(42,33),(45,32),(48,33)]:
   if cells[gz*w+gx]['walkable'] and (gx,gz) not in protected and (gx,gz) not in tree_cells:
    model=remap(copy.deepcopy(templates[0]));model['position']=[gx+.43-w/2,support(gx+.43,gz+.62)-.025,gz+.62-d/2]
    trees.append({'gx':gx,'gz':gz,'x':gx+.43-w/2,'z':gz+.62-d/2,'wood':40,'model':model})
 data['trees']=trees
 # Continue the same woodland beyond the playable boundary. These inaccessible
 # backdrop trees have no resource state and are culled in small spatial batches.
 backdrop={};back_rng=np.random.default_rng(spec['seed']+2903);back_cells=set();back_buckets={}
 points=back_rng.uniform([-margin+.5,-margin+.5],[w+margin-.5,d+margin-.5],(vegetation['backdropCandidateCount'],2))
 points=points[(points[:,0]<0)|(points[:,0]>=w)|(points[:,1]<0)|(points[:,1]>=d)]
 bf=field.sample(points[:,0],points[:,1])
 for i,(xx,zz) in enumerate(points):
  gx,gz=int(math.floor(xx)),int(math.floor(zz));ix=int((xx+margin)*res);iz=int((zz+margin)*res);sl=float(slope[iz,ix])
  if (gx,gz) in back_cells or bf['water'][i] or bf['wet'][i]>.15 or sl>vegetation['maxTreeSlope'] or bf['canal'][i]<1.45 or back_rng.random()>bf['forest'][i]*.95:continue
  near=[p for bx in range(gx-1,gx+2) for bz in range(gz-1,gz+2) for p in back_buckets.get((bx,bz),[])+tree_buckets.get((bx,bz),[])]
  if any((xx-a)**2+(zz-b)**2<spacing**2 for a,b in near):continue
  species='pine' if bf['height'][i]>2 or sl>.35 else 'willow' if bf['canal'][i]<5 else 'broadleaf'
  choices=[j for j,kind in enumerate(template_species) if kind==species and not template_autumn[j]]
  idx=int(back_rng.choice(choices));scale=float(back_rng.uniform(.88,1.2));angle=float(back_rng.uniform(0,math.tau));co=math.cos(angle);si=math.sin(angle)
  roots=template_roots[idx]*scale;root_x=xx+roots[:,0]*co+roots[:,2]*si;root_z=zz-roots[:,0]*si+roots[:,2]*co
  supports=np.array([context_height(a,b) for a,b in zip(root_x,root_z)])
  if np.ptp(supports)>.23 or supports.min()<level+.035:continue
  geo=remap(copy.deepcopy(templates[idx]))['geo'];key=(geo,gx//24,gz//24)
  matrix=[co*scale,0,-si*scale,0,0,scale,0,0,si*scale,0,co*scale,0,float(xx-w/2),float(supports.min())-.02,float(zz-d/2),1]
  backdrop.setdefault(key,[]).append({'matrix':matrix,'color':[1,1,1]});back_cells.add((gx,gz));back_buckets.setdefault((gx,gz),[]).append((xx,zz))
 for (geo,cx,cz),instances in backdrop.items():data['staticNodes'].append(node('Backdrop woodland %d %d %d'%(geo,cx,cz),geo,instances=instances,naturalWoodland=True))
 # Ground cover is scattered in continuous coordinates. Terrain wetness and
 # broad patch noise drive density; no five-tufts-per-grid-cell stencil.
 def blades(reed=False):
  vv=[];ii=[]
  for i in range(7 if reed else 5):
   angle=i*2.399;xx=math.cos(angle)*.16;zz=math.sin(angle)*.16;height=.38+i*.045 if reed else .12+i*.026;width=.035 if reed else .06
   tint=[.16,.235,.09] if not reed else [.24,.28,.12]
   start=len(vv)
   for p in [[xx-width,0,zz],[xx+width,0,zz],[xx+.04,height,zz+.025]]:vv.append([*p,0,1,0,*tint,1,0,0])
   ii.extend([start,start+2,start+1])
  return geometry.add(vv,ii)
 grass_geo=blades();reed_geo=blades(True);dress={'grass':[],'reeds':[]}
 points=rng.uniform([.3,.3],[w-.3,d-.3],(40000,2));pf=field.sample(points[:,0],points[:,1]);patch=noise(points[:,0]*.38,points[:,1]*.38,903)
 for i,(xx,zz) in enumerate(points):
  gx,gz=int(xx),int(zz);c=cells[gz*w+gx]
  if c['bridge'] or (gx,gz) in protected or not c['walkable'] or pf['water'][i] or c['slope']>.45:continue
  reed=pf['wet'][i]>.1 and pf['coast'][i]<4 or 0<pf['canal'][i]<1.4
  probability=(.25+patch[i]*.65) if reed else .1*pf['forest'][i]+.016
  if rng.random()>probability or patch[i]<.25:continue
  scale=float(rng.uniform(.65,1.25));angle=float(rng.uniform(0,math.tau));co=math.cos(angle)*scale;si=math.sin(angle)*scale
  # Lowest visible blade roots sample multiple positions to avoid levitation.
  base_y=min(support(xx,zz),support(xx-.18,zz),support(xx+.18,zz),support(xx,zz-.18),support(xx,zz+.18))-.015
  matrix=[co,0,-si,0,0,scale,0,0,si,0,co,0,float(xx-w/2),base_y,float(zz-d/2),1]
  dress['reeds' if reed else 'grass'].append({'matrix':matrix,'color':[1,1,1]})
 for key,geo in [('grass',grass_geo),('reeds',reed_geo)]:data['staticNodes'].append(node('Batched '+key,geo,instances=dress[key],naturalCover=True))
 data['terrain']={'version':2,'resolution':res,'width':w*res+1,'depth':d*res+1,'heights':[round(float(v),5) for v in core.ravel()], 'waterLevel':level,'maxWalkSlope':spec['maxWalkSlope'],'maxBuildRelief':spec['maxBuildRelief'],'specSha256':sha(SPEC),'heightMinimum':float(core.min()),'heightMaximum':float(core.max()),'landscapeRevision':spec['landscapeRevision'],'restrictionModel':'visible surface: water intersection, slope, wet soil'}
 data['geometries']=geometry.items;data['geometryCount']=len(geometry.items);data['map']['camera']['home']=[46,47]
 data['map']['terrainMarkers']=[{'name':'大罗山麓','cell':[13,48]},{'name':'永昌村落','cell':[43,43]},{'name':'渠田平原','cell':[49,68]},{'name':'滨海湿地','cell':[91,75]},{'name':'黑鲨岛寨（虚构）','cell':spec['map']['enemyKeep']}]
 # Compact away the unused old terrain/flora geometry. Asset model vertices are copied exactly.
 (OUT/'world.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 (OUT/'geometry.bin.z').write_bytes(zlib.compress(geometry.bytes,9))
 source_files=[SPEC,Path(__file__),ROOT/'scripts/terrain_field.py',ROOT/'scripts/fortress_layout.py',ROOT/'scripts/natural_scenery.py',LIB/'world.json',LIB/'geometry.bin.z']
 receipt={'schema':2,'sources':{p.relative_to(ROOT).as_posix():sha(p) for p in source_files},'outputs':{name:sha(OUT/name) for name in ['world.json','geometry.bin.z']},'geometryBytes':len(geometry.bytes),'triangles':sum(g['indexCount']//3 for g in geometry.items),'trees':len(trees),'backdropTrees':len(back_cells),'dressing':{k:len(v) for k,v in dress.items()},'cells':dict(Counter(c['ground'] for c in cells)),'history':spec['history']}
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
