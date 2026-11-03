import { barsWidget, attitudeWidget, chartWidget } from '../../ui/widgets.js';
import { legStateAt } from './telemetry.js';
import { LEGS } from './layout.js';
import { SPIRAL, RADIAL_COUNT } from './layout.js';

// 蜘蛛の計器の画面の決めごと(ui/hud.js が読む)
const fmt = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
const ORDER = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
const IDX = ORDER.map((n) => LEGS.findIndex((L) => L.name === n));

const LOGO = `<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
  <ellipse cx="20" cy="17" rx="4.5" ry="4" fill="#fff" stroke="none"/><ellipse cx="20" cy="26" rx="5.5" ry="6.5"/>
  <path d="M16 15l-6-5-4 3M16 17l-8-1-4 4M16 19l-7 4-3 6M17 21l-4 7-1 6M24 15l6-5 4 3M24 17l8-1 4 4M24 19l7 4 3 6M23 21l4 7 1 6"/></svg>`;

// 歩き方の図(直近 1.6 秒): 8 本の脚ごとに、足を置いている間は濃く、運んでいる間はオレンジ、たたんでいる間は薄く
function drawGait(c, W, H, s) {
  const t = s.t;
  const left = 58, right = W - 8, top = 8, rowH = (H - top - 26) / 8;
  const N = 64, span = 1.6;
  c.clearRect(0, 0, W, H);
  c.font = '600 15px ui-monospace, Menlo, monospace';
  for (let r = 0; r < 8; r++) {
    const y = top + r * rowH;
    c.fillStyle = '#6e6a64';
    c.fillText(ORDER[r], 6, y + rowH * 0.75);
    for (let k = 0; k < N; k++) {
      const st = legStateAt(IDX[r], t - span + ((k + 0.5) / N) * span);
      c.fillStyle = st === 'down' ? '#2b2c2f' : st === 'swing' ? '#ef5b2b' : '#e4e0d9';
      const x0 = left + (k / N) * (right - left);
      c.fillRect(x0, y + 3, (right - left) / N + 0.6, rowH - 6);
    }
  }
  c.fillStyle = '#a7a29a';
  c.font = '15px ui-monospace, Menlo, monospace';
  c.fillText(`-${span} S`, left, H - 4);
  c.fillText('NOW', right - 36, H - 4);
}

export function makeHudSpec() {
  return {
    logo: LOGO,
    short: 'AX-8',
    kicker: 'ROBOTIC ARACHNID · EIGHT-LEG FIELD WALKER',
    name: 'Benthos AX-8',
    subtitle: 'SILK-LINE WEAVER / FIELD SIMULATOR',
    simId: 'AX8-0415',
    operator: 'BAY 4 · K.S.',
    load: { label: 'SILK FEED', scale: ['IDLE', 'DRAW', 'SPIN'] },
    logEnds: ['FLOOR', 'HUB'],
    footer: [`FIELD SIMULATOR · PROCEDURAL MODEL · 8 LEGS · 8 OPTICS · ${RADIAL_COUNT} RADIALS`, 'BENTHOS ROBOTICS · FIELD LAB'],
    assemblies: ['HERO', 'OPTICS', 'SPINNERETS', 'DRAGLINE', 'RADIALS', 'SPIRAL'],
    displays: [['labels', 'LABELS'], ['silk', 'SILK'], ['turntable', 'TURNTABLE']],
    warn: /SPINNERETS|RADIAL|SPIRAL|ASCEND/,
    widgets: {
      a: chartWidget({
        title: 'GAIT',
        data: (s, tm) => ({
          left: [tm.stepHz.toFixed(1), 'HZ', 'STEP RATE'],
          right: [String(tm.down), '/ 8', 'LEGS DOWN'],
          foot: [`GAIT <b>${tm.gait}</b>`, `SURFACE ${tm.surface}`],
        }),
        draw: drawGait,
      }),
      c: barsWidget({
        title: 'LEG LOAD',
        caption: 'LOAD PER LEG · STANCE',
        count: 8,
        data: (s, tm) => ({
          badge: { text: tm.gait, tone: tm.gait === 'TUCKED' ? 'dark' : tm.gait === 'STANCE' ? 'gray' : '' },
          dark: false,
          rows: tm.legs,
        }),
      }),
      d: attitudeWidget({
        title: 'STANCE',
        data: (s, tm) => ({
          rows: [['HEIGHT', `${tm.height.toFixed(2)} M`], ['SPEED', `${tm.speed.toFixed(2)} M/S`], ['PITCH', `${fmt(tm.pitch)}°`], ['ROLL', `${fmt(tm.roll)}°`]],
          pitch: tm.pitch,
          roll: tm.roll,
          foot: [['SURFACE', tm.surface], ['SILK', `${tm.silk.toFixed(1)} M`]],
        }),
      }),
    },
    modeSub(s, tm) {
      switch (s.act.key) {
        case 'walk': return `TETRAPOD · ${tm.speed.toFixed(2)} M/S`;
        case 'turn': return `PIVOT · ${Math.round(Math.abs(tm.roll) + Math.abs(tm.pitch))}° · SCAN`;
        case 'spin': return `SPINNERETS · ${Math.round(s.spin * 100)}% OPEN`;
        case 'climb': return `DRAGLINE · ${tm.height.toFixed(2)} M`;
        case 'radial': return `RADIALS · ${tm.radials} / ${RADIAL_COUNT}`;
        case 'spiral': return `${SPIRAL.turns} TURNS · ${tm.silk.toFixed(1)} M SILK`;
        case 'home': return `WEB · ${tm.silk.toFixed(1)} M SILK`;
        default: return '';
      }
    },
  };
}
