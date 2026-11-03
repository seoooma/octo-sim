import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARM_COUNT, ARM_BASE_R, ARM_BASE_Y, armAngle } from './body.js';
import { smoothstep, fract, hash } from '../../util.js';
import { pulseAt, strokeAt } from './timeline.js';

// 腕 = 中心線のカーブに沿って、輪(白い筒+赤い車輪2つ)とばねを交互に並べたもの。
// カーブは付け根から先へ「曲がり具合」を足していって作る(腹側へ曲げる bend、横へ曲げる side、先の巻き curl)。
// 太さと長さは見本に合わせた(輪の半径は胴の約 0.21 倍、長さは直径の約 1.1 倍の筒。2026-11-03 のレビュー)
const L = 3.8;          // 腕の長さ
const R0 = 0.21;        // 付け根の太さ(輪の半径)
const TAPER = 0.62;     // 先は付け根の 38% の太さ(先まで太めのまま大きく巻く)
const STEPS = 260;      // カーブを刻む数
const START = 0.2;      // 付け根の玉から最初の輪まで
const LINK = 1.9;       // 輪の長さ(半径の何倍か。短いほど先の渦がなめらか)
const GAP = 0.55;       // 輪と輪のすき間(銀の関節とばね)
const APART_STRETCH = 0.7;   // ばらしたとき、腕がどれだけ伸びるか(1 なら 2 倍)
const WHEEL_DROP = 1.1;      // ばらしたとき、車輪が輪から離れる距離(輪の半径の何倍か)
// 形が変わるとき、前の腕から後ろの腕へ順に遅らせる(左右は同じ順位なので正面に継ぎ目が出ない)。少しずつばらつかせる
const RANK = { L1: 0, R1: 0, L2: 1, R2: 1, L3: 2, R3: 2, L4: 3, R4: 3 };
const STAGGER = 0.12;

// やわらかさ(腕の節をばねと水の抵抗で追わせる)。付け根は硬く、先はやわらかい
const NODES = 24;            // 1 本の腕の節の数
const SIM_H = 1 / 120;       // 計算の刻み(秒)
const K_BASE = 260;          // 付け根のばね(大きいほどすぐ追う)
const K_TIP = 9;             // 先のばね(小さいほど遅れて揺れる)
const DRAG = 1.7;            // 水の抵抗(世界の中の速さにかかる。泳ぐと先がなびく)
const ZETA_BASE = 0.6;       // 形からのずれの揺れの減り方(付け根)。噴射の脈と共振しないように節ごとに決める
const ZETA_TIP = 0.35;       // 同(先。小さいほど揺れが残る)
const COUPLE = 40;           // となりの節とのつながり(ずれが付け根から先へ伝わる)
const MAX_LAG = 1.0;         // 先のずれの上限(なめらかに頭打ちにする)

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

// 手探りのしぐさ: 腕ごとに 9 秒に 1 回くらい、0.6 秒で伸びてほどけ、1.4 秒かけてまた巻く
function reachAt(t, k) {
  const x = fract(t / 9 + hash(k * 3.7)) / 0.22;
  if (x >= 1) return 0;
  return x < 0.3 ? smoothstep(0, 0.3, x) : 1 - smoothstep(0.3, 1, x);
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
    L4: { e: 1.15, bend: 0.6, side: -0.45, curl: 0.72 },
    R1: { e: -0.7, bend: -0.4, side: 0.18, curl: 0.68 },
    R2: { e: 0.1, bend: 0.18, side: 0.12, curl: 0.9 },
    R3: { e: 0.65, bend: 0.45, side: -0.05, curl: 0.77 },
    R4: { e: 1.1, bend: 0.65, side: 0.45, curl: 0.85 },
  },
  trail: {},
  star: {},
};
ARM_NAMES.forEach((n, k) => {
  // なびく腕は付け根から真下へ(体を傾けると後ろへ流れる)。少しずつ違えて束に見せる
  POSES.trail[n] = { e: -1.32 + 0.05 * Math.sin(k * 2.1), bend: 0.06 * Math.cos(k * 1.7), side: 0.06 * Math.sin(k * 1.3), curl: 0.22 + 0.08 * Math.sin(k * 0.9) };
  // 放射状の腕も 1 本ずつ違えて、棒の並びに見せない
  POSES.star[n] = { e: 0.08 + 0.04 * Math.sin(k * 1.9), bend: -0.05 + 0.25 * (hash(k + 5) * 2 - 1), side: 0.15 * (hash(k + 9) * 2 - 1), curl: 0.75 + 0.45 * hash(k + 2) };
});

