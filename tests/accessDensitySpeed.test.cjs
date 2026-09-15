const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../scripts/accessDensityReportCore.js');
const Charts = require('../scripts/accessDensityReportCharts.js');
const harness = require('./helpers/alignmentPageHarness.cjs');
const point = (stationFeet, type = 'residential', id = stationFeet) => ({ id, stationFeet, type, name: type === 'named' ? 'Main St' : '' });
const points = count => Array.from({ length: count }, (_, i) => point(100 + i * 10));
const calculate = (accesses, extra = {}) => R.calculate({ lengthFeet: 2640, points: accesses, ...extra });

test('MCL 257.627(2)(f)-(j) thresholds are exact and include no invented 50/55-mph category', () => {
  const cases = [[0, null, null], [29, null, null], [30, 45, '(2)(j)'], [39, 45, '(2)(j)'],
    [40, 40, '(2)(i)'], [44, 40, '(2)(i)'], [45, 35, '(2)(h)'], [49, 35, '(2)(h)'],
    [50, 30, '(2)(g)'], [59, 30, '(2)(g)'], [60, 25, '(2)(f)'], [100, 25, '(2)(f)']];
  cases.forEach(([count, mph, subsection]) => {
    const speed = calculate(points(count)).speed;
    assert.equal(speed.peak.accessCount, count);
    assert.equal(speed.peak.speedMph, mph);
    assert.equal(speed.peak.subsection, subsection);
    assert.equal(speed.peak.endFeet - speed.peak.startFeet, 2640);
  });
});

test('a sliding half-mile detects an access cluster split across fixed half-mile boundaries', () => {
  const accesses = Array.from({ length: 30 }, (_, i) => point(2000 + i * 50));
  assert.ok(accesses.filter(p => p.stationFeet < 2640).length < 30);
  assert.ok(accesses.filter(p => p.stationFeet >= 2640).length < 30);
  const speed = calculate(accesses, { lengthFeet: 6000 }).speed;
  assert.equal(speed.method, 'sliding');
  assert.equal(speed.peak.accessCount, 30);
  assert.equal(speed.peak.speedMph, 45);
  assert.equal(speed.peak.startFeet, 810);
  assert.equal(speed.peak.endFeet, 3450);
  assert.equal(speed.windows.at(-1).endFeet, 6000);
  assert.ok(speed.windows.every(window => window.complete));
});

test('the event sweep agrees with an independent one-foot exhaustive scan', () => {
  const accesses = Array.from({ length: 100 }, (_, i) => point(50 + (i * 509) % 5800));
  let expected = 0;
  for (let start = 0; start <= 3360; start++) {
    expected = Math.max(expected, accesses.filter(p => p.stationFeet >= start && p.stationFeet <= start + 2640).length);
  }
  assert.equal(calculate(accesses, { lengthFeet: 6000 }).speed.peak.accessCount, expected);
});

test('closed window endpoints count both accesses and retain a threshold change just after an exit', () => {
  const accesses = [point(0), ...Array.from({ length: 28 }, (_, i) => point(i + 1)), point(2640)];
  const speed = calculate(accesses, { lengthFeet: 3000 }).speed;
  assert.equal(speed.peak.accessCount, 30);
  assert.equal(speed.peak.speedMph, 45);
  assert.ok(speed.windows.some(window => window.startFeet > 0 && window.accessCount === 29 && window.speedMph === null));
});

test('chart interval and road-label deduplication cannot change the statutory result', () => {
  const accesses = [...points(28), point(800, 'named', 'west'), point(800, 'named', 'east')];
  const before = structuredClone(accesses);
  const standard = calculate(accesses);
  assert.equal(standard.namedLabels.length, 1);
  assert.equal(standard.speed.peak.accessCount, 30);
  assert.equal(standard.speed.peak.speedMph, 45);
  for (const intervalFeet of [100, 500, 1000, 2640, 3000]) {
    assert.deepEqual(calculate(accesses, { intervalFeet }).speed, standard.speed);
  }
  assert.deepEqual(accesses, before);
});

