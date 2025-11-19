function updateForm() {
  const caseSelect = document.getElementById("caseSelect").value;
  const dynamicInputs = document.getElementById("dynamicInputs");
  dynamicInputs.innerHTML = "";

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
                <label for="majorSpeedLeft">Speed on Major Road (Left) (V<sub>major</sub>):</label>
                <select id="majorSpeedLeft">${speedOptions}</select><br>
                
                <label for="majorSpeedRight">Speed on Major Road (Right) (V<sub>major</sub>):</label>
                <select id="majorSpeedRight">${speedOptions}</select><br>

                <label for="carType">Type of Vehicle:</label>
                <select id="carType" required>
                    <option value="passenger car">Passenger Car</option>
                    <option value="single unit truck">Single Unit Truck</option>
                    <option value="combination truck">Combination Truck</option>
                </select><br>

                <!-- Minor Road Approach -->
                <label for="minorGrade">Minor Road Approach Grade (%):</label>
                <input type="number" id="minorGrade" placeholder="Enter minor grade (%)" value="3" required><br>

                <!-- Widths -->
                <label for="widthLanesCrossedLeft">Total width of roadway to be crossed for Left Turn (B1) (including turn lanes, and median or dead lane):</label>
                <input type="number" id="widthLanesCrossedLeft" placeholder="Enter number" value="12" required><br>
                
                <label for="widthLanesCrossedRight">Total width of roadway to be crossed for Right Turn (B1) (This would be jsut turn lanes):</label>
                <input type="number" id="widthLanesCrossedRight" placeholder="Enter 0 if no right turn lanes" value="0" required><br>
          

                <label for="widthMajorRoad">Width of Road (ft):</label>
                <input type="number" id="widthMajorRoad" placeholder="24 is for a two lane road" value="24" required><br>
               
                <!-- Skew -->
                <label for="skew">skew or angle of intersection (degrees):</label>
                <input type="number" id="skew" placeholder="Enter angle between minor and major roads" value="90" required><br>

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

  // Remove any existing dynamic labels
  const existingLabels = svg.querySelectorAll("text.dynamic");
  existingLabels.forEach((label) => label.remove());

  // Update triangles based on case data
  if (caseData.left && caseData.right) {
    document
      .getElementById("sight-left")
      .setAttribute(
        "points",
        `400,200 ${400 - caseData.left},200 400,${200 + caseData.a1}`
      );
    document
      .getElementById("sight-right")
      .setAttribute(
        "points",
        `400,${200 - caseData.laneWidth} ${400 + caseData.right},${200 - caseData.laneWidth} 400,${200 + caseData.a2}`
      );
  }

  // Add labels dynamically for the updated sight triangles
  svg.innerHTML += `
     <text x="${400 - caseData.left / 2}" y="${(200 - caseData.laneWidth)}" font-size="12" class="dynamic" fill="blue">b Left (${caseData.left} ft)</text>
     <text x="${400 + caseData.right / 2}" y="${(200 - caseData.laneWidth)}" font-size="12" class="dynamic" fill="green">b Right (${caseData.right} ft)</text>
     <text x="${400 - caseData.left / 2}" y="${200 + 100}" font-size="12" class="dynamic" fill="green">a1 (${caseData.a1} ft)</text>
     <text x="${400 + caseData.right / 2}" y="${200 + 100}" font-size="12" class="dynamic" fill="green">a2 (${(caseData.a2 + caseData.laneWidth)} ft)</text>
    `;
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
      };
      updateDynamicSVG(sightDataA);

      const resultDivA = document.getElementById("result");
      resultDivA.innerHTML = `
            <strong>Intersection Sight Distance:</strong><br>
            <strong>Major Road b (Left):</strong> ${adjustedDistanceLeft.toFixed(2)} ft<br>
            <strong>Minor Road a<sub>1</sub> (Left):</strong> ${adjustedDistanceMinor.toFixed(2)} ft<br>
            <strong>Major Road b (Right):</strong> ${adjustedDistanceRight.toFixed(2)} ft<br>
            <strong>Minor Road a<sub>2</sub> (Left):</strong> ${(adjustedDistanceMinor + laneWidth).toFixed(2)} ft<br>
        `;
      break;

    case "B":
      const majorSpeedLeftB = parseFloat(document.getElementById("majorSpeedLeft").value);
      const majorSpeedRightB = parseFloat(document.getElementById("majorSpeedRight").value);
      const maxMajorSpeedB = Math.max(majorSpeedRightB, majorSpeedLeftB);

      const minorGradeB = parseFloat(document.getElementById("minorGrade").value);

      const carTypeB = document.getElementById("carType").value;

      const widthLanesCrossedLeft = parseInt(document.getElementById("widthLanesCrossedLeft").value);
      const widthLanesCrossedRight = parseInt(document.getElementById("widthLanesCrossedRight").value);

      const widthRoad = parseInt(document.getElementById("widthMajorRoad").value);

      const skewB = parseFloat(document.getElementById("skew").value);


      let timeLeft = 0;
      let timeCross = 0;
      let timeGrade = 0;
      let w2Left = 0;
      let w2Right = 0;
      let w2Cross = 0;




      // Validate input
      if (isNaN(widthRoad) || isNaN(widthLanesCrossedLeft) || isNaN(skewB)) {
        alert("Please fill in all fields with valid numbers.");
        return;

      }

      //skew calcs
      const skewB_Rads = skewB * Math.PI / 180;
      w2Left = (widthLanesCrossedLeft / Math.sin(skewB_Rads));
      w2Right = (widthLanesCrossedRight / Math.sin(skewB_Rads));
      w2Cross = (widthRoad / Math.sin(skewB_Rads));

      w2Left = (w2Left - 12) / 12;
      w2Right = (w2Right - 12) / 12;
      w2Cross = (w2Cross - 12) / 12;

      // Get addtional time for medians and exta lane crosssed.
      timeLeft = carTypeB === "passenger car" ? 0.5 * ((w2Left)) : 0.7 * ((w2Left));
      timeRight = carTypeB === "passenger car" ? 0.5 * ((w2Right)) : 0.7 * ((w2Right)); //This is put in by me.
      timeCross = carTypeB === "passenger car" ? 0.5 * ((w2Cross)) : 0.7 * ((w2Cross));

      // Get addtional time for uphill grades over 3%
      if (minorGradeB > 3) {
        timeGrade = 0.2 * (minorGradeB - 3);
      }




      // Get time gaps
      timeGapB1 = timeGapforCaseB1[carTypeB] + timeLeft + timeGrade;  // left turns
      timeGapB2 = timeGapforCaseB2[carTypeB] + timeRight + timeGrade; // right turns
      timeGapB3 = timeGapforCaseB3[carTypeB] + timeCross + timeGrade; // crossing manevuer



      const sightDistanceB1 = 1.47 * majorSpeedLeftB * timeGapB1; // Left turns
      const sightDistanceB2 = 1.47 * majorSpeedRightB * timeGapB2; // Right turns
      const sightDistanceB3 = 1.47 * maxMajorSpeedB * timeGapB3; // Crossing

      const sightDataB = {
        left: sightDistanceB1,
        right: sightDistanceB2,
        a1: 15,
        a2: 15,
        laneWidth: 0,
      };

      updateDynamicSVG(sightDataB);

      const resultDivB = document.getElementById("result");
      resultDivB.innerHTML = `
            <strong>Intersection Sight Distance for Case B:</strong><br>
            <strong>tg (B1):</strong> ${timeGapB1.toFixed(2)} s<br>
            <strong>Left Turn (B1):</strong> ${sightDistanceB1.toFixed(2)} ft<br>
            <strong>tg (B2):</strong> ${timeGapB2.toFixed(2)} s<br>
            <strong>Right Turn (B2)***:</strong> ${sightDistanceB2.toFixed(2)} ft<br>
            <normal>*** Applies only where turns are limtied to right turns;  where turns are also permited, Casse B1 applies.</normal><br>
            <strong>tg (B3):</strong> ${timeGapB3.toFixed(2)} s<br>
            <strong>Crossing (B3):</strong> ${sightDistanceB3.toFixed(2)} ft<br>
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

      const medianWidthC = parseFloat(document.getElementById("roadWidth").value);
      const lanesCrossedLeftC = parseInt(document.getElementById("lanesCrossedLeft").value);

      let a1C1 = 0;
      let ta = 0;
      let tgC1 = 0;
      let timeLeftC = 0;




      // Validate input
      if (isNaN(majorSpeedLeftC) || isNaN(majorSpeedRightC) || isNaN(minorGradeC) || isNaN(roadWidth) || isNaN(vehLength)) {
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
      };

      updateDynamicSVG(sightDataC);

      const resultDivC = document.getElementById("result");
      resultDivC.innerHTML = `
            <h1>Intersection Sight Distance for Case C:</h1><br>
            <h2>C1 - Crossing</h2><br>
            <normal>Tg:</normal> ${tgC1.toFixed(2)} s<br>
            <normal>a1C1:</normal> ${a1C1.toFixed(2)} ft<br>
            <normal>bC1:</normal> ${bC1.toFixed(2)} ft<br>
            <normal>Ta (Travel time applies to a vehcile that slows before crossing the intersection but does not stop):</normal> ${ta.toFixed(2)} s<br>
            <h2>C2 - Left and Right Turns</h2><br>
            <normal>Tg:</normal> ${tgC2.toFixed(2)} s<br>
            <normal>a1C2:</normal> ${a1C2.toFixed(2)} ft<br>
            <normal>a2C2:</normal> ${a1C2.toFixed(2) + roadWidth / 2} ft<br>
            <normal>bC2:</normal> ${bC2.toFixed(2)} ft<br>
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
      };

      updateDynamicSVG(sightDataF);

      const resultDivF = document.getElementById("result");
      resultDivF.innerHTML = `
            <strong>Intersection Sight Distance for Case F:</strong><br>
            <strong>Left Turn:</strong> ${sightDistanceF.toFixed(2)} ft<br>
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
            <strong>Intersection Sight Distance for Case G:</strong><br>
            <strong>d1 = length of entering leg of sight triangle, ft:</strong> ${sightDistanceGd1.toFixed(2)} ft<br>
            <strong>d2 = length of entering leg of sight triangle, ft:</strong> ${sightDistanceGd2.toFixed(2)} ft<br>
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
