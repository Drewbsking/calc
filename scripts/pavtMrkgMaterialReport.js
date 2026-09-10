// The report consumes the same unrounded calculation snapshot as the screen.
// It never reads formatted result text or the currently filtered marking rows.
function createPavementMarkingReport(calculation, project, jsPDF, createdAt = new Date()) {
  const c = calculation;
  const r = c.rates;
  const q = c.quantities;
  const unit = r.binderUnit;
  const binderName = unit === 'gal' ? 'Paint' : 'Thermoplastic binder';
  const reportVersion = '1.0';
  const reportId = `PM-${createdAt.toISOString().replace(/[-:.]/g, '')}`;
  const rateSource = 'https://www.michigan.gov/mdot/-/media/Project/Websites/MDOT/Business/Construction/Standard-Specifications-Construction/2020-Standard-Specifications-Construction.pdf#page=622';
  const areaSource = 'https://mdotjboss.state.mi.us/TSSD/getTSDocument.htm?docGuid=baac7af0-d2bf-49fd-8ea1-cd35cfb3c567&fileName=PAVE-900-H.pdf#page=9';
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  doc.setProperties({
    title: `Pavement marking calculations - ${project.projectName || 'Unnamed Project'}`,
    subject: 'Quantity takeoff, application rates, worked calculations, and input schedule',
    author: project.preparedBy || '',
    creator: `Andy's Traffic Tools - Pavement Marking Report ${reportVersion}`
  });

  const margin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = pageWidth - margin * 2;
  const top = 28;
  const bottom = pageHeight - 20;
  const ink = [32, 48, 69];
  const muted = [91, 107, 127];
  const blue = [30, 75, 120];
  let y = top;
  let currentSection = 'Project record';

  const fmt = (value, digits = 6) => Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  });
  const integer = value => fmt(value, 0);
  const raw = value => String(value);
  const provided = value => value || 'Not entered';
  const smallDifference = value => value === 0 ? '0' : value.toExponential(6);

  function type(size = 9.5, bold = false, color = ink) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
  }

  function pageHeader() {
    type(9, true, blue);
    doc.text('PAVEMENT MARKING MATERIAL', margin, 13);
    type(8, false, muted);
    const label = doc.splitTextToSize(currentSection, width * 0.47)[0];
    doc.text(label, pageWidth - margin, 13, { align: 'right' });
    doc.setDrawColor(196, 208, 222);
    doc.setLineWidth(0.3);
    doc.line(margin, 18, pageWidth - margin, 18);
  }

  function nextPage() {
    doc.addPage();
    y = top;
    pageHeader();
  }

  function ensure(height) {
    if (y + height > bottom) nextPage();
  }

  function paragraph(text, { bold = false, size = 9.5, color = ink, gap = 3, indent = 0 } = {}) {
    type(size, bold, color);
    const lineHeight = size * 0.352778 * 1.4;
    const lines = doc.splitTextToSize(String(text), width - indent);
    if (lines.length <= 4) ensure(lines.length * lineHeight);
    for (const line of lines) {
      ensure(lineHeight);
      type(size, bold, color);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += gap;
  }

  function section(number, title, freshPage = false) {
    currentSection = `${number}. ${title}`;
    // Start substantial sections on a fresh page when little space remains,
    // while letting short continuation pages carry the next section as well.
    if (freshPage && y > bottom - 80) nextPage();
    ensure(27);
    y += 3;
    paragraph(currentSection, { size: 13, bold: true, color: blue, gap: 4 });
  }

  function metadata(label, value) {
    type(9.5);
    const lines = doc.splitTextToSize(provided(value), width).length;
    ensure(Math.min(lines * 4.7 + 10, 60));
    paragraph(label, { bold: true, size: 8.5, color: muted, gap: 0.5 });
    paragraph(provided(value), { gap: 4 });
  }

  function link(label, url) {
    ensure(10);
    type(9, false, blue);
    doc.textWithLink(label, margin, y, { url });
    y += 9;
  }

  function table(headers, rows, weights, { numeric = [], size = 8.5, rowPadding = 3 } = {}) {
    const sum = weights.reduce((total, weight) => total + weight, 0);
    const widths = weights.map(weight => weight / sum * width);
    const lineHeight = size * 0.352778 * 1.4;
    const measure = (cells, header) => {
      type(size, header);
      const lines = cells.map((cell, index) => doc.splitTextToSize(String(cell), widths[index] - 5));
      return { lines, height: Math.max(...lines.map(cell => cell.length)) * lineHeight + rowPadding };
    };
    const draw = (row, header = false) => {
      if (header) {
        doc.setFillColor(234, 240, 248);
        doc.rect(margin, y - 3, width, row.height, 'F');
      }
      type(size, header, header ? blue : ink);
      let x = margin;
      row.lines.forEach((lines, index) => {
        const right = numeric.includes(index);
        lines.forEach((line, lineIndex) => {
          doc.text(line, right ? x + widths[index] - 2.5 : x + 2.5,
            y + lineIndex * lineHeight, { align: right ? 'right' : 'left' });
        });
        x += widths[index];
      });
      y += row.height;
      doc.setDrawColor(225, 231, 239);
      doc.setLineWidth(0.15);
      doc.line(margin, y - 4, pageWidth - margin, y - 4);
    };
    const header = measure(headers, true);
    ensure(header.height + (rows.length ? measure(rows[0], false).height : 0));
    draw(header, true);
    for (const cells of rows) {
      const row = measure(cells, false);
      if (y + row.height > bottom) {
        nextPage();
        draw(header, true);
      }
      draw(row);
    }
    y += 5;
  }

  function worked(title, formula, substitution, answer, note = '') {
    const lines = [formula, substitution, answer];
    type(9);
    const contentHeight = lines.reduce((height, text) => height + doc.splitTextToSize(text, width - 4).length * 4.5, 0);
    ensure(contentHeight + 15 + (note ? 10 : 0));
    paragraph(title, { size: 10, bold: true, gap: 1 });
    lines.forEach((text, index) => paragraph(text, {
      size: 9, indent: 4, gap: 0.7, bold: index === 2, color: index === 2 ? blue : ink
    }));
    if (note) paragraph(note, { size: 8.5, color: muted, indent: 4, gap: 1 });
    y += 3;
  }

  const subtotals = ['Legend', 'Symbol'].map(category => {
    const entries = c.markings.filter(marking => marking.category === category);
    const area = entries.reduce((sum, marking) => sum + marking.area, 0);
    return { category, entries, area,
      count: entries.reduce((sum, marking) => sum + marking.quantity, 0),
      binder: area * r.binderPerSFT, beads: area * r.beadsPerSFT };
  });

  pageHeader();
  paragraph('Pavement marking\nmaterial calculations', { size: 22, bold: true, color: blue, gap: 4 });
  paragraph('Quantity takeoff and application-rate worksheet', { size: 11, color: muted, gap: 7 });
  paragraph(`Report ID: ${reportId}  |  Report format: ${reportVersion}`, { size: 8.5, color: muted, gap: 1 });
  paragraph(`Exported: ${createdAt.toISOString()} (UTC)`, { size: 8.5, color: muted, gap: 6 });

  section('1', 'Project record and reported totals');
  metadata('PROJECT NAME', project.projectName);
  metadata('PROJECT / FEDERAL-AID NUMBER', project.projectNumber);
  metadata('PREPARED BY', project.preparedBy);
  metadata('LOCATION / PROJECT LIMITS', project.projectLocation);
  paragraph(`Selected material: ${c.materialName}`, { bold: true, gap: 4 });
  table(['Component', 'Area (sq ft)', `${binderName} (${unit})`, 'Beads (lb)'], [
    ['Long lines', fmt(q.longLineArea, 2), fmt(q.longLineBinder, 2), fmt(q.longLineBeads, 2)],
    ...subtotals.map(s => [`${s.category}s`, fmt(s.area, 2), fmt(s.binder, 2), fmt(s.beads, 2)]),
    ['TOTAL', fmt(q.totalArea, 2), fmt(q.totalBinder, 2), fmt(q.totalBeads, 2)]
  ], [62, 38, 43, 35], { numeric: [1, 2, 3] });
  paragraph('Reported quantities are rounded to two decimal places. Totals are calculated before rounding individual rows.', { size: 8.5, color: muted });
  metadata('QUANTITY SOURCE / PLAN SHEETS', project.quantitySource);
  metadata('PREPARER NOTES', project.calculationNotes);

  section('2', 'Inputs, sources, and calculation basis', true);
  table(['Input', 'Value used', 'Basis'], [
    ['Selected material', c.materialName, 'User selection'],
    ['Painted line length, L', `${fmt(c.feetPainted, 2)} ft`, c.feetEntry === '' ? 'Blank entry interpreted as zero' : `Entered: ${c.feetEntry}`],
    ['Long-line width, W', `${integer(c.width)} in`, 'User selection'],
    ['Special marking types entered', integer(c.markings.length), 'Positive counts; see sections 5 and 7'],
    ['Reference solid-line width', '4 in', '[R1], 4-inch solid-line column'],
    ['Length conversion', '5,280 ft = 1 mi', 'Unit conversion'],
    ['Width conversion', '12 in = 1 ft', 'Unit conversion']
  ], [55, 59, 65]);
  paragraph('[R1] MDOT 2020 Standard Specifications for Construction, Section 811, Table 811-1, printed page 8-60 (PDF page 622).', { bold: true, size: 9 });
  link('Open application-rate source: MDOT Table 811-1', rateSource);
  table(['Reference property', 'Value', 'Use in calculation'], [
    ['Binder rate, B_4', `${fmt(r.baseBinderPerMile, 2)} ${unit}/mi`, '4-inch solid-line baseline'],
    ['Bead rate, G_4', `${fmt(r.baseBeadsPerMile, 2)} lb/mi`, '4-inch solid-line baseline'],
    ['Wet binder thickness without beads', `${integer(r.wetThickness)} mils`, 'Reference thickness'],
    ['Minimum dry thickness with beads', `${integer(r.minThicknessBeads)} mils`, 'Reference thickness']
  ], [77, 39, 62]);
  paragraph('[R2] MDOT Standard Plan PAVE-900-H, Pavement Arrow & Message Details, sheet 9 of 10, Material column. Plan date: September 13, 2023.', { bold: true, size: 9 });
  link('Open unit-area source: PAVE-900-H, sheet 9', areaSource);
  paragraph('The liquid-applied material areas account for template gaps. Railroad symbol areas exclude stop bars. Removal and recessing areas are not used.', { size: 9 });
  ensure(25);
  paragraph('Calculation assumptions', { bold: true, gap: 2 });
  [
    'Painted footage excludes gaps and represents the total length of individual lines at one selected width. No automatic adjustment is made for broken or double lines.',
    'Only the 4-inch solid-line rates are taken from [R1]. Other widths are calculated proportionally using W / 4; independently rounded width columns are not substituted.',
    'Special markings use the fixed material areas in [R2] and the same material and area rates as the long lines. Changing line width does not resize symbols or legends.',
    'Quantities represent one application. No waste, overrun, extra coats, container rounding, or overlapping-area deductions are added. Thickness values are references; quantities are computed from the application rates.',
    'Blank numeric entries mean zero. Search filters and collapsed sections do not remove quantities. Plan references and notes document the inputs and do not override the stated rates or areas.',
    'Calculations retain unrounded numeric values. Worked quantities show six decimal places and area rates show twelve. Displayed intermediate values are approximate; section 8 records the raw numeric values.'
  ].forEach((text, i) => paragraph(`${i + 1}. ${text}`, { size: 8.5, gap: 2 }));

  section('3', 'Unit conversions and application rates', true);
  worked('3.1  Width adjustment factor', 'k = W / W_ref',
    `k = ${integer(c.width)} in / 4 in`, `k = ${fmt(r.widthFactor)} (dimensionless)`);
  worked('3.2  Width in feet', 'W_ft = W / 12',
    `W_ft = ${integer(c.width)} in / (12 in/ft)`, `W_ft = ${fmt(r.widthFeet)} ft`);
  worked('3.3  Painted length in miles', 'L_mi = L / 5,280',
    `L_mi = ${fmt(c.feetPainted, 2)} ft / (5,280 ft/mi)`, `L_mi = ${fmt(q.milesPainted, 12)} mi`);
  worked('3.4  Area of one mile at the selected width', 'A_mi = 5,280 x W_ft',
    `A_mi = 5,280 ft/mi x (${integer(c.width)} in / 12 in/ft)`, `A_mi = ${fmt(r.squareFeetPerMile)} sq ft/mi`);
  worked('3.5  Binder application rate per mile', 'B_W = B_4 x k',
    `B_W = ${fmt(r.baseBinderPerMile, 2)} ${unit}/mi x (${integer(c.width)} / 4)`, `B_W = ${fmt(r.binderPerMile)} ${unit}/mi`);
  worked('3.6  Bead application rate per mile', 'G_W = G_4 x k',
    `G_W = ${fmt(r.baseBeadsPerMile, 2)} lb/mi x (${integer(c.width)} / 4)`, `G_W = ${fmt(r.beadsPerMile)} lb/mi`);
  worked('3.7  Binder application rate per square foot', 'b = B_W / A_mi = B_4 / 1,760',
    `b = ${fmt(r.binderPerMile)} ${unit}/mi / ${fmt(r.squareFeetPerMile)} sq ft/mi`,
    `b = ${fmt(r.binderPerSFT, 12)} ${unit}/sq ft`, 'A 4-inch-wide solid line has 5,280 x (4 / 12) = 1,760 sq ft per mile.');
  worked('3.8  Bead application rate per square foot', 'g = G_W / A_mi = G_4 / 1,760',
    `g = ${fmt(r.beadsPerMile)} lb/mi / ${fmt(r.squareFeetPerMile)} sq ft/mi`, `g = ${fmt(r.beadsPerSFT, 12)} lb/sq ft`);

  section('4', 'Long-line calculations', true);
  if (c.feetPainted === 0) paragraph('No long-line footage was entered. The following calculations evaluate the long-line contribution at L = 0 ft.', { color: muted });
  worked('4.1  Long-line material area', 'A_L = L x W_ft',
    `A_L = ${fmt(c.feetPainted, 2)} ft x (${integer(c.width)} in / 12 in/ft)`, `A_L = ${fmt(q.longLineArea)} sq ft`);
  worked('4.2  Long-line binder quantity', 'B_L = (B_W / 5,280) x L',
    `B_L = (${fmt(r.binderPerMile)} ${unit}/mi / 5,280 ft/mi) x ${fmt(c.feetPainted, 2)} ft`, `B_L = ${fmt(q.longLineBinder)} ${unit}`);
  worked('4.3  Long-line bead quantity', 'G_L = (G_W / 5,280) x L',
    `G_L = (${fmt(r.beadsPerMile)} lb/mi / 5,280 ft/mi) x ${fmt(c.feetPainted, 2)} ft`, `G_L = ${fmt(q.longLineBeads)} lb`);
  worked('4.4  Area-method check: long-line binder', 'B_L,area = A_L x b',
    `B_L,area = ${fmt(q.longLineArea)} sq ft x ${fmt(r.binderPerSFT, 12)} ${unit}/sq ft`,
    `B_L,area = ${fmt(q.longLineArea * r.binderPerSFT)} ${unit}`);
  worked('4.5  Area-method check: long-line beads', 'G_L,area = A_L x g',
    `G_L,area = ${fmt(q.longLineArea)} sq ft x ${fmt(r.beadsPerSFT, 12)} lb/sq ft`,
    `G_L,area = ${fmt(q.longLineArea * r.beadsPerSFT)} lb`);

  section('5', 'Special marking calculations', true);
  paragraph('For each item i, n_i is the entered count (each), a_i is the material area (sq ft/each), and A_i is the extended material area. Binder and beads are calculated for every positive entry below.');
  paragraph('A_i = n_i x a_i;   B_i = A_i x b;   G_i = A_i x g', { bold: true, color: blue });
  if (c.markings.length === 0) paragraph('No special markings entered. A_S = 0 sq ft, B_S = 0, and G_S = 0 lb. The complete zero-entry schedule is retained in section 7.');
  c.markings.forEach((marking, index) => {
    const lines = [
      `Area: ${integer(marking.quantity)} each x ${fmt(marking.unitArea, 2)} sq ft/each = ${fmt(marking.area)} sq ft`,
      `Binder: ${fmt(marking.area)} sq ft x ${fmt(r.binderPerSFT, 12)} ${unit}/sq ft = ${fmt(marking.area * r.binderPerSFT)} ${unit}`,
      `Beads: ${fmt(marking.area)} sq ft x ${fmt(r.beadsPerSFT, 12)} lb/sq ft = ${fmt(marking.area * r.beadsPerSFT)} lb`
    ];
    type(9);
    const title = `5.${index + 1}  ${marking.category}: ${marking.label}`;
    const height = [...lines, title].reduce((sum, text) => sum + doc.splitTextToSize(text, width - 4).length * 4.8, 0) + 10;
    ensure(height);
    paragraph(title, { bold: true, size: 10, gap: 2 });
    lines.forEach(text => paragraph(text, { size: 9, gap: 1, indent: 4 }));
    y += 3;
  });
  ensure(48);
  paragraph('Special marking subtotal by category', { bold: true });
  table(['Category', 'Count (each)', 'Area (sq ft)', `Binder (${unit})`, 'Beads (lb)'], [
    ...subtotals.map(s => [s.category, integer(s.count), fmt(s.area), fmt(s.binder), fmt(s.beads)]),
    ['Special total', integer(subtotals.reduce((sum, s) => sum + s.count, 0)), fmt(q.specialArea), fmt(q.specialBinder), fmt(q.specialBeads)]
  ], [38, 28, 37, 38, 37], { numeric: [1, 2, 3, 4], size: 8 });
  worked('Special area summation', 'A_S = sum(A_i) = A_legends + A_symbols',
    `A_S = ${fmt(subtotals[0].area)} + ${fmt(subtotals[1].area)} sq ft`, `A_S = ${fmt(q.specialArea)} sq ft`);
  worked('Special binder subtotal', 'B_S = A_S x b',
    `B_S = ${fmt(q.specialArea)} sq ft x ${fmt(r.binderPerSFT, 12)} ${unit}/sq ft`, `B_S = ${fmt(q.specialBinder)} ${unit}`);
  worked('Special bead subtotal', 'G_S = A_S x g',
    `G_S = ${fmt(q.specialArea)} sq ft x ${fmt(r.beadsPerSFT, 12)} lb/sq ft`, `G_S = ${fmt(q.specialBeads)} lb`);

  section('6', 'Final totals and reconciliation', true);
  worked('6.1  Total material area', 'A_total = A_L + A_S',
    `A_total = ${fmt(q.longLineArea)} + ${fmt(q.specialArea)} sq ft`, `A_total = ${fmt(q.totalArea)} sq ft`);
  worked('6.2  Total binder', 'B_total = B_L + B_S',
    `B_total = ${fmt(q.longLineBinder)} + ${fmt(q.specialBinder)} ${unit}`, `B_total = ${fmt(q.totalBinder)} ${unit}; reported = ${fmt(q.totalBinder, 2)} ${unit}`);
  worked('6.3  Total beads', 'G_total = G_L + G_S',
    `G_total = ${fmt(q.longLineBeads)} + ${fmt(q.specialBeads)} lb`, `G_total = ${fmt(q.totalBeads)} lb; reported = ${fmt(q.totalBeads, 2)} lb`);
  ensure(42);
  paragraph('Reconciliation using the combined area', { bold: true });
  table(['Check', 'Component total', 'Combined area x rate', 'Difference'], [
    [`Binder (${unit})`, fmt(q.totalBinder), fmt(q.totalArea * r.binderPerSFT), smallDifference(q.totalBinder - q.totalArea * r.binderPerSFT)],
    ['Beads (lb)', fmt(q.totalBeads), fmt(q.totalArea * r.beadsPerSFT), smallDifference(q.totalBeads - q.totalArea * r.beadsPerSFT)]
  ], [35, 48, 52, 43], { numeric: [1, 2, 3], size: 8 });
  paragraph('Differences near zero can result from binary floating-point arithmetic and the order of operations. This check compares two aggregation methods; it does not independently verify field measurements or project specification applicability.', { size: 8.5, color: muted });
  ensure(28);
  paragraph('Final reporting precision', { bold: true });
  paragraph(`Binder: ${fmt(q.totalBinder)} ${unit} -> ${fmt(q.totalBinder, 2)} ${unit}\nBeads: ${fmt(q.totalBeads)} lb -> ${fmt(q.totalBeads, 2)} lb\nFinal values are rounded for reporting, not rounded up for procurement.`, { size: 9 });

  section('7', 'Complete input and unit-area schedule', true);
  paragraph(`All ${c.allMarkings.length} available marking types are recorded, including zeros and blank entries. Unit areas are the material column of [R2]. Entered text is retained so scientific notation or a blank can be distinguished from the numeric count used.`);
  for (const category of ['Legend', 'Symbol']) {
    ensure(30);
    paragraph(`${category}s`, { bold: true, color: blue });
    table(['Marking', 'Entered', 'Count used (each)', 'Unit area (sq ft/each)', 'Extended area (sq ft)'],
      c.allMarkings.filter(m => m.category === category).map(m => [m.label, m.enteredValue === '' ? 'blank' : m.enteredValue,
        integer(m.quantity), fmt(m.unitArea, 2), fmt(m.area, 2)]),
      [78, 22, 25, 27, 32], { numeric: [2, 3, 4], size: 8 });
  }

  section('8', 'Raw numeric calculation record', true);
  paragraph('These are the unrounded numeric values used by the calculator, serialized as decimal strings. They support reproduction of the results without using the rounded values printed in earlier sections. The calculator uses JavaScript Number arithmetic.');
  ensure(35);
  paragraph('Source and input record', { bold: true });
  paragraph(`Material key: ${c.material}\nArea schedule: MDOT PAVE-900-H, sheet 9, plan date 2023-09-13\nRate baseline: MDOT 2020 Table 811-1, 4-inch solid line\nRaw footage entry: ${c.feetEntry === '' ? '(blank)' : c.feetEntry}\nReport generator version: ${reportVersion}`, { size: 9 });
  table(['Variable', 'Raw numeric value', 'Unit'], [
    ['W', raw(c.width), 'in'], ['L', raw(c.feetPainted), 'ft'],
    ['W_ft', raw(r.widthFeet), 'ft'], ['k', raw(r.widthFactor), 'dimensionless'],
    ['L_mi', raw(q.milesPainted), 'mi'], ['A_mi', raw(r.squareFeetPerMile), 'sq ft/mi'],
    ['B_4', raw(r.baseBinderPerMile), `${unit}/mi`], ['G_4', raw(r.baseBeadsPerMile), 'lb/mi'],
    ['B_W', raw(r.binderPerMile), `${unit}/mi`], ['G_W', raw(r.beadsPerMile), 'lb/mi'],
    ['b', raw(r.binderPerSFT), `${unit}/sq ft`], ['g', raw(r.beadsPerSFT), 'lb/sq ft'],
    ['A_L', raw(q.longLineArea), 'sq ft'], ['A_S', raw(q.specialArea), 'sq ft'],
    ['A_total', raw(q.totalArea), 'sq ft'], ['B_L', raw(q.longLineBinder), unit],
    ['B_S', raw(q.specialBinder), unit], ['B_total', raw(q.totalBinder), unit],
    ['G_L', raw(q.longLineBeads), 'lb'], ['G_S', raw(q.specialBeads), 'lb'], ['G_total', raw(q.totalBeads), 'lb']
  ], [36, 94, 48], { numeric: [1], size: 8, rowPadding: 2 });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(196, 208, 222);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    type(7.5, false, muted);
    doc.text(`${reportId} | v${reportVersion}`, margin, pageHeight - 10);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }
  return doc;
}
