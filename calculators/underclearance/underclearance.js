(function () {
    'use strict';

    const INCHES_PER_FOOT = 12;
    const ALLOWANCE_INCHES = 3;
    const SIGN_THRESHOLD_INCHES = (14 * INCHES_PER_FOOT) + 6;
    const FLOOR_TOLERANCE = 1e-9;

    const DIRECTIONS = {
        direction1: {
            label: 'Travel Direction 1',
            example: [14.87, 14.74, 15.32, 16.19, 15.97, 16.70]
        },
        direction2: {
            label: 'Travel Direction 2',
            example: [16.87, 16.82, 17.33, 15.47, 15.73, 16.24]
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

    function isBridgeLogic() {
        return byId('clearance-logic').value === 'bridge';
    }

    function readingLocation(input, bridgeLogic) {
        return bridgeLogic
            ? `${DIRECTIONS[input.dataset.direction].label} — ${input.dataset.location}`
            : input.dataset.location;
    }

    function renderLogicNotice() {
        const bridgeLogic = isBridgeLogic();
        byId('logic-mode-summary').textContent = bridgeLogic
            ? 'Logic 1 uses the lowest of all 12 readings for both sides of the bridge. Both sides use the same sign legend and threshold decision.'
            : 'Logic 2 uses the lowest of each direction’s six readings independently. The bridge may have two different sign heights and threshold decisions.';
        byId('logic-minimum-description').textContent = bridgeLogic
            ? 'Use the lowest of all 12 readings across both travel directions and both bridge ends. Apply that minimum to both sides.'
            : 'For each travel direction separately, use the lowest of its six readings across both ends of the bridge.';
        byId('logic-mode-example').textContent = bridgeLogic
            ? 'Logic 1 example: If the directional minimums are 14 ft 2 in and 14 ft 4 in, both sides use 14 ft 2 in as the actual minimum and display 13 ft 11 in after the 3-inch reduction.'
            : 'Logic 2 example: If the directional minimums are 14 ft 2 in and 14 ft 4 in, the directions display 13 ft 11 in and 14 ft 1 in respectively after the 3-inch reduction.';
        byId('results-heading').textContent = bridgeLogic ? 'Bridge-wide results' : 'Directional results';
        byId('results-logic-summary').textContent = (bridgeLogic
            ? 'Logic 1: Both sides use the lowest of all 12 readings. '
            : 'Logic 2: Each direction uses the lowest of its own six readings. ')
            + 'Each sign legend includes the 3-inch frost/resurfacing allowance and is rounded down to a whole inch.';
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

    function renderMath(direction, inputs, values, controllingIndex, minimumFeet, adjustedInches, postedInches, bridgeLogic, signRequired) {
        const mathList = byId(`${direction}-math`);
        const readings = values.map((value, index) => `${readingLocation(inputs[index], bridgeLogic)} ${value}`).join('; ');
        const minimumInches = minimumFeet * INCHES_PER_FOOT;
        const scope = bridgeLogic
            ? 'Select the lowest of all 12 readings and apply it to both sides'
            : 'Follow this direction through both bridge ends and select its lowest reading';

        mathList.innerHTML = `
            <li><span>${scope}</span><strong>min(${readings}) = ${minimumFeet} ft</strong></li>
            <li><span>Convert the actual minimum from decimal feet</span><strong>${minimumFeet} × 12 = ${formatInches(minimumInches)} in = ${formatFeetInches(minimumFeet)}</strong></li>
            <li><span>Check the actual minimum against 14 ft 6 in before the allowance</span><strong>${formatInches(minimumInches)} in ${signRequired ? '&lt;' : '≥'} ${SIGN_THRESHOLD_INCHES} in — signing ${signRequired ? 'required' : 'not triggered'}</strong></li>
            <li><span>Subtract the 3-inch frost/resurfacing allowance</span><strong>${formatInches(minimumInches)} − 3 = ${formatInches(adjustedInches)} in</strong></li>
            <li><span>Round down to the nearest whole inch</span><strong>floor(${formatInches(adjustedInches)}) = ${postedInches} in</strong></li>
            <li><span>Convert the sign legend to feet–inches</span><strong>${postedInches} in = ${formatWholeInches(postedInches)}</strong></li>
        `;

        mathList.children[0].querySelector('span').append(` (${readingLocation(inputs[controllingIndex], bridgeLogic)})`);
    }

    function renderDirection(direction) {
        const bridgeLogic = isBridgeLogic();
        const inputs = bridgeLogic
            ? Object.keys(DIRECTIONS).flatMap(getInputs)
            : getInputs(direction);
        const states = inputs.map(updateInput);
        const values = states.map((state) => state.value);
        const invalidCount = states.filter((state) => !state.isValid).length;
        const missingCount = values.filter((value) => value === null).length;
        const empty = byId(`${direction}-empty`);
        const calculation = byId(`${direction}-calculation`);

        if (invalidCount > 0) {
            empty.textContent = bridgeLogic
                ? 'Correct the highlighted reading to calculate one height for both sides.'
                : 'Correct the highlighted reading to calculate this direction.';
            empty.hidden = false;
            calculation.hidden = true;
            return;
        }

        if (missingCount > 0) {
            const scope = bridgeLogic ? 'one height for both sides (all 12 readings required)' : DIRECTIONS[direction].label;
            empty.textContent = `Enter ${missingCount} more reading${missingCount === 1 ? '' : 's'} for ${scope}.`;
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
        byId(`${direction}-location`).textContent = readingLocation(inputs[controllingIndex], bridgeLogic);
        byId(`${direction}-rounded`).textContent = postedValue;

        threshold.className = `underclearance-threshold-status ${signRequired ? 'underclearance-threshold-required' : 'underclearance-threshold-above'}`;
        const minimumLabel = bridgeLogic ? 'Bridge-wide actual minimum' : 'Directional actual minimum';
        threshold.textContent = signRequired
            ? `${minimumLabel} ${actualValue} is below 14'-6" — W12-2 required.`
            : `${minimumLabel} ${actualValue} is not below the 14'-6" standard threshold.`;

        renderMath(direction, inputs, values, controllingIndex, minimumFeet, adjustedInches, postedInches, bridgeLogic, signRequired);
        empty.hidden = true;
        calculation.hidden = false;
    }

    function renderAll() {
        renderLogicNotice();
        Object.keys(DIRECTIONS).forEach(renderDirection);
    }

    function initialize() {
        const form = byId('underclearance-form');
        if (!form) return;

        document.querySelectorAll('.clearance-input').forEach((input) => {
            input.addEventListener('input', renderAll);
        });

        byId('clearance-logic').addEventListener('change', renderAll);

        byId('load-example').addEventListener('click', () => {
            Object.entries(DIRECTIONS).forEach(([direction, config]) => {
                getInputs(direction).forEach((input, index) => {
                    input.value = config.example[index];
                });
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
