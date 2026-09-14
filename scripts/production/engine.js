(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./units.js') : root.CPUnits, node ? require('./quantities.js') : root.CPQuantity,
    node ? require('./production.js') : root.CPProduction, node ? require('./calendar.js') : root.CPCalendar);
  if (node) module.exports = api; else root.CPEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U, Q, P, C) {
  'use strict';
  const planningWarning = 'Theoretical planning estimate. Adjust for traffic control, trucking, weather, staging, access, and contractor limitations.';
  function compile(scenario, calendar) {
    if (U.dimension(scenario.unit) === 'time') throw new Error('Project quantity must use an area, length, volume, weight, or count unit.');
    if (!Array.isArray(scenario.operations)) throw new Error('Add operations to the project.');
    if (scenario.operations.some(o => !o.enabled && o.required)) throw new Error('A required operation is disabled. Enable it or remove its required designation.');
    const active = scenario.operations.filter(o => o.enabled);
    if (!active.length) throw new Error('Add and enable at least one operation.');
    return active.map(op => {
      try {
        if (!['sequential', 'same-day', 'separate-day', 'concurrent'].includes(op.relation)) throw new Error('Choose a scheduling relationship.');
        if (op.relation === 'concurrent' && !scenario.allowConcurrent) throw new Error('Concurrent operations are disabled in Scheduling Rules.');
        const delayHours = U.number(op.delayHours ?? 0, 'Minimum delay');
        if (op.kind === 'calendar') {
          const calendarDays = U.number(op.calendarDays, 'Calendar duration');
          if (!['full-days', 'rolling'].includes(op.calendarRule)) throw new Error('Choose a calendar activity start rule.');
          return { ...op, delayHours, calendarDays, slope: 0, fixedHours: 0 };
        }
        const fixed = Q.derive(0, scenario.unit, op, scenario.density);
        const unit = Q.derive(1, scenario.unit, op, scenario.density);
        const fixedHours = P.duration(fixed.quantity, op.unit, op.rate, op.rateUnit, op.ratePeriod, calendar.hoursPerDay).hours;
        const slope = P.duration(unit.quantity - fixed.quantity, op.unit, op.rate, op.rateUnit, op.ratePeriod, calendar.hoursPerDay).hours;
        return { ...op, delayHours, slope, fixedHours };
      } catch (error) { throw new Error(`${op.name || 'Operation'}: ${error.message}`); }
    });
  }
  function schedule(scenario, quantity, calendar, compiled, detail = true) {
    const rows = [], workdays = new Set();
    let barrier = calendar.start, previous = null, lastWorkDay = null;
    let productiveHours = 0;
    for (const op of compiled) {
      let ready = op.relation === 'concurrent' && previous ? previous.start : barrier;
      const separate = op.relation === 'separate-day' || (!scenario.allowSameDay && op.relation !== 'concurrent');
      if (separate && previous && lastWorkDay !== null) ready = Math.max(ready, (lastWorkDay + 1) * 24 + C.parseTime(scenario.calendar.shiftStart ?? '07:00'));
      ready += op.delayHours;
      let row;
      if (op.kind === 'calendar') {
        const fullStart = Math.ceil((ready - C.EPS) / 24) * 24;
        const start = op.calendarDays > 0 && op.calendarRule === 'full-days' ? fullStart : ready;
        row = { ...op, start, end: start + op.calendarDays * 24, hours: 0, days: 0, segments: [], quantity: null,
          formula: `${op.calendarDays} calendar days × 24 hours; ${op.calendarRule === 'full-days' ? 'full calendar days beginning at the next midnight' : 'continuous time beginning when predecessors finish'}.` };
      } else {
        const hours = op.fixedHours + op.slope * quantity;
        const placement = calendar.work(ready, hours);
        productiveHours += hours;
        for (const segment of placement.segments) workdays.add(segment.day);
        if (placement.segments.length) lastWorkDay = Math.max(lastWorkDay ?? -Infinity, placement.segments.at(-1).day);
        row = { ...op, ...placement, hours, days: hours / calendar.hoursPerDay };
        if (detail) {
          Object.assign(row, Q.derive(quantity, scenario.unit, op, scenario.density));
          row.production = P.duration(row.quantity, op.unit, op.rate, op.rateUnit, op.ratePeriod, calendar.hoursPerDay);
          row.formula += `; ${row.production.rateQuantity.toFixed(6)} ${op.rateUnit} ÷ ${op.rate} ${op.rateUnit}/${op.ratePeriod} = ${row.production.periods.toFixed(6)} ${op.ratePeriod} = ${row.hours.toFixed(6)} productive hours = ${row.days.toFixed(6)} crew days.`;
        }
      }
      rows.push(row);
      barrier = Math.max(barrier, row.end);
      previous = row;
    }
    const finishDay = Math.floor((barrier - C.EPS) / 24);
    const longest = rows.filter(o => o.kind === 'production').sort((a, b) => b.hours - a.hours)[0];
    return { quantity, unit: scenario.unit, rows, start: calendar.start, end: barrier,
      productiveHours, productiveDays: productiveHours / calendar.hoursPerDay,
      scheduledWorkdays: workdays.size, calendarDays: Math.max(1, finishDay - calendar.startDay + 1),
      completionDate: calendar.hasDates ? C.dateLabel(barrier - C.EPS) : null,
      hasDates: calendar.hasDates, controlling: longest?.name || 'Calendar waiting period',
      controllingBasis: 'Largest productive crew-time demand; calendar waits and day boundaries also affect completion.',
      totalHmaTons: rows.reduce((sum, o) => sum + (o.tons || 0), 0), calendar };
  }
  function warnings(scenario, result) {
    const messages = [planningWarning];
    for (const note of new Set(result.rows.map(o => o.rateBasisNote).filter(Boolean))) messages.push(note);
    if (result.rows.some(o => o.rateSource && /MDOT/.test(o.rateSource))) messages.push('MDOT source comments may require additional setup, testing, curing, or mobilization. Add those allowances as explicit operations or delays; selecting a production rate alone does not add them.');
    if (!result.hasDates) messages.push('No start date supplied: relative scheduling starts on the first enabled weekday on or after an assumed Monday. Calendar duration depends on the eventual start date.');
    if (result.rows.filter(o => o.transform === 'hma').length > 1 && result.rows.some((o, i) => i && o.transform === 'hma' && result.rows[i - 1].transform === 'hma' && o.relation !== 'separate-day') && scenario.allowSameDay) {
      messages.push('Same-day lifts require sufficient cooling, compaction, bond coat, and preparation. Enter the required minimum delay or add preparation operations; no allowance is automatically included.');
    }
    if (result.rows.some(o => o.kind === 'calendar' && o.calendarDays > 0)) messages.push('Calendar activities continue through weekends and holidays. Cure completion may fall outside the working week; following crew work waits for the next shift.');
    if (result.rows.some(o => o.relation === 'concurrent')) messages.push('Concurrent operations assume independent crews and production capacity. The following sequential operation waits for every preceding concurrent operation.');
    if (result.rows.some(o => o.ratePeriod === 'Calendar days' && o.kind !== 'calendar')) messages.push('A production rate per calendar day is normalized over 24 hours; productive work still runs only during the selected shifts. Use a calendar activity for continuous waiting.');
    const excluded = scenario.operations.filter(o => !o.enabled).map(o => o.name);
    if (excluded.length) messages.push(`Excluded from this estimate: ${excluded.join(', ')}.`);
    return messages;
  }
  function duration(scenario) {
    const quantity = U.number(scenario.quantity, 'Project quantity', true);
    const calendar = C.create(scenario.calendar);
    const compiled = compile(scenario, calendar);
    const result = schedule(scenario, quantity, calendar, compiled);
    return { ...result, mode: 'duration', warnings: warnings(scenario, result) };
  }
  function upperBound(ops, hours) {
    return Math.min(...ops.filter(o => o.slope > 0).map(o => Math.max(0, (hours - o.fixedHours) / o.slope)));
  }
  function solve(scenario, calendar, compiled) {
    let hi = upperBound(compiled, calendar.availableHours);
    if (!Number.isFinite(hi)) throw new Error('Maximum production needs at least one operation that scales with the project quantity. Fixed quantities alone have no finite maximum.');
    const fits = quantity => schedule(scenario, quantity, calendar, compiled, false).end <= calendar.deadline + C.EPS;
    // Positive probe preserves separate-day requirements even when a quantity tends to zero.
    const probe = Math.min(hi, Math.max(hi * 1e-8, 0.000001));
    if (hi <= 0 || !fits(probe)) return { maximum: 0, minimum: schedule(scenario, Math.max(probe, 0.000001), calendar, compiled, false) };
    let lo = 0;
    for (let i = 0; i < 55; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    // Do not round a feasible quantity upward across a daily capacity boundary.
    return { maximum: lo * (1 - 1e-9) };
  }
  function maximum(scenario) {
    if (scenario.quantity !== '' && scenario.quantity !== undefined) U.number(scenario.quantity, 'Requested quantity');
    const calendar = C.create(scenario.calendar, scenario.closure);
    const compiled = compile(scenario, calendar);
    const solution = solve(scenario, calendar, compiled);
    const continuousMaximum = solution.maximum;
    if (scenario.unit === 'EA' && solution.maximum > 0) {
      const nextWhole = Math.ceil(solution.maximum);
      solution.maximum = schedule(scenario, nextWhole, calendar, compiled, false).end <= calendar.deadline + C.EPS ? nextWhole : Math.floor(solution.maximum);
      if (!solution.maximum) solution.minimum = schedule(scenario, 1, calendar, compiled, false);
    }
    const result = schedule(scenario, solution.maximum, calendar, compiled);
    let controlling = 'Scheduling rules / available window';
    let controllingBasis = 'The required day boundaries or fixed work prevent any positive common quantity from finishing in this window.';
    if (solution.maximum > 0) {
      // Sensitivity uses the same forward scheduler. Numerical rates with unlike units are never compared.
      const sensitive = compiled.filter(o => o.slope > 0).filter(op => {
        const improved = compiled.map(o => o === op ? { ...o, slope: o.slope / 1.01, fixedHours: o.fixedHours / 1.01 } : o);
        return solve(scenario, calendar, improved).maximum > continuousMaximum * (1 + 1e-5);
      });
      if (sensitive.length) {
        controlling = sensitive.length === 1 ? sensitive[0].name : `Combined sequence: ${sensitive.map(o => o.name).join(' + ')}`;
        controllingBasis = 'Increasing these rates by 1% increases continuous project capacity before any whole-item rounding. Sequencing and shared daily time are included.';
      } else {
        controlling = 'Joint capacity / scheduling constraint';
        controllingBasis = 'Improving one production rate alone does not increase completed quantity; tied capacity or scheduling limits remain.';
      }
    }
    result.controlling = controlling;
    result.controllingBasis = controllingBasis;
    const messages = warnings(scenario, result);
    if (!solution.maximum) messages.unshift(`Selected operations do not fit in the closure. ${scenario.unit === 'EA' ? 'At least one complete item' : 'Even a very small positive quantity'} requires ${solution.minimum.scheduledWorkdays} workdays and ${solution.minimum.calendarDays} elapsed calendar days under these rules.`);
    let requested = null;
    if (scenario.quantity !== '' && scenario.quantity !== undefined && Number(scenario.quantity) > 0) {
      requested = schedule(scenario, U.number(scenario.quantity, 'Requested quantity', true), calendar, compiled);
      requested.fits = requested.end <= calendar.deadline + C.EPS;
      if (!requested.fits) messages.push(`Requested ${scenario.quantity} ${scenario.unit} does not fit: its complete sequence needs ${requested.scheduledWorkdays} scheduled workdays and ${requested.calendarDays} calendar days.`);
    }
    return { ...result, mode: 'maximum', maximum: solution.maximum, feasible: solution.maximum > 0, requested,
      minimum: solution.minimum, availableHours: calendar.availableHours, availableWorkdays: calendar.windowSlots.length,
      deadline: calendar.deadline, warnings: messages };
  }
  return { duration, maximum, compile, schedule };
});
