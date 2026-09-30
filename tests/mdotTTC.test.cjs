const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const folder = path.join(__dirname, '../calculators/mdot-ttc');
const core = require('../calculators/mdot-ttc/core.js');
const exportsAPI = require('../calculators/mdot-ttc/exports.js');
const PDF = require('../calculators/mdot-ttc/vendor/pdf-lib.min.js');
const docx = require('../calculators/mdot-ttc/vendor/docx.umd.js');
const catalog = require('../calculators/mdot-ttc/catalog.json');
const records = catalog.records;
const find = number => records.find(r => r.number === number);
const fetchFile = async relative => fs.readFileSync(path.join(folder, relative));
const digest = async bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pdfOptions = { projectName: 'Maple Road resurfacing', digest };

test('catalog covers all 88 construction, 32 maintenance and 16 survey typicals', () => {
  core.validateCatalog(catalog);
  assert.equal(records.length, 136);
  assert.equal(records.filter(r => r.family === 'construction').length, 88);
  assert.equal(records.filter(r => r.family === 'maintenance').length, 32);
  assert.equal(records.filter(r => r.family === 'survey').length, 16);
  assert.equal(new Set(records.map(r => r.id)).size, 136);
  assert.equal(records.reduce((sum, r) => sum + r.pdf.pages, 0), 150);
  assert.deepEqual(catalog.sourceCounts, { construction: 88, maintenance: 32, survey: 16 });
  assert.equal(catalog.coverage, 'all-individual-typicals');
});

test('new projects start with no selected details or filters and show the full catalog', () => {
  assert.deepEqual(core.defaults(records), []);
  assert.deepEqual(core.initialFilters(), {});
  assert.equal(core.filter(records, '', core.initialFilters()).length, 136);
  assert.equal(core.filter(records).length, 136);
});

test('additional MDOT typicals retain source titles and do not infer workbook classifications', () => {
  const additions = records.filter(r => !r.workbookRows.length);
  assert.equal(additions.length, 39);
  for (const record of additions) {
    for (const key of ['roadwayType', 'lanes', 'workArea', 'controlType', 'paint', 'rcoc']) assert.equal(record.filters[key], 'Unspecified', record.id);
    assert.equal(record.notes, '');
    assert.equal(core.paintStatus(record), '');
  }
  assert.equal(core.filter(records, '', { projectType: ['Survey Work'] }).length, 16);
  assert.equal(find('302').title, 'Concrete Patch - 1 Lane Closure');
  for (const number of ['115', '116', '303', '304', '380', '4000', '4111A', '4111B', '4203B', '4204', '4221', '4222', '4224', '4231', '4400', '4401', '4402', '4403', '4405', '4420', '4421', '4422', '5000', '5110', '5122', '5123', '5125', '5133', '5181', '5182A', '5182B', '5200', '5203', '5205', '5401', '5403', '5421', '5422']) assert.ok(find(number), number);
});

test('filters combine AND between fields and OR within one field', () => {
  const filters = { roadwayType: ['Undivided', 'Divided'], existingLanes: ['2 total (both directions)'] };
  const result = core.filter(records, '', filters);
  assert.ok(result.some(r => r.number === '110'));
  assert.ok(result.length > 1);
  assert.ok(result.every(r => core.values(r, 'roadwayType').some(value => ['Undivided', 'Divided'].includes(value)) && core.values(r, 'existingLanes').includes('2 total (both directions)')));
  assert.deepEqual(core.filter(records, '', { existingLanes: ['No such value'] }), []);
});

test('search finds codes, titles and notes and respects active filters', () => {
  assert.deepEqual(core.filter(records, '  101 spacing  ').map(r => r.number), ['101']);
  assert.equal(core.filter(records, 'DO NOT USE').length, 3);
  assert.equal(core.filter(records, 'DO NOT USE', { projectType: ['Survey Work'] }).length, 0);
  assert.ok(core.filter(records, 'no speed reduction').some(r => r.number === '4110A'));
});

