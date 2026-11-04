import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { createStage } from './stage.js';
import { Director } from './director.js';
import { Hud } from './ui/hud.js';
import { Labels } from './ui/labels.js';

// 生き物の一覧(SPECIMEN の切り替え)。?creature=spider で選ぶ。ページを読み直して切り替える
const SPECIES = [
  { id: 'octopus', label: 'OCTOPUS', load: () => import('./creatures/octopus/index.js') },
  { id: 'spider', label: 'SPIDER', load: () => import('./creatures/spider/index.js') },
  { id: 'scorpion', label: 'SCORPION', load: () => import('./creatures/scorpion/index.js') },
  { id: 'crab', label: 'CRAB', load: () => import('./creatures/crab/index.js') },
];

// URL の指定:
//   ?creature=octopus  生き物(SPECIES の id)
//   ?t=10.5     その時刻で止めて 1 枚描く(静止画用。カメラは段取りどおり)
//   ?play=0     止めた状態で始める        ?hud=0  計器を出さない
//   ?ao=0       隅の影なし                ?labels=0 / ?exploded / ?turntable … 表示の切り替え(生き物の DISPLAY の key。=0 で消す)
//   ?gui        調整のつまみ              ?snow=0 漂う粒なし
//   ?step=5     1 コマずつ進める(tools/clip.mjs が動画を作るとき)
// キーボード: スペースで再生/一時停止、← → で前後の操作、1〜6 で ASSEMBLIES
const params = new URLSearchParams(location.search);
const species = SPECIES.find((c) => c.id === params.get('creature')) ?? SPECIES[0];
const creature = (await species.load()).default;
const { script, evaluate, telemetry } = creature;
const { ACTIONS, DURATION, actionByKey, actionIndex } = script;
const fixedTime = params.has('t') ? parseFloat(params.get('t')) : null;
const ui = {
  playing: fixedTime === null && params.get('play') !== '0',
  time: fixedTime ?? 0,
  ao: params.get('ao') !== '0',
  scrub: false,      // タイムラインをこすっている最中
  needWarm: false,   // こすり終わった: 腕のやわらかさを助走し直す
  // 表示の切り替え: 生き物の初めの値を、URL の ?key(=0 で消す)で変える
  display: Object.fromEntries(Object.entries(creature.displayDefaults).map(([k, v]) => [k, params.has(k) ? params.get(k) !== '0' : v])),
};
const anim = { exploded: ui.display.exploded ? 1 : 0, spin: 0 };

const stage = createStage(document.getElementById('app'), { preserve: fixedTime !== null, snow: creature.env.snow && params.get('snow') !== '0' });
const robot = creature.createModel();
stage.scene.add(robot.group, robot.world);
const director = new Director(stage.camera, stage.controls, script, creature.shots);
const labels = new Labels(document.getElementById('labels'));

// 操作へ飛ぶ。再生中はその操作の始まり(つなぎから見せる)、止めているときは見どころの時刻へ。再生か一時停止かは変えない
function jumpTo(index) {
  const a = ACTIONS[index];
  ui.time = ui.playing ? a.t : a.peak;
  director.release();
}
const jumpToAssembly = (name) => jumpTo(actionByKey(creature.assemblyJump[name]));
const togglePlay = () => {
  ui.playing = !ui.playing;
  if (ui.playing) director.release();
};

const hudSpec = creature.makeHud();
const ASSEMBLIES = hudSpec.assemblies;
const hud = params.get('hud') === '0' ? null : new Hud(document.getElementById('hud'), hudSpec, script, SPECIES, species.id, {
  onSpecies: (id) => {
    if (id === species.id) return;
    const q = new URLSearchParams(location.search);
    q.set('creature', id);
    q.delete('t');
    location.search = q.toString();
  },
  onPlay: togglePlay,
  onSeek: (t, done) => {
    ui.time = t;
    ui.scrub = !done;
    if (done) ui.needWarm = true;
    director.release();
  },
  onAssembly: jumpToAssembly,
  onDisplay: (key) => (ui.display[key] = !ui.display[key]),
  onResetView: () => director.release(),
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') {
    e.preventDefault();   // 押したボタンがもう一度押されないように
    togglePlay();
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const i = actionIndex(ui.time) + (e.key === 'ArrowRight' ? 1 : -1);
    jumpTo((i + ACTIONS.length) % ACTIONS.length);
  } else if (e.key >= '1' && e.key <= String(ASSEMBLIES.length)) {
    jumpToAssembly(ASSEMBLIES[Number(e.key) - 1]);
  }
});

