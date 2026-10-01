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
const fflate = require('../calculators/mdot-ttc/vendor/fflate.umd.js');
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

test('new projects start with Construction filtering and no optional selections; the source catalog stays complete', () => {
  assert.deepEqual(core.defaults(records), []);
  assert.deepEqual(core.initialFilters(), { projectType: ['Construction'] });
  assert.equal(core.filter(records, '', core.initialFilters()).length, 80);
  assert.ok(core.filter(records, '', core.initialFilters()).every(record => record.family === 'construction'));
  const changed = core.initialFilters();
  changed.projectType.length = 0;
  assert.deepEqual(core.initialFilters(), { projectType: ['Construction'] });
  assert.equal(core.filter(records).length, 136);
});

test('Notes groups every GEN typical while retaining required inclusion and original source families', () => {
  const notes = core.filter(records, '', { projectType: ['Notes'] });
  assert.deepEqual(notes.map(r => r.number), ['100', '101', '102', '103', '104', '105', '106', '107']);
  assert.ok(notes.every(r => r.family === 'construction' && r.filters.projectType === 'Construction Projects'));
  assert.deepEqual(core.filter(core.selectable(records), '', { projectType: ['Notes'] }).map(r => r.number), ['105', '106', '107']);
  assert.equal(core.filter(records, '', { projectType: ['Construction', 'Notes'] }).length, 88);
  assert.deepEqual(core.filter(records, '105', { projectType: ['Notes'], mdotCode: ['GEN'], typicalSeries: ['100'] }), [find('105')]);
  assert.deepEqual(core.filter(records, '105', { projectType: ['Construction'] }), []);
  assert.deepEqual(core.possibleMatches(records, '105', { projectType: ['Construction'], workTask: ['Close the right lane'] }), []);
  assert.deepEqual(core.values({ ...find('105'), id: '108-GEN-NEW' }, 'projectType'), ['Notes']);
  assert.deepEqual(core.values({ ...find('110'), id: '110-TR-GEN' }, 'projectType'), ['Construction']);
  assert.equal(core.facetCounts(records, '', { projectType: ['Notes'] }).mdotCode.GEN, 8);
  assert.equal(core.report(records, notes.map(r => r.id)).length, 8);
  assert.equal(core.report(records, []).length, 5);
});

test('additional MDOT typicals retain source titles and do not infer workbook classifications', () => {
  const additions = records.filter(r => !r.workbookRows.length);
  assert.equal(additions.length, 39);
  for (const record of additions) {
    for (const key of ['roadwayType', 'lanes', 'workArea', 'controlType', 'paint', 'rcoc']) assert.equal(record.filters[key], 'Unspecified', record.id);
    assert.equal(record.notes, '');
    assert.equal(core.paintStatus(record), '');
  }
  assert.equal(core.filter(records, '', { projectType: ['Survey'] }).length, 16);
  assert.equal(find('302').title, 'Concrete Patch - 1 Lane Closure');
  for (const number of ['115', '116', '303', '304', '380', '4000', '4111A', '4111B', '4203B', '4204', '4221', '4222', '4224', '4231', '4400', '4401', '4402', '4403', '4405', '4420', '4421', '4422', '5000', '5110', '5122', '5123', '5125', '5133', '5181', '5182A', '5182B', '5200', '5203', '5205', '5401', '5403', '5421', '5422']) assert.ok(find(number), number);
});

test('every displayed and exported title comes from MDOT rather than the workbook', () => {
  for (const record of records) {
    assert.ok(['mdot-catalog', 'mdot-pdf'].includes(record.titleSource), record.id);
    assert.equal(record.title, record.titleSource === 'mdot-catalog' ? record.sourceTitle : ({
      '100-GEN-KEY': 'Typical Numbering Key',
      '302-SP-PATCH-1LC': 'Concrete Patch - 1 Lane Closure',
      '303-SP-PATCH-2LC': 'Concrete Patch - 2 Lane Closure',
      '304-SP-PATCH-1LC-ExR-C': 'Concrete Patch - 1 Lane and Exit Ramp Closure',
      '4180-M-TR-NFW-2L': 'Leap Frog Lane Closure on a Two-Lane, Two-Way Roadway',
      '4204-M-FW-2LC-(R)': 'Double Right Lane Closure on a Freeway Using a 10 MPH Step Down in Speed Limit',
    })[record.id], record.id);
    assert.equal(typeof record.workbookTitle, 'string', record.id);
  }
  assert.equal(find('340').title, 'Early Merge, Single Lane Closure on a 2-Lane Freeway');
  assert.equal(find('340').workbookTitle, 'Merge - Freeway');
  assert.equal(find('132').title, '1 Bound Closure with a 1-Lane Shift on a 5-Lane Undivided Roadway');
  assert.ok(core.tableText([find('340')]).includes(find('340').title));
  assert.ok(!core.tableText([find('340')]).includes('Merge - Freeway'));
});

test('filters combine AND between fields and OR within one field', () => {
  const filters = { mdotCode: ['TR', 'NFW'], workTask: ['Close the right lane'] };
  const result = core.filter(records, '', filters);
  assert.ok(result.some(r => r.number === '123'));
  assert.ok(result.length > 1);
  assert.ok(result.every(r => core.values(r, 'mdotCode').some(value => ['TR', 'NFW'].includes(value)) && core.values(r, 'workTask').includes('Close the right lane')));
  assert.deepEqual(core.filter(records, '', { workTask: ['No such value'] }), []);
  assert.deepEqual(core.filter(records, '', { existingLanes: ['No such value'] }), core.filter(records));
});

