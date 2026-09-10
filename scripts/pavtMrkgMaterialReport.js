// The report consumes the same unrounded calculation snapshot as the screen.
// It never reads formatted result text or the currently filtered marking rows.
function createPavementMarkingReport(calculation, project, jsPDF, createdAt = new Date()) {
  const c = calculation;
  const special = c.special;
  const reportVersion = '2.0';
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
    // Leave a small allowance for differences between PDF font metrics/renderers.
    const lines = doc.splitTextToSize(String(text), width - indent - 2);
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
    const contentHeight = lines.reduce((height, text) => height + doc.splitTextToSize(text, width - 6).length * 4.5, 0);
    ensure(contentHeight + 15 + (note ? 10 : 0));
    paragraph(title, { size: 10, bold: true, gap: 1 });
    lines.forEach((text, index) => paragraph(text, {
      size: 9, indent: 4, gap: 0.7, bold: index === 2, color: index === 2 ? blue : ink
    }));
    if (note) paragraph(note, { size: 8.5, color: muted, indent: 4, gap: 1 });
    y += 3;
  }

  function rateRecord(title, materialName, r) {
    ensure(40);
    paragraph(title, { bold: true, color: blue, size: 10 });
    paragraph(`Material: ${materialName}\nApplied basis: ${r.basis}`, { size: 9 });
    table(['Rate / property', 'Value', 'Basis'], [
      ['MDOT 4-inch binder', `${fmt(r.baseBinderPerMile)} ${r.binderUnit}/mi`, '[R1], solid line'],
      ['MDOT 4-inch beads', `${fmt(r.baseBeadsPerMile)} lb/mi`, '[R1], solid line'],
      ['Wet / minimum dry thickness', `${r.wetThickness} / ${r.minThicknessBeads} mils`, 'MDOT reference: without / with beads'],
      ['Applied reference width', `${fmt(r.referenceWidth)} in`, r.project ? 'Project entry' : 'MDOT 4-inch baseline'],
      ['Binder at reference width', `${fmt(r.referenceBinder)} ${r.binderUnit}/mi`, r.project ? 'Project entry' : '[R1]'],
      ['Beads at reference width', `${fmt(r.referenceBeads)} lb/mi`, r.project ? 'Project entry' : '[R1]']
    ], [70, 54, 60], { size: 8.5 });
    if (r.project) {
      metadata('PROJECT / MANUFACTURER RATE SOURCE', r.project.source);
      paragraph(`Original entries: reference width = ${r.project.entries.rateReferenceWidth} in; binder = ${r.project.entries.projectBinderRate} ${r.binderUnit}/mi; beads = ${r.project.entries.projectBeadRate} lb/mi.`, { size: 9 });
    }
  }
  function rawRates(r) {
    return [
      ['B_4 (MDOT)', raw(r.baseBinderPerMile), `${r.binderUnit}/mi`], ['G_4 (MDOT)', raw(r.baseBeadsPerMile), 'lb/mi'],
      ['W_ref', raw(r.referenceWidth), 'in'], ['A_ref', raw(r.referenceArea), 'sq ft/mi'],
      ['B_ref', raw(r.referenceBinder), `${r.binderUnit}/mi`], ['G_ref', raw(r.referenceBeads), 'lb/mi'],
      ['k', raw(r.widthFactor), 'dimensionless'], ['W_ft', raw(r.widthFeet), 'ft'],
      ['A_mi', raw(r.squareFeetPerMile), 'sq ft/mi'],
      ['B_W', raw(r.binderPerMile), `${r.binderUnit}/mi`], ['G_W', raw(r.beadsPerMile), 'lb/mi'],
      ['b_L', raw(r.longLineBinderPerSFT), `${r.binderUnit}/sq ft`], ['g_L', raw(r.longLineBeadsPerSFT), 'lb/sq ft'],
      ['b_special', raw(r.binderPerSFT), `${r.binderUnit}/sq ft`], ['g_special', raw(r.beadsPerSFT), 'lb/sq ft']
    ];
  }

  pageHeader();
  paragraph('Pavement marking\nmaterial calculations', { size: 22, bold: true, color: blue, gap: 4 });
  paragraph('Quantity takeoff and application-rate worksheet', { size: 11, color: muted, gap: 7 });
  paragraph(`Report ID: ${reportId} | Report format: ${reportVersion}`, { size: 8.5, color: muted, gap: 1 });
  paragraph(`Exported: ${createdAt.toISOString()} (UTC)`, { size: 8.5, color: muted, gap: 6 });
  section('1', 'Project record and reported totals');
  for (const [label, key] of [['PROJECT NAME', 'projectName'], ['PROJECT / FEDERAL-AID NUMBER', 'projectNumber'], ['PREPARED BY', 'preparedBy'], ['LOCATION / PROJECT LIMITS', 'projectLocation']]) metadata(label, project[key]);
  table(['Material', 'Area (sq ft)', 'Binder quantity', 'Beads (lb)'], c.materials.map(m => [
    m.materialName, fmt(m.totalArea, 2), `${fmt(m.totalBinder, 2)} ${m.unit}`, fmt(m.totalBeads, 2)
  ]), [65, 37, 44, 38], { numeric: [1, 2, 3] });
  paragraph(`Paint total: ${fmt(c.totals.paintGallons, 2)} gal. Thermoplastic binder total: ${fmt(c.totals.binderPounds, 2)} lb. Glass beads: ${fmt(c.totals.beadsPounds, 2)} lb.`, { bold: true });
  paragraph('Binder totals are separated by material and unit. Quantities are rounded to two decimals for reporting after summing unrounded components. Glass beads are separate from thermoplastic binder weight.', { size: 8.5, color: muted });
  metadata('QUANTITY SOURCE / PLAN SHEETS', project.quantitySource);
  metadata('PREPARER NOTES', project.calculationNotes);

  section('2', 'Sources and calculation basis', true);
  paragraph('[R1] MDOT 2020 Standard Specifications for Construction, Section 811, Table 811-1, printed page 8-60 (PDF page 622).', { bold: true, size: 9 });
  link('Open application-rate source: MDOT Table 811-1', rateSource);
  for (const m of c.materials) {
    const r = c.longLines.find(line => line.material === m.material)?.rates || special.rates;
    ensure(40);
    paragraph(`Published solid-line rates: ${m.materialName}`, { bold: true, size: 9 });
    table(['Width (in)', `Binder (${m.unit}/mi)`, 'Beads (lb/mi)'], r.tableColumns.map(row => [integer(row.width), fmt(row.binder, 2), fmt(row.beads, 2)]), [40, 70, 70], { numeric: [0, 1, 2], size: 8.5 });
  }
  paragraph('Section 811.02 gives manufacturer-recommended application rates precedence when they differ from the table. Project rates and their source are recorded separately for each long-line row and for special markings.', { size: 9 });
  ensure(36);
  paragraph('[R2] MDOT PAVE-900-H, Pavement Arrow & Message Details. Material column on sheet 9 of 10; plan date September 13, 2023.', { bold: true, size: 9 });
  link('Open unit-area source: PAVE-900-H, sheet 9', areaSource);
  paragraph('Liquid-applied material areas account for allowable template gaps. Railroad areas exclude stop bars. Sheet 7 path arrows use half of each dimension (area factor 0.25). Path legends retain 2-inch gaps when vertical dimensions are halved; their net areas and calculation references are entered from the project detail.', { size: 9 });
  ensure(25);
  paragraph('Calculation assumptions', { bold: true });
  [
    'Each long-line row has its own material, width, painted length, and rate basis. Length excludes gaps and represents individual painted lines; no automatic double-line or skip-pattern multiplier is applied. Conversion constants: 5,280 ft/mi and 12 in/ft.',
    'MDOT mode uses exact solid-line columns at 4, 6, 8, and 12 inches. Other widths use the 4-inch rate x W / 4 and are labeled derived estimates. Broken-line columns are not used because footage already excludes gaps.',
    'Special markings have an independent material and rate selection. Their area rates derive from the 4-inch MDOT baseline / 1,760 sq ft per mile, or from their own project reference rates / reference area. Long-line selections do not resize or change special markings.',
    'Quantities represent one application. No waste, overrun, extra coats, procurement rounding, or overlap deductions are added. Thicknesses are MDOT references; selecting project rates does not verify thickness compliance.',
    'Blank or zero long-line footage is inactive and retained in the input record. Positive footage requires a material and valid rates. Special quantities are nonnegative whole numbers. Active project rates and custom areas require source references. Filters and collapsed controls do not remove quantities.',
    'Intermediate quantities show six decimals, area rates twelve. Calculations use unrounded JavaScript Number values. Section 8 records raw numeric values; final reporting uses two decimals. Free-text notes do not override numeric controls.'
  ].forEach((note, i) => paragraph(`${i + 1}. ${note}`, { size: 8.5, gap: 2 }));

  section('3', 'Long-line inputs and rate selections', true);
  if (!c.longLines.length) paragraph('No active long-line rows. The long-line contribution is zero.');
  for (const line of c.longLines) {
    ensure(35);
    paragraph(`${line.label}: ${line.materialName}`, { bold: true, size: 11, color: blue });
    metadata('LINE / LOCATION REFERENCE', line.reference);
    paragraph(`Painted length entered: ${line.feetEntry} ft. Width entered: ${line.widthEntry} in. Row identifier: ${line.id}.`, { size: 9 });
    rateRecord(`${line.label} - application rates`, line.materialName, line.rates);
  }

  section('4', 'Worked long-line calculations', true);
  if (!c.longLines.length) paragraph('No long-line footage entered. A_L = 0 sq ft; long-line binder and beads = 0.');
  for (const line of c.longLines) {
    const r = line.rates;
    const unit = r.binderUnit;
    ensure(45);
    paragraph(`${line.label}: ${line.materialName}`, { bold: true, color: blue, size: 11 });
    paragraph(`L = ${fmt(line.feetPainted)} ft; W = ${integer(line.width)} in. ${r.basis}.`, { size: 9 });
    const binderFormula = r.method === 'table' ? 'B_W = published solid-column rate' : 'B_W = B_ref x W / W_ref';
    const beadFormula = r.method === 'table' ? 'G_W = published solid-column rate' : 'G_W = G_ref x W / W_ref';
    const binderSub = r.method === 'table' ? `Table 811-1, ${line.materialName}, ${line.width}-inch solid` : `${fmt(r.referenceBinder)} ${unit}/mi x ${line.width} / ${fmt(r.referenceWidth)}`;
    const beadSub = r.method === 'table' ? `Table 811-1, ${line.materialName}, ${line.width}-inch solid` : `${fmt(r.referenceBeads)} lb/mi x ${line.width} / ${fmt(r.referenceWidth)}`;
    table(['Formula / step', 'Substitution', 'Result'], [
      ['Width in feet: W_ft = W / 12', `${line.width} in / (12 in/ft)`, `${fmt(r.widthFeet)} ft`],
      ['Length in miles: L_mi = L / 5,280', `${fmt(line.feetPainted)} ft / (5,280 ft/mi)`, `${fmt(line.feetPainted / 5280, 12)} mi`],
      ['Width ratio: k = W / W_ref', `${line.width} / ${fmt(r.referenceWidth)}`, fmt(r.widthFactor)],
      ['Reference area: A_ref = 5,280 x W_ref / 12', `5,280 x ${fmt(r.referenceWidth)} / 12`, `${fmt(r.referenceArea)} sq ft/mi`],
      ['Area per mile: A_mi = 5,280 x W_ft', `5,280 x (${line.width} / 12)`, `${fmt(r.squareFeetPerMile)} sq ft/mi`],
      [binderFormula, binderSub, `${fmt(r.binderPerMile)} ${unit}/mi`],
      [beadFormula, beadSub, `${fmt(r.beadsPerMile)} lb/mi`],
      ['Binder area rate: b_L = B_W / A_mi', `${fmt(r.binderPerMile)} / ${fmt(r.squareFeetPerMile)}`, `${fmt(r.longLineBinderPerSFT, 12)} ${unit}/sq ft`],
      ['Bead area rate: g_L = G_W / A_mi', `${fmt(r.beadsPerMile)} / ${fmt(r.squareFeetPerMile)}`, `${fmt(r.longLineBeadsPerSFT, 12)} lb/sq ft`],
      ['Painted area: A_L = L x W / 12', `${fmt(line.feetPainted)} ft x (${line.width} / 12) ft`, `${fmt(line.area)} sq ft`],
      ['Binder: B_L = (L / 5,280) x B_W', `(${fmt(line.feetPainted)} / 5,280) x ${fmt(r.binderPerMile)}`, `${fmt(line.binder)} ${unit}`],
      ['Beads: G_L = (L / 5,280) x G_W', `(${fmt(line.feetPainted)} / 5,280) x ${fmt(r.beadsPerMile)}`, `${fmt(line.beads)} lb`],
      ['Binder check: A_L x b_L', `${fmt(line.area)} x ${fmt(r.longLineBinderPerSFT, 12)}`, `${fmt(line.area * r.longLineBinderPerSFT)} ${unit}`],
      ['Bead check: A_L x g_L', `${fmt(line.area)} x ${fmt(r.longLineBeadsPerSFT, 12)}`, `${fmt(line.area * r.longLineBeadsPerSFT)} lb`]
    ], [66, 69, 49], { size: 8.5 });
    paragraph('The width ratio is used for project or derived rates. In MDOT mode at tabulated widths, the printed rate is used directly.', { size: 8.5, color: muted });
  }

  section('5', 'Special marking calculations', true);
  if (!special.markings.length) paragraph('No special markings entered. Special area, binder, and beads are zero; the complete input schedule is retained in section 7.');
  else {
    const r = special.rates;
    const unit = r.binderUnit;
    rateRecord('Independent special marking rate selection', special.materialName, r);
    worked('Reference area', 'A_ref = 5,280 x W_ref / 12', `A_ref = 5,280 x ${fmt(r.referenceWidth)} / 12`, `A_ref = ${fmt(r.referenceArea)} sq ft/mi`);
    worked('Special binder area rate', 'b = B_ref / A_ref', `b = ${fmt(r.referenceBinder)} ${unit}/mi / ${fmt(r.referenceArea)} sq ft/mi`, `b = ${fmt(r.binderPerSFT, 12)} ${unit}/sq ft`);
    worked('Special bead area rate', 'g = G_ref / A_ref', `g = ${fmt(r.referenceBeads)} lb/mi / ${fmt(r.referenceArea)} sq ft/mi`, `g = ${fmt(r.beadsPerSFT, 12)} lb/sq ft`);
    paragraph('For each marking: A_i = count x net unit area; B_i = A_i x b; G_i = A_i x g.', { bold: true });
    special.markings.forEach((m, index) => {
      ensure(60);
      paragraph(`5.${index + 1} ${m.category}: ${m.label}`, { bold: true, color: blue, size: 10 });
      paragraph(`Size: ${m.sizeLabel}. Standard area = ${fmt(m.standardArea, 2)} sq ft/each.\nArea basis: ${m.areaBasis}`, { size: 9 });
      if (m.sizeMode === 'path' && !m.areaEntry) paragraph(`Unit area: ${fmt(m.standardArea, 2)} x 0.5 x 0.5 = ${fmt(m.unitArea)} sq ft/each`, { size: 9 });
      if (m.areaEntry) paragraph(`Entered net unit area: ${m.areaEntry} sq ft/each`, { size: 9 });
      paragraph(`Area: ${integer(m.quantity)} each x ${fmt(m.unitArea)} sq ft/each = ${fmt(m.area)} sq ft\nBinder: ${fmt(m.area)} sq ft x ${fmt(r.binderPerSFT, 12)} ${unit}/sq ft = ${fmt(m.area * r.binderPerSFT)} ${unit}\nBeads: ${fmt(m.area)} sq ft x ${fmt(r.beadsPerSFT, 12)} lb/sq ft = ${fmt(m.area * r.beadsPerSFT)} lb`, { size: 9, indent: 4 });
    });
    const categories = ['Legend', 'Symbol'].map(category => {
      const entries = special.markings.filter(m => m.category === category);
      return { category, count: entries.reduce((sum, m) => sum + m.quantity, 0), area: entries.reduce((sum, m) => sum + m.area, 0) };
    });
    ensure(45);
    paragraph('Special marking category subtotals', { bold: true });
    table(['Category', 'Count', 'Area (sq ft)', `Binder (${unit})`, 'Beads (lb)'], categories.map(m => [m.category, integer(m.count), fmt(m.area), fmt(m.area * r.binderPerSFT), fmt(m.area * r.beadsPerSFT)]), [34, 23, 41, 43, 43], { numeric: [1, 2, 3, 4], size: 8 });
    worked('Special area subtotal', 'A_S = A_legends + A_symbols', `A_S = ${fmt(categories[0].area)} + ${fmt(categories[1].area)}`, `A_S = ${fmt(special.area)} sq ft`);
    worked('Special binder subtotal', 'B_S = A_S x b', `B_S = ${fmt(special.area)} x ${fmt(r.binderPerSFT, 12)}`, `B_S = ${fmt(special.binder)} ${unit}`);
    worked('Special bead subtotal', 'G_S = A_S x g', `G_S = ${fmt(special.area)} x ${fmt(r.beadsPerSFT, 12)}`, `G_S = ${fmt(special.beads)} lb`);
  }

  section('6', 'Material totals and reconciliation', true);
  for (const m of c.materials) {
    const lines = c.longLines.filter(line => line.material === m.material);
    const matchingSpecial = special.markings.length && special.material === m.material;
    const binderCheck = lines.reduce((sum, line) => sum + line.area * line.rates.longLineBinderPerSFT, 0) + (matchingSpecial ? special.area * special.rates.binderPerSFT : 0);
    const beadCheck = lines.reduce((sum, line) => sum + line.area * line.rates.longLineBeadsPerSFT, 0) + (matchingSpecial ? special.area * special.rates.beadsPerSFT : 0);
    ensure(45);
    paragraph(m.materialName, { bold: true, color: blue, size: 11 });
    paragraph(`Long-line binder sum: ${lines.length ? lines.map(line => `${line.label} (${fmt(line.binder)})`).join(' + ') : '0'} = ${fmt(m.longLineBinder)} ${m.unit}.`, { size: 9 });
    paragraph(`Long-line bead sum: ${lines.length ? lines.map(line => `${line.label} (${fmt(line.beads)})`).join(' + ') : '0'} = ${fmt(m.longLineBeads)} lb.`, { size: 9 });
    table(['Total formula', 'Substitution', 'Result / reported'], [
      ['Area = long lines + specials', `${fmt(m.longLineArea)} + ${fmt(m.specialArea)}`, `${fmt(m.totalArea)} sq ft`],
      ['Binder = long lines + specials', `${fmt(m.longLineBinder)} + ${fmt(m.specialBinder)}`, `${fmt(m.totalBinder)} ${m.unit}\nReported: ${fmt(m.totalBinder, 2)} ${m.unit}`],
      ['Beads = long lines + specials', `${fmt(m.longLineBeads)} + ${fmt(m.specialBeads)}`, `${fmt(m.totalBeads)} lb\nReported: ${fmt(m.totalBeads, 2)} lb`]
    ], [62, 60, 62], { size: 8.5 });
    ensure(40);
    paragraph('Area-method reconciliation: sum each row area x its own rate, then add matching special markings.', { size: 9 });
    table(['Check', 'Component total', 'Sum of area x rate', 'Difference'], [
      [`Binder (${m.unit})`, fmt(m.totalBinder), fmt(binderCheck), smallDifference(m.totalBinder - binderCheck)],
      ['Beads (lb)', fmt(m.totalBeads), fmt(beadCheck), smallDifference(m.totalBeads - beadCheck)]
    ], [35, 49, 55, 45], { numeric: [1, 2, 3], size: 8 });
  }
  paragraph(`All-material bead sum: ${c.materials.map(m => fmt(m.totalBeads)).join(' + ')} = ${fmt(c.totals.beadsPounds)} lb; reported = ${fmt(c.totals.beadsPounds, 2)} lb.`, { size: 9 });
  paragraph('Near-zero residuals can arise from floating-point arithmetic. Reconciliation checks the aggregation methods, not field measurements or contract applicability. Final quantities are rounded for reporting; no procurement rounding is applied.', { size: 8.5, color: muted });

  section('7', 'Complete input schedules', true);
  paragraph('Long-line rows, including zero or blank footage. Inactive rows contribute zero. Each row reference and original rate-entry text is retained below.', { size: 9 });
  if (!c.allLongLines.length) paragraph('All long-line rows were removed.');
  else table(['Row', 'Material', 'Width entered (in)', 'Footage entered (ft)', 'Status'], c.allLongLines.map(line => [line.label, line.materialName, line.widthEntry || '(blank)', line.feetEntry || '(blank)', line.feetPainted > 0 ? 'Included' : 'Inactive']), [23, 64, 31, 39, 27], { size: 8 });
  for (const line of c.allLongLines) {
    paragraph(`${line.label} (${line.id}) reference: ${line.reference || '(not entered)'}. Rate mode: ${line.rateInputs.rateMode}. Original project entries: width = ${line.rateInputs.rateReferenceWidth || '(blank)'}, binder = ${line.rateInputs.projectBinderRate || '(blank)'}, beads = ${line.rateInputs.projectBeadRate || '(blank)'}. Rate source: ${line.rateInputs.rateReference || '(not entered)'}.`, { size: 8.5 });
  }
  paragraph(`Special marking selection: ${special.materialName}. ${special.markings.length ? 'Applied to all entered special markings.' : 'Inactive: no special quantities.'}`, { bold: true, size: 9 });
  paragraph(`Special rate mode: ${special.rateInputs.rateMode}; reference width entry: ${special.rateInputs.rateReferenceWidth || '(blank)'}; binder entry: ${special.rateInputs.projectBinderRate || '(blank)'}; bead entry: ${special.rateInputs.projectBeadRate || '(blank)'}. Source: ${special.rateInputs.rateReference || '(not entered)'}.`, { size: 8.5 });
  paragraph(`All ${special.allMarkings.length} available marking types follow, including zeros and blanks. Standard unit areas come from [R2]. Size adjustments are identified; inactive custom areas show zero.`, { size: 9 });
  for (const category of ['Legend', 'Symbol']) {
    ensure(35);
    paragraph(`${category}s`, { bold: true, color: blue });
    table(['Marking / adjusted size', 'Entered', 'Count used', 'Unit area (sq ft/each)', 'Area (sq ft)'], special.allMarkings.filter(m => m.category === category).map(m => [m.label + (m.sizeMode === 'standard' ? '' : `\n${m.sizeLabel}`), m.enteredValue || '(blank)', integer(m.quantity), fmt(m.unitArea), fmt(m.area)]), [76, 22, 22, 33, 31], { numeric: [2, 3, 4], size: 8 });
  }

  section('8', 'Raw numeric calculation record', true);
  paragraph('Raw numeric values are serialized as decimal strings to support reproduction without using rounded intermediates. The calculation uses JavaScript Number arithmetic. Units are retained independently for every material.');
  for (const line of c.longLines) {
    ensure(35);
    paragraph(`${line.label}: ${line.materialName} (${line.id})`, { bold: true, color: blue });
    table(['Variable', 'Raw numeric value', 'Unit'], [
      ['W', raw(line.width), 'in'], ['L', raw(line.feetPainted), 'ft'], ['L_mi', raw(line.feetPainted / 5280), 'mi'],
      ...rawRates(line.rates), ['A_L', raw(line.area), 'sq ft'], ['B_L', raw(line.binder), line.rates.binderUnit], ['G_L', raw(line.beads), 'lb']
    ], [42, 94, 48], { numeric: [1], size: 8, rowPadding: 2 });
  }
  if (special.rates) {
    ensure(35);
    paragraph(`Special markings: ${special.materialName}`, { bold: true, color: blue });
    table(['Variable', 'Raw numeric value', 'Unit'], [...rawRates(special.rates), ['A_S', raw(special.area), 'sq ft'], ['B_S', raw(special.binder), special.rates.binderUnit], ['G_S', raw(special.beads), 'lb']], [42, 94, 48], { numeric: [1], size: 8, rowPadding: 2 });
  }
  for (const m of special.allMarkings.filter(m => m.sizeMode !== 'standard')) paragraph(`${m.label}: size = ${m.sizeLabel}; count = ${raw(m.quantity)}; standard area = ${raw(m.standardArea)}; unit area used = ${raw(m.unitArea)}; extended area = ${raw(m.area)} sq ft. Entered area: ${m.areaEntry || '(automatic / blank)'}. Source: ${m.areaBasis || '(not entered; inactive)'}.`, { size: 8.5 });
  ensure(35);
  paragraph('Raw material totals', { bold: true });
  table(['Material', 'Binder', 'Unit', 'Beads (lb)', 'Area (sq ft)'], c.materials.map(m => [m.materialName, raw(m.totalBinder), m.unit, raw(m.totalBeads), raw(m.totalArea)]), [58, 42, 16, 36, 32], { numeric: [1, 3, 4], size: 8 });
  paragraph(`Raw project totals: paint = ${raw(c.totals.paintGallons)} gal; thermoplastic binder = ${raw(c.totals.binderPounds)} lb; beads = ${raw(c.totals.beadsPounds)} lb; long lines = ${raw(c.totals.longLineFeet)} ft; area = ${raw(c.totals.totalArea)} sq ft.`, { size: 8.5 });

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
