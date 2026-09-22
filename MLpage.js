/* Page controls and worked calculations for the two independent ML methods. */
const MLPage = (() => {
    const $ = id => document.getElementById(id);
    const fixed = (value, digits = 2) => value.toFixed(digits);
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const title = word => word.charAt(0).toUpperCase() + word.slice(1);
    const editionName = edition => edition === '2010' ? 'HCM 2010' : 'HCM 6th Edition (2016)';
    const summary = output => Object.entries(output.results).map(([direction, d]) => `${title(direction)}: ${d.error ? 'needs PCE' : `LOS ${d.los}`}`).join('; ');

    function workedSteps(input, output) {
        const legacy = input.edition === '2010';
        const speed = legacy ? output.curveSpeed : output.freeFlowSpeed;
        let speedStep = `<p>Measured FFS = ${fixed(output.freeFlowSpeed)} mph.</p>`;
        if (output.adjustments) {
            const a = output.adjustments;
            speedStep = `<p class="formula">FFS = BFFS - f<sub>LW</sub> - f<sub>${legacy ? 'LC' : 'TLC'}</sub> - f<sub>M</sub> - f<sub>A</sub><br>
                = ${input.baseFreeFlowSpeed} - ${fixed(a.lane, 1)} - ${fixed(a.lateral, 1)} - ${fixed(a.median, 1)} - ${fixed(a.access, 1)} = ${fixed(output.freeFlowSpeed)} mph</p>
                <p>Total lateral clearance used: ${fixed(a.totalClearance)} ft (each side capped at 6 ft).</p>`;
        }
        let html = `<p class="edition-label">${editionName(input.edition)}</p>
            <div class="step"><h3>1. Free-flow speed</h3>${speedStep}
            ${legacy ? `<p class="formula">Selected 2010 curve F = nearest 5 mph to ${fixed(output.freeFlowSpeed)} = ${output.curveSpeed} mph</p>
                <p>HCM 2010 uses this selected curve for capacity, operating speed and LOS limits.</p>`
                : '<p>HCM 6th Edition uses this FFS directly, without rounding to 5 mph. SAF = CAF = 1 for the multilane method.</p>'}
            <p>Displayed values are rounded; subsequent calculations use full precision except for lateral-clearance/access adjustments rounded to 0.1 mph${legacy ? ' and interpolated 2010 PCEs rounded to 0.1' : ''}.</p></div>
            <div class="step"><h3>2. Traffic and terrain</h3>
            <p>V = ${input.trafficVolume} veh/h; PHF = ${input.PHF}; N = 2 lanes in one direction.</p>`;
        html += legacy
            ? `<p class="formula">P<sub>T</sub> = ${input.percentTrucks} / 100 = ${input.percentTrucks / 100}<br>
                P<sub>R</sub> = ${input.percentRVs} / 100 = ${input.percentRVs / 100}<br>f<sub>p</sub> = ${output.driverFactor}</p>`
            : `<p>Total heavy vehicles = ${input.heavyVehicles}% (includes buses and RVs).</p>
                <p class="formula">P<sub>T</sub> = ${input.heavyVehicles} / 100 = ${input.heavyVehicles / 100}</p>`;
        if (input.terrain === 'specific') {
            html += `<p class="formula">Grade length (mi) = ${input.gradeLength} / 5,280 = ${fixed(output.lengthMiles, 4)}</p>
                <p>Grade magnitude = ${input.gradePercent}%. Both scenarios use the same directional demand and FFS.</p>
                ${legacy ? '<p>2010 PCEs use separate grade and length bands for trucks/buses and RVs, interpolating only the vehicle-class percentage to the nearest 0.1 PCE.</p>'
                    : '<p>Table PCEs interpolate grade, length and heavy-vehicle percentage. Lengths beyond a table\'s last row use that row, per ODOT Appendix 11D. The terminal percentage column is used at 25% and above.</p>'}`;
        }
        html += '</div>';
        for (const [index, [direction, d]] of Object.entries(output.results).entries()) {
            html += `<div class="step"><h3>${index + 3}. ${title(direction)}${d.error ? '' : `: LOS ${d.los}`}</h3>`;
            if (d.error) {
                html += `<p class="calculation-warning">${escape(d.error)}</p></div>`;
                continue;
            }
            html += `<p>${escape(d.basis)}; E<sub>T</sub> = ${fixed(d.ET, 4)}${legacy ? `; E<sub>R</sub> = ${fixed(d.ER, 4)}` : ''}.</p>`;
            if (d.usedOverride || d.basis === 'User-supplied PCE') html += `<p>Override basis: ${escape(legacy ? input.pceSource2010 : input.pceSource)}</p>`;
            html += legacy
                ? `<p class="formula">f<sub>HV</sub> = 1 / [1 + P<sub>T</sub>(E<sub>T</sub> - 1) + P<sub>R</sub>(E<sub>R</sub> - 1)]<br>
                    = 1 / [1 + ${input.percentTrucks / 100}(${fixed(d.ET, 4)} - 1) + ${input.percentRVs / 100}(${fixed(d.ER, 4)} - 1)] = ${fixed(d.fHV, 4)}<br>
                    v<sub>p</sub> = V / (PHF &times; N &times; f<sub>HV</sub> &times; f<sub>p</sub>)<br>
                    = ${input.trafficVolume} / (${input.PHF} &times; 2 &times; ${fixed(d.fHV, 4)} &times; ${output.driverFactor}) = ${fixed(d.flow)} pc/h/ln</p>
                    <p class="formula">${output.curveSpeed} mph curve: c = ${fixed(d.capacity)} pc/h/ln; a = ${fixed(d.coefficient)} mph<br>`
                : `<p class="formula">f<sub>HV</sub> = 1 / [1 + P<sub>T</sub>(E<sub>T</sub> - 1)]<br>
                    = 1 / [1 + ${input.heavyVehicles / 100}(${fixed(d.ET, 4)} - 1)] = ${fixed(d.fHV, 4)}<br>
                    v<sub>p</sub> = V / (PHF &times; N &times; f<sub>HV</sub>)<br>
                    = ${input.trafficVolume} / (${input.PHF} &times; 2 &times; ${fixed(d.fHV, 4)}) = ${fixed(d.flow)} pc/h/ln</p>
                    <p class="formula">c = min[1,900 + 20 &times; (FFS - 45), 2,300]<br>
                    = min[1,900 + 20 &times; (${fixed(speed)} - 45), 2,300] = ${fixed(d.capacity)} pc/h/ln<br>`;
            html += `Demand/capacity = v<sub>p</sub> / c = ${fixed(d.flow)} / ${fixed(d.capacity)} = ${fixed(d.ratio, 3)}</p>`;
            if (d.los === 'F') {
                html += '<p>Demand exceeds capacity: LOS F. This method does not predict speed or density for oversaturated flow.</p>';
            } else {
                let speedFormula = `v<sub>p</sub> &le; 1,400: S = ${legacy ? 'F' : 'FFS'} = ${fixed(speed)} mph`;
                if (d.flow > 1400) {
                    speedFormula = legacy
                        ? `1,400 &lt; v<sub>p</sub> &le; c:<br>S = F - a &times; [(v<sub>p</sub> - 1,400) / (c - 1,400)]<sup>1.31</sup><br>
                            = ${fixed(speed)} - ${fixed(d.coefficient)} &times; [(${fixed(d.flow)} - 1,400) / (${fixed(d.capacity)} - 1,400)]<sup>1.31</sup><br>= ${fixed(d.speed)} mph`
                        : `1,400 &lt; v<sub>p</sub> &le; c:<br>S = FFS - (FFS - c / 45) &times; [(v<sub>p</sub> - 1,400) / (c - 1,400)]<sup>1.31</sup><br>
                            = ${fixed(speed)} - (${fixed(speed)} - ${fixed(d.capacity)} / 45) &times; [(${fixed(d.flow)} - 1,400) / (${fixed(d.capacity)} - 1,400)]<sup>1.31</sup><br>= ${fixed(d.speed)} mph`;
                }
                const densityRange = { A: '0 &le; D &le; 11', B: '11 &lt; D &le; 18', C: '18 &lt; D &le; 26',
                    D: '26 &lt; D &le; 35', E: `35 &lt; D &le; ${legacy ? d.densityLimit : 45}` }[d.los];
                html += `<p class="formula">${speedFormula}<br>D = v<sub>p</sub> / S = ${fixed(d.flow)} / ${fixed(d.speed)} = ${fixed(d.density)} pc/mi/ln</p>
                    <p>LOS ${d.los}: ${densityRange} pc/mi/ln, using unrounded density${legacy ? '; the capacity test controls LOS F' : ''}. <a href="#calculation-formulas">View all formulas and LOS limits</a>.</p>`;
            }
            html += '</div>';
        }
        if (!legacy && output.freeFlowSpeed > 60) html += '<p class="calculation-warning">HCM notes limited field calibration for the 65 and 70 mph multilane curves.</p>';
        return html;
    }

    function comparisonTables(outputs, terrain) {
        let html = '<p>Both editions use the same directional volume, PHF, roadway geometry and measured/estimated FFS. The 6th Edition uses trucks/buses plus RVs as total heavy vehicles. Only HCM 2010 applies the driver population factor.</p>';
        for (const direction of terrain === 'specific' ? ['upgrade', 'downgrade'] : ['segment']) {
            const rows = [
                ['LOS', d => d.los], ['FFS used (mph)', (d, o) => fixed(o.curveSpeed ?? o.freeFlowSpeed)],
                ['E<sub>T</sub>', d => fixed(d.ET, 4)], ['E<sub>R</sub>', d => d.ER === undefined ? 'Included with SUTs' : fixed(d.ER, 4)],
                ['f<sub>HV</sub>', d => fixed(d.fHV, 4)], ['Flow (pc/h/ln)', d => fixed(d.flow)],
                ['Capacity (pc/h/ln)', d => fixed(d.capacity)], ['Demand/capacity', d => fixed(d.ratio, 3)],
                ['Operating speed (mph)', d => d.speed === null ? 'Unavailable (LOS F)' : fixed(d.speed)],
                ['Density (pc/mi/ln)', d => d.density === null ? 'Unavailable (LOS F)' : fixed(d.density)]
            ];
            html += `<table class="los-limits comparison-table"><caption>${title(direction)} comparison</caption>
                <thead><tr><th scope="col">Measure</th><th scope="col">HCM 2010</th><th scope="col">HCM 6th Edition</th></tr></thead><tbody>`;
            for (const [label, format] of rows) {
                html += `<tr><th scope="row">${label}</th>`;
                for (const edition of ['2010', '6th']) {
                    const o = outputs[edition], d = o.results?.[direction];
                    html += `<td>${o.error ? 'Unavailable' : d.error ? 'Needs PCE' : format(d, o)}</td>`;
                }
                html += '</tr>';
            }
            html += '</tbody></table>';
        }
        return html;
    }

    function calculateLOS() {
        $('result').textContent = '';
        $('steps').replaceChildren();
        $('losError').textContent = '';
        if (!$('losForm').reportValidity()) return;
        const input = Object.fromEntries(['trafficVolume', 'heavyVehicles', 'percentTrucks', 'percentRVs', 'driverFactor',
            'gradeLength', 'gradePercent', 'PHF', 'freeFlowSpeed', 'baseFreeFlowSpeed', 'laneWidth', 'rightClearance',
            'leftClearance', 'accessPoints'].map(id => [id, $(id).valueAsNumber]));
        for (const id of ['ffsMode', 'medianType', 'terrain', 'sutMix', 'pceSource', 'pceSource2010']) input[id] = $(id).value;
        for (const id of ['upgradePCE', 'downgradePCE', 'upgradeET2010', 'upgradeER2010', 'downgradeET2010', 'downgradeER2010']) {
            input[id] = $(id).value === '' ? null : $(id).valueAsNumber;
        }
        input.edition = $('analysisEdition').value;
        const location = input.terrain === 'specific' ? `${input.gradeLength.toLocaleString()} ft grade` : `${title(input.terrain)} terrain`;
        try {
            if (input.edition === 'both') {
                const outputs = ML.calculateBoth(input);
                input.heavyVehicles = input.percentTrucks + input.percentRVs;
                $('result').textContent = `${location} — HCM 2010 and HCM 6th Edition comparison.`;
                let html = comparisonTables(outputs, input.terrain);
                for (const edition of ['2010', '6th']) {
                    const output = outputs[edition];
                    html += `<details class="edition-results" open><summary>${editionName(edition)}${output.error ? ': unavailable' : ` — ${summary(output)}`}</summary>
                        ${output.error ? `<p class="calculation-warning">${escape(output.error)}</p>` : workedSteps({ ...input, edition }, output)}</details>`;
                }
                $('steps').innerHTML = html;
            } else {
                const output = ML.calculate(input);
                $('result').textContent = `${location} — ${summary(output)}.`;
                $('steps').innerHTML = workedSteps(input, output);
            }
        } catch (err) {
            $('losError').textContent = err.message;
        }
    }

    function syncFields() {
        const edition = $('analysisEdition').value;
        const legacy = edition !== '6th', sixth = edition !== '2010';
        const estimated = $('ffsMode').value === 'estimated';
        const specific = $('terrain').value === 'specific';
        for (const [id, enabled] of [['measuredFields', !estimated], ['estimatedFields', estimated], ['specificFields', specific],
            ['sixthPCEFields', sixth], ['legacyPCEFields', legacy], ['splitTrafficFields', legacy]]) {
            $(id).hidden = !enabled;
            $(id).disabled = !enabled;
        }
        $('combinedTrafficFields').hidden = legacy;
        $('heavyVehicles').disabled = legacy;
        $('comparisonTrafficHelp').hidden = edition !== 'both';
        const total = $('percentTrucks').valueAsNumber + $('percentRVs').valueAsNumber;
        $('comparisonHeavyTotal').textContent = Number.isFinite(total) ? String(Number(total.toFixed(6))) : '—';
        $('sixthFormulas').hidden = !sixth;
        $('legacyFormulas').hidden = !legacy;
        $('leftClearance').disabled = !estimated || $('medianType').value !== 'divided';
        $('freeFlowSpeed').min = legacy ? '42.5' : '45';
        $('freeFlowSpeed').max = sixth ? '70' : '62.5';
        $('editionHelp').textContent = edition === 'both'
            ? 'Compare the same traffic and roadway with each edition’s own PCE tables, speed curves and LOS criteria. Unsupported conditions are reported separately.'
            : legacy ? 'HCM 2010 separates trucks/buses from RVs and selects the nearest 5 mph speed curve.'
                : 'HCM 6th Edition combines all heavy vehicles and uses FFS directly.';
        $('speedRangeHelp').textContent = edition === 'both'
            ? 'HCM 2010 accepts FFS from 42.5 to less than 62.5 mph and selects a 45, 50, 55 or 60 mph curve. The 6th Edition uses FFS directly from 45 to 70 mph. Each edition reports its own range limitations.'
            : legacy ? 'HCM 2010 accepts FFS from 42.5 to less than 62.5 mph, rounded to the nearest 5 mph curve. For example, 56 mph selects 55 mph; 57.5 mph selects 60 mph.'
                : 'FFS must be from 45 to 70 mph. HCM 6th Edition uses the measured or estimated speed directly, including intermediate values such as 56 mph.';
        $('measuredSpeedHelp').textContent = `Use a representative passenger-car speed study under low to moderate flow (${edition === '2010' ? 'up to 1,400 pc/h/ln for HCM 2010' : 'up to 500 pc/h/ln for the 6th Edition'}). Roadway adjustments are already reflected in measured FFS.`;
    }
    const form = $('losForm');
    form.addEventListener('submit', event => { event.preventDefault(); calculateLOS(); });
    const clearResults = () => {
        $('result').textContent = '';
        $('steps').replaceChildren();
        $('losError').textContent = '';
        syncFields();
    };
    form.addEventListener('input', clearResults);
    form.addEventListener('change', clearResults);
    syncFields();
    return { calculateLOS };
})();
