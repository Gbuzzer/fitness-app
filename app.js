const METRICS = {
    gewicht_kg: { name: 'Gewicht', unit: 'kg', color: '#10b981' },
    koerperfett_pct: { name: 'Körperfett', unit: '%', color: '#ef4444' },
    bmi: { name: 'BMI', unit: '', color: '#f59e0b' },
    grundumsatz_kcal: { name: 'Grundumsatz', unit: 'kcal', color: '#8b5cf6' },
    viszeralfett: { name: 'Viszeralfett', unit: '', color: '#ec4899' },
    muskelmasse_kg: { name: 'Muskelmasse', unit: 'kg', color: '#3b82f6' },
    knochen_kg: { name: 'Knochen', unit: 'kg', color: '#6366f1' },
    protein_pct: { name: 'Protein', unit: '%', color: '#14b8a6' },
    koerperwasser_pct: { name: 'Körperwasser', unit: '%', color: '#0ea5e9' }
};

let data = [];
let chart = null;
let currentMetric1 = 'gewicht_kg';
let currentMetric2 = '';
let currentScale = 'day';
let dateRangeStart = null;
let dateRangeEnd = null;

// DOM Elements
const metricSelect1 = document.getElementById('metricSelect1');
const metricSelect2 = document.getElementById('metricSelect2');
const scaleBtns = document.querySelectorAll('.scale-btn');
const loading = document.getElementById('loading');
const dateStart = document.getElementById('dateStart');
const dateEnd = document.getElementById('dateEnd');
const dateResetBtn = document.getElementById('dateResetBtn');
const canvas = document.getElementById('chart');
const statAvg = document.getElementById('statAvg');
const statMin = document.getElementById('statMin');
const statMax = document.getElementById('statMax');
const statTrend = document.getElementById('statTrend');
const statAvgUnit = document.getElementById('statAvgUnit');
const statMinUnit = document.getElementById('statMinUnit');
const statMaxUnit = document.getElementById('statMaxUnit');

// Initialize
async function init() {
    try {
        data = await loadData();
        setupEventListeners();

        // Set date input ranges and defaults
        if (data.length > 0) {
            const minDate = data[0].date;
            const maxDate = data[data.length - 1].date;

            dateStart.min = formatDateForInput(minDate);
            dateStart.max = formatDateForInput(maxDate);
            dateStart.value = formatDateForInput(minDate);

            dateEnd.min = formatDateForInput(minDate);
            dateEnd.max = formatDateForInput(maxDate);
            dateEnd.value = formatDateForInput(maxDate);

            dateRangeStart = minDate;
            dateRangeEnd = maxDate;
        }

        updateChart();
    } catch (error) {
        console.error('Error loading data:', error);
        loading.textContent = 'Fehler beim Laden der Daten';
    }
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function loadData() {
    const response = await fetch('data.json');
    const rawData = await response.json();

    // Convert decimal percentages to actual percentages (0.184 -> 18.4)
    const percentFields = ['koerperfett_pct', 'protein_pct', 'koerperwasser_pct'];

    return rawData.map(record => {
        const adjusted = {
            date: new Date(record.datum),
            ...record
        };

        // Multiply percentage fields by 100 if they're small decimals
        percentFields.forEach(field => {
            if (adjusted[field] && adjusted[field] < 1) {
                adjusted[field] = adjusted[field] * 100;
            }
        });

        return adjusted;
    }).sort((a, b) => a.date - b.date);
}

function setupEventListeners() {
    metricSelect1.addEventListener('change', (e) => {
        currentMetric1 = e.target.value;
        updateChart();
    });

    metricSelect2.addEventListener('change', (e) => {
        currentMetric2 = e.target.value;
        updateChart();
    });

    scaleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            scaleBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentScale = e.target.dataset.scale;
            updateChart();
        });
    });

    dateStart.addEventListener('change', (e) => {
        dateRangeStart = e.target.value ? new Date(e.target.value) : null;
        updateChart();
    });

    dateEnd.addEventListener('change', (e) => {
        dateRangeEnd = e.target.value ? new Date(e.target.value) : null;
        updateChart();
    });

    dateResetBtn.addEventListener('click', () => {
        if (data.length > 0) {
            const minDate = data[0].date;
            const maxDate = data[data.length - 1].date;

            dateStart.value = formatDateForInput(minDate);
            dateEnd.value = formatDateForInput(maxDate);

            dateRangeStart = minDate;
            dateRangeEnd = maxDate;

            updateChart();
        }
    });
}

function getFilteredData() {
    if (!dateRangeStart && !dateRangeEnd) {
        return data;
    }

    return data.filter(d => {
        if (dateRangeStart && d.date < dateRangeStart) return false;
        if (dateRangeEnd) {
            const endDate = new Date(dateRangeEnd);
            endDate.setHours(23, 59, 59, 999);
            if (d.date > endDate) return false;
        }
        return true;
    });
}

