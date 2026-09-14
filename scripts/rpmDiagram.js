const RPMDiagram = {
  render(svg, layout) {
    svg.setAttribute('viewBox', '0 0 640 220');
    svg.setAttribute('font-family', 'Arial, sans-serif');
    const doc = svg.ownerDocument, ns = 'http://www.w3.org/2000/svg';
    const add = (name, attributes, text) => {
      const node = doc.createElementNS(ns, name);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    };
    const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
    svg.replaceChildren();
    add('title', {}, layout.profile.name + ': ' + layout.profile.rule);
    // A vector background also prints when the browser omits CSS background colors.
    add('path', { d: 'M0 0H640V220H0Z', fill: '#243643' });
    const color = layout.color === 'yellow' ? '#ffe076' : '#f4f7f9';
    const group = layout.kind === 'group', intersection = layout.kind === 'intersection';
    const cycle = intersection ? 12 : layout.cycle;
    const span = group ? cycle * 2 + layout.groupLength : cycle * (intersection ? 3 : 4);
    const scale = 540 / span, x = (distance) => 50 + distance * scale;
    const double = layout.profile.paint.startsWith('double');
    const ys = double ? [98, 124] : [111];
    const isBroken = layout.profile.paint.includes('broken');
    const isDotted = layout.profile.paint === 'dotted';
    if (layout.profile.family !== 'substitute') {
      const paintCycle = intersection ? 12 : isDotted ? 12 : layout.n;
      const dash = intersection ? 3 : isDotted ? 3 : layout.dash;
      for (const y of ys) {
        if (isBroken || isDotted) {
          for (let i = 0; i <= Math.min(100, Math.ceil(span / paintCycle)); i++) {
            const start = i * paintCycle;
            if (start > span) break;
            add('line', { x1: x(start), x2: x(Math.min(span, start + dash)), y1: y, y2: y, stroke: color, 'stroke-width': 6 });
          }
        } else add('line', { x1: 38, x2: 602, y1: y, y2: y, stroke: color, 'stroke-width': layout.profile.paint === 'wide' ? 36 : 6 });
      }
    }
    const markerYs = layout.pair === 2 ? [98, 124] : [111];
    const marker = (distance) => markerYs.forEach((y) => add('rect', { x: x(distance) - 6, y: y - 6, width: 12, height: 12, fill: color, stroke: '#071a29', 'stroke-width': 2 }));
    if (group) {
      for (let g = 0; g < 3; g++) {
        for (let i = 0; i < Math.min(layout.perGroup, 12); i++) {
          const index = layout.perGroup > 12 ? Math.round(i * (layout.perGroup - 1) / 11) : i;
          marker(g * cycle + (layout.perGroup === 1 ? layout.groupLength / 2 : index * layout.pitch));
        }
      }
    } else if (intersection) {
      for (let g = 0; g < 3; g++) marker(g * cycle + 1.5);
    } else {
      for (let i = 0; i < 5; i++) marker(i * cycle);
    }
    add('text', { x: 24, y: 28, fill: '#d5e4ec', 'font-size': 15 }, 'N = ' + fmt(layout.n) + ' ft');
    if (!intersection) {
      const end = x(cycle);
      add('line', { x1: 50, x2: end, y1: 62, y2: 62, stroke: '#b8d1df', 'stroke-width': 1.5 });
      [50, end].forEach((cx) => add('line', { x1: cx, x2: cx, y1: 55, y2: 69, stroke: '#b8d1df' }));
      add('text', { x: (50 + end) / 2, y: 50, fill: '#edf5fa', 'font-size': 14, 'text-anchor': 'middle' }, fmt(cycle) + ' ft' + (group ? ' repeat' : ''));
    }
    add('text', { x: 24, y: 181, fill: '#d5e4ec', 'font-size': 14 },
      layout.profile.family === 'substitute' ? 'Markers replace the painted line' : layout.pair === 2 ? 'Lateral pairs: two physical markers per station' : 'One physical marker per station');
    add('text', { x: 24, y: 205, fill: '#a9c0cd', 'font-size': 12 }, 'Illustrative sample · lateral dimensions not to scale');
  },
  renderCurve(svg, row) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', '0 0 640 320');
    svg.setAttribute('font-family', 'Arial, sans-serif');
    const add = (name, attrs, text) => {
      const node = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', name);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node); return node;
    };
    const fmt = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
    add('title', {}, row.name + ': ' + row.speedDifference + ' mph speed difference, ' + row.spacing + ' ft curve spacing, three markers outside each end at ' + row.approachSpacing + ' ft');
    add('path', { d: 'M0 0H640V320H0Z', fill: '#243643' });
    // One circular bend with tangent extensions, rather than a reverse curve.
    // Its drawing radius is illustrative; the RCOC spacing is selected by speed difference.
    const angle = 40 * Math.PI / 180, drawingRadius = 350;
    const point = (fraction) => ({ x: 200 + drawingRadius * Math.sin(angle * fraction), y: 215 - drawingRadius * (1 - Math.cos(angle * fraction)) });
    const pt = point(1), dx = Math.cos(angle), dy = -Math.sin(angle);
    const road = 'M25 215H200A350 350 0 0 0 ' + pt.x + ' ' + pt.y + 'L' + (pt.x + 170 * dx) + ' ' + (pt.y + 170 * dy);
    add('path', { d: road, stroke: '#445664', 'stroke-width': 42, fill: 'none' });
    add('path', { d: road, stroke: '#ffe076', 'stroke-width': 3, fill: 'none' });
    const marker = (x, y, part) => {
      add('rect', {
        x: x - 5, y: y - 5, width: 10, height: 10,
        fill: '#ffe076', stroke: '#071a29', 'stroke-width': 2, 'data-part': part
      });
    };
    for (let i = 1; i <= 3; i++) { marker(200 - i * 45, 215, 'before'); marker(pt.x + i * 45 * dx, pt.y + i * 45 * dy, 'after'); }
    // A bounded representative sample; the complete quantity is reported beside the diagram.
    const shown = Math.min(row.stations, 13);
    for (let i = 0; i < shown; i++) {
      const index = Math.round(i * (row.stations - 1) / (shown - 1));
      const t = Math.min(index * row.spacing, row.length) / row.length;
      const position = point(t);
      marker(position.x, position.y, 'curve');
    }
    [[200, 215, 'PC'], [pt.x, pt.y, 'PT']].forEach(([x, y, label]) => {
      add('line', { x1: x, x2: x, y1: y - 36, y2: y + 36, stroke: '#d5e4ec', 'stroke-dasharray': '4 4' });
      add('text', { x, y: y - 43, fill: '#fff', 'font-size': 16, 'text-anchor': 'middle' }, label);
    });
    add('text', { x: 24, y: 28, fill: '#d5e4ec', 'font-size': 15 }, '3 before PC → curve → 3 after PT');
    add('text', { x: 95, y: 247, fill: '#d5e4ec', 'font-size': 13, 'text-anchor': 'middle' }, '3 × ' + fmt(row.approachSpacing) + ' ft');
    add('text', { x: 535, y: 169, fill: '#d5e4ec', 'font-size': 13, 'text-anchor': 'middle' }, '3 × ' + fmt(row.approachSpacing) + ' ft');
    add('text', { x: 320, y: 274, fill: '#fff', 'font-size': 15, 'text-anchor': 'middle' }, fmt(row.spacing) + ' ft on curve · ' + row.speedDifference + ' mph speed difference');
    add('text', { x: 320, y: 301, fill: '#a9c0cd', 'font-size': 12, 'text-anchor': 'middle' }, 'Representative stations · schematic, not a field layout');
  }
};
