"""Refresh the TTC catalog and immutable PDFs. Requires Python 3.10+ and pypdf.

From the repository root: py -3.13 calculators/mdot-ttc/update_catalog.py
The active catalog changes only after every source document has been validated.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
from io import BytesIO
import json
import os
from pathlib import Path
import re
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlencode, urljoin, urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from pypdf import PdfReader

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCES = {
    'construction': 'https://mdotjboss.state.mi.us/TSSD/getSubCategoryDocuments.htm?category=Work+Zones&prjNumber=1403892&subCategory=Maintaining+Traffic+Typicals+',
    'maintenance': 'https://mdotjboss.state.mi.us/TSSD/getSubCategoryDocuments.htm?category=Work+Zones&prjNumber=2173385&subCategory=Maintenance+Maintaining+Traffic+Typicals+',
    'survey': 'https://mdotjboss.state.mi.us/TSSD/getSubCategoryDocuments.htm?category=Work+Zones&prjNumber=2173386&subCategory=Survey+Maintaining+Traffic+Typicals+',
}
PROJECT_TYPES = {'construction': 'Construction Projects', 'maintenance': 'Maintenance Work', 'survey': 'Survey Work'}
# These catalog entries supply only filenames. Titles were read from the MDOT
# drawing title blocks; a descriptive catalog title takes precedence if added.
DOCUMENT_TITLES = {
    '302-SP-PATCH-1LC': 'Concrete Patch - 1 Lane Closure',
    '303-SP-PATCH-2LC': 'Concrete Patch - 2 Lane Closure',
    '304-SP-PATCH-1LC-ExR-C': 'Concrete Patch - 1 Lane and Exit Ramp Closure',
    '4204-M-FW-2LC-(R)': 'Double Right Lane Closure on a Freeway Using a 10 MPH Step Down in Speed Limit',
}
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
FILTER_COLUMNS = {'controlType': 'H', 'workArea': 'I', 'lanes': 'J', 'roadwayType': 'K', 'paint': 'G', 'rcoc': 'Q'}


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def lane_classifications(record):
    """Separate existing geometry from closure counts; prefer the MDOT title."""
    source = record.get('sourceTitle', '')
    title = source if source and source != record['id'] else record['title']
    text = clean(re.sub(r'[-,]', ' ', title)).casefold()
    for word, number in {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7}.items():
        text = re.sub(r'\b' + word + r'\b', str(number), text)
    existing = []
    geometry = r'\b(\d+) lanes? (?:(?:undivided|divided|freeway|2 way|entrance|exit) )*(?:roadway|highway|freeway|ramp)\b'
    for match in re.finditer(geometry, text):
        phrase, count = match[0], match[1]
        if 'ramp' in phrase:
            label = f'{count} on ramp'
        elif re.search(r'\b(?:freeway|divided)\b', phrase):
            label = f'{count} in affected direction'
        elif re.search(r'\b(?:undivided|2 way)\b', phrase):
            if re.search(r'\b(?:freeway|divided)\b', text) and re.search(r'\bor\b', text):
                # A total on one alternative cannot describe the freeway option.
                existing = []
                break
            label = f'{count} total (both directions)'
        else:
            continue  # A number without a counting direction is ambiguous.
        if label not in existing:
            existing.append(label)
    # Retain an exact workbook count when its undivided-road basis is explicit.
    # Do not reinterpret '+' or mixed labels as an MDOT applicability range.
    original = record['filters']
    if not existing and re.fullmatch(r'\d+', original['lanes']) and clean(original['roadwayType']).casefold() == 'undivided':
        existing = [f"{original['lanes']} total (both directions)"]

    closed = []
    closure_text = re.sub(r'\bsingle\b', '1', re.sub(r'\bdouble\b', '2', text))
    progression = re.search(r'\b(\d+) lane to (\d+) lane closure\b', closure_text)
    if progression:
        closed = [f'{n} lane' if n == 1 else f'{n} lanes' for n in range(int(progression[1]), int(progression[2]) + 1)]
    elif re.search(r'\b(?:1 lane and center|left and center|center and left) lane closure\b', closure_text):
        closed = ['2 lanes']
    elif re.search(r'\bcenter lane and 2 left lane closures\b|\b1 left 1 right (?:and )?center left turn lane closure\b', closure_text):
        closed = ['3 lanes']
    elif re.search(r'\bparking lane closure\b', closure_text):
        closed = ['Parking lane only']
    elif re.search(r'\bbound closure\b|\b(?:left|right) lanes and center lane closure\b|\bclosure of center lane and (?:left|right) lanes\b', closure_text):
        pass  # A bound or an unnumbered group of lanes has no explicit count.
    else:
        count = re.search(r'\b(\d+) (?:(?:left|right|inside|outside|center) )?lanes? closures?\b', closure_text)
        if not count:
            count = re.search(r'\blane closure (?:inside|outside|left|right) (\d+) lanes\b', closure_text)
        if not count:
            count = re.search(r'\b(\d+) lane and (?:exit|entrance) ramp closure\b', closure_text)
        if count:
            n = int(count[1])
            closed = [f'{n} lane' if n == 1 else f'{n} lanes']
        elif re.search(r'\blane closure\b', closure_text):
            closed = ['1 lane']
        elif re.search(r'\bramp closure\b', closure_text):
            closed = ['Ramp only']
        elif re.search(r'\bshoulder closure\b|\bwork outside shoulder\b', closure_text):
            closed = ['No lane closure']
        # A shift or temporary signal alone does not establish a closure count.
    return {'existingLanes': existing or ['Unspecified'], 'lanesClosed': closed or ['Unspecified']}


def classify(record):
    """Build browsing categories from explicit labels/titles; retain raw filters."""
    original = record['filters']
    # Titles are descriptive evidence; filename abbreviations and sister sheets
    # are not used to guess missing classifications.
    title = clean(' '.join([record['title'], record.get('sourceTitle', '')]).replace('-', ' ')).casefold()
    roadway = []
    for value in ['Divided', 'Undivided', 'Freeway']:
        if clean(original['roadwayType']).casefold() == value.casefold() or re.search(r'\b' + value.casefold() + r'\b', title):
            roadway.append(value)
    arrangement = []
    arrangement_text = title + ' ' + clean(original['workArea']).replace('-', ' ').casefold()
    rules = {
        'Crossover': r'\bcrossovers?\b',
        'Lane shift': r'\bshift(?:s|ed|ing)?\b',
        'Lane closure': r'\b(?:lanes?|bound) closures?\b|\bclosure of (?:the )?(?:center |left |right |inside |outside |and )*lanes?\b|\blane and (?:exit|entrance) ramp closure\b',
        'Shoulder closure': r'\bshoulder closures?\b',
        'Ramp closure': r'\bramp closures?\b',
        'Ramp treatment': r'\bramp treatment\b',
        'Merge': r'\bmerge\b',
        'Rolling roadblock': r'\brolling roadblock\b',
        'Haul road crossing': r'\bhaul road crossing\b',
    }
    for value, pattern in rules.items():
        if re.search(pattern, arrangement_text) or value == 'Crossover' and clean(original['controlType']).casefold() == 'crossover':
            arrangement.append(value)
    method = []
    method_text = title + ' ' + clean(original['controlType']).casefold()
    for value, pattern in {
        'Traffic regulator': r'\btraffic regulators?\b',
        'Temporary signal': r'\btemporary (?:traffic )?signals?\b',
        'Automated flagger assistance device (AFAD)': r'\bafad\b|\bautomated flagger assistance device\b',
    }.items():
        if re.search(pattern, method_text):
            method.append(value)
    area = original['workArea']
    if clean(area).casefold() in ('crossover', 'single shift', 'crush and shape'):
        area = 'Unspecified'
    areas = [area] if area != 'Unspecified' else []
    shoulder_text = title + ' ' + original['lanes'].casefold() + ' ' + area.casefold()
    if 'outside shoulder' in title:
        areas.append('Outside shoulder')
    elif 'shoulder' in shoulder_text and 'Shoulder' not in areas:
        areas.append('Shoulder')
    return {'roadwayType': roadway or ['Unspecified'], 'trafficArrangement': arrangement or ['Unspecified'],
            'controlMethod': method or ['Unspecified'], 'workArea': list(dict.fromkeys(areas)) or ['Unspecified'],
            **lane_classifications(record)}


def fetch_bytes(url):
    if urlsplit(url).hostname != 'mdotjboss.state.mi.us':
        raise ValueError('Only the MDOT source host is allowed')
    for attempt in range(3):
        try:
            request = Request(url, headers={'User-Agent': 'Mozilla/5.0 (MDOT TTC catalog verification)'})
            with urlopen(request, timeout=45) as response:
                if urlsplit(response.url).hostname != 'mdotjboss.state.mi.us':
                    raise ValueError('Unexpected document redirect')
                return response.read()
        except (HTTPError, URLError, TimeoutError) as error:
            if attempt == 2 or isinstance(error, HTTPError) and error.code not in (429, 500, 502, 503, 504):
                raise
            time.sleep(0.5 * (attempt + 1))


def read_workbook(filename):
    """Read the named sheet and source values, never saved totals or selections."""
    with ZipFile(filename) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(item.itertext()) for item in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        relation_map = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = [s for s in workbook.findall('s:sheets/s:sheet', NS) if s.get('name') == 'Sheet1']
        if len(sheets) != 1:
            raise ValueError('Expected exactly one worksheet named Sheet1')
        target = relation_map[sheets[0].get(REL)]
        sheet_path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        sheet = ET.fromstring(archive.read(sheet_path))
        rows = []
        for row in sheet.findall('s:sheetData/s:row', NS):
            values = {}
            for cell in row.findall('s:c', NS):
                value, inline = cell.find('s:v', NS), cell.find('s:is', NS)
                text = value.text if value is not None else ''.join(inline.itertext()) if inline is not None else ''
                if cell.get('t') == 's' and text:
                    text = shared[int(text)]
                values[re.sub(r'\d+', '', cell.get('r'))] = clean(text)
            if values:
                rows.append({'row': int(row.get('r')), **values})
        header = next((r for r in rows if r.get('A') == 'No:'), None)
        expected = {'B': 'Code', 'D': 'Maintenance Sister', 'E': 'Title', 'F': 'Notes', 'G': 'Do you need paint quantities?',
                    'H': 'Control Type', 'I': 'Work Area', 'J': 'Number of Lanes', 'K': 'Roadway Type',
                    'P': 'Maintain Traffic Typical', 'Q': 'Does RCOC typically use?'}
        if not header or any(header.get(col) != text for col, text in expected.items()):
            raise ValueError('Sheet1 columns changed; review the importer before refreshing')
        return [r for r in rows if r['row'] > header['row'] and
                (r.get('A', '').isdigit() or re.match(r'^\d+[A-Za-z]?-', r.get('D', '')))]


class CatalogHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
        if tag == 'td' and self.row is not None:
            self.cell = {'text': [], 'links': []}
        if tag == 'a' and self.cell is not None:
            link = dict(attrs).get('href', '')
            if link:
                self.cell['links'].append(link)

    def handle_data(self, data):
        if self.cell is not None and clean(data):
            self.cell['text'].append(clean(data))

    def handle_endtag(self, tag):
        if tag == 'td' and self.cell is not None:
            self.row.append(self.cell)
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def parse_catalog(data, source):
    parser = CatalogHTML()
    parser.feed(data.decode('iso-8859-1'))
    documents = {}
    for cells in parser.rows:
        if len(cells) < 4:
            continue
        matched = False
        for link in cells[2]['links']:
            url = urljoin(source, link)
            parsed = urlsplit(url)
            match = re.search(r'(?:^|&)fileName=([^&]+)', parsed.query)
            if not match:
                continue
            # MDOT uses literal plus signs in some filename parameters.
            filename = unquote(match[1])
            number = re.match(r'^(\d+[A-Za-z]?)-', filename)
            if not number or int(re.match(r'\d+', number[1])[0]) == 0 or not filename.lower().endswith('.pdf'):
                continue
            guid = parse_qs(parsed.query).get('docGuid', [''])[0]
            if not guid:
                raise ValueError(f'Missing document identifier: {filename}')
            url = 'https://mdotjboss.state.mi.us/TSSD/getTSDocument.htm?' + urlencode({'docGuid': guid, 'fileName': filename})
            title = ' '.join(t for t in cells[2]['text'] if t != filename and not re.match(r'^\([\d,.]+\s*[KMG]?B\)$', t))
            date_text = ' '.join(cells[3]['text'])
            updated = datetime.strptime(date_text, '%m/%d/%Y').date().isoformat()
            record = {'id': filename[:-4], 'number': number[1], 'sourceTitle': title or filename[:-4],
                      'sourceUrl': url, 'mdotUpdatedAt': updated}
            key = number[1].upper()
            if key in documents and documents[key] != record:
                raise ValueError(f'Ambiguous MDOT number {key}')
            documents[key] = record
            matched = True
        plan = ' '.join(cells[1]['text'])
        plan_number = re.match(r'^(\d+)[A-Za-z]?-', plan)
        if plan_number and int(plan_number[1]) > 0 and not matched:
            raise ValueError(f'MDOT typical {plan} has no usable PDF link')
    if not documents:
        raise ValueError('MDOT catalog contained no individual PDFs')
    return documents


def build_records(rows, listings):
    if any(not listings.get(family) for family in SOURCES):
        raise ValueError('Every MDOT construction, maintenance, and survey catalog is required')
    records, maintenance = {}, {}
    for row in rows:
        sister = re.match(r'^(\d+[A-Za-z]?)-\S+\s*(.*)', row.get('D', ''))
        if sister:
            key = sister[1].upper()
            info = maintenance.setdefault(key, {'rows': [], 'title': sister[2], 'explicit': None})
            info['rows'].append(row['row'])
            if not row.get('A', '').isdigit():
                info['explicit'] = row
        if not row.get('A', '').isdigit():
            continue
        number = row['A']
        if number not in listings['construction']:
            raise ValueError(f'Sheet1 row {row["row"]}: MDOT construction number {number} is missing')
        source = listings['construction'][number]
        if source['id'] in records:
            raise ValueError(f'Duplicate workbook construction number: {number}')
        related = []
        if sister:
            if sister[1].upper() not in listings['maintenance']:
                raise ValueError(f'MDOT maintenance number {sister[1]} is missing')
            related = [listings['maintenance'][sister[1].upper()]['id']]
        records[source['id']] = {
            **source, 'family': 'construction', 'title': row.get('E') or source['sourceTitle'],
            'notes': row.get('F', ''), 'workbookRows': [row['row']], 'workbookCode': row.get('C', ''),
            'filters': {'projectType': row.get('P') or 'Construction Projects', **{key: row.get(col) or 'Unspecified' for key, col in FILTER_COLUMNS.items()}},
            'relatedIds': related,
        }
    for number, info in maintenance.items():
        if number not in listings['maintenance']:
            raise ValueError(f'MDOT maintenance number {number} is missing')
        source = listings['maintenance'][number]
        row = info['explicit'] or {}
        records[source['id']] = {
            **source, 'family': 'maintenance', 'title': row.get('E') or info['title'] or source['sourceTitle'],
            'notes': row.get('F', ''), 'workbookRows': info['rows'], 'workbookCode': number,
            'filters': {'projectType': 'Maintenance Work', **{key: row.get(col) or 'Unspecified' for key, col in FILTER_COLUMNS.items()}},
            'relatedIds': [],
        }
    # The official listings define membership. Workbook values enrich matching
    # records; absent workbook classifications remain explicitly unspecified.
    for family, documents in listings.items():
        for source in documents.values():
            if source['id'] in records:
                if records[source['id']]['family'] != family:
                    raise ValueError(f'Ambiguous MDOT family for {source["id"]}')
                continue
            fallback = source['sourceTitle'] == source['id']
            title = DOCUMENT_TITLES.get(source['id'], source['sourceTitle']) if fallback else source['sourceTitle']
            records[source['id']] = {
                **source, 'family': family, 'title': title,
                'titleSource': 'mdot-pdf' if fallback and source['id'] in DOCUMENT_TITLES else 'mdot-catalog',
                'notes': '', 'workbookRows': [], 'workbookCode': '',
                'filters': {'projectType': PROJECT_TYPES[family], **{key: 'Unspecified' for key in FILTER_COLUMNS}},
                'relatedIds': [],
            }
    if len(records) != sum(len(documents) for documents in listings.values()):
        raise ValueError('The replacement does not cover every individual MDOT typical')
    # Normalize cosmetic case/spacing only; preserve the first workbook label.
    labels = {key: {} for key in ['projectType', *FILTER_COLUMNS]}
    for record in records.values():
        for key, value in record['filters'].items():
            record['filters'][key] = labels[key].setdefault(clean(value).casefold(), clean(value))
        record['classifications'] = classify(record)
    return sorted(records.values(), key=lambda r: (int(re.match(r'\d+', r['number'])[0]), r['number'], r['id']))


def inspect_pdf(data):
    if not data.startswith(b'%PDF-'):
        raise ValueError('Response is not a PDF')
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted or not len(reader.pages):
        raise ValueError('PDF is encrypted or has no pages')
    for page in reader.pages:
        if float(page.mediabox.width) <= 0 or float(page.mediabox.height) <= 0:
            raise ValueError('PDF contains an invalid page size')
    return {'pages': len(reader.pages), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def refresh(workbook, output, fetch=fetch_bytes, workers=3, allow_removals=False):
    workbook, output = Path(workbook).resolve(), Path(output).resolve()
    rows = read_workbook(workbook)
    listings = {family: parse_catalog(fetch(url), url) for family, url in SOURCES.items()}
    previous_file = output / 'catalog.json'
    if previous_file.exists() and not allow_removals:
        previous = json.loads(previous_file.read_text(encoding='utf-8'))
        missing = [r['id'] for r in previous.get('records', [])
                   if r['number'].upper() not in listings.get(r['family'], {})]
        if missing:
            raise ValueError('Previously stored typicals are missing from MDOT: ' + ', '.join(missing) +
                             '. Review the source changes; use --allow-removals only for confirmed withdrawals.')
    records = build_records(rows, listings)
    if not records:
        raise ValueError('Workbook contained no typicals')
    verified_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Stage beside output, on the same volume for atomic file replacements.
    with tempfile.TemporaryDirectory(prefix='.mdot-ttc-refresh-', dir=output.parent) as temporary:
        stage = Path(temporary)

        def download(record):
            try:
                data = fetch(record['sourceUrl'])
                meta = inspect_pdf(data)
                name = meta['sha256'] + '.pdf'
                (stage / name).write_bytes(data)
                return {**record, 'verifiedAt': verified_at, 'pdf': {**meta, 'path': 'pdfs/' + name}}
            except Exception as error:
                raise ValueError(f'{record["id"]}: {error}') from error

        with ThreadPoolExecutor(max_workers=workers) as pool:
            completed = list(pool.map(download, records))
        catalog = {'schemaVersion': 1, 'verifiedAt': verified_at, 'workbookFile': workbook.name,
                   'workbookSha256': hashlib.sha256(workbook.read_bytes()).hexdigest(),
                   'sources': SOURCES, 'coverage': 'all-individual-typicals',
                   'sourceCounts': {family: len(documents) for family, documents in listings.items()}, 'records': completed}
        catalog_file = stage / 'catalog.json'
        catalog_file.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        # Immutable filenames keep the previous catalog functional during promotion.
        # Never prune old PDFs here: an open browser may still have the older catalog.
        (output / 'pdfs').mkdir(parents=True, exist_ok=True)
        for record in completed:
            name = Path(record['pdf']['path']).name
            source, destination = stage / name, output / 'pdfs' / name
            if source.exists():
                os.replace(source, destination)
        os.replace(catalog_file, output / 'catalog.json')
    return catalog


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workbook', type=Path, default=ROOT / 'MDOT TTC Typ Cheat Sheet.xlsx')
    parser.add_argument('--output', type=Path, default=HERE)
    parser.add_argument('--allow-removals', action='store_true', help='Allow confirmed MDOT withdrawals after reviewing missing identifiers')
    args = parser.parse_args()
    try:
        result = refresh(args.workbook, args.output, allow_removals=args.allow_removals)
    except Exception as error:
        parser.exit(1, f'Refresh failed; active catalog was not replaced: {error}\n')
    print(f'Verified {len(result["records"])} typicals, {sum(r["pdf"]["pages"] for r in result["records"])} pages. Catalog updated.')
