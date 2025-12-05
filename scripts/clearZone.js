document.addEventListener('DOMContentLoaded', () => {
  const speedSteps = [40, 50, 60, 70];
  const adtBands = [
    { label: '≤ 750', max: 750, ranges: { 40: [7, 10], 50: [10, 12], 60: [12, 14], 70: [14, 16] } },
    { label: '751–1,500', max: 1500, ranges: { 40: [10, 12], 50: [12, 14], 60: [14, 16], 70: [16, 18] } },
    { label: '1,501–6,000', max: 6000, ranges: { 40: [12, 14], 50: [14, 16], 60: [16, 18], 70: [18, 20] } },
    { label: '6,001–15,000', max: 15000, ranges: { 40: [14, 16], 50: [16, 18], 60: [20, 22], 70: [22, 24] } },
    { label: '> 15,000', max: Infinity, ranges: { 40: [16, 18], 50: [20, 22], 60: [22, 24], 70: [24, 26] } },
  ];

  const slopeAdjustments = {
    recoverable: { add: 0, note: 'Recoverable slope 1V:4H or flatter.' },
    nonrecoverable: { add: 2, note: 'Non-recoverable slope between 1V:3H and 1V:4H.' },
    steep: { add: 5, note: 'Critical slope between 1V:2H and 1V:3H.' },
    verySteep: { add: 8, note: 'Steeper than 1V:2H or significant obstacles present.' },
    backslope: { add: 0, note: 'Ditch/back slope present; review ditch geometry and back slope separately.' },
  };

  const getSpeedKey = (mph) => {
    if (mph <= 40) return 40;
    if (mph <= 50) return 50;
    if (mph <= 60) return 60;
    return 70;
  };

  const getAdtBand = (adt) => adtBands.find((band) => adt <= band.max);

  const renderTable = () => {
    const rows = adtBands.map((band) => `
      <tr>
        <td>${band.label}</td>
        ${speedSteps.map((spd) => {
          const range = band.ranges[spd];
          return `<td>${range ? `${range[0]}–${range[1]}` : '—'}</td>`;
        }).join('')}
      </tr>
    `).join('');

    document.getElementById('czTableContainer').innerHTML = `
      <table>
        <thead>
          <tr>
            <th scope="col">ADT (veh/day)</th>
            ${speedSteps.map((spd) => `<th scope="col">${spd} mph</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  };

  const calcClearZone = () => {
    const speedInput = document.getElementById('designSpeed').value.trim();
    const adtInput = document.getElementById('adt').value.trim();
    const slopeClass = document.getElementById('slopeClass').value;
    const resultEl = document.getElementById('czResult');
    const noteEl = document.getElementById('czNote');

    resultEl.textContent = '';
    noteEl.textContent = '';

    const speed = parseFloat(speedInput);
    const adt = parseFloat(adtInput);

    if (Number.isNaN(speed) || speed <= 0 || Number.isNaN(adt) || adt <= 0) {
      resultEl.textContent = 'Enter valid speed and ADT.';
      return;
    }

    const speedKey = getSpeedKey(speed);
    const adtBand = getAdtBand(adt);
    if (!adtBand) {
      resultEl.textContent = 'ADT is out of table range.';
      return;
    }

    const baseRange = adtBand.ranges[speedKey];
    if (!baseRange) {
      resultEl.textContent = 'No base value for that speed.';
      return;
    }

    const adjustment = slopeAdjustments[slopeClass] || { add: 0, note: '' };
    const adjustedMin = baseRange[0] + adjustment.add;
    const adjustedMax = baseRange[1] + adjustment.add;

    let deduction = 0;
    if (slopeClass !== 'recoverable' && slopeClass !== 'backslope') {
      const slopeRatioVal = parseFloat(document.getElementById('slopeRatio').value);
      const slopeHeightVal = parseFloat(document.getElementById('slopeHeight').value);
      if (!Number.isNaN(slopeRatioVal) && slopeRatioVal > 0 && !Number.isNaN(slopeHeightVal) && slopeHeightVal > 0) {
        deduction = slopeRatioVal * slopeHeightVal;
      }
    }

    const finalMin = Math.max(0, adjustedMin - deduction);
    const finalMax = Math.max(0, adjustedMax - deduction);

    const deductionText = deduction > 0
      ? `<br><span class="helper-text">Deducted ${deduction.toFixed(1)} ft of non-recoverable slope run (ratio ${document.getElementById('slopeRatio').value || '?'}H:1, height ${document.getElementById('slopeHeight').value || '?'} ft).</span>`
      : '';

    resultEl.innerHTML = `
      <strong>Recommended clear zone:</strong> ${finalMin.toFixed(1)}–${finalMax.toFixed(1)} ft
      <span class="helper-text">Base ${baseRange[0]}–${baseRange[1]} ft @ ${speedKey} mph, ADT ${adtBand.label}${adjustment.add ? `, +${adjustment.add} ft slope offset` : ''}</span>
      ${deductionText}
    `;
    noteEl.textContent = adjustment.note || '';
  };

  document.getElementById('calcClearZone').addEventListener('click', calcClearZone);
  document.getElementById('slopeClass').addEventListener('change', (event) => {
    const showSlopeInputs = event.target.value !== 'recoverable' && event.target.value !== 'backslope';
    const block = document.getElementById('slopeWidthBlock');
    const helper = document.getElementById('slopeWidthHelp');
    if (showSlopeInputs) {
      block.classList.remove('hidden');
      helper.classList.remove('hidden');
    } else {
      block.classList.add('hidden');
      helper.classList.add('hidden');
    }
  });
  renderTable();
});
