document.addEventListener('DOMContentLoaded', () => {
  const formatYesNo = (condition) => condition
    ? '<span class="pill ok">Likely meets</span>'
    : '<span class="pill warn">Not met</span>';

  const evaluate = () => {
    const type = document.getElementById('warrantType').value;
    const crashes = parseFloat(document.getElementById('crashes').value) || 0;
    const majorVph = parseFloat(document.getElementById('majorVph').value) || 0;
    const minorVph = parseFloat(document.getElementById('minorVph').value) || 0;
    const majorSpeed = parseFloat(document.getElementById('majorSpeed').value) || 0;

    const volThresholdMajor = parseFloat(document.getElementById('volumeThresholdMajor').value) || 0;
    const volThresholdMinor = parseFloat(document.getElementById('volumeThresholdMinor').value) || 0;
    const crashThreshold = parseFloat(document.getElementById('crashThreshold').value) || 0;

    const sightIssue = document.getElementById('sightIssue').checked;
    const pedBike = document.getElementById('pedBike').checked;
    const transition = document.getElementById('transition').checked;

    const crashWarrant = crashes >= crashThreshold && crashThreshold > 0;
    const volumeWarrant = majorVph >= volThresholdMajor && minorVph >= volThresholdMinor;
    const speedContext = majorSpeed >= 40;
    const contextFlags = sightIssue || pedBike || transition;

    const resultEl = document.getElementById('warrantResult');
    const detailEl = document.getElementById('warrantDetails');

    if (type === 'multiway') {
      const meetsAny = crashWarrant || volumeWarrant || contextFlags;
      resultEl.innerHTML = `
        <div>${meetsAny ? '<span class="pill ok">Multi-way stop likely supportable</span>' : '<span class="pill warn">Multi-way not met</span>'}</div>
        <div class="helper-text">Crash: ${formatYesNo(crashWarrant)} | Volume: ${formatYesNo(volumeWarrant)} | Context: ${contextFlags ? '<span class="pill info">Context supports</span>' : '<span class="pill warn">No context flags</span>'}</div>
      `;
      detailEl.innerHTML = `
        Crash count: ${crashes} (threshold ${crashThreshold})<br>
        Volumes: major ${majorVph} vph (threshold ${volThresholdMajor}), minor ${minorVph} vph (threshold ${volThresholdMinor})<br>
        Speed/context: ${speedContext ? '40+ mph major' : 'under 40 mph'}; sight/ped/transition flags: ${contextFlags ? 'yes' : 'no'}
      `;
    } else {
      // two-way stop focus
      const minorNeedsStop = sightIssue || pedBike || transition || speedContext || volumeWarrant || crashWarrant;
      const considerMultiway = crashWarrant || (volumeWarrant && minorVph >= volThresholdMinor);

      resultEl.innerHTML = `
        <div>${minorNeedsStop ? '<span class="pill ok">Minor-street stop warranted</span>' : '<span class="pill warn">Minor-street stop not indicated</span>'}</div>
        <div class="helper-text">Crash: ${formatYesNo(crashWarrant)} | Volume balance: ${formatYesNo(volumeWarrant)} | Sight/ped/speed: ${contextFlags || speedContext ? '<span class="pill info">Context supports</span>' : '<span class="pill warn">No context flags</span>'}</div>
      `;
      detailEl.innerHTML = `
        Consider multi-way? ${considerMultiway ? 'Yes, crash/volume warrants suggest checking multi-way.' : 'Likely two-way only.'}<br>
        Crash count: ${crashes} (threshold ${crashThreshold}); speeds: ${majorSpeed} mph; flags: ${contextFlags ? 'yes' : 'no'}<br>
        Volumes (8-hr): major ${majorVph} vph (threshold ${volThresholdMajor}), minor ${minorVph} vph (threshold ${volThresholdMinor})
      `;
    }
  };

  document.getElementById('calcWarrant').addEventListener('click', evaluate);
});
