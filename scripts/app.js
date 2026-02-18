(function(){
  // ===== Config =====
  const EXT_FT = 250;     // red tangent extensions (away from PI)
  const TICK_FT = 16;     // orange chevron tick length (drawn outward)
  const TICK_WEIGHT = 6;  // chevron stroke weight
  const AW_TICK_FT = 12;  // purple AW tick length
  const AW_GUIDE_WEIGHT = 5;                 // thickness of the highlighted AW distance
  const AW_GUIDE_STYLE = '10,7';             // dashed line
  const DELINEATOR_OFFSET_FT = 35;           // lateral offset from centerline
  const DELINEATOR_MIN_SPACING_FT = 20;      // minimum delineator spacing
  const DELINEATOR_MAX_SPACING_FT = 300;     // maximum delineator spacing
  const MDOT_RAMP_SLOW_MAX = 40;             // ramp speeds using 24" (MDOT)
  const MDOT_RAMP_FAST_MIN = 45;             // ramp speeds using 36" (MDOT)
  const MDOT_RAMP_FAST_MAX = 55;             // ramp speeds using 36" (MDOT)

  // Side-friction lookup table (AASHTO 2011 Fig. 3-6 approximations)
  const SIDE_FRICTION_TABLE = [
    { speed: 15, friction: 0.32 },
    { speed: 20, friction: 0.27 },
    { speed: 25, friction: 0.23 },
    { speed: 30, friction: 0.20 },
    { speed: 35, friction: 0.18 },
    { speed: 40, friction: 0.16 },
    { speed: 45, friction: 0.15 },
    { speed: 50, friction: 0.14 }
  ];

  function sideFrictionAt(mph){
    if (!Number.isFinite(mph) || SIDE_FRICTION_TABLE.length === 0) return 0;
    if (mph <= SIDE_FRICTION_TABLE[0].speed) return SIDE_FRICTION_TABLE[0].friction;
    for (let i = 0; i < SIDE_FRICTION_TABLE.length - 1; i++){
      const a = SIDE_FRICTION_TABLE[i];
      const b = SIDE_FRICTION_TABLE[i + 1];
      if (mph <= b.speed){
        const t = (mph - a.speed) / (b.speed - a.speed);
        return a.friction + t * (b.friction - a.friction);
      }
    }
    if (SIDE_FRICTION_TABLE.length < 2) return SIDE_FRICTION_TABLE[0].friction;
    const a = SIDE_FRICTION_TABLE[SIDE_FRICTION_TABLE.length - 2];
    const b = SIDE_FRICTION_TABLE[SIDE_FRICTION_TABLE.length - 1];
    const t = (mph - a.speed) / (b.speed - a.speed || 1);
    return a.friction + t * (b.friction - a.friction);
  }

  function solveAdvisorySpeedFromRadius(radiusFt, superelevationDecimal, guessMPH = 45){
    const result = { speed: NaN, friction: NaN, iterations: 0, converged: false };
    if (!Number.isFinite(radiusFt) || radiusFt <= 0) return result;
    const e = Number.isFinite(superelevationDecimal) ? superelevationDecimal : 0;
    let v = Number.isFinite(guessMPH) && guessMPH > 0 ? guessMPH : 35;
    v = Math.max(5, v);
    const MAX_ITER = 30;
    const TOL = 1e-2;
    for (let i = 0; i < MAX_ITER; i++){
      const f = sideFrictionAt(v);
      const balance = e + f;
      if (balance <= 0){
        result.speed = 0;
        result.friction = f;
        result.iterations = i + 1;
        return result;
      }
      const next = Math.sqrt(15 * radiusFt * balance);
      if (!Number.isFinite(next)){
        result.speed = v;
        result.friction = f;
        result.iterations = i + 1;
        return result;
      }
      result.iterations = i + 1;
      if (Math.abs(next - v) < TOL){
        v = next;
        result.converged = true;
        break;
      }
      v = next;
    }
    result.speed = v;
    result.friction = sideFrictionAt(v);
    return result;
  }

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
  const surfaceSel  = document.getElementById('surfaceSel');
  const locateBtn   = document.getElementById('locateBtn');
  const roadWidthInput  = document.getElementById('roadWidthInput');
  const roadHeightInput = document.getElementById('roadHeightInput');
  // MUTCD Table 2C-4 lookup data (AADT vs roadway class).
  const DEFAULT_AADT_KEY = '1000_2999';
  const DEFAULT_ROADWAY_TYPE = 'arterial_with_markings';
  const AADT_CATEGORY_META = {
    lt1000:      { key: 'lt1000', description: 'Less than 1,000' },
    '1000_2999':   { key: '1000_2999', description: '1,000-2,999' },
    '3000_3999':   { key: '3000_3999', description: '3,000-3,999' },
    '4000_plus':   { key: '4000_plus', description: 'Greater than 3,999' }
  };
  const ROADWAY_ROWS = [
    { id: 'freeway_expressway', label: 'Freeway or expressway' },
    { id: 'arterial_no_markings', label: 'Arterial or collector without pavement markings' },
    { id: 'arterial_with_markings', label: 'Arterial or collector with pavement markings' },
    { id: 'all_other', label: 'All other roadways' }
  ];
  const ALIGNMENT_NEED_MATRIX = {
    lt1000: {
      freeway_expressway: 'Required',
      arterial_no_markings: 'Optional',
      arterial_with_markings: 'Optional',
      all_other: 'Optional'
    },
    '1000_2999': {
      freeway_expressway: 'Required',
      arterial_no_markings: 'Recommended',
      arterial_with_markings: 'Recommended',
      all_other: 'Optional'
    },
    '3000_3999': {
      freeway_expressway: 'Required',
      arterial_no_markings: 'Required',
      arterial_with_markings: 'Recommended',
      all_other: 'Optional'
    },
    '4000_plus': {
      freeway_expressway: 'Required',
      arterial_no_markings: 'Required',
      arterial_with_markings: 'Required',
      all_other: 'Optional'
    }
  };
  const SURFACE_META = {
    paved:  { key: 'paved', label: 'Paved (hard surface)' },
    gravel: { key: 'gravel', label: 'Gravel / unpaved' }
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
  if (surfaceSel) surfaceSel.addEventListener('change', update);
  if (roadWidthInput) roadWidthInput.addEventListener('input', update);
  if (roadHeightInput) roadHeightInput.addEventListener('input', update);
  if (locateBtn) locateBtn.addEventListener('click', goToDeviceLocation);

  function togglePanel(){
    const isOpen = panel.classList.toggle('open');
    document.body.classList.toggle('panel-open', isOpen);
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
    lastCurveBounds = null;
    lastCalc = null;
    statusEl.textContent = STATUS_DEFAULT;
    map.setView(INITIAL_CENTER, INITIAL_ZOOM, { animate: true });
    map.invalidateSize(false);
  };

  window.addEventListener('resize', () => map.invalidateSize(false), { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(() => map.invalidateSize(false), 250), { passive: true });

  // ---- Advance warning lookup ----
  const AW_TABLE = {
    25:{5:125,10:100,15:100,20:100},
    30:{5:150,10:115,15:100,20:100,25:100},
    35:{5:185,10:125,15:115,20:100,25:100,30:100},
    40:{5:225,10:150,15:135,20:125,25:120,30:115,35:100,45:100},
    45:{5:280,10:200,15:185,20:175,25:160,30:150,35:125},
    50:{5:350,10:275,15:250,20:225,25:215,30:200,35:175,40:150,45:100},
    55:{5:425,10:350,15:335,20:325,25:300,30:275,35:240,40:200,45:175,50:150},
    60:{5:510,10:450,15:425,20:400,25:375,30:350,35:315,40:275,45:240,50:200,55:150},
    65:{5:585,10:525,15:515,20:500,25:475,30:450,35:415,40:375,45:315,50:275,55:215,60:150},
    70:{5:675,10:625,15:615,20:600,25:575,30:550,35:515,40:475,45:425,50:375,55:315,60:250,65:150},
    75:{5:745,10:710,15:705,20:695,25:685,30:675,35:640,40:600,45:550,50:500,55:425,60:350,65:275,70:200}
  };
  const MUTCD_MIN_FT = 100;

  function lookupAWdistanceFt(postedMPH, advisoryMPH){
    const ps = Number(postedMPH), as = Number(advisoryMPH);
    const row = AW_TABLE[ps] || {};
    return Number.isFinite(row[as]) ? row[as] : MUTCD_MIN_FT;
  }

  function getAadtCategoryMeta(key){
    return AADT_CATEGORY_META[key] || AADT_CATEGORY_META[DEFAULT_AADT_KEY];
  }

  function getSurfaceMeta(key){
    return SURFACE_META[key] || SURFACE_META.paved;
  }

  function lookupAlignmentNeedByRoadway(key, selectedRoadwayId){
    const matrix = ALIGNMENT_NEED_MATRIX[key] || ALIGNMENT_NEED_MATRIX[DEFAULT_AADT_KEY];
    const selectedId = selectedRoadwayId || DEFAULT_ROADWAY_TYPE;
    return ROADWAY_ROWS.map(row => {
      const status = matrix[row.id] || 'Optional';
      return {
        id: row.id,
        label: row.label,
        status,
        statusClass: status.toLowerCase(),
        selected: row.id === selectedId
      };
    });
  }

  function lookupDeviceGuidance(speedDifferential, surfaceType = 'paved'){
    const surf = getSurfaceMeta(surfaceType).key;
    if (!Number.isFinite(speedDifferential) || speedDifferential <= 0){
      return {
        summary: 'Speed differential below MUTCD threshold; confirm inputs.',
        category: 'below_threshold',
        tableRow: '<5 mph'
      };
    }
    if (speedDifferential >= 20){
      return {
        summary: 'Chevrons and advance horizontal alignment warning sign',
        category: 'chevron_aw',
        tableRow: '20 mph or more'
      };
    }
    if (speedDifferential >= 15){
      return {
        summary: 'Delineators plus advance horizontal alignment warning sign',
        category: 'delineator_aw',
        tableRow: '15 mph'
      };
    }
    if (speedDifferential >= 10){
      return {
        summary: 'Advance horizontal alignment warning sign',
        category: 'advance_aw',
        tableRow: '10 mph'
      };
    }
    if (speedDifferential >= 5){
      const pavedSummary = 'Pavement markings or advance horizontal alignment warning sign (paved roadway)';
      const gravelSummary = 'Advance horizontal alignment warning sign (unpaved roadway)';
      return {
        summary: surf === 'gravel' ? gravelSummary : pavedSummary,
        category: 'pavement_markings',
        tableRow: '5 mph'
      };
    }
    return {
      summary: 'Speed differential below 5 mph; use engineering judgment.',
      category: 'below_threshold',
      tableRow: '<5 mph'
    };
  }

  function lookupChevronSizes({ advisoryMPH, roadwayType } = {}){
    const advisory = Number(advisoryMPH);
    const speedBasis = Number.isFinite(advisory) ? advisory : NaN;
    const isFreeway = roadwayType === 'freeway_expressway';
    const rcoc = {
      agency: 'RCOC',
      sizeInches: 24,
      rationale: 'All locations'
    };

    let mdotSize = 24;
    let mdotNote = 'Ramp 10-40 mph or non-freeway';
    if (isFreeway){
      mdotSize = 36;
      mdotNote = 'Freeway or expressway';
    } else if (speedBasis >= MDOT_RAMP_FAST_MIN && speedBasis <= MDOT_RAMP_FAST_MAX){
      mdotSize = 36;
      mdotNote = 'Ramp 45-55 mph (based on advisory speed selection)';
    } else if (Number.isFinite(speedBasis) && speedBasis > MDOT_RAMP_SLOW_MAX){
      mdotNote = 'Non-freeway (assumed for this advisory speed); ramps 10-40 mph use 24"';
    }

    return { rcoc, mdot: { sizeInches: mdotSize, rationale: mdotNote }, basisMph: speedBasis };
  }

  function computePlacementProfile(length_m, targetSpacing_m, mode, opts = {}){
    const spacing = Math.max(targetSpacing_m, 1e-6);
    const minCount = Math.max(1, opts.minCount || 1);
    const minSnap = Math.max(opts.minCountSnap || 2, 2);
    const eps = 1e-9;
    let count, step, margin;

    if (mode === 'centered'){
      count = Math.max(minCount, Math.floor(length_m / spacing) + 1);
      step = spacing;
      margin = Math.max(0, (length_m - (count - 1) * step) / 2);
    } else if (mode === 'startAtA'){
      count = Math.max(minCount, Math.floor(length_m / spacing) + 1);
      step = spacing;
      margin = 0;
    } else { // snapEnds
      count = Math.max(minSnap, Math.ceil(length_m / spacing) + 1);
      if (length_m <= eps) count = Math.max(minSnap, 2);
      step = (count > 1) ? length_m / (count - 1) : 0;
      margin = 0;
    }

    const positions = [];
    for (let i = 0; i < count; i++){
      let pos = margin + i * step;
      if (mode === 'snapEnds' && i === count - 1){
        pos = length_m;
      }
      if (pos > length_m + eps){
        if (mode === 'snapEnds' && i === count - 1){
          positions.push(length_m);
        }
        break;
      }
      positions.push(Math.max(0, Math.min(pos, length_m)));
    }
    if (!positions.length){
      positions.push(0);
    }
    return {
      count: positions.length,
      step_m: step,
      margin_m: margin,
      positions_m: positions
    };
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
  function centralAngle(A,C,O){
    const uA = { x: A.x - O.x, y: A.y - O.y };
    const uC = { x: C.x - O.x, y: C.y - O.y };
    const dot = uA.x*uC.x + uA.y*uC.y;
    const den = Math.hypot(uA.x,uA.y) * Math.hypot(uC.x,uC.y);
    return Math.acos(Math.max(-1, Math.min(1, dot / den)));
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
    resultsEl.innerHTML = '';

    const postedMPH = Number(postedSel.value);
    const advisoryMPH = Number(advisorySel.value);
    const roadWidthFt = roadWidthInput ? parseFloat(roadWidthInput.value) : NaN;
    const roadHeightFt = roadHeightInput ? parseFloat(roadHeightInput.value) : NaN;
    const hasSuperelevationInputs = Number.isFinite(roadWidthFt) && roadWidthFt > 0 && Number.isFinite(roadHeightFt);
    const superelevationDecimal = hasSuperelevationInputs ? roadHeightFt / roadWidthFt : null;
    const superelevationPercent = Number.isFinite(superelevationDecimal) ? superelevationDecimal * 100 : null;
    const speedDifferential = Math.max(0, postedMPH - advisoryMPH);
    const aadtKey = aadtSel ? aadtSel.value : DEFAULT_AADT_KEY;
    const roadwayType = roadwayTypeSel ? roadwayTypeSel.value : DEFAULT_ROADWAY_TYPE;
    const surfaceType = surfaceSel ? surfaceSel.value : 'paved';
    const aadtMeta = getAadtCategoryMeta(aadtKey);
    const deviceNeedRowsAll = lookupAlignmentNeedByRoadway(aadtKey, roadwayType);
    const deviceNeedRows = deviceNeedRowsAll.filter(row => row.selected);
    const deviceRecommendation = lookupDeviceGuidance(speedDifferential, surfaceType);

    if (pts.length < 3){
      statusEl.textContent = `Pick ${3 - pts.length} more point${(3 - pts.length) === 1 ? '' : 's'}.`;
      lastCurveBounds = null;
      lastCalc = null;
      return;
    }

    const A_ll = pts[0].getLatLng();
    const B_ll = pts[1].getLatLng();
    const C_ll = pts[2].getLatLng();
    const ORG = originFrom(A_ll, B_ll, C_ll);
    const A = toXY_local(A_ll, ORG);
    const B = toXY_local(B_ll, ORG);
    const C = toXY_local(C_ll, ORG);

    const area = triArea(A,B,C);
    if (area < 1e-6){
      resultsEl.innerHTML = '<div class="warn">Points are nearly colinear — spread them out along the curve.</div>';
      lastCalc = null;
      return;
    }

    const O = circumcenter(A,B,C);
    if (!O){
      resultsEl.innerHTML = '<div class="warn">Couldn\'t find circle center.</div>';
      lastCalc = null;
      return;
    }

    const Rm = dist(O, A);
    const Rf = Rm * FT_PER_M;
    const O_ll = fromXY_local(O.x, O.y, ORG);

    const thA = angleAt(A,O);
    const thB = angleAt(B,O);
    const thC = angleAt(C,O);
    const dAC_ccw = angDiffCCW(thA, thC);
    const onMinorCCW = angDiffCCW(thA, thB) <= dAC_ccw;
    const arcPts = drawArcMinorLL(O, Rm, thA, onMinorCCW ? thC : thC - 2*Math.PI, 90, ORG);

    const gamma = centralAngle(A,C,O);
    const arcLen_m = Rm * gamma;
    const arcLen_f = arcLen_m * FT_PER_M;
    const centralDeg = gamma * 180 / Math.PI;
    const D_arc = 5729.57795 / Rf;

    let advisoryComputation = null;
    let advisoryComputedRaw = null;
    let advisoryComputedRounded = null;
    let advisoryComputedFriction = null;
    let advisoryComputationConverged = false;
    let advisoryDeltaFromSelected = null;
    if (hasSuperelevationInputs){
      advisoryComputation = solveAdvisorySpeedFromRadius(Rf, superelevationDecimal ?? 0, (Number.isFinite(advisoryMPH) && advisoryMPH > 0) ? advisoryMPH : postedMPH || 45);
      if (advisoryComputation){
        advisoryComputedRaw = advisoryComputation.speed;
        advisoryComputedFriction = advisoryComputation.friction;
        advisoryComputationConverged = Boolean(advisoryComputation.converged);
        if (Number.isFinite(advisoryComputedRaw)){
          advisoryComputedRounded = Math.max(0, 5 * Math.floor(advisoryComputedRaw / 5));
        }
        if (Number.isFinite(advisoryComputedRounded) && Number.isFinite(advisoryMPH)){
          advisoryDeltaFromSelected = advisoryComputedRounded - advisoryMPH;
        }
      }
    }

    const PLACEMENT_MODE = modeSel.value;
    let Sft = 6 * Math.sqrt(Math.max(Rf, 0) - 50);
    if (!isFinite(Sft) || Sft <= 0) Sft = 1;
    const Sm = Sft / FT_PER_M;
    const Lm = arcLen_m;
    const chevronPlacement = computePlacementProfile(Lm, Sm, PLACEMENT_MODE, { minCount: 1, minCountSnap: 2 });
    const Nchev = chevronPlacement.count;
    const step_m = chevronPlacement.step_m;
    const margin_m = chevronPlacement.margin_m;
    const chevronPositions = chevronPlacement.positions_m;
    const actualStepFt = (Nchev > 1 ? step_m : Sm) * FT_PER_M;
    const sepDivisor = (PLACEMENT_MODE === 'centered') ? Math.max(Nchev, 1) : Math.max(Nchev - 1, 1);
    const sepDeg = sepDivisor > 0 ? (centralDeg / sepDivisor) : centralDeg;

    centerMarker = L.circleMarker(O_ll, {
      radius: 5,
      weight: 2,
      opacity: 0.95,
      color: '#1f78b4',
      fillColor: '#1f78b4',
      fillOpacity: 1
    }).addTo(map).bindTooltip('Center');
    circle = L.circle(O_ll, { radius: Rm, weight: 1, color: '#1f78b4', opacity: 0.6, fillOpacity: 0 }).addTo(map);
    chord = L.polyline([A_ll, C_ll], { weight: 2, dashArray: '6,6', color: '#333' }).addTo(map);
    poly123 = L.polyline([A_ll, B_ll, C_ll], { weight: 2, color: '#666' }).addTo(map);
    arcSeg = L.polyline(arcPts, { weight: 3, opacity: 0.85, color: '#1f78b4' }).addTo(map);

    // Tangents and PI
    const rA = { x: A.x - O.x, y: A.y - O.y };
    const rC = { x: C.x - O.x, y: C.y - O.y };
    const tdirA = perpCCW(rA);
    const tdirC = perpCCW(rC);
    let PI = null;
    let AP_m = null;
    let CP_m = null;
    let PI_ll = null;
    let PIangle_deg = null;
    const denom = cross(tdirA, tdirC);
    if (Math.abs(denom) > 1e-9) {
      const s = cross({ x: C.x - A.x, y: C.y - A.y }, tdirC) / denom;
      PI = add(A, s, tdirA);
      PI_ll = fromXY_local(PI.x, PI.y, ORG);
      tan1 = L.polyline([A_ll, PI_ll], { weight: 2.5, color: '#111' }).addTo(map);
      tan3 = L.polyline([C_ll, PI_ll], { weight: 2.5, color: '#111' }).addTo(map);
      piMarker = L.circleMarker(PI_ll, { radius: 4.5, weight: 2, color: '#111', fillColor: '#fff', fillOpacity: 1 }).addTo(map);

      AP_m = dist(A, PI);
      CP_m = dist(C, PI);
      const v1 = { x: A.x - PI.x, y: A.y - PI.y };
      const v2 = { x: C.x - PI.x, y: C.y - PI.y };
      const dot = v1.x*v2.x + v1.y*v2.y;
      PIangle_deg = Math.acos(Math.max(-1, Math.min(1, dot/(Math.hypot(v1.x,v1.y)*Math.hypot(v2.x,v2.y))))) * 180 / Math.PI;

      const EXT_M = EXT_FT / FT_PER_M;
      const uA = unit(tdirA);
      const uC = unit(tdirC);
      const signA = (uA.x*(PI.x - A.x) + uA.y*(PI.y - A.y)) >= 0 ? -1 : 1;
      const signC = (uC.x*(PI.x - C.x) + uC.y*(PI.y - C.y)) >= 0 ? -1 : 1;
      const A_ext = add(A, signA * EXT_M, uA);
      const C_ext = add(C, signC * EXT_M, uC);
      const A_ext_ll = fromXY_local(A_ext.x, A_ext.y, ORG);
      const C_ext_ll = fromXY_local(C_ext.x, C_ext.y, ORG);
      ext1 = L.polyline([A_ll, A_ext_ll], { weight: 5, color: '#e53935', opacity: 0.95, lineCap: 'round' }).addTo(map);
      ext3 = L.polyline([C_ll, C_ext_ll], { weight: 5, color: '#e53935', opacity: 0.95, lineCap: 'round' }).addTo(map);

      lastCurveBounds = L.latLngBounds([A_ll, B_ll, C_ll, O_ll, PI_ll, A_ext_ll, C_ext_ll]).extend(circle.getBounds());

      // Advance warning ticks
      const aw_ft = lookupAWdistanceFt(postedMPH, advisoryMPH);
      const aw_m  = aw_ft / FT_PER_M;

      if (awTicksLayer) { awTicksLayer.clearLayers(); map.removeLayer(awTicksLayer); }
      awTicksLayer = L.layerGroup([], { pane: 'advance' }).addTo(map);

      const uAt = unit(tdirA);
      const uCt = unit(tdirC);
      const projectFootOnLine = (P, U, X) => {
        const t = ((X.x - P.x)*U.x + (X.y - P.y)*U.y);
        return { x: P.x + t*U.x, y: P.y + t*U.y };
      };
      const addGuide = (P0, P1) => {
        const a = fromXY_local(P0.x, P0.y, ORG);
        const b = fromXY_local(P1.x, P1.y, ORG);
        L.polyline([a,b], {
          pane: 'advance', color: '#7b1fa2', weight: AW_GUIDE_WEIGHT,
          opacity: 0.85, dashArray: AW_GUIDE_STYLE
        }).addTo(awTicksLayer);
      };
      const addTickAtPoint = (px, py, U, label) => {
        const N = unit(perpCCW(U));
        const half = (AW_TICK_FT / FT_PER_M) / 2;
        const p1 = fromXY_local(px + N.x*half, py + N.y*half, ORG);
        const p2 = fromXY_local(px - N.x*half, py - N.y*half, ORG);
        L.polyline([p1,p2], {
          pane: 'advance', color: '#7b1fa2', weight: TICK_WEIGHT, opacity: 0.95, lineCap: 'round'
        }).addTo(awTicksLayer).bindTooltip(label, { direction: 'top', offset: [0, -8] });
      };

      const PC = projectFootOnLine(PI, uAt, O);
      const PT = projectFootOnLine(PI, uCt, O);
      const signAwayPC = (uAt.x*(PI.x - PC.x) + uAt.y*(PI.y - PC.y)) > 0 ? -1 : 1;
      const signAwayPT = (uCt.x*(PI.x - PT.x) + uCt.y*(PI.y - PT.y)) > 0 ? -1 : 1;
      const PC_aw = { x: PC.x + signAwayPC * aw_m * uAt.x, y: PC.y + signAwayPC * aw_m * uAt.y };
      const PT_aw = { x: PT.x + signAwayPT * aw_m * uCt.x, y: PT.y + signAwayPT * aw_m * uCt.y };

      addGuide(PC, PC_aw);
      addGuide(PT, PT_aw);
      addTickAtPoint(PC_aw.x, PC_aw.y, uAt, `AW ${aw_ft} ft`);
      addTickAtPoint(PT_aw.x, PT_aw.y, uCt, `AW ${aw_ft} ft`);

    } else {
      resultsEl.innerHTML = '<div class="warn">Tangents are parallel — adjust points 1 and 3.</div>';
      lastCurveBounds = L.latLngBounds([A_ll, B_ll, C_ll, O_ll]).extend(circle.getBounds());
    }

    // Spacing diagnostics
    const sepAB = minorSepDeg(thA, thB);
    const sepBC = minorSepDeg(thB, thC);
    const inRange = d => d >= 30 && d <= 120;
    const arcAB = drawArcMinorLL(O, Rm, thA, thB, 45, ORG);
    const arcBC = drawArcMinorLL(O, Rm, thB, thC, 45, ORG);
    spacingArcs.push(L.polyline(arcAB, { weight: 6, opacity: 0.35, color: inRange(sepAB) ? '#2e7d32' : '#c62828' }).addTo(map));
    spacingArcs.push(L.polyline(arcBC, { weight: 6, opacity: 0.35, color: inRange(sepBC) ? '#2e7d32' : '#c62828' }).addTo(map));

    spacingEl.innerHTML = `
      <div class="stat"><strong>Sample Point Spacing diagnostics</strong></div>
      <div class="stat">1(A):2(B) separation: ${sepAB.toFixed(1)}&deg; ${inRange(sepAB) ? '' : '<span class="warn">(outside 30–120&deg;)</span>'}</div>
      <div class="stat">2(B):3(C) separation: ${sepBC.toFixed(1)}&deg; ${inRange(sepBC) ? '' : '<span class="warn">(outside 30–120&deg;)</span>'}</div>
    `;

    // Chevron ticks
    if (chevTicksLayer) { chevTicksLayer.clearLayers(); map.removeLayer(chevTicksLayer); }
    chevTicksLayer = L.layerGroup([], { pane: 'chevrons' }).addTo(map);
    const ccw = angDiffCCW(thA, thC);
    const signDir = (ccw <= Math.PI) ? 1 : -1;
    chevronPositions.forEach(s_m => {
      const theta = thA + signDir * (s_m / Rm);
      const Px = O.x + Rm * Math.cos(theta);
      const Py = O.y + Rm * Math.sin(theta);
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const p1 = fromXY_local(Px, Py, ORG);
      const p2 = fromXY_local(Px + nx * (TICK_FT / FT_PER_M), Py + ny * (TICK_FT / FT_PER_M), ORG);
      L.polyline([p1, p2], { pane: 'chevrons', color: '#ff9800', weight: TICK_WEIGHT, opacity: 0.95, lineCap: 'round' }).addTo(chevTicksLayer);
    });

    let delineatorTargetSpacingFt = 3 * Math.sqrt(Math.max(Rf - 50, 0));
    if (!Number.isFinite(delineatorTargetSpacingFt) || delineatorTargetSpacingFt <= 0) delineatorTargetSpacingFt = DELINEATOR_MIN_SPACING_FT;
    delineatorTargetSpacingFt = Math.min(DELINEATOR_MAX_SPACING_FT, Math.max(DELINEATOR_MIN_SPACING_FT, delineatorTargetSpacingFt));
    const delineatorSm = delineatorTargetSpacingFt / FT_PER_M;
    const delineatorPlacement = computePlacementProfile(Lm, delineatorSm, PLACEMENT_MODE, { minCount: 1, minCountSnap: 2 });
    const delineatorPositions = delineatorPlacement.positions_m;
    const delineatorActualSpacingFt = (delineatorPlacement.count > 1 ? delineatorPlacement.step_m : delineatorSm) * FT_PER_M;
    const delineatorOffset_m = DELINEATOR_OFFSET_FT / FT_PER_M;
    if (delineatorLayer) {
      delineatorLayer.clearLayers();
      map.removeLayer(delineatorLayer);
    }
    delineatorLayer = L.layerGroup([], { pane: 'delineators' }).addTo(map);
    const innerPossible = Rm > delineatorOffset_m + 0.05;
    const delineatorDotOptions = {
      pane: 'delineators',
      radius: 3.4,
      color: '#90a4ae',
      weight: 1.2,
      opacity: 0.95,
      fillColor: '#ffffff',
      fillOpacity: 1,
      className: 'delineator-dot'
    };
    delineatorPositions.forEach(s => {
      const theta = thA + signDir * (s / Rm);
      const Px = O.x + Rm * Math.cos(theta);
      const Py = O.y + Rm * Math.sin(theta);
      const radial = unit({ x: Px - O.x, y: Py - O.y });
      const outerLL = fromXY_local(Px + radial.x * delineatorOffset_m, Py + radial.y * delineatorOffset_m, ORG);
      L.circleMarker(outerLL, delineatorDotOptions).addTo(delineatorLayer);
      if (innerPossible) {
        const innerLL = fromXY_local(Px - radial.x * delineatorOffset_m, Py - radial.y * delineatorOffset_m, ORG);
        L.circleMarker(innerLL, delineatorDotOptions).addTo(delineatorLayer);
      }
    });
    const delineatorCountPerSide = delineatorPositions.length;
    const delineatorTotal = innerPossible ? delineatorCountPerSide * 2 : delineatorCountPerSide;

    const superelevationDisplay = Number.isFinite(superelevationPercent) && Number.isFinite(superelevationDecimal)
      ? `${superelevationPercent.toFixed(2)}% <span class="muted">(${superelevationDecimal.toFixed(4)})</span>`
      : '&mdash;';
    let advisoryComputedDisplay = '&mdash;';
    if (Number.isFinite(advisoryComputedRaw)){
      const summaryParts = [`raw ${advisoryComputedRaw.toFixed(1)} mph`];
      if (Number.isFinite(advisoryComputedFriction)) summaryParts.push(`f ~ ${advisoryComputedFriction.toFixed(2)}`);
      if (Number.isFinite(advisoryDeltaFromSelected)) summaryParts.push(`delta vs selected ${advisoryDeltaFromSelected >= 0 ? '+' : ''}${advisoryDeltaFromSelected.toFixed(0)} mph`);
      if (!advisoryComputationConverged) summaryParts.push('did not fully converge');
      const roundedLabel = Number.isFinite(advisoryComputedRounded) ? `${advisoryComputedRounded} mph` : `${advisoryComputedRaw.toFixed(1)} mph`;
      advisoryComputedDisplay = `${roundedLabel}<span class="muted"> (${summaryParts.join('; ')})</span>`;
    }

    const modeLabel = (PLACEMENT_MODE === 'snapEnds') ? 'Snap to ends'
                      : (PLACEMENT_MODE === 'startAtA') ? 'Start at A'
                      : 'Centered';
    const calloutAW = lookupAWdistanceFt(postedMPH, advisoryMPH);
    const chevronSizes = lookupChevronSizes({ advisoryMPH, roadwayType });
    const rcocChevronSize = chevronSizes.rcoc.sizeInches;
    const mdotChevronSize = chevronSizes.mdot.sizeInches;
    const mdotChevronNote = chevronSizes.mdot.rationale;
    const needRowsHtml = deviceNeedRows.length ? deviceNeedRows.map(row => {
      const selectedSuffix = row.selected ? ' (selected)' : '';
      const selectedClass = row.selected ? ' selected' : '';
      return `<div class="need-item${selectedClass}"><span class="need-road">${row.label}${selectedSuffix}</span>: ` +
        `<span class="need-status need-${row.statusClass}">${row.status}</span></div>`;
    }).join('') : '<div class="need-item muted">No guidance available for these inputs.</div>';

    resultsEl.innerHTML = `
      <div class="callout">
        <h1>Outputs</h1>
        <h2>Need for Devices for Changes in Horizontal Alignment</h2>
        <div class="small-note muted">Per 11th Ed MUTCD</div>
        <div class="stat">
          <strong>Table 2C-4A device guidance</strong>
          <span class="muted">(AADT ${aadtMeta.description})</span>
          <div class="need-list">${needRowsHtml}</div>
        </div>
        <div class="stat">
          <strong>Table 2C-4B device guidance</strong>
          <span class="muted">(delta V = ${speedDifferential.toFixed(0)} mph)</span>
          <div>${deviceRecommendation.summary}</div>
        </div>

        <hr class="results-sep" />

        <h2>Computed Advisory Speed</h2>
        <div class="small-note muted">Per MDOT Guide</div>
        <div class="stat"><strong>Superelevation (e)</strong>: ${superelevationDisplay}</div>
        <div class="stat"><strong>Computed advisory speed</strong>: ${advisoryComputedDisplay}</div>

        <hr class="results-sep" />

        <h2>Warning Signs:</h2>
        <div class="small-note muted">Per MDOT Guide</div>
        <div class="stat"><strong>Chevron size (W1-8) - RCOC</strong>: ${rcocChevronSize}&Prime; <span class="muted">(${chevronSizes.rcoc.rationale})</span></div>
        <div class="stat"><strong>Chevron size (W1-8) - MDOT</strong>: ${mdotChevronSize}&Prime; <span class="muted">${mdotChevronNote}${Number.isFinite(chevronSizes.basisMph) ? ` • based on advisory ${chevronSizes.basisMph} mph` : ''}</span></div>
        <div class="stat"><strong>Target Chevron Spacing (S):</strong> ${Sft.toFixed(1)} ft
          <span class="muted"> &bull; ${modeLabel}</span>
        </div>
        <div class="stat"><strong>Actual chevron spacing (S)</strong>: ${actualStepFt.toFixed(1)} ft
          <span class="muted">${PLACEMENT_MODE==='snapEnds' ? '(~ S to hit both ends)' : '(= S)'}</span>
        </div>

        <div class="stat"><strong>Count</strong>: ~${Nchev} chevrons
          <span class="muted">(~${sepDeg.toFixed(1)}&deg; apart)</span>
        </div>

        <div class="stat"><strong>Advance Warning distance</strong>: ${calloutAW} ft from PC/PT (purple dashed).</div>
        
        <hr class="results-sep" />

        <h2>Delineators:</h2>
        <div class="small-note muted">Per MDOT Guide</div>
        <div class="stat"><strong>Delineator spacing</strong>: ${delineatorActualSpacingFt.toFixed(1)} ft <span class="muted">(target 3*sqrt(R - 50) = ${delineatorTargetSpacingFt.toFixed(1)} ft)</span></div>
        <div class="stat"><strong>Delineators placed</strong>: ${delineatorCountPerSide} per side (${delineatorTotal} total from PC to PT)</div>

        <hr class="results-sep" />

        <h2>Curve Details:</h2>
        <div class="small-note muted">For Info Only</div>
        <div class="stat"><strong>Radius</strong>: ${formatFeet(Rf)}</div>
        <div class="stat"><strong>Central angle (minor 1&ndash;3)</strong>: ${centralDeg.toFixed(4)}&deg;</div>
        <div class="stat"><strong>Arc length (minor 1&ndash;3)</strong>: ${formatFeet(arcLen_f)}</div>
        <div class="stat"><strong>Degree of curve (100-ft arc)</strong>: ${D_arc.toFixed(4)}&deg;</div>
        <div class="stat"><strong>Center (lat, lon)</strong>: ${O_ll.lat.toFixed(6)}, ${O_ll.lng.toFixed(6)}</div>
      </div>
    `;

    lastCalc = {
      ORG, A, B, C, O, Rm, Rf, thA, thB, thC, gamma,
      arcLen_m, arcLen_f, D_arc,
      O_ll, A_ll, B_ll, C_ll,
      PI, PI_ll, AP_m, CP_m, PIangle_deg,
      EXT_FT, Sft, Nchev, sepDeg, PLACEMENT_MODE, actualStepFt,
      calloutAW,
      chevronSizes,
      postedMPH,
      advisoryMPH,
      speedDifferential,
      aadtKey,
      aadtDescription: aadtMeta.description,
      roadwayType,
      surfaceType,
      deviceRecommendation,
      deviceNeedRows,
      delineatorTargetSpacingFt,
      delineatorActualSpacingFt,
      delineatorCountPerSide,
      delineatorTotal,
      roadWidthFt,
      roadHeightFt,
      superelevationDecimal,
      superelevationPercent,
      advisoryComputedRaw,
      advisoryComputedRounded,
      advisoryComputedFriction,
      advisoryComputationConverged,
      advisoryDeltaFromSelected
    };

    statusEl.textContent = STATUS_READY;
  }

  statusEl.textContent = STATUS_DEFAULT;
})();



