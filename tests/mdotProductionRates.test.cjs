const { test } = require('node:test');
const assert = require('node:assert/strict');
const sourceRows = require('../scripts/production/mdotRates2023.js');
const D = require('../scripts/production/presets.js');
const E = require('../scripts/production/engine.js');
const P = require('../scripts/production/production.js');
const page = require('./helpers/productionPageHarness.cjs');
const item = name => D.rates.find(r => r.activity === name);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} ≈ ${expected}`);

test('all 136 PDF rows, original rate cells, page references, and comments are retained', () => {
  assert.equal(D.rates.length, 136);
  assert.equal(new Set(D.rates.map(r => r.id)).size, 136);
  assert.deepEqual([1, 2, 3].map(page => sourceRows.filter(r => r.page === page).length), [40, 48, 48]);
  for (const [i, source] of sourceRows.entries()) {
    const record = D.rates[i];
    assert.equal(record.activity, source.activity);
    assert.deepEqual(record.sourceRates, source.sourceRates);
    assert.equal(record.notes, source.notes);
    assert.equal(record.sourcePage, source.page);
    assert.match(record.source, /November 2023/);
    for (const level of ['low', 'average', 'high']) {
      // Compare selected engine duration to the printed source value, independently of the normalization helper.
      const raw = Number(source.sourceRates[level].match(/^[\d.,]+/)[0].replaceAll(',', ''));
      assert.equal(record[level], raw, `${source.activity}: ${level}`);
      const op = D.fromRate(record.id, D.rates, level);
      if (op.kind === 'calendar') {
        assert.equal(op.calendarDays, /Month/.test(source.sourceRates[level]) ? raw * 30 : raw);
      } else {
        const oneItem = P.duration(1, op.unit, op.rate, op.rateUnit, op.ratePeriod).days;
        near(oneItem, /Day[s]?($|\/[^/]+$)/i.test(source.sourceRates[level]) && /^\d*\.?\d+ Days?/i.test(source.sourceRates[level]) ? raw : 1 / raw);
      }
    }
  }
});

test('pavement rate columns match November 2023, replacing the earlier single-value HMA assumptions', () => {
  const triples = r => [r.low, r.average, r.high];
  assert.deepEqual(triples(D.rates.find(r => r.id === 'milling')), [2000, 8000, 15000]);
  assert.deepEqual(triples(D.rates.find(r => r.id === 'paving')), [600, 1300, 2100]);
  assert.deepEqual(triples(D.rates.find(r => r.id === 'paving-freeway')), [1000, 1700, 2500]);
  assert.deepEqual(triples(D.rates.find(r => r.id === 'paving-misc')), [100, 200, 500]);
  assert.deepEqual(triples(D.rates.find(r => r.id === 'removal')), [1000, 1500, 4000]);
  assert.deepEqual(triples(item('Open-Graded Underdrain')), [750, 1500, 3500]);
  assert.deepEqual(triples(item('Guardrail')), [550, 850, 1000]);
  assert.deepEqual(triples(item('Deck Patching')), [400, 650, 800]);
});

test('new default and average closure capacities use the actual PDF rates', () => {
  const s = D.scenario('maximum');
  const low = E.maximum(s);
  near(low.maximum, 18000);
  assert.equal(low.controlling, 'Cold Milling');
  assert.equal(low.rows[1].rate, 600);
  s.level = 'average';
  s.operations = D.template('hma', D.rates, 'average');
  const average = E.maximum(s);
  // Both lifts must share a paving day. 1,300 tons/day controls before 8,000 SY/day milling does.
  near(average.maximum, 1300 / (2 * 1.5 / 12 * 145 / 2000));
  near(average.totalHmaTons, 1300);
  assert.match(average.controlling, /HMA Lift/);
});

test('days per headwall and fixed bridge formwork durations are not mistaken for daily output', () => {
  const headwall = D.fromRate(item('CIP Headwalls (Not Outlet Endings)').id);
  assert.equal(headwall.transform, 'fixed');
  headwall.quantity = 2;
  const s = D.scenario(); s.operations = [headwall];
  near(E.duration(s).productiveDays, 12);
  const formwork = D.rates.find(r => r.activity.startsWith('Bridge Deck - Form & Place Rebar'));
  s.operations = [D.fromRate(formwork.id, D.rates, 'average')];
  near(E.duration(s).productiveDays, 15);
});

test('cure and lead-time rows become calendar activities and month conversion is explicit', () => {
  const cure = D.fromRate(item('Bridge Deck - Cure').id);
  assert.equal(cure.kind, 'calendar');
  assert.equal(cure.calendarDays, 7);
  assert.equal(cure.calendarRule, 'full-days');
  const fabrication = D.fromRate(item('Pedestrian Fencing - Plan Approval & Fabrication').id, D.rates, 'average');
  assert.equal(fabrication.calendarDays, 60);
  assert.equal(fabrication.calendarRule, 'rolling');
  assert.match(fabrication.rateBasisNote, /30 calendar days/);
  const s = D.scenario(); s.operations = [fabrication];
  assert.equal(E.duration(s).productiveDays, 0);
});

test('grading units and nonmonotonic riprap columns are preserved with visible source flags', () => {
  const grading = item('Grading (Grader, Dozer, and Scraper)');
  assert.equal(D.fromRate(grading.id).rateUnit, 'SY');
  assert.equal(D.fromRate(grading.id, D.rates, 'average').rateUnit, 'CY');
  assert.equal(grading.low, 400);
  assert.equal(grading.average, 1040);
  assert.match(grading.interpretation, /Source discrepancy/);
  const riprap = item('Riprap Placement');
  assert.equal(riprap.average, 300);
  assert.equal(riprap.high, 200);
  const s = D.scenario(); s.quantity = 300; s.unit = 'CY'; s.operations = [D.fromRate(riprap.id, D.rates, 'average')];
  near(E.duration(s).productiveDays, 1);
  assert.match(E.duration(s).warnings.join(' '), /High rate is below Average/);
});

test('per-person, per-side, and vertical-foot qualifications remain explicit', () => {
  assert.match(item('Hand Chipping - Other Than Deck').interpretation, /one person/);
  assert.match(item('Full Penetration Weld Splices').interpretation, /one person/);
  assert.match(item('Shoulder Corrugations - Ground or Cut').interpretation, /one side/);
  assert.equal(D.fromRate(item('Substructure - Pier Column').id).unit, 'LF');
  assert.match(item('Substructure - Pier Column').interpretation, /vertical/);
});

test('source numeric values stay editable in days-per-item basis', () => {
  const record = D.clone(item('CIP Headwalls (Not Outlet Endings)'));
  record.low = '8';
  const op = D.fromRate(record.id, [record]);
  assert.equal(op.rate, 0.125);
  assert.equal(op.quantity, 1);
  record.low = '0';
  const invalid = D.fromRate(record.id, [record]);
  const s = D.scenario(); s.operations = [invalid];
  assert.throws(() => E.duration(s), /positive/);
});

test('saved previous MDOT defaults migrate, while copied libraries and comparison snapshots are retained', () => {
  const s = D.scenario('maximum');
  s.operations[0].rate = 7600; s.operations[1].rate = 2000; s.operations[2].rate = 2000;
  const old = { id: 'mdot', name: 'MDOT presets', kind: 'Agency', rates: [{ id: 'milling', activity: 'HMA cold milling', unit: 'SY', period: 'Workdays', rate: 7600, low: 7600, average: 7600, high: 7600 }] };
  const contractor = { id: 'contractor', name: 'My contractor', rates: [{ id: 'milling', low: 9999 }] };
  const saved = { scenario: s, libraries: [old, contractor], comparisons: [{ scenario: D.clone(s), quantity: 68400 }] };
  D.migrateSavedState(saved);
  assert.equal(saved.scenario.operations[0].rate, 2000);
  assert.equal(saved.scenario.operations[1].rate, 600);
  assert.equal(saved.libraries.find(l => l.id === 'mdot').rates.length, 136);
  assert.equal(saved.libraries.find(l => l.id === 'contractor').rates[0].low, 9999);
  assert.equal(saved.comparisons[0].scenario.operations[0].rate, 7600);
  assert.match(saved.comparisons[0].scenario.libraryId, /previous-mdot/);
  saved.scenario.operations[0].rate = 2345;
  D.migrateSavedState(saved);
  assert.equal(saved.libraries.length, 3);
  assert.equal(saved.scenario.operations[0].rate, 2345);
});

test('every source work item appears in the row and add dropdowns with grouped categories', () => {
  const h = page();
  const add = h.get('add-operation-type').querySelectorAll('option').map(o => o.textContent);
  const row = h.op(0, 'rateId').querySelectorAll('option').map(o => o.textContent);
  assert.equal(add.length, 138);
  assert.equal(row.length, 137);
  for (const item of sourceRows) { assert.ok(add.includes(item.activity)); assert.ok(row.includes(item.activity)); }
  assert.ok(h.get('add-operation-type').querySelectorAll('optgroup').length > 1);
});

test('choosing a drainage item supplies its rate and asks for a compatible quantity', () => {
  const h = page();
  h.change(h.op(0, 'rateId'), item('Cross Culvert').id);
  assert.equal(h.op(0, 'rate').value, '75');
  assert.equal(h.op(0, 'rateUnit').value, 'LF');
  assert.equal(h.op(0, 'transform').value, 'fixed');
  assert.equal(h.op(0, 'quantity').value, '');
  h.change(h.op(0, 'quantity'), '150');
  h.emit('calculator-form', 'submit');
  assert.match(h.get('results').textContent, /Cross Culvert/);
  assert.doesNotMatch(h.get('results').textContent, /Check your inputs/);
});

test('calendar work items and mixed-unit production levels apply correctly in the UI', () => {
  const h = page();
  h.change(h.op(2, 'rateId'), item('Bridge Deck - Cure').id);
  assert.equal(h.op(2, 'calendarDays').value, '7');
  h.change(h.op(0, 'rateId'), item('Grading (Grader, Dozer, and Scraper)').id);
  assert.equal(h.op(0, 'rateUnit').value, 'SY');
  h.change('production-level', 'average'); h.emit('apply-rates', 'click');
  assert.equal(h.op(0, 'rateUnit').value, 'CY');
  assert.equal(h.op(0, 'unit').value, 'CY');
  assert.equal(h.op(0, 'rate').value, '1040');
  assert.match(h.get('operations').textContent, /Source discrepancy/);
});

test('browser reload replaces old MDOT seed data once and preserves subsequent edits', () => {
  const initial = page();
  const saved = JSON.parse(initial.saved());
  delete saved.libraries[0].sourceVersion;
  saved.libraries[0].rates = saved.libraries[0].rates.slice(0, 5);
  const migrated = page(JSON.stringify(saved));
  assert.equal(migrated.get('add-operation-type').querySelectorAll('option').length, 138);
  migrated.change(migrated.op(0, 'rate'), '777');
  const reload = page(migrated.saved());
  assert.equal(reload.op(0, 'rate').value, '777');
});
