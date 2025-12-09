document.addEventListener('DOMContentLoaded', () => {
  const fields = [
    'siteDate',
    'analyst',
    'subdivision',
    'township',
    'majorRoad',
    'minorRoad',
    'majorWidth',
    'minorWidth',
    'obsA',
    'obsB',
    'obsC',
    'obsD',
    'deltaAngle',
    'majorSpeed',
    'safetyFactor',
    'driverOffset',
    'reactionTime',
    'decelerationRate',
    'clearanceDistance',
    'safeApproachSpeed'
  ];

  const storageKey = 'stop-yield-inputs-v1';
  const previewOutput = document.getElementById('previewOutput');
  const calcContainer = document.getElementById('calcOutputs');
  const calcTable = document.getElementById('calcTable');
  const distD2AInput = document.getElementById('distD2A');
  const distD2CInput = document.getElementById('distD2C');

  const loadInputs = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (!saved) return;
      fields.forEach((fieldId) => {
        const el = document.getElementById(fieldId);
        if (el && saved[fieldId] !== undefined) {
          el.value = saved[fieldId];
        }
      });
      renderPreview(saved);
    } catch (error) {
      console.warn('Unable to load saved Stop/Yield inputs', error);
    }
  };

  const collectInputs = () => {
    const data = {};
    fields.forEach((fieldId) => {
      const el = document.getElementById(fieldId);
      if (el) {
        data[fieldId] = el.value;
      }
    });
    return data;
  };

  const computeCalcs = (data) => {
    const getNum = (value) => {
      const num = parseFloat(value);
      return Number.isFinite(num) ? num : null;
    };

    const majorSpeed = getNum(data.majorSpeed);
    const safetyFactor = getNum(data.safetyFactor);
    const reactionTime = getNum(data.reactionTime);
    const decel = getNum(data.decelerationRate);
    const driverOffset = getNum(data.driverOffset);
    const majorWidth = getNum(data.majorWidth);
    const minorWidth = getNum(data.minorWidth);
    const obsA = getNum(data.obsA);
    const obsB = getNum(data.obsB);
    const obsC = getNum(data.obsC);
    const obsD = getNum(data.obsD);
    const delta = getNum(data.deltaAngle);

    if ([majorSpeed, safetyFactor, reactionTime, decel].some((n) => !Number.isFinite(n))) {
      return null;
    }

    const V1 = majorSpeed + safetyFactor;
    const D1 = 1.47 * V1 * reactionTime + 1.075 * (V1 * V1) / decel;

    const halfMajor = Number.isFinite(majorWidth) ? majorWidth / 2 : null;
    const halfMinor = Number.isFinite(minorWidth) ? minorWidth / 2 : null;

    const offset = Number.isFinite(driverOffset) ? driverOffset : 0;
    const aPrime = Number.isFinite(obsA) && Number.isFinite(offset) && Number.isFinite(halfMajor)
      ? obsA - offset + halfMajor
      : null;
    const bPrime = Number.isFinite(obsB) && Number.isFinite(offset) && Number.isFinite(halfMinor)
      ? obsB + offset + halfMinor
      : null;
    const cPrime = Number.isFinite(obsC) && Number.isFinite(offset) && Number.isFinite(halfMinor)
      ? obsC - offset + halfMinor
      : null;
    const dPrime = Number.isFinite(obsD) && Number.isFinite(offset) && Number.isFinite(halfMajor)
      ? obsD + offset + halfMajor
      : null;

    const toRadians = (deg) => (deg * Math.PI) / 180;
    const toDegrees = (rad) => (rad * 180) / Math.PI;

    const calculateD2 = (primary, secondary) => {
      if (![primary, secondary, D1].every(Number.isFinite)) return null;
      if (!Number.isFinite(delta) || primary === 0) return null;

      const step1 = 90 - delta;
      const tanTerm = Math.tan(toRadians(step1));
      const step2 = tanTerm * primary;
      const sinDelta = Math.sin(toRadians(delta));
      if (Math.abs(sinDelta) < 1e-6) return null;
      const step3 = secondary / sinDelta;
      const step4 = D1 - step3 - step2;
      const step5 = toDegrees(Math.atan(step4 / primary));
      const step6 = 90 - step5;
      const step7 = 180 - delta - step6;
      const sinStep7 = Math.sin(toRadians(step7));
      const sinStep6 = Math.sin(toRadians(step6));
      if (Math.abs(sinStep7) < 1e-6) return null;
      return (D1 / sinStep7) * sinStep6;
    };

    const solveSafeSpeed = (availableDistance, approachDistance) => {
      if (![availableDistance, approachDistance, reactionTime, decel].every(Number.isFinite)) {
        return null;
      }
      if (availableDistance <= 0 || approachDistance <= 0 || decel <= 0) {
        return null;
      }
      const discriminant = 43000 * availableDistance + 21609 * (reactionTime ** 2) * approachDistance;
      const sqrtTerm = Math.sqrt(approachDistance * discriminant);
      const numerator = -147 * reactionTime * approachDistance + sqrtTerm;
      return numerator / 215;
    };

    const D2a = calculateD2(aPrime, bPrime);
    const D2c = calculateD2(cPrime, dPrime);

    const V2a = solveSafeSpeed(D2a, aPrime);
    const V2c = solveSafeSpeed(D2c, cPrime);

    return {
      V1,
      D1,
      aPrime,
      bPrime,
      cPrime,
      dPrime,
      D2a,
      D2c,
      V2a,
      V2c
    };
  };

  const formatNumber = (value, digits = 2) => {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  };

  const renderPreview = (data) => {
    if (!previewOutput) return;
    const {
      siteDate,
      analyst,
      township,
      majorRoad,
      minorRoad,
      majorSpeed,
      safeApproachSpeed
    } = data;

    const dateText = siteDate ? new Date(siteDate).toLocaleDateString() : 'Date TBD';
    const analystText = analyst || 'Analyst TBD';
    const location = [township, majorRoad && `${majorRoad} / ${minorRoad || ''}`.trim()]
      .filter(Boolean)
      .join(' • ') || 'Location TBD';
    const speedText = majorSpeed ? `${majorSpeed} mph posted` : 'Speed TBD';
    const approachText = safeApproachSpeed ? `Target safe approach: ${safeApproachSpeed} mph` : '';

    const calcs = computeCalcs(data);

    previewOutput.innerHTML = `
      <p><strong>${dateText}</strong> – ${analystText}</p>
      <p>${location}</p>
      <p>${speedText} ${approachText && ` | ${approachText}`}</p>
      <p class="note">Outputs (safe approach speed, stop vs. yield call, etc.) will populate here once criteria are wired in.</p>
    `;

    if (distD2AInput) {
      distD2AInput.value = calcs && Number.isFinite(calcs.D2a) ? formatNumber(calcs.D2a, 2) : '';
    }
    if (distD2CInput) {
      distD2CInput.value = calcs && Number.isFinite(calcs.D2c) ? formatNumber(calcs.D2c, 2) : '';
    }

    if (calcContainer && calcTable) {
      if (!calcs) {
        calcContainer.classList.add('hidden');
        calcTable.innerHTML = '<p class="note">Enter the posted speed, safety factor, reaction time, and deceleration to see the calculations.</p>';
      } else {
        calcContainer.classList.remove('hidden');
        calcTable.innerHTML = `
          <table>
            <tbody>
              <tr><th>V₁ (mph)</th><td>${formatNumber(calcs.V1, 2)}</td></tr>
              <tr><th>D₁ (SSD, ft)</th><td>${formatNumber(calcs.D1, 2)}</td></tr>
              <tr><th>a′ (ft)</th><td>${formatNumber(calcs.aPrime, 2)}</td></tr>
              <tr><th>b′ (ft)</th><td>${formatNumber(calcs.bPrime, 2)}</td></tr>
              <tr><th>c′ (ft)</th><td>${formatNumber(calcs.cPrime, 2)}</td></tr>
              <tr><th>d′ (ft)</th><td>${formatNumber(calcs.dPrime, 2)}</td></tr>
              <tr><th>D₂a (ft)</th><td>${formatNumber(calcs.D2a, 2)}</td></tr>
              <tr><th>D₂c (ft)</th><td>${formatNumber(calcs.D2c, 2)}</td></tr>
              <tr><th>V₂a (mph)</th><td>${formatNumber(calcs.V2a, 2)}</td></tr>
              <tr><th>V₂c (mph)</th><td>${formatNumber(calcs.V2c, 2)}</td></tr>
            </tbody>
          </table>
        `;
      }
    }
  };

  const handleSave = () => {
    const inputs = collectInputs();
    try {
      localStorage.setItem(storageKey, JSON.stringify(inputs));
      renderPreview(inputs);
      if (previewOutput) {
        previewOutput.classList.remove('hidden');
      }
    } catch (error) {
      console.warn('Unable to save Stop/Yield inputs', error);
    }
  };

  const saveButton = document.getElementById('generateSheet');
  if (saveButton) {
    saveButton.addEventListener('click', handleSave);
  }

  loadInputs();
});
