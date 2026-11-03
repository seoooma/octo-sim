import * as THREE from 'three';
import { smoothstep, smootherstep, clamp } from '../../util.js';
import { WEB, SPIRAL, RADIAL_COUNT, radialAngle, FLOOR_Y, RIDE, RIDE_W, STOP, LEGS } from './layout.js';

// 蜘蛛の体の道と、足の運び。どれも時刻 t だけで決まる(どの時刻へ飛んでも同じ絵)。
// 面(床 floor・巣 web)の上を「進む位置 + 向き」で動き、足は進んだ量(歩数の元)で決める:
//   歩数の元 g = 進んだ道のり + 向きを変えた角度 × 腕の長さ(その場で回るときも足を運ぶ)
//   脚 i の歩みの位相 φ = g / 歩幅 + ずらし。φ の前半は足を面に置き(立脚)、後半で次の場所へ運ぶ(遊脚)
//   足を置く場所は「その立脚の真ん中の時刻に、体がいる場所での、ふだんの足の位置」(体が進むと足は後ろへ流れる)

export const STRIDE = { floor: 0.75, web: 1.25 };
const DUTY = 0.6;        // 足を置いている割合
const LIFT = 0.2;        // 足を上げる高さ
const TURN_ARM = 1.2;    // 向きを変えたとき、何歩ぶんに数えるか(角度 × この長さ)
const HZ = 120;          // 表の細かさ

// 時刻の区切り
export const T = {
  walkEnd: 4.9, turn0: 5.0, turn1: 7.4,
  air0: 10.5, air1: 14.0,
  radial0: 14.3, radial1: 18.3,
  spiral0: 18.5, spiral1: 27.8, turnHome1: 28.6,
  home1: 30.4, settle1: 31.2, end: 32,
};

// ---- 道(折れ線を細かく刻み、道のりで引けるようにする)
function makePath(points) {
  const len = [0];
  for (let i = 1; i < points.length; i++) len.push(len[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = len[len.length - 1];
  const at = (s, out) => {
    s = clamp(s, 0, total);
    let lo = 0, hi = len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (len[mid] <= s) lo = mid;
      else hi = mid;
    }
    const w = (s - len[lo]) / Math.max(1e-9, len[hi] - len[lo]);
    out[0] = points[lo][0] + (points[hi][0] - points[lo][0]) * w;
    out[1] = points[lo][1] + (points[hi][1] - points[lo][1]) * w;
    return out;
  };
  return { at, total };
}

// 速さの形 speed(t) を足し合わせ、[t0, t1] で 0 → 1 に進む表にする
function makeProgress(t0, t1, speed) {
  const n = Math.ceil((t1 - t0) * HZ);
  const tab = new Float32Array(n + 1);
  let acc = 0;
  for (let i = 1; i <= n; i++) tab[i] = acc += speed(t0 + (i - 0.5) / HZ) / HZ;
  for (let i = 0; i <= n; i++) tab[i] /= acc;
  return (t) => {
    const f = clamp((t - t0) * HZ, 0, n);
    const i = Math.min(n - 1, Math.floor(f));
    return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
  };
}

function bezier2(p, u) {
  const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
}

// 床を歩く道(右の奥から、輪の手前へ。床の (x, z))
const WALK = makePath(Array.from({ length: 121 }, (_, i) => bezier2([[7.6, 3.4], [4.6, 3.3], [1.8, STOP.z], [STOP.x, STOP.z]], i / 120)));
const walkProgress = makeProgress(0, T.walkEnd, (t) => (1 - smootherstep(2.4, T.walkEnd, t)) ** 0.7 + 0.02);

// 巣の横糸(多角形の頂点は縦糸の上)。巣の面の (x, y)
const SPIRAL_N = Math.round(RADIAL_COUNT * SPIRAL.turns);
export const SPIRAL_PTS = Array.from({ length: SPIRAL_N + 1 }, (_, j) => {
  const a = radialAngle(SPIRAL.start + j);
  const r = SPIRAL.r0 + ((SPIRAL.r1 - SPIRAL.r0) * j) / SPIRAL_N;
  return [WEB.cx + r * Math.cos(a), WEB.cy + r * Math.sin(a)];
});
// 横糸を張りながら歩く道: 真ん中 → 渦巻きの始まり → 渦巻き(角を少し丸める)
const SPIRAL_WALK = makePath([[WEB.cx, WEB.cy], ...densify(SPIRAL_PTS, 6)]);
const spiralProgress = makeProgress(T.spiral0, T.spiral1, (t) => smoothstep(T.spiral0, T.spiral0 + 0.8, t) * (1 - smoothstep(T.spiral1 - 0.6, T.spiral1, t)) + 0.03);
const SPIRAL_END = SPIRAL_PTS[SPIRAL_PTS.length - 1];
const HOME = makePath([SPIRAL_END, [WEB.cx, WEB.cy]]);
const homeProgress = makeProgress(T.turnHome1, T.home1, (t) => smoothstep(T.turnHome1, T.turnHome1 + 0.4, t) * (1 - smoothstep(T.home1 - 0.6, T.home1, t)) + 0.03);
// 渦巻きの何本目の頂点まで張ったか(道のり → 頂点)
export const SPIRAL_START_S = Math.hypot(SPIRAL_PTS[0][0] - WEB.cx, SPIRAL_PTS[0][1] - WEB.cy);

function densify(pts, k) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < k; j++) out.push([pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * j) / k, pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * j) / k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// 向き: 道の前後 ±0.25 の差から(角が急に折れない)
const tmp = [0, 0], tmp2 = [0, 0];
function headingOn(path, s) {
  path.at(s + 0.25, tmp);
  path.at(s - 0.25, tmp2);
  return [tmp[0] - tmp2[0], tmp[1] - tmp2[1]];
}