function getAggregatedData(metrics) {
    const filteredData = getFilteredData();
    const aggregated = [];

    if (currentScale === 'day') {
        aggregated.push(...filteredData.map(d => {
            const point = {
                date: d.date,
                label: formatDate(d.date, 'day'),
                raw: d
            };
            metrics.forEach(metric => {
                point[metric] = parseFloat(d[metric]) || null;
            });
            return point;
        }));
    } else if (currentScale === 'week') {
        const weeks = {};
        filteredData.forEach(d => {
            const weekKey = getWeekKey(d.date);
            if (!weeks[weekKey]) {
                weeks[weekKey] = { date: d.date, count: 0 };
                metrics.forEach(metric => {
                    weeks[weekKey][metric] = [];
                });
            }
            weeks[weekKey].count++;
            metrics.forEach(metric => {
                const val = parseFloat(d[metric]);
                if (val !== null && !isNaN(val)) {
                    weeks[weekKey][metric].push(val);
                }
            });
        });

        Object.entries(weeks)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([key, week]) => {
                const point = {
                    date: week.date,
                    label: formatWeekLabel(key),
                    count: week.count
                };
                metrics.forEach(metric => {
                    const values = week[metric];
                    point[metric] = values.length > 0
                        ? values.reduce((a, b) => a + b, 0) / values.length
                        : null;
                });
                aggregated.push(point);
            });
    } else if (currentScale === 'month') {
        const months = {};
        filteredData.forEach(d => {
            const monthKey = getMonthKey(d.date);
            if (!months[monthKey]) {
                months[monthKey] = { date: d.date };
                metrics.forEach(metric => {
                    months[monthKey][metric] = [];
                });
            }
            metrics.forEach(metric => {
                const val = parseFloat(d[metric]);
                if (val !== null && !isNaN(val)) {
                    months[monthKey][metric].push(val);
                }
            });
        });

        Object.entries(months)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([key, month]) => {
                const point = {
                    date: month.date,
                    label: formatMonthLabel(key),
                    sortKey: key
                };
                metrics.forEach(metric => {
                    const values = month[metric];
                    point[metric] = values.length > 0
                        ? values.reduce((a, b) => a + b, 0) / values.length
                        : null;
                });
                aggregated.push(point);
            });
    }

    return aggregated.filter(d => {
        return metrics.every(metric => d[metric] !== null && !isNaN(d[metric]));
    });
}

function getWeekKey(date) {
    const year = date.getFullYear();
    const week = String(getWeekNumber(date)).padStart(2, '0');
    return `${year}-W${week}`;
}

function formatWeekLabel(weekKey) {
    const [year, week] = weekKey.split('-W');
    return `KW ${parseInt(week)}/${year}`;
}

function getMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-');
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function formatDate(date, scale) {
    const options = { month: 'short', day: 'numeric', year: '2-digit' };
    return date.toLocaleDateString('de-DE', options);
}

function calculateStats(aggregated, metric) {
    if (aggregated.length === 0) {
        return { avg: 0, min: 0, max: 0, trend: 0 };
    }

    const values = aggregated.map(d => d[metric]).filter(v => v !== null && !isNaN(v));
    if (values.length === 0) {
        return { avg: 0, min: 0, max: 0, trend: 0 };
    }

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate trend (linear regression)
    let trend = 0;
    if (values.length > 1) {
        const n = values.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = values;
        const xMean = x.reduce((a, b) => a + b) / n;
        const yMean = y.reduce((a, b) => a + b) / n;
        const numerator = x.reduce((sum, xi, i) => sum + (xi - xMean) * (y[i] - yMean), 0);
        const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);
        const slope = denominator !== 0 ? numerator / denominator : 0;

        // Convert slope to per-week trend
        if (currentScale === 'day') {
            trend = slope * 7;
        } else if (currentScale === 'week') {
            trend = slope;
        } else if (currentScale === 'month') {
            trend = slope / 4.3; // approximate weeks per month
        }
    }

    return { avg, min, max, trend };
}

