import * as THREE from 'three';
import { keys } from '../../core/timeline.js';
import { segment, solve2, place, rivets } from '../../core/limbs.js';
import { CLAWS } from './layout.js';

// はさみ(左右 2 本)。付け根 → 腕(長節)→ 手首(腕節)→ 手のひら(掌節)+ 動く指(指節)と動かない指。
// 動きは「つまむ点 P と手の向き D(体の座標)」の台本で決め、手首の位置 = P − D × reach、付け根〜手首を 2 本の骨の IK で解く。
// 骨の長さは変えない(届かない所は手首を付け根へ寄せる)。指は蝶番の回転だけ

// ---- 台本(体の座標。x は外向きを正 = 左右の鏡写し)。[P(3), D(3), 手のひねり, 肘の向きの高さ]
const REST_R = [0.24, -0.2, 1.5, -0.5, -0.12, 0.85, 0, -0.2];
const DISP_R = [1.0, 0.8, 1.25, 0.3, 0.55, 0.75, 0.15, -0.7];
const DISP_R2 = [1.08, 0.9, 1.12, 0.42, 0.62, 0.66, 0.25, -0.75];
const GUARD_R = [0.42, 0.04, 1.62, -0.28, 0.16, 0.94, 0, -0.3];
const REST_L = [0.22, -0.15, 1.36, -0.5, -0.1, 0.85, 0, -0.2];
const DISP_L = [0.95, 0.74, 1.1, 0.35, 0.6, 0.7, 0.15, -0.7];
const DISP_L2 = [1.02, 0.84, 0.98, 0.45, 0.66, 0.6, 0.25, -0.75];
const PREP_L = [0.62, -0.06, 1.56, 0.1, -0.5, 0.85, 0, -0.1];
const REACH_L = [0.62, -0.3, 1.62, 0.12, -0.75, 0.65, 0, -0.1];
const LIFT_L = [0.52, 0.06, 1.38, -0.2, -0.1, 0.97, 0, -0.2];
const MOUTH_L = [0.03, -0.12, 0.9, -0.92, 0.05, -0.38, 0, -0.3];

const POSE = {
  R: [[0, REST_R], [8.9, REST_R], [9.7, DISP_R], [10.45, DISP_R2], [11.2, DISP_R], [11.9, DISP_R], [12.5, REST_R], [12.9, REST_R], [13.4, GUARD_R], [16.6, GUARD_R], [17.2, REST_R]],
  L: [[0, REST_L], [9.1, REST_L], [9.9, DISP_L], [10.7, DISP_L2], [11.45, DISP_L], [12.1, DISP_L], [12.7, REST_L], [13.1, PREP_L], [13.6, REACH_L], [14.15, REACH_L], [14.7, LIFT_L], [15.35, MOUTH_L], [16.3, MOUTH_L], [16.9, REST_L]],
};
// 指の開き(0 閉じる〜1 開く)。'in' は閉じるときだんだん速く(ぱちんと閉じる)。HOLD は拾った物をはさんでいるとき
const HOLD = 0.4;
const OPEN = {
  R: [[0, 0.08], [9.0, 0.08], [9.5, 1], [10.0, 1], [10.2, 0.04, 'in'], [10.55, 0.9], [10.95, 0.9], [11.12, 0.04, 'in'], [11.5, 0.7], [12.0, 0.25], [12.5, 0.08], [13.2, 0.08], [13.6, 0.35], [16.5, 0.35], [17.0, 0.08]],
  L: [[0, 0.08], [9.2, 0.08], [9.7, 1], [10.3, 1], [10.47, 0.04, 'in'], [10.8, 0.85], [11.3, 0.85], [11.45, 0.04, 'in'], [11.85, 0.5], [12.6, 0.12], [13.0, 0.2], [13.35, 1], [13.8, 1], [14.05, HOLD, 'in'], [15.45, HOLD], [15.7, 0.75], [16.3, 0.75], [16.75, 0.08]],
};
export const openAt = (name, t) => keys(t, OPEN[name]) + 0.03 * Math.sin(t * 2.3 + (name === 'R' ? 0 : 1.7));
// 拾う物につまむ点を合わせる重み(1 のあいだは床の物の位置へ)
export const grabLockAt = (t) => keys(t, [[13.15, 0], [13.6, 1], [14.15, 1], [14.6, 0]]);
// 拾った物: 'floor'(床の上)・'held'(はさみの中)・'eat'(口へ入る、u)・'gone'
export const GRAB = { pinch: 14.05, release: 15.7, eaten: 16.2 };
export const DACTYL_MAX = 0.85;   // 動く指の開く角度(ラジアン)

