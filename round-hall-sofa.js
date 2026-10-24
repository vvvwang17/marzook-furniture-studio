import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// Design geometry only. The source product identity, fabric and component
// shapes are retained; the proposed curvature requires manufacturer detailing.
export const CURVED_SOFA_SPEC = Object.freeze({
  id: 'P01-sofa-curved-study', sourceIds: ['P01_sofa'], outerRadius: 2.5,
  innerRadius: 1.5, centrelineRadius: 2, angleDegrees: 100,
  outerChord: 3.830222, outerArcLength: 4.363323, centrelineArcLength: 3.490659,
  seatCount: 3, nominalDepth: 1, status: 'custom-design-not-production-CAD'
});
export const MODULAR_SOFA_SPEC = Object.freeze({
  id: 'P08-sofa-curved-modular-study', sourceIds: ['P08_sofafabric', 'P08_sofagreen'],
  outerRadius: 2.45, innerRadius: 1.45, centrelineRadius: 1.95,
  angleDegrees: 104, outerChord: 3.861, nominalDepth: 1, seatCount: 3,
  status: 'custom-design-not-production-CAD'
});

const deg = THREE.MathUtils.degToRad;
const sourceURL = new URL('./space-assets/models/P01_sofa_photo_reconstruction.glb', import.meta.url);
let sourcePromise;
const loader = new THREE.TextureLoader();

function splitGeometry(geometry) {
  const pos = geometry.getAttribute('position');
  const index = geometry.index?.array || Uint32Array.from({ length: pos.count }, (_, i) => i);
  const parent = Int32Array.from({ length: pos.count }, (_, i) => i);
  const find = n => { while (parent[n] !== n) n = parent[n] = parent[parent[n]]; return n; };
  for (let i = 0; i < index.length; i += 3) {
    parent[find(index[i])] = find(index[i + 1]);
    parent[find(index[i])] = find(index[i + 2]);
  }
  const components = new Map();
  for (let i = 0; i < pos.count; i++) {
    const root = find(i); if (!components.has(root)) components.set(root, []); components.get(root).push(i);
  }
  return [...components.values()].map(vertices => {
    const remap = new Map(vertices.map((v, i) => [v, i])), g = new THREE.BufferGeometry();
    for (const key of ['position', 'normal', 'uv']) {
      const attr = geometry.getAttribute(key); if (!attr) continue;
      const values = new Float32Array(vertices.length * attr.itemSize);
      vertices.forEach((v, i) => { for (let k = 0; k < attr.itemSize; k++) values[i * attr.itemSize + k] = attr.array[v * attr.itemSize + k]; });
      g.setAttribute(key, new THREE.BufferAttribute(values, attr.itemSize));
    }
    const ids = [];
    for (let i = 0; i < index.length; i += 3) if (remap.has(index[i])) ids.push(remap.get(index[i]), remap.get(index[i + 1]), remap.get(index[i + 2]));
    g.setIndex(ids); g.computeBoundingBox(); return g;
  });
}

function deform(geometry, transform) {
  const g = geometry.clone(), a = g.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    v.fromBufferAttribute(a, i); transform(v); a.setXYZ(i, v.x, v.y, v.z);
  }
  a.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}

function curvedPoint(s, y, radius, centreline = 2) {
  const angle = s / centreline;
  return new THREE.Vector3(radius * Math.sin(angle), y, -radius * Math.cos(angle));
}

function finishGroup(group, spec) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group), center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
  for (const child of group.children) child.position.add(offset);
  group.userData = {
    customSofa: true, spec: { ...spec }, arcCentreLocal: [offset.x, 0, offset.z],
    sourceIds: [...spec.sourceIds], representation: 'dimensioned-custom-geometry',
    note: '按家具库原款推演的定制弧形设计；保留原图/原模型取纹。本次未使用AI图像合成；尺寸及不可见结构需家具厂家深化。'
  };
  group.updateMatrixWorld(true);
  group.userData.dimensions = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray();
  group.userData.proxyDimensions = [group.userData.dimensions[0], group.userData.dimensions[2], group.userData.dimensions[1]];
  group.name = spec.id;
  return group;
}

// The returned object is bounding-box centred at ground Y=0 and faces +Z.
// Use this helper to place its mathematical arc centre at the room centre.
export function placeSofaAtArcCentre(group, x, z, rotation = 0) {
  const offset = new THREE.Vector3(...group.userData.arcCentreLocal).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  group.rotation.y = rotation; group.position.set(x - offset.x, -offset.y, z - offset.z);
  return group;
}

