const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../scripts/roadNameSearchCore.js');

const feature = (id, properties = {}) => ({
    type: 'Feature', properties: { OBJECTID: id, CartographicName: 'Test Rd', ...properties },
    geometry: { type: 'LineString', coordinates: [[-83.4, 42.6], [-83.39, 42.61]] }
});
const response = (features, extra = {}) => ({
    ok: true, json: async () => ({ type: 'FeatureCollection', features, ...extra })
});

test('query modes and exclusion are literal StreetName expressions', () => {
    assert.equal(core.buildWhere(' isla ', 'exact', ''), "StreetName = 'isla'");
    assert.equal(core.buildWhere('isla', 'begins', 'island'), "StreetName LIKE 'isla%' AND StreetName NOT LIKE '%island%'");
    assert.equal(core.buildWhere('isla', 'contains', ''), "StreetName LIKE '%isla%'");
    assert.equal(core.buildWhere("O'Brien", 'begins', "D'Angelo"), "StreetName LIKE 'O''Brien%' AND StreetName NOT LIKE '%D''Angelo%'");
    assert.equal(core.buildWhere("x' OR 'a", 'exact', ''), "StreetName = 'x'' OR ''a'");
    assert.equal(core.buildWhere('A', 'exact', ''), "StreetName = 'A'");
});

test('empty, broad, overlong and invalid queries never reach the service', async () => {
    let requests = 0;
    const fetcher = async () => { requests++; return response([]); };
    for (const [search, mode, exclusion] of [
        ['', 'exact', ''], ['   ', 'begins', ''], ['a', 'contains', ''],
        ['ab', "exact OR 1=1", ''], ['ab', 'toString', ''], ['a'.repeat(81), 'exact', ''],
        ['ab', 'begins', 'x'.repeat(81)], ['%%', 'contains', ''], ['__', 'begins', ''],
        ['[ab]', 'begins', ''], ['a\\b', 'exact', ''], ['ab', 'begins', '%'], ['a\u0000b', 'exact', ''],
        ["x' OR '1'='1", 'exact', ''], ['<img src=x onerror=alert(1)>', 'exact', ''], ['ab;cd', 'exact', '']
    ]) {
        await assert.rejects(core.searchRoads(search, mode, exclusion, { fetcher }));
    }
    assert.equal(requests, 0);
});

test('pagination follows short pages with transfer flags and encodes every request', async () => {
    const urls = [];
    const pages = [
        response([feature(1), feature(2)], { exceededTransferLimit: true }),
        response([feature(3)], { properties: { exceededTransferLimit: true } }),
        response([feature(4)], { exceededTransferLimit: false })
    ];
    const result = await core.searchRoads("O'Brien & Sons", 'begins', '', {
        fetcher: async (url, options) => {
            urls.push(new URL(url));
            assert.equal(options.credentials, 'omit');
            assert.ok(options.signal instanceof AbortSignal);
            return pages.shift();
        }
    });
    assert.equal(result.features.length, 4);
    assert.equal(result.capped, false);
    assert.deepEqual(urls.map(url => url.searchParams.get('resultOffset')), ['0', '2', '3']);
    for (const url of urls) {
        const params = url.searchParams;
        assert.equal(params.get('where'), "StreetName LIKE 'O''Brien & Sons%'");
        assert.equal(params.get('returnGeometry'), 'true');
        assert.equal(params.get('outSR'), '4326');
        assert.equal(params.get('f'), 'geojson');
        assert.equal(params.get('orderByFields'), 'OBJECTID');
        assert.equal(params.get('resultRecordCount'), '2000');
        assert.deepEqual(params.get('outFields').split(','), [
            'OBJECTID', 'DirectionalPrefix', 'StreetName', 'StreetType', 'DirectionalSuffix',
            'CartographicName', 'LowAddressLeft', 'HighAddressLeft', 'LowAddressRight',
            'HighAddressRight', 'CVTTaxNameLeft', 'CVTTaxNameRight', 'JurisdictionName', 'RoadCode', 'SpeedLimit'
        ]);
    }
});

test('a full page without transfer metadata requests the next page', async () => {
    let requests = 0;
    const result = await core.searchRoads('ab', 'begins', '', { fetcher: async () =>
        ++requests === 1 ? response(Array.from({ length: 2000 }, (_, i) => feature(i))) : response([])
    });
    assert.equal(requests, 2);
    assert.equal(result.features.length, 2000);
});

test('the 10,000 segment cap bounds requests and marks the result incomplete', async () => {
    const offsets = [];
    const result = await core.searchRoads('ab', 'contains', '', { fetcher: async url => {
        const offset = Number(new URL(url).searchParams.get('resultOffset'));
        offsets.push(offset);
        return response(Array.from({ length: 2000 }, (_, i) => feature(offset + i)), { exceededTransferLimit: true });
    } });
    assert.deepEqual(offsets, [0, 2000, 4000, 6000, 8000]);
    assert.equal(result.features.length, 10000);
    assert.equal(result.capped, true);
});

test('duplicate records are not counted twice and a stalled service stops', async () => {
    let requests = 0;
    const result = await core.searchRoads('ab', 'begins', '', { fetcher: async () =>
        ++requests === 1 ? response([feature(1)], { exceededTransferLimit: true }) : response([feature(1), feature(2)])
    });
    assert.equal(result.features.length, 2);
    await assert.rejects(core.searchRoads('ab', 'begins', '', { fetcher: async () =>
        response([feature(1)], { exceededTransferLimit: true })
    }), /next page/);
});

test('aborting a search aborts its fetch and prevents further pages', async () => {
    const controller = new AbortController();
    let requestSignal;
    const pending = core.searchRoads('ab', 'begins', '', { signal: controller.signal, fetcher: (url, options) => {
        requestSignal = options.signal;
        return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => {
            reject(new DOMException('Cancelled', 'AbortError'));
        }));
    } });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(requestSignal.aborted, true);
});

