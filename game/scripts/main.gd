extends Node3D

const AssetLibrary=preload("res://scripts/assets.gd")
const GameSession=preload("res://scripts/session.gd")
const Sound=preload("res://scripts/sound.gd")
const GameUI=preload("res://scripts/mobile_ui.gd")
const UnitRig=preload("res://scripts/unit_rig.gd")
const WorkProps=preload("res://scripts/work_props.gd")
const ContactShadows=preload("res://scripts/contact_shadows.gd")
var contact_shadows
const PerformanceProbe=preload("res://scripts/performance_probe.gd")
const PlayerGuidance=preload("res://scripts/player_guidance.gd")
const CompactUI=preload("res://scripts/compact_ui.gd")
const SaveStore=preload("res://scripts/save_store.gd")
const RtsControls=preload("res://scripts/rts_controls.gd")
const TouchControls=preload("res://scripts/touch_controls.gd")
const BuildPreview=preload("res://scripts/build_preview.gd")
const SiteInspector=preload("res://scripts/site_inspector.gd")
var saves=SaveStore.new()
var save_notice=""
var save_timer=0.0
var save_failed=false
var pending_training=false
var selected_structure=0
var compact=false
var display_size=Vector2(1600,1000)
var layout_initialized=false
var navigation_marker:Node3D
var navigation_timer=0.0
var site_detail:Label
var performance_probe
var ui
var assets
var session
var sound
var camera: Camera3D
var sun: DirectionalLight3D
var environment: WorldEnvironment
var world_root: Node3D
var visuals={}
var work_visuals={}
var tree_visuals={}
var boat_visuals={}
var projectile_visuals=[]
var camera_target=Vector3(-34,.4,-1)
var camera_yaw=-.52
var zoom=26.0
var selected_build=""
var build_rotation=0
var selected_squad={}
var selected_squads={}
var controls
var touch_controls
var placement_hint=""
var placement_valid=false
var preview_count=0
var ghost_version=-1
var ghost_budget=[]
var lord_selected=false
var pan=false
var suppress_left_release=false
var build_start=Vector2i(-1,-1)
var ghost: Node3D
var ghost_cell=Vector2i(-1,-1)
var hud: Control
var overlay: Control
var resources_label: Label
var phase_label: Label
var lord_label: Label
var message_label: Label
var selected_label: Label
var tray: PanelContainer
var modal: Control
var minimap
var tick=0.0
var hud_timer=0.0
var message_timer=0.0
var selected_tab=""
var content_hash=""
var capture_path=""
var capture_timer=0.0
var qa_bridge: JavaScriptObject
var audit_state="title"
var audit_screen="title"
var audit_enter_button=Vector2.ZERO
var audit_wood=92.0
var audit_gold=210.0
var audit_built=0
var audit_units=14
var audit_stance="defend"
var audit_audio_json="{}"
var audit_input_json="{}"
var audit_construction_json="{}"
var audit_donations=0
var audit_map_size=Vector2i.ZERO
var audit_fortress_json="{}"
var audit_build_probe=Vector2.ZERO
var audit_ui_json="{}"
var audit_ui_hash=""
var audit_viewport=Vector2.ZERO
var audit_map_origin=Vector2.ZERO
var audit_map_extent=Vector2.ZERO
var audit_terrain_version=0
var audit_context=""
var audit_clan_button=Vector2.ZERO
var audit_command_button=Vector2.ZERO
var audit_rigged_units=0
var audit_workers=0
var audit_start_button=Vector2.ZERO
var audit_confirm_new_button=Vector2.ZERO
var audit_build_button=Vector2.ZERO
var audit_farm_button=Vector2.ZERO
var audit_army_button=Vector2.ZERO
var audit_spearman_button=Vector2.ZERO
var audit_attack_button=Vector2.ZERO
var audit_donate_button=Vector2.ZERO
var peasants: Array[Node3D] = []
var stock_models: Array[Node3D] = []
var stocks_value=-1
var touches={}
var touch_gesture=false

func _ready():
	UnitRig.split_meshes.clear()
	performance_probe=PerformanceProbe.new()
	assets=AssetLibrary.new()
	content_hash=assets.source_hash
	session=GameSession.new(assets.data)
	controls=RtsControls.new(self)
	touch_controls=TouchControls.new(self)
	saves.load_slot(content_hash);save_notice=saves.error
	var restored=get_tree().get_meta("restore_game",{})
	if not restored.is_empty():
		get_tree().remove_meta("restore_game");var loaded=SaveStore.Archive.restore(assets.data,restored.session)
		if loaded!=null:session=loaded;session.state="pause";save_notice="已读取上次进度，继续后开始计时"
	camera_target=session.world(session.map.camera.home);zoom=session.map.camera.zoom
	if not restored.is_empty():
		camera_target=restored.view.get("camera",camera_target);zoom=restored.view.get("zoom",zoom);camera_yaw=restored.view.get("yaw",camera_yaw)
	sound=Sound.new(self)
	sound.enabled=get_tree().get_meta("sound_enabled",true)
	_configure_display()
	_setup_world()
	contact_shadows=ContactShadows.new();world_root.add_child(contact_shadows)
	_setup_ui()
	session.changed.connect(_event)
	for u in session.units:
		if not u.dead:_add_unit(u)
	for worker in session.workers:
		if not worker.dead:_add_worker(worker)
	for trip in session.trips:_event("sail",trip)
	for shot in session.projectiles:
		_event("shot",{"from":shot.from,"to":shot.to,"cannon":shot.damage>60})
		projectile_visuals[-1].age=shot.elapsed;projectile_visuals[-1].duration=shot.duration
	for tree in session.trees:
		if tree.wood<=0:_event("tree",tree)
	_refresh_walls()
	_build_modal("pause" if not restored.is_empty() else "title")
	_update_hud()
	_sync_civilian_models()
	if get_tree().get_meta("start_next_game",false):
		get_tree().remove_meta("start_next_game");session.training=get_tree().get_meta("training_next_game",false);get_tree().remove_meta("training_next_game");session.state="play";ui.show_screen("play");save_game(true)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture="):capture_path=arg.trim_prefix("--capture=")
		if arg=="--play":session.state="play";ui.show_screen("play")
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__yongchang={ready:true};")
		qa_bridge=JavaScriptBridge.get_interface("__yongchang")
	print("YONGCHANG_READY ",content_hash)

