"""Exercise the real static tool and inspect its downloaded files.

Run: py -3.13 tests/mdot_ttc_browser.py
Requires playwright (Chromium installed) and pypdf. QA artifacts go to system temp.
"""
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import re
from pathlib import Path
import tempfile
import threading
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from playwright.async_api import async_playwright, expect
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / 'calculators' / 'mdot-ttc'
OUTPUT = Path(tempfile.gettempdir()) / 'calc-mdot-ttc-qa'
CATALOG = json.loads((TOOL / 'catalog.json').read_text(encoding='utf-8'))
RECORDS = {r['id']: r for r in CATALOG['records']}
ALWAYS_IDS = ['100-GEN-KEY', '101-GEN-SPACING-CHARTS', '102-GEN-NOTES', '103-GEN-SIGN', '104-GEN-AB']


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def translate_path(self, path):
        if path.startswith('/calc/'):
            path = path[len('/calc'):]
        return super().translate_path(path)


def inspect_word(filename, ids):
    n = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    with ZipFile(filename) as archive:
        doc = ET.fromstring(archive.read('word/document.xml'))
    table = doc.find('.//w:tbl', n)
    rows = table.findall('w:tr', n)
    actual = [[''.join(cell.itertext()) for cell in row.findall('w:tc', n)] for row in rows]
    assert actual == [['Typical Number', 'Title']] + [[i, RECORDS[i]['title']] for i in ids], actual
    assert rows[0].find('w:trPr/w:tblHeader', n) is not None
    assert all(row.find('w:trPr/w:cantSplit', n) is not None for row in rows)
    widths = [int(c.get('{' + n['w'] + '}w')) for c in table.findall('w:tblGrid/w:gridCol', n)]
    assert widths == [3300, 6420], widths


def inspect_pdf(filename, ids, project_name='Maple Road resurfacing'):
    combined = PdfReader(filename)
    total = len(combined.pages)
    first_detail = total - sum(RECORDS[i]['pdf']['pages'] for i in ids)
    assert first_detail >= 2
    cover = combined.pages[0].extract_text()
    assert project_name in ' '.join(cover.split()), cover
    assert 'Maintaining Traffic' in cover and 'Typicals' in cover
    index_text = ''
    destinations = []
    for index, page in enumerate(combined.pages[:first_detail]):
        text = page.extract_text()
        assert text.strip().endswith(f'Page {index + 1} of {total}')
        if index:
            assert 'Index' in text and 'Typical number' in text and 'Pages' in text
            index_text += text
            destinations.extend(annotation.get_object()['/Dest'][0].idnum for annotation in page['/Annots'])
    assert len(destinations) == len(ids)
    index = first_detail
    for row, identifier in enumerate(ids):
        assert identifier in re.sub(r'\s+', '', index_text), identifier
        assert destinations[row] == combined.pages[index].indirect_reference.idnum, identifier
        end = index + RECORDS[identifier]['pdf']['pages']
        page_range = str(index + 1) if end == index + 1 else f'{index + 1}-{end}'
        assert page_range in index_text, (identifier, page_range)
        original = PdfReader(TOOL / RECORDS[identifier]['pdf']['path'])
        for source in original.pages:
            page = combined.pages[index]
            assert list(page.mediabox) == list(source.mediabox), identifier
            assert list(page.cropbox) == list(source.cropbox), identifier
            assert page.rotation == source.rotation, identifier
            # Independent text extraction checks actual page identity and ordering.
            text = page.extract_text().strip()
            footer = f'Page {index + 1} of {total}'
            assert text.endswith(footer), (identifier, index)
            assert text[:-len(footer)].strip() == source.extract_text().strip(), (identifier, index)
            index += 1


async def save_download(page, control, filename):
    async with page.expect_download(timeout=45000) as pending:
        await page.locator(control).click()
    download = await pending.value
    await download.save_as(OUTPUT / filename)
    return OUTPUT / filename


async def selected_ids(page):
    return await page.locator('#selected-list > li').evaluate_all('els => els.map(el => el.dataset.selected)')


async def report_ids(page):
    return await page.locator('#selected-list > li, #automatic-list > li').evaluate_all('''els =>
      els.map(el => el.dataset.selected || el.dataset.automatic)
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))''')


async def reset_project_for_catalog_checks(page):
    await page.locator('#new-project').click()
    await expect(page.locator('input[data-filter="projectType"][value="Construction"]')).to_be_checked()
    await expect(page.locator('#filters input:checked')).to_have_count(1)
    await expect(page.locator('#match-count')).to_have_text('80 of 131 typicals match')
    await page.locator('#reset-filters').click()


async def check_always_sheets(page):
    await expect(page.locator('input[data-filter="rcoc"]')).to_have_count(0)
    await expect(page.locator('#filters .ttc-filter')).to_have_count(4)
    await expect(page.locator('#automatic-details')).to_be_visible()
    await expect(page.locator('#automatic-details')).to_have_js_property('open', False)
    await expect(page.locator('#selected-count')).to_have_text('5')
    assert await report_ids(page) == ALWAYS_IDS
    for identifier in ALWAYS_IDS:
        await expect(page.locator(f'[data-typical="{identifier}"]')).to_have_count(0)
    await expect(page.locator('#automatic-list input, #automatic-list button[data-toggle]')).to_have_count(0)
    await expect(page.locator('#automatic-list button[data-preview]')).to_have_count(5)
    # The permanent defaults are a complete, exportable starting report.
    await page.locator('#project-name').fill('Required typicals only')
    inspect_word(await save_download(page, '#download-word', 'required-only.docx'), ALWAYS_IDS)
    inspect_pdf(await save_download(page, '#download-pdf', 'required-only.pdf'), ALWAYS_IDS, 'Required typicals only')
    with ZipFile(await save_download(page, '#download-zip', 'required-only.zip')) as archive:
        assert archive.namelist() == [identifier + '.pdf' for identifier in ALWAYS_IDS]
        for identifier in ALWAYS_IDS:
            assert archive.read(identifier + '.pdf') == (TOOL / RECORDS[identifier]['pdf']['path']).read_bytes()
    for identifier in ['110-TR-NFW-2L', '4110B-M-TR-NFW-2L', '5000-S-SHL-OUT']:
        await page.locator('#reset-filters').click()
        await page.locator('#search').fill(identifier)
        await page.locator(f'[data-typical="{identifier}"]').get_by_role('button', name='Add ' + identifier, exact=True).click()
        await expect(page.locator('#selected-count')).to_have_text('6')
        assert await report_ids(page) == ALWAYS_IDS + [identifier]
        saved = await page.evaluate("JSON.parse(localStorage.getItem('mdot-ttc-project-v1')).ids")
        assert saved == [identifier], saved
        await page.reload()
        assert await report_ids(page) == ALWAYS_IDS + [identifier]
        await expect(page.locator('#automatic-details')).to_have_js_property('open', False)
        await page.get_by_role('button', name='Remove selected ' + identifier, exact=True).click()
        assert await report_ids(page) == ALWAYS_IDS
        await expect(page.locator('#selected-count')).to_have_text('5')
    # Earlier saved projects may have manually selected one of today's required typicals.
    await page.evaluate("localStorage.setItem('mdot-ttc-project-v1', JSON.stringify({version: 1, ids: ['100-GEN-KEY', '101-GEN-SPACING-CHARTS', '110-TR-NFW-2L'], projectName: 'Existing project'}))")
    await page.reload()
    assert await selected_ids(page) == ['110-TR-NFW-2L']
    assert await report_ids(page) == ALWAYS_IDS + ['110-TR-NFW-2L']
    await expect(page.locator('#storage-status')).not_to_contain_text('no longer available')
    await page.locator('#select-all-selected').check()
    await page.locator('#move-left').click()
    assert await report_ids(page) == ALWAYS_IDS
    await page.locator('#automatic-details > summary').click()
    await page.locator('#new-project').click()
    await expect(page.locator('#automatic-details')).to_have_js_property('open', False)
    assert await report_ids(page) == ALWAYS_IDS
    await expect(page.locator('#download-pdf')).to_be_enabled()
    await page.locator('#reset-filters').click()
    print('PASS: required defaults, three exports with only required typicals, no removal, saved-project migration and collapsed reset', flush=True)


