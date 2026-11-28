"""Authored terrain field shared by geometry, navigation and buildability generation."""
import numpy as np

def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def noise(x,z,seed=0):
 ix=np.floor(x);iz=np.floor(z);fx=x-ix;fz=z-iz;u=fx*fx*(3-2*fx);v=fz*fz*(3-2*fz)
 def h(a,b):return np.mod(np.sin(a*127.1+b*311.7+seed*17.13)*43758.5453,1)
 return (h(ix,iz)*(1-u)+h(ix+1,iz)*u)*(1-v)+(h(ix,iz+1)*(1-u)+h(ix+1,iz+1)*u)*v

def spline(points):
 p=np.asarray(points,dtype=float);result=[]
 for i in range(len(p)-1):
  a,b,c,d=p[max(0,i-1)],p[i],p[i+1],p[min(len(p)-1,i+2)]
  count=max(3,int(np.linalg.norm(c-b)*2))
  for t in np.linspace(0,1,count,endpoint=False):result.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
 return np.asarray(result+[p[-1]])

def line_distance(x,z,points):
 closest=np.full(np.broadcast(x,z).shape,1e9)
 for a,b in zip(points[:-1],points[1:]):
  d=b-a;t=np.clip(((x-a[0])*d[0]+(z-a[1])*d[1])/np.dot(d,d),0,1)
  closest=np.minimum(closest,np.hypot(x-a[0]-t*d[0],z-a[1]-t*d[1]))
 return closest

def rect_distance(x,z,rect):
 x0,z0,x1,z1=rect
 return np.hypot(np.maximum(np.maximum(x0-x,x-x1),0),np.maximum(np.maximum(z0-z,z-z1),0))

def polygon(x,z,points):
 inside=np.zeros(np.broadcast(x,z).shape,dtype=bool)
 for a,b in zip(points,points[1:]+points[:1]):
  if a[1]==b[1]:continue
  inside^=((a[1]>z)!=(b[1]>z))&(x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])
 return inside

