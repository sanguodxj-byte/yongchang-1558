extends RefCounted
## Idle villagers share body clearance with troops and workers. Their negative
## IDs are presentation identities, independent of the economy's population IDs.
static func sync(session):
	var count=mini(24,maxi(0,int(session.res.peasants)))
	while session.civilians.size()>count:session.civilians.pop_back()
	var camp=session.world(session.map.campfire)
	var changed=session.get_meta("civilian_nav_version",-1)!=session.version
	for i in count:
		var fresh=i>=session.civilians.size()
		var actor={"id":-i-1,"role":"peasant","team":"player","dead":false,"moving":false,"x":camp.x,"y":camp.y,"z":camp.z,"yaw":0.0} if fresh else session.civilians[i]
		if not fresh and (not changed or session.UnitSeparation.can_stand(session,actor,session.pos(actor))):continue
		var found=false
		for ring in range(10):
			var radius=1.4+ring*.65;var slots=maxi(12,ceili(TAU*radius/.7))
			for slot in slots:
				var angle=TAU*slot/slots;var candidate=camp+Vector3(cos(angle),0,sin(angle))*radius
				if not session.UnitSeparation.can_stand(session,actor,candidate):continue
				var blocked=false
				for other in session.units+session.workers+session.civilians:
					if other.id==actor.id or other.dead or other.get("transit",false) or other.get("garrison",0):continue
					var gap=session.UnitSeparation.radius(actor)+session.UnitSeparation.radius(other)+.08
					if Vector2(other.x-candidate.x,other.z-candidate.z).length_squared()<gap*gap:blocked=true;break
				if blocked:continue
				actor.x=candidate.x;actor.y=session.elevation(candidate);actor.z=candidate.z;actor.yaw=atan2(camp.x-candidate.x,camp.z-candidate.z)
				found=true;break
			if found:break
		if fresh and found:session.civilians.append(actor)
		elif fresh:break
	session.set_meta("civilian_nav_version",session.version)
