shader_type spatial;
render_mode cull_disabled;
uniform vec4 tint : source_color = vec4(1.0);
varying vec3 local_pos;
varying vec3 object_normal;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),u.x),u.y);}
void vertex(){local_pos=VERTEX;object_normal=NORMAL;}
void fragment(){
 vec3 c=COLOR.rgb*tint.rgb;vec3 n=abs(object_normal);
 vec2 uv=n.y>.65?local_pos.xz:(n.x>n.z?local_pos.zy:local_pos.xy);
 float detail=1.0-smoothstep(.045,.18,length(fwidth(local_pos)));
 float grain=noise2(uv*37.0),medium=noise2(uv*8.3);float h=0.0;float rough=.88;
 int mat=int(UV.x+.5);
 if(mat==1||mat==6){
  vec2 scale=mat==1?vec2(2.8,5.0):vec2(4.0,3.5);vec2 q=uv*scale;q.x+=mod(floor(q.y),2.0)*.5;
  vec2 edge=min(fract(q),1.0-fract(q));float mortar=1.0-smoothstep(.018,.055,min(edge.x,edge.y));
  float block=hash21(floor(q));c*=.93+block*.13;
  c*=1.0-mortar*.30*detail;c*=1.0+(grain-.5)*.15*detail;
  h=(1.0-mortar)*.012+(medium-.5)*.009;rough=.94;
 }else if(mat==4){
  float grainline=sin(uv.x*84.0+noise2(uv*vec2(3.0,12.0))*5.0);
  c*=1.0+(grainline*.055+(medium-.5)*.13)*detail;h=grainline*.003;rough=.83;
 }else if(mat==5){
  vec2 q=uv*vec2(11.0,9.0);float groove=pow(abs(sin(q.x*3.14159)),8.0);
  float rows=1.0-smoothstep(.02,.10,min(fract(q.y),1.0-fract(q.y)));
  c*=1.0-(groove*.13+rows*.18)*detail;h=(1.0-groove)*.007-rows*.009;rough=.76;
 }else if(mat==10){
  c*=.96+(medium-.5)*.09*detail;h=(grain-.5)*.004;rough=.94;
 }else if(mat==11){
  float weave=(sin(uv.x*150.0)*sin(uv.y*150.0))*.025;
  c*=1.0+weave*detail+(medium-.5)*.06;rough=.97;
 }else if(mat==8){c*=.96+grain*.05*detail;rough=.48;h=(grain-.5)*.001;
 }else if(mat==2){c*=.9+medium*.16;h=(medium-.5)*.024;rough=.96;
 }else if(mat==7){c*=.93+noise2(local_pos.xz*4.0)*.10;rough=.92;
 }else{c*=.96+medium*.07;rough=.94;}
 // Filtered shallow surface relief in view space, stable on moving models.
 vec3 dp1=dFdx(VERTEX),dp2=dFdy(VERTEX);vec3 r1=cross(dp2,NORMAL),r2=cross(NORMAL,dp1);float det=dot(dp1,r1);
 vec3 gradient=(dFdx(h)*r1+dFdy(h)*r2)*sign(det)/max(abs(det),.00001);
 NORMAL=normalize(NORMAL-gradient*detail*.38);
 float luminance=dot(c,vec3(.2126,.7152,.0722));
 c=mix(vec3(luminance),c,mat==7?.86:.94);
 ALBEDO=c;ROUGHNESS=rough;METALLIC=mat==8?.45:0.0;SPECULAR=mat==8?.42:.24;
}