// ---- 面の上の「進む位置と向き」。surface: 'floor' | 'air' | 'web'
// floor: p = (x, z)、heading = 前の向き (dx, dz)。web: p = 巣の面の (x, y)、heading = (dx, dy)
const SPIN_TURNS = 1;
export const radialSpin = (t) => smootherstep(T.radial0, T.radial1, t) * SPIN_TURNS;   // 縦糸を打つときの回転(回数)

export function travelAt(t, out = {}) {
  if (t < T.air0) {
    out.surface = 'floor';
    if (t <= T.walkEnd) {
      const s = walkProgress(t) * WALK.total;
      WALK.at(s, tmp);
      out.p = [tmp[0], tmp[1]];
      const h = headingOn(WALK, Math.max(0.3, s));
      out.yaw = Math.atan2(h[0], h[1]);
    } else {
      out.p = [STOP.x, STOP.z];
      // その場で回ってこちらを向く(歩き終えた向き → 手前 0)
      out.yaw = WALK_END_YAW * (1 - smootherstep(T.turn0, T.turn1, t));
    }
    return out;
  }
  if (t < T.air1) {
    out.surface = 'air';
    out.p = null;
    return out;
  }
  out.surface = 'web';
  if (t < T.spiral0) {
    out.p = [WEB.cx, WEB.cy];
    out.yaw = -Math.PI / 2 + 2 * Math.PI * radialSpin(t);   // 頭を下に、その場で 1 回り
  } else if (t < T.spiral1) {
    const s = spiralProgress(t) * SPIRAL_WALK.total;
    SPIRAL_WALK.at(s, tmp);
    out.p = [tmp[0], tmp[1]];
    const h = headingOn(SPIRAL_WALK, Math.max(0.3, s));
    // 真ん中から出るとき、頭を下に向けたまま始める
    const w = smoothstep(0.1, 0.9, s);
    out.yaw = Math.atan2(h[1] * w - (1 - w), h[0] * w);
    out.spiralS = s;
  } else if (t < T.turnHome1) {
    out.p = [SPIRAL_END[0], SPIRAL_END[1]];
    out.yaw = SPIRAL_END_YAW + wrap(HOME_YAW - SPIRAL_END_YAW) * smootherstep(T.spiral1, T.turnHome1, t);
    out.spiralS = SPIRAL_WALK.total;
  } else if (t < T.home1) {
    const s = homeProgress(t) * HOME.total;
    HOME.at(s, tmp);
    out.p = [tmp[0], tmp[1]];
    out.yaw = HOME_YAW;
    out.spiralS = SPIRAL_WALK.total;
  } else {
    out.p = [WEB.cx, WEB.cy];
    out.yaw = HOME_YAW + wrap(-Math.PI / 2 - HOME_YAW) * smootherstep(T.home1, T.settle1, t);   // 頭を下に戻す
    out.spiralS = SPIRAL_WALK.total;
  }
  return out;
}
export const SPIRAL_TOTAL = SPIRAL_WALK.total;
function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
const WALK_END_YAW = (() => { const h = headingOn(WALK, WALK.total - 0.3); return Math.atan2(h[0], h[1]); })();
const SPIRAL_END_YAW = (() => { const h = headingOn(SPIRAL_WALK, SPIRAL_WALK.total - 0.3); return Math.atan2(h[1], h[0]); })();
const HOME_YAW = Math.atan2(WEB.cy - SPIRAL_END[1], WEB.cx - SPIRAL_END[0]);
export const spiralPointAt = (s, out) => SPIRAL_WALK.at(s, out);

