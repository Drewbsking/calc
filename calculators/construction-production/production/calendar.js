(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./units.js') : root.CPUnits);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CPCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U) {
  'use strict';
  // Civil clock hours represented in UTC, so the host timezone never changes a work date.
  // This is a planning calendar, not a timezone/DST-aware elapsed-seconds scheduler.
  const EPS = 1e-9, HOUR = 3600000, MAX_DAYS = 36600;
  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Enter a valid date (YYYY-MM-DD).');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw new Error(`Invalid date: ${value}.`);
    return +date / HOUR;
  }
  function parseTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) throw new Error('Enter a valid shift start time.');
    const [h, m] = value.split(':').map(Number);
    if (h > 23 || m > 59) throw new Error('Enter a valid shift start time.');
    return h + m / 60;
  }
  function parseDateTime(value) {
    const [date, time] = String(value || '').split('T');
    return parseDate(date) + parseTime(time);
  }
  const dateLabel = t => new Date(Math.floor(t / 24) * 24 * HOUR).toISOString().slice(0, 10);
  const timeLabel = t => {
    const minutes = Math.round(((t % 24 + 24) % 24) * 60) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  };
  function create(config = {}, closure = null) {
    const hoursPerDay = U.number(config.hoursPerDay ?? 8, 'Hours per workday', true);
    if (hoursPerDay > 24) throw new Error('Hours per workday cannot exceed 24.');
    const weekdays = config.weekdays ?? [1, 2, 3, 4];
    if (!Array.isArray(weekdays) || !weekdays.length || weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Select at least one valid working weekday.');
    const shiftHour = parseTime(config.shiftStart ?? '07:00');
    const holidays = new Set((config.holidays || []).map(d => dateLabel(parseDate(d))));
    const overrides = config.dailyHours || {};
    for (const value of Object.values(overrides)) if (U.number(value, 'Daily work hours') > 24) throw new Error('Daily work hours cannot exceed 24.');
    if (weekdays.every(d => Number(overrides[d] ?? hoursPerDay) === 0)) throw new Error('At least one working weekday needs positive hours.');
    const datedWindow = closure?.type === 'dates';
    let start = datedWindow ? parseDateTime(closure.start) : parseDate(config.startDate || '2026-01-05') + shiftHour;
    if (!datedWindow && !config.startDate) {
      // Undated estimates start on the first enabled weekday, not on idle days before it.
      while (!weekdays.includes(new Date(Math.floor(start / 24) * 24 * HOUR).getUTCDay()) ||
          Number(overrides[new Date(Math.floor(start / 24) * 24 * HOUR).getUTCDay()] ?? hoursPerDay) === 0 || holidays.has(dateLabel(start))) start += 24;
    }
    const end = datedWindow ? parseDateTime(closure.end) : null;
    if (datedWindow && end <= start) throw new Error('Completion date/time must be after the closure start.');
    const startDay = Math.floor(start / 24);
    const slots = [];
    let previousEnd = -Infinity;
    for (let offset = -1; offset < MAX_DAYS; offset++) {
      const day = startDay + offset;
      const weekday = new Date(day * 24 * HOUR).getUTCDay();
      if (!weekdays.includes(weekday) || holidays.has(dateLabel(day * 24))) continue;
      const length = Number(overrides[weekday] ?? hoursPerDay);
      const rawStart = day * 24 + shiftHour, rawEnd = rawStart + length;
      if (rawEnd <= start + EPS || length === 0) continue;
      if (rawStart < previousEnd - EPS) throw new Error('Daily shifts overlap. Reduce shift hours.');
      const slot = { start: Math.max(rawStart, start), end: rawEnd, day, index: slots.length + 1 };
      slots.push(slot);
      previousEnd = rawEnd;
    }
    function at(t) {
      let lo = 0, hi = slots.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (slots[mid].end <= t + EPS) lo = mid + 1; else hi = mid; }
      if (!slots[lo]) throw new Error('Schedule exceeds the supported 100-year planning horizon.');
      return slots[lo];
    }
    function work(t, duration) {
      const segments = [];
      let remaining = duration, cursor = Math.max(t, start);
      while (remaining > 0) {
        const slot = at(cursor), from = Math.max(cursor, slot.start);
        const used = Math.min(remaining, slot.end - from);
        segments.push({ ...slot, start: from, end: from + used, hours: used });
        remaining = Math.max(0, remaining - used);
        if (remaining < EPS) remaining = 0;
        cursor = from + used;
      }
      return { start: segments[0]?.start ?? cursor, end: cursor, segments };
    }
    let windowSlots = [], deadline = null;
    if (closure) {
      if (datedWindow) {
        windowSlots = slots.filter(s => s.start < end - EPS).map(s => ({ ...s, end: Math.min(s.end, end) }));
        deadline = end;
      } else {
        const days = U.number(closure.workdays, 'Available workdays', true);
        if (days > slots.length) throw new Error('Closure exceeds the supported planning horizon.');
        windowSlots = slots.slice(0, Math.ceil(days)).map((s, i) => ({ ...s, end: s.start + (s.end - s.start) * Math.min(1, days - i) }));
        deadline = windowSlots.at(-1)?.end;
      }
      if (!windowSlots.length) throw new Error('The closure contains no working hours. Check working weekdays, holidays, and shift times.');
    }
    return { start, startDay, slots, at, work, deadline, windowSlots, hoursPerDay,
      hasDates: Boolean(config.startDate || datedWindow),
      availableHours: windowSlots.reduce((sum, s) => sum + s.end - s.start, 0) };
  }
  return { EPS, parseDate, parseTime, parseDateTime, dateLabel, timeLabel, create };
});
