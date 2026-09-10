function filterMarkings() {
  const query = document.getElementById('markingSearch').value.trim().toLowerCase();
  const enteredOnly = document.getElementById('enteredOnly').checked;
  const filtering = Boolean(query || enteredOnly);
  let shown = 0;
  let total = 0;
  let entered = 0;
  for (const group of document.querySelectorAll('[data-marking-group]')) {
    const rows = [...group.querySelectorAll('tbody tr')];
    let groupShown = 0;
    let groupEntered = 0;
    for (const row of rows) {
      const input = row.cells[1].querySelector('input');
      const hasError = Boolean(row.querySelector('[aria-invalid="true"]'));
      const hasQuantity = !hasError && Number(input.value) > 0;
      const matches = row.dataset.markingLabel.toLowerCase().includes(query);
      // Filtering changes the view only. Keep invalid entries reachable, too.
      const editing = row.contains(document.activeElement);
      row.hidden = !hasError && !editing && (!matches || (enteredOnly && !hasQuantity));
      row.classList.toggle('pm-entered', hasQuantity);
      if (!row.hidden) groupShown++;
      if (hasQuantity) groupEntered++;
    }
    group.querySelector('[data-group-count]').textContent = groupEntered
      ? `${groupEntered} entered` : `${rows.length} types`;
    if (filtering) {
      if (!('beforeFilterOpen' in group.dataset)) group.dataset.beforeFilterOpen = String(group.open);
      group.open = groupShown > 0;
    } else if ('beforeFilterOpen' in group.dataset) {
      group.open = group.dataset.beforeFilterOpen === 'true';
      delete group.dataset.beforeFilterOpen;
    }
    group.hidden = filtering && groupShown === 0;
    shown += groupShown;
    total += rows.length;
    entered += groupEntered;
  }
  document.getElementById('markingFilterStatus').textContent = !filtering ? '' : shown
    ? `${shown} of ${total} marking types shown. All entered quantities remain included.`
    : 'No matching markings. Clear the search or turn off Entered only to see more.';
  document.getElementById('markingSelection').textContent = entered
    ? `${entered} marking ${entered === 1 ? 'type' : 'types'} entered.`
    : 'No special markings entered.';
}

const legendMaterial = {
    AHEAD: 28.86,
    BIKE: 22.15,
    BUS: 18.55,
    CANADA: 32.87,
    EAST: 21.71,
    EXIT: 17.76,
    LANE: 22.30,
    LEFT: 19.11,
    MERGE: 33.28,
    NO: 12.92,
    NORTH: 29.53,
    ONLY: 20.90,
    PED: 17.63,
    RIGHT: 25.10,
    SCHOOL: 32.58,
    SOUTH: 27.83,
    STOP: 21.50,
    TO: 10.43,
    TRAIL: 22.10,
    TURN: 23.04,
    WEST: 24.42,
    XING: 20.13,
    YIELD: 22.91
};

const symbolMaterial = {
    ACCESSIBLE: 11.11,
    BICYCLE_ROAD: 10.54,
    BICYCLE_LANE_PATH: 5.93,
    BIKE_TURN_ARROW_LT_OR_RT: 4.11,
    DEDICATED_LANE_HOV: 10.24,
    DIRECT_ARROW_BIKE: 5.07,
    LEFT_RIGHT_ARROW: 28.99,
    LT_ROUNDABOUT_ARROW: 17.48,
    LT_RT_THRU_ARROW: 40.26,
    MERGE_ARROW: 42.17,
    RAILROAD: 60.89,
    RAILROAD_ALTERNATE: 59.06,
    RT_LT_ROUNDABOUT_ARROW: 22.19,
    RT_THRU_LT_ROUNDABOUT_ARROW: 28.31,
    SHARROW: 9.26,
    THRU_ARROW: 13.16,
    THRU_LT_ROUNDABOUT_ARROW: 23.60,
    THRU_LT_TURN_ARROW: 28.14,
    THRU_RT_TURN_ARROW: 28.14,
    TURN_ARROW_LT_OR_RT: 16.42,
    WRONG_WAY_ARROW: 34.56,
    YIELD_TRIANGLE: 3.00
};

