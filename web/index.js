// Global data
let data = null;
let currentSort = 'default';

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const mainEl = document.getElementById('main');
const urlSelect = document.getElementById('urlSelect');
const kpiSection = document.getElementById('kpiSection');
const chartSection = document.getElementById('chartSection');
const tableSection = document.getElementById('tableSection');
const overviewSection = document.getElementById('overviewSection');

// Measure control elements
const measureBtn = document.getElementById('measureBtn');
const measureStatus = document.getElementById('measureStatus');
const statusOutput = document.getElementById('statusOutput');

let statusPollInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Setup measure button
  if (measureBtn) {
    measureBtn.addEventListener('click', startMeasurement);
  }

  try {
    const response = await fetch('./reports/data.json');
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
    }
    data = await response.json();
    renderDashboard();
  } catch (error) {
    showError(error.message);
  }
}

// Measurement functions
async function startMeasurement() {
  try {
    measureBtn.disabled = true;
    measureBtn.classList.add('running');
    measureBtn.querySelector('.btn-icon').textContent = '◉';
    measureBtn.querySelector('.btn-text').textContent = '측정 중...';

    measureStatus.style.display = 'block';
    updateStatusUI('running', '측정 시작 중...', []);

    const response = await fetch('/api/measure', { method: 'POST' });
    const result = await response.json();

    if (!result.success) {
      updateStatusUI('error', result.message, []);
      resetMeasureButton();
      return;
    }

    // Start polling for status
    statusPollInterval = setInterval(pollMeasureStatus, 1000);

  } catch (error) {
    updateStatusUI('error', `오류: ${error.message}`, []);
    resetMeasureButton();
  }
}

async function pollMeasureStatus() {
  try {
    const response = await fetch('/api/measure/status');
    const status = await response.json();

    if (status.running) {
      updateStatusUI('running', '측정 진행 중...', status.output);
    } else {
      clearInterval(statusPollInterval);
      statusPollInterval = null;

      if (status.error) {
        updateStatusUI('error', `오류: ${status.error}`, status.output);
      } else {
        updateStatusUI('completed', '측정 완료!', status.output);
        // Reload data after completion
        setTimeout(reloadData, 1000);
      }

      resetMeasureButton();
    }
  } catch (error) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
    updateStatusUI('error', `상태 확인 오류: ${error.message}`, []);
    resetMeasureButton();
  }
}

function updateStatusUI(state, text, output) {
  const indicator = measureStatus.querySelector('.status-indicator');
  const statusText = measureStatus.querySelector('.status-text');

  indicator.className = 'status-indicator ' + state;
  statusText.textContent = text;

  if (output && output.length > 0) {
    statusOutput.textContent = output.slice(-20).join('\n');
    statusOutput.scrollTop = statusOutput.scrollHeight;
  }
}

function resetMeasureButton() {
  measureBtn.disabled = false;
  measureBtn.classList.remove('running');
  measureBtn.querySelector('.btn-icon').textContent = '▶';
  measureBtn.querySelector('.btn-text').textContent = '측정 시작';
}

async function reloadData() {
  try {
    const response = await fetch('./reports/data.json?t=' + Date.now());
    if (response.ok) {
      data = await response.json();
      renderDashboard();
      updateStatusUI('completed', '측정 완료! 데이터가 새로고침되었습니다.', []);
    }
  } catch (error) {
    console.error('데이터 새로고침 실패:', error);
  }
}

function showError(message) {
  loadingEl.style.display = 'none';
  errorEl.style.display = 'block';
  errorEl.textContent = `Error: ${message}`;
}

function renderDashboard() {
  loadingEl.style.display = 'none';
  mainEl.style.display = 'block';

  // Meta info
  document.getElementById('measuredAt').textContent = formatDate(data.startedAt);
  document.getElementById('runsPerUrl').textContent = data.config.runsPerUrl;

  // Populate URL select
  populateUrlSelect();

  // Render overview
  renderOverview();

  // Setup sort buttons
  setupSortButtons();

  // Setup URL select change handler
  urlSelect.addEventListener('change', onUrlChange);
}

