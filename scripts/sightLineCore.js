(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SightLine = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';

    function number(value, label) {
        if (typeof value !== 'number' && (typeof value !== 'string' ||
            !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) {
            throw new Error('Enter a number for ' + label + '.');
        }
        const result = Number(value);
        if (!Number.isFinite(result)) throw new Error('Enter a finite number for ' + label + '.');
        return result;
    }

    function parameters(eye, target, length) {
        const result = {
            eye: number(eye, 'eye elevation'),
            target: number(target, 'target elevation'),
            length: number(length, 'total distance'),
        };
        if (result.length <= 0) throw new Error('Total distance must be greater than zero.');
        if (!Number.isFinite(result.target - result.eye)) throw new Error('The elevation difference is too large.');
        return result;
    }

    function interpolate(params, distance) {
        const x = number(distance, 'distance from the eye');
        if (x < 0 || x > params.length) {
            throw new Error('Distance must be between 0 and ' + params.length + ' ft.');
        }
        return params.eye + (params.target - params.eye) * (x / params.length);
    }

    function parseGroundPoints(text, length) {
        const points = [];
        const distances = new Set();
        const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
        let firstContent = true;
        lines.forEach((line, index) => {
            if (!line.trim()) return;
            const parts = line.trim().split(/[,\t]/).map(part => part.trim());
            if (firstContent && parts.length === 2 &&
                /^distance(?:\s*\(ft\))?$/i.test(parts[0]) &&
                /^(?:ground\s+)?elevation(?:\s*\(ft\))?$/i.test(parts[1])) {
                firstContent = false;
                return;
            }
            firstContent = false;
            if (parts.length !== 2 || parts.some(part => part === '')) {
                throw new Error('Line ' + (index + 1) + ': enter distance, elevation (two values).');
            }
            const distance = number(parts[0], 'distance on line ' + (index + 1));
            const elevation = number(parts[1], 'elevation on line ' + (index + 1));
            if (distance < 0 || distance > length) {
                throw new Error('Line ' + (index + 1) + ': distance must be between 0 and ' + length + ' ft.');
            }
            if (distances.has(distance)) throw new Error('Line ' + (index + 1) + ': duplicate distance ' + distance + ' ft.');
            distances.add(distance);
            points.push({ distance, elevation });
        });
        if (!points.length) throw new Error('Enter at least one ground point as distance, elevation.');
        return points.sort((a, b) => a.distance - b.distance);
    }

    function analyzeProfile(params, points) {
        const rows = points.map(point => {
            const sight = interpolate(params, point.distance);
            const clearance = sight - point.elevation;
            return { ...point, sight, clearance,
                status: clearance < 0 ? 'above' : clearance === 0 ? 'touching' : 'below' };
        });
        const minimum = rows.reduce((result, row) => row.clearance < result.clearance ? row : result);
        // Clip shading to the exact crossing of each straight ground segment and the sight line.
        const obstructions = [];
        for (let i = 1; i < rows.length; i++) {
            let a = rows[i - 1];
            let b = rows[i];
            if (a.clearance >= 0 && b.clearance >= 0) continue;
            if (a.clearance > 0 || b.clearance > 0) {
                const x = a.distance + (b.distance - a.distance) * a.clearance / (a.clearance - b.clearance);
                const crossing = { distance: x, elevation: interpolate(params, x), sight: interpolate(params, x), clearance: 0 };
                if (a.clearance > 0) a = crossing;
                else b = crossing;
            }
            obstructions.push([a, b]);
        }
        return { rows, minimum, obstructions,
            above: rows.filter(row => row.status === 'above').length,
            touching: rows.filter(row => row.status === 'touching').length,
        };
    }

    function format(value) {
        if (value !== 0 && Math.abs(value) < 0.0001) return value.toExponential(2);
        return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }

    return { number, parameters, interpolate, parseGroundPoints, analyzeProfile, format };
});
