import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// These two maps contain only resampled pixels from assets/N13_side.webp.
// QUAD extraction removes its camera perspective; no pattern is generated.
const modelURL = new URL('./space-assets/models/N13_side_reference.glb', import.meta.url);
const topURL = new URL('./assets/round-hall/N13_top_photo.png', import.meta.url);
const sideURL = new URL('./assets/round-hall/N13_side_photo.png', import.meta.url);
let sourcePromise, texturesPromise;

async function sourceTextures() {
  if (!texturesPromise) texturesPromise = Promise.all([topURL, sideURL].map(async url => {
    const texture = await new THREE.TextureLoader().loadAsync(url.href);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    return texture;
  }));
  return texturesPromise;
}

/** Retain the N13 folded body/rims; replace only the coloured inset's photo maps. */
export async function createColourSideTable() {
  sourcePromise ||= new GLTFLoader().loadAsync(modelURL.href);
  const [source, maps] = await Promise.all([sourcePromise, sourceTextures()]);
  const root = new THREE.Group(), content = source.scene.clone(true);
  let replacements = 0;
  content.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (!/multicolour/i.test(mesh.name)) {
      mesh.material = mesh.material.clone(); return;
    }
    replacements++;
    const geometry = mesh.geometry.clone();
    geometry.clearGroups();
    // Source GLB has six independent, four-vertex faces. Face 2 is its sloping
    // top; use the separately photographed thick edge on the other faces.
    for (let face = 0; face < 6; face++) geometry.addGroup(face * 6, 6, face === 2 ? 0 : 1);
    mesh.geometry = geometry;
    // The source photo already contains surface illumination. Preserve its
    // visible colour values rather than tinting/bleaching them a second time
    // with the VR's warm metal lighting. The gold structure remains relit.
    mesh.material = maps.map((map, index) => new THREE.MeshBasicMaterial({
      name: index ? 'N13 original photo colour edge' : 'N13 original photo colour top',
      map, color: '#ffffff', toneMapped: false
    }));
    mesh.userData = { ...mesh.userData, textureSource: 'assets/N13_side.webp', originalPixels: true };
  });
  if (replacements !== 1) throw new Error('N13模型彩色嵌面未能可靠定位');
  root.add(content); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(content), size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  content.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
  root.scale.set(.45 / size.x, .48 / size.y, .45 / size.z);
  root.name = 'N13 coloured photo inlay side table';
  root.userData = {
    itemId: 'N13_side', proxyDimensions: [.45, .45, .48],
    representation: 'existing-photo-reconstruction-with-original-pixel-inlay',
    sourceImage: 'assets/N13_side.webp',
    textureMethod: 'deterministic perspective crop from original catalogue pixels',
    noNewAIGeneration: true, dimensionStatus: 'design-placement-size-not-manufacturer-specification',
    note: '沿用N13已有金框与折面几何；彩色顶面和厚侧面改用家具库原图实彩裁贴。单视图透视校正为近似，实际尺寸待核。'
  };
  root.updateMatrixWorld(true);
  return root;
}