test('facet counts apply search and other groups while keeping same-group alternatives available', () => {
  const sample = (id, roadwayType, existingLanes, controlMethod) => ({ id, title: 'Lane closure', notes: '',
    filters: { projectType: 'Construction Projects', roadwayType, existingLanes, controlMethod, workArea: 'Lane' } });
  const items = [sample('110', 'Undivided', '2 total', 'Flagger'), sample('120', 'Undivided', '4 total', 'Flagger'), sample('130', 'Divided', '4 total', 'Signs')];
  const filters = { roadwayType: ['Undivided'], existingLanes: ['4 total'] };
  const counts = core.facetCounts(items, '', filters);
  assert.deepEqual(counts.roadwayType, { Divided: 1, Undivided: 1 });
  assert.deepEqual(counts.existingLanes, { '2 total': 1, '4 total': 1 });
  assert.deepEqual(counts.controlMethod, { Flagger: 1, Signs: 0 });
  const multiple = core.facetCounts(items, 'lane closure', { ...filters, roadwayType: ['Undivided', 'Divided'] });
  assert.deepEqual(multiple.roadwayType, counts.roadwayType);
  assert.deepEqual(multiple.existingLanes, { '2 total': 1, '4 total': 2 });
  const searched = core.facetCounts(items, '  110  ', filters);
  assert.deepEqual(searched.roadwayType, { Divided: 0, Undivided: 0 });
  assert.deepEqual(searched.existingLanes, { '2 total': 1, '4 total': 0 });
  assert.deepEqual(core.facetCounts(items, '', { controlMethod: [' FLAGGER '] }).roadwayType, { Divided: 0, Undivided: 2 });
  assert.deepEqual(filters, { roadwayType: ['Undivided'], existingLanes: ['4 total'] });
});

test('facet counts cover every family and unspecified classification, including zero results', () => {
  assert.deepEqual(core.facetCounts(records).projectType, { 'Construction Projects': 88, 'Maintenance Work': 32, 'Survey Work': 16 });
  const survey = core.facetCounts(records, '', { projectType: ['Survey Work'] });
  assert.equal(survey.lanesClosed['Ramp only'], 0);
  assert.equal(survey.trafficArrangement.Crossover, 0);
  assert.equal(survey.controlMethod['Temporary signal'], 0);
  assert.equal(core.facetCounts(records, '', core.initialFilters()).projectType['Survey Work'], 16);
  const none = core.facetCounts(records, 'nonexistent-typical');
  for (const group of Object.values(none)) assert.ok(Object.values(group).every(count => count === 0));
});

test('roadway, arrangement and control method are separate and allow overlapping classifications', () => {
  assert.deepEqual(core.options(records, 'roadwayType'), ['Divided', 'Freeway', 'Undivided', 'Unspecified']);
  assert.deepEqual(core.filter(records, '', { trafficArrangement: ['Crossover'] }).map(r => r.number), ['310', '311', '312']);
  assert.ok(!core.options(records, 'controlMethod').includes('Crossover'));
  assert.ok(!core.options(records, 'controlMethod').includes('Crush and Shape'));
  const mixed = core.filter(records, '', { roadwayType: ['Freeway'], trafficArrangement: ['Lane shift', 'Lane closure'] });
  assert.equal(mixed.filter(r => r.number === '205').length, 1);
  assert.equal(core.facetCounts([find('205')]).trafficArrangement['Lane closure'], 1);
  assert.equal(core.facetCounts([find('205')]).trafficArrangement['Lane shift'], 1);
  assert.equal(core.facetCounts([find('205')]).roadwayType.Divided, 1);
  assert.equal(core.facetCounts([find('205')]).roadwayType.Freeway, 1);
  assert.ok(core.filter(records, '', { roadwayType: ['Undivided'], controlMethod: ['Traffic regulator'] }).some(r => r.number === '111'));
  assert.deepEqual(core.values(find('311'), 'controlMethod'), ['Unspecified']);
  assert.equal(find('311').filters.controlType, 'Crush and Shape');
  assert.ok(core.filter(records, 'crush and shape').some(r => r.number === '311'));
});

