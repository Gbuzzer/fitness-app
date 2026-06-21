// ── Aktivitäten Tab ──

const SPORT_COLORS = {
    4:   '#10b981', // Joggen   – grün
    3:   '#3b82f6', // Radfahren – blau
    5:   '#f59e0b', // Wandern  – amber
    all: '#8b5cf6', // Gesamt   – lila
};

const SPORT_LABELS = {
    4: 'Joggen',
    3: 'Radfahren',
    5: 'Wandern',
};

const ACT_METRIC_LABELS = {
    distanz_km:    { label: 'Distanz',   unit: 'km'   },
    dauer_min:     { label: 'Dauer',     unit: 'min'  },
    kalorien_kcal: { label: 'Kalorien',  unit: 'kcal' },
    schritte:      { label: 'Schritte',  unit: ''     },
};

let actData = [];
let actChart = null;
let actDetailHrChart = null;
let actMapInstance = null;
let actCurrentSport  = 'all';
let actCurrentMetric = 'distanz_km';
let actCurrentScale  = 'all';
let actCurrentView   = 'chart';
let actDateStart = null;
let actDateEnd   = null;

// DOM refs
const actDateStartEl  = document.getElementById('actDateStart');
const actDateEndEl    = document.getElementById('actDateEnd');
const actDateResetBtn = document.getElementById('actDateResetBtn');
const actMetricSelect = document.getElementById('actMetricSelect');
const sportBtns       = document.querySelectorAll('.sport-btn');
const actScaleBtns    = document.querySelectorAll('.act-scale-btn');

// ── Load ──
async function loadActivities() {
    const res  = await fetch('data/activities_enriched.json');
    const raw  = await res.json();

    actData = raw
        .filter(d => d.datum)
        .map(d => ({ ...d, date: new Date(d.datum) }))
        .sort((a, b) => a.date - b.date);

    // Set date pickers
    if (actData.length) {
        const min = actData[0].date;
        const max = actData[actData.length - 1].date;
        actDateStartEl.min = actDateEndEl.min = formatD(min);
        actDateStartEl.max = actDateEndEl.max = formatD(max);
        actDateStartEl.value = formatD(min);
        actDateEndEl.value   = formatD(max);
        actDateStart = min;
        actDateEnd   = max;
    }

    setupActListeners();
    render();
}

function formatD(date) {
    return date.toISOString().slice(0, 10);
}

// ── Listeners ──
function setupActListeners() {
    actDateStartEl.addEventListener('change', e => {
        actDateStart = e.target.value ? new Date(e.target.value) : null;
        render();
    });
    actDateEndEl.addEventListener('change', e => {
        actDateEnd = e.target.value ? new Date(e.target.value) : null;
        render();
    });
    actDateResetBtn.addEventListener('click', () => {
        if (!actData.length) return;
        const min = actData[0].date;
        const max = actData[actData.length - 1].date;
        actDateStartEl.value = formatD(min);
        actDateEndEl.value   = formatD(max);
        actDateStart = min;
        actDateEnd   = max;
        render();
    });

    actMetricSelect.addEventListener('change', e => {
        actCurrentMetric = e.target.value;
        renderAct();
    });

    sportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sportBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            actCurrentSport = btn.dataset.sport;
            render();
        });
    });

    actScaleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            actScaleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            actCurrentScale = btn.dataset.scale;
            renderAct();
        });
    });

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            actCurrentView = btn.dataset.view;
            const isChart = actCurrentView === 'chart';
            document.getElementById('actChartContainer').classList.toggle('hidden', !isChart);
            document.getElementById('actListView').classList.toggle('hidden', isChart);
            document.getElementById('actChartControls').classList.toggle('hidden', !isChart);
            render();
        });
    });
}

// ── Filter ──
function getFilteredAct() {
    return actData.filter(d => {
        if (actDateStart && d.date < actDateStart) return false;
        if (actDateEnd) {
            const end = new Date(actDateEnd);
            end.setHours(23, 59, 59);
            if (d.date > end) return false;
        }
        if (actCurrentSport !== 'all' && d.sportType !== parseInt(actCurrentSport)) return false;
        return true;
    });
}

