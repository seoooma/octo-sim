import * as THREE from 'three';
import { DURATION } from './timeline.js';
import { LEGS, FLOOR_Y, RADIAL_COUNT } from './layout.js';
import { travelAt, bodyPoseAt, legPhase, GAIT, STRIDE, T } from './path.js';
import { silkLengthAt, radialsDoneAt, spiralLaidAt } from './web.js';
import { deg, clamp } from '../../util.js';

// 蜘蛛の計器の数字(時刻と状態から。作りものだが動きと合わせる)。1 単位 = 25 cm とする
const M = 0.25;
const ORDER = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q = new THREE.Quaternion(), fwd = new THREE.Vector3(), side = new THREE.Vector3();

// 脚 i の時刻 t の様子: 'down'(足を置いている)・'swing'(運んでいる)・'tuck'(たたんでいる)
export function legStateAt(i, t) {
  const tr = travelAt(t, {});
  if (tr.surface === 'air') return 'tuck';
  return legPhase(tr.surface, i, t).stance ? 'down' : 'swing';
}

export function telemetry(s) {
  const t = s.t;
  const tr = travelAt(t, {});
  const surf = tr.surface;
  bodyPoseAt(t - 0.05, p0, q);
  bodyPoseAt(t + 0.05, p1, q);
  const speed = p0.distanceTo(p1) * 10 * M;
  bodyPoseAt(t, p0, q);
  fwd.set(0, 0, 1).applyQuaternion(q);
  side.set(1, 0, 0).applyQuaternion(q);
  const pitch = deg(Math.asin(clamp(fwd.y, -1, 1)));
  const roll = deg(Math.asin(clamp(side.y, -1, 1)));
  const G = surf === 'air' ? null : GAIT[surf];
  const stepHz = G ? (G.gAt(t + 0.05) - G.gAt(t - 0.05)) / 0.1 / STRIDE[surf] : 0;
  const states = ORDER.map((n) => legStateAt(LEGS.findIndex((L) => L.name === n), t));
  const down = states.filter((x) => x === 'down').length;
  const silk = silkLengthAt(t) * M;
  const radials = radialsDoneAt(t);
  const laying = surf === 'web' && spiralLaidAt(t) > 0 && t < T.spiral1;
  const busy = Math.max(s.spin * 0.5, s.scan * 0.3, Math.min(1, stepHz / 4));
  return {
    load: clamp(0.08 + s.spin * (laying ? 0.7 : t > T.radial0 && t < T.radial1 ? 0.5 : 0.25) + (surf === 'air' ? 0.3 : 0), 0, 1),
    battery: 91 - (t / DURATION) * 6,
    draw: 7.2 + 22 * busy,
    motor: 24 + (t / DURATION) * 9,
    surface: surf === 'air' ? 'DRAGLINE' : surf.toUpperCase(),
    gait: surf === 'air' ? 'TUCKED' : stepHz < 0.2 ? 'STANCE' : 'TETRAPOD',
    stepHz,
    down,
    speed,
    height: (p0.y - FLOOR_Y) * M,
    pitch,
    roll,
    silk,
    radials,
    legs: ORDER.map((name, k) => {
      const st = states[k];
      // 足を置いている脚が体の重さを分けて持つ(本数が少ないほど 1 本の荷重が大きい)
      const load = st === 'down' ? clamp(0.32 + 2.2 / Math.max(4, down) * 0.55 + 0.06 * Math.sin(t * 3 + k), 0, 1) : st === 'swing' ? 0.06 : 0.12;
      return { name, value: load, text: st === 'down' ? `${Math.round(load * 100)}%` : st === 'swing' ? 'LIFT' : 'TUCKED', hot: st === 'swing' };
    }),
    subsystems: [
      { name: 'EYE ARRAY', sub: '8 LENSES · 2 MAIN', status: s.scan > 0.3 ? 'SCANNING' : 'TRACKING', tone: 'green' },
      { name: 'LEG DRIVES', sub: '8 × 3 JOINTS · HYDRAULIC', status: surf === 'air' ? 'TUCKED' : stepHz < 0.2 ? 'HOLDING' : 'STEPPING', tone: 'green' },
      { name: 'SPINNERETS', sub: '3 PAIRS · VARIABLE GAUGE', status: s.spin > 0.5 ? 'SPINNING' : s.spin > 0.05 ? 'PRIMED' : 'IDLE', tone: s.spin > 0.5 ? 'orange' : s.spin > 0.05 ? 'green' : 'gray' },
      { name: 'SILK RESERVOIR', sub: 'ABDOMEN TANK', status: `${Math.round(100 - silk * 2.2)}%`, tone: 'green' },
      { name: 'WEB FRAME', sub: `HOOP · ${RADIAL_COUNT} ANCHORS`, status: `${radials} / ${RADIAL_COUNT}`, tone: radials > 0 && radials < RADIAL_COUNT ? 'orange' : 'green' },
      { name: 'CHELICERAE', sub: 'TWIN FANG', status: s.fang > 0.3 ? 'OPEN' : 'SEALED', tone: s.fang > 0.3 ? 'orange' : 'green' },
    ],
  };
}
