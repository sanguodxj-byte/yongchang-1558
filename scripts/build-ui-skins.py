"""Original Chinese atlas UI: paper folios, cinnabar seals and woodcut linework.

All geometry is vector artwork authored here. No external game imagery is used.
The game's original 3D portraits remain separate, unchanged assets.
"""
import hashlib,json,math,random
from pathlib import Path

root=Path(__file__).resolve().parent.parent;out=root/'game/assets/ui';out.mkdir(parents=True,exist_ok=True)
theme=json.loads((root/'content/ui-theme.json').read_text('utf-8'));colors=theme['colors']
hexcolor=lambda name:'#'+colors[name]
generated=[]
def save(name,body,width=96,height=96):
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{body}</svg>'
    (out/(name+'.svg')).write_text(svg,encoding='utf-8');generated.append(name+'.svg')

for name,(fill,edge,ink) in theme['surfaces'].items():
    for state in ['normal','hover','pressed','disabled']:
        shape='M10 3H86V7H92V13H94V83H90V89H84V93H12V89H6V83H2V13H5V7H10Z'
        inner='M13 8H83V12H88V17H89V79H85V85H80V88H16V85H11V79H7V17H9V12H13Z'
        overlay='#ffffff' if state=='hover' else '#172e27';alpha='.08' if state=='hover' else '.09' if state=='pressed' else '.02'
        body=f'<path d="{shape}" transform="translate(0 2)" fill="#243e34" opacity=".13"/><path d="{shape}" fill="#{fill}" stroke="#{edge}" stroke-width="1.4"/>'
        body+=f'<path d="{inner}" fill="none" stroke="#{edge}" opacity=".52" stroke-width=".7"/>'
        body+=f'<path d="{shape}" fill="{overlay}" opacity="{alpha}"/>'
        plain=body
        # Ornament ink stays inside an 18px corner; text starts beyond 22/24px.
        for flip in ['', 'translate(96 0) scale(-1 1)', 'translate(0 96) scale(1 -1)', 'translate(96 96) scale(-1 -1)']:
            body+=f'<path transform="{flip}" d="M11 18V12H17V15H14V18" fill="none" stroke="#{edge}" stroke-width="1"/>'
        if name in ['panel','paper','card','linen']:
            body+='<path d="M27 8H69M28 89H68" stroke="#ffffff" opacity=".5" stroke-width="1"/>'
        save(f'skin-{name}-{state}',body)
        # Small controls and card captions use the same silhouette without fretwork.
        save(f'skin-plain-{name}-{state}',plain)

