import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';

export const root = fileURLToPath(new URL('../', import.meta.url));

export async function build() {
  const result = await bundle({
    absWorkingDir: root,
    entryPoints: ['src/editor.ts'],
    outdir: 'dist',
    bundle: true,
    format: 'iife',
    minify: true,
    legalComments: 'inline',
    write: false,
    target: ['es2020'],
  });
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
  const template = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const html = template
    .replace('<link rel="stylesheet" href="./src/styles.css">', () => `<style>${css}</style>`)
    .replace('<script type="module" src="./src/editor.ts"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  await fs.writeFile(path.join(root, 'dist/index.html'), html);
  console.log(`Built dist/index.html (${Buffer.byteLength(html)} bytes)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
}
