extends SceneTree
const Assets=preload("res://scripts/assets.gd")
const Rig=preload("res://scripts/unit_rig.gd")
var output=""
var actors=[]
var assets

func _initialize():call_deferred("run")

func run():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
	assert(output!="");DirAccess.make_dir_recursive_absolute(output)
	root.size=Vector2i(1600,900);assets=Assets.new()
	var scene=Node3D.new();root.add_child(scene)
	var env=WorldEnvironment.new();env.environment=Environment.new();env.environment.background_mode=Environment.BG_COLOR;env.environment.background_color=Color("e9e1d1");env.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;env.environment.ambient_light_color=Color("e8dfd0");env.environment.ambient_light_energy=.7;scene.add_child(env)
	var light=DirectionalLight3D.new();light.rotation_degrees=Vector3(-55,-25,0);light.light_energy=1.8;light.shadow_enabled=true;scene.add_child(light)
	var camera=Camera3D.new();camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.size=11;camera.position=Vector3(0,9,16);scene.add_child(camera);camera.look_at(Vector3(0,.8,0));camera.current=true
	var floor_mesh=MeshInstance3D.new();var plane=PlaneMesh.new();plane.size=Vector2(25,16);floor_mesh.mesh=plane;var mat=StandardMaterial3D.new();mat.albedo_color=Color("d9cfbb");floor_mesh.material_override=mat;scene.add_child(floor_mesh)
	var canvas=CanvasLayer.new();scene.add_child(canvas)
	var title=Label.new();title.text="工种工具与骨骼动作 · 模型检视";title.position=Vector2(50,25);title.add_theme_font_override("font",load("res://assets/title-kai.ttf"));title.add_theme_font_size_override("font_size",34);title.add_theme_color_override("font_color",Color("294940"));canvas.add_child(title)
	var jobs=Rig.TOOLS.keys()
	var names=["农夫\n镰刀","伐木\n斧头","采石\n石镐","采矿\n矿镐","熬油\n长柄勺","军器\n手锯","锻甲\n铁锤"]
	for i in jobs.size():
		var model=assets.model("player_unit_peasant");Rig.attach(model);model.position=Vector3((i-3)*2.1,0,-1.8);model.scale*=1.6;model.rotation.y=-.35;scene.add_child(model)
		actors.append({"model":model,"data":{"id":i,"job":jobs[i],"state":"gather","carry":""}})
		var label=Label3D.new();label.text=names[i];label.font=load("res://assets/title-kai.ttf");label.font_size=36;label.pixel_size=.008;label.modulate=Color("294940");label.outline_size=0;label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;label.position=model.position+Vector3(0,2.3,0);scene.add_child(label)
	var roles=["lord","spearman","archer","swordsman","knight","ram","trebuchet"]
	for i in roles.size():
		var model=assets.model("player_unit_"+roles[i]);Rig.attach(model);model.position=Vector3((i-3)*2.1,0,2.1);model.scale*=1.3;model.rotation.y=-.35;scene.add_child(model)
		actors.append({"model":model,"data":{"id":i+10,"role":roles[i],"moving":true,"phase":0}})
	var sample=[]
	for frame in 36:
		var t=frame/12.0
		for actor in actors:actor.data.phase=t*6;Rig.pose(actor.model,actor.data,t,assets)
		await process_frame;await RenderingServer.frame_post_draw
		if frame in [0,12,24]:
			var model=actors[0].model;var p=model.get_meta("rightHand").global_position
			sample.append([p.x,p.y,p.z])
		root.get_texture().get_image().save_png(output.path_join("frame-%02d.png"%frame))
	assert(sample[0]!=sample[1] and sample[1]!=sample[2],"Rendered hand attachments did not move")
	FileAccess.open(output.path_join("motion.json"),FileAccess.WRITE).store_string(JSON.stringify({"passed":true,"handPositions":sample,"frames":36,"fps":12},"  "))
	quit()
