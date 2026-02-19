
function loadFragment(targetId, file) {
  const host = document.getElementById(targetId);
  if (!host) return;
  fetch(file)
    .then((response) => response.text())
    .then((html) => {
      host.innerHTML = html;
    })
    .catch(() => {
      host.innerHTML = '';
    });
}

function getCurrentPageName() {
  const path = window.location.pathname || '';
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const file = trimmed.split('/').pop();
  return file || 'index.html';
}

function injectCategoryLabel() {
  const pageName = getCurrentPageName();
  if (pageName === 'index.html') return;

  const calculatorSection = document.querySelector('section.calculator');
  if (!calculatorSection) return;
  if (calculatorSection.querySelector('.tool-category-label')) return;

  fetch('index.html')
    .then((response) => response.text())
    .then((html) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const link = doc.querySelector(`.calculator-card a[href="${pageName}"]`);
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
