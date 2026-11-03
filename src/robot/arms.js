import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARM_COUNT, ARM_BASE_R, ARM_BASE_Y, armAngle } from './body.js';
import { smoothstep, fract, hash } from '../util.js';

// 腕 = 中心線のカーブに沿って、輪(白い筒+赤い車輪2つ)とばねを交互に並べたもの。
// カーブは付け根から先へ「曲がり具合」を足していって作る(腹側へ曲げる bend、横へ曲げる side、先の巻き curl)。
const L = 3.4;          // 腕の長さ
const R0 = 0.15;        // 付け根の太さ(輪の半径)
const TAPER = 0.74;     // 先は付け根の 26% の太さ
const STEPS = 260;      // カーブを刻む数
const START = 0.14;     // 付け根の玉から最初の輪まで
const LINK = 1.5;       // 輪の長さ(半径の何倍か)
const GAP = 0.55;       // 輪と輪のすき間(ばねの部分)
const APART_STRETCH = 0.7;   // ばらしたとき、腕がどれだけ伸びるか(1 なら 2 倍)
const WHEEL_DROP = 1.1;      // ばらしたとき、車輪が輪から離れる距離(輪の半径の何倍か)
const STAGGER = 0.07;        // 形が変わるとき、腕ごとに何秒ずつ遅らせるか(波のように伝わる)

// やわらかさ(腕の節をばねと水の抵抗で追わせる)。付け根は硬く、先はやわらかい
const NODES = 24;            // 1 本の腕の節の数
const SIM_H = 1 / 120;       // 計算の刻み(秒)
const K_BASE = 260;          // 付け根のばね(大きいほどすぐ追う)
const K_TIP = 9;             // 先のばね(小さいほど遅れて揺れる)
const DRAG = 1.7;            // 水の抵抗(小さいほど揺れが長く残る)
const COUPLE = 40;           // となりの節とのつながり(ずれが付け根から先へ伝わる)
const MAX_LAG = 1.0;         // 先のずれの上限

// 作業用(毎コマ new しない)
const v = new THREE.Vector3();
const vt = new THREE.Vector3();
const vn = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const tD = new THREE.Vector3();
const tT = new THREE.Vector3();
const tN = new THREE.Vector3();
const tB = new THREE.Vector3();
const tPos = new THREE.Vector3();
const tTmp = new THREE.Vector3();
const POSE_KEYS = ['hold', 'trail', 'star'];

// 手探りのしぐさ: 腕ごとに 9 秒に 1 回くらい、2 秒ほどかけて伸びてほどけ、また巻く
function reachAt(t, k) {
  const ph = fract(t / 9 + hash(k * 3.7));
  return ph < 0.22 ? Math.sin((Math.PI * ph) / 0.22) ** 2 : 0;
}

export const radiusAt = (s) => R0 * (1 - (TAPER * Math.min(s, L)) / L);

// 腕の名前。ロボットから見た右(画面では左、-x)が R1〜R4、左(+x)が L1〜L4。前から後ろへ数える。
// armAngle(k) の順(+x 側の前から時計回り)に並べる
export const ARM_NAMES = ['L1', 'L2', 'L3', 'L4', 'R4', 'R3', 'R2', 'R1'];
export const DETACH_ARM = ARM_NAMES.indexOf('R2');   // 台本でばらす腕

