// サソリ(Benthos SC-8)。main.js が読む生き物の決めごと
import { SCRIPT, evaluate, ASSEMBLY_JUMP } from './timeline.js';
import { telemetry } from './telemetry.js';
import { SHOTS } from './shots.js';
import { makeHudSpec } from './hud.js';
import { Scorpion } from './model.js';

export default {
  id: 'scorpion',
  script: SCRIPT,
  evaluate,
  assemblyJump: ASSEMBLY_JUMP,
  shots: SHOTS,
  telemetry,
  makeHud: makeHudSpec,
  createModel: () => new Scorpion(),
  displayDefaults: { labels: true, uv: false, turntable: false },
  env: { snow: false },
};
