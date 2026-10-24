import * as THREE from './vendor/three.module.js';
import FurnitureModels from './furniture-models.js';
import { createCurvedSofa, createModularSofa, placeSofaAtArcCentre } from './round-hall-sofa.js';
import { createPukkaChair, createBeltPendant, createRockSconces, createRug } from './round-hall-accessories.js';
import { createColourSideTable } from './round-hall-side.js';
import { createPhotoCoffeeTable } from './round-hall-coffee.js';

export const ROUND_CENTRE = [14.357672, -14.354757];
export const ROUND_SCHEMES = {
  a: { title:'A · 云绿与酒红', subtitle:'P01 定制三座弧形 · 棋盘石茶几 · 双色平织单椅', sofa:['P01_sofa'], coffee:'N36_coffee', coffeeSize:[1.05,1.05,.32], palette:['#74785a','#782e32','#c29a48','#b8a785','#252624'] },
  b: { title:'B · 橄榄与烟金', subtitle:'P08 皮革 × 织面弧形模块 · 黑圆茶几 · 酒红皮带吊灯', sofa:['P08_sofafabric','P08_sofagreen'], coffee:'O50_coffee', coffeeSize:[1.05,1.05,.38], palette:['#5c6244','#a39874','#965d3b','#652e32','#242625'] }
};

async function product(id, size, x, z, rotation=0) {
  const o=await FurnitureModels.load(id), d=o.userData.proxyDimensions;
  o.scale.set(size[0]/d[0],size[2]/d[2],size[1]/d[1]);
  o.position.set(x,0,z); o.rotation.y=rotation*Math.PI/180;
  o.userData.itemId=id; return o;
}

function createBowl() {
  // Smooth ceramic interpretation of V07_bowl. Original catalogue image is
  // available in the selection board; no generated texture is substituted.
  const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:'#e4d9c1',roughness:.32});
  const points=[new THREE.Vector2(.018,0),new THREE.Vector2(.055,.01),new THREE.Vector2(.034,.04),new THREE.Vector2(.034,.075),new THREE.Vector2(.11,.09),new THREE.Vector2(.15,.145),new THREE.Vector2(.146,.153),new THREE.Vector2(.10,.101),new THREE.Vector2(.01,.085)];
  const mesh=new THREE.Mesh(new THREE.LatheGeometry(points,64),mat);mesh.castShadow=true;g.add(mesh);g.userData.itemId='V07_bowl';return g;
}

export async function buildRoundScheme(key='a') {
  const spec=ROUND_SCHEMES[key];if(!spec)throw new Error('未知圆厅方案');
  const group=new THREE.Group();group.name='round-hall-scheme-'+key;
  // Every new group is built before replacing the visible scheme.
  await FurnitureModels.ready;
  const sofa=key==='a'?await createCurvedSofa():await createModularSofa();
  placeSofaAtArcCentre(sofa,...ROUND_CENTRE);group.add(sofa);
  const rug=await createRug({width:3.66,depth:2.74});rug.position.set(14.36,.012,-14.65);group.add(rug);
  for(const [x,z,angle] of [[13.20,-13.10,165],[15.22,-13.10,195]]){
    const chair=await createPukkaChair();chair.position.set(x,.015,z);chair.rotation.y=angle*Math.PI/180;group.add(chair);
  }
  const tableZ=key==='b'?-14.68:-14.75;
  const table=key==='a'?await createPhotoCoffeeTable('N36_coffee'):await product(spec.coffee,spec.coffeeSize,14.36,tableZ);table.position.set(14.36,0,tableZ);group.add(table);
  const sideTable=await createColourSideTable();sideTable.position.set(12.32,0,-15.10);sideTable.rotation.y=12*Math.PI/180;group.add(sideTable);
  const bowl=createBowl();bowl.position.set(14.45,spec.coffeeSize[2]+.008,tableZ+.03);group.add(bowl);
  const pendant=await createBeltPendant();pendant.position.set(14.36,2.89,tableZ);group.add(pendant);
  const stones=await createRockSconces({curveRadius:2.94});stones.position.set(16.061,1.90,-16.788);stones.rotation.y=-35*Math.PI/180;group.add(stones);
  const light=new THREE.PointLight('#ffd5a0',2.6,4,2);light.position.set(14.36,2.20,-14.75);group.add(light);
  const keyLight=new THREE.DirectionalLight('#fff1dc',1.5);keyLight.position.set(16.5,5,-12.8);keyLight.target.position.set(14.4,0,-15);keyLight.castShadow=true;keyLight.shadow.mapSize.set(2048,2048);Object.assign(keyLight.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:12});keyLight.shadow.normalBias=.015;keyLight.shadow.bias=-.00015;group.add(keyLight,keyLight.target);
  group.userData={scheme:key,sourceIds:[...spec.sofa,spec.coffee,'N42_chair','N13_side','W23_03','LT23_07','V07_bowl'],customSofa:true,noNewAIGeneration:true,dimensionsStatus:'design-proposal-requires-site-and-maker-check',materialExclusions:['travertine','boucle','shag','fur']};
  return group;
}
