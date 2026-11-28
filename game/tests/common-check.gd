extends SceneTree
const Session=preload("res://scripts/session.gd")
var results=[]
var failed=false
var data:Dictionary

func check(name:String,ok:bool,detail:Variant=null):
	results.append({"name":name,"passed":ok,"detail":detail})
	if not ok:failed=true
	print("CHECK ",name," ",ok," ",detail)

func _initialize():
	data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"))
	var s=Session.new(data)
	check("village",s.structures.filter(func(b):return b.team=="player" and b.type in Session.FORTS+Session.PRODUCERS).is_empty() and s.structures.filter(func(b):return b.type=="dwelling").size()==4)
	check("map",s.map.width==224 and s.map.height==96)
	var sea=s.route(s.world(s.map.ports.mainland.rally),s.world(s.map.ports.island.landing),"worker")
	check("water blocks walking",sea.is_empty() or sea[-1].distance_to(s.world(s.map.ports.island.landing))>5)
	var cost=s.res.wood
	check("build farm",s.build("farm",Vector2i(47,54)))
	check("build cost",s.res.wood==cost-10)
	var resources=s.res.duplicate()
	check("invalid placement",not s.build("farm",Vector2i(37,44)) and s.res==resources)
	check("build lumber",s.build("woodcutter",Vector2i(45,38)))
	var food=s.res.food;var wood=s.res.wood
	for i in 5400:s._workers(1.0/30.0)
	check("physical delivery",s.res.food>food and s.res.wood>wood,{"food":s.res.food-food,"wood":s.res.wood-wood,"workers":s.workers.size()})
	for pair in [["quarry",Vector2i(20,39)],["ironMine",Vector2i(20,62)],["pitchRig",Vector2i(80,65)]]:
		var placed=false
		for dx in range(-3,4):
			for dz in range(-3,4):
				if not placed:placed=s.build(pair[0],pair[1]+Vector2i(dx,dz))
		check("build "+pair[0],placed)
	check("build fletcher",s.build("fletcher",Vector2i(46,54)))
	check("build blacksmith",s.build("blacksmith",Vector2i(49,54)))
	var before=s.res.duplicate()
	for i in 9000:s._workers(1.0/30.0)
	check("all supply chains",s.res.stone>before.stone and s.res.oil>before.oil and s.res.bows>before.bows and s.res.armor>before.armor,s.res)
	s.build("farm",Vector2i(47,55));s.build("farm",Vector2i(48,55));check("paddy bonus",s.paddy_bonus)
	var recruitment=Session.new(data)
	var player=recruitment.create_squad("spearman","player",recruitment.world(recruitment.map.campfire),false)
	check("recruit",not player.is_empty() and player.members.size()==4)
	# Prepared late siege fixture; normal production and recruitment are checked
	# separately by fortress-check.gd, with no resource or army injection.
	var out=Session.new(data);out.state="play";out.phase_timer=999;out.stance="attack";out.paddy_bonus=true;out.policy="generous"
	for role in ["ram","ram","ram","ram","ram","ram","trebuchet","trebuchet","trebuchet","trebuchet","trebuchet","trebuchet","archer","archer","swordsman","swordsman","swordsman","knight","knight"]:
		out.create_squad(role,"player",out.world([46,56]),true)
	var water_steps=0
	for i in 9000:
		out.step(1.0/30.0)
		for u in out.units:
			if u.team=="player" and not u.dead and not u.transit and out.cell(out.grid(out.pos(u))).get("ground","")=="water":water_steps+=1
		if out.state!="play":break
	check("assault landing",out.stats.player_landed>0,out.stats)
	check("assault victory",out.state=="victory",out.snapshot())
	check("no walking water",water_steps==0,water_steps)
	var raid=Session.new(data);raid.state="play";raid.wave=2;raid.trigger_wave()
	for i in 1800:raid.step(1.0/30.0)
	check("enemy lands",raid.stats.enemy_landed>=9,raid.stats)
	_check_building_rules()
	_check_lifecycle()
	_check_terrain()
	var report={"passed":not failed,"checks":results,"content_hash":FileAccess.get_file_as_string("res://assets/world.json").sha256_text()}
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):
			var file=FileAccess.open(arg.trim_prefix("--report="),FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "))
	quit(1 if failed else 0)

func _check_building_rules():
	for rotation in 4:
		var s=Session.new(data);var at=Vector2i(47,54)
		check("gate rotation %d"%rotation,s.build("gate",at,rotation))
		var gate=s.occupied.get(at,{})
		var second=at+(Vector2i(1,0) if rotation%2 else Vector2i(0,1))
		check("gate footprint %d"%rotation,gate.get("rotation",-1)==rotation and s.occupied.get(second)==gate)
		check("friendly gate passage %d"%rotation,not s.grids.player.is_point_solid(at) and not s.grids.worker.is_point_solid(second))
		if not gate.is_empty():
			gate.hp-=100;var stone=s.res.stone;s.repair()
			check("repair %d"%rotation,gate.hp==gate.max_hp and s.res.stone==stone-1)
			var refund=floorf(data.buildings.gate.cost.get("stone",0)*.5);stone=s.res.stone
			check("demolish %d"%rotation,s.build("demolish",second) and gate.dead and not s.occupied.has(at) and not s.occupied.has(second) and s.res.stone==stone+refund)
	var s=Session.new(data)
	check("protect initial keep",not s.build("demolish",Vector2i(s.player_keep.gx,s.player_keep.gz)))
	# Spawn on open ground before laying the trap; spawn clearance correctly
	# relocates units requested inside an already occupied building footprint.
	var u=s.spawn_unit("spearman","enemy",s.world([47,54]));var hp=u.hp
	s.build("pitch",Vector2i(47,54));var pitch=s.occupied[Vector2i(47,54)]
	s.ignite();s._fire(.5)
	check("pitch damages",u.hp<hp)
	s._fire(8)
	check("pitch consumed",pitch.dead and s.fires.is_empty())

func _check_lifecycle():
	var s=Session.new(data);var wood=s.res.wood
	s.donate();s.donate();s.donate()
	check("donation cap",s.donation_count==2 and s.res.wood==wood+110)
	s.guard();var count=s.units.size();s.guard()
	check("reinforcement cap",s.guard_used and s.units.size()==count)
	for policy in ["balanced","harsh","generous"]:
		var economy=Session.new(data);economy.state="play";economy.policy=policy
		var gold=economy.res.gold;var food=economy.res.food;economy.step(1)
		check("policy "+policy,economy.res.gold>gold and economy.res.food<food)
	for role in data.units:
		var army=Session.new(data)
		for resource in army.res:army.res[resource]=1000
		army.res.peasants=12
		var sq=army.create_squad(role,"player",army.world(army.map.campfire))
		check("recruit "+role,not sq.is_empty() and sq.members.size()==data.units[role].count and army.res.gold<1000)
	for wave in range(1,5):
		var battle=Session.new(data);battle.wave=wave;battle.trigger_wave()
		check("wave %d"%wave,battle.night and battle.pending.size()==Session.WAVES[wave-1].size())
	var garrison=Session.new(data);garrison.state="play";garrison.phase_timer=999
	garrison.build("tower",Vector2i(47,54));var tower=garrison.occupied[Vector2i(47,54)]
	var squad=garrison.create_squad("archer","player",garrison.world([46,56]),true)
	garrison.command_squad(squad,garrison.pos(tower))
	for i in 900:garrison.step(1.0/30)
	check("archer garrison",squad.members.all(func(u):return u.garrison==tower.id))
	garrison.command_squad(squad,garrison.world([50,56]))
	check("garrison release",squad.members.all(func(u):return u.garrison==0))
	garrison.player_lord.order=garrison.apron(garrison.pos(garrison.player_keep),"player");garrison.player_lord.enter=garrison.player_keep.id
	for i in 300:garrison.step(1.0/30)
	check("lord enters keep",garrison.player_lord.garrison==garrison.player_keep.id)
	garrison.player_lord.garrison=0;garrison.player_lord.order=garrison.world([47,57])
	for i in 300:garrison.step(1.0/30)
	check("lord leaves keep",garrison.player_lord.garrison==0 and Vector2(garrison.player_lord.x,garrison.player_lord.z).distance_to(Vector2(garrison.world([47,57]).x,garrison.world([47,57]).z))<1)
	var defeat=Session.new(data);defeat.state="play";defeat.player_lord.hp=0;defeat.step(1.0/30)
	check("defeat",defeat.state=="defeat")
	var fresh=Session.new(data)
	check("fresh session",fresh.state=="title" and fresh.stats.built==0 and fresh.donation_count==0 and fresh.res.wood==data.initial_resources.wood)

func _check_terrain():
	var s=Session.new(data)
	check("shared terrain field",data.get("terrain",{}).get("version",0)==2 and data.terrain.heights.size()==(data.map.width*2+1)*(data.map.height*2+1))
	for spec in data.map.routeChecks:
		var path=s.route(s.world(spec.from),s.world(spec.to),"enemy" if spec.name=="island-port-camp" else "worker")
		var length=0.0
		for i in range(1,path.size()):length+=Vector2(path[i].x-path[i-1].x,path[i].z-path[i-1].z).length()
		var reached=not path.is_empty() and Vector2(path[-1].x-s.world(spec.to).x,path[-1].z-s.world(spec.to).z).length()<3.0
		check("terrain route "+spec.name,reached and length>=spec.lengthRange[0] and length<=spec.lengthRange[1],{"length":length,"waypoints":path.size()})
	var bad_slopes=0;var bad_support=0;var ray_error=0.0;var samples=0
	for z in range(3,93,5):
		for x in range(3,157,7):
			var point=s.world([x,z])+Vector3(.18,0,-.12);point.y=s.terrain.visible_height(point)
			var direction=Vector3.DOWN
			var hit=s.terrain.raycast(point-direction*40,direction)
			if hit==Vector3.INF:ray_error=INF
			else:ray_error=maxf(ray_error,hit.distance_to(point))
			samples+=1
	check("terrain pointer follows surface",ray_error<.025,{"samples":samples,"maxError":ray_error})
	# Oblique rays may correctly hit a foreground ridge before the intended point.
	# Use unobscured work sites to prove screen projection on elevated ground.
	for target in [[20,39],[22,63],[47,54],[77,48],[93,75]]:
		var point=s.world(target);point.y=s.terrain.visible_height(point)
		var direction=Vector3(.37,-1,.22).normalized()
		var hit=s.terrain.raycast(point-direction*40,direction)
		check("terrain oblique pick "+str(target),hit!=Vector3.INF and hit.distance_to(point)<.025,hit.distance_to(point))
	for pair in [[37,29],[37,49],[37,69],[53,49],[53,69]]:
		for role in ["worker","knight","ram"]:
			for reverse in [false,true]:
				var a=s.world([pair[0]-2,pair[1]]);var b=s.world([pair[0]+3,pair[1]])
				if reverse:var swap=a;a=b;b=swap
				a=s.apron(a);b=s.apron(b)
				var unit={"x":a.x,"y":a.y,"z":a.z,"speed":2.1,"role":role,"team":"player"};var reached=false
				for i in 900:
					if s.move(unit,b,1.0/30,"worker"):reached=true;break
					var at=s.pos(unit);var c=s.cell(s.grid(at))
					if not c.get("walkable",false):bad_slopes+=1
					if absf(at.y-s.elevation(at))>.001:bad_support+=1
				check("bridge %s %s %s"%[pair,role,reverse],reached)
	check("units remain on walkable surface",bad_slopes==0 and bad_support==0,{"blockedSteps":bad_slopes,"supportErrors":bad_support})
	var rejected=0;var eligible=0
	for z in range(2,93,3):
		for x in range(3,84,3):
			var c=s.cell(Vector2i(x,z))
			if c.ground!="water" and not c.bridge and not c.buildable:
				eligible+=1;var before=s.res.duplicate()
				if not s.build("farm",Vector2i(x,z)) and before==s.res:rejected+=1
	check("steep or wet building rejection",eligible>20 and rejected==eligible,{"tested":eligible,"rejected":rejected})
	var gate_at=Vector2i(23,5)
	# The slope may now be forested. Clear its real tree footprint before testing
	# the foundation rule; dense woodland itself must still reject construction.
	var gate_cells=s.footprint("gate",gate_at,1)
	for tree in s.trees:
		if gate_cells.has(Vector2i(tree.gx,tree.gz)):tree.wood=0;tree.regrow=65
	s._rebuild_grids();var before_gate=s.res.duplicate()
	var support=s.foundation(s.footprint("gate",gate_at,1))
	check("gentle slope accepts a supported gate",s.cell(gate_at).buildable and s.cell(gate_at+Vector2i.RIGHT).buildable and s.build("gate",gate_at,1) and s.res.stone==before_gate.stone-data.buildings.gate.cost.stone)
	var gate=s.occupied.get(gate_at,{})
	check("gate foundation reaches the highest support",not gate.is_empty() and absf(gate.y-support.y)<.0001 and absf(gate.foundation_bottom-support.x)<.0001)
