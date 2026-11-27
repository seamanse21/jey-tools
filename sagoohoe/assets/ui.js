/* 사구회 — 화면 만들 때 쓰는 작은 도구들 */
window.UI = (function () {
  function h(tag, attrs) {
    var parts = tag.split('.');
    var e = document.createElement(parts[0] || 'div');
    if (parts.length > 1) e.className = parts.slice(1).join(' ');
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className += (e.className ? ' ' : '') + v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style') e.setAttribute('style', v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'value') e.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') e[k] = !!v;
        else e.setAttribute(k, v);
      }
    } else if (attrs !== undefined) { add(e, attrs); }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { add(e, x); });
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  var won = new Intl.NumberFormat('ko-KR');
  function money(n) { return won.format(Math.round(n || 0)) + '원'; }
  function num(n) { return won.format(Math.round(n || 0)); }
  function parseNum(v) { var n = parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10); return isNaN(n) ? 0 : n; }

  function today() {
    var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function dateKo(s) {
    if (!s) return '';
    var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '. ' + +m[2] + '. ' + +m[3] + '.' : s;
  }

  var tEl, tTimer;
  function toast(msg, ms) {
    tEl = tEl || document.getElementById('toast');
    if (!tEl) return;
    tEl.textContent = msg; tEl.hidden = false;
    clearTimeout(tTimer);
    tTimer = setTimeout(function () { tEl.hidden = true; }, ms || 1800);
  }

  /* 모달: UI.modal('제목', 내용요소, [{label,cls,run}] ) */
  function modal(title, body, buttons) {
    var wrap = document.getElementById('modal');
    var box = document.getElementById('modal-box');
    box.textContent = '';
    box.appendChild(h('h3', { text: title }));
    box.appendChild(body);
    var bar = h('div.row.end', { style: 'margin-top:16px' });
    (buttons || [{ label: '닫기' }]).forEach(function (b) {
      bar.appendChild(h('button', {
        class: 'btn ' + (b.cls || ''), text: b.label,
        onclick: function () { if (!b.run || b.run() !== false) close(); }
      }));
    });
    box.appendChild(bar);
    wrap.hidden = false;
    wrap.onclick = function (ev) { if (ev.target === wrap) close(); };
    function close() { wrap.hidden = true; box.textContent = ''; }
    return close;
  }
  function confirmBox(msg, onYes, yesLabel) {
    modal('확인', h('p', { text: msg }), [
      { label: '취소' },
      { label: yesLabel || '진행', cls: 'danger', run: onYes }
    ]);
  }

  /* 라벨 + 입력칸 한 묶음 */
  function field(label, input, hint) {
    return h('div', h('label.f', { text: label }), input, hint ? h('div.tiny.muted', { text: hint, style: 'margin-top:3px' }) : null);
  }
  function selectOf(options, value, onchange, attrs) {
    var s = h('select', attrs || {});
    options.forEach(function (o) {
      var val = (o && typeof o === 'object') ? o.value : o;
      var lab = (o && typeof o === 'object') ? o.label : o;
      s.appendChild(h('option', { value: val, text: lab, selected: String(val) === String(value) }));
    });
    if (onchange) s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }
  function stat(label, value, note) {
    return h('div.stat', h('b', { text: value }), h('span', { text: label + (note ? ' · ' + note : '') }));
  }

  /* 파일 첨부 묶음: 고른 파일을 바로 올리고 목록을 보여준다
     opts.by       — 올린 사람 이름을 같이 기록한다
     opts.canDelete— 이 첨부를 지울 수 있는지 판단하는 함수 (없으면 전부 지울 수 있음) */
  function attach(list, kind, folder, onchange, label, opts) {
    opts = opts || {};
    var box = h('div');
    var isPhoto = kind === 'photos';
    var status = h('div.picked');
    var input = h('input', {
      type: 'file', multiple: true,
      accept: isPhoto ? 'image/*' : 'image/*,.pdf',
      style: 'position:absolute;width:1px;height:1px;opacity:0',
      onchange: async function () {
        var files = Array.prototype.slice.call(input.files);
        if (!files.length) return;
        btn.disabled = true;
        var done = 0;
        for (var i = 0; i < files.length; i++) {
          status.className = 'picked go';
          status.textContent = '올리는 중… ' + (i + 1) + ' / ' + files.length + (isPhoto ? '장' : '개');
          try {
            var up = await SG.upload(files[i], kind, folder);
            if (opts.by) { up.by = opts.by; up.at = today(); }
            list.push(up);
            done++;
            render(); if (onchange) onchange();
          } catch (e) {
            status.className = 'picked err';
            status.textContent = '올리지 못했습니다 — ' + e.message;
            btn.disabled = false; input.value = '';
            return;
          }
        }
        status.className = 'picked go';
        status.textContent = done + (isPhoto ? '장' : '개') + ' 올렸습니다';
        setTimeout(function () {
          if (status.textContent.indexOf('올렸습니다') >= 0) { status.textContent = ''; status.className = 'picked'; }
        }, 4000);
        btn.disabled = false; input.value = '';
      }
    });
    var btn = h('button.btn', {
      type: 'button',
      text: isPhoto ? '📷 사진 고르기' : '🧾 파일 고르기',
      onclick: function () { input.click(); }
    });
    var shelf = h('div');
    box.appendChild(h('label.f', { text: label || '파일 첨부' }));
    box.appendChild(h('div.pickrow', btn, status,
      h('span.tiny.muted', { text: isPhoto ? '여러 장 한 번에 고르면 바로 올라갑니다' : '사진 또는 PDF' })));
    box.appendChild(input);
    box.appendChild(shelf);
    function render() {
      shelf.textContent = '';
      if (!list.length) return;
      var isImg = function (u) { return /^data:image|\.(jpe?g|png|webp|gif|heic|heif)$/i.test(u); };
      var g = h('div.thumbs');
      list.forEach(function (f, i) {
        var who = f.by ? (f.by + ' 올림' + (f.at ? ' · ' + dateKo(f.at) : '')) : '';
        var cell = isImg(f.url)
          ? h('figure', h('a', { href: SG.src(f.url), target: '_blank', title: who || f.name },
              h('img', { src: SG.src(f.url), alt: f.name, loading: 'lazy' })))
          : h('figure', h('a.btn.sm', { href: SG.src(f.url), target: '_blank', title: who,
              text: '📄 ' + (f.name || '파일'), style: 'display:block;text-align:center' }));
        if (who) cell.appendChild(h('figcaption.tiny.muted', { text: f.by, style: 'text-align:center;margin-top:2px' }));
        if (!opts.canDelete || opts.canDelete(f)) {
          cell.appendChild(h('button.x', {
            text: '×', title: '첨부 지우기',
            onclick: function () { list.splice(i, 1); render(); if (onchange) onchange(); }
          }));
        }
        g.appendChild(cell);
      });
      shelf.appendChild(g);
    }
    render();
    return box;
  }

  /* 보기 전용 첨부 목록 */
  function attachView(list) {
    if (!list || !list.length) return null;
    var isImg = function (u) { return /^data:image|\.(jpe?g|png|webp|gif|heic|heif)$/i.test(u); };
    var g = h('div.thumbs');
    list.forEach(function (f) {
      g.appendChild(isImg(f.url)
        ? h('figure', h('a', { href: SG.src(f.url), target: '_blank' }, h('img', { src: SG.src(f.url), alt: f.name, loading: 'lazy' })))
        : h('figure', h('a.btn.sm', { href: SG.src(f.url), target: '_blank', text: '📄 ' + (f.name || '파일'), style: 'display:block;text-align:center' })));
    });
    return g;
  }

  function download(filename, text, type) {
    var b = new Blob([text], { type: type || 'application/json;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(b), download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function copy(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text).then(function () { toast('복사했습니다'); },
      function () { fallbackCopy(text); });
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var t = h('textarea', { value: text, style: 'position:fixed;left:-9999px' });
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast('복사했습니다'); } catch (e) { toast('복사하지 못했습니다'); }
    t.remove();
  }

  return {
    h: h, money: money, num: num, parseNum: parseNum, today: today, dateKo: dateKo,
    toast: toast, modal: modal, confirm: confirmBox, field: field, select: selectOf, stat: stat,
    attach: attach, attachView: attachView, download: download, copy: copy
  };
})();
