"""Exercise world controls using real mouse or native touch, not button-only smoke."""
import argparse, hashlib, json, math
from pathlib import Path
import numpy as np
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8782/');p.add_argument('--output',default='.build/control-repair/live');p.add_argument('--case',default='all');a=p.parse_args()
out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
report={'passed':False,'cases':[],'errors':[]}
cases=[('desktop',1280,720,False),('small-mouse',844,390,False),('landscape-touch',844,390,True),('portrait-touch',390,844,True),('tablet-touch',1280,800,True)]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\EdgeCore\158.0.4370.33\msedge.exe',headless=True)
    for name,width,height,touch in cases:
        if a.case not in ['all',name]:continue
        case={'name':name,'passed':False,'checks':[]};report['cases'].append(case)
        context=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch)
        page=context.new_page();page.set_default_timeout(20000);cdp=context.new_cdp_session(page)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        def state():return page.evaluate('__yongchang.state')
        def frame():
            n=state()['frame'];page.wait_for_function('(n)=>__yongchang.state.frame!==n',arg=n)
        def check(label,ok,detail=None):
            c={'name':label,'passed':bool(ok),'detail':detail};case['checks'].append(c);print(name,label,bool(ok),flush=True);assert ok,c
        def xy(x,y):
            r=page.locator('#canvas').bounding_box();v=state()['viewport'];return r['x']+x*r['width']/v[0],r['y']+y*r['height']/v[1]
        def tap_at(at,button='left'):
            if touch:page.touchscreen.tap(*xy(*at))
            else:page.mouse.click(*xy(*at),button=button,delay=80)
            frame()
        def click(label):
            page.wait_for_function('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',arg=label)
            for _ in range(8):
                r=page.evaluate('(s)=>Object.entries(__yongchang.ui).find(([k])=>k.split("\\n")[0]===s)[1]',label)
                layout=next(x for x in state()['layout'] if x['label'].split('\n')[0]==label)
                if layout['visible_rect'][3]>=r['height']-.5 and layout['visible_rect'][2]>=r['width']-.5:break
                direction=-1 if r['y']<90 else 1
                pos=xy(state()['viewport'][0]*.85,state()['viewport'][1]*.55)
                if touch:
                    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':pos[0],'y':pos[1],'id':0}]})
                    for i in range(1,7):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':pos[0],'y':pos[1]-direction*12*i,'id':0}]});page.wait_for_timeout(30)
                    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                else:page.mouse.move(*pos);page.mouse.wheel(0,direction*140)
                page.wait_for_timeout(400);frame()
            assert layout['visible_rect'][3]>=r['height']-.5,('Button clipped',label,layout)
            tap_at((r['x']+r['width']/2,r['y']+r['height']/2))
        def world(gx,gz,y=.4):
            s=state();eye=np.array(s['camera_position']);target=np.array(s['camera_target']);forward=target-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward);v=s['viewport'];d=np.array([gx-112,y,gz-48])-target
            return v[0]/2+float(d@right)*v[1]/s['zoom'],v[1]/2-float(d@up)*v[1]/s['zoom']
        def drag(start,end,button='left',cancel=False):
            start=xy(*start);end=xy(*end)
            if touch:
                cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start[0],'y':start[1],'id':0}]})
                for i in range(1,11):
                    at=[start[k]+(end[k]-start[k])*i/10 for k in range(2)];cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':at[0],'y':at[1],'id':0}]});page.wait_for_timeout(30)
                cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})
            else:
                page.mouse.move(*start);page.mouse.down(button=button);page.mouse.move(*end,steps=12);page.mouse.up(button=button)
            frame()
        def center(gx,gz):
            if state()['compact']:click('地图')
            m=state()['minimap'];tap_at((m['x']+6+gx/224*(m['width']-12),m['y']+6+gz/96*(m['height']-12)))
        def build_card(kind):
            click('营造 B');click('水乡民生' if kind=='江南水车稻田' else '永昌城防')
            for _ in range(6):
                if page.evaluate('(s)=>Object.keys(__yongchang.ui).some(k=>k.split("\\n")[0]===s)',kind):break
                click('下一页')
            click(kind)
        try:
            receipt=page.request.get(a.url+'BUILD.json').json();report['pckSha256']=receipt['sha256'];assert hashlib.sha256(page.request.get(a.url+'game.pck').body()).hexdigest()==receipt['sha256']
            page.goto(a.url);page.wait_for_function('window.__yongchang?.state?.screen==="title"',timeout=120000)
            click('步入永昌卫城');click('新手准备');s=state();v=s['viewport'];case['viewport']=v
            check('correct active input mode',s.get('input_mode')==('touch' if touch else 'mouse'),s.get('input_mode'))
            start=state()['camera'];drag((v[0]*.5,v[1]*.48),(v[0]*.5+60,v[1]*.48+18),button='right')
            check('drag pans camera',math.dist(start,state()['camera'])>.5)
            stable=state()['camera'];page.wait_for_timeout(450);frame();check('release ends pan',math.dist(stable,state()['camera'])<.03)
            if touch:
                at=(v[0]*.5,v[1]*.48);before=state();coords=[xy(at[0]-45,at[1]),xy(at[0]+45,at[1])]
                cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':i,'x':p[0],'y':p[1]} for i,p in enumerate(coords)]})
                coords=[xy(at[0]-75,at[1]+10),xy(at[0]+75,at[1]+10)]
                cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'id':i,'x':p[0],'y':p[1]} for i,p in enumerate(coords)]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});frame()
                check('pinch zoom and cleanup',state()['zoom']<before['zoom'] and state()['touches']==0 and not state()['touch_gesture'])
                drag((v[0]*.5,v[1]*.48),(v[0]*.5+30,v[1]*.48),cancel=True);check('touch cancel clears finger state',state()['touches']==0)
            else:
                z=state()['zoom'];page.mouse.move(*xy(v[0]*.5,v[1]*.48));page.mouse.wheel(0,-120);frame();check('mouse wheel zoom',state()['zoom']<z)
                before=state()['camera_yaw'];page.keyboard.press('q');frame();check('keyboard rotates camera',state()['camera_yaw']!=before);page.keyboard.press('e');frame()
            center(46,47)
            # Map panel camera controls are reachable without a keyboard.
            click('地图' if state()['compact'] else '资源定位');yaw=state()['camera_yaw'];click('镜头右转');check('on-screen camera rotation',state()['camera_yaw']!=yaw);click('镜头左转')
            for _ in range(6):
                old=state()['zoom']
                if old>=25:break
                click('缩小');page.wait_for_function('(z)=>__yongchang.state.zoom>z+.01',arg=old)
            click('收起')
            click('募勇');click('毛竹狼筅乡勇');click('募勇');selected=state()['selected_squad'];check('recruit selects the new squad',selected!=0)
            target=world(47.5,54.5);tap_at(target,button='right');q=next(q for q in state()['player_squads'] if q['id']==selected)
            check('ground command reaches selected squad',bool(q['order']),q['order'])
            initial=q['members'][0]['position'];page.wait_for_timeout(1200);q=next(q for q in state()['player_squads'] if q['id']==selected);check('ordered units actually move',math.dist(initial,q['members'][0]['position'])>.3)
            if touch:click('停止')
            else:page.keyboard.press('s');frame()
            check('stop clears orders',all(not q['order'] for q in state()['player_squads']))
            tap_at(world(47.5,54.5),button='right')
            if touch:click('追加路点');tap_at(world(49.5,55.5))
            else:
                page.keyboard.down('Shift');tap_at(world(49.5,55.5),button='right');page.keyboard.up('Shift')
            check('queued waypoint is available on this input',any(q['queue']>=1 for q in state()['player_squads']))
            if touch:click('停止')
            else:page.keyboard.press('s');frame()
            saved=state()['selected_squad'];before=state()['camera'];drag((v[0]*.5,v[1]*.48),(v[0]*.5+45,v[1]*.48+12),button='right')
            check('camera drag preserves selection and does not order',state()['selected_squad']==saved and all(not q['order'] for q in state()['player_squads']) and math.dist(before,state()['camera'])>.2,{'before':before,'after':state()['camera'],'selected':state()['selected_squad'],'zoom':state()['zoom'],'orders':[q['order'] for q in state()['player_squads']]})
            center(46,47)
            if touch:click('攻击移动');check('touch attack mode is reachable',state()['attack_armed']);tap_at(world(48.5,54.5));check('touch attack commits',not state()['attack_armed']);click('停止')
            else:page.keyboard.press('a');frame();tap_at(world(48.5,54.5));check('desktop attack commits',not state()['attack_armed']);page.keyboard.press('s');frame()
            if touch:click('取消选择')
            else:tap_at(world(44.5,54.5))
            check('selection can be cleared',state()['selected_squad']==0)
            q=state()['player_squads'][0];tap_at(q['members'][0]['screen']);check('unit tap selects existing squad',state()['selected_squad']==selected)
            if touch:click('取消选择');click('框选部队')
            else:tap_at(world(44.5,54.5))
            pts=[u['screen'] for q in state()['player_squads'] for u in q['members']];xs=[p[0] for p in pts];ys=[p[1] for p in pts];drag((min(xs)-15,min(ys)-15),(max(xs)+15,max(ys)+15))
            check('box selection works',state()['selected_squad']==selected)
            build_card('江南水车稻田');before=state()['stats']['built'];rotation=state()['build_rotation'];click('转向 R');check('building rotation button works',state()['build_rotation']!=(rotation));tap_at(world(47.5,54.5))
            if touch:
                check('touch previews before charging',state()['stats']['built']==before and state()['build_ready']);click('确认营造')
            page.wait_for_function('(n)=>__yongchang.state.stats.built===n+1',arg=before)
            check('building placed exactly once',state()['stats']['built']==before+1)
            if touch:click('取消')
            else:page.mouse.click(*xy(v[0]*.5,v[1]*.48),button='right');frame()
            check('construction cancellation works',state()['selected_build']=='')
            center(46,55);build_card('永昌花岗城墙');before=state()['stats']['built'];drag(world(45.5,54.5),world(45.5,57.5))
            if touch:
                check('wall drag previews multiple cells',state()['placement']['count']>=3,state()['placement']);click('确认营造')
            check('wall line is built',state()['stats']['built']>=before+3)
            if touch:click('取消')
            else:page.mouse.click(*xy(v[0]*.5,v[1]*.48),button='right');frame()
            page.screenshot(path=str(out/(name+'.png')));check('no browser errors',not report['errors'],report['errors']);case['passed']=True
        except Exception as e:
            case['failure']=str(e)
            try:case['lastState']=state();page.screenshot(path=str(out/(name+'-failure.png')))
            except Exception:pass
            print(name,'FAILED',str(e)[:600],flush=True)
        finally:context.close();(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()
report['passed']=bool(report['cases']) and all(c['passed'] for c in report['cases']) and not report['errors']
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
raise SystemExit(0 if report['passed'] else 1)
