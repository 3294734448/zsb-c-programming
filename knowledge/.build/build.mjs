import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const BASE = path.resolve(HERE, '..');
const TITLE = '专升本计算机 · C语言知识点梳理';

/* ---------- 1. 源文件清单（顺序 = 网页顺序） ---------- */
const PARTS = [
  {
    part: '导学', partId: 'part-guide', title: '导学 · 考情、路线与用法',
    sub: '先看这一页，知道这 150 分怎么拿',
    files: [{ file: 'README.md', key: 'guide' }],
  },
  {
    part: '基础', partId: 'part-base', title: '第一部分 · C语言基础（约 30 分）',
    sub: '数据类型、运算符、输入输出——单选填空的主战场',
    files: [
      { file: '01-C语言基础与数据类型.md', key: 'c01' },
      { file: '02-运算符与表达式.md', key: 'c02' },
      { file: '03-顺序结构与输入输出.md', key: 'c03' },
    ],
  },
  {
    part: '结构', partId: 'part-ctrl', title: '第二部分 · 三大结构（约 30 分）',
    sub: '选择与循环——程序阅读题 80% 都在这里',
    files: [
      { file: '04-选择结构.md', key: 'c04' },
      { file: '05-循环结构.md', key: 'c05' },
    ],
  },
  {
    part: '数据', partId: 'part-data', title: '第三部分 · 数据组织（约 45 分）',
    sub: '数组、函数、指针、结构体——拉开差距的地方',
    files: [
      { file: '06-数组.md', key: 'c06' },
      { file: '07-函数.md', key: 'c07' },
      { file: '08-指针.md', key: 'c08' },
      { file: '09-结构体与自定义类型.md', key: 'c09' },
    ],
  },
  {
    part: '实战', partId: 'part-real', title: '第四部分 · 题型实战（约 45 分）',
    sub: '程序阅读、程序填空、程序设计——按题型练',
    files: [
      { file: '10-预处理与文件.md', key: 'c10' },
      { file: '11-程序阅读专项.md', key: 'c11' },
      { file: '12-程序设计专项.md', key: 'c12' },
    ],
  },
  {
    part: '速查', partId: 'part-ref', title: '第五部分 · 速查与真题',
    sub: '考前翻这一部分：表格、易错、真题',
    files: [
      { file: '13-易错点与速查表.md', key: 'c13' },
      { file: '14-真题解析_2025山西.md', key: 'c14' },
      { file: '15-附录_进制与数据表示.md', key: 'c15' },
    ],
  },
];

/* ---------- 2. 工具函数 ---------- */
const USED_IDS = new Map();
const ANCHOR_ALIAS = new Map();

function slug(text) {
  const raw = String(text).toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw || 'sec';
}
function uniqueId(text) {
  const base = slug(text);
  const n = USED_IDS.get(base) || 0;
  USED_IDS.set(base, n + 1);
  const id = n === 0 ? base : base + '-' + n;
  if (!ANCHOR_ALIAS.has(base)) ANCHOR_ALIAS.set(base, id);
  return id;
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inline(s, chipMode) {
  let t = esc(s);
  t = t.replace(/&lt;br\s*\/?&gt;/gi, '<br>');   // 允许表格单元格里用 <br> 换行
  // 行内代码先「摘出来」再配对粗体：否则 `int **p` 里的 ** 会抢走粗体的起始标记，
  // 正则一路跨到后面的 ** 去配对，把 <code> 节点劈开、把 ** 漏成可见字符。
  const KEEP = '\u0002';
  const stash = [];
  t = t.replace(/`([^`]+)`/g, (m, code) => {
    stash.push(code);
    return KEEP + (stash.length - 1) + KEEP;
  });
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, href) => {
    let h = href.trim();
    if (h === 'README.md') h = '#part-guide';
    else if (h === '01-C语言基础与数据类型.md') h = '#part-base';
    else if (h.startsWith('#')) h = '#' + (ANCHOR_ALIAS.get(slug(h.slice(1))) || slug(h.slice(1)));
    return '<a class="' + (chipMode ? 'chip' : 'ilink') + '" href="' + h + '">' + txt + '</a>';
  });
  // 注意：必须用非贪婪的 [\s\S]+? ，不能用 [^*]+ ——
  // 粗体里的内容常常含 * （如 **`a * b`**、**`*p` 取内容**），用 [^*]+ 会整段不渲染、把 ** 漏成可见字符。
  // 另一种失败模式：`**pp` 这种「代码里含 **」会抢走起始标记 —— 上面已用占位符把代码摘走，故不会再发生。
  t = t.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  t = t.replace(new RegExp(KEEP + '(\\d+)' + KEEP, 'g'), (m, i) => '<code>' + stash[Number(i)] + '</code>');
  return t;
}
function plainTitle(s) {
  return String(s).replace(/\*\*/g, '').replace(/`/g, '').replace(/~~/g, '').trim();
}
function calloutClass(text) {
  const t = text.replace(/<[^>]+>/g, '').trim();
  if (/^⚠/.test(t)) return 'warn';
  if (/^★/.test(t)) return 'key';
  if (/^✔/.test(t)) return 'ok';
  if (/^✘/.test(t)) return 'bad';
  if (/^💡/.test(t)) return 'tip';
  if (/^📌/.test(t) || /^🔗/.test(t)) return 'note';
  return '';
}

