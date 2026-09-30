document.addEventListener('DOMContentLoaded', () => {
  const spacingInput = document.getElementById('spacing');
  const areaResultEl = document.getElementById('areaResult');
  const formulaDetailsEl = document.getElementById('formulaDetails');
  const messageEl = document.getElementById('message');
  const segmentTableEl = document.getElementById('segmentTable');
  const ordinateRowsEl = document.getElementById('ordinateRows');
  const addOrdinateBtn = document.getElementById('addOrdinate');
  const previewSvgEl = document.getElementById('irregularSvg');
  const previewMetaEl = document.getElementById('previewMeta');

  const MIN_ORDINATES = 2;

  const formatNumber = (value, digits = 2) => value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const getPreviewData = () => {
    const rows = Array.from(ordinateRowsEl.querySelectorAll('tr'));
    return rows.map((row, index) => {
      const input = row.querySelector('.ordinate-input');
      const raw = input?.value?.trim() ?? '';
      const parsed = parseFloat(raw);
      const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      return {
        index,
        label: indexToLabel(index),
        value,
        hasValue: raw !== '' && Number.isFinite(parsed) && parsed >= 0,
      };
    });
  };

  const renderPreview = () => {
    if (!previewSvgEl || !previewMetaEl) return;

    const data = getPreviewData();
    const pointCount = data.length;

    if (pointCount === 0) {
      previewSvgEl.innerHTML = '';
      previewMetaEl.textContent = 'Enter ordinates to draw the figure.';
      return;
    }

    const width = 960;
    const height = 360;
    const margin = {
      top: 24,
      right: 28,
      bottom: 56,
      left: 52,
    };
    const baseY = height - margin.bottom;
    const innerWidth = width - margin.left - margin.right;
    const drawableHeight = height - margin.top - margin.bottom;
    const stepX = pointCount > 1 ? innerWidth / (pointCount - 1) : 0;
    const maxY = Math.max(...data.map((item) => item.value), 1);
    const scaleY = drawableHeight / maxY;

    const xAt = (index) => margin.left + (index * stepX);
    const yAt = (value) => baseY - (value * scaleY);

    const profilePoints = data.map((item) => `${xAt(item.index)},${yAt(item.value)}`).join(' ');
    const firstX = xAt(0);
    const lastX = xAt(pointCount - 1);
    const areaPoints = `${firstX},${baseY} ${profilePoints} ${lastX},${baseY}`;

    const horizontalGuides = [0.25, 0.5, 0.75].map((ratio) => {
      const y = baseY - (drawableHeight * ratio);
      const guideValue = maxY * ratio;
      return `
        <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#d8e2ef" stroke-width="1" stroke-dasharray="5 5"></line>
        <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="11">${formatNumber(guideValue, 1)}</text>
      `;
    }).join('');

    const ordinateLines = data.map((item) => {
      const x = xAt(item.index);
      const topY = yAt(item.value);
      const lineColor = item.hasValue ? '#1d4ed8' : '#94a3b8';
      const dash = item.hasValue ? '' : 'stroke-dasharray="4 4"';
      return `
        <line x1="${x}" y1="${baseY}" x2="${x}" y2="${topY}" stroke="${lineColor}" stroke-width="2" ${dash}></line>
      `;
    }).join('');

    const nodePoints = data.map((item) => {
      const x = xAt(item.index);
      const y = yAt(item.value);
      const fillColor = item.hasValue ? '#0f172a' : '#94a3b8';
      return `
        <circle cx="${x}" cy="${y}" r="3.5" fill="${fillColor}"></circle>
      `;
    }).join('');

    const bottomLabels = data.map((item) => {
      const x = xAt(item.index);
      return `<text x="${x}" y="${height - 18}" text-anchor="middle" fill="#334155" font-size="12">${item.label}</text>`;
    }).join('');

    const valueLabels = data.map((item) => {
      if (!item.hasValue) return '';
      const x = xAt(item.index);
      const y = yAt(item.value);
      const yText = Math.max(y - 8, margin.top + 12);
      return `<text x="${x}" y="${yText}" text-anchor="middle" fill="#0f172a" font-size="11">${formatNumber(item.value, 1)}</text>`;
    }).join('');

    const spacingValue = parseFloat(spacingInput.value);
    const hasSpacing = Number.isFinite(spacingValue) && spacingValue > 0;
    const spacingMarker = pointCount > 1 ? `
      <line x1="${firstX}" y1="${baseY + 28}" x2="${xAt(1)}" y2="${baseY + 28}" stroke="#334155" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)"></line>
      <text x="${(firstX + xAt(1)) / 2}" y="${baseY + 22}" text-anchor="middle" fill="#334155" font-size="12">${hasSpacing ? `L = ${formatNumber(spacingValue, 2)} ft` : 'L (spacing)'}</text>
    ` : '';

    previewSvgEl.innerHTML = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"></path>
        </marker>
      </defs>
      <rect x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${drawableHeight}" fill="none" stroke="#c7d4e7" stroke-width="1"></rect>
      ${horizontalGuides}
      <polygon points="${areaPoints}" fill="#bfdbfe" fill-opacity="0.6"></polygon>
      <polyline points="${profilePoints}" fill="none" stroke="#1e40af" stroke-width="2.5"></polyline>
      <line x1="${margin.left}" y1="${baseY}" x2="${width - margin.right}" y2="${baseY}" stroke="#0f172a" stroke-width="2"></line>
      ${ordinateLines}
      ${nodePoints}
      ${bottomLabels}
      ${valueLabels}
      ${spacingMarker}
      <text x="${width / 2}" y="${height - 4}" text-anchor="middle" fill="#64748b" font-size="11">Equal station spacing</text>
      <text x="${margin.left - 36}" y="${margin.top + 2}" fill="#64748b" font-size="11">Ordinate (ft)</text>
    `;

    const enteredCount = data.filter((item) => item.hasValue).length;
    const spacingText = hasSpacing ? `${formatNumber(spacingValue, 2)} ft` : 'not set';
    previewMetaEl.textContent = `${enteredCount}/${pointCount} ordinates entered | Spacing: ${spacingText}`;
  };

  const clearOutputs = () => {
    messageEl.textContent = '';
    areaResultEl.textContent = '';
    formulaDetailsEl.innerHTML = '';
    segmentTableEl.innerHTML = '';
  };

  const indexToLabel = (index) => {
    let n = index + 1;
    let label = '';
    while (n > 0) {
      n -= 1;
      label = String.fromCharCode(97 + (n % 26)) + label;
      n = Math.floor(n / 26);
    }
    return label;
  };

  const renumberRows = () => {
    const rows = Array.from(ordinateRowsEl.querySelectorAll('tr'));
    rows.forEach((row, index) => {
      const stationCell = row.querySelector('[data-station]');
      const labelCell = row.querySelector('[data-label]');
      if (stationCell) stationCell.textContent = String(index + 1);
      if (labelCell) labelCell.textContent = indexToLabel(index);
      const input = row.querySelector('.ordinate-input');
      if (input) {
        input.dataset.index = String(index);
        input.placeholder = indexToLabel(index);
      }
    });
    renderPreview();
  };

  const removeOrdinateRow = (row) => {
    const rowCount = ordinateRowsEl.querySelectorAll('tr').length;
    if (rowCount <= MIN_ORDINATES) {
      messageEl.textContent = `At least ${MIN_ORDINATES} ordinates are required.`;
      return;
    }
    row.remove();
    renumberRows();
    clearOutputs();
  };

  const createOrdinateRow = (value = '') => {
    const row = document.createElement('tr');

    const stationCell = document.createElement('td');
    stationCell.dataset.station = 'true';
    stationCell.textContent = '1';

    const labelCell = document.createElement('td');
    labelCell.dataset.label = 'true';
    labelCell.className = 'row-label';
    labelCell.textContent = 'a';

    const ordinateCell = document.createElement('td');
    const ordinateInput = document.createElement('input');
    ordinateInput.type = 'number';
    ordinateInput.step = 'any';
    ordinateInput.min = '0';
    ordinateInput.className = 'ordinate-input';
    ordinateInput.inputMode = 'decimal';
    ordinateInput.placeholder = 'a';
    ordinateInput.value = value === '' ? '' : String(value);
    ordinateInput.addEventListener('input', () => {
      messageEl.textContent = '';
      renderPreview();
    });
    ordinateCell.appendChild(ordinateInput);

    const actionCell = document.createElement('td');
    actionCell.style.textAlign = 'right';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-row';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      removeOrdinateRow(row);
    });
    actionCell.appendChild(removeButton);

    row.appendChild(stationCell);
    row.appendChild(labelCell);
    row.appendChild(ordinateCell);
    row.appendChild(actionCell);
    ordinateRowsEl.appendChild(row);

    renumberRows();
  };

  const readValues = () => {
    const spacing = parseFloat(spacingInput.value);
    const inputs = Array.from(ordinateRowsEl.querySelectorAll('.ordinate-input'));
    const ordinates = [];
    const labels = [];

    if (inputs.length < MIN_ORDINATES) {
      return { error: `Add at least ${MIN_ORDINATES} ordinates.` };
    }

    for (let index = 0; index < inputs.length; index += 1) {
      const rawValue = inputs[index].value.trim();
      const value = parseFloat(rawValue);
      const label = indexToLabel(index);

      if (rawValue === '' || Number.isNaN(value)) {
        return {
          error: `Enter a numeric value for ordinate ${label}.`,
        };
      }
      if (value < 0) {
        return {
          error: `Ordinate ${label} cannot be negative.`,
        };
      }

      ordinates.push(value);
      labels.push(label);
    }

    if (Number.isNaN(spacing) || spacing <= 0) {
      return {
        error: 'Spacing L must be greater than zero.',
      };
    }

    return { spacing, ordinates, labels };
  };

  const buildSegmentRows = (spacing, ordinates, labels) => {
    const rows = [];
    for (let index = 0; index < ordinates.length - 1; index += 1) {
      const first = ordinates[index];
      const second = ordinates[index + 1];
      const avg = (first + second) / 2;
      const area = spacing * avg;

      rows.push({
        segment: `${labels[index]}-${labels[index + 1]}`,
        avg,
        area,
      });
    }
    return rows;
  };

  const calculate = () => {
    clearOutputs();

    const {
      error, spacing, ordinates, labels,
    } = readValues();

    if (error) {
      messageEl.textContent = error;
      return;
    }

    const first = ordinates[0];
    const last = ordinates[ordinates.length - 1];
    const interiorValues = ordinates.slice(1, -1);
    const interiorLabels = labels.slice(1, -1);
    const interiorSum = interiorValues.reduce((sum, value) => sum + value, 0);
    const endAverage = (first + last) / 2;
    const weightedSum = endAverage + interiorSum;
    const area = spacing * weightedSum;
    const areaSqYd = area / 9;
    const interiorExpr = interiorLabels.length ? interiorLabels.join(' + ') : 'none';

    areaResultEl.innerHTML = `<strong>Area (A):</strong> ${formatNumber(area)} sq ft (${formatNumber(areaSqYd)} sq yd)`;

    formulaDetailsEl.innerHTML = `
      <p><strong>Ordinate count:</strong> ${ordinates.length}</p>
      <p><strong>End average:</strong> (${formatNumber(first)} + ${formatNumber(last)}) / 2 = ${formatNumber(endAverage)}</p>
      <p><strong>Interior sum:</strong> ${interiorExpr} = ${formatNumber(interiorSum)}</p>
      <p><strong>Weighted sum:</strong> ${formatNumber(endAverage)} + ${formatNumber(interiorSum)} = ${formatNumber(weightedSum)}</p>
      <p><strong>Area:</strong> A = L × weighted sum = ${formatNumber(spacing)} × ${formatNumber(weightedSum)} = ${formatNumber(area)} sq ft = ${formatNumber(areaSqYd)} sq yd</p>
    `;

    const segments = buildSegmentRows(spacing, ordinates, labels);
    const rowsHtml = segments.map((segmentData, index) => `
      <tr>
        <td>Segment ${index + 1}</td>
        <td>${segmentData.segment}</td>
        <td>${formatNumber(segmentData.avg)}</td>
        <td>${formatNumber(segmentData.area)}</td>
        <td>${formatNumber(segmentData.area / 9)}</td>
      </tr>
    `).join('');

    segmentTableEl.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th scope="col">Segment</th>
              <th scope="col">Ordinates</th>
              <th scope="col">Avg ordinate (ft)</th>
              <th scope="col">Segment area (sq ft)</th>
              <th scope="col">Segment area (sq yd)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  };

  const setOrdinates = (values) => {
    ordinateRowsEl.innerHTML = '';
    values.forEach((value) => createOrdinateRow(value));
  };

  const loadExample = () => {
    const sample = {
      spacing: 20,
      ordinates: [6, 8.5, 9, 11, 12, 11.5, 10, 9, 7.5, 6],
    };

    spacingInput.value = sample.spacing;
    setOrdinates(sample.ordinates);
    calculate();
    messageEl.textContent = 'Example values loaded.';
  };

  const clearInputs = () => {
    spacingInput.value = '';
    setOrdinates(['', '']);
    clearOutputs();
    renderPreview();
  };

  document.getElementById('calculateArea').addEventListener('click', calculate);
  document.getElementById('loadExample').addEventListener('click', loadExample);
  document.getElementById('clearInputs').addEventListener('click', clearInputs);
  addOrdinateBtn.addEventListener('click', () => {
    createOrdinateRow('');
    messageEl.textContent = '';
  });
  spacingInput.addEventListener('input', () => {
    messageEl.textContent = '';
    renderPreview();
  });

  setOrdinates(['', '', '', '', '', '', '', '', '', '']);
  renderPreview();
});
