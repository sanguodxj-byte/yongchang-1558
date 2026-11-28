extends SceneTree
## Copied into a frozen checkout's tests directory by capture-submission.py.
## Replay snapshots are earned using normal costs, health and transport rules.
const Session=preload("res://scripts/session.gd")
const Archive=preload("res://scripts/session_archive.gd")
var folder=""
var shot=""
var prepare=false
var game
var states={}
var actions=[]
var shot_frames={"build":528,"quarry":576,"farm":336,"village":384,"defence":480,"clan":288,"army":336,"sea":528,"siege":288,"finale":408}

func _initialize():
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_NO_FOCUS,true)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):folder=arg.trim_prefix("--output=")
		if arg.begins_with("--shot="):shot=arg.trim_prefix("--shot=")
		if arg=="--prepare":prepare=true
	call_deferred("run")

func save_state(key:String,s):states[key]=Archive.capture(s)

func prep():
	var data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"))
	var work=Session.new(data);work.state="play";save_state("build",work)
	for p in [["quarry",19,39],["oxPost",22,41],["stockpile",25,42],["farm",47,54],["woodcutter",45,38]]:
		assert(work.build(p[0],Vector2i(p[1],p[2])))
	for i in 30*45:
		work.step(1.0/30)
		if i==30*12:save_state("farm",work)
	save_state("quarry",work)
	var s=Session.new(data);s.state="play";s.donate();s.donate();s.guard()
	s.player_lord.order=s.apron(s.pos(s.player_keep),"player");s.player_lord.enter=s.player_keep.id
	var plan=[["farm",47,54],["farm",48,55],["farm",50,56],["woodcutter",45,38],["woodcutter",42,35],
		["quarry",21,39],["ironMine",23,63],["fletcher",46,54],["blacksmith",49,54],
		["ballista",51,46],["ballista",51,50],["ballista",46,42],["ballista",46,38],["ballista",48,42],["ballista",49,47],
		["hovel",41,50],["hovel",41,52],["hovel",43,53],["hovel",45,57],["hovel",50,58],["hovel",45,60],
		["tower",52,49],["tower",47,40],["wall",50,46],["wall",50,47]]
	var roles=["trebuchet","ram","trebuchet","ram","archer","swordsman","knight","trebuchet","ram","archer","swordsman","knight","trebuchet","ram","trebuchet","ram","trebuchet","ram","swordsman"]
	var b=0;var r=0;var attack_at=-1.0;var recent=[]
	for i in 30*700:
		if i%60==0:
			if b<plan.size():
				var item=plan[b]
				if s.affordable(data.buildings[item[0]].cost) and place_near(s,item[0],Vector2i(item[1],item[2])):
					actions.append({"time":s.time,"build":item[0],"cell":[s.structures[-1].gx,s.structures[-1].gz]});b+=1
			if b>=15 and r<roles.size():
				var sq=s.recruit_squad(roles[r])
				if not sq.is_empty():actions.append({"time":s.time,"recruit":roles[r]});r+=1;s.command_squad(sq,s.world([46,59]))
			if attack_at<0 and s.wave>=4 and r==roles.size():
				save_state("army",s);attack_at=s.time;s.policy="generous";s.set_stance("attack")
			if s.res.stone>=5:s.repair()
		if i==30*65:save_state("village",s)
		if not states.has("defence") and s.stats.shots>0:save_state("defence",s)
		if i==30*220:save_state("clan",s)
		if attack_at>0:
			for trip in s.trips:
				if trip.team=="player" and trip.elapsed>8 and not states.has("sea"):save_state("sea",s)
			if s.time>attack_at+88 and not states.has("siege"):save_state("siege",s)
		if i%30==0:
			recent.append(Archive.capture(s))
			if recent.size()>20:recent.pop_front()
		s.step(1.0/30)
		if s.state!="play":break
	assert(s.state=="victory","Normal-cost capture route did not win")
	states.finale=recent[9]
	for key in shot_frames:assert(states.has(key),"Missing capture state: "+key)
	FileAccess.open(folder+"/states.bin",FileAccess.WRITE).store_var(states)
	var summary={}
	for key in states:summary[key]={"time":states[key].time,"state":states[key].state,"buildings":states[key].structures.size(),"units":states[key].units.size()}
	FileAccess.open(folder+"/route.json",FileAccess.WRITE).store_string(JSON.stringify({"passed":true,"stagedResources":false,"scriptedDecisions":true,"attackAt":attack_at,"final":s.snapshot(),"snapshots":summary,"actions":actions},"  "))
	print("CAPTURE_ROUTE ",s.state," ",s.time)

