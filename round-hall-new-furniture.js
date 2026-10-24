import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// New C/D furnishing studies. Product pixels come only from the client's
// existing white-background catalogue. Geometry hidden in the single-view
// photographs is an explicitly provisional layout interpretation.
const textureRoot=new URL('./assets/round-hall-new/',import.meta.url);
const textureCache=new Map(),loader=new THREE.TextureLoader();
async function texture(name,repeat=1){
  if(!textureCache.has(name))textureCache.set(name,loader.loadAsync(new URL(name+'?revision=20261024-cd2',textureRoot).href).then(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}));
  const t=(await textureCache.get(name)).clone();
  if(repeat!==1){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);}return t;
}
const solid=(colour,roughness=.6,metalness=0)=>new THREE.MeshStandardMaterial({color:colour,roughness,metalness});
function mesh(geometry,material){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;return m;}
function roundedBox(w,h,d,r,material){
  r=Math.min(r,w/2-.001,h/2-.001,d/2-.001);
  const g=new THREE.BoxGeometry(w,h,d,14,12,14),p=g.attributes.position;
  const v=new THREE.Vector3(),c=new THREE.Vector3(),half=new THREE.Vector3(w/2-r,h/2-r,d/2-r);
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);c.set(THREE.MathUtils.clamp(v.x,-half.x,half.x),THREE.MathUtils.clamp(v.y,-half.y,half.y),THREE.MathUtils.clamp(v.z,-half.z,half.z));
    v.sub(c).normalize().multiplyScalar(r).add(c);p.setXYZ(i,v.x,v.y,v.z);
  }
  g.computeVertexNormals();return mesh(g,material);
}
function pipe(a,b,r,material){const x=new THREE.Vector3(...a),y=new THREE.Vector3(...b),delta=y.clone().sub(x);const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),20),material);m.position.copy(x).add(y).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
function finish(group,id,dims,note){
  group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
  const content=new THREE.Group();[...group.children].forEach(c=>content.add(c));content.position.set(-centre.x,-box.min.y,-centre.z);group.add(content);
  group.scale.set(dims[0]/size.x,dims[2]/size.y,dims[1]/size.z);
  group.name=id+' / original-photo furnishing study';group.userData={itemId:id,proxyDimensions:dims,sourceImage:'assets/'+id+'.webp',noNewAIGeneration:true,dimensionStatus:'proposed-layout-size-not-manufacturer-spec',representation:'manual-layout-geometry-with-catalogue-photo-textures',materialExclusions:['travertine','boucle','shag','fur'],note};
  group.updateMatrixWorld(true);return group;
}

async function p01Chair(){
  const group=new THREE.Group();
  const whiteMap=await texture('P01-fine-weave.jpg',2),woodMap=await texture('P01-arm-wood.jpg');
  const upholstery=new THREE.MeshStandardMaterial({map:whiteMap,color:'#ffffff',roughness:.88});
  const wood=new THREE.MeshStandardMaterial({map:woodMap,color:'#ffffff',roughness:.38});
  const chrome=solid('#c9cac8',.19,.95),seam=solid('#d6d1c8',.92);
  const seat=roundedBox(.685,.185,.66,.075,upholstery);seat.position.set(0,.37,.09);seat.rotation.x=.035;group.add(seat);
  const back=roundedBox(.675,.655,.15,.062,upholstery);back.position.set(0,.695,-.215);back.rotation.x=-.21;group.add(back);
  // Three subtle horizontal seam channels on the original continuous pad.
  for(const y of [-.16,.015,.19]){
    const seamPath=[];for(let i=0;i<=28;i++){const x=-.305+i/28*.61;seamPath.push(new THREE.Vector3(x,y,.078+.003*Math.cos(x*5)));}
    const line=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPath),36,.0015,5,false),seam);back.add(line);
  }
  for(const sign of [-1,1]){
    const x=sign*.372;
    group.add(pipe([x,.015,.415],[x,.61,.31],.0115,chrome));
    group.add(pipe([x,.015,-.375],[x,.72,-.30],.0115,chrome));
    group.add(pipe([x,.235,.375],[x,.235,-.345],.012,chrome));
    group.add(pipe([x,.49,-.31],[x,.59,.29],.010,chrome));
    const arm=roundedBox(.07,.037,.62,.013,wood);arm.position.set(x,.626,.005);arm.rotation.x=-.02;group.add(arm);
  }
  group.add(pipe([-.372,.24,.375],[.372,.24,.375],.012,chrome));
  group.add(pipe([-.372,.32,-.325],[.372,.32,-.325],.012,chrome));
  return finish(group,'P01_chair',[.80,.92,.88],'按P01白垫、三条横缝、细金属架和红棕扶手手工试摆。原图细密平织取纹，无毛绒；单图不可见的背部与连接结构为推定，实物尺寸待核。');
}

