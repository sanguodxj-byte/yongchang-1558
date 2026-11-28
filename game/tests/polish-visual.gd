extends SceneTree
var output=""
var game
func _initialize():
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_NO_FOCUS,true)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--output="):output=a.trim_prefix("--output=")
	call_deferred("run")
func run():
	game=load("res://main.tscn").instantiate();root.add_child(game);await process_frame
	game.session.state="pause";game.ui.show_screen("play");game.sound.enabled=false
	for key in game.session.res:game.session.res[key]=1000
	for p in [["farm",47,54],["woodcutter",45,38],["quarry",19,39],["oxPost",22,41],["stockpile",25,42],["gate",47,57],["tower",50,54]]:game.session.build(p[0],Vector2i(p[1],p[2]))
	game.session._workers(.1)
	for i in 6:game.session.create_squad(["spearman","archer","swordsman","knight","ram","trebuchet"][i],"player",game.session.world([45+i,60]),true)
	game.set_process(false)
	var shader=game.assets.surface.shader;var current_code=shader.code
	var terrain=game.assets.terrain_material.shader;var terrain_code=terrain.code
	for item in [["village",47,51,21],["stone",48,56,11],["quarry",22,41,12],["army",48,60,12]]:
		game.camera_target=game.session.world([item[1],item[2]]);game.zoom=item[3]
		game._move_camera();game._sync_visuals(0);game._update_hud()
		for i in 8:await process_frame
		await RenderingServer.frame_post_draw
		game.get_viewport().get_texture().get_image().save_png(output+"/"+item[0]+".png")
		shader.code=FileAccess.get_file_as_string(output+"/before/game/shaders/surface.gdshader")
		terrain.code=FileAccess.get_file_as_string(output+"/before/game/shaders/terrain.gdshader")
		game.contact_shadows.hide()
		for i in 4:await process_frame
		await RenderingServer.frame_post_draw
		game.get_viewport().get_texture().get_image().save_png(output+"/"+item[0]+"-before-material.png")
		shader.code=current_code;terrain.code=terrain_code;game.contact_shadows.show()
	game.queue_free();await process_frame;quit()
