import * as THREE from 'three';
import { COLORS } from '../../materials.js';

// 生物発光の材質(クラゲ専用)。傘の放射状の線・縁の光る点・触手の節の玉が使う。
// 形ごとに aLumen(along: 頂 0 → 縁 1 → 触手の先 2、around: 輪のまわり 0〜1、kind: 0 線・1 縁の点・2 触手の玉)を持たせ、
// シェーダーの中で「時刻 uTime の波」を emissive に足す。背景や照明は変えない。光り方も時刻だけで決まる
export function makeLumenMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.38, metalness: 0.2 });
  const uniforms = {
    uTime: { value: 0 },
    uWave: { value: 0 },    // 光の波(LUMINESCENCE の操作)
    uIdle: { value: 1 },    // ふだんのかすかな光(縁の点が息をするように)
    uFlash: { value: 0 },   // 驚いたときの点滅
    uGlowColor: { value: new THREE.Color(COLORS.orange).multiplyScalar(2.2) },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute vec3 aLumen;\nvarying vec3 vLumen;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLumen = aLumen;');
    sh.fragmentShader = 'uniform float uTime;\nuniform float uWave;\nuniform float uIdle;\nuniform float uFlash;\nuniform vec3 uGlowColor;\nvarying vec3 vLumen;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float along = vLumen.x, around = vLumen.y, kind = vLumen.z;
    // 輪の波: 頂から縁へ、そのまま触手の先へ流れる(板ごとに少しずつずらして渦に見せる)
    float ph = fract(along * 0.8 - uTime * 0.7 + around * 0.5);
    float band = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.36, ph));
    float g;
    if (kind < 0.5) {
      g = uWave * (0.15 + 2.2 * band) + uFlash * 0.6;
    } else if (kind < 1.5) {
      // 縁の点: 輪を回って順に光る
      float chase = pow(0.5 + 0.5 * cos(6.2832 * (around - uTime * 0.45)), 8.0);
      g = uIdle * (0.3 + 0.18 * sin(uTime * 1.7 + around * 12.566)) + uWave * (0.45 + 1.6 * chase) + uFlash * 2.0;
    } else {
      g = uWave * (0.1 + 1.8 * band) + uFlash * 0.9;
    }
    // 強いところは芯が白っぽく(光って見えるように)
    totalEmissiveRadiance += uGlowColor * g + vec3(1.0, 0.72, 0.5) * max(0.0, g - 0.9) * 0.9;
  }`);
  };
  mat.customProgramCacheKey = () => 'benthos-lumen';
  return mat;
}

// 線と縁の点の光り方を JS でも同じ式で求める(計器の横棒用)
export function lumenLevel(t, along, around, wave, idle, flash, kind = 0) {
  const fr = (x) => x - Math.floor(x);
  const ss = (a, b, x) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const ph = fr(along * 0.8 - t * 0.7 + around * 0.5);
  const band = ss(0, 0.08, ph) * (1 - ss(0.08, 0.36, ph));
  if (kind === 0) return wave * (0.15 + 2.2 * band) + flash * 0.6;
  if (kind === 1) {
    const chase = (0.5 + 0.5 * Math.cos(Math.PI * 2 * (around - t * 0.45))) ** 8;
    return idle * (0.3 + 0.18 * Math.sin(t * 1.7 + around * 12.566)) + wave * (0.45 + 1.6 * chase) + flash * 2;
  }
  return wave * (0.1 + 1.8 * band) + flash * 0.9;
}
