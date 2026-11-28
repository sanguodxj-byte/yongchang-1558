extends "res://scripts/mobile_ui.gd"
## Same commands and theme, laid out in display pixels for small viewports.
var extent=Vector2(844,390)
var card_page=0
var status_text:Label
var map_button:Button
var menu_scroll:ScrollContainer
var guide_visible=false

func _init(owner,view_size:Vector2):
	extent=view_size
	super(owner)

func skin(tone:String,state="normal",plain=false) -> StyleBoxTexture:
	var style=super(tone,state,plain)
	style.content_margin_left=10;style.content_margin_right=10;style.content_margin_top=8;style.content_margin_bottom=8
	return style

func button(text:String,action:Callable,minimum=Vector2(108,54),tone="paper",icon="",vertical=false) -> Button:
	var b=Button.new();b.custom_minimum_size=Vector2(minf(minimum.x,extent.x-44),maxf(48,minf(minimum.y,54)));b.pressed.connect(action);b.set_meta("ui_label",text);b.set_meta("tone",tone);b.tooltip_text=text
	for state in ["normal","hover","pressed","disabled"]:b.add_theme_stylebox_override(state,skin(tone,state,true))
	var focus=StyleBoxFlat.new();focus.bg_color=Color.TRANSPARENT;focus.border_color=color("vermilion");focus.set_border_width_all(2);b.add_theme_stylebox_override("focus",focus)
	var caption=label(text,18);caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;caption.vertical_alignment=VERTICAL_ALIGNMENT_CENTER;caption.add_theme_color_override("font_color",Color(design.surfaces[tone][2]));b.add_child(caption);caption.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);b.set_meta("caption",caption)
	return b