const WHEEL_Z = 0.92;   // 車軸の位置(輪の中心から腹側へ)
const WHEEL_ROWS = [-0.45, 0.45];   // 1 つの輪の車輪の組(輪の軸に沿った位置)

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
  const shell = new THREE.LatheGeometry(prof, 24);

  const dark = [];
  for (const y of [-h + 0.12, h - 0.12]) {
    const c = new THREE.TorusGeometry(0.99, 0.045, 6, 32);
    c.rotateX(Math.PI / 2);
    c.translate(0, y, 0);
    dark.push(c);
  }
  for (const y of WHEEL_ROWS) {
    const fork = new THREE.BoxGeometry(0.5, 0.34, 0.3);
    fork.translate(0, y, 0.86);
    dark.push(fork);
  }
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
  // 1 つの輪に 2 組(前後)。黒いタイヤにオレンジのハブ(見本どおり)
  const axles = [];
  for (const y of WHEEL_ROWS) {
    for (const x of [-0.42, 0.42]) {
      const tire = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 20);
      tire.rotateZ(Math.PI / 2);
      tire.translate(x, y, 0);
      tires.push(tire);
      const hub = new THREE.CylinderGeometry(0.21, 0.21, 0.3, 14);
      hub.rotateZ(Math.PI / 2);
      hub.translate(x, y, 0);
      hubs.push(hub);
    }
    const axle = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8);
    axle.rotateZ(Math.PI / 2);
    axle.translate(0, y, 0);
    axles.push(axle);
  }
  // 背中のオレンジの細い帯(輪 3 個に 1 個)
  const plate = new THREE.CylinderGeometry(1.02, 1.02, 0.14, 10, 1, true, Math.PI - 0.6, 1.2);
  return {
    shell,
    dark: mergeGeometries(dark.map((g) => g.toNonIndexed())),
    tire: mergeGeometries([...tires, ...axles].map((g) => g.toNonIndexed())),
    hub: mergeGeometries(hubs),
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
  const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.065, 5, false);
  const core = new THREE.CylinderGeometry(0.2, 0.2, len + 0.1, 12);   // 銀の芯の棒
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
    this.linkCount = this.links.length * ARM_COUNT;
    this.wheelCount = this.linkCount * 2 * WHEEL_ROWS.length;
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
    const wheelMeshes = [new THREE.InstancedMesh(lg.tire, m.dark, nl), new THREE.InstancedMesh(lg.hub, m.wheel, nl)];
    this.wheelMatrix = share(wheelMeshes);
    const springMeshes = [new THREE.InstancedMesh(sg.coil, m.metal, ns), new THREE.InstancedMesh(sg.core, m.metal, ns)];
    this.springMatrix = share(springMeshes);
    this.plateMesh = new THREE.InstancedMesh(lg.plate, m.orange, np);
    this.plateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tipGeo = new THREE.SphereGeometry(1, 16, 12);
    tipGeo.scale(0.9, 1.3, 0.9);
    this.tipMesh = new THREE.InstancedMesh(tipGeo, m.shell, ARM_COUNT);   // 先は白い丸(黒い玉だと触角に見える)

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
    this.blendOut = { e: 0, bend: 0, side: 0, curl: 0, reach: 0, jetWave: 0, swim: 0 };

    // やわらかさの状態(腕ごと): 節の位置(世界)・1 つ前の位置・目標・ずれ
    const buf = () => new Float32Array(NODES * 3);
    this.sim = Array.from({ length: ARM_COUNT }, () => ({ x: buf(), xp: buf(), tgt: buf(), prev: buf(), cur: buf(), d: buf(), dp: buf(), dl: buf(), ready: false }));
    // 節ごとのばねと、ずれの揺れの減り方(c = 2ζ√k)
    this.kNode = Float32Array.from({ length: NODES }, (_, i) => K_TIP + (K_BASE - K_TIP) * (1 - i / (NODES - 1)) ** 2);
    this.cNode = Float32Array.from(this.kNode, (kk, i) => 2 * (ZETA_BASE + (ZETA_TIP - ZETA_BASE) * (i / (NODES - 1))) * Math.sqrt(kk));
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
  // p.reach: 手探り(巻きの始まりが先へずれてほどける)、p.jetWave: 噴射でなびく強さ(脈で付け根から先へ閉じる)
  trace(k, t, p, len, wave) {
    const a = armAngle(k);
    const phase = k * 1.37;
    const mirror = ARM_NAMES[k][0] === 'R' ? -1 : 1;
    // 腕ごとにテンポを変え、強さもゆっくり変える(いつも 1〜2 本がよく動く)
    const tk = t * (0.8 + 0.4 * hash(k + 11));
    wave *= 0.6 + 0.4 * Math.sin(0.21 * t + 2.3 * k);
    const r = p.reach;
    const e = p.e + 0.08 * Math.sin(0.7 * tk + phase);
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
      // 先の巻き: 先へ行くほど急に曲がる(対数らせん)。背中側へ巻くので車輪は外を向く。手探りでは始まりが先へずれてほどける
      const kc = ((-p.curl * 5.0) / (len - s + 0.6)) * smoothstep(0.3 + 0.4 * r, 0.62 + 0.3 * r, u);   // 太い先でも詰まらない大きさの渦
      // 付け根から先へ進む 2 つの波(先ほど大きく揺れる)
      let kv = p.bend * (1 - 0.4 * u) + kc + wave * u * (0.2 * Math.sin(1.3 * tk - 4 * u + phase) + 0.08 * Math.sin(2.3 * tk - 7 * u + 2 * phase));
      // 噴射: 押し出すとき腕を閉じる。付け根から先へ 0.25 秒遅れて伝わる
      if (p.jetWave > 0) kv += p.jetWave * 0.6 * (pulseAt(t - 0.25 * u) - 0.5);
      let kh = mirror * p.side * (1 - u) + wave * u * (0.16 * Math.sin(0.9 * tk - 3 * u + phase * 0.7) + 0.06 * Math.sin(1.9 * tk - 6 * u + phase));
      // 泳いでなびく腕: 付け根から先へ流れるうねり(先ほど大きい。リボンが水になびくように)
      if (p.swim > 0) {
        kh += p.swim * u * 0.42 * Math.sin(3.1 * t - 6.5 * u + phase);
        kv += p.swim * u * 0.22 * Math.sin(2.4 * t - 5 * u + phase * 1.3);
      }
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
      S.dp.fill(0);
      S.ready = true;
    } else if (dt > 0) {
      const steps = Math.min(12, Math.max(1, Math.ceil(dt / SIM_H - 1e-6)));
      const h = dt / steps;
      const keep = Math.max(0, 1 - DRAG * h);
      const { x, xp, tgt, prev, cur, d, dp } = S;
      const kN = this.kNode, cN = this.cNode;
      for (let st = 1; st <= steps; st++) {
        const f = st / steps;
        // この刻みの目標(前のコマの目標から線で補う)と、目標からのずれ
        for (let j = 0; j < NODES * 3; j++) {
          cur[j] = prev[j] + (tgt[j] - prev[j]) * f;
          d[j] = x[j] - cur[j];
        }
        for (let i = 1; i < NODES; i++) {
          const ip = (i - 1) * 3, ic = i * 3, inx = (i < NODES - 1 ? i + 1 : i) * 3;
          for (let c = 0; c < 3; c++) {
            const j = ic + c;
            const acc = -kN[i] * d[j] - cN[i] * (d[j] - dp[j]) / h + COUPLE * (d[ip + c] + d[inx + c] - 2 * d[j]);
            const p0 = x[j];
            x[j] = p0 + (p0 - xp[j]) * keep + acc * h * h;
            xp[j] = p0;
          }
        }
        dp.set(d);
        for (let c = 0; c < 3; c++) x[c] = xp[c] = cur[c];   // 付け根は目標に留める
        // 節の間隔を目標の間隔へ戻す(付け根から順に。1 つ前の位置も同じだけ動かして速さは変えない)
        for (let i = 1; i < NODES; i++) {
          const a = (i - 1) * 3, b = i * 3;
          const rest = Math.hypot(cur[b] - cur[a], cur[b + 1] - cur[a + 1], cur[b + 2] - cur[a + 2]);
          v.set(x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]);
          const l = v.length();
          if (l < 1e-9) continue;
          v.multiplyScalar(rest / l - 1);
          x[b] += v.x; x[b + 1] += v.y; x[b + 2] += v.z;
          xp[b] += v.x; xp[b + 1] += v.y; xp[b + 2] += v.z;
        }
      }
    }
    S.prev.set(S.tgt);
    if (amount <= 0 || !draw) return;   // 助走では状態を進めるだけ(描かないので、ずれを足す必要はない)
    // ずれ(世界の向き)→ 腕の座標の向きへ。先ほど大きくてよい
    for (let i = 0; i < NODES; i++) {
      const j = i * 3;
      v.set(S.x[j] - S.tgt[j], S.x[j + 1] - S.tgt[j + 1], S.x[j + 2] - S.tgt[j + 2]).applyMatrix3(this.invRot);
      // 腕に沿った向きのずれは除く(曲がりだけを足す)
      vt.fromArray(this.T, Math.round((i / (NODES - 1)) * STEPS) * 3);
      v.addScaledVector(vt, -v.dot(vt));
      // 上限でぷつりと切らず、なめらかに頭打ちにする
      const max = MAX_LAG * (i / (NODES - 1));
      const l = v.length();
      if (l > 1e-9 && max > 0) v.multiplyScalar((max * Math.tanh(l / max)) / l);
      else v.set(0, 0, 0);
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
  // o: { apart: 台本でばらす量(R2 だけ), exploded: 分解図, jet: 噴射, pulse: 噴射の脈, windup: 出ていく前の吸い込み, flare: 止まる前のブレーキ, soft: やわらかさ }
  // world: 腕の親(ロボット)の世界の行列、dt: 前のコマからの秒、reset: やわらかさを今の形に合わせ直す、draw: 置き場所を書くか(助走では書かない)
  update(t, poseFn, o, world, dt, reset = false, draw = true) {
    const m = this.mtx;
    let li = 0, si = 0, pi = 0;
    this.inv.copy(world).invert();
    this.invRot.setFromMatrix4(this.inv);
    for (let k = 0; k < ARM_COUNT; k++) {
      const name = ARM_NAMES[k];
      const pose = poseFn(t - STAGGER * RANK[name] - 0.06 * hash(k));
      const a = Math.max(k === DETACH_ARM ? o.apart : 0, o.exploded * 0.45);
      const p = this.blend(k, pose);
      const reach = reachAt(t, k) * pose.hold * (1 - a);
      p.reach = reach;
      p.e += 0.3 * reach;
      p.side += 0.22 * reach * (k % 2 ? 1 : -1);
      p.curl *= (1 - 0.4 * reach) * (0.9 + 0.1 * Math.sin(0.6 * t + k * 1.9)) * (1 - 0.75 * a);
      // ひとかき(ふだん): 腕を少し閉じる。出ていく前の吸い込み: 腕を開いて先を巻く
      p.e -= 0.1 * strokeAt(t - 0.03 * RANK[name]) * pose.hold;
      p.e += 0.25 * o.windup;
      p.curl *= 1 + 0.3 * o.windup;
      // 噴射: 水を押し出すとき腕を閉じ、吸い込むとき開く(イカの泳ぎ)。曲がりの波は trace で付け根から先へ
      p.e += pose.trail * o.jet * 0.12 * (0.5 - o.pulse);
      p.jetWave = pose.trail * o.jet;
      p.swim = pose.trail;
      // 止まる前のブレーキ: 腕を傘のように開いて、先を少し巻く
      p.e += 0.55 * o.flare;
      p.curl *= 1 + 0.4 * o.flare;
      p.bend *= 1 - 0.7 * a;
      p.side *= 1 - 0.7 * a;
      p.e = p.e * (1 - a) + 0.3 * a;   // ばらすときは横へ、少し上へ伸ばす
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
      this.tipMesh.setMatrixAt(k, this.placeAt(tipS, m, radiusAt(L) * 0.8));
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
