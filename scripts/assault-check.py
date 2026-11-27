"""Exercise village-to-island combat through victory using a staged normal-stat army.

This verifies transport, attack navigation and the real victory trigger. It is
not a recruitment/economy balance test: the army is provided by the fixture.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--browser', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--url', default='http://127.0.0.1:8765/')
parser.add_argument('--block-crossing', action='store_true',
                    help='Negative control: block transport and require this check to fail.')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
report = {'passed': False, 'fixture': 'Army staged at village; original HP, damage and defences',
          'negativeControl': args.block_crossing, 'errors': [], 'samples': []}
root = Path(__file__).resolve().parent.parent

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.browser, headless=True)
        page = browser.new_page(viewport={'width': 1600, 'height': 1000})
        sources = []
        page.on('response', lambda r: sources.append(r)
                if '/src/' in r.url or urlparse(r.url).path == '/' else None)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('requestfailed', lambda r: report['errors'].append(f'{r.url}: {r.failure}'))
        page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
        page.goto(args.url, wait_until='load')
        page.wait_for_function('window.game && game.seaRaids')
        box = page.locator('#btn-title-enter').bounding_box()
        page.mouse.click(box['x'] + box['width']/2, box['y'] + box['height']/2)
        page.locator('#btn-menu-start').click()
        page.evaluate('''()=>{
          game.timeScale=0;
          const p=game.world.campfirePos;
          window.assaultUnits=[];window.assaultWaterSteps=0;window.assaultSamples=0;
          const army=['ram','ram','ram','knight','knight','knight','knight',
            'swordsman','swordsman','swordsman','swordsman','archer','archer','trebuchet','trebuchet'];
          for(const [i,role] of army.entries()){
            const sq=game.createSquad(role,'player',p.x-6+(i%3)*3,p.z+10+Math.floor(i/3)*3,true);
            assaultUnits.push(...sq.members);
          }
        }''')
        if args.block_crossing:
            page.evaluate('game.seaRaids.launch=()=>false')
        page.locator('#btn-stance-wheel').click()
        page.locator('#btn-stance-wheel').click()
        assert page.evaluate('game.stance') == 'attack'
        report['initial'] = page.evaluate('''()=>({units:assaultUnits.length,
          enemyLordHp:game.enemyLord.hp,coreHp:game.world.enemyKeep.hp,
          startingPositions:assaultUnits.map(u=>({x:u.x,z:u.z,hp:u.hp}))})''')
        for chunk in range(36 if not args.block_crossing else 9):
            state = page.evaluate('''async()=>{
              const {YONGCHANG_MAP:m}=await import('/src/yongchangMap.js');
              const g=game,w=g.world;
              for(let i=0;i<300&&!g.gameOver;i++){
                g.rebuildSpatialAndCrowdGrids();g.updateCombat(1/30);g.debris.update(1/30);
                for(const u of assaultUnits)if(u.hp>0&&!u.seaTransit){
                  assaultSamples++;
                  const c=w.getCell(Math.floor(u.x+m.width/2),Math.floor(u.z+m.height/2));
                  if(!c||c.ground==='water')assaultWaterSteps++;
                }
              }
              return {seconds:g.seaRaids.clock,stats:{...g.seaRaids.stats},gameOver:g.gameOver,
                alive:assaultUnits.filter(u=>u.hp>0).length,enemyLordHp:g.enemyLord.hp,
                coreHp:w.enemyKeep.hp,gateHp:w.getCell(123,49).structure?.hp??0,
                waterSteps:assaultWaterSteps,unitSamples:assaultSamples,
                trips:g.seaRaids.trips.length,pending:g.seaRaids.pendingWaves.length};
            }''')
            report['samples'].append(state)
            print(json.dumps(state), flush=True)
            if state['gameOver'] or state['alive'] == 0:
                break
        report['final'] = state
        report['victoryText'] = page.locator('#go-title').text_content()
        report['victoryVisible'] = page.locator('#gameover-modal').is_visible()
        report['units'] = page.evaluate('assaultUnits.map(u=>({role:u.role,hp:u.hp,x:u.x,z:u.z,transit:u.seaTransit}))')
        page.evaluate('''()=>{
          game.camDesiredTarget.set(49,.4,1);game.frustumSize=29;game.updateOrthoProjection();
        }''')
        page.wait_for_timeout(400)
        page.screenshot(path=str(out/'assault-result.png'))
        report['glError'] = page.evaluate('game.renderer.getContext().getError()')
        report['sourceHashes'] = {}
        report['sourceMismatches'] = []
        for response in sources:
            rel = unquote(urlparse(response.url).path).lstrip('/') or 'index.html'
            body = response.body()
            report['sourceHashes'][rel] = hashlib.sha256(body).hexdigest()
            if body != (root/rel).read_bytes():
                report['sourceMismatches'].append(rel)
        assert state['stats']['playerLanded'] > 0, 'No staged unit reached the island'
        assert state['unitSamples'] > 0 and state['waterSteps'] == 0, state
        assert state['enemyLordHp'] <= 0 and state['gameOver'], state
        assert report['victoryVisible'] and '海波平定' in report['victoryText'], report['victoryText']
        assert not report['errors'] and not report['glError'] and not report['sourceMismatches']
        report['passed'] = True
        browser.close()
finally:
    (out/'assault-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
