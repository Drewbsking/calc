(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AccessDensityReportMap = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const WIDTH = 900, HEIGHT = 520, PADDING = 65;
  const layers = [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile',
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile',
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile'
  ];

  // The same Web Mercator tile coordinates used by the Leaflet basemap.
  // This projection is for the picture only; it never supplies station lengths.
  function project(coordinate, zoom) {
    const latitude = Math.max(-85.05112878, Math.min(85.05112878, coordinate.lat)) * Math.PI / 180;
    const size = 256 * 2 ** zoom;
    return { x: (coordinate.lng + 180) / 360 * size,
      y: (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2 * size };
  }

  function layout(data) {
    const coordinates = [...data.lines.flat(), ...data.accesses.map(point => point.coordinate)];
    if (!coordinates.length) throw new Error('The alignment has no map coordinates.');
    const projected = coordinates.map(point => project(point, 0));
    const bounds = projected.reduce((box, point) => ({
      minX: Math.min(box.minX, point.x), maxX: Math.max(box.maxX, point.x),
      minY: Math.min(box.minY, point.y), maxY: Math.max(box.maxY, point.y)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const scale = Math.min((WIDTH - PADDING * 2) / Math.max(1e-9, bounds.maxX - bounds.minX),
      (HEIGHT - PADDING * 2) / Math.max(1e-9, bounds.maxY - bounds.minY));
    const zoom = Math.max(0, Math.min(19, Math.floor(Math.log2(scale))));
    const origin = { x: (bounds.minX + bounds.maxX) / 2 * 2 ** zoom - WIDTH / 2,
      y: (bounds.minY + bounds.maxY) / 2 * 2 ** zoom - HEIGHT / 2 };
    const position = coordinate => { const point = project(coordinate, zoom); return { x: point.x - origin.x, y: point.y - origin.y }; };
    const tileZoom = Math.min(19, zoom + 1), tileSize = 256 * 2 ** (zoom - tileZoom);
    const tiles = [];
    for (let x = Math.floor(origin.x / tileSize); x < Math.ceil((origin.x + WIDTH) / tileSize); x++) {
      for (let y = Math.floor(origin.y / tileSize); y < Math.ceil((origin.y + HEIGHT) / tileSize); y++) {
        if (y >= 0 && y < 2 ** tileZoom) tiles.push({
          x: ((x % 2 ** tileZoom) + 2 ** tileZoom) % 2 ** tileZoom, y, zoom: tileZoom,
          left: x * tileSize - origin.x, top: y * tileSize - origin.y, size: tileSize
        });
      }
    }
    const centerY = (origin.y + HEIGHT / 2) / (256 * 2 ** zoom);
    const centerLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * centerY)));
    const feetPerPixel = 2 * Math.PI * 6378137 * Math.cos(centerLat) / (256 * 2 ** zoom) / .3048;
    const targetFeet = feetPerPixel * 120, power = 10 ** Math.floor(Math.log10(targetFeet));
    const scaleFeet = [1, 2, 5].map(value => value * power).filter(value => value <= targetFeet).at(-1) || power;
    return { width: WIDTH, height: HEIGHT, zoom, tiles, scaleFeet, scalePixels: scaleFeet / feetPerPixel,
      lines: data.lines.map(points => points.map(position)),
      stations: data.stations.map(station => ({ ...station, ...position(station.coordinate) })),
      accesses: data.accesses.map(point => ({ ...point, ...position(point.coordinate) })) };
  }

  function loadImage(url) {
    return new Promise(resolve => {
      const image = new Image();
      const timer = setTimeout(() => { image.onload = image.onerror = null; resolve(null); }, 10000);
      image.crossOrigin = 'anonymous';
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); resolve(null); };
      image.src = url;
    });
  }

  async function capture(data) {
    const plan = layout(data);
    const images = await Promise.all(layers.map(base => Promise.all(plan.tiles.map(tile => loadImage(`${base}/${tile.zoom}/${tile.y}/${tile.x}`)))));
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * 3; canvas.height = HEIGHT * 3;
    const context = canvas.getContext('2d');
    context.scale(3, 3);
    context.fillStyle = '#e9edf0'; context.fillRect(0, 0, WIDTH, HEIGHT);
    images.forEach((group, index) => {
      context.globalAlpha = index === 0 ? 1 : .9;
      group.forEach((image, tileIndex) => {
        const tile = plan.tiles[tileIndex];
        if (image) context.drawImage(image, tile.left, tile.top, tile.size, tile.size);
      });
    });
    context.globalAlpha = 1;
    context.lineJoin = 'round'; context.lineCap = 'round';
    plan.lines.forEach(points => {
      context.beginPath();
      points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.strokeStyle = 'white'; context.lineWidth = 6; context.stroke();
      context.strokeStyle = '#167fb5'; context.lineWidth = 3; context.stroke();
    });
    const colors = { residential: '#217147', commercial: '#ab4c0d', named: '#7041a0' };
    plan.accesses.forEach(point => {
      context.beginPath();
      if (point.type === 'residential') context.arc(point.x, point.y, 5, 0, Math.PI * 2);
      else if (point.type === 'commercial') context.rect(point.x - 5, point.y - 5, 10, 10);
      else {
        context.moveTo(point.x, point.y - 7); context.lineTo(point.x + 7, point.y);
        context.lineTo(point.x, point.y + 7); context.lineTo(point.x - 7, point.y); context.closePath();
      }
      context.fillStyle = colors[point.type]; context.fill();
      context.strokeStyle = 'white'; context.lineWidth = 1.5; context.stroke();
    });
    context.font = 'bold 11px Arial';
    plan.stations.forEach(station => {
      const width = context.measureText(station.label).width + 10;
      const left = Math.max(2, Math.min(WIDTH - width - 2, station.x + 7));
      const top = Math.max(2, Math.min(HEIGHT - 20, station.y + 8));
      context.fillStyle = 'white'; context.fillRect(left, top, width, 18);
      context.strokeStyle = '#566b7a'; context.lineWidth = 1; context.strokeRect(left, top, width, 18);
      context.fillStyle = '#173a55'; context.fillText(station.label, left + 5, top + 13);
    });
    context.fillStyle = '#fffffff0'; context.fillRect(WIDTH - 50, 12, 36, 64);
    context.fillStyle = '#172d40'; context.font = 'bold 14px Arial'; context.fillText('N', WIDTH - 37, 30);
    context.beginPath(); context.moveTo(WIDTH - 32, 37); context.lineTo(WIDTH - 42, 62); context.lineTo(WIDTH - 22, 62); context.closePath(); context.fill();
    context.fillStyle = '#fffffff0'; context.fillRect(12, HEIGHT - 49, plan.scalePixels + 20, 37);
    context.strokeStyle = '#172d40'; context.lineWidth = 2;
    context.beginPath(); context.moveTo(22, HEIGHT - 27); context.lineTo(22, HEIGHT - 21);
    context.lineTo(22 + plan.scalePixels, HEIGHT - 21); context.lineTo(22 + plan.scalePixels, HEIGHT - 27); context.stroke();
    context.fillStyle = '#172d40'; context.font = '12px Arial'; context.fillText(plan.scaleFeet.toLocaleString('en-US') + ' ft', 22, HEIGHT - 33);
    const missing = images[0].filter(image => !image).length;
    return { image: canvas.toDataURL('image/png'), width: WIDTH, height: HEIGHT,
      warning: missing ? `${missing} imagery tiles unavailable. Background is incomplete; check the connection and reopen Reports.` : '' };
  }
  return { capture, layout, project };
});
