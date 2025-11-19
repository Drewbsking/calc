function updateWidthLabel(value) {
  document.getElementById('widthValue').innerText = `${value} inches`;
}

const legendMaterial = {
    AHEAD: 28.86,
    BIKE: 22.15,
    BUS: 18.55,
    CANADA: 32.87,
    EAST: 21.71,
    EXIT: 17.76,
    LANE: 22.30,
    LEFT: 19.11,
    MERGE: 33.28,
    NO: 12.92,
    NORTH: 29.53,
    ONLY: 20.90,
    PED: 17.63,
    RIGHT: 25.10,
    SCHOOL: 32.58,
    SOUTH: 27.83,
    STOP: 21.50,
    TO: 10.43,
    TRAIL: 22.10,
    TURN: 23.04,
    WEST: 24.42,
    XING: 20.13,
    YIELD: 22.91
};

const symbolMaterial = {
    ACCESSIBLE: 11.11,
    BICYCLE_ROAD: 10.54,
    BICYCLE_LANE_PATH: 5.93,
    BIKE_TURN_ARROW_LT_OR_RT: 4.11,
    DEDICATED_LANE_HOV: 10.24,
    DIRECT_ARROW_BIKE: 5.07,
    LEFT_RIGHT_ARROW: 28.99,
    LT_ROUNDABOUT_ARROW: 17.48,
    LT_RT_THRU_ARROW: 40.26,
    MERGE_ARROW: 42.17,
    RAILROAD: 60.89,
    RAILROAD_ALTERNATE: 59.06,
    RT_LT_ROUNDABOUT_ARROW: 22.19,
    RT_THRU_LT_ROUNDABOUT_ARROW: 28.31,
    SHARROW: 9.26,
    THRU_ARROW: 13.16,
    THRU_LT_TURN_ARROW: 23.60,
    THRU_LT_TURN_ARROW_BOTH: 28.14,
    TURN_ARROW_LT_OR_RT: 16.42,
    WRONG_WAY_ARROW: 56.54,
    YIELD_TRIANGLE: 3.00
};

function calculate() {
  const material = document.getElementById('material').value;
  const width = parseFloat(document.getElementById('width').value);
  const feetPainted = parseFloat(document.getElementById('feet').value);

  if (!material || Number.isNaN(width) || Number.isNaN(feetPainted) || feetPainted <= 0) {
    document.getElementById('result').classList.add('hidden');
    return;
  }

  let binder;
  let beads;
  let minThickness;
  let minThicknessBeads;
  if (material === 'waterborne') {
    binder = 16.5;
    beads = 132;
    minThickness = 15;
    minThicknessBeads = 20;
  } else if (material === 'regularWaterborne') {
    binder = 16.0;
    beads = 96;
    minThickness = 15;
    minThicknessBeads = 20;
  } else if (material === 'sprayableThermoplastic') {
    binder = 560;
    beads = 200;
    minThickness = 30;
    minThicknessBeads = 40;
  } else {
    return;
  }

  const adjustedBinderPerMile = binder * (width / 4);
  const adjustedBeadsPerMile = beads * (width / 4);

  const gallonsPerMile = material === 'sprayableThermoplastic' ? 0 : adjustedBinderPerMile;
  const lbsPerMile = material === 'sprayableThermoplastic' ? adjustedBinderPerMile : 0;
  const beadsPerMile = adjustedBeadsPerMile;

  const materialGallonsUsed = (gallonsPerMile / 5280) * feetPainted;
  const materialLbsUsed = (lbsPerMile / 5280) * feetPainted;
  const beadLbsUsed = (beadsPerMile / 5280) * feetPainted;

  document.getElementById('thickness').innerText = `Minimum Dry Thickness: ${minThickness} mils`;
  document.getElementById('thicknessBeads').innerText = `Minimum Dry Thickness with Beads: ${minThicknessBeads} mils`;
  document.getElementById('gallonsPerMile').innerText = `Gallons of Paint per Mile: ${gallonsPerMile.toFixed(2)}`;
  document.getElementById('lbsPerMile').innerText = `Pounds of Paint per Mile: ${lbsPerMile.toFixed(2)}`;
  document.getElementById('beadsPerMile').innerText = `Pounds of Beads per Mile: ${beadsPerMile.toFixed(2)}`;

  document.getElementById('materialGallons').innerText = `Gallons of Paint Used: ${materialGallonsUsed.toFixed(2)}`;
  document.getElementById('materialLbs').innerText = `Pounds of Paint Used: ${materialLbsUsed.toFixed(2)}`;
  document.getElementById('beadsUsed').innerText = `Pounds of Beads Used: ${beadLbsUsed.toFixed(2)}`;

  const squareFeetPerMile = 5280 * (width / 12);
  const gallonsPerSFT = gallonsPerMile / squareFeetPerMile || 0;
  const lbsPerSFT = lbsPerMile / squareFeetPerMile || 0;
  const beadsPerSFT = beadsPerMile / squareFeetPerMile || 0;

  let totalSpecialMarkings = 0;
  for (const legend in legendMaterial) {
    const qty = parseFloat(document.getElementById(legend)?.value || 0);
    totalSpecialMarkings += qty * legendMaterial[legend];
  }
  for (const symbol in symbolMaterial) {
    const qty = parseFloat(document.getElementById(symbol)?.value || 0);
    totalSpecialMarkings += qty * symbolMaterial[symbol];
  }

  const totalGallonsForSpecialMarkings = totalSpecialMarkings * gallonsPerSFT;
  const totalLbsForSpecialMarkings = totalSpecialMarkings * lbsPerSFT;
  const totalBeadsForSpecialMarkings = totalSpecialMarkings * beadsPerSFT;

  document.getElementById('specialMarkings').innerText = `Total Special Markings Quantity (sq ft): ${totalSpecialMarkings.toFixed(2)}`;
  document.getElementById('specialGallonsUsed').innerText = `Gallons of Paint Used for Special Markings: ${totalGallonsForSpecialMarkings.toFixed(2)}`;
  document.getElementById('specialLbsUsed').innerText = `Pounds of Paint Used for Special Markings: ${totalLbsForSpecialMarkings.toFixed(2)}`;
  document.getElementById('specialBeadsUsed').innerText = `Pounds of Beads Used for Special Markings: ${totalBeadsForSpecialMarkings.toFixed(2)}`;

  document.getElementById('result').classList.remove('hidden');
}


function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const projectName = document.getElementById('projectName').value || 'Unnamed Project';
  const projectNumber = document.getElementById('projectNumber').value || 'No Number';
  doc.text(`Project Name: ${projectName}`, 10, 10);
  doc.text(`Project Number: ${projectNumber}`, 10, 20);

  const results = [
    document.getElementById('thickness').innerText,
    document.getElementById('thicknessBeads').innerText,
    document.getElementById('gallonsPerMile').innerText,
    document.getElementById('lbsPerMile').innerText,
    document.getElementById('beadsPerMile').innerText,
    document.getElementById('materialGallons').innerText,
    document.getElementById('materialLbs').innerText,
    document.getElementById('beadsUsed').innerText,
    document.getElementById('specialMarkings').innerText,
    document.getElementById('specialGallonsUsed').innerText,
    document.getElementById('specialLbsUsed').innerText,
    document.getElementById('specialBeadsUsed').innerText
  ];

  let yPosition = 30;
  results.forEach((text) => {
    doc.text(text, 10, yPosition);
    yPosition += 10;
  });

  doc.save(`${projectName}_report.pdf`);
}
