"""Build and reload water gates through real mouse/touch input in the exported H5."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8767/')
parser.add_argument('--output', default='.build/water-defenses/web')
parser.add_argument('--browser')
args = parser.parse_args()
if not args.browser:
    candidates = list(Path(r'C:\Program Files (x86)\Microsoft\EdgeCore').glob('*/msedge.exe'))
    args.browser = str(max(candidates, key=lambda p: tuple(int(n) for n in p.parent.name.split('.'))))
out = Path(args.output).resolve();out.mkdir(parents=True, exist_ok=True)
report = {'passed': False, 'cases': [], 'errors': []}
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=args.browser, headless=True)
    try:
        for name, width, height, touch in [('desktop', 1600, 1000, False), ('compact-touch', 844, 390, True)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch)
            page = context.new_page();page.set_default_timeout(20000)
            page.on('pageerror', lambda error: report['errors'].append(str(error)))
            page.on('console', lambda message: report['errors'].append(message.text) if message.type == 'error' else None)
            case = {'name': name, 'passed': False, 'checks': []};report['cases'].append(case)
            receipt = page.request.get(args.url+'BUILD.json').json()
            assert hashlib.sha256(page.request.get(args.url+'game.pck').body()).hexdigest() == receipt['sha256']
            report['pckSha256'] = receipt['sha256']
            page.goto(args.url)
            page.wait_for_function('window.__yongchang?.state?.screen==="title"', timeout=120000)

            def state():
                return page.evaluate('__yongchang.state')

            def frame():
                previous = page.evaluate('window.__yongchang?.state?.frame ?? -1')
                page.wait_for_function('(n)=>window.__yongchang?.state?.frame!==undefined && window.__yongchang.state.frame!==n', arg=previous)

            def tap(at):
                canvas = page.locator('#canvas').bounding_box();v = state()['viewport']
                xy = [canvas['x']+at[0]*canvas['width']/v[0], canvas['y']+at[1]*canvas['height']/v[1]]
                if touch:
                    page.touchscreen.tap(*xy)
                else:
                    page.mouse.move(*xy);frame();page.mouse.down();frame();page.mouse.up()
                frame()

            def click(label):
                page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)', arg=label)
                r = page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]', label)
                tap([r['x']+r['width']/2, r['y']+r['height']/2])

            def check(label, passed, detail=None):
                case['checks'].append({'name': label, 'passed': bool(passed), 'detail': detail})
                print(name, label, passed, flush=True)
                assert passed, (label, detail)

            def center(gx, gz):
                if state()['compact']:
                    click('地图')
                m = state()['minimap']
                tap([m['x']+6+gx/224*(m['width']-12), m['y']+6+gz/96*(m['height']-12)])

            def world(gx, gz, y=-.22):
                s = state();eye = np.array(s['camera_position']);target = np.array(s['camera_target'])
                forward = target-eye;forward /= np.linalg.norm(forward)
                right = np.cross(forward, [0, 1, 0]);right /= np.linalg.norm(right);up = np.cross(right, forward)
                v = s['viewport'];delta = np.array([gx-112, y, gz-48])-target
                return [v[0]/2+float(delta@right)*v[1]/s['zoom'], v[1]/2-float(delta@up)*v[1]/s['zoom']]

            click('步入永昌卫城');click('新手准备')
            check('real input mode', state()['input_mode'] == ('touch' if touch else 'mouse'))
            center(38.5, 38.5)
            click('营造 B');click('永昌城防');click('跨渠石拱水门')
            check('new card selects water gate', state()['selected_build'] == 'waterGate')
            before = state()['resources'].copy()
            if not touch:
                page.keyboard.press('r');frame();tap(world(38.5, 38.5))
                check('wrong orientation rejects without charge', not state()['placement']['valid'] and state()['stats']['built'] == 0 and state()['resources']['stone'] == before['stone'])
                page.keyboard.press('r');frame()
            tap(world(38.5, 38.5))
            if touch:
                check('touch preview resolves both banks', state()['placement']['valid'], state()['placement'])
                click('确认营造')
            page.wait_for_function('__yongchang.state.stats.built===1')
            after = state();gates = [b for b in after['player_buildings'] if b['type'] == 'waterGate']
            check('paid water gate exists in game', len(gates) == 1 and gates[0]['cell'] == [38, 38], gates)
            check('cost is stone16 wood4 iron2', all(after['resources'][k] == before[k]-n for k, n in [('stone', 16), ('wood', 4), ('iron', 2)]))
            page.screenshot(path=str(out/(name+'-built.png')))
            click('取消');click('暂停');click('保存进度')
            page.reload();page.wait_for_function('window.__yongchang?.state?.screen==="title"', timeout=120000)
            click('步入永昌卫城');click('继续上次守望')
            page.wait_for_function('__yongchang.state.state==="pause"')
            click('继续守望')
            page.wait_for_function('__yongchang.state.state==="play"')
            check('water gate survives real save and page reload', sum(b['type'] == 'waterGate' for b in state()['player_buildings']) == 1)
            case['passed'] = True;context.close()
        assert not report['errors'], report['errors']
        report['passed'] = True
    finally:
        (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
