const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('../scripts/sightLineCore.js');
const params = core.parameters(1003.5, 1002, 300);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('interpolates endpoints, midpoint, ascending, descending, flat and negative elevations', () => {
    assert.equal(core.interpolate(params, 0), 1003.5);
    assert.equal(core.interpolate(params, 300), 1002);
    assert.equal(core.interpolate(params, 150), 1002.75);
    assert.equal(core.interpolate(core.parameters(10, 20, 100), 25), 12.5);
    assert.equal(core.interpolate(core.parameters(20, 20, 100), 25), 20);
    assert.equal(core.interpolate(core.parameters(-20, -10, 100), 25), -17.5);
});

test('rejects blank, nonnumeric, infinite, zero-length and out-of-range inputs', () => {
    for (const value of ['', ' ', 'abc', '12ft', Infinity, NaN, null, undefined, '0x10']) {
        assert.throws(() => core.parameters(value, 100, 200));
    }
    for (const length of [0, -10, '', Infinity]) assert.throws(() => core.parameters(100, 100, length));
    for (const distance of [-1, 301, '', 'abc', Infinity]) assert.throws(() => core.interpolate(params, distance));
    assert.deepEqual(core.parameters('1003.5', '1002', '300'), params);
});

test('ground pairs accept headers, tabs, BOM, blank lines, decimals and unsorted points', () => {
    const points = core.parseGroundPoints('\uFEFFDistance (ft)\tGround elevation (ft)\r\n200\t1002.8\r\n\r\n0\t1000\r\n100\t1.0022e3', 300);
    assert.deepEqual(points, [
        { distance: 0, elevation: 1000 }, { distance: 100, elevation: 1002.2 }, { distance: 200, elevation: 1002.8 },
    ]);
    assert.deepEqual(core.parseGroundPoints('0,-15\n100,-10', 100), [
        { distance: 0, elevation: -15 }, { distance: 100, elevation: -10 },
    ]);
});

test('ground validation reports empty, duplicate, malformed and out-of-range records', () => {
    for (const text of ['', 'Distance,Elevation\n', '100', '100,', ',100', '100,100,200',
        '-1,100', '301,100', '0,NaN', '0,Infinity', '0,100\n0,101', '10,100\n1e1,100', '<script>,100']) {
        assert.throws(() => core.parseGroundPoints(text, 300), text);
    }
    assert.throws(() => core.parseGroundPoints('0,100\n40,101\n400,102', 300), /Line 3/);
});

test('profile computes signed clearances and distinguishes touching from below', () => {
    const flat = core.parameters(100, 100, 100);
    const result = core.analyzeProfile(flat, core.parseGroundPoints('100,100\n0,98\n50,101', 100));
    assert.deepEqual(result.rows.map(row => row.clearance), [2, -1, 0]);
    assert.deepEqual(result.rows.map(row => row.status), ['below', 'above', 'touching']);
    assert.equal(result.above, 1);
    assert.equal(result.touching, 1);
    assert.equal(result.minimum.distance, 50);
});

test('obstruction shading starts and ends at crossings within segments', () => {
    const flat = core.parameters(100, 100, 200);
    const result = core.analyzeProfile(flat, core.parseGroundPoints('0,98\n100,102\n200,98', 200));
    assert.equal(result.obstructions.length, 2);
    assert.deepEqual(result.obstructions.map(pair => pair.map(point => point.distance)), [[50, 100], [100, 150]]);
    assert.equal(result.obstructions[0][0].elevation, 100);
    assert.equal(result.obstructions[1][1].elevation, 100);
});

test('crossing locations respect a sloping sight line', () => {
    const slope = core.parameters(10, 20, 100);
    const result = core.analyzeProfile(slope, core.parseGroundPoints('0,9\n100,22', 100));
    close(result.obstructions[0][0].distance, 100 / 3);
    close(result.obstructions[0][0].elevation, 10 + 10 / 3);
});

test('does not extrapolate sparse or single ground points', () => {
    const one = core.analyzeProfile(params, core.parseGroundPoints('150,1004', 300));
    assert.equal(one.rows.length, 1);
    assert.equal(one.above, 1);
    assert.equal(one.obstructions.length, 0);
    const subset = core.analyzeProfile(params, core.parseGroundPoints('100,1004\n200,1004', 300));
    assert.deepEqual(subset.obstructions[0].map(point => point.distance), [100, 200]);
});

test('small clearances retain their sign rather than being classified after rounding', () => {
    const result = core.analyzeProfile(core.parameters(10, 10, 1), [{ distance: 0.5, elevation: 10.000001 }]);
    assert.equal(result.above, 1);
    assert.match(core.format(result.minimum.clearance), /^-/);
    assert.notEqual(core.format(result.minimum.clearance), '-0.00');
});

test('matches both original Python interpolation functions for representative inputs', () => {
    const cases = [[1003.5, 1002, 300, 150], [993.5, 999.2, 550, 137.5], [-10, 8, 320, 80], [5, 5, 200, 200]];
    // Extract the original functions without importing matplotlib or running their prompts.
    const program = `import ast, json, sys\nfrom pathlib import Path\nfunctions = []\nfor filename, name in [('Sight Line Elevation Checker.py', 'interpolate_elevation'), ('against actual ground elevations.py', 'interpolate_sight_line')]:\n    tree = ast.parse(Path(filename).read_text(encoding='utf-8'))\n    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name)\n    scope = {}\n    exec(compile(ast.Module(body=[function], type_ignores=[]), filename, 'exec'), scope)\n    functions.append(scope[name])\ncases = json.loads(sys.stdin.read())\nprint(json.dumps([[functions[0](*case), functions[1](*case[:3], [case[3]])[0]] for case in cases]))`;
    const run = spawnSync(process.platform === 'win32' ? 'py' : 'python3', ['-B', '-c', program], { cwd: path.join(__dirname, '..'), input: JSON.stringify(cases), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    JSON.parse(run.stdout).forEach((expected, i) => {
        const [eye, target, length, distance] = cases[i];
        expected.forEach(value => close(core.interpolate(core.parameters(eye, target, length), distance), value));
    });
});

test('both pages and their static assets are reachable from the home page', () => {
    const root = path.join(__dirname, '..');
    const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const filename of ['sightLineElevation.html', 'sightLineProfile.html']) {
        assert.ok(home.includes(`href="${filename}"`));
        const html = fs.readFileSync(path.join(root, filename), 'utf8');
        const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]);
        assert.equal(ids.length, new Set(ids).size);
        for (const match of html.matchAll(/(?:href|src)="([^"#?]+)(?:[#?][^"]*)?"/g)) {
            assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
        }
    }
});
