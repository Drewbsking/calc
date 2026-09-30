const DEFAULT_CASE_B_DECISION_POINT_SETBACK_FT = 15;

function updateForm() {
  const caseSelect = document.getElementById("caseSelect").value;
  const dynamicInputs = document.getElementById("dynamicInputs");
  const sightTriangle = document.getElementById("sight-triangle");
  const roundaboutImage = document.getElementById("roundabout-image");
  dynamicInputs.innerHTML = "";
  dynamicInputs.classList.remove("case-input-placeholder");

  if (caseSelect === "G") {
    sightTriangle.style.display = "none";
    roundaboutImage.style.display = "block";
  } else {
    sightTriangle.style.display = "block";
    roundaboutImage.style.display = "none";
  }

  const speedOptions = `
        <option value="15">15 mph</option>
        <option value="20">20 mph</option>
        <option value="25">25 mph</option>
        <option value="30">30 mph</option>
        <option value="35" selected>35 mph</option>
        <option value="40">40 mph</option>
        <option value="45">45 mph</option>
        <option value="50">50 mph</option>
        <option value="55">55 mph</option>
        <option value="60">60 mph</option>
        <option value="65">65 mph</option>
        <option value="70">70 mph</option>
        <option value="75">75 mph</option>
        <option value="80">80 mph</option>
    `;

  switch (caseSelect) {
    case "A":
      dynamicInputs.innerHTML = `
                <label for="majorSpeedLeft">Speed on Major Road (Left) (V<sub>major</sub>):</label>
                <select id="majorSpeedLeft">${speedOptions}</select><br>
                
                <label for="majorSpeedRight">Speed on Major Road (Right) (V<sub>major</sub>):</label>
                <select id="majorSpeedRight">${speedOptions}</select><br>

                <label for="minorSpeed">Speed on Minor Road (V<sub>minor</sub>):</label>
                <select id="minorSpeed">${speedOptions}</select><br>

                <label for="laneWidth">Width of Lane(s) Departing Intersection (ft):</label>
                <input type="number" id="laneWidth" placeholder="Enter lane width" required><br>

               <label for="skew">skew or angle of intersection (degrees):</label>
               <input type="number" id="skew" placeholder="Enter angle between minor and major roads" required><br>

                <label for="majorGradeLeft">Major Road Approach Grade (Left) (%):</label>
                <select id="majorGradeLeft" required>
                    <option value="-6">-6%</option>
                    <option value="-5">-5%</option>
                    <option value="-4">-4%</option>
                    <option value="-3" selected>-3% to +3%</option>
                    <option value="4">+4%</option>
                    <option value="5">+5%</option>
                    <option value="6">+6%</option>
                </select><br>

                <label for="majorGradeRight">Major Road Approach Grade (Right) (%):</label>
                <select id="majorGradeRight" required>
                    <option value="-6">-6%</option>
                    <option value="-5">-5%</option>
                    <option value="-4">-4%</option>
                    <option value="-3" selected>-3% to +3%</option>
                    <option value="4">+4%</option>
                    <option value="5">+5%</option>
                    <option value="6">+6%</option>
                </select><br>

                <label for="minorGrade">Minor Road Approach Grade (%):</label>
                <select id="minorGrade" required>
                    <option value="-6">-6%</option>
                    <option value="-5">-5%</option>
                    <option value="-4">-4%</option>
                    <option value="-3" selected>-3% to +3%</option>
                    <option value="4">+4%</option>
                    <option value="5">+5%</option>
                    <option value="6">+6%</option>
                </select><br>
            `;
      break;

    case "B":
      dynamicInputs.innerHTML = `
                <label for="differentMajorSpeedsB">Different major-road speeds by direction?</label>
                <select id="differentMajorSpeedsB" onchange="toggleCaseBMajorSpeedInputs()">
                    <option value="no" selected>No</option>
                    <option value="yes">Yes</option>
                </select><br>

                <label id="majorSpeedLeftLabelB" for="majorSpeedLeft">Major Road Speed (V<sub>major</sub>):</label>
                <select id="majorSpeedLeft" onchange="syncCaseBMajorSpeed()">${speedOptions}</select><br>

                <div id="majorSpeedRightGroupB" class="hidden">
                    <label for="majorSpeedRight">Speed on Major Road (Right) (V<sub>major</sub>):</label>
                    <select id="majorSpeedRight">${speedOptions}</select><br>
                </div>

                <label for="carType">Type of Vehicle:</label>
                <select id="carType" required>
                    <option value="passenger car">Passenger Car</option>
                    <option value="single unit truck">Single Unit Truck</option>
                    <option value="combination truck">Combination Truck</option>
                </select><br>

                <!-- Minor Road Approach -->
                <label for="minorGrade" class="label-with-info">Minor Road Approach Grade (%):
                    <span class="info-tooltip" tabindex="0">
                        <span class="info-icon" aria-hidden="true">i</span>
                        <span class="tooltip-bubble" role="tooltip"><strong>Case B grade treatment:</strong><br>This input applies to the stopped vehicle on the minor-road approach. Use positive values for an upgrade on the departing vehicle path and negative values for a downgrade.<br><br><strong>When time is added:</strong><br>In this calculator, no grade time is added for grades of 3% or less. Once the minor-road upgrade exceeds 3%, additional time is added directly to the maneuver time gap.<br><br><strong>Time added by maneuver:</strong><br>B1 left turn and B3 crossing add 0.2 s per percent grade. B2 right turn adds 0.1 s per percent grade only when the selected approach allows right turns without left turns; otherwise B2 uses the B1 gap and the same 0.2 s per percent grade factor.<br><br><strong>Examples:</strong><br>At +4%, B1 and B3 add 0.8 s, while right-turn-only B2 adds 0.4 s. At +6%, B1 and B3 add 1.2 s, while right-turn-only B2 adds 0.6 s.<br><br><strong>Effect on ISD:</strong><br>Because ISD = 1.47 x Vmajor x tg, any added grade time increases both left and right sight distances in direct proportion to the major-road approach speed. Negative grades do not reduce the computed Case B time gap in the current calculator.</span>
                    </span>
                </label>
                <input type="number" id="minorGrade" placeholder="Enter minor grade (%)" value="3" step="any" required><br>

                <div class="case-b-maneuver-group">
                    <label class="case-b-maneuver-label">Allowed maneuvers from this minor-road approach:</label>
                    <p class="case-b-maneuver-copy">Select only the movements that are legal and need Case B sight distance checks for this approach.</p>
                    <div class="case-b-maneuver-options">
                        <label class="case-b-maneuver-option case-b-maneuver-option-left">
                            <input type="checkbox" id="caseBLeftTurn" onchange="toggleCaseBManeuverInputs()" checked>
                            <span class="case-b-maneuver-visual" aria-hidden="true">
                                <svg class="case-b-maneuver-arrow" viewBox="0 0 28 28" focusable="false">
                                    <circle cx="14" cy="22" r="1.8"></circle>
                                    <path d="M14 22 V10 H6"></path>
                                    <path d="M10 6 L6 10 L10 14"></path>
                                </svg>
                            </span>
                            <span class="case-b-maneuver-text">
                                <span class="case-b-maneuver-title">Left turn (B1)</span>
                                <span class="case-b-maneuver-subtitle">Minor road to major road</span>
                            </span>
                        </label>
                        <label class="case-b-maneuver-option case-b-maneuver-option-right">
                            <input type="checkbox" id="caseBRightTurn" onchange="toggleCaseBManeuverInputs()" checked>
                            <span class="case-b-maneuver-visual" aria-hidden="true">
                                <svg class="case-b-maneuver-arrow" viewBox="0 0 28 28" focusable="false">
                                    <circle cx="14" cy="22" r="1.8"></circle>
                                    <path d="M14 22 V10 H22"></path>
                                    <path d="M18 6 L22 10 L18 14"></path>
                                </svg>
                            </span>
                            <span class="case-b-maneuver-text">
                                <span class="case-b-maneuver-title">Right turn (B2)</span>
                                <span class="case-b-maneuver-subtitle">Minor road to major road</span>
                            </span>
                        </label>
                        <label class="case-b-maneuver-option case-b-maneuver-option-crossing">
                            <input type="checkbox" id="caseBCrossing" onchange="toggleCaseBManeuverInputs()">
                            <span class="case-b-maneuver-visual" aria-hidden="true">
                                <svg class="case-b-maneuver-arrow" viewBox="0 0 28 28" focusable="false">
                                    <circle cx="14" cy="22" r="1.8"></circle>
                                    <path d="M14 22 V6"></path>
                                    <path d="M10 10 L14 6 L18 10"></path>
                                </svg>
                            </span>
                            <span class="case-b-maneuver-text">
                                <span class="case-b-maneuver-title">Crossing (B3)</span>
                                <span class="case-b-maneuver-subtitle">Across the major road</span>
                            </span>
                        </label>
                    </div>
                </div>

                <div id="caseBGeometryGroup" class="case-b-geometry-group">
                    <label class="case-b-geometry-label">Major roadway geometry for this approach:</label>
                    <p class="case-b-maneuver-copy">Choose the major-road type first, then answer the lane questions. The calculator will derive the Case B widths from those answers instead of asking for raw crossing widths.</p>

                    <label for="caseBRoadwayType">Major roadway type:</label>
                    <select id="caseBRoadwayType" onchange="toggleCaseBManeuverInputs()">
                        <option value="undivided" selected>Undivided roadway</option>
                        <option value="divided">Divided roadway</option>
                    </select><br>

                    <label for="caseBLaneWidth">Typical lane width used for the Case B lane counts (ft):</label>
                    <input type="number" id="caseBLaneWidth" placeholder="12 ft typical lane width" value="12" step="any"><br>

                    <div id="caseBUndividedGeometryGroup" class="case-b-geometry-panel">
                        <label for="caseBUndividedLanesPerDirection">Through lanes per direction on the major road:</label>
                        <input type="number" id="caseBUndividedLanesPerDirection" placeholder="1 lane each direction" value="1" min="1" step="1"><br>

                        <label for="caseBUndividedCenterLaneType">Center lane type:</label>
                        <select id="caseBUndividedCenterLaneType">
                            <option value="none" selected>No center lane</option>
                            <option value="twltl">Two-way left-turn lane (TWLTL)</option>
                            <option value="exclusive-left">Exclusive center left-turn lane</option>
                        </select><br>

                        <p class="case-b-width-help">For an undivided road, B1 and B2 use the lanes approaching from the left plus an exclusive center left-turn lane when one exists. A TWLTL does not add to B1 or B2, but it does count in the full roadway width for B3.</p>
                    </div>

                    <div id="caseBDividedGeometryGroup" class="case-b-geometry-panel hidden">
                        <label for="caseBDividedNearSideLanes">Near-side lanes or turn lanes to clear before the median:</label>
                        <input type="number" id="caseBDividedNearSideLanes" placeholder="1 lane on the near roadway" value="1" min="1" step="1"><br>

                        <div id="caseBDividedFarSideLanesGroup">
                            <label for="caseBDividedFarSideLanes">Far-side lanes or turn lanes to cross beyond the median:</label>
                            <input type="number" id="caseBDividedFarSideLanes" placeholder="1 lane on the far roadway" value="1" min="0" step="1"><br>
                        </div>

                        <label for="caseBDividedMedianWidth" class="label-with-info">Median width to include in the continuous maneuver (ft):
                            <span class="info-tooltip" tabindex="0">
                                <span class="info-icon" aria-hidden="true">i</span>
                                <span class="tooltip-bubble" role="tooltip"><strong>Case B median treatment:</strong><br>For Case B1 and B3, AASHTO converts median width to equivalent lanes when adjusting the time gap for multilane crossings. An 18 ft median is equivalent to 1.5 lanes, which adds 0.75 s for a passenger car or 1.05 s for a truck.<br><br><strong>When to include the median:</strong><br>Include the median width here only when the design vehicle must traverse the median as part of one continuous maneuver.<br><br><strong>When not to include it:</strong><br>If the design vehicle can stop in the median with adequate clearance to the through lanes and complete the movement in stages, enter 0 for this single-stage Case B check. This calculator does not yet perform a separate staged median analysis from the refuge area.</span>
                            </span>
                        </label>
                        <input type="number" id="caseBDividedMedianWidth" placeholder="0 ft for staged refuge median" value="0" step="any"><br>

                        <p class="case-b-width-help">Count only the lanes and turn lanes that must be crossed in the continuous movement you are checking. If the maneuver is staged through a refuge median, this calculator can only approximate the first stage.</p>
                    </div>
                </div>
               
                <!-- Skew -->
                <label for="skew" class="label-with-info">skew or angle of intersection (degrees):
                    <span class="info-tooltip" tabindex="0">
                        <span class="info-icon" aria-hidden="true">i</span>
                        <span class="tooltip-bubble" role="tooltip"><strong>Case B skew treatment:</strong><br>Actual crossing path = crossed width / sin(theta). Skew does not directly change the base time gap; it only changes the equivalent lanes crossed.<br><br><strong>When ISD changes:</strong><br>The calculator adds skew-related lane time only when the oblique path is at least 12 ft longer than the nominal crossed width. That extra width is converted at 12 ft per lane.<br><br><strong>Time added:</strong><br>0.5 s per equivalent lane for passenger cars and 0.7 s per equivalent lane for trucks.<br><br><strong>Practical effect:</strong><br>Small skew changes near 90 degrees often produce no change. More acute angles and wider crossings increase Case B1, B2, and B3 ISD. For B2, the reduced right-turn treatment applies only when the selected approach allows right turns without left turns.</span>
                    </span>
                </label>
                <input type="number" id="skew" placeholder="Enter angle between minor and major roads" value="90" step="any" required><br>

            `;
      break;

    case "C":
      dynamicInputs.innerHTML = `
                <label for="majorSpeedLeft">Speed on Major Road (Left) (V<sub>major</sub>):</label>
                <select id="majorSpeedLeft">${speedOptions}</select><br>
                
                <label for="majorSpeedRight">Speed on Major Road (Right) (V<sub>major</sub>):</label>
                <select id="majorSpeedRight">${speedOptions}</select><br>

                <label for="minorSpeed">Speed on Minor Road (V<sub>minor</sub>):</label>
                <select id="minorSpeed">${speedOptions}</select><br>

                <label for="carType">Type of Vehicle:</label>
                <select id="carType" required>
                    <option value="passenger car">Passenger Car</option>
                    <option value="single unit truck">Single Unit Truck</option>
                    <option value="combination truck">Combination Truck</option>
                </select><br>

                <label for="minorGrade">Minor Road Approach Grade (%):</label>
                <select id="minorGrade" required>
                    <option value="-6">-6%</option>
                    <option value="-5">-5%</option>
                    <option value="-4">-4%</option>
                    <option value="-3" selected>-3% to +3%</option>
                    <option value="4">+4%</option>
                    <option value="5">+5%</option>
                    <option value="6">+6%</option>
                </select><br>

                <label for="roadWidth">Width of intersection to be crossed (ft):</label>
                <input type="number" id="roadWidth" placeholder="Enter road width" Value="24" required><br>

                <label for="vehLength">Length of design vehicle (ft):</label>
                <input type="number" id="vehLength" placeholder="Enter length of design vechile" value="12" required><br>
                <br>

                <label for="medianWidth">Width of Median (ft):</label>
                <input type="number" id="medianWidth" placeholder="Enter median width" Value="0" required><br>

                <label for="lanesCrossedLeft">Total Number of Lanes Being Crossed for Left Turn (B1) (including turn lanes, on the left):</label>
                <input type="number" id="lanesCrossedLeft" placeholder="Enter number of lanes" value="1" required><br>

            `;
      break;

    case "D":
      dynamicInputs.innerHTML = `
       <div id="Signal">
         <label for="flashSignal">Will signal go into flash?</label>
         <select id="flashSignal">
           <option value="yes">Yes</option>
           <option value="no">No</option>
         </select>
       </div>

      <h2>The first vehicle stopped on one approach should be visible to the driver of the first vehicle stopped on each of the other approaches</h2>
      `;
      break;

    case "E":
      dynamicInputs.innerHTML = `
      <div id="Signal">
         <label for="signal">Will a signal likely be installed soon?</label>
         <select id="signal">
           <option value="yes">Yes</option>
           <option value="no">No</option>
         </select>
       </div>

      <h2>The first vehicle stopped on one approach should be visible to the driver of the first vehicle stopped on each of the other approaches</h2>
      `;
      break;

    case "F":
      dynamicInputs.innerHTML = `
      <label for="majorSpeed">Speed on Major Road (Left) (V<sub>major</sub>):</label>
      <select id="majorSpeed">${speedOptions}</select><br>
      
      <label for="carType">Type of Vehicle:</label>
      <select id="carType" required>
          <option value="passenger car">Passenger Car</option>
          <option value="single unit truck">Single Unit Truck</option>
          <option value="combination truck">Combination Truck</option>
      </select><br>

      <label for="medianWidth">Width of Median (ft):</label>
      <input type="number" id="medianWidth" placeholder="Enter median width" Value="0" required><br>

      <label for="lanesCrossedLeft">Total Number of Lanes Being Crossed for Left Turn (B1) (including turn lanes, on the left):</label>
      <input type="number" id="lanesCrossedLeft" placeholder="Enter number of lanes" value="1" required><br>
  `;
      break;

    case "G":
      dynamicInputs.innerHTML = `
      <label for="majorSpeedEntering">Design speed of conflicting Movement ENTERING (The D1 speed):</label>
      <select id="majorSpeedEntering">
        <option value="10">10 mph</option>
        <option value="15">15 mph</option>
        <option value="20">20 mph</option>
        <option value="25">25 mph</option>
        <option value="30" selected>30 mph</option>
      </select><br>
      <note>The speed for this movement can be approximated by
taking the average of the theoretical entering (R1) speed and the circulating (R2) speed. </note>

      <label for="majorSpeedCirculating">Design speed of conflicting Movement Circulating (the D2 Speed):</label>
      <select id="majorSpeedCirculating">
        <option value="10">10 mph</option>
        <option value="15">15 mph</option>
        <option value="30" selected>30 mph</option>
        <option value="25">25 mph</option>
        <option value="30" selected>30 mph</option>
      </select><br>
      <note>This speed can be approximated by
taking the speed of left-turning vehicles (path with radius R4). </note>

      <label for="criticalHeadway">Critical Headway for entering the major road, s, equal to 5.0s.:</label>
      <input type="number" id="criticalHeadway" placeholder="Default is 5.0" value="5.0" required><br>
      <note>5.0 is based upon the critical
headway required for passenger cars. This critical headway value represents an
interim methodology pending further research. Some individual states or municipalities have elected to use alternative critical headway values ranging from 4.5 to
6.5 seconds.</note>

      `;
      break;

  }

  if (caseSelect === "B") {
    toggleCaseBMajorSpeedInputs();
    toggleCaseBManeuverInputs();
  }
}

