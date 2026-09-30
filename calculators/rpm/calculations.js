const RPMCalculator = (() => {
  const SOURCE = 'https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/mutcd11theditionr1hl.pdf';
  const RCOC_SPEED_DIFFERENCES = Object.freeze([0, 5, 10, 15, 20, 25, 30]);
  const CYCLE = Object.freeze({ dash: 12.5, gap: 37.5, n: 50 });
  // Current 11th Edition with Revision 1, December 2025. See docs/rpm-reference.md.
  const PROFILES = {
    'guide-curve': { name: 'Guide on sharp curves / transitions', section: '3B.15 ¶03', level: 'Option', factor: 1, rule: 'N or less', pair: 1, color: 'yellow', paint: 'double', family: 'guide', note: 'Emphasize a change in travel path. A single row may run between a double line; it does not communicate passing restrictions.' },
    'guide-general': { name: 'Guide on a general roadway', section: '3B.15 ¶01–02', level: 'Guidance', factor: 2, rule: '2N', pair: 1, color: 'yellow', paint: 'double', family: 'guide', note: 'General positioning-guide spacing. Markers may be in line with, beside, or between the painted lines.' },
    'guide-freeway': { name: 'Guide on straight, level freeway / expressway', section: '3B.15 ¶04', level: 'Option', factor: 3, rule: '3N', pair: 1, color: 'white', paint: 'broken', family: 'guide', review: true, note: 'Limited to relatively straight, level freeway or expressway segments where engineering judgment supports adequate wet-night delineation.' },
    'supp-double': { name: 'Double solid centerlines', section: '3B.16 ¶01 A.1, B.1', level: 'Guidance', factor: 1, rule: 'No greater than N', pair: 2, color: 'yellow', paint: 'double', family: 'supplement', approach: true, note: 'Use a lateral pair in line with or immediately outside the two stripes. Each station has two physical markers.' },
    'supp-solid': { name: 'Normal solid lane line', section: '3B.16 ¶01 B.1', level: 'Guidance', factor: 1, rule: 'No greater than N', pair: 1, color: 'white', paint: 'solid', family: 'supplement', note: 'For a normal-width solid lane line. Edge lines and channelizing lines have separate, closer spacing provisions.' },
    'supp-wide': { name: 'Wide solid lane line', section: '3B.16 ¶01 A.2, B.1', level: 'Guidance', factor: 1, rule: 'No greater than N', pair: 2, color: 'white', paint: 'wide', family: 'supplement', note: 'Use two markers laterally adjacent to one another. Select the channelizing-line application for channelizing lines.' },
    'supp-broken': { name: 'Normal broken line', section: '3B.16 ¶01 B.2', level: 'Guidance', factor: 3, rule: 'No greater than 3N', pair: 1, color: 'white', paint: 'broken', family: 'supplement', colorChoice: true, approach: true, note: 'White for a lane line or yellow for a centerline. Reversible lanes use the separate N-spacing application.' },
    'supp-reversible': { name: 'Double broken reversible-lane lines', section: '3B.16 ¶01 A.1, B.2', level: 'Guidance', factor: 1, rule: 'No greater than N', pair: 2, color: 'yellow', paint: 'double-broken', family: 'supplement', note: 'Reversible-lane markings use the closer N limit. Lateral pairs represent the double line.' },
    'supp-left-edge': { name: 'Normal left edge line', section: '3B.16 ¶01 B.1', level: 'Guidance', factor: 0.5, rule: 'No greater than N/2', pair: 1, color: 'yellow', paint: 'solid', family: 'supplement', note: 'Shown for the yellow left edge of a one-way or divided roadway. The illustration shows one edge line.' },
    'supp-right-edge': { name: 'Normal right edge line', section: '3B.16 ¶01 B.1, ¶02', level: 'Guidance', factor: 0.5, rule: 'No greater than N/2', pair: 1, color: 'white', paint: 'solid', family: 'supplement', review: true, note: 'Engineering study or judgment should weigh delineation benefits against shoulder bicyclist impacts. The wet-night pattern should not resemble a broken line. Spacing alone does not resolve this review.' },
    'supp-channel': { name: 'Channelizing line', section: '3B.16 ¶01 A.2, B.1', level: 'Guidance', factor: 0.5, rule: 'No greater than N/2', pair: 2, color: 'white', paint: 'wide', family: 'supplement', note: 'Channelizing lines are wide: use lateral pairs and the closer N/2 spacing guidance.' },
    'supp-dotted': { name: 'Dotted lane line', section: '3B.16 ¶01 B.3', level: 'Guidance', rule: 'Application-specific spacing', pair: 1, color: 'white', paint: 'dotted', family: 'supplement', custom: true, note: 'The MUTCD gives no numerical spacing for this application. Spacing depends on the application and its engineering basis.' },
    'supp-intersection': { name: 'Line extensions through an intersection', section: '3B.16 ¶01 B.4', level: 'Guidance', rule: 'One marker per short line', pair: 1, color: 'white', paint: 'dotted', family: 'supplement', pattern: 'intersection', note: 'The provision places one marker per short painted line. Footage alone does not determine the exact number of short line segments.' },
    'supp-interchange': { name: 'Line extensions through a freeway interchange', section: '3B.16 ¶01 B.5', level: 'Guidance', factor: 1, rule: 'No greater than N', pair: 1, color: 'white', paint: 'dotted', family: 'supplement', note: 'Applies to line extensions through freeway interchanges. At-grade intersections use one marker per short line segment.' },
    'sub-solid': { name: 'Normal solid lane line', section: '3B.17 ¶03, ¶06', level: 'Standard', factor: 0.25, rule: 'No greater than N/4', pair: 1, color: 'white', paint: 'solid', family: 'substitute', note: 'Markers replace the stripe. The illustrated units are all retroreflective, also satisfying the retroreflective-unit spacing limit of N/2.' },
    'sub-double': { name: 'Double solid centerlines', section: '3B.17 ¶02–03, ¶06', level: 'Standard', factor: 0.25, rule: 'No greater than N/4', pair: 2, color: 'yellow', paint: 'double', family: 'substitute', note: 'Two parallel rows simulate the double line (¶02 Guidance). Each row uses the N/4 maximum spacing and all units are retroreflective.' },
    'sub-broken': { name: 'Normal broken line', section: '3B.17 ¶03, ¶05', level: 'Standard', rule: '3–5 markers/group; pitch ≤ N/8', pair: 1, color: 'white', colorChoice: true, paint: 'broken', family: 'substitute', pattern: 'broken', note: 'The illustrated group spans the dash and repeats every N. All illustrated units are retroreflective.' },
    'sub-dotted': { name: 'Normal dotted line', section: '3B.17 ¶03, ¶08', level: 'Standard', rule: 'No greater than N/4; ≥1 per dot', pair: 1, color: 'white', paint: 'dotted', family: 'substitute', pattern: 'dotted', note: 'The illustration uses a centered marker on each dot where the dot-plus-gap cycle fits N/4. Longer dot patterns need additional markers to meet the spacing limits. All illustrated units are retroreflective.' }
  };
  const tolerance = (value) => 8 * Number.EPSILON * Math.max(1, Math.abs(value));
  function readNumber(value, label, allowZero = true) {
    const text = String(value).trim(), number = Number(text);
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(number) ||
        number > Number.MAX_SAFE_INTEGER || (allowZero ? number < 0 : number <= 0)) {
      throw new Error(label + ' must be a ' + (allowZero ? 'nonnegative' : 'positive') + ' number within the supported range.');
    }
    return number;
  }
  function readInteger(value, label, min = 1) {
    const number = readNumber(value, label, min === 0);
    if (!Number.isSafeInteger(number) || number < min) throw new Error(label + ' must be a whole number of at least ' + min + '.');
    return number;
  }
  function readUnitPrice(value) {
    const cents = readNumber(value, 'Unit price') * 100;
    if (!Number.isSafeInteger(Math.round(cents)) || Math.abs(cents - Math.round(cents)) > tolerance(cents)) throw new Error('Enter a unit price with no more than two decimal places.');
    return Math.round(cents);
  }
  function roundUp(value) {
    if (value === 0) return 0;
    const nearest = Math.round(value);
    return Math.max(1, nearest > 0 && Math.abs(value - nearest) <= tolerance(value) ? nearest : Math.ceil(value));
  }
  function exceeds(value, limit) { return value - limit > tolerance(Math.max(value, limit)); }
  function safe(number) {
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('The estimate is too large. Check lengths, spacing, repeats, and price.');
    return number;
  }
  function parseLengths(value) {
    let text = String(value).trim();
    if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1).trim();
    if (!text) return [];
    const tokens = text.split(/[,\s]+/).filter(Boolean);
    if (!tokens.length) throw new Error('Enter at least one segment length.');
    return tokens.map((token, i) => readNumber(token, 'Segment ' + (i + 1) + ' length'));
  }
  function resolveLayout(input) {
    const profile = PROFILES[input.application];
    if (!profile) throw new Error('Choose a marker application.');
    // Fixed Michigan broken-line pattern from PAVE-905-E, sheet 1.
    const { dash, gap, n } = CYCLE;
    const color = profile.colorChoice ? input.markerColor : profile.color;
    if (!['white', 'yellow'].includes(color)) throw new Error('Choose a color to match the marking.');
    const layout = { profile, n, dash, gap, color, pair: profile.pair, page: profile.family === 'substitute' ? 613 : 612, kind: 'uniform', perGroup: 1, pitch: null };
    if (profile.pattern === 'intersection') return { ...layout, kind: 'intersection', spacing: null, cycle: null };
    if (profile.pattern === 'broken') {
      const perGroup = readInteger(input.groupSize, 'Markers per group');
      if (perGroup < 3 || perGroup > 5) throw new Error('Broken-line substitution requires 3, 4, or 5 markers per group (§3B.17 ¶05).');
      const pitch = dash / (perGroup - 1);
      if (exceeds(pitch, n / 8)) throw new Error('Group pitch exceeds N/8. Increase the group size or check the actual dash and gap lengths (§3B.17 ¶05).');
      return { ...layout, kind: 'group', perGroup, spacing: pitch, pitch, cycle: n, groupLength: dash };
    }
    if (profile.pattern === 'dotted') {
      const dot = readNumber(input.dotLength, 'Dotted-line segment length', false);
      const dotGap = readNumber(input.dotGap, 'Dotted-line gap length', false), cap = n / 4;
      if (exceeds(dotGap, cap)) throw new Error('The dotted-line gap exceeds N/4. This repeating-dot layout cannot meet the spacing standard; review the pattern (§3B.17 ¶08).');
      const perGroup = exceeds(dot + dotGap, cap) ? roundUp(dot / cap) + 1 : 1;
      safe(perGroup);
      const pitch = perGroup === 1 ? 0 : dot / (perGroup - 1);
      return { ...layout, kind: 'group', perGroup, spacing: cap, pitch, cycle: dot + dotGap, groupLength: dot };
    }
    const maximum = profile.factor ? n * profile.factor : null;
    if (maximum !== null && (!Number.isFinite(maximum) || maximum > Number.MAX_SAFE_INTEGER)) throw new Error('The spacing is outside the supported range.');
    const custom = profile.custom || input.spacingChoice === 'custom';
    if (!profile.custom && !['rule', 'custom'].includes(input.spacingChoice)) throw new Error('Choose a spacing basis.');
    const spacing = custom ? readNumber(input.customSpacing, 'Selected spacing', false) : maximum;
    if (maximum !== null && exceeds(spacing, maximum)) throw new Error('Selected spacing exceeds ' + maximum + ' ft (' + profile.section + '). This calculator supports the stated value or closer spacing.');
    if (custom && !String(input.engineeringBasis || '').trim()) throw new Error('Record the engineering basis for the selected spacing.');
    return { ...layout, spacing, cycle: spacing, maximum, custom };
  }
  function estimate(input) {
    const layout = resolveLayout(input), unitCents = readUnitPrice(input.unitPrice);
    const runs = readInteger(input.runs, 'Identical applications'), countMode = input.countMode;
    if (!['budget', 'endpoints'].includes(countMode)) throw new Error('Choose a quantity convention.');
    if (layout.kind === 'intersection') {
      const count = readInteger(input.shortLineCount, 'Short line segment count', 0);
      const markers = safe(count * runs * layout.pair), costCents = safe(markers * unitCents);
      return { layout, runs, markers, costCents, baseLength: null, length: null, addedLength: 0, approach: 0, approaches: 0, rows: [{ baseLength: null, length: null, positions: count, markers, costCents }] };
    }
    let lengths, approach = 0, approaches = 0;
    if (input.scope === 'project') lengths = [readNumber(input.projectMiles, 'Project miles') * 5280];
    else if (input.scope === 'segments') {
      lengths = parseLengths(input.segmentLengths);
      if (!lengths.length) throw new Error('Enter measured segment lengths.');
      if (layout.profile.approach && layout.color === 'yellow') {
        approaches = readInteger(input.approaches, 'Approaches per curve', 0);
        if (approaches > 2) throw new Error('Choose zero, one, or two approaches per curve.');
        if (approaches) approach = readNumber(input.approachSpeed, 'Approach speed', false) * 5280 / 3600 * 5;
      }
    } else throw new Error('Choose segments or a full project.');
    const rows = lengths.map((baseLength) => {
      const length = baseLength > 0 ? baseLength + approaches * approach : 0;
      if (!Number.isFinite(length) || length > Number.MAX_SAFE_INTEGER) throw new Error('The segment length is too large.');
      const positions = length === 0 ? 0 : safe(roundUp(length / layout.cycle) + (layout.kind === 'uniform' && countMode === 'endpoints' ? 1 : 0));
      const markers = safe(positions * layout.perGroup * layout.pair * runs);
      return { baseLength, length, positions, markers, costCents: safe(markers * unitCents) };
    });
    const total = rows.reduce((sum, row) => ({
      baseLength: sum.baseLength + row.baseLength, length: sum.length + row.length,
      markers: safe(sum.markers + row.markers), costCents: safe(sum.costCents + row.costCents)
    }), { baseLength: 0, length: 0, markers: 0, costCents: 0 });
    if (!Number.isFinite(total.length) || total.length > Number.MAX_SAFE_INTEGER) throw new Error('The total length is too large.');
    return { ...total, addedLength: total.length - total.baseLength, approach, approaches, layout, runs, rows };
  }
  function resolveCurve(input) {
    const speedDifference = readNumber(input.speedDifference, 'Speed difference');
    if (!RCOC_SPEED_DIFFERENCES.includes(speedDifference)) {
      throw new Error('Choose a speed difference listed in the RCOC workbook: 0, 5, 10, 15, 20, 25, or 30 mph.');
    }
    // RPM Spacing.xlsx, Sheet1!Q27:R33: Existing RCOC unwritten, tangent / curve.
    const spacing = speedDifference === 0 ? 50 : 25;
    const approachSpacing = speedDifference === 0 ? 100 : 50;
    return { speedDifference, spacing, approachSpacing, extensionEachEnd: approachSpacing * 3 };
  }
  function estimateCurves(input) {
    if (!Array.isArray(input.curves) || !input.curves.length) throw new Error('Add at least one curve with its length and speed difference.');
    const unitCents = readUnitPrice(input.unitPrice);
    const lengthInRange = (number) => {
      if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER) throw new Error('The treatment length is too large.');
      return number;
    };
    const rows = input.curves.map((curve, index) => {
      try {
        const name = String(curve.name || '').trim() || 'Curve ' + (index + 1);
        const length = readNumber(curve.length, 'PC-to-PT curve length', false);
        const layout = resolveCurve(curve);
        // Include PC and PT once. A partial final interval ends at PT.
        const stations = safe(roundUp(length / layout.spacing) + 1);
        const curveMarkers = stations;
        // Workbook Q34 specifies three individual RPMs outside each end.
        const beforeMarkers = 3, afterMarkers = 3;
        const approachMarkers = safe(beforeMarkers + afterMarkers);
        const markers = safe(curveMarkers + approachMarkers);
        return { name, length, ...layout, stations, curveMarkers, beforeMarkers, afterMarkers, approachMarkers,
          markers, costCents: safe(markers * unitCents),
          treatedLength: lengthInRange(length + 2 * layout.extensionEachEnd) };
      } catch (error) { throw new Error('Curve ' + (index + 1) + ': ' + error.message); }
    });
    const totals = rows.reduce((sum, row) => ({
      length: lengthInRange(sum.length + row.length), treatedLength: lengthInRange(sum.treatedLength + row.treatedLength),
      curveMarkers: safe(sum.curveMarkers + row.curveMarkers), approachMarkers: safe(sum.approachMarkers + row.approachMarkers),
      markers: safe(sum.markers + row.markers), costCents: safe(sum.costCents + row.costCents)
    }), { length: 0, treatedLength: 0, curveMarkers: 0, approachMarkers: 0, markers: 0, costCents: 0 });
    return { ...totals, rows, unitCents };
  }
  return { SOURCE, RCOC_SPEED_DIFFERENCES, CYCLE, PROFILES, readNumber, readUnitPrice, parseLengths, resolveLayout, estimate, resolveCurve, estimateCurves };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RPMCalculator;
