import * as THREE from 'three';
import { YONGCHANG_MAP } from './yongchangMap.js';

// A north-up plan gives the larger, rotatable world a stable reference.
export class HistoricMapView {
  constructor(game) {
    this.game=game;
    this.panel=document.getElementById('historic-map');
    this.canvas=document.getElementById('historic-map-canvas');
    this.ctx=this.canvas.getContext('2d');
    this.base=document.createElement('canvas');
    this.base.width=YONGCHANG_MAP.width*3;this.base.height=YONGCHANG_MAP.height*3;
    this.canvas.width=this.base.width;this.canvas.height=this.base.height;
    this.point=new THREE.Vector3();
    this.direction=new THREE.Vector3();
    this.drawBase();
    this.canvas.addEventListener('pointerdown', e=> {
      if(game.menuState!=='play') return;
      e.preventDefault();e.stopPropagation();
      const b=this.canvas.getBoundingClientRect();
      const x=(e.clientX-b.left)/b.width*YONGCHANG_MAP.width-YONGCHANG_MAP.width/2;
      const z=(e.clientY-b.top)/b.height*YONGCHANG_MAP.height-YONGCHANG_MAP.height/2;
      game.camDesiredTarget.set(x,0.4,z);
      if(game.frustumSize>45) {game.frustumSize=28;game.updateOrthoProjection();}
    });
    document.getElementById('btn-map-overview').addEventListener('click',()=>this.toggleOverview());
  }

  toggleOverview() {
    const g=this.game, overview=g.frustumSize<60;
    const center=overview?YONGCHANG_MAP.camera.overview:YONGCHANG_MAP.camera.home;
    g.camDesiredTarget.set(center[0]-YONGCHANG_MAP.width/2+0.5,0.4,center[1]-YONGCHANG_MAP.height/2+0.5);
    g.frustumSize=overview?YONGCHANG_MAP.camera.overviewZoom:26;g.updateOrthoProjection();
  }

  drawBase() {
    const c=this.base.getContext('2d'),w=YONGCHANG_MAP.width,h=YONGCHANG_MAP.height;
    for(let x=0;x<w;x++) for(let z=0;z<h;z++) {
      const cell=this.game.world.cells[x][z];
      c.fillStyle=cell.isBridge?'#d0bd8c':cell.ground==='water'?'#416f73':
        cell.biome==='road'?'#ad9b78':cell.biome==='paddy'?'#9b9d5c':cell.elev>2?'#797968':'#63734d';
      c.fillRect(x*3,z*3,3,3);
    }
  }

  draw() {
    const g=this.game,c=this.ctx;
    this.panel.hidden=g.menuState!=='play';
    if(this.panel.hidden) return;
    c.drawImage(this.base,0,0);
    for(const s of g.world.structures) {
      if(s.hp<=0) continue;
      c.fillStyle=s.team==='enemy'?'#b65d43':['wall','tower'].includes(s.type)?'#d0c4a5':'#d5b46d';
      for(const cell of s.cells || []) c.fillRect(cell.gx*3,cell.gz*3,3,3);
    }
    c.font='bold 14px Microsoft YaHei';c.textAlign='center';c.textBaseline='middle';
    c.lineWidth=3;c.strokeStyle='#262a25';c.fillStyle='#fff0ca';
    for(const [label,x,z] of [['山麓',16,49],['渡口',97,44],['村落',46,37],['海寨',132,35]]) {
      c.strokeText(label,x*3,z*3);c.fillText(label,x*3,z*3);
    }
    // Project the actual orthographic view onto the ground, including rotation.
    c.strokeStyle='#fff6d7';c.lineWidth=1.5;c.beginPath();
    g.camera.getWorldDirection(this.direction);
    for(const [i,[x,y]] of [[-1,-1],[1,-1],[1,1],[-1,1]].entries()) {
      this.point.set(x,y,-1).unproject(g.camera);
      this.point.addScaledVector(this.direction,(0.4-this.point.y)/this.direction.y);
      const px=(this.point.x+YONGCHANG_MAP.width/2)*3,pz=(this.point.z+YONGCHANG_MAP.height/2)*3;
      if(i===0)c.moveTo(px,pz);else c.lineTo(px,pz);
    }
    c.closePath();c.stroke();
    for(const unit of g.units || []) {
      if(unit.hp<=0 || unit.garrisonBuilding) continue;
      c.fillStyle=unit.team==='player'?'#f8db73':'#ec715a';
      c.fillRect((unit.x+YONGCHANG_MAP.width/2)*3-1,(unit.z+YONGCHANG_MAP.height/2)*3-1,3,3);
    }
    for(const trip of g.seaRaids?.trips||[]){
      c.fillStyle=trip.team==='player'?'#f9e8ac':'#ec715a';
      const x=(trip.boat.position.x+YONGCHANG_MAP.width/2)*3,z=(trip.boat.position.z+YONGCHANG_MAP.height/2)*3;
      c.beginPath();c.moveTo(x+5,z);c.lineTo(x-4,z-3);c.lineTo(x-4,z+3);c.closePath();c.fill();
    }
  }
}