function toggleCaseBMajorSpeedInputs() {
  const toggle = document.getElementById("differentMajorSpeedsB");
  const leftLabel = document.getElementById("majorSpeedLeftLabelB");
  const rightGroup = document.getElementById("majorSpeedRightGroupB");
  const leftSelect = document.getElementById("majorSpeedLeft");
  const rightSelect = document.getElementById("majorSpeedRight");

  if (!toggle || !leftLabel || !rightGroup || !leftSelect || !rightSelect) {
    return;
  }

  const useDifferentSpeeds = toggle.value === "yes";
  leftLabel.innerHTML = useDifferentSpeeds
    ? "Speed on Major Road (Left) (V<sub>major</sub>):"
    : "Major Road Speed (V<sub>major</sub>):";
  rightGroup.classList.toggle("hidden", !useDifferentSpeeds);

  if (!useDifferentSpeeds) {
    rightSelect.value = leftSelect.value;
  }
}

function syncCaseBMajorSpeed() {
  const toggle = document.getElementById("differentMajorSpeedsB");
  const leftSelect = document.getElementById("majorSpeedLeft");
  const rightSelect = document.getElementById("majorSpeedRight");

  if (!toggle || !leftSelect || !rightSelect || toggle.value === "yes") {
    return;
  }

  rightSelect.value = leftSelect.value;
}