func _setup_hud():
	var top=_panel(play_hud,Vector2(8,8),Vector2(extent.x-16,70));var box=VBoxContainer.new();top.add_child(box)
	phase_label=label("",17);box.add_child(phase_label)
	var row=HBoxContainer.new();row.add_theme_constant_override("separation",8);box.add_child(row)
	for key in ["wood","stone","food","gold","peasants"]:
		var l=label("",16);row.add_child(l);resource_labels[key]=l
	top.gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT:toggle_popover("stores"))
	hp_player=_bar("jade");hp_enemy=_bar("vermilion");stock_label=label("",16);lord_label=label("",16)
	for node in [hp_player,hp_enemy,stock_label,lord_label]:play_hud.add_child(node);node.hide()
	objective_label=label("",18);objective_label.hide();play_hud.add_child(objective_label)
	message_label=label("",17);message_label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;message_label.add_theme_color_override("font_color",color("onDark"));message_label.add_theme_constant_override("shadow_outline_size",3);message_label.add_theme_color_override("font_shadow_color",color("ink"));_place(message_label,play_hud,Vector2(12,86),Vector2(extent.x-24,46))
	var bottom=HBoxContainer.new();bottom.add_theme_constant_override("separation",6);_place(bottom,play_hud,Vector2(8,extent.y-56),Vector2(extent.x-16,48))
	for item in [["营造 B","营造",func():game._toggle_tray("build")],["募勇","募勇",func():game._toggle_tray("army")],["地图","地图",func():toggle_popover("map")],["军令","军令",func():toggle_popover("command")],["暂停","暂停",game._pause]]:
		var b=button(item[1],item[2],Vector2(56,48));b.set_meta("ui_label",item[0]);b.size_flags_horizontal=Control.SIZE_EXPAND_FILL;bottom.add_child(b)
		if item[0]=="营造 B":build_button=b
		elif item[0]=="募勇":army_button=b
		elif item[0]=="军令":command_button=b
		elif item[0]=="地图":map_button=b
	clan_button=button("宗族",func():toggle_popover("clan"),Vector2(72,48));_place(clan_button,play_hud,Vector2(8,extent.y-112),Vector2(72,48))
	guide_button=button("指引",func():toggle_popover("guide"),Vector2(72,48));_place(guide_button,play_hud,Vector2(86,extent.y-112),Vector2(72,48))
	speed_button=button("1×",func():game.session.speed=2.0 if game.session.speed==1 else 1.0;refresh(),Vector2(56,48));speed_button.set_meta("ui_label","速度");_place(speed_button,play_hud,Vector2(extent.x-64,extent.y-112),Vector2(56,48))
	contextual_actions=VBoxContainer.new();play_hud.add_child(contextual_actions);contextual_actions.hide()
	repair_button=button("修城",func():game.session.repair());fire_button=button("引火",func():game.session.ignite())
	contextual_actions.add_child(repair_button);contextual_actions.add_child(fire_button)
	build_controls=HBoxContainer.new();build_controls.add_theme_constant_override("separation",6);_place(build_controls,play_hud,Vector2(8,extent.y-112),Vector2(extent.x-16,48))
	var selected_paper=PanelContainer.new();selected_paper.add_theme_stylebox_override("panel",skin("paper"));selected_paper.size_flags_horizontal=Control.SIZE_EXPAND_FILL;build_controls.add_child(selected_paper)
	selected_label=label("",16);selected_label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;selected_paper.add_child(selected_label)
	build_controls.add_child(button("转向 R",func():game.build_rotation=(game.build_rotation+1)%4;game._refresh_ghost(),Vector2(76,48)))
	build_controls.add_child(button("取消",func():game._cancel_placement();refresh(),Vector2(64,48)))
	confirm_build_button=button("确认营造",func():game.touch_controls.confirm_build(),Vector2(84,48),"jade");build_controls.add_child(confirm_build_button)
	selection_controls=HBoxContainer.new();selection_controls.add_theme_constant_override("separation",4);_place(selection_controls,play_hud,Vector2(8,extent.y-112),Vector2(extent.x-16,48));_selection_buttons(selection_controls,Vector2(58,48))
	for pair in [["stop","停止"],["attack","攻击"],["queue","路点"],["box","框选"],["clear","取消"]]:_caption(selection_actions[pair[0]],pair[1])
	touch_select_button=button("框选部队",func():game.controls.toggle_box(),Vector2(72,48));_caption(touch_select_button,"框选");_place(touch_select_button,play_hud,Vector2(164,extent.y-112),Vector2(72,48))
	minimap=MiniMap.new();minimap.setup(game.session);minimap.hide();play_hud.add_child(minimap)
	minimap.navigate.connect(func(target):game.camera_target=target;close_popover())
	minimap.order.connect(func(target,queued):game._order(target,queued);close_popover())

func _setup_tray():
	tray=_panel(play_hud,Vector2(8,extent.y-312),Vector2(extent.x-16,248));var box=VBoxContainer.new();box.add_theme_constant_override("separation",4);tray.add_child(box)
	tray_tabs=HBoxContainer.new();tray_tabs.add_theme_constant_override("separation",4);box.add_child(tray_tabs)
	tray_box=HBoxContainer.new();tray_box.add_theme_constant_override("separation",6);box.add_child(tray_box)
	card_scroll=ScrollContainer.new();play_hud.add_child(card_scroll);card_scroll.hide()
	tray.hide()

func _setup_popover():
	popover_layer=Control.new();play_hud.add_child(popover_layer);popover_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);popover_layer.mouse_filter=Control.MOUSE_FILTER_IGNORE
	popover=_panel(popover_layer,Vector2(8,82),Vector2(extent.x-16,extent.y-146));var scroll=ScrollContainer.new();scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;popover.add_child(scroll)
	popover_box=VBoxContainer.new();popover_box.size_flags_horizontal=Control.SIZE_EXPAND_FILL;popover_box.add_theme_constant_override("separation",6);scroll.add_child(popover_box);popover.hide()