function populateUrlSelect() {
  const summaries = getSortedSummaries();

  urlSelect.innerHTML = '<option value="">-- Select URL --</option>';
  summaries.forEach(s => {
    const option = document.createElement('option');
    option.value = s.url;
    option.textContent = s.url;
    urlSelect.appendChild(option);
  });
}

function getSortedSummaries() {
  const summaries = [...data.summary];

  if (currentSort === 'lowScore') {
    summaries.sort((a, b) => (a.avg.performanceScore ?? 100) - (b.avg.performanceScore ?? 100));
  } else if (currentSort === 'highVariance') {
    summaries.sort((a, b) => (b.stddev.performanceScore ?? 0) - (a.stddev.performanceScore ?? 0));
  }

  return summaries;
}

function setupSortButtons() {
  const sortDefault = document.getElementById('sortDefault');
  const sortLowScore = document.getElementById('sortLowScore');
  const sortHighVariance = document.getElementById('sortHighVariance');

  const buttons = [sortDefault, sortLowScore, sortHighVariance];
  const sortTypes = ['default', 'lowScore', 'highVariance'];

  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = sortTypes[i];
      populateUrlSelect();
      renderOverview();
    });
  });
}

function onUrlChange() {
  const url = urlSelect.value;

  if (!url) {
    kpiSection.style.display = 'none';
    chartSection.style.display = 'none';
    tableSection.style.display = 'none';
    return;
  }

  const summary = data.summary.find(s => s.url === url);
  const runs = data.runs.filter(r => r.url === url);

  renderKPI(summary);
  renderChart(runs);
  renderTable(runs);

  kpiSection.style.display = 'block';
  chartSection.style.display = 'block';
  tableSection.style.display = 'block';
}

function renderKPI(summary) {
  const scoreEl = document.getElementById('kpiScore');
  const scoreRangeEl = document.getElementById('kpiScoreRange');

  if (summary.avg.performanceScore !== null) {
    scoreEl.textContent = summary.avg.performanceScore;
    scoreRangeEl.textContent = `Min: ${summary.min.performanceScore} / Max: ${summary.max.performanceScore} (±${summary.stddev.performanceScore})`;
  } else {
    scoreEl.textContent = '-';
    scoreRangeEl.textContent = 'No data';
  }

  // LCP
  document.getElementById('kpiLCP').textContent = summary.avg.LCP_ms !== null ? `${summary.avg.LCP_ms}ms` : '-';
  document.getElementById('kpiLCPStddev').textContent = summary.stddev.LCP_ms !== null ? `±${summary.stddev.LCP_ms}ms` : '-';

  // INP
  document.getElementById('kpiINP').textContent = summary.avg.INP_ms !== null ? `${summary.avg.INP_ms}ms` : '-';
  document.getElementById('kpiINPStddev').textContent = summary.stddev.INP_ms !== null ? `±${summary.stddev.INP_ms}ms` : '-';

  // CLS
  document.getElementById('kpiCLS').textContent = summary.avg.CLS !== null ? summary.avg.CLS : '-';
  document.getElementById('kpiCLSStddev').textContent = summary.stddev.CLS !== null ? `±${summary.stddev.CLS}` : '-';

  // TBT
  document.getElementById('kpiTBT').textContent = summary.avg.TBT_ms !== null ? `${summary.avg.TBT_ms}ms` : '-';
  document.getElementById('kpiTBTStddev').textContent = summary.stddev.TBT_ms !== null ? `±${summary.stddev.TBT_ms}ms` : '-';
}