test('a partial survey never extrapolates a speed without short-highway confirmation', () => {
  const speed = calculate(points(60), { lengthFeet: 1000 }).speed;
  assert.equal(speed.peak, null);
  assert.equal(speed.windows[0].accessCount, 60);
  assert.equal(speed.windows[0].speedMph, null);
  assert.equal(speed.windows[0].status, 'incomplete');
});

test('confirmed short highways use sliding 528-ft windows and exact one-tenth-mile proration', () => {
  for (const [count, expected] of [[5, null], [6, 45], [7, 45], [8, 40], [9, 35], [10, 30], [11, 30], [12, 25]]) {
    const speed = calculate(points(count), { lengthFeet: 1000, shortHighway: true }).speed;
    assert.equal(speed.prorated, true);
    assert.equal(speed.windowFeet, 528);
    assert.equal(speed.peak.equivalentHalfMileCount, count * 5);
    assert.equal(speed.peak.speedMph, expected);
    assert.ok(speed.windows.every(window => window.endFeet - window.startFeet === 528));
  }
  const incomplete = calculate(points(20), { lengthFeet: 500, shortHighway: true }).speed;
  assert.equal(incomplete.peak, null);
  assert.equal(incomplete.windows[0].speedMph, null);
  assert.equal(calculate(points(30), { shortHighway: true }).speed.prorated, false);
});

test('every report includes the MCL result, limitations and clickable official citations', () => {
  const data = calculate(points(45));
  for (const kind of ['speed', 'hypothetical', 'density', 'stacked', 'commercial', 'gaps', 'all']) {
    const pages = Charts.renderPages(data, kind);
    const speed = pages.find(page => page.title === 'Access-Based Speed Limit Recommendation');
    assert.ok(speed);
    assert.match(speed.svg, /Most restrictive result: 35 mph/);
    assert.match(speed.svg, /MCL 257.627/);
    assert.match(speed.svg, /not an explicit MCL requirement/);
    assert.match(speed.svg, /not a limit for the whole alignment/);
    assert.match(speed.svg, /MCL 257.628/);
    assert.equal(speed.links[0].url, R.MCL_URL);
  }
});

test('hypothetical speeds scale independent 100-ft counts without inventing a low-density speed', () => {
  for (const [count, expected] of [[0, null], [1, null], [2, 30], [3, 25], [10, 25]]) {
    const data = calculate(Array.from({ length: count }, (_, i) => point(10 + i)), { lengthFeet: 300 });
    assert.equal(data.hypotheticalSpeed.intervalFeet, 100);
    assert.equal(data.hypotheticalSpeed.method, 'local-density-proration');
    const first = data.hypotheticalSpeed.segments[0];
    assert.equal(first.accessCount, count);
    assert.equal(first.equivalentHalfMileCount, count * 2640 / 100);
    assert.equal(first.speedMph, expected);
    assert.equal(first.status, expected === null ? 'below-threshold' : 'hypothetical');
    assert.equal(data.speed.peak, null); // The statutory analysis still requires coverage.
    assert.ok(data.hypotheticalSpeed.segments.slice(1).every(segment => segment.speedMph === null));
  }
});

test('100-ft boundaries count once and the final partial section uses its actual length', () => {
  const data = calculate([point(0), point(100), point(199.999999999), point(250)], { lengthFeet: 250 });
  const segments = data.hypotheticalSpeed.segments;
  assert.deepEqual(segments.map(segment => segment.accessCount), [1, 1, 2]);
  assert.equal(segments[2].endFeet - segments[2].startFeet, 50);
  assert.equal(segments[2].equivalentHalfMileCount, 105.6);
  assert.equal(segments[2].speedMph, 25);
  const single = calculate([point(225)], { lengthFeet: 250 }).hypotheticalSpeed.segments[2];
  assert.equal(single.equivalentHalfMileCount, 52.8);
  assert.equal(single.speedMph, 30);
  assert.equal(calculate([point(300)], { lengthFeet: 300.000000001 }).hypotheticalSpeed.segments.length, 3);
});

