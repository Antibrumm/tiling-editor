import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';

test('portable file startup, YAML edits, downloads, and offline isolation', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tiling portable '));
  const file = path.join(folder, 'tiling-editor.html');
  fs.copyFileSync('dist/tiling-editor.html', file);
  const html = fs.readFileSync(file, 'utf8');
  const errors: string[] = [];
  const resources: string[] = [];
  const downloads: Blob[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  let dom;
  try {
    dom = new JSDOM(html, {
      url: pathToFileURL(file).href,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
      resources: new (class extends ResourceLoader {
        fetch(url: string) {
          resources.push(url);
          return null;
        }
      })(),
      beforeParse(window) {
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
        window.HTMLCanvasElement.prototype.getContext = (() =>
          new Proxy(
            {},
            { get: () => () => {} },
          ) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement['getContext'];
        window.HTMLElement.prototype.scrollIntoView = () => {};
        window.HTMLElement.prototype.getBoundingClientRect = () =>
          new window.DOMRect(0, 0, 900, 600);
        window.HTMLDialogElement.prototype.showModal = function () {
          this.open = true;
        };
        window.HTMLDialogElement.prototype.close = function () {
          this.open = false;
        };
        window.URL.createObjectURL = (blob) => {
          assert('size' in blob);
          downloads.push(blob);
          return 'blob:portable-download';
        };
        window.URL.revokeObjectURL = () => {};
        window.HTMLAnchorElement.prototype.click = () => {};
      },
    });
    const { document, Event } = dom.window;
    assert.equal(document.querySelectorAll<HTMLElement>('script').length, 1);
    assert.equal(
      document.querySelectorAll<HTMLElement>('script[src], script[type="module"]').length,
      0,
    );
    assert.equal(document.querySelectorAll<HTMLElement>('link[rel="stylesheet"]').length, 0);
    assert(document.querySelector<HTMLElement>('style')!.textContent.length > 1000);
    assert.equal(document.querySelectorAll<HTMLDetailsElement>('.wall-section').length, 0);
    (document.getElementById('load-example') as HTMLButtonElement)!.click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(document.querySelectorAll<HTMLDetailsElement>('.wall-section').length, 7);
    for (const id of ['user', 'developer']) {
      (document.getElementById('open-help') as HTMLButtonElement)!.click();
      document.querySelector<HTMLElement>(`[data-document="${id}"]`)!.click();
      assert(
        (document.getElementById('help-dialog-content') as HTMLElement)!.querySelector<HTMLElement>(
          'h2',
        )!,
      );
      (document.getElementById('close-help') as HTMLButtonElement)!.click();
    }
    const source = (document.getElementById('source') as HTMLTextAreaElement)!;
    source.value = source.value.replace('Tiling Bathroom', 'Portable plan');
    source.dispatchEvent(new Event('input'));
    (document.getElementById('apply-source') as HTMLButtonElement)!.click();
    assert.equal(
      (document.getElementById('plan-title') as HTMLElement)!.textContent,
      'Portable plan',
    );
    (document.getElementById('download-yaml') as HTMLButtonElement)!.click();
    (document.getElementById('download') as HTMLButtonElement)!.click();
    assert.equal(downloads.length, 2);
    assert(downloads.every((blob) => blob.size > 100));
    assert.deepEqual(resources, [], 'The handed-over file requires no external resources');
    assert.deepEqual(errors, []);
  } finally {
    dom?.window.close();
    fs.rmSync(file, { force: true });
    fs.rmdirSync(folder);
  }
});
