import * as THREE from './vendor/three.module.js';
import { Reflector } from './vendor/Reflector.js';
import { loadVRRoom } from './vr-room.js';
import { pointInRing, floorAt, isWalkable, canTraverse, nearestWalkable } from './vr-navigation.js';
import FurnitureModels from './furniture-models.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const stops = [
  {id:'entry',number:'01',name:'入口',en:'Entrance',title:'入口 · 双 S 吊顶',note:'双 S 凹槽、入口包框与连通空间',image:'project-files/site-overview.png',photo:null},
  {id:'main',number:'02',name:'主会客厅',en:'Main lounge',title:'主厅 · 花饰墙',note:'花饰面、独立柱与米灰分缝墙板',zone:'main-hall',image:'scenes/main-hall.png',photo:'scenes/main-hall-original.jpg'},
  {id:'dining',number:'03',name:'餐区',en:'Dining',title:'餐区 · 三幅花镜',note:'抬高地台、三幅花镜与固定层架',zone:'dining',image:'scenes/wide/dining-wide.png',photo:'scenes/wide/dining-source.jpg'},
  {id:'round',number:'04',name:'圆厅',en:'Round living',title:'圆厅 · 双窗',note:'弧墙、矩形窗与线性风口',zone:'round-living',image:'scenes/wide/round-wide.png',photo:'scenes/round-hall-original.jpg'},
  {id:'living',number:'05',name:'柱位客厅',en:'Living hall',title:'客厅 · 柱位与高窗',note:'C2 / C3 柱、局部梁与右侧连通口',zone:'living-c3',image:'scenes/wide/living-c3-wide.png',photo:'scenes/living-c3-original.png'},
  {id:'outdoor',number:'06',name:'户外客厅',en:'Outdoor sitting',title:'户外客厅',note:'依据现有图纸保留的户外围合与开口',zone:'outdoor',image:'project-files/site-plan.png',photo:null}
];
const stage = $('viewport');
const keys = new Set(), ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
const scene = new THREE.Scene(), rig = new THREE.Group();
const camera = new THREE.PerspectiveCamera(68, 1, .045, 90);
const topCamera = new THREE.OrthographicCamera(-12,12,12,-12,.1,80);
const furniture = new THREE.Group(), lights = new THREE.Group();
let renderer, room, data, floorReflection, probe, ready = false, currentId = 'entry';
let yaw = Math.PI, pitch = 0, topMode = false, lastTime = 0, lastHUD = 0, drag = null;
let activeSession = null, enteringVR = false, xrSupported = false, snapReady = true;
let furnitureVisible = false, furnitureLoaded = false, furnitureLoading = false, toastTimer;
let savedWalk = null, loadedPlan = null, sourceMode = 'photo', moveTween = null;
let topSpan = 22, topCentre = new THREE.Vector3(9.25,0,-8.8), needRender = true;
const controllers = [], aimPoints = new Map(), lightState = {mode:'day'};
let userMarker;
scene.add(rig, furniture, lights); rig.add(camera); camera.rotation.order='YXZ';
scene.background = new THREE.Color('#e4e8e1');

