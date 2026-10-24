import * as THREE from './vendor/three.module.js';

// Manually modelled layout studies, using pixels cropped from the named products.
// These are not manufacturer CAD and must not be used as fabrication drawings.
// Materials: fine flat weave / smooth leather / painted metal / stone. No
// travertine, shag, sheepskin, boucle, or generated product-image pixels.
const ROOT = './assets/round-hall/';
const loader = new THREE.TextureLoader();
const images = new Map();
const RULES = { noTravertine: true, noShag: true, noBoucle: true, noAIGeneration: true };

async function texture(file) {
  const url = new URL(ROOT + file, import.meta.url).href;
  if (!images.has(url)) images.set(url, loader.loadAsync(url).then(t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }));
  return (await images.get(url)).clone();
}

function study(group, id, label, dimensions, note, sourceImage) {
  group.name = label;
  group.userData = {
    ...RULES, itemId: id, catalogId: id, label, dimensions,
    dimensionStatus: 'estimated', matchStatus: 'layout-study',
    materialNotes: '细密平织或光滑硬质表面；无洞石、无长毛绒、无羊羔绒。',
    sourceImage, manualLayoutStudy: true,
    modelProvenance: { kind: 'manual-layout-study', referenceIds: [id], note },
    note,
  };
  return group;
}

function mesh(geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function roundedBox(width, height, depth, radius, material, puff = 0, puffAxis = 'y') {
  const g = new THREE.BoxGeometry(width, height, depth, 18, 14, 18);
  const p = g.attributes.position;
  const inner = new THREE.Vector3(width / 2 - radius, height / 2 - radius, depth / 2 - radius);
  const v = new THREE.Vector3(), c = new THREE.Vector3(), delta = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -inner.x, inner.x), THREE.MathUtils.clamp(v.y, -inner.y, inner.y), THREE.MathUtils.clamp(v.z, -inner.z, inner.z));
    delta.copy(v).sub(c).normalize().multiplyScalar(radius);
    c.add(delta);
    if (puffAxis === 'y') c.y += Math.sign(c.y) * puff * Math.max(0, 1 - (c.x / (width / 2)) ** 2) * Math.max(0, 1 - (c.z / (depth / 2)) ** 2);
    if (puffAxis === 'z') c.z += Math.sign(c.z) * puff * Math.max(0, 1 - (c.x / (width / 2)) ** 2) * Math.max(0, 1 - (c.y / (height / 2)) ** 2);
    p.setXYZ(i, c.x, c.y, c.z);
  }
  g.computeVertexNormals();
  return mesh(g, material);
}

/** N42 two-colour armless chair. Ground y=0; front +Z; W1.02 D1.05 H0.80m. */
export async function createPukkaChair() {
  const [seatMap, backMap] = await Promise.all([texture('N42-seat-crop.jpg'), texture('N42-back-crop.jpg')]);
  seatMap.wrapS = seatMap.wrapT = backMap.wrapS = backMap.wrapT = THREE.RepeatWrapping;
  seatMap.repeat.set(3.1, 3.1);
  backMap.repeat.set(3.2, 2.2);
  const seatMaterial = new THREE.MeshStandardMaterial({ map: seatMap, color: 0xffffff, roughness: .94, metalness: 0 });
  const backMaterial = new THREE.MeshStandardMaterial({ map: backMap, color: 0xffffff, roughness: .94, metalness: 0 });
  const group = new THREE.Group();
  const seat = roundedBox(1.02, .36, .99, .17, seatMaterial, .028, 'y');
  seat.name = 'N42 · 赭黄色细密平织坐垫';
  seat.position.set(0, .225, .03);
  seat.rotation.x = .035;
  group.add(seat);
  const back = roundedBox(.99, .57, .33, .15, backMaterial, .028, 'z');
  back.name = 'N42 · 红棕色细密平织靠背';
  back.position.set(0, .51, -.32);
  back.rotation.x = -.15;
  group.add(back);
  const foot = mesh(new THREE.CylinderGeometry(.35, .35, .045, 36), new THREE.MeshStandardMaterial({ color: 0x30241d, roughness: .88 }));
  foot.position.y = .023;
  group.add(foot);
  // Normalize the study to the intended overall bounding box after rounding.
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3());
  const content = new THREE.Group();
  [...group.children].forEach(child => content.add(child));
  content.position.y = -box.min.y;
  group.add(content);
  group.scale.set(1.02 / size.x, .80 / size.y, 1.05 / size.z);
  return study(group, 'N42_chair', 'N42 赭黄棕双色泡芙单椅 · 手工试摆', [1.02, 1.05, .80],
    '几何为根据库图手工制作的体量试摆；细密平织双色贴图直接裁自库白底图，非boucle。尺寸估算，订货需供应商复核。', 'assets/N42_chair.webp');
}

