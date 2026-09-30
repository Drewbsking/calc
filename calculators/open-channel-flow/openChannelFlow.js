document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('manningForm');
    const channelTypeSelect = document.getElementById('channelType');
    const solveForSelect = document.getElementById('solveFor');
    const unitSystemSelect = document.getElementById('unitSystem');
    const resultBox = document.getElementById('result');

    const geometrySections = {
        rectangular: document.getElementById('rectangular-fields'),
        trapezoidal: document.getElementById('trapezoidal-fields'),
        triangular: document.getElementById('triangular-fields'),
        circular: document.getElementById('circular-fields'),
        custom: document.getElementById('custom-fields')
    };
    const slopeFieldGroup = document.getElementById('slope-field-group');
    const nFieldGroup = document.getElementById('n-field-group');
    const knownDischargeGroup = document.getElementById('known-discharge-group');

    channelTypeSelect.addEventListener('change', () => {
        toggleGeometrySection(channelTypeSelect.value);
        resultBox.classList.add('hidden');
        resultBox.textContent = '';
    });

    unitSystemSelect.addEventListener('change', () => {
        resultBox.classList.add('hidden');
        resultBox.textContent = '';
    });

    solveForSelect.addEventListener('change', () => {
        toggleSolveForFields(solveForSelect.value);
        resultBox.classList.add('hidden');
        resultBox.textContent = '';
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        try {
            const solveFor = solveForSelect.value;
            const slope = solveFor === 'slope' ? null : getPositiveValue('channelSlope', 'channel slope');
            const nValue = solveFor === 'roughness' ? null : getPositiveValue('manningN', "Manning's n");
            const knownDischarge = solveFor === 'discharge' ? null : getPositiveValue('knownDischarge', 'known discharge');
            const unitCoefficient = parseFloat(unitSystemSelect.value) || 1;
            const geometry = buildGeometry(channelTypeSelect.value, solveFor);
            const output = calculateManningDischarge({
                geometry,
                slope,
                nValue,
                knownDischarge,
                solveFor,
                unitCoefficient
            });

            renderResult(output);
        } catch (error) {
            resultBox.classList.remove('hidden');
            resultBox.innerHTML = `<p style="color:#b91c1c;">${error.message}</p>`;
        }
    });

    function toggleGeometrySection(activeKey) {
        Object.entries(geometrySections).forEach(([key, element]) => {
            if (!element) return;
            element.classList.toggle('hidden', key !== activeKey);
        });
    }

    function buildGeometry(type, solveFor) {
        const solvingDepth = solveFor === 'depth';
        switch (type) {
            case 'rectangular': {
                const width = getPositiveValue('rectWidth', 'bottom width');
                const depth = solvingDepth ? getOptionalPositiveValue('rectDepth', 'flow depth') : getPositiveValue('rectDepth', 'flow depth');
                return {
                    type: 'rectangular',
                    allowsDepthSolve: true,
                    depth,
                    initialDepthGuess: depth || width / 2 || 1,
                    computeGeometry: (depthOverride = depth) => {
                        const y = getDepthValue(depthOverride, depth, 'flow depth');
                        const area = width * y;
                        const wettedPerimeter = width + 2 * y;
                        return { area, wettedPerimeter, depth: y };
                    }
                };
            }
            case 'trapezoidal': {
                const width = getPositiveValue('trapWidth', 'bottom width');
                const depth = solvingDepth ? getOptionalPositiveValue('trapDepth', 'flow depth') : getPositiveValue('trapDepth', 'flow depth');
                const sideSlope = getNonNegativeValue('trapSideSlope', 'side slope (z)');
                const slopeFactor = Math.sqrt(1 + Math.pow(sideSlope, 2));
                return {
                    type: 'trapezoidal',
                    allowsDepthSolve: true,
                    depth,
                    initialDepthGuess: depth || width || 1,
                    computeGeometry: (depthOverride = depth) => {
                        const y = getDepthValue(depthOverride, depth, 'flow depth');
                        const area = y * (width + sideSlope * y);
                        const wettedPerimeter = width + 2 * y * slopeFactor;
                        return { area, wettedPerimeter, depth: y };
                    }
                };
            }
            case 'triangular': {
                const depth = solvingDepth ? getOptionalPositiveValue('triDepth', 'flow depth') : getPositiveValue('triDepth', 'flow depth');
                const sideSlope = getPositiveValue('triSideSlope', 'side slope (z)');
                const slopeFactor = Math.sqrt(1 + Math.pow(sideSlope, 2));
                return {
                    type: 'triangular',
                    allowsDepthSolve: true,
                    depth,
                    initialDepthGuess: depth || 1,
                    computeGeometry: (depthOverride = depth) => {
                        const y = getDepthValue(depthOverride, depth, 'flow depth');
                        const area = sideSlope * Math.pow(y, 2);
                        const wettedPerimeter = 2 * y * slopeFactor;
                        return { area, wettedPerimeter, depth: y };
                    }
                };
            }
            case 'circular': {
                const diameter = getPositiveValue('circDiameter', 'diameter');
                const depth = solvingDepth ? getOptionalPositiveValue('circDepth', 'flow depth') : getPositiveValue('circDepth', 'flow depth');
                if (!solvingDepth && depth > diameter) {
                    throw new Error('Flow depth cannot exceed the diameter.');
                }
                const radius = diameter / 2;
                return {
                    type: 'circular',
                    allowsDepthSolve: true,
                    depth,
                    maxDepth: diameter,
                    initialDepthGuess: depth || radius,
                    computeGeometry: (depthOverride = depth) => {
                        const y = getDepthValue(depthOverride, depth, 'flow depth');
                        if (y > diameter) {
                            throw new Error('Flow depth cannot exceed the diameter.');
                        }
                        if (y <= 0) {
                            return { area: 0, wettedPerimeter: 0, depth: y };
                        }
                        const normalized = clamp((radius - y) / radius, -1, 1);
                        const theta = 2 * Math.acos(normalized);
                        const area = 0.5 * Math.pow(radius, 2) * (theta - Math.sin(theta));
                        const wettedPerimeter = radius * theta;
                        return { area, wettedPerimeter, depth: y };
                    }
                };
            }
            case 'custom': {
                if (solvingDepth) {
                    throw new Error('Depth solving is not available for custom geometry inputs.');
                }
                const area = getPositiveValue('customArea', 'flow area');
                const wettedPerimeter = getPositiveValue('customPerimeter', 'wetted perimeter');
                return {
                    type: 'custom',
                    allowsDepthSolve: false,
                    depth: null,
                    computeGeometry: () => ({ area, wettedPerimeter, depth: null })
                };
            }
            default:
                throw new Error('Pick a valid channel shape.');
        }
    }

    function calculateManningDischarge({ geometry, slope, nValue, knownDischarge, solveFor, unitCoefficient }) {
        if (!geometry) {
            throw new Error('Channel geometry is required.');
        }

        if (solveFor === 'depth') {
            if (!geometry.allowsDepthSolve) {
                throw new Error('Depth solving is only available for rectangular, trapezoidal, triangular, or circular shapes.');
            }
            if (!slope || !nValue) {
                throw new Error('Enter slope and Manning’s n to solve for depth.');
            }
            if (!knownDischarge) {
                throw new Error('Enter the known discharge to solve for depth.');
            }
            return solveForDepth({
                geometry,
                slope,
                nValue,
                discharge: knownDischarge,
                unitCoefficient
            });
        }

        const geometryResult = geometry.computeGeometry();
        const { area, wettedPerimeter, depth } = geometryResult;
        if (area <= 0 || wettedPerimeter <= 0) {
            throw new Error('Geometry inputs must produce a positive area and wetted perimeter.');
        }
        const hydraulicRadius = area / wettedPerimeter;

        switch (solveFor) {
            case 'discharge': {
                const flow = computeDischargeFromGeometry({ area, hydraulicRadius, slope, nValue, unitCoefficient });
                if (flow.discharge <= 0) {
                    throw new Error('Unable to compute discharge with the provided inputs.');
                }
                return {
                    ...flow,
                    area,
                    wettedPerimeter,
                    hydraulicRadius,
                    slope,
                    nValue,
                    unitCoefficient,
                    flowDepth: depth,
                    solveFor,
                    solvedLabel: 'Discharge (Q)',
                    solvedValue: flow.discharge,
                    solvedUnits: ' cubic units/s'
                };
            }
            case 'slope': {
                const discharge = knownDischarge;
                const numerator = discharge * nValue;
                const denominator = unitCoefficient * area * Math.pow(hydraulicRadius, 2 / 3);
                if (denominator === 0) {
                    throw new Error('Geometry produced zero area or hydraulic radius.');
                }
                const computedSlope = Math.pow(numerator / denominator, 2);
                if (!isFinite(computedSlope) || computedSlope <= 0) {
                    throw new Error('Unable to compute slope with the provided inputs.');
                }
                const velocity = discharge / area;
                return {
                    area,
                    wettedPerimeter,
                    hydraulicRadius,
                    velocity,
                    discharge,
                    slope: computedSlope,
                    nValue,
                    unitCoefficient,
                    flowDepth: depth,
                    solveFor,
                    solvedLabel: 'Slope (S)',
                    solvedValue: computedSlope,
                    solvedUnits: ' (ft/ft or m/m)',
                    solvedFormat: { min: 5, max: 6 }
                };
            }
            case 'roughness': {
                const discharge = knownDischarge;
                const numerator = unitCoefficient * area * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slope);
                const computedN = numerator / discharge;
                if (!isFinite(computedN) || computedN <= 0) {
                    throw new Error('Unable to compute Manning’s n with the provided inputs.');
                }
                const velocity = discharge / area;
                return {
                    area,
                    wettedPerimeter,
                    hydraulicRadius,
                    velocity,
                    discharge,
                    slope,
                    nValue: computedN,
                    unitCoefficient,
                    flowDepth: depth,
                    solveFor,
                    solvedLabel: "Manning's n",
                    solvedValue: computedN,
                    solvedUnits: ' (unitless)',
                    solvedFormat: { min: 3, max: 4 }
                };
            }
            default:
                throw new Error('Pick a valid variable to solve for.');
        }
    }

    function renderResult({ area, wettedPerimeter, hydraulicRadius, velocity, discharge, slope, nValue, solvedLabel, solvedValue, solvedUnits, solvedFormat, solveFor, flowDepth, unitCoefficient }) {
        resultBox.classList.remove('hidden');
        const solvedLine = solvedLabel
            ? `<p class="highlight"><strong>${solvedLabel}:</strong> ${formatNumber(solvedValue, solvedFormat)}${solvedUnits || ''}</p>`
            : '';
        const slopeLine = typeof slope === 'number'
            ? `<p><strong>Slope (S):</strong> ${formatNumber(slope, { min: 4, max: 6 })} (ft/ft or m/m)</p>`
            : '';
        const nLine = typeof nValue === 'number'
            ? `<p><strong>Manning's n:</strong> ${formatNumber(nValue, { min: 3, max: 4 })}</p>`
            : '';
        const coefficientLine = unitCoefficient
            ? `<p><strong>Unit Coefficient (k):</strong> ${unitCoefficient}</p>`
            : '';
        const depthLine = typeof flowDepth === 'number'
            ? `<p><strong>Flow Depth (y):</strong> ${formatNumber(flowDepth)} units</p>`
            : '';
        resultBox.innerHTML = `
            <h2>Computed Flow</h2>
            ${solvedLine}
            ${depthLine}
            <p><strong>Area (A):</strong> ${formatNumber(area)} square units</p>
            <p><strong>Wetted Perimeter (P):</strong> ${formatNumber(wettedPerimeter)} units</p>
            <p><strong>Hydraulic Radius (R):</strong> ${formatNumber(hydraulicRadius)} units</p>
            ${slopeLine}
            ${nLine}
            ${coefficientLine}
            <p><strong>Velocity (V):</strong> ${formatNumber(velocity)} units/s</p>
            <p><strong>Discharge (Q):</strong> ${formatNumber(discharge)} cubic units/s</p>
            <p class="note">Use consistent units so the discharge is in cfs, m³/s, etc.</p>
        `;
    }

    function getPositiveValue(id, label) {
        const value = parseFloat(document.getElementById(id)?.value);
        if (Number.isNaN(value) || value <= 0) {
            throw new Error(`Enter a valid ${label}.`);
        }
        return value;
    }

    function getOptionalPositiveValue(id, label) {
        const raw = document.getElementById(id)?.value;
        if (raw === undefined || raw === null || raw === '') {
            return null;
        }
        const value = parseFloat(raw);
        if (Number.isNaN(value) || value <= 0) {
            throw new Error(`Enter a valid ${label}.`);
        }
        return value;
    }

    function getNonNegativeValue(id, label) {
        const value = parseFloat(document.getElementById(id)?.value);
        if (Number.isNaN(value) || value < 0) {
            throw new Error(`Enter a non-negative ${label}.`);
        }
        return value;
    }

    function formatNumber(value, options = {}) {
        const { min = 2, max = 3 } = options;
        return Number(value).toLocaleString(undefined, {
            minimumFractionDigits: min,
            maximumFractionDigits: max
        });
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function getDepthValue(overrideValue, storedDepth, label) {
        const depthValue = typeof overrideValue === 'number' ? overrideValue : storedDepth;
        if (depthValue === undefined || depthValue === null) {
            throw new Error(`Enter a valid ${label}.`);
        }
        if (depthValue <= 0) {
            throw new Error(`${label.charAt(0).toUpperCase() + label.slice(1)} must be greater than zero.`);
        }
        return depthValue;
    }

    function computeDischargeFromGeometry({ area, hydraulicRadius, slope, nValue, unitCoefficient }) {
        if (!slope || !nValue) {
            throw new Error('Slope and Manning’s n are required for this calculation.');
        }
        const velocity = (unitCoefficient / nValue) * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slope);
        const discharge = velocity * area;
        return { velocity, discharge };
    }

    function solveForDepth({ geometry, slope, nValue, discharge, unitCoefficient }) {
        const MIN_DEPTH = 1e-5;
        const MAX_ITERATIONS = 80;
        const RELATIVE_TOLERANCE = 1e-5;
        const maxDepthLimit = geometry.maxDepth || 1e5;
        let upper = geometry.initialDepthGuess && geometry.initialDepthGuess > 0
            ? geometry.initialDepthGuess
            : Math.min(maxDepthLimit, geometry.maxDepth ? geometry.maxDepth / 2 : 1);
        if (!upper || upper <= 0) {
            upper = geometry.maxDepth ? geometry.maxDepth / 2 : 1;
        }
        if (geometry.maxDepth) {
            upper = Math.min(upper, geometry.maxDepth);
        }

        const evaluateDepth = (depth) => {
            const sanitizedDepth = Math.max(depth, MIN_DEPTH);
            const geometryValues = geometry.computeGeometry(sanitizedDepth);
            const { area, wettedPerimeter, depth: actualDepth } = geometryValues;
            if (area <= 0 || wettedPerimeter <= 0) {
                return { discharge: 0, area, wettedPerimeter, hydraulicRadius: 0, velocity: 0, depthValue: sanitizedDepth };
            }
            const hydraulicRadius = area / wettedPerimeter;
            const flow = computeDischargeFromGeometry({ area, hydraulicRadius, slope, nValue, unitCoefficient });
            return {
                discharge: flow.discharge,
                area,
                wettedPerimeter,
                hydraulicRadius,
                velocity: flow.velocity,
                depthValue: typeof actualDepth === 'number' ? actualDepth : sanitizedDepth
            };
        };

        let upperFlow = evaluateDepth(upper);
        let growthSteps = 0;
        while (upperFlow.discharge < discharge && upper < maxDepthLimit && growthSteps < 60) {
            if (geometry.maxDepth && upper >= geometry.maxDepth) {
                break;
            }
            upper = geometry.maxDepth ? Math.min(geometry.maxDepth, upper * 1.2) : upper * 2;
            upperFlow = evaluateDepth(upper);
            growthSteps++;
        }

        if (upperFlow.discharge < discharge * (1 - RELATIVE_TOLERANCE)) {
            if (geometry.maxDepth) {
                throw new Error('Target discharge exceeds what this pipe diameter can convey.');
            }
            throw new Error('Unable to reach the target discharge. Try providing a better starting depth or check your inputs.');
        }

        let lower = MIN_DEPTH;
        let solvedDepth = upperFlow.depthValue;
        let solvedFlow = upperFlow;

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const mid = 0.5 * (lower + upper);
            const midFlow = evaluateDepth(mid);
            const difference = Math.abs(midFlow.discharge - discharge);
            if (difference <= Math.max(discharge * RELATIVE_TOLERANCE, 1e-6)) {
                solvedDepth = mid;
                solvedFlow = midFlow;
                break;
            }

            if (midFlow.discharge < discharge) {
                lower = mid;
            } else {
                upper = mid;
            }
            solvedDepth = midFlow.depthValue;
            solvedFlow = midFlow;
        }

        return {
            area: solvedFlow.area,
            wettedPerimeter: solvedFlow.wettedPerimeter,
            hydraulicRadius: solvedFlow.hydraulicRadius,
            velocity: solvedFlow.velocity,
            discharge: solvedFlow.discharge,
            slope,
            nValue,
            flowDepth: solvedDepth,
            unitCoefficient,
            solveFor: 'depth',
            solvedLabel: 'Depth (y)',
            solvedValue: solvedDepth,
            solvedUnits: ' units'
        };
    }

    toggleGeometrySection(channelTypeSelect.value);
    toggleSolveForFields(solveForSelect.value);

    function toggleSolveForFields(mode) {
        slopeFieldGroup?.classList.toggle('hidden', mode === 'slope');
        nFieldGroup?.classList.toggle('hidden', mode === 'roughness');
        knownDischargeGroup?.classList.toggle('hidden', mode === 'discharge');
    }
});
