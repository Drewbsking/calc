import { maps, isMapFile, viewerHref, neighboringFile, pageFromHash } from './viewer-core.mjs';

const $ = id => document.getElementById(id);
const stage = $('map-stage');
const file = new URLSearchParams(location.search).get('file') || '2024 Countywide Cert.pdf';
const vendor = new URL('../calculators/mdot-ttc/vendor/pdfjs/', import.meta.url);
let pdf, pdfUrl, pageNumber = 1, renderTask, drawVersion = 0, resizeTimer;

function controls(busy = false) {
    $('previous').disabled = busy || !pdf || pageNumber <= 1;
    $('next').disabled = busy || !pdf || pageNumber >= pdf.numPages;
    $('page-number').disabled = busy || !pdf;
    $('zoom').disabled = busy || !pdf;
    $('page-number').value = pageNumber;
    $('page-number').max = pdf?.numPages || 1;
    $('page-count').textContent = `of ${pdf?.numPages || 1}`;
}

function failed(message, retry = true) {
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

async function draw() {
    if (!pdf) return;
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
        const scale = zoom === 'page' ? pageScale : zoom === 'width' ? widthScale : Number(zoom) / 75;
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
        stage.replaceChildren(container);
        stage.scrollTop = 0;
        stage.scrollLeft = 0;
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
$('zoom').addEventListener('change', draw);
$('retry').addEventListener('click', () => location.reload());
window.addEventListener('hashchange', () => {
    if (!pdf) return;
    pageNumber = pageFromHash(location.hash, pdf.numPages);
    draw();
});
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 150);
});
load();
