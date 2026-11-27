extends RefCounted
const Archive=preload("res://scripts/session_archive.gd")
const KEY="yongchang1558.save.v1"
const PATH="user://campaign-v1.json"
const MAX_BYTES=4000000
var error=""
var cached={}
var recovered=false

func _read(backup=false) -> String:
	if OS.has_feature("web"):
		var value=JavaScriptBridge.eval("(()=>{try{return localStorage.getItem("+JSON.stringify(KEY+(".backup" if backup else ""))+")||''}catch(e){return ''}})()")
		return str(value) if value!=null else ""
	var path=PATH+(".backup" if backup else "")
	return FileAccess.get_file_as_string(path) if FileAccess.file_exists(path) else ""

func decode(raw:String,world_hash:String) -> Dictionary:
	if raw.is_empty():return {}
	if raw.length()>MAX_BYTES:error="存档过大，无法读取";return {}
	var parser=JSON.new()
	if parser.parse(raw)!=OK or not parser.data is Dictionary:error="存档损坏，未改动当前游戏";return {}
	var envelope:Dictionary=parser.data
	if envelope.get("schema")!=1:error="存档版本不兼容";return {}
	if envelope.get("world")!=world_hash:error="此存档属于其他地图版本，当前局仍可继续";return {}
	if not envelope.get("payload") is String:error="存档内容损坏";return {}
	var bytes=Marshalls.base64_to_raw(envelope.payload)
	if bytes.is_empty() or bytes.hex_encode().sha256_text()!=envelope.get("checksum",""):error="存档校验失败，未改动当前游戏";return {}
	var payload=bytes_to_var(bytes)
	if not payload is Dictionary or not payload.get("session") is Dictionary:error="存档内容损坏";return {}
	error=Archive.validate(payload.session)
	if error!="":return {}
	payload.saved_at=envelope.get("saved_at",0)
	return payload

func load_slot(world_hash:String) -> Dictionary:
	error="";recovered=false
	var raw=_read();cached=decode(raw,world_hash)
	if cached.is_empty() and not raw.is_empty():
		var problem=error;cached=decode(_read(true),world_hash);recovered=not cached.is_empty()
		error="已恢复上一份有效存档" if recovered else problem
	return cached

func save(s,world_hash:String,view:Dictionary) -> bool:
	if s.state not in ["play","pause"]:return false
	var payload={"session":Archive.capture(s),"view":view};var bytes=var_to_bytes(payload)
	var raw=JSON.stringify({"schema":1,"world":world_hash,"saved_at":Time.get_unix_time_from_system(),"payload":Marshalls.raw_to_base64(bytes),"checksum":bytes.hex_encode().sha256_text()})
	if raw.length()>MAX_BYTES:error="存档空间不足，原存档仍保留";return false
	var previous=_read();var valid_previous=not decode(previous,world_hash).is_empty();error=""
	if OS.has_feature("web"):
		var script="(()=>{try{const key="+JSON.stringify(KEY)+";"+("localStorage.setItem(key+'.backup',localStorage.getItem(key));" if valid_previous else "")+"localStorage.setItem(key,"+JSON.stringify(raw)+");return ''}catch(e){return '浏览器未能保存：请允许本地存储或释放空间'}})()"
		var result=JavaScriptBridge.eval(script)
		if result!=null and str(result)!="":error=str(result);return false
	else:
		var file=FileAccess.open(PATH+".tmp",FileAccess.WRITE)
		if file==null:error="无法写入存档，原存档仍保留";return false
		file.store_string(raw);file.flush();var status=file.get_error();file.close()
		if status!=OK:error="存档写入失败，原存档仍保留";return false
		if valid_previous and DirAccess.copy_absolute(PATH,PATH+".backup")!=OK:error="无法备份存档，原存档仍保留";return false
		if DirAccess.rename_absolute(PATH+".tmp",PATH)!=OK:error="无法完成保存，原存档仍保留";return false
	cached=payload;cached.saved_at=Time.get_unix_time_from_system();return true
