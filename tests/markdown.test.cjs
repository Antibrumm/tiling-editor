const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const bundle = esbuild.buildSync({
  entryPoints: ['src/ui/markdown.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'MarkdownRenderer',
  write: false,
}).outputFiles[0].text;
const dom = new JSDOM('<article></article>', { runScripts: 'outside-only' });
try {
  const renderer = dom.window.eval(bundle + '\nMarkdownRenderer;');
  const article = dom.window.document.querySelector('article');
  article.innerHTML = renderer.renderMarkdown(`## Example

**Bold** and \`code\` with [a link](https://example.com).

- First
- Second

<script>alert('unsafe')</script>
<img src="image.png" onerror="alert('unsafe')">
[Unsafe link](javascript:alert(1))
`);
  assert.equal(article.querySelector('h2').textContent, 'Example');
  assert.equal(article.querySelector('strong').textContent, 'Bold');
  assert.equal(article.querySelector('code').textContent, 'code');
  assert.equal(article.querySelectorAll('li').length, 2);
  assert.equal(article.querySelector('a').getAttribute('href'), 'https://example.com');
  assert.equal(article.querySelector('script, [onerror], a[href^="javascript:"]'), null);
  console.log('Passed: Markdown headings, formatting, lists, links, and HTML sanitization.');
} finally {
  dom.window.close();
}
