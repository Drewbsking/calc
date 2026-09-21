(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.RoadNameSearch = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';

    const SERVICE_ROOT = 'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/';
    const ROADS_URL = SERVICE_ROOT + 'EnterpriseTransportationDataMapService/MapServer/0/query';
    const BOUNDARIES_URL = SERVICE_ROOT + 'EnterpriseAdminDataMapService/MapServer/2/query';
    const PAGE_SIZE = 2000;
    const MAX_SEGMENTS = 10000;
    const MAX_TERM_LENGTH = 80;
    const ROAD_FIELDS = [
        'OBJECTID', 'DirectionalPrefix', 'StreetName', 'StreetType', 'DirectionalSuffix',
        'CartographicName', 'LowAddressLeft', 'HighAddressLeft', 'LowAddressRight',
        'HighAddressRight', 'CVTTaxNameLeft', 'CVTTaxNameRight', 'JurisdictionName',
        'RoadCode', 'SpeedLimit'
    ];

    function cleanTerm(value, label) {
        const term = String(value || '').trim();
        if (term.length > MAX_TERM_LENGTH) throw new Error(label + ' must be 80 characters or fewer.');
        // These SQL pattern characters could turn a name search into a whole-layer query.
        // Reject rather than silently change the user's intended name.
        if (/[%_\[\]\\\u0000-\u001f\u007f]/.test(term)) {
            throw new Error(label + ' cannot contain wildcard characters (%, _, [, ], \\) or control characters.');
        }
        if (!/^[\p{L}\p{M}\p{N} .'\u2019&()/,\-]*$/u.test(term)) {
            throw new Error(label + ' must use letters, numbers, spaces or road-name punctuation (apostrophes, periods, hyphens, &, /, commas or parentheses).');
        }
        return term;
    }

    function buildWhere(search, mode, exclusion) {
        if (!['exact', 'begins', 'contains'].includes(mode)) throw new Error('Choose Exact, Begins with, or Contains.');
        const term = cleanTerm(search, 'Road name');
        const exclude = cleanTerm(exclusion, 'Exclusion');
        if (!term) throw new Error('Enter a road name.');
        if (mode !== 'exact' && Array.from(term).length < 2) {
            throw new Error('Enter at least two characters for Begins with or Contains.');
        }
        // The only user input in SQL is inside a quoted string literal.
        const quote = value => value.replace(/'/g, "''");
        const literal = quote(term);
        let where = mode === 'exact' ? "StreetName = '" + literal + "'" :
            "StreetName LIKE '" + (mode === 'contains' ? '%' : '') + literal + "%'";
        if (exclude) where += " AND StreetName NOT LIKE '%" + quote(exclude) + "%'";
        return where;
    }

    async function fetchJSON(url, params, signal, fetcher = fetch, cache = 'default') {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        else signal?.addEventListener('abort', abort, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
        try {
            const response = await fetcher(url + '?' + new URLSearchParams(params), {
                signal: controller.signal, credentials: 'omit', cache
            });
            if (!response.ok) throw new Error('The GIS service returned HTTP ' + response.status + '.');
            const data = await response.json();
            if (data.error) throw new Error('ArcGIS service error: ' + (data.error.message || 'The query could not be completed.'));
            return data;
        } catch (error) {
            if (timedOut && !signal?.aborted) throw new Error('The GIS service took too long to respond. Please try again.');
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }

    async function fetchGeoJSON(url, params, signal, fetcher) {
        const data = await fetchJSON(url, params, signal, fetcher);
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
            throw new Error('The GIS service returned an unexpected response.');
        }
        return data;
    }

    async function loadRevisionDate(source, { signal, fetcher } = {}) {
        const sources = {
            roads: { url: ROADS_URL, field: 'RevisionDate' },
            boundaries: { url: BOUNDARIES_URL, field: 'REVISIONDATE' }
        };
        if (!Object.prototype.hasOwnProperty.call(sources, source)) throw new Error('Unknown data source.');
        const { url, field } = sources[source];
        // A single server-computed value, not a download of the dataset.
        // This is a feature revision date, not a service publication/update date.
        const data = await fetchJSON(url, {
            where: field + ' IS NOT NULL', returnGeometry: 'false', f: 'json',
            outStatistics: JSON.stringify([{
                statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'LatestRevisionDate'
            }])
        }, signal, fetcher, 'no-store');
        const attributes = data.features?.[0]?.attributes;
        if (!attributes || !Object.prototype.hasOwnProperty.call(attributes, 'LatestRevisionDate')) {
            throw new Error('The GIS service returned an unexpected revision-date response.');
        }
        const timestamp = attributes.LatestRevisionDate;
        if (timestamp === null) return null;
        if (typeof timestamp !== 'number' || !Number.isFinite(new Date(timestamp).getTime())) {
            throw new Error('The GIS service returned an invalid revision date.');
        }
        return timestamp;
    }

    async function searchRoads(search, mode, exclusion, { signal, onProgress, fetcher } = {}) {
        const where = buildWhere(search, mode, exclusion);
        const features = [];
        const seen = new Set();
        let offset = 0;
        while (features.length < MAX_SEGMENTS) {
            const page = await fetchGeoJSON(ROADS_URL, {
                where, outFields: ROAD_FIELDS.join(','), returnGeometry: 'true', outSR: '4326',
                f: 'geojson', orderByFields: 'OBJECTID', resultRecordCount: String(PAGE_SIZE),
                resultOffset: String(offset)
            }, signal, fetcher);
            if (signal?.aborted) throw new DOMException('Search cancelled.', 'AbortError');
            const previousCount = features.length;
            for (const feature of page.features) {
                const id = feature.properties?.OBJECTID ?? feature.id;
                if (id == null) throw new Error('The GIS service returned a segment without its record ID.');
                if (!seen.has(id)) { seen.add(id); features.push(feature); }
                if (features.length === MAX_SEGMENTS) break;
            }
            onProgress?.(features.length);
            // ArcGIS may place this flag in GeoJSON's foreign "properties" member.
            const transferLimit = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit;
            const more = transferLimit === true || (transferLimit == null && page.features.length === PAGE_SIZE);
            if (features.length === MAX_SEGMENTS) return { features, capped: true };
            if (!more) return { features, capped: false };
            if (features.length === previousCount) {
                throw new Error('The GIS service could not advance to the next page. Narrow the search and try again.');
            }
            offset += page.features.length;
        }
        return { features, capped: true };
    }

    async function loadBoundaries({ signal, fetcher } = {}) {
        const data = await fetchGeoJSON(BOUNDARIES_URL, {
            where: '1=1', outFields: 'NAME,TYPE', returnGeometry: 'true', outSR: '4326',
            geometryPrecision: '5', maxAllowableOffset: '0.0001', f: 'geojson'
        }, signal, fetcher);
        if (!data.features.length || data.exceededTransferLimit || data.properties?.exceededTransferLimit) {
            throw new Error('The GIS service did not return the complete community boundaries.');
        }
        return data;
    }

    const textValue = value => value == null ? '' : String(value).trim();
    function roadName(properties) {
        return textValue(properties.CartographicName) ||
            ['DirectionalPrefix', 'StreetName', 'StreetType', 'DirectionalSuffix']
                .map(field => textValue(properties[field])).filter(Boolean).join(' ') || 'Unnamed road';
    }

    function groupRoads(features) {
        const groups = new Map();
        for (const feature of features) {
            const p = feature.properties || {};
            const name = roadName(p);
            const left = textValue(p.CVTTaxNameLeft);
            const right = textValue(p.CVTTaxNameRight);
            const jurisdiction = textValue(p.JurisdictionName);
            const key = JSON.stringify([name, left, right, jurisdiction]);
            if (!groups.has(key)) groups.set(key, { key, name, left, right, jurisdiction, features: [] });
            groups.get(key).features.push(feature);
        }
        return Array.from(groups.values()).sort((a, b) =>
            a.name.localeCompare(b.name) || a.left.localeCompare(b.left) ||
            a.right.localeCompare(b.right) || a.jurisdiction.localeCompare(b.jurisdiction));
    }

    function addressRange(properties, side) {
        const available = value => value != null && textValue(value) !== '' && Number(value) > 0;
        const low = properties['LowAddress' + side];
        const high = properties['HighAddress' + side];
        if (available(low) && available(high)) return low === high ? String(low) : low + '\u2013' + high;
        if (available(low)) return 'From ' + low;
        if (available(high)) return 'To ' + high;
        return '';
    }

    function groupDetails(group) {
        const unique = fn => Array.from(new Set(group.features.map(f => fn(f.properties || {})).filter(Boolean))).join('; ') || 'Not provided';
        return [
            ['Left community', group.left || 'Not provided'],
            ['Right community', group.right || 'Not provided'],
            ['Jurisdiction', group.jurisdiction || 'Not provided'],
            ['Road code(s)', unique(p => textValue(p.RoadCode))],
            ['Left address ranges', unique(p => addressRange(p, 'Left'))],
            ['Right address ranges', unique(p => addressRange(p, 'Right'))],
            ['Speed limit(s)', unique(p => Number(p.SpeedLimit) > 0 ? p.SpeedLimit + ' mph' : '')],
            ['Centerline segments', String(group.features.length)]
        ];
    }

    return { buildWhere, searchRoads, loadBoundaries, loadRevisionDate, groupRoads, groupDetails, MAX_SEGMENTS };
});
