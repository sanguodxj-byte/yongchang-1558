extends RefCounted
## Symmetric body clearances and bounded corrections; movement uses the same bodies.
const RADII={"knight":.49,"ram":.62,"trebuchet":.58}

static func radius(actor:Dictionary) -> float:
	if actor.get("ox",false):return .58
	return RADII.get(actor.get("role",""),.255)

static func begin(session,actors:Array):
	var buckets={}
	for a in actors:
		if a.dead or a.get("transit",false) or a.get("garrison",0):continue
		var key=Vector2i(floori(a.x/2),floori(a.z/2))
		if not buckets.has(key):buckets[key]=[]
		buckets[key].append(a)
	session.set_meta("crowd_buckets",buckets)

static func nearby(session,p:Vector3) -> Array:
	var buckets:Dictionary=session.get_meta("crowd_buckets",{});var result=[];var key=Vector2i(floori(p.x/2),floori(p.z/2))
	for x in range(-1,2):
		for z in range(-1,2):result.append_array(buckets.get(key+Vector2i(x,z),[]))
	return result

static func can_stand(session,actor:Dictionary,p:Vector3) -> bool:
	# Terrain clearance follows the narrow body width; the larger crowd circle
	# includes weapon/cart length and must not make a one-cell approach impassable.
	var team="worker" if actor.has("job") else actor.get("team","player");var r=minf(.29,radius(actor)*.72)
	for offset in [Vector3.ZERO,Vector3(r,0,0),Vector3(-r,0,0),Vector3(0,0,r),Vector3(0,0,-r)]:
		var at=p+offset;var xy=session.grid(at);var c=session.cell(xy)
		if c.is_empty() or not c.get("walkable",c.get("ground","water")!="water"):return false
		var b=session.occupied.get(xy,{})
		if not b.is_empty() and not b.dead and b.type not in ["campfire","stockpile","pitch"]:
			if b.type!="gate" or not (b.team==team or team=="worker" and b.team=="player"):return false
		var nav=session.grids.get(team)
		if nav and (not nav.is_in_boundsv(xy) or nav.is_point_solid(xy)):return false
	return true

static func steer(session,a:Dictionary,p:Vector3,wanted:Vector3,dt:float) -> Vector3:
	var step=wanted-p;step.y=0
	if step.length_squared()<.000001:return p
	var direction=step.normalized();var side=Vector3(direction.z,0,-direction.x);var avoidance=Vector3.ZERO
	var neighbors=nearby(session,p)
	for b in neighbors:
		if a.id==b.id or b.dead or b.get("transit",false) or b.get("garrison",0):continue
		var delta=session.pos(b)-p;delta.y=0;var sum=radius(a)+radius(b)
		var ahead=delta.dot(direction);var lateral=delta.dot(side)
		if ahead>0 and ahead<sum+.65 and absf(lateral)<sum+.1:
			avoidance+=side*(-1.0 if lateral>.08 else 1.0)*(1.0-ahead/(sum+.65))*.55
	var candidate=p+(direction+avoidance).normalized()*step.length()
	if not can_stand(session,a,candidate):
		candidate=wanted
		if not can_stand(session,a,candidate):
			var px=Vector3(wanted.x,p.y,p.z);var pz=Vector3(p.x,p.y,wanted.z)
			candidate=px if can_stand(session,a,px) else pz if can_stand(session,a,pz) else p
	# Resolve all proposed positions together below. Rejecting a move against
	# every actor's old position makes an otherwise moving convoy deadlock.
	return candidate

static func _key(actor:Dictionary) -> Vector2i:
	return Vector2i(floori(actor.x/2),floori(actor.z/2))

static func _nearby(buckets:Dictionary,key:Vector2i,after:int) -> Array:
	var result=[]
	for x in range(-1,2):
		for z in range(-1,2):
			for index in buckets.get(key+Vector2i(x,z),[]):
				if index>after:result.append(index)
	result.sort();return result

static func apply(session,actors:Array):
	for iteration in 4:
		if not _solve(session,actors):break
	for a in actors:
		if not a.has("render_from") or not a.has("move_intent"):continue
		var intent:Vector3=a.move_intent;var actual=session.pos(a)-a.render_from;actual.y=0
		var walked=clampf(actual.dot(intent.normalized()),0,intent.length()) if intent.length_squared()>.000001 else 0.0
		a.motion_distance=float(a.get("render_motion_from",0.0))+walked
		if walked<.001:a.moving=false

static func _solve(session,actors:Array) -> bool:
	var changed=false
	var buckets={}
	for i in actors.size():
		var actor=actors[i]
		if actor.dead or actor.get("transit",false) or actor.get("garrison",0):continue
		var key=_key(actor)
		if not buckets.has(key):buckets[key]=[]
		buckets[key].append(i)
	for i in actors.size():
		var a=actors[i]
		if a.dead or a.get("transit",false) or a.get("garrison",0):continue
		var origin=_key(a);var candidates=_nearby(buckets,origin,i);var cursor=0;var a_radius=radius(a)
		while cursor<candidates.size():
			var j:int=candidates[cursor];cursor+=1;var b=actors[j]
			var delta=Vector2(a.x-b.x,a.z-b.z);var clearance=a_radius+radius(b)
			if delta.length_squared()>=(clearance-.006)*(clearance-.006):continue
			var distance=delta.length()
			var direction=delta/distance if distance>.0001 else Vector2.RIGHT.rotated(float(a.id*17+b.id*31));var shove=direction*minf(.12,(clearance-distance)*.54)
			var wa=.35 if a.get("moving",false) else 1.0;var wb=.35 if b.get("moving",false) else 1.0
			if a.get("state","") in ["gather","process"]:wa=.15
			if b.get("state","") in ["gather","process"]:wb=.15
			for pair in [[i,shove*2*wa/(wa+wb)],[j,-shove*2*wb/(wa+wb)]]:
				var actor=actors[pair[0]];var before=_key(actor);var point=Vector3(actor.x+pair[1].x,actor.y,actor.z+pair[1].y);var c=session.cell(session.grid(point))
				if not can_stand(session,actor,point):continue
				changed=true
				actor.x=point.x;actor.z=point.z;actor.y=session.elevation(point)
				var after=_key(actor)
				if before!=after:
					buckets[before].erase(pair[0])
					if not buckets.has(after):buckets[after]=[]
					buckets[after].append(pair[0])
			if _key(a)!=origin:
				origin=_key(a);candidates=_nearby(buckets,origin,j);cursor=0
	return changed
