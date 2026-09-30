(function() {
  const DISTANCE_PER_INCH = 30;

  const TABLE_LOOKUP = [
    { mounting: 'overhead', roadway: 'all', speed: 'all', uppercase: 12, lowercase: 9, footnote: '' },
    { mounting: 'post', roadway: 'multi', speed: 'gt40', uppercase: 8, lowercase: 6, footnote: '' },
    { mounting: 'post', roadway: 'multi', speed: 'le40', uppercase: 6, lowercase: 4.5, footnote: '' },
    {
      mounting: 'post',
      roadway: 'two',
      speed: 'all',
      uppercase: 6,
      lowercase: 4.5,
      footnote: 'On local two-lane streets with speed limits of 25 mph or less, 4 in / 3 in letters may be used.'
    },
    {
      mounting: 'post',
      roadway: 'two',
      speed: 'local25',
      uppercase: 4,
      lowercase: 3,
      footnote: 'Footnote applied: local two-lane streets with speed limits of 25 mph or less may use 4 in / 3 in letters.'
    }
  ];

  const SPEED_OPTIONS = {
    overhead: [{ value: 'all', label: 'All speed limits' }],
    multi: [
      { value: 'gt40', label: 'More than 40 mph' },
      { value: 'le40', label: '40 mph or less' }
    ],
    two: [
      { value: 'all', label: 'All speed limits' },
      { value: 'local25', label: 'Local two-lane, 25 mph or less (footnote)' }
    ]
  };

  function roundTo(value, step) {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step === 0) return NaN;
    return Math.round(value / step) * step;
  }

  function formatHeight(value) {
    if (!Number.isFinite(value)) return '—';
    const rounded = Math.round(value * 100) / 100;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
    return `${text} in`;
  }

  function getSpeedOptions(mounting, roadway) {
    if (mounting === 'overhead') return SPEED_OPTIONS.overhead;
    if (roadway === 'two') return SPEED_OPTIONS.two;
    return SPEED_OPTIONS.multi;
  }

  function syncSpeedSelect(mounting, roadway) {
    const speedSelect = document.getElementById('speed-select');
    if (!speedSelect) return;
    const options = getSpeedOptions(mounting, roadway);
    const previous = speedSelect.value;
    speedSelect.innerHTML = '';
    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      speedSelect.appendChild(option);
    });
    const hasPrev = options.some((opt) => opt.value === previous);
    speedSelect.value = hasPrev ? previous : (options[0]?.value || '');
    speedSelect.disabled = mounting === 'overhead';
  }

  function getSpeedLabel(mounting, roadway, speed) {
    const options = getSpeedOptions(mounting, roadway);
    const match = options.find((opt) => opt.value === speed);
    return match ? match.label : '';
  }

  function findTableRow(mounting, roadway, speed) {
    return TABLE_LOOKUP.find(
      (row) => row.mounting === mounting && row.roadway === roadway && row.speed === speed
    );
  }

  function renderTableResult(row, mounting, roadway, speed) {
    const resultEl = document.getElementById('table-result');
    const noteEl = document.getElementById('table-footnote');
    if (!resultEl || !noteEl) return;

    if (!row) {
      resultEl.innerHTML = '<p>Pick a combination covered by Table 2D-2.</p>';
      noteEl.textContent = 'Table 2D-2 values are recommended minimum letter heights for street name signs.';
      return;
    }

    const contextParts = [];
    contextParts.push(row.mounting === 'overhead' ? 'Overhead mounting' : 'Post-mounted');
    if (row.mounting === 'post') {
      contextParts.push(row.roadway === 'multi' ? 'Multi-lane' : 'Two-lane');
    }
    const speedLabel = getSpeedLabel(mounting, roadway, speed);
    if (speedLabel) contextParts.push(speedLabel);

    resultEl.innerHTML = `
      <p><strong>Initial upper-case height:</strong> <span class="highlight">${formatHeight(row.uppercase)}</span></p>
      <p><strong>Lower-case height:</strong> <span class="highlight">${formatHeight(row.lowercase)}</span></p>
      <p class="note">${contextParts.join(' · ')}</p>
    `;
    noteEl.textContent = row.footnote || 'Table 2D-2 values are recommended minimum letter heights for street name signs.';
  }

  function handleTableChange() {
    const mountingSelect = document.getElementById('mounting-select');
    const roadwaySelect = document.getElementById('roadway-select');
    const speedSelect = document.getElementById('speed-select');
    if (!mountingSelect || !roadwaySelect || !speedSelect) return;

    const mounting = mountingSelect.value || 'overhead';
    if (mounting === 'overhead') {
      roadwaySelect.value = 'all';
      roadwaySelect.disabled = true;
    } else {
      roadwaySelect.disabled = false;
      if (roadwaySelect.value === 'all') {
        roadwaySelect.value = 'multi';
      }
    }

    const roadway = mounting === 'overhead' ? 'all' : roadwaySelect.value;
    syncSpeedSelect(mounting, roadway);

    const speed = speedSelect.value || 'all';
    const row = findTableRow(mounting, roadway, speed);
    renderTableResult(row, mounting, roadway, speed);
  }

  function calculateLegibility() {
    const distanceInput = document.getElementById('legibility-distance');
    const resultEl = document.getElementById('legibility-result');
    if (!distanceInput || !resultEl) return;
    const distance = Number.parseFloat(distanceInput.value);
    if (!Number.isFinite(distance) || distance <= 0) {
      resultEl.textContent = 'Enter a distance greater than zero.';
      return;
    }

    const exact = distance / DISTANCE_PER_INCH;
    const roundedHalf = roundTo(exact, 0.5);

    resultEl.innerHTML = `
      <p><strong>Exact (1 in / ${DISTANCE_PER_INCH} ft):</strong> <span class="highlight">${formatHeight(exact)}</span></p>
      <p><strong>Rounded to nearest 0.5 in:</strong> <span class="highlight">${formatHeight(roundedHalf)}</span></p>
      <p class="note">Every additional inch of letter height adds about ${DISTANCE_PER_INCH} ft of legibility.</p>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const distanceInput = document.getElementById('legibility-distance');
    if (distanceInput && !distanceInput.value) {
      distanceInput.value = '300';
    }
    handleTableChange();
    calculateLegibility();
  });

  window.calculateLegibility = calculateLegibility;
  window.handleTableChange = handleTableChange;
})();
