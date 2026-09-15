const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/alignmentPageHarness.cjs');
const G = require('../scripts/accessDensityCore.js');

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .02, `${actual} near ${expected}`);
const values = page => page.rows().map(row => row.children.map(cell => cell.textContent));
const station = meters => G.formatStation(G.toFeet(meters), 2);
function straight() {
  const page = harness();
  page.click(0, 0); page.click(304.8, 0); page.press('finishBtn'); page.press('accessBtn');
  return page;
}
function curve() {
  const page = harness();
  page.click(0, 0); page.click(100, 0); page.press('curveBtn');
  page.click(100 + 100 / Math.sqrt(2), 100 - 100 / Math.sqrt(2));
  page.click(200, 100); page.click(200, 250); page.press('accessBtn');
  return page;
}

test('access mode requires a valid stationed alignment and does not append alignment sections', () => {
  const page = harness();
  assert.equal(page.get('accessBtn').disabled, true);
  page.click(0, 0);
  assert.equal(page.get('accessBtn').disabled, true);
  page.click(304.8, 0);
  assert.equal(page.get('accessBtn').disabled, false);
  page.press('curveBtn');
  assert.equal(page.get('accessBtn').disabled, true);
  page.press('drawBtn'); page.press('accessBtn');
  const before = page.lines().length;
  page.click(76.2, 30);
  assert.equal(page.get('accessBtn').attributes['aria-pressed'], 'true');
  assert.equal(page.lines().length, before);
  near(page.lengthFeet(), 1000);
  assert.deepEqual(values(page), [['2+50.00', 'Residential', '']]);
  assert.equal(harness({ mapAvailable: false }).get('accessBtn').disabled, true);
});

test('access markers stay exactly at clicks; offset does not affect station or exclude points', () => {
  const page = straight();
  for (const y of [15, -600]) { page.click(152.4, y); page.press('accessSave'); }
  const markers = page.accessMarkers();
  near(page.xy(markers[0].coordinates).x, 152.4);
  near(page.xy(markers[0].coordinates).y, 15);
  near(page.xy(markers[1].coordinates).y, -600);
  assert.deepEqual(values(page), [['5+00.00', 'Residential', ''], ['5+00.00', 'Residential', '']]);
  page.click(-30, 10); page.press('accessSave');
  page.click(500, 10); page.press('accessSave');
  assert.deepEqual(values(page).map(row => row[0]), ['0+00.00', '5+00.00', '5+00.00', '10+00.00']);
});

test('R/C/N choose distinct markers; Save, Enter, and the next click support repeated entry', () => {
  const page = straight();
  page.click(250, 40);
  page.key('C');
  assert.equal(page.get('accessType').value, 'commercial');
  assert.match(page.accessMarkers()[0].options.icon.className, /access-commercial/);
  page.press('accessSave');
  assert.equal(page.popup(), undefined);
  page.click(200, 20);
  assert.equal(page.get('accessType').value, 'commercial');
  page.click(100, 30); // Keep the previous point and start the next without an extra Save click.
  assert.equal(page.rows().length, 3);
  page.key('r', page.get('accessSave'));
  assert.match(page.accessMarkers()[2].options.icon.className, /access-residential/);
  page.key('Enter', page.get('accessSave'));
  assert.equal(page.popup(), undefined);
  page.click(50, 30); page.key('n', page.get('accessSave'));
  assert.equal(page.get('accessName').parentElement.hidden, false);
  assert.equal(page.activeElement(), page.get('accessName'));
  page.input('accessName', '  University Dr  ');
  page.key('Enter', page.get('accessName'));
  assert.equal(page.popup(), undefined);
  assert.deepEqual(values(page)[0], [station(50), 'Named Road / Access', 'University Dr']);
  assert.match(page.accessMarkers()[3].options.icon.className, /access-named/);
  assert.equal(page.rows().filter(row => row.classList.contains('is-selected')).length, 1);
});

test('shortcuts leave names, modifier shortcuts, and alignment modes alone', () => {
  const page = straight();
  page.click(50, 20); page.key('n');
  const name = page.get('accessName');
  page.input('accessName', 'Crane Road');
  for (const key of ['r', 'c', 'n']) {
    assert.equal(page.key(key, name).defaultPrevented, undefined);
    assert.equal(page.get('accessType').value, 'named');
  }
  page.key('r', page.get('accessSave'), { ctrlKey: true });
  page.key('c', page.get('accessSave'), { metaKey: true });
  assert.equal(page.get('accessType').value, 'named');
  page.press('finishBtn');
  page.clickMarker(page.accessMarkers()[0]);
  page.key('r');
  assert.equal(page.get('accessType').value, 'named');
});

