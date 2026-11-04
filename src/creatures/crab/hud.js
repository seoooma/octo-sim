import { barsWidget, attitudeWidget, chartWidget } from '../../ui/widgets.js';
import { legStateAt, ORDER } from './telemetry.js';
import { LEGS } from './layout.js';

// カニの計器の画面の決めごと(ui/hud.js が読む)
const fmt = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
const IDX = ORDER.map((n) => LEGS.findIndex((L) => L.name === n));

// 左上の印(カニの線画: 甲羅・はさみ・脚)
const LOGO = `<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 21c0-5 4-8 8-8s8 3 8 8c0 3-3 5-8 5s-8-2-8-5z" fill="#fff" stroke="none"/>
  <path d="M13 16l-4-5M27 16l4-5M9 11c-3 0-4-3-2-5M9 11c1-3 4-3 4-1M31 11c3 0 4-3 2-5M31 11c-1-3-4-3-4-1"/>
  <path d="M12 22l-6 1-2 4M12 24l-5 4-1 4M28 22l6 1 2 4M28 24l5 4 1 4M15 26l-3 5M25 26l3 5"/></svg>`;

// 歩き方の図(直近 1.6 秒): 8 本の脚ごとに、足を置いている間は濃く、運んでいる間はオレンジ
function drawGait(c, W, H, s) {
  const t = s.t;
  const left = 58, right = W - 8, top = 8, rowH = (H - top - 26) / 8;
  const N = 64, span = 1.6;
  c.clearRect(0, 0, W, H);
  c.font = '600 15px ui-monospace, Menlo, monospace';
  for (let r = 0; r < 8; r++) {
    const y = top + r * rowH + (r >= 4 ? 4 : 0);   // 左右のあいだを少しあける
    c.fillStyle = '#6e6a64';
    c.fillText(ORDER[r], 6, y + rowH * 0.75);
    for (let k = 0; k < N; k++) {
      const st = legStateAt(IDX[r], t - span + ((k + 0.5) / N) * span);
      c.fillStyle = st === 'down' ? '#2b2c2f' : '#ef5b2b';
      const x0 = left + (k / N) * (right - left);
      c.fillRect(x0, y + 3, (right - left) / N + 0.6, rowH - 7);
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
    short: 'CR-10',
    kicker: 'ROBOTIC DECAPOD · LATERAL-GAIT SEABED CRAWLER',
    name: 'Benthos CR-10',
    subtitle: 'DUAL-CHELA MANIPULATOR / FIELD SIMULATOR',
    simId: 'CR10-0922',
    operator: 'FLAT 3 · K.S.',
    load: { label: 'GRIP LOAD', scale: ['IDLE', 'HOLD', 'CRUSH'] },
    logEnds: ['SHALLOWS', 'REEF'],
    footer: ['FIELD SIMULATOR · PROCEDURAL MODEL · 8 LEGS · 2 CHELAE · 2 OPTICS', 'BENTHOS ROBOTICS · SHALLOWS LAB'],
    assemblies: ['HERO', 'OPTICS', 'CHELAE', 'MOUTH', 'CARAPACE', 'GILLS'],
    displays: [['labels', 'LABELS'], ['bubbles', 'BUBBLES'], ['shell', 'SHELL'], ['turntable', 'TURNTABLE']],
    warn: /DISPLAY|GRAB|CARAPACE|BUBBLE/,
    widgets: {
      a: chartWidget({
        title: 'GAIT',
        data: (s, tm) => ({
          left: [tm.stepHz.toFixed(1), 'HZ', 'STEP RATE'],
          right: [String(tm.down), '/ 8', 'LEGS DOWN'],
          foot: [`GAIT <b>${tm.gait}</b>`, `HEADING ${tm.heading}`],
        }),
        draw: drawGait,
      }),
      c: barsWidget({
        title: 'LEG LOAD',
        caption: 'LOAD PER LEG · SIDEWAYS',
        count: 8,
        data: (s, tm) => ({
          badge: { text: tm.gait, tone: tm.gait === 'REARED' ? 'orange' : tm.gait === 'STANCE' ? 'gray' : '' },
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
          foot: [['CLAW', `${Math.round(Math.max(tm.gripR, tm.gripL))} N`], ['SHELL', tm.shellDeg > 0 ? `${tm.shellDeg}°` : 'SEALED']],
        }),
      }),
    },
    modeSub(s, tm) {
      switch (s.act.key) {
        case 'walk': return `${tm.heading} · ${tm.speed.toFixed(2)} M/S`;
        case 'eyes': return `STALKS ${Math.round(s.eyesUp * 100)}% · SCAN`;
        case 'display': return `CRUSHER ${Math.round(tm.gripR)} N · CUTTER ${Math.round(tm.gripL)} N`;
        case 'grab': return `CUTTER · ${Math.round(tm.gripL)} N PINCH`;
        case 'open': return `CARAPACE · ${tm.shellDeg}° OPEN`;
        case 'bubbles': return `GILL PUMP · ${Math.round(s.vent * 100)}% PURGE`;
        case 'out': return `${tm.heading} · ${tm.speed.toFixed(2)} M/S`;
        default: return '';
      }
    },
  };
}
