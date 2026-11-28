extends SceneTree
const Session=preload("res://scripts/session.gd")
const Archive=preload("res://scripts/session_archive.gd")
const Separation=preload("res://scripts/unit_separation.gd")
var checks=[]
var data:Dictionary

func check(label:String,passed:bool,detail:Variant=null):
	checks.append({"name":label,"passed":passed,"detail":detail})
	print("CHECK ",label," ",passed," ",detail)

func prepared():
	var s=Session.new(data);s.state="play";s.training=true
	for key in s.res:s.res[key]=10000
	# Clear the build area as a player could by logging; never alter the terrain.
	for t in s.trees:t.wood=0;t.regrow=10000
	s._rebuild_grids()
	return s

func reachable(s,start:Vector2i,goal:Vector2i,friendly=false) -> bool:
	var queue=[start];var visited={start:true};var index=0
	while index<queue.size():
		var at:Vector2i=queue[index];index+=1
		if at==goal:return true
		for dir in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
			var p=at+dir;var c=s.cell(p)
			if visited.has(p) or c.is_empty() or not c.walkable:continue
			var b=s.occupied.get(p,{})
			if not b.is_empty() and not b.dead and b.type not in ["campfire","stockpile","pitch"] and not (friendly and b.type=="gate" and b.team=="player"):continue
			visited[p]=true;queue.append(p)
	return false

