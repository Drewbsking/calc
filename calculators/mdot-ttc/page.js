(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const storageKey = 'mdot-ttc-project-v1';
  let catalog, selectedIds = new Set(), filters = TTC.initialFilters(), query = '', busy = false;
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
  function toggle(id, focusId = id) {
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    persist(); render();
    const control = [...$('results').querySelectorAll('[data-toggle]')].find(el => el.dataset.toggle === focusId);
    if (control) control.focus({ preventScroll: true });
  }
  function selectButton(record) {
    const selected = selectedIds.has(record.id);
    const element = button(selected ? 'Selected ✓' : '+ Add', () => toggle(record.id));
    element.dataset.toggle = record.id;
    element.setAttribute('aria-pressed', String(selected));
    element.setAttribute('aria-label', `${selected ? 'Remove' : 'Add'} ${record.id}`);
    return element;
  }
  function renderFilters() {
    $('filters').replaceChildren();
    for (const [key, label] of Object.entries(TTC.FILTERS)) {
      const details = node('details', 'ttc-filter');
      const summary = node('summary', '', label + ' ');
      const count = node('span');
      const updateCount = () => { count.textContent = filters[key]?.length ? `· ${filters[key].length} selected` : '· All'; };
      updateCount(); summary.append(count); details.append(summary);
      const options = node('div', 'ttc-filter-options');
      options.setAttribute('role', 'group'); options.setAttribute('aria-label', label);
      for (const value of TTC.options(catalog.records, key)) {
        const option = node('label'); const input = node('input'); input.type = 'checkbox'; input.value = value;
        input.checked = (filters[key] || []).includes(value); input.dataset.filter = key;
        input.addEventListener('change', () => {
          const choices = new Set(filters[key] || []);
          if (input.checked) choices.add(value); else choices.delete(value);
          filters[key] = [...choices]; updateCount(); render();
        });
        const resultCount = node('span', 'ttc-filter-count');
        resultCount.setAttribute('aria-hidden', 'true');
        option.append(input, node('span', 'ttc-filter-value', value), resultCount); options.append(option);
      }
      details.append(options); $('filters').append(details);
    }
  }
  function updateFilterCounts() {
    const counts = TTC.facetCounts(catalog.records, query, filters);
    for (const input of $('filters').querySelectorAll('input[data-filter]')) {
      const total = counts[input.dataset.filter][input.value];
      const option = input.closest('label');
      option.querySelector('.ttc-filter-count').textContent = `(${total})`;
      option.dataset.empty = String(total === 0);
      input.setAttribute('aria-label', `${input.value}, ${total} matching ${total === 1 ? 'typical' : 'typicals'}`);
    }
  }
  function resultCard(record) {
    const article = node('article', 'ttc-result' + (selectedIds.has(record.id) ? ' is-selected' : ''));
    article.dataset.typical = record.id;
    const top = node('div', 'ttc-result-top');
    top.append(node('span', 'ttc-code', record.id), selectButton(record));
    article.append(top, node('h3', '', record.title));
    const tags = node('div', 'ttc-tags');
    for (const key of ['projectType', 'roadwayType', 'trafficArrangement', 'controlMethod', 'existingLanes', 'lanesClosed', 'rcoc']) {
      for (const value of TTC.values(record, key)) {
        const prefix = { trafficArrangement: 'Arrangement: ', controlMethod: 'Control: ', existingLanes: 'Existing: ', lanesClosed: 'Closed: ', rcoc: 'RCOC: ' }[key] || '';
        if (value !== 'Unspecified') tags.append(node('span', 'ttc-tag', prefix + value));
      }
    }
    const paint = paintFlag(record); if (paint) tags.append(paint);
    article.append(tags);
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
    if (record.relatedIds.length) {
      const related = node('details', 'ttc-related'); related.append(node('summary', '', 'Related maintenance alternative'));
      for (const id of record.relatedIds) {
        const alternative = catalog.records.find(r => r.id === id);
        related.append(node('p', '', alternative.id + ' — ' + alternative.title));
        related.append(node('p', 'ttc-help', 'RCOC usage: ' + alternative.filters.rcoc));
        const alternativePaint = paintFlag(alternative); if (alternativePaint) related.append(alternativePaint);
        const alternativeNote = note(alternative); if (alternativeNote) related.append(alternativeNote);
        related.append(selectButton(alternative));
        const preview = node('div', 'ttc-result-links'); preview.append(link('View alternative PDF', alternative.pdf.path)); related.append(preview);
      }
      article.append(related);
    }
    return article;
  }
  function render() {
    const matches = TTC.filter(catalog.records, query, filters);
    updateFilterCounts();
    $('match-count').textContent = `${matches.length} of ${catalog.records.length} typicals match`;
    $('empty-results').hidden = matches.length > 0;
    $('add-matches').disabled = !matches.some(r => !selectedIds.has(r.id));
    $('results').replaceChildren(...matches.map(resultCard));
    const selection = TTC.selected(catalog.records, selectedIds);
    const report = TTC.report(catalog.records, selectedIds);
    renderPaintWarning(report);
    $('selected-count').textContent = selection.length;
    $('mobile-count').textContent = selection.length;
    $('empty-selection').hidden = selection.length > 0;
    $('selected-list').replaceChildren(...selection.map(record => {
      const item = node('li'); item.dataset.selected = record.id;
      const top = node('div', 'ttc-result-top');
      const remove = button('Remove', () => {
        selectedIds.delete(record.id); persist(); render();
        $('clear-selection').focus({ preventScroll: true });
      }, 'ttc-text-button');
      remove.setAttribute('aria-label', 'Remove selected ' + record.id);
      top.append(node('h3', '', record.id), remove);
      item.append(top, node('p', '', record.title));
      const paint = paintFlag(record); if (paint) item.append(paint);
      const workbookNote = note(record); if (workbookNote) item.append(workbookNote);
      return item;
    }));
    const automatic = report.filter(record => !selectedIds.has(record.id));
    $('automatic-details').hidden = !automatic.length;
    $('automatic-count').textContent = automatic.length;
    $('automatic-list').replaceChildren(...automatic.map(record => {
      const item = node('li'); item.dataset.automatic = record.id;
      item.append(node('h3', '', record.id), node('p', '', record.title), node('span', 'ttc-tag', 'RCOC: Always'));
      const paint = paintFlag(record); if (paint) item.append(paint);
      const workbookNote = note(record); if (workbookNote) item.append(workbookNote);
      return item;
    }));
    $('word-table').innerHTML = TTC.tableHTML(report);
    const pages = report.reduce((sum, r) => sum + r.pdf.pages, 0);
    $('packet-summary').textContent = report.length ? `${report.length} details in report${automatic.length ? ` (${selection.length} selected + ${automatic.length} Always included)` : ''} · ${pages} detail pages + title and index` : '';
    updateButtons();
  }
  function updateButtons() {
    for (const id of ['download-pdf', 'download-word', 'copy-table', 'select-table', 'retry-export']) $(id).disabled = busy || !selectedIds.size;
    $('clear-selection').disabled = !selectedIds.size;
  }
  function setStatus(message, error = false) {
    $('export-status').textContent = message; $('export-status').dataset.error = String(error);
  }
  function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob); const anchor = node('a'); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function selectTable() {
    $('table-preview').open = true;
    const range = document.createRange(); range.selectNodeContents($('word-table'));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    $('word-table').focus();
  }
  async function exportSelection(kind) {
    if (busy || !selectedIds.size) return;
    let projectName = '';
    if (kind === 'pdf') {
      try { projectName = TTCExports.projectName($('project-name').value); }
      catch (error) {
        $('project-name').setCustomValidity(error.message);
        $('project-name').reportValidity(); setStatus(error.message, true); return;
      }
    }
    const records = TTC.snapshot(TTC.report(catalog.records, selectedIds));
    busy = true; updateButtons(); $('retry-export').hidden = true;
    $('export-progress').hidden = kind !== 'pdf';
    $('export-progress').value = 0;
    setStatus(`Preparing the ${records.length} report details, including the RCOC Always sheets…`);
    try {
      if (kind === 'copy') {
        try {
          if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('Clipboard unavailable');
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([TTC.tableHTML(records)], { type: 'text/html' }),
            'text/plain': new Blob([TTC.tableText(records)], { type: 'text/plain' }),
          })]);
          setStatus(`Copied ${records.length} typicals. Paste into Word to insert the table.`);
        } catch (_) {
          $('word-table').innerHTML = TTC.tableHTML(records);
          $('copy-help').textContent = 'Clipboard access was unavailable. The table is selected below; press Ctrl+C (or ⌘C), then paste into Word. You can also download the Word table.';
          selectTable(); setStatus('Use the selected table below to copy manually.');
        }
      } else if (kind === 'word') {
        const blob = await TTCExports.word(records, window.docx);
        saveFile(blob, 'mdot-ttc-typicals.docx'); setStatus(`Downloaded a Word table with ${records.length} typicals.`);
      } else {
        const bytes = await TTCExports.pdf(records, window.PDFLib, async path => {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`The stored PDF could not be loaded (HTTP ${response.status}).`);
          return response.arrayBuffer();
        }, { projectName, progress: (done, total, id) => {
          $('export-progress').value = Math.round(100 * done / total);
          setStatus(done === total ? 'Saving combined PDF…' : `Preparing ${done + 1} of ${total}: ${id}`);
        } });
        saveFile(new Blob([bytes], { type: 'application/pdf' }), 'mdot-ttc-typicals.pdf');
        setStatus(`Downloaded ${records.length} details with a project title page, index, and page numbers.`);
      }
    } catch (error) {
      setStatus(error.message || 'The export failed. Please retry.', true);
      $('retry-export').hidden = kind !== 'pdf';
    } finally { busy = false; $('export-progress').hidden = true; updateButtons(); }
  }
  function resetFilters(next) { filters = next; query = ''; $('search').value = ''; renderFilters(); render(); }
  async function load() {
    $('load-error').hidden = true; $('reload-catalog').hidden = true;
    try {
      const response = await fetch('catalog.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('The verified catalog could not be loaded.');
      catalog = TTC.validateCatalog(await response.json());
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
  $('show-all').addEventListener('click', () => resetFilters({}));
  $('reset-filters').addEventListener('click', () => resetFilters(TTC.initialFilters()));
  $('add-matches').addEventListener('click', () => { TTC.filter(catalog.records, query, filters).forEach(r => selectedIds.add(r.id)); persist(); render(); });
  $('clear-selection').addEventListener('click', () => { selectedIds.clear(); persist(); render(); });
  $('new-project').addEventListener('click', () => {
    $('project-name').value = ''; $('project-name').setCustomValidity('');
    selectedIds = new Set(TTC.defaults(catalog.records)); persist(); resetFilters(TTC.initialFilters());
    $('retry-export').hidden = true; if (!busy) setStatus('Project reset. No details or filters are selected.');
  });
  $('select-table').addEventListener('click', selectTable);
  $('copy-table').addEventListener('click', () => exportSelection('copy'));
  $('download-word').addEventListener('click', () => exportSelection('word'));
  $('download-pdf').addEventListener('click', () => exportSelection('pdf'));
  $('retry-export').addEventListener('click', () => exportSelection('pdf'));
  $('reload-catalog').addEventListener('click', load);
  load();
})();
