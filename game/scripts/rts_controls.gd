extends RefCounted
## Desktop RTS input and shared selection/commands. Native touch has its own router.
var game
var selecting=false
var start=Vector2.ZERO
var pointer=Vector2.ZERO
var additive=false
var double_clicked=false
var attack_armed=false
var groups={}
var last_group=-1
var last_group_time=0
var pointer_inside=false
var last_click_time=-1000
var last_click_id=0
var last_click_at=Vector2.INF
var touch_mode=false
var touch_box_select=false
var queue_mode=false
var right_pending=false
var right_dragged=false
var right_start=Vector2.ZERO

func _init(owner):
	game=owner
	touch_mode=DisplayServer.is_touchscreen_available()
	if OS.has_feature("web"):touch_mode=bool(JavaScriptBridge.eval("matchMedia('(pointer: coarse)').matches"))

func cancel_gesture():
	selecting=false;game.pan=false;right_pending=false;right_dragged=false;game.build_start=Vector2i(-1,-1)

func stop_selection():
	for q in selection():game.session.stop_squad(q)
	if game.lord_selected:game.session.stop_lord()
	attack_armed=false;queue_mode=false;game.message_label.text="";game.message_timer=0;game._update_hud()

func arm_attack():
	if not has_selection():return
	attack_armed=not attack_armed;touch_box_select=false;game._update_hud()

func toggle_box():
	touch_box_select=not touch_box_select;attack_armed=false;game._cancel_placement();game._update_hud()

func touch_tap(at:Vector2):
	var picked=false
	for u in game.session.units:
		if u.dead or u.transit or u.team!="player":continue
		if game.camera.unproject_position(game.session.pos(u)+Vector3.UP*.45).distance_to(at)<32:picked=true;break
	if picked and not attack_armed:click_select(at,false,false)
	elif has_selection():
		game._order(game.ground(at),queue_mode,attack_armed);attack_armed=false;game._update_hud()
	else:click_select(at,false,false)

func has_selection() -> bool:return game.lord_selected or not game.selected_squad.is_empty()

func selection() -> Array:
	return game.selected_squads.values().filter(func(q):return q.members.any(func(u):return not u.dead))

func set_selection(squads:Array,lord=false):
	if attack_armed:game.message_label.text="";game.message_timer=0
	game._cancel_placement();attack_armed=false
	queue_mode=false
	game.selected_squads.clear()
	for q in squads:game.selected_squads[q.id]=q
	game.selected_squad=squads[0] if not squads.is_empty() else {}
	game.lord_selected=lord;game.selected_structure=0
	game._update_hud()

func selected(u:Dictionary) -> bool:
	return game.lord_selected if u.role=="lord" else game.selected_squads.has(u.squad)

func focus_selection():
	var center=Vector3.ZERO;var count=0
	for u in game.session.units:
		if not u.dead and selected(u):center+=game.session.pos(u);count+=1
	if count:game.camera_target=center/count

func key(event:InputEventKey) -> bool:
	var code=event.keycode
	if code>=KEY_0 and code<=KEY_9:
		var number=code-KEY_0
		if (event.ctrl_pressed or Input.is_key_pressed(KEY_CTRL)):
			groups[number]={"squads":game.selected_squads.keys(),"lord":game.lord_selected}
			game.session.message("编队 %d 已记住当前选择"%number)
		elif groups.has(number):
			var group=groups[number];var chosen=selection() if (event.shift_pressed or Input.is_key_pressed(KEY_SHIFT)) else []
			for id in group.squads:
				var q=game.session.squad_index.get(id,{})
				if not q.is_empty() and q.members.any(func(u):return not u.dead) and not chosen.has(q):chosen.append(q)
			set_selection(chosen,group.lord and not game.session.player_lord.dead or (event.shift_pressed or Input.is_key_pressed(KEY_SHIFT)) and game.lord_selected)
			var now=Time.get_ticks_msec()
			if last_group==number and now-last_group_time<350:focus_selection()
			last_group=number;last_group_time=now
		return true
	if code==KEY_S:
		stop_selection()
		return true
	if code==KEY_A and has_selection():attack_armed=true;game.session.message("攻击移动：左键指定落点，右键取消");return true
	if code==KEY_H:game.camera_target=game.session.pos(game.session.player_keep);return true
	if code==KEY_SPACE:focus_selection();return true
	return false

func click_select(at:Vector2,shift:bool,double_click:bool):
	var best=32.0 if touch_mode else 25.0;var picked={}
	for u in game.session.units:
		if u.dead or u.transit or u.team!="player" or game.camera.is_position_behind(game.session.pos(u)):continue
		var pos=game.camera.unproject_position(game.session.pos(u)+Vector3.UP*.45)
		var distance=pos.distance_to(at)
		if distance<best:best=distance;picked=u
	var chosen=selection() if shift else [];var lord=game.lord_selected if shift else false
	if not picked.is_empty():
		# Some Web hosts omit Godot's double_click flag. Resolve the same gesture
		# from two real releases as well, without depending on simulation speed.
		var now=Time.get_ticks_msec()
		double_click=not shift and (double_click or picked.id==last_click_id and now-last_click_time<=400 and at.distance_to(last_click_at)<10)
		last_click_time=now if not shift else -1000;last_click_id=picked.id;last_click_at=at
		if picked.role=="lord":lord=not lord if shift else true
		else:
			var q=game.session.squad_index[picked.squad]
			if shift and chosen.has(q):chosen.erase(q)
			else:chosen.append(q)
			if double_click:
				for other in game.session.squads:
					if other.team!="player" or other.role!=q.role or chosen.has(other):continue
					if other.members.any(func(u):return not u.dead and not u.transit and game.get_viewport().get_visible_rect().has_point(game.camera.unproject_position(game.session.pos(u)))):chosen.append(other)
	set_selection(chosen,lord)
	if picked.is_empty() and not shift:
		var target=game.ground(at)
		if target!=Vector3.INF:
			var building=game.session.occupied.get(game.session.grid(target),{})
			if not building.is_empty() and building.team=="player":game.selected_structure=building.id;game.ui.toggle_popover("site")

