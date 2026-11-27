import * as THREE from 'three';
import { PolyBuilder, VMAT, tintHex, getSharedVoxelMaterial } from './voxelEngine.js';
import { YONGCHANG_MAP } from './yongchangMap.js';

const P={wood:0x66503a,dark:0x3d3027,plank:0x9b7b50,cloth:0x9b6346,
  sail:0xcebd96,stone:0x8a8778,rope:0xb5a478,iron:0x484c4a,red:0x963e2d};
const point=(x,z)=>({x:x-YONGCHANG_MAP.width/2,z:z-YONGCHANG_MAP.height/2});

function beam(pb,a,b,r=.035,color=P.wood) {
  const mid=new THREE.Vector3().fromArray(a).add(new THREE.Vector3().fromArray(b)).multiplyScalar(.5);
  const d=new THREE.Vector3().fromArray(b).sub(new THREE.Vector3().fromArray(a));
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());
  const e=new THREE.Euler().setFromQuaternion(q,'YXZ');
  pb.box(mid.x,mid.y,mid.z,r,d.length(),r,color,{rotX:e.x,rotY:e.y,rotZ:e.z,matId:VMAT.TIMBER});
}

function barrel(pb,x,y,z,scale=1) {
  pb.latheY(x,y,z,[[.17,0],[.22,.08],[.24,.28],[.21,.48],[.17,.52]].map(([r,h])=>[r*scale,h*scale]),12,P.wood,{matId:VMAT.TIMBER});
  for(const h of [.1,.4])pb.prismY(x,y+h*scale,z,.225*scale,.225*scale,.025*scale,12,P.iron,{matId:VMAT.METAL});
}

function crate(pb,x,y,z,size=.5) {
  pb.boxY(x,y,z,size,size*.85,size,P.plank,{matId:VMAT.TIMBER});
  for(const sign of [-1,1]) {
    pb.boxY(x+sign*size*.35,y-.01,z,.055,size*.9,size+.025,P.dark,{matId:VMAT.TIMBER});
    pb.boxY(x,y+.06,z+sign*size*.51,size+.03,.055,.035,P.dark,{matId:VMAT.TIMBER});
  }
}

function canopy(pb,x,z,w,d,height=1.4,color=P.cloth) {
  for(const dx of [-w/2,w/2])for(const dz of [-d/2,d/2])pb.prismY(x+dx,0,z+dz,.055,.04,height,7,P.wood,{matId:VMAT.TIMBER});
  const y=height-.08;
  // Sewn panels sag between the ridge, seams and tied eaves. Both faces are
  // authored because the open sheds are viewed from below as well as above.
  const strips=Math.max(4,Math.ceil(w/.48)),steps=4;
  const at=(u,v,sign)=>[x+(u-.5)*(w+.28),
    y+.42*(1-v)-.12*Math.sin(v*Math.PI)-.045*Math.sin(u*Math.PI*strips)*v,
    z+sign*v*(d/2+.15)];
  for(const sign of [-1,1]) {
    for(let i=0;i<strips;i++)for(let j=0;j<steps;j++){
      const a=at(i/strips,j/steps,sign),b=at((i+1)/strips,j/steps,sign);
      const c=at((i+1)/strips,(j+1)/steps,sign),e=at(i/strips,(j+1)/steps,sign);
      const shade=tintHex(color,(i%3-1)*.045);
      const upper=sign>0?[e,c,b,a]:[a,b,c,e];
      pb.quad(...upper,shade,1,1,1,1,false,VMAT.CLOTH);
      pb.quad(...upper.slice().reverse(),shade,.78,.78,.78,.78,false,VMAT.CLOTH);
    }
    for(let i=0;i<=strips;i++)for(let j=0;j<steps;j++)
      beam(pb,at(i/strips,j/steps,sign),at(i/strips,(j+1)/steps,sign),.018,P.rope);
    for(const dx of [-w/2,w/2]){
      beam(pb,[x+dx,y,z+sign*(d/2+.15)],[x+dx,height*.45,z+sign*d/2],.025,P.rope);
      beam(pb,[x+dx,height*.55,z+sign*d/2],[x+dx*.65,height-.12,z+sign*d/2],.045,P.dark);
    }
  }
  beam(pb,[x-w/2-.2,y+.43,z],[x+w/2+.2,y+.43,z],.07);
}

