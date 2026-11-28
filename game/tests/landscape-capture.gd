extends SceneTree
## Fixed camera audit of the actual startup scene; does not add scenery or units.
var output=""
var game
var shots=[]
var motion=false
var camera_checks=[]

func _initialize():
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_NO_FOCUS,true)
	DisplayServer.window_set_position(Vector2i(-3200,0))
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
		if arg=="--motion":motion=true
	call_deferred("run")

func capture(label:String,x:float,z:float,size:float,yaw:float=0.0):
	game.camera_target=game.session.world([x,z]);game.zoom=size;game.camera_yaw=yaw
	game._move_camera();game._sync_visuals(0);game.hud.hide();game.set_process(false)
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	var path=output+"/"+label+".png"
	game.get_viewport().get_texture().get_image().save_png(path)
	shots.append({"name":label,"cell":[x,z],"zoom":size,"yaw":yaw,"camera":[game.camera.position.x,game.camera.position.y,game.camera.position.z],"path":path})

func run():
	root.size=Vector2i(1280,800)
	game=load("res://main.tscn").instantiate();root.add_child(game);await process_frame
	game.session.state="pause";game.ui.show_screen("play");game.sound.enabled=false
	game.set_process(false)
	var water=float(game.session.source.terrain.waterLevel);var extent=game.get_viewport().get_visible_rect().size
	for angle in 8:
		for target in [[4,5],[220,5],[4,91],[220,91],[112,48]]:
			for size in [26,150,185]:
				game.camera_yaw=angle*PI/4;game.zoom=size;game.camera_target=game.session.world(target);game._move_camera()
				var safe=true
				for pixel in [Vector2.ZERO,Vector2(extent.x,0),extent,Vector2(0,extent.y)]:
					var origin=game.camera.project_ray_origin(pixel);var direction=game.camera.project_ray_normal(pixel)
					var at=origin+direction*((water-origin.y)/direction.y)
					if at.x<-176 or at.x>176 or at.z<-112 or at.z>112:safe=false
				camera_checks.append({"target":target,"requestedZoom":size,"zoom":game.zoom,"angle":angle,"passed":safe})
	game.camera_yaw=0
	for z in 3:
		for x in 7:await capture("tile-%d-%d"%[x,z],16+x*32,16+z*32,48)
	for item in [["village",46,47,26],["bridge-north",38,29,11],["bridge-west",38,49,11],["bridge-south",38,69,11],["bridge-east",54,49,11],["bridge-southeast",54,69,11],["quarry",21,41,17],["iron",22,63,17],["oil",81,65,16],["south-estuary",94,84,30],["island-north",199,29,28],["island-south",209,66,28]]:
		await capture(item[0],item[1],item[2],item[3],-.52)
	await capture("overview",112,48,152)
	await capture("context-margin",4,5,185,-.52)
	if motion:
		for take in [["bridge",38,49,14],["coast",94,82,27]]:
			for i in 36:
				game.camera_target=game.session.world([take[1]+i*.025,take[2]]);game.zoom=take[3];game.camera_yaw=-.52+i*.002
				game._move_camera()
				await process_frame;await RenderingServer.frame_post_draw
				game.get_viewport().get_texture().get_image().save_png(output+"/motion-"+take[0]+"-%02d.png"%i)
	FileAccess.open(output+"/cameras.json",FileAccess.WRITE).store_string(JSON.stringify({"contentHash":game.content_hash,"shots":shots,"tiles":21,"map":[224,96],"cameraChecks":camera_checks},"  "))
	game.queue_free();await process_frame;quit()
