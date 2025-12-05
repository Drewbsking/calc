document.addEventListener('DOMContentLoaded', () => {
  const formatNumber = (value, digits = 1) => value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const volumeFromDepth = (depthIn, c, areaAc) => 3630 * depthIn * c * areaAc;

  const mdotPresets = [
    { label: 'Concrete or Asphalt Pavement', min: 0.8, max: 0.9 },
    { label: 'Commercial and Industrial', min: 0.7, max: 0.9 },
    { label: 'Gravel Roadways and Shoulders', min: 0.5, max: 0.7 },
    { label: 'Residential – Urban', min: 0.5, max: 0.7 },
    { label: 'Residential – Suburban', min: 0.3, max: 0.5 },
    { label: 'Undeveloped', min: 0.1, max: 0.3 },
    { label: 'Berms', min: 0.1, max: 0.3 },
    { label: 'Agricultural – Cultivated Fields', min: 0.15, max: 0.4 },
    { label: 'Agricultural – Pastures', min: 0.1, max: 0.4 },
    { label: 'Agricultural – Forested Areas', min: 0.1, max: 0.4 },
  ];

  const addCRow = (label = '', area = '', c = '') => {
    const tbody = document.getElementById('cRows');
    const tr = document.createElement('tr');

    const labelTd = document.createElement('td');
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = label;
    labelTd.appendChild(labelInput);

    const areaTd = document.createElement('td');
    const areaInput = document.createElement('input');
    areaInput.type = 'number';
    areaInput.step = '0.01';
    areaInput.min = '0';
    areaInput.value = area;
    areaTd.appendChild(areaInput);

    const cTd = document.createElement('td');
    const cInput = document.createElement('input');
    cInput.type = 'number';
    cInput.step = '0.01';
    cInput.min = '0';
    cInput.max = '1';
    cInput.value = c;
    cTd.appendChild(cInput);

    const actionTd = document.createElement('td');
    actionTd.style.textAlign = 'right';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-row';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => tr.remove());
    actionTd.appendChild(removeBtn);

    tr.appendChild(labelTd);
    tr.appendChild(areaTd);
    tr.appendChild(cTd);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  };

  const addPresetRow = () => {
    const select = document.getElementById('mdotPreset');
    const areaInput = document.getElementById('mdotArea');
    const val = select.value;
    if (!val) return;
    const [, minStr, maxStr] = val.split('|');
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    const avg = (min + max) / 2;
    addCRow(select.options[select.selectedIndex].text.split(' (')[0], areaInput.value || '1.0', avg.toFixed(2));
  };

  const calcCompositeC = () => {
    const tbody = document.getElementById('cRows');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const cResultEl = document.getElementById('cResult');
    if (!rows.length) {
      cResultEl.textContent = 'Add at least one subarea.';
      return;
    }

    let totalArea = 0;
    let weighted = 0;
    for (const row of rows) {
      const inputs = row.querySelectorAll('input');
      const area = parseFloat(inputs[1].value);
      const c = parseFloat(inputs[2].value);
      if (Number.isNaN(area) || area < 0 || Number.isNaN(c) || c < 0 || c > 1) {
        cResultEl.textContent = 'Each row needs valid area and C (0–1).';
        return;
      }
      totalArea += area;
      weighted += area * c;
    }

    if (totalArea <= 0) {
      cResultEl.textContent = 'Total area must be greater than zero.';
      return;
    }

    const compositeC = weighted / totalArea;
    document.getElementById('oakCompositeC').value = compositeC.toFixed(3);
    document.getElementById('oakArea').value = totalArea.toFixed(2);
    cResultEl.textContent = `Composite C = ${formatNumber(compositeC, 3)} (total area ${formatNumber(totalArea, 2)} ac). Values sent to main form.`;
  };

  const calculate = () => {
    const area = parseFloat(document.getElementById('oakArea').value);
    const c = parseFloat(document.getElementById('oakCompositeC').value);
    const tc = parseFloat(document.getElementById('oakTc').value);

    const depthWQ = parseFloat(document.getElementById('depthWQ').value);
    const depthCPVC = parseFloat(document.getElementById('depthCPVC').value);
    const depthCPRC = parseFloat(document.getElementById('depthCPRC').value);
    const depthForebay = parseFloat(document.getElementById('depthForebay').value);
    const depth100 = parseFloat(document.getElementById('depth100').value);

    const resultEl = document.getElementById('oakResult');
    const noteEl = document.getElementById('oakNote');

    resultEl.textContent = '';
    noteEl.textContent = '';

    if ([area, c, depthWQ, depthCPVC, depthCPRC, depthForebay, depth100].some((v) => Number.isNaN(v) || v < 0)) {
      resultEl.textContent = 'Enter non-negative values for area, C, and all depths.';
      return;
    }
    if (c > 1) {
      resultEl.textContent = 'Composite C must be between 0 and 1.';
      return;
    }

    const vwq = volumeFromDepth(depthWQ, c, area);
    const vcpvc = volumeFromDepth(depthCPVC, c, area);
    const vcprc = volumeFromDepth(depthCPRC, c, area);
    const vForebay = volumeFromDepth(depthForebay, c, area);
    const v100 = volumeFromDepth(depth100, c, area);

    const qwq = (!Number.isNaN(tc) && tc > 0)
      ? c * area * (30.20 / ((tc + 9.17) ** 0.81))
      : null;

    const rows = [
      { label: 'Water Quality Volume (VWQ)', vol: vwq, depth: depthWQ },
      { label: 'Channel Protection Volume Control (VCPVC)', vol: vcpvc, depth: depthCPVC },
      { label: 'Channel Protection Rate Control (VCPRC, extended detention)', vol: vcprc, depth: depthCPRC },
      { label: 'Forebay Volume (VF)', vol: vForebay, depth: depthForebay },
      { label: '100-year Volume (V100R)', vol: v100, depth: depth100 },
    ];

    const tableRows = rows.map((row) => `
      <tr>
        <td>${row.label}</td>
        <td>${formatNumber(row.depth, 2)} in</td>
        <td>${formatNumber(row.vol, 1)} ft³</td>
        <td>${formatNumber(row.vol / 43560, 4)} ac-ft</td>
      </tr>
    `).join('');

    const qwqText = qwq
      ? `<p class="helper-text">Water Quality Rate (Eq. 18): ${formatNumber(qwq, 3)} cfs using Tc = ${formatNumber(tc, 2)} min.</p>`
      : '<p class="helper-text">Water Quality Rate (Eq. 18): enter Tc to compute.</p>';

    resultEl.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Depth P (in)</th>
              <th scope="col">Volume (ft³)</th>
              <th scope="col">Volume (ac-ft)</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${qwqText}
    `;

    noteEl.textContent = 'Volumes use Eq. 3 (V = 3630 × P × C × A). Adjust C and depths per site conditions and the WRC manual.';
  };

  document.getElementById('oakCalc').addEventListener('click', calculate);
  document.getElementById('addCRow').addEventListener('click', () => addCRow());
  document.getElementById('calcCompositeC').addEventListener('click', calcCompositeC);
  document.getElementById('addPresetCRow').addEventListener('click', addPresetRow);

  // Seed with two rows for convenience.
  addCRow('Impervious', '1.0', '0.95');
  addCRow('Pervious', '1.0', '0.25');
});
