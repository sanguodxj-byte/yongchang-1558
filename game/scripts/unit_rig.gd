extends RefCounted
## Authored poses drive the body; contact solvers close feet and grips.
const Clips=preload("res://scripts/motion_clips.gd")
const TOOLS={"farm":"sickle","woodcutter":"axe","quarry":"pickaxe","ironMine":"pickaxe","pitchRig":"ladle","fletcher":"saw","blacksmith":"hammer"}
const PROCESS_TOOLS={"farm":"hammer","woodcutter":"saw","quarry":"hammer","ironMine":"hammer","pitchRig":"ladle","fletcher":"saw","blacksmith":"hammer"}
static var split_meshes={}

static func _bone(sk:Skeleton3D,name:String,parent:int,rest:Transform3D) -> int:
	var index=sk.get_bone_count();sk.add_bone(name)
	if parent>=0:sk.set_bone_parent(index,parent)
	sk.set_bone_rest(index,rest);return index

static func _socket(sk:Skeleton3D,index:int,name:String) -> BoneAttachment3D:
	var socket=BoneAttachment3D.new();socket.name=name;sk.add_child(socket);socket.bone_idx=index;return socket

static func attach(model:Node3D):
	_attach_animal(model)
	if not model.has_meta("bodyGroup"):return
	var body:Node3D=model.get_meta("bodyGroup");var sk=Skeleton3D.new();sk.name="Skeleton";body.add_child(sk)
	_bone(sk,"Root",-1,Transform3D.IDENTITY)
	var chest_rest:Transform3D=model.get_meta("torso").transform
	for key in ["torso","head","leftLeg","rightLeg","leftArm","rightArm"]:
		assert(model.has_meta(key),"Missing joint: "+key)
		var part:Node3D=model.get_meta(key);var rest=part.transform
		var chest_child=key in ["head","leftArm","rightArm"]
		if chest_child:rest=chest_rest.affine_inverse()*rest
		var index=_bone(sk,key,sk.find_bone("torso") if chest_child else 0,rest)
		var socket=_socket(sk,index,key+"Attachment")
		part.get_parent().remove_child(part);socket.add_child(part);part.transform=Transform3D.IDENTITY
		if key.ends_with("Arm") or key.ends_with("Leg"):
			var arm=key.ends_with("Arm");var upper=.15 if arm else .19;var lower=.14 if arm else .17
			var low_index=_bone(sk,key+"Lower",index,Transform3D(Basis.IDENTITY,Vector3(0,-upper,0)))
			var low_socket=_socket(sk,low_index,key+"LowerAttachment")
			var end_name=key.trim_suffix("Arm")+"Hand" if arm else key.trim_suffix("Leg")+"Foot"
			var end_index=_bone(sk,end_name,low_index,Transform3D(Basis.IDENTITY,Vector3(0,-lower,.01 if arm else 0)))
			var end_socket=_socket(sk,end_index,end_name+"Socket");model.set_meta(end_name,end_socket)
			_split_limb(part,low_socket,end_socket,upper,lower,arm)
	sk.reset_bone_poses();model.set_meta("skeleton",sk)
	var cargo_socket=Node3D.new();cargo_socket.name="CarrySocket";model.add_child(cargo_socket);model.set_meta("carry_socket",cargo_socket)

