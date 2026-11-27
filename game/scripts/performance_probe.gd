extends RefCounted
## Opt-in observation only. No simulation, renderer or quality decisions depend on it.
const COLUMNS=["frame","wall_us","interval_ms","simulation_ms","camera_ms","visuals_ms","hud_ms","script_ms","draw_calls","primitives","objects","static_bytes","nodes","draw_frame"]
var enabled=false
var rows=[]
var pending=[]
var started=0
var mark_time=0
var sections=[]
var last_frame=0
var bridge:JavaScriptObject
var reader:JavaScriptObject
var max_rows=18000

func _init():
	enabled="--profile" in OS.get_cmdline_user_args()
	if OS.has_feature("web"):
		enabled=JavaScriptBridge.eval("new URLSearchParams(location.search).has('profile')")
		if enabled:
			JavaScriptBridge.eval("window.__yongchangPerf={columns:"+JSON.stringify(COLUMNS)+",rows:[]};")
			bridge=JavaScriptBridge.get_interface("__yongchangPerf");reader=JavaScriptBridge.create_callback(_read);bridge.read=reader
	if enabled:RenderingServer.frame_post_draw.connect(_drawn)

func begin():
	started=Time.get_ticks_usec();mark_time=started;sections.clear()

func mark():
	var now=Time.get_ticks_usec();sections.append((now-mark_time)/1000.0);mark_time=now

func finish():
	pending=[Engine.get_process_frames(),started,0.0,sections[0],sections[1],sections[2],sections[3],(Time.get_ticks_usec()-started)/1000.0]

func _drawn():
	if pending.is_empty():return
	var now=Time.get_ticks_usec()
	pending[1]=now;pending[2]=(now-last_frame)/1000.0 if last_frame else 0.0;last_frame=now
	pending.append_array([Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),Performance.get_monitor(Performance.MEMORY_STATIC),Performance.get_monitor(Performance.OBJECT_NODE_COUNT),Engine.get_frames_drawn()])
	if rows.size()<max_rows:rows.append(pending)
	pending=[]

func reset():
	rows.clear();pending=[];last_frame=0

func _read(_arguments:Array):
	JavaScriptBridge.eval("window.__yongchangPerf.rows="+JSON.stringify(rows)+";")

func dispose():
	if enabled and RenderingServer.frame_post_draw.is_connected(_drawn):RenderingServer.frame_post_draw.disconnect(_drawn)
	reader=null;bridge=null
