export const TYPES = {
  carrier: {name:'Carrier',hp:2600,speed:3.8,range:44,damage:22,cooldown:1.2,cost:0,build:0,size:12,cap:0},
  interceptor: {name:'Interceptor',hp:110,speed:23,range:24,damage:10,cooldown:.75,cost:140,build:8,size:2.8,cap:1},
  corvette: {name:'Corvette',hp:330,speed:13,range:31,damage:29,cooldown:1.15,cost:290,build:13,size:4.8,cap:2},
  frigate: {name:'Ion frigate',hp:760,speed:8,range:47,damage:70,cooldown:2.4,cost:580,build:21,size:7.5,cap:4},
  collector: {name:'Collector',hp:190,speed:12,range:0,damage:0,cooldown:1,cost:220,build:10,size:3.8,cap:1}
};
export const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class FleetGame {
  constructor(seed=47){this.seed=seed;this.reset();}
  random(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
  reset(){
    this.seed=47;this.units=[];this.rocks=[];this.events=[];this.queue=[];this.time=0;this.resources=900;this.kills=0;this.mined=0;this.paused=true;this.started=false;this.result=null;this.nextId=1;this.aiClock=44;this.aiBuild=35;this.formation='delta';this.stance='defensive';
    this.spawn('carrier',0,{x:-58,y:0,z:25},'Asterion');
    this.spawn('carrier',1,{x:91,y:9,z:-74},'Revenant');
    for(let i=0;i<5;i++)this.spawn('interceptor',0,{x:-34+i*5,y:4+(i%2)*3,z:7+(i%2)*5});
    for(let i=0;i<2;i++)this.spawn('corvette',0,{x:-48+i*9,y:0,z:1});
    this.spawn('frigate',0,{x:-43,y:1,z:20});
    for(let i=0;i<2;i++)this.spawn('collector',0,{x:-66-i*7,y:0,z:6});
    for(let i=0;i<5;i++)this.spawn('interceptor',1,{x:64+i*5,y:7+(i%2)*4,z:-49-(i%2)*7});
    this.spawn('corvette',1,{x:68,y:5,z:-71});this.spawn('corvette',1,{x:80,y:5,z:-62});
    this.spawn('frigate',1,{x:95,y:12,z:-49});
    const clusters=[{x:-66,y:0,z:-32},{x:1,y:7,z:-3},{x:45,y:-10,z:48},{x:98,y:9,z:-105}];
    clusters.forEach((p,j)=>{for(let i=0;i<8;i++)this.rocks.push({id:'r'+j+'-'+i,x:p.x+(this.random()-.5)*30,y:p.y+(this.random()-.5)*13,z:p.z+(this.random()-.5)*24,size:2+this.random()*4,amount:250+Math.floor(this.random()*400),rotation:this.random()*6});});
    this.log('Fleet command online. Awaiting your orders.','info');
  }
  spawn(type,team,p,name){const t=TYPES[type];const u={id:this.nextId++,type,team,x:p.x,y:p.y,z:p.z,hp:t.hp,maxHp:t.hp,name:name||t.name+' '+String(this.nextId-1).padStart(2,'0'),order:null,target:null,cooldown:0,cargo:0,heading:team===0?Math.PI:0,stance:this.stance,alive:true,flash:0};this.units.push(u);return u;}
  get(id){return this.units.find(u=>u.id===id&&u.alive);}
  carrier(team=0){return this.units.find(u=>u.type==='carrier'&&u.team===team&&u.alive);}
  alive(team){return this.units.filter(u=>u.alive&&(team===undefined||u.team===team));}
  capacity(){return this.alive(0).reduce((s,u)=>s+TYPES[u.type].cap,0)+this.queue.reduce((s,q)=>s+TYPES[q.type].cap,0);}
  log(message,kind='info'){this.events.push({kind,message,time:this.time});if(this.events.length>100)this.events.shift();}
  start(){this.started=true;this.paused=false;this.log('Operation Silent Reach is underway.','info');}
  build(type){
    if(!TYPES[type]||type==='carrier')return {ok:false,reason:'Unknown ship class'};
    if(this.result||!this.carrier())return {ok:false,reason:'Carrier unavailable'};
    const t=TYPES[type];if(this.resources<t.cost)return {ok:false,reason:'Insufficient resources'};
    if(this.capacity()+t.cap>44)return {ok:false,reason:'Fleet capacity reached'};
    if(this.queue.length>=5)return {ok:false,reason:'Build queue is full'};
    this.resources-=t.cost;this.queue.push({type,remaining:t.build,total:t.build});this.log(t.name+' queued for construction.');return {ok:true};
  }
  cancelBuild(index){const q=this.queue[index];if(!q)return false;this.resources+=TYPES[q.type].cost;this.queue.splice(index,1);this.log('Construction cancelled. Resources refunded.');return true;}
  command(ids,kind,data={}){
    if(this.result)return false;
    const units=ids.map(id=>this.get(id)).filter(u=>u?.team===0);
    if(!units.length)return false;
    if(kind==='attack'&&(!this.get(data.targetId)||this.get(data.targetId).team!==1))return false;
    if(kind==='harvest'&&!this.rocks.some(r=>r.id===data.rockId&&r.amount>0))return false;
    if(kind==='move'&&![data.x,data.y,data.z].every(Number.isFinite))return false;
    const spacing=7,cols=Math.ceil(Math.sqrt(units.length));
    units.forEach((u,i)=>{
      u.target=null;
      if(kind==='stop'){u.order=null;return;}
      if(kind==='harvest'){if(u.type==='collector')u.order={kind,rockId:data.rockId,phase:'gather'};return;}
      if(kind==='attack'){if(u.type!=='collector')u.order={kind,targetId:data.targetId};return;}
      if(kind==='move'){
        let ox=0,oz=0;
        if(units.length>1){
          if(this.formation==='delta'){ox=(i%cols-(cols-1)/2)*spacing;oz=Math.floor(i/cols)*spacing;}
          else if(this.formation==='wall'){ox=(i-(units.length-1)/2)*spacing;}
          else{ox=(i-(units.length-1)/2)*4;oz=(i-(units.length-1)/2)*spacing;}
        }
        u.order={kind,x:clamp(data.x+ox,-150,150),y:clamp(data.y,-35,45),z:clamp(data.z+oz,-150,150)};
      }
    });return true;
  }
  harvestAll(){const collectors=this.alive(0).filter(u=>u.type==='collector');for(const u of collectors){const r=this.nearestRock(u);if(r)this.command([u.id],'harvest',{rockId:r.id});}return collectors.length;}
  nearestRock(u){return this.rocks.filter(r=>r.amount>0).sort((a,b)=>distance(u,a)-distance(u,b))[0];}
  travel(u,p,dt,stop=1){const dx=p.x-u.x,dy=p.y-u.y,dz=p.z-u.z,d=Math.hypot(dx,dy,dz);if(d<=stop)return true;const step=Math.min(TYPES[u.type].speed*dt,d-stop);u.x+=dx/d*step;u.y+=dy/d*step;u.z+=dz/d*step;u.heading=Math.atan2(dx,dz);return d-step<=stop+.01;}
  step(dt){
    if(this.paused||this.result||!this.started)return;
    dt=clamp(dt,0,.1);this.time+=dt;
    if(this.queue.length){const q=this.queue[0];q.remaining-=dt;if(q.remaining<=0){const c=this.carrier();if(c){const u=this.spawn(q.type,0,{x:c.x+6,y:c.y,z:c.z-12});this.log(TYPES[q.type].name+' ready.','build');if(q.type==='collector'){const r=this.nearestRock(u);if(r)u.order={kind:'harvest',rockId:r.id,phase:'gather'};}}this.queue.shift();}}
    this.aiClock-=dt;this.aiBuild-=dt;
    if(this.aiClock<=0){this.aiClock=30;const c=this.carrier();if(c){for(const u of this.alive(1).filter(u=>u.type!=='carrier')){const enemies=this.alive(0).filter(v=>v.type!=='collector');const near=enemies.sort((a,b)=>distance(u,a)-distance(u,b))[0];u.order={kind:'attack',targetId:(near||c).id};}this.log('Hostile strike group on approach.','warning');}}
    if(this.aiBuild<=0&&this.carrier(1)){this.aiBuild=28;const c=this.carrier(1);if(this.alive(1).length<20){const type=this.time>150?'frigate':this.time>80?'corvette':'interceptor';const u=this.spawn(type,1,{x:c.x-5,y:c.y,z:c.z+10});if(this.time>44&&this.carrier())u.order={kind:'attack',targetId:this.carrier().id};}}
    for(const u of this.alive()){
      if(!u.alive)continue;
      u.cooldown-=dt;u.flash=Math.max(0,u.flash-dt);const t=TYPES[u.type];
      if(u.type==='collector'){
        if(u.order?.kind==='move'){if(this.travel(u,u.order,dt))u.order=null;}
        if(u.order?.kind==='harvest'){
          let rock=this.rocks.find(r=>r.id===u.order.rockId);
          if(!rock||rock.amount<=0){rock=this.nearestRock(u);if(rock)u.order.rockId=rock.id;else if(u.cargo===0){u.order=null;continue;}else u.order.phase='return';}
          const c=this.carrier(u.team);if(!c)continue;
          if(u.order.phase==='return'){
            if(this.travel(u,c,dt,14)){if(u.team===0){this.resources+=u.cargo;this.mined+=u.cargo;}u.cargo=0;u.order.phase='gather';this.events.push({kind:'deposit',unitId:u.id});}
          }else if(rock&&this.travel(u,rock,dt,rock.size+3)){
            const gathered=Math.min(30*dt,rock.amount,100-u.cargo);u.cargo+=gathered;rock.amount-=gathered;if(u.cargo>=99.9||rock.amount<=0)u.order.phase='return';
          }
        }continue;
      }
      if(u.order?.kind==='attack'&&!this.get(u.order.targetId))u.order=null;
      let target=u.order?.kind==='attack'?this.get(u.order.targetId):null;
      if(!target&&(u.stance!=='passive'||u.team===1)){
        const radius=u.stance==='aggressive'?t.range*1.8:t.range;
        target=this.alive(1-u.team).filter(e=>distance(u,e)<radius).sort((a,b)=>distance(u,a)-distance(u,b))[0]||null;
      }
      u.target=target?.id||null;
      if(u.order?.kind==='move'){if(this.travel(u,u.order,dt))u.order=null;}
      else if(target&&distance(u,target)>t.range*.85&&(u.order?.kind==='attack'||u.stance==='aggressive'||u.team===1))this.travel(u,target,dt,t.range*.8);
      if(target&&distance(u,target)<=t.range&&u.cooldown<=0){
        u.cooldown=t.cooldown;u.heading=Math.atan2(target.x-u.x,target.z-u.z);target.hp-=t.damage;target.flash=.16;
        this.events.push({kind:'shot',from:u.id,to:target.id,type:u.type,team:u.team,x1:u.x,y1:u.y,z1:u.z,x2:target.x,y2:target.y,z2:target.z});
        if(target.hp<=0){target.alive=false;if(target.team===1){this.kills++;this.resources+=target.type==='carrier'?0:Math.round(TYPES[target.type].cost*.12);}this.events.push({kind:'destroy',id:target.id,x:target.x,y:target.y,z:target.z,type:target.type});this.log(target.name+' destroyed.',target.team===0?'warning':'combat');}
      }
    }
    // A soft separation force keeps formations readable without changing their orders.
    const live=this.alive();for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
      const a=live[i],b=live[j];if(a.type==='carrier'&&b.type==='carrier')continue;const min=(TYPES[a.type].size+TYPES[b.type].size)*.6,d=distance(a,b);
      if(d<min&&d>.001){const force=(min-d)*dt*1.7,dx=(a.x-b.x)/d,dz=(a.z-b.z)/d;if(a.type!=='carrier'){a.x+=dx*force;a.z+=dz*force;}if(b.type!=='carrier'){b.x-=dx*force;b.z-=dz*force;}}
    }
    if(!this.carrier()){this.result='defeat';this.log('Asterion lost. Fleet command terminated.','warning');}
    else if(!this.carrier(1)){this.result='victory';this.log('Enemy carrier destroyed. Sector secured.','info');}
  }
  snapshot(){return {time:Math.round(this.time),paused:this.paused,result:this.result,resources:Math.floor(this.resources),capacity:this.capacity(),queue:this.queue.map(q=>({type:q.type,remaining:Math.ceil(q.remaining)})),units:this.alive().map(u=>({id:u.id,type:u.type,team:u.team,hp:Math.round(u.hp),x:Math.round(u.x),y:Math.round(u.y),z:Math.round(u.z),order:u.order?.kind||'idle'}))};}
}
