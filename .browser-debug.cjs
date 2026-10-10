const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
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
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.httpServer.address().port });
    await new Promise((r) => setTimeout(r, 1500));
    const run = async (expression) =>
      console.log(
        JSON.stringify(
          await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }),
        ),
      );
    await run(`({title:document.title,walls:document.querySelectorAll('.wall-section').length})`);
    await run(`document.getElementById('load-template').click()`);
    await new Promise((r) => setTimeout(r, 1200));
    await run(
      `({title:document.title,walls:document.querySelectorAll('.wall-section').length,status:document.getElementById('status').textContent})`,
    );
    await run(`document.getElementById('three-toggle').click()`);
    await new Promise((r) => setTimeout(r, 2500));
    await run(
      `({status:document.getElementById('three-status').textContent,canvases:document.querySelectorAll('canvas').length})`,
    );
    console.log('ERROR COUNT', events.filter((e) => e.method === 'Runtime.exceptionThrown').length);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    socket?.close();
    browser.kill();
    server.httpServer.closeAllConnections();
    await new Promise((r) => server.httpServer.close(r));
  }
})();
