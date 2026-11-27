extends RefCounted
# Exactly the same sampled triangles as the rendered terrain, in map coordinates.
var source:Dictionary
var terrain:Dictionary
var width:int
var depth:int
var resolution:int
var stride:int

func _init(data:Dictionary):
	source=data;terrain=data.get("terrain",{});width=int(data.map.width);depth=int(data.map.height)
	resolution=int(terrain.get("resolution",1));stride=int(terrain.get("width",width+1))

func cell_at(p:Vector3) -> Dictionary:
	var x=floori(p.x+width/2.0);var z=floori(p.z+depth/2.0)
	if x<0 or x>=width or z<0 or z>=depth:return {}
	return source.cells[z*width+x]

func height_at(p:Vector3) -> float:
	if terrain.is_empty():return float(cell_at(p).get("h",.4))
	var x=clampf((p.x+width/2.0)*resolution,0,width*resolution-.0001)
	var z=clampf((p.z+depth/2.0)*resolution,0,depth*resolution-.0001)
	var ix=floori(x);var iz=floori(z);var tx=x-ix;var tz=z-iz;var heights=terrain.heights
	var a=float(heights[iz*stride+ix]);var b=float(heights[iz*stride+ix+1])
	var c=float(heights[(iz+1)*stride+ix]);var d=float(heights[(iz+1)*stride+ix+1])
	return a*(1-tx)+b*(tx-tz)+d*tz if tx>=tz else a*(1-tz)+d*tx+c*(tz-tx)

func support(p:Vector3) -> float:
	var cell=cell_at(p)
	return float(cell.h) if cell.get("bridge",false) else height_at(p)

func visible_height(p:Vector3) -> float:
	return maxf(support(p),float(terrain.get("waterLevel",-.22)))

func raycast(origin:Vector3,direction:Vector3,max_distance=400.0) -> Vector3:
	var previous=0.0;var above=true
	for i in int(max_distance*2):
		var distance=i*.5;var point=origin+direction*distance
		if cell_at(point).is_empty():previous=distance;continue
		var current=point.y>visible_height(point)
		if above and not current:
			var low=previous;var high=distance
			for step in 13:
				var mid=(low+high)*.5;var test=origin+direction*mid
				if test.y>visible_height(test):low=mid
				else:high=mid
			return origin+direction*((low+high)*.5)
		above=current;previous=distance
	return Vector3.INF
