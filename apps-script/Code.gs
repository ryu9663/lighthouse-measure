/**
 * Lighthouse 랜딩페이지 벤치마크 - Google Apps Script 버전
 * PageSpeed Insights API를 사용하여 Lighthouse 성능 측정
 *
 * 사용법:
 * 1. Google Spreadsheet 생성
 * 2. 확장 프로그램 > Apps Script 열기
 * 3. 이 코드 붙여넣기
 * 4. 스프레드시트에서 "Lighthouse" 메뉴 사용
 */

// ============================================
// 설정
// ============================================
const CONFIG = {
  RUNS_PER_URL: 1,           // URL당 측정 횟수
  MAX_RETRIES: 2,            // 실패 시 재시도 횟수
  STRATEGY: 'desktop',       // 'desktop' 또는 'mobile'
  CATEGORY: 'performance',   // 측정 카테고리

  // 시트 이름
  SHEET_URLS: 'URLs',
  SHEET_RESULTS: 'Results',
  SHEET_SUMMARY: 'Summary',

  // PageSpeed Insights API (무료, API 키 불필요)
  API_URL: 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
};

// ============================================
// 메뉴 생성
// ============================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 Lighthouse')
    .addItem('📊 측정 시작', 'runMeasurement')
    .addItem('📋 URL 시트 초기화', 'initUrlSheet')
    .addItem('🗑️ 결과 초기화', 'clearResults')
    .addSeparator()
    .addItem('ℹ️ 사용법', 'showHelp')
    .addToUi();
}

// ============================================
// 초기화 함수
// ============================================
function initUrlSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_URLS);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_URLS);
  }

  // 헤더 설정
  sheet.getRange('A1').setValue('URL');
  sheet.getRange('A1').setFontWeight('bold');
  sheet.getRange('A1').setBackground('#4285f4');
  sheet.getRange('A1').setFontColor('white');

  // 기본 URL 예시
  const defaultUrls = [
    'https://codingvalley.com',
    'https://codingvalley.com/ldm/6',
    'https://codingvalley.com/ldm/7',
    'https://codingvalley.com/ldm/9'
  ];

  for (let i = 0; i < defaultUrls.length; i++) {
    sheet.getRange(i + 2, 1).setValue(defaultUrls[i]);
  }

  sheet.setColumnWidth(1, 400);

  SpreadsheetApp.getUi().alert('URL 시트가 초기화되었습니다.\nURL을 추가/수정한 후 "측정 시작"을 실행하세요.');
}

function clearResults() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const resultsSheet = ss.getSheetByName(CONFIG.SHEET_RESULTS);
  if (resultsSheet) {
    ss.deleteSheet(resultsSheet);
  }

  const summarySheet = ss.getSheetByName(CONFIG.SHEET_SUMMARY);
  if (summarySheet) {
    ss.deleteSheet(summarySheet);
  }

  SpreadsheetApp.getUi().alert('결과가 초기화되었습니다.');
}

