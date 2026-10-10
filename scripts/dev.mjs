import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { build, root } from './build.mjs';

await build();
let timer, pending = Promise.resolve();
const rebuild = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending = pending.then(build).catch(error => console.error(error));
  }, 80);
};
for (const file of ['index.html', 'src/editor.js', 'src/styles.css']) {
  fs.watch(path.join(root, file), rebuild);
}
const port = Number(process.env.PORT || 5173);
http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname !== '/' && pathname !== '/index.html') {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(root, 'dist/index.html')).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Editor: http://localhost:${port} — rebuilds on changes; refresh the browser.`);
});
