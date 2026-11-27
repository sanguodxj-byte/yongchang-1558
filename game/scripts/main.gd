extends Node3D

const AssetLibrary=preload("res://scripts/assets.gd")
const GameSession=preload("res://scripts/session.gd")
const Sound=preload("res://scripts/sound.gd")
const GameUI=preload("res://scripts/mobile_ui.gd")
const UnitRig=preload("res://scripts/unit_rig.gd")
const WorkProps=preload("res://scripts/work_props.gd")
const PerformanceProbe=preload("res://scripts/performance_probe.gd")
const PlayerGuidance=preload("res://scripts/player_guidance.gd")
const CompactUI=preload("res://scripts/compact_ui.gd")
const SaveStore=preload("res://scripts/save_store.gd")
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
var lord_selected=false
var pointer_down=Vector2.ZERO
var pan=false
var dragged=false
var suppress_left_release=false
var dragging_order=false
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
	env.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;env.ambient_light_color=Color("dfd6c5");env.ambient_light_energy=.65
	env.tonemap_mode=Environment.TONE_MAPPER_FILMIC
	sun=DirectionalLight3D.new();sun.light_color=Color("ffe8c2");sun.light_energy=1.7
	sun.rotation_degrees=Vector3(-52,-30,0);sun.shadow_enabled=true;sun.directional_shadow_max_distance=120;add_child(sun)
	var fill=DirectionalLight3D.new();fill.light_color=Color("adc4df");fill.light_energy=.3;fill.rotation_degrees=Vector3(-40,145,0);add_child(fill)
	camera=Camera3D.new();camera.name="Camera";camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.near=.1;camera.far=400;add_child(camera);camera.current=true
	_move_camera()

func _add_forest():
	var groups={}
	for tree in session.trees:
		var key=int(tree.model.geo)
		if not groups.has(key):groups[key]=[]
		groups[key].append(tree)
	for key in groups:
		var batch=MultiMeshInstance3D.new();batch.name="Forest_"+str(key)
		var mm=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D;mm.use_colors=true;mm.mesh=assets.meshes[key];mm.instance_count=groups[key].size()
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
	_setup_ui();_build_modal("pause" if previous in ["info","confirm_return","confirm_new"] else previous)

func short_name(key:String) -> String:
	return {"wall":"花岗城墙","gate":"谯楼城门","tower":"空心敌台","ballista":"火炮台","pitch":"猛火油壕","demolish":"拆建","farm":"水车稻田","woodcutter":"竹木作坊","quarry":"山麓采石","ironMine":"天工铁冶","pitchRig":"熬油坊","fletcher":"军器局","blacksmith":"甲仗锻局","hovel":"粉墙民居","stockpile":"物资堆放场","oxPost":"水牛绑牛桩","spearman":"狼筅乡勇","archer":"鸟铳手","swordsman":"藤牌刀兵","knight":"宗族铁骑","ram":"包铁冲车","trebuchet":"虎蹲炮车"}.get(key,key)

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
		_:text="目标：保住宗长，攻破敌营并击败倭酋获胜。\n开局：先建伐木坊与稻田，再采石筑防、造械募兵。\n营造：选卡后点地面；城墙/油壕可拖线；R转向。\n卡牌：上一页/下一页可翻看；民丁自动上岗运输。\n调兵：点小队后点地面；鸟铳手可驻城墙或敌台。\n渡海：军令→进攻，全军自动集结乘船。\n宗族：驻祠可休养，义捐与驰援每局限次。\n镜头：右键拖、WASD、滚轮、Q/E；M全图。\n触屏：点按营造/调兵；双指平移、缩放。\nEsc先收起操作，再暂停；T查询防线。\n\n史料参照永昌堡西山东海、南北双渠；黑鲨岛、航线与战局为玩法创作。"
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
	if kind=="build":selected_build=key;selected_squad={};lord_selected=false;tray.hide();_refresh_ghost()
	else:
		var squad=session.recruit_squad(key)
		if not squad.is_empty():
			selected_squad=squad;lord_selected=false;sound.play("horn")
			session.message("募得%s%d人 · 已选中，收起后点地面调遣"%[session.source.units[key].name,squad.members.size()])
	_update_hud()

func restart_game(start_play=false):
	get_tree().set_meta("start_next_game",start_play)
	get_tree().set_meta("sound_enabled",sound.enabled)
	get_tree().reload_current_scene()

func _cancel_placement():
	selected_build="";build_start=Vector2i(-1,-1);_clear_ghost()

func _res_name(key: String) -> String:
	return {"wood":"木","stone":"石","food":"粮","gold":"银","iron":"铁","oil":"油","bows":"铳","armor":"甲"}.get(key,key)

