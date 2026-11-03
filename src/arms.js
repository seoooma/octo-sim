import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARM_COUNT, ARM_BASE_R, ARM_BASE_Y, armAngle } from './body.js';

// 腕 = 中心線のカーブに沿って、輪(白い筒+赤い車輪2つ)とばねを交互に並べたもの。
// カーブは付け根から先へ「曲がり具合」を足していって作る(腹側へ曲げる bend、横へ曲げる side、先の巻き curl)。
const L = 3.4;          // 腕の長さ
const R0 = 0.15;        // 付け根の太さ(輪の半径)
const TAPER = 0.74;     // 先は付け根の 26% の太さ
const STEPS = 260;      // カーブを刻む数
const START = 0.14;     // 付け根の玉から最初の輪まで
const LINK = 1.5;       // 輪の長さ(半径の何倍か)
const GAP = 0.55;       // 輪と輪のすき間(ばねの部分)

export const radiusAt = (s) => R0 * (1 - (TAPER * s) / L);

// 腕ごとの形。R1〜R4 は右の前から後ろ、L1〜L4 は左の前から後ろ。
// e: 付け根の仰角、bend: 腹側(最初は下)へ曲げる強さ、side: 横へ曲げる強さ、curl: 先の巻きの強さ
const POSES = {
  R1: { e: -0.75, bend: -0.45, side: 0.22, curl: 0.9 },
  R2: { e: 0.05, bend: 0.12, side: -0.1, curl: 0.74 },
  R3: { e: 0.6, bend: 0.5, side: 0.05, curl: 0.89 },
  R4: { e: 1.15, bend: 0.6, side: -0.2, curl: 0.72 },
  L1: { e: -0.7, bend: -0.4, side: 0.18, curl: 0.68 },
  L2: { e: 0.1, bend: 0.18, side: 0.12, curl: 0.9 },
  L3: { e: 0.65, bend: 0.45, side: -0.05, curl: 0.77 },
  L4: { e: 1.1, bend: 0.65, side: 0.2, curl: 0.85 },
};
// armAngle(k) の順(右前から時計回り)に並べた名前
export const ARM_NAMES = ['R1', 'R2', 'R3', 'R4', 'L4', 'L3', 'L2', 'L1'];

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 輪 1 個の形(半径 1。軸は y、腹側は +z、横は x)。材質ごとにまとめる
function linkGeometries() {
  const prof = [];
  const h = LINK / 2;
  prof.push(new THREE.Vector2(0, -h), new THREE.Vector2(0.86, -h));
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    prof.push(new THREE.Vector2(0.86 + 0.14 * Math.sin(a), -h + 0.14 - 0.14 * Math.cos(a)));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    prof.push(new THREE.Vector2(0.86 + 0.14 * Math.cos(a), h - 0.14 + 0.14 * Math.sin(a)));
  }
  prof.push(new THREE.Vector2(0, h));
  const shell = new THREE.LatheGeometry(prof, 32);

  const dark = [];
  for (const y of [-h + 0.12, h - 0.12]) {
    const c = new THREE.TorusGeometry(0.99, 0.045, 6, 32);
    c.rotateX(Math.PI / 2);
    c.translate(0, y, 0);
    dark.push(c);
  }
  const wheels = [];
  for (const x of [-0.42, 0.42]) {
    const tire = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 20);
    tire.rotateZ(Math.PI / 2);
    tire.translate(x, 0, 0.92);
    wheels.push(tire);
    const hub = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 14);
    hub.rotateZ(Math.PI / 2);
    hub.translate(x, 0, 0.92);
    dark.push(hub);
  }
  const fork = new THREE.BoxGeometry(0.5, 0.34, 0.3);
  fork.translate(0, 0, 0.86);
  dark.push(fork);
  for (const x of [-1, 1]) {
    for (const y of [-0.35, 0.35]) {
      const r = new THREE.SphereGeometry(0.07, 8, 6);
      r.translate(x * 0.99, y, -0.1);
      dark.push(r);
    }
  }
  // 背中のオレンジの板(輪 3 個に 1 個)
  const plate = new THREE.CylinderGeometry(1.02, 1.02, 0.62, 10, 1, true, Math.PI - 0.6, 1.2);
  return {
    shell,
    dark: mergeGeometries(dark.map((g) => g.toNonIndexed())),
    wheel: mergeGeometries(wheels),
    plate,
  };
}

