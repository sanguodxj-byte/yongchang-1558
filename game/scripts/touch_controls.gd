extends RefCounted
## Native world gestures; UI keeps Godot's normal touch-to-mouse button handling.
var game
var fingers={}
var ignored={}
var active=-1
var start=Vector2.ZERO
var previous=Vector2.ZERO
var panning=false
var multiple=false
var build_ready=false

func _init(owner):game=owner

func cancel():
	fingers.clear();ignored.clear();game.touches.clear();active=-1;panning=false;multiple=false
	game.touch_gesture=false;game.controls.selecting=false

func clear_build():
	build_ready=false;game.build_start=Vector2i(-1,-1)

func preview(at:Vector2,begin=false):
	var hit=game.ground(at)
	if hit==Vector3.INF:return
	game.controls.pointer=at
	var cell=game.session.grid(hit)
	if begin:game.build_start=cell
	if cell!=game.ghost_cell or begin or not is_instance_valid(game.ghost):
		game.ghost_cell=cell;game._refresh_ghost()

func confirm_build():
	if not build_ready or game.selected_build=="" or not game.placement_valid:return
	var kind=game.selected_build
	var cells=game._line(game.build_start,game.ghost_cell) if game.session.source.buildings[kind].mode=="line" and game.build_start.x>=0 else [game.ghost_cell]
	clear_build();game._commit_build(cells);game._update_hud()

func pan_between(before:Vector2,after:Vector2):
	var a=game.ground(before);var b=game.ground(after)
	if a!=Vector3.INF and b!=Vector3.INF:game.camera_target+=a-b;game._move_camera()

func input(event) -> bool:
	if event is InputEventScreenTouch:
		game.controls.touch_mode=true;game.controls.pointer_inside=false
		if event.pressed and not event.canceled:
			game.touches[event.index]=event.position
			if game.session.state!="play" or game.ui.screen!="play" or game.ui.blocks_world(event.position):ignored[event.index]=true;return false
			if game.ui.dismiss_outside(event.position):ignored[event.index]=true;return true
			if game.tray.visible:game.tray.hide();ignored[event.index]=true;return true
			fingers[event.index]=event.position
			if fingers.size()>=2:
				multiple=true;game.touch_gesture=true;active=-1;game.controls.cancel_gesture();clear_build();game._clear_ghost()
				return true
			active=event.index;start=event.position;previous=start;panning=false;game.controls.pointer=start
			if game.selected_build!="":build_ready=false;preview(start,true)
			elif game.controls.touch_box_select:game.controls.start=start;game.controls.selecting=true;game.controls.additive=false
			return true
		game.touches.erase(event.index)
		if ignored.has(event.index):ignored.erase(event.index);return false
		if not fingers.has(event.index):return false
		fingers.erase(event.index)
		if multiple:
			if fingers.is_empty():multiple=false;game.touch_gesture=false
			return true
		if active!=event.index:return true
		active=-1
		if event.canceled:game.controls.cancel_gesture();clear_build();return true
		if game.ui.blocks_world(event.position):game.controls.selecting=false;clear_build();return true
		game.controls.pointer=event.position
		if game.selected_build!="":preview(event.position);build_ready=true;game._update_hud()
		elif game.controls.touch_box_select:
			if start.distance_to(event.position)>8:game.controls.box_select()
			else:game.controls.click_select(event.position,false,false)
			game.controls.touch_box_select=false;game.controls.selecting=false;game._update_hud()
		elif not panning:game.controls.touch_tap(event.position)
		return true
	if event is InputEventScreenDrag:
		if game.touches.has(event.index):game.touches[event.index]=event.position
		if not fingers.has(event.index):return false
		var before=fingers.values();fingers[event.index]=event.position
		if multiple:
			if fingers.size()<2:return true
			var after=fingers.values();var old_center=(before[0]+before[1])*.5;var center=(after[0]+after[1])*.5
			var anchor=game.ground(old_center);var old_distance=before[0].distance_to(before[1]);var distance=after[0].distance_to(after[1])
			if old_distance>8 and distance>8:game.zoom=clampf(game.zoom*old_distance/distance,7.5,game.session.map.camera.maxZoom)
			game._move_camera();var moved=game.ground(center)
			if anchor!=Vector3.INF and moved!=Vector3.INF:game.camera_target+=anchor-moved;game._move_camera()
			return true
		if active!=event.index:return true
		if game.selected_build!="":preview(event.position)
		elif game.controls.touch_box_select:game.controls.pointer=event.position
		else:
			if start.distance_to(event.position)>8:panning=true
			if panning:pan_between(previous,event.position)
		previous=event.position
		return true
	return false