func place_near(s,kind:String,at:Vector2i) -> bool:
	for radius in range(5):
		for x in range(-radius,radius+1):
			for z in range(-radius,radius+1):
				if s.build(kind,at+Vector2i(x,z)):return true
	return false

func run():
	if prepare:prep();quit();return
	states=FileAccess.open(folder+"/states.bin",FileAccess.READ).get_var()
	var view={"build":[47,51,22],"quarry":[22,41,11],"farm":[47,54,8],"village":[47,49,25],"defence":[50,47,20],"clan":[45,48,22],"army":[46,58,19],"sea":[149,51,22],"siege":[193,49,21],"finale":[195,49,18]}[shot]
	var s=Archive.restore(JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json")),states[shot]);assert(s!=null)
	set_meta("restore_game",{"session":states[shot],"view":{"camera":s.world([view[0],view[1]]),"zoom":float(view[2]),"yaw":-.52}})
	game=load("res://main.tscn").instantiate();root.add_child(game)
	game.ui.show_screen("play");game.save_notice="";game._update_hud()
	for i in 24:await process_frame
	game.session.state="play"
	var start_frame=Engine.get_process_frames();var before=game.session.snapshot();var poses=[]
	var followed=0
	if shot=="sea":
		for trip in game.session.trips:
			if trip.team=="player":followed=trip.id;break
	for i in shot_frames[shot]:
		if shot=="build":
			if i==24:game._toggle_tray("build")
			if i==96:game._select_card("build","farm");game.ghost_cell=Vector2i(47,54);game._refresh_ghost()
			if i==144:
				var at=game.camera.unproject_position(game.session.world([47,54]))
				for down in [true,false]:
					var e=InputEventMouseButton.new();e.position=at;e.button_index=MOUSE_BUTTON_LEFT;e.pressed=down;game._unhandled_input(e)
				assert(game.session.stats.built==1)
			if i==192:game._cancel_placement()
		if shot=="clan" and i==24:game.ui.toggle_popover("clan")
		if shot=="army":
			if i==24:game.ui.toggle_popover("command")
			if i==120:game.session.policy="generous";game.session.set_stance("attack");game.ui.close_popover()
		if shot=="sea":
			for trip in game.session.trips:
				if trip.id==followed:game.camera_target=trip.position;break
		if shot in ["defence","siege","finale"] and i%48==0 and game.session.res.stone>=5:game.session.repair()
		if i%24==0:poses.append({"frame":Engine.get_process_frames(),"time":game.session.time,"state":game.session.state,"camera":str(game.camera.global_transform),"snapshot":game.session.snapshot()})
		await process_frame
	if shot=="build":assert(game.session.stats.built==1)
	if shot=="finale":assert(game.session.state=="victory","Final shot did not reach victory")
	await RenderingServer.frame_post_draw
	game.get_viewport().get_texture().get_image().save_png(folder+"/"+shot+"-last.png")
	FileAccess.open(folder+"/"+shot+".json",FileAccess.WRITE).store_string(JSON.stringify({"passed":true,"shot":shot,"fps":24,"startFrame":start_frame,"frames":shot_frames[shot],"initial":before,"final":game.session.snapshot(),"samples":poses,"recording":"fixed 1/24 simulation clock; normal-cost scripted replay snapshots; only camera and UI presentation directed"},"  "))
	game.queue_free();await process_frame;quit()
