const bufferDistances = {
  20: 33,
  25: 50,
  30: 83,
  35: 132,
  40: 181,
  45: 230,
  50: 279,
  55: 329,
  60: 411,
  65: 476,
  70: 542,
  75: 625
};

const signDistances = {
  25: 250,
  30: 300,
  35: 350,
  40: 400,
  45: 450,
  50: 500,
  55: 550,
  60: 600,
  65: 650,
  70: 700,
  75: 750
};

document.addEventListener('DOMContentLoaded', () => {
  initModeToggle();
  attachEnterSubmit('simpleW', calculateSimpleTaper);
  attachEnterSubmit('advancedW', calculateAdvancedTaper);
  updateAdvancedWorkSpeedButtons(0);
});

function initModeToggle() {
  const modeButtons = document.querySelectorAll('.mode-button');
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => setCalculatorMode(button.dataset.mode));
  });
}

function setCalculatorMode(mode) {
  const modeButtons = document.querySelectorAll('.mode-button');
  const panels = document.querySelectorAll('.calculator-panel');
  modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
  panels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.mode !== mode);
  });
}

function attachEnterSubmit(inputId, handler) {
  const input = document.getElementById(inputId);
  if (input) {
    input.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        handler();
      }
    });
  }
}

function setSimpleSpeed(speed, buttonEl) {
  document.getElementById('simpleSpeed').value = speed;
  const buttons = document.querySelectorAll('.calculator-panel[data-mode="simple"] .speed-button');
  buttons.forEach((btn) => btn.classList.remove('selected'));
  if (buttonEl) {
    buttonEl.classList.add('selected');
  }
}

function calculateSimpleTaper() {
  const w = parseFloat(document.getElementById('simpleW').value);
  const s = parseFloat(document.getElementById('simpleSpeed').value);
  let formula;
  let l;

  if (Number.isNaN(w) || Number.isNaN(s) || w < 0 || s < 0) {
    alert('Please enter valid non-negative numbers for W and S');
    return;
  }

  if (s <= 40) {
    formula = 'Formula Used: L = (W * S^2) / 60 (Short)';
    l = (w * s * s) / 60;
  } else if (s >= 45) {
    formula = 'Formula Used: L = W * S (Long)';
    l = w * s;
  } else {
    alert('Speed must be 40 or below or 45 and above for these formulas.');
    return;
  }

  const designL = Math.ceil(l);
  const halfDesignL = designL / 2;
  const l2ShiftOnly = Math.round(halfDesignL / 5) * 5;

  document.getElementById('simpleResult').innerHTML = `
    ${formula}<br>
    Calculated L = ${l.toFixed(2)}${getRatioText(l, w)}<br>
    Design L = ${designL}${getRatioText(designL, w)}<br>
    L/2 Shift only* = ${l2ShiftOnly}${getRatioText(l2ShiftOnly, w)}
  `;
  document.getElementById('simpleNote').classList.remove('hidden');
}

function setAdvancedSpeed(type, speed, buttonEl) {
  if (type === 'posted') {
    if (speed === 40) {
      showSpeedDialog();
      return;
    }
    applyPostedSpeed(speed);
  } else if (type === 'work') {
    document.getElementById('advancedWorkSpeed').value = speed;
    updateAdvancedSpeedButtons('#workSpeedButtons', speed);
  }
}

function applyPostedSpeed(speed) {
  document.getElementById('advancedPostedSpeed').value = speed;
  updateAdvancedSpeedButtons('#postedSpeedButtons', speed);
  updateAdvancedWorkSpeedButtons(speed);
}

function showSpeedDialog() {
  document.getElementById('speedDialog').style.display = 'block';
}

function hideSpeedDialog() {
  document.getElementById('speedDialog').style.display = 'none';
}

function confirmAdvancedSpeed(speed) {
  hideSpeedDialog();
  applyPostedSpeed(speed);
}

function updateAdvancedSpeedButtons(containerSelector, speed) {
  const buttons = document.querySelectorAll(`${containerSelector} .speed-button`);
  buttons.forEach((button) => {
    button.classList.toggle('selected', parseInt(button.dataset.speed, 10) === speed);
  });
}

function updateAdvancedWorkSpeedButtons(postedSpeed) {
  const workSpeedButtons = document.getElementById('workSpeedButtons');
  if (!postedSpeed || postedSpeed <= 35) {
    workSpeedButtons.style.display = 'none';
    document.getElementById('advancedWorkSpeed').value = postedSpeed || 0;
    const buttons = workSpeedButtons.querySelectorAll('.speed-button');
    buttons.forEach((button) => button.classList.remove('selected'));
    return;
  }

  workSpeedButtons.style.display = 'flex';
  const workButtons = workSpeedButtons.querySelectorAll('.speed-button');
  workButtons.forEach((button) => {
    const buttonSpeed = parseInt(button.dataset.speed, 10);
    button.style.display = buttonSpeed > postedSpeed ? 'none' : 'block';
    if (buttonSpeed > postedSpeed) {
      button.classList.remove('selected');
    }
  });

  const currentWorkSpeed = parseFloat(document.getElementById('advancedWorkSpeed').value);
  if (!currentWorkSpeed || currentWorkSpeed > postedSpeed) {
    document.getElementById('advancedWorkSpeed').value = 0;
  }
}

