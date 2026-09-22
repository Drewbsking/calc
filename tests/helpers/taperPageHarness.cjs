const vm = require('node:vm');

function control(properties = {}) {
  const classes = new Set();
  const listeners = {};
  return Object.assign({
    value: '0', innerHTML: '', innerText: '', style: {}, dataset: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle(name, force = !classes.has(name)) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    addEventListener(name, callback) { listeners[name] = callback; },
    dispatch(name, event = {}) { listeners[name]?.(event); },
  }, properties);
}

function createHarness(source) {
  const speeds = [25, 30, 35, 40, 45, 50, 55, 60];
  const buttons = (values) => values.map((speed) => control({
    innerText: String(speed), dataset: { speed: String(speed) },
  }));
  const simpleButtons = buttons(speeds);
  const postedButtons = buttons(speeds);
  const workButtons = buttons([35, 40, 45, 50, 55, 60]);
  const modes = ['simple', 'advanced'].map((mode) => control({ dataset: { mode } }));
  const panels = ['simple', 'advanced'].map((mode) => control({ dataset: { mode } }));
  const ids = Object.fromEntries([
    'W', 'S', 'postedSpeed', 'workSpeed', 'result', 'note', 'formula', 'formulaDetails',
    'simpleW', 'simpleSpeed', 'simpleResult', 'simpleNote', 'advancedW',
    'advancedPostedSpeed', 'advancedWorkSpeed', 'advancedResult',
    'advancedFormula', 'advancedFormulaDetails', 'speedDialog',
  ].map((name) => [name, control()]));
  ids.workSpeedButtons = control({ querySelectorAll: () => workButtons });
  ids.postedSpeedButtons = control({ querySelectorAll: () => postedButtons });
  const ready = [];
  const alerts = [];
  const document = {
    getElementById(name) {
      if (!ids[name]) throw new Error('Unexpected element ID: ' + name);
      return ids[name];
    },
    querySelectorAll(selector) {
      if (selector === '.mode-button') return modes;
      if (selector === '.calculator-panel') return panels;
      if (selector.startsWith('#postedSpeedButtons')) return postedButtons;
      if (selector.startsWith('#workSpeedButtons') || selector === '.work-speed') return workButtons;
      if (selector.includes('data-mode="simple"')) return simpleButtons;
      if (selector === '.speed-button') return [...simpleButtons, ...postedButtons, ...workButtons];
      throw new Error('Unexpected selector: ' + selector);
    },
    addEventListener(name, callback) {
      if (name === 'DOMContentLoaded') ready.push(callback);
    },
  };
  const context = vm.createContext({ document, alert: (message) => alerts.push(message) });
  vm.runInContext(source, context);
  return { context, ids, simpleButtons, postedButtons, workButtons, modes, panels, alerts,
    start: () => ready.forEach((callback) => callback()) };
}

function plainText(html) {
  return html.replace(/\s*\(1:[\d.]+\)/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function simpleResult(html) {
  const text = plainText(html);
  return [
    text.match(/Calculated L = ([\d.]+)/)[1],
    Number(text.match(/Design L = ([\d.]+)/)[1]),
    Number(text.match(/L\/2 Shift only\* = ([\d.]+)/)[1]),
  ];
}

function advancedResult(formula, html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1);
  const cells = rows.map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((cell) => plainText(cell[1])));
  return [
    plainText(formula).match(/Calculated L: ([\d.]+)/)[1],
    ...cells.slice(0, 3).flatMap((row) => row.slice(1).map(Number)),
    Number(cells[3][1].match(/Calculated ([\d.]+)/)[1]),
    Number(cells[4][1].match(/Calculated ([\d.]+)/)[1]),
  ];
}

module.exports = { createHarness, plainText, simpleResult, advancedResult };
