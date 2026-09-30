"""Check calculator migration at / and /calc/: py -3.13 tests/calculator_routes_browser.py."""
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import threading

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {}
for file in ROOT.glob('*.html'):
    match = re.search(r"window.location.replace\('(calculators/[^']+/)'", file.read_text(encoding='utf-8'))
    if match:
        ROUTES[file.name] = match[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def translate_path(self, path):
        if path.startswith('/calc/'):
            path = path[len('/calc'):]
        return super().translate_path(path)


async def check(origin):
    assert all((ROOT / target / 'index.html').is_file() for target in ROUTES.values())
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        context = await browser.new_context()
        # These checks exercise local routing; existing calculator tests cover the math.
        # Keep external services out of this test's timing and availability requirements.
        await context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin) else route.abort())
        failures = []
        context.on('response', lambda response: failures.append(response.url) if response.status >= 400 else None)
        gate = asyncio.Semaphore(4)

        async def visit(old, target, prefix):
            async with gate:
                page = await context.new_page()
                base = origin + prefix
                await page.goto(base + old + '?migration=1#migration-check')
                await page.wait_for_url(base + target + '?migration=1#migration-check')
                source = (ROOT / target / 'index.html').read_text(encoding='utf-8')
                if 'shared/layout.js' in source:
                    await expect(page.locator('.site-nav a')).to_have_attribute('href', base + 'index.html')
                    await expect(page.locator('#footer-placeholder')).to_contain_text('Created by Andrew Bates')
                    homepage = (ROOT / 'index.html').read_text(encoding='utf-8')
                    if 'section class="calculator' in source and f'href="{target}"' in homepage:
                        await expect(page.locator('.tool-category-label')).to_contain_text('Category:')
                await page.close()

        for prefix in ['/', '/calc/']:
            await asyncio.gather(*(visit(old, target, prefix) for old, target in ROUTES.items()))
            print(f'PASS: {len(ROUTES)} legacy redirects preserve query/hash; shared navigation works at {prefix}', flush=True)

        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto(origin + '/calc/calculators/rpm/index.html')
        await expect(page.locator('.tool-category-label')).to_contain_text('Category:')
        await page.locator('#sampleControls summary').click()
        await page.locator('#loadExample').click()
        await expect(page.locator('#totalMarkers')).to_have_text('44')
        await expect(page.locator('#totalCost')).to_have_text('$2,904.00')
        await page.locator('.site-nav a').click()
        await expect(page.locator('a[href="calculators/rpm/"]')).to_be_visible()

        await page.goto(origin + '/calc/sightLineElevation.html?eye=1003.5&target=1002&length=300')
        await page.locator('#related-tool').click()
        await page.wait_for_url('**/calculators/sight-line-profile/?eye=1003.5&target=1002&length=300')
        await expect(page.locator('#total-distance')).to_have_value('300')

        await page.goto(origin + '/calc/calculators/construction-production/')
        await page.locator('select[data-field="rateId"]').first.select_option(label='Cross Culvert')
        source_link = page.get_by_role('link', name='Source PDF').first
        await expect(source_link).to_be_visible()
        source_url = await source_link.evaluate('link => link.href')
        assert (await page.request.get(source_url)).ok, source_url
        assert not errors, errors
        assert not failures, failures
        await context.close()

        no_js = await browser.new_context(java_script_enabled=False)
        page = await no_js.new_page()
        await page.goto(origin + '/calc/rpm.html')
        await page.wait_for_url(origin + '/calc/calculators/rpm/')
        await expect(page.locator('#rpmForm')).to_be_visible()
        await no_js.close()
        await browser.close()
        print('PASS: RPM calculation, explicit index route, homepage link, cross-tool inputs, generated source links, and no-JavaScript redirect', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check(f'http://127.0.0.1:{server.server_port}'))
    finally:
        server.shutdown()
