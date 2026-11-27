/* 사구회 — 데이터 저장 계층
 * 저장 위치를 자동으로 고른다.
 *   1) api.php 가 응답하면  → 나스의 data/ 폴더에 저장 (모든 회원이 같은 자료를 봄)
 *   2) 응답이 없으면        → 이 브라우저에만 저장 (혼자 쓰기 / 미리보기용)
 * 사진·영수증도 같은 규칙. 서버가 있으면 photos/, receipts/ 에 올라가고
 * 없으면 작게 줄인 이미지를 브라우저 안에 넣어 둔다.
 */
window.SG = (function () {
  var STORES = ['settings', 'members', 'rules', 'history', 'dues', 'expenses'];
  var LSK = 'sagoohoe:';
  var mode = 'local';
  var db = {};
  var dirty = {};
  var timer = null;

  var DEFAULTS = {
    settings: {
      monthlyDue: 50000,       // 월 회비
      kmPerLiter: 10,          // 자차 연비 기준 (회칙상 10km/L)
      fuelPrice: 1700,         // 유류비 단가 (원/L)
      startYear: 2006,         // 회비 기록 시작 연도
      chairman: '',            // 회장
      treasurer: '',           // 총무
      dueYearly: {}            // 연도별 월 회비 예외 { "2006": 30000 }
    },
    members: [],
    rules: { articles: [], history: [] },
    history: { meetings: [] },
    dues: { years: {} },
    expenses: { requests: [], seq: 0 }
  };

  /* ── 공통 ───────────────────────────────── */
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function uid(p) { return (p || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function merged(name, loaded) {
    var base = clone(DEFAULTS[name]);
    if (loaded === null || loaded === undefined) return base;
    if (Array.isArray(base)) return Array.isArray(loaded) ? loaded : base;
    if (typeof base === 'object' && typeof loaded === 'object') {
      for (var k in loaded) base[k] = loaded[k];
      return base;
    }
    return loaded;
  }

  /* ── 불러오기 ───────────────────────────── */
  async function ping() {
    try {
      var r = await fetch('api.php?ping=1', { cache: 'no-store' });
      if (!r.ok) return false;
      var j = await r.json();
      return !!(j && j.ok);
    } catch (e) { return false; }
  }

  async function fetchJson(url) {
    try {
      var r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  var seedPack = null;   // 브라우저 저장 모드에서 쓰는 초기 자료 (seed/seed.json)
  async function loadOne(name) {
    if (mode === 'server') {
      // 자료가 없으면 api.php 가 seed/seed.json 을 대신 심어 준다
      var j = await fetchJson('api.php?store=' + name);
      return merged(name, j && j.ok ? j.data : null);
    }
    var raw = null;
    try { raw = localStorage.getItem(LSK + name); } catch (e) { }
    if (raw) { try { return merged(name, JSON.parse(raw)); } catch (e) { } }
    // 브라우저가 비어 있으면 data/ 폴더, 그다음 seed/seed.json 을 본다
    var fromData = await fetchJson('data/' + name + '.json');
    if (fromData) return merged(name, fromData);
    if (seedPack === null) seedPack = (await fetchJson('seed/seed.json')) || {};
    return merged(name, seedPack[name]);
  }

  async function init() {
    mode = (await ping()) ? 'server' : 'local';
    var names = STORES.slice();
    var out = [];
    for (var i = 0; i < names.length; i++) out.push(await loadOne(names[i]));
    names.forEach(function (n, k) { db[n] = out[k]; });
    return mode;
  }

  /* ── 저장 ───────────────────────────────── */
  async function writeOne(name) {
    var data = db[name];
    if (mode === 'server') {
      var r = await fetch('api.php?store=' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var j = await r.json().catch(function () { return null; });
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || '저장 실패');
      return;
    }
    try { localStorage.setItem(LSK + name, JSON.stringify(data)); }
    catch (e) { throw new Error('브라우저 저장 공간이 꽉 찼습니다. 사진을 줄이거나 나스 저장(api.php)을 켜 주세요.'); }
  }

  function flush() {
    var names = Object.keys(dirty);
    dirty = {};
    if (!names.length) return Promise.resolve();
    return Promise.all(names.map(writeOne)).then(function () {
      if (SG.onsaved) SG.onsaved(null);
    }, function (err) {
      if (SG.onsaved) SG.onsaved(err);
      else alert(err.message);
    });
  }

  function save(name) {
    dirty[name] = 1;
    clearTimeout(timer);
    timer = setTimeout(flush, 350);
  }

  /* ── 파일 올리기 ─────────────────────────── */
  // 사진은 올리기 전에 가로·세로 1600px 이하로 줄인다 (용량·속도)
  function shrink(file, max, quality) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type) || /heic|heif/i.test(file.type)) return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height, s = Math.min(1, max / Math.max(w, h));
        if (s === 1 && file.size < 900 * 1024) { URL.revokeObjectURL(url); return resolve(file); }
        var c = document.createElement('canvas');
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          URL.revokeObjectURL(url);
          resolve(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', quality || 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function toDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('파일을 읽지 못했습니다')); };
      fr.readAsDataURL(file);
    });
  }

  /* kind: 'photos' | 'receipts'  →  {name, url} */
  async function upload(file, kind, folder) {
    var small = await shrink(file, 1600, 0.82);
    if (mode === 'server') {
      var fd = new FormData();
      fd.append('file', small, small.name);
      if (folder) fd.append('folder', folder);
      var r = await fetch('api.php?upload=' + kind, { method: 'POST', body: fd });
      var j = await r.json().catch(function () { return null; });
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || '올리기 실패');
      return { name: file.name, url: j.path };
    }
    var tiny = await shrink(file, 1100, 0.7);
    return { name: file.name, url: await toDataUrl(tiny) };
  }

  /* ── 백업 ───────────────────────────────── */
  function exportAll() {
    return { _app: 'sagoohoe', _at: new Date().toISOString(), data: clone(db) };
  }
  async function importAll(obj) {
    if (!obj || obj._app !== 'sagoohoe' || !obj.data) throw new Error('사구회 백업 파일이 아닙니다');
    STORES.forEach(function (n) {
      if (obj.data[n] !== undefined) { db[n] = merged(n, obj.data[n]); dirty[n] = 1; }
    });
    await flush();
  }

  return {
    STORES: STORES, DEFAULTS: DEFAULTS,
    init: init, save: save, flush: flush, upload: upload,
    exportAll: exportAll, importAll: importAll,
    uid: uid, clone: clone,
    get mode() { return mode; },
    get db() { return db; },
    onsaved: null
  };
})();
