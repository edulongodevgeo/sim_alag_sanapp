const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let sensores = null;
let predicoes = null;
let historyEvents = null;
let currentIndex = 0;
let markers = new Map();
let sortState = { key: 'score', dir: 'desc' };
let simulatedRain = null;

function categoriaDotClass(cat) {
  const c = (cat || '').toLowerCase();
  if (c.startsWith('crit')) return 'critica';
  if (c.startsWith('alt')) return 'alta';
  if (c.startsWith('med')) return 'media';
  if (c.includes('dado') || c.includes('hist')) return 'sem_dados';
  return 'pouca';
}

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return Number(n).toFixed(digits);
}

async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Falha ao carregar ${path}`);
  return r.json();
}

function buildMap() {
  const map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // Centraliza em Florianópolis com base nos sensores
  const latlngs = sensores.sensors.map(s => [s.location.lat, s.location.lon]);
  const bounds = L.latLngBounds(latlngs);
  map.fitBounds(bounds.pad(0.15));

  // prepara markers
  sensores.sensors.forEach(s => {
    const m = L.circleMarker([s.location.lat, s.location.lon], {
      radius: 8,
      weight: 2,
      opacity: 0.9,
      fillOpacity: 0.75
    }).addTo(map);
    markers.set(s.sensor_id, m);
  });

  return map;
}

function colorForCategoria(cat) {
  const c = categoriaDotClass(cat);
  if (c === 'critica') return '#ff4d6d';
  if (c === 'alta') return '#ff8a4c';
  if (c === 'media') return '#f6c343';
  if (c === 'sem_dados') return '#bdc3c7'; // Gray
  return '#39d98a';
}

function zoomAlt() {
  if (!sensores || !sensores.sensors) return;
  const latlngs = sensores.sensors.map(s => [s.location.lat, s.location.lon]);
  const bounds = L.latLngBounds(latlngs);
  if (window._map) window._map.fitBounds(bounds.pad(0.15));
}

function updateMapAndTable() {
  const onlyHigh = $('#onlyHigh').checked;
  const q = ($('#search').value || '').trim().toLowerCase();

  // Use 'forecasts' instead of 'frames'
  const currentForecast = predicoes.forecasts[currentIndex];

  if (!currentForecast) return;

  const dailyRain = simulatedRain !== null ? simulatedRain : (currentForecast.rain_mm_forecast || 0);

  // meta updates
  let metaHtml = `
    <strong>Data:</strong> ${currentForecast.date.split('-').reverse().join('/')} <br/>
    <strong>Previsão Chuva Dia:</strong> ${fmt(currentForecast.rain_mm_forecast || 0, 1)} mm <br/>
    <strong>Cenário:</strong> ${currentForecast.scenario || 'N/A'}
  `;

  if (simulatedRain !== null) {
    metaHtml += `<br/><div style="margin-top:4px; padding:4px; background:rgba(255,255,255,0.1); border-radius:4px; text-align:center"><strong style="color:#f6c343">⚠️ SIMULAÇÃO: ${fmt(dailyRain, 1)} mm</strong></div>`;
  }

  $('#meta').innerHTML = metaHtml;

  // map markers
  sensores.sensors.forEach(s => {
    // Logic on the fly
    const t = s.threshold; // Assumes init() attaches this

    let score = 0;
    let cat = 'pouca';

    if (t === null || t === undefined) {
      score = null;
      cat = 'sem_dados';
    } else {
      if (t > 0) score = (dailyRain / t) * 100;
      score = Math.max(0, Math.min(100, score));

      if (score >= 50) cat = 'media';
      if (score >= 75) cat = 'alta';
      if (score >= 90) cat = 'critica';
    }

    // Logic for visibility
    const matchesQuery = !q || s.sensor_id.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
    const isHigh = (cat === 'alta' || cat === 'critica');
    const visible = matchesQuery && (!onlyHigh || isHigh);

    const m = markers.get(s.sensor_id);
    m.setStyle({
      color: colorForCategoria(cat),
      fillColor: colorForCategoria(cat)
    });

    const popup = `
      <div style="font-family:system-ui; min-width:220px">
        <div style="font-weight:700; margin-bottom:6px">${s.sensor_id} — ${s.name || ''}</div>
        <div style="margin-bottom:4px"><b>Risco:</b> <span class="badge" style="display:inline-block; transform:scale(0.9); margin:0"><span class="dot ${categoriaDotClass(cat)}"></span>${cat === 'sem_dados' ? 'Sem Histórico' : cat}</span></div>
        <div><b>Probabilidade:</b> ${score !== null ? fmt(score, 1) + '%' : 'N/A'}</div>
        <hr style="border:0;border-top:1px solid rgba(0,0,0,.15);margin:8px 0"/>
        <div><b>Chuva do Dia:</b> ${fmt(dailyRain, 1)} mm</div>
        <div><b>Vulnerabilidade:</b> ${s.vulnerability !== null ? fmt(s.vulnerability, 2) : 'Desconhecida'}</div>
      </div>
    `;
    m.bindPopup(popup);

    if (visible && !window._map.hasLayer(m)) {
      m.addTo(window._map);
    } else if (!visible && window._map.hasLayer(m)) {
      m.removeFrom(window._map);
    }

    // Attach calculated data to sensor object for table usage/sorting
    s._currentScore = score;
    s._currentCat = cat;
    s._currentRain = dailyRain;
  });

  // table rows
  const rows = sensores.sensors
    .map(s => {
      // Use the properties we just calculated
      return {
        sensor_id: s.sensor_id,
        name: s.name || '',
        score: s._currentScore,
        categoria: s._currentCat,
        dailyRain: s._currentRain,
        vul: s.vulnerability ?? 0,
      };
    })
    .filter(r => {
      const matchesQuery = !q || r.sensor_id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
      const isHigh = (r.categoria === 'alta' || r.categoria === 'critica');
      return matchesQuery && (!onlyHigh || isHigh);
    });

  rows.sort((a, b) => {
    const k = sortState.key;
    const dir = sortState.dir === 'asc' ? 1 : -1;
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'pt-BR') * dir;
  });

  const tbody = $('#results tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => {
      const s = sensores.sensors.find(x => x.sensor_id === r.sensor_id);
      if (s && window._map) {
        window._map.flyTo([s.location.lat, s.location.lon], 16);
        const m = markers.get(s.sensor_id);
        if (m) m.openPopup();
      }
    };

    const dotClass = categoriaDotClass(r.categoria);
    tr.innerHTML = `
      <td>${r.sensor_id}</td>
      <td>${r.name}</td>
      <td class="num">${r.score !== null ? fmt(r.score, 1) + '%' : 'N/A'}</td>
      <td>
        <span class="badge"><span class="dot ${dotClass}"></span>${r.categoria === 'sem_dados' ? 'Sem Histórico' : r.categoria}</span>
      </td>
      <td class="num" colspan="3" style="text-align:center; color:#666">${fmt(r.dailyRain, 1)} mm (dia)</td>
      <td style="text-align:center; white-space:nowrap">
        <span class="icon-btn" onclick="openHistory(event, '${r.sensor_id}')" title="Histórico">📜</span>
        <span class="icon-btn" onclick="openFuzzy(event, '${r.sensor_id}')" title="Análise Fuzzy">📊</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function wireUI() {
  $('#timeSelect').addEventListener('change', (e) => {
    currentIndex = Number(e.target.value);
    updateMapAndTable();
  });
  $('#onlyHigh').addEventListener('change', updateMapAndTable);
  $('#search').addEventListener('input', () => {
    clearTimeout(window._t);
    window._t = setTimeout(updateMapAndTable, 120);
  });

  $$('#results thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.key = key;
        sortState.dir = (key === 'score') ? 'desc' : 'asc';
      }
      updateMapAndTable();
    });
  });

  // Zoom Alt
  $('#zoomAltBtn').addEventListener('click', zoomAlt);

  // Simulation
  $('#simBtn').addEventListener('click', () => {
    const val = parseFloat($('#simInput').value.replace(',', '.'));
    if (!isNaN(val) && val >= 0) {
      simulatedRain = val;
      $('#resetSimBtn').classList.remove('hidden');
      updateMapAndTable();
    } else {
      alert('Por favor, insira um valor válido de chuva (mm).');
    }
  });

  $('#resetSimBtn').addEventListener('click', () => {
    simulatedRain = null;
    $('#simInput').value = '';
    $('#resetSimBtn').classList.add('hidden');
    updateMapAndTable();
  });
}

