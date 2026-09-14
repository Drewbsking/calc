const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rpm = require('../scripts/rpm.js');
const base = {
  application: 'guide-curve', markerColor: 'white',
  spacingChoice: 'rule', customSpacing: '25', engineeringBasis: '', groupSize: '3',
  dotLength: '3', dotGap: '9', scope: 'segments', segmentLengths: '1000', projectMiles: '2.5',
  approaches: '0', approachSpeed: '60', runs: '1', unitPrice: '66', countMode: 'budget', shortLineCount: '12'
};
const layout = (patch = {}) => rpm.resolveLayout({ ...base, ...patch });
const estimate = (patch = {}) => rpm.estimate({ ...base, ...patch });

// Independent fixtures transcribed from MUTCD 11th Edition Rev. 1, printed p. 571.
// These distinguish maximum supplemental spacing from the positioning-guide options.
test('applies every uniform guide and supplemental provision at fixed Michigan N=50', () => {
  const fixtures = {
    'guide-curve': [50, 1, 'Option'], 'guide-general': [100, 1, 'Guidance'], 'guide-freeway': [150, 1, 'Option'],
    'supp-double': [50, 2, 'Guidance'], 'supp-solid': [50, 1, 'Guidance'], 'supp-wide': [50, 2, 'Guidance'],
    'supp-broken': [150, 1, 'Guidance'], 'supp-reversible': [50, 2, 'Guidance'],
    'supp-left-edge': [25, 1, 'Guidance'], 'supp-right-edge': [25, 1, 'Guidance'],
    'supp-channel': [25, 2, 'Guidance'], 'supp-interchange': [50, 1, 'Guidance']
  };
  for (const [application, [spacing, pair, level]] of Object.entries(fixtures)) {
    const r = layout({ application });
    assert.equal(r.spacing, spacing, application);
    assert.equal(r.pair, pair, application);
    assert.equal(r.profile.level, level, application);
    assert.equal(r.page, 612);
  }
});
test('Michigan cycle stays fixed even when obsolete dash and gap inputs are supplied', () => {
  const r = layout({ dashLength: 10, gapLength: 30 });
  assert.equal(r.dash, 12.5);
  assert.equal(r.gap, 37.5);
  assert.equal(r.n, 50);
  assert.deepEqual(estimate({ dashLength: 15, gapLength: 45 }), estimate());
});
test('segment quantities and costs use the fixed Michigan cycle', () => {
  const r = estimate({ segmentLengths: '125, 275' });
  assert.equal(r.baseLength, 400);
  assert.equal(r.markers, 9);
  assert.equal(r.costCents, 59400);
  const paired = estimate({ application: 'supp-double', segmentLengths: '125, 275' });
  assert.equal(paired.markers, 18);
  assert.equal(paired.costCents, 118800);
});
test('closer spacing requires a recorded engineering basis', () => {
  const r = estimate({ segmentLengths: '125, 275', spacingChoice: 'custom', engineeringBasis: 'Project curve delineation detail' });
  assert.equal(r.markers, 16);
  assert.equal(r.costCents, 105600);
  assert.throws(() => layout({ spacingChoice: 'custom' }), /engineering basis/);
  assert.throws(() => layout({ spacingChoice: 'custom', customSpacing: 51, engineeringBasis: 'Test' }), /exceeds 50 ft/);
});
test('dotted supplements never invent a numeric MUTCD limit', () => {
  assert.throws(() => layout({ application: 'supp-dotted' }), /engineering basis/);
  const r = layout({ application: 'supp-dotted', customSpacing: 12, engineeringBasis: 'Project detail' });
  assert.equal(r.maximum, null);
  assert.equal(r.spacing, 12);
  assert.equal(r.profile.level, 'Guidance');
});
test('pairs and identical applications multiply physical units once', () => {
  const r = estimate({ application: 'supp-double', segmentLengths: '80', runs: 3 });
  assert.equal(r.rows[0].positions, 2);
  assert.equal(r.markers, 12);
  assert.equal(r.costCents, 79200);
  assert.equal(estimate({ application: 'guide-curve', segmentLengths: '80' }).markers, 2);
});
test('rounding is per segment; optional endpoints add stations and zero segments stay zero', () => {
  assert.equal(estimate({ segmentLengths: '51, 51' }).markers, 4);
  assert.equal(estimate({ segmentLengths: '0, 51, 51', countMode: 'endpoints' }).markers, 6);
  assert.equal(estimate({ application: 'supp-double', segmentLengths: '0, 50', countMode: 'endpoints' }).markers, 4);
});
test('fractional project miles replace curve lengths instead of adding to them', () => {
  const r = estimate({ scope: 'project', projectMiles: 1.25, segmentLengths: 'bad' });
  assert.equal(r.length, 6600);
  assert.equal(r.markers, 132);
  assert.equal(r.costCents, 871200);
});
test('five-second approaches apply only to eligible curve centerline supplements', () => {
  const r = estimate({ application: 'supp-double', segmentLengths: '1000, 0', approaches: 2 });
  assert.equal(r.approach, 440);
  assert.equal(r.addedLength, 880);
  assert.equal(r.length, 1880);
  assert.equal(r.markers, 76);
  assert.equal(estimate({ application: 'guide-curve', approaches: 2 }).addedLength, 0);
  assert.equal(estimate({ application: 'supp-broken', approaches: 2, markerColor: 'white' }).addedLength, 0);
  assert.equal(estimate({ application: 'supp-broken', approaches: 1, markerColor: 'yellow' }).addedLength, 440);
  assert.equal(estimate({ application: 'supp-double', scope: 'project', approaches: 2 }).addedLength, 0);
});
test('solid substitution uses the mandatory N/4 maximum and all-reflective arrays', () => {
  assert.equal(layout({ application: 'sub-solid' }).spacing, 12.5);
  assert.equal(layout({ application: 'sub-double' }).spacing, 12.5);
  assert.equal(layout({ application: 'sub-solid' }).profile.level, 'Standard');
  assert.equal(layout({ application: 'sub-solid' }).page, 613);
  assert.equal(estimate({ application: 'sub-double', segmentLengths: 80 }).markers, 14);
  assert.throws(() => layout({ application: 'sub-solid', spacingChoice: 'custom', customSpacing: 13, engineeringBasis: 'Test' }), /exceeds 12\.5 ft/);
});
test('broken substitution counts groups, uses 3–5 units, and enforces N/8 pitch', () => {
  for (const groupSize of [3, 4, 5]) {
    const r = estimate({ application: 'sub-broken', segmentLengths: 80, groupSize });
    assert.equal(r.markers, 2 * groupSize);
    assert.equal(r.layout.pitch, 12.5 / (groupSize - 1));
    assert.ok(r.layout.pitch <= r.layout.n / 8);
    assert.equal(r.layout.cycle, 50);
  }
  assert.equal(estimate({ application: 'sub-broken', segmentLengths: 101 }).markers, 9);
  assert.equal(estimate({ application: 'sub-broken', segmentLengths: 80, countMode: 'endpoints' }).markers, 6);
  assert.throws(() => layout({ application: 'sub-broken', groupSize: 2 }));
  assert.throws(() => layout({ application: 'sub-broken', groupSize: 6 }));
});
test('dotted substitution meets both within-dot and across-gap spacing constraints', () => {
  const r = estimate({ application: 'sub-dotted', segmentLengths: 120 });
  assert.equal(r.layout.n, 50);
  assert.equal(r.layout.cycle, 12);
  assert.equal(r.layout.perGroup, 1);
  assert.equal(r.layout.pitch, 0);
  assert.equal(r.markers, 10);
  assert.equal(estimate({ application: 'sub-dotted', dotLength: 2, dotGap: 6, segmentLengths: 80 }).markers, 10);
  const longer = estimate({ application: 'sub-dotted', dotLength: 5, dotGap: 10, segmentLengths: 150 });
  assert.equal(longer.layout.perGroup, 2);
  assert.equal(longer.layout.pitch, 5);
  assert.equal(longer.markers, 20);
  assert.equal(layout({ application: 'sub-dotted', dotLength: 25, dotGap: 5 }).perGroup, 3);
  assert.throws(() => layout({ application: 'sub-dotted', dotGap: 13 }), /gap exceeds N\/4/);
});
test('intersection extensions use actual short-line count, not invented spacing', () => {
  const r = estimate({ application: 'supp-intersection', shortLineCount: 17, runs: 2, segmentLengths: 'bad', projectMiles: '' });
  assert.equal(r.markers, 34);
  assert.equal(r.length, null);
  assert.equal(r.costCents, 224400);
  assert.equal(estimate({ application: 'supp-intersection', shortLineCount: 0 }).markers, 0);
  assert.throws(() => estimate({ application: 'supp-intersection', shortLineCount: 2.5 }));
});
test('parses Google Earth length lists and rejects invalid numeric data', () => {
  assert.deepEqual(rpm.parseLengths('[125, 275,\n50.5, .25]'), [125, 275, 50.5, 0.25]);
  for (const text of ['50,-10', '25ft', 'oops', 'Infinity', '0x10', ',,']) assert.throws(() => rpm.parseLengths(text));
  for (const customSpacing of ['', 0, -1, Infinity]) {
    assert.throws(() => layout({ spacingChoice: 'custom', customSpacing, engineeringBasis: 'Test' }));
  }
  for (const runs of [0, 1.5, 'bad']) assert.throws(() => estimate({ runs }));
  assert.throws(() => estimate({ application: 'supp-double', approaches: 3 }));
  assert.throws(() => estimate({ application: 'supp-double', approaches: 1, approachSpeed: 0 }));
});
test('handles exact decimal spacing and currency without floating-point overcounts', () => {
  const r = estimate({ segmentLengths: 0.07, spacingChoice: 'custom', customSpacing: 0.01, engineeringBasis: 'Test', unitPrice: 1.13 });
  assert.equal(r.markers, 7);
  assert.equal(r.costCents, 791);
  assert.equal(estimate({ unitPrice: 0 }).costCents, 0);
  assert.throws(() => estimate({ unitPrice: 66.666 }));
  assert.throws(() => estimate({ unitPrice: -1 }));
});
test('large or nonfinite inputs cannot produce an unsafe estimate', () => {
  assert.throws(() => estimate({ scope: 'project', projectMiles: 1e15 }));
  assert.throws(() => estimate({ runs: 1e15 }));
  assert.throws(() => estimate({ segmentLengths: '5e15, 5e15', unitPrice: 0 }));
  assert.throws(() => estimate({ segmentLengths: '1e15', unitPrice: '1e12' }));
});

