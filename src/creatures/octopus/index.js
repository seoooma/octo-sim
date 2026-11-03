// タコ(Benthos BX-8)。main.js が読む生き物の決めごと
import { SCRIPT, evaluate, ASSEMBLY_JUMP } from './timeline.js';
import { telemetry } from './telemetry.js';
import { SHOTS } from './shots.js';
import { makeHudSpec } from './hud.js';
import { Robot } from './robot.js';

export default {
  id: 'octopus',
  script: SCRIPT,
  evaluate,
  assemblyJump: ASSEMBLY_JUMP,
  shots: SHOTS,
  telemetry,
  makeHud: makeHudSpec,
  createModel: () => new Robot(),
  // 表示の切り替えの初めの値(URL の ?labels=0 などで変えられる)
  displayDefaults: { labels: true, exploded: false, wake: true, turntable: false, soft: true },
  env: { snow: true },   // 水の中の粒
};
