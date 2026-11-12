import { maps, isMapFile, viewerHref, neighboringFile, pageFromHash, wheelZoomScale } from './viewer-core.mjs';

const $ = id => document.getElementById(id);
const stage = $('map-stage');
const file = new URLSearchParams(location.search).get('file') || '2024 Countywide Cert.pdf';
const vendor = new URL('../calculators/mdot-ttc/vendor/pdfjs/', import.meta.url);
let pdf, pdfUrl, pageNumber = 1, renderTask, drawVersion = 0, resizeTimer;
let renderedScale = 0, displayScale = 0, displayedPage = 0, customScale = 1, wheelTimer, pan;
let suppressClick = false;
const touches = new Map();
let pinch;

function viewPoint(clientX, clientY) {
    const page = stage.querySelector('.pdf-page');
    if (!page) return null;
    const box = page.getBoundingClientRect();
    return { x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.height, clientX, clientY };
}

function restorePoint(point) {
    if (!point) return;
    const box = stage.querySelector('.pdf-page').getBoundingClientRect();
    stage.scrollLeft += box.left + point.x * box.width - point.clientX;
    stage.scrollTop += box.top + point.y * box.height - point.clientY;
}

function zoomAt(scale, point) {
    if (!point) return;
    if (scale === displayScale) {
        restorePoint(point);
        return;
    }
    const container = stage.querySelector('.pdf-page');
    const canvas = container.querySelector('canvas');
    const links = container.querySelector('.map-links');
    const naturalWidth = parseFloat(container.style.width) / displayScale;
    const naturalHeight = parseFloat(container.style.height) / displayScale;
    // Resize the existing drawing immediately, then render it sharply once
    // zoom gestures settle. Link hit areas follow the same scale throughout.
    container.style.width = canvas.style.width = `${naturalWidth * scale}px`;
    container.style.height = canvas.style.height = `${naturalHeight * scale}px`;
    Object.assign(links.style, {
        width: `${naturalWidth * renderedScale}px`, height: `${naturalHeight * renderedScale}px`,
        right: 'auto', bottom: 'auto', transformOrigin: 'top left',
        transform: `scale(${scale / renderedScale})`,
    });
    displayScale = customScale = scale;
    let option = $('zoom').querySelector('[value="custom"]');
    if (!option) {
        option = document.createElement('option');
        option.value = 'custom';
        $('zoom').appendChild(option);
    }
    option.textContent = `${Math.round(scale * 75)}%`;
    $('zoom').value = 'custom';
    restorePoint(point);
    ++drawVersion;
    renderTask?.cancel();
    controls(true);
    stage.setAttribute('aria-busy', 'true');
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => draw({ preserveView: true }), 100);
}

function zoomWithWheel(event) {
    if (!pdf || !displayScale || displayedPage !== pageNumber || !event.deltaY
        || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    if (pan?.dragging || touches.size) return;
    zoomAt(wheelZoomScale(displayScale, event.deltaY, event.deltaMode, stage.clientHeight),
        viewPoint(event.clientX, event.clientY));
}

function pinchPosition() {
    const [first, second] = touches.values();
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2,
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)) };
}

function startPinch() {
    const position = pinchPosition();
    pinch = { distance: position.distance, scale: displayScale,
        point: viewPoint(position.x, position.y) };
    pan = null;
    stage.classList.add('is-panning');
    for (const id of touches.keys()) stage.setPointerCapture(id);
}

function startPan(pointerId, x, y, dragging = false) {
    pan = { pointerId, x, y, left: stage.scrollLeft, top: stage.scrollTop, dragging };
}

function endPan(event) {
    if (!pan || (event && event.pointerId !== pan.pointerId)) return;
    const previous = pan;
    pan = null;
    stage.classList.remove('is-panning');
    if (stage.hasPointerCapture(previous.pointerId)) stage.releasePointerCapture(previous.pointerId);
    if (previous.dragging) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
    }
}

function endPointer(event) {
    touches.delete(event.pointerId);
    if (!pinch) {
        endPan(event);
        return;
    }
    pinch = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (touches.size >= 2) startPinch();
    else if (touches.size === 1) {
        const [id, point] = touches.entries().next().value;
        // Continuing with one finger pans from its current position, without a
        // jump or an accidental link tap when the pinch finishes.
        startPan(id, point.x, point.y, true);
    } else stage.classList.remove('is-panning');
}