// MDOT 2020 Table 811-1, SOLID line columns, in width order 4, 6, 8, 12 inches.
const pavementMaterials = {
  standardWaterborne: { name: 'Waterborne', binder: [16.5, 24.7, 33, 49.4], beads: [132, 198, 264, 396], unit: 'gal', wet: 15, dry: 20 },
  waterborne: { name: 'Low Temperature Waterborne', binder: [16.5, 24.7, 33, 49.4], beads: [132, 198, 264, 396], unit: 'gal', wet: 15, dry: 20 },
  regularDry: { name: 'Regular Dry Paint', binder: [16, 24, 32, 48], beads: [96, 144, 192, 288], unit: 'gal', wet: 15, dry: 20 },
  sprayableThermoplastic: { name: 'Sprayable Thermoplastic', binder: [560, 840, 1120, 1680], beads: [200, 300, 400, 600], unit: 'lb', wet: 30, dry: 40 }
};
// Only these arrow shapes are covered by PAVE-900-H sheet 7's half-dimension note.
const pathArrows = new Set(['THRU_ARROW', 'TURN_ARROW_LT_OR_RT', 'MERGE_ARROW', 'THRU_LT_TURN_ARROW', 'THRU_RT_TURN_ARROW']);

function getApplicationRates(material, width, projectRates = null) {
  const spec = pavementMaterials[material];
  if (!spec) return null;
  const column = [4, 6, 8, 12].indexOf(width);
  const referenceWidth = projectRates ? projectRates.width : 4;
  const referenceBinder = projectRates ? projectRates.binder : spec.binder[0];
  const referenceBeads = projectRates ? projectRates.beads : spec.beads[0];
  const referenceArea = 5280 * referenceWidth / 12;
  const squareFeetPerMile = 5280 * width / 12;
  const method = projectRates ? 'project' : column >= 0 ? 'table' : 'scaled';
  const binderPerMile = method === 'table' ? spec.binder[column] : referenceBinder * width / referenceWidth;
  const beadsPerMile = method === 'table' ? spec.beads[column] : referenceBeads * width / referenceWidth;
  const basis = method === 'table' ? `MDOT Table 811-1: exact ${width}-inch solid-line column`
    : method === 'project' ? `Project rates scaled from a ${referenceWidth}-inch solid line`
      : `Derived estimate: 4-inch MDOT rates x ${width} / 4; this width is not tabulated`;
  return {
    method, basis, project: projectRates,
    tableColumns: [4, 6, 8, 12].map((lineWidth, i) => ({ width: lineWidth, binder: spec.binder[i], beads: spec.beads[i] })),
    baseBinderPerMile: spec.binder[0], baseBeadsPerMile: spec.beads[0],
    binderUnit: spec.unit, wetThickness: spec.wet, minThicknessBeads: spec.dry,
    referenceWidth, referenceBinder, referenceBeads, referenceArea,
    widthFactor: width / referenceWidth, widthFeet: width / 12, squareFeetPerMile,
    binderPerMile, beadsPerMile,
    // Special markings use a fixed reference area rate, independent of line width.
    binderPerSFT: referenceBinder / referenceArea, beadsPerSFT: referenceBeads / referenceArea,
    longLineBinderPerSFT: binderPerMile / squareFeetPerMile,
    longLineBeadsPerSFT: beadsPerMile / squareFeetPerMile
  };
}

function changeMaterial(prefix = '') {
  // Rates in gallons must never silently become rates in pounds, or vice versa.
  document.getElementById(prefix + 'rateMode').value = 'mdot';
  for (const id of ['projectBinderRate', 'projectBeadRate', 'rateReference']) document.getElementById(prefix + id).value = '';
  document.getElementById(prefix + 'rateReferenceWidth').value = '4';
  calculate();
}