test('general typicals retain all-roadway tags while roadway criteria no longer affect filtering', () => {
  const general = ['100', '101', '102', '103', '104'].map(find);
  for (const record of general) {
    assert.deepEqual(core.values(record, 'roadwayType'), ['All roadway types']);
    assert.equal(record.filters.roadwayType, 'Unspecified');
  }
  assert.ok(!Object.hasOwn(core.FILTERS, 'roadwayType'));
  assert.ok(!Object.hasOwn(core.facetCounts(records), 'roadwayType'));
  for (const road of ['Divided', 'Freeway', 'Undivided', 'Unspecified']) {
    assert.deepEqual(core.filter(records, '', { roadwayType: [road] }), core.filter(records));
    assert.deepEqual(core.filter(records, '101 spacing', { roadwayType: [road] }).map(r => r.id), [find('101').id]);
    assert.deepEqual(core.possibleMatches(records, '', { roadwayType: [road] }), []);
  }
});

test('search finds codes, titles and notes and respects active filters', () => {
  assert.deepEqual(core.filter(records, '  101 spacing  ').map(r => r.number), ['101']);
  assert.equal(core.filter(records, 'DO NOT USE').length, 0);
  assert.equal(core.filter([{ ...find('110'), notes: 'DO NOT USE in this example' }], 'DO NOT USE').length, 1);
  assert.equal(core.filter(records, 'DO NOT USE', { projectType: ['Survey'] }).length, 0);
  assert.ok(core.filter(records, 'no speed reduction').some(r => r.number === '4110A'));
});

test('facet counts apply search and other groups while keeping same-group alternatives available', () => {
  const sample = (id, projectType) => ({ id, title: 'Lane closure', notes: '',
    filters: { projectType, workArea: 'Lane' } });
  const items = [sample('110-TR', 'Construction'), sample('120-TR', 'Survey'), sample('130-FW', 'Survey')];
  const filters = { mdotCode: ['TR'], projectType: ['Survey'] };
  const counts = core.facetCounts(items, '', filters);
  assert.deepEqual(counts.mdotCode, { FW: 1, TR: 1 });
  assert.deepEqual(counts.projectType, { Construction: 1, Survey: 1 });
  assert.deepEqual(counts.workTask, { 'Other work': 1 });
  const multiple = core.facetCounts(items, 'lane closure', { ...filters, mdotCode: ['TR', 'FW'] });
  assert.deepEqual(multiple.mdotCode, counts.mdotCode);
  assert.deepEqual(multiple.projectType, { Construction: 1, Survey: 2 });
  const searched = core.facetCounts(items, '  110  ', filters);
  assert.deepEqual(searched.mdotCode, { FW: 0, TR: 0 });
  assert.deepEqual(searched.projectType, { Construction: 1, Survey: 0 });
  assert.deepEqual(filters, { mdotCode: ['TR'], projectType: ['Survey'] });
});

test('facet counts cover every family and unspecified classification, including zero results', () => {
  assert.deepEqual(core.facetCounts(records).projectType, { 'Construction': 80, 'Highway Maintenance': 32, Notes: 8, 'Survey': 16 });
  const survey = core.facetCounts(records, '', { projectType: ['Survey'] });
  assert.equal(survey.workTask['Ramp work / closures'], 0);
  assert.equal(survey.workTask['Close the right lane'], 0);
  assert.equal(core.facetCounts(records, '', core.initialFilters()).projectType['Survey'], 16);
  const none = core.facetCounts(records, 'nonexistent-typical');
  for (const group of Object.values(none)) assert.ok(Object.values(group).every(count => count === 0));
});