async def check_general_roadways(page):
    await page.locator('#reset-filters').click()
    await expect(page.locator('input[data-filter="roadwayType"]')).to_have_count(0)
    await expect(page.locator('#results > article')).to_have_count(131)
    for identifier in ALWAYS_IDS:
        await expect(page.locator(f'[data-typical="{identifier}"]')).to_have_count(0)
        await expect(page.locator(f'[data-automatic="{identifier}"] [data-filter-field="roadwayType"]')).to_have_text('Roadway type: All roadway types')
    await page.locator('#search').fill('101 spacing')
    await expect(page.locator('#results > article')).to_have_count(0)
    assert await report_ids(page) == ALWAYS_IDS
    await page.locator('#reset-filters').click()
    await expect(page.locator('#selected-count')).to_have_text('5')
    print('PASS: required typicals retain all-roadway tags without a roadway filter and remain excluded from browsing', flush=True)


async def check_roadway_types(page):
    await page.locator('#reset-filters').click()
    await expect(page.locator('input[data-filter="roadwayType"]')).to_have_count(0)
    for identifier, roadways in [
        ('123-NFW-1LC-(R)', ['Undivided']),
        ('203-FW-1LC-(R)', ['Divided', 'Freeway']),
        ('5401-S-SHL', ['Divided', 'Freeway', 'Undivided']),
        ('5000-S-SHL-OUT', ['Unspecified']),
        ('105-GEN-SPEED-FW', ['Unspecified']),
    ]:
        tags = page.locator(f'#results > article[data-record="{identifier}"] [data-filter-field="roadwayType"]')
        assert sorted(await tags.all_text_contents()) == ['Roadway type: ' + value for value in roadways]
    survey = page.locator('input[data-filter="projectType"][value="Survey"]')
    await survey.evaluate('el => el.closest("details").open = true')
    await survey.check()
    await expect(page.locator('#results > article')).to_have_count(16)
    await page.locator('#search').fill('5401 undivided')
    await expect(page.locator('#results > article')).to_have_count(1)
    await page.get_by_role('button', name='Add 5401-S-SHL', exact=True).click()
    await expect(page.locator('[data-typical="5401-S-SHL"]')).to_have_count(0)
    await expect(page.locator('[data-selected="5401-S-SHL"]')).to_have_count(1)
    await expect(page.locator('[data-selected="5401-S-SHL"] [data-filter-field="roadwayType"]')).to_have_count(3)
    assert await report_ids(page) == ALWAYS_IDS + ['5401-S-SHL']
    await page.locator('#reset-filters').click()
    maintenance = page.locator('input[data-filter="projectType"][value="Highway Maintenance"]')
    await maintenance.evaluate('el => el.closest("details").open = true')
    await maintenance.check()
    await expect(page.locator('#results > article')).to_have_count(32)
    for number in ['4110A', '4110B', '4111A', '4111B', '4121', '4122', '4180', '4401', '4405']:
        await expect(page.locator(f'#results > article[data-typical^="{number}-"] [data-filter-field="roadwayType"]')).to_have_text('Roadway type: Undivided')
    await page.reload()
    await expect(page.locator('#selected-count')).to_have_text('6')
    assert await report_ids(page) == ALWAYS_IDS + ['5401-S-SHL']
    await reset_project_for_catalog_checks(page)
    print('PASS: roadway tags, shared/unspecified applicability, search, category counts and saved selections without a roadway filter', flush=True)


async def check_paint_flags(page):
    await expect(page.locator('input[data-filter="paint"]')).to_have_count(0)
    await expect(page.locator('#filters .ttc-filter')).to_have_count(4)
    warning = page.locator('#paint-warning')
    await expect(warning).to_be_hidden()
    for number, identifier, label in [
        ('124', '124-NFW-2(R+L)LC-SHIFT', 'Paint required'),
        ('132', '132-CLT-1(R)LC-SHIFT', 'Paint may be required'),
    ]:
        await page.locator('#search').fill(number)
        await expect(page.locator('#results .ttc-paint-flag')).to_have_text(label)
        await page.get_by_role('button', name='Add ' + identifier, exact=True).click()
        await expect(page.locator(f'li[data-selected="{identifier}"] .ttc-paint-flag')).to_have_text(label)
    await expect(warning).to_contain_text('Paint required: include paint quantities for 1 selected typical.')
    await expect(warning).to_contain_text('Paint may be required for 1 selected typical.')
    await expect(page.locator('li[data-selected="132-CLT-1(R)LC-SHIFT"]')).to_contain_text('Paint required if left overnight.')
    await page.locator('#search').fill('100')
    await expect(warning).to_be_visible()
    await page.reload()
    await expect(page.locator('#selected-list .ttc-paint-flag')).to_have_count(2)
    await expect(warning).to_contain_text('Paint required:')
    await expect(warning).to_contain_text('Paint may be required')
    await page.get_by_role('button', name='Remove selected 124-NFW-2(R+L)LC-SHIFT', exact=True).click()
    await expect(warning).not_to_contain_text('Paint required:')
    await expect(warning).to_contain_text('Paint may be required')
    await page.get_by_role('button', name='Remove selected 132-CLT-1(R)LC-SHIFT', exact=True).click()
    await expect(warning).to_be_hidden()
    await page.locator('#reset-filters').click()
    await page.locator('#select-all-matches').check()
    await page.locator('#move-right').click()
    await expect(warning).to_contain_text('paint quantities for 3 selected typicals')
    await expect(warning).to_contain_text('Paint may be required for 4 selected typicals')
    await expect(page.locator('#selected-list .ttc-paint-flag')).to_have_count(7)
    await page.locator('#select-all-selected').check()
    await page.locator('#move-left').click()
    await expect(warning).to_be_hidden()
    await page.locator('#select-all-matches').check()
    await page.locator('#move-right').click()
    await reset_project_for_catalog_checks(page)
    await expect(warning).to_be_hidden()
    await expect(page.locator('#selected-count')).to_have_text('5')
    await expect(page.locator('#match-count')).to_have_text('131 of 131 typicals match')
    print('PASS: paint flags, conditional notes, selection warnings, persistence, filter changes, removal and reset', flush=True)


