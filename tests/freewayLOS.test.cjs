const {test} = require('node:test');
const assert = require('node:assert/strict');
const F = require('../freewayLOSCore.js');
const ML = require('../MLscripts.js');
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const example = { trafficVolume: 2400, lanes: 2, PHF: .9, heavyVehicles: 5,
    ffsMode: 'estimated', baseFreeFlowSpeed: 60, laneWidth: 12, rightClearance: 10,
    rampDensity: 1, terrain: 'level' };

test('archived example: corrected capacity, full-precision flow, same LOS C', () => {
    const r = F.calculate(example);
    near(r.freeFlowSpeed, 56.78);
    near(r.capacity, 2267.8);
    near(r.breakpoint, 1728.8);
    near(r.fHV, 20 / 21);
    near(r.flow, 1400);
    near(r.speed, 56.78);
    near(r.density, 24.6565692145);
    assert.equal(r.los, 'C');
});

test('geometry subtracts decimal penalties and interpolates fractional clearance', () => {
    const r = F.estimateFFS({...example, baseFreeFlowSpeed: 75.4, laneWidth: 11.5, rightClearance: 4.5});
    near(r.lane, 1.9);
    near(r.lateral, .9);
    near(r.speed, 69.38);
    near(F.estimateFFS({...example, laneWidth: 10.5}).lane, 6.6);
    near(F.estimateFFS({...example, laneWidth: 12.5}).lane, 0);
});

test('all right-clearance rows and lane columns reproduce Exhibit 12-21', () => {
    const atZero = [3.6, 2.4, 1.2, .6];
    for (const [idx, n] of [2,3,4,5].entries()) {
        for (let clearance = 0; clearance <= 6; clearance++) {
            near(F.estimateFFS({...example, lanes: n, rightClearance: clearance}).lateral, atZero[idx] * (6-clearance)/6);
        }
    }
    near(F.estimateFFS({...example, lanes: 10, rightClearance: 1.5}).lateral, .45);
    near(F.estimateFFS({...example, rightClearance: 10}).lateral, 0);
});

test('measured FFS bypasses geometry and directional lane count scales demand', () => {
    const r = F.calculate({...example, ffsMode: 'measured', freeFlowSpeed: 65, lanes: 5, laneWidth: NaN});
    near(r.freeFlowSpeed, 65);
    near(r.flow, 560);
    assert.equal(r.adjustments, null);
    assert.equal(r.los, 'A');
});

test('freeway speed curve differs from multilane: variable breakpoint and exponent 2', () => {
    const r = F.operatingConditions(2100, 65);
    near(r.capacity, 2350);
    near(r.breakpoint, 1400);
    near(r.speed, 58.062480763311175);
    near(r.density, 36.16793448010814);
    assert.equal(r.los, 'E'); // Using flow/FFS would incorrectly give LOS D.
    assert.notEqual(r.speed, ML.operatingConditions(2100, 65).speed);
    near(F.operatingConditions(1600, 60).speed, 60);
    assert.ok(F.operatingConditions(1601, 60).speed < 60);
});

test('capacity ceiling, endpoints and oversaturation across supported FFS', () => {
    for (const [ffs, capacity, bp] of [[55,2250,1800],[60,2300,1600],[65,2350,1400],[70,2400,1200],[75,2400,1000]]) {
        const r = F.operatingConditions(capacity, ffs);
        near(r.capacity, capacity);
        near(r.breakpoint, bp);
        near(r.density, 45);
        assert.equal(r.los, 'E');
        const over = F.operatingConditions(capacity + .001, ffs);
        assert.equal(over.los, 'F');
        assert.equal(over.speed, null);
        assert.equal(over.density, null);
    }
    const r = F.calculate({...example, trafficVolume: 2267.8 * .9 * 2 / 1.05});
    assert.equal(r.los, 'E');
    near(r.density, 45);
});

test('general terrain, zero heavy vehicles and zero demand', () => {
    near(F.calculate({...example, terrain: 'rolling'}).fHV, 1/1.1);
    const r = F.calculate({...example, heavyVehicles: 0, terrain: 'specific', gradePercent: -7, gradeLength: 500});
    near(r.fHV, 1);
    assert.equal(F.calculate({...example, trafficVolume: 0}).los, 'A');
});

test('specific grade shares verified Chapter 12 PCEs including interpolation', () => {
    const i = {...example, terrain: 'specific', gradePercent: 2.25, gradeLength: 3200, heavyVehicles: 13, sutMix: 50};
    near(F.calculate(i).ET, ML.getPCE(2.25, 3200/5280, 13, 50));
    near(F.calculate({...i, gradePercent: -2}).ET, ML.getPCE(-2, 3200/5280, 13, 50));
    for (const patch of [{gradePercent: -2.5}, {gradePercent: 7}, {gradeLength: 659}, {heavyVehicles: 1}, {sutMix: 40}]) {
        assert.throws(() => F.calculate({...i, ...patch}), /verified PCE/);
    }
    const r = F.calculate({...i, gradePercent: -7, pceOverride: 2.2, pceSource: 'Local study'});
    near(r.ET, 2.2);
    assert.match(r.basis, /Local study/);
});

test('overrides require a source and cannot silently accept invalid values', () => {
    for (const value of [.9, NaN, Infinity]) assert.throws(() => F.calculate({...example, pceOverride: value, pceSource: 'Study'}));
    assert.throws(() => F.calculate({...example, pceOverride: 2, pceSource: ''}), /basis\/source/);
});

test('inclusive density boundaries flow through freeway speed calculation', () => {
    // Invert the monotone speed-flow relationship independently by bisection.
    for (const [target, expected] of [[10.999,'A'],[11.001,'B'],[17.999,'B'],[18.001,'C'],[25.999,'C'],[26.001,'D'],[34.999,'D'],[35.001,'E']]) {
        let lo = 0, hi = 2350;
        for (let k=0;k<60;k++) {
            const q=(lo+hi)/2;
            const s=q<=1400 ? 65 : 65-(65-2350/45)*((q-1400)/950)**2;
            if (q/s < target) lo=q; else hi=q;
        }
        assert.equal(F.operatingConditions((lo+hi)/2,65).los, expected);
    }
    // Exact cutoffs are the shared, already independently tested classifier.
    for (const [d, los] of [[11,'A'],[18,'B'],[26,'C'],[35,'D'],[45,'E']]) assert.equal(ML.getLOS(d),los);
});

test('invalid input is rejected instead of producing a plausible LOS', () => {
    for (const patch of [{trafficVolume: NaN}, {trafficVolume: -1}, {PHF: 0}, {PHF: 1.01}, {lanes: 1},
        {lanes: 2.5}, {heavyVehicles: 101}, {laneWidth: 9.9}, {rightClearance: -1}, {rampDensity: -1},
        {rampDensity: 6.1}, {ffsMode: 'guess'}, {terrain: 'mountainous'}, {baseFreeFlowSpeed: ''}]) {
        assert.throws(() => F.calculate({...example, ...patch}), JSON.stringify(patch));
    }
    for (const freeFlowSpeed of [54.99, 75.01, Infinity, NaN, '65']) {
        assert.throws(() => F.calculate({...example, ffsMode: 'measured', freeFlowSpeed}), /55 to 75/);
    }
    assert.throws(() => F.calculate({...example, baseFreeFlowSpeed: 75.4, rampDensity: 0}), /55 to 75/);
});
