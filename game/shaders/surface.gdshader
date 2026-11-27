shader_type spatial;
render_mode cull_disabled;
uniform vec4 tint : source_color = vec4(1.0);
varying vec3 world_pos;
varying vec3 local_pos;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),u.x),u.y);}
void vertex(){local_pos=VERTEX;world_pos=(MODEL_MATRIX*vec4(VERTEX,1)).xyz;}
void fragment(){
	vec3 c=COLOR.rgb*tint.rgb;
	float detail=1.0-smoothstep(.06,.22,length(fwidth(world_pos)));
	int mat=int(UV.x+.5);
	if(mat==1){float row=floor(local_pos.y*5.5);float x=(local_pos.x+local_pos.z+mod(row,2.0)*.24)*2.6;
		float mortar=smoothstep(.43,.49,max(abs(fract(x)-.5),abs(fract(local_pos.y*5.5)-.5)));
		c*=1.0-mortar*.23*detail;
	}else if(mat==4){c*=1.0+(noise2(vec2(local_pos.y*14.0+local_pos.x*3.5,(local_pos.x+local_pos.z)*22.0))-.5)*.14*detail;
	}else if(mat==5){c*=1.0-(sin(local_pos.y*18.0+length(local_pos.xz)*14.0)*.5+.5)*.08*detail;
	}else if(mat==11){c*=.94+noise2(local_pos.xz*3.1+local_pos.y*.7)*.10;
	}else{c*=.97+noise2(world_pos.xz*.58)*.06;}
	ALBEDO=c;ROUGHNESS=mat==8?.44:mat==5?.70:mat==11?.94:.84;METALLIC=mat==8?.55:.02;
}