const boatGeometry=new Map();
export function createHarborBoat(team='enemy',large=false) {
  const key=`${team}_${large}`;
  if(!boatGeometry.has(key)) {
    const pb=new PolyBuilder(),length=large?7.4:4.8,width=large?2.5:1.75;
    const rings=[[-length/2,.06,.5],[-length*.42,width*.28,.38],[-length*.27,width*.45,.3],
      [0,width*.5,.3],[length*.24,width*.46,.34],[length*.4,width*.29,.54],[length/2,.035,.8]];
    for(let i=0;i<rings.length-1;i++) {
      const [x0,w0,y0]=rings[i],[x1,w1,y1]=rings[i+1];
      for(const sign of [-1,1]) {
        const a=[x0,y0,sign*w0],b=[x1,y1,sign*w1],c=[x1,-.25,sign*w1*.55],d=[x0,-.25,sign*w0*.55];
        for(let course=0;course<3;course++){
          const lerp=(v,w,t)=>v.map((n,k)=>n+(w[k]-n)*t);
          const aa=lerp(a,d,course/3),bb=lerp(b,c,course/3);
          const cc=lerp(b,c,(course+1)/3),dd=lerp(a,d,(course+1)/3);
          const shade=tintHex(P.wood,(course-1)*.09);
          if(sign>0)pb.quad(bb,aa,dd,cc,shade,1,1,.85,.85,false,VMAT.TIMBER);
          else pb.quad(aa,bb,cc,dd,shade,1,1,.85,.85,false,VMAT.TIMBER);
          beam(pb,aa,bb,.025,P.dark);
        }
        beam(pb,a,b,.09,P.plank);
      }
      pb.quad([x0,.25,-w0],[x0,.25,w0],[x1,.25,w1],[x1,.25,-w1],P.plank,1,1,1,1,false,VMAT.TIMBER);
    }
    for(let x=-length*.25;x<length*.25;x+=.3)beam(pb,[x,.27,-width*.42],[x,.27,width*.42],.027,P.wood);
    for(const sign of [-1,1]){
      for(let x=-length*.28;x<=length*.25;x+=.55)pb.prismY(x,.31,sign*width*.44,.035,.03,.26,6,P.dark,{matId:VMAT.TIMBER});
      beam(pb,[-length*.28,.57,sign*width*.44],[length*.25,.57,sign*width*.44],.05,P.plank);
    }
    // Raised stern transom, tiller and rudder give the hull a working silhouette.
    pb.boxY(-length*.46,.26,0,.18,.35,width*.39,P.wood,{matId:VMAT.TIMBER});
    pb.boxY(-length*.49,-.4,0,.19,.75,.09,P.dark,{matId:VMAT.TIMBER});
    beam(pb,[-length*.49,.43,0],[-length*.27,.54,0],.06,P.dark);
    pb.boxY(-length*.26,.26,0,length*.22,.65,width*.7,P.wood,{matId:VMAT.TIMBER});
    canopy(pb,-length*.25,0,length*.27,width*.85,1.1,team==='player'?0x536e78:P.cloth);
    const mast=large?4.8:3.2;
    pb.prismY(length*.05,.25,0,.07,.035,mast,9,P.dark,{matId:VMAT.TIMBER});
    // Curved battened sail, built double-sided from a fixed deterministic grid.
    const rows=7,cols=5,span=large?3.6:2.5;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const v=(rr,cc)=>{const u=cc/cols;return [length*.05+.26*Math.sin(u*Math.PI),1.1+rr/rows*(mast-.7), (u-.5)*span*(.85+.15*rr/rows)];};
      const a=v(r,c),b=v(r,c+1),d=v(r+1,c),e=v(r+1,c+1);
      const color=(r+c)%3?P.sail:0xb7a581;
      pb.quad(a,b,e,d,color,1,1,1,1,false,VMAT.CLOTH);pb.quad(d,e,b,a,color,1,1,1,1,false,VMAT.CLOTH);
    }
    for(let r=0;r<=rows;r++)beam(pb,[length*.05,1.1+r/rows*(mast-.7),-span*.5*(.85+.15*r/rows)],
      [length*.05,1.1+r/rows*(mast-.7),span*.5*(.85+.15*r/rows)],.035,P.wood);
    for(const sign of [-1,1])beam(pb,[length*.05,mast+.25,0],[-length*.36,.38,sign*width*.45],.024,P.rope);
    pb.boxY(length*.05,mast+.15,0,.8,.32,.025,team==='player'?0x365c7a:P.red,{matId:VMAT.CLOTH});
    // Supplies stay at the bow; the passenger lanes beside the mast stay clear.
    for(let i=0;i<2;i++)crate(pb,length*.35,.29,(i-.5)*.48,.28);
    boatGeometry.set(key,pb.buildGeometry());
  }
  const data=boatGeometry.get(key),group=new THREE.Group();
  const mesh=new THREE.Mesh(data.geo,getSharedVoxelMaterial());mesh.castShadow=true;mesh.receiveShadow=true;
  group.add(mesh);group.userData.voxelCount=data.voxelCount;group.name=large?'Batten sail junk':'Coastal transport';
  return group;
}

