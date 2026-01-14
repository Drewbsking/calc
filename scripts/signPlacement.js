const advisorySpeeds = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
const tableRows = [
  { posted: 20, conditionA: 225, values: [115, 115, 115, 115, 115, 115, 115, 115, 115, 115, 115, 115, 115, 115, 115, 115, 115] },
  { posted: 25, conditionA: 325, values: [155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155] },
  { posted: 30, conditionA: 460, values: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200] },
  { posted: 35, conditionA: 565, values: [250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250] },
  { posted: 40, conditionA: 670, values: [305, 246, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100] },
  { posted: 45, conditionA: 775, values: [360, 293, 125, 112, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100] },
  { posted: 50, conditionA: 885, values: [425, 361, 200, 188, 175, 150, 125, 112, 100, 100, 100, 100, 100, 100, 100, 100, 100] },
  { posted: 55, conditionA: 990, values: [495, 432, 275, 250, 225, 212, 200, 162, 125, 125, 125, 125, 125, 125, 125, 125, 125] },
  { posted: 60, conditionA: 1100, values: [570, 507, 350, 338, 325, 300, 275, 238, 200, 150, 100, 100, 100, 100, 100, 100, 100] },
  { posted: 65, conditionA: 1200, values: [645, 589, 450, 425, 400, 375, 350, 312, 275, 238, 200, 150, 100, 100, 100, 100, 100] },
  { posted: 70, conditionA: 1250, values: [730, 671, 525, 512, 500, 475, 450, 412, 375, 325, 275, 212, 150, 150, 150, 150, 150] },
  { posted: 75, conditionA: 1350, values: [820, 764, 625, 612, 600, 575, 550, 512, 475, 425, 375, 312, 250, 175, 100, 100, 100] },
  { posted: 80, conditionA: 1475, values: [910, 857, 725, 712, 700, 662, 625, 588, 550, 500, 450, 400, 350, 275, 200, 200, 200] },
  { posted: 85, conditionA: 1600, values: [1010, 957, 825, 812, 800, 775, 750, 712, 675, 625, 575, 512, 450, 375, 300, 225, 150] }
];

let currentMode = 'formula';
const manualOverrides = {
  '45-35': 125
};

function setMode(mode) {
  currentMode = mode;
  document.getElementById('modeToggle').checked = mode === 'table';
  document.getElementById('formula-panel').classList.toggle('hidden', mode !== 'formula');
  document.querySelectorAll('.formula-only').forEach((el) => el.classList.toggle('hidden', mode !== 'formula'));
  document.getElementById('table-panel').classList.toggle('hidden', mode !== 'table');
  runCalculation();
}

