const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const bundle = esbuild.buildSync({
  entryPoints: ['src/ui/mermaid-renderer.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'DiagramRenderer',
  write: false,
}).outputFiles[0].text;
const dom = new JSDOM('<article></article>', { runScripts: 'outside-only' });
const { MermaidRenderer } = dom.window.eval(bundle + '\nDiagramRenderer;');
const content = dom.window.document.querySelector('article');
const setBlocks = (...sources) => {
  content.replaceChildren();
  for (const source of sources) {
    const pre = dom.window.document.createElement('pre');
    const code = dom.window.document.createElement('code');
    code.className = 'language-mermaid';
    code.textContent = source;
    pre.append(code);
    content.append(pre);
  }
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

(async () => {
  let loads = 0;
  const calls = [];
  const configurations = [];
  const engine = {
    initialize: (config) => configurations.push(config),
    render: async (id, source) => {
      calls.push({ id, source });
      if (source === 'invalid diagram') throw new Error('Syntax error');
      return { svg: '<svg xmlns="http://www.w3.org/2000/svg"><title>Diagram</title></svg>' };
    },
  };
  const renderer = new MermaidRenderer(async () => {
    loads++;
    return engine;
  });
  content.innerHTML = '<pre><code class="language-typescript">const x = 1;</code></pre>';
  await renderer.render(content);
  assert.equal(loads, 0, 'Ordinary documents do not load Mermaid');
  assert(content.querySelector('code.language-typescript'));
  setBlocks('flowchart LR\nA --> B', 'sequenceDiagram\nA->>B: Hello');
  await renderer.render(content);
  assert.equal(loads, 1);
  assert.equal(configurations.length, 1);
  assert.equal(configurations[0].securityLevel, 'strict');
  assert.equal(configurations[0].startOnLoad, false);
  assert.equal(content.querySelectorAll('.mermaid-diagram svg').length, 2);
  assert.equal(content.querySelector('[aria-busy]'), null);
  assert.equal(calls[0].source, 'flowchart LR\nA --> B');
  assert.notEqual(calls[0].id, calls[1].id);

  setBlocks('invalid diagram', 'flowchart LR\nC --> D');
  await renderer.render(content);
  assert.equal(content.querySelector('.mermaid-error').getAttribute('role'), 'status');
  assert.equal(content.querySelector('code').textContent, 'invalid diagram');
  assert.equal(content.querySelectorAll('svg').length, 1, 'One error does not stop later diagrams');
  assert.equal(loads, 1, 'The engine is reused across documents');

  const loading = deferred();
  const loadingRenderer = new MermaidRenderer(() => loading.promise);
  setBlocks('flowchart LR\nE --> F');
  const waiting = loadingRenderer.render(content);
  content.textContent = 'Documentation list';
  const callCount = calls.length;
  loading.resolve(engine);
  await waiting;
  assert.equal(calls.length, callCount, 'Navigation during loading cancels stale work');
  assert.equal(content.textContent, 'Documentation list');

  const rendering = deferred();
  const renderingRenderer = new MermaidRenderer(async () => ({
    initialize() {},
    render: () => rendering.promise,
  }));
  setBlocks('flowchart LR\nG --> H');
  const inProgress = renderingRenderer.render(content);
  await Promise.resolve();
  await Promise.resolve();
  content.textContent = 'Another document';
  rendering.resolve({ svg: '<svg></svg>' });
  await inProgress;
  assert.equal(content.textContent, 'Another document', 'Late results cannot overwrite navigation');

  setBlocks('flowchart LR\nI --> J');
  await new MermaidRenderer(async () => {
    throw new Error('Load failed');
  }).render(content);
  assert(content.querySelector('.mermaid-error'));
  assert.equal(content.querySelector('code').textContent, 'flowchart LR\nI --> J');
  console.log(
    'Passed: lazy Mermaid rendering, engine reuse, source fallback, and stale navigation handling. SVG rendering verified separately in Chrome.',
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => dom.window.close());
