const MUTCD_SIGN_DATA = [
  {
    code: 'R1-1',
    name: 'STOP',
    category: 'Regulatory',
    series: 'R1',
    colorFamily: 'Red',
    section: '2B.05',
    description: 'Octagonal stop control sign that assigns right-of-way at intersections, roundabouts, and midblock crossings.',
    usage: 'Use where an engineering study finds that full stop control is needed. Pair with a stop line or crosswalk when present and consider multi-way plaques when warrants are met.',
    notes: 'Minimum size 30 in (urban) or 36 in (rural); 36/48 in for multi-lane approaches.',
    keywords: 'all way stop, right-of-way, control'
  },
  {
    code: 'R1-2',
    name: 'YIELD',
    category: 'Regulatory',
    series: 'R1',
    colorFamily: 'Red',
    section: '2B.08',
    description: 'Triangular sign requiring drivers to give right-of-way to conflicting traffic before entering.',
    usage: 'Common at ramp terminals and channelized turns where a full stop is not warranted but conflicting flow exists.',
    notes: 'Use yield line (shark teeth) or dotted extension through the conflict where needed.',
    keywords: 'merge, channelized, yield line'
  },
  {
    code: 'R1-3P',
    name: 'ALL WAY plaque',
    category: 'Regulatory',
    series: 'R1',
    colorFamily: 'Red',
    section: '2B.05',
    description: 'Supplemental plaque identifying that all approaches are controlled by stop signs.',
    usage: 'Install beneath each STOP sign at multi-way controlled intersections.',
    notes: 'Multi-way text may also show 4-WAY or 3-WAY when agency practice requires.',
    keywords: 'multi way, plaque, supplemental'
  },
  {
    code: 'R2-1',
    name: 'SPEED LIMIT',
    category: 'Regulatory',
    series: 'R2',
    colorFamily: 'White',
    section: '2B.13',
    description: 'Rectangular sign that states the statutory or posted maximum speed for the segment.',
    usage: 'Place near where the posted speed changes and repeat after major intersections or at 1 mile spacing in rural areas.',
    notes: 'Only display whole speeds rounded to the nearest 5 mph unless statute directs otherwise.',
    keywords: 'posted speed, regulatory speed'
  },
  {
    code: 'R2-5',
    name: 'NIGHT SPEED LIMIT',
    category: 'Regulatory',
    series: 'R2',
    colorFamily: 'White',
    section: '2B.14',
    description: 'Black legend on white sign showing a reduced nighttime maximum speed.',
    usage: 'Supplement a primary speed limit sign when an engineering study establishes a lower speed for dark conditions.',
    notes: 'Not a warning plaque—only use where separately authorized by statute or policy.',
    keywords: 'nighttime, reduced speed'
  },
  {
    code: 'R3-1',
    name: 'NO RIGHT TURN',
    category: 'Regulatory',
    series: 'R3',
    colorFamily: 'White',
    section: '2B.18',
    description: 'Prohibits right turns by using a symbol with a red circle and diagonal slash.',
    usage: 'Mount near the signal head or stop line where movements conflict with transit, bike, or pedestrian phases.',
    notes: 'Use multiple signs on multi-lane approaches to cover each lane group.',
    keywords: 'prohibited movement, turn restriction'
  },
  {
    code: 'R3-2',
    name: 'NO LEFT TURN',
    category: 'Regulatory',
    series: 'R3',
    colorFamily: 'White',
    section: '2B.18',
    description: 'Shows that left turns are not allowed at the location.',
    usage: 'Typically used at high-volume intersections to remove conflicting movements or at medians with channelization.',
    notes: 'Combine with U-turn prohibition plaques where both maneuvers are removed.',
    keywords: 'left turn restriction, movement prohibition'
  },
  {
    code: 'R3-4',
    name: 'ONE WAY',
    category: 'Regulatory',
    series: 'R3',
    colorFamily: 'White',
    section: '2B.20',
    description: 'Horizontal sign with an arrow showing the permitted traffic direction on one-way streets.',
    usage: 'Place at each intersection where a driver can enter the one-way roadway, including driveways and alleys.',
    notes: 'Coordinate with Do Not Enter signs on opposing approaches.',
    keywords: 'one-way street, downtown grid'
  },
  {
    code: 'R4-1',
    name: 'DO NOT PASS',
    category: 'Regulatory',
    series: 'R4',
    colorFamily: 'White',
    section: '2B.29',
    description: 'Defines the beginning of a no-passing zone for two-lane two-way highways.',
    usage: 'Place at the start of the restrictive centerline marking or where vertical alignment limits sight distance.',
    notes: 'Pair with a PASS WITH CARE sign at the downstream end of the zone.',
    keywords: 'no passing zone, two lane'
  },
  {
    code: 'R4-7',
    name: 'KEEP RIGHT',
    category: 'Regulatory',
    series: 'R4',
    colorFamily: 'White',
    section: '2B.33',
    description: 'Chevron-style sign directing traffic to keep right of an obstruction such as a median island or barrier.',
    usage: 'Install at gore points, channelizing islands, and roundabout splitter islands.',
    notes: 'Use a retroreflective object marker if a sign cannot be maintained.',
    keywords: 'channelization, object marker'
  },
  {
    code: 'R5-1',
    name: 'DO NOT ENTER',
    category: 'Regulatory',
    series: 'R5',
    colorFamily: 'Red',
    section: '2B.37',
    description: 'Red circular symbol warning drivers that the roadway is restricted to opposing traffic.',
    usage: 'Install at the downstream ends of freeway ramps and at crossovers where wrong-way entries are possible.',
    notes: 'Use with ONE WAY or WRONG WAY signs for redundancy.',
    keywords: 'wrong way, ramp terminal'
  },
  {
    code: 'R7-1',
    name: 'NO PARKING',
    category: 'Regulatory',
    series: 'R7',
    colorFamily: 'White',
    section: '2B.46',
    description: 'States that parking is not allowed along a curb segment.',
    usage: 'Place at the start of the restriction and repeat where visibility is limited or blocks exceed 300 ft.',
    notes: 'Arrow plaques clarify the regulated direction when the sign is mid-block.',
    keywords: 'curb regulation, parking restriction'
  },
  {
    code: 'R7-8',
    name: 'RESERVED PARKING',
    category: 'Regulatory',
    series: 'R7',
    colorFamily: 'White',
    section: '2B.46',
    description: 'Accessibility focused parking sign showing the International Symbol of Accessibility.',
    usage: 'Install to mark each accessible stall per ADA/PROWAG spacing guidance.',
    notes: 'Supplement with van-accessible plaque when stall dimensions allow.',
    keywords: 'ADA, accessible parking'
  },
  {
    code: 'R10-2',
    name: 'LEFT TURN YIELD ON GREEN',
    category: 'Regulatory',
    series: 'R10',
    colorFamily: 'White',
    section: '2B.55',
    description: 'Reminds drivers making permissive left turns to yield to opposing traffic and pedestrians.',
    usage: 'Install adjacent to the signal head serving the permissive movement.',
    notes: 'Use only when the signal displays a circular green for left turns.',
    keywords: 'permissive left, phasing'
  },
  {
    code: 'R10-11',
    name: 'TURN ON RED PERMITTED',
    category: 'Regulatory',
    series: 'R10',
    colorFamily: 'White',
    section: '2B.54',
    description: 'Explains when a right (or left from one-way to one-way) turn on red is allowed.',
    usage: 'Helpful where agencies deviate from default state law or where a supplemental time-of-day message is needed.',
    notes: 'Use the companion R10-11a sign to prohibit the turn on red.',
    keywords: 'right turn on red, RTOR'
  },
  {
    code: 'W1-1',
    name: 'TURN',
    category: 'Warning',
    series: 'W1',
    colorFamily: 'Yellow',
    section: '2C.07',
    description: 'Right- or left-turn symbol warning drivers of a single sharp turn ahead.',
    usage: 'Use where advisory speeds are 30 mph or less and the horizontal curve length is short.',
    notes: 'Add an advisory speed plaque when the speed reduction exceeds 10 mph.',
    keywords: 'horizontal curve, advisory speed'
  },
  {
    code: 'W1-2',
    name: 'CURVE',
    category: 'Warning',
    series: 'W1',
    colorFamily: 'Yellow',
    section: '2C.07',
    description: 'Warns of a single curve with a recommended operating speed above turn criteria.',
    usage: 'Place in advance of simple curves where the difference between posted and advisory speed is noticeable.',
    notes: 'As with the Turn sign, add a W13-1P plaque for advisory speed values.',
    keywords: 'curve warning, advisory plate'
  },
  {
    code: 'W1-4',
    name: 'REVERSE CURVE',
    category: 'Warning',
    series: 'W1',
    colorFamily: 'Yellow',
    section: '2C.08',
    description: 'Indicates two successive curves in opposite directions separated by a short tangent.',
    usage: 'Install where the tangent between curves is short enough that drivers perceive it as a single S-shape.',
    notes: 'Use the W1-5 Winding Road sign when three or more curves are present.',
    keywords: 'reverse curve, S-curve'
  },
  {
    code: 'W1-6',
    name: 'WINDING ROAD',
    category: 'Warning',
    series: 'W1',
    colorFamily: 'Yellow',
    section: '2C.08',
    description: 'Warns of a series of three or more curves or turns.',
    usage: 'Typically posted on rural two-lane highways with terrain-driven curvature.',
    notes: 'Supplement with advisory speed plaques or chevrons if additional emphasis is needed.',
    keywords: 'series curves, winding'
  },
  {
    code: 'W2-1',
    name: 'CROSSROAD',
    category: 'Warning',
    series: 'W2',
    colorFamily: 'Yellow',
    section: '2C.37',
    description: 'Depicts a four-legged intersection ahead.',
    usage: 'Used when side-road traffic volumes or sight distance justify advance warning.',
    notes: 'Use W2-2 (side road) or W2-3 (T-intersection) for other configurations.',
    keywords: 'intersection ahead, side road'
  },
  {
    code: 'W3-1',
    name: 'STOP AHEAD',
    category: 'Warning',
    series: 'W3',
    colorFamily: 'Yellow',
    section: '2C.38',
    description: 'Alerts drivers that they will encounter a STOP sign ahead.',
    usage: 'Required when the stop control is not visible for the stopping sight distance.',
    notes: 'Distance plaques can clarify placement on high-speed approaches.',
    keywords: 'intersection control, stop warning'
  },
  {
    code: 'W3-2',
    name: 'YIELD AHEAD',
    category: 'Warning',
    series: 'W3',
    colorFamily: 'Yellow',
    section: '2C.38',
    description: 'Warns drivers to prepare for a YIELD sign ahead.',
    usage: 'Use on high-speed approaches where vegetation or curvature hides the control.',
    notes: 'Share placement spacing guidance with the Stop Ahead sign.',
    keywords: 'yield control, advance warning'
  },
  {
    code: 'W3-3',
    name: 'SIGNAL AHEAD',
    category: 'Warning',
    series: 'W3',
    colorFamily: 'Yellow',
    section: '2C.41',
    description: 'Shows that a traffic control signal is ahead.',
    usage: 'Place ahead of newly installed signals or at locations where the signal is partially hidden.',
    notes: 'Can be supplemented with a FLASHING or BE PREPARED TO STOP message plaque.',
    keywords: 'traffic signal, advance warning'
  },
  {
    code: 'W4-1',
    name: 'MERGE',
    category: 'Warning',
    series: 'W4',
    colorFamily: 'Yellow',
    section: '2C.42',
    description: 'Indicates a lane entering from the side roadway will merge with the mainline.',
    usage: 'Common at auxiliary lane tapers, collector-distributor ramps, and short acceleration lanes.',
    notes: 'Do not use for lane drops; use W4-2 in that case.',
    keywords: 'ramp merge, lane addition'
  },
  {
    code: 'W4-2',
    name: 'LANE ENDS MERGE LEFT',
    category: 'Warning',
    series: 'W4',
    colorFamily: 'Yellow',
    section: '2C.43',
    description: 'Warns drivers that a through lane ends and traffic must merge.',
    usage: 'Install in advance of lane drops and transitions to narrower sections.',
    notes: 'Arrows and text change depending on which side tapers out.',
    keywords: 'lane drop, merge'
  },
  {
    code: 'W7-3aP',
    name: 'ADVISORY SPEED plaque',
    category: 'Warning',
    series: 'W7',
    colorFamily: 'Yellow',
    section: '2C.08',
    description: 'Rectangular plaque showing recommended maximum speed for the associated warning sign.',
    usage: 'Mount beneath horizontal alignment, bump, or other warning signs when advisory speed is at least 10 mph below posted.',
    notes: 'Speed value should match study results and be rounded to the nearest 5 mph.',
    keywords: 'advisory speed, plaque'
  },
  {
    code: 'W8-10',
    name: 'LOW SHOULDER',
    category: 'Warning',
    series: 'W8',
    colorFamily: 'Yellow',
    section: '2C.60',
    description: 'Warns drivers of a drop-off between the travel lane and unpaved shoulder.',
    usage: 'Place near resurfacing projects or rural shoulders where maintenance creates a height difference.',
    notes: 'Remove once the shoulder is restored to grade.',
    keywords: 'edge drop-off, resurfacing'
  },
  {
    code: 'W8-15',
    name: 'BUMP',
    category: 'Warning',
    series: 'W8',
    colorFamily: 'Yellow',
    section: '2C.63',
    description: 'Warns of a raised bump or pavement transition.',
    usage: 'Used for bridge approaches, temporary cold patch transitions, or milling operations.',
    notes: 'Supplement with advisory plaques for severe bumps.',
    keywords: 'pavement transition, milling'
  },
  {
    code: 'W10-1',
    name: 'RAILROAD ADVANCE WARNING',
    category: 'Warning',
    series: 'W10',
    colorFamily: 'Yellow',
    section: '8B.03',
    description: 'Round yellow RR symbol sign advising that a highway-rail grade crossing is ahead.',
    usage: 'Place far enough in advance for the posted speed so drivers can slow or stop.',
    notes: 'Use in conjunction with pavement markings and crossbuck assemblies.',
    keywords: 'grade crossing, railroad'
  },
  {
    code: 'W11-2',
    name: 'PEDESTRIAN CROSSING',
    category: 'Warning',
    series: 'W11',
    colorFamily: 'Yellow',
    section: '2C.49',
    description: 'Silhouette symbol showing pedestrians crossing the roadway.',
    usage: 'Used at uncontrolled marked crossings or at midblock crossing islands.',
    notes: 'May switch to fluorescent yellow-green in school or shared-use contexts.',
    keywords: 'pedestrian, crosswalk'
  },
  {
    code: 'W11-15',
    name: 'TRAIL CROSSING',
    category: 'Warning',
    series: 'W11',
    colorFamily: 'Yellow',
    section: '2C.51',
    description: 'Bicycle-and-pedestrian symbol for shared-use path crossings.',
    usage: 'Place where off-road trails intersect the roadway, especially when volumes exceed MUTCD thresholds.',
    notes: 'Combine with W16-9P diagonal arrow plaques to point at the crossing.',
    keywords: 'multi-use trail, crossing'
  },
  {
    code: 'W14-1',
    name: 'DEAD END',
    category: 'Warning',
    series: 'W14',
    colorFamily: 'Yellow',
    section: '2C.60',
    description: 'Warns that a roadway does not provide a through movement beyond a certain point.',
    usage: 'Install near the entrance to cul-de-sacs or dead-end streets to discourage wrong entries.',
    notes: 'For short spurs, the NO OUTLET sign may be clearer.',
    keywords: 'no outlet, cul-de-sac'
  },
  {
    code: 'D1-1',
    name: 'DESTINATION AND DISTANCE',
    category: 'Guide',
    series: 'D1',
    colorFamily: 'Green',
    section: '2D.37',
    description: 'Green guide sign listing destinations with arrows and distances.',
    usage: 'Position on conventional highways approaching decision points or intersections serving multiple communities.',
    notes: 'Keep three lines of legend per sign whenever possible.',
    keywords: 'wayfinding, distance sign'
  },
  {
    code: 'D3-1',
    name: 'ADVANCE STREET NAME',
    category: 'Guide',
    series: 'D3',
    colorFamily: 'Green',
    section: '2D.43',
    description: 'Identifies the name of the upcoming intersecting street before the signal or stop-controlled intersection.',
    usage: 'Useful on multilane arterials where near-side street name signs are hard to read.',
    notes: 'Supplement with a D3-2 blade at the intersection itself.',
    keywords: 'street name, advance guide'
  },
  {
    code: 'D5-1',
    name: 'HOSPITAL',
    category: 'Guide',
    series: 'D5',
    colorFamily: 'Blue',
    section: '2I.02',
    description: 'White H on blue service sign pointing toward a hospital or emergency room.',
    usage: 'Place along designated emergency routes leading to hospitals.',
    notes: 'Arrow plaques clarify turns or side streets.',
    keywords: 'service sign, emergency'
  },
  {
    code: 'D6-1',
    name: 'INTERSTATE GUIDE',
    category: 'Guide',
    series: 'D6',
    colorFamily: 'Green',
    section: '2E.31',
    description: 'Freeway guide sign showing route shields, destinations, and arrows for exits.',
    usage: 'Located in advance of interchanges to prepare drivers for lane selection.',
    notes: 'Exact layout varies; confirm with freeway guide-sign design tools.',
    keywords: 'freeway, exit sign'
  },
  {
    code: 'D8-3',
    name: 'REST AREA',
    category: 'Guide',
    series: 'D8',
    colorFamily: 'Blue',
    section: '2I.06',
    description: 'Service sign advising drivers of an upcoming rest area or welcome center.',
    usage: 'Install 1 to 2 miles in advance of the facility and repeat at the exit ramp.',
    notes: 'Distance plaques can show how far the rest area is from the sign.',
    keywords: 'service area, rest stop'
  },
  {
    code: 'D10-1',
    name: 'BIKE ROUTE',
    category: 'Guide',
    series: 'D10',
    colorFamily: 'Green',
    section: '9B.20',
    description: 'Rectangular sign identifying a designated bicycle route.',
    usage: 'Mount along signed bike routes and add supplemental plaques for destination info.',
    notes: 'Coordinate numbering with regional bike plans.',
    keywords: 'bicycle, wayfinding'
  },
  {
    code: 'D13-1',
    name: 'AIRPORT',
    category: 'Guide',
    series: 'D13',
    colorFamily: 'Blue',
    section: '2J.04',
    description: 'General service symbol showing an airplane to guide traffic to airports.',
    usage: 'Install on routes leading to commercial or regional airports.',
    notes: 'Combine with arrow plaques to clarify direction changes.',
    keywords: 'service, airport wayfinding'
  },
  {
    code: 'W20-1',
    name: 'ROAD WORK AHEAD',
    category: 'Temporary',
    series: 'W20',
    colorFamily: 'Orange',
    section: '6F.22',
    description: 'Warns motorists that they are approaching a work zone.',
    usage: 'Place upstream of taper or work activity based on the temporary traffic control plans.',
    notes: 'Remove or cover when work is not active.',
    keywords: 'temporary traffic control, TTC'
  },
  {
    code: 'W20-3',
    name: 'DETOUR AHEAD',
    category: 'Temporary',
    series: 'W20',
    colorFamily: 'Orange',
    section: '6F.24',
    description: 'Informs drivers that a detour route is ahead and they should prepare to follow it.',
    usage: 'Use when the mainline is closed beyond the sign location.',
    notes: 'Coordinate with detour trailblazer route markers.',
    keywords: 'detour, closure, work zone'
  },
  {
    code: 'W20-7a',
    name: 'FLAGGER AHEAD',
    category: 'Temporary',
    series: 'W20',
    colorFamily: 'Orange',
    section: '6F.24',
    description: 'Depicts a flagger symbol or text alerting drivers that manual traffic control is ahead.',
    usage: 'Place where flaggers control a single-lane closure or moving operation.',
    notes: 'Ensure sight distance so drivers can reduce speed before reaching the flagger.',
    keywords: 'flagging, temporary control'
  },
  {
    code: 'W21-5',
    name: 'SHOULDER WORK',
    category: 'Temporary',
    series: 'W21',
    colorFamily: 'Orange',
    section: '6F.30',
    description: 'Warns that maintenance activity is occurring on or near the shoulder.',
    usage: 'Used for mowing, litter removal, or other operations where workers are adjacent to live traffic.',
    notes: 'Supplement with arrow boards or shadow vehicles on high-speed facilities.',
    keywords: 'maintenance, shoulder closure'
  },
  {
    code: 'G20-2',
    name: 'END ROAD WORK',
    category: 'Temporary',
    series: 'G20',
    colorFamily: 'Orange',
    section: '6F.62',
    description: 'Marks the downstream end of the work zone where normal regulations resume.',
    usage: 'Place beyond the last work activity or temporary speed regulation.',
    notes: 'Required when temporary regulatory signs are in place.',
    keywords: 'work zone end, TTC'
  },
  {
    code: 'S1-1',
    name: 'SCHOOL AREA',
    category: 'School',
    series: 'S1',
    colorFamily: 'Fluorescent Yellow-Green',
    section: '7D.04',
    description: 'Pentagon-shaped sign identifying a school zone.',
    usage: 'Install with speed limit or crossing treatments that are part of a school zone plan.',
    notes: 'Always use fluorescent yellow-green for school applications.',
    keywords: 'school zone, students'
  },
  {
    code: 'S1-1a',
    name: 'SCHOOL CROSSING',
    category: 'School',
    series: 'S1',
    colorFamily: 'Fluorescent Yellow-Green',
    section: '7D.05',
    description: 'Depicts two walking figures to highlight a marked school crossing.',
    usage: 'Mount at midblock school crossings or near school entrances with high pedestrian volumes.',
    notes: 'Combine with diagonal arrow plaques to point toward the crossing.',
    keywords: 'school crossing, pedestrians'
  },
  {
    code: 'S4-3P',
    name: 'AHEAD plaque',
    category: 'School',
    series: 'S4',
    colorFamily: 'Fluorescent Yellow-Green',
    section: '7D.06',
    description: 'Supplemental AHEAD plaque for school warning signs.',
    usage: 'Use when a school crossing or reduced speed zone is downstream of the sign location.',
    notes: 'Only used with S-series warning signs.',
    keywords: 'plaque, ahead'
  },
  {
    code: 'S5-1',
    name: 'SCHOOL SPEED LIMIT',
    category: 'School',
    series: 'S5',
    colorFamily: 'White',
    section: '7B.15',
    description: 'Regulatory sign showing the reduced speed limit that applies during school activity periods.',
    usage: 'Install at the beginning of the school zone and supplement with flashers, times, or when flashing plaques as required.',
    notes: 'Legend must match local statute including hours or “When Flashing” text.',
    keywords: 'reduced speed, school zone'
  },
  {
    code: 'M1-1',
    name: 'INTERSTATE ROUTE MARKER',
    category: 'Marker',
    series: 'M1',
    colorFamily: 'Blue',
    section: '2D.11',
    description: 'Red, white, and blue shield identifying an Interstate route number.',
    usage: 'Place on guide signs or as stand-alone reassurance markers along the route.',
    notes: 'Follow FHWA Standard Alphabets and shield dimensions.',
    keywords: 'route marker, reassurance'
  },
  {
    code: 'M1-4',
    name: 'U.S. ROUTE MARKER',
    category: 'Marker',
    series: 'M1',
    colorFamily: 'White',
    section: '2D.11',
    description: 'White shield with black numerals denoting a U.S. numbered route.',
    usage: 'Use at regular intervals and after major intersections.',
    notes: 'Typically mounted with directional M5-series arrows when needed.',
    keywords: 'route shield, US highway'
  },
  {
    code: 'M1-6',
    name: 'STATE ROUTE MARKER',
    category: 'Marker',
    series: 'M1',
    colorFamily: 'White',
    section: '2D.11',
    description: 'Standard square or unique shaped marker identifying a state highway.',
    usage: 'Spacing governed by state policy; often paired with cardinal direction arrows.',
    notes: 'Shape and colors vary by state standard.',
    keywords: 'state highway, reassurance'
  },
  {
    code: 'M3-2',
    name: 'DIRECTIONAL ARROW (EAST/WEST/NORTH/SOUTH)',
    category: 'Marker',
    series: 'M3',
    colorFamily: 'White',
    section: '2D.13',
    description: 'Horizontal arrow plaque installed with route shields to show travel direction.',
    usage: 'Mount directly below route shields at decision points or after key intersections.',
    notes: 'Legend typically one of the cardinal directions.',
    keywords: 'directional plaque, arrow'
  },
  {
    code: 'M4-5',
    name: 'DETOUR arrow',
    category: 'Marker',
    series: 'M4',
    colorFamily: 'Orange',
    section: '6F.57',
    description: 'Orange rectangular sign with DETOUR text and arrow.',
    usage: 'Trailblaze temporary detour routing through the network.',
    notes: 'Use a consistent color and numbering scheme along the entire detour.',
    keywords: 'detour marker, work zone'
  }
];

