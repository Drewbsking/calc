(() => {
  'use strict';
  const $ = id => document.getElementById('drawing-preview' + (id ? '-' + id : ''));
  const panel = $(''), stage = $('stage');
  const base = new URL('.', document.currentScript.src);
  let renderer, active = null, resizeTimer;

  function library() {
    if (!renderer) {
      renderer = import(new URL('vendor/pdfjs/pdf.min.mjs', base).href).then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', base).href;
        return pdfjs;
      }).catch(error => { renderer = null; throw error; });
    }
    return renderer;
  }
  function dispose(state) {
    state.renderTask?.cancel();
    state.loadingTask?.destroy().catch(() => {});
  }
  function close(restoreFocus = false) {
    clearTimeout(resizeTimer);
    const previous = active;
    active = null; panel.hidden = true;
    stage.replaceChildren();
    if (!previous) return;
    previous.trigger.setAttribute('aria-expanded', 'false');
    dispose(previous);
    if (restoreFocus && previous.trigger.isConnected) previous.trigger.focus({ preventScroll: true });
  }
  function position() {
    if (!active) return;
    const anchor = active.trigger.getBoundingClientRect(), gap = 12;
    const width = panel.offsetWidth, height = panel.offsetHeight;
    let left = (innerWidth - width) / 2;
    if (anchor.right + gap + width <= innerWidth - gap) left = anchor.right + gap;
    else if (anchor.left - gap - width >= gap) left = anchor.left - gap - width;
    panel.style.left = Math.max(gap, Math.min(left, innerWidth - width - gap)) + 'px';
    panel.style.top = Math.max(gap, Math.min(anchor.top - 40, innerHeight - height - gap)) + 'px';
  }
  function controls(state, drawing = false) {
    $('previous').disabled = !state.pdf || drawing || state.page === 1;
    $('next').disabled = !state.pdf || drawing || state.page === state.record.pdf.pages;
    $('zoom').disabled = !state.pdf || drawing;
    $('page').textContent = `Page ${state.page} of ${state.record.pdf.pages}`;
  }
  function failed(state) {
    if (active !== state) return;
    stage.replaceChildren();
    stage.setAttribute('aria-busy', 'false');
    $('status').textContent = `Could not preview ${state.record.id}. Try again or use its View PDF link.`;
    $('status').dataset.error = 'true';
    $('retry').hidden = false;
    controls(state);
  }
  async function draw(state) {
    if (active !== state || !state.pdf) return;
    const version = ++state.drawVersion;
    state.renderTask?.cancel();
    controls(state, true);
    stage.replaceChildren(); stage.setAttribute('aria-busy', 'true');
    $('status').textContent = 'Loading drawing…';
    $('status').dataset.error = 'false'; $('retry').hidden = true;
    try {
      const page = await state.pdf.getPage(state.page);
      if (active !== state || version !== state.drawVersion) return;
      const natural = page.getViewport({ scale: 1 });
      const fit = Math.min((stage.clientWidth - 24) / natural.width, (stage.clientHeight - 24) / natural.height);
      const viewport = page.getViewport({ scale: Math.max(0.05, fit) * state.zoom });
      const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(12000000 / (viewport.width * viewport.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width * density); canvas.height = Math.ceil(viewport.height * density);
      canvas.style.width = viewport.width + 'px'; canvas.style.height = viewport.height + 'px';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${state.record.id}: ${state.record.title}, page ${state.page} of ${state.pdf.numPages}`);
      state.renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport,
        transform: [density, 0, 0, density, 0, 0], background: '#ffffff' });
      await state.renderTask.promise;
      if (active !== state || version !== state.drawVersion) return;
      stage.replaceChildren(canvas); stage.scrollTop = 0; stage.scrollLeft = 0;
      stage.setAttribute('aria-busy', 'false'); $('status').textContent = '';
      controls(state);
    } catch (error) {
      if (error.name !== 'RenderingCancelledException' && version === state.drawVersion) failed(state);
    }
  }
  async function load(state) {
    controls(state, true);
    stage.setAttribute('aria-busy', 'true');
    $('status').textContent = 'Loading drawing…';
    $('status').dataset.error = 'false'; $('retry').hidden = true;
    try {
      const pdfjs = await library();
      if (active !== state) return;
      state.loadingTask = pdfjs.getDocument({
        url: new URL(state.record.pdf.path, base).href,
        cMapUrl: new URL('vendor/pdfjs/cmaps/', base).href, cMapPacked: true,
        standardFontDataUrl: new URL('vendor/pdfjs/standard_fonts/', base).href,
        wasmUrl: new URL('vendor/pdfjs/wasm/', base).href,
        isEvalSupported: false, stopAtErrors: true,
      });
      const pdf = await state.loadingTask.promise;
      if (active !== state) return;
      if (pdf.numPages !== state.record.pdf.pages) throw new Error('Unexpected page count');
      state.pdf = pdf;
      await draw(state);
    } catch (_) { failed(state); }
  }
  function open(record, trigger) {
    close();
    active = { record, trigger, page: 1, zoom: 1, drawVersion: 0 };
    $('title').textContent = record.id;
    $('subtitle').textContent = record.title;
    $('zoom').value = '1';
    trigger.setAttribute('aria-expanded', 'true');
    panel.hidden = false; position();
    load(active);
  }
  function createButton(record, text = 'Preview drawing') {
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'ttc-button secondary ttc-preview-trigger';
    trigger.textContent = text; trigger.dataset.preview = record.id;
    trigger.setAttribute('aria-label', `${text} ${record.id}`);
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () => {
      if (active?.trigger === trigger) { close(true); return; }
      open(record, trigger); $('close').focus({ preventScroll: true });
    });
    return trigger;
  }
  $('close').addEventListener('click', () => close(true));
  $('previous').addEventListener('click', () => { if (active?.pdf && active.page > 1) { active.page--; draw(active); } });
  $('next').addEventListener('click', () => { if (active?.pdf && active.page < active.pdf.numPages) { active.page++; draw(active); } });
  $('zoom').addEventListener('change', () => { if (active?.pdf) { active.zoom = Number($('zoom').value); draw(active); } });
  $('retry').addEventListener('click', () => {
    if (!active) return;
    const { record, trigger } = active;
    open(record, trigger); $('close').focus({ preventScroll: true });
  });
  document.addEventListener('pointerdown', event => {
    if (active && !panel.contains(event.target) && !active.trigger.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { event.preventDefault(); close(true); }
  });
  window.addEventListener('resize', () => {
    if (!active) return;
    position(); clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (active?.pdf) draw(active); }, 100);
  });
  window.TTCPreview = { createButton, close };
})();
