"""Optional browser QA against a local HTTP server; requires an existing Playwright install.

    python -m http.server 8765 --bind 127.0.0.1
    python tests/road_name_search_browser.py

Uses live GIS responses for normal searches and intercepted responses for failure/race tests.
No expected live record counts are hard-coded. Screenshots go to tmp/road-name-search-qa/.
"""
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8765"
ROAD_QUERY = "**/EnterpriseTransportationDataMapService/MapServer/0/query?*"
BOUNDARY_QUERY = "**/EnterpriseAdminDataMapService/MapServer/2/query?*"
OUTPUT = Path(__file__).resolve().parents[1] / "tmp" / "road-name-search-qa"


async def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checks = []

    def passed(message):
        checks.append(message)
        print("PASS:", message, flush=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1050})
        page = await context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        # Capture the real Leaflet instance for assertions, without exposing it in production.
        async def instrument(route):
            original = await route.fetch()
            await route.fulfill(response=original, body=
                "L.Map.addInitHook(function () { window.__qaMap = this; });\n" + await original.text())

        await page.route("**/scripts/roadNameSearch.js", instrument)
        await page.goto(BASE + "/road-name-search.html")
        await page.wait_for_function("document.querySelector('#boundary-status').dataset.state === 'ready'")
        assert await page.locator("#match-mode").input_value() == "begins"
        county_zoom = await page.evaluate("__qaMap.getZoom()")
        assert await page.evaluate("Object.values(__qaMap._layers).some(l => l.feature?.geometry?.type.includes('Polygon'))")
        assert not await page.evaluate("Object.values(__qaMap._layers).some(l => l instanceof L.TileLayer)")
        await page.screenshot(path=str(OUTPUT / "county.png"), full_page=True)
        passed("Public boundaries load without login; county fit and no basemap layers")

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
        passed("Excluded island and Exact isla both return no current matches and remove prior lines")

        summary = await search("Woodward")
        assert await page.locator(".road-result").count() > 0, summary
        assert await line_count() > 0
        assert all("woodward" in name.lower() for name in await page.locator(".road-result strong").all_text_contents())
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
