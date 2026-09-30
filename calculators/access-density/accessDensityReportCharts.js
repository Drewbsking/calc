(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./accessDensityCore.js') : root.AccessDensityGeometry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AccessDensityReportCharts = api;
})(typeof globalThis === 'object' ? globalThis : this, function (G) {
  'use strict';
  const WIDTH = 1000, HEIGHT = 750;
  const colors = { residential: '#217147', commercial: '#ab4c0d', named: '#7041a0', total: '#a6c2d7' };
  const titles = {
    density: 'Access Point Density Along Alignment',
    stacked: 'Stacked Access Type',
    commercial: 'Commercial / Named Access',
    gaps: 'Access Gaps'
  };
  const typeNames = { residential: 'Residential driveway', commercial: 'Commercial driveway', named: 'Named road/access' };
  const speedTitle = 'Access-Based Speed Limit Recommendation';
  const hypotheticalTitle = 'Hypothetical Speed Limit Every 100 Feet';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
  const station = value => G.formatStation(value, Math.abs(value - Math.round(value)) < 1e-6 ? 0 : 2);
  const number = value => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const text = (x, y, value, options = '') => `<text x="${x}" y="${y}" ${options}>${escape(value)}</text>`;
  const line = (x1, y1, x2, y2, options = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${options}/>`;
  const rect = (x, y, width, height, options = '') => `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${options}/>`;

  function wrap(value, maxChars) {
    const words = String(value).trim().split(/\s+/).flatMap(word => word.match(new RegExp('.{1,' + maxChars + '}', 'gu')) || ['']);
    const rows = [];
    words.forEach(word => {
      if (!rows.length || rows.at(-1).length + word.length + 1 > maxChars) rows.push(word);
      else rows[rows.length - 1] += ' ' + word;
    });
    return rows;
  }

  function svg(title, body, footer, height = HEIGHT) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escape(title)}">`
      + `<title>${escape(title)}</title><rect width="100%" height="100%" fill="white"/>`
      + `<g font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#172d40">`
      + text(50, 43, title, 'font-size="24" font-weight="700"') + body
      + line(50, height - 46, 950, height - 46, 'stroke="#c8d0d8"')
      + text(50, height - 22, footer, 'font-size="12" fill="#465766"') + '</g></svg>';
  }

  function annotationLayout(labels, x) {
    const lanes = [];
    const placed = labels.map(label => {
      const rows = wrap(label.name, 27);
      const width = Math.min(210, Math.max(...rows.map(row => row.length)) * 7.4 + 12);
      const left = Math.max(80, Math.min(950 - width, x(label.stationFeet) - width / 2));
      let lane = lanes.findIndex(items => items.every(item => left > item.left + item.width + 10 || left + width + 10 < item.left));
      if (lane < 0) { lane = lanes.length; lanes.push([]); }
      const item = { label, rows, left, width, lane, height: rows.length * 16 + 16 };
      lanes[lane].push(item);
      return item;
    });
    let bottom = 78;
    lanes.forEach(items => {
      items.forEach(item => { item.top = bottom; });
      bottom += Math.max(...items.map(item => item.height));
    });
    return { items: placed, bottom };
  }

  function chartPages(data, kind) {
    const pages = [];
    const components = kind === 'density' ? ['total'] : kind === 'stacked' ? ['residential', 'commercial', 'named'] : ['commercial', 'named'];
    const globalMax = Math.max(1, ...data.bins.map(bin => components.reduce((sum, key) => sum + bin[key], 0)));
    const tickStep = Math.max(1, Math.ceil(globalMax / 6));
    const yMax = Math.ceil(globalMax / tickStep) * tickStep;
    for (let first = 0; first < data.bins.length; first += 10) {
      const bins = data.bins.slice(first, first + 10);
      const start = bins[0].startFeet, end = bins.at(-1).endFeet;
      const final = first + bins.length === data.bins.length;
      const inside = value => value >= start && (value < end || final && value <= end);
      const x = value => 80 + (value - start) / (end - start) * 870;
      const labels = kind === 'density' ? data.namedLabels.filter(label => inside(label.stationFeet)) : [];
      const annotations = annotationLayout(labels, x);
      const plotTop = Math.max(140, annotations.bottom + 30);
      const extra = Math.max(0, plotTop - 290);
      const height = HEIGHT + extra, bottom = 550 + extra, drivewayY = 610 + extra;
      const y = count => bottom - count / yMax * (bottom - plotTop);
      let body = '';
      for (let value = 0; value <= yMax; value += tickStep) {
        body += line(80, y(value), 950, y(value), 'stroke="#dce3e9"');
        body += text(68, y(value) + 5, value, 'text-anchor="end"');
      }
      body += text(23, (plotTop + bottom) / 2, 'Number of access points', `text-anchor="middle" transform="rotate(-90 23 ${(plotTop + bottom) / 2})"`);
      bins.forEach(bin => {
        const width = x(bin.endFeet) - x(bin.startFeet);
        const inset = Math.min(5, width * .12);
        let count = 0;
        components.forEach(key => {
          const value = bin[key];
          const top = y(count + value), barHeight = y(count) - top;
          const description = `${station(bin.startFeet)} to ${station(bin.endFeet)}: ${key === 'total' ? 'Total access points' : typeNames[key]} ${value}`;
          body += `<g><title>${escape(description)}</title>`
            + rect(x(bin.startFeet) + inset, top, width - inset * 2, barHeight, `fill="${colors[key]}" stroke="white" stroke-width="1"`) + '</g>';
          if (kind !== 'density' && value && barHeight > 23 && width > 24) {
            body += text(x(bin.startFeet) + width / 2, top + barHeight / 2 + 5, value, 'fill="white" text-anchor="middle" font-weight="700"');
          }
          count += value;
        });
        if (width > 24) body += text(x(bin.startFeet) + width / 2, y(count) - 9, count, 'text-anchor="middle" font-weight="700"');
      });
      body += line(80, bottom, 950, bottom, 'stroke="#324c60" stroke-width="1.5"');
      [...bins.map(bin => bin.startFeet), end].forEach((value, index, ticks) => {
        const lastClose = index === ticks.length - 1 && index > 0 && x(value) - x(ticks[index - 1]) < 75;
        body += line(x(value), bottom, x(value), bottom + 6, 'stroke="#324c60"');
        body += text(x(value), bottom + (lastClose ? 42 : 24), station(value), 'text-anchor="middle" font-size="13"');
      });
      if (kind === 'density') {
        // Every driveway shares one display row; its Y value carries no offset.
        body += rect(80, drivewayY - 12, 870, 24, 'fill="#f4f6f8"');
        body += text(68, drivewayY + 4, 'Driveways', 'text-anchor="end" font-size="12"');
        data.driveways.filter(point => inside(point.stationFeet)).forEach(point => {
          body += `<circle data-driveway="${point.type}" cx="${x(point.stationFeet)}" cy="${drivewayY}" r="4.5" fill="${colors[point.type]}" stroke="white" stroke-width="1"><title>${escape(typeNames[point.type] + ' at ' + station(point.stationFeet))}</title></circle>`;
        });
        // Keep a line at each actual named-access station, even when its label is shared.
        data.accesses.filter(point => point.type === 'named' && inside(point.stationFeet)).forEach(point => {
          body += line(x(point.stationFeet), plotTop - 5, x(point.stationFeet), bottom, 'stroke="#7041a0" stroke-width="1.4" stroke-dasharray="5 4"');
          body += line(x(point.stationFeet), drivewayY - 12, x(point.stationFeet), drivewayY + 12, 'stroke="#7041a0" stroke-width="1.4" stroke-dasharray="5 4"');
        });
        annotations.items.forEach(item => {
          const center = item.left + item.width / 2;
          const labelBottom = item.top + item.rows.length * 16;
          body += line(center, labelBottom + 4, x(item.label.stationFeet), plotTop - 5, 'stroke="#7041a0" stroke-width="1"');
        });
        annotations.items.forEach(item => {
          const center = item.left + item.width / 2;
          body += rect(item.left - 3, item.top - 13, item.width + 6, item.rows.length * 16 + 4, 'fill="white"');
          item.rows.forEach((row, index) => { body += text(center, item.top + index * 16, row, 'text-anchor="middle" font-size="13" font-weight="700" fill="#562b83"'); });
        });
      }
      body += text(515, (kind === 'density' ? 648 : 605) + extra, 'Station along alignment (ft)', 'text-anchor="middle" font-size="15"');
      const legendKeys = kind === 'density' ? ['total', 'residential', 'commercial', 'named'] : components;
      const legendWidth = 225;
      legendKeys.forEach((key, index) => {
        const left = 50 + index * legendWidth, top = 678 + extra;
        if (kind === 'density' && key === 'named') body += line(left + 6, top - 10, left + 6, top + 4, 'stroke="#7041a0" stroke-width="2"');
        else if (kind === 'density' && key !== 'total') body += `<circle cx="${left + 6}" cy="${top - 3}" r="4.5" fill="${colors[key]}"/>`;
        else body += rect(left, top - 11, 13, 13, `fill="${colors[key]}"`);
        body += text(left + 20, top, key === 'total' ? 'All access points' : typeNames[key], 'font-size="13"');
      });
      const footer = `Interval: ${number(data.intervalFeet)} ft | Stations ${station(start)} - ${station(end)} | Page ${pages.length + 1} of ${Math.ceil(data.bins.length / 10)}`;
      pages.push({ title: titles[kind], width: WIDTH, height, svg: svg(titles[kind], body, footer, height) });
    }
    return pages;
  }

  function gapPages(data) {
    const describe = point => point.type === 'named' ? point.name.trim() || 'Unnamed road/access' : typeNames[point.type];
    const layouts = data.gaps.map(gap => {
      const previous = wrap(describe(gap.previous), 31), next = wrap(describe(gap.next), 31);
      return { gap, previous, next, height: Math.max(previous.length, next.length) * 17 + 18 };
    });
    const groups = [[]];
    let used = 0;
    layouts.forEach(item => {
      if (used + item.height > 530) { groups.push([]); used = 0; }
      groups.at(-1).push(item); used += item.height;
    });
    return groups.map((items, pageIndex) => {
      let body = rect(50, 80, 900, 37, 'fill="#eaf0f5"');
      const columns = [60, 180, 300, 440, 695];
      ['Start Station', 'End Station', 'Gap Length', 'Previous Access', 'Next Access'].forEach((label, index) => {
        body += text(columns[index], 104, label, 'font-weight="700"');
      });
      let top = 117;
      items.forEach((item, index) => {
        if (index % 2) body += rect(50, top, 900, item.height, 'fill="#f6f8fa"');
        [station(item.gap.startFeet), station(item.gap.endFeet), number(item.gap.lengthFeet) + ' ft'].forEach((value, column) => {
          body += text(columns[column], top + 22, value);
        });
        [item.previous, item.next].forEach((rows, column) => {
          rows.forEach((value, row) => { body += text(columns[column + 3], top + 22 + row * 17, value, 'font-size="13"'); });
        });
        top += item.height;
        body += line(50, top, 950, top, 'stroke="#dce3e9"');
      });
      if (!items.length) body += text(60, 155, 'Add at least two access points to calculate gaps.');
      return {
        title: titles.gaps, width: WIDTH, height: HEIGHT,
        svg: svg(titles.gaps, body, `Longest gaps first | Consecutive recorded access points | Page ${pageIndex + 1} of ${groups.length}`)
      };
    });
  }

  function speedPages(data) {
    const analysis = data.speed;
    const pageCount = Math.ceil(analysis.windows.length / 6);
    const pages = [];
    for (let first = 0; first < analysis.windows.length; first += 6) {
      let body = text(50, 78, 'MCL 257.627(2)(f)-(j): driveways and intersecting roadways count equally; see (18)(b).');
      body += text(50, 103, 'Access points per 1/2 mile and the corresponding statutory speed:');
      const categories = [
        ['Below 30', 'Not prescribed', '(2)(f)-(j)'], ['30-39', '45 mph', '(2)(j)'],
        ['40-44', '40 mph', '(2)(i)'], ['45-49', '35 mph', '(2)(h)'],
        ['50-59', '30 mph', '(2)(g)'], ['60 or more', '25 mph', '(2)(f)']
      ];
      categories.forEach(([count, speed, reference], index) => {
        const left = 50 + index * 150;
        body += rect(left, 118, 150, 92, `fill="${index % 2 ? '#f0f4f7' : '#e7eef4'}" stroke="white"`);
        body += text(left + 75, 140, count, 'text-anchor="middle" font-weight="700"');
        body += text(left + 75, 167, speed, 'text-anchor="middle" font-size="17" font-weight="700"');
        body += text(left + 75, 194, reference, 'text-anchor="middle" font-size="12"');
      });
      body += text(50, 240, analysis.prorated
        ? 'Method: sliding 528-ft windows on a confirmed short highway; counts multiplied by 5 under (5)(c).'
        : 'Method: sliding 2,640-ft (1/2-mile) windows, evaluated at access-entry/exit events and between events.');
      const peak = analysis.peak;
      const peakResult = !peak ? 'No full-length window available; no speed recommendation.'
        : peak.speedMph ? `Most restrictive result: ${peak.speedMph} mph at ${station(peak.startFeet)} - ${station(peak.endFeet)} (${peak.accessCount} accesses).`
          : `Highest window count: ${peak.accessCount}; no speed prescribed by the access-point thresholds.`;
      body += text(50, 261, peakResult, 'font-size="13" font-weight="700"');
      body += rect(50, 277, 900, 36, 'fill="#eaf0f5"');
      const columns = [60, 175, 290, 405, 530, 755];
      ['Window Start', 'Window End', 'Length (ft)', 'Access Points', 'Recommended Speed', 'MCL 257.627 Basis'].forEach((value, index) => {
        body += text(columns[index], 300, value, 'font-size="13" font-weight="700"');
      });
      analysis.windows.slice(first, first + 6).forEach((segment, index) => {
        const top = 313 + index * 38;
        if (index % 2) body += rect(50, top, 900, 38, 'fill="#f6f8fa"');
        const values = [station(segment.startFeet), station(segment.endFeet), number(segment.endFeet - segment.startFeet), segment.accessCount,
          segment.speedMph ? segment.speedMph + ' mph' : segment.complete ? 'Not prescribed' : 'Incomplete window',
          segment.subsection ? segment.subsection + (analysis.prorated ? '; (5)(c)' : '') : segment.complete ? '(2)(f)-(j)' : 'Insufficient length'];
        values.forEach((value, column) => { body += text(columns[column], top + 24, value, column === 4 ? 'font-weight="700"' : 'font-size="13"'); });
        body += line(50, top + 38, 950, top + 38, 'stroke="#dce3e9"');
      });
      const notes = [
        'Sliding windows are the application method, not an explicit MCL requirement. The chart interval does not affect results.',
        'Rows show endpoint windows, the peak count, and speed-category changes. Both window ends are included.',
        'Different adjoining densities need separate determinations under (5)(b); the peak is not a limit for the whole alignment.',
        'Special-area limits in (2)(a)-(e) may apply. Below 30, (2)(f)-(j) prescribe no speed; the 55-mph general limit in (9)',
        'applies to trunk line and county highways only when no other limit is fixed. A filed order and posting are required (11)-(12).',
        'A modified limit under MCL 257.628 supersedes the access-based result under (13). No partial-window extrapolation.'
      ];
      notes.forEach((value, index) => { body += text(50, 566 + index * 19, value, 'font-size="12" fill="#465766"'); });
      const links = [
        { x: 50, y: 674, width: 310, height: 20, url: analysis.source, label: 'MCL 257.627 - official statute' },
        { x: 480, y: 674, width: 340, height: 20, url: 'https://legislature.mi.gov/Laws/MCL?objectName=mcl-257-628', label: 'MCL 257.628 - modified speed limits' }
      ];
      links.forEach(link => { body += `<a href="${escape(link.url)}">` + text(link.x, 689, link.label, 'font-size="12" fill="#185686" text-decoration="underline"') + '</a>'; });
      pages.push({ title: speedTitle, width: WIDTH, height: HEIGHT, links,
        svg: svg(speedTitle, body, `Michigan Legislature | Statute reviewed ${analysis.reviewed} | Page ${pages.length + 1} of ${pageCount}`) });
    }
    return pages;
  }

  function hypotheticalSpeedPages(data) {
    const segments = data.hypotheticalSpeed.segments;
    const pages = [];
    const perPage = 30;
    for (let first = 0; first < segments.length; first += perPage) {
      const slice = segments.slice(first, first + perPage);
      const start = slice[0].startFeet, end = slice.at(-1).endFeet;
      const x = value => 120 + (value - start) / (end - start) * 830;
      const y = mph => 440 - (mph - 25) / 20 * 220;
      let body = text(50, 78, 'HYPOTHETICAL ONLY - independent 100-ft sections, scaled to half-mile density.', 'font-weight="700" fill="#864509"');
      body += text(50, 102, 'Equivalent half-mile count = section access count x 2,640 / section length in feet.');
      body += text(50, 126, 'MCL 257.627(2)(f)-(j) supplies the comparison thresholds; it does not authorize this 100-ft method.', 'font-size="13"');
      body += text(50, 150, 'Each full section: 0-1 access = no category; 2 accesses = 30 mph; 3 or more = 25 mph.', 'font-size="13"');
      body += text(50, 174, 'The final partial section uses its actual length. This graph does not change the MCL recommendation.', 'font-size="13"');

      slice.filter(segment => segment.speedMph === null).forEach(segment => {
        body += rect(x(segment.startFeet), 210, x(segment.endFeet) - x(segment.startFeet), 240, 'fill="#f0f2f4"');
      });
      [25, 30, 35, 40, 45].forEach(mph => {
        body += line(120, y(mph), 950, y(mph), 'stroke="#dce3e9"');
        body += text(105, y(mph) + 5, mph, 'text-anchor="end"');
      });
      body += text(35, 330, 'Hypothetical speed (mph)', 'text-anchor="middle" transform="rotate(-90 35 330)"');
      body += rect(120, 479, 830, 24, 'fill="#f7f8fa"');
      body += text(110, 495, 'No category', 'text-anchor="end" font-size="12"');
      slice.forEach((segment, index) => {
        const left = x(segment.startFeet), right = x(segment.endFeet);
        const summary = `${station(segment.startFeet)} to ${station(segment.endFeet)}: ${segment.accessCount} accesses; ${number(segment.equivalentHalfMileCount)} equivalent per half mile; ${segment.speedMph === null ? 'no access-based category' : segment.speedMph + ' mph (hypothetical)'}`;
        body += `<g data-hypothetical-speed="${segment.speedMph === null ? 'none' : segment.speedMph}"><title>${escape(summary)}</title>`;
        if (segment.speedMph === null) {
          const inset = Math.min(2, (right - left) / 4);
          body += line(left + inset, 491, right - inset, 491, 'stroke="#74808a" stroke-width="4"');
        } else {
          const top = y(segment.speedMph);
          body += line(left, top, right, top, 'stroke="#185686" stroke-width="3"');
          const previous = slice[index - 1];
          if (previous?.speedMph != null) body += line(left, y(previous.speedMph), left, top, 'stroke="#185686" stroke-width="3"');
          body += `<circle cx="${(left + right) / 2}" cy="${top}" r="3" fill="#185686"/>`;
        }
        body += '</g>';
      });
      body += line(120, 512, 950, 512, 'stroke="#324c60" stroke-width="1.5"');
      const ticks = [...slice.filter((_, index) => index % 5 === 0).map(segment => segment.startFeet), end];
      ticks.forEach((value, index) => {
        const close = index === ticks.length - 1 && index > 0 && x(value) - x(ticks[index - 1]) < 80;
        body += line(x(value), 512, x(value), 518, 'stroke="#324c60"');
        body += text(x(value), close ? 552 : 536, station(value), 'text-anchor="middle" font-size="12"');
      });
      body += text(535, 580, 'Station along alignment (ft)', 'text-anchor="middle" font-size="15"');
      body += text(110, 612, 'Access count', 'text-anchor="end" font-size="12"');
      slice.forEach(segment => {
        const left = x(segment.startFeet), right = x(segment.endFeet);
        body += rect(left, 594, right - left, 27, 'fill="#f0f4f7" stroke="white"');
        if (right - left > 12) body += text((left + right) / 2, 612, segment.accessCount, 'text-anchor="middle" font-size="11"');
      });
      body += line(120, 649, 150, 649, 'stroke="#185686" stroke-width="3"');
      body += text(160, 654, 'Hypothetical speed category', 'font-size="12"');
      body += rect(445, 639, 16, 16, 'fill="#f0f2f4" stroke="#74808a"');
      body += text(471, 654, 'No category: fewer than 30 equivalent accesses per half mile', 'font-size="12"');
      const links = [{ x: 50, y: 673, width: 380, height: 20, url: data.speed.source }];
      body += `<a href="${escape(data.speed.source)}">` + text(50, 689, 'MCL 257.627 - comparison thresholds only', 'font-size="12" fill="#185686" text-decoration="underline"') + '</a>';
      pages.push({ title: hypotheticalTitle, width: WIDTH, height: HEIGHT, links,
        svg: svg(hypotheticalTitle, body, `100-ft local sections | Stations ${station(start)} - ${station(end)} | Page ${pages.length + 1} of ${Math.ceil(segments.length / perPage)}`) });
    }
    return pages;
  }

  function mapPages(data, snapshot) {
    if (!snapshot) return [];
    let body = text(50, 78, `Stations 0+00 - ${station(data.lengthFeet)} | ${number(data.lengthFeet)} ft | ${data.accesses.length} access points`);
    body += `<image x="50" y="95" width="900" height="520" href="${escape(snapshot.image)}"/>`;
    body += rect(50, 95, 900, 520, 'fill="none" stroke="#8796a1"');
    body += line(50, 647, 80, 647, 'stroke="#167fb5" stroke-width="3"');
    body += text(90, 652, 'Alignment', 'font-size="13"');
    body += '<circle cx="247" cy="647" r="5" fill="#217147"/>' + text(260, 652, 'Residential driveway', 'font-size="13"');
    body += rect(467, 642, 10, 10, 'fill="#ab4c0d"') + text(485, 652, 'Commercial driveway', 'font-size="13"');
    body += '<path d="M717 640 L724 647 L717 654 L710 647 Z" fill="#7041a0"/>' + text(730, 652, 'Named road/access', 'font-size="13"');
    body += text(50, 684, snapshot.warning || 'Overview of the complete traced alignment and recorded access locations. Station labels every 500 ft.', 'font-size="12"');
    return [{ title: 'Study Map', width: WIDTH, height: HEIGHT,
      svg: svg('Study Map', body, 'Imagery and reference maps: Esri & partners | North up | Map-derived alignment') }];
  }

  function renderPages(data, kind = 'all', mapSnapshot = null) {
    const recommendation = [...speedPages(data), ...hypotheticalSpeedPages(data)];
    const overview = mapPages(data, mapSnapshot);
    let pages;
    if (kind === 'map') pages = [...overview, ...recommendation];
    else if (kind === 'hypothetical') pages = [...hypotheticalSpeedPages(data), ...speedPages(data), ...overview];
    else if (kind === 'speed') pages = [...recommendation, ...overview];
    else if (kind === 'all') pages = [...overview, ...recommendation, ...Object.keys(titles).flatMap(key => key === 'gaps' ? gapPages(data) : chartPages(data, key))];
    else {
      if (!titles[kind]) throw new Error('Choose a report.');
      // Every printable/exported report carries the MCL recommendation and basis.
      pages = [...(kind === 'gaps' ? gapPages(data) : chartPages(data, kind)), ...recommendation, ...overview];
    }
    if (!data.studyName) return pages;
    const rows = wrap('Study: ' + data.studyName, 60);
    const headerHeight = rows.length * 18 + 20;
    return pages.map(page => {
      const height = page.height + headerHeight;
      const label = escape(data.studyName + ' - ' + page.title);
      const heading = rows.map((row, index) => text(50, 26 + index * 18, row, 'font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#172d40"')).join('');
      return { ...page, height,
        links: (page.links || []).map(link => ({ ...link, y: link.y + headerHeight })),
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${height}" viewBox="0 0 ${page.width} ${height}" role="img" aria-label="${label}">`
          + `<title>${label}</title><rect width="100%" height="100%" fill="white"/>` + heading
          + line(50, headerHeight - 2, 950, headerHeight - 2, 'stroke="#c8d0d8"')
          + `<g transform="translate(0 ${headerHeight})">${page.svg}</g></svg>`
      };
    });
  }
  return { renderPages, titles };
});
