function calculateSpeeds() {
  const distance = parseFloat(document.getElementById('distanceInput').value);
  const input = document.getElementById('timesInput').value;
  const times = input
    .split(',')
    .map((t) => parseFloat(t.trim()))
    .filter((n) => !Number.isNaN(n));

  if (Number.isNaN(distance) || distance <= 0 || times.length === 0) {
    alert('Please enter a positive distance and at least one valid time.');
    return;
  }

  const speeds = times.map((time) => distance / (time / 3600));
  const averageSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

  const ranges = [];
  for (let i = 0; i < speeds.length - 1; i += 1) {
    ranges.push(Math.abs(speeds[i + 1] - speeds[i]));
  }
  const rBar = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;

  const studyType = document.getElementById('studyType').value;
  let permittedError;
  switch (studyType) {
    case 'Transportation Planning and Highway Capacity Studies':
      permittedError = 3;
      break;
    case 'Traffic Operations':
    case 'Trend Analysis':
    case 'Economic Evaluations':
      permittedError = 2;
      break;
    case 'Before and After Studies':
      permittedError = 1;
      break;
    default:
      permittedError = 3;
  }

  const errorRange = [1, 2, 3, 4, 5];
  const sampleSizeTable = {
    2.5: [4, 3, 2, 2, 2],
    5.0: [8, 4, 3, 3, 2],
    10.0: [21, 8, 5, 4, 3],
    15.0: [38, 14, 8, 6, 5],
    20.0: [59, 21, 12, 8, 6],
  };

  let minSampleSize = times.length;
  for (const avgRange in sampleSizeTable) {
    if (Object.prototype.hasOwnProperty.call(sampleSizeTable, avgRange)) {
      if (rBar <= parseFloat(avgRange)) {
        const sampleSizes = sampleSizeTable[avgRange];
        minSampleSize = sampleSizes[errorRange.indexOf(permittedError)];
        break;
      }
    }
  }

  let results = `<h3>Type of Study: ${studyType}</h3>`;
  results += '<h3>Speeds for Each Run (mph):</h3>';
  speeds.forEach((speed, index) => {
    results += `<p>Run ${index + 1}: ${speed.toFixed(2)} mph</p>`;
  });
  results += `<h3>Average Speed: ${averageSpeed.toFixed(2)} mph</h3>`;
  results += `<h3>R Bar (Average Range): ${rBar.toFixed(2)} mph</h3>`;
  results += `<h3>Minimum Sample Size: ${minSampleSize}</h3>`;

  document.getElementById('results').innerHTML = results;

  if (times.length < minSampleSize) {
    const additionalRunsNeeded = minSampleSize - times.length;
    alert(`You need at least ${minSampleSize} runs. Add ${additionalRunsNeeded} more run(s).`);
  }
}
