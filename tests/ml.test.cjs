const test = require('node:test');
const assert = require('node:assert/strict');
const ML = require('../MLscripts.js');
const reference = require('./fixtures/ml_hcm6_pce.json');
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const base = { trafficVolume: 1900, PHF: 0.9, heavyVehicles: 15, terrain: 'specific',
    gradeLength: 3200, gradePercent: 2, sutMix: 50, ffsMode: 'measured', freeFlowSpeed: 56 };
const geometry = { baseFreeFlowSpeed: 60, laneWidth: 11, rightClearance: 4, leftClearance: 6,
    accessPoints: 20, medianType: 'divided' };

for (const [mix, rows] of Object.entries(reference.tables)) {
    test(`all 405 PCE cells match the independent ODOT exhibit for ${mix}% SUT`, () => {
        for (const [grade, length, ...values] of rows) {
            reference.percentages.forEach((percentage, i) => near(ML.getPCE(grade, length, percentage, mix), values[i]));
        }
    });
}

test('PCE interpolation uses percentage, length and signed grade, retaining precision', () => {
    // Exhibit 12-27: 2.5%, lengths .375/.625, 10%/15% columns.
    near(ML.getPCE(2.5, .5, 12.5, 50), (2.44 + 2.26 + 2.61 + 2.38) / 4);
    near(ML.getPCE(3, .5, 12.5, 50), (2.44 + 2.26 + 2.61 + 2.38 + 2.62 + 2.39 + 2.89 + 2.58) / 8);
    near(ML.getPCE(-1, .5, 12.5, 50), (2.11 + 2.02) / 2);
});

test('ODOT longest-length rule and terminal percentage column are applied', () => {
    near(ML.getPCE(6, 5, 10, 30), 4.51);
    near(ML.getPCE(2.5, 5, 15, 50), 2.47);
    near(ML.getPCE(6, 1, 35, 70), 2.90);
});

test('unsupported table conditions are reported without fallback factors', () => {
    for (const args of [[-2.01,.5,15,50],[6.01,.5,15,50],[2,.1,15,50],[2,.5,1,50],[2,.5,15,40]]) {
        assert.throws(() => ML.getPCE(...args));
    }
    const r = ML.calculate({ ...base, gradePercent: 2.5 });
    assert.equal(r.results.upgrade.los, 'C');
    assert.match(r.results.downgrade.error, /from -2 to 6/);
    assert.equal(r.results.downgrade.los, undefined);
});

test('a documented override enables an otherwise unsupported direction', () => {
    const input = { ...base, gradePercent: 6.5, upgradePCE: 4, downgradePCE: 2,
        pceSource: 'Local analysis example' };
    const r = ML.calculate(input);
    near(r.results.upgrade.fHV, 1 / 1.45);
    near(r.results.downgrade.fHV, 1 / 1.15);
    assert.equal(r.results.upgrade.basis, 'User-supplied PCE');
    assert.throws(() => ML.calculate({ ...input, pceSource: '' }), /basis\/source/);
    assert.throws(() => ML.calculate({ ...input, upgradePCE: .5 }), /at least 1/);
});

test('HCM 6th Edition keeps 56 mph and calculates continuous capacity', () => {
    const r = ML.operatingConditions(1800, 56);
    near(r.capacity, 2120);
    near(r.speed, 56 - (56 - 2120 / 45) * (400 / 720) ** 1.31);
    assert.ok(r.speed < 56);
    near(r.density, 1800 / r.speed);
    assert.equal(ML.operatingConditions(1400, 56).speed, 56);
    assert.equal(ML.operatingConditions(0, 56).los, 'A');
});

test('capacity endpoints are LOS E; excess demand has no invented speed or density', () => {
    for (const ffs of [45, 50, 53.7, 55, 56, 60, 65, 70]) {
        const capacity = Math.min(1000 + 20 * ffs, 2300);
        const atCapacity = ML.operatingConditions(capacity, ffs);
        near(atCapacity.density, 45);
        assert.equal(atCapacity.los, 'E');
        const over = ML.operatingConditions(capacity + .001, ffs);
        assert.equal(over.los, 'F');
        assert.equal(over.speed, null);
        assert.equal(over.density, null);
    }
    // Demand converted back from exact capacity can exceed it by a binary ULP.
    const converted = ML.calculate({ ...base, terrain: 'level', heavyVehicles: 13,
        PHF: .75, trafficVolume: 2120 * .75 * 2 / 1.13 }).results.segment;
    assert.equal(converted.los, 'E');
    near(converted.density, 45);
});

test('density boundaries include zero and the 6th Edition E limit', () => {
    for (const [density, los] of [[0,'A'],[11,'A'],[11.001,'B'],[18,'B'],[18.001,'C'],
        [26,'C'],[26.001,'D'],[35,'D'],[35.001,'E'],[40,'E'],[41,'E'],[43,'E'],[45,'E'],[45.001,'F']]) {
        assert.equal(ML.getLOS(density), los);
    }
    assert.throws(() => ML.getLOS(NaN));
    assert.throws(() => ML.getLOS(-1));
});

