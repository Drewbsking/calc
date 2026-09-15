(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AccessDensityGeometry = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Geometry uses local X/Y meters. Station values exposed to the UI use feet.
  const METERS_PER_FOOT = 0.3048;
  const EARTH_RADIUS = 6378137;
  const TAU = Math.PI * 2;
  const EPSILON = 1e-8;
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const normalize = angle => ((angle % TAU) + TAU) % TAU;
  const toFeet = meters => meters / METERS_PER_FOOT;
  const toMeters = feet => feet * METERS_PER_FOOT;

  function checkPoint(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error('A coordinate must have finite X and Y values.');
    }
  }

  function distance(a, b) {
    checkPoint(a);
    checkPoint(b);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function line(start, end) {
    const length = distance(start, end);
    if (length <= EPSILON) throw new Error('A tangent needs two different points.');
    return { type: 'line', start, end, length };
  }

  function circleThroughPoints(pc, mid, pt) {
    checkPoint(pc);
    checkPoint(mid);
    checkPoint(pt);
    // Translate to PC before squaring coordinates to avoid cancellation.
    const bx = mid.x - pc.x, by = mid.y - pc.y;
    const cx = pt.x - pc.x, cy = pt.y - pc.y;
    const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const determinant = 2 * (bx * cy - by * cx);
    const scale = Math.max(b2, c2, (mid.x - pt.x) ** 2 + (mid.y - pt.y) ** 2);
    if (Math.min(distance(pc, mid), distance(mid, pt), distance(pc, pt)) <= EPSILON) {
      throw new Error('PC, MID, and PT must be different points.');
    }
    if (Math.abs(determinant) <= scale * 1e-7) {
      throw new Error('PC, MID, and PT are nearly straight. Drag MID off the line.');
    }
    const ox = (cy * b2 - by * c2) / determinant;
    const oy = (bx * c2 - cx * b2) / determinant;
    const radius = Math.hypot(ox, oy);
    if (!Number.isFinite(radius)) throw new Error('The curve could not be calculated.');
    return { center: { x: pc.x + ox, y: pc.y + oy }, radius };
  }

  function curve(pc, mid, pt) {
    const { center, radius } = circleThroughPoints(pc, mid, pt);
    const angle = point => Math.atan2(point.y - center.y, point.x - center.x);
    const startAngle = angle(pc);
    const ccwEnd = normalize(angle(pt) - startAngle);
    const ccwMid = normalize(angle(mid) - startAngle);
    // Select the directed PC -> MID -> PT sweep, including arcs over 180 degrees.
    const sweep = ccwMid < ccwEnd ? ccwEnd : ccwEnd - TAU;
    const arcLength = radius * Math.abs(sweep);
    return {
      type: 'curve', pc, mid, pt, start: pc, end: pt,
      center, radius, startAngle, sweep,
      direction: sweep > 0 ? 'ccw' : 'cw', arcLength, length: arcLength
    };
  }

  function buildAlignment(sections) {
    let totalLength = 0;
    const segments = sections.map((section, index) => {
      let segment;
      try {
        if (section.type === 'line') segment = line(section.start, section.end);
        else if (section.type === 'curve') segment = curve(section.pc, section.mid, section.pt);
        else throw new Error('Unknown alignment section.');
        if (index > 0) {
          const previous = sections[index - 1];
          const previousEnd = previous.type === 'curve' ? previous.pt : previous.end;
          if (distance(previousEnd, segment.start) > 1e-6) {
            throw new Error('The section must connect to the previous endpoint.');
          }
        }
      } catch (error) {
        throw new Error('Section ' + (index + 1) + ': ' + error.message);
      }
      segment.startDistance = totalLength;
      totalLength += segment.length;
      segment.endDistance = totalLength;
      return segment;
    });
    return { segments, totalLength };
  }

  function pointOnSegment(segment, distanceAlong) {
    const along = clamp(distanceAlong, 0, segment.length);
    if (along === 0) return { ...segment.start };
    if (along === segment.length) return { ...segment.end };
    if (segment.type === 'line') {
      const t = along / segment.length;
      return {
        x: segment.start.x + t * (segment.end.x - segment.start.x),
        y: segment.start.y + t * (segment.end.y - segment.start.y)
      };
    }
    const angle = segment.startAngle + Math.sign(segment.sweep) * along / segment.radius;
    return {
      x: segment.center.x + segment.radius * Math.cos(angle),
      y: segment.center.y + segment.radius * Math.sin(angle)
    };
  }

  function tangentOnSegment(segment, distanceAlong) {
    if (segment.type === 'line') return {
      x: (segment.end.x - segment.start.x) / segment.length,
      y: (segment.end.y - segment.start.y) / segment.length
    };
    const sign = Math.sign(segment.sweep);
    const angle = segment.startAngle + sign * clamp(distanceAlong, 0, segment.length) / segment.radius;
    return { x: -sign * Math.sin(angle), y: sign * Math.cos(angle) };
  }

  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const move = (p, direction, amount) => ({ x: p.x + direction.x * amount, y: p.y + direction.y * amount });

  function extendTangent(segment, target) {
    const direction = tangentOnSegment(segment, segment.length);
    const length = dot(subtract(target, segment.end), direction);
    if (length < .01) throw new Error('Place the next point ahead of PT along the tangent guide.');
    return move(segment.end, direction, length);
  }

  function assertTangency(alignment) {
    for (let i = 1; i < alignment.segments.length; i++) {
      const before = alignment.segments[i - 1], after = alignment.segments[i];
      if (before.type !== 'curve' && after.type !== 'curve') continue;
      const incoming = tangentOnSegment(before, before.length);
      const outgoing = tangentOnSegment(after, 0);
      if (dot(incoming, outgoing) < 0 || Math.abs(cross(incoming, outgoing)) > 1e-6) {
        throw new Error('The curve must join the adjoining section tangentially. Adjust its controls.');
      }
    }
  }

  function arcFromTangent(pc, direction, radius, sweep, fraction = .5) {
    if (!Number.isFinite(radius) || radius < .01 || Math.abs(sweep) < 1e-6) {
      throw new Error('The curve needs more room between the tangent sections.');
    }
    const normal = { x: -direction.y, y: direction.x };
    const center = move(pc, normal, Math.sign(sweep) * radius);
    const angle = Math.atan2(pc.y - center.y, pc.x - center.x);
    const at = portion => ({
      x: center.x + radius * Math.cos(angle + sweep * portion),
      y: center.y + radius * Math.sin(angle + sweep * portion)
    });
    return curve(pc, at(fraction), at(1));
  }

  function tangentSupports(arc, entry, exit) {
    const u = entry.direction, v = exit.direction;
    const determinant = cross(u, v);
    const sign = Math.sign(arc.sweep);
    const sweep = sign * normalize(sign * Math.atan2(determinant, dot(u, v)));
    if (Math.abs(sweep) < 1e-6 || Math.abs(sweep) > TAU - 1e-6) {
      throw new Error('These tangents are straight. Move the curve controls to define a bend.');
    }
    // Preserve the control's fraction of the arc while it changes radius.
    const midAngle = Math.atan2(arc.mid.y - arc.center.y, arc.mid.x - arc.center.x);
    const fraction = clamp(normalize(sign * (midAngle - arc.startAngle)) / Math.abs(arc.sweep), .05, .95);
    if (Math.abs(determinant) < 1e-7) {
      // A half-circle between opposing parallel tangents has a fixed radius.
      const gap = cross(u, subtract(exit.point, entry.point));
      if (gap * sign <= .02) throw new Error('The opposing tangents leave no room for this curve.');
      return { entry, exit, sweep: sign * Math.PI, fraction, radius: Math.abs(gap) / 2, parallel: true };
    }
    const along = cross(subtract(exit.point, entry.point), v) / determinant;
    return { entry, exit, sweep, fraction, pi: move(entry.point, u, along), factor: Math.tan(Math.abs(sweep) / 2), parallel: false };
  }

  function fitOnSupports(support, radius, edit, original) {
    const { entry, exit, sweep, fraction } = support;
    if (support.parallel) {
      let pc = move(entry.point, entry.direction, dot(subtract(original.pc, entry.point), entry.direction));
      const base = arcFromTangent(pc, entry.direction, support.radius, sweep, fraction);
      if (edit) {
        const reference = base[edit.control];
        pc = move(pc, entry.direction, dot(subtract(edit.point, reference), entry.direction));
      }
      return arcFromTangent(pc, entry.direction, support.radius, sweep, fraction);
    }
    if (edit) {
      const relative = subtract(edit.point, support.pi);
      if (edit.control === 'pc') radius = -dot(relative, entry.direction) / support.factor;
      else if (edit.control === 'pt') radius = dot(relative, exit.direction) / support.factor;
      else {
        const unitArc = arcFromTangent(move(support.pi, entry.direction, -support.factor), entry.direction, 1, sweep, fraction);
        const direction = subtract(unitArc.mid, support.pi);
        radius = dot(relative, direction) / dot(direction, direction);
      }
    }
    const pc = move(support.pi, entry.direction, -radius * support.factor);
    return arcFromTangent(pc, entry.direction, radius, sweep, fraction);
  }

  function fitWithFreeExit(original, support, edit) {
    const base = fitOnSupports(support, original.radius, null, original);
    if (!edit) return base;
    const { entry, fraction } = support;
    let pc = base.pc, radius = base.radius, sweep = base.sweep;
    if (edit.control === 'pc') {
      pc = move(pc, entry.direction, dot(subtract(edit.point, pc), entry.direction));
    } else if (edit.control === 'mid') {
      const direction = subtract(base.mid, pc);
      radius *= dot(subtract(edit.point, pc), direction) / dot(direction, direction);
    } else {
      const delta = subtract(edit.point, pc);
      const normal = { x: -entry.direction.y, y: entry.direction.x };
      const signedRadius = dot(delta, delta) / (2 * dot(delta, normal));
      if (!Number.isFinite(signedRadius) || signedRadius * Math.sign(sweep) <= .01) {
        throw new Error('Keep PT on the curve side of the incoming tangent.');
      }
      radius = Math.abs(signedRadius);
      const center = move(pc, normal, signedRadius);
      const startAngle = Math.atan2(pc.y - center.y, pc.x - center.x);
      const endAngle = Math.atan2(edit.point.y - center.y, edit.point.x - center.x);
      sweep = Math.sign(sweep) * normalize(Math.sign(sweep) * (endAngle - startAngle));
    }
    return arcFromTangent(pc, entry.direction, radius, sweep, fraction);
  }

  function fitWithFreeEntry(original, support, edit) {
    const reversed = curve(original.pt, original.mid, original.pc);
    const reverseSupport = tangentSupports(reversed,
      { point: support.exit.point, direction: move({ x: 0, y: 0 }, support.exit.direction, -1) },
      { point: support.entry.point, direction: move({ x: 0, y: 0 }, support.entry.direction, -1) });
    const reverseEdit = edit && { ...edit, control: { pc: 'pt', mid: 'mid', pt: 'pc' }[edit.control] };
    const fitted = fitWithFreeExit(reversed, reverseSupport, reverseEdit);
    return curve(fitted.pt, fitted.mid, fitted.pc);
  }

  function constrainAlignment(sections, edit = null) {
    // Work on copies: an impossible drag must leave the last valid alignment intact.
    const result = sections.map(section => section.type === 'line'
      ? { type: 'line', start: { ...section.start }, end: { ...section.end } }
      : { type: 'curve', pc: { ...section.pc }, mid: { ...section.mid }, pt: { ...section.pt } });
    const original = buildAlignment(sections).segments;
    // A PC beyond another curve may relocate the connecting tangent. Both
    // curves refit to this guide, so dragging across it does not snap PC back.
    const movedLineIndex = edit?.control === 'pc' && original[edit.index - 1]?.type === 'line'
      && original[edit.index - 2]?.type === 'curve' ? edit.index - 1 : -1;
    const movedLine = movedLineIndex >= 0 ? line(original[movedLineIndex].start, edit.point) : null;
    function lineGuide(index) {
      const segment = index === movedLineIndex ? movedLine : original[index];
      return { point: segment.start, direction: tangentOnSegment(segment, 0) };
    }
    const supports = original.map((arc, index) => {
      if (arc.type !== 'curve') return null;
      const before = original[index - 1], after = original[index + 1];
      const entry = before?.type === 'line' ? lineGuide(index - 1) : before
        ? { point: before.end, direction: tangentOnSegment(before, before.length) }
        : { point: arc.pc, direction: tangentOnSegment(arc, 0) };
      const exit = after?.type === 'line'
        ? lineGuide(index + 1)
        : { point: arc.pt, direction: tangentOnSegment(arc, arc.length) };
      return tangentSupports(arc, entry, exit);
    });
    function apply(index, arc) {
      result[index] = { type: 'curve', pc: arc.pc, mid: arc.mid, pt: arc.pt };
      const before = result[index - 1], after = result[index + 1];
      if (before?.type === 'line') before.end = arc.pc;
      if (after?.type === 'line') after.start = arc.pt;
    }
    function fit(index, selected) {
      const arc = original[index], support = supports[index];
      if (!original[index - 1] && !original[index + 1]) {
        return selected ? curve(
          selected.control === 'pc' ? selected.point : arc.pc,
          selected.control === 'mid' ? selected.point : arc.mid,
          selected.control === 'pt' ? selected.point : arc.pt) : arc;
      }
      if (!original[index + 1]) return fitWithFreeExit(arc, support, selected);
      if (!original[index - 1]) return fitWithFreeEntry(arc, support, selected);
      return fitOnSupports(support, arc.radius, selected, arc);
    }
    for (let start = 0; start < original.length; start++) {
      if (original[start].type !== 'curve') continue;
      let end = start;
      while (original[end + 1]?.type === 'curve') end++;
      const primary = edit && edit.index >= start && edit.index <= end ? edit.index : start;
      const selected = edit?.index === primary ? edit : null;
      apply(primary, fit(primary, selected));
      // Consecutive curves share their contact point and tangent. Propagate a
      // contact's movement through the run without rotating the support lines.
      for (let i = primary - 1; i >= start; i--) {
        apply(i, fit(i, { control: 'pt', point: result[i + 1].pc }));
      }
      for (let i = primary + 1; i <= end; i++) {
        apply(i, fit(i, { control: 'pc', point: result[i - 1].pt }));
      }
      start = end;
    }
    // Preserve travel direction and the order of tangent endpoints.
    result.forEach((section, index) => {
      if (section.type !== 'line') return;
      const forward = lineGuide(index).direction;
      if (dot(subtract(section.end, section.start), forward) < .01) {
        throw new Error('The curve reaches beyond an adjoining tangent. Use a smaller radius.');
      }
    });
    const alignment = buildAlignment(result);
    assertTangency(alignment);
    return result;
  }

  function locationAtStation(alignment, stationFeet) {
    if (!alignment.segments.length || !Number.isFinite(stationFeet)) return null;
    const distanceAlong = toMeters(stationFeet);
    if (distanceAlong < -EPSILON || distanceAlong > alignment.totalLength + EPSILON) return null;
    const along = clamp(distanceAlong, 0, alignment.totalLength);
    let index = alignment.segments.findIndex(segment => along <= segment.endDistance);
    if (index < 0) index = alignment.segments.length - 1;
    const segment = alignment.segments[index];
    const localDistance = clamp(along - segment.startDistance, 0, segment.length);
    return {
      point: pointOnSegment(segment, localDistance),
      tangent: tangentOnSegment(segment, localDistance),
      segmentIndex: index, distanceAlong: along, stationFeet: toFeet(along)
    };
  }

  function nearestStation(alignment, point) {
    checkPoint(point);
    let best = null;
    alignment.segments.forEach((segment, index) => {
      let localDistance;
      if (segment.type === 'line') {
        const dx = segment.end.x - segment.start.x, dy = segment.end.y - segment.start.y;
        const t = clamp(((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) /
          (segment.length * segment.length), 0, 1);
        localDistance = t * segment.length;
      } else {
        const angle = Math.atan2(point.y - segment.center.y, point.x - segment.center.x);
        const sweepToPoint = normalize(Math.sign(segment.sweep) * (angle - segment.startAngle));
        if (sweepToPoint <= Math.abs(segment.sweep) + EPSILON) {
          localDistance = Math.min(segment.length, sweepToPoint * segment.radius);
        } else {
          localDistance = distance(point, segment.start) <= distance(point, segment.end) ? 0 : segment.length;
        }
      }
      const projected = pointOnSegment(segment, localDistance);
      const offset = distance(point, projected);
      if (!best || offset < best.offset - EPSILON) {
        const distanceAlong = segment.startDistance + localDistance;
        best = { point: projected, offset, distanceAlong, stationFeet: toFeet(distanceAlong), segmentIndex: index };
      }
    });
    return best;
  }

  function stationLocations(alignment, intervalFeet = 500) {
    if (!Number.isFinite(intervalFeet) || intervalFeet <= 0) throw new Error('Station spacing must be positive.');
    const count = Math.floor((toFeet(alignment.totalLength) + 1e-7) / intervalFeet);
    const locations = [];
    for (let i = 0; i <= count; i++) {
      const location = locationAtStation(alignment, i * intervalFeet);
      if (location) locations.push(location);
    }
    return locations;
  }

  function formatStation(feet, decimals = 0) {
    if (!Number.isFinite(feet) || feet < 0) return '\u2014';
    const scale = 10 ** decimals;
    const rounded = Math.round(feet * scale);
    const hundreds = Math.floor(rounded / (100 * scale));
    const remainder = ((rounded % (100 * scale)) / scale).toFixed(decimals);
    return hundreds + '+' + remainder.padStart(decimals ? 3 + decimals : 2, '0');
  }

  function sampleCurve(segment, maxSagitta = 0.05) {
    // Sampling affects display only. Length and station inquiry use the exact arc.
    const stepAngle = 2 * Math.acos(clamp(1 - maxSagitta / segment.radius, -1, 1));
    const steps = Math.min(4096, Math.max(12, Math.ceil(Math.abs(segment.sweep) / Math.max(stepAngle, 1e-5))));
    return Array.from({ length: steps + 1 }, (_, index) => pointOnSegment(segment, segment.length * index / steps));
  }

  function localFrame(origin) {
    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || Math.abs(origin.lat) >= 90) {
      throw new Error('Choose a valid map location.');
    }
    // Same local spherical approximation as curve.html; fixed for the entire alignment.
    const lat = origin.lat, lng = origin.lng;
    const radians = Math.PI / 180;
    const xScale = EARTH_RADIUS * radians * Math.cos(lat * radians);
    const yScale = EARTH_RADIUS * radians;
    return {
      toXY: point => ({ x: (point.lng - lng) * xScale, y: (point.lat - lat) * yScale }),
      toLatLng: point => ({ lat: lat + point.y / yScale, lng: lng + point.x / xScale })
    };
  }

  return {
    METERS_PER_FOOT, toFeet, toMeters, distance, line, circleThroughPoints, curve,
    buildAlignment, pointOnSegment, tangentOnSegment, locationAtStation, nearestStation,
    stationLocations, formatStation, sampleCurve, localFrame,
    extendTangent, assertTangency, constrainAlignment
  };
});
