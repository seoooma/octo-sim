import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { createStage } from './stage.js';
import { Robot } from './robot/robot.js';
import { Director } from './camera/director.js';
import { Hud } from './ui/hud.js';
import { Labels } from './ui/labels.js';
import { evaluate, DURATION, ACTIONS, ASSEMBLY_JUMP, actionByKey } from './sim/timeline.js';
import { telemetry } from './sim/telemetry.js';

// URL の指定:
//   ?t=10.5     その時刻で止めて 1 枚描く(静止画用。カメラは段取りどおり)
//   ?play=0     止めた状態で始める        ?hud=0  計器を出さない
//   ?ao=0       隅の影なし                ?labels=0 / ?wake=0 / ?exploded / ?turntable  表示の切り替え
//   ?gui        調整のつまみ
const params = new URLSearchParams(location.search);
const fixedTime = params.has('t') ? parseFloat(params.get('t')) : null;
const ui = {
  playing: fixedTime === null && params.get('play') !== '0',
  time: fixedTime ?? 0,
  ao: params.get('ao') !== '0',
  display: {
    labels: params.get('labels') !== '0',
    exploded: params.has('exploded'),
    wake: params.get('wake') !== '0',
    turntable: params.has('turntable'),
  },
};
const anim = { exploded: ui.display.exploded ? 1 : 0, spin: 0 };

const stage = createStage(document.getElementById('app'), { preserve: fixedTime !== null });
const robot = new Robot();
stage.scene.add(robot.group);
const director = new Director(stage.camera, stage.controls);
const labels = new Labels(document.getElementById('labels'));
const hud = params.get('hud') === '0' ? null : new Hud(document.getElementById('hud'), {
  onPlay: () => (ui.playing = !ui.playing),
  onSeek: (t) => {
    ui.time = t;
    director.release();
  },
  onAssembly: (name) => {
    ui.time = ACTIONS[actionByKey(ASSEMBLY_JUMP[name])].t;
    ui.playing = true;
    director.release();
  },
  onDisplay: (key) => (ui.display[key] = !ui.display[key]),
});

if (params.has('gui')) {
  const gui = new GUI();
  gui.add(ui, 'time', 0, DURATION - 0.01, 0.01).listen();
  gui.add(ui, 'playing').listen();
  gui.add(ui, 'ao').name('ambient occlusion');
}

const center = new THREE.Vector3();

function frame(dt, immediate = false) {
  if (ui.playing) ui.time = (ui.time + dt) % DURATION;
  const s = evaluate(ui.time);
  // 分解図と回転台は、押したらなめらかに切り替える
  const k = immediate ? 1 : 1 - Math.exp(-dt * 3);
  anim.exploded += ((ui.display.exploded ? 1 : 0) - anim.exploded) * k;
  if (ui.display.turntable) anim.spin += dt * 0.35;
  robot.update(s, { exploded: anim.exploded, wake: ui.display.wake, spin: anim.spin });
  director.update(s, robot.group.position, dt, immediate);
  stage.render(ui.ao);
  center.set(0, -0.2, 0);
  robot.group.localToWorld(center);
  labels.update(stage.camera, ui.display.labels ? robot.labelSets[s.act.labels] : null, s.act.labels, s.labelFade, center);
  hud?.update(s, telemetry(s, robot.arms), ui);
}

if (fixedTime !== null) {
  frame(0, true);
  frame(0, true);
  requestAnimationFrame(() => (window.__ready = true));
} else {
  const timer = new THREE.Timer();
  timer.connect(document);   // タブが隠れているあいだは時間を進めない
  let first = true;
  stage.renderer.setAnimationLoop((now) => {
    timer.update(now);
    frame(Math.min(timer.getDelta(), 0.1), first);
    first = false;
  });
}
