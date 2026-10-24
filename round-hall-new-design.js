import * as THREE from './vendor/three.module.js';
import FurnitureModels from './furniture-models.js';
import {createCurvedSofa,createModularSofa,placeSofaAtArcCentre} from './round-hall-sofa.js';
import {createBeltPendant,createRockSconces,createRug} from './round-hall-accessories.js';
import {createNewProduct} from './round-hall-new-furniture.js?v=2';
import {createRoundArtwork} from './round-hall-art.js';

export const NEW_SCHEMES={
 c:{title:'C · 云绿与干邑',subtitle:'云纹弧沙发 / 深木皮椅 / 古铜波浪茶几 / 银镜球簇',sofaIds:['P01_sofa'],chair:'O11_chair',coffee:'O06_table',side:'O53_side',pendant:'LT23_03',palette:['#777b5a','#633c26','#a48a56','#a9adaf','#202320']},
 d:{title:'D · 烟金与赤陶',subtitle:'织皮弧模块 / 白垫细架椅 / 赤陶砖茶几 / 树瘤边几',sofaIds:['P08_sofafabric','P08_sofagreen'],chair:'P01_chair',coffee:'N43_table',side:'V23_side',pendant:'W23_03',palette:['#8b8464','#9d4f2c','#e8dfce','#633c33','#332c24']}
};
const loader=new THREE.TextureLoader();

async function placed(id,size,x,z,rotation=0){
 const object=id==='O11_chair'?await FurnitureModels.load(id):await createNewProduct(id);
 const dims=object.userData.proxyDimensions;
 if(size&&dims)object.scale.multiply(new THREE.Vector3(size[0]/dims[0],size[2]/dims[2],size[1]/dims[1]));
 object.position.set(x,0,z);object.rotation.y=THREE.MathUtils.degToRad(rotation);return object;
}

async function createPhotoPendant(){
 // Preserve all visible globes and original product pixels in these still
 // proposals. This is a catalogue cutout, not a claimed manufacturer 3D model.
 const map=await loader.loadAsync(new URL('./assets/LT23_03.webp',import.meta.url).href);map.colorSpace=THREE.SRGBColorSpace;
 const group=new THREE.Group(),h=.91,w=h*map.image.width/map.image.height;
 const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.06,side:THREE.DoubleSide,toneMapped:false}));
 face.position.y=-h/2;group.add(face);group.rotation.y=.10;
 const point=new THREE.PointLight('#fff1d9',3,3,2);point.position.set(0,-.67,0);group.add(point);
 group.userData={itemId:'LT23_03',representation:'original-catalogue-image-cutout-for-still-proposal',sourceImage:'assets/LT23_03.webp',dimensionStatus:'proposed-not-measured',noNewAIGeneration:true};
 return group;
}
async function createPhotoBowl(){
 const map=await loader.loadAsync(new URL('./assets/V07_bowl.webp',import.meta.url).href);map.colorSpace=THREE.SRGBColorSpace;
 const w=.27,h=w*map.image.height/map.image.width;
 const object=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.06,side:THREE.DoubleSide,toneMapped:false}));
 object.position.set(14.49,.32+h/2,-14.70);object.userData={itemId:'V07_bowl',representation:'original-catalogue-image-cutout-for-still-proposal'};return object;
}

export async function buildNewRoundScheme(key='c',art=1){
 const spec=NEW_SCHEMES[key];if(!spec)throw new Error('未知新搭配');
 const group=new THREE.Group();group.name=key+'-art'+art;
 const sofa=key==='c'?await createCurvedSofa():await createModularSofa();placeSofaAtArcCentre(sofa,14.357672,-14.354757);group.add(sofa);
 const rug=await createRug({width:3.66,depth:2.74});rug.position.set(14.36,.012,-14.65);group.add(rug);
 const chairZ=key==='d'?-13.15:-13.22;
 for(const [x,z,a] of [[13.18,chairZ,164],[15.27,chairZ,196]])group.add(await placed(spec.chair,key==='c'?null:[.82,.90,.88],x,z,a));
 const tableSize=key==='c'?[1.26,.84,.35]:[1.02,1.02,.32];
 const tableZ=key==='d'?-14.67:-14.73;
 const table=await placed(spec.coffee,tableSize,14.36,tableZ);group.add(table);
 if(key==='d')group.add(await createPhotoBowl());
 const side=await placed(spec.side,key==='c'?[.46,.46,.52]:[.56,.46,.43],12.30,-15.08,8);group.add(side);
 const pendant=key==='c'?await createPhotoPendant():await createBeltPendant();pendant.position.set(14.36,2.89,tableZ);group.add(pendant);
 const stones=await createRockSconces({curveRadius:2.94});stones.position.set(16.061,1.90,-16.788);stones.rotation.y=THREE.MathUtils.degToRad(-35);group.add(stones);
 group.add(await createRoundArtwork(art));
 const keyLight=new THREE.DirectionalLight('#fff1dc',1.35);keyLight.position.set(16.5,5,-12.8);keyLight.target.position.set(14.4,0,-15);keyLight.castShadow=true;keyLight.shadow.mapSize.set(2048,2048);Object.assign(keyLight.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:12});keyLight.shadow.normalBias=.015;keyLight.shadow.bias=-.00015;group.add(keyLight,keyLight.target);
 group.userData={scheme:key,art,sourceIds:[...spec.sofaIds,spec.chair,spec.coffee,spec.side,spec.pendant,'LT23_07'],noNewAIGeneration:true,status:'still-proposal-awaiting-client-choice',materialExclusions:['travertine','boucle','shag','fur']};
 return group;
}
