const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page() {
  function element() {
    return {
      style: {}, value: '', textContent: '', checked: false, children: [], handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      appendChild(child) { this.children.push(child); },
      set innerHTML(value) { this.children = []; }
    };
  }
  const folder = path.join(__dirname, '../calculators/time-off');
  const html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, element()]));
  const radios = {};
  for (const [, name, value] of html.matchAll(/type="radio" name="([^"]+)" value="([^"]+)"/g)) {
    (radios[name] ||= []).push(Object.assign(element(), { value }));
  }
  const document = {
    getElementById: id => elements[id],
    querySelectorAll: selector => radios[selector.match(/name="([^"]+)"/)[1]],
    querySelector: selector => document.querySelectorAll(selector).find(input => input.checked) || null,
    createElement: element
  };
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'timeOff.js'), 'utf8'), { document });
  return {
    get: id => elements[id],
    select(name, value) {
      radios[name].forEach(input => { input.checked = input.value === value; });
      radios[name].find(input => input.checked).handlers.change?.();
    },
    submit() { elements.evaluateButton.handlers.click({ preventDefault() {} }); },
    steps() { return elements.decisionSteps.children.map(child => child.textContent).join('\n'); }
  };
}

function medicalPage() {
  const h = page();
  h.select('healthRelated', 'yes');
  h.get('hoursUsed').value = '0';
  h.get('consecutiveDays').value = '1';
  return h;
}

test('medical leave exposes the long-term route and requires its answers', () => {
  const h = medicalPage();
  assert.equal(h.get('longTermGroup').style.display, 'block');
  assert.equal(h.get('plannedGroup').style.display, 'none');
  h.submit();
  assert.match(h.get('validationMessage').textContent, /long-term medical/);
  h.select('longTermMedical', 'yes');
  assert.equal(h.get('personalExhaustedGroup').style.display, 'block');
  h.submit();
  assert.match(h.get('validationMessage').textContent, /personal leave has been exhausted/);
  h.select('personalLeaveExhausted', 'yes');
  h.submit();
  assert.equal(h.get('decisionHeadline').textContent, 'Frozen Sick Bank and FMLA/Extended Sick Leave');
  assert.doesNotMatch(h.steps(), /automatically ESTA-covered/);
  h.select('personalLeaveExhausted', 'no');
  h.submit();
  assert.equal(h.get('decisionHeadline').textContent, 'Personal leave (ESTA-covered)');
  assert.match(h.steps(), /When personal leave is exhausted, transition/);
});

test('blank, negative, and invalid numeric inputs cannot produce a decision', () => {
  for (const [id, values] of [
    ['hoursUsed', ['', ' ', '-1', 'abc']],
    ['consecutiveDays', ['', ' ', '-1', '0', '1.5', 'abc']]
  ]) {
    for (const value of values) {
      const h = medicalPage();
      h.select('longTermMedical', 'no');
      h.get(id).value = value;
      h.submit();
      assert.equal(h.get('validationMessage').style.display, 'block', `${id}: ${value}`);
      assert.equal(h.get('decisionCard').style.display, 'none', `${id}: ${value}`);
    }
  }
});

test('union documentation rule still starts at three days and 72-hour boundary is preserved', () => {
  const h = medicalPage();
  h.select('longTermMedical', 'no');
  for (const [hours, headline] of [['71.5', 'Personal leave (ESTA-covered)'], ['72', 'Personal leave (non-ESTA rules)']]) {
    h.get('hoursUsed').value = hours;
    for (const days of ['2', '3', '4']) {
      h.get('consecutiveDays').value = days;
      h.submit();
      assert.equal(h.get('validationMessage').style.display, 'none');
      assert.equal(h.get('decisionHeadline').textContent, headline);
      assert.equal(h.steps().includes('require medical note and fit-for-duty clearance'), Number(days) >= 3);
    }
  }
});

test('switching to nonmedical leave clears medical answers and evaluates planned or unplanned leave', () => {
  const h = medicalPage();
  h.select('longTermMedical', 'yes');
  h.select('personalLeaveExhausted', 'yes');
  h.select('healthRelated', 'no');
  assert.equal(h.get('longTermGroup').style.display, 'none');
  assert.equal(h.get('personalExhaustedGroup').style.display, 'none');
  h.submit();
  assert.match(h.get('validationMessage').textContent, /planned time off/);
  h.select('plannedTime', 'no');
  h.submit();
  assert.equal(h.get('decisionHeadline').textContent, 'Unpaid leave (if approved)');
  h.select('plannedTime', 'yes');
  h.submit();
  assert.equal(h.get('decisionHeadline').textContent, 'Vacation or personal leave');
  h.select('healthRelated', 'yes');
  h.submit();
  assert.match(h.get('validationMessage').textContent, /long-term medical/);
  h.select('longTermMedical', 'yes');
  h.submit();
  assert.match(h.get('validationMessage').textContent, /personal leave has been exhausted/);
});
