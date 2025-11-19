function setSpeed(speed, buttonEl) {
  document.getElementById('S').value = speed;
  const buttons = document.querySelectorAll('.speed-button');
  buttons.forEach((btn) => btn.classList.remove('selected'));
  if (buttonEl) {
    buttonEl.classList.add('selected');
  }
}

function calculateTaperLength() {
  const w = parseFloat(document.getElementById('W').value);
  const s = parseFloat(document.getElementById('S').value);
  let formula;
  let l;

  if (Number.isNaN(w) || Number.isNaN(s) || w < 0 || s < 0) {
    alert('Please enter valid non-negative numbers for W and S');
    return;
  }

  if (s <= 40) {
    formula = 'Formula Used: L = (W * S^2) / 60 (Short)';
    l = (w * s * s) / 60;
  } else if (s >= 45) {
    formula = 'Formula Used: L = W * S (Long)';
    l = w * s;
  } else {
    alert('Speed must be 40 or below or 45 and above for these formulas.');
    return;
  }

  const designL = Math.ceil(l);
  const halfDesignL = designL / 2;
  const l2ShiftOnly = Math.round(halfDesignL / 5) * 5;

  document.getElementById('result').innerHTML = `
    ${formula}<br>
    Calculated L = ${l.toFixed(2)}<br>
    Design L = ${designL}<br>
    L/2 Shift only* = ${l2ShiftOnly}
  `;
  document.getElementById('note').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('W').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      calculateTaperLength();
    }
  });
});
