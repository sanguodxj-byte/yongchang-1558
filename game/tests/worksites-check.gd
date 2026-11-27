extends SceneTree
const Session=preload("res://scripts/session.gd")
const Assets=preload("res://scripts/assets.gd")
const Rig=preload("res://scripts/unit_rig.gd")
var checks=[]

func check(label:String,ok:bool,detail:Variant=null):
	checks.append({"name":label,"passed":ok,"detail":detail});print(label,": ",ok," ",detail)

func place(s,kind:String,around:Vector2i,radius:int=4) -> Dictionary:
	for r in range(radius+1):
		for x in range(-r,r+1):
			for z in range(-r,r+1):
				if s.build(kind,around+Vector2i(x,z)):return s.occupied[around+Vector2i(x,z)]
	return {}

func funded(data):
	var s=Session.new(data)
	for key in ["wood","stone","gold"]:s.res[key]=1000
	return s

func _initialize():call_deferred("run")

func run():
	var assets=Assets.new();var data=assets.data
	check("storage and ox post are separate build cards",data.buildings.has("stockpile") and data.buildings.has("oxPost"))
	var probe=assets.model("player_unit_peasant")
	check("export preserves nested humanoid joints",probe.has_meta("rightArm"));probe.free()
	if not data.buildings.has("oxPost") or not data.buildings.has("stockpile"):finish();return
	var s=funded(data);var at=Vector2i(47,54);var wood=s.res.wood;var stone=s.res.stone
	check("build storage",s.build("stockpile",at))
	var yard=s.occupied.get(at,{})
	check("storage reserves all four cells",yard.get("cells",[]).size()==4 and s.occupied.get(at+Vector2i(1,1),{})==yard)
	check("storage cost charged once",s.res.wood==wood-8 and s.res.stone==stone-4)
	var paid=s.res.duplicate();check("reject overlap without payment",not s.build("farm",at+Vector2i(1,1)) and s.res==paid)
	check("nearest reachable depot",s._storage_route(s.world([49,56])).get("id",0)==yard.get("id",-1))
	var surround=[]
	for x in range(46,50):surround.append(Vector2i(x,53));surround.append(Vector2i(x,56))
	for z in range(54,56):surround.append(Vector2i(46,z));surround.append(Vector2i(49,z))
	for edge in surround:check("depot enclosure "+str(edge),s.build("wall",edge))
	check("enclosed depot cannot receive through walls",s._storage_route(s.world([50,57])).get("id",0)!=yard.id)
	s.build("demolish",Vector2i(49,55))
	check("opening an entrance restores depot access",s._storage_route(s.world([50,57])).get("id",0)==yard.id)
	check("new depot can be demolished",s.build("demolish",at+Vector2i(1,1)) and yard.dead and not s.occupied.has(at))
	check("demolished depot is not a destination",s._storage_route(s.world([49,56])).get("id",0)!=yard.id)
	var normal=funded(data);var boosted=funded(data)
	var q0=place(normal,"quarry",Vector2i(19,39));var q1=place(boosted,"quarry",Vector2i(19,39))
	check("identical standalone stoneworks",not q0.is_empty() and not q1.is_empty() and q0.gx==q1.gx and q0.gz==q1.gz)
	if q0.is_empty() or q1.is_empty():finish();return
	normal._workers(.1);check("quarry does not grant a free cart",normal.workers.size()==1 and not normal.workers[0].ox)
	var post=place(boosted,"oxPost",Vector2i(q1.gx+3,q1.gz+2),5)
	check("independent ox post placement",not post.is_empty())
	boosted._workers(.1)
	check("post binds a nearby stoneworks",q1.get("ox_post",0)==post.get("id",-1) and boosted.workers.filter(func(w):return w.ox).size()==1)
	var second=place(boosted,"oxPost",Vector2i(q1.gx+5,q1.gz+2),5);boosted._workers(.1)
	check("posts do not stack on one quarry",not second.is_empty() and boosted.workers.filter(func(w):return w.ox).size()==1)
	var base_before=normal.res.stone;var boost_before=boosted.res.stone
	for i in 7200:normal._workers(1.0/30);boosted._workers(1.0/30)
	var base_gain=normal.res.stone-base_before;var boost_gain=boosted.res.stone-boost_before
	check("standalone quarry physically delivers stone",base_gain>0,{"gain":base_gain,"workers":normal.workers.map(func(w):return {"state":w.state,"pos":normal.pos(w),"target":w.target,"home":[w.home.gx,w.home.gz]})})
	check("ox post increases delivered output",boost_gain>base_gain,{"standalone":base_gain,"withOx":boost_gain})
	boosted.destroy(post);boosted.destroy(second);boosted._workers(.1)
	check("demolishing posts removes carts and boost",q1.get("ox_post",0)==0 and boosted.workers.filter(func(w):return w.ox and not w.dead).is_empty())
	var after=boosted.res.stone
	for i in 5400:boosted._workers(1.0/30)
	check("stoneworks keeps working after post removal",boosted.res.stone>after)
	for role in ["peasant","lord","spearman","archer","swordsman","knight"]:
		var model=assets.model("player_unit_"+role);Rig.attach(model);root.add_child(model)
		check("skeleton "+role,model.has_meta("skeleton") and model.get_meta("skeleton").get_bone_count()>=15)
		if model.has_meta("skeleton"):
			var sk=model.get_meta("animal_skeleton") if role=="knight" else model.get_meta("skeleton");var u={"id":1,"role":role,"moving":true}
			var name="leg0" if role=="knight" else "rightLeg"
			Rig.pose(model,u,0,assets);var before=sk.get_bone_pose_rotation(sk.find_bone(name))
			for frame in range(1,31):model.position.z=frame/60.0*.8;Rig.pose(model,u,frame/60.0,assets)
			check("animated bones "+role,before.angle_to(sk.get_bone_pose_rotation(sk.find_bone(name)))>.05)
		model.queue_free()
	for job in Rig.TOOLS:
		var model=assets.model("player_unit_peasant");Rig.attach(model);root.add_child(model)
		var u={"id":2,"job":job,"state":"gather","carry":""}
		Rig.pose(model,u,.2,assets)
		check("hand tool "+job,model.get_meta("tool").get_parent()==model.get_meta("rightHand") and model.get_meta("tool_kind")==Rig.TOOLS[job])
		var sk=model.get_meta("skeleton");var before=sk.get_bone_pose_rotation(sk.find_bone("rightArm"));Rig.pose(model,u,.5,assets)
		check("work stroke "+job,before.angle_to(sk.get_bone_pose_rotation(sk.find_bone("rightArm")))>.01)
		u.carry="stone";Rig.pose(model,u,.5,assets);check("tool stowed while carrying "+job,not model.get_meta("tool").visible)
		model.queue_free()
	finish()

func finish():
	var ok=checks.all(func(c):return c.passed)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):FileAccess.open(arg.trim_prefix("--report="),FileAccess.WRITE).store_string(JSON.stringify({"passed":ok,"checks":checks},"  "))
	quit(0 if ok else 1)
