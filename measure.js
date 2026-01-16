import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const RUNS_PER_URL = 1;
const MAX_RETRIES = 2;

// Lighthouse options (throttling 제거 - 실제 네트워크/CPU 성능으로 측정)
const lighthouseOptions = {
  logLevel: 'error',
  output: 'json',
  onlyCategories: ['performance'],
  formFactor: 'desktop',
  screenEmulation: {
    mobile: false,
    width: 1350,
    height: 940,
    deviceScaleFactor: 1,
    disabled: false
  },
  throttlingMethod: 'provided',
  throttling: {
    rttMs: 0,
    throughputKbps: 0,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0
  }
};

// Helper: Convert URL to safe filename
function urlToFilename(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[\/\?&=:]/g, '_')
    .replace(/_+/g, '_')
    .replace(/_$/, '');
}

// Helper: Calculate statistics
function calculateStats(values) {
  const validValues = values.filter(v => v !== null && v !== undefined);
  if (validValues.length === 0) {
    return { avg: null, stddev: null, min: null, max: null };
  }

  const sum = validValues.reduce((a, b) => a + b, 0);
  const avg = sum / validValues.length;

  const squaredDiffs = validValues.map(v => Math.pow(v - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / validValues.length;
  const stddev = Math.sqrt(avgSquaredDiff);

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);

  return { avg, stddev, min, max };
}

// Run Lighthouse for a single URL
async function runLighthouse(url, chrome) {
  const result = await lighthouse(url, {
    ...lighthouseOptions,
    port: chrome.port
  });

  return result;
}

// Measure a URL with retries
async function measureUrl(url, runIndex, chrome) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`    Retry attempt ${attempt}/${MAX_RETRIES}...`);
      }

      const result = await runLighthouse(url, chrome);
      const lhr = result.lhr;

      const performanceScore = Math.round(lhr.categories.performance.score * 100);
      const metrics = {
        LCP_ms: lhr.audits['largest-contentful-paint']?.numericValue || null,
        INP_ms: lhr.audits['interaction-to-next-paint']?.numericValue || null,
        CLS: lhr.audits['cumulative-layout-shift']?.numericValue || null,
        TBT_ms: lhr.audits['total-blocking-time']?.numericValue || null,
        FCP_ms: lhr.audits['first-contentful-paint']?.numericValue || null,
        SI_ms: lhr.audits['speed-index']?.numericValue || null
      };

      return {
        success: true,
        performanceScore,
        metrics,
        fetchedAt: lhr.fetchTime,
        rawReport: result.report
      };
    } catch (error) {
      lastError = error;
      console.log(`    Error: ${error.message}`);
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error'
  };
}