async def check_catalog_coverage(page):
    await expect(page.locator('#catalog-status')).to_contain_text('80 construction · 32 highway maintenance · 8 notes · 16 survey')
    await page.locator('#reset-filters').click()
    await expect(page.locator('#results > article')).to_have_count(131)
    for label, count in [('Construction', 80), ('Highway Maintenance', 32), ('Notes', 3), ('Survey', 16)]:
        control = page.locator(f'input[data-filter="projectType"][value="{label}"]')
        await control.evaluate('el => { for (let group = el.closest("details"); group; group = group.parentElement.closest("details")) group.open = true; }')
        await control.check()
        await expect(page.locator('#results > article')).to_have_count(count)
        if label == 'Survey':
            await expect(page.locator('[data-typical="5000-S-SHL-OUT"] .ttc-workbook-tag')).to_have_text('Workbook classifications: Unspecified')
            await page.get_by_role('button', name='Add 5000-S-SHL-OUT', exact=True).click()
        await control.uncheck()
    await page.locator('#search').fill('302')
    await expect(page.locator('#results h3')).to_have_text('Concrete Patch - 1 Lane Closure')
    await page.get_by_role('button', name='Add 302-SP-PATCH-1LC', exact=True).click()
    await page.reload()
    await expect(page.locator('#selected-count')).to_have_text('7')
    await expect(page.locator('li[data-selected="5000-S-SHL-OUT"]')).to_have_count(1)
    await expect(page.locator('li[data-selected="302-SP-PATCH-1LC"]')).to_have_count(1)
    await expect(page.locator('#paint-warning')).to_be_hidden()
    await reset_project_for_catalog_checks(page)
    print('PASS: complete construction/maintenance/survey coverage, unclassified additions and saved selections', flush=True)


async def check_filter_counts(page):
    original_selection = await selected_ids(page)

    def choice(field, value):
        return page.locator(f'input[data-filter="{field}"][value="{value}"]')

    async def count(field, value, expected):
        control = choice(field, value)
        await expect(control.locator('..').locator('.ttc-filter-count')).to_have_text(f'({expected})')
        await expect(control).to_have_attribute('aria-label', f'{value}, {expected} matching {"typical" if expected == 1 else "typicals"}')

    await count('projectType', 'Survey', 16)
    await page.locator('#reset-filters').click()
    for value, expected in [('Construction', 80), ('Highway Maintenance', 32), ('Notes', 3), ('Survey', 16)]:
        await count('projectType', value, expected)
    survey = choice('projectType', 'Survey')
    await survey.evaluate('el => { for (let group = el.closest("details"); group; group = group.parentElement.closest("details")) group.open = true; }')
    await survey.check()
    await expect(survey).to_be_focused()
    await expect(survey).to_have_accessible_name('Survey, 16 matching typicals')
    await expect(page.locator('.ttc-filter').filter(has=survey)).to_have_attribute('open', '')
    await count('projectType', 'Construction', 80)
    await count('workTask', 'Ramp work / closures', 0)
    await count('workTask', 'Close the right lane', 0)
    await expect(page.locator('#results > article')).to_have_count(16)

    maintenance = choice('projectType', 'Highway Maintenance')
    await maintenance.check()
    await expect(page.locator('#results > article')).to_have_count(48)
    await count('projectType', 'Survey', 16)
    await page.locator('#search').fill('5000')
    await count('projectType', 'Survey', 1)
    await count('projectType', 'Highway Maintenance', 0)
    await expect(page.locator('#results > article')).to_have_count(1)

    ramp = choice('workTask', 'Ramp work / closures')
    await ramp.evaluate('el => el.closest("details").open = true')
    await ramp.check()
    await expect(page.locator('#empty-results')).to_be_visible()
    await count('projectType', 'Survey', 0)
    await count('workTask', 'Shoulder / roadside work', 1)
    await expect(ramp).to_be_checked()
    await expect(ramp).to_be_enabled()
    await ramp.uncheck()
    await expect(page.locator('#results > article')).to_have_count(1)
    await page.locator('#search').fill('nonexistent-typical')
    assert all(text == '(0)' for text in await page.locator('.ttc-filter-count').all_text_contents())
    await page.locator('#search').fill('')
    await count('projectType', 'Survey', 16)
    await page.locator('#reset-filters').click()
    await expect(page.locator('#match-count')).to_have_text('131 of 131 typicals match')
    await count('projectType', 'Survey', 16)
    await page.locator('#reset-filters').click()
    await count('projectType', 'Survey', 16)
    assert await selected_ids(page) == original_selection
    await reset_project_for_catalog_checks(page)
    await count('projectType', 'Survey', 16)
    print('PASS: live option counts, search, combined/multiple filters, zero counts, focus and resets', flush=True)


