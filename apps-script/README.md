# Lighthouse 스프레드시트 버전 (Google Apps Script)

PageSpeed Insights API를 사용하여 Google Spreadsheet에서 Lighthouse 성능을 측정합니다.

## 특징

- **API 키 불필요**: PageSpeed Insights API는 무료로 사용 가능
- **스프레드시트 통합**: 결과가 바로 시트에 기록됨
- **자동 통계 계산**: 평균, 표준편차, 최소/최대 자동 계산
- **시각적 피드백**: 점수에 따른 색상 표시 (초록/노랑/빨강)

## 설치 방법

### 1. Google Spreadsheet 생성
1. [Google Sheets](https://sheets.google.com) 접속
2. 새 스프레드시트 생성

### 2. Apps Script 열기
1. 메뉴: **확장 프로그램** > **Apps Script** 클릭
2. 기존 코드 전체 삭제

### 3. 코드 붙여넣기
1. `Code.gs` 파일의 내용 전체 복사
2. Apps Script 에디터에 붙여넣기
3. **저장** (Ctrl+S 또는 💾 아이콘)

### 4. 권한 승인
1. 스프레드시트로 돌아가서 새로고침 (F5)
2. 메뉴에 **🚀 Lighthouse** 가 나타남
3. 처음 실행 시 권한 승인 필요:
   - "이 앱은 확인되지 않았습니다" → **고급** → **{프로젝트명}(으)로 이동**
   - 권한 허용

## 사용법

### 1. URL 시트 초기화
```
메뉴: 🚀 Lighthouse > 📋 URL 시트 초기화
```
- `URLs` 시트가 생성됨
- 기본 URL 예시가 입력됨

### 2. URL 편집
- `URLs` 시트의 A열에 측정할 URL 입력
- URL은 `http://` 또는 `https://`로 시작해야 함

### 3. 측정 시작
```
메뉴: 🚀 Lighthouse > 📊 측정 시작
```
- 확인 다이얼로그에서 "예" 클릭
- 측정 진행 상황이 토스트로 표시됨

### 4. 결과 확인
- **Results 시트**: 개별 측정 결과
- **Summary 시트**: URL별 통계 요약

## 설정 변경

`Code.gs` 상단의 `CONFIG` 객체 수정:

```javascript
const CONFIG = {
  RUNS_PER_URL: 1,           // URL당 측정 횟수 (늘리면 시간 증가)
  MAX_RETRIES: 2,            // 실패 시 재시도 횟수
  STRATEGY: 'desktop',       // 'desktop' 또는 'mobile'
  CATEGORY: 'performance',   // 측정 카테고리
  // ...
};
```

### 모바일 측정으로 변경
```javascript
STRATEGY: 'mobile',
```

### 반복 측정 (편차 확인용)
```javascript
RUNS_PER_URL: 5,  // 5회 반복 측정
```

## 결과 시트 구조

### Results 시트
| URL | Run | Time | Score | LCP | INP | CLS | TBT | FCP | SI | Status |
|-----|-----|------|-------|-----|-----|-----|-----|-----|----|----|
| https://example.com | 1 | 2024-... | 85 | 1200 | 50 | 0.05 | 150 | 800 | 1100 | ✅ |

### Summary 시트
| URL | Runs | Success | Avg Score | Min | Max | StdDev | Avg LCP | Avg TBT | Avg CLS |
|-----|------|---------|-----------|-----|-----|--------|---------|---------|---------|
| https://example.com | 5 | 5 | 85.2 | 82 | 89 | 2.5 | 1180ms | 145ms | 0.048 |

## 점수 색상

| 점수 범위 | 색상 | 의미 |
|-----------|------|------|
| 90-100 | 🟢 초록 | Good |
| 50-89 | 🟡 노랑 | Needs Improvement |
| 0-49 | 🔴 빨강 | Poor |

## 제한 사항

### API 제한
- PageSpeed Insights API: 하루 약 25,000회 무료
- 실제로는 분당 요청 수 제한이 있음 (자동으로 2초 딜레이 추가됨)

### 측정 시간
- URL당 약 20-30초 소요
- 4 URL × 1회 = 약 2분
- 4 URL × 10회 = 약 20분

### Apps Script 제한
- 스크립트 실행 시간: 최대 6분
- 많은 URL이나 반복이 필요하면 나눠서 실행

## 문제 해결

### "이 앱은 확인되지 않았습니다" 오류
→ **고급** > **{프로젝트명}(으)로 이동** 클릭

### "URL을 가져올 수 없습니다" 오류
→ URL이 올바른지, 접근 가능한지 확인

### 측정이 느림
→ PageSpeed Insights API 특성상 정상. 측정당 20-30초 소요

### 시간 초과 오류
→ URL 수를 줄이거나 RUNS_PER_URL을 낮춤

## Node.js 버전과 비교

| 항목 | Node.js (measure.js) | Apps Script |
|------|---------------------|-------------|
| 실행 환경 | 로컬 | Google 서버 |
| Chrome | 로컬 headless | PageSpeed Insights |
| Throttling | 직접 설정 가능 | API 기본값 |
| 속도 | 빠름 | 느림 (API 호출) |
| 설정 | 외부 파일 | 코드 내 상수 |
| 결과 저장 | JSON 파일 | 스프레드시트 |

## 라이선스

MIT
