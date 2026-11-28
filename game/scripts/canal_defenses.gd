extends RefCounted
## Construction rules for short canal crossings. The terrain itself is never filled.
const BUILDING={"id":"waterGate","name":"跨渠石拱水门","cat":"castle","mode":"single",
	"cost":{"stone":16,"wood":4,"iron":2},"hp":900,"height":1.76,
	"desc":"点内渠水面，自动接到两岸；R转向。石拱下留水道，铁栅封住岸边通路。"}
const MAX_REACH=4
const MAX_SPAN=7
const MAX_DEPTH=.9

static func shallow_bank(s,p:Vector2i) -> bool:
	var c=s.cell(p)
	return not c.is_empty() and not c.get("bridge",false) and c.ground!="water" and c.get("obstacle","")=="bank" and float(c.get("relief",INF))<=.9 and float(c.get("slope",INF))<=1.1 and float(c.get("maxHeight",INF))<=float(s.source.terrain.waterLevel)+1.35

static func layout(s,p:Vector2i,rotation:int) -> Dictionary:
	var axis=Vector2i.RIGHT if rotation%2==0 else Vector2i.DOWN
	var result={"cells":[p],"error":"点内渠水面建水门；R转向横跨河道"}
	var center=s.cell(p)
	if center.is_empty() or center.ground!="water":return result
	var level=float(s.source.terrain.waterLevel)
	if float(center.get("minHeight",-INF))<level-MAX_DEPTH:
		result.error="水门仅可跨越浅内渠，不能延伸入深水";return result
	var ends=[]
	for direction in [-1,1]:
		var found=false
		for distance in range(1,MAX_REACH+1):
			var at=p+axis*direction*distance;var c=s.cell(at)
			if c.is_empty() or c.get("bridge",false):
				result.error="水门需要两岸支撑，且须避开木桥";return result
			if c.get("buildable",false):ends.append(at);found=true;break
			if float(c.get("minHeight",-INF))<level-MAX_DEPTH or float(c.get("maxHeight",INF))>level+1.35 or float(c.get("relief",INF))>.9:
				result.error="此处岸坡或水深不适合水门基础";return result
			if c.ground!="water" and c.get("obstacle","") not in ["bank","slope"]:
				result.error="水门两端需要稳固干地";return result
		if not found:
			result.error="两岸过远；R转向横跨较窄内渠";return result
	var span=absi(ends[1].x-ends[0].x)+absi(ends[1].y-ends[0].y)+1
	if span>MAX_SPAN:
		result.error="水门连同两岸基础最多跨7格";return result
	result.cells=[]
	for i in span:result.cells.append(ends[0]+axis*i)
	result.error=""
	return result
