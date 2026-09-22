const test = require('node:test');
const assert = require('node:assert/strict');
const ML = require('../MLscripts.js');
const data = require('../ML2010data.js');
const reference = require('./fixtures/ml_hcm2010_pce.json');
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const base = { edition: '2010', trafficVolume: 1900, PHF: .9, percentTrucks: 13, percentRVs: 2, driverFactor: 1,
    terrain: 'specific', gradeLength: 3200, gradePercent: 2.5, ffsMode: 'measured', freeFlowSpeed: 56, sutMix: 50 };
const geometry = { baseFreeFlowSpeed: 65, laneWidth: 11, rightClearance: 4, leftClearance: 6,
    accessPoints: 20, medianType: 'undivided' };

for (const [table, kind] of [['truckUpgrades', 'ET'], ['rvUpgrades', 'ER']]) {
    test(`2010 ${table}: every printed PCE and band matches the independently extracted PDF fixture`, () => {
        const rows = data[table].flatMap(group => group.rows.map(([length, values]) => [
            Number.isFinite(group.maxGrade) ? group.maxGrade : null, Number.isFinite(length) ? length : null, ...values]));
        assert.deepEqual(rows, reference[table]);
        for (const [grade, length, ...values] of reference[table]) {
            reference.percentages.forEach((pct, i) => {
                if (kind === 'ET' && grade === null && length === .25 && pct === 25) {
                    assert.throws(() => ML.getPCE2010(kind, 'upgrade', 7, length, pct), /conflicts/);
                } else near(ML.getPCE2010(kind, 'upgrade', grade ?? 7, length ?? 2, pct), values[i]);
            });
        }
    });
}

test('2010 downgrades reach every source table cell, including long steep grades', () => {
    for (const [grade, length, ...values] of reference.truckDowngrades) {
        reference.downgradePercentages.forEach((pct, i) => near(ML.getPCE2010('ET', 'downgrade', grade, length, pct), values[i]));
        near(ML.getPCE2010('ER', 'downgrade', grade, length, 15), 1.2);
    }
    near(ML.getPCE2010('ET', 'downgrade', 5.01, 4.001, 12.5), 4);
    near(ML.getPCE2010('ET', 'downgrade', 6.01, 4.001, 12.5), 5.8);
    near(ML.getPCE2010('ET', 'downgrade', 3.999, 20, 1), 1.5);
});

test('2010 grade and length bands honor exact upper boundaries', () => {
    const et = (g, l) => ML.getPCE2010('ET', 'upgrade', g, l, 2);
    near(et(2, 2), 1.5); near(et(2.001, 2), 3);
    near(et(3, .5), 1.5); near(et(3.001, .5), 2);
    near(et(4, .5), 2); near(et(4.001, .5), 3);
    near(et(5, .3), 3); near(et(5.001, .3), 4);
    near(et(6, .25), 2); near(et(6.001, .25), 4);
    near(et(5.5, .25), 2); near(et(5.5, .25001), 4);
    near(et(5.5, .3), 4); near(et(5.5, .30001), 4.5);
    near(et(2.5, .75), 1.5); near(et(2.5, .75001), 2);
    near(et(2.5, 1.5), 2.5); near(et(2.5, 1.50001), 3);
    near(ML.getPCE2010('ER', 'upgrade', 3, .5, 2), 1.2);
    near(ML.getPCE2010('ER', 'upgrade', 3, .50001, 2), 3);
    near(ML.getPCE2010('ER', 'upgrade', 4, .6, 15), 2);
});

test('2010 interpolates vehicle percentages to the nearest tenth without nearest-column lookup', () => {
    near(ML.getPCE2010('ER', 'upgrade', 2.5, .6, 3), 2.3);
    near(ML.getPCE2010('ET', 'upgrade', 4.5, .5, 3), 2.8);
    near(ML.getPCE2010('ET', 'upgrade', 4.5, .5, 3.6), 2.6);
});

