// サソリのカメラの構図(操作ごと。director.js)。follow 1 は体からの相対(世界の向き)、0 は世界に固定。
// どれも体(尾の先まで)が計器のない真ん中に収まり、左下の OPERATING MODE の見出しに重ならないように決めた
// (node tools/check/scorpion_frame.mjs で、見どころの時刻の映る四角を測って)
export const SHOTS = {
  walk: { pos: [-1.5, 4.2, 10.5], target: [1.3, -0.2, -0.3], fov: 30, follow: 1 },       // 左の前の上から(右から歩いてくる)
  threat: { pos: [2.0, 1.0, 7.4], target: [0, 0.35, 0.3], fov: 28, follow: 1 },          // 前の低いところから
  arch: { pos: [7.6, 1.7, 2.2], target: [0, 0.35, -0.1], fov: 30, follow: 1 },           // 横から(尾の弓の形)
  sting: { pos: [-5.8, 1.6, 4.8], target: [0, 0.3, -0.2], fov: 30, follow: 1 },          // 左の前から(振り下ろす向き)
  uv: { pos: [-5.2, 7.0, 6.0], target: [0, 0.1, -0.7], fov: 30, follow: 1 },             // 上から(背板の継ぎ目)
  grip: { pos: [1.0, 3.0, -8.6], target: [-0.3, 0.25, -0.5], fov: 30, follow: 1 },       // 向き直った体の右前から(右のはさみと箱)
  depart: { pos: [-0.2, 3.0, 9.6], target: [0.1, -0.2, -0.3], fov: 30, follow: 0.6 },   // 左の横から(左へ歩き去る)
};
