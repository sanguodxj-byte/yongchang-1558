extends RefCounted
# Shared Dora/H5 interface: a Chinese coastal-defence atlas, paper and cinnabar.
const MiniMap=preload("res://scripts/minimap.gd")
var design:Dictionary
var heading_font:Font
var game
var root: Control
var play_hud: Control
var modal: Control
var panel: PanelContainer
var panel_box: VBoxContainer
var backdrop: TextureRect
var shade: ColorRect
var title_content: Control
var tray: PanelContainer
var tray_box: HBoxContainer
var tray_tabs: HBoxContainer
var card_scroll: ScrollContainer
var build_controls: HBoxContainer
var selected_label: Label
var message_label: Label
var phase_label: Label
var lord_label: Label
var hp_player: ProgressBar
var hp_enemy: ProgressBar
var resource_labels={}
var stock_label: Label
var minimap
var theme: Theme
var screen="title"
var category="econ"
var texture_cache={}
var palette_buttons={}
var card_buttons={}
var info_back:Callable
var popover_layer:Control
var popover:PanelContainer
var popover_box:VBoxContainer
var popover_kind=""
var contextual_actions:VBoxContainer
var repair_button:Button
var fire_button:Button
var clan_button:Button
var command_button:Button
var speed_button:Button
var build_button:Button
var army_button:Button
var sound_button:Button
var clan_actions={}
var stance_actions={}
var objective_label:Label
var previous_cards:Button
var next_cards:Button
var guide_button:Button
var training_button:Button
var save_status:Label
var confirm_build_button:Button
var selection_controls:HBoxContainer
var selection_actions={}
var touch_select_button:Button
var map_widget

func _init(owner):
	game=owner
	design=JSON.parse_string(FileAccess.get_file_as_string("res://assets/ui/theme.json"))
	heading_font=load("res://assets/title-kai.ttf")
	var layer=CanvasLayer.new();game.add_child(layer)
	root=Control.new();root.name="GameUI";layer.add_child(root);root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);root.mouse_filter=Control.MOUSE_FILTER_IGNORE
	theme=Theme.new();theme.default_font=load("res://assets/font.ttf");theme.default_font_size=22;root.theme=theme
	play_hud=Control.new();root.add_child(play_hud);play_hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);play_hud.mouse_filter=Control.MOUSE_FILTER_IGNORE
	_setup_hud();_setup_tray();_setup_popover();_setup_modal()

func texture(key:String) -> Texture2D:
	if not texture_cache.has(key):
		var path="res://assets/ui/"+key
		texture_cache[key]=load(path+(".png" if ResourceLoader.exists(path+".png") else ".svg"))
	return texture_cache[key]

func skin(tone:String,state="normal",plain=false) -> StyleBoxTexture:
	var style=StyleBoxTexture.new();style.texture=texture("skin-"+("plain-" if plain else "")+tone+"-"+state)
	var padding=design.layout.panelPadding
	style.set_texture_margin_all(design.layout.frameSlice);style.content_margin_left=padding[0];style.content_margin_right=padding[0];style.content_margin_top=padding[1];style.content_margin_bottom=padding[1]
	return style

func color(role:String) -> Color:
	return Color(design.colors[role])

func label(text:String,size=22,dark=false) -> Label:
	var l=Label.new();l.text=text;l.mouse_filter=Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_size_override("font_size",size)
	l.add_theme_color_override("font_color",color("ink"));l.add_theme_constant_override("outline_size",0)
	return l

func heading(text:String,size=32) -> Label:
	var l=label(text,size);l.add_theme_font_override("font",heading_font);return l

func _rule(parent:Control):
	parent.add_child(picture("chapter-rule",Vector2(0,20)))

func picture(key:String,size:Vector2) -> TextureRect:
	var t=TextureRect.new();t.texture=texture(key);t.custom_minimum_size=size;t.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;t.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;t.mouse_filter=Control.MOUSE_FILTER_IGNORE
	return t

func _place(node:Control,parent:Control,at:Vector2,extent:Vector2):
	parent.add_child(node);node.position=at;node.size=extent

