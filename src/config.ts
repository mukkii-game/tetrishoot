// ゲーム定数と設定
export const CANVAS_WIDTH = 540;
export const CANVAS_HEIGHT = 720;

export const BLOCK_SIZE = 30; // 1ブロックのピクセル幅・高さ
export const GRID_COLS = CANVAS_WIDTH / BLOCK_SIZE; // 18列
export const GRID_ROWS = CANVAS_HEIGHT / BLOCK_SIZE; // 24行

// 壁の列定義
export const LEFT_WALL_COL = 0; // 0列目 (x: 0 ~ 30)
export const RIGHT_WALL_COL = GRID_COLS - 1; // 17列目 (x: 510 ~ 540)

// フェーズ時間（秒）
export const TETRIS_TIME_SECONDS = 15;
export const SHOOTING_TIME_SECONDS = 15;
export const MAX_STAGES = 10;

// 自機パラメータ
export const PLAYER_INITIAL_Y = 20 * BLOCK_SIZE; // 下から4段目付近
export const PLAYER_SPEED = 360; // ピクセル/秒
export const TETROMINO_FALL_SPEED = 140; // テトリスタイム中のミノ落下速度
export const TETROMINO_SPAWN_INTERVAL = 2.0; // ミノ出現間隔（秒）

// 弾パラメータ
export const BULLET_SPEED = 600;
export const BULLET_WIDTH = BLOCK_SIZE * 0.85; // ブロックと同じ太さの極太弾！
export const PLAYER_FIRE_INTERVAL = 0.22; // 自機連射間隔（秒）
export const ENEMY_BULLET_SPEED = 240;
export const ENEMY_BULLET_RADIUS = 6;

// 耐久度
export const PIECE_MAX_HP = 2; // テトリミノパーツの耐久（弾2発で破壊）
export const WALL_PIECE_MAX_HP = 4; // 壁にくっつけた防壁ミノの耐久

// 色定義
export const TETROMINO_COLORS = {
  I: '#00f0f0', // シアン
  J: '#0055ff', // 青
  L: '#ffaa00', // オレンジ
  O: '#ffee00', // 黄色（初期自機）
  S: '#00ee44', // 緑
  T: '#cc00ff', // 紫（3門ショット！）
  Z: '#ff2244', // 赤
  WALL: '#556677', // 防壁
};
