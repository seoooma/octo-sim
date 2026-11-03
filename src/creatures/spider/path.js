import * as THREE from 'three';
import { smoothstep, smootherstep } from '../../util.js';
import { makePath, makeProgress, bezierPoints, densify, headingOn, wrapAngle as wrap, makeGait, makeWalker, FLOOR, verticalPlane } from '../../core/walk.js';
import { WEB, SPIRAL, RADIAL_COUNT, radialAngle, FLOOR_Y, RIDE, RIDE_W, STOP, LEGS } from './layout.js';

// 蜘蛛の体の道と、足の運び。どれも時刻 t だけで決まる。足の運びの仕組みは core/walk.js。
// 面は床(floor)と巣(web、縦の面)。そのあいだは引き糸にぶら下がる(air)

export const STRIDE = { floor: 0.75, web: 1.25 };

// 時刻の区切り
export const T = {
  walkEnd: 4.9, turn0: 5.0, turn1: 7.4,
  air0: 10.5, air1: 14.0,
  radial0: 14.3, radial1: 18.3,
  spiral0: 18.5, spiral1: 27.8, turnHome1: 28.6,
  home1: 30.4, settle1: 31.2, end: 32,
};

// 床を歩く道(右の奥から、輪の手前へ。床の (x, z))
const WALK = makePath(bezierPoints([[7.6, 3.4], [4.6, 3.3], [1.8, STOP.z], [STOP.x, STOP.z]]));
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

const tmp = [0, 0];

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
const WALK_END_YAW = (() => { const h = headingOn(WALK, WALK.total - 0.3); return Math.atan2(h[0], h[1]); })();
const SPIRAL_END_YAW = (() => { const h = headingOn(SPIRAL_WALK, SPIRAL_WALK.total - 0.3); return Math.atan2(h[1], h[0]); })();
const HOME_YAW = Math.atan2(WEB.cy - SPIRAL_END[1], WEB.cx - SPIRAL_END[0]);
export const spiralPointAt = (s, out) => SPIRAL_WALK.at(s, out);

// ---- 歩数の元 g(t)(床と巣で別の表)と、足の運び(core/walk.js)
export const GAIT = { floor: makeGait(travelAt, 0, T.air0), web: makeGait(travelAt, T.air1, T.end) };
const SURFACES = { floor: FLOOR, web: verticalPlane(WEB.z) };
const WALKER = makeWalker({ travelAt, surfaces: SURFACES, gaits: GAIT, stride: STRIDE, legs: LEGS });
export const { activityAt, legPhase, footAt } = WALKER;

// ---- 体の位置と向き(体の座標 → 世界)。上下の揺れ・登るときの振り子を含む
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const bp = new THREE.Vector3();
const tr = {};
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
    WALKER.surfaceQuat('floor', 0, qa);
    WALKER.surfaceQuat('web', -Math.PI / 2, qb);
    outQuat.slerpQuaternions(qa, qb, smootherstep(T.air0 + 0.2, T.air1 - 0.3, t));
    return 'air';
  }
  return WALKER.bodyOnSurface(t, tr.surface === 'floor' ? RIDE : RIDE_W, outPos, outQuat);
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
