extends RefCounted
const TerrainSurface=preload("res://scripts/terrain_surface.gd")
const UnitSeparation=preload("res://scripts/unit_separation.gd")
var terrain

signal changed(kind: String, payload: Variant)
const PRODUCERS = ["farm","woodcutter","quarry","ironMine","pitchRig","fletcher","blacksmith"]
const FORTS = ["wall","gate","tower","ballista"]
const RESOURCE_NAMES={"wood":"木材","stone":"条石","food":"粮食","gold":"银两","iron":"铁料","oil":"火油","bows":"鸟铳","armor":"甲胄"}
const WAVES = [
	[{"role":"spearman"},{"role":"spearman"},{"role":"archer"}],
	[{"role":"ram"},{"role":"swordsman"},{"role":"spearman","north":true}],
	[{"role":"trebuchet"},{"role":"swordsman"},{"role":"swordsman","north":true},{"role":"archer"}],
	[{"role":"trebuchet"},{"role":"ram"},{"role":"knight"},{"role":"knight","north":true}]
]
var source: Dictionary
var map: Dictionary
var res: Dictionary
var structures: Array = []
var units: Array = []
var units_by_team={"player":[],"enemy":[]}
var structures_by_team={"player":[],"enemy":[]}
var workers: Array = []
var squads: Array = []
var squad_index={}
var structure_index={}
var trips: Array = []
var trees: Array = []
var projectiles: Array = []
var fires: Dictionary = {}
var occupied: Dictionary = {}
var grids: Dictionary = {}
var pending: Array = []
var ids = 0
var version = 0
var time = 0.0
var phase_timer = 75.0
var wave = 1
var night = false
var state = "title"
var speed = 1.0
var training=false
var stance = "defend"
var policy = "balanced"
var donation_count = 0
var guard_used = false
var paddy_bonus = false
var wall_bonus = false
var martial_bonus = false
var econ_timer = 1.0
var recruit_timer = 3.2
var last_departure = {"mainland":-100.0,"island":-100.0}
var stats = {"built":0,"deliveries":0,"player_landed":0,"enemy_landed":0,"shots":0,"kills":0}
var player_lord: Dictionary
var enemy_lord: Dictionary
var player_keep: Dictionary
var enemy_keep: Dictionary

func _init(data: Dictionary):
	source = data
	map = data.map
	terrain=TerrainSurface.new(data)
	res = data.initial_resources.duplicate(true)
	for base in data.structures:
		var s = base.duplicate(true)
		s.id = next_id(); s.max_hp = s.hp; s.dead = false; s.timer = 0.0; s.worker = false;s.initial=true
		structures.append(s);structure_index[s.id]=s;structures_by_team[s.team].append(s)
		for c in s.cells: occupied[Vector2i(c[0],c[1])] = s
		if s.type == "keep":
			if s.team == "player": player_keep = s
			else: enemy_keep = s
	for t in data.trees:
		var tr = t.duplicate(true);tr.id = next_id();tr.regrow = 0.0;trees.append(tr)
	_rebuild_grids()
	player_lord = spawn_unit("lord","player",pos(player_keep)+Vector3(2,0,.35))
	enemy_lord = spawn_unit("lord","enemy",pos(enemy_keep)+Vector3(-2.4,0,0))
	enemy_lord.garrison = enemy_keep.id
	for xy in map.enemyTowers:
		var squad = create_squad("archer","enemy",world(xy),true)
		var tower = occupied.get(Vector2i(xy[0],xy[1]))
		if tower:
			for i in squad.members.size():
				var u = squad.members[i];u.garrison=tower.id;u.slot=Vector3((i%2-.5)*.36,0,(floori(i/2.0)-.5)*.36)
	for guard_spec in map.enemyGuards:
		create_squad(guard_spec.role,"enemy",world(guard_spec.cell),true).guard = true

func next_id() -> int:
	ids += 1
	return ids

func world(xy: Array) -> Vector3:
	var p=Vector3(xy[0]-map.width/2.0+.5,0,xy[1]-map.height/2.0+.5)
	p.y=terrain.support(p);return p

func on_island(p: Vector3) -> bool:
	return p.x+map.width/2.0>=float(map.seaBoundaryX)

func grid(p: Vector3) -> Vector2i:
	return Vector2i(floori(p.x+map.width/2.0),floori(p.z+map.height/2.0))

func pos(d: Dictionary) -> Vector3:
	return Vector3(d.x,d.y,d.z)

func cell(p: Vector2i) -> Dictionary:
	if p.x<0 or p.y<0 or p.x>=map.width or p.y>=map.height: return {}
	return source.cells[p.y*int(map.width)+p.x]

func elevation(p: Vector3) -> float:
	return terrain.support(p)