async function init() {
  try {
    sensores = await loadJson('data/sensores.json');
    predicoes = await loadJson('data/previsao_tempo.json');
    historyEvents = await loadJson('data/history_sensores.json');

    // --- INTELLIGENCE INJECTION (Real-Time) ---
    // 1. Learn Critical Thresholds from History
    const learnedThresholds = LearnFromHistory(sensores.sensors, historyEvents);
    console.log("Sistema aprendeu os limiares críticos:", learnedThresholds);

    // 1.5 Calculate Dynamic Vulnerability per Sensor
    sensores.sensors.forEach(s => {
      const t = learnedThresholds[s.sensor_id];
      // Attach threshold to sensor for easy access
      s.threshold = t;

      if (t === null || t === undefined) {
        s.vulnerability = null; // Unknown
      } else {
        // Reverse logic of fallback: threshold = 25 - (vul * 17)
        // vul = (25 - threshold) / 17
        let v = (25 - t) / 17;
        v = Math.max(0.1, Math.min(1.0, v));
        s.vulnerability = v;
      }
    });

    // 2. Calculate Risk Scores on the Fly
    if (predicoes.forecasts) {
      predicoes.forecasts.forEach(day => {
        // Generate the missing 'sensors' array by calculating risk against the forecast
        day.sensors = sensores.sensors.map(sensor => {
          const threshold = learnedThresholds[sensor.sensor_id];
          const rain = day.rain_mm_forecast || 0;

          let score = 0;
          let cat = 'pouca';

          if (threshold === null || threshold === undefined) {
            score = null;
            cat = 'sem_dados';
          } else {
            if (threshold > 0) score = (rain / threshold) * 100;
            score = Math.max(0, Math.min(100, score));

            if (score >= 50) cat = 'media';
            if (score >= 75) cat = 'alta';
            if (score >= 90) cat = 'critica';
          }

          return {
            sensor_id: sensor.sensor_id,
            probability_score: score,
            categoria: cat,
            learned_threshold: threshold
          };
        });
      });
    }

    window._map = buildMap();

    // selector
    const sel = $('#timeSelect');
    sel.innerHTML = '';
    predicoes.forecasts.forEach((f, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      // Format: DD/MM - Cenario
      const dParts = f.date.split('-');
      const label = `${dParts[2]}/${dParts[1]} - ${f.scenario || 'Prev'}`;
      opt.textContent = label;
      sel.appendChild(opt);
    });

    // Default to the first high risk day if any, else index 0
    currentIndex = 0;
    sel.value = "0";

    wireUI();
    updateMapAndTable();

    // Modal close handlers
    $$('.close-btn').forEach(b => {
      b.onclick = (e) => {
        closeHistory();
        closeFuzzy();
        closeInfo();
      }
    });

    window.onclick = (e) => {
      if (e.target.classList.contains('modal')) {
        closeHistory();
        closeFuzzy();
        closeInfo();
      }
    };

    // Info Button
    const infoBtn = $('#infoBtn');
    if (infoBtn) infoBtn.onclick = openInfo;
  } catch (e) {
    console.error(e);
    alert('Erro ao inicializar aplicação: ' + e.message);
  }
}