function toggleCaseBManeuverInputs() {
  const leftTurnInput = document.getElementById("caseBLeftTurn");
  const rightTurnInput = document.getElementById("caseBRightTurn");
  const crossingInput = document.getElementById("caseBCrossing");
  const geometryGroup = document.getElementById("caseBGeometryGroup");
  const roadwayTypeSelect = document.getElementById("caseBRoadwayType");
  const laneWidthInput = document.getElementById("caseBLaneWidth");
  const undividedGroup = document.getElementById("caseBUndividedGeometryGroup");
  const undividedLanesInput = document.getElementById("caseBUndividedLanesPerDirection");
  const undividedCenterLaneType = document.getElementById("caseBUndividedCenterLaneType");
  const dividedGroup = document.getElementById("caseBDividedGeometryGroup");
  const dividedNearSideLanesInput = document.getElementById("caseBDividedNearSideLanes");
  const dividedFarSideLanesGroup = document.getElementById("caseBDividedFarSideLanesGroup");
  const dividedFarSideLanesInput = document.getElementById("caseBDividedFarSideLanes");
  const dividedMedianWidthInput = document.getElementById("caseBDividedMedianWidth");

  if (
    !leftTurnInput ||
    !rightTurnInput ||
    !crossingInput ||
    !geometryGroup ||
    !roadwayTypeSelect ||
    !laneWidthInput ||
    !undividedGroup ||
    !undividedLanesInput ||
    !undividedCenterLaneType ||
    !dividedGroup ||
    !dividedNearSideLanesInput ||
    !dividedFarSideLanesGroup ||
    !dividedFarSideLanesInput ||
    !dividedMedianWidthInput
  ) {
    return;
  }

  const evaluateLeftTurn = leftTurnInput.checked;
  const evaluateRightTurn = rightTurnInput.checked;
  const evaluateCrossing = crossingInput.checked;
  const usesGeometry = evaluateLeftTurn || evaluateCrossing;
  const roadwayType = roadwayTypeSelect.value;
  const useUndividedGeometry = usesGeometry && roadwayType === "undivided";
  const useDividedGeometry = usesGeometry && roadwayType === "divided";

  geometryGroup.classList.toggle("hidden", !usesGeometry);
  roadwayTypeSelect.disabled = !usesGeometry;
  laneWidthInput.disabled = !usesGeometry;
  laneWidthInput.required = usesGeometry;

  undividedGroup.classList.toggle("hidden", !useUndividedGeometry);
  undividedLanesInput.disabled = !useUndividedGeometry;
  undividedLanesInput.required = useUndividedGeometry;
  undividedCenterLaneType.disabled = !useUndividedGeometry;
  if (!useUndividedGeometry) {
    undividedCenterLaneType.value = "none";
  }

  dividedGroup.classList.toggle("hidden", !useDividedGeometry);
  dividedNearSideLanesInput.disabled = !useDividedGeometry;
  dividedNearSideLanesInput.required = useDividedGeometry;
  dividedMedianWidthInput.disabled = !useDividedGeometry;
  dividedFarSideLanesGroup.classList.toggle("hidden", !useDividedGeometry || !evaluateCrossing);
  dividedFarSideLanesInput.disabled = !useDividedGeometry || !evaluateCrossing;
  dividedFarSideLanesInput.required = useDividedGeometry && evaluateCrossing;
}


function updateMedianInputs() {
  const hasMedian = document.getElementById("hasMedian").value;
  const medianInputs = document.getElementById("medianInputs");
  medianInputs.innerHTML = "";

  if (hasMedian === "yes") {
    medianInputs.innerHTML = `
            <label for="medianWidth">Width of Median (ft):</label>
            <input type="number" id="medianWidth" placeholder="Enter median width" required><br>
        `;
  } else {
    medianInputs.innerHTML = `
            <label for="lanesCrossed">Number of Lanes Being Crossed (including turn lanes, but not those you are merging with)):</label>
            <input type="number" id="lanesCrossed" placeholder="Enter number of lanes" required><br>
        `;
  }
}

// Enhancements to update the sight triangle and include labels dynamically
function updateDynamicSVG(caseData) {
  const svg = document.getElementById("sight-triangle");
  const roundaboutImage = document.getElementById("roundabout-image");
  const leftPolygon = document.getElementById("sight-left");
  const rightPolygon = document.getElementById("sight-right");
  const roadGeometry = getRoadGeometry(caseData);
  const vehicleLayout = getVehicleLayout(roadGeometry, caseData);
  const minorLegValues = getMinorLegLabelValues(caseData, vehicleLayout);
  const hasLeft = Number.isFinite(caseData.left);
  const hasRight = Number.isFinite(caseData.right);

  // Remove any existing dynamic labels
  const existingLabels = svg.querySelectorAll(".dynamic");
  existingLabels.forEach((label) => label.remove());

  svg.style.display = "block";
  roundaboutImage.style.display = "none";
  renderRoadGeometry(roadGeometry);
  renderVehicleMarkers(vehicleLayout);

  // Update triangles based on case data
  if (hasLeft && vehicleLayout.minorVehicle && vehicleLayout.leftVehicle) {
    const decisionPoint = vehicleLayout.minorVehicle.anchor;
    const conflictPoint = vehicleLayout.leftVehicle.anchor;
    leftPolygon.style.display = "block";
    leftPolygon.setAttribute(
      "points",
      `${decisionPoint.x},${decisionPoint.y} ${conflictPoint.x},${conflictPoint.y} ${decisionPoint.x},${conflictPoint.y}`
    );
  } else {
    leftPolygon.style.display = "none";
  }

  if (hasRight && vehicleLayout.minorVehicle && vehicleLayout.rightVehicle) {
    const decisionPoint = vehicleLayout.minorVehicle.anchor;
    const conflictPoint = vehicleLayout.rightVehicle.anchor;
    rightPolygon.style.display = "block";
    rightPolygon.setAttribute(
      "points",
      `${decisionPoint.x},${decisionPoint.y} ${conflictPoint.x},${conflictPoint.y} ${decisionPoint.x},${conflictPoint.y}`
    );
  } else {
    rightPolygon.style.display = "none";
  }

  // Add labels dynamically for the updated sight triangles
  const dynamicLabels = [];

  if (hasLeft && vehicleLayout.minorVehicle && vehicleLayout.leftVehicle) {
    const decisionPoint = vehicleLayout.minorVehicle.anchor;
    const conflictPoint = vehicleLayout.leftVehicle.anchor;
    dynamicLabels.push(
      buildSvgCalloutLabel(
        clamp(conflictPoint.x + 64, 150, 270),
        roadGeometry.majorTop - 28,
        `b Left: ${formatFeetLabel(caseData.left)} ft`,
        conflictPoint.x,
        conflictPoint.y - 4,
        { className: "dynamic", fill: "#eff6ff", stroke: "#2563eb", textColor: "#1e3a8a" }
      )
    );
    dynamicLabels.push(
      buildSvgCalloutLabel(
        roadGeometry.minorRight + 62,
        decisionPoint.y - 28,
        `a1: ${formatFeetLabel(minorLegValues.a1)} ft`,
        decisionPoint.x + 4,
        (decisionPoint.y + conflictPoint.y) / 2,
        { className: "dynamic", fill: "#f0fdf4", stroke: "#16a34a", textColor: "#166534" }
      )
    );
  }

  if (hasRight && vehicleLayout.minorVehicle && vehicleLayout.rightVehicle) {
    const decisionPoint = vehicleLayout.minorVehicle.anchor;
    const conflictPoint = vehicleLayout.rightVehicle.anchor;
    dynamicLabels.push(
      buildSvgCalloutLabel(
        clamp(conflictPoint.x - 64, 530, 650),
        roadGeometry.majorTop - 28,
        `b Right: ${formatFeetLabel(caseData.right)} ft`,
        conflictPoint.x,
        conflictPoint.y - 4,
        { className: "dynamic", fill: "#f0fdf4", stroke: "#16a34a", textColor: "#166534" }
      )
    );
    dynamicLabels.push(
      buildSvgCalloutLabel(
        roadGeometry.minorRight + 62,
        decisionPoint.y - 2,
        `a2: ${formatFeetLabel(minorLegValues.a2)} ft`,
        decisionPoint.x + 4,
        (decisionPoint.y + conflictPoint.y) / 2,
        { className: "dynamic", fill: "#f0fdf4", stroke: "#16a34a", textColor: "#166534" }
      )
    );
  }

  if (dynamicLabels.length > 0) {
    svg.insertAdjacentHTML("beforeend", dynamicLabels.join(""));
  }
}

function renderRoadGeometry(roadGeometry) {
  const majorRoadSurface = document.getElementById("major-road-surface");
  const minorRoadSurface = document.getElementById("minor-road-surface");
  const majorRoadMarkings = document.getElementById("major-road-markings");
  const minorRoadMarkings = document.getElementById("minor-road-markings");
  const roadLabelLayer = document.getElementById("road-label-layer");

  majorRoadSurface.setAttribute("y", roadGeometry.majorTop);
  majorRoadSurface.setAttribute("height", roadGeometry.majorRoadWidthPx);

  minorRoadSurface.setAttribute("y", roadGeometry.minorTop);
  minorRoadSurface.setAttribute("x", roadGeometry.minorLeft);
  minorRoadSurface.setAttribute("height", roadGeometry.minorBottom - roadGeometry.minorTop);
  minorRoadSurface.setAttribute("width", roadGeometry.minorRoadWidthPx);

  majorRoadMarkings.innerHTML = buildMajorRoadMarkings(roadGeometry);
  minorRoadMarkings.innerHTML = buildMinorRoadMarkings(roadGeometry);
  roadLabelLayer.innerHTML = buildRoadLabels(roadGeometry);
}

