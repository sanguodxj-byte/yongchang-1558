extends RefCounted
## Small workpieces sit in the clear apron, so tools meet material outside roofs.
static var materials={}

static func _material(color:String) -> StandardMaterial3D:
	if not materials.has(color):
		var mat=StandardMaterial3D.new();mat.albedo_color=Color(color);mat.roughness=.9;materials[color]=mat
	return materials[color]

static func _box(root:Node3D,at:Vector3,size:Vector3,color:String):
	var item=MeshInstance3D.new();var mesh=BoxMesh.new();mesh.size=size;item.mesh=mesh;item.position=at;item.material_override=_material(color);root.add_child(item)

static func _cylinder(root:Node3D,at:Vector3,height:float,radius:float,color:String):
	var item=MeshInstance3D.new();var mesh=CylinderMesh.new();mesh.height=height;mesh.top_radius=radius;mesh.bottom_radius=radius*.95;mesh.radial_segments=12;item.mesh=mesh;item.position=at;item.material_override=_material(color);root.add_child(item)

static func create(job:String,stage:String) -> Node3D:
	var root=Node3D.new();root.name="Workpiece_"+job+"_"+stage
	var processing=stage=="process"
	if job=="farm" and not processing:
		for i in 5:
			var at=Vector3(-.10+i*.045,.14,.60+(i%2)*.04)
			_box(root,at,Vector3(.014,.28,.014),"788744");_box(root,at+Vector3(0,.145,0),Vector3(.045,.055,.025),"c5a44c")
	elif job=="woodcutter" and not processing:
		_cylinder(root,Vector3(.04,.10,.44),.20,.115,"785135");_cylinder(root,Vector3(.04,.24,.44),.08,.065,"ad8655")
	elif job in ["quarry","ironMine"] and not processing:
		_box(root,Vector3(.08,.12,.44),Vector3(.25,.24,.22),"92918a" if job=="quarry" else "756855")
	elif job=="pitchRig":
		_cylinder(root,Vector3(.13,.155,.53),.31,.15,"624638")
		_cylinder(root,Vector3(.13,.31,.53),.012,.13,"2c3330")
	elif job in ["fletcher","woodcutter"]:
		for x in [-.02,.23]:_box(root,Vector3(x,.22,.48),Vector3(.045,.44,.12),"735336")
		_box(root,Vector3(.105,.445,.48),Vector3(.42,.04,.22),"9e7846")
		_box(root,Vector3(.10,.485,.48),Vector3(.32,.04,.08),"b08b55")
	else:
		_box(root,Vector3(.12,.17,.48),Vector3(.25,.34,.24),"6c685c")
		_box(root,Vector3(.12,.355,.48),Vector3(.24,.03,.18),"454c4c" if job=="blacksmith" else "b3a68e")
	return root
