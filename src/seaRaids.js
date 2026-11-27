import * as THREE from 'three';
import { YONGCHANG_MAP } from './yongchangMap.js';
import { createHarborBoat } from './raiderHarbor.js';

const worldPoint=([x,z])=>new THREE.Vector3(x-YONGCHANG_MAP.width/2,0,z-YONGCHANG_MAP.height/2);
const isIsland=x=>x+YONGCHANG_MAP.width/2>108;

export class SeaRaidSystem {
  constructor(game) {
    this.game=game;
    this.trips=[];
    this.pendingWaves=[];
    this.clock=0;
    this.lastDeparture={island:-100,mainland:-100};
    this.stats={enemyLaunched:0,enemyLanded:0,playerLaunched:0,playerLanded:0};
    this.lastHint=-100;
  }

  queueWave(orders) {
    orders.forEach((order,i)=>this.pendingWaves.push({...order,departAt:this.clock+i*2.6}));
  }

  clearMount(unit) {
    const wall=unit.garrisonWall||unit.pendingGarrisonWall;
    if(wall?.garrison){const i=wall.garrison.indexOf(unit);if(i>=0)wall.garrison.splice(i,1);}
    unit.garrisonWall=null;unit.pendingGarrisonWall=null;unit.waypoints=null;
  }

  launch(units,team,fromIsland,toNorth=false) {
    const alive=units.filter(u=>u.hp>0&&!u.seaTransit);
    if(!alive.length)return false;
    const ports=YONGCHANG_MAP.ports;
    const origin=fromIsland?ports.island:ports.mainland;
    const destination=fromIsland?(toNorth?ports.north:ports.mainland):ports.island;
    const a=worldPoint(origin.boat),b=worldPoint(destination.boat);
    const route=new THREE.QuadraticBezierCurve3(a,new THREE.Vector3((a.x+b.x)/2,0,Math.max(a.z,b.z)+3.5),b);
    const boat=createHarborBoat(team,alive.some(u=>u.isSiege));
    boat.position.copy(a);boat.position.y=-.12;this.game.scene.add(boat);
    const seats=alive.map((u,i)=>({u,start:new THREE.Vector3(u.x,u.y,u.z),
      offset:new THREE.Vector3(-.8+Math.floor(i/2)*.63,.25,(i%2-.5)*.62)}));
    seats.forEach(({u})=>{this.clearMount(u);u.seaTransit='boarding';u.mesh.visible=true;});
    const trip={team,boat,route,seats,elapsed:0,duration:Math.max(5,route.getLength()/2.4),destination,
      fromIsland,toNorth,phase:'boarding'};
    this.trips.push(trip);
    this.lastDeparture[fromIsland?'island':'mainland']=this.clock;
    this.stats[team==='enemy'?'enemyLaunched':'playerLaunched']+=alive.length;
    return true;
  }

  chooseLanding(trip,unit,index) {
    const w=this.game.world,base=trip.destination.landing;
    const candidates=[];
    for(let r=0;r<=3;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
      const c=w.getCell(base[0]+dx,base[1]+dz);
      if(!c||c.ground==='water'||c.structure||c.tree||c.resourceNode)continue;
      const p=worldPoint([c.gx+.5,c.gz+.5]);p.y=c.elev;
      candidates.push(p);
    }
    if(!candidates.length)return null;
    const candidate=candidates[index%candidates.length];
    return candidate;
  }