const curveBase = { unitPrice: '66', curves: [{ length: '500', speedDifference: '10' }] };
const curveEstimate = (patch = {}) => rpm.estimateCurves({ ...curveBase, ...patch });

test('RCOC spacing and quantities match every Existing RCOC unwritten workbook row', () => {
  const workbookRows = [[0,50,100,17], [5,25,50,27], [10,25,50,27], [15,25,50,27],
    [20,25,50,27], [25,25,50,27], [30,25,50,27]];
  for (const [speedDifference, spacing, approachSpacing, markers] of workbookRows) {
    const result = curveEstimate({ curves: [{ length: 500, speedDifference }] });
    const row = result.rows[0];
    assert.equal(row.speedDifference, speedDifference);
    assert.equal(row.spacing, spacing);
    assert.equal(row.approachSpacing, approachSpacing);
    assert.equal(row.extensionEachEnd, approachSpacing * 3);
    assert.equal(row.beforeMarkers, 3);
    assert.equal(row.afterMarkers, 3);
    assert.equal(row.markers, markers);
    assert.equal(result.costCents, markers * 6600);
  }
});

test('mixed speed differences retain per-curve approach lengths and sum physical markers once', () => {
  const result = curveEstimate({ curves: [0,10].map((speedDifference) => ({ length: 500, speedDifference })) });
  assert.deepEqual(result.rows.map((row) => row.curveMarkers), [11,21]);
  assert.deepEqual(result.rows.map((row) => row.approachMarkers), [6,6]);
  assert.deepEqual(result.rows.map((row) => row.markers), [17,27]);
  assert.deepEqual(result.rows.map((row) => row.treatedLength), [1100,800]);
  assert.equal(result.markers, 44);
  assert.equal(result.costCents, 290400);
  assert.equal(result.length, 1000);
  assert.equal(result.treatedLength, 1900);
});

