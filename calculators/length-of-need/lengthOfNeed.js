document.addEventListener('DOMContentLoaded', () => {
  const runoutLengths = {
    rural: [
      { max: 30, length: 150 },
      { max: 40, length: 200 },
      { max: 50, length: 250 },
      { max: 60, length: 300 },
      { max: 70, length: 350 },
      { max: 120, length: 400 },
    ],
    urban: [
      { max: 30, length: 125 },
      { max: 40, length: 170 },
      { max: 50, length: 220 },
      { max: 60, length: 260 },
      { max: 70, length: 300 },
      { max: 120, length: 320 },
    ],
  };

  const formatNumber = (value) => value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const pickRunout = (speed, context) => {
    const table = runoutLengths[context] || runoutLengths.rural;
    const entry = table.find((row) => speed <= row.max) || table[table.length - 1];
    return entry.length;
  };

  const defaultAngle = (speed) => (speed >= 50 ? 15 : 20);

  const renderRunoutTable = () => {
    const speeds = ['≤30', '40', '50', '60', '70+'];
    const rows = speeds.map((label, idx) => {
      const ruralVal = runoutLengths.rural[Math.min(idx, runoutLengths.rural.length - 2)].length;
      const urbanVal = runoutLengths.urban[Math.min(idx, runoutLengths.urban.length - 2)].length;
      return `
        <tr>
          <td>${label} mph</td>
          <td>${ruralVal}</td>
          <td>${urbanVal}</td>
        </tr>
      `;
    }).join('');

    document.getElementById('lonTable').innerHTML = `
      <table>
        <thead>
          <tr>
            <th scope="col">Speed band</th>
            <th scope="col">Rural / high-speed</th>
            <th scope="col">Urban / low-speed</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  const calcLengthOfNeed = () => {
    const speed = parseFloat(document.getElementById('lonSpeed').value);
    const context = document.getElementById('lonContext').value;
    const hazardOffset = parseFloat(document.getElementById('lonHazardOffset').value);
    const barrierOffset = parseFloat(document.getElementById('lonBarrierOffset').value);
    const hazardLength = parseFloat(document.getElementById('lonHazardLength').value);
    const deflection = parseFloat(document.getElementById('lonDeflection').value);
    const angleInput = document.getElementById('lonAngle').value;
    const resultEl = document.getElementById('lonResult');
    const noteEl = document.getElementById('lonNote');

    resultEl.textContent = '';
    noteEl.textContent = '';

    if ([speed, hazardOffset, barrierOffset, hazardLength, deflection].some((v) => Number.isNaN(v) || v < 0)) {
      resultEl.textContent = 'Enter non-negative values for speed, offsets, lengths, and deflection.';
      return;
    }
    if (hazardLength === 0) {
      resultEl.textContent = 'Hazard length cannot be zero.';
      return;
    }

    const angleDeg = angleInput ? parseFloat(angleInput) : defaultAngle(speed);
    if (Number.isNaN(angleDeg) || angleDeg <= 0 || angleDeg >= 89) {
      resultEl.textContent = 'Enter a valid departure angle (deg).';
      return;
    }

    const angleRad = (angleDeg * Math.PI) / 180;
    const effectiveBarrierOffset = Math.max(0, barrierOffset - deflection);
    const lateralGap = hazardOffset - effectiveBarrierOffset;
    const upstreamNeed = lateralGap > 0 ? lateralGap / Math.tan(angleRad) : 0;
    const lengthOfNeed = hazardLength + upstreamNeed;

    const runout = pickRunout(speed, context);
    const exceedsRunout = lengthOfNeed > runout;

    resultEl.innerHTML = `
      <strong>Length of need:</strong> ${formatNumber(lengthOfNeed)} ft
      <span class="helper-text">Upstream coverage: ${formatNumber(upstreamNeed)} ft | Hazard length: ${formatNumber(hazardLength)} ft</span>
      <span class="helper-text">Angle: ${formatNumber(angleDeg)}° | Effective barrier offset: ${formatNumber(effectiveBarrierOffset)} ft | Lateral gap to cover: ${formatNumber(Math.max(lateralGap, 0))} ft</span>
      <span class="helper-text">Runout length (${context}): ${runout} ft${exceedsRunout ? ' — LON exceeds runout, consider extending upstream or revising placement.' : ''}</span>
    `;

    noteEl.textContent = '';
  };

  document.getElementById('calcLon').addEventListener('click', calcLengthOfNeed);
  renderRunoutTable();
});