func _rebuild_grids():
	for team in ["player","enemy","worker"]:
		var nav = AStarGrid2D.new()
		nav.region=Rect2i(0,0,int(map.width),int(map.height))
		nav.diagonal_mode=AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
		nav.default_compute_heuristic=AStarGrid2D.HEURISTIC_OCTILE
		nav.default_estimate_heuristic=AStarGrid2D.HEURISTIC_OCTILE
		nav.update()
		for z in int(map.height):
			for x in int(map.width):
				var p=Vector2i(x,z);var c=cell(p)
				nav.set_point_solid(p,not c.get("walkable",c.ground!="water" and c.biome!="cliff"))
				if c.get("walkable",true):nav.set_point_weight_scale(p,1.0+float(c.get("slope",0))*.7)
		for tr in trees:
			if tr.wood>0:nav.set_point_solid(Vector2i(tr.gx,tr.gz),true)
		for d in source.deposits:nav.set_point_solid(Vector2i(d.gx,d.gz),true)
		for s in structures:
			if s.dead or s.type in ["stockpile","campfire"]:continue
			for xy in s.cells:
				var p=Vector2i(xy[0],xy[1])
				if s.type=="gate" and (s.team==team or (team=="worker" and s.team=="player")):
					nav.set_point_solid(p,false)
				elif team!="worker" and s.team!=team:
					nav.set_point_solid(p,false);nav.set_point_weight_scale(p,14.0 if s.type in FORTS else 8.0)
				else:nav.set_point_solid(p,true)
		grids[team]=nav
	version+=1

func apron(target: Vector3, team="worker") -> Vector3:
	var nav: AStarGrid2D=grids[team]
	var center=grid(target)
	for radius in range(0,6):
		for dx in range(-radius,radius+1):
			for dz in range(-radius,radius+1):
				if maxi(absi(dx),absi(dz))!=radius:continue
				var p=center+Vector2i(dx,dz)
				if nav.is_in_boundsv(p) and not nav.is_point_solid(p):return world([p.x,p.y])
	return target

func route(from: Vector3, to: Vector3, team: String) -> PackedVector3Array:
	var nav: AStarGrid2D=grids[team]
	var start=grid(apron(from,team));var goal=grid(apron(to,team))
	var points=nav.get_id_path(start,goal,true)
	var result=PackedVector3Array()
	for xy in points:result.append(world([xy.x,xy.y]))
	return result

func move(u: Dictionary, goal: Vector3, dt: float, team: String, stop=.35) -> bool:
	var p=pos(u)
	if Vector2(p.x-goal.x,p.z-goal.z).length()<stop:return true
	if u.get("path_version",-1)!=version or u.get("goal",Vector3.INF).distance_to(goal)>.7 or u.get("path",[]).is_empty():
		u.path=route(p,goal,team);u.path_index=0;u.path_version=version;u.goal=goal
	var path: PackedVector3Array=u.path
	if path.is_empty():return false
	while u.path_index<path.size()-1 and Vector2(p.x-path[u.path_index].x,p.z-path[u.path_index].z).length()<.48:u.path_index+=1
	var target:Vector3=path[u.path_index]
	var dir=target-p;dir.y=0
	if dir.length()<.15:return Vector2(p.x-goal.x,p.z-goal.z).length()<stop+1
	dir=dir.normalized()
	var next=p+dir*minf(float(u.speed)*dt,Vector2(p.x-target.x,p.z-target.z).length())
	var blocking=occupied.get(grid(next))
	if blocking and not blocking.dead and blocking.team!=u.get("team","player") and not blocking.type in ["campfire","stockpile"]:
		if team!="worker":strike_structure(u,blocking)
		return false
	var next_cell=cell(grid(next))
	if not next_cell.get("walkable",next_cell.get("ground","water")!="water"):u.path_version=-1;return false
	u.x=next.x;u.z=next.z;u.y=elevation(next);u.yaw=atan2(dir.x,dir.z);u.moving=true
	u.phase=u.get("phase",0.0)+dt*float(u.speed)*3.7
	return false

func affordable(cost: Dictionary) -> bool:
	for key in cost:
		if res.get(key,0)<cost[key]:return false
	return true

func missing_resources(cost:Dictionary) -> String:
	var missing=[]
	for key in cost:
		if res.get(key,0)<cost[key]:missing.append("%s差%d"%[RESOURCE_NAMES.get(key,key),ceili(cost[key]-res.get(key,0))])
	return "、".join(missing)

func recruitment_cost(role:String) -> Dictionary:
	var cost=source.units[role].cost.duplicate()
	if martial_bonus and role in ["knight","swordsman"]:
		for key in cost:cost[key]=ceilf(cost[key]*.8)
	return cost

func recruitment_error(role:String) -> String:
	var spec=source.units[role];var missing=missing_resources(recruitment_cost(role))
	if missing!="":return missing
	if res.peasants<spec.popCost:
		var remedy="等待乡民归附"
		if res.food<2:remedy="粮食不足，先建稻田恢复入库"
		elif population()>=res.maxPop:remedy="丁口已满，先建民居扩容"
		return "空闲乡民差%d：%s"%[ceili(spec.popCost-res.peasants),remedy]
	var after=population()-int(spec.popCost)+int(spec.count)
	if after>res.maxPop:return "丁口容量差%d：营造民居可增加8人上限"%int(after-res.maxPop)
	return ""

func pay(cost: Dictionary):
	for key in cost:res[key]-=cost[key]

func footprint(kind:String,p:Vector2i,rotation:int=0) -> Array:
	var dimensions=source.buildings.get(kind,{}).get("footprint",[1,2] if kind=="gate" else [1,1])
	var width=int(dimensions[rotation%2]);var depth=int(dimensions[1-rotation%2]);var cells=[]
	for x in width:
		for z in depth:cells.append(p+Vector2i(x,z))
	return cells

