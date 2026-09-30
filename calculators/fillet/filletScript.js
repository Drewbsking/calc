const filletCoefficients = [1.1051, 0.40827, 0.2691, 0.16947, 0.11217, 0.07605, 0.05197, 0.03542, 0.02381, 0.01563, 0.0099, 0.00595, 0.00331, 0.00164, 0.00066, 0.00018, 0.00002, 0];

function fillet() {
  const radius = parseFloat(document.getElementById('radius').value);
  const angleIndex = parseInt(document.getElementById('angle').value, 10);
  const resultDiv = document.getElementById('result');

  if (Number.isNaN(radius) || Number.isNaN(angleIndex) || radius < 0 || angleIndex < 0) {
    resultDiv.textContent = 'Please select both an angle and a radius.';
    return;
  }

  const area = filletCoefficients[angleIndex] * radius ** 2;

  resultDiv.innerHTML = `<strong>Area (square yards):</strong> ${area.toFixed(2)}`;
}
