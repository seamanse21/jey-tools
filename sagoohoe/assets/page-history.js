/* 히스토리 — 모임 기록 · 참석 · 사진 · 안건 투표 */
(function () {
  var h = UI.h;
  var SEASONS = ['여름(7월 첫째주)', '겨울(11월 셋째주)', '임시모임'];
  var VOTES = ['찬성', '반대', '기권'];

  function name(mid) {
    var m = SG.db.members.filter(function (x) { return x.id === mid; })[0];
    return m ? m.name : '(탈퇴 회원)';
  }
  function tally(ag) {
    var t = { 찬성: 0, 반대: 0, 기권: 0 };
    for (var k in (ag.votes || {})) if (t[ag.votes[k]] !== undefined) t[ag.votes[k]]++;
    return t;
  }
  function decide(ag, attendeeCount) {
    if (ag.status && ag.status !== 'auto') return ag.status;
    var t = tally(ag), voted = t.찬성 + t.반대 + t.기권;
    var base = attendeeCount || voted;
    if (!voted) return '투표 전';
    return t.찬성 > base / 2 ? '가결' : (t.반대 >= t.찬성 ? '부결' : '보류');
  }
  function statusTag(s) {
    var cls = s === '가결' ? 'ok' : s === '부결' ? 'no' : s === '보류' ? 'warn' : 'flat';
    return h('span', { class: 'tag ' + cls, text: s });
  }

  window.PAGES = window.PAGES || {};
  window.PAGES.history = function (view) {
    var H = SG.db.history;
    var members = SG.db.members;

    var total = H.meetings.length;
    var avg = total ? Math.round(H.meetings.reduce(function (s, m) { return s + (m.attendees || []).length; }, 0) / total * 10) / 10 : 0;
    var agCount = H.meetings.reduce(function (s, m) { return s + (m.agendas || []).length; }, 0);
    var passed = H.meetings.reduce(function (s, m) {
      return s + (m.agendas || []).filter(function (a) { return decide(a, (m.attendees || []).length) === '가결'; }).length;
    }, 0);

    view.appendChild(h('div.grid.g3', { style: 'margin-bottom:14px' },
      UI.stat('기록된 모임', total + '회'),
      UI.stat('평균 참석', avg + '명', '전체 ' + members.length + '명 중'),
      UI.stat('안건', agCount + '건', '가결 ' + passed + '건'),
      UI.stat('최근 모임', H.meetings.length ? UI.dateKo(sorted()[0].date) : '—')
    ));

    view.appendChild(h('div.card', h('div.spread',
      h('h2', { text: '모임 히스토리' }),
      h('button.btn.pri', { text: '+ 모임 기록 추가', onclick: addMeeting })
    )));

    function sorted() {
      return H.meetings.slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    }

    var list = h('div');
    view.appendChild(list);
    renderList();

    function renderList() {
      list.textContent = '';
      var ms = sorted();
      if (!ms.length) { list.appendChild(h('div.card', h('div.empty', '아직 기록된 모임이 없습니다. 위의 “모임 기록 추가”를 눌러 시작하세요.'))); return; }
      var curYear = null;
      ms.forEach(function (m) {
        var y = (m.date || '').slice(0, 4) || '연도 미입력';
        if (y !== curYear) {
          curYear = y;
          list.appendChild(h('h3', { text: y + '년', style: 'margin:18px 0 8px;font-size:15px;color:var(--dim)' }));
        }
        list.appendChild(card(m));
      });
    }

    function card(m) {
      var open = false;
      var body = h('div.acc-body', { hidden: true });
      var att = (m.attendees || []).length;
      var btn = h('button.acc', {
        onclick: function () {
          open = !open; body.hidden = !open;
          if (open && !body.dataset.built) { buildBody(m, body); body.dataset.built = '1'; }
        }
      },
        h('div',
          h('h4', { text: (m.season || '모임') + ' · ' + (m.place || '장소 미입력') }),
          h('div.meta', { text: UI.dateKo(m.date) + ' · 참석 ' + att + '명' + (m.spend ? ' · 지출 ' + UI.money(m.spend) : '') })
        ),
        h('div.row',
          (m.agendas || []).length ? h('span.tag.flat', { text: '안건 ' + m.agendas.length }) : null,
          (m.photos || []).length ? h('span.tiny.muted', { text: '📷 ' + m.photos.length }) : null,
          h('span.muted', { text: '▾' })
        )
      );
      return h('div.item.pad0', btn, body);
    }

    function buildBody(m, body) {
      var saveSoon = function () { SG.save('history'); };

      /* 기본 정보 */
      var dateI = h('input', { type: 'date', value: m.date || '', oninput: function () { m.date = dateI.value; saveSoon(); } });
      var seasonS = UI.select(SEASONS, m.season, function (v) { m.season = v; saveSoon(); });
      var placeI = h('input', { value: m.place || '', placeholder: '예: 강릉 안목해변 펜션', oninput: function () { m.place = placeI.value; saveSoon(); } });
      var spendI = h('input', { type: 'number', value: m.spend || '', placeholder: '0', oninput: function () { m.spend = UI.parseNum(spendI.value); saveSoon(); } });
      body.appendChild(h('div.grid.g2', { style: 'margin-top:14px' },
        UI.field('날짜', dateI), UI.field('구분', seasonS),
        UI.field('장소', placeI), UI.field('모임 총 지출 (원)', spendI)
      ));

      /* 참석자 */
      var chips = h('div.chips');
      function drawChips() {
        chips.textContent = '';
        members.forEach(function (mb) {
          var on = (m.attendees || []).indexOf(mb.id) >= 0;
          chips.appendChild(h('button', {
            class: 'chip' + (on ? ' on' : ' out'), text: mb.name,
            onclick: function () {
              m.attendees = m.attendees || [];
              var i = m.attendees.indexOf(mb.id);
              if (i >= 0) m.attendees.splice(i, 1); else m.attendees.push(mb.id);
              saveSoon(); drawChips(); drawAgendas();
            }
          }));
        });
        var absent = members.filter(function (mb) { return (m.attendees || []).indexOf(mb.id) < 0; });
        chips.appendChild(h('span.tiny.muted', {
          style: 'align-self:center;margin-left:4px',
          text: '참석 ' + (m.attendees || []).length + '명' + (absent.length ? ' · 불참 ' + absent.map(function (x) { return x.name; }).join(', ') : '')
        }));
      }
      drawChips();
      body.appendChild(h('div', { style: 'margin-top:12px' }, h('label.f', { text: '참석자 (이름을 눌러 켜고 끔)' }), chips));

      /* 사진 */
      m.photos = m.photos || [];
      body.appendChild(h('div', { style: 'margin-top:14px' },
        UI.attach(m.photos, 'photos', (m.date || 'etc').slice(0, 7) + '-' + (m.season || '').slice(0, 2), saveSoon, '모임 사진')));

      /* 메모 */
      var memoT = h('textarea', { placeholder: '그날 있었던 일, 결정 사항, 다음 모임 약속 등', value: m.memo || '', oninput: function () { m.memo = memoT.value; saveSoon(); } });
      body.appendChild(h('div', { style: 'margin-top:14px' }, UI.field('메모', memoT)));

      /* 안건 */
      var agWrap = h('div');
      body.appendChild(h('div', { style: 'margin-top:16px' },
        h('div.spread', h('h4', { text: '안건 · 투표' }),
          h('button.btn.sm', {
            text: '+ 안건 추가', onclick: function () {
              m.agendas = m.agendas || [];
              m.agendas.push({ id: SG.uid('ag'), title: '', body: '', proposer: '', votes: {}, status: 'auto' });
              saveSoon(); drawAgendas();
            }
          })),
        agWrap));
      drawAgendas();

      function drawAgendas() {
        agWrap.textContent = '';
        var ags = m.agendas || [];
        if (!ags.length) { agWrap.appendChild(h('div.empty.small', '안건이 없습니다. 모임에서 나온 발전 안건을 적고 참석자별로 투표하세요.')); return; }
        ags.forEach(function (ag, idx) {
          var voters = (m.attendees || []).length ? m.attendees : members.map(function (x) { return x.id; });
          var t = tally(ag), st = decide(ag, voters.length);

          var titleI = h('input', { value: ag.title || '', placeholder: '안건 제목 (예: 회비 7만원 인상)', oninput: function () { ag.title = titleI.value; saveSoon(); redrawHead(); } });
          var bodyT = h('textarea', { style: 'min-height:64px', value: ag.body || '', placeholder: '안건 내용 · 배경 · 제안 이유', oninput: function () { ag.body = bodyT.value; saveSoon(); } });
          var propS = UI.select([{ value: '', label: '발의자 선택' }].concat(members.map(function (x) { return { value: x.id, label: x.name }; })),
            ag.proposer, function (v) { ag.proposer = v; saveSoon(); });
          var statS = UI.select([{ value: 'auto', label: '자동 판정 (' + st + ')' }, '가결', '부결', '보류', '투표 전'],
            ag.status || 'auto', function (v) { ag.status = v; saveSoon(); drawAgendas(); });

          var head = h('div.spread');
          function redrawHead() {
            head.textContent = '';
            head.appendChild(h('div.row', h('b', { text: (idx + 1) + '. ' + (ag.title || '제목 없는 안건') }), statusTag(decide(ag, voters.length))));
            head.appendChild(h('span.tiny.muted', { text: '찬성 ' + t.찬성 + ' · 반대 ' + t.반대 + ' · 기권 ' + t.기권 }));
          }
          redrawHead();

          var votesBox = h('div', { style: 'margin-top:10px' });
          voters.forEach(function (mid) {
            var opts = h('div.opts');
            VOTES.forEach(function (v) {
              opts.appendChild(h('button', {
                'data-v': v, text: v,
                class: (ag.votes || {})[mid] === v ? 'on' : '',
                onclick: function () {
                  ag.votes = ag.votes || {};
                  if (ag.votes[mid] === v) delete ag.votes[mid]; else ag.votes[mid] = v;
                  saveSoon(); drawAgendas();
                }
              }));
            });
            votesBox.appendChild(h('div.vote', h('span', { text: name(mid) }), opts));
          });

          agWrap.appendChild(h('div.item',
            head,
            h('div.grid.g2', { style: 'margin-top:10px' }, UI.field('제목', titleI), UI.field('발의자', propS)),
            h('div', { style: 'margin-top:8px' }, UI.field('내용', bodyT)),
            h('div', { style: 'margin-top:10px' }, h('label.f', { text: '참석자 투표' }), votesBox),
            h('div.grid.g2', { style: 'margin-top:10px' }, UI.field('선정 결과', statS),
              h('div', h('label.f', { text: ' ' }), h('button.btn.sm.danger', {
                text: '이 안건 삭제', onclick: function () {
                  UI.confirm('안건 “' + (ag.title || '제목 없음') + '” 을 삭제합니다.', function () {
                    m.agendas.splice(idx, 1); saveSoon(); drawAgendas(); UI.toast('삭제했습니다');
                  }, '삭제');
                }
              })))
          ));
        });
      }

      /* 하단 도구 */
      body.appendChild(h('div.row', { style: 'margin-top:16px' },
        h('button.btn.sm', { text: '요약 복사', onclick: function () { UI.copy(summaryText(m)); } }),
        h('button.btn.sm.danger', {
          text: '모임 기록 삭제', onclick: function () {
            UI.confirm((UI.dateKo(m.date) || '이 모임') + ' 기록 전체를 삭제합니다.', function () {
              H.meetings = H.meetings.filter(function (x) { return x !== m; });
              SG.db.history.meetings = H.meetings; SG.save('history'); renderList(); UI.toast('삭제했습니다');
            }, '삭제');
          }
        })
      ));
    }

    function summaryText(m) {
      var L = ['[사구회 ' + (m.season || '모임') + ' — ' + UI.dateKo(m.date) + ']'];
      L.push('장소: ' + (m.place || '-'));
      L.push('참석(' + (m.attendees || []).length + '명): ' + (m.attendees || []).map(name).join(', '));
      if (m.spend) L.push('총 지출: ' + UI.money(m.spend));
      if (m.memo) L.push('', m.memo);
      if ((m.agendas || []).length) {
        L.push('', '◆ 안건');
        m.agendas.forEach(function (a, i) {
          var t = tally(a);
          L.push((i + 1) + '. ' + (a.title || '제목 없음') + ' → ' + decide(a, (m.attendees || []).length) +
            ' (찬 ' + t.찬성 + '/반 ' + t.반대 + '/기 ' + t.기권 + ')');
          if (a.body) L.push('   ' + a.body.replace(/\n/g, '\n   '));
        });
      }
      return L.join('\n');
    }

    function addMeeting() {
      var now = new Date();
      var m = {
        id: SG.uid('mt'), date: UI.today(),
        season: now.getMonth() + 1 >= 10 || now.getMonth() + 1 <= 2 ? SEASONS[1] : SEASONS[0],
        place: '', attendees: members.map(function (x) { return x.id; }), memo: '', spend: 0, photos: [], agendas: []
      };
      H.meetings.push(m); SG.save('history'); renderList(); UI.toast('모임을 추가했습니다. 펼쳐서 내용을 채우세요.');
    }
  };
})();