func _policy():
	var choices=["balanced","harsh","generous"];session.policy=choices[(choices.find(session.policy)+1)%3]
	session.message({"balanced":"耕读传家：赋饷均衡","harsh":"毁家纾难：增饷减粮，归附放缓","generous":"义仓赈乡：双粮赈济，士气 +20%"}[session.policy])

func _garrison_lord():
	if session.player_lord.garrison:session.player_lord.garrison=0;session.player_lord.order=session.pos(session.player_keep)+Vector3(2.4,0,0)
	else:session.player_lord.order=session.apron(session.pos(session.player_keep),"player");session.player_lord.enter=session.player_keep.id

func _pause():
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
	if session.state=="play":
		var move=Vector2(Input.get_axis("ui_left","ui_right"),Input.get_axis("ui_up","ui_down"))
		if Input.is_physical_key_pressed(KEY_A):move.x-=1
		if Input.is_physical_key_pressed(KEY_D):move.x+=1
		if Input.is_physical_key_pressed(KEY_W):move.y-=1
		if Input.is_physical_key_pressed(KEY_S):move.y+=1
		camera_target+=Vector3(move.x,0,move.y).rotated(Vector3.UP,camera_yaw)*dt*zoom*.8
		tick+=dt*session.speed
		while tick>=1.0/30.0:session.step(1.0/30.0);tick-=1.0/30.0
		if session.state in ["victory","defeat"]:_build_modal(session.state);sound.play("horn" if session.state=="victory" else "bell")
		save_timer+=dt
		if save_timer>=12:save_game(true)
	if performance_probe.enabled:performance_probe.mark()
	_move_camera()
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
	camera_target.x=clampf(camera_target.x,-session.map.width/2.0+4,session.map.width/2.0-3);camera_target.z=clampf(camera_target.z,-session.map.height/2.0+5,session.map.height/2.0-5)
	camera_target.y=session.elevation(camera_target)
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
	audit_map_size=Vector2i(session.map.width,session.map.height);audit_fortress_json=JSON.stringify(session.snapshot().fortress)
	audit_build_probe=camera.unproject_position(session.world([47,54]))
	_sync_civilian_models()
	var rectangles={}
	_collect_buttons(hud,rectangles)
	audit_ui_json=JSON.stringify(rectangles)
	audit_ui_hash=audit_ui_json.sha256_text();audit_viewport=get_viewport().get_visible_rect().size
	var map_rect=minimap.get_global_rect();audit_map_origin=map_rect.position;audit_map_extent=map_rect.size
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
			if not alive.is_empty():s.player_squads.append({"id":squad.id,"role":squad.role,"members":alive.map(func(u):return {"position":[u.x,u.y,u.z],"transit":u.transit,"garrison":u.garrison})})
		s.selected_squad=selected_squad.get("id",0)
		s.terrain_version=audit_terrain_version
		s.minimap={"x":map_rect.position.x,"y":map_rect.position.y,"width":map_rect.size.x,"height":map_rect.size.y}
		s.ui_hash=audit_ui_hash;s.screen=ui.screen;s.context=ui.popover_kind
		s.frame=Engine.get_process_frames();s.selected_build=selected_build;s.tray=selected_tab if tray.visible else ""
		s.zoom=zoom;s.camera=[camera_target.x,camera_target.z];s.camera_position=[camera.position.x,camera.position.y,camera.position.z];s.camera_target=[camera_target.x,camera_target.y,camera_target.z];s.camera_yaw=camera_yaw;s.viewport=[get_viewport().get_visible_rect().size.x,get_viewport().get_visible_rect().size.y]
		s.sound_enabled=sound.enabled;s.touches=touches.size();s.touch_gesture=touch_gesture
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
	var count=int(session.res.peasants)
	while peasants.size()<count:
		var model=assets.model("player_unit_peasant");UnitRig.attach(model);world_root.add_child(model);peasants.append(model)
	while peasants.size()>count:peasants.pop_back().queue_free()
	var camp=session.world(session.map.campfire)
	for i in peasants.size():
		var angle=i*TAU/maxi(1,count)
		peasants[i].position=camp+Vector3(cos(angle)*1.15,0,sin(angle)*1.15)
		peasants[i].position.y=session.elevation(peasants[i].position)
		peasants[i].rotation.y=atan2(-cos(angle),-sin(angle))
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
		"build":_add_structure(payload);sound.play("place");_refresh_walls()
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
		"sound":sound.play(payload)
		"shot":
			var mesh=MeshInstance3D.new();var sphere=SphereMesh.new();sphere.radius=.12 if payload.cannon else .045;sphere.height=sphere.radius*2;mesh.mesh=sphere
			var mat=StandardMaterial3D.new();mat.albedo_color=Color("eeb65b");mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;mesh.material_override=mat
			world_root.add_child(mesh);projectile_visuals.append({"mesh":mesh,"from":payload.from,"to":payload.to,"age":0.0,"duration":maxf(.12,payload.from.distance_to(payload.to)/20.0)})

