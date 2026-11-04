import * as THREE from 'three';
import { DURATION, STROKES, thrustAt } from './timeline.js';
import { smoothstep, smootherstep, clamp } from '../../util.js';

// 泳ぎ: 傘の中心の位置と向きを、時刻だけで決める(触手のなびき・計器も同じ関数と表から作る)。
// - 上から沈んで入る → 脈で押して弧を描いて昇る → 漂う(止まると少し沈み、ゆるい打ちで浮き直す)→ 驚いて逃げ、上へ去る
// - 速さは打ちで押す: 閉じた直後に速くなり、開くあいだは惰性で滑る(戻ることはない)
// - 泳いでいるあいだは傘のてっぺん(体の +y)を進む向きへ。沈むときは落ちる傘のようにゆらゆら
const TABLE_HZ = 240;

const SINK = { t0: 0, t1: 4.8, pts: [[0.9, 7.8, -0.9], [0.6, 4.8, -0.5], [0.1, 2.4, -0.05], [0, 1.7, 0]] };
const SWIM = { t0: 4.8, t1: 10.0, pts: [[0, 1.7, 0], [0.1, 2.9, 0.1], [-0.6, 3.7, -0.1], [-1.3, 4.0, -0.3]] };
const HOLD0 = SWIM.t1;
const ESC = { t0: 24.6, t1: DURATION };

// 沈むとき: だんだん遅く(ブレーキの打ちでさらに落とす)。泳ぐとき・逃げるとき: 打ちで押して惰性
SINK.speed = (t) => (1 - smootherstep(0, 4.75, t)) ** 1.25 * (1 - 0.45 * Math.min(1, thrustAt(t))) + 0.004;
SWIM.speed = (t) => smoothstep(4.8, 5.1, t) * (0.04 + thrustAt(t)) * (1 - smoothstep(9.3, 10.0, t)) + 0.002;
ESC.speed = (t) => smoothstep(24.62, 24.85, t) * (0.03 + thrustAt(t)) * (0.75 + 0.2 * (t - ESC.t0)) + 0.002;

// 漂うあいだのずれ(泳ぎ終わりの位置から)。速さ 0 から始め、ゆっくり沈み、ゆるい打ちのたびに少し浮く
const HOLD_STROKES = STROKES.filter((s) => s.t0 > HOLD0 && s.t0 < ESC.t0);
function holdOffset(t, out) {
  const u = t - HOLD0;
  const sink = 0.055 * (u - 1.8 * (1 - Math.exp(-u / 1.8)));
  let lift = 0;
  for (const st of HOLD_STROKES) lift += st.amp * 0.4 * smootherstep(st.t0 + 0.05, st.t0 + 1.1, t);
  return out.set(0.16 * (1 - Math.cos(0.35 * u)), lift - sink, 0.12 * (1 - Math.cos(0.23 * u)));
}

// 逃げる道(漂い終わりの位置から): 横へ跳び、上へ去る
const hold1 = holdOffset(ESC.t0, new THREE.Vector3()).add(new THREE.Vector3().fromArray(SWIM.pts[3]));
ESC.curve = new THREE.CatmullRomCurve3(
  [[0, 0, 0], [0.35, 0.2, 0.12], [1.3, 0.8, 0.3], [1.8, 1.6, 0.2], [2.1, 3.2, -0.3], [2.4, 6.6, -1.3]].map((p) => new THREE.Vector3().fromArray(p).add(hold1)),
  false, 'centripetal',
);