test('2010 unsupported percentages and disputed endpoint require overrides without silent extrapolation', () => {
    for (const pct of [1, 25.1]) assert.throws(() => ML.getPCE2010('ET', 'upgrade', 3, 1, pct), /from 2 to 25/);
    for (const pct of [4.9, 20.1]) assert.throws(() => ML.getPCE2010('ET', 'downgrade', 6, 5, pct), /from 5 to 20/);
    assert.throws(() => ML.getPCE2010('ET', 'upgrade', 7, .25, 22), /verified upgrade ET/);
    near(ML.getPCE2010('ET', 'upgrade', 7, .25, 20), 2);
    const output = ML.calculate({ ...base, gradePercent: 7, gradeLength: 1320, percentTrucks: 25 });
    assert.match(output.results.upgrade.error, /conflicts/);
    assert.equal(output.results.downgrade.los, 'C');
    const override = ML.calculate({ ...base, gradePercent: 7, gradeLength: 1320, percentTrucks: 25,
        upgradeET2010: 2, pceSource2010: 'Verified study' });
    near(override.results.upgrade.ET, 2);
    assert.equal(override.results.upgrade.usedOverride, true);
});

test('HCM 2010 published example 1: estimated 56.1 mph, 55 mph curve and LOS C both ways', () => {
    const out = ML.calculate({ ...base, ...geometry, ffsMode: 'estimated' });
    near(out.freeFlowSpeed, 56.1); assert.equal(out.curveSpeed, 55);
    const up = out.results.upgrade, down = out.results.downgrade;
    near(up.ET, 1.5); near(up.ER, 3); near(down.ET, 1.5); near(down.ER, 1.2);
    near(up.fHV, 1 / 1.105); near(down.fHV, 1 / 1.069);
    near(up.flow, 1166.388888888889); near(down.flow, 1128.388888888889);
    near(up.density, 21.207070707070706); near(down.density, 20.516161616161616);
    assert.equal(up.los, 'C'); assert.equal(down.los, 'C');
});

test('2010 selects only its four curves, with ties upward and excluded 62.5 mph endpoint', () => {
    for (const [ffs, curve] of [[42.5,45],[47.4999,45],[47.5,50],[52.4999,50],[52.5,55],
        [56,55],[57.4999,55],[57.5,60],[62.4999,60]]) assert.equal(ML.selectCurve2010(ffs), curve);
    for (const ffs of [42.499,62.5,70,NaN,Infinity,'42.5']) assert.throws(() => ML.selectCurve2010(ffs));
    const out = ML.calculate({ ...base, ...geometry, ffsMode: 'estimated', baseFreeFlowSpeed: 66.4 });
    assert.equal(out.curveSpeed, 60); // Geometry yields the exact 57.5 mph half-step.
});

test('2010 speed equations match published coefficients and keep capacity endpoints at LOS E', () => {
    for (const [ffs,c,a,limit] of [[45,1900,2.78,45],[50,2000,3.49,43],[55,2100,3.78,41],[60,2200,5,40]]) {
        const below = ML.operatingConditions2010(1400, ffs);
        near(below.speed, ffs);
        const mid = ML.operatingConditions2010((1400+c)/2, ffs);
        near(mid.speed, ffs - a * .5 ** 1.31);
        near(mid.density, ((1400+c)/2)/mid.speed);
        const end = ML.operatingConditions2010(c, ffs);
        near(end.speed, ffs - a); near(end.capacity, c);
        near(end.densityLimit, limit); assert.equal(end.los, 'E');
        const over = ML.operatingConditions2010(c+.001, ffs);
        assert.equal(over.los,'F'); assert.equal(over.speed,null); assert.equal(over.density,null);
        assert.equal(ML.operatingConditions2010(0, ffs).los, 'A');
    }
});

test('2010 uses volume, PHF, driver factor, RV share and actual grade length', () => {
    const first = ML.calculate(base).results.upgrade;
    near(ML.calculate({ ...base, trafficVolume: 3800 }).results.upgrade.flow, first.flow * 2);
    near(ML.calculate({ ...base, PHF: 1 }).results.upgrade.flow, first.flow * .9);
    near(ML.calculate({ ...base, driverFactor: .85 }).results.upgrade.flow, first.flow / .85);
    assert.notEqual(ML.calculate({ ...base, percentRVs: 10 }).results.upgrade.flow, first.flow);
    assert.notEqual(ML.calculate({ ...base, gradeLength: 1000 }).results.upgrade.ER, first.ER);
});