// ── Aggregation ──
function aggregateAct(rows) {
    if (actCurrentScale === 'all') {
        return rows.map(d => ({
            label:     d.datum,
            value:     d[actCurrentMetric] ?? 0,
            sportType: d.sportType,
            hr_avg:    d.hr_avg ?? null,
            hr_max:    d.hr_max ?? null,
            _raw:      d,
        }));
    }

    const buckets = {};
    rows.forEach(d => {
        const key = actCurrentScale === 'week'
            ? weekKey(d.date)
            : monthKey(d.date);
        if (!buckets[key]) buckets[key] = { sum: 0, count: 0, sportType: d.sportType };
        buckets[key].sum   += d[actCurrentMetric] ?? 0;
        buckets[key].count += 1;
    });

    return Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => ({
            label:     formatBucketLabel(key),
            value:     parseFloat(v.sum.toFixed(2)),
            sportType: v.sportType,
        }));
}

function weekKey(date) {
    const y = date.getFullYear();
    const w = String(getWeekNum(date)).padStart(2, '0');
    return `${y}-W${w}`;
}
function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function formatBucketLabel(key) {
    if (key.includes('-W')) {
        const [y, w] = key.split('-W');
        return `KW ${parseInt(w)}/${y}`;
    }
    const [y, m] = key.split('-');
    const names = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    return `${names[parseInt(m) - 1]} ${y}`;
}
function getWeekNum(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ── Stats Cards ──
function updateActStats(rows) {
    const count   = rows.length;
    const dist    = rows.reduce((s, d) => s + (d.distanz_km ?? 0), 0);
    const cal     = rows.reduce((s, d) => s + (d.kalorien_kcal ?? 0), 0);
    const avgDist = count ? dist / count : 0;

    // Heart rate from enriched data
    const hrRows  = rows.filter(d => d.hr_avg != null);
    const hrAvg   = hrRows.length ? Math.round(hrRows.reduce((s, d) => s + d.hr_avg, 0) / hrRows.length) : null;
    const hrMax   = hrRows.length ? Math.max(...hrRows.map(d => d.hr_max)) : null;

    document.getElementById('actStatCount').textContent   = count;
    document.getElementById('actStatDist').textContent    = dist.toFixed(1);
    document.getElementById('actStatCal').textContent     = Math.round(cal).toLocaleString('de');
    document.getElementById('actStatAvgDist').textContent = avgDist.toFixed(1);
    document.getElementById('actStatHrAvg').textContent   = hrAvg != null ? hrAvg : '–';
    document.getElementById('actStatHrMax').textContent   = hrMax != null ? hrMax : '–';
}

// ── View dispatcher ──
function render() {
    if (actCurrentView === 'chart') renderAct();
    else renderActList();
}

// ── List View ──
function renderActList() {
    const filtered = getFilteredAct().slice().reverse();
    updateActStats(filtered);

    const tbody = document.getElementById('actListBody');
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="act-list-empty">Keine Aktivitäten gefunden</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((act, idx) => {
        const emoji     = SPORT_EMOJI[act.sportType] ?? '🏅';
        const isCycling = act.sportType === 3;

        const [y, mo, d] = act.datum.split('-');
        const dateStr = `${d}.${mo}.${y}`;

        const distStr  = act.distanz_km  != null ? `${act.distanz_km.toFixed(2)} <span class="act-list-dim">km</span>` : '–';
        const durStr   = fmtDuration(act.dauer_min) ?? '–';
        const pace     = fmtPace(act.dauer_min, act.distanz_km);
        const speed    = (act.distanz_km && act.dauer_min)
            ? (act.distanz_km / (act.dauer_min / 60)).toFixed(1) : null;
        const paceStr  = isCycling
            ? (speed ? `${speed} <span class="act-list-dim">km/h</span>` : '–')
            : (pace  ? `${pace} <span class="act-list-dim">/km</span>`   : '–');
        const calStr   = act.kalorien_kcal != null
            ? `${Math.round(act.kalorien_kcal).toLocaleString('de')} <span class="act-list-dim">kcal</span>` : '–';
        const hrStr    = act.hr_avg != null
            ? `${act.hr_avg} <span class="act-list-dim">bpm</span>` : '–';

        return `<tr data-idx="${idx}">
            <td class="act-list-icon">${emoji}</td>
            <td class="act-list-date">${dateStr}</td>
            <td>${SPORT_LABELS[act.sportType] ?? 'Sonstiges'}</td>
            <td>${distStr}</td>
            <td>${durStr}</td>
            <td>${paceStr}</td>
            <td>${calStr}</td>
            <td>${hrStr}</td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('tr[data-idx]').forEach(row => {
        row.addEventListener('click', () => showActivityDetail(filtered[+row.dataset.idx]));
    });
}

// ── Chart ──
function renderAct() {
    const filtered   = getFilteredAct();
    updateActStats(filtered);

    const aggregated = aggregateAct(filtered);
    const metaMetric = ACT_METRIC_LABELS[actCurrentMetric];

    // Determine bar colors
    const colors = aggregated.map(d => {
        if (actCurrentSport !== 'all') return SPORT_COLORS[parseInt(actCurrentSport)];
        return SPORT_COLORS[d.sportType] ?? '#6b7280';
    });

    if (actChart) actChart.destroy();

    const ctx = document.getElementById('actChart').getContext('2d');
    actChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: aggregated.map(d => d.label),
            datasets: [{
                label: metaMetric.label,
                data:  aggregated.map(d => d.value),
                backgroundColor: colors,
                borderRadius: 4,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (event, elements) => {
                if (actCurrentScale !== 'all' || !elements.length) return;
                const raw = aggregated[elements[0].index]?._raw;
                if (raw) showActivityDetail(raw);
            },
            onHover: (event, elements) => {
                const canvas = event.native?.target;
                if (canvas) canvas.style.cursor =
                    (elements.length && actCurrentScale === 'all') ? 'pointer' : 'default';
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    padding: 12,
                    callbacks: {
                        label: ctx => {
                            const val = ctx.parsed.y;
                            return ` ${metaMetric.label}: ${val.toLocaleString('de')} ${metaMetric.unit}`;
                        },
                        afterLabel: ctx => {
                            const d = aggregated[ctx.dataIndex];
                            const lines = [];
                            if (actCurrentSport === 'all') {
                                lines.push(` ${SPORT_LABELS[d.sportType] ?? 'Sonstiges'}`);
                            }
                            if (d.hr_avg != null) lines.push(` Ø HR: ${d.hr_avg} bpm  Max: ${d.hr_max} bpm`);
                            return lines;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        callback: v => `${v} ${metaMetric.unit}`
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        maxRotation: actCurrentScale === 'all' ? 45 : 0,
                        minRotation: actCurrentScale === 'all' ? 45 : 0,
                    }
                }
            }
        }
    });
}

// ── Activity Detail Modal ──
const SPORT_EMOJI = { 4: '🏃', 3: '🚴', 5: '🥾' };

function fmtDuration(dauer_min) {
    if (dauer_min == null) return null;
    const s = Math.round(dauer_min * 60);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

// Daniels-Gilbert formula: estimates VO2max from race pace + duration
function calcVO2max(distanz_km, dauer_min) {
    if (!distanz_km || !dauer_min || distanz_km < 0.5) return null;
    const v   = (distanz_km * 1000) / dauer_min;           // m/min
    const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
    if (vo2 <= 0) return null;
    const pct = 0.8
        + 0.1894393 * Math.exp(-0.012778   * dauer_min)
        + 0.2989558 * Math.exp(-0.1932605  * dauer_min);
    const r = Math.round(vo2 / pct);
    return (r > 10 && r < 100) ? r : null;
}

function fmtPace(dauer_min, distanz_km) {
    if (!dauer_min || !distanz_km || distanz_km <= 0) return null;
    const s   = Math.round((dauer_min * 60) / distanz_km);
    const m   = Math.floor(s / 60);
    const ss  = s % 60;
    return `${m}:${String(ss).padStart(2,'0')}`;
}

function renderActivityMap(gpsTrack) {
    if (typeof L === 'undefined') return;
    if (actMapInstance) { actMapInstance.remove(); actMapInstance = null; }
    const container = document.getElementById('actRouteMap');
    if (!container) return;

    const coords = gpsTrack.map(p => [p.lat, p.lon]);
    if (coords.length < 2) return;

    actMapInstance = L.map('actRouteMap', { zoomControl: true, scrollWheelZoom: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
        maxZoom: 19,
    }).addTo(actMapInstance);

    const line = L.polyline(coords, { color: '#10b981', weight: 3, opacity: 0.9 }).addTo(actMapInstance);

    L.circleMarker(coords[0], { radius: 6, color: '#fff', fillColor: '#10b981', fillOpacity: 1, weight: 2 })
        .bindTooltip('Start').addTo(actMapInstance);
    L.circleMarker(coords[coords.length - 1], { radius: 6, color: '#fff', fillColor: '#ef4444', fillOpacity: 1, weight: 2 })
        .bindTooltip('Ziel').addTo(actMapInstance);

    // Force Leaflet to recalculate container dimensions after modal is painted
    actMapInstance.invalidateSize();
    actMapInstance.fitBounds(line.getBounds(), { padding: [20, 20] });
}

function showActivityDetail(act) {
    // Destroy existing instances before DOM replacement
    if (actMapInstance)   { actMapInstance.remove();    actMapInstance   = null; }
    if (actDetailHrChart) { actDetailHrChart.destroy(); actDetailHrChart = null; }

    const modal   = document.getElementById('actDetailModal');
    const content = document.getElementById('actDetailContent');

    const emoji     = SPORT_EMOJI[act.sportType] ?? '🏅';
    const sportName = SPORT_LABELS[act.sportType] ?? 'Sonstiges';

    const isCycling = act.sportType === 3;
    const isRunning = [4, 104].includes(act.sportType);

    const durStr    = fmtDuration(act.dauer_min);
    const speed_kmh = (act.distanz_km && act.dauer_min)
        ? (act.distanz_km / (act.dauer_min / 60)).toFixed(1) : null;
    const tempo     = !isCycling ? fmtPace(act.dauer_min, act.distanz_km) : null;
    const kadenz    = (act.schritte > 0 && act.dauer_min)
        ? Math.round(act.schritte / act.dauer_min) : null;
    const schrittcm = (act.schritte > 0 && act.distanz_km)
        ? Math.round(act.distanz_km * 100000 / act.schritte) : null;
    const vo2max    = isRunning ? calcVO2max(act.distanz_km, act.dauer_min) : null;

    const hasGps = act.gps_track?.length > 1;
    const hasHr  = act.heartrate?.length > 0;

    // Helper: stat card HTML
    const card = (label, value, unit) => `
        <div class="act-modal-item">
            <div class="act-modal-item-label">${label}</div>
            <div class="act-modal-item-value">${value ?? '–'} <span class="act-modal-item-unit">${value != null ? unit : ''}</span></div>
        </div>`;

    // Running/Jogging: fixed 3-column layout with semantic row order
    const gridHtml = isRunning ? `
        <div class="act-modal-grid act-modal-grid--run">
            <div class="act-modal-row-label">Aktivität</div>
            ${card('Distanz',          act.distanz_km?.toFixed(2),                                    'km')}
            ${card('Dauer',            durStr,                                                        '')}
            ${card('Kalorien',         act.kalorien_kcal != null ? Math.round(act.kalorien_kcal).toLocaleString('de') : null, 'kcal')}
            <div class="act-modal-row-label">Leistung</div>
            ${card('Ø Geschwindigkeit', speed_kmh,                                                    'km/h')}
            ${card('Tempo',            tempo,                                                         'min/km')}
            ${card('VO₂max',           vo2max,                                                        'ml/kg·min')}
            <div class="act-modal-row-label">Schritte</div>
            ${card('Schritte',         act.schritte > 0 ? act.schritte.toLocaleString('de') : null,  '')}
            ${card('Schrittlänge',     schrittcm,                                                     'cm')}
            ${card('Kadenz',           kadenz,                                                        '/min')}
            <div class="act-modal-row-label">Herzfrequenz</div>
            ${card('Durchschnitt',     act.hr_avg,                                                    'bpm')}
            ${card('Minimum',          act.hr_min,                                                    'bpm')}
            ${card('Maximum',          act.hr_max,                                                    'bpm')}
        </div>
    ` : `
        <div class="act-modal-grid">
            ${[
                act.distanz_km    != null && card('Distanz',          act.distanz_km.toFixed(2),                                    'km'),
                durStr                    && card('Dauer',             durStr,                                                        ''),
                speed_kmh                 && card('Ø Geschwindigkeit', speed_kmh,                                                    'km/h'),
                tempo                     && card('Tempo',             tempo,                                                        'min/km'),
                act.kalorien_kcal != null && card('Kalorien',          Math.round(act.kalorien_kcal).toLocaleString('de'),           'kcal'),
                act.hr_avg        != null && card('Ø Herzfrequenz',    act.hr_avg,                                                    'bpm'),
                act.hr_max        != null && card('Max Herzfrequenz',  act.hr_max,                                                    'bpm'),
                act.hr_min        != null && card('Min Herzfrequenz',  act.hr_min,                                                    'bpm'),
                kadenz            != null && card('Kadenz',            kadenz,                                                        'Schritte/min'),
                schrittcm         != null && card('Schrittlänge',      schrittcm,                                                     'cm'),
                act.schritte      >  0    && card('Schritte',          act.schritte.toLocaleString('de'),                            ''),
            ].filter(Boolean).join('')}
        </div>
    `;

    content.innerHTML = `
        <div class="act-modal-title">${emoji} ${sportName} &ndash; ${act.datum}</div>
        ${hasGps ? `<div id="actRouteMap" class="act-modal-map"></div>` : ''}
        ${gridHtml}
        ${hasHr ? `
            <div class="act-modal-section-title">Herzfrequenz-Verlauf</div>
            <div class="act-modal-hr-chart"><canvas id="actHrCanvas"></canvas></div>
        ` : ''}
    `;

    modal.classList.remove('hidden');

    if (hasGps) setTimeout(() => renderActivityMap(act.gps_track), 200);

    if (hasHr) {
        const t0     = act.heartrate[0].startTime;
        const labels = act.heartrate.map(p => {
            const m = Math.round((p.startTime - t0) / 60000);
            return `${m}'`;
        });
        const bpms = act.heartrate.map(p => p.bpm);

        actDetailHrChart = new Chart(
            document.getElementById('actHrCanvas').getContext('2d'),
            {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        data: bpms,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239,68,68,0.12)',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.85)',
                            callbacks: { label: c => ` ${c.parsed.y} bpm` }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: '#b0b0b0', font: { size: 10 }, maxTicksLimit: 8 }
                        },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { color: '#b0b0b0', font: { size: 10 }, callback: v => `${v}` }
                        }
                    }
                }
            }
        );
    }
}

function hideActivityDetail() {
    document.getElementById('actDetailModal').classList.add('hidden');
    if (actMapInstance)   { actMapInstance.remove();    actMapInstance   = null; }
    if (actDetailHrChart) { actDetailHrChart.destroy(); actDetailHrChart = null; }
}

document.getElementById('actModalClose').addEventListener('click', hideActivityDetail);
document.getElementById('actDetailModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideActivityDetail();
});

// ── Boot ──
loadActivities();