test('table rows sort numerically and locate/highlight the correct marker; Delete removes only that point', () => {
  const page = straight();
  page.click(250, 30); page.press('accessSave');
  page.click(50, 30); page.key('n'); page.input('accessName', '<img src=x onerror=alert(1)>'); page.press('accessSave');
  const firstMarker = page.accessMarkers()[1];
  page.click(152.4, 30); page.press('accessSave');
  assert.deepEqual(values(page).map(row => row[0]), [station(50), '5+00.00', station(250)]);
  const row = page.rows()[0];
  assert.equal(row.children[2].children.length, 0); // Names are text, never HTML.
  row.fire('click');
  near(page.xy(page.center()).x, 50);
  assert.equal(firstMarker.getElement().classList.contains('is-selected'), true);
  assert.equal(page.get('accessName').value, '<img src=x onerror=alert(1)>');
  page.press('accessDelete');
  assert.equal(page.accessMarkers().length, 2);
  assert.equal(page.rows().length, 2);
  assert.ok(!page.accessMarkers().includes(firstMarker));
  page.key('Enter', page.rows()[0]);
  assert.ok(page.popup());
  assert.equal(page.rows()[0].classList.contains('is-selected'), true);
});

test('dragging an access point updates its station and table order before dragend', () => {
  const page = straight();
  page.click(76.2, 20); page.press('accessSave');
  page.click(152.4, 20); page.press('accessSave');
  const first = page.accessMarkers()[0];
  const icon = first.options.icon;
  page.drag(first, 228.6, -35, () => {
    assert.equal(first.options.icon, icon, 'Selecting during drag keeps the same icon and Leaflet drag handler');
    near(page.xy(first.coordinates).y, -35);
    assert.deepEqual(values(page).map(row => row[0]), ['5+00.00', '7+50.00']);
    assert.equal(page.rows()[1].classList.contains('is-selected'), true);
  });
  near(page.lengthFeet(), 1000);
});

test('access stations project onto true arcs and update after a curve radius edit', () => {
  const page = curve();
  const x = 100 + 110 / Math.sqrt(2), y = 100 - 110 / Math.sqrt(2);
  page.click(x, y); page.press('accessSave');
  page.click(220, 200); page.press('accessSave');
  assert.deepEqual(values(page).map(row => row[0]), [station(100 + 25 * Math.PI), station(200 + 50 * Math.PI)]);
  const before = page.accessMarkers().map(marker => ({ ...marker.coordinates }));
  page.drag('MID', 150 + 50 / Math.sqrt(2), 50 - 50 / Math.sqrt(2), () => {
    assert.equal(values(page).at(-1)[0], station(300 + 25 * Math.PI));
    assert.notEqual(values(page)[0][0], station(100 + 25 * Math.PI));
  });
  assert.deepEqual(page.accessMarkers().map(marker => ({ ...marker.coordinates })), before);
});

test('all stations recalculate after moving the alignment start, with live popup station and no moved access coordinates', () => {
  const page = straight();
  page.click(152.4, 20); page.press('accessSave');
  page.click(228.6, 20);
  const before = page.accessMarkers().map(marker => ({ ...marker.coordinates }));
  page.drag('0', 30.48, 0, () => {
    assert.deepEqual(values(page).map(row => row[0]), ['4+00.00', '6+50.00']);
    assert.equal(page.popup().content.children[0].textContent, 'Station 6+50.00');
  });
  assert.deepEqual(page.accessMarkers().map(marker => ({ ...marker.coordinates })), before);
});

test('switching modes preserves accesses and Reset clears the alignment and all access UI', () => {
  const page = straight();
  page.click(100, 20); page.press('drawBtn');
  assert.equal(page.popup(), undefined);
  page.click(400, 0);
  assert.equal(page.accessMarkers().length, 1);
  assert.equal(page.rows().length, 1);
  page.press('resetBtn');
  assert.equal(page.accessMarkers().length, 0);
  assert.equal(page.rows().length, 0);
  assert.equal(page.get('accessEmpty').hidden, false);
  assert.equal(page.get('accessBtn').disabled, true);
  assert.equal(page.handles().length, 0);
  assert.equal(page.popup(), undefined);
});
