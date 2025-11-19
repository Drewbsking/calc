function calculateLOS() {
    const trafficVolume = 1900;  // Default traffic volume (V)
    const percentTrucks = parseFloat(document.getElementById('percentTrucks').value) / 100;
    const percentRVs = parseFloat(document.getElementById('percentRVs').value) / 100;
    const gradeLengthFt = parseFloat(document.getElementById('gradeLength').value);
    const gradePercent = parseFloat(document.getElementById('gradePercent').value);
    const laneWidth = parseFloat(document.getElementById('laneWidth').value);
    const shoulderWidth = parseFloat(document.getElementById('shoulderWidth').value);
    const accessPoints = parseFloat(document.getElementById('accessPoints').value);
    const PHF = parseFloat(document.getElementById('PHF').value);
    const freeFlowSpeed = parseFloat(document.getElementById('freeFlowSpeed').value);
    const numLanes = 2;  // Assuming two lanes as per the problem statement

    let stepsOutput = '';

    // Step 1: Convert grade length from feet to miles
    const gradeLengthMiles = gradeLengthFt / 5280;
    stepsOutput += `<div class="step"><strong>Step 1: Convert grade length from feet to miles:</strong>
                    <p class="formula">Grade Length (miles) = Grade Length (ft) / 5280<br>
                    Grade Length (miles) = ${gradeLengthFt} / 5280<br>
                    Grade Length (miles) = ${gradeLengthMiles.toFixed(4)} miles</p></div>`;

    // Step 2: Look up upgrade ET and ER values from the upgrade tables
    const ET_Upgrade = getETValue(gradePercent, gradeLengthMiles, percentTrucks * 100);
    stepsOutput += `<div class="step"><strong>Step 2a: Look up upgrade ET value:</strong>
                    <p class="formula">ET = ${ET_Upgrade}</p></div>`;

    const ER_Upgrade = getERValue(gradePercent, gradeLengthMiles, percentRVs * 100);
    stepsOutput += `<div class="step"><strong>Step 2b: Look up upgrade ER value:</strong>
                    <p class="formula">ER = ${ER_Upgrade}</p></div>`;

    // Step 3: Calculate the HV factor for upgrade
    const fHV_Upgrade = 1 / (1 + percentTrucks * (ET_Upgrade - 1) + percentRVs * (ER_Upgrade - 1));
    stepsOutput += `<div class="step"><strong>Step 3: Calculate the HV factor for upgrade:</strong>
                    <p class="formula">f<sub>HV</sub> = 1 / (1 + PT × (ET - 1) + PR × (ER - 1))<br>
                    f<sub>HV</sub> = 1 / (1 + ${percentTrucks} × (${ET_Upgrade} - 1) + ${percentRVs} × (${ER_Upgrade} - 1))<br>
                    f<sub>HV</sub> = ${fHV_Upgrade.toFixed(4)}</p></div>`;

    // Step 4: Look up downgrade ET and ER values from the downgrade tables
    const ET_Downgrade = getETValue(gradePercent, gradeLengthMiles, percentTrucks * 100, 'downgrade');
    stepsOutput += `<div class="step"><strong>Step 4a: Look up downgrade ET value:</strong>
                    <p class="formula">ET = ${ET_Downgrade}</p></div>`;

    const ER_Downgrade = 1.2; // Fixed value for downgrades
    stepsOutput += `<div class="step"><strong>Step 4b: Look up downgrade ER value (fixed):</strong>
                    <p class="formula">ER = ${ER_Downgrade}</p></div>`;

    // Step 5: Calculate the HV factor for downgrade
    const fHV_Downgrade = 1 / (1 + percentTrucks * (ET_Downgrade - 1) + percentRVs * (ER_Downgrade - 1));
    stepsOutput += `<div class="step"><strong>Step 5: Calculate the HV factor for downgrade:</strong>
                    <p class="formula">f<sub>HV</sub> = 1 / (1 + PT × (ET - 1) + PR × (ER - 1))<br>
                    f<sub>HV</sub> = 1 / (1 + ${percentTrucks} × (${ET_Downgrade} - 1) + ${percentRVs} × (${ER_Downgrade} - 1))<br>
                    f<sub>HV</sub> = ${fHV_Downgrade.toFixed(4)}</p></div>`;

    // Step 6: Calculate demand flow rate (vp) using the provided formula for both upgrade and downgrade
    const fp = 1.0;  // Assuming fp = 1 for familiar drivers
    const vp_Upgrade = trafficVolume / (PHF * numLanes * fHV_Upgrade * fp);
    stepsOutput += `<div class="step"><strong>Step 6a: Calculate demand flow rate (v<sub>p</sub>) for upgrade:</strong>
                    <p class="formula">v<sub>p</sub> = V / (PHF × N × f<sub>HV</sub> × f<sub>p</sub>)<br>
                    v<sub>p</sub> = ${trafficVolume} / (${PHF} × ${numLanes} × ${fHV_Upgrade.toFixed(4)} × ${fp})<br>
                    v<sub>p</sub> = ${vp_Upgrade.toFixed(2)} pcphpl</p></div>`;

    const vp_Downgrade = trafficVolume / (PHF * numLanes * fHV_Downgrade * fp);
    stepsOutput += `<div class="step"><strong>Step 6b: Calculate demand flow rate (v<sub>p</sub>) for downgrade:</strong>
                    <p class="formula">v<sub>p</sub> = V / (PHF × N × f<sub>HV</sub> × f<sub>p</sub>)<br>
                    v<sub>p</sub> = ${trafficVolume} / (${PHF} × ${numLanes} × ${fHV_Downgrade.toFixed(4)} × ${fp})<br>
                    v<sub>p</sub> = ${vp_Downgrade.toFixed(2)} pcphpl</p></div>`;

    // Step 7: Calculate density (D) for both upgrade and downgrade
    const D_Upgrade = vp_Upgrade / freeFlowSpeed;
    stepsOutput += `<div class="step"><strong>Step 7a: Calculate density (D) for upgrade:</strong>
                    <p class="formula">D = v<sub>p</sub> / FFS<br>
                    D = ${vp_Upgrade.toFixed(2)} / ${freeFlowSpeed}<br>
                    D = ${D_Upgrade.toFixed(2)} vehicles per mile</p></div>`;

    const D_Downgrade = vp_Downgrade / freeFlowSpeed;
    stepsOutput += `<div class="step"><strong>Step 7b: Calculate density (D) for downgrade:</strong>
                    <p class="formula">D = v<sub>p</sub> / FFS<br>
                    D = ${vp_Downgrade.toFixed(2)} / ${freeFlowSpeed}<br>
                    D = ${D_Downgrade.toFixed(2)} vehicles per mile</p></div>`;

    // Step 8: Determine LOS based on density
    const LOS_Upgrade = getLOS(D_Upgrade, freeFlowSpeed);
    const LOS_Downgrade = getLOS(D_Downgrade, freeFlowSpeed);

    stepsOutput += `<div class="step"><strong>Step 8a: Determine LOS for upgrade:</strong>
                    <p class="formula">LOS = ${LOS_Upgrade}</p></div>`;

    stepsOutput += `<div class="step"><strong>Step 8b: Determine LOS for downgrade:</strong>
                    <p class="formula">LOS = ${LOS_Downgrade}</p></div>`;

    document.getElementById('result').innerText = `The Level of Service (LOS) on the 3200 ft long grade is Upgrade: ${LOS_Upgrade}, Downgrade: ${LOS_Downgrade}.`;
    document.getElementById('steps').innerHTML = stepsOutput;
}

