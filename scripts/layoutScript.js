
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

document.addEventListener('DOMContentLoaded', () => {
  loadFragment('header-placeholder', 'header.html');
  loadFragment('footer-placeholder', 'footer.html');
});
