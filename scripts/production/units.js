(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CPUnits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const units = Object.freeze({
    SF: ['area', 1], SY: ['area', 9], Acres: ['area', 43560],
    FT: ['length', 1], LF: ['length', 1], Miles: ['length', 5280],
    CF: ['volume', 1], CY: ['volume', 27],
    LB: ['weight', 1], Tons: ['weight', 2000], EA: ['count', 1],
    Hours: ['time', 1], Workdays: ['time', null], 'Calendar days': ['time', 24]
  });
  function number(value, label, positive = false) {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean' ||
        !Number.isFinite(Number(value)) || Number(value) < 0 || (positive && Number(value) === 0)) {
      throw new Error(`${label} must be a ${positive ? 'positive' : 'nonnegative'} number.`);
    }
    return Number(value);
  }
  function dimension(unit) {
    if (!units[unit]) throw new Error(`Unknown unit: ${unit}.`);
    return units[unit][0];
  }
  function convert(value, from, to, hoursPerDay = 8) {
    const quantity = number(value, 'Quantity');
    if (dimension(from) !== dimension(to)) throw new Error(`Cannot convert ${from} to ${to}; choose compatible units or a quantity transformation.`);
    const factor = unit => unit === 'Workdays' ? number(hoursPerDay, 'Hours per workday', true) : units[unit][1];
    return quantity * factor(from) / factor(to);
  }
  return { units, number, dimension, convert, quantityUnits: Object.keys(units).filter(u => units[u][0] !== 'time') };
});
