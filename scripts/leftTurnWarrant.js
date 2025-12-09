document.addEventListener('DOMContentLoaded', () => {
  const leftPoints = [
    { x: 3000, y: 180 },
    { x: 3000, y: 160 },
    { x: 3000, y: 140 },
    { x: 3000, y: 120 },
    { x: 3000, y: 100 },
    { x: 3000, y: 80 },
    { x: 3000, y: 60 },
    { x: 3000, y: 52.5 },
    { x: 7700, y: 20 },
    { x: 8000, y: 19.8 },
    { x: 10000, y: 18 },
    { x: 12000, y: 16.2 },
    { x: 14000, y: 14.4 },
    { x: 16000, y: 12.6 },
    { x: 18000, y: 10.8 },
    { x: 20000, y: 9.1 },
    { x: 22000, y: 7.3 },
    { x: 24000, y: 5.5 },
    { x: 26000, y: 3.7 },
    { x: 28000, y: 1.9 }
  ];

  const rightDataRows = [
    { taper: 30000, lane: 30000, turns: 10 },
    { taper: 17000, lane: 30000, turns: 10 },
    { taper: 9000, lane: 30000, turns: 20 },
    { taper: 7000, lane: 30000, turns: 40 },
    { taper: 5000, lane: 30000, turns: 60 },
    { taper: 3000, lane: 23000, turns: 80 },
    { taper: 2000, lane: 19500, turns: 90 },
    { taper: 1923.076923, lane: 16000, turns: 100 },
    { taper: 1769.230769, lane: 9000, turns: 120 },
    { taper: 1615.384615, lane: 8058.823529, turns: 140 },
    { taper: 1461.538462, lane: 7117.647059, turns: 160 },
    { taper: 1307.692308, lane: 6176.470588, turns: 180 },
    { taper: 1153.846154, lane: 5235.294118, turns: 200 },
    { taper: 1000, lane: 4294.117647, turns: 220 },
    { taper: 1000, lane: 3823.529412, turns: 230 },
    { taper: 1000, lane: 3352.941176, turns: 240 },
    { taper: 1000, lane: 2411.764706, turns: 260 },
    { taper: 1000, lane: 1470.588235, turns: 280 },
    { taper: 1000, lane: 1000, turns: 290 },
    { taper: 1000, lane: 1000, turns: 300 }
  ];

  const rightTaperPoints = rightDataRows.map(({ turns, taper }) => ({ turns, volume: taper }));
  const rightLanePoints = rightDataRows.map(({ turns, lane }) => ({ turns, volume: lane }));

  const clampPercent = (value) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(value, 100));
  };

  const formatValue = (value, digits = 1) => {
    if (!Number.isFinite(value)) {
      return 'N/A';
    }
    const absValue = Math.abs(value);
    if (absValue >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: digits });
  };

  const buildLeftInterpolator = (points) => {
    const minVolume = points.reduce((min, point) => Math.min(min, point.x), Number.POSITIVE_INFINITY);
    const verticalBands = new Map();

    points.forEach((point) => {
      const existing = verticalBands.get(point.x);
      if (existing) {
        existing.min = Math.min(existing.min, point.y);
        existing.max = Math.max(existing.max, point.y);
        verticalBands.set(point.x, existing);
      } else {
        verticalBands.set(point.x, { min: point.y, max: point.y });
      }
    });

    const hasVerticalBand = (volume) => {
      const band = verticalBands.get(volume);
      return band && band.max !== band.min;
    };

    const getThreshold = (volume) => {
      if (!Number.isFinite(volume)) {
        return null;
      }

      if (volume < minVolume) {
        return { kind: 'auto' };
      }

      if (hasVerticalBand(volume)) {
        const band = verticalBands.get(volume);
        return { kind: 'vertical', x: volume, min: band.min, max: band.max };
      }

      for (let i = 0; i < points.length - 1; i += 1) {
        const p1 = points[i];
        const p2 = points[i + 1];

        if (p1.x === p2.x) {
          continue;
        }

        const minSegX = Math.min(p1.x, p2.x);
        const maxSegX = Math.max(p1.x, p2.x);
        if (volume >= minSegX && volume <= maxSegX) {
          const ratio = (volume - p1.x) / (p2.x - p1.x);
          return { kind: 'value', y: p1.y + ratio * (p2.y - p1.y) };
        }
      }

      for (let i = points.length - 2; i >= 0; i -= 1) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (p1.x !== p2.x) {
          const slope = (p2.y - p1.y) / (p2.x - p1.x);
          return { kind: 'value', y: p2.y + slope * (volume - p2.x) };
        }
      }

      return null;
    };

    return getThreshold;
  };

  const buildTurnInterpolator = (points) => {
    const sorted = points.slice().sort((a, b) => a.turns - b.turns);
    const minTurn = sorted.reduce((min, point) => Math.min(min, point.turns), Number.POSITIVE_INFINITY);
    const verticalBands = new Map();

    sorted.forEach((point) => {
      const band = verticalBands.get(point.turns);
      if (band) {
        band.min = Math.min(band.min, point.volume);
        band.max = Math.max(band.max, point.volume);
        verticalBands.set(point.turns, band);
      } else {
        verticalBands.set(point.turns, { min: point.volume, max: point.volume });
      }
    });

    const getVolume = (turnValue) => {
      if (!Number.isFinite(turnValue)) {
        return null;
      }

      if (turnValue < minTurn) {
        return Number.POSITIVE_INFINITY;
      }

      const band = verticalBands.get(turnValue);
      if (band && band.max !== band.min) {
        return { kind: 'vertical', turns: turnValue, min: band.min, max: band.max };
      }

      for (let i = 0; i < sorted.length - 1; i += 1) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];

        if (p1.turns === p2.turns) {
          continue;
        }

        const minSeg = Math.min(p1.turns, p2.turns);
        const maxSeg = Math.max(p1.turns, p2.turns);
        if (turnValue >= minSeg && turnValue <= maxSeg) {
          const ratio = (turnValue - p1.turns) / (p2.turns - p1.turns);
          return p1.volume + ratio * (p2.volume - p1.volume);
        }
      }

      for (let i = sorted.length - 2; i >= 0; i -= 1) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        if (p1.turns !== p2.turns) {
          const slope = (p2.volume - p1.volume) / (p2.turns - p1.turns);
          return p2.volume + slope * (turnValue - p2.turns);
        }
      }

      return null;
    };

    return getVolume;
  };

  const getLeftThreshold = buildLeftInterpolator(leftPoints);
  const getRightTaperVolume = buildTurnInterpolator(rightTaperPoints);
  const getRightLaneVolume = buildTurnInterpolator(rightLanePoints);

  const verdictEl = document.getElementById('warrantVerdict');
  const detailEl = document.getElementById('warrantDetails');
  const summaryEl = document.getElementById('warrantSummary');
  const button = document.getElementById('checkWarrant');
  const percentCommercialInput = document.getElementById('percentCommercial');
  const turnLabel = document.getElementById('turnVolumeLabel');
  const turnFieldNote = document.getElementById('turnFieldNote');
  const chartNoteText = document.getElementById('chartNoteText');
  const modeButtons = document.querySelectorAll('.mode-button[data-mode]');

  const chartCanvas = document.getElementById('warrantChart');
  const ctx = chartCanvas ? chartCanvas.getContext('2d') : null;

  const chartConfig = {
    left: {
      baseX: { min: 0, max: 28000, step: 4000 },
      baseY: { min: 0, max: 200, step: 20 },
      xLabel: 'Two-way 24-hour volume (vpd)',
      yLabel: 'Peak-hour left turns (PCU veh/hr)',
      note: 'Blue line = published left-turn envelope. The dot animates to your point (green when allowed, red when prohibited).',
      legend: [
        { label: 'Envelope to prohibit left turns', color: '#1d4ed8' }
      ],
      drawSeries: () => {
        ctx.save();
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        leftPoints.forEach((point, index) => {
          const { x, y } = valueToCanvas(point.x, point.y);
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.restore();
      }
    },
    right: {
      baseX: { min: 0, max: 320, step: 20 },
      baseY: { min: 0, max: 32000, step: 2000 },
      xLabel: 'Peak-hour right turns (veh/hr)',
      yLabel: 'Two-way 24-hour volume (vpd)',
      note: 'Blue line = radius/taper boundary. Gray line = add right-turn lane/deceleration lane. Dot color shows the recommendation.',
      legend: [
        { label: 'Radius / taper boundary', color: '#1d4ed8' },
        { label: 'Add right-turn lane boundary', color: '#475569' }
      ],
      drawSeries: () => {
        const drawLine = (points, color, dash = []) => {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.setLineDash(dash);
          ctx.lineWidth = 2.4;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          points.forEach((point, index) => {
            const { x, y } = valueToCanvas(point.turns, point.volume);
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
          ctx.restore();
        };

        drawLine(rightTaperPoints, '#1d4ed8');
        drawLine(rightLanePoints, '#475569', [6, 4]);
      }
    }
  };

  const chartState = {
    mode: 'left',
    width: 0,
    height: 0,
    dpr: window.devicePixelRatio || 1,
    point: null,
    pointColor: '#f97316',
    pointLabel: '',
    pointText: '',
    pointValues: null,
    domainXMax: chartConfig.left.baseX.max,
    domainYMax: chartConfig.left.baseY.max
  };

  if (chartNoteText) {
    chartNoteText.textContent = chartConfig.left.note;
  }

  let resizeTimer;
  let pointAnimationFrame = null;

  const setCanvasSize = () => {
    if (!chartCanvas) return;
    const parent = chartCanvas.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    if (!width) return;
    const height = Math.min(420, Math.max(260, width * 0.55));
    const dpr = window.devicePixelRatio || 1;

    chartCanvas.width = width * dpr;
    chartCanvas.height = height * dpr;
    chartCanvas.style.width = `${width}px`;
    chartCanvas.style.height = `${height}px`;

    chartState.width = width;
    chartState.height = height;
    chartState.dpr = dpr;

    drawChart();
  };

  const clearCanvas = () => {
    if (!ctx || !chartCanvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
    ctx.setTransform(chartState.dpr, 0, 0, chartState.dpr, 0, 0);
  };

  const getCurrentDomain = () => {
    const config = chartConfig[chartState.mode];
    return {
      xMin: config.baseX.min,
      xMax: Math.max(config.baseX.max, chartState.domainXMax || config.baseX.max),
      yMin: config.baseY.min,
      yMax: Math.max(config.baseY.max, chartState.domainYMax || config.baseY.max)
    };
  };

  const valueToCanvas = (xValue, yValue) => {
    const domain = getCurrentDomain();
    const usableWidth = chartState.width - chartPadding.left - chartPadding.right;
    const usableHeight = chartState.height - chartPadding.top - chartPadding.bottom;
    if (usableWidth <= 0 || usableHeight <= 0) {
      return { x: 0, y: 0 };
    }
    const clampedX = Math.min(Math.max(xValue, domain.xMin), domain.xMax);
    const clampedY = Math.min(Math.max(yValue, domain.yMin), domain.yMax);
    const ratioX = (clampedX - domain.xMin) / Math.max(domain.xMax - domain.xMin, 1);
    const ratioY = (clampedY - domain.yMin) / Math.max(domain.yMax - domain.yMin, 1);

    const x = chartPadding.left + ratioX * usableWidth;
    const y = chartState.height - chartPadding.bottom - ratioY * usableHeight;
    return { x, y };
  };

  const chartPadding = { top: 28, right: 28, bottom: 48, left: 70 };

  const buildTicks = (min, max, step) => {
    const ticks = [];
    if (step <= 0) return ticks;
    for (let value = min; value <= max + step / 10; value += step) {
      ticks.push(value);
    }
    return ticks;
  };

  const drawAxes = () => {
    if (!ctx) return;
    const { width, height } = chartState;
    const domain = getCurrentDomain();
    const config = chartConfig[chartState.mode];

    ctx.save();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartPadding.left, chartPadding.top - 10);
    ctx.lineTo(chartPadding.left, height - chartPadding.bottom);
    ctx.lineTo(width - chartPadding.right, height - chartPadding.bottom);
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = buildTicks(domain.xMin, domain.xMax, config.baseX.step);
    xTicks.forEach((tick) => {
      const { x } = valueToCanvas(tick, domain.yMin);
      ctx.beginPath();
      ctx.moveTo(x, height - chartPadding.bottom);
      ctx.lineTo(x, height - chartPadding.bottom + 6);
      ctx.stroke();
      ctx.fillText(formatValue(tick, tick >= 1 ? 0 : 1), x, height - chartPadding.bottom + 8);
    });

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTicks = buildTicks(domain.yMin, domain.yMax, config.baseY.step);
    yTicks.forEach((tick) => {
      const { y } = valueToCanvas(domain.xMin, tick);
      ctx.beginPath();
      ctx.moveTo(chartPadding.left - 6, y);
      ctx.lineTo(chartPadding.left, y);
      ctx.stroke();
      ctx.fillText(formatValue(tick, tick >= 1 ? 0 : 1), chartPadding.left - 10, y);
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(config.xLabel, width / 2, height - 6);
    ctx.save();
    ctx.translate(16, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(config.yLabel, 0, 0);
    ctx.restore();

    if (chartState.mode === 'left') {
      ctx.font = 'bold 13px Arial';
      ctx.fillStyle = '#15803d';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Left turns allowed (below line)', chartPadding.left + 10, height - chartPadding.bottom - 10);
      ctx.fillStyle = '#b91c1c';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('Left turns prohibited (above line)', width - chartPadding.right - 10, chartPadding.top + 10);
    } else {
      ctx.font = 'bold 13px Arial';
      ctx.fillStyle = '#15803d';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Radius only', chartPadding.left + 10, height - chartPadding.bottom - 10);

      ctx.fillStyle = '#f97316';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const midX = (chartPadding.left + width - chartPadding.right) / 4;
      const midY = (chartPadding.top + height - chartPadding.bottom) / 2;
      ctx.fillText('Add taper', midX, midY);

      ctx.fillStyle = '#b91c1c';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('Add right-turn lane / decel lane', width - chartPadding.right - 10, chartPadding.top + 10);
    }

    ctx.restore();
  };

  const drawPoint = () => {
    if (!ctx || !chartState.point) return;
    const { x, y } = valueToCanvas(chartState.point.x, chartState.point.y);
    const { width } = chartState;
    ctx.save();
    ctx.fillStyle = chartState.pointColor || '#f97316';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = chartState.pointColor || '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();

    if (chartState.pointText) {
      const text = chartState.pointText;
      ctx.font = 'bold 12px Arial';
      const paddingX = 8;
      const paddingY = 5;
      const textMetrics = ctx.measureText(text);
      const labelWidth = textMetrics.width + paddingX * 2;
      const labelHeight = 18 + paddingY * 2;
      let labelX = x + 16;
      if (labelX + labelWidth > width - chartPadding.right) {
        labelX = x - 16 - labelWidth;
      }
      let labelY = y - labelHeight - 8;
      if (labelY < chartPadding.top) {
        labelY = y + 16;
      }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = chartState.pointColor || '#f97316';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(labelX, labelY, labelWidth, labelHeight);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, labelX + paddingX, labelY + labelHeight / 2);
    }
    ctx.restore();
  };

  const drawChart = () => {
    if (!ctx || !chartState.width || !chartState.height) return;
    clearCanvas();
    ctx.setTransform(chartState.dpr, 0, 0, chartState.dpr, 0, 0);
    drawAxes();
    chartConfig[chartState.mode].drawSeries();
    drawPoint();
  };

  const animatePoint = (xValue, yValue, color, label, axisValues) => {
    const config = chartConfig[chartState.mode];
    chartState.domainXMax = Math.max(config.baseX.max, xValue * 1.05);
    chartState.domainYMax = Math.max(config.baseY.max, yValue * 1.1);
    chartState.pointLabel = label;
    chartState.pointText = label;
    chartState.pointValues = axisValues;

    if (!ctx || !chartState.width) {
      chartState.point = { x: xValue, y: yValue };
      chartState.pointColor = color;
      drawChart();
      return;
    }

    const startPoint = chartState.point ? { ...chartState.point } : { x: xValue, y: config.baseY.min };
    const targetPoint = { x: xValue, y: yValue };
    const duration = 700;
    const animation = { start: null };

    if (pointAnimationFrame) {
      cancelAnimationFrame(pointAnimationFrame);
    }

    const step = (timestamp) => {
      if (!animation.start) {
        animation.start = timestamp;
      }
      const progress = Math.min((timestamp - animation.start) / duration, 1);
      chartState.point = {
        x: startPoint.x + (targetPoint.x - startPoint.x) * progress,
        y: startPoint.y + (targetPoint.y - startPoint.y) * progress
      };
      chartState.pointColor = color;
      drawChart();

      if (progress < 1) {
        pointAnimationFrame = requestAnimationFrame(step);
      } else {
        chartState.point = targetPoint;
        chartState.pointColor = color;
        drawChart();
      }
    };

    pointAnimationFrame = requestAnimationFrame(step);
  };

  const renderResult = (result) => {
    if (!result) {
      verdictEl.innerHTML = '<span class="pill warn">Enter both values</span>';
      detailEl.textContent = 'Use non-negative numbers for the two-way 24-hour volume and the peak-hour turning volume.';
      summaryEl.classList.add('hidden');
      summaryEl.innerHTML = '';
      return;
    }

    verdictEl.innerHTML = result.verdictHtml;
    detailEl.textContent = result.detailText;
    summaryEl.classList.remove('hidden');
    summaryEl.innerHTML = result.summaryHtml;

    animatePoint(
      result.chartPoint.x,
      result.chartPoint.y,
      result.color,
      result.label,
      result.chartValues
    );
  };

  const gatherInputs = () => {
    const siteName = document.getElementById('siteName').value.trim();
    const rawVolume = parseFloat(document.getElementById('twoWayVolume').value);
    const rawTurns = parseFloat(document.getElementById('leftTurns').value);
    const percentCommercialInputValue = percentCommercialInput ? parseFloat(percentCommercialInput.value) : 0;

    if (!Number.isFinite(rawVolume) || rawVolume < 0 || !Number.isFinite(rawTurns) || rawTurns < 0) {
      return { error: true };
    }

    return {
      siteName,
      rawVolume,
      rawTurns,
      percentCommercial: clampPercent(percentCommercialInputValue)
    };
  };

  const evaluateLeft = ({ siteName, rawVolume, rawTurns, percentCommercial }) => {
    const adjustedVolume = rawVolume;
    const adjustedLefts = rawTurns * (1 + percentCommercial / 100);
    const percentText = `${formatValue(percentCommercial, 1)}%`;
    const siteLabel = siteName || 'Site point';
    const sitePrefix = siteName ? `${siteName}: ` : '';

    const threshold = getLeftThreshold(adjustedVolume);
    if (!threshold) {
      return null;
    }

    const inputsSummary = `<strong>Inputs:</strong> ${formatValue(rawVolume, 0)} vpd, ${formatValue(rawTurns)} lefts/hr, ${percentText} commercial trucks.<br>`
      + `<strong>PCU used:</strong> ${formatValue(adjustedVolume, 0)} vpd, ${formatValue(adjustedLefts)} PCU lefts/hr.`;

    const pointLabelBase = (status) => `${siteLabel} – ${status}`;

    if (threshold.kind === 'auto') {
      return {
        verdictHtml: '<span class="pill ok">Left turns allowed (line not reached)</span>',
        detailText: `${sitePrefix}${formatValue(adjustedVolume, 0)} vpd sits left of the 3,000 vpd envelope. Lefts checked at ${formatValue(adjustedLefts)} PCU/hr (from ${formatValue(rawTurns)} lefts/hr with ${percentText} trucks).`,
        summaryHtml: `${inputsSummary}<br><strong>Envelope point:</strong> Not in range (line begins at 3,000 vpd).<br>`
          + '<strong>Delta:</strong> Not applicable.<br>'
          + '<strong>Rule:</strong> Above the line prohibits left turns; below allows them.',
        color: '#16a34a',
        label: pointLabelBase('Allowed (outside envelope)'),
        chartPoint: { x: adjustedVolume, y: adjustedLefts },
        chartValues: {
          xLabel: chartConfig.left.xLabel,
          xValue: adjustedVolume,
          yLabel: chartConfig.left.yLabel,
          yValue: adjustedLefts
        }
      };
    }

    if (threshold.kind === 'vertical') {
      const { min, max, x } = threshold;
      let position = 'inside';
      let delta = 0;
      if (adjustedLefts > max) {
        position = 'above';
        delta = adjustedLefts - max;
      } else if (adjustedLefts < min) {
        position = 'below';
        delta = min - adjustedLefts;
      }
      const allowed = position !== 'above';
      const verdictHtml = allowed
        ? '<span class="pill ok">Left turns allowed (at/left of line)</span>'
        : '<span class="pill warn">Left turns prohibited (above line)</span>';

      const positionText = position === 'inside' ? 'inside the band for' : `${position} the band for`;
      const deltaText = position === 'inside'
        ? 'Right on the line.'
        : `${formatValue(delta)} lefts/hr ${position}.`;

      return {
        verdictHtml,
        detailText: `${sitePrefix}${formatValue(adjustedLefts)} PCU lefts/hr is ${positionText} ${formatValue(x, 0)} vpd (${formatValue(min)}–${formatValue(max)} PCU lefts/hr). Raw lefts: ${formatValue(rawTurns)} veh/hr with ${percentText} trucks.`,
        summaryHtml: `${inputsSummary}<br><strong>Envelope span:</strong> ${formatValue(x, 0)} vpd → ${formatValue(min)}–${formatValue(max)} PCU lefts/hr.<br>`
          + `<strong>Delta:</strong> ${deltaText}<br>`
          + '<strong>Rule:</strong> Above the line prohibits left turns; below allows them.',
        color: allowed ? '#16a34a' : '#dc2626',
        label: pointLabelBase(allowed ? 'Allowed' : 'Prohibited'),
        chartPoint: { x: adjustedVolume, y: adjustedLefts },
        chartValues: {
          xLabel: chartConfig.left.xLabel,
          xValue: adjustedVolume,
          yLabel: chartConfig.left.yLabel,
          yValue: adjustedLefts
        }
      };
    }

    const allowed = adjustedLefts <= threshold.y;
    const difference = adjustedLefts - threshold.y;

    return {
      verdictHtml: allowed
        ? '<span class="pill ok">Left turns allowed (below line)</span>'
        : '<span class="pill warn">Left turns prohibited (above line)</span>',
      detailText: `${sitePrefix}${formatValue(adjustedLefts)} PCU lefts/hr is ${difference > 0 ? 'above' : 'below'} the warrant line (${formatValue(threshold.y)} PCU lefts/hr at ${formatValue(adjustedVolume, 0)} vpd). Raw lefts: ${formatValue(rawTurns)} veh/hr with ${percentText} trucks.`,
      summaryHtml: `${inputsSummary}<br><strong>Envelope point:</strong> ${formatValue(adjustedVolume, 0)} vpd → ${formatValue(threshold.y)} PCU lefts/hr.<br>`
        + `<strong>Delta:</strong> ${formatValue(Math.abs(difference))} lefts/hr ${difference > 0 ? 'over' : 'under'}.<br>`
        + '<strong>Rule:</strong> Above the line prohibits left turns; below allows them.',
      color: allowed ? '#16a34a' : '#dc2626',
      label: pointLabelBase(allowed ? 'Allowed' : 'Prohibited'),
      chartPoint: { x: adjustedVolume, y: adjustedLefts },
      chartValues: {
        xLabel: chartConfig.left.xLabel,
        xValue: adjustedVolume,
        yLabel: chartConfig.left.yLabel,
        yValue: adjustedLefts
      }
    };
  };

  const evaluateRight = ({ siteName, rawVolume, rawTurns }) => {
    const siteLabel = siteName || 'Site point';
    const sitePrefix = siteName ? `${siteName}: ` : '';

    const interpretBoundary = (boundary) => {
      if (boundary === null) return null;
      if (boundary === Number.POSITIVE_INFINITY) return { type: 'auto' };
      if (typeof boundary === 'object') {
        return { type: 'range', min: boundary.min, max: boundary.max };
      }
      return { type: 'value', value: boundary };
    };

    const compareBoundary = (info, volume) => {
      if (!info) return 0;
      if (info.type === 'auto') {
        return -1;
      }
      if (info.type === 'range') {
        if (volume > info.max) return 1;
        if (volume < info.min) return -1;
        return 0;
      }
      if (!Number.isFinite(info.value)) return 0;
      if (volume > info.value) return 1;
      if (volume < info.value) return -1;
      return 0;
    };

    const describeBoundary = (info) => {
      if (!info) return 'N/A';
      if (info.type === 'auto') {
        return 'line not reached (low right-turn volume)';
      }
      if (info.type === 'range') {
        return `${formatValue(info.min, 0)}–${formatValue(info.max, 0)} vpd band`;
      }
      return `${formatValue(info.value, 0)} vpd`;
    };

    const taperInfo = interpretBoundary(getRightTaperVolume(rawTurns));
    const laneInfo = interpretBoundary(getRightLaneVolume(rawTurns));

    if (!taperInfo || !laneInfo) {
      return null;
    }

    const taperComparison = compareBoundary(taperInfo, rawVolume);
    const laneComparison = compareBoundary(laneInfo, rawVolume);

    const inputsSummary = `<strong>Inputs:</strong> ${formatValue(rawVolume, 0)} vpd, ${formatValue(rawTurns)} right turns/hr.<br>`
      + '<strong>Truck factor:</strong> Not applied (right-turn branch uses raw turns).';

    let verdictHtml;
    let color;
    let label;
    let recommendation;

    if (taperComparison <= 0) {
      verdictHtml = '<span class="pill ok">Radius only</span>';
      color = '#16a34a';
      recommendation = 'Radius/flare only (no taper).';
      label = `${siteLabel} – Radius only`;
    } else if (laneComparison <= 0) {
      verdictHtml = '<span class="pill info">Add taper / decel lane</span>';
      color = '#f97316';
      recommendation = 'Add taper or short deceleration lane.';
      label = `${siteLabel} – Add taper`;
    } else {
      verdictHtml = '<span class="pill warn">Add right-turn lane / decel lane</span>';
      color = '#dc2626';
      recommendation = 'Add full right-turn lane / deceleration lane.';
      label = `${siteLabel} – Add lane`;
    }

    const detailText = `${sitePrefix}${formatValue(rawVolume, 0)} vpd vs taper boundary ${describeBoundary(taperInfo)} and lane boundary ${describeBoundary(laneInfo)} at ${formatValue(rawTurns)} right turns/hr.`;

    const summaryHtml = `${inputsSummary}<br><strong>Taper boundary (blue):</strong> ${describeBoundary(taperInfo)}.<br>`
      + `<strong>Lane boundary (gray):</strong> ${describeBoundary(laneInfo)}<br>`
      + `<strong>Recommendation:</strong> ${recommendation}`;

    return {
      verdictHtml,
      detailText,
      summaryHtml,
      color,
      label,
      chartPoint: { x: rawTurns, y: rawVolume },
      chartValues: {
        xLabel: chartConfig.right.xLabel,
        xValue: rawTurns,
        yLabel: chartConfig.right.yLabel,
        yValue: rawVolume
      }
    };
  };

  const downloadChartImage = () => {
    if (!chartCanvas) return;
    if (!chartState.width || !chartState.height) {
      setCanvasSize();
    }

    const config = chartConfig[chartState.mode];
    const cssWidth = chartState.width || chartCanvas.clientWidth || 640;
    const cssHeight = chartState.height || chartCanvas.clientHeight || 360;
    const headerHeight = 220;
    const dpr = chartState.dpr || window.devicePixelRatio || 1;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = cssWidth * dpr;
    exportCanvas.height = (cssHeight + headerHeight) * dpr;
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.scale(dpr, dpr);

    exportCtx.fillStyle = '#ffffff';
    exportCtx.fillRect(0, 0, cssWidth, cssHeight + headerHeight);

    const title = chartState.mode === 'left'
      ? 'RCOC TURNING WARRANTS – LEFT TURN'
      : 'RCOC TURNING WARRANTS – RIGHT TURN';

    exportCtx.fillStyle = '#0f172a';
    exportCtx.textAlign = 'center';
    exportCtx.textBaseline = 'top';
    exportCtx.font = '700 22px Arial';
    exportCtx.fillText(title, cssWidth / 2, 18);
    exportCtx.font = '600 16px Arial';
    exportCtx.fillText('(Based on Provided Permit-Guide Lines)', cssWidth / 2, 48);

    let legendY = 92;
    const stackedLegend = cssWidth < 640;
    const drawLegendEntry = (startX, startY, color, label, dash = false) => {
      exportCtx.strokeStyle = color;
      exportCtx.lineWidth = 2.4;
      if (dash) {
        exportCtx.setLineDash([6, 4]);
      } else {
        exportCtx.setLineDash([]);
      }
      exportCtx.beginPath();
      exportCtx.moveTo(startX, startY);
      exportCtx.lineTo(startX + 40, startY);
      exportCtx.stroke();
      exportCtx.setLineDash([]);

      exportCtx.fillStyle = '#0f172a';
      exportCtx.font = '14px Arial';
      exportCtx.textAlign = 'left';
      exportCtx.textBaseline = 'middle';
      exportCtx.fillText(label, startX + 52, startY);
    };

    chartConfig[chartState.mode].legend.forEach((entry, index) => {
      const row = stackedLegend ? index : 0;
      const col = stackedLegend ? 0 : index;
      const startX = 40 + col * 260;
      const startY = legendY + row * 24;
      drawLegendEntry(startX, startY, entry.color, entry.label, entry.color === '#475569');
    });

    legendY += stackedLegend ? chartConfig[chartState.mode].legend.length * 24 : 24;

    if (chartState.pointValues) {
      exportCtx.fillStyle = '#0f172a';
      exportCtx.font = '14px Arial';
      exportCtx.textAlign = 'left';
      exportCtx.textBaseline = 'top';
      exportCtx.fillText(`${chartState.pointValues.xLabel}: ${formatValue(chartState.pointValues.xValue, chartState.mode === 'right' ? 0 : 1)}`, 40, legendY + 12);
      exportCtx.fillText(`${chartState.pointValues.yLabel}: ${formatValue(chartState.pointValues.yValue, 1)}`, 40, legendY + 32);
      if (chartState.pointLabel) {
        exportCtx.fillText(`Result: ${chartState.pointLabel}`, 40, legendY + 52);
      }
    }

    exportCtx.drawImage(chartCanvas, 0, headerHeight, cssWidth, cssHeight);

    const link = document.createElement('a');
    link.download = 'rcoc-turning-warrant.png';
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const resetOutputs = () => {
    verdictEl.innerHTML = '';
    detailEl.textContent = '';
    summaryEl.classList.add('hidden');
    summaryEl.innerHTML = '';
    chartState.point = null;
    chartState.pointValues = null;
    drawChart();
  };

  const setMode = (mode) => {
    if (chartState.mode === mode) return;
    chartState.mode = mode;
    chartState.domainXMax = chartConfig[mode].baseX.max;
    chartState.domainYMax = chartConfig[mode].baseY.max;
    chartState.point = null;
    chartState.pointValues = null;
    chartState.pointText = '';

    modeButtons.forEach((buttonEl) => {
      if (buttonEl.dataset.mode === mode) {
        buttonEl.classList.add('active');
      } else {
        buttonEl.classList.remove('active');
      }
    });

    if (mode === 'left') {
      turnLabel.textContent = 'Peak-hour left turns (veh/h)';
      turnFieldNote.textContent = 'Example: 20% trucks → left turns × 1.20 for the warrant check. (Right-turn branch ignores this factor.)';
      chartNoteText.textContent = chartConfig.left.note;
    } else {
      turnLabel.textContent = 'Peak-hour right turns (veh/h)';
      turnFieldNote.textContent = 'Right-turn branch uses the raw turning volume (truck factor ignored unless your agency requires PCUs).';
      chartNoteText.textContent = chartConfig.right.note;
    }

    drawChart();
    resetOutputs();
  };

  if (chartCanvas) {
    setCanvasSize();
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setCanvasSize, 150);
    });
  }

  if (modeButtons.length) {
    modeButtons.forEach((buttonEl) => {
      buttonEl.addEventListener('click', () => setMode(buttonEl.dataset.mode));
    });
  }

  if (button) {
    button.addEventListener('click', () => {
      const inputs = gatherInputs();
      if (inputs.error) {
        renderResult(null);
        return;
      }

      const result = chartState.mode === 'left'
        ? evaluateLeft(inputs)
        : evaluateRight(inputs);

      renderResult(result);
    });
  }

  const downloadButton = document.getElementById('downloadChart');
  if (downloadButton) {
    downloadButton.addEventListener('click', downloadChartImage);
  }
});