// 輪と輪のあいだのばね(半径 1、長さ GAP+少し、軸は y)
function springGeometries() {
  const turns = 3.5;
  const len = GAP + 0.25;
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const u = i / 80;
    const a = u * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(0.68 * Math.cos(a), (u - 0.5) * len, 0.68 * Math.sin(a)));
  }
  const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.065, 6, false);
  const core = new THREE.CylinderGeometry(0.45, 0.45, len + 0.1, 16);
  return { coil, core };
}

export class Arms {
  constructor(m) {
    this.group = new THREE.Group();

    // 輪とばねの置き場所(腕に沿った長さ s)。形が変わっても並びは同じ
    this.links = [];
    this.springs = [];
    let s = START;
    while (s < L - 0.02) {
      const r = radiusAt(s);
      this.links.push(s + (LINK / 2) * r);
      s += LINK * r;
      if (s + GAP * r < L - 0.05) this.springs.push(s + (GAP / 2) * r);
      s += GAP * r;
    }
    const nl = this.links.length * ARM_COUNT;
    const ns = this.springs.length * ARM_COUNT;
    this.plates = this.links.map((_, i) => i).filter((i) => i % 3 === 1);
    const np = this.plates.length * ARM_COUNT;

    // 同じ並びの部品は instanceMatrix を共有する(1 回書けば全部動く)
    const lg = linkGeometries();
    const sg = springGeometries();
    const shell = new THREE.InstancedMesh(lg.shell, m.shell, nl);
    this.linkMatrix = shell.instanceMatrix;
    this.linkMatrix.setUsage(THREE.DynamicDrawUsage);
    const linkMeshes = [shell, new THREE.InstancedMesh(lg.dark, m.dark, nl), new THREE.InstancedMesh(lg.wheel, m.wheel, nl)];
    for (const mesh of linkMeshes.slice(1)) mesh.instanceMatrix = this.linkMatrix;

    const coil = new THREE.InstancedMesh(sg.coil, m.metal, ns);
    this.springMatrix = coil.instanceMatrix;
    this.springMatrix.setUsage(THREE.DynamicDrawUsage);
    const core = new THREE.InstancedMesh(sg.core, m.dark, ns);
    core.instanceMatrix = this.springMatrix;

    this.plateMesh = new THREE.InstancedMesh(lg.plate, m.orange, np);
    this.plateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const tipGeo = new THREE.SphereGeometry(1, 16, 12);
    tipGeo.scale(0.9, 1.3, 0.9);
    this.tipMesh = new THREE.InstancedMesh(tipGeo, m.dark, ARM_COUNT);

    this.meshes = [...linkMeshes, coil, core, this.plateMesh, this.tipMesh];
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false;   // 腕が動くので、境界の計算を省いて常に描く
      this.group.add(mesh);
    }

