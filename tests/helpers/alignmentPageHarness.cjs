// Exercises the real page handlers without external imagery or browser dependencies.
// This substitute verifies interaction behavior, not Leaflet rendering or layout.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const geometry = require('../../scripts/accessDensityCore.js');

module.exports = function alignmentPageHarness({ mapAvailable = true, studyName = 'Test Road', captureMap = null } = {}) {
  const repo = path.join(__dirname, '../..');
  const html = fs.readFileSync(path.join(repo, 'accessDensity.html'), 'utf8');
  let clock = 1000;
  class Events {
    constructor() { this.events = new Map(); }
    on(names, handler) {
      names.split(' ').forEach(name => {
        if (!this.events.has(name)) this.events.set(name, []);
        this.events.get(name).push(handler);
      });
      return this;
    }
    fire(name, event = {}) { (this.events.get(name) || []).forEach(handler => handler(event)); return this; }
  }
  class Element extends Events {
    constructor(tag = '') {
      super(); this.tag = tag; this.tagName = tag.toUpperCase(); this.textContent = ''; this.attributes = {}; this.disabled = false;
      this.children = []; this.dataset = {}; this.parentElement = null;
      const classes = new Set();
      this.classList = {
        add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
        toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
      };
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    addEventListener(name, handler) { this.on(name, handler); }
    append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
    replaceChildren(...children) {
      this.children.forEach(child => { child.parentElement = null; });
      this.children = []; this.append(...children);
    }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    fire(name, event = {}) {
      event.target ??= this;
      event.preventDefault ??= () => { event.defaultPrevented = true; };
      event.stopPropagation ??= () => { event.stopped = true; };
      super.fire(name, event);
      if (!event.stopped) (this.parentElement || document).fire(name, event);
      return this;
    }
  }
  const elements = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = new Element(match[1]);
    element.disabled = /\bdisabled\b/.test(match[2]);
    elements.set(match[3], element);
  }
  elements.get('studyName').value = studyName;
  function findChild(element, id) {
    if (element?.id === id) return element;
    for (const child of element?.children || []) { const found = findChild(child, id); if (found) return found; }
  }
  const document = Object.assign(new Events(), {
    createElement: tag => new Element(tag),
    addEventListener(name, handler) { this.on(name, handler); },
    getElementById(id) {
      if (elements.has(id)) return elements.get(id);
      for (const layer of map.layers) { const found = findChild(layer.content, id); if (found) return found; }
      assert.fail('The HTML or open popup contains #' + id);
    }
  });
  document.body = new Element('body');
  class Layer extends Events {
    constructor(kind, coordinates, options = {}) {
      super(); this.kind = kind; this.coordinates = coordinates; this.options = options; this.element = new Element();
    }
    addTo(target) { target.addLayer(this); return this; }
    setIcon(icon) { this.options.icon = icon; return this; }
    getElement() { return this.element; }
    getLatLng() { return this.coordinates; }
    setLatLng(coordinates) { this.coordinates = coordinates; return this; }
    bindTooltip(text, options) { this.tooltip = text; this.tooltipOptions = options; return this; }
    setTooltipContent(text) { this.tooltip = text; return this; }
    setZIndexOffset(value) { this.options.zIndexOffset = value; return this; }
    setContent(content) { this.content = content; return this; }
    openOn(target) { return this.addTo(target); }
    update() { return this; }
  }
  class Group extends Layer {
    constructor() { super('group'); this.layers = new Set(); }
    addLayer(layer) { this.layers.add(layer); return this; }
    clearLayers() { this.layers.clear(); return this; }
  }
  const frame = geometry.localFrame({ lat: 42.6389, lng: -83.2910 });
  class MapMock extends Events {
    constructor() { super(); this.layers = new Set(); }
    setView() { return this; }
    addLayer(layer) { this.layers.add(layer); return this; }
    removeLayer(layer) { this.layers.delete(layer); layer.fire('remove'); return this; }
    hasLayer(layer) { return this.layers.has(layer); }
    latLngToContainerPoint(coordinates) {
      const p = frame.toXY(coordinates);
      return { x: p.x, y: -p.y, distanceTo(other) { return Math.hypot(other.x - this.x, other.y - this.y); } };
    }
    invalidateSize() { return this; }
    closePopup(popup) { if (popup) this.removeLayer(popup); return this; }
    panTo(coordinates) { this.center = coordinates; return this; }
    getContainer() { return document.getElementById('alignmentMap'); }
  }
  const map = new MapMock();
  const L = {
    map: () => map,
    tileLayer: (url, options) => new Layer('tile', url, options),
    layerGroup: () => new Group(),
    marker: (coordinates, options) => new Layer('marker', coordinates, options),
    circleMarker: (coordinates, options) => new Layer('circle', coordinates, options),
    polyline: (coordinates, options) => new Layer('polyline', coordinates, options),
    divIcon: options => options,
    popup: options => new Layer('popup', null, options),
    control: { scale: () => ({ addTo() {} }) },
    DomEvent: { stopPropagation() {}, disableClickPropagation() {}, disableScrollPropagation() {} }
  };
  const sandbox = { document, L: mapAvailable ? L : undefined, performance: { now: () => clock } };
  if (captureMap) sandbox.AccessDensityReportMap = { capture: captureMap };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const name of ['accessDensityCore.js', 'accessDensityPoints.js', 'accessDensityReportCore.js', 'accessDensityReportCharts.js', 'accessDensityReports.js', 'accessDensity.js']) {
    vm.runInContext(fs.readFileSync(path.join(repo, 'scripts', name), 'utf8'), context, { filename: name });
  }
  const ll = (x, y) => frame.toLatLng({ x, y });
  function allLayers() {
    const layers = [];
    const visit = layer => { layers.push(layer); if (layer.layers) layer.layers.forEach(visit); };
    map.layers.forEach(visit);
    return layers;
  }
  const handles = () => allLayers().filter(layer => layer.kind === 'marker' && layer.options.icon?.className.startsWith('alignment-handle'));
  const getHandle = label => {
    const matches = handles().filter(layer => layer.options.icon.html === label);
    assert.equal(matches.length, 1, 'Exactly one handle labeled ' + label);
    return matches[0];
  };
  return {
    get: id => document.getElementById(id),
    press(id) {
      clock += 400;
      const element = document.getElementById(id);
      if (element.disabled) return;
      element.fire('click');
      if (element.type === 'submit') {
        let parent = element.parentElement;
        while (parent && parent.tag !== 'form') parent = parent.parentElement;
        parent?.fire('submit');
      }
    },
    click(x, y) { clock += 400; map.fire('click', { latlng: ll(x, y) }); },
    hover(x, y) { map.fire('mousemove', { latlng: ll(x, y) }); },
    clickHandle(label) { clock += 400; getHandle(label).fire('click'); },
    clickMarker(marker) { clock += 400; marker.fire('click'); },
    key(key, target = document, extras = {}) {
      const event = { key, target, ...extras };
      event.preventDefault = () => { event.defaultPrevented = true; };
      event.stopPropagation = () => { event.stopped = true; };
      target.fire('keydown', event);
      if (key === 'Enter' && !event.defaultPrevented && ['INPUT', 'BUTTON'].includes(target.tagName)) {
        let parent = target.parentElement;
        while (parent && parent.tag !== 'form') parent = parent.parentElement;
        parent?.fire('submit');
      }
      return event;
    },
    input(id, value) { const element = document.getElementById(id); element.value = value; element.fire('input'); },
    select(id, value) { const element = document.getElementById(id); element.value = value; element.fire('change'); },
    rows: () => document.getElementById('accessRows').children,
    accessMarkers: () => allLayers().filter(layer => layer.kind === 'marker' && layer.options.icon?.className.startsWith('access-marker')),
    popup: () => allLayers().find(layer => layer.kind === 'popup'),
    activeElement: () => document.activeElement,
    center: () => map.center,
    drag(control, x, y, duringDrag) {
      clock += 400;
      const marker = typeof control === 'string' ? getHandle(control) : control;
      marker.fire('dragstart');
      marker.setLatLng(ll(x, y));
      marker.fire('drag');
      if (duringDrag) duringDrag();
      marker.fire('dragend');
    },
    lengthFeet: () => Number(document.getElementById('alignmentLength').textContent.replace(/[^\d.]/g, '')),
    handles, allLayers,
    labels: () => allLayers().filter(layer => layer.options.icon?.className === 'alignment-station-label').map(layer => layer.options.icon.html),
    lines: () => allLayers().filter(layer => layer.kind === 'polyline'),
    xy: coordinates => frame.toXY(coordinates)
  };
};
