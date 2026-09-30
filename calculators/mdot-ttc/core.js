(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TTC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FILTERS = Object.freeze({ projectType: 'Project type', roadwayType: 'Roadway type', trafficArrangement: 'Traffic arrangement',
    existingLanes: 'Existing lanes', lanesClosed: 'Lanes closed', workArea: 'Work area', controlMethod: 'Control method' });
  const CLASSIFIED = ['roadwayType', 'trafficArrangement', 'controlMethod', 'workArea', 'existingLanes', 'lanesClosed'];
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const sort = records => [...records].sort((a, b) => collator.compare(a.id, b.id));
  const initialFilters = () => ({});
  function validateCatalog(catalog) {
    if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.records) || !catalog.records.length) throw new Error('The typicals catalog is missing or unsupported.');
    const ids = new Set();
    for (const r of catalog.records) {
      if (!r.id || !r.title || ids.has(r.id) || !/^pdfs\/[a-f0-9]{64}\.pdf$/.test(r.pdf?.path) ||
        !/^[a-f0-9]{64}$/.test(r.pdf?.sha256) || !Number.isInteger(r.pdf.pages) || r.pdf.pages < 1 ||
        !['projectType', 'roadwayType', 'lanes', 'workArea', 'controlType', 'paint', 'rcoc'].every(key => typeof r.filters?.[key] === 'string') ||
        !CLASSIFIED.every(key => Array.isArray(r.classifications?.[key]) && r.classifications[key].length &&
          r.classifications[key].every(value => typeof value === 'string' && value.trim()))) throw new Error('The typicals catalog contains an invalid record.');
      ids.add(r.id);
    }
    for (const r of catalog.records) if (!Array.isArray(r.relatedIds) || r.relatedIds.some(id => !ids.has(id))) throw new Error('A related typical is missing from the catalog.');
    return catalog;
  }
  function values(record, key) { return record.classifications?.[key] || [record.filters?.[key] || 'Unspecified']; }
  function matches(record, query = '', filters = {}) {
    const haystack = normalize([record.id, record.title, record.notes, ...Object.values(record.filters),
      ...Object.values(record.classifications || {}).flat()].join(' '));
    const words = normalize(query).split(' ').filter(Boolean);
    return words.every(word => haystack.includes(word)) && Object.keys(FILTERS).every(key =>
      !filters[key]?.length || filters[key].some(choice => values(record, key).some(value => normalize(choice) === normalize(value))));
  }
  function paintStatus(record) {
    const value = normalize(record.filters.paint);
    return value === 'yes' ? 'required' : value === 'maybe' ? 'possible' : '';
  }
  function filter(records, query = '', filters = {}) { return sort(records.filter(r => matches(r, query, filters))); }
  function options(records, key) { return [...new Set(records.flatMap(r => values(r, key)))].sort(collator.compare); }
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
  function isAlways(record) { return normalize(record.filters.rcoc) === 'always'; }
  function report(records, ids) {
    const selection = selected(records, ids);
    if (!selection.length) return [];
    const wanted = new Set(selection.map(record => record.id));
    return sort(records.filter(record => wanted.has(record.id) || isAlways(record)));
  }
  function restore(records, serialized) {
    if (serialized === null) return { ids: defaults(records), projectName: '', message: '' };
    try {
      const value = JSON.parse(serialized);
      if (value.version !== 1 || !Array.isArray(value.ids) || value.ids.some(id => typeof id !== 'string')) throw new Error();
      const ids = selected(records, value.ids).map(r => r.id);
      const missing = [...new Set(value.ids)].filter(id => !ids.includes(id));
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
  return { FILTERS, initialFilters, validateCatalog, normalize, sort, matches, filter, options, facetCounts, values, defaults, selected, report, isAlways, restore, snapshot, tableHTML, tableText, paintStatus };
});
