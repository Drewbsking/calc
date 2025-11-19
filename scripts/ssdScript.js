let ssdChart;

function calculateSSD(speed, grade, decelRate) {
  return (
    1.47 * speed * 2.5 +
    Math.pow(speed, 2) / (30 * (decelRate / 32.2 + grade / 100))
  );
}

function calculateDistances() {
  const speed = parseFloat(document.getElementById('velocity')?.value);
  const deceleration = parseFloat(document.getElementById('deceleration')?.value);
  const reactionTime = parseFloat(document.getElementById('reaction-time')?.value);
  const gradeInput = document.getElementById('grade');
  if ([speed, deceleration, reactionTime].some((v) => Number.isNaN(v)) || !gradeInput) {
    return;
  }
  const grade = parseFloat(gradeInput.value) / 100;

  const brakeReactionDistance = 1.47 * speed * reactionTime;
  document.getElementById('brake-reaction-distance').innerText = `${brakeReactionDistance.toFixed(2)} ft`;

  const brakingDistanceUphill = Math.pow(speed, 2) / (30 * ((deceleration / 32.2) - grade));
  document.getElementById('braking-distance-downhill').innerText = `${brakingDistanceUphill.toFixed(2)} ft`;

  const brakingDistanceDownhill = Math.pow(speed, 2) / (30 * ((deceleration / 32.2) + grade));
  document.getElementById('braking-distance-uphill').innerText = `${brakingDistanceDownhill.toFixed(2)} ft`;

  const totalStoppingDistanceUphill = brakeReactionDistance + brakingDistanceDownhill;
  document.getElementById('total-stopping-distance-uphill').innerText = `${totalStoppingDistanceUphill.toFixed(2)} ft`;

  const totalStoppingDistanceDownhill = brakeReactionDistance + brakingDistanceUphill;
  document.getElementById('total-stopping-distance-downhill').innerText = `${totalStoppingDistanceDownhill.toFixed(2)} ft`;

  updateChart(totalStoppingDistanceUphill, totalStoppingDistanceDownhill);
}

function updateChart(uphill, downhill) {
  const canvas = document.getElementById('ssdChart');
  if (!canvas) return;

  if (ssdChart) {
    ssdChart.data.datasets[0].data = [uphill, downhill];
    ssdChart.update();
  } else {
    const ctx = canvas.getContext('2d');
    ssdChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Uphill ⬆️', 'Downhill ⬇️'],
        datasets: [{
          label: 'Stopping Sight Distance (ft)',
          data: [uphill, downhill],
          backgroundColor: ['#3e95cd', '#8e5ea2'],
          borderColor: ['#3e95cd', '#8e5ea2'],
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true }
        }
      }
    });
  }
}

function setHeights() {
  const typeInput = document.querySelector('input[name="sight-type"]:checked');
  if (!typeInput) return;
  const selectedType = typeInput.value;
  let h1 = 3.5;
  let h2 = 2.0;

  if (selectedType === 'passing') {
    h2 = 3.5;
  } else if (selectedType === 'rcoc') {
    h2 = 0.5;
  }

  const eyeHeight = document.getElementById('eye-height');
  const objectHeight = document.getElementById('object-height');
  if (eyeHeight && objectHeight) {
    eyeHeight.value = h1;
    objectHeight.value = h2;
  }
}

function getStoppingSightDistance(speed) {
  const speedToDistance = {
    15: 80,
    20: 115,
    25: 155,
    30: 200,
    35: 250,
    40: 305,
    45: 360,
    50: 425,
    55: 495,
    60: 570,
    65: 645,
    70: 730,
    75: 820,
    80: 910,
    85: 1010
  };
  return speedToDistance[speed] || 0;
}

function calculateCurveLength() {
  const eyeHeightEl = document.getElementById('eye-height');
  const objectHeightEl = document.getElementById('object-height');
  const gradeDiffEl = document.getElementById('grade-difference');
  const speedEl = document.getElementById('speed');
  if (!eyeHeightEl || !objectHeightEl || !gradeDiffEl || !speedEl) return;

  const eyeHeight = parseFloat(eyeHeightEl.value);
  const objectHeight = parseFloat(objectHeightEl.value);
  const gradeDifference = parseFloat(gradeDiffEl.value);
  const speed = parseInt(speedEl.value, 10);

  const h1 = eyeHeight;
  const h2 = objectHeight;
  const A = gradeDifference;
  const S = getStoppingSightDistance(speed);

  let curveLength;
  let kValue;
  let equation;

  if (S > 0 && A > 0) {
    const sqrtH1H2 = Math.sqrt(2 * h1) + Math.sqrt(2 * h2);
    const tempLength = (A * S * S) / (100 * Math.pow(sqrtH1H2, 2));

    if (S < tempLength) {
      curveLength = tempLength;
      equation = 'L = (A × S²) / [100 × (√(2h₁) + √(2h₂))²]';
    } else {
      curveLength = 2 * S - (200 * Math.pow(Math.sqrt(h1) + Math.sqrt(h2), 2)) / A;
      equation = 'L = 2S - [200 × (√h₁ + √h₂)²] / A';
    }

    kValue = curveLength / A;
  } else {
    curveLength = 'N/A';
    kValue = 'N/A';
    equation = 'Invalid input values.';
  }

  document.getElementById('curve-length').innerText = curveLength !== 'N/A' ? `${curveLength.toFixed(2)} ft` : 'N/A';
  document.getElementById('k-value').innerText = kValue !== 'N/A' ? kValue.toFixed(2) : 'N/A';
  document.getElementById('equation').innerText = equation;
}

function calculateDistance() {
  const initialVelocityEl = document.getElementById('initial-velocity');
  const finalVelocityEl = document.getElementById('final-velocity');
  const gForceEl = document.getElementById('g-force');
  const prTimeEl = document.getElementById('pr-time');
  if (!initialVelocityEl || !finalVelocityEl || !gForceEl || !prTimeEl) return;

  const initialVelocityMPH = parseFloat(initialVelocityEl.value);
  const finalVelocityMPH = parseFloat(finalVelocityEl.value);
  const gForce = parseFloat(gForceEl.value);
  const prTime = parseFloat(prTimeEl.value) || 1.5;
  const gravity = 32.174;

  const initialVelocityFPS = initialVelocityMPH * 1.467;
  const finalVelocityFPS = finalVelocityMPH * 1.467;

  const prDistance = initialVelocityFPS * prTime;
  const deceleration = gForce * gravity;
  const brakingDistance = Math.abs((Math.pow(finalVelocityFPS, 2) - Math.pow(initialVelocityFPS, 2)) / (2 * deceleration));
  const totalDistance = prDistance + brakingDistance;
  const textHeight = prDistance / 30;

  document.getElementById('pr-distance').textContent = `${prDistance.toFixed(2)} ft`;
  document.getElementById('distance-traveled').textContent = `${totalDistance.toFixed(2)} ft`;
  document.getElementById('text-height').textContent = `${textHeight.toFixed(2)} ft`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ssdChart')) {
    calculateDistances();
  }
  if (document.querySelector('input[name="sight-type"]')) {
    setHeights();
    calculateCurveLength();
  }
  if (document.getElementById('initial-velocity')) {
    calculateDistance();
  }
});
