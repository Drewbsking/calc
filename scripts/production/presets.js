(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./mdotRates2023.js') : root.CPMdotRates2023);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CPData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sourceRows) {
  'use strict';
  const sourceVersion = 'mdot-november-2023-v1';
  const sourceFile = 'MDOT_Production_Rates_November_2023 (1).pdf';
  const aliases = {
    'Removing Concrete Pavement': 'removal',
    'Concrete Pavement - Mainline & Shoulder - Non-Freeway': 'concrete',
    'Concrete Pavement - Mainline & Shoulder - Freeway': 'freeway',
    'Cold Milling': 'milling',
    'HMA Pavement - Mainline & Shoulder - Non-freeway': 'paving',
    'HMA Pavement - Mainline & Shoulder- Freeway': 'paving-freeway',
    'HMA Pavement - Misc': 'paving-misc'
  };
  const basisLabels = { quantity: 'Quantity per workday', 'days-per-unit': 'Workdays per EA',
    workdays: 'Workdays for one activity', 'calendar-days': 'Calendar days for one activity / order',
    'calendar-months': 'Calendar months (30-day planning conversion)' };
  function category(row) {
    if (row.page === 3) return 'Bridge construction & rehabilitation';
    if (row.page === 1) return row.row <= 15 ? 'Drainage & utilities' : row.row <= 23 ? 'Removals' : 'Earthwork & aggregate';
    if (row.row === 1) return 'Earthwork & aggregate';
    if (row.row <= 15) return 'Concrete pavement & sidewalk';
    if (row.row <= 22) return 'HMA & pavement maintenance';
    if ([24, 25, 26].includes(row.row)) return 'Restoration';
    if (row.row <= 35) return 'Roadside, traffic & signing';
    if (row.row <= 39) return 'Retaining walls';
    if (row.row <= 44) return 'Railroad & temporary roadway';
    return 'Sheeting & cofferdams';
  }
  function parsePrintedRate(text, activity) {
    const cleaned = text.replace(/,/g, '').replace(/`/g, '').trim();
    const match = cleaned.match(/^(\d*\.?\d+)\s*(.*)$/);
    if (!match) throw new Error(`Unrecognized MDOT production rate: ${text}`);
    const value = Number(match[1]), suffix = match[2].toLowerCase().replace(/\s+/g, '');
    const waiting = /cure|lead time/i.test(activity);
    if (/^months?$/.test(suffix)) return { value, unit: 'EA', basis: 'calendar-months' };
    if (/^days?$/.test(suffix)) return { value, unit: 'EA', basis: waiting ? 'calendar-days' : 'workdays' };
    if (/^days?\//.test(suffix)) return { value, unit: 'EA', basis: waiting ? 'calendar-days' : 'days-per-unit', countLabel: suffix.split('/')[1] };
    const prefix = suffix.split('/')[0].replace(/day$/, '');
    const units = { lf: 'LF', vlf: 'LF', ft: 'FT', sf: 'SF', sy: 'SY', cy: 'CY', ton: 'Tons', tons: 'Tons', acre: 'Acres', miles: 'Miles', unit: 'EA', units: 'EA', each: 'EA', ea: 'EA', signs: 'EA', piles: 'EA', beams: 'EA', pieces: 'EA', shaft: 'EA', '': 'EA' };
    if (!units[prefix]) throw new Error(`Unrecognized MDOT quantity unit: ${text}`);
    return { value, unit: units[prefix], basis: 'quantity', countLabel: units[prefix] === 'EA' ? prefix || 'weld / splice' : null };
  }
  const rates = sourceRows.map(row => {
    const parsed = Object.fromEntries(Object.entries(row.sourceRates).map(([level, text]) => [level, parsePrintedRate(text, row.activity)]));
    const a = parsed.average;
    const interpretation = [];
    if (a.basis === 'days-per-unit') interpretation.push(`EA counts ${a.countLabel}; printed workdays per item are inverted to EA/workday in operations.`);
    if (a.basis === 'workdays') interpretation.push('Fixed duration for one complete activity; added as quantity 1 EA at the reciprocal EA/workday rate.');
    if (a.basis === 'calendar-days') interpretation.push('Modeled as calendar time for one activity/order, independent of project quantity.');
    if (a.basis === 'calendar-months') interpretation.push('One approval/fabrication period. A planning month is explicitly converted to 30 calendar days; edit the calendar duration for actual dates.');
    if (/\/Man|per Person/i.test(row.sourceRates.average)) interpretation.push('Rate is for one person. No crew-size multiplier is applied.');
    if (/\/Side\//i.test(row.sourceRates.average)) interpretation.push('Rate is for one side. Enter the total length across all sides.');
    if (/VLF/.test(row.sourceRates.average)) interpretation.push('VLF is vertical linear feet; enter the total vertical length in LF.');
    if (a.basis === 'quantity' && a.countLabel && !['unit', 'units', 'ea', 'each'].includes(a.countLabel)) interpretation.push(`EA counts ${a.countLabel}.`);
    const levelUnits = Object.fromEntries(Object.entries(parsed).map(([level, r]) => [level, r.unit]));
    if (new Set(Object.values(levelUnits)).size > 1) interpretation.push('Source discrepancy: Low is SY/day while Average and High are CY/day. Units are preserved per level; confirm the intended grading quantity before use.');
    if (a.basis === 'quantity' && parsed.high.value < parsed.average.value) interpretation.push('Source discrepancy: the printed High rate is below Average. Values are preserved as printed; confirm before use.');
    return { id: aliases[row.activity] || `mdot-p${row.page}-r${String(row.row).padStart(2, '0')}`, activity: row.activity,
      category: category(row), unit: a.unit, period: 'Workdays', basis: a.basis, rate: a.value,
      low: parsed.low.value, average: a.value, high: parsed.high.value,
      ...(new Set(Object.values(levelUnits)).size > 1 ? { levelUnits } : {}),
      source: `MDOT Roadway & Bridge Production Rates, November 2023, page ${row.page}`,
      sourcePage: row.page, sourceRates: row.sourceRates, sourceFile, notes: row.notes, interpretation: interpretation.join(' '),
      transform: /^HMA Pavement/.test(row.activity) ? 'hma' : /^Concrete Pavement -/.test(row.activity) ? 'volume' : 'direct' };
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  let serial = 0;
  const id = () => `op-${Date.now().toString(36)}-${++serial}`;
  function operation(patch = {}) {
    return { id: id(), name: 'Custom operation', enabled: true, required: true, kind: 'production', transform: 'direct',
      unit: 'EA', quantity: 120, factor: 1, thickness: 1.5, rate: 25, rateUnit: 'EA', ratePeriod: 'Workdays',
      relation: 'sequential', delayHours: 0, calendarDays: 3, calendarRule: 'full-days', notes: '', ...patch };
  }
  function rateSelection(entry, level = 'low') {
    const value = entry[level] ?? entry.rate;
    const unit = entry.levelUnits?.[level === 'rate' ? 'average' : level] || entry.unit;
    const basis = entry.basis || 'quantity';
    const sourceRate = `${value} ${basis === 'quantity' ? `${unit}/${entry.period}` : basisLabels[basis]}`;
    const meta = { rateId: entry.id, rateSource: entry.source, sourceRate, rateBasisNote: entry.interpretation || '', sourceFile: entry.sourceFile || '', sourcePage: entry.sourcePage || null };
    if (basis.startsWith('calendar-')) return { ...meta, kind: 'calendar', calendarDays: value === '' || value === null ? '' : Number(value) * (basis === 'calendar-months' ? 30 : 1), calendarRule: /cure/i.test(entry.activity) ? 'full-days' : 'rolling' };
    const rate = basis === 'quantity' ? value : Number(value) > 0 ? 1 / Number(value) : '';
    return { ...meta, kind: 'production', unit, rateUnit: unit, ratePeriod: entry.period || 'Workdays', rate,
      transform: basis === 'workdays' || basis === 'days-per-unit' ? 'fixed' : entry.transform || 'direct',
      ...(basis === 'workdays' || basis === 'days-per-unit' ? { quantity: 1 } : {}),
      ...(/^(volume|hma)$/.test(entry.transform) ? { thickness: entry.transform === 'volume' ? 10 : 1.5 } : {}) };
  }
  function applyRate(op, entry, level = 'low', selectItem = false) {
    const selected = rateSelection(entry, level);
    const patch = { ...selected };
    if (!selectItem && op.kind === selected.kind) {
      delete patch.transform; delete patch.quantity; delete patch.thickness;
      if (selected.kind === 'production' && !entry.levelUnits) delete patch.unit;
    }
    Object.assign(op, patch);
    if (selectItem) {
      if (!(op.name.startsWith('HMA Lift ') && entry.transform === 'hma')) op.name = entry.activity;
      op.notes = entry.notes;
    }
    return op;
  }
  function fromRate(key, library = rates, level = 'low', patch = {}) {
    const entry = library.find(r => r.id === key) || rates.find(r => r.id === key);
    if (!entry) throw new Error('Choose a work item from the rate library.');
    return operation({ name: entry.activity, ...rateSelection(entry, level), notes: entry.notes, ...patch });
  }
  const lift = (number, library = rates, level = 'low') => fromRate('paving', library, level,
    { name: `HMA Lift ${number}`, transform: 'hma', thickness: 1.5 });
  function template(name, library = rates, level = 'low') {
    if (name === 'concrete') return [fromRate('removal', library, level),
      fromRate('concrete', library, level, { transform: 'volume', thickness: 10 }),
      operation({ name: 'Concrete cure', kind: 'calendar', calendarDays: 3 })];
    if (name === 'hma') return [fromRate('milling', library, level),
      { ...lift(1, library, level), relation: 'separate-day' }, lift(2, library, level)];
    if (name === 'overlay') return [operation({ name: 'Surface preparation', unit: 'SY', rateUnit: 'SY', rate: '',
      notes: 'Enter a project-specific surface preparation rate.' }), lift(1, library, level)];
    return [];
  }
  function scenario(mode = 'duration') {
    return { name: mode === 'duration' ? 'Concrete remove & replace' : 'Weekend mill & fill', mode,
      quantity: mode === 'duration' ? 21000 : 68400, unit: 'SF', density: 145, level: 'low', libraryId: 'mdot',
      calendar: { startDate: '', weekdays: mode === 'duration' ? [1, 2, 3, 4] : [6, 0], hoursPerDay: 8, shiftStart: '07:00', holidays: [], dailyHours: {} },
      closure: { type: 'workdays', workdays: 2, start: '', end: '' }, allowConcurrent: false, allowSameDay: true,
      operations: template(mode === 'duration' ? 'concrete' : 'hma') };
  }
  function libraries() { return [{ id: 'mdot', name: 'MDOT — November 2023', kind: 'Agency', sourceVersion, rates: clone(rates) }]; }
  function migrateSavedState(saved) {
    const old = saved.libraries.find(l => l.id === 'mdot');
    if (old?.sourceVersion === sourceVersion) return saved;
    if (old) {
      const legacyId = `previous-mdot-${Date.now()}`;
      old.id = legacyId; old.name = 'Previous MDOT planning presets (saved)';
      for (const snapshot of saved.comparisons) if (snapshot.scenario?.libraryId === 'mdot') snapshot.scenario.libraryId = legacyId;
    }
    saved.libraries.unshift(libraries()[0]);
    if (saved.scenario.libraryId === 'mdot') for (const op of saved.scenario.operations) {
      const entry = rates.find(r => r.id === op.rateId);
      if (!entry) continue;
      const previous = old?.rates.find(r => r.id === op.rateId);
      if (op.name === previous?.activity) op.name = entry.activity;
      applyRate(op, entry, saved.scenario.level);
      if (!op.notes || op.notes === previous?.notes) op.notes = entry.notes;
    }
    return saved;
  }
  return { rates, clone, operation, fromRate, lift, template, scenario, libraries, sourceVersion, sourceFile,
    rateSelection, applyRate, migrateSavedState, basisLabels,
    curePresets: { Normal: 3, 'Weather allowance': 5, Conservative: 7 } };
});
