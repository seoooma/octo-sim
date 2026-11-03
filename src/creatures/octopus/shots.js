// タコのカメラの構図(操作ごと。director.js)
export const SHOTS = {
  inbound: { pos: [-0.8, 0.9, 13.2], target: [0.2, -0.5, 0], fov: 30, follow: 0.7 },   // 追いきらず、右下の手前から入ってくるのを見せる
  hold: { pos: [0, 2.6, 12.4], target: [0, -0.45, 0], fov: 30, follow: 1 },
  mantle: { pos: [0.9, 5.4, 8.8], target: [0, 0.1, 0], fov: 30, follow: 1 },
  arm: { pos: [-3.6, 3.4, 15.0], target: [-2.4, 0.1, 0.9], fov: 30, follow: 1 },
  optics: { pos: [2.7, 0.8, 8.0], target: [0.1, -0.25, 0.5], fov: 28, follow: 1 },
  beak: { pos: [0.3, -4.6, 13.4], target: [0, -0.9, 0], fov: 30, follow: 1 },
  siphon: { pos: [-8.0, -2.0, -6.4], target: [0, -1.0, -0.5], fov: 30, follow: 1 },
  depart: { pos: [-0.8, 1.0, 9.2], target: [0.6, 0, 0], fov: 30, follow: 0.15 },   // ほとんど追わず、画面の外へ出ていく
};