function resetView() {
    endPan();
    for (const id of touches.keys()) {
        if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    }
    touches.clear();
    pinch = null;
    stage.classList.remove('is-panning');
    $('zoom').value = 'page';
    draw();
}

function controls(busy = false) {
    $('previous').disabled = busy || !pdf || pageNumber <= 1;
    $('next').disabled = busy || !pdf || pageNumber >= pdf.numPages;
    $('page-number').disabled = busy || !pdf;
    $('zoom').disabled = busy || !pdf;
    // Keep recovery available while a zoom render is in progress.
    $('reset-view').disabled = !pdf;
    $('page-number').value = pageNumber;
    $('page-number').max = pdf?.numPages || 1;
    $('page-count').textContent = `of ${pdf?.numPages || 1}`;
}

function failed(message, retry = true) {
    clearTimeout(wheelTimer);
    displayScale = renderedScale = displayedPage = 0;
    endPan();
    touches.clear();
    pinch = null;
    stage.replaceChildren();
    stage.setAttribute('aria-busy', 'false');
    $('status').textContent = message;
    $('status').dataset.error = 'true';
    $('retry').hidden = !retry;
    controls();
}

async function internalPage(destination) {
    const explicit = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
    if (!Array.isArray(explicit)) return null;
    const index = Number.isInteger(explicit[0]) ? explicit[0] : await pdf.getPageIndex(explicit[0]);
    return index >= 0 && index < pdf.numPages ? index + 1 : null;
}

async function linkLayer(page, viewport) {
    const layer = document.createElement('nav');
    layer.className = 'map-links';
    layer.setAttribute('aria-label', 'Links on this map');
    for (const annotation of await page.getAnnotations({ intent: 'display' })) {
        if (annotation.subtype !== 'Link') continue;
        let href, label = annotation.contentsObj?.str;
        if (annotation.dest) {
            const destination = await internalPage(annotation.dest);
            if (!destination) continue;
            href = `#page=${destination}`;
            label ||= `Open page ${destination}`;
        } else {
            const neighbor = neighboringFile(annotation.url || annotation.unsafeUrl, pdfUrl);
            if (!neighbor) continue;
            href = viewerHref(neighbor);
            label ||= `Open ${maps[neighbor]} certification map`;
        }
        const link = document.createElement('a');
        link.href = href;
        link.setAttribute('aria-label', label);
        link.title = label;
        const [x0, y0] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
        const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
        Object.assign(link.style, {
            left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`,
            width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px`,
        });
        layer.appendChild(link);
    }
    return layer;
}

