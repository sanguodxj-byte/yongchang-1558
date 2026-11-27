"""Capture the real menu/play route using an installed Playwright browser.

Usage: python scripts/visual-check.py --browser /path/to/msedge.exe --output /path/to/captures
Requires Python playwright and a static server at --url. No game files are patched.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--browser', required=True)
parser.add_argument('--url', default='http://127.0.0.1:8765/')
parser.add_argument('--output', required=True)
parser.add_argument('--label', default='before')
parser.add_argument('--dpr', type=float, default=1)
parser.add_argument('--audit', action='store_true')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser, headless=True)
    page = browser.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=args.dpr)
    errors = []
    loaded_sources = []
    page.on('response', lambda response: loaded_sources.append(response)
            if '/src/' in response.url or urlparse(response.url).path in ('/', '/index.html') else None)
    def record_error(message):
        errors.append(message)
        print(message, flush=True)
    page.on('pageerror', lambda err: record_error(str(err)))
    page.on('console', lambda msg: record_error(msg.text) if msg.type == 'error' else None)
    page.goto(args.url, wait_until='load')
    page.wait_for_function('window.game && window.game.postFx', timeout=60000)
    # The title button continuously floats, so click its live bounds without
    # waiting for Playwright's layout-stability heuristic to become true.
    box = page.locator('#btn-title-enter').bounding_box()
    page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.locator('#btn-menu-start').click()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(output / f'{args.label}-play.png'))
    frame_times = page.evaluate('''() => new Promise(resolve => {
      const values = []; let previous;
      function sample(now) {
        if(previous !== undefined) values.push(now - previous);
        previous = now;
        if(values.length < 90) requestAnimationFrame(sample);
        else { values.sort((a,b)=>a-b); resolve({frames:values.length,
          medianMs:values[45], p95Ms:values[85]}); }
      }
      requestAnimationFrame(sample);
    })''')
    # Staged visual inspection: keep the actual HUD and freeze only simulation.
    page.evaluate('''() => {
      game.timeScale = 0;
      game.camDesiredTarget.copy(game.camTarget);
    }''')
    page.mouse.move(800, 500)
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(650)
    page.screenshot(path=str(output / f'{args.label}-wide.png'))
    page.evaluate('''async () => {
      const {YONGCHANG_MAP:m}=await import('/src/yongchangMap.js');
      game.camTarget.set(m.canals[1].x0-m.width/2+1, 0.4, 49-m.height/2);
      game.camDesiredTarget.copy(game.camTarget);
      game.frustumSize = 24; game.updateOrthoProjection();
    }''')
    page.wait_for_timeout(400)
    page.screenshot(path=str(output / f'{args.label}-river.png'))
    page.evaluate('''async () => {
      const {YONGCHANG_MAP:m}=await import('/src/yongchangMap.js');
      game.camTarget.set(m.camera.home[0]-m.width/2+.5,.4,m.camera.home[1]-m.height/2+.5);
      game.camDesiredTarget.copy(game.camTarget);
      game.frustumSize = 20; game.updateOrthoProjection();
      game.isNight = true; game.phaseTimer = 999;
      for (let i=0; i<240; i++) {
        if(game.updateAtmosphere) game.updateAtmosphere(1/60);
        else game.updateWaveCycle(1/60);
      }
    }''')
    page.wait_for_timeout(400)
    page.screenshot(path=str(output / f'{args.label}-night.png'))
    data = page.evaluate('''() => {
      const g = game, gl = g.renderer.getContext();
      const gpu = gl.getExtension('WEBGL_debug_renderer_info');
      return {menu: g.menuState, night: g.isNight, camera:g.camera.position.toArray(),
        renderer: gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        canvas:[g.canvas.width,g.canvas.height],
        composer:[g.postFx.composer.readBuffer.width,g.postFx.composer.readBuffer.height],
        normalDepth:[g.postFx.outlinePass.rtNormalDepth.width,g.postFx.outlinePass.rtNormalDepth.height],
        programs:g.renderer.info.programs.length,
        glError: gl.getError()};
    }''')
    data['frameTimes'] = frame_times
    data['stagedCaptures'] = ['wide', 'river', 'night']
    assert data['canvas'] == data['composer'] == data['normalDepth'], data
    if args.audit:
        # Resize through the browser, then assert the buffers all address the
        # same physical pixels. This catches DPR being multiplied twice.
        sizes = []
        for width, height in [(1440, 900), (1100, 700), (1600, 1000)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_timeout(200)
            size = page.evaluate('''() => {
              const p = game.postFx, r = game.renderer, n = p.outlinePass.rtNormalDepth;
              return {canvas:[game.canvas.width,game.canvas.height],
                composer:[p.composer.readBuffer.width,p.composer.readBuffer.height],
                normal:[n.width,n.height], ratio:r.getPixelRatio(),
                viewport:[innerWidth,innerHeight],
                bloom:[p.bloomPass.renderTargetBright.width,p.bloomPass.renderTargetBright.height]};
            }''')
            assert size['canvas'] == size['composer'] == size['normal'], size
            assert size['bloom'] == [round(x / 2) for x in size['canvas']], size
            sizes.append(size)
        data['resizeChecks'] = sizes
        page.keyboard.press('Escape')
        assert page.evaluate('game.menuState') == 'pause'
        page.keyboard.press('Escape')
        assert page.evaluate('game.menuState') == 'play'
        initial_yaw = page.evaluate('game.camDesiredYaw')
        page.keyboard.press('e')
        page.wait_for_timeout(400)
        assert page.evaluate('game.camDesiredYaw') != initial_yaw
        page.screenshot(path=str(output / f'{args.label}-rotated.png'))
        data['inputChecks'] = ['pause', 'resume', 'rotate']
        # Exercise the real day-to-night handler, including enemy creation.
        page.evaluate('''() => { game.isNight=false; game.phaseTimer=0.01; game.timeScale=1; }''')
        page.wait_for_function('game.isNight && game.units.some(u => u.team === "enemy")')
        data['nightSiegeTriggered'] = True
        page.evaluate('game.timeScale = 0')
        page.set_viewport_size({'width': 960, 'height': 600})
        page.wait_for_timeout(400)
        page.screenshot(path=str(output / f'{args.label}-compact.png'))
        # A short frame strip uses real keyboard/wheel input and the real clock;
        # these images are motion evidence, not a frame-time benchmark.
        page.set_viewport_size({'width': 1280, 'height': 800})
        page.evaluate('''async () => {
          const {YONGCHANG_MAP:m}=await import('/src/yongchangMap.js');
          game.isNight=false; game.phaseTimer=999;
          game.camDesiredTarget.set(m.canals[1].x0-m.width/2+1,.4,49-m.height/2);
          game.frustumSize=24; game.updateOrthoProjection();
        }''')
        page.wait_for_timeout(2200)
        for frame in range(12):
            page.mouse.move(650, 400)
            page.mouse.wheel(0, -7)
            page.wait_for_timeout(75)
            page.screenshot(path=str(output / f'{args.label}-motion-{frame:02d}.png'))
        data['motionFrames'] = 12

    data['sourceHashes'] = {}
    data['sourceMismatches'] = []
    repo = Path(__file__).resolve().parent.parent
    for response in loaded_sources:
        path = unquote(urlparse(response.url).path).lstrip('/') or 'index.html'
        body = response.body()
        if body != (repo / path).read_bytes():
            data['sourceMismatches'].append(path)
        data['sourceHashes'][path] = hashlib.sha256(body).hexdigest()
    data['errors'] = errors
    (output / f'{args.label}-report.json').write_text(json.dumps(data, indent=2), encoding='utf-8')
    print(json.dumps(data))
    browser.close()
    if errors or data['glError'] or data['sourceMismatches']:
        raise SystemExit(1)
