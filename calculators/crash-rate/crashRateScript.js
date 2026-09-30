let currentMode = 'segment';

function setMode(mode) {
  currentMode = mode;
  const isSegment = mode === 'segment';
  document.getElementById('segmentFields').classList.toggle('hidden', !isSegment);
  document.getElementById('intersectionFields').classList.toggle('hidden', isSegment);
  document.getElementById('result').textContent = '';

  document.getElementById('segmentBtn').classList.toggle('selected', isSegment);
  document.getElementById('intersectionBtn').classList.toggle('selected', !isSegment);
}

function calculateCrashRate() {
  const resultDiv = document.getElementById('result');
  resultDiv.textContent = '';

  if (currentMode === 'segment') {
    const crashes = parseFloat(document.getElementById('segCrashes').value);
    const adt = parseFloat(document.getElementById('segAdt').value);
    const length = parseFloat(document.getElementById('segLength').value);
    const years = parseFloat(document.getElementById('segYears').value);

    if ([crashes, adt, length, years].some((n) => Number.isNaN(n) || n <= 0)) {
      resultDiv.textContent = 'Please enter valid positive values for segment calculations.';
      return;
    }

    const vmt = adt * length * 365 * years; // vehicle-miles traveled over the study period
    const crashRate = (crashes * 1_000_000) / vmt;
    resultDiv.textContent = `Crash Rate: ${crashRate.toFixed(2)} crashes per million VMT`;
  } else {
    const crashes = parseFloat(document.getElementById('intCrashes').value);
    const majorAdt = parseFloat(document.getElementById('intMajorAdt').value);
    const minorAdt = parseFloat(document.getElementById('intMinorAdt').value);
    const years = parseFloat(document.getElementById('intYears').value);

    if ([crashes, majorAdt, minorAdt, years].some((n) => Number.isNaN(n) || n <= 0)) {
      resultDiv.textContent = 'Please enter valid positive values for intersection calculations.';
      return;
    }

    const enteringAdt = majorAdt + minorAdt;
    const exposure = enteringAdt * 365 * years; // entering vehicles over the study period
    const crashRate = (crashes * 1_000_000) / exposure;
    resultDiv.textContent = `Crash Rate: ${crashRate.toFixed(2)} crashes per million entering vehicles`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setMode('segment');
});