test('MDOT codes match throughout filenames, combine with other filters and update all facet counts', () => {
  assert.deepEqual(core.facetCounts(records).mdotCode, {
    '(L)': 30, '(R)': 22, '2MILE': 1, AB: 1, AFAD: 2, AW: 3, C: 6, CHARTS: 1,
    CLT: 25, CROSS: 3, CruSha: 1, DUAL: 1, EM: 1, EnR: 8, ExR: 7, FREE: 2, FW: 41,
    GEN: 8, GORE: 3, HAUL: 2, IN: 9, INT: 5, KEY: 1, L: 13, LANE: 2, LC: 67,
    LD: 4, LO: 1, M: 30, MID: 5, MOB: 1, NFW: 35, NOTES: 1, O: 6, OUT: 3,
    PARK: 3, PATCH: 3, PCMS: 2, PULLOFF: 1, ROLL: 2, RUM: 4, S: 16, SD: 1,
    SHIFT: 18, SHL: 18, SIGN: 3, SINGLE: 1, SP: 20, SPACING: 1, SPEED: 3, STA: 1,
    TR: 12, TS: 3, YIELD: 2, ZIP: 5,
  });
  const intersection = { mdotCode: ['INT'] };
  assert.deepEqual(core.filter(records, '', intersection).map(r => r.number), ['160', '161', '162', '163', '164']);
  assert.equal(core.filter(records, '', { mdotCode: ['INT', 'CLT'] }).length, 29);
  assert.ok(core.filter(records, '', { mdotCode: ['CLT'] }).includes(find('150')));
  assert.ok(core.filter(records, '', { mdotCode: ['TR'] }).includes(find('4110A')));
  assert.deepEqual(core.filter(records, '', { projectType: ['Highway Maintenance'], mdotCode: ['FW'] }).map(r => r.number),
    ['4200', '4203A', '4203B', '4204', '4221', '4222', '4224', '4231', '4420', '4421', '4422']);
  assert.equal(core.filter(records, '', { projectType: ['Survey'], mdotCode: ['FW'] }).length, 5);
  assert.deepEqual(core.filter(records, '160', intersection), [find('160')]);
  const counts = core.facetCounts(records, '', { ...core.initialFilters(), ...intersection });
  assert.equal(counts.mdotCode.CLT, 20);
  assert.equal(counts.mdotCode.M, 0);
  assert.equal(counts.mdotCode.S, 0);
  assert.equal(counts.mdotCode.FW, 24);
  assert.deepEqual(counts.projectType, { Construction: 5, 'Highway Maintenance': 0, Notes: 0, Survey: 0 });
  assert.equal(counts.workTask['Intersection work'], 5);
  assert.equal(counts.workTask['Close the right lane'], 0);
  const uncertain = { workTask: ['Close the right lane'], mdotCode: ['FW'] };
  assert.ok(core.possibleMatches(records, '205-FW-1LC-(R)-SHIFT', uncertain).some(item => item.record === find('205')));
  assert.deepEqual(core.possibleMatches(records, '205-FW-1LC-(R)-SHIFT', { ...uncertain, mdotCode: ['INT'] }), []);
});

test('code parsing groups count variants and distinguishes lane counts, sides and complete tokens', () => {
  const codes = id => core.values({ id }, 'mdotCode');
  assert.deepEqual(codes('160-INT-LD-CLT-MID'), ['CLT', 'INT', 'LD', 'MID']);
  assert.deepEqual(codes('4110A-M-TR-NFW-2L'), ['L', 'M', 'NFW', 'TR']);
  assert.deepEqual(codes('152-CLT(7)-3(1R+2L)LC-2(L)SHIFT.pdf'), ['(L)', '(R)', 'CLT', 'LC', 'SHIFT']);
  assert.deepEqual(codes('202-FW-(1-2)LC-(L)'), ['(L)', 'FW', 'LC']);
  assert.deepEqual(codes('130-CLT-1(CLT)'), ['CLT']);
  assert.deepEqual(codes('125-NFW-2LC-(IN)'), ['IN', 'LC', 'NFW']);
  assert.deepEqual(codes('352-SP-GORE(4)-2LC-(L)'), ['(L)', 'GORE', 'LC', 'SP']);
  assert.deepEqual(codes('300-SP-AW-2MILE'), ['2MILE', 'AW', 'SP']);
  assert.deepEqual(codes('999-enr-EXR-crusha-tr-TR'), ['CruSha', 'EnR', 'ExR', 'TR']);
  assert.deepEqual(codes('999-NEW2CODE'), ['NEW2CODE']);
  for (const id of ['', '4110A', '999-(1)-(2)']) assert.deepEqual(codes(id), ['Unspecified']);
  assert.ok(!core.filter(records, '', { mdotCode: ['FW'] }).includes(find('110'))); // NFW is not FW.
  assert.ok(!core.filter(records, '', { mdotCode: ['(L)'] }).includes(find('110'))); // 2L counts lanes, not left.
  assert.ok(core.filter(records, '', { mdotCode: ['LC'] }).includes(find('127'))); // 0LC is notation, not a verified closure.
  assert.deepEqual(core.values(find('127'), 'workTask'), ['Shift traffic', 'Shoulder / roadside work']);
  for (const code of core.options(records, 'mdotCode')) assert.ok(core.MDOT_CODE_LABELS[code], code);
  assert.equal(core.options(core.selectable(records), 'mdotCode').length, 50);
  const repeated = { ...find('110'), id: '999-TR-TR-NFW' };
  assert.equal(core.facetCounts([repeated]).mdotCode.TR, 1);
  assert.equal(core.filter([repeated], '', { mdotCode: ['TR', 'NFW'] }).length, 1);
});

test('typical series cover MDOT number groups, letter variants and required-typical exclusions', () => {
  const available = core.selectable(records);
  assert.deepEqual(core.facetCounts(available).typicalSeries, {
    100: 3, 110: 7, 120: 8, 130: 9, 140: 3, 150: 6, 160: 5,
    200: 10, 210: 1, 220: 6, 230: 4, 300: 5, 310: 3, 320: 1,
    340: 6, 350: 3, 360: 2, 380: 1, 4000: 32, 5000: 16,
  });
  assert.deepEqual(core.filter(available, '', { typicalSeries: ['100'] }).map(r => r.number), ['105', '106', '107']);
  assert.deepEqual(core.filter(available, '', { typicalSeries: ['160'] }).map(r => r.number), ['160', '161', '162', '163', '164']);
  assert.ok(core.filter(available, '', { typicalSeries: ['300'] }).includes(find('304')));
  for (const number of ['4110A', '4110B', '4221', '4222', '4422']) assert.deepEqual(core.values(find(number), 'typicalSeries'), ['4000']);
  for (const number of ['5182A', '5182B', '5422']) assert.deepEqual(core.values(find(number), 'typicalSeries'), ['5000']);
  assert.deepEqual(core.values(find('380'), 'typicalSeries'), ['380']);
  for (const id of ['330-NEW', '390-NEW', '6000-NEW', 'invalid', '']) assert.deepEqual(core.values({ id }, 'typicalSeries'), ['Unspecified']);
});

