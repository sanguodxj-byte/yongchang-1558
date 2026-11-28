extends RefCounted
## Terrain-conforming cells and a full building silhouette use the placement rules.
const CLEAR=Color(.34,.92,.66,.8)
const BLOCKED=Color(1,.35,.23,.9)

static func material(color:Color) -> StandardMaterial3D:
	var mat=StandardMaterial3D.new();mat.albedo_color=color;mat.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;mat.cull_mode=BaseMaterial3D.CULL_DISABLED;mat.vertex_color_use_as_albedo=true
	return mat

static func point(game,x:float,z:float) -> Vector3:
	var at=Vector3(x-game.session.map.width/2.0,0,z-game.session.map.height/2.0)
	at.y=game.session.terrain.visible_height(at)+.045
	return at

static func cell_lines(mesh:ImmediateMesh,game,at:Vector2i,color:Color,cross=false):
	var corners=[Vector2(.04,.04),Vector2(.96,.04),Vector2(.96,.96),Vector2(.04,.96)]
	mesh.surface_set_color(color)
	for i in 4:
		# Split the perimeter so it follows the same terrain as the solid ground.
		var a=corners[i];var b=corners[(i+1)%4];var mid=(a+b)*.5
		for edge in [[a,mid],[mid,b]]:
			for v in edge:mesh.surface_add_vertex(point(game,at.x+v.x,at.y+v.y))
	if cross:
		for i in 2:
			for v in [corners[i],Vector2(.5,.5),Vector2(.5,.5),corners[i+2]]:mesh.surface_add_vertex(point(game,at.x+v.x,at.y+v.y))

static func tint(node:Node,mat:Material):
	if node is GeometryInstance3D:node.material_override=mat;node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for child in node.get_children():tint(child,mat)

static func create(game) -> Node3D:
	var root=Node3D.new();root.name="ConstructionPreview"
	var s=game.session;var at=game.ghost_cell;var kind=game.selected_build
	var lines=ImmediateMesh.new();lines.surface_begin(Mesh.PRIMITIVE_LINES)
	for x in range(at.x-5,at.x+7):
		for z in range(at.y-5,at.y+7):
			var p=Vector2i(x,z)
			if s.cell(p).is_empty():continue
			var blocked=s.placement_error(kind,p,game.build_rotation)!="" if kind=="waterGate" else s.placement_cell_error(kind,p)!=""
			cell_lines(lines,game,p,Color(.9,.45,.3,.38) if blocked else Color(.85,.88,.7,.25),blocked)
	var starts=game._line(game.build_start,at) if game.build_start.x>=0 and s.source.buildings[kind].mode=="line" else [at]
	var remaining=s.res.duplicate();var first_error="";var valid_count=0
	for anchor in starts:
		var error=s.placement_error(kind,anchor,game.build_rotation)
		if first_error!="":error=first_error
		if kind!="demolish" and error=="":
			for key in s.source.buildings[kind].cost:
				remaining[key]-=s.source.buildings[kind].cost[key]
				if remaining[key]<0:error="物资不足：缩短营造线"
		if error!="" and first_error=="":first_error=error
		if error=="":valid_count+=1
		var cells=s.footprint(kind,anchor,game.build_rotation)
		for p in cells:cell_lines(lines,game,p,CLEAR if error=="" else BLOCKED,error!="")
		if kind=="demolish":continue
		var model_key="player_"+("wall_0" if kind=="wall" else kind)
		if kind!="waterGate" and not game.assets.data.models.has(model_key):continue
		var support=s.foundation(cells)
		var model=preload("res://scripts/watergate_model.gd").create(maxi(3,cells.size()),support.x-support.y-.12) if kind=="waterGate" else game.assets.model(model_key)
		model.position=(s.world([cells[0].x,cells[0].y])+s.world([cells[-1].x,cells[-1].y]))*.5
		model.position.y=support.y+.035;model.rotation.y=game.build_rotation*PI/2
		if kind in ["wall","gate"]:
			game._add_foundation(model,{"type":kind,"foundation_bottom":support.x,"y":support.y,"rotation":game.build_rotation,"half":{"hx":(cells[-1].x-cells[0].x+1)*.5-.01,"hz":(cells[-1].y-cells[0].y+1)*.5-.01}})
		tint(model,material(Color(.42,.96,.76,.4) if error=="" else Color(1,.32,.22,.4)));root.add_child(model)
	lines.surface_end();var mesh=MeshInstance3D.new();mesh.mesh=lines;mesh.material_override=material(Color.WHITE);mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;root.add_child(mesh)
	game.placement_hint=first_error if first_error!="" else "可营造 · "+("点确认放置" if game.controls.touch_mode else "左键放置")
	if kind=="waterGate" and first_error=="":game.placement_hint="跨 %d 格（含两岸） · "%s.footprint(kind,at,game.build_rotation).size()+("点确认营造" if game.controls.touch_mode else "左键营造")
	if starts.size()>1:game.placement_hint="%d / %d 格可营造"%[valid_count,starts.size()]+(" · "+first_error if first_error!="" else "")
	game.placement_valid=first_error=="";game.preview_count=starts.size()
	return root
