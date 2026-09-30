document.addEventListener('DOMContentLoaded', () => {
  const unitWeightGalInput = document.getElementById('unitWeightGal');
  const sealantProductSelect = document.getElementById('sealantProduct');
  const productSpecNoteEl = document.getElementById('productSpecNote');
  const jointWidthInput = document.getElementById('jointWidth');
  const jointDepthInput = document.getElementById('jointDepth');
  const jointLengthInput = document.getElementById('jointLength');

  const messageEl = document.getElementById('rubberMessage');
  const resultEl = document.getElementById('rubberResult');
  const detailsEl = document.getElementById('rubberDetails');

  const GALLON_TO_CUBIC_FOOT = 0.13368;
  const CUBIC_INCHES_PER_CUBIC_FOOT = 1728;
  const WR_MEADOWS_SPECS = {
    wr3405m: {
      lbPerGal: 9.2,
      note: '3405-M sample note: 9.2 lb/gal.',
    },
    wr3405: {
      lbPerGal: 10.0,
      note: '3405 data sheet: Wt. per gallon = 10.0 lb/gal.',
    },
    wr3405hp: {
      lbPerGal: 10.0,
      note: '3405 HP data sheet: Wt. per gallon = 10.0 lb/gal.',
    },
    wr3405ne: {
      lbPerGal: 10.0,
      note: '3405 NE data sheet: Wt. per gallon = 10.0 lb/gal.',
    },
    wr1190: {
      lbPerGal: 10.0,
      note: '1190 data sheet: Wt. per gallon = 10.0 lb/gal.',
    },
    wrDirectFire: {
      lbPerGal: 11.3,
      note: 'DIRECT FIRE data sheet: Wt. per gallon = 11.3 lb/gal.',
    },
    wr164: {
      lbPerGal: 9.33,
      note: '#164 data sheet coverage line gives 69.8 lb/cf (~9.33 lb/gal).',
    },
    wrHiSpec: {
      lbPerGal: 9.65,
      note: 'HI-SPEC data sheet coverage line gives 72.2 lb/cf (~9.65 lb/gal).',
    },
    custom: {
      lbPerGal: null,
      note: 'Custom mode: enter lb/gal manually.',
    },
  };

  const formatNumber = (value, digits = 2) => value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const clearOutputs = () => {
    messageEl.textContent = '';
    resultEl.textContent = '';
    detailsEl.innerHTML = '';
  };

  const applySelectedProduct = () => {
    const selectedKey = sealantProductSelect?.value || 'custom';
    const spec = WR_MEADOWS_SPECS[selectedKey] || WR_MEADOWS_SPECS.custom;
    if (productSpecNoteEl) {
      productSpecNoteEl.textContent = spec.note;
    }

    if (spec.lbPerGal !== null) {
      unitWeightGalInput.value = spec.lbPerGal.toFixed(2).replace(/\.00$/, '');
    }
  };

  const calculate = () => {
    clearOutputs();

    const lbPerGal = parseFloat(unitWeightGalInput.value);
    const widthIn = parseFloat(jointWidthInput.value);
    const depthIn = parseFloat(jointDepthInput.value);
    const lengthFt = parseFloat(jointLengthInput.value);

    if (Number.isNaN(lbPerGal) || lbPerGal <= 0) {
      messageEl.textContent = 'Sealant unit weight (lb/gal) must be greater than zero.';
      return;
    }
    if (Number.isNaN(widthIn) || widthIn <= 0) {
      messageEl.textContent = 'Joint width must be greater than zero.';
      return;
    }
    if (Number.isNaN(depthIn) || depthIn <= 0) {
      messageEl.textContent = 'Joint depth must be greater than zero.';
      return;
    }
    if (!Number.isNaN(lengthFt) && lengthFt < 0) {
      messageEl.textContent = 'Total joint length cannot be negative.';
      return;
    }

    const densityLbPerCf = lbPerGal / GALLON_TO_CUBIC_FOOT;
    const volumePerFtCf = (widthIn * depthIn * 12) / CUBIC_INCHES_PER_CUBIC_FOOT;
    const lbPerFt = densityLbPerCf * volumePerFtCf;
    const lbPer100Ft = lbPerFt * 100;

    const hasLength = !Number.isNaN(lengthFt) && lengthFt > 0;
    const totalLb = hasLength ? lbPerFt * lengthFt : 0;
    const totalGal = hasLength ? totalLb / lbPerGal : 0;

    resultEl.innerHTML = `
      <p><strong>Density:</strong> ${formatNumber(densityLbPerCf, 3)} lb/cf</p>
      <p><strong>Joint volume:</strong> ${formatNumber(volumePerFtCf, 6)} cf/ft</p>
      <p><strong>Weight factor:</strong> ${formatNumber(lbPerFt, 3)} lb/ft (${formatNumber(lbPer100Ft, 2)} lb/100 ft)</p>
      <p><strong>Totals:</strong> ${hasLength ? `${formatNumber(totalLb, 2)} lb (${formatNumber(totalGal, 2)} gal)` : 'Enter total length for overall lb and gallons.'}</p>
    `;

    detailsEl.innerHTML = `
      <p><strong>Density:</strong> ${formatNumber(lbPerGal, 3)} lb/gal ÷ ${formatNumber(GALLON_TO_CUBIC_FOOT, 5)} cf/gal = ${formatNumber(densityLbPerCf, 3)} lb/cf</p>
      <p><strong>Volume per foot:</strong> (${formatNumber(widthIn, 3)} × ${formatNumber(depthIn, 3)} × 12) ÷ 1728 = ${formatNumber(volumePerFtCf, 6)} cf/ft</p>
      <p><strong>Weight per foot:</strong> ${formatNumber(densityLbPerCf, 3)} × ${formatNumber(volumePerFtCf, 6)} = ${formatNumber(lbPerFt, 3)} lb/ft</p>
      <p><strong>Per 100 feet:</strong> ${formatNumber(lbPerFt, 3)} × 100 = ${formatNumber(lbPer100Ft, 2)} lb/100 ft</p>
      <p><strong>Total:</strong> ${hasLength ? `${formatNumber(lbPerFt, 3)} × ${formatNumber(lengthFt, 2)} = ${formatNumber(totalLb, 2)} lb; gallons = ${formatNumber(totalLb, 2)} ÷ ${formatNumber(lbPerGal, 3)} = ${formatNumber(totalGal, 2)} gal` : 'N/A (length not entered)'}</p>
    `;
  };

  const loadSample = () => {
    if (sealantProductSelect) {
      sealantProductSelect.value = 'wr3405m';
      applySelectedProduct();
    }
    unitWeightGalInput.value = '9.2';
    jointWidthInput.value = '1';
    jointDepthInput.value = '0.25';
    jointLengthInput.value = '1';
    calculate();
    messageEl.textContent = 'Sample loaded from note (1 in × 1/4 in joint).';
  };

  const clearInputs = () => {
    unitWeightGalInput.value = '';
    jointWidthInput.value = '';
    jointDepthInput.value = '';
    jointLengthInput.value = '';
    clearOutputs();
  };

  document.getElementById('calculateRubber').addEventListener('click', calculate);
  document.getElementById('loadSample').addEventListener('click', loadSample);
  document.getElementById('clearInputs').addEventListener('click', clearInputs);
  sealantProductSelect?.addEventListener('change', () => {
    applySelectedProduct();
    clearOutputs();
  });

  applySelectedProduct();
});
