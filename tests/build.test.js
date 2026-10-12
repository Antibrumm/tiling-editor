import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

test('production assets, documentation, and template startup', async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  let dom;
  try {
    const { port } = server.httpServer.address();
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(base);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert(!html.includes('src/editor.ts'), 'Preview serves compiled HTML');
    const entry = html.match(/<script\b[^>]*src="([^"]+)"/)[1];
    assert(entry.includes('/assets/'), 'Build emits a separate application module');
    for (const file of fs.readdirSync('dist/assets')) {
      const asset = await fetch(`${base}/assets/${file}`);
      assert.equal(asset.status, 200, `Built asset is served: ${file}`);
      assert.equal(
        Buffer.from(await asset.arrayBuffer()).length,
        fs.statSync(path.join('dist/assets', file)).size,
      );
    }

    // jsdom cannot execute module scripts, so bundle the emitted modules in
    // memory to exercise the production app, rather than the source entry.
    const bundle = esbuild.buildSync({
      entryPoints: [path.resolve('dist', entry)],
      bundle: true,
      format: 'iife',
      write: false,
      define: {
        'import.meta.url': JSON.stringify(new URL(entry, base).href),
        'import.meta.resolve': 'undefined',
      },
    }).outputFiles[0].text;
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => errors.push(error.message));
    dom = new JSDOM(html, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: base,
      virtualConsole,
      beforeParse(window) {
        window.fetch = (input, options) => fetch(new URL(input, base), options);
        window.ResizeObserver = class {
          observe() {}
        };
        window.Path2D = class {
          moveTo() {}
          lineTo() {}
          closePath() {}
          rect() {}
        };
        window.structuredClone = structuredClone;
        window.HTMLDialogElement.prototype.showModal = function () {
          this.open = true;
        };
        window.HTMLDialogElement.prototype.close = function () {
          this.open = false;
        };
        window.HTMLCanvasElement.prototype.getContext = () =>
          new Proxy({}, { get: () => () => {} });
        window.HTMLElement.prototype.scrollIntoView = () => {};
        window.HTMLElement.prototype.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 900,
          height: 600,
        });
      },
    });
    dom.window.eval(bundle);
    for (const [id, heading] of [
      ['user', 'Getting started'],
      ['developer', 'Architecture'],
    ]) {
      dom.window.document.getElementById('open-help').click();
      assert(dom.window.document.getElementById('help-dialog').open);
      dom.window.document.querySelector(`[data-document="${id}"]`).click();
      assert.equal(
        dom.window.document.getElementById('help-dialog-content').querySelector('h2').textContent,
        heading,
      );
      dom.window.document.getElementById('help-dialog').close();
    }
    dom.window.document.getElementById('load-template').click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(dom.window.document.querySelectorAll('.wall-section').length, 7);
    assert(dom.window.document.getElementById('source').value.includes('Tiling Bathroom'));
    assert.deepEqual(errors, []);
  } finally {
    dom?.window.close();
    server.httpServer.closeAllConnections();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
});
