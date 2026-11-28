extends RefCounted
## Bounded sound voices and state-driven music. Generated MP3 bytes stay untouched.
const MUSIC={"village":"res://assets/music/village.mp3","watch":"res://assets/music/watch.mp3","battle":"res://assets/music/battle.mp3"}
const GAINS={"place":-12.0,"hit":-17.0,"arrow":-17.0,"boom":-13.0,"bell":-16.0,"fire":-19.0,"horn":-15.0,"scan":-21.0}
var enabled=true
var host:Node
var streams={}
var cooldown={}
var voices:Array[AudioStreamPlayer]=[]
var music:Array[AudioStreamPlayer]=[]
var music_slot=0
var music_kind=""
var desired_kind=""
var music_dwell=0.0
var clock=0.0
var serial=0
var listener=Vector3.ZERO
var spatial_origin=Vector3.INF

func snapshot() -> Dictionary:
	return {"enabled":enabled,"music":music_kind,"musicPlaying":music[music_slot].playing if not music.is_empty() else false,"musicDb":music[music_slot].volume_db if not music.is_empty() else -80,"voices":voices.filter(func(v):return v.playing).size(),"voiceCapacity":voices.size(),"outputPeakDb":AudioServer.get_bus_peak_volume_left_db(0,0)}

func _init(parent:Node):
	host=parent
	for kind in GAINS:
		streams[kind]=[]
		for variation in 3:streams[kind].append(synth(kind,variation))
	for i in 12:
		var player=AudioStreamPlayer.new();player.name="SoundVoice"+str(i);host.add_child(player);voices.append(player)
	for i in 2:
		var player=AudioStreamPlayer.new();player.name="Music"+str(i);player.volume_db=-80;host.add_child(player);music.append(player)

func update(dt:float,session,camera:Vector3):
	clock+=dt;listener=camera
	var target="village"
	if session.state in ["play","pause"]:target="battle" if session.stance=="attack" else "watch" if session.night else "village"
	if target!=desired_kind:desired_kind=target;music_dwell=0
	else:music_dwell+=dt
	if target!=music_kind and (music_kind=="" or music_dwell>3):
		var stream=load(MUSIC[target]) as AudioStreamMP3
		if stream:
			stream.loop=true;music_slot=1-music_slot;music[music_slot].stream=stream;music[music_slot].volume_db=-80;music[music_slot].play();music_kind=target
	for i in 2:
		var goal=-24.0 if enabled and i==music_slot else -80.0
		if session.state=="pause":goal-=5
		music[i].volume_db=move_toward(music[i].volume_db,goal,dt*30)
		if i!=music_slot and music[i].volume_db<=-79:music[i].stop()
	if not enabled:
		for voice in voices:voice.stop()

func play(kind:String,at:Vector3=Vector3.INF):
	if not enabled or not streams.has(kind):return
	var interval=.11 if kind in ["boom","hit","arrow"] else .07
	if clock-float(cooldown.get(kind,-100))<interval:return
	var distance=0.0 if at==Vector3.INF else Vector2(at.x-listener.x,at.z-listener.z).length()
	if distance>65:return
	cooldown[kind]=clock
	var player:AudioStreamPlayer=null
	for voice in voices:
		if not voice.playing:player=voice;break
	if player==null:
		if kind not in ["place","horn","bell"]:return
		player=voices[serial%voices.size()]
	serial+=1;player.stream=streams[kind][serial%3];player.pitch_scale=1.0
	player.volume_db=GAINS[kind]-minf(20,distance*.32);player.play()

func synth(kind:String,variation=0) -> AudioStreamWAV:
	var rate=44100;var seconds={"place":.22,"hit":.26,"arrow":.34,"boom":1.15,"bell":1.35,"fire":.75,"horn":1.25,"scan":.18}.get(kind,.2)
	var bytes=PackedByteArray();bytes.resize(int(rate*seconds)*2)
	var rng=RandomNumberGenerator.new();rng.seed=1558+variation*117;var low=0.0;var phase=0.0
	for i in bytes.size()/2:
		var t=float(i)/rate;var noise=rng.randf_range(-1,1);low=lerpf(low,noise,.09);var v=0.0;var k=1+variation*.035
		match kind:
			"boom":
				v=sin(TAU*(49*k*t+15*(1-exp(-t*10))))*exp(-t*6)*.48+low*exp(-t*3.6)*.45+noise*exp(-t*85)*.10
			"hit":
				v=noise*exp(-t*58)*.22+sin(TAU*173*k*t)*exp(-t*28)*.30+sin(TAU*701*k*t)*exp(-t*45)*.055
			"arrow":
				v=noise*exp(-t*90)*.17+low*exp(-t*16)*.20+sin(TAU*93*k*t)*exp(-t*32)*.22
			"place":
				v=sin(TAU*132*k*t)*exp(-t*31)*.36+low*exp(-t*19)*.24
				if t>.055:v+=sin(TAU*210*k*(t-.055))*exp(-(t-.055)*40)*.14
			"bell":
				for f in [261.63,523.26,706.4,1046.5]:v+=sin(TAU*f*t)*exp(-t*(2.4+f*.002))*.10
			"horn":
				var notes=[293.66,329.63,392.0,440.0,587.33];var n=mini(4,int(t/.18));phase+=TAU*notes[n]/rate
				var env=minf(1,(t-n*.18)*35)*exp(-maxf(0,t-.9)*6);v=(sin(phase)*.25+sin(phase*2)*.055+sin(phase*3)*.025)*env
			"fire":v=low*.35*exp(-t*3)+(noise*.09 if noise>.93 else 0)*exp(-t*5)
			"scan":v=sin(TAU*440*t)*exp(-t*27)*.16+sin(TAU*660*t)*exp(-t*38)*.055
		var fade=minf(1,t/.003)*minf(1,(seconds-t)/.025)
		bytes.encode_s16(i*2,int(clampf(v*fade,-.9,.9)*32760))
	var stream=AudioStreamWAV.new();stream.format=AudioStreamWAV.FORMAT_16_BITS;stream.mix_rate=rate;stream.data=bytes
	return stream
