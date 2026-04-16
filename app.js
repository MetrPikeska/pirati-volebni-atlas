'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API = 'https://truly-frequently-dice-markets.trycloudflare.com';

const LEVEL_LABEL = { obce: 'Obec', orp: 'ORP', okresy: 'Okres', kraje: 'Kraj', polygon: 'Vlastní polygon' };

const IND = {
  // Volby
  pirati_pct:  { label: '% Pirátů',     unit: '%',  desc: '', scale: [[26,10,46],[109,31,190],[180,100,255]] },
  fitted_ols:  { label: 'OLS predikce', unit: '%',  desc: 'Předpovězený výsledek Pirátů dle globálního OLS regresního modelu', scale: [[20,10,46],[90,40,155],[150,80,230]] },
  resid_ols:   { label: 'OLS reziduum', unit: 'pp', desc: 'Odchylka skutečnosti od OLS predikce — kladné = Piráti silnější, než model čekal', scale: [[190,55,55],[35,35,35],[55,160,100]] },
  resid_gwr:   { label: 'GWR reziduum', unit: 'pp', desc: 'Odchylka od lokálního GWR modelu — hodnoty blízko 0 znamenají dobrý fit modelu', scale: [[190,55,55],[30,30,30],[55,175,115]] },
  local_r2:    { label: 'Lokální R²',   unit: '',   desc: 'Podíl variability volebního výsledku vysvětlený lokálním GWR modelem (0 = špatně, 1 = perfektně)', scale: [[13,30,18],[35,110,65],[70,210,120]] },
  // Vzdělanost
  vzdelani_vysoko:  { label: 'VŠ vzdělání',          unit: '%', desc: '', scale: [[13,18,13],[30,90,55],[111,217,142]] },
  vzdelani_str_s:   { label: 'Střední s maturitou',  unit: '%', desc: '', scale: [[13,20,25],[40,110,150],[80,190,230]] },
  vzdelani_zaklad:  { label: 'Základní vzdělání',    unit: '%', desc: '', scale: [[13,13,13],[160,80,30],[235,125,55]] },
  // Věková struktura
  vek0_14:  { label: 'Věk 0–14',  unit: '%', desc: '', scale: [[13,20,35],[45,115,195],[95,175,255]] },
  vek15_64: { label: 'Věk 15–64', unit: '%', desc: '', scale: [[18,18,35],[60,75,170],[110,125,240]] },
  vek65:    { label: 'Věk 65+',   unit: '%', desc: '', scale: [[13,13,18],[120,50,50],[242,117,117]] },
  // Zaměstnanost
  zamestnanci: { label: 'Zaměstnanci',        unit: '%', desc: '', scale: [[13,20,30],[35,100,170],[70,160,240]] },
  podnikatele: { label: 'Podnikatelé / OSVČ', unit: '%', desc: '', scale: [[13,13,13],[140,110,20],[242,195,0]] },
  nezamest:    { label: 'Nezaměstnanost',     unit: '%', desc: '', scale: [[13,13,13],[150,75,20],[242,155,75]] },
  // Sociální
  verici: { label: 'Věřící',     unit: '%', desc: '', scale: [[13,13,18],[55,55,130],[110,95,215]] },
  romove: { label: 'Romové',     unit: '%', desc: '', scale: [[13,13,13],[110,30,30],[215,55,55]] },
  muzi:   { label: 'Podíl mužů', unit: '%', desc: '', scale: [[20,20,50],[70,70,165],[100,149,237]] },
};

const TILES = {
  dark:   'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  osm:    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};
const AERIAL_WMS = 'https://geoportal.cuzk.cz/WMS_ORTOFOTO_PUB/WMService.aspx';

// ─── STATE ────────────────────────────────────────────────────────────────────
const S = {
  level:      'obce',
  unitId:     null,
  unitName:   null,
  indicator:  'pirati_pct',
  geoCache:   {},   // level → GeoJSON
  unitCache:  {},   // level → [{id,name}]
  ranges:     {},   // indicator → {min,max}
  charts:     {},   // 'age'|'edu' → Chart instance
  abort:      null,
  map:        null,
  tileL:      {},
  curTile:    'dark',
  communeL:   null,
  adminL:     null,
  hlLayer:    null,
  drawnItems: null,
};

// ─── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initDraw();
  bindAll();
  readURL();
  updateIndicatorDesc();
  boot();
});

