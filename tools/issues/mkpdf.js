const {chromium}=require('playwright');
const file=process.argv[2], out=process.argv[3];
(async()=>{
  const b=await chromium.launch({args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:1400,height:1100}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:8899/tools/kids-weekly.html',{waitUntil:'load'});
  await p.waitForTimeout(2500);
  const ok=await p.evaluate(async f=>{
    const r=await fetch('./issues/'+f); if(!r.ok) return 'fetch '+r.status;
    const o=await r.json();
    if(typeof applyIssue!=='function') return 'applyIssue 없음';
    applyIssue(o); return 'ok';
  }, file).catch(e=>'eval: '+e.message);
  console.log('원고 적용:', ok);
  await p.waitForTimeout(4000);
  await p.evaluate(()=>document.querySelectorAll('.page').forEach(e=>e.classList.remove('skip')));
  await p.waitForTimeout(1500);
  const pages=await p.locator('.page').count();
  console.log('쪽 수:', pages);
  await p.pdf({path:out, format:'A4', printBackground:true, margin:{top:0,right:0,bottom:0,left:0}});
  console.log('오류:', errs.length?errs.slice(0,3):'none');
  await b.close();
})();
