(function () {
  const hoursGroup = document.getElementById('hoursGroup');
  const daysGroup = document.getElementById('daysGroup');
  const plannedGroup = document.getElementById('plannedGroup');
  const longTermGroup = document.getElementById('longTermGroup');
  const personalExhaustedGroup = document.getElementById('personalExhaustedGroup');
  const validationMessage = document.getElementById('validationMessage');
  const decisionCard = document.getElementById('decisionCard');
  const decisionHeadline = document.getElementById('decisionHeadline');
  const decisionMeta = document.getElementById('decisionMeta');
  const decisionSteps = document.getElementById('decisionSteps');

  function getSelected(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    if (!checked) return null;
    return checked.value === 'yes';
  }

  function clearRadios(name) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = false;
    });
  }

  function hideGroup(group, radioNameToClear) {
    group.style.display = 'none';
    if (radioNameToClear) clearRadios(radioNameToClear);
  }

  function showGroup(group) {
    group.style.display = 'block';
  }

  function updateVisibility() {
    const healthRelated = getSelected('healthRelated');

    if (healthRelated === true) {
      showGroup(hoursGroup);
      showGroup(daysGroup);
      hideGroup(plannedGroup, 'plannedTime');
      hideGroup(longTermGroup, 'longTermMedical');
      hideGroup(personalExhaustedGroup, 'personalLeaveExhausted');
    } else if (healthRelated === false) {
      hideGroup(hoursGroup);
      hideGroup(daysGroup);
      showGroup(plannedGroup);

      const plannedTime = getSelected('plannedTime');
      if (plannedTime === false) {
        showGroup(longTermGroup);
        const longTerm = getSelected('longTermMedical');
        if (longTerm === true) {
          showGroup(personalExhaustedGroup);
        } else {
          hideGroup(personalExhaustedGroup, 'personalLeaveExhausted');
        }
      } else {
        hideGroup(longTermGroup, 'longTermMedical');
        hideGroup(personalExhaustedGroup, 'personalLeaveExhausted');
      }
    } else {
      hideGroup(hoursGroup);
      hideGroup(daysGroup);
      hideGroup(plannedGroup, 'plannedTime');
      hideGroup(longTermGroup, 'longTermMedical');
      hideGroup(personalExhaustedGroup, 'personalLeaveExhausted');
    }
  }

  function showValidation(message) {
    validationMessage.textContent = message;
    validationMessage.style.display = 'block';
    decisionCard.style.display = 'none';
  }

  function hideValidation() {
    validationMessage.style.display = 'none';
    validationMessage.textContent = '';
  }

  function parseNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, num);
  }

  function validateInputs(inputs) {
    if (inputs.healthRelated === null) {
      return 'Select whether the absence is related to illness, medical care, family care, mental health, or public health.';
    }

    if (inputs.healthRelated) {
      if (inputs.hoursUsed === null) return 'Enter personal leave hours already used this benefit year.';
      if (inputs.consecutiveDays === null) return 'Enter the expected number of consecutive days absent.';
    } else {
      if (inputs.plannedTime === null) return 'Select whether this is planned time off.';
      if (inputs.plannedTime === false && inputs.longTermMedical === null) {
        return 'Select whether this is long-term medical leave.';
      }
      if (inputs.longTermMedical === true && inputs.personalLeaveExhausted === null) {
        return 'Select whether personal leave has been exhausted.';
      }
    }

    return '';
  }

  function evaluate(inputs) {
    const steps = [];
    const path = [];
    let headline = '';
    let meta = '';

    if (inputs.healthRelated) {
      path.push('Health-related');
      const under72 = inputs.hoursUsed < 72;
      const longAbsence = inputs.consecutiveDays >= 3;

      headline = under72 ? 'Personal leave (ESTA-covered)' : 'Personal leave (non-ESTA rules)';
      steps.push('Reason is illness/medical/family/mental/public health so personal leave applies.');

      if (under72) {
        steps.push('Under 72 hours used this benefit year: automatically ESTA-covered if hours remain.');
        path.push('<72 hours used');
      } else {
        steps.push('Over 72 hours used: follow non-ESTA personal leave rules.');
        path.push('72+ hours used');
      }

      if (longAbsence) {
        steps.push('Absence is 3+ consecutive days: require medical note and fit-for-duty clearance.');
        path.push('3+ days');
      } else {
        steps.push('Shorter than 3 days: approve if staffing allows.');
        path.push('under 3 days');
      }
    } else {
      path.push('Not health-related');
      if (inputs.plannedTime) {
        headline = 'Vacation or personal leave';
        meta = 'Employee can choose either option if balances are available.';
        steps.push('Planned travel/personal time: use vacation or personal leave at employee choice.');
        path.push('Planned');
      } else if (inputs.longTermMedical) {
        path.push('Unplanned, long-term medical');
        const exhausted = inputs.personalLeaveExhausted === true;
        if (exhausted) {
          headline = 'Frozen Sick Bank and FMLA/Extended Sick Leave';
          steps.push('Personal leave is exhausted: move to the Frozen Sick Bank.');
          steps.push('Initiate FMLA/Extended Sick Leave application.');
          path.push('Personal leave exhausted');
        } else {
          headline = 'Personal leave';
          steps.push('Use remaining personal leave for long-term medical need.');
          steps.push('When personal leave is exhausted, transition to Frozen Sick Bank and FMLA/Extended Sick Leave.');
          path.push('Personal leave available');
        }
      } else {
        headline = 'Unpaid leave (if approved)';
        steps.push('Not planned and not medical: defaults to unpaid leave pending approval.');
        path.push('Unplanned, non-medical');
      }
    }

    if (!meta) meta = path.join(' \u2192 ');

    return { headline, meta, steps };
  }

  function renderResult(result) {
    decisionHeadline.textContent = result.headline;
    decisionMeta.textContent = result.meta;
    decisionSteps.innerHTML = '';
    result.steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      decisionSteps.appendChild(li);
    });
    decisionCard.style.display = 'block';
  }

  function handleSubmit(event) {
    event.preventDefault();
    const inputs = {
      healthRelated: getSelected('healthRelated'),
      plannedTime: getSelected('plannedTime'),
      longTermMedical: getSelected('longTermMedical'),
      personalLeaveExhausted: getSelected('personalLeaveExhausted'),
      hoursUsed: parseNumber(document.getElementById('hoursUsed').value),
      consecutiveDays: parseNumber(document.getElementById('consecutiveDays').value)
    };

    const validationError = validateInputs(inputs);
    if (validationError) {
      showValidation(validationError);
      return;
    }

    hideValidation();
    const result = evaluate(inputs);
    renderResult(result);
  }

  document.querySelectorAll('input[name="healthRelated"]').forEach((input) => {
    input.addEventListener('change', updateVisibility);
  });
  document.querySelectorAll('input[name="plannedTime"]').forEach((input) => {
    input.addEventListener('change', updateVisibility);
  });
  document.querySelectorAll('input[name="longTermMedical"]').forEach((input) => {
    input.addEventListener('change', updateVisibility);
  });

  document.getElementById('evaluateButton').addEventListener('click', handleSubmit);
  updateVisibility();
})();
