# octo-sim

タコ型ロボットの 3D シミュレーター風 Web ページ(three.js)。25 秒・8 操作の台本(噴射で入る → 停止 → 外套を開く → 腕をばらす → 目の走査 → くちばし → 噴射口の試験 → 出ていく)と、計器の画面。

公開: https://seoooma.github.io/octo-sim/

```
npm install
npm run dev        # http://localhost:5173
```

- URL の指定: `?t=10.5`(止めた 1 枚)、`?play=0`、`?hud=0`、`?ao=0`、`?labels=0`、`?wake=0`、`?exploded`、`?turntable`、`?gui`
- 静止画: `node tools/shot.mjs out/a.png 't=7.9'`(Mac の Chrome を使う)
- 速さとエラー: `node tools/fps.mjs`、画面の操作: `node tools/ui_check.mjs`

作業のルールと構成は CLAUDE.md。
