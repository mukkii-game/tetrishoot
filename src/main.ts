import { CANVAS_HEIGHT, CANVAS_WIDTH, SHOOTING_TIME_SECONDS, TETRIS_TIME_SECONDS } from './config';
import { GameManager } from './core/GameManager';
import { Input } from './core/Input';
import { Sound } from './core/Sound';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  // HUD要素
  const hudStage = document.getElementById('hud-stage')!;
  const hudPhase = document.getElementById('hud-phase')!;
  const hudScore = document.getElementById('hud-score')!;
  const timerBar = document.getElementById('timer-bar')!;

  const input = new Input(canvas);
  const sound = new Sound();
  const game = new GameManager(sound);

  let lastTime = performance.now();

  function gameLoop(currentTime: number): void {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1); // 最大フレーム時間を防ぐ
    lastTime = currentTime;

    // ゲーム更新と描画
    game.update(dt, input);
    game.draw(ctx);

    // HUDの更新
    updateHUD();

    requestAnimationFrame(gameLoop);
  }

  function updateHUD(): void {
    hudStage.textContent = `STAGE ${game.stage} / 10`;
    hudScore.textContent = `SCORE: ${game.score}`;

    if (game.phase === 'TETRIS') {
      hudPhase.className = 'hud-phase phase-tetris';
      hudPhase.textContent = `TETRIS TIME (${Math.ceil(game.phaseTimer)}s)`;
      timerBar.style.background = '#00ffaa';
      const pct = Math.max(0, (game.phaseTimer / TETRIS_TIME_SECONDS) * 100);
      timerBar.style.width = `${pct}%`;
    } else {
      hudPhase.className = 'hud-phase phase-shooting';
      hudPhase.textContent = `SHOOTING TIME (${Math.ceil(game.phaseTimer)}s)`;
      timerBar.style.background = '#ff507a';
      const pct = Math.max(0, (game.phaseTimer / SHOOTING_TIME_SECONDS) * 100);
      timerBar.style.width = `${pct}%`;
    }
  }

  requestAnimationFrame(gameLoop);
});