function strap(a, b, material, width = .022) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const band = mesh(new THREE.BoxGeometry(width, direction.length(), .006), material);
  band.position.copy(start).add(end).multiplyScalar(.5);
  band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return band;
}

function emissiveDisk(radius, y, x, z, group, intensity = 1.3) {
  const disk = mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshStandardMaterial({
    color: 0xffefcf, emissive: 0xffdba0, emissiveIntensity: intensity, side: THREE.DoubleSide, roughness: .55,
  }));
  disk.rotation.x = Math.PI / 2;
  disk.position.set(x, y, z);
  group.add(disk);
}

/** W23_03 connected three-lamp belt study. Ceiling at root y=0, bottom=-.75m. */
export async function createBeltPendant({ width = 1.25, drop = .75, lights = true } = {}) {
  const group = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x511e24, roughness: .66, metalness: .03 });
  const painted = new THREE.MeshStandardMaterial({ color: 0x4e2529, roughness: .42, metalness: .15, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x141413, roughness: .44, metalness: .45 });
  const sx = width / 1.25, dy = drop / .75;
  const left = [-.425 * sx, -.665 * dy, .02], centre = [-.02 * sx, -.535 * dy, 0], right = [.425 * sx, -.475 * dy, -.025];
  const anchors = [[left[0], -.045, .02], [-.12 * sx, -.045, 0], [right[0], -.045, -.025]];
  for (const p of anchors) {
    const cap = mesh(new THREE.CylinderGeometry(.035, .035, .06, 24), black);
    cap.position.set(p[0], -.03, p[2]);
    group.add(cap);
  }
  for (const [a, b] of [[anchors[0], left], [left, anchors[1]], [anchors[1], centre], [centre, anchors[2]], [anchors[2], right]]) group.add(strap(a, b, leather));
  for (const p of [left, centre, right]) {
    const connector = mesh(new THREE.BoxGeometry(.034, .023, .019), black);
    connector.position.set(...p);
    group.add(connector);
  }
  const profile = [[0, .065], [.027, .06], [.038, .028], [.072, .006], [.17, -.006], [.2, -.018]].map(([x, y]) => new THREE.Vector2(x, y));
  const dish = mesh(new THREE.LatheGeometry(profile, 64), painted);
  dish.position.set(left[0], -.72 * dy, left[2]);
  group.add(dish);
  emissiveDisk(.188, -.738 * dy, left[0], left[2], group);
  const globe = mesh(new THREE.SphereGeometry(.078, 40, 24), new THREE.MeshStandardMaterial({ color: 0xfff3d8, roughness: .3, emissive: 0xffdbae, emissiveIntensity: .9 }));
  globe.position.set(centre[0], -.61 * dy, centre[2]);
  group.add(globe);
  const dome = mesh(new THREE.SphereGeometry(.171, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), painted);
  dome.scale.y = 1.05;
  dome.position.set(right[0], -.615 * dy, right[2]);
  group.add(dome);
  emissiveDisk(.168, -.617 * dy, right[0], right[2], group);
  if (lights) for (const p of [[left[0], -.76 * dy, left[2]], [centre[0], -.61 * dy, centre[2]], [right[0], -.64 * dy, right[2]]]) {
    const light = new THREE.PointLight(0xffd2a2, 3, 1.7, 2);
    light.position.set(...p);
    group.add(light);
  }
  return study(group, 'W23_03', 'W23_03 酒红皮带三灯 · 手工试摆', [width, .4, drop],
    '按客户确认的同一组五段皮带/三头灯手工建模；顶盘、连接件及浅盘/球罩/半球罩为估算体量，非厂家CAD。光滑酒红皮带，无洞石、无毛绒。', 'assets/W23_03_combination.webp');
}

