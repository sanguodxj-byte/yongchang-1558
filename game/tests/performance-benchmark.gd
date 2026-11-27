extends SceneTree
var game
var output=""
var results=[]
var duration=20.0
var warmup=8.0
var assets
var deterministic=false

func _initialize():
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_NO_FOCUS,true)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
		if arg.begins_with("--duration="):duration=float(arg.trim_prefix("--duration="))
		if arg=="--deterministic":deterministic=true
	call_deferred("run")

func run():
	for scenario in ["village","production","army","battle","overview","paused"]:
		game=load("res://main.tscn").instantiate();root.add_child(game)
		await process_frame
		game.session.state="play";game.ui.show_screen("play");game.session.phase_timer=9999
		if scenario!="village":
			for resource in game.session.res:game.session.res[resource]=1000
			game.session.res.peasants=12;game.session.res.maxPop=200
			for item in [["farm",47,54],["woodcutter",45,38],["quarry",19,39],["oxPost",22,41],["stockpile",25,42],["ironMine",22,62],["pitchRig",80,65],["fletcher",46,54],["blacksmith",49,54]]:
				if not place_near(item[0],Vector2i(item[1],item[2])):push_error("Fixture cannot place "+item[0]);quit(1);return
		if scenario in ["army","battle","overview","paused"]:
			for i in 18:game.session.create_squad(["spearman","archer","swordsman","knight","ram","trebuchet"][i%6],"player",game.session.world([45+i%6,57+floori(i/6.0)*2]),true)
		if scenario=="battle":
			for i in 12:game.session.create_squad(["spearman","archer","swordsman"][i%3],"enemy",game.session.world([50+i%4,55+floori(i/4.0)*2]),true)
			for unit in game.session.units:unit.hp=1000000;unit.max_hp=1000000
			game.camera_target=game.session.world([49,57]);game.zoom=20
		if scenario=="overview":game._overview()
		await wait_seconds(warmup)
		if scenario=="paused":game.session.state="pause";game.ui.show_screen("pause")
		var before=game.session.snapshot();var state_before=state_digest();var view_before=view();game.performance_probe.reset()
		await wait_seconds(duration)
		var rows=game.performance_probe.rows.duplicate();var after=game.session.snapshot()
		results.append({"scenario":scenario,"staged":scenario!="village","warmupSeconds":warmup,"sampleSeconds":duration,"initial":before,"final":after,"stateInitialSha256":state_before,"stateFinalSha256":state_digest(),"viewInitial":view_before,"viewFinal":view(),"rows":rows,"columns":game.performance_probe.COLUMNS})
		print("BENCHMARK ",scenario," ",rows.size())
		game.queue_free();await process_frame;await process_frame
	FileAccess.open(output,FileAccess.WRITE).store_string(JSON.stringify({"passed":true,"renderer":RenderingServer.get_video_adapter_name(),"profile":{"viewport":str(root.size),"msaaEnum":root.msaa_3d,"fixedDelta":deterministic,"sampleClock":"simulation frames" if deterministic else "wall time"},"scenarios":results},"  "));quit()

func wait_seconds(seconds:float):
	if deterministic:
		for i in roundi(seconds*60):await process_frame
		return
	var start=Time.get_ticks_usec()
	while (Time.get_ticks_usec()-start)/1000000.0<seconds:await process_frame

func place_near(kind:String,at:Vector2i) -> bool:
	for radius in range(5):
		for x in range(-radius,radius+1):
			for z in range(-radius,radius+1):
				if game.session.build(kind,at+Vector2i(x,z)):return true
	return false

func view() -> Dictionary:
	return {"camera":str(game.camera.global_transform),"target":str(game.camera_target),"zoom":game.zoom,"viewport":str(root.size),"msaaEnum":root.msaa_3d,"renderSize":str(game.get_viewport().get_visible_rect().size),"shadow":game.sun.shadow_enabled}

func state_digest() -> String:
	# Outside the timed window; includes every entity, path, timer and reference ID.
	return var_to_bytes(game.SaveStore.Archive.capture(game.session)).hex_encode().sha256_text()