test('series combine with other fields, keep facet alternatives and reject conflicting possible matches', () => {
  const available = core.selectable(records);
  const filters = { ...core.initialFilters(), typicalSeries: ['160', '220'] };
  assert.equal(core.filter(available, '', filters).length, 11);
  assert.equal(core.filter(available, '', { ...filters, mdotCode: ['INT'] }).length, 5);
  assert.deepEqual(core.filter(available, '', { ...filters, workTask: ['Ramp work / closures'] }).map(r => r.number), ['220', '221', '222', '223', '224', '225']);
  assert.deepEqual(core.filter(available, '161', filters), [find('161')]);
  const counts = core.facetCounts(available, '', filters);
  assert.equal(counts.typicalSeries['200'], 10);
  assert.equal(counts.typicalSeries['4000'], 0);
  assert.equal(counts.typicalSeries['5000'], 0);
  assert.deepEqual(counts.projectType, { Construction: 11, 'Highway Maintenance': 0, Notes: 0, Survey: 0 });
  assert.equal(counts.mdotCode.INT, 5);
  assert.equal(counts.mdotCode.FW, 6);
  const all = core.facetCounts(available, '', { typicalSeries: ['4000', '5000'] });
  assert.deepEqual(all.projectType, { Construction: 0, 'Highway Maintenance': 32, Notes: 0, Survey: 16 });
  assert.equal(core.filter(available, '', { typicalSeries: ['4000', '5000'], mdotCode: ['FW'] }).length, 16);
  const uncertain = { typicalSeries: ['200'], workTask: ['Close the right lane'] };
  assert.ok(core.possibleMatches(available, '205', uncertain).some(item => item.record === find('205')));
  assert.deepEqual(core.possibleMatches(available, '205', { ...uncertain, typicalSeries: ['160'] }), []);
  const unknown = { ...find('205'), id: '390-NEW' };
  assert.deepEqual(core.possibleMatches([unknown], '', uncertain), []);
  assert.deepEqual(core.options([unknown], 'typicalSeries'), ['Unspecified']);
  assert.deepEqual(core.filter([unknown], '', { typicalSeries: ['Unspecified'] }), [unknown]);
});

test('four filters offer everyday work tasks, numbered series and MDOT codes while preserving detailed classifications', () => {
  assert.deepEqual(Object.keys(core.FILTERS), ['projectType', 'typicalSeries', 'mdotCode', 'workTask']);
  assert.deepEqual(core.options(records, 'workTask'), ['Close the right lane', 'Close the left lane', 'Close the center turn lane',
    'Close multiple lanes', 'Lane closure — side unspecified', 'Shift traffic', 'Shoulder / roadside work',
    'Ramp work / closures', 'Intersection work', 'Mobile work / rolling roadblocks', 'Crossing / crossover work',
    'Traffic control / signing', 'Other work']);
  assert.ok(core.filter(records, '', { workTask: ['Close the right lane'], mdotCode: ['NFW'] }).includes(find('123')));
  assert.ok(!core.filter(records, '', { workTask: ['Close the right lane'] }).includes(find('204')));
  assert.deepEqual(core.filter(records, '', { workTask: ['Ramp work / closures'] }).map(r => r.number),
    ['220', '221', '222', '223', '224', '225', '230', '231', '232', '233', '304', '4221', '4222', '4224', '4231']);
  assert.deepEqual(core.values(find('130'), 'workTask'), ['Close the center turn lane']);
  assert.ok(core.values(find('134'), 'workTask').includes('Close multiple lanes'));
  assert.deepEqual(core.values(find('137'), 'workTask'), ['Shift traffic']);
  assert.deepEqual(core.values(find('4000'), 'workTask'), ['Shoulder / roadside work']);
  assert.deepEqual(core.values(find('122'), 'workTask'), ['Shoulder / roadside work']);
  assert.deepEqual(core.filter(records, '', { workTask: ['Other work'] }).map(r => r.number), ['320', '5182A', '5182B']);
  assert.deepEqual(core.values(find('311'), 'controlMethod'), ['Unspecified']);
  assert.equal(find('311').filters.controlType, 'Crossover');
  assert.ok(!core.filter(records, 'crush and shape').includes(find('311')));
  assert.ok(core.filter(records, 'crossover closure').includes(find('311')));
  assert.ok(core.filter(records, 'intersection work').includes(find('160')));
  assert.ok(core.filter(records, 'close the right lane').includes(find('123')));
  assert.equal(new Set(core.options(records, 'workTask').flatMap(task => core.filter(records, '', {workTask: [task]}))).size, records.length);
});

