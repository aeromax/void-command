import * as THREE from './vendor/three.module.js';
import {FleetGame,TYPES,distance} from './simulation.js';

const $=id=>document.getElementById(id), game=new FleetGame();
const selected=new Set(), shipObjects=new Map(), rockObjects=new Map(), effects=[];
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('space'),antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){$('render-error').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor(0x080e19);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,2500);
const compact=innerWidth<800;
const cam={focus:compact?new THREE.Vector3(-42,0,7):new THREE.Vector3(8,0,-14),target:compact?new THREE.Vector3(-42,0,7):new THREE.Vector3(8,0,-14),distance:compact?185:225,yaw:.35,pitch:.60,sensor:false};
let mode=null,hover=null,notificationTimer=0,lastLog='',lastUI=0,ended=false,soundEnabled=false,audioCtx=null;
const keys=new Set(), raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const overlay=$('overlay'),ctx=overlay.getContext('2d'), map=$('minimap'),mapCtx=map.getContext('2d');
let width=innerWidth,height=innerHeight,now=0,eventCursor=0;
const color={ally:0x72dcea,enemy:0xef7869,amber:0xeeb75a};
const materials={hull:new THREE.MeshStandardMaterial({color:0x698293,metalness:.72,roughness:.43}),light:new THREE.MeshStandardMaterial({color:0xa3b4bd,metalness:.58,roughness:.4}),dark:new THREE.MeshStandardMaterial({color:0x1b293a,metalness:.75,roughness:.47}),ally:new THREE.MeshStandardMaterial({color:0xd8a44a,metalness:.3,roughness:.46}),enemy:new THREE.MeshStandardMaterial({color:0xa9463e,metalness:.35,roughness:.48}),glass:new THREE.MeshStandardMaterial({color:0x182f3c,metalness:.6,roughness:.2,emissive:0x103c52,emissiveIntensity:.5}),engine:new THREE.MeshBasicMaterial({color:0x81e1ff}),engineEnemy:new THREE.MeshBasicMaterial({color:0xff9a6f})};
scene.add(new THREE.HemisphereLight(0xacc5e6,0x111322,2.1));
const sun=new THREE.DirectionalLight(0xffd7a2,3.1);sun.position.set(-80,60,80);scene.add(sun);
const rim=new THREE.DirectionalLight(0x6893e9,2.6);rim.position.set(30,10,-80);scene.add(rim);

// Procedural sky and planets are part of the game world and need no remote assets.
const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec3 vDirection;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=a*noise(p);p=p*2.01+7.;a*=.5;}return f;}
void main(){vec3 d=normalize(vDirection);float n=fbm(d*5.+vec3(2,7,1));float band=pow(max(0.,1.-abs(d.y*.85+d.x*.24+.15)),5.);float cloud=smoothstep(.36,.72,n)*band;vec3 col=vec3(.014,.025,.045);col+=vec3(.035,.064,.099)*cloud;float warmth=smoothstep(-.1,.9,d.x)*cloud;col+=vec3(.074,.027,.015)*warmth;float dust=fbm(d*20.)*cloud;col+=vec3(.020,.024,.032)*dust;gl_FragColor=vec4(col,1.);}`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(950,32,20),skyMaterial);scene.add(sky);
const starPositions=[],starColors=[];
for(let i=0;i<2400;i++){const p=new THREE.Vector3((game.random()-.5)*2,(game.random()-.5)*2,(game.random()-.5)*2).normalize().multiplyScalar(650+game.random()*250);starPositions.push(p.x,p.y,p.z);const c=new THREE.Color().setHSL(.53+game.random()*.12,.1+game.random()*.4,.45+game.random()*.4);starColors.push(c.r,c.g,c.b);}
const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));starGeo.setAttribute('color',new THREE.Float32BufferAttribute(starColors,3));
scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({size:1.1,vertexColors:true,transparent:true,opacity:.8,sizeAttenuation:true,depthWrite:false})));
const planetMat=new THREE.MeshStandardMaterial({color:0x293b54,roughness:1,metalness:0});
const planet=new THREE.Mesh(new THREE.SphereGeometry(79,64,48),planetMat);planet.position.set(165,-92,-270);scene.add(planet);
const atmo=new THREE.Mesh(new THREE.SphereGeometry(80.5,48,32),new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,depthWrite:false,vertexShader:`varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,fragmentShader:`varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(n,v)),4.);gl_FragColor=vec4(.16,.36,.61,f*.6);}`}));atmo.position.copy(planet.position);scene.add(atmo);
const grid=new THREE.GridHelper(320,32,0x3d7998,0x1b3549);grid.position.y=-14;grid.material.transparent=true;grid.material.opacity=.055;scene.add(grid);
const sectorRing=new THREE.Mesh(new THREE.RingGeometry(123,123.2,128),new THREE.MeshBasicMaterial({color:0x396884,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}));sectorRing.rotation.x=-Math.PI/2;sectorRing.position.y=-13.9;scene.add(sectorRing);

