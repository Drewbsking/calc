(function () {
    'use strict';

    const STANDARDS = {
        residential: {
            label: 'Standard residential',
            width: { typical: 16, min: 12, max: 35 },
            side: { typical: 10, min: 5, max: 35, label: 'radius' },
            opening: { typical: 36, min: 14, max: 55 },
            angle: { typical: 90, min: 60, max: 90 },
            spacing: 45
        },
        subdivision: {
            label: 'Residential — subdivision',
            width: { typical: 16, min: 10, max: 25 },
            side: { typical: 6, min: 2, max: 15, label: 'taper width' },
            taperDepth: { typical: 10, min: 10, max: 20 },
            opening: { typical: 24, min: 14, max: 55 },
            angle: { typical: 90, min: 60, max: 90 },
            spacing: 45
        },
        commercial: {
            label: 'Commercial — two-way',
            width: { typical: 24, min: 22, max: 40 },
            side: { typical: 35, min: 10, max: 35, label: 'radius' },
            opening: { typical: null, min: 42, max: 105 },
            angle: { typical: 90, min: 60, max: 90 },
            spacing: 70
        }
    };

    const RESIDENTIAL_SIGHT_DISTANCE = {
        25: 280,
        30: 335,
        35: 390,
        40: 445,
        45: 500,
        50: 555,
        55: 610
    };

    const elements = {};

    function byId(id) {
        return document.getElementById(id);
    }

    function numberValue(element) {
        const value = Number(element.value);
        return Number.isFinite(value) ? value : 0;
    }

    function formatFeet(value, decimals) {
        if (!Number.isFinite(value)) return 'N/A';
        const places = decimals === undefined ? (Number.isInteger(value) ? 0 : 1) : decimals;
        return `${value.toFixed(places)} ft`;
    }

    function almostEqual(a, b) {
        return Math.abs(a - b) < 0.01;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getExistingDriveways() {
        return Array.from(elements.rows.querySelectorAll('.driveway-row')).map((row) => ({
            station: numberValue(row.querySelector('.driveway-station')),
            width: numberValue(row.querySelector('.driveway-width'))
        }));
    }

    function evenlySpacedStations(frontage, count) {
        return Array.from({ length: count }, (_, index) => frontage * (index + 1) / (count + 1));
    }

    function renderDrivewayRows(options) {
        const config = options || {};
        const count = Number(elements.count.value);
        const standard = STANDARDS[elements.type.value];
        const frontage = Math.max(numberValue(elements.frontage), 0);
        const prior = getExistingDriveways();
        const evenStations = evenlySpacedStations(frontage, count);
        const forceTypicalWidth = Boolean(config.forceTypicalWidth);
        const forceEven = Boolean(config.forceEven);

        elements.rows.innerHTML = '';
        for (let index = 0; index < count; index += 1) {
            const item = document.createElement('div');
            item.className = 'driveway-row';
            const station = forceEven ? evenStations[index] : (prior[index] ? prior[index].station : evenStations[index]);
            const width = forceTypicalWidth ? standard.width.typical : (prior[index] ? prior[index].width : standard.width.typical);
            item.innerHTML = `
                <div class="driveway-row-number" aria-hidden="true">${index + 1}</div>
                <div class="form-group">
                    <label for="driveway-station-${index}">Driveway ${index + 1} center station (ft)</label>
                    <input class="driveway-station" type="number" id="driveway-station-${index}" min="0" step="0.1" value="${station.toFixed(1)}">
                </div>
                <div class="form-group">
                    <label for="driveway-width-${index}">Driveway ${index + 1} width, B (ft)${index > 0 && elements.type.value === 'commercial' ? ' — additional' : ''}</label>
                    <input class="driveway-width" type="number" id="driveway-width-${index}" min="0" step="0.1" value="${width.toFixed(1)}">
                </div>`;
            elements.rows.appendChild(item);
        }
    }

    function setTypicalGeometry() {
        const standard = STANDARDS[elements.type.value];
        elements.angle.value = standard.angle.typical;
        elements.entering.value = standard.side.typical;
        elements.exiting.value = standard.side.typical;
        if (standard.taperDepth) elements.taperDepth.value = standard.taperDepth.typical;
        renderDrivewayRows({ forceTypicalWidth: true });
        calculateAndRender();
    }

    function updateConditionalFields(resetGeometry) {
        const type = elements.type.value;
        const count = Number(elements.count.value);
        const isResidential = type !== 'commercial';
        const isSubdivision = type === 'subdivision';

        document.querySelector('.driveway-arrangement-field').classList.toggle('is-hidden', !(isResidential && count === 2));
        document.querySelector('.driveway-taper-depth-field').classList.toggle('is-hidden', !isSubdivision);
        elements.residentialSight.classList.toggle('is-hidden', !isResidential);
        elements.enteringLabel.textContent = isSubdivision ? 'Entering taper width, C (ft) — all driveways' : 'Entering radius, C (ft) — all driveways';
        elements.exitingLabel.textContent = isSubdivision ? 'Exiting taper width, D (ft) — all driveways' : 'Exiting radius, D (ft) — all driveways';
        elements.geometryGuidance.textContent = `${STANDARDS[type].label}: typical values are loaded. Values elsewhere in a permitted range still require RCOC approval.`;
        elements.intersectionFields.classList.toggle('is-hidden', !elements.nearIntersection.checked);

        if (resetGeometry) setTypicalGeometry();
    }

    function readModel() {
        const type = elements.type.value;
        return {
            type,
            standard: STANDARDS[type],
            frontage: numberValue(elements.frontage),
            count: Number(elements.count.value),
            arrangement: elements.arrangement.value,
            angle: numberValue(elements.angle),
            entering: numberValue(elements.entering),
            exiting: numberValue(elements.exiting),
            taperDepth: numberValue(elements.taperDepth),
            driveways: getExistingDriveways(),
            speed: Number(elements.speed.value),
            sight: numberValue(elements.sight),
            nearIntersection: elements.nearIntersection.checked,
            centerlineOffset: numberValue(elements.centerlineOffset),
            futureRowOffset: numberValue(elements.futureRowOffset)
        };
    }

    function addRangeCheck(checks, label, value, range, unit) {
        const suffix = unit || 'ft';
        if (value < range.min || value > range.max) {
            checks.push({ status: 'fail', label, detail: `${value.toFixed(1)} ${suffix} is outside the permitted ${range.min}–${range.max} ${suffix} range.` });
        } else if (range.typical !== null && range.typical !== undefined && !almostEqual(value, range.typical)) {
            checks.push({ status: 'review', label, detail: `${value.toFixed(1)} ${suffix} is within the permitted range; the published typical value is ${range.typical} ${suffix}. RCOC approval is needed for a different value.` });
        } else {
            const typicalText = range.typical === null || range.typical === undefined ? 'is within the permitted range' : 'matches the published typical value';
            checks.push({ status: 'pass', label, detail: `${value.toFixed(1)} ${suffix} ${typicalText}.` });
        }
    }

    function evaluate(model) {
        const checks = [];
        const openings = model.driveways.map((driveway) => driveway.width + model.entering + model.exiting);
        const gaps = [];
        for (let index = 1; index < model.driveways.length; index += 1) {
            gaps.push(model.driveways[index].station - model.driveways[index - 1].station);
        }

        if (model.frontage <= 0) {
            checks.push({ status: 'fail', label: 'Road frontage', detail: 'Enter a road frontage greater than 0 ft.' });
        } else {
            checks.push({ status: 'pass', label: 'Road frontage entered', detail: `${formatFeet(model.frontage)} of road frontage is being checked.` });
        }

        if (model.type === 'commercial') {
            if (almostEqual(model.frontage, 100)) {
                checks.push({ status: 'review', label: 'Commercial driveway count', detail: 'The written rule does not expressly address exactly 100 ft of frontage. Consult the Permits Division.' });
            } else if (model.frontage < 100 && model.count > 1) {
                checks.push({ status: 'fail', label: 'Commercial driveway count', detail: 'Frontage under 100 ft is limited to one commercial driveway.' });
            } else if (model.frontage < 100) {
                checks.push({ status: 'pass', label: 'Commercial driveway count', detail: 'One driveway is proposed on frontage under 100 ft.' });
            } else if (model.count > 1) {
                const additionalWidth = model.driveways.slice(1).reduce((sum, driveway) => sum + driveway.width, 0);
                const allowedAdditionalWidth = 0.15 * (model.frontage - 100);
                if (additionalWidth <= allowedAdditionalWidth + 0.001) {
                    checks.push({ status: 'pass', label: '15% additional-width limit', detail: `${formatFeet(additionalWidth)} of additional driveway width is no more than the ${formatFeet(allowedAdditionalWidth)} allowance: 0.15(F − 100).` });
                } else {
                    checks.push({ status: 'fail', label: '15% additional-width limit', detail: `${formatFeet(additionalWidth)} of additional driveway width exceeds the ${formatFeet(allowedAdditionalWidth)} allowance by ${formatFeet(additionalWidth - allowedAdditionalWidth)}.` });
                }
                checks.push({ status: 'review', label: 'Additional commercial access', detail: 'Additional commercial driveways may be permitted only after RCOC safety, traffic-flow, volume, and operational review.' });
            } else {
                checks.push({ status: 'pass', label: 'Commercial driveway count', detail: 'One commercial driveway is proposed.' });
            }
        } else if (model.count === 1) {
            checks.push({ status: 'pass', label: 'Residential driveway count', detail: 'One residential driveway is permitted for a platted lot or unplatted residential parcel.' });
        } else if (model.count === 2 && model.arrangement === 'circle') {
            if (model.frontage >= 80) {
                checks.push({ status: 'pass', label: 'Circle-driveway frontage', detail: `${formatFeet(model.frontage)} meets the 80-ft minimum frontage for a two-access circle driveway.` });
                checks.push({ status: 'review', label: 'Second residential access', detail: 'A circle driveway with two accesses may be permitted when RCOC determines it will not create a safety problem.' });
            } else {
                checks.push({ status: 'fail', label: 'Circle-driveway frontage', detail: `${formatFeet(model.frontage)} is less than the 80-ft minimum for a circle driveway.` });
            }
        } else if (model.count === 2) {
            if (model.frontage > 300) {
                checks.push({ status: 'pass', label: 'Second-driveway frontage', detail: `${formatFeet(model.frontage)} is more than the required 300 ft.` });
                checks.push({ status: 'review', label: 'Second residential access', detail: 'A second driveway may be permitted when RCOC determines it will not create a safety problem.' });
            } else {
                checks.push({ status: 'fail', label: 'Second-driveway frontage', detail: `A separate second residential driveway requires more than 300 ft of frontage; ${formatFeet(model.frontage)} is entered.` });
            }
        } else {
            checks.push({ status: 'fail', label: 'Residential driveway count', detail: 'The quick-reference provisions cover one driveway or qualifying two-driveway arrangements, not more than two residential driveways.' });
        }

        addRangeCheck(checks, 'Intersecting angle A', model.angle, model.standard.angle, 'degrees');
        addRangeCheck(checks, `Entering ${model.standard.side.label} C`, model.entering, model.standard.side);
        addRangeCheck(checks, `Exiting ${model.standard.side.label} D`, model.exiting, model.standard.side);
        if (model.standard.taperDepth) addRangeCheck(checks, 'Taper depth Q', model.taperDepth, model.standard.taperDepth);

        model.driveways.forEach((driveway, index) => {
            addRangeCheck(checks, `Driveway ${index + 1} width B`, driveway.width, model.standard.width);
            const opening = openings[index];
            if (opening < model.standard.opening.min || opening > model.standard.opening.max) {
                checks.push({ status: 'fail', label: `Driveway ${index + 1} total opening R`, detail: `${formatFeet(opening)} from B + C + D is outside the permitted ${model.standard.opening.min}–${model.standard.opening.max} ft range.` });
            } else {
                const typical = model.standard.opening.typical === null ? 'No typical R is specified.' : `The table lists ${model.standard.opening.typical} ft as typical.`;
                checks.push({ status: 'pass', label: `Driveway ${index + 1} total opening R`, detail: `${formatFeet(opening)} from B + C + D is within the permitted range. ${typical}` });
            }

            const leftEdge = driveway.station - (driveway.width / 2 + model.entering);
            const rightEdge = driveway.station + (driveway.width / 2 + model.exiting);
            if (driveway.station < 0 || driveway.station > model.frontage) {
                checks.push({ status: 'fail', label: `Driveway ${index + 1} center station`, detail: `${formatFeet(driveway.station)} is outside the 0–${model.frontage.toFixed(1)} ft parcel frontage.` });
            } else if (leftEdge < -0.001 || rightEdge > model.frontage + 0.001) {
                checks.push({ status: 'fail', label: `Driveway ${index + 1} property-line fit`, detail: `The calculated opening runs from station ${leftEdge.toFixed(1)} to ${rightEdge.toFixed(1)} ft and does not remain within the parcel frontage.` });
            } else {
                checks.push({ status: 'pass', label: `Driveway ${index + 1} property-line fit`, detail: `The calculated opening remains within the parcel frontage (stations ${leftEdge.toFixed(1)}–${rightEdge.toFixed(1)} ft).` });
            }
        });

        gaps.forEach((gap, index) => {
            if (gap < 0) {
                checks.push({ status: 'fail', label: `Driveways ${index + 1}–${index + 2} station order`, detail: 'Center stations must increase from left to right.' });
            } else if (gap + 0.001 < model.standard.spacing) {
                checks.push({ status: 'fail', label: `Driveways ${index + 1}–${index + 2} spacing`, detail: `${formatFeet(gap)} center-to-center is less than the ${model.standard.spacing}-ft minimum.` });
            } else {
                checks.push({ status: 'pass', label: `Driveways ${index + 1}–${index + 2} spacing`, detail: `${formatFeet(gap)} center-to-center meets the ${model.standard.spacing}-ft minimum.` });
            }
        });

        if (model.type === 'commercial') {
            checks.push({ status: 'review', label: 'Commercial sight distance', detail: 'Determine commercial driveway sight distance using the RCOC Guide for Corner Sight Distance and Figure 6-1.' });
        } else {
            const requiredSight = RESIDENTIAL_SIGHT_DISTANCE[model.speed];
            if (model.sight >= requiredSight) {
                checks.push({ status: 'pass', label: 'Residential sight distance', detail: `${formatFeet(model.sight)} available meets the ${requiredSight}-ft minimum for ${model.speed} mph.` });
            } else {
                checks.push({ status: 'fail', label: 'Residential sight distance', detail: `${formatFeet(model.sight)} available is ${formatFeet(requiredSight - model.sight)} short of the ${requiredSight}-ft minimum for ${model.speed} mph.` });
            }
        }

        if (model.nearIntersection) {
            if (model.centerlineOffset >= 77) {
                checks.push({ status: 'pass', label: 'Intersection centerline offset', detail: `${formatFeet(model.centerlineOffset)} meets the 77-ft minimum.` });
            } else {
                checks.push({ status: 'fail', label: 'Intersection centerline offset', detail: `${formatFeet(model.centerlineOffset)} is less than the 77-ft minimum.` });
            }
            if (model.futureRowOffset >= 17) {
                checks.push({ status: 'pass', label: 'Future ROW-line offset', detail: `${formatFeet(model.futureRowOffset)} meets the 17-ft minimum.` });
            } else {
                checks.push({ status: 'fail', label: 'Future ROW-line offset', detail: `${formatFeet(model.futureRowOffset)} is less than the 17-ft minimum.` });
            }
            checks.push({ status: 'review', label: 'Intersection radius', detail: 'The driveway radius must not encroach on an intersection radius unless physically unavoidable.' });
        }

        return { checks, openings, gaps };
    }

    function renderStatus(checks) {
        const failures = checks.filter((check) => check.status === 'fail').length;
        const reviews = checks.filter((check) => check.status === 'review').length;
        let statusClass = 'pass';
        let heading = 'Initial dimensional checks pass';
        let detail = 'No conflicts were found in the values entered. Final RCOC permit review is still required.';

        if (failures) {
            statusClass = 'fail';
            heading = 'Layout needs revision';
            detail = `${failures} entered rule check${failures === 1 ? '' : 's'} did not pass. Review the red items below.`;
        } else if (reviews) {
            statusClass = 'review';
            heading = 'RCOC review is required';
            detail = `The entered dimensions pass, with ${reviews} item${reviews === 1 ? '' : 's'} requiring site-specific or non-typical approval.`;
        }

        elements.status.className = `driveway-status driveway-status-${statusClass}`;
        elements.status.querySelector('h2').textContent = heading;
        elements.statusDetail.textContent = detail;
    }

    function renderMetrics(model, evaluation) {
        const minGap = evaluation.gaps.length ? Math.min.apply(null, evaluation.gaps) : null;
        const openingText = evaluation.openings.map((opening, index) => `D${index + 1}: ${formatFeet(opening)}`).join(' · ');
        const metrics = [
            ['Road frontage', formatFeet(model.frontage)],
            ['Required center spacing', model.count > 1 ? `${model.standard.spacing} ft minimum` : 'Not applicable'],
            ['Smallest entered spacing', minGap === null ? 'Not applicable' : formatFeet(minGap)],
            ['Calculated opening(s)', openingText]
        ];

        if (model.type === 'commercial' && model.count > 1) {
            const additionalWidth = model.driveways.slice(1).reduce((sum, driveway) => sum + driveway.width, 0);
            const allowance = Math.max(0, 0.15 * (model.frontage - 100));
            const minimumFrontage = 100 + additionalWidth / 0.15;
            metrics.push(['Additional-width allowance', formatFeet(allowance)]);
            metrics.push(['Additional width entered', formatFeet(additionalWidth)]);
            metrics.push(['Frontage needed by 15% rule', formatFeet(minimumFrontage, 1)]);
        }

        if (model.type !== 'commercial') {
            metrics.push([`${model.speed}-mph sight-distance minimum`, formatFeet(RESIDENTIAL_SIGHT_DISTANCE[model.speed])]);
        }

        elements.metrics.innerHTML = metrics.map(([term, value]) => `
            <div>
                <dt>${escapeHtml(term)}</dt>
                <dd>${escapeHtml(value)}</dd>
            </div>`).join('');
    }

    function renderChecks(checks) {
        const icons = { pass: '✓', review: '!', fail: '×' };
        elements.checks.innerHTML = checks.map((check) => `
            <article class="driveway-check driveway-check-${check.status}">
                <span class="driveway-check-icon" aria-hidden="true">${icons[check.status]}</span>
                <div>
                    <h3>${escapeHtml(check.label)}</h3>
                    <p>${escapeHtml(check.detail)}</p>
                </div>
            </article>`).join('');
    }

    function renderPlan(model, evaluation) {
        const left = 55;
        const right = 725;
        const frontageWidth = right - left;
        const scale = model.frontage > 0 ? frontageWidth / model.frontage : 1;
        const xFor = (station) => left + station * scale;
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        let drivewayShapes = '';
        let dimensionLines = '';

        model.driveways.forEach((driveway, index) => {
            const halfWidth = driveway.width / 2;
            const topLeft = xFor(driveway.station - halfWidth);
            const topRight = xFor(driveway.station + halfWidth);
            const bottomLeft = xFor(driveway.station - halfWidth - model.entering);
            const bottomRight = xFor(driveway.station + halfWidth + model.exiting);
            const fits = bottomLeft >= left - 0.1 && bottomRight <= right + 0.1;
            drivewayShapes += `
                <polygon class="driveway-plan-opening ${fits ? '' : 'driveway-plan-opening-fail'}" points="${topLeft},64 ${topRight},64 ${bottomRight},184 ${bottomLeft},184"></polygon>
                <line class="driveway-plan-centerline" x1="${xFor(driveway.station)}" y1="52" x2="${xFor(driveway.station)}" y2="205"></line>
                <text class="driveway-plan-label" x="${clamp(xFor(driveway.station), left + 18, right - 18)}" y="47" text-anchor="middle">D${index + 1}</text>
                <text class="driveway-plan-station" x="${clamp(xFor(driveway.station), left + 28, right - 28)}" y="222" text-anchor="middle">Sta. ${driveway.station.toFixed(1)}</text>`;
        });

        evaluation.gaps.forEach((gap, index) => {
            const x1 = xFor(model.driveways[index].station);
            const x2 = xFor(model.driveways[index + 1].station);
            const y = 112 + (index % 2) * 24;
            const isFail = gap < model.standard.spacing;
            dimensionLines += `
                <line class="driveway-plan-dimension ${isFail ? 'driveway-plan-dimension-fail' : ''}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"></line>
                <circle class="driveway-plan-dimension-end ${isFail ? 'driveway-plan-dimension-end-fail' : ''}" cx="${x1}" cy="${y}" r="3"></circle>
                <circle class="driveway-plan-dimension-end ${isFail ? 'driveway-plan-dimension-end-fail' : ''}" cx="${x2}" cy="${y}" r="3"></circle>
                <text class="driveway-plan-gap ${isFail ? 'driveway-plan-gap-fail' : ''}" x="${(x1 + x2) / 2}" y="${y - 7}" text-anchor="middle">${gap.toFixed(1)} ft c-c</text>`;
        });

        elements.plan.innerHTML = `
            <svg viewBox="0 0 760 270" aria-hidden="true" focusable="false">
                <rect class="driveway-plan-parcel" x="${left}" y="24" width="${frontageWidth}" height="160"></rect>
                <line class="driveway-plan-property-line" x1="${left}" y1="20" x2="${left}" y2="230"></line>
                <line class="driveway-plan-property-line" x1="${right}" y1="20" x2="${right}" y2="230"></line>
                <text class="driveway-plan-property-label" x="${left}" y="252" text-anchor="middle">0 ft</text>
                <text class="driveway-plan-property-label" x="${right}" y="252" text-anchor="middle">${model.frontage.toFixed(1)} ft</text>
                ${drivewayShapes}
                ${dimensionLines}
                <rect class="driveway-plan-road" x="20" y="184" width="720" height="45"></rect>
                <line class="driveway-plan-road-center" x1="20" y1="206.5" x2="740" y2="206.5"></line>
                <text class="driveway-plan-road-label" x="380" y="214" text-anchor="middle">ROAD</text>
            </svg>`;
        elements.plan.setAttribute('aria-label', `${model.count}-driveway plan on ${model.frontage.toFixed(1)} feet of frontage with center stations ${model.driveways.map((driveway) => driveway.station.toFixed(1)).join(', ')} feet.`);
        elements.scaleLabel.textContent = `${formatFeet(model.frontage)} frontage`;
    }

    function calculateAndRender() {
        if (!elements.rows.children.length) return;
        const model = readModel();
        const evaluation = evaluate(model);
        renderStatus(evaluation.checks);
        renderMetrics(model, evaluation);
        renderChecks(evaluation.checks);
        renderPlan(model, evaluation);
    }

    function initialize() {
        elements.form = byId('driveway-form');
        if (!elements.form) return;
        elements.type = byId('driveway-type');
        elements.frontage = byId('road-frontage');
        elements.count = byId('driveway-count');
        elements.arrangement = byId('residential-arrangement');
        elements.angle = byId('intersecting-angle');
        elements.entering = byId('entering-side');
        elements.exiting = byId('exiting-side');
        elements.taperDepth = byId('taper-depth');
        elements.enteringLabel = byId('entering-side-label');
        elements.exitingLabel = byId('exiting-side-label');
        elements.geometryGuidance = byId('geometry-guidance');
        elements.rows = byId('driveway-rows');
        elements.residentialSight = byId('residential-sight-fields');
        elements.speed = byId('speed-limit');
        elements.sight = byId('available-sight-distance');
        elements.nearIntersection = byId('near-intersection');
        elements.intersectionFields = byId('intersection-fields');
        elements.centerlineOffset = byId('intersection-centerline-offset');
        elements.futureRowOffset = byId('future-row-offset');
        elements.status = byId('driveway-status');
        elements.statusDetail = byId('driveway-status-detail');
        elements.metrics = byId('driveway-metrics');
        elements.checks = byId('driveway-checks');
        elements.plan = byId('driveway-plan');
        elements.scaleLabel = byId('parcel-scale-label');

        renderDrivewayRows({ forceEven: true, forceTypicalWidth: true });
        updateConditionalFields(false);
        calculateAndRender();

        elements.type.addEventListener('change', () => updateConditionalFields(true));
        elements.count.addEventListener('change', () => {
            renderDrivewayRows({ forceEven: true });
            updateConditionalFields(false);
            calculateAndRender();
        });
        elements.nearIntersection.addEventListener('change', () => {
            updateConditionalFields(false);
            calculateAndRender();
        });
        byId('use-typical').addEventListener('click', setTypicalGeometry);
        byId('evenly-space').addEventListener('click', () => {
            renderDrivewayRows({ forceEven: true });
            calculateAndRender();
        });
        elements.form.addEventListener('input', calculateAndRender);
        elements.form.addEventListener('change', calculateAndRender);
    }

    if (typeof window !== 'undefined') {
        window.DrivewayCalculator = { STANDARDS, RESIDENTIAL_SIGHT_DISTANCE, evaluate };
    }

    document.addEventListener('DOMContentLoaded', initialize);
}());
