// 蜘蛛(Benthos AX-8)。main.js が読む生き物の決めごと
import { SCRIPT, evaluate, ASSEMBLY_JUMP } from './timeline.js';
import { telemetry } from './telemetry.js';
import { SHOTS } from './shots.js';
import { makeHudSpec } from './hud.js';
import { Spider } from './model.js';

export default {
  id: 'spider',
  script: SCRIPT,
  evaluate,
  assemblyJump: ASSEMBLY_JUMP,
  shots: SHOTS,
  telemetry,
  makeHud: makeHudSpec,
  createModel: () => new Spider(),
  displayDefaults: { labels: true, silk: true, turntable: false },
  env: { snow: false },
};