async def check_categories(page):
    await expect(page.locator('input[data-filter="controlType"]')).to_have_count(0)
    await expect(page.locator('input[data-filter="controlMethod"][value="Crossover"]')).to_have_count(0)
    await expect(page.locator('input[data-filter="roadwayType"]')).to_have_count(0)
    crossover = page.locator('input[data-filter="workTask"][value="Crossing / crossover work"]')
    await page.locator('#search').fill('crossover closure')
    await crossover.evaluate('el => { for (let group = el.closest("details"); group; group = group.parentElement.closest("details")) group.open = true; }')
    await expect(crossover.locator('..').locator('.ttc-filter-count')).to_have_text('(3)')
    await crossover.check()
    await expect(page.locator('#results > article')).to_have_count(3)
    await expect(page.locator('[data-typical="311-SP-CROSS-C-FW-(1)"] .ttc-tags')).to_contain_text('Work activity: Crossing / crossover work')
    await expect(page.locator('[data-typical="311-SP-CROSS-C-FW-(1)"] .ttc-tags')).not_to_contain_text('Arrangement:')
    await expect(page.locator('[data-typical="311-SP-CROSS-C-FW-(1)"] [data-workbook-field="controlType"]')).to_have_count(0)
    await expect(page.locator('[data-typical="311-SP-CROSS-C-FW-(1)"]')).not_to_contain_text('Crush and Shape')
    await page.locator('#search').fill('310 crossover')
    await expect(page.locator('#results > article')).to_have_count(1)
    await page.get_by_role('button', name='Add 310-SP-CROSS-C-NFW', exact=True).click()
    assert await report_ids(page) == ALWAYS_IDS + ['310-SP-CROSS-C-NFW']
    await page.locator('#reset-filters').click()
    await expect(page.locator('#selected-count')).to_have_text('6')
    await page.locator('#search').fill('traffic regulator')
    await expect(page.locator('#results > article')).to_have_count(12)
    await expect(page.locator('[data-typical="111-TR-NFW-2L-RUM"] .ttc-tags')).to_contain_text('Control: Traffic regulator')
    await page.locator('#reset-filters').click()
    await page.locator('#search').fill('205-FW-1LC-(R)-SHIFT')
    await expect(page.locator('#results > article')).to_have_count(1)
    await expect(page.locator('#results .ttc-tags')).to_contain_text('Work activity: Shift traffic')
    await expect(page.locator('#results .ttc-tags')).to_contain_text('Work activity: Lane closure — side unspecified')
    await expect(page.locator('#results .ttc-tags')).not_to_contain_text('Arrangement:')
    await reset_project_for_catalog_checks(page)
    print('PASS: roadway and work activity tags, source values, overlapping options and Always inclusion', flush=True)


async def check_notes_category(page):
    await page.locator('#new-project').click()
    construction = page.locator('input[data-filter="projectType"][value="Construction"]')
    notes = page.locator('input[data-filter="projectType"][value="Notes"]')
    await expect(construction).to_be_checked()
    await expect(notes).not_to_be_checked()
    await expect(page.locator('#available-count')).to_have_text('80')
    await expect(notes).to_have_accessible_name('Notes, 3 matching typicals')
    await expect(page.locator('#results [data-filter-field="mdotCode"][data-filter-value="GEN"]')).to_have_count(0)
    for identifier in ALWAYS_IDS:
        await expect(page.locator(f'[data-automatic="{identifier}"] [data-filter-field="projectType"]')).to_have_text('Typical category: Notes')
    await notes.check()
    await expect(page.locator('#available-count')).to_have_text('83')
    await construction.uncheck()
    await expect(page.locator('#available-count')).to_have_text('3')
    identifiers = ['105-GEN-SPEED-FW', '106-GEN-SPEED-NFW', '107-GEN-SPEED']
    assert await page.locator('#results > article').evaluate_all('els => els.map(el => el.dataset.record)') == identifiers
    for card in await page.locator('#results > article').all():
        await expect(card.locator('[data-filter-field="projectType"]')).to_have_text('Typical category: Notes')
        await expect(card.locator('.ttc-workbook-source, .ttc-note')).to_have_count(0)
    code = page.locator('input[data-filter="mdotCode"][value="GEN"]')
    await code.evaluate('el => el.closest("details").open = true')
    await code.check()
    await expect(page.locator('#available-count')).to_have_text('3')
    await page.locator('#select-all-matches').check()
    await page.locator('#move-right').click()
    assert await report_ids(page) == ALWAYS_IDS + identifiers
    await expect(notes).to_have_accessible_name('Notes, 3 matching typicals')
    inspect_word(await save_download(page, '#download-word', 'notes-category.docx'), ALWAYS_IDS + identifiers)
    await page.locator('#reset-filters').click()
    await expect(page.locator('#available-count')).to_have_text('128')
    await page.reload()
    await expect(page.locator('#selected-count')).to_have_text('8')
    assert await report_ids(page) == ALWAYS_IDS + identifiers
    await expect(page.locator('#selected-list [data-filter-field="projectType"][data-filter-value="Notes"]')).to_have_count(3)
    await reset_project_for_catalog_checks(page)
    print('PASS: GEN Notes category, counts, default exclusion, retained Always typicals, matching tags, category combinations, Word export and saved selections', flush=True)


async def check_typical_series(page):
    await page.locator('#new-project').click()
    groups = page.locator('#primary-filters .ttc-filter-options')
    assert await groups.evaluate_all('els => els.map(el => el.getAttribute("aria-label"))') == ['Typical category', 'Typical series', 'MDOT code', 'Work activity']
    choices = page.locator('input[data-filter="typicalSeries"]')
    assert await choices.evaluate_all('els => els.map(el => el.value)') == ['100', '110', '120', '130', '140', '150', '160', '200', '210', '220', '230', '300', '310', '320', '340', '350', '360', '380', '4000', '5000']
    await expect(page.locator('input[data-filter="typicalSeries"]:checked')).to_have_count(0)

    def series(value):
        return page.locator(f'input[data-filter="typicalSeries"][value="{value}"]')

    async def choose(field, value):
        control = page.locator(f'input[data-filter="{field}"][value="{value}"]')
        await control.evaluate('el => el.closest("details").open = true')
        await control.check()
        return control

    await choose('typicalSeries', '160')
    await expect(series('160')).to_have_accessible_name('160 — Signal work, 5 matching typicals')
    await expect(series('4000').locator('..').locator('.ttc-filter-count')).to_have_text('(0)')
    await expect(series('4000')).to_be_enabled()
    await expect(page.locator('#results > article')).to_have_count(5)
    await page.get_by_role('button', name='Add 160-INT-LD-CLT-MID', exact=True).click()
    assert await report_ids(page) == ALWAYS_IDS + ['160-INT-LD-CLT-MID']
    await expect(series('160').locator('..').locator('.ttc-filter-count')).to_have_text('(5)')
    await choose('typicalSeries', '220')
    await expect(page.locator('#results > article')).to_have_count(10)
    await choose('mdotCode', 'INT')
    await expect(page.locator('#results > article')).to_have_count(4)
    await page.locator('#search').fill('161')
    await expect(page.locator('#results > article')).to_have_count(1)
    await expect(series('160').locator('..').locator('.ttc-filter-count')).to_have_text('(1)')
    await expect(series('220').locator('..').locator('.ttc-filter-count')).to_have_text('(0)')
    await page.locator('#reset-filters').click()
    await expect(page.locator('#filters input:checked')).to_have_count(0)
    await expect(page.locator('#selected-count')).to_have_text('6')
    await choose('typicalSeries', '100')
    assert await page.locator('#results > article').evaluate_all('els => els.map(el => el.dataset.record)') == ['105-GEN-SPEED-FW', '106-GEN-SPEED-NFW', '107-GEN-SPEED']
    await page.locator('#reset-filters').click()
    await choose('typicalSeries', '4000')
    await expect(page.locator('#results > article')).to_have_count(32)
    for identifier in ['4110A-M-TR-NFW-2L', '4110B-M-TR-NFW-2L', '4221-FW-EnR-O-LC-FREE']:
        await expect(page.locator(f'#results > article[data-record="{identifier}"]')).to_have_count(1)
    await choose('typicalSeries', '5000')
    await expect(page.locator('#results > article')).to_have_count(48)
    await expect(page.locator('input[data-filter="projectType"][value="Survey"]').locator('..').locator('.ttc-filter-count')).to_have_text('(16)')
    await page.reload()
    await expect(page.locator('#selected-count')).to_have_text('6')
    assert await report_ids(page) == ALWAYS_IDS + ['160-INT-LD-CLT-MID']
    await reset_project_for_catalog_checks(page)
    print('PASS: second-position series, numeric groups, multiple choices, cross-filter counts, required exclusions, selection persistence and resets', flush=True)