function part(group,geometry,material,p=[0,0,0],r=[0,0,0]){const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.rotation.set(...r);group.add(m);return m;}
const box=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
function engine(group,x,y,z,large=false,team=0){
  part(group,new THREE.CylinderGeometry(large?.9:.3,large?1.1:.4,large?1.1:.5,10),materials.dark,[x,y,z],[Math.PI/2,0,0]);
  part(group,new THREE.CircleGeometry(large?.75:.26,12),team?materials.engineEnemy:materials.engine,[x,y,z-.65],[0,Math.PI,0]);
  const flame=part(group,new THREE.ConeGeometry(large?.9:.32,large?5.2:2.5,10,1,true),new THREE.MeshBasicMaterial({color:team?0xf2945d:0x5dccfc,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide}),[x,y,z-(large?3:1.7)],[Math.PI/2,0,0]);
  group.userData.flames.push(flame);
}
function makeShip(u){
  const g=new THREE.Group();g.userData.id=u.id;g.userData.flames=[];g.userData.baseScale=1;
  const accent=u.team?materials.enemy:materials.ally;
  if(u.type==='interceptor'){
    part(g,new THREE.ConeGeometry(.75,4.3,4),materials.hull,[0,0,.5],[Math.PI/2,0,Math.PI/4]);
    part(g,box(.65,.4,1.2),materials.glass,[0,.35,.5]);
    for(const s of [-1,1]){part(g,box(2.4,.15,1.5),materials.hull,[s*1.35,-.1,-.65],[0,s*-.3,0]);part(g,box(.35,.2,1.5),accent,[s*1.9,0,-.55]);part(g,box(.2,.25,2),materials.dark,[s*2.35,0,-.3]);engine(g,s*.55,0,-1.4,false,u.team);}
  }else if(u.type==='corvette'){
    part(g,box(2.1,1.2,5.6),materials.hull);part(g,new THREE.ConeGeometry(1.5,2,4),materials.light,[0,0,3.4],[Math.PI/2,0,Math.PI/4]);
    part(g,box(1.5,.5,1.8),materials.glass,[0,.7,1]);
    for(const s of [-1,1]){part(g,box(1.2,1.3,3.8),materials.dark,[s*1.8,0,-.5]);part(g,box(1.23,.4,1.7),accent,[s*1.8,.25,.3]);part(g,box(.3,.3,2.5),materials.light,[s*2.4,.4,1.5]);engine(g,s*1.8,0,-2.6,true,u.team);}
    part(g,box(1,.3,.7),accent,[0,.67,-1.2]);
  }else if(u.type==='frigate'){
    part(g,box(3,2.3,9),materials.hull);part(g,box(2.2,1.7,3),materials.light,[0,0,5.2]);
    part(g,box(1.8,.9,3),materials.dark,[0,1.45,-1]);part(g,box(1.85,.22,1.8),materials.glass,[0,1.9,-.5]);
    part(g,new THREE.CylinderGeometry(.35,.65,4.2,8),accent,[0,.3,6],[Math.PI/2,0,0]);
    for(const s of [-1,1]){part(g,box(1.6,1.6,5.5),materials.dark,[s*2.1,-.2,-1]);part(g,box(1.65,.45,2.8),accent,[s*2.1,.1,.1]);part(g,box(.3,1.3,1.6),materials.light,[s*3,0,-2.7]);engine(g,s*2.1,-.2,-4,true,u.team);}
    engine(g,0,0,-5.1,true,u.team);
  }else if(u.type==='collector'){
    part(g,box(2.5,1.8,3.8),materials.light);part(g,box(2.55,.7,1.5),accent,[0,.5,0]);part(g,box(1.7,.7,1.5),materials.glass,[0,1.12,.5]);
    for(const s of [-1,1]){part(g,box(1,1.5,3.6),materials.dark,[s*1.9,-.6,-.3]);part(g,box(.3,.3,3.3),materials.hull,[s*2.1,0,2]);part(g,box(.3,1.2,.3),accent,[s*2.1,.25,3.5]);engine(g,s*1.6,-.25,-2.4,false,u.team);}
  }else{
    // A vertical, split-spine carrier with a recessed flight deck.
    part(g,box(5.5,13,12),materials.hull,[0,4,0]);part(g,box(4.5,5,16),materials.dark,[0,-4,-1]);
    part(g,box(4.6,4,8),materials.light,[0,12,-2]);part(g,box(4.65,.5,3),materials.glass,[0,14.2,-.1]);
    for(const s of [-1,1]){part(g,box(2.5,12,12),materials.light,[s*4.1,2,-1]);part(g,box(2.55,2.4,7),accent,[s*4.1,3,1]);part(g,box(3,3,10),materials.dark,[s*4.1,-5,-1.5]);part(g,box(.6,8,8),materials.hull,[s*5.8,2,-1]);engine(g,s*3.2,-4,-7.2,true,u.team);engine(g,s*3.2,4,-7.2,true,u.team);}
    part(g,box(3.9,.5,7),materials.dark,[0,-3,8]);part(g,box(3.3,.15,5.5),materials.glass,[0,-2.72,8]);
    part(g,box(1.2,4,2),accent,[0,9,6.5]);part(g,box(.3,5,.3),materials.light,[2.4,16,-3]);
    for(let i=0;i<5;i++)part(g,box(.28,.12,1.5),materials.engine,[-1.2+i*.6,-2.57,9]);
  }
  const radius=TYPES[u.type].size*(u.type==='carrier'?.85:1);
  const ring=new THREE.Mesh(new THREE.RingGeometry(radius,radius+.16,48),new THREE.MeshBasicMaterial({color:u.team?color.enemy:color.ally,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=u.type==='carrier'?-8:-1.5;ring.visible=false;g.add(ring);g.userData.ring=ring;
  scene.add(g);shipObjects.set(u.id,g);return g;
}
function makeRock(r){
  const geom=new THREE.IcosahedronGeometry(r.size,1),a=geom.attributes.position;
  for(let i=0;i<a.count;i++){const k=.82+Math.sin(i*8.33+r.rotation)*.18;a.setXYZ(i,a.getX(i)*k,a.getY(i)*k,a.getZ(i)*k);}geom.computeVertexNormals();
  const m=new THREE.Mesh(geom,new THREE.MeshStandardMaterial({color:0x554d43,roughness:.95,metalness:.18,flatShading:true}));m.position.set(r.x,r.y,r.z);m.rotation.set(r.rotation,r.rotation*.5,r.rotation*.3);scene.add(m);rockObjects.set(r.id,m);
}
function disposeTree(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&!Object.values(materials).includes(o.material)){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});scene.remove(g);}
function syncObjects(){
  for(const u of game.alive()){
    const g=shipObjects.get(u.id)||makeShip(u);g.position.set(u.x,u.y,u.z);g.rotation.y=u.heading;g.userData.ring.visible=selected.has(u.id)||hover?.id===u.id||cam.sensor&&u.team===1;g.userData.ring.material.opacity=selected.has(u.id)?.9:.35;
    g.userData.flames.forEach((f,i)=>{f.scale.y=.75+.15*Math.sin(now*17+i)+((u.order&&u.type!=='carrier')?.45:0);});
  }
  for(const [id,g]of shipObjects)if(!game.get(id)){disposeTree(g);shipObjects.delete(id);selected.delete(id);}
  for(const r of game.rocks){const m=rockObjects.get(r.id);if(!m)makeRock(r);else{m.visible=r.amount>0;m.rotation.y+=.0003;}}
}
function refreshWorld(){for(const g of shipObjects.values())disposeTree(g);shipObjects.clear();for(const m of rockObjects.values())disposeTree(m);rockObjects.clear();for(const e of effects)disposeTree(e.mesh);effects.length=0;eventCursor=0;syncObjects();}

function sound(kind){
  if(!soundEnabled)return;try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.connect(gain);gain.connect(audioCtx.destination);const t=audioCtx.currentTime;const freq={select:620,order:340,build:880,shot:140,destroy:45,warning:190}[kind]||400;osc.type=kind==='destroy'?'sawtooth':'sine';osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq*.5),t+.13);gain.gain.setValueAtTime(kind==='shot'?.018:.06,t);gain.gain.exponentialRampToValueAtTime(.001,t+.16);osc.start(t);osc.stop(t+.18);}catch{soundEnabled=false;}
}
function shot(e){
  const p1=new THREE.Vector3(e.x1,e.y1+.5,e.z1),p2=new THREE.Vector3(e.x2,e.y2+.5,e.z2);
  if(e.type==='frigate'){
    const d=p2.clone().sub(p1),m=new THREE.Mesh(new THREE.CylinderGeometry(.13,.25,d.length(),8),new THREE.MeshBasicMaterial({color:e.team?0xff8268:0xa1eaff,transparent:true,opacity:.85,depthWrite:false}));m.position.copy(p1.clone().add(p2).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());scene.add(m);effects.push({mesh:m,life:.32,total:.32});
  }else{
    const geo=new THREE.BufferGeometry().setFromPoints([p1,p2]);const m=new THREE.Line(geo,new THREE.LineBasicMaterial({color:e.team?0xff8d69:0x8ee2ff,transparent:true,opacity:.8,depthWrite:false}));scene.add(m);effects.push({mesh:m,life:.16,total:.16});
  }
  if(Math.random()<.2)sound('shot');
}
function explosion(e){
  const m=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshBasicMaterial({color:0xffb55c,transparent:true,opacity:.9,depthWrite:false}));m.position.set(e.x,e.y,e.z);scene.add(m);effects.push({mesh:m,life:.9,total:.9,explode:true,size:TYPES[e.type].size});
  const positions=[];for(let i=0;i<24;i++)positions.push((Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const sparks=new THREE.Points(geo,new THREE.PointsMaterial({color:0xffcd8a,size:.5,transparent:true,opacity:1,depthWrite:false}));sparks.position.copy(m.position);scene.add(sparks);effects.push({mesh:sparks,life:1.5,total:1.5,explode:true,size:TYPES[e.type].size*3});sound('destroy');
}
function processEvents(){
  // Consume then clear the transient queue; text logs stay in a separate display history.
  const events=game.events.splice(0);
  for(const e of events){if(e.kind==='shot')shot(e);else if(e.kind==='destroy')explosion(e);else if(e.message){if(e.kind==='warning')notify(e.message,true);else if(e.kind==='build'){notify(e.message);sound('build');}lastLog=e.message;}}
}
function notify(text,warn=false){$('notification').textContent=text;$('notification').className='visible'+(warn?' warning':'');clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>$('notification').className='',3500);if(warn)sound('warning');}
function project(p){return new THREE.Vector3(p.x,p.y,p.z).project(camera);}
function screen(p){const v=project(p);return {x:(v.x+1)/2*width,y:(1-v.y)/2*height,z:v.z};}
function pick(x,y){
  let found=null,best=Infinity;
  for(const u of game.alive()){const p=screen(u);if(p.z>1||p.z<0)continue;const rr=Math.max(15,Math.min(35,TYPES[u.type].size*500/camera.position.distanceTo(new THREE.Vector3(u.x,u.y,u.z))));const d=Math.hypot(p.x-x,p.y-y);if(d<rr&&d<best){found={kind:'ship',id:u.id,unit:u};best=d;}}
  if(found)return found;
  for(const r of game.rocks){if(r.amount<=0)continue;const p=screen(r),d=Math.hypot(p.x-x,p.y-y);if(p.z<1&&p.z>0&&d<Math.max(13,r.size*450/camera.position.distanceTo(new THREE.Vector3(r.x,r.y,r.z)))&&d<best){found={kind:'rock',id:r.id,rock:r};best=d;}}
  return found;
}
function worldPoint(x,y){pointer.set(x/width*2-1,-y/height*2+1);raycaster.setFromCamera(pointer,camera);let altitude=Number($('altitude').value)||0;altitude=Math.max(-35,Math.min(45,altitude));plane.constant=-altitude;return raycaster.ray.intersectPlane(plane,new THREE.Vector3());}
function select(ids,add=false){if(!add)selected.clear();ids.forEach(id=>{if(game.get(id)?.team===0)selected.add(id);});sound('select');mode=null;updateUI();}
function focusSelection(){const units=[...selected].map(id=>game.get(id)).filter(Boolean);if(!units.length){const c=game.carrier();if(c)cam.target.set(c.x,c.y,c.z);}else{cam.target.set(0,0,0);units.forEach(u=>cam.target.add(new THREE.Vector3(u.x,u.y,u.z)));cam.target.multiplyScalar(1/units.length);} }
function setMode(m){if(!selected.size){notify('Select one or more ships first.');return;}if(m==='stop'){game.command([...selected],'stop');notify('Selected ships holding position.');mode=null;}else if(m==='harvest'){
  const collectors=[...selected].map(id=>game.get(id)).filter(u=>u?.type==='collector');if(!collectors.length){notify('Select resource collectors to mine asteroids.');return;}mode='harvest';
}else mode=mode===m?null:m;updateUI();}
function orderAt(x,y,explicit=false){
  if(!selected.size){notify('Select your ships before issuing an order.');return;}
  const hit=pick(x,y),ids=[...selected];
  if(hit?.kind==='ship'&&hit.unit.team===1&&(mode!=='move'&&mode!=='harvest')){
    if(game.command(ids,'attack',{targetId:hit.id})){notify('Attack order · '+hit.unit.name);sound('order');}
  }else if(hit?.kind==='rock'&&mode!=='move'&&mode!=='attack'){
    if(!ids.some(id=>game.get(id)?.type==='collector')){notify('Resource collectors are required to mine.');return;}
    game.command(ids,'harvest',{rockId:hit.id});notify('Collectors assigned to asteroid field.');sound('order');
  }else if(mode==='attack'){notify('Choose a hostile ship to attack.');return;}
  else if(mode==='harvest'){notify('Choose an asteroid to mine.');return;}
  else{
    const p=worldPoint(x,y);if(!p)return;game.command(ids,'move',{x:p.x,y:p.y,z:p.z});waypoint(p);sound('order');notify('Move order confirmed · altitude '+Math.round(p.y));
  }
  mode=null;updateUI();
}
function waypoint(p){const m=new THREE.Mesh(new THREE.RingGeometry(2.5,2.7,32),new THREE.MeshBasicMaterial({color:color.ally,transparent:true,opacity:1,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.copy(p);scene.add(m);effects.push({mesh:m,life:1.5,total:1.5,waypoint:true});}
let drag=null;
const touches=new Map();
$('space').addEventListener('pointerdown',e=>{
  if(!game.started||ended)return;e.preventDefault();$('space').focus({preventScroll:true});$('space').setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touches.size===2){const a=[...touches.values()];drag={kind:'pinch',distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),startDistance:cam.distance,centerX:(a[0].x+a[1].x)/2,centerY:(a[0].y+a[1].y)/2};return;}
  drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,button:e.button,kind:e.altKey||e.button===2?'orbit':e.button===1?'pan':'select',shift:e.shiftKey,moved:false,pointerId:e.pointerId};
});
$('space').addEventListener('pointermove',e=>{
  touches.has(e.pointerId)&&touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(drag?.kind==='pinch'&&touches.size===2){const a=[...touches.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2;cam.distance=Math.max(45,Math.min(330,drag.startDistance*drag.distance/Math.max(1,d)));const right=new THREE.Vector3(Math.cos(cam.yaw),0,-Math.sin(cam.yaw)),forward=new THREE.Vector3(Math.sin(cam.yaw),0,Math.cos(cam.yaw));cam.target.addScaledVector(right,-(cx-drag.centerX)*cam.distance*.002).addScaledVector(forward,-(cy-drag.centerY)*cam.distance*.002);drag.centerX=cx;drag.centerY=cy;return;}
  if(drag){const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;drag.moved ||= Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5;
    if(drag.kind==='orbit'&&drag.moved){cam.yaw-=dx*.006;cam.pitch=Math.max(.15,Math.min(1.4,cam.pitch+dy*.005));}
    else if(drag.kind==='pan'&&drag.moved){const right=new THREE.Vector3(Math.cos(cam.yaw),0,-Math.sin(cam.yaw)),forward=new THREE.Vector3(Math.sin(cam.yaw),0,Math.cos(cam.yaw));cam.target.addScaledVector(right,-dx*cam.distance*.0015).addScaledVector(forward,-dy*cam.distance*.0015);}
    else if(drag.kind==='select'&&drag.moved){const s=$('selection-box');s.style.display='block';s.style.left=Math.min(drag.x,e.clientX)+'px';s.style.top=Math.min(drag.y,e.clientY)+'px';s.style.width=Math.abs(drag.x-e.clientX)+'px';s.style.height=Math.abs(drag.y-e.clientY)+'px';}
    drag.lastX=e.clientX;drag.lastY=e.clientY;
  }else{hover=pick(e.clientX,e.clientY);$('space').style.cursor=mode?'crosshair':hover?.kind==='ship'&&hover.unit.team===0?'pointer':hover?.kind==='ship'?'crosshair':'default';}
});
$('space').addEventListener('pointerup',e=>{
  touches.delete(e.pointerId);if(!drag)return;const d=drag;drag=null;$('selection-box').style.display='none';if(d.kind==='pinch')return;
  if(!d.moved){if(d.button===2||mode)orderAt(e.clientX,e.clientY,true);else{const hit=pick(e.clientX,e.clientY);if(hit?.kind==='ship'&&hit.unit.team===0){if(d.shift&&selected.has(hit.id)){selected.delete(hit.id);updateUI();}else select([hit.id],d.shift);}else if(hit?.kind==='ship'&&hit.unit.team===1&&selected.size)orderAt(e.clientX,e.clientY);else if(!d.shift){selected.clear();updateUI();}}}
  else if(d.kind==='select'){const x0=Math.min(d.x,e.clientX),x1=Math.max(d.x,e.clientX),y0=Math.min(d.y,e.clientY),y1=Math.max(d.y,e.clientY);const ids=game.alive(0).filter(u=>{const p=screen(u);return p.z>0&&p.z<1&&p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1;}).map(u=>u.id);select(ids,d.shift);}
});
$('space').addEventListener('pointercancel',e=>{touches.delete(e.pointerId);drag=null;$('selection-box').style.display='none';});
$('space').addEventListener('contextmenu',e=>e.preventDefault());
$('space').addEventListener('dblclick',e=>{const hit=pick(e.clientX,e.clientY);if(hit?.kind==='ship')cam.target.set(hit.unit.x,hit.unit.y,hit.unit.z);});
$('space').addEventListener('wheel',e=>{e.preventDefault();cam.distance=Math.max(45,Math.min(330,cam.distance*Math.exp(e.deltaY*.001)));},{passive:false});
window.addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||$('help-dialog').open)return;
  const k=e.key.toLowerCase();if(k===' '||(e.ctrlKey||e.metaKey)&&k==='a'){e.preventDefault();}
  if((e.ctrlKey||e.metaKey)&&k==='a'){select(game.alive(0).filter(u=>u.type!=='collector'&&u.type!=='carrier').map(u=>u.id));return;}
  if(k==='p')togglePause();else if(k===' ')toggleSensors();else if(k==='f')focusSelection();else if(k==='m')setMode('move');else if(k==='a'&&!e.shiftKey)setMode('attack');else if(k==='h')setMode('harvest');else if(k==='s'&&!e.shiftKey)setMode('stop');else if(k==='?'||k==='/')showHelp();else if(k==='escape'){mode=null;selected.clear();updateUI();}
  if(!e.repeat)keys.add(k);
});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();if(game.started&&!game.paused&&!game.result){game.paused=true;updateUI();}});