func _add_structure(s: Dictionary):
	var model:Node3D
	if s.has("model"):model=assets.instantiate(s.model)
	elif s.type=="pitch":
		var mesh=MeshInstance3D.new();var box=BoxMesh.new();box.size=Vector3(.92,.07,.92);mesh.mesh=box
		var mat=StandardMaterial3D.new();mat.albedo_color=Color("302538");mesh.material_override=mat;model=mesh;model.position=session.pos(s)
	else:
		model=assets.model(s.team+"_"+("wall_0" if s.type=="wall" else s.type));model.position=session.pos(s);model.rotation.y=int(s.get("rotation",0))*PI/2
	world_root.add_child(model);visuals[s.id]=model

func _refresh_walls():
	for s in session.structures:
		if s.dead or s.type!="wall" or s.get("custom",false):continue
		var mask=0;var dirs=[Vector2i(0,-1),Vector2i(1,0),Vector2i(0,1),Vector2i(-1,0)]
		for i in 4:
			var neighbor=session.occupied.get(Vector2i(s.gx,s.gz)+dirs[i])
			if neighbor and neighbor.team==s.team and neighbor.type in GameSession.FORTS:mask|=1<<i
		if visuals.has(s.id):visuals[s.id].queue_free()
		var model=assets.model(s.team+"_wall_"+str(mask));model.position=session.pos(s);world_root.add_child(model);visuals[s.id]=model

func _add_unit(u: Dictionary):
	var model=assets.model(u.team+"_unit_"+u.role);UnitRig.attach(model);model.position=session.pos(u);world_root.add_child(model);visuals[u.id]=model

func _add_worker(w: Dictionary):
	var model=assets.model("ox" if w.ox else "player_unit_peasant");UnitRig.attach(model);world_root.add_child(model);visuals[w.id]=model

func _sync_visuals(dt: float):
	for u in session.units+session.workers:
		if u.dead or not visuals.has(u.id):continue
		var model=visuals[u.id];var position=session.pos(u)
		if model.position!=position:model.position=position
		var elapsed=maxf(0,session.time-model.get_meta("facing_time",session.time))
		var facing=lerp_angle(model.rotation.y,u.yaw,1-exp(-elapsed*18))
		if model.rotation.y!=facing:model.rotation.y=facing
		model.set_meta("facing_time",session.time)
		var shown=not (u.get("role","")=="lord" and u.get("garrison",0))
		if model.visible!=shown:model.visible=shown
		UnitRig.pose(model,u,session.time,assets,session.elevation)
		if u.has("job") and not u.ox:
			var working=u.state in ["gather","process"]
			var mode=u.job+u.state if working else ""
			var old=work_visuals.get(u.id,{})
			if old.get("mode","")!=mode:
				if old.has("node"):old.node.queue_free()
				work_visuals.erase(u.id)
				if working:
					var prop=WorkProps.create(u.job,u.state);prop.position=model.position;prop.rotation.y=u.yaw;prop.scale=model.scale;world_root.add_child(prop);work_visuals[u.id]={"mode":mode,"node":prop}
	for i in peasants.size():UnitRig.pose(peasants[i],{"id":i},session.time,assets)
	for s in session.structures:
		if s.dead or not visuals.has(s.id):continue
		var model=visuals[s.id]
		if model.has_meta("sails") and session.state=="play":model.get_meta("sails").rotation.x+=dt*session.speed*1.75
		if model.has_meta("gateLeafL"):
			var open=session.units.any(func(u):return not u.dead and u.team==s.team and session.pos(u).distance_to(session.pos(s))<3)
			model.get_meta("gateLeafL").rotation.y=lerpf(model.get_meta("gateLeafL").rotation.y,1.46 if open else 0,minf(1,dt*10))
			model.get_meta("gateLeafR").rotation.y=-model.get_meta("gateLeafL").rotation.y
	for trip in session.trips:
		if boat_visuals.has(trip.id):boat_visuals[trip.id].position=trip.position;boat_visuals[trip.id].rotation.y=trip.yaw
	for p in projectile_visuals.duplicate():
		p.age+=dt*session.speed if session.state=="play" else 0
		var t=minf(1,p.age/p.duration);p.mesh.position=p.from.lerp(p.to,t)+Vector3.UP*sin(t*PI)*.6
		if t>=1:p.mesh.queue_free();projectile_visuals.erase(p)
	var target_color=Color("182636") if session.night else Color("b0a695")
	environment.environment.background_color=environment.environment.background_color.lerp(target_color,minf(1,dt*2))
	environment.environment.ambient_light_energy=lerpf(environment.environment.ambient_light_energy,.35 if session.night else .65,dt*2)
	sun.light_energy=lerpf(sun.light_energy,.5 if session.night else 1.7,dt*2)