func _setup_world():
	world_root=Node3D.new();world_root.name="World";add_child(world_root)
	for spec in assets.data.staticNodes:world_root.add_child(assets.instantiate(spec))
	for s in session.structures:
		if not s.dead:_add_structure(s)
	_add_forest()
	for d in assets.data.deposits:
		if d.model:world_root.add_child(assets.instantiate(d.model))
	environment=WorldEnvironment.new();var env=Environment.new();environment.environment=env;add_child(environment)
	env.background_mode=Environment.BG_COLOR;env.background_color=Color("b0a695")
	env.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;env.ambient_light_color=Color("d9ded4");env.ambient_light_energy=.72
	env.tonemap_mode=Environment.TONE_MAPPER_FILMIC
	sun=DirectionalLight3D.new();sun.light_color=Color("fff0d8");sun.light_energy=1.35;sun.shadow_opacity=.72
	sun.rotation_degrees=Vector3(-52,-30,0);sun.shadow_enabled=true;sun.directional_shadow_max_distance=120;add_child(sun)
	var fill=DirectionalLight3D.new();fill.light_color=Color("b9c9d5");fill.light_energy=.38;fill.rotation_degrees=Vector3(-40,145,0);add_child(fill)
	camera=Camera3D.new();camera.name="Camera";camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.near=.1;camera.far=400;add_child(camera);camera.current=true
	_move_camera()

func _add_forest():
	var groups={}
	for tree in session.trees:
		var key=Vector3i(int(tree.model.geo),floori(tree.gx/24.0),floori(tree.gz/24.0))
		if not groups.has(key):groups[key]=[]
		groups[key].append(tree)
	for key in groups:
		var batch=MultiMeshInstance3D.new();batch.name="Forest_"+str(key)
		var mm=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D;mm.use_colors=true;mm.mesh=assets.meshes[key.x];mm.instance_count=groups[key].size()
		batch.multimesh=mm;batch.material_override=assets.surface;world_root.add_child(batch)
		for i in groups[key].size():
			var tree=groups[key][i];var spec=tree.model;var q=spec.quaternion
			var transform=Transform3D(Basis(Quaternion(q[0],q[1],q[2],q[3])).scaled(assets.vec(spec.scale)),assets.vec(spec.position))
			mm.set_instance_transform(i,transform);mm.set_instance_color(i,Color.WHITE)
			tree_visuals[tree.id]={"mesh":mm,"index":i,"transform":transform}

func _setup_ui():
	ui=CompactUI.new(self,display_size) if compact else GameUI.new(self);hud=ui.root;modal=ui.modal;tray=ui.tray;minimap=ui.minimap;message_label=ui.message_label;selected_label=ui.selected_label
	overlay=Control.new();hud.add_child(overlay);overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);overlay.mouse_filter=Control.MOUSE_FILTER_IGNORE;overlay.draw.connect(_draw_overlay)

func _configure_display() -> bool:
	var size=Vector2(get_window().size)
	if OS.has_feature("web"):
		var dimensions=JavaScriptBridge.eval("JSON.stringify([window.innerWidth,window.innerHeight])")
		var values=JSON.parse_string(dimensions);size=Vector2(values[0],values[1])
	var small=size.x<1000 or size.y<600
	var layout=size if small else Vector2(1600,1000)
	if layout_initialized and compact==small and display_size==layout:return false
	layout_initialized=true
	compact=small;display_size=layout
	get_window().content_scale_size=Vector2i(layout)
	if OS.has_feature("web"):
		get_window().size=Vector2i(layout)
		JavaScriptBridge.eval("document.documentElement.classList.toggle('compact-game',"+str(small).to_lower()+");")
	return true

func _resize_ui():
	if not _configure_display():return
	var previous=ui.screen;var old_layer=ui.root.get_parent();ui.dispose();remove_child(old_layer);old_layer.queue_free();site_detail=null
	pan=false;touches.clear();touch_gesture=false;build_start=Vector2i(-1,-1)
	if touch_controls:touch_controls.cancel();touch_controls.clear_build()
	_setup_ui();_build_modal("pause" if previous in ["info","confirm_return","confirm_new"] else previous)

func short_name(key:String) -> String:
	return {"wall":"花岗城墙","gate":"谯楼城门","waterGate":"跨渠水门","tower":"空心敌台","ballista":"火炮台","pitch":"猛火油壕","demolish":"拆建","farm":"水车稻田","woodcutter":"竹木作坊","quarry":"山麓采石","ironMine":"天工铁冶","pitchRig":"熬油坊","fletcher":"军器局","blacksmith":"甲仗锻局","hovel":"粉墙民居","stockpile":"物资堆放场","oxPost":"水牛绑牛桩","spearman":"狼筅乡勇","archer":"鸟铳手","swordsman":"藤牌刀兵","knight":"宗族铁骑","ram":"包铁冲车","trebuchet":"虎蹲炮车"}.get(key,key)

func has_saved_game() -> bool:return not saves.cached.is_empty()

func begin_game(training=false):
	pending_training=training
	if has_saved_game():ui.show_screen("confirm_new");return
	confirm_new_game()

func confirm_new_game():
	session.training=pending_training;session.state="play";ui.show_screen("play");save_game(true)
	if session.training:session.message("新手准备：敌袭计时暂停，熟悉建设后点击准备迎敌。")

func resume_game():session.state="play";ui.show_screen("play")

func finish_training():
	session.training=false;session.phase_timer=75;ui.close_popover();session.message("准备结束：首波敌袭将在75秒后出发。未来各幕按正常规则进行。");save_game(true)

func save_game(automatic=false) -> bool:
	var ok=saves.save(session,content_hash,{"camera":camera_target,"zoom":zoom,"yaw":camera_yaw,"sound":sound.enabled})
	save_notice="已保存 · %02d:%02d"%[int(session.time)/60,int(session.time)%60] if ok else saves.error
	if not automatic or (not ok and not save_failed):session.message(save_notice)
	save_failed=not ok;save_timer=0
	return ok

func save_and_return():
	if save_game():restart_game()
	else:ui.show_screen("confirm_return")

func load_game():
	var data=saves.load_slot(content_hash)
	if data.is_empty():save_notice=saves.error;ui.show_screen("menu");return
	get_tree().set_meta("restore_game",data);get_tree().set_meta("sound_enabled",data.view.get("sound",true));get_tree().reload_current_scene()

func locate(key:String):
	for site in SiteInspector.locations(session):
		if site.key==key:
			camera_target=session.world(site.cell);zoom=minf(zoom,24);ui.close_popover();_show_marker(camera_target);session.message(site.name+" · 已定位");return

