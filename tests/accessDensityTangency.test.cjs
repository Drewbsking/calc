const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../scripts/accessDensityCore.js');
const p = (x, y) => ({ x, y });
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} should equal ${b}`);
const quarter = (sign = 1) => [
  { type: 'line', start: p(0, 0), end: p(100, 0) },
  { type: 'curve', pc: p(100, 0), mid: p(100 + 100 / Math.sqrt(2), sign * (100 - 100 / Math.sqrt(2))), pt: p(200, sign * 100) },
  { type: 'line', start: p(200, sign * 100), end: p(200, sign * 200) }
];
function checkJoins(sections) {
  const alignment = G.buildAlignment(sections);
  G.assertTangency(alignment);
  for (let i = 0; i < alignment.segments.length; i++) {
    const arc = alignment.segments[i];
    if (arc.type !== 'curve') continue;
    for (const [line, endpoint] of [[alignment.segments[i - 1], arc.pc], [alignment.segments[i + 1], arc.pt]]) {
      if (line?.type !== 'line') continue;
      // Independent invariant: radius at contact is perpendicular to the line.
      const rx = endpoint.x - arc.center.x, ry = endpoint.y - arc.center.y;
      const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
      near((rx * dx + ry * dy) / (arc.radius * line.length), 0);
    }
  }
  return alignment;
}

test('PC slides along its tangent and adjusts PT to the same radius', () => {
  const fitted = checkJoins(G.constrainAlignment(quarter(), { index: 1, control: 'pc', point: p(120, -50) }));
  const arc = fitted.segments[1];
  near(arc.pc.x, 120); near(arc.pc.y, 0);
  near(arc.pt.x, 200); near(arc.pt.y, 80);
  near(arc.radius, 80); near(arc.length, 40 * Math.PI);
  near(fitted.totalLength, 240 + 40 * Math.PI);
});

test('PT slides along its tangent and adjusts PC, including clockwise curves', () => {
  for (const sign of [1, -1]) {
    const fitted = checkJoins(G.constrainAlignment(quarter(sign), { index: 1, control: 'pt', point: p(300, sign * 60) }));
    const arc = fitted.segments[1];
    near(arc.radius, 60); near(arc.pc.x, 140); near(arc.pc.y, 0);
    near(arc.pt.x, 200); near(arc.pt.y, sign * 60);
    assert.equal(Math.sign(arc.sweep), sign);
  }
});

test('MID sets radius while both straight-section bearings and remote anchors stay fixed', () => {
  const input = quarter();
  const copy = structuredClone(input);
  const fitted = checkJoins(G.constrainAlignment(input, { index: 1, control: 'mid', point: p(150 + 50 / Math.sqrt(2), 50 - 50 / Math.sqrt(2)) }));
  near(fitted.segments[1].radius, 50);
  near(fitted.segments[1].length, 25 * Math.PI);
  assert.deepEqual(fitted.segments[0].start, p(0, 0));
  assert.deepEqual(fitted.segments[2].end, p(200, 200));
  near(fitted.segments[0].end.y, 0);
  near(fitted.segments[2].start.x, 200);
  assert.deepEqual(input, copy);
});

test('arbitrary deflection angles keep tangent bearings when radius changes', () => {
  const r = 120, a = Math.PI / 3;
  const pc = p(0, 0), mid = p(r * Math.sin(a / 2), r * (1 - Math.cos(a / 2)));
  const pt = p(r * Math.sin(a), r * (1 - Math.cos(a)));
  const input = [
    { type: 'line', start: p(-200, 0), end: pc },
    { type: 'curve', pc, mid, pt },
    { type: 'line', start: pt, end: p(pt.x + 200 * Math.cos(a), pt.y + 200 * Math.sin(a)) }
  ];
  const fitted = checkJoins(G.constrainAlignment(input, { index: 1, control: 'pc', point: p(60 * Math.tan(a / 2), -40) }));
  near(fitted.segments[1].radius, 60);
  near(fitted.segments[1].sweep, a);
  near(fitted.segments[1].length, 20 * Math.PI);
});

test('oversize and inverted radii are rejected without mutating the alignment', () => {
  const input = quarter(), copy = structuredClone(input);
  assert.throws(() => G.constrainAlignment(input, { index: 1, control: 'pc', point: p(-300, 10) }), /beyond/);
  assert.throws(() => G.constrainAlignment(input, { index: 1, control: 'pc', point: p(300, 10) }), /more room/);
  assert.deepEqual(input, copy);
});

test('a single incoming tangent allows radius changes while the free PT follows', () => {
  const fitted = checkJoins(G.constrainAlignment(quarter().slice(0, 2), {
    index: 1, control: 'mid', point: p(100 + 50 / Math.sqrt(2), 50 - 50 / Math.sqrt(2))
  }));
  const arc = fitted.segments[1];
  near(arc.radius, 50); near(arc.pc.x, 100); near(arc.pc.y, 0);
  near(arc.pt.x, 150); near(arc.pt.y, 50);
});

test('a single outgoing tangent stays fixed while the free PC follows radius changes', () => {
  const input = quarter().slice(1);
  const fitted = checkJoins(G.constrainAlignment(input, {
    index: 0, control: 'mid', point: p(150 + 50 / Math.sqrt(2), 100 - 50 / Math.sqrt(2))
  }));
  const arc = fitted.segments[0];
  near(arc.radius, 50); near(arc.pt.x, 200); near(arc.pt.y, 100);
  near(arc.pc.x, 150); near(arc.pc.y, 50);
});

test('an isolated three-point curve remains freely editable', () => {
  const input = [{ type: 'curve', pc: p(0, 0), mid: p(50, 50), pt: p(100, 0) }];
  const fitted = G.buildAlignment(G.constrainAlignment(input, { index: 0, control: 'mid', point: p(50, 25) }));
  near(fitted.segments[0].radius, 62.5);
  assert.deepEqual(fitted.segments[0].mid, p(50, 25));
});

test('opposing parallel tangents preserve the half-circle radius and allow longitudinal sliding', () => {
  const input = [
    { type: 'line', start: p(-100, 0), end: p(0, 0) },
    { type: 'curve', pc: p(0, 0), mid: p(50, 50), pt: p(0, 100) },
    { type: 'line', start: p(0, 100), end: p(-100, 100) }
  ];
  const fitted = checkJoins(G.constrainAlignment(input, { index: 1, control: 'mid', point: p(20, 300) }));
  near(fitted.segments[1].radius, 50);
  near(fitted.segments[1].pc.x, -30);
  near(fitted.segments[1].pt.x, -30);
});

test('station inquiry and 500-foot labels use the adjusted arc and cumulative lengths', () => {
  const fitted = checkJoins(G.constrainAlignment(quarter(), { index: 1, control: 'pc', point: p(120, 0) }));
  const expectedMid = p(120 + 80 / Math.sqrt(2), 80 - 80 / Math.sqrt(2));
  const inquiry = G.nearestStation(fitted, expectedMid);
  near(inquiry.distanceAlong, 120 + 20 * Math.PI);
  near(inquiry.offset, 0);
  const labels = G.stationLocations(fitted);
  assert.deepEqual(labels.map(label => Math.round(label.stationFeet)), [0, 500, 1000]);
  const firstCurveStation = labels[1].point;
  near(Math.hypot(firstCurveStation.x - 120, firstCurveStation.y - 80), 80);
});

test('tangency validation rejects a kink and a reversed tangent direction', () => {
  const input = quarter();
  input[0].start = p(0, -50);
  assert.throws(() => G.assertTangency(G.buildAlignment(input)), /tangentially/);
  input[0].start = p(150, 0);
  assert.throws(() => G.assertTangency(G.buildAlignment(input)), /tangentially/);
});

test('outgoing tangent placement projects forward and rejects reversed extensions', () => {
  const arc = G.buildAlignment(quarter()).segments[1];
  const next = G.extendTangent(arc, p(400, 220));
  near(next.x, 200); near(next.y, 220);
  assert.throws(() => G.extendTangent(arc, p(400, 50)), /ahead of PT/);
});

test('radius changes propagate through consecutive curves bounded by straight sections', () => {
  const input = quarter().slice(0, 2);
  input.push(
    { type: 'curve', pc: p(200, 100), mid: p(300 - 100 / Math.sqrt(2), 100 + 100 / Math.sqrt(2)), pt: p(300, 200) },
    { type: 'line', start: p(300, 200), end: p(400, 200) }
  );
  const fitted = checkJoins(G.constrainAlignment(input, { index: 1, control: 'pc', point: p(120, -50) }));
  near(fitted.segments[1].radius, 80);
  near(fitted.segments[2].radius, 120);
  near(fitted.segments[1].pt.x, 200);
  near(fitted.segments[1].pt.y, 80);
  near(fitted.segments[2].pc.y, 80);
  near(fitted.segments[2].pt.x, 320);
  near(fitted.totalLength, 200 + 100 * Math.PI);
  const reverse = checkJoins(G.constrainAlignment(input, { index: 2, control: 'pt', point: p(350, 240) }));
  near(reverse.segments[1].radius, 50);
  near(reverse.segments[2].radius, 150);
  assert.throws(() => G.constrainAlignment(input, { index: 1, control: 'pt', point: p(200, 250) }), /more room/);
});

test('a major arc retains its direction and tangency when its radius changes', () => {
  const input = [
    { type: 'line', start: p(100, 100), end: p(100, 0) },
    { type: 'curve', pc: p(100, 0), mid: p(-100, 0), pt: p(0, 100) },
    { type: 'line', start: p(0, 100), end: p(100, 100) }
  ];
  const fitted = checkJoins(G.constrainAlignment(input, { index: 1, control: 'pt', point: p(20, 200) }));
  near(fitted.segments[1].radius, 80);
  near(fitted.segments[1].sweep, -3 * Math.PI / 2);
  near(fitted.segments[1].length, 120 * Math.PI);
});

test('the second PC can move off the old connecting tangent while both curves remain tangent', () => {
  for (const withExit of [false, true]) {
    const input = quarter().slice(0, 2);
    input.push(
      { type: 'line', start: p(200, 100), end: p(200, 300) },
      { type: 'curve', pc: p(200, 300), mid: p(300 - 100 / Math.sqrt(2), 300 + 100 / Math.sqrt(2)), pt: p(300, 400) }
    );
    if (withExit) input.push({ type: 'line', start: p(300, 400), end: p(500, 400) });
    const before = structuredClone(input);
    for (const target of [p(230, 310), p(175, 280)]) {
      const fitted = checkJoins(G.constrainAlignment(input, { index: 3, control: 'pc', point: target }));
      const arc = fitted.segments[3];
      near(arc.pc.x, target.x);
      near(arc.pc.y, target.y);
      near(fitted.segments[2].end.x, target.x);
      near(fitted.segments[2].end.y, target.y);
      near(fitted.segments[0].start.x, 0);
      near(fitted.segments[0].start.y, 0);
      near(fitted.segments[0].end.y, 0);
      near(fitted.segments[1].radius, 100);
      assert.ok(G.distance(fitted.segments[1].pt, p(200, 100)) > .1, 'The earlier curve refits to the rotated connection');
      if (withExit) {
        near(arc.pt.y, 400);
        assert.deepEqual(fitted.segments[4].end, p(500, 400));
      }
      near(G.nearestStation(fitted, target).distanceAlong, arc.startDistance);
    }
    assert.deepEqual(input, before);
  }
});
