"""Optional browser QA: py -3.13 tests/sight_line_browser.py (requires Playwright)."""

import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading

from playwright.async_api import async_playwright, expect


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(tempfile.gettempdir()) / "calc-sight-line-qa"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


async def check_pages(origin):
    OUTPUT.mkdir(exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
        page = await context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        await page.goto(origin + "/sightLineElevation.html")
        await expect(page.locator("#checked-elevation")).to_have_text("1,002.75 ft")
        await expect(page.locator("#sight-line-results")).to_be_visible()
        await page.screenshot(path=str(OUTPUT / "elevation-desktop.png"), full_page=True)
        await page.locator("#check-distance").fill("75")
        await expect(page.locator("#checked-elevation")).to_have_text("1,003.125 ft")
        await page.locator("#distance-slider").focus()
        await page.keyboard.press("Home")
        await expect(page.locator("#checked-elevation")).to_have_text("1,003.50 ft")
        await page.keyboard.press("End")
        await expect(page.locator("#checked-elevation")).to_have_text("1,002.00 ft")
        await page.locator("#total-distance").fill("0")
        await expect(page.locator("#sight-line-results")).to_be_hidden()
        await expect(page.locator("#sight-line-error")).to_contain_text("greater than zero")
        await page.locator("#load-example").click()
        await page.locator("#check-distance").fill("301")
        await expect(page.locator("#sight-line-error")).to_contain_text("between 0 and 300")
        await expect(page.locator("#sight-line-results")).to_be_hidden()
        await page.locator("#check-distance").fill("100")
        await page.locator("#eye-elevation").fill("")
        await expect(page.locator("#sight-line-error")).to_contain_text("eye elevation")
        print("PASS: elevation values, keyboard slider, invalid distances, blank inputs, and stale results")

        await page.locator("#eye-elevation").fill("123")
        await page.locator("#target-elevation").fill("125")
        await page.locator("#total-distance").fill("100")
        await page.locator("#related-tool").click()
        await expect(page.locator("#eye-elevation")).to_have_value("123")
        await expect(page.locator("#target-elevation")).to_have_value("125")
        await expect(page.locator("#total-distance")).to_have_value("100")
        await expect(page.locator("#ground-points")).to_have_value("")
        await expect(page.locator("#sight-line-results")).to_be_hidden()
        await page.locator("#ground-points").fill("100,120\n0,120")
        await expect(page.locator("#ground-results tr")).to_have_count(2)
        await page.locator("#related-tool").click()
        await expect(page.locator("#checked-elevation")).to_have_text("124.00 ft")
        print("PASS: related tools carry endpoint inputs without carrying fictitious ground data")

        await page.goto(origin + "/sightLineProfile.html")
        await expect(page.locator("#minimum-clearance")).to_have_text("-0.65 ft")
        await expect(page.locator("#profile-summary")).to_have_text("2 ground point(s) above the sight line")
        await expect(page.locator("#ground-results tr")).to_have_count(7)
        await expect(page.locator(".sl-obstruction")).to_have_count(3)
        await page.screenshot(path=str(OUTPUT / "profile-desktop.png"), full_page=True)
        async with page.expect_download() as download_event:
            await page.locator("#download-results").click()
        download = await download_event.value
        assert download.suggested_filename == "sight-line-clearances.csv"
        csv = Path(await download.path()).read_text(encoding="utf-8")
        assert "Distance_ft,Ground_elevation_ft,Sight_line_elevation_ft,Clearance_ft,Position" in csv
        assert "150,1003.4,1002.75," in csv
        assert len(csv.splitlines()) == 8
        print("PASS: default ground profile, obstruction shading, point table, and CSV export")

        for points, message in [("", "at least one"), ("0,1000\n0,1001", "duplicate distance"),
                                ("301,1000", "between 0 and 300"), ("0,NaN", "number")]:
            await page.locator("#ground-points").fill(points)
            await expect(page.locator("#sight-line-results")).to_be_hidden()
            await expect(page.locator("#sight-line-error")).to_contain_text(message)
            await expect(page.locator("#download-results")).to_be_disabled()
        await page.locator("#ground-points").fill("150,1002.75")
        await expect(page.locator("#profile-summary")).to_contain_text("touch the sight line")
        await expect(page.locator("#coverage")).to_contain_text("One ground point")
        await expect(page.locator(".sl-ground-line")).to_have_count(0)
        await page.locator("#ground-points").fill("200\t1000\n100\t1000")
        await expect(page.locator("#profile-summary")).to_contain_text("below the sight line")
        await expect(page.locator("#ground-results tr").first.locator("td").first).to_have_text("100.00")
        await expect(page.locator("#coverage")).to_contain_text("only from 100.00 to 200.00")
        print("PASS: profile validation, contact, single point, pasted columns, sorting, and limited coverage")

        await page.set_viewport_size({"width": 390, "height": 844})
        for route, screenshot in [("sightLineElevation.html", "elevation-mobile.png"), ("sightLineProfile.html", "profile-mobile.png")]:
            await page.goto(origin + "/" + route)
            await expect(page.locator("#sight-line-results")).to_be_visible()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), route
            assert await page.locator("#sight-line-chart").evaluate("el => !/NaN|Infinity/.test(el.innerHTML)")
            await page.screenshot(path=str(OUTPUT / screenshot), full_page=True)
        print("PASS: both mobile layouts fit the viewport with scrollable charts and tables")

        await page.goto(origin + "/index.html")
        await page.locator(".filter-chip").filter(has_text="Sight Distance").click()
        for route in ("sightLineElevation.html", "sightLineProfile.html"):
            await expect(page.locator(f'.calculator-card a[href="{route}"]')).to_be_visible()
        assert errors == [], errors
        print("PASS: toolbox category links; no browser JavaScript errors")
        print("Screenshots:", OUTPUT)
        await browser.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        asyncio.run(check_pages(f"http://127.0.0.1:{server.server_port}"))
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
