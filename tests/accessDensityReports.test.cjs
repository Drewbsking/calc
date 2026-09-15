const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../scripts/accessDensityReportCore.js');
const Charts = require('../scripts/accessDensityReportCharts.js');
const harness = require('./helpers/alignmentPageHarness.cjs');
const p = (stationFeet, type = 'residential', name = '', id = stationFeet) => ({ id, stationFeet, type, name });
const calculate = (points, lengthFeet = 2500, extra = {}) => R.calculate({ points, lengthFeet, ...extra });

test('default intervals count each access type and keep the final partial interval', () => {
  const data = calculate([p(50), p(800, 'commercial'), p(1000, 'named', 'Main St'), p(1500), p(2490, 'commercial')]);
  assert.equal(data.intervalFeet, 1000);
  assert.deepEqual(data.bins, [
    { startFeet: 0, endFeet: 1000, residential: 1, commercial: 1, named: 0, total: 2, commercialNamed: 1 },
    { startFeet: 1000, endFeet: 2000, residential: 1, commercial: 0, named: 1, total: 2, commercialNamed: 1 },
    { startFeet: 2000, endFeet: 2500, residential: 0, commercial: 1, named: 0, total: 1, commercialNamed: 1 }
  ]);
  assert.equal(data.driveways.length, 4);
});

test('boundary accesses count exactly once; the endpoint belongs to the last interval', () => {
  const data = calculate([p(0), p(999.99), p(1000), p(1999.999999999), p(2000)], 2000);
  assert.deepEqual(data.bins.map(bin => bin.total), [2, 3]);
  assert.equal(data.bins.reduce((sum, bin) => sum + bin.total, 0), 5);
  assert.equal(calculate([p(2000)], 2000.000000001).bins.length, 2);
  assert.equal(calculate([p(2)], 2).bins[0].total, 1);
});

test('changing the interval recomputes counts without changing access stations', () => {
  const points = [p(250), p(500), p(1000), p(2500)];
  const before = structuredClone(points);
  const data = calculate(points, 2500, { intervalFeet: 500 });
  assert.deepEqual(data.bins.map(bin => bin.total), [1, 1, 1, 0, 1]);
  assert.deepEqual(points, before);
});

test('road labels combine matching names within 100 feet without merging counted records', () => {
  const data = calculate([p(100, 'named', 'Main St'), p(180, 'named', ' main   st '), p(280, 'named', 'Main St'), p(900, 'named', 'Main St')]);
  assert.deepEqual(data.namedLabels.map(label => label.stations), [[100, 180], [280], [900]]);
  assert.equal(data.namedLabels[0].stationFeet, 140);
  assert.equal(data.bins[0].named, 4);
  assert.equal(data.gaps.length, 3);
  assert.equal(calculate([p(100, 'named', 'A'), p(200, 'named', 'A')]).namedLabels.length, 1);
  assert.equal(calculate([p(100, 'named', 'A'), p(200.01, 'named', 'A')]).namedLabels.length, 2);
});

test('different or missing road names do not merge; custom tolerance is isolated from counts', () => {
  const points = [p(100, 'named', 'A'), p(110, 'named', 'B'), p(120, 'named'), p(130, 'named'), p(180, 'named', 'A')];
  assert.equal(calculate(points).namedLabels.length, 4);
  const narrow = calculate(points, 2500, { roadLabelToleranceFeet: 50 });
  assert.equal(narrow.namedLabels.length, 5);
  assert.equal(narrow.bins[0].total, 5);
});

test('gaps use consecutive station differences, retain ties, and sort longest first', () => {
  const points = [p(1800, 'named', 'Oak St'), p(100), p(100, 'commercial', '', 'second'), p(500)];
  const data = calculate(points);
  assert.deepEqual(data.gaps.map(gap => [gap.startFeet, gap.endFeet, gap.lengthFeet]), [[500, 1800, 1300], [100, 500, 400], [100, 100, 0]]);
  assert.equal(data.gaps[0].next.name, 'Oak St');
  assert.equal(data.gaps[1].previous.type, 'commercial');
  assert.equal(data.gaps.length, points.length - 1); // No invented alignment endpoint accesses.
});

test('reports ignore all offset/coordinate data and do not mutate their inputs', () => {
  const points = [Object.assign(p(100), { offset: 400, coordinate: { lat: 42, lng: -83 } }), p(500)];
  const first = calculate(points);
  points[0].offset = -1e6; points[0].coordinate.lng = -84;
  assert.deepEqual(calculate(points), first);
  points[0].stationFeet = 200;
  assert.equal(calculate(points).gaps[0].lengthFeet, 300);
});

test('empty data keeps zero-count intervals and no gaps; invalid stations never silently disappear', () => {
  assert.deepEqual(calculate([]).bins.map(bin => bin.total), [0, 0, 0]);
  assert.deepEqual(calculate([]).gaps, []);
  assert.deepEqual(calculate([p(100)]).gaps, []);
  for (const point of [p(null), p(NaN), p(-1), p(2501), p(10, 'invalid')]) assert.throws(() => calculate([point]), /invalid/);
  for (const intervalFeet of [0, NaN, -100, Infinity]) assert.throws(() => calculate([], 2500, { intervalFeet }), /interval/i);
  assert.throws(() => calculate([], 0), /valid stationed/);
  assert.throws(() => calculate([], 20000, { intervalFeet: 1 }), /larger interval/);
});