function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200); }
function feedback(message) { $('view-feedback').textContent=message; }
function download(blob,name) { const url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
function currentStop() {return stops.find(s=>s.id===currentId)||stops[0];}
function updateHeading(id) {currentId=id;const s=currentStop();$('room-title').textContent=s.title;$('room-subtitle').textContent=s.note;document.querySelectorAll('[data-stop]').forEach(b=>{const active=b.dataset.stop===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});document.querySelectorAll('[data-map-stop]').forEach(b=>b.classList.toggle('active',b.dataset.mapStop===id));}
function walkPose() {return {x:rig.position.x,z:rig.position.z,yaw,pitch,fov:camera.fov};}
function setWalkPose(p) {rig.position.set(p.x,0,p.z);yaw=p.yaw;pitch=p.pitch||0;camera.fov=p.fov||68;camera.updateProjectionMatrix();applyCamera();updateFov();}
function applyCamera() {
  if(activeSession)return;
  rig.position.y=0;rig.rotation.y=0;camera.position.set(0,1.6+floorAt(data,rig.position.x,rig.position.z),0);
  camera.rotation.set(pitch,yaw,0,'YXZ');needRender=true;
}
function setPreset(id) {
  if(!ready||activeSession)return;
  const c=data.cameras.find(p=>p.id===id)||data.cameras[0];
  const valid=nearestWalkable(data,c.position[0],c.position[2],1.5);
  if(!valid){toast('此视点暂不可进入，请选择相邻区域');return;}
  moveTween=null;if(topMode)setOverview(false,false);
  const dx=c.target[0]-valid[0],dz=c.target[2]-valid[1];
  setWalkPose({x:valid[0],z:valid[1],yaw:Math.atan2(-dx,-dz),pitch:0,fov:c.fov||68});
  updateHeading(c.id);feedback('拖动转头 · 点击地面移动 · WASD / 方向按钮行走');updateMap();
  try{const url=new URL(location.href);url.searchParams.set('area',c.id);history.replaceState(null,'',url);}catch{}
}
function updateFov() {$('fov').value=String(Math.round(camera.fov));$('fov-value').value=Math.round(camera.fov)+'°';}
function resize() {
  if(!renderer||activeSession)return;const w=stage.clientWidth,h=stage.clientHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  topCamera.left=-topSpan*w/h/2;topCamera.right=topSpan*w/h/2;topCamera.top=topSpan/2;topCamera.bottom=-topSpan/2;
  topCamera.position.set(topCentre.x+13,24,topCentre.z+17);topCamera.up.set(0,1,0);topCamera.lookAt(topCentre);topCamera.updateProjectionMatrix();needRender=true;
}
function setOverview(on,restore=true) {
  if(!ready||activeSession)return;
  if(on&&!topMode)savedWalk=walkPose();topMode=on;
  document.body.classList.toggle('top-view',on);$('overview').setAttribute('aria-pressed',String(on));$('overview').textContent=on?'↙ 回到人视':'◫ 空间总览';
  room.architecturalMeshes.forEach(m=>{const cat=m.userData.category;m.visible=m.userData.originalVisible!==false;if(on&&(cat==='ceiling'||m.userData.bounds?.[0]?.[1]>=1.2))m.visible=false;const clip=['wall','glass','door','column','finish'].includes(cat);if(clip)m.material.clippingPlanes=on?[new THREE.Plane(new THREE.Vector3(0,-1,0),1.2)]:[];});
  if(floorReflection)floorReflection.visible=!on;
  if(!on&&restore&&savedWalk)setWalkPose(savedWalk);
  feedback(on?'建筑总览 · 拖动平移 / 滚轮缩放 · 点击地面进入此处':'拖动转头 · 点击地面移动 · WASD / 方向按钮行走');resize();updateMap();
}
function buildMap() {
  const path=ring=>ring.map(([x,z],i)=>(i?'L':'M')+x.toFixed(3)+','+(-z).toFixed(3)).join(' ')+' Z';
  const zones=data.zones.map(z=>`<path class="map-zone" data-map-zone="${z.id}" d="${path(z.outer)} ${(z.holes||[]).map(path).join(' ')}" fill-rule="evenodd"/>`).join('');
  const columns=data.columns.map(c=>`<rect class="map-column" x="${c.position[0]-.175}" y="${-c.position[2]-.214}" width=".35" height=".428"/>`).join('');
  const pins=stops.map(s=>{const c=data.cameras.find(c=>c.id===s.id);return `<g class="map-point" data-map-stop="${s.id}" role="button" tabindex="0" aria-label="进入${s.name}" transform="translate(${c.position[0]} ${-c.position[2]})"><circle r=".65"/><text y=".02">${Number(s.number)}</text></g>`;}).join('');
  $('plan-map').innerHTML=`<svg viewBox="-1 -1 20.5 19.5" aria-label="客户现状平面，六个入口定位">${zones}${columns}${pins}<path id="map-user" class="map-user" d="M0 -.6 L-.35 .4 L0 .2 L.35 .4 Z"/></svg>`;
  userMarker=$('map-user');
  $('plan-map').addEventListener('click',e=>{const target=e.target.closest('[data-map-stop]');if(target)setPreset(target.dataset.mapStop);});
  $('plan-map').addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key))return;const target=e.target.closest('[data-map-stop]');if(target){e.preventDefault();setPreset(target.dataset.mapStop);}});
}
function updateMap() {
  if(!ready)return;
  const p=activeSession?xrEyePosition():rig.position;
  if(userMarker)userMarker.setAttribute('transform',`translate(${p.x} ${-p.z}) rotate(${-yaw*180/Math.PI})`);
  const zone=data.zones.find(z=>pointInRing(p.x,p.z,z.outer)&&!(z.holes||[]).some(h=>pointInRing(p.x,p.z,h)));
  if(zone&&currentId!=='entry'&&!topMode){const s=stops.find(s=>s.zone===zone.id);if(s&&s.id!==currentId)updateHeading(s.id);}
  document.querySelectorAll('[data-map-zone]').forEach(el=>el.classList.toggle('active',el.dataset.mapZone===zone?.id));
  if(!topMode)feedback(`${activeSession?'VR':'人视'} · 视高 ${activeSession?'随头显': '1.60 m'} · 地面 +${Math.round(floorAt(data,p.x,p.z)*1000)} mm · 拖动转头，点击地面移动`);
}
function setLighting(mode) {
  lightState.mode=mode;lights.clear();
  const warm=mode==='warm';scene.background=new THREE.Color(warm?'#bab8a6':'#e4e8e1');renderer.toneMappingExposure=warm?.96:1.06;
  lights.add(new THREE.HemisphereLight(warm?'#ffead0':'#ffffff',warm?'#a39880':'#b3bcb1',warm?1.35:2.0));
  const sun=new THREE.DirectionalLight(warm?'#ffe5bb':'#fff7e7',warm?1.35:2.5);sun.position.set(6,9,-2);sun.target.position.set(7,0,-11);lights.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(warm?'#efd5af':'#e4eef9',warm?.7:1.05);fill.position.set(17,6,-17);lights.add(fill);
  for(const [x,z]of[[3,-11],[5,-6],[14,-12],[15,-16],[10,-10]]){const l=new THREE.PointLight(warm?'#ffce89':'#fff2de',warm?8:4,10,2);l.position.set(x,2.7,z);lights.add(l);}
  document.querySelectorAll('[data-light]').forEach(b=>{const on=b.dataset.light===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});needRender=true;
}
function addReflection() {
  const r=data.floorRegions.find(r=>r.id==='ground-0');if(!r)return;
  const shape=new THREE.Shape();r.outer.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  for(const ring of r.holes||[]){const p=new THREE.Path();ring.forEach(([x,z],i)=>i?p.lineTo(x,-z):p.moveTo(x,-z));p.closePath();shape.holes.push(p);}
  const shader={...Reflector.ReflectorShader,uniforms:THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms),fragmentShader:Reflector.ReflectorShader.fragmentShader.replace('vec4( blendOverlay( base.rgb, color ), 1.0 )','vec4( base.rgb, 0.22 )')};
  floorReflection=new Reflector(new THREE.ShapeGeometry(shape),{textureWidth:512,textureHeight:512,clipBias:.003,multisample:0,shader});
  floorReflection.rotation.x=-Math.PI/2;floorReflection.position.y=.006;floorReflection.material.transparent=true;floorReflection.material.depthWrite=false;floorReflection.renderOrder=2;scene.add(floorReflection);
  probe=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
  const cube=new THREE.CubeCamera(.05,80,probe);cube.position.set(8,1,-10);floorReflection.visible=false;cube.update(renderer,scene);floorReflection.visible=true;
  scene.environment=probe.texture;scene.environmentIntensity=.36;
}
function floorHit(clientX,clientY) {
  ray.near=0;ray.far=Infinity;
  const b=renderer.domElement.getBoundingClientRect();pointer.set((clientX-b.left)/b.width*2-1,-(clientY-b.top)/b.height*2+1);
  ray.setFromCamera(pointer,topMode?topCamera:camera);
  const hits=ray.intersectObjects(room.architecturalMeshes,false);
  const first=hits.find(h=>h.object.visible&&h.object.userData.originalVisible!==false&&h.object.material.opacity>.4);
  if(!first||first.object.userData.category!=='floor'||first.face?.normal.y<.5)return null;
  return first.point;
}
function teleportTo(point,allowJump=false) {
  if(!isWalkable(data,point.x,point.z,.18)){toast('这里靠近墙柱，请选择空地');return false;}
  if(!allowJump&&!canTraverse(data,[rig.position.x,rig.position.z],[point.x,point.z],.18)){toast('中间有墙或固定结构，请沿通道移动，也可用区域编号切换');return false;}
  if(topMode){setOverview(false,false);rig.position.set(point.x,0,point.z);applyCamera();}
  else moveTween={from:rig.position.clone(),to:new THREE.Vector3(point.x,0,point.z),start:performance.now()};
  needRender=true;updateMap();return true;
}
function bindPointer() {
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||activeSession)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);moveTween=null;drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false};});
  canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;if(drag.moved){if(topMode){topCentre.x-=dx/canvas.clientHeight*topSpan;topCentre.z-=dy/canvas.clientHeight*topSpan;resize();}else{yaw-=dx*.004;pitch=clamp(pitch-dy*.003,-1.05,1.05);applyCamera();}}drag.x=e.clientX;drag.y=e.clientY;});
  canvas.addEventListener('pointerup',e=>{if(!drag)return;const wasClick=!drag.moved;drag=null;if(wasClick){const hit=floorHit(e.clientX,e.clientY);if(hit)teleportTo(hit,topMode);}needRender=true;});
  canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('lostpointercapture',()=>drag=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(topMode){topSpan=clamp(topSpan*Math.exp(e.deltaY*.001),12,38);resize();}else{camera.fov=clamp(camera.fov+e.deltaY*.025,45,85);camera.updateProjectionMatrix();updateFov();needRender=true;}},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;let k=e.key.toLowerCase();k=({arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'})[k]||k;if(['w','a','s','d','shift'].includes(k)){keys.add(k);moveTween=null;e.preventDefault();}});
  window.addEventListener('keyup',e=>{const k=({arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'})[e.key.toLowerCase()]||e.key.toLowerCase();keys.delete(k);});
  window.addEventListener('blur',()=>{keys.clear();drag=null;});document.addEventListener('visibilitychange',()=>{keys.clear();lastTime=0;needRender=true;});
  for(const b of document.querySelectorAll('[data-move]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.move);moveTween=null;});for(const event of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(b.dataset.move));}
}
function moveWalk(dt) {
  if(topMode||activeSession||!keys.size)return;
  let dx=Number(keys.has('d'))-Number(keys.has('a')),dz=Number(keys.has('s'))-Number(keys.has('w'));
  const n=Math.hypot(dx,dz);if(!n)return;const distance=(keys.has('shift')?2.8:1.45)*dt/n,c=Math.cos(yaw),s=Math.sin(yaw);
  const x=rig.position.x+(dx*c+dz*s)*distance,z=rig.position.z+(-dx*s+dz*c)*distance;
  const from=[rig.position.x,rig.position.z];
  if(canTraverse(data,from,[x,z],.18)){rig.position.x=x;rig.position.z=z;}
  else if(canTraverse(data,from,[x,rig.position.z],.18))rig.position.x=x;
  else if(canTraverse(data,from,[rig.position.x,z],.18))rig.position.z=z;
  applyCamera();
}
function frame(time) {
  if(!ready)return;
  const dt=Math.min(.045,(time-lastTime)/1000||0);lastTime=time;
  if(activeSession){updateXR();renderer.render(scene,camera);return;}
  if(document.hidden)return;
  moveWalk(dt);
  if(moveTween){const t=clamp((time-moveTween.start)/450,0,1),ease=t*t*(3-2*t);rig.position.lerpVectors(moveTween.from,moveTween.to,ease);applyCamera();if(t===1)moveTween=null;}
  if(time-lastHUD>180){updateMap();lastHUD=time;}
  if(needRender||drag||keys.size||moveTween){renderer.render(scene,topMode?topCamera:camera);needRender=false;}
}
function openSource(mode='photo') {sourceMode=mode;updateSource();$('source-dialog').showModal();}
function updateSource() {
  const s=currentStop(),photo=sourceMode==='photo'&&s.photo;
  $('source-image').src=sourceMode==='cad'?'project-files/cad-plan.png':photo?s.photo:'project-files/site-plan.png';
  $('source-image').alt=photo?s.name+'现场原图':'客户图纸平面';
  $('source-title').textContent=s.title+' · '+(photo?'现场原图':sourceMode==='cad'?'原 CAD':'现状平面');
  $('source-caption').textContent=sourceMode==='photo'&&!s.photo?'此区域暂无已确认对应的现场照片，先以现状平面核对。':s.note;
  document.querySelectorAll('[data-reference]').forEach(b=>b.classList.toggle('active',b.dataset.reference===sourceMode));
}
function snapshot() {
  if(!ready||activeSession)return;
  const ratio=renderer.getPixelRatio(),width=2400,height=Math.round(width/stage.clientWidth*stage.clientHeight);
  renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.render(scene,topMode?topCamera:camera);
  renderer.domElement.toBlob(blob=>{renderer.setPixelRatio(ratio);resize();needRender=true;if(!blob)return toast('此视角暂不能保存');download(blob,`MARZOOK_${currentId}_${topMode?'空间总览':'VR视角'}.png`);toast('已保存 2400 像素宽的当前视角');},'image/png');
}
function validatePlan(raw) {
  const board=raw?.board||raw?.state||raw;
  if(!Array.isArray(board?.instances)||board.instances.length>150)throw new Error('请使用家具试摆导出的空间方案 JSON（最多150件）');
  const catalog=new Set((window.FURNITURE_CATALOG?.items||[]).map(i=>i.id));
  return board.instances.filter(p=>p&&catalog.has(p.itemId)&&p.representation==='model').map(p=>{
    if(![p.x,p.z,p.w,p.d,p.h].every(v=>Number.isFinite(v))||Math.abs(p.x)>40||Math.abs(p.z)>40||[p.w,p.d,p.h].some(v=>v<=0||v>15))throw new Error('方案中存在异常家具尺寸或位置');
    return {...p,y:clamp(finite(p.y),0,7),rotation:finite(p.rotation)};
  });
}
async function loadFurniture(raw) {
  if(furnitureLoading)return;furnitureLoading=true;$('show-furniture').disabled=true;
  try{
    const items=validatePlan(raw);if(!items.length)throw new Error('方案里暂无对应款式三维模型，请先去家具试摆保存一组家具');
    await FurnitureModels.ready;
    const pending=new THREE.Group();let errors=0;
    for(const p of items){try{const obj=await FurnitureModels.load(p.itemId,p.modelRef),size=obj.userData.proxyDimensions;obj.scale.set(p.w/size[0],p.h/size[2],p.d/size[1]);obj.position.set(p.x,p.y+floorAt(data,p.x,p.z),p.z);obj.rotation.y=p.rotation*Math.PI/180;pending.add(obj);}catch{errors++;}}
    if(!pending.children.length)throw new Error('方案中的模型版本暂不可读取；请在家具试摆中更新后再保存');
    furniture.clear();furniture.add(...[...pending.children]);furnitureLoaded=true;furnitureVisible=true;furniture.visible=true;loadedPlan=raw;
    $('show-furniture').textContent=`暂隐家具 · ${furniture.children.length} 件`;$('show-furniture').setAttribute('aria-pressed','true');needRender=true;
    toast(`已显示 ${furniture.children.length} 件家具${errors?`，${errors} 件暂不可用`:''}；原方案保持保存`);
  }catch(e){toast(e.message);}finally{furnitureLoading=false;$('show-furniture').disabled=false;}
}
async function toggleFurniture() {
  if(!ready)return;
  if(furnitureLoaded){furnitureVisible=!furnitureVisible;furniture.visible=furnitureVisible;$('show-furniture').textContent=`${furnitureVisible?'暂隐':'显示'}家具 · ${furniture.children.length} 件`;$('show-furniture').setAttribute('aria-pressed',String(furnitureVisible));needRender=true;return;}
  try{const raw=JSON.parse(localStorage.getItem('marzook-immersive-v1')||'null');if(!raw)throw new Error('此浏览器暂无三维家具方案；请先在家具试摆保存，或导入方案 JSON');await loadFurniture(raw);}catch(e){toast(e.message);}
}
async function detectXR() {
  try{xrSupported=!!(navigator.xr&&await navigator.xr.isSessionSupported('immersive-vr'));}
  catch{xrSupported=false;}
  $('enter-vr').disabled=false;$('enter-vr').textContent=xrSupported?'进入 VR ↗':'VR 设备说明';
  $('enter-vr').setAttribute('aria-label',xrSupported?'进入沉浸式 VR 头显模式':'当前设备不支持头显，查看VR设备说明');
}
function bindXR() {
  renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');
  const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1)]);
  for(let i=0;i<2;i++){
    const controller=renderer.xr.getController(i),line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xb5d68b}));line.scale.z=5;controller.add(line);rig.add(controller);controllers.push(controller);
    controller.userData.line=line;controller.visible=false;
    controller.addEventListener('selectstart',()=>{
      const p=aimPoints.get(controller);if(!activeSession||!renderer.xr.isPresenting||!p)return;
      const eye=xrEyePosition();if(!canTeleportXR(eye,p))return;
      rig.position.x+=p.x-eye.x;rig.position.z+=p.z-eye.z;rig.position.y=floorAt(data,p.x,p.z);
      rig.updateMatrixWorld(true);renderer.xr.updateCamera(camera);aimPoints.clear();
      const marker=scene.getObjectByName('xr-teleport-marker');if(marker)marker.visible=false;
    });
  }
  const marker=new THREE.Mesh(new THREE.RingGeometry(.16,.22,40),new THREE.MeshBasicMaterial({color:0xb4d58d,side:THREE.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.visible=false;marker.name='xr-teleport-marker';scene.add(marker);
  renderer.xr.addEventListener('sessionend',restoreAfterXR);
}
function xrEyePosition(target=new THREE.Vector3()) {
  // WebXR refreshes its internal ArrayCamera in reference-space coordinates
  // before this frame callback. Compose the rig first and read matrixWorld
  // directly: getWorldPosition() would recompute a parentless XR camera.
  rig.updateMatrixWorld(true);renderer.xr.updateCamera(camera);
  return target.setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
}
function canTeleportXR(eye,point) {
  return isWalkable(data,point.x,point.z,.22)&&canTraverse(data,[eye.x,eye.z],[point.x,point.z],.18);
}
function restoreAfterXR() {
  activeSession=null;controllers.forEach(c=>c.visible=false);aimPoints.clear();snapReady=true;
  const marker=scene.getObjectByName('xr-teleport-marker');if(marker)marker.visible=false;
  rig.rotation.set(0,0,0);rig.position.y=0;keys.clear();drag=null;moveTween=null;
  ray.near=0;ray.far=Infinity;if(floorReflection)floorReflection.visible=!topMode;
  document.body.classList.remove('xr-active');$('enter-vr').textContent='进入 VR ↗';
  if(savedWalk)setWalkPose(savedWalk);resize();needRender=true;
}
async function enterXR() {
  if(!ready)return;
  if(!xrSupported){$('help-dialog').showModal();toast('本设备可直接网页漫游；头显请用支持 WebXR 的浏览器打开同一链接');return;}
  if(enteringVR)return;if(activeSession){await activeSession.end();return;}
  enteringVR=true;$('enter-vr').disabled=true;
  try{
    if(topMode)setOverview(false);savedWalk=walkPose();
    const session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor'],optionalFeatures:['bounded-floor']});
    activeSession=session;keys.clear();drag=null;moveTween=null;snapReady=true;
    rig.position.set(savedWalk.x,floorAt(data,savedWalk.x,savedWalk.z),savedWalk.z);rig.rotation.y=savedWalk.yaw;camera.position.set(0,0,0);camera.rotation.set(0,0,0);controllers.forEach(c=>c.visible=false);
    if(floorReflection)floorReflection.visible=false;
    await renderer.xr.setSession(session);document.body.classList.add('xr-active');$('enter-vr').textContent='退出 VR';
  }catch(e){const session=activeSession;activeSession=null;if(session)try{await session.end();}catch{}restoreAfterXR();toast('未进入头显模式，可继续网页漫游：'+(e.name==='NotAllowedError'?'设备权限未允许':e.message));}
  finally{enteringVR=false;$('enter-vr').disabled=false;}
}
function updateXR() {
  if(!activeSession||!renderer.xr.isPresenting)return;
  const marker=scene.getObjectByName('xr-teleport-marker');marker.visible=false;
  const eye=xrEyePosition(),previousFar=ray.far,previousNear=ray.near;
  try{for(const controller of controllers){
    if(!controller.visible)continue;
    const matrix=new THREE.Matrix4().extractRotation(controller.matrixWorld);ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);ray.ray.direction.set(0,0,-1).applyMatrix4(matrix);ray.far=15;
    const first=ray.intersectObjects(room.architecturalMeshes,false).find(h=>h.object.visible&&h.object.material.opacity>.4);
    const p=first?.point,line=controller.userData.line;
    const good=first?.object.userData.category==='floor'&&first.face?.normal.y>.5&&canTeleportXR(eye,p);
    aimPoints.delete(controller);line.material.color.set(good?0xb5d68b:0xd9d6c9);line.scale.z=first?Math.min(first.distance,15):5;
    if(good){aimPoints.set(controller,p.clone());marker.position.set(p.x,floorAt(data,p.x,p.z)+.015,p.z);marker.visible=true;}
  }}finally{ray.far=previousFar;ray.near=previousNear;}
  const input=activeSession.inputSources?Array.from(activeSession.inputSources).find(s=>s.handedness==='right'&&s.gamepad):null;
  const horizontal=input?.gamepad?.axes?.[2]??input?.gamepad?.axes?.[0]??0;
  if(Math.abs(horizontal)<.25)snapReady=true;
  if(snapReady&&Math.abs(horizontal)>.7){snapReady=false;const angle=-Math.sign(horizontal)*Math.PI/6;
    const offset=rig.position.clone().sub(eye).applyAxisAngle(new THREE.Vector3(0,1,0),angle);rig.position.x=eye.x+offset.x;rig.position.z=eye.z+offset.z;rig.rotation.y+=angle;
    rig.updateMatrixWorld(true);renderer.xr.updateCamera(camera);aimPoints.clear();marker.visible=false;}
}

async function init() {
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.localClippingEnabled=true;
    renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','客户空间 VR：拖动转头，点击地面移动，WASD或方向键行走');stage.prepend(renderer.domElement);
    room=await loadVRRoom({onProgress:p=>{$('loading-message').textContent=p.message;$('loading-progress').value=p.ratio;}});data=room.data;scene.add(room.group);
    setLighting('day');addReflection();buildMap();bindPointer();bindXR();ready=true;
    const id=new URLSearchParams(location.search).get('area');setPreset(stops.some(s=>s.id===id)?id:'entry');resize();
    $('loading').hidden=true;$('model-summary').textContent=`连续实体模型 · ${data.zones.length} 个区域 · 米制坐标`;
    const triangles=data.meshes.reduce((n,m)=>n+(m.indices?.length?m.indices.length/3:m.positions.length/9),0);
    $('build-statistics').textContent=`当前版本：${data.meshes.length} 个建筑网格，${triangles.toLocaleString()} 个三角面，7 张原模型／图纸贴图。GLB 内嵌贴图，单位为米，Y 轴向上。`;
    new ResizeObserver(resize).observe(stage);renderer.setAnimationLoop(frame);await detectXR();
  }catch(e){console.error(e);$('loading-message').textContent='空间暂时无法打开：'+e.message+'。请刷新重试，或返回家具工作室。';$('loading').insertAdjacentHTML('beforeend','<a href="index.html">返回家具与图纸 ↗</a>');}
}

$('stops').innerHTML=stops.map(s=>`<button class="stop" data-stop="${s.id}" aria-pressed="false"><img src="${s.image}" alt="" loading="lazy"><span class="stop-text"><small>${s.number}</small><strong>${s.name}</strong><span class="en">${s.en}</span></span></button>`).join('');
$('stops').addEventListener('click',e=>{const b=e.target.closest('[data-stop]');if(b)setPreset(b.dataset.stop);});
$('overview').onclick=()=>setOverview(!topMode);$('source').onclick=()=>openSource();$('help').onclick=()=>$('help-dialog').showModal();$('details').onclick=()=>$('details-dialog').showModal();
$('level').onclick=()=>{if(topMode||activeSession)return;pitch=0;applyCamera();};
$('fov').oninput=()=>{if(!ready||activeSession)return;camera.fov=+$('fov').value;camera.updateProjectionMatrix();updateFov();needRender=true;};
document.querySelectorAll('[data-light]').forEach(b=>b.onclick=()=>{if(ready)setLighting(b.dataset.light);});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{toast('此浏览器不支持全屏，可放大窗口查看');}};
$('snapshot').onclick=snapshot;$('show-furniture').onclick=toggleFurniture;$('enter-vr').onclick=enterXR;
$('import-plan').onclick=()=>$('plan-file').click();$('plan-file').onchange=async()=>{const file=$('plan-file').files[0];if(!file)return;try{if(file.size>2e6)throw new Error('方案文件过大，请选择家具方案 JSON');await loadFurniture(JSON.parse(await file.text()));}catch(e){toast('方案未载入：'+e.message);}$('plan-file').value='';};
document.querySelectorAll('[data-reference]').forEach(b=>b.onclick=()=>{sourceMode=b.dataset.reference;updateSource();});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('close',()=>{keys.clear();needRender=true;});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
init();
