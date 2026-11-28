extends SceneTree
const Sound=preload("res://scripts/sound.gd")
var output=""
func _initialize():
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--report="):output=a.trim_prefix("--report=")
	call_deferred("run")
func run():
	var host=Node.new();root.add_child(host);var audio=Sound.new(host);var checks=[]
	var valid=true;var peaks={}
	for kind in audio.streams:
		var peak=0;var dc=0.0
		for stream in audio.streams[kind]:
			for i in stream.data.size()/2:
				var v=stream.data.decode_s16(i*2);peak=maxi(peak,absi(v));dc+=v
			valid=valid and stream.mix_rate==44100 and stream.data.size()>0 and peak<32000
		peaks[kind]=peak/32768.0
	checks.append({"name":"synthesized cues have headroom and nonempty 44.1kHz variants","passed":valid,"peaks":peaks})
	var session={"state":"play","stance":"defend","night":false}
	audio.update(.1,session,Vector3.ZERO)
	checks.append({"name":"village music starts","passed":audio.music_kind=="village" and audio.music[audio.music_slot].stream!=null})
	session.night=true
	for i in 40:audio.update(.1,session,Vector3.ZERO)
	checks.append({"name":"night crossfades to watch cue","passed":audio.music_kind=="watch"})
	session.stance="attack"
	for i in 40:audio.update(.1,session,Vector3.ZERO)
	checks.append({"name":"attack selects battle cue","passed":audio.music_kind=="battle"})
	session.state="pause"
	for i in 40:audio.update(.1,session,Vector3.ZERO)
	checks.append({"name":"pause preserves the current score at a softer level","passed":audio.music_kind=="battle" and audio.music[audio.music_slot].volume_db==-29})
	session.state="play"
	for i in 200:audio.update(.12,session,Vector3.ZERO);audio.play("boom",Vector3.ZERO)
	checks.append({"name":"sound voice allocation remains bounded","passed":host.get_child_count()==14})
	audio.enabled=false
	for i in 40:audio.update(.1,session,Vector3.ZERO)
	checks.append({"name":"mute silences effects and music","passed":audio.voices.all(func(v):return not v.playing) and audio.music.all(func(v):return v.volume_db<=-79)})
	var report={"passed":checks.all(func(c):return c.passed),"checks":checks}
	FileAccess.open(output,FileAccess.WRITE).store_string(JSON.stringify(report,"  "));print(JSON.stringify(report));host.queue_free();await process_frame;quit(0 if report.passed else 1)
