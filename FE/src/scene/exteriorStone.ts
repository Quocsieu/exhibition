import * as THREE from 'three';

/** Fine limestone pores, shared by the fountain's stone surfaces only. */
export function createFountainStoneHeight(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 1937;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 150 + (seed % 70) - (seed % 37 === 0 ? 90 : 0);
    data.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Planar UVs on each stone face, in normalized scene metres. No geometry displacement. */
export function setStoneUVs(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
    uv[i * 2] = (nx > ny && nx > nz ? positions.getZ(i) : positions.getX(i)) * 3;
    uv[i * 2 + 1] = (ny >= nx && ny >= nz ? positions.getZ(i) : positions.getY(i)) * 3;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export const FOUNTAIN_STONE_COLORS: Record<string, string> = {
  mat22: '#a49c8f', mat15: '#c9c3b5', mat16: '#8e9997',
  mat17: '#aaa495', mat11: '#b8b0a0',
};
