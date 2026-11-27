extends SceneTree
const Session=preload("res://scripts/session.gd")
var results=[]
var scenarios=[]
var data:Dictionary
var mode="all"
var report_path=""

func check(name:String,ok:bool,detail:Variant=null):
	results.append({"name":name,"passed":ok,"detail":detail})
	print("CHECK ",name," ",ok," ",detail)

func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):report_path=arg.trim_prefix("--report=")
		if arg.begins_with("--mode="):mode=arg.trim_prefix("--mode=")
	data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"))
	if mode in ["all","layout"]:_layout()
	if mode in ["all","layout"]:_siege_rules()
	if mode in ["all","layout"]:_recruitment_spawn()
	if mode in ["all","rush"]:
		_rush(["archer","archer","swordsman","spearman"],"opening infantry and militia")
		_rush(["trebuchet","trebuchet","ram","ram","spearman","spearman"],"opening siege and militia")
	if mode in ["all","economy"]:_economy()
	if mode=="siege":_siege()
	var passed=not results.is_empty() and results.all(func(r):return r.passed)
	var report={"passed":passed,"checks":results,"scenarios":scenarios,"content_hash":FileAccess.get_file_as_string("res://assets/world.json").sha256_text()}
	if report_path!="":FileAccess.open(report_path,FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	quit(0 if passed else 1)

func _layout():
	var s=Session.new(data)
	check("offshore crossing takes 29 to 31 seconds",s.snapshot().fortress.crossing_seconds>29 and s.snapshot().fortress.crossing_seconds<31,s.snapshot().fortress)
	var nav=AStarGrid2D.new();nav.region=Rect2i(0,0,s.map.width,s.map.height);nav.diagonal_mode=AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES;nav.update()
	for z in s.map.height:
		for x in s.map.width:nav.set_point_solid(Vector2i(x,z),not s.cell(Vector2i(x,z)).walkable)
	for b in s.structures:
		for xy in b.cells:nav.set_point_solid(Vector2i(xy[0],xy[1]),true)
	var start=Vector2i(s.map.ports.island.landing[0],s.map.ports.island.landing[1]);var goal=Vector2i(195,50)
	check("intact outer enclosure cannot be bypassed",nav.get_id_path(start,goal).is_empty())
	for b in s.structures:
		if b.team=="enemy" and b.type=="gate" and b.get("defenseLayer")=="outer":
			for xy in b.cells:nav.set_point_solid(Vector2i(xy[0],xy[1]),false)
	check("inner enclosure still blocks after outer gate opens",nav.get_id_path(start,goal).is_empty())
	for b in s.structures:
		if b.team=="enemy" and b.type=="gate" and b.get("defenseLayer")=="inner":
			for xy in b.cells:nav.set_point_solid(Vector2i(xy[0],xy[1]),false)
	check("both breaches allow passage and detector sees opening",not nav.get_id_path(start,goal).is_empty())
	var ram=s.create_squad("ram","player",s.world(s.map.campfire),true)
	s.command_squad(ram,s.world(s.map.ports.island.landing));s.state="play"
	var sailed=false;var arrived=false;var water_steps=0
	for i in 4200:
		s.time+=1.0/30;s._transport(1.0/30)
		var u=ram.members[0]
		if not u.transit:
			if s.on_island(s.pos(u)):arrived=true;break
			s.move(u,ram.get("port",ram.order),1.0/30,"player",.65)
			if s.cell(s.grid(s.pos(u))).ground=="water":water_steps+=1
		else:sailed=true
	check("manual siege order sails to moved island",sailed and arrived and water_steps==0,{"time":s.time,"waterSteps":water_steps})
	s.command_squad(ram,s.world(s.map.ports.mainland.landing));arrived=false
	for i in 2400:
		s.time+=1.0/30;s._transport(1.0/30)
		var u=ram.members[0]
		if not u.transit:
			if not s.on_island(s.pos(u)):arrived=true;break
			s.move(u,ram.get("port",ram.order),1.0/30,"player",.65)
	check("manual siege order returns to mainland",arrived,{"landed":s.stats.player_landed})

func _rush(roles:Array,label:String):
	var s=Session.new(data);s.state="play";s.donate();s.donate();s.guard()
	var purchased=0
	for role in roles:
		if not s.recruit_squad(role).is_empty():purchased+=1
	s.set_stance("attack");var water_steps=0
	for i in 30*240:
		s.step(1.0/30)
		for u in s.units:
			if not u.dead and not u.transit and not u.garrison and s.cell(s.grid(s.pos(u))).ground=="water":water_steps+=1
		if s.state!="play":break
	var remaining=s.units.filter(func(u):return u.team=="player" and u.role!="lord" and not u.dead).size()
	var row={"name":label,"staged":false,"purchasedSquads":purchased,"remaining":remaining,"waterSteps":water_steps,"final":s.snapshot()};scenarios.append(row)
	check(label+" fails to capture keep",purchased==roles.size() and s.stats.player_landed>0 and not s.enemy_keep.dead and s.state!="victory" and water_steps==0,row)

func _siege_rules():
	var s=Session.new(data);var start=s.world(s.map.ports.island.landing)
	var gun=s.spawn_unit("trebuchet","player",start);var infantry=s.spawn_unit("spearman","enemy",start+Vector3(2,0,0))
	s.stance="attack";s._combat(1.0/30)
	check("siege gun targets cannon ahead of nearby infantry",s.projectiles.any(func(p):return p.structure and p.target.type=="ballista"))
	s.units.clear();s.structures.clear()
	var archer=s.spawn_unit("archer","enemy",start);var ram=s.spawn_unit("ram","player",start);var hp=ram.hp
	s.projectiles.clear();s.shoot(archer,ram);s._combat(1.0)
	check("covered ram resists small ranged shots",is_equal_approx(hp-ram.hp,17*(1-.78)),{"damage":hp-ram.hp})

func _recruitment_spawn():
	var s=Session.new(data)
	for item in [["ballista",51,46],["ballista",49,47],["tower",51,48],["wall",50,46],["wall",49,46]]:
		assert(s.build(item[0],Vector2i(item[1],item[2])))
	var goal=s.world([46,59])
	var legacy=s.create_squad("spearman","player",s.world(s.map.campfire)+Vector3(2,0,2),true)
	var trapped=0
	for u in legacy.members:
		var path=s.route(s.pos(u),goal,"player")
		if path.is_empty() or path[-1].distance_to(goal)>2:trapped+=1
	check("spawn detector catches former offset pocket",trapped>0,trapped)
	var squad=s.recruit_squad("spearman");var reached=0
	for u in squad.members:
		var path=s.route(s.pos(u),goal,"player")
		if not path.is_empty() and path[-1].distance_to(goal)<2:reached+=1
	check("recruits leave campfire despite enclosed side pocket",reached==4,reached)

func place_near(s,kind:String,at:Vector2i) -> bool:
	for radius in range(0,7):
		for dz in range(-radius,radius+1):
			for dx in range(-radius,radius+1):
				if maxi(absi(dx),absi(dz))==radius and s.build(kind,at+Vector2i(dx,dz)):return true
	return false

func _siege():
	var s=Session.new(data);s.state="play";s.phase_timer=9999;s.paddy_bonus=true;s.policy="generous";s.set_stance("attack")
	for role in ["ram","ram","ram","ram","ram","ram","trebuchet","trebuchet","trebuchet","trebuchet","trebuchet","trebuchet","archer","archer","swordsman","swordsman","swordsman","knight","knight"]:
		s.create_squad(role,"player",s.world(s.map.campfire),true)
	var timeline=[]
	for i in 30*450:
		s.step(1.0/30)
		if i%600==0:timeline.append(s.snapshot())
		if s.state!="play":break
	var survivors=[]
	for u in s.units:
		if not u.dead:survivors.append({"role":u.role,"team":u.team,"cell":str(s.grid(s.pos(u))),"hp":u.hp,"garrison":u.garrison})
	scenarios.append({"name":"prepared siege fixture","staged":true,"timeline":timeline,"survivors":survivors,"final":s.snapshot()})
	check("prepared siege fixture wins",s.state=="victory",s.snapshot())

func _economy():
	var s=Session.new(data);s.state="play";s.donate();s.donate();s.guard()
	s.player_lord.order=s.apron(s.pos(s.player_keep),"player");s.player_lord.enter=s.player_keep.id
	var plan=[["farm",47,54],["farm",48,55],["farm",50,56],["woodcutter",45,38],["woodcutter",42,35],
		["quarry",21,39],["ironMine",23,63],["fletcher",46,54],["blacksmith",49,54],
		["ballista",51,46],["ballista",51,50],["ballista",46,42],["ballista",46,38],["ballista",48,42],["ballista",49,47],
		["hovel",41,50],["hovel",41,52],["hovel",43,53],["hovel",45,57],["hovel",50,58],["hovel",45,60],
		["tower",52,49],["tower",47,40],["wall",50,46],["wall",50,47]]
	var builds=[];var purchases=[];var timeline=[];var attack_at=-1.0
	var roles=["trebuchet","ram","trebuchet","ram","archer","swordsman","knight","trebuchet","ram","archer","swordsman","knight","trebuchet","ram","trebuchet","ram","trebuchet","ram","swordsman"]
	var recruit_index=0;var build_index=0
	for i in 30*1000:
		if i%60==0:
			if build_index<plan.size():
				var item=plan[build_index]
				if s.affordable(data.buildings[item[0]].cost) and place_near(s,item[0],Vector2i(item[1],item[2])):
					var building=s.structures[-1];builds.append({"time":s.time,"type":item[0],"cell":[building.gx,building.gz]});build_index+=1
			if build_index>=15 and recruit_index<roles.size():
				var role=roles[recruit_index];var squad=s.recruit_squad(role)
				if not squad.is_empty():
					purchases.append({"time":s.time,"role":role});recruit_index+=1;s.command_squad(squad,s.world([46,59]))
			if attack_at<0 and s.wave>=4 and recruit_index==roles.size():attack_at=s.time;s.policy="generous";s.set_stance("attack")
			if s.res.stone>=5:s.repair()
		if i%600==0:
			var shot=s.snapshot();shot.player_keep_hp=s.player_keep.hp;shot.player_army=s.units.filter(func(u):return u.team=="player" and not u.dead and u.role!="lord").size();timeline.append(shot)
		s.step(1.0/30)
		if s.state!="play":break
	var row={"name":"normal economy with scripted decisions","staged":false,"builds":builds,"purchases":purchases,"attackAt":attack_at,"timeline":timeline,"final":s.snapshot()};scenarios.append(row)
	check("normal economy reaches late offensive",attack_at>=300 and s.stats.deliveries>0 and s.paddy_bonus,row)
	check("normal economy can win fortified island",s.state=="victory",s.snapshot())
