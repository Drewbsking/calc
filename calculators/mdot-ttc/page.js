(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const storageKey = 'mdot-ttc-project-v1';
  const filterOptionLabel = (key, value) => key === 'mdotCode' && TTC.MDOT_CODE_LABELS[value]
    ? `${value} — ${TTC.MDOT_CODE_LABELS[value]}` : value;
  const roadwayDescriptions = {
    Undivided: 'Opposing traffic shares a roadway without a median or barrier. A center turn lane is still undivided.',
    Divided: 'Opposing traffic is separated by a median or barrier.',
    Freeway: 'Access is controlled through entrance and exit ramps.',
    Unspecified: 'Review the detail to establish which roadway types it applies to.',
  };
  let catalog, browseRecords = [], selectedIds = new Set(), filters = TTC.initialFilters(), query = '', busy = false, retryKind = 'pdf';
  const availableMarks = new Set(), selectedMarks = new Set();
  const selectAllGroups = [
    ['select-all-matches', 'results', availableMarks],
    ['select-all-selected', 'selected-list', selectedMarks],
  ];
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function button(text, action, className = 'ttc-button secondary') {
    const element = node('button', className, text);
    element.type = 'button'; element.addEventListener('click', action);
    return element;
  }
  function link(text, url) {
    const element = node('a', '', text); element.href = url;
    element.target = '_blank'; element.rel = 'noopener'; return element;
  }
  function note(record) {
    return record.notes ? node('p', /DO NOT USE/i.test(record.notes) ? 'ttc-note warning' : 'ttc-note', 'Workbook note: ' + record.notes) : null;
  }
  function paintFlag(record) {
    const status = TTC.paintStatus(record);
    return status ? node('span', 'ttc-tag ttc-paint-flag ' + status, status === 'required' ? 'Paint required' : 'Paint may be required') : null;
  }
  function conditions(record) {
    if (!record.conditions.length) return null;
    const box = node('div', 'ttc-conditions');
    box.append(node('p', 'ttc-condition-heading', 'Conditions noted by MDOT'));
    const list = node('ul');
    for (const value of record.conditions) list.append(node('li', '', value));
    box.append(list);
    return box;
  }
  function renderPaintWarning(selection) {
    const required = selection.filter(record => TTC.paintStatus(record) === 'required').length;
    const possible = selection.filter(record => TTC.paintStatus(record) === 'possible').length;
    const messages = [];
    if (required) messages.push(`Paint required: include paint quantities for ${required} selected ${required === 1 ? 'typical' : 'typicals'}.`);
    if (possible) messages.push(`Paint may be required for ${possible} selected ${possible === 1 ? 'typical' : 'typicals'}. Review the flagged details.`);
    const warning = $('paint-warning');
    warning.hidden = !messages.length;
    const text = messages.join(' ');
    if (warning.textContent !== text) warning.textContent = text;
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, ids: [...selectedIds], projectName: $('project-name').value })); }
    catch (_) { $('storage-status').textContent = 'Your browser could not save this selection. Keep this page open until you download your files.'; }
  }
  function moveDetails(ids, toProject) {
    const source = toProject ? 'available-pane' : 'selected-pane';
    const before = [...$(source).querySelectorAll('input[data-mark]')].map(input => input.value);
    const moving = new Set(ids);
    const next = before.find(id => !moving.has(id));
    const valid = new Set(browseRecords.map(record => record.id));
    let moved = 0;
    for (const id of moving) {
      if (!valid.has(id) || selectedIds.has(id) === toProject) continue;
      if (toProject) selectedIds.add(id); else selectedIds.delete(id);
      availableMarks.delete(id); selectedMarks.delete(id); moved++;
    }
    persist(); render();
    $('transfer-status').textContent = `${moved} ${moved === 1 ? 'detail' : 'details'} ${toProject ? 'added to' : 'removed from'} your selection.`;
    const remaining = [...$(source).querySelectorAll('input[data-mark]')];
    const target = remaining.find(input => input.value === next) || remaining[0];
    (target || $(source)).focus({ preventScroll: true });
  }
  function selectButton(record, pane = 'available') {
    const removing = pane === 'selected';
    const inReport = !removing && TTC.report(catalog.records, selectedIds).some(item => item.id === record.id);
    const element = button('', () => moveDetails([record.id], !removing), 'ttc-button secondary ttc-card-move');
    element.append(node('span', 'ttc-arrow', removing ? '←' : '→'));
    element.firstChild.setAttribute('aria-hidden', 'true');
    element.dataset.toggle = record.id;
    element.disabled = inReport;
    const label = inReport ? 'Already included ' + record.id : `${removing ? 'Remove selected' : 'Add'} ${record.id}`;
    element.setAttribute('aria-label', label); element.title = label;
    return element;
  }
  function markControl(record, pane) {
    const marks = pane === 'selected' ? selectedMarks : availableMarks;
    const label = node('label', 'ttc-card-mark');
    const input = node('input'); input.type = 'checkbox'; input.value = record.id; input.dataset.mark = pane;
    input.checked = marks.has(record.id);
    input.setAttribute('aria-label', `Mark ${pane} ${record.id}`);
    input.addEventListener('change', () => {
      if (input.checked) marks.add(record.id); else marks.delete(record.id);
      input.closest('article').classList.toggle('is-marked', input.checked);
      updateTransferButtons();
    });
    label.append(input, node('span', 'ttc-code', record.id));
    return label;
  }
  function updateTransferButtons() {
    for (const [id, listId] of selectAllGroups) {
      const cards = [...$(listId).querySelectorAll('input[data-mark]')];
      const marked = cards.filter(input => input.checked).length;
      $(id).disabled = !cards.length;
      $(id).checked = cards.length > 0 && marked === cards.length;
      $(id).indeterminate = marked > 0 && marked < cards.length;
    }
    for (const [id, countId, marks, verb] of [
      ['move-right', 'available-mark-count', availableMarks, 'Add'],
      ['move-left', 'selected-mark-count', selectedMarks, 'Remove'],
    ]) {
      $(id).disabled = !marks.size; $(countId).textContent = marks.size;
      $(id).setAttribute('aria-label', `${verb} ${marks.size} marked ${marks.size === 1 ? 'detail' : 'details'}`);
    }
  }
  function renderFilters() {
    $('primary-filters').replaceChildren();
    for (const [key, label] of Object.entries(TTC.FILTERS)) {
      const details = node('details', 'ttc-filter');
      details.open = key === 'projectType' && !!filters[key]?.length;
      const summary = node('summary', '', label + ' ');
      const count = node('span');
      const updateCount = () => { count.textContent = filters[key]?.length ? `· ${filters[key].length} selected` : '· All'; };
      updateCount(); summary.append(count); details.append(summary);
      const options = node('div', 'ttc-filter-options');
      options.setAttribute('role', 'group'); options.setAttribute('aria-label', label);
      if (key === 'roadwayType') {
        options.classList.add('ttc-roadway-options');
        options.append(node('p', 'ttc-help', 'Some sheets apply to both Divided and Freeway. General sheets 100–104 are always included separately.'));
      }
      if (key === 'workTask') {
        options.classList.add('ttc-task-options');
        options.append(node('p', 'ttc-help', 'Choose the closest task, then review the details. Right/left follows traffic direction. Other work includes shifts, intersections, moving work, and general sheets.'));
      }
      if (key === 'mdotCode') {
        options.append(node('p', 'ttc-help', 'Use the code immediately after the typical number, such as INT in 160-INT-LD-CLT-MID.'));
      }
      const choices = TTC.options(browseRecords, key);
      for (const value of choices) {
        const option = node('label'); const input = node('input'); input.type = 'checkbox'; input.value = value;
        input.checked = (filters[key] || []).includes(value); input.dataset.filter = key;
        input.addEventListener('change', () => {
          const choices = new Set(filters[key] || []);
          if (input.checked) choices.add(value); else choices.delete(value);
          filters[key] = [...choices]; updateCount(); render();
        });
        const resultCount = node('span', 'ttc-filter-count');
        resultCount.setAttribute('aria-hidden', 'true');
        const valueLabel = node('span', 'ttc-filter-value', filterOptionLabel(key, value));
        if (key === 'roadwayType' && roadwayDescriptions[value]) {
          const description = node('span', 'ttc-filter-description', roadwayDescriptions[value]);
          description.id = 'roadway-help-' + value.toLowerCase();
          input.setAttribute('aria-describedby', description.id);
          valueLabel.append(description);
        }
        option.append(input, valueLabel, resultCount);
        options.append(option);
      }
      details.append(options);
      $('primary-filters').append(details);
    }
  }
  function updateFilterCounts() {
    const counts = TTC.facetCounts(browseRecords, query, filters);
    for (const input of $('filters').querySelectorAll('input[data-filter]')) {
      const total = counts[input.dataset.filter][input.value];
      const option = input.closest('label');
      option.querySelector('.ttc-filter-count').textContent = `(${total})`;
      option.dataset.empty = String(total === 0);
      input.setAttribute('aria-label', `${filterOptionLabel(input.dataset.filter, input.value)}, ${total} matching ${total === 1 ? 'typical' : 'typicals'}`);
    }
  }
  function resultCard(record, missingFields = [], pane = 'available') {
    const marks = pane === 'selected' ? selectedMarks : availableMarks;
    const article = node('article', 'ttc-result' + (marks.has(record.id) ? ' is-marked' : ''));
    article.dataset.record = record.id;
    if (pane === 'available') article.dataset.typical = record.id;
    const top = node('div', 'ttc-result-top');
    if (pane === 'automatic') top.append(node('span', 'ttc-code', record.id), node('span', 'ttc-tag', 'Always included'));
    else top.append(markControl(record, pane), selectButton(record, pane));
    article.append(top, node('h3', '', record.title), TTCPreview.createButton(record));
    if (missingFields.length) article.append(node('p', 'ttc-possible-reason', 'Review detail — not classified for: ' + missingFields.map(key => TTC.FILTERS[key]).join(', ') + '.'));
    const tags = node('div', 'ttc-tags');
    for (const key of ['projectType', 'roadwayType', 'trafficArrangement', 'controlMethod', 'existingLanes', 'lanesClosed', 'lanePosition', 'rcoc']) {
      for (const value of TTC.values(record, key)) {
        const prefix = { trafficArrangement: 'Arrangement: ', controlMethod: 'Control: ', existingLanes: 'Existing: ', lanesClosed: 'Closed: ', lanePosition: 'Lane: ', rcoc: 'RCOC: ' }[key] || '';
        if (value !== 'Unspecified') tags.append(node('span', 'ttc-tag', prefix + value));
      }
    }
    const paint = paintFlag(record); if (paint) tags.append(paint);
    article.append(tags);
    const applicability = conditions(record); if (applicability) article.append(applicability);
    if (!record.workbookRows.length) article.append(node('p', 'ttc-help', 'Workbook classifications: Unspecified.'));
    const originals = ['roadwayType', 'workArea', 'controlType', 'lanes'].filter(key => record.filters[key] !== 'Unspecified');
    if (originals.length) {
      const source = node('details', 'ttc-workbook-source'); source.append(node('summary', '', 'Original workbook classifications'));
      const labels = { roadwayType: 'Roadway type', workArea: 'Work area', controlType: 'Control type', lanes: 'Number of lanes' };
      for (const key of originals) source.append(node('p', 'ttc-help', `${labels[key]}: ${record.filters[key]}`));
      article.append(source);
    }
    const workbookNote = note(record); if (workbookNote) article.append(workbookNote);
    const links = node('div', 'ttc-result-links');
    links.append(link(`View PDF · ${record.pdf.pages} ${record.pdf.pages === 1 ? 'page' : 'pages'}`, record.pdf.path), link('MDOT original ↗', record.sourceUrl), node('span', '', 'MDOT updated ' + record.mdotUpdatedAt));
    article.append(links);
    if (record.relatedIds.length && pane !== 'automatic') {
      const related = node('details', 'ttc-related'); related.append(node('summary', '', 'Related maintenance alternative'));
      for (const id of record.relatedIds) {
        const alternative = catalog.records.find(r => r.id === id);
        related.append(node('p', '', alternative.id + ' — ' + alternative.title));
        related.append(node('p', 'ttc-help', 'RCOC usage: ' + alternative.filters.rcoc));
        const alternativePaint = paintFlag(alternative); if (alternativePaint) related.append(alternativePaint);
        const alternativeNote = note(alternative); if (alternativeNote) related.append(alternativeNote);
        const alternativeConditions = conditions(alternative); if (alternativeConditions) related.append(alternativeConditions);
        related.append(selectButton(alternative));
        const preview = node('div', 'ttc-result-links'); preview.append(TTCPreview.createButton(alternative, 'Preview alternative'), link('View alternative PDF', alternative.pdf.path)); related.append(preview);
      }
      article.append(related);
    }
    return article;
  }
  function render() {
    TTCPreview.close();
    const expanded = new Set([...document.querySelectorAll('.ttc-result details[open]')].map(details => details.closest('article').dataset.record + ':' + details.className));
    const report = TTC.report(catalog.records, selectedIds);
    const reportIds = new Set(report.map(record => record.id));
    const matches = TTC.filter(browseRecords, query, filters);
    const available = matches.filter(record => !reportIds.has(record.id));
    const possible = TTC.possibleMatches(browseRecords, query, filters).filter(({ record }) => !reportIds.has(record.id));
    const visible = new Set([...available.map(record => record.id), ...possible.map(({ record }) => record.id)]);
    for (const id of availableMarks) if (!visible.has(id)) availableMarks.delete(id);
    for (const id of selectedMarks) if (!selectedIds.has(id)) selectedMarks.delete(id);
    updateFilterCounts();
    $('match-count').textContent = `${matches.length} of ${browseRecords.length} typicals match`;
    $('available-count').textContent = available.length;
    $('empty-results').hidden = available.length > 0;
    $('empty-results').textContent = matches.length ? 'All matching details are already in your project.' : possible.length ? 'No typicals match every selected filter. Review the possible matches below, or clear a filter.' : 'No typicals match these filters. Try fewer filters or select “Clear filters.”';
    $('results').replaceChildren(...available.map(record => resultCard(record)));
    $('possible-matches').hidden = !possible.length;
    $('possible-count').textContent = possible.length;
    $('possible-results').replaceChildren(...possible.map(({ record, missingFields }) => resultCard(record, missingFields)));
    const selection = TTC.selected(browseRecords, selectedIds);
    renderPaintWarning(report);
    $('selected-count').textContent = report.length;
    $('mobile-count').textContent = report.length;
    $('empty-selection').hidden = selection.length > 0;
    $('selected-list').replaceChildren(...selection.map(record => {
      const item = node('li'); item.dataset.selected = record.id;
      item.append(resultCard(record, [], 'selected'));
      return item;
    }));
    const automatic = report.filter(TTC.isAlways);
    $('automatic-details').hidden = !automatic.length;
    $('automatic-count').textContent = automatic.length;
    $('automatic-list').replaceChildren(...automatic.map(record => {
      const item = node('li'); item.dataset.automatic = record.id;
      item.append(resultCard(record, [], 'automatic'));
      return item;
    }));
    for (const details of document.querySelectorAll('.ttc-result details')) {
      if (expanded.has(details.closest('article').dataset.record + ':' + details.className)) details.open = true;
    }
    const pages = report.reduce((sum, r) => sum + r.pdf.pages, 0);
    $('packet-summary').textContent = report.length ? `${report.length} details in report (${selection.length} added + ${automatic.length} always included) · ${pages} detail pages + title and index` : '';
    updateButtons();
    updateTransferButtons();
  }
  function updateButtons() {
    for (const id of ['download-pdf', 'download-zip', 'download-word', 'retry-export']) $(id).disabled = busy || !catalog || !TTC.report(catalog.records, selectedIds).length;
  }
  function setStatus(message, error = false) {
    $('export-status').textContent = message; $('export-status').dataset.error = String(error);
  }
  function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob); const anchor = node('a'); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function exportSelection(kind) {
    if (busy || !catalog || !TTC.report(catalog.records, selectedIds).length) return;
    let projectName = '';
    if (kind === 'pdf') {
      try { projectName = TTCExports.projectName($('project-name').value); }
      catch (error) {
        $('project-name').setCustomValidity(error.message);
        $('project-name').reportValidity(); setStatus(error.message, true); return;
      }
    }
    const records = TTC.snapshot(TTC.report(catalog.records, selectedIds));
    const zipName = TTCExports.zipFilename($('project-name').value);
    busy = true; updateButtons(); $('retry-export').hidden = true;
    $('export-progress').hidden = !['pdf', 'zip'].includes(kind);
    $('export-progress').value = 0;
    setStatus(`Preparing the ${records.length} report details, including required sheets 100–104…`);
    try {
      if (kind === 'word') {
        const blob = await TTCExports.word(records, window.docx);
        saveFile(blob, 'mdot-ttc-typicals.docx'); setStatus(`Downloaded a Word table with ${records.length} typicals.`);
      } else {
        const fetchFile = async path => {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`The stored PDF could not be loaded (HTTP ${response.status}).`);
          return response.arrayBuffer();
        };
        const progress = (done, total, id) => {
          $('export-progress').value = Math.round(100 * done / total);
          setStatus(done === total ? (kind === 'zip' ? 'Saving ZIP…' : 'Saving combined PDF…') : `Preparing ${done + 1} of ${total}: ${id}`);
        };
        if (kind === 'zip') {
          const bytes = await TTCExports.zip(records, window.fflate, window.PDFLib, fetchFile, { progress });
          saveFile(new Blob([bytes], { type: 'application/zip' }), zipName);
          setStatus(`Downloaded a ZIP with ${records.length} individual MDOT PDFs for final submittal to MDOT Specs and Estimates.`);
        } else {
          const bytes = await TTCExports.pdf(records, window.PDFLib, fetchFile, { projectName, progress });
          saveFile(new Blob([bytes], { type: 'application/pdf' }), 'mdot-ttc-typicals.pdf');
          setStatus(`Downloaded ${records.length} details with a project title page, index, and page numbers.`);
        }
      }
    } catch (error) {
      setStatus(error.message || 'The export failed. Please retry.', true);
      retryKind = kind;
      $('retry-export').textContent = kind === 'zip' ? 'Retry ZIP download' : 'Retry PDF download';
      $('retry-export').hidden = !['pdf', 'zip'].includes(kind);
    } finally { busy = false; $('export-progress').hidden = true; updateButtons(); }
  }
  function resetFilters(next) {
    filters = next; query = ''; availableMarks.clear(); $('search').value = ''; $('possible-matches').open = false; renderFilters(); render();
  }
  async function load() {
    $('load-error').hidden = true; $('reload-catalog').hidden = true;
    try {
      const response = await fetch('catalog.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('The verified catalog could not be loaded.');
      catalog = TTC.validateCatalog(await response.json());
      browseRecords = TTC.selectable(catalog.records);
      const numberingKey = catalog.records.find(record => record.number === '100');
      $('typical-legend-source').replaceChildren(
        node('span', '', 'Source: MDOT 100-GEN-KEY and individual drawing titles.'),
        TTCPreview.createButton(numberingKey, 'Preview MDOT numbering key'),
        link('MDOT original ↗', numberingKey.sourceUrl));
      let saved = null;
      try { saved = localStorage.getItem(storageKey); }
      catch (_) { $('storage-status').textContent = 'Browser storage is unavailable. Your selection will last while this page stays open.'; }
      const restored = TTC.restore(catalog.records, saved); selectedIds = new Set(restored.ids);
      $('project-name').value = restored.projectName;
      if (restored.message) $('storage-status').textContent = restored.message;
      const familyCounts = ['construction', 'maintenance', 'survey'].map(family => `${catalog.records.filter(r => r.family === family).length} ${family}`).join(' · ');
      $('catalog-status').textContent = `${catalog.records.length} verified typicals (${familyCounts}) · PDFs checked ${catalog.verifiedAt.slice(0, 10)}`;
      $('selector').hidden = false; renderFilters(); render();
    } catch (error) {
      $('catalog-status').textContent = 'Catalog unavailable';
      $('load-error').textContent = error.message + ' Retry when your connection is available.';
      $('load-error').hidden = false; $('reload-catalog').hidden = false;
    }
  }
  $('search').addEventListener('input', event => { query = event.target.value; render(); });
  $('project-name').addEventListener('input', () => { $('project-name').setCustomValidity(''); persist(); });
  $('reset-filters').addEventListener('click', () => resetFilters({}));
  $('move-right').addEventListener('click', () => moveDetails([...availableMarks], true));
  $('move-left').addEventListener('click', () => moveDetails([...selectedMarks], false));
  for (const [id, listId, marks] of selectAllGroups) {
    $(id).addEventListener('change', event => {
      for (const input of $(listId).querySelectorAll('input[data-mark]')) {
        input.checked = event.target.checked;
        if (input.checked) marks.add(input.value); else marks.delete(input.value);
        input.closest('article').classList.toggle('is-marked', input.checked);
      }
      updateTransferButtons();
    });
  }
  $('new-project').addEventListener('click', () => {
    $('project-name').value = ''; $('project-name').setCustomValidity('');
    $('automatic-details').open = false;
    selectedIds = new Set(TTC.defaults(catalog.records)); persist(); resetFilters(TTC.initialFilters());
    selectedMarks.clear(); updateTransferButtons(); $('transfer-status').textContent = '';
    $('retry-export').hidden = true; if (!busy) setStatus('Project reset. Required sheets 100–104 remain included. The Construction category is on by default.');
  });
  $('download-word').addEventListener('click', () => exportSelection('word'));
  $('download-pdf').addEventListener('click', () => exportSelection('pdf'));
  $('download-zip').addEventListener('click', () => exportSelection('zip'));
  $('retry-export').addEventListener('click', () => exportSelection(retryKind));
  $('reload-catalog').addEventListener('click', load);
  load();
})();
