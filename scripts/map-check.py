"""Run the historical map through the actual browser/game, including navigation."""
import argparse
import json
import hashlib
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--browser',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--url',default='http://127.0.0.1:8765/')
args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.browser,headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
    errors=[]
    sources=[]
    page.on('response',lambda r:sources.append(r) if '/src/' in r.url or urlparse(r.url).path=='/' else None)
    def error(message):
        errors.append(message);print(message,flush=True)
    page.on('pageerror',lambda e:error(str(e)))
    page.on('console',lambda m:error(m.text) if m.type=='error' else None)
    page.goto(args.url,wait_until='load')
    page.wait_for_function('window.game && window.game.world.villageDwellings',timeout=60000)
    box=page.locator('#btn-title-enter').bounding_box()
    page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
    page.locator('#btn-menu-start').click()
    page.wait_for_timeout(1200)
    page.screenshot(path=str(out/'map-home.png'))
    frame_times=page.evaluate('''()=>new Promise(resolve=>{
      const values=[];let previous;function tick(now){if(previous!==undefined)values.push(now-previous);previous=now;
      if(values.length<90)requestAnimationFrame(tick);else{values.sort((a,b)=>a-b);resolve({median:values[45],p95:values[85],frames:90});}}
      requestAnimationFrame(tick);
    })''')
    page.evaluate('game.timeScale=0')
    page.keyboard.press('t')
    scout=page.locator('#taunt-banner').inner_text()
    assert '向海东路' in scout and '通市北路' in scout,scout
    page.keyboard.press('m')
    page.wait_for_timeout(700)
    page.screenshot(path=str(out/'map-overview.png'))
    report=page.evaluate('''async () => {
      const {YONGCHANG_MAP:m, MAP_BRIDGES,insideFort} = await import('/src/yongchangMap.js');
      const w=game.world, toWorld=(x,z)=>({x:x-m.width/2+.5,z:z-m.height/2+.5});
      const route=(name,from,to,large=true,team='player',peaceful=true)=> {
        const a=toWorld(...from),b=toWorld(...to);
        const path=game.pathfinder.findPathWorld(w,a.x,a.z,b.x,b.z,team,{isLarge:large,peaceful});
        const last=path.at(-1), error=last?Math.hypot(last.x-b.x,last.z-b.z):999;
        return {name,reached:error<0.65,error,points:path.length,path};
      };
      const routes=m.gates.map(g=>route(g.name+' direction (unbuilt)',m.campfire,g.outside));
      routes.push(route('west-quarry-cart',[22,42],[46,40]),
        route('west-iron-supply',[23,64],[49,42],false),
        route('east-attack',m.attacks.east,m.campfire,false,'enemy',false),
        route('north-attack',m.attacks.north,m.campfire,false,'enemy',false),
        route('south-paddies',m.campfire,[49,69]));
      for(const [i,b] of MAP_BRIDGES.entries()) {
        const [x0,z0,x1,z1]=b.rect;
        const from=b.axis==='x'?[x0-1,z0]:[x0,z0-1];
        const to=b.axis==='x'?[x1,z0]:[x0,z1];
        routes.push(route('bridge-'+i,from,to));
      }
      const water=w.cells[37][44];
      const {evaluateStepCost}=await import('/src/flowField.js');
      const blockedWater=evaluateStepCost(w,36,44,37,44,1,'player',{peaceful:true})<0;
      const count=type=>w.structures.filter(s=>s.team==='player' && s.type===type && s.hp>0).length;
      const traversals=[];
      for(const [i,b] of MAP_BRIDGES.entries()) for(const isOx of [false,true]) for(const reverse of [false,true]) {
        const [x0,z0,x1,z1]=b.rect;
        let from={x:x0-1-m.width/2,z:(z0+z1)/2-m.height/2};
        let to={x:x1+1-m.width/2,z:from.z};
        if(reverse)[from,to]=[to,from];
        game.spawnWorkerForStructure(w.playerKeep,isOx,false);
        const unit=game.workers.pop(); Object.assign(unit,from,{y:.4});
        let steps=0,waterSteps=0;
        for(;steps<600 && Math.hypot(unit.x-to.x,unit.z-to.z)>.49;steps++) {
          game.moveWorkerTowards(unit,to.x,to.z,isOx?2.05:2.85,1/30);
          w.projectOutOfObstacles(unit,game.getEntityRadius(unit),'player');
          const c=w.getCell(Math.floor(unit.x+m.width/2),Math.floor(unit.z+m.height/2));
          if(c.ground==='water'&&!c.isBridge)waterSteps++;
        }
        const error=Math.hypot(unit.x-to.x,unit.z-to.z);
        traversals.push({bridge:i,isOx,reverse,reached:error<.55,error,waterSteps,seconds:steps/30});
        game.scene.remove(unit.mesh);
      }
      return {size:[m.width,m.height],ratio:(m.fort.south-m.fort.north)/(m.fort.east-m.fort.west),
        defences:w.structures.filter(s=>s.team==='player'&&['wall','gate','tower','ballista'].includes(s.type)).length,
        production:w.structures.filter(s=>s.team==='player'&&['farm','woodcutter','quarry','ironMine','pitchRig','fletcher','blacksmith'].includes(s.type)).length,
        starterRewardsLocked:!game.clanSteleWallsUnlocked&&!game.fortressPaddyUnlocked,
        bridges:w.bridges.length,towers:count('tower'),houses:count('dwelling'),
        fields:m.fields.length,trees:w.trees.length,structures:w.structures.length,
        blockedWater,routes,traversals,navAudit:game.runNavAudit(),
        farmBuildable:w.cells.flat().filter(c=>insideFort(c.gx,c.gz)&&w.canPlace('farm',c.gx,c.gz)).length,
        errors:[],glError:game.renderer.getContext().getError()};
    }''')
    report['frameTimes']=frame_times
    report['scout']=scout
    print(json.dumps({k:v for k,v in report.items() if k not in ('routes','traversals')},ensure_ascii=True),flush=True)
    print(json.dumps([{k:v for k,v in r.items() if k!='path'} for r in report['routes']],ensure_ascii=True),flush=True)
    # Named detail cameras; the overview above is reached with the real M key.
    for name,x,z,zoom in [('approach',66,49,20),('canals',46,32,28),('fields',46,66,27),('coast',96,49,28)]:
        page.evaluate('''async([x,z,zoom])=>{const {YONGCHANG_MAP:m}=await import('/src/yongchangMap.js');game.camDesiredTarget.set(x-m.width/2+.5,.4,z-m.height/2+.5);game.frustumSize=zoom;game.updateOrthoProjection();}''',[x,z,zoom])
        page.wait_for_timeout(450)
        page.screenshot(path=str(out/f'map-{name}.png'))
    # Use the real card, pointer and ground raycast to build the first farm.
    page.evaluate('''()=>{game.camDesiredTarget.set(game.world.campfirePos.x-2,.4,game.world.campfirePos.z+2);game.frustumSize=26;game.updateOrthoProjection();}''')
    page.wait_for_timeout(450)
    before_build=page.evaluate('({wood:game.res.wood,food:game.res.food,peasants:game.res.peasants})')
    page.locator('#stamp-build').click()
    page.locator('[data-cat="econ"]').click()
    page.locator('.game-card-3d[data-id="farm"]').click()
    target=page.evaluate('''async()=>{const {YONGCHANG_MAP:m}=await import('/src/yongchangMap.js');const p=game.projVec.set(48.5-m.width/2,.4,53.5-m.height/2).project(game.camera);
      return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};}''')
    page.mouse.click(target['x'],target['y'])
    built=page.evaluate('''()=>{const c=game.world.getCell(48,53);return {
      type:c.structure?.type,wood:game.res.wood,workers:game.workers.length};}''')
    assert built['type']=='farm' and before_build['wood']-built['wood']==10,built
    page.keyboard.press('Escape')
    # A focused, accelerated simulation uses the existing recruitment, work,
    # delivery and collision functions. It does not grant production directly.
    report['economy']=page.evaluate('''()=> {
      const g=game, initial={food:g.res.food,wood:g.res.wood,peasants:g.res.peasants};
      g.commitBuild('woodcutter',[{gx:40,gz:44}]);
      const afterWood=g.res.wood;
      const farm=g.world.getCell(48,53).structure;
      const woodcut=g.world.getCell(40,44).structure;
      for(let i=0;i<2400;i++) {g.rebuildSpatialAndCrowdGrids();g.updateWorkers(1/30);}
      const result={farm:!!farm,woodcutter:woodcut?.type==='woodcutter',woodCost:initial.wood-afterWood,
        recruited:initial.peasants-g.res.peasants,foodDelivered:g.res.food-initial.food,
        woodDelivered:g.res.wood-afterWood,workers:g.workers.map(w=>({job:w.job,state:w.state,x:w.x,z:w.z}))};
      const oldWood=g.res.wood,oldStone=g.res.stone,count=g.world.structures.length;
      g.commitBuild('farm',[{gx:37,gz:44}]);
      result.waterBuildRejected=g.res.wood===oldWood&&g.res.stone===oldStone&&g.world.structures.length===count;
      // Build a small defence along the eastern approach using actual prices.
      g.buildRotSteps=0;
      const cells=[];for(let z=45;z<=52;z++)cells.push({gx:58,gz:z});
      g.commitBuild('wall',cells);g.commitBuild('gate',[{gx:58,gz:48}]);
      const gate=g.world.getCell(58,48).structure;
      result.gateBuilt=gate?.type==='gate'&&gate.gateAxis==='ns'&&gate.cells.length===2;
      result.defenceStoneSpent=oldStone-g.res.stone;
      result.rewardsStillLocked=!g.clanSteleWallsUnlocked&&!g.fortressPaddyUnlocked;
      g.updateHUD();return result;
    }''')
    page.wait_for_timeout(300)
    page.screenshot(path=str(out/'map-first-builds.png'))
    print(json.dumps({'economy':report['economy']},ensure_ascii=True),flush=True)
    assert report['economy']['farm'] and report['economy']['woodcutter'],report['economy']
    assert report['economy']['woodCost']==6 and report['economy']['recruited']==2,report['economy']
    assert report['economy']['foodDelivered']>0 and report['economy']['woodDelivered']>0,report['economy']
    assert report['economy']['waterBuildRejected'] and report['economy']['gateBuilt'],report['economy']
    assert report['economy']['rewardsStillLocked'],report['economy']
    report['resources']=page.evaluate('''()=>{
      const g=game,w=g.world, initial={stone:g.res.stone,iron:g.res.iron,oil:g.res.oil};
      const jobs=[['quarry',w.stoneNodes[0]],['ironMine',w.ironNodes[0]],['pitchRig',w.pitchNodes[0]]];
      const built=[];
      for(const [type,node] of jobs){
        let placed=null;
        for(let radius=1;radius<=3&&!placed;radius++)for(let dx=-radius;dx<=radius&&!placed;dx++)for(let dz=-radius;dz<=radius&&!placed;dz++){
          const gx=node.gx+dx,gz=node.gz+dz;
          if(w.canPlace(type,gx,gz)){g.commitBuild(type,[{gx,gz}]);placed=w.getCell(gx,gz).structure;}
        }
        built.push({type,built:placed?.type===type,gx:placed?.gx,gz:placed?.gz});
      }
      const before=g.res.stone;
      for(let i=0;i<5400;i++){g.rebuildSpatialAndCrowdGrids();g.updateWorkers(1/30);}
      return {built,stoneDelivered:g.res.stone-before,ironDelivered:g.res.iron-initial.iron,oilDelivered:g.res.oil-initial.oil,
        workers:g.workers.filter(u=>['quarry','ironMine','pitchRig'].includes(u.job)).map(u=>({job:u.job,isOx:u.isOx,state:u.state,x:u.x,z:u.z}))};
    }''')
    print(json.dumps({'resources':report['resources']},ensure_ascii=True),flush=True)
    assert all(item['built'] for item in report['resources']['built']),report['resources']
    assert all(report['resources'][key]>0 for key in ['stoneDelivered','ironDelivered','oilDelivered']),report['resources']
    # Check the minimap with a real pointer event, and expanded camera bounds.
    box=page.locator('#historic-map-canvas').bounding_box()
    page.mouse.click(box['x']+box['width']*.85,box['y']+box['height']*.5)
    page.wait_for_timeout(400)
    assert page.evaluate('game.camDesiredTarget.x')>35
    page.keyboard.press('Escape')
    assert page.evaluate('game.menuState')=='pause'
    page.keyboard.press('Escape')
    assert page.evaluate('game.menuState')=='play'
    report['inputs']=['build card and ground click','minimap pan','overview M','pause','resume']
    # A live wave must spawn on the new eastern and northern approaches.
    page.evaluate('game.phaseTimer=.01;game.timeScale=1')
    page.wait_for_function('game.isNight && game.units.filter(u=>u.team==="enemy").length>15',timeout=15000)
    page.evaluate('game.timeScale=0')
    report['nightWave']=page.evaluate('({night:game.isNight,enemies:game.units.filter(u=>u.team==="enemy").length})')
    page.evaluate('''()=>{game.camDesiredTarget.set(game.world.campfirePos.x-2,.4,game.world.campfirePos.z+2);game.frustumSize=26;game.updateOrthoProjection();}''')
    page.wait_for_timeout(1800)
    page.screenshot(path=str(out/'map-night.png'))
    page.set_viewport_size({'width':1100,'height':700})
    page.wait_for_timeout(350)
    page.screenshot(path=str(out/'map-compact.png'))
    report['glError']=page.evaluate('game.renderer.getContext().getError()')
    report['sourceHashes']={}
    report['sourceMismatches']=[]
    root=Path(__file__).resolve().parent.parent
    for r in sources:
        rel=unquote(urlparse(r.url).path).lstrip('/') or 'index.html'
        body=r.body()
        report['sourceHashes'][rel]=hashlib.sha256(body).hexdigest()
        if body!=(root/rel).read_bytes():report['sourceMismatches'].append(rel)
    report['errors']=errors
    (out/'map-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    browser.close()
    if errors or report['glError'] or not report['blockedWater'] or not all(r['reached'] for r in report['routes']) or report['defences'] or report['production'] or not report['starterRewardsLocked'] or report['houses'] != 4 or report['sourceMismatches'] or not all(t['reached'] and t['waterSteps']==0 for t in report['traversals']):
        raise SystemExit(1)
