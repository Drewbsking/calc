"""Exercise map navigation with PDF downloads forced in a temporary browser.

Run: py -3.13 tests/cert_map_viewer_browser.py
Requires Playwright and Chrome. Screenshots are saved in the system temp folder.
"""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(gettempdir()) / 'cert-map-browser-qa'


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path.startswith('/calc/'):
            self.path = self.path[5:]
        super().do_GET()

    def end_headers(self):
        # Even an attachment response must render inside the HTML viewer.
        if urlsplit(self.path).path.endswith('.pdf'):
            self.send_header('Content-Disposition', 'attachment')
        super().end_headers()


def check(origin):
    OUTPUT.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix='cert-map-chrome-') as profile, sync_playwright() as playwright:
        default = Path(profile) / 'Default'
        default.mkdir()
        (default / 'Preferences').write_text(json.dumps({
            'plugins': {'always_open_pdf_externally': True},
            'download': {'prompt_for_download': False},
        }))
        context = playwright.chromium.launch_persistent_context(
            profile, channel='chrome', headless=True,
            viewport={'width': 1440, 'height': 1100}, accept_downloads=True,
        )
        errors, downloads = [], []

        def observe(page):
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('download', lambda download: downloads.append(download.suggested_filename))

        context.on('page', observe)
        page = context.pages[0]
        observe(page)

        def ready(target):
            try:
                expect(target.locator('#map-stage canvas')).to_be_visible(timeout=30000)
            except AssertionError:
                print('Viewer failed:', target.url, target.locator('#status').inner_text(), errors, flush=True)
                target.screenshot(path=str(OUTPUT / 'failure.png'))
                raise
            expect(target.locator('#map-stage')).to_have_attribute('aria-busy', 'false', timeout=30000)
            expect(target.locator('#status')).to_have_text('')

        for prefix in ('', '/calc'):
            base = origin + prefix
            page.goto(base + '/certMap.html')
            expect(page.locator('#cert-links-list a')).to_have_count(25)
            with context.expect_page() as opened:
                page.locator('#cert-links-list').get_by_role('link', name='Springfield Township').click()
            viewer = opened.value
            ready(viewer)
            expect(viewer.locator('#map-title')).to_have_text('Springfield Township')
            assert '/certMap/viewer.html?file=Springfield-24-CW.pdf' in viewer.url
            viewer.locator('.map-links a[title*="(east)"]').click()
            ready(viewer)
            expect(viewer.locator('#map-title')).to_have_text('Independence Township')
            assert viewer.url.startswith(base)
            viewer.go_back()
            ready(viewer)
            expect(viewer.locator('#map-title')).to_have_text('Springfield Township')
            viewer.locator('#zoom').select_option('100')
            ready(viewer)
            assert viewer.locator('canvas').evaluate('el => el.getBoundingClientRect().width') > 1400
            if not prefix:
                stage = viewer.locator('#map-stage')
                stage.evaluate('el => { el.scrollLeft = 120; el.scrollTop = 250; }')
                bounds = stage.bounding_box()
                x, y = bounds['x'] + 700, bounds['y'] + 300

                def point():
                    return viewer.locator('.pdf-page').evaluate('''(el, point) => {
                        const rect = el.getBoundingClientRect();
                        return { x: (point.x - rect.left) / rect.width,
                            y: (point.y - rect.top) / rect.height, width: rect.width };
                    }''', {'x': x, 'y': y})

                before = point()
                viewer.mouse.move(x, y)
                viewer.mouse.wheel(0, -120)
                expect(viewer.locator('#zoom')).to_have_value('custom')
                ready(viewer)
                after = point()
                assert after['width'] > before['width']
                assert abs(after['x'] - before['x']) * after['width'] < 2
                assert abs(after['y'] - before['y']) * after['width'] * 4 / 3 < 2
                assert viewer.evaluate('window.scrollY') == 0

                # Rapid wheel input updates the preview, then finishes with a
                # sharp drawing at the final scale without jumping to the top.
                for _ in range(4):
                    viewer.mouse.wheel(0, -40)
                viewer.wait_for_function('document.querySelector(".pdf-page").getBoundingClientRect().width > ' + str(after['width'] + 10))
                ready(viewer)
                larger = point()
                assert abs(larger['x'] - before['x']) * larger['width'] < 4
                assert abs(larger['y'] - before['y']) * larger['width'] * 4 / 3 < 4
                viewer.mouse.wheel(0, 120)
                viewer.wait_for_function('document.querySelector(".pdf-page").getBoundingClientRect().width < ' + str(larger['width'] - 10))
                ready(viewer)

                start = stage.evaluate('el => ({x: el.scrollLeft, y: el.scrollTop})')
                viewer.mouse.move(x, y)
                viewer.mouse.down()
                viewer.mouse.move(x - 70, y - 60, steps=5)
                expect(stage).to_have_class('is-panning')
                viewer.mouse.up()
                expect(stage).not_to_have_class('is-panning')
                end = stage.evaluate('el => ({x: el.scrollLeft, y: el.scrollTop})')
                assert abs(end['x'] - start['x'] - 70) < 2
                assert abs(end['y'] - start['y'] - 60) < 2
                viewer.screenshot(path=str(OUTPUT / 'wheel-zoom-pan.png'))

            viewer.locator('#zoom').select_option('page')
            ready(viewer)
            if not prefix:
                # A drag starting on a link must pan without activating it;
                # a plain click on the same link must still navigate.
                link = viewer.locator('.map-links a[title*="(east)"]')
                box = link.bounding_box()
                lx, ly = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
                previous_url = viewer.url
                viewer.mouse.move(lx, ly)
                viewer.mouse.down()
                viewer.mouse.move(lx - 60, ly - 20, steps=5)
                viewer.mouse.up()
                viewer.wait_for_timeout(150)
                assert viewer.url == previous_url
                link.click()
                ready(viewer)
                expect(viewer.locator('#map-title')).to_have_text('Independence Township')
                viewer.go_back()
                ready(viewer)
                viewer.screenshot(path=str(OUTPUT / 'springfield-desktop.png'))

            viewer.goto(base + '/certMap/viewer.html?file=Holly-24-CW.pdf')
            ready(viewer)
            expect(viewer.locator('.map-links a')).to_have_count(2)
            viewer.locator('.map-links a[title*="(south)"]').focus()
            viewer.keyboard.press('Enter')
            ready(viewer)
            expect(viewer.locator('#map-title')).to_have_text('Rose Township')

            viewer.goto(base + '/certMap/viewer.html?file=2024%20Countywide%20Cert.pdf#page=10')
            ready(viewer)
            expect(viewer.locator('#page-number')).to_have_value('10')
            expect(viewer.locator('#page-count')).to_have_text('of 27')
            viewer.locator('.map-links a[title*="(south)"]').click()
            ready(viewer)
            expect(viewer.locator('#page-number')).to_have_value('20')
            viewer.get_by_role('button', name='Next page', exact=True).click()
            ready(viewer)
            expect(viewer.locator('#page-number')).to_have_value('21')
            viewer.get_by_role('button', name='Previous page', exact=True).click()
            ready(viewer)
            expect(viewer.locator('#page-number')).to_have_value('20')
            viewer.locator('#page-number').fill('1')
            viewer.locator('#page-number').press('Enter')
            ready(viewer)
            expect(viewer.get_by_role('button', name='Previous page', exact=True)).to_be_disabled()
            viewer.close()

        page.set_viewport_size({'width': 390, 'height': 844})
        page.goto(origin + '/certMap/viewer.html?file=Springfield-24-CW.pdf')
        ready(page)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUTPUT / 'springfield-mobile.png'))
        page.locator('.map-links a[title*="(east)"]').click()
        ready(page)
        expect(page.locator('#map-title')).to_have_text('Independence Township')
        assert downloads == [], downloads
        with page.expect_download() as saved:
            page.get_by_role('link', name='Download PDF').click()
        assert saved.value.suggested_filename == 'Independence-24-CW.pdf'

        page.goto(origin + '/certMap/viewer.html?file=../../missing.pdf')
        expect(page.locator('#status')).to_contain_text('not available')
        expect(page.locator('#download')).to_be_hidden()
        expect(page.locator('canvas')).to_have_count(0)

        # Fetch failures expose a retry and retain the explicit download option.
        page.route('**/Holly-24-CW.pdf', lambda route: route.abort())
        page.goto(origin + '/certMap/viewer.html?file=Holly-24-CW.pdf')
        expect(page.locator('#retry')).to_be_visible(timeout=15000)
        expect(page.locator('#download')).to_be_visible()
        page.unroute('**/Holly-24-CW.pdf')
        page.get_by_role('button', name='Try again').click()
        ready(page)
        assert errors == [], errors
        context.close()
    print('Passed: browser rendering, margin links, book navigation, wheel zoom, drag pan, mobile, download and recovery.')
    print('PDF downloads were forced in Chrome preferences and HTTP headers; navigation caused zero downloads.')
    print('Screenshots:', OUTPUT)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        check(f'http://127.0.0.1:{server.server_port}')
    finally:
        server.shutdown()
        server.server_close()
