// Optional: packs the game into single self-contained HTML files under dist/.
// The game itself needs no build step; this exists for hosts that want one file.
//   npx esbuild is fetched on demand:  node tools/bundle.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('style.css', 'utf8');
const js = execFileSync('npx', ['--yes', 'esbuild@0.24.0', 'src/main.js', '--bundle', '--minify', '--format=iife', '--target=es2020'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const body = html.split('<!--app-->')[1].split('<!--/app-->')[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const safeJs = js.replace(/<\/script/g, '<\\/script');
mkdirSync('dist', { recursive: true });

// Stand-alone page: open it straight from disk.
writeFileSync('dist/last-lumen.html', `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>LAST LUMEN</title>${fonts}<style>${css}</style></head>
<body>${body}<script>${safeJs}</script></body></html>
`);

// Fragment for hosts that supply their own document skeleton.
writeFileSync('dist/fragment.html', `<title>LAST LUMEN</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>${css}</style>
${body}<script>${safeJs}</script>
`);
console.log('dist/last-lumen.html', 'dist/fragment.html');
