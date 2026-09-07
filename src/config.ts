// ゲーム定数と設定（左右の壁を撤廃、オープンな深宇宙へ）
export const CANVAS_WIDTH = 540;
export const CANVAS_HEIGHT = 720;

export const BLOCK_SIZE = 30; // 1ブロックのピクセル幅・高さ
export const GRID_COLS = Math.floor(CANVAS_WIDTH / BLOCK_SIZE); // 18列 (0 ~ 17)
export const GRID_ROWS = Math.floor(CANVAS_HEIGHT / BLOCK_SIZE); // 24行 (0 ~ 23)

// ステージ設定
export const MAX_STAGES = 10;

// 自機パラメータ
export const PLAYER_INITIAL_Y = 19 * BLOCK_SIZE;
export const PLAYER_SPEED = 380; // 上下左右移動速度

// 弾パラメータ
export const BULLET_SPEED = 650;
export const BULLET_WIDTH = BLOCK_SIZE * 0.85; // 極太弾
export const PLAYER_FIRE_INTERVAL = 0.18; // テンポ良い連射間隔

// 耐久度
export const PIECE_MAX_HP = 2; // パーツ耐久（体当たり2回で破壊）

// 色定義
export const TETROMINO_COLORS = {
  I: '#00f0f0', // シアン
  J: '#0055ff', // 青
  L: '#ffaa00', // オレンジ
  O: '#ffee00', // 黄色（初期自機コア）
  S: '#00ee44', // 緑
  T: '#cc00ff', // 紫（3門ショット）
  Z: '#ff2244', // 赤
};