async def check_mdot_codes(page):
    await reset_project_for_catalog_checks(page)
    choices = page.locator('input[data-filter="mdotCode"]')
    await expect(choices).to_have_count(50)
    for code in ['KEY', 'AB', 'NOTES', 'SPACING', 'CHARTS', 'CLT(7)', '1LC', 'PDF', '4110A']:
        await expect(page.locator(f'input[data-filter="mdotCode"][value="{code}"]')).to_have_count(0)

    async def choose(field, value):
        control = page.locator(f'input[data-filter="{field}"][value="{value}"]')
        await control.evaluate('el => el.closest("details").open = true')
        await control.check()
        return control

    def code_count(code):
        return page.locator(f'input[data-filter="mdotCode"][value="{code}"]').locator('..').locator('.ttc-filter-count')

    tr = await choose('mdotCode', 'TR')
    await expect(page.locator('#results > article')).to_have_count(12)
    await expect(code_count('TR')).to_have_text('(12)')
    for identifier in ['4110A-M-TR-NFW-2L', '4180-M-TR-NFW-2L', '4224-M-FW-ExR-TR', '5110-S-TR-NFW-2L']:
        await expect(page.locator(f'#results > article[data-record="{identifier}"]')).to_have_count(1)
    card = page.locator('#results > article[data-record="4110A-M-TR-NFW-2L"]')
    await expect(card.locator('[data-filter-field="mdotCode"]')).to_have_count(0)
    await choose('projectType', 'Highway Maintenance')
    await expect(page.locator('#results > article')).to_have_count(6)
    await expect(code_count('TR')).to_have_text('(6)')
    await card.get_by_role('button', name='Add 4110A-M-TR-NFW-2L', exact=True).click()
    await expect(page.locator('#results > article')).to_have_count(5)
    await expect(code_count('TR')).to_have_text('(6)')
    await choose('workTask', 'Lane closure — side unspecified')
    await expect(page.locator('#results > article')).to_have_count(4)
    await expect(code_count('TR')).to_have_text('(5)')
    await page.locator('#reset-filters').click()
    await choose('mdotCode', 'SHIFT')
    await expect(page.locator('#results > article')).to_have_count(18)
    await choose('mdotCode', 'LC')
    await page.locator('#search').fill('152-CLT(7)')
    await expect(page.locator('#results > article')).to_have_count(1)
    card = page.locator('#results > article')
    await expect(card.locator('[data-filter-field="mdotCode"]')).to_have_count(0)
    await expect(code_count('LC')).to_have_text('(1)')
    await expect(code_count('SHIFT')).to_have_text('(1)')
    await page.locator('#reset-filters').click()
    await choose('mdotCode', 'FW')
    await page.locator('#search').fill('110-TR-NFW-2L')
    await expect(page.locator('#results > article')).to_have_count(0)
    await expect(page.locator('#possible-results > article')).to_have_count(0)
    await page.locator('#reset-filters').click()
    await choose('mdotCode', '(L)')
    await page.locator('#search').fill('110-TR-NFW-2L')
    await expect(page.locator('#results > article')).to_have_count(0)
    await page.reload()
    assert await selected_ids(page) == ['4110A-M-TR-NFW-2L']
    await expect(page.locator('[data-selected="4110A-M-TR-NFW-2L"] [data-filter-field="mdotCode"]')).to_have_count(0)
    await page.locator('#reset-filters').click()
    await page.locator('#automatic-details').evaluate('el => el.open = true')
    await expect(page.locator('#automatic-list [data-filter-field="mdotCode"]')).to_have_count(0)
    await page.locator('#typical-code-legend').evaluate('el => el.open = true')
    await expect(page.locator('#typical-code-legend')).to_contain_text('filter matches codes throughout the filename')
    await expect(page.locator('#typical-code-legend')).not_to_contain_text('only the first code')
    await page.locator('#typical-code-legend').evaluate('el => el.open = false')
    original_viewport = page.viewport_size
    for width in [1440, 390, 320]:
        await page.set_viewport_size({'width': width, 'height': 1050 if width == 1440 else 844})
        await choose('mdotCode', 'ZIP')
        await expect(page.locator('#results > article')).to_have_count(5)
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        await page.locator('input[data-filter="mdotCode"][value="ZIP"]').uncheck()
        await tr.scroll_into_view_if_needed()
        await page.locator('.ttc-filter-panel').screenshot(path=str(OUTPUT / f'all-codes-{width}.png'))
    await page.set_viewport_size(original_viewport)
    await reset_project_for_catalog_checks(page)
    print('PASS: all-position MDOT filtering without duplicate code tags, compound variants, counts, combinations, persistence and mobile layout', flush=True)


