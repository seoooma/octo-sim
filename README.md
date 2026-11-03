# octo-sim

タコ型ロボットの 3D シミュレーター風 Web ページ(three.js)。

```
npm install
npm run dev        # http://localhost:5173
```

- URL の指定: `?view=front|diag|top|side|eye`、`?curl=0〜1`、`?ao=0`、`?gui`、`?turntable`、`?t=2.5`(止めた 1 枚)
- 静止画: `node tools/shot.mjs out/a.png 't=2&view=diag'`(Mac の Chrome を使う)
- 速さとエラー: `node tools/fps.mjs`

作業のルールと構成は CLAUDE.md。