func button(text:String,action:Callable,minimum=Vector2(108,54),tone="paper",icon="",vertical=false) -> Button:
	var font_size=25 if minimum.x>=120 else 22
	var text_width=heading_font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size).x
	var padding=design.layout.compactButtonPadding if minimum.x<100 else design.layout.buttonPadding
	minimum.x=maxf(minimum.x,text_width+padding[0]*2+(40 if icon!="" and not vertical else 0))
	var b=Button.new();b.custom_minimum_size=minimum;b.pressed.connect(action);b.set_meta("ui_label",text);b.tooltip_text=text
	b.set_meta("tone",tone)
	for state in ["normal","hover","pressed","disabled"]:
		var style=skin(tone,state,true);style.content_margin_left=padding[0];style.content_margin_right=padding[0];style.content_margin_top=padding[1];style.content_margin_bottom=padding[1];b.add_theme_stylebox_override(state,style)
	var focus=StyleBoxFlat.new();focus.bg_color=Color.TRANSPARENT;focus.border_color=color("vermilion");focus.set_border_width_all(2);focus.set_corner_radius_all(2)
	b.add_theme_stylebox_override("focus",focus)
	var margin=MarginContainer.new();b.add_child(margin);margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);margin.mouse_filter=Control.MOUSE_FILTER_IGNORE
	for edge in ["left","right"]:margin.add_theme_constant_override("margin_"+edge,padding[0])
	margin.add_theme_constant_override("margin_top",padding[1]);margin.add_theme_constant_override("margin_bottom",padding[1])
	var content:BoxContainer=VBoxContainer.new() if vertical else HBoxContainer.new();content.alignment=BoxContainer.ALIGNMENT_CENTER;content.add_theme_constant_override("separation",6);content.mouse_filter=Control.MOUSE_FILTER_IGNORE;margin.add_child(content)
	if icon!="":
		var extent=Vector2(34,34)
		if vertical:extent=Vector2(46,46) if minimum.y>110 else Vector2(30,30)
		var icon_node=picture(icon+("-light" if tone in ["jade","vermilion","ink"] and icon.begins_with("icon-") else ""),extent)
		content.add_child(icon_node);b.set_meta("icon",icon_node);b.set_meta("icon_key",icon)
	var l=heading(text,font_size);l.add_theme_color_override("font_color",Color(design.surfaces[tone][2]));l.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;l.vertical_alignment=VERTICAL_ALIGNMENT_CENTER;content.add_child(l)
	l.visible=text!="";b.set_meta("caption",l)
	return b

func _caption(b:Button,text:String):
	if is_instance_valid(b):b.get_meta("caption").text=text

func _selected(b:Button,active:bool):
	var selected=bool(b.get_meta("active",false))
	if active==selected:return
	b.set_meta("active",active)
	var tone="jade" if active else str(b.get_meta("tone"))
	for state in ["normal","hover","pressed"]:
		var style=b.get_theme_stylebox(state).duplicate();style.texture=texture("skin-plain-"+tone+"-"+state);b.add_theme_stylebox_override(state,style)
	b.get_meta("caption").add_theme_color_override("font_color",Color(design.surfaces[tone][2]))
	if b.has_meta("icon"):
		var key=str(b.get_meta("icon_key"))
		b.get_meta("icon").texture=texture(key+("-light" if tone in ["jade","vermilion","ink"] and key.begins_with("icon-") else ""))

func _icon_button(text:String,action:Callable,icon:String) -> Button:
	var b=button("",action,Vector2(64,64),"paper",icon);b.set_meta("ui_label",text);b.tooltip_text=text;return b

func _panel(parent:Control,at:Vector2,extent:Vector2,tone="panel") -> PanelContainer:
	var p=PanelContainer.new();p.add_theme_stylebox_override("panel",skin(tone));_place(p,parent,at,extent);return p

func _bar(role:String) -> ProgressBar:
	var b=ProgressBar.new();b.custom_minimum_size=Vector2(144,10);b.show_percentage=false;b.max_value=1;b.value=1;b.mouse_filter=Control.MOUSE_FILTER_IGNORE
	var base=StyleBoxFlat.new();base.bg_color=color("rule");base.set_corner_radius_all(1)
	var fill=StyleBoxFlat.new();fill.bg_color=color(role);fill.set_corner_radius_all(1)
	b.add_theme_stylebox_override("background",base);b.add_theme_stylebox_override("fill",fill);return b

