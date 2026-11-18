#!/usr/bin/env node
/* 큐레이션한 자료로 정보형 릴스를 만든다.
   쓰는 법 :  node make-info.js data/2026-11-18-reading-speed.json [출력폴더] */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs=require('fs'), path=require('path'), os=require('os');
const HERE=__dirname, TOOLS=path.join(HERE,'..');
const FPS=30, SEC=20;
const DATA=process.argv[2];
if(!DATA){ console.error('쓰는 법: node make-info.js data/<파일>.json [출력폴더]'); process.exit(1); }
const OUTDIR=path.resolve(process.argv[3] || path.join(HERE,'out'));

fs.writeFileSync(path.join(HERE,'_fonts.css'),
  fs.readFileSync(path.join(TOOLS,'fonts','fonts.css'),'utf8')
    .replace(/\.\/fonts\//g,'file://'+path.join(TOOLS,'fonts')+'/'));

const data=JSON.parse(fs.readFileSync(path.resolve(DATA),'utf8'));
(async()=>{
  fs.mkdirSync(OUTDIR,{recursive:true});
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('file://'+path.join(HERE,'info.html'));
  await p.evaluate(d=>buildDOM(d), data);
  await p.evaluate(async()=>{
    const t=document.body.innerText.replace(/\s+/g,'');
    await Promise.all([document.fonts.load('400 96px "Jua"',t),
                       document.fonts.load('400 52px "Gowun Dodum"',t)].map(q=>q.catch(()=>{})));
    await document.fonts.ready;
  });
  await p.waitForTimeout(1400);
  const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'info-'));
  const N=Math.round(FPS*SEC);
  for(let f=0; f<N; f++){
    await p.evaluate(t=>seek(t), f/FPS);
    await p.screenshot({path:path.join(TMP,'f'+String(f).padStart(4,'0')+'.png')});
  }
  await p.close(); await b.close();
  if(errs.length) console.error('⚠', errs.join(' | '));
  const out=path.join(OUTDIR, (data.slug||'info')+'.mp4');
  execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',String(FPS),
    '-i',path.join(TMP,'f%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p',
    '-preset','slow','-crf','19','-movflags','+faststart',out],{stdio:'inherit'});
  fs.rmSync(TMP,{recursive:true,force:true});
  console.log('✓', path.basename(out), '·', (fs.statSync(out).size/1024/1024).toFixed(2)+'MB');
})();