function openHistory(e, sensorId) {
  e.stopPropagation();
  const modal = $('#historyModal');
  const title = $('#historyTitle');
  const tbody = $('#historyTableBody');

  title.textContent = `Histórico: ${sensorId}`;
  tbody.innerHTML = '';

  // Filter events
  const events = (historyEvents || [])
    .filter(ev => ev.sensor_id === sensorId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#888">Sem registros de extravasamento no histórico.</td></tr>';
  } else {
    events.forEach(ev => {
      const row = document.createElement('tr');
      const isSim = ev.extravasamento;
      row.innerHTML = `
        <td>${ev.date.split('-').reverse().join('/')}</td>
        <td class="num">${fmt(ev.rain_mm_day, 1)}</td>
        <td style="text-align:center; font-weight:bold; color: ${isSim ? '#ff4d6d' : '#39d98a'}">
          ${isSim ? 'Sim' : 'Não'}
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  modal.classList.remove('hidden');
}

function closeHistory() {
  $('#historyModal').classList.add('hidden');
}

// Global expose needed for onclick in HTML string
window.openHistory = openHistory;
window.closeHistory = closeHistory;

function openFuzzy(e, sensorId) {
  e.stopPropagation();
  const modal = $('#fuzzyModal');

  // Find current data
  const currentForecast = predicoes.forecasts[currentIndex] || {};
  const dailyRain = currentForecast.rain_mm_forecast || 0;
  const sensorData = currentForecast.sensors.find(s => s.sensor_id === sensorId);
  const sensorStatic = sensores.sensors.find(s => s.sensor_id === sensorId);

  if (!sensorData || !sensorStatic) return;

  const score = sensorData.probability_score || 0;
  const vul = sensorStatic.vulnerability || 0;

  // Update DOM
  $('#fuzzySensorTitle').textContent = `${sensorId} — ${sensorStatic.name}`;
  $('#fuzzySubtitle').textContent = `Chuva: ${fmt(dailyRain, 1)}mm  ×  Vuln: ${vul !== null ? fmt(vul, 2) : '?'}`;

  if (score === null) {
    $('#fuzzyNeedle').style.left = '0%';
    $('#fuzzyScoreDisplay').textContent = `Score: N/A`;
    $('#fuzzyExplanation').innerHTML = `
        <div style="color:#e74c3c; font-weight:bold; margin-bottom:10px">⚠️ DADOS INSUFICIENTES</div>
        Este sensor não possui histórico de extravasamento registado.<br/><br/>
        Para que o sistema possa calcular a probabilidade de alagamento (Score) e a Vulnerabilidade, é necessário que o sensor tenha registros históricos de eventos passados.
        <br/><br/>
        <b>Necessidade de histórico para análise e previsão.</b>
      `;
  } else {
    $('#fuzzyNeedle').style.left = `${Math.min(100, Math.max(0, score))}%`;
    $('#fuzzyScoreDisplay').textContent = `Score: ${fmt(score, 1)}`;

    // Didactic Text
    let intensity = "baixa";
    let color = "#39d98a";
    if (score >= 50) { intensity = "média"; color = "#f6c343"; }
    if (score >= 75) { intensity = "alta"; color = "#ff8a4c"; }
    if (score >= 90) { intensity = "crítica"; color = "#ff4d6d"; }

    const explanation = `
        O sistema calculou um Score de <b>${fmt(score, 1)}</b>.<br/><br/>
        Isto ocorre porque temos uma chuva prevista de <b>${fmt(dailyRain, 1)}mm</b> incidindo sobre uma área com vulnerabilidade <b>${fmt(vul, 2)}</b>.<br/>
        <br/>
        Resultado: Risco de ALAGAMENTO <b style="color:${color}">${intensity.toUpperCase()}</b>.
      `;
    $('#fuzzyExplanation').innerHTML = explanation;
  }

  modal.classList.remove('hidden');
}

function closeFuzzy() {
  $('#fuzzyModal').classList.add('hidden');
}

function openInfo() {
  $('#infoModal').classList.remove('hidden');
}
function closeInfo() {
  $('#infoModal').classList.add('hidden');
}

window.openFuzzy = openFuzzy;
window.closeFuzzy = closeFuzzy;
window.closeInfo = closeInfo;

// --- INTELLIGENCE MODULE ---
function LearnFromHistory(sensorsList, historyList) {
  const thresholds = {};

  sensorsList.forEach(s => {
    // 1. Filter events where THIS sensor overflowed
    const overflows = historyList.filter(h => h.sensor_id === s.sensor_id && h.extravasamento);

    if (overflows.length > 0) {
      // 2. Average the rain amount that caused overflow
      const avgRain = overflows.reduce((sum, h) => sum + h.rain_mm_day, 0) / overflows.length;
      // 3. Set Safety Threshold (90% of average)
      thresholds[s.sensor_id] = avgRain * 0.9;
    } else {
      // No history of overflow? Cannot determine threshold
      thresholds[s.sensor_id] = null;
    }
  });

  return thresholds;
}

init();
