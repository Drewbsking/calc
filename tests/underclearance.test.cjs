const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.join(__dirname, '../calculators/underclearance');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(directory, 'underclearance.js'), 'utf8');
const directions = ['direction1', 'direction2'];

// Exercise the page's initialization and input/change handlers without a browser dependency.
function setup() {
  const ids = {};
  const outputs = {};
  const elements = [];
  for (const [, tag, attributes] of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
    const attrs = Object.fromEntries(Array.from(attributes.matchAll(/([\w-]+)="([^"]*)"/g), match => [match[1], match[2]]));
    if (!attrs.id && tag !== 'output') continue;
    const listeners = {};
    const classes = new Set((attrs.class || '').split(/\s+/));
    const element = {
      id: attrs.id,
      value: attrs.value || '',
      dataset: { direction: attrs['data-direction'], location: attrs['data-location'] },
      hidden: /\bhidden\b/.test(attributes),
      textContent: '',
      innerHTML: '',
      className: attrs.class || '',
      classes,
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute(name) { return attrs[name]; },
      addEventListener(name, handler) { listeners[name] = handler; },
      fire(name) { listeners[name]?.(); },
      children: [{ querySelector() { return { append() {} }; } }]
    };
    let value = element.value;
    Object.defineProperty(element, 'value', {
      get() { return value; },
      set(next) { value = String(next); }
    });
    elements.push(element);
    if (attrs.id) ids[attrs.id] = element;
    if (tag === 'output') outputs[attrs.for] = element;
  }
  ids['clearance-logic'].value = 'bridge';
  const document = {
    getElementById(id) { assert.ok(ids[id], `Missing element ${id}`); return ids[id]; },
    querySelector(selector) { return outputs[selector.match(/for="([^"]+)"/)[1]]; },
    querySelectorAll(selector) {
      return elements.filter(element => selector.split(',').some(part => {
        const className = part.trim().match(/^\.([\w-]+)/)[1];
        const direction = part.match(/data-direction="([^"]+)"/);
        return element.classes.has(className) && (!direction || element.dataset.direction === direction[1]);
      }));
    },
    addEventListener(event, handler) { if (event === 'DOMContentLoaded') this.start = handler; }
  };
  const frames = [];
  vm.runInNewContext(source, { document, window: { requestAnimationFrame(handler) { frames.push(handler); } } });
  document.start();
  const inputs = direction => elements.filter(element => element.classes.has('clearance-input') && element.dataset.direction === direction);
  return {
    ids, inputs,
    fill(first, second) {
      for (const [index, direction] of directions.entries()) {
        inputs(direction).forEach(input => { input.value = String(index === 0 ? first : second); });
      }
      inputs('direction1')[0].fire('input');
    },
    mode(value) { ids['clearance-logic'].value = value; ids['clearance-logic'].fire('change'); },
    flushFrames() { frames.splice(0).forEach(handler => handler()); }
  };
}

test('Logic 1 defaults to one bridge minimum, legend, and threshold decision on both sides', () => {
  const page = setup();
  page.fill(14.4, 14.7);
  for (const direction of directions) {
    assert.equal(page.ids[`${direction}-rounded`].textContent, '14\'-1"');
    assert.match(page.ids[`${direction}-threshold`].textContent, /W12-2 required/);
    assert.match(page.ids[`${direction}-location`].textContent, /Travel Direction 1/);
    assert.match(page.ids[`${direction}-math`].innerHTML, /lowest of all 12/);
  }
  assert.match(page.ids['logic-mode-summary'].textContent, /Logic 1/);
});

test('Logic 2 has independent minimums and may require signing in only one direction', () => {
  const page = setup();
  page.fill(14.4, 14.7);
  page.mode('direction');
  assert.equal(page.ids['direction1-rounded'].textContent, '14\'-1"');
  assert.equal(page.ids['direction2-rounded'].textContent, '14\'-5"');
  assert.match(page.ids['direction1-threshold'].textContent, /W12-2 required/);
  assert.match(page.ids['direction2-threshold'].textContent, /is not below/);
  assert.match(page.ids['logic-mode-summary'].textContent, /Logic 2/);
  assert.match(page.ids['logic-minimum-description'].textContent, /separately/);
  assert.match(page.ids['results-heading'].textContent, /Directional/);
  assert.doesNotMatch(page.ids['direction2-math'].innerHTML, /Travel Direction 1/);
});

test('editing either direction updates both results in Logic 1 and identifies the controlling reading', () => {
  const page = setup();
  page.fill(14.4, 14.7);
  const input = page.ids['d2-exit-right'];
  input.value = '14.2';
  input.fire('input');
  for (const direction of directions) {
    assert.equal(page.ids[`${direction}-rounded`].textContent, '13\'-11"');
    assert.match(page.ids[`${direction}-location`].textContent, /Travel Direction 2 — Exiting end — EM right/);
  }
  page.mode('direction');
  assert.equal(page.ids['direction1-rounded'].textContent, '14\'-1"');
  assert.equal(page.ids['direction2-rounded'].textContent, '13\'-11"');
  page.mode('bridge');
  assert.equal(page.ids['direction1-rounded'].textContent, '13\'-11"');
  assert.equal(input.value, '14.2');
});

test('both modes check the actual minimum before the allowance at and around 14 ft 6 in', () => {
  for (const mode of ['bridge', 'direction']) {
    const page = setup();
    page.mode(mode);
    for (const [actual, expectedLegend, expectedThreshold] of [
      [14.5, '14\'-3"', /is not below/],
      [14 + 7 / 12, '14\'-4"', /is not below/],
      [14 + 5 / 12, '14\'-2"', /W12-2 required/]
    ]) {
      page.fill(actual, actual);
      for (const direction of directions) {
        assert.equal(page.ids[`${direction}-rounded`].textContent, expectedLegend, mode);
        assert.match(page.ids[`${direction}-threshold`].textContent, expectedThreshold, mode);
      }
    }
  }
});

test('Logic 1 requires all 12 valid readings; Logic 2 can calculate a complete direction independently', () => {
  const page = setup();
  page.fill(14.2, 14.4);
  const input = page.ids['d2-exit-right'];
  for (const value of ['', '-1', 'Infinity']) {
    page.mode('bridge');
    input.value = value;
    input.fire('input');
    for (const direction of directions) assert.equal(page.ids[`${direction}-calculation`].hidden, true);
    page.mode('direction');
    assert.equal(page.ids['direction1-calculation'].hidden, false);
    assert.equal(page.ids['direction2-calculation'].hidden, true);
  }
  input.value = '14.4';
  input.fire('input');
  assert.equal(page.ids['direction2-calculation'].hidden, false);
});

test('sample values respect the selected mode and reset rerenders the restored form state', () => {
  const page = setup();
  page.ids['load-example'].fire('click');
  assert.equal(page.ids['direction1-rounded'].textContent, '14\'-5"');
  assert.equal(page.ids['direction2-rounded'].textContent, '14\'-5"');
  page.mode('direction');
  page.ids['load-example'].fire('click');
  assert.equal(page.ids['direction2-rounded'].textContent, '15\'-2"');
  assert.match(html, /id="clearance-logic"[^>]*form="underclearance-form"/);
  // Browser reset restores form-associated controls before the animation frame runs.
  page.ids['underclearance-form'].fire('reset');
  page.ids['clearance-logic'].value = 'bridge';
  for (const direction of directions) {
    page.inputs(direction).forEach(input => { input.value = ''; });
  }
  page.flushFrames();
  assert.match(page.ids['logic-mode-summary'].textContent, /Logic 1/);
  for (const direction of directions) {
    assert.equal(page.ids[`${direction}-calculation`].hidden, true);
    assert.match(page.ids[`${direction}-empty`].textContent, /12.*both sides/);
  }
});