test('old geometry, approach overrides and multipliers cannot change the RCOC method', () => {
  for (const speedDifference of [0,5,30]) {
    const curves = [{ length: 500, speedDifference }];
    const expected = curveEstimate({ curves });
    assert.deepEqual(curveEstimate({ runs: 2, approachSpacing: 25, curves }), expected);
    assert.deepEqual(curveEstimate({ runs: 9e15, approachSpacing: 9e15, curves }), expected);
    assert.deepEqual(curveEstimate({ curves: curves.map((row) => ({
      ...row, geometryType: 'degree', geometryValue: 22, perStation: 2, spacing: 100, approachSpacing: 25
    })) }), expected);
  }
});

test('partial curve intervals, very short curves and cents are counted consistently', () => {
  const partial = curveEstimate({ curves: [{ length: 100.5, speedDifference: 0 }], unitPrice: 1.13 });
  assert.equal(partial.rows[0].stations, 4);
  assert.equal(partial.curveMarkers, 4);
  assert.equal(partial.approachMarkers, 6);
  assert.equal(partial.markers, 10);
  assert.equal(partial.costCents, 1130);
  assert.equal(curveEstimate({ curves: [{ length: 100, speedDifference: 0 }] }).markers, 9);
  assert.equal(curveEstimate({ curves: [{ length: .01, speedDifference: 5 }] }).markers, 8);
  assert.equal(curveEstimate({ unitPrice: 0 }).costCents, 0);
});