function togglePause(){if(!game.started||ended)return;game.paused=!game.paused;updateUI();}
function toggleSensors(){cam.sensor=!cam.sensor;document.body.classList.toggle('sensor-mode',cam.sensor);$('sensors').classList.toggle('active',cam.sensor);grid.material.opacity=cam.sensor?.25:.055;sectorRing.material.opacity=cam.sensor?.55:.22;updateUI();}
let helpWasPaused=true;
function showHelp(){helpWasPaused=game.paused;if(game.started)game.paused=true;$('help-dialog').showModal();updateUI();}
$('help-dialog').addEventListener('close',()=>{if(game.started&&!game.result)game.paused=helpWasPaused;updateUI();});
document.querySelectorAll('.dialog-close,.dialog-close-button').forEach(b=>b.onclick=()=>$('help-dialog').close());
$('help-button').onclick=showHelp;$('pause-button').onclick=togglePause;$('resume-button').onclick=togglePause;
$('sensors').onclick=toggleSensors;$('zoom-in').onclick=()=>cam.distance=Math.max(45,cam.distance*.85);$('zoom-out').onclick=()=>cam.distance=Math.min(330,cam.distance*1.15);
$('audio-button').onclick=()=>{soundEnabled=!soundEnabled;$('audio-button').style.color=soundEnabled?'var(--amber)':'';$('audio-button').setAttribute('aria-label',soundEnabled?'Mute sound':'Enable sound');$('audio-button').title=soundEnabled?'Mute sound':'Enable sound';$('audio-button').innerHTML=soundEnabled?'<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8"/></svg>':'<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l4 6m0-6l-4 6"/></svg>';sound('select');};
$('start-button').onclick=()=>{game.start();$('briefing').hidden=true;select(game.alive(0).filter(u=>u.type==='interceptor').map(u=>u.id));game.harvestAll();notify('Fleet deployed. Collectors are mining the nearest field.');updateUI();};
function restart(){game.reset();selected.clear();mode=null;ended=false;const small=innerWidth<800;cam.target.set(small?-42:8,0,small?7:-14);cam.distance=small?185:225;cam.yaw=.35;cam.pitch=.6;$('result-overlay').hidden=true;$('briefing').hidden=false;$('pause-overlay').hidden=true;refreshWorld();updateUI();}
$('restart-button').onclick=restart;$('play-again').onclick=restart;
$('focus-carrier').onclick=()=>{const c=game.carrier();if(c){cam.target.set(c.x,c.y,c.z);select([c.id]);}};
$('select-all').onclick=()=>select(game.alive(0).filter(u=>u.type!=='carrier'&&u.type!=='collector').map(u=>u.id));
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>setMode(b.dataset.command));
document.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>{const r=game.build(b.dataset.build);notify(r.ok?TYPES[b.dataset.build].name+' added to build queue.':r.reason,!r.ok);updateUI();});
$('auto-mine').onclick=()=>{const n=game.harvestAll();notify(n?n+' collectors assigned to nearest asteroid fields.':'Build a collector to start mining.');updateUI();};
$('formation').onchange=e=>{game.formation=e.target.value;notify(e.target.options[e.target.selectedIndex].text+' formation selected. Applies to the next movement order.');};
$('stance').onchange=e=>{game.stance=e.target.value;const units=selected.size?[...selected].map(id=>game.get(id)).filter(Boolean):game.alive(0);units.forEach(u=>u.stance=e.target.value);notify(e.target.options[e.target.selectedIndex].text+' stance set.');};
map.addEventListener('pointerdown',e=>{const r=map.getBoundingClientRect();cam.target.set((e.clientX-r.left)/r.width*300-150,0,(e.clientY-r.top)/r.height*300-150);});