let nextLongLineId = 1;
function addLongLine(focus = true) {
  const id = `line-${nextLongLineId++}`;
  const prefix = `${id}-`;
  const row = document.createElement('section');
  row.className = 'pm-long-line';
  row.dataset.lineId = id;
  row.innerHTML = `<div class="pm-line-heading"><h3></h3><button type="button" class="pm-remove-line">Remove</button></div>
    <div class="pm-field"><label for="${prefix}material">Material</label><select id="${prefix}material"><option value="">Select a material</option>${Object.entries(pavementMaterials).map(([key, spec]) => `<option value="${key}">${spec.name}</option>`).join('')}</select></div>
    <div class="pm-line-inputs">
      <div class="pm-field"><label for="${prefix}width">Width (inches)</label><input id="${prefix}width" type="number" min="4" max="24" step="1" value="4" inputmode="numeric"></div>
      <div class="pm-field"><label for="${prefix}feet">Painted length (ft)</label><input id="${prefix}feet" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"></div>
    </div>
    <div class="pm-field pm-line-reference"><label for="${prefix}reference">Line / location reference <span class="pm-optional">Optional</span></label><input id="${prefix}reference" type="text" placeholder="White edge line, road name, stations, or plan sheet"></div>
    <details class="pm-result-details pm-rate-settings">
      <summary>Rate basis &amp; project rates <span class="pm-disclosure" aria-hidden="true">+</span></summary>
      <div class="pm-field"><label for="${prefix}rateMode">Application-rate basis</label><select id="${prefix}rateMode"><option value="mdot">MDOT Table 811-1</option><option value="project">Project / manufacturer rates</option></select></div>
      <fieldset id="${prefix}projectRateFields" hidden disabled><legend>Project rates for this row</legend>
        <p class="pm-help">Enter rates for one solid line at the reference width. Changing this row's material resets its rates to MDOT.</p>
        <div class="pm-field"><label for="${prefix}rateReferenceWidth">Reference width (inches)</label><input id="${prefix}rateReferenceWidth" type="number" min="0" step="any" value="4"></div>
        <div class="pm-field"><label for="${prefix}projectBinderRate">Binder per mile (<span id="${prefix}projectBinderUnit">gal</span>)</label><input id="${prefix}projectBinderRate" type="number" min="0" step="any"></div>
        <div class="pm-field"><label for="${prefix}projectBeadRate">Glass beads per mile (lb)</label><input id="${prefix}projectBeadRate" type="number" min="0" step="any"></div>
        <div class="pm-field"><label for="${prefix}rateReference">Rate source / specification reference</label><textarea id="${prefix}rateReference" rows="2" placeholder="Product, data-sheet date, rates, and applicable scope"></textarea></div>
      </fieldset>
    </details>
    <p id="${prefix}rateBasisNote" class="pm-help pm-line-basis"></p>
    <p class="pm-line-quantity"></p>`;
  row.querySelector('.pm-remove-line').addEventListener('click', () => {
    const adjacent = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    calculate();
    (adjacent?.querySelector('select') || document.getElementById('addLongLineButton')).focus();
  });
  row.addEventListener('input', event => {
    if (event.target.id !== prefix + 'material') calculate();
  });
  row.addEventListener('change', event => {
    if (event.target.id === prefix + 'material') changeMaterial(prefix);
    else calculate();
  });
  document.getElementById('longLineRows').append(row);
  calculate();
  if (focus) row.querySelector('select').focus();
  return id;
}

function calculateLongLine(input, rates) {
  return { ...input, rates, materialName: pavementMaterials[input.material].name,
    area: input.feetPainted * input.width / 12,
    binder: input.feetPainted / 5280 * rates.binderPerMile,
    beads: input.feetPainted / 5280 * rates.beadsPerMile };
}

