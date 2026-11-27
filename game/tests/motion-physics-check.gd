extends SceneTree
const Assets=preload("res://scripts/assets.gd")
const Rig=preload("res://scripts/unit_rig.gd")
var checks=[]
var output=""

func _initialize():call_deferred("run")
func check(name:String,ok:bool,detail:Variant=null):
	checks.append({"name":name,"passed":ok,"detail":detail});print(name,": ",ok," ",detail)

func bone(sk:Skeleton3D,name:String) -> Transform3D:
	return sk.get_bone_global_pose(sk.find_bone(name))

func sole(sk:Skeleton3D,side:String) -> Vector3:
	return bone(sk,side+"Foot")*Vector3(0,-.05,0) if sk.find_bone(side+"Foot")>=0 else bone(sk,side+"LegLower")*Vector3(0,-.22,0)

func run():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):output=arg.trim_prefix("--report=")
	var assets=Assets.new();var model=assets.model("player_unit_peasant");Rig.attach(model);root.add_child(model)
	var sk:Skeleton3D=model.get_meta("skeleton");var shoulder_error=0.0;var foot_height=0.0;var previous={};var idle_drift=0.0
	for i in 120:
		Rig.pose(model,{"id":2,"job":"quarry","state":"gather","carry":""},i/60.0,assets)
		var chest=bone(sk,"torso");var shoulder=bone(sk,"rightArm").origin
		shoulder_error=maxf(shoulder_error,shoulder.distance_to(chest*Vector3(.148,.33,0)))
	check("shoulders follow chest without separation",shoulder_error<.002,shoulder_error)
	model.free();model=assets.model("player_unit_peasant");Rig.attach(model);root.add_child(model);sk=model.get_meta("skeleton")
	for i in 180:
		Rig.pose(model,{"id":2,"moving":false},i/60.0,assets)
		for side in ["left","right"]:
			var p=sole(sk,side)
			if previous.has(side):idle_drift=maxf(idle_drift,p.distance_to(previous[side]))
			else:previous[side]=p
	check("idle soles remain on ground",idle_drift<.001,idle_drift)
	check("idle pose converges for reuse",model.get_meta("motion").get("settled",false))
	var idle_hand=bone(sk,"rightHand")
	for i in range(180,270):Rig.pose(model,{"id":2,"job":"woodcutter","state":"gather"},i/60.0,assets)
	check("work starts after cached idle",not bone(sk,"rightHand").is_equal_approx(idle_hand) and model.get_meta("tool_kind")=="axe" and model.get_meta("motion").work>.99)
	model.free();model=assets.model("player_unit_peasant");Rig.attach(model);root.add_child(model);sk=model.get_meta("skeleton")
	var movement=[];var contacts=[];var worst=[]
	for i in 240:
		var t=i/60.0;model.position.z=t*.8
		Rig.pose(model,{"id":2,"moving":true,"speed":.8,"phase":t*.8*3.7},t,assets)
		var feet=[]
		for side in ["left","right"]:
			var p=model.global_transform*sole(sk,side);feet.append(p)
			foot_height=maxf(foot_height,-p.y)
		movement.append(feet)
		contacts.append([model.get_meta("motion",{}).get("feet",{}).get("left",{}).get("stance",false),model.get_meta("motion",{}).get("feet",{}).get("right",{}).get("stance",false)])
	check("walking soles do not penetrate",foot_height<.005,foot_height)
	var no_support=0
	for feet in movement:
		if minf(feet[0].y,feet[1].y)>.018:no_support+=1
	check("walking retains a supporting foot",no_support==0,no_support)
	var jumps=0.0
	for i in range(1,movement.size()):
		for side in 2:
			if contacts[i][side] and contacts[i-1][side] and movement[i][side].y<.002 and movement[i-1][side].y<.002:
				var amount=Vector2(movement[i][side].x-movement[i-1][side].x,movement[i][side].z-movement[i-1][side].z).length()
				if amount>jumps:jumps=amount;worst=[i,side,movement[i-1][side],movement[i][side],contacts[i-1],contacts[i]]
	check("planted feet do not skate",jumps<.006,jumps)
	if jumps>=.006:print("WORST ",worst)
	model.free()
	for job in Rig.TOOLS:
		model=assets.model("player_unit_peasant");Rig.attach(model);root.add_child(model);sk=model.get_meta("skeleton")
		var grip_error=0.0;var shaft_clearance=INF;var head_clearance=INF;var work_ground=0.0;var work_samples=[];var nearest=[];var worst_wrist=0.0;var worst_elbow=0.0
		for i in 360:
			Rig.pose(model,{"id":2,"job":job,"state":"gather","carry":""},i/60.0,assets)
			var r=bone(sk,"rightHand");var l=bone(sk,"leftHand");var kind=Rig.TOOLS[job]
			r.basis=Basis(model.get_meta("motion").rotation)
			if i>90:
				if Rig.Clips.WORK[kind].support!=0:grip_error=maxf(grip_error,(r*Vector3(0,0,Rig.Clips.WORK[kind].support)).distance_to(l.origin))
				var a=r*Vector3(0,0,-.16);var b=r*Vector3(0,0,.32);var head=bone(sk,"head").origin+Vector3(0,.06,0)
				var separation=head.distance_to(Geometry3D.get_closest_point_to_segment(head,a,b))
				if separation<shaft_clearance:shaft_clearance=separation;nearest=[i,model.get_meta("motion").work_phase,head,r.origin,a,b]
				head_clearance=minf(head_clearance,head.distance_to(r*Rig.Clips.WORK[kind].tip))
				for side in ["left","right"]:work_ground=maxf(work_ground,absf(sole(sk,side).y))
				for side in ["left","right"]:
					worst_wrist=maxf(worst_wrist,Quaternion.IDENTITY.angle_to(sk.get_bone_pose_rotation(sk.find_bone(side+"Hand"))))
					var shoulder=bone(sk,side+"Arm").origin;var elbow=bone(sk,side+"ArmLower").origin;var hand=bone(sk,side+"Hand").origin
					worst_elbow=maxf(worst_elbow,(elbow-shoulder).normalized().angle_to((hand-elbow).normalized()))
			work_samples.append(model.get_meta("motion").hand_error)
		check("two-hand grip "+job,grip_error<.008,grip_error)
		check("tool clears face "+job,shaft_clearance>.10 and head_clearance>.12,{"shaft":shaft_clearance,"head":head_clearance})
		if shaft_clearance<=.10:print("NEAREST ",job," ",nearest)
		check("work feet stay planted "+job,work_ground<.005,work_ground)
		check("work targets stay within arm reach "+job,work_samples.max()<.015,work_samples.max())
		check("work joints remain within natural range "+job,worst_wrist<deg_to_rad(22) and worst_elbow<deg_to_rad(150),{"wristDegrees":rad_to_deg(worst_wrist),"elbowDegrees":rad_to_deg(worst_elbow)})
		if job in ["quarry","woodcutter","blacksmith"]:
			var kind=Rig.TOOLS[job];var duration=Rig.Clips.WORK[kind].duration
			# Sample the authored contact hold after the initial blend settles.
			var hits=[]
			for phase in [.60,.62]:
				Rig.pose(model,{"id":2,"job":job,"state":"gather","carry":""},duration*(4+phase),assets)
				hits.append(model.to_local(model.get_meta("motion").tool_tip))
			var surface=.24 if job=="quarry" else .28 if job=="woodcutter" else .37
			check("tool contacts workpiece "+job,absf(hits[0].y-surface)<.025 and hits[0].z>.38 and hits[0].z<.57 and hits[0].distance_to(hits[1])<.002,{"hit":hits[0],"surface":surface,"holdTravel":hits[0].distance_to(hits[1])})
		model.free()
	for role in ["knight","ox"]:
		model=assets.model("ox" if role=="ox" else "player_unit_knight");Rig.attach(model);root.add_child(model)
		var animal:Skeleton3D=model.get_meta("animal_skeleton");var penetration=0.0;var previous_rotation=0.0;var wheel_error=0.0
		for i in 180:
			model.position.z=i/60.0*.65
			Rig.pose(model,{"role":role,"ox":role=="ox","moving":true},i/60.0,assets)
			for j in 4:
				var p=animal.global_transform*(bone(animal,"leg"+str(j)+"Foot")*Vector3(0,-.02 if role=="ox" else -.04,0))
				penetration=maxf(penetration,-p.y)
			if role=="ox":
				var wheel=model.get_meta("wheels")[0];wheel_error=maxf(wheel_error,absf(wheel.rotation.x-model.position.z/(.15*model.scale.x)))
		check("animal hooves remain above ground "+role,penetration<.005,penetration)
		if role=="ox":check("cart rolls at travelled distance",wheel_error<.001,wheel_error)
		model.free()
	for speed in [.4,1.5,2.85]:
		model=assets.model("player_unit_peasant");Rig.attach(model);root.add_child(model);sk=model.get_meta("skeleton")
		var peak_penetration=0.0;var max_slide=0.0;var support_fail=0;var last={};var stopped=[];var flight=[]
		var terrain=func(p:Vector3):return p.z*.12
		for i in 360:
			var t=i/60.0;var travel_t=minf(t,4.0)
			model.position=Vector3(0,speed*travel_t*.12,speed*travel_t)
			Rig.pose(model,{"moving":i<240,"speed":speed},t,assets,terrain)
			var motion=model.get_meta("motion");var supporting=0
			for side in ["left","right"]:
				var point=model.global_transform*sole(sk,side);var height=point.y-terrain.call(point)
				peak_penetration=maxf(peak_penetration,-height)
				if height<.018:supporting+=1
				var planted=motion.feet[side].stance and motion.walk>.9 and height<.003
				if i>50 and i<230 and last.get(side,{}).get("planted",false) and planted:max_slide=maxf(max_slide,point.distance_to(last[side].point))
				last[side]={"point":point,"planted":planted}
				if i>=330:stopped.append(point)
			if supporting==0:support_fail+=1;flight.append([i,last.left.point,last.right.point,motion.walk])
		check("slope ground contact at "+str(speed),peak_penetration<.008 and support_fail==0,{"penetration":peak_penetration,"flightFrames":support_fail})
		if support_fail:print("FLIGHT ",flight)
		check("slope planted foot at "+str(speed),max_slide<.008,max_slide)
		var drift=0.0
		for i in range(2,stopped.size()):drift=maxf(drift,stopped[i].distance_to(stopped[i-2]))
		check("feet settle after stop at "+str(speed),drift<.001,drift)
		model.free()
	model=assets.model("player_unit_peasant");Rig.attach(model);root.add_child(model);sk=model.get_meta("skeleton")
	for i in 120:Rig.pose(model,{"carry":"stone","job":"quarry"},i/60.0,assets)
	var carry=model.get_meta("carry_socket").position
	var r=bone(sk,"rightHand").origin;var l=bone(sk,"leftHand").origin
	check("cargo supported between both hands",absf(carry.x-(r.x+l.x)*.5)<.001 and absf(carry.z-r.z)<.01 and absf(carry.z-l.z)<.01 and absf(r.y-l.y)<.01,{"left":l,"right":r,"cargo":carry})
	var before=[]
	for i in sk.get_bone_count():before.append(sk.get_bone_pose(i))
	Rig.pose(model,{"carry":"stone","job":"quarry"},119/60.0,assets)
	check("pause freezes complete pose",range(sk.get_bone_count()).all(func(i):return before[i].is_equal_approx(sk.get_bone_pose(i))))
	model.free()
	model=assets.model("player_unit_spearman");Rig.attach(model);root.add_child(model);sk=model.get_meta("skeleton")
	var ship_error=0.0
	for i in 120:
		model.position=Vector3(i*.04,.2,0);model.rotation.y=i*.004
		Rig.pose(model,{"role":"spearman","transit":true},i/60.0,assets)
		for side in ["left","right"]:
			ship_error=maxf(ship_error,sole(sk,side).distance_to(Vector3(-.075 if side=="left" else .075,0,0)))
	check("passenger feet travel with the deck",ship_error<.002,ship_error);model.free()
	var passed=checks.all(func(c):return c.passed)
	FileAccess.open(output,FileAccess.WRITE).store_string(JSON.stringify({"passed":passed,"checks":checks},"  "))
	quit(0 if passed else 1)
