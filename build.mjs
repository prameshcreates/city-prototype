import { build } from 'esbuild';
import { writeFileSync, statSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  charset: 'ascii',
  write: false,
  legalComments: 'none',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const css = `
html,body{margin:0;height:100%;overflow:hidden;background:#9fb4c8}
canvas{display:block;position:fixed;inset:0;width:100%;height:100%}
#hud{position:fixed;inset:0;pointer-events:none;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#f4f1ea}
#hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;background:rgba(18,22,28,.82);padding:22px 28px;border-radius:10px;min-width:260px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
#hint h1{margin:0 0 12px;font-size:18px;letter-spacing:.04em}
#hint table{border-collapse:collapse}
#hint td{padding:3px 14px 3px 0}
#hint td:first-child{color:#ffcf5a;font-weight:600;white-space:nowrap}
#hint p{margin:14px 0 0;color:#b9c2cc}
#prompt{position:absolute;left:50%;bottom:18%;transform:translateX(-50%);background:rgba(18,22,28,.75);padding:8px 16px;border-radius:6px;font-size:15px}
#prompt b{color:#ffcf5a}
#speed{position:absolute;right:28px;bottom:24px;text-align:right;text-shadow:0 2px 6px rgba(0,0,0,.6)}
#speed span{font-size:46px;font-weight:700;font-variant-numeric:tabular-nums}
#speed small{display:block;font-size:13px;letter-spacing:.12em;opacity:.8}
`;

const html = `<title>City Prototype</title>
<meta charset="utf-8">
<style>${css}</style>
<div id="hud"></div>
<script type="module">${js}</script>
`;

writeFileSync('index.html', html);
console.log(`index.html ${(statSync('index.html').size / 1048576).toFixed(2)} MB`);