func placement_error(kind:String,p:Vector2i,rotation:int=0) -> String:
	if not source.buildings.has(kind):return "未知建筑"
	var c=cell(p)
	if c.is_empty() or c.ground=="water" or c.get("bridge",false) or c.biome=="cliff" or p.x<2 or p.x>map.buildLimitX:return "此处不能营造"
	if kind=="demolish":
		var target=occupied.get(p,{})
		if target.is_empty():return "这里没有建筑"
		if target.team!="player":return "敌方建筑需要用部队攻破"
		if target.get("initial",false):return "开局建筑不可拆除"
		return ""
	var spec=source.buildings[kind]
	if not c.get("buildable",true):return "此处坡度或岸地不适合营造"
	if not affordable(spec.cost):return "物资不足："+missing_resources(spec.cost)
	var cells=footprint(kind,p,rotation)
	var lowest=INF;var highest=-INF
	for xy in cells:
		var cc=cell(xy);var old=occupied.get(xy)
		if xy.x>map.buildLimitX or cc.is_empty() or cc.ground=="water" or cc.get("bridge",false) or not cc.get("buildable",true):return "占地、障碍或高差不允许营造"
		var center=world([xy.x,xy.y])
		for dx in [-.5,0,.5]:
			for dz in [-.5,0,.5]:
				var height=terrain.height_at(center+Vector3(dx,0,dz))
				lowest=minf(lowest,height);highest=maxf(highest,height)
		if highest-lowest>float(source.get("terrain",{}).get("maxBuildRelief",.28)):return "占地、障碍或高差不允许营造"
		if old and not (kind=="gate" and old.type=="wall" and old.team=="player"):return "占地、障碍或高差不允许营造"
		for tr in trees:
			if tr.wood>0 and Vector2i(tr.gx,tr.gz)==xy:return "占地、障碍或高差不允许营造"
		for d in source.deposits:
			if Vector2i(d.gx,d.gz)==xy:return "占地、障碍或高差不允许营造"
	if spec.has("reqBiome"):
		var near=false
		for dx in range(-2,3):
			for dz in range(-2,3):
				if cell(p+Vector2i(dx,dz)).get("biome","")==spec.reqBiome:near=true
		if not near:return "请靠近相应矿藏营造"
	return ""

func build(kind: String, p: Vector2i, rotation=0) -> bool:
	var error=placement_error(kind,p,rotation)
	if error!="":message(error);return false
	if kind=="demolish":
		var s=occupied.get(p)
		if s and s.team=="player" and not s.get("initial",false):
			for key in ["wood","stone"]:res[key]+=floorf(source.buildings[s.type].cost.get(key,0)*.5)
			if s.type=="hovel":res.maxPop-=8
			destroy(s);return true
		return false
	var spec=source.buildings[kind];var cells=footprint(kind,p,rotation)
	pay(spec.cost)
	for xy in cells:
		if occupied.has(xy):destroy(occupied[xy],false)
	var at=(world([p.x,p.y])+world([cells[-1].x,cells[-1].y]))/2
	var s={"id":next_id(),"type":kind,"label":spec.name,"team":"player","x":at.x,"y":at.y,"z":at.z,
		"gx":p.x,"gz":p.y,"hp":float(spec.hp),"max_hp":float(spec.hp),"height":spec.height,"dead":false,"timer":0.0,"worker":false,"rotation":rotation,
		"cells":cells.map(func(v):return [v.x,v.y]),"half":{"hx":(cells[-1].x-p.x+1)*.5-.01,"hz":(cells[-1].y-p.y+1)*.5-.01}}
	structures.append(s);structure_index[s.id]=s;structures_by_team[s.team].append(s)
	for xy in cells:occupied[xy]=s
	if kind=="hovel":res.maxPop+=8
	if wall_bonus and kind in FORTS:s.hp=roundf(s.hp*1.15);s.max_hp=s.hp
	stats.built+=1;_rebuild_grids();changed.emit("build",s);_bonuses();return true

func _bonuses():
	if not paddy_bonus and structures.filter(func(s):return not s.dead and s.team=="player" and s.type=="farm").size()>=3:
		paddy_bonus=true;message("堡内有田：产粮 +25%，士气 +15%")
	if not wall_bonus and structures.filter(func(s):return not s.dead and s.team=="player" and s.type in FORTS).size()>=10:
		wall_bonus=true
		for s in structures:
			if not s.dead and s.team=="player" and s.type in FORTS:s.max_hp=roundf(s.max_hp*1.15);s.hp=minf(s.max_hp,roundf(s.hp*1.15))
		message("双贤筑堡：城防耐久 +15%，修城省石")

func spawn_unit(role: String, team: String, at: Vector3) -> Dictionary:
	var spec=source.units.get(role,{"hp":1550 if team=="player" else 1750,"dmg":46,"siegeDmg":30,"range":1.55,"speed":3.1,"cooldown":.75})
	var u=spec.duplicate(true)
	u.merge({"id":next_id(),"role":role,"team":team,"x":at.x,"y":elevation(at),"z":at.z,"max_hp":spec.hp,"hp":float(spec.hp),"timer":0.0,
		"phase":0.0,"yaw":0.0,"moving":false,"transit":false,"garrison":0,"slot":Vector3.ZERO,"order":Vector3.INF,"squad":0,"dead":false,"swing":0.0},true)
	units.append(u);units_by_team[team].append(u);changed.emit("spawn",u);return u

func population() -> int:
	return int(res.peasants)+workers.filter(func(w):return not w.dead and not w.ox).size()+units.filter(func(u):return not u.dead and u.team=="player" and u.role!="lord").size()

func recruit_squad(role: String) -> Dictionary:
	return create_squad(role,"player",world(map.campfire))

