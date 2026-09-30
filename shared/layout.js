// Resolve shared files from this script, including when hosted under /calc/.
const toolboxRoot = new URL('../', document.currentScript.src);

function loadFragment(targetId, file) {
  const host = document.getElementById(targetId);
  if (!host) return;
  const fragmentURL = new URL('shared/' + file, toolboxRoot);
  fetch(fragmentURL)
    .then((response) => response.text())
    .then((html) => {
      host.innerHTML = html;
      host.querySelectorAll('[href], [src]').forEach((element) => {
        for (const attribute of ['href', 'src']) {
          const value = element.getAttribute(attribute);
          if (value && !value.startsWith('#')) {
            element.setAttribute(attribute, new URL(value, fragmentURL).href);
          }
        }
      });
    })
    .catch(() => {
      host.innerHTML = '';
    });
}

function normalizePagePath(path) {
  return path.replace(/\/index\.html$/, '/').replace(/\/$/, '');
}

function injectCategoryLabel() {
  const pagePath = normalizePagePath(window.location.pathname);
  if (pagePath === normalizePagePath(toolboxRoot.pathname)) return;

  const calculatorSection = document.querySelector('section.calculator');
  if (!calculatorSection) return;
  if (calculatorSection.querySelector('.tool-category-label')) return;

  const indexURL = new URL('index.html', toolboxRoot);
  fetch(indexURL)
    .then((response) => response.text())
    .then((html) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const link = [...doc.querySelectorAll('.calculator-card a[href]')].find((anchor) => {
        const target = new URL(anchor.getAttribute('href'), indexURL);
        return target.origin === window.location.origin && normalizePagePath(target.pathname) === pagePath;
      });
      if (!link) return;

      const card = link.closest('.calculator-card');
      const badge = card?.querySelector('.badge');
      const rawCategory = badge?.textContent?.trim() || '';
      const cleanCategory = rawCategory.replace(/[^\w/\s&-]+/g, '').replace(/\s+/g, ' ').trim();
      if (!cleanCategory) return;

      const label = document.createElement('p');
      label.className = 'tool-category-label';
      label.textContent = `Category: ${cleanCategory}`;
      calculatorSection.insertBefore(label, calculatorSection.firstChild);
    })
    .catch(() => {
      // Fail silently if index can't be read.
    });
}

document.addEventListener('DOMContentLoaded', () => {
  loadFragment('header-placeholder', 'header.html');
  loadFragment('footer-placeholder', 'footer.html');
  injectCategoryLabel();
});
