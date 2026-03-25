let ssdChart;
let currentCurveMode = 'forward';
let currentInverseStepIndex = 0;

const inverseStepSlides = [
  {
    src: 'img/Step1.png',
    alt: 'Google Earth Pro desktop view showing the first step for locating and reviewing the crest vertical curve in plan/profile context',
    caption: '<strong>Step 1:</strong> Open the site in Google Earth Pro and identify the crest vertical curve limits you want to check.'
  },
  {
    src: 'img/Step2.png',
    alt: 'Google Earth Pro desktop view showing the second step for reading grades and curve information from the terrain profile',
    caption: '<strong>Step 2:</strong> Use the terrain profile to read the approach and departure tangent grades for the crest curve.'
  },
  {
    src: 'img/Step3.png',
    alt: 'Google Earth Pro desktop view showing the third step for measuring the curve length to enter in the supported speed calculator',
    caption: '<strong>Step 3:</strong> Measure the vertical-curve length and enter `g1`, `g2`, and `L` here to estimate the supported design speed.'
  }
];

const curveModeCopy = {
  forward: {
    purpose: 'Use this calculator to estimate the minimum required length and K value for a crest vertical curve connecting two vertical tangents, based on the selected stopping or passing sight-distance criterion.',
    howToUse: 'Select <strong>AASHTO Stopping</strong>, <strong>RCOC Stopping</strong>, or <strong>AASHTO Passing</strong>. The calculator applies the matching sight-distance table and default heights automatically. Then enter the initial and final tangent grades plus the design speed. If needed, you can still edit the eye and object heights manually for a custom check.'
  },
  inverse: {
    purpose: 'Use this calculator to evaluate an existing crest vertical curve connecting two vertical tangents and estimate the maximum supported design speed and K value based on the selected stopping or passing sight-distance criterion.',
    howToUse: 'Select <strong>AASHTO Stopping</strong>, <strong>RCOC Stopping</strong>, or <strong>AASHTO Passing</strong>. The calculator applies the matching sight-distance table and default heights automatically. Then enter the initial tangent grade, final tangent grade, and existing vertical-curve length. If needed, you can still edit the eye and object heights manually for a custom check.'
  }
};

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

function getSelectedSightType() {
  const typeInput = document.querySelector('input[name="sight-type"]:checked');
  return typeInput?.value || 'stopping';
}

function getHeightsForType(type) {
  if (type === 'passing') {
    return { h1: 3.5, h2: 3.5 };
  }

  if (type === 'rcoc') {
    return { h1: 3.5, h2: 0.5 };
  }

  return { h1: 3.5, h2: 2.0 };
}

function setHeights() {
  const selectedType = getSelectedSightType();
  const { h1, h2 } = getHeightsForType(selectedType);

  const eyeHeight = document.getElementById('eye-height');
  const objectHeight = document.getElementById('object-height');
  if (eyeHeight && objectHeight) {
    eyeHeight.value = h1;
    objectHeight.value = h2;
  }

  updateSpeedOptions(selectedType);
}