test('unlisted speed differences and invalid or overflowing lengths never produce totals', () => {
  assert.throws(() => curveEstimate({ curves: [] }));
  for (const length of ['', 0, -1, 'abc', Infinity]) {
    assert.throws(() => curveEstimate({ curves: [{ length, speedDifference: 10 }] }));
  }
  for (const speedDifference of ['', undefined, null, -1, 1, 7.5, 35, 'abc', Infinity]) {
    assert.throws(() => curveEstimate({ curves: [{ length: 500, speedDifference }] }), /Speed difference|speed difference/);
  }
  assert.throws(() => curveEstimate({ unitPrice: 9e15 }));
  assert.throws(() => curveEstimate({ curves: [{ length: Number.MAX_SAFE_INTEGER, speedDifference: 10 }], unitPrice: 0 }));
  assert.throws(() => curveEstimate({ curves: [1,2].map(() => ({ length: 5e15, speedDifference: 10 })), unitPrice: 0 }));
});

// Small DOM fixture built from the real page, including nested disabled controls.
// Exercises event handlers and SVG construction without a browser dependency.
function pageHarness() {
  const byId = new Map(), all = [];
  let document;
  class Element {
    constructor(tag) {
      this.tagName = tag.toLowerCase(); this.attributes = {}; this.children = []; this.handlers = {};
      this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false;
      this.validity = { badInput: false }; this.dataset = {}; this.ownerDocument = document;
      all.push(this);
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') { this.id = value; byId.set(value, this); }
      if (name === 'value') this.value = String(value);
      if (name === 'hidden') this.hidden = true;
    }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    querySelectorAll(selector) {
      const tags = selector.split(',').map((s) => s.trim()), result = [];
      const visit = (e) => e.children.forEach((c) => { if (tags.includes(c.tagName)) result.push(c); visit(c); });
      visit(this); return result;
    }
    focus() { this.focused = true; }
  }
  document = {
    createElement: (tag) => new Element(tag), createElementNS: (ns, tag) => new Element(tag),
    getElementById(id) { assert.ok(byId.has(id), 'Missing page ID ' + id); return byId.get(id); },
    addEventListener(name, fn) { this.ready = fn; }
  };
  const root = new Element('root'), stack = [root];
  const html = fs.readFileSync(path.join(__dirname, '../rpm.html'), 'utf8');
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)[1], node = new Element(tag);
      for (const match of token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        if (match[1] !== tag) node.setAttribute(match[1], match[2] === undefined ? '' : match[2]);
      }
      stack.at(-1).appendChild(node);
      if (!['meta', 'link', 'input', 'img', 'br', 'hr'].includes(tag)) stack.push(node);
    } else stack.at(-1).textContent += token;
  }
  for (const e of all) {
    if (e.tagName === 'textarea') e.value = e.textContent;
    if (e.tagName === 'select') {
      const options = e.querySelectorAll('option');
      e.value = (options.find((o) => 'selected' in o.attributes) || options[0])?.value || '';
    }
  }
  const context = { document, window: { print() {} } };
  vm.createContext(context);
  for (const file of ['rpm.js', 'rpmDiagram.js', 'rpmPage.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/' + file), 'utf8'), context);
  }
  document.ready();
  const get = (id) => document.getElementById(id);
  const update = () => get('rpmForm').handlers.input();
  const change = (id, value) => { get(id).value = value; if (get(id).handlers.change) get(id).handlers.change({ target: get(id) }); if (id !== 'referenceApplication') get('rpmForm').handlers.change({ target: get(id) }); };
  const curve = (index = 0) => {
    const card = get('curveRows').children[index];
    const inputs = card.querySelectorAll('input');
    return { name: inputs[0], length: inputs[1], speedDifference: card.querySelectorAll('select')[0], remove: card.querySelectorAll('button')[0], summary: card.querySelectorAll('p')[0] };
  };
  const setCurve = (index, values) => { const controls = curve(index); Object.entries(values).forEach(([key, value]) => { controls[key].value = String(value); }); update(); };
  return { get, update, change, curve, setCurve };
}
test('page starts blank with a $66 price and requires a listed speed difference', () => {
  const { get, curve, setCurve } = pageHarness();
  assert.equal(get('rpmError').textContent, '');
  assert.equal(get('rpmResults').hidden, true);
  assert.equal(curve().length.value, '');
  assert.equal(curve().speedDifference.value, '');
  assert.equal(get('unitPrice').value, '66');
  assert.equal(get('ruleType').textContent, 'RCOC workbook');
  assert.equal(get('curveRows').children.length, 1);
  assert.deepEqual(curve().speedDifference.querySelectorAll('option').map((option) => option.value),
    ['', '0', '5', '10', '15', '20', '25', '30']);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../rpm.html'), 'utf8'),
    /id="(?:dashLength|gapLength|projectMiles|scope|runs|application|loadOriginal|approachSpacing|geometryHelp)"/);
  setCurve(0, { length: 500 });
  assert.equal(get('rpmResults').hidden, true);
  assert.match(get('rpmError').textContent, /Speed difference/);
});

