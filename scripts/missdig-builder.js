(function () {
  const TICKET_PARAM_KEYS = ['ticket', 't'];

  const ticketInput = document.getElementById('builderTicketInput');
  const linkOutput = document.getElementById('builderLinkOutput');
  const copyButton = document.getElementById('copyBuilderLinkButton');
  const previewButton = document.getElementById('previewLandingButton');
  const clearButton = document.getElementById('clearBuilderButton');
  const statusMessage = document.getElementById('builderStatus');

  if (!ticketInput || !linkOutput || !copyButton || !previewButton || !clearButton || !statusMessage) {
    return;
  }

  function normalizeTicket(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function setStatus(message, tone) {
    statusMessage.textContent = message;
    statusMessage.dataset.tone = tone || 'info';
  }

  function selectInputText(input) {
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
  }

  function getLandingBaseUrl() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/build\.html$/, '/');
    return url;
  }

  function buildLandingUrl(ticket) {
    const url = getLandingBaseUrl();
    if (ticket) {
      url.searchParams.set('ticket', ticket);
    }
    return url.toString();
  }

  function readTicketFromUrl() {
    const params = new URLSearchParams(window.location.search);
    for (const key of TICKET_PARAM_KEYS) {
      const value = normalizeTicket(params.get(key));
      if (value) return value;
    }
    return '';
  }

  async function copyText(text) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('Clipboard API unavailable');
    }

    await navigator.clipboard.writeText(text);
  }

  function updateBuilder(ticket, options) {
    const replaceHistory = !options || options.replaceHistory !== false;
    const cleanTicket = normalizeTicket(ticket);
    const landingUrl = buildLandingUrl(cleanTicket);

    ticketInput.value = cleanTicket;
    linkOutput.value = landingUrl;
    previewButton.href = landingUrl;

    if (replaceHistory) {
      window.history.replaceState({}, '', cleanTicket ? '?ticket=' + encodeURIComponent(cleanTicket) : window.location.pathname);
    }
  }

  copyButton.addEventListener('click', async function () {
    const link = linkOutput.value;
    const ticket = normalizeTicket(ticketInput.value);

    if (!ticket) {
      setStatus('Enter a ticket number first.', 'warning');
      ticketInput.focus();
      return;
    }

    try {
      await copyText(link);
      setStatus('Clean link copied. Use it as the QR destination.', 'success');
    } catch (error) {
      selectInputText(linkOutput);
      setStatus('Clipboard access was blocked. The clean link is selected so you can copy it manually.', 'warning');
    }
  });

  clearButton.addEventListener('click', function () {
    updateBuilder('', { replaceHistory: true });
    setStatus('Builder cleared.', 'info');
    ticketInput.focus();
  });

  ticketInput.addEventListener('input', function () {
    const ticket = normalizeTicket(ticketInput.value);
    updateBuilder(ticket, { replaceHistory: true });

    if (ticket) {
      setStatus('Clean QR link ready.', 'info');
    } else {
      setStatus('Enter a ticket number to generate the clean QR destination.', 'info');
    }
  });

  const initialTicket = readTicketFromUrl();
  updateBuilder(initialTicket, { replaceHistory: false });

  if (initialTicket) {
    setStatus('Clean QR link ready.', 'success');
  } else {
    setStatus('Enter a ticket number to generate the clean QR destination.', 'info');
  }
}());
