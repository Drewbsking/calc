const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../scripts/accessDensityCore.js');

const point = (x, y) => ({ x, y });
const polar = (degrees, radius = 100, center = point(0, 0)) => ({
  x: center.x + radius * Math.cos(degrees * Math.PI / 180),
  y: center.y + radius * Math.sin(degrees * Math.PI / 180)
});
const close = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
};
const closePoint = (actual, expected, tolerance) => {
  close(actual.x, expected.x, tolerance);
  close(actual.y, expected.y, tolerance);
};
// Independent fixture: 100 m tangent, radius-100 m quarter circle, 200 m tangent.
const mixed = () => G.buildAlignment([
  { type: 'line', start: point(0, -100), end: point(0, 0) },
  { type: 'curve', pc: point(0, 0), mid: point(100 - 100 / Math.sqrt(2), 100 / Math.sqrt(2)), pt: point(100, 100) },
  { type: 'line', start: point(100, 100), end: point(300, 100) }
]);

test('straight-line length uses endpoint distance and converts meters to feet', () => {
  close(G.line(point(12, -7), point(15, -3)).length, 5);
  close(G.toFeet(G.line(point(0, 0), point(152.4, 0)).length), 500);
  assert.equal(G.toMeters(5280), 1609.344);
});

test('circle through three points has the independently known center and radius', () => {
  const result = G.circleThroughPoints(point(10, -3), point(5, 2), point(0, -3));
  closePoint(result.center, point(5, -3));
  close(result.radius, 5);
  [point(10, -3), point(5, 2), point(0, -3)].forEach(p => close(G.distance(p, result.center), 5));
});

test('circle fit stays stable with large coordinate offsets', () => {
  const center = point(7000000, 4500000);
  const result = G.circleThroughPoints(polar(0, 250, center), polar(45, 250, center), polar(90, 250, center));
  closePoint(result.center, center, 1e-6);
  close(result.radius, 250, 1e-6);
});

test('counterclockwise arc has positive sweep and true circular length', () => {
  const arc = G.curve(polar(0), polar(45), polar(90));
  assert.equal(arc.direction, 'ccw');
  close(arc.sweep, Math.PI / 2);
  close(arc.radius, 100);
  close(arc.arcLength, 50 * Math.PI);
  assert.ok(arc.arcLength > G.distance(arc.pc, arc.pt));
});

test('clockwise arc has negative sweep with the same positive length', () => {
  const arc = G.curve(polar(90), polar(45), polar(0));
  assert.equal(arc.direction, 'cw');
  close(arc.sweep, -Math.PI / 2);
  close(arc.arcLength, 50 * Math.PI);
});

test('curve direction and length cross the atan2 angle boundary in either direction', () => {
  const ccw = G.curve(polar(170), polar(180), polar(190));
  const cw = G.curve(polar(190), polar(180), polar(170));
  close(ccw.sweep, 20 * Math.PI / 180);
  close(cw.sweep, -20 * Math.PI / 180);
  close(ccw.length, 100 * 20 * Math.PI / 180);
  close(cw.length, ccw.length);
  closePoint(G.pointOnSegment(ccw, ccw.length / 2), point(-100, 0));
});

test('MID chooses the major arc when necessary instead of the shorter arc', () => {
  const arc = G.curve(polar(0), polar(180), polar(90));
  assert.equal(arc.direction, 'cw');
  close(arc.sweep, -3 * Math.PI / 2);
  close(arc.length, 150 * Math.PI);
  closePoint(G.pointOnSegment(arc, 100 * Math.PI), point(-100, 0));
  const reverse = G.curve(polar(90), polar(180), polar(0));
  assert.equal(reverse.direction, 'ccw');
  close(reverse.length, arc.length);
});

test('MID does not have to be the halfway point of the arc', () => {
  const arc = G.curve(polar(0), polar(10), polar(90));
  close(arc.length, 50 * Math.PI);
  closePoint(G.pointOnSegment(arc, arc.length / 2), polar(45));
});

