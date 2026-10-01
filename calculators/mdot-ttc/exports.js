(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TTCExports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  async function word(records, lib) {
    if (!records.length) throw new Error('Select at least one typical first.');
    if (!lib?.Packer) throw new Error('The Word export library could not load. Reload the page and try again.');
    const { Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, TableLayoutType, VerticalAlign, BorderStyle } = lib;
    const widths = [3300, 6420];
    const row = (values, header = false) => new TableRow({ tableHeader: header, cantSplit: true, children: values.map((text, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
      margins: { top: 110, bottom: 110, left: 110, right: 110 },
      ...(header ? { shading: { fill: 'EAF0F4' } } : {}),
      children: [new Paragraph({ spacing: { after: 0, before: 0, line: 264 }, children: [new TextRun({ text, bold: header, font: 'Arial', size: 22 })] })],
    })) });
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'B8C4CE' };
    const table = new Table({ width: { size: 9720, type: WidthType.DXA }, columnWidths: widths,
      layout: TableLayoutType.FIXED, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [row(['Typical Number', 'Title'], true), ...records.map(r => row([r.id, r.title]))] });
    const document = new Document({ creator: "Andy's Traffic Tools", title: 'MDOT TTC Selected Typicals',
      sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1260, bottom: 1260, left: 1260, right: 1260 } } }, children: [table] }] });
    return Packer.toBlob(document);
  }
  async function sha256(bytes) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function verifiedPDF(record, lib, fetchFile, digest) {
    const bytes = await fetchFile(record.pdf.path);
    if (await digest(bytes) !== record.pdf.sha256) throw new Error('The stored file did not pass its integrity check.');
    const document = await lib.PDFDocument.load(bytes, { updateMetadata: false });
    if (document.getPageCount() !== record.pdf.pages) throw new Error('The stored file has an unexpected page count.');
    return { bytes, document };
  }
  function zipFilename(value) {
    const name = String(value ?? '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 160).trim();
    return name ? `${name}-mdot-ttc-details.zip` : 'mdot-ttc-details.zip';
  }
  async function zip(records, lib, pdfLib, fetchFile, { progress = () => {}, digest = sha256 } = {}) {
    if (!records.length) throw new Error('Select at least one typical first.');
    if (!lib?.zipSync) throw new Error('The ZIP export library could not load. Reload the page and try again.');
    if (!pdfLib?.PDFDocument) throw new Error('The PDF verification library could not load. Reload the page and try again.');
    const files = Object.create(null);
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      try {
        progress(index, records.length, record.id);
        // Keep official identifiers, including parentheses and plus signs, as flat filenames.
        if (!/^[A-Za-z0-9][A-Za-z0-9()+_-]*$/.test(record.id)) throw new Error('The typical has an invalid filename.');
        const filename = `${record.id}.pdf`;
        if (files[filename]) throw new Error('The typical is duplicated in this export.');
        const { bytes } = await verifiedPDF(record, pdfLib, fetchFile, digest);
        files[filename] = new Uint8Array(bytes);
      } catch (cause) {
        const error = new Error(`Could not include ${record.id}: ${cause.message} No ZIP was downloaded. Retry after restoring this PDF or updating your selection.`);
        error.typicalId = record.id;
        throw error;
      }
    }
    progress(records.length, records.length, 'Saving ZIP');
    // PDFs are already compressed. Store their exact bytes without recompressing or rewriting them.
    return lib.zipSync(files, { level: 0 });
  }
  function projectName(value) {
    const name = String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!name) throw new Error('Enter a project name before downloading the PDF.');
    if (name.length > 160) throw new Error('Keep the project name to 160 characters or fewer.');
    return name;
  }
  function wrap(text, font, size, width) {
    const lines = [];
    let line = '';
    for (const word of text.trim().split(/\s+/)) {
      if (line && font.widthOfTextAtSize(line + ' ' + word, size) <= width) { line += ' ' + word; continue; }
      if (line) lines.push(line);
      line = '';
      for (const char of word) {
        if (line && font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = ''; }
        line += char;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  function indexLayout(records, name, font) {
    const projectLines = wrap(name, font, 10, 516);
    const tableTop = 698 - projectLines.length * 13;
    const pages = [[]];
    let remaining = tableTop - 28 - 60;
    for (const record of records) {
      const code = wrap(record.id, font, 9, 154);
      const title = wrap(record.title, font, 9.5, 270);
      const height = Math.max(code.length, title.length) * 12 + 16;
      if (height > remaining) { pages.push([]); remaining = tableTop - 28 - 60; }
      pages.at(-1).push({ record, code, title, height });
      remaining -= height;
    }
    return { pages, projectLines, tableTop };
  }
  function drawCover(page, name, records, fonts, colors) {
    const { regular, bold } = fonts;
    page.drawRectangle({ x: 0, y: 778, width: 612, height: 14, color: colors.ink });
    page.drawText('MDOT TTC / PROJECT DETAILS', { x: 48, y: 720, size: 11, font: bold, color: colors.muted });
    page.drawText('Maintaining Traffic', { x: 48, y: 656, size: 32, font: bold, color: colors.ink });
    page.drawText('Typicals', { x: 48, y: 616, size: 32, font: bold, color: colors.ink });
    page.drawRectangle({ x: 48, y: 585, width: 60, height: 4, color: colors.accent });
    page.drawText('PROJECT NAME', { x: 48, y: 537, size: 10, font: bold, color: colors.muted });
    const lines = wrap(name, bold, 26, 516);
    lines.forEach((line, i) => page.drawText(line, { x: 48, y: 501 - i * 33, size: 26, font: bold, color: colors.ink }));
    const y = 501 - lines.length * 33 - 34;
    const detailPages = records.reduce((sum, r) => sum + r.pdf.pages, 0);
    page.drawText(`${records.length} selected ${records.length === 1 ? 'detail' : 'details'}`, { x: 48, y, size: 13, font: regular, color: colors.ink });
    page.drawText(`${detailPages} detail ${detailPages === 1 ? 'page' : 'pages'}`, { x: 300, y, size: 13, font: regular, color: colors.ink });
    page.drawText('Index follows. Page references include this title page and the index.', { x: 48, y: 126, size: 10, font: regular, color: colors.muted });
    page.drawText('Original MDOT typicals with packet page numbers.', { x: 48, y: 110, size: 10, font: regular, color: colors.muted });
  }
  function drawIndex(packet, pages, layout, fonts, colors, firstDetail) {
    let next = firstDetail + 1;
    layout.pages.forEach((rows, index) => {
      const page = pages[index];
      page.drawText(index ? 'Index (continued)' : 'Index', { x: 48, y: 738, size: 26, font: fonts.bold, color: colors.ink });
      layout.projectLines.forEach((line, i) => page.drawText(line, { x: 48, y: 714 - i * 13, size: 10, font: fonts.regular, color: colors.muted }));
      const top = layout.tableTop;
      page.drawRectangle({ x: 48, y: top - 28, width: 516, height: 28, color: colors.tint });
      for (const [text, x] of [['Typical number', 56], ['Title', 226], ['Pages', 512]]) {
        page.drawText(text, { x, y: top - 18, size: 9, font: fonts.bold, color: colors.ink });
      }
      let y = top - 28;
      for (const row of rows) {
        row.code.forEach((line, i) => page.drawText(line, { x: 56, y: y - 17 - i * 12, size: 9, font: fonts.regular, color: colors.ink }));
        row.title.forEach((line, i) => page.drawText(line, { x: 226, y: y - 17 - i * 12, size: 9.5, font: fonts.regular, color: colors.ink }));
        const end = next + row.record.pdf.pages - 1;
        const range = next === end ? String(next) : `${next}-${end}`;
        page.drawText(range, { x: 556 - fonts.bold.widthOfTextAtSize(range, 9), y: y - 17, size: 9, font: fonts.bold, color: colors.ink });
        // Each index row links to its first detail page in the completed packet.
        page.node.addAnnot(packet.context.register(packet.context.obj({ Type: 'Annot', Subtype: 'Link',
          Rect: [48, y - row.height, 564, y], Border: [0, 0, 0], Dest: [packet.getPage(next - 1).ref, 'Fit'] })));
        y -= row.height;
        page.drawLine({ start: { x: 48, y }, end: { x: 564, y }, thickness: 0.5, color: colors.rule });
        next = end + 1;
      }
    });
  }
  function drawPageNumber(page, label, font, lib, frontMatter) {
    const box = page.getCropBox();
    const angle = ((page.getRotation().angle % 360) + 360) % 360;
    const width = angle === 90 || angle === 270 ? box.height : box.width;
    const x = (width - font.widthOfTextAtSize(label, 8)) / 2;
    // The patching typicals extend farther down the page than most MDOT details.
    // Keep detail labels in the blank strip below their original title blocks.
    const y = frontMatter ? 24 : 12;
    const positions = { 0: [x, y], 90: [box.width - y, x], 180: [box.width - x, box.height - y], 270: [y, box.height - x] };
    const [px, py] = positions[angle];
    page.drawText(label, { x: box.x + px, y: box.y + py, size: 8, font, rotate: lib.degrees(angle), color: lib.rgb(0.22, 0.28, 0.33) });
  }
  async function pdf(records, lib, fetchFile, { projectName: input, progress = () => {}, digest = sha256 } = {}) {
    if (!records.length) throw new Error('Select at least one typical first.');
    if (!lib?.PDFDocument) throw new Error('The PDF export library could not load. Reload the page and try again.');
    const name = projectName(input);
    const packet = await lib.PDFDocument.create();
    const fonts = { regular: await packet.embedFont(lib.StandardFonts.Helvetica), bold: await packet.embedFont(lib.StandardFonts.HelveticaBold) };
    try { fonts.bold.encodeText(name); }
    catch (_) { throw new Error('The project name contains a character the PDF font cannot print. Use letters, numbers, and standard punctuation.'); }
    const colors = { ink: lib.rgb(0.08, 0.21, 0.31), muted: lib.rgb(0.32, 0.40, 0.47), accent: lib.rgb(0.74, 0.40, 0.15), tint: lib.rgb(0.92, 0.95, 0.96), rule: lib.rgb(0.80, 0.85, 0.88) };
    const layout = indexLayout(records, name, fonts.regular);
    const cover = packet.addPage([612, 792]);
    const indexPages = layout.pages.map(() => packet.addPage([612, 792]));
    const firstDetail = packet.getPageCount();
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      try {
        progress(index, records.length, record.id);
        const { document: source } = await verifiedPDF(record, lib, fetchFile, digest);
        const pages = await packet.copyPages(source, source.getPageIndices());
        pages.forEach(page => packet.addPage(page));
      } catch (cause) {
        const error = new Error(`Could not include ${record.id}: ${cause.message} No PDF was downloaded. Retry or remove this typical.`);
        error.typicalId = record.id;
        throw error;
      }
    }
    drawCover(cover, name, records, fonts, colors);
    drawIndex(packet, indexPages, layout, fonts, colors, firstDetail);
    const total = packet.getPageCount();
    packet.getPages().forEach((page, i) => drawPageNumber(page, `Page ${i + 1} of ${total}`, fonts.regular, lib, i < firstDetail));
    packet.setTitle(`${name} - MDOT TTC Typical Details`);
    progress(records.length, records.length, 'Saving combined PDF');
    return packet.save({ addDefaultPage: false });
  }
  return { word, pdf, zip, zipFilename, sha256, projectName };
});
