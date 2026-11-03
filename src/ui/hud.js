import './hud.css';
import { pad2 } from '../util.js';

// 計器の画面(HTML)。見た目は hud.css。数字は毎コマ update() で書き換える(変わったところだけ)。
// 上の帯・POWER・ASSEMBLIES・DISPLAY・SUBSYSTEMS・下のタイムラインは共通。
// 左の上(a)・左の下(c)・右の上(d)の枠は、生き物ごとの部品(ui/widgets.js)を入れる。
const DESIGN_W = 1600;
const DESIGN_H = 900;
const PLAY = '<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 14 14"><rect x="2.5" y="1.5" width="3.2" height="11"/><rect x="8.3" y="1.5" width="3.2" height="11"/></svg>';
const SLOTS = [['a', '01'], ['c', '03'], ['d', '04']];

// spec: 生き物の画面の決めごと(creatures/*/hud.js)、script: 台本、species: [{ id, label }](切り替え)、current: 今の生き物
function template(spec, script, species, current) {
  const panel = (slot, num) => {
    const w = spec.widgets[slot];
    return `<section class="panel p-${slot} ${w.cls}" data-slot="${slot}"><h2><span>${w.title}</span><em>${num}</em></h2>${w.html}</section>`;
  };
  return `
<div class="frame">
  <header class="top">
    <div class="logo">${spec.logo}<span>${spec.short}</span></div>
    <div class="title">
      <div class="kicker">${spec.kicker}</div>
      <h1>${spec.name}<i>/</i></h1>
      <div class="subtitle">${spec.subtitle}</div>
    </div>
    <div class="jetload">
      <div class="lbl"><span>${spec.load.label}</span><b data-ref="loadPct">0%</b></div>
      <div class="segs" data-ref="loadSegs"></div>
      <div class="scale">${spec.load.scale.map((x) => `<span>${x}</span>`).join('')}</div>
    </div>
    <div class="stat sim">SIM ID<b>${spec.simId}</b></div>
    <div class="stat run">RUNTIME<b data-ref="runtime">00:00:00</b></div>
    <div class="stat status">STATUS<b><i class="dot" data-ref="dot"></i><em data-ref="status"></em></b></div>
    <div class="stat op">OPERATOR<b>${spec.operator}</b></div>
  </header>
  <div class="plus-grid">${'<span>+</span>'.repeat(28)}</div>
  <nav class="species" data-ref="species"><span>SPECIMEN</span>${species.map((c) => `<button data-species="${c.id}" class="${c.id === current ? 'on' : ''}">${c.label}</button>`).join('')}</nav>
  <button class="vtag right" data-ref="isolate">ISOLATE · HERO</button>
  <div class="vbox"></div><div class="vbox br"></div>

  ${panel('a', '01')}
  <section class="panel p-power">
    <h2><span>POWER</span><em>02</em></h2>
    <div class="row"><div class="big"><b data-ref="battery">86</b><small>%</small></div><div class="cells" data-ref="cells"></div></div>
    <div class="cap">BATTERY</div>
    <div class="row three"><div>DRAW<b data-ref="draw">9.4 W</b></div><div>CELL<b data-ref="cell">3.72 V</b></div><div>MOTOR<b data-ref="motor">25 °C</b></div></div>
  </section>
  ${panel('c', '03')}
  ${panel('d', '04')}

  <div class="dock" data-ref="dock">
    <section class="panel interactive p-asm"><h2><span>ASSEMBLIES</span><em>05</em></h2><div class="btns" data-ref="asm"></div></section>
    <section class="panel interactive p-disp"><h2><span>DISPLAY</span><em>06</em></h2><div class="btns" data-ref="disp"></div></section>
  </div>
  <section class="panel p-sub"><h2><span>SUBSYSTEMS</span><em>07</em></h2><ol data-ref="subs"></ol></section>

  <div class="mode"><span>OPERATING MODE</span><b data-ref="mode"></b><small data-ref="modeSub"></small></div>

  <section class="panel interactive p-log" data-ref="log">
    <button class="play" data-ref="play" aria-label="play / pause">${PAUSE}</button>
    <div class="log-top"><span>OPERATION LOG</span><em>08</em></div>
    <div class="log-row"><span>${spec.logEnds[0]}</span><b data-ref="logText"></b><span>${spec.logEnds[1]}</span></div>
    <div class="track" data-ref="track" role="slider" tabindex="0" aria-label="TIMELINE" aria-valuemin="0" aria-valuemax="${script.DURATION}" aria-valuenow="0"><div class="fill" data-ref="fill"></div><div class="ticks" data-ref="ticks"></div><div class="knob" data-ref="knob"></div></div>
    <div class="log-row small"><span data-ref="time"></span><span>${script.ACTIONS.length} OPERATOR ACTIONS</span></div>
  </section>

  <footer><span>${spec.footer[0]}</span><span>${spec.footer[1]} <i>//////</i></span></footer>
</div>`;
}

