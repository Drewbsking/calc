"""Render real MDOT drawings and exercise the in-page preview.

Run: py -3.13 tests/mdot_ttc_preview_browser.py
Requires Playwright Chromium and pypdf. Artifacts stay in system temp.
"""
import asyncio
from functools import partial
from http.server import ThreadingHTTPServer
import re
import threading

from playwright.async_api import async_playwright, expect
from pypdf import PdfReader

from mdot_ttc_browser import Handler, ROOT, TOOL, RECORDS, OUTPUT, ALWAYS_IDS, report_ids


async def check(origin):
    OUTPUT.mkdir(exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        context = await browser.new_context(viewport={'width': 1440, 'height': 1050})
        page = await context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        panel = page.locator('#drawing-preview')
        canvas = page.locator('#drawing-preview-stage canvas')

        async def ready():
            await expect(canvas).to_be_visible(timeout=15000)
            await expect(page.locator('#drawing-preview-stage')).to_have_attribute('aria-busy', 'false')
            await expect(page.locator('#drawing-preview-status')).to_have_text('')

        async def search(identifier):
            await page.locator('#search').fill(identifier)
            return page.locator(f'#results > article[data-record="{identifier}"] > button[data-preview]')

        for prefix in ['/calc', '']:
            await page.goto(origin + prefix + '/calculators/mdot-ttc/')
            await expect(page.locator('#available-count')).to_have_text('80')
            assert not any('/pdfjs/' in url or '/pdfs/' in url for url in requests)
            trigger = await search('123-NFW-1LC-(R)')
            await trigger.hover()
            await page.wait_for_timeout(500)
            await expect(panel).to_be_hidden()
            await expect(trigger).to_have_attribute('aria-expanded', 'false')
            assert not any('/pdfjs/' in url or '/pdfs/' in url for url in requests)
            await trigger.focus()
            await page.keyboard.press('Enter')
            await ready()
            await expect(trigger).to_have_attribute('aria-expanded', 'true')
            await page.mouse.move(1, 1)
            await expect(panel).to_be_visible()
            await expect(page.locator('#drawing-preview-close')).to_be_focused()
            assert len(context.pages) == 1
            await page.screenshot(path=str(OUTPUT / 'drawing-preview-desktop.png'))
            before = await canvas.evaluate('el => el.getBoundingClientRect().width')
            await page.locator('#drawing-preview-zoom').select_option('2')
            await ready()
            assert abs(await canvas.evaluate('el => el.getBoundingClientRect().width') - 2 * before) < 2
            await page.keyboard.press('Escape')
            await expect(panel).to_be_hidden()
            await expect(trigger).to_be_focused()
            await page.get_by_role('button', name='Add 123-NFW-1LC-(R)', exact=True).click()
            await page.locator('#selected-list [data-preview="123-NFW-1LC-(R)"]').click()
            await ready()
            assert await report_ids(page) == ALWAYS_IDS + ['123-NFW-1LC-(R)']
            await page.locator('#drawing-preview-close').click()
            await page.locator('#automatic-details > summary').click()
            await page.locator('#automatic-list [data-preview="101-GEN-SPACING-CHARTS"]').click()
            await ready()
            await expect(page.locator('#drawing-preview-page')).to_have_text('Page 1 of 3')
            await page.locator('#drawing-preview-next').click()
            await ready()
            await expect(canvas).to_have_attribute('aria-label', re.compile(r'page 2 of 3$'))
            await page.locator('#drawing-preview-next').click()
            await ready()
            await expect(page.locator('#drawing-preview-next')).to_be_disabled()
            await page.locator('#drawing-preview-previous').click()
            await ready()
            await expect(page.locator('#drawing-preview-page')).to_have_text('Page 2 of 3')
            await page.keyboard.press('Escape')
            await page.locator('#new-project').click()
            await page.locator('#reset-filters').click()
            trigger = await search('110-TR-NFW-2L')
            related = page.locator('#results .ttc-related').first
            await related.locator('summary').click()
            alternative = related.locator('[data-preview]').first
            identifier = await alternative.get_attribute('data-preview')
            await alternative.click()
            await ready()
            await expect(page.locator('#drawing-preview-title')).to_have_text(identifier)
            await page.keyboard.press('Escape')
            requests.clear()
            print('PASS: no hover preview/loading, keyboard activation, zoom, all page controls, selected/Always/related previews at ' + (prefix or '/'), flush=True)

        await page.locator('#reset-filters').click()
        trigger = await search('123-NFW-1LC-(R)')
        broken_url = '**/' + RECORDS['123-NFW-1LC-(R)']['pdf']['path']
        for payload in [None, b'%PDF-1.7\ncorrupted document']:
            async def fail(route):
                await route.fulfill(status=404 if payload is None else 200,
                                    content_type='application/pdf', body=payload or b'missing')
            await page.route(broken_url, fail)
            await trigger.click()
            await expect(page.locator('#drawing-preview-retry')).to_be_visible(timeout=15000)
            await expect(page.locator('#drawing-preview-status')).to_contain_text('123-NFW-1LC-(R)')
            await expect(canvas).to_have_count(0)
            await page.unroute(broken_url, fail)
            await page.locator('#drawing-preview-retry').click()
            await ready()
            await page.keyboard.press('Escape')
        # A slow, abandoned request must not overwrite the newly requested drawing.
        async def slow(route):
            await asyncio.sleep(0.5)
            await route.continue_()
        await page.route(broken_url, slow)
        await trigger.click()
        await page.keyboard.press('Escape')
        newer = await search('124-NFW-2(R+L)LC-SHIFT')
        await newer.click()
        await ready()
        await expect(page.locator('#drawing-preview-title')).to_have_text('124-NFW-2(R+L)LC-SHIFT')
        await page.keyboard.press('Escape')
        await page.unroute(broken_url, slow)
        print('PASS: missing/corrupt PDFs, retry, and abandoned preview requests', flush=True)

        await page.locator('#reset-filters').click()
        rendered = 0
        for identifier, record in RECORDS.items():
            if identifier in ALWAYS_IDS:
                await page.locator('#automatic-details').evaluate('el => el.open = true')
                trigger = page.locator(f'#automatic-list button[data-preview="{identifier}"]')
            else:
                trigger = page.locator(f'#results > article[data-record="{identifier}"] > button[data-preview]')
            await trigger.evaluate('el => el.click()')
            source = PdfReader(TOOL / record['pdf']['path'])
            for number, pdf_page in enumerate(source.pages, 1):
                await ready()
                width, height = await canvas.evaluate('el => [el.width, el.height]')
                expected = float(pdf_page.cropbox.width) / float(pdf_page.cropbox.height)
                if pdf_page.rotation % 180:
                    expected = 1 / expected
                assert abs(width / height - expected) < 0.01, (identifier, number)
                # A successful render must contain actual drawing content, not a blank canvas.
                ink = await canvas.evaluate('''el => {
                    const pixels = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
                    let count = 0;
                    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 180 && pixels[i+1] < 180 && pixels[i+2] < 180) count++;
                    return count;
                }''')
                assert ink > 100, (identifier, number, ink)
                rendered += 1
                if identifier in ['101-GEN-SPACING-CHARTS', '155-CLT(7)-4(L)LC-(IN)', '5000-S-SHL-OUT']:
                    await canvas.screenshot(path=str(OUTPUT / f'drawing-{record["number"]}-page-{number}.png'))
                if number < len(source.pages):
                    await page.locator('#drawing-preview-next').click()
            await page.locator('#drawing-preview-close').click()
            if rendered % 25 == 0:
                print(f'Rendered {rendered} source pages', flush=True)
        assert rendered == 150
        print('PASS: all 150 pages from 136 PDFs render with correct proportions and visible content', flush=True)

        touch = await browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        mobile = await touch.new_page()
        await mobile.goto(origin + '/calc/calculators/mdot-ttc/')
        await mobile.locator('#search').fill('123-NFW-1LC-(R)')
        await mobile.locator('#results [data-preview="123-NFW-1LC-(R)"]').tap()
        await expect(mobile.locator('#drawing-preview-stage canvas')).to_be_visible(timeout=15000)
        for width in [390, 320]:
            await mobile.set_viewport_size({'width': width, 'height': 844})
            await mobile.wait_for_function('''() => {
                const stage = document.getElementById('drawing-preview-stage'), canvas = stage.querySelector('canvas');
                return canvas && stage.getAttribute('aria-busy') === 'false' && canvas.getBoundingClientRect().width <= stage.clientWidth - 24;
            }''')
            await expect(mobile.locator('#drawing-preview-stage')).to_have_attribute('aria-busy', 'false')
            box = await mobile.locator('#drawing-preview').bounding_box()
            assert box['x'] >= 0 and box['x'] + box['width'] <= width
            assert box['y'] >= 0 and box['y'] + box['height'] <= 844
            assert await mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        await mobile.screenshot(path=str(OUTPUT / 'drawing-preview-mobile.png'))
        await mobile.locator('#drawing-preview-close').tap()
        await expect(mobile.locator('#drawing-preview')).to_be_hidden()
        assert len(touch.pages) == 1
        assert not errors, errors
        print('PASS: touch preview, narrow mobile bounds, close, no new windows or browser errors', flush=True)
        await browser.close()


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check(f'http://127.0.0.1:{server.server_port}'))
    finally:
        server.shutdown()