function buildRoadLabels(roadGeometry) {
  return [
    buildSvgLabel(94, roadGeometry.majorTop - 22, "Major Road", {
      fill: "#ffffff",
      stroke: "#94a3b8",
      textColor: "#111827",
      fontSize: 13,
      paddingX: 10,
    }),
    buildSvgLabel(706, roadGeometry.majorTop - 22, "Major Road", {
      fill: "#ffffff",
      stroke: "#94a3b8",
      textColor: "#111827",
      fontSize: 13,
      paddingX: 10,
    }),
    buildSvgLabel(400, Math.min(388, roadGeometry.minorBottom - 14), "Minor Road", {
      fill: "#ffffff",
      stroke: "#94a3b8",
      textColor: "#111827",
      fontSize: 13,
      paddingX: 10,
    }),
  ].join("");
}

function buildSvgLabel(x, y, text, options = {}) {
  const paddingX = options.paddingX ?? 8;
  const paddingY = options.paddingY ?? 5;
  const fontSize = options.fontSize ?? 12;
  const width = Math.max(56, text.length * 6.6 + paddingX * 2);
  const height = fontSize + paddingY * 2;
  const rectX = x - width / 2;
  const rectY = y - height + 4;
  const className = options.className ? ` ${options.className}` : "";

  return `
    <g class="svg-label${className}">
      <rect x="${rectX}" y="${rectY}" width="${width}" height="${height}" rx="6" fill="${options.fill ?? "#ffffff"}" stroke="${options.stroke ?? "#cbd5e1"}" stroke-width="1"></rect>
      <text x="${x}" y="${y}" font-size="${fontSize}" font-weight="600" text-anchor="middle" fill="${options.textColor ?? "#111827"}">${text}</text>
    </g>
  `;
}

function buildSvgCalloutLabel(x, y, text, anchorX, anchorY, options = {}) {
  const paddingX = options.paddingX ?? 8;
  const paddingY = options.paddingY ?? 5;
  const fontSize = options.fontSize ?? 12;
  const width = Math.max(64, text.length * 6.4 + paddingX * 2);
  const height = fontSize + paddingY * 2;
  const rectX = x - width / 2;
  const rectY = y - height + 4;
  const className = options.className ? ` ${options.className}` : "";
  const lineStartX = clamp(anchorX, rectX + 8, rectX + width - 8);
  const lineStartY = rectY + height;

  return `
    <g class="svg-label${className}">
      <line x1="${lineStartX}" y1="${lineStartY}" x2="${anchorX}" y2="${anchorY}" stroke="${options.stroke ?? "#cbd5e1"}" stroke-width="1.5"></line>
      <rect x="${rectX}" y="${rectY}" width="${width}" height="${height}" rx="6" fill="${options.fill ?? "#ffffff"}" stroke="${options.stroke ?? "#cbd5e1"}" stroke-width="1.2"></rect>
      <text x="${x}" y="${y}" font-size="${fontSize}" font-weight="600" text-anchor="middle" fill="${options.textColor ?? "#111827"}">${text}</text>
    </g>
  `;
}

