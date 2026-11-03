import './hud.css';
import { ACTIONS, DURATION } from '../sim/timeline.js';
import { pressureAt } from '../sim/telemetry.js';
import { pad2 } from '../util.js';

// 計器の画面(HTML)。見た目は hud.css。数字は毎コマ update() で書き換える(変わったところだけ)。
const DESIGN_W = 1600;
const DESIGN_H = 900;
export const ASSEMBLIES = ['HERO', 'OPTICS', 'MANTLE', 'ARM R2', 'SIPHON', 'BEAK'];
export const DISPLAYS = [['labels', 'LABELS'], ['exploded', 'EXPLODED'], ['wake', 'JET WAKE'], ['turntable', 'TURNTABLE'], ['soft', 'SOFT BODY']];

// 左上の印(タコの線画)
const LOGO = `<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
  <path d="M10 18a10 10 0 0 1 20 0v3H10z"/><circle cx="16" cy="16" r="1.4" fill="#fff" stroke="none"/><circle cx="24" cy="16" r="1.4" fill="#fff" stroke="none"/>
  <path d="M12 21c-1 5-5 6-7 4M16 21c0 6-3 9-6 9M20 21v10M24 21c0 6 3 9 6 9M28 21c1 5 5 6 7 4"/></svg>`;
const PLAY = '<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 14 14"><rect x="2.5" y="1.5" width="3.2" height="11"/><rect x="8.3" y="1.5" width="3.2" height="11"/></svg>';

