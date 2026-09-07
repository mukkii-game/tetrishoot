/**
 * レトロアーケード風ピクセルテキスト描画
 * Google Fonts の本格ドットフォント「DotGothic16」を使用し、
 * クッキリ美しく読みやすいアーケード画面の文字を描画します。
 */
export function drawMoonCrestaText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  fontSize = 32,
  color = '#00f0ff'
): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontSize}px "DotGothic16", monospace`;

  // 1. 影（暗い下地でクッキリ浮き立たせる）
  ctx.fillStyle = '#001122';
  ctx.fillText(text, centerX + 2, y + 2);
  ctx.fillText(text, centerX + 1, y + 2);

  // 2. メインの鮮やかなピクセル文字
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillText(text, centerX, y);

  ctx.restore();
}
