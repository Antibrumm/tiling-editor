const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tiling portable '));
  const file = path.join(folder, 'tiling-editor.html');
  fs.copyFileSync('dist/tiling-editor.html', file);
  const html = fs.readFileSync(file, 'utf8');
  const errors = [];
  const resources = [];
  const downloads = [];
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
        fetch(url) {
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
        window.HTMLCanvasElement.prototype.getContext = () =>
          new Proxy({}, { get: () => () => {} });
        window.HTMLElement.prototype.scrollIntoView = () => {};
        window.HTMLElement.prototype.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 900,
          height: 600,
        });
        window.HTMLDialogElement.prototype.showModal = function () {
          this.open = true;
        };
        window.HTMLDialogElement.prototype.close = function () {
          this.open = false;
        };
        window.URL.createObjectURL = (blob) => {
          downloads.push(blob);
          return 'blob:portable-download';
        };
        window.URL.revokeObjectURL = () => {};
        window.HTMLAnchorElement.prototype.click = () => {};
      },
    });
    const { document, Event } = dom.window;
    assert.equal(document.querySelectorAll('script').length, 1);
    assert.equal(document.querySelectorAll('script[src], script[type="module"]').length, 0);
    assert.equal(document.querySelectorAll('link[rel="stylesheet"]').length, 0);
    assert(document.querySelector('style').textContent.length > 1000);
    assert.equal(document.querySelectorAll('.wall-section').length, 0);
    document.getElementById('load-template').click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(document.querySelectorAll('.wall-section').length, 7);
    for (const [button, content] of [
      ['open-help', 'help-dialog-content'],
      ['open-dev-help', 'dev-help-dialog-content'],
    ]) {
      document.getElementById(button).click();
      assert(document.getElementById(content).querySelector('h2'));
    }
    const source = document.getElementById('source');
    source.value = source.value.replace('Tiling Bathroom', 'Portable plan');
    source.dispatchEvent(new Event('input'));
    document.getElementById('apply-source').click();
    assert.equal(document.getElementById('plan-title').textContent, 'Portable plan');
    document.getElementById('download-yaml').click();
    document.getElementById('download').click();
    assert.equal(downloads.length, 2);
    assert(downloads.every((blob) => blob.size > 100));
    assert.deepEqual(resources, [], 'The handed-over file requires no external resources');
    assert.deepEqual(errors, []);
    console.log(
      'Passed: isolated portable file startup, template, documentation, YAML apply, and downloads without external resources. Canvas mocked.',
    );
  } finally {
    dom?.window.close();
    fs.rmSync(file, { force: true });
    fs.rmdirSync(folder);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