async function o53Side(){
  const group=new THREE.Group(),top=await texture('O53-marble-top.jpg'),edge=await texture('O53-marble-edge.jpg');
  const stoneTop=new THREE.MeshBasicMaterial({map:top,toneMapped:false}),stoneEdge=new THREE.MeshBasicMaterial({map:edge,toneMapped:false});
  const black=solid('#171819',.28,.72);
  const plate=mesh(new THREE.CylinderGeometry(.178,.182,.018,72),black);plate.position.y=.01;group.add(plate);
  const stem=mesh(new THREE.CylinderGeometry(.016,.019,.464,36),black);stem.position.y=.252;group.add(stem);
  const slab=mesh(new THREE.CylinderGeometry(.225,.225,.024,96),[stoneEdge,stoneTop,stoneEdge]);slab.position.y=.51;group.add(slab);
  return finish(group,'O53_side',[.45,.45,.522],'原款浅色有纹石面圆盘、细黑柱与黑圆底。台面取自原库图，并非洞石；具体石种须供应商复核，拟定45cm直径为试摆。');
}

function peanutShape(){
  const shape=new THREE.Shape(),a=.115,r=.20;
  for(let i=0;i<=128;i++){
    const t=i/128*Math.PI*2,rad=a*Math.abs(Math.cos(t))+Math.sqrt(r*r-a*a*Math.sin(t)**2),x=rad*Math.cos(t),z=rad*Math.sin(t);
    i?shape.lineTo(x,z):shape.moveTo(x,z);
  }shape.closePath();return shape;
}
function extrusion(shape,height,material){
  const g=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelSize:.005,bevelThickness:.005,bevelSegments:3,steps:1,curveSegments:24});
  g.rotateX(-Math.PI/2);return mesh(g,material);
}
async function v23Side(){
  const group=new THREE.Group(),shape=peanutShape();
  const topMap=await texture('V23-burl-top.jpg',1.6),bodyMap=await texture('V23-burl-front.jpg',1.6);
  const bodyMat=new THREE.MeshBasicMaterial({map:bodyMap,color:'#ffffff',toneMapped:false});
  const baseMat=solid('#ddd7c7',.32,.02),lineMat=solid('#3e291e',.7);
  const base=extrusion(shape,.075,baseMat);base.position.y=.005;group.add(base);
  const body=extrusion(shape,.42,bodyMat);body.position.y=.082;group.add(body);
  const topGeometry=new THREE.ShapeGeometry(shape,48),pos=topGeometry.attributes.position,uv=topGeometry.attributes.uv;
  for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+.315)/.63,(pos.getY(i)+.2)/.4);
  topGeometry.rotateX(-Math.PI/2);const top=mesh(topGeometry,new THREE.MeshBasicMaterial({map:topMap,toneMapped:false}));top.position.y=.508;group.add(top);
  for(const y of [.222,.365]){
    const points=shape.getPoints(128).map(v=>new THREE.Vector3(v.x,y,-v.y));
    const seam=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),192,.0016,5,true),lineMat);group.add(seam);
  }
  return finish(group,'V23_side',[.52,.38,.51],'按V23树瘤纹双瓣轮廓、两道抽屉分缝与浅底座手工建模，顶面和侧面均原图取纹。树瘤纹在隐藏面延续，非厂家CAD；无洞石、无绒毛。');
}