// Main measurement function
async function main() {
  console.log('Lighthouse Performance Measurement Tool');
  console.log('======================================\n');

  // Load URLs
  const urlsPath = path.join(__dirname, 'urls.json');
  const urls = JSON.parse(fs.readFileSync(urlsPath, 'utf-8'));

  console.log(`URLs to measure: ${urls.length}`);
  console.log(`Runs per URL: ${RUNS_PER_URL}`);
  console.log(`Total runs: ${urls.length * RUNS_PER_URL}\n`);

  // Ensure directories exist
  const rawDir = path.join(__dirname, 'web', 'reports', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  // Launch Chrome
  console.log('Launching Chrome...');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
  });
  console.log(`Chrome launched on port ${chrome.port}\n`);

  const startedAt = new Date().toISOString();
  const allRuns = [];

  try {
    // Measure each URL
    for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
      const url = urls[urlIndex];
      const urlFilename = urlToFilename(url);

      console.log(`[${urlIndex + 1}/${urls.length}] Measuring: ${url}`);

      for (let runIndex = 1; runIndex <= RUNS_PER_URL; runIndex++) {
        process.stdout.write(`  Run ${runIndex}/${RUNS_PER_URL}... `);

        const result = await measureUrl(url, runIndex, chrome);

        if (result.success) {
          // Save raw report
          const rawFilename = `${urlFilename}_run${runIndex}.json`;
          const rawPath = path.join(rawDir, rawFilename);
          fs.writeFileSync(rawPath, result.rawReport);

          allRuns.push({
            url,
            runIndex,
            fetchedAt: result.fetchedAt,
            performanceScore: result.performanceScore,
            metrics: result.metrics,
            rawFile: `raw/${rawFilename}`
          });

          console.log(`Score: ${result.performanceScore}`);
        } else {
          allRuns.push({
            url,
            runIndex,
            fetchedAt: new Date().toISOString(),
            performanceScore: null,
            metrics: null,
            rawFile: null,
            error: result.error
          });

          console.log(`Failed: ${result.error}`);
        }
      }

      console.log('');
    }
  } finally {
    // Always close Chrome
    await chrome.kill();
    console.log('Chrome closed.\n');
  }

  // Calculate summaries
  console.log('Calculating statistics...');
  const summaries = urls.map(url => {
    const urlRuns = allRuns.filter(r => r.url === url);
    const validRuns = urlRuns.filter(r => r.performanceScore !== null);

    const scores = validRuns.map(r => r.performanceScore);
    const lcpValues = validRuns.map(r => r.metrics?.LCP_ms).filter(v => v != null);
    const inpValues = validRuns.map(r => r.metrics?.INP_ms).filter(v => v != null);
    const clsValues = validRuns.map(r => r.metrics?.CLS).filter(v => v != null);
    const tbtValues = validRuns.map(r => r.metrics?.TBT_ms).filter(v => v != null);

    const scoreStats = calculateStats(scores);
    const lcpStats = calculateStats(lcpValues);
    const inpStats = calculateStats(inpValues);
    const clsStats = calculateStats(clsValues);
    const tbtStats = calculateStats(tbtValues);

    return {
      url,
      runs: urlRuns.length,
      successfulRuns: validRuns.length,
      avg: {
        performanceScore: scoreStats.avg !== null ? Math.round(scoreStats.avg * 10) / 10 : null,
        LCP_ms: lcpStats.avg !== null ? Math.round(lcpStats.avg) : null,
        INP_ms: inpStats.avg !== null ? Math.round(inpStats.avg) : null,
        CLS: clsStats.avg !== null ? Math.round(clsStats.avg * 1000) / 1000 : null,
        TBT_ms: tbtStats.avg !== null ? Math.round(tbtStats.avg) : null
      },
      stddev: {
        performanceScore: scoreStats.stddev !== null ? Math.round(scoreStats.stddev * 10) / 10 : null,
        LCP_ms: lcpStats.stddev !== null ? Math.round(lcpStats.stddev) : null,
        INP_ms: inpStats.stddev !== null ? Math.round(inpStats.stddev) : null,
        CLS: clsStats.stddev !== null ? Math.round(clsStats.stddev * 1000) / 1000 : null,
        TBT_ms: tbtStats.stddev !== null ? Math.round(tbtStats.stddev) : null
      },
      min: {
        performanceScore: scoreStats.min
      },
      max: {
        performanceScore: scoreStats.max
      }
    };
  });

  // Build final data.json
  const data = {
    startedAt,
    config: {
      urls,
      runsPerUrl: RUNS_PER_URL,
      throttling: lighthouseOptions.throttling,
      throttlingMethod: lighthouseOptions.throttlingMethod,
      categories: ['performance']
    },
    summary: summaries,
    runs: allRuns
  };

  // Write data.json
  const dataPath = path.join(__dirname, 'web', 'reports', 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

  console.log('\nResults saved to web/reports/data.json');
  console.log(`Raw reports saved to web/reports/raw/ (${allRuns.filter(r => r.rawFile).length} files)`);

  // Print summary
  console.log('\n=== Summary ===');
  for (const summary of summaries) {
    console.log(`\n${summary.url}`);
    console.log(`  Successful runs: ${summary.successfulRuns}/${summary.runs}`);
    if (summary.avg.performanceScore !== null) {
      console.log(`  Performance: ${summary.avg.performanceScore} (±${summary.stddev.performanceScore})`);
      console.log(`  LCP: ${summary.avg.LCP_ms}ms, TBT: ${summary.avg.TBT_ms}ms, CLS: ${summary.avg.CLS}`);
    }
  }

  console.log('\nDone! Run "npm run serve" to view the dashboard.');
}

main().catch(console.error);
