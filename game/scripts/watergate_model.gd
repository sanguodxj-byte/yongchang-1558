extends RefCounted
## Masonry follows the same span as the occupied cells; the arch stays open to water.

static func _face(parts:Dictionary,points:Array,color:Color,material_id:int=1):
	var normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized()
	var start=parts.vertices.size()
	for p in points:parts.vertices.append(p);parts.normals.append(normal);parts.colors.append(color);parts.uv.append(Vector2(material_id,0))
	parts.indices.append_array([start,start+2,start+1,start,start+3,start+2])

static func _box(parts:Dictionary,center:Vector3,size:Vector3,color:Color,material_id:int=1):
	var v=[]
	for corner in [Vector3(-1,-1,-1),Vector3(1,-1,-1),Vector3(1,-1,1),Vector3(-1,-1,1),Vector3(-1,1,-1),Vector3(1,1,-1),Vector3(1,1,1),Vector3(-1,1,1)]:v.append(center+corner*size*.5)
	for f in [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]:_face(parts,[v[f[0]],v[f[1]],v[f[2]],v[f[3]]],color,material_id)

static func create(span:float=5.0,bottom:float=-1.15) -> Node3D:
	var parts={"vertices":PackedVector3Array(),"normals":PackedVector3Array(),"colors":PackedColorArray(),"indices":PackedInt32Array(),"uv":PackedVector2Array()}
	var stone=Color("777167").srgb_to_linear();var trim=Color("898477").srgb_to_linear();var iron=Color("343b39").srgb_to_linear()
	var half=span*.5;var opening=half-1.0;var spring=.30;var rise=.70;var deck=1.43
	# Full-depth bank abutments, with staggered visible masonry courses.
	for side in [-1,1]:
		_box(parts,Vector3(side*(half-.50),(deck+bottom)*.5,0),Vector3(1,deck-bottom,.96),stone)
		for row in range(ceili((deck-bottom)/.28)):
			var y=minf(deck-.08,bottom+.14+row*.28)
			for j in 2:
				var x=side*(half-.75+j*.49)
				for face in [-1,1]:_box(parts,Vector3(x,y,face*.487),Vector3(.47,.25,.028),stone*(.94+.045*((row+j)%3)))
	# Curved opening and its individually cut arch stones.
	for i in 20:
		var a=PI*i/20.0;var b=PI*(i+1)/20.0
		var x0=cos(a)*opening;var x1=cos(b)*opening
		var y0=spring+sin(a)*rise;var y1=spring+sin(b)*rise
		_face(parts,[Vector3(x1,y1,-.48),Vector3(x1,deck,-.48),Vector3(x0,deck,-.48),Vector3(x0,y0,-.48)],stone)
		_face(parts,[Vector3(x0,y0,.48),Vector3(x0,deck,.48),Vector3(x1,deck,.48),Vector3(x1,y1,.48)],stone)
		_face(parts,[Vector3(x0,y0,-.48),Vector3(x0,y0,.48),Vector3(x1,y1,.48),Vector3(x1,y1,-.48)],trim)
		for face in [-1,1]:
			var za=face*.505
			var inset=.006
			var inner_a=Vector3(cos(a+inset)*opening,spring+sin(a+inset)*rise,za)
			var inner_b=Vector3(cos(b-inset)*opening,spring+sin(b-inset)*rise,za)
			var outer_a=Vector3(cos(a+inset)*(opening+.21),spring+sin(a+inset)*(rise+.22),za)
			var outer_b=Vector3(cos(b-inset)*(opening+.21),spring+sin(b-inset)*(rise+.22),za)
			_face(parts,[inner_a,outer_a,outer_b,inner_b] if face>0 else [inner_b,outer_b,outer_a,inner_a],trim*(.93+(i%3)*.035))
	# Iron grille extends to the riverbed and across the walkable bank shoulders.
	var bars=maxi(3,ceili(opening*2/.19))
	for i in range(1,bars):
		var x=-opening+i*opening*2/bars
		var top=spring+sqrt(maxf(0,1-pow(x/opening,2)))*rise
		_box(parts,Vector3(x,(top+bottom)*.5,0),Vector3(.045,top-bottom,.07),iron,8)
	for y in [bottom+.20,-.35,.14]:_box(parts,Vector3(0,y,0),Vector3(opening*2,.06,.08),iron,8)
	_box(parts,Vector3(0,deck,0),Vector3(span,.14,1.04),trim)
	for side in [-1,1]:
		_box(parts,Vector3(0,1.54,side*.42),Vector3(span,.14,.18),stone)
		var teeth=ceili(span/.52)
		for i in teeth:_box(parts,Vector3(-half+(i+.5)*span/teeth,1.71,side*.42),Vector3(.27,.20,.22),trim)
	var arrays=[];arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX]=parts.vertices;arrays[Mesh.ARRAY_NORMAL]=parts.normals;arrays[Mesh.ARRAY_COLOR]=parts.colors;arrays[Mesh.ARRAY_INDEX]=parts.indices;arrays[Mesh.ARRAY_TEX_UV]=parts.uv
	var mesh=ArrayMesh.new();mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var material=ShaderMaterial.new();material.shader=preload("res://shaders/surface.gdshader")
	var visible=MeshInstance3D.new();visible.mesh=mesh;visible.material_override=material
	var root=Node3D.new();root.name="CanalWaterGate";root.add_child(visible)
	return root