// 時刻 t のはさみ name の台本の値(体の座標)を target に書く
export function clawTargetAt(name, t, target) {
  const c = CLAWS[name];
  const k = keys(t, POSE[name]);
  const s = c.side;
  // ふだんの小さな揺れ(生き物らしく)
  const w = 0.012;
  target.P.set(s * (k[0] + w * Math.sin(t * 1.3 + s)), k[1] + w * Math.sin(t * 1.7 + 2 * s), k[2] + w * Math.sin(t * 1.1));
  target.D.set(s * k[3], k[4], k[5]).normalize();
  target.roll = s * k[6];
  target.poleY = k[7];
  target.open = openAt(name, t);
  return target;
}

// 指の形: (a 指の向き, b 指の高さ) の面を、幅 w に押し出す。lower なら下の指(b を裏返す)
function fingerGeometry(L, h0, w, lower) {
  const sg = lower ? -1 : 1;
  const s = new THREE.Shape();
  s.moveTo(0, -0.004 * sg);
  s.lineTo(L * 0.55, -0.004 * sg);
  s.quadraticCurveTo(L * 0.9, -0.002 * sg, L, -0.04 * sg * (L / 0.42));
  s.quadraticCurveTo(L * 0.78, h0 * 1.05 * sg, L * 0.08, h0 * sg);
  s.lineTo(0, h0 * 0.9 * sg);
  s.closePath();
  const bevel = Math.min(0.014, w * 0.12);
  const g = new THREE.ExtrudeGeometry(s, { depth: w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -(w - 2 * bevel) / 2);
  g.rotateY(-Math.PI / 2);   // 面の a → +z(指の向き)、b → +y、押し出し → x
  return g;
}

// 手のひらの殻(+z へ len の長さ、半径 R × prof(f)、f は 0〜1)。両端は半径 round で丸めて閉じる
function palmGeometry(len, R, prof, round, n = 28) {
  const pts = [new THREE.Vector2(1e-4, 0)];
  for (let i = 0; i <= n; i++) {
    const f = i / n, z = f * len;
    const e = Math.min(z, len - z);
    const cap = e < round ? Math.sqrt(Math.max(0, 1 - (1 - e / round) ** 2)) : 1;
    pts.push(new THREE.Vector2(Math.max(1e-4, R * prof(f) * (0.35 + 0.65 * cap)), z));
  }
  pts.push(new THREE.Vector2(1e-4, len));
  const g = new THREE.LatheGeometry(pts, 32);
  g.rotateX(Math.PI / 2);   // 回す軸 y → +z
  return g;
}

// 歯(指の内側に並ぶ。砕くはさみは丸い臼歯、切るはさみは尖った歯)
function teeth(m, L, w, lower, crusher) {
  const g = new THREE.Group();
  const sg = lower ? -1 : 1;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.012, L * 0.62), m.darkMetal);
  edge.position.set(0, -0.002 * sg, L * 0.42);
  g.add(edge);
  const n = crusher ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const z = L * (0.2 + (0.5 * i) / (n - 1));
    const tooth = crusher
      ? new THREE.Mesh(new THREE.SphereGeometry(0.022 + 0.008 * (n - i) / n, 10, 6), m.darkMetal)
      : new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 6), m.darkMetal);
    tooth.position.set(0, -0.012 * sg, z);
    if (!crusher) tooth.rotation.x = lower ? 0 : Math.PI;
    g.add(tooth);
  }
  return g;
}

