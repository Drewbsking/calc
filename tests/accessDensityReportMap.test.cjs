const { test } = require('node:test');
const assert = require('node:assert/strict');
const MapReport = require('../scripts/accessDensityReportMap.js');
const Core = require('../scripts/accessDensityReportCore.js');
const Charts = require('../scripts/accessDensityReportCharts.js');
const harness = require('./helpers/alignmentPageHarness.cjs');

test('map projection uses Web Mercator tile coordinates with north up', () => {
  const origin = MapReport.project({ lat: 0, lng: 0 }, 0);
  assert.equal(origin.x, 128);
  assert.ok(Math.abs(origin.y - 128) < 1e-8);
  assert.ok(MapReport.project({ lat: 43, lng: -83 }, 16).y < MapReport.project({ lat: 42, lng: -83 }, 16).y);
});

test('overview fits the full alignment and actual off-alignment access coordinates without mutating them', () => {
  const start = { lat: 42.6, lng: -83.3 }, end = { lat: 42.61, lng: -83.29 };
  const data = { lines: [[start, { lat: 42.602, lng: -83.288 }, end]],
    stations: [{ coordinate: start, label: '0+00' }],
    accesses: [{ coordinate: { lat: 42.603, lng: -83.31 }, type: 'commercial', name: '' }] };
  const before = structuredClone(data), plan = MapReport.layout(data);
  for (const point of [...plan.lines.flat(), ...plan.accesses]) {
    assert.ok(point.x >= 65 && point.x <= plan.width - 65);
    assert.ok(point.y >= 65 && point.y <= plan.height - 65);
  }
  assert.ok(plan.accesses[0].x < plan.lines[0][0].x);
  assert.equal(plan.stations[0].x, plan.lines[0][0].x);
  assert.ok(plan.scalePixels > 0 && plan.scalePixels <= 120);
  assert.ok(plan.tiles.length > 0 && plan.tiles.length < 80);
  assert.deepEqual(data, before);
});

test('complete reports start with the study map and retain the name, attribution and map warning', () => {
  const data = Core.calculate({ studyName: 'Oak & Pine', lengthFeet: 3000, points: [] });
  const snapshot = { image: 'data:image/png;base64,test', warning: 'Background is incomplete.' };
  for (const kind of ['all', 'map', 'speed', 'hypothetical', 'density', 'stacked', 'commercial', 'gaps']) {
    const pages = Charts.renderPages(data, kind, snapshot);
    const map = pages.find(page => page.title === 'Study Map');
    assert.ok(map);
    assert.match(map.svg, /Study: Oak &amp; Pine/);
    assert.match(map.svg, /Esri &amp; partners/);
    assert.match(map.svg, /Background is incomplete/);
    if (kind === 'all' || kind === 'map') assert.equal(pages[0].title, 'Study Map');
  }
});

test('reports wait for the map, refresh after edits, and discard a capture closed before completion', async () => {
  const pending = [];
  const page = harness({ captureMap: data => new Promise(resolve => pending.push({ data, resolve })) });
  page.click(0, 0); page.click(914.4, 0); page.press('accessBtn');
  page.click(100, 30); page.press('accessSave');
  page.press('reportsBtn');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.get('reportPDF').disabled, true);
  assert.equal(pending[0].data.accesses.length, 1);
  const before = pending[0].data.accesses[0].coordinate.lng;
  page.press('reportClose');
  pending[0].resolve({ image: 'data:image/png;base64,old', warning: '' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.get('studyName').disabled, false);
  page.drag(page.accessMarkers()[0], 200, 30);
  page.press('reportsBtn');
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(pending[1].data.accesses[0].coordinate.lng, before);
  pending[1].resolve({ image: 'data:image/png;base64,new', warning: '' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.get('reportPDF').disabled, false);
  assert.match(page.get('reportPages').children[0].innerHTML, /Study Map/);
  assert.match(page.get('reportPages').children[0].innerHTML, /base64,new/);
});

test('a map capture failure is visible and cannot export a silently omitted map', async () => {
  const page = harness({ captureMap: () => Promise.reject(new Error('Image unavailable')) });
  page.click(0, 0); page.click(914.4, 0); page.press('reportsBtn');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.get('reportPDF').disabled, true);
  assert.match(page.get('reportMessage').textContent, /map could not be prepared/);
});