async def check_work_tasks(page):
    await reset_project_for_catalog_checks(page)
    await expect(page.locator('#primary-filters > .ttc-filter')).to_have_count(4)
    await expect(page.locator('#more-filters, #additional-filters')).to_have_count(0)
    for field in ['existingLanes', 'workSituation', 'lanesClosed', 'lanePosition', 'controlMethod']:
        await expect(page.locator(f'input[data-filter="{field}"]')).to_have_count(0)
    choices = page.locator('input[data-filter="workTask"]')
    expected_counts = {
        'Close the right lane': 21, 'Close the left lane': 30, 'Close the center turn lane': 4,
        'Close multiple lanes': 33, 'Lane closure — side unspecified': 25, 'Shift traffic': 23,
        'Shoulder / roadside work': 18, 'Ramp work / closures': 15, 'Intersection work': 5,
        'Mobile work / rolling roadblocks': 8, 'Crossing / crossover work': 5,
        'Traffic control / signing': 9, 'Other work': 3,
    }
    assert await choices.evaluate_all('els => els.map(el => el.value)') == list(expected_counts)
    for value, count in expected_counts.items():
        option = page.locator(f'input[data-filter="workTask"][value="{value}"]')
        await option.evaluate('el => el.closest("details").open = true')
        await option.check()
        await expect(option.locator('..').locator('.ttc-filter-count')).to_have_text(f'({count})')
        await expect(page.locator('#results > article')).to_have_count(count)
        assert await page.locator('#results > article').evaluate_all('''(cards, value) => cards.every(card =>
            [...card.querySelectorAll('[data-filter-field="workTask"]')].some(tag => tag.dataset.filterValue === value))''', value)
        if value == 'Other work':
            assert await page.locator('#results > article').evaluate_all('cards => cards.map(card => card.dataset.typical.split("-")[0])') == ['320', '5182A', '5182B']
        await option.uncheck()
    # The full activity list remains usable at desktop and narrow mobile widths.
    original_viewport = page.viewport_size
    for width in [1440, 390, 320]:
        await page.set_viewport_size({'width': width, 'height': 1050 if width == 1440 else 844})
        await choices.last.scroll_into_view_if_needed()
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        await expect(choices.last).to_be_in_viewport()
        await choices.last.check()
        await expect(page.locator('#results > article')).to_have_count(3)
        await choices.last.uncheck()
        await choices.first.scroll_into_view_if_needed()
        await page.locator('.ttc-filter-panel').screenshot(path=str(OUTPUT / f'work-activities-{width}.png'))
    await page.set_viewport_size(original_viewport)
    right = page.locator('input[data-filter="workTask"][value="Close the right lane"]')
    await right.evaluate('el => el.closest("details").open = true')
    await right.check()
    await expect(page.locator('#results > article')).to_have_count(21)
    await expect(page.locator('#results [data-typical^="131-"]')).to_have_count(0)
    await expect(page.locator('#possible-results [data-typical^="131-"]')).to_have_count(0)
    await expect(page.locator('#possible-results [data-typical="110-TR-NFW-2L"]')).to_have_count(1)
    await expect(page.locator('#results [data-typical="204-FW-1LC-(L)"]')).to_have_count(0)
    await expect(page.locator('#possible-results [data-typical="204-FW-1LC-(L)"]')).to_have_count(0)
    await expect(page.locator('#possible-results [data-typical="5205-S-FW-2LC-(L)"]')).to_have_count(1)
    for number in ['105', '106', '107', '120', '121', '300', '301', '380', '4121']:
        await expect(page.locator(f'#possible-results [data-typical^="{number}-"]')).to_have_count(0)
    await page.get_by_role('button', name='Add 123-NFW-1LC-(R)', exact=True).click()
    left = page.locator('input[data-filter="workTask"][value="Close the left lane"]')
    await left.check()
    await expect(page.locator('#results [data-typical^="131-"] [data-filter-value="Close the left lane"]')).to_have_count(1)
    await expect(page.locator('#results [data-typical="124-NFW-2(R+L)LC-SHIFT"]')).to_have_count(1)
    await right.uncheck()
    await expect(page.locator('#selected-count')).to_have_text('6')
    await expect(page.locator('#results [data-typical="203-FW-1LC-(R)"]')).to_have_count(0)
    await page.locator('#reset-filters').click()
    await expect(page.locator('#filters input:checked')).to_have_count(0)
    await expect(page.locator('#match-count')).to_have_text('131 of 131 typicals match')
    await page.reload()
    assert await selected_ids(page) == ['123-NFW-1LC-(R)']
    await expect(page.locator('[data-selected="123-NFW-1LC-(R)"] [data-filter-field="workTask"]')).to_have_text('Work activity: Close the right lane')
    await reset_project_for_catalog_checks(page)
    print('PASS: 13 activities, 131 covered details, three Other work typicals, matching tags/counts, possible sides, persistence and desktop/mobile layout', flush=True)


async def check_lane_information(page):
    await expect(page.locator('input[data-filter="lanes"]')).to_have_count(0)
    assert not await page.locator('.ttc-tag').filter(has_text=re.compile(r'^Lane:')).count()

    async def choose(field, value):
        control = page.locator(f'input[data-filter="{field}"][value="{value}"]')
        await control.evaluate('el => { for (let group = el.closest("details"); group; group = group.parentElement.closest("details")) group.open = true; }')
        await control.check()

    await choose('workTask', 'Lane closure — side unspecified')
    await page.locator('#search').fill('110-TR-NFW-2L')
    await expect(page.locator('#results > article')).to_have_count(1)
    await expect(page.locator('#results .ttc-tags')).to_contain_text('Existing: 2 total (both directions)')
    await expect(page.locator('#results .ttc-tags')).to_contain_text('Closed: 1 lane')
    await expect(page.locator('#results .ttc-note')).to_contain_text('Work area: 1 outside lane')
    await page.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
    assert await report_ids(page) == ALWAYS_IDS + ['110-TR-NFW-2L']
    await page.locator('#reset-filters').click()
    await choose('workTask', 'Close the right lane')
    await choose('workTask', 'Close multiple lanes')
    await page.locator('#search').fill('202-FW-(1-2)LC-(L)')
    await expect(page.locator('#results > article')).to_have_count(1)
    await expect(page.locator('#results .ttc-tags')).to_contain_text('Existing: 3 in affected direction')
    await expect(page.locator('#results [data-workbook-field="lanes"]')).to_have_text('Workbook lanes: 1+')
    await page.locator('#reset-filters').click()
    await choose('workTask', 'Shoulder / roadside work')
    await choose('workTask', 'Close the right lane')
    await page.locator('#search').fill('205-FW-1LC-(R)-SHIFT')
    await expect(page.locator('#results > article')).to_have_count(1)
    await page.locator('#reset-filters').click()
    await page.locator('#search').fill('225-FW-EnR-SHL-SHIFT')
    await expect(page.locator('#results > article')).to_have_count(1)
    await expect(page.locator('#results .ttc-tags')).to_contain_text('Existing: 1 on ramp')
    await expect(page.locator('#selected-count')).to_have_text('6')
    await page.reload()
    assert await report_ids(page) == ALWAYS_IDS + ['110-TR-NFW-2L']
    await reset_project_for_catalog_checks(page)
    await expect(page.locator('#selected-count')).to_have_text('5')
    print('PASS: existing lanes with work tasks, direction labels, staged closures, shoulders, original values and saved reports', flush=True)