if (params.has('gui')) {
  const gui = new GUI();
  gui.add(ui, 'time', 0, DURATION - 0.01, 0.01).listen();
  gui.add(ui, 'playing').listen();
  gui.add(ui, 'ao').name('ambient occlusion');
}

const center = new THREE.Vector3();
const WARMUP = 4;      // 時刻が飛んだとき、腕のやわらかさを何秒前から走らせ直すか
const WARM_HZ = 20;    // 助走の刻み(1 秒に何回)
const TAU = Math.PI * 2;
let simTime = null;

const displayState = () => ({ ...ui.display, exploded: anim.exploded, spin: anim.spin });

// 腕のやわらかさは前のコマから積み上げるので、時刻が飛んだら少し前から走らせ直して今の揺れに合わせる。
// 刻みは等分し、最後の 1 刻み(t まで)は呼んだ側が描くときに進める。その刻みの長さを返す
function warmup(t) {
  const d = displayState();
  const t0 = Math.max(0, t - WARMUP);
  const n = Math.max(1, Math.round((t - t0) * WARM_HZ));
  const h = (t - t0) / n;
  robot.update(evaluate(t0), d, { reset: true, draw: false });
  for (let i = 1; i < n; i++) robot.update(evaluate(t0 + i * h), d, { dt: h, draw: false });
  return h;
}

function frame(dt, immediate = false) {
  const advancing = ui.playing && !ui.scrub;
  if (advancing) ui.time = (ui.time + dt) % DURATION;
  // 腕のやわらかさを何秒ぶん進めるか: こすっている間は形に合わせるだけ(軽く)、時刻が飛んだら助走、
  // 止めているあいだは止める(回転台・分解図の切り替え中は動かす)
  const explodeTo = ui.display.exploded ? 1 : 0;
  const jumped = simTime === null || ui.needWarm || Math.abs(ui.time - simTime - (advancing ? dt : 0)) > 0.2;
  let simDt = 0;
  let reset = false;
  if (ui.scrub) reset = true;
  else if (jumped) {
    simDt = warmup(ui.time);
    ui.needWarm = false;
  } else if (advancing || ui.display.turntable || Math.abs(anim.exploded - explodeTo) > 1e-3) simDt = dt;
  simTime = ui.time;
  const s = evaluate(ui.time);
  // 分解図と回転台は、押したらなめらかに切り替える(回転台を切ったら正面へ戻す)
  const k = immediate ? 1 : 1 - Math.exp(-dt * 3);
  anim.exploded += (explodeTo - anim.exploded) * k;
  if (ui.display.turntable) anim.spin += dt * 0.35;
  else anim.spin += (Math.round(anim.spin / TAU) * TAU - anim.spin) * k;
  robot.update(s, displayState(), { dt: simDt, reset, camera: stage.camera });
  director.update(s, robot.focus ?? robot.group.position, dt, immediate, !ui.playing);
  stage.tick(ui.time);
  stage.render(ui.ao);
  robot.center(center);
  labels.update(stage.camera, ui.display.labels ? robot.labelSets[s.act.labels] : null, s.act.labels, s.labelFade, center, hud?.freeRect);
  hud?.update(s, telemetry(s, robot), { playing: ui.playing, display: ui.display, freeView: director.freeView });
}

if (params.has('step')) {
  // 1 コマずつ進める(動画を作る道具 tools/clip.mjs 用)。?step=開始の時刻、window.__advance(dt) で dt 秒進めて描く
  ui.playing = true;
  ui.time = parseFloat(params.get('step')) || 0;
  frame(0, true);
  window.__advance = (dt) => frame(dt);
  window.__ready = true;
} else if (fixedTime !== null) {
  frame(0, true);
  frame(0, true);
  requestAnimationFrame(() => (window.__ready = true));
} else {
  const timer = new THREE.Timer();
  timer.connect(document);   // タブが隠れているあいだは時間を進めない
  let first = true;
  stage.renderer.setAnimationLoop((now) => {
    timer.update(now);
    frame(Math.min(Math.max(timer.getDelta(), 0), 0.1), first);
    first = false;
  });
}