async function boot() {
  try {
    await loadGeoJSON('obce');
    await loadUnits(S.level);
    // auto-run if URL had ?id=
    if (S.unitId) {
      const u = (S.unitCache[S.level] || []).find(x => String(x.id) === String(S.unitId));
      if (u) { selectUnit(u.id, u.name); fetchStats(S.level, S.unitId, u.name); }
    }
  } catch (e) {
    showErr('Nelze se připojit k API serveru. Zkontrolujte připojení nebo aktualizujte API URL v app.js.', true);
    console.error(e);
  } finally {
    hideOverlay();
  }
}

// ─── MAP ──────────────────────────────────────────────────────────────────────
function initMap() {
  S.map = L.map('map', { center: [49.75, 15.5], zoom: 8, zoomControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(S.map);

  S.tileL.dark = L.tileLayer(TILES.dark, { attribution: '© CARTO', subdomains: 'abcd', maxZoom: 19 });
  S.tileL.osm  = L.tileLayer(TILES.osm,  { attribution: '© OpenStreetMap', maxZoom: 19 });

  S.tileL.dark.addTo(S.map);
  S.map.on('click', () => { if (S.hlLayer) { S.map.removeLayer(S.hlLayer); S.hlLayer = null; } });
}

function switchTile(key) {
  if (S.curTile === key) return;
  S.map.removeLayer(S.tileL[S.curTile]);
  S.tileL[key].addTo(S.map);
  if (S.communeL) S.communeL.bringToFront();
  if (S.adminL)   S.adminL.bringToFront();
  S.curTile = key;
  document.querySelectorAll('#map-switcher .pill').forEach(b => b.classList.toggle('active', b.dataset.layer === key));
}

// ─── DRAW ─────────────────────────────────────────────────────────────────────
function initDraw() {
  S.drawnItems = new L.FeatureGroup();
  S.map.addLayer(S.drawnItems);
  S.map.on(L.Draw.Event.CREATED, e => {
    S.drawnItems.clearLayers();
    S.drawnItems.addLayer(e.layer);
    showMapHint(false);
    document.getElementById('draw-btn').classList.remove('drawing');
    analyzePolygon(e.layer.toGeoJSON().geometry);
  });
  S.map.on(L.Draw.Event.DRAWSTOP, () => {
    showMapHint(false);
    document.getElementById('draw-btn').classList.remove('drawing');
  });
}

function startDraw() {
  S.drawnItems.clearLayers();
  if (S.hlLayer) { S.map.removeLayer(S.hlLayer); S.hlLayer = null; }
  document.getElementById('draw-btn').classList.add('drawing');
  showMapHint(true);
  new L.Draw.Polygon(S.map, {
    shapeOptions: { color: '#F2C700', weight: 2, fillColor: 'rgba(242,199,0,0.08)', fillOpacity: 1 },
    showArea: false,
  }).enable();
}

// ─── GEOJSON LOADING ──────────────────────────────────────────────────────────
async function loadGeoJSON(level) {
  if (S.geoCache[level]) {
    if (level === 'obce') applyCommuneLayer(S.geoCache[level]);
    else applyAdminLayer(S.geoCache[level]);
    return S.geoCache[level];
  }
  const res = await apiFetch(`${API}/api/geojson/${level}`);
  const data = await res.json();
  S.geoCache[level] = data;
  if (level === 'obce') { computeRanges(data); applyCommuneLayer(data); updateLegend(); }
  else applyAdminLayer(data);
  return data;
}

function computeRanges(geojson) {
  Object.keys(IND).forEach(k => {
    let min = Infinity, max = -Infinity;
    geojson.features.forEach(f => {
      const v = f.properties[k];
      if (v != null && !isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
    });
    S.ranges[k] = { min, max };
  });
}

function applyCommuneLayer(data) {
  if (S.communeL) S.map.removeLayer(S.communeL);
  S.communeL = L.geoJSON(data, {
    style:         featureStyle,
    onEachFeature: wireFeature,
  }).addTo(S.map);
}

function featureStyle(f) {
  const v = f.properties[S.indicator];
  const r = S.ranges[S.indicator];
  if (v == null || !r) return noDataStyle();
  return { fillColor: colorFor(v, r.min, r.max, S.indicator), fillOpacity: 0.82, color: 'rgba(255,255,255,0.055)', weight: 0.4 };
}

function noDataStyle() {
  return { fillColor: '#1c1c1c', fillOpacity: 0.65, color: 'rgba(255,255,255,0.04)', weight: 0.3 };
}

function wireFeature(feature, layer) {
  layer.on({ mouseover: onHover, mouseout: onOut, click: onClickFeature });
}

function applyAdminLayer(data) {
  if (S.adminL) S.map.removeLayer(S.adminL);
  S.adminL = L.geoJSON(data, {
    style: { fill: false, color: 'rgba(255,255,255,0.22)', weight: 1.5 },
    onEachFeature: (f, l) => {
      l.on('click', e => {
        L.DomEvent.stopPropagation(e);
        const id   = f.properties.id   ?? f.properties.kod   ?? f.properties.kod_orp ?? f.properties.kod_okres;
        const name = f.properties.name ?? f.properties.nazev ?? f.properties.nazev_orp;
        selectUnit(id, name);
      });
    },
  }).addTo(S.map);
}

// ─── UNITS DROPDOWN ───────────────────────────────────────────────────────────
async function loadUnits(level) {
  if (S.unitCache[level]) { renderDrop(S.unitCache[level]); return; }
  setDropLoad(true);
  try {
    const res = await apiFetch(`${API}/api/units/${level}`);
    const data = await res.json();
    S.unitCache[level] = data;
    renderDrop(data);
  } catch (e) {
    showErr('Nepodařilo se načíst seznam jednotek.');
  } finally {
    setDropLoad(false);
  }
}

function renderDrop(units) {
  const list = document.getElementById('drop-list');
  list.innerHTML = '';
  if (!units?.length) { list.innerHTML = '<div class="drop-empty">Žádné záznamy</div>'; return; }
  units.forEach(u => {
    const el = document.createElement('div');
    el.className = 'drop-item';
    el.dataset.id = u.id;
    el.dataset.name = u.name;
    el.textContent = u.name;
    el.addEventListener('click', () => selectUnit(u.id, u.name));
    list.appendChild(el);
  });
}

function filterDrop(q) {
  const lq = q.toLowerCase();
  let n = 0;
  document.querySelectorAll('.drop-item').forEach(el => {
    const show = !lq || el.dataset.name.toLowerCase().includes(lq);
    el.style.display = show ? '' : 'none';
    if (show) n++;
  });
  let empty = document.querySelector('#drop-list .drop-empty');
  if (n === 0) {
    if (!empty) { empty = document.createElement('div'); empty.className = 'drop-empty'; document.getElementById('drop-list').appendChild(empty); }
    empty.textContent = `Žádná shoda pro „${q}"`;
    empty.style.display = '';
  } else if (empty) {
    empty.style.display = 'none';
  }
}

function openDrop()  { document.getElementById('drop-list').classList.add('open'); }
function closeDrop() { document.getElementById('drop-list').classList.remove('open'); }

function setDropLoad(on) {
  const list = document.getElementById('drop-list');
  if (on) { list.innerHTML = '<div class="loading-row"><div class="mini-spin light"></div>Načítání…</div>'; list.classList.add('open'); }
}

// ─── SELECTION & ANALYSIS ─────────────────────────────────────────────────────
function selectUnit(id, name) {
  S.unitId   = id;
  S.unitName = name;
  document.getElementById('search-input').value = name || '';
  document.getElementById('analyze-btn').disabled = false;
  document.getElementById('search-clear').classList.add('show');
  document.querySelectorAll('.drop-item').forEach(el => el.classList.toggle('active', String(el.dataset.id) === String(id)));
  closeDrop();
  updateURL();
}

function clearSelection() {
  S.unitId = null; S.unitName = null;
  document.getElementById('search-input').value = '';
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('search-clear').classList.remove('show');
  hideResults();
  const ob = document.getElementById('onboard-state');
  if (ob) ob.style.display = '';
  updateURL();
}

async function analyze() {
  if (!S.unitId) return;
  await fetchStats(S.level, S.unitId, S.unitName);

  // Zvýrazni hranici pro ne-obecní úrovně
  if (S.level !== 'obce') {
    const geo = S.geoCache[S.level];
    if (geo) {
      const f = geo.features.find(f => {
        const fid = f.properties.id ?? f.properties.kod ?? f.properties.kod_orp ?? f.properties.kod_okres;
        return String(fid) === String(S.unitId);
      });
      if (f) highlightFeature(f);
    }
  }
}

async function analyzePolygon(geometry) {
  // Reject polygons too small to intersect meaningful number of municipalities
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0];
    let area = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      area += Math.abs(coords[i][0] * coords[i+1][1] - coords[i+1][0] * coords[i][1]);
    }
    area /= 2;
    if (area < 0.0005) { // ~3–4 km² at Czech latitudes
      showErr('Polygon je příliš malý. Nakreslete větší oblast na mapě.');
      S.drawnItems.clearLayers();
      return;
    }
  }
  setBtnLoad(true);
  hideResults();
  hideErr();
  try {
    const res = await apiFetch(`${API}/api/stats/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geometry }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();
    renderStats(stats, 'Vlastní polygon', 'polygon');
  } catch (e) {
    if (e.name !== 'AbortError') showErr('Analýza polygonu selhala. Zkuste to znovu.');
  } finally {
    setBtnLoad(false);
  }
}

async function fetchStats(level, id, name) {
  setBtnLoad(true);
  hideResults();
  hideErr();
  try {
    const res = await apiFetch(`${API}/api/stats/${level}/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();
    renderStats(stats, name, level);
    updateURL();
  } catch (e) {
    if (e.name !== 'AbortError') showErr('Nepodařilo se načíst statistiky. Zkuste to znovu.');
  } finally {
    setBtnLoad(false);
  }
}

// ─── CHOROPLETH ───────────────────────────────────────────────────────────────
function updateChoropleth() {
  if (S.communeL) { S.communeL.setStyle(featureStyle); updateLegend(); }
}

function highlightFeature(geojsonFeature) {
  if (S.hlLayer) S.map.removeLayer(S.hlLayer);
  S.hlLayer = L.geoJSON(geojsonFeature, {
    style: { fillColor: 'rgba(242,199,0,0.07)', fillOpacity: 1, color: '#F2C700', weight: 3 },
  }).addTo(S.map);
  const bounds = S.hlLayer.getBounds();
  if (bounds.isValid()) S.map.fitBounds(bounds, { padding: [55, 55] });
}

// ─── HOVER / CLICK ────────────────────────────────────────────────────────────
let activeTooltip = null;

function onHover(e) {
  const p = e.target.feature.properties;
  const v = p[S.indicator];
  const name = p.nazev_obce ?? p.nazev ?? p.name ?? '—';
  if (activeTooltip) { S.map.removeLayer(activeTooltip); }
  activeTooltip = L.tooltip({ permanent: false, className: 'map-tt', direction: 'top', offset: [0, -5] })
    .setContent(`<span class="tt-name">${name}</span><span class="tt-val">${IND[S.indicator]?.label}: ${v != null ? fmtPct(v) : '—'}</span>`)
    .setLatLng(e.latlng)
    .addTo(S.map);
  e.target.setStyle({ weight: 1.5, color: 'rgba(255,255,255,0.45)' });
}

function onOut(e) {
  if (activeTooltip) { S.map.removeLayer(activeTooltip); activeTooltip = null; }
  if (S.communeL) S.communeL.resetStyle(e.target);
}

async function onClickFeature(e) {
  L.DomEvent.stopPropagation(e);
  const p = e.target.feature.properties;
  const id   = p.id ?? p.kod_obce ?? p.kod;
  const name = p.nazev ?? p.name ?? String(id);
  S.map.setView(e.latlng, Math.max(S.map.getZoom(), 11));
  // Set level back to obce for click
  if (S.level !== 'obce') {
    setLevel('obce');
    await loadUnits('obce');
  }
  S.unitId   = id;
  S.unitName = name;
  document.getElementById('search-input').value = name;
  document.getElementById('analyze-btn').disabled = false;
  await fetchStats('obce', id, name);
}

// ─── RENDER STATS ─────────────────────────────────────────────────────────────
function renderStats(s, name, level) {
  if (level === 'polygon' && (s.pocet_obci == null || s.pocet_obci === 0)) {
    showErr('Polygon neprotíná žádné obce. Nakreslete větší oblast.');
    S.drawnItems.clearLayers();
    return;
  }
  // Header
  set('res-pct',   s.pirati_pct != null ? `${s.pirati_pct.toFixed(1)} %` : '—');
  set('res-name',  name ?? '—');
  set('res-level', LEVEL_LABEL[level] ?? level);
  set('res-count', s.pocet_obci ? `${s.pocet_obci} obcí` : '');

  // Main bar
  const barPct = s.pirati_pct != null ? Math.min(100, (s.pirati_pct / 25) * 100) : 0;
  document.getElementById('pirati-fill').style.width = `${barPct}%`;

  // ── Volby tab ──
  progSet('pirati', s.pirati_pct, 25);
  progSet('ols',    s.fitted_ols,  25);

  const rg = s.resid_gwr;
  const rgEl = document.getElementById('v-resid');
  rgEl.textContent = rg != null ? (rg >= 0 ? '+' : '') + rg.toFixed(3) : '—';
  rgEl.className   = 'stat-v ' + (rg == null ? '' : rg >= 0 ? 'gr' : 're');

  const ro = s.resid_ols;
  const roEl = document.getElementById('v-resid-ols');
  roEl.textContent = ro != null ? (ro >= 0 ? '+' : '') + ro.toFixed(3) : '—';
  roEl.className   = 'stat-v ' + (ro == null ? '' : ro >= 0 ? 'gr' : 're');

  set('v-r2', s.local_r2 != null ? `${(s.local_r2 * 100).toFixed(1)} %` : '—');
  barWidth('b-r2', s.local_r2 != null ? s.local_r2 * 100 : 0, 100);

  // ── Demografie tab ──
  set('v-muzi',   s.muzi   != null ? `${s.muzi.toFixed(1)} %`  : '—');
  set('v-zeny',   s.zeny   != null ? `${s.zeny.toFixed(1)} %`  : '—');
  set('v-verici', s.verici != null ? `${s.verici.toFixed(1)} %` : '—');
  set('v-romove', s.romove != null ? `${s.romove.toFixed(2)} %` : '—');
  drawAge(s);

  // ── Vzdělání & Práce tab ──
  set('v-nezamest',    s.nezamest     != null ? `${s.nezamest.toFixed(2)} %`    : '—');
  set('v-zamestnanci', s.zamestnanci  != null ? `${s.zamestnanci.toFixed(1)} %` : '—');
  set('v-podnikatele', s.podnikatele  != null ? `${s.podnikatele.toFixed(1)} %` : '—');
  set('v-zamestnavatele', s.zamestnavatele != null ? `${s.zamestnavatele.toFixed(1)} %` : '—');
  set('v-neprac',      s.neprac_duch  != null ? `${s.neprac_duch.toFixed(1)} %` : '—');
  set('v-pracduch',    s.prac_duch    != null ? `${s.prac_duch.toFixed(1)} %`   : '—');
  drawEdu(s);

  showResults();
  openPanel();
}

// ─── CHARTS ───────────────────────────────────────────────────────────────────
const CHART_DEF = {
  plugins: { legend: { display: false } },
  animation: { duration: 400 },
};

function drawAge(s) {
  const ctx = document.getElementById('age-chart');
  if (S.charts.age) S.charts.age.destroy();
  S.charts.age = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0–14', '15–64', '65+'],
      datasets: [{
        data: [s.vek0_14 ?? 0, s.vek15_64 ?? 0, s.vek65 ?? 0],
        backgroundColor: ['rgba(111,217,142,0.72)', 'rgba(242,199,0,0.72)', 'rgba(242,117,117,0.72)'],
        borderColor:     ['#6FD98E', '#F2C700', '#F27575'],
        borderWidth: 1, borderRadius: 2,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        ...CHART_DEF.plugins,
        tooltip: { callbacks: { label: c => ` ${c.parsed.x.toFixed(1)} %` } },
      },
      animation: CHART_DEF.animation,
      scales: {
        x: { max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.38)', font: { family: 'Space Grotesk', size: 10 }, callback: v => `${v}%` } },
        y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.55)', font: { family: 'Space Grotesk', size: 10 } } },
      },
    },
  });
}

