// 配布ページ／SNS用のプレイ動画を撮る(webm)。
//
// 必要なもの:
//   ・playwright(npm i --no-save playwright)
//   ・dist/ にビルド済みの本体
//   ・★ 撮影用ビルド: src/main.ts の GameManager 生成直後に
//       (window as any).__gm = game; (window as any).__input = input;
//     を一時的に足してから npm run build すること(撮影後は git checkout で戻す)
//
// 使い方: node test/record.mjs <出力先ディレクトリ> [秒数]
//
// 実機のキーボード入力を送って遊ばせる(PC 操作: 矢印キー移動 / Space ショット)。
// ゲーム側の入力経路をそのまま通るので、内部 API に依存しない。
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const OUT = process.argv[2] || '.';
const SECONDS = Number(process.argv[3] ?? 45);
const root = path.resolve('dist');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.mp3':'audio/mpeg', '.json':'application/json' };
const srv = http.createServer((q, r) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    r.end(d);
  });
}).listen(8278);

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--mute-audio'],
});
const ctx = await browser.newContext({
  viewport: { width: 540, height: 720 },
  recordVideo: { dir: OUT, size: { width: 540, height: 720 } },
});
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8278/');
await page.waitForFunction(() => !!window.__gm, null, { timeout: 15000 });
await page.waitForTimeout(1500);

// 見せ場から始める。3 面のシューティング。
await page.evaluate(() => {
  const g = window.__gm;
  g.startNewGame(3); g.state = 'PLAYING'; g.startShootingPhase();
});

const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const deadline = Date.now() + SECONDS * 1000;
let i = 0;
await page.keyboard.down('Space');           // 撃ちっぱなし
while (Date.now() < deadline) {
  const k = keys[i % keys.length];
  await page.keyboard.down(k);
  await page.waitForTimeout(260 + (i % 3) * 120);
  await page.keyboard.up(k);
  await page.waitForTimeout(90);
  i += 1;
  // 中盤でボス戦へ寄せる
  if (i === 40) {
    await page.evaluate(() => {
      const g = window.__gm;
      g.startNewGame(5); g.state = 'PLAYING'; g.startShootingPhase();
      g.player.spawnGraceTimer = 999;
    });
  }
}
await page.keyboard.up('Space');

await ctx.close(); await browser.close(); srv.close();

// 自動命名の webm を play.webm に寄せる
const files = fs.readdirSync(OUT).filter(f => f.endsWith('.webm') && f !== 'play.webm');
if (files[0]) fs.renameSync(path.join(OUT, files[0]), path.join(OUT, 'play.webm'));
console.log(`saved ${path.join(OUT, 'play.webm')} (${SECONDS}s)`);
