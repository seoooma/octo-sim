import * as THREE from 'three';

// 色は見本の画面から拾った(白い外装・オレンジの差し色・赤い車輪・黒いレンズ)
export const COLORS = {
  shell: 0xf2f0ec,
  orange: 0xef5b2b,
  wheel: 0xd8432e,
  dark: 0x2a2c30,
  metal: 0x9a9da1,
  glass: 0x07080a,
  background: 0xeeece8,
  floorLine: 0xc4bfb7,
};

export function makeMaterials() {
  const shell = new THREE.MeshPhysicalMaterial({ color: COLORS.shell, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.5, metalness: 0.15 });
  return {
    shell,
    shellDS: Object.assign(shell.clone(), { side: THREE.DoubleSide }),
    // 外套の花びら(開くと裏が見えるので両面)
    petal: Object.assign(shell.clone(), { side: THREE.DoubleSide }),
    orange: new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.45, side: THREE.DoubleSide }),
    // 目の縁(走査のとき光る)
    eyeRim: new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.45, emissive: COLORS.orange, emissiveIntensity: 0 }),
    wheel: new THREE.MeshStandardMaterial({ color: COLORS.wheel, roughness: 0.55 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.8 }),
    dark,
    darkDS: Object.assign(dark.clone(), { side: THREE.DoubleSide }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }),
    cable: new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.55, metalness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ color: COLORS.metal, roughness: 0.32, metalness: 0.85 }),
    irisBlade: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.3, metalness: 0.7, side: THREE.DoubleSide }),
    // 暗く深いレンズ(白い輪が大きく映らないように)
    glass: new THREE.MeshPhysicalMaterial({ color: COLORS.glass, roughness: 0.25, clearcoat: 0.4, clearcoatRoughness: 0.1, envMapIntensity: 0.35 }),
    // 泡: 暖かい白の背景に溶けないよう、少し青みのある灰色
    bubble: new THREE.MeshStandardMaterial({ color: 0xb8c6cf, roughness: 0.15, transparent: true, opacity: 0.7, depthWrite: false }),
  };
}
