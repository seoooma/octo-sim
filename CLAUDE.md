# octo-sim — 作業ルール(Claude Code 向け)

タコ型ロボットの 3D シミュレーター風 Web ページ(three.js)。真ん中に 3D のロボット、まわりに計器の UI。
見本は bilibili の「Pelagos OC-8」の画面(2026-11-03 にユーザーが 2 枚の画像で見せた。白い外装・オレンジの差し色・8 本の腕・外套が開く)。形は真似るが、名前やロゴは自分たちのものにする。
ユーザーは日本語で話す。返事・コミットメッセージ・コード中のコメントは日本語で書く。画面の文字は英語(見本と同じ)。
粒子の動画(~/particle)・2D 物理ショート(~/shorts2d)とは別のプロジェクト。

**公開ページ: https://seoooma.github.io/octo-sim/**(GitHub の公開リポジトリ seoooma/octo-sim。2026-11-03 にユーザーが「公開リポジトリで良い」と決めた)。`main` に push すると `.github/workflows/pages.yml` が約1分で出し直す。ユーザーは Mac の前にいないことが多いので、確認はこのページと Release の静止画で。

## 構成(2026-11-03 にユーザーが選んだ: Blender ではなく three.js、動画ではなく Web ページ。2026-11-04: 生き物を増やす・同じページで切り替え・色は全部同じ)
- Vite + three.js(0.187 に固定)。ビルドなしで `npm run dev` がそのまま動く。
- **状態は「台本の時刻 t だけで決まる」**。シーク・`?t=` の静止画・ループで同じ絵になる。例外はタコの腕のやわらかさ(前のコマから積み上げる。時刻が飛んだら `main.js` の `warmup` が 4 秒前から走らせ直す)。
- 共通(src/):
  - `main.js` つなぎ(生き物を選ぶ `SPECIES`・時刻を進める・表示の切り替え・URL・キーボード)
  - `stage.js` 描画の準備・光・床(FLOOR_Y = -2.2)・背景の軌道の線・漂う粒・仕上げ(GTAO)
  - `director.js` カメラの段取り(生き物の shots を使う)。手で回すと再生中は 4 秒、止めているあいだはずっと保つ
  - `core/timeline.js` 台本の道具(keys: 時刻の並びをなめらかにつなぐ、makeScript、labelFadeAt)
  - `ui/hud.js` 計器の画面(上の帯・POWER・ASSEMBLIES・DISPLAY・SUBSYSTEMS・タイムライン・SPECIMEN の切り替え)、`ui/widgets.js` 差し替えの部品(横棒 barsWidget・姿勢計 attitudeWidget・図つきの数字 chartWidget)。左の上 a・左の下 c・右の上 d の枠に生き物ごとの部品を入れる。`ui/labels.js` 引き出し線
  - `materials.js` 色と材質(全部の生き物で同じ)
- 生き物(src/creatures/<名前>/)。`index.js` が決めごとを出す: script(ACTIONS・DURATION)・evaluate(t)・assemblyJump・shots・telemetry(s, model)・makeHud()・createModel()・displayDefaults・env
  - モデルの決めごと: `group`(シーンに足す。回転台はこれを回す)・`world`・`labelSets`・`update(s, d, { dt, reset, camera, draw })`(draw=false は助走なので軽く)・`center(out)`(引き出し線の中心)・`focus`(カメラが追う点。なければ group.position)
- **タコ(octopus, Benthos BX-8)**: 25 秒・8 操作
  - `timeline.js` 台本、`swim.js` 泳ぎ(体の位置と向き)、`telemetry.js`、`shots.js`、`hud.js`(JET・ARM CURL・DEPTH)
  - `robot.js` 組み立て、`body.js` 胴(花びら 8 枚・目)、`core.js` 中の機械、`beak.js`、`siphon.js` 噴射口と泡、`arms.js` 腕(輪・車輪・ばね・やわらかさ)
  - 泳ぎ(2026-11-04 ユーザー「泳ぎ方が硬い、滑らかに」): 道は弧、頭は進む向き、速さは噴射の脈で押して惰性で滑る。止まる前は腕を傘に。泡は水に残る
  - **腕の名前はロボットから見た左右**: R1〜R4 はロボットの右(画面では左、-x)、L1〜L4 は左(+x)