test('work tasks combine with MDOT codes, overlap without duplicates, and count alternatives', () => {
  const criteria = { workTask: ['Close the right lane', 'Close the left lane'], mdotCode: ['NFW', 'CLT'] };
  const result = core.filter(records, '', criteria);
  assert.equal(result.filter(r => r.number === '124').length, 1);
  assert.ok(result.every(r => core.values(r, 'mdotCode').some(value => ['NFW', 'CLT'].includes(value))));
  const counts = core.facetCounts([find('124')], '', criteria);
  assert.deepEqual(counts.workTask, { 'Close the right lane': 1, 'Close the left lane': 1, 'Close multiple lanes': 1, 'Shift traffic': 1 });
  assert.equal(core.filter(records, '', { workTask: ['Shoulder / roadside work'] }).length, 18);
});

test('compact activities cover all optional details, with reviewed specialized exceptions and shared matches', () => {
  const available = core.selectable(records);
  assert.deepEqual(core.facetCounts(available).workTask, {
    'Close the right lane': 21, 'Close the left lane': 30, 'Close the center turn lane': 4,
    'Close multiple lanes': 33, 'Lane closure — side unspecified': 25, 'Shift traffic': 23,
    'Shoulder / roadside work': 18, 'Ramp work / closures': 15, 'Intersection work': 5,
    'Mobile work / rolling roadblocks': 8, 'Crossing / crossover work': 5, 'Traffic control / signing': 9, 'Other work': 3,
  });
  assert.equal(new Set(core.options(available, 'workTask').flatMap(task => core.filter(available, '', { workTask: [task] }))).size, 131);
  for (const [number, expected] of [
    ['140', ['Shift traffic']], ['225', ['Shift traffic', 'Ramp work / closures']],
    ['223', ['Ramp work / closures']], ['4224', ['Ramp work / closures']],
    ['5000', ['Shoulder / roadside work']], ['160', ['Intersection work']],
    ['4403', ['Mobile work / rolling roadblocks']], ['361', ['Close the left lane', 'Mobile work / rolling roadblocks']],
    ['113', ['Crossing / crossover work']], ['310', ['Crossing / crossover work']],
    ['205', ['Lane closure — side unspecified', 'Shift traffic', 'Shoulder / roadside work']],
  ]) assert.deepEqual(core.values(find(number), 'workTask'), expected, number);
  const overlapping = core.filter(available, '', { workTask: ['Shift traffic', 'Ramp work / closures'], mdotCode: ['FW'], typicalSeries: ['220'] });
  assert.deepEqual(overlapping.map(r => r.number), ['220', '221', '222', '223', '224', '225']);
  assert.deepEqual(core.filter(available, '225 shift traffic'), [find('225')]);
});

test('standalone signing typicals are identified without turning incidental warning or speed references into signing tasks', () => {
  for (const number of ['100', '101', '102', '103', '104', '105', '106', '107', '120', '121', '300', '301', '380', '4121']) {
    assert.deepEqual(core.values(find(number), 'workTask'), ['Traffic control / signing'], number);
    for (const task of ['Close the right lane', 'Close the left lane', 'Close the center turn lane', 'Close multiple lanes', 'Lane closure — side unspecified']) {
      assert.deepEqual(core.filter([find(number)], '', { workTask: [task] }), [], number);
      assert.deepEqual(core.possibleMatches([find(number)], '', { workTask: [task] }), [], number);
    }
  }
  for (const number of ['114', '4110B', '4203B', '4204']) assert.ok(!core.values(find(number), 'workTask').includes('Traffic control / signing'), number);
  // A filename-only listing can use its verified document title, without interpreting filename tokens.
  assert.deepEqual(core.values({ ...find('380'), sourceTitle: find('380').id }, 'workTask'), ['Traffic control / signing']);
});

test('unspecified closure sides are possible matches but shifts, parking and known opposite sides are not', () => {
  const right = { workTask: ['Close the right lane'] };
  const main = core.filter(records, '', right), possible = core.possibleMatches(records, '', right);
  for (const number of ['302', '4110A', '5123', '5203', '5205']) {
    assert.ok(!main.includes(find(number)), number);
    assert.ok(core.values(find(number), 'workTask').includes('Lane closure — side unspecified'), number);
    assert.deepEqual(possible.find(item => item.record.number === number).missingFields, ['workTask']);
  }
  for (const number of ['204', '137', '140', '200', '220']) assert.ok(!possible.some(item => item.record.number === number), number);
  for (const number of ['204', '137', '140', '200', '220', '5182A']) assert.ok(!core.values(find(number), 'workTask').includes('Lane closure — side unspecified'), number);
  const center = { workTask: ['Close the center turn lane'] };
  assert.ok(!core.filter(records, '', center).includes(find('4133A')));
  assert.deepEqual(core.possibleMatches(records, '', center).find(item => item.record.number === '4133A').missingFields, ['workTask']);
  assert.ok(!core.possibleMatches(records, '', center).some(item => item.record.number === '5182A'));
});

test('roadway metadata retains two-way maintenance, survey and shared applicability for cards and search', () => {
  for (const number of ['4110A', '4110B', '4111A', '4111B', '4121', '4122', '4180', '4401', '4405', '5110', '5122', '5181', '5182A', '5182B', '5401']) {
    assert.ok(core.values(find(number), 'roadwayType').includes('Undivided'), number);
    assert.equal(find(number).filters.roadwayType, 'Unspecified');
  }
  for (const roadwayType of ['Undivided', 'Divided', 'Freeway']) {
    assert.ok(core.values(find('5401'), 'roadwayType').includes(roadwayType));
  }
  assert.deepEqual(core.filter(records, '5401 undivided'), [find('5401')]);
  assert.deepEqual(core.values(find('5110'), 'roadwayType'), ['Undivided']);
  assert.deepEqual(core.values(find('5421'), 'roadwayType'), ['Unspecified']);
});