func locate_next():
	var goal=PlayerGuidance.objective(session).title
	var key="wood" if "木粮" in goal else "stone" if "石料" in goal else "port" if "渡海" in goal else "island" if "岛寨" in goal or "倭酋" in goal else "village"
	locate(key)

func _show_marker(at:Vector3):
	if is_instance_valid(navigation_marker):navigation_marker.queue_free()
	var mesh=MeshInstance3D.new();var ring=TorusMesh.new();ring.inner_radius=.7;ring.outer_radius=.9;mesh.mesh=ring;mesh.position=at+Vector3.UP*.12
	var mat=StandardMaterial3D.new();mat.albedo_color=Color("f0d391");mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;mesh.material_override=mat;world_root.add_child(mesh);navigation_marker=mesh;navigation_timer=6

func populate_site_panel(box:VBoxContainer,kit):
	var b=session.structure_by_id(selected_structure)
	if b.is_empty():return
	var info=SiteInspector.describe(session,b);site_detail=kit.label(info.title+"\n"+info.text,18 if compact else 22);site_detail.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(site_detail)
	if info.target:
		box.add_child(kit.button("定位仓库",func():var depot=session.structure_by_id(info.target);camera_target=session.pos(depot);_show_marker(camera_target);ui.close_popover(),Vector2(160,48)))

func _build_modal(kind: String):
	ui.show_screen(kind)

func _info(title: String):
	var text=""
	match title:
		"家风碑":text="英桥王氏三世忠烈家风\n\n先烈忠魂 · 王沛、王德\n双贤筑堡 · 修筑10座城防，耐久 +15%\n堡内有田 · 开垦3块水田，产粮 +25%、战力 +15%\n文武世泽 · 守过首夜，藤牌/铁骑募饷 -20%\n\n当前：筑堡 %s  耕战 %s  世泽 %s"%["已解锁" if session.wall_bonus else "未解锁","已解锁" if session.paddy_bonus else "未解锁","已解锁" if session.martial_bonus else "未解锁"]
		"开源与授权":text="代码：AGPL-3.0-only\n原创模型、画面及合成音效：CC BY 4.0\nhttps://creativecommons.org/licenses/by/4.0/\n署名：sanguodxj-byte / 守望1558项目贡献者\n\nGodot：MIT；字体：SIL OFL 1.1\n完整对应源码：交付包内的 SOURCE.zip\n修改及再分发时请保留署名、许可证并标明修改。"
		_:text="目标：保住宗长，攻破敌营并击败倭酋获胜。\n开局：先建伐木坊与稻田，再采石筑防、造械募兵。\n\n"+ui.control_help()+"\n\n渡海：军令→进攻，全军自动集结乘船。\n宗族：驻祠休养，义捐与驰援每局限次。\n筑城：浅岸可筑墙，渠口点水面建水门，R转向；桥头用城门守住通路。\n民丁自动上岗；鸟铳手可驻城墙或敌台。\n\n史料记载堡内上河、下河两条内渠；宽度、间距、支渠和古岸线未测绘；黑鲨岛、航线与战局为玩法创作。"
	ui.show_info(title,text)

func _open_source():
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.open(new URL('SOURCE.zip', document.baseURI).href, '_blank', 'noopener');")
	else:
		var archive=ProjectSettings.globalize_path("res://").path_join("SOURCE.zip").simplify_path()
		if not FileAccess.file_exists(archive):
			archive=ProjectSettings.globalize_path("res://").path_join("../SOURCE.zip").simplify_path()
		if FileAccess.file_exists(archive):OS.shell_show_in_file_manager(archive)
		else:message_label.text="请打开 Dora 作品目录中的 SOURCE.zip 获取本版本完整源码。";message_timer=10

func _toggle_tray(kind: String):
	ui.toggle_tray(kind)

func _select_card(kind: String,key: String):
	if kind=="build":
		controls.set_selection([]);selected_build=key;tray.hide();ghost_cell=Vector2i(-1,-1)
		if not controls.touch_mode:_update_build_pointer(get_viewport().get_mouse_position())
	else:
		var squad=session.recruit_squad(key)
		if not squad.is_empty():
			controls.set_selection([squad]);sound.play("horn")
			session.message("募得%s%d人 · 已选中，收起后%s调遣"%[session.source.units[key].name,squad.members.size(),"点地面" if controls.touch_mode else "右键"])
	_update_hud()

func restart_game(start_play=false):
	get_tree().set_meta("start_next_game",start_play)
	get_tree().set_meta("sound_enabled",sound.enabled)
	get_tree().reload_current_scene()

func _cancel_placement():
	selected_build="";build_start=Vector2i(-1,-1);placement_hint="";_clear_ghost()
	if touch_controls:touch_controls.clear_build()

func _res_name(key: String) -> String:
	return {"wood":"木","stone":"石","food":"粮","gold":"银","iron":"铁","oil":"油","bows":"铳","armor":"甲"}.get(key,key)

func _policy():
	var choices=["balanced","harsh","generous"];session.policy=choices[(choices.find(session.policy)+1)%3]
	session.message({"balanced":"耕读传家：赋饷均衡","harsh":"毁家纾难：增饷减粮，归附放缓","generous":"义仓赈乡：双粮赈济，士气 +20%"}[session.policy])

func _garrison_lord():
	if session.player_lord.garrison:session.command_lord(session.pos(session.player_keep)+Vector3(2.4,0,0))
	else:session.command_lord(session.pos(session.player_keep))

func _pause():
	controls.cancel_gesture()
	if touch_controls:touch_controls.cancel()
	if ui.screen=="info":ui.close_info();return
	if ui.screen=="confirm_return":ui.show_screen("pause");return
	if ui.screen=="confirm_new":ui.show_screen("menu");return
	if session.state=="play":session.state="pause";save_game(true);_build_modal("pause")
	elif session.state=="pause":session.state="play";ui.show_screen("play")

func _overview():
	if zoom>session.map.camera.overviewZoom*.7:zoom=session.map.camera.zoom;camera_yaw=-.52;camera_target=session.world(session.map.camera.home)
	else:zoom=session.map.camera.overviewZoom;camera_yaw=0;camera_target=session.world(session.map.camera.overview)

