import { FLOOR_Y } from '../../stage.js';

// サソリ(Benthos SC-8)の寸法と時刻の区切り。体の座標: 頭が +z、背中が +y、左が +x(ロボットから見た左)。
// 体の原点は脚の付け根の真ん中(頭胸部の後ろ寄り)。床の上での高さ RIDE。
export { FLOOR_Y };
export const RIDE = 0.36;

// 時刻の区切り(台本 timeline.js と、体の道 path.js が使う)
export const T = {
  walkEnd: 4.7, pivot1: 5.9,         // 右から歩いて入り、その場で回ってこちらを向く
  threat0: 5.0, threat1: 9.0,        // はさみを開いて持ち上げる
  arch0: 9.0, arch1: 12.4,           // 尾を背中の上へ反らす
  sting0: 12.4, strike1: 13.6, strike2: 14.85, sting1: 16.0,   // 2 回刺す(尾の付け根が前へ振り切る時刻)
  uv0: 16.0, uv1: 19.8,              // 紫外線で殻の継ぎ目が光る
  grip0: 19.8, turn0: 19.85, turn1: 21.8, approach1: 22.6,      // 後ろの箱へ向きを変えて、1 歩寄る
  reach0: 22.1, reach1: 23.0, close: 23.45, lift1: 24.4,       // はさみを箱の上へ → 下ろして閉じる → 持ち上げる
  depart0: 25.0, end: 31.0,          // 箱を持って歩き去る
};

// 床の上の止まる場所(床の (x, z))。STOP で威嚇・尾・刺す・UV。そのあと GRIP_YAW へ回って STOP2 へ寄り、箱をはさむ
export const STOP = [0, 0.3];
export const GRIP_YAW = -2.6;
const FWD = [Math.sin(GRIP_YAW), Math.cos(GRIP_YAW)], RIGHT = [-Math.cos(GRIP_YAW), Math.sin(GRIP_YAW)];
export const STOP2 = [STOP[0] + FWD[0] * 0.55, STOP[1] + FWD[1] * 0.55];
// 床の上の小さな箱(サンプルの入れ物)。STOP2 で GRIP_YAW を向いたときの右前(はじめは体の後ろにある)
export const BOX = { size: [0.26, 0.2, 0.26], x: STOP2[0] + FWD[0] * 1.66 + RIGHT[0] * 0.5, z: STOP2[1] + FWD[1] * 1.66 + RIGHT[1] * 0.5 };

// ---- 体
export const PROSOMA = { c: [0, 0.0, 0.2], r: [0.44, 0.21, 0.9] };       // 頭胸部(この楕円体の真ん中の帯を盾にする)
export const PRO_THETA = [0.9, 2.25];
export const MESOSOMA = { c: [0, 0.0, -0.74], r: [0.52, 0.21, 0.92] };    // 中体(7 枚の背板を、この楕円体の帯として作る)
export const TERGITES = 7;
export const MESO_THETA = [0.75, 2.72];   // 中体の背板の範囲(前の極からの角度)
export const TAIL_BASE = [0, 0.02, -1.6]; // 尾の付け根(中体の後ろの端)

// 尾(後体): 5 節の長さと太さ(付け根 → 先)、末節(毒の袋 + 針)
export const TAIL_LEN = [0.36, 0.38, 0.41, 0.45, 0.52];
export const TAIL_W = [0.3, 0.28, 0.27, 0.26, 0.26];
export const TAIL_H = [0.25, 0.24, 0.23, 0.22, 0.22];
export const TELSON = { bulb: [0.15, 0.13, 0.22], len: 0.62 };   // 毒の袋の半径と、蝶番から針の先まで
export const TAIL_NAMES = ['T1', 'T2', 'T3', 'T4', 'T5', 'TELSON'];
export const TAIL_LAG = 0.035;   // 尾の関節ごとの遅れ(秒)。先ほど遅れてついてくる

// ---- はさみ(触肢): 付け根 → 腿 → 膝 → 手首 → 手(はさみ)。長さ [腿, 膝の節]
export const PALP = [0.5, 0.5];
export const PALP_HIP = [0.24, -0.02, 0.6];   // 左の付け根(右は x を反対に)
// 手の長さ・指の長さ・手首からつかむ点まで(手の軸の上)・つかむ点の外への寄り(動く指の側)
export const HAND = { len: 0.42, finger: 0.34, grip: 0.58, off: 0.065 };

// ---- 歩く脚(4 対)。付け根は頭胸部の下の両脇、足は横へ広げる(体を低く)
export const LEG_NAMES = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
const HIP_Z = [0.42, 0.22, 0.02, -0.18];
const REST_ANGLE = [0.68, 1.22, 1.82, 2.36];   // 前(+z)から横へ測った足の向き
const REST_DIST = [1.42, 1.48, 1.48, 1.46];
export const LEGS = LEG_NAMES.map((name, i) => {
  const side = name[0] === 'L' ? 1 : -1;
  const j = i % 4;
  return {
    name,
    side,
    j,
    hip: [side * (0.3 - 0.015 * j), -0.07, HIP_Z[j]],
    rest: [side * REST_DIST[j] * Math.sin(REST_ANGLE[j]), REST_DIST[j] * Math.cos(REST_ANGLE[j])],
    // 交互の 4 本ずつ(L1・R2・L3・R4 と R1・L2・R3・L4)。前から後ろへ少しずつ遅らせる
    offset: ((j % 2 === 0) === (side > 0) ? 0 : 0.5) + 0.08 * j,
  };
});
export const SEG = [0.56, 0.63, 0.36];   // 腿・脛・先の長さ(蜘蛛より短く太く、膝は背中の少し上まで)
export const LEG_SIZE = 1.0;             // 脚の太さの倍率