func _setup_hud():
	clan_button=button("宗族",func():toggle_popover("clan"),Vector2(80,94),"vermilion","icon-crest",true)
	_place(clan_button,play_hud,Vector2(22,22),Vector2(80,94))
	var lord_panel=_panel(play_hud,Vector2(108,22),Vector2(294,108));var info=VBoxContainer.new();info.add_theme_constant_override("separation",8);lord_panel.add_child(info)
	for enemy in [false,true]:
		var row=HBoxContainer.new();row.alignment=BoxContainer.ALIGNMENT_CENTER;row.add_theme_constant_override("separation",12);info.add_child(row)
		var l=heading("黑鲨酋" if enemy else "王叔果",23);l.custom_minimum_size=Vector2(80,28);row.add_child(l)
		var bar=_bar("vermilion" if enemy else "jade");bar.size_flags_vertical=Control.SIZE_SHRINK_CENTER;row.add_child(bar)
		if enemy:hp_enemy=bar
		else:hp_player=bar
	lord_label=label("",18);lord_label.hide();play_hud.add_child(lord_label)
	var phase=_panel(play_hud,Vector2(418,22),Vector2(276,68));phase_label=heading("",22);phase_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;phase.add_child(phase_label)
	speed_button=button("1×",func():game.session.speed=2.0 if game.session.speed==1 else 1.0;refresh(),Vector2(64,68))
	speed_button.set_meta("ui_label","速度");speed_button.tooltip_text="切换 1× / 2× 速度";_place(speed_button,play_hud,Vector2(702,22),Vector2(64,68))
	_place(_icon_button("暂停",game._pause,"icon-pause"),play_hud,Vector2(774,22),Vector2(64,68))
	var ledger=_panel(play_hud,Vector2(850,22),Vector2(728,108));var resources=HBoxContainer.new();resources.add_theme_constant_override("separation",10);ledger.add_child(resources)
	for key in ["wood","stone","food","gold","peasants"]:
		var column=VBoxContainer.new();column.custom_minimum_size=Vector2(128,0);column.size_flags_horizontal=Control.SIZE_EXPAND_FILL;column.add_theme_constant_override("separation",2);resources.add_child(column)
		var caption=heading({"wood":"木材","stone":"条石","food":"粮食","gold":"银两","peasants":"空闲乡民"}[key],20);caption.add_theme_color_override("font_color",color("muted"));column.add_child(caption)
		var row=HBoxContainer.new();row.add_theme_constant_override("separation",8);column.add_child(row)
		row.add_child(picture("icon-"+key,Vector2(28,28)))
		var value=label("",24);value.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(value);resource_labels[key]=value
	var stores=_panel(play_hud,Vector2(1010,138),Vector2(568,48),"linen");var store_skin=stores.get_theme_stylebox("panel").duplicate();store_skin.texture=texture("skin-plain-linen-normal");store_skin.content_margin_top=10;store_skin.content_margin_bottom=10;stores.add_theme_stylebox_override("panel",store_skin)
	stock_label=label("",19);stock_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;stores.add_child(stock_label)
	var map_panel=_panel(play_hud,Vector2(1312,196),Vector2(266,288));var map_box=VBoxContainer.new();map_box.add_theme_constant_override("separation",4);map_panel.add_child(map_box)
	var caption=heading("永昌形胜  ·  北 ↑",22);caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;map_box.add_child(caption)
	minimap=MiniMap.new();minimap.setup(game.session);minimap.navigate.connect(func(target):game.camera_target=target);map_box.add_child(minimap)
	minimap.order.connect(func(target,queued):game._order(target,queued))
	map_box.add_child(button("全图 M",game._overview,Vector2(218,48),"paper","icon-map"))
	message_label=heading("",24);message_label.add_theme_color_override("font_color",color("onDark"));message_label.add_theme_color_override("font_shadow_color",color("ink"));message_label.add_theme_constant_override("shadow_offset_y",1);message_label.add_theme_constant_override("shadow_outline_size",2);message_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;message_label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	_place(message_label,play_hud,Vector2(410,138),Vector2(580,84))
	var objective_panel=_panel(play_hud,Vector2(22,146),Vector2(380,176),"linen")
	objective_label=label("",20);objective_label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;objective_panel.add_child(objective_label)
	guide_button=button("定位下一步",game.locate_next,Vector2(180,52),"paper","icon-map");_place(guide_button,play_hud,Vector2(22,330),Vector2(180,52))
	training_button=button("准备迎敌",game.finish_training,Vector2(180,52),"vermilion");_place(training_button,play_hud,Vector2(22,390),Vector2(180,52));training_button.hide()
	_place(button("资源定位",func():toggle_popover("map"),Vector2(266,52),"paper","icon-map"),play_hud,Vector2(1312,492),Vector2(266,52))
	build_button=button("营造 B",func():game._toggle_tray("build"),Vector2(132,138),"paper","icon-construct",true);_caption(build_button,"营造")
	_place(build_button,play_hud,Vector2(22,840),Vector2(132,138))
	army_button=button("募勇",func():game._toggle_tray("army"),Vector2(132,138),"paper","icon-recruit",true)
	_place(army_button,play_hud,Vector2(164,840),Vector2(132,138))
	command_button=button("军令",func():toggle_popover("command"),Vector2(154,106),"jade","icon-recruit")
	_place(command_button,play_hud,Vector2(1424,872),Vector2(154,106))
	contextual_actions=VBoxContainer.new();contextual_actions.add_theme_constant_override("separation",8);_place(contextual_actions,play_hud,Vector2(1424,730),Vector2(154,128))
	repair_button=button("修城",func():game.session.repair();refresh(),Vector2(154,56),"paper","icon-repair");contextual_actions.add_child(repair_button)
	fire_button=button("引火",func():game.session.ignite();refresh(),Vector2(154,56),"vermilion","icon-fire");contextual_actions.add_child(fire_button)
	build_controls=HBoxContainer.new();build_controls.add_theme_constant_override("separation",8);_place(build_controls,play_hud,Vector2(334,904),Vector2(800,64))
	var selected_paper=PanelContainer.new();selected_paper.add_theme_stylebox_override("panel",skin("paper"));build_controls.add_child(selected_paper)
	selected_label=heading("",23);selected_label.custom_minimum_size=Vector2(310,34);selected_paper.add_child(selected_label)
	build_controls.add_child(button("转向 R",func():game.build_rotation=(game.build_rotation+1)%4;game._refresh_ghost();refresh(),Vector2(130,64),"paper","icon-map"))
	build_controls.add_child(button("取消",func():game._cancel_placement();tray.hide();refresh(),Vector2(110,64),"paper"));build_controls.hide()
	confirm_build_button=button("确认营造",func():game.touch_controls.confirm_build(),Vector2(140,64),"jade");build_controls.add_child(confirm_build_button)
	selection_controls=HBoxContainer.new();selection_controls.add_theme_constant_override("separation",8);_place(selection_controls,play_hud,Vector2(334,904),Vector2(940,64));_selection_buttons(selection_controls,Vector2(140,64))
	touch_select_button=button("框选部队",func():game.controls.toggle_box(),Vector2(160,60));_place(touch_select_button,play_hud,Vector2(334,908),Vector2(160,60))