func _initialize():
	data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"))
	var s=prepared();var water=Vector2i(36,18);var bank=Vector2i(35,18)
	check("new catalog leaves world data and save identity unchanged",s.source.buildings.has("waterGate") and not data.buildings.has("waterGate"))
	for request in [["wall",water,0],["gate",water,0],["farm",bank,0],["wall",Vector2i(37,28),0],["waterGate",Vector2i(45,20),0],["waterGate",water,1],["waterGate",Vector2i(150,48),0],["waterGate",Vector2i(37,28),0]]:
		var before=s.res.duplicate();var count=s.structures.size()
		check("invalid placement preserves resources and structures %s"%str(request),not s.build(request[0],request[1],request[2]) and s.res==before and s.structures.size()==count)
	check("bank accepts visible wall foundation",s.build("wall",bank) and s.occupied[bank].y>s.occupied[bank].foundation_bottom)
	var before=s.res.duplicate()
	check("water gate replaces friendly bank wall and spans both banks",s.build("waterGate",water) and s.occupied[bank].type=="waterGate")
	var b=s.occupied.get(water,{})
	if not b.is_empty():
		check("water gate charges once",s.res.stone==before.stone-16 and s.res.wood==before.wood-4 and s.res.iron==before.iron-2)
		check("span covers all bank cells",b.cells==[[34,18],[35,18],[36,18],[37,18],[38,18]],b.cells)
		check("water stays solid in every navigation grid",s.grids.enemy.is_point_solid(water) and s.grids.player.is_point_solid(water) and s.grids.worker.is_point_solid(water))
		for team in ["enemy","player"]:
			var u=s.spawn_unit("spearman",team,s.world([35,17]))
			check("bank blocker applies to "+team,not Separation.can_stand(s,u,s.world([35,18])))
		var restored=Archive.restore(data,Archive.capture(s))
		check("save restore retains span catalog and water navigation",restored!=null and restored.occupied[water].cells==b.cells and restored.source.buildings.has("waterGate") and restored.grids.enemy.is_point_solid(water))
		s.damage_structure(b,25);s.repair();check("water gate participates in fort repairs",b.hp==b.max_hp)
		s.destroy(b)
		check("destroy restores banks without making a land bridge",not s.occupied.has(bank) and not s.grids.enemy.is_point_solid(bank) and s.grids.enemy.is_point_solid(water))
	var poor=prepared();poor.res.iron=0;before=poor.res.duplicate()
	check("insufficient resources are atomic",not poor.build("waterGate",water) and poor.res==before)
	var original=Session.new(data);original.state="play"
	check("old session archive remains compatible",Archive.restore(data,Archive.capture(original))!=null)
	for rotation in [1,2,3]:
		var rotated=prepared();var at=Vector2i(40,81) if rotation%2 else water
		check("rotated water gate builds %d"%rotation,rotated.build("waterGate",at,rotation))
		var rotated_gate=rotated.occupied.get(at,{})
		if not rotated_gate.is_empty():
			check("rotated span follows its wall axis %d"%rotation,(rotated_gate.half.hz>rotated_gate.half.hx)==(rotation%2==1))
			var money=rotated.res.duplicate();var cells=rotated_gate.cells.duplicate()
			check("demolish water gate restores every cell %d"%rotation,rotated.build("demolish",at) and cells.all(func(p):return not rotated.occupied.has(Vector2i(p[0],p[1]))) and rotated.res.stone==money.stone+8 and rotated.res.wood==money.wood+2)
	# Build a real perimeter around both waterways, with four water gates and land gates.
	var city=prepared();var failed=[];var crossings=[Vector2i(36,18),Vector2i(54,18),Vector2i(38,77),Vector2i(53,77)]
	for p in crossings:
		if not city.build("waterGate",p):failed.append([p,city.placement_error("waterGate",p)])
	for z in [18,77]:
		for x in range(28,65):
			var p=Vector2i(x,z)
			if not city.occupied.has(p) and not city.build("wall",p):failed.append([p,city.placement_error("wall",p)])
	for x in [28,64]:
		for z in range(19,77):
			var p=Vector2i(x,z)
			if not city.build("wall",p):failed.append([p,city.placement_error("wall",p)])
	check("full two-canal city perimeter is buildable",failed.is_empty(),failed)
	check("land gate upgrades perimeter",city.build("gate",Vector2i(64,48)))
	check("intact city has no enemy bank bypass",not reachable(city,Vector2i(70,48),Vector2i(46,48)))
	check("friendly traffic crosses land gate and internal bridges",reachable(city,Vector2i(70,48),Vector2i(32,48),true))
	var path=city.route(city.world([70,48]),city.world([46,48]),"enemy")
	check("enemy route plans a breach rather than stopping at the city",path.size()>0 and path[-1].distance_to(city.world([46,48]))<1 and Array(path).any(func(p):return city.occupied.has(city.grid(p))))
	var attacker=city.spawn_unit("ram","enemy",city.world([66,48]));var gate=city.occupied[Vector2i(64,48)];var hp=gate.hp
	for i in 180:city.step(1.0/30)
	check("enemy physically attacks the gate and cannot walk through it",gate.hp<hp and attacker.x>city.world([64,48]).x and not gate.dead,{"hpBefore":hp,"hpAfter":gate.hp,"x":attacker.x})
	attacker.dead=true
	var water_attacker=city.spawn_unit("ram","enemy",city.world([35,16]));var water_gate=city.occupied[crossings[0]];hp=water_gate.hp
	for i in 120:city.step(1.0/30)
	check("enemy attacks the water gate from its bank",water_gate.hp<hp and not water_gate.dead and water_attacker.z<city.world([35,18]).z,{"hpBefore":hp,"hpAfter":water_gate.hp})
	city.destroy(city.occupied[crossings[0]])
	check("destroyed water gate opens an actual bank breach",reachable(city,Vector2i(35,15),Vector2i(46,48)))
	# Actual bridgehead gates accept workers, foot soldiers and siege traffic.
	var bridge=prepared()
	check("bridgehead gate is legal without building on timber",bridge.build("gate",Vector2i(35,28)))
	for role in ["spearman","ram","peasant"]:
		var u=bridge.spawn_unit(role,"player",bridge.world([33,28]));var reached=false
		var team="worker" if role=="peasant" else "player"
		for i in 480:
			if bridge.move(u,bridge.world([42,28]),1.0/30,team,.6):reached=true;break
		check("friendly crosses bridgehead gate "+role,reached,bridge.pos(u));u.dead=true
	var report={"passed":checks.all(func(c):return c.passed),"checks":checks}
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):FileAccess.open(arg.trim_prefix("--report="),FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	quit(0 if report.passed else 1)