const TEMPLATE = `
<div class="frame">
  <header class="top">
    <div class="logo">${LOGO}<span>BX-8</span></div>
    <div class="title">
      <div class="kicker">ROBOTIC CEPHALOPOD · EIGHT-ARM SUBSEA DRONE</div>
      <h1>Benthos BX-8<i>/</i></h1>
      <div class="subtitle">SOFT-ARM MANIPULATOR / FIELD SIMULATOR</div>
    </div>
    <div class="jetload">
      <div class="lbl"><span>JET LOAD</span><b data-ref="jetPct">12%</b></div>
      <div class="segs" data-ref="jetSegs"></div>
      <div class="scale"><span>IDLE</span><span>CRUISE</span><span>BURST</span></div>
    </div>
    <div class="stat sim">SIM ID<b>BX8-0731</b></div>
    <div class="stat run">RUNTIME<b data-ref="runtime">00:00:00</b></div>
    <div class="stat status">STATUS<b><i class="dot" data-ref="dot"></i><em data-ref="status">HOLDING</em></b></div>
    <div class="stat op">OPERATOR<b>TANK 2 · K.S.</b></div>
  </header>
  <div class="plus-grid">${'<span>+</span>'.repeat(28)}</div>
  <div class="vtag left">MODEL BX-8 · REV 8</div>
  <button class="vtag right" data-ref="isolate">ISOLATE · HERO</button>
  <div class="vbox"></div><div class="vbox br"></div>

  <section class="panel p-jet">
    <h2><span>JET</span><em>01</em></h2>
    <div class="row"><div class="big"><b data-ref="pressure">20</b><small>KPA</small></div><div class="big right"><b data-ref="thrust">6</b><small class="unit">N</small></div></div>
    <div class="row cap"><span>MANTLE PRESSURE</span><span>THRUST</span></div>
    <canvas data-ref="chart" width="516" height="184"></canvas>
    <div class="row foot"><span>PULSE <b data-ref="pulse">0.0 HZ</b></span><span data-ref="siphon">SIPHON IDLE</span></div>
  </section>

  <section class="panel p-power">
    <h2><span>POWER</span><em>02</em></h2>
    <div class="row"><div class="big"><b data-ref="battery">86</b><small>%</small></div><div class="cells" data-ref="cells"></div></div>
    <div class="cap">BATTERY</div>
    <div class="row three"><div>DRAW<b data-ref="draw">9.4 W</b></div><div>CELL<b data-ref="cell">3.72 V</b></div><div>MOTOR<b data-ref="motor">25 °C</b></div></div>
  </section>

  <section class="panel p-curl">
    <h2><span>ARM CURL</span><em>03</em></h2>
    <div class="row cap"><span>CURL PER ARM · TIP SPIRAL</span><i class="badge" data-ref="curlBadge">CURLING</i></div>
    <div class="curls" data-ref="curls"></div>
  </section>

  <section class="panel p-depth">
    <h2><span>DEPTH</span><em>04</em></h2>
    <div class="row">
      <svg class="attitude" viewBox="-50 -50 100 100">
        <circle r="45" fill="#fff" stroke="#d9d4cc"/>
        <g stroke="#cfc9c0" stroke-width="1"><path d="M-12 -22h24M-12 22h24M-7 -11h14M-7 11h14"/></g>
        <g data-ref="horizon"><path d="M-44 0H-12l6 4 6-8 6 4h38" stroke="var(--orange)" stroke-width="1.6" fill="none"/></g>
      </svg>
      <dl>
        <dt>DEPTH</dt><dd data-ref="depth">12.43 M</dd>
        <dt>V/S</dt><dd data-ref="vs">+0.04 M/S</dd>
        <dt>PITCH</dt><dd data-ref="pitch">+0.76°</dd>
        <dt>ROLL</dt><dd data-ref="roll">-1.95°</dd>
      </dl>
    </div>
    <div class="row foot"><span>HOLD <b data-ref="hold">STATION</b></span><span>SPEED <b data-ref="speed">0.05 M/S</b></span></div>
  </section>

  <div class="dock" data-ref="dock">
    <section class="panel interactive p-asm"><h2><span>ASSEMBLIES</span><em>05</em></h2><div class="btns" data-ref="asm"></div></section>
    <section class="panel interactive p-disp"><h2><span>DISPLAY</span><em>06</em></h2><div class="btns" data-ref="disp"></div></section>
  </div>
  <section class="panel p-sub"><h2><span>SUBSYSTEMS</span><em>07</em></h2><ol data-ref="subs"></ol></section>

  <div class="mode"><span>OPERATING MODE</span><b data-ref="mode">HOLDING</b><small data-ref="modeSub">STATION</small></div>

  <section class="panel interactive p-log" data-ref="log">
    <button class="play" data-ref="play" aria-label="play / pause">${PAUSE}</button>
    <div class="log-top"><span>OPERATION LOG</span><em>08</em></div>
    <div class="log-row"><span>DIVE</span><b data-ref="logText">INBOUND · JET ASSIST</b><span>SURFACE</span></div>
    <div class="track" data-ref="track" role="slider" tabindex="0" aria-label="TIMELINE" aria-valuemin="0" aria-valuemax="${DURATION}" aria-valuenow="0"><div class="fill" data-ref="fill"></div><div class="ticks" data-ref="ticks"></div><div class="knob" data-ref="knob"></div></div>
    <div class="log-row small"><span data-ref="time">00:00 / 00:25</span><span>${ACTIONS.length} OPERATOR ACTIONS</span></div>
  </section>

  <footer><span>FIELD SIMULATOR · PROCEDURAL MODEL · 8 ARMS · 2 OPTICS · 1 SIPHON</span><span>BENTHOS MARINE ROBOTICS · DEEP LAB <i>//////</i></span></footer>
</div>`;

const fmt = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
const mmss = (t) => `${pad2(t / 60)}:${pad2(t % 60)}`;

