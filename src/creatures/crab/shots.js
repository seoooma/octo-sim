// カニのカメラの構図(操作ごと。director.js)。follow 1 は体からの相対、0 は世界に固定。
// 左下の大きな文字(OPERATING MODE)に体が重ならないよう、注視点を体の左下に置いて体を画面の右上寄りに映す
// (確かめ: node tools/check/crab_frame.mjs)
export const SHOTS = {
  walk: { pos: [2.3, 2.3, 7.9], target: [0.25, -0.45, 0.2], fov: 30, follow: 0.8 },   // 追いきらず、右から入ってくるのを見せる
  eyes: { pos: [1.3, 2.0, 6.9], target: [-0.05, -0.15, 0.4], fov: 28, follow: 1 },
  display: { pos: [-1.3, 0.75, 8.1], target: [-0.5, -0.02, 0.5], fov: 30, follow: 1 },   // 低い前から(立ち上がったはさみ)
  grab: { pos: [3.8, 1.7, 5.6], target: [0.3, -0.4, 0.6], fov: 30, follow: 1 },      // 左前から(左のはさみと口)
  open: { pos: [0.8, 5.0, 5.8], target: [-0.3, -0.25, -0.2], fov: 30, follow: 1 },      // 前の上から(中の機械)
  bubbles: { pos: [-2.4, 1.1, 6.8], target: [-0.6, -0.1, 0.5], fov: 30, follow: 1 },
  out: { pos: [1.4, 2.4, 8.4], target: [-0.6, -0.4, 0], fov: 30, follow: 0.6 },       // 少しだけ追い、左へ出ていく
};
