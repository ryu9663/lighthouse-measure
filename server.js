import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4500;

// JSON 파싱 미들웨어
app.use(express.json());

// 측정 진행 상태
let measurementStatus = {
  running: false,
  output: [],
  startedAt: null,
  completedAt: null,
  error: null
};

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'web')));

// 측정 시작 API
app.post('/api/measure', (req, res) => {
  if (measurementStatus.running) {
    return res.status(409).json({
      success: false,
      message: '측정이 이미 진행 중입니다.'
    });
  }

  // url (단일) 또는 urls (배열) 지원
  const customUrl = req.body?.url;
  const customUrls = req.body?.urls;

  // 상태 초기화
  measurementStatus = {
    running: true,
    output: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null
  };

  // measure.js 실행 (커스텀 URL이 있으면 인자로 전달)
  const args = ['measure.js'];
  if (customUrls && Array.isArray(customUrls) && customUrls.length > 0) {
    // 배열로 전달된 URL들 (콤마로 구분)
    args.push('--urls', customUrls.join(','));
  } else if (customUrl) {
    // 단일 URL (하위 호환)
    args.push('--url', customUrl);
  }

  const child = spawn('node', args, {
    cwd: __dirname
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    measurementStatus.output.push(...lines);
    console.log(data.toString());
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    measurementStatus.output.push(...lines);
    console.error(data.toString());
  });

  child.on('close', (code) => {
    measurementStatus.running = false;
    measurementStatus.completedAt = new Date().toISOString();
    if (code !== 0) {
      measurementStatus.error = `프로세스가 코드 ${code}로 종료되었습니다.`;
    }
    console.log(`측정 완료 (exit code: ${code})`);
  });

  child.on('error', (err) => {
    measurementStatus.running = false;
    measurementStatus.completedAt = new Date().toISOString();
    measurementStatus.error = err.message;
    console.error('측정 실행 오류:', err);
  });

  res.json({
    success: true,
    message: '측정이 시작되었습니다.'
  });
});

// 측정 상태 확인 API
app.get('/api/measure/status', (_req, res) => {
  res.json(measurementStatus);
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`\n🚀 Lighthouse Dashboard Server`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n   측정 버튼을 클릭하여 Lighthouse 측정을 시작하세요.\n`);
});
