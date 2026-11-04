import { barsWidget, attitudeWidget, chartWidget } from '../../ui/widgets.js';
import { legStateAt, LEG_IDX, LEG_ORDER } from './telemetry.js';
import { T } from './layout.js';

// サソリの計器の画面の決めごと(ui/hud.js が読む)
const fmt = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);

// 左上の印(サソリの線画: はさみ・脚・反った尾)
const LOGO = `<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="20" cy="25" rx="4" ry="6" fill="#fff" stroke="none"/>
  <path d="M16 21l-5-5M11 16l-3-5 4 1M24 21l5-5M29 16l3-5-4 1"/>
  <path d="M16 25l-6 0M16 28l-6 3M24 25l6 0M24 28l6 3"/>
  <path d="M20 31c0 4 6 5 8 1s-1-9-5-8" /><path d="M23 24l-2 1"/></svg>`;

// 歩き方の図(直近 1.6 秒): 8 本の脚ごとに、足を置いている間は濃く、運んでいる間はオレンジ
function drawGait(c, W, H, s) {
  const t = s.t;
  const left = 58, right = W - 8, top = 8, rowH = (H - top - 26) / 8;
  const N = 64, span = 1.6;
  c.clearRect(0, 0, W, H);
  c.font = '600 15px ui-monospace, Menlo, monospace';
  for (let r = 0; r < 8; r++) {
    const y = top + r * rowH;
    c.fillStyle = '#6e6a64';
    c.fillText(LEG_ORDER[r], 6, y + rowH * 0.75);
    for (let k = 0; k < N; k++) {
      const st = legStateAt(LEG_IDX[r], t - span + ((k + 0.5) / N) * span);
      c.fillStyle = st === 'down' ? '#2b2c2f' : '#ef5b2b';
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
    short: 'SC-8',
    kicker: 'ROBOTIC ARACHNID · EIGHT-LEG DESERT UNIT',
    name: 'Benthos SC-8',
    subtitle: 'VENOM-TAIL SAMPLER / FIELD SIMULATOR',
    simId: 'SC8-1102',
    operator: 'DUNE 3 · K.S.',
    load: { label: 'VENOM LOAD', scale: ['DRY', 'PRIMED', 'FULL'] },
    logEnds: ['ENTRY', 'EXIT'],
    footer: ['FIELD SIMULATOR · PROCEDURAL MODEL · 8 LEGS · 2 CHELAE · 5 + 1 TAIL HINGES', 'BENTHOS ROBOTICS · ARID LAB'],
    assemblies: ['HERO', 'CHELAE', 'METASOMA', 'TELSON', 'CUTICLE', 'PINCER'],
    displays: [['labels', 'LABELS'], ['uv', 'UV VIEW'], ['turntable', 'TURNTABLE']],
    warn: /THREAT|ARCH|STING/,
    widgets: {
      a: chartWidget({
        title: 'GAIT',
        data: (s, tm) => ({
          left: [tm.stepHz.toFixed(1), 'HZ', 'STEP RATE'],
          right: [String(tm.down), '/ 8', 'LEGS DOWN'],
          foot: [`GAIT <b>${tm.gait}</b>`, 'SURFACE SAND'],
        }),
        draw: drawGait,
      }),
      c: barsWidget({
        title: 'METASOMA',
        caption: 'HINGE ANGLE · SWIVEL → TELSON',
        count: 8,
        data: (s, tm) => ({
          badge: { text: tm.tailState, tone: tm.tailState === 'STRIKE' ? 'orange' : tm.tailState === 'LOW' ? 'gray' : '' },
          dark: tm.tailState === 'LOW',
          rows: tm.tailRows,
        }),
      }),
      d: attitudeWidget({
        title: 'STANCE',
        data: (s, tm) => ({
          rows: [['HEIGHT', `${tm.height.toFixed(2)} M`], ['SPEED', `${tm.speed.toFixed(2)} M/S`], ['PITCH', `${fmt(tm.pitch)}°`], ['ROLL', `${fmt(tm.roll)}°`]],
          pitch: tm.pitch,
          roll: tm.roll,
          foot: [['UV', s.uv > 0.05 ? '365 NM' : 'OFF'], ['STRIKES', `${tm.strikes} / 2`]],
        }),
      }),
    },
    modeSub(s, tm) {
      switch (s.act.key) {
        case 'walk': return `TETRAPOD · ${tm.speed.toFixed(2)} M/S`;
        case 'threat': return `CHELAE RAISED · ${fmt(tm.pitch)}° PITCH`;
        case 'arch': return `METASOMA · ${tm.tailState} · ${Math.round(s.venom * 100)}% VENOM`;
        case 'sting': return `STRIKE ${tm.strikes} / 2 · ${Math.round(s.venom * 100)}% VENOM`;
        case 'uv': return `365 NM · ${Math.round(s.uv * 100)}% · CUTICLE GLOW`;
        case 'grip': return s.t < T.close ? 'CHELA R · REACH' : 'CHELA R · SAMPLE SECURED';
        case 'depart': return `CARRYING SAMPLE · ${tm.speed.toFixed(2)} M/S`;
        default: return '';
      }
    },
  };
}