function renderChart(runs) {
  const canvas = document.getElementById('scoreChart');
  const ctx = canvas.getContext('2d');

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const padding = { top: 30, right: 30, bottom: 40, left: 50 };
  const width = canvas.width - padding.left - padding.right;
  const height = canvas.height - padding.top - padding.bottom;

  // Get scores
  const scores = runs.map(r => r.performanceScore);
  const validScores = scores.filter(s => s !== null);

  if (validScores.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Y axis: 0-100
  const yMin = 0;
  const yMax = 100;

  // Draw grid
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 10; i++) {
    const y = padding.top + height - (i * height / 10);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + width, y);
    ctx.stroke();

    // Y labels
    if (i % 2 === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(i * 10, padding.left - 10, y + 4);
    }
  }

  // Draw X axis labels
  ctx.fillStyle = '#888';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';

  for (let i = 0; i < runs.length; i++) {
    const x = padding.left + (i + 0.5) * (width / runs.length);
    ctx.fillText(`Run ${i + 1}`, x, canvas.height - 10);
  }

  // Draw score line
  ctx.strokeStyle = '#667eea';
  ctx.lineWidth = 2;
  ctx.beginPath();

  let firstPoint = true;
  scores.forEach((score, i) => {
    if (score === null) return;

    const x = padding.left + (i + 0.5) * (width / runs.length);
    const y = padding.top + height - ((score - yMin) / (yMax - yMin)) * height;

    if (firstPoint) {
      ctx.moveTo(x, y);
      firstPoint = false;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Draw points
  scores.forEach((score, i) => {
    if (score === null) return;

    const x = padding.left + (i + 0.5) * (width / runs.length);
    const y = padding.top + height - ((score - yMin) / (yMax - yMin)) * height;

    // Point color based on score
    let color = '#ff4e42'; // poor
    if (score >= 90) color = '#0cce6b'; // good
    else if (score >= 50) color = '#ffa400'; // moderate

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Score label
    ctx.fillStyle = '#333';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(score, x, y - 12);
  });

  // Draw average line
  const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length;
  const avgY = padding.top + height - ((avg - yMin) / (yMax - yMin)) * height;

  ctx.strokeStyle = '#764ba2';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(padding.left, avgY);
  ctx.lineTo(padding.left + width, avgY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Average label
  ctx.fillStyle = '#764ba2';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Avg: ${avg.toFixed(1)}`, padding.left + width + 5, avgY + 4);
}

function renderTable(runs) {
  const tbody = document.getElementById('resultsBody');
  tbody.innerHTML = '';

  runs.forEach(run => {
    const tr = document.createElement('tr');

    if (run.performanceScore === null) {
      tr.innerHTML = `
        <td>${run.runIndex}</td>
        <td colspan="5" class="failed">Failed: ${run.error || 'Unknown error'}</td>
        <td>-</td>
      `;
    } else {
      const scoreClass = getScoreClass(run.performanceScore);
      tr.innerHTML = `
        <td>${run.runIndex}</td>
        <td class="${scoreClass}">${run.performanceScore}</td>
        <td>${formatMetric(run.metrics.LCP_ms)}</td>
        <td>${formatMetric(run.metrics.INP_ms)}</td>
        <td>${run.metrics.CLS !== null ? run.metrics.CLS.toFixed(3) : '-'}</td>
        <td>${formatMetric(run.metrics.TBT_ms)}</td>
        <td>${run.rawFile ? `<a href="reports/${run.rawFile}" target="_blank">View</a>` : '-'}</td>
      `;
    }

    tbody.appendChild(tr);
  });
}

function renderOverview() {
  const tbody = document.getElementById('overviewBody');
  tbody.innerHTML = '';

  const summaries = getSortedSummaries();

  summaries.forEach(s => {
    const tr = document.createElement('tr');
    const scoreClass = getScoreClass(s.avg.performanceScore);

    tr.innerHTML = `
      <td title="${s.url}">${s.url}</td>
      <td class="${scoreClass}">${s.avg.performanceScore ?? '-'}</td>
      <td>${s.min.performanceScore ?? '-'} - ${s.max.performanceScore ?? '-'}</td>
      <td>${s.avg.LCP_ms !== null ? `${s.avg.LCP_ms}ms` : '-'}</td>
      <td>${s.avg.TBT_ms !== null ? `${s.avg.TBT_ms}ms` : '-'}</td>
      <td>${s.successfulRuns}/${s.runs}</td>
    `;

    // Click to select
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      urlSelect.value = s.url;
      onUrlChange();
      urlSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    tbody.appendChild(tr);
  });
}

// Helpers
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMetric(value) {
  if (value === null || value === undefined) return '-';
  return Math.round(value);
}

function getScoreClass(score) {
  if (score === null) return '';
  if (score >= 90) return 'score-good';
  if (score >= 50) return 'score-moderate';
  return 'score-poor';
}