function updateChart() {
    const metrics = [currentMetric1];
    if (currentMetric2) {
        metrics.push(currentMetric2);
    }

    const aggregated = getAggregatedData(metrics);
    const stats = calculateStats(aggregated, currentMetric1);
    const metric1 = METRICS[currentMetric1];
    const metric2 = currentMetric2 ? METRICS[currentMetric2] : null;

    // Update stats cards
    statAvg.textContent = stats.avg.toFixed(1);
    statMin.textContent = stats.min.toFixed(1);
    statMax.textContent = stats.max.toFixed(1);
    statTrend.textContent = `${stats.trend > 0 ? '+' : ''}${stats.trend.toFixed(2)}`;
    statTrend.style.color = stats.trend > 0 ? '#ef4444' : '#10b981';

    statAvgUnit.textContent = metric1.unit;
    statMinUnit.textContent = metric1.unit;
    statMaxUnit.textContent = metric1.unit;

    // Mark local extrema for week view
    if (currentScale === 'week') {
        aggregated.forEach((point, index) => {
            const curr = point[currentMetric1];
            const prev = index > 0 ? aggregated[index - 1][currentMetric1] : null;
            const next = index < aggregated.length - 1 ? aggregated[index + 1][currentMetric1] : null;

            point.isExtremum = (prev === null || curr < prev) && (next === null || curr < next) ||
                               (prev === null || curr > prev) && (next === null || curr > next);
        });

        if (currentMetric2) {
            aggregated.forEach((point, index) => {
                const curr = point[currentMetric2];
                const prev = index > 0 ? aggregated[index - 1][currentMetric2] : null;
                const next = index < aggregated.length - 1 ? aggregated[index + 1][currentMetric2] : null;

                const isExtremum = (prev === null || curr < prev) && (next === null || curr < next) ||
                                   (prev === null || curr > prev) && (next === null || curr > next);
                point.isExtremum = point.isExtremum || isExtremum;
            });
        }
    }

    // Prepare chart data
    const labels = aggregated.map(d => d.label);
    const values1 = aggregated.map(d => d[currentMetric1]);

    const datasets = [{
        label: metric1.name,
        data: values1,
        borderColor: metric1.color,
        backgroundColor: metric1.color + '15',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: currentScale === 'day' ? 3 : 5,
        pointBackgroundColor: metric1.color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: metric1.color,
        pointHoverBorderWidth: 3,
        yAxisID: 'y'
    }];

    // Add second dataset if metric2 is selected
    if (currentMetric2) {
        const values2 = aggregated.map(d => d[currentMetric2]);
        datasets.push({
            label: metric2.name,
            data: values2,
            borderColor: metric2.color,
            backgroundColor: metric2.color + '15',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: currentScale === 'day' ? 3 : 5,
            pointBackgroundColor: metric2.color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            pointHoverBackgroundColor: metric2.color,
            pointHoverBorderWidth: 3,
            yAxisID: 'y1'
        });
    }

    // Destroy existing chart
    if (chart) {
        chart.destroy();
    }

    // Create new chart
    const ctx = canvas.getContext('2d');

    // Plugin to draw data labels on points (only for week/month view)
    const dataLabelsPlugin = currentScale !== 'day' ? {
        id: 'dataLabels',
        afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                if (!meta.data) return;

                meta.data.forEach((point, index) => {
                    if (!point) return;

                    const value = dataset.data[index];
                    if (value === null || value === undefined) return;

                    // In week view: only show labels for local extrema (min/max)
                    // In month view: show all labels
                    const showLabel = currentScale === 'month' || aggregated[index]?.isExtremum;

                    if (!showLabel) return;

                    const x = point.x;
                    const y = point.y;
                    const text = value.toFixed(1);

                    // Draw text with shadow for better readability
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 3;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 1;

                    ctx.fillStyle = dataset.borderColor;
                    ctx.fillText(text, x, y - 12);

                    ctx.shadowColor = 'transparent';
                });
            });
        }
    } : null;

    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: currentMetric2 ? true : false,
                    position: 'top'
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            const metric = context.datasetIndex === 0 ? metric1 : metric2;
                            let label = metric.name + ': ';
                            label += context.parsed.y.toFixed(2) + ' ' + metric.unit;
                            return label;
                        },
                        afterLabel: function(context) {
                            if (currentScale === 'week' && aggregated[context.dataIndex]) {
                                return `(${aggregated[context.dataIndex].count} Werte)`;
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + ' ' + metric1.unit;
                        }
                    }
                },
                y1: currentMetric2 ? {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: false,
                    grid: {
                        drawOnChartArea: false,
                        drawBorder: false
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + ' ' + metric2.unit;
                        }
                    }
                } : undefined,
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        maxRotation: currentScale === 'day' ? 45 : 0,
                        minRotation: currentScale === 'day' ? 45 : 0
                    }
                }
            }
        }
    };

    // Remove y1 scale if not needed
    if (!currentMetric2) {
        delete chartConfig.options.scales.y1;
    }

    // Add data labels plugin only for week/month view
    const finalConfig = dataLabelsPlugin ? {
        ...chartConfig,
        plugins: [dataLabelsPlugin]
    } : chartConfig;

    chart = new Chart(ctx, finalConfig);
    loading.classList.add('hidden');
}

// ── Tab switching ──
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

// Start
init();
