"""Curve calculator integration/visual checks: py -3.13 tests/curve_browser.py."""
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import urllib.request

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(tempfile.gettempdir()) / 'curve-calculator-check'


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


async def check(origin):
    ARTIFACTS.mkdir(exist_ok=True)
    # Pin to the same Leaflet version as the page; cache the upstream assets for repeat runs.
    for ext in ['js', 'css']:
        target = ARTIFACTS / f'leaflet.{ext}'
        if not target.exists():
            urllib.request.urlretrieve(f'https://unpkg.com/leaflet@1.9.4/dist/leaflet.{ext}', target)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        context = await browser.new_context(viewport={'width': 1440, 'height': 1000})
        async def route(request):
            url = request.request.url
            if '/leaflet@1.9.4/dist/leaflet.' in url:
                ext = url.rsplit('.', 1)[1]
                await request.fulfill(path=str(ARTIFACTS / f'leaflet.{ext}'), content_type='text/javascript' if ext == 'js' else 'text/css')
            elif url.endswith('/calculators/curve/app.js'):
                source = (ROOT / 'calculators/curve/app.js').read_text(encoding='utf-8')
                # Test-only hook captures the real map, leaving production code unchanged.
                await request.fulfill(body='L.Map.addInitHook(function(){ window.testCurveMap = this; });\n' + source, content_type='text/javascript')
            elif url.startswith(origin):
                await request.continue_()
            else:
                await request.abort()
        await context.route('**/*', route)
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto(origin + '/calculators/curve/')
        assert await page.locator('.step-number').all_text_contents() == ['1', '2', '3', '4']
        await expect(page.locator('.layout-options')).not_to_have_attribute('open', '')
        for field in ['modeSel', 'shoulderWidthInput', 'delineatorOffsetInput', 'roadWidthInput']:
            await expect(page.locator('#' + field)).not_to_be_visible()
        await expect(page.locator('#mapLegend')).to_be_visible()
        await page.locator('.legend-geometry > summary').click()
        await expect(page.get_by_text('Fitted circle and center', exact=True)).to_be_visible()
        await page.locator('.legend-geometry > summary').click()
        await page.locator('#mapLegend > summary').click()
        await expect(page.locator('.map-legend-body')).not_to_be_visible()
        await page.locator('#mapLegend > summary').focus()
        await page.keyboard.press('Enter')
        await expect(page.locator('.map-legend-body')).to_be_visible()
        assert await page.locator('.num-marker').count() == 0
        await expect(page.locator('#methodName')).to_have_text('MMUTCD (2025)')
        await expect(page.locator('#roadHeightInput')).not_to_be_visible()
        await expect(page.locator('#roadHeightInput')).to_be_disabled()
        await expect(page.locator('#mdotDelineatorLocationSel')).not_to_be_visible()
        await expect(page.locator('#chevronSizingMessage')).to_contain_text('Select a road type')
        await page.select_option('#chevronRoadTypeSel', 'rcoc_primary')
        await page.select_option('#aadtSel', '4000_plus')
        await page.select_option('#postedSel', '55')
        await page.select_option('#advisorySel', '30')
        await expect(page.locator('#rcocChevronSize')).to_contain_text('24 × 30 in')
        await expect(page.locator('#mdotChevronSize')).to_contain_text('18 × 24 in')
        for angle in [200, 245, 290]:
            await page.evaluate('''angle => {
                const latitude=42.6389, longitude=-83.2910, earth=6378137, radius=304.8;
                const theta=angle*Math.PI/180;
                testCurveMap.fire('click',{latlng:L.latLng(latitude+radius*Math.sin(theta)/earth*180/Math.PI,
                    longitude+radius*Math.cos(theta)/(earth*Math.cos(latitude*Math.PI/180))*180/Math.PI)});
            }''', angle)
            await page.wait_for_timeout(220)  # The calculator intentionally debounces map clicks.
        await expect(page.locator('#results')).to_contain_text('200 ft before PC')
        await expect(page.locator('.result-summary')).to_contain_text('Chevrons and advance warning')
        await expect(page.locator('.result-summary')).to_contain_text('18 × 24 in')
        await expect(page.locator('.result-summary')).to_contain_text('24 × 30 in')
        await expect(page.locator('#calculationDetails .callout')).not_to_be_visible()
        await expect(page.locator('.layout-comparison')).to_contain_text('Both layouts are displayed')
        assert '?' not in await page.locator('#results').inner_text()
        assert '?' not in await page.locator('#spacing').inner_text()
        await page.locator('#results').scroll_into_view_if_needed()
        await page.screenshot(path=str(ARTIFACTS / 'outputs.png'))
        assert await page.locator('.leaflet-chevrons-pane path').count() > 0
        assert await page.locator('.leaflet-delineators-pane path').count() > 0
        await page.locator('#methodSlider').fill('0')
        await expect(page.locator('#methodName')).to_have_text('MDOT signing guide (2023)')
        for field in ['aadtSel', 'surfaceSel', 'speedBasisSel', 'pavedTreatmentSel', 'urbanLowVolume', 'omitEligible', 'includeOptional']:
            await expect(page.locator('#' + field)).not_to_be_visible()
            await expect(page.locator('#' + field)).to_be_disabled()
        await expect(page.locator('#roadHeightInput')).not_to_be_visible()
        await page.locator('.layout-options > summary').click()
        await expect(page.locator('#roadHeightInput')).to_be_visible()
        await expect(page.locator('#roadHeightInput')).to_be_enabled()
        await page.locator('.layout-options > summary').click()
        await expect(page.locator('#roadwayTypeLabel')).to_have_text('Roadway class (sizing cross-check)')
        await page.locator('.section-inputs').scroll_into_view_if_needed()
        await page.screenshot(path=str(ARTIFACTS / 'mdot-inputs.png'))
        await expect(page.locator('#results')).to_contain_text('275 ft before PC')
        await expect(page.locator('#results')).to_contain_text('184.9 ft')
        await expect(page.locator('#results')).to_contain_text('Known-radius chart: 950-ft minimum-radius row gives S = 90 ft')
        await expect(page.locator('#mdotDelineatorLocationSel')).to_be_visible()
        await page.select_option('#mdotDelineatorLocationSel', 'interchange')
        await expect(page.locator('#results')).to_contain_text('200-ft maximum gaps')
        await page.select_option('#mdotDelineatorLocationSel', 'ramp')
        await expect(page.locator('#results')).to_contain_text('100.0, 100.0, 100.0 ft')
        await page.locator('#calculationDetails > summary').click()
        await expect(page.locator('#results a[href="references/mdot-r-127-i.pdf#page=5"]')).to_be_visible()
        await page.select_option('#mdotDelineatorLocationSel', 'normal')
        await page.locator('#results a[href="references/mdot-r-127-i.pdf#page=5"]').scroll_into_view_if_needed()
        await page.screenshot(path=str(ARTIFACTS / 'mdot-delineators.png'))
        assert await page.locator('.leaflet-chevrons-pane path').count() > 0
        assert await page.locator('.leaflet-delineators-pane path').count() > 0
        await expect(page.locator('#mdotChevronSize')).to_contain_text('24 × 30 in')
        await page.locator('#methodSlider').fill('1')
        for field in ['aadtSel', 'surfaceSel', 'speedBasisSel']:
            await expect(page.locator('#' + field)).to_be_visible()
            await expect(page.locator('#' + field)).to_be_enabled()
        await expect(page.locator('#aadtSel')).to_have_value('4000_plus')
        await expect(page.locator('#results')).not_to_contain_text('MDOT design-equation estimate')
        await expect(page.locator('#mdotDelineatorLocationSel')).not_to_be_visible()
        await expect(page.locator('#results')).to_contain_text('MMUTCD Table 3G-1')
        assert await page.locator('#results a[href*="mdot-r-127-i"]').count() == 0
        await page.select_option('#advisorySel', '40')  # MMUTCD 15 mph recommends delineators; both layouts remain visible.
        await expect(page.locator('#results')).to_contain_text('Delineators and advance warning')
        assert await page.locator('.leaflet-chevrons-pane path').count() > 0
        dots = await page.locator('.leaflet-delineators-pane path').count()
        assert dots >= 7
        await expect(page.locator('#results')).to_contain_text('+ 6 on tangents per side')
        await page.locator('.layout-options').evaluate('(el) => el.open = true')
        await page.select_option('#delineatorSidesSel', 'both')
        assert await page.locator('.leaflet-delineators-pane path').count() == 2 * dots
        await page.select_option('#roadwayTypeSel', 'all_other')
        assert await page.locator('.leaflet-delineators-pane path').count() == 2 * dots
        assert await page.locator('.leaflet-chevrons-pane path').count() > 0
        assert await page.locator('.leaflet-advance-pane path').count() == 0
        await page.check('#includeOptional')
        assert await page.locator('.leaflet-delineators-pane path').count() == 2 * dots
        await page.select_option('#postedSel', '25')
        await page.select_option('#advisorySel', '20')
        await page.select_option('#surfaceSel', 'gravel')
        await expect(page.locator('#results')).to_contain_text('Note 5')
        assert await page.locator('.leaflet-advance-pane path').count() == 0
        await page.fill('#advanceOverride', '75')
        await expect(page.locator('#results')).to_contain_text('75 ft before PC')
        assert await page.locator('.leaflet-advance-pane path').count() == 4
        # A class conflict withholds sizing but keeps both comparison layouts visible.
        await page.select_option('#chevronRoadTypeSel', 'freeway_ramp')
        await expect(page.locator('#results')).to_contain_text('Size recommendations are withheld')
        assert await page.locator('.leaflet-chevrons-pane path').count() > 0
        assert await page.locator('.leaflet-delineators-pane path').count() == 2 * dots
        assert await page.locator('.leaflet-advance-pane path').count() == 0
        await page.select_option('#chevronRoadTypeSel', '')
        await page.select_option('#advisorySel', '25')
        await expect(page.locator('#results')).to_contain_text('Below the tabulated 5-mph differential')
        assert await page.locator('.leaflet-chevrons-pane path').count() > 0
        assert await page.locator('.leaflet-delineators-pane path').count() == 2 * dots
        await page.select_option('#chevronRoadTypeSel', 'freeway_ramp')
        await page.select_option('#roadwayTypeSel', 'freeway_expressway')
        await page.locator('#methodSlider').fill('0')
        await page.select_option('#advisorySel', '45')
        await page.select_option('#postedSel', '65')
        await expect(page.locator('#mdotDelineatorLocationSel')).to_have_value('ramp')
        await expect(page.locator('#mdotDelineatorLocationSel')).to_be_disabled()
        await expect(page.locator('#results')).to_contain_text('100-ft maximum gaps')
        await expect(page.locator('#mdotChevronSize')).to_contain_text('36 × 48 in')
        await page.select_option('#advisorySel', '40')
        await expect(page.locator('#mdotChevronSize')).to_contain_text('24 × 30 in')
        await page.locator('#methodSlider').fill('1')
        await page.select_option('#chevronRoadTypeSel', 'expressway_mainline')
        await expect(page.locator('#mdotChevronSize')).to_contain_text('30 × 36 in')
        # Switching methods must never reinterpret a percentile measurement as a speed limit.
        await page.select_option('#speedBasisSel', '85th')
        await expect(page.locator('#postedSel')).to_have_value('')
        await page.select_option('#postedSel', '75')
        await page.locator('#methodSlider').fill('0')
        await expect(page.locator('#postedSel')).to_have_value('65')
        await expect(page.locator('#mdotDelineatorLocationSel')).to_have_value('normal')
        await expect(page.locator('#mdotDelineatorLocationSel')).to_be_enabled()
        await expect(page.locator('#results')).not_to_contain_text('Select posted or statutory speed')
        await page.locator('#methodSlider').fill('1')
        await expect(page.locator('#speedBasisSel')).to_have_value('85th')
        await expect(page.locator('#postedSel')).to_have_value('75')
        await page.select_option('#speedBasisSel', 'posted')
        await expect(page.locator('#postedSel')).to_have_value('65')
        await page.locator('.section-inputs').scroll_into_view_if_needed()
        await page.screenshot(path=str(ARTIFACTS / 'mmutcd-inputs.png'))
        # Every dynamically generated reference link and preview resolves locally.
        references = await page.locator('#referenceSections a').evaluate_all('(links) => links.map(a => a.href.split("#")[0])')
        for href in set(references):
            response = await page.request.get(href)
            assert response.ok, href
        mdot_detail = page.locator('#referenceSections > details').nth(2)
        await mdot_detail.evaluate('(el) => el.open = true')
        await mdot_detail.locator('details').nth(1).evaluate('(el) => el.open = true')
        await mdot_detail.locator('img').nth(1).scroll_into_view_if_needed()
        await page.wait_for_function('(selector) => document.querySelector(selector).naturalWidth > 0',
                                     arg='img[src="references/mdot-r-127-i-5.png"]')
        await mdot_detail.locator('img').nth(1).scroll_into_view_if_needed()
        await page.screenshot(path=str(ARTIFACTS / 'mdot-detail-reference.png'))
        await mdot_detail.evaluate('(el) => el.open = false')
        await page.locator('#referenceSections > details').first.evaluate('(el) => el.open = true')
        await page.locator('#referenceSections > details').first.locator('details').nth(1).evaluate('(el) => el.open = true')
        await page.locator('#referenceSections img').first.scroll_into_view_if_needed()
        await expect(page.locator('#referenceSections img').first).to_be_visible()
        await page.screenshot(path=str(ARTIFACTS / 'references.png'))
        await page.locator('#panel').evaluate('(el) => el.scrollTop = 0')
        await page.screenshot(path=str(ARTIFACTS / 'desktop.png'))
        await page.set_viewport_size({'width': 390, 'height': 844})
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(ARTIFACTS / 'mobile-map.png'))
        legend_box = await page.locator('#mapLegend').bounding_box()
        assert legend_box['x'] >= 0 and legend_box['x'] + legend_box['width'] <= 390
        assert await page.locator('#mapLegend').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
        await page.locator('#menuBtn').click()
        await expect(page.locator('#panel')).to_have_class('panel open')
        await expect(page.locator('#menuBtn')).to_have_attribute('aria-label', 'Close controls')
        await page.locator('#panel').evaluate('(el) => el.scrollTop = 0')
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(ARTIFACTS / 'mobile.png'))
        assert await page.locator('#panel').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
        assert abs((await page.locator('#map').bounding_box())['width'] - 390) < 2
        slider_box = await page.locator('#methodSlider').bounding_box()
        button_box = await page.locator('#menuBtn').bounding_box()
        assert button_box['y'] > slider_box['y'] + slider_box['height']
        await page.locator('#methodSlider').focus()
        await page.keyboard.press('ArrowLeft')
        await expect(page.locator('#methodName')).to_have_text('MDOT signing guide (2023)')
        await page.locator('#placePointsBtn').click()
        await expect(page.locator('#panel')).not_to_have_class('panel open')
        await page.locator('#menuBtn').click()
        await page.locator('#calculationDetails').evaluate('(el) => el.open = false')
        await page.locator('.result-summary').scroll_into_view_if_needed()
        await page.screenshot(path=str(ARTIFACTS / 'mobile-summary.png'))
        assert await page.locator('#panel').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
        await page.locator('#resetBtn').click()
        assert await page.locator('.leaflet-chevrons-pane path').count() == 0
        assert await page.locator('.leaflet-delineators-pane path').count() == 0
        assert not errors, errors
        print('PASS: both methods, always-visible chevrons and delineators, transitions, optional warning, overrides, sizing, citations, keyboard slider, reset, desktop/mobile layout')
        print(f'Screenshots: {ARTIFACTS}')
        await browser.close()


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        asyncio.run(check(f'http://127.0.0.1:{server.server_port}'))
    finally:
        server.shutdown()
