import { barsWidget, attitudeWidget, chartWidget, chartFrame } from '../../ui/widgets.js';
import { pressureAt } from './telemetry.js';

// タコの計器の画面の決めごと(ui/hud.js が読む)
const fmt = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);

// 左上の印(タコの線画)
const LOGO = `<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
  <path d="M10 18a10 10 0 0 1 20 0v3H10z"/><circle cx="16" cy="16" r="1.4" fill="#fff" stroke="none"/><circle cx="24" cy="16" r="1.4" fill="#fff" stroke="none"/>
  <path d="M12 21c-1 5-5 6-7 4M16 21c0 6-3 9-6 9M20 21v10M24 21c0 6 3 9 6 9M28 21c1 5 5 6 7 4"/></svg>`;

// 圧力の線グラフ(直近 1.2 秒)。オレンジが今、灰色は少し遅れた流量
function drawPressure(c, W, H, s) {
  const t = s.t;
  const f = chartFrame(c, W, H, { grid: [[100, '100 KPA'], [50, '50 KPA']] });
  const plot = (fn, color, width) => {
    c.beginPath();
    for (let i = 0; i <= 80; i++) {
      const x = f.left + (i / 80) * (f.right - 18 - f.left);
      const y = f.y(fn(t - 1.2 + (i / 80) * 1.2));
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  };
  plot((tt) => pressureAt(tt - 0.14) * 0.88 + 2, '#b9b4ac', 2);
  plot(pressureAt, '#ef5b2b', 3);
  c.fillStyle = '#ef5b2b';
  c.beginPath();
  c.arc(f.right - 18, f.y(pressureAt(t)), 6, 0, Math.PI * 2);
  c.fill();
}

export function makeHudSpec() {
  return {
    logo: LOGO,
    short: 'BX-8',
    kicker: 'ROBOTIC CEPHALOPOD · EIGHT-ARM SUBSEA DRONE',
    name: 'Benthos BX-8',
    subtitle: 'SOFT-ARM MANIPULATOR / FIELD SIMULATOR',
    simId: 'BX8-0731',
    operator: 'TANK 2 · K.S.',
    load: { label: 'JET LOAD', scale: ['IDLE', 'CRUISE', 'BURST'] },
    logEnds: ['DIVE', 'SURFACE'],
    footer: ['FIELD SIMULATOR · PROCEDURAL MODEL · 8 ARMS · 2 OPTICS · 1 SIPHON', 'BENTHOS MARINE ROBOTICS · DEEP LAB'],
    assemblies: ['HERO', 'OPTICS', 'MANTLE', 'ARM R2', 'SIPHON', 'BEAK'],
    displays: [['labels', 'LABELS'], ['exploded', 'EXPLODED'], ['wake', 'JET WAKE'], ['turntable', 'TURNTABLE'], ['soft', 'SOFT BODY']],
    warn: /OPEN|APART|TEST/,
    widgets: {
      a: chartWidget({
        title: 'JET',
        data: (s, tm) => ({
          left: [Math.round(tm.pressure).toString(), 'KPA', 'MANTLE PRESSURE'],
          right: [Math.round(tm.thrust).toString(), 'N', 'THRUST'],
          foot: [`PULSE <b>${tm.pulseHz.toFixed(1)} HZ</b>`, `SIPHON ${tm.siphon}`],
        }),
        draw: drawPressure,
      }),
      c: barsWidget({
        title: 'ARM CURL',
        caption: 'CURL PER ARM · TIP SPIRAL',
        count: 8,
        data: (s, tm) => ({
          badge: { text: tm.curlState, tone: tm.curlState === 'TRAILING' ? 'dark' : tm.curlState === 'DETACHED' ? 'orange' : '' },
          dark: tm.curlState === 'TRAILING',
          rows: tm.curls.map((c) => ({
            name: c.name,
            value: c.detached ? 0 : c.value,
            text: c.detached ? 'DETACHED' : `${Math.round(Math.min(1, c.value) * 100)}%`,
            hot: c.detached,
          })),
        }),
      }),
      d: attitudeWidget({
        title: 'DEPTH',
        data: (s, tm) => ({
          rows: [['DEPTH', `${tm.depth.toFixed(2)} M`], ['V/S', `${fmt(tm.vs)} M/S`], ['PITCH', `${fmt(tm.pitch)}°`], ['ROLL', `${fmt(tm.roll)}°`]],
          pitch: tm.pitch,
          roll: tm.roll,
          foot: [['HOLD', tm.hold], ['SPEED', `${tm.speed.toFixed(2)} M/S`]],
        }),
      }),
    },
    // 大きな文字の下の小さな説明
    modeSub(s, tm) {
      const pct = (v) => `${Math.round(v * 100)}%`;
      switch (s.act.key) {
        case 'inbound': return `PITCH ${Math.round(tm.pitch)}° · ${tm.speed.toFixed(1)} M/S`;
        case 'hold': return `STATION · ${tm.depth.toFixed(1)} M`;
        case 'mantle': return `MANTLE · ${pct(s.mantleOpen)} APART`;
        case 'arm': return `ARM R2 · ${pct(s.armApart)} APART`;
        case 'optics': return `IRIS · ${pct(s.opticsScan)} SCAN`;
        case 'beak': return `BEAK · ${pct(s.beakOpen)} APART`;
        case 'siphon': return `NOZZLE · ${pct(s.siphonOpen)} OPEN`;
        case 'depart': return `PITCH ${Math.round(tm.pitch)}° · RELEASED`;
        default: return '';
      }
    },
  };
}
