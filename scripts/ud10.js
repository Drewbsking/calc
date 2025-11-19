function fetchPDF(e) {
  if (e) e.preventDefault();

  const input = document.getElementById('crashId');
  const crashId = input.value.trim();

  // Simple numeric check (prevents the “Provide a numeric ?crash_id” message)
  if (!/^\d+$/.test(crashId)) {
    alert('Please enter a numeric Crash ID (digits only).');
    input.focus();
    return;
  }

  const url = `https://ud10.semcog.org/ud10?crash_id=${encodeURIComponent(crashId)}`;
  window.open(url, '_blank', 'noopener');  // or: window.location.href = url;
}
