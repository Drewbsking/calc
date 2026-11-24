(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SignPlacement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MPH_TO_FPS = 5280 / 3600;
  // Each row: approach mph, Condition A ft, potential-stop ft, then advisory columns.
  // null is the MMUTCD's N/A (Note 5). Missing entries are published dashes/blanks.
  // Sources: ../curve/references/mmutcd-curve-reference.pdf p. 3 (printed p. 156)
  // and ../curve/references/mdot-curve-reference.pdf p. 2 (printed p. 21).
  const sources = {
    mmutcd: {
      label: '2025 MMUTCD', table: 'Table 2C-3',
      reference: '../curve/references/mmutcd-curve-reference.pdf#page=3',
      advisorySpeeds: [10, 20, 30, 40, 50, 60, 70, 80],
      rows: [
        [20, 225, 115, null],
        [25, 325, 155, null, null],
        [30, 460, 200, null, null],
        [35, 565, 250, null, null, null],
        [40, 670, 305, 100, 100, null],
        [45, 775, 360, 125, 100, 100, null],
        [50, 885, 425, 200, 175, 125, 100],
        [55, 990, 495, 275, 225, 200, 125, null],
        [60, 1100, 570, 350, 325, 275, 200, 100],
        [65, 1200, 645, 450, 400, 350, 275, 200, 100],
        [70, 1250, 730, 525, 500, 450, 375, 275, 150],
        [75, 1350, 820, 625, 600, 550, 475, 375, 250, 100],
        [80, 1475, 910, 725, 700, 625, 550, 450, 350, 200],
        [85, 1600, 1010, 825, 800, 750, 675, 575, 450, 300, 150]
      ]
    },
    mdot: {
      label: 'MDOT Signing Guide (2023)', table: 'Table 3',
      reference: '../curve/references/mdot-curve-reference.pdf#page=2',
      advisorySpeeds: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70],
      rows: [
        [25, 325, 155, 125, 100, 100, 100],
        [30, 460, 200, 150, 115, 100, 100, 100],
        [35, 565, 250, 185, 125, 115, 100, 100, 100],
        [40, 670, 305, 225, 150, 135, 125, 120, 115, 100],
        [45, 775, 360, 280, 200, 185, 175, 160, 150, 125, 100],
        [50, 885, 425, 350, 275, 250, 225, 215, 200, 175, 150, 100],
        [55, 990, 495, 425, 350, 335, 325, 300, 275, 240, 200, 175, 150],
        [60, 1100, 570, 510, 450, 425, 400, 375, 350, 315, 275, 240, 200, 150],
        [65, 1200, 645, 585, 525, 515, 500, 475, 450, 415, 375, 315, 275, 215, 150],
        [70, 1250, 695, 675, 625, 615, 600, 575, 550, 515, 475, 425, 375, 315, 250, 150],
        [75, 1350, 730, 745, 710, 705, 695, 685, 675, 640, 600, 550, 500, 425, 350, 275, 200]
      ]
    }
  };

  function number(value, label) {
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && value.trim() === '') || !Number.isFinite(Number(value))) {
      throw new Error(`Enter a finite number for ${label}.`);
    }
    return Number(value);
  }

  function lookup({ source, condition, approach, advisory, extraLegibility = false }) {
    if (!Object.hasOwn(sources, source)) throw new Error('Select a table source.');
    const data = sources[source];
    if (!['A', 'stop', 'speed'].includes(condition)) throw new Error('Select a warning condition.');
    const speed = number(approach, 'approach speed');
    const row = data.rows.find((entry) => entry[0] === speed);
    if (!row) throw new Error(`Select a published approach speed from ${data.label}.`);
    let column = condition === 'A' ? 1 : 2;
    if (condition === 'speed') {
      const target = number(advisory, 'advisory speed');
      const index = data.advisorySpeeds.indexOf(target);
      if (index < 0) throw new Error('Select a published advisory-speed column; no interpolation is applied.');
      if (target >= speed) throw new Error('Advisory speed must be lower than approach speed.');
      column = index + 3;
    }
    const value = row[column];
    if (value === null) return { status: 'site', feet: null, baseFeet: null, addition: 0 };
    if (value === undefined) return { status: 'blank', feet: null, baseFeet: null, addition: 0 };
    const addition = source === 'mmutcd' && extraLegibility === true ? 100 : 0;
    return { status: 'value', feet: value + addition, baseFeet: value, addition,
      minimumSpacing: condition === 'speed' && value === 100 };
  }

  function calculate({ initial, final, deceleration, reaction, legibility }) {
    const vi = number(initial, 'approach speed');
    const vf = number(final, 'target speed');
    const a = number(deceleration, 'deceleration');
    const t = number(reaction, 'perception-response time');
    const L = number(legibility, 'legibility distance');
    if (vi <= 0) throw new Error('Approach speed must be greater than zero.');
    if (vf < 0 || vf > vi) throw new Error('Target speed must be between zero and the approach speed.');
    if (a <= 0) throw new Error('Deceleration must be greater than zero.');
    if (t < 0) throw new Error('Perception-response time cannot be negative.');
    if (L < 0) throw new Error('Legibility distance cannot be negative.');
    const initialFPS = vi * MPH_TO_FPS;
    const finalFPS = vf * MPH_TO_FPS;
    const response = initialFPS * t;
    const braking = (initialFPS ** 2 - finalFPS ** 2) / (2 * a);
    const total = response + braking;
    const placement = Math.max(0, total - L);
    const letterHeight = L / 30;
    if (![initialFPS, finalFPS, response, braking, total, placement, letterHeight].every(Number.isFinite)) {
      throw new Error('These inputs exceed the calculation range. Use smaller values.');
    }
    return { initialFPS, finalFPS, response, braking, total, placement, letterHeight,
      legibility: L, clamped: L >= total };
  }

  return { sources, MPH_TO_FPS, lookup, calculate };
});
