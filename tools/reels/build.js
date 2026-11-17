#!/usr/bin/env node
/* 한 호의 원고에서 하루치 릴스를 통째로 뽑는다.
   쓰는 법 :  node build.js 2026-11-23 [출력폴더]
   결과     :  <출력폴더>/<날짜>-<요일>.mp4 (1080×1920 · 15초) */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const WEEK = process.argv[2];
const OUTDIR = path.resolve(process.argv[3] || path.join(HEREish(), 'out'));
function HEREish(){ return __dirname; }
const HERE = __dirname, TOOLS = path.join(HERE, '..');
const FPS = 30, SEC = 15;
if(!WEEK){ console.error('쓰는 법: node build.js 2026-11-23 [출력폴더]'); process.exit(1); }

const CAT = {"기념일":"#f08c2e","인물":"#8b5cf6","사회":"#2f7fd1","정치":"#3b5f9e",
             "경제":"#2fa36b","과학":"#0f9b9b","문화":"#e35d8a","마음":"#dba400"};
const DOW = ['mon','tue','wed','thu','fri'];

/* 글꼴 경로를 절대 경로로 바꿔 템플릿 옆에 둔다 */
fs.writeFileSync(path.join(HERE,'_fonts.css'),
  fs.readFileSync(path.join(TOOLS,'fonts','fonts.css'),'utf8')
    .replace(/\.\/fonts\//g, 'file://'+path.join(TOOLS,'fonts')+'/'));

const issue = JSON.parse(fs.readFileSync(path.join(TOOLS,'issues',WEEK+'.json'),'utf8'));
const parts = s => String(s||'').split('|').map(x=>x.trim());
const rows  = s => String(s||'').split('\n').map(l=>l.trim()).filter(Boolean)
                   .map(l=>{ const i=l.lastIndexOf('|');
                             return i<0?{a:l,b:''}:{a:l.slice(0,i).trim(), b:l.slice(i+1).trim()}; });
const emph  = s => String(s||'').replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
/* "1859년" → {num:"1859", unit:"년"} */
const splitNum = s => { const m=/^([0-9][0-9,.]*)(.*)$/.exec(String(s).trim());
                        return m ? {num:m[1], unit:m[2].trim()} : {num:String(s), unit:''}; };

function dataFor(d, i){
  const color = CAT[d.cat] || '#f08c2e';
  const ns = rows(d.nums);
  const photo = d.photo ? 'file://'+path.join(TOOLS, d.photo) : null;
  const fit = (d.photo||'').endsWith('.svg') ? 'contain' : 'cover';
  const base = { cat:d.cat, catColor:color, photo, fit,
                 hook: hookOf(d) };
  /* 숫자가 둘 이상이면 숫자형, 아니면 어휘형 */
  if(ns.length >= 2){
    const a = splitNum(ns[0].a), b = splitNum(ns[1].a);
    const o = Object.assign({mode:'num'}, base,
      { a:{num:a.num, unit:a.unit, cap:ns[0].b}, b:{num:b.num, unit:b.unit, cap:ns[1].b} });
    o.line = { yr:'', text: emph(String(d.kicker||d.head)) };
    return o;
  }
  const id = parts(d.idiom);
  return Object.assign({mode:'word'}, base, {
    word:{ w:d.w, mean:String(d.m||'').replace(/\.$/,''), ex: emph(d.ex) },
    line:{ yr:'', text: emph(String(d.kicker||d.head)) },
    idiom:{ han:id[0]||'', read:id[1]||'', mean:String(id[2]||'').replace(/이에요\.$/,'') }
  });
}
function hookOf(d){
  const k=String(d.kicker||'').trim(), h=String(d.head||'').trim();
  return (k? k+'<br>' : '') + h;
}

(async()=>{
  fs.mkdirSync(OUTDIR,{recursive:true});
  const b = await chromium.launch();
  for(let i=0; i<issue.days.length; i++){
    const d = issue.days[i];
    if(!d.head) continue;
    const data = dataFor(d, i);
    const p = await b.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
    await p.goto('file://'+path.join(HERE,'reel.html'));
    await p.evaluate(d=>buildDOM(d), data);
    await p.evaluate(async()=>{
      const text=document.body.innerText.replace(/\s+/g,'');
      await Promise.all([document.fonts.load('400 360px "Jua"',text),
                         document.fonts.load('400 58px "Gowun Dodum"',text)].map(q=>q.catch(()=>{})));
      await document.fonts.ready;
      await Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>i.onload=r)));
    });
    await p.waitForTimeout(1400);

    const TMP = fs.mkdtempSync(path.join(os.tmpdir(),'reel-'));
    for(let f=0; f<FPS*SEC; f++){
      await p.evaluate(t=>seek(t), f/FPS);
      await p.screenshot({path:path.join(TMP,'f'+String(f).padStart(4,'0')+'.png')});
    }
    await p.close();
    if(errs.length) console.error('  ⚠', DOW[i], errs.join(' | '));

    const out = path.join(OUTDIR, WEEK+'-'+DOW[i]+'.mp4');
    execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',String(FPS),
      '-i',path.join(TMP,'f%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p',
      '-preset','slow','-crf','19','-movflags','+faststart',out],{stdio:'inherit'});
    fs.rmSync(TMP,{recursive:true,force:true});
    console.log('  ✓', path.basename(out), '·', data.mode==='num'?'숫자형':'어휘형',
                '·', (fs.statSync(out).size/1024/1024).toFixed(2)+'MB');
  }
  await b.close();
  console.log('끝. →', OUTDIR);
})();