/* ---------- 3. markdown -> html（支持围栏） ---------- */
function mdToHtml(lines) {
  const out = [];
  let i = 0;
  const isBlank = (l) => /^\s*$/.test(l);
  const isHr = (l) => /^\s*-{3,}\s*$/.test(l);
  const isHead = (l) => /^\s*#{1,4}\s+/.test(l);
  const isTable = (l) => /^\s*\|/.test(l);
  const isQuote = (l) => /^\s*>/.test(l);
  const isUl = (l) => /^\s*[-*+]\s+/.test(l);
  const isOl = (l) => /^\s*\d+[.)]\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    /* --- 围栏块 --- */
    const f = line.match(/^```(.*)$/);
    if (f) {
      const info = f[1].trim();
      const body = [];
      let innerOpen = false;
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (/^```\s*$/.test(l)) {
          if (innerOpen) { body.push(l); innerOpen = false; i++; continue; }
          i++; break;
        }
        if (/^```\S/.test(l) && !innerOpen) { innerOpen = true; body.push(l); i++; continue; }
        body.push(l); i++;
      }
      out.push(renderFence(info, body));
      continue;
    }

    if (isHr(line)) { out.push('<hr>'); i++; continue; }
    if (isHead(line)) { i++; continue; }
    if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) { rows.push(lines[i]); i++; }
      out.push(renderTable(rows));
      continue;
    }
    if (isQuote(line)) {
      const buf = [];
      while (i < lines.length && isQuote(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      const inner = buf.map((b) => isBlank(b) ? '' : inline(b)).join('<br>');
      out.push('<div class="callout note"><div class="co-body">' + inner + '</div></div>');
      continue;
    }
    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const items = [];
      while (i < lines.length && (isUl(lines[i]) || isOl(lines[i]))) {
        const m = lines[i].match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
        items.push({ indent: Math.floor(m[1].length / 2), text: m[2] });
        i++;
      }
      out.push(renderList(items, ordered));
      continue;
    }
    // 段落
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !isHr(lines[i]) && !isHead(lines[i]) &&
           !isTable(lines[i]) && !isQuote(lines[i]) && !isUl(lines[i]) && !isOl(lines[i]) &&
           !/^```/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    const rawText = buf.join(' ');
    const cls = calloutClass(rawText);
    if (/^\s*🔗/.test(rawText)) {
      const rest = buf.map((b) => inline(b.replace(/^\s*🔗\s*/, ''), true)).join('<br>');
      out.push('<p class="chips"><span class="chip-t">相关</span>' + rest + '</p>');
    } else if (cls) {
      out.push('<div class="callout ' + cls + '"><div class="co-body">' + buf.map((b) => inline(b)).join('<br>') + '</div></div>');
    } else if (/^\s*\*\*[^*]{2,26}\*\*\s*$/.test(rawText)) {
      out.push('<p class="label">' + inline(rawText) + '</p>');
    } else {
      out.push('<p>' + buf.map((b) => inline(b)).join('<br>') + '</p>');
    }
  }
  return out.join('\n');
}