ink=hexcolor('ink');red=hexcolor('vermilion');gold=hexcolor('gold');jade=hexcolor('jade');paper=hexcolor('paper')
icons={
 'crest':f'<path d="M5 25Q16 26 24 12Q32 26 43 25L38 30H10Z" fill="{red}"/><path d="M11 30V45H37V30M16 34V41M32 34V41M21 45V34H27V45M5 45H43M15 21H33"/>',
 'construct':'<path d="M7 37L36 8L41 13L12 42ZM13 13L35 35M10 8L17 15M31 31L39 39M18 24L24 30M25 17L31 23"/>',
 'recruit':f'<path d="M10 6V43M10 8H37L32 17L37 26H10"/><path d="M17 13H28M22 13V22M17 19H28" stroke="{red}"/>',
 'wood':f'<path d="M12 15L36 9L41 31L17 38Z" fill="{jade}" opacity=".18"/><path d="M12 15L36 9L41 31L17 38L12 15ZM17 38L9 33L5 14L12 15M17 23L37 18M19 30L39 25M24 13L29 34"/>',
 'stone':'<path d="M6 19L16 11H34L42 29L34 38H11L6 19ZM16 11L20 28L11 38M20 28L42 29M20 28L34 14"/>',
 'food':f'<path d="M24 44V10M24 31Q9 29 9 20Q21 20 24 31ZM24 23Q12 19 14 11Q24 13 24 23ZM24 34Q39 30 39 21Q28 22 24 34ZM24 22Q37 17 34 9Q25 12 24 22ZM24 12Q19 5 24 2Q29 5 24 12Z" fill="{gold}" fill-opacity=".25"/>',
 'gold':f'<circle cx="24" cy="24" r="17" fill="{gold}" fill-opacity=".2"/><circle cx="24" cy="24" r="13" opacity=".45"/><path d="M19 19H29V29H19ZM24 10V15M24 33V38M10 24H15M33 24H38"/>',
 'peasants':'<path d="M13 18Q13 8 24 8Q35 8 35 18L39 21H9L13 18ZM17 22V26Q24 36 31 26V22M8 43Q10 32 17 32L24 40L31 32Q39 34 40 43M18 11H30"/>',
 'book':f'<path d="M7 7H35L41 13V43H7ZM12 7V43M17 16H31M17 23H31M17 30H26"/><path d="M17 3H30V9H17Z" fill="{red}" stroke="none"/>',
 'lord':'<path d="M10 11H38L34 18H14ZM18 5H30V11M16 19V29Q24 35 32 29V19M7 44Q9 34 18 33L24 40L30 33Q39 34 41 44"/>',
 'garrison':'<path d="M6 22L24 7L42 22M10 22V43H38V22M18 43V28H30V43M5 43H43M12 18H36M21 12H27"/>',
 'donate':f'<path d="M9 23L6 39H42L39 23M13 23H35M17 13L24 6L31 13L24 20ZM13 29H35M20 35H28"/><path d="M24 9V16" stroke="{red}"/>',
 'guard':f'<path d="M24 5L39 11V25Q38 34 24 43Q10 34 9 25V11L24 5Z"/><path d="M17 17H31M24 11V33M16 26L24 33L32 26" stroke="{red}"/>',
 'defend':'<path d="M7 43V15H15V9H22V15H28V9H35V15H41V43M7 24H41M19 43V31Q24 26 29 31V43"/>',
 'map':f'<circle cx="24" cy="24" r="17"/><path d="M24 4V10M24 38V44M4 24H10M38 24H44M24 12L30 30L24 26L18 30Z"/><path d="M24 12V26" stroke="{red}"/>',
 'repair':'<path d="M8 8H27V18H8ZM16 18V39H23V18M29 9L40 20M29 31L39 40M35 25L23 37"/>',
 'fire':f'<path d="M25 5Q30 17 23 22Q35 18 36 12Q47 35 28 43Q7 46 7 30Q7 22 16 17Q13 30 22 31Q15 19 25 5Z" fill="{red}" fill-opacity=".8" stroke="{red}"/>',
 'scout':'<path d="M5 25Q24 6 43 25Q24 43 5 25ZM18 25A6 6 0 1 0 30 25A6 6 0 1 0 18 25M24 5V10"/>',
 'play':'<path d="M12 14H34M25 5L35 14L25 23M8 28H39M8 36H31"/>',
 'pause':'<path d="M9 8H18V40H9ZM30 8H39V40H30Z"/>',
 'controls':'<path d="M7 24H41M24 7V41M7 24L14 17M7 24L14 31M41 24L34 17M41 24L34 31M24 7L17 14M24 7L31 14M24 41L17 34M24 41L31 34"/>',
 'sound':'<path d="M7 19H15L25 10V38L15 29H7ZM31 18Q39 24 31 30M35 11Q49 24 35 37"/>',
}
for name,paths in icons.items():
    body=f'<g fill="none" stroke="{ink}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">{paths}</g>'
    save('icon-'+name,body,48,48)
    save('icon-'+name+'-light',body.replace(ink,hexcolor('onDark')).replace(red,'#e7c789'),48,48)

rng=random.Random(1558)
body=f'<rect width="1600" height="1000" fill="{paper}"/>'
body+='<path d="M780 0H1600V1000H680Q850 720 760 485Q700 210 780 0" fill="#e0e6d9"/>'
for i in range(240):
    x=rng.uniform(0,1600);y=rng.uniform(0,1000);length=rng.uniform(3,28)
    body+=f'<path d="M{x:.1f} {y:.1f}l{length:.1f} -.8" stroke="#a99e7b" stroke-width=".5" opacity=".1"/>'