function formatFeetLabel(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function roundUpToNearestFive(value) {
  return Math.ceil(value / 5) * 5;
}

function formatDistanceValueMarkup(value) {
  return `
    <span class="result-metric-value-stack">
      <span class="result-metric-value-line">Calculated: ${formatFeetLabel(value)} ft</span>
      <span class="result-metric-value-line result-metric-value-design">Design: ${formatFeetLabel(roundUpToNearestFive(value))} ft</span>
    </span>
  `;
}

function buildResultMetric(label, value, valueClass = "") {
  const metricValueClass = valueClass ? ` result-metric-value ${valueClass}` : " result-metric-value";

  return `
    <div class="result-metric">
      <span class="result-metric-label">${label}</span>
      <span class="${metricValueClass.trim()}">${value}</span>
    </div>
  `;
}

function buildDistanceMetric(label, value, valueClass = "") {
  const combinedClass = valueClass ? `${valueClass} result-metric-value-stacked` : "result-metric-value-stacked";
  return buildResultMetric(label, formatDistanceValueMarkup(value), combinedClass);
}

function buildResultSection(title, metrics, options = {}) {
  const sectionClass = options.primary ? " result-section-primary" : "";
  const noteMarkup = options.note
    ? `<div class="result-section-note">${options.note}</div>`
    : "";

  return `
    <section class="result-section${sectionClass}">
      <h3 class="result-section-title">${title}</h3>
      <div class="result-metric-grid">
        ${metrics.join("")}
      </div>
      ${noteMarkup}
    </section>
  `;
}

function getControllingResult(results) {
  return results.reduce(
    (maxResult, currentResult) => (!maxResult || currentResult.value > maxResult.value ? currentResult : maxResult),
    null
  );
}

function getMajorSightOffset(distanceFt, caseData) {
  const baseOffsetPx = Number.isFinite(caseData.majorLegVisualBasePx)
    ? caseData.majorLegVisualBasePx
    : 70;
  const scalePxPerFoot = Number.isFinite(caseData.majorLegVisualScale)
    ? caseData.majorLegVisualScale
    : 0.32;
  const minOffsetPx = Number.isFinite(caseData.majorLegVisualMinPx)
    ? caseData.majorLegVisualMinPx
    : 120;
  const maxOffsetPx = Number.isFinite(caseData.majorLegVisualMaxPx)
    ? caseData.majorLegVisualMaxPx
    : 290;

  return clamp(baseOffsetPx + distanceFt * scalePxPerFoot, minOffsetPx, maxOffsetPx);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getMinorLegLabelValues(caseData, vehicleLayout) {
  if (caseData.deriveMinorLegsFromGeometry && vehicleLayout.minorVehicle) {
    const decisionPointY = vehicleLayout.minorVehicle.anchor.y;

    return {
      a1: vehicleLayout.leftVehicle
        ? svgToFeet(Math.abs(decisionPointY - vehicleLayout.leftVehicle.anchor.y))
        : caseData.a1,
      a2: vehicleLayout.rightVehicle
        ? svgToFeet(Math.abs(decisionPointY - vehicleLayout.rightVehicle.anchor.y))
        : caseData.a2,
    };
  }

  return {
    a1: caseData.a1,
    a2: caseData.a2 + (caseData.laneWidth || 0),
  };
}

function renderVehicleMarkers(vehicleLayout) {
  const vehicleLayer = document.getElementById("vehicle-layer");
  vehicleLayer.innerHTML = buildVehicleMarkers(vehicleLayout);
}

function buildVehicleMarkers(vehicleLayout) {
  const markers = [];

  if (vehicleLayout.minorVehicle) {
    markers.push(buildVehicleMarker(vehicleLayout.minorVehicle));
  }

  if (vehicleLayout.leftVehicle) {
    markers.push(buildVehicleMarker(vehicleLayout.leftVehicle));
  }

  if (vehicleLayout.rightVehicle) {
    markers.push(buildVehicleMarker(vehicleLayout.rightVehicle));
  }

  return markers.join("");
}

function getVehicleLayout(roadGeometry, caseData) {
  const carLength = 28;
  const carWidth = 14;
  const showMinorVehicle = caseData.showMinorVehicle !== false;
  const defaultMinorAnchorY =
    roadGeometry.minorTop +
    Math.min(56, Math.max(34, roadGeometry.minorRoadWidthPx * 0.75)) -
    carLength / 2;
  const minorAnchorY = Number.isFinite(caseData.decisionPointSetbackFt)
    ? getMajorConflictLaneCenter(roadGeometry, "left") + feetToSvg(caseData.decisionPointSetbackFt)
    : defaultMinorAnchorY;
  const minorCenterY = clamp(
    minorAnchorY + carLength / 2,
    roadGeometry.minorTop + carLength / 2 + 4,
    roadGeometry.minorBottom - carLength / 2 - 4
  );
  const minorVehicle = showMinorVehicle
    ? createVehicleMarker({
      centerX: getMinorApproachLaneCenter(roadGeometry),
      centerY: minorCenterY,
      width: carWidth,
      height: carLength,
      fill: "#f97316",
      stroke: "#9a3412",
      direction: "north",
    })
    : null;
  const leftVehicle = Number.isFinite(caseData.left)
    ? createVehicleMarker({
      centerX: 400 - getMajorSightOffset(caseData.left, caseData),
      centerY: getMajorConflictLaneCenter(roadGeometry, "left"),
      width: carLength,
      height: carWidth,
      fill: "#dbeafe",
      stroke: "#1d4ed8",
      direction: "east",
    })
    : null;
  const rightVehicle = Number.isFinite(caseData.right)
    ? createVehicleMarker({
      centerX: 400 + getMajorSightOffset(caseData.right, caseData),
      centerY: getMajorConflictLaneCenter(roadGeometry, "right"),
      width: carLength,
      height: carWidth,
      fill: "#dcfce7",
      stroke: "#15803d",
      direction: "west",
    })
    : null;

  return {
    minorVehicle: minorVehicle,
    leftVehicle: leftVehicle,
    rightVehicle: rightVehicle,
  };
}

function createVehicleMarker(config) {
  const x = config.centerX - config.width / 2;
  const y = config.centerY - config.height / 2;

  return {
    x: x,
    y: y,
    width: config.width,
    height: config.height,
    fill: config.fill,
    stroke: config.stroke,
    direction: config.direction,
    anchor: getVehicleAnchorPoint(x, y, config.width, config.height, config.direction),
  };
}

function buildVehicleMarker(vehicle) {
  const front = getVehicleFrontDetails(
    vehicle.x,
    vehicle.y,
    vehicle.width,
    vehicle.height,
    vehicle.direction
  );

  return `
    <g>
      <rect x="${vehicle.x}" y="${vehicle.y}" width="${vehicle.width}" height="${vehicle.height}" rx="4" fill="${vehicle.fill}" stroke="${vehicle.stroke}" stroke-width="1.5"></rect>
      ${front}
    </g>
  `;
}

function getVehicleAnchorPoint(x, y, width, height, direction) {
  if (direction === "east") {
    return { x: x + width, y: y + height / 2 };
  }

  if (direction === "west") {
    return { x: x, y: y + height / 2 };
  }

  return { x: x + width / 2, y: y };
}

function getVehicleFrontDetails(x, y, width, height, direction) {
  if (direction === "east") {
    return `
      <line x1="${x + width - 5}" y1="${y + 3}" x2="${x + width - 5}" y2="${y + height - 3}" stroke="#1e293b" stroke-width="2"></line>
      <circle cx="${x + width}" cy="${y + 4}" r="1.5" fill="#fde68a"></circle>
      <circle cx="${x + width}" cy="${y + height - 4}" r="1.5" fill="#fde68a"></circle>
    `;
  }

  if (direction === "west") {
    return `
      <line x1="${x + 5}" y1="${y + 3}" x2="${x + 5}" y2="${y + height - 3}" stroke="#1e293b" stroke-width="2"></line>
      <circle cx="${x}" cy="${y + 4}" r="1.5" fill="#fde68a"></circle>
      <circle cx="${x}" cy="${y + height - 4}" r="1.5" fill="#fde68a"></circle>
    `;
  }

  return `
    <line x1="${x + 3}" y1="${y + 5}" x2="${x + width - 3}" y2="${y + 5}" stroke="#1e293b" stroke-width="2"></line>
    <circle cx="${x + 4}" cy="${y}" r="1.5" fill="#fde68a"></circle>
    <circle cx="${x + width - 4}" cy="${y}" r="1.5" fill="#fde68a"></circle>
  `;
}

function buildMajorRoadMarkings(roadGeometry) {
  const laneHeight = roadGeometry.majorRoadWidthPx / roadGeometry.majorLaneCount;
  const markings = [];

  for (let laneIndex = 1; laneIndex < roadGeometry.majorLaneCount; laneIndex += 1) {
    const y = roadGeometry.majorTop + laneIndex * laneHeight;
    const isNearCenterline = Math.abs(y - roadGeometry.centerY) < 10;

    if (isNearCenterline) {
      continue;
    }

    markings.push(
      `<line x1="0" y1="${y}" x2="800" y2="${y}" stroke="#f8fafc" stroke-width="2" stroke-dasharray="16 14" stroke-linecap="round"></line>`
    );
  }

  if (roadGeometry.majorLaneCount >= 2) {
    markings.push(
      `<line x1="0" y1="${roadGeometry.centerY - 3}" x2="800" y2="${roadGeometry.centerY - 3}" stroke="#facc15" stroke-width="2"></line>`
    );
    markings.push(
      `<line x1="0" y1="${roadGeometry.centerY + 3}" x2="800" y2="${roadGeometry.centerY + 3}" stroke="#facc15" stroke-width="2"></line>`
    );
  }

  return markings.join("");
}

function getMajorConflictLaneCenter(roadGeometry, direction) {
  const laneHeight = roadGeometry.majorRoadWidthPx / roadGeometry.majorLaneCount;
  const laneCenters = Array.from(
    { length: roadGeometry.majorLaneCount },
    (_, index) => roadGeometry.majorTop + laneHeight * (index + 0.5)
  );

  if (direction === "left") {
    const lowerLaneCenters = laneCenters.filter((center) => center > roadGeometry.centerY);
    return lowerLaneCenters.length > 0
      ? lowerLaneCenters[lowerLaneCenters.length - 1]
      : laneCenters[laneCenters.length - 1];
  }

  const upperLaneCenters = laneCenters.filter((center) => center < roadGeometry.centerY);
  return upperLaneCenters.length > 0
    ? upperLaneCenters[upperLaneCenters.length - 1]
    : laneCenters[0];
}

function getMinorApproachLaneCenter(roadGeometry) {
  const laneWidth = roadGeometry.minorRoadWidthPx / roadGeometry.minorLaneCount;
  const laneCenters = Array.from(
    { length: roadGeometry.minorLaneCount },
    (_, index) => roadGeometry.minorLeft + laneWidth * (index + 0.5)
  );

  return laneCenters[laneCenters.length - 1];
}

function buildMinorRoadMarkings(roadGeometry) {
  const laneWidth = roadGeometry.minorRoadWidthPx / roadGeometry.minorLaneCount;
  const markings = [];

  for (let laneIndex = 1; laneIndex < roadGeometry.minorLaneCount; laneIndex += 1) {
    const x = roadGeometry.minorLeft + laneIndex * laneWidth;
    const isNearCenterline = Math.abs(x - 400) < 10;

    if (isNearCenterline) {
      continue;
    }

    markings.push(
      `<line x1="${x}" y1="${roadGeometry.minorTop}" x2="${x}" y2="${roadGeometry.minorBottom}" stroke="#f8fafc" stroke-width="2" stroke-dasharray="16 14" stroke-linecap="round"></line>`
    );
  }

  if (roadGeometry.minorLaneCount >= 2) {
    markings.push(
      `<line x1="${400 - 3}" y1="${roadGeometry.minorTop}" x2="${400 - 3}" y2="${roadGeometry.minorBottom}" stroke="#facc15" stroke-width="2"></line>`
    );
    markings.push(
      `<line x1="${400 + 3}" y1="${roadGeometry.minorTop}" x2="${400 + 3}" y2="${roadGeometry.minorBottom}" stroke="#facc15" stroke-width="2"></line>`
    );
  }

  return markings.join("");
}

function getRoadGeometry(caseData) {
  const majorRoadWidthFt = Number.isFinite(caseData.majorRoadWidthFt)
    ? caseData.majorRoadWidthFt
    : 24;
  const minorRoadWidthFt = Number.isFinite(caseData.minorRoadWidthFt)
    ? caseData.minorRoadWidthFt
    : Number.isFinite(caseData.laneWidth) && caseData.laneWidth > 0
      ? caseData.laneWidth
      : 24;
  const majorLaneCount = Number.isFinite(caseData.majorLaneCount)
    ? caseData.majorLaneCount
    : getLaneCountFromWidth(majorRoadWidthFt, 2);
  const minorLaneCount = Number.isFinite(caseData.minorLaneCount)
    ? caseData.minorLaneCount
    : getLaneCountFromWidth(minorRoadWidthFt, 1);
  const majorRoadWidthPx = getRoadWidthPixels(majorRoadWidthFt);
  const minorRoadWidthPx = getRoadWidthPixels(minorRoadWidthFt);

  return {
    centerY: 200,
    majorRoadWidthPx: majorRoadWidthPx,
    majorTop: 200 - majorRoadWidthPx / 2,
    majorBottom: 200 + majorRoadWidthPx / 2,
    majorLaneCount: majorLaneCount,
    minorRoadWidthPx: minorRoadWidthPx,
    minorLeft: 400 - minorRoadWidthPx / 2,
    minorRight: 400 + minorRoadWidthPx / 2,
    minorTop: 200 + majorRoadWidthPx / 2,
    minorBottom: 400,
    minorLaneCount: minorLaneCount,
  };
}

function getLaneCountFromWidth(widthFt, minimumLaneCount) {
  return Math.max(minimumLaneCount, Math.round(widthFt / 12));
}

function getRoadWidthPixels(widthFt) {
  return Math.max(36, Math.min(168, feetToSvg(widthFt)));
}

function feetToSvg(distanceFt) {
  return distanceFt * 3;
}

function svgToFeet(distanceSvg) {
  return distanceSvg / 3;
}

function calculateSightDistance() {
  const caseSelect = document.getElementById("caseSelect").value;

  switch (caseSelect) {
    case "A":
      // Calculation for case A
      const majorSpeedLeft = parseFloat(document.getElementById("majorSpeedLeft").value);
      const majorSpeedRight = parseFloat(document.getElementById("majorSpeedRight").value);

      const majorGradeLeft = document.getElementById("majorGradeLeft").value;
      const majorGradeRight = document.getElementById("majorGradeRight").value;

      const minorSpeed = parseFloat(document.getElementById("minorSpeed").value);
      const minorGrade = parseFloat(document.getElementById("minorGrade").value);

      const laneWidth = parseFloat(document.getElementById("laneWidth").value);

      const skew = parseFloat(document.getElementById("skew").value);




      const caseATable = {
        15: 70,
        20: 90,
        25: 115,
        30: 140,
        35: 165,
        40: 195,
        45: 220,
        50: 245,
        55: 285,
        60: 325,
        65: 365,
        70: 405,
        75: 445,
        80: 485,
      };
      // Validate input
      if (isNaN(majorSpeedLeft) || isNaN(majorSpeedRight) || isNaN(laneWidth) || isNaN(minorSpeed)) {
        alert("Please fill in all fields with valid numbers.");
        return;
      }

      if (skew < 75 || skew > 105) {
        alert("Sight distance criteria for case A are not to be applied to obleuq angle intersections intersection MUST be controled.");
        return;
      }

      const baseDistanceLeft = caseATable[majorSpeedLeft] || 0;
      const baseDistanceRight = caseATable[majorSpeedRight] || 0;
      const baseDistanceMinor = caseATable[minorSpeed] || 0;

      const adjustedDistanceLeft = baseDistanceLeft * adjustForGrade(majorSpeedLeft, majorGradeLeft);
      const adjustedDistanceRight = baseDistanceRight * adjustForGrade(majorSpeedRight, majorGradeRight);
      const adjustedDistanceMinor = baseDistanceMinor * adjustForGrade(minorSpeed, minorGrade);

      const sightDataA = {
        left: adjustedDistanceLeft,
        right: adjustedDistanceRight,
        a1: adjustedDistanceMinor,
        a2: adjustedDistanceMinor,
        laneWidth: laneWidth,
        majorRoadWidthFt: 24,
        majorLaneCount: 2,
        minorRoadWidthFt: Math.max(24, laneWidth * 2),
        minorLaneCount: getLaneCountFromWidth(Math.max(24, laneWidth * 2), 2),
      };
      updateDynamicSVG(sightDataA);

      const resultDivA = document.getElementById("result");
      resultDivA.innerHTML = `
            <div class="case-results">
              <div class="result-summary-title">Intersection Sight Distance for Case A</div>
              ${buildResultSection("Sight Distance Outputs", [
                buildDistanceMetric("Major Road b (Left)", adjustedDistanceLeft),
                buildDistanceMetric("Minor Road a1", adjustedDistanceMinor),
                buildDistanceMetric("Major Road b (Right)", adjustedDistanceRight),
                buildDistanceMetric("Minor Road a2", adjustedDistanceMinor + laneWidth),
              ], { primary: true })}
            </div>
        `;
      break;

    case "B":
      const majorSpeedLeftB = parseFloat(document.getElementById("majorSpeedLeft").value);
      const useDifferentMajorSpeedsB = document.getElementById("differentMajorSpeedsB").value === "yes";
      const majorSpeedRightB = useDifferentMajorSpeedsB
        ? parseFloat(document.getElementById("majorSpeedRight").value)
        : majorSpeedLeftB;
      const minorGradeB = parseFloat(document.getElementById("minorGrade").value);
      const evaluateLeftTurnB = document.getElementById("caseBLeftTurn").checked;
      const evaluateRightTurnB = document.getElementById("caseBRightTurn").checked;
      const evaluateCrossingB = document.getElementById("caseBCrossing").checked;
      const rightTurnOnlyB = evaluateRightTurnB && !evaluateLeftTurnB;
      const usesGeometryB = evaluateLeftTurnB || evaluateCrossingB;
      const carTypeB = document.getElementById("carType").value;
      const roadwayTypeB = usesGeometryB
        ? document.getElementById("caseBRoadwayType").value
        : "undivided";
      const laneWidthB = usesGeometryB
        ? parseFloat(document.getElementById("caseBLaneWidth").value)
        : 12;
      const undividedLanesPerDirectionB = usesGeometryB && roadwayTypeB === "undivided"
        ? parseInt(document.getElementById("caseBUndividedLanesPerDirection").value, 10)
        : 0;
      const undividedCenterLaneTypeB = usesGeometryB && roadwayTypeB === "undivided"
        ? document.getElementById("caseBUndividedCenterLaneType").value
        : "none";
      const dividedNearSideLaneCountB = usesGeometryB && roadwayTypeB === "divided"
        ? parseInt(document.getElementById("caseBDividedNearSideLanes").value, 10)
        : 0;
      const dividedFarSideLaneCountB = usesGeometryB && roadwayTypeB === "divided"
        ? parseInt(document.getElementById("caseBDividedFarSideLanes").value, 10)
        : 0;
      const medianWidthB = usesGeometryB && roadwayTypeB === "divided"
        ? parseFloat(document.getElementById("caseBDividedMedianWidth").value)
        : 0;
      const skewB = parseFloat(document.getElementById("skew").value);
      const undividedCenterLaneCountB = undividedCenterLaneTypeB === "none" ? 0 : 1;
      const nearSideLaneCountB = roadwayTypeB === "undivided"
        ? undividedLanesPerDirectionB + (undividedCenterLaneTypeB === "exclusive-left" ? 1 : 0)
        : dividedNearSideLaneCountB;
      const farSideLaneCountB = roadwayTypeB === "undivided"
        ? undividedLanesPerDirectionB
        : dividedFarSideLaneCountB;
      const effectiveNearSideWidthB = evaluateLeftTurnB
        ? nearSideLaneCountB * laneWidthB + (roadwayTypeB === "divided" ? medianWidthB : 0)
        : 0;
      const totalCrossedWidthB = evaluateCrossingB
        ? roadwayTypeB === "undivided"
          ? (undividedLanesPerDirectionB * 2 + undividedCenterLaneCountB) * laneWidthB
          : (nearSideLaneCountB + farSideLaneCountB) * laneWidthB + medianWidthB
        : 0;

      if (!evaluateLeftTurnB && !evaluateRightTurnB && !evaluateCrossingB) {
        alert("Select at least one Case B maneuver for this approach.");
        return;
      }

      // Validate input
      if (
        !Number.isFinite(minorGradeB) ||
        (usesGeometryB && !Number.isFinite(laneWidthB)) ||
        (usesGeometryB && roadwayTypeB === "undivided" && !Number.isFinite(undividedLanesPerDirectionB)) ||
        (usesGeometryB && roadwayTypeB === "divided" && !Number.isFinite(dividedNearSideLaneCountB)) ||
        (evaluateCrossingB && roadwayTypeB === "divided" && !Number.isFinite(dividedFarSideLaneCountB)) ||
        (usesGeometryB && roadwayTypeB === "divided" && !Number.isFinite(medianWidthB)) ||
        !Number.isFinite(skewB)
      ) {
        alert("Please fill in all fields with valid numbers.");
        return;
      }

      if (
        (usesGeometryB && laneWidthB <= 0) ||
        (usesGeometryB && roadwayTypeB === "undivided" && undividedLanesPerDirectionB < 1) ||
        (usesGeometryB && roadwayTypeB === "divided" && dividedNearSideLaneCountB < 1) ||
        (evaluateCrossingB && roadwayTypeB === "divided" && dividedFarSideLaneCountB < 0) ||
        (usesGeometryB && roadwayTypeB === "divided" && medianWidthB < 0) ||
        skewB <= 0 ||
        skewB >= 180
      ) {
        alert("Please use positive lane widths, valid lane counts, nonnegative median widths, and a skew angle between 0 and 180 degrees.");
        return;
      }

      const extraLanesB1 = evaluateLeftTurnB
        ? getCaseBExtraLanes(effectiveNearSideWidthB, 12, skewB)
        : 0;
      const extraLanesB2 = evaluateRightTurnB
        ? rightTurnOnlyB
          ? 0
          : extraLanesB1
        : 0;
      const extraLanesB3 = evaluateCrossingB
        ? getCaseBExtraLanes(totalCrossedWidthB, 24, skewB)
        : 0;

      const timeGapB1 = evaluateLeftTurnB
        ? timeGapforCaseB1[carTypeB] +
          getCaseBLaneTimeAdjustment(carTypeB, extraLanesB1) +
          getCaseBGradeTimeAdjustment(minorGradeB, 0.2)
        : null;
      const timeGapB2 = evaluateRightTurnB
        ? (rightTurnOnlyB ? timeGapforCaseB2[carTypeB] : timeGapforCaseB1[carTypeB]) +
          getCaseBLaneTimeAdjustment(carTypeB, extraLanesB2) +
          getCaseBGradeTimeAdjustment(minorGradeB, rightTurnOnlyB ? 0.1 : 0.2)
        : null;
      const timeGapB3 = evaluateCrossingB
        ? timeGapforCaseB3[carTypeB] +
          getCaseBLaneTimeAdjustment(carTypeB, extraLanesB3) +
          getCaseBGradeTimeAdjustment(minorGradeB, 0.2)
        : null;

      const sightDistanceB1Left = evaluateLeftTurnB ? 1.47 * majorSpeedLeftB * timeGapB1 : null;
      const sightDistanceB1Right = evaluateLeftTurnB ? 1.47 * majorSpeedRightB * timeGapB1 : null;
      const sightDistanceB2Left = evaluateRightTurnB ? 1.47 * majorSpeedLeftB * timeGapB2 : null;
      const sightDistanceB3Left = evaluateCrossingB ? 1.47 * majorSpeedLeftB * timeGapB3 : null;
      const sightDistanceB3Right = evaluateCrossingB ? 1.47 * majorSpeedRightB * timeGapB3 : null;

      const leftSideResultsB = [];
      const rightSideResultsB = [];
      const maneuverSectionsB = [];

      if (evaluateLeftTurnB) {
        leftSideResultsB.push({ label: "B1 Left Turn", value: sightDistanceB1Left });
        rightSideResultsB.push({ label: "B1 Left Turn", value: sightDistanceB1Right });
        maneuverSectionsB.push(
          buildResultSection("B1 Left Turn", [
            buildResultMetric("Time gap", `${timeGapB1.toFixed(2)} s`),
            buildResultMetric("Near-side width used", `${formatFeetLabel(effectiveNearSideWidthB)} ft`),
            ...(roadwayTypeB === "undivided"
              ? [buildResultMetric("Derived from", `${undividedLanesPerDirectionB} lane(s) per direction${undividedCenterLaneTypeB === "none" ? "" : undividedCenterLaneTypeB === "twltl" ? " with TWLTL" : " with exclusive center left-turn lane"}`)]
              : [buildResultMetric("Near-side lanes counted", `${nearSideLaneCountB}`)]),
            ...(roadwayTypeB === "divided" && medianWidthB > 0 ? [buildResultMetric("Median width included", `${formatFeetLabel(medianWidthB)} ft`)] : []),
            buildDistanceMetric("Traffic from left", sightDistanceB1Left),
            buildDistanceMetric("Traffic from right", sightDistanceB1Right),
          ])
        );
      }

      if (evaluateRightTurnB) {
        leftSideResultsB.push({ label: "B2 Right Turn", value: sightDistanceB2Left });
        maneuverSectionsB.push(
          buildResultSection("B2 Right Turn", [
            buildResultMetric("Time gap", `${timeGapB2.toFixed(2)} s`),
            ...(rightTurnOnlyB ? [] : [buildResultMetric("Near-side width used", `${formatFeetLabel(effectiveNearSideWidthB)} ft`)]),
            ...(!rightTurnOnlyB && roadwayTypeB === "divided" && medianWidthB > 0 ? [buildResultMetric("Median width included", `${formatFeetLabel(medianWidthB)} ft`)] : []),
            buildDistanceMetric("Traffic from left", sightDistanceB2Left),
          ], {
            note: rightTurnOnlyB
              ? "Reduced B2 time gap applied because this approach allows right turns without left turns."
              : "B2 uses the B1 time gap and the same near-side roadway width derived from the selected roadway geometry because left turns are also selected for this approach.",
          })
        );
      }

      if (evaluateCrossingB) {
        leftSideResultsB.push({ label: "B3 Crossing", value: sightDistanceB3Left });
        rightSideResultsB.push({ label: "B3 Crossing", value: sightDistanceB3Right });
        maneuverSectionsB.push(
          buildResultSection("B3 Crossing", [
            buildResultMetric("Time gap", `${timeGapB3.toFixed(2)} s`),
            buildResultMetric("Crossed width used", `${formatFeetLabel(totalCrossedWidthB)} ft`),
            ...(roadwayTypeB === "undivided"
              ? [buildResultMetric("Derived from", `${undividedLanesPerDirectionB} lane(s) per direction${undividedCenterLaneTypeB === "none" ? "" : undividedCenterLaneTypeB === "twltl" ? " with TWLTL" : " with exclusive center left-turn lane"}`)]
              : [
                buildResultMetric("Near-side lanes counted", `${nearSideLaneCountB}`),
                buildResultMetric("Far-side lanes counted", `${farSideLaneCountB}`),
              ]),
            ...(roadwayTypeB === "divided" && medianWidthB > 0 ? [buildResultMetric("Median width included", `${formatFeetLabel(medianWidthB)} ft`)] : []),
            buildDistanceMetric("Traffic from left", sightDistanceB3Left),
            buildDistanceMetric("Traffic from right", sightDistanceB3Right),
          ])
        );
      }

      const controllingSightDistanceLeft = getControllingResult(leftSideResultsB);
      const controllingSightDistanceRight = getControllingResult(rightSideResultsB);
      const visualMajorRoadWidthFt = Math.max(
        24,
        evaluateLeftTurnB ? effectiveNearSideWidthB : 0,
        evaluateCrossingB ? totalCrossedWidthB : 0
      );

      const sightDataB = {
        left: controllingSightDistanceLeft ? controllingSightDistanceLeft.value : undefined,
        right: controllingSightDistanceRight ? controllingSightDistanceRight.value : undefined,
        a1: DEFAULT_CASE_B_DECISION_POINT_SETBACK_FT,
        a2: DEFAULT_CASE_B_DECISION_POINT_SETBACK_FT,
        laneWidth: 0,
        majorRoadWidthFt: visualMajorRoadWidthFt,
        majorLaneCount: getLaneCountFromWidth(visualMajorRoadWidthFt, 2),
        minorRoadWidthFt: 24,
        minorLaneCount: 2,
        decisionPointSetbackFt: DEFAULT_CASE_B_DECISION_POINT_SETBACK_FT,
        deriveMinorLegsFromGeometry: true,
        majorLegVisualBasePx: 70,
        majorLegVisualScale: 0.32,
        majorLegVisualMinPx: 130,
        majorLegVisualMaxPx: 285,
      };

      updateDynamicSVG(sightDataB);

      const resultDivB = document.getElementById("result");
      resultDivB.innerHTML = `
            <div class="case-results">
              <div class="result-summary-title">Intersection Sight Distance for Case B</div>
              ${buildResultSection("Final Design Outputs", [
                ...(controllingSightDistanceLeft
                  ? [buildDistanceMetric(`Controlling sight distance to the left (${controllingSightDistanceLeft.label})`, controllingSightDistanceLeft.value, "result-metric-value-primary")]
                  : []),
                ...(controllingSightDistanceRight
                  ? [buildDistanceMetric(`Controlling sight distance to the right (${controllingSightDistanceRight.label})`, controllingSightDistanceRight.value, "result-metric-value-primary")]
                  : []),
              ], { primary: true })}
              ${maneuverSectionsB.join("")}
            </div>
        `;
      break;

    case "C":
      const majorSpeedLeftC = parseFloat(document.getElementById("majorSpeedLeft").value);
      const majorSpeedRightC = parseFloat(document.getElementById("majorSpeedRight").value);

      const minorSpeedC = parseFloat(document.getElementById("minorSpeed").value);
      const minorGradeC = parseFloat(document.getElementById("minorGrade").value);

      const carTypeC = document.getElementById("carType").value;

      const roadWidth = parseFloat(document.getElementById("roadWidth").value);
      const vehLength = parseFloat(document.getElementById("vehLength").value);

      const medianWidthC = parseFloat(document.getElementById("medianWidth").value);
      const lanesCrossedLeftC = parseInt(document.getElementById("lanesCrossedLeft").value);

      let a1C1 = 0;
      let ta = 0;
      let tgC1 = 0;
      let timeLeftC = 0;




      // Validate input
      if (isNaN(majorSpeedLeftC) || isNaN(majorSpeedRightC) || isNaN(minorGradeC) || isNaN(roadWidth) || isNaN(vehLength) || isNaN(medianWidthC)) {
        alert("Please fill in all fields with valid numbers.");
        return;
      }

      //C1 - Crossing

      //Minor Approach a length
      a1C1 = crossingManeuversTable.find(row => row.designSpeed === minorSpeedC).lengthOfLeg;
      a1C1 = a1C1 * adjustForGrade(minorSpeedC, minorGradeC);

      //Major Approach b length

      ta = crossingManeuversTable.find(row => row.designSpeed === minorSpeedC).travelTimeTab;
      ta = ta * adjustForGrade(minorSpeedC, minorGradeC);

      tgC1 = ta + ((roadWidth + vehLength) / (0.88 * minorSpeedC));

      //The value of tg should equal or exceed the appropriate time gap for crossing the major road from a stop-controlled approach. 
      if (tgC1 < crossingManeuversTable.find(row => row.designSpeed === minorSpeedC).designValue) {

        tgC1 = crossingManeuversTable.find(row => row.designSpeed === minorSpeedC).designValue;

      };

      const maxMajorSpeedC = Math.max(majorSpeedLeftC, majorSpeedRightC);
      const bC1 = 1.47 * maxMajorSpeedC * tgC1;

      //C2 - Left and Right Turns
      const a1C2 = 82;
      // Get addtional time for medians and exta lane crosssed.
      const tgC2 = timeGapforCaseC2[carTypeC]
      timeLeftC = carTypeC === "passenger car" ? 0.5 * (medianWidthC / 12 + lanesCrossedLeftC - 1) : 0.7 * (medianWidthC / 12 + lanesCrossedLeftC - 1);
      const bC2 = 1.47 * maxMajorSpeedC * tgC2 + timeLeftC;

      const sightDataC = {
        left: bC2,
        right: bC2,
        a1: 15,
        a2: 15,
        laneWidth: 0,
        majorRoadWidthFt: roadWidth,
        majorLaneCount: getLaneCountFromWidth(roadWidth, 2),
        minorRoadWidthFt: 24,
        minorLaneCount: 2,
      };

      updateDynamicSVG(sightDataC);

      const resultDivC = document.getElementById("result");
      resultDivC.innerHTML = `
            <div class="case-results">
              <div class="result-summary-title">Intersection Sight Distance for Case C</div>
              ${buildResultSection("C1 Crossing", [
                buildResultMetric("Time gap", `${tgC1.toFixed(2)} s`),
                buildDistanceMetric("a1", a1C1),
                buildDistanceMetric("b", bC1),
                buildResultMetric("Ta", `${ta.toFixed(2)} s`),
              ], { primary: true })}
              ${buildResultSection("C2 Left And Right Turns", [
                buildResultMetric("Time gap", `${tgC2.toFixed(2)} s`),
                ...(medianWidthC > 0 ? [buildResultMetric("Median width included", `${formatFeetLabel(medianWidthC)} ft`)] : []),
                buildDistanceMetric("a1", a1C2),
                buildDistanceMetric("a2", a1C2 + roadWidth / 2),
                buildDistanceMetric("b", bC2),
              ])}
            </div>
        `;
      break;

    case "D":
      // Calculation for case D
      const flashSignal = document.getElementById("flashSignal").value;

      if (flashSignal === "yes") {
        const resultDivD = document.getElementById("result");
        resultDivD.innerHTML = `
                <strong>Intersection Sight Distance for Case D:</strong><br>
                <strong>Flash Signal:</strong> Yes<br>
                <strong>Requirement:</strong> If the traffic signal is to be placed on two-way flashing operation 
                (i.e., flashing yellow on the major-road approaches and flashing red on the minor-road approaches) under 
                off-peak or nighttime conditions, then the appropriate departure sight triangles for Case B, both to the left and to the right,
                should be provided for the minor-road approaches. In addition, if right turns on a red signal are to be permitted
                from any approach, then the appropriate departure sight triangle to the left for Case B2 should be provided to accommodate right turns from that approach. <br>
            `;
      }

      break;

    case "E":
      // Calculation for case E
      const signal = document.getElementById("signal").value;

      if (signal === "yes") {
        const resultDivD = document.getElementById("result");
        resultDivD.innerHTML = `
                <strong>Intersection Sight Distance for Case E:</strong><br>
                <strong>Signal:</strong> Yes<br>
                <strong>Requirement:</strong> If the projected traffic volumes 
                indicate that the intersection may need to be signalized within a few years, then consideration 
                should be given to providing sight distances for Case D. The CaseD sight distances do not differ 
                markedly from the Case E sight distances except where provision is made to accommodate two-way flashing
                operation and or right turn on red at the future signal. <br>
            `;
      }
      break;

    case "F":
      // Calculation for case F
      const majorSpeedLeftF = parseFloat(document.getElementById("majorSpeed").value);

      const carTypeF = document.getElementById("carType").value;

      const medianWidthF = parseFloat(document.getElementById("medianWidth").value);
      const lanesCrossedLeftF = parseInt(document.getElementById("lanesCrossedLeft").value);

      let timeLeftF = 0;

      // Validate input
      if (isNaN(majorSpeedLeftF) || isNaN(medianWidthF) || isNaN(lanesCrossedLeftF)) {
        alert("Please fill in all fields with valid numbers.");
        return;
      }

      // Get addtional time for medians and exta lane crosssed.
      timeLeftF = carTypeF === "passenger car" ? 0.5 * (medianWidthF / 12 + lanesCrossedLeftF - 1) : 0.7 * (medianWidthF / 12 + lanesCrossedLeftF - 1);

      // Get time gaps
      timeLeftF = timeGapforCaseF[carTypeF] + timeLeftF;  // left turns

      const sightDistanceF = 1.47 * majorSpeedLeftF * timeLeftF; // Left turns

      const sightDataF = {
        left: sightDistanceF,
        a1: 10,
        a2: 10,
        laneWidth: 0,
        majorRoadWidthFt: Math.max(24, medianWidthF + lanesCrossedLeftF * 12),
        majorLaneCount: getLaneCountFromWidth(
          Math.max(24, medianWidthF + lanesCrossedLeftF * 12),
          2
        ),
        minorRoadWidthFt: 24,
        minorLaneCount: 2,
        showMinorVehicle: false,
      };

      updateDynamicSVG(sightDataF);

      const resultDivF = document.getElementById("result");
      resultDivF.innerHTML = `
            <div class="case-results">
              <div class="result-summary-title">Intersection Sight Distance for Case F</div>
              ${buildResultSection("Sight Distance Outputs", [
                buildDistanceMetric("Left Turn", sightDistanceF),
              ], { primary: true })}
            </div>
          `;
      break;

    case "G":
      // Calculation for case G
      const majorSpeedEntering = parseFloat(document.getElementById("majorSpeedEntering").value);
      const majorSpeedCirculating = parseFloat(document.getElementById("majorSpeedCirculating").value);
      const criticalHeadway = parseFloat(document.getElementById("criticalHeadway").value);

      // Validate input
      if (isNaN(majorSpeedEntering) || isNaN(majorSpeedCirculating) || isNaN(criticalHeadway)) {
        alert("Please fill in all fields with valid numbers.");
        return;
      }


      const sightDistanceGd1 = 1.47 * majorSpeedEntering * criticalHeadway
      const sightDistanceGd2 = 1.47 * majorSpeedCirculating * criticalHeadway

      // Display the static image and overlay text
      document.getElementById("sight-triangle").style.display = "none";
      document.getElementById("roundabout-image").style.display = "block";

      const resultDivG = document.getElementById("result");
      resultDivG.innerHTML = `
            <div class="case-results">
              <div class="result-summary-title">Intersection Sight Distance for Case G</div>
              ${buildResultSection("Roundabout Sight Distance Outputs", [
                buildDistanceMetric("d1 = entering leg of sight triangle", sightDistanceGd1),
                buildDistanceMetric("d2 = entering leg of sight triangle", sightDistanceGd2),
              ], { primary: true })}
            </div>
          `;
      break;
  }
}

function adjustForGrade(speed, grade) {
  // Retrieve the grade adjustment factor
  const adjustmentFactor = gradeAdjustmentTable[grade]?.[speed];
  if (!adjustmentFactor) {
    console.error(
      `Grade adjustment not found for speed ${speed} and grade ${grade}`
    );
    return 1; // Default adjustment factor
  }
  return adjustmentFactor;
}

function getCaseBGradeTimeAdjustment(grade, secondsPerPercent) {
  return grade > 3 ? grade * secondsPerPercent : 0;
}

// AASHTO adds skew-based lane time only when the actual path is at least 12 ft longer.
function getCaseBExtraLanes(widthToCross, baseWidth, skewDegrees) {
  const skewRadians = (skewDegrees * Math.PI) / 180;
  const sinSkew = Math.sin(skewRadians);

  if (sinSkew <= 0) {
    return 0;
  }

  const extraLanesFromWidth = Math.max(0, (widthToCross - baseWidth) / 12);
  const actualPathWidth = widthToCross / sinSkew;
  const extraWidthFromSkew = actualPathWidth - widthToCross;
  const extraLanesFromSkew = extraWidthFromSkew >= 12 ? extraWidthFromSkew / 12 : 0;

  return extraLanesFromWidth + extraLanesFromSkew;
}

function getCaseBLaneTimeAdjustment(vehicleType, extraLanes) {
  const secondsPerLane = vehicleType === "passenger car" ? 0.5 : 0.7;
  return secondsPerLane * extraLanes;
}

//Left turn from stop
const timeGapforCaseB1 = {
  "passenger car": 7.5,
  "single unit truck": 9.5,
  "combination truck": 11.5
};

//Right turn from stop
const timeGapforCaseB2 = {
  "passenger car": 6.5,
  "single unit truck": 8.5,
  "combination truck": 10.5
};

//Crossing from stop
const timeGapforCaseB3 = {
  "passenger car": 6.5,
  "single unit truck": 8.5,
  "combination truck": 10.5
};

//Right turn from stop
const timeGapforCaseC2 = {
  "passenger car": 8.0,
  "single unit truck": 10.0,
  "combination truck": 12.0
};

//Left turn from the Major Road
const timeGapforCaseF = {
  "passenger car": 5.5,
  "single unit truck": 6.5,
  "combination truck": 7.5
};

//Table 9-12 ta which is travel time to reach the major road from the decsion point for a veh that does not stop (s).
const crossingManeuversTable = [
  { designSpeed: 15, lengthOfLeg: 75, travelTimeTab: 3.4, calculatedValue: 6.7, designValue: 6.7 },
  { designSpeed: 20, lengthOfLeg: 100, travelTimeTab: 3.7, calculatedValue: 6.1, designValue: 6.5 },
  { designSpeed: 25, lengthOfLeg: 130, travelTimeTab: 4.0, calculatedValue: 6.0, designValue: 6.5 },
  { designSpeed: 30, lengthOfLeg: 160, travelTimeTab: 4.3, calculatedValue: 5.9, designValue: 6.5 },
  { designSpeed: 35, lengthOfLeg: 195, travelTimeTab: 4.6, calculatedValue: 6.0, designValue: 6.5 },
  { designSpeed: 40, lengthOfLeg: 235, travelTimeTab: 4.9, calculatedValue: 6.1, designValue: 6.5 },
  { designSpeed: 45, lengthOfLeg: 275, travelTimeTab: 5.2, calculatedValue: 6.3, designValue: 6.5 },
  { designSpeed: 50, lengthOfLeg: 320, travelTimeTab: 5.5, calculatedValue: 6.5, designValue: 6.5 },
  { designSpeed: 55, lengthOfLeg: 370, travelTimeTab: 5.8, calculatedValue: 6.7, designValue: 6.7 },
  { designSpeed: 60, lengthOfLeg: 420, travelTimeTab: 6.1, calculatedValue: 6.9, designValue: 6.9 },
  { designSpeed: 65, lengthOfLeg: 470, travelTimeTab: 6.4, calculatedValue: 7.2, designValue: 7.2 },
  { designSpeed: 70, lengthOfLeg: 530, travelTimeTab: 6.7, calculatedValue: 7.4, designValue: 7.4 },
  { designSpeed: 75, lengthOfLeg: 590, travelTimeTab: 7.0, calculatedValue: 7.7, designValue: 7.7 },
  { designSpeed: 80, lengthOfLeg: 660, travelTimeTab: 7.3, calculatedValue: 7.9, designValue: 7.9 }
];

const gradeAdjustmentTable = {
  "-6": {
    15: 1.1,
    20: 1.1,
    25: 1.1,
    30: 1.1,
    35: 1.1,
    40: 1.1,
    45: 1.1,
    50: 1.2,
    55: 1.2,
    60: 1.2,
    65: 1.2,
    70: 1.2,
    75: 1.2,
    80: 1.2,
  },
  "-5": {
    15: 1.0,
    20: 1.0,
    25: 1.1,
    30: 1.1,
    35: 1.1,
    40: 1.1,
    45: 1.1,
    50: 1.1,
    55: 1.2,
    60: 1.2,
    65: 1.2,
    70: 1.2,
    75: 1.2,
    80: 1.2,
  },
  "-4": {
    15: 1.0,
    20: 1.0,
    25: 1.0,
    30: 1.1,
    35: 1.1,
    40: 1.1,
    45: 1.1,
    50: 1.1,
    55: 1.1,
    60: 1.1,
    65: 1.1,
    70: 1.2,
    75: 1.2,
    80: 1.2,
  },
  "-3": {
    15: 1.0,
    20: 1.0,
    25: 1.0,
    30: 1.0,
    35: 1.0,
    40: 1.0,
    45: 1.0,
    50: 1.0,
    55: 1.0,
    60: 1.0,
    65: 1.0,
    70: 1.0,
    75: 1.0,
    80: 1.0,
  },
  4: {
    15: 1.0,
    20: 1.0,
    25: 0.9,
    30: 0.9,
    35: 0.9,
    40: 0.9,
    45: 0.9,
    50: 0.9,
    55: 0.9,
    60: 0.9,
    65: 0.9,
    70: 0.9,
    75: 0.9,
    80: 0.9,
  },
  5: {
    15: 1.0,
    20: 1.0,
    25: 0.9,
    30: 0.9,
    35: 0.9,
    40: 0.9,
    45: 0.9,
    50: 0.9,
    55: 0.9,
    60: 0.9,
    65: 0.9,
    70: 0.9,
    75: 0.9,
    80: 0.9,
  },
  6: {
    15: 1.0,
    20: 1.0,
    25: 0.9,
    30: 0.9,
    35: 0.9,
    40: 0.9,
    45: 0.9,
    50: 0.9,
    55: 0.9,
    60: 0.9,
    65: 0.9,
    70: 0.9,
    75: 0.9,
    80: 0.9,
  },
};
