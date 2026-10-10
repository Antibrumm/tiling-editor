import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/editor.ts'],
  outfile: 'portable.js',
  bundle: true,
  splitting: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  loader: { '.yaml': 'text', '.md': 'text' },
});

const javascript = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text;
const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text;
if (!javascript || !css) throw new Error('Portable build must emit JavaScript and CSS.');

const shell = await readFile(path.join(root, 'index.html'), 'utf8');
const entry = /<script\b[^>]*src="\.\/src\/editor.ts"[^>]*>\s*<\/script>/;
if (!entry.test(shell)) throw new Error('Application entry script was not found in index.html.');

// Inline classic scripts avoid file-origin module restrictions. Escape HTML end
// tags so strings in bundled documentation cannot terminate the script or style.
const html = shell
  .replace('</head>', () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`)
  .replace(entry, () => `<script>${javascript.replace(/<\/script/gi, '<\\/script')}</script>`);
const output = path.join(root, 'dist', 'tiling-editor.html');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(
  `Portable app: dist/tiling-editor.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`,
);