func _process(delta: float):
	if not session:return
	if performance_probe.enabled:performance_probe.begin()
	var dt=minf(delta,.05)
	sound.update(dt,session,camera_target)
	if session.state=="play":
		controls.camera_move(dt)
		tick+=dt*session.speed
		while tick>=1.0/30.0:session.step(1.0/30.0);tick-=1.0/30.0
		if session.state in ["victory","defeat"]:_build_modal(session.state);sound.play("horn" if session.state=="victory" else "bell")
		save_timer+=dt
		if save_timer>=12:save_game(true)
	if performance_probe.enabled:performance_probe.mark()
	_move_camera()
	if selected_build!="" and not touch_gesture and not controls.touch_mode:_update_build_pointer(get_viewport().get_mouse_position())
	if performance_probe.enabled:performance_probe.mark()
	_sync_visuals(dt)
	if performance_probe.enabled:performance_probe.mark()
	hud_timer+=dt;message_timer-=dt
	if message_timer<=0:message_label.text=""
	if hud_timer>.18:_resize_ui();_update_hud();hud_timer=0
	if is_instance_valid(navigation_marker):
		navigation_timer-=dt
		if navigation_timer<=0:navigation_marker.queue_free()
	overlay.queue_redraw()
	if performance_probe.enabled:performance_probe.mark();performance_probe.finish()
	if capture_path!="":
		capture_timer+=dt
		if capture_timer>2:
			get_viewport().get_texture().get_image().save_png(capture_path);capture_path=""

func _exit_tree():
	if ui:ui.dispose()
	if performance_probe:performance_probe.dispose()

func _move_camera():
	# Keep the orthographic ground footprint inside the rendered backdrop even
	# at the largest zoom and rotated map corners; do not expose a cut-off board.
	var margin=float(session.source.get("terrain",{}).get("contextMargin",64))
	var extent=get_viewport().get_visible_rect().size;var aspect=extent.x/maxf(1,extent.y)
	var ax=absf(cos(camera_yaw));var az=absf(sin(camera_yaw))
	var reserve=maxf(4.0,session.terrain.visible_height(camera_target)-float(session.source.terrain.waterLevel)+2)
	var kx=(aspect*ax+sqrt(2.0)*az)*.5;var kz=(aspect*az+sqrt(2.0)*ax)*.5
	zoom=minf(zoom,minf((session.map.width+margin*2-reserve*2)/(kx*2),(session.map.height+margin*2-reserve*2)/(kz*2)))
	camera_target.x=clampf(camera_target.x,-session.map.width/2.0-margin+zoom*kx+reserve,session.map.width/2.0+margin-zoom*kx-reserve)
	camera_target.z=clampf(camera_target.z,-session.map.height/2.0-margin+zoom*kz+reserve,session.map.height/2.0+margin-zoom*kz-reserve)
	camera_target.x=clampf(camera_target.x,-session.map.width/2.0+4,session.map.width/2.0-3);camera_target.z=clampf(camera_target.z,-session.map.height/2.0+5,session.map.height/2.0-5)
	camera_target.y=session.terrain.visible_height(camera_target)
	camera.size=zoom
	var distance=maxf(27,zoom*.9)
	camera.position=camera_target+Vector3(sin(camera_yaw)*distance,distance,cos(camera_yaw)*distance)
	camera.look_at(camera_target)

