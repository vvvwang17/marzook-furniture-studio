import * as THREE from './vendor/three.module.js';

const ROOM_URL = new URL('./space-assets/room-scene.json', import.meta.url);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function floorElevationAt(data, x, z) {
  return (data.floorRegions || []).reduce((height, region) => {
    if (!region.outer?.length || !pointInRing(x, z, region.outer)) return height;
    return Math.max(height, finite(region.elevation));
  }, 0);
}

function isBodyBlocker(record, bounds, floorElevation) {
  if (record.visible === false || !bounds) return false;
  const category = record.category || '';
  const structure = ['wall', 'column', 'door', 'cabinet', 'fixed-cabinet'].includes(category);
  const fixedJoinery = category === 'finish' && /\b(?:fixed\s+(?:shelf|cabinet)|shelf\s+(?:back|side))\b|固定(?:柜|层架|层板)/i.test(record.name || '');
  if (!structure && !fixedJoinery) return false;
  // Ceiling beams, upper window infills and suspended artwork are not walking obstacles.
  return bounds[0][1] < floorElevation + 1.85 && bounds[1][1] > floorElevation + 0.08;
}

/**
 * Load only the native, empty architectural scene. This function adds no lights.
 * onProgress receives { phase, loaded, total, ratio, message }, ratio in [0, 1].
 * Returned floors / blockers / architecturalMeshes are THREE.Mesh arrays.
 * The caller owns the group, materials and textures and may dispose them when done.
 */
export async function loadVRRoom({ onProgress } = {}) {
  const report = (phase, loaded, total, ratio, message) => {
    if (typeof onProgress === 'function') onProgress({ phase, loaded, total, ratio, message });
  };
  report('json', 0, 1, 0, '正在读取现场建筑');
  const response = await fetch(ROOM_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`现场建筑读取失败（${response.status}）`);
  const data = await response.json();
  if (!Array.isArray(data.meshes) || !data.materials) throw new Error('现场建筑数据格式不完整');
  report('json', 1, 1, 0.2, '建筑数据已读取');

  const group = new THREE.Group();
  group.name = data.title || 'MARZOOK 客户建筑空景';
  group.userData = { kind: 'native-architecture', furnitureRemoved: data.furnitureRemoved === true, units: data.units || 'metres', coordinateSystem: data.coordinateSystem };
  const floors = [], blockers = [], architecturalMeshes = [], materials = new Map();
  const textureLoader = new THREE.TextureLoader();
  const materialEntries = Object.entries(data.materials);
  const textureTotal = materialEntries.filter(([, spec]) => typeof spec.map === 'string' && spec.map).length;
  const textureJobs = [], textureErrors = [];
  let texturesLoaded = 0, geometryLoaded = 0;
  const progressRatio = () => 0.2 + 0.35 * geometryLoaded / Math.max(1, data.meshes.length) + 0.45 * (textureTotal ? texturesLoaded / textureTotal : 1);

  for (const [key, spec] of materialEntries) {
    const opacity = finite(spec.opacity, 1);
    const material = new THREE.MeshPhysicalMaterial({
      name: spec.name || key,
      color: Array.isArray(spec.color) ? new THREE.Color(...spec.color) : spec.color || '#c9c9c2',
      roughness: finite(spec.roughness, 0.75),
      metalness: finite(spec.metalness),
      opacity,
      transparent: !!spec.transparent || opacity < 1,
      depthWrite: spec.depthWrite !== false,
      side: THREE.DoubleSide,
      clearcoat: key.toLowerCase().includes('floor') ? 0.65 : 0,
      clearcoatRoughness: 0.14,
      alphaTest: finite(spec.alphaTest)
    });
    if (spec.emissive) {
      material.emissive = Array.isArray(spec.emissive) ? new THREE.Color(...spec.emissive) : new THREE.Color(spec.emissive);
      material.emissiveIntensity = finite(spec.emissiveIntensity, 1);
    }
    material.userData = { sourceMaterial: key, source: 'room-scene.json' };
    materials.set(key, material);
    if (typeof spec.map === 'string' && spec.map) {
      // Keep the native UVs and original alpha PNGs, including all three flower mirrors.
      const textureURL = new URL(spec.map, import.meta.url);
      textureJobs.push(new Promise(resolve => {
        textureLoader.load(textureURL.href, texture => {
          texture.name = key;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = texture.wrapT = spec.wrap === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
          texture.repeat.fromArray(spec.repeat || [1, 1]);
          material.map = texture;
          material.needsUpdate = true;
          texturesLoaded += 1;
          report('textures', texturesLoaded, textureTotal, progressRatio(), '正在载入原始建筑贴图');
          resolve();
        }, undefined, () => {
          textureErrors.push(new Error(`建筑贴图读取失败：${spec.map}`));
          resolve();
        });
      }));
    }
  }

  for (let index = 0; index < data.meshes.length; index += 1) {
    const record = data.meshes[index];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(record.positions, 3));
    if (record.indices?.length) geometry.setIndex(record.indices);
    if (record.normals?.length === record.positions.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(record.normals, 3));
    else geometry.computeVertexNormals();
    if (record.uvs?.length === record.positions.length / 3 * 2) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(record.uvs, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const fallback = () => new THREE.MeshPhysicalMaterial({ color: '#cecfc8', roughness: 0.75, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, materials.get(record.material) || fallback());
    const bounds = record.bounds || [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()];
    const floorElevation = floorElevationAt(data, (bounds[0][0] + bounds[1][0]) / 2, (bounds[0][2] + bounds[1][2]) / 2);
    const collision = isBodyBlocker(record, bounds, floorElevation);
    mesh.name = record.name || record.id || `architecture-${index}`;
    mesh.visible = record.visible !== false;
    mesh.userData = { id: record.id, roomId: record.id, name: mesh.name, category: record.category || 'architecture', sourceMaterial: record.material, originalVisible: mesh.visible, bounds, floorElevation, collision };
    mesh.castShadow = record.castShadow !== false && !['ceiling', 'glass', 'floor', 'lighting'].includes(record.category);
    mesh.receiveShadow = record.receiveShadow !== false;
    group.add(mesh);
    architecturalMeshes.push(mesh);
    geometryLoaded = index + 1;
    if (mesh.visible && record.category === 'floor') floors.push(mesh);
    if (collision) blockers.push(mesh);
    if (index % 64 === 63 || index === data.meshes.length - 1) {
      report('geometry', geometryLoaded, data.meshes.length, progressRatio(), '正在组装原生建筑网格');
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  await Promise.all(textureJobs);
  if (textureErrors.length) {
    architecturalMeshes.forEach(mesh => mesh.geometry.dispose());
    materials.forEach(material => { material.map?.dispose(); material.dispose(); });
    throw textureErrors[0];
  }
  group.updateMatrixWorld(true);
  report('ready', architecturalMeshes.length, architecturalMeshes.length, 1, '现场建筑已就绪');
  return { group, data, floors, blockers, architecturalMeshes };
}
