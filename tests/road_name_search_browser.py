"""Optional browser QA against a local HTTP server; requires an existing Playwright install.

    python -m http.server 8765 --bind 127.0.0.1
    python tests/road_name_search_browser.py

Uses live GIS responses for normal searches and intercepted responses for failure/race tests.
No expected live record counts are hard-coded. Screenshots go to tmp/road-name-search-qa/.
"""
import asyncio
import base64
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8765"
ROAD_QUERY = "**/EnterpriseTransportationDataMapService/MapServer/0/query?*"
BOUNDARY_QUERY = "**/EnterpriseAdminDataMapService/MapServer/2/query?*"
ROAD_EXPORT = "**/EnterpriseTransportationDataMapService/MapServer/export?*"
OUTPUT = Path(__file__).resolve().parents[1] / "tmp" / "road-name-search-qa"


async def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checks = []

    def passed(message):
        checks.append(message)
        print("PASS:", message, flush=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1050}, timezone_id="America/Los_Angeles")
        page = await context.new_page()
        errors = []
        road_requests = []
        export_requests = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: road_requests.append(request.url)
                if "/EnterpriseTransportationDataMapService/MapServer/0/query?" in request.url else None)
        page.on("request", lambda request: export_requests.append(request.url)
                if "/EnterpriseTransportationDataMapService/MapServer/export?" in request.url else None)

        async def wait_all_roads():
            await page.wait_for_function("document.querySelector('#all-roads-status').dataset.state === 'ready'", timeout=45000)
            assert await page.evaluate("""() => {
                const images = Object.values(__qaMap._layers).filter(l => l instanceof L.ImageOverlay && l.options.pane === 'all-roads');
                return images.length === 1 && images[0].options.opacity === 1 && images[0].getElement().naturalWidth > 0;
            }""")

        # Capture the real Leaflet instance for assertions, without exposing it in production.
        async def instrument(route):
            original = await route.fetch()
            await route.fulfill(response=original, body=
                "L.Map.addInitHook(function () { window.__qaMap = this; });\n" + await original.text())

        await page.route("**/scripts/roadNameSearch.js", instrument)
        await page.goto(BASE + "/road-name-search.html")
        await page.wait_for_function("['roads', 'boundaries'].every(source => document.querySelector('#' + source + '-revision-date').dataset.state === 'ready')")
        assert await page.locator(".road-source-dates time").count() == 2
        assert await page.locator(".road-date-checked").count() == 2
        assert "dataset-wide last-update date" in await page.locator(".road-source-note").inner_text()
        passed("Both live revision dates load with UTC labels and a separate check time")
        await page.wait_for_function("document.querySelector('#boundary-status').dataset.state === 'ready'")
        assert await page.locator("#match-mode").input_value() == "begins"
        county_zoom = await page.evaluate("__qaMap.getZoom()")
        assert await page.evaluate("Object.values(__qaMap._layers).some(l => l.feature?.geometry?.type.includes('Polygon'))")
        assert not await page.evaluate("Object.values(__qaMap._layers).some(l => l instanceof L.TileLayer)")
        await wait_all_roads()
        export_params = parse_qs(urlparse(export_requests[-1]).query)
        assert export_params["layers"] == ["show:0"]
        assert export_params["transparent"] == ["true"]
        dynamic_layers = json.loads(export_params["dynamicLayers"][0])
        assert len(dynamic_layers) == 1 and dynamic_layers[0]["source"] == {"type": "mapLayer", "mapLayerId": 0}
        assert dynamic_layers[0]["drawingInfo"]["showLabels"] is False
        assert await page.evaluate("Number(__qaMap.getPane('all-roads').style.zIndex) < Number(__qaMap.getPane('community-boundaries').style.zIndex) && Number(__qaMap.getPane('community-boundaries').style.zIndex) < Number(__qaMap.getPane('matching-roads').style.zIndex)")
        await page.screenshot(path=str(OUTPUT / "county.png"), full_page=True)
        passed("Public boundaries load without login; county fit and no basemap layers")
        passed("All road centerlines load as a transparent gray layer beneath communities and matches")

        # Check the actual exported pixels as well as the labeling request.
        # Primary labels are dark; the all-roads renderer remains light gray.
        async def label_pixel_count():
            source = await page.locator(".leaflet-all-roads-pane img").get_attribute("src")
            response = await context.request.get(source)
            assert response.ok
            encoded = base64.b64encode(await response.body()).decode("ascii")
            return await page.evaluate("""async encoded => {
                const image = new Image();
                image.src = 'data:image/png;base64,' + encoded;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width; canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
                let count = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] === 51 && pixels[i + 1] === 65 && pixels[i + 2] === 85 && pixels[i + 3] > 200) count++;
                }
                return count;
            }""", encoded)

        assert await label_pixel_count() == 0
        for zoom in [12, 14]:
            await page.evaluate("zoom => __qaMap.setView([42.65, -83.37], zoom, {animate: false})", zoom)
            await wait_all_roads()
            params = parse_qs(urlparse(export_requests[-1]).query)
            layer = json.loads(params["dynamicLayers"][0])[0]
            assert "definitionExpression" not in layer
            assert "layerDefs" not in params
            drawing = layer["drawingInfo"]
            assert drawing["showLabels"] is True
            assert drawing["renderer"]["type"] == "simple"
            label = drawing["labelingInfo"][0]
            assert label["where"] == "Act51RoadType IN ('County Primary', 'City Major', 'Highway State', 'Highway Interstate', 'Highway US')"
            assert label["labelExpression"] == "[CartographicName]"
            assert label["labelPlacement"] == "esriServerLinePlacementAboveAlong"
            assert await label_pixel_count() > 10
            await page.locator("#road-map").screenshot(path=str(OUTPUT / f"primary-labels-zoom{zoom}.png"))
        passed("Primary, city major and highway labels render at zooms 12 and 14 without filtering out other centerlines")

        await page.evaluate("__qaMap.setZoom(11, {animate: false})")
        await wait_all_roads()
        assert json.loads(parse_qs(urlparse(export_requests[-1]).query)["dynamicLayers"][0])[0]["drawingInfo"]["showLabels"] is False
        assert await label_pixel_count() == 0
        assert "Zoom in" in await page.locator("#all-roads-status").inner_text()
        await page.locator("#clear-button").click()
        await wait_all_roads()
        passed("Zooming out hides road labels and Clear restores the county view with all centerlines")

        async def search(name, mode="begins", exclusion=""):
            await page.locator("#road-name").fill(name)
            await page.locator("#match-mode").select_option(mode)
            await page.locator("#exclude-name").fill(exclusion)
            await page.locator("#search-button").click()
            await page.wait_for_function(
                "['ready', 'warning', 'error'].includes(document.querySelector('#search-status').dataset.state)",
                timeout=60000)
            return await page.locator("#search-status").inner_text()

        async def line_count():
            return await page.evaluate("Object.values(__qaMap._layers).filter(l => l.feature?.geometry?.type.includes('LineString')).length")

        summary = await search("isla")
        assert await page.locator(".road-result").count() > 0, summary
        assert all("island" in name.lower() for name in await page.locator(".road-result strong").all_text_contents())
        assert await line_count() > 0
        assert await page.locator(".road-result").count() < await line_count()
        passed("Begins with isla returns Island roads, grouped without losing segments: " + summary)

        for mode, exclusion in [("begins", "island"), ("exact", "")]:
            summary = await search("isla", mode, exclusion)
            assert "No matching roads" in summary, summary
            assert await page.locator(".road-result").count() == 0
            assert await line_count() == 0
            await wait_all_roads()
        passed("Excluded island and Exact isla both return no current matches and remove prior lines")
        passed("Nonmatching roads stay visible when a search has no results")

        summary = await search("Woodward")
        assert await page.locator(".road-result").count() > 0, summary
        assert await line_count() > 0
        assert all("woodward" in name.lower() for name in await page.locator(".road-result strong").all_text_contents())
        await wait_all_roads()
        await page.screenshot(path=str(OUTPUT / "desktop.png"), full_page=True)
        match_view = await page.evaluate("__qaMap.getBounds().toBBoxString()")
        await page.locator(".road-result").first.focus()
        await page.keyboard.press("Enter")
        assert await page.locator(".road-result").first.get_attribute("aria-pressed") == "true"
        assert await page.evaluate("__qaMap.getBounds().toBBoxString()") != match_view
        detail_text = await page.locator("#road-details").inner_text()
        for field in ["Woodward", "Left community", "Right community", "Jurisdiction", "Road code(s)",
                      "Left address ranges", "Right address ranges", "Speed limit(s)", "Centerline segments"]:
            assert field in detail_text
        await page.locator(".leaflet-popup").last.wait_for(state="visible")
        await wait_all_roads()
        await page.screenshot(path=str(OUTPUT / "all-roads-selection.png"), full_page=True)
        selection_params = parse_qs(urlparse(export_requests[-1]).query)
        assert json.loads(selection_params["dynamicLayers"][0])[0]["drawingInfo"]["showLabels"] is True
        assert await label_pixel_count() > 10
        passed("Normal search draws roads; keyboard result activation emphasizes, zooms and shows details")

        await page.locator(".leaflet-popup-close-button").click()
        point = await page.evaluate("""() => {
            const road = Object.values(__qaMap._layers).find(l => l.feature?.geometry?.type.includes('LineString') && l.options.weight === 7);
            let latlngs = road.getLatLngs();
            while (Array.isArray(latlngs[0])) latlngs = latlngs[0];
            const xy = __qaMap.latLngToContainerPoint(latlngs[Math.floor(latlngs.length / 2)]);
            const rect = __qaMap.getContainer().getBoundingClientRect();
            return {x: rect.x + xy.x, y: rect.y + xy.y};
        }""")
        await page.mouse.click(point["x"], point["y"])
        await page.locator(".leaflet-popup").last.wait_for(state="visible")
        passed("Clicking a real rendered centerline opens its grouped details")

        await page.locator("#clear-button").click()
        assert await line_count() == 0
        assert await page.locator(".road-result").count() == 0
        assert not await page.locator("#road-details").is_visible()
        assert await page.locator("#road-name").input_value() == ""
        assert await page.locator("#match-mode").input_value() == "begins"
        assert await page.evaluate("__qaMap.getZoom()") == county_zoom
        assert await page.evaluate("""() => {
            const communities = Object.values(__qaMap._layers).filter(l => l.feature?.geometry?.type.includes('Polygon'));
            return __qaMap.getBounds().contains(L.featureGroup(communities).getBounds());
        }""")
        passed("Clear resets controls, results, selection and county-wide view")
        await wait_all_roads()
        original_image = await page.locator(".leaflet-all-roads-pane img").get_attribute("src")
        await page.evaluate("__qaMap.setZoom(__qaMap.getZoom() + 1, {animate: false})")
        await page.evaluate("__qaMap.panBy([80, 40], {animate: false})")
        await wait_all_roads()
        assert await page.locator(".leaflet-all-roads-pane img").get_attribute("src") != original_image
        passed("Clear retains all roads; pan and zoom refresh the road network for the new viewport")

        for name in ["O'Brien", "St. John", "A & B"]:
            summary = await search(name, "exact")
            assert await page.locator("#search-status").get_attribute("data-state") == "ready", summary
        for name in ["x' OR '1'='1", "<img src=x onerror=alert(1)>"]:
            assert "road-name punctuation" in await search(name, "exact")
        assert "two characters" in await search("a")
        assert "wildcard" in await search("%%")
        passed("Apostrophes and punctuation search safely; SQL/HTML-shaped, short and wildcard input is rejected")

        await page.set_viewport_size({"width": 390, "height": 844})
        await search("wood", "contains")
        assert await page.locator(".road-result").count() > 0
        await wait_all_roads()
        await page.screenshot(path=str(OUTPUT / "mobile.png"), full_page=True)
        layout = await page.evaluate("""() => ({
            page: document.documentElement.scrollWidth, viewport: innerWidth,
            resultsBottom: document.querySelector('.road-search-panel').getBoundingClientRect().bottom,
            mapTop: document.querySelector('.road-map-panel').getBoundingClientRect().top,
            mapHeight: document.querySelector('#road-map').clientHeight
        })""")
        assert layout["page"] <= layout["viewport"], layout
        assert layout["resultsBottom"] <= layout["mapTop"]
        assert layout["mapHeight"] >= 400
        passed("Contains search and mobile layout: controls/results above a usable map, no horizontal overflow")
        await page.set_viewport_size({"width": 1440, "height": 1050})

        async def network_failure(route):
            await route.abort("failed")

        await page.route(ROAD_QUERY, network_failure)
        assert "Check your connection" in await search("isla")
        assert await line_count() == 0
        await page.unroute(ROAD_QUERY, network_failure)

        async def arcgis_failure(route):
            await route.fulfill(json={"error": {"code": 400, "message": "GIS query unavailable"}})

        await page.route(ROAD_QUERY, arcgis_failure)
        assert "ArcGIS service error" in await search("isla")
        await page.unroute(ROAD_QUERY, arcgis_failure)
        passed("Network and ArcGIS failures show useful messages and remove stale results")

        await page.route(BOUNDARY_QUERY, network_failure)
        await page.reload()
        await page.wait_for_function("document.querySelector('#boundary-status').dataset.state === 'error'")
        assert await page.locator("#retry-boundaries").is_visible()
        await page.unroute(BOUNDARY_QUERY, network_failure)
        await page.locator("#retry-boundaries").click()
        await page.wait_for_function("document.querySelector('#boundary-status').dataset.state === 'ready'")
        passed("Boundary failure has an independent message and working retry")

        await page.route(ROAD_EXPORT, arcgis_failure)
        await page.evaluate("__qaMap.panBy([40, 0], {animate: false})")
        await page.wait_for_function("document.querySelector('#all-roads-status').dataset.state === 'error'")
        await search("Woodward")
        assert await page.locator(".road-result").count() > 0
        await page.wait_for_function("document.querySelector('#all-roads-status').dataset.state === 'error'")
        await page.unroute(ROAD_EXPORT, arcgis_failure)
        await page.locator("#retry-all-roads").click()
        await wait_all_roads()
        passed("Road-context service errors leave name searches usable and offer a working retry")

        # Hold an older request while starting a new one, then release the stale response.
        held = asyncio.Event()
        release = asyncio.Event()

        async def delayed_old_search(route):
            if "StreetName" in route.request.url and "isla" in route.request.url.lower():
                held.set()
                await release.wait()
                try:
                    await route.fulfill(json={"type": "FeatureCollection", "features": []})
                except Exception:
                    pass  # Chromium may have discarded the aborted request already.
            else:
                await route.continue_()

        await page.route(ROAD_QUERY, delayed_old_search)
        await page.locator("#road-name").fill("isla")
        await page.locator("#search-button").click()
        await asyncio.wait_for(held.wait(), 10)
        assert await page.locator("#search-status").get_attribute("data-state") == "loading"
        await search("Woodward")
        before_release = await page.locator("#search-status").inner_text()
        release.set()
        await page.wait_for_timeout(200)
        assert await page.locator("#search-status").inner_text() == before_release
        assert await page.locator(".road-result").count() > 0
        await page.unroute(ROAD_QUERY, delayed_old_search)
        passed("A newer search cancels an older one; a late response cannot replace current results")

        held.clear()
        release.clear()
        await page.route(ROAD_QUERY, delayed_old_search)
        await page.locator("#road-name").fill("isla")
        await page.locator("#search-button").click()
        await asyncio.wait_for(held.wait(), 10)
        await page.locator("#clear-button").click()
        release.set()
        await page.wait_for_timeout(200)
        assert await page.locator(".road-result").count() == 0
        assert "Enter a road name" in await page.locator("#search-status").inner_text()
        await page.unroute(ROAD_QUERY, delayed_old_search)
        passed("Clear cancels pending work and prevents late results from returning")

        unsafe_name = '<img src=x onerror="window.gisInjected=true">'

        async def hostile_data(route):
            await route.fulfill(json={"type": "FeatureCollection", "features": [{
                "type": "Feature", "properties": {"OBJECTID": 1, "CartographicName": unsafe_name,
                    "CVTTaxNameLeft": "<script>unsafe</script>", "RoadCode": "<b>001</b>"},
                "geometry": {"type": "LineString", "coordinates": [[-83.4, 42.6], [-83.39, 42.61]]}
            }]})

        await page.route(ROAD_QUERY, hostile_data)
        await search("test")
        await page.locator(".road-result").click()
        assert await page.locator(".road-result strong").inner_text() == unsafe_name
        assert await page.locator("#road-details img, #road-details script, .road-popup img, .road-result img").count() == 0
        assert not await page.evaluate("Boolean(window.gisInjected)")
        await page.unroute(ROAD_QUERY, hostile_data)
        passed("GIS text is safely displayed in rows, details and popups without executing markup")
        for url in road_requests:
            params = parse_qs(urlparse(url).query)
            if "outStatistics" in params:
                assert params["where"] == ["RevisionDate IS NOT NULL"]
                assert params["returnGeometry"] == ["false"]
            else:
                assert params["where"][0].startswith("StreetName ")
        passed("Feature downloads still require a road name; date queries return only a statistic")

        async def fixture_dates(route):
            params = parse_qs(urlparse(route.request.url).query)
            if "outStatistics" not in params:
                await route.continue_()
                return
            value = 1735689600000 if "/EnterpriseTransportationDataMapService/" in route.request.url else None
            await route.fulfill(json={"features": [{"attributes": {"LatestRevisionDate": value}}]})

        await page.route(ROAD_QUERY, fixture_dates)
        await page.route(BOUNDARY_QUERY, fixture_dates)
        await page.reload()
        await page.wait_for_function("document.querySelector('#roads-revision-date').dataset.state === 'ready' && document.querySelector('#boundaries-revision-date').dataset.state === 'unavailable'")
        assert await page.locator("#roads-revision-date time").inner_text() == "January 1, 2025 (UTC)"
        assert "No feature revision date" in await page.locator("#boundaries-revision-date").inner_text()
        assert "1970" not in await page.locator("#boundaries-revision-date").inner_text()
        await page.screenshot(path=str(OUTPUT / "date-states.png"), full_page=True)
        await page.unroute(ROAD_QUERY, fixture_dates)
        await page.unroute(BOUNDARY_QUERY, fixture_dates)
        passed("UTC midnight dates do not shift to the previous day; missing dates do not become 1970")

        async def date_failure(route):
            if "outStatistics" in parse_qs(urlparse(route.request.url).query):
                await route.abort("failed")
            else:
                await route.continue_()

        await page.route(ROAD_QUERY, date_failure)
        await page.reload()
        await page.wait_for_function("document.querySelector('#roads-revision-date').dataset.state === 'error' && document.querySelector('#boundaries-revision-date').dataset.state === 'ready'")
        await search("isla")
        assert await page.locator(".road-result").count() > 0
        assert await page.locator("#roads-revision-date time").count() == 0
        assert "could not be checked" in await page.locator("#roads-revision-date").inner_text()
        await page.unroute(ROAD_QUERY, date_failure)
        passed("A date-service failure leaves the other date and road searches available")

        await page.goto(BASE + "/index.html")
        link = page.locator('a[href="road-name-search.html"]')
        assert await link.count() == 1
        await page.get_by_role("button", name="Maps & GIS", exact=True).click()
        assert await link.is_visible()
        await link.click()
        assert await page.locator("#road-search-form").is_visible()
        await page.goto(BASE + "/curve.html")
        assert await page.locator("#map.leaflet-container").is_visible()
        await page.locator("#resetBtn").click()
        assert await page.locator("#header-placeholder .site-header").is_visible()
        passed("Homepage card/category/navigation and existing curve page/map/reset load correctly")
        assert not errors, errors
        passed("No browser JavaScript errors")
        (OUTPUT / "results.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
        await browser.close()
        print(f"Completed {len(checks)} browser checks.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
