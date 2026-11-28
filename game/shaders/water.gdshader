shader_type spatial;
render_mode cull_disabled;
varying vec3 world_pos;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),u.x),u.y);}
float height(vec2 p){return noise2(p*.72+vec2(TIME*.16,-TIME*.11))*.62+noise2(p*1.85-vec2(TIME*.22,TIME*.09))*.38;}
void vertex(){world_pos=(MODEL_MATRIX*vec4(VERTEX,1)).xyz;}
void fragment(){vec2 p=world_pos.xz;float n=height(p),shore=UV.y,marine=UV.x;
	// Depth comes from the actual clipped bed, never unrelated square noise.
	float shallow=clamp(shore/.72,0.0,1.0);
	vec3 deep=mix(vec3(.026,.079,.057),vec3(.017,.073,.090),marine);
	vec3 edge=mix(vec3(.105,.169,.092),vec3(.102,.205,.167),marine);
	vec3 c=mix(deep,edge,shallow);
	// Surface normals carry ripples. Avoid two crossing sine bands in albedo,
	// which turn the distant ocean into a visible diamond/checker pattern.
	c*=.97+noise2(p*.21+vec2(TIME*.015,-TIME*.01))*.06;
	// Sheltered inland water has no continuous surf/white glowing border.
	float lap=.5+.5*sin(TIME*1.1-shore*7.0+n*3.0);
	c=mix(c,vec3(.24,.29,.24),smoothstep(.55,.72,shore)*lap*.12*marine);
	float dx=height(p+vec2(.08,0))-height(p-vec2(.08,0));
	float dz=height(p+vec2(0,.08))-height(p-vec2(0,.08));
	NORMAL=normalize((VIEW_MATRIX*vec4(-dx*.32,1.0,-dz*.32,0.0)).xyz);
	ALBEDO=c;ROUGHNESS=.48;METALLIC=0.0;SPECULAR=.25;
}
