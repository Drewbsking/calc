const bufferDistances = {
    20: 33,
    25: 50,
    30: 83,
    35: 132,
    40: 181,
    45: 230,
    50: 279,
    55: 329,
    60: 411,
    65: 476,
    70: 542,
    75: 625
};

const signDistances = {
    25: 250,
    30: 300,
    35: 350,
    40: 400,
    45: 450,
    50: 500,
    55: 550,
    60: 600,
    65: 650,
    70: 700,
    75: 750
};

function setSpeed(type, speed) {
    if (type === 'posted') {
        if (speed === 40) {
            showSpeedDialog();
        } else {
            document.getElementById('postedSpeed').value = speed;
            updateSpeedButtons('posted', speed);
        }

        updateWorkSpeedButtons(speed);
    } else if (type === 'work') {
        document.getElementById('workSpeed').value = speed;
        updateSpeedButtons('work', speed);
    }
}

function showSpeedDialog() {
    document.getElementById('speedDialog').style.display = 'block';
}

function hideSpeedDialog() {
    document.getElementById('speedDialog').style.display = 'none';
}

function confirmSpeed(speed) {
    document.getElementById('postedSpeed').value = speed;
    updateSpeedButtons('posted', speed);
    updateWorkSpeedButtons(speed);
    hideSpeedDialog();
}

function updateSpeedButtons(type, speed) {
    const buttons = document.querySelectorAll(`#${type === 'posted' ? 'postedSpeedButtons' : 'workSpeedButtons'} .speed-button`);
    buttons.forEach(button => button.classList.remove('selected'));
    buttons.forEach(button => {
        if (parseInt(button.innerText) === speed) {
            button.classList.add('selected');
        }
    });
}

function updateWorkSpeedButtons(postedSpeed) {
    if (postedSpeed <= 35) {
        document.getElementById('workSpeed').value = postedSpeed;
        updateSpeedButtons('work', postedSpeed);
        document.getElementById('workSpeedButtons').style.display = 'none';
    } else {
        document.getElementById('workSpeedButtons').style.display = 'flex';
        const workSpeedButtons = document.querySelectorAll('.work-speed');
        workSpeedButtons.forEach(button => {
            if (parseInt(button.dataset.speed) > postedSpeed) {
                button.style.display = 'none';
            } else {
                button.style.display = 'block';
            }
        });
    }
}

function roundUpToNearestFive(value) {
    return Math.ceil(value / 5) * 5;
}

function calculateTaperLength() {
    const w = parseFloat(document.getElementById('W').value);
    const postedSpeed = parseFloat(document.getElementById('postedSpeed').value);
    const workSpeed = parseFloat(document.getElementById('workSpeed').value);
    let formula, l, mergingL, shiftL, shoulderL;
    let workFormula, workL, workMergingL, workShiftL, workShoulderL;

    if (isNaN(w) || isNaN(postedSpeed) || isNaN(workSpeed) || w < 0 || postedSpeed < 0 || workSpeed < 0) {
        alert('Please enter valid non-negative numbers for W, Posted Speed, and Work Speed');
        return;
    }

    if (postedSpeed <= 40) {
        formula = 'L = (W * S^2) / 60 (Short)';
        l = (w * postedSpeed * postedSpeed) / 60;
    } else if (postedSpeed >= 45) {
        formula = 'L = W * S (Long)';
        l = w * postedSpeed;
    }

    mergingL = roundUpToNearestFive(Math.ceil(l));
    shiftL = roundUpToNearestFive(l / 2);
    shoulderL = roundUpToNearestFive(l / 3);

    if (workSpeed <= 40) {
        workFormula = 'L = (W * S^2) / 60 (Short)';
        workL = (w * workSpeed * workSpeed) / 60;
    } else if (workSpeed >= 45) {
        workFormula = 'L = W * S (Long)';
        workL = w * workSpeed;
    }

    workMergingL = roundUpToNearestFive(Math.ceil(workL));
    workShiftL = roundUpToNearestFive(workL / 2);
    workShoulderL = roundUpToNearestFive(workL / 3);

    const bufferDistance = bufferDistances[postedSpeed] || 'N/A';
    const bufferDistanceRounded = roundUpToNearestFive(bufferDistance);
    const signDistance = signDistances[postedSpeed] || 'N/A';
    const signDistanceRounded = 350; // Set sign distance rounded to 350 as per RCOC standard

    document.getElementById('formula').innerHTML = `
        <span>Formula Used: ${formula}, Calculated L: ${l.toFixed(2)}</span>
    `;
    document.getElementById('formulaDetails').innerHTML = `
        <p>W (width): ${w}</p>
        <p>Posted Speed: ${postedSpeed}</p>
        <p>Work Zone Speed: ${workSpeed}${postedSpeed <= 35 ? ' (same as posted speed for speeds <= 35 MPH)' : ''}</p>
    `;
    document.getElementById('result').innerHTML = `
        <table>
            <tr>
                <th>Type</th>
                <th>Posted Speed Minimum Values*</th>
                <th class="work-zone-speed">Work Zone Speed Minimum Values*</th>
            </tr>
            <tr>
                <td>Merging (L)<sup>*</sup></td>
                <td>${mergingL}</td>
                <td class="work-zone-speed">${workMergingL}</td>
            </tr>
            <tr>
                <td>Shift (L/2)</td>
                <td>${shiftL}</td>
                <td class="work-zone-speed">${workShiftL}</td>
            </tr>
            <tr>
                <td>Shoulder (L/3)</td>
                <td>${shoulderL}</td>
                <td class="work-zone-speed">${workShoulderL}</td>
            </tr>
            <tr>
                <td>Buffer Distance (B)</td>
                <td colspan="2">${bufferDistanceRounded} feet</td>
            </tr>
            <tr>
                <td>Sign Distance (D)</td>
                <td colspan="2">350 feet (Calculated ${signDistance} feet)</td>
            </tr>
        </table>
        <div class="note">
            *Values rounded up to the nearest multiple of 5. Sign distance (D) is an RCOC standard.<br>
            <sup>*</sup>Target arrows are not to be installed unless directed by the engineer.
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('W').addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            calculateTaperLength();
        }
    });
});
