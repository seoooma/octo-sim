import * as THREE from 'three';
import { DURATION, shellAt } from './timeline.js';
import { LEGS, FLOOR_Y, SHELL_OPEN } from './layout.js';
import { bodyPoseAt, legPhase, sideSpeedAt, GAIT, STRIDE, T, legStateAt, pitchAt, riseAt } from './path.js';
import { openAt, GRAB } from './claws.js';
import { deg, clamp } from '../../util.js';
import { keys } from '../../core/timeline.js';

// カニの計器の数字(時刻と状態から。作りものだが動きと合わせる)。1 単位 = 20 cm とする
const M = 0.2;
export const ORDER = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q = new THREE.Quaternion(), fwd = new THREE.Vector3(), side = new THREE.Vector3();

// はさみの力(0〜1): 見せるときに閉じると強く、拾った物をはさむと中くらい
const engageAt = (t) => keys(t, [[8.9, 0.1], [9.4, 1], [12.0, 1], [12.6, 0.1], [13.9, 0.1], [14.1, 0.55], [15.5, 0.55], [15.8, 0.1]]);
export function gripAt(name, t) {
  const closed = 1 - Math.min(1, openAt(name, t) / 0.6);
  const held = name === 'L' && t > GRAB.pinch && t < GRAB.release ? 0.5 : 0;
  return clamp(Math.max(held, closed * engageAt(t)) * (name === 'R' ? 1 : 0.62) + 0.03, 0, 1);
}

export function telemetry(s) {
  const t = s.t;
  bodyPoseAt(t - 0.05, p0, q);
  bodyPoseAt(t + 0.05, p1, q);
  const speed = p0.distanceTo(p1) * 10 * M;
  bodyPoseAt(t, p0, q);
  fwd.set(0, 0, 1).applyQuaternion(q);
  side.set(1, 0, 0).applyQuaternion(q);
  const pitch = deg(Math.asin(clamp(fwd.y, -1, 1)));
  const roll = deg(Math.asin(clamp(side.y, -1, 1)));
  const G = GAIT.floor;
  const stepHz = (G.gAt(t + 0.05) - G.gAt(t - 0.05)) / 0.1 / STRIDE.floor;
  const states = ORDER.map((n) => legStateAt(LEGS.findIndex((L) => L.name === n), t));
  const down = states.filter((x) => x === 'down').length;
  const lateral = sideSpeedAt(t);
  const heading = stepHz < 0.25 ? 'HOLD' : Math.abs(lateral) < 0.15 ? 'PIVOT' : lateral > 0 ? 'LATERAL L' : 'LATERAL R';
  const reared = riseAt(t) > 0.08;
  const gripR = gripAt('R', t), gripL = gripAt('L', t);
  const grip = Math.max(gripR, gripL);
  const shell = shellAt(t);
  const shellDeg = Math.round(deg(SHELL_OPEN * shell));
  const pitchNow = pitchAt(t);
  const busy = Math.max(Math.min(1, stepHz / 3), grip * 0.8, shell * 0.6, s.vent * 0.5);
  const gait = stepHz < 0.25 ? (reared ? 'REARED' : 'STANCE') : 'LATERAL';
  return {
    load: grip,
    battery: 88 - (t / DURATION) * 5,
    draw: 6.4 + 21 * busy,
    motor: 23 + (t / DURATION) * 8 + shell * 2,
    gait,
    heading,
    stepHz,
    down,
    speed,
    height: (p0.y - FLOOR_Y) * M,
    pitch,
    roll,
    gripR: gripR * 260,
    gripL: gripL * 260,
    shellDeg,
    legs: ORDER.map((name, k) => {
      const st = states[k];
      const L = LEGS.find((l) => l.name === name);
      // 足を置いている脚で体の重さを分ける。立ち上がると後ろの脚、かがむと前の脚に重さが寄る
      const lean = 1 + pitchNow * 2.2 * (L.j - 1.5) * 0.5;
      const load = st === 'down' ? clamp((0.3 + 2.4 / Math.max(4, down) * 0.45) * lean + 0.05 * Math.sin(t * 2.6 + k), 0, 1) : 0.05;
      return { name, value: load, text: st === 'down' ? `${Math.round(load * 100)}%` : 'LIFT', hot: st === 'swing' };
    }),
    subsystems: [
      { name: 'EYE STALKS', sub: '2 × PERISCOPE · SWIVEL', status: s.eyesUp < 0.05 ? 'FOLDED' : s.eyesUp < 0.95 ? 'RAISING' : s.scan > 0.3 ? 'SCANNING' : 'TRACKING', tone: s.eyesUp < 0.05 ? 'gray' : 'green' },
      { name: 'LEG DRIVES', sub: '8 × 3 JOINTS · LATERAL', status: stepHz >= 0.25 ? 'STEPPING' : reared ? 'REARED' : 'HOLDING', tone: reared ? 'orange' : 'green' },
      { name: 'CHELAE', sub: 'CRUSHER R · CUTTER L', status: t > GRAB.pinch && t < GRAB.release ? 'GRIPPING' : engageAt(t) > 0.5 ? 'DISPLAY' : 'STOWED', tone: engageAt(t) > 0.3 ? 'orange' : 'green' },
      { name: 'MOUTHPARTS', sub: '3 PAIRS · MAXILLIPED', status: s.chew > 0.3 && s.vent < 0.3 ? 'FEEDING' : s.mouth > 0.2 ? 'OPEN' : 'SEALED', tone: s.mouth > 0.2 || s.chew > 0.3 ? 'orange' : 'green' },
      { name: 'CARAPACE', sub: `REAR HINGE · ${Math.round(deg(SHELL_OPEN))}° MAX`, status: shell > 0.97 ? 'OPEN' : shell > 0.02 ? `${shellDeg}°` : 'SEALED', tone: shell > 0.02 ? 'orange' : 'green' },
      { name: 'GILL PUMP', sub: '2 VENTS · 18 FINS', status: s.vent > 0.3 ? 'PURGING' : 'CYCLING', tone: s.vent > 0.3 ? 'orange' : 'green' },
    ],
  };
}

export { legStateAt };
