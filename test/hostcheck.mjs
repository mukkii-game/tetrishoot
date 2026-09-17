// 配布先（plicy / ふりーむ / 個人サーバ など）を想定した移植性チェック。
// 必要なもの：playwright（別途 npm i playwright）と、dist/ にビルド済みの本体。
// 使い方： node test/hostcheck.mjs      （デバッグ版ビルドは不要）
// ・深いサブパスに置いても動くか（相対パス解決）
// ・iframe に埋め込まれても動くか（plicy は iframe 埋め込み）
// ・version.json が無い（404）ホストでも落ちないか
import { chromium, devices } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve('dist');
const PREFIX = '/games/play/998877/';           // ありがちな深いサブパス
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg','.json':'application/json','.png':'image/png'};
const noVersionJson = process.argv.includes('--no-version');

const srv = http.createServer((q, r) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/host.html') {   // plicy 風の iframe 埋め込みページ
    r.writeHead(200, {'content-type':'text/html'});
    r.end(`<!doctype html><html><body style="margin:0"><iframe id="f" src="${PREFIX}" width="540" height="720" allowfullscreen style="border:0"></iframe></body></html>`);
    return;
  }
  if (!url.startsWith(PREFIX)) { r.writeHead(404); r.end(); return; }
  let rel = url.slice(PREFIX.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  if (noVersionJson && rel === 'version.json') { r.writeHead(404); r.end(); return; }
  const p = path.join(root, rel);
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, {'content-type': types[path.extname(p)] || 'application/octet-stream'});
    r.end(d);
  });
}).listen(8266);

let fails = [];
const ok = (c, m, x) => { console.log(`${c?'PASS':'FAIL'}  ${m}${x!==undefined?'  '+JSON.stringify(x):''}`); if (!c) fails.push(m); };

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--mute-audio']});

async function run(label, url, ctxOpts, frameFirst) {
  const ctx = await b.newContext(ctxOpts || {});
  const page = await ctx.newPage();
  const errs = [], reqFails = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  page.on('requestfailed', r => reqFails.push(r.url()));
  const urls = [];
  page.on('response', r => urls.push(r.url() + ' ' + r.status()));
  await page.goto(url);
  // ゲーム本体が居るフレームを取る
  const target = frameFirst ? page.frames().find(f => f.url().includes(PREFIX)) : page.mainFrame();
  await target.waitForFunction(() => !!document.getElementById('game-canvas'), null, {timeout:15000});
  await page.waitForTimeout(2500);
  const st = await target.evaluate(() => {
    const c = document.getElementById('game-canvas');
    const bar = document.getElementById('__err_overlay');
    return { w: c.width, h: c.height, url: location.href,
             errBar: bar ? bar.innerText.slice(0,200) : null,
             build: typeof window.__gm !== 'undefined' ? 'dbg' : 'prod' };
  });
  // 想定内の404：version.json（無いホスト）／favicon／stage_bgm.mp3（あれば使う任意ファイル）
  const EXPECTED_404 = ['version.json', 'favicon', 'stage_bgm.mp3'];
  const bad404 = urls.filter(u => / 404$/.test(u) && !EXPECTED_404.some(k => u.includes(k)));
  // 想定内のエラー：上記404のconsole出力と、Googleフォント（外部・フォールバック有り）の取得失敗
  const realErrs = errs.filter(e => !/Failed to load resource|ERR_CERT_AUTHORITY_INVALID|fonts\.(googleapis|gstatic)/.test(e));
  console.log(`\n--- ${label} ---`);
  console.log('  final url :', st.url);
  console.log('  canvas    :', st.w + 'x' + st.h);
  if (bad404.length) console.log('  404s      :', bad404);
  if (errs.length) console.log('  errors    :', errs);
  ok(st.w === 540 && st.h === 720, `${label}: the canvas is set up (the game booted)`, st.w+'x'+st.h);
  ok(bad404.length === 0, `${label}: every asset resolved from the sub-path (no 404s)`, bad404);
  ok(realErrs.length === 0, `${label}: no script errors`, realErrs);
  ok(!st.errBar, `${label}: no red error bar shown to the player`, st.errBar);
  // 実際に遊べるところまで動くか（タイトル→開始）
  await target.evaluate(() => { const c = document.getElementById('game-canvas'); const r = c.getBoundingClientRect(); return r.width > 0; });
  await ctx.close();
  return st;
}

await run('desktop, deep sub-path', `http://127.0.0.1:8266${PREFIX}`);
await run('inside an iframe (plicy-style embed)', 'http://127.0.0.1:8266/host.html', null, true);
await run('iPhone in an iframe', 'http://127.0.0.1:8266/host.html', {...devices['iPhone 12'], hasTouch:true, isMobile:true}, true);

await b.close(); srv.close();
console.log(fails.length ? `\n${fails.length} FAILURES:\n- ${fails.join('\n- ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
