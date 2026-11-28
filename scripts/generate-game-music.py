"""Generate three original instrumental cues with the local build-music service."""
import base64,datetime,hashlib,json,re,subprocess,time
from pathlib import Path
import requests

root=Path(__file__).resolve().parent.parent
out=root/'game/assets/music';out.mkdir(parents=True,exist_ok=True)
records=root/'content/music';records.mkdir(parents=True,exist_ok=True)
raw=root/'.build/music-generation';raw.mkdir(parents=True,exist_ok=True)
tracks=[
 ('village','乡土晨炊','Original instrumental strategy-game music, 90 seconds. A peaceful Ming-era southeast Chinese coastal village rebuilding its home. Warm guqin plucked phrases, delicate pipa, soft xiao bamboo flute, very subtle sheng sustained harmony and quiet wooden percussion. 72 BPM, unhurried pentatonic melody, breathing room, restrained bass, detailed acoustic timbres, intimate and grounded. Develop a memorable four-note motif, two gentle variations, a quiet return. Music for sustained resource management; never sentimental melodrama. No vocals, no choir, no spoken words, no synth lead, no electric guitar, no huge trailer drums. Clear balanced recording, no clipping, no sudden loud intro. A naturally resolving beginning and ending suitable for repeated game playback.'),
 ('watch','烽堠守望','Original instrumental music for a historical Chinese coastal defence strategy game, 90 seconds. Twilight watch above stone walls at Yongchang, vigilance and shared resolve. Low guqin ostinato, xiao and sheng answering phrases, small Chinese frame drum and muted bronze chime accents, restrained bowed strings. 88 BPM. Begin spare and quietly purposeful, build measured tension without a sudden drop or jump scare, release into the same four-note pentatonic home motif. Wood, breath and bronze textures, broad but transparent sound with room for battle sound effects. No vocals, no chanting, no modern drum kit, no electronic arpeggiator, no blockbuster brass. No hard cut at either end; graceful phrase ending.'),
 ('battle','破浪归航','Original instrumental action-strategy game score, 90 seconds, historical Chinese coastal battle. Resolute disciplined energy, coordinated soldiers crossing the sea to break a fortress, heroic but not bombastic. Pipa rhythmic figures, low bowed strings, Chinese war drums in steady measured patterns, sheng and dizi melody, sparse bronze percussion. 112 BPM with a memorable pentatonic theme and alternating dense and open phrases. Controlled low end, warm midrange, little piercing high-frequency energy, leave space for cannons and commands. Build toward a brief hopeful cadence and a clean musical resolution. No vocals, no choir, no speech, no electric guitars, no EDM, no modern snare rolls, no wall of trailer impacts.')]
status=requests.get('http://127.0.0.1:2048/api/status',timeout=20);status.raise_for_status();assert status.json().get('ready')
manifest={'model':'lyria-3.5','provider':'Local AIStudio2API','postprocessing':'None; decoded audio bytes stored unchanged','tracks':[]}
for key,title,prompt in tracks:
 path=out/(key+'.mp3');record=records/(key+'.json')
 if path.exists() and record.exists():manifest['tracks'].append(json.loads(record.read_text('utf-8')));continue
 payload={'model':'lyria-3.5','messages':[{'role':'user','content':prompt}]}
 (raw/(key+'-request.json')).write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
 print('GENERATING',title,flush=True);start=time.monotonic()
 response=requests.post('http://127.0.0.1:2048/v1/chat/completions',json=payload,timeout=300)
 (raw/(key+'-response.json')).write_bytes(response.content);response.raise_for_status()
 content=response.json()['choices'][0]['message']['content'];match=re.search(r'data:audio/(?:mpeg|mp3);base64,([A-Za-z0-9+/=\r\n]+)',content);assert match,'No MP3 returned'
 data=base64.b64decode(match.group(1));path.write_bytes(data)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
 item={'id':key,'title':title,'model':'lyria-3.5','prompt':prompt,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-start,2),'file':path.relative_to(root).as_posix(),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'duration':float(probe['format']['duration']),'postprocessing':'None','humanListeningApproved':False}
 record.write_text(json.dumps(item,ensure_ascii=False,indent=2),encoding='utf-8');manifest['tracks'].append(item)
 (records/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 print('SAVED',title,item['duration'],len(data),flush=True)