func create_squad(role: String, team: String, at: Vector3, free=false) -> Dictionary:
	var spec=source.units[role];var cost=recruitment_cost(role)
	if not free:
		var error=recruitment_error(role)
		if error!="":message(error);return {}
		pay(cost);res.peasants-=spec.popCost
	var sq={"id":next_id(),"role":role,"team":team,"members":[],"order":Vector3.INF,"anchor":at,"guard":false}
	for i in int(spec.count):
		var spot=apron(at+Vector3((i%2)*.7,0,floori(i/2.0)*.7),team)
		var u=spawn_unit(role,team,spot);u.squad=sq.id;sq.members.append(u)
	squads.append(sq);squad_index[sq.id]=sq;return sq

func command_squad(sq: Dictionary, target: Vector3):
	sq.order=target
	for u in sq.members:u.garrison=0;u.path_version=-1
	if sq.role=="archer":
		var walls=structures.filter(func(s):return not s.dead and s.team==sq.team and s.type in ["tower","wall"] and pos(s).distance_to(target)<2.5)
		var i=0
		for wall in walls:
			var capacity=4 if wall.type=="tower" else 1
			for slot in capacity:
				if i>=sq.members.size():return
				sq.members[i].pending_garrison=wall.id;sq.members[i].slot=Vector3((slot%2-.5)*.36,0,(floori(slot/2.0)-.5)*.36);i+=1

func set_stance(value: String):
	stance=value
	for sq in squads:
		if sq.team=="player":sq.order=Vector3.INF
	message({"attack":"远海反攻：备足冲车、炮车与护卫，突破双重寨门","defend":"固守当前阵地","sally":"出击驱逐来寇"}[value])

func step(dt: float):
	if state!="play":return
	time+=dt;phase_timer-=0.0 if training else dt;econ_timer-=dt;recruit_timer-=dt
	if phase_timer<=0:
		if night:night=false;wave+=1;phase_timer=70;martial_bonus=true;message("海日破晓：整备粮械，准备反攻")
		else:trigger_wave()
	if econ_timer<=0:
		econ_timer+=1
		var p=maxf(1,population()*.08)
		res.food=maxf(0,res.food-p*{"balanced":.65,"harsh":.3,"generous":1.1}[policy])
		res.gold+={"balanced":2.8,"harsh":5.8,"generous":.9}[policy]
	if recruit_timer<=0:
		recruit_timer={"balanced":5.0,"harsh":8.2,"generous":3.2}[policy]
		if res.peasants<12 and population()<res.maxPop and res.food>=2:res.peasants+=1
	_workers(dt);_transport(dt);_combat(dt);_fire(dt)
	for tr in trees:
		if tr.wood<=0:
			tr.regrow-=dt
			if tr.regrow<=0:tr.wood=40;_rebuild_grids();changed.emit("tree",tr)

func trigger_wave():
	night=true;phase_timer=36
	message(["海上来寇：守住渡口与乡桥","水陆合围：敌船分赴东岸与北滩","困城观稼：粮道与城防决定胜负","烽火平海：乘舟反攻海岛船寨"][mini(wave-1,3)])
	for i in WAVES[mini(wave-1,3)].size():
		var order=WAVES[mini(wave-1,3)][i].duplicate();order.depart=time+i*2.6;pending.append(order)
	changed.emit("sound","bell")

func _storage_route(from:Vector3,kind:String="stockpile") -> Dictionary:
	var best={};var distance=INF;var nav:AStarGrid2D=grids.worker
	var start=grid(apron(from))
	for depot in structures:
		if depot.dead or depot.team!="player" or depot.type!=kind:continue
		var inside={};var entrances={}
		for xy in depot.cells:inside[Vector2i(xy[0],xy[1])]=true
		for at in inside:
			for direction in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
				var door=at+direction
				if not inside.has(door) and nav.is_in_boundsv(door) and not nav.is_point_solid(door):entrances[door]=true
		for door in entrances:
			var path=nav.get_id_path(start,door,false)
			if path.is_empty():continue
			var length=0.0
			for i in range(1,path.size()):length+=Vector2(path[i]-path[i-1]).length()
			if length<distance:distance=length;best={"id":depot.id,"target":world([door.x,door.y]),"distance":length}
	return best

func _delivery(w:Dictionary) -> bool:
	var kind="granary" if w.job=="farm" else "armory" if w.job in ["fletcher","blacksmith"] else "stockpile"
	var depot=_storage_route(pos(w),kind)
	w.storage_version=version
	if depot.is_empty():w.state="wait_delivery";w.timer=1.0;return false
	w.destination=depot.id;w.target=depot.target;w.state="deliver";return true

func _sync_ox_posts():
	var claimed={}
	for quarry in structures:
		if quarry.type=="quarry":quarry.ox_post=0
	for post in structures:
		if post.dead or post.team!="player" or post.type!="oxPost":continue
		var nearest={};var best=float(source.buildings.oxPost.boostRadius)
		for quarry in structures:
			if quarry.dead or quarry.team!="player" or quarry.type!="quarry" or claimed.has(quarry.id):continue
			var distance=pos(post).distance_to(pos(quarry))
			if distance>best:continue
			var target=apron(pos(quarry));var path=route(apron(pos(post)),target,"worker")
			if path.is_empty() or path[-1].distance_to(target)>.6:continue
			best=distance;nearest=quarry
		post.quarry=nearest.get("id",0)
		if nearest.is_empty():continue
		claimed[nearest.id]=true;nearest.ox_post=post.id
		if not post.worker:
			var at=apron(pos(post));post.worker=true
			var ox={"id":next_id(),"team":"player","x":at.x,"y":at.y,"z":at.z,"hp":100.0,"dead":false,"home":post,"job":"oxPost","ox":true,
				"state":"idle","timer":0.0,"speed":2.05,"phase":0.0,"yaw":0.0,"moving":false,"carry":"","amount":0,"target":at,"source_id":0}
			workers.append(ox);changed.emit("worker",ox)

