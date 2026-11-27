/* 회칙 — 현행 조항 + 개정 이력(버전 보관·되돌리기) */
(function () {
  var h = UI.h;

  window.PAGES = window.PAGES || {};
  window.PAGES.rules = function (view, params) {
    var R = SG.db.rules;
    R.articles = R.articles || [];
    R.history = R.history || [];
    var admin = SG.isAdmin();
    var tab = params.t || 'now';
    var S = function () { SG.save('rules'); };

    view.appendChild(h('div.card',
      h('div.spread',
        h('div.chips',
          h('a', { class: 'chip' + (tab === 'now' ? ' on' : ''), href: '#/rules?t=now', text: '현행 회칙', style: 'text-decoration:none' }),
          h('a', { class: 'chip' + (tab === 'log' ? ' on' : ''), href: '#/rules?t=log', text: '개정 이력 ' + R.history.length, style: 'text-decoration:none' })
        ),
        h('div.row',
          h('button.btn.sm', { text: '전문 복사', onclick: function () { UI.copy(fullText(R.articles)); } }),
          h('button.btn.sm', { text: '인쇄', onclick: function () { window.print(); } })
        )
      )
    ));

    if (tab === 'log') return drawLog();
    drawNow();

    /* ── 현행 회칙 ── */
    function drawNow() {
      var edit = admin && sessionStorage.getItem('sg.rulesEdit') === '1';
      var wrap = h('div.card');
      wrap.appendChild(h('div.spread',
        h('div',
          h('h2', { text: '사구회 회칙' }),
          h('p.small.muted', { style: 'margin:0', text: R.history.length
            ? '최종 개정 ' + UI.dateKo(R.history[R.history.length - 1].at) + ' · ' + (R.history[R.history.length - 1].reason || '')
            : '아직 개정 이력이 없습니다.' })),
        h('div.row',
          admin ? h('button', {
            class: 'btn sm' + (edit ? ' pri' : ''), text: edit ? '편집 끝내기' : '편집',
            onclick: function () { sessionStorage.setItem('sg.rulesEdit', edit ? '0' : '1'); PAGES._reload(); }
          }) : null,
          (admin && edit) ? h('button.btn.sm.pri', { text: '개정 확정', onclick: commit }) : null
        )
      ));
      wrap.appendChild(h('div.sep'));

      if (!R.articles.length) {
        wrap.appendChild(h('div.empty', '조항이 없습니다. 편집을 눌러 제1조부터 적어 주세요.'));
      }

      R.articles.forEach(function (a, i) {
        if (!edit) {
          wrap.appendChild(h('section', { style: 'margin-bottom:16px' },
            h('h3', { style: 'font-size:15px', text: '제' + (i + 1) + '조 (' + (a.title || '제목 없음') + ')' }),
            h('div', { style: 'white-space:pre-wrap', text: a.body || '' }),
            a.since ? h('div.tiny.muted', { style: 'margin-top:3px', text: '시행 ' + UI.dateKo(a.since) }) : null
          ));
          return;
        }
        var titleI = h('input', { value: a.title || '', placeholder: '조 제목 (예: 목적)', oninput: function () { a.title = titleI.value; S(); } });
        var bodyT = h('textarea', { value: a.body || '', placeholder: '조항 내용. 항은 ① ② ③ 또는 1. 2. 3. 으로 줄을 나눠 적습니다.', oninput: function () { a.body = bodyT.value; S(); } });
        var sinceI = h('input', { type: 'date', value: a.since || '', oninput: function () { a.since = sinceI.value; S(); } });
        wrap.appendChild(h('div.item',
          h('div.spread', h('b', { text: '제' + (i + 1) + '조' }),
            h('div.row',
              h('button.btn.sm', { text: '↑', title: '위로', disabled: i === 0, onclick: function () { move(i, -1); } }),
              h('button.btn.sm', { text: '↓', title: '아래로', disabled: i === R.articles.length - 1, onclick: function () { move(i, 1); } }),
              h('button.btn.sm.danger', {
                text: '삭제', onclick: function () {
                  UI.confirm('제' + (i + 1) + '조 “' + (a.title || '') + '” 을 삭제합니다.', function () {
                    R.articles.splice(i, 1); S(); PAGES._reload();
                  }, '삭제');
                }
              }))),
          h('div.grid.g2', { style: 'margin-top:10px' }, UI.field('제목', titleI), UI.field('시행일', sinceI)),
          h('div', { style: 'margin-top:8px' }, UI.field('내용', bodyT))
        ));
      });

      if (edit) {
        wrap.appendChild(h('button.btn', {
          text: '+ 조 추가', onclick: function () {
            R.articles.push({ id: SG.uid('ar'), title: '', body: '', since: UI.today() });
            S(); PAGES._reload();
          }
        }));
        wrap.appendChild(h('p.tiny.muted', { style: 'margin-top:10px', text: '내용은 바로 저장됩니다. 한 번의 회의에서 바꾼 내용을 하나의 개정으로 묶어 남기려면 “개정 확정”을 누르세요.' }));
      }
      view.appendChild(wrap);

      function move(i, d) {
        var t = R.articles[i]; R.articles[i] = R.articles[i + d]; R.articles[i + d] = t;
        S(); PAGES._reload();
      }
    }

    function commit() {
      var reasonI = h('input', { placeholder: '예: 2026년 겨울 모임 안건 가결 — 회비 7만원 인상' });
      var dateI = h('input', { type: 'date', value: UI.today() });
      var byI = h('input', { value: SG.db.settings.treasurer || '', placeholder: '기록자 이름' });
      UI.modal('회칙 개정 확정',
        h('div.grid', UI.field('개정 사유 · 근거', reasonI), UI.field('시행일', dateI), UI.field('기록자', byI),
          h('p.tiny.muted', { text: '지금의 회칙 전문이 이력에 한 버전으로 보관됩니다. 나중에 언제든 그 시점 내용을 보고 되돌릴 수 있습니다.' })),
        [{ label: '취소' }, {
          label: '개정 확정', cls: 'pri', run: function () {
            R.history.push({
              id: SG.uid('rv'), at: dateI.value || UI.today(), reason: reasonI.value,
              by: byI.value, snapshot: SG.clone(R.articles)
            });
            S(); sessionStorage.setItem('sg.rulesEdit', '0');
            UI.toast('개정 이력에 보관했습니다'); location.hash = '#/rules?t=log';
          }
        }]);
    }

    /* ── 개정 이력 ── */
    function drawLog() {
      var wrap = h('div');
      if (!R.history.length) {
        wrap.appendChild(h('div.card', h('div.empty', '보관된 버전이 없습니다. 현행 회칙에서 “편집 → 개정 확정”을 하면 그때의 전문이 여기 쌓입니다.')));
      }
      R.history.slice().reverse().forEach(function (v, ri) {
        var idx = R.history.length - ri;
        var body = h('div.acc-body', { hidden: true });
        var built = false;
        wrap.appendChild(h('div.item.pad0',
          h('button.acc', {
            onclick: function () {
              body.hidden = !body.hidden;
              if (!built) { build(); built = true; }
            }
          },
            h('div',
              h('h4', { text: idx + '차 · ' + UI.dateKo(v.at) + (v.reason ? ' — ' + v.reason : '') }),
              h('div.meta', { text: (v.by ? '기록 ' + v.by + ' · ' : '') + (v.snapshot || []).length + '개 조항' })),
            h('span.muted', { text: '▾' })),
          body));
        function build() {
          (v.snapshot || []).forEach(function (a, i) {
            body.appendChild(h('section', { style: 'margin-top:12px' },
              h('h4', { style: 'font-size:14px', text: '제' + (i + 1) + '조 (' + (a.title || '') + ')' }),
              h('div.small', { style: 'white-space:pre-wrap', text: a.body || '' })));
          });
          body.appendChild(h('div.row', { style: 'margin-top:14px' },
            h('button.btn.sm', { text: '이 버전 전문 복사', onclick: function () { UI.copy(fullText(v.snapshot || [])); } }),
            !admin ? null : h('button.btn.sm.danger', {
              text: '이 버전으로 되돌리기', onclick: function () {
                UI.confirm('현행 회칙을 ' + UI.dateKo(v.at) + ' 버전으로 되돌립니다. 지금 내용은 먼저 이력에 자동 보관됩니다.', function () {
                  R.history.push({ id: SG.uid('rv'), at: UI.today(), reason: '되돌리기 직전 자동 보관', by: '', snapshot: SG.clone(R.articles) });
                  R.articles = SG.clone(v.snapshot || []); SG.db.rules.articles = R.articles;
                  S(); UI.toast('되돌렸습니다'); location.hash = '#/rules?t=now';
                }, '되돌리기');
              }
            })));
        }
      });
      view.appendChild(wrap);
    }

    function fullText(arts) {
      var L = ['사구회 회칙'];
      if (R.history.length) L.push('(최종 개정 ' + UI.dateKo(R.history[R.history.length - 1].at) + ')');
      L.push('');
      (arts || []).forEach(function (a, i) {
        L.push('제' + (i + 1) + '조 (' + (a.title || '') + ')');
        L.push(a.body || '');
        L.push('');
      });
      return L.join('\n');
    }
  };
})();
