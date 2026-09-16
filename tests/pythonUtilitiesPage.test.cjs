const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../scripts/pythonUtilities.js'), 'utf8');
const downloadableSource = fs.readFileSync(path.join(__dirname, '../python/fill_empty_txt_files.py'), 'utf8');

function control(properties = {}) {
    const listeners = {};
    return Object.assign({
        hidden: false,
        disabled: false,
        textContent: '',
        addEventListener(type, callback) { listeners[type] = callback; },
        dispatch(type) { return listeners[type](); },
        focus() { this.focused = true; },
    }, properties);
}

function setup(fetch, clipboard, count = 1) {
    const items = Array.from({ length: count }, (_, index) => ({
        '[data-download]': control({
            getAttribute: () => 'python/utility-' + index + '.py',
        }),
        '.utility-source': control({ open: false }),
        '[data-source-code]': control(),
        '[data-source-pre]': control({ hidden: true }),
        '[data-source-status]': control(),
        '[data-copy]': control({ disabled: true }),
        '[data-retry]': control({ hidden: true }),
    }));
    const selection = {
        removeAllRanges() { this.removed = true; },
        addRange(range) { this.range = range; },
    };
    const document = {
        querySelectorAll: () => items.map((elements) => ({
            querySelector: (selector) => elements[selector],
        })),
        createRange: () => ({ selectNodeContents(node) { this.node = node; } }),
    };
    vm.runInNewContext(script, {
        document, navigator: { clipboard }, window: { getSelection: () => selection }, fetch,
    });
    async function open(index = 0) {
        const details = items[index]['.utility-source'];
        details.open = true;
        details.dispatch('toggle');
        await new Promise(setImmediate);
    }
    return { items, selection, open };
}

test('loads source on demand from its download link and copies the identical file', async () => {
    const requested = [];
    let copied;
    const page = setup(async (url) => {
        requested.push(url);
        return { ok: true, text: async () => downloadableSource };
    }, { writeText: async (text) => { copied = text; } });
    assert.equal(requested.length, 0);
    await page.open();
    const item = page.items[0];
    assert.deepEqual(requested, ['python/utility-0.py']);
    assert.equal(item['[data-source-code]'].textContent, downloadableSource);
    assert.equal(item['[data-source-pre]'].hidden, false);
    assert.equal(item['[data-copy]'].disabled, false);
    await item['[data-copy]'].dispatch('click');
    assert.equal(copied, downloadableSource);
    assert.match(item['[data-source-status]'].textContent, /Code copied/);
    await page.open();
    assert.equal(requested.length, 1);
});

test('HTTP failure leaves download available and retry can recover', async () => {
    let attempts = 0;
    const page = setup(async () => {
        attempts += 1;
        return { ok: attempts > 1, text: async () => downloadableSource };
    });
    await page.open();
    const item = page.items[0];
    assert.equal(item['[data-download]'].hidden, false);
    assert.equal(item['[data-source-pre]'].hidden, true);
    assert.equal(item['[data-copy]'].disabled, true);
    assert.equal(item['[data-retry]'].hidden, false);
    assert.match(item['[data-source-status]'].textContent, /still download/);
    await item['[data-retry]'].dispatch('click');
    assert.equal(item['[data-retry]'].hidden, true);
    assert.equal(item['[data-source-code]'].textContent, downloadableSource);
    assert.equal(item['[data-copy]'].disabled, false);
});

test('network failure stays within the affected utility', async () => {
    const page = setup(async (url) => {
        if (url.endsWith('utility-0.py')) throw new Error('Offline');
        return { ok: true, text: async () => 'second script' };
    }, undefined, 2);
    await page.open(0);
    await page.open(1);
    assert.match(page.items[0]['[data-source-status]'].textContent, /could not be loaded/);
    assert.equal(page.items[0]['[data-copy]'].disabled, true);
    assert.equal(page.items[1]['[data-source-code]'].textContent, 'second script');
    assert.equal(page.items[1]['[data-copy]'].disabled, false);
});

test('unavailable or denied clipboard selects the source for manual copying', async () => {
    for (const clipboard of [
        undefined,
        { writeText: async () => { throw new Error('Permission denied'); } },
    ]) {
        const page = setup(async () => ({ ok: true, text: async () => downloadableSource }), clipboard);
        await page.open();
        const item = page.items[0];
        await item['[data-copy]'].dispatch('click');
        assert.equal(item['[data-source-pre]'].focused, true);
        assert.equal(page.selection.removed, true);
        assert.equal(page.selection.range.node, item['[data-source-code]']);
        assert.match(item['[data-source-status]'].textContent, /press Ctrl\+C/);
        assert.doesNotMatch(item['[data-source-status]'].textContent, /Code copied/);
    }
});

test('opening a section repeatedly during loading makes only one request', async () => {
    let requests = 0;
    let complete;
    const page = setup(() => {
        requests += 1;
        return new Promise((resolve) => { complete = resolve; });
    });
    await page.open();
    await page.open();
    assert.equal(requests, 1);
    complete({ ok: true, text: async () => downloadableSource });
    await new Promise(setImmediate);
    assert.equal(page.items[0]['[data-copy]'].disabled, false);
});
