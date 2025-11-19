function calculateDistance() {
  const initialVelocityMPH = parseFloat(document.getElementById('initial-velocity').value);
  const finalVelocityMPH = parseFloat(document.getElementById('final-velocity').value);
  const gForce = parseFloat(document.getElementById('g-force').value);
  const prTime = parseFloat(document.getElementById('pr-time').value) || 1.5;
  const gravity = 32.174; // ft/s²

  if ([initialVelocityMPH, finalVelocityMPH, gForce].some((n) => Number.isNaN(n) || n < 0)) {
    return;
  }

  const initialVelocityFPS = initialVelocityMPH * 1.467;
  const finalVelocityFPS = finalVelocityMPH * 1.467;

  const prDistance = initialVelocityFPS * prTime;

  const deceleration = gForce * gravity;
  const brakingDistance = Math.abs((Math.pow(finalVelocityFPS, 2) - Math.pow(initialVelocityFPS, 2)) / (2 * deceleration));

  const totalDistance = prDistance + brakingDistance;
  const textHeight = prDistance / 30;

  document.getElementById('pr-distance').textContent = `${prDistance.toFixed(2)} ft`;
  document.getElementById('distance-traveled').textContent = `${totalDistance.toFixed(2)} ft`;
  document.getElementById('text-height').textContent = `${textHeight.toFixed(2)} ft`;
}

document.addEventListener('DOMContentLoaded', calculateDistance);