const mmss = (t) => `${pad2(t / 60)}:${pad2(t % 60)}`;

export class Hud {
  // handlers: onPlay(), onSeek(t, done: 指を離したか), onAssembly(name), onDisplay(key), onResetView(), onSpecies(id)
  constructor(root, spec, script, species, current, handlers) {
    this.root = root;
    this.spec = spec;
    this.script = script;
    root.innerHTML = template(spec, script, species, current);
    this.ref = {};
    root.querySelectorAll('[data-ref]').forEach((el) => (this.ref[el.dataset.ref] = el));
    this.cache = new Map();
    const r = this.ref;
    const { ACTIONS, DURATION } = script;

    // 差し替えの部品
    this.widgets = SLOTS.map(([slot]) => {
      const w = spec.widgets[slot];
      w.mount(root.querySelector(`[data-slot="${slot}"]`));
      return { w, set: (k, el, v, prop) => this.set(`${slot}.${k}`, el, v, prop) };
    });

    r.loadSegs.innerHTML = '<i></i>'.repeat(40);
    this.loadSegs = [...r.loadSegs.children];
    r.cells.innerHTML = '<i></i>'.repeat(10);
    this.cells = [...r.cells.children];
    r.subs.innerHTML = Array.from({ length: 6 }, (_, i) => `<li><span class="n">${pad2(i + 1)}</span><span class="nm"></span><i class="badge"></i></li>`).join('');
    this.subRows = [...r.subs.children].map((li) => ({ li, nm: li.children[1], badge: li.children[2] }));
    r.ticks.innerHTML = ACTIONS.slice(1).map((a) => `<i style="left:${(a.t / DURATION) * 100}%"></i>`).join('');

    r.asm.innerHTML = spec.assemblies.map((a) => `<button data-asm="${a}">${a}</button>`).join('');
    r.disp.innerHTML = spec.displays.map(([k, n]) => `<button data-disp="${k}">${n}</button>`).join('');
    r.asm.addEventListener('click', (e) => e.target.dataset.asm && handlers.onAssembly(e.target.dataset.asm));
    r.disp.addEventListener('click', (e) => e.target.dataset.disp && handlers.onDisplay(e.target.dataset.disp));
    r.species.addEventListener('click', (e) => e.target.dataset.species && handlers.onSpecies(e.target.dataset.species));
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
    const top = Math.max(box(this.root.querySelector('.top')).bottom, box(r.species).bottom);
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

  // s: 台本の状態、tm: 計器の数字(load・battery・draw・motor・subsystems と、部品が読むもの)、
  // ui: { playing, display: {...}, freeView }
  update(s, tm, ui) {
    const r = this.ref;
    const act = s.act;
    const { DURATION } = this.script;
    this.set('loadPct', r.loadPct, `${Math.round(tm.load * 100)}%`);
    const segOn = Math.round(tm.load * 40);
    if (this.cache.get('segs') !== segOn) {
      this.cache.set('segs', segOn);
      this.loadSegs.forEach((el, i) => el.classList.toggle('on', i < segOn));
    }
    this.set('runtime', r.runtime, `00:${mmss(s.t)}`);
    this.set('status', r.status, act.mode);
    this.set('dot', r.dot, this.spec.warn.test(act.mode) ? 'dot warn' : 'dot', 'className');
    // 手で回した視点のときは、押すと段取りのカメラに戻る札にする
    this.set('isolate', r.isolate, ui.freeView ? 'FREE VIEW · RESET' : `ISOLATE · ${act.assembly}`);
    this.set('isolateC', r.isolate, ui.freeView ? 'vtag right free' : 'vtag right', 'className');

    for (const { w, set } of this.widgets) w.update(set, s, tm, this.compact);

    // POWER
    this.set('battery', r.battery, Math.round(tm.battery).toString());
    const lit = Math.round(tm.battery / 10);
    if (this.cache.get('cells') !== lit) {
      this.cache.set('cells', lit);
      this.cells.forEach((el, i) => (el.className = i >= lit ? 'off' : i < 2 ? 'low' : ''));
    }
    this.set('draw', r.draw, `${tm.draw.toFixed(1)} W`);
    this.set('motor', r.motor, `${Math.round(tm.motor)} °C`);

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
    this.set('modeSub', r.modeSub, this.spec.modeSub(s, tm));
    this.set('logText', r.logText, act.log);
    const pct = `${((s.t / DURATION) * 100).toFixed(2)}%`;
    this.set('fill', r.fill.style, pct, 'width');
    this.set('knob', r.knob.style, pct, 'left');
    this.set('time', r.time, `${mmss(s.t)} / ${mmss(DURATION)}`);
    this.set('aria', r.track, s.t.toFixed(1), 'attr:aria-valuenow');
    this.set('play', r.play, ui.playing ? PAUSE : PLAY, 'innerHTML');
  }
}
