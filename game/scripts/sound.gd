extends RefCounted

var enabled=true
var host: Node
var streams={}
var cooldown={}

func _init(parent: Node):
	host=parent

func play(kind: String):
	if not enabled:return
	var now=Time.get_ticks_msec()
	if now-int(cooldown.get(kind,0))<80:return
	cooldown[kind]=now
	if not streams.has(kind):streams[kind]=synth(kind)
	var player=AudioStreamPlayer.new();player.stream=streams[kind];player.volume_db=-7
	host.add_child(player);player.finished.connect(player.queue_free);player.play()

func synth(kind: String) -> AudioStreamWAV:
	var sample_rate=22050
	var seconds={"place":.1,"hit":.08,"arrow":.1,"boom":.4,"bell":1.0,"fire":.45,"horn":1.0,"scan":.6}.get(kind,.2)
	var bytes=PackedByteArray();bytes.resize(int(sample_rate*seconds)*2)
	var phase=0.0
	var random=RandomNumberGenerator.new();random.seed=1558
	for i in bytes.size()/2:
		var t=float(i)/sample_rate;var value=0.0
		match kind:
			"boom","fire":value=random.randf_range(-1,1)*exp(-t/(.095 if kind=="boom" else .15))*.5
			"bell":
				for f in [261.63,392.0,554.37,622.25]:value+=sin(TAU*f*t)*exp(-t*6)*.12
				value+=sin(TAU*70*t)*exp(-t*18)*.25
			"horn":
				var notes=[293.66,329.63,392.0,440.0,587.33];var n=mini(4,int(t/.13))
				phase+=TAU*notes[n]/sample_rate;value=sin(phase)*minf(1,(t-n*.13)*35)*exp(-maxf(0,t-.65)*7)*.3
			"scan":
				for n in 3:
					var age=t-n*.06
					if age>=0:value+=sin(TAU*[587.33,880.0,1174.66][n]*age)*exp(-age*12)*.15
			_:
				var f=lerpf(480 if kind=="arrow" else 220,65,clampf(t/seconds,0,1))
				phase+=TAU*f/sample_rate;value=sin(phase)*exp(-t/seconds*6)*.35
		bytes.encode_s16(i*2,int(clampf(value,-1,1)*32760))
	var stream=AudioStreamWAV.new();stream.format=AudioStreamWAV.FORMAT_16_BITS;stream.mix_rate=sample_rate;stream.data=bytes
	return stream
