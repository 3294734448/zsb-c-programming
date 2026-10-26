(function () {
  'use strict';
  var navItems = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
  var navParts = Array.prototype.slice.call(document.querySelectorAll('.nav-part'));
  var ids = navItems.map(function (a) { return a.getAttribute('data-id'); });
  var STORE = 'dsh-c-mastered-v1';
  var LAST = 'dsh-c-last-v1';
  var THEME = 'dsh-c-theme';
  var mastered = {};
  try { mastered = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { mastered = {}; }

  /* ================= 1. C 代码语法着色 ================= */
  var KEYWORDS = ['auto','break','case','char','const','continue','default','do','double','else','enum',
    'extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed',
    'sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while','_Bool'];
  var TYPES = ['size_t','FILE','NULL','EOF','stdin','stdout','stderr','true','false','bool'];
  var RE = new RegExp(
    '(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)' +                                   // 1 注释
    '|("(?:\\\\.|[^"\\\\\\n])*")' +                                              // 2 字符串
    "|('(?:\\\\.|[^'\\\\\\n])*')" +                                              // 3 字符
    '|(^[ \\t]*#[^\\n]*)' +                                                      // 4 预处理
    '|\\b(' + KEYWORDS.join('|') + ')\\b' +                                      // 5 关键字
    '|\\b(' + TYPES.join('|') + ')\\b' +                                         // 6 类型/宏
    '|\\b(0[xX][0-9a-fA-F]+[uUlL]*|0[0-7]+[uUlL]*|[0-9]+\\.[0-9]*(?:[eE][+-]?[0-9]+)?[fFlL]?|[0-9]+[uUlL]*)\\b' + // 7 数字
    '|\\b([A-Za-z_][A-Za-z0-9_]*)(?=\\s*\\()'                                    // 8 函数名
    , 'gm');
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function highlightC(code) {
    var out = '', last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(code)) !== null) {
      if (m.index > last) out += esc(code.slice(last, m.index));
      var cls = m[1] ? 'tk-com' : m[2] ? 'tk-str' : m[3] ? 'tk-chr' : m[4] ? 'tk-pre' :
                m[5] ? 'tk-key' : m[6] ? 'tk-typ' : m[7] ? 'tk-num' : 'tk-fn';
      out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
      if (m[0].length === 0) RE.lastIndex++;
    }
    out += esc(code.slice(last));
    return out;
  }
  Array.prototype.forEach.call(document.querySelectorAll('.codewrap code'), function (c) {
    var raw = c.textContent;
    c.innerHTML = highlightC(raw);
    c.setAttribute('data-raw', raw);
  });

  /* ================= 2. 复制按钮 ================= */
  function addCopy(wrap, btnCls, pre) {
    var b = document.createElement('button');
    b.className = btnCls;
    b.type = 'button';
    b.textContent = '复制';
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var t = pre.innerText;
      var done = function () {
        b.textContent = '✓ 已复制';
        setTimeout(function () { b.textContent = '复制'; }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(done, function () { fallback(t, done); });
      } else fallback(t, done);
    });
    wrap.appendChild(b);
  }
  function fallback(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.codewrap'), function (w) {
    addCopy(w, 'cbarbtn', w.querySelector('pre'));
  });
  Array.prototype.forEach.call(document.querySelectorAll('.outwrap'), function (w) {
    addCopy(w, 'obarbtn', w.querySelector('pre'));
  });

  /* ================= 3. 答案折叠控制 ================= */
  var answers = Array.prototype.slice.call(document.querySelectorAll('details.ans'));
  function setAllAnswers(open) {
    answers.forEach(function (d) { d.open = open; });
  }
  var ansOpen = document.getElementById('ansOpen');
  var ansClose = document.getElementById('ansClose');
  if (ansOpen) ansOpen.addEventListener('click', function () { setAllAnswers(true); });
  if (ansClose) ansClose.addEventListener('click', function () { setAllAnswers(false); });
  // 程序题答案默认带「先自己追踪再点开」提示
  answers.forEach(function (d) {
    if (!d.classList.contains('closed-hint')) {
      var s = d.querySelector('summary');
      if (s && /运行结果|参考答案|输出/.test(s.textContent)) d.classList.add('closed-hint');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) { setAllAnswers(true); }
    if (e.key === 'A' && !e.ctrlKey && !e.metaKey && !e.altKey) { setAllAnswers(false); }
  });

  /* ================= 4. 随机抽一道程序题 ================= */
  var pool = [];
  Array.prototype.forEach.call(document.querySelectorAll('.codewrap'), function (w) {
    var n = w, found = null;
    for (var k = 0; k < 8 && n; k++) {
      n = n.nextElementSibling;
      if (!n) break;
      if (n.classList && n.classList.contains('ans')) { found = n; break; }
    }
    if (found) pool.push({ code: w, ans: found });
  });
  var randBtn = document.getElementById('randBtn');
  if (randBtn) {
    randBtn.textContent = '🎲 抽一道程序题（' + pool.length + '）';
    randBtn.addEventListener('click', function () {
      if (!pool.length) return;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      pick.ans.open = false;
      pick.code.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var el = pick.code.closest('.kp') || pick.code;
      el.classList.add('flash');
      setTimeout(function () { el.classList.remove('flash'); }, 1700);
    });
  }

  /* ================= 5. 进度 / 已掌握 ================= */
  function saveMastered() { try { localStorage.setItem(STORE, JSON.stringify(mastered)); } catch (e) {} }
  function refreshProgress() {
    var done = 0;
    navItems.forEach(function (a) {
      var id = a.getAttribute('data-id');
      if (mastered[id]) { a.classList.add('done'); done++; } else { a.classList.remove('done'); }
    });
    var total = ids.length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var bar = document.getElementById('progressBar');
    if (bar) bar.style.width = pct + '%';
    var stat = document.getElementById('sideStat');
    if (stat) stat.innerHTML = '<b>' + done + '</b>/' + total + ' 个知识点已掌握 · ' + pct + '%';
    Array.prototype.forEach.call(document.querySelectorAll('.master'), function (b) {
      var id = b.getAttribute('data-id');
      if (mastered[id]) { b.classList.add('on'); b.textContent = '✓ 已掌握'; }
      else { b.classList.remove('on'); b.textContent = '✓ 标记掌握'; }
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.master'), function (b) {
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var id = b.getAttribute('data-id');
      if (mastered[id]) delete mastered[id]; else mastered[id] = 1;
      saveMastered(); refreshProgress();
    });
  });
  var resetBtn = document.getElementById('resetProgress');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    if (!confirm('确定要清空「已掌握」的标记吗？')) return;
    mastered = {}; saveMastered(); refreshProgress();
  });
  refreshProgress();

  /* ================= 6. 搜索过滤 ================= */
  var search = document.getElementById('search');
  var clearBtn = document.getElementById('searchClear');
  var noResult = null;
  function doFilter() {
    var q = (search.value || '').trim().toLowerCase();
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
    var any = false;
    navItems.forEach(function (a) {
      var t = (a.getAttribute('data-title') || a.textContent || '').toLowerCase();
      var hit = !q || t.indexOf(q) >= 0;
      a.classList.toggle('hide', !hit);
      if (hit) any = true;
    });
    navParts.forEach(function (p) {
      var vis = p.querySelectorAll('.nav-item:not(.hide)').length;
      p.classList.toggle('hide', vis === 0 && !!q);
      if (q) p.classList.remove('collapsed');
    });
    if (!noResult) {
      noResult = document.createElement('div');
      noResult.className = 'noresult';
      noResult.textContent = '没有匹配的知识点，换个关键词试试～';
      var nav = document.getElementById('nav');
      if (nav) nav.appendChild(noResult);
    }
    noResult.style.display = any ? 'none' : 'block';
  }
  if (search) {
    search.addEventListener('input', doFilter);
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { search.value = ''; doFilter(); search.blur(); }
      if (e.key === 'Enter') {
        var first = document.querySelector('.nav-item:not(.hide)');
        if (first) first.click();
      }
    });
  }
  if (clearBtn) clearBtn.addEventListener('click', function () { search.value = ''; doFilter(); search.focus(); });

  /* ================= 7. 展开 / 收起目录 ================= */
  navParts.forEach(function (p) {
    var head = p.querySelector('.nav-part-head');
    if (head) head.addEventListener('click', function () { p.classList.toggle('collapsed'); });
  });
  var ex = document.getElementById('expandAll');
  var co = document.getElementById('collapseAll');
  if (ex) ex.addEventListener('click', function () { navParts.forEach(function (p) { p.classList.remove('collapsed'); }); });
  if (co) co.addEventListener('click', function () { navParts.forEach(function (p) { p.classList.add('collapsed'); }); });

  /* ================= 8. 滚动高亮 / 上一个下一个 ================= */
  var activeId = null;
  var targets = ids.map(function (id) { return document.getElementById(id); });
  function spy() {
    var best = null;
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      if (!el) continue;
      if (el.getBoundingClientRect().top - 130 <= 0) best = ids[i];
      else break;
    }
    if (best && best !== activeId) {
      activeId = best;
      navItems.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-id') === best); });
      var act = document.querySelector('.nav-item.active');
      if (act && act.scrollIntoView) {
        var r = act.getBoundingClientRect();
        if (r.top < 120 || r.bottom > window.innerHeight - 80) act.scrollIntoView({ block: 'center' });
      }
      try { localStorage.setItem(LAST, best); } catch (e) {}
    }
    var tt = document.getElementById('totop');
    if (tt) tt.classList.toggle('show', window.scrollY > 600);
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { spy(); ticking = false; });
  }, { passive: true });

  function go(step) {
    var i = ids.indexOf(activeId);
    if (i < 0) i = 0;
    var n = Math.min(ids.length - 1, Math.max(0, i + step));
    var el = document.getElementById(ids[n]);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('flash');
      setTimeout(function () { el.classList.remove('flash'); }, 1600);
    }
  }
  var prev = document.getElementById('prevBtn');
  var next = document.getElementById('nextBtn');
  if (prev) prev.addEventListener('click', function () { go(-1); });
  if (next) next.addEventListener('click', function () { go(1); });
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); if (search) search.focus(); }
    if (e.key === 'Escape') { document.body.classList.remove('nav-open'); }
  });

  /* ================= 9. 顶部 / 菜单 / 主题 ================= */
  var tt = document.getElementById('totop');
  if (tt) tt.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  var mb = document.getElementById('menuBtn');
  if (mb) mb.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  navItems.forEach(function (a) { a.addEventListener('click', function () { document.body.classList.remove('nav-open'); }); });

  var themeBtn = document.getElementById('themeBtn');
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME); } catch (e) {}
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  if (themeBtn) {
    themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀ 日间' : '☾ 夜间';
    themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', cur);
      themeBtn.textContent = cur === 'dark' ? '☀ 日间' : '☾ 夜间';
      try { localStorage.setItem(THEME, cur); } catch (e) {}
    });
  }

  /* ================= 10. 打开时定位 ================= */
  function boot() {
    var h = decodeURIComponent(location.hash || '').replace('#', '');
    var target = h && document.getElementById(h);
    if (!target) {
      var last = null;
      try { last = localStorage.getItem(LAST); } catch (e) {}
      if (last) target = document.getElementById(last);
    }
    if (target) {
      setTimeout(function () {
        target.scrollIntoView({ block: 'start' });
        target.classList.add('flash');
        setTimeout(function () { target.classList.remove('flash'); }, 1600);
      }, 60);
    }
    spy();
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
  else document.addEventListener('DOMContentLoaded', boot);
})();
