(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TTC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FILTERS = Object.freeze({ projectType: 'Typical category', typicalSeries: 'Typical series', mdotCode: 'MDOT code',
    workTask: 'Work activity' });
  const TYPICAL_SERIES_LABELS = Object.freeze({
    100: 'General notes', 110: 'Traffic regulators', 120: 'Non-freeway',
    130: 'Center left-turn (CLT) lanes', 140: 'Parking lanes', 150: 'CLT 7-lane sections',
    160: 'Signal work', 200: 'Freeway closures', 210: 'Freeway lane shifts',
    220: 'Freeway entrance ramps', 230: 'Freeway exit ramps', 300: 'Advance warnings',
    310: 'Crossover closure', 320: 'Crush and shape', 340: 'Merge systems',
    350: 'Gore locations', 360: 'Rolling roadblock', 380: 'Emergency pull-off signing',
    4000: 'Maintenance', 5000: 'Survey',
  });
  const MDOT_CODE_LABELS = Object.freeze({
    '(L)': 'Left (closure or shift)', '(R)': 'Right (closure or shift)', '2MILE': 'Two-mile advance warning',
    AB: 'Arrow board', AFAD: 'Automated flagger assistance device', AW: 'Advance warning', C: 'Closure',
    CHARTS: 'Charts', CLT: 'Center left-turn lane', CROSS: 'Crossover', CruSha: 'Crush and shape',
    DUAL: 'Dual signing', EM: 'Early merge', EnR: 'Entrance ramp', ExR: 'Exit ramp', FREE: 'Free-flow condition',
    FW: 'Freeway', GEN: 'General information', GORE: 'Freeway gore area', HAUL: 'Haul road crossing',
    IN: 'Inside', INT: 'Intersection', KEY: 'Typical numbering key', L: 'Lane count (e.g., 2L)', LANE: 'Lane',
    LC: 'Lane closure notation (including 0LC)', LD: 'Long duration', LO: 'Lane open', M: 'Maintenance',
    MID: 'Middle of intersection or road', MOB: 'Mobile operation', NFW: 'Non-freeway', NOTES: 'Typical notes',
    O: 'Outside lane closure', OUT: 'Outside shoulder', PARK: 'Parking lane', PATCH: 'Concrete patching',
    PCMS: 'Portable changeable message sign', PULLOFF: 'Emergency pull-off signing', ROLL: 'Rolling roadblock',
    RUM: 'Rumble strip', S: 'Survey', SD: 'Short duration', SHIFT: 'Lane shift', SHL: 'Shoulder work / closure',
    SIGN: 'Sign or signing', SINGLE: 'Single signing', SP: 'Special applications', SPACING: 'Spacing',
    SPEED: 'Speed', STA: 'Stopped traffic advisory', TR: 'Traffic regulator', TS: 'Temporary signal', YIELD: 'Yield condition', ZIP: 'Zipper merge',
  });
  const MDOT_CODE_CASE = new Map(Object.keys(MDOT_CODE_LABELS).map(code => [code.toUpperCase(), code]));
  const CATEGORY_LABELS = Object.freeze({ 'Construction Projects': 'Construction', 'Maintenance Work': 'Highway Maintenance', 'Survey Work': 'Survey' });
  const WORK_TASK = Object.freeze({
    right: 'Close the right lane', left: 'Close the left lane', center: 'Close the center turn lane',
    multiple: 'Close multiple lanes', unspecifiedSide: 'Lane closure — side unspecified', shift: 'Shift traffic',
    shoulder: 'Shoulder / roadside work', ramp: 'Ramp work / closures', intersection: 'Intersection work',
    mobile: 'Mobile work / rolling roadblocks', crossing: 'Crossing / crossover work',
    signing: 'Traffic control / signing', other: 'Other work',
  });
  const WORK_TASKS = Object.freeze(Object.values(WORK_TASK));
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
    if (REQUIRED_NUMBERS.some(number => !catalog.records.some(record => record.id.split('-')[0] === number))) throw new Error('Required general typicals 100–104 are missing from the catalog.');
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
    // Notes is a browsing category for GEN typicals; keep MDOT source families intact.
    if (key === 'projectType' && normalize(String(record.id || '').split('-')[1]) === 'gen') return ['Notes'];
    if (key === 'typicalSeries') {
      const match = /^(\d+)[A-Za-z]*$/.exec(String(record.id || '').split('-')[0]);
      if (!match) return ['Unspecified'];
      const number = Number(match[1]);
      // Maintenance/survey use a whole thousand series, including A/B variants.
      // Only known construction decades get a label; new groups stay reviewable.
      const series = String(number >= 4000 && number < 6000 ? Math.floor(number / 1000) * 1000 : Math.floor(number / 10) * 10);
      return [Object.hasOwn(TYPICAL_SERIES_LABELS, series) ? series : 'Unspecified'];
    }
    if (key === 'mdotCode') return mdotCodes(record);
    if (key === 'workTask') return workTaskInfo(record).tasks;
    if (key === 'workSituation') return workSituations(record);
    const labels = record.classifications?.[key] || [record.filters?.[key] || 'Unspecified'];
    return key === 'projectType' ? labels.map(value => CATEGORY_LABELS[value] || value) : labels;
  }
  function mdotCodes(record) {
    const suffix = String(record.id || '').replace(/\.pdf$/i, '').split('-').slice(1).join('-');
    const codes = new Set();
    const add = code => codes.add(MDOT_CODE_CASE.get(code) || code);
    // Keep parenthesized ranges together, e.g. (1-2)LC; inspect every segment after the number.
    for (const segment of suffix.toUpperCase().match(/(?:\([^)]*\)|[^-])+/g) || []) {
      const base = segment.trim().replace(/\(([^)]*)\)/g, (_, modifier) => {
        for (const code of modifier.match(/[A-Z]+/g) || []) add(code === 'L' || code === 'R' ? `(${code})` : code);
        return '';
      });
      // Counts decorate LC, SHIFT and L. Keep distance codes such as 2MILE and unfamiliar codes intact.
      if (/[A-Z]/.test(base)) add(base.replace(/^\d+(LC|SHIFT|L)$/, '$1'));
    }
    // Pure counts, the leading typical number, its A/B variant, and the extension are not code choices.
    return codes.size ? [...codes].sort(collator.compare) : ['Unspecified'];
  }
  function workTaskInfo(record) {
    const arrangements = values(record, 'trafficArrangement'), positions = values(record, 'lanePosition');
    const closed = values(record, 'lanesClosed'), areas = values(record, 'workArea');
    // Prefer the descriptive MDOT title; filename-only listings use the preserved workbook/PDF title.
    const title = normalize(record.sourceTitle && normalize(record.sourceTitle) !== normalize(record.id) ? record.sourceTitle : record.title);
    const tasks = new Set(), possible = new Set();
    const closure = arrangements.includes('Lane closure') || closed.some(value => /^\d+ lanes?$/.test(value));
    const centerTurn = /\bCLTL\b|center(?: left)? turn(?:ing)? lane/i.test([record.sourceTitle, record.title, ...areas].join(' '));
    if (closure) {
      if (positions.includes('Right / outside')) tasks.add(WORK_TASK.right);
      if (positions.includes('Left / inside')) tasks.add(WORK_TASK.left);
      if (positions.includes('Center lane') && centerTurn) tasks.add(WORK_TASK.center);
      if (closed.some(value => /^\d+ lanes?$/.test(value) && parseInt(value, 10) > 1) ||
          positions.filter(value => ['Right / outside', 'Left / inside', 'Center lane'].includes(value)).length > 1) tasks.add(WORK_TASK.multiple);
      // An unspecified side must remain reviewable without claiming a verified right/left closure.
      if (positions.every(value => value === 'Unspecified')) {
        tasks.add(WORK_TASK.unspecifiedSide);
        [WORK_TASK.right, WORK_TASK.left, WORK_TASK.center].forEach(task => possible.add(task));
      }
      if (positions.includes('Center lane') && !centerTurn) possible.add(WORK_TASK.center);
      if (closed.every(value => value === 'Unspecified') && !tasks.has(WORK_TASK.multiple)) possible.add(WORK_TASK.multiple);
    }
    if (arrangements.includes('Lane shift')) tasks.add(WORK_TASK.shift);
    if (arrangements.includes('Shoulder closure') || areas.some(area => /shoulder/i.test(area))) tasks.add(WORK_TASK.shoulder);
    if (arrangements.some(value => ['Ramp closure', 'Ramp treatment', 'Ramp work'].includes(value)) ||
        closed.includes('Ramp only') || /\bramps?\b/.test(title)) tasks.add(WORK_TASK.ramp);
    if (areas.some(area => /intersection/i.test(area))) tasks.add(WORK_TASK.intersection);
    if (arrangements.some(value => ['Mobile operation', 'Rolling roadblock'].includes(value))) tasks.add(WORK_TASK.mobile);
    if (arrangements.some(value => ['Crossover', 'Haul road crossing'].includes(value))) tasks.add(WORK_TASK.crossing);
    // Classify the purpose of standalone typicals, not incidental speed/signing language in closure titles.
    if (values(record, 'projectType').includes('Notes') || values(record, 'controlMethod').includes('Temporary signal') ||
        /^(?:(?:maintenance|survey)\s*-\s*)?(?:freeway extended lead[ -]in sequence|stopped traffic advisory|emergency pull[ -]?off signing)\b/.test(title)) tasks.add(WORK_TASK.signing);
    // Only genuinely unclassified work retains the broad review fallback. Known signing is not a possible closure.
    if (!tasks.size && [...arrangements, ...positions, ...closed, ...areas].every(value => value === 'Unspecified')) {
      [WORK_TASK.right, WORK_TASK.left, WORK_TASK.center, WORK_TASK.multiple, WORK_TASK.shoulder, WORK_TASK.ramp].forEach(task => possible.add(task));
    }
    return { tasks: tasks.size ? WORK_TASKS.filter(task => tasks.has(task)) : [WORK_TASK.other], possible: [...possible] };
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
      !filters[key]?.length || filters[key].some(choice => values(record, key).some(value => normalize(choice) === normalize(value))));
  }
  function possibleMatches(records, query = '', filters = {}) {
    const possible = [];
    for (const record of sort(records)) {
      if (!matchesSearch(record, query)) continue;
      const missingFields = [];
      let conflict = false;
      for (const key of Object.keys(FILTERS)) {
        if (!filters[key]?.length) continue;
        const labels = values(record, key).map(normalize);
        if (filters[key].some(choice => labels.includes(normalize(choice)))) continue;
        if (key === 'workTask' && filters[key].some(choice => workTaskInfo(record).possible.map(normalize).includes(normalize(choice)))) missingFields.push(key);
        else if (!['projectType', 'typicalSeries', 'mdotCode'].includes(key) && labels.every(value => value === 'unspecified') &&
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
    const choices = [...new Set(records.flatMap(r => values(r, key)))].sort(collator.compare);
    if (key === 'workTask') return WORK_TASKS.filter(value => choices.includes(value));
    return choices;
  }
  function facetCounts(records, query = '', filters = {}) {
    return Object.fromEntries(Object.keys(FILTERS).map(key => {
      // Ignore this group's choices so users can still compare its alternatives.
      const otherFilters = { ...filters, [key]: [] }, totals = new Map();
      for (const record of records) {
        if (!matches(record, query, otherFilters)) continue;
        for (const value of new Set(values(record, key).map(normalize))) totals.set(value, (totals.get(value) || 0) + 1);
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
  return { FILTERS, TYPICAL_SERIES_LABELS, MDOT_CODE_LABELS, initialFilters, validateCatalog, normalize, sort, matches, filter, possibleMatches, options, facetCounts, values, defaults, selected, selectable, report, isAlways, restore, snapshot, tableHTML, tableText, paintStatus };
});
