(function () {
  'use strict';
  window.AccessDensityReports = function ({ getData, getMapSnapshot }) {
    const $ = id => document.getElementById(id);
    const dialog = $('reportsDialog');
    let pages = [], pageIndex = 0, busy = false, reportStudyName = '';
    let mapSnapshot = null, loadingMap = false, mapError = '', mapRequest = 0;
    $('reportInterval').value = '1000';
    $('reportType').value = 'all';
    $('reportShortHighway').checked = false;

    function controls() {
      const waiting = busy || loadingMap;
      $('reportPrevious').disabled = waiting || pageIndex === 0;
      $('reportNext').disabled = waiting || pageIndex >= pages.length - 1;
      ['reportPrint', 'reportPDF'].forEach(id => { $(id).disabled = waiting || Boolean(mapError) || !pages.length; });
      ['reportType', 'reportInterval', 'reportShortHighway', 'studyName'].forEach(id => { $(id).disabled = waiting; });
      $('reportPageNumber').textContent = pages.length ? `Page ${pageIndex + 1} of ${pages.length}` : 'No report';
      [...$('reportPages').children].forEach((sheet, index) => { sheet.hidden = index !== pageIndex; });
    }

    function refresh() {
      pageIndex = 0;
      $('reportPages').replaceChildren();
      try {
        const intervalFeet = Number($('reportInterval').value);
        const input = getData();
        $('reportShortHighwayControl').hidden = !(input.lengthFeet > 0 && input.lengthFeet < 2640);
        const data = window.AccessDensityReportCore.calculate({ ...input, intervalFeet, shortHighway: $('reportShortHighway').checked });
        reportStudyName = data.studyName;
        pages = window.AccessDensityReportCharts.renderPages(data, $('reportType').value, mapSnapshot);
        pages.forEach(page => {
          const sheet = document.createElement('div');
          sheet.className = 'report-sheet';
          // The renderer escapes all access names before building this SVG.
          sheet.innerHTML = page.svg;
          $('reportPages').append(sheet);
        });
        $('reportMessage').textContent = loadingMap ? 'Preparing the study map...' : mapError || mapSnapshot?.warning || '';
      } catch (error) {
        pages = [];
        $('reportMessage').textContent = error.message;
      }
      controls();
    }

    async function canvasFor(page) {
      const url = URL.createObjectURL(new Blob([page.svg], { type: 'image/svg+xml;charset=utf-8' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        // 3000 pixels across a 10-inch printable width = 300 dpi.
        canvas.width = 3000;
        canvas.height = Math.round(3000 * page.height / page.width);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
      } finally { URL.revokeObjectURL(url); }
    }

    function download(blob, filename) {
      if (!blob) throw new Error('The export could not be created. Please try again.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.append(link);
      link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function exportReport() {
      if (busy || loadingMap || mapError || !pages.length) return;
      busy = true;
      controls();
      const kind = $('reportType').value;
      const selectedPages = [...pages];
      const studyName = reportStudyName;
      const filename = studyName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'study';
      try {
        if (!window.jspdf?.jsPDF) throw new Error('The PDF exporter could not load. Use Print and choose Save as PDF, or reload and try again.');
        const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter', compress: true });
        pdf.setProperties({ title: `${studyName} - Roadway Access Analysis Report`, subject: 'Access-based speed recommendations - MCL 257.627', creator: 'RCOC Tools' });
        for (let index = 0; index < selectedPages.length; index++) {
          $('reportMessage').textContent = `Preparing PDF page ${index + 1} of ${selectedPages.length}...`;
          const page = selectedPages[index];
          const canvas = await canvasFor(page);
          if (index) pdf.addPage('letter', 'landscape');
          const scale = Math.min(720 / page.width, 540 / page.height);
          const width = page.width * scale, height = page.height * scale;
          const left = (792 - width) / 2, top = (612 - height) / 2;
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', left, top, width, height, undefined, 'FAST');
          (page.links || []).forEach(link => pdf.link(left + link.x * scale, top + link.y * scale, link.width * scale, link.height * scale, { url: link.url }));
          canvas.width = 0; canvas.height = 0;
        }
        download(pdf.output('blob'), `${filename}-roadway-access-${kind}-report.pdf`);
        $('reportMessage').textContent = 'Export ready.';
      } catch (error) { $('reportMessage').textContent = error.message; }
      finally { busy = false; controls(); }
    }

    $('studyName').addEventListener('input', () => {
      $('studyNameError').hidden = true;
      $('studyName').setAttribute('aria-invalid', 'false');
    });
    $('reportType').addEventListener('change', refresh);
    $('reportInterval').addEventListener('input', refresh);
    $('reportShortHighway').addEventListener('change', refresh);
    $('reportPrevious').addEventListener('click', () => { pageIndex--; controls(); });
    $('reportNext').addEventListener('click', () => { pageIndex++; controls(); });
    $('reportClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      document.body.classList.remove('reports-open');
      mapRequest++; loadingMap = false; controls();
    });
    $('reportPrint').addEventListener('click', () => { if (pages.length && !loadingMap && !mapError) window.print(); });
    $('reportPDF').addEventListener('click', exportReport);
    return {
      reset() {
        $('reportShortHighway').checked = false;
        $('studyName').value = '';
        $('studyNameError').hidden = true;
        $('studyName').setAttribute('aria-invalid', 'false');
        mapSnapshot = null; mapRequest++;
      },
      open() {
        if (!String($('studyName').value || '').trim()) {
          $('studyNameError').hidden = false;
          $('studyName').setAttribute('aria-invalid', 'true');
          $('studyName').focus();
          return;
        }
        mapSnapshot = null; mapError = ''; loadingMap = Boolean(getMapSnapshot);
        refresh();
        document.body.classList.add('reports-open');
        dialog.showModal();
        if (getMapSnapshot) {
          const request = ++mapRequest;
          Promise.resolve().then(getMapSnapshot).then(snapshot => {
            if (request !== mapRequest || !dialog.open) return;
            mapSnapshot = snapshot; loadingMap = false; refresh();
          }).catch(error => {
            if (request !== mapRequest || !dialog.open) return;
            loadingMap = false;
            mapError = 'The study map could not be prepared. Return to the map and reopen Reports. ' + error.message;
            refresh();
          });
        }
      }
    };
  };
})();
