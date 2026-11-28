extends SceneTree
var output=""
var portrait=false
var game
var checks=[]

func _initialize():
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_NO_FOCUS,true)
	DisplayServer.window_set_position(Vector2i(-3200,0))
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
		if arg=="--portrait":portrait=true
	call_deferred("run")

func capture(label:String,at:Vector2i,size:float,yaw:float=-.25):
	game.camera_target=game.session.world([at.x,at.y]);game.zoom=size;game.camera_yaw=yaw
	game._move_camera();game._sync_visuals(0)
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	game.get_viewport().get_texture().get_image().save_png(output+"/"+label+".png")

func run():
	if portrait:
		root.size=Vector2i(512,384);root.transparent_bg=true
		var model=preload("res://scripts/watergate_model.gd").create();root.add_child(model)
		var env_node=WorldEnvironment.new();var env=Environment.new();env_node.environment=env
		env.background_mode=Environment.BG_CLEAR_COLOR;env.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;env.ambient_light_color=Color("d9ded4");env.ambient_light_energy=.8;root.add_child(env_node)
		var sun=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-45,-30,0);sun.light_energy=1.4;root.add_child(sun)
		var camera=Camera3D.new();camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.size=5.7;root.add_child(camera);camera.position=Vector3(4,3.5,7);camera.look_at(Vector3(0,.35,0))
		for i in 4:await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output+"/buildings-waterGate.png");quit();return
	root.size=Vector2i(1280,800)
	game=load("res://main.tscn").instantiate();root.add_child(game);await process_frame
	game.set_process(false);game.session.state="play";game.session.training=true;game.sound.enabled=false;game.ui.show_screen("play")
	var s=game.session
	for key in s.res:s.res[key]=10000
	for t in s.trees:
		if t.gx>=27 and t.gx<=65 and t.gz>=17 and t.gz<=78 and (t.gx<=29 or t.gx>=63 or t.gz<=19 or t.gz>=76):t.wood=0;s.changed.emit("tree",t)
	s._rebuild_grids()
	var failures=[]
	for p in [Vector2i(36,18),Vector2i(54,18),Vector2i(38,77),Vector2i(53,77)]:
		if not s.build("waterGate",p):failures.append([p,s.placement_error("waterGate",p)])
	for z in [18,77]:
		for x in range(28,65):
			var p=Vector2i(x,z)
			if not s.occupied.has(p) and not s.build("wall",p):failures.append([p,s.placement_error("wall",p)])
	for x in [28,64]:
		for z in range(19,77):
			var p=Vector2i(x,z)
			if not s.build("wall",p):failures.append([p,s.placement_error("wall",p)])
	for p in [Vector2i(28,48),Vector2i(64,48),Vector2i(35,28)]:
		if not s.build("gate",p):failures.append([p,s.placement_error("gate",p)])
	checks.append({"name":"actual city fixture builds","passed":failures.is_empty(),"detail":str(failures)})
	game.hud.hide()
	await capture("complete-city",Vector2i(46,48),78,0)
	await capture("north-watergate",Vector2i(36,18),11,-.35)
	await capture("north-watergate-reverse",Vector2i(36,18),11,PI-.35)
	await capture("south-watergate",Vector2i(53,77),12,-.35)
	await capture("bridgehead",Vector2i(37,29),13,-.35)
	# Inspect the genuine desktop card and its selected placement preview.
	game.hud.show();game.ui.category="castle";game.ui.toggle_tray("build");await process_frame
	checks.append({"name":"desktop construction card exists","passed":game.ui.card_buttons.has("waterGate")})
	await capture("desktop-card",Vector2i(46,23),28,0)
	print("VISUAL select watergate")
	game.ui.card_buttons.waterGate.pressed.emit();game.ghost_cell=Vector2i(38,38);game.build_rotation=0;game._refresh_ghost()
	print("VISUAL watergate selected")
	checks.append({"name":"watergate card selects shared command","passed":game.selected_build=="waterGate"})
	await capture("construction-preview",Vector2i(38,38),12,-.35)
	game._cancel_placement()
	root.size=Vector2i(844,390);game._resize_ui();await process_frame
	game.ui.category="castle";game.ui.toggle_tray("build");game.ui.card_page=0;game.ui._render_cards();await process_frame
	checks.append({"name":"compact construction card exists","passed":game.ui.card_buttons.has("waterGate")})
	await capture("compact-card",Vector2i(46,23),28,0)
	var report={"passed":checks.all(func(c):return c.passed),"checks":checks,"worldHash":game.content_hash}
	FileAccess.open(output+"/visual.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	game.queue_free();await process_frame;quit(0 if report.passed else 1)