  update(dt) {
    if(dt<=0)return;
    this.clock+=dt;
    // Each wave sails from the island. No enemy is spawned into a mainland field.
    for(let i=this.pendingWaves.length-1;i>=0;i--){
      const order=this.pendingWaves[i];if(order.departAt>this.clock || this.clock-this.lastDeparture.island<2.6)continue;
      this.pendingWaves.splice(i,1);
      if(this.game.world.enemyKeep.hp<=0)continue;
      const p=worldPoint(YONGCHANG_MAP.ports.island.rally);
      const sq=this.game.createSquad(order.role,'enemy',p.x,p.z,true);
      sq.seaborne=true;
      this.launch(sq.members,'enemy',true,order.north);
    }
    for(let i=this.trips.length-1;i>=0;i--){
      const t=this.trips[i];t.elapsed+=dt;
      const sailT=THREE.MathUtils.clamp((t.elapsed-.9)/t.duration,0,1);
      const p=t.route.getPoint(sailT),tangent=t.route.getTangent(sailT);
      t.boat.position.set(p.x,-.12+Math.sin(this.clock*2.1)*.025,p.z);
      t.boat.rotation.y=-Math.atan2(tangent.z,tangent.x);
      if(t.elapsed<.9)t.phase='boarding';else if(sailT<1)t.phase='sailing';else t.phase='landing';
      let allLanded=true;
      for(let n=0;n<t.seats.length;n++){
        const seat=t.seats[n],u=seat.u;if(u.hp<=0||u.seaTransit===null)continue;
        const deck=seat.offset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),t.boat.rotation.y).add(t.boat.position);
        let pos=deck;
        if(t.phase==='boarding')pos=seat.start.clone().lerp(deck,THREE.MathUtils.smoothstep(t.elapsed,0,.9));
        if(t.phase==='landing'){
          const landing=this.chooseLanding(t,u,n);
          if(landing){
            const progress=THREE.MathUtils.clamp((t.elapsed-.9-t.duration)/.9,0,1);
            pos=deck.clone().lerp(landing,THREE.MathUtils.smoothstep(progress,0,1));
            if(progress===1){
              u.seaTransit=null;u.waypoints=null;u.vx=0;u.vz=0;u.noProgressTime=0;u.anchorX=pos.x;u.anchorZ=pos.z;
              if(u.squad){u.squad.waypoints=null;u.squad.pathVer=-1;
                if(!u.squad.hasCustomOrder){u.squad.targetX=pos.x;u.squad.targetZ=pos.z;}}
              this.stats[t.team==='enemy'?'enemyLanded':'playerLanded']++;
            }
          }
        }
        u.x=pos.x;u.y=pos.y;u.z=pos.z;u.mesh.position.copy(pos);u.mesh.rotation.y=t.boat.rotation.y+Math.PI/2;
        if(u.seaTransit)allLanded=false;
      }
      if(allLanded){this.game.scene.remove(t.boat);this.trips.splice(i,1);}
    }
    // Automatic crossing is part of the existing Attack command. Custom orders
    // to the opposite shore use the same route, including a return journey.
    for(const sq of this.game.squads){
      if(sq.team!=='player')continue;
      const units=sq.members.filter(u=>u.hp>0&&!u.garrisonWall&&!u.pendingGarrisonWall);
      if(!units.length||units.some(u=>u.seaTransit))continue;
      const fromIsland=isIsland(units[0].x);
      const wantIsland=sq.hasCustomOrder?isIsland(sq.targetX):this.game.stance==='attack';
      if(fromIsland===wantIsland){sq.seaApproach=null;continue;}
      const port=fromIsland?YONGCHANG_MAP.ports.island:YONGCHANG_MAP.ports.mainland;
      const rally=worldPoint(port.rally);sq.seaApproach={x:rally.x,z:rally.z};
      const ready=units.filter(u=>Math.hypot(u.x-rally.x,u.z-rally.z)<2.1);
      if(ready.length===units.length && this.clock-this.lastDeparture[fromIsland?'island':'mainland']>=2.6){
        this.launch(units,'player',fromIsland);
        sq.seaApproach=null;
      }
    }
    const lord=this.game.playerLord;
    const target=lord?.orderTarget||lord?.pendingEnterBuilding;
    if(lord&&lord.hp>0&&!lord.seaTransit&&!lord.garrisonBuilding&&target&&isIsland(lord.x)!==isIsland(target.x)){
      const fromIsland=isIsland(lord.x),port=fromIsland?YONGCHANG_MAP.ports.island:YONGCHANG_MAP.ports.mainland;
      const rally=worldPoint(port.rally);lord.seaApproach={x:rally.x,z:rally.z};
      if(Math.hypot(lord.x-rally.x,lord.z-rally.z)<1.2 && this.clock-this.lastDeparture[fromIsland?'island':'mainland']>=2.6){this.launch([lord],'player',fromIsland);lord.seaApproach=null;}
    } else if(lord)lord.seaApproach=null;
  }

  moveToPort(unit,dt,morale) {
    const target=unit.seaApproach||unit.squad?.seaApproach;
    if(!target)return false;
    const g=this.game,nav=g.computeAgentDirection(unit,target.x,target.z,.65,dt,{isLarge:unit.isSiege});
    if(!nav.arrived){const steer=g.updateStuckWatchdog(unit,nav.dx,nav.dz,dt,{isLarge:unit.isSiege});g.stepUnitSmart(unit,steer.dx,steer.dz,dt,morale);}
    return true;
  }
}
