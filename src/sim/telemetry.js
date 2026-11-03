import * as THREE from 'three';
import { jetAt, posAt, rotAt, DURATION } from './timeline.js';
import { deg, clamp } from '../util.js';

// 計器の数字。これも時刻 t と状態だけで決める(作りものの数字だが、動きとつじつまを合わせる)
const PULSE_HZ = 1.8;
const CURL_ORDER = ['R1', 'R2', 'R3', 'R4', 'L1', 'L2', 'L3', 'L4'];   // ARM CURL の並び

// 外套の中の圧力(kPa)。噴射のときは 1.8Hz で脈打つ
export function pressureAt(t) {
  const j = jetAt(t);
  return 19 + 1.6 * Math.sin(t * 0.7) + j * (36 + 34 * Math.sin(2 * Math.PI * PULSE_HZ * t));
}

const up = new THREE.Vector3();
const euler = new THREE.Euler();

function upAt(t, out) {
  const r = rotAt(t);
  euler.set(r[0], r[1], r[2]);
  return out.set(0, 1, 0).applyEuler(euler);
}

// arms: 腕(曲がり具合と、輪・車輪の数)
export function telemetry(s, arms) {
  const curls = arms.curls;
  const t = s.t;
  const j = s.jet;
  const wave = 0.5 + 0.5 * Math.sin(2 * Math.PI * PULSE_HZ * t);
  const p0 = posAt(t - 0.05);
  const p1 = posAt(t + 0.05);
  const speed = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) * 10 * 1.15 + 0.01 * (1 + Math.sin(t * 1.3));
  upAt(t, up);
  const tilt = deg(Math.acos(clamp(up.y, -1, 1)));
  // 泳いでいるとき(腕がなびく)は頭を前へ倒した向きなので負、腹を見せるときは正
  const pitch = (s.pose.trail > 0.3 ? -tilt : tilt) + 0.6 * Math.sin(t * 0.9);
  const roll = deg(s.rot[1]) * 0.35 + 0.4 * Math.sin(t * 0.6 + 1);
  const depth = 12.4 - s.pos[1] * 0.12 + 0.04 * Math.sin(t * 0.31);
  const vs = (p1[1] - p0[1]) * 10 * 0.12 + 0.05 * Math.cos(t * 0.31);
  const busy = Math.max(s.mantleOpen, s.armApart, s.beakOpen, s.siphonOpen, s.pose.star * 0.6, s.opticsScan * 0.4);
  const curlState = s.armApart > 0.5 ? 'DETACHED' : s.pose.trail > 0.5 ? 'TRAILING' : 'CURLING';
  return {
    pressure: pressureAt(t),
    thrust: 6 + j * (62 + 48 * wave),
    jetLoad: clamp(0.12 + j * (0.4 + 0.08 * wave) + s.siphonOpen * 0.02, 0, 1),
    pulseHz: j > 0.05 ? PULSE_HZ : 0,
    siphon: j > 0.05 ? 'FIRING' : 'IDLE',
    battery: 87 - (t / DURATION) * 5,
    draw: 9.4 + 14 * busy + 21 * j,
    cell: 3.72,
    motor: 22 + (t / DURATION) * 7,
    depth,
    vs,
    pitch,
    roll,
    hold: speed < 0.12 ? 'STATION' : 'OFF',
    speed,
    curlState,
    curls: CURL_ORDER.map((n) => ({ name: n, value: curls[n], detached: n === 'R2' && s.armApart > 0.5 })),
    subsystems: [
      { name: 'OPTIC ARRAY', sub: '2 × 52 MM LENS · IR RIM', status: s.opticsScan > 0.3 ? 'SCANNING' : 'TRACKING', tone: 'green' },
      { name: 'MANTLE SHELL', sub: '8 PETALS · GLASS PORT', status: s.mantleOpen > 0.05 ? 'OPEN' : 'SEALED', tone: s.mantleOpen > 0.05 ? 'orange' : 'green' },
      { name: 'PUMP CORE', sub: 'REACTOR RING · 7 PISTONS', status: s.mantleOpen > 0.05 ? 'EXPOSED' : j > 0.05 ? 'PULSING' : 'RUNNING', tone: s.mantleOpen > 0.05 ? 'orange' : 'green' },
      { name: 'ARM CHAINS', sub: `${arms.linkCount} LINKS · ${arms.wheelCount} WHEELS`, status: s.armApart > 0.5 ? 'DETACHED' : '8 / 8 LIVE', tone: s.armApart > 0.5 ? 'orange' : 'green' },
      { name: 'SIPHON', sub: '3 SLEEVES · 6-FLAP NOZZLE', status: j > 0.05 ? 'FIRING' : s.siphonOpen > 0.05 ? 'PRIMED' : 'IDLE', tone: j > 0.05 ? 'green' : s.siphonOpen > 0.05 ? 'orange' : 'gray' },
      { name: 'BEAK', sub: 'TWIN JAW · RADULA RING', status: s.beakOpen > 0.05 ? 'OPEN' : 'SEALED', tone: s.beakOpen > 0.05 ? 'orange' : 'green' },
    ],
  };
}
