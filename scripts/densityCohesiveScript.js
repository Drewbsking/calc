document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("densityForm");
    const resultsDiv = document.getElementById("results");
    const calculateButton = document.getElementById("calculateButton");
    const clearButton = document.getElementById("clearButton");

    const knownInput = document.getElementById("knownInput");
    const calculateInput = document.getElementById("calculateInput");

    document.querySelectorAll('input[name="inputOption"]').forEach((elem) => {
        elem.addEventListener("change", function () {
            if (this.value === "known") {
                knownInput.classList.remove("hidden");
                calculateInput.classList.add("hidden");
            } else {
                knownInput.classList.add("hidden");
                calculateInput.classList.remove("hidden");
            }
        });
    });

    form.addEventListener("submit", function(e) {
        e.preventDefault();
        calculateDensity();
    });

    calculateButton.addEventListener("click", function() {
        calculateDensity();
    });

    clearButton.addEventListener("click", function() {
        clearForm();
    });

    async function calculateDensity() {
        let moisture = parseFloat(document.getElementById("moisture").value);
        let compactSoilWet;

        if (document.querySelector('input[name="inputOption"]:checked').value === 'known') {
            compactSoilWet = parseFloat(document.getElementById("compactedSoilWet").value);
            if (isNaN(compactSoilWet)) {
                alert("Please enter a valid Compacted Soil Wet (PCF) value.");
                return;
            }
        } else {
            let volume = parseFloat(document.getElementById("volume").value);
            let wetSoilMold = parseFloat(document.getElementById("wetSoilMold").value);
            let mold = parseFloat(document.getElementById("mold").value);

            if (isNaN(moisture) || isNaN(volume) || isNaN(wetSoilMold) || isNaN(mold)) {
                alert("Please fill in all required fields with valid numbers.");
                return;
            }

            let wetSoil = wetSoilMold - mold;
            let wetSoilLb = wetSoil / 453.592;
            compactSoilWet = (wetSoilLb / volume);
        }

        if (isNaN(moisture)) {
            alert("Please enter a valid moisture percentage.");
            return;
        }

        document.getElementById("compactSoilWet").textContent = compactSoilWet.toFixed(2);
        document.getElementById("moistureResult").textContent = moisture.toFixed(2);

        try {
            const response = await fetch("t99Cohesive.json");
            if (!response.ok) throw new Error('Failed to load t99Cohesive.json');
            const maxDensityData = await response.json();

            let bestMatch = bilinearInterpolation(maxDensityData, compactSoilWet, moisture);

            if (bestMatch) {
                document.getElementById("maxDensity").textContent = bestMatch.maxDensity.toFixed(2);
                document.getElementById("optimumMoisture").textContent = bestMatch.optimumMoisture.toFixed(2);
                resultsDiv.classList.remove("hidden");
            } else {
                throw new Error('No valid match found for interpolation');
            }
        } catch (error) {
            alert(`Calculation error: ${error.message}`);
            console.error(error);
        }
    }

    function bilinearInterpolation(data, wetDensity, moisture) {
        let densities = [...new Set(data.map(entry => entry["Wet Density"]))].sort((a, b) => a - b);
        let W1 = null, W2 = null;

        for (let i = 0; i < densities.length; i++) {
            if (densities[i] <= wetDensity) W1 = densities[i];
            if (densities[i] >= wetDensity) {
                W2 = densities[i];
                break;
            }
        }

        if (W1 === null) W1 = densities[0];
        if (W2 === null) W2 = densities[densities.length - 1];

        console.log(`Interpolating between Wet Densities: W1=${W1}, W2=${W2}`);

        let dataW1 = data.filter(entry => entry["Wet Density"] === W1);
        let dataW2 = data.filter(entry => entry["Wet Density"] === W2);

        let interpW1 = linearInterpolationOnMoisture(dataW1, moisture);
        let interpW2 = linearInterpolationOnMoisture(dataW2, moisture);

        if (!interpW1 || !interpW2) {
            console.error("Interpolation failed at moisture level.");
            return null;
        }

        console.log("Interpolation Results at W1:", interpW1);
        console.log("Interpolation Results at W2:", interpW2);

        let finalMaxDensity = linearInterpolation(wetDensity, W1, W2, interpW1.maxDensity, interpW2.maxDensity);
        let finalOptimumMoisture = linearInterpolation(wetDensity, W1, W2, interpW1.optimumMoisture, interpW2.optimumMoisture);

        return { maxDensity: finalMaxDensity, optimumMoisture: finalOptimumMoisture };
    }

    function linearInterpolationOnMoisture(data, moisture) {
        let sortedData = data.sort((a, b) => a["Moisture Content"] - b["Moisture Content"]);

        let lower = null, upper = null;
        for (let i = 0; i < sortedData.length; i++) {
            if (sortedData[i]["Moisture Content"] <= moisture) lower = sortedData[i];
            if (sortedData[i]["Moisture Content"] >= moisture) {
                upper = sortedData[i];
                break;
            }
        }

        if (!lower || !upper) {
            console.error("Moisture content out of range.");
            return null;
        }

        return {
            maxDensity: linearInterpolation(moisture, lower["Moisture Content"], upper["Moisture Content"], lower["Max Density"], upper["Max Density"]),
            optimumMoisture: linearInterpolation(moisture, lower["Moisture Content"], upper["Moisture Content"], lower["Optimum Moisture Content"], upper["Optimum Moisture Content"])
        };
    }

    function linearInterpolation(x, x1, x2, y1, y2) {
        if (x1 === x2) return y1;
        return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
    }

    function clearForm() {
        form.reset();
        resultsDiv.classList.add("hidden");
        knownInput.classList.remove("hidden");
        calculateInput.classList.add("hidden");
    }
});
