extends SceneTree
const Assets=preload("res://scripts/assets.gd")
const Rig=preload("res://scripts/unit_rig.gd")
const Props=preload("res://scripts/work_props.gd")
var output=""
var mode="work"
var assets
var actors=[]

func _initialize():call_deferred("run")

func run():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
		if arg.begins_with("--mode="):mode=arg.trim_prefix("--mode=")
	assert(output!="");DirAccess.make_dir_recursive_absolute(output)
	var viewport=SubViewport.new();viewport.size=Vector2i(1500,900);viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS;root.add_child(viewport)
	assets=Assets.new();var scene=Node3D.new();viewport.add_child(scene)
	var env=WorldEnvironment.new();env.environment=Environment.new();env.environment.tonemap_mode=Environment.TONE_MAPPER_FILMIC;env.environment.background_mode=Environment.BG_COLOR;env.environment.background_color=Color("d8d3c8");env.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;env.environment.ambient_light_color=Color("f1e6d5");env.environment.ambient_light_energy=.65;scene.add_child(env)
	var sun=DirectionalLight3D.new();sun.light_energy=1.8;sun.rotation_degrees=Vector3(-50,-30,0);sun.shadow_enabled=true;scene.add_child(sun)
	var floor=MeshInstance3D.new();var plane=PlaneMesh.new();plane.size=Vector2(40,40);floor.mesh=plane;var mat=StandardMaterial3D.new();mat.albedo_color=Color("777666");mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;floor.material_override=mat;scene.add_child(floor)
	for line in range(-10,11):
		for axis in 2:
			var grid=MeshInstance3D.new();var box=BoxMesh.new();box.size=Vector3(.008,.002,20) if axis==0 else Vector3(20,.002,.008);grid.mesh=box;grid.position=Vector3(line,.002,0) if axis==0 else Vector3(0,.002,line);var color=StandardMaterial3D.new();color.albedo_color=Color("828170");color.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;grid.material_override=color;scene.add_child(grid)
	var camera=Camera3D.new();camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.size=5.0 if mode=="work" else 6;camera.position=Vector3(9,7,12) if mode=="work" else Vector3(11,6,8);scene.add_child(camera);camera.look_at(Vector3(0,.5,0));camera.current=true
	var canvas=CanvasLayer.new();scene.add_child(canvas);var label=Label.new();label.position=Vector2(35,20);label.add_theme_font_override("font",load("res://assets/title-kai.ttf"));label.add_theme_font_size_override("font_size",30);label.add_theme_color_override("font_color",Color("294940"));canvas.add_child(label)
	if mode=="work":
		label.text="工种动作精修 · 双手握持 / 接触 / 收回"
		for i in 4:
			var job=["woodcutter","quarry","fletcher","blacksmith"][i]
			var model=assets.model("player_unit_peasant");Rig.attach(model);model.position=Vector3((i%2-.5)*2.2,0,(floori(i/2.0)-.5)*2.2);model.rotation.y=-.25;scene.add_child(model)
			var prop=Props.create(job,"gather");prop.transform=model.transform;scene.add_child(prop)
			actors.append({"model":model,"origin":model.position,"data":{"id":i,"job":job,"state":"gather","carry":""}})
	else:
		label.text="行走与运输精修 · 脚底落地 / 负重 / 车轮"
		for i in 4:
			var model=assets.model(["player_unit_peasant","player_unit_peasant","player_unit_knight","ox"][i]);Rig.attach(model);model.position=Vector3((i-1.5)*1.8,0,-1.1);scene.add_child(model)
			actors.append({"model":model,"origin":model.position,"data":{"id":i,"moving":true,"carry":"stone" if i==1 else "","role":"knight" if i==2 else "peasant","ox":i==3}})
	var frames=96
	for frame in frames:
		var t=frame/24.0
		for actor in actors:
			if mode!="work":actor.model.position=actor.origin+Vector3(0,0,minf(t,3)*.7)
			Rig.pose(actor.model,actor.data,t,assets)
		await process_frame;RenderingServer.force_draw(false)
		viewport.get_texture().get_image().save_png(output.path_join("frame-%03d.png"%frame))
		if frame%24==0:print("CAPTURE ",mode," ",frame)
	FileAccess.open(output.path_join("capture.json"),FileAccess.WRITE).store_string(JSON.stringify({"mode":mode,"frames":frames,"fps":24,"passed":true},"  "));quit()
