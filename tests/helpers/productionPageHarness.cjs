// Minimal DOM for exercising the real static page's event handlers without dependencies.
// This verifies behavior, not browser rendering or layout.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
module.exports = function pageHarness(saved = null, failStorage = false) {
  const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39);/g, c => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[c]);
  let focused = null, prints = 0, document;
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.handlers = {}; this.hidden = false; this.checked = false; this.open = false; this._text = ''; }
    get id() { return this.attributes.id; }
    get type() { return this.attributes.type || ''; }
    get className() { return this.attributes.class || ''; }
    set className(value) { this.attributes.class = value; }
    get classList() { return { add: c => { if (!this.className.split(' ').includes(c)) this.className += ` ${c}`; }, remove: c => this.className = this.className.split(' ').filter(x => x !== c).join(' ') }; }
    get value() {
      if (this._value !== undefined) return this._value;
      if (this.tagName === 'select') { const opts = this.querySelectorAll('option'); return (opts.find(o => o.attributes.selected !== undefined) || opts[0])?.value || ''; }
      if (this.tagName === 'textarea') return this.textContent;
      return this.attributes.value || '';
    }
    set value(v) { this._value = String(v); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this.children = []; this._text = String(v); }
    set innerHTML(html) { this.children = []; this._text = ''; this._value = undefined; parse(html, this); }
    get innerHTML() { return this.children.map(c => c.tagName === '#text' ? c._text : `<${c.tagName}>${c.innerHTML}</${c.tagName}>`).join(''); }
    get lastElementChild() { return this.children.filter(c => c.tagName !== '#text').at(-1); }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (['hidden', 'checked', 'open', 'disabled'].includes(key)) this[key] = true;
    }
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
    appendChild(child) { this.children.push(child); child.parent = this; }
    matches(selector) {
      const parts = selector.trim().split(/\s+/);
      const matchesOne = (node, term) => {
        if (!node || node.tagName === '#text') return false;
        if (term.startsWith('.')) return node.className.split(' ').includes(term.slice(1));
        if (term.startsWith('#')) return node.id === term.slice(1);
        const attr = term.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
        if (attr) return attr[2] === undefined ? node.attributes[attr[1]] !== undefined : node.attributes[attr[1]] === attr[2];
        return node.tagName === term;
      };
      if (!matchesOne(this, parts.pop())) return false;
      let cursor = this.parent;
      while (parts.length) { const term = parts.pop(); while (cursor && !matchesOne(cursor, term)) cursor = cursor.parent; if (!cursor) return false; cursor = cursor.parent; }
      return true;
    }
    querySelectorAll(selector) { const result = []; const visit = node => { for (const child of node.children) { if (child.matches(selector)) result.push(child); visit(child); } }; visit(this); return result; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { let node = this; while (node && !node.matches(selector)) node = node.parent; return node || null; }
    focus() { focused = this; }
  }
  function parse(html, parent) {
    const stack = [parent];
    for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('<!')) continue;
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith('<')) {
        const match = token.match(/^<([\w-]+)/); if (!match) continue;
        const tag = match[1].toLowerCase(), node = new Element(tag);
        for (const attr of token.slice(match[0].length, -1).matchAll(/([\w-]+)(?:="([^"]*)")?/g)) node.setAttribute(attr[1], decode(attr[2] ?? ''));
        stack.at(-1).appendChild(node);
        if (!['meta', 'link', 'input', 'img', 'br', 'hr'].includes(tag)) stack.push(node);
      } else { const text = new Element('#text'); text._text = decode(token); stack.at(-1).appendChild(text); }
    }
  }
  const root = new Element('root');
  const repo = path.join(__dirname, '../..');
  parse(fs.readFileSync(path.join(repo, 'constructionProduction.html'), 'utf8'), root);
  document = { getElementById(id) { const node = root.querySelector(`#${id}`); assert.ok(node, `Page element #${id} exists`); return node; }, querySelectorAll: q => root.querySelectorAll(q), querySelector: q => root.querySelector(q), addEventListener: (_, fn) => document.ready = fn };
  let storage = saved;
  const localStorage = { getItem() { if (failStorage) throw new Error('Storage blocked'); return storage; }, setItem(_, value) { if (failStorage) throw new Error('Storage blocked'); storage = value; } };
  const context = vm.createContext({ document, localStorage, window: { print() { prints++; } } });
  for (const script of root.querySelectorAll('script')) vm.runInContext(fs.readFileSync(path.join(repo, script.attributes.src), 'utf8'), context, { filename: script.attributes.src });
  document.ready();
  function emit(node, event) { if (typeof node === 'string') node = document.getElementById(node); const target = node; while (node) { for (const handler of node.handlers[event] || []) handler({ target, preventDefault() {} }); node = node.parent; } }
  function change(node, value, event = 'input') { if (typeof node === 'string') node = document.getElementById(node); if (node.type === 'checkbox') node.checked = value; else node.value = value; emit(node, event); }
  const op = (index, key) => document.getElementById('operations').querySelectorAll('[data-operation]')[index].querySelector(`[data-field="${key}"]`);
  return { get: document.getElementById, query: q => root.querySelector(q), all: q => root.querySelectorAll(q), emit, change, op, saved: () => storage, focused: () => focused, prints: () => prints };
};
