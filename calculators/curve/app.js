(function(){
  // ===== Config =====
  const EXT_FT = 250;     // red tangent extensions (away from PI)
  const TICK_FT = 16;     // orange chevron tick length (drawn outward)
  const TICK_WEIGHT = 6;  // chevron stroke weight
  const AW_TICK_FT = 12;  // purple AW tick length
  const AW_GUIDE_WEIGHT = 5;                 // thickness of the highlighted AW distance
  const AW_GUIDE_STYLE = '10,7';             // dashed line
  // ---- Map ----
  const INITIAL_CENTER = [42.6389, -83.2910];
  const INITIAL_ZOOM = 15;

  const map = L.map('map', {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 22,
    wheelPxPerZoomLevel: 60,
    boxZoom: true,
    doubleClickZoom: false,
    tap: true
  }).setView(INITIAL_CENTER, INITIAL_ZOOM);

  const imagery = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '&copy; Esri & partners', maxNativeZoom: 19, maxZoom: 22, crossOrigin: 'anonymous' }
  ).addTo(map);

  const places = L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri', opacity: 0.85, maxNativeZoom: 19, maxZoom: 22, crossOrigin: 'anonymous' }
  ).addTo(map);

  map.createPane('labels');
  map.getPane('labels').style.zIndex = 625;
  map.getPane('labels').style.pointerEvents = 'none';
  const roadLabels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri', opacity: 0.9, maxNativeZoom: 19, maxZoom: 22, crossOrigin: 'anonymous', pane: 'labels' }
  ).addTo(map);

  map.createPane('chevrons');
  map.createPane('advance');
  map.createPane('delineators');
  map.getPane('chevrons').classList.add('chevrons-pane');
  map.getPane('advance').classList.add('advance-pane');
  map.getPane('delineators').classList.add('delineators-pane');
  map.getPane('delineators').style.zIndex = 645;
  map.getPane('delineators').style.pointerEvents = 'none';

  // ---- State ----
  const pts = [];
  let circle = null;
  let centerMarker = null;
  let chord = null;
  let poly123 = null;
  let arcSeg = null;
  let spacingArcs = [];
  let tan1 = null;
  let tan3 = null;
  let piMarker = null;
  let ext1 = null;
  let ext3 = null;
  let chevTicksLayer = null;
  let awTicksLayer = null;
  let delineatorLayer = null;
  let lastCurveBounds = null;
  let lastCalc = null;
  let streetViewPopup = null;
  let userLocationMarker = null;
  let userLocationAccuracyCircle = null;

  // ---- UI ----
  const panel      = document.getElementById('panel');
  const menuBtn    = document.getElementById('menuBtn');
  const statusEl   = document.getElementById('status');
  const resultsEl  = document.getElementById('results');
  const spacingEl   = document.getElementById('spacing');
  const modeSel     = document.getElementById('modeSel');
  const postedSel   = document.getElementById('postedSel');
  const advisorySel = document.getElementById('advisorySel');
  const aadtSel     = document.getElementById('aadtSel');
  const roadwayTypeSel = document.getElementById('roadwayTypeSel');
  const chevronRoadTypeSel = document.getElementById('chevronRoadTypeSel');
  const chevronSizingMessage = document.getElementById('chevronSizingMessage');
  const rcocChevronSizeEl = document.getElementById('rcocChevronSize');
  const mdotChevronSizeEl = document.getElementById('mdotChevronSize');
  const surfaceSel  = document.getElementById('surfaceSel');
  const locateBtn   = document.getElementById('locateBtn');
  const roadWidthInput  = document.getElementById('roadWidthInput');
  const roadHeightInput = document.getElementById('roadHeightInput');
  const methodSlider = document.getElementById('methodSlider');
  const speedBasisSel = document.getElementById('speedBasisSel');
  const includeOptional = document.getElementById('includeOptional');
  const pavedTreatmentSel = document.getElementById('pavedTreatmentSel');
  const urbanLowVolume = document.getElementById('urbanLowVolume');
  const omitEligible = document.getElementById('omitEligible');
  const advanceOverride = document.getElementById('advanceOverride');
  const shoulderWidthInput = document.getElementById('shoulderWidthInput');
  const delineatorOffsetInput = document.getElementById('delineatorOffsetInput');
  const delineatorSidesSel = document.getElementById('delineatorSidesSel');
  // MUTCD Table 2C-4 lookup data (AADT vs roadway class).
  const DEFAULT_AADT_KEY = '1000_2999';
  const AADT_CATEGORY_META = {
    lt1000:      { key: 'lt1000', description: 'Less than 1,000' },
    '1000_2999':   { key: '1000_2999', description: '1,000-2,999' },
    '3000_3999':   { key: '3000_3999', description: '3,000-3,999' },
    '4000_plus':   { key: '4000_plus', description: 'Greater than 3,999' }
  };
  const instructionsSection = document.querySelector('.section-instructions');
  const instructionsToggle  = document.getElementById('instructionsToggle');
  const instructionsBody    = instructionsSection ? instructionsSection.querySelector('.instructions-body') : null;

  const STATUS_DEFAULT = 'Tap the map to place three points on the road centerline.';
  const STATUS_READY = 'Computed from 3 points. Drag markers to refine or press Reset.';

  // ---- Instructions toggle (mobile fly-out) ----
  if (instructionsSection && instructionsToggle && instructionsBody) {
    const mq = window.matchMedia('(max-width: 900px)');
    const applyResponsiveState = (isMobile) => {
      if (isMobile) {
        instructionsSection.classList.remove('open');
        instructionsToggle.setAttribute('aria-expanded', 'false');
        instructionsToggle.textContent = 'Show instructions';
        instructionsBody.hidden = true;
      } else {
        instructionsSection.classList.add('open');
        instructionsToggle.setAttribute('aria-expanded', 'true');
        instructionsToggle.textContent = 'Hide instructions';
        instructionsBody.hidden = false;
      }
    };

    instructionsToggle.addEventListener('click', () => {
      const isOpen = instructionsSection.classList.toggle('open');
      instructionsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      instructionsToggle.textContent = isOpen ? 'Hide instructions' : 'Show instructions';
      instructionsBody.hidden = !isOpen;
    });

    const handleMediaChange = (e) => applyResponsiveState(e.matches);
    applyResponsiveState(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleMediaChange);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(handleMediaChange);
    }
  }

  // Numbered draggable markers
  function divIcon(n){
    return L.divIcon({
      className: 'num-marker',
      html: String(n),
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  function addMarker(latlng){
    if (pts.length === 3) return;
    const n = pts.length + 1;
    const marker = L.marker(latlng, { draggable: true, autoPan: true, icon: divIcon(n) }).addTo(map);
    marker.on('dragstart', () => {
      if (marker._icon) marker._icon.classList.add('dragging');
    });
    marker.on('dragend', () => {
      if (marker._icon) marker._icon.classList.remove('dragging');
      update();
    });
    marker.on('drag', update);
    pts.push(marker);
    update();
  }

  let lastAddTS = 0;
  let lastAddLL = null;
  map.on('click', (e) => {
    const now = performance.now();
    if (now - lastAddTS < 200) return;
    if (lastAddLL && map.distance(lastAddLL, e.latlng) < 0.75) return;
    lastAddTS = now;
    lastAddLL = e.latlng;
    if (streetViewPopup) {
      map.closePopup(streetViewPopup);
    }
    addMarker(e.latlng);
  });

  function ensureStreetViewPopup(){
    if (!streetViewPopup){
      streetViewPopup = L.popup({
        closeButton: false,
        autoPan: false,
        className: 'streetview-popup'
      });
    }
    return streetViewPopup;
  }

  function openStreetViewFlyout(latlng){
    const popup = ensureStreetViewPopup();
    const latStr = latlng.lat.toFixed(6);
    const lngStr = latlng.lng.toFixed(6);
    const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latStr},${lngStr}`;
    const content = `
      <div class="streetview-menu">
        <div class="menu-title">Street View</div>
        <button type="button" class="streetview-btn" data-url="${streetViewUrl}">Open in Google Street View</button>
        <div class="coords muted">${latStr}, ${lngStr}</div>
      </div>
    `;
    popup
      .setLatLng(latlng)
      .setContent(content)
      .openOn(map);
    requestAnimationFrame(() => {
      const container = document.querySelector('.streetview-popup .streetview-btn');
      if (container) {
        container.onclick = () => {
          window.open(streetViewUrl, '_blank', 'noopener');
          map.closePopup(popup);
        };
      }
    });
  }

  map.on('contextmenu', (e) => {
    if (e && e.originalEvent && typeof e.originalEvent.preventDefault === 'function') {
      e.originalEvent.preventDefault();
    }
    openStreetViewFlyout(e.latlng);
  });

  function clearUserLocation(){
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }
    if (userLocationAccuracyCircle) {
      map.removeLayer(userLocationAccuracyCircle);
      userLocationAccuracyCircle = null;
    }
  }

  function restoreStatusMessage(delay = 2000){
    if (delay <= 0) {
      statusEl.textContent = (pts.length === 3) ? STATUS_READY : STATUS_DEFAULT;
      return;
    }
    setTimeout(() => {
      statusEl.textContent = (pts.length === 3) ? STATUS_READY : STATUS_DEFAULT;
    }, delay);
  }

  function goToDeviceLocation(){
    if (!navigator.geolocation){
      statusEl.textContent = 'Geolocation not supported on this device.';
      restoreStatusMessage();
      return;
    }
    if (locateBtn) {
      locateBtn.disabled = true;
      locateBtn.classList.add('busy');
    }
    statusEl.textContent = 'Locating your position...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locateBtn) {
          locateBtn.disabled = false;
          locateBtn.classList.remove('busy');
        }
        const { latitude, longitude, accuracy = 0 } = pos.coords || {};
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)){
          statusEl.textContent = 'Location unavailable.';
          restoreStatusMessage();
          return;
        }
        const latlng = L.latLng(latitude, longitude);
        clearUserLocation();
        userLocationMarker = L.circleMarker(latlng, {
          radius: 6,
          color: '#0d47a1',
          weight: 2,
          fillColor: '#1e88e5',
          fillOpacity: 0.9,
          pane: 'markerPane'
        }).addTo(map).bindTooltip('Your location');
        if (Number.isFinite(accuracy) && accuracy > 1){
          userLocationAccuracyCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#1e88e5',
            weight: 1,
            opacity: 0.35,
            fillColor: '#1e88e5',
            fillOpacity: 0.12
          }).addTo(map);
        }
        const targetZoom = Math.max(map.getZoom(), 18);
        map.setView(latlng, targetZoom, { animate: true });
        const accuracyText = Number.isFinite(accuracy) ? ` ±${Math.round(accuracy)} m` : '';
        statusEl.textContent = `Centered on device location${accuracyText}.`;
        restoreStatusMessage(4000);
      },
      (err) => {
        if (locateBtn) {
          locateBtn.disabled = false;
          locateBtn.classList.remove('busy');
        }
        const message = err && err.message ? err.message : 'Unable to retrieve location.';
        statusEl.textContent = `Location error: ${message}`;
        restoreStatusMessage(4000);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000
      }
    );
  }

  modeSel.addEventListener('change', update);
  postedSel.addEventListener('change', update);
  advisorySel.addEventListener('change', update);
  if (aadtSel) aadtSel.addEventListener('change', update);
  if (roadwayTypeSel) roadwayTypeSel.addEventListener('change', update);
  chevronRoadTypeSel.addEventListener('change', update);
  if (surfaceSel) surfaceSel.addEventListener('change', update);
  if (roadWidthInput) roadWidthInput.addEventListener('input', update);
  if (roadHeightInput) roadHeightInput.addEventListener('input', update);
  methodSlider.addEventListener('input', update);
  [speedBasisSel, includeOptional, pavedTreatmentSel, urbanLowVolume, omitEligible, delineatorSidesSel]
    .forEach(input => input.addEventListener('change', update));
  [advanceOverride, shoulderWidthInput, delineatorOffsetInput].forEach(input => input.addEventListener('input', update));
  if (locateBtn) locateBtn.addEventListener('click', goToDeviceLocation);

  function togglePanel(){
    const isOpen = panel.classList.toggle('open');
    document.body.classList.toggle('panel-open', isOpen);
    menuBtn.setAttribute('aria-expanded', String(isOpen));
    menuBtn.setAttribute('aria-label', isOpen ? 'Close controls' : 'Open controls');
    setTimeout(() => map.invalidateSize(false), 250);
  }
  menuBtn && menuBtn.addEventListener('click', togglePanel);

  document.getElementById('resetBtn').onclick = () => {
    pts.forEach(m => map.removeLayer(m));
    pts.length = 0;
    clearOverlays();
    clearUserLocation();
    if (streetViewPopup) {
      map.closePopup(streetViewPopup);
    }
    resultsEl.innerHTML = '';
    spacingEl.innerHTML = '';
    update();
    lastCurveBounds = null;
    lastCalc = null;
    statusEl.textContent = STATUS_DEFAULT;
    map.setView(INITIAL_CENTER, INITIAL_ZOOM, { animate: true });
    map.invalidateSize(false);
  };

  window.addEventListener('resize', () => map.invalidateSize(false), { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(() => map.invalidateSize(false), 250), { passive: true });

  function getAadtCategoryMeta(key){
    return AADT_CATEGORY_META[key] || AADT_CATEGORY_META[DEFAULT_AADT_KEY];
  }

  const selectedMethod = () => methodSlider.value === '0' ? 'mdot' : 'mmutcd';
  const sourceLink = entry => `<a class="source-link" href="${entry[1]}" target="_blank" rel="noopener noreferrer">Source: ${entry[0]}</a>`;

  function updateMethod(){
    const method = selectedMethod();
    const label = CurveGuidance.sources[method].label;
    document.getElementById('methodName').textContent = label;
    methodSlider.setAttribute('aria-valuetext', label);
    [pavedTreatmentSel, urbanLowVolume, omitEligible, aadtSel].forEach(el => { el.disabled = method !== 'mmutcd'; });
    return method;
  }

  function updateChevronSizing(){
    const method = selectedMethod();
    const sizes = CurveChevronSizing.lookupChevronSizes({
      roadType: chevronRoadTypeSel.value,
      roadwayType: roadwayTypeSel.value,
      advisoryMPH: advisorySel.value
    });
    const format = size => `${size.width} × ${size.height} in — ${size.rationale}`;
    chevronSizingMessage.textContent = sizes.message;
    chevronSizingMessage.classList.toggle('warn', sizes.conflict);
    chevronRoadTypeSel.setCustomValidity(sizes.message);
    chevronRoadTypeSel.setAttribute('aria-invalid', String(Boolean(sizes.message)));
    rcocChevronSizeEl.textContent = sizes.message ? 'Select consistent road types above to see sizing.'
      : sizes.rcoc ? format(sizes.rcoc) : 'RCOC local/primary sizing does not apply to the selected road type.';
    document.getElementById('mdotSizingTitle').textContent = `${method === 'mdot' ? 'MDOT' : 'MMUTCD'} chevron sizing (W1-8)`;
    document.getElementById('standardSizingRules').textContent = method === 'mdot'
      ? 'Conventional: 24 × 30 in. Mainline: 36 × 48 in. Ramps: 24 × 30 in at ≤40 mph; 36 × 48 in at 45–55 mph advisory speed.'
      : 'Conventional: 18 × 24 in. Expressway: 30 × 36 in. Freeway: 36 × 48 in. Larger signs may be used (§2C.03).';
    document.getElementById('standardSizingSource').innerHTML = sourceLink(CurveGuidance.sources[method].size);
    mdotChevronSizeEl.textContent = sizes.message ? 'Select consistent road types above to see sizing.'
      : sizes[method] ? format(sizes[method]) : sizes[`${method}Note`];
    return sizes;
  }

  function guidanceHTML(g, method){
    const source = CurveGuidance.sources[method];
    const treatment = { none:'No automatic layout', chevrons:'Chevrons and advance warning',
      delineators:'Delineators and advance warning', warning:'Advance warning sign', markings:'Pavement markings' }[g.treatment];
    return `<h2>${source.label}: device selection</h2>
      <div class="stat"><strong>Speed differential:</strong> ${g.delta.toFixed(0)} mph</div>
      ${method === 'mmutcd' ? `<div class="stat"><strong>Chart A device need:</strong> ${g.need} (AADT ${getAadtCategoryMeta(aadtSel.value).description})</div>` : ''}
      <div class="stat"><strong>Advance warning:</strong> ${g.warning}</div>
      <div class="stat"><strong>${method === 'mdot' ? 'Chevrons / large arrow' : 'Curve delineation'}:</strong> ${g.alignment}</div>
      <div class="stat"><strong>Treatment:</strong> ${treatment}</div>
      ${g.rampSign ? `<div class="stat"><strong>Exit/ramp speed sign:</strong> ${g.rampSign}</div>` : ''}
      <div class="layout-note">${g.note}</div>${sourceLink(source.need)}
      <div class="stat"><strong>Advisory-speed plaque (W13-1P):</strong> ${g.plaque}</div>
      <div class="small-note muted">Plaque status applies when installing the advance warning sign; use the study advisory speed. Do not install the plaque alone.</div>
      ${sourceLink(source.plaque)}`;
  }

  function renderReferences(){
    const groups = [
      ['MMUTCD (2025)', 'mmutcd-curve-reference.pdf', [
        ['Sizing — Table 2C-1 / §2C.03', 1, null],
        ['Advance placement — Table 2C-3 / §2C.04', 3, 'mmutcd-198.png'],
        ['Device selection — Table 2C-4 / §§2C.06–07', 4, 'mmutcd-201.png'],
        ['Chevron spacing — Table 2C-5 / §2C.08', 6, 'mmutcd-204.png'],
        ['Advisory-speed plaques — Table 2C-6 / §2C.59', 8, 'mmutcd-242.png'],
        ['Delineators — §§3G.01–04 / Table 3G-1', 9, 'mmutcd-665.png']
      ]],
      ['MDOT signing guide (2023)', 'mdot-curve-reference.pdf', [
        ['Sign sizes — Table 2, p. 18', 1, 'mdot-23.png'],
        ['Advance placement — Table 3, p. 21', 2, 'mdot-26.png'],
        ['Advisory speed and device selection — pp. 24–26 / Table 5', 3, 'mdot-30.png'],
        ['Chevron spacing — Appendix B-9', 6, 'mdot-98.png'],
        ['Design-equation estimate — Appendices B-11 / B-12', 7, 'mdot-101.png']
      ]]
    ];
    document.getElementById('referenceSections').innerHTML = groups.map(([title,file,sections]) =>
      `<details class="card reference-details"><summary>${title}</summary>
        <p><a href="references/${file}" target="_blank" rel="noopener noreferrer">Open all included sections (PDF)</a></p>
        ${sections.map(([label,page,img]) => `<details class="reference-details"><summary>${label}</summary>
          <a href="references/${file}#page=${page}" target="_blank" rel="noopener noreferrer">Read the section and notes in the PDF</a>
          ${img ? `<a href="references/${img}" target="_blank" rel="noopener noreferrer"><img src="references/${img}" alt="${label}: original source page" loading="lazy" /></a>` : ''}
        </details>`).join('')}</details>`).join('');
  }

  // ---- Geometry helpers ----
  const R_EARTH = 6378137.0;
  const FT_PER_M = 3.280839895;
  const deg2rad = d => d * Math.PI / 180;
  const rad2deg = r => r * 180 / Math.PI;
  const originFrom = (A_ll, B_ll, C_ll) => ({
    lat: (A_ll.lat + B_ll.lat + C_ll.lat) / 3,
    lng: (A_ll.lng + B_ll.lng + C_ll.lng) / 3
  });
  function toXY_local(ll, o){
    const la = deg2rad(ll.lat);
    const lo = deg2rad(ll.lng);
    const la0 = deg2rad(o.lat);
    const lo0 = deg2rad(o.lng);
    return {
      x: R_EARTH * (lo - lo0) * Math.cos(la0),
      y: R_EARTH * (la - la0)
    };
  }
  function fromXY_local(x, y, o){
    const la0 = deg2rad(o.lat);
    const lo0 = deg2rad(o.lng);
    return L.latLng(
      rad2deg(y / R_EARTH + la0),
      rad2deg(x / (R_EARTH * Math.cos(la0)) + lo0)
    );
  }
  const dist = (a,b) => Math.hypot(a.x - b.x, a.y - b.y);
  function triArea(A,B,C){
    return 0.5 * Math.abs(
      A.x * (B.y - C.y) +
      B.x * (C.y - A.y) +
      C.x * (A.y - B.y)
    );
  }
  function circumcenter(A,B,C){
    const d = 2 * (A.x*(B.y-C.y) + B.x*(C.y-A.y) + C.x*(A.y-B.y));
    if (Math.abs(d) < 1e-9) return null;
    const a2 = A.x*A.x + A.y*A.y;
    const b2 = B.x*B.x + B.y*B.y;
    const c2 = C.x*C.x + C.y*C.y;
    return {
      x: (a2*(B.y-C.y) + b2*(C.y-A.y) + c2*(A.y-B.y)) / d,
      y: (a2*(C.x-B.x) + b2*(A.x-C.x) + c2*(B.x-A.x)) / d
    };
  }
  const angleAt = (P,O) => Math.atan2(P.y - O.y, P.x - O.x);
  const norm = a => ((a % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
  const angDiffCCW = (a,b) => norm(b - a);
  const minorSepDeg = (a,b) => {
    const diff = angDiffCCW(a,b);
    return Math.min(diff, 2*Math.PI - diff) * 180 / Math.PI;
  };
  const cross = (u,v) => u.x*v.y - u.y*v.x;
  const add = (p,s,v) => ({ x: p.x + s*v.x, y: p.y + s*v.y });
  const perpCCW = v => ({ x: -v.y, y: v.x });
  const unit = v => {
    const m = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / m, y: v.y / m };
  };
  const formatFeet = n => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft`;

  function clearOverlays(){
    [circle, centerMarker, chord, poly123, arcSeg, tan1, tan3, piMarker, ext1, ext3]
      .forEach(layer => { if (layer) map.removeLayer(layer); });
    spacingArcs.forEach(layer => map.removeLayer(layer));
    spacingArcs = [];
    if (chevTicksLayer) { chevTicksLayer.clearLayers(); map.removeLayer(chevTicksLayer); chevTicksLayer = null; }
    if (awTicksLayer) { awTicksLayer.clearLayers(); map.removeLayer(awTicksLayer); awTicksLayer = null; }
    if (delineatorLayer) { delineatorLayer.clearLayers(); map.removeLayer(delineatorLayer); delineatorLayer = null; }
  }

  function drawArcMinorLL(O, Rm, thStart, thEnd, steps, ORG){
    const ptsLL = [];
    const span = thEnd - thStart;
    for (let i = 0; i <= steps; i++){
      const t = thStart + span * (i/steps);
      const x = O.x + Rm * Math.cos(t);
      const y = O.y + Rm * Math.sin(t);
      ptsLL.push(fromXY_local(x,y,ORG));
    }
    return ptsLL;
  }

  function update(){
    clearOverlays();
    spacingEl.innerHTML = '';
    lastCalc = null;
    const method = updateMethod();
    const source = CurveGuidance.sources[method];
    const chevronSizes = updateChevronSizing();
    const postedMPH = Number(postedSel.value);
    const advisoryMPH = Number(advisorySel.value);
    const roadWidthFt = parseFloat(roadWidthInput.value);
    const roadHeightFt = parseFloat(roadHeightInput.value);
    const shoulderFt = parseFloat(shoulderWidthInput.value);
    const offsetFt = parseFloat(delineatorOffsetInput.value);
    const guidance = CurveGuidance.deviceGuidance({ method, approachMPH: postedMPH, advisoryMPH,
      roadwayType: roadwayTypeSel.value, aadtKey: aadtSel.value, surfaceType: surfaceSel.value,
      roadType: chevronRoadTypeSel.value, speedBasis: speedBasisSel.value,
      includeOptional: includeOptional.checked, pavedTreatment: pavedTreatmentSel.value,
      urbanLowVolume: urbanLowVolume.checked, omitEligible: omitEligible.checked });
    const selectionHTML = guidanceHTML(guidance, method);
    resultsEl.innerHTML = `<div class="callout">${selectionHTML}</div>`;
    if (pts.length < 3){
      statusEl.textContent = `Pick ${3 - pts.length} more point${3 - pts.length === 1 ? '' : 's'}.`;
      lastCurveBounds = null;
      return;
    }
    if (!(roadWidthFt > 0) || !(shoulderFt >= 0) || !(offsetFt >= 2 && offsetFt <= 8)) {
      resultsEl.innerHTML += '<div class="warn">Enter a positive road width, a nonnegative shoulder width, and a delineator offset of 2–8 ft.</div>';
      return;
    }
    if (urbanLowVolume.checked && method === 'mmutcd' && !['lt1000','1000_2999'].includes(aadtSel.value)) {
      resultsEl.innerHTML += '<div class="warn">The urban AADT ≤1,000 selection conflicts with the AADT category.</div>';
      return;
    }
    if (advanceOverride.value !== '' && !(Number(advanceOverride.value) > 0)) {
      resultsEl.innerHTML += '<div class="warn">Enter a positive site advance-warning distance or clear the override.</div>';
      return;
    }
    const A_ll = pts[0].getLatLng(), B_ll = pts[1].getLatLng(), C_ll = pts[2].getLatLng();
    const ORG = originFrom(A_ll, B_ll, C_ll);
    const A = toXY_local(A_ll, ORG), B = toXY_local(B_ll, ORG), C = toXY_local(C_ll, ORG);
    const O = circumcenter(A,B,C);
    if (!O || triArea(A,B,C) < 1e-6) {
      resultsEl.innerHTML += '<div class="warn">Points are nearly collinear. Spread them along the curve.</div>';
      return;
    }
    const Rm = dist(O,A), Rf = Rm * FT_PER_M;
    const thA = angleAt(A,O), thB = angleAt(B,O), thC = angleAt(C,O);
    const ccw = angDiffCCW(thA,thC);
    const span = angDiffCCW(thA,thB) <= ccw ? ccw : ccw - 2*Math.PI;
    if (Math.abs(span) > Math.PI + 1e-8) {
      resultsEl.innerHTML += '<div class="warn">This layout supports a single circular arc up to 180°. Select a shorter curve with point 2 between PC and PT.</div>';
      return;
    }
    const signDir = span >= 0 ? 1 : -1;
    const gamma = Math.abs(span), arcLen_m = Rm*gamma, arcLen_f = arcLen_m*FT_PER_M;
    const centralDeg = gamma*180/Math.PI;
    const O_ll = fromXY_local(O.x,O.y,ORG);
    const e = Number.isFinite(roadHeightFt) ? roadHeightFt/roadWidthFt : NaN;
    const estimate = CurveGuidance.advisoryEstimate(Rf,e);
    const chevronSpacing = CurveGuidance.chevronSpacing(method,Rf,advisoryMPH);
    const advance = CurveGuidance.advanceDistance(method,postedMPH,advisoryMPH,advanceOverride.value);
    const validSelection = !chevronSizes.message;
    const showChevrons = validSelection && guidance.showChevrons;
    const showDelineators = validSelection && guidance.showDelineators;
    const showWarning = validSelection && guidance.showWarning;
    const chevrons = CurveGuidance.placement(arcLen_f,chevronSpacing.feet,modeSel.value);
    const delineators = CurveGuidance.delineatorLayout(arcLen_f,Rf,modeSel.value);
    const chevronPositions = showChevrons ? chevrons.positions : [];
    const delineatorPositions = showDelineators
      ? [...delineators.approaches,...delineators.positions,...delineators.departures] : [];
    const offset_m = (roadWidthFt/2 + shoulderFt + offsetFt)/FT_PER_M;
    const bothSides = delineatorSidesSel.value === 'both';
    const innerPossible = Rm > offset_m;

    // Extend stationing onto the approach/departure tangents; never extend the circle.
    function pointAt(stationFt){
      const station = stationFt/FT_PER_M;
      const theta = station < 0 ? thA : station > arcLen_m ? thC : thA + signDir*station/Rm;
      const radial = { x:Math.cos(theta), y:Math.sin(theta) };
      const tangent = { x:-signDir*radial.y, y:signDir*radial.x };
      const extension = station < 0 ? station : station > arcLen_m ? station-arcLen_m : 0;
      return { x:O.x+Rm*radial.x+extension*tangent.x, y:O.y+Rm*radial.y+extension*tangent.y, radial, tangent };
    }
    const ll = P => fromXY_local(P.x,P.y,ORG);
    centerMarker = L.circleMarker(O_ll,{radius:5,color:'#1f78b4',fillOpacity:1}).addTo(map).bindTooltip('Center');
    circle = L.circle(O_ll,{radius:Rm,weight:1,color:'#1f78b4',opacity:.6,fillOpacity:0}).addTo(map);
    chord = L.polyline([A_ll,C_ll],{weight:2,dashArray:'6,6',color:'#333'}).addTo(map);
    poly123 = L.polyline([A_ll,B_ll,C_ll],{weight:2,color:'#666'}).addTo(map);
    arcSeg = L.polyline(drawArcMinorLL(O,Rm,thA,thA+span,90,ORG),{weight:3,color:'#1f78b4'}).addTo(map);
    const approachEnd = ll(pointAt(-EXT_FT)), departureEnd = ll(pointAt(arcLen_f+EXT_FT));
    ext1 = L.polyline([A_ll,approachEnd],{weight:5,color:'#e53935'}).addTo(map);
    ext3 = L.polyline([C_ll,departureEnd],{weight:5,color:'#e53935'}).addTo(map);
    lastCurveBounds = L.latLngBounds([A_ll,B_ll,C_ll,O_ll,approachEnd,departureEnd]).extend(circle.getBounds());
    const tA = pointAt(0).tangent, tC = pointAt(arcLen_f).tangent;
    const denom = cross(tA,tC);
    if (Math.abs(denom) > 1e-9) {
      const PI = add(A,cross({x:C.x-A.x,y:C.y-A.y},tC)/denom,tA);
      const PI_ll = ll(PI);
      tan1 = L.polyline([A_ll,PI_ll],{weight:2.5,color:'#111'}).addTo(map);
      tan3 = L.polyline([C_ll,PI_ll],{weight:2.5,color:'#111'}).addTo(map);
      piMarker = L.circleMarker(PI_ll,{radius:4.5,color:'#111',fillColor:'#fff'}).addTo(map);
    }
    if (showWarning && Number.isFinite(advance.feet)) {
      awTicksLayer = L.layerGroup([],{pane:'advance'}).addTo(map);
      for (const [origin,station] of [[0,-advance.feet],[arcLen_f,arcLen_f+advance.feet]]) {
        const P = pointAt(station), half = AW_TICK_FT/FT_PER_M/2;
        L.polyline([ll(pointAt(origin)),ll(P)],{pane:'advance',color:'#7b1fa2',weight:AW_GUIDE_WEIGHT,dashArray:AW_GUIDE_STYLE}).addTo(awTicksLayer);
        L.polyline([ll(add(P,half,P.radial)),ll(add(P,-half,P.radial))],{pane:'advance',color:'#7b1fa2',weight:TICK_WEIGHT})
          .addTo(awTicksLayer).bindTooltip(`Advance warning: ${advance.feet} ft`);
      }
    }
    chevTicksLayer = L.layerGroup([],{pane:'chevrons'}).addTo(map);
    chevronPositions.forEach(station => {
      const P = pointAt(station);
      const roadside = add(P,(roadWidthFt/2+shoulderFt+3)/FT_PER_M,P.radial);
      L.polyline([ll(roadside),ll(add(roadside,TICK_FT/FT_PER_M,P.radial))],
        {pane:'chevrons',color:'#ff9800',weight:TICK_WEIGHT,opacity:.95,lineCap:'round'}).addTo(chevTicksLayer);
    });
    delineatorLayer = L.layerGroup([],{pane:'delineators'}).addTo(map);
    delineatorPositions.forEach(station => {
      const P=pointAt(station);
      const opts={pane:'delineators',radius:3.4,color:'#607d8b',weight:1.2,fillColor:'#fff',fillOpacity:1,className:'delineator-dot'};
      L.circleMarker(ll(add(P,offset_m,P.radial)),opts).addTo(delineatorLayer);
      if (bothSides && innerPossible) L.circleMarker(ll(add(P,-offset_m,P.radial)),opts).addTo(delineatorLayer);
    });
    const sepAB=minorSepDeg(thA,thB), sepBC=minorSepDeg(thB,thC);
    spacingEl.innerHTML=`<div class="stat"><strong>Sample point spacing</strong></div>
      <div class="stat">PC–midpoint: ${sepAB.toFixed(1)}°; midpoint–PT: ${sepBC.toFixed(1)}°.</div>
      ${sepAB<30||sepAB>120||sepBC<30||sepBC>120 ? '<div class="warn">Target 30–120° between sample points.</div>' : ''}`;
    const formatStep = value => Number.isFinite(value) ? `${value.toFixed(1)} ft` : 'Not applicable';
    const Nchev = chevronPositions.length;
    const curveDelineators = showDelineators ? delineators.positions.length : 0;
    const transitionCount = showDelineators ? 6 : 0;
    const sides = bothSides && innerPossible ? 2 : 1;
    const advisoryDisplay = estimate.speed === null ? 'Outside supported estimate / inputs unavailable'
      : `${estimate.speed.toFixed(1)} mph (f = ${estimate.friction.toFixed(3)})`;
    const isConventional = ['rcoc_local','rcoc_primary','conventional'].includes(chevronRoadTypeSel.value);
    const warningDisplay = !showWarning ? 'Not drawn for the selected treatment.'
      : Number.isFinite(advance.feet) ? `${advance.feet} ft before PC / beyond PT${advance.custom ? ' — site distance entered by user' : ''}.`
      : 'Site placement distance needed; no warning ticks drawn.';
    resultsEl.innerHTML=`<div class="callout"><h1>Outputs</h1>${selectionHTML}
      ${!validSelection ? `<div class="warn">${chevronSizes.message} Device layout is withheld.</div>` : ''}
      <hr /><h2>Chevron layout</h2>
      <div class="stat"><strong>Target:</strong> ${formatStep(chevronSpacing.feet)}</div>
      <div class="layout-note">${chevronSpacing.note}</div>
      <div class="stat"><strong>Actual spacing:</strong> ${formatStep(Nchev>1 ? chevrons.step : null)}</div>
      <div class="stat"><strong>Chevron positions shown:</strong> ${Nchev}</div>
      ${!showChevrons ? '<div class="small-note muted">Chevrons are not drawn for the selected treatment.</div>' : ''}
      ${method==='mdot' && showChevrons && isConventional ? '<div class="layout-note">MDOT p. 26 / B-9: place W1-6 target arrows for both directions before finalizing chevrons. Each target arrow replaces a chevron; the shown positions are preliminary.</div>' : ''}
      ${sourceLink(source.spacing)}
      <h2>Advance warning placement</h2><div class="stat">${warningDisplay}</div>
      <div class="layout-note">${advance.note}</div>
      ${advance.custom && advance.tableFeet !== null ? `<div class="small-note muted">Selected-source table value: ${advance.tableFeet} ft.</div>` : ''}
      ${sourceLink(source.advance)}
      <h2>Delineator layout</h2>
      <div class="stat"><strong>Target S:</strong> ${formatStep(delineators.target)} (3√(R − 50), limited to 20–300 ft)</div>
      <div class="stat"><strong>Actual curve spacing:</strong> ${formatStep(showDelineators ? delineators.step : null)}</div>
      <div class="stat"><strong>Positions shown:</strong> ${curveDelineators} on curve + ${transitionCount} on tangents per side; ${(curveDelineators+transitionCount)*sides} total.</div>
      <div class="small-note muted">Tangent intervals away from PC: ${delineators.approachIntervals.map(x=>x.toFixed(1)).join(', ')} ft; away from PT: ${delineators.departureIntervals.map(x=>x.toFixed(1)).join(', ')} ft (2S, 3S, 6S, with 300-ft maximum gaps).</div>
      <div class="layout-note">${delineators.note}${bothSides && !innerPossible ? ' Inner offset exceeds curve radius; only outside delineators can be shown.' : ''}</div>
      ${sourceLink(CurveGuidance.sources.delineators)}
      <h2>Advisory-speed study support</h2>
      <div class="stat"><strong>Study speed used for signing:</strong> ${advisoryMPH} mph</div>
      <div class="stat"><strong>Superelevation:</strong> ${Number.isFinite(e) ? (e*100).toFixed(2)+'%' : 'Not entered'}</div>
      <div class="stat"><strong>MDOT design-equation estimate:</strong> ${advisoryDisplay}</div>
      <div class="layout-note">${estimate.note} Advisory speed must be established by an engineering study (§2C.59).</div>
      ${sourceLink(CurveGuidance.sources.advisory)}
      ${sourceLink(CurveGuidance.sources.mmutcd.plaque)}
      <h2>Curve details</h2>
      <div class="stat"><strong>Radius:</strong> ${formatFeet(Rf)}</div>
      <div class="stat"><strong>Central angle:</strong> ${centralDeg.toFixed(2)}°</div>
      <div class="stat"><strong>Arc length:</strong> ${formatFeet(arcLen_f)}</div>
      <div class="stat"><strong>Degree of curve (100-ft arc):</strong> ${(5729.57795/Rf).toFixed(4)}°</div>
      <div class="small-note muted">Map symbols show the selected layout. Confirm field visibility, sign orientation, and site offsets. Purple: advance warning; orange: chevrons; dots: delineators. Tangent layouts are shown at both ends; evaluate each approach speed separately.</div>
    </div>`;
    lastCalc={method,Rf,arcLen_f,guidance,chevronSizes,chevronSpacing,advance,Nchev,curveDelineators,transitionCount,estimate};
    statusEl.textContent=STATUS_READY;
  }

  renderReferences();
  update();
  statusEl.textContent = STATUS_DEFAULT;
})();