async def check_possible_matches_and_conditions(page):
    await reset_project_for_catalog_checks(page)

    async def choose(field, value):
        control = page.locator(f'input[data-filter="{field}"][value="{value}"]')
        await control.evaluate('el => { for (let group = el.closest("details"); group; group = group.parentElement.closest("details")) group.open = true; }')
        await control.check()
        return control

    for field, value in [('projectType', 'Construction'), ('mdotCode', 'FW'), ('workTask', 'Close the right lane')]:
        await choose(field, value)
    possible = page.locator('#possible-matches')
    await expect(possible).to_be_visible()
    await expect(possible).not_to_have_attribute('open', '')
    await expect(page.locator('#results [data-typical="205-FW-1LC-(R)-SHIFT"]')).to_have_count(0)
    await expect(page.locator('#possible-results [data-typical="208-FW-3LC-(L)"]')).to_have_count(0)
    await page.locator('#select-all-matches').check()
    await page.locator('#move-right').click()
    assert '205-FW-1LC-(R)-SHIFT' not in await selected_ids(page)
    await page.locator('#select-all-selected').check()
    await page.locator('#move-left').click()
    await possible.locator('summary').first.click()
    card = page.locator('#possible-results [data-typical="205-FW-1LC-(R)-SHIFT"]')
    await expect(card.locator('.ttc-possible-reason')).to_have_text('Review detail — not classified for: Work activity.')
    await card.get_by_role('button', name='Add 205-FW-1LC-(R)-SHIFT', exact=True).click()
    await expect(card).to_have_count(0)
    assert await report_ids(page) == ALWAYS_IDS + ['205-FW-1LC-(R)-SHIFT']
    await page.get_by_role('button', name='Remove selected 205-FW-1LC-(R)-SHIFT', exact=True).click()
    known = await choose('workTask', 'Shoulder / roadside work')
    await expect(page.locator('#results [data-typical="205-FW-1LC-(R)-SHIFT"]')).to_have_count(1)
    await expect(card).to_have_count(0)
    await known.uncheck()
    await expect(card).to_have_count(1)
    await expect(page.locator('#possible-results [data-typical="204-FW-1LC-(L)"]')).to_have_count(0)
    await page.locator('#search').fill('205-FW-1LC-(R)-SHIFT')
    await expect(page.locator('#match-count')).to_have_text('0 of 131 typicals match')
    await expect(page.locator('#possible-count')).to_have_text('1')
    await expect(page.locator('#empty-results')).to_contain_text('Review the possible matches')
    await expect(page.locator('#select-all-matches')).to_be_disabled()
    await card.get_by_role('button', name='Add 205-FW-1LC-(R)-SHIFT', exact=True).click()
    await page.locator('#search').fill('not-a-typical')
    await expect(possible).to_be_hidden()
    await page.locator('#reset-filters').click()
    await expect(possible).to_be_hidden()
    await expect(possible).not_to_have_attribute('open', '')
    assert await report_ids(page) == ALWAYS_IDS + ['205-FW-1LC-(R)-SHIFT']
    await choose('workTask', 'Mobile work / rolling roadblocks')
    await page.locator('#search').fill('mobile operation')
    await expect(page.locator('#results > article')).to_have_count(6)
    await page.locator('#reset-filters').click()
    await choose('workTask', 'Other work')
    await page.locator('#search').fill('5182')
    await expect(page.locator('#results > article')).to_have_count(2)
    await page.locator('#reset-filters').click()
    await choose('workTask', 'Shift traffic')
    await page.locator('#search').fill('parking lane')
    await expect(page.locator('#results > article')).to_have_count(3)
    await page.locator('#reset-filters').click()
    await page.locator('#search').fill('4400')
    await expect(page.locator('#results .ttc-conditions')).to_contain_text('Traffic Volumes Less than 10,000 ADT')
    await expect(page.locator('#results .ttc-conditions')).to_contain_text('Adequate Sight Distances')
    await page.get_by_role('button', name='Add 4400-M-NFW-SHL-MOB', exact=True).click()
    await page.reload()
    await expect(page.locator('[data-selected="4400-M-NFW-SHL-MOB"] > article > .ttc-conditions')).to_contain_text('Adequate Sight Distances')
    assert await selected_ids(page) == ['205-FW-1LC-(R)-SHIFT', '4400-M-NFW-SHL-MOB']
    await page.locator('#search').fill('110-TR-NFW-2L')
    await page.locator('#results .ttc-related').evaluate('el => el.open = true')
    await expect(page.locator('#results .ttc-related .ttc-conditions')).to_contain_text('Maximum 10 MPH Speed Reduction')
    await reset_project_for_catalog_checks(page)
    print('PASS: possible matches, known conflicts, bulk-add exclusion, manual add/focus, search/counts, work tasks, specialized details and saved MDOT conditions', flush=True)


