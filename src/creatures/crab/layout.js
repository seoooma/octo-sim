import { FLOOR_Y } from '../../stage.js';

// カニ(Benthos CR-10)の寸法。体の座標: 頭(前)が +z、背中が +y、左が +x(右は -x)。
// 体の原点は甲羅のふち(y = 0)の真ん中。甲羅はその上に丸く盛り上がり、下に胴(箱)がある。
export { FLOOR_Y };
export const RIDE = 0.62;                 // 床から体の原点までの高さ
export const STOP = { x: 0, z: 0 };       // 横歩きで入って止まる場所(床の x, z)

// ---- 甲羅の輪郭: 内側の六角形(反時計回り、x 右・z 上で見て)を半径 SHELL_RR で外へ丸める
export const SHELL_POLY = [[0.4, -0.46], [0.92, 0.08], [0.34, 0.5], [-0.34, 0.5], [-0.92, 0.08], [-0.4, -0.46]];
export const SHELL_RR = 0.18;
export const SHELL_H = 0.34;              // 甲羅のてっぺんの高さ
export const RIM_Y = -0.08;               // 甲羅のふちの高さ(胴の横を覆う)
// 甲羅の高さ(輪郭の中の割合 r: 0 が真ん中、1 がふち)。ゆるい丸屋根で、ふちは丸く下へ落ちる
export const domeY = (r) => RIM_Y + (SHELL_H - RIM_Y) * Math.pow(Math.max(0, 1 - Math.min(1, r) ** 2), 0.62);
// 甲羅の後ろの蝶番(体の座標)。開くときは x 軸のまわりに前を持ち上げる
export const HINGE = [0, -0.03, -0.58];
export const SHELL_OPEN = 1.08;           // 開いたときの角度(ラジアン、約 62°)

// ---- 胴(甲羅の下の箱): 甲羅の輪郭を縮めた形。上は開いていて、甲羅を開くと中の機械が見える
export const HULL_SCALE = 0.78;
export const HULL_RR = 0.13;
export const HULL_TOP = 0.0;
export const HULL_FLOOR = -0.08;          // 中の床
export const HULL_BOTTOM = -0.27;

// 角の丸い凸の多角形の輪郭。poly を rr で外へ丸め、道のりで等分した n 点 [x, z] を返す。
// 始まりは後ろの真ん中(-z)で、+x(左)へ回る。u と 1 - u の点は左右の鏡写し
export function roundedOutline(poly, rr, n = 120, scale = 1) {
  const P = poly.map(([x, z]) => [x * scale, z * scale]);
  const N = P.length;
  const normal = (a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    return Math.atan2(-dx / l, dz / l);   // 外向きの法線 (dz, -dx) の角度
  };
  const dense = [];
  // 最後の辺(右後ろ → 左後ろ)の真ん中から始める
  const last = P[N - 1], first = P[0];
  const n0 = normal(last, first);
  dense.push([(last[0] + first[0]) / 2 + rr * Math.cos(n0), (last[1] + first[1]) / 2 + rr * Math.sin(n0)]);
  for (let i = 0; i < N; i++) {
    const prev = P[(i + N - 1) % N], cur = P[i], next = P[(i + 1) % N];
    let a0 = normal(prev, cur), a1 = normal(cur, next);
    while (a1 < a0) a1 += Math.PI * 2;
    for (let k = 0; k <= 16; k++) {
      const a = a0 + ((a1 - a0) * k) / 16;
      dense.push([cur[0] + rr * Math.cos(a), cur[1] + rr * Math.sin(a)]);
    }
  }
  dense.push(dense[0]);
  const len = [0];
  for (let i = 1; i < dense.length; i++) len.push(len[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = len[len.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * total;
    while (len[j + 1] < s) j++;
    const w = (s - len[j]) / Math.max(1e-9, len[j + 1] - len[j]);
    out.push([dense[j][0] + (dense[j + 1][0] - dense[j][0]) * w, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * w]);
  }
  out.perimeter = total;
  return out;
}

// 輪郭の上の点(u は 0〜1、ぐるりと回る。点のあいだはまっすぐつなぐ)
export function outlineAt(pts, u, out = [0, 0]) {
  const n = pts.length;
  const f = (((u % 1) + 1) % 1) * n;
  const i = Math.floor(f) % n, w = f - Math.floor(f);
  const a = pts[i], b = pts[(i + 1) % n];
  out[0] = a[0] + (b[0] - a[0]) * w;
  out[1] = a[1] + (b[1] - a[1]) * w;
  return out;
}

// 輪郭の左(+x)の端の x(その z で)
export function outlineHalfWidth(pts, z) {
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[1] - z) * (b[1] - z) > 0 || a[1] === b[1]) continue;
    const x = a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]);
    best = Math.max(best, x);
  }
  return best;
}

export const SHELL_OUTLINE = roundedOutline(SHELL_POLY, SHELL_RR, 120);
export const HULL_OUTLINE = roundedOutline(SHELL_POLY, HULL_RR, 120, HULL_SCALE);

// ---- 歩く脚(左右 4 本ずつ、横へ伸びる)。名前は体の左 +x が L、右 -x が R、前から後ろへ 1〜4
export const LEG_NAMES = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
const HIP_Z = [0.27, 0.07, -0.13, -0.33];
const REST = [[1.66, 0.74], [1.92, 0.3], [1.9, -0.24], [1.6, -0.8]];   // ふだん足を置く場所(体の座標の [横, 前])
export const LEGS = LEG_NAMES.map((name, i) => {
  const side = name[0] === 'L' ? 1 : -1;
  const j = i % 4;
  return {
    name,
    side,
    j,
    hip: [side * (outlineHalfWidth(HULL_OUTLINE, HIP_Z[j]) - 0.03), -0.13, HIP_Z[j]],
    rest: [side * REST[j][0], REST[j][1]],
    // 交互の 4 本ずつ(L1・L3・R2・R4 と L2・L4・R1・R3)、前から後ろへ少しずつ遅らせる
    offset: ((j % 2 === 0) === (side > 0) ? 0 : 0.5) + 0.07 * j,
  };
});
export const SEG = [0.62, 0.56, 0.5];     // 腿・脛・先の長さ
export const LEG_SIZE = 1.12;             // 脚の太さの倍率

// ---- はさみ(左右で大きさが違う)。右(-x)が大きな砕くはさみ、左(+x)が小さな切るはさみ
// shoulder: 付け根(体の座標)、arm: [腕(長節)、手首(腕節)] の長さ、palm: 手のひら [幅, 高さ, 長さ]、
// finger: 指 [長さ, 付け根の高さ, 幅]、reach: 手首からつまむ点まで
const clawDims = (side, k) => {
  const palm = [0.25 * k, 0.33 * k, 0.6 * k];
  const finger = [0.44 * k, 0.105 * k, 0.11 * k];
  return {
    side,
    shoulder: [side * 0.42, -0.1, 0.52],
    arm: [side > 0 ? 0.56 : 0.6, side > 0 ? 0.32 : 0.36],
    armShell: [0.09 * Math.sqrt(k), 0.08 * Math.sqrt(k)],
    palm,
    finger,
    reach: palm[2] + finger[0] * 0.55,
  };
};
export const CLAWS = { R: clawDims(-1, 1), L: clawDims(1, 0.74) };

// 拾う物(マンガンの団塊)。床の上、止まる場所の左前
export const NODULE = { x: STOP.x + 0.62, z: STOP.z + 1.62, r: 0.075 };
