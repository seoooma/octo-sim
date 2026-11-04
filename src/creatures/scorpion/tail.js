import { keys } from '../../core/timeline.js';
import { smoothstep } from '../../util.js';
import { T, TAIL_LAG } from './layout.js';
import { GAIT, STRIDE, activityAt, pulseAt } from './path.js';

// 尾(5 節 + 末節)の関節の角度。どれも時刻 t だけで決まる。
// 角度は節ごとの蝶番(正で上へ曲がる。付け根からの足し算)。付け根には左右の首振り(swivel)もある。
// 関節 k は「k × TAIL_LAG 秒前の形」を取る → 先ほど少し遅れてついてくる(むちのように)

// 形(付け根 T1 → T5、末節 TELSON)。尾の形は /tmp で数値を探して決めた(針の先の位置)
const POSE = {
  LOW: [0.05, 0.05, 0.06, 0.09, 0.13, 0.55],      // 歩くとき: 後ろに低く引く(針の先だけ上を向く)
  ALERT: [0.55, 0.34, 0.34, 0.38, 0.42, 0.85],    // 威嚇: 半分持ち上げる
  ARCH: [1.0, 0.5, 0.52, 0.56, 0.6, 0.95],        // 背中の上へ弓なり(針は頭の後ろの上で前下を向く)
  COCK: [1.12, 0.36, 0.38, 0.46, 0.58, 1.2],      // 刺す前に引く
  STRIKE: [1.45, 0.75, 0.45, 0.27, 0.27, 0.6],    // 前へ振り下ろした形(針の先が頭の前の上)
  GRIP: [0.85, 0.45, 0.48, 0.52, 0.56, 0.9],      // はさむあいだは低めの弓なり
};
export const TAIL_POSE = POSE;

// [時刻, 形, 緩急]。刺すところは 'in'(だんだん速く振り切る)、戻りは 'out'
const s1 = T.strike1, s2 = T.strike2;
const KEYS = [
  [0, POSE.LOW], [5.3, POSE.LOW], [6.6, POSE.ALERT], [9.2, POSE.ALERT], [10.9, POSE.ARCH],
  [s1 - 0.62, POSE.ARCH], [s1 - 0.2, POSE.COCK], [s1, POSE.STRIKE, 'in'], [s1 + 0.12, POSE.STRIKE], [s1 + 0.75, POSE.ARCH, 'out'],
  [s2 - 0.45, POSE.ARCH], [s2 - 0.2, POSE.COCK], [s2, POSE.STRIKE, 'in'], [s2 + 0.12, POSE.STRIKE], [s2 + 0.8, POSE.ARCH, 'out'],
  [16.3, POSE.ARCH], [17.2, POSE.ALERT], [20.0, POSE.ALERT], [21.4, POSE.GRIP], [25.2, POSE.GRIP], [27.4, POSE.LOW],
];

// 刺したあとの震え(先ほど大きい)
const QUIVER = [0.2, 0.35, 0.55, 0.75, 0.9, 1.0];
const STRIKES = [s1, s2];

// out = { yaw, a: [6] }
export function tailAt(t, out = { yaw: 0, a: new Array(6).fill(0) }) {
  const act = activityAt('floor', t);
  const g = GAIT.floor.gAt(t) / STRIDE.floor;
  for (let k = 0; k < 6; k++) {
    const tk = t - k * TAIL_LAG;
    let a = keys(tk, KEYS)[k];
    // 生きている揺れ: 付け根から先へ伝わるゆっくりの波
    a += (0.022 + 0.006 * k) * Math.sin(1.5 * t - 0.65 * k);
    // 歩くと少し上下に弾む
    a += 0.03 * act * Math.sin(4 * Math.PI * g - 0.8 * k);
    for (const ts of STRIKES) {
      const d = tk - ts - 0.12;
      if (d > 0 && d < 1.2) a += 0.09 * QUIVER[k] * Math.exp(-d / 0.2) * Math.sin(24 * d);
    }
    out.a[k] = a;
  }
  // 付け根の首振り: 歩くと左右に、威嚇・UV ではゆっくり探る
  out.yaw =
    0.1 * act * Math.sin(2 * Math.PI * g - 0.6) +
    0.12 * Math.sin((t - 6) * 1.1) * smoothstep(5.6, 6.4, t) * (1 - smoothstep(8.6, 9.4, t)) +
    0.1 * Math.sin((t - 16.4) * 0.9) * smoothstep(16.2, 17.0, t) * (1 - smoothstep(19.0, 19.8, t)) +
    0.03 * Math.sin(0.7 * t);
  return out;
}

// 針の先の光(刺して先が届いたとき。末節は 5 × 遅れで届く)
export const stingGlowAt = (t) => Math.max(pulseAt(t, s1 + 5 * TAIL_LAG + 0.1, 0.16, 0.7), pulseAt(t, s2 + 5 * TAIL_LAG + 0.1, 0.16, 0.7));

// 毒の量(上の帯 VENOM LOAD)。尾を反らすとためて、刺すたびに減り、ゆっくり戻る
export function venomAt(t) {
  const charge = keys(t, [[0, 0.22], [6.0, 0.3], [9.4, 0.42], [11.6, 0.94], [12.8, 0.97]]);
  const spent = 0.36 * smoothstep(s1, s1 + 0.25, t) + 0.34 * smoothstep(s2, s2 + 0.25, t);
  const refill = 0.4 * smoothstep(s2 + 0.6, T.end, t);
  return Math.max(0.05, charge - spent + refill * (t > s2 ? 1 : 0));
}
