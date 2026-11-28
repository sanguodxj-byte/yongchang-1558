extends SceneTree
const Session=preload("res://scripts/session.gd")
const Separation=preload("res://scripts/unit_separation.gd")
var checks=[]
var output=""

func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):output=arg.trim_prefix("--report=")
	call_deferred("run")

func record(label:String,passed:bool,detail):
	checks.append({"name":label,"passed":passed,"detail":detail});print(label," ",passed," ",detail)

func run():
	var source=JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"))
	var s=Session.new(source);s.state="play";s.training=true
	var squads=[]
	for i in 6:squads.append(s.create_squad("spearman","player",s.world([45+i%3,57+i/3*2]),true))
	for i in squads.size():s.command_squad(squads[i],s.world([46+i%3*3,60+i/3*3]))
	var max_tail_motion=0.0;var min_distance=INF;var overlap_samples=0
	for step in 30*35:
		var before={}
		for q in squads:
			for u in q.members:before[u.id]=s.pos(u)
		s.step(1.0/30)
		if step<30*25:continue
		var actors=[]
		for q in squads:
			for u in q.members:
				actors.append(u);max_tail_motion=maxf(max_tail_motion,s.pos(u).distance_to(before[u.id]))
		for i in actors.size():
			for j in range(i+1,actors.size()):
				var d=Vector2(actors[i].x-actors[j].x,actors[i].z-actors[j].z).length();min_distance=minf(min_distance,d)
				if d<.50:overlap_samples+=1
	record("stationary formations do not shuffle",max_tail_motion<.006,max_tail_motion)
	record("infantry body clearance after arrival",overlap_samples==0,{"minDistance":min_distance,"overlaps":overlap_samples})
	var coincident=[]
	for i in 12:
		var at=s.world([46,60]);var u=s.spawn_unit("spearman","player",at);u.x=at.x;u.z=at.z;u.manual_hold=true;coincident.append(u)
	for i in 90:Separation.apply(s,coincident)
	var minimum=INF
	for i in coincident.size():
		for j in range(i+1,coincident.size()):minimum=minf(minimum,s.pos(coincident[i]).distance_to(s.pos(coincident[j])))
	record("coincident spawn depenetrates",minimum>=.50,minimum)
	var push_walk=0.0
	for a in coincident:
		a.render_from=s.pos(a);a.render_motion_from=0.0;a.move_intent=Vector3.ZERO;a.motion_distance=0.0
	coincident[0].x=coincident[1].x;coincident[0].z=coincident[1].z
	Separation.apply(s,coincident)
	for a in coincident:push_walk+=a.motion_distance
	record("collision correction does not drive walk cycle",push_walk==0,push_walk)
	var mixed=[{"id":10001,"role":"spearman","dead":false,"x":-65.0,"y":.4,"z":12.0},{"id":10002,"role":"ram","dead":false,"x":-64.8,"y":.4,"z":12.0}]
	for i in 40:Separation.apply(s,mixed)
	var gap=s.pos(mixed[0]).distance_to(s.pos(mixed[1]))
	record("large vehicle respects combined body radii",gap>=.86,gap)
	var crossing=Session.new(source);crossing.state="play";crossing.training=true;var traffic=[]
	for side in 2:
		for i in 2:
			var q=crossing.create_squad("spearman","player",crossing.world([43+side*8,58+i*2]),true)
			crossing.command_squad(q,crossing.world([51-side*8,58+i*2]));traffic.append(q)
	var penetration=0.0;var drift=0.0
	for step in 600:
		crossing.step(1.0/30)
		var list=[]
		for q in traffic:list.append_array(q.members)
		for i in list.size():
			for j in range(i+1,list.size()):
				var d=Vector2(list[i].x-list[j].x,list[i].z-list[j].z).length();penetration=maxf(penetration,.51-d)
			if step>500:drift=maxf(drift,crossing.pos(list[i]).distance_to(list[i].render_from))
	record("opposing moving crowds retain body clearance",penetration<.065,penetration)
	record("crossing crowd settles after orders",drift<.008,drift)
	var village=Session.new(source);village.state="play";village.training=true
	var initial_people=village.civilians.map(func(u):return village.pos(u))
	for step in 300:village.step(1.0/30)
	var village_gap=INF;var idle_drift=0.0
	for i in village.civilians.size():
		var actor=village.civilians[i]
		if i<initial_people.size():idle_drift=maxf(idle_drift,village.pos(actor).distance_to(initial_people[i]))
		for other in village.units+village.workers+village.civilians:
			if other.id==actor.id or other.dead or other.get("transit",false) or other.get("garrison",0):continue
			village_gap=minf(village_gap,Vector2(actor.x-other.x,actor.z-other.z).length()-Separation.radius(actor)-Separation.radius(other))
	record("idle villagers have legal nonoverlapping bodies",village_gap>=-.0061 and village.civilians.all(func(u):return Separation.can_stand(village,u,village.pos(u))),village_gap)
	record("population growth does not reshuffle idle villagers",idle_drift<.006,idle_drift)
	var camp=village.world(village.map.campfire)
	var passing=village.create_squad("spearman","player",village.apron(camp+Vector3(-4,0,0),"player"),true)
	var passing_starts=passing.members.map(func(u):return village.pos(u))
	village.command_squad(passing,village.apron(camp+Vector3(4,0,0),"player"))
	var destinations=passing.members.map(func(u):return village.apron(passing.order+u.command_slot,"player"))
	for step in 900:village.step(1.0/30)
	var idle_overlap=0.0
	for actor in village.civilians:
		for other in passing.members:idle_overlap=maxf(idle_overlap,.51-Vector2(actor.x-other.x,actor.z-other.z).length())
	var closest_travel=INF;var goal_error=0.0
	for i in passing.members.size():
		closest_travel=minf(closest_travel,village.pos(passing.members[i]).distance_to(passing_starts[i]))
		goal_error=maxf(goal_error,village.pos(passing.members[i]).distance_to(destinations[i]))
	record("troops pass villagers without occupying their bodies",idle_overlap<.02 and closest_travel>3.5 and goal_error<1.1,{"overlap":idle_overlap,"minTravel":closest_travel,"maxGoalError":goal_error})
	var tower=source.structures.filter(func(b):return b.type=="tower")[0];var slot_gap=INF
	for i in 4:
		for j in range(i+1,4):slot_gap=minf(slot_gap,village.garrison_slot(tower,i).distance_to(village.garrison_slot(tower,j)))
	record("tower slots clear infantry body width",slot_gap>=.51,slot_gap)
	var passed=checks.all(func(c):return c.passed)
	FileAccess.open(output,FileAccess.WRITE).store_string(JSON.stringify({"passed":passed,"checks":checks},"  "));quit(0 if passed else 1)