// ============================================
// 메인 측정 함수
// ============================================
function runMeasurement() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // URL 시트 확인
  const urlSheet = ss.getSheetByName(CONFIG.SHEET_URLS);
  if (!urlSheet) {
    ui.alert('오류', 'URLs 시트가 없습니다. "URL 시트 초기화"를 먼저 실행하세요.', ui.ButtonSet.OK);
    return;
  }

  // URL 목록 가져오기
  const urls = getUrls(urlSheet);
  if (urls.length === 0) {
    ui.alert('오류', 'URLs 시트에 URL이 없습니다.', ui.ButtonSet.OK);
    return;
  }

  // 확인 다이얼로그
  const response = ui.alert(
    '측정 시작',
    `${urls.length}개 URL × ${CONFIG.RUNS_PER_URL}회 = 총 ${urls.length * CONFIG.RUNS_PER_URL}회 측정을 시작합니다.\n\n` +
    `전략: ${CONFIG.STRATEGY}\n` +
    `예상 소요 시간: 약 ${Math.ceil(urls.length * CONFIG.RUNS_PER_URL * 30 / 60)}분\n\n` +
    '계속하시겠습니까?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  // 결과 시트 준비
  const resultsSheet = prepareResultsSheet(ss);
  const summarySheet = prepareSummarySheet(ss);

  const startedAt = new Date().toISOString();
  const allRuns = [];

  // 측정 시작
  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const url = urls[urlIndex];

    for (let runIndex = 1; runIndex <= CONFIG.RUNS_PER_URL; runIndex++) {
      // 진행 상황 표시
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `측정 중: ${url}\n(${urlIndex * CONFIG.RUNS_PER_URL + runIndex}/${urls.length * CONFIG.RUNS_PER_URL})`,
        '🔄 진행 중',
        30
      );

      const result = measureUrl(url, runIndex);
      allRuns.push(result);

      // 결과 즉시 기록
      writeRunResult(resultsSheet, result, allRuns.length + 1);

      // API 속도 제한 방지
      if (runIndex < CONFIG.RUNS_PER_URL || urlIndex < urls.length - 1) {
        Utilities.sleep(2000);
      }
    }
  }

  // 요약 계산 및 기록
  const summaries = calculateSummaries(urls, allRuns);
  writeSummaries(summarySheet, summaries, startedAt);

  // 완료 알림
  ss.toast('측정이 완료되었습니다!', '✅ 완료', 10);
  ui.alert('측정 완료', `${allRuns.length}개 측정이 완료되었습니다.\nSummary 시트에서 결과를 확인하세요.`, ui.ButtonSet.OK);
}

// ============================================
// URL 처리
// ============================================
function getUrls(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const range = sheet.getRange(2, 1, lastRow - 1, 1);
  const values = range.getValues();

  return values
    .map(row => row[0])
    .filter(url => url && url.toString().trim().startsWith('http'));
}

// ============================================
// PageSpeed Insights API 호출
// ============================================
function measureUrl(url, runIndex) {
  let lastError = null;

  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const apiUrl = `${CONFIG.API_URL}?url=${encodeURIComponent(url)}&strategy=${CONFIG.STRATEGY}&category=${CONFIG.CATEGORY}`;

      const response = UrlFetchApp.fetch(apiUrl, {
        muteHttpExceptions: true
      });

      const responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        throw new Error(`API 오류: ${responseCode}`);
      }

      const data = JSON.parse(response.getContentText());
      const lighthouse = data.lighthouseResult;

      // 메트릭 추출
      const performanceScore = Math.round((lighthouse.categories.performance?.score || 0) * 100);
      const audits = lighthouse.audits;

      return {
        url: url,
        runIndex: runIndex,
        fetchedAt: new Date().toISOString(),
        success: true,
        performanceScore: performanceScore,
        metrics: {
          LCP_ms: audits['largest-contentful-paint']?.numericValue || null,
          INP_ms: audits['interaction-to-next-paint']?.numericValue || null,
          CLS: audits['cumulative-layout-shift']?.numericValue || null,
          TBT_ms: audits['total-blocking-time']?.numericValue || null,
          FCP_ms: audits['first-contentful-paint']?.numericValue || null,
          SI_ms: audits['speed-index']?.numericValue || null
        }
      };

    } catch (error) {
      lastError = error;
      Logger.log(`측정 실패 (${attempt + 1}/${CONFIG.MAX_RETRIES + 1}): ${url} - ${error.message}`);

      if (attempt < CONFIG.MAX_RETRIES) {
        Utilities.sleep(3000);
      }
    }
  }

  return {
    url: url,
    runIndex: runIndex,
    fetchedAt: new Date().toISOString(),
    success: false,
    performanceScore: null,
    metrics: {
      LCP_ms: null,
      INP_ms: null,
      CLS: null,
      TBT_ms: null,
      FCP_ms: null,
      SI_ms: null
    },
    error: lastError?.message || 'Unknown error'
  };
}