function drawEdu(s) {
  const ctx = document.getElementById('edu-chart');
  if (S.charts.edu) S.charts.edu.destroy();
  S.charts.edu = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Bez vzdělání', 'Základní', 'Střední bez mat.', 'Střední s mat.', 'Vyšší odb.', 'VŠ'],
      datasets: [{
        data: [s.vzdelani_bez ?? 0, s.vzdelani_zaklad ?? 0, s.vzdelani_str_bez ?? 0, s.vzdelani_str_s ?? 0, s.vzdelani_vos ?? 0, s.vzdelani_vysoko ?? 0],
        backgroundColor: ['rgba(242,117,117,0.8)','rgba(242,155,75,0.8)','rgba(242,199,0,0.8)','rgba(111,217,142,0.65)','rgba(100,180,240,0.75)','rgba(176,96,255,0.85)'],
        borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: 'rgba(255,255,255,0.45)', font: { family: 'Space Grotesk', size: 9 }, boxWidth: 8, padding: 5 },
        },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed.toFixed(1)} %` } },
      },
      animation: CHART_DEF.animation,
    },
  });
}

// ─── LEGEND ───────────────────────────────────────────────────────────────────
function updateLegend() {
  const r   = S.ranges[S.indicator];
  const cfg = IND[S.indicator];
  if (!r || !cfg) return;
  const cssStops = cfg.scale.map((c, i) => `rgb(${c}) ${(i / (cfg.scale.length - 1)) * 100}%`).join(', ');
  document.getElementById('legend-bar').style.background = `linear-gradient(to right, ${cssStops})`;
  document.getElementById('leg-min').textContent = fmtPct(r.min);
  document.getElementById('leg-max').textContent = fmtPct(r.max);
}

// ─── COLORS ───────────────────────────────────────────────────────────────────
function colorFor(v, min, max, ind) {
  const t = max === min ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));
  const stops = IND[ind]?.scale ?? [[20,20,20],[200,200,200]];
  const n = stops.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  const lt = t * n - i;
  const [a, b] = [stops[i], stops[i + 1]];
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*lt)},${Math.round(a[1]+(b[1]-a[1])*lt)},${Math.round(a[2]+(b[2]-a[2])*lt)})`;
}

