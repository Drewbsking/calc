document.addEventListener('DOMContentLoaded', () => {
  const stationRows = document.getElementById('stationRows');
  const messageEl = document.getElementById('message');
  const volumeResultEl = document.getElementById('volumeResult');
  const breakdownEl = document.getElementById('breakdown');
  const shapeFieldsEl = document.getElementById('shapeFields');
  const shapeResultEl = document.getElementById('shapeResult');
  const averagePanelEl = document.getElementById('averageMethodPanel');
  const crossPanelEl = document.getElementById('crossMethodPanel');
  const modeButtons = Array.from(document.querySelectorAll('[data-method]'));

  const crossInputs = {
    a: document.getElementById('crossA'),
    b: document.getElementById('crossB'),
    c: document.getElementById('crossC'),
    d: document.getElementById('crossD'),
    base: document.getElementById('crossBase'),
  };
  const crossMessageEl = document.getElementById('crossMessage');
  const crossResultEl = document.getElementById('crossResult');
  const crossDetailsEl = document.getElementById('crossDetails');
  const averagePreviewSvgEl = document.getElementById('averagePreviewSvg');
  const averagePreviewMetaEl = document.getElementById('averagePreviewMeta');
  const crossPreviewSvgEl = document.getElementById('crossPreviewSvg');
  const crossPreviewMetaEl = document.getElementById('crossPreviewMeta');

  const exampleData = [
    { station: 0, area: 0 },
    { station: 200, area: 320 },
    { station: 400, area: 640 },
    { station: 600, area: 410 },
    { station: 800, area: 100 },
  ];

  const formatNumber = (value) => value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const shapeConfigs = {
    rectangle: {
      label: 'Rectangle',
      fields: [
        { name: 'width', label: 'Bottom width (ft)', min: 0 },
        { name: 'depth', label: 'Depth (ft)', min: 0 },
      ],
      area: ({ width, depth }) => ({
        area: width * depth,
      }),
    },
    trapezoid: {
      label: 'Trapezoid',
      fields: [
        { name: 'bottomWidth', label: 'Bottom width (ft)', min: 0 },
        { name: 'depth', label: 'Depth (ft)', min: 0 },
        { name: 'slope', label: 'Side slope (H:1)', min: 0 },
      ],
      area: ({ bottomWidth, depth, slope }) => {
        const topWidth = bottomWidth + 2 * depth * slope;
        return {
          area: ((bottomWidth + topWidth) / 2) * depth,
          topWidth,
        };
      },
    },
    triangle: {
      label: 'Triangle',
      fields: [
        { name: 'depth', label: 'Depth (ft)', min: 0 },
        { name: 'slope', label: 'Side slope (H:1)', min: 0 },
      ],
      area: ({ depth, slope }) => ({
        area: depth * depth * slope,
        topWidth: 2 * depth * slope,
      }),
    },
    circle: {
      label: 'Circle',
      fields: [
        { name: 'diameter', label: 'Diameter (ft)', min: 0 },
      ],
      area: ({ diameter }) => ({
        area: Math.PI * (diameter ** 2) / 4,
      }),
    },
  };

  const renderShapeFields = (shapeKey) => {
    const config = shapeConfigs[shapeKey];
    shapeFieldsEl.innerHTML = '';
    if (!config) return;

    config.fields.forEach((field) => {
      const wrapper = document.createElement('div');
      const label = document.createElement('label');
      label.textContent = field.label;
      label.setAttribute('for', `shape-${field.name}`);

      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.min = field.min ?? '0';
      input.id = `shape-${field.name}`;
      input.dataset.shapeField = field.name;

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      shapeFieldsEl.appendChild(wrapper);
    });
  };

  const getShapeValues = (shapeKey) => {
    const config = shapeConfigs[shapeKey];
    if (!config) return { values: null, errors: ['Choose a shape.'] };

    const values = {};
    const errors = [];

    config.fields.forEach((field) => {
      const input = document.getElementById(`shape-${field.name}`);
      const value = parseFloat(input.value);
      if (Number.isNaN(value) || value <= 0) {
        errors.push(`${field.label} must be a positive number.`);
      } else {
        values[field.name] = value;
      }
    });

    return { values, errors };
  };

  const applyShapeArea = (area) => {
    const targets = stationRows.querySelectorAll('.area-input');
    const target = Array.from(targets).find((input) => input.value.trim() === '');
    if (target) {
      target.value = area.toFixed(2);
      target.focus();
      return true;
    }
    return false;
  };

  const clearOutputs = () => {
    messageEl.textContent = '';
    volumeResultEl.textContent = '';
    breakdownEl.innerHTML = '';
  };

  const clearCrossOutputs = () => {
    crossMessageEl.textContent = '';
    crossResultEl.textContent = '';
    crossDetailsEl.innerHTML = '';
  };

  const renderAveragePreview = () => {
    if (!averagePreviewSvgEl || !averagePreviewMetaEl) return;

    const rows = Array.from(stationRows.querySelectorAll('tr'));
    const points = rows.map((row) => {
      const station = parseFloat(row.querySelector('.station-input')?.value ?? '');
      const area = parseFloat(row.querySelector('.area-input')?.value ?? '');
      const isValid = Number.isFinite(station) && Number.isFinite(area) && area >= 0;
      return { station, area, isValid };
    }).filter((point) => point.isValid);

    if (points.length < 2) {
      averagePreviewSvgEl.innerHTML = `
        <line x1="60" y1="270" x2="920" y2="270" stroke="#0f172a" stroke-width="2"></line>
        <text x="480" y="160" text-anchor="middle" fill="#64748b" font-size="14">Add at least two valid points to draw profile</text>
      `;
      averagePreviewMetaEl.textContent = `${points.length} valid point${points.length === 1 ? '' : 's'} entered`;
      return;
    }

    const sorted = [...points].sort((a, b) => a.station - b.station);
    const minStation = sorted[0].station;
    const maxStation = sorted[sorted.length - 1].station;
    const maxArea = Math.max(...sorted.map((point) => point.area), 1);
    const stationRange = Math.max(maxStation - minStation, 1);

    const width = 960;
    const height = 320;
    const margin = {
      top: 24,
      right: 40,
      bottom: 50,
      left: 64,
    };
    const baseY = height - margin.bottom;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xAt = (station) => margin.left + ((station - minStation) / stationRange) * innerWidth;
    const yAt = (area) => baseY - (area / maxArea) * innerHeight;

    const profilePoints = sorted.map((point) => `${xAt(point.station)},${yAt(point.area)}`).join(' ');
    const areaPoints = `${xAt(sorted[0].station)},${baseY} ${profilePoints} ${xAt(sorted[sorted.length - 1].station)},${baseY}`;

    const guideLines = [0.25, 0.5, 0.75].map((ratio) => {
      const y = baseY - ratio * innerHeight;
      const areaValue = ratio * maxArea;
      return `
        <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#d8e2ef" stroke-width="1" stroke-dasharray="5 5"></line>
        <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="11">${formatNumber(areaValue)}</text>
      `;
    }).join('');

    const ordinateLines = sorted.map((point) => {
      const x = xAt(point.station);
      const y = yAt(point.area);
      return `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${y}" stroke="#1d4ed8" stroke-width="2"></line>`;
    }).join('');

    const pointDots = sorted.map((point) => {
      const x = xAt(point.station);
      const y = yAt(point.area);
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="#0f172a"></circle>`;
    }).join('');

    const pointLabels = sorted.map((point) => {
      const x = xAt(point.station);
      const y = yAt(point.area);
      const textY = Math.max(y - 8, margin.top + 10);
      return `<text x="${x}" y="${textY}" text-anchor="middle" fill="#0f172a" font-size="11">${formatNumber(point.area)}</text>`;
    }).join('');

    averagePreviewSvgEl.innerHTML = `
      <rect x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" fill="none" stroke="#c7d4e7" stroke-width="1"></rect>
      ${guideLines}
      <polygon points="${areaPoints}" fill="#bfdbfe" fill-opacity="0.6"></polygon>
      <polyline points="${profilePoints}" fill="none" stroke="#1e40af" stroke-width="2.5"></polyline>
      <line x1="${margin.left}" y1="${baseY}" x2="${width - margin.right}" y2="${baseY}" stroke="#0f172a" stroke-width="2"></line>
      ${ordinateLines}
      ${pointDots}
      ${pointLabels}
      <text x="${width / 2}" y="${height - 8}" text-anchor="middle" fill="#64748b" font-size="11">Station (ft)</text>
      <text x="${margin.left - 38}" y="${margin.top + 6}" fill="#64748b" font-size="11">Area (sq ft)</text>
    `;

    averagePreviewMetaEl.textContent = `${sorted.length} valid points | Station range: ${formatNumber(minStation)} to ${formatNumber(maxStation)} ft`;
  };

  const renderCrossPreview = () => {
    if (!crossPreviewSvgEl || !crossPreviewMetaEl) return;

    const values = {
      a: Number.isFinite(parseFloat(crossInputs.a.value)) ? Math.max(parseFloat(crossInputs.a.value), 0) : 0,
      b: Number.isFinite(parseFloat(crossInputs.b.value)) ? Math.max(parseFloat(crossInputs.b.value), 0) : 0,
      c: Number.isFinite(parseFloat(crossInputs.c.value)) ? Math.max(parseFloat(crossInputs.c.value), 0) : 0,
      d: Number.isFinite(parseFloat(crossInputs.d.value)) ? Math.max(parseFloat(crossInputs.d.value), 0) : 0,
      base: Number.isFinite(parseFloat(crossInputs.base.value)) ? Math.max(parseFloat(crossInputs.base.value), 0) : 0,
    };

    const depthMax = Math.max(values.a, values.b, values.c, values.d, 1);
    const depthScale = 100 / depthMax;

    const baseFL = { x: 220, y: 280 };
    const baseFR = { x: 520, y: 280 };
    const baseBL = { x: 380, y: 170 };
    const baseBR = { x: 680, y: 170 };

    const topFL = { x: baseFL.x, y: baseFL.y - values.b * depthScale };
    const topFR = { x: baseFR.x, y: baseFR.y - values.a * depthScale };
    const topBL = { x: baseBL.x, y: baseBL.y - values.c * depthScale };
    const topBR = { x: baseBR.x, y: baseBR.y - values.d * depthScale };

    const faceFront = `${topFL.x},${topFL.y} ${topFR.x},${topFR.y} ${baseFR.x},${baseFR.y} ${baseFL.x},${baseFL.y}`;
    const faceRight = `${topFR.x},${topFR.y} ${topBR.x},${topBR.y} ${baseBR.x},${baseBR.y} ${baseFR.x},${baseFR.y}`;
    const faceLeft = `${topFL.x},${topFL.y} ${topBL.x},${topBL.y} ${baseBL.x},${baseBL.y} ${baseFL.x},${baseFL.y}`;
    const faceTop = `${topFL.x},${topFL.y} ${topFR.x},${topFR.y} ${topBR.x},${topBR.y} ${topBL.x},${topBL.y}`;

    const depthCallout = (label, value, basePoint, topPoint, textDx, textDy) => {
      const textX = (basePoint.x + topPoint.x) / 2 + textDx;
      const textY = (basePoint.y + topPoint.y) / 2 + textDy;
      return `
        <line x1="${basePoint.x}" y1="${basePoint.y}" x2="${topPoint.x}" y2="${topPoint.y}" stroke="#1e293b" stroke-width="1.5"></line>
        <text x="${textX}" y="${textY}" fill="#0f172a" font-size="13" font-weight="700">${label}</text>
        <text x="${textX}" y="${textY + 14}" fill="#334155" font-size="11">${formatNumber(value)} ft</text>
      `;
    };

    crossPreviewSvgEl.innerHTML = `
      <defs>
        <marker id="crossArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"></path>
        </marker>
      </defs>
      <polygon points="${faceLeft}" fill="#e2ecfb" stroke="#2563eb" stroke-width="1.5"></polygon>
      <polygon points="${faceFront}" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"></polygon>
      <polygon points="${faceRight}" fill="#cfe3fb" stroke="#2563eb" stroke-width="1.5"></polygon>
      <polygon points="${faceTop}" fill="#bfdbfe" fill-opacity="0.7" stroke="#1e40af" stroke-width="2"></polygon>

      <line x1="${baseFL.x}" y1="${baseFL.y}" x2="${baseBR.x}" y2="${baseBR.y}" stroke="#475569" stroke-width="1.2" stroke-dasharray="6 6"></line>
      <line x1="${topFL.x}" y1="${topFL.y}" x2="${topBR.x}" y2="${topBR.y}" stroke="#1e40af" stroke-width="2"></line>
      <line x1="${baseBL.x}" y1="${baseBL.y}" x2="${baseBR.x}" y2="${baseBR.y}" stroke="#1e40af" stroke-width="1.5"></line>

      ${depthCallout('a', values.a, baseFR, topFR, 8, 0)}
      ${depthCallout('b', values.b, baseFL, topFL, -30, 0)}
      ${depthCallout('c', values.c, baseBL, topBL, -30, 0)}
      ${depthCallout('d', values.d, baseBR, topBR, 8, 0)}

      <line x1="${baseFR.x}" y1="${baseFR.y + 34}" x2="${baseBR.x}" y2="${baseBR.y + 34}" stroke="#334155" stroke-width="1.5" marker-start="url(#crossArrow)" marker-end="url(#crossArrow)"></line>
      <text x="${(baseFR.x + baseBR.x) / 2}" y="${(baseFR.y + baseBR.y) / 2 + 30}" text-anchor="middle" fill="#334155" font-size="12">Base area = ${formatNumber(values.base)} sq ft</text>
    `;

    const filledCount = ['a', 'b', 'c', 'd', 'base'].filter((key) => {
      const raw = crossInputs[key].value.trim();
      return raw !== '' && Number.isFinite(parseFloat(raw));
    }).length;

    crossPreviewMetaEl.textContent = `${filledCount}/5 values entered | Base area: ${formatNumber(values.base)} sq ft`;
  };

  const renderPreviews = () => {
    renderAveragePreview();
    renderCrossPreview();
  };

  const setMethod = (method) => {
    const isAverage = method === 'average';
    averagePanelEl.classList.toggle('hidden', !isAverage);
    crossPanelEl.classList.toggle('hidden', isAverage);

    modeButtons.forEach((button) => {
      const isActive = button.dataset.method === method;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    renderPreviews();
  };

  const addRow = (stationValue = '', areaValue = '') => {
    const row = document.createElement('tr');

    const stationCell = document.createElement('td');
    const stationInput = document.createElement('input');
    stationInput.type = 'number';
    stationInput.step = 'any';
    stationInput.inputMode = 'decimal';
    stationInput.className = 'station-input';
    if (stationValue !== '' && stationValue !== null && stationValue !== undefined) {
      stationInput.value = stationValue;
    }
    stationInput.addEventListener('input', () => {
      clearOutputs();
      renderAveragePreview();
    });
    stationCell.appendChild(stationInput);

    const areaCell = document.createElement('td');
    const areaInput = document.createElement('input');
    areaInput.type = 'number';
    areaInput.step = 'any';
    areaInput.inputMode = 'decimal';
    areaInput.className = 'area-input';
    if (areaValue !== '' && areaValue !== null && areaValue !== undefined) {
      areaInput.value = areaValue;
    }
    areaInput.addEventListener('input', () => {
      clearOutputs();
      renderAveragePreview();
    });
    areaCell.appendChild(areaInput);

    const actionCell = document.createElement('td');
    actionCell.style.textAlign = 'right';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-row';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      row.remove();
      clearOutputs();
      renderAveragePreview();
    });
    actionCell.appendChild(removeButton);

    row.appendChild(stationCell);
    row.appendChild(areaCell);
    row.appendChild(actionCell);

    stationRows.appendChild(row);
  };

  const loadExample = () => {
    stationRows.innerHTML = '';
    exampleData.forEach(({ station, area }) => addRow(station, area));
    messageEl.textContent = 'Example loaded. Adjust any values before solving.';
    volumeResultEl.textContent = '';
    breakdownEl.innerHTML = '';
    renderAveragePreview();
  };

  const parseRows = () => {
    const data = [];
    const errors = [];

    stationRows.querySelectorAll('tr').forEach((row, index) => {
      const stationStr = row.querySelector('.station-input').value.trim();
      const areaStr = row.querySelector('.area-input').value.trim();

      if (!stationStr && !areaStr) {
        return;
      }
      if (!stationStr || !areaStr) {
        errors.push(`Row ${index + 1} is missing a station or area.`);
        return;
      }

      const station = parseFloat(stationStr);
      const area = parseFloat(areaStr);

      if (Number.isNaN(station) || Number.isNaN(area)) {
        errors.push(`Row ${index + 1} needs numeric values.`);
        return;
      }

      data.push({ station, area });
    });

    return { data, errors };
  };

  const calculateShapeArea = () => {
    const shapeKey = document.getElementById('shapeType').value;
    const { values, errors } = getShapeValues(shapeKey);
    if (errors.length) {
      shapeResultEl.textContent = errors[0];
      return null;
    }
    const result = shapeConfigs[shapeKey].area(values);
    const areaText = `Area: ${formatNumber(result.area)} sq ft`;
    const extraText = result.topWidth ? ` | Top width: ${formatNumber(result.topWidth)} ft` : '';
    shapeResultEl.textContent = `${areaText}${extraText}`;
    return result.area;
  };

  const calculateVolume = () => {
    clearOutputs();
    const { data, errors } = parseRows();

    if (errors.length) {
      messageEl.textContent = errors[0];
      return;
    }
    if (data.length < 2) {
      messageEl.textContent = 'Enter at least two station/area pairs.';
      return;
    }

    const sorted = [...data].sort((a, b) => a.station - b.station);

    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].station === sorted[i - 1].station) {
        messageEl.textContent = 'Stations must be unique. Adjust duplicate rows.';
        return;
      }
    }

    const intervals = [];
    let totalCubicFeet = 0;

    for (let i = 0; i < sorted.length - 1; i += 1) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const run = next.station - current.station;

      if (run <= 0) {
        messageEl.textContent = 'Stations must increase after sorting.';
        return;
      }

      const avgArea = (current.area + next.area) / 2;
      const cubicFeet = avgArea * run;
      const cubicYards = cubicFeet / 27;
      totalCubicFeet += cubicFeet;

      intervals.push({
        from: current.station,
        to: next.station,
        run,
        avgArea,
        cubicFeet,
        cubicYards,
      });
    }

    const totalCubicYards = totalCubicFeet / 27;

    volumeResultEl.innerHTML = `<strong>Total volume:</strong> ${formatNumber(totalCubicFeet)} ft³ (${formatNumber(totalCubicYards)} yd³ | ${formatNumber(totalCubicYards)} CYD)`;

    const rowsHtml = intervals.map((interval, idx) => `
        <tr>
            <td>Segment ${idx + 1}</td>
            <td>${formatNumber(interval.from)} → ${formatNumber(interval.to)}</td>
            <td>${formatNumber(interval.run)}</td>
            <td>${formatNumber(interval.avgArea)}</td>
            <td>${formatNumber(interval.cubicFeet)}</td>
            <td>${formatNumber(interval.cubicYards)}</td>
            <td>${formatNumber(interval.cubicYards)}</td>
        </tr>
    `).join('');

    breakdownEl.innerHTML = `
      <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th scope="col">Segment</th>
                    <th scope="col">Stations (ft)</th>
                    <th scope="col">Δx (ft)</th>
                    <th scope="col">Avg area (sq ft)</th>
                    <th scope="col">Volume (ft³)</th>
                    <th scope="col">Volume (yd³)</th>
                    <th scope="col">Volume (CYD)</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
      </div>
    `;
  };

  const calculateCrossSectionVolume = () => {
    clearCrossOutputs();

    const a = parseFloat(crossInputs.a.value);
    const b = parseFloat(crossInputs.b.value);
    const c = parseFloat(crossInputs.c.value);
    const d = parseFloat(crossInputs.d.value);
    const base = parseFloat(crossInputs.base.value);

    const entries = [
      ['a', a],
      ['b', b],
      ['c', c],
      ['d', d],
    ];

    for (let i = 0; i < entries.length; i += 1) {
      const [name, value] = entries[i];
      if (Number.isNaN(value) || value < 0) {
        crossMessageEl.textContent = `Depth ${name} must be zero or greater.`;
        return;
      }
    }

    if (Number.isNaN(base) || base <= 0) {
      crossMessageEl.textContent = 'Base area must be greater than zero.';
      return;
    }

    const averageDepth = (a + b + c + d) / 4;
    const cubicFeet = averageDepth * base;
    const cubicYards = cubicFeet / 27;

    crossResultEl.innerHTML = `<strong>Total volume:</strong> ${formatNumber(cubicFeet)} ft³ (${formatNumber(cubicYards)} yd³ | ${formatNumber(cubicYards)} CYD)`;
    crossDetailsEl.innerHTML = `
      <p><strong>Average depth:</strong> (${formatNumber(a)} + ${formatNumber(b)} + ${formatNumber(c)} + ${formatNumber(d)}) / 4 = ${formatNumber(averageDepth)} ft</p>
      <p><strong>Volume:</strong> V = Average depth × Base = ${formatNumber(averageDepth)} × ${formatNumber(base)} = ${formatNumber(cubicFeet)} ft³ = ${formatNumber(cubicYards)} yd³ = ${formatNumber(cubicYards)} CYD</p>
    `;
    renderCrossPreview();
  };

  document.getElementById('addRowButton').addEventListener('click', () => addRow());
  document.getElementById('loadExampleButton').addEventListener('click', loadExample);
  document.getElementById('calculateVolume').addEventListener('click', calculateVolume);
  document.getElementById('calculateCrossSection').addEventListener('click', calculateCrossSectionVolume);
  document.getElementById('computeShapeButton').addEventListener('click', calculateShapeArea);
  document.getElementById('applyShapeButton').addEventListener('click', () => {
    const area = calculateShapeArea();
    if (area && !applyShapeArea(area)) {
      shapeResultEl.textContent = 'No empty area cells to fill. Add a row or clear a value.';
    } else if (area) {
      shapeResultEl.textContent = `${shapeResultEl.textContent} (sent to next row)`;
      renderAveragePreview();
    }
  });
  document.getElementById('shapeType').addEventListener('change', (event) => {
    renderShapeFields(event.target.value);
    shapeResultEl.textContent = '';
  });
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const method = button.dataset.method;
      if (!method) return;
      setMethod(method);
    });
  });
  Object.values(crossInputs).forEach((input) => {
    input.addEventListener('input', () => {
      clearCrossOutputs();
      renderCrossPreview();
    });
  });

  // Start with two blank rows ready for input.
  addRow();
  addRow();
  renderShapeFields(document.getElementById('shapeType').value);
  setMethod('average');
  renderPreviews();
});