test('collinear, nearly collinear, coincident, and nonfinite controls are rejected', () => {
  assert.throws(() => G.curve(point(0, 0), point(50, 0), point(100, 0)), /nearly straight/);
  assert.throws(() => G.curve(point(0, 0), point(50, 1e-8), point(100, 0)), /nearly straight/);
  assert.throws(() => G.curve(point(0, 0), point(0, 0), point(100, 0)), /different/);
  assert.throws(() => G.curve(point(0, 0), point(50, 30), point(0, 0)), /different/);
  assert.throws(() => G.line(point(0, 0), point(Infinity, 0)), /finite/);
  assert.throws(() => G.line(point(0, 0), point(0, 0)), /different/);
});

test('cumulative stationing adds tangents and true arc lengths', () => {
  const alignment = mixed();
  close(alignment.segments[0].startDistance, 0);
  close(alignment.segments[0].endDistance, 100);
  close(alignment.segments[1].startDistance, 100);
  close(alignment.segments[1].endDistance, 100 + 50 * Math.PI);
  close(alignment.segments[2].startDistance, 100 + 50 * Math.PI);
  close(alignment.totalLength, 300 + 50 * Math.PI);
});

test('station location on each tangent uses cumulative distance', () => {
  const alignment = mixed();
  closePoint(G.locationAtStation(alignment, G.toFeet(25)).point, point(0, -75));
  const afterCurve = G.locationAtStation(alignment, G.toFeet(100 + 50 * Math.PI + 80));
  closePoint(afterCurve.point, point(180, 100));
  assert.equal(afterCurve.segmentIndex, 2);
});

test('station location on a curve follows the circle rather than its chord', () => {
  const location = G.locationAtStation(mixed(), G.toFeet(100 + 25 * Math.PI));
  closePoint(location.point, point(100 - 100 / Math.sqrt(2), 100 / Math.sqrt(2)));
  closePoint(location.tangent, point(1 / Math.sqrt(2), 1 / Math.sqrt(2)));
  assert.equal(location.segmentIndex, 1);
});

test('both ends and shared joins locate exactly; stations beyond the alignment return null', () => {
  const alignment = mixed();
  closePoint(G.locationAtStation(alignment, 0).point, point(0, -100));
  closePoint(G.locationAtStation(alignment, G.toFeet(100)).point, point(0, 0));
  closePoint(G.locationAtStation(alignment, G.toFeet(100 + 50 * Math.PI)).point, point(100, 100));
  closePoint(G.locationAtStation(alignment, G.toFeet(alignment.totalLength)).point, point(300, 100));
  assert.equal(G.locationAtStation(alignment, -1), null);
  assert.equal(G.locationAtStation(alignment, G.toFeet(alignment.totalLength) + 1), null);
  assert.equal(G.locationAtStation(G.buildAlignment([]), 0), null);
});

test('500-foot station labels continue across mixed geometry without duplicate joins', () => {
  const labels = G.stationLocations(mixed());
  assert.deepEqual(labels.map(p => Math.round(p.stationFeet)), [0, 500, 1000]);
  assert.equal(labels[1].segmentIndex, 1);
  closePoint(labels[1].point, point(100 - 100 * Math.cos(.524), 100 * Math.sin(.524)));
  const exact = G.buildAlignment([{ type: 'line', start: point(0, 0), end: point(304.8, 0) }]);
  assert.deepEqual(G.stationLocations(exact).map(p => Math.round(p.stationFeet)), [0, 500, 1000]);
});

test('standard station formatting and rounding carry across hundreds', () => {
  for (const [feet, expected] of [[0, '0+00'], [500, '5+00'], [1000, '10+00'], [10500, '105+00']]) {
    assert.equal(G.formatStation(feet), expected);
  }
  assert.equal(G.formatStation(99.999, 2), '1+00.00');
  assert.equal(G.formatStation(10501.25, 2), '105+01.25');
  assert.equal(G.formatStation(NaN), '—');
});