func toggle_popover(kind:String):
	if screen!="play":return
	if popover_kind==kind:close_popover();return
	tray.hide();game._cancel_placement();popover_kind=kind;_clear(popover_box);clan_actions.clear();stance_actions.clear();popover.show()
	var header=HBoxContainer.new();popover_box.add_child(header);var title=label({"guide":"守望指引","map":"地图","resources":"资源定位","clan":"宗族议事","command":"全军号令","site":"工坊状态","stores":"物资与丁口"}.get(kind,kind),22);title.size_flags_horizontal=Control.SIZE_EXPAND_FILL;header.add_child(title)
	if kind=="map":header.add_child(button("资源定位",func():toggle_popover("resources"),Vector2(96,48)))
	if kind=="resources":header.add_child(button("返回地图",func():toggle_popover("map"),Vector2(96,48)))
	header.add_child(button("收起",close_popover,Vector2(64,48)))
	if kind=="map":
		var map_copy=MiniMap.new();map_widget=map_copy;map_copy.setup(game.session);map_copy.custom_minimum_size=Vector2(0,100);map_copy.navigate.connect(func(target):game.camera_target=target;close_popover());popover_box.add_child(map_copy)
		map_copy.order.connect(func(target,queued):game._order(target,queued);close_popover())
		_camera_buttons(popover_box)
	elif kind=="resources":
		var grid=GridContainer.new();grid.columns=2 if extent.x<600 else 4;popover_box.add_child(grid)
		for site in game.SiteInspector.locations(game.session):grid.add_child(button(site.name,func():game.locate(site.key),Vector2(150,48)))
		grid.add_child(button("全图 M",func():game._overview();close_popover(),Vector2(150,48)))
	elif kind=="guide":
		var guide=game.PlayerGuidance.objective(game.session);var text=label(guide.title+"\n"+guide.detail,19);text.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;popover_box.add_child(text)
		popover_box.add_child(button("定位下一步",game.locate_next,Vector2(220,48),"jade"))
		if game.session.training:popover_box.add_child(button("准备迎敌",game.finish_training,Vector2(220,48),"vermilion"))
		popover_box.add_child(button("操作与史料",func():game._info("操作与史料"),Vector2(220,48)))
	elif kind=="clan":
		clan_actions.garrison=button("驻祠",func():game._garrison_lord();refresh());popover_box.add_child(clan_actions.garrison)
		clan_actions.policy=button("乡约",func():game._policy();refresh());popover_box.add_child(clan_actions.policy)
		clan_actions.donate=button("义捐",func():game.session.donate();refresh());popover_box.add_child(clan_actions.donate)
		clan_actions.guard=button("驰援",func():game.session.guard();refresh());popover_box.add_child(clan_actions.guard)
	elif kind=="command":
		for item in [["defend","固守"],["sally","出击"],["attack","进攻"]]:
			var action=button(item[1],func():game.session.set_stance(item[0]);close_popover());popover_box.add_child(action);stance_actions[item[0]]=action
		popover_box.add_child(button("修城",func():game.session.repair();close_popover()))
		popover_box.add_child(button("引火",func():game.session.ignite();close_popover()))
	elif kind=="site":game.populate_site_panel(popover_box,self)
	elif kind=="stores":
		var r=game.session.res;var details=[]
		for key in ["wood","stone","food","gold","iron","oil","bows","armor"]:details.append("%s  %d"%[game.session.RESOURCE_NAMES[key],r[key]])
		details.append("空闲乡民 %d · 总丁口 %d/%d"%[r.peasants,game.session.population(),r.maxPop]);popover_box.add_child(label("\n".join(details),20))
	refresh()

func close_popover() -> bool:
	var closed=super();return closed

