const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHarness, plainText, simpleResult, advancedResult } = require('./helpers/taperPageHarness.cjs');
const fixtures = require('./fixtures/taper_legacy.json');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/taperLengths.js'), 'utf8');
const setup = () => {
  const page = createHarness(source);
  page.start();
  return page;
};

test('preserves 56 archived Simple lengths with the requested upward shift rounding', () => {
  const { context, ids, alerts } = setup();
  assert.equal(fixtures.simple.length, 56);
  for (const [width, speed, ...expected] of fixtures.simple) {
    ids.simpleW.value = String(width);
    ids.simpleSpeed.value = String(speed);
    context.calculateSimpleTaper();
    const actual = simpleResult(ids.simpleResult.innerHTML);
    assert.deepEqual(actual.slice(0, 2), expected.slice(0, 2), `W=${width}, S=${speed}`);
    assert.equal(actual[2] % 5, 0);
    assert.ok(actual[2] >= actual[1] / 2);
    assert.ok(actual[2] - actual[1] / 2 < 5);
  }
  assert.deepEqual(alerts, []);
});

test('matches all 161 archived Advanced outputs across every available speed combination', () => {
  const { context, ids, alerts } = setup();
  assert.equal(fixtures.advanced.length, 161);
  for (const [width, posted, work, ...expected] of fixtures.advanced) {
    ids.advancedW.value = String(width);
    ids.advancedPostedSpeed.value = String(posted);
    ids.advancedWorkSpeed.value = String(work);
    context.calculateAdvancedTaper();
    assert.deepEqual(advancedResult(ids.advancedFormula.innerHTML, ids.advancedResult.innerHTML), expected,
      `W=${width}, posted=${posted}, work=${work}`);
  }
  assert.deepEqual(alerts, []);
});

test('preserves the full archived buffer and sign lookup tables, including entries outside the UI', () => {
  const { context } = setup();
  const actual = JSON.parse(vm.runInContext('JSON.stringify({bufferDistances, signDistances})', context));
  assert.deepEqual(actual, fixtures.tables);
});

test('keeps the 40/45 MPH formula boundary and now rounds shifts up in both modes', () => {
  const { context, ids } = setup();
  assert.match(context.calculateTaperBySpeed(12, 40).formula, /Short/);
  assert.match(context.calculateTaperBySpeed(12, 45).formula, /Long/);
  ids.simpleW.value = '1';
  ids.simpleSpeed.value = '25';
  context.calculateSimpleTaper();
  assert.equal(simpleResult(ids.simpleResult.innerHTML)[2], 10);
  assert.equal(context.calculateTaperBySpeed(1, 25).shiftL, 10);
});

test('the standalone Simple page uses the same upward rounding and preserved lengths', () => {
  const oldRoute = createHarness(fs.readFileSync(path.join(root, 'scripts/simple.js'), 'utf8'));
  oldRoute.start();
  for (const [width, speed, ...expected] of fixtures.simple) {
    oldRoute.ids.W.value = String(width);
    oldRoute.ids.S.value = String(speed);
    oldRoute.context.calculateTaperLength();
    const actual = simpleResult(oldRoute.ids.result.innerHTML);
    assert.deepEqual(actual.slice(0, 2), expected.slice(0, 2));
    assert.equal(actual[2] % 5, 0);
    assert.ok(actual[2] >= actual[1] / 2);
    assert.ok(actual[2] - actual[1] / 2 < 5);
  }
});

test('retains the archived Advanced explanatory text and adds length-to-width ratios', () => {
  const { context, ids } = setup();
  ids.advancedW.value = '12';
  context.applyPostedSpeed(60);
  context.setAdvancedSpeed('work', 45);
  context.calculateAdvancedTaper();
  const result = plainText(ids.advancedResult.innerHTML);
  for (const text of [
    'Posted Speed Minimum Values', 'Work Zone Speed Minimum Values',
    'Merging (L)', 'Shift (L/2)', 'Shoulder (L/3)',
    'RCOC standard is 200 ft (Calculated 415 feet)',
    'RCOC standard is 350 feet (Calculated 600 feet)',
    'Values rounded up to the nearest multiple of 5',
    'Target arrows are not to be installed unless directed by the engineer.',
  ]) assert.ok(result.includes(text), text);
  assert.match(ids.advancedFormula.innerHTML, /720\.00 \(1:60\)/);
  assert.match(ids.advancedResult.innerHTML, /class="work-zone-speed"/);
});