static func _attach_animal(model:Node3D):
	var horse:Node3D=model.get_meta("horseGroup") if model.has_meta("horseGroup") else null
	var legs=horse.get_meta("legs",[]) if horse else model.get_meta("oxLegs",[])
	if legs.is_empty():return
	var sk=Skeleton3D.new();sk.name="AnimalSkeleton";(horse if horse else model).add_child(sk);_bone(sk,"Root",-1,Transform3D.IDENTITY)
	var rest=[]
	for i in legs.size():
		var leg:Node3D=legs[i];var bind=leg.transform;rest.append(bind.origin)
		var upper=.20 if horse else .12;var lower=.18 if horse else .12;var hoof=.04 if horse else .02
		var top=_bone(sk,"leg"+str(i),0,bind)
		var knee=_bone(sk,"leg"+str(i)+"Lower",top,Transform3D(Basis.IDENTITY,Vector3(0,-upper,0)))
		var foot=_bone(sk,"leg"+str(i)+"Foot",knee,Transform3D(Basis.IDENTITY,Vector3(0,-lower,0)))
		var top_socket=_socket(sk,top,"Upper"+str(i));var knee_socket=_socket(sk,knee,"Lower"+str(i));var foot_socket=_socket(sk,foot,"Hoof"+str(i))
		if horse:
			leg.get_parent().remove_child(leg);top_socket.add_child(leg);leg.transform=Transform3D.IDENTITY;_split_limb(leg,knee_socket,foot_socket,upper,lower,false)
		else:
			leg.hide()
			for piece in [[top_socket,upper,.045,.036],[knee_socket,lower,.034,.026],[foot_socket,hoof,.032,.032]]:
				var node=MeshInstance3D.new();var mesh=CylinderMesh.new();mesh.top_radius=piece[2];mesh.bottom_radius=piece[3];mesh.height=piece[1];mesh.radial_segments=10;node.mesh=mesh;node.position.y=-piece[1]*.5
				var mat=StandardMaterial3D.new();mat.albedo_color=Color("3a4047") if piece[0]!=foot_socket else Color("292a2b");mat.roughness=.88;node.material_override=mat;piece[0].add_child(node)
	sk.reset_bone_poses();model.set_meta("animal_skeleton",sk);model.set_meta("animal_rest",rest)

static func _find(parents:PackedInt32Array,index:int) -> int:
	while parents[index]!=index:index=parents[index]
	return index

static func _parts(mesh:ArrayMesh,upper:float,lower:float,arm:bool) -> Array:
	var key=str(mesh.get_instance_id())+str(upper)+str(lower)
	if split_meshes.has(key):return split_meshes[key]
	var arrays=mesh.surface_get_arrays(0);var vertices:PackedVector3Array=arrays[Mesh.ARRAY_VERTEX];var indices:PackedInt32Array=arrays[Mesh.ARRAY_INDEX]
	var parents=PackedInt32Array();parents.resize(vertices.size());var welded={}
	for i in vertices.size():
		parents[i]=i;var point=vertices[i].snapped(Vector3.ONE*.00001)
		if welded.has(point):parents[i]=welded[point]
		else:welded[point]=i
	for i in range(0,indices.size(),3):
		var root=_find(parents,indices[i])
		for j in [1,2]:parents[_find(parents,indices[i+j])]=root
	var components={}
	for i in range(0,indices.size(),3):
		var root=_find(parents,indices[i])
		if not components.has(root):components[root]={"min":Vector3.INF,"max":-Vector3.INF,"indices":PackedInt32Array()}
		var c=components[root]
		for j in 3:
			var id=indices[i+j];c.indices.append(id);c.min=c.min.min(vertices[id]);c.max=c.max.max(vertices[id])
	var groups=[PackedInt32Array(),PackedInt32Array(),PackedInt32Array(),PackedInt32Array()]
	for c in components.values():
		var center=(c.min+c.max)*.5
		var prop=arm and (c.max.z>.075 or c.min.z<-.08 or c.max.x>.055 or c.min.x<-.055)
		if prop:groups[3].append_array(c.indices);continue
		if c.max.y<=-upper-lower+.003:groups[2].append_array(c.indices);continue
		# Adjacent closed limb primitives can share a vertex at the cuff/knee.
		# Their faces already end on the authored joint plane, so separate at
		# that boundary while keeping whole props in the terminal attachment.
		for i in range(0,c.indices.size(),3):
			var high=maxf(vertices[c.indices[i]].y,maxf(vertices[c.indices[i+1]].y,vertices[c.indices[i+2]].y))
			var group=1 if high<=-upper+.00001 else 0
			for j in 3:groups[group].append(c.indices[i+j])
	var parts=[]
	for group in groups:
		if group.is_empty():parts.append(null);continue
		var result=ArrayMesh.new();var data=arrays.duplicate();data[Mesh.ARRAY_INDEX]=group;result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,data);parts.append(result)
	split_meshes[key]=parts;return parts

