shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;
void fragment(){
	vec2 p=UV*2.0-1.0;
	float fade=pow(max(0.0,1.0-dot(p,p)),2.5);
	ALBEDO=vec3(.065,.075,.055);ALPHA=fade*COLOR.a;
}
