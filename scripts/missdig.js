(function () {
  const TICKET_PARAM_KEYS = ['ticket', 't'];
  const SEARCH_URL = 'https://apps.missdig811.org/posr/searchtool';
  const EMPTY_TICKET_TEXT = 'No ticket loaded';
  const initialTicket = readTicketFromUrl();
  const compactQrMode = initialTicket.length > 0;

  const ticketInputGroup = document.getElementById('ticketInputGroup');
  const ticketInput = document.getElementById('ticketInput');
  const ticketDisplay = document.getElementById('ticketDisplay');
  const copyTicketButton = document.getElementById('copyTicketButton');
  const statusMessage = document.getElementById('statusMessage');
  const searchLink = document.getElementById('searchLink');

  if (
    !ticketInputGroup ||
    !ticketInput ||
    !ticketDisplay ||
    !copyTicketButton ||
    !statusMessage ||
    !searchLink
  ) {
    return;
  }

  function normalizeTicket(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function getBaseHelperUrl() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    if (url.pathname.endsWith('/index.html')) {
      url.pathname = url.pathname.replace(/index\.html$/, '');
    }
    return url;
  }

  function buildHelperUrl(ticket) {
    const url = getBaseHelperUrl();
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

  function setStatus(message, tone) {
    statusMessage.textContent = message;
    statusMessage.dataset.tone = tone || 'info';
  }

  function selectInputText(input) {
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
  }

  async function copyText(text) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('Clipboard API unavailable');
    }

    await navigator.clipboard.writeText(text);
  }

  function updatePage(ticket, options) {
    const replaceHistory = !options || options.replaceHistory !== false;
    const currentTicket = normalizeTicket(ticket);
    const helperUrl = buildHelperUrl(currentTicket);
    const hasTicket = currentTicket.length > 0;

    ticketInput.value = currentTicket;
    ticketDisplay.textContent = hasTicket ? currentTicket : EMPTY_TICKET_TEXT;
    ticketDisplay.classList.toggle('is-empty', !hasTicket);
    copyTicketButton.disabled = !hasTicket;
    ticketInputGroup.hidden = compactQrMode;
    searchLink.href = SEARCH_URL;

    if (replaceHistory) {
      window.history.replaceState({}, '', helperUrl);
    }
  }

  copyTicketButton.addEventListener('click', async function () {
    const ticket = normalizeTicket(ticketInput.value);
    if (!ticket) {
      setStatus('Enter a ticket number first.', 'warning');
      return;
    }

    try {
      await copyText(ticket);
      setStatus('Ticket copied. Open MISS DIG Search and paste it into the ticket field.', 'success');
    } catch (error) {
      selectInputText(ticketInput);
      setStatus('Clipboard access was blocked. The ticket field is selected so you can copy it manually.', 'warning');
    }
  });

  ticketInput.addEventListener('input', function () {
    const ticket = normalizeTicket(ticketInput.value);
    updatePage(ticket);

    if (ticket) {
      setStatus('Ticket loaded. Copy it, then open MISS DIG Search.', 'info');
    } else {
      setStatus('Open this page with a ticket in the URL, or enter one below if needed.', 'info');
    }
  });

  updatePage(initialTicket, { replaceHistory: false });

  if (initialTicket) {
    setStatus('Ticket loaded from the link. Tap Copy Ticket Number, then open MISS DIG Search.', 'success');
  } else {
    setStatus('Open this page with a ticket in the URL, or enter one below if needed.', 'info');
  }
}());