function buildTable() {
  const table = document.getElementById('sign-placement-table');
  const headerCells = advisorySpeeds.map((mph) => `<th data-advisory="${mph}">${mph === 0 ? 'Stop' : mph}</th>`).join('');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Posted Speed (mph)</th>
        <th>Condition A (ft)</th>
        ${headerCells}
      </tr>
    </thead>
    <tbody>
      ${tableRows.map((row) => `
        <tr data-posted="${row.posted}">
          <th scope="row">${row.posted}</th>
          <td class="condition-a-cell" data-posted="${row.posted}">${row.conditionA}</td>
          ${row.values.map((val, idx) => {
            const advisory = advisorySpeeds[idx];
            const override = manualOverrides[`${row.posted}-${advisory}`];
            const displayVal = override ?? val;
            const text = Number.isFinite(displayVal) ? displayVal : '—';
            return `<td data-posted="${row.posted}" data-advisory="${advisory}">${text}</td>`;
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;
}

function calculateFormula() {
  const initialVelocityMPH = parseFloat(document.getElementById('initial-velocity').value);
  const finalVelocityMPH = parseFloat(document.getElementById('final-velocity').value);
  const gForce = parseFloat(document.getElementById('g-force').value);
  const prTime = parseFloat(document.getElementById('pr-time').value) || 1.5;
  const gravity = 32.174; // ft/s²

  if ([initialVelocityMPH, finalVelocityMPH, gForce].some((n) => Number.isNaN(n) || n < 0)) {
    return;
  }

  const initialVelocityFPS = initialVelocityMPH * 1.467;
  const finalVelocityFPS = finalVelocityMPH * 1.467;

  const prDistance = initialVelocityFPS * prTime;

  const deceleration = gForce * gravity;
  const brakingDistance = Math.abs((Math.pow(finalVelocityFPS, 2) - Math.pow(initialVelocityFPS, 2)) / (2 * deceleration));

  const totalDistance = prDistance + brakingDistance;
  const textHeight = prDistance / 30;

  document.getElementById('pr-distance').textContent = `${prDistance.toFixed(2)} ft`;
  document.getElementById('distance-traveled').textContent = `${totalDistance.toFixed(2)} ft`;
  document.getElementById('text-height').textContent = `${textHeight.toFixed(2)} ft`;
}

function findNearest(values, target) {
  return values.reduce((best, val) => {
    const currentDiff = Math.abs(val - target);
    const bestDiff = Math.abs(best - target);
    return currentDiff < bestDiff ? val : best;
  });
}

function updateTableHighlight(posted, advisory) {
  const table = document.getElementById('sign-placement-table');
  table.querySelectorAll('tr').forEach((tr) => tr.classList.remove('table-highlight-row'));
  table.querySelectorAll('th[data-advisory]').forEach((th) => th.classList.remove('table-highlight-col'));
  table.querySelectorAll('td').forEach((td) => td.classList.remove('table-highlight-cell'));

  const row = table.querySelector(`tr[data-posted="${posted}"]`);
  if (row) {
    row.classList.add('table-highlight-row');
  }
  const header = table.querySelector(`th[data-advisory="${advisory}"]`);
  if (header) {
    header.classList.add('table-highlight-col');
  }
  const cell = table.querySelector(`td[data-posted="${posted}"][data-advisory="${advisory}"]`);
  if (cell) {
    cell.classList.add('table-highlight-cell');
  }
}

function interpolateDistance(rowData, advisoryIndex) {
  const values = rowData.values;
  let lower = advisoryIndex;
  while (lower >= 0 && values[lower] == null) {
    lower -= 1;
  }
  let upper = advisoryIndex;
  while (upper < values.length && values[upper] == null) {
    upper += 1;
  }
  if (lower >= 0 && upper < values.length && values[lower] != null && values[upper] != null) {
    const lowerVal = values[lower];
    const upperVal = values[upper];
    const lowerAdv = advisorySpeeds[lower];
    const upperAdv = advisorySpeeds[upper];
    const targetAdv = advisorySpeeds[advisoryIndex];
    const ratio = (targetAdv - lowerAdv) / (upperAdv - lowerAdv);
    return Math.round(lowerVal + (upperVal - lowerVal) * ratio);
  }
  return null;
}

function calculateTableLookup() {
  const postedInput = parseFloat(document.getElementById('initial-velocity').value);
  const advisoryInput = parseFloat(document.getElementById('final-velocity').value);
  const resultEl = document.getElementById('table-distance');
  const contextEl = document.getElementById('table-context');

  if ([postedInput, advisoryInput].some((n) => Number.isNaN(n) || n < 0)) {
    resultEl.textContent = '—';
    contextEl.textContent = 'Enter posted and advisory speeds to see the table distance.';
    return;
  }

  const postedSpeeds = tableRows.map((row) => row.posted);
  const nearestPosted = findNearest(postedSpeeds, postedInput);
  const nearestAdvisory = findNearest(advisorySpeeds, advisoryInput);

  const rowData = tableRows.find((row) => row.posted === nearestPosted);
  const advisoryIndex = advisorySpeeds.indexOf(nearestAdvisory);
  const overrideKey = `${nearestPosted}-${nearestAdvisory}`;
  let distance = manualOverrides[overrideKey] ?? rowData?.values[advisoryIndex];
  if (distance == null && rowData) {
    distance = interpolateDistance(rowData, advisoryIndex);
  }

  updateTableHighlight(nearestPosted, nearestAdvisory);

  if (distance == null) {
    resultEl.textContent = 'N/A';
    contextEl.textContent = `No table value for posted ${nearestPosted} mph and advisory ${nearestAdvisory} mph. Try a lower advisory speed or use the formula mode.`;
    return;
  }

  resultEl.textContent = `${distance} ft`;
  const roundingNote = postedInput === nearestPosted && advisoryInput === nearestAdvisory
    ? ''
    : ` (rounded to ${nearestPosted}/${nearestAdvisory} mph)`;
  contextEl.textContent = `Condition B placement from Table 2-1 for posted ${nearestPosted} mph and advisory ${nearestAdvisory} mph${roundingNote}. Condition A (heavy traffic) at ${rowData.conditionA} ft shown in the yellow column.`;
}

function runCalculation() {
  if (currentMode === 'table') {
    calculateTableLookup();
  } else {
    calculateFormula();
  }
}

function wireModeToggle() {
  const toggle = document.getElementById('modeToggle');
  toggle.addEventListener('change', (e) => setMode(e.target.checked ? 'table' : 'formula'));
}

document.addEventListener('DOMContentLoaded', () => {
  buildTable();
  wireModeToggle();
  setMode('formula');
});

// keep legacy name for inline handlers if any remain
function calculateDistance() {
  calculateFormula();
}
