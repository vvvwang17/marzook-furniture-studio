import * as THREE from './vendor/three.module.js';

// Selected official product photographs are displayed whole, using contain
// proportions. Neither artwork is cropped, redrawn, stretched or generated.
const CENTRE = [14.357672, -14.354757];
const WALL_RADIUS = 2.9973; // native architectural mesh raycast at this wall
const CAD_ANGLE_DEGREES = 152;
const FRAME = .018, MAT = .025, DEPTH = .035, EDGE_GAP = .018;
const loader = new THREE.TextureLoader(), maps = new Map();

function specification(number, artist, title, file, paper, pixels, productUrl) {
  const outer = [paper[0] + 2 * (MAT + FRAME), paper[1] + 2 * (MAT + FRAME), DEPTH];
  // A flat frame is inset to the chord of the curved wall. Its farthest back
  // corners retain an 18mm clearance instead of cutting through the wall.
  const rearRadius = Math.sqrt(WALL_RADIUS ** 2 - (outer[0] / 2) ** 2) - EDGE_GAP;
  const angle = THREE.MathUtils.degToRad(CAD_ANGLE_DEGREES);
  const contain = Math.min(paper[0] / pixels[0], paper[1] / pixels[1]);
  return Object.freeze({
    number, artist, title, file, productUrl, orientation: paper[0] > paper[1] ? 'landscape' : 'portrait',
    paperSize: [...paper], sourcePixels: [...pixels], visibleImageSize: [pixels[0] * contain, pixels[1] * contain],
    outerDimensions: outer, frameWidth: FRAME, matBorder: MAT, frameDepth: DEPTH,
    position: [CENTRE[0] + rearRadius * Math.cos(angle), 1.68, CENTRE[1] - rearRadius * Math.sin(angle)],
    rotationYDegrees: CAD_ANGLE_DEGREES - 90, cadWallAngleDegrees: CAD_ANGLE_DEGREES,
    rearPlaneRadius: rearRadius, wallRadius: WALL_RADIUS,
    centreBackStandOff: WALL_RADIUS - rearRadius, edgeBackClearance: EDGE_GAP,
    placement: 'Left of the northwest window, on the continuous west/northwest solid curved wall',
    sizingNote: number === 1
      ? 'DIA official maximum image option approximately1016x721mm; complete source photograph is contained within this nominal image area. Paper edges and outer framing are a design allowance, to be confirmed with the print supplier.'
      : 'The Poster Club lists70x100cm as an available paper size. Complete product photograph, including its own white margin, is contained within the70x100cm area. Frame and extra mat are design allowances.'
  });
}

export const ART_SPECS = Object.freeze({
  1: specification(1, 'Franz Kline', 'Siskind, 1958', 'art-01-kline-siskind.jpg', [1.016, .721], [1200, 857],
    'https://customprints.dia.org/detail/502431/kline-siskind-1958'),
  6: specification(6, 'Malene Birger', 'Organized', 'art-06-malene-organized.jpg', [.70, 1.00], [992, 1389],
    'https://theposterclub.com/products/malene-birger-organized')
});

function part(w, h, d, material, x, y, z, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.name = name;
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

/** Return a fully world-positioned, flat, framed artwork facing the room. */
export async function createRoundArtwork(number = 1) {
  const n = Number(number), spec = ART_SPECS[n];
  if (!spec) throw new Error('本轮挂画仅包含客户所选01与06');
  if (!maps.has(n)) maps.set(n, loader.loadAsync(new URL('./assets/round-hall-new/' + spec.file, import.meta.url).href).then(map => {
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; return map;
  }));
  const map = await maps.get(n), group = new THREE.Group();
  const [w, h] = spec.outerDimensions, innerW = w - 2 * FRAME, innerH = h - 2 * FRAME;
  const black = new THREE.MeshStandardMaterial({ color: '#171716', roughness: .78, metalness: .12 });
  const mat = new THREE.MeshStandardMaterial({ color: '#f5f1e8', roughness: .98, metalness: 0 });
  const back = new THREE.MeshStandardMaterial({ color: '#4b4841', roughness: .95 });
  group.add(part(w, h, .008, back, 0, 0, .004, 'Rigid backing behind a flat frame'));
  group.add(part(innerW, innerH, .012, mat, 0, 0, .014, 'Warm white conservation mat'));
  for (const [x, y, fw, fh, label] of [
    [0, (h - FRAME) / 2, w, FRAME, 'top'], [0, -(h - FRAME) / 2, w, FRAME, 'bottom'],
    [-(w - FRAME) / 2, 0, FRAME, h - 2 * FRAME, 'left'], [(w - FRAME) / 2, 0, FRAME, h - 2 * FRAME, 'right']
  ]) group.add(part(fw, fh, DEPTH, black, x, y, DEPTH / 2, '18mm matte black frame ' + label));
  const image = new THREE.Mesh(new THREE.PlaneGeometry(...spec.visibleImageSize), new THREE.MeshBasicMaterial({ map, color: '#ffffff', toneMapped: false }));
  image.position.z = .021; image.name = `${spec.artist} — ${spec.title} · complete official image`;
  image.castShadow = false; image.receiveShadow = false;
  image.userData = { completeImage: true, originalAspectPreserved: true, noCrop: true, imageSource: spec.productUrl };
  group.add(image);
  // Two short brackets bridge the central gap to the real curved wall. They
  // sit behind the opaque backing and do not require bending the frame.
  const bracketX = Math.min(.30, innerW * .30);
  for (const x of [-bracketX, bracketX]) {
    const gap = Math.sqrt(WALL_RADIUS ** 2 - x ** 2) - spec.rearPlaneRadius - .008;
    group.add(part(.045, .05, Math.max(.012, gap), black, x, h * .25, -gap / 2, 'Recessed curved-wall mounting bracket'));
  }
  group.name = `Selected artwork ${String(n).padStart(2, '0')} — ${spec.title}`;
  group.position.fromArray(spec.position); group.rotation.y = THREE.MathUtils.degToRad(spec.rotationYDegrees);
  group.userData = {
    type: 'selected-artwork-study', artworkNumber: n, artist: spec.artist, title: spec.title, productUrl: spec.productUrl,
    originalPixels: true, noAIGeneration: true, completeOriginalComposition: true, flatFrameOnBrackets: true,
    spec, dimensionsStatus: 'nominal-print-size-with-proposed-frame; verify-site-and-supplier',
    note: '客户已选作品01/06的完整官方展示图；按原比例入平框，支架离开曲墙，未把作品弯成弧面。未改动现有A/B VR方案。'
  };
  return group;
}