test('density renders driveway dots on one display row and named accesses only as bold labels and lines', () => {
  const data = calculate([p(100), p(200, 'commercial'), p(350, 'named', 'Oak & Pine'), p(400, 'named', 'oak & pine')]);
  const svg = Charts.renderPages(data, 'density')[0].svg;
  const dots = [...svg.matchAll(/<circle data-driveway="([^"]+)" cx="[^"]+" cy="([^"]+)"/g)];
  assert.deepEqual(dots.map(dot => dot[1]), ['residential', 'commercial']);
  assert.equal(new Set(dots.map(dot => dot[2])).size, 1);
  assert.equal((svg.match(/>Oak &amp; Pine<\/text>/g) || []).length, 1);
  assert.match(svg, /font-weight="700"[^>]*>Oak &amp; Pine/);
  assert.match(svg, /Access Point Density Along Alignment/);
  assert.ok(!svg.includes('data-driveway="named"'));
});

test('renderer filters commercial report, escapes names, and paginates charts and long gap lists', () => {
  const points = Array.from({ length: 35 }, (_, i) => p(i * 800, i % 2 ? 'commercial' : 'named', '<script>alert(1)</script>'));
  const data = calculate(points, 30000);
  assert.equal(Charts.renderPages(data, 'stacked').filter(page => page.title === 'Stacked Access Type').length, 3);
  assert.ok(Charts.renderPages(data, 'gaps').filter(page => page.title === 'Access Gaps').length > 1);
  const commercial = Charts.renderPages(data, 'commercial')[0].svg;
  assert.ok(!commercial.includes('Residential driveway'));
  const gaps = Charts.renderPages(data, 'gaps')[0].svg;
  assert.ok(!gaps.includes('<script>'));
  assert.match(gaps, /&lt;script&gt;/);
  assert.match(gaps, /Start Station/);
  assert.match(Charts.renderPages(calculate([]), 'gaps')[0].svg, /at least two/);
  assert.equal(Charts.renderPages(calculate([]), 'all').length, 6);
});

test('Reports opens from the live access stations, validates intervals, and refreshes after edits', () => {
  const page = harness();
  assert.equal(page.get('reportsBtn').disabled, true);
  page.click(0, 0); page.click(914.4, 0); page.press('accessBtn');
  page.click(100, 30); page.press('accessSave');
  page.click(200, -30); page.key('c'); page.press('accessSave');
  page.press('reportsBtn');
  assert.equal(page.get('reportsDialog').open, true);
  assert.equal(page.get('reportInterval').value, '1000');
  assert.equal(page.get('reportType').value, 'all');
  assert.match(page.get('reportPages').children[0].innerHTML, /MCL 257.627/);
  page.select('reportType', 'density');
  assert.match(page.get('reportPages').children[0].innerHTML, /Total access points 2/);
  page.input('reportInterval', '0');
  assert.equal(page.get('reportPDF').disabled, true);
  assert.match(page.get('reportMessage').textContent, /at least 1/);
  assert.equal(page.get('reportPages').children.length, 0);
  page.input('reportInterval', '100');
  assert.equal(page.get('reportPages').children.length, 5);
  page.press('reportNext');
  assert.equal(page.get('reportPageNumber').textContent, 'Page 2 of 5');
  assert.equal(page.get('reportPages').children[0].hidden, true);
  page.press('reportClose');
  page.drag(page.accessMarkers()[1], 700, 40);
  page.press('reportsBtn');
  page.select('reportType', 'gaps');
  assert.match(page.get('reportPages').children[0].innerHTML, /1,968.5 ft/);
  page.select('reportType', 'all');
  assert.equal(page.get('reportPages').children.length, 12);
});

test('a study name is required for reports without blocking drawing; renaming and Reset update it', () => {
  const page = harness({ studyName: '   ' });
  page.click(0, 0); page.click(914.4, 0);
  const length = page.lengthFeet();
  page.press('reportsBtn');
  assert.ok(!page.get('reportsDialog').open);
  assert.equal(page.get('studyNameError').hidden, false);
  assert.equal(page.activeElement(), page.get('studyName'));
  assert.equal(page.lengthFeet(), length);
  page.input('studyName', '  Oak & Pine Road  ');
  page.press('reportsBtn');
  assert.equal(page.get('reportsDialog').open, true);
  assert.ok(page.get('reportPages').children.every(sheet => sheet.innerHTML.includes('Study: Oak &amp; Pine Road')));
  page.press('reportClose');
  page.input('studyName', 'University Drive');
  page.press('reportsBtn');
  assert.ok(page.get('reportPages').children.every(sheet => sheet.innerHTML.includes('Study: University Drive') && !sheet.innerHTML.includes('Oak &amp; Pine Road')));
  page.press('reportClose');
  page.press('resetBtn');
  assert.equal(page.get('studyName').value, '');
});

test('study names are escaped on all report pages, wrap without moving PDF links away from their text, and leave calculations unchanged', () => {
  const plain = calculate([p(100)]);
  const name = '<script>alert("x")</script> & ' + 'Very long road name '.repeat(4);
  const named = calculate([p(100)], 2500, { studyName: name });
  assert.deepEqual(named.bins, plain.bins);
  assert.deepEqual(named.speed, plain.speed);
  const originalPages = Charts.renderPages(plain);
  Charts.renderPages(named).forEach((page, index) => {
    const original = originalPages[index];
    const addedHeight = page.height - original.height;
    assert.ok(addedHeight > 38);
    assert.ok(!page.svg.includes('<script>'));
    assert.match(page.svg, /Study: &lt;script&gt;/);
    (original.links || []).forEach((link, linkIndex) => {
      assert.equal(page.links[linkIndex].y, link.y + addedHeight);
      assert.equal(page.links[linkIndex].url, link.url);
    });
  });
});