func _selection_buttons(row:HBoxContainer,minimum:Vector2):
	for item in [["stop","停止",game.controls.stop_selection],["attack","攻击移动",game.controls.arm_attack],["queue","追加路点",func():game.controls.queue_mode=not game.controls.queue_mode;refresh()],["box","框选部队",game.controls.toggle_box],["clear","取消选择",func():game.controls.set_selection([])]]:
		var b=button(item[1],item[2],minimum);b.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(b);selection_actions[item[0]]=b

func _camera_buttons(parent:Control):
	var row=HBoxContainer.new();row.add_theme_constant_override("separation",4);parent.add_child(row)
	for item in [["镜头左转",func():game.camera_yaw-=PI/4],["镜头右转",func():game.camera_yaw+=PI/4],["放大",func():game.zoom=maxf(7.5,game.zoom/1.25)],["缩小",func():game.zoom=minf(game.session.map.camera.maxZoom,game.zoom*1.25)]]:
		var b=button(str(item[0]).trim_prefix("镜头"),item[1],Vector2(72,48));b.set_meta("ui_label",item[0]);b.tooltip_text=item[0];b.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(b)

func control_help() -> String:
	if game.controls.touch_mode:return "触屏：单指拖镜头；点部队后点地面调遣。\n框选：点框选部队，再拖出选框。\n选中后可点停止、攻击移动、追加路点、取消选择。\n营造：点地面预览，再点确认营造；城墙拖线后确认。\n双指平移/缩放；地图面板可旋转镜头。"
	return "鼠标：左键选择/拖框，右键短按下令、拖动平移。\n中键拖动、方向键和边缘移动镜头；滚轮缩放，Q/E旋转。\nShift增选/追加路点；S停止；A后左键攻击移动。\nCtrl+数字编队；空格定位选择；H回宗祠。\n营造：左键放置、城墙拖线、R转向；右键或Esc取消。"

func _setup_tray():
	tray=_panel(play_hud,Vector2(324,658),Vector2(984,320));var box=VBoxContainer.new();box.add_theme_constant_override("separation",8);tray.add_child(box)
	tray_tabs=HBoxContainer.new();tray_tabs.add_theme_constant_override("separation",8);box.add_child(tray_tabs)
	card_scroll=ScrollContainer.new();card_scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_AUTO;card_scroll.vertical_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;card_scroll.size_flags_vertical=Control.SIZE_EXPAND_FILL;box.add_child(card_scroll)
	tray_box=HBoxContainer.new();tray_box.add_theme_constant_override("separation",8);card_scroll.add_child(tray_box);tray.hide()

func _clear(node:Node):
	for child in node.get_children():node.remove_child(child);child.queue_free()

func _setup_popover():
	popover_layer=Control.new();play_hud.add_child(popover_layer);popover_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	popover_layer.mouse_filter=Control.MOUSE_FILTER_IGNORE
	popover=_panel(popover_layer,Vector2(20,142),Vector2(388,428))
	popover_box=VBoxContainer.new();popover_box.add_theme_constant_override("separation",10);popover.add_child(popover_box);popover.hide()

func toggle_popover(kind:String):
	if screen!="play":return
	if popover_kind==kind:close_popover();return
	tray.hide();game.selected_build="";game._clear_ghost()
	popover_kind=kind;_clear(popover_box);clan_actions.clear();stance_actions.clear()
	popover.position=Vector2(20,142) if kind in ["clan","site"] else Vector2(1190,220) if kind=="map" else Vector2(1262,500)
	popover.size=Vector2(388,428) if kind=="clan" else Vector2(388,660) if kind=="map" else Vector2(430,470) if kind=="site" else Vector2(316,360)
	var title=heading({"clan":"宗族议事","command":"全军号令","map":"资源与渡口","site":"工坊状态"}.get(kind,kind),30);popover_box.add_child(title);_rule(popover_box)
	if kind=="clan":
		var hint=label("乡约与族人援助",18);popover_box.add_child(hint)
		clan_actions.garrison=button("驻祠",func():game._garrison_lord();refresh(),Vector2(340,58),"paper","icon-garrison");popover_box.add_child(clan_actions.garrison)
		clan_actions.policy=button("乡约",func():game._policy();refresh(),Vector2(340,58),"paper","icon-book");popover_box.add_child(clan_actions.policy)
		clan_actions.donate=button("义捐",func():game.session.donate();refresh(),Vector2(340,58),"jade","icon-donate");popover_box.add_child(clan_actions.donate)
		clan_actions.guard=button("驰援",func():game.session.guard();refresh(),Vector2(340,58),"jade","icon-guard");popover_box.add_child(clan_actions.guard)
	elif kind=="command":
		var hint=label("号令会影响全部我军",17);popover_box.add_child(hint)
		for item in [["defend","固守","icon-defend"],["sally","出击","icon-guard"],["attack","进攻","icon-play"]]:
			var stance=item[0]
			var action=button(item[1],func():game.session.set_stance(stance);close_popover();refresh(),Vector2(268,60),"paper" if stance!="attack" else "vermilion",item[2]);popover_box.add_child(action);stance_actions[stance]=action
	elif kind=="map":
		_camera_buttons(popover_box)
		for site in game.SiteInspector.locations(game.session):popover_box.add_child(button(site.name,func():game.locate(site.key),Vector2(340,52)))
		popover_box.add_child(button("收起",close_popover,Vector2(340,52)))
	elif kind=="site":
		game.populate_site_panel(popover_box,self);popover_box.add_child(button("收起",close_popover,Vector2(340,52)))
	popover.show();refresh()