// ─── URL ──────────────────────────────────────────────────────────────────────
function updateURL() {
  const p = new URLSearchParams();
  p.set('level', S.level);
  p.set('indicator', S.indicator);
  if (S.unitId) p.set('id', S.unitId);
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function readURL() {
  const p = new URLSearchParams(location.search);
  const lv = p.get('level');
  if (lv && ['obce','orp','okresy','kraje'].includes(lv)) { S.level = lv; setLevelUI(lv); }
  const ind = p.get('indicator');
  if (ind && IND[ind]) { S.indicator = ind; document.getElementById('indicator-sel').value = ind; }
  const id = p.get('id');
  if (id) S.unitId = id;
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function set(id, val)       { document.getElementById(id).textContent = val; }
function fmtPct(v, d = 1)   { return v != null ? `${v.toFixed(d)} %` : '—'; }

function progSet(key, val, max) {
  const pct = fmtPct(val);
  document.getElementById(`v-${key}`).textContent = pct;
  barWidth(`b-${key}`, val ?? 0, max);
}

function barWidth(id, val, max) {
  document.getElementById(id).style.width = `${Math.min(100, Math.max(0, (val / max) * 100))}%`;
}

function showResults() {
  document.getElementById('results-sec').classList.add('show');
  const ob = document.getElementById('onboard-state');
  if (ob) ob.style.display = 'none';
}
function hideResults() { document.getElementById('results-sec').classList.remove('show'); }

let _errTimer = null;
function showErr(msg, persistent = false) {
  const el = document.getElementById('error-box');
  el.textContent = msg;
  el.classList.add('show');
  if (_errTimer) { clearTimeout(_errTimer); _errTimer = null; }
  if (!persistent) {
    _errTimer = setTimeout(() => el.classList.remove('show'), 7000);
  }
}
function hideErr() {
  if (_errTimer) { clearTimeout(_errTimer); _errTimer = null; }
  document.getElementById('error-box').classList.remove('show');
}

function showMapHint(on) {
  document.getElementById('map-hint').classList.toggle('show', on);
}

function hideOverlay() {
  const el = document.getElementById('loading-overlay');
  el.classList.add('fade');
  setTimeout(() => el.classList.add('gone'), 380);
}

function setBtnLoad(on) {
  const btn = document.getElementById('analyze-btn');
  btn.disabled = on;
  btn.innerHTML = on
    ? '<div class="mini-spin"></div>Analyzuji…'
    : '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="5"/><line x1="6.5" y1="3.5" x2="6.5" y2="6.5"/><line x1="6.5" y1="6.5" x2="8.8" y2="8.8"/></svg>Analyzovat';
}

function setLevelLoading(on) {
  document.querySelectorAll('#level-pills .pill').forEach(b => {
    b.disabled = on;
    b.style.opacity = on ? '0.45' : '';
  });
}

function setLevel(level) {
  S.level = level;
  setLevelUI(level);
  if (S.adminL && level === 'obce') { S.map.removeLayer(S.adminL); S.adminL = null; }
}

function setLevelUI(level) {
  document.querySelectorAll('#level-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.level === level));
}

// ─── INDICATOR DESC ───────────────────────────────────────────────────────────
function updateIndicatorDesc() {
  const el = document.getElementById('indicator-desc');
  if (!el) return;
  el.textContent = IND[S.indicator]?.desc ?? '';
}

// ─── FETCH WITH ABORT ─────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  if (S.abort) S.abort.abort();
  S.abort = new AbortController();
  const res = await fetch(url, { ...opts, signal: S.abort.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

// ─── MOBILE PANEL HELPERS ─────────────────────────────────────────────────────
function openPanel() {
  const panel = document.getElementById('panel');
  const backdrop = document.getElementById('panel-backdrop');
  const btn = document.getElementById('menu-btn');
  panel.classList.add('open');
  btn?.classList.add('open');
  if (backdrop) {
    backdrop.classList.add('show');
    requestAnimationFrame(() => backdrop.classList.add('visible'));
  }
}

function closePanel() {
  const panel = document.getElementById('panel');
  const backdrop = document.getElementById('panel-backdrop');
  const btn = document.getElementById('menu-btn');
  panel.classList.remove('open');
  btn?.classList.remove('open');
  if (backdrop) {
    backdrop.classList.remove('visible');
    backdrop.addEventListener('transitionend', () => backdrop.classList.remove('show'), { once: true });
  }
}

// ─── EVENT BINDINGS ───────────────────────────────────────────────────────────
function bindAll() {
  // Level pills
  document.querySelectorAll('#level-pills .pill').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lv = btn.dataset.level;
      if (lv === S.level) return;
      setLevel(lv);
      S.unitId = null; S.unitName = null;
      document.getElementById('search-input').value = '';
      document.getElementById('analyze-btn').disabled = true;
      document.getElementById('search-clear').classList.remove('show');
      hideResults();
      hideErr();
      const ob = document.getElementById('onboard-state');
      if (ob) ob.style.display = '';
      if (lv !== 'obce') {
        setLevelLoading(true);
        try { await loadGeoJSON(lv); } catch(e) { showErr('Nepodařilo se načíst hranice.'); }
        setLevelLoading(false);
      } else { if (S.adminL) { S.map.removeLayer(S.adminL); S.adminL = null; } }
      await loadUnits(lv);
      updateURL();
    });
  });

  // Map layer switcher
  document.querySelectorAll('#map-switcher .pill').forEach(btn =>
    btn.addEventListener('click', () => switchTile(btn.dataset.layer)));

  // Search clear
  document.getElementById('search-clear').addEventListener('click', clearSelection);

  // Indicator select
  document.getElementById('indicator-sel').addEventListener('change', e => {
    S.indicator = e.target.value;
    updateChoropleth();
    updateIndicatorDesc();
    updateURL();
  });

  // Search input
  const inp = document.getElementById('search-input');
  inp.addEventListener('focus', openDrop);
  inp.addEventListener('input', e => {
    filterDrop(e.target.value);
    openDrop();
    if (S.unitId && e.target.value !== S.unitName) {
      S.unitId = null;
      document.getElementById('analyze-btn').disabled = true;
    }
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && S.unitId) { closeDrop(); analyze(); }
    if (e.key === 'Escape') closeDrop();
  });
  document.addEventListener('click', e => {
    if (!document.getElementById('search-wrap').contains(e.target)) closeDrop();
  });

  // Analyze button
  document.getElementById('analyze-btn').addEventListener('click', analyze);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b  => b.classList.toggle('active', b.dataset.tab === t));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${t}`));
    });
  });

  // Draw button
  document.getElementById('draw-btn').addEventListener('click', startDraw);

  // Hamburger button (mobile)
  document.getElementById('menu-btn')?.addEventListener('click', () => {
    document.getElementById('panel').classList.contains('open') ? closePanel() : openPanel();
  });

  // Backdrop tap — closes panel
  document.getElementById('panel-backdrop')?.addEventListener('click', closePanel);

  // Mobile panel handle (kept but noop — handle is hidden on mobile side panel)
  document.getElementById('panel-handle')?.addEventListener('click', () => {
    document.getElementById('panel').classList.contains('open') ? closePanel() : openPanel();
  });
}
