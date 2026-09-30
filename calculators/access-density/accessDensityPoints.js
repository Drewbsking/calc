(function () {
  'use strict';
  const G = window.AccessDensityGeometry;
  const types = {
    residential: { label: 'Residential', letter: 'R' },
    commercial: { label: 'Commercial', letter: 'C' },
    named: { label: 'Named Road / Access', letter: 'N' }
  };

  window.AccessDensityPoints = function ({ map, getGeometry, onDragEnd }) {
    // Geographic positions stay where the user places them. Only station is
    // derived from the alignment; offset is never stored as access-point data.
    const points = [];
    const markers = new Map();
    const rows = document.getElementById('accessRows');
    const empty = document.getElementById('accessEmpty');
    let nextId = 1, selectedId = null, active = false, editor = null;
    let lastType = 'residential', lastDragTime = -Infinity;
    const stationText = point => G.formatStation(point.stationFeet, 2);

    function stationPoint(point) {
      const { alignment, frame } = getGeometry();
      point.stationFeet = alignment?.segments.length && frame
        ? G.nearestStation(alignment, frame.toXY(point.coordinate)).stationFeet : null;
    }

    function renderTable() {
      rows.replaceChildren();
      empty.hidden = points.length > 0;
      const sorted = [...points].sort((a, b) =>
        (a.stationFeet ?? Infinity) - (b.stationFeet ?? Infinity) || a.id - b.id);
      sorted.forEach(point => {
        const row = document.createElement('tr');
        row.tabIndex = 0;
        row.dataset.accessId = point.id;
        row.classList.toggle('is-selected', point.id === selectedId);
        row.setAttribute('aria-label', stationText(point) + ', ' + types[point.type].label + (point.name ? ', ' + point.name : ''));
        [stationText(point), types[point.type].label, point.name].forEach(value => {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        });
        row.addEventListener('click', () => openEditor(point, true));
        row.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            openEditor(point, true);
          }
        });
        rows.append(row);
      });
    }

    function syncMarkers() {
      points.forEach(point => {
        let entry = markers.get(point.id);
        if (!entry) {
          const marker = L.marker(point.coordinate, {
            draggable: true, autoPan: true, bubblingMouseEvents: false
          });
          entry = { marker, iconKey: '' };
          markers.set(point.id, entry);
          marker.on('click', event => {
            L.DomEvent.stopPropagation(event);
            if (performance.now() - lastDragTime >= 250) openEditor(point);
          });
          marker.on('dragstart', () => {
            closeEditor();
            selectedId = point.id;
            syncMarkers();
            renderTable();
          });
          marker.on('drag', () => {
            const latlng = marker.getLatLng();
            point.coordinate = { lat: latlng.lat, lng: latlng.lng };
            stationPoint(point);
            syncMarkers();
            renderTable();
          });
          marker.on('dragend', () => {
            lastDragTime = performance.now();
            onDragEnd();
          });
        }
        const selected = point.id === selectedId;
        const iconKey = point.type;
        if (entry.iconKey !== iconKey) {
          entry.marker.setIcon(L.divIcon({
            className: 'access-marker access-' + point.type,
            html: '<span><b>' + types[point.type].letter + '</b></span>',
            iconSize: [26, 26], iconAnchor: [13, 13]
          }));
          entry.iconKey = iconKey;
        }
        entry.marker.setLatLng(point.coordinate).setZIndexOffset(selected ? 1000 : 500);
        const title = types[point.type].label + (point.name ? ': ' + point.name : '') + ' — Station ' + stationText(point);
        entry.marker.options.title = title;
        if (!map.hasLayer(entry.marker)) entry.marker.addTo(map);
        const element = entry.marker.getElement();
        if (element) {
          // Changing the icon during dragstart resets Leaflet's drag handler.
          // Highlight the existing element so the active drag stays attached.
          element.classList.toggle('is-selected', selected);
          element.title = title;
          element.setAttribute('aria-label', title);
        }
      });
    }

    function closeEditor() {
      if (!editor) return;
      const current = editor;
      editor = null;
      current.point.name = current.point.name.trim();
      lastType = current.point.type;
      map.closePopup(current.popup);
      renderTable();
    }

    function chooseType(type, focusName = false) {
      lastType = type;
      if (!editor) return;
      editor.point.type = type;
      editor.select.value = type;
      editor.nameLabel.hidden = type !== 'named';
      if (type !== 'named') { editor.point.name = ''; editor.nameInput.value = ''; }
      syncMarkers();
      renderTable();
      if (type === 'named' && focusName) editor.nameInput.focus();
      editor.popup.update();
    }

    function shortcuts(event) {
      if (!active || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return;
      const target = event.target;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target?.tagName)) return;
      const type = { r: 'residential', c: 'commercial', n: 'named' }[event.key.toLowerCase()];
      if (type) { event.preventDefault(); chooseType(type, true); }
      else if (event.key === 'Enter' && editor && !['SELECT', 'BUTTON'].includes(target?.tagName)) {
        event.preventDefault();
        closeEditor();
        map.getContainer().focus();
      }
    }

    function openEditor(point, pan = false) {
      closeEditor();
      selectedId = point.id;
      syncMarkers();
      renderTable();
      if (pan) map.panTo(point.coordinate);
      const form = document.createElement('form');
      form.className = 'access-editor';
      form.setAttribute('aria-label', 'Edit access point');
      const station = document.createElement('p');
      station.className = 'access-editor-station';
      station.textContent = 'Station ' + stationText(point);
      const typeLabel = document.createElement('label');
      typeLabel.textContent = 'Type';
      const select = document.createElement('select');
      select.id = 'accessType';
      Object.entries(types).forEach(([value, type]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = type.label;
        select.append(option);
      });
      select.value = point.type;
      typeLabel.append(select);
      const nameLabel = document.createElement('label');
      nameLabel.textContent = 'Name';
      nameLabel.hidden = point.type !== 'named';
      const nameInput = document.createElement('input');
      nameInput.id = 'accessName';
      nameInput.type = 'text';
      nameInput.maxLength = 120;
      nameInput.value = point.name;
      nameLabel.append(nameInput);
      const actions = document.createElement('div');
      actions.className = 'access-editor-actions';
      const save = document.createElement('button');
      save.id = 'accessSave'; save.type = 'submit'; save.textContent = 'Save';
      const remove = document.createElement('button');
      remove.id = 'accessDelete'; remove.type = 'button'; remove.textContent = 'Delete';
      actions.append(save, remove);
      const hint = document.createElement('p');
      hint.className = 'access-editor-hint';
      hint.textContent = 'R / C / N · Enter to save';
      form.append(station, typeLabel, nameLabel, actions, hint);
      L.DomEvent.disableClickPropagation(form);
      L.DomEvent.disableScrollPropagation(form);
      form.addEventListener('keydown', event => {
        shortcuts(event);
        // Enter in the name field submits the form. Keep other typing out of Leaflet.
        event.stopPropagation();
      });
      const popup = L.popup({ className: 'access-popup', minWidth: 210, maxWidth: 240, closeOnClick: false, offset: [0, -12] })
        .setLatLng(point.coordinate).setContent(form);
      editor = { point, popup, station, select, nameLabel, nameInput };
      select.addEventListener('change', () => chooseType(select.value, true));
      nameInput.addEventListener('input', () => {
        point.name = nameInput.value.slice(0, 120);
        syncMarkers();
        renderTable();
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        closeEditor();
        map.getContainer().focus();
      });
      remove.addEventListener('click', () => {
        closeEditor();
        points.splice(points.indexOf(point), 1);
        map.removeLayer(markers.get(point.id).marker);
        markers.delete(point.id);
        selectedId = null;
        syncMarkers();
        renderTable();
        map.getContainer().focus();
      });
      popup.on('remove', () => {
        if (editor?.popup === popup) {
          point.name = point.name.trim();
          lastType = point.type;
          editor = null;
          renderTable();
        }
      });
      popup.openOn(map);
      if (point.type === 'named') nameInput.focus();
      else save.focus();
    }

    document.addEventListener('keydown', shortcuts);
    return {
      getMapPoints() {
        return points.map(({ type, name, coordinate }) => ({ type, name, coordinate: { ...coordinate } }));
      },
      getPoints() {
        return points.map(({ id, type, name, stationFeet }) => ({ id, type, name, stationFeet }));
      },
      setActive(value) { active = value; if (!active) closeEditor(); },
      addPoint(coordinate) {
        const { alignment, frame } = getGeometry();
        if (!active || !alignment?.segments.length || !frame) return;
        closeEditor();
        const point = {
          id: nextId++, coordinate: { lat: coordinate.lat, lng: coordinate.lng },
          type: lastType, name: '', stationFeet: null
        };
        stationPoint(point);
        points.push(point);
        openEditor(point);
      },
      refreshStations() {
        points.forEach(stationPoint);
        syncMarkers();
        renderTable();
        if (editor) editor.station.textContent = 'Station ' + stationText(editor.point);
      },
      reset() {
        closeEditor();
        markers.forEach(entry => map.removeLayer(entry.marker));
        markers.clear();
        points.length = 0;
        selectedId = null; nextId = 1; lastType = 'residential'; active = false;
        renderTable();
      }
    };
  };
})();
