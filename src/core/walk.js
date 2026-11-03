import * as THREE from 'three';
import { smoothstep, smootherstep, clamp } from '../util.js';
import { FLOOR_Y } from '../stage.js';

// 脚で歩く生き物の共通の道具(蜘蛛・サソリ・カニ)。どれも時刻 t だけで決まる(どの時刻へ飛んでも同じ絵)。
// 体は面(床など)の上を「進む位置 p + 向き yaw」で動く(生き物ごとの travelAt(t, out) が決める)。
// 足は進んだ量(歩数の元)で決める:
//   歩数の元 g = 進んだ道のりと、向きを変えた角度 × 腕の長さ(その場で回るときも足を運ぶ)
//   脚 i の歩みの位相 φ = g / 歩幅 + ずらし。φ の前半(duty)は足を面に置き(立脚)、後半で次の場所へ運ぶ(遊脚)
//   足を置く場所は「その立脚の真ん中の時刻に、体がいる場所での、ふだんの足の位置」(体が進むと足は後ろへ流れる)
//   止まると、運んでいる途中の足もそこで下ろす(activityAt)

export const HZ = 120;   // 表の細かさ

// ---- 道(2 次元の折れ線を細かく刻み、道のりで引けるようにする)
export function makePath(points) {
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
export function makeProgress(t0, t1, speed) {
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

// 2 次元の 3 次ベジェ(4 点)
export function bezier2(p, u) {
  const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
}
// 3 次ベジェを n 本の折れ線にした点の並び(makePath に渡す)
export const bezierPoints = (p, n = 120) => Array.from({ length: n + 1 }, (_, i) => bezier2(p, i / n));

// 折れ線の各辺を k 等分する
export function densify(pts, k) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < k; j++) out.push([pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * j) / k, pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * j) / k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// 道の向き: 前後 ±0.25 の差から(角が急に折れない)。(du, dv) を返す
const tmp = [0, 0], tmp2 = [0, 0];
export function headingOn(path, s) {
  path.at(s + 0.25, tmp);
  path.at(s - 0.25, tmp2);
  return [tmp[0] - tmp2[0], tmp[1] - tmp2[1]];
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// ---- 歩数の元 g(t) の表。[t0, t1] のあいだ travelAt は同じ面の上にいること
export function makeGait(travelAt, t0, t1, turnArm = 1.2) {
  const n = Math.ceil((t1 - t0) * HZ);
  const tab = new Float32Array(n + 1);
  const a = {}, b = {};
  travelAt(t0, a);
  let ap = [...a.p], ay = a.yaw;
  for (let i = 1; i <= n; i++) {
    travelAt(Math.min(t1 - 1e-6, t0 + i / HZ), b);
    const dy = wrapAngle(b.yaw - ay);
    tab[i] = tab[i - 1] + Math.hypot(Math.hypot(b.p[0] - ap[0], b.p[1] - ap[1]), dy * turnArm);
    ap = [...b.p];
    ay = b.yaw;
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

// ---- 面: 面の座標 (u, v) → 世界と、面の上の向き(体の座標: 頭 +z、背中 +y、左 +x)
// 床: (u, v) = 世界の (x, z)、yaw は +z から +x へ
export const FLOOR = {
  toWorld: (u, v, out) => out.set(u, FLOOR_Y, v),
  basis(yaw, fwd, up, side) {
    fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    up.set(0, 1, 0);
    side.crossVectors(up, fwd);
  },
};
// 縦の面(z = z0): (u, v) = 世界の (x, y)、yaw は +x から +y へ。背中は +z(手前)
export function verticalPlane(z0) {
  return {
    toWorld: (u, v, out) => out.set(u, v, z0),
    basis(yaw, fwd, up, side) {
      fwd.set(Math.cos(yaw), Math.sin(yaw), 0);
      up.set(0, 0, 1);
      side.crossVectors(up, fwd);
    },
  };
}

// ---- 足の運び。cfg: {
//   travelAt(t, out): out.surface(面の名前)・out.p([u, v])・out.yaw を書く
//   surfaces: { 面の名前: FLOOR など }、gaits: { 面の名前: makeGait(...) }、stride: { 面の名前: 歩幅 }
//   legs: [{ rest: [横, 前](体の座標で面の上), offset: 位相のずらし }]、duty(0.6)、lift(0.2) }
export function makeWalker(cfg) {
  const { travelAt, surfaces, gaits, stride, legs, duty = 0.6, lift = 0.2 } = cfg;
  const fv = new THREE.Vector3(), uv = new THREE.Vector3(), sv = new THREE.Vector3();
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const tr = {};

  // 脚 i のふだんの足の位置(その時刻の体の場所で)
  function restFoot(surface, i, t, out) {
    travelAt(t, tr);
    const S = surfaces[surface];
    S.basis(tr.yaw, fv, uv, sv);
    const [rx, rz] = legs[i].rest;
    S.toWorld(tr.p[0], tr.p[1], out);
    return out.addScaledVector(sv, rx).addScaledVector(fv, rz);
  }

  // 歩いている強さ(0〜1)。止まると、運んでいる途中の足もそこで下ろす
  function activityAt(surface, t) {
    const G = gaits[surface];
    return smoothstep(0.05, 0.5, (G.gAt(t + 0.15) - G.gAt(t - 0.15)) / 0.3 / stride[surface]);
  }

  function legPhase(surface, i, t) {
    const c = gaits[surface].gAt(t) / stride[surface] + legs[i].offset;
    const n = Math.floor(c);
    return { c, n, phi: c - n, stance: c - n < duty || activityAt(surface, t) < 0.15 };
  }

  // 足の世界の位置を out に書き、上げている量(0〜1)を返す
  function footAt(surface, i, t, out) {
    const G = gaits[surface];
    const D = stride[surface];
    const { n, phi } = legPhase(surface, i, t);
    const off = legs[i].offset;
    const plant = (k, o) => restFoot(surface, i, G.tAt((k + duty / 2 - off) * D), o);
    if (phi < duty) {
      plant(n, out);
      return 0;
    }
    const u = smootherstep(duty, 1, phi);
    plant(n, pa);
    plant(n + 1, pb);
    out.copy(pa).lerp(pb, u);
    const up = Math.sin(Math.PI * u) * activityAt(surface, t);
    travelAt(t, tr);
    surfaces[surface].basis(tr.yaw, fv, uv, sv);
    out.addScaledVector(uv, lift * up);
    return up;
  }

  // 面の上の体の向き(四元数)
  const mBasis = new THREE.Matrix4();
  function surfaceQuat(surface, yaw, q) {
    surfaces[surface].basis(yaw, fv, uv, sv);
    return q.setFromRotationMatrix(mBasis.makeBasis(sv, uv, fv));
  }

  // 体の位置と向き(面の上、高さ ride。歩くと 1 歩に 2 回少し上下する)。面の名前を返す
  function bodyOnSurface(t, ride, outPos, outQuat, bob = 0.018) {
    travelAt(t, tr);
    const surface = tr.surface;
    const S = surfaces[surface];
    S.toWorld(tr.p[0], tr.p[1], outPos);
    S.basis(tr.yaw, fv, uv, sv);
    const g = gaits[surface].gAt(t) / stride[surface];
    outPos.addScaledVector(uv, ride + bob * Math.sin(4 * Math.PI * g) + 0.01 * Math.sin(1.3 * t));
    surfaceQuat(surface, tr.yaw, outQuat);
    return surface;
  }

  return { restFoot, activityAt, legPhase, footAt, surfaceQuat, bodyOnSurface };
}
