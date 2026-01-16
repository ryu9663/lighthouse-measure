# Lighthouse 랜딩페이지 벤치마크 자동화 + 정적 대시보드

## 목적
- 회사 랜딩페이지 여러 개(현재 4개, 향후 확장)를 **Lighthouse로 자동 측정**한다.
- **URL별 측정**(기본 1회, 설정 변경 가능)을 수행하고, 각 run 결과 + 통계(평균/표준편차/최소/최대)를 산출한다.
- 결과를 **정적 웹 대시보드(index.html/css/js)**에서 바로 확인한다.
- Google Spreadsheet / API Key 같은 외부 인증 의존은 사용하지 않는다.

## 측정 대상 URL
- 설정 파일: `urls.json`
- 현재 URL 목록:
  - https://codingvalley.com
  - https://codingvalley.com/ldm/6
  - https://codingvalley.com/ldm/7
  - https://codingvalley.com/ldm/9
  - https://codingvalley.com/new-page
  - https://toss.im/
- 확장 방식: `urls.json`에 URL을 추가하면 자동으로 측정 및 대시보드 반영

## 측정 조건
- Lighthouse 카테고리: **Performance만**
- Network: **제약 없음** (실제 네트워크 속도로 측정)
- CPU: **제약 없음** (실제 CPU 성능으로 측정)
- Throttling method: **provided** (throttling 비활성화)
- 반복 횟수: URL당 1회 (measure.js의 `RUNS_PER_URL` 상수로 변경 가능)
- 재시도: 실패 시 최대 2회 재시도 (`MAX_RETRIES`)
- 실행 모드: headless Chrome 사용

## 프로젝트 구조
```
measure-lighthouse/
├── package.json          # 의존성 및 npm scripts
├── measure.js            # 측정 스크립트 (Lighthouse Node API)
├── server.js             # Express 서버 (대시보드 + 측정 API)
├── urls.json             # URL 목록
├── CLAUDE.md             # 프로젝트 문서
└── web/
    ├── index.html        # 대시보드 HTML
    ├── index.css         # 대시보드 스타일
    ├── index.js          # 대시보드 로직
    └── reports/
        ├── data.json     # 집계 결과
        └── raw/          # Lighthouse JSON 리포트
```

## 산출물(Outputs)
### 1) Raw Lighthouse reports
- 각 URL/run에 대해 Lighthouse JSON 리포트를 `web/reports/raw/`에 저장
- 파일명 형식: `{url안전문자열}_run{index}.json`

### 2) Aggregated data
- `web/reports/data.json` (대시보드가 fetch로 읽는 단일 파일)
- 포함 내용:
  - 전체 실행 메타데이터(시작시간, 설정, URL 목록, run 횟수)
  - URL별 summary (avg/stddev/min/max)
  - run별 상세 결과 배열

## 데이터 스키마
### data.json 상위 구조
```javascript
{
  startedAt: string,           // ISO timestamp
  config: {
    urls: string[],
    runsPerUrl: number,        // 기본값 1
    throttling: {              // 모두 0 = throttling 비활성화
      rttMs: 0,
      throughputKbps: 0,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0
    },
    throttlingMethod: "provided",
    categories: ["performance"]
  },
  summary: UrlSummary[],
  runs: RunResult[]
}
```

### RunResult
```javascript
{
  url: string,
  runIndex: number,
  fetchedAt: string,           // Lighthouse fetchTime
  performanceScore: number,    // 0~100
  metrics: {
    LCP_ms: number,
    INP_ms: number,
    CLS: number,
    TBT_ms: number,
    FCP_ms: number,
    SI_ms: number
  },
  rawFile: string              // raw json 상대경로
}
```

### UrlSummary
```javascript
{
  url: string,
  runs: number,
  successfulRuns: number,
  avg: {
    performanceScore: number,
    LCP_ms: number,
    INP_ms: number,
    CLS: number,
    TBT_ms: number
  },
  stddev: { /* 동일 구조 */ },
  min: { performanceScore: number },
  max: { performanceScore: number }
}
```

## 측정 스크립트 (measure.js)
- Lighthouse Node API 사용
- URL별 순차 실행 (리소스 경합 방지)
- 실패 시 최대 2회 재시도 후 null로 기록
- 통계 계산 시 null 값 제외

### 설정 변경
```javascript
// measure.js 상단
const RUNS_PER_URL = 1;    // 반복 횟수 변경
const MAX_RETRIES = 2;     // 재시도 횟수 변경
```

## 대시보드 (web/)
- **순수 정적**: index.html, index.css, index.js
- 데이터 로딩: `fetch("./reports/data.json")`

### 기능
1. **측정 시작 버튼** - 대시보드에서 직접 `npm run measure` 실행
2. URL 선택 드롭다운
3. 정렬 옵션 (기본 / 낮은 점수 순 / 높은 편차 순)
4. KPI 카드
   - Performance Score (평균, 범위)
   - LCP, INP, CLS, TBT (평균, 표준편차)
5. Score 추이 그래프 (Canvas)
6. Run별 상세 테이블
7. 전체 URL Overview 테이블
8. Raw JSON 링크

### 점수 색상
- 90+ : 초록 (Good)
- 50-89 : 주황 (Moderate)
- 0-49 : 빨강 (Poor)

## 실행 방법
```bash
# 1. 의존성 설치
npm install

# 2. 대시보드 서버 실행
npm run serve

# 3. 브라우저에서 확인
open http://localhost:3000

# 4. 대시보드의 "측정 시작" 버튼 클릭 또는 CLI에서 직접 실행
npm run measure
```

### npm scripts
- `npm run serve` - Express 서버 실행 (대시보드 + 측정 API)
- `npm run measure` - CLI에서 직접 측정 실행
- `npm run serve:static` - 정적 파일만 서빙 (측정 버튼 비활성)

## 확장 방법
### URL 추가
`urls.json` 파일에 URL 추가:
```json
[
  "https://codingvalley.com",
  "https://codingvalley.com/ldm/6",
  "https://codingvalley.com/ldm/7",
  "https://codingvalley.com/ldm/9",
  "https://toss.im/"
]
```

### 반복 횟수 변경
`measure.js`에서 `RUNS_PER_URL` 값 수정

## 의존성
- lighthouse: ^12.0.0
- chrome-launcher: ^1.1.0
- express: ^4.18.2 (서버 + 측정 API)
- serve: ^14.2.0 (devDependency, 정적 서빙용)

## 완료 조건
- `npm run measure` 실행 시:
  - raw 리포트 생성 (URL 수 × RUNS_PER_URL)
  - `web/reports/data.json` 생성
- `npm run serve` 후 브라우저에서:
  - URL 선택 가능
  - KPI 카드 표시
  - run 결과 테이블 표시
  - raw 링크 동작
  - 정렬 기능 동작