func _update_hud():
	var r=session.res
	ui.refresh()
	if ui.popover_kind=="site" and is_instance_valid(site_detail):
		var building=session.structure_by_id(selected_structure)
		if not building.is_empty():
			var info=SiteInspector.describe(session,building);site_detail.text=info.title+"\n"+info.text
	audit_screen=ui.screen
	audit_context=ui.popover_kind
	audit_state=session.state;audit_wood=r.wood;audit_gold=r.gold;audit_built=session.stats.built
	audit_units=session.units.filter(func(u):return not u.dead).size()
	audit_workers=session.workers.filter(func(w):return not w.dead).size()
	audit_rigged_units=0
	for model in visuals.values():
		if model.has_meta("skeleton"):audit_rigged_units+=1
	audit_stance=session.stance;audit_donations=session.donation_count
	audit_audio_json=JSON.stringify(sound.snapshot())
	# Dora's inspector truncates individual strings at 512 bytes. Keep this
	# observation bounded: first selected squad, centimetres and integer pixels.
	var observed=controls.selection().slice(0,1)
	audit_input_json=JSON.stringify({"camera":[roundi(camera_target.x*100),roundi(camera_target.y*100),roundi(camera_target.z*100)],"zoom":zoom,"yaw":camera_yaw,"selected":selected_squads.keys().slice(0,12),"squads":observed.map(func(q):return {"id":q.id,"order":[roundi(q.order.x*100),roundi(q.order.z*100)] if q.order!=Vector3.INF else [],"queue":q.get("queue",[]).size(),"positions":q.members.filter(func(u):return not u.dead).slice(0,4).map(func(u):return [roundi(u.x*100),roundi(u.y*100),roundi(u.z*100)]),"screens":q.members.filter(func(u):return not u.dead).slice(0,4).map(func(u):return [roundi(camera.unproject_position(session.pos(u)+Vector3.UP*.45).x),roundi(camera.unproject_position(session.pos(u)+Vector3.UP*.45).y)])})})
	audit_map_size=Vector2i(session.map.width,session.map.height);audit_fortress_json=JSON.stringify(session.snapshot().fortress)
	audit_build_probe=camera.unproject_position(session.world([47,54]))
	_sync_civilian_models()
	var rectangles={}
	_collect_buttons(hud,rectangles)
	audit_ui_json=JSON.stringify(rectangles)
	var build_buttons={}
	for label in rectangles:
		if label=="永昌城防" or label.begins_with("跨渠石拱水门") or label=="确认营造":
			var rect=rectangles[label];build_buttons["waterGate" if label.begins_with("跨渠") else "castle" if label=="永昌城防" else "confirm"]=[roundi(rect.x+rect.width/2),roundi(rect.y+rect.height/2)]
	audit_construction_json=JSON.stringify({"buttons":build_buttons,"selected":selected_build,"cell":[ghost_cell.x,ghost_cell.y],"valid":placement_valid,"hint":placement_hint,"waterGates":session.structures.filter(func(b):return b.team=="player" and b.type=="waterGate" and not b.dead).size(),"stone":r.stone,"wood":r.wood,"iron":r.iron})
	audit_ui_hash=audit_ui_json.sha256_text();audit_viewport=get_viewport().get_visible_rect().size
	var visible_map=ui.map_widget if is_instance_valid(ui.map_widget) and ui.map_widget.is_visible_in_tree() else minimap
	var map_rect=visible_map.get_global_rect();audit_map_origin=map_rect.position;audit_map_extent=map_rect.size
	audit_terrain_version=int(assets.data.get("terrain",{}).get("version",0))
	for text in rectangles:
		var rect=rectangles[text];var center=Vector2(rect.x+rect.width/2,rect.y+rect.height/2)
		if text=="步入永昌卫城":audit_enter_button=center
		elif text in ["开始守望","继续守望"]:audit_start_button=center
		elif text=="确认新局":audit_confirm_new_button=center
		elif text=="营造 B":audit_build_button=center
		elif text=="募勇":audit_army_button=center
		elif text=="进攻":audit_attack_button=center
		elif text=="义捐":audit_donate_button=center
		elif text=="宗族":audit_clan_button=center
		elif text=="军令":audit_command_button=center
		elif text.begins_with("江南水车稻田"):audit_farm_button=center
		elif text.begins_with("毛竹狼筅乡勇"):audit_spearman_button=center
	if qa_bridge:
		var s=session.snapshot();s.content_hash=content_hash
		s.workers=[];s.rigged_units=audit_rigged_units
		for worker in session.workers:
			if worker.dead:continue
			var model=visuals[worker.id];var arm=0.0;var hand=Vector3.ZERO
			if model.has_meta("skeleton"):
				var sk=model.get_meta("skeleton");arm=sk.get_bone_pose_rotation(sk.find_bone("rightArm")).get_euler().x
				hand=model.get_meta("rightHand").global_position
			var feet=[];var motion=model.get_meta("motion",{})
			if model.has_meta("skeleton"):
				var sk:Skeleton3D=model.get_meta("skeleton");var body:Node3D=model.get_meta("bodyGroup")
				for side in ["left","right"]:
					var sole=body.global_transform*(sk.get_bone_global_pose(sk.find_bone(side+"Foot"))*Vector3(0,-.05,0))
					var contact=motion.get("feet",{}).get(side,{})
					var anchor:Vector3=contact.get("anchor",sole)
					feet.append({"position":[sole.x,sole.y,sole.z],"ground":session.elevation(sole),"planted":contact.get("stance",false),"anchor":[anchor.x,anchor.y,anchor.z]})
			s.workers.append({"id":worker.id,"job":worker.job,"state":worker.state,"carry":worker.carry,"amount":worker.amount,"position":[worker.x,worker.y,worker.z],"tool":model.get_meta("tool_kind",""),"arm":arm,"hand":[hand.x,hand.y,hand.z],"feet":feet,"grip_error":motion.get("hand_error",0),"destination":worker.get("destination",0)})
		s.player_buildings=session.structures.filter(func(b):return b.team=="player" and not b.dead).map(func(b):return {"type":b.type,"cell":[b.gx,b.gz],"hp":b.hp})
		s.player_squads=[]
		for squad in session.squads:
			if squad.team!="player":continue
			var alive=squad.members.filter(func(u):return not u.dead)
			if not alive.is_empty():s.player_squads.append({"id":squad.id,"role":squad.role,"order":[squad.order.x,squad.order.z] if squad.order!=Vector3.INF else [],"queue":squad.get("queue",[]).size(),"members":alive.map(func(u):return {"id":u.id,"position":[u.x,u.y,u.z],"screen":[camera.unproject_position(session.pos(u)+Vector3.UP*.45).x,camera.unproject_position(session.pos(u)+Vector3.UP*.45).y],"transit":u.transit,"garrison":u.garrison})})
		s.selected_squad=selected_squad.get("id",0)
		s.selected_squads=selected_squads.keys();s.lord_selected=lord_selected;s.attack_armed=controls.attack_armed
		s.input_mode="touch" if controls.touch_mode else "mouse";s.touch_box=controls.touch_box_select;s.queue_mode=controls.queue_mode;s.build_ready=touch_controls.build_ready
		s.placement={"cell":[ghost_cell.x,ghost_cell.y],"valid":placement_valid,"hint":placement_hint,"count":preview_count}
		s.terrain_version=audit_terrain_version
		s.minimap={"x":map_rect.position.x,"y":map_rect.position.y,"width":map_rect.size.x,"height":map_rect.size.y}
		s.ui_hash=audit_ui_hash;s.screen=ui.screen;s.context=ui.popover_kind
		s.frame=Engine.get_process_frames();s.selected_build=selected_build;s.tray=selected_tab if tray.visible else ""
		s.zoom=zoom;s.camera=[camera_target.x,camera_target.z];s.camera_position=[camera.position.x,camera.position.y,camera.position.z];s.camera_target=[camera_target.x,camera_target.y,camera_target.z];s.camera_yaw=camera_yaw;s.viewport=[get_viewport().get_visible_rect().size.x,get_viewport().get_visible_rect().size.y]
		s.sound_enabled=sound.enabled;s.audio=sound.snapshot();s.touches=touches.size();s.touch_gesture=touch_gesture
		s.civilians=session.civilians.map(func(u):return {"id":u.id,"position":[u.x,u.y,u.z]})
		s.speed=session.speed;s.build_rotation=build_rotation;s.message=message_label.text
		s.objective=ui.objective_label.text;s.result=PlayerGuidance.result(session) if session.state in ["victory","defeat"] else ""
		s.compact=compact;s.training=session.training;s.save_notice=save_notice;s.has_save=has_saved_game();s.selected_structure=selected_structure
		s.site=SiteInspector.describe(session,session.structure_by_id(selected_structure)) if selected_structure and not session.structure_by_id(selected_structure).is_empty() else {}
		s.layout=[];_collect_layout(hud,s.layout)
		JavaScriptBridge.eval("window.__yongchang.state="+JSON.stringify(s)+";")
		var probe=camera.unproject_position(session.world([47,54]))
		JavaScriptBridge.eval("window.__yongchang.ui="+JSON.stringify(rectangles)+";window.__yongchang.buildProbe="+JSON.stringify({"x":probe.x,"y":probe.y})+";")

func _collect_buttons(node: Node, result: Dictionary):
	if node is Control and not node.is_visible_in_tree():return
	if node is Button:
		var rect=node.get_global_rect()
		result[node.get_meta("ui_label",node.text)]={"x":rect.position.x,"y":rect.position.y,"width":rect.size.x,"height":rect.size.y}
	for child in node.get_children():_collect_buttons(child,result)

