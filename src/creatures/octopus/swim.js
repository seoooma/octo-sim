import * as THREE from 'three';
import { rotAt, poseAt, strokeAt, pulseAt, jetAt } from './timeline.js';
import { smoothstep, smootherstep, clamp } from '../../util.js';

// 泳ぎ: ロボットの体の位置と向きを、時刻だけで決める(泡の跡や計器も同じ関数から作る)。
// - 道は弧(3 次ベジェ)。頭(体の +y)は進む向きへ向き、目(+z)はなるべく手前へ
// - 速さは噴射の脈で押す: 押し出した直後に速くなり、吸っているあいだは惰性で滑る(戻ることはない)
// - 止まる前は速さを落として、向きを起こす(腕は傘のように開いてブレーキ。arms.js)

// 入ってくる: 右下の手前から、弧を描いて止まる位置へ。出ていく: 少し浮いてから右上の奥へ
const SWIM_IN = { t0: 0, t1: 4.0, pts: [[4.6, -2.6, 2.0], [2.8, -1.9, 1.5], [0.8, -0.3, 0.5], [0, 0, 0]] };
const SWIM_OUT = { t0: 21.7, t1: 25, pts: [[0, 0, 0], [0.2, 0.9, 0.1], [2.4, 2.8, -0.7], [8.5, 5.4, -2.6]] };
const TABLE_HZ = 240;

// 噴射しているときの速さの形(脈の少しあとが速い)。噴射していないときは一定
const thrust = (t, idle) => {
  const j = jetAt(t);
  return j * (0.3 + 0.7 * pulseAt(t - 0.06)) + (1 - j) * idle;
};
// 入ってくる: だんだん遅くなって止まる。出ていく: だんだん速く
SWIM_IN.speed = (t) => (1 - smootherstep(SWIM_IN.t0, SWIM_IN.t1, t)) ** 0.8 * thrust(t, 0.55);
SWIM_OUT.speed = (t) => smoothstep(21.7, 21.95, t) * (0.4 + 0.9 * (t - 21.7)) * thrust(t, 0.3);

// 進み具合(0〜1)の表: 速さを細かく足し合わせて、終わりで 1 になるようにそろえる
for (const seg of [SWIM_IN, SWIM_OUT]) {
  const n = Math.ceil((seg.t1 - seg.t0) * TABLE_HZ);
  const tab = new Float32Array(n + 1);
  let acc = 0;
  for (let i = 1; i <= n; i++) {
    acc += seg.speed(seg.t0 + (i - 0.5) / TABLE_HZ) / TABLE_HZ;
    tab[i] = acc;
  }
  for (let i = 0; i <= n; i++) tab[i] /= acc;
  seg.tab = tab;
  seg.n = n;
}

function progress(seg, t) {
  const f = clamp((t - seg.t0) * TABLE_HZ, 0, seg.n);
  const i = Math.min(seg.n - 1, Math.floor(f));
  return seg.tab[i] + (seg.tab[i + 1] - seg.tab[i]) * (f - i);
}

function bezier(p, u, out) {
  const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
  return out.set(
    a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0],
    a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1],
    a * p[0][2] + b * p[1][2] + c * p[2][2] + d * p[3][2],
  );
}

function bezierTangent(p, u, out) {
  const a = 3 * (1 - u) ** 2, b = 6 * (1 - u) * u, c = 3 * u * u;
  return out.set(
    a * (p[1][0] - p[0][0]) + b * (p[2][0] - p[1][0]) + c * (p[3][0] - p[2][0]),
    a * (p[1][1] - p[0][1]) + b * (p[2][1] - p[1][1]) + c * (p[3][1] - p[2][1]),
    a * (p[1][2] - p[0][2]) + b * (p[2][2] - p[1][2]) + c * (p[3][2] - p[2][2]),
  );
}

const tan = new THREE.Vector3();
const head = new THREE.Vector3();
const front = new THREE.Vector3();
const side = new THREE.Vector3();
const basis = new THREE.Matrix4();
const qSwim = new THREE.Quaternion();
const qRoll = new THREE.Quaternion();
const euler = new THREE.Euler();

// 時刻 t の体の位置と向きを outPos / outQuat に書く
export function bodyPoseAt(t, outPos, outQuat) {
  const hold = poseAt(t).hold;
  const seg = t < SWIM_IN.t1 ? SWIM_IN : t > SWIM_OUT.t0 ? SWIM_OUT : null;
  if (seg) {
    const u = progress(seg, t);
    bezier(seg.pts, u, outPos);
    bezierTangent(seg.pts, Math.min(0.999, Math.max(0.001, u)), tan);
  } else {
    outPos.set(0, 0, 0);
  }
  // 止まっているあいだの漂い(ひとかきから 0.3 秒遅れて少し浮く)
  outPos.x += 0.07 * Math.sin(0.37 * t) * hold;
  outPos.y += 0.06 * Math.sin(0.8 * t) + 0.02 * Math.sin(1.9 * t + 1) + 0.05 * strokeAt(t - 0.3) * hold;
  outPos.z += 0.05 * Math.sin(0.29 * t + 2) * hold;
  // 台本の向き(くちばしで傾くなど)とゆらぎ
  const r = rotAt(t);
  euler.set(r[0] + 0.04 * Math.sin(0.53 * t), r[1] + 0.3 * Math.sin(0.42 * t) * hold, r[2] + 0.05 * Math.sin(0.41 * t + 1));
  outQuat.setFromEuler(euler);
  // 泳いでいるあいだは頭を進む向きへ(入ってくるときは止まる前に起こし、出ていくときは浮きながら倒す)
  const w = seg === SWIM_IN ? 1 - smootherstep(2.3, 4.0, t) : seg === SWIM_OUT ? smootherstep(21.65, 22.5, t) : 0;
  if (w > 0) {
    head.copy(tan).normalize();
    front.set(0, 0, 1).addScaledVector(head, -head.z).normalize();   // 目はなるべく手前(+z)へ
    side.crossVectors(head, front);
    qSwim.setFromRotationMatrix(basis.makeBasis(side, head, front));
    qRoll.setFromAxisAngle(head, 0.07 * Math.sin(2 * Math.PI * 0.45 * t));   // ゆるい横揺れ
    qSwim.premultiply(qRoll);
    outQuat.slerp(qSwim, w);
  }
}

// 泳いでいる速さ(計器用、m/s らしく見える倍率)
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const qq = new THREE.Quaternion();
export function swimSpeedAt(t) {
  bodyPoseAt(t - 0.05, pa, qq);
  bodyPoseAt(t + 0.05, pb, qq);
  return { speed: pa.distanceTo(pb) * 10 * 1.15, vy: (pb.y - pa.y) * 10 };
}