function getETValue(gradePercent, gradeLengthMiles, percentTrucks, type = 'upgrade') {
    const table = type === 'upgrade' ? etUpgradeTable : erDowngradeTable;
    // Determine the appropriate range for gradePercent
    let gradeRange;
    if (gradePercent < 2) {
        return 1.5; // ET value for grades < 2%
    } else if (gradePercent >= 2 && gradePercent < 3) {
        gradeRange = '2-3';
    } else if (gradePercent >= 3 && gradePercent < 4) {
        gradeRange = '3-4';
    } else if (gradePercent >= 4 && gradePercent < 5) {
        gradeRange = '4-5';
    } else if (gradePercent >= 5 && gradePercent < 6) {
        gradeRange = '5-6';
    } else {
        gradeRange = '>6';
    }

    // Determine the appropriate length range for gradeLengthMiles
    let lengthRange;
    if (gradeLengthMiles <= 0.25) {
        lengthRange = '0.00-0.25';
    } else if (gradeLengthMiles <= 0.5) {
        lengthRange = '0.25-0.50';
    } else if (gradeLengthMiles <= 0.75) {
        lengthRange = '0.50-0.75';
    } else if (gradeLengthMiles <= 1.0) {
        lengthRange = '0.75-1.00';
    } else if (gradeLengthMiles <= 1.5) {
        lengthRange = '1.00-1.50';
    } else {
        lengthRange = '>1.50';
    }

    // Find the closest truck percentage in the table
    const truckPercents = [2, 4, 5, 6, 8, 10, 15, 20, 25];
    let closestTruckPercent = truckPercents.reduce((prev, curr) =>
        Math.abs(curr - percentTrucks) < Math.abs(prev - percentTrucks) ? curr : prev);

    console.log(`gradeRange: ${gradeRange}, lengthRange: ${lengthRange}, closestTruckPercent: ${closestTruckPercent}`);

    // Check if the keys exist before accessing
    if (table[gradeRange] && table[gradeRange][lengthRange] && table[gradeRange][lengthRange][closestTruckPercent] !== undefined) {
        return table[gradeRange][lengthRange][closestTruckPercent];
    } else {
        console.error(`Invalid key access: gradeRange=${gradeRange}, lengthRange=${lengthRange}, closestTruckPercent=${closestTruckPercent}`);
        return 1.5; // Default value if key is invalid
    }
}

