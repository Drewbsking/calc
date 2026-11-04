(function(root){
  'use strict';
  const sources = {
    mmutcd: {
      label: 'MMUTCD (2025)',
      need: ['Tables 2C-4 / 2C-6; §§2C.06, 2C.59', 'references/mmutcd-curve-reference.pdf#page=4'],
      plaque: ['Table 2C-6; §2C.59', 'references/mmutcd-curve-reference.pdf#page=8'],
      spacing: ['Table 2C-5; §2C.08', 'references/mmutcd-curve-reference.pdf#page=6'],
      advance: ['Table 2C-3; §2C.04', 'references/mmutcd-curve-reference.pdf#page=3'],
      size: ['Table 2C-1; §2C.03', 'references/mmutcd-curve-reference.pdf#page=1']
    },
    mdot: {
      label: 'MDOT signing guide (2023)',
      need: ['Table 5, p. 25', 'references/mdot-curve-reference.pdf#page=4'],
      plaque: ['Table 5, pp. 24–25', 'references/mdot-curve-reference.pdf#page=3'],
      spacing: ['Appendix B-9', 'references/mdot-curve-reference.pdf#page=6'],
      advance: ['Table 3, p. 21', 'references/mdot-curve-reference.pdf#page=2'],
      size: ['Table 2 / Appendix B-9', 'references/mdot-curve-reference.pdf#page=1']
    },
    delineators: ['MMUTCD §3G.04 / Table 3G-1', 'references/mmutcd-curve-reference.pdf#page=10'],
    advisory: ['MDOT Appendices B-11 / B-12', 'references/mdot-curve-reference.pdf#page=7']
  };
  // Rows are freeway/expressway, arterial without markings, arterial with markings, other.
  const needs = {
    lt1000: ['Required', 'Optional', 'Optional', 'Optional'],
    '1000_2999': ['Required', 'Recommended', 'Recommended', 'Optional'],
    '3000_3999': ['Required', 'Required', 'Recommended', 'Optional'],
    '4000_plus': ['Required', 'Required', 'Required', 'Optional']
  };
  const classes = ['freeway_expressway', 'arterial_no_markings', 'arterial_with_markings', 'all_other'];
  const active = (status, optional) => status === 'Required' || status === 'Recommended' || (status === 'Optional' && optional);

  function deviceGuidance({ method, approachMPH, advisoryMPH, roadwayType, aadtKey, surfaceType,
    includeOptional = false, pavedTreatment = 'markings', omitEligible = false, urbanLowVolume = false,
    speedBasis = 'posted', roadType } = {}) {
    const delta = approachMPH - advisoryMPH;
    const r = { delta, need: 'Not tabulated', warning: 'Not tabulated', plaque: 'Not tabulated',
      alignment: 'Not tabulated', treatment: 'none', showWarning: false, showChevrons: false,
      showDelineators: false, note: '', omitEligible: false };
    if (!sources[method] || !Number.isFinite(delta) || approachMPH <= 0 || advisoryMPH <= 0) {
      r.note = 'Enter valid approach and study advisory speeds.'; return r;
    }
    if (delta < 0) { r.note = 'Advisory speed exceeds the approach speed. Confirm the study inputs.'; return r; }
    if (method === 'mdot' && speedBasis === '85th') {
      r.note = 'MDOT Table 5 uses the speed limit. Select posted or statutory speed for this method.'; return r;
    }
    if (method === 'mmutcd') {
      r.need = needs[aadtKey]?.[classes.indexOf(roadwayType)] || 'Not tabulated';
      r.omitEligible = (speedBasis !== '85th' && approachMPH <= 20)
        || (urbanLowVolume && roadwayType !== 'freeway_expressway' && ['lt1000','1000_2999'].includes(aadtKey));
      if (omitEligible && r.omitEligible) {
        return { ...r, need: 'Omitted by selection', warning: 'Omitted', plaque: 'Omitted', alignment: 'Omitted',
          note: 'MMUTCD §2C.06 paragraphs 5–6: selected low-speed / urban low-volume exception.' };
      }
      if (delta < 5) { r.note = 'Below the tabulated 5-mph differential; determine treatment by engineering judgment.'; return r; }
      r.plaque = delta >= 15 ? 'Required' : delta >= 10 ? 'Recommended' : 'Optional';
      r.warning = r.need;
      r.alignment = delta >= 15 ? r.need : 'Not indicated';
      r.treatment = delta >= 20 ? 'chevrons' : delta >= 15 ? 'delineators' : 'warning';
      if (delta < 10 && surfaceType === 'paved' && pavedTreatment === 'markings') {
        r.treatment = 'markings'; r.warning = 'Alternative to pavement markings';
        r.note = '5-mph row: pavement markings selected in place of the advance warning sign.';
      }
      const useDevices = active(r.need, includeOptional);
      r.showWarning = useDevices && r.treatment !== 'markings';
      r.showChevrons = useDevices && r.treatment === 'chevrons';
      r.showDelineators = useDevices && r.treatment === 'delineators';
      if (r.need === 'Optional' && !includeOptional) r.note = 'Optional advance-warning placement is hidden. Enable it in layout options to show it.';
    } else {
      if (delta < 5) { r.note = 'Below the tabulated 5-mph differential; determine treatment by engineering judgment.'; return r; }
      r.need = r.warning = r.plaque = delta >= 10 ? 'Required' : 'Recommended';
      r.alignment = delta >= 15 ? 'Required' : delta >= 10 ? 'Recommended' : 'Optional';
      r.showWarning = true;
      r.showChevrons = active(r.alignment, includeOptional);
      r.treatment = r.showChevrons ? 'chevrons' : 'warning';
      r.note = 'Table 5: chevrons and/or a directional large arrow. Layout uses chevrons.';
      if (roadType === 'freeway_ramp') r.rampSign = delta >= 20 ? 'Required' : delta >= 15 ? 'Recommended' : 'Optional';
    }
    return r;
  }

  function chevronSpacing(method, radius, advisory) {
    if (!(radius > 0) || !(advisory > 0)) return { feet: null, note: 'Enter a valid radius and advisory speed.' };
    if (method === 'mdot') return radius > 50
      ? { feet: 6 * Math.sqrt(radius - 50), note: 'S = 6√(R − 50), R in feet.' }
      : { feet: null, note: 'MDOT B-9 formula is undefined at R ≤ 50 ft; choose spacing by engineering judgment.' };
    const bySpeed = advisory <= 15 ? 0 : advisory <= 30 ? 1 : advisory <= 45 ? 2 : advisory <= 60 ? 3 : 4;
    const byRadius = radius < 200 ? 0 : radius <= 400 ? 1 : radius <= 700 ? 2 : radius <= 1250 ? 3 : 4;
    const values = [40, 80, 120, 160, 200];
    return { feet: values[bySpeed], radiusFeet: values[byRadius], mismatch: bySpeed !== byRadius,
      note: bySpeed !== byRadius
        ? `Advisory-speed row: ${values[bySpeed]} ft; radius row: ${values[byRadius]} ft. Rows differ; confirm spacing. The table does not determine advisory speed.`
        : 'Table 2C-5 advisory-speed and radius rows agree.' };
  }

  // MDOT Table 3, Condition B, positive advisory speeds only. Blank cells stay blank.
  const mdotAdvance = {
    25:{5:125,10:100,15:100}, 30:{5:150,10:115,15:100,20:100,25:100},
    35:{5:185,10:125,15:115,20:100,25:100,30:100},
    40:{5:225,10:150,15:135,20:125,25:120,30:115,35:100},
    45:{5:280,10:200,15:185,20:175,25:160,30:150,35:125,40:100},
    50:{5:350,10:275,15:250,20:225,25:215,30:200,35:175,40:150,45:100},
    55:{5:425,10:350,15:335,20:325,25:300,30:275,35:240,40:200,45:175,50:150},
    60:{5:510,10:450,15:425,20:400,25:375,30:350,35:315,40:275,45:240,50:200,55:150},
    65:{5:585,10:525,15:515,20:500,25:475,30:450,35:415,40:375,45:315,50:275,55:215,60:150},
    70:{5:675,10:625,15:615,20:600,25:575,30:550,35:515,40:475,45:425,50:375,55:315,60:250,65:150},
    75:{5:745,10:710,15:705,20:695,25:685,30:675,35:640,40:600,45:550,50:500,55:425,60:350,65:275,70:200}
  };
  // MMUTCD Table 2C-3, columns 10,20,...,80 mph; null = Note 5, absent = dash.
  const mmutcdAdvance = {
    20:[null],25:[null,null],30:[null,null],35:[null,null,null],
    40:[100,100,null],45:[125,100,100,null],50:[200,175,125,100],
    55:[275,225,200,125,null],60:[350,325,275,200,100],
    65:[450,400,350,275,200,100],70:[525,500,450,375,275,150],
    75:[625,600,550,475,375,250,100],80:[725,700,625,550,450,350,200],
    85:[825,800,750,675,575,450,300,150]
  };
  function advanceDistance(method, approach, advisory, override) {
    let feet = null, note = '', lookupSpeed = advisory;
    if (method === 'mdot') {
      feet = mdotAdvance[approach]?.[advisory] ?? null;
      if (feet === null) note = 'No distance tabulated for this speed pair; enter a site placement distance.';
    } else {
      lookupSpeed = Math.floor(advisory / 10) * 10;
      const value = mmutcdAdvance[approach]?.[lookupSpeed / 10 - 1];
      feet = Number.isFinite(value) ? value : null;
      if (value === null) note = 'Table 2C-3 Note 5: site-specific placement up to 100 ft ahead of the curve, with at least 100 ft from other signs.';
      else if (value === undefined) note = 'No curve-warning distance tabulated for this speed pair; enter a site placement distance.';
      if (lookupSpeed !== advisory && lookupSpeed >= 10) note = `Uses the lower tabulated advisory speed (${lookupSpeed} mph). ${note}`.trim();
    }
    const custom = override !== '' && override != null ? Number(override) : NaN;
    return { feet: Number.isFinite(custom) && custom > 0 ? custom : feet, tableFeet: feet,
      custom: Number.isFinite(custom) && custom > 0, lookupSpeed, note };
  }

  function placement(length, target, mode = 'snapEnds', minimum = 0) {
    if (!(length > 0) || !(target > 0)) return { positions: [], step: null, note: '' };
    let count, step, margin = 0, note = '';
    if (mode === 'snapEnds') {
      count = Math.max(2, Math.ceil(length / target) + 1);
      if (minimum && length < minimum) return { positions: [length / 2], step: null,
        note: 'Curve shorter than 20 ft: one delineator; endpoints cannot both be occupied at the minimum spacing.' };
      if (minimum) count = Math.min(count, Math.floor((length + 1e-8) / minimum) + 1);
      step = length / (count - 1);
      if (step > target + 1e-8) note = 'Spacing adjusted above the target to preserve the 20-ft minimum.';
    } else {
      step = Math.max(target, minimum);
      count = Math.floor(length / step) + 1;
      if (mode === 'centered') margin = (length - (count - 1) * step) / 2;
    }
    return { positions: Array.from({length: count}, (_, i) => margin + i * step), step: count > 1 ? step : null, note };
  }
  function delineatorLayout(length, radius, mode) {
    const target = Math.max(20, Math.min(300, 3 * Math.sqrt(Math.max(0, radius - 50))));
    const curve = placement(length, target, mode, 20);
    // Note 4 intervals proceed outward from the end of the curve, cumulatively.
    const intervals = [2,3,6].map(factor => Math.min(300, factor * target));
    const first = curve.positions[0] || 0;
    const last = curve.positions.at(-1) ?? length;
    const approachIntervals = [Math.min(intervals[0],300-first), ...intervals.slice(1)];
    const departureIntervals = [Math.min(intervals[0],300-(length-last)), ...intervals.slice(1)];
    const cumulative = gaps => { let sum=0; return gaps.map(gap => sum+=gap); };
    const shortened = approachIntervals[0] < intervals[0] || departureIntervals[0] < intervals[0];
    return { ...curve, target, intervals, approachIntervals, departureIntervals,
      note: [curve.note, shortened ? 'First tangent interval shortened to keep the gap from the outermost curve delineator at or below 300 ft.' : ''].filter(Boolean).join(' '),
      approaches: cumulative(approachIntervals).map(x => -x), departures: cumulative(departureIntervals).map(x => length + x) };
  }

  // Exact friction values printed on MDOT B-12, interpolated only within 15–60 mph.
  const friction = [[15,.32],[20,.27],[25,.23],[30,.20],[35,.18],[40,.16],[45,.15],[50,.14],[55,.13],[60,.12]];
  function sideFrictionAt(speed) {
    if (!Number.isFinite(speed) || speed < 15 || speed > 60) return null;
    for (let i = 1; i < friction.length; i++) if (speed <= friction[i][0]) {
      const [s0,f0] = friction[i-1], [s1,f1] = friction[i];
      return f0 + (speed-s0)/(s1-s0)*(f1-f0);
    }
  }
  function advisoryEstimate(radius, e) {
    if (!(radius > 0) || !Number.isFinite(e)) return { speed: null, note: 'Enter measured width and height for full superelevation.' };
    const equation = v => v*v/(15*radius) - e - sideFrictionAt(v);
    if (equation(15) > 0 || equation(60) < 0) return { speed: null,
      note: 'Estimate is outside the 15–60 mph friction table in MDOT B-12; no extrapolation is used.' };
    let low = 15, high = 60;
    for (let i = 0; i < 60; i++) { const mid=(low+high)/2; if (equation(mid)>0) high=mid; else low=mid; }
    const speed = (low+high)/2;
    return { speed, friction: sideFrictionAt(speed), note: 'Design-equation estimate using measured full superelevation. Device selection uses the entered study advisory speed.' };
  }
  const api = { sources, deviceGuidance, chevronSpacing, advanceDistance, placement, delineatorLayout, sideFrictionAt, advisoryEstimate };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CurveGuidance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
