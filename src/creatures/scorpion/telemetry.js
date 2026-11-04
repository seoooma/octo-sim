import * as THREE from 'three';
import { DURATION } from './timeline.js';
import { LEGS, FLOOR_Y, T, TAIL_LAG } from './layout.js';
import { travelAt, bodyPoseAt, legPhase, activityAt, GAIT, STRIDE } from './path.js';
import { tailAt, stingGlowAt } from './tail.js';
import { deg, clamp } from '../../util.js';

// サソリの計器の数字(時刻と状態から。作りものだが動きと合わせる)。1 単位 = 25 cm とする
const M = 0.25;
const ORDER = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
const IDX = ORDER.map((n) => LEGS.findIndex((L) => L.name === n));
const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q = new THREE.Quaternion(), fwd = new THREE.Vector3(), side = new THREE.Vector3();
const tailNow = { yaw: 0, a: new Array(6).fill(0) }, tailPrev = { yaw: 0, a: new Array(6).fill(0) };

// 脚 i の時刻 t の様子: 'down'(足を置いている)・'swing'(運んでいる)
export function legStateAt(i, t) {
  return legPhase(travelAt(t, {}).surface, i, t).stance ? 'down' : 'swing';
}
export { IDX as LEG_IDX, ORDER as LEG_ORDER };

const strikesDone = (t) => (t >= T.strike1 + 5 * TAIL_LAG ? 1 : 0) + (t >= T.strike2 + 5 * TAIL_LAG ? 1 : 0);

// 尾の様子(帯の札と SUBSYSTEMS)
function tailState(t) {
  if (t > T.sting0 && t < T.sting1) return 'STRIKE';
  if (t > T.turn1 && t < T.depart0 + 1.5) return 'HOLD';
  if (t > 9.6 && t < T.uv0 + 1.0) return 'ARCHED';
  if (t > 5.4 && t < T.turn1) return 'RAISED';
  if (t > 5.4 && t < 9.6) return 'RAISED';
  return 'LOW';
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
  const stepHz = (GAIT.floor.gAt(t + 0.05) - GAIT.floor.gAt(t - 0.05)) / 0.1 / STRIDE.floor;
  const states = IDX.map((i) => legStateAt(i, t));
  const down = states.filter((x) => x === 'down').length;
  const walking = activityAt('floor', t) > 0.15;
  // 尾の関節の角度と、速さ(刺すときに先が速く動く)
  tailAt(t, tailNow);
  tailAt(t - 0.03, tailPrev);
  const ts = tailState(t);
  const strikes = strikesDone(t);
  const glow = stingGlowAt(t);
  const tailRows = [
    { name: 'SW', value: Math.abs(tailNow.yaw) / 0.4, text: `${tailNow.yaw >= 0 ? '+' : ''}${deg(tailNow.yaw).toFixed(0)}°`, hot: false },
    ...tailNow.a.map((a, k) => {
      const w = Math.abs(a - tailPrev.a[k]) / 0.03;
      return { name: k < 5 ? `T${k + 1}` : 'TEL', value: Math.abs(a) / (k === 0 ? 1.6 : 1.3), text: `${a >= 0 ? '+' : ''}${deg(a).toFixed(0)}°`, hot: w > 4 };
    }),
    { name: 'VEN', value: s.venom, text: `${Math.round(s.venom * 100)}%`, hot: glow > 0.3 },
  ];
  const gripping = t > T.close && t < T.end;
  const busy = Math.max(s.uv * 0.5, s.alert * 0.4, glow, Math.min(1, stepHz / 3.5));
  return {
    load: clamp(s.venom, 0, 1),
    battery: 88 - (t / DURATION) * 6,
    draw: 8.1 + 21 * busy,
    motor: 25 + (t / DURATION) * 9,
    gait: walking ? 'TETRAPOD' : 'STANCE',
    stepHz,
    down,
    speed,
    height: (p0.y - FLOOR_Y) * M,
    pitch,
    roll,
    tailState: ts,
    tailRows,
    strikes,
    states,
    subsystems: [
      { name: 'OPTIC ARRAY', sub: '2 MEDIAN · 6 LATERAL', status: s.alert > 0.5 ? 'LOCKED' : 'TRACKING', tone: 'green' },
      { name: 'LEG DRIVES', sub: '8 × 3 JOINTS · HYDRAULIC', status: walking ? 'STEPPING' : 'HOLDING', tone: 'green' },
      { name: 'CHELAE', sub: '2 PINCERS · SERVO', status: gripping ? 'GRIP 18 N' : s.act.key === 'threat' ? 'DISPLAY' : 'READY', tone: gripping || s.act.key === 'threat' ? 'orange' : 'green' },
      { name: 'METASOMA', sub: '5 HINGES + SWIVEL', status: ts, tone: ts === 'STRIKE' ? 'orange' : ts === 'LOW' ? 'gray' : 'green' },
      { name: 'VENOM SAC', sub: `TELSON · ${strikes} / 2 STRIKES`, status: `${Math.round(s.venom * 100)}%`, tone: glow > 0.2 ? 'orange' : 'green' },
      { name: 'UV EMITTER', sub: '365 NM · CUTICLE SCAN', status: s.uv > 0.05 ? 'ACTIVE' : 'STANDBY', tone: s.uv > 0.05 ? 'orange' : 'gray' },
    ],
  };
}