function summarizePavementQuantities(longLines, special) {
  const groups = new Map();
  function group(material) {
    if (!groups.has(material)) groups.set(material, {
      material, materialName: pavementMaterials[material].name, unit: pavementMaterials[material].unit,
      longLineFeet: 0, longLineArea: 0, longLineBinder: 0, longLineBeads: 0,
      specialArea: 0, specialBinder: 0, specialBeads: 0
    });
    return groups.get(material);
  }
  for (const line of longLines) {
    const total = group(line.material);
    total.longLineFeet += line.feetPainted;
    total.longLineArea += line.area;
    total.longLineBinder += line.binder;
    total.longLineBeads += line.beads;
  }
  if (special.markings.length) {
    const total = group(special.material);
    total.specialArea = special.area;
    total.specialBinder = special.binder;
    total.specialBeads = special.beads;
  }
  const materials = [...groups.values()].map(total => ({ ...total,
    totalArea: total.longLineArea + total.specialArea,
    totalBinder: total.longLineBinder + total.specialBinder,
    totalBeads: total.longLineBeads + total.specialBeads
  }));
  const totals = materials.reduce((sum, m) => ({
    paintGallons: sum.paintGallons + (m.unit === 'gal' ? m.totalBinder : 0),
    binderPounds: sum.binderPounds + (m.unit === 'lb' ? m.totalBinder : 0),
    beadsPounds: sum.beadsPounds + m.totalBeads,
    longLineFeet: sum.longLineFeet + m.longLineFeet,
    longLineArea: sum.longLineArea + m.longLineArea,
    specialArea: sum.specialArea + m.specialArea,
    totalArea: sum.totalArea + m.totalArea
  }), { paintGallons: 0, binderPounds: 0, beadsPounds: 0, longLineFeet: 0, longLineArea: 0, specialArea: 0, totalArea: 0 });
  return { materials, totals };
}

function initializeMarkingSizes() {
  for (const [id] of Object.entries({ ...legendMaterial, ...symbolMaterial })) {
    const quantity = document.getElementById(id);
    quantity.dataset.markingQuantity = '';
    const row = quantity.closest('tr');
    const cell = row.cells[0];
    const label = cell.textContent.trim();
    row.dataset.markingLabel = label;
    const legend = id in legendMaterial;
    const details = document.createElement('details');
    details.className = 'pm-size-details';
    details.innerHTML = `<summary>Size: MDOT standard</summary>
      <label for="${id}_size">Marking size</label>
      <select id="${id}_size" aria-label="${label} size">
        <option value="standard">MDOT standard</option>
        ${legend || pathArrows.has(id) ? '<option value="path">Shared-use path</option>' : ''}
        <option value="custom">Project-specific area</option>
      </select>
      <div class="pm-area-entry" hidden>
        <label for="${id}_unitArea">Net material area (sq ft/each)</label>
        <input id="${id}_unitArea" type="number" min="0" step="any" inputmode="decimal" aria-label="${label} net material area">
        <label for="${id}_areaSource">Area calculation / drawing reference</label>
        <textarea id="${id}_areaSource" rows="2" aria-label="${label} area reference" placeholder="Dimensions, gap deductions, and plan sheet"></textarea>
      </div>
      <p class="pm-size-help"></p>`;
    cell.append(details);
    details.addEventListener('input', calculate);
    details.addEventListener('change', calculate);
  }
}