body+='<circle cx="1235" cy="207" r="67" fill="#d2b477" opacity=".48"/>'
body+='<path d="M1090 222Q1115 211 1148 220Q1174 201 1201 218Q1248 207 1274 223M1212 250Q1267 237 1329 250Q1365 237 1408 250" stroke="#8da58e" stroke-width="1.2" fill="none" opacity=".7"/>'
mountains=[('#c3d0bd',450,35),('#99b09a',540,62),('#769582',635,102),('#446e5e',790,136)]
for idx,(color,base,amp) in enumerate(mountains):
    pts=[]
    for j in range(65):
        x=650+j*16;v=base-abs(math.sin(j*.135+idx*.8))*amp-abs(math.sin(j*.29+idx))*amp*.44
        v+=(1-min(1,j/13))*125
        pts.append(f'{x:.1f},{v:.1f}')
    body+=f'<polygon points="650,1000 '+ ' '.join(pts)+f' 1674,1000" fill="{color}"/>'
body+='<path d="M1600 530Q1310 527 1280 650Q1260 752 1040 790Q894 815 839 1000H1600Z" fill="#d6e1d7"/>'
for y in range(650,1020,20):
    x=1100+(y-650)*-.42
    body+=f'<path d="M{x} {y}q48 -9 96 0t96 0t96 0t96 0t96 0" stroke="#8ea99a" stroke-width="1.2" fill="none" opacity=".7"/>'
body+='<g stroke="#325548" stroke-linejoin="round" stroke-width="2">'
for x,y,scale in [(878,601,1.05),(1008,579,.9),(1110,644,.8),(910,742,.8),(1045,758,.64),(785,810,.78)]:
    body+=f'<g transform="translate({x} {y}) scale({scale})"><path d="M0 27H88V83H0Z" fill="#f1ebd6"/><path d="M-13 29Q23 21 44 0Q65 21 102 29L92 35H-3Z" fill="#3e6656"/><path d="M8 30H81M27 83V48H51V83M64 47H77V61H64Z" fill="#a7523c"/><path d="M7 83H89M7 24Q30 19 44 5Q59 20 82 25M20 26L36 14M34 27L43 13M50 27L47 13M65 28L55 17M29 54H49M29 62H49M39 48V80M67 47V60M72 47V60M64 54H77" stroke-width="1"/></g>'
body+='<path d="M754 882L1162 862L1193 882L777 909Z" fill="#d5c8a0"/><path d="M777 909V946L1193 916V882" fill="#baa982"/><path d="M777 909L1193 882M849 929V898M932 922V892M1016 917V887M1100 912V881" fill="none" opacity=".5"/>'
body+='</g>'
body+='<g stroke="#4b6959" stroke-width="2" fill="none"><path d="M1319 738V905M1257 897Q1322 925 1383 888L1361 922H1284Z" fill="#5a7967"/><path d="M1313 746Q1271 786 1269 869H1313Z" fill="#e9dcc0"/><path d="M1325 771Q1372 802 1370 871H1325Z" fill="#e7d2a3"/><path d="M1287 793H1313M1276 824H1313M1270 851H1313M1325 805H1353M1325 836H1367M1325 859H1369"/></g>'
body+='<path d="M48 48H1552V952H48Z" stroke="#b2a27d" stroke-width="1" fill="none"/><path d="M61 91V61H91M1509 61H1539V91M61 909V939H91M1509 939H1539V909" stroke="#a44332" stroke-width="2" fill="none"/>'
save('title-atlas',body,1600,1000)
save('chapter-rule',f'<path d="M0 12H130L142 4L154 12L142 20L130 12M154 12H284" fill="none" stroke="{gold}" stroke-width="1.2"/><path d="M138 12L142 8L146 12L142 16Z" fill="{red}"/>',284,24)
(out/'theme.json').write_text(json.dumps(theme,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
provenance={'version':3,'style':'Original Chinese coastal-defence atlas UI','palette':'content/ui-theme.json','vectorSource':'scripts/build-ui-skins.py','portraits':'Existing project models; unchanged','font':'Unmodified LXGW WenKai Medium (SIL OFL 1.1)','fontSha256':hashlib.sha256((root/'game/assets/title-kai.ttf').read_bytes()).hexdigest(),'files':{name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in generated}}
(out/'style-provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
print('Chinese atlas UI:',len(generated),'original vector assets')
