document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const U = CPUnits, Q = CPQuantity, P = CPProduction, C = CPCalendar, E = CPEngine, D = CPData;
  const storageKey = 'construction-production-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (value, digits = 2) => Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
  const options = (values, selected) => values.map(v => { const [value, label] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`; }).join('');
  const days = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']];
  const periods = ['Hours', 'Workdays', 'Calendar days'];
  let state = { scenario: D.scenario(), libraries: D.libraries(), comparisons: [] }, result = null;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && saved.scenario && Array.isArray(saved.libraries) && saved.libraries.length && Array.isArray(saved.comparisons) && Array.isArray(saved.scenario.operations) && saved.scenario.calendar && saved.scenario.closure) state = D.migrateSavedState(saved);
  } catch (_) { $('storage-status').textContent = 'Browser storage unavailable or unreadable. You can still calculate and print.'; }
  const s = () => state.scenario;
  const library = () => state.libraries.find(l => l.id === s().libraryId) || state.libraries[0];
  function workItemOptions(selected, additions = [['', 'Custom operation / rate']]) {
    const groups = new Map();
    for (const rate of library().rates) {
      const category = rate.category || 'Custom';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push([rate.id, rate.activity]);
    }
    return options(additions, selected) + [...groups].map(([category, entries]) => `<optgroup label="${esc(category)}">${options(entries, selected)}</optgroup>`).join('');
  }
  function sourceNote(op) {
    if (!op.rateSource) return '';
    const link = op.sourceFile === D.sourceFile ? ` <a href="${encodeURI(D.sourceFile)}#page=${Number(op.sourcePage) || 1}" target="_blank" rel="noopener">Source PDF</a>` : '';
    return `<p class="help">${esc(op.rateSource)}${link}<br>Applied assumption: ${esc(op.sourceRate)}. ${esc(op.rateBasisNote)}</p>`;
  }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { $('storage-status').textContent = 'Could not save in this browser. Keep this page open or print your results.'; } }
  function dirty() { result = null; $('calculation-status').textContent = 'Inputs changed — calculate to update'; $('results').innerHTML = '<h2>Results</h2><p class="help">Select Calculate to update the complete sequence and schedule.</p>'; save(); }
  function field(label, key, value, type = 'number', attrs = '') {
    return `<label>${label}<input data-field="${key}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'min="0" step="any"' : ''} ${attrs}></label>`;
  }
  function select(label, key, value, values) { return `<label>${label}<select data-field="${key}">${options(values, value)}</select></label>`; }
  function renderCalendar() {
    $('weekdays').innerHTML = days.map(([d, name]) => `<label><input type="checkbox" data-weekday="${d}" ${s().calendar.weekdays.includes(d) ? 'checked' : ''}>${name.slice(0, 3)}</label>`).join('');
    $('daily-hours').innerHTML = days.map(([d, name]) => `<label>${name}<input type="number" min="0" max="24" step="any" data-daily="${d}" value="${esc(s().calendar.dailyHours[d] ?? '')}" placeholder="${esc(s().calendar.hoursPerDay)}"></label>`).join('');
    $('week-summary').textContent = `${s().calendar.weekdays.length} days/week`;
    $('days-per-week').value = s().calendar.weekdays.length;
  }
  function renderMode() {
    const maximum = s().mode === 'maximum', dated = s().closure.type === 'dates';
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === s().mode)));
    $('closure-inputs').hidden = !maximum;
    $('quantity-label').textContent = maximum ? 'Requested quantity (optional)' : 'Project quantity';
    $('closure-days-field').hidden = dated;
    document.querySelectorAll('.closure-date').forEach(el => el.hidden = !dated);
    $('start-date-field').hidden = maximum && dated;
  }
  function preview(op) {
    if (!op.enabled) return 'Excluded from this sequence.';
    if (op.kind === 'calendar') return `${fmt(op.calendarDays)} calendar days • ${op.calendarRule === 'full-days' ? 'starts at next midnight' : 'starts immediately'} • no productive crew time`;
    const q = Q.derive(s().quantity || 0, s().unit, op, s().density);
    const p = P.duration(q.quantity, op.unit, op.rate, op.rateUnit, op.ratePeriod, s().calendar.hoursPerDay);
    return `${fmt(q.quantity)} ${op.unit} • ${fmt(p.days, 3)} crew days / ${fmt(p.hours, 3)} hours${q.volumeCF !== undefined ? ` • ${fmt(q.areaSF)} SF × ${fmt(q.thickness)} in • ${fmt(q.volumeCF)} CF / ${fmt(q.volumeCY)} CY` : ''}${q.tons !== undefined ? ` • ${fmt(q.tons)} Tons` : ''}`;
  }
  function updatePreviews() {
    s().operations.forEach(op => {
      const host = document.querySelector(`[data-operation="${op.id}"] .operation-preview`);
      if (!host) return;
      try { host.textContent = preview(op); host.classList.remove('invalid'); }
      catch (error) { host.textContent = error.message; host.classList.add('invalid'); }
      const source = document.querySelector(`[data-operation="${op.id}"] .operation-source`);
      if (source) source.innerHTML = sourceNote(op);
    });
    const lifts = s().operations.filter(o => o.transform === 'hma');
    $('separate-lifts').checked = lifts.length > 1 && lifts.slice(1).every(o => o.relation === 'separate-day');
  }
  function renderOperations() {
    $('operation-count').textContent = `${s().operations.filter(o => o.enabled).length} enabled`;
    $('operations').innerHTML = s().operations.length ? s().operations.map((op, i) => `<article class="operation ${op.enabled ? '' : 'disabled'}" data-operation="${esc(op.id)}">
      <div class="operation-top"><label class="check"><input type="checkbox" data-field="enabled" ${op.enabled ? 'checked' : ''}>Operation ${i + 1}</label><label class="check"><input type="checkbox" data-field="required" ${op.required ? 'checked' : ''}>Required</label><button type="button" data-action="up" aria-label="Move ${esc(op.name)} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="down" aria-label="Move ${esc(op.name)} down" ${i === s().operations.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-action="remove" aria-label="Remove ${esc(op.name)}">Remove</button></div>
      <div class="field-grid"><label>Work item<select data-field="rateId">${workItemOptions(op.rateId || '')}</select></label>${op.kind === 'calendar' ? field('Duration (calendar days)', 'calendarDays', op.calendarDays) + select('Start rule', 'calendarRule', op.calendarRule, [['full-days', 'Next midnight / full days'], ['rolling', 'Immediately / continuous']]) : select('Quantity comes from', 'transform', op.transform, [['direct', 'Project quantity / unit conversion'], ['volume', 'Area × thickness → volume'], ['hma', 'Area × thickness × density → weight'], ['factor', 'Quantity per project unit'], ['fixed', 'Fixed operation quantity']]) + field('Production rate', 'rate', op.rate)}${select('Relationship to preceding work', 'relation', op.relation, [['sequential', 'Sequential — share remaining shift'], ['same-day', 'Same-day sequential when capacity fits'], ['separate-day', 'Next workday — separate day'], ['concurrent', 'Concurrent with previous operation']])}</div>
      <label>Operation name / lift label<input data-field="name" value="${esc(op.name)}"></label>
      <div class="field-grid">${op.kind !== 'calendar' ? select('Operation quantity unit', 'unit', op.unit, U.quantityUnits) + select('Rate quantity unit', 'rateUnit', op.rateUnit, U.quantityUnits) + select('Rate time unit', 'ratePeriod', op.ratePeriod, periods) + (['hma', 'volume'].includes(op.transform) ? field('Thickness (inches)', 'thickness', op.thickness) : op.transform === 'fixed' ? field('Fixed quantity', 'quantity', op.quantity) : op.transform === 'factor' ? field(`${esc(op.unit)} per ${esc(s().unit)} of project`, 'factor', op.factor) : '') : `<label>Cure preset<select data-field="curePreset"><option value="">Custom / choose preset</option>${options(Object.entries(D.curePresets).map(([name, value]) => [String(value), `${name}: ${value} days`]), '')}</select></label>`}</div>
      <p class="operation-preview"></p>
      <div class="operation-source">${sourceNote(op)}</div>
      <details><summary>Delay, source comments &amp; notes</summary><div class="field-grid">${field('Minimum delay before this operation (clock hours)', 'delayHours', op.delayHours)}<label class="wide">Notes<textarea data-field="notes">${esc(op.notes)}</textarea></label></div><p class="help">A delay runs in calendar time before this operation starts. Add any setup, testing, or additional curing mentioned by the source as explicit operations or delays. A required disabled operation prevents a complete-sequence result. Disabling an operation also clears its required designation.</p></details>
    </article>`).join('') : '<p class="notice">Start with a template or add your first operation. Custom operations can use any supported quantity unit.</p>';
    updatePreviews();
  }
  function renderLibrary() {
    $('library-select').innerHTML = options(state.libraries.map(l => [l.id, `${l.name} · ${l.kind}`]), library().id);
    $('add-operation-type').innerHTML = workItemOptions('custom', [['custom', 'Custom operation'], ['calendar', 'Calendar activity / cure']]);
    $('rate-records').innerHTML = library().rates.map(r => `<details class="rate-record" data-rate="${esc(r.id)}"><summary>${esc(r.activity)} · ${fmt(r[s().level] ?? r.rate)} ${esc((r.basis || 'quantity') === 'quantity' ? `${r.levelUnits?.[s().level] || r.unit}/${r.period}` : D.basisLabels[r.basis])}</summary><div class="field-grid">${field('Activity', 'activity', r.activity, 'text')}${field('Category', 'category', r.category, 'text')}${select('Quantity unit', 'unit', r.unit, U.quantityUnits)}${select('Time unit (quantity rates)', 'period', r.period, periods)}${select('Rate basis / interpretation', 'basis', r.basis || 'quantity', Object.entries(D.basisLabels))}${field('Base rate (source basis)', 'rate', r.rate)}${field('Low', 'low', r.low)}${field('Average', 'average', r.average)}${field('High', 'high', r.high)}<label class="wide">Source<input data-field="source" value="${esc(r.source)}"></label><label class="wide">Notes<textarea data-field="notes">${esc(r.notes)}</textarea></label></div>${r.sourceRates ? `<p class="help">Printed: Low ${esc(r.sourceRates.low)} · Average ${esc(r.sourceRates.average)} · High ${esc(r.sourceRates.high)}.</p>` : ''}${r.levelUnits ? `<div class="field-grid">${select('Low quantity unit', 'lowUnit', r.levelUnits.low, U.quantityUnits)}${select('Average quantity unit', 'averageUnit', r.levelUnits.average, U.quantityUnits)}${select('High quantity unit', 'highUnit', r.levelUnits.high, U.quantityUnits)}</div>` : ''}<p class="help">${esc(r.interpretation)}</p></details>`).join('');
  }
  function render() {
    const a = s();
    const values = { 'project-name': a.name, 'project-quantity': a.quantity, 'start-date': a.calendar.startDate,
      'hours-per-day': a.calendar.hoursPerDay, 'shift-start': a.calendar.shiftStart, holidays: a.calendar.holidays.join(', '),
      'closure-type': a.closure.type, 'closure-days': a.closure.workdays, 'closure-start': a.closure.start, 'closure-end': a.closure.end,
      density: a.density, 'production-level': a.level };
    for (const [id, value] of Object.entries(values)) $(id).value = value;
    $('project-unit').innerHTML = options(U.quantityUnits, a.unit);
    $('allow-same-day').checked = a.allowSameDay; $('allow-concurrent').checked = a.allowConcurrent;
    renderMode(); renderCalendar(); renderLibrary(); renderOperations(); renderComparisons();
  }
  function loadTemplate(name) {
    s().operations = D.template(name, library().rates, s().level);
    if (name !== 'custom') { s().unit = 'SF'; $('project-unit').value = 'SF'; }
    renderOperations(); dirty();
  }
  function calculate(focus = false) {
    try { result = s().mode === 'maximum' ? E.maximum(s()) : E.duration(s()); renderResults(result); $('calculation-status').textContent = 'Calculation up to date'; save(); }
    catch (error) { result = null; $('results').innerHTML = `<h2>Check your inputs</h2><p class="notice error">${esc(error.message)}</p>`; $('calculation-status').textContent = 'Input needs attention'; }
    if (focus) $('results').focus();
    return result;
  }
  function scheduleLabel(row, r) {
    if (row.kind === 'calendar') return `Calendar days ${Math.floor(row.start / 24) - r.calendar.startDay + 1}–${Math.floor((row.end - C.EPS) / 24) - r.calendar.startDay + 1}`;
    const indices = row.segments.map(seg => seg.index);
    if (!indices.length) return 'No crew time';
    return `Workday ${Math.min(...indices)}${Math.max(...indices) !== Math.min(...indices) ? `–${Math.max(...indices)}` : ''}`;
  }
  function renderResults(r) {
    const maximum = r.mode === 'maximum', f = (v, u) => `${fmt(v)} ${esc(u)}`;
    const alternate = U.dimension(r.unit) === 'area' ? `${fmt(U.convert(r.quantity, r.unit, r.unit === 'SY' ? 'SF' : 'SY'))} ${r.unit === 'SY' ? 'SF' : 'SY'}` : '';
    const metrics = [
      ['Productive crew time', `${fmt(r.productiveDays, 3)} days / ${fmt(r.productiveHours, 2)} hours`],
      ['Scheduled workdays', fmt(r.scheduledWorkdays)], ['Elapsed calendar duration', `${r.calendarDays} days (inclusive)`],
      ['Estimated completion', r.completionDate ? `${r.completionDate} · ${C.timeLabel(r.end) === '00:00' ? 'end of day' : C.timeLabel(r.end)}` : 'Set a start date for a date estimate'],
      ['Controlling operation', r.controlling], ['Total HMA', `${fmt(r.totalHmaTons)} Tons`]
    ];
    const validSchedule = !maximum || r.feasible;
    $('results').innerHTML = `<p class="eyebrow">${esc(s().name || 'Untitled scenario')}</p><h2>${maximum ? 'Closure / Production Summary' : 'Project Summary'}</h2>
      ${maximum ? `<p class="help">Available: ${fmt(r.availableHours)} working hours across ${r.availableWorkdays} shifts · deadline ${r.hasDates ? C.dateLabel(r.deadline) : `calendar day ${Math.floor(r.deadline / 24) - r.calendar.startDay + 1}`} at ${C.timeLabel(r.deadline)}</p><p class="help">Maximum complete quantity${r.unit === 'EA' ? ' (whole items)' : ' (approximately)'}</p>` : '<p class="help">Total project quantity</p>'}
      <p class="result-quantity">${f(r.quantity, r.unit)}</p><p class="result-sub">${alternate}</p>
      ${validSchedule ? `<dl class="summary-grid">${metrics.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><p class="help">${esc(r.controllingBasis)}</p>` : '<p class="notice error">No positive quantity can complete the selected sequence in this window.</p>'}
      <p class="help">Rate basis: ${fmt(s().calendar.hoursPerDay)} hours/workday. Working weekdays: ${esc(days.filter(([d]) => s().calendar.weekdays.includes(d)).map(([, name]) => name).join(', '))}. Shift start: ${esc(s().calendar.shiftStart)}. Density: ${fmt(s().density)} LB/CF. Crew days add across crews; scheduled workdays count distinct shifts with productive work. Elapsed days include non-working dates from start through completion.</p>
      ${r.requested ? `<p class="notice${r.requested.fits ? '' : ' error'}">Requested ${f(r.requested.quantity, r.unit)}: <strong>${r.requested.fits ? 'fits' : 'does not fit'}</strong> · ${r.requested.scheduledWorkdays} scheduled workdays / ${r.requested.calendarDays} calendar days.</p>` : ''}
      ${validSchedule ? `<div class="table-wrap"><table><thead><tr><th>Operation</th><th class="numeric">Quantity</th><th>Production rate</th><th class="numeric">Production duration</th><th>Scheduled${maximum ? ' / utilization' : ''}</th></tr></thead><tbody>${r.rows.map(row => {
        const budget = row.segments.reduce((sum, seg) => sum + r.calendar.slots[seg.index - 1].end - r.calendar.slots[seg.index - 1].start, 0);
        return `<tr><td>${esc(row.name)}<small>${row.required ? 'Required' : 'Included optional'} · ${esc(row.relation)}</small>${row.notes ? `<small>${esc(row.notes)}</small>` : ''}</td><td class="numeric">${row.quantity === null ? '—' : f(row.quantity, row.unit)}${row.tons !== undefined ? `<small>${fmt(row.thickness)} in · ${fmt(row.areaSF)} SF<br>${fmt(row.volumeCF)} CF / ${fmt(row.volumeCY)} CY</small>` : ''}</td><td>${row.kind === 'calendar' ? `${fmt(row.calendarDays)} calendar days` : `${f(row.rate, row.rateUnit)}/${esc(row.ratePeriod)}`}</td><td class="numeric">${row.kind === 'calendar' ? '—' : `${fmt(row.days, 3)} days<small>${fmt(row.hours, 3)} hours</small>`}</td><td>${scheduleLabel(row, r)}${maximum && row.kind !== 'calendar' ? `<small>${fmt(budget ? row.hours / budget * 100 : 0, 1)}% of occupied shifts' time</small>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      <details><summary>Show Calculation — quantities, production &amp; maximum solution</summary>${maximum ? `<p class="calculation">For each trial ${esc(r.unit)}, derive every operation quantity, divide by its compatible production rate, then schedule the full sequence. Increase quantity until another increase would cross the ${fmt(r.availableHours)}-hour working window or a required day boundary. The result is limited to work completed through all enabled operations. Utilization is the operation's productive hours divided by the hours in its occupied shifts; sequential lifts share the same day's capacity.</p>` : ''}${r.rows.map(row => `<h3>${esc(row.name)}</h3>${sourceNote(row)}<p class="calculation">${esc(row.formula)}</p>`).join('')}<p class="calculation">Total productive crew days = ${r.rows.filter(o => o.kind !== 'calendar').map(o => fmt(o.days, 6)).join(' + ') || '0'} = ${fmt(r.productiveDays, 6)}. Shift time is allocated before counting scheduled workdays. Calendar duration counts both the start and last occupied calendar date; a midnight finish belongs to the preceding date.</p></details>
      <h3 class="schedule-heading">Operation sequence &amp; schedule</h3><div id="schedule-output"></div>` : ''}
      <div class="notice"><ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`;
    if (validSchedule) renderSchedule(r);
  }
  function renderSchedule(r) {
    const shifts = new Map();
    for (const row of r.rows) for (const seg of row.segments) {
      if (!shifts.has(seg.index)) shifts.set(seg.index, { day: seg.day, entries: [] });
      shifts.get(seg.index).entries.push({ row, seg });
    }
    const entries = [...shifts.entries()].sort((a, b) => a[0] - b[0]);
    const shown = entries.slice(0, 120);
    $('schedule-output').innerHTML = `<ol class="schedule-list">${shown.map(([index, entry]) => `<li class="schedule-day"><strong>Workday ${index} · ${r.hasDates ? C.dateLabel(entry.day * 24) : `calendar day ${entry.day - r.calendar.startDay + 1}`}</strong>${entry.entries.sort((a, b) => a.seg.start - b.seg.start).map(({ row, seg }) => `<p>${C.timeLabel(seg.start)}–${C.timeLabel(seg.end)} ${esc(row.name)}<br><span class="help">${fmt(row.hours ? row.quantity * seg.hours / row.hours : 0)} ${esc(row.unit)} · ${fmt(seg.hours, 3)} hours${Math.floor(seg.end / 24) > entry.day ? ' · ends next calendar date' : ''}</span></p>`).join('')}</li>`).join('')}</ol>${entries.length > 120 ? `<p class="help">Showing the first 120 of ${entries.length} workdays; totals include the full schedule.</p>` : ''}${r.rows.filter(o => o.kind === 'calendar').map(row => `<p class="calculation"><strong>${esc(row.name)}</strong>: ${fmt(row.calendarDays)} calendar days · ${r.hasDates ? C.dateLabel(row.start) : `calendar day ${Math.floor(row.start / 24) - r.calendar.startDay + 1}`} ${C.timeLabel(row.start)} → ${r.hasDates ? C.dateLabel(row.end) : `calendar day ${Math.floor(row.end / 24) - r.calendar.startDay + 1}`} ${C.timeLabel(row.end)} (eligible thereafter; next crew activity uses the working calendar).</p>`).join('')}`;
  }
  function snapshot(r) { return { name: s().name, mode: s().mode, quantity: r.quantity, unit: r.unit, workdays: r.feasible === false ? null : r.scheduledWorkdays, calendarDays: r.feasible === false ? null : r.calendarDays, controlling: r.controlling, feasible: r.feasible, scenario: D.clone(s()) }; }
  function renderComparisons() {
    $('comparison-table').innerHTML = state.comparisons.length ? `<div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Mode</th><th>Quantity / maximum</th><th>Workdays</th><th>Calendar days</th><th>Controlling operation</th><th>Actions</th></tr></thead><tbody>${state.comparisons.map((c, i) => `<tr><td>${esc(c.name)}</td><td>${c.mode === 'maximum' ? 'Time → Quantity' : 'Quantity → Time'}</td><td>${fmt(c.quantity)} ${esc(c.unit)}${c.feasible === false ? ' (does not fit)' : ''}</td><td>${c.workdays ?? '—'}</td><td>${c.calendarDays ?? '—'}</td><td>${esc(c.controlling)}</td><td><button type="button" data-restore="${i}">Open copy</button> <button type="button" data-delete-comparison="${i}" aria-label="Delete ${esc(c.name)} comparison">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="help">No comparison snapshots yet. Calculate, then select Duplicate Scenario.</p>';
  }
  // Native controls keep editing and persistence independent of the calculation modules.
  const bindings = {
    'project-name': ['name'], 'project-quantity': ['quantity'], 'project-unit': ['unit'], density: ['density'], 'production-level': ['level'],
    'start-date': ['calendar', 'startDate'], 'hours-per-day': ['calendar', 'hoursPerDay'], 'shift-start': ['calendar', 'shiftStart'],
    'closure-type': ['closure', 'type'], 'closure-days': ['closure', 'workdays'], 'closure-start': ['closure', 'start'], 'closure-end': ['closure', 'end'],
    'allow-same-day': ['allowSameDay'], 'allow-concurrent': ['allowConcurrent']
  };
  for (const [id, path] of Object.entries(bindings)) $(id).addEventListener('input', event => {
    const target = path.length === 2 ? s()[path[0]] : s(), key = path.at(-1);
    target[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    renderMode(); updatePreviews(); dirty();
  });
  $('holidays').addEventListener('input', event => { s().calendar.holidays = event.target.value.split(/[,\s]+/).filter(Boolean); dirty(); });
  $('days-per-week').addEventListener('change', event => { s().calendar.weekdays = days.slice(0, Number(event.target.value)).map(([d]) => d); renderCalendar(); dirty(); });
  $('weekdays').addEventListener('change', event => { const day = Number(event.target.dataset.weekday); s().calendar.weekdays = event.target.checked ? [...s().calendar.weekdays, day] : s().calendar.weekdays.filter(d => d !== day); renderCalendar(); dirty(); });
  $('daily-hours').addEventListener('input', event => { const day = event.target.dataset.daily; if (day === undefined) return; if (event.target.value === '') delete s().calendar.dailyHours[day]; else s().calendar.dailyHours[day] = event.target.value; dirty(); });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { s().mode = button.dataset.mode; renderMode(); dirty(); }));
  $('load-template').addEventListener('click', () => loadTemplate($('template').value));
  $('operations').addEventListener('input', event => {
    const card = event.target.closest('[data-operation]'), key = event.target.dataset.field;
    if (!card || !key) return;
    const op = s().operations.find(o => o.id === card.dataset.operation);
    if (key === 'curePreset') { if (event.target.value) op.calendarDays = Number(event.target.value); }
    else op[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    if (key === 'enabled' && !op.enabled) op.required = false;
    if (key === 'rateId' && op.rateId) {
      const rate = library().rates.find(r => r.id === op.rateId);
      D.applyRate(op, rate, s().level, true);
      fitQuantityToProject(op);
    } else if (key === 'rateId') {
      op.rateSource = ''; op.sourceRate = ''; op.rateBasisNote = '';
    } else if (['rate', 'rateUnit', 'ratePeriod', 'calendarDays', 'curePreset'].includes(key) && op.rateSource) {
      op.sourceRate = 'Manual operation override; current rate/duration fields govern the calculation';
    }
    if (['transform', 'enabled', 'curePreset', 'rateId'].includes(key)) renderOperations(); else updatePreviews();
    dirty();
  });
  $('operations').addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const index = s().operations.findIndex(o => o.id === button.closest('[data-operation]').dataset.operation);
    const action = button.dataset.action;
    if (action === 'remove') s().operations.splice(index, 1);
    else { const next = index + (action === 'up' ? -1 : 1); if (next < 0 || next >= s().operations.length) return; [s().operations[index], s().operations[next]] = [s().operations[next], s().operations[index]]; }
    renderOperations(); dirty();
  });
  function fitQuantityToProject(op) {
    if (op.kind === 'production' && op.transform === 'direct' && U.dimension(op.unit) !== U.dimension(s().unit)) {
      op.transform = 'fixed'; op.quantity = '';
    }
  }
  $('add-operation').addEventListener('click', () => {
    const key = $('add-operation-type').value;
    const op = key === 'calendar' ? D.operation({ name: 'Calendar activity', kind: 'calendar' }) : key === 'custom' ? D.operation({ unit: s().unit, rateUnit: s().unit }) : D.fromRate(key, library().rates, s().level);
    fitQuantityToProject(op);
    s().operations.push(op); renderOperations(); dirty();
  });
  $('add-lift').addEventListener('click', () => { const op = D.lift(s().operations.filter(o => o.transform === 'hma').length + 1, library().rates, s().level); if ($('separate-lifts').checked) op.relation = 'separate-day'; s().operations.push(op); renderOperations(); dirty(); });
  $('separate-lifts').addEventListener('change', event => { s().operations.filter(o => o.transform === 'hma').slice(1).forEach(o => o.relation = event.target.checked ? 'separate-day' : 'same-day'); renderOperations(); dirty(); });
  $('library-select').addEventListener('change', event => { s().libraryId = event.target.value; renderLibrary(); renderOperations(); dirty(); });
  $('apply-rates').addEventListener('click', () => { s().operations.forEach(op => { const rate = library().rates.find(r => r.id === op.rateId); if (rate) D.applyRate(op, rate, s().level); }); renderLibrary(); renderOperations(); dirty(); });
  $('rate-records').addEventListener('input', event => { const row = event.target.closest('[data-rate]'), key = event.target.dataset.field; if (!row || !key) return; const rate = library().rates.find(r => r.id === row.dataset.rate); if (['lowUnit', 'averageUnit', 'highUnit'].includes(key)) rate.levelUnits[key.replace('Unit', '')] = event.target.value; else rate[key] = event.target.value; save(); $('calculation-status').textContent = 'Library saved — apply rates to update operations'; });
  $('add-rate').addEventListener('click', () => { library().rates.push({ id: D.operation().id, activity: 'Custom production rate', category: 'Custom', unit: 'EA', period: 'Workdays', rate: 25, low: 25, average: 25, high: 25, source: '', notes: '' }); renderLibrary(); save(); $('rate-records').lastElementChild.open = true; });
  $('copy-library').addEventListener('click', () => { const name = $('new-library-name').value.trim(); if (!name) { $('new-library-name').focus(); $('calculation-status').textContent = 'Enter a name for the new library'; return; } const lib = { id: D.operation().id, name, kind: $('new-library-kind').value, rates: D.clone(library().rates) }; state.libraries.push(lib); s().libraryId = lib.id; renderLibrary(); save(); $('new-library-name').value = ''; });
  $('calculator-form').addEventListener('submit', event => { event.preventDefault(); calculate(true); });
  $('reset').addEventListener('click', () => { state.scenario = D.scenario(s().mode); render(); calculate(); });
  $('duplicate').addEventListener('click', () => { const r = calculate(); if (!r) return; state.comparisons.push(snapshot(r)); s().name = `${s().name || 'Scenario'} — copy`; render(); calculate(); });
  $('comparison-table').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.restore !== undefined) { state.scenario = D.clone(state.comparisons[Number(button.dataset.restore)].scenario); s().name += ' — copy'; render(); calculate(); } else if (button.dataset.deleteComparison !== undefined) { state.comparisons.splice(Number(button.dataset.deleteComparison), 1); renderComparisons(); save(); } });
  $('clear-comparisons').addEventListener('click', () => { state.comparisons = []; renderComparisons(); save(); });
  $('print').addEventListener('click', () => { if (!calculate()) return; const details = [...$('results').querySelectorAll('details')], prior = details.map(d => d.open); details.forEach(d => d.open = true); window.print(); details.forEach((d, i) => d.open = prior[i]); });
  document.querySelectorAll('[data-quick-template]').forEach(button => button.addEventListener('click', () => { $('template').value = button.dataset.quickTemplate; loadTemplate(button.dataset.quickTemplate); $('project-name').focus(); }));
  function renderQuick() {
    const type = $('quick-type').value, material = ['hma', 'concrete'].includes(type), prior = $('quick-from').value;
    $('quick-from').innerHTML = options(material ? ['SF', 'SY', 'Acres'] : Object.keys(U.units), prior || 'SF');
    if (!$('quick-from').value) $('quick-from').value = 'SF';
    const compatible = Object.keys(U.units).filter(u => U.dimension(u) === U.dimension($('quick-from').value));
    const to = $('quick-to').value;
    $('quick-to').innerHTML = options(compatible, compatible.includes(to) ? to : compatible.at(-1));
    $('quick-to-field').hidden = material;
    $('quick-thickness-field').hidden = !material; $('quick-density-field').hidden = type !== 'hma';
    document.querySelectorAll('.quick-rate').forEach(el => el.hidden = type !== 'rate');
    $('quick-hours-field').hidden = material;
    $('quick-value-label').textContent = material ? 'Area' : type === 'rate' ? 'Production rate' : 'Quantity';
    $('quick-result').textContent = '';
  }
  $('quick-period-from').innerHTML = options(periods, 'Workdays'); $('quick-period-to').innerHTML = options(periods, 'Hours');
  $('quick-type').addEventListener('change', renderQuick); $('quick-from').addEventListener('change', renderQuick);
  $('quick-form').addEventListener('input', () => { $('quick-result').textContent = ''; });
  $('quick-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const type = $('quick-type').value, n = U.number($('quick-value').value, 'Quantity'), from = $('quick-from').value, to = $('quick-to').value;
      const hours = U.number($('quick-hours').value, 'Hours per workday', true);
      if (hours > 24) throw new Error('Hours per workday cannot exceed 24.');
      let text;
      if (type === 'hma' || type === 'concrete') {
        const op = { name: 'Quick calculation', transform: type === 'hma' ? 'hma' : 'volume', unit: type === 'hma' ? 'Tons' : 'CY', thickness: $('quick-thickness').value };
        text = Q.derive(n, from, op, $('quick-density').value).formula;
      } else if (type === 'rate') text = `${fmt(n, 6)} ${from}/${$('quick-period-from').value} = ${fmt(P.convertRate(n, from, $('quick-period-from').value, to, $('quick-period-to').value, hours), 6)} ${to}/${$('quick-period-to').value}; ${hours} hours/workday; compatible quantity conversion × time-basis ratio.`;
      else text = `${fmt(n, 6)} ${from} × ${fmt(U.convert(1, from, to, hours), 9)} ${to}/${from} = ${fmt(U.convert(n, from, to, hours), 6)} ${to}${U.dimension(from) === 'time' ? ` (${hours} productive hours/workday; this is a time conversion, not elapsed scheduling)` : ''}.`;
      $('quick-result').textContent = text;
    } catch (error) { $('quick-result').textContent = error.message; }
  });
  render(); renderQuick(); calculate();
});
