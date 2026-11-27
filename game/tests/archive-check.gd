extends SceneTree
const Session=preload("res://scripts/session.gd")
const Archive=preload("res://scripts/session_archive.gd")
const SaveStore=preload("res://scripts/save_store.gd")
const Inspector=preload("res://scripts/site_inspector.gd")
var checks=[]
var output=""

func check(name:String,ok:bool,detail:Variant=null):
	checks.append({"name":name,"passed":ok,"detail":detail});print("ARCHIVE ",name," ",ok)

func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):output=arg.trim_prefix("--report=")
	call_deferred("run")

func run():
	var source=JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"));var s=Session.new(source);s.state="play";s.training=true
	s.build("farm",Vector2i(47,54));s.build("woodcutter",Vector2i(45,38));s.build("quarry",Vector2i(19,39));s.build("oxPost",Vector2i(22,41));s.build("stockpile",Vector2i(25,42))
	for i in 1500:s.step(1.0/30)
	check("training runs production without triggering raids",s.wave==1 and s.phase_timer==75 and s.stats.deliveries>0)
	var squad=s.recruit_squad("spearman");s.launch(squad.members,"player",false);s.shoot(s.player_lord,s.enemy_lord)
	s._transport(.6);var record=Archive.capture(s);check("archive excludes model and dictionary references",not record.structures[0].has("model") and not record.workers[0].has("home") and not record.squads[0].has("members"))
	var decoded=bytes_to_var(var_to_bytes(record));check("archive validates",Archive.validate(decoded)=="")
	var loaded=Archive.restore(source,decoded);check("restore snapshot exact",loaded!=null and s.snapshot()==loaded.snapshot())
	check("restored entities share live references",is_same(loaded.squads[-1].members[0],loaded.units[-4]) and is_same(loaded.workers[0].home,loaded.structure_index[loaded.workers[0].home.id]) and is_same(loaded.projectiles[0].target,loaded.enemy_lord) and is_same(loaded.trips[-1].units[0],loaded.units[-4]))
	var exact=true
	for i in 1200:
		s.step(1.0/30);loaded.step(1.0/30)
		if s.snapshot()!=loaded.snapshot():exact=false;break
	check("40 seconds after load match continuous run",exact)
	check("in-progress sea trip completes after load",loaded.stats.player_landed==4)
	var store=SaveStore.new();var world_hash="archive-test-world"
	check("native save writes",store.save(loaded,world_hash,{"camera":Vector3.ZERO,"zoom":26.0,"yaw":-.52,"sound":false}),store.error)
	var saved=store.load_slot(world_hash);check("native read retains exact session",not saved.is_empty() and Archive.restore(source,saved.session).snapshot()==loaded.snapshot())
	check("atomic replacement saves again",store.save(loaded,world_hash,{"camera":Vector3.ONE,"zoom":20.0}),store.error)
	FileAccess.open(SaveStore.PATH,FileAccess.WRITE).store_string("{broken")
	saved=store.load_slot(world_hash);check("damaged main slot recovers backup",not saved.is_empty() and store.recovered)
	check("other map refuses old save",store.load_slot("other-map").is_empty() and store.error!="")
	check("unknown version rejected",store.decode('{"schema":99}',world_hash).is_empty())
	var broken=record.duplicate(true);broken.workers[0].home_id=-10;check("dangling worker rejected",Archive.validate(broken)!="")
	var points=Inspector.locations(s);check("all resource and travel destinations exist",points.size()==7 and points.all(func(p):return not s.cell(Vector2i(p.cell[0],p.cell[1])).is_empty()))
	var quarry=s.structures.filter(func(b):return b.type=="quarry")[-1]
	check("inspector shows real ox boost","每批9石" in Inspector.describe(s,quarry).text)
	var reference=s.workers[0];var old_state=reference.state;reference.state="wait_delivery"
	check("inspector explains blocked destination","仓库不可达" in Inspector.describe(s,reference.home).text);reference.state=old_state
	var fresh=Session.new(source);fresh.res.peasants=0;fresh.res.food=0;fresh.build("farm",Vector2i(47,54))
	check("unassigned workshop explains food recovery","先恢复稻田入库" in Inspector.describe(fresh,fresh.structures[-1]).text)
	fresh.res.peasants=2;fresh.res.wood=50;fresh.build("fletcher",Vector2i(46,54));fresh._workers(.1)
	var smith=fresh.workers.filter(func(w):return w.job=="fletcher")[0];smith.state="raw";smith.target=fresh.pos(smith);fresh.res.wood=0
	check("inspector shows actual missing ingredient","等待木材：每批需要2，库存0" in Inspector.describe(fresh,smith.home).text)
	var passed=checks.all(func(c):return c.passed);FileAccess.open(output,FileAccess.WRITE).store_string(JSON.stringify({"passed":passed,"checks":checks},"  "));quit(0 if passed else 1)
