(() => {
  const el = (id) => document.getElementById(id);

  const inputs = {
    runLength: el('runLength'),
    stoneDepth: el('stoneDepth')
  };

  const perFootResults = el('perFootResults');
  const totalResults = el('totalResults');
  const calcDetails = el('calcDetails');
  const calcBtn = el('calculateBtn');
  const depthButtons = Array.from(document.querySelectorAll('[data-depth]'));

  const round2 = (val) => (Number.isFinite(val) ? val.toFixed(2) : '0.00');
  const fmt = (val, digits = 2) => (Number.isFinite(val) ? val.toFixed(digits) : '0.00');

  const setDepth = (depth) => {
    inputs.stoneDepth.value = depth;
    depthButtons.forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.depth === String(depth));
    });
  };

  const calculate = () => {
    const lengthFt = parseFloat(inputs.runLength.value) || 0;
    const depthFt = parseFloat(inputs.stoneDepth.value) || 0;
    const widthFt = 1.5; // fixed trench width
    const overlapFt = 1.5; // fixed overlap (ft)
    const seamFt = 1; // fixed seam allowance (ft)
    const pipeDiamIn = 6; // fixed pipe diameter
    const densityLb = 100; // fixed pea stone unit weight (lb/cf)

    const pipeDiamFt = pipeDiamIn / 12;
    const pipeArea = Math.PI * Math.pow(pipeDiamFt / 2, 2); // ft^2
    const trenchArea = widthFt * depthFt;
    const stoneArea = Math.max(trenchArea - pipeArea, 0);
    const tonsPerFt = stoneArea * densityLb / 2000;

    const wrapWidthFt = Math.max(widthFt + 2 * depthFt + overlapFt + seamFt, 0);
    const fabricSydPerFt = wrapWidthFt / 9;

    const pipePerFt = 1; // fixed at 6" pipe, 1 LFT per LFT

    const totalPipe = pipePerFt * lengthFt;
    const totalFabric = fabricSydPerFt * lengthFt;
    const totalStone = tonsPerFt * lengthFt;

    perFootResults.innerHTML = `
      <p><strong>Pipe:</strong> ${round2(pipePerFt)} LFT/ft</p>
      <p><strong>Fabric:</strong> ${round2(fabricSydPerFt)} SYD/ft (wrap width ${round2(wrapWidthFt)} ft)</p>
      <p><strong>Peastone:</strong> ${round2(tonsPerFt)} tons/ft</p>
    `;

    totalResults.innerHTML = `
      <p><strong>Pipe:</strong> ${round2(totalPipe)} LFT</p>
      <p><strong>Fabric:</strong> ${round2(totalFabric)} SYD</p>
      <p><strong>Peastone:</strong> ${round2(totalStone)} tons</p>
    `;

    calcDetails.innerHTML = `
      <p><strong>Fabric wrap:</strong> Width ${fmt(widthFt)} + 2×Depth ${fmt(depthFt)} + Overlap ${fmt(overlapFt)} + Seam ${fmt(seamFt)} = ${fmt(wrapWidthFt)} ft → ${fmt(fabricSydPerFt)} SYD/ft (wrap ÷ 9).</p>
      <p><strong>Peastone:</strong> Trench area ${fmt(trenchArea)} − Pipe area (π×(6/12)²/4) ${fmt(pipeArea, 3)} = ${fmt(stoneArea, 3)} sf → Tons/ft = ${fmt(stoneArea, 3)} × ${densityLb} ÷ 2000 = ${fmt(tonsPerFt, 3)}.</p>
      <p><strong>Pipe:</strong> Fixed at 1.00 LFT per LFT (6" pipe).</p>
    `;
  };

  depthButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const { depth } = btn.dataset;
      if (!depth) return;
      setDepth(depth);
      calculate();
    });
  });

  Object.values(inputs).forEach((input) => {
    input?.addEventListener('input', calculate);
  });

  // lock fixed fields visually
  calcBtn?.addEventListener('click', calculate);
  setDepth(inputs.stoneDepth.value || 1.5);
  calculate();
})();
