document.addEventListener('DOMContentLoaded', () => {
  const gmbInput = document.getElementById('gmbInput');
  const areaInput = document.getElementById('areaInput');
  const thicknessInput = document.getElementById('thicknessInput');
  const calculateButton = document.getElementById('calculateHma');
  const loadExampleButton = document.getElementById('loadExample');
  const clearButton = document.getElementById('clearHma');

  const messageEl = document.getElementById('hmaMessage');
  const resultsEl = document.getElementById('hmaResults');
  const detailsEl = document.getElementById('hmaDetails');

  const WATER_UNIT_WEIGHT = 62.4; // lb/cf
  const VOLUME_PER_SYD_PER_INCH = 0.75; // cf (3 ft * 3 ft * 1/12 ft)

  const formatNumber = (value, digits = 2) => value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const clearOutputs = () => {
    messageEl.textContent = '';
    resultsEl.textContent = '';
    detailsEl.innerHTML = '';
  };

  const calculate = () => {
    clearOutputs();

    const gmb = parseFloat(gmbInput.value);
    const areaSyd = parseFloat(areaInput.value);
    const thicknessIn = parseFloat(thicknessInput.value);

    if (Number.isNaN(gmb) || gmb <= 0) {
      messageEl.textContent = 'Enter a Gmb value greater than zero.';
      return;
    }

    if ((!Number.isNaN(areaSyd) && areaSyd < 0) || (!Number.isNaN(thicknessIn) && thicknessIn < 0)) {
      messageEl.textContent = 'Area and thickness cannot be negative.';
      return;
    }

    const unitWeightLbPerCf = gmb * WATER_UNIT_WEIGHT;
    const lbsPerSydPerIn = unitWeightLbPerCf * VOLUME_PER_SYD_PER_INCH;

    const hasTotalInputs = !Number.isNaN(areaSyd) && !Number.isNaN(thicknessIn) && areaSyd > 0 && thicknessIn > 0;
    const totalLbs = hasTotalInputs ? lbsPerSydPerIn * areaSyd * thicknessIn : 0;
    const totalTons = totalLbs / 2000;

    resultsEl.innerHTML = `
      <p><strong>HMA factor:</strong> ${formatNumber(lbsPerSydPerIn)} lb/SYD/in</p>
      <p><strong>Unit weight:</strong> ${formatNumber(unitWeightLbPerCf)} lb/cf</p>
      <p><strong>Total weight:</strong> ${hasTotalInputs ? `${formatNumber(totalLbs)} lb (${formatNumber(totalTons)} tons)` : 'Enter area and thickness to compute totals.'}</p>
    `;

    detailsEl.innerHTML = `
      <p><strong>Step 1:</strong> Unit weight = Gmb × 62.4 = ${formatNumber(gmb, 3)} × ${formatNumber(WATER_UNIT_WEIGHT, 1)} = ${formatNumber(unitWeightLbPerCf)} lb/cf</p>
      <p><strong>Step 2:</strong> Volume of 1 SYD at 1 in = 3 × 3 × (1/12) = ${formatNumber(VOLUME_PER_SYD_PER_INCH, 2)} cf</p>
      <p><strong>Step 3:</strong> lb/SYD/in = ${formatNumber(unitWeightLbPerCf)} × ${formatNumber(VOLUME_PER_SYD_PER_INCH, 2)} = ${formatNumber(lbsPerSydPerIn)} lb/SYD/in</p>
      <p><strong>Shortcut:</strong> lb/SYD/in = Gmb × 46.8 = ${formatNumber(gmb, 3)} × 46.8 = ${formatNumber(lbsPerSydPerIn)} lb/SYD/in</p>
      <p><strong>Total (if provided):</strong> lb/SYD/in × Area × Thickness = ${formatNumber(lbsPerSydPerIn)} × ${hasTotalInputs ? `${formatNumber(areaSyd)} × ${formatNumber(thicknessIn)}` : 'Area × Thickness'} = ${hasTotalInputs ? `${formatNumber(totalLbs)} lb (${formatNumber(totalTons)} tons)` : 'N/A'}</p>
    `;
  };

  const loadExample = () => {
    gmbInput.value = '2.449';
    areaInput.value = '1';
    thicknessInput.value = '1';
    calculate();
    messageEl.textContent = 'Example loaded from the reference note (1 SYD, 1 inch).';
  };

  const clearInputs = () => {
    gmbInput.value = '';
    areaInput.value = '';
    thicknessInput.value = '';
    clearOutputs();
  };

  calculateButton.addEventListener('click', calculate);
  loadExampleButton.addEventListener('click', loadExample);
  clearButton.addEventListener('click', clearInputs);

  [gmbInput, areaInput, thicknessInput].forEach((input) => {
    input.addEventListener('input', () => {
      messageEl.textContent = '';
    });
  });
});