func _render_cards():
	_clear(tray_tabs);_clear(tray_box);card_buttons.clear()
	var is_build=game.selected_tab=="build";var specs=game.session.source.buildings if is_build else game.session.source.units;var keys=[]
	for key in specs:
		if not is_build or specs[key].cat==category:keys.append(key)
	if is_build:
		for item in [["castle","城防"],["econ","民生"],["military","军工"]]:
			var b=button(item[1],func():category=item[0];card_page=0;_render_cards(),Vector2(48,48),"jade" if category==item[0] else "paper");b.set_meta("ui_label",{"castle":"永昌城防","econ":"水乡民生","military":"神机军工"}[item[0]]);tray_tabs.add_child(b)
	var count=maxi(2,floori((extent.x-40)/150));var pages=ceili(float(keys.size())/count);card_page=clampi(card_page,0,pages-1)
	previous_cards=button("‹",func():card_page-=1;_render_cards(),Vector2(48,48));previous_cards.set_meta("ui_label","上一页");previous_cards.disabled=card_page==0;tray_tabs.add_child(previous_cards)
	next_cards=button("›",func():card_page+=1;_render_cards(),Vector2(48,48));next_cards.set_meta("ui_label","下一页");next_cards.disabled=card_page>=pages-1;tray_tabs.add_child(next_cards)
	var close=button("收起",func():tray.hide(),Vector2(58,48));close.size_flags_horizontal=Control.SIZE_EXPAND_FILL;tray_tabs.add_child(close)
	for key in keys.slice(card_page*count,(card_page+1)*count):
		var spec=specs[key];var b=button("",func():game._select_card("build" if is_build else "army",key),Vector2(140,48));b.custom_minimum_size=Vector2(140,162);b.size_flags_horizontal=Control.SIZE_EXPAND_FILL;tray_box.add_child(b);b.get_meta("caption").hide();b.set_meta("ui_label",spec.name);card_buttons[key]=b
		var stack=VBoxContainer.new();b.add_child(stack);stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);stack.offset_left=6;stack.offset_right=-6;stack.offset_top=5;stack.offset_bottom=-5;stack.mouse_filter=Control.MOUSE_FILTER_IGNORE
		stack.add_child(picture(("buildings-" if is_build else "units-")+key,Vector2(80,44)))
		var name=label(game.short_name(key),17);name.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;stack.add_child(name)
		var price=label("",16);price.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;stack.add_child(price);b.set_meta("price_label",price)
		if not is_build:stack.add_child(label("%d乡民→%d人"%[spec.popCost,spec.count],16))
	refresh()

func _refresh_pages():pass

func _setup_modal():
	modal=Control.new();root.add_child(modal);modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);modal.mouse_filter=Control.MOUSE_FILTER_STOP
	shade=ColorRect.new();shade.color=Color(.09,.17,.14,.68);modal.add_child(shade);shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);shade.mouse_filter=Control.MOUSE_FILTER_IGNORE
	backdrop=picture("title-guohua",Vector2.ZERO);modal.add_child(backdrop);backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);backdrop.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_COVERED
	panel=_panel(modal,Vector2(12,12),Vector2(extent.x-24,extent.y-24));menu_scroll=ScrollContainer.new();menu_scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;panel.add_child(menu_scroll)
	panel_box=VBoxContainer.new();panel_box.size_flags_horizontal=Control.SIZE_EXPAND_FILL;panel_box.add_theme_constant_override("separation",8);menu_scroll.add_child(panel_box)
	title_content=Control.new();modal.add_child(title_content);title_content.hide()

