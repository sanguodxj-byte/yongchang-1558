extends RefCounted
## Save entity IDs, then reconnect references before the session can step.
const Session=preload("res://scripts/session.gd")
const FIELDS=["res","ids","version","time","phase_timer","wave","night","state","speed","stance","policy","donation_count","guard_used","paddy_bonus","wall_bonus","martial_bonus","econ_timer","recruit_timer","last_departure","stats","pending","fires","training"]

static func capture(s) -> Dictionary:
	var data={}
	for field in FIELDS:data[field]=s.get(field)
	data=data.duplicate(true)
	data.structures=[];data.workers=[];data.squads=[];data.trips=[];data.projectiles=[];data.trees=[]
	for b in s.structures:
		var item=b.duplicate(true);item.erase("model");data.structures.append(item)
	data.units=s.units.duplicate(true)
	for w in s.workers:
		var item=w.duplicate(true);item.erase("home");item.home_id=w.home.id;data.workers.append(item)
	for q in s.squads:
		var item=q.duplicate(true);item.erase("members");item.member_ids=q.members.map(func(u):return u.id);data.squads.append(item)
	for trip in s.trips:
		var item=trip.duplicate(true);item.erase("units");item.unit_ids=trip.units.map(func(u):return u.id);data.trips.append(item)
	for shot in s.projectiles:
		var item=shot.duplicate(true);item.erase("target");item.target_id=shot.target.id;data.projectiles.append(item)
	for tree in s.trees:data.trees.append({"id":tree.id,"wood":tree.wood,"regrow":tree.regrow})
	data.links={"player_lord":s.player_lord.id,"enemy_lord":s.enemy_lord.id,"player_keep":s.player_keep.id,"enemy_keep":s.enemy_keep.id}
	return data

static func validate(data:Dictionary) -> String:
	for key in FIELDS+["structures","units","workers","squads","trips","projectiles","trees","links"]:
		if not data.has(key):return "存档缺少必要内容"
	if data.state not in ["play","pause"] or data.policy not in ["balanced","harsh","generous"] or data.stance not in ["defend","sally","attack"]:return "存档状态不受支持"
	for key in ["res","stats","last_departure","fires","links"]:
		if not data[key] is Dictionary:return "存档内容损坏"
	for key in ["structures","units","workers","squads","trips","projectiles","trees","pending"]:
		if not data[key] is Array or data[key].size()>8192:return "存档实体数据损坏"
	var ids={};var buildings={};var units={};var squads={}
	for key in ["structures","units","workers","squads","trips","trees"]:
		for item in data[key]:
			if not item is Dictionary or not item.get("id") is int or ids.has(item.id):return "存档实体编号损坏"
			ids[item.id]=true
			if key=="structures":buildings[item.id]=item
			if key=="units":units[item.id]=item
			if key=="squads":squads[item.id]=item
	for w in data.workers:
		if not buildings.has(w.get("home_id",-1)):return "存档中的工坊关联丢失"
	for q in data.squads:
		if not q.get("member_ids") is Array:return "存档中的部队关联丢失"
		for id in q.member_ids:
			if not units.has(id) or units[id].get("squad",0)!=q.id:return "存档中的部队关联丢失"
	for trip in data.trips:
		if not trip.get("unit_ids") is Array:return "存档中的海运关联丢失"
		for id in trip.unit_ids:
			if not units.has(id):return "存档中的海运关联丢失"
	for shot in data.projectiles:
		if not shot is Dictionary or not (buildings if shot.get("structure",false) else units).has(shot.get("target_id",-1)):return "存档中的战斗目标丢失"
	for key in ["player_lord","enemy_lord","player_keep","enemy_keep"]:
		if not (buildings if key.ends_with("keep") else units).has(data.links.get(key,-1)):return "存档中的宗长或营地丢失"
	return ""

static func restore(source:Dictionary,data:Dictionary):
	if validate(data)!="":return null
	var s=Session.new(source);var originals=s.structure_index.duplicate();var trees={}
	for tree in s.trees:trees[tree.id]=tree
	for item in data.trees:
		if not trees.has(item.id):return null
		for key in ["wood","regrow"]:trees[item.id][key]=item[key]
	for key in FIELDS:s.set(key,data[key].duplicate(true) if data[key] is Dictionary or data[key] is Array else data[key])
	s.structures=data.structures.duplicate(true);s.units=data.units.duplicate(true);s.workers=data.workers.duplicate(true);s.squads=data.squads.duplicate(true);s.trips=data.trips.duplicate(true);s.projectiles=data.projectiles.duplicate(true)
	s.structure_index={};s.squad_index={};s.units_by_team={"player":[],"enemy":[]};s.structures_by_team={"player":[],"enemy":[]};s.occupied={}
	var actors={}
	for b in s.structures:
		if b.get("initial",false) and originals.has(b.id) and originals[b.id].has("model"):b.model=originals[b.id].model
		s.structure_index[b.id]=b;s.structures_by_team[b.team].append(b)
		if not b.dead:
			for cell in b.cells:s.occupied[Vector2i(cell[0],cell[1])]=b
	for u in s.units:actors[u.id]=u;s.units_by_team[u.team].append(u)
	for w in s.workers:w.home=s.structure_index[w.home_id];w.erase("home_id")
	for q in s.squads:
		q.members=q.member_ids.map(func(id):return actors[id]);q.erase("member_ids");s.squad_index[q.id]=q
	for trip in s.trips:trip.units=trip.unit_ids.map(func(id):return actors[id]);trip.erase("unit_ids")
	for shot in s.projectiles:shot.target=(s.structure_index if shot.structure else actors)[shot.target_id];shot.erase("target_id")
	for key in data.links:s.set(key,(s.structure_index if key.ends_with("keep") else actors)[data.links[key]])
	s._rebuild_grids();s.version=data.version;s.set_meta("ox_version",s.version)
	return s
