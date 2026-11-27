"""Export original Three.js model resources into content/model-library.

Requires the legacy reference served at --url and Playwright/Edge. Geometry is
copied from real constructors, not approximated with replacement primitives.
Run build-terrain.py afterward to compile the authored map into the common game.
"""
import argparse,base64,hashlib,json,struct,zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8766/')
p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe')
a=p.parse_args();root=Path(__file__).resolve().parent.parent;out=root/'content'/'model-library';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=a.browser,headless=True);page=b.new_page()
 page.goto(a.url,wait_until='load');page.wait_for_function('window.game&&game.world',timeout=60000)
 result=page.evaluate('''async()=>{
  game.timeScale=0;game.animate=()=>{};
  const T=await import('three'),P=(await import('/src/voxelPrefabs.js')).prefabs;
  const E=await import('/src/entities.js'),H=await import('/src/raiderHarbor.js');
  const M=await import('/src/yongchangMap.js'),B=await import('/src/mapAndBuild.js'),G=await import('/src/main.js');
  const w=game.world;window.exportGeometries=[];const ids=new Map();
  function geo(g){if(!ids.has(g)){ids.set(g,exportGeometries.length);exportGeometries.push(g);}return ids.get(g);}
  function node(o){
   const r={name:o.name||o.type,position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),visible:o.visible,children:[]};
   const included=n=>n.children.filter(c=>!c.isLight&&!c.isSprite&&!c.isPoints&&!c.isLine);
   const pathTo=(target)=>{const path=[];let n=target;while(n&&n!==o){const p=n.parent;if(!p)return null;const i=included(p).indexOf(n);if(i<0)return null;path.unshift(i);n=p;}return n===o?path:null;};
   for(const [key,val] of Object.entries(o.userData||{})){
    if(val?.isObject3D){const path=pathTo(val);if(path){r.links??={};r.links[key]=path;}}
    else if(Array.isArray(val)&&val.length&&val.every(v=>v?.isObject3D)){r.linkArrays??={};r.linkArrays[key]=val.map(pathTo);}
   }
   if(o.isMesh){r.geo=geo(o.geometry);const mat=o.material;r.water=!!o.geometry.attributes.aShore;
    r.emissive=!!mat.isMeshBasicMaterial;r.tint=mat.color?.toArray()||[1,1,1];r.opacity=mat.opacity??1;r.doubleSided=mat.side===T.DoubleSide;
    if(o.isInstancedMesh){r.instances=[];const x=new T.Matrix4(),c=new T.Color();for(let i=0;i<o.count;i++){o.getMatrixAt(i,x);o.getColorAt(i,c);r.instances.push({matrix:x.toArray(),color:c.toArray()});}}
   }
   for(const child of o.children)if(!child.isLight&&!child.isSprite&&!child.isPoints&&!child.isLine)r.children.push(node(child));
   return r;
  }
  const assigned=new Set(),structures=w.structures.map(s=>{
   assigned.add(s.mesh);return {type:s.type,label:s.label||s.type,team:s.team,x:s.x,y:s.y,z:s.z,gx:s.gx,gz:s.gz,hp:s.maxHp,height:s.height,
    cells:s.cells.map(c=>[c.gx,c.gz]),half:w.getStructureHalfExtents(s),custom:!!s.customAppearance,model:node(s.mesh)};
  });
  const trees=w.trees.map(t=>{assigned.add(t.mesh);return {gx:t.gx,gz:t.gz,x:t.x,z:t.z,wood:t.woodLeft,model:node(t.mesh)};});
  const deposits=[...w.stoneNodes,...w.ironNodes,...w.pitchNodes].map(t=>{if(t.mesh)assigned.add(t.mesh);return {gx:t.gx,gz:t.gz,x:t.x,z:t.z,kind:t.kind||w.getCell(t.gx,t.gz).ground,model:t.mesh?node(t.mesh):null};});
  const banned=new Set([...game.units.map(u=>u.mesh),...game.squads.map(s=>s.banner),...game.campfirePeasantMeshes,
    game.playerLord.crownMarker,game.enemyLord.crownMarker,game.dragLine,w.ghostGroup,w.biomeHintGroup,w.stockpileVisuals,w.armoryVisuals,w.granaryVisuals]);
  // Capture only the world's own roots: terrain, water, piers, flora and moored boats.
  const staticNodes=[];
  for(const o of game.scene.children){if(assigned.has(o)||banned.has(o)||o.isLight||o.isCamera||!o.visible)continue;
    if(o.isMesh||o.isGroup){const n=node(o);if(n.geo!==undefined||n.children.length)staticNodes.push(n);}}
  const models={};
  for(const team of ['player','enemy']){
   for(const key of ['keep','hovel','gate','tower','ballista','farm','woodcutter','quarry','oxPost','ironMine','pitchRig','fletcher','blacksmith','granary','armory','stockpile','campfire'])models[team+'_'+key]=node(P.instantiate(key,team));
   for(let mask=0;mask<16;mask++)models[team+'_wall_'+mask]=node(P.instantiateWall(team,mask,0,0));
   for(const role of ['lord','peasant','spearman','archer','swordsman','knight'])models[team+'_unit_'+role]=node(E.createVoxelHumanoid(role,team));
   for(const role of ['ram','trebuchet'])models[team+'_unit_'+role]=node(E.createSiegeEngine(role,team));
   models[team+'_boat']=node(H.createHarborBoat(team,false));models[team+'_boat_large']=node(H.createHarborBoat(team,true));
  }
  models.ox=node(E.createQuarryOxCart());
  for(const kind of ['sickle','axe','pickaxe','ladle','saw','hammer'])models['tool_'+kind]=node(E.createWorkerTool(kind));
  for(const kind of ['wood','stone','food','iron','oil','bow','armor','log','ore','wheat'])models['cargo_'+kind]=node(P.instantiateCargoItem(kind));
  const cells=[];for(let z=0;z<M.YONGCHANG_MAP.height;z++)for(let x=0;x<M.YONGCHANG_MAP.width;x++){
   const c=w.getCell(x,z);cells.push({h:c.elev,ground:c.ground,biome:c.biome,bridge:!!c.isBridge});}
  return {schema:1,map:M.YONGCHANG_MAP,buildings:B.BUILDINGS,units:G.UNIT_SPECS,initial_resources:{wood:92,stone:85,food:70,iron:18,oil:16,gold:210,bows:6,armor:4,peasants:8,maxPop:28},
    structures,trees,deposits,staticNodes,models,cells,geometryCount:exportGeometries.length};
 }''')
 blob=bytearray();geometries=[]
 for i in range(result['geometryCount']):
  geo=page.evaluate('''i=>{
    const g=exportGeometries[i],p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color,m=g.attributes.aMatId,s=g.attributes.aShore;
    const count=p.count,indices=g.index?Array.from(g.index.array):Array.from({length:count},(_,i)=>i);
    // Godot's front-face winding is clockwise; Three.js uses counterclockwise.
    for(let j=0;j<indices.length;j+=3)[indices[j+1],indices[j+2]]=[indices[j+2],indices[j+1]];
    const f=new Float32Array(count*12);for(let j=0;j<count;j++)f.set([p.getX(j),p.getY(j),p.getZ(j),n?.getX(j)??0,n?.getY(j)??1,n?.getZ(j)??0,c?.getX(j)??1,c?.getY(j)??1,c?.getZ(j)??1,1,m?.getX(j)||0,s?.getX(j)||0],j*12);
    const bytes=new Uint8Array(f.buffer),ib=new Uint8Array(new Uint32Array(indices).buffer);
    const encode=a=>{let text='';for(let x=0;x<a.length;x+=16384)text+=String.fromCharCode(...a.subarray(x,x+16384));return btoa(text);};
    return {count,indexCount:indices.length,vertices:encode(bytes),indices:encode(ib)};
  }''',i)
  v=base64.b64decode(geo.pop('vertices'));idx=base64.b64decode(geo.pop('indices'))
  geo['offset']=len(blob);blob.extend(v);blob.extend(idx);geometries.append(geo)
  if i%60==0:print('geometry',i,'/',result['geometryCount'],'bytes',len(blob),flush=True)
 result['geometries']=geometries
 for r in result['models'].values():r['visible']=True
 (out/'geometry.bin.z').write_bytes(zlib.compress(blob,9))
 (out/'world.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 receipt={'geometryBytes':len(blob),'geometryCount':len(geometries),'models':len(result['models']),'structures':len(result['structures']),
          'sources':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'src').glob('*.js')}}
 (out/'migration.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');b.close();print(json.dumps(receipt)[:300])
