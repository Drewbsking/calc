const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { document: { addEventListener() {} } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/pavtMrkgMaterialScript.js'), 'utf8'), sandbox);
const rates = sandbox.getApplicationRates;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

// Independent fixtures transcribed from MDOT 2020 Table 811-1, solid columns.
const published = {
  standardWaterborne: [[16.5, 24.7, 33, 49.4], [132, 198, 264, 396]],
  waterborne: [[16.5, 24.7, 33, 49.4], [132, 198, 264, 396]],
  regularDry: [[16, 24, 32, 48], [96, 144, 192, 288]],
  sprayableThermoplastic: [[560, 840, 1120, 1680], [200, 300, 400, 600]]
};

test('uses published rates at every tabulated width, including waterborne rounding', () => {
  for (const [material, [binder, beads]] of Object.entries(published)) {
    [4, 6, 8, 12].forEach((width, i) => {
      const r = rates(material, width);
      assert.equal(r.method, 'table');
      assert.equal(r.binderPerMile, binder[i]);
      assert.equal(r.beadsPerMile, beads[i]);
    });
  }
});

test('marks unlisted widths as derived estimates', () => {
  for (const [material, [binder, beads]] of Object.entries(published)) {
    for (const width of [5, 7, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) {
      const r = rates(material, width);
      assert.equal(r.method, 'scaled');
      close(r.binderPerMile, binder[0] * width / 4);
      close(r.beadsPerMile, beads[0] * width / 4);
    }
  }
});

test('special rates stay fixed while long lines use their published width column', () => {
  for (const [material, [binder, beads]] of Object.entries(published)) {
    for (let width = 4; width <= 24; width++) {
      const r = rates(material, width);
      close(r.binderPerSFT, binder[0] / 1760);
      close(r.beadsPerSFT, beads[0] / 1760);
    }
  }
  const r = rates('waterborne', 6);
  assert.notEqual(r.longLineBinderPerSFT, r.binderPerSFT);
  close(2640 * r.longLineBinderPerSFT + 43 * r.binderPerSFT, 24.7 + 0.403125);
});

test('project rates supersede the table with an explicit reference width', () => {
  const project = { width: 6, binder: 30, beads: 180, source: 'Test manufacturer sheet' };
  const r = rates('regularDry', 12, project);
  assert.equal(r.method, 'project');
  assert.equal(r.binderPerMile, 60);
  assert.equal(r.beadsPerMile, 360);
  close(r.binderPerSFT, 30 / 2640);
  close(r.beadsPerSFT, 180 / 2640);
  assert.equal(r.project.source, project.source);
  assert.equal(r.baseBinderPerMile, 16); // Retains the MDOT baseline for the report.
  assert.equal(rates('regularDry', 12, { ...project, beads: 0 }).beadsPerSFT, 0);
});
