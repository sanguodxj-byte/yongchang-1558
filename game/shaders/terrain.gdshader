shader_type spatial;
render_mode cull_disabled;
varying vec3 world_position;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),u.x),u.y);}
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
	float footprint=length(fwidth(world_position.xz));
	float detail=1.0-smoothstep(.07,.35,footprint);
	vec2 p=world_position.xz;
	float grain=noise2(p*5.7),medium=noise2(p*1.37),broad=noise2(p*.35);
	float fine=(grain-.5)*.12*detail;
	float variation=(medium-.5)*.16+(broad-.5)*.11;
	vec3 c=COLOR.rgb*(1.0+fine+variation);
	// Tiny, non-periodic mineral flecks and sparse dry grass patches. The falloff
	// removes subpixel contrast as the camera pulls back, without changing lanes.
	float fleck=smoothstep(.78,.9,grain)*detail*.07;
	c=mix(c,c*vec3(1.16,1.07,.89),fleck);
	ALBEDO=c;ROUGHNESS=.96;METALLIC=0.0;SPECULAR=.15;
}