test('Simple speed highlighting and Enter submission work without the legacy global event', () => {
  const { context, ids, simpleButtons } = setup();
  context.setSimpleSpeed(35, simpleButtons[2]);
  context.setSimpleSpeed(45, simpleButtons[4]);
  assert.equal(simpleButtons[2].classList.contains('selected'), false);
  assert.equal(simpleButtons[4].classList.contains('selected'), true);
  ids.simpleW.value = '12';
  ids.simpleW.dispatch('keypress', { key: 'Enter' });
  assert.equal(simpleResult(ids.simpleResult.innerHTML)[0], '540.00');
  assert.equal(ids.simpleNote.classList.contains('hidden'), false);
});

test('switching Simple and Advanced keeps their independent input values', () => {
  const { ids, modes, panels } = setup();
  ids.simpleW.value = '12';
  ids.advancedW.value = '16';
  modes[1].dispatch('click');
  assert.equal(panels[0].classList.contains('hidden'), true);
  assert.equal(panels[1].classList.contains('hidden'), false);
  assert.equal(modes[1].classList.contains('active'), true);
  modes[0].dispatch('click');
  assert.equal(panels[0].classList.contains('hidden'), false);
  assert.equal(panels[1].classList.contains('hidden'), true);
  assert.equal(ids.simpleW.value, '12');
  assert.equal(ids.advancedW.value, '16');
});

test('posted speeds through 35 MPH automatically supply the matching work speed', () => {
  const { context, ids } = setup();
  for (const speed of [25, 30, 35]) {
    context.applyPostedSpeed(speed);
    assert.equal(Number(ids.advancedWorkSpeed.value), speed);
    assert.equal(ids.workSpeedButtons.style.display, 'none');
    ids.advancedW.value = '12';
    ids.advancedW.dispatch('keypress', { key: 'Enter' });
    assert.match(ids.advancedFormulaDetails.innerHTML, /same as posted speed/);
  }
});

test('40 MPH waits for a choice and both confirmation buttons select the requested speed', () => {
  const { context, ids, postedButtons } = setup();
  context.applyPostedSpeed(60);
  context.setAdvancedSpeed('posted', 40);
  assert.equal(ids.speedDialog.style.display, 'block');
  assert.equal(Number(ids.advancedPostedSpeed.value), 60);
  context.confirmAdvancedSpeed(40);
  assert.equal(ids.speedDialog.style.display, 'none');
  assert.equal(Number(ids.advancedPostedSpeed.value), 40);
  assert.equal(postedButtons[3].classList.contains('selected'), true);
  context.setAdvancedSpeed('posted', 40);
  context.confirmAdvancedSpeed(45);
  assert.equal(Number(ids.advancedPostedSpeed.value), 45);
  assert.equal(postedButtons[4].classList.contains('selected'), true);
  assert.equal(postedButtons[3].classList.contains('selected'), false);
});

test('work choices are limited to posted speed and stale higher selections are rejected', () => {
  const { context, ids, workButtons, alerts } = setup();
  context.applyPostedSpeed(60);
  context.setAdvancedSpeed('work', 60);
  context.applyPostedSpeed(45);
  assert.equal(Number(ids.advancedWorkSpeed.value), 0);
  assert.deepEqual(workButtons.filter(button => button.style.display !== 'none').map(button => Number(button.dataset.speed)), [35, 40, 45]);
  assert.equal(workButtons[5].classList.contains('selected'), false);
  ids.advancedW.value = '12';
  context.calculateAdvancedTaper();
  assert.match(alerts[0], /available work zone speed/);
  context.setAdvancedSpeed('work', 40);
  context.applyPostedSpeed(60);
  assert.equal(Number(ids.advancedWorkSpeed.value), 40);
  assert.equal(workButtons[1].classList.contains('selected'), true);
});

