shader_type spatial;
render_mode cull_disabled;
varying vec3 world_pos;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),u.x),u.y);}
float height(vec2 p){return noise2(p*.72+vec2(TIME*.16,-TIME*.11))*.62+noise2(p*1.85-vec2(TIME*.22,TIME*.09))*.38;}
void vertex(){world_pos=(MODEL_MATRIX*vec4(VERTEX,1)).xyz;}
void fragment(){vec2 p=world_pos.xz;float n=height(p),shore=UV.y;
	float shallow=clamp(shore*.85+.16+(1.0-smoothstep(.22,.8,noise2(p*.18)))*.22,0.0,1.0);
	vec3 c=mix(vec3(.017,.076,.093),vec3(.136,.309,.254),shallow);
	float phase=n*3.6+TIME*.06,fw=fwidth(phase);
	float ripple=(1.0-smoothstep(.018,.048+fw,abs(fract(phase)-.5)))*(1.0-smoothstep(.16,.55,fw));
	float coverage=mix(.16+smoothstep(.28,.7,noise2(p*.23+vec2(TIME*.025,0)))*.65,1.0,shore);
	c+=vec3(.76,.8,.75)*ripple*coverage*.1;
	float lap=.5+.5*sin(TIME*1.3-shore*9.0+n*4.0);
	c=mix(c,vec3(.6,.68,.61),smoothstep(.4,.9,shore)*(.55+lap*.45)*.42);
	ALBEDO=c;ROUGHNESS=.38;METALLIC=0.0;
}