function curvedSheet({x0,x1,z0,width,base,lift,phase=0},topMaterial,bottomMaterial){
  const positions=[],uvs=[],indices=[],n=64,m=8,thickness=.006;
  // Closed sheet, with a solid 6mm edge rather than an infinitely thin plane.
  for(let side=0;side<2;side++)for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
    const u=i/n,v=j/m,x=x0+(x1-x0)*u,z=z0+(v-.5)*width+.035*Math.sin(u*Math.PI*2+phase);
    const arch=Math.pow(Math.max(0,Math.sin(u*Math.PI)),.88);
    const y=base+lift*arch+.022*Math.sin(v*Math.PI)*Math.sin(u*Math.PI*2+phase)-side*thickness;
    positions.push(x,y,z);uvs.push(u,v);
  }
  const stride=m+1,sideCount=(n+1)*stride;
  for(let side=0;side<2;side++)for(let i=0;i<n;i++)for(let j=0;j<m;j++){
    const a=side*sideCount+i*stride+j,b=a+stride;
    if(!side)indices.push(a,b,a+1,b,b+1,a+1);else indices.push(a,a+1,b,b,a+1,b+1);
  }
  for(let i=0;i<n;i++)for(const j of [0,m]){const a=i*stride+j,b=a+stride;indices.push(a,a+sideCount,b,b,a+sideCount,b+sideCount);}
  for(let j=0;j<m;j++)for(const i of [0,n]){const a=i*stride+j,b=a+1;indices.push(a,b,a+sideCount,b,b+sideCount,a+sideCount);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  return mesh(geometry,topMaterial);
}
async function o06Table(){
  const group=new THREE.Group(),woodTop=await texture('O06-walnut-top.jpg',1.4),woodSide=await texture('O06-walnut-front.jpg',1.4),bronze=await texture('O06-bronze.jpg',2);
  const wood=new THREE.MeshBasicMaterial({map:woodSide,color:'#ffffff',toneMapped:false});
  const gold=new THREE.MeshStandardMaterial({map:bronze,color:'#ffffff',metalness:.70,roughness:.27,side:THREE.DoubleSide});
  const darkGold=solid('#ad8b4f',.35,.72);
  for(const [x,z,w,d] of [[-.37,.015,.65,.63],[.37,-.025,.65,.63]]){
    const r=.17,shape=new THREE.Shape();shape.moveTo(-w/2+r,-d/2);shape.lineTo(w/2-r,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);shape.lineTo(w/2,d/2-r);shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2);shape.lineTo(-w/2+r,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);shape.lineTo(-w/2,-d/2+r);shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);shape.closePath();
    const block=extrusion(shape,.205,wood);block.position.set(x,.005,z);group.add(block);
    const g=new THREE.ShapeGeometry(shape,32),p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+w/2)/w,(p.getY(i)+d/2)/d);g.rotateX(-Math.PI/2);
    const top=mesh(g,new THREE.MeshBasicMaterial({map:woodTop,color:'#ffffff',toneMapped:false}));top.position.set(x,.216,z);group.add(top);
  }
  group.add(curvedSheet({x0:-.64,x1:.64,z0:.135,width:.34,base:.026,lift:.328,phase:.3},gold,darkGold));
  group.add(curvedSheet({x0:-.71,x1:-.055,z0:-.205,width:.29,base:.202,lift:.148,phase:1.5},gold,darkGold));
  group.add(curvedSheet({x0:.035,x1:.705,z0:-.228,width:.31,base:.202,lift:.171,phase:2.8},gold,darkGold));
  return finish(group,'O06_table',[1.30,.78,.36],'依库内O06的深木平台与三段古铜波浪连续曲面作手工体量试摆，木面/金属面均原图取纹；单视图无法验证背面与真实折弯结构，非精确原厂模型。无洞石，无绒毛。');
}

async function n43Table(){
  const [top,front,left]=await Promise.all(['N43-top.jpg','N43-front.jpg','N43-left.jpg'].map(name=>texture(name)));
  const materials=[top,front,left].map(map=>new THREE.MeshBasicMaterial({map,toneMapped:false}));
  const group=new THREE.Group(),black=solid('#181512',.75);
  const body=mesh(new THREE.BoxGeometry(1.075,.235,1.075),solid('#a8512c',.4));body.position.y=.196;group.add(body);
  const base=mesh(new THREE.BoxGeometry(.88,.074,.88),black);base.position.y=.037;group.add(base);
  const face=(w,h,mat,position,rotation)=>{const o=mesh(new THREE.PlaneGeometry(w,h),mat);o.position.fromArray(position);o.rotation.set(...rotation);group.add(o);};
  face(1.08,1.08,materials[0],[0,.316,0],[-Math.PI/2,0,0]);
  face(1.08,.24,materials[1],[0,.196,.54],[0,0,0]);face(1.08,.24,materials[1],[0,.196,-.54],[0,Math.PI,0]);
  face(1.08,.24,materials[2],[-.54,.196,0],[0,-Math.PI/2,0]);face(1.08,.24,materials[2],[.54,.196,0],[0,Math.PI/2,0]);
  const trim=solid('#c3c0b5',.22,.88);for(const z of [-.54,.54]){const bar=mesh(new THREE.BoxGeometry(1.084,.004,.004),trim);bar.position.set(0,.317,z);group.add(bar);}for(const x of [-.54,.54]){const bar=mesh(new THREE.BoxGeometry(.004,.004,1.084),trim);bar.position.set(x,.317,0);group.add(bar);}
  return finish(group,'N43_table',[1.08,1.08,.32],'N43赤陶釉面砖茶几，完整顶面与可见两侧从图库白底图透视裁贴，保留细金属收边与黑色内收底座；隐藏两侧复用实拍侧面，试摆尺寸待核，无洞石无毛绒。');
}

export async function createNewProduct(id){
  const builders={P01_chair:p01Chair,O53_side:o53Side,V23_side:v23Side,O06_table:o06Table,N43_table:n43Table};
  if(!builders[id])throw new Error('此轮尚未准备该产品：'+id);
  return builders[id]();
}
