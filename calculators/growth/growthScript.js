function calculateGrowth() {
  const initialVolume = parseFloat(document.getElementById('initialVolume').value);
  const growthRate = parseFloat(document.getElementById('growthRate').value) / 100;
  const years = parseFloat(document.getElementById('years').value);

  if ([initialVolume, growthRate, years].some((n) => Number.isNaN(n))) {
    return;
  }

  const futureVolume = initialVolume * Math.pow(1 + growthRate, years);
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = `<strong>Future Traffic Volume (V<sub>t</sub>):</strong> ${futureVolume.toFixed(2)}`;
}

function calculateCAGR() {
  const initialValue = parseFloat(document.getElementById('initialValue').value);
  const endingValue = parseFloat(document.getElementById('endingValue').value);
  const years = parseFloat(document.getElementById('yearsCagr').value);

  if ([initialValue, endingValue, years].some((n) => Number.isNaN(n) || n <= 0)) {
    alert('Please enter positive numbers for all fields.');
    return;
  }

  const cagr = (Math.pow(endingValue / initialValue, 1 / years) - 1) * 100;
  const overallGrowth = ((endingValue - initialValue) / initialValue) * 100;

  const resultDiv = document.getElementById('cagrResult');
  resultDiv.innerHTML = `<strong>Annual Growth Rate:</strong> ${cagr.toFixed(4)}%<br>`;
  resultDiv.innerHTML += `<strong>Overall Growth:</strong> ${overallGrowth.toFixed(2)}%`;
  resultDiv.classList.remove('hidden');
}
