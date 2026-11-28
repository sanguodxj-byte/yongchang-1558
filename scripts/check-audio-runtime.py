"""Verify exported music transitions and mute through real browser input."""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:8781/')
p.add_argument('--output', default='.build/polish-v2/audio-live')
a = p.parse_args()
out = Path(a.output).resolve()
out.mkdir(parents=True, exist_ok=True)
report = {'passed': False, 'checks': [], 'errors': []}
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe', headless=True)
    page = browser.new_page(viewport={'width': 1600, 'height': 1000})
    page.set_default_timeout(25000)
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.on('console', lambda message: report['errors'].append(message.text) if message.type == 'error' else None)
    # A passive branch observes the actual WebAudio samples. It neither supplies
    # user activation nor changes the game's playback clock, gain or state.
    page.add_init_script('''(() => {
      window.__audioMeters = [];
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function(...args) {
        const result = connect.apply(this, args);
        if (args[0] === this.context.destination && !this.__metered) {
          this.__metered = true;
          const meter = this.context.createAnalyser(); meter.fftSize = 2048;
          connect.call(this, meter);
          window.__audioMeters.push(meter);
        }
        return result;
      };
    })();''')

    def state(): return page.evaluate('__yongchang.state')

    def frame():
        old = state()['frame']
        page.wait_for_function('(n) => __yongchang.state.frame !== n', arg=old)

    def click(label):
        page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)', arg=label)
        rect = page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]', label)
        page.mouse.click(rect['x'] + rect['width']/2, rect['y'] + rect['height']/2, delay=100)
        frame()

    def sample():
        values = []
        for _ in range(8):
            page.wait_for_timeout(125)
            values.append(page.evaluate('''() => {
              let peak=0;
              for(const meter of __audioMeters) {
                const pcm = new Float32Array(meter.fftSize);
                meter.getFloatTimeDomainData(pcm);
                for(const value of pcm) peak=Math.max(peak,Math.abs(value));
              }
              return {peak, meters:__audioMeters.length, contexts:__audioMeters.map(m=>m.context.state)};
            }'''))
        return {'audio': state()['audio'], 'peak': max(v['peak'] for v in values), 'meters': values[-1]['meters'], 'contexts': values[-1]['contexts']}

    def check(label, ok, detail):
        item = {'name': label, 'passed': bool(ok), 'detail': detail}
        report['checks'].append(item)
        print(json.dumps(item, ensure_ascii=False), flush=True)
        assert ok, item

    try:
        receipt = page.request.get(a.url + 'BUILD.json').json()
        report['pckSha256'] = receipt['sha256']
        assert hashlib.sha256(page.request.get(a.url + 'game.pck').body()).hexdigest() == receipt['sha256']
        page.goto(a.url)
        page.wait_for_function('window.__yongchang?.state?.state === "title"', timeout=120000)
        click('步入永昌卫城'); click('开始守望')
        page.wait_for_timeout(3500)
        village = sample()
        check('real start plays village music with actual audio samples', village['audio']['music'] == 'village' and village['audio']['musicPlaying'] and village['peak'] > 0.0001 and 'running' in village['contexts'], village)
        page.screenshot(path=str(out / 'village.png'))
        click('暂停'); click('声音 开 / 关')
        page.wait_for_timeout(3000)
        muted = sample()
        check('sound switch silences the complete mix', not muted['audio']['enabled'] and muted['audio']['voices'] == 0 and muted['audio']['musicDb'] <= -79 and muted['peak'] < 0.0003, muted)
        click('声音 开 / 关'); page.wait_for_timeout(3000)
        restored = sample()
        check('sound can resume without reloading', restored['audio']['enabled'] and restored['peak'] > 0.0001, restored)
        click('继续守望'); click('速度')
        page.wait_for_function('__yongchang.state.night && __yongchang.state.audio.music === "watch"', timeout=100000)
        page.wait_for_timeout(2200)
        watch = sample()
        check('natural first night crossfades to watch music', watch['audio']['music'] == 'watch' and watch['peak'] > 0.0001, watch)
        click('军令'); click('进攻')
        page.wait_for_function('__yongchang.state.audio.music === "battle"')
        page.wait_for_timeout(2500)
        battle = sample()
        check('attack command crossfades to battle music', battle['audio']['music'] == 'battle' and battle['peak'] > 0.0001, battle)
        check('observed mix has headroom', max(village['peak'], restored['peak'], watch['peak'], battle['peak']) < 0.98, {'samples': [village['peak'], restored['peak'], watch['peak'], battle['peak']]})
        check('no browser errors', not report['errors'], report['errors'])
        report['passed'] = True
    finally:
        (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