// ---- 歩数の元 g(t): 床と巣で別の表
function makeGait(t0, t1) {
  const n = Math.ceil((t1 - t0) * HZ);
  const tab = new Float32Array(n + 1);
  const a = {}, b = {};
  travelAt(t0, a);
  for (let i = 1; i <= n; i++) {
    travelAt(Math.min(t1 - 1e-6, t0 + i / HZ), b);
    let dy = b.yaw - a.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    tab[i] = tab[i - 1] + Math.hypot(Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]), dy * TURN_ARM);
    a.p = b.p; a.yaw = b.yaw;
  }
  const gAt = (t) => {
    const f = clamp((t - t0) * HZ, 0, n);
    const i = Math.min(n - 1, Math.floor(f));
    return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
  };
  // g → その g に初めて着いた時刻
  const tAt = (g) => {
    if (g <= 0) return t0;
    if (g >= tab[n]) return t1 - 1e-6;
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tab[mid] < g) lo = mid;
      else hi = mid;
    }
    const w = (g - tab[lo]) / Math.max(1e-9, tab[hi] - tab[lo]);
    return t0 + (lo + w) / HZ;
  };
  return { gAt, tAt, t0, t1, total: tab[n] };
}
export const GAIT = { floor: makeGait(0, T.air0), web: makeGait(T.air1, T.end) };

// 面の座標 → 世界。floor: (x, z) は y = 床、web: (x, y) は z = 巣の面
export function surfaceToWorld(surface, u, v, out) {
  return surface === 'floor' ? out.set(u, FLOOR_Y, v) : out.set(u, v, WEB.z);
}
// 面の上の向き (前・上・横) を作る。体の座標: 頭 +z、背中 +y、左 +x
export function surfaceBasis(surface, yaw, fwd, up, side) {
  if (surface === 'floor') {
    fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    up.set(0, 1, 0);
  } else {
    fwd.set(Math.cos(yaw), Math.sin(yaw), 0);
    up.set(0, 0, 1);
  }
  side.crossVectors(up, fwd);
}

// ---- 足の位置(脚 i、時刻 t)。面の上の世界の座標と、上げている量(0〜1)を返す
const fv = new THREE.Vector3(), uv = new THREE.Vector3(), sv = new THREE.Vector3();
const pa = new THREE.Vector3(), pb = new THREE.Vector3();
const tr = {};

// 脚 i のふだんの足の位置(その時刻の体の場所で)
function restFoot(surface, i, t, out) {
  travelAt(t, tr);
  surfaceBasis(surface, tr.yaw, fv, uv, sv);
  const [rx, rz] = LEGS[i].rest;
  surfaceToWorld(surface, tr.p[0], tr.p[1], out);
  return out.addScaledVector(sv, rx).addScaledVector(fv, rz);
}

// 歩いている強さ(0〜1)。止まると、運んでいる途中の足もそこで下ろす
export function activityAt(surface, t) {
  const G = GAIT[surface];
  return smoothstep(0.05, 0.5, (G.gAt(t + 0.15) - G.gAt(t - 0.15)) / 0.3 / STRIDE[surface]);
}

