/* HCM 6th Edition, Chapter 12, base conditions (SAF = CAF = 1).
 * Source reconciliation and supported scope: docs/hcm-audit.md.
 */
const FreewayLOS = (() => {
    const shared = typeof module !== 'undefined' && module.exports ? require('./MLscripts.js') : ML;
    function number(value, label, min, max = Infinity) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
            throw new Error(`${label} must be a finite number ${max === Infinity ? `at least ${min}` : `from ${min} to ${max}`}.`);
        }
        return value;
    }
    function lanes(value) {
        number(value, 'Lanes in one direction', 2);
        if (!Number.isSafeInteger(value)) throw new Error('Lanes in one direction must be a whole number.');
        return value;
    }
    function estimateFFS(input) {
        number(input.baseFreeFlowSpeed, 'Base free-flow speed (mph)', 55, 75.4);
        number(input.laneWidth, 'Lane width (ft)', 10);
        number(input.rightClearance, 'Right lateral clearance (ft)', 0);
        number(input.rampDensity, 'Total ramp density (ramps/mi)', 0, 6);
        const n = lanes(input.lanes);
        // Exhibit 12-20 uses width bands; Exhibit 12-21 interpolates clearance.
        const lane = input.laneWidth >= 12 ? 0 : input.laneWidth >= 11 ? 1.9 : 6.6;
        const lateral = (6 - Math.min(6, input.rightClearance)) * ({2: .6, 3: .4, 4: .2}[n] ?? .1);
        const ramps = 3.22 * input.rampDensity ** .84;
        let speed = input.baseFreeFlowSpeed - lane - lateral - ramps;
        for (const boundary of [55, 75]) {
            if (Math.abs(speed - boundary) <= 8 * Number.EPSILON * boundary) speed = boundary;
        }
        return { lane, lateral, ramps, speed };
    }
    function operatingConditions(flow, ffs) {
        number(flow, 'Passenger-car flow (pc/h/ln)', 0);
        number(ffs, 'HCM 6th Edition basic freeway FFS (mph)', 55, 75);
        const capacity = Math.min(2200 + 10 * (ffs - 50), 2400);
        const breakpoint = 1000 + 40 * (75 - ffs);
        const ratio = flow / capacity;
        if (flow - capacity > 8 * Number.EPSILON * capacity) {
            return { capacity, breakpoint, ratio, los: 'F', speed: null, density: null };
        }
        // Tolerance only addresses binary roundoff when demand equals capacity.
        const stableFlow = Math.min(flow, capacity);
        const speed = stableFlow <= breakpoint ? ffs :
            ffs - (ffs - capacity / 45) * ((stableFlow - breakpoint) / (capacity - breakpoint)) ** 2;
        const density = Math.min(stableFlow / speed, 45);
        return { capacity, breakpoint, ratio, speed, density, los: shared.getLOS(density) };
    }
    function calculate(input) {
        number(input.trafficVolume, 'Directional hourly volume (veh/h)', 0);
        number(input.PHF, 'Peak hour factor', .25, 1);
        number(input.heavyVehicles, 'Total heavy vehicles (%)', 0, 100);
        lanes(input.lanes);
        if (!['measured', 'estimated'].includes(input.ffsMode)) throw new Error('Select a free-flow-speed method.');
        if (!['level', 'rolling', 'specific'].includes(input.terrain)) throw new Error('Select a terrain analysis.');
        const adjustments = input.ffsMode === 'estimated' ? estimateFFS(input) : null;
        const freeFlowSpeed = adjustments ? adjustments.speed : input.freeFlowSpeed;
        number(freeFlowSpeed, 'HCM 6th Edition basic freeway FFS (mph)', 55, 75);
        if (input.terrain === 'specific') {
            number(input.gradePercent, 'Signed grade (%)', -Infinity);
            number(input.gradeLength, 'Grade length (ft)', .01);
        }
        let ET, basis;
        const hasOverride = input.pceOverride !== undefined && input.pceOverride !== null;
        if (hasOverride) {
            ET = number(input.pceOverride, 'Verified heavy vehicle PCE', 1);
            if (typeof input.pceSource !== 'string' || !input.pceSource.trim()) throw new Error('Enter the basis/source for your PCE override.');
            basis = `User-supplied PCE: ${input.pceSource.trim()}`;
        } else if (input.heavyVehicles === 0) {
            ET = 1;
            basis = 'No heavy vehicles';
        } else if (input.terrain !== 'specific') {
            ET = input.terrain === 'level' ? 2 : 3;
            basis = `Exhibit 12-25: ${input.terrain} terrain`;
        } else {
            try {
                ET = shared.getPCE(input.gradePercent, input.gradeLength / 5280, input.heavyVehicles, input.sutMix);
            } catch (error) {
                throw new Error(`${error.message} Supply a verified PCE and its basis/source, or use a separate grade analysis.`);
            }
            basis = `Exhibit 12-${{30:26, 50:27, 70:28}[input.sutMix]}: ${input.sutMix}% SUT / ${100 - input.sutMix}% TT`;
        }
        const fHV = 1 / (1 + input.heavyVehicles / 100 * (ET - 1));
        const flow = input.trafficVolume / (input.PHF * input.lanes * fHV);
        return { freeFlowSpeed, adjustments, ET, basis, fHV, flow, ...operatingConditions(flow, freeFlowSpeed) };
    }
    return { calculate, estimateFFS, operatingConditions };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FreewayLOS;
