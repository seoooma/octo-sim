import * as THREE from 'three';
import { DURATION, pulseInfoAt } from './timeline.js';
import { bodyPoseAt, swimSpeedAt } from './swim.js';
import { plateAngleAt, REST } from './bell.js';
import { lumenLevel } from './lumen.js';
import { COUNT, NODES, NET_RINGS } from './tentacles.js';
import { deg, clamp } from '../../util.js';

// クラゲの計器の数字(時刻と状態から。作りものだが動きと合わせる)
const HINGE_R = 0.469, ARM = 1.249, ARM_ANGLE = 1.04;   // 蝶番から縁までの長さと向き(bell.js の寸法から)
const RIM_REST = HINGE_R + ARM * Math.cos(ARM_ANGLE);

// 傘の開き(%)。縁の半径から: ふだん 100%、強く閉じると約 80%、大きく開くと約 155%
export function apertureAt(t) {
  let a = 0;
  for (const k of [0, 4, 8, 12]) a += plateAngleAt(t, k) / 4;
  return (100 * (HINGE_R + ARM * Math.cos(a - REST - ARM_ANGLE))) / RIM_REST;
}

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const up = new THREE.Vector3();

export function telemetry(s, model) {
  const t = s.t;
  const sw = swimSpeedAt(t);
  bodyPoseAt(t, pos, quat);
  up.set(0, 1, 0).applyQuaternion(quat);
  const pitch = deg(Math.atan2(up.z, up.y));
  const roll = deg(Math.atan2(-up.x, up.y));
  const pulse = pulseInfoAt(t);
  const tent = model.tentacles;
  const glowing = s.lumen > 0.3;
  const state = s.net > 0.5 ? 'NET' : glowing ? 'GLOWING' : sw.vy < -0.5 ? 'STREAMING' : sw.speed > 0.35 ? 'TRAILING' : 'HANGING';
  const groups = Array.from({ length: 8 }, (_, g) => {
    const spread = (tent.spread[g * 2] + tent.spread[g * 2 + 1]) / 2;
    // 光: 触手の帯(先へ流れる波)を長さにそって平均する
    let sum = 0;
    for (let j = 0; j < 5; j++) sum += lumenLevel(t, 1.15 + j * 0.2, (g * 2 + 0.5) / COUNT, s.lumen, 1, s.flash, 2);
    const glow = clamp(sum / 5 / 0.8);
    const value = glowing ? glow : spread;
    return { name: `T${g + 1}`, value, text: `${Math.round(value * 100)}%`, hot: glowing ? glow > 0.6 : s.net > 0.5 };
  });
  const strands = COUNT * NET_RINGS.length;
  return {
    aperture: apertureAt(t),
    thrust: s.thrust * 40,
    pulseHz: pulse.hz,
    strokes: pulse.count,
    load: clamp(0.08 + 0.55 * Math.min(1.3, s.thrust) + 0.15 * s.open + 0.1 * s.lumen, 0, 1),
    battery: 84 - (t / DURATION) * 5,
    draw: 6.8 + 26 * Math.min(1, s.thrust) + 9 * s.open + 6 * s.lumen,
    motor: 20 + (t / DURATION) * 6,
    depth: 22.6 - pos.y * 0.25 + 0.03 * Math.sin(t * 0.31),
    vs: sw.vy * 0.25,
    speed: sw.speed * 0.25,
    pitch,
    roll,
    buoy: sw.vy > 0.12 ? 'RISING' : sw.vy < -0.04 ? 'SINKING' : 'NEUTRAL',
    state,
    groups,
    netBuilt: tent.netBuilt,
    strands,
    subsystems: [
      { name: 'BELL PLATES', sub: '16 PLATES · IRIS HINGE', status: s.open > 0.05 ? 'OPEN' : s.contraction > 0.25 ? 'STROKE' : 'GLIDE', tone: s.open > 0.05 ? 'orange' : 'green' },
      { name: 'PUMP RING', sub: '16 ACTUATORS · 1 BAR', status: s.thrust > 0.25 ? 'PUMPING' : 'IDLE', tone: s.thrust > 0.25 ? 'green' : 'gray' },
      { name: 'GYRO CORE', sub: '3-AXIS GIMBAL', status: s.open > 0.05 ? 'EXPOSED' : 'STABLE', tone: s.open > 0.05 ? 'orange' : 'green' },
      { name: 'RIM SENSORS', sub: '16 PHOTOPHORES · APICAL EYE', status: s.flash > 0.15 ? 'ALERT' : s.lumen > 0.05 ? 'EMITTING' : 'SENSING', tone: s.flash > 0.15 || s.lumen > 0.05 ? 'orange' : 'green' },
      { name: 'TENTACLES', sub: `16 × ${NODES} LINKS · ${strands} STRANDS`, status: s.net > 0.05 ? `NET ${tent.netBuilt}/${strands}` : '16 / 16 LIVE', tone: s.net > 0.05 ? 'orange' : 'green' },
      { name: 'ORAL ARMS', sub: '4 × 16 LINKS · FRILLED', status: s.oral > 0.05 ? 'UNFURLED' : 'FURLED', tone: s.oral > 0.05 ? 'orange' : 'green' },
    ],
  };
}
