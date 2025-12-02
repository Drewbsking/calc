const g = 32.2; // ft/s^2

const entranceData = {
  square: {
    label: 'square edge projecting',
    ke: 0.5,
    cw: 3.1,
    cd: 0.62,
  },
  headwall: {
    label: 'headwall flush',
    ke: 0.2,
    cw: 3.2,
    cd: 0.68,
  },
  mitered: {
    label: 'mitered to slope',
    ke: 0.7,
    cw: 3.0,
    cd: 0.6,
  },
  rounded: {
    label: 'rounded/beveled',
    ke: 0.2,
    cw: 3.33,
    cd: 0.75,
  },
};

const controlDescriptions = {
  inlet: 'Inlet control: the entrance is the bottleneck, so once water ponds at the face the barrel and tailwater matter less.',
  outlet: 'Outlet control: the whole system (entrance, barrel friction, tailwater) governs, so headwater must overcome those downstream losses.',
};

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '–';
  return Number(value).toFixed(digits);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('culvert-form');
  const shapeSelect = document.getElementById('shape');
  const shapeFields = document.querySelectorAll('.shape-field');
  const lengthInput = document.getElementById('length');
  const slopeInput = document.getElementById('slope');
  const slopeUnitsSelect = document.getElementById('slopeUnits');
  const gradeDropSpan = document.getElementById('gradeDrop');
  const upstreamInvertInput = document.getElementById('upstreamInvert');
  const outletInvertSpan = document.getElementById('outletInvert');
  const tailwaterDepthInput = document.getElementById('tailwaterDepth');
  const tailwaterElevationSpan = document.getElementById('tailwaterElevation');
  const entranceTypeSelect = document.getElementById('entranceType');
  const keInput = document.getElementById('ke');
  const coeffNote = document.getElementById('coeff-note');
  const resultsPanel = document.getElementById('results-panel');

  function updateShapeFields() {
    const shape = shapeSelect.value;
    shapeFields.forEach((field) => {
      if (field.dataset.shape === shape) {
        field.classList.add('active');
      } else {
        field.classList.remove('active');
      }
    });
  }

  function getEntranceCoefficients() {
    const data = entranceData[entranceTypeSelect.value] || entranceData.square;
    keInput.value = data.ke;
    coeffNote.textContent = `Weir/orifice coefficients: Cw = ${data.cw.toFixed(2)}, Cd = ${data.cd.toFixed(2)} (${data.label}).`;
    return data;
  }

  function getSlopeDecimal() {
    const slopeValue = parseFloat(slopeInput.value);
    if (!Number.isFinite(slopeValue)) return null;
    if (slopeUnitsSelect.value === 'percent') {
      return slopeValue / 100;
    }
    return slopeValue;
  }

  function computeGradeDrop() {
    const length = parseFloat(lengthInput.value);
    if (!Number.isFinite(length) || length <= 0) return 0;
    const slopeDecimal = getSlopeDecimal();
    if (!Number.isFinite(slopeDecimal)) return 0;
    return slopeDecimal * length;
  }

  function updateDerivedValues() {
    const drop = computeGradeDrop();
    gradeDropSpan.textContent = `${formatNumber(drop)} ft`;
    const z1 = parseFloat(upstreamInvertInput.value);
    const z2 = Number.isFinite(z1) ? z1 - drop : undefined;
    outletInvertSpan.textContent = Number.isFinite(z2) ? `${formatNumber(z2)} ft` : '–';
    const tailDepth = parseFloat(tailwaterDepthInput.value);
    const tw = Number.isFinite(z2) ? z2 + (Number.isFinite(tailDepth) ? tailDepth : 0) : undefined;
    tailwaterElevationSpan.textContent = Number.isFinite(tw) ? `${formatNumber(tw)} ft` : '–';
  }

  function getDimensions() {
    const shape = shapeSelect.value;
    if (shape === 'circular') {
      const diameter = parseFloat(document.getElementById('diameter').value);
      if (!Number.isFinite(diameter) || diameter <= 0) {
        return null;
      }
      const area = Math.PI * (diameter ** 2) / 4;
      const perimeter = Math.PI * diameter;
      return {
        area,
        perimeter,
        span: diameter,
        rise: diameter,
        label: `${formatNumber(diameter)} ft circular`,
      };
    }
    const width = parseFloat(document.getElementById('boxWidth').value);
    const height = parseFloat(document.getElementById('boxHeight').value);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    const area = width * height;
    const perimeter = 2 * (width + height);
    return {
      area,
      perimeter,
      span: width,
      rise: height,
      label: `${formatNumber(width)} ft × ${formatNumber(height)} ft box`,
    };
  }

  function computeInletHeadwater(Q, dims, coeffs) {
    const weirC = coeffs.cw || 3.1;
    const orificeC = coeffs.cd || 0.62;
    const span = Math.max(dims.span, 0.01);
    const area = Math.max(dims.area, 0.01);
    const rise = Math.max(dims.rise || 0, 0.01);

    const weirDepth = Math.pow(Math.max(Q, 0) / (weirC * span), 2 / 3);
    const orificeCenterHead = Math.pow(Math.max(Q, 0) / (orificeC * area), 2) / (2 * g);
    const orificeDepth = orificeCenterHead + rise / 2;

    const weirValid = weirDepth <= rise;
    if (!weirValid) {
      return { head: orificeDepth, mode: 'orifice' };
    }

    if (orificeDepth > weirDepth) {
      return { head: orificeDepth, mode: 'orifice' };
    }

    return { head: weirDepth, mode: 'weir' };
  }

  function computeFullFlowCapacity(dims, manning, slopeDecimal) {
    if (!Number.isFinite(manning) || manning <= 0) return NaN;
    if (!Number.isFinite(slopeDecimal) || slopeDecimal <= 0) return NaN;
    const area = dims.area;
    const perimeter = dims.perimeter;
    if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(perimeter) || perimeter <= 0) return NaN;
    const hydraulicRadius = area / perimeter;
    return (1.486 / manning) * area * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slopeDecimal);
  }

  function computeOutletHeadwater(options) {
    const { Q, dims, length, drop, tailwaterDepth, ke, manning } = options;
    const area = dims.area;
    const perimeter = dims.perimeter;
    if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(perimeter) || perimeter <= 0) {
      return { head: NaN, velocity: NaN, he: NaN, hf: NaN, velocityHead: NaN };
    }
    const velocity = Q / area;
    const velocityHead = (velocity ** 2) / (2 * g);
    const entranceLoss = ke * velocityHead;
    const hydraulicRadius = area / perimeter;
    const manningFactor = Math.pow((Q * manning) / (1.486 * area * Math.pow(hydraulicRadius, 2 / 3)), 2);
    const frictionLoss = manningFactor * length;
    const deltaZ = -drop; // z2 - z1
    const head = Math.max(0, deltaZ + tailwaterDepth + entranceLoss + frictionLoss + velocityHead);
    return {
      head,
      velocity,
      he: entranceLoss,
      hf: frictionLoss,
      velocityHead,
    };
  }

  function buildStatusLines({ headwaterElevation, roadwayElevation, ratio, ratioLimit }) {
    const lines = [];
    if (Number.isFinite(roadwayElevation) && Number.isFinite(headwaterElevation)) {
      const diff = roadwayElevation - headwaterElevation;
      const magnitude = Math.abs(diff);
      if (diff >= 0) {
        lines.push(`✅ No overtopping – HW is ${formatNumber(magnitude)} ft below the roadway.`);
      } else {
        lines.push(`⚠️ Potential overtopping – HW is ${formatNumber(magnitude)} ft above the roadway.`);
      }
    }
    if (Number.isFinite(ratioLimit) && Number.isFinite(ratio)) {
      if (ratio <= ratioLimit) {
        lines.push(`✅ HW/Rise = ${formatNumber(ratio)} (≤ ${ratioLimit}).`);
      } else {
        lines.push(`⚠️ HW/Rise = ${formatNumber(ratio)} (> ${ratioLimit}).`);
      }
    } else if (Number.isFinite(ratio)) {
      lines.push(`HW/Rise = ${formatNumber(ratio)}.`);
    }
    return lines;
  }

  function showError(message) {
    resultsPanel.innerHTML = `<div class="result-card"><p>${message}</p></div>`;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const flow = parseFloat(document.getElementById('flow').value);
    const dims = getDimensions();
    const length = parseFloat(lengthInput.value);
    if (!Number.isFinite(flow) || flow <= 0) {
      showError('Please enter a flow rate greater than zero.');
      return;
    }
    if (!dims) {
      showError('Provide full geometry for the selected culvert shape.');
      return;
    }
    if (!Number.isFinite(length) || length <= 0) {
      showError('Enter a positive barrel length.');
      return;
    }

    const drop = computeGradeDrop();
    const coeffs = entranceData[entranceTypeSelect.value] || entranceData.square;
    const ke = parseFloat(keInput.value);
    const manning = parseFloat(document.getElementById('manningN').value);
    const tailwaterDepth = parseFloat(tailwaterDepthInput.value) || 0;
    const upstreamInvert = parseFloat(upstreamInvertInput.value);
    const roadwayElevation = parseFloat(document.getElementById('roadwayElevation').value);
    const ratioLimit = parseFloat(document.getElementById('maxRatio').value);

    const slopeDecimal = getSlopeDecimal();
    const inletResult = computeInletHeadwater(flow, dims, coeffs);
    const outletResult = computeOutletHeadwater({
      Q: flow,
      dims,
      length,
      drop,
      tailwaterDepth,
      ke: Number.isFinite(ke) ? ke : (coeffs.ke || 0.5),
      manning: Number.isFinite(manning) ? manning : 0.012,
    });
    const fullFlowCapacity = computeFullFlowCapacity(
      dims,
      Number.isFinite(manning) ? manning : 0.012,
      slopeDecimal,
    );

    const control = inletResult.head >= outletResult.head ? 'inlet' : 'outlet';
    const headwaterDepth = control === 'inlet' ? inletResult.head : outletResult.head;
    const headwaterElevation = Number.isFinite(upstreamInvert) ? upstreamInvert + headwaterDepth : NaN;
    const ratio = dims.rise ? headwaterDepth / dims.rise : NaN;
    const statusLines = buildStatusLines({ headwaterElevation, roadwayElevation, ratio, ratioLimit });
    const controlDescription = controlDescriptions[control] || '';

    const capacityLine = Number.isFinite(fullFlowCapacity)
      ? `Full-barrel capacity at this slope ≈ ${formatNumber(fullFlowCapacity)} cfs (${fullFlowCapacity >= flow ? '≥' : '<'} design flow).`
      : 'Provide slope and Manning n to check the barrel capacity.';

    const summaryCard = `
      <div class="result-card">
        <span class="control-pill ${control}">${control} control</span>
        <h3>Headwater depth = ${formatNumber(headwaterDepth)} ft</h3>
        ${controlDescription ? `<p class="control-note">${controlDescription}</p>` : ''}
        <p><strong>Headwater elevation:</strong> ${Number.isFinite(headwaterElevation) ? `${formatNumber(headwaterElevation)} ft` : 'Provide z₁ to compute elevation'}</p>
        <p><strong>Culvert geometry:</strong> ${dims.label}</p>
        <p><strong>HW ÷ rise:</strong> ${Number.isFinite(ratio) ? formatNumber(ratio) : '–'}</p>
        <p><strong>Capacity check:</strong> ${capacityLine}</p>
        ${statusLines.map((line) => `<p class="status-line ${line.startsWith('⚠️') ? 'warn' : 'safe'}">${line}</p>`).join('')}
      </div>
    `;

    const comparisonCards = `
      <div class="results-grid">
        <div class="result-card">
          <h4>Inlet control</h4>
          <p><strong>HW<sub>in</sub>:</strong> ${formatNumber(inletResult.head)} ft</p>
          <p>Mode: ${inletResult.mode === 'weir' ? 'Weir-like' : 'Orifice-like'}</p>
        </div>
        <div class="result-card">
          <h4>Outlet control</h4>
          <p><strong>HW<sub>out</sub>:</strong> ${formatNumber(outletResult.head)} ft</p>
          <p>Tailwater depth: ${formatNumber(tailwaterDepth)} ft</p>
        </div>
      </div>
    `;

    const detailTable = `
      <table class="details-table">
        <thead>
          <tr>
            <th>Detail</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Barrel velocity</td><td>${formatNumber(outletResult.velocity)} ft/s</td></tr>
          <tr><td>Entrance loss h<sub>e</sub></td><td>${formatNumber(outletResult.he)} ft</td></tr>
          <tr><td>Friction loss h<sub>f</sub></td><td>${formatNumber(outletResult.hf)} ft</td></tr>
          <tr><td>Velocity head V²/2g</td><td>${formatNumber(outletResult.velocityHead)} ft</td></tr>
          <tr><td>Barrel elevation drop (z₁ - z₂)</td><td>${formatNumber(drop)} ft</td></tr>
        </tbody>
      </table>
    `;

    resultsPanel.innerHTML = summaryCard + comparisonCards + detailTable;
  }

  updateShapeFields();
  getEntranceCoefficients();
  updateDerivedValues();

  shapeSelect.addEventListener('change', updateShapeFields);
  entranceTypeSelect.addEventListener('change', getEntranceCoefficients);
  [lengthInput, slopeInput, upstreamInvertInput, tailwaterDepthInput].forEach((input) => {
    input.addEventListener('input', updateDerivedValues);
  });
  slopeUnitsSelect.addEventListener('change', updateDerivedValues);
  form.addEventListener('submit', handleSubmit);
});
