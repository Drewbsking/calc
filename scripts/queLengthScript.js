function calculateQueLength() {
  const vc = parseFloat(document.getElementById('vc').value);
  const tc = parseFloat(document.getElementById('tc').value);
  const tf = parseFloat(document.getElementById('tf').value);
  const p = parseFloat(document.getElementById('p').value);
  const vl = parseFloat(document.getElementById('vl').value);
  const resultsEl = document.getElementById('results');

  // Basic validation to avoid NaN results
  const inputs = [vc, tc, tf, p, vl];
  if (inputs.some((n) => Number.isNaN(n))) {
    resultsEl.textContent = 'Please enter all values before calculating.';
    return;
  }

  const k = 1.0; // Adjust as needed for your methodology
  const c = (vc * Math.exp((-k * tc) / 3600)) / (1 - Math.exp((-k * tf) / 3600));
  const SL = (Math.log((p * vc) / c) / Math.log(vc / c)) * vl;

  resultsEl.innerHTML = `
    <p>Left-turn capacity: ${c.toFixed(2)} vehicles/hour</p>
    <p>Storage length: ${SL.toFixed(2)} feet</p>
  `;
}
