(() => {
    'use strict';

    document.querySelectorAll('[data-python-utility]').forEach((utility) => {
        const download = utility.querySelector('[data-download]');
        const details = utility.querySelector('.utility-source');
        const code = utility.querySelector('[data-source-code]');
        const pre = utility.querySelector('[data-source-pre]');
        const status = utility.querySelector('[data-source-status]');
        const copy = utility.querySelector('[data-copy]');
        const retry = utility.querySelector('[data-retry]');
        let source = null;
        let loading = false;

        async function loadSource() {
            if (source !== null || loading) return;
            loading = true;
            retry.hidden = true;
            status.textContent = 'Loading the downloadable Python file...';
            try {
                const response = await fetch(download.getAttribute('href'));
                if (!response.ok) throw new Error('Source unavailable');
                source = await response.text();
                code.textContent = source;
                pre.hidden = false;
                copy.disabled = false;
                status.textContent = 'This is the same code as the download. Edit the marked settings before running.';
            } catch {
                status.textContent = 'Code could not be loaded. You can still download the Python file above and open it in a text editor.';
                retry.hidden = false;
            } finally {
                loading = false;
            }
        }

        details.addEventListener('toggle', () => {
            if (details.open) loadSource();
        });
        retry.addEventListener('click', loadSource);
        copy.addEventListener('click', async () => {
            if (source === null) return;
            try {
                await navigator.clipboard.writeText(source);
                status.textContent = 'Code copied. Paste it into a text editor, edit the marked settings, and save it as a .py file.';
            } catch {
                // Clipboard access can be unavailable or denied; leave the source usable.
                pre.focus();
                const selection = window.getSelection();
                if (selection) {
                    const range = document.createRange();
                    range.selectNodeContents(code);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    status.textContent = 'Automatic copying is unavailable. The code is selected; press Ctrl+C (or Command+C) to copy it.';
                } else {
                    status.textContent = 'Automatic copying is unavailable. Select and copy the code below, or download the Python file above.';
                }
            }
        });
    });
})();