func box_select():
	var box=Rect2(start,pointer-start).abs();var chosen=selection() if additive else [];var lord=game.lord_selected if additive else false
	for u in game.session.units:
		if u.dead or u.transit or u.team!="player" or game.camera.is_position_behind(game.session.pos(u)):continue
		if not box.has_point(game.camera.unproject_position(game.session.pos(u)+Vector3.UP*.45)):continue
		if u.role=="lord":lord=true
		else:
			var q=game.session.squad_index[u.squad]
			if not chosen.has(q):chosen.append(q)
	set_selection(chosen,lord)

func mouse(event):
	# UI consumes emulated mouse taps; the world handles each native touch once.
	if event.device==InputEvent.DEVICE_ID_EMULATION:return
	touch_mode=false
	if event is InputEventMouseMotion:
		var previous=pointer;pointer=event.position;pointer_inside=true
		if right_pending and pointer.distance_to(right_start)>7:right_dragged=true;game.pan=true
		if game.pan:
			var before=game.ground(previous);var after=game.ground(event.position)
			if before!=Vector3.INF and after!=Vector3.INF:game.camera_target+=before-after
		if game.selected_build!="":game._update_build_pointer(pointer)
		return
	if not event is InputEventMouseButton:return
	pointer=event.position;pointer_inside=true
	if event.button_index==MOUSE_BUTTON_MIDDLE:game.pan=event.pressed;return
	if event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN] and event.pressed:
		var before=game.ground(pointer)
		game.zoom=clampf(game.zoom*(1.12 if event.button_index==MOUSE_BUTTON_WHEEL_DOWN else 1.0/1.12),7.5,game.session.map.camera.maxZoom)
		game._move_camera();var after=game.ground(pointer)
		if before!=Vector3.INF and after!=Vector3.INF:game.camera_target+=before-after
		return
	if event.button_index==MOUSE_BUTTON_RIGHT:
		if event.pressed:
			cancel_gesture()
			if game.selected_build!="":game._cancel_placement()
			elif attack_armed:attack_armed=false
			elif game.ui.close_popover():pass
			elif game.tray.visible:game.tray.hide()
			else:right_pending=true;right_start=pointer
		else:
			var command=right_pending and not right_dragged
			right_pending=false;right_dragged=false;game.pan=false
			if command and has_selection():game._order(game.ground(pointer),(event.shift_pressed or Input.is_key_pressed(KEY_SHIFT)))
		return
	if event.button_index!=MOUSE_BUTTON_LEFT:return
	if not event.pressed and game.suppress_left_release:game.suppress_left_release=false;return
	if event.pressed and game.ui.dismiss_outside(pointer):game.suppress_left_release=true;return
	var hit=game.ground(pointer)
	if event.pressed:
		if hit==Vector3.INF:return
		start=pointer;additive=(event.shift_pressed or Input.is_key_pressed(KEY_SHIFT));double_clicked=event.double_click
		if game.selected_build!="":game.build_start=game.session.grid(hit);game._update_build_pointer(pointer)
		elif attack_armed:game._order(hit,(event.shift_pressed or Input.is_key_pressed(KEY_SHIFT)),true);attack_armed=false;game.message_label.text="";game.message_timer=0
		else:selecting=true
	else:
		if game.selected_build!="" and game.build_start.x>=0:
			if hit!=Vector3.INF:
				var end=game.session.grid(hit);var kind=game.selected_build
				var cells=game._line(game.build_start,end) if game.session.source.buildings[kind].mode=="line" else [end]
				game._commit_build(cells)
			game.build_start=Vector2i(-1,-1);game._refresh_ghost()
		elif selecting:
			if pointer.distance_to(start)>7:box_select()
			else:click_select(pointer,additive,double_clicked)
		selecting=false

func camera_move(delta:float):
	var move=Vector2(Input.get_axis("ui_left","ui_right"),Input.get_axis("ui_up","ui_down"))
	var size=game.get_viewport().get_visible_rect().size
	if not touch_mode and pointer_inside and not game.pan and not right_pending and not game.touch_gesture and game.touches.is_empty() and game.get_viewport().gui_get_hovered_control()==null:
		var margin=12.0
		if pointer.x>=0 and pointer.x<margin:move.x-=1
		if pointer.x>size.x-margin and pointer.x<size.x:move.x+=1
		if pointer.y>=0 and pointer.y<margin:move.y-=1
		if pointer.y>size.y-margin and pointer.y<size.y:move.y+=1
	game.camera_target+=Vector3(move.limit_length().x,0,move.limit_length().y).rotated(Vector3.UP,game.camera_yaw)*delta*game.zoom*.8