static func _split_limb(part:Node3D,lower_socket:Node3D,end_socket:Node3D,upper:float,lower:float,arm:bool):
	# Whole connected primitives stay intact, including blades and cuffs.
	for mesh in part.get_children():
		if not mesh is MeshInstance3D:continue
		var pieces=_parts(mesh.mesh,upper,lower,arm)
		for i in [1,2,3]:
			if pieces[i]==null:continue
			var copy=MeshInstance3D.new();copy.mesh=pieces[i];copy.material_override=mesh.material_override;copy.transform=mesh.transform
			copy.position-=Vector3(0,-upper if i==1 else -upper-lower,.01 if arm and i>=2 else 0)
			var parent=lower_socket if i==1 else end_socket
			if i==3:
				if not end_socket.has_meta("equipment"):
					var equipment=Node3D.new();end_socket.add_child(equipment);end_socket.set_meta("equipment",equipment)
				parent=end_socket.get_meta("equipment")
			parent.add_child(copy)
		if pieces[0]!=null:mesh.mesh=pieces[0]
		else:mesh.queue_free()

static func _chain(sk:Skeleton3D,upper_name:String,lower_name:String,end_name:String,target:Vector3,pole:Vector3,orientation:Quaternion) -> float:
	var chains:Dictionary=sk.get_meta("chains",{})
	if not chains.has(upper_name):
		var upper=sk.find_bone(upper_name);var lower=sk.find_bone(lower_name);var end=sk.find_bone(end_name)
		chains[upper_name]=[upper,lower,end,sk.get_bone_parent(upper),sk.get_bone_rest(lower).origin.length(),sk.get_bone_rest(end).origin,upper_name.ends_with("Arm")];sk.set_meta("chains",chains)
	var info:Array=chains[upper_name];var upper:int=info[0];var lower:int=info[1];var end:int=info[2]
	var start=sk.get_bone_global_pose(upper).origin
	var parent_rotation=sk.get_bone_global_pose(info[3]).basis.get_rotation_quaternion()
	var a:float=info[4];var lower_vector:Vector3=info[5];var b=lower_vector.length()
	var delta=target-start;var distance=clampf(delta.length(),absf(a-b)+.001,a+b-.0005)
	var direction=delta.normalized();var bend=pole-start;var planar=bend-direction*bend.dot(direction)
	if planar.length()<.001:planar=Vector3.FORWARD-direction*Vector3.FORWARD.dot(direction)
	planar=planar.normalized()
	var along=(a*a-b*b+distance*distance)/(2*distance);var height=sqrt(maxf(0,a*a-along*along))
	var elbow=start+direction*along+planar*height
	var upper_rotation=Quaternion(Vector3.DOWN,(elbow-start).normalized())
	sk.set_bone_pose_rotation(upper,parent_rotation.inverse()*upper_rotation)
	var forearm=(start+direction*distance-elbow).normalized();var lower_rotation=Quaternion(lower_vector.normalized(),forearm)
	if info[6]:
		var wanted=orientation*Vector3.RIGHT;wanted=(wanted-forearm*wanted.dot(forearm)).normalized()
		var current=lower_rotation*Vector3.RIGHT
		var twist=atan2(forearm.dot(current.cross(wanted)),current.dot(wanted))
		lower_rotation=Quaternion(forearm,twist*.65)*lower_rotation
	sk.set_bone_pose_rotation(lower,upper_rotation.inverse()*lower_rotation)
	var end_rotation=orientation
	if info[6]:
		var angle=lower_rotation.angle_to(orientation)
		end_rotation=lower_rotation.slerp(orientation,minf(1,.35/maxf(.001,angle)))
	sk.set_bone_pose_rotation(end,lower_rotation.inverse()*end_rotation)
	return absf(delta.length()-distance)

