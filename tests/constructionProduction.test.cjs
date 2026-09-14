const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../scripts/production/units.js');
const Q = require('../scripts/production/quantities.js');
const P = require('../scripts/production/production.js');
const C = require('../scripts/production/calendar.js');
const D = require('../scripts/production/presets.js');
const E = require('../scripts/production/engine.js');
const close = (actual, expected, tolerance = 0.00001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
function basic(operations, patch = {}) {
  return { ...D.scenario(), quantity: 120, unit: 'EA', operations, ...patch };
}
// Keep the original 7,600/2,000 acceptance example explicit; PDF defaults are tested separately.
function exampleClosure() {
  const s = D.scenario('maximum');
  s.operations[0].rate = 7600;
  s.operations[1].rate = 2000;
  s.operations[2].rate = 2000;
  return s;
}
const custom = patch => D.operation({ unit: 'EA', rateUnit: 'EA', rate: 25, ...patch });

test('unit conversions: area, volume, weight, length, count and time', () => {
  close(U.convert(21000, 'SF', 'SY'), 2333.333333333);
  assert.equal(U.convert(43560, 'SF', 'Acres'), 1);
  assert.equal(U.convert(27, 'CF', 'CY'), 1);
  assert.equal(U.convert(2000, 'LB', 'Tons'), 1);
  assert.equal(U.convert(5280, 'LF', 'Miles'), 1);
  assert.equal(U.convert(5280, 'FT', 'LF'), 5280);
  assert.equal(U.convert(120, 'EA', 'EA'), 120);
  assert.equal(U.convert(3, 'Workdays', 'Hours', 10), 30);
  assert.equal(U.convert(3, 'Calendar days', 'Hours'), 72);
  assert.throws(() => U.convert(1, 'SF', 'CY'), /compatible/);
  assert.throws(() => U.convert(1, 'bogus', 'CY'), /Unknown unit/);
});

test('concrete example quantities and productive durations without intermediate rounding', () => {
  close(Q.concreteCY(21000, 10), 648.148148148);
  close(P.duration(U.convert(21000, 'SF', 'SY'), 'SY', 1000, 'SY').days, 2.33333333333);
  close(P.duration(Q.concreteCY(21000, 10), 'CY', 500, 'CY').days, 1.2962962963);
  const s = D.scenario(); s.calendar.startDate = '2026-09-14';
  const r = E.duration(s);
  close(r.productiveDays, 3.6296296296);
  assert.equal(r.scheduledWorkdays, 4);
  assert.equal(r.rows[1].segments[0].index, 3);
  assert.equal(r.rows[1].segments.at(-1).index, 4);
  assert.equal(r.rows[2].hours, 0);
  assert.equal(r.completionDate, '2026-09-20');
  assert.equal(r.calendarDays, 7);
});

test('68,400 SF milling, each HMA lift, and total HMA quantities', () => {
  const s = exampleClosure();
  const r = E.duration(s);
  assert.equal(r.rows[0].quantity, 7600);
  close(r.rows[0].days, 1);
  assert.equal(Q.hmaTons(68400, 1.5, 145), 619.875);
  close(r.rows[1].quantity, 619.875);
  close(r.totalHmaTons, 1239.75);
  close(r.rows[1].days, 0.3099375);
  assert.equal(r.scheduledWorkdays, 2);
  assert.equal(r.rows[1].segments[0].index, r.rows[2].segments[0].index);
});

test('two-day closure completes the entire mill-and-fill sequence, controlled by milling', () => {
  const r = E.maximum(exampleClosure());
  close(r.maximum, 68400, 0.01);
  assert.equal(r.controlling, 'Cold Milling');
  assert.equal(r.scheduledWorkdays, 2);
  close(r.rows[0].quantity, 7600, 0.001);
  close(r.rows[1].quantity, 619.875, 0.001);
  close(r.totalHmaTons, 1239.75, 0.001);
  assert.ok(r.end <= r.deadline + C.EPS);
  assert.equal(r.requested.fits, true);
});

test('requiring separate lift days takes three workdays and has no positive two-day solution', () => {
  const s = exampleClosure();
  s.operations[2].relation = 'separate-day';
  assert.equal(E.duration(s).scheduledWorkdays, 3);
  const r = E.maximum(s);
  assert.equal(r.maximum, 0);
  assert.equal(r.feasible, false);
  assert.equal(r.requested.fits, false);
  assert.equal(r.minimum.scheduledWorkdays, 3);
  assert.match(r.warnings.join(' '), /requires 3 workdays/);
});

test('six workdays on Monday–Thursday finish Tuesday of week two, inclusive nine calendar days', () => {
  const s = basic([custom({ rate: 20 })]); s.calendar.startDate = '2026-09-14';
  const r = E.duration(s);
  assert.equal(r.productiveDays, 6);
  assert.equal(r.scheduledWorkdays, 6);
  assert.equal(r.completionDate, '2026-09-22');
  assert.equal(r.calendarDays, 9);
});

test('Thursday pour cures Friday through Sunday and following work starts Monday', () => {
  const s = basic([custom({ rate: 120, name: 'Pour' }), D.operation({ name: 'Cure', kind: 'calendar', calendarDays: 3 }), custom({ name: 'Mark', rate: 120 })]);
  s.calendar.startDate = '2026-09-17';
  const r = E.duration(s);
  assert.equal(C.dateLabel(r.rows[1].start), '2026-09-18');
  assert.equal(C.dateLabel(r.rows[1].end - 0.001), '2026-09-20');
  assert.equal(C.dateLabel(r.rows[2].start), '2026-09-21');
  assert.equal(r.productiveDays, 2);
  assert.equal(r.scheduledWorkdays, 2);
});

test('custom signs example and unlike rate unit conversion', () => {
  close(E.duration(basic([custom({ name: 'Install signs' })])).productiveDays, 4.8);
  close(P.duration(18000, 'SF', 1000, 'SY').days, 2);
  assert.equal(P.convertRate(1000, 'SY', 'Workdays', 'SF', 'Hours', 10), 900);
});

test('sequential fractional operations consume a single day', () => {
  const r = E.duration(basic([custom({ rate: 480 }), custom({ rate: 480 }), custom({ rate: 480 })]));
  close(r.productiveDays, 0.75);
  assert.equal(r.scheduledWorkdays, 1);
  assert.equal(r.rows[1].start, r.rows[0].end);
});

test('explicit same-day milling transition solves the larger fully sequential mathematical capacity', () => {
  const s = exampleClosure(); s.operations[1].relation = 'same-day';
  const expected = 2 / (1 / 9 / 7600 + 2 * (1.5 / 12 * 145 / 2000) / 2000);
  const r = E.maximum(s);
  close(r.maximum, expected, 0.01);
  assert.ok(r.maximum > 68400);
  assert.match(r.controlling, /Combined sequence/);
});

test('globally preventing same-day transitions consumes separate workdays', () => {
  const s = basic([custom({ rate: 480 }), custom({ rate: 480 })], { allowSameDay: false });
  assert.equal(E.duration(s).scheduledWorkdays, 2);
});

test('concurrent independent crews share time and successor waits for all', () => {
  const s = basic([custom({ name: 'Slow', rate: 60 }), custom({ name: 'Fast', rate: 120, relation: 'concurrent' }), custom({ name: 'Follow', rate: 120 })], { allowConcurrent: true });
  const r = E.duration(s);
  assert.equal(r.rows[0].start, r.rows[1].start);
  assert.ok(r.rows[2].start >= r.rows[0].end);
  assert.equal(r.productiveDays, 4);
  assert.equal(r.scheduledWorkdays, 3);
  s.allowConcurrent = false;
  assert.throws(() => E.duration(s), /Concurrent operations are disabled/);
});

test('concurrent operations normalize capacities to a common quantity', () => {
  const s = exampleClosure(); s.allowConcurrent = true;
  s.operations[1].relation = 'concurrent'; s.operations[2].relation = 'concurrent';
  const r = E.maximum(s);
  close(r.maximum, 136800, 0.01);
  assert.equal(r.controlling, 'Cold Milling');
});

test('minimum calendar delay consumes shift time and rolls to next shift', () => {
  const s = basic([custom({ rate: 240 }), custom({ rate: 240, delayHours: 5 })]);
  const r = E.duration(s);
  assert.equal(r.scheduledWorkdays, 2);
  assert.ok(r.rows[1].start >= r.rows[0].end + 5);
});

test('rolling calendar activities begin immediately and do not add crew days', () => {
  const s = basic([custom({ rate: 240 }), D.operation({ name: 'Wait', kind: 'calendar', calendarRule: 'rolling', calendarDays: 0.125 }), custom({ rate: 960 })]);
  const r = E.duration(s);
  assert.equal(r.rows[1].start, r.rows[0].end);
  assert.equal(r.rows[1].end - r.rows[1].start, 3);
  assert.equal(r.scheduledWorkdays, 1);
  close(r.productiveDays, 0.625);
});

test('holiday is skipped while calendar curing continues', () => {
  const s = basic([custom({ rate: 120 })]);
  s.calendar.startDate = '2026-09-14'; s.calendar.holidays = ['2026-09-14'];
  const r = E.duration(s);
  assert.equal(r.completionDate, '2026-09-15');
  assert.equal(r.calendarDays, 2);
});

test('weekend date window clips shifts to start and finish times', () => {
  const s = basic([custom({ rate: 10, ratePeriod: 'Hours' })], { mode: 'maximum', quantity: 90 });
  s.calendar.weekdays = [6, 0];
  s.closure = { type: 'dates', start: '2026-09-19T10:00', end: '2026-09-20T11:00' };
  const r = E.maximum(s);
  assert.equal(r.availableHours, 9);
  close(r.maximum, 90, 0.001);
  assert.ok(r.end <= r.deadline + C.EPS);
  assert.equal(r.requested.fits, true);
});

test('overnight shift continues into next calendar day', () => {
  const s = basic([custom({ rate: 120 })]);
  s.calendar.startDate = '2026-09-14'; s.calendar.shiftStart = '22:00';
  const r = E.duration(s);
  assert.equal(r.scheduledWorkdays, 1);
  assert.equal(r.calendarDays, 2);
  assert.equal(r.completionDate, '2026-09-15');
  assert.equal(C.timeLabel(r.end), '06:00');
});

test('closure beginning inside a prior overnight shift retains its available hours', () => {
  const s = basic([custom({ rate: 10, ratePeriod: 'Hours' })], { mode: 'maximum' });
  s.calendar.weekdays = [1]; s.calendar.shiftStart = '22:00';
  s.closure = { type: 'dates', start: '2026-09-15T01:00', end: '2026-09-15T05:00' };
  const r = E.maximum(s);
  assert.equal(r.availableHours, 4);
  close(r.maximum, 40, 0.001);
});

test('variable weekday hours use the explicit reference workday rate basis', () => {
  const s = basic([custom({ rate: 120 })]);
  s.calendar.startDate = '2026-09-14'; s.calendar.dailyHours = { 1: 4 };
  const r = E.duration(s);
  assert.equal(r.productiveDays, 1);
  assert.equal(r.scheduledWorkdays, 2);
  assert.equal(r.rows[0].segments[0].hours, 4);
});

test('fractional closure workdays constrain complete production', () => {
  const s = basic([custom({ rate: 80 })], { mode: 'maximum' });
  s.closure.workdays = 0.5;
  const r = E.maximum(s);
  close(r.maximum, 40, 0.001);
  assert.equal(r.availableHours, 4);
});

test('fixed setup and quantity factors work in the inverse without scaling setup', () => {
  const s = basic([custom({ transform: 'fixed', quantity: 1, rate: 4 }), custom({ transform: 'factor', factor: 2, rate: 200 })], { mode: 'maximum' });
  s.closure.workdays = 1;
  const r = E.maximum(s);
  close(r.maximum, 75, 0.001);
  assert.equal(r.rows[0].quantity, 1);
  close(r.rows[1].quantity, 150, 0.001);
});

test('inverse needs a scalable quantity, and fixed work can make closure infeasible', () => {
  assert.throws(() => E.maximum(basic([custom({ transform: 'fixed' })], { mode: 'maximum' })), /no finite maximum/);
  const s = basic([custom({ transform: 'fixed', quantity: 120, rate: 25 }), custom()], { mode: 'maximum' });
  assert.equal(E.maximum(s).maximum, 0);
});

test('missing and zero rates fail clearly instead of claiming a complete result', () => {
  for (const rate of [0, '', -1, Infinity, NaN]) assert.throws(() => E.duration(basic([custom({ rate })])), /Production rate/);
  const s = D.scenario(); s.operations[1].thickness = 0;
  assert.throws(() => E.duration(s), /Thickness/);
});

test('invalid calendar configurations and date windows are rejected', () => {
  assert.throws(() => C.create({ weekdays: [] }), /weekday/);
  assert.throws(() => C.create({ hoursPerDay: 25 }), /24/);
  assert.throws(() => C.create({ startDate: '2026-02-30' }), /Invalid date/);
  assert.throws(() => C.create({ weekdays: [1], dailyHours: { 1: 0 } }), /positive hours/);
  assert.throws(() => C.create({}, { type: 'dates', start: '2026-09-14T10:00', end: '2026-09-14T09:00' }), /after/);
  assert.throws(() => C.create({ weekdays: [1] }, { type: 'dates', start: '2026-09-19T07:00', end: '2026-09-20T15:00' }), /no working hours/);
});

test('enabled operations are obligations; disabled required operations are invalid', () => {
  const s = basic([custom(), custom({ name: 'Excluded', enabled: false, required: false })]);
  assert.equal(E.duration(s).rows.length, 1);
  assert.match(E.duration(s).warnings.join(' '), /Excluded/);
  s.operations[1].required = true;
  assert.throws(() => E.duration(s), /required operation is disabled/);
  assert.throws(() => E.duration(basic([])), /at least one/);
});

test('rate libraries and templates are isolated editable data', () => {
  const libraries = D.libraries(); libraries[0].rates.find(r => r.id === 'removal').low = 800;
  const template = D.template('concrete', libraries[0].rates, 'low');
  assert.equal(template[0].rate, 800);
  assert.equal(D.rates.find(r => r.id === 'removal').low, 1000);
  assert.equal(D.template('concrete')[0].rate, 1000);
  assert.equal(D.fromRate('freeway').rate, 750);
});

test('maximum is feasible and increasing it materially breaks the same forward schedule', () => {
  for (const separate of [false, true]) {
    const s = exampleClosure();
    if (!separate) s.operations[1].relation = 'sequential';
    const r = E.maximum(s);
    const compiled = E.compile(s, r.calendar);
    assert.ok(E.schedule(s, r.maximum, r.calendar, compiled).end <= r.deadline + C.EPS);
    assert.ok(E.schedule(s, r.maximum * 1.001, r.calendar, compiled).end > r.deadline + C.EPS);
  }
});

test('additional lifts remain distinct quantity and schedule operations', () => {
  const s = exampleClosure(); s.operations.push(D.lift(3));
  s.operations[1].thickness = 2;
  const r = E.duration(s);
  assert.equal(r.rows.filter(o => o.transform === 'hma').length, 3);
  close(r.totalHmaTons, Q.hmaTons(68400, 5, 145));
});

test('numeric strings from edited form controls have the same quantities and formulas', () => {
  const s = D.scenario();
  s.quantity = '21000'; s.calendar.hoursPerDay = '8'; s.operations[1].thickness = '10'; s.operations[1].rate = '500';
  const r = E.duration(s);
  close(r.rows[1].quantity, 648.148148148);
  assert.match(r.rows[1].formula, /10\/12/);
  assert.equal(Q.derive('68400', 'SF', { transform: 'hma', thickness: '1.5', unit: 'Tons' }, '145').tons, 619.875);
});

test('whole-item maxima round down while exact integer capacity is retained', () => {
  const s = basic([custom({ rate: 25 })], { mode: 'maximum' });
  s.closure.workdays = 1.5;
  assert.equal(E.maximum(s).maximum, 37);
  s.closure.workdays = 2;
  assert.equal(E.maximum(s).maximum, 50);
  s.closure.workdays = 0.01;
  assert.equal(E.maximum(s).maximum, 0);
});

test('negative requested quantities are not silently ignored in closure mode', () => {
  const s = exampleClosure(); s.quantity = '-10';
  assert.throws(() => E.maximum(s), /Requested quantity/);
});
