const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = import('../certMap/viewer-core.mjs');
const folder = path.join(__dirname, '..', 'certMap');

test('the viewer includes every township sheet and only existing PDFs', async () => {
  const { maps } = await core;
  const sheets = fs.readdirSync(folder).filter(file => file.endsWith('-24-CW.pdf')).sort();
  assert.deepEqual(Object.keys(maps).filter(file => file.endsWith('-24-CW.pdf')).sort(), sheets);
  for (const file of Object.keys(maps)) assert.ok(fs.existsSync(path.join(folder, file)), file);
});

test('viewer URLs encode filenames and reject arbitrary files and URLs', async () => {
  const { viewerHref, isMapFile } = await core;
  assert.equal(viewerHref('2024 Countywide Cert.pdf'), 'viewer.html?file=2024%20Countywide%20Cert.pdf');
  for (const file of ['../secret.pdf', 'https://example.org/test.pdf', 'constructor', 'holly-24-cw.pdf']) {
    assert.equal(isMapFile(file), false);
    assert.throws(() => viewerHref(file));
  }
});

test('both old PDF and new viewer margin links stay in the current viewer', async () => {
  const { neighboringFile } = await core;
  const local = 'http://localhost:8000/calc/certMap/Holly-24-CW.pdf';
  for (const url of ['Rose-24-CW.pdf', 'viewer.html?file=Rose-24-CW.pdf',
    'https://calc.rcocwiki.org/certMap/Rose-24-CW.pdf',
    'https://calc.rcocwiki.org/certMap/viewer.html?file=Rose-24-CW.pdf']) {
    assert.equal(neighboringFile(url, local), 'Rose-24-CW.pdf');
  }
});

test('annotation URLs cannot load external documents or escape the map directory', async () => {
  const { neighboringFile } = await core;
  for (const url of ['https://example.org/certMap/Rose-24-CW.pdf', '../Rose-24-CW.pdf',
    'javascript:alert(1)', 'viewer.html?file=../../secret.pdf', 'missing.pdf']) {
    assert.equal(neighboringFile(url, 'https://calc.rcocwiki.org/certMap/Holly-24-CW.pdf'), null);
  }
});

test('page fragments are bounded to actual pages', async () => {
  const { pageFromHash } = await core;
  assert.equal(pageFromHash('#page=10', 27), 10);
  assert.equal(pageFromHash('#page=100', 27), 27);
  for (const hash of ['', '#page=0', '#page=-1', '#page=1.5', '#page=oops']) {
    assert.equal(pageFromHash(hash, 27), 1);
  }
});

test('wheel zoom normalizes device units, reverses direction, and stays bounded', async () => {
  const { wheelZoomScale } = await core;
  const zoomed = wheelZoomScale(1, -120);
  assert.ok(zoomed > 1);
  assert.ok(wheelZoomScale(1, 120) < 1);
  assert.ok(Math.abs(wheelZoomScale(zoomed, 120) - 1) < 1e-10);
  assert.equal(wheelZoomScale(1, -3, 1), wheelZoomScale(1, -48));
  assert.equal(wheelZoomScale(1, 0.1, 2, 800), wheelZoomScale(1, 80));
  assert.equal(wheelZoomScale(400 / 75, -1000), 400 / 75);
  assert.equal(wheelZoomScale(10 / 75, 1000), 10 / 75);
});