func show_screen(kind:String):
	close_popover();screen=kind;modal.visible=kind!="play";play_hud.visible=kind=="play"
	if kind=="play":refresh();return
	_clear(panel_box);menu_scroll.scroll_vertical=0;backdrop.visible=kind=="title";panel.visible=true
	panel.position=Vector2(12,12);panel.size=extent-Vector2(24,24)
	var heading_text={"title":"守望1558 · 永昌风云","menu":"从村落开始守望","pause":"守望暂歇","victory":"海波平定","defeat":"宗长阵亡","confirm_return":"保存并返回标题？","confirm_new":"开始新的一局？"}.get(kind,"永昌守望")
	panel_box.add_child(heading(heading_text,26))
	if kind=="title":
		panel.position=Vector2(12,extent.y-168);panel.size=Vector2(minf(440,extent.x-24),156)
		panel_box.add_child(label("筑城 · 耕战 · 守望乡土",18))
		panel_box.add_child(button("步入永昌卫城",func():show_screen("menu"),Vector2(250,48),"vermilion"));return
	if kind in ["menu","pause"]:
		if kind=="menu":
			var resume=button("继续上次守望",game.load_game,Vector2(240,48),"jade");resume.disabled=not game.has_saved_game();panel_box.add_child(resume)
		panel_box.add_child(button("开始守望" if kind=="menu" else "继续守望",func():game.begin_game(false) if kind=="menu" else game.resume_game(),Vector2(240,48),"vermilion"))
		if kind=="menu":panel_box.add_child(button("新手准备",func():game.begin_game(true),Vector2(240,48)))
		if kind=="pause":panel_box.add_child(button("保存进度",game.save_game,Vector2(240,48)))
		panel_box.add_child(button("操作与史料",func():game._info("操作与史料"),Vector2(240,48)))
		panel_box.add_child(button("家风碑",func():game._info("家风碑"),Vector2(240,48)))
		sound_button=button("声音 开 / 关",func():game.sound.enabled=not game.sound.enabled;refresh(),Vector2(240,48));panel_box.add_child(sound_button)
		panel_box.add_child(button("开源与授权",func():game._info("开源与授权"),Vector2(240,48)))
		panel_box.add_child(button("返回标题",func():show_screen("confirm_return") if kind=="pause" else game.restart_game(),Vector2(240,48)))
	elif kind=="confirm_return":
		var text=label("保存当前进度，下次可继续。",18);panel_box.add_child(text)
		panel_box.add_child(button("取消返回",func():show_screen("pause")))
		panel_box.add_child(button("确认返回",game.save_and_return))
	elif kind=="confirm_new":
		panel_box.add_child(label("开始后将替换原存档。",18));panel_box.add_child(button("取消新局",func():show_screen("menu")))
		panel_box.add_child(button("确认新局",game.confirm_new_game))
	else:
		var result=label(game.PlayerGuidance.result(game.session),19);result.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;panel_box.add_child(result)
		panel_box.add_child(button("再守一局",func():game.restart_game(true),Vector2(240,48),"vermilion"));panel_box.add_child(button("返回标题",func():game.restart_game()))
	var notice=label(game.save_notice,16);notice.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;panel_box.add_child(notice);status_text=notice

func show_info(title:String,text:String):
	var previous=screen;var previous_state=game.session.state;game.session.state="pause";screen="info"
	info_back=func():game.session.state=previous_state;show_screen(previous)
	play_hud.hide();modal.show();backdrop.hide();panel.show();_clear(panel_box);menu_scroll.scroll_vertical=0
	panel_box.add_child(heading(title,24));panel_box.add_child(button("返回",close_info,Vector2(120,48)))
	var body=label(text,18);body.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;panel_box.add_child(body)
	if title=="开源与授权":panel_box.add_child(button("获取完整对应源码",game._open_source))

func refresh():
	if not is_instance_valid(phase_label):return
	super()
	var s=game.session
	for key in resource_labels:resource_labels[key].text={"wood":"木","stone":"石","food":"粮","gold":"银","peasants":"闲"}[key]+str(int(s.res[key]))
	phase_label.text=("准备中" if s.training else "第%d幕 %s %02d:%02d"%[s.wave,"倭袭" if s.night else "备战",int(s.phase_timer)/60,int(s.phase_timer)%60])+" · 宗长%d%% · 点此查物资"%int(hp_player.value*100)
	_caption(command_button,"军令")
	clan_button.visible=game.selected_build=="" and not tray.visible and not selection_controls.visible;guide_button.visible=clan_button.visible;speed_button.visible=clan_button.visible
	for key in card_buttons:
		if game.selected_tab!="build":continue
		var parts=[]
		for k in s.source.buildings[key].cost:parts.append(game._res_name(k)+str(int(s.source.buildings[key].cost[k])))
		card_buttons[key].get_meta("price_label").text=" ".join(parts.slice(0,2))+("\n"+" ".join(parts.slice(2)) if parts.size()>2 else "")
	if is_instance_valid(status_text):status_text.text=game.save_notice