/** Six independent photographed stone faces mounted on a curved wall, facing +Z. */
export async function createRockSconces({ curveRadius = 2.94, lights = true } = {}) {
  const meta = await fetch(new URL(ROOT + 'rocks-source-crops.json', import.meta.url)).then(r => {
    if (!r.ok) throw new Error('原石灯裁图说明读取失败');
    return r.json();
  });
  const maps = await Promise.all(meta.map(m => texture(m.image)));
  const positions = [[-.61, .01], [-.21, .31], [.27, .28], [.62, -.03], [-.22, -.29], [.27, -.31]];
  const widths = [.23, .25, .33, .24, .23, .41];
  const group = new THREE.Group();
  meta.forEach((entry, i) => {
    const rock = new THREE.Group(), [x, y] = positions[i], width = widths[i], height = width / entry.aspect;
    const shape = new THREE.Shape(entry.outline.map(([u, v]) => new THREE.Vector2((u - .5) * width, (v - .5) * height)));
    const body = mesh(new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x715039, roughness: .93 }));
    body.position.z = .004;
    rock.add(body);
    const face = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: maps[i], transparent: true, alphaTest: .5, roughness: .97, metalness: 0, side: THREE.DoubleSide }));
    face.position.z = .040;
    face.castShadow = false;
    rock.add(face);
    if (lights) {
      const light = new THREE.PointLight(0xffd5a3, .9, .65, 2);
      light.position.set(0, 0, .003);
      rock.add(light);
    }
    const z = curveRadius > 0 ? curveRadius - Math.sqrt(Math.max(0, curveRadius * curveRadius - x * x)) : 0;
    rock.position.set(x, y, z);
    rock.rotation.y = curveRadius > 0 ? -Math.asin(x / curveRadius) : 0;
    rock.name = `LT23_07 · 独立原石壁灯 ${i + 1}`;
    rock.userData = { itemId: 'LT23_07', individualSconce: true, sourceCrop: entry.sourceCrop, dimensions: [width, .035, height], dimensionStatus: 'estimated', mountX: x, mountY: y, ...RULES };
    group.add(rock);
  });
  return study(group, 'LT23_07', 'LT23_07 原石背光六件壁灯 · 独立贴弧', [1.45, .08, 1.05],
    '六颗各自贴圆厅曲墙；灯面像素直接从客户指定库图逐颗裁出，轮廓人工描边，不重绘石纹。库图已有补纹历史；本次未用AI。石种与实际单颗尺寸待供应商复核，不指定洞石。', 'assets/LT23_07.webp');
}

/** Official 5mm flatwoven Goose Eye Icon Queens product photograph on a floor plane. */
export async function createRug({ width = 3.66, depth = 2.74 } = {}) {
  const map = await texture('goose-eye-queens881-flat.webp');
  // Orient the long side of the original flatshot along the room's X direction.
  map.center.set(.5, .5);
  map.rotation = Math.PI / 2;
  const group = new THREE.Group();
  const rug = mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 1, metalness: 0, transparent: true, alphaTest: .65, side: THREE.DoubleSide }));
  rug.name = 'Kasthall Goose Eye Icon 881 Queens · 5mm平织';
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = .008;
  rug.castShadow = false;
  group.add(rug);
  study(group, 'external-kasthall-goose-eye-881', 'Kasthall Goose Eye Icon 881 Queens · 平织', [width, depth, .005],
    '官方平拍纹理，羊毛纬线/亚麻经线，官网总厚约5mm，非长毛或boucle。这里为可定尺试摆，图案随幅面缩放；尺寸±5%，定制尺寸与底背处理须厂家报价确认。无洞石。', 'assets/round-hall/goose-eye-queens881-flat.webp');
  group.userData.dimensionStatus = 'proposed-custom-size';
  group.userData.sourceUrl = 'https://www.kasthall.com/en-us/products/goose-eye-icon-881-queens-woven';
  group.userData.materialNotes = '100%羊毛纬线 / 100%亚麻经线；约5mm细密平织。无长毛绒、无羊羔绒、无boucle。';
  return group;
}

export { RULES as ROUND_HALL_MATERIAL_RULES };