func _collect_layout(node:Node,result:Array):
	if node is Control and not node.is_visible_in_tree():return
	if node is Button:
		var rect=node.get_global_rect();var clipped=rect;var parent=node.get_parent()
		while parent:
			if parent is Control and parent.clip_contents:clipped=clipped.intersection(parent.get_global_rect())
			parent=parent.get_parent()
		clipped=clipped.intersection(get_viewport().get_visible_rect())
		result.append({"label":node.get_meta("ui_label",node.text),"rect":[rect.position.x,rect.position.y,rect.size.x,rect.size.y],"visible_rect":[clipped.position.x,clipped.position.y,clipped.size.x,clipped.size.y],"disabled":node.disabled})
	for child in node.get_children():_collect_layout(child,result)

func _sync_civilian_models():
	var count=session.civilians.size()
	while peasants.size()<count:
		var model=assets.model("player_unit_peasant");UnitRig.attach(model);world_root.add_child(model);peasants.append(model)
	while peasants.size()>count:peasants.pop_back().queue_free()
	var total=hash([int(session.res.wood/8),int(session.res.stone/12),int(session.res.iron/4),int(session.res.food/12),int(session.res.bows/2),int(session.res.armor/2),session.version])
	if total==stocks_value:return
	stocks_value=total
	for model in stock_models:model.queue_free()
	stock_models.clear()
	for resource in ["wood","stone","iron","food","bows","armor"]:
		var amount=mini(9,int(session.res[resource]/({"wood":8,"stone":12,"iron":4,"food":12,"bows":2,"armor":2}[resource])))
		var kind="stockpile" if resource in ["wood","stone","iron"] else "granary" if resource=="food" else "armory"
		var depots=session.structures.filter(func(s):return not s.dead and s.team=="player" and s.type==kind)
		if depots.is_empty():continue
		var offset={"wood":Vector3(-.5,.12,-.5),"stone":Vector3(.5,.12,-.5),"iron":Vector3(-.5,.12,.5),"food":Vector3(.65,.12,.6),"bows":Vector3(-.3,.12,.6),"armor":Vector3(.3,.12,.6)}[resource]
		for i in amount:
			var depot=depots[i%depots.size()];var origin=session.pos(depot)
			var model=assets.model("cargo_"+("bow" if resource=="bows" else resource))
			model.position=origin+offset+Vector3((i%3)*.21,floori(i/3.0)*.16,0)
			world_root.add_child(model);stock_models.append(model)

func _event(kind: String,payload):
	match kind:
		"spawn":_add_unit(payload)
		"worker":_add_worker(payload)
		"build":_add_structure(payload);sound.play("place",session.pos(payload));_refresh_walls()
		"destroy":
			if visuals.has(payload.id):visuals[payload.id].queue_free();visuals.erase(payload.id)
			_refresh_walls()
		"death":
			if visuals.has(payload.id):visuals[payload.id].queue_free();visuals.erase(payload.id)
			if work_visuals.has(payload.id):work_visuals[payload.id].node.queue_free();work_visuals.erase(payload.id)
		"sail":
			var boat=assets.model(payload.team+"_boat"+("_large" if payload.large else ""));world_root.add_child(boat);boat_visuals[payload.id]=boat
		"land":
			if boat_visuals.has(payload.id):boat_visuals[payload.id].queue_free();boat_visuals.erase(payload.id)
		"tree":
			if tree_visuals.has(payload.id):
				var tree=tree_visuals[payload.id];var transform:Transform3D=tree.transform
				if payload.wood<=0:transform.basis=transform.basis.scaled(Vector3.ZERO)
				tree.mesh.set_instance_transform(tree.index,transform)
		"message":message_label.text=payload;message_timer=5.0
		"sound":sound.play(payload,sound.spatial_origin);sound.spatial_origin=Vector3.INF
		"shot":
			sound.spatial_origin=payload.from
			var mesh=MeshInstance3D.new();var sphere=SphereMesh.new();sphere.radius=.12 if payload.cannon else .045;sphere.height=sphere.radius*2;mesh.mesh=sphere
			var mat=StandardMaterial3D.new();mat.albedo_color=Color("eeb65b");mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;mesh.material_override=mat
			world_root.add_child(mesh);projectile_visuals.append({"mesh":mesh,"from":payload.from,"to":payload.to,"age":0.0,"duration":maxf(.12,payload.from.distance_to(payload.to)/20.0)})

func _add_structure(s: Dictionary):
	var model:Node3D
	if s.has("model"):model=assets.instantiate(s.model)
	elif s.type=="waterGate":
		model=preload("res://scripts/watergate_model.gd").create(s.cells.size(),s.foundation_bottom-s.y-.12)
		model.position=session.pos(s);model.rotation.y=int(s.rotation)*PI/2
	elif s.type=="pitch":
		var mesh=MeshInstance3D.new();var box=BoxMesh.new();box.size=Vector3(.92,.07,.92);mesh.mesh=box
		var mat=StandardMaterial3D.new();mat.albedo_color=Color("302538");mesh.material_override=mat;model=mesh;model.position=session.pos(s)
	else:
		model=assets.model(s.team+"_"+("wall_0" if s.type=="wall" else s.type));model.position=session.pos(s);model.rotation.y=int(s.get("rotation",0))*PI/2
	_add_foundation(model,s)
	world_root.add_child(model);visuals[s.id]=model

func _add_foundation(model:Node3D,s:Dictionary):
	if s.type=="waterGate":return
	if not s.has("foundation_bottom") or s.y-s.foundation_bottom<=.035:return
	var plinth=MeshInstance3D.new();var block=BoxMesh.new();var height=s.y-s.foundation_bottom+.08
	var width=s.half.hx*2+.02;var depth=s.half.hz*2+.02
	block.size=Vector3(width if int(s.rotation)%2==0 else depth,height,depth if int(s.rotation)%2==0 else width);plinth.mesh=block;plinth.position.y=-height*.5
	var stone=StandardMaterial3D.new();stone.albedo_color=Color("77746a");plinth.material_override=stone
	if s.type=="gate":
		# Support the two gate piers, leaving the passage at its original terrain height.
		block.size.z=.22;plinth.position.z=-.89;model.add_child(plinth)
		var other=plinth.duplicate();other.position.z=.89;model.add_child(other)
	else:model.add_child(plinth)

