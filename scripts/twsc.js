(function () {
  const DEFAULT_INPUTS = {
    analysisPeriod: 0.25,
    hvPercent: 10,
    gradePercent: 0,
    volumeBasis: '15min',
    volumes15: {
      v1: 0,
      v1u: 0,
      v2: 60,
      v3: 10,
      v4: 40,
      v4u: 0,
      v5: 75,
      v6: 0,
      v7: 10,
      v9: 30,
      v13: 0,
      v14: 0,
      v15: 0
    }
  };

  const volumeFieldMap = {
    v1: 'vol_v1',
    v1u: 'vol_v1u',
    v2: 'vol_v2',
    v3: 'vol_v3',
    v4: 'vol_v4',
    v4u: 'vol_v4u',
    v5: 'vol_v5',
    v6: 'vol_v6',
    v7: 'vol_v7',
    v9: 'vol_v9',
    v13: 'vol_v13',
    v14: 'vol_v14',
    v15: 'vol_v15'
  };

  const fmt0 = (num) => (Number.isFinite(num) ? num.toFixed(0) : '--');
  const fmt1 = (num) => (Number.isFinite(num) ? num.toFixed(1) : '--');
  const fmt2 = (num) => (Number.isFinite(num) ? num.toFixed(2) : '--');
  const losFromDelay = (delay) => {
    if (!Number.isFinite(delay)) return '--';
    if (delay <= 10) return 'A';
    if (delay <= 15) return 'B';
    if (delay <= 25) return 'C';
    if (delay <= 35) return 'D';
    if (delay <= 50) return 'E';
    return 'F';
  };

  const parseField = (id, fallback = 0) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const num = parseFloat(el.value);
    return Number.isFinite(num) ? num : fallback;
  };

  const toHourly = (vol, basis) => {
    const val = Math.max(0, vol);
    return basis === 'hour' ? val : val * 4;
  };

  const computeConflictingFlows = (flows) => {
    const vc4 = (flows.v2 || 0) + (flows.v3 || 0) + (flows.v15 || 0);
    const vc9 = (flows.v2 || 0) + 0.5 * (flows.v3 || 0) + (flows.v14 || 0) + (flows.v15 || 0);
    const stage1 = 2 * (flows.v1 || 0) + 2 * (flows.v1u || 0) + (flows.v2 || 0) + 0.5 * (flows.v3 || 0) + (flows.v15 || 0);
    const stage2 = 2 * (flows.v4 || 0) + 2 * (flows.v4u || 0) + (flows.v5 || 0) + 0.5 * (flows.v6 || 0) + (flows.v13 || 0);
    const vc7 = stage1 + stage2;
    return { vc4, vc9, vc7, stage1, stage2 };
  };

  const potentialCapacity = (vc, tc, tf) => {
    if (!Number.isFinite(vc) || !Number.isFinite(tc) || !Number.isFinite(tf) || vc < 0 || tc <= 0 || tf <= 0) return NaN;
    const denom = 1 - Math.exp((-vc * tf) / 3600);
    if (Math.abs(denom) < 1e-9) return NaN;
    return (vc * Math.exp((-vc * tc) / 3600)) / denom;
  };

  const controlDelay = (v, c, periodHours) => {
    if (!Number.isFinite(v) || !Number.isFinite(c) || !Number.isFinite(periodHours) || v < 0 || c <= 0 || periodHours <= 0) return NaN;
    const x = v / c;
    const sqrtTerm = Math.sqrt(Math.pow(x - 1, 2) + (3600 / c) * x / (450 * periodHours));
    return 3600 / c + 900 * periodHours * ((x - 1) + sqrtTerm) + 5;
  };

  const queueLength95 = (v, c, periodHours) => {
    if (!Number.isFinite(v) || !Number.isFinite(c) || !Number.isFinite(periodHours) || v < 0 || c <= 0 || periodHours <= 0) return NaN;
    const x = v / c;
    const sqrtTerm = Math.sqrt(Math.pow(x - 1, 2) + (3600 / c) * x / (150 * periodHours));
    return 900 * periodHours * ((x - 1) + sqrtTerm) * (c / 3600);
  };

  const computeTwsc = (inputs) => {
    const hvFraction = Math.max(0, inputs.hvPercent || 0) / 100;
    const grade = (inputs.gradePercent || 0) / 100;
    const period = inputs.analysisPeriod > 0 ? inputs.analysisPeriod : DEFAULT_INPUTS.analysisPeriod;
    const basis = inputs.volumeBasis === 'hour' ? 'hour' : '15min';

    const flows = {};
    Object.entries(inputs.volumes15).forEach(([key, vol]) => {
      flows[key] = toHourly(Number.isFinite(vol) ? vol : 0, basis);
    });

    const conflicting = computeConflictingFlows(flows);

    const criticalHeadways = {
      m4: 4.1 + 1.0 * hvFraction + 0 * grade - 0,
      m7: 7.1 + 1.0 * hvFraction + 0.2 * grade - 0.7,
      m9: 6.2 + 1.0 * hvFraction + 0.1 * grade - 0
    };

    const followUpHeadways = {
      m4: 2.2 + 0.9 * hvFraction,
      m7: 3.5 + 0.9 * hvFraction,
      m9: 3.3 + 0.9 * hvFraction
    };

    const cp4 = potentialCapacity(conflicting.vc4, criticalHeadways.m4, followUpHeadways.m4);
    const cp9 = potentialCapacity(conflicting.vc9, criticalHeadways.m9, followUpHeadways.m9);
    const cp7 = potentialCapacity(conflicting.vc7, criticalHeadways.m7, followUpHeadways.m7);

    const cm4 = cp4;
    const cm9 = cp9;
    const p0_4 = Number.isFinite(cm4) && cm4 > 0 ? Math.max(0, Math.min(1, 1 - (flows.v4 || 0) / cm4)) : NaN;
    const f7 = Number.isFinite(p0_4) ? p0_4 : NaN;
    const cm7 = Number.isFinite(cp7) && Number.isFinite(f7) ? cp7 * f7 : NaN;

    const vShared = (flows.v7 || 0) + (flows.v9 || 0);
    const sharedDenom = (flows.v7 || 0) / (cm7 || NaN) + (flows.v9 || 0) / (cm9 || NaN);
    const cShared = Number.isFinite(sharedDenom) && sharedDenom > 0 ? vShared / sharedDenom : NaN;

    const d4 = controlDelay(flows.v4 || 0, cm4, period);
    const dShared = controlDelay(vShared, cShared, period);

    const approachVolumes = {
      eastbound: (flows.v1 || 0) + (flows.v1u || 0) + (flows.v2 || 0) + (flows.v3 || 0),
      westbound: (flows.v4 || 0) + (flows.v4u || 0) + (flows.v5 || 0) + (flows.v6 || 0),
      northbound: vShared
    };

    const dApproachEB = 0; // Example assumes no delay to the major-street eastbound approach
    const dApproachWB = approachVolumes.westbound > 0 ? (d4 * (flows.v4 || 0)) / approachVolumes.westbound : 0;
    const dApproachNB = dShared;

    const totalApproachVol = approachVolumes.eastbound + approachVolumes.westbound + approachVolumes.northbound;
    const intersectionDelay = totalApproachVol > 0
      ? (dApproachEB * approachVolumes.eastbound + dApproachWB * approachVolumes.westbound + dApproachNB * approachVolumes.northbound) / totalApproachVol
      : 0;

    const q95_4 = queueLength95(flows.v4 || 0, cm4, period);
    const q95_nb = queueLength95(vShared, cShared, period);

    return {
      period,
      hvFraction,
      grade,
      basis,
      flows,
      volumes15: inputs.volumes15,
      conflicting,
      criticalHeadways,
      followUpHeadways,
      capacities: {
        cp4,
        cp7,
        cp9,
        cm4,
        cm7,
        cm9,
        p0_4,
        f7
      },
      sharedLane: {
        volume: vShared,
        capacity: cShared
      },
      delay: {
        d4,
        dShared,
        dApproachEB,
        dApproachWB,
        dApproachNB,
        intersection: intersectionDelay
      },
      approaches: approachVolumes,
      queue: {
        q95_4,
        q95_nb
      }
    };
  };

  const renderResults = (calc) => {
    const host = document.getElementById('twscResults');
    if (!host) return;

    const summaryCards = `
      <div class="metric-grid">
        <div class="metric-card">
          <span>Analysis period</span>
          <strong>${fmt2(calc.period)} hours (${calc.basis === 'hour' ? 'hourly inputs' : '15-min inputs'})</strong>
        </div>
        <div class="metric-card">
          <span>WB left-turn delay (d4)</span>
          <strong>${fmt1(calc.delay.d4)} s/veh / LOS ${losFromDelay(calc.delay.d4)}</strong>
        </div>
        <div class="metric-card">
          <span>Minor approach delay (shared NB lane)</span>
          <strong>${fmt1(calc.delay.dShared)} s/veh / LOS ${losFromDelay(calc.delay.dShared)}</strong>
        </div>
        <div class="metric-card">
          <span>Intersection control delay</span>
          <strong>${fmt1(calc.delay.intersection)} s/veh</strong>
        </div>
        <div class="metric-card">
          <span>Shared-lane capacity (NB)</span>
          <strong>${fmt0(calc.sharedLane.capacity)} veh/h</strong>
        </div>
        <div class="metric-card">
          <span>95th percentile queue</span>
          <strong>WB LT: ${fmt1(calc.queue.q95_4)} veh / NB: ${fmt1(calc.queue.q95_nb)} veh</strong>
        </div>
      </div>
    `;

    const flowGroups = [
      { title: 'EB (major)', keys: ['v1', 'v1u', 'v2', 'v3'] },
      { title: 'WB (major)', keys: ['v4', 'v4u', 'v5', 'v6'] },
      { title: 'NB (minor stop)', keys: ['v7', 'v9'] },
      { title: 'Other conflicts', keys: ['v13', 'v14', 'v15'] }
    ];

    const labels = {
      v1: 'EB left (v1)',
      v1u: 'EB U-turn (v1U)',
      v2: 'EB through (v2)',
      v3: 'EB right (v3)',
      v4: 'WB left (v4)',
      v4u: 'WB U-turn (v4U)',
      v5: 'WB through (v5)',
      v6: 'WB right (v6)',
      v7: 'Minor left (v7)',
      v9: 'Minor right (v9)',
      v13: 'Other conflicting (v13)',
      v14: 'Other conflicting (v14)',
      v15: 'Other conflicting (v15)'
    };

    const flowRows = flowGroups
      .map((group) => {
        const rows = group.keys
          .filter((key) => Object.prototype.hasOwnProperty.call(calc.flows, key))
          .map((key) => {
            const label = labels[key] || key;
            return `<tr><th scope="row">${label}</th><td>${fmt0(calc.volumes15[key])}</td><td>${fmt0(calc.flows[key])}</td></tr>`;
          })
          .join('');
        return `<tr class="group-row"><th colspan="3">${group.title}</th></tr>${rows}`;
      })
      .join('');

    const capRows = `
      <tr><th scope="row">Major LT (m4)</th><td>${fmt1(calc.criticalHeadways.m4)}</td><td>${fmt1(calc.followUpHeadways.m4)}</td><td>${fmt0(calc.capacities.cp4)}</td><td>${fmt0(calc.capacities.cm4)}</td></tr>
      <tr><th scope="row">Minor LT (m7)</th><td>${fmt1(calc.criticalHeadways.m7)}</td><td>${fmt1(calc.followUpHeadways.m7)}</td><td>${fmt0(calc.capacities.cp7)}</td><td>${fmt0(calc.capacities.cm7)}</td></tr>
      <tr><th scope="row">Minor RT (m9)</th><td>${fmt1(calc.criticalHeadways.m9)}</td><td>${fmt1(calc.followUpHeadways.m9)}</td><td>${fmt0(calc.capacities.cp9)}</td><td>${fmt0(calc.capacities.cm9)}</td></tr>
    `;

    host.innerHTML = `
      ${summaryCards}
      <div class="result-block">
        <h3>Step 1: Flow rates (veh/h)</h3>
        <p>${calc.basis === 'hour' ? 'Inputs are already hourly volumes.' : 'Each input volume is multiplied by 4 to convert the 15-min count to an hourly flow.'}</p>
        <table class="results-table">
          <thead>
            <tr><th>Movement</th><th>Input volume (${calc.basis === 'hour' ? 'veh/h' : 'veh/15-min'})</th><th>Flow rate (veh/h)</th></tr>
          </thead>
          <tbody>${flowRows}</tbody>
        </table>
      </div>
      <div class="result-block">
        <h3>Step 3: Conflicting flows</h3>
        <ul>
          <li>vc,4 (major LT): ${fmt0(calc.conflicting.vc4)} veh/h</li>
          <li>vc,9 (minor RT): ${fmt0(calc.conflicting.vc9)} veh/h</li>
          <li>vc,7 (minor LT): ${fmt0(calc.conflicting.vc7)} veh/h (Stage I: ${fmt0(calc.conflicting.stage1)}, Stage II: ${fmt0(calc.conflicting.stage2)})</li>
        </ul>
      </div>
      <div class="result-block">
        <h3>Steps 4-8: Headways and capacities</h3>
        <table class="results-table">
          <thead>
            <tr><th>Movement</th><th>Critical headway (s)</th><th>Follow-up headway (s)</th><th>Potential capacity cp (veh/h)</th><th>Movement capacity cm (veh/h)</th></tr>
          </thead>
          <tbody>${capRows}</tbody>
        </table>
        <p>p0,4 (queue-free probability for major LT) = ${fmt2(calc.capacities.p0_4)}, f7 (adjustment on minor LT) = ${fmt2(calc.capacities.f7)}.</p>
      </div>
      <div class="result-block">
        <h3>Steps 10-12: Shared lane and control delay</h3>
        <ul>
          <li>Shared NB lane volume = ${fmt0(calc.sharedLane.volume)} veh/h; capacity = ${fmt0(calc.sharedLane.capacity)} veh/h.</li>
          <li>WB LT delay d4 = ${fmt1(calc.delay.d4)} s/veh (LOS ${losFromDelay(calc.delay.d4)}).</li>
          <li>NB shared-lane delay = ${fmt1(calc.delay.dShared)} s/veh (LOS ${losFromDelay(calc.delay.dShared)}).</li>
          <li>WB approach delay = ${fmt1(calc.delay.dApproachWB)} s/veh; intersection delay = ${fmt1(calc.delay.intersection)} s/veh.</li>
        </ul>
      </div>
      <div class="result-block">
        <h3>Step 13: 95th percentile queues</h3>
        <ul>
          <li>WB left-turn (m4): ${fmt1(calc.queue.q95_4)} vehicles</li>
          <li>NB shared approach: ${fmt1(calc.queue.q95_nb)} vehicles</li>
        </ul>
      </div>
    `;
  };

  const collectInputs = () => {
    const basisEl = document.getElementById('volumeBasis');
    const basis = basisEl && basisEl.value === 'hour' ? 'hour' : '15min';
    const volumes15 = {};
    Object.entries(volumeFieldMap).forEach(([key, fieldId]) => {
      volumes15[key] = parseField(fieldId, DEFAULT_INPUTS.volumes15[key] || 0);
    });

    return {
      analysisPeriod: parseField('analysisPeriod', DEFAULT_INPUTS.analysisPeriod),
      hvPercent: parseField('heavyVehicles', DEFAULT_INPUTS.hvPercent),
      gradePercent: parseField('gradePercent', DEFAULT_INPUTS.gradePercent),
      volumeBasis: basis,
      volumes15
    };
  };

  const applyDefaults = () => {
    Object.entries(volumeFieldMap).forEach(([key, fieldId]) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = DEFAULT_INPUTS.volumes15[key];
    });
    const analysisPeriod = document.getElementById('analysisPeriod');
    const hv = document.getElementById('heavyVehicles');
    const grade = document.getElementById('gradePercent');
    if (analysisPeriod) analysisPeriod.value = DEFAULT_INPUTS.analysisPeriod;
    if (hv) hv.value = DEFAULT_INPUTS.hvPercent;
    if (grade) grade.value = DEFAULT_INPUTS.gradePercent;
    const basisEl = document.getElementById('volumeBasis');
    if (basisEl) basisEl.value = DEFAULT_INPUTS.volumeBasis;
  };

  document.addEventListener('DOMContentLoaded', () => {
    const calculateBtn = document.getElementById('calculateTwsc');
    const resetBtn = document.getElementById('resetTwscDefaults');

    const run = () => {
      const inputs = collectInputs();
      const result = computeTwsc(inputs);
      renderResults(result);
    };

    if (calculateBtn) {
      calculateBtn.addEventListener('click', run);
    }

    const analysisInput = document.getElementById('analysisPeriod');
    if (analysisInput) {
      analysisInput.addEventListener('input', run);
    }

    const basisSelect = document.getElementById('volumeBasis');
    if (basisSelect) {
      basisSelect.addEventListener('change', run);
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        applyDefaults();
        run();
      });
    }

    applyDefaults();
    run();
  });

  // Expose for quick console checks
  if (typeof window !== 'undefined') {
    window.twscCalculator = { computeTwsc, defaults: DEFAULT_INPUTS };
  }
})();
