const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/alignmentPageHarness.cjs');
const G = require('../scripts/accessDensityCore.js');

function near(actual, expected, tolerance = .02) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} near ${expected}`);
}
function makeCurve(page) {
  page.click(100, 0); // Draw the tangent endpoint that becomes PC.
  page.press('curveBtn');
  page.click(100 + 100 / Math.sqrt(2), 100 - 100 / Math.sqrt(2));
  page.click(200, 100);
}

function assertSmooth(page) {
  const sections = page.lines().filter(layer => ['#2e86c5', '#20b8dd'].includes(layer.options.color)).map(layer => {
    const points = layer.coordinates.map(page.xy);
    return layer.options.color === '#2e86c5'
      ? { type: 'line', start: points[0], end: points.at(-1) }
      : { type: 'curve', pc: points[0], mid: points[Math.floor(points.length / 2)], pt: points.at(-1) };
  });
  const alignment = G.buildAlignment(sections);
  G.assertTangency(alignment);
  return alignment;
}

test('draw shows tangents immediately, starts at 0+00, and labels every 500 feet', () => {
  const page = harness();
  assert.equal(page.get('finishBtn').disabled, true);
  page.click(0, 0);
  assert.equal(page.get('endStation').textContent, '0+00');
  assert.deepEqual(page.labels(), ['<span>0+00</span>']);
  page.click(304.8, 0);
  near(page.lengthFeet(), 1000);
  assert.equal(page.lines().length, 1);
  assert.deepEqual(page.labels(), ['<span>0+00</span>', '<span>5+00</span>', '<span>10+00</span>']);
  assert.equal(page.get('finishBtn').disabled, false);
});

test('Add Curve reuses the last tangent endpoint as PC, takes MID then PT, and resumes drawing', () => {
  const page = harness();
  page.click(0, 0);
  page.click(100, 0);
  page.press('curveBtn');
  assert.match(page.get('alignmentStatus').textContent, /Click MID/);
  assert.deepEqual(page.handles().map(marker => marker.options.icon.html), ['0', 'PC']);
  assert.equal(page.get('finishBtn').disabled, true);
  near(page.lengthFeet(), 100 / .3048);
  page.click(100 + 100 / Math.sqrt(2), 100 - 100 / Math.sqrt(2));
  assert.match(page.get('alignmentStatus').textContent, /Click PT/);
  assert.deepEqual(page.handles().map(marker => marker.options.icon.html), ['0', 'PC', 'MID']);
  near(page.lengthFeet(), 100 / .3048); // The temporary PC-to-MID guide is not counted.
  assert.equal(page.get('finishBtn').disabled, true);
  const mid = page.handles().find(marker => marker.options.icon.html === 'MID');
  near(page.xy(mid.coordinates).x, 100 + 100 / Math.sqrt(2));
  near(page.xy(mid.coordinates).y, 100 - 100 / Math.sqrt(2));
  page.click(200, 100);
  assert.equal(page.get('drawBtn').attributes['aria-pressed'], 'true');
  assert.deepEqual(page.handles().map(marker => marker.options.icon.html).sort(), ['0', 'MID', 'PC', 'PT']);
  near(page.lengthFeet(), (100 + 50 * Math.PI) / .3048);
  page.click(220, 200); // Snaps to the northward exit tangent at x = 200.
  near(page.lengthFeet(), (200 + 50 * Math.PI) / .3048);
  assert.equal(page.handles().length, 5);
  assertSmooth(page);
});

test('Add Curve requires a start point, then uses it as PC at Station 0+00', () => {
  const page = harness();
  assert.equal(page.get('curveBtn').disabled, true);
  page.press('curveBtn');
  assert.equal(page.get('drawBtn').attributes['aria-pressed'], 'true');
  page.click(100, 0);
  assert.equal(page.get('endStation').textContent, '0+00');
  assert.equal(page.get('curveBtn').disabled, false);
  page.press('curveBtn');
  assert.match(page.get('alignmentStatus').textContent, /Click MID/);
  page.click(150, 50);
  page.click(200, 0);
  near(page.lengthFeet(), 50 * Math.PI / .3048);
  assert.deepEqual(page.handles().map(marker => marker.options.icon.html).sort(), ['MID', 'PC', 'PT']);
});

test('MID dragging updates the curve during drag, before dragend', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.click(200, 200);
  const before = page.lengthFeet();
  const expected = (300 + 25 * Math.PI) / .3048;
  page.drag('MID', 150 + 50 / Math.sqrt(2), 50 - 50 / Math.sqrt(2), () => {
    assert.notEqual(page.lengthFeet(), before);
    near(page.lengthFeet(), expected);
    const arc = page.lines().find(layer => layer.options.color === '#20b8dd');
    assert.ok(arc.coordinates.length > 3);
    assertSmooth(page);
  });
});

test('PC and PT drags slide along fixed adjoining tangents and preserve tangency', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.click(200, 200);
  page.drag('PC', 80, -10);
  assertSmooth(page);
  page.drag('PT', 230, 90);
  const tangents = page.lines().filter(layer => layer.options.color === '#2e86c5');
  near(page.xy(tangents[0].coordinates.at(-1)).x, 110);
  near(page.xy(tangents[0].coordinates.at(-1)).y, 0);
  near(page.xy(tangents[1].coordinates[0]).x, 200);
  near(page.xy(tangents[1].coordinates[0]).y, 90);
  near(page.xy(tangents[0].coordinates[0]).x, 0);
  near(page.xy(tangents[1].coordinates.at(-1)).y, 200);
  const arc = page.lines().find(layer => layer.options.color === '#20b8dd');
  near(page.xy(arc.coordinates[0]).x, 110);
  near(page.xy(arc.coordinates.at(-1)).x, 200);
  assert.ok(Number.isFinite(page.lengthFeet()));
  assertSmooth(page);
});

test('successive curves automatically share the previous PT as the next PC', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.press('curveBtn');
  assert.match(page.get('alignmentStatus').textContent, /Click MID/);
  assert.ok(page.handles().some(marker => marker.options.icon.html === 'PT/PC'));
  page.click(300 - 100 / Math.sqrt(2), 100 + 100 / Math.sqrt(2));
  assert.match(page.get('alignmentStatus').textContent, /Click PT/);
  page.click(300, 200);
  near(page.lengthFeet(), (100 + 100 * Math.PI) / .3048);
  assert.ok(page.handles().some(marker => marker.options.icon.html === 'PT/PC'));
  assertSmooth(page);
  page.drag('PT/PC', 205, 110);
  const arcs = page.lines().filter(layer => layer.options.color === '#20b8dd');
  near(page.xy(arcs[0].coordinates.at(-1)).x, 200);
  near(page.xy(arcs[1].coordinates[0]).x, 200);
  near(page.xy(arcs[1].coordinates[0]).y, 110);
  assertSmooth(page);
});

test('Finish makes map clicks inquire without adding points; Draw resumes from the endpoint', () => {
  const page = harness();
  page.click(0, 0);
  page.click(304.8, 0);
  page.hover(152.4, 5);
  assert.equal(page.get('inquiryStation').textContent, '5+00.00');
  page.press('finishBtn');
  page.click(76.2, 4);
  assert.equal(page.handles().length, 2);
  assert.equal(page.get('inquiryStation').textContent, '2+50.00');
  near(page.lengthFeet(), 1000);
  page.hover(152.4, 50);
  assert.equal(page.get('inquiryStation').textContent, '—');
  page.press('drawBtn');
  page.click(457.2, 0);
  near(page.lengthFeet(), 1500);
  assert.equal(page.handles().length, 3);
});

test('curve inquiry reports distance along the true arc', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.press('finishBtn');
  page.click(100 + 110 / Math.sqrt(2), 100 - 110 / Math.sqrt(2));
  const expected = (100 + 25 * Math.PI) / .3048;
  const station = page.get('inquiryStation').textContent;
  const [hundreds, feet] = station.split('+');
  near(Number(hundreds) * 100 + Number(feet), expected);
});

test('incomplete curve cancellation discards MID and retains the prior endpoint and stationing', () => {
  const page = harness();
  page.click(0, 0);
  page.click(50, 0);
  page.press('curveBtn');
  page.click(100, 0);
  near(page.lengthFeet(), 50 / .3048);
  page.press('drawBtn');
  assert.equal(page.handles().length, 2);
  near(page.lengthFeet(), 50 / .3048);
  page.click(50, 100);
  near(page.lengthFeet(), 150 / .3048);
});

test('cancelling a first unfinished curve retains the start at Station 0+00', () => {
  const page = harness();
  page.click(100, 0);
  page.press('curveBtn');
  page.click(150, 50);
  page.press('drawBtn');
  assert.equal(page.handles().length, 1);
  assert.deepEqual(page.labels(), ['<span>0+00</span>']);
  assert.equal(page.get('endStation').textContent, '0+00');
  near(page.xy(page.handles()[0].coordinates).x, 100);
  page.click(200, 0);
  near(page.lengthFeet(), 100 / .3048);
});

test('invalid initial controls can be repaired, and invalid later drags retain the valid curve', () => {
  const page = harness();
  page.click(100, 0);
  page.press('curveBtn');
  page.click(150, 0);
  page.click(200, 0);
  assert.match(page.get('alignmentStatus').textContent, /nearly straight/);
  assert.equal(page.get('endStation').textContent, '—');
  assert.equal(page.get('finishBtn').disabled, true);
  assert.equal(page.handles().length, 3);
  page.click(300, 0);
  assert.equal(page.handles().length, 3);
  page.drag('MID', 150, 50);
  assert.equal(page.get('finishBtn').disabled, false);
  near(page.lengthFeet(), 50 * Math.PI / .3048);
  page.press('finishBtn');
  page.drag('MID', 150, 0);
  near(page.lengthFeet(), 50 * Math.PI / .3048);
  assert.match(page.get('alignmentStatus').textContent, /nearly straight/);
  page.drag('MID', 150, 50);
  near(page.lengthFeet(), 50 * Math.PI / .3048);
});

test('non-tangent initial clicks are adjusted into a tangent connection', () => {
  const page = harness();
  page.click(0, 0);
  page.click(100, 0);
  page.press('curveBtn');
  page.click(150, 50);
  page.click(200, 0);
  const alignment = assertSmooth(page);
  const arc = alignment.segments[1];
  near(arc.pc.x, 150);
  near(arc.pc.y, 0);
  near(arc.pt.x, 200);
  near(arc.pt.y, -50);
  near(arc.radius, 50);
});

test('an impossible PC drag snaps the marker back and preserves length and tangency', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.click(200, 200);
  const before = page.lengthFeet();
  page.drag('PC', -300, 80);
  near(page.lengthFeet(), before);
  const marker = page.handles().find(item => item.options.icon.html === 'PC');
  near(page.xy(marker.coordinates).x, 100);
  near(page.xy(marker.coordinates).y, 0);
  assert.match(page.get('alignmentStatus').textContent, /beyond an adjoining tangent/);
  assertSmooth(page);
});

test('moving a tangent endpoint refits its curve and keeps the other tangent direction', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.click(200, 200);
  page.drag('0', -20, -30);
  const fitted = assertSmooth(page);
  near(fitted.segments[0].start.x, -20);
  near(fitted.segments[0].start.y, -30);
  near(fitted.segments[2].start.x, 200);
  near(fitted.segments[2].end.x, 200);
});

test('a tangent after PT cannot reverse or leave the exit tangent', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  const before = page.lengthFeet();
  page.click(300, 0);
  near(page.lengthFeet(), before);
  assert.equal(page.handles().length, 4);
  assert.match(page.get('alignmentStatus').textContent, /ahead of PT/);
  page.click(230, 220);
  const fitted = assertSmooth(page);
  near(fitted.segments.at(-1).end.x, 200);
  near(fitted.segments.at(-1).end.y, 220);
});

test('the pending MID can be dragged freely without changing the completed alignment', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.press('curveBtn');
  page.click(240, 200);
  // Select the new MID, alongside the existing curve's MID marker.
  const pending = page.handles().filter(marker => marker.options.icon.html === 'MID').at(-1);
  const frame = G.localFrame({ lat: 42.6389, lng: -83.2910 });
  pending.fire('dragstart');
  pending.setLatLng(frame.toLatLng({ x: 260, y: 250 }));
  pending.fire('drag');
  pending.fire('dragend');
  assertSmooth(page);
  near(page.xy(pending.coordinates).x, 260);
  near(page.xy(pending.coordinates).y, 250);
  assert.match(page.get('alignmentStatus').textContent, /Click PT/);
  near(page.lengthFeet(), (100 + 50 * Math.PI) / .3048);
  page.press('drawBtn');
  assertSmooth(page);
  near(page.lengthFeet(), (100 + 50 * Math.PI) / .3048);
});

test('dragging a shared PC during unfinished curve creation keeps the existing curve tangent', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.press('curveBtn');
  page.drag('PT/PC', 210, 120);
  assertSmooth(page);
  page.press('drawBtn');
  assertSmooth(page);
});

test('Reset clears geometry, control markers, labels, inquiry, and incomplete curve state', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.press('curveBtn');
  page.click(250, 0);
  page.press('resetBtn');
  assert.equal(page.handles().length, 0);
  assert.equal(page.lines().length, 0);
  assert.equal(page.labels().length, 0);
  assert.equal(page.get('inquiryStation').textContent, '—');
  assert.equal(page.get('endStation').textContent, '0+00');
  assert.equal(page.get('drawBtn').attributes['aria-pressed'], 'true');
  assert.equal(page.get('curveBtn').disabled, true);
  page.click(500, 200);
  page.click(804.8, 200);
  near(page.lengthFeet(), 1000, .04);
});

test('Add Curve after Finish starts at the endpoint and a second press preserves the chosen MID', () => {
  const page = harness();
  page.click(0, 0);
  page.click(100, 0);
  page.press('finishBtn');
  page.press('curveBtn');
  assert.match(page.get('alignmentStatus').textContent, /Click MID/);
  page.click(100 + 100 / Math.sqrt(2), 100 - 100 / Math.sqrt(2));
  page.press('curveBtn');
  assert.match(page.get('alignmentStatus').textContent, /Click PT/);
  assert.equal(page.handles().length, 3);
  page.click(200, 100);
  near(page.lengthFeet(), (100 + 50 * Math.PI) / .3048);
  assertSmooth(page);
});

test('dragging the reused tangent endpoint as pending PC refits its existing adjoining curve', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.click(200, 200);
  page.press('curveBtn');
  const pc = page.handles().filter(marker => marker.options.icon.html === 'PC').at(-1);
  const frame = G.localFrame({ lat: 42.6389, lng: -83.2910 });
  pc.fire('dragstart');
  pc.setLatLng(frame.toLatLng({ x: 220, y: 220 }));
  pc.fire('drag');
  assertSmooth(page);
  near(page.xy(pc.coordinates).x, 220);
  near(page.xy(pc.coordinates).y, 220);
  pc.fire('dragend');
  assert.match(page.get('alignmentStatus').textContent, /Click MID/);
  page.press('drawBtn');
  assertSmooth(page);
});

test('missing map library gives an actionable error and disables drawing controls', () => {
  const page = harness({ mapAvailable: false });
  assert.match(page.get('alignmentStatus').textContent, /map could not load/);
  ['drawBtn', 'curveBtn', 'finishBtn', 'resetBtn'].forEach(id => assert.equal(page.get(id).disabled, true));
});

test('the second PC follows the drag across the connecting tangent and updates stationing', () => {
  const page = harness();
  page.click(0, 0);
  makeCurve(page);
  page.click(200, 300);
  page.press('curveBtn');
  page.click(300 - 100 / Math.sqrt(2), 300 + 100 / Math.sqrt(2));
  page.click(300, 400);
  page.press('finishBtn');
  const pcs = page.handles().filter(marker => marker.options.icon.html === 'PC');
  assert.equal(pcs.length, 2);
  const before = page.lengthFeet();
  page.drag(pcs[1], 230, 310, () => {
    near(page.xy(pcs[1].coordinates).x, 230);
    near(page.xy(pcs[1].coordinates).y, 310);
    const fitted = assertSmooth(page);
    near(fitted.segments[3].pc.x, 230);
    near(fitted.segments[3].pc.y, 310);
    near(page.lengthFeet(), G.toFeet(fitted.totalLength));
    assert.notEqual(page.lengthFeet(), before);
  });
  const fitted = assertSmooth(page);
  page.hover(230, 310);
  assert.equal(page.get('inquiryStation').textContent, G.formatStation(G.toFeet(fitted.segments[3].startDistance), 2));
});
