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

const flowTypeDetails = {
  1: {
    type: 1,
    label: 'Unsubmerged free outfall',
    description: 'Tailwater is at/below the outlet invert so the barrel runs supercritical out the end.',
  },
  2: {
    type: 2,
    label: 'Unsubmerged inlet with tailwater pushback',
    description: 'Inlet stays free but tailwater rises against the outlet, often causing a hydraulic jump.',
  },
  3: {
    type: 3,
    label: 'Submerged inlet, free outlet',
    description: 'Headwater drowns the entrance while the outlet still discharges freely.',
  },
  4: {
    type: 4,
    label: 'Both inlet and outlet partly submerged',
    description: 'Tailwater reaches into the barrel (between invert and crown) while the inlet is submerged.',
  },
  5: {
    type: 5,
    label: 'Both ends submerged, barrel not pressurized',
    description: 'Tailwater is over the crown but the barrel has not gone fully pressurized yet.',
  },
  6: {
    type: 6,
    label: 'Pressurized/full flow',
    description: 'Headwater and tailwater submerge the whole barrel so the system behaves like full-pipe flow.',
  },
};

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '–';
  return Number(value).toFixed(digits);
}

function getCircularSectionProps(radius, depth) {
  const clampedDepth = Math.max(0, Math.min(depth, radius * 2));
  if (clampedDepth === 0) {
    return { area: 0, topWidth: 0, wettedPerimeter: 0 };
  }
  if (clampedDepth === radius * 2) {
    return {
      area: Math.PI * (radius ** 2),
      topWidth: 0,
      wettedPerimeter: 2 * Math.PI * radius,
    };
  }
  const theta = 2 * Math.acos((radius - clampedDepth) / radius);
  const area = (radius ** 2 / 2) * (theta - Math.sin(theta));
  const topWidth = 2 * Math.sqrt(clampedDepth * (2 * radius - clampedDepth));
  const wettedPerimeter = radius * theta;
  return { area, topWidth, wettedPerimeter };
}

function getRectangularSectionProps(width, depth, rise) {
  const clampedDepth = Math.max(0, Math.min(depth, rise));
  return {
    area: width * clampedDepth,
    topWidth: width,
    wettedPerimeter: width + 2 * clampedDepth,
  };
}

