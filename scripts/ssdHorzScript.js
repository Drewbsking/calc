document.addEventListener("DOMContentLoaded", function () {
  toggleInputFields(); // Set the default display
});

function toggleInputFields() {
  const inputType = document.getElementById("inputType").value;
  const speedInput = document.getElementById("speedInput");
  const sightDistanceInput = document.getElementById("sightDistanceInput");
  const gradeInput = document.getElementById("gradeInput");
  const radiusInput = document.getElementById("radius");
  const decelRateInput = document.getElementById("decelRateInput"); // Entire container

  if (inputType === "speed") {
    speedInput.style.display = "block";
    sightDistanceInput.style.display = "none";
    gradeInput.style.display = "block";
    radiusInput.style.display = "block";
    decelRateInput.style.display = "block"; // Show deceleration rate
  } else if (inputType === "sightDistance") {
    speedInput.style.display = "none";
    sightDistanceInput.style.display = "block";
    gradeInput.style.display = "none";
    radiusInput.style.display = "block";
    decelRateInput.style.display = "none"; // Hide deceleration rate
  }
}

function calculateHSO() {
    const inputType = document.getElementById("inputType").value;
    const radius = parseFloat(document.getElementById("radius").value);
    const grade = parseFloat(document.getElementById("grade").value); // Grade in percentage
    const decelRate = parseFloat(document.getElementById("decelRate").value);
  
    let sightDistance;
    let ssd = null;
  
    if (inputType === "speed") {
      const speed = parseFloat(document.getElementById("speed").value);
      if (isNaN(speed) || isNaN(radius) || isNaN(grade) || isNaN(decelRate)) {
        alert("Please enter valid numbers for all fields.");
        return;
      }
      ssd = calculateSSD(speed, grade, decelRate);
      sightDistance = ssd;
    } else if (inputType === "sightDistance") {
      sightDistance = parseFloat(document.getElementById("sightDistance").value);
      if (isNaN(sightDistance) || isNaN(radius)) {
        alert("Please enter valid numbers for all fields.");
        return;
      }
    }
  
    const angle = (28.65 * sightDistance) / radius;
    const hso = radius * (1 - Math.cos(angle * (Math.PI / 180))); // Convert angle to radians
  
    // Display the result
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = `<strong>Horizontal Sight Offset (HSO):</strong> ${hso.toFixed(2)}`;
    if (ssd !== null) {
      resultDiv.innerHTML += `<br><strong>Stopping Sight Distance (SSD)*Eye 3.5 ft and Object 2.0 ft:</strong> ${ssd.toFixed(2)}`;
    }
  }
