"""Read the live harbour, transport, combat and village state through Edge."""
import argparse,json,hashlib
from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--browser',required=True);p.add_argument('--output',required=True)
p.add_argument('--url',default='http://127.0.0.1:8765/')
p.add_argument('--simulate',action='store_true');args=p.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=args.browser,headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
    errors=[];sources=[]
    def error(e):
        errors.append(str(e));print(str(e),flush=True)
    page.on('pageerror',error);page.on('console',lambda m:error(m.text) if m.type=='error' else None)
    page.on('response',lambda r:sources.append(r) if '/src/' in r.url or urlparse(r.url).path=='/' else None)
    page.goto(args.url,wait_until='load')
    page.wait_for_function('window.game && game.seaRaids',timeout=60000)
    b=page.locator('#btn-title-enter').bounding_box();page.mouse.click(b['x']+b['width']/2,b['y']+b['height']/2)
    page.locator('#btn-menu-start').click();page.wait_for_timeout(1000)
    page.evaluate('game.timeScale=0')
    page.screenshot(path=str(out/'island-village-start.png'))
    report=page.evaluate('''async()=>{
      const {YONGCHANG_MAP:m}=await import('/src/yongchangMap.js');
      const w=game.world;
      const count=(team,types)=>w.structures.filter(s=>s.team===team&&types.includes(s.type)).length;
      const {evaluateStepCost}=await import('/src/flowField.js');
      const seen=new Set(),queue=[[96,49]];seen.add('96,49');
      for(let i=0;i<queue.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const [x,z]=queue[i],nx=x+dx,nz=z+dz,key=nx+','+nz;
        if(!seen.has(key)&&evaluateStepCost(w,x,z,nx,nz,1,'player',{peaceful:false})>=0){seen.add(key);queue.push([nx,nz]);}
      }
      return {size:[m.width,m.height],defences:count('player',['wall','gate','tower','ballista']),
        production:count('player',['farm','woodcutter','quarry','ironMine','pitchRig','fletcher','blacksmith']),
        houses:count('player',['dwelling']),islandIsolated:!seen.has('127,50'),
        harbourInventory:w.harborInventory,mooredBoats:w.harborBoats.length,
        core:w.enemyKeep.label,sourceMismatches:[],errors:[]};
    }''')
    print(json.dumps({k:v for k,v in report.items() if k!='harbourInventory'},ensure_ascii=True),flush=True)
    for name,gx,gz,zoom in [('island',128,49,37),('harbour',119,50,25),('channel',108,49,33),('yard',129,56,20)]:
        page.evaluate('''async([x,z,zoom])=>{const {YONGCHANG_MAP:m}=await import('/src/yongchangMap.js');
          game.camDesiredTarget.set(x-m.width/2,.4,z-m.height/2);game.frustumSize=zoom;game.updateOrthoProjection();}''',[gx,gz,zoom])
        page.wait_for_timeout(600);page.screenshot(path=str(out/f'{name}.png'))
    page.keyboard.press('m');page.wait_for_timeout(600);page.screenshot(path=str(out/'island-overview.png'))
    if args.simulate:
        # Real attack input; staged squads are created at the village, not on the island.
        page.evaluate('''()=>{
          const g=game,p=g.world.campfirePos;
          window.islandAttackSquad=g.createSquad('spearman','player',p.x+2,p.z,true);
          window.islandRamSquad=g.createSquad('ram','player',p.x+3,p.z+2,true);
          window.expectedLandingCount=islandAttackSquad.members.length+islandRamSquad.members.length;
          window.attackStartedAt=g.seaRaids.clock;
        }''')
        page.locator('#btn-stance-wheel').click();page.locator('#btn-stance-wheel').click()
        assert page.evaluate('game.stance')=='attack'
        transport_seen=False
        for stage in range(35):
            state=page.evaluate('''()=>{
              for(let i=0;i<60;i++){game.rebuildSpatialAndCrowdGrids();game.updateCombat(1/30);}
              return {stats:{...game.seaRaids.stats},trips:game.seaRaids.trips.map(t=>({team:t.team,phase:t.phase})),
                units:islandAttackSquad.members.map(u=>({hp:u.hp,x:u.x,z:u.z,transit:u.seaTransit})),
                ram:islandRamSquad.members.map(u=>({hp:u.hp,x:u.x,z:u.z,transit:u.seaTransit})),
                expected:expectedLandingCount,gate:game.world.getCell(123,49).structure?.hp??0,core:game.world.enemyKeep.hp};
            }''')
            if any(t['team']=='player' and t['phase']=='sailing' for t in state['trips']) and not transport_seen:
                page.evaluate('''()=>{game.camDesiredTarget.set(27,.4,2);game.frustumSize=27;game.updateOrthoProjection();}''')
                page.wait_for_timeout(400);page.screenshot(path=str(out/'player-crossing.png'));transport_seen=True
            if state['stats']['playerLanded']==state['expected'] and state['gate']<220:
                break
        report['playerAttack']=state;report['playerAttack']['transportSeen']=transport_seen
        print(json.dumps({'playerAttack':state},ensure_ascii=True),flush=True)
        assert state['stats']['playerLanded']==state['expected'],state
        assert state['gate']<220,state
        page.evaluate('''()=>{game.camDesiredTarget.set(47,.4,1);game.frustumSize=24;game.updateOrthoProjection();}''')
        page.wait_for_timeout(350);page.screenshot(path=str(out/'island-assault.png'))
        # The lord's manual order must cross and return through the same boats.
        # Probe only movement here so tower damage cannot mask transport failures.
        report['lordCrossing']=page.evaluate('''()=>{
          const g=game,lord=g.playerLord;
          const move=(target)=>{
            lord.orderTarget={...target};lord.seaApproach=null;lord.waypoints=null;
            for(let i=0;i<4200;i++){
              g.seaRaids.update(1/30);
              if(!lord.seaTransit){
                if(!g.seaRaids.moveToPort(lord,1/30,1)){
                  const nav=g.computeAgentDirection(lord,target.x,target.z,.36,1/30,{});
                  if(nav.arrived)return true;
                  g.stepUnitSmart(lord,nav.dx,nav.dz,1/30,1);
                }
                g.world.projectOutOfObstacles(lord,g.getEntityRadius(lord),'player');
              }
            }
            return false;
          };
          const outbound=move({x:40.5,z:1.5});
          const inbound=move({x:18.5,z:1.5});
          return {outbound,inbound,x:lord.x,z:lord.z,transit:lord.seaTransit};
        }''')
        assert report['lordCrossing']['outbound'] and report['lordCrossing']['inbound'],report['lordCrossing']
        report['simulation']=page.evaluate('''()=>{
          const g=game,ship=g.seaRaids,w=g.world;
          g.wave=2;g.triggerNightSiege();
          for(let i=0;i<1200;i++){g.rebuildSpatialAndCrowdGrids();g.updateCombat(1/30);}
          const enemies=g.units.filter(u=>u.team==='enemy'&&u.squad?.seaborne);
          return {stats:{...ship.stats},pending:ship.pendingWaves.length,trips:ship.trips.length,
            enemies:enemies.map(u=>({x:u.x,z:u.z,transit:u.seaTransit,hp:u.hp})),
            waterWalkers:enemies.filter(u=>!u.seaTransit&&w.getCell(Math.floor(u.x+80),Math.floor(u.z+48))?.ground==='water').length};
        }''')
        print(json.dumps({'simulation':report['simulation']},ensure_ascii=True),flush=True)
        assert report['simulation']['stats']['enemyLanded']==9,report['simulation']
        assert report['simulation']['waterWalkers']==0,report['simulation']
        report['pauseAndSpeed']=page.evaluate('''()=>{
          const s=game.seaRaids;
          s.queueWave([{role:'spearman'}]);s.update(.1);
          const t=s.trips.at(-1),before=t.elapsed;s.update(0);
          const paused=t.elapsed===before;s.update(.2);
          const scaled=Math.abs(t.elapsed-before-.2)<1e-6;
          return {paused,scaled};
        }''')
        assert report['pauseAndSpeed']['paused'] and report['pauseAndSpeed']['scaled']
    report['errors']=errors;report['glError']=page.evaluate('game.renderer.getContext().getError()')
    report['sourceHashes']={};root=Path(__file__).resolve().parent.parent
    for r in sources:
        rel=unquote(urlparse(r.url).path).lstrip('/') or 'index.html';body=r.body()
        report['sourceHashes'][rel]=hashlib.sha256(body).hexdigest()
        if body!=(root/rel).read_bytes():report['sourceMismatches'].append(rel)
    (out/'island-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()
    assert not errors and not report['glError'] and not report['sourceMismatches'],report
    assert report['defences']==0 and report['production']==0 and report['houses']==4 and report['islandIsolated'],report