export function legPhase(surface, i, t) {
  const G = GAIT[surface];
  const D = STRIDE[surface];
  const c = G.gAt(t) / D + LEGS[i].offset;
  const n = Math.floor(c);
  return { c, n, phi: c - n, stance: c - n < DUTY || activityAt(surface, t) < 0.15 };
}

export function footAt(surface, i, t, out) {
  const G = GAIT[surface];
  const D = STRIDE[surface];
  const { n, phi } = legPhase(surface, i, t);
  const off = LEGS[i].offset;
  const plant = (k, o) => restFoot(surface, i, G.tAt((k + DUTY / 2 - off) * D), o);
  if (phi < DUTY) {
    plant(n, out);
    return 0;
  }
  const u = smootherstep(DUTY, 1, phi);
  plant(n, pa);
  plant(n + 1, pb);
  out.copy(pa).lerp(pb, u);
  const lift = Math.sin(Math.PI * u) * activityAt(surface, t);
  travelAt(t, tr);
  surfaceBasis(surface, tr.yaw, fv, uv, sv);
  out.addScaledVector(uv, LIFT * lift);
  return lift;
}

// ---- 体の位置と向き(体の座標 → 世界)。上下の揺れ・登るときの振り子を含む
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const mBasis = new THREE.Matrix4();
const bp = new THREE.Vector3();
function surfaceQuat(surface, yaw, q) {
  surfaceBasis(surface, yaw, fv, uv, sv);
  return q.setFromRotationMatrix(mBasis.makeBasis(sv, uv, fv));
}
const CLIMB_FROM = new THREE.Vector3(STOP.x, FLOOR_Y + RIDE, STOP.z);
const CLIMB_TO = new THREE.Vector3(WEB.cx, WEB.cy, WEB.z + RIDE_W);

export function bodyPoseAt(t, outPos, outQuat) {
  travelAt(t, tr);
  if (tr.surface === 'air') {
    // 糸を巻き上げて真ん中まで登る(お尻を上に。体は振り子のように少し揺れる)
    const u = smootherstep(T.air0, T.air1, t);
    outPos.copy(CLIMB_FROM).lerp(CLIMB_TO, u);
    outPos.z += 0.9 * Math.sin(Math.PI * u) * 0.6;
    outPos.x += 0.12 * Math.sin(3.1 * t) * Math.sin(Math.PI * u);
    surfaceQuat('floor', 0, qa);
    surfaceQuat('web', -Math.PI / 2, qb);
    outQuat.slerpQuaternions(qa, qb, smootherstep(T.air0 + 0.2, T.air1 - 0.3, t));
    return 'air';
  }
  const surface = tr.surface;
  surfaceToWorld(surface, tr.p[0], tr.p[1], outPos);
  surfaceBasis(surface, tr.yaw, fv, uv, sv);
  // 歩くと体が少し上下する(1 歩に 2 回)
  const g = GAIT[surface].gAt(t) / STRIDE[surface];
  outPos.addScaledVector(uv, (surface === 'floor' ? RIDE : RIDE_W) + 0.018 * Math.sin(4 * Math.PI * g) + 0.01 * Math.sin(1.3 * t));
  surfaceQuat(surface, tr.yaw, outQuat);
  return surface;
}

// 空中(登るあいだ)の重み: 足を体に引き寄せる量
export const airAt = (t) => smoothstep(T.air0, T.air0 + 0.5, t) * (1 - smoothstep(T.air1 - 0.5, T.air1, t));

// 体のおしりの先(糸いぼ)の世界の位置(糸を引く元)
export const SPIN_LOCAL = new THREE.Vector3(0, -0.02, -1.55);
export const RAISE_ANGLE = 0.5;   // おなかを持ち上げる角度(1 のとき)
export function spinneretAt(t, out, raise = 0) {
  bodyPoseAt(t, bp, qa);
  out.copy(SPIN_LOCAL);
  // おなかを持ち上げると先が上へ(付け根のまわりに回す)
  if (raise) out.sub(PEDICEL).applyAxisAngle(XAXIS, raise * RAISE_ANGLE).add(PEDICEL);
  return out.applyQuaternion(qa).add(bp);
}
export const PEDICEL = new THREE.Vector3(0, 0.05, -0.28);
const XAXIS = new THREE.Vector3(1, 0, 0);
