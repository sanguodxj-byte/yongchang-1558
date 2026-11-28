extends SceneTree
const Session=preload("res://scripts/session.gd")
var checks=[]

func check(name:String,passed:bool,detail:Variant=null):
	checks.append({"name":name,"passed":passed,"detail":detail})
	print("CHECK ",name," ",passed," ",detail)

func _initialize():
	var data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"))
	var s=Session.new(data)
	var invisible=[];var dry_unmarked=[]
	for z in range(2,94):
		for x in range(2,102):
			var at=Vector2i(x,z);var c=s.cell(at)
			if c.buildable and x>83 and not s.occupied.has(at) and not s.trees.any(func(t):return t.gx==x and t.gz==z) and not data.deposits.any(func(d):return d.gx==x and d.gz==z):
				if s.placement_error("wall",at)!="":invisible.append([x,z])
			if not c.buildable and c.ground!="water" and not c.bridge and c.get("obstacle","")=="":dry_unmarked.append([x,z])
	check("clear coastal land accepts construction",invisible.is_empty(),{"count":invisible.size(),"examples":invisible.slice(0,5)})
	check("every dry terrain restriction names its actual surface",dry_unmarked.is_empty(),{"count":dry_unmarked.size(),"examples":dry_unmarked.slice(0,5)})
	var before=s.res.duplicate()
	check("water rejects placement without charging",not s.build("farm",Vector2i(37,44)) and s.res==before)
	var commands=Session.new(data);commands.state="play";commands.training=true
	var squad=commands.create_squad("spearman","player",commands.world([46,58]),true)
	var first=commands.world([46,63]);var last=commands.world([49,66])
	commands.command_squad(squad,first);commands.command_squad(squad,last,true)
	check("queued move keeps first destination",squad.order==first and squad.queue.size()==1)
	for i in 1200:commands.step(1.0/30)
	check("queued route finishes at second destination",squad.queue.is_empty() and squad.order==Vector3.INF and squad.members.all(func(u):return commands.pos(u).distance_to(last)<3),squad.order)
	commands.set_stance("attack");commands.stop_squad(squad)
	var positions=squad.members.map(func(u):return commands.pos(u))
	for i in 90:commands.step(1.0/30)
	var moved=0.0
	for i in squad.members.size():moved=maxf(moved,positions[i].distance_to(commands.pos(squad.members[i])))
	check("stop overrides global attack and transport",moved<.15 and not squad.has("port") and squad.members.all(func(u):return not u.transit),moved)
	check("stopped defenders do not block other squads assembling",commands._invasion_assembled())
	var fight=Session.new(data);fight.state="play";fight.training=true
	var fighters=fight.create_squad("spearman","player",fight.world([46,58]),true)
	var foe=fight.spawn_unit("spearman","enemy",fight.world([46,61]));var hp=foe.hp
	fight.command_squad(fighters,fight.pos(foe))
	for i in 90:fight.step(1.0/30)
	check("enemy click attacks while global stance is defend",fight.stance=="defend" and foe.hp<hp,{"before":hp,"after":foe.hp})
	var move=Session.new(data);move.state="play";move.training=true
	var movers=move.create_squad("spearman","player",move.world([46,58]),true)
	var nearby=move.spawn_unit("spearman","enemy",move.world([47,59]));hp=nearby.hp
	move.command_squad(movers,move.world([46,65]))
	for i in 20:move.step(1.0/30)
	check("explicit move does not turn into an unwanted chase",nearby.hp==hp and movers.members.all(func(u):return u.swing==0))
	var forest=Session.new(data);forest.state="play";forest.training=true
	var cleared=forest.trees.filter(func(t):return forest.cell(Vector2i(t.gx,t.gz)).buildable and not forest.occupied.has(Vector2i(t.gx,t.gz)))[0]
	cleared.wood=0;cleared.regrow=.01;forest._rebuild_grids()
	var plot=Vector2i(cleared.gx,cleared.gz)
	check("cleared tree cell accepts a building",forest.build("wall",plot))
	forest.step(.1)
	check("cleared trees do not regrow through new buildings",cleared.wood==0 and forest.occupied.has(plot))
	var report={"passed":checks.all(func(c):return c.passed),"checks":checks}
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):FileAccess.open(arg.trim_prefix("--report="),FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	quit(0 if report.passed else 1)