function calculate() {
  const result = document.getElementById('result');
  const error = document.getElementById('markingError');
  const emptyResult = document.getElementById('emptyResult');
  const status = document.getElementById('estimateStatus');
  result.classList.add('hidden');
  emptyResult.classList.remove('hidden');
  error.classList.add('hidden');
  error.textContent = '';
  status.textContent = 'Results update as you enter quantities.';

  const errors = [];
  function invalidate(input, message) {
    input.setCustomValidity(message);
    input.setAttribute('aria-invalid', 'true');
    errors.push(message);
  }
  function readPositive(id, label, allowZero = false) {
    const input = document.getElementById(id);
    const value = Number(input.value);
    if (input.value.trim() === '' || input.validity.badInput || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
      invalidate(input, `${label}: enter a ${allowZero ? 'nonnegative' : 'positive'} number.`);
    }
    return value;
  }
  function readReference(id, label) {
    const input = document.getElementById(id);
    const value = input.value.trim();
    if (!value) invalidate(input, `${label}: provide the source and calculation basis.`);
    return value;
  }
  document.querySelectorAll('#markingForm input, #markingForm select, #markingForm textarea').forEach(input => {
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
  });
  function readQuantity(id, label, wholeNumber = false) {
    const input = document.getElementById(id);
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    // Blank optional inputs mean zero; incomplete numeric entries do not.
    const value = Number(input.value);
    if (input.validity.badInput || !Number.isFinite(value) || value < 0 ||
        (wholeNumber && !Number.isSafeInteger(value)) || input.validity.stepMismatch) {
      const message = wholeNumber
        ? `${label}: enter a nonnegative whole number within the supported range.`
        : `${label}: enter a nonnegative number with at most two decimal places.`;
      input.setCustomValidity(message);
      input.setAttribute('aria-invalid', 'true');
      errors.push(message);
    }
    return value;
  }

  const number = (value, digits = 2) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  function readRateSettings(prefix, material, width, active, label) {
    const field = id => document.getElementById(prefix + id);
    const custom = field('rateMode').value === 'project';
    field('projectRateFields').hidden = !custom;
    field('projectRateFields').disabled = !custom || !active;
    field('projectBinderUnit').textContent = pavementMaterials[material]?.unit || 'gal';
    let projectRates = null;
    if (custom && active) projectRates = {
      width: readPositive(prefix + 'rateReferenceWidth', `${label} rate reference width`),
      binder: readPositive(prefix + 'projectBinderRate', `${label} binder rate`),
      beads: readPositive(prefix + 'projectBeadRate', `${label} bead rate`, true),
      source: readReference(prefix + 'rateReference', `${label} rate reference`),
      entries: Object.fromEntries(['rateReferenceWidth', 'projectBinderRate', 'projectBeadRate'].map(id => [id, field(id).value]))
    };
    const rates = custom && !active ? null : getApplicationRates(material, width, projectRates);
    field('rateBasisNote').textContent = rates ? rates.basis : custom ? 'Project rates: enter a positive quantity to activate these fields.' : 'Select a material to see its rate basis.';
    const rateInputs = Object.fromEntries(['rateMode', 'rateReferenceWidth', 'projectBinderRate', 'projectBeadRate', 'rateReference'].map(id => [id, field(id).value]));
    return { rates, rateInputs };
  }
  const longLines = [];
  const allLongLines = [];
  document.querySelectorAll('[data-line-id]').forEach((row, index) => {
    const id = row.dataset.lineId;
    const prefix = id + '-';
    const label = `Line ${index + 1}`;
    const errorsBeforeRow = errors.length;
    row.querySelector('h3').textContent = label;
    row.querySelector('.pm-remove-line').setAttribute('aria-label', `Remove long line ${index + 1}`);
    const materialInput = document.getElementById(prefix + 'material');
    const material = materialInput.value;
    const feetPainted = readQuantity(prefix + 'feet', `${label} painted length`);
    materialInput.required = feetPainted > 0;
    if (feetPainted > 0 && !pavementMaterials[material]) invalidate(materialInput, `${label}: select a material.`);
    const widthInput = document.getElementById(prefix + 'width');
    const width = Number(widthInput.value || 4);
    if ((feetPainted > 0 && widthInput.value === '') || widthInput.validity.badInput || !Number.isInteger(width) || width < 4 || width > 24) {
      invalidate(widthInput, `${label}: enter a whole-number width from 4 to 24 inches.`);
    }
    const { rates, rateInputs } = readRateSettings(prefix, material, width, feetPainted > 0, label);
    const input = { id, label, material, materialName: pavementMaterials[material]?.name || 'Not selected', width,
      widthEntry: widthInput.value, feetPainted, feetEntry: document.getElementById(prefix + 'feet').value,
      reference: document.getElementById(prefix + 'reference').value.trim(), rateInputs };
    allLongLines.push(input);
    row.querySelector('.pm-line-quantity').textContent = 'No painted footage entered.';
    if (errors.length > errorsBeforeRow) {
      row.querySelector('.pm-line-quantity').textContent = 'Check this row’s entries to calculate its quantity.';
    } else if (feetPainted > 0 && rates) {
      const line = calculateLongLine(input, rates);
      longLines.push(line);
      row.querySelector('.pm-line-quantity').textContent = `${number(line.binder)} ${rates.binderUnit} binder + ${number(line.beads)} lb glass beads`;
    }
  });
  const markings = [];
  const allMarkings = [];
  for (const [category, areas] of [['Legend', legendMaterial], ['Symbol', symbolMaterial]]) {
    for (const [id, standardArea] of Object.entries(areas)) {
      const input = document.getElementById(id);
      const row = input.closest('tr');
      const label = row.dataset.markingLabel;
      const quantity = readQuantity(id, label, true);
      const sizeMode = document.getElementById(`${id}_size`).value;
      const needsArea = sizeMode === 'custom' || (sizeMode === 'path' && category === 'Legend');
      const areaInput = document.getElementById(`${id}_unitArea`);
      const sourceInput = document.getElementById(`${id}_areaSource`);
      row.querySelector('.pm-area-entry').hidden = !needsArea;
      areaInput.disabled = sourceInput.disabled = !needsArea || quantity === 0;
      const sizeLabel = sizeMode === 'path' ? 'Shared-use path' : sizeMode === 'custom' ? 'Project-specific area' : 'MDOT standard';
      row.querySelector('.pm-size-details > summary').textContent = `Size: ${sizeLabel}`;
      row.querySelector('.pm-size-help').textContent = sizeMode === 'path'
        ? category === 'Legend' ? 'Sheets 1-6: halve vertical dimensions, retaining 2-inch template gaps. Enter the resulting net area and its calculation.'
          : 'Sheet 7: half length x half width = 25% of the scheduled area.'
        : sizeMode === 'custom' ? 'Enter the liquid-applied material area from the project detail, excluding unpainted gaps.' : '';
      let unitArea = standardArea;
      let areaBasis = 'PAVE-900-H sheet 9, Material column';
      if (sizeMode === 'path' && pathArrows.has(id)) {
        unitArea = standardArea * 0.5 * 0.5;
        areaBasis = 'PAVE-900-H sheet 7: standard area x 0.5 x 0.5';
      } else if (needsArea) {
        unitArea = quantity > 0 ? readPositive(`${id}_unitArea`, `${label} net area`) : 0;
        areaBasis = quantity > 0 ? readReference(`${id}_areaSource`, `${label} area reference`) : sourceInput.value.trim();
      }
      document.getElementById(`${id}_area`).textContent = needsArea && quantity === 0 ? 'Enter area' : unitArea.toLocaleString('en-US', { maximumFractionDigits: 6 });
      const marking = { id, category, label, quantity, enteredValue: input.value, standardArea, sizeMode, sizeLabel,
        unitArea, areaBasis, areaEntry: needsArea ? areaInput.value : '', area: quantity * unitArea };
      allMarkings.push(marking);
      if (quantity > 0) {
        markings.push(marking);
      }
    }
  }
  const materialSelect = document.getElementById('material');
  const material = materialSelect.value;
  materialSelect.required = markings.length > 0;
  if (markings.length && !pavementMaterials[material]) invalidate(materialSelect, 'Special markings: select a material.');
  const { rates, rateInputs } = readRateSettings('', material, 4, markings.length > 0, 'Special markings');
  filterMarkings();
  if (errors.length) {
    error.textContent = errors.join(' ');
    error.classList.remove('hidden');
    emptyResult.classList.add('hidden');
    status.textContent = 'Check your entries to continue.';
    return null;
  }
  if (!longLines.length && !markings.length) return null;
  const area = markings.reduce((sum, m) => sum + m.area, 0);
  const special = { material, materialName: pavementMaterials[material]?.name || 'Not selected',
    markings, allMarkings, area, rates: markings.length ? rates : null, rateInputs,
    binder: markings.length ? area * rates.binderPerSFT : 0,
    beads: markings.length ? area * rates.beadsPerSFT : 0 };
  const { materials, totals } = summarizePavementQuantities(longLines, special);
  const appliedRates = [...longLines.map(line => line.rates), ...(special.rates ? [special.rates] : [])];
  const numeric = [...Object.values(totals), ...materials.flatMap(m => Object.values(m).filter(v => typeof v === 'number')),
    ...appliedRates.flatMap(r => Object.values(r).filter(v => typeof v === 'number'))];
  if (!numeric.every(Number.isFinite)) {
    error.textContent = 'The entered quantities or rates are too large to calculate. Reduce them and try again.';
    error.classList.remove('hidden');
    emptyResult.classList.add('hidden');
    status.textContent = 'Check your entries to continue.';
    return null;
  }
  const summary = document.getElementById('materialSummary');
  summary.replaceChildren();
  for (const m of materials) {
    const card = document.createElement('section');
    card.className = 'pm-material-summary';
    const heading = document.createElement('h3');
    heading.textContent = m.materialName;
    const binder = document.createElement('p');
    binder.className = 'pm-material-amount';
    binder.textContent = `${number(m.totalBinder)} ${m.unit}`;
    const beads = document.createElement('p');
    beads.textContent = `${number(m.totalBeads)} lb glass beads`;
    card.append(heading, binder, beads);
    summary.append(card);
  }
  document.getElementById('combinedBeads').textContent = number(totals.beadsPounds);
  document.getElementById('totalLineFeet').textContent = number(totals.longLineFeet);
  const breakdown = document.getElementById('lineSummary');
  breakdown.replaceChildren();
  if (!longLines.length) breakdown.textContent = 'No long-line footage entered.';
  for (const line of longLines) {
    const item = document.createElement('div');
    item.className = 'pm-line-summary';
    const heading = document.createElement('strong');
    heading.textContent = `${line.label}: ${line.materialName}`;
    const detail = document.createElement('p');
    detail.textContent = `${line.width} in x ${number(line.feetPainted)} ft | ${number(line.binder)} ${line.rates.binderUnit} binder | ${number(line.beads)} lb beads`;
    const reference = document.createElement('p');
    reference.textContent = line.reference;
    item.append(heading, detail, reference);
    breakdown.append(item);
  }
  document.getElementById('specialSummary').hidden = !markings.length;
  document.getElementById('specialSummaryText').textContent = markings.length
    ? `${special.materialName}: ${number(special.area)} sq ft; ${number(special.binder)} ${special.rates.binderUnit} binder; ${number(special.beads)} lb beads. ${special.rates.basis}.` : '';
  status.textContent = `Calculated from ${longLines.length} long-line ${longLines.length === 1 ? 'row' : 'rows'} and ${markings.length} special marking types.`;
  emptyResult.classList.add('hidden');
  result.classList.remove('hidden');
  return { longLines, allLongLines, special, materials, totals };
}


function exportToPDF() {
  // Revalidate current inputs so an old calculation can never be exported.
  const calculation = calculate();
  if (!calculation) {
    const invalid = document.getElementById('markingForm').querySelector(':invalid');
    for (let parent = invalid?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    document.getElementById('markingForm').reportValidity();
    return;
  }
  if (!window.jspdf?.jsPDF) {
    const error = document.getElementById('markingError');
    error.textContent = 'The PDF library could not load. Check your connection and reload the page to export.';
    error.classList.remove('hidden');
    return;
  }
  const project = Object.fromEntries(
    ['projectName', 'projectNumber', 'preparedBy', 'projectLocation', 'quantitySource', 'calculationNotes']
      .map(id => [id, document.getElementById(id).value.trim()])
  );
  const doc = createPavementMarkingReport(calculation, project, window.jspdf.jsPDF);
  const filename = (project.projectName || 'Unnamed Project').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
  doc.save(`${filename}_calculations.pdf`);
}

document.addEventListener('DOMContentLoaded', () => {
  initializeMarkingSizes();
  document.getElementById('markingForm').addEventListener('focusout', event => {
    if (event.target.matches('.pm-marking-table input')) queueMicrotask(filterMarkings);
  });
  addLongLine(false);
});