async function draw({ preserveView = false } = {}) {
    if (!pdf) return;
    clearTimeout(wheelTimer);
    const version = ++drawVersion;
    renderTask?.cancel();
    controls(true);
    stage.setAttribute('aria-busy', 'true');
    $('status').textContent = 'Loading map...';
    $('status').dataset.error = 'false';
    $('retry').hidden = true;
    try {
        const page = await pdf.getPage(pageNumber);
        if (version !== drawVersion) return;
        const natural = page.getViewport({ scale: 1 });
        const padding = innerWidth <= 650 ? 16 : 32;
        const widthScale = (stage.clientWidth - padding - 16) / natural.width;
        const pageScale = Math.min(widthScale, (stage.clientHeight - padding) / natural.height);
        const zoom = $('zoom').value;
        const scale = zoom === 'page' ? pageScale : zoom === 'width' ? widthScale
            : zoom === 'custom' ? customScale : Number(zoom) / 75;
        const viewport = page.getViewport({ scale: Math.max(0.05, scale) });
        const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(12000000 / (viewport.width * viewport.height)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width * density);
        canvas.height = Math.ceil(viewport.height * density);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${maps[file]}, page ${pageNumber} of ${pdf.numPages}`);
        const container = document.createElement('div');
        container.className = 'pdf-page';
        container.style.width = `${viewport.width}px`;
        container.style.height = `${viewport.height}px`;
        container.appendChild(canvas);
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport,
            transform: [density, 0, 0, density, 0, 0], background: '#fff' });
        const [, links] = await Promise.all([renderTask.promise, linkLayer(page, viewport)]);
        if (version !== drawVersion) return;
        container.appendChild(links);
        // Capture the current position at commit time so dragging during a
        // render is preserved too, rather than restoring an old scroll offset.
        const bounds = stage.getBoundingClientRect();
        const point = preserveView ? viewPoint(bounds.left + stage.clientWidth / 2,
            bounds.top + stage.clientHeight / 2) : null;
        stage.replaceChildren(container);
        renderedScale = displayScale = viewport.scale;
        displayedPage = pageNumber;
        if (point) restorePoint(point);
        else {
            stage.scrollTop = 0;
            stage.scrollLeft = 0;
        }
        stage.setAttribute('aria-busy', 'false');
        $('status').textContent = '';
        controls();
    } catch (error) {
        if (version !== drawVersion || error.name === 'RenderingCancelledException') return;
        console.error(error);
        failed('The map could not be displayed. Try again or use Download PDF.');
    }
}

function goToPage(number) {
    if (!pdf || !Number.isInteger(number) || number < 1 || number > pdf.numPages) {
        $('page-number').value = pageNumber;
        return;
    }
    if (number === pageNumber) return;
    location.hash = `page=${number}`;
}

async function load() {
    if (!isMapFile(file)) {
        failed('This certification map is not available. Choose a map from the map finder.', false);
        return;
    }
    $('map-title').textContent = maps[file];
    document.title = `${maps[file]} | RCOC Certification Map`;
    pdfUrl = new URL(encodeURIComponent(file), import.meta.url).href;
    $('download').href = pdfUrl;
    $('download').download = file;
    $('download').hidden = false;
    try {
        const pdfjs = await import(new URL('pdf.min.mjs', vendor).href);
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', vendor).href;
        pdf = await pdfjs.getDocument({ url: pdfUrl,
            cMapUrl: new URL('cmaps/', vendor).href, cMapPacked: true,
            standardFontDataUrl: new URL('standard_fonts/', vendor).href,
            wasmUrl: new URL('wasm/', vendor).href,
            isEvalSupported: false,
        }).promise;
        pageNumber = pageFromHash(location.hash, pdf.numPages);
        await draw();
    } catch (error) {
        console.error(error);
        failed('The map could not be loaded. Try again or use Download PDF.');
    }
}

$('previous').addEventListener('click', () => goToPage(pageNumber - 1));
$('next').addEventListener('click', () => goToPage(pageNumber + 1));
$('page-controls').addEventListener('submit', event => {
    event.preventDefault();
    goToPage(Number($('page-number').value));
});
$('page-number').addEventListener('change', () => goToPage(Number($('page-number').value)));
$('zoom').addEventListener('change', () => draw({ preserveView: !['page', 'width'].includes($('zoom').value) }));
$('reset-view').addEventListener('click', resetView);
$('retry').addEventListener('click', () => location.reload());
stage.addEventListener('wheel', zoomWithWheel, { passive: false });
stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !displayScale || displayedPage !== pageNumber) return;
    const bounds = stage.getBoundingClientRect();
    if (event.clientX >= bounds.left + stage.clientWidth || event.clientY >= bounds.top + stage.clientHeight) return;
    if (!touches.size) suppressClick = false;
    if (event.pointerType === 'touch') {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size >= 2) {
            startPinch();
            return;
        }
    }
    startPan(event.pointerId, event.clientX, event.clientY);
});
stage.addEventListener('pointermove', event => {
    if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch && touches.size >= 2) {
            event.preventDefault();
            const position = pinchPosition();
            const scale = Math.max(10 / 75, Math.min(400 / 75,
                pinch.scale * position.distance / pinch.distance));
            zoomAt(scale, { ...pinch.point, clientX: position.x, clientY: position.y });
            return;
        }
    }
    if (!pan || event.pointerId !== pan.pointerId) return;
    const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
    if (!pan.dragging && Math.hypot(dx, dy) < 5) return;
    if (!pan.dragging) {
        pan.dragging = true;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add('is-panning');
    }
    event.preventDefault();
    stage.scrollLeft = pan.left - dx;
    stage.scrollTop = pan.top - dy;
});
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('lostpointercapture', event => {
    // Touch starts with implicit capture on the canvas/link. Its capture-loss
    // event bubbles when we transfer capture to the stage; that is not a cancel.
    if (event.target !== stage || stage.hasPointerCapture(event.pointerId)) return;
    if (touches.has(event.pointerId)) endPointer(event);
    else endPan(event);
});
stage.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'touch' && pan && !pan.dragging) endPan(event);
});
stage.addEventListener('dragstart', event => event.preventDefault());
stage.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
}, true);
window.addEventListener('hashchange', () => {
    if (!pdf) return;
    pageNumber = pageFromHash(location.hash, pdf.numPages);
    draw();
});
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => draw({ preserveView: true }), 150);
});
load();
