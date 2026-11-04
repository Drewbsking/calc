const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sizing = require('../calculators/curve/chevron-sizing.js');
const guidance = require('../calculators/curve/guidance.js');
const lookup = (roadType, advisoryMPH = 45, roadwayType = 'arterial_with_markings') =>
  sizing.lookupChevronSizes({ roadType, advisoryMPH, roadwayType });
const dimensions = size => size && [size.width, size.height];

test('RCOC local and primary dimensions stay separate from functional class and speed', () => {
  for (const roadClass of ['arterial_no_markings', 'arterial_with_markings', 'all_other']) {
    for (const speed of [5, 40, 45, 50, 55, 70]) {
      assert.deepEqual(dimensions(lookup('rcoc_local', speed, roadClass).rcoc), [18, 24]);
      assert.deepEqual(dimensions(lookup('rcoc_primary', speed, roadClass).rcoc), [24, 30]);
    }
  }
});

test('MDOT conventional roads never inherit freeway ramp sizing from speed alone', () => {
  for (const road of ['rcoc_local', 'rcoc_primary', 'conventional']) {
    for (const speed of [5, 40, 45, 50, 55, 70]) {
      assert.deepEqual(dimensions(lookup(road, speed).mdot), [24, 30]);
    }
  }
  assert.equal(lookup('conventional').rcoc, null);
});

test('MDOT mainline and ramp rules use both road type and advisory speed', () => {
  for (const speed of [5, 40, 45, 55, 70]) {
    const result = lookup('freeway_expressway', speed, 'freeway_expressway');
    assert.deepEqual(dimensions(result.mdot), [36, 48]);
    assert.equal(result.rcoc, null);
  }
  for (const [speed, expected] of [[5, [24, 30]], [20, [24, 30]], [40, [24, 30]], [45, [36, 48]], [55, [36, 48]]]) {
    assert.deepEqual(dimensions(lookup('freeway_ramp', speed, 'freeway_expressway').mdot), expected);
  }
  for (const speed of [60, 70, 42, 0, '', undefined, NaN]) {
    const result = lookup('freeway_ramp', speed === undefined ? NaN : speed, 'freeway_expressway');
    assert.equal(result.mdot, null);
    assert.match(result.mdotNote, /Confirm the size/);
  }
});

test('missing selections and contradictory classes withhold size recommendations', () => {
  for (const road of ['', 'unknown', undefined]) {
    const result = lookup(road);
    assert.match(result.message, /Select a road type/);
    assert.equal(result.rcoc, null);
    assert.equal(result.mdot, null);
  }
  for (const [road, roadClass] of [
    ['rcoc_local', 'freeway_expressway'], ['rcoc_primary', 'freeway_expressway'],
    ['conventional', 'freeway_expressway'], ['freeway_expressway', 'all_other'],
    ['freeway_ramp', 'arterial_with_markings']
  ]) {
    const result = lookup(road, 45, roadClass);
    assert.equal(result.conflict, true);
    assert.equal(result.rcoc, null);
    assert.equal(result.mdot, null);
  }
  assert.match(lookup('rcoc_local', 45, '').message, /Select an MMUTCD roadway class/);
});

test('page updates both sizing sections and cross-checks changes before any map points exist', () => {
  const directory = path.join(__dirname, '../calculators/curve');
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  assert.match(html, /<select id="chevronRoadTypeSel" required/);
  assert.ok(html.indexOf('src="chevron-sizing.js"') < html.indexOf('src="app.js"'));
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    value: '', textContent: '', innerHTML: '', events: {}, attributes: {},
    classList: { add() {}, toggle() {} },
    addEventListener(event, handler) { this.events[event] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    setCustomValidity(value) { this.validationMessage = value; }
  }]));
  for (const [id, value] of Object.entries({
    roadwayTypeSel: 'arterial_with_markings', advisorySel: '45', postedSel: '55',
    methodSlider: '0', speedBasisSel: 'posted', pavedTreatmentSel: 'markings',
    roadWidthInput: '24', roadHeightInput: '0.5', aadtSel: '1000_2999', surfaceSel: 'paved'
  })) elements[id].value = value;
  const map = { setView() { return this; }, createPane() {},
    getPane() { return { style: {}, classList: { add() {} } }; }, on() {} };
  const context = {
    CurveChevronSizing: sizing,
    CurveGuidance: guidance,
    document: { getElementById: id => elements[id], querySelector: () => null },
    window: { addEventListener() {} },
    L: { map: () => map, tileLayer: () => ({ addTo() {} }) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'app.js'), 'utf8'), context);
  const change = (id, value) => { elements[id].value = value; elements[id].events.change(); };
  assert.match(elements.chevronSizingMessage.textContent, /Select a road type/);
  change('chevronRoadTypeSel', 'rcoc_local');
  assert.match(elements.rcocChevronSize.textContent, /18 × 24 in/);
  assert.match(elements.mdotChevronSize.textContent, /24 × 30 in/);
  change('chevronRoadTypeSel', 'rcoc_primary');
  assert.match(elements.rcocChevronSize.textContent, /24 × 30 in/);
  change('chevronRoadTypeSel', 'freeway_ramp');
  assert.match(elements.chevronSizingMessage.textContent, /disagree/);
  assert.doesNotMatch(elements.mdotChevronSize.textContent, /24 × 30/);
  change('roadwayTypeSel', 'freeway_expressway');
  assert.equal(elements.chevronSizingMessage.textContent, '');
  assert.equal(elements.chevronRoadTypeSel.validationMessage, '');
  assert.match(elements.mdotChevronSize.textContent, /36 × 48 in/);
  change('advisorySel', '40');
  assert.match(elements.mdotChevronSize.textContent, /24 × 30 in/);
  change('advisorySel', '60');
  assert.match(elements.mdotChevronSize.textContent, /Confirm the size/);
  change('chevronRoadTypeSel', '');
  assert.equal(elements.chevronRoadTypeSel.attributes['aria-invalid'], 'true');
  assert.doesNotMatch(elements.rcocChevronSize.textContent, /24 × 30/);
});