// 腕ごとの形。e: 付け根の仰角、bend: 腹側(最初は下)へ曲げる強さ、side: 横へ曲げる強さ、curl: 先の巻きの強さ
// hold: ふだん(見本の HOLDING)、trail: 噴射で進むとき(後ろへなびく)、star: 下から見せるとき(放射状に広げて先を巻く)
const POSES = {
  hold: {
    L1: { e: -0.75, bend: -0.45, side: 0.22, curl: 0.9 },
    L2: { e: 0.05, bend: 0.12, side: -0.1, curl: 0.74 },
    L3: { e: 0.6, bend: 0.5, side: 0.05, curl: 0.89 },
    L4: { e: 1.15, bend: 0.6, side: -0.2, curl: 0.72 },
    R1: { e: -0.7, bend: -0.4, side: 0.18, curl: 0.68 },
    R2: { e: 0.1, bend: 0.18, side: 0.12, curl: 0.9 },
    R3: { e: 0.65, bend: 0.45, side: -0.05, curl: 0.77 },
    R4: { e: 1.1, bend: 0.65, side: 0.2, curl: 0.85 },
  },
  trail: {},
  star: {},
};
ARM_NAMES.forEach((n, k) => {
  // なびく腕は付け根から真下へ(体を傾けると後ろへ流れる)。少しずつ違えて束に見せる
  POSES.trail[n] = { e: -1.32 + 0.05 * Math.sin(k * 2.1), bend: 0.06 * Math.cos(k * 1.7), side: 0.06 * Math.sin(k * 1.3), curl: 0.22 + 0.08 * Math.sin(k * 0.9) };
  POSES.star[n] = { e: 0.08 + 0.04 * Math.sin(k * 1.9), bend: -0.05, side: 0.03 * Math.cos(k), curl: 1.0 - 0.03 * (k % 3) };
});

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
  // 車輪(ばらすと輪から離れるので、置き場所は別に持つ)。原点は車軸の真ん中
  const tires = [];
  const hubs = [];
  for (const x of [-0.42, 0.42]) {
    const tire = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 20);
    tire.rotateZ(Math.PI / 2);
    tire.translate(x, 0, 0);
    tires.push(tire);
    const hub = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 14);
    hub.rotateZ(Math.PI / 2);
    hub.translate(x, 0, 0);
    hubs.push(hub);
  }
  const axle = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8);
  axle.rotateZ(Math.PI / 2);
  hubs.push(axle);
  // 背中のオレンジの板(輪 3 個に 1 個)
  const plate = new THREE.CylinderGeometry(1.02, 1.02, 0.62, 10, 1, true, Math.PI - 0.6, 1.2);
  return {
    shell,
    dark: mergeGeometries(dark.map((g) => g.toNonIndexed())),
    tire: mergeGeometries(tires),
    hub: mergeGeometries(hubs.map((g) => g.toNonIndexed())),
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

const WHEEL_Z = 0.92;   // 車軸の位置(輪の中心から腹側へ)

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
    this.linkCount = this.links.length * ARM_COUNT;
    this.wheelCount = this.linkCount * 2;
    const nl = this.linkCount;
    const ns = this.springs.length * ARM_COUNT;
    const np = this.links.filter((_, i) => i % 3 === 1).length * ARM_COUNT;

    // 同じ並びの部品は instanceMatrix を共有する(1 回書けば全部動く)
    const lg = linkGeometries();
    const sg = springGeometries();
    const share = (meshes) => {
      const attr = meshes[0].instanceMatrix;
      attr.setUsage(THREE.DynamicDrawUsage);
      for (const mesh of meshes.slice(1)) mesh.instanceMatrix = attr;
      return attr;
    };
    const linkMeshes = [new THREE.InstancedMesh(lg.shell, m.shell, nl), new THREE.InstancedMesh(lg.dark, m.dark, nl)];
    this.linkMatrix = share(linkMeshes);
    const wheelMeshes = [new THREE.InstancedMesh(lg.tire, m.wheel, nl), new THREE.InstancedMesh(lg.hub, m.dark, nl)];
    this.wheelMatrix = share(wheelMeshes);
    const springMeshes = [new THREE.InstancedMesh(sg.coil, m.metal, ns), new THREE.InstancedMesh(sg.core, m.dark, ns)];
    this.springMatrix = share(springMeshes);
    this.plateMesh = new THREE.InstancedMesh(lg.plate, m.orange, np);
    this.plateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tipGeo = new THREE.SphereGeometry(1, 16, 12);
    tipGeo.scale(0.9, 1.3, 0.9);
    this.tipMesh = new THREE.InstancedMesh(tipGeo, m.dark, ARM_COUNT);

    this.meshes = [...linkMeshes, ...wheelMeshes, ...springMeshes, this.plateMesh, this.tipMesh];
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false;   // 腕が動くので、境界の計算を省いて常に描く
      this.group.add(mesh);
    }

    // 引き出し線の付け根(ばらす腕の、付け根・途中の輪・先)
    this.anchors = { root: new THREE.Object3D(), link: new THREE.Object3D(), tip: new THREE.Object3D() };
    for (const a of Object.values(this.anchors)) this.group.add(a);

    // カーブを刻んだ点と向き(T: 進む向き、N: 腹側、B: 横)
    this.P = new Float32Array((STEPS + 1) * 3);
    this.T = new Float32Array((STEPS + 1) * 3);
    this.N = new Float32Array((STEPS + 1) * 3);
    this.B = new Float32Array((STEPS + 1) * 3);
    this.len = L;
    this.curls = Object.fromEntries(ARM_NAMES.map((n) => [n, POSES.hold[n].curl]));
    this.mtx = new THREE.Matrix4();
    this.blendOut = { e: 0, bend: 0, side: 0, curl: 0 };

    // やわらかさの状態(腕ごと): 節の位置(世界)・1 つ前の位置・目標・ずれ
    const buf = () => new Float32Array(NODES * 3);
    this.sim = Array.from({ length: ARM_COUNT }, () => ({ x: buf(), xp: buf(), tgt: buf(), prev: buf(), cur: buf(), d: buf(), dl: buf(), ready: false }));
    this.inv = new THREE.Matrix4();
    this.invRot = new THREE.Matrix3();
  }

  // 3 つの形を重みで混ぜた、腕 k の形
  blend(k, pose) {
    const n = ARM_NAMES[k];
    const out = this.blendOut;
    out.e = out.bend = out.side = out.curl = 0;
    for (const key of POSE_KEYS) {
      const w = pose[key];
      if (!(w > 0)) continue;
      const p = POSES[key][n];
      out.e += p.e * w;
      out.bend += p.bend * w;
      out.side += p.side * w;
      out.curl += p.curl * w;
    }
    return out;
  }

  // 腕 k のカーブを刻む。t は時刻(ゆらぎ)、p は形、len は長さ(ばらすと伸びる)、wave は揺れの強さ
  trace(k, t, p, len, wave) {
    const a = armAngle(k);
    const phase = k * 1.37;
    const mirror = ARM_NAMES[k][0] === 'R' ? -1 : 1;
    const e = p.e + 0.08 * Math.sin(0.7 * t + phase);
    const D = tD.set(Math.sin(a), 0, Math.cos(a));
    const T = tT.copy(D).multiplyScalar(Math.cos(e)).addScaledVector(UP, Math.sin(e));
    const N = tN.copy(D).multiplyScalar(Math.sin(e)).addScaledVector(UP, -Math.cos(e));
    const B = tB.crossVectors(T, N);
    const pos = tPos.copy(D).multiplyScalar(ARM_BASE_R).setY(ARM_BASE_Y);
    const ds = len / STEPS;
    const t2 = tTmp;
    for (let i = 0; i <= STEPS; i++) {
      pos.toArray(this.P, i * 3);
      T.toArray(this.T, i * 3);
      N.toArray(this.N, i * 3);
      B.toArray(this.B, i * 3);
      const s = i * ds;
      const u = s / len;
      // 先の巻き: 先へ行くほど急に曲がる(対数らせん)。背中側へ巻くので車輪は外を向く
      const kc = ((-p.curl * 3.4) / (len - s + 0.16)) * smoothstep(0.4, 0.72, u);
      // 付け根から先へ進む 2 つの波(先ほど大きく揺れる)
      const kv = p.bend * (1 - 0.4 * u) + kc + wave * u * (0.2 * Math.sin(1.3 * t - 4 * u + phase) + 0.08 * Math.sin(2.3 * t - 7 * u + 2 * phase));
      const kh = mirror * p.side * (1 - u) + wave * u * (0.16 * Math.sin(0.9 * t - 3 * u + phase * 0.7) + 0.06 * Math.sin(1.9 * t - 6 * u + phase));
      pos.addScaledVector(T, ds);
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
    this.len = len;
  }

  // 刻んだカーブの、長さ s の点(線で補う)
  sampleP(s, out) {
    const f = Math.min(STEPS, Math.max(0, s / (this.len / STEPS)));
    const i0 = Math.min(STEPS - 1, Math.floor(f));
    const w = f - i0, P = this.P, i = i0 * 3;
    return out.set(P[i] + (P[i + 3] - P[i]) * w, P[i + 1] + (P[i + 4] - P[i + 1]) * w, P[i + 2] + (P[i + 5] - P[i + 2]) * w);
  }

  // やわらかさ: 腕の節(NODES 個)を、世界の中でばねと水の抵抗で目標(刻んだカーブ)へ追わせる。
  // 目標からのずれを腕の座標へ戻して、刻んだカーブに足す。付け根は硬く先はやわらかいので、
  // 体が動いたり向きを変えたりすると、先ほど遅れてついてきて、少し行き過ぎて戻る。amount は効かせる量(0 で硬いまま)。
  soften(k, world, dt, reset, amount, draw = true) {
    const S = this.sim[k];
    const len = this.len;
    for (let i = 0; i < NODES; i++) {
      this.sampleP((i / (NODES - 1)) * len, v).applyMatrix4(world).toArray(S.tgt, i * 3);
    }
    if (reset || !S.ready) {
      S.x.set(S.tgt);
      S.xp.set(S.tgt);
      S.ready = true;
    } else if (dt > 0) {
      const steps = Math.min(12, Math.max(1, Math.ceil(dt / SIM_H - 1e-6)));
      const h = dt / steps;
      const keep = Math.max(0, 1 - DRAG * h);
      const { x, xp, tgt, prev, cur, d } = S;
      for (let st = 1; st <= steps; st++) {
        const f = st / steps;
        // この刻みの目標(前のコマの目標から線で補う)と、目標からのずれ
        for (let j = 0; j < NODES * 3; j++) {
          cur[j] = prev[j] + (tgt[j] - prev[j]) * f;
          d[j] = x[j] - cur[j];
        }
        for (let i = 1; i < NODES; i++) {
          const u = i / (NODES - 1);
          const kk = K_TIP + (K_BASE - K_TIP) * (1 - u) * (1 - u);
          const ip = (i - 1) * 3, ic = i * 3, inx = (i < NODES - 1 ? i + 1 : i) * 3;
          for (let c = 0; c < 3; c++) {
            const acc = -kk * d[ic + c] + COUPLE * (d[ip + c] + d[inx + c] - 2 * d[ic + c]);
            const p0 = x[ic + c];
            x[ic + c] = p0 + (p0 - xp[ic + c]) * keep + acc * h * h;
            xp[ic + c] = p0;
          }
        }
        for (let c = 0; c < 3; c++) x[c] = xp[c] = cur[c];   // 付け根は目標に留める
      }
    }
    S.prev.set(S.tgt);
    if (amount <= 0 || !draw) return;   // 助走では状態を進めるだけ(描かないので、ずれを足す必要はない)
    // ずれ(世界の向き)→ 腕の座標の向きへ。先ほど大きくてよい
    for (let i = 0; i < NODES; i++) {
      const j = i * 3;
      v.set(S.x[j] - S.tgt[j], S.x[j + 1] - S.tgt[j + 1], S.x[j + 2] - S.tgt[j + 2]).applyMatrix3(this.invRot);
      const max = MAX_LAG * (i / (NODES - 1));
      const l = v.length();
      if (l > max) v.multiplyScalar(max / l);
      v.multiplyScalar(amount).toArray(S.dl, j);
    }
    const P = this.P, T = this.T, N = this.N, B = this.B, dl = S.dl;
    for (let j = 0; j <= STEPS; j++) {
      const f = (j / STEPS) * (NODES - 1);
      const i0 = Math.min(NODES - 2, Math.floor(f));
      const w = f - i0;
      for (let c = 0; c < 3; c++) P[j * 3 + c] += dl[i0 * 3 + c] * (1 - w) + dl[(i0 + 1) * 3 + c] * w;
    }
    // 腕は伸び縮みさせない: 付け根から順に、刻みの間隔を元の長さに戻す(ずれた向きはそのまま)
    const ds = len / STEPS;
    for (let j = 1; j <= STEPS; j++) {
      const a = (j - 1) * 3, b = j * 3;
      v.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
      const l = v.length();
      if (l < 1e-9) continue;
      v.multiplyScalar(ds / l);
      P[b] = P[a] + v.x;
      P[b + 1] = P[a + 1] + v.y;
      P[b + 2] = P[a + 2] + v.z;
    }
    // 曲がったカーブに合わせて向きを作り直す(進む向きは前後の点の差、腹側は元の向きから直交させる)
    for (let j = 0; j <= STEPS; j++) {
      const a = Math.max(0, j - 1) * 3, b = Math.min(STEPS, j + 1) * 3;
      vt.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]).normalize();
      vn.fromArray(N, j * 3);
      vn.addScaledVector(vt, -vn.dot(vt)).normalize();
      vt.toArray(T, j * 3);
      vn.toArray(N, j * 3);
      v.crossVectors(vt, vn).toArray(B, j * 3);
    }
  }

  // 腕に沿った長さ s での置き方(位置・向き・太さ)を m に書く。drop は腹側へずらす量(輪の半径の何倍か)
  placeAt(s, m, scale, drop = 0) {
    const f = Math.min(STEPS, Math.max(0, s / (this.len / STEPS)));
    const i0 = Math.min(STEPS - 1, Math.floor(f));
    const w = f - i0;
    const j = (w < 0.5 ? i0 : i0 + 1) * 3;
    const P = this.P, i = i0 * 3;
    const B = this.B, T = this.T, N = this.N;
    const x = P[i] + (P[i + 3] - P[i]) * w + N[j] * scale * drop;
    const y = P[i + 1] + (P[i + 4] - P[i + 1]) * w + N[j + 1] * scale * drop;
    const z = P[i + 2] + (P[i + 5] - P[i + 2]) * w + N[j + 2] * scale * drop;
    m.set(
      B[j] * scale, T[j] * scale, N[j] * scale, x,
      B[j + 1] * scale, T[j + 1] * scale, N[j + 1] * scale, y,
      B[j + 2] * scale, T[j + 2] * scale, N[j + 2] * scale, z,
      0, 0, 0, 1,
    );
    return m;
  }

  // t: 時刻、poseFn: 時刻 → 形の重み(腕ごとに少しずらして呼ぶ)、
  // o: { apart: 台本でばらす量(R2 だけ), exploded: 分解図, jet: 噴射, pulse: 噴射の脈, soft: やわらかさ }
  // world: 腕の親(ロボット)の世界の行列、dt: 前のコマからの秒、reset: やわらかさを今の形に合わせ直す、draw: 置き場所を書くか(助走では書かない)
  update(t, poseFn, o, world, dt, reset = false, draw = true) {
    const m = this.mtx;
    let li = 0, si = 0, pi = 0;
    this.inv.copy(world).invert();
    this.invRot.setFromMatrix4(this.inv);
    for (let k = 0; k < ARM_COUNT; k++) {
      const name = ARM_NAMES[k];
      const pose = poseFn(t - k * STAGGER);
      const a = Math.max(k === DETACH_ARM ? o.apart : 0, o.exploded * 0.45);
      const p = this.blend(k, pose);
      const reach = reachAt(t, k) * pose.hold * (1 - a);
      p.e += 0.3 * reach;
      p.side += 0.22 * reach * (k % 2 ? 1 : -1);
      p.curl *= (1 - 0.4 * reach) * (0.9 + 0.1 * Math.sin(0.6 * t + k * 1.9)) * (1 - 0.75 * a);
      // 噴射: 水を押し出すとき腕を閉じ、吸い込むとき開く(イカの泳ぎ)
      p.e += pose.trail * o.jet * 0.32 * (0.5 - o.pulse);
      p.bend *= 1 - 0.7 * a;
      p.side *= 1 - 0.7 * a;
      p.e = p.e * (1 - a) + 0.12 * a;   // ばらすときは横へまっすぐ伸ばす
      this.curls[name] = p.curl;
      const stretch = 1 + APART_STRETCH * a;
      this.trace(k, t, p, L * stretch, (1 - 0.5 * pose.star) * (1 - a));
      this.soften(k, world, dt, reset, o.soft ? 1 - 0.8 * a : 0, draw);
      if (!draw) continue;
      // 輪の位置は付け根からの距離ごと伸ばす(すき間が開く)
      this.links.forEach((s0, i) => {
        const s = START + (s0 - START) * stretch;
        const r = radiusAt(s0);
        this.placeAt(s, m, r).toArray(this.linkMatrix.array, li * 16);
        // 車輪は輪の腹側に付き、ばらすと下へ離れる
        this.placeAt(s, m, r, WHEEL_Z + WHEEL_DROP * a).toArray(this.wheelMatrix.array, li * 16);
        li++;
        if (i % 3 === 1) this.plateMesh.setMatrixAt(pi++, this.placeAt(s, m, r));
      });
      for (const s0 of this.springs) {
        const s = START + (s0 - START) * stretch;
        // ばらしたばねは細く縮める(輪のあいだに浮かぶ黒い円盤に見せる)
        this.placeAt(s, m, radiusAt(s0) * (1 - 0.35 * a)).toArray(this.springMatrix.array, si++ * 16);
      }
      const tipS = START + (L - 0.01 - START) * stretch;
      this.tipMesh.setMatrixAt(k, this.placeAt(tipS, m, radiusAt(L) * 1.1));
      if (k === DETACH_ARM) {
        this.anchors.root.position.fromArray(this.P, 0);
        this.placeAt(START + (this.links[4] - START) * stretch, m, 1);
        this.anchors.link.position.setFromMatrixPosition(m);
        this.placeAt(START + (this.links[Math.round(this.links.length * 0.72)] - START) * stretch, m, 1);
        this.anchors.tip.position.setFromMatrixPosition(m);
      }
    }
    if (!draw) return;
    this.linkMatrix.needsUpdate = true;
    this.wheelMatrix.needsUpdate = true;
    this.springMatrix.needsUpdate = true;
    this.plateMesh.instanceMatrix.needsUpdate = true;
    this.tipMesh.instanceMatrix.needsUpdate = true;
  }
}
