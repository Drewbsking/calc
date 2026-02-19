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

  const setMethod = (method) => {
    const isAverage = method === 'average';
    averagePanelEl.classList.toggle('hidden', !isAverage);
    crossPanelEl.classList.toggle('hidden', isAverage);

    modeButtons.forEach((button) => {
      const isActive = button.dataset.method === method;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
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

  // Start with two blank rows ready for input.
  addRow();
  addRow();
  renderShapeFields(document.getElementById('shapeType').value);
  setMethod('average');
});
