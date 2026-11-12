"""Check touch gestures and top-of-map recovery on phone-sized browsers.

Run: py -3.13 tests/cert_map_mobile_browser.py
Uses real emulated touch input in Chrome and iPhone layouts in WebKit.
"""

from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright, expect

from cert_map_viewer_browser import Handler, ROOT, OUTPUT


def ready(page):
    expect(page.locator('#map-stage canvas')).to_be_visible(timeout=30000)
    expect(page.locator('#map-stage')).to_have_attribute('aria-busy', 'false', timeout=30000)
    expect(page.locator('#status')).to_have_text('')


def geometry(page):
    return page.evaluate('''() => {
        const stage = document.querySelector('#map-stage');
        const map = document.querySelector('.pdf-page');
        const bounds = stage.getBoundingClientRect(), sheet = map.getBoundingClientRect();
        const reset = document.querySelector('#reset-view').getBoundingClientRect();
        return {windowY: scrollY, visualScale: visualViewport.scale,
            scrollTop: stage.scrollTop, scrollLeft: stage.scrollLeft,
            stageTop: bounds.top, stageBottom: bounds.bottom, stageHeight: stage.clientHeight,
            mapTop: sheet.top, mapBottom: sheet.bottom, mapWidth: sheet.width,
            resetTop: reset.top, resetBottom: reset.bottom, height: innerHeight,
            rootWidth: document.documentElement.scrollWidth, width: innerWidth};
    }''')


def full_map_visible(page):
    ready(page)
    state = geometry(page)
    assert state['windowY'] == 0, state
    assert state['rootWidth'] <= state['width'], state
    assert state['scrollTop'] == 0 and state['scrollLeft'] == 0, state
    assert state['stageTop'] <= state['mapTop'] <= state['stageTop'] + 17, state
    assert state['mapBottom'] <= state['stageBottom'] + 1, state
    assert 0 <= state['resetTop'] < state['resetBottom'] <= state['height'], state


def touch_path(page, cdp, frames, cancel=False):
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': frames[0]})
    for points in frames[1:]:
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': points})
        page.evaluate('new Promise(requestAnimationFrame)')
    cdp.send('Input.dispatchTouchEvent', {
        'type': 'touchCancel' if cancel else 'touchEnd', 'touchPoints': [],
    })
    # Chrome's synthetic swipe recognizer briefly filters following taps, even
    # on an empty page with touch-action:none. Start the next gesture after it
    # settles so taps exercise the viewer rather than that input filter.
    page.wait_for_timeout(600)


def swipe(page, cdp, up):
    box = page.locator('#map-stage').bounding_box()
    x = box['x'] + box['width'] / 2
    low, high = box['y'] + box['height'] - 45, box['y'] + 45
    start, end = (low, high) if up else (high, low)
    frames = [[{'x': x, 'y': start + (end - start) * i / 12, 'id': 1}] for i in range(13)]
    touch_path(page, cdp, frames)


def check(origin):
    OUTPUT.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(**playwright.devices['Pixel 7'])
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        cdp = context.new_cdp_session(page)
        page.goto(origin + '/certMap/viewer.html?file=Springfield-24-CW.pdf')
        full_map_visible(page)
        before = geometry(page)
        box = page.locator('#map-stage').bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        frames = [[{'x': x - (40 + i * 5), 'y': y, 'id': 1},
                   {'x': x + (40 + i * 5), 'y': y, 'id': 2}] for i in range(13)]
        touch_path(page, cdp, frames)
        ready(page)
        after = geometry(page)
        assert after['mapWidth'] > before['mapWidth'] * 2, after
        assert after['visualScale'] == 1 and after['windowY'] == 0, after
        expect(page.locator('#zoom')).to_have_value('custom')
        for _ in range(3):
            swipe(page, cdp, up=True)
        assert geometry(page)['scrollTop'] > 300
        for _ in range(5):
            swipe(page, cdp, up=False)
        top = geometry(page)
        assert top['scrollTop'] == 0 and top['mapTop'] >= top['stageTop'], top
        assert top['windowY'] == 0 and top['visualScale'] == 1, top
        page.screenshot(path=str(OUTPUT / 'mobile-return-to-top.png'))

        # Recover from any map position with a visible button, without a reload.
        swipe(page, cdp, up=True)
        page.get_by_role('button', name='Reset view', exact=True).tap()
        expect(page.locator('#zoom')).to_have_value('page')
        full_map_visible(page)
        page.screenshot(path=str(OUTPUT / 'mobile-reset-view.png'))

        # Touch drags on margins do not navigate; an ordinary tap still does.
        link = page.locator('.map-links a[title*="(east)"]')
        box = link.bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        url = page.url
        frames = [[{'x': x - i * 5, 'y': y, 'id': 1}] for i in range(13)]
        touch_path(page, cdp, frames)
        assert page.url == url
        link.tap()
        ready(page)
        expect(page.locator('#map-title')).to_have_text('Independence Township')

        # A canceled finger drag must not leave the viewer stuck in pan mode.
        page.locator('#zoom').select_option('100')
        ready(page)
        box = page.locator('#map-stage').bounding_box()
        x, y = box['x'] + 150, box['y'] + 200
        touch_path(page, cdp, [[{'x': x, 'y': y, 'id': 1}],
                              [{'x': x, 'y': y - 70, 'id': 1}]], cancel=True)
        expect(page.locator('#map-stage')).not_to_have_class('is-panning')
        page.get_by_role('button', name='Reset view', exact=True).tap()
        full_map_visible(page)

        # Address-bar height changes, small phones, and rotation keep the
        # controls visible and the top reachable without reloading the PDF.
        for width, height in [(412, 650), (412, 839), (320, 568), (915, 412)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_timeout(250)
            page.get_by_role('button', name='Reset view', exact=True).tap()
            full_map_visible(page)
        page.screenshot(path=str(OUTPUT / 'mobile-landscape.png'))
        assert errors == [], errors
        browser.close()

        # WebKit checks Safari's viewport layout and scroll-bound recovery.
        browser = playwright.webkit.launch()
        page = browser.new_page(**playwright.devices['iPhone 13'])
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin + '/certMap/viewer.html?file=Springfield-24-CW.pdf')
        full_map_visible(page)
        page.locator('#zoom').select_option('100')
        ready(page)
        page.locator('#map-stage').evaluate('el => { el.scrollTop = el.scrollHeight; el.scrollLeft = el.scrollWidth; }')
        page.get_by_role('button', name='Reset view', exact=True).tap()
        full_map_visible(page)
        page.screenshot(path=str(OUTPUT / 'iphone-reset-view.png'))
        page.set_viewport_size({'width': 844, 'height': 390})
        page.wait_for_timeout(250)
        page.get_by_role('button', name='Reset view', exact=True).tap()
        full_map_visible(page)
        assert errors == [], errors
        browser.close()
    print('Passed: Android touch pan, pinch, return to top, reset, margin taps and gesture cancellation.')
    print('Passed: phone resizing/rotation and iPhone WebKit layout/reset. No physical-device testing.')


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        check(f'http://127.0.0.1:{server.server_port}')
    finally:
        server.shutdown()
        server.server_close()