func close_popover() -> bool:
	if popover_kind=="":return false
	popover_kind="";popover.hide();return true

func dismiss_outside(point:Vector2) -> bool:
	if popover_kind!="" and not popover.get_global_rect().has_point(point):return close_popover()
	return false

func blocks_world(point:Vector2) -> bool:
	return _blocks_world(root,point)

func _blocks_world(node:Node,point:Vector2) -> bool:
	for child in node.get_children():
		if child is Control and child.is_visible_in_tree():
			var control:Control=child
			if control.clip_contents and not control.get_global_rect().has_point(point):continue
			if control.mouse_filter!=Control.MOUSE_FILTER_IGNORE and control.get_global_rect().has_point(point):
				if control is Button or control is ScrollContainer or control is PanelContainer or control is ColorRect or control.get_script()==MiniMap:return true
			if _blocks_world(control,point):return true
	return false

func toggle_tray(kind:String):
	if game.session.state!="play":return
	close_popover()
	if tray.visible and game.selected_tab==kind:tray.hide();return
	game._cancel_placement()
	game.selected_tab=kind;_render_cards();tray.show()
	refresh()

func _page_cards(direction:int):
	card_scroll.scroll_horizontal+=direction*maxi(152,floori(card_scroll.size.x/152)*152)
	_refresh_pages()

func _refresh_pages():
	if not is_instance_valid(previous_cards):return
	var bar=card_scroll.get_h_scroll_bar();var end=maxf(0,bar.max_value-bar.page)
	previous_cards.visible=end>0;next_cards.visible=end>0
	previous_cards.disabled=bar.value<=0;next_cards.disabled=bar.value>=end

func _render_cards():
	_clear(tray_tabs);_clear(tray_box);card_buttons.clear()
	card_scroll.scroll_horizontal=0
	var is_build=game.selected_tab=="build"
	if is_build:
		for item in [["castle","永昌城防"],["econ","水乡民生"],["military","神机军工"]]:
			var cat=item[0]
			tray_tabs.add_child(button(item[1],func():category=cat;_render_cards(),Vector2(160,56),"jade" if category==cat else "paper"))
	else:
		var l=heading("演武募勇 · 备齐粮械，守望乡里",24);l.size_flags_horizontal=Control.SIZE_EXPAND_FILL;tray_tabs.add_child(l)
	var spacer=Control.new();spacer.size_flags_horizontal=Control.SIZE_EXPAND_FILL;tray_tabs.add_child(spacer)
	previous_cards=button("上一页",func():_page_cards(-1),Vector2(112,56),"paper");tray_tabs.add_child(previous_cards)
	next_cards=button("下一页",func():_page_cards(1),Vector2(112,56),"paper");tray_tabs.add_child(next_cards)
	tray_tabs.add_child(button("收起",func():tray.hide(),Vector2(92,56),"paper"))
	var specs=game.session.source.buildings if is_build else game.session.source.units
	for key in specs:
		var spec=specs[key]
		if is_build and spec.cat!=category:continue
		var costs=[]
		for resource in spec.cost:costs.append("%s%d"%[game._res_name(resource),spec.cost[resource]])
		var cost=" ".join(costs)
		var b=Button.new();b.custom_minimum_size=Vector2(144,200);b.set_meta("ui_label",spec.name+"\n"+cost)
		b.tooltip_text=spec.name+"\n"+(game.PlayerGuidance.JOBS if is_build else game.PlayerGuidance.ROLES).get(key,"")
		for state in ["normal","hover","pressed"]:b.add_theme_stylebox_override(state,skin("card",state,true))
		b.pressed.connect(func():game._select_card("build" if is_build else "army",key));tray_box.add_child(b);card_buttons[key]=b
		var v=VBoxContainer.new();v.mouse_filter=Control.MOUSE_FILTER_IGNORE;b.add_child(v);v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);v.offset_left=design.layout.cardPadding[0];v.offset_right=-design.layout.cardPadding[0];v.offset_top=design.layout.cardPadding[1];v.offset_bottom=-design.layout.cardPadding[1];v.add_theme_constant_override("separation",2)
		v.add_child(picture(("buildings-" if is_build else "units-")+key,Vector2(112,76 if is_build else 62)))
		var short_names={"wall":"花岗城墙","gate":"谯楼城门","waterGate":"跨渠水门","tower":"空心敌台","ballista":"佛郎机炮台","pitch":"猛火油壕","demolish":"拆建","farm":"水车稻田","woodcutter":"竹木作坊","quarry":"山麓采石","ironMine":"天工铁冶","pitchRig":"熬油坊","fletcher":"神机军器局","blacksmith":"甲仗锻局","hovel":"粉墙民居","spearman":"狼筅乡勇","archer":"神机鸟铳手","swordsman":"藤牌刀兵","knight":"宗族铁骑","ram":"包铁冲车","trebuchet":"虎蹲炮车"}
		short_names.merge({"stockpile":"物资堆放场","oxPost":"水牛绑牛桩"})
		var name_label=heading(short_names[key],22);name_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;v.add_child(name_label)
		var price_lines=" ".join(costs.slice(0,2))+("\n"+" ".join(costs.slice(2)) if costs.size()>2 else "")
		var price=label(price_lines if cost!="" else "回收物资",18,true);price.custom_minimum_size=Vector2(0,48);price.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;v.add_child(price)
		b.set_meta("price_label",price)
		if not is_build:
			var people=label("%d乡民→%d人"%[spec.popCost,spec.count],18);people.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;v.add_child(people)
	refresh()
	_refresh_pages.call_deferred()

