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
    if (r.name === 'settings' && !SG.isAdmin()) {
      view.textContent = '';
      view.appendChild(h('div.card', h('div.empty', '설정은 운영진만 볼 수 있습니다.')));
      Array.prototype.forEach.call(tabs.children, function (a) { a.classList.remove('on'); });
      return;
    }
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

  function paintRole() {
    document.body.classList.toggle('member', SG.auth === 'ok' && !SG.isAdmin());
    var el = document.getElementById('role');
    if (!el) {
      el = h('span', { id: 'role', class: 'mode', style: 'margin-left:4px' });
      modeEl.parentNode.insertBefore(el, modeEl.nextSibling);
    }
    if (SG.auth !== 'ok') { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = SG.isAdmin() ? '운영진' : '회원';
    el.className = 'mode' + (SG.isAdmin() ? '' : ' local');
    el.title = SG.isAdmin()
      ? '모든 항목을 고칠 수 있습니다.'
      : '사진 올리기와 정산금 신청만 할 수 있습니다. 나머지는 보기 전용입니다.';
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

  SG.onsaved = function (err) {
    if (!err) return;
    if (SG.auth === 'required' || /로그인/.test(err.message)) {
      showLogin('로그인이 풀렸습니다. 다시 로그인해 주세요.');
      return;
    }
    UI.toast(err.message, 4000);
  };

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

  /* ── 로그인 화면 ── */
  function showLogin(note) {
    document.body.classList.add('locked');
    view.textContent = '';
    var idI = h('input', { inputmode: 'numeric', autocomplete: 'username', placeholder: '숫자 아이디' });
    var pwI = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', placeholder: '숫자 비밀번호' });
    var errEl = h('div.tiny', { style: 'color:var(--no);min-height:18px;margin-top:6px' , text: note || '' });
    var btn = h('button.btn.pri', { style: 'width:100%', text: '로그인' });

    async function go() {
      errEl.textContent = '';
      var id = idI.value.trim(), pw = pwI.value;
      if (!id || !pw) { errEl.textContent = '아이디와 비밀번호를 넣어 주세요.'; return; }
      btn.disabled = true; btn.textContent = '확인 중…';
      try {
        await SG.login(id, pw);
        document.body.classList.remove('locked');
        try { localStorage.setItem('sg.lastid', id); } catch (e) { }
        paintMode(); paintRole(); fillMe(); paintLogout();
        if (!location.hash) location.hash = '#/dues';
        route();
      } catch (e) {
        errEl.textContent = e.message;
        btn.disabled = false; btn.textContent = '로그인';
        pwI.value = ''; pwI.focus();
      }
    }
    btn.addEventListener('click', go);
    [idI, pwI].forEach(function (el) {
      el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    });
    try { idI.value = localStorage.getItem('sg.lastid') || ''; } catch (e) { }

    view.appendChild(h('div.login',
      h('div.card',
        h('h2', { style: 'font-size:18px;margin-bottom:2px', text: '사구회' }),
        h('p.small.muted', { style: 'margin:0 0 16px', text: '회원만 들어올 수 있습니다. 아이디와 비밀번호를 넣어 주세요.' }),
        h('div', { style: 'margin-bottom:10px' }, h('label.f', { text: '아이디' }), idI),
        h('div', h('label.f', { text: '비밀번호' }), pwI),
        errEl,
        h('div', { style: 'margin-top:14px' }, btn),
        h('p.tiny.muted', { style: 'margin-top:12px', text: '한 번 로그인하면 이 기기에서는 한동안 다시 묻지 않습니다.' })
      )
    ));
    (idI.value ? pwI : idI).focus();
  }

  function paintLogout() {
    var old = document.getElementById('btn-logout');
    if (old) old.remove();
    if (SG.auth !== 'ok') return;
    var foot = document.querySelector('.foot');
    if (!foot) return;
    foot.appendChild(h('button.link', {
      id: 'btn-logout', text: '로그아웃',
      onclick: function () {
        SG.logout().then(function () { location.reload(); });
      }
    }));
  }

  SG.init().then(function () {
    paintMode();
    if (SG.auth === 'required') { showLogin(); return; }
    paintRole();
    fillMe();
    paintLogout();
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
