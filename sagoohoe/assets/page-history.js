/* 히스토리 — 운영진이 모임(이벤트)을 만들고, 회원은 각자 찍은 사진을 올린다.
 * 과거 모임도 연도만 알면 등록할 수 있다 (날짜는 비워둬도 된다). */
(function () {
  var h = UI.h;
  var SEASONS = ['여름(7월 첫째주)', '겨울(11월 셋째주)', '임시모임'];
  var VOTES = ['찬성', '반대', '기권'];

  function name(mid) {
    var m = SG.db.members.filter(function (x) { return x.id === mid; })[0];
    return m ? m.name : '(탈퇴 회원)';
  }
  function meName() {
    var id = sessionStorage.getItem('sg.me') || '';
    var m = SG.db.members.filter(function (x) { return x.id === id; })[0];
    return m ? m.name : '';
  }
  function yearOf(m) { return +m.year || +String(m.date || '').slice(0, 4) || 0; }
  function sortKey(m) {
    return String(yearOf(m) || 0) + '-' + (m.date || '0000-00-00') + '-' + (m.season || '');
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
  function whenText(m) {
    if (m.date) return UI.dateKo(m.date);
    var y = yearOf(m);
    return y ? y + '년 (날짜 미상)' : '날짜 미상';
  }

  window.PAGES = window.PAGES || {};
  window.PAGES.history = function (view) {
    var H = SG.db.history;
    H.meetings = H.meetings || [];
    var members = SG.db.members;
    var admin = SG.isAdmin();
    var saveSoon = function () { SG.save('history'); };

    /* ── 요약 ── */
    var total = H.meetings.length;
    var avg = total ? Math.round(H.meetings.reduce(function (s, m) { return s + (m.attendees || []).length; }, 0) / total * 10) / 10 : 0;
    var agCount = H.meetings.reduce(function (s, m) { return s + (m.agendas || []).length; }, 0);
    var passed = H.meetings.reduce(function (s, m) {
      return s + (m.agendas || []).filter(function (a) { return decide(a, (m.attendees || []).length) === '가결'; }).length;
    }, 0);
    var photoCount = H.meetings.reduce(function (s, m) { return s + (m.photos || []).length; }, 0);

    view.appendChild(h('div.grid.g3', { style: 'margin-bottom:14px' },
      UI.stat('기록된 모임', total + '회'),
      UI.stat('평균 참석', avg + '명', '전체 ' + members.length + '명 중'),
      UI.stat('안건', agCount + '건', '가결 ' + passed + '건'),
      UI.stat('사진', photoCount + '장', total ? '최근 ' + whenText(sorted()[0]) : '')
    ));

    view.appendChild(h('div.card', h('div.spread',
      h('div', h('h2', { text: '모임 히스토리' }),
        h('p.small.muted', { style: 'margin:0', text: admin
          ? '모임을 하나 만들면 회원들이 각자 찍은 사진을 그 모임에 올립니다. 옛날 모임은 연도만 알아도 등록할 수 있습니다.'
          : '모임을 눌러 펼치고, 그날 찍은 사진을 올려 주세요.' })),
      admin ? h('button.btn.pri', { text: '+ 새 모임 만들기', onclick: newMeeting }) : null
    )));

    function sorted() {
      return H.meetings.slice().sort(function (a, b) { return sortKey(b).localeCompare(sortKey(a)); });
    }

    var list = h('div');
    view.appendChild(list);
    renderList();

    function renderList() {
      list.textContent = '';
      var ms = sorted();
      if (!ms.length) {
        list.appendChild(h('div.card', h('div.empty', admin
          ? '아직 기록된 모임이 없습니다. 위의 “새 모임 만들기”로 시작하세요.'
          : '아직 기록된 모임이 없습니다.')));
        return;
      }
      var cur = null;
      ms.forEach(function (m) {
        var y = yearOf(m) || '연도 미상';
        if (y !== cur) {
          cur = y;
          list.appendChild(h('h3', { text: y + (y === '연도 미상' ? '' : '년'),
            style: 'margin:18px 0 8px;font-size:15px;color:var(--dim)' }));
        }
        list.appendChild(card(m));
      });
    }

    function card(m) {
      var body = h('div.acc-body', { hidden: true });
      var att = (m.attendees || []).length;
      var btn = h('button.acc', {
        onclick: function () {
          body.hidden = !body.hidden;
          if (!body.hidden && !body.dataset.built) { buildBody(m, body); body.dataset.built = '1'; }
        }
      },
        h('div',
          h('h4', { text: (m.season || '모임') + ' · ' + (m.place || '장소 미입력') }),
          h('div.meta', { text: whenText(m) + ' · 참석 ' + att + '명' + (m.spend ? ' · 지출 ' + UI.money(m.spend) : '') })
        ),
        h('div.row',
          (m.agendas || []).length ? h('span.tag.flat', { text: '안건 ' + m.agendas.length }) : null,
          (m.photos || []).length ? h('span.tiny.muted', { text: '📷 ' + m.photos.length }) : null,
          h('span.muted', { text: '▾' })
        )
      );
      return h('div.item.pad0', btn, body);
    }

    /* ── 모임 펼쳤을 때 ── */
    function buildBody(m, body) {
      m.photos = m.photos || [];
      if (admin) buildAdminBody(m, body);
      else buildMemberBody(m, body);
    }

    /* 회원 — 내용은 읽기만, 사진은 올릴 수 있다 */
    function buildMemberBody(m, body) {
      body.appendChild(h('div.grid.g2', { style: 'margin-top:14px' },
        info('날짜', whenText(m)),
        info('구분', m.season || '-'),
        info('장소', m.place || '-'),
        info('모임 총 지출', m.spend ? UI.money(m.spend) : '-')
      ));
      var att = (m.attendees || []).map(name);
      body.appendChild(h('div', { style: 'margin-top:12px' },
        h('label.f', { text: '참석자 ' + att.length + '명' }),
        h('div.small', { text: att.length ? att.join(', ') : '-' })));
      if (m.memo) body.appendChild(h('div', { style: 'margin-top:12px' },
        h('label.f', { text: '메모' }), h('div.small', { style: 'white-space:pre-wrap', text: m.memo })));

      body.appendChild(h('div.sep'));
      var photoWrap = h('div');
      body.appendChild(photoWrap);
      drawPhotos();

      function drawPhotos() {
        photoWrap.textContent = '';
        var who = meName();
        photoWrap.appendChild(h('div.spread',
          h('h4', { text: '사진' }),
          who ? h('span.tiny.muted', { text: who + ' 이름으로 올라갑니다' }) : null));

        if (!who) {
          /* 누가 올렸는지 남겨야 하므로 이름부터 고르게 한다 */
          var pickMe = UI.select([{ value: '', label: '이름을 고르세요' }]
            .concat(members.map(function (x) { return { value: x.id, label: x.name }; })), '',
            function (v) {
              if (!v) return;
              sessionStorage.setItem('sg.me', v);
              try { localStorage.setItem('sg.me', v); } catch (e) { }
              var sel = document.getElementById('me');
              if (sel) sel.value = v;
              drawPhotos();
            });
          photoWrap.appendChild(h('div.card', { style: 'margin-top:8px;border-color:var(--warn)' },
            h('p.small', { style: 'margin:0 0 8px' }, h('b', { text: '사진을 올리기 전에 누구신지 알려 주세요.' }),
              ' 올린 사람 이름이 사진 아래 남습니다.'),
            pickMe));
          if (m.photos.length) photoWrap.appendChild(h('div', { style: 'margin-top:12px' }, UI.attachView(m.photos)));
          return;
        }

        photoWrap.appendChild(UI.attach(m.photos, 'photos', folderOf(m), saveSoon, '내가 찍은 사진',
          { by: who, canDelete: function (f) { return !f.by || f.by === who; } }));
      }

      if ((m.agendas || []).length) {
        body.appendChild(h('div.sep'));
        body.appendChild(h('h4', { text: '안건 결과' }));
        m.agendas.forEach(function (ag, i) {
          var t = tally(ag);
          body.appendChild(h('div.item',
            h('div.spread',
              h('b', { text: (i + 1) + '. ' + (ag.title || '제목 없는 안건') }),
              statusTag(decide(ag, (m.attendees || []).length))),
            ag.body ? h('div.small', { style: 'white-space:pre-wrap;margin-top:6px', text: ag.body }) : null,
            h('div.tiny.muted', { style: 'margin-top:6px', text: '찬성 ' + t.찬성 + ' · 반대 ' + t.반대 + ' · 기권 ' + t.기권 })));
        });
      }

      body.appendChild(h('div.row', { style: 'margin-top:16px' },
        h('button.btn.sm', { text: '요약 복사', onclick: function () { UI.copy(summaryText(m)); } })));
    }
    function info(label, value) {
      return h('div', h('label.f', { text: label }), h('div.small', { text: value }));
    }
    function folderOf(m) {
      var y = yearOf(m) || '기타';
      return y + '-' + (m.season || '모임').slice(0, 2);
    }

    /* 운영진 — 전부 고칠 수 있다 */
    function buildAdminBody(m, body) {
      var years = yearList();
      var yearS = UI.select(years, yearOf(m) || years[0], function (v) { m.year = +v; saveSoon(); });
      var dateI = h('input', {
        type: 'date', value: m.date || '', min: years[years.length - 1] + '-01-01',
        oninput: function () {
          m.date = dateI.value;
          if (m.date) { m.year = +m.date.slice(0, 4); yearS.value = String(m.year); }
          saveSoon();
        }
      });
      var seasonS = UI.select(SEASONS, m.season, function (v) { m.season = v; saveSoon(); });
      var placeI = h('input', { value: m.place || '', placeholder: '예: 강릉 안목해변 펜션', oninput: function () { m.place = placeI.value; saveSoon(); } });
      var spendI = h('input', { type: 'number', value: m.spend || '', placeholder: '0', oninput: function () { m.spend = UI.parseNum(spendI.value); saveSoon(); } });

      body.appendChild(h('div.grid.g2', { style: 'margin-top:14px' },
        UI.field('날짜', dateI, '달력에서 고르거나 숫자로 바로 입력'),
        UI.field('연도', yearS, '날짜를 모를 때만 쓰세요'),
        UI.field('구분', seasonS),
        UI.field('장소', placeI),
        UI.field('모임 총 지출 (원)', spendI)
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
      body.appendChild(h('div', { style: 'margin-top:14px' },
        UI.attach(m.photos, 'photos', folderOf(m), saveSoon, '모임 사진', { by: meName() })));

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

      body.appendChild(h('div.row', { style: 'margin-top:16px' },
        h('button.btn.sm', { text: '요약 복사', onclick: function () { UI.copy(summaryText(m)); } }),
        h('button.btn.sm.danger', {
          text: '모임 기록 삭제', onclick: function () {
            UI.confirm((whenText(m) || '이 모임') + ' 기록을 사진까지 통째로 삭제합니다.', function () {
              H.meetings = H.meetings.filter(function (x) { return x !== m; });
              SG.db.history.meetings = H.meetings; saveSoon(); renderList(); UI.toast('삭제했습니다');
            }, '삭제');
          }
        })
      ));
    }

    function summaryText(m) {
      var L = ['[사구회 ' + (m.season || '모임') + ' — ' + whenText(m) + ']'];
      L.push('장소: ' + (m.place || '-'));
      L.push('참석(' + (m.attendees || []).length + '명): ' + (m.attendees || []).map(name).join(', '));
      if (m.spend) L.push('총 지출: ' + UI.money(m.spend));
      if ((m.photos || []).length) L.push('사진: ' + m.photos.length + '장');
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

    function yearList() {
      var now = new Date().getFullYear();
      var start = +SG.db.settings.startYear || 2006;
      var ys = [];
      for (var y = now + 1; y >= start; y--) ys.push(y);
      return ys;
    }

    /* ── 새 모임 만들기 ── */
    function newMeeting() {
      var now = new Date();
      var years = yearList();
      var pick = { attendees: members.map(function (x) { return x.id; }) };

      pick.year = now.getFullYear();
      var yearS = UI.select(years, now.getFullYear(), function (v) { pick.year = +v; });
      var dateI = h('input', {
        type: 'date', min: years[years.length - 1] + '-01-01',
        oninput: function () {
          if (dateI.value) { pick.year = +dateI.value.slice(0, 4); yearS.value = String(pick.year); }
        }
      });
      var seasonS = UI.select(SEASONS, (now.getMonth() + 1 >= 10 || now.getMonth() + 1 <= 2) ? SEASONS[1] : SEASONS[0],
        function (v) { pick.season = v; });
      pick.season = seasonS.value;
      var placeI = h('input', { placeholder: '예: 강릉 안목해변 펜션' });
      var memoT = h('textarea', { style: 'min-height:70px', placeholder: '그날 있었던 일, 결정 사항 등 (나중에 적어도 됩니다)' });
      var spendI = h('input', { type: 'number', placeholder: '0' });

      var chips = h('div.chips');
      function drawPick() {
        chips.textContent = '';
        members.forEach(function (mb) {
          var on = pick.attendees.indexOf(mb.id) >= 0;
          chips.appendChild(h('button', {
            class: 'chip' + (on ? ' on' : ' out'), text: mb.name,
            onclick: function () {
              var i = pick.attendees.indexOf(mb.id);
              if (i >= 0) pick.attendees.splice(i, 1); else pick.attendees.push(mb.id);
              drawPick();
            }
          }));
        });
        chips.appendChild(h('span.tiny.muted', { style: 'align-self:center;margin-left:4px', text: pick.attendees.length + '명' }));
      }
      drawPick();

      UI.modal('새 모임 만들기',
        h('div',
          h('p.small.muted', { style: 'margin:0 0 12px', text: '지난 모임도 여기서 등록합니다. 날짜가 기억나지 않으면 비워두고 연도만 고르세요.' }),
          h('div.grid.g2',
            UI.field('날짜', dateI, '달력에서 고르거나 숫자로 바로 입력 (예: 2008-07-05)'),
            UI.field('연도', yearS, '날짜를 모를 때만 쓰세요'),
            UI.field('구분', seasonS),
            UI.field('장소', placeI),
            UI.field('모임 총 지출 (원)', spendI)
          ),
          h('div', { style: 'margin-top:12px' }, h('label.f', { text: '참석자' }), chips),
          h('div', { style: 'margin-top:12px' }, UI.field('메모', memoT))
        ),
        [{ label: '취소' }, {
          label: '만들기', cls: 'pri', run: function () {
            var m = {
              id: SG.uid('mt'),
              year: dateI.value ? +dateI.value.slice(0, 4) : pick.year,
              date: dateI.value || '',
              season: pick.season,
              place: placeI.value.trim(),
              attendees: pick.attendees.slice(),
              memo: memoT.value,
              spend: UI.parseNum(spendI.value),
              photos: [], agendas: []
            };
            H.meetings.push(m);
            saveSoon();
            renderList();
            UI.toast('모임을 만들었습니다. 펼쳐서 안건과 사진을 채우세요.');
          }
        }]);
    }
  };
})();
