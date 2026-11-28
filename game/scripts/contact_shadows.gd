extends MultiMeshInstance3D
## One instanced pass adds restrained ground contact at the actual support plane.
var cached=[]
func _init():
	name="GroundContacts";cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mesh=PlaneMesh.new();mesh.size=Vector2(2,2)
	var material=ShaderMaterial.new();material.shader=preload("res://shaders/contact_shadow.gdshader");material.render_priority=-5
	material_override=material;multimesh=MultiMesh.new();multimesh.transform_format=MultiMesh.TRANSFORM_3D;multimesh.use_colors=true;multimesh.mesh=mesh

func update(session,alpha=1.0):
	var actors=session.units+session.workers+session.civilians;var count=actors.size()+session.structures.size()
	if multimesh.instance_count<count:
		multimesh.instance_count=count+32;cached.clear();cached.resize(multimesh.instance_count)
	var index=0
	for a in actors:
		if a.dead or a.get("transit",false) or a.get("garrison",0):continue
		var radius=session.UnitSeparation.radius(a)*1.28
		var point=session.pos(a);var from:Vector3=a.get("render_from",point)
		_place(index,session,from.lerp(point,alpha) if from.distance_to(point)<1 else point,Vector2(radius,radius*.85),.28);index+=1
	for s in session.structures:
		if s.dead or s.type in ["stockpile","campfire","pitch","wall"]:continue
		_place(index,session,session.pos(s),Vector2(s.half.hx+.22,s.half.hz+.22),.20);index+=1
	multimesh.visible_instance_count=index

func _place(index:int,session,p:Vector3,size:Vector2,opacity:float):
	var previous=cached[index]
	if previous!=null and previous[0]==p and previous[1]==size and previous[2]==opacity:return
	cached[index]=[p,size,opacity]
	var dx=session.elevation(p+Vector3(.12,0,0))-session.elevation(p-Vector3(.12,0,0))
	var dz=session.elevation(p+Vector3(0,0,.12))-session.elevation(p-Vector3(0,0,.12))
	var normal=Vector3(-dx/.24,1,-dz/.24).normalized();var basis=Basis(Quaternion(Vector3.UP,normal)).scaled(Vector3(size.x,1,size.y))
	p.y=session.elevation(p)+.018;multimesh.set_instance_transform(index,Transform3D(basis,p));multimesh.set_instance_color(index,Color(1,1,1,opacity))
