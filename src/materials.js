import * as THREE from 'three';

// 色は見本の画面から拾った(白い外装・オレンジの差し色・赤い車輪・黒いレンズ)
export const COLORS = {
  shell: 0xf2f0ec,
  orange: 0xef5b2b,
  wheel: 0xd8432e,
  dark: 0x1d1e21,
  metal: 0x9a9da1,
  glass: 0x07080a,
  background: 0xeeece8,
  floorLine: 0xc4bfb7,
};

export function makeMaterials() {
  return {
    shell: new THREE.MeshPhysicalMaterial({ color: COLORS.shell, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
    orange: new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.45, side: THREE.DoubleSide }),
    wheel: new THREE.MeshStandardMaterial({ color: COLORS.wheel, roughness: 0.55 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.5, metalness: 0.15 }),
    metal: new THREE.MeshStandardMaterial({ color: COLORS.metal, roughness: 0.32, metalness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: COLORS.glass, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
  };
}