// 進み具合(0〜1)の表: 速さを細かく足し合わせて、終わりで 1 になるようにそろえる
for (const seg of [SINK, SWIM, ESC]) {
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

const Y = new THREE.Vector3(0, 1, 0);
const tan = new THREE.Vector3();
const head = new THREE.Vector3();
const front = new THREE.Vector3();
const side = new THREE.Vector3();
const off = new THREE.Vector3();
const basis = new THREE.Matrix4();
const qSwim = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const qTilt = new THREE.Quaternion();
const euler = new THREE.Euler();

// 縦の軸まわりのゆっくりした回り
const yawAt = (t) => 0.35 + 0.045 * t + 0.12 * Math.sin(0.21 * t);

// 時刻 t の傘の中心の位置と向きを outPos / outQuat に書く
export function bodyPoseAt(t, outPos, outQuat) {
  let w = 0;
  if (t < SINK.t1) {
    const u = progress(SINK, t);
    bezier(SINK.pts, u, outPos);
  } else if (t < SWIM.t1) {
    const u = progress(SWIM, t);
    bezier(SWIM.pts, u, outPos);
    bezierTangent(SWIM.pts, clamp(u, 0.001, 0.999), tan);
    w = 0.75 * smoothstep(4.95, 5.7, t) * (1 - smoothstep(8.8, 10.0, t));
  } else if (t < ESC.t0) {
    outPos.fromArray(SWIM.pts[3]).add(holdOffset(t, off));
  } else {
    const u = progress(ESC, t);
    ESC.curve.getPointAt(u, outPos);
    ESC.curve.getTangentAt(clamp(u, 0.001, 0.999), tan);
    w = smoothstep(24.7, 25.25, t) * 0.85;
  }
  // ふだんの向き: 少し揺れる(沈むあいだは、落ちる傘のように左右にゆらゆら)
  const rock = 1 - smoothstep(3.4, 5.0, t);
  euler.set(
    0.05 * Math.sin(0.53 * t) + 0.1 * rock * Math.sin(1.3 * t + 0.5),
    0,
    0.06 * Math.sin(0.41 * t + 1) + 0.15 * rock * Math.sin(1.05 * t),
  );
  qTilt.setFromEuler(euler);
  qYaw.setFromAxisAngle(Y, yawAt(t));
  outQuat.copy(qTilt).multiply(qYaw);
  // 泳いでいるあいだは、てっぺんを進む向きへ(手前 +z はなるべく手前のまま)
  if (w > 0) {
    head.copy(tan).normalize();
    front.set(0, 0, 1).addScaledVector(head, -head.z).normalize();
    side.crossVectors(head, front);
    qSwim.setFromRotationMatrix(basis.makeBasis(side, head, front)).multiply(qYaw);
    outQuat.slerp(qSwim, w);
  }
}

// 触手のなびきが読む表(体の速さと向き)。どの時刻でも引けるよう、読み込むときに作っておく
const POSE_HZ = 120;
const PN = Math.ceil(DURATION * POSE_HZ);
const posTab = new Float32Array((PN + 1) * 3);
const quatTab = new Float32Array((PN + 1) * 4);
const velTab = new Float32Array((PN + 1) * 3);
{
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  let px = 0, py = 0, pz = 0, pw = 1;
  for (let i = 0; i <= PN; i++) {
    bodyPoseAt(Math.min(i / POSE_HZ, DURATION - 1e-4), p, q);
    // となりの表の値と同じ向きの半球にそろえる(線で補うとき遠回りしない)
    if (q.x * px + q.y * py + q.z * pz + q.w * pw < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    p.toArray(posTab, i * 3);
    q.toArray(quatTab, i * 4);
    [px, py, pz, pw] = [q.x, q.y, q.z, q.w];
  }
  for (let i = 0; i <= PN; i++) {
    const a = Math.max(0, i - 1), b = Math.min(PN, i + 1);
    for (let c = 0; c < 3; c++) velTab[i * 3 + c] = ((posTab[b * 3 + c] - posTab[a * 3 + c]) * POSE_HZ) / (b - a);
  }
}

function lookup(t) {
  const f = clamp(t * POSE_HZ, 0, PN);
  const i = Math.min(PN - 1, Math.floor(f));
  return [i, f - i];
}

// 時刻 t(前の時刻でもよい。0 より前は 0)の体の速さ(世界の向き、単位/秒)
export function velAt(t, out) {
  const [i, w] = lookup(t);
  const a = i * 3, b = a + 3;
  return out.set(velTab[a] + (velTab[b] - velTab[a]) * w, velTab[a + 1] + (velTab[b + 1] - velTab[a + 1]) * w, velTab[a + 2] + (velTab[b + 2] - velTab[a + 2]) * w);
}

// 時刻 t の体の向き(表から線で補う)
export function quatAt(t, out) {
  const [i, w] = lookup(t);
  const a = i * 4, b = a + 4;
  return out.set(
    quatTab[a] + (quatTab[b] - quatTab[a]) * w,
    quatTab[a + 1] + (quatTab[b + 1] - quatTab[a + 1]) * w,
    quatTab[a + 2] + (quatTab[b + 2] - quatTab[a + 2]) * w,
    quatTab[a + 3] + (quatTab[b + 3] - quatTab[a + 3]) * w,
  ).normalize();
}

// 泳いでいる速さ(計器用)
const vv = new THREE.Vector3();
export function swimSpeedAt(t) {
  velAt(t, vv);
  return { speed: vv.length(), vy: vv.y };
}