func _ox_worker(w:Dictionary,dt:float):
	if w.state=="deliver":
		if w.get("storage_version",-1)!=version and not _delivery(w):return
		if move(w,w.target,dt,"worker",.5):
			res.stone+=w.amount;stats.deliveries+=1;w.carry="";w.amount=0;w.state="idle"
		return
	if w.state=="wait_delivery":
		w.timer-=dt
		if w.timer<=0:_delivery(w)
		return
	var quarry=structure_by_id(w.home.get("quarry",0))
	if quarry.is_empty() or quarry.dead:
		w.state="idle";move(w,apron(pos(w.home)),dt,"worker",.5);return
	w.state="pickup";w.target=apron(pos(quarry))
	if not move(w,w.target,dt,"worker",.5):return
	var available=int(quarry.get("stone_buffer",0))
	if available<=0:return
	w.amount=mini(12,available);quarry.stone_buffer=available-w.amount;w.carry="stone";_delivery(w)

func _workers(dt: float):
	# Bind carts only when construction changes, not once per simulation tick.
	if get_meta("ox_version",-1)!=version:_sync_ox_posts();set_meta("ox_version",version)
	for home in structures:
		if home.dead or home.team!="player" or home.type not in PRODUCERS or home.worker or res.peasants<1:continue
		res.peasants-=1;home.worker=true
		var at=apron(world(map.campfire))
		var w={"id":next_id(),"team":"player","x":at.x,"y":at.y,"z":at.z,"hp":100.0,"dead":false,"home":home,"job":home.type,"ox":false,
			"state":"home","timer":0.0,"speed":2.85,"phase":0.0,"yaw":0.0,"moving":false,"carry":"","amount":0,"target":apron(pos(home)),"source_id":0}
		workers.append(w);changed.emit("worker",w)
	for w in workers:
		if w.dead:continue
		var home=w.home
		if home.dead:
			w.dead=true
			if not w.ox:res.peasants+=1
			changed.emit("death",w);continue
		w.moving=false
		if w.ox:_ox_worker(w,dt);continue
		if w.state=="raw" and w.get("storage_version",-1)!=version:_assign_source(w)
		if w.state=="deliver" and w.get("storage_version",-1)!=version:
			if not _delivery(w):continue
		if w.state=="wait_delivery":
			w.timer-=dt
			if w.timer<=0:_delivery(w)
			continue
		if w.state in ["home","source","raw","return","deliver"]:
			if not move(w,w.target,dt,"worker",.5):continue
			match w.state:
				"home":_assign_source(w)
				"source":w.state="gather";w.timer=3.2;w.yaw=atan2(w.work_at.x-w.x,w.work_at.z-w.z)
				"raw":
					var ingredient="wood" if w.job=="fletcher" else "iron"
					var amount=2 if w.job=="fletcher" else 1
					if res[ingredient]<amount:continue
					res[ingredient]-=amount;w.carry=ingredient;w.state="return";w.target=apron(pos(home))
				"return":w.state="process";w.timer=1.9;w.carry="";w.yaw=atan2(home.x-w.x,home.z-w.z)
				"deliver":
					var resources={"farm":"food","woodcutter":"wood","quarry":"stone","ironMine":"iron","pitchRig":"oil","fletcher":"bows","blacksmith":"armor"}
					res[resources[w.job]]+=w.amount;stats.deliveries+=1;w.carry="";w.amount=0;_assign_source(w)
		else:
			w.timer-=dt
			if w.timer>0:continue
			if w.state=="gather":
				if w.source_id:
					for tr in trees:
						if tr.id==w.source_id:
							tr.wood-=8
							if tr.wood<=0:tr.regrow=65;_rebuild_grids();changed.emit("tree",tr)
				w.carry={"farm":"wheat","woodcutter":"log","quarry":"stone","ironMine":"ore","pitchRig":"oil"}[w.job]
				w.state="return";w.target=apron(pos(home))
			elif w.state=="process":
				var amounts={"farm":15 if paddy_bonus else 12,"woodcutter":8,"quarry":6,"ironMine":4,"pitchRig":4,"fletcher":2,"blacksmith":2}
				w.amount=amounts[w.job]
				if w.job=="quarry":
					var boosted=home.get("ox_post",0)!=0
					home.stone_buffer=int(home.get("stone_buffer",0))+(9 if boosted else 6)
					if boosted:w.amount=0;_assign_source(w);continue
					w.amount=mini(6,home.stone_buffer);home.stone_buffer-=w.amount
				w.carry={"farm":"food","woodcutter":"wood","quarry":"stone","ironMine":"iron","pitchRig":"oil","fletcher":"bow","blacksmith":"armor"}[w.job]
				_delivery(w)
			else:_assign_source(w)