- **蜘蛛(spider, Benthos AX-8)**: 32 秒・7 操作(2026-11-04 ユーザーが選んだ見せ場: 歩く・巣を張る)。床を歩いて入る → その場で回って目の走査 → 糸いぼを開いて引き糸を輪のてっぺんへ → 糸を巻き上げて真ん中へ(お尻を上に) → その場で 1 回りしながら縦糸 11 本を打つ → 渦巻きに歩きながら横糸を張る → 真ん中へ帰って頭を下に
  - `layout.js` 寸法(輪 WEB・縦糸・横糸・脚の付け根と足を置く場所・脚の長さ)、`path.js` 体の道と足の運び、`web.js` 輪と糸、`model.js` 形と IK、`timeline.js`・`telemetry.js`・`hud.js`(GAIT の図・LEG LOAD・STANCE)・`shots.js`
  - 歩き方(path.js): 面(床・巣)の上を「位置 + 向き」で動かし、歩数の元 g = 進んだ道のりと向きの変わり。脚の位相 = g / 歩幅 + ずらし(交互の 4 本ずつ)。前半 6 割は足を面に置き、後半で次へ運ぶ。置く場所は「その立脚の真ん中の時刻に体がいる場所での、ふだんの足の位置」。止まると運んでいる足も下ろす(activityAt)
  - 関節(model.js): 足から上・付け根側へ足首を決め、付け根〜足首を 2 本の骨の IK で解く(膝は体の上へ)。確かめ: `node tools/check/spider_gait.mjs`(足のすべり・付け根から足までの距離・歩く速さ)
- 名前は自分たちのもの(Benthos BX-8 / AX-8、BENTHOS ROBOTICS)。見本の Pelagos OC-8 は使わない
- 見た目は見本に合わせた(2026-11-03 のレビューで画素を測って): 白い殻・暗い金属・オレンジは控えめ・背景は暖かい白

## 脚で歩く・脚の形の共通の道具(2026-11-04)
- `src/core/walk.js`: 道(makePath・makeProgress・bezierPoints・headingOn)、歩数の元の表(makeGait)、面(FLOOR・verticalPlane)、足の運び(makeWalker: legPhase・footAt・activityAt・bodyOnSurface)
- `src/core/limbs.js`: 楕円体の殻の板(plates)・リベット・目・脚の節(segment)・2 本の骨の IK(solve2)・節を置く(place)・3 節の脚(buildLeg・poseLeg)
- 蜘蛛は両方を使う。サソリ・カニも使う

## 新しい生き物を足す
1. `src/creatures/<名前>/` に index.js(上の決めごと)と、台本・モデル・計器・構図を作る。蜘蛛を見本にする(脚で歩く物は path.js の歩き方を、腕がなびく物はタコの arms.js を使い回す)
2. `main.js` の `SPECIES` に 1 行足す(`?creature=<名前>` と SPECIMEN のボタンになる)
3. 静止画(`?creature=<名前>&t=…`)と `tools/clip.mjs` の動きで確かめ、`tools/ui_check.mjs` が通ることを見る
- 次の候補(2026-11-04 にユーザーが選んだ): サソリ・カニ・クラゲ

## コマンド
- 準備: `npm install`
- 見る: `npm run dev` → http://localhost:5173(`--host` なので同じ Wi-Fi のスマホからも Mac の IP で開ける)
- URL の指定: `?creature=spider`(生き物)、`?t=10.5`(その時刻で止めて 1 枚描く)、`?play=0`、`?hud=0`(計器なし)、`?ao=0`(隅の影なし)、`?labels=0` `?exploded` `?turntable` など(表示の切り替え。生き物の DISPLAY の key)、`?snow=0`、`?gui`(調整のつまみ)
- 静止画: `node tools/shot.mjs out/a.png 't=7.9' out/b.png 't=16.6'`(Vite を立ち上げ、Mac の Chrome をヘッドレスで開いて撮る。人に見せる絵は `SHOT_SCALE=2`、スマホの大きさは `SHOT_W=390 SHOT_H=844`)。台本の見どころ: タコ 1 JETTING・5 HOLDING・7.9 MANTLE・11 ARM R2・13.6 OPTICS・16.6 BEAK・19.8 SIPHON・23.5 DEPARTING、蜘蛛 2.4 WALKING・6.6 PIVOT SCAN・9.6 SPINNERETS・12.2 ASCENDING・17 RADIAL LINES・23 SPIRAL WEAVE・31.4 WEB COMPLETE
- 速さ: `node tools/fps.mjs '' 5`(コマ/秒と、ページのエラー・警告)
- 動きの確かめ: `node tools/clip.mjs out/a.mp4 14.4 2.4 'hud=0' 15`(開始の秒・長さ・追加のクエリ・コマ/秒。1 コマずつ進めて撮るので実時間より遅いが動きは正しい。並べた一覧 out/a.sheet.png も作る)
- 操作: `node tools/ui_check.mjs`(ASSEMBLIES・タイムライン・一時停止・EXPLODED・生き物の切り替えが効くか。だめなら終了コード 1)