func _refresh_walls():
	for s in session.structures:
		if s.dead or s.type!="wall" or s.get("custom",false):continue
		var mask=0;var dirs=[Vector2i(0,-1),Vector2i(1,0),Vector2i(0,1),Vector2i(-1,0)]
		for i in 4:
			var neighbor=session.occupied.get(Vector2i(s.gx,s.gz)+dirs[i])
			if neighbor and neighbor.team==s.team and neighbor.type in GameSession.FORTS:mask|=1<<i
		if visuals.has(s.id):visuals[s.id].queue_free()
		var model=assets.model(s.team+"_wall_"+str(mask));model.position=session.pos(s);_add_foundation(model,s);world_root.add_child(model);visuals[s.id]=model

func _add_unit(u: Dictionary):
	var model=assets.model(u.team+"_unit_"+u.role);UnitRig.attach(model);model.position=session.pos(u);world_root.add_child(model);visuals[u.id]=model

func _add_worker(w: Dictionary):
	var model=assets.model("ox" if w.ox else "player_unit_peasant");UnitRig.attach(model);world_root.add_child(model);visuals[w.id]=model

func _sync_visuals(dt: float):
	var alpha=clampf(tick*30.0,0,1) if session.state=="play" else 1.0
	contact_shadows.update(session,alpha)
	var pose_clock=maxf(0,session.time-(1.0-alpha)/30.0) if session.state=="play" else session.time
	for u in session.units+session.workers:
		if u.dead or not visuals.has(u.id):continue
		var model=visuals[u.id];var current=session.pos(u);var prior:Vector3=u.get("render_from",current)
		var position=prior.lerp(current,alpha) if prior.distance_to(current)<1.0 and not u.get("garrison",0) else current
		if model.position!=position:model.position=position
		var elapsed=maxf(0,pose_clock-model.get_meta("facing_time",pose_clock))
		var facing=lerp_angle(model.rotation.y,u.yaw,1-exp(-elapsed*18))
		if model.rotation.y!=facing:model.rotation.y=facing
		model.set_meta("facing_time",pose_clock)
		var shown=not (u.get("role","")=="lord" and u.get("garrison",0))
		if model.visible!=shown:model.visible=shown
		var render_actor=u.duplicate(false)
		if u.has("motion_distance"):render_actor.motion_distance=lerpf(float(u.get("render_motion_from",u.motion_distance)),float(u.motion_distance),alpha)
		UnitRig.pose(model,render_actor,pose_clock,assets,session.elevation)
		if u.has("job") and not u.ox:
			var working=u.state in ["gather","process"]
			var mode=u.job+u.state if working else ""
			var old=work_visuals.get(u.id,{})
			if old.get("mode","")!=mode:
				if old.has("node"):old.node.queue_free()
				work_visuals.erase(u.id)
				if working:
					var prop=WorkProps.create(u.job,u.state);prop.position=model.position;prop.rotation.y=u.yaw;prop.scale=model.scale;world_root.add_child(prop);work_visuals[u.id]={"mode":mode,"node":prop}
	for i in mini(peasants.size(),session.civilians.size()):
		var actor=session.civilians[i];var point=session.pos(actor);var from:Vector3=actor.get("render_from",point)
		peasants[i].position=from.lerp(point,alpha) if from.distance_to(point)<1 else point
		peasants[i].rotation.y=actor.yaw
		UnitRig.pose(peasants[i],actor,pose_clock,assets,session.elevation)
	for s in session.structures:
		if s.dead or not visuals.has(s.id):continue
		var model=visuals[s.id]
		if model.has_meta("sails") and session.state=="play":model.get_meta("sails").rotation.x+=dt*session.speed*1.75
		if model.has_meta("gateLeafL"):
			var open=session.units.any(func(u):return not u.dead and u.team==s.team and session.pos(u).distance_to(session.pos(s))<3)
			model.get_meta("gateLeafL").rotation.y=lerpf(model.get_meta("gateLeafL").rotation.y,1.46 if open else 0,minf(1,dt*10))
			model.get_meta("gateLeafR").rotation.y=-model.get_meta("gateLeafL").rotation.y
	for trip in session.trips:
		if boat_visuals.has(trip.id):
			boat_visuals[trip.id].position=trip.get("render_from",trip.position).lerp(trip.position,alpha)
			boat_visuals[trip.id].rotation.y=lerp_angle(trip.get("render_yaw_from",trip.yaw),trip.yaw,alpha)
	for p in projectile_visuals.duplicate():
		p.age+=dt*session.speed if session.state=="play" else 0
		var t=minf(1,p.age/p.duration);p.mesh.position=p.from.lerp(p.to,t)+Vector3.UP*sin(t*PI)*.6
		if t>=1:p.mesh.queue_free();projectile_visuals.erase(p)
	var target_color=Color("182636") if session.night else Color("b0a695")
	environment.environment.background_color=environment.environment.background_color.lerp(target_color,minf(1,dt*2))
	environment.environment.ambient_light_energy=lerpf(environment.environment.ambient_light_energy,.40 if session.night else .72,dt*2)
	sun.light_energy=lerpf(sun.light_energy,.48 if session.night else 1.35,dt*2)

func _draw_overlay():
	if not session or ui.screen!="play":return
	for u in session.units:
		if u.dead or u.transit or u.garrison:continue
		var selected=controls.selected(u)
		if not selected and u.hp>=u.max_hp:continue
		if selected:
			var ring=PackedVector2Array()
			for i in 25:
				var a=i*TAU/24;var base=session.pos(u)+Vector3(cos(a)*.48,.06,sin(a)*.48);ring.append(camera.unproject_position(base))
			overlay.draw_polyline(ring,Color(.6,.95,.76),2,true)
		var at=session.pos(u)+Vector3.UP*1.2
		if camera.is_position_behind(at):continue
		var p=camera.unproject_position(at)
		overlay.draw_rect(Rect2(p-Vector2(20,3),Vector2(40,6)),Color("241b15"))
		overlay.draw_rect(Rect2(p-Vector2(20,3),Vector2(40*maxf(0,u.hp/u.max_hp),6)),Color("78b7cc") if u.team=="player" else Color("e57f61"))

	if controls.selecting and controls.pointer.distance_to(controls.start)>7:
		var rect=Rect2(controls.start,controls.pointer-controls.start).abs()
		overlay.draw_rect(rect,Color(.3,.8,.62,.12));overlay.draw_rect(rect,Color(.6,.95,.76),false,2)
	if selected_build!="" and placement_hint!="" and is_instance_valid(ghost) and ghost.visible:
		var label=placement_hint+("" if controls.touch_mode else " · 右键取消")
		var font=ui.theme.default_font;var extent=font.get_string_size(label,HORIZONTAL_ALIGNMENT_LEFT,-1,18)+Vector2(20,18)
		var at=controls.pointer+Vector2(22,24);var size=get_viewport().get_visible_rect().size
		at.x=clampf(at.x,8,maxf(8,size.x-extent.x-8));at.y=clampf(at.y,105,maxf(105,size.y-extent.y-8))
		overlay.draw_rect(Rect2(at,extent),Color(.10,.14,.12,.94))
		overlay.draw_string(font,at+Vector2(10,23),label,HORIZONTAL_ALIGNMENT_LEFT,-1,18,BuildPreview.CLEAR if placement_valid else BuildPreview.BLOCKED)

