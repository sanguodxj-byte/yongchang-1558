extends RefCounted
const JOB_NAMES={"woodcutter":"竹木作坊","farm":"水车稻田","quarry":"采石场","ironMine":"铁冶","pitchRig":"熬油坊","fletcher":"军器局","blacksmith":"锻局","oxPost":"绑牛桩"}
const STATES={"home":"前往工坊","source":"前往采集点","gather":"采集","raw":"领取原料","return":"运回加工","process":"加工","deliver":"运往仓库","wait_delivery":"等待可达仓库","wait":"等待原料或通路","idle":"等待装货","pickup":"前往石场装货"}

static func locations(s) -> Array:
	var sites=[{"key":"village","name":"宗祠与村落","cell":s.map.camera.home}]
	var trees=s.trees.filter(func(t):return t.wood>0 and t.gx<60)
	if not trees.is_empty():
		trees.sort_custom(func(a,b):return Vector2(a.gx-45,a.gz-38).length_squared()<Vector2(b.gx-45,b.gz-38).length_squared())
		sites.append({"key":"wood","name":"树林 · 木材","cell":[trees[0].gx,trees[0].gz]})
	for key in ["stone","iron","pitch"]:
		sites.append({"key":key,"name":{"stone":"山麓石矿","iron":"南麓铁矿","pitch":"河湾油泉"}[key],"cell":s.map.deposits[key][0]})
	sites.append({"key":"port","name":"出征渡口","cell":s.map.ports.mainland.rally})
	sites.append({"key":"island","name":"黑鲨岛寨","cell":[s.enemy_keep.gx,s.enemy_keep.gz]})
	return sites

static func describe(s,b:Dictionary) -> Dictionary:
	var title=b.get("label",JOB_NAMES.get(b.type,b.type));var lines=["耐久 %d/%d"%[maxf(0,b.hp),b.max_hp]]
	if b.dead:return {"title":title,"text":"建筑已毁，需要重新营造。","target":0}
	var assigned=s.workers.filter(func(w):return not w.dead and w.home.id==b.id)
	if b.type in s.PRODUCERS and assigned.is_empty():
		lines.append("尚无工人：每座工坊需要1名空闲乡民。")
		if s.res.food<2:lines.append("缺粮无法吸引乡民；先恢复稻田入库。")
		elif s.population()>=s.res.maxPop:lines.append("丁口已满；建民居增加8人容量。")
	var target=0
	for w in assigned:
		var status=STATES.get(w.state,w.state)
		if w.state=="raw" and s.pos(w).distance_to(w.target)<1:
			var ingredient="wood" if w.job=="fletcher" else "iron";var amount=2 if w.job=="fletcher" else 1
			if s.res[ingredient]<amount:status="等待%s：每批需要%d，库存%d"%[s.RESOURCE_NAMES[ingredient],amount,s.res[ingredient]]
		if w.state in ["home","source","raw","return","deliver","pickup"] and not w.get("moving",false) and s.pos(w).distance_to(w.target)>1:status+="；若持续不动，请检查通路"
		lines.append(("牛车 · " if w.ox else "民丁 · ")+status)
		if w.carry!="":lines.append("携带 %s × %d"%[s.RESOURCE_NAMES.get(w.carry,{"log":"原木","wheat":"稻谷","ore":"铁矿","bow":"鸟铳"}.get(w.carry,w.carry)),w.amount])
		var depot=s.structure_by_id(w.get("destination",0))
		if not depot.is_empty() and not depot.dead:lines.append("送往："+depot.get("label",depot.type));target=depot.id
		if w.state=="wait_delivery":lines.append("仓库不可达。检查道路；木石铁油可增建堆场，粮食送义仓，军械送演武厅。")
		if w.state=="wait":lines.append("检查采集资源、仓库与工坊之间是否畅通。")
	if b.type=="quarry":lines.append("已配牛车 · 每批9石" if b.get("ox_post",0) else "独立采石 · 每批6石；7格内绑牛桩可增产")
	if b.type=="oxPost":lines.append("已配对采石场" if b.get("quarry",0) else "未配对：7格内需要一座可达、未占用的采石场")
	if b.type=="stockpile":lines.append("接收木、石、铁、油；工人选择可达的最近堆场。")
	if b.type=="granary":lines.append("接收粮食，支持乡民归附。")
	if b.type=="armory":lines.append("接收鸟铳与甲胄，用于募勇。")
	return {"title":title,"text":"\n".join(lines),"target":target}
