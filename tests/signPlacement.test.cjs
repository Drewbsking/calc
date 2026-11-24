const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../calculators/sign-placement/signPlacementCore.js');
const lookup = (source, approach, advisory, extra = {}) => S.lookup({ source, approach, advisory, condition: 'speed', ...extra });
const formula = (extra = {}) => S.calculate({ initial: 30, final: 15, reaction: 2.5, deceleration: 11, legibility: 60, ...extra });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('verified source cells stay separate, including the former 45/35 override', () => {
  // MMUTCD printed p. 156; MDOT printed p. 21. These are deliberately different.
  assert.equal(lookup('mmutcd', 50, 20).feet, 175);
  assert.equal(lookup('mdot', 50, 20).feet, 225);
  assert.equal(lookup('mdot', 45, 35).feet, 125);
  assert.throws(() => lookup('mmutcd', 45, 35), /published advisory-speed column/);
  assert.equal(lookup('mdot', 25, 20).feet, 100);
  assert.equal(lookup('mdot', 50, 25).feet, 215);
  assert.equal(lookup('mdot', 75, 5).feet, 745);
  assert.equal(lookup('mdot', 75, 70).feet, 200);
  assert.equal(lookup('mmutcd', 85, 80).feet, 150);
});

test('potential-stop columns and Condition A use their own source rows', () => {
  for (const [source, approach, expected] of [
    ['mmutcd', 20, 115], ['mmutcd', 70, 730], ['mdot', 70, 695],
    ['mmutcd', 75, 820], ['mdot', 75, 730], ['mmutcd', 85, 1010]
  ]) assert.equal(lookup(source, approach, undefined, { condition: 'stop' }).feet, expected);
  assert.equal(lookup('mmutcd', 20, undefined, { condition: 'A' }).feet, 225);
  assert.equal(lookup('mdot', 50, undefined, { condition: 'A' }).feet, 885);
  assert.equal(lookup('mmutcd', 85, undefined, { condition: 'A' }).feet, 1600);
});

test('site-dependent N/A stays unassigned and unused source cells remain blank', () => {
  for (const [approach, advisory] of [[20, 10], [25, 20], [40, 30], [55, 50]]) {
    const r = lookup('mmutcd', approach, advisory, { extraLegibility: true });
    assert.equal(r.status, 'site');
    assert.equal(r.feet, null);
  }
  // Equal/higher-speed columns are blank, not filled from adjacent values.
  assert.equal(S.sources.mmutcd.rows[0][4], undefined);
  assert.equal(S.sources.mdot.rows[0][7], undefined);
});

test('no nearest-speed rounding, extrapolation, or accelerating advisory lookups', () => {
  for (const [source, approach, advisory] of [
    ['mmutcd', 49, 20], ['mmutcd', 90, 20], ['mdot', 20, 10], ['mdot', 80, 20],
    ['mdot', 45, 32.5], ['mmutcd', 45, 5], ['mmutcd', 50, 50], ['mdot', 40, 45]
  ]) assert.throws(() => lookup(source, approach, advisory));
  assert.throws(() => lookup('toString', 50, 20), /source/);
  assert.throws(() => lookup('mmutcd', '', 20), /finite number/);
  assert.throws(() => lookup('mmutcd', 50, 20, { condition: 'unknown' }), /condition/);
});

test('MMUTCD Note 1 is an explicit addition and does not leak into MDOT', () => {
  const plain = lookup('mmutcd', 45, 30);
  assert.equal(plain.feet, 100);
  assert.equal(plain.minimumSpacing, true);
  const adjusted = lookup('mmutcd', 45, 30, { extraLegibility: true });
  assert.equal(adjusted.feet, 200);
  assert.equal(adjusted.baseFeet, 100);
  assert.equal(adjusted.addition, 100);
  assert.equal(lookup('mmutcd', 50, null, { condition: 'A', extraLegibility: true }).feet, 985);
  assert.equal(lookup('mmutcd', 50, null, { condition: 'stop', extraLegibility: true }).feet, 525);
  assert.equal(lookup('mdot', 45, 35, { extraLegibility: true }).feet, 125);
});

test('constant-deceleration example has independently computed distances and inches', () => {
  // 30 mph = 44 ft/s; 15 mph = 22 ft/s. Speed change takes 2 s at 11 ft/s².
  // Average braking speed is 33 ft/s, giving 66 ft; response adds 110 ft.
  const r = formula();
  close(r.initialFPS, 44);
  close(r.finalFPS, 22);
  close(r.response, 110);
  close(r.braking, 66);
  close(r.total, 176);
  close(r.placement, 116);
  close(r.letterHeight, 2);
  close(formula({ final: 0, legibility: 0 }).placement, 198);
});

test('zero response time is honored, equal speeds need no braking, credit is bounded', () => {
  close(formula({ reaction: 0 }).response, 0);
  close(formula({ final: 30 }).braking, 0);
  close(formula({ legibility: 0 }).placement, 176);
  close(formula({ legibility: 180 }).letterHeight, 6);
  assert.equal(formula({ legibility: 180 }).clamped, true);
  assert.equal(formula({ legibility: 180 }).placement, 0);
});

test('invalid inputs cannot return stale, negative, or infinite distances', () => {
  for (const value of ['', ' ', null, undefined, NaN, Infinity, -Infinity, true, '12ft']) {
    for (const field of ['initial', 'final', 'reaction', 'deceleration', 'legibility']) {
      assert.throws(() => formula({ [field]: value }), /finite number/, `${field}: ${value}`);
    }
  }
  for (const extra of [{ initial: 0 }, { initial: -1 }, { final: -1 }, { final: 31 },
    { reaction: -1 }, { deceleration: 0 }, { deceleration: -1 }, { legibility: -1 },
    { initial: 1e308 }, { deceleration: Number.MIN_VALUE }]) assert.throws(() => formula(extra));
  close(formula({ initial: '30', final: '15', reaction: '2.5' }).total, 176);
});
