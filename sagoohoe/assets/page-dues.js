/* 회비 현황 — 연도별 · 회원별 · 월별 납입 표 */
(function () {
  var h = UI.h;
  var MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

  function dueOf(year) {
    var s = SG.db.settings;
    var ex = s.dueYearly && s.dueYearly[String(year)];
    return ex ? +ex : +s.monthlyDue || 0;
  }
  function yearBook(year) {
    var y = SG.db.dues.years;
    if (!y[String(year)]) y[String(year)] = {};
    return y[String(year)];
  }
  function cellAmt(year, mid, m) {
    var b = SG.db.dues.years[String(year)];
    return (b && b[mid] && +b[mid][String(m)]) || 0;
  }
  function setCell(year, mid, m, amt) {
    var b = yearBook(year);
    if (!b[mid]) b[mid] = {};
    if (amt > 0) b[mid][String(m)] = amt; else delete b[mid][String(m)];
    SG.save('dues');
  }
  function memberTotal(year, mid) {
    return MONTHS.reduce(function (s, m) { return s + cellAmt(year, mid, m); }, 0);
  }
  function monthTotal(year, m) {
    return SG.db.members.reduce(function (s, mb) { return s + cellAmt(year, mb.id, m); }, 0);
  }
  function grandTotal() {
    var t = 0, years = SG.db.dues.years;
    for (var y in years) for (var mid in years[y]) for (var m in years[y][mid]) t += +years[y][mid][m] || 0;
    return t;
  }

  window.PAGES = window.PAGES || {};
  window.PAGES.dues = function (view, params) {
    var now = new Date();
    var members = SG.db.members;
    var startY = +SG.db.settings.startYear || 2006;
    var year = +(params.y || sessionStorage.getItem('sg.year') || now.getFullYear());
    if (year < startY) year = startY;
    sessionStorage.setItem('sg.year', year);

    if (!members.length) {
      view.appendChild(h('div.card', h('div.empty', '회원 명단이 아직 없습니다. ',
        h('a', { href: '#/settings', text: '설정에서 회원을 먼저 등록' }), '해 주세요.')));
      return;
    }

    var admin = SG.isAdmin();
    var due = dueOf(year);
    // '미납'은 이미 지난 달까지만 센다. 올해라면 이번 달까지, 지난해면 12개월, 내년이면 0.
    var elapsed = year < now.getFullYear() ? 12 : (year === now.getFullYear() ? now.getMonth() + 1 : 0);
    var duty = due * elapsed;
    var years = [];
    for (var y = now.getFullYear() + 1; y >= startY; y--) years.push(y);

    /* ── 머리말 ── */
    var head = h('div.card',
      h('div.spread',
        h('div.row',
          h('button.btn.sm', { text: '‹', title: '이전 해', onclick: function () { go(year - 1); } }),
          UI.select(years, year, function (v) { go(+v); }, { style: 'width:110px;font-weight:700' }),
          h('button.btn.sm', { text: '›', title: '다음 해', onclick: function () { go(year + 1); } }),
          h('span.tiny.muted', { text: '월 회비 ' + UI.money(due) })
        ),
        h('div.row',
          h('button.btn.sm', { text: '미납 현황 복사', onclick: copyUnpaid }),
          h('button.btn.sm', { text: '인쇄', onclick: function () { window.print(); } })
        )
      )
    );
    view.appendChild(head);

    function go(y) { location.hash = '#/dues?y=' + y; }

    /* ── 요약 ── */
    var shouldPay = due * 12 * members.length;
    var paid = members.reduce(function (s, m) { return s + memberTotal(year, m.id); }, 0);
    function summaryCards(p) {
      return [
        UI.stat(year + '년 납입액', UI.money(p)),
        UI.stat(year + '년 목표', UI.money(shouldPay), (shouldPay ? Math.round(p / shouldPay * 100) : 0) + '%'),
        UI.stat('지금까지 미납', UI.money(Math.max(0, duty * members.length - p)), elapsed + '개월분 기준'),
        UI.stat('전체 누적 회비', UI.money(grandTotal()), startY + '년부터')
      ];
    }
    var summary = h('div.grid.g3', { style: 'margin-bottom:14px' }, summaryCards(paid));
    view.appendChild(summary);

    /* ── 표 ── */
    var tbl = h('table');
    var thr = h('tr', h('th.name', { text: '회원' }));
    MONTHS.forEach(function (m) {
      thr.appendChild(h('th', admin ? {
        text: m + '월', title: '클릭하면 ' + m + '월 전원 납입/해제',
        style: 'cursor:pointer',
        onclick: function () { toggleMonth(m); }
      } : { text: m + '월' }));
    });
    thr.appendChild(h('th', { text: '합계' }));
    thr.appendChild(h('th', { text: '미납', title: elapsed + '개월분(' + UI.money(duty) + ') 기준으로 모자란 금액' }));
    tbl.appendChild(h('thead', thr));

    var tbody = h('tbody');
    members.forEach(function (mb) {
      var tr = h('tr', { 'data-mid': mb.id });
      tr.appendChild(h('td.name', admin ? {
        text: mb.name, title: '클릭하면 ' + mb.name + ' 12개월 전체 납입/해제',
        style: 'cursor:pointer', onclick: function () { toggleRow(mb.id); }
      } : { text: mb.name }));
      MONTHS.forEach(function (m) { tr.appendChild(h('td', cellBtn(mb, m))); });
      tr.appendChild(h('td', { class: 'sum', text: UI.num(memberTotal(year, mb.id)) }));
      tr.appendChild(h('td', { class: 'rest', text: UI.num(Math.max(0, duty - memberTotal(year, mb.id))) }));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);

    var tfr = h('tr', h('td.name', { text: '월 합계' }));
    MONTHS.forEach(function (m) { tfr.appendChild(h('td', { 'data-mtot': m, text: UI.num(monthTotal(year, m)) })); });
    tfr.appendChild(h('td', { 'data-gtot': 1, text: UI.num(paid) }));
    tfr.appendChild(h('td', { text: '' }));
    tbl.appendChild(h('tfoot', tfr));

    view.appendChild(h('div.card',
      h('div.spread', h('h2', { text: year + '년 회비 납입 현황' }),
        h('span.tiny.muted', { text: admin
          ? '칸을 누르면 납입 처리 · 꾹 누르거나 더블클릭하면 금액 직접 입력'
          : '보기 전용입니다. 회비 입력은 운영진이 합니다.' })),
      h('div.scroll', { style: 'max-height:62vh' }, tbl)
    ));

    function cellBtn(mb, m) {
      var amt = cellAmt(year, mb.id, m);
      var future = (year > now.getFullYear()) || (year === now.getFullYear() && m > now.getMonth() + 1);
      var cls = 'cell' + (amt >= due && amt > 0 ? ' paid' : amt > 0 ? ' part' : future ? ' future' : '');
      var attrs = {
        class: cls, 'data-m': m, 'data-mid': mb.id,
        text: amt > 0 ? (amt === due ? '✓' : UI.num(amt / 10000) + '만') : '·',
        title: mb.name + ' ' + year + '년 ' + m + '월' + (amt ? ' — ' + UI.money(amt) : ' — 미납')
      };
      if (!admin) { attrs.disabled = true; attrs.style = 'cursor:default'; return h('button', attrs); }
      attrs.onclick = function () {
        var cur = cellAmt(year, mb.id, m);
        setCell(year, mb.id, m, cur > 0 ? 0 : due); refresh();
      };
      attrs.ondblclick = function (e) { e.preventDefault(); askAmount(mb, m); };
      attrs.oncontextmenu = function (e) { e.preventDefault(); askAmount(mb, m); };
      var b = h('button', attrs);
      var t;
      b.addEventListener('touchstart', function () { t = setTimeout(function () { askAmount(mb, m); }, 600); }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) { b.addEventListener(ev, function () { clearTimeout(t); }); });
      return b;
    }

    function askAmount(mb, m) {
      var inp = h('input', { type: 'number', step: 10000, value: cellAmt(year, mb.id, m) || due, inputmode: 'numeric' });
      UI.modal(mb.name + ' · ' + year + '년 ' + m + '월 회비',
        UI.field('납입 금액 (원)', inp, '0 을 넣으면 미납으로 돌아갑니다'),
        [{ label: '취소' }, {
          label: '저장', cls: 'pri', run: function () {
            setCell(year, mb.id, m, UI.parseNum(inp.value)); refresh();
          }
        }]);
    }
    function toggleMonth(m) {
      var allPaid = members.every(function (mb) { return cellAmt(year, mb.id, m) > 0; });
      members.forEach(function (mb) { setCell(year, mb.id, m, allPaid ? 0 : due); });
      refresh(); UI.toast(m + '월 ' + (allPaid ? '전원 미납 처리' : '전원 납입 처리'));
    }
    function toggleRow(mid) {
      var allPaid = MONTHS.every(function (m) { return cellAmt(year, mid, m) > 0; });
      MONTHS.forEach(function (m) { setCell(year, mid, m, allPaid ? 0 : due); });
      refresh();
    }

    function refresh() {
      var p = 0;
      members.forEach(function (mb) {
        var tr = tbody.querySelector('tr[data-mid="' + mb.id + '"]');
        MONTHS.forEach(function (m) {
          var amt = cellAmt(year, mb.id, m);
          var b = tr.querySelector('button[data-m="' + m + '"]');
          var future = (year > now.getFullYear()) || (year === now.getFullYear() && m > now.getMonth() + 1);
          b.className = 'cell' + (amt >= due && amt > 0 ? ' paid' : amt > 0 ? ' part' : future ? ' future' : '');
          b.textContent = amt > 0 ? (amt === due ? '✓' : UI.num(amt / 10000) + '만') : '·';
          b.title = mb.name + ' ' + year + '년 ' + m + '월' + (amt ? ' — ' + UI.money(amt) : ' — 미납');
        });
        var tot = memberTotal(year, mb.id); p += tot;
        tr.querySelector('.sum').textContent = UI.num(tot);
        tr.querySelector('.rest').textContent = UI.num(Math.max(0, duty - tot));
      });
      MONTHS.forEach(function (m) { tfr.querySelector('[data-mtot="' + m + '"]').textContent = UI.num(monthTotal(year, m)); });
      tfr.querySelector('[data-gtot]').textContent = UI.num(p);
      summary.textContent = '';
      summaryCards(p).forEach(function (s) { summary.appendChild(s); });
    }

    function copyUnpaid() {
      var lines = ['[사구회 ' + year + '년 회비 현황]', '월 회비 ' + UI.money(due), ''];
      var any = false;
      members.forEach(function (mb) {
        var miss = MONTHS.filter(function (m) {
          if (year === now.getFullYear() && m > now.getMonth() + 1) return false;
          return cellAmt(year, mb.id, m) < due;
        });
        if (miss.length) {
          any = true;
          lines.push('· ' + mb.name + ' — ' + miss.join(', ') + '월 미납 (' +
            UI.money(miss.reduce(function (s, m) { return s + (due - cellAmt(year, mb.id, m)); }, 0)) + ')');
        }
      });
      if (!any) lines.push('지금까지 전원 완납입니다. 👏');
      UI.copy(lines.join('\n'));
    }

    /* ── 연도별 누적 ── */
    var ys = Object.keys(SG.db.dues.years).sort();
    if (ys.length) {
      var t2 = h('table');
      t2.appendChild(h('thead', h('tr', h('th.name', { text: '회원' }),
        ys.map(function (y) { return h('th', { text: y }); }), h('th', { text: '누적' }))));
      var b2 = h('tbody');
      members.forEach(function (mb) {
        var row = h('tr', h('td.name', { text: mb.name }));
        var tot = 0;
        ys.forEach(function (y) {
          var v = memberTotal(+y, mb.id); tot += v;
          row.appendChild(h('td', { text: v ? UI.num(v) : '·', class: v ? '' : 'muted' }));
        });
        row.appendChild(h('td', { text: UI.num(tot), style: 'font-weight:700' }));
        b2.appendChild(row);
      });
      t2.appendChild(b2);
      t2.appendChild(h('tfoot', h('tr', h('td.name', { text: '연 합계' }),
        ys.map(function (y) {
          return h('td', { text: UI.num(MONTHS.reduce(function (s, m) { return s + monthTotal(+y, m); }, 0)) });
        }),
        h('td', { text: UI.num(grandTotal()) }))));
      view.appendChild(h('div.card',
        h('h2', { text: '연도별 누적' }),
        h('div.scroll', t2)
      ));
    }
  };
})();
