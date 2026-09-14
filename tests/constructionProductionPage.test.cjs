const { test } = require('node:test');
const assert = require('node:assert/strict');
const page = require('./helpers/productionPageHarness.cjs');

test('page renders the concrete example and initializes both modes and quick calculators', () => {
  const h = page();
  assert.match(h.get('results').textContent, /Project Summary/);
  assert.match(h.get('results').textContent, /3\.63/);
  assert.equal(h.all('[data-operation]').length, 3);
  assert.equal(h.get('closure-inputs').hidden, true);
  assert.equal(h.get('quick-from').value, 'SF');
  assert.equal(h.get('project-unit').value, 'SF');
});

test('closure UI completes mill and fill and reports infeasible separate lifts', () => {
  const h = page();
  h.emit(h.query('[data-mode="maximum"]'), 'click');
  h.change('template', 'hma'); h.emit('load-template', 'click');
  h.change('project-quantity', '68400');
  h.change(h.op(0, 'rate'), '7600'); h.change(h.op(1, 'rate'), '2000'); h.change(h.op(2, 'rate'), '2000');
  h.emit('calculator-form', 'submit');
  assert.match(h.get('results').textContent, /68,400/);
  assert.match(h.get('results').textContent, /Cold Milling/);
  assert.match(h.get('results').textContent, /fits/);
  assert.equal(h.get('closure-inputs').hidden, false);
  assert.equal(h.focused().id, 'results');
  h.change('separate-lifts', true, 'change');
  h.emit('calculator-form', 'submit');
  assert.match(h.get('results').textContent, /No positive quantity/);
  assert.match(h.get('results').textContent, /requires 3 workdays/);
});

test('operation edits invalidate stale results, disabled operations are excluded, reordering works', () => {
  const h = page();
  h.change(h.op(0, 'rate'), '0');
  assert.match(h.get('results').textContent, /Calculate to update/);
  h.emit('calculator-form', 'submit');
  assert.match(h.get('results').textContent, /Production rate must be a positive/);
  h.change(h.op(0, 'enabled'), false);
  h.emit('calculator-form', 'submit');
  assert.match(h.get('results').textContent, /Excluded from this estimate: Removing Concrete Pavement/);
  assert.equal(h.op(0, 'required').checked, false);
  h.emit(h.all('[data-operation]')[1].querySelector('[data-action="up"]'), 'click');
  assert.match(h.op(0, 'name').value, /Concrete Pavement/);
  h.emit(h.all('[data-operation]')[1].querySelector('[data-action="remove"]'), 'click');
  assert.equal(h.all('[data-operation]').length, 2);
});

test('custom operation, fixed quantity, rate unit choices, notes, and print work', () => {
  const h = page();
  h.change('template', 'custom'); h.emit('load-template', 'click');
  h.change('project-unit', 'EA'); h.change('project-quantity', '120');
  h.emit('add-operation', 'click');
  h.change(h.op(0, 'name'), 'Install signs');
  h.change(h.op(0, 'notes'), '<img src=x onerror=alert(1)>');
  h.emit('calculator-form', 'submit');
  assert.match(h.get('results').textContent, /4\.8/);
  assert.equal(h.get('results').querySelectorAll('img').length, 0);
  h.emit('print', 'click');
  assert.equal(h.prints(), 1);
});

test('duplicate scenarios persist and restored copies retain their original assumptions', () => {
  const h = page();
  h.emit('duplicate', 'click');
  assert.match(h.get('project-name').value, /copy/);
  h.change(h.op(0, 'rate'), '300');
  h.emit(h.query('[data-restore="0"]'), 'click');
  assert.equal(h.op(0, 'rate').value, '1000');
  const reloaded = page(h.saved());
  assert.equal(reloaded.op(0, 'rate').value, '1000');
  assert.match(reloaded.get('comparison-table').textContent, /Concrete remove/);
});

test('editable libraries apply chosen levels and can be copied and reloaded', () => {
  const h = page();
  h.change('new-library-name', 'RCOC historical'); h.emit('copy-library', 'click');
  const firstRate = h.query('[data-rate="removal"]');
  h.change(firstRate.querySelector('[data-field="low"]'), '800');
  assert.equal(h.op(0, 'rate').value, '1000');
  h.emit('apply-rates', 'click');
  assert.equal(h.op(0, 'rate').value, '800');
  h.emit('add-rate', 'click');
  assert.equal(h.all('[data-rate]').length, 137);
  const reload = page(h.saved());
  assert.equal(reload.op(0, 'rate').value, '800');
  assert.match(reload.get('library-select').textContent, /RCOC historical/);
});

test('quick HMA and unit/rate conversion results use the shared engine', () => {
  const h = page();
  h.emit('quick-form', 'submit');
  assert.match(h.get('quick-result').textContent, /619\.875 Tons/);
  h.change('quick-type', 'units', 'change');
  h.change('quick-to', 'SY'); h.change('quick-value', '21000');
  h.emit('quick-form', 'submit');
  assert.match(h.get('quick-result').textContent, /2,333\.333333 SY/);
  h.change('quick-type', 'rate', 'change');
  h.change('quick-from', 'SY', 'change'); h.change('quick-to', 'SF'); h.change('quick-value', '1000');
  h.emit('quick-form', 'submit');
  assert.match(h.get('quick-result').textContent, /1,125 SF\/Hours/);
});

test('storage failure is nonblocking and date-window controls are usable', () => {
  const h = page(null, true);
  assert.match(h.get('storage-status').textContent, /Could not save/);
  h.emit(h.query('[data-mode="maximum"]'), 'click');
  h.change('closure-type', 'dates');
  assert.equal(h.get('closure-days-field').hidden, true);
  assert.equal(h.get('start-date-field').hidden, true);
  h.change('closure-start', '2026-09-14T07:00'); h.change('closure-end', '2026-09-21T07:00');
  h.emit('calculator-form', 'submit');
  assert.match(h.get('results').textContent, /Closure \/ Production Summary/);
  assert.doesNotMatch(h.get('results').textContent, /Check your inputs/);
});

test('freeway mapping and newly added material operations retain meaningful quantity transformations', () => {
  const h = page();
  h.change(h.op(1, 'rateId'), 'freeway');
  assert.match(h.op(1, 'name').value, /Freeway/);
  assert.doesNotMatch(h.op(1, 'name').value, /Non-Freeway/);
  assert.equal(h.op(1, 'rate').value, '750');
  h.change('add-operation-type', 'paving'); h.emit('add-operation', 'click');
  assert.equal(h.op(3, 'transform').value, 'hma');
  h.emit('calculator-form', 'submit');
  assert.match(h.get('results').textContent, /Project Summary/);
});
