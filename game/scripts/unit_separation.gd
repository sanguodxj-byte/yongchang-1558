extends RefCounted
## Broad phase only; preserve the original pair order and push equations.

static func _key(actor:Dictionary) -> Vector2i:
	return Vector2i(floori(actor.x),floori(actor.z))

static func _nearby(buckets:Dictionary,key:Vector2i,after:int) -> Array:
	var result=[]
	for x in range(-1,2):
		for z in range(-1,2):
			for index in buckets.get(key+Vector2i(x,z),[]):
				if index>after:result.append(index)
	result.sort();return result

static func apply(session,actors:Array):
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
		var origin=_key(a);var candidates=_nearby(buckets,origin,i);var cursor=0
		while cursor<candidates.size():
			var j:int=candidates[cursor];cursor+=1;var b=actors[j]
			var delta=Vector2(a.x-b.x,a.z-b.z);var distance=delta.length();var radius=.44 if a.get("role","")!="knight" and not a.get("ox",false) else .7
			if distance>=radius:continue
			var direction=delta/distance if distance>.0001 else Vector2.RIGHT.rotated(float(a.id+b.id));var shove=direction*(radius-distance)*.2
			for pair in [[i,shove],[j,-shove]]:
				var actor=actors[pair[0]];var before=_key(actor);var point=Vector3(actor.x+pair[1].x,actor.y,actor.z+pair[1].y);var c=session.cell(session.grid(point))
				if not c.get("walkable",c.get("ground","water")!="water") or session.occupied.has(session.grid(point)):continue
				actor.x=point.x;actor.z=point.z;actor.y=session.elevation(point)
				var after=_key(actor)
				if before!=after:
					buckets[before].erase(pair[0])
					if not buckets.has(after):buckets[after]=[]
					buckets[after].append(pair[0])
			if _key(a)!=origin:
				origin=_key(a);candidates=_nearby(buckets,origin,j);cursor=0