export class Hud {
  // handlers: onPlay(), onSeek(t, done: 指を離したか), onAssembly(name), onDisplay(key), onResetView()
  constructor(root, handlers) {
    this.root = root;
    root.innerHTML = TEMPLATE;
    this.ref = {};
    root.querySelectorAll('[data-ref]').forEach((el) => (this.ref[el.dataset.ref] = el));
    this.cache = new Map();
    const r = this.ref;

    r.jetSegs.innerHTML = '<i></i>'.repeat(40);
    this.jetSegs = [...r.jetSegs.children];
    r.cells.innerHTML = '<i></i>'.repeat(10);
    this.cells = [...r.cells.children];
    r.curls.innerHTML = Array.from({ length: 8 }, () => '<div class="c"><span></span><div class="bar"><i></i></div><span class="v"></span></div>').join('');
    this.curlRows = [...r.curls.children].map((c) => ({ name: c.children[0], fill: c.children[1].firstChild, v: c.children[2] }));
    r.subs.innerHTML = Array.from({ length: 6 }, (_, i) => `<li><span class="n">${pad2(i + 1)}</span><span class="nm"></span><i class="badge"></i></li>`).join('');
    this.subRows = [...r.subs.children].map((li) => ({ li, nm: li.children[1], badge: li.children[2] }));
    r.ticks.innerHTML = ACTIONS.slice(1).map((a) => `<i style="left:${(a.t / DURATION) * 100}%"></i>`).join('');

    r.asm.innerHTML = ASSEMBLIES.map((a) => `<button data-asm="${a}">${a}</button>`).join('');
    r.disp.innerHTML = DISPLAYS.map(([k, n]) => `<button data-disp="${k}">${n}</button>`).join('');
    r.asm.addEventListener('click', (e) => e.target.dataset.asm && handlers.onAssembly(e.target.dataset.asm));
    r.disp.addEventListener('click', (e) => e.target.dataset.disp && handlers.onDisplay(e.target.dataset.disp));
    r.play.addEventListener('click', () => handlers.onPlay());
    r.isolate.addEventListener('click', () => handlers.onResetView());
    // タイムライン: 押して、こすって、離す。離したとき(取り上げられたときも)に終わりを知らせる
    let lastT = 0;
    const at = (e) => {
      const box = r.track.getBoundingClientRect();
      return (lastT = Math.min(0.999, Math.max(0, (e.clientX - box.left) / box.width)) * DURATION);
    };
    const end = () => {
      if (!r.track.onpointermove) return;
      r.track.onpointermove = null;
      handlers.onSeek(lastT, true);
    };
    r.track.addEventListener('pointerdown', (e) => {
      handlers.onSeek(at(e), false);
      r.track.setPointerCapture(e.pointerId);
      r.track.onpointermove = (ev) => handlers.onSeek(at(ev), false);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) r.track.addEventListener(ev, end);

    this.ctx = r.chart.getContext('2d');
    this.freeRect = null;
    this.layout();
    window.addEventListener('resize', () => this.layout());
    requestAnimationFrame(() => this.layout());   // 文字の大きさが決まってから、空いている四角を測り直す
  }

  // PC は 1600×900 を窓に合わせて縮める。狭い画面(縮めると文字が小さすぎる・指で操る端末で 0.75 倍未満)は並べ替え(compact)。
  // あわせて、引き出し線の文字を置いてよい四角(パネルのない真ん中)を測っておく
  layout() {
    const w = window.innerWidth, h = window.innerHeight;
    const s = Math.min(w / DESIGN_W, h / DESIGN_H);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const compact = w < 1000 || h < 560 || (coarse && s < 0.75);
    const portrait = compact && h > w;
    this.root.classList.toggle('compact', compact);
    this.root.classList.toggle('portrait', portrait);
    const frame = this.root.firstElementChild;
    this.compact = compact;
    if (!compact) {
      const ox = (w - DESIGN_W * s) / 2, oy = (h - DESIGN_H * s) / 2;
      frame.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
      this.freeRect = { x0: ox + 330 * s, y0: oy + 100 * s, x1: ox + 1270 * s, y1: oy + 750 * s };
      return;
    }
    frame.style.transform = '';
    const r = this.ref;
    const box = (el) => el.getBoundingClientRect();
    const top = box(this.root.querySelector('.top')).bottom;
    if (portrait) {
      this.freeRect = { x0: 6, y0: Math.max(top, box(r.mode.parentElement).bottom) + 6, x1: w - 6, y1: box(r.dock).top - 6 };
    } else {
      const asm = box(r.asm.parentElement), disp = box(r.disp.parentElement);
      this.freeRect = { x0: asm.right + 6, y0: top + 6, x1: disp.left - 6, y1: box(r.log).top - 6 };
    }
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    if (prop.startsWith('attr:')) el.setAttribute(prop.slice(5), value);
    else el[prop] = value;
  }

  // s: 台本の状態、tm: 計器の数字、ui: { playing, display: {labels, exploded, wake, turntable} }
  update(s, tm, ui) {
    const r = this.ref;
    const act = s.act;
    this.set('jetPct', r.jetPct, `${Math.round(tm.jetLoad * 100)}%`);
    const segOn = Math.round(tm.jetLoad * 40);
    if (this.cache.get('segs') !== segOn) {
      this.cache.set('segs', segOn);
      this.jetSegs.forEach((el, i) => el.classList.toggle('on', i < segOn));
    }
    this.set('runtime', r.runtime, `00:${mmss(s.t)}`);
    this.set('status', r.status, act.mode);
    const warn = /OPEN|APART|TEST/.test(act.mode);
    this.set('dot', r.dot, warn ? 'dot warn' : 'dot', 'className');
    // 手で回した視点のときは、押すと段取りのカメラに戻る札にする
    this.set('isolate', r.isolate, ui.freeView ? 'FREE VIEW · RESET' : `ISOLATE · ${act.assembly}`);
    this.set('isolateC', r.isolate, ui.freeView ? 'vtag right free' : 'vtag right', 'className');

    // JET
    this.set('pressure', r.pressure, Math.round(tm.pressure).toString());
    this.set('thrust', r.thrust, Math.round(tm.thrust).toString());
    this.set('pulse', r.pulse, `${tm.pulseHz.toFixed(1)} HZ`);
    this.set('siphon', r.siphon, `SIPHON ${tm.siphon}`);
    if (!this.compact) this.drawChart(s.t);

    // POWER
    this.set('battery', r.battery, Math.round(tm.battery).toString());
    const lit = Math.round(tm.battery / 10);
    if (this.cache.get('cells') !== lit) {
      this.cache.set('cells', lit);
      this.cells.forEach((el, i) => (el.className = i >= lit ? 'off' : i < 2 ? 'low' : ''));
    }
    this.set('draw', r.draw, `${tm.draw.toFixed(1)} W`);
    this.set('motor', r.motor, `${Math.round(tm.motor)} °C`);

    // ARM CURL
    this.set('curlBadge', r.curlBadge, tm.curlState);
    this.set('curlBadgeC', r.curlBadge, tm.curlState === 'TRAILING' ? 'badge dark' : tm.curlState === 'DETACHED' ? 'badge orange' : 'badge', 'className');
    this.set('curlsC', r.curls, tm.curlState === 'TRAILING' ? 'curls trailing' : 'curls', 'className');
    tm.curls.forEach((c, i) => {
      const row = this.curlRows[i];
      const pct = Math.round(Math.min(1, c.value) * 100);
      this.set(`cn${i}`, row.name, c.name);
      this.set(`cw${i}`, row.fill.style, c.detached ? '0%' : `${pct}%`, 'width');
      this.set(`cv${i}`, row.v, c.detached ? 'DETACHED' : `${pct}%`);
      this.set(`cc${i}`, row.v, c.detached ? 'v det' : 'v', 'className');
    });

    // DEPTH
    this.set('depth', r.depth, `${tm.depth.toFixed(2)} M`);
    this.set('vs', r.vs, `${fmt(tm.vs)} M/S`);
    this.set('pitch', r.pitch, `${fmt(tm.pitch)}°`);
    this.set('roll', r.roll, `${fmt(tm.roll)}°`);
    this.set('hold', r.hold, tm.hold);
    this.set('speed', r.speed, `${tm.speed.toFixed(2)} M/S`);
    const py = Math.max(-30, Math.min(30, tm.pitch * 0.35));
    this.set('horizon', r.horizon, `rotate(${(-tm.roll).toFixed(1)}) translate(0 ${py.toFixed(1)})`, 'attr:transform');

    // ASSEMBLIES / DISPLAY / SUBSYSTEMS
    for (const b of r.asm.children) this.set(`asm${b.dataset.asm}`, b, b.dataset.asm === act.assembly ? 'on' : '', 'className');
    for (const b of r.disp.children) this.set(`disp${b.dataset.disp}`, b, ui.display[b.dataset.disp] ? 'on' : '', 'className');
    tm.subsystems.forEach((sub, i) => {
      const row = this.subRows[i];
      this.set(`sn${i}`, row.nm, `${sub.name}<small>${sub.sub}</small>`, 'innerHTML');
      this.set(`sb${i}`, row.badge, sub.status);
      this.set(`sc${i}`, row.badge, `badge ${sub.tone === 'green' ? '' : sub.tone}`, 'className');
      this.set(`sh${i}`, row.li, sub.tone === 'orange' ? 'hot' : '', 'className');
    });

    // 大きな文字とタイムライン
    this.set('mode', r.mode, act.mode);
    this.set('modeSub', r.modeSub, modeSub(s, tm));
    this.set('logText', r.logText, act.log);
    const pct = `${((s.t / DURATION) * 100).toFixed(2)}%`;
    this.set('fill', r.fill.style, pct, 'width');
    this.set('knob', r.knob.style, pct, 'left');
    this.set('time', r.time, `${mmss(s.t)} / ${mmss(DURATION)}`);
    this.set('aria', r.track, s.t.toFixed(1), 'attr:aria-valuenow');
    this.set('play', r.play, ui.playing ? PAUSE : PLAY, 'innerHTML');
  }

  // 圧力の線グラフ(直近 1.2 秒)。オレンジが今、灰色は少し遅れた流量
  drawChart(t) {
    const c = this.ctx;
    const W = c.canvas.width, H = c.canvas.height;
    const top = 16, bottom = H - 26, left = 4, right = W - 4;
    c.clearRect(0, 0, W, H);
    c.font = '15px ui-monospace, Menlo, monospace';
    c.fillStyle = '#a7a29a';
    c.strokeStyle = '#e1ddd6';
    c.lineWidth = 1.5;
    c.setLineDash([3, 5]);
    for (const [v, label] of [[100, '100 KPA'], [50, '50 KPA']]) {
      const y = bottom - (v / 100) * (bottom - top);
      c.beginPath();
      c.moveTo(left, y);
      c.lineTo(right, y);
      c.stroke();
      c.fillText(label, right - 70, y - 5);
    }
    c.beginPath();
    c.moveTo(right - 18, top - 6);
    c.lineTo(right - 18, bottom);
    c.stroke();
    c.setLineDash([]);
    c.fillText('-1.2 S', left, H - 4);
    c.fillText('NOW', right - 40, H - 4);
    const plot = (fn, color, width) => {
      c.beginPath();
      for (let i = 0; i <= 80; i++) {
        const tt = t - 1.2 + (i / 80) * 1.2;
        const x = left + (i / 80) * (right - 18 - left);
        const y = bottom - (Math.min(105, fn(tt)) / 100) * (bottom - top);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    };
    plot((tt) => pressureAt(tt - 0.14) * 0.88 + 2, '#b9b4ac', 2);
    plot(pressureAt, '#ef5b2b', 3);
    const y = bottom - (Math.min(105, pressureAt(t)) / 100) * (bottom - top);
    c.fillStyle = '#ef5b2b';
    c.beginPath();
    c.arc(right - 18, y, 6, 0, Math.PI * 2);
    c.fill();
  }
}

// 大きな文字の下の小さな説明
function modeSub(s, tm) {
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
}