func _assign_source(w: Dictionary):
	w.source_id=0
	if w.job in ["fletcher","blacksmith"]:
		var depot=_storage_route(pos(w))
		if depot.is_empty():w.state="wait";w.timer=1;return
		w.state="raw";w.target=depot.target;w.storage_version=version;return
	var target=pos(w.home)
	if w.job=="woodcutter":
		var distance=INF
		for tr in trees:
			if tr.wood<=0:continue
			var at=Vector3(tr.x,elevation(Vector3(tr.x,0,tr.z)),tr.z);var d=pos(w.home).distance_to(at)
			if d<distance:distance=d;target=at;w.source_id=tr.id
		if not w.source_id:w.state="wait";w.timer=3;return
	elif w.job!="farm":
		var key={"quarry":"stone","ironMine":"iron","pitchRig":"pitch"}[w.job]
		var best=INF
		for xy in map.deposits[key]:
			var at=world(xy);var dist=at.distance_to(pos(w.home))
			if dist<best:best=dist;target=at
	w.work_at=target;w.target=apron(target);w.state="source"

func _transport(dt: float):
	for order in pending.duplicate():
		if order.depart>time or time-last_departure.island<2.6:continue
		pending.erase(order)
		if enemy_keep.dead:continue
		var sq=create_squad(order.role,"enemy",world(map.ports.island.rally),true)
		launch(sq.members,"enemy",true,order.get("north",false))
	for sq in squads:
		if sq.team!="player":continue
		var alive=sq.members.filter(func(u):return not u.dead and not u.garrison)
		if alive.is_empty() or alive.any(func(u):return u.transit):continue
		var from_island=on_island(pos(alive[0]))
		var want_island=on_island(sq.order) if sq.order!=Vector3.INF else stance=="attack"
		if from_island==want_island:sq.erase("port");continue
		var side="island" if from_island else "mainland"
		var rally=world(map.ports[side].rally);sq.port=rally
		var assembling=stance=="attack" and sq.order==Vector3.INF and not from_island
		if assembling and not _invasion_assembled():continue
		if alive.all(func(u):return pos(u).distance_to(rally)<2.4) and time-last_departure[side]>=1.0:
			launch(alive,"player",from_island);sq.erase("port")
	if not player_lord.dead and not player_lord.transit and player_lord.order!=Vector3.INF and on_island(pos(player_lord))!=on_island(player_lord.order):
		var side="island" if on_island(pos(player_lord)) else "mainland"
		player_lord.port=world(map.ports[side].rally)
		if pos(player_lord).distance_to(player_lord.port)<1.2 and time-last_departure[side]>=2.6:launch([player_lord],"player",side=="island");player_lord.erase("port")
	else:player_lord.erase("port")
	for trip in trips.duplicate():
		trip.elapsed+=dt
		var t=clampf((trip.elapsed-.9)/trip.duration,0,1)
		var center=(trip.a+trip.b)/2+Vector3(0,0,3.5)
		trip.position=(1-t)*(1-t)*trip.a+2*(1-t)*t*center+t*t*trip.b
		var tangent=2*(1-t)*(center-trip.a)+2*t*(trip.b-center)
		trip.yaw=-atan2(tangent.z,tangent.x)
		var complete=trip.elapsed>trip.duration+1.8
		for i in trip.units.size():
			var u=trip.units[i]
			if u.dead:continue
			var seat=Vector3(.72+floori(i/2.0)*.65,.29,(i%2-.5)*.66)
			if trip.large:seat=Vector3(1.25,.29,0) if u.get("isSiege",false) else Vector3(.9+floori(i/2.0)*1.1,.29,(i%2-.5)*1.1)
			seat=seat.rotated(Vector3.UP,trip.yaw)
			var p=trip.position+seat
			if trip.elapsed<.9:p=trip.starts[i].lerp(p,smoothstep(0,.9,trip.elapsed))
			if t>=1:
				var landing=apron(trip.landing+Vector3(i%2,0,floori(i/2.0)),u.team)
				p=p.lerp(landing,smoothstep(0,.9,trip.elapsed-trip.duration-.9))
			if complete:
				u.transit=false;u.path_version=-1;stats["player_landed" if u.team=="player" else "enemy_landed"]+=1
				for sq in squads:
					if sq.id==u.squad:sq.anchor=p
			u.x=p.x;u.y=p.y;u.z=p.z;u.yaw=trip.yaw+PI/2
		if complete:trips.erase(trip);changed.emit("land",trip)

func _invasion_assembled() -> bool:
	var rally=world(map.ports.mainland.rally)
	for sq in squads:
		if sq.team!="player" or sq.order!=Vector3.INF:continue
		for u in sq.members:
			if not u.dead and not u.garrison and not u.transit and not on_island(pos(u)) and pos(u).distance_to(rally)>=2.4:return false
	return true

func launch(members: Array, team: String, from_island: bool, north=false):
	var origin=map.ports.island if from_island else map.ports.mainland
	var dest=(map.ports.north if north else map.ports.mainland) if from_island else map.ports.island
	var a=world(origin.boat);a.y=-.12;var b=world(dest.boat);b.y=-.12
	var trip={"id":next_id(),"team":team,"a":a,"b":b,"position":a,"yaw":0.0,"duration":maxf(5,a.distance_to(b)/2.4),"elapsed":0.0,
		"landing":world(dest.landing),"units":members,"starts":members.map(func(u):return pos(u)),"large":members.any(func(u):return u.get("isSiege",false) or u.role=="knight")}
	for u in members:u.transit=true;u.garrison=0
	trips.append(trip);last_departure["island" if from_island else "mainland"]=time;changed.emit("sail",trip)