// はさみを 1 本作る。group に足す(はさみの部品はどれも group の座標で置く)
export function buildClaw(m, group, name) {
  const c = CLAWS[name];
  const crusher = name === 'R';
  const [pw, ph, pl] = c.palm;
  const [fl, fh, fw] = c.finger;
  const k = pl / 0.56;

  // 付け根(暗い玉と白い輪)・腕・手首
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.1 * Math.sqrt(k), 20, 12), m.darkMetal);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1 * Math.sqrt(k), 0.024, 8, 24), m.shell);
  ring.rotation.y = Math.PI / 2;
  shoulder.add(ring);
  const merus = segment(m, c.arm[0], { shell: c.armShell, joint: 0.085 * Math.sqrt(k), piston: true, band: true });
  const carpus = segment(m, c.arm[1], { shell: [c.armShell[1] * 0.95, c.armShell[1] * 0.85], joint: 0.078 * Math.sqrt(k) });
  group.add(shoulder, merus, carpus);

  // 手(+z が指の向き、+y が動く指の側)
  const hand = new THREE.Group();
  group.add(hand);
  const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.075 * Math.sqrt(k), 16, 10), m.darkMetal);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(ph * 0.3, 0.022 * Math.sqrt(k), 8, 24), m.orange);
  collar.scale.x = pw / ph;
  collar.position.z = 0.06 * k;
  // 手のひら: ふくらんだ殻の 2 枚(後ろの大きな板・前の細る板)、あいだに暗い継ぎ目。横は薄い(カニのはさみ)
  const R = ph / 2, sx = pw / ph;
  const rearL = pl * 0.58, frontL = pl * 0.33, z0 = 0.075 * k, gap = 0.016;
  const core = new THREE.Mesh(palmGeometry(rearL + frontL + gap, R * 0.9, (f) => 0.72 + 0.22 * Math.sin(Math.PI * Math.min(1, f * 1.4)), 0.02), m.darkMetal);
  core.scale.x = sx;
  core.position.z = z0;
  const rear = new THREE.Mesh(palmGeometry(rearL, R, (f) => 0.66 + 0.34 * Math.sin((Math.PI / 2) * Math.min(1, f / 0.75)), 0.035 * k), m.shell);
  rear.scale.x = sx;
  rear.position.z = z0;
  const front = new THREE.Mesh(palmGeometry(frontL, R, (f) => 0.97 - 0.27 * f * f, 0.025 * k), m.shell);
  front.scale.x = sx;
  front.position.z = z0 + rearL + gap;
  hand.add(wrist, collar, core, rear, front);
  // 背の小さなこぶの列(手のひらの上)とリベット(両わき)
  const rv = [];
  for (const s of [-1, 1]) for (const fz of [0.3, 0.55, 0.8]) rv.push(new THREE.Vector3(s * pw * 0.47, R * 0.2, z0 + rearL * fz));
  hand.add(rivets(rv, m, 0.01 * Math.sqrt(k)));
  const knobs = [];
  for (let i = 0; i < 4; i++) knobs.push(new THREE.Vector3(0, R * (0.97 - 0.02 * i), z0 + rearL * (0.35 + 0.17 * i)));
  hand.add(rivets(knobs, m, 0.017 * Math.sqrt(k)));
  const handEnd = z0 + rearL + gap + frontL - 0.012;

  // 動かない指(下)と動く指(上、蝶番で開く)
  const pollex = new THREE.Mesh(fingerGeometry(fl, fh, fw, true), m.shell);
  pollex.position.set(0, -0.005, handEnd);
  pollex.add(teeth(m, fl, fw, true, crusher));
  const dactyl = new THREE.Group();
  dactyl.position.set(0, 0.005, handEnd);
  dactyl.add(new THREE.Mesh(fingerGeometry(fl, fh, fw, false), m.shell));
  dactyl.add(teeth(m, fl, fw, false, crusher));
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(fh * 0.42, fh * 0.42, pw * 0.98, 18), m.darkMetal);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, 0.005 + fh * 0.4, handEnd - 0.005);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(fh * 0.26, fh * 0.26, 0.012, 16), m.orange);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(sx * pw * 0.5, hinge.position.y, hinge.position.z);
    hand.add(cap);
  }
  hand.add(pollex, dactyl, hinge);
  // 動く指は蝶番の軸(指の付け根の上寄り)のまわりに回す
  dactyl.position.y = hinge.position.y;
  dactyl.children.forEach((ch) => (ch.position.y = 0.005 - hinge.position.y));

  // つまむ点(手の座標): 指の先寄り、開いたすき間の真ん中
  const pinchLocal = new THREE.Vector3(0, 0.02 * k, handEnd + fl * 0.62);
  // 引き出し線の付け根
  const anchors = {
    palm: new THREE.Object3D(),
    dactyl: new THREE.Object3D(),
    carpus: new THREE.Object3D(),
  };
  anchors.palm.position.set(pw * 0.5, ph * 0.3, z0 + rearL * 0.5);
  hand.add(anchors.palm);
  anchors.dactyl.position.set(0, fh * 0.9, fl * 0.5);
  dactyl.add(anchors.dactyl);
  anchors.carpus.position.set(0, c.arm[1] * 0.5, 0);
  carpus.add(anchors.carpus);

  return {
    name, c, shoulder, merus, carpus, hand, dactyl, pinchLocal, anchors,
    reach: handEnd + fl * 0.62,
    H: new THREE.Vector3(), E: new THREE.Vector3(), W: new THREE.Vector3(),
  };
}

