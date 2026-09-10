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
      const input = row.querySelector('input');
      const hasError = input.getAttribute('aria-invalid') === 'true';
      const hasQuantity = !hasError && Number(input.value) > 0;
      const matches = row.cells[0].textContent.toLowerCase().includes(query);
      // Filtering changes the view only. Keep invalid entries reachable, too.
      const editing = input === document.activeElement;
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
    THRU_LT_TURN_ARROW: 23.60,
    THRU_RT_TURN_ARROW: 28.14,
    TURN_ARROW_LT_OR_RT: 16.42,
    WRONG_WAY_ARROW: 56.54,
    YIELD_TRIANGLE: 3.00
};

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
  const markings = [];
  for (const [category, areas] of [['Legend', legendMaterial], ['Symbol', symbolMaterial]]) {
    for (const [id, unitArea] of Object.entries(areas)) {
      const input = document.getElementById(id);
      const label = input.closest('tr').cells[0].textContent.trim();
      const quantity = readQuantity(id, label, true);
      if (quantity > 0) {
        markings.push({ category, label, quantity, unitArea, area: quantity * unitArea });
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
  if (!material) return null;
  if (feetPainted === 0 && markings.length === 0) {
    return null;
  }

  let binder;
  let beads;
  let wetThickness;
  let minThicknessBeads;
  if (material === 'waterborne') {
    binder = 16.5;
    beads = 132;
    wetThickness = 15;
    minThicknessBeads = 20;
  } else if (material === 'regularWaterborne') {
    binder = 16.0;
    beads = 96;
    wetThickness = 15;
    minThicknessBeads = 20;
  } else if (material === 'sprayableThermoplastic') {
    binder = 560;
    beads = 200;
    wetThickness = 30;
    minThicknessBeads = 40;
  } else {
    return null;
  }

  const adjustedBinderPerMile = binder * (width / 4);
  const adjustedBeadsPerMile = beads * (width / 4);

  const gallonsPerMile = material === 'sprayableThermoplastic' ? 0 : adjustedBinderPerMile;
  const lbsPerMile = material === 'sprayableThermoplastic' ? adjustedBinderPerMile : 0;
  const beadsPerMile = adjustedBeadsPerMile;

  const materialGallonsUsed = (gallonsPerMile / 5280) * feetPainted;
  const materialLbsUsed = (lbsPerMile / 5280) * feetPainted;
  const beadLbsUsed = (beadsPerMile / 5280) * feetPainted;

  const squareFeetPerMile = 5280 * (width / 12);
  const gallonsPerSFT = gallonsPerMile / squareFeetPerMile;
  const lbsPerSFT = lbsPerMile / squareFeetPerMile;
  const beadsPerSFT = beadsPerMile / squareFeetPerMile;
  const totalSpecialMarkings = markings.reduce((total, marking) => total + marking.area, 0);

  const totalGallonsForSpecialMarkings = totalSpecialMarkings * gallonsPerSFT;
  const totalLbsForSpecialMarkings = totalSpecialMarkings * lbsPerSFT;
  const totalBeadsForSpecialMarkings = totalSpecialMarkings * beadsPerSFT;
  const isThermoplastic = material === 'sprayableThermoplastic';
  const totalBinderUsed = isThermoplastic
    ? materialLbsUsed + totalLbsForSpecialMarkings
    : materialGallonsUsed + totalGallonsForSpecialMarkings;
  const totalBeadsUsed = beadLbsUsed + totalBeadsForSpecialMarkings;

  const quantities = [materialGallonsUsed, materialLbsUsed, beadLbsUsed, totalSpecialMarkings,
    totalGallonsForSpecialMarkings, totalLbsForSpecialMarkings, totalBeadsForSpecialMarkings,
    totalBinderUsed, totalBeadsUsed];
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
  status.textContent = 'Calculated from your entries.';
  emptyResult.classList.add('hidden');
  result.classList.remove('hidden');
  return {
    materialName: materialSelect.selectedOptions[0].textContent,
    width, feetPainted, markings, rateRows, quantityRows
  };
}


function exportToPDF() {
  // Revalidate current inputs so an old calculation can never be exported.
  const calculation = calculate();
  if (!calculation) {
    const invalid = document.getElementById('markingForm').querySelector(':invalid');
    const group = invalid?.closest('[data-marking-group]');
    if (group) group.open = true;
    document.getElementById('markingForm').reportValidity();
    return;
  }
  if (!window.jspdf?.jsPDF) {
    const error = document.getElementById('markingError');
    error.textContent = 'The PDF library could not load. Check your connection and reload the page to export.';
    error.classList.remove('hidden');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margin = 15;
  const pageHeight = doc.internal.pageSize.getHeight();
  const textWidth = doc.internal.pageSize.getWidth() - 2 * margin;
  let yPosition = margin;

  function writeText(text, heading = false, compact = false) {
    doc.setFont('helvetica', heading ? 'bold' : 'normal');
    doc.setFontSize(heading ? 13 : 10);
    const lines = doc.splitTextToSize(String(text), textWidth);
    // Reserve a body line after headings to avoid orphaned section titles.
    if (heading && yPosition + (lines.length + 1) * 6 + 3 > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
    for (const line of lines) {
      if (yPosition + 6 > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += 6;
    }
    yPosition += heading ? 3 : compact ? 0 : 1;
  }

  const projectName = document.getElementById('projectName').value.trim() || 'Unnamed Project';
  const projectNumber = document.getElementById('projectNumber').value.trim() || 'No Number';
  writeText('Pavement Marking Material', true);
  writeText(`Project Name: ${projectName}`);
  writeText(`Project Number: ${projectNumber}`);
  writeText('Calculation Inputs', true);
  writeText(`Material: ${calculation.materialName}`);
  writeText(`Long-Line Width: ${calculation.width} inches`);
  writeText(`Feet Painted (excluding unpainted gaps): ${calculation.feetPainted}`);
  writeText('Application Rates', true);
  writeText('MDOT 2020 Standard Specifications, Table 811-1; solid-line rates scaled to the selected width.');
  Object.values(calculation.rateRows).forEach(text => writeText(text));
  writeText('Material Quantities', true);
  Object.values(calculation.quantityRows).forEach(text => writeText(text));
  writeText('Special Marking Inputs', true);
  if (calculation.markings.length === 0) writeText('None entered.');
  for (const marking of calculation.markings) {
    writeText(`${marking.category}: ${marking.label} | Quantity: ${marking.quantity} | Unit Area: ${marking.unitArea.toFixed(2)} sq ft | Total Area: ${marking.area.toFixed(2)} sq ft`, false, true);
  }

  doc.save(`${projectName}_report.pdf`);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('markingForm').addEventListener('focusout', event => {
    if (event.target.matches('.pm-marking-table input')) queueMicrotask(filterMarkings);
  });
  updateWidthLabel(document.getElementById('width').value);
  calculate();
});
