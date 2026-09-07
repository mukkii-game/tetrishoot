# テトリシュー (TETRISHOOT) AI 引き継ぎ資料 (HANDOFF.md)

本ドキュメントは、次回セッションや他のAIモデル（Claude 3.7 / Opus 等）が作業を継続・発展させるための引き継ぎリファレンスです。

---

## 1. プロジェクト基本情報

- **配置先**: `E:\ゲーム企画\tetrishoot`
- **公開URL**: https://mukkii-game.github.io/tetrishoot/
- **GitHub**: https://github.com/mukkii-game/tetrishoot
- **技術選定**: Vite 6, TypeScript 5, HTML5 Canvas 2D, Web Audio API
- **動作方法**:
  ```bash
  cd "E:\ゲーム企画\tetrishoot"
  npm run dev
  ```
  ブラウザで `http://localhost:5173/` にアクセスしてプレイ可能。
- **デプロイ方法**:
  - `main` ブランチにプッシュするだけで、GitHub Actions（`.github/workflows/deploy.yml`）が自動でビルド＆GitHub Pages にデプロイします。

---

## 2. ディレクトリ・主要ファイル構成

```
E:\ゲーム企画\tetrishoot/
├── index.html                   # キャンバス・HUD・UIオーバーレイ・操作ガイド
├── package.json                 # scripts: dev, build, preview
├── tsconfig.json                # TypeScript設定
├── vite.config.ts               # base: './'（GitHub Pages相対パス対応）
├── .github/workflows/deploy.yml # GitHub Pages 自動デプロイパイプライン
├── SPECIFICATION.md             # ゲーム設計・仕様書
├── HANDOFF.md                   # 本ファイル（引き継ぎ書）
├── README.md                    # リポジトリ概要・遊び方
└── src/
    ├── main.ts                  # エントリーポイント、HUD同期、60FPSゲームループ
    ├── config.ts                # 画面サイズ(540x720)、ブロック幅(30px)、時間(15s)等の定数
    ├── core/
    │   ├── GameManager.ts       # テトリスタイム(ミノ操作&接触即確定) ⇄ シューティング(上下左右自機)
    │   ├── Input.ts             # 単押し(justPressed)・キーリピート・マウス操作管理
    │   ├── Sound.ts             # Web Audio API シンセ（BGM2種＋全SE）
    │   └── Starfield.ts         # ギャラガ風多重スクロール宇宙背景
    ├── entities/
    │   ├── Tetromino.ts         # 7種ミノ定義、端点(入口・出口)幾何学的算出、マズル描画、HP
    │   ├── Player.ts            # 自機、上下左右移動、塞がり判定付き射撃、パーツ被弾破壊
    │   ├── Enemy.ts             # ギャラガ風エイリアン（BEE, BUTTERFLY, BOSS）、編隊LOOP_DIVE
    │   ├── Bullet.ts            # 多方向回転極太自機弾、敵弾
    │   └── Wall.ts              # 左右永久壁、およびドッキングされた防壁ミノ管理
    └── effects/
        └── Particle.ts          # 爆発、火花、ドッキング光彩パーティクル
```

---

## 3. 実装済みの重要メカニクス

1. **テトリスタイム（15秒）**:
   - 画面上部からテトリミノが1つずつ出現し、プレイヤーがテトリスとして操作（←/→移動、↑/Space回転、↓高速落下）。
   - **接触即確定**: 自機（上または左右）に接触した瞬間に自機とドッキング確定！壁に接触した瞬間に防壁として確定！
   - ゴーストミノ（着地予測の薄い枠線）も描画。
2. **シューティングタイム（15秒）**:
   - 自機は **上下左右（WASD / 矢印 / マウス）** に自由に移動可能！
   - **入口と出口からの極太弾**: 各ミノの端点セルから外側方向（上下左右）へ発射。
   - **塞がり判定**: 弾の出る先の隣接マスが自機の別のブロックや壁で塞がれている場合は不発。露出している場合のみ発射！
   - ギャラガ風エイリアン（宙返りループダイブ、サイン波、突進、ボス）。
   - 被弾パーツ破壊（HP=2）と全滅ゲームオーバー。
3. **ゲーム進行**:
   - 1面（30秒）×10面構成。5面と10面に大型ボス出現。

---

## 4. 今後の推奨拡張・ブラッシュアップ項目（アイデア）

次に作業するAIまたは開発者は以下のタスクを検討してください：

1. **ギャラガのトラクタービーム要素**:
   - ボスエイリアンがトラクタービームを照射し、自機のミノを1個吸い取って強奪するギミック。
   - ボスを倒すとそのミノを奪還できる演出。
2. **ミノのホールド機能**:
   - テトリスタイム中に `[Shift]` または `[C]` で現在のミノをキープ（ホールド）できる機能。
3. **オンライン/ローカルランキング**:
   - `localStorage` を用いたハイスコア記録とベストステージ記録の保存。
4. **WebGL / Bloomポストプロセス**:
   - ネオン発光（Glow/Bloom）シェーダーを適用し、さらにレトロサイバー感を強調。
