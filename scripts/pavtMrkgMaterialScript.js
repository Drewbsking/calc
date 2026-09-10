function updateWidthLabel(value) {
  document.getElementById('widthValue').innerText = `${value} inches`;
}

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
  standardWaterborne: { binder: [16.5, 24.7, 33, 49.4], beads: [132, 198, 264, 396], unit: 'gal', wet: 15, dry: 20 },
  waterborne: { binder: [16.5, 24.7, 33, 49.4], beads: [132, 198, 264, 396], unit: 'gal', wet: 15, dry: 20 },
  regularDry: { binder: [16, 24, 32, 48], beads: [96, 144, 192, 288], unit: 'gal', wet: 15, dry: 20 },
  sprayableThermoplastic: { binder: [560, 840, 1120, 1680], beads: [200, 300, 400, 600], unit: 'lb', wet: 30, dry: 40 }
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

function changeMaterial() {
  // Rates in gallons must never silently become rates in pounds, or vice versa.
  document.getElementById('rateMode').value = 'mdot';
  for (const id of ['projectBinderRate', 'projectBeadRate', 'rateReference']) document.getElementById(id).value = '';
  document.getElementById('rateReferenceWidth').value = '4';
  calculate();
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
  document.querySelectorAll('#markingForm input, #markingForm textarea').forEach(input => {
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

  const materialSelect = document.getElementById('material');
  const material = materialSelect.value;
  const width = Number(document.getElementById('width').value);
  const feetPainted = readQuantity('feet', 'Feet painted');
  const customRates = document.getElementById('rateMode').value === 'project';
  const rateFields = document.getElementById('projectRateFields');
  rateFields.hidden = !customRates;
  rateFields.disabled = !customRates;
  const binderUnit = pavementMaterials[material]?.unit || 'gal';
  document.getElementById('projectBinderUnit').textContent = binderUnit;
  let projectRates = null;
  if (customRates) {
    projectRates = {
      width: readPositive('rateReferenceWidth', 'Rate reference width'),
      binder: readPositive('projectBinderRate', 'Project binder rate'),
      beads: readPositive('projectBeadRate', 'Project bead rate', true),
      source: readReference('rateReference', 'Project rate reference'),
      entries: Object.fromEntries(['rateReferenceWidth', 'projectBinderRate', 'projectBeadRate'].map(id => [id, document.getElementById(id).value]))
    };
  }
  const rates = getApplicationRates(material, width, projectRates);
  document.getElementById('rateBasisNote').textContent = rates ? rates.basis : 'Select a material to see the rate basis.';
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
  if (!Number.isInteger(width) || width < 4 || width > 24) {
    errors.push('Select a marking width from 4 to 24 inches.');
  }
  filterMarkings();
  if (errors.length) {
    error.textContent = errors.join(' ');
    error.classList.remove('hidden');
    emptyResult.classList.add('hidden');
    status.textContent = 'Check your entries to continue.';
    return null;
  }
  if (!rates) return null;
  if (feetPainted === 0 && markings.length === 0) {
    return null;
  }

  const { wetThickness, minThicknessBeads } = rates;
  const adjustedBinderPerMile = rates.binderPerMile;
  const adjustedBeadsPerMile = rates.beadsPerMile;

  const gallonsPerMile = material === 'sprayableThermoplastic' ? 0 : adjustedBinderPerMile;
  const lbsPerMile = material === 'sprayableThermoplastic' ? adjustedBinderPerMile : 0;
  const beadsPerMile = adjustedBeadsPerMile;

  const materialGallonsUsed = (gallonsPerMile / 5280) * feetPainted;
  const materialLbsUsed = (lbsPerMile / 5280) * feetPainted;
  const beadLbsUsed = (beadsPerMile / 5280) * feetPainted;

  const gallonsPerSFT = binderUnit === 'gal' ? rates.binderPerSFT : 0;
  const lbsPerSFT = binderUnit === 'lb' ? rates.binderPerSFT : 0;
  const beadsPerSFT = rates.beadsPerSFT;
  const totalSpecialMarkings = markings.reduce((total, marking) => total + marking.area, 0);

  const totalGallonsForSpecialMarkings = totalSpecialMarkings * gallonsPerSFT;
  const totalLbsForSpecialMarkings = totalSpecialMarkings * lbsPerSFT;
  const totalBeadsForSpecialMarkings = totalSpecialMarkings * beadsPerSFT;
  const isThermoplastic = material === 'sprayableThermoplastic';
  const totalBinderUsed = isThermoplastic
    ? materialLbsUsed + totalLbsForSpecialMarkings
    : materialGallonsUsed + totalGallonsForSpecialMarkings;
  const totalBeadsUsed = beadLbsUsed + totalBeadsForSpecialMarkings;
  const longLineArea = feetPainted * (width / 12);
  const totalArea = longLineArea + totalSpecialMarkings;

  const quantities = [materialGallonsUsed, materialLbsUsed, beadLbsUsed, totalSpecialMarkings,
    totalGallonsForSpecialMarkings, totalLbsForSpecialMarkings, totalBeadsForSpecialMarkings,
    totalBinderUsed, totalBeadsUsed, longLineArea, totalArea,
    rates.binderPerSFT, rates.beadsPerSFT, rates.longLineBinderPerSFT, rates.longLineBeadsPerSFT, rates.referenceArea];
  if (!quantities.every(Number.isFinite)) {
    error.textContent = 'The entered quantities are too large to calculate. Reduce them and try again.';
    error.classList.remove('hidden');
    emptyResult.classList.add('hidden');
    status.textContent = 'Check your entries to continue.';
    return null;
  }

  const rateRows = {
    thickness: `Wet Binder Thickness without Beads: ${wetThickness} mils`,
    thicknessBeads: `Minimum Dry Thickness with Beads: ${minThicknessBeads} mils`,
    gallonsPerMile: `Gallons of Paint per Mile: ${gallonsPerMile.toFixed(2)}`,
    lbsPerMile: `Pounds of Paint per Mile: ${lbsPerMile.toFixed(2)}`,
    beadsPerMile: `Pounds of Beads per Mile: ${beadsPerMile.toFixed(2)}`,
    gallonsPerSFT: `Gallons of Paint per Square Foot: ${gallonsPerSFT.toFixed(6)}`,
    lbsPerSFT: `Pounds of Paint per Square Foot: ${lbsPerSFT.toFixed(6)}`,
    beadsPerSFT: `Pounds of Beads per Square Foot: ${beadsPerSFT.toFixed(6)}`
  };
  const quantityRows = {
    materialGallons: `Gallons of Paint Used for Long Lines: ${materialGallonsUsed.toFixed(2)}`,
    materialLbs: `Pounds of Paint Used for Long Lines: ${materialLbsUsed.toFixed(2)}`,
    beadsUsed: `Pounds of Beads Used for Long Lines: ${beadLbsUsed.toFixed(2)}`,
    specialMarkings: `Total Special Markings Quantity (sq ft): ${totalSpecialMarkings.toFixed(2)}`,
    specialGallonsUsed: `Gallons of Paint Used for Special Markings: ${totalGallonsForSpecialMarkings.toFixed(2)}`,
    specialLbsUsed: `Pounds of Paint Used for Special Markings: ${totalLbsForSpecialMarkings.toFixed(2)}`,
    specialBeadsUsed: `Pounds of Beads Used for Special Markings: ${totalBeadsForSpecialMarkings.toFixed(2)}`,
    totalBinderUsed: `Total ${isThermoplastic ? 'Thermoplastic (lb)' : 'Paint (gal)'} Required: ${totalBinderUsed.toFixed(2)}`,
    totalBeadsUsed: `Total Beads Required (lb): ${totalBeadsUsed.toFixed(2)}`
  };
  for (const [id, text] of Object.entries({ ...rateRows, ...quantityRows })) {
    const element = document.getElementById(id);
    const value = text.slice(text.lastIndexOf(': ') + 2);
    const decimalPlaces = /^\d+\.\d+$/.test(value) ? value.split('.')[1].length : 0;
    const formatted = Number.isFinite(Number(value))
      ? Number(value).toLocaleString('en-US', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })
      : value;
    element.textContent = element.hasAttribute('data-result-value') ? formatted : text;
  }
  document.querySelectorAll('.pm-gallons').forEach(element => element.classList.toggle('hidden', isThermoplastic));
  document.querySelectorAll('.pm-pounds').forEach(element => element.classList.toggle('hidden', !isThermoplastic));
  document.getElementById('totalBinderLabel').textContent = isThermoplastic ? 'Thermoplastic' : 'Paint required';
  document.getElementById('totalBinderUnit').textContent = isThermoplastic ? 'lb' : 'gal';
  document.getElementById('summaryMaterial').textContent = materialSelect.selectedOptions[0].textContent;
  document.getElementById('summaryBasis').textContent = rates.basis;
  status.textContent = 'Calculated from your entries.';
  emptyResult.classList.add('hidden');
  result.classList.remove('hidden');
  return {
    material,
    materialName: materialSelect.selectedOptions[0].textContent,
    width, feetPainted, feetEntry: document.getElementById('feet').value,
    markings, allMarkings, rateRows, quantityRows,
    rates,
    quantities: {
      milesPainted: feetPainted / 5280, longLineArea, totalArea,
      longLineBinder: isThermoplastic ? materialLbsUsed : materialGallonsUsed,
      longLineBeads: beadLbsUsed, specialArea: totalSpecialMarkings,
      specialBinder: isThermoplastic ? totalLbsForSpecialMarkings : totalGallonsForSpecialMarkings,
      specialBeads: totalBeadsForSpecialMarkings, totalBinder: totalBinderUsed, totalBeads: totalBeadsUsed
    }
  };
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
  updateWidthLabel(document.getElementById('width').value);
  calculate();
});