static func _state(model:Node3D,clock:float) -> Dictionary:
	if not model.has_meta("motion"):
		model.set_meta("motion",{"time":clock,"position":model.position,"distance":0.0,"cycle":.10,"stride":.50,"speed":0.0,"walk":0.0,"work":0.0,"carry":0.0,"mode":"","work_start":clock,"feet":{},"lean":0.0,"tool_grip":Vector3(.15,.46,.12),"tool_rotation":Quaternion.IDENTITY,"hand_error":0.0,"dt":0.0})
	return model.get_meta("motion")

static func _ground(point:Vector3,model:Node3D,u:Dictionary,ground:Callable) -> Vector3:
	var result=point
	result.y=ground.call(point) if ground.is_valid() and not u.get("garrison",0) and not u.get("transit",false) else model.position.y
	return result

static func _foot_target(model:Node3D,u:Dictionary,state:Dictionary,side:String,phase:float,ground:Callable,rest:Vector3=Vector3.INF,stride_length:float=.76) -> Vector3:
	var x=-.075 if side=="left" else .075
	var scale_y=model.global_basis.get_scale().y;var stride=stride_length*scale_y;var duty=.56
	var forward=model.global_basis.z.normalized();var right=model.global_basis.x.normalized()
	var origin=model.global_position;var phase01=fposmod(phase,1.0)
	var stance=phase01<duty;var at=origin+right*x*scale_y
	if rest!=Vector3.INF:at=origin+model.global_basis*Vector3(rest.x,0,rest.z)
	if not state.feet.has(side):state.feet[side]={"anchor":_ground(at+forward*stride*(duty*.5-phase01),model,u,ground),"swing_from":at,"stance":stance,"target":at,"settle":0.0}
	var foot:Dictionary=state.feet[side]
	if state.walk<.02:
		var target=_ground(at,model,u,ground)
		if foot.target.distance_to(target)>.015:
			# Settle one foot at a time, leaving the other as support.
			var another_raised=false
			for other in state.feet:
				if other==side:continue
				var other_foot=state.feet[other]
				if other_foot.settle>0 or absf(other_foot.target.y-_ground(other_foot.target,model,u,ground).y)>.006:another_raised=true
			var can_settle=foot.settle>0 or not another_raised or not foot.stance
			if side in ["left","right"]:
				var other="right" if side=="left" else "left"
				var other_ready=not state.feet.has(other) or absf(state.feet[other].target.y-_ground(state.feet[other].target,model,u,ground).y)<.006
				can_settle=foot.settle>0 or not other_ready or side=="left" or not state.feet.has(other) or state.feet[other].target.distance_to(_ground(origin-right*.075*scale_y,model,u,ground))<.015
				if side=="left" and state.feet.has(other) and not other_ready:can_settle=false
			if can_settle:
				if foot.settle==0:foot.swing_from=foot.target
				foot.settle=minf(1.0,foot.settle+state.dt/.18)
				foot.target=foot.swing_from.lerp(target,smoothstep(0,1,foot.settle))+Vector3.UP*Clips.lift(foot.settle)*.5*scale_y
		else:foot.target=target;foot.anchor=target;foot.settle=0;foot.stance=true
		return foot.target
	foot.settle=0.0
	if stance:
		if not foot.stance:foot.anchor=foot.target;foot.anchor=_ground(foot.anchor,model,u,ground)
		foot.target=foot.anchor
	else:
		if foot.stance:foot.swing_from=foot.anchor
		var t=(phase01-duty)/(1-duty)
		var landing=_ground(at+forward*stride*(duty*.5+(1-phase01)),model,u,ground)
		foot.target=foot.swing_from.lerp(landing,smoothstep(0,1,t)*state.walk)+Vector3.UP*Clips.lift(t)*scale_y*state.walk
	foot.stance=stance
	return foot.target

static func tool_for(u:Dictionary) -> String:
	return (PROCESS_TOOLS if u.get("state","")=="process" else TOOLS).get(u.get("job",""),"")