export async function createCurvedSofa() {
  sourcePromise ||= new GLTFLoader().loadAsync(sourceURL.href);
  const { scene } = await sourcePromise, group = new THREE.Group();
  const sourceMeshes = []; scene.traverse(o => { if (o.isMesh) sourceMeshes.push(o); });
  const add = (g, material, name, mapX) => {
    const curved = deform(g, v => {
      const s = mapX(v.x), radius = 2.5 - (v.z + .465) / 1.035;
      v.copy(curvedPoint(s, v.y, radius));
    });
    const mesh = new THREE.Mesh(curved, material.clone()); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  };
  const base = sourceMeshes.find(o => /espresso/i.test(o.name));
  const upholstery = sourceMeshes.find(o => /jacquard/i.test(o.name));
  const seams = sourceMeshes.find(o => /seam/i.test(o.name));
  if (!base || !upholstery) throw new Error('P01原款模型缺少软包或底座');
  const pieces = splitGeometry(upholstery.geometry);
  const seat = pieces.find(g => g.boundingBox.max.y < .5 && g.boundingBox.min.x < -.5);
  const back = pieces.find(g => g.boundingBox.max.y > .8 && g.boundingBox.min.x < -.5);
  const rear = pieces.find(g => g.boundingBox.min.x < -.98 && g.boundingBox.max.x > .98);
  const left = pieces.find(g => g.boundingBox.min.x < -1.2);
  const right = pieces.find(g => g.boundingBox.max.x > 1.2);
  if (![seat, back, rear, left, right].every(Boolean)) throw new Error('P01原款组件结构与预期不符');
  add(base.geometry, base.material, 'P01 定制弧形内收深棕底座', x => x * 1.47);
  add(rear, upholstery.material, 'P01 连续弧形后壳', x => x * 1.39);
  for (const [i, centre] of [-.94, 0, .94].entries()) {
    add(seat, upholstery.material, `P01 云纹弧形坐垫 ${i + 1}`, x => (x + .49) * .98 + centre);
    add(back, upholstery.material, `P01 云纹独立靠包 ${i + 1}`, x => (x + .49) * .95 + centre);
  }
  add(left, upholstery.material, 'P01 左端圆臂', x => (x + 1.055) * .92 - 1.575);
  add(right, upholstery.material, 'P01 右端圆臂', x => (x - 1.055) * .92 + 1.575);
  if (seams) {
    const seam = splitGeometry(seams.geometry)[0];
    for (const [i, centre] of [-.94, 0, .94].entries()) add(seam, seams.material, `P01 靠包缝线 ${i + 1}`, x => (x + .49) * .95 + centre);
  }
  return finishGroup(group, CURVED_SOFA_SPEC);
}

function roundedBox(width, height, depth, radius = .06) {
  const g = new THREE.BoxGeometry(width, height, depth, 24, 12, 14), a = g.attributes.position;
  const core = new THREE.Vector3(width / 2 - radius, height / 2 - radius, depth / 2 - radius);
  const p = new THREE.Vector3(), q = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    p.fromBufferAttribute(a, i); q.copy(p).clamp(core.clone().negate(), core);
    normal.subVectors(p, q); if (normal.lengthSq()) normal.normalize().multiplyScalar(radius); p.copy(q).add(normal); a.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals(); return g;
}

