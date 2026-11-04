// カニ(Benthos CR-10)。main.js が読む生き物の決めごと
import { SCRIPT, evaluate, ASSEMBLY_JUMP } from './timeline.js';
import { telemetry } from './telemetry.js';
import { SHOTS } from './shots.js';
import { makeHudSpec } from './hud.js';
import { Crab } from './model.js';

export default {
  id: 'crab',
  script: SCRIPT,
  evaluate,
  assemblyJump: ASSEMBLY_JUMP,
  shots: SHOTS,
  telemetry,
  makeHud: makeHudSpec,
  createModel: () => new Crab(),
  // 表示の切り替えの初めの値(URL の ?shell=0 などで変えられる)。SHELL を消すと甲羅を外して中を見せる
  displayDefaults: { labels: true, bubbles: true, shell: true, turntable: false },
  env: { snow: true },   // 浅い海の底: 漂う粒
};