func _combat(dt: float):
	for u in units:
		if u.dead:continue
		if u.hp<=0:kill(u);continue
		u.timer=maxf(0,u.timer-dt);u.swing=maxf(0,u.swing-dt);u.moving=false
		if u.transit:continue
		if u.garrison:
			var tower=structure_by_id(u.garrison)
			if tower.is_empty() or tower.dead:u.garrison=0
			elif u.role=="lord":
				u.hp=minf(u.max_hp,u.hp+dt*8);u.x=tower.x;u.y=tower.y+tower.height;u.z=tower.z
				var enemy=nearest_enemy(u,10)
				if enemy and u.timer<=0:shoot(u,enemy)
				continue
			else:
				u.x=tower.x+u.slot.x;u.z=tower.z+u.slot.z
				u.y=tower.y+(1.81 if tower.get("custom",false) else tower.height)
		var sq=squad_index.get(u.squad,{})
		var port=u.get("port",sq.get("port",Vector3.INF))
		if port!=Vector3.INF:move(u,port,dt,u.team,.65);continue
		if u.get("pending_garrison",0):
			var st=structure_by_id(u.pending_garrison)
			if st and not st.dead:
				if move(u,apron(pos(st),u.team),dt,u.team,.7):u.garrison=st.id;u.erase("pending_garrison")
				continue
			else:u.erase("pending_garrison")
		var reach=float(u.range)+(u.y-.4)*.8
		# Siege guns clear defensive fire before spending shots on nearby infantry.
		# Their range is the counter to a fortified landing, on both teams.
		if u.get("isSiege",false) and u.get("isRanged",false) and (u.team=="enemy" or stance=="attack" or sq.get("order",Vector3.INF)!=Vector3.INF):
			var defense=closest_structure(u,reach,true)
			if defense:
				if u.timer<=0:shoot(u,defense,true)
				continue
		var enemy=nearest_enemy(u,maxf(reach,4.1)) if u.role!="ram" else {}
		if enemy:
			var dist=pos(u).distance_to(pos(enemy))
			if dist<=reach:
				u.yaw=atan2(enemy.x-u.x,enemy.z-u.z)
				if u.timer<=0:
					if u.get("isRanged",false):shoot(u,enemy)
					else:enemy.hp-=u.dmg*morale(u.team);u.timer=u.cooldown;u.swing=.3;changed.emit("sound","hit")
				continue
			elif not u.garrison and u.order==Vector3.INF:move(u,pos(enemy),dt,u.team,reach*.85);continue
		if u.garrison:continue
		var goal:Vector3=u.order
		if u.role!="lord":
			if sq.get("order",Vector3.INF)!=Vector3.INF:goal=sq.order
			elif u.team=="enemy":goal=sq.anchor if sq.get("guard",false) else pos(player_keep)
			elif stance=="attack":goal=pos(enemy_keep) if not enemy_keep.dead else pos(enemy_lord)
			elif stance=="sally":
				var foe=nearest_enemy(u,30);goal=pos(foe) if foe else sq.anchor
			else:goal=sq.get("anchor",pos(u))
		if goal!=Vector3.INF:
			var structure=closest_structure(u,reach)
			if structure and (u.team=="enemy" or stance=="attack"):
				if u.get("isRanged",false):
					if u.timer<=0:shoot(u,structure,true)
				else:strike_structure(u,structure)
			elif move(u,goal,dt,u.team,.55) and u.role=="lord":
				u.order=Vector3.INF
				if u.get("enter",0):u.garrison=u.enter;u.erase("enter")
	# Local separation; passengers and garrisons belong to their platforms.
	UnitSeparation.apply(self,units+workers)
	for s in structures:
		if s.dead or s.type!="ballista":continue
		s.timer-=dt
		if s.timer<=0:
			var target=nearest_enemy(s,float(s.get("attackRange",14)))
			if target:target.hp-=float(s.get("attackDamage",68));s.timer=float(s.get("attackCooldown",1.85));changed.emit("shot",{"from":pos(s)+Vector3.UP*2.2,"to":pos(target)+Vector3.UP*.5,"cannon":true});changed.emit("sound","boom")
	for p in projectiles.duplicate():
		p.elapsed+=dt
		if p.elapsed>=p.duration:
			if not p.target.dead:
				if p.structure:damage_structure(p.target,p.damage)
				else:p.target.hp-=p.damage
			projectiles.erase(p)

func nearest_enemy(u: Dictionary, radius: float) -> Dictionary:
	var closest={};var best=radius
	for v in units_by_team["enemy" if u.team=="player" else "player"]:
		if v.dead or v.transit or (v.role=="lord" and v.garrison):continue
		var distance=pos(v).distance_to(pos(u))
		if distance<best:best=distance;closest=v
	return closest

func closest_structure(u: Dictionary, radius: float, prioritize_forts=false) -> Dictionary:
	var best=radius;var result={};var priority=99
	for s in structures_by_team["enemy" if u.team=="player" else "player"]:
		if s.dead:continue
		var d=Vector2(maxf(0,absf(s.x-u.x)-s.half.hx),maxf(0,absf(s.z-u.z)-s.half.hz)).length()
		var rank={"ballista":0,"tower":1,"gate":2,"wall":3,"keep":4}.get(s.type,5) if prioritize_forts else 0
		if d<radius and (rank<priority or (rank==priority and d<best)):best=d;priority=rank;result=s
	return result

func morale(team: String) -> float:
	return (1.15 if paddy_bonus else 1.0)*(1.2 if policy=="generous" else .92 if policy=="harsh" else 1.0) if team=="player" else 1.0

