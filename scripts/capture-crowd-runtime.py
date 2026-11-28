"""Capture real-input formation movement; image readback is not a benchmark."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8781/');p.add_argument('--output',default='.build/polish-v2/crowd-live');a=p.parse_args()
out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
report={'passed':False,'errors':[],'frames':[],'kind':'real mouse/key input, image readback; not performance evidence'}
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(25000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    def state():return page.evaluate('__yongchang.state')
    def frame():
        old=state()['frame'];page.wait_for_function('(n)=>__yongchang.state.frame!==n',arg=old)
    def click(label):
        page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',arg=label)
        r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
        page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2,delay=100);frame()
    def point(gx,gz,y=.4):
        import numpy as np
        s=state();c=np.array(s['camera_position']);t=np.array(s['camera_target']);f=t-c;f/=np.linalg.norm(f)
        right=np.cross(f,np.array([0,1,0]));right/=np.linalg.norm(right);up=np.cross(right,f)
        delta=np.array([gx-112,y,gz-48])-t;return 800+float(delta@right)*1000/s['zoom'],500-float(delta@up)*1000/s['zoom']
    try:
        receipt=page.request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256']
        assert hashlib.sha256(page.request.get(a.url+'game.pck').body()).hexdigest()==receipt['sha256']
        page.goto(a.url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
        click('步入永昌卫城');click('新手准备');click('宗族');click('义捐');click('义捐');click('宗族')
        click('募勇');click('毛竹狼筅乡勇');click('毛竹狼筅乡勇');click('募勇')
        squads=state()['player_squads'];ids=[q['id'] for q in squads if q['role']=='spearman'];assert len(ids)==2
        for i,ident in enumerate(ids):
            q=next(q for q in state()['player_squads'] if q['id']==ident)
            page.mouse.click(*q['members'][0]['screen']);frame();page.mouse.click(*point(44+i*7,58),button='right');frame()
        page.wait_for_function('__yongchang.state.player_squads.filter(q=>q.role==="spearman").every(q=>q.members.every(u=>u.position[2]>7))',timeout=40000)
        m=state()['minimap'];page.mouse.click(m['x']+6+47.5/224*(m['width']-12),m['y']+6+58/96*(m['height']-12),delay=100);frame()
        page.mouse.move(800,500)
        for _ in range(9):page.mouse.wheel(0,-120);page.wait_for_timeout(90)
        frame()
        report['camera']={k:state()[k] for k in ['zoom','camera_target','camera_position']}
        start=state()
        for i,ident in enumerate(ids):
            q=next(q for q in state()['player_squads'] if q['id']==ident)
            page.mouse.click(*q['members'][0]['screen']);frame();page.mouse.click(*point(51-i*7,58),button='right');frame()
        for index in range(48):
            page.wait_for_timeout(70);s=state();path=out/('frame-%03d.png'%index);page.screenshot(path=str(path))
            report['frames'].append({'file':path.name,'time':s['time'],'units':s['player_squads'],'audio':s['audio']})
        end=state();assert end['time']>start['time']+3 and not report['errors']
        before={u['id']:u['position'] for q in start['player_squads'] for u in q['members']}
        import math
        travel=[math.dist(before[u['id']],u['position']) for q in end['player_squads'] for u in q['members'] if u['id'] in before]
        assert max(travel)>3,travel
        report.update(passed=True,maxTravel=max(travel))
    finally:
        (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
if report['passed']:
    frames=[Image.open(out/f['file']).convert('RGB').resize((960,600)) for f in report['frames']]
    durations=[max(40,round((report['frames'][min(i+1,len(frames)-1)]['time']-report['frames'][i]['time'])*1000)) for i in range(len(frames))]
    frames[0].save(out/'crowd.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0)
    sheet=Image.new('RGB',(1440,900))
    for i,index in enumerate([0,5,11,17,23,29,35,41,47]):sheet.paste(frames[index].resize((480,300)),((i%3)*480,(i//3)*300))
    sheet.save(out/'crowd-sheet.jpg',quality=93)
print(json.dumps({'passed':report['passed'],'frames':len(report['frames']),'pck':report.get('pckSha256')}))
