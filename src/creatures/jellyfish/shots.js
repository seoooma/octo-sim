// クラゲのカメラの構図(操作ごと。director.js)。follow 1 は傘からの相対、0 は世界に固定。
// 触手が長いので、体を少し右へ寄せて、左下の大きな文字(OPERATING MODE)と計器のパネルにかからないようにする
export const SHOTS = {
  drift: { pos: [1.0, 1.8, 15.0], target: [-0.4, 0.3, 0], fov: 30, follow: 0.6 },   // 追いきらず、上から沈んで入ってくるのを見せる
  pulse: { pos: [2.4, 2.0, 13.2], target: [-0.6, -1.0, 0], fov: 30, follow: 1 },
  net: { pos: [1.0, 7.6, 9.8], target: [-0.5, -1.5, 0], fov: 30, follow: 1 },
  oral: { pos: [-4.2, -2.6, 10.6], target: [-0.5, -0.95, 0], fov: 30, follow: 1 },   // 下の左から見上げて、広げた口腕を見せる
  lumen: { pos: [0.2, 4.4, 10.6], target: [-0.45, -0.7, 0], fov: 30, follow: 1 },
  open: { pos: [1.5, 6.6, 9.6], target: [-0.4, -0.25, 0], fov: 30, follow: 1 },   // 開いた板と触手が計器にかからない遠さ
  recoil: { pos: [-2.9, 1.0, 13.8], target: [-0.4, -0.6, 0], fov: 30, follow: 0.85 },
  ascend: { pos: [0.4, -0.6, 14.5], target: [-0.4, 0.6, 0], fov: 30, follow: 0.7 },   // 少し遅れて追い、最後に上へ出ていく
};
