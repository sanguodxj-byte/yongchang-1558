"""Fail closed on mismatched Dora/H5 archives, source or runtime evidence."""
import argparse
import hashlib
import io
import json
import zipfile
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--output',default='dist')
p.add_argument('--evidence',type=Path)
p.add_argument('--ui-evidence',type=Path)
p.add_argument('--terrain-evidence',type=Path)
p.add_argument('--fortress-evidence',type=Path)
p.add_argument('--worksites-evidence',type=Path)
p.add_argument('--motion-evidence',type=Path)
p.add_argument('--performance-evidence',type=Path)
p.add_argument('--completion-evidence',type=Path)
p.add_argument('--usability-evidence',type=Path)
a=p.parse_args();root=Path(__file__).resolve().parent.parent;out=root/a.output
digest=lambda data:hashlib.sha256(data).hexdigest()
report={'passed':False,'archives':{}}
try:
 packs=[]
 for target,name in [('h5','Yongchang1558-H5.zip'),('dora','Yongchang1558-Dora.zip')]:
  with zipfile.ZipFile(out/name) as archive:
   assert archive.testzip() is None,name
   receipt=json.loads(archive.read('BUILD.json'))
   assert set(archive.namelist())==set(receipt['files'])|{'BUILD.json'},'Unreceipted files: '+name
   for file,expected in receipt['files'].items():
    assert not any(part.startswith('.') or part in ['node_modules','__pycache__'] for part in Path(file).parts),file
    actual=archive.read(file)
    assert digest(actual)==expected,name+': '+file
    assert (out/target/file).read_bytes()==actual,'Unpacked file mismatch: '+file
   pack=archive.read('game.pck');assert digest(pack)==receipt['sha256'];packs.append(pack)
   for file,expected in receipt['sourceHashes'].items():
    assert digest((root/'game'/file).read_bytes())==expected,'Game source changed after build: '+file
   source_bytes=archive.read('SOURCE.zip')
   assert source_bytes==(out/'Yongchang1558-Source.zip').read_bytes()
   with zipfile.ZipFile(io.BytesIO(source_bytes)) as source:
    assert source.testzip() is None
    for file in ['game/project.godot','game/scripts/session.gd','game/assets/geometry.bin.z','scripts/build-platforms.py','src/voxelPrefabs.js','LICENSE','ASSET_LICENSE.md','THIRD_PARTY.md']:
     assert file in source.namelist(),file
    for file in source.namelist():
     assert source.read(file)==(root/file).read_bytes(),'Corresponding source mismatch: '+file
     assert '.godot/' not in file and '.agent/' not in file and '__pycache__/' not in file,file
   report['archives'][target]={'file':name,'bytes':(out/name).stat().st_size,'sha256':digest((out/name).read_bytes()),'pckSha256':receipt['sha256'],'files':len(archive.namelist())}
 assert packs[0]==packs[1],'Platform content differs'
 assert (out/'Yongchang1558-Dora.zip').read_bytes()==(out/'Yongchang1558-Dora.dora').read_bytes()
 report['pckSha256']=digest(packs[0]);report['pckBytes']=len(packs[0])
 if a.evidence:
  h5=json.loads((a.evidence/'h5-check/report.json').read_text('utf-8'))
  dora=json.loads((a.evidence/'native-check/dora-report.json').read_text('utf-8'))
  common=json.loads((root/'.build/common-report.json').read_text('utf-8'))
  assert h5['passed'] and dora['passed'] and common['passed'],'Failed runtime evidence'
  assert h5['pckSha256']==dora['pckSha256']==report['pckSha256'],'Evidence from another PCK'
  assert common['content_hash']==h5['initial']['content_hash']==dora['initial']['content_hash']
  for file,expected in common['sourceHashes'].items():assert digest((root/file).read_bytes())==expected,'Stale common rules evidence: '+file
  report['checks']={'common':len(common['checks']),'dora':len(dora['checks']),'h5RealInput':True,'touchEmulation':bool(h5.get('touchEmulation'))}
 if a.ui_evidence:
  ui=json.loads((a.ui_evidence/'report.json').read_text('utf-8'))
  assert ui['passed'] and ui['pckSha256']==report['pckSha256'],'UI evidence from another PCK or failed'
  assert len(ui['dora'])==12 and len(ui['web'])==4
  for states in ui['web'].values():
   for name,state in ui['dora'].items():
    assert state['uiHash']==states[name]['uiHash'],name
  report['uiParity']={'screens':12,'webConfigurations':4,'passed':True}
 if a.terrain_evidence:
  terrain=json.loads((a.terrain_evidence/'report.json').read_text('utf-8'))
  audit=json.loads((root/'.build/terrain/audit.json').read_text('utf-8'))
  assert terrain['passed'] and terrain['pckSha256']==report['pckSha256'],'Terrain runtime evidence mismatch'
  assert audit['passed'] and audit['contentHash']==digest((root/'game/assets/world.json').read_bytes())
  assert len(terrain['web'])==6 and len(terrain['dora'])==6
  report['terrain']={'viewsPerPlatform':7,'geometryChecks':len(audit['checks']),'passed':True}
 if a.fortress_evidence:
  fortress=json.loads((a.fortress_evidence/'all-report.json').read_text('utf-8'))
  live=json.loads((a.fortress_evidence/'live-economy/report.json').read_text('utf-8'))
  assert fortress['passed'] and live['passed'],'Fortress verification incomplete'
  for file,expected in fortress['sourceHashes'].items():assert digest((root/file).read_bytes())==expected,'Stale fortress evidence: '+file
  assert live['pckSha256']==report['pckSha256'] and live['initial']['content_hash']==fortress['content_hash'],'Fortress runtime evidence mismatch'
  assert live['staged'] is False and live['final']['state']=='victory' and live['attackAt']>=300
  report['fortress']={'checks':len(fortress['checks']),'normalEconomyRealInput':True,'attackAt':live['attackAt'],'victoryAt':live['final']['time']}
 if a.worksites_evidence:
  work=json.loads((a.worksites_evidence/'report.json').read_text('utf-8'))
  live=json.loads((a.worksites_evidence/'live/report.json').read_text('utf-8'))
  clearance=json.loads((a.worksites_evidence/'clearance.json').read_text('utf-8'))
  assert work['passed'] and live['passed'] and clearance['passed'],'Worksite acceptance incomplete'
  assert live['pckSha256']==report['pckSha256'],'Worksite runtime evidence from another PCK'
  for file,expected in work['sourceHashes'].items():assert digest((root/file).read_bytes())==expected,'Stale worksite evidence: '+file
  for file,expected in clearance['sourceHashes'].items():assert digest((root/file).read_bytes())==expected,'Stale clearance evidence: '+file
  report['worksites']={'checks':len(work['checks']),'clearanceChecks':len(clearance['checks']),'realInput':True,'deliveredStone':live['stoneDelivered'],'animatedJobs':live['animatedJobs']}
 if a.motion_evidence:
  physics=json.loads((a.motion_evidence/'physics/report.json').read_text('utf-8'))
  live=json.loads((a.motion_evidence/'live/report.json').read_text('utf-8'))
  assert physics['passed'] and live['passed'] and live['pckSha256']==report['pckSha256'],'Motion evidence incomplete or stale'
  for file,expected in physics['sourceHashes'].items():assert digest((root/file).read_bytes())==expected,'Stale motion evidence: '+file
  for name in ['work','walk']:
   capture=json.loads((a.motion_evidence/(name+'-capture.json')).read_text('utf-8'));assert capture['passed']
   for file,expected in capture['sources'].items():assert digest((root/file).read_bytes())==expected,'Stale motion capture: '+file
   for file,expected in capture['artifacts'].items():assert digest((a.motion_evidence/file).read_bytes())==expected,'Motion artifact changed: '+file
  report['motion']={'physicsChecks':len(physics['checks']),'renderedClips':2,'liveContacts':live['motionContact']}
 if a.performance_evidence:
  perf=a.performance_evidence
  check=json.loads((perf/'check/report.json').read_text('utf-8'))
  comparison=json.loads((perf/'comparison.json').read_text('utf-8'))
  assert check['passed'] and comparison['passed'],'Performance verification failed'
  assert len(comparison['scenarios'])==6 and all(s.get('fullStateMatches') for s in comparison['scenarios']),'Full simulation equality not verified'
  for file,expected in check['sourceHashes'].items():assert digest((root/file).read_bytes())==expected,'Stale performance checks: '+file
  for run in ['paired-b1','paired-b2']:
   native=json.loads((perf/run/'report.json').read_text('utf-8'))
   assert native['passed'] and native['deterministic']
   for file,expected in native['sourceHashes'].items():assert digest((root/'game'/file).read_bytes())==expected,'Stale performance run: '+file
  for run in ['web-b1','web-b2']:
   web=json.loads((perf/run/'report.json').read_text('utf-8'))
   assert web['passed'] and web['pckSha256']==report['pckSha256'],'Web performance from another PCK'
  report['performance']={'nativeScenarios':6,'interleavedRuns':4,'webRuns':2,'equivalenceChecks':len(check['checks']),'sharedMachine':True}
 if a.completion_evidence:
  rules=json.loads((a.completion_evidence/'archive/report.json').read_text('utf-8'))
  live=json.loads((a.completion_evidence/'completion/report.json').read_text('utf-8'))
  assert rules['passed'] and live['passed'] and live['pckSha256']==report['pckSha256'],'Save/layout evidence incomplete or stale'
  for file,expected in rules['sourceHashes'].items():assert digest((root/file).read_bytes())==expected,'Stale archive evidence: '+file
  report['completion']={'archiveChecks':len(rules['checks']),'realInputChecks':len(live['checks']),'phoneAccepted':False}
 if a.usability_evidence:
  folder=a.usability_evidence
  rules=json.loads((folder/'rules/report.json').read_text('utf-8'))
  inputs=json.loads((folder/'input/report.json').read_text('utf-8'))
  defeat=json.loads((folder/'live-defeat/report.json').read_text('utf-8'))
  victory=json.loads((folder/'fortress/live-economy/report.json').read_text('utf-8'))
  assert all(r['passed'] for r in [rules,inputs,defeat,victory]),'Usability verification incomplete'
  for r in [inputs,defeat,victory]:assert r['pckSha256']==report['pckSha256'],'Usability evidence from another PCK'
  for file,expected in rules['sourceHashes'].items():assert digest((root/file).read_bytes())==expected,'Stale usability rules: '+file
  assert not defeat['staged'] and defeat['final']['state']=='defeat' and defeat['replayed']['state']=='play'
  assert not victory['staged'] and victory['final']['state']=='victory' and victory['replayed']['state']=='play'
  report['usability']={'ruleChecks':len(rules['checks']),'realInputChecks':len(inputs['checks']),'victoryAndDefeatReplay':True,'smallScreenReview':inputs['smallScreen'],'phoneAccepted':False}
 report['passed']=True
finally:
 (out/'VALIDATION.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
