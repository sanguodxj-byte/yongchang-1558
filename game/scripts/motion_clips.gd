extends RefCounted
## Authored work poses: time, right grip, pitch, yaw, chest lean.
## Each stroke has a slow lift, brief impact hold, and a slower recovery.
const WORK={
	"axe":{"duration":1.55,"roll":-PI/2,"support":-.14,"tip":Vector3(.17,0,.31),"keys":[
		[0.0,Vector3(.04,.62,.26),.65,0.0,.16],
		[.18,Vector3(.08,.72,.23),-.35,-.08,.08],
		[.43,Vector3(.07,.78,.21),-1.05,-.08,-.03],
		[.58,Vector3(.04,.62,.30),.72,.02,.23],
		[.64,Vector3(.04,.62,.30),.72,.02,.23],
		[.84,Vector3(.08,.62,.28),.40,0.0,.15],
		[1.0,Vector3(.04,.62,.26),.65,0.0,.16]]},
	"pickaxe":{"duration":1.70,"roll":-PI/2,"support":-.14,"tip":Vector3(.23,0,.32),"keys":[
		[0.0,Vector3(.08,.60,.25),.40,0.0,.16],
		[.20,Vector3(.08,.73,.22),-.50,0.0,.06],
		[.43,Vector3(.095,.79,.22),-1.05,0.0,-.02],
		[.59,Vector3(.08,.60,.28),.55,0.0,.24],
		[.65,Vector3(.08,.60,.28),.55,0.0,.24],
		[.85,Vector3(.08,.61,.25),.20,0.0,.12],
		[1.0,Vector3(.08,.60,.25),.40,0.0,.16]]},
	"hammer":{"duration":1.15,"roll":-PI/2,"support":0.0,"tip":Vector3(.09,0,.30),"keys":[
		[0.0,Vector3(.13,.61,.24),.35,0.0,.12],
		[.40,Vector3(.14,.78,.18),-.65,0.0,.02],
		[.57,Vector3(.12,.62,.28),.60,0.0,.20],
		[.65,Vector3(.12,.62,.28),.60,0.0,.20],
		[1.0,Vector3(.13,.61,.24),.35,0.0,.12]]},
	"sickle":{"duration":1.75,"roll":0.0,"support":0.0,"tip":Vector3(.14,0,.46),"keys":[
		[0.0,Vector3(.15,.51,.22),.48,.55,.32],
		[.22,Vector3(.16,.53,.23),.40,.62,.28],
		[.54,Vector3(.03,.49,.27),.48,-.60,.40],
		[.66,Vector3(.03,.49,.27),.48,-.60,.40],
		[.86,Vector3(.14,.56,.20),.20,.22,.26],
		[1.0,Vector3(.15,.51,.22),.48,.55,.32]]},
	"saw":{"duration":1.20,"roll":-PI/2,"support":0.0,"tip":Vector3(.055,0,.23),"keys":[
		[0.0,Vector3(.10,.55,.17),.08,0.0,.26],
		[.46,Vector3(.10,.55,.30),.08,0.0,.30],
		[.53,Vector3(.10,.55,.30),.08,0.0,.30],
		[1.0,Vector3(.10,.55,.17),.08,0.0,.26]]},
	"ladle":{"duration":2.35,"roll":0.0,"support":0.0,"tip":Vector3(0,-.04,.37),"keys":[
		[0.0,Vector3(.11,.60,.21),.55,.15,.16],
		[.26,Vector3(.11,.55,.25),.72,-.22,.26],
		[.50,Vector3(.16,.55,.25),.72,.22,.26],
		[.72,Vector3(.13,.64,.21),.10,.15,.13],
		[.86,Vector3(.13,.64,.21),.10,.15,.13],
		[1.0,Vector3(.11,.60,.21),.55,.15,.16]]}
}

static func sample(kind:String,phase:float) -> Dictionary:
	var clip:Dictionary=WORK[kind];var keys:Array=clip.keys;var p=fposmod(phase,1.0)
	for i in range(1,keys.size()):
		if p<=keys[i][0]:
			var a=keys[i-1];var b=keys[i];var t=smoothstep(a[0],b[0],p)
			return {"grip":a[1].lerp(b[1],t),"pitch":lerpf(a[2],b[2],t),"yaw":lerpf(a[3],b[3],t),"lean":lerpf(a[4],b[4],t),"roll":clip.roll,"support":clip.support}
	return {}

static func lift(phase:float) -> float:
	var keys=[[0.0,0.0],[.20,.045],[.48,.095],[.78,.045],[1.0,0.0]]
	for i in range(1,keys.size()):
		if phase<=keys[i][0]:return lerpf(keys[i-1][1],keys[i][1],smoothstep(keys[i-1][0],keys[i][0],phase))
	return 0.0