async def check(origin):
    OUTPUT.mkdir(exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        context = await browser.new_context(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto(origin + '/calc/index.html')
        await page.locator('a[href="calculators/mdot-ttc/"]').click()
        await expect(page.locator('#selected-count')).to_have_text('5')
        await expect(page.locator('#match-count')).to_have_text('80 of 131 typicals match')
        await expect(page.locator('#filters input:checked')).to_have_count(1)
        await expect(page.locator('input[data-filter="projectType"][value="Construction"]')).to_be_checked()
        await page.locator('#reset-filters').click()
        await expect(page.locator('#empty-selection')).to_be_visible()
        for name in ['download-pdf', 'download-word', 'download-zip']:
            await expect(page.locator('#' + name)).to_be_enabled()
        await expect(page.locator('.site-nav a')).to_have_attribute('href', origin + '/calc/index.html')
        await expect(page.locator('.tool-category-label')).to_have_text('Category: Work Zones')
        await check_always_sheets(page)
        await check_general_roadways(page)
        await check_roadway_types(page)
        await check_notes_category(page)
        await check_typical_series(page)
        await check_mdot_codes(page)
        await check_work_tasks(page)
        await check_categories(page)
        await check_lane_information(page)
        await check_possible_matches_and_conditions(page)
        await check_filter_counts(page)
        await check_paint_flags(page)
        await check_catalog_coverage(page)

        for field, value in [('mdotCode', 'TR'), ('workTask', 'Lane closure — side unspecified')]:
            control = page.locator(f'input[data-filter="{field}"][value="{value}"]')
            await control.evaluate('el => { for (let group = el.closest("details"); group; group = group.parentElement.closest("details")) group.open = true; }')
            await control.check()
        await page.locator('#search').fill('110-TR-NFW-2L')
        await expect(page.locator('#results > article')).to_have_count(1)
        await page.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
        await expect(page.locator('#selected-count')).to_have_text('6')
        await page.locator('#download-pdf').click()
        await expect(page.locator('#project-name')).to_be_focused()
        await expect(page.locator('#export-status')).to_contain_text('Enter a project name')
        await page.locator('#project-name').fill('Maple Road resurfacing')
        await page.locator('.ttc-related summary').click()
        await expect(page.locator('.ttc-related')).to_contain_text('RCOC usage: Unspecified')
        await page.get_by_role('button', name='Add 4110B-M-TR-NFW-2L', exact=True).click()
        await expect(page.locator('#selected-count')).to_have_text('7')
        await page.reload()
        await expect(page.locator('#selected-count')).to_have_text('7')
        await expect(page.locator('#project-name')).to_have_value('Maple Road resurfacing')
        await page.locator('#reset-filters').click()
        await expect(page.locator('#results > article')).to_have_count(129)
        await page.locator('#select-all-matches').check()
        await page.locator('#move-right').click()
        await expect(page.locator('#selected-count')).to_have_text('136')
        await expect(page.locator('#select-all-matches')).to_be_disabled()
        all_ids = await report_ids(page)
        all_word = await save_download(page, '#download-word', 'all-typicals.docx')
        all_pdf = await save_download(page, '#download-pdf', 'all-typicals.pdf')
        inspect_word(all_word, all_ids)
        inspect_pdf(all_pdf, all_ids)
        print('PASS: project name validation/persistence, filters, 136 Word rows, linked index and 150 numbered detail pages', flush=True)

        await page.locator('#search').fill('do not use')
        await expect(page.locator('#selected-list > li > article > .ttc-note.warning')).to_have_count(0)
        await reset_project_for_catalog_checks(page)
        await expect(page.locator('#project-name')).to_have_value('')
        await expect(page.locator('#selected-count')).to_have_text('5')
        await expect(page.locator('#filters input:checked')).to_have_count(0)
        await expect(page.locator('#search')).to_have_value('')
        await page.locator('#project-name').fill('Maple Road resurfacing')
        await page.locator('#search').fill('110')
        await page.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
        frozen_ids = await report_ids(page)
        assert frozen_ids == ALWAYS_IDS + ['110-TR-NFW-2L']
        word = await save_download(page, '#download-word', 'selection.docx')
        inspect_word(word, frozen_ids)

        gate = asyncio.Event()
        first_path = RECORDS[frozen_ids[0]]['pdf']['path'].split('/')[-1]
        async def delayed(route):
            await gate.wait()
            await route.continue_()
        await page.route('**/' + first_path, delayed)
        async with page.expect_download(timeout=30000) as pending:
            await page.locator('#download-pdf').click()
            await expect(page.locator('#export-status')).to_contain_text('Preparing 1 of 6')
            await page.locator('#select-all-selected').check()
            await page.locator('#move-left').click()
            await expect(page.locator('#selected-count')).to_have_text('5')
            await page.locator('#project-name').fill('Changed while exporting')
            gate.set()
        download = await pending.value
        await download.save_as(OUTPUT / 'frozen-selection.pdf')
        await page.unroute('**/' + first_path, delayed)
        inspect_pdf(OUTPUT / 'frozen-selection.pdf', frozen_ids)
        await page.reload()
        await expect(page.locator('#selected-count')).to_have_text('5')
        await expect(page.locator('#project-name')).to_have_value('Changed while exporting')
        for name in ['download-pdf', 'download-word', 'download-zip']:
            await expect(page.locator('#' + name)).to_be_enabled()

        await reset_project_for_catalog_checks(page)
        await page.locator('#project-name').fill('Maple Road resurfacing')
        await page.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
        print('PASS: frozen export selections and saved project retaining required typicals', flush=True)

        downloaded = []
        page.on('download', lambda download: downloaded.append(download.suggested_filename))
        broken = RECORDS['101-GEN-SPACING-CHARTS']['pdf']['path'].split('/')[-1]
        async def not_found(route):
            await route.fulfill(status=404, body='Missing file')
        await page.route('**/' + broken, not_found)
        await page.locator('#download-pdf').click()
        await expect(page.locator('#export-status')).to_contain_text('101-GEN-SPACING-CHARTS')
        await expect(page.locator('#export-status')).to_contain_text('No PDF was downloaded')
        assert not downloaded, downloaded
        await page.unroute('**/' + broken, not_found)
        await save_download(page, '#retry-export', 'retried.pdf')
        inspect_pdf(OUTPUT / 'retried.pdf', await report_ids(page))
        downloaded.clear()
        async def corrupt(route):
            await route.fulfill(status=200, content_type='application/pdf', body='%PDF-corrupted')
        await page.route('**/' + broken, corrupt)
        await page.locator('#download-pdf').click()
        await expect(page.locator('#export-status')).to_contain_text('integrity check')
        assert not downloaded, downloaded
        await page.unroute('**/' + broken, corrupt)
        await reset_project_for_catalog_checks(page)

        await page.screenshot(path=str(OUTPUT / 'desktop.png'))
        for width in [390, 320]:
            await page.set_viewport_size({'width': width, 'height': 844})
            await page.locator('#reset-filters').click()
            await page.locator('#search').fill('150')
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            await page.locator('.ttc-mobile-jump').click()
            await expect(page.locator('#download-pdf')).to_be_in_viewport()
            await page.screenshot(path=str(OUTPUT / f'mobile-{width}.png'))
            await page.locator('.ttc-mobile-back').click()
            await expect(page.locator('#search')).to_be_in_viewport()
        print('PASS: missing/corrupt PDF abort, retry, mobile layout and download navigation', flush=True)
        assert not errors, errors

        blocked = await browser.new_context()
        await blocked.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });")
        other = await blocked.new_page()
        await other.goto(origin + '/calculators/mdot-ttc/')
        await expect(other.locator('#selected-count')).to_have_text('5')
        await expect(other.locator('#storage-status')).to_contain_text('unavailable')
        await other.locator('#search').fill('110')
        await other.get_by_role('button', name='Add 110-TR-NFW-2L', exact=True).click()
        await expect(other.locator('#selected-count')).to_have_text('6')
        await expect(other.locator('#storage-status')).to_contain_text('could not save')
        await save_download(other, '#download-word', 'no-storage.docx')
        await blocked.close()

        fresh = await browser.new_context()
        other = await fresh.new_page()
        await other.route('**/catalog.json', lambda route: route.fulfill(status=503, body='Unavailable'))
        await other.goto(origin + '/calculators/mdot-ttc/')
        await expect(other.locator('#load-error')).to_be_visible()
        await expect(other.locator('#selector')).to_be_hidden()
        await other.unroute('**/catalog.json')
        await other.locator('#reload-catalog').click()
        await expect(other.locator('#selected-count')).to_have_text('5')
        await fresh.close()
        await context.close()
        await browser.close()
        print('PASS: storage-denied operation, catalog failure/recovery and root/subdirectory hosting', flush=True)
        print(f'QA artifacts: {OUTPUT}', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check(f'http://127.0.0.1:{server.server_port}'))
    finally:
        server.shutdown()
