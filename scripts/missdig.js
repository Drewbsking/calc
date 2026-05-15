(function () {
  const TICKET_PARAM_KEYS = ['ticket', 't'];
  const SEARCH_URL = 'https://apps.missdig811.org/posr/searchtool';
  const EMPTY_TICKET_TEXT = 'No ticket loaded';

  const ticketInput = document.getElementById('ticketInput');
  const ticketDisplay = document.getElementById('ticketDisplay');
  const helperLinkInput = document.getElementById('helperLink');
  const exampleLink = document.getElementById('exampleLink');
  const copyTicketButton = document.getElementById('copyTicketButton');
  const copyLinkButton = document.getElementById('copyLinkButton');
  const statusMessage = document.getElementById('statusMessage');
  const searchLink = document.getElementById('searchLink');

  if (
    !ticketInput ||
    !ticketDisplay ||
    !helperLinkInput ||
    !exampleLink ||
    !copyTicketButton ||
    !copyLinkButton ||
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
    helperLinkInput.value = helperUrl;
    ticketDisplay.textContent = hasTicket ? currentTicket : EMPTY_TICKET_TEXT;
    ticketDisplay.classList.toggle('is-empty', !hasTicket);
    copyTicketButton.disabled = !hasTicket;
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

  copyLinkButton.addEventListener('click', async function () {
    const link = helperLinkInput.value;

    try {
      await copyText(link);
      setStatus('Helper link copied. Use it as the QR code target.', 'success');
    } catch (error) {
      selectInputText(helperLinkInput);
      setStatus('Clipboard access was blocked. The helper link is selected so you can copy it manually.', 'warning');
    }
  });

  ticketInput.addEventListener('input', function () {
    const ticket = normalizeTicket(ticketInput.value);
    updatePage(ticket);

    if (ticket) {
      setStatus('Ticket updated. The helper link is now ready for a QR code or text message.', 'info');
    } else {
      setStatus('Enter a ticket number or open this page with ?ticket=... in the URL.', 'info');
    }
  });

  const initialTicket = readTicketFromUrl();
  const sampleUrl = buildHelperUrl('2026051500413');

  exampleLink.textContent = sampleUrl;
  updatePage(initialTicket, { replaceHistory: false });

  if (initialTicket) {
    setStatus('Ticket loaded from the link. Tap Copy Ticket Number, then open MISS DIG Search.', 'success');
  } else {
    setStatus('Enter a ticket number or open this page with ?ticket=... in the URL.', 'info');
  }
}());
