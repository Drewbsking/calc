export const maps = Object.freeze({
    'Addison-24-CW.pdf': 'Addison Township',
    'Bloomfield-24-CW.pdf': 'Bloomfield Township',
    'Brandon-24-CW.pdf': 'Brandon Township',
    'Commerce-24-CW.pdf': 'Commerce Township',
    'Farmington-24-CW.pdf': 'Farmington Hills',
    'Groveland-24-CW.pdf': 'Groveland Township',
    'Highland-24-CW.pdf': 'Highland Township',
    'Holly-24-CW.pdf': 'Holly Township',
    'Independence-24-CW.pdf': 'Independence Township',
    'Lyon-24-CW.pdf': 'Lyon Township',
    'Milford-24-CW.pdf': 'Milford Township',
    'Novi-24-CW.pdf': 'Novi',
    'Oakland-24-CW.pdf': 'Oakland Township',
    'Orion-24-CW.pdf': 'Orion Township',
    'Oxford-24-CW.pdf': 'Oxford Township',
    'Pontiac-24-CW.pdf': 'Pontiac / Auburn Hills',
    'Rochester-24-CW.pdf': 'Rochester Hills',
    'Rose-24-CW.pdf': 'Rose Township',
    'RoyalOak-24-CW.pdf': 'Royal Oak Township',
    'Southfield-24-CW.pdf': 'Southfield',
    'Springfield-24-CW.pdf': 'Springfield Township',
    'Troy-24-CW.pdf': 'Troy',
    'Waterford-24-CW.pdf': 'Waterford Township',
    'WBloomfield-24-CW.pdf': 'West Bloomfield Township',
    'Whitelake-24-CW.pdf': 'White Lake Township',
    '2024 Countywide Cert.pdf': 'Full County Book',
    '2024_districtmap.pdf': 'District Map',
    '2024_Cert_cover-CW-Signed.pdf': 'Certification Cover',
});

export function isMapFile(file) {
    return Object.hasOwn(maps, file);
}

export function viewerHref(file) {
    if (!isMapFile(file)) throw new Error('Unknown certification map');
    return `viewer.html?file=${encodeURIComponent(file)}`;
}

export function pageFromHash(hash, count) {
    const page = Number(new URLSearchParams(hash.replace(/^#/, '')).get('page'));
    return Number.isInteger(page) && page >= 1 ? Math.min(page, count) : 1;
}

export function wheelZoomScale(scale, deltaY, deltaMode = 0, pageHeight = 800) {
    const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1);
    const step = Math.max(-160, Math.min(160, pixels));
    return Math.max(10 / 75, Math.min(400 / 75, scale * Math.exp(-step * 0.0015)));
}

// Support both the new browser-viewer links and older direct PDF links. Keep
// navigation on the current site during local previews or subfolder hosting.
export function neighboringFile(value, pdfUrl) {
    try {
        const base = new URL(pdfUrl);
        const target = new URL(value, base);
        if (![base.origin, 'https://calc.rcocwiki.org'].includes(target.origin)) return null;
        const directory = target.pathname.slice(0, target.pathname.lastIndexOf('/') + 1);
        if (directory !== base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1)
            && !(target.origin === 'https://calc.rcocwiki.org' && directory === '/certMap/')) return null;
        const name = decodeURIComponent(target.pathname.split('/').pop());
        const file = name === 'viewer.html' ? target.searchParams.get('file') : name;
        return isMapFile(file) ? file : null;
    } catch (_) {
        return null;
    }
}
