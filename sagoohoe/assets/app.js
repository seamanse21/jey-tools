/* 사구회 — 시작 · 메뉴 이동 */
(function () {
  var h = UI.h;
  var view = document.getElementById('view');
  var tabs = document.getElementById('tabs');
  var meSel = document.getElementById('me');
  var modeEl = document.getElementById('mode');

  window.PAGES = window.PAGES || {};
  PAGES._reload = function () { route(); };

  function parseHash() {
    var raw = (location.hash || '#/dues').replace(/^#\/?/, '');
    var bits = raw.split('?');
    var name = bits[0] || 'dues';
    var params = {};
    (bits[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return { name: name, params: params };
  }

  function route() {
    var r = parseHash();
    var fn = PAGES[r.name] || PAGES.dues;
    Array.prototype.forEach.call(tabs.children, function (a) {
      a.classList.toggle('on', a.getAttribute('href').indexOf('#/' + r.name) === 0);
    });
    view.textContent = '';
    try {
      fn(view, r.params);
    } catch (e) {
      view.appendChild(h('div.card', h('h2', { text: '화면을 그리다 문제가 생겼습니다' }),
        h('pre.small', { style: 'white-space:pre-wrap', text: String(e && e.stack || e) })));
      console.error(e);
    }
    window.scrollTo(0, 0);
  }

  function fillMe() {
    var cur = sessionStorage.getItem('sg.me') || localStorage.getItem('sg.me') || '';
    meSel.textContent = '';
    meSel.appendChild(h('option', { value: '', text: '선택' }));
    SG.db.members.forEach(function (m) {
      meSel.appendChild(h('option', { value: m.id, text: m.name || '(이름 없음)', selected: m.id === cur }));
    });
    meSel.onchange = function () {
      sessionStorage.setItem('sg.me', meSel.value);
      try { localStorage.setItem('sg.me', meSel.value); } catch (e) { }
    };
    if (cur) sessionStorage.setItem('sg.me', cur);
  }

  function paintMode() {
    if (SG.mode === 'server') {
      modeEl.textContent = '나스 저장';
      modeEl.className = 'mode';
      modeEl.title = '나스의 data/ 폴더에 저장됩니다. 회원 모두가 같은 자료를 봅니다.';
    } else {
      modeEl.textContent = '이 브라우저에만 저장';
      modeEl.className = 'mode local';
      modeEl.title = 'api.php 가 응답하지 않아 이 브라우저에만 저장합니다. 설정 화면의 안내를 보세요.';
    }
  }

  SG.onsaved = function (err) { if (err) UI.toast(err.message, 4000); };

  /* 백업 */
  document.getElementById('btn-export').onclick = function () {
    UI.download('sagoohoe-backup-' + UI.today() + '.json', JSON.stringify(SG.exportAll(), null, 2));
    UI.toast('백업 파일을 내려받았습니다');
  };
  document.getElementById('btn-import').onclick = function () {
    var inp = h('input', {
      type: 'file', accept: '.json,application/json',
      onchange: function () {
        var f = inp.files[0]; if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var obj = JSON.parse(fr.result);
            UI.confirm('백업을 불러오면 지금 자료를 덮어씁니다. 계속할까요?', function () {
              SG.importAll(obj).then(function () {
                UI.toast('불러왔습니다'); fillMe(); route();
              }, function (e) { UI.toast(e.message, 4000); });
            }, '덮어쓰기');
          } catch (e) { UI.toast('JSON 파일을 읽지 못했습니다', 3000); }
        };
        fr.readAsText(f);
      }
    });
    inp.click();
  };

  window.addEventListener('hashchange', route);

  SG.init().then(function () {
    paintMode();
    fillMe();
    if (!location.hash) location.hash = '#/dues';
    route();
    if (!SG.db.members.length) {
      UI.toast('먼저 설정에서 회원을 등록해 주세요', 3500);
    }
  }, function (e) {
    view.textContent = '';
    view.appendChild(h('div.card', h('h2', { text: '자료를 불러오지 못했습니다' }), h('p', { text: String(e) })));
  });
})();
