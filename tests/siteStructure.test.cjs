const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}

test('active pages, shared styles, images, and local reference links resolve from their own folders', () => {
  const pages = [
    ...fs.readdirSync(root).filter(name => name.endsWith('.html')).map(name => path.join(root, name)),
    ...['calculators', 'shared', 'missdig', 'styles', 'examples'].flatMap(name => files(path.join(root, name))),
  ].filter(filename => /\.(html|css)$/.test(filename));
  for (const filename of pages) {
    const source = fs.readFileSync(filename, 'utf8');
    const urls = [
      ...source.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g),
      ...source.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g),
    ];
    for (const [, value] of urls) {
      if (value.startsWith('#') || value.includes('${')) continue;
      const url = new URL(value.replace(/&amp;/g, '&'), pathToFileURL(filename));
      if (url.protocol !== 'file:') continue;
      const target = fileURLToPath(url);
      assert.ok(fs.existsSync(target), `${path.relative(root, filename)}: ${value}`);
      if (fs.statSync(target).isDirectory()) {
        assert.ok(fs.existsSync(path.join(target, 'index.html')), `Directory page: ${target}`);
        assert.ok(url.pathname.endsWith('/'), `Directory links need a trailing slash: ${value}`);
      }
    }
  }
});
