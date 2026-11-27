/* 정산금 신청 — 교통비(기차·비행기·버스·자차) + 식사·음료 실비 */
(function () {
  var h = UI.h;
  var MODES = ['기차', '비행기', '버스', '자차'];
  var FLOW = ['작성중', '접수', '승인', '지급완료', '반려'];

  function name(mid) {
    var m = SG.db.members.filter(function (x) { return x.id === mid; })[0];
    return m ? m.name : '(미지정)';
  }
  function meetingLabel(id) {
    var m = (SG.db.history.meetings || []).filter(function (x) { return x.id === id; })[0];
    return m ? (UI.dateKo(m.date) + ' ' + (m.season || '') + ' ' + (m.place || '')) : '(모임 미지정)';
  }
  function fuelOf(t) {
    var kpl = +t.kmPerLiter || +SG.db.settings.kmPerLiter || 10;
    var price = +t.fuelPrice || +SG.db.settings.fuelPrice || 0;
    return Math.round((+t.km || 0) / kpl * price);
  }
  function tripTotal(t) { return t.mode === '자차' ? fuelOf(t) + (+t.toll || 0) : (+t.amount || 0); }
  function reqTotal(r) {
    return (r.trips || []).reduce(function (s, t) { return s + tripTotal(t); }, 0)
      + (r.items || []).reduce(function (s, i) { return s + (+i.amount || 0); }, 0);
  }
  function statusTag(s) {
    var cls = s === '지급완료' ? 'ok' : s === '승인' ? 'flat' : s === '반려' ? 'no' : s === '접수' ? 'warn' : 'flat';
    return h('span', { class: 'tag ' + cls, text: s });
  }

  window.PAGES = window.PAGES || {};
  window.PAGES.expense = function (view) {
    var E = SG.db.expenses;
    E.requests = E.requests || [];
    var members = SG.db.members;
    var meetings = (SG.db.history.meetings || []).slice()
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

    if (!members.length) {
      view.appendChild(h('div.card', h('div.empty', '회원 명단이 아직 없습니다. ',
        h('a', { href: '#/settings', text: '설정에서 회원을 먼저 등록' }), '해 주세요.')));
      return;
    }

    var waiting = E.requests.filter(function (r) { return r.status === '접수' || r.status === '승인'; });
    var thisYear = new Date().getFullYear();
    var paidThisYear = E.requests.filter(function (r) {
      return r.status === '지급완료' && String(r.date || '').slice(0, 4) === String(thisYear);
    });

    view.appendChild(h('div.grid.g3', { style: 'margin-bottom:14px' },
      UI.stat('처리 대기', waiting.length + '건', UI.money(waiting.reduce(function (s, r) { return s + reqTotal(r); }, 0))),
      UI.stat(thisYear + '년 지급액', UI.money(paidThisYear.reduce(function (s, r) { return s + reqTotal(r); }, 0))),
      UI.stat('전체 신청', E.requests.length + '건'),
      UI.stat('유류비 기준', (SG.db.settings.kmPerLiter || 10) + 'km/L', UI.money(SG.db.settings.fuelPrice) + '/L')
    ));

    view.appendChild(h('div.card',
      h('div.spread',
        h('div', h('h2', { text: '정산금 신청' }),
          h('p.small.muted', { style: 'margin:0', text: '모임에서 각자 쓴 실비를 청구합니다. 교통비는 수단별로, 식사·음료 등 부가 지출은 영수증을 첨부한 건만 청구할 수 있습니다.' })),
        h('button.btn.pri', { text: '+ 새 정산 신청', onclick: newRequest })
      )
    ));

    /* 상태 필터 */
    var filter = sessionStorage.getItem('sg.exfilter') || '전체';
    var chips = h('div.chips', { style: 'margin-bottom:12px' });
    ['전체'].concat(FLOW).forEach(function (s) {
      var cnt = s === '전체' ? E.requests.length : E.requests.filter(function (r) { return r.status === s; }).length;
      chips.appendChild(h('button', {
        class: 'chip' + (filter === s ? ' on' : ''), text: s + ' ' + cnt, 'data-s': s,
        onclick: function () { sessionStorage.setItem('sg.exfilter', s); filter = s; draw(); paintChips(); }
      }));
    });
    function paintChips() {
      Array.prototype.forEach.call(chips.children, function (c) {
        c.className = 'chip' + (c.getAttribute('data-s') === filter ? ' on' : '');
      });
    }
    view.appendChild(chips);

    var list = h('div');
    view.appendChild(list);
    draw();

    function draw() {
      list.textContent = '';
      var rs = E.requests.slice().sort(function (a, b) { return (b.no || 0) - (a.no || 0); })
        .filter(function (r) { return filter === '전체' || r.status === filter; });
      if (!rs.length) { list.appendChild(h('div.card', h('div.empty', '해당하는 신청이 없습니다.'))); return; }
      rs.forEach(function (r) { list.appendChild(card(r)); });
    }

    function card(r) {
      var open = r.status === '작성중' && !r.applicantId;
      var body = h('div.acc-body', { hidden: !open });
      var titleEl = h('h4');
      var metaEl = h('div.meta');
      var tagEl = h('span');
      function syncHead() {
        titleEl.textContent = '#' + (r.no || 0) + ' ' + name(r.applicantId) + ' · ' + UI.money(reqTotal(r));
        metaEl.textContent = UI.dateKo(r.date) + ' · ' + meetingLabel(r.meetingId);
        tagEl.textContent = '';
        tagEl.appendChild(statusTag(r.status || '작성중'));
      }
      syncHead();
      var btn = h('button.acc', {
        onclick: function () {
          body.hidden = !body.hidden;
          if (!body.hidden && !body.dataset.built) build(r, body, syncHead);
        }
      }, h('div', titleEl, metaEl), h('div.row', tagEl, h('span.muted', { text: '▾' })));
      if (open) build(r, body, syncHead);
      return h('div.item.pad0', btn, body);
    }

    function build(r, body, syncHead) {
      body.dataset.built = '1';
      body.textContent = '';
      var S = function () { SG.save('expenses'); };
      var editable = r.status === '작성중' || r.status === '반려';

      /* 합계 상자는 먼저 만들어 둔다 (아래에서 바로 갱신하므로) */
      var totalBox = h('div.spread', { style: 'margin-top:14px;padding:12px 14px;background:var(--accent-soft);border-radius:10px' });
      function refreshTotal() {
        totalBox.textContent = '';
        totalBox.appendChild(h('b', { text: '청구 합계' }));
        totalBox.appendChild(h('b', { style: 'font-size:19px', text: UI.money(reqTotal(r)) }));
        syncHead();
      }

      /* 기본 정보 */
      var applicant = UI.select([{ value: '', label: '신청자 선택' }].concat(members.map(function (x) { return { value: x.id, label: x.name }; })),
        r.applicantId, function (v) { r.applicantId = v; S(); syncHead(); }, { disabled: !editable });
      var meetS = UI.select([{ value: '', label: '모임 선택' }].concat(meetings.map(function (m) {
        return { value: m.id, label: UI.dateKo(m.date) + ' ' + (m.season || '') + ' ' + (m.place || '') };
      })), r.meetingId, function (v) { r.meetingId = v; S(); syncHead(); }, { disabled: !editable });
      var dateI = h('input', {
        type: 'date', value: r.date || UI.today(), disabled: !editable,
        oninput: function () { r.date = dateI.value; S(); syncHead(); }
      });
      body.appendChild(h('div.grid.g2', { style: 'margin-top:14px' },
        UI.field('신청자', applicant), UI.field('대상 모임', meetS), UI.field('신청일', dateI),
        h('div', h('label.f', { text: '상태' }), h('div', { style: 'padding-top:7px' }, statusTag(r.status || '작성중')))
      ));

      /* 1. 교통비 */
      var tripWrap = h('div');
      body.appendChild(h('div', { style: 'margin-top:18px' },
        h('div.spread', h('h4', { text: '1. 교통비' }),
          editable ? h('button.btn.sm', {
            text: '+ 교통편 추가', onclick: function () {
              r.trips = r.trips || [];
              r.trips.push({ id: SG.uid('tr'), mode: '기차', note: '', roundTrip: true, amount: 0, receipts: [], km: 0, toll: 0, tollReceipts: [] });
              S(); drawTrips();
            }
          }) : null),
        tripWrap));

      function drawTrips() {
        tripWrap.textContent = '';
        var ts = r.trips || [];
        if (!ts.length) { tripWrap.appendChild(h('div.empty.small', '교통편이 없습니다.')); refreshTotal(); return; }
        ts.forEach(function (t, i) {
          var box = h('div.item');
          var amtTag = h('b');
          var calcLine = h('div.small', { style: 'margin-top:8px;padding:8px 10px;background:var(--bg);border-radius:8px' });
          function sync() {
            amtTag.textContent = UI.money(tripTotal(t));
            if (t.mode === '자차') {
              calcLine.textContent = '유류비 = ' + (t.km || 0) + 'km ÷ ' + (t.kmPerLiter || SG.db.settings.kmPerLiter || 10) +
                'km/L × ' + UI.money(t.fuelPrice || SG.db.settings.fuelPrice) + ' = ' + UI.money(fuelOf(t)) +
                ' · 통행료 ' + UI.money(t.toll) + ' → 합계 ' + UI.money(tripTotal(t));
            }
            refreshTotal();
          }
          var modeS = UI.select(MODES, t.mode, function (v) { t.mode = v; S(); drawTrips(); }, { disabled: !editable });
          var noteI = h('input', { value: t.note || '', placeholder: '구간 (예: 서울→강릉 왕복)', disabled: !editable, oninput: function () { t.note = noteI.value; S(); } });

          box.appendChild(h('div.spread', h('b', { text: '교통편 ' + (i + 1) + ' — ' + t.mode }),
            h('div.row', amtTag,
              editable ? h('button.btn.sm.danger', {
                text: '삭제', onclick: function () { r.trips.splice(i, 1); S(); drawTrips(); }
              }) : null)));
          box.appendChild(h('div.grid.g2', { style: 'margin-top:10px' }, UI.field('수단', modeS), UI.field('구간 · 메모', noteI)));

          if (t.mode === '자차') {
            var kplI = h('input', { type: 'number', value: t.kmPerLiter || SG.db.settings.kmPerLiter || 10, disabled: !editable, oninput: function () { t.kmPerLiter = UI.parseNum(kplI.value) || 10; S(); sync(); } });
            var priceI = h('input', { type: 'number', value: t.fuelPrice || SG.db.settings.fuelPrice || 0, disabled: !editable, oninput: function () { t.fuelPrice = UI.parseNum(priceI.value); S(); sync(); } });
            var kmI = h('input', { type: 'number', step: '0.1', value: t.km || '', placeholder: '예: 420', disabled: !editable, oninput: function () { t.km = parseFloat(kmI.value) || 0; S(); sync(); } });
            var tollI = h('input', { type: 'number', value: t.toll || '', placeholder: '0', disabled: !editable, oninput: function () { t.toll = UI.parseNum(tollI.value); S(); sync(); } });
            box.appendChild(h('div.grid.g2', { style: 'margin-top:10px' },
              UI.field('총 운행거리 (km)', kmI, '왕복 거리를 모두 합해 적습니다'),
              UI.field('통행료 · 톨비 (원)', tollI, '하이패스 내역 또는 통행료 영수증 첨부'),
              UI.field('연비 기준 (km/L)', kplI, '회칙 기준 10km/L — 차종·유종 무관'),
              UI.field('유류비 단가 (원/L)', priceI, '설정에서 기본값을 바꿀 수 있습니다')
            ));
            box.appendChild(calcLine);
            t.tollReceipts = t.tollReceipts || [];
            if (editable) box.appendChild(h('div', { style: 'margin-top:12px' }, UI.attach(t.tollReceipts, 'receipts', 'toll', function () { S(); sync(); }, '통행료 영수증 (필수)')));
            else { var av1 = UI.attachView(t.tollReceipts); if (av1) box.appendChild(h('div', { style: 'margin-top:10px' }, h('label.f', { text: '통행료 영수증' }), av1)); }
          } else {
            var amtI = h('input', { type: 'number', value: t.amount || '', placeholder: '0', disabled: !editable, oninput: function () { t.amount = UI.parseNum(amtI.value); S(); sync(); } });
            var rtC = h('input', { type: 'checkbox', checked: !!t.roundTrip, disabled: !editable, onchange: function () { t.roundTrip = rtC.checked; S(); } });
            box.appendChild(h('div.grid.g2', { style: 'margin-top:10px' },
              UI.field('금액 (원)', amtI, '영수증·승차권에 적힌 실제 금액'),
              h('div', h('label.f', { text: '왕복 여부' }), h('label.row.small', rtC, ' 왕복 (편도면 체크 해제)'))
            ));
            t.receipts = t.receipts || [];
            if (editable) box.appendChild(h('div', { style: 'margin-top:12px' }, UI.attach(t.receipts, 'receipts', t.mode, function () { S(); sync(); }, '승차권 · 영수증 (필수)')));
            else { var av2 = UI.attachView(t.receipts); if (av2) box.appendChild(h('div', { style: 'margin-top:10px' }, h('label.f', { text: '승차권 · 영수증' }), av2)); }
          }
          sync();
          tripWrap.appendChild(box);
        });
        refreshTotal();
      }
      drawTrips();

      /* 2. 부가 지출 */
      var itemWrap = h('div');
      body.appendChild(h('div', { style: 'margin-top:18px' },
        h('div.spread', h('h4', { text: '2. 식사 · 음료 등 부가 지출' }),
          editable ? h('button.btn.sm', {
            text: '+ 항목 추가', onclick: function () {
              r.items = r.items || [];
              r.items.push({ id: SG.uid('it'), label: '', amount: 0, receipts: [] });
              S(); drawItems();
            }
          }) : null),
        h('p.tiny.muted', { style: 'margin:2px 0 8px', text: '영수증을 첨부한 건만 청구할 수 있습니다.' }),
        itemWrap));

      function drawItems() {
        itemWrap.textContent = '';
        var its = r.items || [];
        if (!its.length) { itemWrap.appendChild(h('div.empty.small', '부가 지출 항목이 없습니다.')); refreshTotal(); return; }
        its.forEach(function (it, i) {
          var amtTag = h('b', { text: UI.money(it.amount) });
          var labI = h('input', { value: it.label || '', placeholder: '예: 둘째날 아침 식사, 음료·간식', disabled: !editable, oninput: function () { it.label = labI.value; S(); } });
          var amtI = h('input', {
            type: 'number', value: it.amount || '', placeholder: '0', disabled: !editable,
            oninput: function () { it.amount = UI.parseNum(amtI.value); S(); amtTag.textContent = UI.money(it.amount); refreshTotal(); }
          });
          it.receipts = it.receipts || [];
          var box = h('div.item',
            h('div.spread', h('b', { text: '항목 ' + (i + 1) }),
              h('div.row', amtTag,
                !it.receipts.length ? h('span.tag.no', { text: '영수증 없음' }) : null,
                editable ? h('button.btn.sm.danger', { text: '삭제', onclick: function () { r.items.splice(i, 1); S(); drawItems(); } }) : null)),
            h('div.grid.g2', { style: 'margin-top:10px' }, UI.field('내용', labI), UI.field('금액 (원)', amtI))
          );
          if (editable) box.appendChild(h('div', { style: 'margin-top:12px' }, UI.attach(it.receipts, 'receipts', 'etc', function () { S(); drawItems(); }, '영수증 (필수)')));
          else { var av = UI.attachView(it.receipts); if (av) box.appendChild(h('div', { style: 'margin-top:10px' }, h('label.f', { text: '영수증' }), av)); }
          itemWrap.appendChild(box);
        });
        refreshTotal();
      }
      drawItems();

      /* 비고 + 합계 */
      var memoT = h('textarea', { style: 'min-height:64px', value: r.memo || '', placeholder: '운영진에게 전할 말', disabled: !editable, oninput: function () { r.memo = memoT.value; S(); } });
      body.appendChild(h('div', { style: 'margin-top:14px' }, UI.field('비고', memoT)));
      body.appendChild(totalBox);
      refreshTotal();

      /* 처리 */
      var ctl = h('div.row', { style: 'margin-top:16px' });
      body.appendChild(ctl);
      drawCtl();

      function drawCtl() {
        ctl.textContent = '';
        if (r.status === '작성중' || r.status === '반려') ctl.appendChild(h('button.btn.pri', { text: '신청 제출', onclick: submit }));
        if (r.status === '접수') {
          ctl.appendChild(h('button.btn.pri', { text: '승인', onclick: function () { setStatus('승인'); } }));
          ctl.appendChild(h('button.btn.danger', { text: '반려', onclick: function () { askNote('반려'); } }));
        }
        if (r.status === '승인') {
          ctl.appendChild(h('button.btn.pri', { text: '지급완료 처리', onclick: function () { setStatus('지급완료'); } }));
          ctl.appendChild(h('button.btn', { text: '접수로 되돌리기', onclick: function () { setStatus('접수'); } }));
        }
        if (r.status === '지급완료') ctl.appendChild(h('button.btn', { text: '승인으로 되돌리기', onclick: function () { setStatus('승인'); } }));
        ctl.appendChild(h('button.btn.sm', { text: '신청서 복사', onclick: function () { UI.copy(reqText(r)); } }));
        ctl.appendChild(h('button.btn.sm', { text: '인쇄', onclick: function () { window.print(); } }));
        ctl.appendChild(h('button.btn.sm.danger', {
          text: '신청 삭제', onclick: function () {
            UI.confirm('#' + r.no + ' ' + name(r.applicantId) + ' 신청을 삭제합니다.', function () {
              SG.db.expenses.requests = E.requests = E.requests.filter(function (x) { return x !== r; });
              SG.save('expenses'); draw(); UI.toast('삭제했습니다');
            }, '삭제');
          }
        }));
        if (r.statusNote) ctl.appendChild(h('span.tiny.muted', { text: '처리 메모: ' + r.statusNote }));
      }

      function setStatus(s) { r.status = s; r.decidedAt = UI.today(); S(); UI.toast(s + ' 처리했습니다'); draw(); }
      function askNote(s) {
        var t = h('textarea', { placeholder: '반려 사유를 적어 주세요 (신청자에게 보입니다)' });
        UI.modal(s + ' 사유', UI.field('사유', t), [{ label: '취소' }, {
          label: s, cls: 'danger', run: function () { r.statusNote = t.value; r.status = s; r.decidedAt = UI.today(); S(); draw(); }
        }]);
      }
      function submit() {
        var bad = [];
        if (!r.applicantId) bad.push('신청자를 선택해 주세요.');
        if (!(r.trips || []).length && !(r.items || []).length) bad.push('교통비나 부가 지출을 한 건 이상 넣어 주세요.');
        (r.trips || []).forEach(function (t, i) {
          if (t.mode === '자차') {
            if (!(+t.km)) bad.push('교통편 ' + (i + 1) + '(자차): 총 운행거리를 적어 주세요.');
            if ((+t.toll) > 0 && !(t.tollReceipts || []).length) bad.push('교통편 ' + (i + 1) + '(자차): 통행료 영수증을 첨부해 주세요.');
          } else {
            if (!(+t.amount)) bad.push('교통편 ' + (i + 1) + '(' + t.mode + '): 금액을 적어 주세요.');
            if (!(t.receipts || []).length) bad.push('교통편 ' + (i + 1) + '(' + t.mode + '): 승차권·영수증을 첨부해 주세요.');
          }
        });
        (r.items || []).forEach(function (it, i) {
          if (!(it.receipts || []).length) bad.push('부가 지출 ' + (i + 1) + '(' + (it.label || '내용 없음') + '): 영수증이 없으면 청구할 수 없습니다.');
          if (!(+it.amount)) bad.push('부가 지출 ' + (i + 1) + ': 금액을 적어 주세요.');
        });
        if (bad.length) {
          UI.modal('아직 제출할 수 없습니다', h('ul', bad.map(function (b) { return h('li', { text: b }); })), [{ label: '확인' }]);
          return;
        }
        r.status = '접수'; r.statusNote = ''; r.submittedAt = UI.today(); S();
        UI.toast('접수되었습니다'); draw();
      }
    }

    function reqText(r) {
      var L = ['[사구회 정산금 신청 #' + r.no + ']',
        '신청자: ' + name(r.applicantId),
        '모임: ' + meetingLabel(r.meetingId),
        '신청일: ' + UI.dateKo(r.date),
        '상태: ' + (r.status || '작성중'), ''];
      (r.trips || []).forEach(function (t, i) {
        if (t.mode === '자차') {
          L.push('교통' + (i + 1) + '. 자차 ' + (t.note || '') + ' — ' + (t.km || 0) + 'km ÷ ' +
            (t.kmPerLiter || SG.db.settings.kmPerLiter) + 'km/L × ' + UI.money(t.fuelPrice || SG.db.settings.fuelPrice) +
            ' = ' + UI.money(fuelOf(t)) + ' + 통행료 ' + UI.money(t.toll) + ' = ' + UI.money(tripTotal(t)));
        } else {
          L.push('교통' + (i + 1) + '. ' + t.mode + ' ' + (t.note || '') + (t.roundTrip ? ' (왕복)' : ' (편도)') + ' — ' + UI.money(t.amount));
        }
      });
      (r.items || []).forEach(function (it, i) {
        L.push('기타' + (i + 1) + '. ' + (it.label || '') + ' — ' + UI.money(it.amount) +
          ((it.receipts || []).length ? '' : ' (영수증 없음)'));
      });
      L.push('', '합계: ' + UI.money(reqTotal(r)));
      if (r.memo) L.push('비고: ' + r.memo);
      return L.join('\n');
    }

    function newRequest() {
      E.seq = (+E.seq || 0) + 1;
      var r = {
        id: SG.uid('rq'), no: E.seq, applicantId: sessionStorage.getItem('sg.me') || '',
        meetingId: meetings.length ? meetings[0].id : '',
        date: UI.today(), trips: [], items: [], memo: '', status: '작성중'
      };
      r.trips.push({ id: SG.uid('tr'), mode: '기차', note: '', roundTrip: true, amount: 0, receipts: [], km: 0, toll: 0, tollReceipts: [] });
      E.requests.push(r); SG.save('expenses');
      sessionStorage.setItem('sg.exfilter', '전체');
      PAGES._reload();
    }
  };
})();