const vP = new THREE.Vector3(), vD = new THREE.Vector3(), vUp = new THREE.Vector3(), vPole = new THREE.Vector3();
const vX = new THREE.Vector3(), vY = new THREE.Vector3(), vN = new THREE.Vector3(), vA = new THREE.Vector3(), vB = new THREE.Vector3();
const mB = new THREE.Matrix4();

// はさみを置く。pos・quat: 体の位置と向き(group の座標)、target: clawTargetAt の値(体の座標)
export function poseClaw(claw, pos, quat, target) {
  const { c } = claw;
  const [l1, l2] = c.arm;
  claw.H.fromArray(c.shoulder).applyQuaternion(quat).add(pos);
  vP.copy(target.P).applyQuaternion(quat).add(pos);
  vD.copy(target.D).applyQuaternion(quat);
  // 手首 = つまむ点から手の長さぶん戻った所。届く範囲に収める(骨は伸ばさない)
  claw.W.copy(vP).addScaledVector(vD, -claw.reach);
  vA.subVectors(claw.W, claw.H);
  const d = vA.length();
  const dc = Math.min(l1 + l2 - 0.02, Math.max(Math.abs(l1 - l2) + 0.03, d));
  if (dc !== d) claw.W.copy(claw.H).addScaledVector(vA, dc / d);
  // 肘は外へ(高さは台本)
  vPole.set(c.side, target.poleY, 0.15).normalize().applyQuaternion(quat);
  solve2(claw.H, claw.W, l1, l2, vPole, claw.E);
  vA.subVectors(claw.E, claw.H);
  vB.subVectors(claw.W, claw.E);
  vN.crossVectors(vA, vB);
  if (vN.lengthSq() < 1e-8) vN.crossVectors(vA, vPole);
  vN.normalize();
  claw.shoulder.position.copy(claw.H);
  claw.shoulder.quaternion.copy(quat);
  place(claw.merus, claw.H, claw.E, vN);
  place(claw.carpus, claw.E, claw.W, vN);
  // 手: +z = D、+y = 体の上を D に直交させてひねる
  vUp.set(0, 1, 0).applyQuaternion(quat);
  vY.copy(vUp).addScaledVector(vD, -vUp.dot(vD));
  if (vY.lengthSq() < 1e-6) vY.set(0, 0, 1).applyQuaternion(quat).addScaledVector(vD, -0.5);
  vY.normalize();
  if (target.roll) vY.applyAxisAngle(vD, target.roll);
  vX.crossVectors(vY, vD);
  claw.hand.position.copy(claw.W);
  claw.hand.quaternion.setFromRotationMatrix(mB.makeBasis(vX, vY, vD));
  claw.dactyl.rotation.x = -DACTYL_MAX * Math.max(0, target.open);
}