    // カーブを刻んだ点と向き(T: 進む向き、N: 腹側、B: 横)
    this.P = new Float32Array((STEPS + 1) * 3);
    this.T = new Float32Array((STEPS + 1) * 3);
    this.N = new Float32Array((STEPS + 1) * 3);
    this.B = new Float32Array((STEPS + 1) * 3);
    this.curl = Object.fromEntries(ARM_NAMES.map((n) => [n, POSES[n].curl]));
  }

  // 腕 k のカーブを刻む。t は時刻(ゆらぎ)、curl は先の巻き(0〜1)
  trace(k, t, curl) {
    const name = ARM_NAMES[k];
    const pose = POSES[name];
    const a = armAngle(k);
    const phase = k * 1.37;
    const mirror = name[0] === 'L' ? -1 : 1;
    const e = pose.e + 0.06 * Math.sin(0.7 * t + phase);
    const D = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const up = new THREE.Vector3(0, 1, 0);
    const T = D.clone().multiplyScalar(Math.cos(e)).addScaledVector(up, Math.sin(e));
    const N = D.clone().multiplyScalar(Math.sin(e)).addScaledVector(up, -Math.cos(e));
    const B = new THREE.Vector3().crossVectors(T, N);
    const p = D.clone().multiplyScalar(ARM_BASE_R).setY(ARM_BASE_Y);
    const ds = L / STEPS;
    const t2 = new THREE.Vector3();
    for (let i = 0; i <= STEPS; i++) {
      p.toArray(this.P, i * 3);
      T.toArray(this.T, i * 3);
      N.toArray(this.N, i * 3);
      B.toArray(this.B, i * 3);
      const s = i * ds;
      const u = s / L;
      // 先の巻き: 先へ行くほど急に曲がる(対数らせん)。背中側へ巻くので車輪は外を向く
      const kc = (-curl * 3.4) / (L - s + 0.16) * smoothstep(0.4, 0.72, u);
      const kv = pose.bend * (1 - 0.4 * u) + kc + 0.12 * Math.sin(1.3 * t - 4 * u + phase) * u;
      const kh = mirror * pose.side * (1 - u) + 0.1 * Math.sin(0.9 * t - 3 * u + phase * 0.7) * u;
      p.addScaledVector(T, ds);
      // 腹側へ kv、横へ kh だけ向きを回す
      const cv = Math.cos(kv * ds), sv = Math.sin(kv * ds);
      t2.copy(T).multiplyScalar(cv).addScaledVector(N, sv);
      N.multiplyScalar(cv).addScaledVector(T, -sv);
      T.copy(t2);
      const ch = Math.cos(kh * ds), sh = Math.sin(kh * ds);
      t2.copy(T).multiplyScalar(ch).addScaledVector(B, sh);
      B.multiplyScalar(ch).addScaledVector(T, -sh);
      T.copy(t2).normalize();
      N.addScaledVector(T, -N.dot(T)).normalize();
      B.crossVectors(T, N);
    }
  }

  // 腕に沿った長さ s での置き方(位置・向き・太さ)を m に書く
  placeAt(s, m, scale = radiusAt(s)) {
    const f = Math.min(STEPS, Math.max(0, s / (L / STEPS)));
    const i0 = Math.min(STEPS - 1, Math.floor(f));
    const w = f - i0;
    const j = (w < 0.5 ? i0 : i0 + 1) * 3;
    const P = this.P, i = i0 * 3;
    m.set(
      this.B[j] * scale, this.T[j] * scale, this.N[j] * scale, P[i] + (P[i + 3] - P[i]) * w,
      this.B[j + 1] * scale, this.T[j + 1] * scale, this.N[j + 1] * scale, P[i + 1] + (P[i + 4] - P[i + 1]) * w,
      this.B[j + 2] * scale, this.T[j + 2] * scale, this.N[j + 2] * scale, P[i + 2] + (P[i + 5] - P[i + 2]) * w,
      0, 0, 0, 1,
    );
    return m;
  }

  update(t, global = 1) {
    const m = new THREE.Matrix4();
    let li = 0, si = 0, pi = 0;
    for (let k = 0; k < ARM_COUNT; k++) {
      const name = ARM_NAMES[k];
      const curl = global * this.curl[name] * (0.92 + 0.08 * Math.sin(0.9 * t + k));
      this.trace(k, t, curl);
      this.links.forEach((s, i) => {
        this.placeAt(s, m);
        m.toArray(this.linkMatrix.array, li++ * 16);
        if (i % 3 === 1) this.plateMesh.setMatrixAt(pi++, m);
      });
      for (const s of this.springs) this.placeAt(s, m).toArray(this.springMatrix.array, si++ * 16);
      this.tipMesh.setMatrixAt(k, this.placeAt(L - 0.01, m, radiusAt(L) * 1.1));
    }
    this.linkMatrix.needsUpdate = true;
    this.springMatrix.needsUpdate = true;
    this.plateMesh.instanceMatrix.needsUpdate = true;
    this.tipMesh.instanceMatrix.needsUpdate = true;
  }
}