export function buildRaiderHarbor(world) {
  const inventory=[];
  const addStructure=(type,label,gx,gz,w,d,pb,hp=280,height=1.7)=> {
    const p=point(gx+w/2,gz+d/2),mesh=pb.buildMeshGroup(true,true);
    const y=.4;mesh.position.set(p.x,y,p.z);mesh.name=label;world.scene.add(mesh);
    const st={id:`harbor_${type}_${gx}_${gz}`,type,label,team:'enemy',gx,gz,x:p.x,y,z:p.z,hp,maxHp:hp,height,
      mesh,cells:[],halfExtents:{hx:w/2-.03,hz:d/2-.03},customAppearance:true,garrison:[],
      maxGarrison:type==='tower'?4:type==='wall'?1:0,shootCooldown:0,voxelCount:pb.triCount};
    for(let x=gx;x<gx+w;x++)for(let z=gz;z<gz+d;z++){
      const cell=world.getCell(x,z);
      if(!cell||cell.structure||cell.ground==='water')throw new Error(`Harbour structure overlaps at ${x},${z}: ${label}`);
      cell.structure=st;st.cells.push(cell);
    }
    world.structures.push(st);world.totalVoxelCount+=pb.triCount;inventory.push({type,label,gx,gz,w,d});return st;
  };
  const makeFence=()=>{
    const p=new PolyBuilder();
    for(let i=0;i<5;i++){
      const x=(i-2)*.196,h=1.43+(i%2)*.07;
      p.prismY(x,-.1,.29,.115,.10,h,7,tintHex(P.wood,(i%3-1)*.07),{matId:VMAT.TIMBER});
      p.prismY(x,h-.1,.29,.10,.005,.20,7,P.plank,{matId:VMAT.TIMBER});
    }
    for(const y of [.35,.95])p.boxY(0,y,0,.98,.09,.2,P.dark,{matId:VMAT.TIMBER});
    p.boxY(0,.75,0,.96,.12,.8,P.plank,{matId:VMAT.TIMBER});
    beam(p,[-.43,.12,-.1],[.43,1.25,-.1],.07,P.plank);
    return p;
  };
  const fence=(x,z,rotate=false)=>{
    const st=addStructure('wall','海寨木栅',x,z,1,1,makeFence(),240,1.45);
    if(rotate)st.mesh.rotation.y=Math.PI/2;return st;
  };
  for(let z=43;z<=55;z++)if(![43,49,50,55].includes(z))fence(123,z,true);
  for(let x=124;x<=138;x++){fence(x,43);fence(x,55);}
  for(let z=44;z<55;z++)fence(138,z,true);
  for(const [x,z] of YONGCHANG_MAP.enemyTowers){
    const p=new PolyBuilder();
    for(const dx of [-.37,.37])for(const dz of [-.37,.37])p.prismY(dx,-.1,dz,.09,.065,2.05,7,P.wood,{matId:VMAT.TIMBER});
    p.boxY(0,1.65,0,1.12,.16,1.12,P.plank,{matId:VMAT.TIMBER});
    for(const z of [-.47,.47])p.boxY(0,1.81,z,1.08,.38,.1,P.dark,{matId:VMAT.TIMBER});
    for(const sign of [-1,1]){
      beam(p,[-.37,.12,sign*.37],[.37,1.58,sign*.37],.075,P.plank);
      beam(p,[sign*.37,.12,-.37],[sign*.37,1.58,.37],.075,P.plank);
      beam(p,[sign*.34,.05,-.42],[sign*.34,1.7,-.32],.045,P.dark);
    }
    for(let step=0;step<7;step++)p.boxY(0,.16+step*.22,-.41+step*.014,.72,.045,.065,P.plank,{matId:VMAT.TIMBER});
    // Deck at 1.81 + a full standing archer needs clear headroom below the cloth.
    canopy(p,0,0,.78,.78,3.25,P.cloth);
    beam(p,[-.38,.1,.45],[.38,1.65,.45],.055);
    addStructure('tower','港口瞭望台',x,z,1,1,p,480,1.98);
  }
  const gate=world.placeStructure('gate',123,49,'enemy',true,0);
  if(!gate)throw new Error('Island harbour gate has no valid approach');
  gate.label='船寨栅门';
  const gatePb=new PolyBuilder();
  for(const z of [-.87,.87])gatePb.boxY(0,-.05,z,.44,2.1,.25,P.dark,{matId:VMAT.TIMBER});
  gatePb.boxY(0,1.85,0,.52,.3,2.1,P.plank,{matId:VMAT.TIMBER});
  const frame=gatePb.buildMeshGroup(true,true);
  while(gate.mesh.children.length)gate.mesh.remove(gate.mesh.children[0]);
  gate.mesh.add(frame);gate.customAppearance=true;
  for(const sign of [-1,1]){
    const leaf=new PolyBuilder();
    for(let i=0;i<4;i++)leaf.boxY(0,0,-sign*(.09+i*.17),.10,1.7,.12,P.wood,{matId:VMAT.TIMBER});
    for(const y of [.3,1.25])leaf.boxY(0,y,-sign*.34,.13,.08,.73,P.dark,{matId:VMAT.TIMBER});
    const door=leaf.buildMeshGroup(true,true);door.position.set(0,0,sign*.73);gate.mesh.add(door);
    if(sign<0)gate.gateLeafL=door;else gate.gateLeafR=door;
  }
  gate.gateLeaf=gate.gateLeafL;
  // A substantial timber command hall, rather than a miniature warship on land.
  const hall=new PolyBuilder();
  hall.boxY(0,0,0,3.9,.22,3.9,P.stone,{matId:VMAT.ASHLAR});
  hall.boxY(.2,.22,0,2.8,1.5,3.25,P.wood,{matId:VMAT.TIMBER});
  // Inset walls, projecting frame, shutters and a planked gallery share the
  // existing four-cell footprint; no new obstacle is placed in the assault lane.
  for(let i=0;i<15;i++){
    const z=-1.5+i*.215;
    hall.boxY(-1.215,.26,z,.07,1.38,.19,tintHex(P.plank,(i%3-1)*.08),{matId:VMAT.TIMBER});
  }
  for(const z of [-1.65,1.65]){
    hall.boxY(.2,.3,z,2.85,.12,.12,P.dark,{matId:VMAT.TIMBER});
    hall.boxY(.2,1.42,z,2.85,.12,.12,P.dark,{matId:VMAT.TIMBER});
    hall.latticeWindow(.35,1.05,z,.8,.58,z<0?'z-':'z+',P.dark,0x9a9470,false);
  }
  for(const z of [-1.5,-.75,.75,1.5]){
    hall.boxY(-1.72,.22,z,.11,1.55,.11,P.dark,{matId:VMAT.TIMBER});
    beam(hall,[-1.72,1.35,z],[-1.22,1.7,z],.065,P.plank);
  }
  for(let i=0;i<16;i++)hall.boxY(-1.57,.20,-1.57+i*.21,.61,.08,.195,P.plank,{matId:VMAT.TIMBER});
  hall.boxY(-1.87,.04,0,.23,.16,.85,P.stone,{matId:VMAT.ASHLAR});
  for(const z of [-1.55,-.78,0,.78,1.55]){
    hall.boxY(-1.27,.22,z,.12,1.7,.12,P.dark,{matId:VMAT.TIMBER});
    if(z)hall.latticeWindow(-1.22,1.05,z,.42,.55,'x-',P.dark,0xa99564,false);
  }
  hall.boxY(-1.24,.22,0,.07,1.22,.6,0x2a2724,{matId:VMAT.TIMBER});
  hall.chineseRoof(.12,1.75,0,3.75,3.72,.65,0x544c3e,0x74654e,{style:'hip',cornerLift:.04,noFinial:true});
  hall.boxY(.38,2.27,0,1.55,.65,2.0,P.dark,{matId:VMAT.TIMBER});
  hall.chineseRoof(.38,2.9,0,2.15,2.55,.45,0x4b493e,0x75664f,{style:'hip',cornerLift:.02,noFinial:true});
  hall.prismY(-1.65,.23,-1.65,.06,.035,3.6,8,P.dark,{matId:VMAT.TIMBER});
  hall.boxY(-1.17,3,-1.65,.95,.6,.025,P.red,{matId:VMAT.TIMBER});
  crate(hall,-1.56,.23,1.45,.5);barrel(hall,-1.55,.23,.72);
  const keep=addStructure('keep','黑鲨岛寨本营',...YONGCHANG_MAP.enemyKeep,4,4,hall,2200,3.35);
  for(const [gx,gz,w,d,label,color] of [[126,40,4,2,'水手营棚',P.cloth],[132,40,4,2,'岛寨粮栈',P.sail],
    [126,53,4,2,'索具仓棚',0x6d7562],[134,52,3,2,'军械棚',0x8c694b],[127,57,4,2,'修帆作坊',P.sail]]) {
    const p=new PolyBuilder();canopy(p,0,0,w-.2,d-.2,1.3,color);
    p.boxY(0,0,0,w-.16,.09,d-.16,P.wood,{matId:VMAT.TIMBER});
    crate(p,-w*.28,.1,0,.62);crate(p,-w*.08,.1,.1,.52);barrel(p,w*.25,.1,0);
    addStructure('supply',label,gx,gz,w,d,p,250,1.8);
  }
  // The quay stays free along Z48..51 for carts and landing squads.
  const dock=new PolyBuilder();
  for(const port of Object.values(YONGCHANG_MAP.ports)){
    const [x0,z0,x1,z1]=port.pier;
    for(let x=x0;x<x1;x+=.22)dock.boxY(x+.11-YONGCHANG_MAP.width/2,.25,(z0+z1)/2-YONGCHANG_MAP.height/2,.20,.15,z1-z0,P.plank,{matId:VMAT.TIMBER});
    for(let x=x0+.25;x<x1;x+=1.4)for(const z of [z0+.12,z1-.12]){
      dock.prismY(x-YONGCHANG_MAP.width/2,-.85,z-YONGCHANG_MAP.height/2,.095,.075,1.55,8,P.wood,{matId:VMAT.TIMBER});
    }
  }
  const dockMesh=dock.buildMeshGroup(true,true);dockMesh.name='Landing quays';world.scene.add(dockMesh);
  world.harborBoats=[];
  for(const [x,z,yaw,large] of [[111,41,1.45,true],[116,63,1.5,true],[108,58,.3,false],[147,63,-.7,true]]) {
    const boat=createHarborBoat('enemy',large),p=point(x,z);boat.position.set(p.x,-.15,p.z);boat.rotation.y=yaw;
    world.scene.add(boat);world.harborBoats.push(boat);
  }
  // A hauled-out hull and trestles create a recognizable repair yard.
  const repair=new PolyBuilder();
  for(const x of [-1.1,1.1])repair.boxY(x,0,0,.22,.45,1.7,P.dark,{matId:VMAT.TIMBER});
  for(let x=-1.6;x<=1.6;x+=.4){
    const width=.72*(1-Math.pow(x/2.1,2));
    for(const sign of [-1,1])beam(repair,[x,.45,0],[x,.95,sign*width],.09,P.wood);
  }
  for(const sign of [-1,1])beam(repair,[-1.8,.85,sign*.36],[1.8,.85,sign*.36],.08,P.plank);
  beam(repair,[-2,.45,0],[2,.45,0],.14,P.dark);
  addStructure('supply','船坞修船架',119,58,4,2,repair,220,1);
  // Dock stores, water casks and a hoist; all solid footprints enter navigation.
  for(const [x,z] of [[120,45],[120,53],[135,58],[125,59]]){
    const p=new PolyBuilder();crate(p,-.35,0,0,.65);crate(p,.35,0,.15,.5);barrel(p,.2,0,-.35);
    addStructure('supply','港口货垛',x,z,2,1,p,160,.8);
  }
  const hoist=new PolyBuilder();hoist.prismY(0,0,0,.11,.08,2.6,9,P.dark,{matId:VMAT.TIMBER});
  beam(hoist,[0,2.5,0],[1,2.5,0],.1);beam(hoist,[0,1.4,0],[.9,2.5,0],.065);
  beam(hoist,[.95,2.5,0],[.95,.8,0],.026,P.rope);crate(hoist,.65,.1,0,.45);
  addStructure('supply','卸货绞盘',121,52,1,1,hoist,150,2.6);
  for(const [x,z] of [[136,34],[140,39],[142,52],[131,63],[124,35]])world.spawnTree(x,z,'pine');
  const rocks=new PolyBuilder();
  for(const [x,z,rx,ry] of [[144,44,1.6,1.4],[141,31,1.2,1.1],[116,37,1.5,.9],[123,68,1.7,.9],[147,58,1.4,1.2]]){
    const p=point(x,z);rocks.facetedBlob(p.x,-.25,p.z,rx,ry,rx*.72,0x74766b,x,0.2,VMAT.CLIFF);
  }
  world.scene.add(rocks.buildMeshGroup(true,true));
  // Low quayside lanterns use emissive surfaces; existing point-light budget stays fixed.
  const lamps=new PolyBuilder();
  for(const [x,z] of [[118,47],[121,52],[125,47],[129,52],[137,49]]){
    const p=point(x,z);lamps.prismY(p.x,.4,p.z,.04,.035,1.5,7,P.dark,{matId:VMAT.TIMBER});
    lamps.latheY(p.x,1.5,p.z,[[.06,0],[.13,.08],[.13,.25],[.06,.32]],8,0xffb75f,{emissive:true});
  }
  world.scene.add(lamps.buildMeshGroup(false,true));
  const details=new PolyBuilder();
  // Mending nets and spare spars identify a working anchorage at play distance.
  for(const [gx,gz] of [[127,60],[134,59]]){
    const p=point(gx,gz);
    for(const dx of [-.8,.8])details.prismY(p.x+dx,.4,p.z,.045,.035,1.05,7,P.wood,{matId:VMAT.TIMBER});
    for(let row=0;row<6;row++)beam(details,[p.x-.8,.65+row*.15,p.z],[p.x+.8,.57+row*.15,p.z],.015,P.rope);
    for(let col=0;col<9;col++)beam(details,[p.x-.8+col*.2,.6,p.z],[p.x-.8+col*.2,1.4,p.z],.015,P.rope);
  }
  for(const [gx,gz] of [[129,51],[136,44],[124,57]]){
    const p=point(gx,gz);
    details.prismY(p.x,.4,p.z,.32,.27,.1,9,P.stone,{matId:VMAT.ASHLAR});
    for(let i=0;i<3;i++)details.boxY(p.x+(i-1)*.15,.5,p.z,.08,.35,.08,0xf6ac41,{emissive:true,matId:VMAT.TIMBER});
  }
  for(const [gx,gz] of [[125,44],[137,54]]){
    const p=point(gx,gz);details.prismY(p.x,.4,p.z,.035,.025,2.5,7,P.dark,{matId:VMAT.TIMBER});
    details.boxY(p.x+.32,2.35,p.z,.62,.42,.025,P.red,{matId:VMAT.TIMBER});
  }
  world.scene.add(details.buildMeshGroup(false,true));
  world.harborInventory=inventory;
  world.layoutVersion++;
  return keep;
}
