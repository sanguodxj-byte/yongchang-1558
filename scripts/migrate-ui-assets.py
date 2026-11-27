"""Reuse the project's existing 3D portraits and inline SVG icons for the shared UI."""
import argparse,base64,hashlib,json,subprocess,re
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8766/');p.add_argument('--browser',default=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe');p.add_argument('--portraits-only',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/'game/assets/ui';out.mkdir(parents=True,exist_ok=True)
reference=subprocess.check_output(['git','show','0b2d7e1:index.html'],cwd=root).decode('utf-8')
evidence=root/'.build/ui-reference';evidence.mkdir(parents=True,exist_ok=True)
selectors={'crest':'.title-crest','lord':'#lord-crest-shield svg','garrison':'#btn-lord-garrison svg','policy':'#btn-tax-policy svg','donate':'#btn-ad-airdrop svg','scout':'#btn-scout-check svg','guard':'#btn-ad-guard svg','fire':'#btn-ignite svg','repair':'#btn-repair svg','map':'#btn-cam-cycle svg','defend':'#stance-ico svg','play':'#btn-menu-start svg','book':'#btn-menu-clan svg','controls':'#btn-menu-controls svg','sound':'#btn-menu-sound svg'}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=a.browser,headless=True)
 page=b.new_page(viewport={'width':1600,'height':1000});page.goto(a.url);page.wait_for_function('window.game?.icons?.buildings?.farm',timeout=120000)
 icons=page.evaluate('game.icons')
 for group,entries in icons.items():
  for key,url in entries.items():(out/f'{group}-{key}.png').write_bytes(base64.b64decode(url.split(',',1)[1]))
 if a.portraits_only:
  manifest=json.loads((out/'provenance.json').read_text('utf-8'))
  manifest['portraits']={'source':'src/iconStudio.js using existing project models','sourceHashes':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['src/iconStudio.js','src/voxelPrefabs.js','src/entities.js','index.html']}}
  (out/'provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
  b.close();print('Updated model portraits; existing UI skins and cover retained');raise SystemExit(0)
 for key,selector in selectors.items():
  locator=page.locator(selector).first
  if locator.count():
   svg=locator.evaluate('(n)=>n.outerHTML');svg=re.sub(r' class="[^"]*"','',svg)
   svg=svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" ',1)
   (out/f'icon-{key}.svg').write_text(svg,encoding='utf-8')
 for key in ['wood','stone','food','gold','peasants']:
  svg=page.locator(f'.res-pill:has(#r-{key}) svg').evaluate('(n)=>n.outerHTML')
  (out/f'icon-{key}.svg').write_text(svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" ',1),encoding='utf-8')
 # Reconstruct the approved UI stylesheet over current models for a scoped visual reference.
 css=re.search(r'<style>(.*?)</style>',reference,re.S).group(1)
 page.add_style_tag(content=css)
 page.screenshot(path=str(evidence/'title.png'))
 r=page.locator('#btn-title-enter').bounding_box();page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2);page.screenshot(path=str(evidence/'menu.png'))
 page.locator('#btn-menu-start').click();page.wait_for_timeout(400);page.screenshot(path=str(evidence/'play.png'))
 page.locator('#stamp-build').click();page.screenshot(path=str(evidence/'build.png'))
 b.close()
manifest={'styleReference':'0b2d7e1:index.html','portraits':'src/iconStudio.js using existing project models','svgSource':'index.html','sourceHashes':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['src/iconStudio.js','src/voxelPrefabs.js','src/entities.js','index.html']}}
(out/'provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Exported',len(list(out.glob('*.png'))),'portraits and',len(list(out.glob('icon-*.svg'))),'SVG icons')
