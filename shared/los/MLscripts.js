/* HCM 2010 Chapter 14 and HCM 6th Edition Chapter 12. See docs/ml-2010-sources.md. */
const ML = (() => {
    const data = typeof module !== 'undefined' && module.exports ? require('./MLdata.js') : MLData;
    const oldData = typeof module !== 'undefined' && module.exports ? require('./ML2010data.js') : ML2010Data;
    function number(value, label, min, max = Infinity) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
            throw new Error(`${label} must be a finite number ${max === Infinity ? `at least ${min}` : `from ${min} to ${max}`}.`);
        }
        return value;
    }
    function interpolate(points, x) {
        if (x <= points[0][0]) return points[0][1];
        for (let i = 1; i < points.length; i++) {
            const [x1, y1] = points[i - 1], [x2, y2] = points[i];
            if (x <= x2) return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
        }
        return points[points.length - 1][1];
    }
    function getPCE(grade, length, percentage, sutMix) {
        number(grade, 'Signed grade for automatic PCE lookup (%)', -2, 6);
        number(length, 'Grade length for automatic PCE lookup (mi)', 0.125);
        number(percentage, 'Heavy vehicles for automatic PCE lookup (%)', 2, 100);
        if (![30, 50, 70].includes(Number(sutMix))) throw new Error('Select a 30%, 50% or 70% SUT table.');
        const table = data.pceTables[sutMix];
        // Interpolate within each length/percentage grid, then between grade rows.
        // The terminal percentage column applies at/above 25%.
        // ODOT Appendix 11D directs use of the longest tabulated length if exceeded.
        const atGrade = group => interpolate(group.rows.map(([miles, values]) => [miles,
            interpolate(data.percentages.map((pct, i) => [pct, values[i]]), percentage)]), length);
        return interpolate(table.map(group => [group.grade, atGrade(group)]), grade);
    }
    const roundTenth = value => Math.round((value + Number.EPSILON) * 10) / 10;
    function estimateFFS(input) {
        number(input.baseFreeFlowSpeed, 'Base free-flow speed (mph)', 0.01);
        number(input.laneWidth, 'Lane width (ft)', 10);
        number(input.rightClearance, 'Right lateral clearance (ft)', 0);
        number(input.accessPoints, 'Access points per mile', 0);
        if (!['divided', 'undivided', 'twltl'].includes(input.medianType)) throw new Error('Select a median type.');
        const left = input.medianType === 'divided' ? number(input.leftClearance, 'Left lateral clearance (ft)', 0) : 6;
        const totalClearance = Math.min(6, left) + Math.min(6, input.rightClearance);
        // Exhibit 12-20 specifies width bands; do not interpolate lane width.
        const lane = input.laneWidth >= 12 ? 0 : input.laneWidth >= 11 ? 1.9 : 6.6;
        const lateral = roundTenth(interpolate(data.lateralClearance, totalClearance));
        const median = input.medianType === 'undivided' ? 1.6 : 0;
        const access = roundTenth(Math.min(input.accessPoints, 40) * 0.25);
        let speed = input.baseFreeFlowSpeed - lane - lateral - median - access;
        // Decimal adjustments can leave an exact boundary a few binary ULPs away.
        for (const boundary of [45, 70]) {
            if (Math.abs(speed - boundary) <= 8 * Number.EPSILON * boundary) speed = boundary;
        }
        return { speed,
            lane, lateral, median, access, totalClearance };
    }
    function getLOS(density) {
        number(density, 'Density (pc/mi/ln)', 0);
        return density <= 11 ? 'A' : density <= 18 ? 'B' : density <= 26 ? 'C' : density <= 35 ? 'D' : density <= 45 ? 'E' : 'F';
    }
    function operatingConditions(flow, ffs) {
        number(flow, 'Passenger-car flow rate', 0);
        number(ffs, 'HCM 6th Edition multilane FFS (mph)', 45, 70);
        const capacity = Math.min(1900 + 20 * (ffs - 45), 2300);
        if (flow - capacity > 8 * Number.EPSILON * capacity) return { los: 'F', speed: null, density: null, capacity, ratio: flow / capacity };
        const stableFlow = Math.min(flow, capacity);
        const speed = stableFlow <= 1400 ? ffs : ffs - (ffs - capacity / 45) * ((stableFlow - 1400) / (capacity - 1400)) ** 1.31;
        // Cap only roundoff at the theoretical endpoint, not oversaturated density.
        const density = Math.min(stableFlow / speed, 45);
        return { los: getLOS(density), speed, density, capacity, ratio: flow / capacity };
    }
    function calculate(input) {
        if (input.edition === '2010') return calculate2010(input);
        if (input.edition !== undefined && input.edition !== '6th') throw new Error('Select HCM 2010 or HCM 6th Edition.');
        number(input.trafficVolume, 'Directional hourly volume (veh/h)', 0);
        number(input.PHF, 'Peak hour factor', 0.25, 1);
        number(input.heavyVehicles, 'Total heavy vehicles (%)', 0, 100);
        if (!['measured', 'estimated'].includes(input.ffsMode)) throw new Error('Select a free-flow-speed method.');
        if (!['specific', 'level', 'rolling'].includes(input.terrain)) throw new Error('Select a terrain analysis.');
        if (input.terrain === 'specific') {
            number(input.gradeLength, 'Grade length (ft)', 0.01);
            number(input.gradePercent, 'Grade magnitude (%)', 0);
            if (![30, 50, 70].includes(Number(input.sutMix))) throw new Error('Select a truck-mix table.');
        }
        const adjustments = input.ffsMode === 'estimated' ? estimateFFS(input) : null;
        const freeFlowSpeed = adjustments ? adjustments.speed : input.freeFlowSpeed;
        number(freeFlowSpeed, 'HCM 6th Edition multilane FFS (mph)', 45, 70);
        const lengthMiles = input.terrain === 'specific' ? input.gradeLength / 5280 : null;
        const results = {};
        const directions = input.terrain === 'specific' ? ['upgrade', 'downgrade'] : ['segment'];
        for (const direction of directions) {
            let ET, basis;
            const override = input[`${direction}PCE`];
            if (override !== undefined && override !== null) {
                number(override, `${direction} PCE override`, 1);
                if (typeof input.pceSource !== 'string' || !input.pceSource.trim()) throw new Error('Enter the basis/source for your PCE override.');
                ET = override;
                basis = 'User-supplied PCE';
            } else if (input.heavyVehicles === 0) {
                ET = 1;
                basis = 'No heavy vehicles';
            } else if (input.terrain !== 'specific') {
                ET = input.terrain === 'level' ? 2 : 3;
                basis = `Exhibit 12-25: ${input.terrain} terrain`;
            } else {
                try {
                    ET = getPCE(direction === 'upgrade' ? input.gradePercent : -input.gradePercent,
                        lengthMiles, input.heavyVehicles, input.sutMix);
                    basis = `Exhibit 12-${{30:26,50:27,70:28}[input.sutMix]}: ${input.sutMix}% SUT / ${100-input.sutMix}% TT`;
                } catch (err) {
                    results[direction] = { error: `${err.message} Supply a verified ${direction} PCE and its source, or use a separate analysis.` };
                    continue;
                }
            }
            const fHV = 1 / (1 + input.heavyVehicles / 100 * (ET - 1));
            const flow = input.trafficVolume / (input.PHF * 2 * fHV);
            results[direction] = { ET, basis, fHV, flow, ...operatingConditions(flow, freeFlowSpeed) };
        }
        return { freeFlowSpeed, lengthMiles, adjustments, results };
    }
    function getPCE2010(kind, direction, grade, length, percentage) {
        if (!['ET', 'ER'].includes(kind) || !['upgrade', 'downgrade'].includes(direction)) throw new Error('Select a valid 2010 PCE type and direction.');
        number(grade, 'Grade magnitude (%)', 0);
        number(length, 'Grade length (mi)', Number.MIN_VALUE);
        number(percentage, `${kind === 'ET' ? 'Trucks/buses' : 'RVs'} (%)`, 0, 100);
        if (percentage === 0) return 1;
        if (direction === 'downgrade') {
            if (kind === 'ER') return 1.2;
            if (grade < 4 || length <= 4) return 1.5;
            number(percentage, 'Trucks/buses for the 2010 long-downgrade table (%)', 5, 20);
            const row = oldData.truckDowngrades.find(group => grade <= group.maxGrade);
            return roundTenth(interpolate(oldData.downgradePercentages.map((pct, i) => [pct, row.values[i]]), percentage));
        }
        if (grade <= 2) return kind === 'ET' ? 1.5 : 1.2;
        number(percentage, `${kind} for the 2010 upgrade table (%)`, 2, 25);
        if (kind === 'ET' && grade > 6 && length <= 0.25 && percentage > 20) {
            throw new Error('The 2010 ET cell for grades above 6%, lengths up to 0.25 mi and 25% trucks conflicts with the archived reference. A verified upgrade ET override is required for percentages above 20% in this row.');
        }
        const table = kind === 'ET' ? oldData.truckUpgrades : oldData.rvUpgrades;
        const group = table.find(row => grade <= row.maxGrade);
        const [, values] = group.rows.find(([maxLength]) => length <= maxLength);
        return roundTenth(interpolate(oldData.percentages.map((pct, i) => [pct, values[i]]), percentage));
    }
    function selectCurve2010(ffs) {
        number(ffs, 'HCM 2010 FFS (mph)', 0);
        // Geometry deductions can leave an exact half-step a few ULPs away.
        for (const boundary of [42.5, 47.5, 52.5, 57.5, 62.5]) {
            if (Math.abs(ffs - boundary) <= 8 * Number.EPSILON * boundary) ffs = boundary;
        }
        number(ffs, 'HCM 2010 FFS (mph)', 42.5, 62.5);
        if (ffs >= 62.5) throw new Error('HCM 2010 FFS must be at least 42.5 and less than 62.5 mph.');
        return Math.round(ffs / 5) * 5;
    }
    function operatingConditions2010(flow, curveSpeed) {
        number(flow, 'Passenger-car flow rate', 0);
        if (![45, 50, 55, 60].includes(curveSpeed)) throw new Error('Select a 45, 50, 55 or 60 mph HCM 2010 curve.');
        const { capacity, coefficient, densityLimit } = oldData.curves[curveSpeed];
        const common = { capacity, coefficient, densityLimit, ratio: flow / capacity };
        if (flow - capacity > 8 * Number.EPSILON * capacity) return { ...common, los: 'F', speed: null, density: null };
        const stableFlow = Math.min(flow, capacity);
        const speed = stableFlow <= 1400 ? curveSpeed : curveSpeed - coefficient * ((stableFlow - 1400) / (capacity - 1400)) ** 1.31;
        const density = stableFlow / speed;
        // The published coefficients are rounded. Capacity controls E/F even
        // when endpoint density is slightly above the rounded exhibit limit.
        const los = density <= 11 ? 'A' : density <= 18 ? 'B' : density <= 26 ? 'C' : density <= 35 ? 'D' : 'E';
        return { ...common, los, speed, density };
    }
    function calculate2010(input) {
        number(input.trafficVolume, 'Directional hourly volume (veh/h)', 0);
        number(input.PHF, 'Peak hour factor', 0.25, 1);
        number(input.percentTrucks, 'Trucks and buses (%)', 0, 100);
        number(input.percentRVs, 'Recreational vehicles (%)', 0, 100);
        if (input.percentTrucks + input.percentRVs > 100) throw new Error('Trucks/buses plus RVs must not exceed 100% of traffic.');
        const driverFactor = input.driverFactor === undefined ? 1 : number(input.driverFactor, 'Driver population factor', 0.85, 1);
        if (!['measured', 'estimated'].includes(input.ffsMode)) throw new Error('Select a free-flow-speed method.');
        if (!['specific', 'level', 'rolling'].includes(input.terrain)) throw new Error('Select a terrain analysis.');
        if (input.terrain === 'specific') {
            number(input.gradeLength, 'Grade length (ft)', 0.01);
            number(input.gradePercent, 'Grade magnitude (%)', 0);
        }
        const adjustments = input.ffsMode === 'estimated' ? estimateFFS(input) : null;
        const freeFlowSpeed = adjustments ? adjustments.speed : input.freeFlowSpeed;
        const curveSpeed = selectCurve2010(freeFlowSpeed);
        const lengthMiles = input.terrain === 'specific' ? input.gradeLength / 5280 : null;
        const results = {};
        for (const direction of input.terrain === 'specific' ? ['upgrade', 'downgrade'] : ['segment']) {
            const factors = {}, bases = [];
            let usedOverride = false;
            try {
                for (const [kind, percentage] of [['ET', input.percentTrucks], ['ER', input.percentRVs]]) {
                    const override = input[`${direction}${kind}2010`];
                    if (input.terrain === 'specific' && override !== undefined && override !== null) {
                        factors[kind] = number(override, `HCM 2010 ${direction} ${kind} override`, 1);
                        if (typeof input.pceSource2010 !== 'string' || !input.pceSource2010.trim()) throw new Error('Enter the basis/source for your HCM 2010 PCE override.');
                        bases.push(`${kind}: user-supplied PCE`);
                        usedOverride = true;
                    } else if (percentage === 0) {
                        factors[kind] = 1;
                        bases.push(`${kind}: no ${kind === 'ET' ? 'trucks/buses' : 'RVs'}`);
                    } else if (input.terrain !== 'specific') {
                        factors[kind] = oldData.general[input.terrain][kind];
                        bases.push(`${kind}: Exhibit 14-12 (${input.terrain})`);
                    } else {
                        factors[kind] = getPCE2010(kind, direction, input.gradePercent, lengthMiles, percentage);
                        bases.push(`${kind}: ${direction === 'upgrade' ? `Exhibit 14-${kind === 'ET' ? 13 : 14}` : kind === 'ET' ? 'Exhibit 14-15' : 'downgrade ER = 1.2'}`);
                    }
                }
                const fHV = 1 / (1 + input.percentTrucks / 100 * (factors.ET - 1) + input.percentRVs / 100 * (factors.ER - 1));
                const flow = input.trafficVolume / (input.PHF * 2 * fHV * driverFactor);
                results[direction] = { ...factors, basis: bases.join('; '), usedOverride, fHV, flow, ...operatingConditions2010(flow, curveSpeed) };
            } catch (err) {
                results[direction] = { error: `${err.message} Supply the relevant verified HCM 2010 PCE and its source, or use a separate analysis.` };
            }
        }
        return { edition: '2010', freeFlowSpeed, curveSpeed, driverFactor, lengthMiles, adjustments, results };
    }
    function calculateBoth(input) {
        number(input.percentTrucks, 'Trucks and buses (%)', 0, 100);
        number(input.percentRVs, 'Recreational vehicles (%)', 0, 100);
        const heavyVehicles = input.percentTrucks + input.percentRVs;
        if (heavyVehicles > 100) throw new Error('Trucks/buses plus RVs must not exceed 100% of traffic.');
        return Object.fromEntries(['2010', '6th'].map(edition => {
            try { return [edition, calculate({ ...input, edition, heavyVehicles })]; }
            catch (err) { return [edition, { error: err.message }]; }
        }));
    }
    return { calculate, calculateBoth, estimateFFS, getPCE, getLOS, operatingConditions,
        getPCE2010, selectCurve2010, operatingConditions2010 };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ML;
