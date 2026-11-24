(function () {
  'use strict';
  const core = window.SignPlacement;
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  const format = (value, digits = 0) => value.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  });
  const conditionHelp = {
    speed: 'Turn, Curve, Reverse Turn, or Reverse Curve with an advisory speed.',
    stop: 'Stop Ahead, Yield Ahead, Signal Ahead, or an applicable intersection warning.',
    A: 'Complex maneuvers in heavy traffic, such as Merge or Lane Ends.'
  };
  const remembered = { mmutcd: { approach: '50', advisory: '20' }, mdot: { approach: '50', advisory: '25' } };
  let activeSource = 'mmutcd';

  function setMode(mode) {
    for (const name of ['table', 'formula']) {
      byId(`${name}-panel`).hidden = name !== mode;
      byId(`${name}-mode`).setAttribute('aria-pressed', String(name === mode));
    }
  }

  function options(id, values, selected) {
    byId(id).replaceChildren(...values.map((value) => new Option(String(value), String(value))));
    byId(id).value = selected;
  }

  function loadSource() {
    remembered[activeSource] = { approach: byId('table-approach').value || '50', advisory: byId('table-advisory').value || '20' };
    activeSource = byId('table-source').value;
    const source = core.sources[activeSource];
    const selected = remembered[activeSource];
    options('table-approach', source.rows.map((row) => row[0]), selected.approach);
    options('table-advisory', source.advisorySpeeds, selected.advisory);
    const isMMUTCD = activeSource === 'mmutcd';
    byId('legibility-adjustment').hidden = !isMMUTCD;
    byId('extra-legibility').disabled = !isMMUTCD;
    byId('mmutcd-notes').hidden = !isMMUTCD;
    byId('mdot-notes').hidden = isMMUTCD;
    text('source-help', isMMUTCD ? 'Approach speeds: 20–85 mph. Advisory columns: 10 mph increments.' : 'Approach speeds: 25–75 mph. Advisory columns: 5 mph increments.');
    text('approach-help', isMMUTCD ? 'Use the posted or 85th-percentile approach speed, as identified in Table 2C-3.' : 'Use the posted speed, as identified in MDOT Table 3.');
    text('table-caption-note', `${source.label}, ${source.table}. Distances are in feet, before any added legibility distance. The selected cell is highlighted. Scroll horizontally for all columns. Each source keeps its own speed selections.`);
    const link = byId('table-source-link');
    link.href = source.reference;
    link.textContent = `Open ${source.table} (PDF)`;
    buildTable();
    renderTableResult();
  }

  function buildTable() {
    const source = core.sources[activeSource];
    const footnote = activeSource === 'mmutcd' ? '6' : '4';
    function cellText(value, advisory) {
      if (value === null) return '<span title="Site-dependent placement: Note 5">N/A<sup>5</sup></span>';
      if (value === undefined) return '<span title="No published value">—</span>';
      return `${format(value)}${advisory && value === 100 ? `<sup>${footnote}</sup>` : ''}`;
    }
    byId('sign-placement-table').innerHTML = `
      <caption>${source.label} · ${source.table} · Advance placement (ft)</caption>
      <thead>
        <tr><th rowspan="2" scope="col">Approach<br>(mph)</th><th rowspan="2" scope="col" data-column="A">A<br>Lane change</th><th colspan="${source.advisorySpeeds.length + 1}" scope="colgroup">B · Decelerate to listed speed (mph)</th></tr>
        <tr><th scope="col" data-column="stop">0 · Stop</th>${source.advisorySpeeds.map((speed) => `<th scope="col" data-column="${speed}">${speed}</th>`).join('')}</tr>
      </thead>
      <tbody>${source.rows.map((row) => `<tr>
        <th scope="row" data-row="${row[0]}">${row[0]}</th>
        <td data-row="${row[0]}" data-column="A">${cellText(row[1], false)}</td>
        <td data-row="${row[0]}" data-column="stop">${cellText(row[2], false)}</td>
        ${source.advisorySpeeds.map((speed, index) => `<td data-row="${row[0]}" data-column="${speed}">${cellText(row[index + 3], true)}</td>`).join('')}
      </tr>`).join('')}</tbody>`;
  }

  function clearHighlight() {
    byId('sign-placement-table').querySelectorAll('.is-selected, .is-selected-heading').forEach((cell) => {
      cell.classList.remove('is-selected', 'is-selected-heading');
      cell.removeAttribute('aria-current');
    });
  }

  function highlight(approach, column) {
    const table = byId('sign-placement-table');
    const cell = table.querySelector(`td[data-row="${approach}"][data-column="${column}"]`);
    if (cell) {
      cell.classList.add('is-selected');
      cell.setAttribute('aria-current', 'true');
    }
    table.querySelector(`th[data-row="${approach}"]`)?.classList.add('is-selected-heading');
    table.querySelector(`th[data-column="${column}"]`)?.classList.add('is-selected-heading');
  }

  function renderTableResult() {
    const condition = byId('warning-condition').value;
    const approach = byId('table-approach').value;
    const advisory = byId('table-advisory').value;
    const source = core.sources[activeSource];
    const extraLegibility = byId('extra-legibility').checked;
    byId('advisory-field').hidden = condition !== 'speed';
    byId('table-advisory').disabled = condition !== 'speed';
    text('condition-help', conditionHelp[condition]);
    text('table-result-label', activeSource === 'mmutcd' ? 'Suggested advance placement' : 'Minimum advance placement');
    text('table-breakdown', '');
    text('table-guidance', '');
    clearHighlight();
    byId('table-distance').classList.remove('is-message');
    try {
      const result = core.lookup({ source: activeSource, condition, approach, advisory, extraLegibility });
      const context = condition === 'A' ? `${approach} mph approach · Condition A` :
        `${approach} mph approach → ${condition === 'stop' ? 'potential stop' : `${advisory} mph advisory`}`;
      text('table-context', `${source.label} · ${source.table}. ${context}.`);
      highlight(approach, condition === 'speed' ? advisory : condition);
      if (result.status !== 'value') {
        byId('table-distance').classList.add('is-message');
        text('table-distance', result.status === 'site' ? 'Site-dependent' : 'Not tabulated');
        text('table-guidance', result.status === 'site'
          ? 'Note 5: choose placement using site conditions and other signing. For a curve, place the sign in advance, up to 100 ft before the curve, and at least 100 ft from other signs.'
          : 'This source has no distance for the selected speed pair. Use engineering judgment; the blank cell is not interpolated or replaced with a distance.');
        if (activeSource === 'mmutcd' && extraLegibility) text('table-breakdown', 'The Note 1 legibility adjustment must be considered with the site placement; there is no numeric base to adjust here.');
        return;
      }
      text('table-distance', `${format(result.feet)} ft`);
      text('table-breakdown', result.addition ? `${format(result.baseFeet)} ft table distance + 100 ft minimum legibility adjustment (Note 1).` : 'Measured upstream from the condition to the warning sign.');
      const minimum = result.minimumSpacing ? `The 100 ft table value includes the spacing allowance (Note ${activeSource === 'mmutcd' ? '6' : '4'}). ` : '';
      text('table-guidance', minimum + (activeSource === 'mmutcd'
        ? 'Apply with engineering judgment for visibility, roadway features, and other signs. Table legibility credits are already included.'
        : `A supplementary plaque is called for if placement must exceed ${format(2 * result.baseFeet)} ft (twice the table minimum). Check the guide for the applicable sign category.`));
    } catch (error) {
      text('table-distance', '—');
      text('table-context', error.message);
    }
  }

  function renderFormula() {
    const fields = { initial: 'initial-velocity', final: 'final-velocity', deceleration: 'deceleration', reaction: 'pr-time', legibility: 'legibility-distance' };
    const inputs = Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, byId(id).value]));
    try {
      const r = core.calculate(inputs);
      for (const [id, value] of Object.entries({ 'formula-distance': r.placement, 'pr-distance': r.response,
        'braking-distance': r.braking, 'distance-traveled': r.total, 'legibility-credit': r.legibility })) {
        text(id, `${format(value, 1)} ft`);
      }
      text('formula-context', `${inputs.initial} → ${inputs.final} mph · ${inputs.reaction} s response · ${inputs.deceleration} ft/s² deceleration.`);
      text('formula-validation', r.clamped
        ? 'Legibility credit meets or exceeds the total travel distance, so the calculated distance is limited to 0 ft. This does not establish an acceptable field location; apply the relevant table and site requirements.'
        : 'Total travel minus legibility credit. Confirm minimum spacing and the applicable source guidance before choosing a field location.');
      text('text-height', r.legibility > 0 ? `${format(r.letterHeight, 2)} in` : '—');
      text('text-height-context', r.legibility > 0 ? `for ${format(r.legibility, 1)} ft of word-message legibility.` : 'Enter a positive legibility distance for this check.');
    } catch (error) {
      for (const id of ['formula-distance', 'pr-distance', 'braking-distance', 'distance-traveled', 'legibility-credit', 'text-height']) text(id, '—');
      text('formula-context', 'Check the inputs.');
      text('formula-validation', error.message);
      text('text-height-context', 'Enter valid inputs for this check.');
    }
  }

  byId('table-mode').addEventListener('click', () => setMode('table'));
  byId('formula-mode').addEventListener('click', () => setMode('formula'));
  byId('table-form').addEventListener('change', (event) => {
    if (event.target.id === 'table-source') loadSource();
    else renderTableResult();
  });
  byId('formula-form').addEventListener('input', renderFormula);
  for (const id of ['table-form', 'formula-form']) byId(id).addEventListener('submit', (event) => event.preventDefault());
  loadSource();
  renderFormula();
  setMode('table');
})();
