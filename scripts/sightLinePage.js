(() => {
    'use strict';
    const app = document.querySelector('[data-sight-line-tool]');
    if (!app) return;
    const isProfile = app.dataset.sightLineTool === 'profile';
    const get = id => document.getElementById(id);
    const form = get('sight-line-form');
    const results = get('sight-line-results');
    const error = get('sight-line-error');
    const chart = get('sight-line-chart');
    const related = get('related-tool');
    const format = SightLine.format;
    const sample = 'Distance,Elevation\n0,1000\n50,1001\n100,1002.2\n150,1003.4\n200,1002.8\n250,1001.5\n300,1000';
    const statusNames = { above: 'Above sight line', touching: 'Touches sight line', below: 'Below sight line' };
    let exportRows = null;

    function update() {
        error.hidden = true;
        results.hidden = true;
        exportRows = null;
        if (isProfile) get('download-results').disabled = true;
        try {
            const params = SightLine.parameters(get('eye-elevation').value, get('target-elevation').value, get('total-distance').value);
            const query = new URLSearchParams({ eye: params.eye, target: params.target, length: params.length });
            related.href = (isProfile ? 'sightLineElevation.html' : 'sightLineProfile.html') + '?' + query;
            if (isProfile) {
                const points = SightLine.parseGroundPoints(get('ground-points').value, params.length);
                const profile = SightLine.analyzeProfile(params, points);
                const summary = get('profile-summary');
                summary.textContent = profile.above ? profile.above + ' ground point(s) above the sight line' :
                    profile.touching ? profile.touching + ' ground point(s) touch the sight line' : 'All entered ground points are below the sight line';
                summary.dataset.state = profile.above ? 'above' : profile.touching ? 'touching' : 'below';
                get('minimum-clearance').textContent = format(profile.minimum.clearance) + ' ft';
                get('minimum-location').textContent = 'At ' + format(profile.minimum.distance) + ' ft from the eye';
                get('point-count').textContent = String(points.length);
                get('coverage').textContent = points.length === 1 ?
                    'One ground point entered. Add more points to draw a ground profile.' :
                    'Ground shown only from ' + format(points[0].distance) + ' to ' + format(points[points.length - 1].distance) + ' ft. Adjacent points are joined by straight segments.';
                const body = get('ground-results');
                body.replaceChildren();
                profile.rows.forEach(row => {
                    const tr = document.createElement('tr');
                    [format(row.distance), format(row.elevation), format(row.sight), format(row.clearance), statusNames[row.status]].forEach(value => {
                        const cell = document.createElement('td');
                        cell.textContent = value;
                        tr.append(cell);
                    });
                    tr.lastElementChild.className = 'sl-status-cell ' + row.status;
                    body.append(tr);
                });
                SightLineChart.draw(chart, params, profile);
                exportRows = profile.rows;
                get('download-results').disabled = false;
            } else {
                get('distance-slider').max = params.length;
                const distance = SightLine.number(get('check-distance').value, 'check distance');
                const elevation = SightLine.interpolate(params, distance);
                get('distance-slider').value = distance;
                get('checked-elevation').textContent = format(elevation) + ' ft';
                get('checked-location').textContent = 'At ' + format(distance) + ' ft from the eye';
                get('calculation').textContent = format(params.eye) + ' + (' + format(params.target) + ' - ' + format(params.eye) + ') × (' + format(distance) + ' / ' + format(params.length) + ') = ' + format(elevation) + ' ft';
                SightLineChart.draw(chart, params, null, distance);
            }
            results.hidden = false;
        } catch (issue) {
            error.textContent = issue.message;
            error.hidden = false;
            related.href = isProfile ? 'sightLineElevation.html' : 'sightLineProfile.html';
        }
    }

    const query = new URLSearchParams(window.location.search);
    [['eye', 'eye-elevation'], ['target', 'target-elevation'], ['length', 'total-distance']].forEach(([key, id]) => {
        if (query.has(key)) get(id).value = query.get(key);
    });
    if (isProfile && ['eye', 'target', 'length'].some(key => query.has(key))) {
        get('ground-points').value = '';
        app.querySelector('.sl-example-note').textContent = 'Sight line inputs were carried from the other tool. Enter your measured ground points, or load the example to replace all inputs.';
    }
    if (!isProfile && query.has('length')) {
        const length = Number(query.get('length'));
        if (Number.isFinite(length) && length > 0) get('check-distance').value = length / 2;
    }
    form.addEventListener('input', update);
    form.addEventListener('submit', event => { event.preventDefault(); update(); });
    if (!isProfile) get('distance-slider').addEventListener('input', () => {
        get('check-distance').value = get('distance-slider').value;
        update();
    });
    get('load-example').addEventListener('click', () => {
        get('eye-elevation').value = '1003.5';
        get('target-elevation').value = '1002';
        get('total-distance').value = '300';
        if (isProfile) get('ground-points').value = sample;
        else get('check-distance').value = '150';
        app.querySelector('.sl-example-note').textContent = 'Illustrative example loaded. Results update as you type.';
        update();
    });
    if (isProfile) get('download-results').addEventListener('click', () => {
        if (!exportRows) return;
        const lines = ['Distance_ft,Ground_elevation_ft,Sight_line_elevation_ft,Clearance_ft,Position'];
        exportRows.forEach(row => lines.push([row.distance, row.elevation, row.sight, row.clearance, statusNames[row.status]].join(',')));
        const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sight-line-clearances.csv';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    update();
})();