func _draw_overlay():
	if not session or ui.screen!="play":return
	for u in session.units:
		if u.dead or u.transit or u.garrison:continue
		var selected=lord_selected and u==session.player_lord or not selected_squad.is_empty() and u.squad==selected_squad.id
		if not selected and u.hp>=u.max_hp:continue
		var at=session.pos(u)+Vector3.UP*1.2
		if camera.is_position_behind(at):continue
		var p=camera.unproject_position(at)
		overlay.draw_rect(Rect2(p-Vector2(20,3),Vector2(40,6)),Color("241b15"))
		overlay.draw_rect(Rect2(p-Vector2(20,3),Vector2(40*maxf(0,u.hp/u.max_hp),6)),Color("78b7cc") if u.team=="player" else Color("e57f61"))

func ground(screen: Vector2) -> Vector3:
	var from=camera.project_ray_origin(screen);var dir=camera.project_ray_normal(screen)
	return session.terrain.raycast(from,dir,camera.far)

# Keep normal touch-to-mouse UI taps. Two fingers exclusively control the camera;
# cancelling the pending primary press prevents an accidental building or order.
func _input(event):
	if event is InputEventScreenTouch:
		if event.pressed:touches[event.index]=event.position
		else:touches.erase(event.index)
		if touches.size()>=2:
			touch_gesture=true;build_start=Vector2i(-1,-1);dragging_order=false;pan=false
		if touch_gesture and touches.is_empty():call_deferred("_end_touch_gesture")
	elif event is InputEventScreenDrag and touches.has(event.index):
		var before=touches.values();touches[event.index]=event.position
		if touch_gesture and touches.size()>=2 and session and session.state=="play":
			var after=touches.values()
			var old_distance=before[0].distance_to(before[1]);var distance=after[0].distance_to(after[1])
			if old_distance>8 and distance>8:zoom=clampf(zoom*old_distance/distance,7.5,session.map.camera.maxZoom)
			var motion=(after[0]+after[1]-before[0]-before[1])*.5
			camera_target+=Vector3(-motion.x,0,-motion.y*1.42).rotated(Vector3.UP,camera_yaw)*zoom/get_viewport().get_visible_rect().size.y
	if touch_gesture and (event is InputEventMouseButton or event is InputEventMouseMotion or event is InputEventScreenDrag):
		get_viewport().set_input_as_handled()

func _end_touch_gesture():
	if touches.is_empty():touch_gesture=false

func _notification(what):
	if what==NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		touches.clear();touch_gesture=false;pan=false;dragging_order=false;build_start=Vector2i(-1,-1)
		if session and session.state=="play":_pause()