test('lane information separates existing geometry, closure counts and shoulder work on cards', () => {
  assert.ok(!Object.hasOwn(core.FILTERS, 'lanes'));
  assert.ok(!Object.hasOwn(core.FILTERS, 'existingLanes'));
  assert.deepEqual(core.values(find('110'), 'existingLanes'), ['2 total (both directions)']);
  assert.deepEqual(core.values(find('110'), 'lanesClosed'), ['1 lane']);
  assert.deepEqual(core.values(find('202'), 'existingLanes'), ['3 in affected direction']);
  assert.deepEqual(core.values(find('202'), 'lanesClosed'), ['1 lane', '2 lanes']);
  assert.equal(core.filter(records, '', { workTask: ['Close the left lane', 'Close multiple lanes'] }).filter(r => r.number === '202').length, 1);
  assert.deepEqual(core.facetCounts([find('202')]).workTask, { 'Close the left lane': 1, 'Close multiple lanes': 1 });
  assert.deepEqual(core.values(find('225'), 'existingLanes'), ['1 on ramp']);
  assert.deepEqual(core.values(find('205'), 'existingLanes'), ['Unspecified']);
  assert.ok(core.values(find('205'), 'workArea').includes('Shoulder'));
  assert.equal(find('205').filters.lanes, '2+,Shoulder');
  assert.deepEqual(core.values(find('122'), 'lanesClosed'), ['No lane closure']);
  assert.deepEqual(core.values(find('131'), 'lanesClosed'), ['Unspecified']);
  assert.deepEqual(core.values(find('137'), 'lanesClosed'), ['Unspecified']);
  assert.ok(core.options(records, 'existingLanes').every(value => !value.includes('+') && !value.includes('Shoulder')));
});

test('possible matches recover unspecified applicability without relaxing known conflicts or search', () => {
  const filters = { projectType: ['Construction'], mdotCode: ['FW'], workTask: ['Close the right lane', 'Close the left lane'] };
  const main = core.filter(records, '', filters);
  const possible = core.possibleMatches(records, '', filters);
  assert.deepEqual(possible.find(item => item.record.number === '205').missingFields, ['workTask']);
  assert.ok(main.includes(find('203')));
  assert.ok(main.some(record => record.number === '202'));
  assert.ok(!possible.some(item => ['202', '208', '123', '4203A'].includes(item.record.number)));
  assert.ok(possible.every(item => !main.includes(item.record)));
  assert.deepEqual(possible.map(item => item.record.id), core.sort(possible.map(item => item.record)).map(record => record.id));
  assert.equal(new Set(possible.map(item => item.record.id)).size, possible.length);
  assert.equal(core.possibleMatches(records, '205-FW-1LC-(R)-SHIFT', filters).length, 1);
  assert.deepEqual(core.possibleMatches(records, 'no-such-typical', filters), []);
  assert.deepEqual(core.possibleMatches(records), []);
  assert.deepEqual(core.possibleMatches(records, '', { projectType: ['No such category'] }), []);
  const includeKnown = { ...filters, workTask: ['Close the right lane', 'Shoulder / roadside work'] };
  assert.ok(core.filter(records, '', includeKnown).includes(find('205')));
  assert.ok(!core.possibleMatches(records, '', includeKnown).some(item => item.record.number === '205'));
  const explicitSide = { ...filters, workTask: ['Close the right lane'] };
  assert.ok(core.possibleMatches(records, '', explicitSide).some(item => item.record.number === '205'));
  assert.ok(!core.possibleMatches(records, '', explicitSide).some(item => item.record.number === '204'));
  assert.deepEqual(core.filter(records, '5403', { projectType: ['Survey'], workTask: ['Mobile work / rolling roadblocks'] }), [find('5403')]);
  assert.deepEqual(core.possibleMatches(records, '5403', { projectType: ['Survey'], workTask: ['Mobile work / rolling roadblocks'] }), []);
  assert.equal(core.facetCounts(records, '205', filters).workTask['Close the right lane'], 0);
});

test('work situations include moving work, roadway-center work, encroachment and ramp operations', () => {
  assert.deepEqual(records.filter(record => core.values(record, 'workSituation').includes('Mobile operation')).map(record => record.number), ['4403', '4421', '4422', '5403', '5421', '5422']);
  assert.deepEqual(records.filter(record => core.values(record, 'workSituation').includes('Road center work')).map(record => record.number), ['5182A', '5182B']);
  assert.ok(core.filter(records, '', { workTask: ['Ramp work / closures'] }).includes(find('4224')));
  assert.deepEqual(core.values(find('4405'), 'workSituation'), ['Lane encroachment', 'Shoulder work']);
  assert.equal(core.filter(records, '', { workTask: ['Shoulder / roadside work'] }).filter(record => record.number === '4405').length, 1);
});