test('raising a low posted speed clears unavailable work speeds and highlights retained visible choices', () => {
  const { context, ids, workButtons, alerts } = setup();
  ids.advancedW.value = '12';
  for (const speed of [25, 30]) {
    context.applyPostedSpeed(speed);
    context.applyPostedSpeed(60);
    assert.equal(Number(ids.advancedWorkSpeed.value), 0);
    context.calculateAdvancedTaper();
    assert.equal(ids.advancedResult.innerHTML, '');
  }
  assert.equal(alerts.length, 2);
  context.applyPostedSpeed(35);
  context.applyPostedSpeed(60);
  assert.equal(Number(ids.advancedWorkSpeed.value), 35);
  assert.equal(workButtons[0].classList.contains('selected'), true);
  context.calculateAdvancedTaper();
  assert.match(ids.advancedFormulaDetails.innerHTML, /Work Zone Speed: 35/);
});

test('standalone Advanced preserves legacy results and uses the same selection fixes', () => {
  const page = createHarness(fs.readFileSync(path.join(root, 'scripts/complicated.js'), 'utf8'));
  page.start();
  assert.equal(page.ids.workSpeedButtons.style.display, 'none');
  for (const [width, posted, work, ...expected] of fixtures.advanced) {
    page.ids.W.value = String(width);
    page.ids.postedSpeed.value = String(posted);
    page.ids.workSpeed.value = String(work);
    page.context.calculateTaperLength();
    assert.deepEqual(advancedResult(page.ids.formula.innerHTML, page.ids.result.innerHTML), expected);
  }
  page.context.setSpeed('posted', 25);
  page.context.setSpeed('posted', 60);
  assert.equal(Number(page.ids.workSpeed.value), 0);
  page.context.calculateTaperLength();
  assert.match(page.alerts.at(-1), /available work zone speed/);
  page.context.setSpeed('posted', 40);
  assert.equal(Number(page.ids.postedSpeed.value), 60);
  page.context.confirmSpeed(45);
  assert.equal(Number(page.ids.postedSpeed.value), 45);
  page.ids.postedSpeed.value = '0';
  page.context.calculateTaperLength();
  assert.match(page.alerts.at(-1), /select a posted speed/);
});

test('empty and negative widths are rejected in both modes', () => {
  const { context, ids, alerts } = setup();
  for (const width of ['', '-1']) {
    ids.simpleW.value = ids.advancedW.value = width;
    context.calculateSimpleTaper();
    context.calculateAdvancedTaper();
  }
  assert.equal(alerts.length, 4);
  assert.equal(ids.simpleResult.innerHTML, '');
  assert.equal(ids.advancedResult.innerHTML, '');
});

test('calculating without choosing a speed cannot produce zero-length results', () => {
  const { context, ids, alerts } = setup();
  ids.simpleW.value = ids.advancedW.value = '12';
  context.calculateSimpleTaper();
  context.calculateAdvancedTaper();
  assert.equal(alerts.length, 2);
  assert.match(alerts[0], /select a speed/);
  assert.match(alerts[1], /select a posted speed/);
  assert.equal(ids.simpleResult.innerHTML, '');
  assert.equal(ids.advancedResult.innerHTML, '');
});

test('current HTML exposes all archived speed choices, prompts, and references', () => {
  const html = fs.readFileSync(path.join(root, 'taper_lengths.html'), 'utf8');
  const simple = [...html.matchAll(/setSimpleSpeed\((\d+), this\)/g)].map(match => Number(match[1]));
  const posted = [...html.matchAll(/setAdvancedSpeed\('posted', (\d+), this\)/g)].map(match => Number(match[1]));
  const work = [...html.matchAll(/setAdvancedSpeed\('work', (\d+), this\)/g)].map(match => Number(match[1]));
  assert.deepEqual(simple, [25, 30, 35, 40, 45, 50, 55, 60]);
  assert.deepEqual(posted, simple);
  assert.deepEqual(work, [35, 40, 45, 50, 55, 60]);
  assert.match(html, /confirmAdvancedSpeed\(40\)/);
  assert.match(html, /confirmAdvancedSpeed\(45\)/);
  assert.match(html, /https:\/\/rcoc\.miraheze\.org\/wiki\/Taper_Length/);
  assert.match(html, /body class="taper-lengths-page"/);
  assert.ok(fs.existsSync(path.join(root, 'img/pexels-hngstrm-1203768.jpg')));
});