function roundUpToNearestFive(value) {
  return Math.ceil(value / 5) * 5;
}

function calculateAdvancedTaper() {
  const w = parseFloat(document.getElementById('advancedW').value);
  const postedSpeed = parseFloat(document.getElementById('advancedPostedSpeed').value);
  let workSpeed = parseFloat(document.getElementById('advancedWorkSpeed').value);

  if (Number.isNaN(w) || Number.isNaN(postedSpeed) || w < 0 || postedSpeed < 0) {
    alert('Please enter valid non-negative numbers for W and Posted Speed');
    return;
  }

  if (!workSpeed || workSpeed < 0 || workSpeed > postedSpeed) {
    if (postedSpeed <= 35) {
      workSpeed = postedSpeed;
      document.getElementById('advancedWorkSpeed').value = workSpeed;
    } else {
      alert('Please select a valid work zone speed that is not greater than the posted speed.');
      return;
    }
  }

  const postedFormulaData = calculateTaperBySpeed(w, postedSpeed);
  const workFormulaData = calculateTaperBySpeed(w, workSpeed);

  const bufferDistance = bufferDistances[postedSpeed] || null;
  const bufferDistanceRounded = typeof bufferDistance === 'number' ? roundUpToNearestFive(bufferDistance) : null;
  const signDistance = typeof signDistances[postedSpeed] === 'number' ? signDistances[postedSpeed] : null;
  const bufferDistanceDisplay = bufferDistanceRounded !== null
    ? `${bufferDistanceRounded} feet${getRatioText(bufferDistanceRounded, w)}`
    : 'N/A';
  const signDistanceDisplay = signDistance !== null
    ? `${signDistance} feet${getRatioText(signDistance, w)}`
    : 'N/A';

  document.getElementById('advancedFormula').innerHTML = `
        <span>Formula Used: ${postedFormulaData.formula}, Calculated L: ${postedFormulaData.l.toFixed(2)}${getRatioText(postedFormulaData.l, w)}</span>
    `;
  document.getElementById('advancedFormulaDetails').innerHTML = `
        <p>W (width): ${w}</p>
        <p>Posted Speed: ${postedSpeed}</p>
        <p>Work Zone Speed: ${workSpeed}${postedSpeed <= 35 ? ' (same as posted speed for speeds <= 35 MPH)' : ''}</p>
    `;
  document.getElementById('advancedResult').innerHTML = `
        <table>
            <tr>
                <th>Type</th>
                <th>Posted Speed Minimum Values*</th>
                <th class="work-zone-speed">Work Zone Speed Minimum Values*</th>
            </tr>
            <tr>
                <td>Merging (L)<sup>*</sup></td>
                <td>${postedFormulaData.mergingL}${getRatioText(postedFormulaData.mergingL, w)}</td>
                <td class="work-zone-speed">${workFormulaData.mergingL}${getRatioText(workFormulaData.mergingL, w)}</td>
            </tr>
            <tr>
                <td>Shift (L/2)</td>
                <td>${postedFormulaData.shiftL}${getRatioText(postedFormulaData.shiftL, w)}</td>
                <td class="work-zone-speed">${workFormulaData.shiftL}${getRatioText(workFormulaData.shiftL, w)}</td>
            </tr>
            <tr>
                <td>Shoulder (L/3)</td>
                <td>${postedFormulaData.shoulderL}${getRatioText(postedFormulaData.shoulderL, w)}</td>
                <td class="work-zone-speed">${workFormulaData.shoulderL}${getRatioText(workFormulaData.shoulderL, w)}</td>
            </tr>
            <tr>
                <td>Buffer Distance (B)</td>
                <td colspan="2">RCOC standard is 200 ft (Calculated ${bufferDistanceDisplay})</td>
            </tr>
            <tr>
                <td>Sign Distance (D)</td>
                <td colspan="2">RCOC standard is 350 feet (Calculated ${signDistanceDisplay})</td>
            </tr>
        </table>
        <div class="note">
            *Values rounded up to the nearest multiple of 5. Sign distance (D) is an RCOC standard.<br>
            <sup>*</sup>Target arrows are not to be installed unless directed by the engineer.
        </div>
    `;
}

function calculateTaperBySpeed(width, speed) {
  let formula;
  let l;

  if (speed <= 40) {
    formula = 'L = (W * S^2) / 60 (Short)';
    l = (width * speed * speed) / 60;
  } else {
    formula = 'L = W * S (Long)';
    l = width * speed;
  }

  return {
    formula,
    l,
    mergingL: roundUpToNearestFive(Math.ceil(l)),
    shiftL: roundUpToNearestFive(l / 2),
    shoulderL: roundUpToNearestFive(l / 3)
  };
}

function getRatioText(length, width) {
  if (!width || width <= 0 || !Number.isFinite(length)) {
    return '';
  }
  const ratio = length / width;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return '';
  }
  const ratioValue = Number(ratio.toFixed(2));
  return ` (1:${ratioValue})`;
}