function renderFence(info, body) {
  const txt = body.join('\n');
  if (/^answer\b/.test(info)) {
    const title = info.replace(/^answer\s*/, '').trim() || '答案';
    const inner = mdToHtml(body);
    return '<details class="ans"><summary>' + esc(title) + '</summary><div class="ans-body">' + inner + '</div></details>';
  }
  if (/^text\b|^out\b/.test(info)) {
    const label = info.replace(/^(text|out)\s*/, '').trim() || '程序输出';
    return '<div class="outwrap"><span class="olang">▸ ' + esc(label) + '</span><pre><code>' + esc(txt) + '</code></pre></div>';
  }
  const lang = (info.split(/\s+/)[0] || 'c');
  const tag = info.indexOf('c-run') === 0 ? '可运行示例' : (lang === 'c' ? 'C 代码' : lang);
  return '<div class="codewrap" data-lang="' + esc(lang) + '"><span class="clang">' + esc(tag) + '</span>' +
    '<pre><code>' + esc(txt) + '</code></pre></div>';
}
function renderList(items, ordered) {
  let html = '';
  let depth = 0;
  const tag = ordered ? 'ol' : 'ul';
  html += '<' + tag + '>';
  items.forEach((it, idx) => {
    while (depth < it.indent) { html += '<' + tag + '>'; depth++; }
    while (depth > it.indent) { html += '</' + tag + '>'; depth--; }
    html += '<li>' + inline(it.text) + '</li>';
    if (idx === items.length - 1) { while (depth > 0) { html += '</' + tag + '>'; depth--; } }
  });
  html += '</' + tag + '>';
  return html;
}
function renderTable(rows) {
  // GFM 规范：单元格内的 \| 是「字面竖线」，不能当分隔符。
  // 先用占位符保护，切分完再还原（否则 `a \|\| b` 会被劈成多列，反引号也会漏成可见字符）。
  const PIPE = '\u0001';
  const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '')
    .replace(/\\\|/g, PIPE).split('|').map((c) => c.replace(new RegExp(PIPE, 'g'), '|').trim());
  const head = cells(rows[0]);
  let body = rows.slice(1);
  let aligns = [];
  if (body.length && /^\|?[\s:|-]+\|?$/.test(body[0].trim())) {
    aligns = cells(body[0]).map((c) => /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+/.test(c) ? 'left' : '');
    body = body.slice(1);
  }
  let h = '<div class="tw"><table><thead><tr>';
  head.forEach((c, i) => { h += '<th' + (aligns[i] ? ' class="ta-' + aligns[i] + '"' : '') + '>' + inline(c) + '</th>'; });
  h += '</tr></thead><tbody>';
  body.forEach((r) => {
    const cs = cells(r);
    h += '<tr>';
    for (let i = 0; i < head.length; i++) h += '<td' + (aligns[i] ? ' class="ta-' + aligns[i] + '"' : '') + '>' + inline(cs[i] === undefined ? '' : cs[i]) + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

/* ---------- 4. 解析文件 -> 章节 / 知识点 ---------- */
function parseFile(filePath, fallbackTitle) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const chapters = [];
  let cur = null, topic = null, sink = null, buf = [], skipping = false;
  const flush = () => {
    const html = mdToHtml(buf);
    if (html.trim() && sink) sink.push(html);
    buf = [];
  };
  for (const line of lines) {
    const h1 = line.match(/^\s*#\s+(.*)$/);
    const h2 = line.match(/^\s*##\s+(.*)$/);
    const h3 = line.match(/^\s*###\s+(.*)$/);
    const h4 = line.match(/^\s*####\s+(.*)$/);
    if (h1) {
      flush();
      if (cur) chapters.push(cur);
      const title = plainTitle(h1[1]);
      if (/^目\s*录$/.test(title)) { skipping = true; cur = { id: uniqueId(title), title, intro: [], topics: [] }; sink = cur.intro; continue; }
      skipping = false;
      cur = { id: uniqueId(h1[1]), title, intro: [], topics: [] };
      sink = cur.intro;
      topic = null;
      continue;
    }
    if (h2) {
      flush();
      const t2 = plainTitle(h2[1]);
      if (/^目\s*录$/.test(t2)) { skipping = true; topic = null; continue; }
      skipping = false;
      topic = { id: uniqueId(h2[1]), title: t2, body: [], subs: [] };
      if (!cur) cur = { id: uniqueId(fallbackTitle), title: fallbackTitle, intro: [], topics: [] };
      cur.topics.push(topic);
      sink = topic.body;
      continue;
    }
    if (h3 || h4) {
      flush();
      skipping = false;
      const raw = (h3 || h4)[1];
      const t = { id: uniqueId(raw), title: plainTitle(raw), body: [], subs: [] };
      if (topic) topic.subs.push(t); else if (cur) cur.topics.push(t);
      sink = t.body;
      continue;
    }
    if (!skipping) buf.push(line);
  }
  flush();
  if (cur) chapters.push(cur);
  return chapters;
}

/* ---------- 5. 渲染 ---------- */
function anchorFor(id) {
  return '<a class="hlink" href="#' + id + '" title="跳转 / 复制链接"><span class="hash">#</span></a>';
}
function renderSub(sub) {
  return '<section class="kp lv3" id="' + sub.id + '" data-title="' + esc(sub.title) + '" data-level="3">' +
    '<h3>' + inline(sub.title) + anchorFor(sub.id) + '</h3>' + sub.body.join('\n') + '</section>';
}
function renderTopic(t) {
  const subHtml = t.subs.map(renderSub).join('\n');
  return '<section class="kp lv2" id="' + t.id + '" data-title="' + esc(t.title) + '" data-level="2">' +
    '<h2>' + inline(t.title) + anchorFor(t.id) +
    '<button class="master" type="button" data-id="' + t.id + '" title="标记为已掌握">✓ 标记掌握</button></h2>' +
    t.body.join('\n') + subHtml + '</section>';
}
function renderChapter(c, part) {
  const topics = c.topics.map(renderTopic).join('\n');
  return '<section class="chapter kp lv1" id="' + c.id + '" data-title="' + esc(c.title) + '" data-part="' + esc(part) + '" data-level="1">' +
    '<h1>' + inline(c.title) + anchorFor(c.id) + '</h1>' + c.intro.join('\n') + topics + '</section>';
}

/* ---------- 6. 构建 ---------- */
const parts = [];
for (const p of PARTS) {
  const chapters = [];
  for (const f of p.files) {
    const fp = path.join(BASE, f.file);
    if (!fs.existsSync(fp)) { console.log('!! 缺失文件:', f.file); continue; }
    const chs = parseFile(fp, path.basename(f.file, '.md'));
    chs.forEach((c) => chapters.push(c));
  }
  parts.push({ ...p, chapters });
}

// 侧栏
let nav = '';
for (const p of parts) {
  const count = p.chapters.reduce((a, c) => a + c.topics.length, 0);
  nav += '<div class="nav-part" data-part="' + esc(p.part) + '">';
  nav += '<div class="nav-part-head"><span class="dot"></span>' + esc(p.part) + '<span class="pcount">' + count + '</span></div>';
  for (const c of p.chapters) {
    nav += '<a class="nav-item lv1" href="#' + c.id + '" data-id="' + c.id + '" data-title="' + esc(c.title) + '">' + esc(c.title) + '</a>';
    c.topics.forEach((t) => {
      nav += '<a class="nav-item lv2" href="#' + t.id + '" data-id="' + t.id + '" data-title="' + esc(c.title + ' ' + t.title) + '">' + esc(t.title) + '</a>';
    });
  }
  nav += '</div>';
}

const body = parts.map(function (p) {
  const head = '<div class="part-head" id="' + p.partId + '"><h1>' + esc(p.title) + '</h1>' +
    '<p class="part-sub">' + esc(p.sub) + '</p></div>';
  return '<div class="part-sec" data-part="' + esc(p.part) + '">' + head +
    p.chapters.map(function (c) { return renderChapter(c, p.part); }).join('\n') + '</div>';
}).join('\n');

let html = [
  '<!doctype html>',
  '<html lang="zh-CN"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>' + TITLE + '</title>',
  '<style>', fs.readFileSync(path.join(HERE, 'style.css'), 'utf8'), '</style>',
  '</head><body>',
  '<div class="progress-top"><div class="bar" id="progressBar"></div></div>',
  '<button class="menu-btn" id="menuBtn" type="button" aria-label="目录">☰</button>',
  '<aside class="sidebar" id="sidebar">',
  '  <div class="side-head"><div class="side-title">专升本计算机<br><span>C语言知识点梳理</span></div>',
  '  <div class="side-stat" id="sideStat"></div></div>',
  '  <div class="search-box"><input id="search" type="search" placeholder="搜索知识点…（按 / 聚焦）" autocomplete="off"><button id="searchClear" type="button">×</button></div>',
  '  <div class="nav" id="nav">', nav, '</div>',
  '  <div class="side-foot"><button id="randBtn" class="rand wide" type="button">🎲 抽一道程序题</button>',
  '  <button id="ansOpen" type="button">答案全开 A</button><button id="ansClose" type="button">答案全收 a</button>',
  '  <button id="expandAll" type="button">展开目录</button><button id="collapseAll" type="button">收起目录</button>',
  '  <button id="resetProgress" type="button">重置进度</button><button id="themeBtn" type="button">☾ 夜间</button></div>',
  '</aside>',
  '<main class="content" id="content"><nav class="resource-links" aria-label="资料导航"><a href="./index.html">资料首页</a><a href="./C语言编程题库.html">编程题库</a><a href="./knowledge.html" download="专升本计算机C语言知识点梳理.html">下载知识点梳理（离线）</a></nav>', body, '</main>',
  '<button class="totop" id="totop" type="button" title="回到顶部">↑</button>',
  '<div class="pager"><button id="prevBtn" type="button" title="上一个知识点（Alt+←）">‹</button><button id="nextBtn" type="button" title="下一个知识点（Alt+→）">›</button></div>',
  '<script>', fs.readFileSync(path.join(HERE, 'app.js'), 'utf8'), '</script>',
  '</body></html>',
].join('\n');

const OUT = path.resolve(BASE, '..', 'knowledge.html');


/* ---------- 8. 锚点容错解析 ---------- */
// 作者写「相关知识点」时通常只写标题文字（如 #printf 格式控制），而真实 id 带编号
// （32-printf-格式控制）。这里对所有 href="#..." 做一次兜底匹配。
const idSet0 = new Set([...html.matchAll(/(?:^|\s)id="([^"]+)"/g)].map((x) => x[1]));
const allIdList = [...idSet0];
let fixedLinks = 0;
const unresolved = [];
html = html.replace(/href="#([^"]+)"/g, (m, h) => {
  if (idSet0.has(h)) return m;
  const base = slug(decodeURIComponent(h));
  if (!base) return m;
  let cand = allIdList.filter((id) => id === base);
  if (!cand.length) cand = allIdList.filter((id) => id.endsWith('-' + base));
  if (!cand.length) cand = allIdList.filter((id) => id.split('-').join('').endsWith(base.split('-').join('')));
  if (!cand.length) cand = allIdList.filter((id) => id.includes(base));
  if (cand.length) { fixedLinks++; return 'href="#' + cand[0] + '"'; }
  unresolved.push(h);
  return m;
});

fs.writeFileSync(OUT, html, 'utf8');

/* ---------- 9. 自检 ---------- */
const idRe = /(?:^|\s)id="([^"]+)"/g;
const ids = new Set([...html.matchAll(idRe)].map((x) => x[1]));
const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((x) => x[1]);
const broken = [...new Set(hrefs.filter((h) => !ids.has(h)))];
const allIds = [...html.matchAll(idRe)].map((x) => x[1]);
const dup = [...new Set(allIds.filter((x, idx) => allIds.indexOf(x) !== idx))];

console.log('输出文件:', path.basename(OUT));
console.log('大小:', (html.length / 1024).toFixed(1) + ' KB');
console.log('章:', (html.match(/class="chapter kp lv1"/g) || []).length,
  '| 知识点:', (html.match(/class="kp lv2"/g) || []).length,
  '| 子知识点:', (html.match(/class="kp lv3"/g) || []).length,
  '| 目录条目:', (nav.match(/class="nav-item/g) || []).length);
console.log('代码块:', (html.match(/class="codewrap"/g) || []).length,
  '| 输出块:', (html.match(/class="outwrap"/g) || []).length,
  '| 折叠答案:', (html.match(/class="ans"/g) || []).length,
  '| 表格:', (html.match(/<table>/g) || []).length,
  '| 提示框:', (html.match(/class="callout/g) || []).length);
console.log('锚点:', ids.size, '| 内链:', hrefs.length, '| 容错修正:', fixedLinks);
console.log('断链:', broken.length ? broken : '无');
console.log('重复 id:', dup.length ? dup : '无');
for (const p of parts) {
  console.log('  [' + p.part + '] ' + p.chapters.map((c) => c.title + '(' + c.topics.length + ')').join(' + '));
}
