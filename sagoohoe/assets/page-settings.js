/* 설정 — 회원 명단 · 회비 · 유류비 기준 · 운영진 · 저장 위치 */
(function () {
  var h = UI.h;

  window.PAGES = window.PAGES || {};
  window.PAGES.settings = function (view) {
    if (!SG.isAdmin()) {
      view.appendChild(h('div.card', h('div.empty', '설정은 운영진만 볼 수 있습니다.')));
      return;
    }
    var s = SG.db.settings;
    var members = SG.db.members;
    var S = function (k) { SG.save(k || 'settings'); };

    /* ── 회원 ── */
    var mWrap = h('div');
    function drawMembers() {
      mWrap.textContent = '';
      if (!members.length) mWrap.appendChild(h('div.empty.small', '등록된 회원이 없습니다.'));
      members.forEach(function (m, i) {
        var nameI = h('input', {
          value: m.name || '', placeholder: '이름',
          oninput: function () { m.name = nameI.value.trim(); SG.save('members'); }
        });
        var joinI = h('input', { type: 'date', value: m.joinedAt || '', oninput: function () { m.joinedAt = joinI.value; SG.save('members'); } });
        var activeC = h('input', {
          type: 'checkbox', checked: m.active !== false,
          onchange: function () { m.active = activeC.checked; SG.save('members'); }
        });
        mWrap.appendChild(h('div.item',
          h('div.grid', { style: 'grid-template-columns:1fr 150px 90px auto;gap:8px;align-items:end' },
            UI.field('이름', nameI),
            UI.field('가입일', joinI),
            h('div', h('label.f', { text: '활동' }), h('label.row.small', activeC, ' 활동중')),
            h('div', h('label.f', { text: ' ' }), h('div.row',
              h('button.btn.sm', { text: '↑', disabled: i === 0, onclick: function () { swap(i, -1); } }),
              h('button.btn.sm', { text: '↓', disabled: i === members.length - 1, onclick: function () { swap(i, 1); } }),
              h('button.btn.sm.danger', {
                text: '삭제', onclick: function () {
                  UI.confirm('“' + (m.name || '이름 없음') + '” 을 명단에서 지웁니다. 이 회원의 회비 기록은 표에서 보이지 않게 됩니다.', function () {
                    members.splice(i, 1); SG.save('members'); drawMembers();
                  }, '삭제');
                }
              })))
          )));
      });
      function swap(i, d) { var t = members[i]; members[i] = members[i + d]; members[i + d] = t; SG.save('members'); drawMembers(); }
    }
    drawMembers();

    view.appendChild(h('div.card',
      h('div.spread', h('h2', { text: '회원 명단' }),
        h('div.row',
          h('button.btn.sm', {
            text: '+ 회원 추가', onclick: function () {
              members.push({ id: SG.uid('m'), name: '', active: true, joinedAt: '' });
              SG.save('members'); drawMembers();
            }
          }),
          h('button.btn.sm', { text: '이름만 한 번에 입력', onclick: bulk })
        )),
      h('p.tiny.muted', { text: '이름 순서가 회비 표의 줄 순서입니다.' }),
      mWrap));

    function bulk() {
      var t = h('textarea', { value: members.map(function (m) { return m.name; }).join('\n'), placeholder: '한 줄에 한 명' });
      UI.modal('회원 이름 한 번에 입력',
        UI.field('이름 목록', t, '이미 있는 이름은 그대로 두고, 새 이름만 추가합니다. 목록에서 빠진 이름은 지워지지 않습니다.'),
        [{ label: '취소' }, {
          label: '적용', cls: 'pri', run: function () {
            t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (nm) {
              if (!members.some(function (m) { return m.name === nm; })) members.push({ id: SG.uid('m'), name: nm, active: true, joinedAt: '' });
            });
            SG.save('members'); drawMembers(); UI.toast('적용했습니다');
          }
        }]);
    }

    /* ── 회비 ── */
    var dueI = h('input', { type: 'number', step: 10000, value: s.monthlyDue, oninput: function () { s.monthlyDue = UI.parseNum(dueI.value); S(); } });
    var startI = h('input', { type: 'number', value: s.startYear, oninput: function () { s.startYear = UI.parseNum(startI.value) || 2006; S(); } });
    var exWrap = h('div');
    function drawEx() {
      exWrap.textContent = '';
      var keys = Object.keys(s.dueYearly || {}).sort();
      if (!keys.length) { exWrap.appendChild(h('div.tiny.muted', { text: '예외 없음 — 모든 해에 위 금액을 적용합니다.' })); return; }
      keys.forEach(function (y) {
        exWrap.appendChild(h('div.row', { style: 'margin-bottom:6px' },
          h('b', { text: y + '년' }),
          h('input', {
            type: 'number', style: 'width:140px', value: s.dueYearly[y],
            oninput: function (e) { s.dueYearly[y] = UI.parseNum(e.target.value); S(); }
          }),
          h('span.tiny.muted', { text: '원/월' }),
          h('button.btn.sm.danger', { text: '지우기', onclick: function () { delete s.dueYearly[y]; S(); drawEx(); } })));
      });
    }
    drawEx();

    view.appendChild(h('div.card',
      h('h2', { text: '회비' }),
      h('div.grid.g2',
        UI.field('월 회비 (원)', dueI, '현재 기준 금액. 인상·인하하면 이 값을 바꿉니다.'),
        UI.field('기록 시작 연도', startI, '회비 표에서 선택할 수 있는 가장 오래된 해')),
      h('div.sep'),
      h('div.spread', h('h3', { text: '연도별 예외 금액' }),
        h('button.btn.sm', {
          text: '+ 연도 예외 추가', onclick: function () {
            var yI = h('input', { type: 'number', value: new Date().getFullYear() });
            var aI = h('input', { type: 'number', step: 10000, value: s.monthlyDue });
            UI.modal('연도별 월 회비 예외', h('div.grid.g2', UI.field('연도', yI), UI.field('월 회비 (원)', aI)),
              [{ label: '취소' }, {
                label: '추가', cls: 'pri', run: function () {
                  s.dueYearly = s.dueYearly || {};
                  s.dueYearly[String(UI.parseNum(yI.value))] = UI.parseNum(aI.value);
                  S(); drawEx();
                }
              }]);
          }
        })),
      h('p.tiny.muted', { text: '회비가 중간에 바뀌었다면 그 해만 다른 금액으로 계산합니다.' }),
      exWrap));

    /* ── 정산 기준 ── */
    var kplI = h('input', { type: 'number', value: s.kmPerLiter, oninput: function () { s.kmPerLiter = UI.parseNum(kplI.value) || 10; S(); } });
    var priceI = h('input', { type: 'number', step: 10, value: s.fuelPrice, oninput: function () { s.fuelPrice = UI.parseNum(priceI.value); S(); } });
    view.appendChild(h('div.card',
      h('h2', { text: '정산 기준' }),
      h('div.grid.g2',
        UI.field('연비 기준 (km/L)', kplI, '회칙 기준 10km/L — 차종·유종과 무관'),
        UI.field('유류비 단가 (원/L)', priceI, '모임 시점 주유 단가로 맞춰 둡니다')),
      h('p.tiny.muted', { style: 'margin-top:8px', text: '자차 유류비 = 총 운행거리 ÷ 연비 기준 × 단가. 신청서에서 건별로 바꿀 수도 있습니다.' })));

    /* ── 운영진 ── */
    var names = [{ value: '', label: '선택' }].concat(members.map(function (m) { return { value: m.name, label: m.name }; }));
    view.appendChild(h('div.card',
      h('h2', { text: '운영진' }),
      h('div.grid.g2',
        UI.field('회장', UI.select(names, s.chairman, function (v) { s.chairman = v; S(); })),
        UI.field('총무', UI.select(names, s.treasurer, function (v) { s.treasurer = v; S(); })))));

    /* ── 저장 위치 ── */
    var where = SG.mode === 'server'
      ? '나스의 data/ 폴더에 저장되고 있습니다. 같은 주소로 접속하는 회원 모두가 같은 자료를 봅니다.'
      : '지금은 이 브라우저에만 저장됩니다. 나스에서 PHP(Web Station)를 켜고 api.php 가 열리면 자동으로 나스 저장으로 바뀝니다.';
    view.appendChild(h('div.card',
      h('h2', { text: '저장 위치' }),
      h('p.small', { text: where }),
      h('div.row',
        h('button.btn.sm', { text: '전체 백업 내려받기', onclick: function () { document.getElementById('btn-export').click(); } }),
        h('button.btn.sm', { text: '백업 불러오기', onclick: function () { document.getElementById('btn-import').click(); } })),
      h('p.tiny.muted', { style: 'margin-top:10px', text: '사진·영수증은 나스 저장일 때 photos/ receipts/ 폴더에 들어갑니다. 브라우저 저장일 때는 작게 줄여 브라우저 안에 넣어 두므로, 오래 보관할 자료는 나스 저장으로 쓰세요.' })));
  };
})();
