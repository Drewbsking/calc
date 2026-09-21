(function () {
    'use strict';

    const core = window.RoadNameSearch;
    const form = document.getElementById('road-search-form');
    const nameInput = document.getElementById('road-name');
    const modeInput = document.getElementById('match-mode');
    const excludeInput = document.getElementById('exclude-name');
    const status = document.getElementById('search-status');
    const results = document.getElementById('road-results');
    const list = document.getElementById('road-results-list');
    const details = document.getElementById('road-details');
    const boundaryStatus = document.getElementById('boundary-status');
    const retryBoundaries = document.getElementById('retry-boundaries');
    const allRoadsStatus = document.getElementById('all-roads-status');
    const retryAllRoads = document.getElementById('retry-all-roads');

    function setStatus(message, state = 'ready') {
        status.textContent = message;
        status.dataset.state = state;
    }

    if (!window.L || !core) {
        setStatus('The map library could not load. Check your connection and reload this page.', 'error');
        boundaryStatus.textContent = 'The map is unavailable.';
        allRoadsStatus.textContent = '';
        document.getElementById('search-button').disabled = true;
        form.addEventListener('submit', event => event.preventDefault());
        return;
    }

    const map = L.map('road-map', { preferCanvas: true }).setView([42.66, -83.38], 10);
    map.createPane('all-roads').style.zIndex = 300;
    map.getPane('all-roads').style.pointerEvents = 'none';
    map.createPane('community-boundaries').style.zIndex = 350;
    map.createPane('matching-roads').style.zIndex = 450;
    const boundaryLayer = L.geoJSON(null, {
        pane: 'community-boundaries',
        style: { color: '#7c8590', weight: 1, opacity: 0.85, fillOpacity: 0.01 },
        onEachFeature(feature, layer) {
            const label = document.createElement('span');
            label.textContent = [feature.properties?.NAME, feature.properties?.TYPE].filter(Boolean).join(' \u2014 ');
            layer.bindTooltip(label, { sticky: true, className: 'road-community-tooltip' });
        }
    }).addTo(map);
    const roadLayers = L.featureGroup().addTo(map);
    const defaultStyle = { color: '#005a9c', weight: 4, opacity: 1 };
    const selectedStyle = { color: '#a13b00', weight: 7, opacity: 1 };
    let countyBounds = null;
    let controller = null;
    let selected = null;

    // Render only Roads layer 0 for the viewport. This keeps the full network
    // visible without downloading all its features or changing name queries.
    const exportURL = 'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseTransportationDataMapService/MapServer/export';
    const roadLabelMinZoom = 12;
    // Filter labels only: the renderer below still draws every road centerline.
    const primaryRoadLabelWhere = "Act51RoadType IN ('County Primary', 'City Major', 'Highway State', 'Highway Interstate', 'Highway US')";
    let allRoadsLayer = null;
    let pendingRoadsLayer = null;
    let allRoadsRequest = null;
    let allRoadsDebounce;
    let allRoadsTimeout;

    function queueAllRoads() {
        clearTimeout(allRoadsDebounce);
        clearTimeout(allRoadsTimeout);
        allRoadsRequest?.abort();
        allRoadsRequest = null;
        pendingRoadsLayer?.remove();
        pendingRoadsLayer = null;
        allRoadsStatus.textContent = 'Loading road centerlines...';
        allRoadsStatus.dataset.state = 'loading';
        retryAllRoads.hidden = true;
        allRoadsDebounce = setTimeout(loadAllRoads, 150);
    }

    async function loadAllRoads() {
        const request = new AbortController();
        allRoadsRequest = request;
        const fail = () => {
            if (allRoadsRequest !== request) return;
            clearTimeout(allRoadsTimeout);
            pendingRoadsLayer?.remove();
            pendingRoadsLayer = null;
            allRoadsRequest = null;
            allRoadsStatus.textContent = 'Road centerlines could not refresh. Check your connection and retry. Road-name searches are still available.';
            allRoadsStatus.dataset.state = 'error';
            retryAllRoads.hidden = false;
        };
        allRoadsTimeout = setTimeout(() => { request.abort(); fail(); }, 30000);
        try {
            const bounds = map.getBounds();
            const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
            const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
            const size = map.getSize();
            const scale = Math.min(1, 4096 / Math.max(size.x, size.y));
            const zoom = map.getZoom();
            const showRoadLabels = zoom >= roadLabelMinZoom;
            const params = new URLSearchParams({
                bbox: [sw.x, sw.y, ne.x, ne.y].join(','), bboxSR: '3857', imageSR: '3857',
                size: [Math.max(1, Math.round(size.x * scale)), Math.max(1, Math.round(size.y * scale))].join(','),
                layers: 'show:0', format: 'png32', transparent: 'true', f: 'json',
                dynamicLayers: JSON.stringify([{
                    id: 0, source: { type: 'mapLayer', mapLayerId: 0 },
                    drawingInfo: {
                        showLabels: showRoadLabels,
                        labelingInfo: [{
                            labelPlacement: 'esriServerLinePlacementAboveAlong',
                            labelExpression: '[CartographicName]', useCodedValues: false,
                            where: primaryRoadLabelWhere, minScale: 0, maxScale: 0,
                            symbol: {
                                type: 'esriTS', color: [51, 65, 85, 255],
                                haloColor: [255, 255, 255, 255], haloSize: 1.5,
                                font: { family: 'Arial', size: zoom >= 14 ? 10 : 9,
                                    style: 'normal', weight: 'normal', decoration: 'none' }
                            }
                        }],
                        renderer: { type: 'simple', symbol: {
                            type: 'esriSLS', style: 'esriSLSSolid', color: [148, 156, 166, 255], width: 0.65
                        } }
                    }
                }])
            });
            const response = await fetch(exportURL + '?' + params, { signal: request.signal, credentials: 'omit' });
            if (!response.ok) throw new Error('Road map export failed.');
            const data = await response.json();
            if (allRoadsRequest !== request) return;
            if (data.error || !data.href || !data.extent) throw new Error('Invalid road map export.');
            const imageURL = new URL(data.href);
            if (imageURL.origin !== new URL(exportURL).origin) throw new Error('Unexpected road map image source.');
            const e = data.extent;
            if (![e.xmin, e.ymin, e.xmax, e.ymax].every(Number.isFinite)) throw new Error('Invalid road map extent.');
            // Use the returned extent: ArcGIS can adjust it to the image aspect ratio.
            const imageBounds = L.latLngBounds(
                L.CRS.EPSG3857.unproject(L.point(e.xmin, e.ymin)),
                L.CRS.EPSG3857.unproject(L.point(e.xmax, e.ymax))
            );
            const layer = L.imageOverlay(imageURL.href, imageBounds, { pane: 'all-roads', opacity: 0, interactive: false });
            pendingRoadsLayer = layer;
            layer.once('load', () => {
                if (allRoadsRequest !== request) return;
                clearTimeout(allRoadsTimeout);
                allRoadsLayer?.remove();
                allRoadsLayer = layer.setOpacity(1);
                pendingRoadsLayer = null;
                allRoadsRequest = null;
                allRoadsStatus.textContent = 'All road centerlines shown in gray; search matches highlighted above them. ' +
                    (showRoadLabels ? 'Primary road, city major road and highway names are labeled where space allows.' :
                        'Zoom in to see primary road, city major road and highway names.');
                allRoadsStatus.dataset.state = 'ready';
            });
            layer.once('error', fail);
            layer.addTo(map);
        } catch (error) {
            fail();
        }
    }

    map.on('moveend resize', queueAllRoads);
    retryAllRoads.addEventListener('click', queueAllRoads);
    queueAllRoads();

    function fitCounty() {
        if (countyBounds) map.fitBounds(countyBounds, { padding: [16, 16], animate: false });
    }

    function resetResults() {
        map.closePopup();
        roadLayers.clearLayers();
        list.replaceChildren();
        details.replaceChildren();
        details.hidden = true;
        selected = null;
    }

    function detailContent(group, popup = false) {
        const container = document.createElement('div');
        if (popup) container.className = 'road-popup';
        const heading = document.createElement(popup ? 'h3' : 'h2');
        heading.textContent = group.name;
        container.append(heading);
        const dl = document.createElement('dl');
        dl.className = 'road-detail-list';
        for (const [label, value] of core.groupDetails(group)) {
            const dt = document.createElement('dt');
            const dd = document.createElement('dd');
            dt.textContent = label;
            dd.textContent = value;
            dl.append(dt, dd);
        }
        container.append(dl);
        return container;
    }

    function selectRoad(entry, location) {
        if (selected) {
            selected.layer.setStyle(defaultStyle);
            selected.button.setAttribute('aria-pressed', 'false');
        }
        selected = entry;
        entry.layer.setStyle(selectedStyle).bringToFront();
        entry.button.setAttribute('aria-pressed', 'true');
        details.replaceChildren(detailContent(entry.group));
        details.hidden = false;
        const bounds = entry.layer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16, animate: false });
            L.popup({ maxWidth: 320, autoPan: false }).setLatLng(location || bounds.getCenter())
                .setContent(detailContent(entry.group, true)).openOn(map);
        }
    }

    function displayResults(features) {
        const groups = core.groupRoads(features);
        const fragment = document.createDocumentFragment();
        for (const group of groups) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'road-result';
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-controls', 'road-details');
            const title = document.createElement('strong');
            title.textContent = group.name;
            const location = document.createElement('span');
            location.textContent = 'Left: ' + (group.left || 'Not provided') + ' / Right: ' + (group.right || 'Not provided');
            const jurisdiction = document.createElement('span');
            jurisdiction.textContent = group.jurisdiction || 'Jurisdiction not provided';
            const count = document.createElement('span');
            count.textContent = group.features.length.toLocaleString() + (group.features.length === 1 ? ' segment' : ' segments');
            button.append(title, location, jurisdiction, count);
            const item = document.createElement('li');
            item.append(button);
            fragment.append(item);
            const layer = L.geoJSON({ type: 'FeatureCollection', features: group.features }, {
                pane: 'matching-roads', style: defaultStyle
            });
            const entry = { group, button, layer };
            layer.on('click', event => selectRoad(entry, event.latlng));
            button.addEventListener('click', () => selectRoad(entry));
            roadLayers.addLayer(layer);
        }
        list.append(fragment);
        const bounds = roadLayers.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
        else fitCounty();
        return groups.length;
    }

    function errorMessage(error) {
        if (error instanceof TypeError || error instanceof SyntaxError) {
            return 'The Oakland County GIS service could not be reached or returned an unreadable response. Check your connection and try again.';
        }
        return error.message + ' Try again, or narrow the road name.';
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        controller?.abort();
        controller = null;
        results.setAttribute('aria-busy', 'false');
        resetResults();
        try {
            core.buildWhere(nameInput.value, modeInput.value, excludeInput.value);
        } catch (error) {
            setStatus(error.message, 'error');
            fitCounty();
            return;
        }
        const request = new AbortController();
        controller = request;
        results.setAttribute('aria-busy', 'true');
        setStatus('Searching Oakland County road centerlines...', 'loading');
        try {
            const result = await core.searchRoads(nameInput.value, modeInput.value, excludeInput.value, {
                signal: request.signal,
                onProgress(count) {
                    if (controller === request) setStatus('Loading... ' + count.toLocaleString() + ' centerline segments received.', 'loading');
                }
            });
            if (controller !== request) return;
            const count = displayResults(result.features);
            const summary = count.toLocaleString() + ' road / location matches; ' + result.features.length.toLocaleString() + ' selected centerline segments.';
            if (result.capped) {
                setStatus('Search limit reached: showing the first ' + core.MAX_SEGMENTS.toLocaleString() + ' segments. Results are incomplete; narrow your search. ' + summary, 'warning');
            } else {
                setStatus(result.features.length ? summary : 'No matching roads found. ' + summary);
            }
        } catch (error) {
            if (controller !== request || request.signal.aborted) return;
            resetResults();
            fitCounty();
            setStatus(errorMessage(error), 'error');
        } finally {
            if (controller === request) {
                controller = null;
                results.setAttribute('aria-busy', 'false');
            }
        }
    });

    document.getElementById('clear-button').addEventListener('click', () => {
        controller?.abort();
        controller = null;
        form.reset();
        resetResults();
        results.setAttribute('aria-busy', 'false');
        fitCounty();
        setStatus('Enter a road name to search. 0 road / location matches; 0 selected centerline segments.');
        nameInput.focus();
    });

    async function showBoundaries() {
        retryBoundaries.hidden = true;
        boundaryStatus.textContent = 'Loading community boundaries...';
        boundaryStatus.dataset.state = 'loading';
        try {
            const data = await core.loadBoundaries();
            boundaryLayer.clearLayers().addData(data);
            const bounds = boundaryLayer.getBounds();
            if (!bounds.isValid()) throw new Error('Community boundaries have no usable geometry.');
            countyBounds = bounds;
            // A slow boundary request must not undo a road selection or a search fit.
            if (!roadLayers.getLayers().length && !controller) fitCounty();
            boundaryStatus.textContent = 'Community boundaries loaded. Select a community on the map to see its name and type.';
            boundaryStatus.dataset.state = 'ready';
        } catch (error) {
            boundaryStatus.textContent = 'Community boundaries could not load. ' + errorMessage(error);
            boundaryStatus.dataset.state = 'error';
            retryBoundaries.hidden = false;
        }
    }

    retryBoundaries.addEventListener('click', showBoundaries);
    showBoundaries();

    async function showRevisionDate(source, elementId) {
        const target = document.getElementById(elementId);
        try {
            const timestamp = await core.loadRevisionDate(source);
            target.replaceChildren();
            if (timestamp === null) {
                target.textContent = 'No feature revision date is published in the records.';
                target.dataset.state = 'unavailable';
            } else {
                const time = document.createElement('time');
                time.dateTime = new Date(timestamp).toISOString();
                time.textContent = new Intl.DateTimeFormat('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
                }).format(timestamp) + ' (UTC)';
                target.append('Latest recorded feature revision: ', time);
                target.dataset.state = 'ready';
            }
            const checked = document.createElement('span');
            checked.className = 'road-date-checked';
            checked.textContent = 'Checked: ' + new Intl.DateTimeFormat('en-US', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                hour12: false, timeZone: 'UTC', timeZoneName: 'short'
            }).format(new Date());
            target.append(checked);
        } catch (error) {
            target.textContent = 'Revision date could not be checked. Reload the page to retry. Searches remain available.';
            target.dataset.state = 'error';
        }
    }

    showRevisionDate('roads', 'roads-revision-date');
    showRevisionDate('boundaries', 'boundaries-revision-date');
})();
