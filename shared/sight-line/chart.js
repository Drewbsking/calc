(function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const format = SightLine.format;

    function element(tag, attributes, text) {
        const node = document.createElementNS(NS, tag);
        Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, value));
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function draw(svg, params, profile, checkDistance) {
        svg.replaceChildren();
        const rows = profile ? profile.rows : [];
        const elevations = [params.eye, params.target, ...rows.map(row => row.elevation)];
        const low = Math.min(...elevations);
        const high = Math.max(...elevations);
        const padding = Math.max((high - low) * 0.2, 0.5);
        const minY = low - padding;
        const maxY = high + padding;
        const left = 98, right = 754, top = 35, bottom = 292;
        const x = value => left + value / params.length * (right - left);
        const y = value => bottom - (value - minY) / (maxY - minY) * (bottom - top);
        const add = (tag, attributes, text) => {
            const node = element(tag, attributes, text);
            svg.append(node);
            return node;
        };
        add('title', {}, profile ? 'Sight line compared with entered ground elevations' : 'Sight line with the checked distance marked');
        add('desc', {}, 'Distance increases from the eye on the left to the target on the right. Elevations are in feet. Axes use different scales. Exact values are also shown in the results.');
        for (let i = 0; i <= 5; i++) {
            const distance = params.length * i / 5;
            const elevation = minY + (maxY - minY) * i / 5;
            add('line', { x1: x(distance), y1: top, x2: x(distance), y2: bottom, class: 'sl-grid-line' });
            add('text', { x: x(distance), y: bottom + 24, 'text-anchor': 'middle', class: 'sl-tick' }, format(distance));
            add('line', { x1: left, y1: y(elevation), x2: right, y2: y(elevation), class: 'sl-grid-line' });
            add('text', { x: left - 12, y: y(elevation) + 4, 'text-anchor': 'end', class: 'sl-tick' }, format(elevation));
        }
        if (profile) {
            profile.obstructions.forEach(([a, b]) => {
                add('polygon', { points: [
                    [x(a.distance), y(a.elevation)], [x(b.distance), y(b.elevation)],
                    [x(b.distance), y(b.sight)], [x(a.distance), y(a.sight)],
                ].map(pair => pair.join(',')).join(' '), class: 'sl-obstruction' });
            });
            if (rows.length > 1) add('polyline', {
                points: rows.map(row => x(row.distance) + ',' + y(row.elevation)).join(' '), class: 'sl-ground-line',
            });
        }
        add('line', { x1: x(0), y1: y(params.eye), x2: x(params.length), y2: y(params.target), class: 'sl-sight-line' });
        [[0, params.eye, 'Eye'], [params.length, params.target, 'Target']].forEach(([distance, elevation, label]) => {
            add('circle', { cx: x(distance), cy: y(elevation), r: 4, class: 'sl-endpoint' });
            add('text', { x: x(distance) + (distance === 0 ? 8 : -8), y: y(elevation) - 12,
                'text-anchor': distance === 0 ? 'start' : 'end', class: 'sl-point-label' }, label);
        });
        rows.forEach(row => {
            const dot = add('circle', { cx: x(row.distance), cy: y(row.elevation), r: 4,
                class: 'sl-ground-point ' + row.status });
            dot.append(element('title', {}, 'Distance ' + format(row.distance) + ' ft; ground ' + format(row.elevation) + ' ft; clearance ' + format(row.clearance) + ' ft.'));
        });
        if (checkDistance !== undefined) {
            const elevation = SightLine.interpolate(params, checkDistance);
            add('line', { x1: x(checkDistance), x2: x(checkDistance), y1: y(elevation), y2: bottom, class: 'sl-check-guide' });
            add('circle', { cx: x(checkDistance), cy: y(elevation), r: 7, class: 'sl-check-point' });
        }
        add('text', { x: (left + right) / 2, y: 347, 'text-anchor': 'middle', class: 'sl-axis-label' }, 'Distance from eye (ft)');
        add('text', { transform: 'translate(18 164) rotate(-90)', 'text-anchor': 'middle', class: 'sl-axis-label' }, 'Elevation (ft)');
    }

    window.SightLineChart = { draw };
})();