func _setup_modal():
	modal=Control.new();root.add_child(modal);modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);modal.mouse_filter=Control.MOUSE_FILTER_STOP
	shade=ColorRect.new();shade.color=Color(.09,.17,.14,.48);modal.add_child(shade);shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);shade.mouse_filter=Control.MOUSE_FILTER_IGNORE
	backdrop=picture("title-guohua",Vector2.ZERO);modal.add_child(backdrop);backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);backdrop.stretch_mode=TextureRect.STRETCH_SCALE
	title_content=Control.new();modal.add_child(title_content);title_content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);title_content.mouse_filter=Control.MOUSE_FILTER_IGNORE
	panel=_panel(modal,Vector2(450,150),Vector2(700,700));panel_box=VBoxContainer.new();panel_box.add_theme_constant_override("separation",12);panel.add_child(panel_box)

func show_screen(kind:String):
	close_popover()
	screen=kind;modal.visible=kind!="play";play_hud.visible=kind=="play"
	if kind=="play":return
	_clear(panel_box);_clear(title_content);title_content.hide();backdrop.visible=kind=="title";panel.visible=kind!="title";shade.visible=kind!="title"
	if kind=="title":
		title_content.show();_build_title();return
	panel.position=Vector2(92,70) if kind=="menu" else Vector2(450,70);panel.size=Vector2(700,860)
	var folio=heading("永 昌 海 防 图 志",20);folio.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;folio.add_theme_color_override("font_color",color("vermilion"));panel_box.add_child(folio)
	var title={"menu":"英桥王氏都堂","pause":"中军议事暂歇","victory":"海波平定 · 永昌千秋","defeat":"宗祠失守 · 戊午泣血"}.get(kind,"守望1558")
	var title_label=heading(title,40);title_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;panel_box.add_child(title_label)
	var hint=heading("守一方乡土，传三世家风",22);hint.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;hint.add_theme_color_override("font_color",color("muted"));panel_box.add_child(hint)
	_rule(panel_box)
	if kind in ["victory","defeat"]:
		var summary=label(game.PlayerGuidance.result(game.session),24);summary.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;summary.custom_minimum_size=Vector2(620,180);panel_box.add_child(summary)
		panel_box.add_child(button("再守一局",func():game.restart_game(true),Vector2(620,68),"vermilion","icon-play"))
		panel_box.add_child(button("返回标题",func():game.restart_game(),Vector2(620,60),"paper"))
		return
	if kind=="confirm_return":
		title_label.text="返回标题？"
		var warning=label("保存当前进度，下次可继续。\n"+game.save_notice,26);warning.custom_minimum_size=Vector2(620,150);warning.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;panel_box.add_child(warning)
		panel_box.add_child(button("取消返回",func():show_screen("pause"),Vector2(620,68),"jade"))
		panel_box.add_child(button("确认返回",game.save_and_return,Vector2(620,60),"paper"))
		return
	if kind=="confirm_new":
		title_label.text="开始新的一局？"
		panel_box.add_child(label("开始后将替换上次保存的进度。",24))
		panel_box.add_child(button("取消新局",func():show_screen("menu"),Vector2(620,60),"jade"))
		panel_box.add_child(button("确认新局",game.confirm_new_game,Vector2(620,60)))
		return
	if kind in ["menu","pause"]:
		if kind=="menu":
			var resume=button("继续上次守望",game.load_game,Vector2(620,60),"jade","icon-play");resume.disabled=not game.has_saved_game();panel_box.add_child(resume)
		panel_box.add_child(button("开始守望" if kind=="menu" else "继续守望",func():game.begin_game(false) if kind=="menu" else game.resume_game(),Vector2(620,60),"vermilion" if kind=="menu" else "jade","icon-play"))
		if kind=="menu":panel_box.add_child(button("新手准备",func():game.begin_game(true),Vector2(620,56),"paper"))
		else:panel_box.add_child(button("保存进度",game.save_game,Vector2(620,56),"paper"))
	panel_box.add_child(button("家风碑",func():game._info("家风碑"),Vector2(620,60),"paper","icon-book"))
	panel_box.add_child(button("操作与史料",func():game._info("操作与史料"),Vector2(620,60),"paper","icon-controls"))
	sound_button=button("声音 开 / 关",func():game.sound.enabled=not game.sound.enabled;refresh(),Vector2(620,60),"paper","icon-sound");panel_box.add_child(sound_button);_caption(sound_button,"声音：开启" if game.sound.enabled else "声音：关闭")
	panel_box.add_child(button("开源与授权",func():game._info("开源与授权"),Vector2(620,60),"paper","icon-book"))
	_rule(panel_box)
	var row=HBoxContainer.new();row.alignment=BoxContainer.ALIGNMENT_CENTER;panel_box.add_child(row)
	row.add_child(button("返回标题",func():show_screen("confirm_return") if kind=="pause" else game.restart_game(),Vector2(250,56),"linen"))
	save_status=label(game.save_notice,20);save_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;panel_box.add_child(save_status)

