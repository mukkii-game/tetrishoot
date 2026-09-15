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
    // ★ pointer-events:none は必須。これが無いとエラーバーが画面上部のタップを吸い込み、
    //   「表示はされるがタップに反応しない」状態をデバッグ表示自身が作ってしまう。
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#a00;color:#fff;' +
      'font:12px/1.4 monospace;padding:8px;white-space:pre-wrap;word-break:break-all;max-height:50vh;' +
      'overflow:hidden;pointer-events:none;';
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

// ★ 自動キャッシュ復旧：itch.io は butler で更新しても index.html の URL が変わらないため、
//   端末／CDN に古い index.html が残ると、そこから参照される古いハッシュ付きJSを
//   いつまでも実行し続けてしまう（「直したはずなのに直らない」の正体）。
//   起動時に version.json を no-store で取得し、自分のビルドIDと食い違っていたら
//   ?v=<新しいID> を付けて読み直す。URL が変わるので必ず新しい実体が取得される。
//   無限リロードを防ぐため、既に同じIDで読み直している場合は何もしない。
function checkForNewerBuild(): void {
  try {
    const probe = new URL('version.json', document.baseURI);
    probe.searchParams.set('_', String(Date.now()));
    void fetch(probe.toString(), { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { build?: string } | null) => {
        const latest = data && typeof data.build === 'string' ? data.build : null;
        if (!latest || latest === __BUILD_ID__) return;
        const here = new URL(window.location.href);
        if (here.searchParams.get('v') === latest) return; // すでに読み直し済み
        here.searchParams.set('v', latest);
        window.location.replace(here.toString());
      })
      .catch(() => { /* オフライン等は無視 */ });
  } catch {
    /* 何があってもゲーム本体には影響させない */
  }
}
checkForNewerBuild();

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  // ★ 性能：alpha: false で不透明キャンバスにする。
  //   透明キャンバスはブラウザが毎フレーム背景と合成する必要があり、
  //   スマホのGPUでは特に不利。背景は元々ほぼ黒なので見た目は変わらない。
  const ctx = (canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d'))!;

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const input = new Input(canvas);
  const sound = new Sound();
  const game = new GameManager(sound);

  // モバイル環境での Web Audio API 再生制限解除（タッチ・クリック時にオーディオコンテキストをアクティブ化）
  // ★ リスナーは外さない。iOS では着信・バックグラウンド復帰・最初の resume() 失敗などで
  //   AudioContext が再び suspended に戻ることがあり、一度きりの解除だと無音のままになる。
  //   毎回の操作で（既に running なら何もしないので）安全に再解除できるようにしておく。
  const unlockAudio = () => sound.resumeAudio();
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('click', unlockAudio, { passive: true });

  // ★ フル画面切替（Fキー／右下ボタン）。itch.io の埋め込み枠でもブラウザ全体で表示できる
  const container = document.getElementById('game-container') as HTMLElement;
  const fsBtn = document.getElementById('fullscreen-btn');
  // iPhone の Safari は要素のフル画面に非対応（document.fullscreenEnabled === false）。
  // 押しても何も起きないボタンが画面右下＝ショット領域に居座ってタップを食うだけなので消す。
  const fullscreenSupported = !!document.fullscreenEnabled && typeof container.requestFullscreen === 'function';
  if (fsBtn && !fullscreenSupported) fsBtn.style.display = 'none';

  const toggleFullscreen = () => {
    if (!fullscreenSupported) return;
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => { /* 非対応環境は無視 */ });
      } else {
        void container.requestFullscreen().catch(() => { /* 非対応環境は無視 */ });
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
  const allowAutoFullscreen = !isEmbeddedFrame && !isCoarsePointer && fullscreenSupported;

  let autoFullscreenDone = false;
  const autoFullscreen = () => {
    if (autoFullscreenDone || !allowAutoFullscreen) return;
    autoFullscreenDone = true;
    try {
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(() => { /* iOS Safari など非対応環境は無視 */ });
      }
    } catch { /* 何があってもタッチ処理を巻き込まない */ }
  };
  window.addEventListener('pointerdown', autoFullscreen, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') autoFullscreen();
  });
  if (fsBtn) {
    // ゲームの入力（ショット／タッチ操作）に伝播させない
    fsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
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

  // ★ タイトル画面専用の透明タップ層。
  //   iOS Safari では <button> のネイティブ click が最も確実に届くので、
  //   Pointer / Touch が一切届かない環境でも必ずゲームを開始できるようにする保険。
  //   タップ位置はそのままゲームへ渡すので、難易度行・ステージ行の選択もこの経路で動く。
  const tapLayer = document.getElementById('title-tap-layer') as HTMLButtonElement | null;
  if (tapLayer) {
    tapLayer.addEventListener('click', (e) => {
      input.injectTap(e.clientX, e.clientY);
    });
  }

  let lastTime = performance.now();

  // ★ 重要：requestAnimationFrame の再登録は必ず finally で行う。
  //   以前は update / draw の後ろに書いていたため、1回でも例外が飛ぶとループが二度と回らず、
  //   「キャンバスには最後に描かれたタイトル画面が残ったまま、タップしても永久に無反応」
  //   という、一見『入力が効かない』ようにしか見えない致命的な停止に陥っていた。
  //   （画面は正常に見えるので原因が極めて分かりにくい）
  //   ここで握って1フレーム落とすだけに留め、原因はエラーオーバーレイに出す。
  let loopErrorReported = false;
  function gameLoop(currentTime: number): void {
    try {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      game.update(dt, input);
      game.draw(ctx);

      // 透明タップ層は原則タイトル中だけ（ゲーム中は操作の邪魔をしない）。
      // ただし click しか届かないアプリ内ブラウザでは、これが唯一の入力手段なので
      // ゲーム中も出しっぱなしにする（左半分＝移動先指定／右半分＝ショット）。
      if (tapLayer) {
        const wantVisible = game.state === 'TITLE' || input.isClickOnlyEnvironment();
        if (tapLayer.hidden === wantVisible) tapLayer.hidden = !wantVisible;
      }
    } catch (e) {
      // 毎フレーム同じ例外で画面を埋めないよう、表示は最初の1回だけ
      if (!loopErrorReported) {
        loopErrorReported = true;
        showErrorOverlay(`[loop] ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      requestAnimationFrame(gameLoop);
    }
  }

  requestAnimationFrame(gameLoop);
});