test('network, HTTP, ArcGIS and malformed responses are reported as failures', async () => {
    const failures = [
        async () => { throw new TypeError('Failed to fetch'); },
        async () => ({ ok: false, status: 503 }),
        async () => ({ ok: true, json: async () => ({ error: { code: 400, message: 'Invalid query' } }) }),
        async () => ({ ok: true, json: async () => ({ unexpected: true }) })
    ];
    for (const fetcher of failures) await assert.rejects(core.searchRoads('ab', 'begins', '', { fetcher }));
});

test('roads group by full cartographic name, both communities and jurisdiction', () => {
    const common = { CartographicName: 'N Test Rd', CVTTaxNameLeft: 'A', CVTTaxNameRight: 'B', JurisdictionName: 'County' };
    const features = [feature(1, common), feature(2, common),
        feature(3, { ...common, CVTTaxNameRight: 'C' }),
        feature(4, { ...common, CVTTaxNameLeft: 'B', CVTTaxNameRight: 'A' }),
        feature(5, { ...common, JurisdictionName: 'City' }),
        feature(6, { ...common, CartographicName: 'S Test Rd' })];
    const groups = core.groupRoads(features);
    assert.equal(groups.length, 5);
    assert.equal(groups.reduce((sum, group) => sum + group.features.length, 0), features.length);
    assert.ok(groups.some(group => group.features.length === 2 && group.name === 'N Test Rd'));
});

test('details retain disjoint per-segment address ranges and differing codes and speeds', () => {
    const [group] = core.groupRoads([
        feature(1, { RoadCode: '001', SpeedLimit: 25, LowAddressLeft: 10, HighAddressLeft: 20 }),
        feature(2, { RoadCode: '002', SpeedLimit: 35, LowAddressLeft: 90, HighAddressLeft: 80 }),
        feature(3, { RoadCode: null, SpeedLimit: 0, LowAddressLeft: 0, HighAddressLeft: null })
    ]);
    const details = Object.fromEntries(core.groupDetails(group));
    assert.equal(details['Road code(s)'], '001; 002');
    assert.equal(details['Speed limit(s)'], '25 mph; 35 mph');
    assert.equal(details['Left address ranges'], '10\u201320; 90\u201380');
    assert.equal(details['Right address ranges'], 'Not provided');
    assert.equal(details['Centerline segments'], '3');
});

test('boundaries use only the requested public municipal query', async () => {
    await core.loadBoundaries({ fetcher: async (url, options) => {
        const request = new URL(url);
        assert.match(request.pathname, /EnterpriseAdminDataMapService\/MapServer\/2\/query$/);
        assert.deepEqual(Object.fromEntries(request.searchParams), {
            where: '1=1', outFields: 'NAME,TYPE', returnGeometry: 'true', outSR: '4326',
            geometryPrecision: '5', maxAllowableOffset: '0.0001', f: 'geojson'
        });
        assert.equal(options.credentials, 'omit');
        return response([feature(1)]);
    } });
    await assert.rejects(core.loadBoundaries({ fetcher: async () => response([]) }), /complete/);
});

test('dataset dates use one fresh server-side maximum with no geometry or feature download', async () => {
    const timestamp = Date.UTC(2025, 0, 1);
    for (const [source, path, field] of [
        ['roads', 'EnterpriseTransportationDataMapService/MapServer/0/query', 'RevisionDate'],
        ['boundaries', 'EnterpriseAdminDataMapService/MapServer/2/query', 'REVISIONDATE']
    ]) {
        const result = await core.loadRevisionDate(source, { fetcher: async (url, options) => {
            const request = new URL(url);
            assert.ok(request.pathname.endsWith(path));
            assert.equal(request.searchParams.get('where'), field + ' IS NOT NULL');
            assert.equal(request.searchParams.get('returnGeometry'), 'false');
            assert.equal(request.searchParams.get('f'), 'json');
            assert.equal(request.searchParams.has('outFields'), false);
            assert.deepEqual(JSON.parse(request.searchParams.get('outStatistics')), [{
                statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'LatestRevisionDate'
            }]);
            assert.equal(options.credentials, 'omit');
            assert.equal(options.cache, 'no-store');
            return { ok: true, json: async () => ({ features: [{ attributes: { LatestRevisionDate: timestamp } }] }) };
        } });
        assert.equal(result, timestamp);
    }
});

test('missing revision dates stay unavailable; malformed dates and service failures are rejected', async () => {
    const fetcher = value => async () => ({ ok: true, json: async () => ({ features: [{ attributes: { LatestRevisionDate: value } }] }) });
    assert.equal(await core.loadRevisionDate('roads', { fetcher: fetcher(null) }), null);
    for (const invalid of ['', '2025-01-01', undefined, Infinity, {}, 1e20]) {
        await assert.rejects(core.loadRevisionDate('roads', { fetcher: fetcher(invalid) }), /revision.date/i);
    }
    await assert.rejects(core.loadRevisionDate('boundaries', { fetcher: async () => ({ ok: true, json: async () => ({ features: [] }) }) }), /revision-date/);
    await assert.rejects(core.loadRevisionDate('boundaries', { fetcher: async () => ({ ok: true, json: async () => ({ error: { message: 'Unavailable' } }) }) }), /Unavailable/);
});

test('only the two known dataset date sources can be requested', async () => {
    let requests = 0;
    for (const source of ['toString', '__proto__', 'other']) {
        await assert.rejects(core.loadRevisionDate(source, { fetcher: async () => { requests++; } }), /Unknown data source/);
    }
    assert.equal(requests, 0);
});
