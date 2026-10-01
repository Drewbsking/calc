"""Verify ProjectWise ZIP downloads with an independent ZIP reader.

Run: py -3.13 tests/mdot_ttc_zip_browser.py
"""
import asyncio
from functools import partial
from http.server import ThreadingHTTPServer
import threading
from zipfile import ZipFile

from playwright.async_api import async_playwright, expect

from mdot_ttc_browser import (
    ALWAYS_IDS, Handler, OUTPUT, RECORDS, ROOT, TOOL,
    inspect_word, report_ids, save_download,
)


def inspect_zip(filename, ids):
    with ZipFile(filename) as archive:
        assert archive.namelist() == [identifier + '.pdf' for identifier in ids]
        assert archive.testzip() is None
        for identifier in ids:
            assert archive.read(identifier + '.pdf') == (TOOL / RECORDS[identifier]['pdf']['path']).read_bytes(), identifier


async def check(origin):
    OUTPUT.mkdir(exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        context = await browser.new_context(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
        page = await context.new_page()
        errors, downloads, requests = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('download', lambda download: downloads.append(download.suggested_filename))
        page.on('request', lambda request: requests.append(request.url))
        await page.goto(origin + '/calc/calculators/mdot-ttc/')
        await expect(page.locator('#match-count')).to_have_text('80 of 131 typicals match')
        await expect(page.locator('#download-zip')).to_be_enabled()
        await page.locator('#search').fill('110')
        await page.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
        ids = await report_ids(page)
        assert ids == ALWAYS_IDS + ['110-TR-NFW-2L']
        # ZIP works without a project name, even after PDF validation has shown an error.
        await page.locator('#download-pdf').click()
        await expect(page.locator('#export-status')).to_contain_text('Enter a project name')
        inspect_zip(await save_download(page, '#download-zip', 'unnamed-project.zip'), ids)
        assert downloads[-1] == 'mdot-ttc-details.zip'
        await expect(page.locator('#export-status')).to_contain_text('6 individual MDOT PDFs')
        inspect_word(await save_download(page, '#download-word', 'zip-selection.docx'), ids)
        print('PASS: ZIP and Word match, Always typicals included once, exact original bytes, optional project name', flush=True)

        # Capture the archive name and full report before asynchronous fetching begins.
        await page.locator('#project-name').fill('Maple / Road: Phase 1')
        gate = asyncio.Event()
        first_path = RECORDS[ids[0]]['pdf']['path'].split('/')[-1]
        async def delayed(route):
            await gate.wait()
            await route.continue_()
        await page.route('**/' + first_path, delayed)
        async with page.expect_download(timeout=45000) as pending:
            await page.locator('#download-zip').click()
            await expect(page.locator('#export-progress')).to_be_visible()
            await expect(page.locator('#export-status')).to_contain_text('Preparing 1 of 6')
            for name in ['download-zip', 'download-pdf', 'download-word']:
                await expect(page.locator('#' + name)).to_be_disabled()
            await page.locator('#select-all-selected').check()
            await page.locator('#move-left').click()
            await page.locator('#project-name').fill('Changed during export')
            gate.set()
        download = await pending.value
        assert download.suggested_filename == 'Maple - Road- Phase 1-mdot-ttc-details.zip'
        await download.save_as(OUTPUT / 'frozen-project.zip')
        await page.unroute('**/' + first_path, delayed)
        inspect_zip(OUTPUT / 'frozen-project.zip', ids)
        await expect(page.locator('#download-zip')).to_be_enabled()
        await expect(page.locator('#export-progress')).to_be_hidden()
        await page.reload()
        await expect(page.locator('#download-zip')).to_be_enabled()
        print('PASS: frozen selection and filename, progress, busy controls, persisted empty selection', flush=True)

        await page.locator('#new-project').click()
        await page.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
        broken_path = RECORDS['101-GEN-SPACING-CHARTS']['pdf']['path'].split('/')[-1]
        for status, body, expected in [(404, 'Missing file', 'HTTP 404'), (200, '%PDF-corrupt', 'integrity check')]:
            async def broken(route):
                await route.fulfill(status=status, content_type='application/pdf', body=body)
            await page.route('**/' + broken_path, broken)
            before = len(downloads)
            await page.locator('#download-zip').click()
            await expect(page.locator('#export-status')).to_contain_text('101-GEN-SPACING-CHARTS')
            await expect(page.locator('#export-status')).to_contain_text(expected)
            await expect(page.locator('#export-status')).to_contain_text('No ZIP was downloaded')
            await expect(page.locator('#retry-export')).to_have_text('Retry ZIP download')
            assert len(downloads) == before
            await page.unroute('**/' + broken_path, broken)
            inspect_zip(await save_download(page, '#retry-export', f'retry-zip-{status}.zip'), ids)
            await expect(page.locator('#retry-export')).to_be_hidden()
        # Shared retry controls still identify and retry a failed combined PDF.
        await page.locator('#project-name').fill('Maple Road')
        await page.route('**/' + broken_path, lambda route: route.fulfill(status=404, body='Missing'))
        await page.locator('#download-pdf').click()
        await expect(page.locator('#retry-export')).to_have_text('Retry PDF download')
        await page.unroute('**/' + broken_path)
        await save_download(page, '#retry-export', 'zip-test-retried-pdf.pdf')
        assert downloads[-1].endswith('.pdf')
        print('PASS: missing/corrupt files abort without partial ZIP; retry produces the correct format', flush=True)

        await page.locator('#reset-filters').click()
        await page.locator('#select-all-matches').check()
        await page.locator('#move-right').click()
        await expect(page.locator('#selected-count')).to_have_text('136')
        all_ids = await report_ids(page)
        assert len(all_ids) == len(RECORDS) == 136
        inspect_zip(await save_download(page, '#download-zip', 'all-136-typicals.zip'), all_ids)
        await expect(page.locator('#export-status')).to_contain_text('136 individual MDOT PDFs')
        print('PASS: full library ZIP contains all 136 originals with official filenames and no duplicates', flush=True)

        await page.locator('#new-project').click()
        await page.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
        await page.locator('#project-name').fill('Maple Road')
        await page.locator('#download-zip').scroll_into_view_if_needed()
        await page.screenshot(path=str(OUTPUT / 'zip-desktop.png'))
        for width in [390, 320]:
            await page.set_viewport_size({'width': width, 'height': 844})
            await page.locator('.ttc-mobile-jump').click()
            await page.locator('#download-zip').scroll_into_view_if_needed()
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            await page.screenshot(path=str(OUTPUT / f'zip-mobile-{width}.png'))
        assert all(url.startswith(origin + '/') for url in requests), requests
        await context.close()

        # Check the same local library and PDF paths without the /calc/ prefix.
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        await page.goto(origin + '/calculators/mdot-ttc/')
        await expect(page.locator('#match-count')).to_have_text('80 of 131 typicals match')
        await page.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
        inspect_zip(await save_download(page, '#download-zip', 'root-project.zip'), ids)
        assert not errors, errors
        await context.close()
        await browser.close()
        print('PASS: mobile layout, root and /calc/ hosting, no runtime external requests or browser errors', flush=True)
        print(f'QA artifacts: {OUTPUT}', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check(f'http://127.0.0.1:{server.server_port}'))
    finally:
        server.shutdown()
