# octo-sim — 作業ルール(Claude Code 向け)

タコ型ロボットの 3D シミュレーター風 Web ページ(three.js)。真ん中に 3D のロボット、まわりに計器の UI。
見本は bilibili の「Pelagos OC-8」の画面(2026-11-03 にユーザーが 2 枚の画像で見せた。白い外装・オレンジの差し色・8 本の腕・外套が開く)。形は真似るが、名前やロゴは自分たちのものにする。
ユーザーは日本語で話す。返事・コミットメッセージ・コード中のコメントは日本語で書く。画面の文字は英語(見本と同じ)。
粒子の動画(~/particle)・2D 物理ショート(~/shorts2d)とは別のプロジェクト。

**公開ページ: https://seoooma.github.io/octo-sim/**(GitHub の公開リポジトリ seoooma/octo-sim。2026-11-03 にユーザーが「公開リポジトリで良い」と決めた)。`main` に push すると `.github/workflows/pages.yml` が約1分で出し直す。ユーザーは Mac の前にいないことが多いので、確認はこのページと Release の静止画で。

## 構成(2026-11-03 にユーザーが選んだ: Blender ではなく three.js、動画ではなく Web ページ)
- Vite + three.js(0.187 に固定)。ビルドなしで `npm run dev` がそのまま動く。
- `src/main.js` 描画・光・床・仕上げ(GTAO の隅の影)・URL の指定・時間の進め方
- `src/body.js` 胴(外套の花びら 8 枚 × 横 4 段・リベット・目・首輪・腹・噴射口)。座標は胴の中心が原点、y が上、正面 +z、外套の半径 1
- `src/arms.js` 腕。中心線を付け根から「曲がり具合」を足して作り(腹側へ bend・横へ side・先の巻き curl)、その上に輪とばねを並べる。腕の名前は R1〜R4(右の前から後ろ)・L1〜L4
- `src/materials.js` 色と材質

## コマンド
- 準備: `npm install`
- 見る: `npm run dev` → http://localhost:5173(`--host` なので同じ Wi-Fi のスマホからも Mac の IP で開ける)
- URL の指定: `?t=2.5`(その時刻で止めて 1 枚描く)、`?view=front|diag|top|side|eye`、`?curl=0〜1`、`?ao=0`(隅の影なし)、`?gui`(調整のつまみ)、`?turntable`
- 静止画: `node tools/shot.mjs out/a.png 't=2' out/b.png 't=2&view=diag'`(Vite を立ち上げ、Mac の Chrome をヘッドレスで開いて撮る。人に見せる絵は `SHOT_SCALE=2`)
- 速さ: `node tools/fps.mjs '' 5`(コマ/秒と、ページのエラー・警告)

## 進め方(2026-11-03 にユーザーに出した段取り。静止画を見ながら少しずつ決める)
1. 胴と腕の形(v1 済み)
2. 腕の巻きの動き(ARM CURL 0〜100%)
3. UI の枠(左右のパネル・ゲージ・下のタイムライン)
4. 操作(外套を開く・分解図・腕を 1 本だけ目立たせる・TURNTABLE)と、25 秒の台本
5. 公開(GitHub Pages、済み。2026-11-03)

## 守ること
1. **画像・動画の生成物を git に入れない**(`.gitignore` 済み: out/ *.png *.mp4 など)。1MB を超えるバイナリもコミットしない。
2. **確認はまず公開ページ**(push して `gh run watch` で出し終わるのを待ち、`SHOT_BASE=https://seoooma.github.io/octo-sim/ node tools/shot.mjs ...` で本当に出たか撮って見る)。静止画・動画は GitHub Release「previews」に置き、URL をチャットで伝える。
3. **履歴の書き換え・force-push は、その都度ユーザーの許可を取る。**
4. 作業は `main` へ(ブランチ・PR は使っていない)。コミットは意味のある単位で。
5. **完了と言う前に、静止画を撮って自分で見る**(`tools/shot.mjs`)。`tools/fps.mjs` でエラー・警告が出ないことも見る。

## 落とし穴(作った人が見つけたこと)
- `PCFSoftShadowMap` は削除済み(警告が出て PCF になる)。`PCFShadowMap` と `shadow.radius` を使う。`THREE.Clock` は非推奨で、`THREE.Timer` を使う。
- 同じ並びの部品(輪の白い筒・黒い部品・赤い車輪)は、InstancedMesh の `instanceMatrix` を共有している。1 回書けば全部動く。
- GTAO は `radius` と `thickness` を大きくすると、上から見たとき腕の横の床にぼやけた黒い影が出る(radius 0.45・thickness 0.8 で消えた)。
- ヘッドレスの Chrome でも Metal の GPU で WebGL が動く(M2 で 1600×900・GTAO ありで 60 コマ/秒)。
