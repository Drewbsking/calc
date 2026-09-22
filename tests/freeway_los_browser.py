"""Browser checks: py -3.13 tests/freeway_los_browser.py (Playwright required)."""
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
from urllib.parse import urljoin, urldefrag

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(tempfile.gettempdir()) / "calc-hcm-qa"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


async def check(origin):
    OUTPUT.mkdir(exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1365, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(origin + "/freewayLOS.html")
        button = page.get_by_role("button", name="Calculate LOS", exact=True)
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("72.18 mph")
        await expect(page.locator("#steps")).to_contain_text("2400.00 pc/h/ln")
        await page.get_by_role("button", name="Load archived example").click()
        await expect(page.locator("#result")).to_have_text("Basic freeway — LOS C")
        for text in ["56.78 mph", "2267.80 pc/h/ln", "1400.00 pc/h/ln", "24.66 pc/mi/ln"]:
            await expect(page.locator("#steps")).to_contain_text(text)
        await page.screenshot(path=str(OUTPUT / "example-desktop.png"), full_page=True)
        print("PASS: HCM default and independently checked archive example")

        await page.locator("#baseFreeFlowSpeed").fill("75.4")
        await expect(page.locator("#result")).to_be_empty()
        await page.locator("#laneWidth").fill("11.5")
        await page.locator("#rightClearance").fill("4.5")
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("69.38 mph")
        await page.locator("#lanes").fill("5")
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("560.00 pc/h/ln")
        await expect(page.locator("#steps")).to_contain_text("0.15 mph")

        await page.locator("#ffsMode").select_option("measured")
        await expect(page.locator("#estimatedFields")).to_be_hidden()
        await expect(page.locator("#laneWidth")).to_be_disabled()
        await page.locator("#freeFlowSpeed").fill("65")
        await page.locator("#lanes").fill("2")
        await page.locator("#trafficVolume").fill("4200")
        await page.locator("#heavyVehicles").fill("0")
        await page.locator("#PHF").fill("1")
        await button.click()
        await expect(page.locator("#result")).to_contain_text("LOS E")
        await expect(page.locator("#steps")).to_contain_text("58.06 mph")
        await expect(page.locator("#steps")).to_contain_text("36.17 pc/mi/ln")
        await page.locator("#trafficVolume").fill("4800")
        await button.click()
        await expect(page.locator("#result")).to_contain_text("LOS F")
        await expect(page.locator("#steps")).to_contain_text("does not predict speed or density")
        print("PASS: decimal geometry, five lanes, measured speed, speed decline and oversaturation")

        await page.locator("#trafficVolume").fill("2400")
        await page.locator("#heavyVehicles").fill("13")
        await page.locator("#terrain").select_option("specific")
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("Exhibit 12-27")
        await page.locator("#gradePercent").fill("-2.5")
        await button.click()
        await expect(page.locator("#losError")).to_contain_text("from -2 to 6")
        await expect(page.locator("#result")).to_be_empty()
        await page.get_by_text("Use a separately verified PCE", exact=True).click()
        await page.locator("#pceOverride").fill("2.2")
        await button.click()
        await expect(page.locator("#losError")).to_contain_text("basis/source")
        await page.locator("#pceSource").fill('<img src=x onerror="window.injected=true"> Local study')
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("Local study")
        assert await page.locator("#steps img").count() == 0
        assert not await page.evaluate("Boolean(window.injected)")

        for field, invalid in [("PHF", "0"), ("lanes", "2.5"), ("heavyVehicles", "101"), ("trafficVolume", "")]:
            previous = await page.locator("#" + field).input_value()
            await page.locator("#" + field).fill(invalid)
            await button.click()
            await expect(page.locator("#result")).to_be_empty()
            assert not await page.locator("#" + field).evaluate("el => el.validity.valid")
            await page.locator("#" + field).fill(previous)
        await page.locator("#terrain").select_option("level")
        await page.locator("#pceOverride").fill("")
        await page.locator("#trafficVolume").fill("0")
        await button.click()
        await expect(page.locator("#result")).to_contain_text("LOS A")
        await expect(page.locator("#specificFields")).to_be_hidden()
        print("PASS: shared grade lookup, unsupported ranges, sourced overrides, escaping and invalid inputs")

        await page.set_viewport_size({"width": 320, "height": 844})
        await page.get_by_role("button", name="Load archived example").click()
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await page.screenshot(path=str(OUTPUT / "example-mobile.png"), full_page=True)
        await page.locator("#result").scroll_into_view_if_needed()
        await page.screenshot(path=str(OUTPUT / "results-mobile.png"))
        await page.locator("#calculation-formulas").screenshot(path=str(OUTPUT / "formulas-mobile.png"))
        for mode in ["measured", "estimated"]:
            await page.locator("#ffsMode").select_option(mode)
            await page.locator("#terrain").select_option("specific")
            await page.locator("#gradePercent").fill("2")
            await button.click()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert not await page.locator("#steps").evaluate("el => /NaN|Infinity/.test(el.textContent)")
        for href in await page.locator("main a[href]").evaluate_all("els => els.map(el => el.getAttribute('href'))"):
            target = urldefrag(urljoin(page.url, href))[0]
            response = await page.request.get(target)
            assert response.ok, target
        await page.goto(origin + "/index.html")
        await expect(page.locator('.calculator-card a[href="freewayLOS.html"]')).to_be_visible()
        await page.goto(origin + "/ML.html")
        await expect(page.locator('a[href="freewayLOS.html"]')).to_be_visible()
        assert not errors, errors
        print("PASS: 320px layout, source links, toolbox navigation, no JavaScript errors")
        await browser.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check(f"http://127.0.0.1:{server.server_port}"))
    finally:
        server.shutdown()
