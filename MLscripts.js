/* HCM 6th Edition (2016), Chapter 12. See docs/ml-source-reconciliation.md. */
const ML = (() => {
    const data = typeof module !== 'undefined' && module.exports ? require('./MLdata.js') : MLData;
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
    return { calculate, estimateFFS, getPCE, getLOS, operatingConditions };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ML;

function calculateLOS() {
    const form = document.getElementById('losForm');
    const result = document.getElementById('result');
    const steps = document.getElementById('steps');
    const error = document.getElementById('losError');
    result.textContent = '';
    steps.replaceChildren();
    error.textContent = '';
    if (!form.reportValidity()) return;
    const value = id => document.getElementById(id).valueAsNumber;
    const input = Object.fromEntries(['trafficVolume', 'heavyVehicles', 'gradeLength', 'gradePercent', 'PHF',
        'freeFlowSpeed', 'baseFreeFlowSpeed', 'laneWidth', 'rightClearance', 'leftClearance', 'accessPoints'].map(id => [id, value(id)]));
    for (const id of ['ffsMode', 'medianType', 'terrain', 'sutMix', 'pceSource']) input[id] = document.getElementById(id).value;
    for (const id of ['upgradePCE', 'downgradePCE']) {
        input[id] = document.getElementById(id).value === '' ? null : value(id);
    }
    try {
        const output = ML.calculate(input);
        const fixed = (n, digits = 2) => n.toFixed(digits);
        const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const title = word => word.charAt(0).toUpperCase() + word.slice(1);
        const summary = Object.entries(output.results).map(([direction, d]) => `${title(direction)}: ${d.error ? 'needs PCE' : `LOS ${d.los}`}`).join('; ');
        const location = input.terrain === 'specific' ? `${input.gradeLength.toLocaleString()} ft grade` : `${title(input.terrain)} terrain`;
        result.textContent = `${location} — ${summary}.`;
        let speedStep = `<p>Measured FFS = ${fixed(output.freeFlowSpeed)} mph.</p>`;
        if (output.adjustments) {
            const a = output.adjustments;
            speedStep = `<p class="formula">FFS = BFFS - f<sub>LW</sub> - f<sub>TLC</sub> - f<sub>M</sub> - f<sub>A</sub><br>
                = ${input.baseFreeFlowSpeed} - ${fixed(a.lane, 1)} - ${fixed(a.lateral, 1)} - ${fixed(a.median, 1)} - ${fixed(a.access, 1)} = ${fixed(output.freeFlowSpeed)} mph</p>
                <p>Total lateral clearance used: ${fixed(a.totalClearance)} ft (each side capped at 6 ft).</p>`;
        }
        let html = `<div class="step"><h3>1. Free-flow speed</h3>${speedStep}
            <p>HCM 6th Edition uses this FFS directly, without rounding to 5 mph. SAF = CAF = 1 for the multilane method.</p></div>
            <div class="step"><h3>2. Traffic and terrain</h3>
            <p>V = ${input.trafficVolume} veh/h; PHF = ${input.PHF}; N = 2 lanes in one direction.<br>
            Total heavy vehicles = ${input.heavyVehicles}% (includes buses and RVs).</p>`;
        if (input.terrain === 'specific') {
            html += `<p>${input.gradeLength} / 5,280 = ${fixed(output.lengthMiles, 4)} mi; grade magnitude = ${input.gradePercent}%. Both scenarios use the same directional demand and FFS.</p>
                <p>Table PCEs interpolate grade, length and heavy-vehicle percentage. Lengths beyond a table's last row use that row, per ODOT Appendix 11D. The terminal percentage column is used at 25% and above.</p>`;
        }
        html += '</div>';
        for (const [index, [direction, d]] of Object.entries(output.results).entries()) {
            html += `<div class="step"><h3>${index + 3}. ${title(direction)}${d.error ? '' : `: LOS ${d.los}`}</h3>`;
            if (d.error) {
                html += `<p class="calculation-warning">${escape(d.error)}</p></div>`;
                continue;
            }
            html += `<p>${escape(d.basis)}; E<sub>T</sub> = ${fixed(d.ET, 4)}.</p>`;
            if (d.basis === 'User-supplied PCE') html += `<p>Override basis: ${escape(input.pceSource)}</p>`;
            html += `<p class="formula">f<sub>HV</sub> = 1 / [1 + P<sub>T</sub>(E<sub>T</sub> - 1)]<br>
                = 1 / [1 + ${input.heavyVehicles / 100}(${fixed(d.ET, 4)} - 1)] = ${fixed(d.fHV, 4)}<br>
                v<sub>p</sub> = V / (PHF &times; N &times; f<sub>HV</sub>)<br>
                = ${input.trafficVolume} / (${input.PHF} &times; 2 &times; ${fixed(d.fHV, 4)}) = ${fixed(d.flow)} pc/h/ln</p>
                <p>c = min[1,900 + 20(FFS - 45), 2,300] = ${fixed(d.capacity)} pc/h/ln; demand/capacity = ${fixed(d.ratio, 3)}.</p>`;
            if (d.los === 'F') {
                html += '<p>Demand exceeds capacity: LOS F. This method does not predict speed or density for oversaturated flow.</p>';
            } else {
                html += `<p class="formula">${d.flow <= 1400 ? 'v<sub>p</sub> &le; 1,400: S = FFS' : 'S = FFS - (FFS - c/45)[(v<sub>p</sub> - 1,400)/(c - 1,400)]<sup>1.31</sup>'}<br>
                    S = ${fixed(d.speed)} mph<br>D = v<sub>p</sub> / S = ${fixed(d.flow)} / ${fixed(d.speed)} = ${fixed(d.density)} pc/mi/ln</p>`;
            }
            html += '</div>';
        }
        if (output.freeFlowSpeed > 60) html += '<p class="calculation-warning">HCM notes limited field calibration for the 65 and 70 mph multilane curves.</p>';
        steps.innerHTML = html;
    } catch (err) {
        error.textContent = err.message;
    }
}

if (typeof document !== 'undefined') {
    const form = document.getElementById('losForm');
    const syncFields = () => {
        const estimated = document.getElementById('ffsMode').value === 'estimated';
        for (const [id, enabled] of [['measuredFields', !estimated], ['estimatedFields', estimated],
            ['specificFields', document.getElementById('terrain').value === 'specific']]) {
            document.getElementById(id).hidden = !enabled;
            document.getElementById(id).disabled = !enabled;
        }
        document.getElementById('leftClearance').disabled = !estimated || document.getElementById('medianType').value !== 'divided';
    };
    form.addEventListener('submit', event => { event.preventDefault(); calculateLOS(); });
    const clearResults = () => {
        document.getElementById('result').textContent = '';
        document.getElementById('steps').replaceChildren();
        document.getElementById('losError').textContent = '';
        syncFields();
    };
    form.addEventListener('input', clearResults);
    form.addEventListener('change', clearResults);
    syncFields();
}