test('hypothetical counts include every access type and remain independent of other report settings', () => {
  const accesses = [point(10), point(20, 'commercial'), point(150, 'named', 'one'), point(160, 'named', 'two')];
  const standard = calculate(accesses, { lengthFeet: 1000 });
  assert.deepEqual(standard.hypotheticalSpeed.segments.slice(0, 2).map(segment => segment.speedMph), [30, 30]);
  assert.equal(standard.namedLabels.length, 1);
  for (const intervalFeet of [100, 500, 1000, 2640]) {
    assert.deepEqual(calculate(accesses, { lengthFeet: 1000, intervalFeet, shortHighway: true }).hypotheticalSpeed, standard.hypotheticalSpeed);
  }
});

test('hypothetical graph labels its method, keeps undefined speeds off the mph axis, and paginates', () => {
  const data = calculate([point(10), point(110), point(120), point(210), point(220), point(230)], { lengthFeet: 3100 });
  const graphs = Charts.renderPages(data, 'all').filter(page => page.title === 'Hypothetical Speed Limit Every 100 Feet');
  assert.equal(graphs.length, 2);
  assert.match(graphs[0].svg, /HYPOTHETICAL ONLY/);
  assert.match(graphs[0].svg, /does not authorize this 100-ft method/);
  assert.match(graphs[0].svg, /data-hypothetical-speed="none"/);
  assert.match(graphs[0].svg, /data-hypothetical-speed="30"/);
  assert.match(graphs[0].svg, /data-hypothetical-speed="25"/);
  assert.ok(!graphs[0].svg.includes('data-hypothetical-speed="0"'));
  assert.match(graphs[0].svg, /No category/);
  assert.match(graphs[1].svg, /Stations 30\+00 - 31\+00/);
  assert.equal(graphs[0].links[0].url, R.MCL_URL);
  assert.equal(Charts.renderPages(data, 'hypothetical')[0].title, graphs[0].title);
});

test('the new graph is available in the live report and refreshes when points move', () => {
  const page = harness();
  page.click(0, 0); page.click(914.4, 0); page.press('accessBtn');
  page.click(31, 20); page.press('accessSave');
  page.click(35, -20); page.press('accessSave');
  page.press('reportsBtn');
  page.select('reportType', 'hypothetical');
  assert.match(page.get('reportPages').children[0].innerHTML, /data-hypothetical-speed="30"/);
  const graph = page.get('reportPages').children[0].innerHTML;
  page.input('reportInterval', '500');
  assert.equal(page.get('reportPages').children[0].innerHTML, graph);
  page.press('reportClose');
  page.drag(page.accessMarkers()[1], 90, -20);
  page.press('reportsBtn');
  assert.ok(!page.get('reportPages').children[0].innerHTML.includes('data-hypothetical-speed="30"'));
});

test('the PDF view defaults to the complete report, offers explicit short-highway proration, and removes PNG', () => {
  const page = harness();
  page.click(0, 0); page.click(304.8, 0); page.press('accessBtn');
  for (let i = 0; i < 12; i++) { page.click(31 + i * 2, 10); page.press('accessSave'); }
  page.press('reportsBtn');
  assert.equal(page.get('reportType').value, 'all');
  assert.equal(page.get('reportShortHighwayControl').hidden, false);
  assert.match(page.get('reportPages').children[0].innerHTML, /No full-length window/);
  page.get('reportShortHighway').checked = true;
  page.get('reportShortHighway').fire('change');
  assert.match(page.get('reportPages').children[0].innerHTML, /Most restrictive result: 25 mph/);
  assert.match(page.get('reportPages').children[0].innerHTML, /528-ft windows/);
  page.press('reportClose');
  page.press('resetBtn');
  assert.equal(page.get('reportShortHighway').checked, false);
  const html = fs.readFileSync(path.join(__dirname, '../accessDensity.html'), 'utf8');
  assert.ok(!html.includes('reportPNG'));
  assert.match(html, /Save PDF Report/);
});
