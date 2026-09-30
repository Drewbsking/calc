(function () {
    'use strict';

    const INCHES_PER_FOOT = 12;
    const ALLOWANCE_INCHES = 3;
    const SIGN_THRESHOLD_INCHES = (14 * INCHES_PER_FOOT) + 6;
    const FLOOR_TOLERANCE = 1e-9;

    const DIRECTIONS = {
        direction1: {
            label: 'Travel Direction 1',
            example: [14.87, 14.74, 15.32, 16.19, 15.97, 16.70],
            existingSign: { feet: 14, inches: 6 }
        },
        direction2: {
            label: 'Travel Direction 2',
            example: [16.87, 16.82, 17.33, 15.47, 15.73, 16.24],
            existingSign: { feet: 15, inches: 4 }
        }
    };

    const byId = (id) => document.getElementById(id);

    function decimalFeetToParts(decimalFeet) {
        let feet = Math.floor(decimalFeet);
        let inches = Math.round((decimalFeet - feet) * INCHES_PER_FOOT * 100) / 100;

        if (inches >= INCHES_PER_FOOT) {
            feet += 1;
            inches = 0;
        }

        return { feet, inches };
    }

    function formatInches(inches) {
        if (Number.isInteger(inches)) return String(inches);
        return inches.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    }

    function formatFeetInches(decimalFeet) {
        const parts = decimalFeetToParts(decimalFeet);
        return `${parts.feet}'-${formatInches(parts.inches)}"`;
    }

    function formatWholeInches(totalInches) {
        const feet = Math.floor(totalInches / INCHES_PER_FOOT);
        const inches = totalInches % INCHES_PER_FOOT;
        return `${feet}'-${inches}"`;
    }

    function wholeInchesToParts(totalInches) {
        return {
            feet: Math.floor(totalInches / INCHES_PER_FOOT),
            inches: totalInches % INCHES_PER_FOOT
        };
    }

    function getInputs(direction) {
        return Array.from(document.querySelectorAll(`.clearance-input[data-direction="${direction}"]`));
    }

    function readInput(input) {
        const raw = input.value.trim();
        return raw === '' ? null : Number(raw);
    }

    function updateInput(input) {
        const value = readInput(input);
        const isValid = value === null || (Number.isFinite(value) && value >= 0);
        const output = document.querySelector(`.clearance-conversion[for="${input.id}"]`);

        input.classList.toggle('underclearance-input-invalid', !isValid);
        input.setAttribute('aria-invalid', isValid ? 'false' : 'true');
        output.textContent = value !== null && isValid ? `= ${formatFeetInches(value)}` : '—';

        return { value, isValid };
    }

    function setExistingInputState(input, isValid) {
        input.classList.toggle('underclearance-input-invalid', !isValid);
        input.setAttribute('aria-invalid', isValid ? 'false' : 'true');
    }

    function readExistingSign(direction) {
        const status = byId(`${direction}-existing-status`).value;
        const valueFields = byId(`${direction}-existing-value`);
        const feetInput = byId(`${direction}-existing-feet`);
        const inchesInput = byId(`${direction}-existing-inches`);
        const isPosted = status === 'yes';

        valueFields.hidden = !isPosted;

        if (!isPosted) {
            setExistingInputState(feetInput, true);
            setExistingInputState(inchesInput, true);
            return { posted: false, complete: true, valid: true };
        }

        const feetRaw = feetInput.value.trim();
        const inchesRaw = inchesInput.value.trim();
        const feet = feetRaw === '' ? null : Number(feetRaw);
        const inches = inchesRaw === '' ? null : Number(inchesRaw);
        const feetValid = feet === null || (Number.isInteger(feet) && feet >= 0);
        const inchesValid = inches === null || (Number.isInteger(inches) && inches >= 0 && inches <= 11);

        setExistingInputState(feetInput, feetValid);
        setExistingInputState(inchesInput, inchesValid);

        return {
            posted: true,
            complete: feet !== null && inches !== null,
            valid: feetValid && inchesValid,
            feet,
            inches,
            totalInches: feet !== null && inches !== null ? (feet * INCHES_PER_FOOT) + inches : null
        };
    }

    function inchDifferenceText(inches) {
        return `${inches} inch${inches === 1 ? '' : 'es'}`;
    }

    function renderAction(direction, existingSign, signRequired, calculatedInches, calculatedValue) {
        const card = byId(`${direction}-action`);
        const title = byId(`${direction}-action-title`);
        const detail = byId(`${direction}-action-detail`);
        let action;

        if (existingSign.posted && !signRequired) {
            action = {
                type: 'remove',
                title: 'Remove the existing sign',
                detail: `A clearance sign is posted, but the actual measured minimum does not fall below the 14'-6" standard threshold. Remove the sign after confirming no separate site-specific requirement applies.`
            };
        } else if (existingSign.posted && (!existingSign.complete || !existingSign.valid)) {
            action = {
                type: 'review',
                title: 'Enter the existing sign value',
                detail: 'Provide whole feet and 0–11 inches to receive a sign action.'
            };
        } else if (!existingSign.posted && signRequired) {
            action = {
                type: 'add',
                title: 'Add a clearance sign',
                detail: `No sign is currently posted and the measured clearance triggers signing. Install ${calculatedValue}.`
            };
        } else if (!existingSign.posted) {
            action = {
                type: 'none',
                title: 'No sign action required',
                detail: `No sign is posted and the actual clearance does not fall below the 14'-6" standard threshold.`
            };
        } else {
            const existingValue = formatWholeInches(existingSign.totalInches);
            const difference = Math.abs(existingSign.totalInches - calculatedInches);

            if (existingSign.totalInches === calculatedInches) {
                action = {
                    type: 'keep',
                    title: 'Keep the existing sign',
                    detail: `The existing ${existingValue} sign matches the calculated ${calculatedValue} legend.`
                };
            } else if (existingSign.totalInches > calculatedInches) {
                action = {
                    type: 'replace',
                    title: 'Replace the existing sign',
                    detail: `The existing ${existingValue} sign shows ${inchDifferenceText(difference)} more clearance than the calculated ${calculatedValue} legend.`
                };
            } else {
                action = {
                    type: 'consider',
                    title: 'Consider replacing the existing sign',
                    detail: `The existing ${existingValue} sign is ${inchDifferenceText(difference)} more conservative than the calculated ${calculatedValue} legend. Confirm field conditions and current requirements before changing it.`
                };
            }
        }

        card.className = `underclearance-action-card underclearance-action-${action.type}`;
        title.textContent = action.title;
        detail.textContent = action.detail;
    }

    function renderMath(direction, inputs, values, controllingIndex, minimumFeet, adjustedInches, postedInches) {
        const mathList = byId(`${direction}-math`);
        const readings = values.map((value, index) => `${inputs[index].dataset.location} ${value}`).join('; ');
        const minimumInches = minimumFeet * INCHES_PER_FOOT;

        mathList.innerHTML = `
            <li><span>Follow this direction through both bridge ends and select its lowest reading</span><strong>min(${readings}) = ${minimumFeet} ft</strong></li>
            <li><span>Convert the actual minimum from decimal feet</span><strong>${minimumFeet} × 12 = ${formatInches(minimumInches)} in = ${formatFeetInches(minimumFeet)}</strong></li>
            <li><span>Subtract the 3-inch frost/resurfacing allowance</span><strong>${formatInches(minimumInches)} − 3 = ${formatInches(adjustedInches)} in</strong></li>
            <li><span>Round down to the nearest whole inch</span><strong>floor(${formatInches(adjustedInches)}) = ${postedInches} in</strong></li>
            <li><span>Convert the sign legend to feet–inches</span><strong>${postedInches} in = ${formatWholeInches(postedInches)}</strong></li>
        `;

        mathList.children[0].querySelector('span').append(` (${inputs[controllingIndex].dataset.location})`);
    }

    function renderDirection(direction) {
        const inputs = getInputs(direction);
        const states = inputs.map(updateInput);
        const existingSign = readExistingSign(direction);
        const values = states.map((state) => state.value);
        const invalidCount = states.filter((state) => !state.isValid).length;
        const missingCount = values.filter((value) => value === null).length;
        const empty = byId(`${direction}-empty`);
        const calculation = byId(`${direction}-calculation`);

        if (invalidCount > 0) {
            empty.textContent = 'Correct the highlighted reading to calculate this direction.';
            empty.hidden = false;
            calculation.hidden = true;
            return;
        }

        if (missingCount > 0) {
            empty.textContent = `Enter ${missingCount} more reading${missingCount === 1 ? '' : 's'} for ${DIRECTIONS[direction].label}.`;
            empty.hidden = false;
            calculation.hidden = true;
            return;
        }

        const minimumFeet = Math.min(...values);
        const controllingIndex = values.indexOf(minimumFeet);
        const actualInches = minimumFeet * INCHES_PER_FOOT;
        const adjustedInches = actualInches - ALLOWANCE_INCHES;
        const postedInches = Math.max(0, Math.floor(adjustedInches + FLOOR_TOLERANCE));
        const signRequired = actualInches < SIGN_THRESHOLD_INCHES;
        const postedValue = formatWholeInches(postedInches);
        const postedParts = wholeInchesToParts(postedInches);
        const actualValue = formatFeetInches(minimumFeet);
        const threshold = byId(`${direction}-threshold`);
        byId(`${direction}-sign-feet`).textContent = postedParts.feet;
        byId(`${direction}-sign-inches`).textContent = postedParts.inches;
        byId(`${direction}-sign`).setAttribute('aria-label', `${DIRECTIONS[direction].label} W12-2a clearance sign: ${postedParts.feet} feet ${postedParts.inches} inches`);
        byId(`${direction}-minimum`).textContent = `${minimumFeet} ft = ${actualValue}`;
        byId(`${direction}-location`).textContent = inputs[controllingIndex].dataset.location;
        byId(`${direction}-rounded`).textContent = postedValue;

        threshold.className = `underclearance-threshold-status ${signRequired ? 'underclearance-threshold-required' : 'underclearance-threshold-above'}`;
        threshold.textContent = signRequired
            ? `Actual minimum ${actualValue} is below 14'-6" — W12-2 required.`
            : `Actual minimum ${actualValue} is not below the 14'-6" standard threshold.`;

        renderAction(direction, existingSign, signRequired, postedInches, postedValue);
        renderMath(direction, inputs, values, controllingIndex, minimumFeet, adjustedInches, postedInches);
        empty.hidden = true;
        calculation.hidden = false;
    }

    function renderAll() {
        Object.keys(DIRECTIONS).forEach(renderDirection);
    }

    function initialize() {
        const form = byId('underclearance-form');
        if (!form) return;

        document.querySelectorAll('.clearance-input').forEach((input) => {
            input.addEventListener('input', () => renderDirection(input.dataset.direction));
        });

        document.querySelectorAll('.existing-sign-status').forEach((select) => {
            select.addEventListener('change', () => renderDirection(select.dataset.direction));
        });

        document.querySelectorAll('.existing-sign-feet, .existing-sign-inches').forEach((input) => {
            input.addEventListener('input', () => renderDirection(input.dataset.direction));
        });

        byId('load-example').addEventListener('click', () => {
            Object.entries(DIRECTIONS).forEach(([direction, config]) => {
                getInputs(direction).forEach((input, index) => {
                    input.value = config.example[index];
                });
                byId(`${direction}-existing-status`).value = 'yes';
                byId(`${direction}-existing-feet`).value = config.existingSign.feet;
                byId(`${direction}-existing-inches`).value = config.existingSign.inches;
            });
            renderAll();
        });

        form.addEventListener('reset', () => {
            window.requestAnimationFrame(renderAll);
        });

        renderAll();
    }

    document.addEventListener('DOMContentLoaded', initialize);
})();