test('example curves show both RCOC spacing patterns and the complete project total', () => {
  const { get } = pageHarness();
  get('loadExample').handlers.click();
  assert.equal(get('rpmError').textContent, '');
  assert.equal(get('totalMarkers').textContent, '44');
  assert.equal(get('curveMarkerTotal').textContent, '32');
  assert.equal(get('approachMarkerTotal').textContent, '12');
  assert.equal(get('totalCost').textContent, '$2,904.00');
  assert.equal(get('curveLengthTotal').textContent, '1,000 ft');
  assert.equal(get('treatedLength').textContent, '1,900 ft');
  assert.equal(get('resultRows').children.length, 2);
  assert.match(get('sampleNote').textContent, /Illustrative example only/);
  assert.equal(get('selectedSpacing').textContent, '50 ft');
  assert.equal(get('selectedApproach').textContent, '100 ft');
  assert.match(get('layoutCaption').textContent, /300 ft beyond each end/);
  const rowValues = get('resultRows').children.map((row) => row.children.map((cell) => cell.textContent));
  assert.deepEqual(rowValues.map((cells) => cells.slice(1, 5)), [['500','0','50','100'], ['500','10','25','50']]);
});

test('preview follows each curve and shows single markers with the correct end spacing', () => {
  const { get, change } = pageHarness();
  get('loadExample').handlers.click();
  change('curvePreview', '1');
  assert.equal(get('selectedSpacing').textContent, '25 ft');
  assert.equal(get('selectedApproach').textContent, '50 ft');
  assert.match(get('layoutCaption').textContent, /10 mph speed difference/);
  assert.match(get('layoutCaption').textContent, /150 ft beyond each end/);
  const markers = get('layoutDiagram').querySelectorAll('rect');
  assert.equal(markers.filter((rect) => rect.attributes['data-part'] === 'curve').length, 13);
  assert.equal(markers.filter((rect) => rect.attributes['data-part'] === 'before').length, 3);
  assert.equal(markers.filter((rect) => rect.attributes['data-part'] === 'after').length, 3);
  assert.ok(get('layoutDiagram').querySelectorAll('text').some((node) => node.textContent === '3 × 50 ft'));
  assert.equal(get('totalMarkers').textContent, '44');
  change('curvePreview', '0');
  assert.ok(get('layoutDiagram').querySelectorAll('text').some((node) => node.textContent === '3 × 100 ft'));
  assert.equal(get('layoutDiagram').querySelectorAll('rect').filter((rect) => rect.attributes['data-part'] === 'curve').length, 11);
});