## 進め方(2026-11-03)
1. 胴と腕の形(v1)
2. 台本・計器・中の機械・引き出し線(v2: 見本の 5 枚の画面に寄せた。2026-11-03 にユーザーが「コード量を増やして拡充」と依頼)
3. 動きのやわらかさ(v3: 腕のばね・噴射の脈・しぐさ・目)。伸び縮みはしない
4. レビュー(2026-11-03、ユーザーの依頼「レビュアーを何人か立てて直す」): 動き・見た目・画面と操作・コードの 4 人。直しは 3 つのコミット(不具合と操作 → 動き → 見た目)に分けた
5. 泳ぎを滑らかに(2026-11-04): 弧の道・脈で押して惰性で滑る・腕のうねり・ブレーキで傘・泡の跡・水の粒
6. 生き物を増やす(2026-11-04): 共通の部分と生き物の部分に分けた。蜘蛛(歩く・巣を張る)を足した
7. これから: ユーザーの返事を見て直す。静止画を見ながら少しずつ決める

## レビューの回し方(2026-11-03 に決めた)
- 撮影・動画は自分(親)が 1 つずつ作って `out/review/` に置く(静止画 pc_01〜08、スマホ縦横、動きのコマ並べ `tools/clip.mjs` の sheet)。
- レビュアー(Agent を並べて起動)はファイルを書き換えず、ブラウザ・Vite・tools も動かさない(M2・8GB で並べると重い)。画像とコードを読むだけ。見本の画像の場所も渡す。
- 返ってきた指摘は「不具合・操作」「動き」「見た目」に分けて直し、分けてコミットする(見た目はあとで戻せるように)。

## 守ること
1. **画像・動画の生成物を git に入れない**(`.gitignore` 済み: out/ *.png *.mp4 など)。1MB を超えるバイナリもコミットしない。
2. **確認はまず公開ページ**(push して `gh run watch` で出し終わるのを待ち、`SHOT_BASE=https://seoooma.github.io/octo-sim/ node tools/shot.mjs ...` で本当に出たか撮って見る)。静止画・動画は GitHub Release「previews」に置き、URL をチャットで伝える。
3. **履歴の書き換え・force-push は、その都度ユーザーの許可を取る。**
4. 作業は `main` へ(ブランチ・PR は使っていない)。コミットは意味のある単位で。
5. **完了と言う前に、静止画を撮って自分で見る**(`tools/shot.mjs`)。`tools/fps.mjs` でエラー・警告が出ないことも見る。
6. ブラウザを使う道具(shot・clip・fps・ui_check)は `/tmp/octo-sim-browser.lock` を順番に取る(いくつかの作業を並べても、Chrome は同時に 1 つ)。

## 落とし穴(作った人が見つけたこと)
- `PCFSoftShadowMap` は削除済み(警告が出て PCF になる)。`PCFShadowMap` と `shadow.radius` を使う。`THREE.Clock` は非推奨で、`THREE.Timer` を使う。
- 同じ並びの部品(輪の白い筒・黒い部品・赤い車輪)は、InstancedMesh の `instanceMatrix` を共有している。1 回書けば全部動く。
- GTAO は `radius` と `thickness` を大きくすると、上から見たとき腕の横の床にぼやけた黒い影が出る(radius 0.45・thickness 0.8 で消えた)。
- ヘッドレスの Chrome でも Metal の GPU で WebGL が動く(M2 で 1600×900・GTAO ありで 60 コマ/秒)。
- 外套の花びらは「蝶番の横の接線」を軸に回す。開く向き(符号)は作るときに上の点が中心から離れるかで決めている。開いたとき目の筒の裏が見えないよう、一番下の段の内側に黒い壁と底がある(目の筒は短くしてその外に収める)。
- 泡は半透明なので `depthWrite: false`(GTAO で黒い玉に見えないように)。
- 引き出し線は計器より下の層。文字は Hud が測った「パネルのない四角」(`hud.freeRect`)の中に収める。
- EffectComposer に RT を渡すと、各パスが「描画バッファの幅 × 画素比」(画素比の 2 乗)で作られる。作ったあと `composer.setSize(innerWidth, innerHeight)` を呼ぶ。
- 背景の色も OutputPass の色の調子(Neutral)を通るので暗くなる。暖かい白は線形で 1 より明るい値(`setRGB(3.0, 2.9, 2.75)`)を置く。`?ao=0`(直接描く)では白に飛ぶ。
- タイムラインは `touch-action: none` と pointercancel / lostpointercapture で終わりを拾う(スマホでこすりを取られないように)。