test('2010 general terrain, missing vehicle classes, and inactive overrides', () => {
    for (const [terrain,ET,ER] of [['level',1.5,1.2],['rolling',2.5,2]]) {
        const out = ML.calculate({ ...base, terrain, gradePercent: NaN, upgradeET2010: 9, upgradeER2010: 9 }).results.segment;
        near(out.ET, ET); near(out.ER, ER);
    }
    const none = ML.calculate({ ...base, percentTrucks: 0, percentRVs: 0, gradePercent: 20 });
    near(none.results.upgrade.fHV, 1); near(none.results.downgrade.fHV, 1);
    const rvOnly = ML.calculate({ ...base, percentTrucks: 0 });
    near(rvOnly.results.upgrade.fHV, 1 / 1.04);
    const modernOverride = ML.calculate({ ...base, upgradePCE: 12, pceSource: '6th Edition study' });
    near(modernOverride.results.upgrade.ET, 1.5);
});

test('2010 overrides need sources and preserve separately verified precision', () => {
    const invalid = ML.calculate({ ...base, upgradeER2010: 2.35 });
    assert.match(invalid.results.upgrade.error, /basis\/source/);
    assert.equal(invalid.results.downgrade.los, 'C');
    const out = ML.calculate({ ...base, upgradeER2010: 2.35, pceSource2010: 'Local study' });
    near(out.results.upgrade.ER, 2.35);
    near(out.results.upgrade.fHV, 1 / (1 + .13 * .5 + .02 * 1.35));
});

test('comparison shares demand and geometry while preserving edition-specific factors and errors', () => {
    const input = { ...base, gradePercent: 2, heavyVehicles: 80 };
    const both = ML.calculateBoth(input);
    assert.equal(both['2010'].curveSpeed, 55);
    near(both['6th'].freeFlowSpeed, 56);
    near(both['2010'].results.upgrade.capacity, 2100);
    near(both['6th'].results.upgrade.capacity, 2120);
    assert.deepEqual(both['6th'], ML.calculate({ ...input, edition: '6th', heavyVehicles: 15 }));
    assert.notEqual(both['2010'].results.upgrade.fHV, both['6th'].results.upgrade.fHV);
    const driver = ML.calculateBoth({ ...input, driverFactor: .85 });
    assert.deepEqual(driver['6th'], both['6th']);
    const unsupported = ML.calculateBoth({ ...input, freeFlowSpeed: 65 });
    assert.match(unsupported['2010'].error, /HCM 2010 FFS/);
    assert.equal(unsupported['6th'].freeFlowSpeed, 65);
    const low = ML.calculateBoth({ ...input, freeFlowSpeed: 43 });
    assert.match(low['6th'].error, /45 to 70/);
    assert.equal(low['2010'].curveSpeed, 45);
    const grade = ML.calculateBoth(base);
    assert.equal(grade['2010'].results.downgrade.los, 'C');
    assert.match(grade['6th'].results.downgrade.error, /from -2 to 6/);
});

test('invalid 2010 inputs and impossible combined percentages cannot produce results', () => {
    for (const change of [{ percentTrucks: 99 }, { percentRVs: NaN }, { percentTrucks: -1 },
        { driverFactor: .84 }, { driverFactor: 0 }, { driverFactor: 1.01 }, { trafficVolume: Infinity },
        { PHF: 0 }, { gradeLength: 0 }, { freeFlowSpeed: 62.5 }, { edition: 'other' }]) {
        assert.throws(() => ML.calculate({ ...base, ...change }));
    }
    assert.throws(() => ML.calculateBoth({ ...base, percentTrucks: 99 }), /must not exceed 100/);
    assert.throws(() => ML.operatingConditions2010(-1,55));
    assert.throws(() => ML.operatingConditions2010(1000,56));
});