// ============================================
// 결과 시트 관리
// ============================================
function prepareResultsSheet(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEET_RESULTS);

  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(CONFIG.SHEET_RESULTS);
  }

  // 헤더
  const headers = ['URL', 'Run', 'Time', 'Score', 'LCP (ms)', 'INP (ms)', 'CLS', 'TBT (ms)', 'FCP (ms)', 'SI (ms)', 'Status'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // 헤더 스타일
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285f4');
  headerRange.setFontColor('white');

  // 열 너비
  sheet.setColumnWidth(1, 300);  // URL
  sheet.setColumnWidth(2, 50);   // Run
  sheet.setColumnWidth(3, 180);  // Time

  sheet.setFrozenRows(1);

  return sheet;
}

function writeRunResult(sheet, result, row) {
  const values = [
    result.url,
    result.runIndex,
    result.fetchedAt,
    result.performanceScore,
    result.metrics.LCP_ms ? Math.round(result.metrics.LCP_ms) : '',
    result.metrics.INP_ms ? Math.round(result.metrics.INP_ms) : '',
    result.metrics.CLS !== null ? result.metrics.CLS.toFixed(3) : '',
    result.metrics.TBT_ms ? Math.round(result.metrics.TBT_ms) : '',
    result.metrics.FCP_ms ? Math.round(result.metrics.FCP_ms) : '',
    result.metrics.SI_ms ? Math.round(result.metrics.SI_ms) : '',
    result.success ? '✅' : '❌ ' + (result.error || '')
  ];

  sheet.getRange(row, 1, 1, values.length).setValues([values]);

  // 점수 색상
  if (result.performanceScore !== null) {
    const scoreCell = sheet.getRange(row, 4);
    if (result.performanceScore >= 90) {
      scoreCell.setBackground('#d4edda');
      scoreCell.setFontColor('#155724');
    } else if (result.performanceScore >= 50) {
      scoreCell.setBackground('#fff3cd');
      scoreCell.setFontColor('#856404');
    } else {
      scoreCell.setBackground('#f8d7da');
      scoreCell.setFontColor('#721c24');
    }
  }
}

// ============================================
// 요약 시트 관리
// ============================================
function prepareSummarySheet(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEET_SUMMARY);

  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(CONFIG.SHEET_SUMMARY);
  }

  return sheet;
}

