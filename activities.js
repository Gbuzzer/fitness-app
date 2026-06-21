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
let actCurrentSport  = 'all';
let actCurrentMetric = 'distanz_km';
let actCurrentScale  = 'all';
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
    renderAct();
}

function formatD(date) {
    return date.toISOString().slice(0, 10);
}

// ── Listeners ──
function setupActListeners() {
    actDateStartEl.addEventListener('change', e => {
        actDateStart = e.target.value ? new Date(e.target.value) : null;
        renderAct();
    });
    actDateEndEl.addEventListener('change', e => {
        actDateEnd = e.target.value ? new Date(e.target.value) : null;
        renderAct();
    });
    actDateResetBtn.addEventListener('click', () => {
        if (!actData.length) return;
        const min = actData[0].date;
        const max = actData[actData.length - 1].date;
        actDateStartEl.value = formatD(min);
        actDateEndEl.value   = formatD(max);
        actDateStart = min;
        actDateEnd   = max;
        renderAct();
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
            renderAct();
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
        // one bar per activity
        return rows.map(d => ({
            label:     d.datum,
            value:     d[actCurrentMetric] ?? 0,
            sportType: d.sportType,
            hr_avg:    d.hr_avg ?? null,
            hr_max:    d.hr_max ?? null,
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

// ── Boot ──
loadActivities();
