"""Sign placement interaction and visual QA: py -3.13 tests/sign_placement_browser.py."""
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(tempfile.gettempdir()) / 'sign-placement-check'


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def translate_path(self, path):
        if path.startswith('/calc/'):
            path = path[len('/calc'):]
        return super().translate_path(path)


async def check(origin):
    ARTIFACTS.mkdir(exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        context = await browser.new_context(viewport={'width': 1440, 'height': 1050})
        await context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin) else route.abort())
        page = await context.new_page()
        errors, failures = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failures.append(response.url) if response.status >= 400 else None)

        for prefix in ['/', '/calc/']:
            await page.goto(origin + prefix + 'signPlacement.html?check=1#placement')
            await page.wait_for_url(origin + prefix + 'calculators/sign-placement/?check=1#placement')
            await expect(page.locator('.site-nav a')).to_have_attribute('href', origin + prefix + 'index.html')
            await expect(page.locator('.tool-category-label')).to_have_text('Category: Traffic Operations')
            await expect(page.locator('#table-source')).to_have_value('mmutcd')
            await expect(page.locator('#table-distance')).to_have_text('175 ft')
            await expect(page.locator('#formula-panel')).to_be_hidden()
            # Both bundled source PDFs and the related tool resolve under either hosting prefix.
            for link in await page.locator('main a[href^="../"]').all():
                response = await page.request.get(await link.evaluate('el => el.href'))
                assert response.ok, response.url

        await page.screenshot(path=str(ARTIFACTS / 'desktop-table.png'), full_page=True)
        await page.locator('#extra-legibility').check()
        await expect(page.locator('#table-distance')).to_have_text('275 ft')
        await expect(page.locator('#table-breakdown')).to_contain_text('175 ft table distance + 100 ft')

        await page.locator('#table-source').select_option('mdot')
        await expect(page.locator('#table-distance')).to_have_text('215 ft')
        await expect(page.locator('#legibility-adjustment')).to_be_hidden()
        await expect(page.locator('#table-source-link')).to_have_attribute('href', '../curve/references/mdot-curve-reference.pdf#page=2')
        await page.locator('#table-approach').select_option('45')
        await page.locator('#table-advisory').select_option('35')
        await expect(page.locator('#table-distance')).to_have_text('125 ft')
        await expect(page.locator('#sign-placement-table td.is-selected')).to_have_text('125')
        await expect(page.locator('#table-guidance')).to_contain_text('250 ft')
        await page.locator('#warning-condition').select_option('stop')
        await page.locator('#table-approach').select_option('70')
        await expect(page.locator('#table-distance')).to_have_text('695 ft')
        await expect(page.locator('#table-advisory')).to_be_disabled()
        await expect(page.locator('#advisory-field')).to_be_hidden()
        await page.locator('#warning-condition').select_option('A')
        await expect(page.locator('#table-distance')).to_have_text('1,250 ft')
        await page.locator('#table-details summary').click()
        await page.screenshot(path=str(ARTIFACTS / 'desktop-mdot-table.png'), full_page=True)

        await page.locator('#table-source').select_option('mmutcd')
        await expect(page.locator('#table-approach')).to_have_value('50')
        await expect(page.locator('#table-advisory')).to_have_value('20')
        await expect(page.locator('#table-distance')).to_have_text('985 ft')
        await page.locator('#extra-legibility').uncheck()
        await page.locator('#warning-condition').select_option('speed')
        await page.locator('#table-approach').select_option('25')
        await expect(page.locator('#table-distance')).to_have_text('Site-dependent')
        await expect(page.locator('#table-guidance')).to_contain_text('Note 5')
        await expect(page.locator('#sign-placement-table td.is-selected')).to_contain_text('N/A')
        await page.locator('#table-advisory').select_option('80')
        await expect(page.locator('#table-distance')).to_have_text('—')
        await expect(page.locator('#table-context')).to_contain_text('lower than approach')
        await expect(page.locator('#sign-placement-table td.is-selected')).to_have_count(0)

        # Keyboard switching, real equations, independent legibility and validation recovery.
        await page.locator('#formula-mode').focus()
        await page.keyboard.press('Enter')
        await expect(page.locator('#table-panel')).to_be_hidden()
        await expect(page.locator('#formula-mode')).to_have_attribute('aria-pressed', 'true')
        await expect(page.locator('#formula-distance')).to_have_text('385.0 ft')
        await expect(page.locator('#text-height')).to_have_text('—')
        for field, value in [('initial-velocity', '30'), ('final-velocity', '15'), ('deceleration', '11'), ('legibility-distance', '60')]:
            await page.locator('#' + field).fill(value)
        await expect(page.locator('#formula-distance')).to_have_text('116.0 ft')
        await expect(page.locator('#pr-distance')).to_have_text('110.0 ft')
        await expect(page.locator('#braking-distance')).to_have_text('66.0 ft')
        await expect(page.locator('#text-height')).to_have_text('2.00 in')
        await page.screenshot(path=str(ARTIFACTS / 'desktop-formula.png'), full_page=True)
        for field, value, message in [('deceleration', '0', 'greater than zero'), ('pr-time', '', 'finite number'), ('final-velocity', '40', 'between zero')]:
            old = await page.locator('#' + field).input_value()
            await page.locator('#' + field).fill(value)
            for result in ['formula-distance', 'pr-distance', 'braking-distance', 'distance-traveled', 'legibility-credit', 'text-height']:
                await expect(page.locator('#' + result)).to_have_text('—')
            await expect(page.locator('#formula-validation')).to_contain_text(message)
            await page.locator('#' + field).fill(old)
            await expect(page.locator('#formula-distance')).to_have_text('116.0 ft')
        await page.locator('#pr-time').fill('0')
        await expect(page.locator('#pr-distance')).to_have_text('0.0 ft')
        await expect(page.locator('#formula-distance')).to_have_text('6.0 ft')
        await page.locator('#legibility-distance').fill('180')
        await expect(page.locator('#formula-distance')).to_have_text('0.0 ft')
        await expect(page.locator('#formula-validation')).to_contain_text('limited to 0 ft')
        await expect(page.locator('#text-height')).to_have_text('6.00 in')
        await page.locator('#pr-time').fill('2.5')
        await page.locator('#legibility-distance').fill('60')

        for width in [320, 390, 768, 1440]:
            await page.set_viewport_size({'width': width, 'height': 900})
            for mode in ['formula', 'table']:
                await page.locator('#' + mode + '-mode').click()
                assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{width}px {mode} overflows'
            if width == 390:
                await page.locator('#table-source').select_option('mdot')
                await page.locator('#table-approach').select_option('45')
                await page.locator('#table-advisory').select_option('35')
                await page.screenshot(path=str(ARTIFACTS / 'mobile-table.png'), full_page=True)
                await page.locator('#formula-mode').click()
                await page.screenshot(path=str(ARTIFACTS / 'mobile-formula.png'), full_page=True)

        assert not errors, errors
        assert not failures, failures
        await browser.close()
    print('PASS: source selection, footnotes, all conditions, equations, validation, keyboard switching, routes, links, and responsive layout')
    print(f'Screenshots: {ARTIFACTS}')


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check(f'http://127.0.0.1:{server.server_port}'))
    finally:
        server.shutdown()
        server.server_close()
