"""Browser regression checks: py -3.13 tests/ml_browser.py (Playwright required)."""
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(tempfile.gettempdir()) / "calc-ml-qa"


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
        await page.goto(origin + "/ML.html")
        button = page.get_by_role("button", name="Calculate LOS")
        await expect(page.locator("#estimatedFields")).to_be_hidden()
        await button.click()
        await expect(page.locator("#result")).to_have_text("3,200 ft grade — Upgrade: LOS C; Downgrade: LOS C.")
        await expect(page.locator("#steps")).to_contain_text("56.00 mph")
        await expect(page.locator("#steps")).to_contain_text("2120.00 pc/h/ln")
        await page.locator("#trafficVolume").fill("3800")
        await expect(page.locator("#result")).to_be_empty()
        await button.click()
        await expect(page.locator("#result")).to_contain_text("Upgrade: LOS F; Downgrade: LOS F")
        await expect(page.locator("#steps")).to_contain_text("does not predict speed or density")
        await page.locator("#trafficVolume").fill("1900")
        await page.locator("#gradeLength").fill("5280")
        await button.click()
        await expect(page.locator("#result")).to_contain_text("5,280 ft grade")
        await page.locator("#gradePercent").fill("2.5")
        await button.click()
        await expect(page.locator("#result")).to_contain_text("Downgrade: needs PCE")
        await expect(page.locator("#steps")).to_contain_text("from -2 to 6")
        await page.get_by_text("Use a separately verified PCE", exact=True).click()
        await page.locator("#downgradePCE").fill("2.02")
        await button.click()
        await expect(page.locator("#losError")).to_contain_text("basis/source")
        await expect(page.locator("#result")).to_be_empty()
        await page.locator("#pceSource").fill('<img src=x onerror="window.injected=true"> local study')
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("local study")
        assert await page.locator("#steps img").count() == 0
        assert not await page.evaluate("Boolean(window.injected)")
        await page.locator("#pceSource").fill("Verified local study example")
        await button.click()
        await page.screenshot(path=str(OUTPUT / "measured-desktop.png"), full_page=True)
        print("PASS: volume, actual length, unsupported grades, documented overrides, escaped source text")

        await page.locator("#ffsMode").select_option("estimated")
        await expect(page.locator("#measuredFields")).to_be_hidden()
        await expect(page.locator("#freeFlowSpeed")).to_be_disabled()
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("52.70 mph")
        await page.locator("#laneWidth").fill("12")
        await page.locator("#rightClearance").fill("6")
        await page.locator("#accessPoints").fill("0")
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("60.00 mph")
        await page.locator("#medianType").select_option("undivided")
        await expect(page.locator("#leftClearance")).to_be_disabled()
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("58.40 mph")
        await page.locator("#baseFreeFlowSpeed").fill("40")
        await button.click()
        await expect(page.locator("#losError")).to_contain_text("from 45 to 70")
        await expect(page.locator("#result")).to_be_empty()
        await page.locator("#baseFreeFlowSpeed").fill("60")
        await page.locator("#terrain").select_option("level")
        await expect(page.locator("#specificFields")).to_be_hidden()
        await button.click()
        await expect(page.locator("#result")).to_contain_text("Level terrain — Segment: LOS C")
        await expect(page.locator("#steps")).to_contain_text("Exhibit 12-25")
        await page.locator("#trafficVolume").fill("0")
        await button.click()
        await expect(page.locator("#result")).to_contain_text("LOS A")
        for field, value in [("PHF", "0"), ("PHF", ""), ("heavyVehicles", "101")]:
            old = await page.locator("#" + field).input_value()
            await page.locator("#" + field).fill(value)
            await button.click()
            await expect(page.locator("#result")).to_be_empty()
            assert not await page.locator("#" + field).evaluate("el => el.validity.valid")
            await page.locator("#" + field).fill(old)
        print("PASS: both speed modes, geometry, median, general terrain, zero traffic, invalid inputs")

        await page.set_viewport_size({"width": 390, "height": 844})
        for mode in ["measured", "estimated"]:
            await page.locator("#ffsMode").select_option(mode)
            await page.locator("#terrain").select_option("specific")
            await button.click()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), mode
            assert not await page.locator("#steps").evaluate("el => /NaN|Infinity/.test(el.textContent)")
            await page.screenshot(path=str(OUTPUT / f"{mode}-mobile.png"), full_page=True)
        await page.set_viewport_size({"width": 1365, "height": 1000})
        await page.goto(origin + "/ML.html")
        await expect(page.locator("#sixthFormulas")).to_be_visible()
        await expect(page.locator("#legacyFormulas")).to_be_hidden()
        await page.locator("#analysisEdition").select_option("2010")
        await expect(page.locator("#heavyVehicles")).to_be_disabled()
        await expect(page.locator("#sutMix")).to_be_disabled()
        await expect(page.locator("#splitTrafficFields")).to_be_visible()
        await expect(page.locator("#sixthFormulas")).to_be_hidden()
        await expect(page.locator("#legacyFormulas")).to_be_visible()
        await page.locator("#gradePercent").fill("2.5")
        await button.click()
        await expect(page.locator("#result")).to_contain_text("Upgrade: LOS C; Downgrade: LOS C")
        await expect(page.locator("#steps")).to_contain_text("nearest 5 mph to 56.00 = 55 mph")
        await expect(page.locator("#steps")).to_contain_text("2100.00 pc/h/ln")
        await expect(page.locator("#steps")).to_contain_text("1166.39 pc/h/ln")
        await page.locator("#percentTrucks").fill("99")
        await expect(page.locator("#result")).to_be_empty()
        await button.click()
        await expect(page.locator("#losError")).to_contain_text("must not exceed 100")
        await page.locator("#percentTrucks").fill("13")
        await page.locator("#trafficVolume").fill("2800")
        await button.click()
        await expect(page.locator("#steps .step").nth(2).locator("sup")).to_have_text(["1.31", "1.31"])
        await page.locator("#trafficVolume").fill("1900")
        await page.locator("#gradePercent").fill("7")
        await page.locator("#gradeLength").fill("1320")
        await page.locator("#percentTrucks").fill("25")
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("conflicts with the archived reference")
        await page.get_by_text("Use separately verified HCM 2010 PCEs", exact=True).click()
        await page.locator("#upgradeET2010").fill("2.35")
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("basis/source")
        await page.locator("#pceSource2010").fill('<img src=x onerror="window.injected=true"> verified 2010 study')
        await button.click()
        await expect(page.locator("#steps")).to_contain_text("2.3500")
        assert await page.locator("#steps img").count() == 0
        assert not await page.evaluate("Boolean(window.injected)")
        print("PASS: 2010 fields, formulas, published example, invalid sum, speed decline, disputed cell and escaped override")

        await page.goto(origin + "/ML.html")
        await page.locator("#analysisEdition").select_option("both")
        await expect(page.locator("#sixthFormulas")).to_be_visible()
        await expect(page.locator("#legacyFormulas")).to_be_visible()
        await page.locator("#percentTrucks").fill("18")
        await expect(page.locator("#comparisonHeavyTotal")).to_have_text("20")
        await page.locator("#percentTrucks").fill("13")
        await page.locator("#gradePercent").fill("2.5")
        await button.click()
        tables = page.locator(".comparison-table")
        await expect(tables).to_have_count(2)
        await expect(tables.nth(0)).to_contain_text("2100.00")
        await expect(tables.nth(0)).to_contain_text("2120.00")
        await expect(tables.nth(1)).to_contain_text("Needs PCE")
        await expect(page.locator(".edition-results").nth(0)).to_contain_text("Downgrade: LOS C")
        await page.locator("#gradePercent").fill("2")
        await page.locator("#freeFlowSpeed").fill("65")
        await button.click()
        await expect(page.locator(".edition-results").nth(0)).to_contain_text("HCM 2010 FFS")
        await expect(page.locator(".edition-results").nth(1)).to_contain_text("2300.00 pc/h/ln")
        await page.locator("#freeFlowSpeed").fill("43")
        await button.click()
        await expect(page.locator(".edition-results").nth(0)).to_contain_text("= 45 mph")
        await expect(page.locator(".edition-results").nth(1)).to_contain_text("from 45 to 70")
        await page.locator("#freeFlowSpeed").fill("56")
        await page.locator("#ffsMode").select_option("estimated")
        await page.locator("#baseFreeFlowSpeed").fill("65")
        await page.locator("#medianType").select_option("undivided")
        await button.click()
        await expect(page.locator(".edition-results").nth(0)).to_contain_text("nearest 5 mph to 56.10 = 55 mph")
        await expect(page.locator(".edition-results").nth(1)).to_contain_text("2122.00 pc/h/ln")
        await tables.nth(0).screenshot(path=str(OUTPUT / "comparison-desktop.png"))
        await page.locator("#trafficVolume").fill("3800")
        await button.click()
        await expect(tables.nth(0)).to_contain_text("Unavailable (LOS F)")
        await page.locator("#trafficVolume").fill("1900")
        await button.click()
        await page.set_viewport_size({"width": 320, "height": 844})
        for edition in ["both", "2010", "6th"]:
            await page.locator("#analysisEdition").select_option(edition)
            await expect(page.locator("#result")).to_be_empty()
            await button.click()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), edition
            assert not await page.locator("#steps").evaluate("el => /NaN|Infinity/.test(el.textContent)"), edition
            if edition == "both":
                await tables.nth(0).screenshot(path=str(OUTPUT / "comparison-mobile.png"))
            elif edition == "2010":
                await page.locator("#legacyFormulas").screenshot(path=str(OUTPUT / "2010-formulas-mobile.png"))
        await expect(page.locator("#percentTrucks")).to_be_disabled()
        await expect(page.locator("#heavyVehicles")).to_be_enabled()
        await expect(page.locator("#steps")).not_to_contain_text("Selected 2010 curve")
        print("PASS: shared comparison demand, independent range/PCE failures, estimated speeds, oversaturation, all editions at 320px")

        for link in ["docs/ml-source-reconciliation.md", "docs/ml-2010-sources.md", "MLdata.js", "ML2010data.js", "MLscripts.js", "MLpage.js"]:
            response = await page.request.get(origin + "/" + link)
            assert response.ok, link
        await page.goto(origin + "/index.html")
        card = page.locator(".calculator-card").filter(has=page.locator('a[href="ML.html"]'))
        await expect(card).to_contain_text("HCM 6th Edition")
        await expect(card).to_contain_text("HCM 2010")
        assert not errors, errors
        print("PASS: mobile layouts, local links, toolbox description, no browser JavaScript errors")
        print("Screenshots:", OUTPUT)
        await browser.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check(f"http://127.0.0.1:{server.server_port}"))
    finally:
        server.shutdown()
        server.server_close()