const glyphs={carrier:'<path d="M7 2h10v20H7zM3 7h4v10H3zm14 0h4v10h-4z"/>',interceptor:'<path d="M12 3l8 16-8-4-8 4z"/>',corvette:'<path d="M9 3h6v18H9zM4 9h5v8H4zm11 0h5v8h-5z"/>',frigate:'<path d="M8 3h8v18H8zM3 7h5v13H3zm13 0h5v13h-5z"/>',collector:'<path d="M7 5h10v14H7zM3 9h4v8H3zm14 0h4v8h-4zM10 2h4v3"/>'};
let fleetSignature='',queueSignature='';
function updateUI(){
  document.querySelector('.mission-panel').hidden=!game.started;
  document.querySelector('.fleet-panel').hidden=!game.started;
  for(const id of selected)if(!game.get(id))selected.delete(id);
  $('resources').textContent=Math.floor(game.resources).toLocaleString();$('capacity').textContent=game.capacity();
  const c=game.carrier(),percent=c?Math.max(0,Math.ceil(c.hp/c.maxHp*100)):0;$('carrier-percent').textContent=percent+'%';$('carrier-health-fill').style.width=percent+'%';$('carrier-health-fill').style.background=percent<30?'var(--red)':'var(--cyan)';
  const allies=game.alive(0);$('fleet-count').textContent=allies.length+' SHIPS';
  const signature=['carrier','interceptor','corvette','frigate','collector'].map(type=>type+':'+allies.filter(u=>u.type===type).length+':'+allies.filter(u=>u.type===type&&selected.has(u.id)).length).join('|');
  if(signature!==fleetSignature){fleetSignature=signature;$('fleet-list').innerHTML=['carrier','interceptor','corvette','frigate','collector'].map(type=>{const n=allies.filter(u=>u.type===type).length;return '<button class="fleet-row '+(allies.some(u=>u.type===type&&selected.has(u.id))?'selected':'')+'" data-type="'+type+'"><span><svg viewBox="0 0 24 24">'+glyphs[type]+'</svg>'+TYPES[type].name+(n>1?'s':'')+'</span><b>'+String(n).padStart(2,'0')+'</b></button>';}).join('');$('fleet-list').querySelectorAll('button').forEach(b=>b.onclick=e=>select(game.alive(0).filter(u=>u.type===b.dataset.type).map(u=>u.id),e.shiftKey));}
  const units=[...selected].map(id=>game.get(id)).filter(Boolean),one=units[0];$('selected-count').textContent=units.length?units.length+' SELECTED':'NO SELECTION';
  $('selection-name').textContent=units.length===1?one.name:units.length?units.length+' ships selected':'Awaiting orders';
  $('selection-detail').textContent=units.length===1?(one.order?.kind==='harvest'?(one.order.phase==='return'?'Returning cargo':'Mining resources'):one.order?.kind==='attack'?'Engaging target':one.order?.kind==='move'?'En route':'Holding position')+' · '+Math.ceil(one.hp)+' / '+one.maxHp+' HP':units.length?(units.filter(u=>u.type!=='collector').length+' combat · '+units.filter(u=>u.type==='collector').length+' collectors'):'Click a ship or drag to select';
  const hp=units.length?units.reduce((s,u)=>s+u.hp,0)/units.reduce((s,u)=>s+u.maxHp,0)*100:0;$('selection-health').style.visibility=units.length?'visible':'hidden';$('selection-health').firstElementChild.style.width=hp+'%';
  const qsig=game.queue.map(q=>q.type+Math.ceil(q.remaining)).join('|');if(qsig!==queueSignature){queueSignature=qsig;$('build-queue').innerHTML=game.queue.length?game.queue.map((q,i)=>'<button class="queue-chip" data-index="'+i+'" title="Cancel construction and refund resources">'+TYPES[q.type].name.split(' ').pop()+' '+(i===0?Math.ceil(q.remaining)+'s':'')+'<i style="width:'+((1-q.remaining/q.total)*100)+'%"></i></button>').join(''):'<span class="queue-empty">Shipyard idle</span>';$('build-queue').querySelectorAll('button').forEach(b=>b.onclick=()=>{game.cancelBuild(Number(b.dataset.index));updateUI();});}
  document.querySelectorAll('[data-build]').forEach(b=>b.disabled=game.resources<TYPES[b.dataset.build].cost||game.capacity()+TYPES[b.dataset.build].cap>44||game.queue.length>=5||!!game.result);
  document.querySelectorAll('[data-command]').forEach(b=>{b.classList.toggle('active',b.dataset.command===mode);b.disabled=!units.length;});
  const time=Math.floor(game.time);$('clock').textContent=String(Math.floor(time/60)).padStart(2,'0')+':'+String(time%60).padStart(2,'0');
  $('operation-state').textContent=!game.started?'STANDBY':game.result?'COMPLETE':game.paused?'PAUSED':'ACTIVE';
  $('pause-overlay').hidden=!game.started||!game.paused||!!game.result||$('help-dialog').open;$('pause-button').innerHTML=game.paused?'<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';$('pause-button').setAttribute('aria-label',game.paused?'Resume game':'Pause game');
  $('hint-text').textContent=mode==='move'?'Choose destination · altitude '+($('altitude').value||0):mode==='attack'?'Choose a hostile ship to attack':mode==='harvest'?'Choose an asteroid to mine':units.length?'Right click to move, attack, or mine':'Select your fleet to issue orders';
  $('mode-label').innerHTML=(cam.sensor?'SENSOR VIEW':'TACTICAL VIEW')+' <span>●</span> '+(game.paused?'PAUSED':'LIVE');
  if(game.result&&!ended){ended=true;mode=null;$('result-overlay').hidden=false;const win=game.result==='victory';$('result-kicker').textContent=win?'OPERATION COMPLETE':'FLEET COMMAND LOST';$('result-title').textContent=win?'Sector secured.':'Asterion has fallen.';$('result-description').textContent=win?'The Revenant is destroyed. Your fleet has reclaimed the Kepler Expanse.':'Your carrier was destroyed. Try building more escorts and keeping your collectors close to home.';$('result-stats').innerHTML='<span><b>'+$('clock').textContent+'</b>MISSION TIME</span><span><b>'+game.kills+'</b>HOSTILES LOST</span><span><b>'+Math.floor(game.mined)+'</b>RESOURCES MINED</span>';}
}
function drawMap(){
  const r=map.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);if(map.width!==Math.round(r.width*dpr)||map.height!==Math.round(r.height*dpr)){map.width=Math.round(r.width*dpr);map.height=Math.round(r.height*dpr);}if(!r.width)return;mapCtx.setTransform(dpr,0,0,dpr,0,0);const w=r.width,h=r.height;mapCtx.clearRect(0,0,w,h);mapCtx.fillStyle='#06111b';mapCtx.fillRect(0,0,w,h);mapCtx.strokeStyle='#5886a219';mapCtx.lineWidth=1;
  for(let i=1;i<6;i++){mapCtx.beginPath();mapCtx.moveTo(w*i/6,0);mapCtx.lineTo(w*i/6,h);mapCtx.moveTo(0,h*i/6);mapCtx.lineTo(w,h*i/6);mapCtx.stroke();}
  const mp=p=>({x:(p.x+150)/300*w,y:(p.z+150)/300*h});
  for(const rock of game.rocks)if(rock.amount>0){const p=mp(rock);mapCtx.fillStyle='#cf9d5488';mapCtx.fillRect(p.x-1,p.y-1,2,2);}
  for(const u of game.alive()){const p=mp(u);mapCtx.fillStyle=u.team?'#ed8274':'#79d9e5';const s=u.type==='carrier'?4:2;if(selected.has(u.id)){mapCtx.strokeStyle='#efb75a';mapCtx.strokeRect(p.x-4,p.y-4,8,8);}mapCtx.beginPath();mapCtx.moveTo(p.x,p.y-s);mapCtx.lineTo(p.x+s,p.y+s);mapCtx.lineTo(p.x-s,p.y+s);mapCtx.fill();}
  const p=mp(cam.focus);mapCtx.strokeStyle='#80aec84d';mapCtx.beginPath();mapCtx.ellipse(p.x,p.y,cam.distance/300*w*.35,cam.distance/300*h*.28,0,0,Math.PI*2);mapCtx.stroke();mapCtx.strokeStyle='#aac9dc66';mapCtx.beginPath();mapCtx.moveTo(p.x-4,p.y);mapCtx.lineTo(p.x+4,p.y);mapCtx.moveTo(p.x,p.y-4);mapCtx.lineTo(p.x,p.y+4);mapCtx.stroke();
}
function label(text,x,y,col='#849daf',size=9){ctx.font=size+'px "Segoe UI",sans-serif';ctx.fillStyle=col;ctx.fillText(text,x,y);}
function drawOverlay(){
  ctx.clearRect(0,0,width,height);
  for(const u of game.alive()){
    const p=screen(u);if(p.z>1||p.z<0||p.y<84||p.y>height-260)continue;
    const isSelected=selected.has(u.id),isHover=hover?.id===u.id;
    if(cam.sensor||u.type==='carrier'||isSelected||isHover||u.flash>0){
      const c=u.team?'#ec887b':isSelected?'#81dfeb':'#849fac';const size=u.type==='carrier'?21:12;
      if(cam.sensor||isSelected){ctx.strokeStyle=c;ctx.lineWidth=1;ctx.beginPath();const n=size;for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){ctx.moveTo(p.x+sx*n,p.y+sy*(n-4));ctx.lineTo(p.x+sx*n,p.y+sy*n);ctx.lineTo(p.x+sx*(n-4),p.y+sy*n);}ctx.stroke();}
      if(isSelected||u.type==='carrier'||isHover||cam.sensor){const y=p.y+size+7,bw=u.type==='carrier'?58:30;ctx.fillStyle='#142739cc';ctx.fillRect(p.x-bw/2,y,bw,2);ctx.fillStyle=u.hp/u.maxHp<.3?'#f0796b':c;ctx.fillRect(p.x-bw/2,y,bw*Math.max(0,u.hp/u.maxHp),2);}
      if(u.type==='carrier'||isHover||cam.sensor){ctx.textAlign='center';label(u.type==='carrier'?u.name.toUpperCase():TYPES[u.type].name.toUpperCase(),p.x,p.y-size-8,c,9);if(u.type==='carrier')label(u.team?'HOSTILE CARRIER':'FLEET CARRIER',p.x,p.y-size-21,'#718594',7);ctx.textAlign='left';}
    }
    if(isSelected&&u.order?.kind==='move'){
      const dest=screen(u.order);if(dest.z>0&&dest.z<1){ctx.strokeStyle='#72c5d944';ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(dest.x,dest.y);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#74d5e788';ctx.strokeRect(dest.x-3,dest.y-3,6,6);}
    }
    if(u.type==='collector'&&u.order?.kind==='harvest'&&u.order.phase==='gather'){
      const r=game.rocks.find(r=>r.id===u.order.rockId);if(r&&distance(u,r)<r.size+5){const rp=screen(r);ctx.strokeStyle='#efb75a55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(rp.x,rp.y);ctx.stroke();}
    }
  }
  if(hover?.kind==='rock'&&hover.rock.amount>0){const p=screen(hover.rock);ctx.textAlign='center';label('ASTEROID · '+Math.ceil(hover.rock.amount)+' RU',p.x,p.y-24,'#e3b16c',10);ctx.textAlign='left';}
  if(cam.sensor){ctx.textAlign='center';label('S E N S O R   A R R A Y',width/2,110,'#739aaa',10);ctx.textAlign='left';}
}
function updateCamera(dt){
  const speed=cam.distance*.32*dt,right=new THREE.Vector3(Math.cos(cam.yaw),0,-Math.sin(cam.yaw)),forward=new THREE.Vector3(-Math.sin(cam.yaw),0,-Math.cos(cam.yaw));
  if(keys.has('w')||keys.has('arrowup'))cam.target.addScaledVector(forward,speed);if(keys.has('s')&&keys.has('shift')||keys.has('arrowdown'))cam.target.addScaledVector(forward,-speed);if(keys.has('d')||keys.has('arrowright'))cam.target.addScaledVector(right,speed);if(keys.has('a')&&keys.has('shift')||keys.has('arrowleft'))cam.target.addScaledVector(right,-speed);
  cam.target.x=Math.max(-170,Math.min(170,cam.target.x));cam.target.z=Math.max(-170,Math.min(170,cam.target.z));cam.focus.lerp(cam.target,1-Math.exp(-dt*6));
  const pitch=cam.sensor?1.5:cam.pitch,yaw=cam.sensor?0:cam.yaw,d=cam.sensor?Math.max(cam.distance,width<800?430:250):cam.distance;
  camera.position.set(cam.focus.x+Math.sin(yaw)*Math.cos(pitch)*d,cam.focus.y+Math.sin(pitch)*d,cam.focus.z+Math.cos(yaw)*Math.cos(pitch)*d);camera.lookAt(cam.focus);camera.updateMatrixWorld();sky.position.copy(camera.position);
}
function resize(){width=innerWidth;height=innerHeight;renderer.setSize(width,height,false);camera.aspect=width/height;const deckHeight=document.querySelector('.command-deck').offsetHeight+document.querySelector('.bottom-strip').offsetHeight;const headerHeight=document.querySelector('.topbar').offsetHeight;camera.setViewOffset(width,height,0,Math.round((deckHeight-headerHeight)/2),width,height);camera.updateProjectionMatrix();overlay.width=width*devicePixelRatio;overlay.height=height*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);}
window.addEventListener('resize',resize);resize();refreshWorld();updateUI();
let lastTime=performance.now();
function frame(t){requestAnimationFrame(frame);const dt=Math.min((t-lastTime)/1000,.08);lastTime=t;now=t/1000;
  game.step(dt);processEvents();updateCamera(dt);syncObjects();
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;const a=Math.max(0,e.life/e.total);e.mesh.material.opacity=a*(e.explode?.8:1);if(e.explode)e.mesh.scale.setScalar((1-a)*e.size+.2);if(e.waypoint)e.mesh.scale.setScalar(1+(1-a)*2);if(e.life<=0){disposeTree(e.mesh);effects.splice(i,1);}}
  renderer.render(scene,camera);drawOverlay();if(t-lastUI>150){updateUI();drawMap();lastUI=t;}
}
requestAnimationFrame(frame);