test('adding, removing and changing speed differences update totals and clear stale results', () => {
  const { get, curve, setCurve, change } = pageHarness();
  setCurve(0, { length: 500, speedDifference: 0 });
  assert.equal(get('totalMarkers').textContent, '17');
  get('addCurve').handlers.click();
  assert.equal(get('rpmResults').hidden, true);
  assert.equal(get('totalMarkers').textContent, '—');
  setCurve(1, { length: 500, speedDifference: 30 });
  assert.equal(get('totalMarkers').textContent, '44');
  curve(1).remove.handlers.click();
  assert.equal(get('totalMarkers').textContent, '17');
  change(curve(0).speedDifference.id, '5');
  assert.equal(curve(0).length.value, '500');
  assert.equal(get('totalMarkers').textContent, '27');
  assert.equal(get('treatedLength').textContent, '800 ft');
  assert.equal(get('selectedApproach').textContent, '50 ft');
  change(curve(0).speedDifference.id, '');
  assert.equal(get('rpmResults').hidden, true);
  assert.equal(get('selectedApproach').textContent, '—');
  get('clearCurves').handlers.click();
  assert.equal(get('curveRows').children.length, 1);
  assert.equal(curve().speedDifference.value, '');
  assert.equal(get('rpmResults').hidden, true);
});

test('reference browsing leaves RCOC inputs, quantities, and the curve diagram intact', () => {
  const { get, change, curve, setCurve } = pageHarness();
  setCurve(0, { length: 500, speedDifference: 20 });
  const firstCurveDrawing = get('layoutDiagram').children[0];
  const firstResultRow = get('resultRows').children[0];
  const options = get('referenceApplication').querySelectorAll('option');
  assert.equal(options.length, Object.keys(rpm.PROFILES).length);
  for (const application of Object.keys(rpm.PROFILES)) {
    change('referenceApplication', application);
    assert.equal(get('rpmError').textContent, '', application);
    assert.equal(get('rpmResults').hidden, false, application);
    assert.equal(get('totalMarkers').textContent, '27', application);
    assert.equal(get('totalCost').textContent, '$1,782.00', application);
    assert.equal(get('quantityPanel').hidden, false, application);
    assert.equal(curve().length.disabled, false, application);
    assert.equal(get('unitPrice').disabled, false, application);
    assert.equal(curve().speedDifference.value, '20', application);
    assert.equal(get('layoutDiagram').children[0], firstCurveDrawing, application);
    assert.equal(get('resultRows').children[0], firstResultRow, application);
    assert.match(get('referenceCaption').textContent, /Information only/, application);
  }
});

test('the main form has no multiplier, mode selector or redundant calculate button', () => {
  const { get } = pageHarness();
  const form = get('rpmForm');
  assert.equal(form.querySelectorAll('button').some((button) => button.attributes.type === 'submit'), false);
  assert.equal(form.querySelectorAll('select').some((select) => select.id === 'referenceApplication'), false);
  assert.equal('open' in get('sampleControls').attributes, false);
  assert.equal('open' in get('otherApplicationsDetails').attributes, false);
  assert.equal(get('sampleNote').hidden, true);
});

test('invalid prices clear estimates while reference browsing still works', () => {
  const { get, change, setCurve } = pageHarness();
  setCurve(0, { length: 500, speedDifference: 10 });
  change('unitPrice', '-1');
  assert.equal(get('rpmResults').hidden, true);
  assert.equal(get('resultRows').children.length, 0);
  assert.match(get('rpmError').textContent, /Unit price/);
  change('referenceApplication', 'supp-double');
  assert.match(get('rpmError').textContent, /Unit price/);
  assert.equal(get('rpmResults').hidden, true);
  assert.equal(get('referenceDiagram').querySelectorAll('rect').length, 10);
});