test('lane filters separate existing geometry, closure counts and shoulder work', () => {
  assert.ok(!Object.hasOwn(core.FILTERS, 'lanes'));
  assert.deepEqual(core.values(find('110'), 'existingLanes'), ['2 total (both directions)']);
  assert.deepEqual(core.values(find('110'), 'lanesClosed'), ['1 lane']);
  assert.deepEqual(core.values(find('202'), 'existingLanes'), ['3 in affected direction']);
  assert.deepEqual(core.values(find('202'), 'lanesClosed'), ['1 lane', '2 lanes']);
  assert.equal(core.filter(records, '', { existingLanes: ['3 in affected direction'], lanesClosed: ['1 lane', '2 lanes'] }).filter(r => r.number === '202').length, 1);
  assert.deepEqual(core.facetCounts([find('202')]).lanesClosed, { '1 lane': 1, '2 lanes': 1 });
  assert.deepEqual(core.values(find('225'), 'existingLanes'), ['1 on ramp']);
  assert.deepEqual(core.values(find('205'), 'existingLanes'), ['Unspecified']);
  assert.ok(core.values(find('205'), 'workArea').includes('Shoulder'));
  assert.equal(find('205').filters.lanes, '2+,Shoulder');
  assert.deepEqual(core.values(find('122'), 'lanesClosed'), ['No lane closure']);
  assert.deepEqual(core.values(find('131'), 'lanesClosed'), ['Unspecified']);
  assert.deepEqual(core.values(find('137'), 'lanesClosed'), ['Unspecified']);
  assert.ok(core.options(records, 'existingLanes').every(value => !value.includes('+') && !value.includes('Shoulder')));
});

test('paint values drive flags without filtering out typicals', () => {
  assert.ok(!Object.hasOwn(core.FILTERS, 'paint'));
  assert.equal(core.filter(records, '', { paint: ['No'] }).length, records.length);
  assert.equal(core.paintStatus(find('124')), 'required');
  assert.equal(core.paintStatus(find('132')), 'possible');
  assert.equal(records.filter(r => core.paintStatus(r) === 'required').length, 3);
  assert.equal(records.filter(r => core.paintStatus(r) === 'possible').length, 4);
  for (const paint of ['No', 'Unspecified', '']) assert.equal(core.paintStatus({ filters: { paint } }), '');
  assert.equal(core.paintStatus({ filters: { paint: ' YES ' } }), 'required');
  assert.equal(core.paintStatus(find('4110B')), '');
});

test('RCOC remains classification data, not a filter, and alternatives retain their own values', () => {
  assert.ok(!Object.hasOwn(core.FILTERS, 'rcoc'));
  assert.equal(core.filter(records, '', { rcoc: ['Yes', 'Always'] }).length, 136);
  assert.deepEqual(find('110').relatedIds, [find('4110B').id]);
  assert.equal(find('110').filters.rcoc, 'Yes');
  assert.equal(find('4110B').filters.rcoc, 'Unspecified');
  assert.equal(find('4110B').filters.lanes, 'Unspecified');
  assert.equal(find('4110A').filters.rcoc, 'Maybe????');
  assert.equal(core.filter(records, '', { projectType: ['Maintenance Work'] }).length, 32);
});

test('every nonempty report adds the Always sheets once in typical-number order', () => {
  const always = ['100-GEN-KEY', '101-GEN-SPACING-CHARTS', '102-GEN-NOTES', '103-GEN-SIGN', '104-GEN-AB'];
  assert.deepEqual(records.filter(core.isAlways).map(r => r.id), always);
  for (const number of ['110', '4110B', '5000']) {
    const ids = new Set([find(number).id]);
    const report = core.report(records, ids);
    assert.deepEqual(report.map(r => r.id), [...always, find(number).id]);
    assert.deepEqual([...ids], [find(number).id]);
    assert.equal(core.selected(records, ids).length, 1);
  }
  assert.deepEqual(core.report(records, [find('101').id]).map(r => r.id), always);
  assert.equal(core.report(records, [find('101').id, find('110').id, find('110').id]).length, 6);
  assert.equal(core.report(records, records.map(r => r.id)).length, records.length);
  assert.ok(core.isAlways({ filters: { rcoc: ' ALWAYS ' } }));
  const reclassified = [{ ...find('110'), filters: { ...find('110').filters, rcoc: 'Always' } }, find('5000')];
  assert.deepEqual(core.report(reclassified, [find('5000').id]).map(r => r.number), ['110', '5000']);
  assert.deepEqual(core.report(records, []), []);
  assert.deepEqual(core.report(records, ['missing-id']), []);
});