func _build_title():
	var eyebrow=heading("守 望 · 1558",34);eyebrow.add_theme_color_override("font_color",color("vermilion"));_place(eyebrow,title_content,Vector2(204,150),Vector2(350,60))
	var right=heading("永\n昌",110);right.add_theme_constant_override("line_spacing",-16);right.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;_place(right,title_content,Vector2(360,236),Vector2(132,280))
	var left=heading("风\n云",110);left.add_theme_constant_override("line_spacing",-16);left.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;_place(left,title_content,Vector2(208,302),Vector2(132,280))
	var seal=PanelContainer.new();seal.add_theme_stylebox_override("panel",skin("vermilion"));_place(seal,title_content,Vector2(510,286),Vector2(82,124))
	var date=heading("戊\n午",30);date.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;date.add_theme_color_override("font_color",color("onDark"));seal.add_child(date)
	var caption=heading("嘉靖三十七年 · 温州永昌",23);_place(caption,title_content,Vector2(206,608),Vector2(450,36))
	var tagline=heading("合族筑堡   堡内耕战   荡平海患",23);tagline.add_theme_color_override("font_color",color("muted"));_place(tagline,title_content,Vector2(206,653),Vector2(500,40))
	_place(button("步入永昌卫城",func():show_screen("menu");game.sound.play("scan"),Vector2(400,76),"vermilion","icon-play"),title_content,Vector2(204,744),Vector2(400,76))
	var footer=heading("从四户村落起步，筑城、耕战、守望家园",21);footer.add_theme_color_override("font_color",color("muted"));_place(footer,title_content,Vector2(204,846),Vector2(500,40))
	var note=heading("山海之间  ·  乡土长存",24);note.add_theme_color_override("font_color",color("jade"));_place(note,title_content,Vector2(922,40),Vector2(510,48))

func show_info(title:String,text:String):
	close_popover()
	var previous=screen;var previous_state=game.session.state;game.session.state="pause";screen="info"
	info_back=func():game.session.state=previous_state;show_screen(previous)
	play_hud.hide();modal.show();backdrop.hide();title_content.hide();shade.show();panel.show();_clear(panel_box)
	panel.position=Vector2(404,92);panel.size=Vector2(792,816)
	var title_label=heading(title,40);title_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;panel_box.add_child(title_label);_rule(panel_box)
	var paper=PanelContainer.new();paper.add_theme_stylebox_override("panel",skin("card"));paper.size_flags_vertical=Control.SIZE_EXPAND_FILL;panel_box.add_child(paper)
	var body=label(text,22,true);body.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;body.custom_minimum_size=Vector2(680,440);paper.add_child(body)
	if title=="开源与授权":panel_box.add_child(button("获取完整对应源码",game._open_source,Vector2(680,60),"jade","icon-book"))
	panel_box.add_child(button("返回",close_info,Vector2(680,60),"paper","icon-map"))

func close_info():
	if info_back.is_valid():info_back.call()

func dispose():
	info_back=Callable()