test('lane position distinguishes center, left/right and parking without changing closure counts', () => {
  for (const number of ['133', '151', '4133A', '4133B', '5133']) {
    assert.ok(core.values(find(number), 'lanePosition').includes('Center lane'), number);
    assert.ok(core.values(find(number), 'lanePosition').includes('Left / inside'), number);
  }
  assert.deepEqual(core.values(find('203'), 'lanePosition'), ['Right / outside']);
  assert.deepEqual(core.values(find('204'), 'lanePosition'), ['Left / inside']);
  assert.deepEqual(records.filter(record => core.values(record, 'lanePosition').includes('Parking lane')).map(record => record.number), ['140', '141', '142']);
  const both = core.filter(records, '', { workTask: ['Close the left lane', 'Close the right lane'] });
  assert.equal(both.filter(record => record.number === '124').length, 1);
  assert.deepEqual(core.values(find('124'), 'lanesClosed'), ['2 lanes']);
});

test('closure activities use reviewed directions instead of workbook work-area positions', () => {
  const right = { workTask: ['Close the right lane'] }, left = { workTask: ['Close the left lane'] };
  assert.deepEqual(core.values(find('131'), 'workTask'), ['Close the left lane', 'Close multiple lanes', 'Shift traffic']);
  assert.deepEqual(core.values(find('132'), 'workTask'), ['Close the right lane', 'Close multiple lanes', 'Shift traffic']);
  assert.ok(!core.filter(records, '', right).includes(find('131')));
  assert.ok(!core.possibleMatches(records, '', right).some(item => item.record === find('131')));
  assert.ok(!core.possibleMatches(records, '', left).some(item => item.record === find('132')));
  assert.deepEqual(core.values(find('110'), 'workTask'), ['Lane closure — side unspecified']);
  for (const criteria of [left, right]) {
    assert.ok(!core.filter(records, '', criteria).includes(find('110')));
    assert.ok(core.possibleMatches(records, '', criteria).some(item => item.record === find('110')));
    for (const number of ['120', '121', '127', '136', '137', '138']) {
      assert.ok(!core.filter(records, '', criteria).includes(find(number)), number);
      assert.ok(!core.possibleMatches(records, '', criteria).some(item => item.record === find(number)), number);
    }
  }
  for (const number of ['202', '206']) assert.ok(core.filter(records, '', left).includes(find(number)));
  assert.equal(find('131').filters.workArea, '2 outside lanes'); // Preserve the original workbook.
  assert.deepEqual(core.filter(records, '131 close the left lane'), [find('131')]);
});

test('applicability conditions preserve MDOT qualifiers and are searchable', () => {
  assert.deepEqual(find('164').conditions, ['Less than 1 Hour']);
  assert.deepEqual(find('4400').conditions, ['Traffic Volumes Less than 10,000 ADT', 'Adequate Sight Distances']);
  assert.deepEqual(find('4402').conditions, ['Speed Limits 45 MPH or Less', 'With Curbs']);
  assert.deepEqual(find('5182A').conditions, ['Posted Speeds of 55 MPH or Less']);
  assert.deepEqual(find('4110B').conditions, ['Maximum 10 MPH Speed Reduction']);
  assert.deepEqual(find('110').conditions, []);
  assert.ok(core.filter(records, 'adequate sight distances').includes(find('4400')));
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
  assert.equal(core.filter(records, '', { projectType: ['Highway Maintenance'] }).length, 32);
});

test('every project includes required typicals 100-104 once, even with no optional selections', () => {
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
  assert.ok(core.isAlways({ id: '100-GEN-KEY', filters: { rcoc: 'Unspecified' } }));
  const reclassified = [{ ...find('110'), filters: { ...find('110').filters, rcoc: 'Always' } }, find('5000')];
  assert.deepEqual(core.report(reclassified, [find('5000').id]).map(r => r.number), ['5000']);
  assert.deepEqual(core.report(records, []).map(r => r.id), always);
  assert.deepEqual(core.report(records, ['missing-id']).map(r => r.id), always);
});

test('required typicals are excluded from browsing and all filter counts', () => {
  const available = core.selectable(records);
  assert.equal(available.length, 131);
  assert.equal(core.filter(available, '', core.initialFilters()).length, 80);
  assert.ok(!available.some(core.isAlways));
  assert.deepEqual(core.filter(available, '101-GEN-SPACING-CHARTS'), []);
  assert.deepEqual(core.facetCounts(available).projectType, { Construction: 80, 'Highway Maintenance': 32, Notes: 3, Survey: 16 });
  assert.equal(core.facetCounts(available).mdotCode.GEN, 3);
  assert.deepEqual(core.possibleMatches(available, '101-GEN-SPACING-CHARTS', { workTask: ['Close the right lane'] }), []);
});

test('saved selections migrate required typicals out of manual choices without reporting them missing', () => {
  assert.deepEqual(core.restore(records, JSON.stringify({ version: 1, ids: [] })).ids, []);
  const result = core.restore(records, JSON.stringify({ version: 1, ids: [find('110').id, find('100').id, find('110').id, 'removed-typical'] }));
  assert.deepEqual(result.ids, [find('110').id]);
  assert.match(result.message, /removed-typical/);
  assert.doesNotMatch(result.message, /100-GEN-KEY/);
  assert.deepEqual(core.restore(records, null).ids, core.defaults(records));
  assert.match(core.restore(records, 'corrupted').message, /could not be read/);
  assert.deepEqual(core.restore(records, 'corrupted').ids, []);
  assert.equal(core.restore(records, JSON.stringify({ version: 1, ids: [], projectName: 'Maple Road resurfacing' })).projectName, 'Maple Road resurfacing');
  assert.equal(core.restore(records, JSON.stringify({ version: 1, ids: [] })).projectName, '');
  assert.equal(core.restore(records, JSON.stringify({ version: 1, ids: [], projectName: {} })).projectName, '');
});