class Landscape:
 def __init__(self,spec):
  self.spec=spec;self.w,self.d=spec['grid'];self.water=spec['waterLevel']
  self.roads=[(spline(r['points']),r['width']) for r in spec['roads']]
  self.canals=[(spline(r['points']),r['width']) for r in spec['canals']]
  self.bridges=[b['rect'] for b in spec['bridges']]

 def sample(self,x,z):
  x,z=np.broadcast_arrays(np.asarray(x,dtype=float),np.asarray(z,dtype=float))
  n=noise(x*.065,z*.065,1558);fine=noise(x*.32,z*.32,62)
  # Weathered connected ridges taper into an alluvial plain, not a row of props.
  mountain=np.zeros(x.shape)
  for m in self.spec['mountains']:
   cx,cz=m['center'];rx,rz=m['radii'];mountain+=((m['height']*np.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2)))**3)
  mountain=np.power(mountain,1/3)*(1-smooth(22,34,x))
  ridge=.86+noise(x*.13,z*.10,5)*.14
  valleys=np.abs(np.sin(z*.19+x*.14+noise(x*.07,z*.09,14)*2))
  mountain*=ridge-valleys*.075
  h=.43+(n-.5)*.15+mountain
  h+=.85*np.exp(-((x-70)/13)**2-((z-43)/11)**2)+.55*np.exp(-((x-65)/15)**2-((z-81)/13)**2)
  coast=100+2.3*np.sin(z*.085)+1.5*np.sin(z*.19+.6)-7*np.exp(-((z-83)/8)**2)
  island_spec=self.spec['map']['island'];cx,cz=island_spec['terrainCenter'];rx,rz=island_spec['terrainRadii']
  dx=(x-cx)/rx;dz=(z-cz)/rz;angle=np.arctan2(dz,dx)
  radius=np.hypot(dx,dz)/(1+.13*np.sin(angle*3+.4)+.07*np.cos(angle*5-1)+.025*np.sin(angle*9))
  island_distance=(1-radius)*17
  land_distance=np.maximum(coast-x,island_distance)
  island=x>self.spec['map']['seaBoundaryX']
  island_h=np.zeros(x.shape)
  for m in island_spec['ridges']:
   cx,cz=m['center'];rx,rz=m['radii'];island_h+=m['height']*np.exp(-((x-cx)/rx)**2-((z-cz)/rz)**2)
  # A broad natural saddle separates the north and south ridges around the fort.
  saddle=1-.92*np.exp(-((x-island_spec['x'])/17)**4-((z-49)/13)**4)
  island_h=.43+island_h*saddle*(.94+noise(x*.16,z*.16,46)*.08)
  h=np.where(island,island_h,h)
  road_distance=np.full(x.shape,100.0)
  for line,width in self.roads:road_distance=np.minimum(road_distance,line_distance(x,z,line)-width/2)
  # Only crossing approaches may be graded: a short transition joins actual
  # wooden bridge ends. Resource yards and route corridors never flatten land.
  bridge_influence=np.zeros(x.shape)
  for rect in self.bridges:
   t=1-smooth(0,1.1,rect_distance(x,z,[rect[0]-.35,rect[1],rect[2]+.35,rect[3]]))
   h=h*(1-t)+.4*t
   bridge_influence=np.maximum(bridge_influence,t)
  field=np.zeros(x.shape)
  for i,f in enumerate(self.spec['fields']):field=np.where(polygon(x,z,f['points']),i+1,field)
  sea_blend=1-smooth(-1.5,2.8,land_distance)
  seabed=self.water-.35+np.minimum(land_distance,0)*.14
  h=h*(1-sea_blend)+seabed*sea_blend
  canal_distance=np.full(x.shape,100.0)
  for line,width in self.canals:
   half=width*.5*(.93+noise(x*.11,z*.11,19)*.14)
   dist=line_distance(x,z,line)-half
   canal_distance=np.minimum(canal_distance,dist)
  # The two lowland tidal branches join the same estuary. No sea-level trench
  # is carved across the mountains; both beds stay in the alluvial lowland.
  bank_width=self.spec.get('naturalTerrain',{}).get('bankWidth',1.8)
  bank_width=bank_width*(1-bridge_influence)+.82*bridge_influence
  bank_shape=smooth(0,bank_width,canal_distance)
  dry_bank=self.water+(h-self.water)*bank_shape
  bed=self.water-self.spec.get('naturalTerrain',{}).get('tidalDepth',.32)*smooth(0,.5,-canal_distance)
  channel=np.where(canal_distance<0,bed,dry_bank)
  h=np.minimum(h,channel)
  # The deck is a real solid above the bank. Lower only soil below its interior
  # so terrain cannot share the plank top plane or show through the timber.
  for x0,z0,x1,z1 in self.bridges:
   inset=smooth(x0,x0+.35,x)*(1-smooth(x1-.35,x1,x))*smooth(z0-.25,z0,z)*(1-smooth(z1,z1+.25,z))
   h=np.where(inset>0,np.minimum(h,.4-inset*.22),h)
  water=h<self.water
  forest=np.zeros(x.shape)
  for f in self.spec['forests']:
   cx,cz=f['center'];rx,rz=f['radii'];r=((x-cx)/rx)**2+((z-cz)/rz)**2
   forest=np.maximum(forest,(1-smooth(.35,1.35,r+(noise(x*.18,z*.18,22)-.5)*.48))*f['density'])
  # Continuous woodland belongs to the landform, not just isolated oval groves.
  # Exposed granite, tidal salt margins and village clearings remain open.
  woodland=noise(x*.075,z*.075,313);gaps=noise(x*.14,z*.11,79)
  western=(1-smooth(25,36,x))*(.68+woodland*.26)*(1-smooth(9,14,h)*.45)
  plain=smooth(55,63,x)*(1-smooth(87,97,x))*(.16+smooth(.25,.66,woodland)*.64)
  riparian=(1-smooth(2.4,6.5,canal_distance))*(.25+gaps*.33)
  island_woodland=island*(.42+woodland*.40)
  forest=np.maximum(forest,np.maximum(np.maximum(western,plain),np.maximum(riparian,island_woodland)))
  forest*=.55+smooth(.13,.46,gaps)*.45
  forest*=smooth(.8,3.2,land_distance)*smooth(.7,1.65,canal_distance)
  # Wetness follows actual elevation above connected water, not a fixed-width
  # band around every coast. Mud, sand and rock belong to the terrain surface.
  wet_height=self.water+.30
  wet=(1-smooth(self.water+.025,wet_height,h))*(1-smooth(2,7,land_distance))
  shore=1-smooth(-.15,2.4,land_distance)
  riverbank=(1-smooth(.02,1.65,canal_distance))*(1-shore)
  grass=np.stack([.085+n*.05,.135+n*.07,.055+n*.04],axis=-1)
  grass*=np.expand_dims(.96+fine*.06-forest*.13,-1)
  geology=self.spec['geology']
  bedrock=np.asarray(geology['bedrockColor']);weathered=np.asarray(geology['weatheredColor'])
  weather=noise(x*.22,z*.18,331)*.32
  rock=(bedrock*(1-weather[...,None])+weathered*weather[...,None])*(.91+n[...,None]*.16)
  soil=np.stack([.20+n*.045,.153+n*.045,.092+n*.04],axis=-1)
  sand=np.stack([.32+n*.05,.285+n*.045,.185+n*.045],axis=-1)
  mud=np.stack([.12+n*.035,.13+n*.035,.083+n*.025],axis=-1)
  color=grass*(1-riverbank[...,None])+soil*riverbank[...,None]
  color=color*(1-shore[...,None])+sand*shore[...,None]
  color=color*(1-wet[...,None])+mud*wet[...,None]
  return {'height':h,'color':color,'rock':rock,'water':water,'wet':wet,'coast':land_distance,'canal':canal_distance,'road':road_distance,'field':field,'forest':forest,'island':island}