document.addEventListener('DOMContentLoaded', () => {
  const sortedData = [...MUTCD_SIGN_DATA].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const searchInput = document.getElementById('signSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const seriesFilter = document.getElementById('seriesFilter');
  const colorFilter = document.getElementById('colorFilter');
  const resetButton = document.getElementById('resetFilters');
  const resultsContainer = document.getElementById('lookupResults');
  const resultCountEl = document.getElementById('resultCount');
  const totalCountEl = document.getElementById('totalCount');

  if (!searchInput || !categoryFilter || !seriesFilter || !colorFilter || !resultsContainer) {
    return;
  }

  totalCountEl.textContent = sortedData.length;

  const uniqueValues = (key) => {
    const values = new Set(sortedData.map((sign) => sign[key]));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  };

  const populateOptions = (selectEl, values) => {
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      selectEl.appendChild(option);
    });
  };

  populateOptions(categoryFilter, uniqueValues('category'));
  populateOptions(seriesFilter, uniqueValues('series'));
  populateOptions(colorFilter, uniqueValues('colorFamily'));

  const sanitizeClass = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const renderCards = (data) => {
    if (!data.length) {
      resultsContainer.innerHTML = '<p class="empty-state">No sign codes match those filters. Try clearing one of the selectors.</p>';
      return;
    }

    resultsContainer.innerHTML = data.map((sign) => {
      const categoryClass = `chip-${sanitizeClass(sign.category)}`;
      return `
        <article class="sign-card">
          <header>
            <div>
              <div class="sign-code">${sign.code}</div>
              <div class="sign-name">${sign.name}</div>
            </div>
            <div class="sign-chips">
              <span class="chip ${categoryClass}">${sign.category}</span>
              <span class="chip chip-series">Series ${sign.series}</span>
              <span class="chip chip-color">${sign.colorFamily}</span>
            </div>
          </header>
          <p class="sign-description">${sign.description}</p>
          <div class="sign-details">
            <div class="detail-item">
              <div class="detail-label">Section</div>
              <div class="detail-value">${sign.section}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Typical use</div>
              <div class="detail-value">${sign.usage}</div>
            </div>
          </div>
          ${sign.notes ? `<div class="sign-note">${sign.notes}</div>` : ''}
        </article>
      `;
    }).join('');
  };

  const filterData = () => {
    const term = searchInput.value.trim().toLowerCase();
    const category = categoryFilter.value;
    const series = seriesFilter.value;
    const color = colorFilter.value;

    const filtered = sortedData.filter((sign) => {
      const matchesTerm = !term || `${sign.code} ${sign.name} ${sign.description} ${sign.usage} ${sign.notes || ''} ${sign.keywords || ''}`.toLowerCase().includes(term);
      const matchesCategory = category === 'all' || sign.category === category;
      const matchesSeries = series === 'all' || sign.series === series;
      const matchesColor = color === 'all' || sign.colorFamily === color;
      return matchesTerm && matchesCategory && matchesSeries && matchesColor;
    });

    resultCountEl.textContent = filtered.length;
    renderCards(filtered);
  };

  searchInput.addEventListener('input', filterData);
  categoryFilter.addEventListener('change', filterData);
  seriesFilter.addEventListener('change', filterData);
  colorFilter.addEventListener('change', filterData);

  if (resetButton) {
    resetButton.addEventListener('click', () => {
      searchInput.value = '';
      categoryFilter.value = 'all';
      seriesFilter.value = 'all';
      colorFilter.value = 'all';
      filterData();
    });
  }

  filterData();
});
