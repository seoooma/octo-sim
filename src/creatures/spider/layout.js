import { FLOOR_Y } from '../../stage.js';

// 蜘蛛の舞台の寸法(世界の座標。y が上、手前が +z)
// 巣を張る輪(縦に立つ金属の輪)。巣の面は z = WEB.z
export const WEB = { cx: 0, cy: 2.0, z: -1.5, R: 3.8 };
export const RADIAL_COUNT = 12;
// 縦糸の向き(0 番は真上 = 登ってきた糸)
export const radialAngle = (k) => Math.PI / 2 + (k * 2 * Math.PI) / RADIAL_COUNT;
// 横糸(粘る渦巻き)。縦糸の上に頂点を置く多角形。6 番の縦糸(真下)から始めて、外へ回る
export const SPIRAL = { r0: 0.9, r1: 3.45, turns: 2.75, start: 6 };

export { FLOOR_Y };
export const RIDE = 0.42;      // 床の上での体の高さ(頭胸部の中心)
export const RIDE_W = 0.36;    // 巣の上での体と巣の面のすき間
export const STOP = { x: 0, z: WEB.z + 2.3 };   // 床を歩いて止まる場所(輪の手前)

// 脚の名前と並び(体の左 +x が L、右 -x が R。前から後ろへ)
export const LEG_NAMES = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
// 脚の付け根と、ふだん足を置く場所(体の座標: 頭が +z、背中が +y)。a は前(+z)から横へ測った角度
const REST_ANGLE = [0.66, 1.31, 1.95, 2.58];
const REST_DIST = [1.72, 1.62, 1.58, 1.78];
const HIP_ANGLE = [0.55, 1.1, 1.7, 2.25];
export const LEGS = LEG_NAMES.map((name, i) => {
  const side = name[0] === 'L' ? 1 : -1;
  const j = i % 4;
  return {
    name,
    side,
    j,
    hip: [side * 0.34 * Math.sin(HIP_ANGLE[j]), -0.06, 0.22 + 0.36 * Math.cos(HIP_ANGLE[j])],
    rest: [side * REST_DIST[j] * Math.sin(REST_ANGLE[j]), REST_DIST[j] * Math.cos(REST_ANGLE[j])],   // 面の上の (x, z)
    // 歩く脚の組(交互の 4 本ずつ)と、前から後ろへ少しずつ遅らせる
    offset: ((j % 2 === 0) === (side > 0) ? 0 : 0.5) + 0.07 * j,
  };
});
export const SEG = [0.82, 0.86, 0.62];   // 腿・脛・先(ふ節)の長さ
