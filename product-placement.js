// New product placement only. No saved-instance migration or automatic rehang.
// Coordinates are native room metres/Y-up. Floor height is supplied by the
// caller because furniture instance y is relative to the local finished floor.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const ceilingTriangles = new WeakMap();

function prepareCeilings(room) {
  if (!room || typeof room !== 'object') return [];
  if (ceilingTriangles.has(room)) return ceilingTriangles.get(room);
  const result = [];
  for (const mesh of room.meshes || []) {
    if (mesh.category !== 'ceiling' || mesh.visible === false) continue;
    // The native scene also labels spotlights and ventilation slots ceiling;
    // these are obstructions, not the surface to which a canopy attaches.
    if (/^Site_(?:Track|Light|HVAC)$/i.test(mesh.material || '')) continue;
    const positions = mesh.positions;
    if (!positions?.length) continue;
    const indices = mesh.indices?.length ? mesh.indices : null;
    const count = indices ? indices.length : positions.length / 3;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = (indices ? indices[i] : i) * 3;
      const b = (indices ? indices[i + 1] : i + 1) * 3;
      const c = (indices ? indices[i + 2] : i + 2) * 3;
      const p = [positions[a], positions[a + 1], positions[a + 2],
                 positions[b], positions[b + 1], positions[b + 2],
                 positions[c], positions[c + 1], positions[c + 2]];
      if (!p.every(finite)) continue;
      const denominator = (p[5] - p[8]) * (p[0] - p[6]) + (p[6] - p[3]) * (p[2] - p[8]);
      // Vertical faces have no area in plan and cannot receive a vertical ray.
      if (Math.abs(denominator) < 1e-12) continue;
      result.push({ p, denominator, name: mesh.name || mesh.id || '',
        minX: Math.min(p[0], p[3], p[6]), maxX: Math.max(p[0], p[3], p[6]),
        minZ: Math.min(p[2], p[5], p[8]), maxZ: Math.max(p[2], p[5], p[8]) });
    }
  }
  ceilingTriangles.set(room, result);
  return result;
}

/** Return the lowest actual ceiling triangle above x/z, never a mesh AABB. */
export function ceilingHeightAt(room, x, z, minimumY = 0) {
  if (![x, z, minimumY].every(finite)) return null;
  const epsilon = 1e-8;
  let hit = null;
  for (const triangle of prepareCeilings(room)) {
    const { p, denominator } = triangle;
    if (x < triangle.minX - epsilon || x > triangle.maxX + epsilon ||
        z < triangle.minZ - epsilon || z > triangle.maxZ + epsilon) continue;
    const a = ((p[5] - p[8]) * (x - p[6]) + (p[6] - p[3]) * (z - p[8])) / denominator;
    const b = ((p[8] - p[2]) * (x - p[6]) + (p[0] - p[6]) * (z - p[8])) / denominator;
    const c = 1 - a - b;
    if (Math.min(a, b, c) < -epsilon || Math.max(a, b, c) > 1 + epsilon) continue;
    const y = a * p[1] + b * p[4] + c * p[7];
    if (y < minimumY - epsilon || hit && y >= hit.height) continue;
    hit = { height: y, name: triangle.name };
  }
  return hit;
}

/**
 * Only a model explicitly marked ceiling-mounted opts into this new default.
 * Existing products/proxies retain the previous 2.4m-or-floor rule exactly.
 * Called after the final valid plan position; drag/reload never calls it.
 */
export function initialProductElevation({ itemName = '', representation = 'model', provenance = {},
  room, x, z, floorElevation = 0, height, maximumElevation = 4 } = {}) {
  const legacyElevation = /吊灯/.test(itemName) ? 2.4 : 0;
  if (representation !== 'model' || provenance?.mountType !== 'ceiling') {
    return { elevation: legacyElevation, kind: 'legacy' };
  }
  const floor = finite(floorElevation) ? floorElevation : 0;
  const limit = finite(maximumElevation) && maximumElevation >= 0 ? maximumElevation : 4;
  const requested = provenance.recommendedBottomHeightM;
  const recommended = Math.min(limit, Math.max(0, finite(requested) ? requested : 1.95));
  const suppliedAnchor = provenance.mountAnchorM?.[1];
  const anchorY = finite(suppliedAnchor) && suppliedAnchor > 0 ? suppliedAnchor : height;
  const hit = ceilingHeightAt(room, x, z, floor + 0.1);
  if (hit && finite(anchorY) && anchorY > 0) {
    const elevation = hit.height - floor - anchorY;
    if (elevation >= 0 && elevation <= limit) {
      return { elevation, kind: 'ceiling', ceilingHeightM: hit.height, ceilingName: hit.name, note: '' };
    }
  }
  return { elevation: recommended, kind: 'recommended', ceilingHeightM: hit?.height ?? null,
    note: hit ? '当前天花高度与这款固定吊杆不适配，暂按建议离地高度放置，吸顶连接需调整。'
              : '该落点未找到可覆盖的天花，暂按建议离地高度放置，吸顶位置需调整。' };
}