func refresh():
	var s=game.session;var r=s.res
	for key in resource_labels:
		resource_labels[key].text=str(int(r[key]))
	var guidance=game.PlayerGuidance.objective(s)
	objective_label.text="下一步 · "+guidance.title+"\n"+guidance.detail
	if game.selected_build!="":objective_label.text=s.source.buildings[game.selected_build].name+("\n点地面预览 · 确认后营造\n双指移动镜头\n" if game.controls.touch_mode else "\n左键放置 · R转向 · 右键取消\n")+("城墙、油壕可拖线营造\n" if game.session.source.buildings[game.selected_build].mode=="line" else "")+game.placement_hint
	elif game.controls.has_selection():objective_label.text="已选 %d 支小队%s\n"%[game.selected_squads.size(),"与宗长" if game.lord_selected else ""]+("点地面调遣 · 单指拖镜头\n下方可停止、攻击和追加路点" if game.controls.touch_mode else "左键选择/框选 · Shift增选\n右键短按调遣、拖动平移\nS停止 · A攻击移动 · Ctrl+数字编队")
	hp_player.value=maxf(0,s.player_lord.hp/s.player_lord.max_hp);hp_enemy.value=maxf(0,s.enemy_lord.hp/s.enemy_lord.max_hp)
	phase_label.text="第%d幕 · %s %02d:%02d"%[s.wave,"倭袭" if s.night else "备战",int(s.phase_timer)/60,int(s.phase_timer)%60]
	if s.training:phase_label.text="新手准备 · 敌袭未开始"
	if is_instance_valid(training_button):training_button.visible=s.training
	if is_instance_valid(save_status):save_status.text=game.save_notice
	stock_label.text="铁 %d   油 %d   铳 %d   甲 %d   丁口 %d/%d"%[r.iron,r.oil,r.bows,r.armor,s.population(),r.maxPop]
	build_controls.visible=game.selected_build!="" and screen=="play"
	if is_instance_valid(confirm_build_button):
		confirm_build_button.visible=game.controls.touch_mode
		confirm_build_button.disabled=not game.touch_controls.build_ready or not game.placement_valid
	if is_instance_valid(selection_controls):
		selection_controls.visible=game.controls.touch_mode and game.controls.has_selection() and game.selected_build=="" and not tray.visible and popover_kind=="" and screen=="play"
		_selected(selection_actions.attack,game.controls.attack_armed);_selected(selection_actions.queue,game.controls.queue_mode);_selected(selection_actions.box,game.controls.touch_box_select)
	if is_instance_valid(touch_select_button):
		touch_select_button.visible=game.controls.touch_mode and not game.controls.has_selection() and game.selected_build=="" and not tray.visible and popover_kind=="" and screen=="play"
		_selected(touch_select_button,game.controls.touch_box_select)
	selected_label.text=(game.short_name(game.selected_build) if game.compact else s.source.buildings[game.selected_build].name)+" · %d°"%(game.build_rotation*90) if game.selected_build!="" else ""
	minimap.camera_target=game.camera_target;minimap.queue_redraw()
	_caption(speed_button,"%d×"%int(s.speed))
	_caption(command_button,"军令\n%s"%{"defend":"固守","sally":"迎击","attack":"进攻"}[s.stance])
	if is_instance_valid(sound_button):_caption(sound_button,"声音：开启" if game.sound.enabled else "声音：关闭")
	repair_button.visible=s.structures.any(func(b):return not b.dead and b.team=="player" and b.type in game.GameSession.FORTS and b.hp<b.max_hp)
	fire_button.visible=s.structures.any(func(b):return not b.dead and b.team=="player" and b.type=="pitch" and not s.fires.has(b.id))
	_selected(clan_button,popover_kind=="clan");_selected(command_button,popover_kind=="command")
	_selected(build_button,tray.visible and game.selected_tab=="build")
	_selected(army_button,tray.visible and game.selected_tab=="army")
	if popover_kind=="clan":
		_caption(clan_actions.policy,{"balanced":"乡约 · 耕读传家","harsh":"乡约 · 毁家纾难","generous":"乡约 · 义仓赈乡"}[s.policy])
		_caption(clan_actions.garrison,"出祠迎敌" if s.player_lord.garrison else "驻祠督战")
		clan_actions.donate.visible=s.donation_count<2;clan_actions.guard.visible=not s.guard_used
		_caption(clan_actions.donate,"义捐 · 余%d次"%(2-s.donation_count))
	if popover_kind=="command":
		for stance in stance_actions:_selected(stance_actions[stance],s.stance==stance)
	for key in card_buttons:
		var spec=s.source.buildings[key] if game.selected_tab=="build" else s.source.units[key]
		var is_build=game.selected_tab=="build"
		var cost=spec.cost if is_build else s.recruitment_cost(key)
		var error=s.missing_resources(cost) if is_build else s.recruitment_error(key)
		card_buttons[key].modulate=Color.WHITE if error=="" else Color(.72,.72,.67)
		if not is_build:
			var parts=[]
			for resource in cost:parts.append("%s%d"%[game._res_name(resource),cost[resource]])
			card_buttons[key].get_meta("price_label").text=" ".join(parts.slice(0,2))+("\n"+" ".join(parts.slice(2)) if parts.size()>2 else "")
			card_buttons[key].set_meta("ui_label",spec.name+"\n"+" ".join(parts))
		card_buttons[key].tooltip_text=spec.name+"\n"+(game.PlayerGuidance.JOBS if is_build else game.PlayerGuidance.ROLES).get(key,"")+("\n"+error if error!="" else "")
	_refresh_pages()