func ground(screen: Vector2) -> Vector3:
	var from=camera.project_ray_origin(screen);var dir=camera.project_ray_normal(screen)
	return session.terrain.raycast(from,dir,camera.far)

# Keep normal touch-to-mouse UI taps. Two fingers exclusively control the camera;
# cancelling the pending primary press prevents an accidental building or order.
func _input(event):
	if touch_controls and (event is InputEventScreenTouch or event is InputEventScreenDrag):
		if touch_controls.input(event):get_viewport().set_input_as_handled()
		return
	if controls and session and session.state=="play" and event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_RIGHT and event.pressed and selected_build!="":
		controls.cancel_gesture();_cancel_placement();get_viewport().set_input_as_handled();return
	if controls and event is InputEventMouseButton and event.device!=InputEvent.DEVICE_ID_EMULATION and not event.pressed:
		if event.button_index==MOUSE_BUTTON_MIDDLE:pan=false
		if event.button_index==MOUSE_BUTTON_RIGHT and ui.blocks_world(event.position):controls.cancel_gesture()
		if event.button_index==MOUSE_BUTTON_LEFT and get_viewport().gui_get_hovered_control()!=null:controls.cancel_gesture()

func _end_touch_gesture():
	if touches.is_empty():touch_gesture=false

func _notification(what):
	if what==NOTIFICATION_WM_MOUSE_EXIT and controls:controls.pointer_inside=false
	if what==NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		touches.clear();touch_gesture=false;pan=false;build_start=Vector2i(-1,-1)
		if touch_controls:touch_controls.cancel();touch_controls.clear_build()
		if controls:controls.cancel_gesture();controls.pointer_inside=false
		if session and session.state=="play":_pause()

func _unhandled_input(event):
	if not session:return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode==KEY_ESCAPE:
			controls.cancel_gesture()
			if ui.screen!="play":_pause()
			elif ui.close_popover():pass
			elif tray.visible:tray.hide()
			elif selected_build!="":_cancel_placement()
			elif controls.attack_armed:controls.attack_armed=false
			elif lord_selected or not selected_squad.is_empty():controls.set_selection([])
			else:_pause()
			_update_hud();get_viewport().set_input_as_handled();return
		if session.state!="play" or ui.screen!="play":return
		if controls.key(event):get_viewport().set_input_as_handled();return
		match event.keycode:
			KEY_B:_toggle_tray("build")
			KEY_T:session.scout()
			KEY_M:_overview()
			KEY_R:build_rotation=(build_rotation+1)%4;_refresh_ghost()
			KEY_Q:camera_yaw-=PI/4
			KEY_E:camera_yaw+=PI/4
	if session.state!="play":return
	if event is InputEventMagnifyGesture:zoom=clampf(zoom/event.factor,7.5,session.map.camera.maxZoom)
	if event is InputEventPanGesture:camera_target+=Vector3(event.delta.x,0,event.delta.y).rotated(Vector3.UP,camera_yaw)*zoom*.015
	if event is InputEventMouseButton or event is InputEventMouseMotion:controls.mouse(event)

func _order(target:Vector3,queued=false,attack_move=false):
	if target==Vector3.INF:return
	var squads=controls.selection()
	if squads.is_empty() and not lord_selected:return
	if lord_selected:session.command_lord(target,queued,attack_move)
	var direct=session.occupied.has(session.grid(target)) or session.units_by_team.enemy.any(func(u):return not u.dead and session.pos(u).distance_to(target)<1.2)
	for i in squads.size():
		# Preserve each squad's formation and give separate squads distinct destinations.
		var offset=Vector3((i%3- minf(squads.size()-1,2)*.5)*2.2,0,floori(i/3.0)*2.2) if squads.size()>1 and not direct else Vector3.ZERO
		session.command_squad(squads[i],target+offset,queued,attack_move)
	_show_marker(target);navigation_timer=.8;sound.play("scan")

func _clear_ghost():
	if is_instance_valid(ghost):ghost.visible=false;ghost.queue_free()
	ghost=null

func _commit_build(cells:Array):
	if selected_build=="":return
	var kind=selected_build
	for c in cells:
		if not session.build(kind,c,build_rotation):break
	build_start=Vector2i(-1,-1);_refresh_ghost();_update_hud()

func _update_build_pointer(at:Vector2):
	var point=ground(at)
	if point==Vector3.INF or get_viewport().gui_get_hovered_control()!=null:
		if is_instance_valid(ghost):ghost.visible=false
		return
	var p=session.grid(point)
	var budget=session.source.buildings[selected_build].cost.keys().map(func(k):return floorf(session.res[k]))
	if p!=ghost_cell or ghost_version!=session.version or ghost_budget!=budget or not is_instance_valid(ghost) or not ghost.visible:
		ghost_cell=p;_refresh_ghost()

func _refresh_ghost():
	_clear_ghost()
	if selected_build=="" or ghost_cell.x<0:return
	ghost=BuildPreview.create(self);world_root.add_child(ghost);ghost_version=session.version
	ghost_budget=session.source.buildings[selected_build].cost.keys().map(func(k):return floorf(session.res[k]))

func _line(a: Vector2i,b: Vector2i) -> Array:
	var points=[];var p=a;var dx=absi(b.x-a.x);var dz=-absi(b.y-a.y);var sx=1 if a.x<b.x else -1;var sz=1 if a.y<b.y else -1;var err=dx+dz
	for i in 400:
		points.append(p)
		if p==b:break
		var twice=2*err
		if twice>=dz:err+=dz;p.x+=sx
		if twice<=dx:err+=dx;p.y+=sz
	return points
