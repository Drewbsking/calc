"""Offline importer and stored-document checks: py -3.13 -m unittest discover -s tests -p test_mdot_ttc_catalog.py."""
from copy import deepcopy
import hashlib
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'calculators' / 'mdot-ttc'
spec = importlib.util.spec_from_file_location('ttc_updater', FOLDER / 'update_catalog.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


def listing(items):
    return ('<table>' + ''.join(
        f'<tr><td>Typicals</td><td>{code}.pdf</td><td>{title}<a href="getTSDocument.htm?docGuid={code}&amp;fileName={code}.pdf">{code}.pdf</a> (10 KB)</td><td>05/10/2021</td></tr>'
        for code, title in items) + '</table>').encode('ascii')


CONSTRUCTION = listing([('100-GEN-KEY', 'Numbering key'), ('110-TR-NFW-2L', 'MDOT construction title'),
                        ('115-AFAD-NFW-2L', 'MDOT AFAD title'), ('302-SP-PATCH-1LC', '302-SP-PATCH-1LC.pdf')])
MAINTENANCE = listing([('4000-M-SHL-OUT', 'MDOT shoulder title'), ('4110B-M-TR-NFW-2L', 'MDOT maintenance title')])
SURVEY = listing([('5000-S-SHL-OUT', 'MDOT survey title')])
ROWS = [
    {'row': 2, 'A': '100', 'B': 'GEN-KEY', 'C': '100-GEN-KEY', 'E': 'Workbook key', 'Q': 'Always'},
    {'row': 10, 'A': '110', 'B': 'TR-NFW-2L', 'C': '110-TR-NFW-2L', 'E': 'Workbook construction title',
     'D': '4110B-M-TR-NFW-2L Maintenance alternative', 'F': 'DO NOT USE in this example', 'Q': 'Yes', 'J': '2'},
]


def pdf_bytes():
    writer = PdfWriter()
    writer.add_blank_page(width=792, height=612)
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


class ImporterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='calc-ttc-test-')
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.workbook = self.directory / 'source.xlsx'
        self.workbook.write_bytes(b'workbook fixture')
        self.output = self.directory / 'site'
        self.output.mkdir()
        self.active = self.output / 'catalog.json'
        self.active.write_text('{"old":"working catalog"}', encoding='utf-8')
        self.before = self.active.read_bytes()

    def fetch(self, url):
        if url == updater.SOURCES['construction']:
            return CONSTRUCTION
        if url == updater.SOURCES['maintenance']:
            return MAINTENANCE
        if url == updater.SOURCES['survey']:
            return SURVEY
        return pdf_bytes()

    def run_refresh(self, fetch=None, **options):
        with patch.object(updater, 'read_workbook', return_value=deepcopy(ROWS)):
            return updater.refresh(self.workbook, self.output, fetch=fetch or self.fetch, workers=1, **options)

    def test_workbook_is_read_by_sheet_name_and_excludes_total_and_placeholder(self):
        rows = updater.read_workbook(ROOT / 'MDOT TTC Typ Cheat Sheet.xlsx')
        self.assertEqual(len(rows), 88)
        self.assertEqual(sum(r.get('A', '').isdigit() for r in rows), 82)
        self.assertFalse(any(r.get('A') in ('Total', 'DID NOT REVIEW') for r in rows))

    def test_parser_preserves_literal_plus_and_rejects_ambiguous_numbers(self):
        source = updater.SOURCES['construction']
        parsed = updater.parse_catalog(listing([('124-NFW-2(R+L)LC-SHIFT', 'Two lanes')]), source)
        self.assertEqual(parse_qs(urlsplit(parsed['124']['sourceUrl']).query)['fileName'], ['124-NFW-2(R+L)LC-SHIFT.pdf'])
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            updater.parse_catalog(listing([('110-A', 'One'), ('110-B', 'Two')]), source)
        with self.assertRaisesRegex(ValueError, 'no usable PDF link'):
            updater.parse_catalog(b'<table><tr><td>Typicals</td><td>115-AFAD-NFW-2L.pdf</td><td>Unavailable</td><td>05/10/2021</td></tr></table>', source)

    def test_record_mapping_preserves_workbook_text_without_inheriting_classifications(self):
        catalogs = {k: updater.parse_catalog(self.fetch(url), url) for k, url in updater.SOURCES.items()}
        records = {r['number']: r for r in updater.build_records(ROWS, catalogs)}
        self.assertEqual(records['110']['title'], 'MDOT construction title')
        self.assertEqual(records['110']['titleSource'], 'mdot-catalog')
        self.assertEqual(records['110']['workbookTitle'], 'Workbook construction title')
        self.assertEqual(records['110']['notes'], 'DO NOT USE in this example')
        self.assertEqual(records['4110B']['filters']['rcoc'], 'Unspecified')
        self.assertEqual(records['4110B']['filters']['lanes'], 'Unspecified')
        self.assertEqual(records['110']['relatedIds'], [records['4110B']['id']])
        self.assertEqual(records['115']['title'], 'MDOT AFAD title')
        self.assertEqual(records['302']['title'], 'Concrete Patch - 1 Lane Closure')
        self.assertEqual(records['302']['titleSource'], 'mdot-pdf')
        self.assertEqual(records['302']['workbookTitle'], '')
        for number, project_type in [('115', 'Construction Projects'), ('4000', 'Maintenance Work'), ('5000', 'Survey Work')]:
            self.assertEqual(records[number]['workbookRows'], [])
            self.assertEqual(records[number]['filters']['projectType'], project_type)
            self.assertTrue(all(records[number]['filters'][key] == 'Unspecified' for key in updater.FILTER_COLUMNS))

    def test_refresh_stores_validated_files_then_replaces_catalog(self):
        result = self.run_refresh()
        self.assertEqual(json.loads(self.active.read_text()), result)
        self.assertEqual(len(result['records']), 7)
        self.assertEqual(result['sourceCounts'], {'construction': 4, 'maintenance': 2, 'survey': 1})
        self.assertEqual(result['coverage'], 'all-individual-typicals')
        for record in result['records']:
            data = (self.output / record['pdf']['path']).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), record['pdf']['sha256'])
            self.assertEqual(record['pdf']['pages'], 1)
        self.assertEqual(self.workbook.read_bytes(), b'workbook fixture')

    def test_future_catalog_additions_are_imported_without_workbook_edits(self):
        def fetch(url):
            return listing([('5000-S-SHL-OUT', 'Survey shoulder'), ('5999-S-NEW', 'New survey detail')]) if url == updater.SOURCES['survey'] else self.fetch(url)
        result = self.run_refresh(fetch)
        new = next(r for r in result['records'] if r['number'] == '5999')
        self.assertEqual(new['title'], 'New survey detail')
        self.assertEqual(new['filters']['rcoc'], 'Unspecified')
        self.assertEqual(result['sourceCounts']['survey'], 2)

    def test_filename_only_addition_requires_a_verified_drawing_title(self):
        def fetch(url):
            return listing([('5000-S-SHL-OUT', 'Survey shoulder'), ('5999-S-NEW', '5999-S-NEW')]) if url == updater.SOURCES['survey'] else self.fetch(url)
        with self.assertRaisesRegex(ValueError, '5999-S-NEW.*verify its PDF title'):
            self.run_refresh(fetch)
        self.assertEqual(self.active.read_bytes(), self.before)

    def test_refresh_uses_drawing_directions_only_for_matching_downloads(self):
        reviewed = {'110-TR-NFW-2L': {'sha256': hashlib.sha256(pdf_bytes()).hexdigest(), 'positions': ['Left / inside']}}
        with patch.object(updater, 'DRAWING_LANE_POSITIONS', reviewed):
            result = self.run_refresh()
            record = next(r for r in result['records'] if r['number'] == '110')
            self.assertEqual(record['classifications']['lanePosition'], ['Left / inside'])
            reviewed['110-TR-NFW-2L']['sha256'] = '0' * 64
            result = self.run_refresh()
            record = next(r for r in result['records'] if r['number'] == '110')
            self.assertEqual(record['classifications']['lanePosition'], ['Unspecified'])

    def test_failed_new_typical_download_and_missing_survey_catalog_keep_previous_version(self):
        for broken in ['fileName=115-', updater.SOURCES['survey']]:
            def fetch(url):
                if broken in url:
                    raise OSError('MDOT unavailable')
                return self.fetch(url)
            with self.assertRaisesRegex((ValueError, OSError), 'MDOT unavailable'):
                self.run_refresh(fetch)
            self.assertEqual(self.active.read_bytes(), self.before)

    def test_missing_previous_catalog_only_record_requires_review(self):
        self.active.write_text(json.dumps({'records': [{'id': '5999-S-OLD', 'number': '5999', 'family': 'survey'}]}))
        before = self.active.read_bytes()
        with self.assertRaisesRegex(ValueError, '5999-S-OLD.*allow-removals'):
            self.run_refresh()
        self.assertEqual(self.active.read_bytes(), before)
        result = self.run_refresh(allow_removals=True)
        self.assertEqual(len(result['records']), 7)

    def test_missing_download_keeps_old_catalog_and_files(self):
        old_pdf = self.output / 'old.pdf'
        old_pdf.write_bytes(b'previous document')
        def fetch(url):
            if 'fileName=110-' in url:
                raise OSError('Network unavailable')
            return self.fetch(url)
        with self.assertRaisesRegex(ValueError, '110-TR-NFW-2L.*Network unavailable'):
            self.run_refresh(fetch)
        self.assertEqual(self.active.read_bytes(), self.before)
        self.assertEqual(old_pdf.read_bytes(), b'previous document')
        self.assertFalse((self.output / 'pdfs').exists())

    def test_html_response_and_broken_pdf_do_not_replace_catalog(self):
        for bad in (b'<html>maintenance</html>', b'%PDF-1.7\ntruncated'):
            def fetch(url):
                return self.fetch(url) if url in updater.SOURCES.values() else bad
            with self.assertRaises(ValueError):
                self.run_refresh(fetch)
            self.assertEqual(self.active.read_bytes(), self.before)

    def test_changed_listing_with_missing_or_ambiguous_typical_keeps_catalog(self):
        for replacement in (listing([('100-GEN-KEY', 'Only key')]), listing([('110-A', 'One'), ('110-B', 'Two')])):
            def fetch(url):
                return replacement if url == updater.SOURCES['construction'] else self.fetch(url)
            with self.assertRaises(ValueError):
                self.run_refresh(fetch)
            self.assertEqual(self.active.read_bytes(), self.before)

    def test_failure_during_promotion_keeps_previous_catalog(self):
        actual_replace = updater.os.replace
        def replace(source, destination):
            if Path(destination).name == 'catalog.json':
                raise OSError('Catalog is locked')
            return actual_replace(source, destination)
        with patch.object(updater.os, 'replace', side_effect=replace):
            with self.assertRaisesRegex(OSError, 'locked'):
                self.run_refresh()
        self.assertEqual(self.active.read_bytes(), self.before)


