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
  const siteFieldIds = [
    'siteDate',
    'analyst',
    'subdivision',
    'township',
    'majorRoad',
    'minorRoad'
  ];
  const measuredFieldIds = [
    'majorWidth',
    'minorWidth',
    'obsA',
    'obsB',
    'obsC',
    'obsD',
    'deltaAngle',
    'majorSpeed'
  ];
  const assumedFieldIds = [
    'safetyFactor',
    'driverOffset',
    'reactionTime',
    'decelerationRate',
    'clearanceDistance',
    'safeApproachSpeed'
  ];
  const assumedDefaults = {
    safetyFactor: '5',
    driverOffset: '3',
    reactionTime: '2.5',
    decelerationRate: '11.2',
    clearanceDistance: '',
    safeApproachSpeed: '10'
  };

  const storageKey = 'stop-yield-inputs-v1';
  const parseNumeric = (value) => {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  };
  const previewOutput = document.getElementById('previewOutput');
  const calcContainer = document.getElementById('calcOutputs');
  const calcTable = document.getElementById('calcTable');
  const distD2AInput = document.getElementById('distD2A');
  const distD2CInput = document.getElementById('distD2C');
  const v2aDisplay = document.getElementById('v2aDisplay');
  const v2cDisplay = document.getElementById('v2cDisplay');
  const recommendationWrap = document.getElementById('controlRecommendation');
  const recommendationIcon = document.getElementById('controlIcon');
  const recommendationText = document.getElementById('controlText');
  const resetSiteButton = document.getElementById('resetSiteBtn');
  const resetMeasuredButton = document.getElementById('resetMeasuredBtn');
  const defaultAssumedButton = document.getElementById('defaultAssumedBtn');
  const expandDiagramButton = document.getElementById('expandDiagramBtn');
  const summarySection = document.getElementById('printableSummary');
  const summaryRecommendation = document.getElementById('summaryRecommendation');
  const summarySign = document.getElementById('summarySign');
  const summaryControl = document.getElementById('summaryControl');
  const summaryV2a = document.getElementById('summaryV2a');
  const summaryV2c = document.getElementById('summaryV2c');
  const summarySafeApproachLine = document.getElementById('summarySafeApproachLine');
  const summaryFields = {
    date: document.getElementById('summaryDate'),
    analyst: document.getElementById('summaryAnalyst'),
    subdivision: document.getElementById('summarySubdivision'),
    township: document.getElementById('summaryTownship'),
    majorRoad: document.getElementById('summaryMajorRoad'),
    minorRoad: document.getElementById('summaryMinorRoad'),
    majorWidth: document.getElementById('summaryMajorWidth'),
    minorWidth: document.getElementById('summaryMinorWidth'),
    obsA: document.getElementById('summaryObsA'),
    obsB: document.getElementById('summaryObsB'),
    obsC: document.getElementById('summaryObsC'),
    obsD: document.getElementById('summaryObsD'),
    delta: document.getElementById('summaryDelta'),
    postedSpeed: document.getElementById('summaryPostedSpeed'),
    safetyFactor: document.getElementById('summarySafetyFactor'),
    driverOffset: document.getElementById('summaryDriverOffset'),
    reaction: document.getElementById('summaryReaction'),
    decel: document.getElementById('summaryDecel'),
    safeApproach: document.getElementById('summarySafeApproach'),
    V1: document.getElementById('summaryV1'),
    D1: document.getElementById('summaryD1'),
    D2a: document.getElementById('summaryD2a'),
    D2c: document.getElementById('summaryD2c')
  };
  const printButton = document.getElementById('printSummaryBtn');

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
    const majorSpeed = parseNumeric(data.majorSpeed);
    const safetyFactor = parseNumeric(data.safetyFactor);
    const reactionTime = parseNumeric(data.reactionTime);
    const decel = parseNumeric(data.decelerationRate);
    const driverOffset = parseNumeric(data.driverOffset);
    const majorWidth = parseNumeric(data.majorWidth);
    const minorWidth = parseNumeric(data.minorWidth);
    const obsA = parseNumeric(data.obsA);
    const obsB = parseNumeric(data.obsB);
    const obsC = parseNumeric(data.obsC);
    const obsD = parseNumeric(data.obsD);
    const delta = parseNumeric(data.deltaAngle);

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

    const calculateD2A = (aprime, bprime) => {
      if (![aprime, bprime, D1].every(Number.isFinite)) return null;
      if (!Number.isFinite(delta) || aprime === 0) return null;

      const step1 = 90 - delta;
      const step2 = Math.tan(toRadians(step1)) * aprime;
      const sinDelta = Math.sin(toRadians(delta));
      if (Math.abs(sinDelta) < 1e-6) return null;
      const step3 = bprime / sinDelta;
      const step4 = D1 - step3 - step2;
      const step5 = toDegrees(Math.atan(step4 / aprime));
      const step6 = 90 - step5;
      const step7 = 180 - delta - step6;
      const sinStep7 = Math.sin(toRadians(step7));
      const sinStep6 = Math.sin(toRadians(step6));
      if (Math.abs(sinStep7) < 1e-6) return null;
      return (D1 / sinStep7) * sinStep6;
    };

    const calculateD2C = (cprime, dprime) => {
      if (![cprime, dprime, D1].every(Number.isFinite)) return null;
      if (!Number.isFinite(delta) || dprime === 0) return null;

      const step1 = 90 - delta;
      const step2 = Math.tan(toRadians(Math.abs(step1))) * dprime;
      const sinDelta = Math.sin(toRadians(delta));
      if (Math.abs(sinDelta) < 1e-6) return null;
      const step3 = cprime / sinDelta;
      const step4a = D1 - step3 - step2;
      const step4b = D1 - step4a;
      const step5 = toDegrees(Math.atan(step4b / dprime));
      const step6 = 90 - step5;
      const step7 = 180 - step1 - step6 - 90;
      const sinStep7 = Math.sin(toRadians(step7));
      const sinStep6 = Math.sin(toRadians(step6));
      if (Math.abs(sinStep7) < 1e-6) return null;
      return (D1 / sinStep7) * sinStep6;
    };

    const solveSafeSpeed = (availableDistance) => {
      if (![availableDistance, reactionTime, decel].every(Number.isFinite)) {
        return null;
      }
      if (availableDistance <= 0 || decel <= 0) {
        return null;
      }
      const discriminant = decel * (43000 * availableDistance + 21609 * (reactionTime ** 2) * decel);
      const numerator = -147 * reactionTime * decel + Math.sqrt(discriminant);
      return numerator / 215;
    };

    const D2a = calculateD2A(aPrime, bPrime);
    const D2c = calculateD2C(cPrime, dPrime);

    const V2a = solveSafeSpeed(D2a);
    const V2c = solveSafeSpeed(D2c);

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
    const parsedSafeApproach = parseFloat(safeApproachSpeed);
    const safeApproachNumeric = Number.isFinite(parsedSafeApproach) ? parsedSafeApproach : null;
    const approachText = Number.isFinite(safeApproachNumeric)
      ? `Target safe approach: ${safeApproachNumeric} mph`
      : '';

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
    if (v2aDisplay) {
      v2aDisplay.textContent = calcs && Number.isFinite(calcs.V2a) ? formatNumber(calcs.V2a, 1) : '—';
    }
    if (v2cDisplay) {
      v2cDisplay.textContent = calcs && Number.isFinite(calcs.V2c) ? formatNumber(calcs.V2c, 1) : '—';
    }

    let yieldOK = null;
    const hasRecommendationInputs =
      calcs &&
      Number.isFinite(calcs?.V2a) &&
      Number.isFinite(calcs?.V2c) &&
      Number.isFinite(safeApproachNumeric);

    if (recommendationWrap) {
      if (
        hasRecommendationInputs &&
        recommendationIcon &&
        recommendationText
      ) {
        yieldOK = calcs.V2a >= safeApproachNumeric && calcs.V2c >= safeApproachNumeric;
        recommendationWrap.classList.remove('hidden');
        if (yieldOK) {
          recommendationIcon.src = 'r1-2.gif';
          recommendationIcon.alt = 'Yield sign';
          recommendationText.textContent = 'YIELD sign recommended';
        } else {
          recommendationIcon.src = 'r1-1.gif';
          recommendationIcon.alt = 'Stop sign';
          recommendationText.textContent = 'STOP sign required';
        }
      } else {
        recommendationWrap.classList.add('hidden');
      }
    }

    updateSummary(data, calcs, safeApproachNumeric, yieldOK, hasRecommendationInputs);

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

  const setText = (node, value) => {
    if (node) {
      node.textContent = value;
    }
  };

  const setFieldValue = (fieldId, value = '') => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.value = value;
    }
  };

  const resetFields = (fieldIds, defaultsMap) => {
    fieldIds.forEach((fieldId) => {
      const hasDefault = defaultsMap && Object.prototype.hasOwnProperty.call(defaultsMap, fieldId);
      const nextValue = hasDefault ? defaultsMap[fieldId] : '';
      setFieldValue(fieldId, nextValue);
    });
  };

  const updateSummary = (inputs, calcs, safeApproachNumeric, yieldOK, hasRecommendationInputs) => {
    if (!summarySection) return;

    if (!calcs) {
      summarySection.classList.add('hidden');
      if (summaryRecommendation) {
        summaryRecommendation.classList.add('hidden');
      }
      if (printButton) {
        printButton.disabled = true;
      }
      return;
    }

    summarySection.classList.remove('hidden');
    if (printButton) {
      printButton.disabled = false;
    }

    const textOrDash = (value) => {
      if (!value) return '—';
      return String(value).trim() || '—';
    };
    const numOrDash = (value, digits = 2) => {
      const num = parseNumeric(value);
      return Number.isFinite(num) ? formatNumber(num, digits) : '—';
    };

    const dateValue = inputs.siteDate ? new Date(inputs.siteDate) : null;
    const dateText = dateValue && !Number.isNaN(dateValue.valueOf())
      ? dateValue.toLocaleDateString()
      : '—';

    setText(summaryFields.date, dateText);
    setText(summaryFields.analyst, textOrDash(inputs.analyst));
    setText(summaryFields.subdivision, textOrDash(inputs.subdivision));
    setText(summaryFields.township, textOrDash(inputs.township));
    setText(summaryFields.majorRoad, textOrDash(inputs.majorRoad));
    setText(summaryFields.minorRoad, textOrDash(inputs.minorRoad));

    setText(summaryFields.majorWidth, numOrDash(inputs.majorWidth));
    setText(summaryFields.minorWidth, numOrDash(inputs.minorWidth));
    setText(summaryFields.obsA, numOrDash(inputs.obsA));
    setText(summaryFields.obsB, numOrDash(inputs.obsB));
    setText(summaryFields.obsC, numOrDash(inputs.obsC));
    setText(summaryFields.obsD, numOrDash(inputs.obsD));
    setText(summaryFields.delta, numOrDash(inputs.deltaAngle, 1));
    setText(summaryFields.postedSpeed, numOrDash(inputs.majorSpeed, 1));

    setText(summaryFields.safetyFactor, numOrDash(inputs.safetyFactor, 1));
    setText(summaryFields.driverOffset, numOrDash(inputs.driverOffset, 1));
    setText(summaryFields.reaction, numOrDash(inputs.reactionTime, 2));
    setText(summaryFields.decel, numOrDash(inputs.decelerationRate, 1));
    setText(summaryFields.safeApproach, Number.isFinite(safeApproachNumeric) ? formatNumber(safeApproachNumeric, 1) : '—');
    setText(summarySafeApproachLine, Number.isFinite(safeApproachNumeric) ? formatNumber(safeApproachNumeric, 1) : '—');

    setText(summaryFields.V1, Number.isFinite(calcs.V1) ? formatNumber(calcs.V1, 2) : '—');
    setText(summaryFields.D1, Number.isFinite(calcs.D1) ? formatNumber(calcs.D1, 2) : '—');
    setText(summaryFields.D2a, Number.isFinite(calcs.D2a) ? formatNumber(calcs.D2a, 2) : '—');
    setText(summaryFields.D2c, Number.isFinite(calcs.D2c) ? formatNumber(calcs.D2c, 2) : '—');
    setText(summaryV2a, Number.isFinite(calcs.V2a) ? formatNumber(calcs.V2a, 1) : '—');
    setText(summaryV2c, Number.isFinite(calcs.V2c) ? formatNumber(calcs.V2c, 1) : '—');

    if (summaryRecommendation) {
      if (hasRecommendationInputs && summarySign && summaryControl) {
        summaryRecommendation.classList.remove('hidden');
        if (yieldOK) {
          summarySign.src = 'r1-2.gif';
          summarySign.alt = 'Yield sign';
          summaryControl.textContent = 'YIELD sign recommended';
        } else {
          summarySign.src = 'r1-1.gif';
          summarySign.alt = 'Stop sign';
          summaryControl.textContent = 'STOP sign required';
        }
      } else {
        summaryRecommendation.classList.add('hidden');
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
  if (resetSiteButton) {
    resetSiteButton.addEventListener('click', () => {
      resetFields(siteFieldIds);
      handleSave();
    });
  }
  if (resetMeasuredButton) {
    resetMeasuredButton.addEventListener('click', () => {
      resetFields(measuredFieldIds);
      handleSave();
    });
  }
  if (defaultAssumedButton) {
    defaultAssumedButton.addEventListener('click', () => {
      resetFields(assumedFieldIds, assumedDefaults);
      handleSave();
    });
  }

  if (printButton) {
    printButton.addEventListener('click', () => {
      window.print();
    });
  }
  if (expandDiagramButton) {
    expandDiagramButton.addEventListener('click', () => {
      window.open('diagram.png', '_blank', 'noopener');
    });
  }

  loadInputs();
});