func _unhandled_input(event):
	if not session:return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode==KEY_ESCAPE:
			if ui.screen!="play":_pause()
			elif ui.close_popover():pass
			elif tray.visible:tray.hide()
			elif selected_build!="":_cancel_placement()
			elif lord_selected or not selected_squad.is_empty():lord_selected=false;selected_squad={}
			else:_pause()
			_update_hud();get_viewport().set_input_as_handled();return
		if session.state!="play" or ui.screen!="play":return
		match event.keycode:
			KEY_B:_toggle_tray("build")
			KEY_T:session.scout()
			KEY_M:_overview()
			KEY_R:build_rotation=(build_rotation+1)%4;_refresh_ghost()
			KEY_Q:camera_yaw-=PI/4
			KEY_E:camera_yaw+=PI/4
			KEY_SPACE:session.set_stance("attack")
			KEY_2:session.speed=2 if session.speed==1 else 1
	if session.state!="play":return
	if event is InputEventMagnifyGesture:zoom=clampf(zoom/event.factor,7.5,session.map.camera.maxZoom)
	if event is InputEventPanGesture:camera_target+=Vector3(event.delta.x,0,event.delta.y).rotated(Vector3.UP,camera_yaw)*zoom*.015
	if event is InputEventMouseButton:
		if event.button_index==MOUSE_BUTTON_LEFT:
			if not event.pressed and suppress_left_release:suppress_left_release=false;return
			if event.pressed and ui.dismiss_outside(event.position):suppress_left_release=true;return
		if event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN] and event.pressed:zoom=clampf(zoom+(2 if event.button_index==MOUSE_BUTTON_WHEEL_DOWN else -2),7.5,session.map.camera.maxZoom)
		if event.button_index==MOUSE_BUTTON_RIGHT:
			pan=event.pressed
			if event.pressed:pointer_down=event.position;dragged=false
			elif not dragged and (lord_selected or not selected_squad.is_empty()):_order(ground(event.position))
		if event.button_index==MOUSE_BUTTON_LEFT:
			var hit=ground(event.position)
			if hit==Vector3.INF:return
			if event.pressed:
				pointer_down=event.position;dragged=false
				if selected_build!="":build_start=session.grid(hit)
				else:dragging_order=_pick(hit)
			else:
				if selected_build!="" and build_start.x>=0:
					var end=session.grid(hit)
					var cells=_line(build_start,end) if session.source.buildings[selected_build].mode=="line" else [end]
					for c in cells:session.build(selected_build,c,build_rotation)
					build_start=Vector2i(-1,-1);_refresh_ghost()
				elif dragging_order and dragged:_order(hit)
				elif not dragging_order and (lord_selected or not selected_squad.is_empty()):_order(hit)
				dragging_order=false
	if event is InputEventMouseMotion:
		if event.position.distance_to(pointer_down)>7:dragged=true
		if pan:
			camera_target+=Vector3(-event.relative.x,0,-event.relative.y*1.42).rotated(Vector3.UP,camera_yaw)*zoom/get_viewport().get_visible_rect().size.y
		if selected_build!="":
			var point=ground(event.position)
			if point==Vector3.INF:return
			var p=session.grid(point)
			if p!=ghost_cell:ghost_cell=p;_refresh_ghost()

func _pick(target: Vector3) -> bool:
	selected_structure=0
	var best=1.1;var picked={}
	for u in session.units:
		if u.dead or u.team!="player" or u.transit:continue
		var d=Vector2(target.x-u.x,target.z-u.z).length()
		if d<best:best=d;picked=u
	if picked.is_empty():
		if not lord_selected and selected_squad.is_empty():
			var building=session.occupied.get(session.grid(target),{})
			if not building.is_empty() and building.team=="player":selected_structure=building.id;ui.toggle_popover("site");return true
		return false
	lord_selected=picked.role=="lord";selected_squad={}
	if not lord_selected:
		for sq in session.squads:
			if sq.id==picked.squad:selected_squad=sq;break
	_update_hud();return true

func _order(target: Vector3):
	if target==Vector3.INF:return
	if lord_selected:
		var s=session.occupied.get(session.grid(target))
		if s and s.team=="player":session.player_lord.order=session.apron(session.pos(s),"player");session.player_lord.enter=s.id
		else:session.player_lord.garrison=0;session.player_lord.order=target
	elif not selected_squad.is_empty():session.command_squad(selected_squad,target)
	sound.play("scan")

func _clear_ghost():
	if is_instance_valid(ghost):ghost.queue_free()
	ghost=null

func _refresh_ghost():
	_clear_ghost()
	if selected_build=="" or ghost_cell.x<0:return
	var cells=session.footprint(selected_build,ghost_cell,build_rotation)
	var cube=MeshInstance3D.new();var mesh=BoxMesh.new();mesh.size=Vector3(cells[-1].x-ghost_cell.x+.96,.16,cells[-1].y-ghost_cell.y+.96);cube.mesh=mesh
	var mat=StandardMaterial3D.new();mat.albedo_color=Color(.3,.9,.5,.5);mat.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA;mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;cube.material_override=mat
	if session.placement_error(selected_build,ghost_cell,build_rotation)!="":mat.albedo_color=Color(.95,.28,.22,.55)
	cube.position=(session.world([ghost_cell.x,ghost_cell.y])+session.world([cells[-1].x,cells[-1].y]))/2+Vector3.UP*.08;world_root.add_child(cube);ghost=cube

func _line(a: Vector2i,b: Vector2i) -> Array:
	var points=[];var p=a;var dx=absi(b.x-a.x);var dz=-absi(b.y-a.y);var sx=1 if a.x<b.x else -1;var sz=1 if a.y<b.y else -1;var err=dx+dz
	for i in 400:
		points.append(p)
		if p==b:break
		var twice=2*err
		if twice>=dz:err+=dz;p.x+=sx
		if twice<=dx:err+=dx;p.y+=sz
	return points
