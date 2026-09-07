import { CANVAS_HEIGHT, CANVAS_WIDTH } from './config';
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
  const stockContainer = document.getElementById('stock-container')!;
  const stockLabel = document.getElementById('stock-label')!;
  const stockBlocks = [
    document.getElementById('stock-1')!,
    document.getElementById('stock-2')!,
    document.getElementById('stock-3')!,
  ];

  const input = new Input(canvas);
  const sound = new Sound();
  const game = new GameManager(sound);

  let lastTime = performance.now();

  function gameLoop(currentTime: number): void {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    game.update(dt, input);
    game.draw(ctx);

    updateHUD();

    requestAnimationFrame(gameLoop);
  }

  function updateHUD(): void {
    hudStage.textContent = `STAGE ${game.stage} / 10`;
    hudScore.textContent = `SCORE: ${game.score}`;

    if (game.phase === 'TETRIS') {
      hudPhase.className = 'hud-phase phase-tetris';
      hudPhase.textContent = `TETRIS (REMAINING: ${game.remainingPiecesCount})`;
      stockContainer.style.display = 'flex';
      stockLabel.textContent = `ACTIVE: [${game.activePieceIndex + 1}] | DROP: ${game.remainingPiecesCount}/3`;

      // 各ミノの確定状態
      game.fallingPieces.forEach((p, idx) => {
        if (stockBlocks[idx]) {
          if (p.settled) {
            stockBlocks[idx].className = 'stock-block spent';
          } else if (idx === game.activePieceIndex) {
            stockBlocks[idx].className = 'stock-block';
            stockBlocks[idx].style.background = '#00ffff';
            stockBlocks[idx].style.borderColor = '#ffffff';
          } else {
            stockBlocks[idx].className = 'stock-block';
            stockBlocks[idx].style.background = '#00ffaa';
            stockBlocks[idx].style.borderColor = '#66ffcc';
          }
        }
      });
    } else {
      hudPhase.className = 'hud-phase phase-shooting';
      hudPhase.textContent = `GALAGA BATTLE (${Math.ceil(game.shootingTimeLimit)}s)`;
      stockContainer.style.display = 'none';
    }
  }

  requestAnimationFrame(gameLoop);
});
