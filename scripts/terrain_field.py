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
  self.bridges=[b['rect'] for b in spec['bridges']]+[p['pier'] for p in spec['map']['ports'].values()]

 def sample(self,x,z):
  x,z=np.broadcast_arrays(np.asarray(x,dtype=float),np.asarray(z,dtype=float));n=noise(x*.075,z*.075,1558)
  fine=noise(x*.4,z*.4,62)
  mountain=np.zeros(x.shape)
  for m in self.spec['mountains']:
   cx,cz=m['center'];rx,rz=m['radii'];mountain+=((m['height']*np.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2)))**3)
  mountain=np.power(mountain,1/3)*(1-smooth(22,33,x))
  ridge=.77+noise(x*.17,z*.12,5)*.24+noise(x*.43,z*.29,9)*.055
  # Nested erosion scales cut granite ridges, while the low plain stays quiet.
  erosion=np.abs(np.sin(z*.27+x*.19+noise(x*.09,z*.12,14)*3))
  h=.44+(n-.5)*.23+mountain*ridge-mountain*.07*erosion
  h+=1.45*np.exp(-((x-70)/11)**2-((z-43)/8)**2)+.95*np.exp(-((x-63)/12)**2-((z-83)/8)**2)
  # Low, broad weathered spurs interrupt the plain without closing the routes.
  coast=100+2.3*np.sin(z*.085)+1.5*np.sin(z*.19+.6)-7*np.exp(-((z-83)/8)**2)
  island_spec=self.spec['map']['island'];cx,cz=island_spec['terrainCenter'];rx,rz=island_spec['terrainRadii']
  dx=(x-cx)/rx;dz=(z-cz)/rz;angle=np.arctan2(dz,dx)
  radius=np.hypot(dx,dz)/(1+.13*np.sin(angle*3+.4)+.07*np.cos(angle*5-1)+.025*np.sin(angle*9))
  island_distance=(1-radius)*17
  land_distance=np.maximum(coast-x,island_distance)
  island=x>self.spec['map']['seaBoundaryX']
  island_h=np.zeros(x.shape)
  for ridge in island_spec['ridges']:
   cx,cz=ridge['center'];rx,rz=ridge['radii'];island_h+=ridge['height']*np.exp(-((x-cx)/rx)**2-((z-cz)/rz)**2)
  island_h=.5+island_h*(.88+noise(x*.3,z*.24,46)*.22)
  h=np.where(island,island_h,h)
  road_distance=np.full(x.shape,100.0)
  road_center=np.full(x.shape,100.0)
  for line,width in self.roads:
   dist=line_distance(x,z,line);road_center=np.minimum(road_center,dist);road_distance=np.minimum(road_distance,dist-width/2)
  # Grade roads into the mountain toes, with feathered shoulders.
  grade=.42+np.maximum(0,28-x)*.055
  road_blend=1-smooth(0,3.8,road_distance)
  h=h*(1-road_blend)+np.minimum(h,grade)*road_blend
  # Initial settlement, harbour and resource work yards have actual flat support.
  island_x=island_spec['x']
  pads=[([39,36,52,57],.4,4),([island_x-10,37,island_x+10,61],.4,4),([17,36,26,46],.65,3.5),([18,59,27,68],.65,3.5),([78,62,85,69],.4,2.5)]
  for rect,y,feather in pads:
   t=1-smooth(0,feather,rect_distance(x,z,rect));h=h*(1-t)+y*t
  for rect in self.bridges:
   t=1-smooth(0,3,rect_distance(x,z,[rect[0]-1,rect[1]-1,rect[2]+1,rect[3]+1]));h=h*(1-t)+.4*t
  # Uneven fields follow the irrigation network; ridges remain small enough for work.
  field=np.zeros(x.shape);field_edge=np.full(x.shape,100.0);field_rows=np.zeros(x.shape)
  for i,f in enumerate(self.spec['fields']):
   mask=polygon(x,z,f['points']);edge=line_distance(x,z,np.asarray(f['points']+f['points'][:1],dtype=float))
   field=np.where(mask,(i+1),field);field_edge=np.minimum(field_edge,edge)
   a=f['angle'];row=np.abs(np.sin((x*np.cos(a)+z*np.sin(a))*3.8))
   field_rows=np.where(mask,row,field_rows)
  field_mask=field>0
  h+=np.where(field_mask,(field_rows-.5)*.035+np.exp(-field_edge**2/.12)*.12,0)
  # Shore, estuary and two engineered village canals use a continuous height field.
  sea_blend=1-smooth(-1.5,2.8,land_distance)
  seabed=self.water-.35+np.minimum(land_distance,0)*.18
  h=h*(1-sea_blend)+seabed*sea_blend
  canal_distance=np.full(x.shape,100.0)
  for line,width in self.canals:canal_distance=np.minimum(canal_distance,line_distance(x,z,line)-width/2)
  bank=1-smooth(-.32,.84,canal_distance)
  h=h*(1-bank)+np.minimum(h,self.water-.55)*bank
  water=h<self.water
  forest=np.zeros(x.shape)
  for f in self.spec['forests']:
   cx,cz=f['center'];rx,rz=f['radii'];r=((x-cx)/rx)**2+((z-cz)/rz)**2
   forest=np.maximum(forest,(1-smooth(.35,1.3,r+(noise(x*.22,z*.22,22)-.5)*.35))*f['density'])
  # Natural grass/soil modulation is broad; individual triangles are not randomly tinted.
  grass=np.stack([.075+n*.045,.125+n*.065,.038+n*.035],axis=-1)
  grass*=np.expand_dims(.94+fine*.08-forest*.18,-1)
  dirt=np.stack([.21+n*.075,.145+n*.06,.074+n*.045],axis=-1)
  rock=np.stack([.155+n*.065,.17+n*.06,.155+n*.055],axis=-1)
  ragged=(fine-.5)*.25
  mix=(1-smooth(-.3,.8,road_distance+ragged))[...,None]
  rut=np.exp(-((road_center-.55)/.12)**2)*(1-smooth(.9,1.2,road_center))
  dirt*=1-rut[...,None]*.065
  color=grass*(1-mix)+dirt*mix
  field_col=np.stack([.125+n*.06,.155+n*.065,.058+n*.04],axis=-1)*(1-field_rows[...,None]*.10)
  color=np.where(field_mask[...,None],color*.2+field_col*.8,color)
  bund=(1-smooth(.12,.4,field_edge))*(1-smooth(-.3,.5,road_distance)*.6)
  color=color*(1-bund[...,None]*.38)+dirt*bund[...,None]*.38
  wet=1-smooth(0,5.5,land_distance)
  mud=np.stack([.155+n*.065,.155+n*.06,.11+n*.055],axis=-1)
  color=color*(1-wet[...,None])+mud*wet[...,None]
  return {'height':h,'color':color,'rock':rock,'water':water,'coast':land_distance,'canal':canal_distance,'road':road_distance,'field':field,'forest':forest,'island':island}
