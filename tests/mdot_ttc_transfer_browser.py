"""Check the two-pane MDOT selector. Run: py -3.13 tests/mdot_ttc_transfer_browser.py."""
import asyncio
from functools import partial
from http.server import ThreadingHTTPServer
import threading
from zipfile import ZipFile

from playwright.async_api import async_playwright, expect
from pypdf import PdfReader

from mdot_ttc_browser import Handler, ROOT, TOOL, RECORDS, OUTPUT, ALWAYS_IDS, report_ids, selected_ids, save_download, inspect_word


async def check(origin):
    OUTPUT.mkdir(exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def mark(pane, identifier):
            return page.locator(f'input[data-mark="{pane}"][value="{identifier}"]')

        for prefix in ['/calc', '']:
            await page.goto(origin + prefix + '/calculators/mdot-ttc/')
            await page.locator('#new-project').click()
            await expect(page.locator('input[data-filter="projectType"][value="Construction"]')).to_be_checked()
            await expect(page.locator('#filters input:checked')).to_have_count(1)
            await expect(page.locator('#available-count')).to_have_text('80')
            await expect(page.locator('#rcoc-construction-note')).to_be_visible()
            await page.locator('#reset-filters').click()
            await expect(page.locator('#filters input:checked')).to_have_count(0)
            await expect(page.locator('#available-count')).to_have_text('131')
            await expect(page.locator('#move-right')).to_be_disabled()
            await expect(page.locator('#move-left')).to_be_disabled()
            await expect(page.locator('input[data-mark]:checked')).to_have_count(0)
            filters = await page.locator('.ttc-filter-panel').bounding_box()
            left = await page.locator('.ttc-available-pane').bounding_box()
            right = await page.locator('.ttc-selected-pane').bounding_box()
            assert filters['y'] + filters['height'] < left['y']
            assert left['x'] + left['width'] < right['x']
            assert abs(left['height'] - right['height']) < 1
            select_all = page.get_by_role('checkbox', name='Select all available details', exact=True)
            select_selected = page.get_by_role('checkbox', name='Select all selected details', exact=True)
            await expect(select_selected).to_be_disabled()
            await expect(select_selected).not_to_be_checked()
            await expect(select_all).to_be_enabled()
            await expect(select_all).not_to_be_checked()
            await select_all.check()
            await expect(page.locator('#results input[data-mark]:checked')).to_have_count(131)
            await expect(page.locator('#available-mark-count')).to_have_text('131')
            assert await selected_ids(page) == []
            await expect(page.locator('#download-word')).to_be_enabled()
            await select_all.uncheck()
            await expect(page.locator('#available-mark-count')).to_have_text('0')
            await page.locator('#search').fill('5401')
            await select_all.focus()
            await page.keyboard.press('Space')
            await expect(page.locator('#available-mark-count')).to_have_text('1')
            await page.locator('#search').fill('')
            await expect(select_all).to_have_js_property('indeterminate', True)
            await select_all.check()
            await expect(select_all).to_have_js_property('indeterminate', False)
            await expect(page.locator('#available-mark-count')).to_have_text('131')
            await select_all.uncheck()
            await page.locator('#search').fill('no-such-typical')
            await expect(select_all).to_be_disabled()
            await expect(select_all).not_to_be_checked()
            await page.locator('#reset-filters').click()
            await mark('available', '110-TR-NFW-2L').check()
            await mark('available', '123-NFW-1LC-(R)').check()
            await expect(select_all).to_have_js_property('indeterminate', True)
            await expect(page.locator('#selected-count')).to_have_text('5')
            await expect(page.locator('#available-mark-count')).to_have_text('2')
            await page.locator('#move-right').click()
            assert await selected_ids(page) == ['110-TR-NFW-2L', '123-NFW-1LC-(R)']
            assert await report_ids(page) == ALWAYS_IDS + ['110-TR-NFW-2L', '123-NFW-1LC-(R)']
            await expect(page.locator('#available-count')).to_have_text('129')
            await expect(page.locator('[data-typical="110-TR-NFW-2L"]')).to_have_count(0)
            await expect(page.locator('#automatic-list input[data-mark], #automatic-list button[data-toggle]')).to_have_count(0)
            await expect(page.locator('#automatic-list button[data-preview]')).to_have_count(5)
            await expect(select_selected).to_be_enabled()
            await select_selected.check()
            await expect(page.locator('#selected-list input[data-mark]:checked')).to_have_count(2)
            await expect(page.locator('#selected-mark-count')).to_have_text('2')
            assert await report_ids(page) == ALWAYS_IDS + ['110-TR-NFW-2L', '123-NFW-1LC-(R)']
            await mark('selected', '110-TR-NFW-2L').uncheck()
            await expect(select_selected).to_have_js_property('indeterminate', True)
            await select_selected.check()
            await expect(select_selected).to_have_js_property('indeterminate', False)
            await select_selected.focus()
            await page.keyboard.press('Space')
            await expect(page.locator('#selected-mark-count')).to_have_text('0')
            await expect(page.locator('#move-left')).to_be_disabled()
            await expect(page.locator('#move-right')).to_be_disabled()
            await expect(select_all).not_to_be_checked()
            await expect(select_all).to_have_js_property('indeterminate', False)
            for identifier in ALWAYS_IDS:
                await expect(page.locator(f'[data-typical="{identifier}"]')).to_have_count(0)
            await expect(page.locator('[data-selected="110-TR-NFW-2L"]')).to_contain_text('View PDF')
            await page.locator('#available-pane').evaluate('el => el.scrollTop = 700')
            assert await page.locator('#selected-pane').evaluate('el => el.scrollTop') == 0
            await page.locator('#search').fill('5401')
            assert await selected_ids(page) == ['110-TR-NFW-2L', '123-NFW-1LC-(R)']
            await select_selected.check()
            await page.locator('#search').fill('no-such-typical')
            await expect(select_selected).to_be_checked()
            await expect(page.locator('#selected-mark-count')).to_have_text('2')
            await page.locator('#search').fill('5401')
            await select_selected.uncheck()
            await mark('selected', '110-TR-NFW-2L').check()
            await page.locator('#move-left').click()
            assert await selected_ids(page) == ['123-NFW-1LC-(R)']
            await expect(page.locator('[data-typical="110-TR-NFW-2L"]')).to_have_count(0)
            await page.locator('#reset-filters').click()
            await expect(page.locator('[data-typical="110-TR-NFW-2L"]')).to_have_count(1)
            await mark('available', '110-TR-NFW-2L').focus()
            await page.keyboard.press('Space')
            await expect(page.locator('#available-mark-count')).to_have_text('1')
            await page.locator('#search').fill('5401')
            await expect(page.locator('#available-mark-count')).to_have_text('0')
            await expect(page.locator('#move-right')).to_be_disabled()
            await page.get_by_role('button', name='Add 5401-S-SHL', exact=True).click()
            await page.get_by_role('button', name='Remove selected 5401-S-SHL', exact=True).click()
            await expect(page.locator('[data-typical="5401-S-SHL"]')).to_have_count(1)
            await page.locator('#project-name').fill('Two pane project')
            await select_selected.check()
            await page.reload()
            assert await selected_ids(page) == ['123-NFW-1LC-(R)']
            await expect(page.locator('input[data-filter="projectType"][value="Construction"]')).to_be_checked()
            await expect(page.locator('#project-name')).to_have_value('Two pane project')
            await expect(page.locator('input[data-mark]:checked')).to_have_count(0)
            await expect(select_selected).not_to_be_checked()
            await page.locator('#select-all-selected').check()
            await page.locator('#move-left').click()
            await expect(page.locator('#automatic-details')).to_be_visible()
            await expect(page.locator('#available-count')).to_have_text('80')
            await expect(select_selected).to_be_disabled()
            await expect(select_selected).not_to_be_checked()
            await expect(select_selected).to_have_js_property('indeterminate', False)
            await expect(page.locator('#project-name')).to_have_value('Two pane project')
            await page.reload()
            assert await selected_ids(page) == []
            await expect(page.locator('#download-word')).to_be_enabled()
            print(f'PASS: {prefix or "root"} layout, marked/single transfers, automatic typicals, filter persistence, keyboard marks and independent scrolling', flush=True)

        for field, value in [('projectType', 'Construction'), ('mdotCode', 'FW'), ('workTask', 'Close the right lane')]:
            control = page.locator(f'input[data-filter="{field}"][value="{value}"]')
            await control.evaluate('el => el.closest("details").open = true')
            await control.check()
        await page.locator('#select-all-matches').check()
        await expect(mark('available', '205-FW-1LC-(R)-SHIFT')).not_to_be_checked()
        await page.locator('#move-right').click()
        assert '205-FW-1LC-(R)-SHIFT' not in await selected_ids(page)
        await page.locator('#select-all-selected').check()
        await page.locator('#move-left').click()
        await page.locator('#possible-matches > summary').click()
        await mark('available', '205-FW-1LC-(R)-SHIFT').check()
        await page.locator('#select-all-matches').check()
        await page.locator('#select-all-matches').uncheck()
        await expect(mark('available', '205-FW-1LC-(R)-SHIFT')).to_be_checked()
        await page.locator('#move-right').click()
        assert await selected_ids(page) == ['205-FW-1LC-(R)-SHIFT']
        await expect(page.locator('#possible-results [data-typical="205-FW-1LC-(R)-SHIFT"]')).to_have_count(0)
        await mark('selected', '205-FW-1LC-(R)-SHIFT').check()
        await page.locator('#move-left').click()
        await expect(page.locator('#possible-results [data-typical="205-FW-1LC-(R)-SHIFT"]')).to_have_count(1)
        await page.locator('#reset-filters').click()
        print('PASS: bulk matching excludes possible matches; explicit marked transfers include them', flush=True)

        await page.locator('#search').fill('4400')
        await page.get_by_role('button', name='Add 4400-M-NFW-SHL-MOB', exact=True).click()
        await page.locator('#search').fill('124-NFW-2(R+L)LC-SHIFT')
        await page.get_by_role('button', name='Add 124-NFW-2(R+L)LC-SHIFT', exact=True).click()
        await expect(page.locator('[data-selected="4400-M-NFW-SHL-MOB"] > article > .ttc-conditions')).to_contain_text('Adequate Sight Distances')
        await expect(page.locator('#paint-warning')).to_contain_text('Paint required:')
        await page.locator('#search').fill('lane closure')
        await page.locator('#available-pane').evaluate('el => el.scrollTop = 0')
        await page.locator('#selected-pane').evaluate('el => el.scrollTop = 0')
        await page.locator('.ttc-transfer-workspace').scroll_into_view_if_needed()
        await page.screenshot(path=str(OUTPUT / 'transfer-desktop.png'), full_page=True)
        for width in [390, 320]:
            await page.set_viewport_size({'width': width, 'height': 844})
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            left = await page.locator('.ttc-available-pane').bounding_box()
            right = await page.locator('.ttc-selected-pane').bounding_box()
            assert left['y'] + left['height'] < right['y']
            await page.locator('.ttc-transfer-controls').scroll_into_view_if_needed()
            await page.screenshot(path=str(OUTPUT / f'transfer-mobile-panes-{width}.png'))
            await page.locator('.ttc-mobile-jump').click()
            await expect(page.locator('#download-pdf')).to_be_in_viewport()
            await page.screenshot(path=str(OUTPUT / f'transfer-mobile-{width}.png'))
            await page.locator('.ttc-mobile-back').click()
            await expect(page.locator('#search')).to_be_in_viewport()
        await page.set_viewport_size({'width': 1440, 'height': 1050})
        ids = await report_ids(page)
        inspect_word(await save_download(page, '#download-word', 'transfer-selection.docx'), ids)
        archive = await save_download(page, '#download-zip', 'transfer-selection.zip')
        with ZipFile(archive) as zipped:
            assert zipped.namelist() == [identifier + '.pdf' for identifier in ids]
            for identifier in ids:
                assert zipped.read(identifier + '.pdf') == (TOOL / RECORDS[identifier]['pdf']['path']).read_bytes()
        packet = PdfReader(await save_download(page, '#download-pdf', 'transfer-selection.pdf'))
        detail_pages = sum(RECORDS[identifier]['pdf']['pages'] for identifier in ids)
        assert len(packet.pages) == detail_pages + 2
        assert 'Two pane project' in packet.pages[0].extract_text()
        index = packet.pages[1].extract_text()
        positions = [index.replace(' ', '').replace('\n', '').index(identifier) for identifier in ids]
        assert positions == sorted(positions)
        await page.locator('#new-project').click()
        await expect(page.locator('#selected-count')).to_have_text('5')
        await expect(page.locator('#available-count')).to_have_text('80')
        await expect(page.locator('#download-pdf')).to_be_enabled()
        assert not errors, errors
        print('PASS: card notes/flags, mobile navigation and overflow, Word/PDF/ZIP agreement, reset, no browser errors', flush=True)
        await browser.close()


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check(f'http://127.0.0.1:{server.server_port}'))
    finally:
        server.shutdown()
