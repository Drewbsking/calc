(function () {
  'use strict';
  const G = window.AccessDensityGeometry;
  const $ = id => document.getElementById(id);
  const status = $('alignmentStatus');
  if (!window.L) {
    status.textContent = 'The map could not load. Check your connection and reload the page.';
    status.classList.add('alignment-error');
    ['drawBtn', 'curveBtn', 'finishBtn', 'resetBtn', 'accessBtn', 'reportsBtn'].forEach(id => { $(id).disabled = true; });
    return;
  }

  const map = L.map('alignmentMap', {
    maxZoom: 22, minZoom: 2, doubleClickZoom: false, boxZoom: true, wheelPxPerZoomLevel: 60
  }).setView([42.6389, -83.2910], 16);
  const tileOptions = { maxNativeZoom: 19, maxZoom: 22, crossOrigin: 'anonymous' };
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    ...tileOptions, attribution: '&copy; Esri & partners'
  }).addTo(map);
  L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    ...tileOptions, attribution: 'Esri', opacity: .85
  }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
    ...tileOptions, attribution: 'Esri', opacity: .9
  }).addTo(map);
  L.control.scale({ metric: false, imperial: true }).addTo(map);

  const drawing = L.layerGroup().addTo(map);
  const stations = L.layerGroup().addTo(map);
  const handles = new Map();
  // Endpoints are shared objects; the geometry module enforces tangent joins.
  const state = { first: null, sections: [], pending: null, mode: 'draw' };
  let frame = null, alignment = G.buildAlignment([]), geometryError = '';
  let inquiryPoint = null, inquiryPinned = false, inquiryMarker = null;
  let lastClickTime = -Infinity, lastDragTime = -Infinity;
  let editNotice = '';
  const accessPoints = window.AccessDensityPoints({
    map, getGeometry: () => ({ alignment, frame }),
    onDragEnd: () => { lastDragTime = performance.now(); }
  });
  const reports = window.AccessDensityReports({
    getData: () => ({ studyName: $('studyName').value, lengthFeet: alignment ? G.toFeet(alignment.totalLength) : null, points: accessPoints.getPoints() }),
    getMapSnapshot: window.AccessDensityReportMap ? () => {
      const end = G.locationAtStation(alignment, G.toFeet(alignment.totalLength));
      const locations = G.stationLocations(alignment);
      if (end && Math.abs(locations.at(-1).stationFeet - end.stationFeet) > .01) locations.push(end);
      return window.AccessDensityReportMap.capture({
        lines: alignment.segments.map(segment => (segment.type === 'curve' ? G.sampleCurve(segment, .1) : [segment.start, segment.end]).map(frame.toLatLng)),
        stations: locations.map(location => ({ coordinate: frame.toLatLng(location.point), label: G.formatStation(location.stationFeet, Math.abs(location.stationFeet - Math.round(location.stationFeet)) < 1e-6 ? 0 : 2) })),
        accesses: accessPoints.getMapPoints()
      });
    } : null
  });
  const cloneCoordinate = point => ({ lat: point.lat, lng: point.lng });
  const endpoint = () => {
    const last = state.sections[state.sections.length - 1];
    return last ? (last.type === 'curve' ? last.pt : last.end) : state.first;
  };

  function setFirst(point) {
    if (state.first) return;
    state.first = point;
    frame = G.localFrame(point);
  }

  function asGeometry(section) {
    if (section.type === 'line') return { type: 'line', start: frame.toXY(section.start), end: frame.toXY(section.end) };
    return { type: 'curve', pc: frame.toXY(section.pc), mid: frame.toXY(section.mid), pt: frame.toXY(section.pt) };
  }

  function applyGeometry(sections) {
    sections.forEach((section, index) => {
      const original = state.sections[index];
      const keys = section.type === 'curve' ? ['pc', 'mid', 'pt'] : ['start', 'end'];
      keys.forEach(key => Object.assign(original[key], frame.toLatLng(section[key])));
    });
  }

  function adjustTangents() {
    try {
      applyGeometry(G.constrainAlignment(state.sections.map(asGeometry)));
      editNotice = '';
    } catch (error) { editNotice = error.message; }
  }

  function moveHandle(point, target) {
    editNotice = '';
    // A pending MID is free; the reused PC remains part of the existing alignment.
    const existingControl = state.sections.some(section =>
      (section.type === 'curve' ? ['pc', 'mid', 'pt'] : ['start', 'end']).some(key => section[key] === point));
    if ((state.pending?.points.includes(point) && !existingControl) || !state.sections.length) {
      Object.assign(point, cloneCoordinate(target));
      render();
      return;
    }
    let edit = null;
    state.sections.some((section, index) => {
      if (section.type !== 'curve') return false;
      const control = ['pc', 'mid', 'pt'].find(key => section[key] === point);
      if (!control) return false;
      edit = { index, control, point: frame.toXY(target) };
      return true;
    });
    try {
      let sections = state.sections.map(asGeometry);
      if (!edit || geometryError) {
        // A straight-section handle intentionally changes its bearing. Fit the
        // adjoining curves to that new line, holding the other tangent bearings.
        sections.forEach((section, index) => {
          const keys = section.type === 'curve' ? ['pc', 'mid', 'pt'] : ['start', 'end'];
          keys.forEach(key => {
            if (state.sections[index][key] === point) section[key] = frame.toXY(target);
          });
        });
        edit = null;
      }
      applyGeometry(G.constrainAlignment(sections, edit));
    } catch (error) {
      // A completed valid alignment is never replaced with a non-tangent edit.
      if (geometryError) Object.assign(point, cloneCoordinate(target));
      editNotice = error.message;
    }
    render();
  }

  function cancelPending() {
    state.pending = null;
  }

  function changeMode(mode) {
    editNotice = '';
    if (mode === 'curve' && (!endpoint() || geometryError)) return;
    if (mode === 'curve' && state.mode === 'curve') return;
    if (mode === 'finished' && (state.pending || geometryError || !state.sections.length)) return;
    if (mode === 'access' && (state.pending || geometryError || !state.sections.length)) return;
    cancelPending();
    state.mode = mode;
    // The last alignment endpoint is PC; collect MID first, then PT.
    if (mode === 'curve') state.pending = { points: [endpoint()] };
    render();
  }

  function addMapPoint(latlng) {
    if (state.mode === 'finished' || state.mode === 'access' || geometryError) return;
    editNotice = '';
    let point = cloneCoordinate(latlng);
    if (state.mode === 'curve') {
      const pending = state.pending;
      pending.points.push(point);
      if (pending.points.length === 3) {
        const [pc, mid, pt] = pending.points;
        state.sections.push({ type: 'curve', pc, mid, pt });
        state.pending = null;
        state.mode = 'draw';
        adjustTangents();
      }
    } else {
      const previous = endpoint();
      if (previous && G.distance(frame.toXY(previous), frame.toXY(point)) < .01) return;
      if (previous && state.sections.at(-1)?.type === 'curve') {
        try { point = frame.toLatLng(G.extendTangent(alignment.segments.at(-1), frame.toXY(point))); }
        catch (error) { editNotice = error.message; render(); return; }
      }
      setFirst(point);
      if (previous) state.sections.push({ type: 'line', start: previous, end: point });
    }
    render();
  }

  function markerDefinitions() {
    const definitions = new Map();
    const add = (point, label) => {
      if (!definitions.has(point)) definitions.set(point, new Set());
      if (label) definitions.get(point).add(label);
    };
    if (state.first) add(state.first);
    state.sections.forEach(section => {
      if (section.type === 'line') { add(section.start); add(section.end); }
      else { add(section.pc, 'PC'); add(section.mid, 'MID'); add(section.pt, 'PT'); }
    });
    if (state.pending) state.pending.points.forEach((point, index) => add(point, ['PC', 'MID', 'PT'][index]));
    return definitions;
  }

  function syncHandles() {
    const definitions = markerDefinitions();
    handles.forEach((entry, point) => {
      if (!definitions.has(point)) { map.removeLayer(entry.marker); handles.delete(point); }
    });
    let number = 0;
    definitions.forEach((labels, point) => {
      const label = labels.size ? [...labels].join('/') : String(number);
      number++;
      let entry = handles.get(point);
      if (!entry) {
        const marker = L.marker(point, { draggable: true, autoPan: true, bubblingMouseEvents: false });
        entry = { marker, label: null };
        handles.set(point, entry);
        marker.on('dragstart', () => {
          marker.getElement()?.classList.add('is-dragging');
          clearInquiry();
        });
        marker.on('drag', () => {
          moveHandle(point, marker.getLatLng());
        });
        marker.on('dragend', () => {
          lastDragTime = performance.now();
          marker.getElement()?.classList.remove('is-dragging');
          render();
        });
        marker.on('click', event => {
          L.DomEvent.stopPropagation(event);
          if (performance.now() - lastDragTime < 250) return;
          if (state.mode === 'curve') addMapPoint(point);
          else { inquiryPoint = cloneCoordinate(point); inquiryPinned = true; updateInquiry(); }
        });
      }
      entry.marker.setLatLng(point);
      if (entry.label !== label) {
        const width = labels.size ? (label.length > 3 ? 60 : 38) : 25;
        entry.marker.setIcon(L.divIcon({
          className: 'alignment-handle' + (labels.size ? ' is-curve' : ''),
          html: label, iconSize: [width, 27], iconAnchor: [width / 2, 13.5]
        }));
        entry.label = label;
        const name = label + (point === state.first ? ' — Station 0+00' : '') + ' — drag to adjust';
        entry.marker.options.title = name;
        if (!map.hasLayer(entry.marker)) entry.marker.addTo(map);
        const element = entry.marker.getElement();
        if (element) { element.title = name; element.setAttribute('aria-label', name); }
      }
    });
  }

  function drawSection(section) {
    const raw = asGeometry(section);
    if (section.type === 'line') {
      L.polyline([section.start, section.end], { color: '#2e86c5', weight: 4, interactive: false }).addTo(drawing);
      return;
    }
    try {
      const arc = G.curve(raw.pc, raw.mid, raw.pt);
      L.polyline(G.sampleCurve(arc).map(frame.toLatLng), {
        color: geometryError ? '#e35243' : '#20b8dd', weight: 5,
        dashArray: geometryError ? '5 6' : null, interactive: false
      }).addTo(drawing);
      // The guides show the enforced tangent bearings, including the next ray.
      [0, arc.length].forEach((along, index) => {
        const start = G.pointOnSegment(arc, along), tangent = G.tangentOnSegment(arc, along);
        const sign = index === 0 ? -1 : 1;
        const end = { x: start.x + tangent.x * sign * G.toMeters(100), y: start.y + tangent.y * sign * G.toMeters(100) };
        L.polyline([frame.toLatLng(start), frame.toLatLng(end)], {
          color: '#ef6a5b', weight: 2, dashArray: '6 6', opacity: .8, interactive: false
        }).addTo(drawing);
      });
    } catch (_) {
      L.polyline([section.pc, section.mid, section.pt], {
        color: '#e35243', weight: 3, dashArray: '5 6', interactive: false
      }).addTo(drawing);
    }
  }

  function addStationLabel(latlng, stationFeet) {
    L.circleMarker(latlng, { radius: 3, color: '#fff', fillColor: '#17476a', fillOpacity: 1, weight: 1.5, interactive: false }).addTo(stations);
    L.marker(latlng, {
      interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'alignment-station-label', html: '<span>' + G.formatStation(stationFeet) + '</span>', iconSize: [1, 1], iconAnchor: [0, 0] })
    }).addTo(stations);
  }

  function render() {
    drawing.clearLayers();
    stations.clearLayers();
    geometryError = '';
    try {
      alignment = G.buildAlignment(state.sections.map(asGeometry));
      G.assertTangency(alignment);
    }
    catch (error) { alignment = null; geometryError = error.message; }
    state.sections.forEach(drawSection);
    if (state.pending && state.pending.points.length > 1) {
      L.polyline(state.pending.points, { color: '#f4aa43', weight: 2, dashArray: '5 6', interactive: false }).addTo(drawing);
    }
    syncHandles();
    if (alignment && alignment.segments.length) {
      G.stationLocations(alignment).forEach(location => addStationLabel(frame.toLatLng(location.point), location.stationFeet));
    } else if (state.first) addStationLabel(state.first, 0);

    $('drawBtn').setAttribute('aria-pressed', String(state.mode === 'draw'));
    $('curveBtn').setAttribute('aria-pressed', String(state.mode === 'curve'));
    $('accessBtn').setAttribute('aria-pressed', String(state.mode === 'access'));
    $('accessBtn').disabled = Boolean(state.pending || geometryError || !state.sections.length);
    $('reportsBtn').disabled = $('accessBtn').disabled;
    accessPoints.setActive(state.mode === 'access');
    accessPoints.refreshStations();
    $('curveBtn').disabled = !state.first || Boolean(geometryError);
    $('curveBtn').title = state.first ? 'Use the current endpoint as PC, then click MID and PT.' : 'Place the alignment start first.';
    $('finishBtn').disabled = Boolean(state.pending || geometryError || !state.sections.length || state.mode === 'finished');
    $('alignmentMap').classList.toggle('alignment-drawing', state.mode !== 'finished');
    status.classList.toggle('alignment-error', Boolean(geometryError || editNotice));
    if (geometryError || editNotice) status.textContent = editNotice || geometryError;
    else if (state.mode === 'finished') status.textContent = 'Alignment finished. Move or tap near it to read a station. Drag points to refine.';
    else if (state.mode === 'access') status.textContent = 'Click a driveway or road access. R: Residential · C: Commercial · N: Named Road / Access. Save or click the next location to continue.';
    else if (state.mode === 'curve') status.textContent = state.pending.points.length === 1
      ? 'Click MID, a point on the circular curve. PC is the current alignment endpoint.'
      : 'Click PT, the end of the curve.';
    else status.textContent = state.sections.at(-1)?.type === 'curve'
      ? 'Click ahead of PT to extend its tangent, or select Add Curve.'
      : state.first ? 'Click the next tangent endpoint, or select Add Curve.' : 'Click the map to establish Station 0+00.';
    $('endStation').textContent = alignment ? G.formatStation(G.toFeet(alignment.totalLength), state.sections.length ? 2 : 0) : '—';
    $('alignmentLength').textContent = alignment ? G.toFeet(alignment.totalLength).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ft' : '—';
    updateInquiry();
  }

  function clearInquiry() {
    if (inquiryMarker) { map.removeLayer(inquiryMarker); inquiryMarker = null; }
    $('inquiryStation').textContent = '—';
    $('inquiryDetail').textContent = state.mode === 'finished' ? 'Move or tap near the alignment.' : 'Move near the alignment to read a station.';
  }

  function updateInquiry() {
    if (!inquiryPoint || !alignment || !frame || !alignment.segments.length) { clearInquiry(); return; }
    const nearest = G.nearestStation(alignment, frame.toXY(inquiryPoint));
    const latlng = frame.toLatLng(nearest.point);
    const pixels = map.latLngToContainerPoint(latlng).distanceTo(map.latLngToContainerPoint(inquiryPoint));
    if (pixels > 24) { clearInquiry(); return; }
    const station = G.formatStation(nearest.stationFeet, 2);
    $('inquiryStation').textContent = station;
    $('inquiryDetail').textContent = G.toFeet(nearest.offset).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' ft from the centerline';
    if (!inquiryMarker) {
      inquiryMarker = L.circleMarker(latlng, { radius: 6, color: '#172d40', fillColor: '#ffcf57', fillOpacity: 1, weight: 2, interactive: false })
        .bindTooltip('Station ' + station, { permanent: true, direction: 'top', offset: [0, -7], className: 'alignment-inquiry-tooltip' })
        .addTo(map);
    } else { inquiryMarker.setLatLng(latlng); inquiryMarker.setTooltipContent('Station ' + station); }
  }

  $('drawBtn').addEventListener('click', () => changeMode('draw'));
  $('curveBtn').addEventListener('click', () => changeMode('curve'));
  $('finishBtn').addEventListener('click', () => changeMode('finished'));
  $('accessBtn').addEventListener('click', () => changeMode('access'));
  $('reportsBtn').addEventListener('click', () => { changeMode('finished'); reports.open(); });
  $('resetBtn').addEventListener('click', () => {
    reports.reset();
    accessPoints.reset();
    state.first = null; state.sections = []; state.pending = null; state.mode = 'draw';
    frame = null; inquiryPoint = null; inquiryPinned = false; lastClickTime = -Infinity;
    editNotice = '';
    render();
  });
  map.on('click', event => {
    const now = performance.now();
    if (now - lastClickTime < 200 || now - lastDragTime < 250) return;
    lastClickTime = now;
    inquiryPoint = cloneCoordinate(event.latlng);
    inquiryPinned = true;
    if (state.mode === 'access') accessPoints.addPoint(event.latlng);
    else addMapPoint(event.latlng);
    updateInquiry();
  });
  map.on('mousemove', event => { inquiryPoint = cloneCoordinate(event.latlng); inquiryPinned = false; updateInquiry(); });
  map.on('mouseout', () => { if (!inquiryPinned) { inquiryPoint = null; clearInquiry(); } });
  map.on('zoomend moveend', updateInquiry);
  if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe($('alignmentMap'));
  render();
})();
