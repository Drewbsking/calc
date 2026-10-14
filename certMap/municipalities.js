(function () {
    const list = document.getElementById('municipality-links');
    const status = document.getElementById('municipality-status');
    const search = document.getElementById('municipality-search');
    const type = document.getElementById('municipality-type');
    const mdotIndex = 'https://mdotjboss.state.mi.us/SpecProv/act51.htm';

    async function loadMunicipalities() {
        try {
            const response = await fetch('certMap/municipalities.json');
            if (!response.ok) throw new Error('Could not load municipality links');
            const data = await response.json();
            const rows = data.municipalities.map((municipality) => {
                const row = document.createElement('li');
                const link = document.createElement('a');
                link.target = '_blank';
                link.rel = 'noopener';
                link.textContent = municipality.name;
                const detail = document.createElement('small');
                if (municipality.fileName && municipality.projectNo) {
                    const url = new URL('https://mdotjboss.state.mi.us/SpecProv/getSpecProvDocument.htm');
                    url.searchParams.set('projNum', municipality.projectNo);
                    url.searchParams.set('fileName', municipality.fileName);
                    link.href = url.href;
                    detail.textContent = `${municipality.type} · ${municipality.year} certification PDF`;
                } else {
                    link.href = mdotIndex;
                    detail.textContent = `${municipality.type} · No MDOT map listed when checked. Open MDOT directory.`;
                }
                link.appendChild(detail);
                row.appendChild(link);
                list.appendChild(row);
                return { row, municipality };
            });

            function filterMunicipalities() {
                const query = search.value.trim().toLowerCase();
                let visible = 0;
                rows.forEach(({ row, municipality }) => {
                    row.hidden = !municipality.name.toLowerCase().includes(query)
                        || (type.value !== '' && municipality.type !== type.value);
                    if (!row.hidden) visible++;
                });
                status.textContent = visible
                    ? `Showing ${visible} of ${rows.length} cities and villages.`
                    : 'No matching cities or villages. Try another name or community type.';
            }

            document.getElementById('municipality-checked').textContent = `Links checked ${data.checkedDate}.`;
            document.getElementById('municipality-filters').hidden = false;
            search.addEventListener('input', filterMunicipalities);
            type.addEventListener('change', filterMunicipalities);
            filterMunicipalities();
        } catch (error) {
            status.textContent = 'City and village links could not load. Use the MDOT Act 51 maps link below.';
            console.error(error);
        }
    }

    loadMunicipalities();
})();
