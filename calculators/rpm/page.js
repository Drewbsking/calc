document.addEventListener('DOMContentLoaded', () => {
  const el = (id) => document.getElementById(id);
  const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
  const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  let entries = [], nextId = 1, latestResult = null;
  function visible(id, show) {
    el(id).hidden = !show;
    el(id).querySelectorAll('input, select, textarea, button').forEach((control) => { control.disabled = !show; });
  }
  function element(tag, attributes = {}, text) {
    const node = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function field(parent, labelText, id, type, value = '') {
    const group = element('div', { class: 'form-group' });
    const label = element('label', { for: id }, labelText);
    const control = element('input', { id, type, 'aria-describedby': 'curveHelp' });
    if (type === 'number') { control.setAttribute('min', '0'); control.setAttribute('step', 'any'); }
    control.value = value;
    group.appendChild(label); group.appendChild(control); parent.appendChild(group);
    return { control, label };
  }
  function addEntry(values = {}) {
    const key = nextId++, node = element('article', { class: 'rpm-curve-entry' });
    const header = element('header'), heading = element('h3');
    const remove = element('button', { id: 'curve-' + key + '-remove', type: 'button', class: 'rpm-secondary rpm-remove' }, 'Remove');
    header.appendChild(heading); header.appendChild(remove); node.appendChild(header);
    const first = element('div', { class: 'rpm-two' });
    const name = field(first, 'Curve name (optional)', 'curve-' + key + '-name', 'text', values.name || '').control;
    name.setAttribute('maxlength', '80');
    const length = field(first, 'PC-to-PT length (ft)', 'curve-' + key + '-length', 'number', values.length || '').control;
    node.appendChild(first);
    const speedGroup = element('div', { class: 'form-group' });
    speedGroup.appendChild(element('label', { for: 'curve-' + key + '-speed' }, 'Speed difference (mph)'));
    const speedDifference = element('select', { id: 'curve-' + key + '-speed', 'aria-describedby': 'speedHelp' });
    speedDifference.appendChild(element('option', { value: '' }, 'Select speed difference'));
    RPMCalculator.RCOC_SPEED_DIFFERENCES.forEach((speed) => {
      speedDifference.appendChild(element('option', { value: speed }, speed + ' mph'));
    });
    speedDifference.value = String(values.speedDifference ?? '');
    speedGroup.appendChild(speedDifference); node.appendChild(speedGroup);
    const summary = element('p', { id: 'curve-' + key + '-summary', class: 'rpm-curve-summary', 'aria-live': 'polite' });
    node.appendChild(summary);
    const entry = { key, node, heading, remove, name, length, speedDifference, summary };
    remove.addEventListener('click', () => {
      entries = entries.filter((item) => item !== entry);
      if (!entries.length) addEntry();
      refreshRows(); calculate(); el('addCurve').focus();
    });
    entries.push(entry);
    return entry;
  }
  function refreshRows() {
    entries.forEach((entry, i) => {
      entry.heading.textContent = 'Curve ' + (i + 1);
      entry.remove.setAttribute('aria-label', 'Remove curve ' + (i + 1));
    });
    el('curveRows').replaceChildren(...entries.map((entry) => entry.node));
  }
  function readCurves() {
    return entries.map((entry) => ({
      name: entry.name.value, length: entry.length.value,
      speedDifference: entry.speedDifference.value
    }));
  }
  function reference() {
    const application = el('referenceApplication').value;
    el('referenceDiagram').replaceChildren();
    const profile = RPMCalculator.PROFILES[application];
    if (!profile) throw new Error('Choose the curve estimate or an informational application.');
    el('referenceNote').textContent = profile.note;
    el('referenceType').textContent = profile.level;
    el('referenceType').dataset.level = profile.level.toLowerCase();
    el('referenceRule').textContent = profile.rule;
    el('referenceSource').textContent = 'MUTCD §' + profile.section;
    el('referenceSource').href = RPMCalculator.SOURCE + '#page=' + (profile.family === 'substitute' ? 613 : 612);
    if (profile.custom) {
      el('referenceSpacing').textContent = 'Application-specific';
      el('referenceCaption').textContent = 'Information only. No numerical spacing is supplied for this application.';
      return;
    }
    const layout = RPMCalculator.resolveLayout({ application, spacingChoice: 'rule', markerColor: profile.color, groupSize: 3, dotLength: 3, dotGap: 9 });
    RPMDiagram.render(el('referenceDiagram'), layout);
    el('referenceSpacing').textContent = layout.kind === 'intersection' ? '1 per short line' :
      layout.kind === 'group' ? layout.perGroup + ' per group' : fmt(layout.spacing) + ' ft';
    el('referenceCaption').textContent = 'Information only. ' + (layout.kind === 'group'
      ? 'Example groups repeat every ' + fmt(layout.cycle) + ' ft.' : layout.kind === 'intersection'
        ? 'One marker per short painted line.' : layout.pair + ' marker(s) per station at ' + fmt(layout.spacing) + ' ft spacing.') +
      ' Schematic; final placement follows the applicable detail.';
  }
  function preview() {
    if (!latestResult) return;
    const index = Math.min(Number(el('curvePreview').value) || 0, latestResult.rows.length - 1);
    const row = latestResult.rows[index];
    RPMDiagram.renderCurve(el('layoutDiagram'), row);
    el('selectedSpacing').textContent = fmt(row.spacing) + ' ft';
    el('selectedApproach').textContent = fmt(row.approachSpacing) + ' ft';
    el('layoutCaption').textContent = row.name + ': ' + row.speedDifference + ' mph speed difference. ' + fmt(row.curveMarkers) +
      ' markers on the curve at ' + fmt(row.spacing) + ' ft spacing, plus 3 before PC and 3 after PT at ' + fmt(row.approachSpacing) +
      ' ft spacing (extending ' + fmt(row.extensionEachEnd) + ' ft beyond each end). Representative stations shown; schematic is not to scale.';
  }
  function calculate(showErrors = false) {
    latestResult = null;
    el('rpmError').textContent = '';
    el('rpmResults').hidden = true;
    el('resultRows').replaceChildren();
    ['totalCost', 'totalMarkers', 'curveMarkerTotal', 'approachMarkerTotal', 'curveLengthTotal', 'treatedLength', 'selectedSpacing', 'selectedApproach'].forEach((id) => { el(id).textContent = '—'; });
    el('baseLengthNote').textContent = ''; el('spacingStatus').textContent = '';
    el('layoutDiagram').replaceChildren();
    el('layoutCaption').textContent = 'Enter each curve’s length and speed difference to see the layout and project total.';
    visible('curvePreviewField', false);
    try {
      entries.forEach((entry) => {
        entry.summary.dataset.invalid = 'false';
        if (!entry.speedDifference.value.trim()) { entry.summary.textContent = 'Select a speed difference to determine spacing.'; return; }
        try {
          const curve = RPMCalculator.resolveCurve({ speedDifference: entry.speedDifference.value });
          entry.summary.textContent = fmt(curve.spacing) + ' ft on curve · ' + fmt(curve.approachSpacing) + ' ft before / after · 3 markers outside each end';
        } catch (error) { entry.summary.textContent = error.message; entry.summary.dataset.invalid = 'true'; }
      });
      const controls = el('quantityPanel').querySelectorAll('input, select');
      for (const control of controls) {
        if (control.validity && control.validity.badInput) throw new Error('Finish entering a valid number before calculating.');
      }
      if (!showErrors && entries.every((entry) => !entry.length.value.trim() && !entry.speedDifference.value.trim())) return;
      const result = RPMCalculator.estimateCurves({ curves: readCurves(), unitPrice: el('unitPrice').value });
      latestResult = result;
      el('totalCost').textContent = money(result.costCents);
      el('totalMarkers').textContent = fmt(result.markers);
      el('curveMarkerTotal').textContent = fmt(result.curveMarkers);
      el('approachMarkerTotal').textContent = fmt(result.approachMarkers);
      el('curveLengthTotal').textContent = fmt(result.length) + ' ft';
      el('treatedLength').textContent = fmt(result.treatedLength) + ' ft';
      el('baseLengthNote').textContent = result.rows.length + ' curve(s). Treatment lengths are summed; shared lengths are not deducted.';
      el('spacingStatus').textContent = 'RCOC workbook method · speed-difference spacing + 3 markers outside each end';
      el('resultRows').replaceChildren(...result.rows.map((row) => {
        const tr = document.createElement('tr');
        const values = [row.name, fmt(row.length), fmt(row.speedDifference), fmt(row.spacing), fmt(row.approachSpacing),
          fmt(row.curveMarkers), fmt(row.approachMarkers), fmt(row.markers), money(row.costCents)];
        values.forEach((value, column) => {
          const td = document.createElement(column ? 'td' : 'th');
          if (!column) td.scope = 'row';
          td.textContent = value; tr.appendChild(td);
        });
        return tr;
      }));
      const selected = Math.min(Number(el('curvePreview').value) || 0, result.rows.length - 1);
      el('curvePreview').replaceChildren(...result.rows.map((row, i) => element('option', { value: i }, row.name)));
      el('curvePreview').value = String(selected);
      visible('curvePreviewField', true);
      preview();
      el('rpmResults').hidden = false;
    } catch (error) { el('rpmError').textContent = error.message; }
  }
  el('rpmForm').addEventListener('input', () => calculate());
  el('rpmForm').addEventListener('change', (event) => {
    if (event.target.id === 'curvePreview') preview(); else calculate();
  });
  el('rpmForm').addEventListener('submit', (event) => {
    event.preventDefault(); calculate(true);
    if (el('rpmError').textContent) el('rpmError').focus();
  });
  el('addCurve').addEventListener('click', () => {
    const entry = addEntry(); refreshRows(); calculate(); entry.length.focus();
  });
  el('loadExample').addEventListener('click', () => {
    entries = [];
    [{ name: 'Example — 0 mph difference', length: '500', speedDifference: '0' },
      { name: 'Example — 10 mph difference', length: '500', speedDifference: '10' }].forEach(addEntry);
    refreshRows(); el('sampleNote').hidden = false; el('sampleNote').textContent = 'Illustrative example only: two 500 ft curves with speed differences of 0 and 10 mph. Replace with project data.'; calculate();
  });
  el('clearCurves').addEventListener('click', () => {
    entries = []; addEntry(); refreshRows();
    el('sampleNote').textContent = ''; el('sampleNote').hidden = true; calculate();
  });
  el('referenceApplication').addEventListener('change', reference);
  el('curvePreview').addEventListener('change', preview);
  el('printEstimate').addEventListener('click', () => window.print());
  addEntry(); refreshRows(); calculate(); reference();
});
