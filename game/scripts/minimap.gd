extends Control

signal navigate(target: Vector3)
var session
var camera_target=Vector3.ZERO
var texture: ImageTexture

func setup(current):
	session=current
	var image=Image.create(int(session.map.width),int(session.map.height),false,Image.FORMAT_RGB8)
	for z in image.get_height():
		for x in image.get_width():
			var c=session.cell(Vector2i(x,z))
			var color=Color("456d74") if c.ground=="water" else Color("77764c")
			if c.has("color") and c.ground!="water":color=Color(c.color[0],c.color[1],c.color[2]).linear_to_srgb()
			if c.bridge:color=Color("cfba8f")
			image.set_pixel(x,z,color)
	for tree in session.trees:image.set_pixel(int(tree.gx),int(tree.gz),Color("315735"))
	texture=ImageTexture.create_from_image(image)
	custom_minimum_size=Vector2(218,148)
	mouse_filter=Control.MOUSE_FILTER_STOP

func _draw():
	if not session or not texture:return
	draw_rect(Rect2(Vector2.ZERO,size),Color("c4b99a"))
	var inner=Rect2(6,6,size.x-12,size.y-12);draw_texture_rect(texture,inner,false)
	for key in ["stone","iron","pitch"]:
		for xy in session.map.deposits[key]:
			var p=Vector2((xy[0]+.5)/session.map.width,(xy[1]+.5)/session.map.height)*inner.size+inner.position
			draw_circle(p,3.0,{"stone":Color("e2d9bf"),"iron":Color("bd7855"),"pitch":Color("333f4d")}[key]);draw_arc(p,3.2,0,TAU,12,Color("f4f0e2"),1)
	for s in session.structures:
		if s.dead:continue
		var p=Vector2((s.x+session.map.width/2.0)/session.map.width,(s.z+session.map.height/2.0)/session.map.height)*inner.size+inner.position
		draw_rect(Rect2(p-Vector2(1,1),Vector2(3,3)),Color("f4f0e2") if s.team=="player" else Color("a44332"))
	for u in session.units:
		if u.dead:continue
		var p=Vector2((u.x+session.map.width/2.0)/session.map.width,(u.z+session.map.height/2.0)/session.map.height)*inner.size+inner.position
		draw_circle(p,1.6,Color.WHITE if u.team=="player" else Color("ef6554"))
	var cam=Vector2((camera_target.x+session.map.width/2.0)/session.map.width,(camera_target.z+session.map.height/2.0)/session.map.height)*inner.size+inner.position
	draw_rect(Rect2(cam-Vector2(13,9),Vector2(26,18)),Color("f3dda3"),false,1)

func _gui_input(event):
	if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT:
		var uv=(event.position-Vector2(6,6))/(size-Vector2(12,12))
		navigate.emit(Vector3(uv.x*session.map.width-session.map.width/2.0,.4,uv.y*session.map.height-session.map.height/2.0))
