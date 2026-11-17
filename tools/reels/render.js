#!/usr/bin/env node
/* 릴스 HTML 을 1080×1920 MP4 로 뽑는다.
   쓰는 법 :  node render.js know-template.html 결과.mp4 [길이초]
   필요한 것 : playwright, ffmpeg (둘 다 클라우드 세션에 이미 있다) */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const HTML = process.argv[2] || 'know-template.html';
const OUT  = process.argv[3] || 'reel.mp4';
const SEC  = Number(process.argv[4] || 15);
const FPS  = 30;
const HERE = __dirname;
const TMP  = fs.mkdtempSync(path.join(require('os').tmpdir(), 'reel-'));

/* 글꼴 : tools/fonts/fonts.css 의 상대 경로를 절대 경로로 바꿔 옆에 둔다.
   이렇게 안 하면 캔버스·영상 어느 쪽이든 조용히 시스템 글꼴로 떨어진다. */
const css = fs.readFileSync(path.join(HERE, '..', 'fonts', 'fonts.css'), 'utf8')
  .replace(/\.\/fonts\//g, 'file://' + path.join(HERE, '..', 'fonts') + '/');
fs.writeFileSync(path.join(HERE, '_fonts.css'), css);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  await p.goto('file://' + path.join(HERE, HTML));
  await p.evaluate(async () => {
    const text = document.body.innerText.replace(/\s+/g, '');
    await Promise.all([
      document.fonts.load('400 104px "Jua"', text),
      document.fonts.load('400 58px "Gowun Dodum"', text)
    ].map(q => q.catch(() => {})));
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => i.onload = r)));
  });
  await p.waitForTimeout(1200);

  const N = FPS * SEC;
  for (let f = 0; f < N; f++) {
    await p.evaluate(t => seek(t), f / FPS);
    await p.screenshot({ path: path.join(TMP, 'f' + String(f).padStart(4, '0') + '.png') });
  }
  await b.close();
  if (errs.length) { console.error('오류:', errs.join(' | ')); process.exit(1); }

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS),
    '-i', path.join(TMP, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'slow', '-crf', '19', '-movflags', '+faststart', path.join(HERE, OUT)],
    { stdio: 'inherit' });
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(OUT, '·', SEC + '초 ·', (fs.statSync(path.join(HERE, OUT)).size / 1024 / 1024).toFixed(2) + 'MB');
})();
