const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  os = require('node:os'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
(async () => {
  const portableFile = process.argv[2];
  let server;
  let targetUrl;
  if (portableFile) {
    targetUrl = pathToFileURL(path.resolve(portableFile)).href;
  } else {
    const { preview } = await import('vite');
    server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
    targetUrl = 'http://127.0.0.1:' + server.httpServer.address().port;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tiling-browser-'));
  const browser = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { windowsHide: true },
  );
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Browser timeout')), 15000);
      browser.stderr.on('data', (chunk) => {
        output += chunk;
        if (/DevTools listening on (ws:\/\/\S+)/.test(output)) {
          clearTimeout(timer);
          resolve(output.match(/DevTools listening on (ws:\/\/\S+)/)[1]);
        }
      });
      browser.on('error', reject);
    });
    const address = new URL(endpoint);
    const targets = await (await fetch('http://' + address.host + '/json/list')).json();
    socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser connection timed out')), 8000);
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('Browser connection failed'));
        },
        { once: true },
      );
    });
    let seq = 0;
    const pending = new Map();
    const events = [];
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const item = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? item.reject(msg.error) : item.resolve(msg.result);
      } else {
        events.push(msg);
        if (['Runtime.exceptionThrown', 'Log.entryAdded'].includes(msg.method))
          console.log(JSON.stringify(msg));
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 10000);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Page.navigate', { url: targetUrl });
    await new Promise((r) => setTimeout(r, 1500));
    const run = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      console.log(JSON.stringify(result));
      return result.result.value;
    };
    await run(`({title:document.title,walls:document.querySelectorAll('.wall-section').length})`);
    await run(`document.getElementById('load-template').click()`);
    await new Promise((r) => setTimeout(r, 1200));
    const loaded = await run(
      `({title:document.title,walls:document.querySelectorAll('.wall-section').length,status:document.getElementById('status').textContent})`,
    );
    assert.equal(loaded.walls, 7);
    await run(`document.getElementById('three-toggle').click()`);
    await new Promise((r) => setTimeout(r, 2500));
    const rendered = await run(
      `({status:document.getElementById('three-status').textContent,canvases:document.querySelectorAll('canvas').length,webgl:!!document.querySelector('#preview-3d canvas')?.getContext('webgl2')})`,
    );
    assert.equal(rendered.webgl, true);
    assert(rendered.status.startsWith('Drag to orbit'));
    await run(
      `document.getElementById('open-help').click(); document.querySelector('[data-document="architecture"]').click()`,
    );
    const documentation = await run(`(async () => {
      const content = document.getElementById('help-dialog-content');
      const deadline = Date.now() + 8000;
      while (content.querySelector('[aria-busy="true"]') && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 50));
      return {
        diagrams: content.querySelectorAll('.mermaid-diagram svg').length,
        errors: content.querySelectorAll('.mermaid-error').length,
        pending: content.querySelectorAll('[aria-busy="true"]').length,
        sourceBlocks: content.querySelectorAll('code.language-mermaid').length,
        visible: [...content.querySelectorAll('.mermaid-diagram svg')].every(svg => svg.getBoundingClientRect().width > 0),
      };
    })()`);
    assert.equal(documentation.diagrams, 6);
    assert.equal(documentation.errors, 0);
    assert.equal(documentation.pending, 0);
    assert.equal(documentation.sourceBlocks, 0);
    assert(documentation.visible);
    if (process.argv.includes('--screenshot')) {
      await run(`document.querySelector('.mermaid-diagram').scrollIntoView({block:'center'})`);
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      const screenshotPath = path.join(os.tmpdir(), 'tiling-documentation.png');
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
      console.log('Documentation screenshot:', screenshotPath);
    }
    await run(`document.getElementById('documentation-back').click()`);
    const entries = await run(
      `document.querySelectorAll('#help-dialog-content [data-document]').length`,
    );
    assert.equal(entries, 3);
    await run(`document.getElementById('close-help').click()`);
    console.log(
      'Passed: all six architecture diagrams render as visible SVGs; documentation navigation works.',
    );
    assert.equal(events.filter((e) => e.method === 'Runtime.exceptionThrown').length, 0);
    if (portableFile) {
      const requested = events
        .filter((event) => event.method === 'Network.requestWillBeSent')
        .map((event) => event.params.request.url);
      assert(requested.every((url) => url === targetUrl || url.startsWith('data:')));
      console.log('Passed: portable file opens and renders 3D with no external resource requests.');
    }
    console.log('ERROR COUNT', events.filter((e) => e.method === 'Runtime.exceptionThrown').length);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    socket?.close();
    browser.kill();
    if (server) {
      server.httpServer.closeAllConnections();
      await new Promise((r) => server.httpServer.close(r));
    }
  }
})();
