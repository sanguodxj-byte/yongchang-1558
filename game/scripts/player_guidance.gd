extends RefCounted
## Player-facing wording is shared by the HUD, cards, help and results.
const JOBS={
	"woodcutter":"靠近树林；民丁伐木、加工后运回堆场。",
	"farm":"在平整陆地种粮，送入义仓；三块田解锁耕战加成。",
	"quarry":"靠近西侧石矿；独立生产，每批6石。",
	"stockpile":"占地2×2；收木、石、铁、油，靠近工坊可缩短运输。",
	"oxPost":"占地2×2；7格内配对一座石场，每批增至9石，牛车最多载12石，不叠加。",
	"ironMine":"靠近南麓铁矿；采矿、冶炼后入库。",
	"pitchRig":"靠近河湾油泉；加工火油供油壕使用。",
	"fletcher":"消耗木材制造鸟铳；需空闲乡民和可达仓库。",
	"blacksmith":"消耗铁料制造甲胄；需空闲乡民和可达仓库。",
	"hovel":"丁口上限+8，供乡民归附和扩军。",
	"wall":"可拖线筑城；阻挡敌人，可驻鸟铳手。",
	"gate":"两格通道；友军可穿行，R转向。",
	"tower":"容纳4名鸟铳手，利用高度增加射程。",
	"ballista":"自动炮击敌人；保护东、北两路与宗长。",
	"pitch":"可拖线铺设；点击引火燃烧8秒，也会伤及友军。",
	"demolish":"拆除自建建筑，返还一半木石；开局建筑不可拆。"
}
const ROLES={"spearman":"4人近战乡勇，便宜的护卫。","archer":"4人远程鸟铳手，可驻城墙或敌台。","swordsman":"4人藤牌兵，抵挡小型远程火力。","knight":"3人铁骑，移动快，适合迎击。","ram":"1辆冲车，近身破门，需步兵掩护。","trebuchet":"1辆炮车，远程优先压制敌炮、铳楼和寨门。"}

static func objective(s) -> Dictionary:
	if s.enemy_keep.dead:return {"title":"击败倭酋","detail":"敌营已破；继续进攻，击败黑鲨酋才算获胜。"}
	if s.stats.player_landed>0 and s.stance=="attack":return {"title":"突破岛寨","detail":"炮车压制炮台与铳楼，冲车破双门，再攻本营与倭酋。"}
	if s.stance=="attack":return {"title":"集结渡海","detail":"全军自动赴东岸渡口乘船；海程约30秒。留兵守护宗长。"}
	if s.player_lord.hp<s.player_lord.max_hp*.6:return {"title":"保护宗长","detail":"宗族 → 驻祠督战可休养；调兵守住宗祠，宗长阵亡即告负。"}
	var owned={}
	for b in s.structures:
		if not b.dead and b.team=="player":owned[b.type]=owned.get(b.type,0)+1
	for worker in s.workers:
		if not worker.dead and worker.state=="wait_delivery":return {"title":"恢复运输通路","detail":"工人无法入库；清理道路，或在工坊附近建设可达堆放场。"}
	if not owned.has("woodcutter"):return {"title":"先建立木粮供应","detail":"营造 → 水乡民生：先在西侧树林旁建竹木作坊（木6），民丁自动伐木。"}
	if not owned.has("farm"):return {"title":"让粮食持续入库","detail":"营造 → 水乡民生：在村落空地建水车稻田（木10），工人自动耕作运输。"}
	if not owned.has("quarry"):return {"title":"开采筑城石料","detail":"在西侧山麓石矿旁建采石场；可另建绑牛桩增产、堆场缩短运输。"}
	if not owned.has("ballista") and not owned.has("tower"):return {"title":"布置两路城防","detail":"营造 → 永昌城防：保护东、北来路；宗族可驻祠、义捐并请援。"}
	if not owned.has("fletcher") or not owned.has("blacksmith"):return {"title":"备齐远征粮械","detail":"神机军工可造鸟铳与甲胄；缺铁先建铁冶，缺丁口先建民居。"}
	var siege=s.squads.any(func(q):return q.team=="player" and q.role in ["ram","trebuchet"] and q.members.any(func(u):return not u.dead))
	if not siege:return {"title":"组建攻城部队","detail":"募勇：准备冲车、炮车和步兵护卫。点击小队后点地面可集结。"}
	return {"title":"守稳后反攻海岛","detail":"军令 → 进攻会全军集结渡海；攻破敌营并击败倭酋获胜，注意宗长安全。"}

static func result(s) -> String:
	var reason="敌营与倭酋已被击败。" if s.state=="victory" else "宗长王叔果阵亡。下次先保木粮、布置两路城防，并让宗长驻祠休养。"
	return ("新手准备中完成 · " if s.training else "")+reason+"\n\n用时 %02d:%02d · 第%d幕\n建设 %d次 · 运输入库 %d批 · 我军登陆 %d人"%[int(s.time)/60,int(s.time)%60,s.wave,s.stats.built,s.stats.deliveries,s.stats.player_landed]
