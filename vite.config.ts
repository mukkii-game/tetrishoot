import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// ★ ビルド識別子（BUILD ID）
//   itch.io は butler で push しても index.html の URL が変わらないため、
//   スマホ側に古い index.html がキャッシュされていると、いつまでも古いバンドルが動き続ける。
//   「直したはずなのに直らない」の切り分けができるよう、タイトル画面に小さく出す。
const buildId = (() => {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return `${stamp} ${sha}`;
  } catch {
    return stamp;
  }
})();

export default defineConfig({
  base: './', // GitHub Pages用（相対パス解決）
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    {
      // ★ 最新ビルド判定用の version.json を出力する。
      //   itch.io は butler で push しても index.html の URL が変わらないため
      //   （butler のログにある通り html5 チャンネルは1つの upload に build を積む方式）、
      //   端末やCDNに古い index.html が残ると、そこから参照されるハッシュ付きJSも
      //   古いままになり「直したはずなのに直らない」が延々と続く。
      //   起動時にこのファイルを no-store で読み、自分のビルドIDと違えば
      //   ?v=<新しいID> を付けて読み直す（URLが変わるので必ず新しい実体が降ってくる）。
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ build: buildId }),
        });
      },
    },
  ],
});