function writeSummaries(sheet, summaries, startedAt) {
  // 메타 정보
  sheet.getRange('A1').setValue('📊 Lighthouse 측정 결과');
  sheet.getRange('A1').setFontSize(16);
  sheet.getRange('A1').setFontWeight('bold');

  sheet.getRange('A2').setValue(`측정 시간: ${startedAt}`);
  sheet.getRange('A3').setValue(`전략: ${CONFIG.STRATEGY} | 반복: ${CONFIG.RUNS_PER_URL}회`);

  // 요약 테이블 헤더
  const headers = ['URL', 'Runs', 'Success', 'Avg Score', 'Min', 'Max', 'StdDev', 'Avg LCP', 'Avg TBT', 'Avg CLS'];
  sheet.getRange(5, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(5, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#34a853');
  headerRange.setFontColor('white');

  // 데이터 기록
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    const row = 6 + i;

    const values = [
      s.url,
      s.runs,
      s.successfulRuns,
      s.avg.performanceScore !== null ? s.avg.performanceScore.toFixed(1) : '-',
      s.min.performanceScore !== null ? s.min.performanceScore : '-',
      s.max.performanceScore !== null ? s.max.performanceScore : '-',
      s.stddev.performanceScore !== null ? s.stddev.performanceScore.toFixed(1) : '-',
      s.avg.LCP_ms !== null ? Math.round(s.avg.LCP_ms) + 'ms' : '-',
      s.avg.TBT_ms !== null ? Math.round(s.avg.TBT_ms) + 'ms' : '-',
      s.avg.CLS !== null ? s.avg.CLS.toFixed(3) : '-'
    ];

    sheet.getRange(row, 1, 1, values.length).setValues([values]);

    // 점수 색상
    if (s.avg.performanceScore !== null) {
      const scoreCell = sheet.getRange(row, 4);
      if (s.avg.performanceScore >= 90) {
        scoreCell.setBackground('#d4edda');
      } else if (s.avg.performanceScore >= 50) {
        scoreCell.setBackground('#fff3cd');
      } else {
        scoreCell.setBackground('#f8d7da');
      }
    }
  }

  // 열 너비
  sheet.setColumnWidth(1, 300);
  sheet.setFrozenRows(5);
}

// ============================================
// 통계 계산
// ============================================
function calculateSummaries(urls, allRuns) {
  return urls.map(url => {
    const urlRuns = allRuns.filter(r => r.url === url);
    const validRuns = urlRuns.filter(r => r.success && r.performanceScore !== null);

    const scores = validRuns.map(r => r.performanceScore);
    const lcpValues = validRuns.map(r => r.metrics.LCP_ms).filter(v => v !== null);
    const inpValues = validRuns.map(r => r.metrics.INP_ms).filter(v => v !== null);
    const clsValues = validRuns.map(r => r.metrics.CLS).filter(v => v !== null);
    const tbtValues = validRuns.map(r => r.metrics.TBT_ms).filter(v => v !== null);

    return {
      url: url,
      runs: urlRuns.length,
      successfulRuns: validRuns.length,
      avg: {
        performanceScore: calculateAvg(scores),
        LCP_ms: calculateAvg(lcpValues),
        INP_ms: calculateAvg(inpValues),
        CLS: calculateAvg(clsValues),
        TBT_ms: calculateAvg(tbtValues)
      },
      stddev: {
        performanceScore: calculateStdDev(scores),
        LCP_ms: calculateStdDev(lcpValues),
        INP_ms: calculateStdDev(inpValues),
        CLS: calculateStdDev(clsValues),
        TBT_ms: calculateStdDev(tbtValues)
      },
      min: {
        performanceScore: scores.length > 0 ? Math.min(...scores) : null
      },
      max: {
        performanceScore: scores.length > 0 ? Math.max(...scores) : null
      }
    };
  });
}

function calculateAvg(values) {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

function calculateStdDev(values) {
  if (values.length === 0) return null;
  const avg = calculateAvg(values);
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

// ============================================
// 도움말
// ============================================
function showHelp() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
      h2 { color: #4285f4; }
      code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
      .step { margin: 10px 0; padding: 10px; background: #f9f9f9; border-left: 3px solid #4285f4; }
    </style>
    <h2>🚀 Lighthouse 측정 도구 사용법</h2>

    <div class="step">
      <strong>1. URL 시트 초기화</strong><br>
      URLs 시트가 생성되고 기본 URL이 입력됩니다.
    </div>

    <div class="step">
      <strong>2. URL 수정</strong><br>
      URLs 시트에서 측정할 URL을 추가/수정하세요.
    </div>

    <div class="step">
      <strong>3. 측정 시작</strong><br>
      메뉴에서 "측정 시작"을 클릭하면 모든 URL을 순차적으로 측정합니다.
    </div>

    <div class="step">
      <strong>4. 결과 확인</strong><br>
      - <strong>Results</strong>: 개별 측정 결과<br>
      - <strong>Summary</strong>: URL별 통계 요약
    </div>

    <h3>📋 설정 변경</h3>
    <p>코드 상단의 <code>CONFIG</code> 객체에서 변경 가능:</p>
    <ul>
      <li><code>RUNS_PER_URL</code>: URL당 반복 횟수</li>
      <li><code>STRATEGY</code>: 'desktop' 또는 'mobile'</li>
    </ul>

    <h3>⚠️ 주의사항</h3>
    <ul>
      <li>PageSpeed Insights API는 속도 제한이 있습니다 (하루 약 25,000회)</li>
      <li>측정당 약 20-30초 소요됩니다</li>
      <li>측정 중 시트를 닫지 마세요</li>
    </ul>
  `)
    .setWidth(500)
    .setHeight(550);

  SpreadsheetApp.getUi().showModalDialog(html, 'Lighthouse 사용법');
}
