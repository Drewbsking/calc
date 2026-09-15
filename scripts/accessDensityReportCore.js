(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AccessDensityReportCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULT_INTERVAL_FEET = 1000;
  const ROAD_LABEL_TOLERANCE_FEET = 100;
  const HALF_MILE_FEET = 2640;
  const TENTH_MILE_FEET = 528;
  const HYPOTHETICAL_INTERVAL_FEET = 100;
  const MCL_URL = 'https://legislature.mi.gov/Laws/MCL?objectName=mcl-257-627';
  const MCL_REVIEWED = '2026-09-15';
  // MCL 257.627(2)(f)-(j); no 50- or 55-mph access-count category exists.
  const SPEED_RULES = [
    { minimum: 60, maximum: null, mph: 25, subsection: '(2)(f)' },
    { minimum: 50, maximum: 59, mph: 30, subsection: '(2)(g)' },
    { minimum: 45, maximum: 49, mph: 35, subsection: '(2)(h)' },
    { minimum: 40, maximum: 44, mph: 40, subsection: '(2)(i)' },
    { minimum: 30, maximum: 39, mph: 45, subsection: '(2)(j)' }
  ];
  const EPSILON = 1e-6;
  const types = ['residential', 'commercial', 'named'];

  function namedLabels(points, toleranceFeet) {
    const groups = [];
    const latest = new Map();
    points.filter(point => point.type === 'named').forEach(point => {
      const key = point.name.trim().replace(/\s+/g, ' ').toLowerCase();
      let group = key && latest.get(key);
      // Bound the whole group, not just each pair, to avoid merging a long chain.
      if (!group || point.stationFeet - group.stations[0] > toleranceFeet) {
        group = { name: point.name.trim() || 'Unnamed road / access', stations: [], stationFeet: point.stationFeet };
        groups.push(group);
        if (key) latest.set(key, group);
      }
      group.stations.push(point.stationFeet);
      group.stationFeet = group.stations.reduce((sum, value) => sum + value, 0) / group.stations.length;
    });
    return groups.sort((a, b) => a.stationFeet - b.stationFeet);
  }

  function speedAnalysis(lengthFeet, accesses, shortHighway) {
    // A short traced alignment is not proof that the whole highway is short.
    // Apply (5)(c) only when the user identifies the entire short highway.
    const prorated = shortHighway === true && lengthFeet < HALF_MILE_FEET - EPSILON;
    const windowFeet = prorated ? TENTH_MILE_FEET : HALF_MILE_FEET;
    const complete = lengthFeet >= windowFeet - EPSILON;
    const maxStart = Math.max(0, lengthFeet - windowFeet);
    const boundaries = new Set([0, maxStart]);
    accesses.forEach(point => {
      // A window count changes only when an access enters or leaves. Evaluate
      // those positions and each intervening span, independent of chart bins.
      [point.stationFeet - windowFeet, point.stationFeet].forEach(start => {
        if (start > 0 && start < maxStart) boundaries.add(start);
      });
    });
    const ordered = [...boundaries].sort((a, b) => a - b);
    const starts = ordered.flatMap((value, index) => index + 1 < ordered.length
      ? [value, (value + ordered[index + 1]) / 2] : [value]);
    let left = 0, right = 0;
    const results = starts.map(startFeet => {
      const endFeet = Math.min(lengthFeet, startFeet + windowFeet);
      // Both window endpoints are included. Overlapping windows intentionally
      // review the same accesses; their counts are never added together.
      while (left < accesses.length && accesses[left].stationFeet < startFeet - EPSILON) left++;
      while (right < accesses.length && accesses[right].stationFeet <= endFeet + EPSILON) right++;
      const accessCount = right - left;
      const equivalentHalfMileCount = complete ? accessCount * HALF_MILE_FEET / windowFeet : null;
      const rule = complete && SPEED_RULES.find(item => equivalentHalfMileCount >= item.minimum);
      return { startFeet, endFeet, accessCount, complete, equivalentHalfMileCount,
        speedMph: rule ? rule.mph : null, subsection: rule ? rule.subsection : null,
        status: !complete ? 'incomplete' : rule ? 'recommended' : 'below-threshold' };
    });
    const peak = complete ? results.reduce((best, item) => item.accessCount > best.accessCount ? item : best) : null;
    // Keep the report readable: endpoints, the maximum count, and both sides
    // of every speed-category change. The full sweep still determines the peak.
    const selected = new Set([results[0], results.at(-1)]);
    if (peak) selected.add(peak);
    results.forEach((item, index) => {
      if (index && item.speedMph !== results[index - 1].speedMph) {
        selected.add(results[index - 1]); selected.add(item);
      }
    });
    const windows = [...selected].sort((a, b) => a.startFeet - b.startFeet);
    return { windowFeet, prorated, windows, peak, evaluatedWindowCount: results.length,
      method: 'sliding', source: MCL_URL, reviewed: MCL_REVIEWED };
  }

  function hypotheticalSpeedAnalysis(lengthFeet, accesses) {
    // A separate what-if calculation, never used by the statutory analysis.
    const rounded = Math.round(lengthFeet / HYPOTHETICAL_INTERVAL_FEET) * HYPOTHETICAL_INTERVAL_FEET;
    const end = rounded > 0 && Math.abs(lengthFeet - rounded) <= EPSILON ? rounded : lengthFeet;
    const count = Math.ceil(end / HYPOTHETICAL_INTERVAL_FEET);
    const segments = Array.from({ length: count }, (_, index) => ({
      startFeet: index * HYPOTHETICAL_INTERVAL_FEET,
      endFeet: Math.min((index + 1) * HYPOTHETICAL_INTERVAL_FEET, end),
      accessCount: 0
    }));
    accesses.forEach(point => {
      const boundary = Math.round(point.stationFeet / HYPOTHETICAL_INTERVAL_FEET) * HYPOTHETICAL_INTERVAL_FEET;
      const station = Math.abs(point.stationFeet - boundary) <= EPSILON ? boundary : point.stationFeet;
      const index = Math.min(count - 1, Math.floor(station / HYPOTHETICAL_INTERVAL_FEET));
      segments[index].accessCount++;
    });
    segments.forEach(segment => {
      segment.equivalentHalfMileCount = segment.accessCount * HALF_MILE_FEET / (segment.endFeet - segment.startFeet);
      const rule = SPEED_RULES.find(item => segment.equivalentHalfMileCount >= item.minimum);
      segment.speedMph = rule ? rule.mph : null;
      segment.status = rule ? 'hypothetical' : 'below-threshold';
    });
    return { intervalFeet: HYPOTHETICAL_INTERVAL_FEET, method: 'local-density-proration', segments };
  }

  function calculate({ studyName = '', lengthFeet, points, intervalFeet = DEFAULT_INTERVAL_FEET, roadLabelToleranceFeet = ROAD_LABEL_TOLERANCE_FEET, shortHighway = false }) {
    if (!Number.isFinite(lengthFeet) || lengthFeet <= 0) throw new Error('Create a valid stationed alignment before opening reports.');
    if (!Number.isFinite(intervalFeet) || intervalFeet < 1) throw new Error('Enter an analysis interval of at least 1 foot.');
    if (!Number.isFinite(roadLabelToleranceFeet) || roadLabelToleranceFeet < 0) throw new Error('Road label spacing must be zero or greater.');
    if (!Array.isArray(points)) throw new Error('Access-point data is unavailable.');
    // Remove floating point noise only at interval boundaries and the endpoint.
    const snap = value => {
      const boundary = Math.round(value / intervalFeet) * intervalFeet;
      return Math.abs(value - boundary) <= EPSILON ? boundary : value;
    };
    const normalizedLength = snap(lengthFeet) || lengthFeet;
    const binCount = Math.max(1, Math.ceil(normalizedLength / intervalFeet));
    if (binCount > 10000) throw new Error('Use a larger interval to keep the report below 10,000 intervals.');
    const bins = Array.from({ length: binCount }, (_, index) => ({
      startFeet: index * intervalFeet,
      endFeet: Math.min((index + 1) * intervalFeet, normalizedLength),
      residential: 0, commercial: 0, named: 0, total: 0, commercialNamed: 0
    }));
    const accesses = points.map((point, order) => {
      if (!types.includes(point.type) || !Number.isFinite(point.stationFeet)
        || point.stationFeet < -EPSILON || point.stationFeet > lengthFeet + EPSILON) {
        throw new Error('An access point has an invalid type or station. Repair the alignment before reporting.');
      }
      return {
        id: point.id, type: point.type, name: String(point.name || ''), order,
        stationFeet: Math.max(0, Math.min(normalizedLength, snap(point.stationFeet)))
      };
    }).sort((a, b) => a.stationFeet - b.stationFeet || a.order - b.order);
    accesses.forEach(point => {
      // Intervals include their start and exclude their end. The alignment's
      // final endpoint belongs to its last interval, never an extra empty bin.
      const index = Math.min(binCount - 1, Math.floor(point.stationFeet / intervalFeet));
      const bin = bins[index];
      bin[point.type]++;
      bin.total++;
      if (point.type !== 'residential') bin.commercialNamed++;
    });
    const gaps = accesses.slice(1).map((next, index) => {
      const previous = accesses[index];
      return {
        startFeet: previous.stationFeet, endFeet: next.stationFeet,
        lengthFeet: next.stationFeet - previous.stationFeet, previous, next
      };
    }).sort((a, b) => b.lengthFeet - a.lengthFeet || a.startFeet - b.startFeet || a.previous.order - b.previous.order);
    return {
      studyName: String(studyName).trim().replace(/\s+/g, ' '),
      lengthFeet: normalizedLength, intervalFeet, roadLabelToleranceFeet, bins, accesses,
      driveways: accesses.filter(point => point.type !== 'named'),
      namedLabels: namedLabels(accesses, roadLabelToleranceFeet), gaps,
      speed: speedAnalysis(normalizedLength, accesses, shortHighway),
      hypotheticalSpeed: hypotheticalSpeedAnalysis(normalizedLength, accesses)
    };
  }
  return { calculate, DEFAULT_INTERVAL_FEET, ROAD_LABEL_TOLERANCE_FEET, HALF_MILE_FEET, TENTH_MILE_FEET, HYPOTHETICAL_INTERVAL_FEET, SPEED_RULES, MCL_URL, MCL_REVIEWED };
});
