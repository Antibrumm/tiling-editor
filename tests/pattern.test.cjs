const assert = require('assert');
const loadModule = require('./load-module.cjs');
const { PlanService } = loadModule('src/model/plan-service.ts');
const { YamlCodec } = loadModule('src/codecs/yaml.ts');
const context = { PlanService, yamlCodec: new YamlCodec() };
const service = new context.PlanService({
  patterns: [{ name: 'grid', tileWidth: 10, tileHeight: 10 }],
  walls: [
    {
      name: 'wall',
      outline: {
        points: [
          [0, 0],
          [100, 0],
          [100, 100],
        ],
        pattern: 'grid',
      },
      patternRegions: [{ x: 0, y: 0, width: 20, height: 20, pattern: 'grid' }],
    },
  ],
});
assert.equal(service.wall('wall').outline.patternRotation, 0);
assert.equal(service.wall('wall').patternRegions[0].patternRotation, 0);
service.setOutlineValue('wall', 'patternRotation', 37);
service.setPatternRegion('wall', 0, 'patternRotation', 123);
assert.equal(service.snapshot().walls[0].outline.patternRotation, 37);
assert.equal(service.snapshot().walls[0].patternRegions[0].patternRotation, 123);
const yaml = context.yamlCodec.encode(service.snapshot());
const decoded = context.yamlCodec.decode(yaml);
assert.equal(decoded.walls[0].outline.patternRotation, 37);
assert.equal(decoded.walls[0].patternRegions[0].patternRotation, 123);
console.log('Rotation defaults, mutations, and YAML round trip passed.');

assert.equal(service.wall('wall').outline.patternInset, 0);
assert(service.setOutlineValue('wall', 'patternInset', 5));
assert.equal(service.wall('wall').outline.patternInset, 5);
assert.equal(service.setOutlineValue('wall', 'patternInset', Infinity), false);
assert(service.setOutlineValue('wall', 'patternInset', -2));
assert.equal(service.wall('wall').outline.patternInset, 0);
service.setOutlineValue('wall', 'patternInset', 5);
service.setOutlineValue('wall', 'fill', '#eeeecc');
service.setOutlineValue('wall', 'stroke', '#123456');
service.setOutlineValue('wall', 'strokeWidth', 2);
const saved = service.snapshot();
assert.deepStrictEqual(context.yamlCodec.decode(context.yamlCodec.encode(saved)), saved);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('');
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
const { SvgCodec } = loadModule('src/codecs/svg.ts');
const svgCodec = new SvgCodec();
const svg = svgCodec.encode(saved);
assert.deepStrictEqual(svgCodec.decode(svg), saved);
const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
assert.equal(parsed.querySelector('mask polygon').getAttribute('stroke-width'), '10');
assert.equal(parsed.querySelector('g[mask] rect').getAttribute('width'), '20');
const noPattern = structuredClone(saved);
noPattern.walls[0].outline.pattern = '';
assert.deepStrictEqual(svgCodec.decode(svgCodec.encode(noPattern)), noPattern);
assert.deepStrictEqual(context.yamlCodec.decode(context.yamlCodec.encode(noPattern)), noPattern);
dom.window.close();
console.log('Perimeter inset validation and complete YAML/SVG round trips passed.');
