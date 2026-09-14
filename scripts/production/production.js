(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./units.js') : root.CPUnits);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CPProduction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U) {
  'use strict';
  function duration(quantity, quantityUnit, rate, rateUnit, ratePeriod = 'Workdays', hoursPerDay = 8) {
    const value = U.number(rate, 'Production rate', true);
    const hours = U.number(hoursPerDay, 'Hours per workday', true);
    if (!['Hours', 'Workdays', 'Calendar days'].includes(ratePeriod)) throw new Error('Choose a valid production rate time unit.');
    const rateQuantity = U.convert(quantity, quantityUnit, rateUnit);
    const periods = rateQuantity / value;
    const productiveHours = U.convert(periods, ratePeriod, 'Hours', hours);
    if (!Number.isFinite(productiveHours)) throw new Error('Production duration is too large.');
    return { rateQuantity, periods, hours: productiveHours, days: productiveHours / hours };
  }
  function convertRate(rate, fromUnit, fromPeriod, toUnit, toPeriod, hoursPerDay = 8) {
    return U.convert(U.number(rate, 'Production rate', true), fromUnit, toUnit) *
      U.convert(1, toPeriod, 'Hours', hoursPerDay) / U.convert(1, fromPeriod, 'Hours', hoursPerDay);
  }
  return { duration, convertRate };
});