function getERValue(gradePercent, gradeLengthMiles, percentRVs, type = 'upgrade') {
    const table = type === 'upgrade' ? erUpgradeTable : erDowngradeTable;
    // Determine the appropriate range for gradePercent
    let gradeRange;
    if (gradePercent < 2) {
        return 1.2; // ER value for grades < 2%
    } else if (gradePercent >= 2 && gradePercent < 3) {
        gradeRange = '2-3';
    } else if (gradePercent >= 3 && gradePercent < 4) {
        gradeRange = '3-4';
    } else if (gradePercent >= 4 && gradePercent < 5) {
        gradeRange = '4-5';
    } else {
        gradeRange = '>5';
    }

    // Determine the appropriate length range for gradeLengthMiles
    let lengthRange;
    if (gradeLengthMiles <= 0.25) {
        lengthRange = '0.00-0.25';
    } else if (gradeLengthMiles <= 0.5) {
        lengthRange = '0.25-0.50';
    } else {
        lengthRange = '>0.50';
    }

    // Find the closest RV percentage in the table
    const rvPercents = [2, 4, 5, 6, 8, 10, 15, 20, 25];
    let closestRvPercent = rvPercents.reduce((prev, curr) =>
        Math.abs(curr - percentRVs) < Math.abs(prev - percentRVs) ? curr : prev);

    console.log(`gradeRange: ${gradeRange}, lengthRange: ${lengthRange}, closestRvPercent: ${closestRvPercent}`);

    // Check if the keys exist before accessing
    if (table[gradeRange] && table[gradeRange][lengthRange] && table[gradeRange][lengthRange][closestRvPercent] !== undefined) {
        return table[gradeRange][lengthRange][closestRvPercent];
    } else {
        console.error(`Invalid key access: gradeRange=${gradeRange}, lengthRange=${lengthRange}, closestRvPercent=${closestRvPercent}`);
        return 1.2; // Default value if key is invalid
    }
}

function getLOS(density, freeFlowSpeed) {
    for (const entry of losTable) {
        if ((entry.FFS === 'All' || entry.FFS == freeFlowSpeed) &&
            density > entry.Density[0] && density <= entry.Density[1]) {
            return entry.LOS;
        }
    }
    return 'F';  // Default to 'F' if no match found
}