test('saved selection retains an empty project, removes duplicates, and reports missing records', () => {
  assert.deepEqual(core.restore(records, JSON.stringify({ version: 1, ids: [] })).ids, []);
  const result = core.restore(records, JSON.stringify({ version: 1, ids: [find('110').id, find('100').id, find('110').id, 'removed-typical'] }));
  assert.deepEqual(result.ids, [find('100').id, find('110').id]);
  assert.match(result.message, /removed-typical/);
  assert.deepEqual(core.restore(records, null).ids, core.defaults(records));
  assert.match(core.restore(records, 'corrupted').message, /could not be read/);
  assert.deepEqual(core.restore(records, 'corrupted').ids, []);
  assert.equal(core.restore(records, JSON.stringify({ version: 1, ids: [], projectName: 'Maple Road resurfacing' })).projectName, 'Maple Road resurfacing');
  assert.equal(core.restore(records, JSON.stringify({ version: 1, ids: [] })).projectName, '');
  assert.equal(core.restore(records, JSON.stringify({ version: 1, ids: [], projectName: {} })).projectName, '');
});

test('filter changes do not change the separately maintained selected details', () => {
  const ids = new Set([find('110').id, find('4110A').id]);
  core.filter(records, '100', { projectType: ['Construction Projects'] });
  assert.deepEqual(core.selected(records, ids).map(r => r.number), ['110', '4110A']);
});

test('exports capture an immutable, naturally sorted selection', () => {
  const items = [find('4110A'), find('110'), find('100')];
  const snapshot = core.snapshot(items);
  items.pop();
  assert.deepEqual(snapshot.map(r => r.id), [find('100').id, find('110').id, find('4110A').id]);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot[0]) && Object.isFrozen(snapshot[0].pdf));
  assert.throws(() => core.snapshot([]), /at least one/);
});