test('filter changes do not change the separately maintained selected details', () => {
  const ids = new Set([find('110').id, find('4110A').id]);
  core.filter(records, '100', { projectType: ['Construction'] });
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

test('ZIP contains the exact original PDFs in table order, including Always typicals once', async () => {
  const selection = core.snapshot(core.report(records, [find('110').id, find('100').id, find('124').id, find('4110A').id, find('5110').id]));
  const progress = [];
  const bytes = await exportsAPI.zip(selection, fflate, PDF, fetchFile, { digest, progress: (...args) => progress.push(args) });
  const files = fflate.unzipSync(bytes);
  assert.deepEqual(Object.keys(files), selection.map(r => r.id + '.pdf'));
  for (const record of selection) {
    assert.deepEqual(Buffer.from(files[record.id + '.pdf']), await fetchFile(record.pdf.path), record.id);
  }
  assert.equal(Object.keys(files).filter(name => name === '100-GEN-KEY.pdf').length, 1);
  assert.ok(files['124-NFW-2(R+L)LC-SHIFT.pdf']);
  assert.deepEqual(progress.map(([done, total]) => [done, total]), Array.from({ length: selection.length + 1 }, (_, i) => [i, selection.length]));
});

test('ZIP rejects missing, corrupt, invalid or duplicated files without creating an archive', async () => {
  const selection = core.snapshot([find('100'), find('101')]);
  let packages = 0;
  const library = { zipSync: (...args) => { packages++; return fflate.zipSync(...args); } };
  await assert.rejects(exportsAPI.zip(selection, library, PDF, async relative => {
    if (relative === find('101').pdf.path) throw new Error('HTTP 404');
    return fetchFile(relative);
  }, { digest }), error => error.typicalId === find('101').id && /HTTP 404.*No ZIP was downloaded/.test(error.message));
  await assert.rejects(exportsAPI.zip(selection, library, PDF, async () => Buffer.from('corrupt'), { digest }), /100-GEN-KEY.*integrity.*No ZIP/);
  const badCount = [{ ...selection[0], pdf: { ...selection[0].pdf, pages: 999 } }];
  await assert.rejects(exportsAPI.zip(badCount, library, PDF, fetchFile, { digest }), /page count/);
  const invalidBytes = Buffer.from('not a PDF');
  const invalidPDF = [{ ...selection[0], pdf: { ...selection[0].pdf, sha256: await digest(invalidBytes) } }];
  await assert.rejects(exportsAPI.zip(invalidPDF, library, PDF, async () => invalidBytes, { digest }), /100-GEN-KEY.*No ZIP/);
  await assert.rejects(exportsAPI.zip([selection[0], selection[0]], library, PDF, fetchFile, { digest }), /duplicated/);
  await assert.rejects(exportsAPI.zip([{ ...selection[0], id: '../outside' }], library, PDF, fetchFile, { digest }), /invalid filename/);
  assert.equal(packages, 0);
});

test('ZIP filenames use an optional project name and remove filesystem separators', () => {
  assert.equal(exportsAPI.zipFilename(''), 'mdot-ttc-details.zip');
  assert.equal(exportsAPI.zipFilename('   '), 'mdot-ttc-details.zip');
  assert.equal(exportsAPI.zipFilename(' Maple  Road '), 'Maple Road-mdot-ttc-details.zip');
  assert.equal(exportsAPI.zipFilename('Maple/Road: Phase 1?'), 'Maple-Road- Phase 1--mdot-ttc-details.zip');
  assert.doesNotMatch(exportsAPI.zipFilename('../\\<invalid>|*\u0000'), /[<>:"/\\|?*\u0000-\u001f]/);
});

test('locally pinned export and preview libraries match the manifest checksums', async () => {
  const manifest = require('../calculators/mdot-ttc/vendor/manifest.json');
  assert.deepEqual(manifest.map(lib => lib.name).sort(), ['docx', 'fflate', 'pdf-lib', 'pdfjs-dist']);
  for (const lib of manifest) {
    for (const asset of [lib, ...(lib.assets || [])]) {
      assert.equal(await digest(fs.readFileSync(path.join(folder, 'vendor', asset.file))), asset.sha256, asset.file);
    }
  }
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
  await assert.rejects(exportsAPI.zip([], fflate, PDF, fetchFile), /at least one/);
  await assert.rejects(exportsAPI.zip([find('100')], null, PDF, fetchFile), /ZIP export library/);
  await assert.rejects(exportsAPI.zip([find('100')], fflate, null, fetchFile), /PDF verification library/);
});

test('catalog rejects path traversal, duplicated IDs, missing alternatives and missing required typicals', () => {
  for (const change of [c => c.records[0].pdf.path = '../../bad.pdf', c => c.records.push(c.records[0]), c => c.records[0].relatedIds.push('missing'),
    c => c.records[0].classifications.controlMethod = [], c => c.records[0].classifications.trafficArrangement = 'Crossover',
    c => c.records = c.records.filter(record => record.number !== '100')]) {
    const copy = structuredClone(catalog); change(copy);
    assert.throws(() => core.validateCatalog(copy));
  }
});
