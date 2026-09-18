// 配布ページ／SNS用のスクリーンショットを撮る。
//
// 必要なもの：
//   ・playwright（このリポジトリの依存には入っていない。別途 npm i playwright）
//   ・dist/ にビルド済みの本体
//   ・★ デバッグ版ビルド：src/main.ts の GameManager 生成直後に
//       (window as any).__gm = game; (window as any).__input = input;
//     を一時的に足してから npm run build すること（撮影後は git checkout で戻す）。
//     任意のステージ・ボス戦へ直接飛ばすために使う。
//
// 使い方： node test/promo.mjs <出力先ディレクトリ>
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root=path.resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg','.json':'application/json'};
const srv=http.createServer((q,r)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(d);});}).listen(8277);
const OUT = process.argv[2] || '.';
const b=await chromium.launch({executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--mute-audio']});
const page=await b.newPage({viewport:{width:560,height:760}});
await page.goto('http://127.0.0.1:8277/');
await page.waitForFunction(()=>!!window.__gm,null,{timeout:15000});
const ev=(f,a)=>page.evaluate(f,a);
const canvas = await page.$('#game-canvas');
const shoot = async (name) => { await canvas.screenshot({path: path.join(OUT, name)}); console.log('  ->', name); };

await page.waitForTimeout(1200);
await shoot('promo_1_title.png');

// シューティング中の賑やかな場面（3面）
await ev(()=>{ const g=window.__gm; g.startNewGame(3); g.state='PLAYING'; g.startShootingPhase(); g.player.spawnGraceTimer=99; });
await ev(()=>{ const g=window.__gm; for(let i=0;i<60*11;i++) g.update(1/60, window.__input); });
await page.waitForTimeout(500); await shoot('promo_2_shooting.png');

// ドッキング（パズル）中
await ev(()=>{ const g=window.__gm; g.startNewGame(4); g.state='PLAYING'; g.startTetrisPhase(); });
await ev(()=>{ const g=window.__gm; for(let i=0;i<60*3;i++) g.update(1/60, window.__input); });
await page.waitForTimeout(400); await shoot('promo_3_docking.png');

// ボス戦
await ev(()=>{ const g=window.__gm; g.startNewGame(5); g.state='PLAYING'; g.startShootingPhase(); g.player.spawnGraceTimer=999; });
await ev(()=>{ const g=window.__gm; for(let i=0;i<60*70;i++){ g.update(1/60, window.__input); if(g.enemies.some(e=>e.isBoss)) break; } });
await ev(()=>{ const g=window.__gm; for(let i=0;i<60*4;i++) g.update(1/60, window.__input); });
await page.waitForTimeout(400); await shoot('promo_4_boss.png');

await b.close(); srv.close();
console.log('done');