function updateSpeedOptions(selectedType) {
  const speedSelect = document.getElementById('speed');
  if (!speedSelect) return;

  const options = Array.from(speedSelect.options);
  const passingMode = selectedType === 'passing';

  options.forEach((option) => {
    const supportsPassing = option.dataset.passingSupported !== 'false';
    option.disabled = passingMode && !supportsPassing;
  });

  if (speedSelect.selectedOptions.length && !speedSelect.selectedOptions[0].disabled) {
    return;
  }

  const firstEnabledOption = options.find((option) => !option.disabled);
  if (firstEnabledOption) {
    speedSelect.value = firstEnabledOption.value;
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

function getPassingSightDistance(speed) {
  const speedToDistance = {
    20: 710,
    25: 900,
    30: 1090,
    35: 1280,
    40: 1470,
    45: 1625,
    50: 1835,
    55: 1985,
    60: 2135,
    65: 2285,
    70: 2480,
    75: 2580,
    80: 2680
  };
  return speedToDistance[speed] || 0;
}

function getSightDistanceTable(type) {
  if (type === 'passing') {
    return {
      20: 710,
      25: 900,
      30: 1090,
      35: 1280,
      40: 1470,
      45: 1625,
      50: 1835,
      55: 1985,
      60: 2135,
      65: 2285,
      70: 2480,
      75: 2580,
      80: 2680
    };
  }

  return {
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
}

function getSightDistance(type, speed) {
  return getSightDistanceTable(type)[speed] || 0;
}

function calculateRequiredCurveLength(A, S, h1, h2) {
  if (!(A > 0) || !(S > 0) || !(h1 > 0) || !(h2 > 0)) {
    return { curveLength: null, equationDisplay: null };
  }

  const sqrtH1H2 = Math.sqrt(2 * h1) + Math.sqrt(2 * h2);
  const tempLength = (A * S * S) / (100 * Math.pow(sqrtH1H2, 2));
  const useShortCurve = S < tempLength;
  const curveLength = useShortCurve
    ? tempLength
    : 2 * S - (200 * Math.pow(Math.sqrt(h1) + Math.sqrt(h2), 2)) / A;

  return {
    curveLength,
    equationDisplay: getEquationDisplay(useShortCurve)
  };
}

function getEquationDisplay(isShortCurve) {
  if (isShortCurve) {
    return {
      condition: 'Case 1: S < L',
      math: `
        <math display="block" aria-label="L equals A S squared over 100 times the quantity square root of 2 h 1 plus square root of 2 h 2, squared">
          <mrow>
            <mi>L</mi>
            <mo>=</mo>
            <mfrac>
              <mrow>
                <mi>A</mi>
                <msup>
                  <mi>S</mi>
                  <mn>2</mn>
                </msup>
              </mrow>
              <mrow>
                <mn>100</mn>
                <msup>
                  <mrow>
                    <mo>(</mo>
                    <msqrt>
                      <mrow>
                        <mn>2</mn>
                        <msub><mi>h</mi><mn>1</mn></msub>
                      </mrow>
                    </msqrt>
                    <mo>+</mo>
                    <msqrt>
                      <mrow>
                        <mn>2</mn>
                        <msub><mi>h</mi><mn>2</mn></msub>
                      </mrow>
                    </msqrt>
                    <mo>)</mo>
                  </mrow>
                  <mn>2</mn>
                </msup>
              </mrow>
            </mfrac>
          </mrow>
        </math>
      `
    };
  }

  return {
    condition: 'Case 2: S > L',
    math: `
      <math display="block" aria-label="L equals 2 S minus 200 times the quantity square root of h 1 plus square root of h 2, squared, over A">
        <mrow>
          <mi>L</mi>
          <mo>=</mo>
          <mn>2</mn>
          <mi>S</mi>
          <mo>-</mo>
          <mfrac>
            <mrow>
              <mn>200</mn>
              <msup>
                <mrow>
                  <mo>(</mo>
                  <msqrt><msub><mi>h</mi><mn>1</mn></msub></msqrt>
                  <mo>+</mo>
                  <msqrt><msub><mi>h</mi><mn>2</mn></msub></msqrt>
                  <mo>)</mo>
                </mrow>
                <mn>2</mn>
              </msup>
            </mrow>
            <mi>A</mi>
          </mfrac>
        </mrow>
      </math>
    `
  };
}

function getInverseEquationDisplay() {
  return {
    condition: 'Inverse Crest-Curve Check',
    math: `
      <math display="block" aria-label="A equals the absolute value of g 2 minus g 1 and K equals L over A">
        <mrow>
          <msub><mi>A</mi><mtext>actual</mtext></msub>
          <mo>=</mo>
          <mo>|</mo>
          <msub><mi>g</mi><mn>2</mn></msub>
          <mo>-</mo>
          <msub><mi>g</mi><mn>1</mn></msub>
          <mo>|</mo>
        </mrow>
      </math>
      <math display="block" aria-label="K actual equals L actual over A actual">
        <mrow>
          <msub><mi>K</mi><mtext>actual</mtext></msub>
          <mo>=</mo>
          <mfrac>
            <msub><mi>L</mi><mtext>actual</mtext></msub>
            <msub><mi>A</mi><mtext>actual</mtext></msub>
          </mfrac>
        </mrow>
      </math>
      <p class="equation-method-note">For each listed design speed in the selected criterion, the calculator computes the required crest-curve length using the current A, eye height, object height, and sight distance. The reported speed is the highest listed speed for which L<sub>actual</sub> &ge; L<sub>required</sub>.</p>
    `
  };
}

function getGradeDifference(grade1, grade2) {
  if (Number.isNaN(grade1) || Number.isNaN(grade2)) {
    return NaN;
  }

  return Math.abs(grade2 - grade1);
}

function isCrestCurveInput(grade1, grade2) {
  if (Number.isNaN(grade1) || Number.isNaN(grade2)) {
    return false;
  }

  return grade1 > grade2;
}

function updateCurveModeCopy(mode) {
  const copy = curveModeCopy[mode] || curveModeCopy.forward;
  const purposeEl = document.getElementById('curve-calculator-purpose');
  const howToUseEl = document.getElementById('curve-calculator-how-to-use');

  if (purposeEl) {
    purposeEl.textContent = copy.purpose;
  }
  if (howToUseEl) {
    howToUseEl.innerHTML = copy.howToUse;
  }
}

function renderInverseStep(index) {
  const step = inverseStepSlides[index];
  const imageEl = document.getElementById('inverse-step-image');
  const captionEl = document.getElementById('inverse-step-caption');
  const counterEl = document.getElementById('inverse-step-counter');
  const prevButton = document.getElementById('inverse-step-prev');
  const nextButton = document.getElementById('inverse-step-next');

  if (!step || !imageEl || !captionEl || !counterEl || !prevButton || !nextButton) {
    return;
  }

  currentInverseStepIndex = index;
  imageEl.src = step.src;
  imageEl.alt = step.alt;
  captionEl.innerHTML = step.caption;
  counterEl.textContent = `Step ${index + 1} of ${inverseStepSlides.length}`;
  prevButton.disabled = index === 0;
  nextButton.disabled = index === inverseStepSlides.length - 1;
}

function changeInverseStep(direction) {
  const nextIndex = currentInverseStepIndex + direction;
  if (nextIndex < 0 || nextIndex >= inverseStepSlides.length) {
    return;
  }

  renderInverseStep(nextIndex);
}

function initializeInverseSteps() {
  const prevButton = document.getElementById('inverse-step-prev');
  const nextButton = document.getElementById('inverse-step-next');
  if (!prevButton || !nextButton) {
    return;
  }

  prevButton.addEventListener('click', () => changeInverseStep(-1));
  nextButton.addEventListener('click', () => changeInverseStep(1));
  renderInverseStep(0);
}

function calculateCurveLength() {
  const eyeHeightEl = document.getElementById('eye-height');
  const objectHeightEl = document.getElementById('object-height');
  const grade1El = document.getElementById('forward-grade-1');
  const grade2El = document.getElementById('forward-grade-2');
  const speedEl = document.getElementById('speed');
  if (!eyeHeightEl || !objectHeightEl || !grade1El || !grade2El || !speedEl) return;

  const eyeHeight = parseFloat(eyeHeightEl.value);
  const objectHeight = parseFloat(objectHeightEl.value);
  const grade1 = parseFloat(grade1El.value);
  const grade2 = parseFloat(grade2El.value);
  const gradeDifference = getGradeDifference(grade1, grade2);
  const isCrest = isCrestCurveInput(grade1, grade2);
  const speed = parseInt(speedEl.value, 10);
  const sightType = getSelectedSightType();

  const h1 = eyeHeight;
  const h2 = objectHeight;
  const A = gradeDifference;
  const S = getSightDistance(sightType, speed);

  let curveLength;
  let kValue;
  let equationCondition;
  let equationMath;

  if (S > 0 && A > 0 && isCrest) {
    const requiredLengthData = calculateRequiredCurveLength(A, S, h1, h2);
    curveLength = requiredLengthData.curveLength;

    equationCondition = requiredLengthData.equationDisplay.condition;
    equationMath = requiredLengthData.equationDisplay.math;
    kValue = curveLength / A;
  } else if (A > 0 && !isCrest && !Number.isNaN(grade1) && !Number.isNaN(grade2)) {
    curveLength = 'N/A';
    kValue = 'N/A';
    equationCondition = 'Sag Curve Input';
    equationMath = 'This tool checks crest vertical curves only. For a crest curve, enter grades such that g1 > g2.';
  } else if (A > 0) {
    curveLength = 'N/A';
    kValue = 'N/A';
    equationCondition = 'Unavailable';
    equationMath = `${sightType === 'passing' ? 'Passing' : 'Stopping'} sight distance is not available for ${speed} mph.`;
  } else {
    curveLength = 'N/A';
    kValue = 'N/A';
    equationCondition = 'Input Error';
    equationMath = Number.isNaN(A)
      ? 'Enter valid initial and final tangent grades and a valid design speed.'
      : 'The two tangent grades must be different to form a vertical curve check.';
  }

  document.getElementById('forward-a-value').innerText = A > 0 ? `${A.toFixed(2)}%` : 'N/A';
  document.getElementById('curve-length').innerText = curveLength !== 'N/A' ? `${curveLength.toFixed(2)} ft` : 'N/A';
  document.getElementById('k-value').innerText = kValue !== 'N/A' ? kValue.toFixed(2) : 'N/A';
  document.getElementById('equation-condition').innerText = equationCondition;
  document.getElementById('equation').innerHTML = equationMath;
}

function renderInverseResult(aValue, kValue, speedText, sightDistanceText, condition, math) {
  document.getElementById('inverse-a-value').innerText = aValue;
  document.getElementById('inverse-k-value').innerText = kValue;
  document.getElementById('inverse-speed').innerText = speedText;
  document.getElementById('inverse-sight-distance').innerText = sightDistanceText;
  document.getElementById('inverse-equation-condition').innerText = condition;
  document.getElementById('inverse-equation').innerHTML = math;
}

function calculateSupportedSpeed() {
  const grade1El = document.getElementById('inverse-grade-1');
  const grade2El = document.getElementById('inverse-grade-2');
  const curveLengthEl = document.getElementById('inverse-curve-length');
  const eyeHeightEl = document.getElementById('eye-height');
  const objectHeightEl = document.getElementById('object-height');
  if (!grade1El || !grade2El || !curveLengthEl || !eyeHeightEl || !objectHeightEl) return;

  const grade1 = parseFloat(grade1El.value);
  const grade2 = parseFloat(grade2El.value);
  const actualLength = parseFloat(curveLengthEl.value);
  const gradeDifference = getGradeDifference(grade1, grade2);
  const isCrest = isCrestCurveInput(grade1, grade2);
  const h1 = parseFloat(eyeHeightEl.value);
  const h2 = parseFloat(objectHeightEl.value);
  const sightType = getSelectedSightType();
  const inverseDisplay = getInverseEquationDisplay();

  if ([grade1, grade2, actualLength].some((value) => Number.isNaN(value))) {
    renderInverseResult('N/A', 'N/A', 'N/A', 'N/A', 'Input Error', 'Enter valid numeric grades and curve length.');
    return;
  }

  if (!(actualLength > 0)) {
    renderInverseResult(
      gradeDifference ? `${gradeDifference.toFixed(2)}%` : 'N/A',
      'N/A',
      'N/A',
      'N/A',
      'Input Error',
      'Enter a curve length greater than zero.'
    );
    return;
  }

  if (!(gradeDifference > 0)) {
    renderInverseResult('N/A', 'N/A', 'N/A', 'N/A', 'Input Error', 'The two tangent grades must be different to form a vertical curve check.');
    return;
  }

  if (!isCrest) {
    renderInverseResult(
      `${gradeDifference.toFixed(2)}%`,
      (actualLength / gradeDifference).toFixed(2),
      'N/A',
      'N/A',
      'Sag Curve Input',
      'This tool checks crest vertical curves only. For a crest curve, enter grades such that g1 > g2.'
    );
    return;
  }

  const kValue = actualLength / gradeDifference;
  const table = getSightDistanceTable(sightType);
  const speeds = Object.keys(table)
    .map((speed) => parseInt(speed, 10))
    .sort((a, b) => a - b);

  let supportedSpeed = null;
  let supportedSightDistance = null;

  speeds.forEach((speed) => {
    const sightDistance = table[speed];
    const requiredLength = calculateRequiredCurveLength(gradeDifference, sightDistance, h1, h2).curveLength;
    if (requiredLength !== null && actualLength >= requiredLength) {
      supportedSpeed = speed;
      supportedSightDistance = sightDistance;
    }
  });

  let speedText;
  let sightDistanceText;
  let condition = inverseDisplay.condition;
  let math = inverseDisplay.math;

  if (supportedSpeed === null) {
    speedText = `Below ${speeds[0]} mph`;
    sightDistanceText = 'N/A';
    condition = 'Below Minimum Listed Speed';
  } else {
    speedText = `${supportedSpeed} mph`;
    sightDistanceText = `${supportedSightDistance} ft`;
    if (supportedSpeed === speeds[speeds.length - 1]) {
      condition = 'Highest Tabulated Speed Met';
      math += '<p class="equation-method-note">Meets or exceeds the highest tabulated speed in this tool.</p>';
    }
  }

  renderInverseResult(
    `${gradeDifference.toFixed(2)}%`,
    kValue.toFixed(2),
    speedText,
    sightDistanceText,
    condition,
    math
  );
}

function updateCurveCalculations() {
  if (currentCurveMode === 'inverse') {
    calculateSupportedSpeed();
    return;
  }

  calculateCurveLength();
}

function setCurveMode(mode) {
  currentCurveMode = mode;

  const forwardButton = document.getElementById('curve-mode-forward');
  const inverseButton = document.getElementById('curve-mode-inverse');
  const forwardPanel = document.getElementById('forward-panel');
  const inversePanel = document.getElementById('inverse-panel');
  const forwardOutput = document.getElementById('output');
  const inverseOutput = document.getElementById('inverse-output');
  if (!forwardButton || !inverseButton || !forwardPanel || !inversePanel || !forwardOutput || !inverseOutput) return;

  const forwardActive = mode === 'forward';

  forwardButton.classList.toggle('active', forwardActive);
  inverseButton.classList.toggle('active', !forwardActive);
  forwardButton.setAttribute('aria-pressed', String(forwardActive));
  inverseButton.setAttribute('aria-pressed', String(!forwardActive));
  forwardPanel.classList.toggle('hidden', !forwardActive);
  forwardOutput.classList.toggle('hidden', !forwardActive);
  inversePanel.classList.toggle('hidden', forwardActive);
  inverseOutput.classList.toggle('hidden', forwardActive);

  updateCurveModeCopy(mode);
  updateCurveCalculations();
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
    updateCurveCalculations();
    initializeInverseSteps();
    document.getElementById('curve-mode-forward')?.addEventListener('click', () => setCurveMode('forward'));
    document.getElementById('curve-mode-inverse')?.addEventListener('click', () => setCurveMode('inverse'));
    document.querySelectorAll('input[name="sight-type"]').forEach((input) => {
      input.addEventListener('change', () => {
        setHeights();
        updateCurveCalculations();
      });
    });
    document.querySelectorAll('.sight-distance-form input, .sight-distance-form select').forEach((input) => {
      if (input.name === 'sight-type') return;
      input.addEventListener('input', updateCurveCalculations);
      input.addEventListener('change', updateCurveCalculations);
    });
  }
  if (document.getElementById('initial-velocity')) {
    calculateDistance();
  }
});
