extends SceneTree
const Separation=preload("res://scripts/unit_separation.gd")
const Session=preload("res://scripts/session.gd")
const Probe=preload("res://scripts/performance_probe.gd")
var checks=[]
var failed=false
var output=""

class Ground:
	extends RefCounted
	var occupied={Vector2i(0,1):true,Vector2i(-2,-1):true}
	func grid(p:Vector3):return Vector2i(floori(p.x),floori(p.z))
	func cell(p:Vector2i):return {"walkable":p!=Vector2i(1,0)}
	func elevation(p:Vector3):return .25+p.x*.05+p.z*.03

func check(label:String,ok:bool,detail:Variant=null):
	checks.append({"name":label,"passed":ok,"detail":detail});failed=failed or not ok
	print("PERF CHECK ",label," ",ok)

func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):output=arg.trim_prefix("--report=")
	call_deferred("run")

# Retained original all-pairs equations: independent reference for the broad phase.
func reference_separation(session,actors:Array):
	for i in actors.size():
		var a=actors[i]
		if a.dead or a.get("transit",false) or a.get("garrison",0):continue
		for j in range(i+1,actors.size()):
			var b=actors[j]
			if b.dead or b.get("transit",false) or b.get("garrison",0):continue
			var delta=Vector2(a.x-b.x,a.z-b.z);var distance=delta.length();var radius=.44 if a.get("role","")!="knight" and not a.get("ox",false) else .7
			if distance<radius:
				var direction=delta/distance if distance>.0001 else Vector2.RIGHT.rotated(float(a.id+b.id))
				var shove=direction*(radius-distance)*.2
				for pair in [[a,shove],[b,-shove]]:
					var n=Vector3(pair[0].x+pair[1].x,pair[0].y,pair[0].z+pair[1].y)
					var nc=session.cell(session.grid(n))
					if nc.get("walkable",nc.get("ground","water")!="water") and not session.occupied.has(session.grid(n)):
						pair[0].x=n.x;pair[0].z=n.z;pair[0].y=session.elevation(n)

func reference_nearest(s,u,radius):
	var result={};var best=radius
	for v in s.units:
		if v.dead or v.transit or v.team==u.team or (v.role=="lord" and v.garrison):continue
		var d=s.pos(v).distance_to(s.pos(u))
		if d<best:best=d;result=v
	return result

func reference_structure(s,u,radius,forts):
	var result={};var best=radius;var priority=99
	for v in s.structures:
		if v.dead or v.team==u.team:continue
		var d=Vector2(maxf(0,absf(v.x-u.x)-v.half.hx),maxf(0,absf(v.z-u.z)-v.half.hz)).length()
		var rank={"ballista":0,"tower":1,"gate":2,"wall":3,"keep":4}.get(v.type,5) if forts else 0
		if d<radius and (rank<priority or (rank==priority and d<best)):best=d;priority=rank;result=v
	return result

func run():
	var rng=RandomNumberGenerator.new();rng.seed=839273
	var ground=Ground.new()
	for scene in 36:
		var actors=[]
		for i in 90:
			var span=[0.0,.15,1.1,3.0,20.0,100.0][scene%6]
			actors.append({"id":i+1,"x":rng.randf_range(-span,span)+.99999,"y":.25,"z":rng.randf_range(-span,span)-.00001,"dead":i%13==0,"transit":i%17==0,"garrison":1 if i%19==0 else 0,"role":"knight" if i%5==0 else "spearman","ox":i%7==0})
		var expected=actors.duplicate(true);var same=true
		for step in 12:
			reference_separation(ground,expected);Separation.apply(ground,actors)
			if actors!=expected:same=false;break
		check("separation identical scene %d"%scene,same)
	var s=Session.new(JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json")))
	for i in 20:s.create_squad("archer" if i%3==0 else "spearman","player" if i%2==0 else "enemy",s.world([45+i%4,55+i/4]),true)
	var all_queries=true
	for step in 4:
		for i in s.units.size():
			var u=s.units[i]
			u.dead=step==1 and i%5==0;u.transit=step==2 and i%3==0
			for radius in [.001,1.0,4.1,14.0,30.0,1000.0]:
				all_queries=all_queries and s.nearest_enemy(u,radius).get("id",0)==reference_nearest(s,u,radius).get("id",0)
				for forts in [false,true]:all_queries=all_queries and s.closest_structure(u,radius,forts).get("id",0)==reference_structure(s,u,radius,forts).get("id",0)
	check("indexed targets preserve order, exclusions and range",all_queries)
	var indices=true
	for u in s.squads:indices=indices and s.squad_index.get(u.id)==u
	for structure in s.structures:indices=indices and s.structure_by_id(structure.id)==structure
	check("spawned squads and initial structures indexed",indices)
	s.res.wood=1000;var built=s.build("farm",Vector2i(47,54));var newest=s.structures[-1]
	check("construction indexed",built and s.structure_by_id(newest.id)==newest and newest in s.structures_by_team.player)
	s.destroy(newest);check("destroyed lookup retains dead flag",s.structure_by_id(newest.id).dead)
	var p=Probe.new()
	for i in 12:
		await process_frame
		p.begin();p.mark();p.mark();OS.delay_usec(8000);p.mark();p.mark();p.finish()
		await RenderingServer.frame_post_draw
	check("probe observes actual drawn frames",p.rows.size()==12 and p.rows[-1][-1]>p.rows[0][-1],p.rows.size())
	var attributed=true
	for row in p.rows:
		attributed=attributed and row[5]>=8.0 and absf(row[7]-row[3]-row[4]-row[5]-row[6])<.1
	check("known 8 ms delay attributed to visuals",attributed)
	p.dispose()
	FileAccess.open(output,FileAccess.WRITE).store_string(JSON.stringify({"passed":not failed,"checks":checks},"  "))
	quit(1 if failed else 0)