static func _held_objects(model:Node3D,u:Dictionary,assets,kind:String):
	if model.get_meta("tool_kind","")!=kind:
		if model.has_meta("tool"):model.get_meta("tool").free();model.remove_meta("tool")
		if kind!="":
			var tool=assets.model("tool_"+kind);model.get_meta("rightHand").add_child(tool);model.set_meta("tool",tool)
		model.set_meta("tool_kind",kind)
	var carry:String=u.get("carry","")
	if model.get_meta("cargo_kind","")!=carry:
		if model.has_meta("cargo"):model.get_meta("cargo").free();model.remove_meta("cargo")
		if carry!="":
			var cargo=assets.model("cargo_"+carry)
			var parent=model.get_meta("carry_socket") if model.has_meta("carry_socket") else model
			parent.add_child(cargo);cargo.position=Vector3(0,-.06,0) if not u.get("ox",false) else Vector3(0,.25,-.24);model.set_meta("cargo",cargo)
		model.set_meta("cargo_kind",carry)
	if model.has_meta("tool"):model.get_meta("tool").visible=carry==""

static func pose(model:Node3D,u:Dictionary,clock:float,assets,ground:Callable=Callable()):
	var state=_state(model,clock)
	var signature=[model.global_transform,u.get("role",""),u.get("job",""),u.get("state",""),u.get("carry",""),u.get("transit",false),u.get("garrison",0),u.get("swing",0)]
	if state.get("signature",[])==signature and (clock==state.time or state.get("settled",false)):
		state.time=clock;return
	state.signature=signature
	var dt=clampf(clock-state.time,0,.2);state.dt=dt
	var travel=Vector2(model.position.x-state.position.x,model.position.z-state.position.z).length()
	if travel>1.5:travel=0;state.feet.clear()
	var transported=u.get("transit",false) or u.get("garrison",0)!=0
	if state.get("transported",false)!=transported:state.feet.clear();state.walk=0.0
	state.transported=transported
	var velocity=travel/maxf(dt,.0001) if dt>0 and not transported else 0.0
	if dt>0:
		state.speed=lerpf(state.speed,velocity,1-exp(-dt*15));state.walk=move_toward(state.walk,1.0 if velocity>.025 else 0.0,dt/.14)
		state.distance+=travel if not transported else 0.0
		state.stride=lerpf(.50,lerpf(.76,1.0,smoothstep(1.2,2.6,state.speed)),smoothstep(0,.7,state.distance))
		state.cycle+=(travel if not transported else 0.0)/(state.stride*model.global_basis.get_scale().y)
	state.time=clock;state.position=model.position
	if not model.has_meta("skeleton"):
		_held_objects(model,u,assets,"");_animal_and_vehicle(model,u,state,ground);return
	var sk:Skeleton3D=model.get_meta("skeleton");var body:Node3D=model.get_meta("bodyGroup")
	var mounted=u.get("role","")=="knight";var carrying=u.get("carry","")!=""
	var working=u.get("state","") in ["gather","process"] and not carrying and not transported
	var kind=tool_for(u);var mode=u.get("state","")+kind
	if mode!=state.mode:state.mode=mode;state.work_start=clock;state.work=0.0
	var blend=1-exp(-dt*18)
	state.work=lerpf(state.work,1.0 if working else 0.0,blend);state.carry=lerpf(state.carry,1.0 if carrying else 0.0,blend)
	_held_objects(model,u,assets,kind)
	var cycle=state.cycle
	var run=smoothstep(1.2,2.6,state.speed)
	var lean=lerpf(.035,.13,run)*state.walk;var clip={};var phase=0.0
	if kind!="":
		phase=fposmod((clock-state.work_start)/Clips.WORK[kind].duration,1.0);clip=Clips.sample(kind,phase);lean=lerpf(lean,clip.lean,state.work)
	lean=lerpf(lean,.08,state.carry);state.lean=lerpf(state.lean,lean,blend)
	if state.work>.995:state.lean=lean
	var pelvis=-.025-lerpf(.065,.115,run)*state.walk
	if state.walk<1.0:
		for foot in state.feet.values():
			if not foot.stance or foot.settle>0:pelvis=minf(pelvis,-.11)
	if working:pelvis-=.018*state.work
	if mounted:pelvis=0
	sk.set_bone_pose_position(0,Vector3(0,pelvis,0))
	_pose_bone(sk,"torso",Vector3(state.lean,0,0));_pose_bone(sk,"head",Vector3(-state.lean*.65,0,0))
	if not mounted:
		var targets={}
		for side in ["left","right"]:
			if transported:targets[side]=Vector3(-.075 if side=="left" else .075,.05,0)
			else:
				var target=_foot_target(model,u,state,side,cycle+(0 if side=="left" else .5),ground,Vector3.INF,state.stride)
				targets[side]=body.to_local(target)+Vector3(0,.05,0)
			if not transported and state.feet[side].stance and state.feet[side].settle==0:
				var hip=sk.get_bone_rest(sk.find_bone(side+"Leg")).origin
				var horizontal=Vector2(targets[side].x-hip.x,targets[side].z-hip.z).length()
				var reach_height=sqrt(maxf(.01,.359*.359-horizontal*horizontal))
				pelvis=minf(pelvis,targets[side].y+reach_height-hip.y)
		sk.set_bone_pose_position(0,Vector3(0,maxf(-.23,pelvis),0))
		for side in ["left","right"]:
			var local=targets[side]
			var pole=Vector3(-.075 if side=="left" else .075,.25,.65)
			_chain(sk,side+"Leg",side+"LegLower",side+"Foot",local,pole,Quaternion.IDENTITY)
	else:
		for side in ["left","right"]:
			_pose_bone(sk,side+"Leg",Vector3(-.10,0,.10 if side=="left" else -.10))
			_pose_bone(sk,side+"LegLower",Vector3(.32,0,0));_pose_bone(sk,side+"Foot",Vector3(-.12,0,0))
	var sway=sin(cycle*TAU)*.055*state.walk
	var right=Vector3(.155,.46,.055+sway);var left=Vector3(-.155,.46,.055-sway)
	var orientation=Quaternion.from_euler(Vector3(.95,0,-.25)) if kind!="" else Quaternion.IDENTITY
	if kind!="":
		var desired=clip.grip;var tool_basis=Basis.from_euler(Vector3(clip.pitch,clip.yaw,clip.roll))
		right=right.lerp(desired,state.work)
		orientation=orientation.slerp(tool_basis.get_rotation_quaternion(),state.work)
		if clip.support!=0:left=left.lerp(desired+tool_basis*Vector3(0,0,clip.support),state.work)
		else:left=left.lerp(Vector3(-.12,.55,.22),state.work)
	elif u.get("role","") in ["archer","spearman","knight"]:
		right=Vector3(.07,.60,.08);left=Vector3(-.01,.59,.17)
		orientation=Quaternion.from_euler(Vector3(-.05,-.15,0))
		if u.get("swing",0)>0:right.z-=float(u.swing)*.04
	elif u.get("swing",0)>0:
		var strike=float(u.swing)/.3;right=Vector3(.12,.54,.15).lerp(Vector3(.10,.67,.25),strike);orientation=Quaternion.from_euler(Vector3(.15,-.45*strike,0))
	var carry_right=Vector3(.13,.55,.235);var carry_left=Vector3(-.13,.55,.235)
	right=right.lerp(carry_right,state.carry);left=left.lerp(carry_left,state.carry)
	if carrying:orientation=Quaternion.IDENTITY
	if not state.has("right"):state.right=right;state.left=left;state.rotation=orientation
	state.right=state.right.lerp(right,blend);state.left=state.left.lerp(left,blend);state.rotation=state.rotation.slerp(orientation,blend)
	if state.work>.995:state.right=right;state.rotation=orientation
	if kind!="" and clip.support!=0:state.left=state.left.lerp(state.right+Basis(state.rotation)*Vector3(0,0,clip.support),state.work)
	_chain(sk,"rightArm","rightArmLower","rightHand",state.right,Vector3(.42,.43,.04),state.rotation)
	var left_orientation=state.rotation if working and clip.get("support",0)!=0 else Quaternion.IDENTITY
	_chain(sk,"leftArm","leftArmLower","leftHand",state.left,Vector3(-.42,.43,.04),left_orientation)
	var grip=sk.get_bone_global_pose(sk.find_bone("rightHand"));var other=sk.get_bone_global_pose(sk.find_bone("leftHand"))
	state.hand_error=maxf(grip.origin.distance_to(state.right),other.origin.distance_to(state.left))
	if model.has_meta("tool"):model.get_meta("tool").basis=grip.basis.inverse()*Basis(state.rotation)
	var right_socket:Node3D=model.get_meta("rightHand")
	if right_socket.has_meta("equipment"):right_socket.get_meta("equipment").basis=grip.basis.inverse()*Basis(state.rotation)
	var cargo_socket:Node3D=model.get_meta("carry_socket");cargo_socket.position=body.position+(grip.origin+other.origin)*.5+Vector3(0,.065,0)
	state.tool_tip=body.global_transform*(grip.origin+Basis(state.rotation)*Clips.WORK[kind].tip) if kind!="" else Vector3.ZERO
	state.work_phase=phase
	state.settled=not working and state.walk==0 and state.speed<.001 and float(u.get("swing",0))==0 and state.work<.0001 and absf(state.carry-(1 if carrying else 0))<.0001 and absf(state.lean-lean)<.0001 and state.right.distance_to(right)<.0001 and state.left.distance_to(left)<.0001 and state.rotation.angle_to(orientation)<.0001
	if state.settled:
		for foot in state.feet.values():
			if foot.settle!=0 or not foot.stance:state.settled=false;break
	_animal_and_vehicle(model,u,state,ground)

