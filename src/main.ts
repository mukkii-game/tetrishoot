import { CANVAS_HEIGHT, CANVAS_WIDTH } from './config';
import { GameManager } from './core/GameManager';
import { Input } from './core/Input';
import { Sound } from './core/Sound';

// ★ デバッグ用：捕捉されなかったエラーを画面上に直接表示する（Macが無くてもiPhone単体で原因が分かるように）。
//   スクリプトの一番最初（DOMContentLoaded より前）で登録するので、初期化中の同期エラーも拾える。
//   通常時は何も表示されず、実害はない。
function showErrorOverlay(message: string): void {
  let box = document.getElementById('__err_overlay');
  if (!box) {
    box = document.createElement('div');
    box.id = '__err_overlay';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#a00;color:#fff;' +
      'font:12px/1.4 monospace;padding:8px;white-space:pre-wrap;word-break:break-all;max-height:50vh;overflow:auto;';
    document.body.appendChild(box);
  }
  const line = document.createElement('div');
  line.textContent = message;
  line.style.cssText = 'border-top:1px solid rgba(255,255,255,0.3);padding-top:4px;margin-top:4px;';
  box.appendChild(line);
}
window.addEventListener('error', (e) => {
  showErrorOverlay(`[error] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  showErrorOverlay(`[promise] ${e.reason}`);
});

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const input = new Input(canvas);
  const sound = new Sound();
  const game = new GameManager(sound);

  // モバイル環境での Web Audio API 再生制限解除（初回タッチ・クリック時にオーディオコンテキストをアクティブ化）
  const unlockAudio = () => {
    sound.resumeAudio();
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('click', unlockAudio);
  };
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('click', unlockAudio, { passive: true });

  // ★ フル画面切替（Fキー／右下ボタン）。itch.io の埋め込み枠でもブラウザ全体で表示できる
  const container = document.getElementById('game-container') as HTMLElement;
  const fsBtn = document.getElementById('fullscreen-btn');
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void container.requestFullscreen();
      }
    } catch (e) {
      console.warn('fullscreen not available:', e);
    }
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
  });

  // ★ ユーザー要望：最初から全画面に。ブラウザはユーザー操作なしのフル画面を許可しないため、
  //   ゲーム開始の最初の操作（クリック／タップ／Space／Enter）の瞬間に一度だけ自動でフル画面を要求する。
  //   その後ユーザーが解除した場合は再要求しない（F キー／ボタンで任意に切替）
  // ★ バグ調査：itch.io（iframe埋め込み）+ スマホで動かないとの報告。
  //   スマホ／iframe埋め込み環境では Fullscreen API の対応がブラウザにより不安定
  //   （iOS Safariは非対応、Android版はiframeに allowfullscreen が無いと拒否される等）で、
  //   万一 requestFullscreen() の呼び出し自体やその周辺処理が例外を投げると、この関数を呼んでいる
  //   タッチイベント自体の処理が壊れ、以降の操作を受け付けなくなる恐れがある。
  //   自動フル画面は「iframeに埋め込まれていない・タッチ主体でない（PC）」場合に限定し、
  //   スマホ／itch.io埋め込み環境では常にスキップして安全側に倒す。
  const isEmbeddedFrame = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const allowAutoFullscreen = !isEmbeddedFrame && !isCoarsePointer;

  let autoFullscreenDone = false;
  const autoFullscreen = () => {
    if (autoFullscreenDone || !allowAutoFullscreen) return;
    autoFullscreenDone = true;
    if (!document.fullscreenElement && container.requestFullscreen) {
      container.requestFullscreen().catch(() => { /* iOS Safari など非対応環境は無視 */ });
    }
  };
  window.addEventListener('pointerdown', autoFullscreen, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') autoFullscreen();
  });
  if (fsBtn) {
    // ゲームの入力（mousedown＝ショット／タッチ操作）に伝播させない
    fsBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    fsBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
    fsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
  }
  // フル画面中：画面に収まる 3:4 の最大サイズを CSS 変数で渡す
  const updateFullscreenSize = () => {
    if (!document.fullscreenElement) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
    container.style.setProperty('--fs-w', `${Math.floor(CANVAS_WIDTH * scale)}px`);
    container.style.setProperty('--fs-h', `${Math.floor(CANVAS_HEIGHT * scale)}px`);
  };
  document.addEventListener('fullscreenchange', () => {
    if (fsBtn) fsBtn.textContent = document.fullscreenElement ? '🡼' : '⛶';
    updateFullscreenSize();
  });
  window.addEventListener('resize', updateFullscreenSize);

  let lastTime = performance.now();

  function gameLoop(currentTime: number): void {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    game.update(dt, input);
    game.draw(ctx);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
