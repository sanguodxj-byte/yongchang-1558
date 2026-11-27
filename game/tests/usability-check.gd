extends SceneTree
const Session=preload("res://scripts/session.gd")
const Guidance=preload("res://scripts/player_guidance.gd")
var checks=[]
var output=""
var data

func check(label:String,ok:bool,detail:Variant=null):
	checks.append({"name":label,"passed":ok,"detail":detail});print("USABILITY ",label," ",ok)

func key(game,code:int):
	var event=InputEventKey.new();event.keycode=code;event.pressed=true;game._unhandled_input(event)

func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):output=arg.trim_prefix("--report=")
	call_deferred("run")

func run():
	root.size=Vector2i(1280,800)
	data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"))
	var s=Session.new(data);s.res.peasants=2;s.res.maxPop=4
	var before=s.res.duplicate();var squad=s.recruit_squad("spearman")
	check("recruit at exact final population cap",squad.size()>0 and s.population()==4 and s.res.peasants==0 and s.res.gold==before.gold-18)
	s=Session.new(data);s.res.peasants=2;s.res.maxPop=3;before=s.res.duplicate()
	check("over-cap recruitment preserves resources",s.recruit_squad("spearman").is_empty() and s.res==before and "丁口容量差1" in s.recruitment_error("spearman"))
	s=Session.new(data);s.res.peasants=0;before=s.res.duplicate()
	check("missing peasants explained",s.recruit_squad("spearman").is_empty() and s.res==before and "空闲乡民差2" in s.recruitment_error("spearman"))
	s.res.food=0;check("starved recruitment gives a recovery action","先建稻田" in s.recruitment_error("spearman"))
	s=Session.new(data);s.martial_bonus=true;s.res.gold=36;s.res.armor=2
	var cost=s.recruitment_cost("swordsman");squad=s.recruit_squad("swordsman")
	check("discounted price is actual charged price",not squad.is_empty() and cost.gold==36 and s.res.gold==0 and s.res.armor==0)
	s=Session.new(data);s.res.wood=3;s.res.gold=10;before=s.res.duplicate()
	check("shortage lists exact resources",s.recruit_squad("spearman").is_empty() and s.res==before and s.recruitment_error("spearman")=="木材差1、银两差8")
	var camp=Vector2i(s.player_keep.cells[0][0],s.player_keep.cells[0][1])
	check("initial building demolition preview explains refusal",s.placement_error("demolish",camp)=="开局建筑不可拆除")
	var errors=[];s.changed.connect(func(kind,payload):
		if kind=="message":errors.append(payload))
	before=s.res.duplicate();s.build("farm",Vector2i(-1,-1))
	check("invalid ground placement gives feedback",s.res==before and errors[-1]=="此处不能营造")
	check("opening guidance describes affordable action",Guidance.objective(s).detail.contains("伐木") and data.initial_resources.wood>=data.buildings.woodcutter.cost.wood)
	s.stance="attack";check("offensive guidance explains auto transport","30秒" in Guidance.objective(s).detail)
	s.stats.player_landed=1;check("landing guidance explains two defences","双门" in Guidance.objective(s).detail)
	s.enemy_keep.dead=true;check("keep destruction is not mislabeled as victory",Guidance.objective(s).title=="击败倭酋")
	var game=load("res://main.tscn").instantiate();root.add_child(game);await process_frame
	game.session.state="play";game.ui.show_screen("play");game._toggle_tray("build");key(game,KEY_ESCAPE)
	check("Escape closes tray without pausing",game.session.state=="play" and not game.tray.visible)
	game._toggle_tray("build");game._pause();key(game,KEY_ESCAPE)
	check("Escape resumes before touching covered cards",game.session.state=="play" and game.ui.screen=="play" and game.tray.visible)
	game.tray.hide()
	game._select_card("build","farm");game._toggle_tray("army")
	check("army and building placement are exclusive",game.selected_build=="" and game.tray.visible and game.selected_tab=="army" and not game.ui.build_controls.visible)
	game.session.martial_bonus=true;game._update_hud()
	check("army card renders charged discounted price",game.ui.card_buttons.swordsman.get_meta("price_label").text.contains("银36"))
	for screen in ["pause","info","title","victory","defeat","confirm_return"]:
		game.session.state="pause" if screen=="info" or screen=="confirm_return" else screen
		if screen=="info":game._info("操作与史料")
		else:game.ui.show_screen(screen)
		var settings=[game.session.speed,game.session.stance,game.camera_yaw,game.zoom,game.build_rotation]
		for code in [KEY_SPACE,KEY_2,KEY_Q,KEY_E,KEY_M,KEY_R,KEY_B,KEY_T]:key(game,code)
		check("no combat hotkeys on "+screen,settings==[game.session.speed,game.session.stance,game.camera_yaw,game.zoom,game.build_rotation])
	game.session.state="play";game.ui.show_screen("play");game._pause();game.ui.show_screen("confirm_return");key(game,KEY_ESCAPE)
	check("return cancellation keeps pause and run",game.session.state=="pause" and game.ui.screen=="pause")
	for ending in ["victory","defeat"]:
		game.session.state=ending;game.ui.show_screen(ending);await process_frame
		var controls={};game._collect_buttons(game.hud,controls)
		check(ending+" has outcome and direct replay",controls.has("再守一局") and controls.has("返回标题") and "用时" in Guidance.result(game.session))
	game.queue_free();await process_frame;await process_frame;game=null
	var passed=checks.all(func(c):return c.passed)
	FileAccess.open(output,FileAccess.WRITE).store_string(JSON.stringify({"passed":passed,"checks":checks},"  "));quit(0 if passed else 1)
