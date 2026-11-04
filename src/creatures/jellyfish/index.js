// クラゲ(Benthos JL-1)。main.js が読む生き物の決めごと
import { SCRIPT, evaluate, ASSEMBLY_JUMP } from './timeline.js';
import { telemetry } from './telemetry.js';
import { SHOTS } from './shots.js';
import { makeHudSpec } from './hud.js';
import { Jellyfish } from './model.js';

export default {
  id: 'jellyfish',
  script: SCRIPT,
  evaluate,
  assemblyJump: ASSEMBLY_JUMP,
  shots: SHOTS,
  telemetry,
  makeHud: makeHudSpec,
  createModel: () => new Jellyfish(),
  // 表示の切り替えの初めの値(URL の ?glow=0 などで変えられる)。drift: 触手のなびき(切ると今の流れにすぐ向く)
  displayDefaults: { labels: true, glow: true, drift: true, turntable: false },
  env: { snow: true },   // 水の中の粒
};