class StoredCatalogTests(unittest.TestCase):
    def test_roadway_categories_use_descriptive_evidence_without_decoding_ids(self):
        records = json.loads((FOLDER / 'catalog.json').read_text(encoding='utf-8'))['records']
        by_number = {r['number']: r for r in records}
        for number in ['4110A', '4110B', '4111A', '4111B', '4121', '4122', '4180', '4401', '4405', '5110', '5122', '5181', '5182A', '5182B']:
            self.assertEqual(updater.roadway_classifications(by_number[number]), ['Undivided'], number)
        self.assertEqual(updater.roadway_classifications(by_number['5401']), ['Divided', 'Undivided', 'Freeway'])
        for number in ['105', '106', '311', '4224', '4403', '4421', '5000', '5403', '5421']:
            self.assertEqual(updater.roadway_classifications(by_number[number]), ['Unspecified'], number)
        base = {**by_number['5110'], 'id': '999-FW-NFW-2L', 'title': 'Workbook fallback', 'filters': {**by_number['5110']['filters'], 'roadwayType': 'Unspecified'}}
        cases = [
            ('Work on a Two-Lane, Two-Way Roadway', ['Undivided']),
            ('Work on a 3-Lane, 2-Way Roadway', ['Undivided']),
            ('Work on an Undivided Roadway', ['Undivided']),
            ('Work on a Freeway or Divided Roadway', ['Divided', 'Freeway']),
            ('Work on a non-freeway roadway', ['Unspecified']),
            ('Work on a 2-Way Roadway', ['Unspecified']),
            ('Work on a Multi-Lane Roadway', ['Unspecified']),
            ('999-FW-NFW-2L', ['Unspecified']),
        ]
        for title, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(updater.roadway_classifications({**base, 'sourceTitle': title}), expected)
        conflict = {**base, 'sourceTitle': 'Work on a Freeway', 'title': 'Work on an Undivided Roadway', 'filters': {**base['filters'], 'roadwayType': 'Undivided'}}
        self.assertEqual(updater.roadway_classifications(conflict), ['Freeway'])
        self.assertEqual(updater.roadway_classifications({**conflict, 'sourceTitle': '999-FW-NFW-2L'}), ['Undivided'])
        self.assertEqual(updater.roadway_classifications({**base, 'sourceTitle': 'Non-freeway work', 'filters': {**base['filters'], 'roadwayType': 'Freeway'}}), ['Unspecified'])

    def test_lane_categories_use_the_counting_basis_and_separate_closures(self):
        catalog = json.loads((FOLDER / 'catalog.json').read_text(encoding='utf-8'))
        records = {r['number']: r for r in catalog['records']}
        cases = {
            '110': (['2 total (both directions)'], ['1 lane']),
            '112': (['3 total (both directions)'], ['2 lanes']),
            '123': (['4 total (both directions)'], ['1 lane']),
            '124': (['4 total (both directions)'], ['2 lanes']),
            '126': (['6 total (both directions)'], ['2 lanes']),
            '135': (['5 total (both directions)'], ['3 lanes']),
            '151': (['7 total (both directions)'], ['3 lanes']),
            '202': (['3 in affected direction'], ['1 lane', '2 lanes']),
            '208': (['4 in affected direction'], ['3 lanes']),
            '225': (['1 on ramp'], ['Unspecified']),
            '304': (['Unspecified'], ['1 lane']),
            '5125': (['Unspecified'], ['2 lanes']),
            '5401': (['Unspecified'], ['Unspecified']),
            '5422': (['Unspecified'], ['Unspecified']),
        }
        for number, (existing, closed) in cases.items():
            with self.subTest(typical=number):
                self.assertEqual(updater.lane_classifications(records[number]), {'existingLanes': existing, 'lanesClosed': closed})
        self.assertEqual(records['123']['filters']['lanes'], '4 or 5')
        self.assertEqual(records['202']['filters']['lanes'], '1+')
        self.assertEqual(records['205']['filters']['lanes'], '2+,Shoulder')
        self.assertIn('Shoulder', records['205']['classifications']['workArea'])
        self.assertEqual(records['122']['classifications']['lanesClosed'], ['No lane closure'])
        for number in ['120', '131', '137', '5403']:
            self.assertEqual(records[number]['classifications']['lanesClosed'], ['Unspecified'])

    def test_lane_positions_and_conditions_use_descriptions_without_decoding_ids(self):
        records = json.loads((FOLDER / 'catalog.json').read_text(encoding='utf-8'))['records']
        by_number = {r['number']: r for r in records}
        for record in records:
            self.assertEqual(record['conditions'], updater.applicability_conditions(record), record['id'])
        for number in ['133', '151', '4133A', '4133B', '5133']:
            self.assertEqual(set(updater.lane_positions(by_number[number])), {'Left / inside', 'Center lane'})
        base = {**by_number['4403'], 'id': '999-FW-CLT-R', 'title': 'Workbook speed limits 25 MPH or less'}
        for title in ['Single lane closure with a lane shift left', 'Lane shift right', 'Right shoulder closure', '999-FW-CLT-R']:
            self.assertEqual(updater.lane_positions({**base, 'sourceTitle': title}), ['Unspecified'], title)
        for number in ['152', '153']:
            self.assertEqual(set(updater.lane_positions(by_number[number])), {'Left / inside', 'Right / outside'})
        conflicting = {**by_number['124'], 'filters': {**by_number['124']['filters'], 'workArea': '1 CLTL'}}
        self.assertEqual(set(updater.lane_positions(conflicting)), {'Left / inside', 'Right / outside'})
        self.assertEqual(updater.applicability_conditions({**base, 'sourceTitle': base['id']}), [])
        self.assertEqual(updater.applicability_conditions({**base, 'sourceTitle': 'Work for less than 1 hour at posted speeds of 55 MPH or less'}), ['Less than 1 hour', 'Posted speeds of 55 MPH or less'])
        self.assertEqual(updater.applicability_conditions({**base, 'sourceTitle': 'Work for 1 hour'}), [])
        self.assertEqual(by_number['4110A']['conditions'], ['No Speed Reduction'])
        self.assertEqual(by_number['4110B']['conditions'], ['Maximum 10 MPH Speed Reduction'])
        self.assertEqual(by_number['4400']['conditions'], ['Traffic Volumes Less than 10,000 ADT', 'Adequate Sight Distances'])
        self.assertEqual(by_number['5401']['conditions'], ['Within 150 Feet of Vehicle'])
        for number in ['4403', '4421', '4422', '5403', '5421', '5422']:
            self.assertEqual(by_number[number]['classifications']['trafficArrangement'], ['Mobile operation'])
        for number in ['5182A', '5182B']:
            self.assertEqual(by_number[number]['classifications']['trafficArrangement'], ['Road center work'])
            self.assertEqual(by_number[number]['classifications']['lanePosition'], ['Unspecified'])

    def test_classification_rules_separate_concepts_and_preserve_original_data(self):
        records = json.loads((FOLDER / 'catalog.json').read_text(encoding='utf-8'))['records']
        by_number = {r['number']: r for r in records}
        for record in records:
            before = deepcopy(record)
            self.assertEqual(updater.classify(record), record['classifications'], record['id'])
            self.assertEqual(record, before)
        for number in ['310', '311', '312']:
            self.assertEqual(by_number[number]['classifications']['trafficArrangement'], ['Crossover'])
            self.assertEqual(by_number[number]['classifications']['controlMethod'], ['Unspecified'])
        self.assertEqual(by_number['311']['filters']['controlType'], 'Crossover')
        self.assertEqual(by_number['320']['classifications']['controlMethod'], ['Unspecified'])
        self.assertEqual(by_number['320']['classifications']['workArea'], ['Unspecified'])
        self.assertEqual(by_number['160']['classifications']['roadwayType'], ['Undivided'])
        self.assertEqual(by_number['160']['classifications']['workArea'], ['Intersection'])
        self.assertEqual(by_number['160']['classifications']['controlMethod'], ['Unspecified'])
        self.assertEqual(by_number['111']['classifications']['controlMethod'], ['Traffic regulator'])
        self.assertEqual(by_number['115']['classifications']['controlMethod'], ['Automated flagger assistance device (AFAD)'])
        self.assertEqual(by_number['4121']['classifications']['controlMethod'], ['Temporary signal'])
        self.assertEqual(by_number['5110']['classifications']['controlMethod'], ['Traffic regulator'])
        self.assertEqual(by_number['127']['classifications']['trafficArrangement'], ['Lane shift'])
        self.assertEqual(set(by_number['205']['classifications']['trafficArrangement']), {'Lane shift', 'Lane closure'})
        self.assertEqual(set(by_number['205']['classifications']['roadwayType']), {'Freeway', 'Divided'})
        self.assertEqual(by_number['5000']['classifications']['roadwayType'], ['Unspecified'])

    def test_workbook_work_areas_do_not_establish_closure_directions(self):
        records = json.loads((FOLDER / 'catalog.json').read_text(encoding='utf-8'))['records']
        by_number = {r['number']: r for r in records}
        for number in ['110', '120', '121', '127', '136', '137', '138']:
            self.assertEqual(updater.lane_positions(by_number[number]), ['Unspecified'], number)
        expected = {'131': ['Left / inside', 'Center lane'], '132': ['Right / outside', 'Center lane'],
                    '202': ['Left / inside'], '206': ['Left / inside']}
        for number, positions in expected.items():
            record = by_number[number]
            self.assertEqual(updater.lane_positions(record), positions, number)
            self.assertEqual(updater.lane_positions({**record, 'pdf': {}}), ['Unspecified'], number)
            self.assertEqual(updater.lane_positions({**record, 'pdf': {'sha256': '0' * 64}}), ['Unspecified'], number)
            # Retain source text for notes; its work area must not override the drawing.
            self.assertEqual(updater.lane_positions({**record, 'filters': {**record['filters'], 'workArea': 'Right 1 Lane'}}), positions)

    def test_requested_workbook_corrections_survive_reimport(self):
        catalog = json.loads((FOLDER / 'catalog.json').read_text(encoding='utf-8'))
        rows = updater.read_workbook(ROOT / catalog['workbookFile'])
        self.assertEqual(next(row for row in rows if row.get('A') == '311')['H'], 'Crush and Shape')
        listings = {family: {} for family in updater.SOURCES}
        for record in catalog['records']:
            listings[record['family']][record['number']] = {key: record[key] for key in ['id', 'number', 'sourceTitle', 'sourceUrl', 'mdotUpdatedAt']}
        rebuilt = {record['id']: record for record in updater.build_records(rows, listings)}
        for record in catalog['records']:
            # Refresh finalizes classifications after the PDF has been validated.
            rebuilt[record['id']]['pdf'] = record['pdf']
            rebuilt[record['id']]['classifications'] = updater.classify(rebuilt[record['id']])
            for key in ['filters', 'classifications', 'conditions', 'notes', 'title', 'titleSource', 'workbookTitle']:
                self.assertEqual(rebuilt[record['id']][key], record[key], (record['id'], key))

    def test_general_sheet_applicability_survives_refresh_without_changing_workbook_values(self):
        records = json.loads((FOLDER / 'catalog.json').read_text(encoding='utf-8'))['records']
        general = [record for record in records if record['number'] in {'100', '101', '102', '103', '104'}]
        self.assertEqual(len(general), 5)
        for record in general:
            with self.subTest(typical=record['id']):
                self.assertEqual(updater.classify(record)['roadwayType'], ['All roadway types'])
                self.assertEqual(record['filters']['roadwayType'], 'Unspecified')
                different_family = {**record, 'family': 'maintenance'}
                self.assertEqual(updater.classify(different_family)['roadwayType'], ['Unspecified'])
        other = next(record for record in records if record['number'] == '5000')
        self.assertEqual(updater.classify({**other, 'filters': {**other['filters'], 'rcoc': 'Always'}})['roadwayType'], ['Unspecified'])

    def test_all_stored_pdfs_match_metadata_and_source_workbook_is_unchanged(self):
        catalog = json.loads((FOLDER / 'catalog.json').read_text(encoding='utf-8'))
        self.assertEqual(catalog['workbookSha256'], hashlib.sha256((ROOT / catalog['workbookFile']).read_bytes()).hexdigest())
        self.assertEqual(len(catalog['records']), 136)
        self.assertEqual(catalog['sourceCounts'], {'construction': 88, 'maintenance': 32, 'survey': 16})
        for record in catalog['records']:
            with self.subTest(typical=record['id']):
                data = (FOLDER / record['pdf']['path']).read_bytes()
                self.assertEqual(updater.inspect_pdf(data), {k: record['pdf'][k] for k in ('pages', 'bytes', 'sha256')})
        spacing = next(r for r in catalog['records'] if r['number'] == '101')
        reader = PdfReader(FOLDER / spacing['pdf']['path'])
        text = ' '.join(page.extract_text() for page in reader.pages).upper()
        self.assertIn('SPACING', text)


if __name__ == '__main__':
    unittest.main()
