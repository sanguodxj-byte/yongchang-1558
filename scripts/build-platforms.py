"""Build H5 and Dora from one Godot project and one byte-identical game PCK.

The H5 ZIP contains the Web runtime plus game.pck. The Dora archive contains
the host entry plus that exact game.pck. No platform-specific game is generated.
"""
import argparse,hashlib,json,os,shutil,subprocess,zipfile,sys
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--godot',default=r'D:\123\tmp\godot472\Godot_v4.7.2-stable_win64_console.exe')
p.add_argument('--web-template',default=r'D:\123\tmp\godot472-web\templates\web_nothreads_release.zip')
p.add_argument('--output',default='dist')
a=p.parse_args();root=Path(__file__).resolve().parent.parent
if (root/'game/assets/terrain-build.json').exists():
 subprocess.run([sys.executable,str(root/'scripts/build-terrain.py'),'--check'],cwd=root,check=True)
out=(root/a.output).resolve()
if not out.is_relative_to(root) or out==root:raise SystemExit('Output must be a child of the project')
stage=root/'.build';stage.mkdir(exist_ok=True)
settings=stage/'godot-profile';settings.mkdir(exist_ok=True)
env=os.environ.copy();env['APPDATA']=str(settings);env['LOCALAPPDATA']=str(settings)
h5=out/'h5';dora=out/'dora'
for directory in [h5,dora]:directory.mkdir(parents=True,exist_ok=True)
template=Path(a.web_template).resolve()
if not template.is_file():raise SystemExit('Godot 4.7 Web export template is required: '+str(template))
preset='''[preset.0]
name="H5"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="assets/*.json,assets/*.bin.z,LICENSES/*,LICENSE,ASSET_LICENSE.md"
exclude_filter="tests/*"
export_path=""
script_export_mode=2

[preset.0.options]
custom_template/debug="{template}"
custom_template/release="{template}"
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=false
html/canvas_resize_policy=1
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=true
progressive_web_app/enabled=false
'''.format(template=template.as_posix())
(root/'game'/'export_presets.cfg').write_text(preset,encoding='utf-8')
for args in [['--editor','--import','--quit'],['--export-release','H5',str(h5/'game.html')]]:
 result=subprocess.run([a.godot,'--headless','--path',str(root/'game'),*args],env=env,capture_output=True,timeout=240)
 log=(result.stdout+result.stderr).decode('utf-8',errors='replace')
 (stage/('export.log' if '--export-release' in args else 'import.log')).write_text(log,encoding='utf-8')
 # Godot can exit zero after script errors; require clean script/resource checks.
 problems=[line for line in log.splitlines() if 'SCRIPT ERROR:' in line or 'Parse Error:' in line or 'Failed to load' in line or 'Export failed' in line]
 if result.returncode or problems:raise SystemExit(log[-10000:])
pack=h5/'game.pck'
if not pack.is_file():raise SystemExit('Web export did not produce game.pck')
shutil.copy2(pack,dora/'game.pck');shutil.copy2(root/'init.lua',dora/'init.lua')
(h5/'game.html').replace(h5/'index.html')
html=(h5/'index.html').read_text(encoding='utf-8').replace('<html lang="en">','<html lang="zh-CN">')
html=html.replace('<head>','<head>\n<link rel="icon" href="game.png">')
# Dora fits a fixed 1600 x 1000 GodotNode into its host. Give H5 the same
# fixed render surface and centered contain rule, including pointer scaling.
html=html.replace('<canvas id="canvas">','<canvas id="canvas" width="1600" height="1000">')
html=html.replace('</style>','''
html, body { width: 100%; height: 100%; background: #191919; }
#canvas {
 position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
 width: min(100vw, 160vh) !important; height: min(62.5vw, 100vh) !important;
}
html.compact-game #canvas { width: 100vw !important; height: 100dvh !important; touch-action: none; }
</style>''')
(h5/'index.html').write_text(html,encoding='utf-8')
# Corresponding source is delivered with both applications, including generators,
# assets, tests and instructions. Never include local caches or Dora agent output.
source_files=[]
def distributable(f):
 return f.is_file() and not any(part.startswith('.') or part=='__pycache__' for part in f.relative_to(root).parts) and f.name not in ['export_presets.cfg','development-state.md']
for folder in ['game','content','src','vendor','scripts','docs','licenses']:
 for f in (root/folder).rglob('*'):
  if distributable(f):
   source_files.append(f)
for name in ['README.md','LICENSE','ASSET_LICENSE.md','THIRD_PARTY.md','init.lua','index.html','package.json','package-lock.json','.gitignore']:
 source_files.append(root/name)
with zipfile.ZipFile(out/'Yongchang1558-Source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in sorted(source_files):z.write(f,f.relative_to(root).as_posix())
for directory in [h5,dora]:
 for filename in ['LICENSE','ASSET_LICENSE.md','THIRD_PARTY.md']:
  shutil.copy2(root/filename,directory/filename)
 shutil.copytree(root/'licenses',directory/'licenses',dirs_exist_ok=True)
 for f in (root/'docs').rglob('*'):
  if distributable(f):
   target=directory/f.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target)
 shutil.copy2(out/'Yongchang1558-Source.zip',directory/'SOURCE.zip')
shutil.copy2(root/'docs'/'platforms.md',h5/'RUN.md');shutil.copy2(root/'docs'/'platforms.md',dora/'RUN.md')
manifest={'format':'dora-game','version':1,'title':'守望1558：永昌风云','engineVersion':'1.10.2','entry':'init'}
(dora/'dora-package.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
common_files=['LICENSE','ASSET_LICENSE.md','THIRD_PARTY.md','RUN.md','SOURCE.zip']
common_files += [f.relative_to(root).as_posix() for folder in ['licenses','docs'] for f in (root/folder).rglob('*') if distributable(f)]
deliveries=[(h5,'Yongchang1558-H5.zip',common_files+['index.html','game.js','game.wasm','game.pck','game.png','game.audio.worklet.js','game.audio.position.worklet.js']),
 (dora,'Yongchang1558-Dora.dora',common_files+['init.lua','game.pck','dora-package.json'])]
receipt={'schema':2,'engine':'Godot 4.7.2','contentPackage':'game.pck','sha256':hashlib.sha256(pack.read_bytes()).hexdigest(),
 'bytes':pack.stat().st_size,'sameContent':pack.read_bytes()==(dora/'game.pck').read_bytes(),
 'sourceHashes':{f.relative_to(root/'game').as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in (root/'game').rglob('*') if f.is_file() and '.godot' not in f.parts and f.name!='export_presets.cfg'}}
for directory,name,files in deliveries:
 local_receipt=dict(receipt,files={filename:hashlib.sha256((directory/filename).read_bytes()).hexdigest() for filename in files})
 (directory/'BUILD.json').write_text(json.dumps(local_receipt,ensure_ascii=False,indent=2),encoding='utf-8')
 with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for filename in sorted(files+['BUILD.json']):z.write(directory/filename,filename)
# Desktop Go Mode's file picker expects .zip; retain .dora for clients using it.
shutil.copy2(out/'Yongchang1558-Dora.dora',out/'Yongchang1558-Dora.zip')
print(json.dumps({'sameContent':receipt['sameContent'],'pckSha256':receipt['sha256'],'pckBytes':receipt['bytes'],'h5':str(h5),'dora':str(dora)},ensure_ascii=False))
