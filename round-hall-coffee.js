import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const sourceURL = new URL('./space-assets/models/N36_coffee_reference.glb', import.meta.url);
const photoURLs = ['N36_top_photo.png', 'N36_front_photo.png', 'N36_right_photo.png']
  .map(name => new URL('./assets/round-hall/' + name, import.meta.url));
let modelPromise, texturesPromise;

async function photoTextures() {
  texturesPromise ||= Promise.all(photoURLs.map(async url => {
    const texture = await new THREE.TextureLoader().loadAsync(url.href);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    return texture;
  }));
  return texturesPromise;
}

/**
 * N36 study: preserve the existing 64-block solid and recessed plinth, and
 * cover each exposed slab face with ONE rectified catalogue photograph.
 * The full checker image is never repeated on individual blocks.
 */
export async function createPhotoCoffeeTable(id = 'N36_coffee') {
  if (id !== 'N36_coffee') throw new Error('此原图贴面模块目前只适用于N36棋盘茶几');
  modelPromise ||= new GLTFLoader().loadAsync(sourceURL.href);
  const [source, maps] = await Promise.all([modelPromise, photoTextures()]);
  const group = new THREE.Group(), content = source.scene.clone(true);
  content.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.material = mesh.material.clone();
    mesh.castShadow = true; mesh.receiveShadow = true;
  });
  group.add(content); group.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(content), sourceSize = sourceBox.getSize(new THREE.Vector3());
  const sourceCentre = sourceBox.getCenter(new THREE.Vector3());
  // A sub-millimetre inset avoids depth conflict with the photo surfaces.
  content.scale.set(1.0496 / sourceSize.x, .3196 / sourceSize.y, 1.0496 / sourceSize.z);
  content.position.set(-sourceCentre.x * content.scale.x, -sourceBox.min.y * content.scale.y, -sourceCentre.z * content.scale.z);
  const bodyBottom = .075 / .345 * .3196, bodyHeight = .32 - bodyBottom;
  const materials = maps.map((map, i) => new THREE.MeshBasicMaterial({
    name: ['N36 original photo complete checker top', 'N36 original photo front edge', 'N36 original photo right edge'][i],
    map, color: '#ffffff', toneMapped: false
  }));
  const addFace = (width, height, material, name, position, rotation) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.fromArray(position); mesh.rotation.set(...rotation);
    mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData = { photoSurface: true, sourceImage: 'assets/N36_coffee.webp', originalPixels: true };
    group.add(mesh); return mesh;
  };
  addFace(1.05, 1.05, materials[0], 'N36 full original-pixel checker top', [0, .32, 0], [-Math.PI / 2, 0, 0]);
  const midY = bodyBottom + bodyHeight / 2;
  addFace(1.05, bodyHeight, materials[1], 'N36 photographed front edge', [0, midY, .525], [0, 0, 0]);
  addFace(1.05, bodyHeight, materials[2], 'N36 photographed right edge', [.525, midY, 0], [0, Math.PI / 2, 0]);
  // Hidden surfaces reuse the observed side pixels; they are not new designs.
  addFace(1.05, bodyHeight, materials[1], 'N36 rear edge from observed front pixels', [0, midY, -.525], [0, Math.PI, 0]);
  addFace(1.05, bodyHeight, materials[2], 'N36 left edge from observed right pixels', [-.525, midY, 0], [0, -Math.PI / 2, 0]);
  group.name = 'N36 original photo marble checker coffee table';
  group.userData = {
    itemId: id, proxyDimensions: [1.05, 1.05, .32],
    sourceImage: 'assets/N36_coffee.webp', noNewAIGeneration: true,
    representation: 'existing-solid-model-with-original-photo-surface-planes',
    textureMethod: 'deterministic perspective crop, entire observed face per plane',
    dimensionStatus: 'design-placement-size-not-manufacturer-specification',
    note: '沿用N36已有实体及内收底座；顶面与四侧覆盖家具库原图像素。单视图未见的背侧复用可见侧面，实际尺寸与隐藏细节待核。'
  };
  group.updateMatrixWorld(true);
  return group;
}
