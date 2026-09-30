(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TTC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FILTERS = Object.freeze({ projectType: 'Typical category', mdotCode: 'MDOT code',
    roadwayType: 'Roadway type', workTask: 'Work activity' });
  const MDOT_CODE_LABELS = Object.freeze({
    AFAD: 'Automated flagger assistance device', CLT: 'Center left-turn lane',
    'CLT(7)': 'Center left-turn lane, seven total lanes', FW: 'Freeway', GEN: 'General information',
    INT: 'Intersection', M: 'Maintenance', NFW: 'Non-freeway', PULLOFF: 'Emergency pull-off signing',
    S: 'Survey', SP: 'Special applications', TR: 'Traffic regulator', TS: 'Temporary signal',
  });
  const CATEGORY_LABELS = Object.freeze({ 'Construction Projects': 'Construction', 'Maintenance Work': 'Highway Maintenance', 'Survey Work': 'Survey' });
  const WORK_TASKS = Object.freeze(['Close the right lane', 'Close the left lane', 'Close the center turn lane',
    'Close multiple lanes', 'Work on the shoulder', 'Close a ramp', 'Other work']);
  const ROADWAY_TYPES = ['Undivided', 'Divided', 'Freeway'];
  const CLASSIFIED = ['roadwayType', 'trafficArrangement', 'controlMethod', 'workArea', 'existingLanes', 'lanesClosed', 'lanePosition'];
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const sort = records => [...records].sort((a, b) => collator.compare(a.id, b.id));
  const initialFilters = () => ({ projectType: ['Construction'] });
  const REQUIRED_NUMBERS = Object.freeze(['100', '101', '102', '103', '104']);
  function validateCatalog(catalog) {
    if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.records) || !catalog.records.length) throw new Error('The typicals catalog is missing or unsupported.');
    const ids = new Set();
    for (const r of catalog.records) {
      if (!r.id || !r.title || ids.has(r.id) || !/^pdfs\/[a-f0-9]{64}\.pdf$/.test(r.pdf?.path) ||
        !/^[a-f0-9]{64}$/.test(r.pdf?.sha256) || !Number.isInteger(r.pdf.pages) || r.pdf.pages < 1 ||
        !['projectType', 'roadwayType', 'lanes', 'workArea', 'controlType', 'paint', 'rcoc'].every(key => typeof r.filters?.[key] === 'string') ||
        !CLASSIFIED.every(key => Array.isArray(r.classifications?.[key]) && r.classifications[key].length &&
          r.classifications[key].every(value => typeof value === 'string' && value.trim()))) throw new Error('The typicals catalog contains an invalid record.');
      if (!Array.isArray(r.conditions) || r.conditions.some(value => typeof value !== 'string' || !value.trim())) throw new Error('The typicals catalog contains invalid applicability conditions.');
      ids.add(r.id);
    }
    for (const r of catalog.records) if (!Array.isArray(r.relatedIds) || r.relatedIds.some(id => !ids.has(id))) throw new Error('A related typical is missing from the catalog.');
    if (REQUIRED_NUMBERS.some(number => !catalog.records.some(record => record.id.split('-')[0] === number))) throw new Error('Required general sheets 100–104 are missing from the catalog.');
    return catalog;
  }
  function workSituations(record) {
    const labels = new Set();
    for (const value of values(record, 'trafficArrangement')) {
      if (value === 'Unspecified') continue;
      labels.add(({ 'Shoulder closure': 'Shoulder work', 'Ramp treatment': 'Ramp work' })[value] || value);
    }
    const areas = values(record, 'workArea');
    for (const area of areas) {
      if (/outside shoulder/i.test(area)) labels.add('Work outside shoulder');
      else if (/shoulder/i.test(area)) labels.add('Shoulder work');
      if (/intersection/i.test(area)) labels.add('Intersection work');
    }
    // A workbook lane location alone does not establish a closure or its lane count.
    if (!labels.size && areas.some(area => /\blanes?\b|\bCLTL\b/i.test(area))) labels.add('Lane work (closure unspecified)');
    return labels.size ? [...labels].sort(collator.compare) : ['Unspecified'];
  }
  function values(record, key) {
    if (key === 'mdotCode') return [String(record.id || '').split('-')[1] || 'Unspecified'];
    if (key === 'workTask') return workTaskInfo(record).tasks;
    if (key === 'workSituation') return workSituations(record);
    const labels = record.classifications?.[key] || [record.filters?.[key] || 'Unspecified'];
    return key === 'projectType' ? labels.map(value => CATEGORY_LABELS[value] || value) : labels;
  }
  function workTaskInfo(record) {
    const arrangements = values(record, 'trafficArrangement'), positions = values(record, 'lanePosition');
    const closed = values(record, 'lanesClosed'), areas = values(record, 'workArea');
    const tasks = new Set(), possible = new Set();
    const closure = arrangements.includes('Lane closure') || closed.some(value => /^\d+ lanes?$/.test(value));
    const centerTurn = /\bCLTL\b|center(?: left)? turn(?:ing)? lane/i.test([record.sourceTitle, record.title, ...areas].join(' '));
    if (closure) {
      if (positions.includes('Right / outside')) tasks.add(WORK_TASKS[0]);
      if (positions.includes('Left / inside')) tasks.add(WORK_TASKS[1]);
      if (positions.includes('Center lane') && centerTurn) tasks.add(WORK_TASKS[2]);
      if (closed.some(value => /^\d+ lanes?$/.test(value) && parseInt(value, 10) > 1) ||
          positions.filter(value => ['Right / outside', 'Left / inside', 'Center lane'].includes(value)).length > 1) tasks.add(WORK_TASKS[3]);
      // An unspecified side must remain reviewable without claiming a verified right/left closure.
      if (positions.every(value => value === 'Unspecified')) WORK_TASKS.slice(0, 3).forEach(task => possible.add(task));
      if (positions.includes('Center lane') && !centerTurn) possible.add(WORK_TASKS[2]);
      if (closed.every(value => value === 'Unspecified') && !tasks.has(WORK_TASKS[3])) possible.add(WORK_TASKS[3]);
    }
    if (arrangements.includes('Shoulder closure') || areas.some(area => /shoulder/i.test(area) && !/outside shoulder/i.test(area))) tasks.add(WORK_TASKS[4]);
    if (arrangements.includes('Ramp closure') || closed.includes('Ramp only')) tasks.add(WORK_TASKS[5]);
    if ([...arrangements, ...positions, ...closed, ...areas].every(value => value === 'Unspecified')) {
      WORK_TASKS.slice(0, 6).forEach(task => possible.add(task));
    }
    return { tasks: tasks.size ? WORK_TASKS.filter(task => tasks.has(task)) : ['Other work'], possible: [...possible] };
  }
  function filterValues(record, key) {
    const labels = values(record, key);
    // All-roadway sheets match every defined road type, but are not unclassified.
    return key === 'roadwayType' && labels.includes('All roadway types') ? ROADWAY_TYPES : labels;
  }
  function matchesSearch(record, query) {
    const haystack = normalize([record.id, record.title, record.notes, ...Object.values(record.filters),
      ...Object.values(record.classifications || {}).flat(), ...(record.conditions || []), ...values(record, 'workSituation'),
      ...values(record, 'workTask'), ...values(record, 'projectType')].join(' '));
    const words = normalize(query).split(' ').filter(Boolean);
    return words.every(word => haystack.includes(word));
  }
  function matches(record, query = '', filters = {}) {
    return matchesSearch(record, query) && Object.keys(FILTERS).every(key =>
      !filters[key]?.length || filters[key].some(choice => filterValues(record, key).some(value => normalize(choice) === normalize(value))));
  }
  function possibleMatches(records, query = '', filters = {}) {
    const possible = [];
    for (const record of sort(records)) {
      if (!matchesSearch(record, query)) continue;
      const missingFields = [];
      let conflict = false;
      for (const key of Object.keys(FILTERS)) {
        if (!filters[key]?.length) continue;
        const labels = filterValues(record, key).map(normalize);
        if (filters[key].some(choice => labels.includes(normalize(choice)))) continue;
        if (key === 'workTask' && filters[key].some(choice => workTaskInfo(record).possible.map(normalize).includes(normalize(choice)))) missingFields.push(key);
        else if (!['projectType', 'mdotCode'].includes(key) && labels.every(value => value === 'unspecified') &&
            filters[key].some(choice => normalize(choice) !== 'unspecified')) missingFields.push(key);
        else { conflict = true; break; }
      }
      if (!conflict && missingFields.length) possible.push({ record, missingFields });
    }
    return possible;
  }
  function paintStatus(record) {
    const value = normalize(record.filters.paint);
    return value === 'yes' ? 'required' : value === 'maybe' ? 'possible' : '';
  }
  function filter(records, query = '', filters = {}) { return sort(records.filter(r => matches(r, query, filters))); }
  function options(records, key) {
    const choices = [...new Set(records.flatMap(r => filterValues(r, key)))].sort(collator.compare);
    if (key === 'workTask') return WORK_TASKS.filter(value => choices.includes(value));
    return key === 'roadwayType' ? [...ROADWAY_TYPES.filter(value => choices.includes(value)), ...choices.filter(value => !ROADWAY_TYPES.includes(value))] : choices;
  }
  function facetCounts(records, query = '', filters = {}) {
    return Object.fromEntries(Object.keys(FILTERS).map(key => {
      // Ignore this group's choices so users can still compare its alternatives.
      const otherFilters = { ...filters, [key]: [] }, totals = new Map();
      for (const record of records) {
        if (!matches(record, query, otherFilters)) continue;
        for (const value of new Set(filterValues(record, key).map(normalize))) totals.set(value, (totals.get(value) || 0) + 1);
      }
      return [key, Object.fromEntries(options(records, key).map(value => [value, totals.get(normalize(value)) || 0]))];
    }));
  }
  function defaults() { return []; }
  function selected(records, ids) { const wanted = new Set(ids); return sort(records.filter(r => wanted.has(r.id))); }
  function isAlways(record) { return REQUIRED_NUMBERS.includes(String(record.id || '').split('-')[0]); }
  function selectable(records) { return records.filter(record => !isAlways(record)); }
  function report(records, ids) {
    const wanted = new Set(ids);
    return sort(records.filter(record => wanted.has(record.id) || isAlways(record)));
  }
  function restore(records, serialized) {
    if (serialized === null) return { ids: defaults(records), projectName: '', message: '' };
    try {
      const value = JSON.parse(serialized);
      if (value.version !== 1 || !Array.isArray(value.ids) || value.ids.some(id => typeof id !== 'string')) throw new Error();
      const saved = selected(records, value.ids);
      const ids = selectable(saved).map(r => r.id);
      const known = new Set(saved.map(r => r.id));
      const missing = [...new Set(value.ids)].filter(id => !known.has(id));
      return { ids, projectName: typeof value.projectName === 'string' ? value.projectName.slice(0, 160) : '',
        message: missing.length ? `Previously selected details are no longer available: ${missing.join(', ')}. Review your selection.` : '' };
    } catch (_) { return { ids: defaults(records), projectName: '', message: 'The saved selection could not be read. A new project has been started.' }; }
  }
  function snapshot(records) {
    if (!records.length) throw new Error('Select at least one typical first.');
    return Object.freeze(sort(records).map(r => Object.freeze({ id: r.id, title: r.title, pdf: Object.freeze({ ...r.pdf }) })));
  }
  const escape = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function tableHTML(records) {
    const cell = 'border:1px solid #b8c4ce;padding:8px;text-align:left;vertical-align:middle;overflow-wrap:anywhere;';
    return `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:11pt;table-layout:fixed;"><colgroup><col style="width:34%"><col style="width:66%"></colgroup><thead><tr><th style="${cell}background:#eaf0f4;">Typical Number</th><th style="${cell}background:#eaf0f4;">Title</th></tr></thead><tbody>${sort(records).map(r => `<tr><td style="${cell}">${escape(r.id)}</td><td style="${cell}">${escape(r.title)}</td></tr>`).join('')}</tbody></table>`;
  }
  function tableText(records) { return ['Typical Number\tTitle', ...sort(records).map(r => `${r.id}\t${r.title}`)].join('\r\n'); }
  return { FILTERS, MDOT_CODE_LABELS, initialFilters, validateCatalog, normalize, sort, matches, filter, possibleMatches, options, facetCounts, values, defaults, selected, selectable, report, isAlways, restore, snapshot, tableHTML, tableText, paintStatus };
});
