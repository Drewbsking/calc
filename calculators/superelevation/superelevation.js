document.addEventListener('DOMContentLoaded', () => {
  const frictionTable = [
    { speed: 10, f: 0.18 },
    { speed: 20, f: 0.16 },
    { speed: 25, f: 0.15 },
    { speed: 30, f: 0.14 },
    { speed: 35, f: 0.13 },
    { speed: 40, f: 0.12 },
    { speed: 45, f: 0.12 },
    { speed: 50, f: 0.11 },
    { speed: 55, f: 0.10 },
    { speed: 60, f: 0.10 },
    { speed: 65, f: 0.095 },
    { speed: 70, f: 0.09 },
  ];

  const formatNumber = (value, digits = 2) => value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const getDesignFriction = (speed) => {
    const sorted = [...frictionTable].sort((a, b) => a.speed - b.speed);
    let chosen = sorted[0].f;
    sorted.forEach((row) => {
      if (speed >= row.speed) {
        chosen = row.f;
      }
    });
    return chosen;
  };

  const renderFrictionTable = () => {
    const rows = frictionTable.map((row) => `
      <tr>
        <td>${row.speed}</td>
        <td>${formatNumber(row.f, 3)}</td>
      </tr>
    `).join('');

    document.getElementById('seTable').innerHTML = `
      <table>
        <thead>
          <tr>
            <th scope="col">Speed (mph)</th>
            <th scope="col">Design f (decimal)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  const calculateSuperelevation = () => {
    const speed = parseFloat(document.getElementById('seSpeed').value);
    const radius = parseFloat(document.getElementById('seRadius').value);
    const maxEPercent = parseFloat(document.getElementById('seMaxE').value);
    const frictionMode = document.getElementById('seFrictionMode').value;
    const customFInput = document.getElementById('seCustomF').value;
    const resultEl = document.getElementById('seResult');
    const noteEl = document.getElementById('seNote');

    resultEl.textContent = '';
    noteEl.textContent = '';

    if (Number.isNaN(speed) || speed <= 0 || Number.isNaN(radius) || radius <= 0 || Number.isNaN(maxEPercent) || maxEPercent <= 0) {
      resultEl.textContent = 'Enter valid speed, radius, and maximum superelevation.';
      return;
    }

    const eMax = maxEPercent / 100;

    let fDesign;
    if (frictionMode === 'table') {
      fDesign = getDesignFriction(speed);
    } else {
      const customF = parseFloat(customFInput);
      if (Number.isNaN(customF) || customF <= 0) {
        resultEl.textContent = 'Enter a custom f value (decimal).';
        return;
      }
      fDesign = customF;
    }

    const demand = (speed ** 2) / (15 * radius); // e + f needed
    const eRequired = Math.max(0, demand - fDesign);
    const eAdopted = Math.min(eRequired, eMax);
    const fUsed = Math.max(0, demand - eAdopted);

    const deficit = eRequired > eMax ? eRequired - eMax : 0;
    const frictionOveruse = fUsed - fDesign;

    const minRadiusWithMaxE = (speed ** 2) / (15 * (eMax + fDesign));

    const frictionStatus = frictionOveruse > 0.0001
      ? `Friction demand exceeds design f by ${formatNumber(frictionOveruse * 100, 2)}%.`
      : 'Friction demand is within design f.';

    resultEl.innerHTML = `
      <strong>Required e:</strong> ${formatNumber(eRequired * 100, 2)}%<br>
      <strong>Adopted e (capped):</strong> ${formatNumber(eAdopted * 100, 2)}% ${deficit > 0 ? `(short by ${formatNumber(deficit * 100, 2)}%)` : ''}<br>
      <span class="helper-text">Demand e + f = ${formatNumber(demand, 3)} | f used = ${formatNumber(fUsed, 3)} (design f = ${formatNumber(fDesign, 3)})</span>
      <span class="helper-text">${frictionStatus}</span>
      <span class="helper-text">Minimum radius with e_max ${formatNumber(eMax * 100, 1)}% and design f ${formatNumber(fDesign, 3)}: ${formatNumber(minRadiusWithMaxE, 1)} ft</span>
    `;

    noteEl.textContent = deficit > 0
      ? 'Required e exceeds e_max; consider larger radius, lower speed, or agency-approved higher e.'
      : '';
  };

  document.getElementById('calcSuperelevation').addEventListener('click', calculateSuperelevation);
  document.getElementById('seFrictionMode').addEventListener('change', (event) => {
    const wrapper = document.getElementById('customFWrapper');
    if (event.target.value === 'custom') {
      wrapper.classList.remove('hidden');
    } else {
      wrapper.classList.add('hidden');
    }
  });

  renderFrictionTable();
});