async function imagePatch(path, crop) {
  const original = await loader.loadAsync(new URL(path, import.meta.url).href);
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(original.image, ...crop, 0, 0, 384, 384);
  // Remove only photographic lighting gradients before repeating the measured
  // textile/skin grain. This prevents the small source crop becoming a grid of
  // light/dark squares on the new upholstery; no texture is invented.
  const pixels = ctx.getImageData(0, 0, 384, 384), raw = new Uint8ClampedArray(pixels.data);
  for (let c = 0; c < 3; c++) {
    const integral = new Float64Array(385 * 385); let total = 0;
    for (let y = 0; y < 384; y++) { let row = 0;
      for (let x = 0; x < 384; x++) { const value = raw[(y * 384 + x) * 4 + c]; row += value; total += value; integral[(y + 1) * 385 + x + 1] = integral[y * 385 + x + 1] + row; }
    }
    const mean = total / (384 * 384);
    for (let y = 0; y < 384; y++) for (let x = 0; x < 384; x++) {
      const x0 = Math.max(0, x - 22), x1 = Math.min(384, x + 23), y0 = Math.max(0, y - 22), y1 = Math.min(384, y + 23);
      const local = (integral[y1 * 385 + x1] - integral[y0 * 385 + x1] - integral[y1 * 385 + x0] + integral[y0 * 385 + x0]) / ((x1 - x0) * (y1 - y0));
      pixels.data[(y * 384 + x) * 4 + c] = mean + raw[(y * 384 + x) * 4 + c] - local;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 2); texture.anisotropy = 8;
  original.dispose(); return texture;
}

export async function createModularSofa() {
  const [fabricMap, leatherMap] = await Promise.all([
    imagePatch('./assets/P08_sofafabric.webp', [170, 250, 120, 90]),
    imagePatch('./assets/P08_sofagreen.webp', [1170, 460, 120, 70])
  ]);
  const fabric = new THREE.MeshStandardMaterial({ map: fabricMap, roughness: .94 });
  const leather = new THREE.MeshStandardMaterial({ map: leatherMap, roughness: .65 });
  const saddle = new THREE.MeshStandardMaterial({ color: '#815638', roughness: .61 });
  const metal = new THREE.MeshStandardMaterial({ color: '#a77b41', metalness: .76, roughness: .28 });
  const espresso = new THREE.MeshStandardMaterial({ color: '#30251c', roughness: .65 });
  const group = new THREE.Group(), R = 1.95;
  const add = (g, material, name, centreS = 0, centreY = 0, centreR = R) => {
    const curved = deform(g, v => v.copy(curvedPoint(v.x + centreS, v.y + centreY, centreR - v.z, R)));
    const mesh = new THREE.Mesh(curved, material); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const span = R * deg(33.5);
  for (const [i, angle] of [-35, 0, 35].entries()) {
    const s = R * deg(angle), material = i === 1 ? leather : fabric;
    add(roundedBox(span, .10, .92, .04), espresso, `P08 模块 ${i + 1} 内收底脚`, s, .07, R);
    add(roundedBox(span, .12, .98, .045), saddle, `P08 模块 ${i + 1} 皮框底座`, s, .16, R);
    add(roundedBox(span - .025, .29, .78, .09), material, `P08 模块 ${i + 1} 扇形坐垫`, s, .355, 1.86);
    add(roundedBox(span - .02, .53, .25, .075), material, `P08 模块 ${i + 1} 独立靠背`, s, .635, 2.315);
    add(roundedBox(span, .49, .09, .035), saddle, `P08 模块 ${i + 1} 背部皮框`, s, .455, 2.40);
  }
  const endS = R * deg(50), armSpan = R * deg(4);
  for (const side of [-1, 1]) {
    add(roundedBox(armSpan, .48, .95, .05), saddle, `P08 ${side < 0 ? '左' : '右'}端绑带扶手框`, side * endS, .43, R);
    add(roundedBox(armSpan + .025, .115, .945, .045), side < 0 ? fabric : leather, 'P08 扶手软包', side * endS, .715, R);
    for (const y of [.29, .43, .57]) {
      const ss = side * (endS + armSpan / 2 + .014);
      add(roundedBox(.026, .075, .75, .008), saddle, 'P08 水平皮带', ss, y, R);
      // Square metal buckle, modelled separately from the leather belt.
      const points = [[0,-.047,-.067],[0,.047,-.067],[0,.047,.067],[0,-.047,.067],[0,-.047,-.067]].map(p => new THREE.Vector3(...p));
      const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
      add(new THREE.TubeGeometry(curve, 28, .008, 6, true), metal, 'P08 黄铜方扣', ss + side * .012, y, 1.89);
    }
  }
  // One slim lumbar per module keeps the composition calm and retains the
  // original tan strap detail without inventing a different print.
  for (const [i, angle] of [-35, 0, 35].entries()) {
    const s = R * deg(angle);
    add(roundedBox(.66, .28, .15, .055), i === 1 ? fabric : leather, 'P08 低腰靠包', s, .59, 2.12);
    add(roundedBox(.075, .275, .157, .012), saddle, 'P08 腰包皮带', s, .59, 2.12);
  }
  return finishGroup(group, MODULAR_SOFA_SPEC);
}

export function sofaFootprint(spec = CURVED_SOFA_SPEC, samples = 80) {
  const points = [], half = deg(spec.angleDegrees) / 2;
  for (let i = 0; i <= samples; i++) { const a = -half + 2 * half * i / samples; points.push([spec.outerRadius * Math.sin(a), -spec.outerRadius * Math.cos(a)]); }
  for (let i = samples; i >= 0; i--) { const a = -half + 2 * half * i / samples; points.push([spec.innerRadius * Math.sin(a), -spec.innerRadius * Math.cos(a)]); }
  return points;
}