test('Word clipboard table has exactly the two requested columns and escapes workbook text', () => {
  const items = [{ id: '110', title: '<img src=x onerror=alert(1)> & "test"' }];
  const html = core.tableHTML(items);
  assert.equal((html.match(/<th style=/g) || []).length, 2);
  assert.match(html, /Typical Number/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  assert.equal(core.tableText(items).split('\r\n').length, 2);
});

test('Word exporter produces a genuine OOXML document', async () => {
  const blob = await exportsAPI.word(core.snapshot([find('101'), find('110')]), docx);
  const data = Buffer.from(await blob.arrayBuffer());
  assert.equal(data.subarray(0, 2).toString(), 'PK');
  assert.ok(data.length > 7000);
});

test('stored PDF checksums and the corrected 101 mapping are verified', async () => {
  for (const record of records) {
    const data = await fetchFile(record.pdf.path);
    assert.equal(await digest(data), record.pdf.sha256, record.id);
    assert.equal(data.length, record.pdf.bytes, record.id);
  }
  assert.match(find('101').sourceUrl, /101-GEN-SPACING-CHARTS/);
  assert.notEqual(find('101').pdf.sha256, find('102').pdf.sha256);
});

test('PDF adds a title and linked index while preserving detail order, page boxes and rotation', async () => {
  const selection = core.snapshot([find('110'), find('101'), find('4110A')]);
  const progress = [];
  const bytes = await exportsAPI.pdf(selection, PDF, fetchFile, { ...pdfOptions, progress: (done, total) => progress.push([done, total]) });
  const combined = await PDF.PDFDocument.load(bytes);
  assert.equal(combined.getPageCount(), 2 + selection.reduce((sum, r) => sum + r.pdf.pages, 0));
  assert.equal(combined.getTitle(), 'Maple Road resurfacing - MDOT TTC Typical Details');
  assert.equal(combined.getPage(1).node.Annots().size(), selection.length);
  let offset = 2;
  for (const record of selection) {
    const source = await PDF.PDFDocument.load(await fetchFile(record.pdf.path));
    for (const page of source.getPages()) {
      const actual = combined.getPage(offset++);
      assert.deepEqual(actual.getMediaBox(), page.getMediaBox());
      assert.deepEqual(actual.getCropBox(), page.getCropBox());
      assert.deepEqual(actual.getRotation(), page.getRotation());
    }
  }
  assert.deepEqual(progress.at(-1), [selection.length, selection.length]);
});

test('missing or corrupted PDFs reject the whole packet and identify the typical', async () => {
  const selection = core.snapshot([find('100'), find('101')]);
  await assert.rejects(exportsAPI.pdf(selection, PDF, async relative => {
    if (relative === find('101').pdf.path) throw new Error('HTTP 404');
    return fetchFile(relative);
  }, pdfOptions), /101-GEN-SPACING-CHARTS.*HTTP 404.*No PDF was downloaded/);
  await assert.rejects(exportsAPI.pdf(selection, PDF, async () => Buffer.from('<html>bad response</html>'), pdfOptions), /100-GEN-KEY.*integrity/);
  const badCount = [{ ...selection[0], pdf: { ...selection[0].pdf, pages: 999 } }];
  await assert.rejects(exportsAPI.pdf(badCount, PDF, fetchFile, pdfOptions), /page count/);
});

test('PDF requires a project name and supports long names and normal punctuation', async () => {
  const selection = core.snapshot([find('100')]);
  assert.equal(exportsAPI.projectName('  Maple   Road  '), 'Maple Road');
  for (const projectName of ['', '   ', 'A'.repeat(161)]) {
    await assert.rejects(exportsAPI.pdf(selection, PDF, fetchFile, { ...pdfOptions, projectName }), /project name/);
  }
  const data = await exportsAPI.pdf(selection, PDF, fetchFile, { ...pdfOptions, projectName: 'W'.repeat(160) });
  const output = await PDF.PDFDocument.load(data);
  assert.equal(output.getPageCount(), 3);
  await assert.rejects(exportsAPI.pdf(selection, PDF, fetchFile, { ...pdfOptions, projectName: 'Maple Road \u{1f6a7}' }), /character the PDF font cannot print/);
});

test('numbered PDF preserves nonzero page origins and rotated landscape details', async () => {
  const source = await PDF.PDFDocument.create();
  for (const angle of [0, 90, 180, 270]) {
    const page = source.addPage([792, 612]);
    page.setCropBox(20, 20, 752, 572);
    page.setRotation(PDF.degrees(angle));
    page.drawText('Original detail', { x: 100, y: 100 });
  }
  const bytes = await source.save();
  const record = { id: 'TEST', title: 'Landscape rotation check', pdf: { path: 'test.pdf', pages: 4, sha256: await digest(bytes) } };
  const output = await PDF.PDFDocument.load(await exportsAPI.pdf([record], PDF, async () => bytes, pdfOptions));
  source.getPages().forEach((page, index) => {
    assert.deepEqual(output.getPage(index + 2).getCropBox(), page.getCropBox());
    assert.deepEqual(output.getPage(index + 2).getMediaBox(), page.getMediaBox());
    assert.deepEqual(output.getPage(index + 2).getRotation(), page.getRotation());
  });
});

test('empty exports and missing libraries fail clearly', async () => {
  await assert.rejects(exportsAPI.pdf([], PDF, fetchFile), /at least one/);
  await assert.rejects(exportsAPI.word([], docx), /at least one/);
  await assert.rejects(exportsAPI.word([find('100')], null), /library/);
  await assert.rejects(exportsAPI.pdf([find('100')], null, fetchFile), /library/);
});

test('catalog rejects path traversal, duplicated IDs, and missing alternatives', () => {
  for (const change of [c => c.records[0].pdf.path = '../../bad.pdf', c => c.records.push(c.records[0]), c => c.records[0].relatedIds.push('missing'),
    c => c.records[0].classifications.controlMethod = [], c => c.records[0].classifications.trafficArrangement = 'Crossover']) {
    const copy = structuredClone(catalog); change(copy);
    assert.throws(() => core.validateCatalog(copy));
  }
});
