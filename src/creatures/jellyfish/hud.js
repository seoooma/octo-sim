import { barsWidget, attitudeWidget, chartWidget, chartFrame } from '../../ui/widgets.js';
import { apertureAt } from './telemetry.js';
import { pad2 } from '../../util.js';

// クラゲの計器の画面の決めごと(ui/hud.js が読む)
const fmt = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);

// 左上の印(クラゲの線画)
const LOGO = `<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
  <path d="M8 19a12 11 0 0 1 24 0z" fill="#fff" stroke="none"/><path d="M8 19h24"/>
  <path d="M11 21c-1 5 2 8 0 13M16 21c1 4-1 7 1 12M20 21v14M24 21c-1 4 1 7-1 12M29 21c1 5-2 8 0 13"/></svg>`;

// 傘の開きの線グラフ(直近 2 秒)。オレンジが今、灰色は縁の少し遅れた開き。65〜115% を図の高さに
const SPAN = 2.0;
const toV = (ap) => Math.min(104, (ap - 65) * 2);
function drawAperture(c, W, H, s) {
  const t = s.t;
  const f = chartFrame(c, W, H, { grid: [[toV(100), '100 % REST'], [toV(80), '80 %']], leftLabel: `-${SPAN.toFixed(1)} S` });
  const plot = (fn, color, width) => {
    c.beginPath();
    for (let i = 0; i <= 90; i++) {
      const x = f.left + (i / 90) * (f.right - 18 - f.left);
      const y = f.y(Math.max(-4, toV(fn(t - SPAN + (i / 90) * SPAN))));
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  };
  plot((tt) => apertureAt(tt - 0.18) - 1.5, '#b9b4ac', 2);
  plot(apertureAt, '#ef5b2b', 3);
  c.fillStyle = '#ef5b2b';
  c.beginPath();
  c.arc(f.right - 18, f.y(Math.max(-4, toV(apertureAt(t)))), 6, 0, Math.PI * 2);
  c.fill();
}

export function makeHudSpec() {
  return {
    logo: LOGO,
    short: 'JL-1',
    kicker: 'ROBOTIC MEDUSA · SIXTEEN-PLATE PULSE DRONE',
    name: 'Benthos JL-1',
    subtitle: 'PULSE-BELL DRIFTER / FIELD SIMULATOR',
    simId: 'JL1-0912',
    operator: 'TANK 5 · K.S.',
    load: { label: 'PULSE LOAD', scale: ['GLIDE', 'CRUISE', 'BURST'] },
    logEnds: ['DESCENT', 'SURFACE'],
    footer: ['FIELD SIMULATOR · PROCEDURAL MODEL · 16 PLATES · 16 TENTACLES · 4 ORAL ARMS', 'BENTHOS MARINE ROBOTICS · DEEP LAB'],
    assemblies: ['HERO', 'BELL', 'TENTACLES', 'ORAL ARMS', 'RIM LIGHTS', 'CORE'],
    displays: [['labels', 'LABELS'], ['glow', 'GLOW'], ['drift', 'SOFT DRIFT'], ['turntable', 'TURNTABLE']],
    warn: /OPEN|NET|RECOIL/,
    widgets: {
      a: chartWidget({
        title: 'PULSE',
        data: (s, tm) => ({
          left: [Math.round(tm.aperture).toString(), '%', 'BELL APERTURE'],
          right: [Math.round(tm.thrust).toString(), 'N', 'THRUST'],
          foot: [`PULSE <b>${tm.pulseHz.toFixed(2)} HZ</b>`, `STROKES ${pad2(tm.strokes)}`],
        }),
        draw: drawAperture,
      }),
      c: barsWidget({
        title: 'TENTACLES',
        caption: 'SPREAD PER PAIR · LUMEN',
        count: 8,
        data: (s, tm) => ({
          badge: { text: tm.state, tone: tm.state === 'HANGING' ? 'gray' : tm.state === 'NET' || tm.state === 'GLOWING' ? 'orange' : 'dark' },
          dark: false,
          rows: tm.groups,
        }),
      }),
      d: attitudeWidget({
        title: 'DEPTH',
        data: (s, tm) => ({
          rows: [['DEPTH', `${tm.depth.toFixed(2)} M`], ['V/S', `${fmt(tm.vs)} M/S`], ['PITCH', `${fmt(tm.pitch, 1)}°`], ['ROLL', `${fmt(tm.roll, 1)}°`]],
          pitch: tm.pitch,
          roll: tm.roll,
          foot: [['BUOY', tm.buoy], ['SPEED', `${tm.speed.toFixed(2)} M/S`]],
        }),
      }),
    },
    // 大きな文字の下の小さな説明
    modeSub(s, tm) {
      const pct = (v) => `${Math.round(v * 100)}%`;
      switch (s.act.key) {
        case 'drift': return `SINK ${Math.abs(tm.vs).toFixed(2)} M/S · BELL ${Math.round(tm.aperture)}%`;
        case 'pulse': return `${tm.pulseHz.toFixed(2)} HZ · ${tm.speed.toFixed(2)} M/S`;
        case 'net': return `SPREAD ${pct(s.net)} · ${tm.netBuilt} / ${tm.strands} STRANDS`;
        case 'oral': return `FRILLS ${pct(s.oral)} · 4 ARMS`;
        case 'lumen': return `LUMEN ${pct(s.lumen)} · RADIAL WAVE`;
        case 'open': return `PLATES ${pct(s.open)} OPEN · GYRO`;
        case 'recoil': return `BURST · ${tm.speed.toFixed(2)} M/S`;
        case 'ascend': return `ASCENT ${fmt(tm.vs)} M/S`;
        default: return '';
      }
    },
  };
}