static func _animal_and_vehicle(model:Node3D,u:Dictionary,state:Dictionary,ground:Callable):
	var horse:Node3D=model.get_meta("horseGroup") if model.has_meta("horseGroup") else null
	if model.has_meta("animal_skeleton"):
		var sk:Skeleton3D=model.get_meta("animal_skeleton");var rest:Array=model.get_meta("animal_rest")
		var stride=.45 if horse else .28;var cycle=.30+state.distance/(stride*model.global_basis.get_scale().y)
		if horse:horse.position.y=-.018*state.walk
		if model.has_meta("bodyGroup") and horse:model.get_meta("bodyGroup").position.y=.34+horse.position.y
		for i in rest.size():
			var local=Vector3(rest[i].x,.04 if horse else .02,rest[i].z)
			if not state.transported:
				var target=_foot_target(model,u,state,"hoof"+str(i),cycle+[0.0,.5,.75,.25][i],ground,rest[i],stride)
				local=sk.to_local(target)+Vector3(0,.04 if horse else .02,0)
			_chain(sk,"leg"+str(i),"leg"+str(i)+"Lower","leg"+str(i)+"Foot",local,rest[i]+Vector3(0,-.12,.4 if i<2 else -.4),Quaternion.IDENTITY)
	for wheel in model.get_meta("wheels",[]):
		var radius=.15 if u.get("ox",false) else .17 if u.get("role","")=="ram" else .19
		wheel.rotation.x=state.distance/(radius*model.global_basis.get_scale().x)
	if model.has_meta("ramLog"):
		var ram=model.get_meta("ramLog");var t=clampf(1-float(u.get("swing",0))/.3,0,1)
		ram.position.z=.16*(1-smoothstep(0,1,t));ram.position.y=.42+.02*(1-cos(ram.position.z*3))
	if model.has_meta("armPivot"):
		var gun=model.get_meta("armPivot");gun.position.z=.04-float(u.get("swing",0))*.14;gun.rotation.x=-.20

static func _pose_bone(sk:Skeleton3D,key:String,angles:Vector3):
	var bones:Dictionary=sk.get_meta("pose_bones",{})
	if not bones.has(key):
		var index=sk.find_bone(key);bones[key]=[index,sk.get_bone_rest(index).basis.get_rotation_quaternion()];sk.set_meta("pose_bones",bones)
	var bone:Array=bones[key];sk.set_bone_pose_rotation(bone[0],bone[1]*Quaternion.from_euler(angles))