// These tools use the same game state and commands as the visible interface.
const tools=[
  {name:'read_fleet_state',title:'Read fleet state',description:'Read resources, units, positions, build queue, and mission status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(){return game.snapshot();}},
  {name:'build_fleet_ship',title:'Build ship',description:'Queue an interceptor, corvette, frigate, or collector in the carrier shipyard and spend its resource cost.',inputSchema:{type:'object',properties:{type:{type:'string',enum:['interceptor','corvette','frigate','collector']}},required:['type'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!['interceptor','corvette','frigate','collector'].includes(input.type))throw new Error('Invalid ship class');const result=game.build(input.type);updateUI();return {...result,resources:Math.floor(game.resources),queue:game.snapshot().queue};}},
  {name:'command_fleet_units',title:'Command fleet',description:'Issue a movement, attack, harvest, or stop order to allied units by their IDs.',inputSchema:{type:'object',properties:{unitIds:{type:'array',items:{type:'integer'},minItems:1},kind:{type:'string',enum:['move','attack','harvest','stop']},x:{type:'number'},y:{type:'number'},z:{type:'number'},targetId:{type:'integer'},rockId:{type:'string'}},required:['unitIds','kind'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!Array.isArray(input.unitIds)||!input.unitIds.length||!input.unitIds.every(Number.isInteger)||!['move','attack','harvest','stop'].includes(input.kind)||input.unitIds.some(id=>game.get(id)?.team!==0))throw new Error('Invalid fleet command');if(!game.command(input.unitIds,input.kind,input))throw new Error('Invalid target or destination');select(input.unitIds);updateUI();return {ok:true,units:game.snapshot().units.filter(u=>input.unitIds.includes(u.id))};}}
];
if(document.modelContext?.registerTool){const lifecycle=new AbortController();for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
// A read-only inspection hook also makes the simulation easy to verify locally.
window.voidCommand={snapshot:()=>game.snapshot(),screenPosition:id=>{const u=game.get(id);return u?screen(u):null;}};
