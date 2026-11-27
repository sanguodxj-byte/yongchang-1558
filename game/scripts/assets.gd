extends RefCounted

var data: Dictionary
var meshes: Array[ArrayMesh] = []
var surface: ShaderMaterial
var water: ShaderMaterial
var terrain_material:ShaderMaterial
var unlit: StandardMaterial3D
var materials: Dictionary = {}
var source_hash: String

func _init():
	var text = FileAccess.get_file_as_string("res://assets/world.json")
	data = JSON.parse_string(text)
	assert(not data.is_empty(), "Missing migrated world")
	source_hash = text.sha256_text()
	surface = ShaderMaterial.new()
	surface.shader = load("res://shaders/surface.gdshader")
	water = ShaderMaterial.new()
	water.shader = load("res://shaders/water.gdshader")
	terrain_material=ShaderMaterial.new();terrain_material.shader=load("res://shaders/terrain.gdshader")
	unlit = StandardMaterial3D.new()
	unlit.vertex_color_use_as_albedo = true
	unlit.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	unlit.cull_mode = BaseMaterial3D.CULL_DISABLED
	var bytes = FileAccess.get_file_as_bytes("res://assets/geometry.bin.z").decompress_dynamic(128*1024*1024,FileAccess.COMPRESSION_DEFLATE)
	assert(not bytes.is_empty(), "Geometry decompression failed")
	for g in data.geometries:
		var n = int(g.count)
		var start = int(g.offset)
		var floats = bytes.slice(start, start + n * 48).to_float32_array()
		var positions = PackedVector3Array()
		var normals = PackedVector3Array()
		var colors = PackedColorArray()
		var uv = PackedVector2Array()
		positions.resize(n); normals.resize(n); colors.resize(n); uv.resize(n)
		for i in n:
			var k = i * 12
			positions[i] = Vector3(floats[k], floats[k+1], floats[k+2])
			normals[i] = Vector3(floats[k+3], floats[k+4], floats[k+5])
			colors[i] = Color(floats[k+6], floats[k+7], floats[k+8], floats[k+9])
			uv[i] = Vector2(floats[k+10], floats[k+11])
		var indices = bytes.slice(start + n*48, start + n*48 + int(g.indexCount)*4).to_int32_array()
		var arrays = []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = positions
		arrays[Mesh.ARRAY_NORMAL] = normals
		arrays[Mesh.ARRAY_COLOR] = colors
		arrays[Mesh.ARRAY_TEX_UV] = uv
		arrays[Mesh.ARRAY_INDEX] = indices
		var mesh = ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		meshes.append(mesh)

func model(key: String) -> Node3D:
	assert(data.models.has(key), "Missing model: " + key)
	return instantiate(data.models[key])

func instantiate(spec: Dictionary) -> Node3D:
	var node: Node3D
	if spec.has("instances"):
		var multi = MultiMeshInstance3D.new()
		var mm = MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = meshes[int(spec.geo)]
		mm.instance_count = spec.instances.size()
		for i in spec.instances.size():
			var ins = spec.instances[i]
			var m = ins.matrix
			mm.set_instance_transform(i, Transform3D(Basis(Vector3(m[0],m[1],m[2]),Vector3(m[4],m[5],m[6]),Vector3(m[8],m[9],m[10])),Vector3(m[12],m[13],m[14])))
			mm.set_instance_color(i, Color(ins.color[0],ins.color[1],ins.color[2]))
		multi.multimesh = mm
		multi.material_override = surface
		node = multi
	elif spec.has("geo"):
		var mesh = MeshInstance3D.new()
		mesh.mesh = meshes[int(spec.geo)]
		var key=str(spec.get("emissive",false))+str(spec.tint)+str(spec.get("opacity",1))
		if not materials.has(key):
			var color=Color(spec.tint[0],spec.tint[1],spec.tint[2],spec.get("opacity",1))
			var material:Material
			if spec.get("emissive",false):
				material=unlit.duplicate();material.albedo_color=color
				if color.a<1:material.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
			else:
				material=surface.duplicate();material.set_shader_parameter("tint",color)
			materials[key]=material
		mesh.material_override = terrain_material if spec.get("terrain",false) else water if spec.get("water",false) else materials[key]
		node = mesh
	else:
		node = Node3D.new()
	node.name = str(spec.get("name","Model")).validate_node_name()
	var q = spec.quaternion
	node.quaternion = Quaternion(q[0],q[1],q[2],q[3])
	node.position = vec(spec.position)
	node.scale = vec(spec.scale)
	node.visible = spec.get("visible",true)
	for child in spec.children:
		node.add_child(instantiate(child))
	for key in spec.get("links",{}):
		node.set_meta(key,_linked_node(node,spec.links[key]))
	for key in spec.get("linkArrays",{}):
		var links=[]
		for path in spec.linkArrays[key]:links.append(_linked_node(node,path))
		node.set_meta(key,links)
	return node

static func _linked_node(root:Node, path:Variant) -> Node:
	var node=root
	for index in path if path is Array else [path]:
		assert(int(index)>=0 and int(index)<node.get_child_count(),"Invalid model joint reference")
		node=node.get_child(int(index))
	return node

static func vec(a: Array) -> Vector3:
	return Vector3(a[0],a[1],a[2])