test('FFS estimation follows lane bands and rounded lateral/access adjustments', () => {
    const r = ML.estimateFFS(geometry);
    near(r.speed, 52.7); // 60 - 1.9 - 0.4 - 0 - 5.0
    near(ML.estimateFFS({ ...geometry, laneWidth: 11.9 }).lane, 1.9);
    near(ML.estimateFFS({ ...geometry, laneWidth: 10.9 }).lane, 6.6);
    near(ML.estimateFFS({ ...geometry, laneWidth: 12 }).lane, 0);
    near(ML.estimateFFS({ ...geometry, rightClearance: 3 }).lateral, .7);
    near(ML.estimateFFS({ ...geometry, accessPoints: 5 }).access, 1.3);
    const wide = ML.estimateFFS({ ...geometry, rightClearance: 20, leftClearance: 20, accessPoints: 80 });
    near(wide.totalClearance, 12);
    near(wide.lateral, 0);
    near(wide.access, 10);
    const boundary = ML.calculate({ ...base, ...geometry, ffsMode: 'estimated',
        baseFreeFlowSpeed: 57.3, laneWidth: 10, rightClearance: 3 });
    assert.equal(boundary.freeFlowSpeed, 45);
});

test('median type controls both left clearance and median adjustment', () => {
    const divided = ML.estimateFFS({ ...geometry, leftClearance: 0 });
    near(divided.lateral, 1.8);
    const undivided = ML.estimateFFS({ ...geometry, leftClearance: NaN, medianType: 'undivided' });
    near(undivided.totalClearance, 10);
    near(undivided.median, 1.6);
    const twltl = ML.estimateFFS({ ...geometry, leftClearance: NaN, medianType: 'twltl' });
    near(twltl.totalClearance, 10);
    near(twltl.median, 0);
});

test('measured mode ignores geometry; estimated mode uses all relevant inputs', () => {
    const measured = ML.calculate(base);
    assert.deepEqual(ML.calculate({ ...base, ...geometry, laneWidth: NaN }), measured);
    const estimated = ML.calculate({ ...base, ...geometry, ffsMode: 'estimated', freeFlowSpeed: NaN });
    near(estimated.freeFlowSpeed, 52.7);
    for (const change of [{ laneWidth: 12 }, { rightClearance: 6 }, { leftClearance: 0 },
        { accessPoints: 0 }, { medianType: 'undivided' }, { baseFreeFlowSpeed: 62 }]) {
        assert.notEqual(ML.calculate({ ...base, ...geometry, ...change, ffsMode: 'estimated' }).freeFlowSpeed, estimated.freeFlowSpeed);
    }
});

test('actual volume, grade length, PHF and traffic mix affect the result', () => {
    const r = ML.calculate(base).results.upgrade;
    near(ML.calculate({ ...base, trafficVolume: 3800 }).results.upgrade.flow, 2 * r.flow);
    assert.notEqual(ML.calculate({ ...base, gradeLength: 5280 }).results.upgrade.ET, r.ET);
    assert.notEqual(ML.calculate({ ...base, PHF: 1 }).results.upgrade.flow, r.flow);
    assert.notEqual(ML.calculate({ ...base, sutMix: 30 }).results.upgrade.ET, r.ET);
});

test('general terrain and zero-heavy-vehicle cases use the appropriate factors', () => {
    const level = ML.calculate({ ...base, terrain: 'level', gradePercent: NaN }).results.segment;
    near(level.ET, 2);
    near(level.flow, 1900 * 1.15 / 1.8);
    near(ML.calculate({ ...base, terrain: 'rolling' }).results.segment.ET, 3);
    const none = ML.calculate({ ...base, heavyVehicles: 0, gradePercent: 8 });
    near(none.results.upgrade.fHV, 1);
    near(none.results.downgrade.fHV, 1);
    assert.equal(ML.calculate({ ...base, trafficVolume: 0 }).results.upgrade.los, 'A');
});

test('invalid and nonfinite inputs cannot produce an LOS', () => {
    for (const change of [{trafficVolume:NaN},{trafficVolume:-1},{trafficVolume:Infinity},{PHF:0},{PHF:.24},
        {PHF:1.1},{heavyVehicles:101},{heavyVehicles:-1},{gradeLength:0},{gradePercent:-2},
        {freeFlowSpeed:44.9},{freeFlowSpeed:70.1},{freeFlowSpeed:NaN},{terrain:'unknown'},
        {ffsMode:'unknown'},{sutMix:100}]) assert.throws(() => ML.calculate({ ...base, ...change }));
    assert.throws(() => ML.calculate({ ...base, ...geometry, laneWidth:9, ffsMode:'estimated' }));
    assert.throws(() => ML.calculate({ ...base, ...geometry, baseFreeFlowSpeed:40, ffsMode:'estimated' }));
});