function getSectionProps(shape, dims, depth) {
  if (!dims) return { area: 0, topWidth: 0, wettedPerimeter: 0 };
  if (shape === 'circular') {
    return getCircularSectionProps(dims.rise / 2, depth);
  }
  const width = dims.span || dims.rise;
  return getRectangularSectionProps(width, depth, dims.rise);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('culvert-form');
  const shapeSelect = document.getElementById('shape');
  const shapeFields = document.querySelectorAll('.shape-field');
  const diameterInput = document.getElementById('diameter');
  const boxWidthInput = document.getElementById('boxWidth');
  const boxHeightInput = document.getElementById('boxHeight');
  const squareSizeInput = document.getElementById('squareSize');
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
  const manningInput = document.getElementById('manningN');
  const roadwayInput = document.getElementById('roadwayElevation');
  const maxRatioInput = document.getElementById('maxRatio');
  const targetHeadwaterInput = document.getElementById('targetHeadwater');
  const sizeButton = document.getElementById('size-button');
  const resultsPanel = document.getElementById('results-panel');
  const designPanel = document.getElementById('design-panel');

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

  function createCircularDimensions(diameter) {
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

  function createBoxDimensions(width, height) {
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

  function computeCriticalDepth(Q, dims, shape) {
    if (!Number.isFinite(Q) || Q <= 0 || !dims || !Number.isFinite(dims.rise) || dims.rise <= 0) {
      return NaN;
    }
    const gLocal = g;
    const maxDepth = dims.rise;
    const tolerance = 1e-3;
    const maxIterations = 40;
    let low = 1e-4;
    let high = maxDepth - 1e-4;
    let depth = NaN;
    let resultDepth = NaN;
    for (let i = 0; i < maxIterations; i += 1) {
      depth = 0.5 * (low + high);
      if (depth <= 0 || depth >= maxDepth) break;
      const { area, topWidth } = getSectionProps(shape, dims, depth);
      if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(topWidth) || topWidth <= 0) {
        break;
      }
      const froudeTerm = (Q ** 2) * topWidth / (gLocal * (area ** 3));
      const diff = froudeTerm - 1;
      resultDepth = depth;
      if (Math.abs(diff) < tolerance) {
        return depth;
      }
      if (diff > 0) {
        low = depth;
      } else {
        high = depth;
      }
    }
    return resultDepth;
  }

  function computeNormalDepth(Q, dims, shape, slopeDecimal, manning) {
    if (!Number.isFinite(Q) || Q <= 0 || !dims || !Number.isFinite(dims.rise) || dims.rise <= 0) {
      return NaN;
    }
    if (!Number.isFinite(slopeDecimal) || slopeDecimal <= 0) return NaN;
    if (!Number.isFinite(manning) || manning <= 0) return NaN;
    const rise = dims.rise;
    const tolerance = 1e-3;
    const maxIterations = 50;
    const minDepth = 1e-4;
    const maxDepth = rise - 1e-4;
    const capacityAtMaxProps = getSectionProps(shape, dims, maxDepth);
    if (!capacityAtMaxProps || capacityAtMaxProps.wettedPerimeter <= 0) return NaN;
    const hydraulicRadiusMax = capacityAtMaxProps.area / capacityAtMaxProps.wettedPerimeter;
    const capacityAtMax = (1.486 / manning)
      * capacityAtMaxProps.area
      * Math.pow(hydraulicRadiusMax, 2 / 3)
      * Math.sqrt(slopeDecimal);
    if (!Number.isFinite(capacityAtMax) || capacityAtMax < Q) {
      return NaN;
    }
    let low = minDepth;
    let high = maxDepth;
    let depth = NaN;
    let resultDepth = NaN;
    for (let i = 0; i < maxIterations; i += 1) {
      depth = 0.5 * (low + high);
      const { area, wettedPerimeter } = getSectionProps(shape, dims, depth);
      if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(wettedPerimeter) || wettedPerimeter <= 0) {
        break;
      }
      const hydraulicRadius = area / wettedPerimeter;
      const capacity = (1.486 / manning) * area * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slopeDecimal);
      if (!Number.isFinite(capacity)) break;
      const diff = capacity - Q;
      resultDepth = depth;
      if (Math.abs(diff) < tolerance) {
        return depth;
      }
      if (diff > 0) {
        high = depth;
      } else {
        low = depth;
      }
    }
    return resultDepth;
  }

  function getDimensions() {
    const shape = shapeSelect.value;
    if (shape === 'circular') {
      const diameter = parseFloat(diameterInput.value);
      return createCircularDimensions(diameter);
    }
    if (shape === 'square') {
      const side = parseFloat(squareSizeInput.value);
      return createBoxDimensions(side, side);
    }
    const width = parseFloat(boxWidthInput.value);
    const height = parseFloat(boxHeightInput.value);
    return createBoxDimensions(width, height);
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
    const { Q, dims, length, drop, tailwaterDepth, ke, manning, shape } = options;
    const area = dims.area;
    const perimeter = dims.perimeter;
    if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(perimeter) || perimeter <= 0) {
      return { head: NaN, velocity: NaN, he: NaN, hf: NaN, velocityHead: NaN, hydraulicRadius: NaN };
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
      hydraulicRadius,
    };
  }

  function evaluateScenario({
    flow,
    dims,
    length,
    drop,
    tailwaterDepth,
    ke,
    manning,
    upstreamInvert,
    slopeDecimal,
    coeffs,
    shape,
  }) {
    const inletResult = computeInletHeadwater(flow, dims, coeffs);
    const outletResult = computeOutletHeadwater({
      Q: flow,
      dims,
      length,
      drop,
      tailwaterDepth,
      ke,
      manning,
      shape,
    });
    const control = inletResult.head >= outletResult.head ? 'inlet' : 'outlet';
    const headwaterDepth = control === 'inlet' ? inletResult.head : outletResult.head;
    const headwaterElevation = Number.isFinite(upstreamInvert) ? upstreamInvert + headwaterDepth : NaN;
    const ratio = dims.rise ? headwaterDepth / dims.rise : NaN;
    const fullFlowCapacity = computeFullFlowCapacity(
      dims,
      manning,
      slopeDecimal,
    );
    const criticalDepth = computeCriticalDepth(flow, dims, shape);
    const normalDepth = computeNormalDepth(flow, dims, shape, slopeDecimal, manning);
    return {
      inletResult,
      outletResult,
      control,
      headwaterDepth,
      headwaterElevation,
      ratio,
      fullFlowCapacity,
      criticalDepth,
      normalDepth,
    };
  }

  function determineFlowType({
    dims,
    headwaterDepth,
    tailwaterDepth,
    flow,
    fullFlowCapacity,
    drop,
    criticalDepth,
  }) {
    if (!dims) return { type: null, label: '', description: '' };
    const rise = Math.max(dims.rise || 0, 0.001);
    const inletSubmerged = Number.isFinite(headwaterDepth) && headwaterDepth >= rise - 0.01;
    const tailwater = Number.isFinite(tailwaterDepth) ? tailwaterDepth : 0;
    const tailwaterAboveCritical = Number.isFinite(criticalDepth)
      ? tailwater >= criticalDepth - 0.01
      : false;
    const tailOverCrown = tailwater >= rise - 0.01;
    const pressurizedByEnergy = inletSubmerged && Number.isFinite(drop) && headwaterDepth >= drop;
    const pressurized = inletSubmerged && (tailOverCrown || pressurizedByEnergy);

    if (!inletSubmerged && !tailwaterAboveCritical) {
      return flowTypeDetails[1];
    }
    if (!inletSubmerged && tailwaterAboveCritical && !pressurized) {
      return flowTypeDetails[2];
    }
    if (inletSubmerged && !tailwaterAboveCritical && !pressurizedByEnergy) {
      return flowTypeDetails[3];
    }
    if (inletSubmerged && tailwaterAboveCritical && !tailOverCrown && !pressurized) {
      return flowTypeDetails[4];
    }
    if (inletSubmerged && tailOverCrown && !pressurizedByEnergy) {
      return flowTypeDetails[5];
    }
    return flowTypeDetails[6] || { type: null, label: 'Need more info', description: 'Add tailwater depth to classify the flow type.' };
  }

  function computeHeadLimitedDischarge({
    headwaterAboveCrown,
    drop,
    dims,
    tailwaterDepth,
    ke,
    manning,
    length,
  }) {
    if (!Number.isFinite(headwaterAboveCrown) || headwaterAboveCrown <= 0) return null;
    if (!dims || !Number.isFinite(dims.area) || dims.area <= 0 || !Number.isFinite(dims.perimeter) || dims.perimeter <= 0) {
      return null;
    }
    const tailDepth = Number.isFinite(tailwaterDepth) ? tailwaterDepth : 0;
    const availableHead = headwaterAboveCrown + (Number.isFinite(drop) ? drop : 0) - tailDepth;
    if (!Number.isFinite(availableHead) || availableHead <= 0) {
      return null;
    }
    const hydraulicRadius = dims.area / dims.perimeter;
    if (!Number.isFinite(hydraulicRadius) || hydraulicRadius <= 0) return null;
    const keValue = Number.isFinite(ke) ? ke : 0.5;
    const manningValue = Number.isFinite(manning) ? manning : 0.012;
    const lengthValue = Number.isFinite(length) ? length : 0;
    const frictionTerm = ((manningValue ** 2) * lengthValue) / (2.21 * Math.pow(hydraulicRadius, 4 / 3));
    const denominator = ((1 + keValue) / (2 * g)) + frictionTerm;
    if (!Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }
    const velocity = Math.sqrt(availableHead / denominator);
    const discharge = velocity * dims.area;
    return {
      availableHead,
      velocity,
      discharge,
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

  function renderDesignMessage(message) {
    if (designPanel) {
      designPanel.innerHTML = `<div class="result-card"><p>${message}</p></div>`;
    }
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
    const manning = parseFloat(manningInput.value);
    const tailwaterDepth = Number.isFinite(parseFloat(tailwaterDepthInput.value))
      ? parseFloat(tailwaterDepthInput.value)
      : 0;
    const upstreamInvert = parseFloat(upstreamInvertInput.value);
    const roadwayElevation = parseFloat(roadwayInput.value);
    const ratioLimit = parseFloat(maxRatioInput.value);
    const headwaterLimitAboveCrown = parseFloat(targetHeadwaterInput.value);

    const slopeDecimal = getSlopeDecimal();
    const shapeValue = shapeSelect.value;
    const scenario = evaluateScenario({
      flow,
      dims,
      length,
      drop,
      tailwaterDepth,
      ke: Number.isFinite(ke) ? ke : (coeffs.ke || 0.5),
      manning: Number.isFinite(manning) ? manning : 0.012,
      upstreamInvert,
      slopeDecimal,
      coeffs,
      shape: shapeValue,
    });
    const {
      inletResult,
      outletResult,
      control,
      headwaterDepth,
      headwaterElevation,
      ratio,
      fullFlowCapacity,
    } = scenario;
    const statusLines = buildStatusLines({ headwaterElevation, roadwayElevation, ratio, ratioLimit });
    const controlDescription = controlDescriptions[control] || '';
    const flowTypeInfo = determineFlowType({
      dims,
      headwaterDepth,
      tailwaterDepth,
      flow,
      fullFlowCapacity,
      drop,
      criticalDepth: scenario.criticalDepth,
    });
    const headLimitedResult = computeHeadLimitedDischarge({
      headwaterAboveCrown: headwaterLimitAboveCrown,
      drop,
      dims,
      tailwaterDepth,
      ke: Number.isFinite(ke) ? ke : (coeffs.ke || 0.5),
      manning: Number.isFinite(manning) ? manning : 0.012,
      length,
    });
    const criticalDepthLine = Number.isFinite(scenario.criticalDepth)
      ? `${formatNumber(scenario.criticalDepth)} ft`
      : '–';
    const normalDepthLine = Number.isFinite(scenario.normalDepth)
      ? `${formatNumber(scenario.normalDepth)} ft`
      : '–';
    const velocityLine = Number.isFinite(outletResult.velocity)
      ? `${formatNumber(outletResult.velocity)} ft/s`
      : '–';
    const hydraulicRadiusLine = Number.isFinite(outletResult.hydraulicRadius)
      ? `${formatNumber(outletResult.hydraulicRadius)} ft`
      : '–';
    const areaLine = Number.isFinite(dims.area)
      ? `${formatNumber(dims.area)} ft²`
      : '–';
    const flowLine = Number.isFinite(flow)
      ? `${formatNumber(flow)} cfs`
      : '–';
    const outletHeadLine = Number.isFinite(outletResult.head)
      ? `${formatNumber(outletResult.head)} ft`
      : '–';

    const capacityLine = Number.isFinite(fullFlowCapacity)
      ? `Full-barrel capacity at this slope ≈ ${formatNumber(fullFlowCapacity)} cfs (${fullFlowCapacity >= flow ? '≥' : '<'} design flow).`
      : 'Provide slope and Manning n to check the barrel capacity.';

    const flowTypeLine = flowTypeInfo.type
      ? `<p><strong>Flow type:</strong> Type ${flowTypeInfo.type} – ${flowTypeInfo.label}${flowTypeInfo.description ? `<span class="flow-type-note">${flowTypeInfo.description}</span>` : ''}</p>`
      : '<p><strong>Flow type:</strong> Add tailwater depth to classify.</p>';
    const headIterationLine = headLimitedResult
      ? `<p><strong>Head-limited iteration:</strong> H = ${formatNumber(headLimitedResult.availableHead)} ft, v = ${formatNumber(headLimitedResult.velocity)} ft/s, Q = ${formatNumber(headLimitedResult.discharge)} cfs.</p>`
      : '';

    const summaryCard = `
      <div class="result-card">
        <span class="control-pill ${control}">${control} control</span>
        <h3>Headwater depth = ${formatNumber(headwaterDepth)} ft</h3>
        ${controlDescription ? `<p class="control-note">${controlDescription}</p>` : ''}
        <p><strong>Headwater elevation:</strong> ${Number.isFinite(headwaterElevation) ? `${formatNumber(headwaterElevation)} ft` : 'Provide z₁ to compute elevation'}</p>
        <p><strong>Culvert geometry:</strong> ${dims.label}</p>
        <p><strong>Flow Q:</strong> ${flowLine}</p>
        <p><strong>Area:</strong> ${areaLine}</p>
        <p><strong>Outlet head H<sub>out</sub>:</strong> ${outletHeadLine}</p>
        <p><strong>Barrel velocity:</strong> ${velocityLine}</p>
        <p><strong>Hydraulic radius:</strong> ${hydraulicRadiusLine}</p>
        <p><strong>Critical depth:</strong> ${criticalDepthLine}</p>
        <p><strong>Normal depth:</strong> ${normalDepthLine}</p>
        ${flowTypeLine}
        <p><strong>HW ÷ rise:</strong> ${Number.isFinite(ratio) ? formatNumber(ratio) : '–'}</p>
        <p><strong>Capacity check:</strong> ${capacityLine}</p>
        ${headIterationLine}
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

  function handleSizeSolve() {
    const headwaterAboveCrown = parseFloat(targetHeadwaterInput.value);
    if (!Number.isFinite(headwaterAboveCrown) || headwaterAboveCrown <= 0) {
      renderDesignMessage('Enter a positive headwater allowance above the crown (ft) before solving for size.');
      return;
    }
    const flow = parseFloat(document.getElementById('flow').value);
    if (!Number.isFinite(flow) || flow <= 0) {
      renderDesignMessage('Provide a design flow rate before solving for size.');
      return;
    }
    const length = parseFloat(lengthInput.value);
    if (!Number.isFinite(length) || length <= 0) {
      renderDesignMessage('Enter a positive barrel length before solving for size.');
      return;
    }
    const drop = computeGradeDrop();
    const coeffs = entranceData[entranceTypeSelect.value] || entranceData.square;
    const ke = parseFloat(keInput.value);
    const manning = parseFloat(manningInput.value);
    const tailwaterDepth = Number.isFinite(parseFloat(tailwaterDepthInput.value))
      ? parseFloat(tailwaterDepthInput.value)
      : 0;
    const upstreamInvert = parseFloat(upstreamInvertInput.value);
    const slopeDecimal = getSlopeDecimal();
    const shape = shapeSelect.value;
    let fixedWidth = null;
    const isSquare = shape === 'square';
    if (shape === 'box') {
      fixedWidth = parseFloat(boxWidthInput.value);
      if (!Number.isFinite(fixedWidth) || fixedWidth <= 0) {
        renderDesignMessage('Enter a box width so the solver can size the height.');
        return;
      }
    }
    const baseDims = getDimensions();
    const minRise = 0.5;
    const step = 0.5;
    const maxRise = 30;
    const keValue = Number.isFinite(ke) ? ke : (coeffs.ke || 0.5);
    const manningValue = Number.isFinite(manning) ? manning : 0.012;

    const evaluateForRise = (rise) => {
      const dimsCandidate = (() => {
        if (shape === 'circular') return createCircularDimensions(rise);
        if (isSquare) return createBoxDimensions(rise, rise);
        return createBoxDimensions(fixedWidth, rise);
      })();
      if (!dimsCandidate) return null;
      const limitDepth = headwaterAboveCrown + (Number.isFinite(dimsCandidate.rise) ? dimsCandidate.rise : 0);
      const scenario = evaluateScenario({
        flow,
        dims: dimsCandidate,
        length,
        drop,
        tailwaterDepth,
        ke: keValue,
        manning: manningValue,
        upstreamInvert,
        slopeDecimal,
        coeffs,
        shape,
      });
      if (!Number.isFinite(scenario.headwaterDepth)) {
        return null;
      }
      const headLimited = computeHeadLimitedDischarge({
        headwaterAboveCrown,
        drop,
        dims: dimsCandidate,
        tailwaterDepth,
        ke: keValue,
        manning: manningValue,
        length,
      });
      if (!headLimited) return null;
      return {
        dims: dimsCandidate,
        scenario,
        targetDepth: limitDepth,
        headLimited,
      };
    };

    let best = null;
    const startRise = baseDims && Number.isFinite(baseDims.rise)
      ? Math.max(minRise, Math.ceil(baseDims.rise / step) * step)
      : minRise;
    for (let rise = minRise; rise < startRise; rise += step) {
      const trial = evaluateForRise(rise);
      if (!trial) continue;
      if (
        Number.isFinite(trial.targetDepth)
        && trial.scenario.headwaterDepth <= trial.targetDepth
        && Number.isFinite(trial.headLimited.discharge)
        && trial.headLimited.discharge >= flow
      ) {
        best = trial;
        break;
      }
    }
    if (!best) {
      for (let rise = startRise; rise <= maxRise; rise += step) {
        const trial = evaluateForRise(rise);
        if (!trial) continue;
        if (
          Number.isFinite(trial.targetDepth)
          && trial.scenario.headwaterDepth <= trial.targetDepth
          && Number.isFinite(trial.headLimited.discharge)
          && trial.headLimited.discharge >= flow
        ) {
          best = trial;
          break;
        }
      }
    }

    if (!best) {
      renderDesignMessage('Unable to meet the headwater limit and flow requirement within the 0.5-ft inventory. Increase HW<sub>allow</sub> or adjust slope/length.');
      return;
    }

    const recommendedRise = best.dims.rise;
    const limitDepth = headwaterAboveCrown + (Number.isFinite(recommendedRise) ? recommendedRise : 0);
    let geometryLine;
    if (shape === 'circular') {
      geometryLine = `Recommended diameter ≈ ${formatNumber(recommendedRise)} ft`;
    } else if (isSquare) {
      geometryLine = `Recommended square side ≈ ${formatNumber(recommendedRise)} ft`;
    } else {
      geometryLine = `Recommended height ≈ ${formatNumber(recommendedRise)} ft (width held at ${formatNumber(fixedWidth)} ft)`;
    }
    const flowTypeInfo = determineFlowType({
      dims: best.dims,
      headwaterDepth: best.scenario.headwaterDepth,
      tailwaterDepth,
      flow,
      fullFlowCapacity: best.scenario.fullFlowCapacity,
      drop,
      criticalDepth: best.scenario.criticalDepth,
    });
    const flowTypeLine = flowTypeInfo.type
      ? `Type ${flowTypeInfo.type} – ${flowTypeInfo.label}${flowTypeInfo.description ? `<span class="flow-type-note">${flowTypeInfo.description}</span>` : ''}`
      : 'Add tailwater depth to classify.';
    const controlDescription = controlDescriptions[best.scenario.control] || '';
    const designCriticalLine = Number.isFinite(best.scenario.criticalDepth)
      ? `${formatNumber(best.scenario.criticalDepth)} ft`
      : '–';
    const designNormalLine = Number.isFinite(best.scenario.normalDepth)
      ? `${formatNumber(best.scenario.normalDepth)} ft`
      : '–';
    const designVelocityLine = best.scenario.outletResult && Number.isFinite(best.scenario.outletResult.velocity)
      ? `${formatNumber(best.scenario.outletResult.velocity)} ft/s`
      : '–';
    const designHydraulicRadiusLine = best.scenario.outletResult && Number.isFinite(best.scenario.outletResult.hydraulicRadius)
      ? `${formatNumber(best.scenario.outletResult.hydraulicRadius)} ft`
      : '–';
    const designAreaLine = Number.isFinite(best.dims.area)
      ? `${formatNumber(best.dims.area)} ft²`
      : '–';
    const designFlowLine = Number.isFinite(flow)
      ? `${formatNumber(flow)} cfs`
      : '–';
    const designOutletHeadLine = best.scenario.outletResult && Number.isFinite(best.scenario.outletResult.head)
      ? `${formatNumber(best.scenario.outletResult.head)} ft`
      : '–';

    const headLimitedDesign = best.headLimited
      || computeHeadLimitedDischarge({
        headwaterAboveCrown,
        drop,
        dims: best.dims,
        tailwaterDepth,
        ke: keValue,
        manning: manningValue,
        length,
      });
    const designHeadIterationLine = headLimitedDesign
      ? `<p><strong>Head-limited iteration:</strong> H = ${formatNumber(headLimitedDesign.availableHead)} ft, v = ${formatNumber(headLimitedDesign.velocity)} ft/s, Q = ${formatNumber(headLimitedDesign.discharge)} cfs.</p>`
      : '';

    designPanel.innerHTML = `
      <div class="result-card">
        <h3>${geometryLine}</h3>
        <p>Computed HW = ${formatNumber(best.scenario.headwaterDepth)} ft to satisfy HW<sub>allow</sub> = ${formatNumber(limitDepth)} ft (${best.scenario.control} control).</p>
        ${controlDescription ? `<p class="control-note">${controlDescription}</p>` : ''}
        <p><strong>Flow type:</strong> ${flowTypeLine}</p>
        <p><strong>Flow Q:</strong> ${designFlowLine}</p>
        <p><strong>Area:</strong> ${designAreaLine}</p>
        <p><strong>Outlet head H<sub>out</sub>:</strong> ${designOutletHeadLine}</p>
        <p><strong>Barrel velocity:</strong> ${designVelocityLine}</p>
        <p><strong>Hydraulic radius:</strong> ${designHydraulicRadiusLine}</p>
        <p><strong>Critical depth:</strong> ${designCriticalLine}</p>
        <p><strong>Normal depth:</strong> ${designNormalLine}</p>
        <p><strong>HW ÷ rise:</strong> ${Number.isFinite(best.scenario.ratio) ? formatNumber(best.scenario.ratio) : '–'}</p>
        <p><strong>Headwater elevation:</strong> ${Number.isFinite(best.scenario.headwaterElevation) ? `${formatNumber(best.scenario.headwaterElevation)} ft` : 'Enter z₁ to show elevation.'}</p>
        ${designHeadIterationLine}
      </div>
    `;
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
  if (sizeButton) {
    sizeButton.addEventListener('click', handleSizeSolve);
  }
});