test('nearest station on a tangent uses perpendicular projection with finite endpoints', () => {
  const alignment = G.buildAlignment([{ type: 'line', start: point(0, 0), end: point(100, 0) }]);
  const nearest = G.nearestStation(alignment, point(25, 12));
  closePoint(nearest.point, point(25, 0));
  close(nearest.distanceAlong, 25);
  close(nearest.offset, 12);
  close(G.nearestStation(alignment, point(-10, 4)).stationFeet, 0);
  close(G.nearestStation(alignment, point(120, -2)).distanceAlong, 100);
});

test('nearest station on a circular arc uses radial projection and cumulative arc distance', () => {
  const alignment = mixed();
  const nearest = G.nearestStation(alignment, point(100 - 110 / Math.sqrt(2), 110 / Math.sqrt(2)));
  close(nearest.distanceAlong, 100 + 25 * Math.PI);
  close(nearest.offset, 10);
  closePoint(nearest.point, point(100 - 100 / Math.sqrt(2), 100 / Math.sqrt(2)));
});

test('nearest curve station respects arc limits, major arcs, and wraparound', () => {
  const quarter = G.buildAlignment([{ type: 'curve', pc: polar(0), mid: polar(45), pt: polar(90) }]);
  close(G.nearestStation(quarter, polar(-20, 120)).distanceAlong, 0);
  close(G.nearestStation(quarter, polar(120, 120)).distanceAlong, 50 * Math.PI);
  const major = G.buildAlignment([{ type: 'curve', pc: polar(0), mid: polar(180), pt: polar(90) }]);
  close(G.nearestStation(major, polar(180, 120)).distanceAlong, 100 * Math.PI);
  const wrapped = G.buildAlignment([{ type: 'curve', pc: polar(170), mid: polar(180), pt: polar(190) }]);
  close(G.nearestStation(wrapped, point(-120, 0)).distanceAlong, 100 * Math.PI / 18);
});

test('moving a shared PC or PT updates adjacent tangents and downstream stationing', () => {
  const pc = point(0, 0), mid = point(50, 50), pt = point(100, 0);
  const sections = [
    { type: 'line', start: point(-100, 0), end: pc },
    { type: 'curve', pc, mid, pt },
    { type: 'line', start: pt, end: point(200, 0) }
  ];
  const before = G.buildAlignment(sections);
  pc.x = -20;
  pt.x = 120;
  const after = G.buildAlignment(sections);
  close(after.segments[0].length, 80);
  close(after.segments[2].length, 80);
  closePoint(after.segments[0].end, after.segments[1].pc);
  closePoint(after.segments[1].pt, after.segments[2].start);
  assert.notEqual(after.totalLength, before.totalLength);
  close(after.segments[2].startDistance, 80 + after.segments[1].arcLength);
});

test('display sampling cannot change length or station location', () => {
  const alignment = mixed();
  const arc = alignment.segments[1];
  assert.notEqual(G.sampleCurve(arc, 10).length, G.sampleCurve(arc, .01).length);
  close(arc.length, 50 * Math.PI);
  closePoint(G.sampleCurve(arc)[0], arc.pc);
  closePoint(G.sampleCurve(arc).at(-1), arc.pt);
});

test('disconnected sections fail explicitly instead of creating discontinuous stations', () => {
  assert.throws(() => G.buildAlignment([
    { type: 'line', start: point(0, 0), end: point(10, 0) },
    { type: 'line', start: point(20, 0), end: point(30, 0) }
  ]), /connect/);
});

test('fixed local map frame round-trips coordinates and does not move when the origin object is edited', () => {
  const origin = { lat: 42.6389, lng: -83.2910 };
  const frame = G.localFrame(origin);
  const location = { lat: 42.64, lng: -83.285 };
  const xy = frame.toXY(location);
  const roundTrip = frame.toLatLng(xy);
  close(roundTrip.lat, location.lat, 1e-10);
  close(roundTrip.lng, location.lng, 1e-10);
  origin.lat += 1;
  closePoint(frame.toXY(location), xy);
});
