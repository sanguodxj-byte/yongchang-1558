extends SceneTree
## Fixed rendered views of resource geology; only cameras/material debug passes vary.
var output=""
var game
var shots=[]
var originals={}

func _initialize():
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_NO_FOCUS,true)
	DisplayServer.window_set_position(Vector2i(-3200,0))
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
	call_deferred("run")

func remember(node:Node):
	if node is MeshInstance3D:originals[node]=node.material_override
	for child in node.get_children():remember(child)

func capture(label:String,cell:Array,size:float,yaw:float):
	game.camera_target=game.session.world(cell);game.zoom=size;game.camera_yaw=yaw
	game._move_camera()
	for i in 3:await process_frame
	await RenderingServer.frame_post_draw
	game.get_viewport().get_texture().get_image().save_png(output+"/"+label+".png")
	shots.append({"name":label,"cell":cell,"zoom":size,"yaw":yaw})

func run():
	root.size=Vector2i(1280,800)
	game=load("res://main.tscn").instantiate();root.add_child(game);await process_frame
	game.session.state="pause";game.ui.show_screen("play");game.sound.enabled=false
	game.set_process(false);game.hud.hide();game._sync_visuals(0)
	for deposit in game.assets.data.deposits:
		if not deposit.kind in ["stone","iron"]:continue
		for child in game.world_root.get_children():
			if child is Node3D and child.position.distance_to(Vector3(deposit.x,deposit.y,deposit.z))<.001:
				remember(child)
	assert(originals.size()>=7,"Missing resource meshes")
	for item in [["stone",20.5,40.5],["iron",21.5,63.5]]:
		for angle in [-.52,1.05,2.62,4.19]:
			await capture(item[0]+"-"+str(angle),[item[1],item[2]],9,angle)
		await capture(item[0]+"-close",[item[1],item[2]],5,-.52)
		for i in 24:
			await capture("motion-"+item[0]+"-%02d"%i,[item[1],item[2]],7,-.72+i*.018)
	for mode in ["albedo","normals"]:
		var material=ShaderMaterial.new();var shader=Shader.new()
		shader.code="shader_type spatial;render_mode unshaded,cull_disabled;varying vec3 n;void vertex(){n=NORMAL;}void fragment(){ALBEDO="+("COLOR.rgb" if mode=="albedo" else "normalize(n)*.5+.5")+";}"
		material.shader=shader
		for mesh in originals:mesh.material_override=material
		await capture("stone-"+mode,[20.5,40.5],5,-.52)
		await capture("iron-"+mode,[21.5,63.5],5,-.52)
	for mesh in originals:mesh.material_override=originals[mesh]
	FileAccess.open(output+"/cameras.json",FileAccess.WRITE).store_string(JSON.stringify({"contentHash":game.content_hash,"shots":shots,"resourceMeshes":originals.size()},"  "))
	game.queue_free();await process_frame;quit()
