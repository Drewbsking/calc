/* Browser controller; numeric calculation lives in freewayLOSCore.js. */
(() => {
    const $ = id => document.getElementById(id);
    const form = $('losForm');
    const numeric = id => $(id).value.trim() === '' ? NaN : Number($(id).value);
    const fixed = (value, digits = 2) => value.toFixed(digits);
    function showFields(id, visible) {
        $(id).hidden = !visible;
        $(id).disabled = !visible;
    }
    function clear() {
        $('result').textContent = '';
        $('steps').replaceChildren();
        $('losError').textContent = '';
    }
    function sync() {
        showFields('estimatedFields', $('ffsMode').value === 'estimated');
        showFields('measuredFields', $('ffsMode').value === 'measured');
        showFields('specificFields', $('terrain').value === 'specific');
    }
    function inputs() {
        const input = {};
        for (const id of ['trafficVolume', 'lanes', 'PHF', 'heavyVehicles', 'freeFlowSpeed',
            'baseFreeFlowSpeed', 'laneWidth', 'rightClearance', 'rampDensity', 'gradePercent', 'gradeLength', 'sutMix']) {
            input[id] = numeric(id);
        }
        for (const id of ['ffsMode', 'terrain', 'pceSource']) input[id] = $(id).value;
        if ($('pceOverride').value.trim() !== '') input.pceOverride = numeric('pceOverride');
        return input;
    }
    function step(title, formula, note) {
        const section = document.createElement('section');
        section.className = 'step';
        const heading = document.createElement('h3');
        heading.textContent = title;
        const calculation = document.createElement('p');
        calculation.className = 'formula';
        calculation.textContent = formula;
        section.append(heading, calculation);
        if (note) {
            const paragraph = document.createElement('p');
            paragraph.textContent = note;
            section.append(paragraph);
        }
        $('steps').append(section);
    }
    function calculate() {
        clear();
        if (!form.reportValidity()) return;
        try {
            const i = inputs(), r = FreewayLOS.calculate(i);
            $('result').textContent = `Basic freeway — LOS ${r.los}`;
            const a = r.adjustments;
            step('1. Free-flow speed', a
                ? `FFS = ${fixed(i.baseFreeFlowSpeed)} − ${fixed(a.lane)} − ${fixed(a.lateral)} − 3.22 × ${fixed(i.rampDensity)}^0.84 = ${fixed(r.freeFlowSpeed)} mph`
                : `FFS = ${fixed(r.freeFlowSpeed)} mph (measured)`,
                a ? `Lane-width penalty: ${fixed(a.lane)} mph; right-clearance penalty: ${fixed(a.lateral)} mph; ramp-density penalty: ${fixed(a.ramps)} mph.` : 'No geometric adjustments are applied to measured FFS.');
            step('2. Heavy vehicles and adjusted flow',
                `fHV = 1 / [1 + ${fixed(i.heavyVehicles / 100, 4)} × (${fixed(r.ET, 4)} − 1)] = ${fixed(r.fHV, 6)}; vp = ${fixed(i.trafficVolume)} / (${fixed(i.PHF, 4)} × ${i.lanes} × ${fixed(r.fHV, 6)}) = ${fixed(r.flow)} pc/h/ln`, r.basis);
            step('3. Capacity and breakpoint',
                `c = min[2,200 + 10 × (${fixed(r.freeFlowSpeed)} − 50), 2,400] = ${fixed(r.capacity)} pc/h/ln; BP = 1,000 + 40 × (75 − ${fixed(r.freeFlowSpeed)}) = ${fixed(r.breakpoint)} pc/h/ln`,
                `Demand / capacity = ${fixed(r.ratio, 4)}. Speed and capacity adjustment factors: 1.00.`);
            if (r.los === 'F') {
                step('4. LOS F: demand exceeds capacity', `${fixed(r.flow)} > ${fixed(r.capacity)} pc/h/ln`,
                    'The basic segment method does not predict speed or density under oversaturated conditions. Use a freeway facility analysis for queues and congestion.');
            } else {
                step('4. Operating speed and density', r.flow <= r.breakpoint
                    ? `vp ≤ BP: S = FFS = ${fixed(r.speed)} mph; D = ${fixed(r.flow)} / ${fixed(r.speed)} = ${fixed(r.density)} pc/mi/ln`
                    : `S = ${fixed(r.freeFlowSpeed)} − (${fixed(r.freeFlowSpeed)} − ${fixed(r.capacity)}/45) × [(${fixed(r.flow)} − ${fixed(r.breakpoint)})/(${fixed(r.capacity)} − ${fixed(r.breakpoint)})]^2 = ${fixed(r.speed)} mph; D = ${fixed(r.flow)} / ${fixed(r.speed)} = ${fixed(r.density)} pc/mi/ln`,
                    `LOS ${r.los} uses unrounded density; displayed values are rounded.`);
            }
        } catch (error) {
            clear();
            $('losError').textContent = error.message;
        }
    }
    form.addEventListener('submit', event => { event.preventDefault(); calculate(); });
    form.addEventListener('input', () => { clear(); sync(); });
    form.addEventListener('change', () => { clear(); sync(); });
    $('loadExample').addEventListener('click', () => {
        const example = {trafficVolume: 2400, lanes: 2, PHF: .9, heavyVehicles: 5,
            ffsMode: 'estimated', baseFreeFlowSpeed: 60, laneWidth: 12, rightClearance: 10,
            rampDensity: 1, terrain: 'level', pceOverride: '', pceSource: ''};
        for (const [id, value] of Object.entries(example)) $(id).value = value;
        sync();
        calculate();
    });
    sync();
})();
