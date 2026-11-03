import { WEB } from './layout.js';

// 蜘蛛のカメラの構図(操作ごと。director.js)。follow 1 は体からの相対、0 は世界に固定
const W = [WEB.cx, WEB.cy, WEB.z];
export const SHOTS = {
  walk: { pos: [1.4, 2.4, 8.2], target: [-0.8, -0.1, 0], fov: 30, follow: 1 },
  turn: { pos: [0.9, 0.9, 4.4], target: [0, -0.05, 0.3], fov: 28, follow: 1 },
  spin: { pos: [-6.4, 2.2, 1.6], target: [0, 0.0, -0.5], fov: 30, follow: 1 },   // 左の前から(輪の台が手前に来ない)
  climb: { pos: [4.8, 1.4, 14.5], target: [0, 0.9, -1.0], fov: 30, follow: 0 },
  radial: { pos: [0.4, W[1] + 0.4, 18.5], target: W, fov: 30, follow: 0 },
  spiral: { pos: [-4.6, W[1] + 1.6, 17.0], target: W, fov: 30, follow: 0 },
  home: { pos: [3.2, W[1] + 0.6, 15.5], target: [0, W[1] - 0.2, W[2]], fov: 30, follow: 0 },
};
