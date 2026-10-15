const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const folder = path.join(root, 'certMap');
const page = fs.readFileSync(path.join(root, 'certMap.html'), 'utf8');
const listedFiles = [...page.matchAll(/\bfile: '([^']+\.pdf)'/g)].map(([, file]) => file);

test('every county-road list entry points to an existing PDF with exact filename casing', () => {
  const available = new Set(fs.readdirSync(folder));
  assert.equal(listedFiles.length, 25);
  for (const file of listedFiles) {
    assert.ok(available.has(file), `Missing PDF: ${file}`);
    const fd = fs.openSync(path.join(folder, file), 'r');
    const signature = Buffer.alloc(5);
    try { fs.readSync(fd, signature, 0, 5, 0); } finally { fs.closeSync(fd); }
    assert.equal(signature.toString(), '%PDF-', `Invalid PDF: ${file}`);
  }
});

for (const filename of fs.readdirSync(folder).filter(name => name.endsWith('.svg'))) {
  test(`${filename}: map targets match the county-road list without overrides to another community`, () => {
    const svg = fs.readFileSync(path.join(folder, filename), 'utf8');
    const targets = [];
    for (const [tag] of svg.matchAll(/<(?:path|rect|polygon|g)\b[^>]*>/g)) {
      const id = tag.match(/\bid="([^"]+\.pdf)"/)?.[1];
      const dataFile = tag.match(/\bdata-file="([^"]+)"/)?.[1];
      if (!id && !dataFile) continue;
      if (dataFile) assert.equal(dataFile, id, `Wrong community override on ${id}`);
      targets.push(dataFile || id);
    }
    assert.deepEqual(targets.sort(), [...listedFiles].sort());
  });
}
