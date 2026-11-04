# octo-sim

生き物をメカにしたロボットの 3D シミュレーター風 Web ページ(three.js)。左上の SPECIMEN で切り替える。

- タコ(Benthos BX-8): 25 秒・8 操作(噴射で入る → 停止 → 外套を開く → 腕をばらす → 目の走査 → くちばし → 噴射口の試験 → 出ていく)
- 蜘蛛(Benthos AX-8, `?creature=spider`): 32 秒・7 操作(歩いて入る → 目の走査 → 糸いぼ → 引き糸を登る → 縦糸を打つ → 横糸を張る → 真ん中で待つ)
- サソリ(Benthos SC-8, `?creature=scorpion`): 31 秒・7 操作(歩いて入る → はさみで威嚇 → 尾を反らす → 2 回刺す → 紫外線で継ぎ目が光る → 箱をはさむ → 歩き去る)
- カニ(Benthos CR-10, `?creature=crab`): 31 秒・7 操作(横歩きで入る → 目の柄を立てる → はさみを掲げる → 団塊をつまんで口へ → 甲羅が開いて中の機械 → 泡 → 横歩きで去る)
- クラゲ(Benthos JL-1, `?creature=jellyfish`): 30 秒・8 操作(沈んで入る → 傘の脈で泳ぐ → 触手の網 → 口腕 → 光の波 → 傘が開いて中の機械 → 驚いて逃げる → 上へ去る)

公開: https://seoooma.github.io/octo-sim/

```
npm install
npm run dev        # http://localhost:5173
```

- URL の指定: `?creature=spider`(scorpion・crab・jellyfish)、`?t=10.5`(止めた 1 枚)、`?play=0`、`?hud=0`、`?ao=0`、`?labels=0`、`?wake=0`、`?exploded`、`?turntable`、`?gui`
- 静止画: `node tools/shot.mjs out/a.png 't=7.9'`(Mac の Chrome を使う)
- 速さとエラー: `node tools/fps.mjs`、画面の操作: `node tools/ui_check.mjs`

作業のルールと構成は CLAUDE.md。