func strike_structure(u: Dictionary, s: Dictionary):
	if u.timer>0:return
	u.timer=u.cooldown;u.swing=.3;u.yaw=atan2(s.x-u.x,s.z-u.z)
	damage_structure(s,u.siegeDmg*morale(u.team));changed.emit("sound","boom" if u.role=="ram" else "hit")

func shoot(u: Dictionary, target: Dictionary, structure=false):
	u.timer=u.cooldown;u.swing=.3;stats.shots+=1
	var from=pos(u)+Vector3.UP*.65;var to=pos(target)+Vector3.UP*.5
	var damage=(u.siegeDmg if structure else u.dmg)*morale(u.team)
	if not structure and not u.get("isSiege",false):damage*=1.0-clampf(float(target.get("arrowResist",0)),0,1)
	projectiles.append({"from":from,"to":to,"target":target,"structure":structure,"damage":damage,"elapsed":0.0,"duration":maxf(.12,from.distance_to(to)/20)})
	changed.emit("shot",{"from":from,"to":to,"cannon":u.get("isSiege",false)});changed.emit("sound","boom" if u.get("isSiege",false) else "arrow")

func damage_structure(s: Dictionary, damage: float):
	s.hp-=damage
	if s.hp<=0:destroy(s)

func destroy(s: Dictionary, rebuild=true):
	s.dead=true;s.hp=0
	for xy in s.cells:occupied.erase(Vector2i(xy[0],xy[1]))
	for u in units:
		if u.garrison==s.id:
			u.garrison=0;var at=apron(pos(s)+Vector3(2.5,0,0),u.team);u.x=at.x;u.z=at.z;u.y=elevation(at)
	if rebuild:_rebuild_grids()
	changed.emit("destroy",s)

func kill(u: Dictionary):
	u.dead=true;stats.kills+=1;changed.emit("death",u)
	if u==player_lord:state="defeat";message("宗祠失守 · 戊午泣血")
	if u==enemy_lord:state="victory";message("海波平定 · 永昌千秋")

func structure_by_id(id: int) -> Dictionary:
	return structure_index.get(id,{})

func repair():
	var count=0
	for s in structures:
		if s.dead or s.team!="player" or s.type not in FORTS or s.hp>=s.max_hp:continue
		var cost=0 if wall_bonus and count%2 else 1
		if res.stone<cost:continue
		res.stone-=cost;s.hp=s.max_hp;count+=1
	message("修复城防 %d 处"%count)

func donate():
	if donation_count>=2:message("本局宗族义捐已尽数调拨（2/2）");return
	donation_count+=1
	for key in {"wood":55,"stone":50,"gold":120,"oil":10}:res[key]+={"wood":55,"stone":50,"gold":120,"oil":10}[key]
	message("宗族义捐：木 +55、石 +50、银 +120、油 +10")

func guard():
	if guard_used:return
	guard_used=true
	create_squad("knight","player",pos(player_keep)+Vector3(3,0,-2),true)
	create_squad("swordsman","player",pos(player_keep)+Vector3(3,0,2),true)
	player_lord.hp=minf(player_lord.max_hp,player_lord.hp+580);message("浙南义军驰援宗祠")

func scout():
	var lanes=[]
	for pair in [["向海东路",[77,51]],["通市北路",[45,11]]]:
		var path=route(world(pair[1]),apron(pos(player_keep)),"worker")
		if not path.is_empty() and path[-1].distance_to(pos(player_keep))<3:lanes.append(pair[0])
	message("斥候："+("、".join(lanes)+"仍可直达村落" if not lanes.is_empty() else "东、北道路均已封堵"))

func ignite():
	for s in structures:
		if not s.dead and s.type=="pitch":fires[s.id]=8.0
	changed.emit("sound","fire");message("猛火油壕点燃")

func _fire(dt: float):
	for id in fires.keys():
		fires[id]-=dt;var s=structure_by_id(id)
		if fires[id]<=0:fires.erase(id);destroy(s);continue
		for u in units:
			if not u.dead and not u.transit and not u.garrison and pos(u).distance_to(pos(s))<1.0:u.hp-=dt*(62 if u.get("isSiege",false) else 42)

func message(text: String):
	changed.emit("message",text)

func snapshot() -> Dictionary:
	return {"state":state,"time":time,"wave":wave,"night":night,"resources":res.duplicate(),"stats":stats.duplicate(),"units":units.filter(func(u):return not u.dead).size(),
		"buildings":structures.filter(func(s):return not s.dead and s.team=="player").size(),"player_hp":player_lord.hp,"enemy_hp":enemy_lord.hp,
		"map":[map.width,map.height],"paddy_bonus":paddy_bonus,"wall_bonus":wall_bonus,"martial_bonus":martial_bonus,
		"stance":stance,"policy":policy,"donations":donation_count,"guard_used":guard_used,
		"fortress":{"keep_hp":enemy_keep.hp,"keep_max_hp":enemy_keep.max_hp,
			"towers":structures.filter(func(s):return s.team=="enemy" and s.type=="tower" and not s.dead).size(),
			"gates":structures.filter(func(s):return s.team=="enemy" and s.type=="gate" and not s.dead).size(),
			"cannons":structures.filter(func(s):return s.team=="enemy" and s.type=="ballista" and not s.dead).size(),
			"crossing_seconds":maxf(5,Vector2(map.ports.mainland.boat[0],map.ports.mainland.boat[1]).distance_to(Vector2(map.ports.island.boat[0],map.ports.island.boat[1]))/2.4)}}
