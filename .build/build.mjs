// C语言编程题库 · 网页构建
// 读 6 个章节 .md → 生成单文件 HTML（可搜索、可筛选、答案折叠、进度打勾、夜间、打印）
// 用法:  node .build/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const BASE = path.resolve(HERE, '..');
const OUT = path.join(BASE, 'C语言编程题库.html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripEm = (s) => String(s).replace(/[\u{1F300}-\u{1FAFF}\u{2B00}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{2460}-\u{2473}]/gu, '').trim();
const CALLOUT = { '⚠': 'warn', '★': 'key', '✔': 'ok', '✘': 'bad', '💡': 'tip', '📌': 'note' };

/* ---------------- 1. 行内标记 ---------------- */
function inline(s) {
  let t = esc(s);
  const KEEP = '\u0002';
  const stash = [];
  // 行内代码先摘出来，否则 `int **p` 里的 ** 会抢走粗体起始标记
  t = t.replace(/`([^`]+)`/g, (m, c) => { stash.push(c); return KEEP + (stash.length - 1) + KEEP; });
  t = t.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, href) => `<a href="${href}">${txt}</a>`);
  t = t.replace(new RegExp(KEEP + '(\\d+)' + KEEP, 'g'), (m, i) => `<code>${stash[Number(i)]}</code>`);
  return t;
}

/* ---------------- 2. 块级解析（递归，支持 answer 内嵌代码块） ---------------- */
function render(lines, depth = 0) {
  const out = [];
  let i = 0;
  const para = (txt) => {
    const first = [...txt][0];
    const cls = CALLOUT[first];
    return cls ? `<div class="${cls}">${inline(txt)}</div>` : `<p>${inline(txt)}</p>`;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // 围栏块。注意两点：
    //  1) info string 里可能有空格（如 "answer 参考答案"），用 \S* 会匹配失败；
    //  2) answer 块里嵌着 c-io/text 围栏，所以必须**真的数嵌套**：
    //     带 info string 的围栏嵌套 +1、无 info string 的 -1，第一个归零的就是闭合符。
    const fence = line.match(/^\s*```\s*(\S.*?)?\s*$/);
    if (fence) {
      const lang = (fence[1] || '').trim();
      const body = [];
      let nest = 1;
      i++;
      while (i < lines.length) {
        const cm = lines[i].match(/^\s*```\s*(\S.*?)?\s*$/);
        if (cm) {
          if ((cm[1] || '').trim()) nest++;                 // 内层开围栏
          else if (--nest === 0) break;                     // 归零 → 本块闭合
        }
        body.push(lines[i]); i++;
      }
      i++;
      if (lang.startsWith('answer')) {
        const title = lang.replace(/^answer\s*/, '') || '参考答案';
        const inner = render(body, depth + 1);
        out.push(`<details class="ans"><summary>${inline(title)}</summary><div class="ans-body">${inner}</div></details>`);
      } else if (lang === 'text') {
        out.push(`<div class="outwrap"><span class="olabel">▸ 程序输出</span><pre class="out"><code>${esc(body.join('\n'))}</code></pre></div>`);
      } else {
        out.push(`<pre class="code"><code>${esc(body.join('\n'))}</code></pre>`);
      }
      continue;
    }

    // 表格
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const PIPE = '\u0001';
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '')
        .replace(/\\\|/g, PIPE).split('|').map((c) => c.replace(new RegExp(PIPE, 'g'), '|').trim());
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push('<div class="tw"><table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table></div>');
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lv = Math.min(h[1].length + 1, 6); out.push(`<h${lv}>${inline(stripEm(h[2]))}</h${lv}>`); i++; continue; }

    // 引用
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${buf.map((b) => `<p>${inline(b)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.、)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        if (/^\s*\d+[.、)]\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*\d+[.、)]\s+/, ''));
        else if (items.length) items[items.length - 1] += ' ' + lines[i].trim();
        else break;
        i++;
      }
      out.push('<ol>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>');
      continue;
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const raw = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s)/.test(lines[i])) {
        if (/^\s*[-*]\s+/.test(lines[i])) raw.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        else if (raw.length) raw[raw.length - 1] += ' ' + lines[i].trim();
        else break;
        i++;
      }
      out.push('<ul class="mark">' + raw.map((t) => {
        const first = [...stripEm(t)][0];
        const cls = /^\[[ x]\]$/.test(t.slice(0, 3)) || t.startsWith('[ ]') ? 'check' : '';
        return `<li class="${cls}">${t.startsWith('[ ]') ? '' : ''}${inline(t)}</li>`;
      }).join('') + '</ul>');
      continue;
    }

    if (!line.trim()) { i++; continue; }

    // 段落
    const buf = [];
    while (i < lines.length && lines[i].trim()
      && !/^\s*(```|#{1,6}\s|\||>|\d+[.、)]\s|[-*]\s|---+\s*$)/.test(lines[i])) { buf.push(lines[i].trim()); i++; }
    if (!buf.length) { i++; continue; }
    out.push(para(buf.join(' ')));
  }
  return out.join('\n');
}

/* ---------------- 3. 解析章节与题目 ---------------- */
const files = fs.readdirSync(BASE).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();
const chapters = [];
const allProblems = [];

for (const f of files) {
  const text = fs.readFileSync(path.join(BASE, f), 'utf8');
  const lines = text.split(/\r?\n/);

  // 找题目起始行
  const marks = [];
  lines.forEach((l, idx) => { const m = l.match(/^##\s+(Q-\d+)\s+(.*)$/); if (m) marks.push({ id: m[1], title: stripEm(m[2]), line: idx }); });

  const intro = lines.slice(0, marks.length ? marks[0].line : lines.length).join('\n');
  const chTitle = (lines.find((l) => /^#\s+/.test(l)) || f).replace(/^#\s+/, '').trim();
  const ch = { file: f, title: chTitle, intro: render(intro.split('\n')), problems: [] };

  marks.forEach((mk, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].line : lines.length;
    const body = lines.slice(mk.line + 1, end);
    // 抽元信息行
    const meta = {};
    const rest = [];
    for (const line of body) {
      const m = line.match(/^\s*[-*]\s*([^：:]{1,10})[：:]\s*(.*)$/);
      if (m && !meta[m[1].trim()] && ['题型', '对应知识点', '难度'].includes(m[1].trim())) { meta[m[1].trim()] = m[2].trim(); continue; }
      rest.push(line);
    }
    const searchText = (mk.id + ' ' + mk.title + ' ' + Object.values(meta).join(' ') + ' ' + rest.join(' '))
      .replace(/```[a-z-]*/g, ' ').replace(/\s+/g, ' ').toLowerCase().replace(/"/g, '');
    const p = { id: mk.id, title: mk.title, meta, html: render(rest), searchText, chapter: chTitle };
    // 「知识点」可能写成「03-顺序结构与输入输出、04-选择结构」：第一个作主分类（用于筛选），全部用于检索
    const raw = meta['对应知识点'] || '';
    p.points = raw.split(/[、,，\/]/).map((x) => x.trim()).filter(Boolean);
    p.primaryPoint = p.points[0] || '未标注';
    ch.problems.push(p);
    allProblems.push(p);
  });
  chapters.push(ch);
}

/* ---------------- 4. 统计与自检 ---------------- */
const types = new Map();
for (const p of allProblems) { const t = p.meta['题型'] || '未标注'; types.set(t, (types.get(t) || 0) + 1); }
const points = new Map();
for (const p of allProblems) { points.set(p.primaryPoint, (points.get(p.primaryPoint) || 0) + 1); }
const problems = [];
const seen = new Set();
for (const p of allProblems) {
  if (seen.has(p.id)) problems.push(`编号重复：${p.id}`);
  seen.add(p.id);
  if (!p.meta['题型']) problems.push(`${p.id} 缺「题型」`);
  if (!p.meta['对应知识点']) problems.push(`${p.id} 缺「对应知识点」`);
}

/* ---------------- 5. 生成 HTML ---------------- */
const navHtml = chapters.map((c, ci) => `
  <div class="navch">
    <div class="navch-h">${esc(c.title)}<b>${c.problems.length}</b></div>
    ${c.problems.map((p) => `<a class="navitem" href="#${p.id}" data-id="${p.id}">${esc(p.id)} ${esc(p.title)}</a>`).join('')}
  </div>`).join('');

const bodyHtml = chapters.map((c) => `
<section class="chapter" id="ch-${esc(c.file.slice(0, 2))}">
  <h1>${esc(c.title)}</h1>
  <div class="chintro">${c.intro}</div>
  ${c.problems.map((p) => `
  <article class="card" id="${p.id}" data-id="${p.id}" data-type="${esc(p.meta['题型'] || '')}" data-point="${esc(p.primaryPoint)}" data-text="${esc(p.searchText)}">
    <header class="card-h">
      <label class="done" title="标记为已掌握"><input type="checkbox" data-done="${p.id}"><span></span></label>
      <span class="qid">${esc(p.id)}</span>
      <h2>${inline(p.title)}</h2>
    </header>
    <div class="meta">
      <span class="tag t-${esc(p.meta['题型'] || 'x')}">${esc(p.meta['题型'] || '')}</span>
      ${p.points.map((x) => `<span class="tag pt">${esc(x)}</span>`).join('')}
    </div>
    <div class="body">${p.html}</div>
  </article>`).join('')}
</section>`).join('');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>C语言编程题库 · 专升本（${allProblems.length} 题）</title>
<style>
:root{
  --bg:#f3f4f6;--card:#fff;--text:#1f2937;--muted:#6b7280;--line:#e5e7eb;--side:#fbfbfd;--side-line:#e8e9ee;
  --brand:#1d4ed8;--brand2:#0d9488;--strong:#1d4ed8;
  --warn:#dc2626;--warn-bg:#fef2f2;--key:#15803d;--key-bg:#f0fdf4;--ok:#15803d;--ok-bg:#f0fdf4;
  --bad:#dc2626;--bad-bg:#fef2f2;--tip:#7c3aed;--tip-bg:#f5f3ff;--note:#2563eb;--note-bg:#eff6ff;
  --code-bg:#0f172a;--code-fg:#e5e7eb;--shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px -10px rgba(16,24,40,.16);
  --sbw:300px;
}
html[data-theme="dark"]{
  --bg:#0f1216;--card:#171b21;--text:#dfe3e8;--muted:#9aa4b2;--line:#2a3038;--side:#12161b;--side-line:#242a32;
  --strong:#7cb2ff;--shadow:0 1px 2px rgba(0,0,0,.45);
  --warn-bg:#2a1416;--key-bg:#0f2419;--ok-bg:#0f2419;--bad-bg:#2a1416;--tip-bg:#1d1730;--note-bg:#111d2e;
  --code-bg:#0b0f14;--code-fg:#dfe3e8;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-size:15.5px;line-height:1.78;
  font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif}
a{color:var(--strong);text-decoration:none}a:hover{text-decoration:underline}
.layout{display:flex;align-items:flex-start}
.sidebar{position:fixed;top:0;left:0;bottom:0;width:var(--sbw);background:var(--side);border-right:1px solid var(--side-line);
  display:flex;flex-direction:column;z-index:50}
.side-head{padding:16px 18px 6px}
.side-title{font-size:18px;font-weight:800;letter-spacing:.3px;line-height:1.35}
.side-title span{display:block;font-size:12px;font-weight:600;color:var(--muted);letter-spacing:1.5px;margin-top:4px}
.side-stat{margin-top:8px;font-size:12.5px;color:var(--muted)}
.side-stat b{color:var(--brand)}
.nav{flex:1;overflow-y:auto;padding:6px 10px 24px}
.nav::-webkit-scrollbar{width:8px}.nav::-webkit-scrollbar-thumb{background:#d5d8de;border-radius:8px}
.navch{margin-bottom:10px}
.navch-h{display:flex;justify-content:space-between;align-items:center;padding:8px 10px 5px;font-size:12px;font-weight:800;
  letter-spacing:1px;color:var(--muted)}
.navch-h b{background:var(--line);border-radius:99px;padding:1px 7px;font-size:11px}
.navitem{display:block;padding:5px 10px 5px 14px;border-radius:8px;font-size:13px;color:var(--text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:3px solid transparent}
.navitem:hover{background:rgba(127,127,127,.09);text-decoration:none}
.navitem.active{background:rgba(29,78,216,.1);border-left-color:var(--brand);color:var(--brand);font-weight:600}
.navitem.done{color:var(--muted);text-decoration:line-through}
.main{margin-left:var(--sbw);flex:1;min-width:0;padding:24px 26px 90px;max-width:1000px}
.topbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 90%,transparent);
  backdrop-filter:blur(8px);padding:8px 0 12px;border-bottom:1px solid var(--line);margin-bottom:18px}
.topbar input[type=search]{width:100%;padding:10px 14px;border:1px solid var(--line);border-radius:10px;
  background:var(--card);color:var(--text);font-size:14px;outline:none}
.topbar input[type=search]:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(29,78,216,.12)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:9px}
.lbl{font-size:12px;color:var(--muted);font-weight:700;letter-spacing:1px}
.chip{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:99px;padding:4px 12px;
  font-size:12.5px;cursor:pointer}
.chip:hover{border-color:var(--brand)}
.chip.on{background:var(--brand);color:#fff;border-color:var(--brand)}
.chip b{opacity:.75;font-size:11px;margin-left:3px}
h1{font-size:25px;margin:34px 0 10px;padding-top:14px;border-top:2px solid var(--line)}
section.chapter:first-of-type h1{border-top:0;padding-top:0;margin-top:6px}
.chintro{color:var(--muted);font-size:14.5px}
.card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--brand);border-radius:14px;
  padding:18px 20px;margin:16px 0;box-shadow:var(--shadow);scroll-margin-top:150px}
.card.done{border-left-color:var(--ok);opacity:.72}
.card-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.card-h h2{font-size:18.5px;margin:0}
.qid{font-family:Consolas,monospace;font-weight:800;color:#fff;background:var(--brand);border-radius:7px;
  padding:2px 9px;font-size:12.5px}
.card.done .qid{background:var(--ok)}
.done{display:inline-flex;align-items:center;cursor:pointer}
.done input{appearance:none;width:17px;height:17px;border:2px solid var(--line);border-radius:5px;cursor:pointer;position:relative}
.done input:checked{background:var(--ok);border-color:var(--ok)}
.done input:checked::after{content:"✓";position:absolute;left:1.5px;top:-3px;color:#fff;font-size:13px;font-weight:800}
.meta{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 2px}
.tag{font-size:12px;border-radius:7px;padding:2px 9px;background:rgba(127,127,127,.1);color:var(--muted)}
.tag.t-基础{background:var(--note-bg);color:var(--note);font-weight:700}
.tag.t-拔高{background:var(--tip-bg);color:var(--tip);font-weight:700}
.tag.t-真题{background:var(--warn-bg);color:var(--warn);font-weight:700}
.body h3{margin:16px 0 6px;font-size:16px}
.body h4,.body h5{margin:14px 0 5px;font-size:15px}
.body p{margin:9px 0}
.body ul,.body ol{margin:8px 0;padding-left:22px}
.body li{margin:4px 0}
.body ul.mark{list-style:none;padding-left:2px}
.body ul.mark li{padding-left:20px;position:relative}
.body ul.mark li::before{content:"·";position:absolute;left:6px;color:var(--brand);font-weight:800}
.body ul.mark li.check{padding-left:0}
.body ul.mark li.check::before{content:"";}
code{background:rgba(127,127,127,.15);padding:1px 5px;border-radius:5px;color:#b91c1c;
  font-family:"Cascadia Mono",Consolas,monospace;font-size:.92em}
html[data-theme="dark"] code{color:#ff9d9d}
pre.code,pre.out{background:var(--code-bg);color:var(--code-fg);padding:13px 15px;border-radius:11px;overflow-x:auto;
  font-family:"Cascadia Mono",Consolas,monospace;font-size:13.2px;line-height:1.62;margin:10px 0}
pre.code code,pre.out code{background:none;color:inherit;padding:0;font-size:inherit}
.outwrap{margin:8px 0}
.olabel{display:block;font-size:12px;font-weight:700;color:var(--key);margin:6px 0 2px;letter-spacing:.5px}
pre.out{background:var(--key-bg);color:var(--key);border:1px dashed var(--key)}
details.ans{margin:12px 0;border:1px solid var(--line);border-radius:11px;overflow:hidden;background:rgba(127,127,127,.03)}
details.ans>summary{cursor:pointer;padding:10px 14px;font-weight:700;font-size:14px;color:var(--brand);
  background:rgba(29,78,216,.06);user-select:none;list-style:none}
details.ans>summary::-webkit-details-marker{display:none}
details.ans>summary::before{content:"▸ ";font-weight:800}
details.ans[open]>summary::before{content:"▾ "}
.ans-body{padding:4px 14px 12px}
blockquote{margin:10px 0;padding:8px 14px;border-left:3px solid var(--line);color:var(--muted)}
.warn,.bad{background:var(--warn-bg);border-left:4px solid var(--warn);color:var(--warn);padding:9px 13px;border-radius:9px;margin:9px 0;display:block}
.key,.ok{background:var(--key-bg);border-left:4px solid var(--key);color:var(--key);padding:9px 13px;border-radius:9px;margin:9px 0;display:block}
.tip{background:var(--tip-bg);border-left:4px solid var(--tip);color:var(--tip);padding:9px 13px;border-radius:9px;margin:9px 0;display:block}
.note{background:var(--note-bg);border-left:4px solid var(--note);color:var(--note);padding:9px 13px;border-radius:9px;margin:9px 0;display:block}
.warn strong,.key strong,.tip strong,.note strong{color:inherit}
.tw{overflow-x:auto;margin:10px 0}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left}
th{background:rgba(127,127,127,.08);font-weight:700}
hr{border:0;border-top:1px solid var(--line);margin:20px 0}
#gotop{position:fixed;right:18px;bottom:22px;border:1px solid var(--line);background:var(--card);color:var(--text);
  border-radius:99px;padding:9px 15px;cursor:pointer;box-shadow:var(--shadow);font-size:13px}
.empty{display:none;text-align:center;color:var(--muted);padding:50px 0}
@media(max-width:900px){
  .sidebar{display:none}.main{margin-left:0;padding:16px 14px 80px}
}
@media print{
  .sidebar,.topbar,#gotop{display:none}
  .main{margin:0;max-width:none;padding:0}
  body{background:#fff;font-size:11.5pt}
  .card{break-inside:avoid;box-shadow:none}
  details.ans{break-inside:avoid}
  details.ans>summary{background:none}
}
</style></head>
<body>
<div class="layout">
<aside class="sidebar">
  <div class="side-head">
    <div class="side-title">C语言编程题库<span>专升本 · C程序设计 150 分</span></div>
    <div class="side-stat">共 <b>${allProblems.length}</b> 题 ｜ 已掌握 <b id="doneCount">0</b></div>
  </div>
  <nav class="nav" id="nav">${navHtml}</nav>
</aside>
<main class="main">
  <div class="topbar">
    <input id="q" type="search" placeholder="🔍 搜题目 / 考点 / 关键字（如：素数、指针、冒泡、结构体）">
    <div class="row"><span class="lbl">题型</span>
      <button class="chip on" data-type="">全部<b>${allProblems.length}</b></button>
      ${[...types.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `<button class="chip" data-type="${esc(t)}">${esc(t)}<b>${n}</b></button>`).join('')}
      <button class="chip" id="fold">📕 只看没掌握的</button>
      <button class="chip" id="allans">📖 展开全部答案</button>
      <button class="chip" id="theme">🌓 夜间</button>
      <button class="chip" onclick="window.print()">🖨 打印</button>
    </div>
    <div class="row"><span class="lbl">知识点</span>
      <button class="chip on" data-point="">全部</button>
      ${[...points.keys()].sort().map((k) => `<button class="chip" data-point="${esc(k)}">${esc(k)}<b>${points.get(k)}</b></button>`).join('')}
    </div>
  </div>
  ${bodyHtml}
  <div class="empty" id="empty">没有匹配的题 —— 换个关键词试试。</div>
</main>
</div>
<button id="gotop" onclick="scrollTo({top:0,behavior:'smooth'})">↑ 顶部</button>
<script>
const cards=[...document.querySelectorAll('.card')];
const navItems=[...document.querySelectorAll('.navitem')];
const q=document.getElementById('q');
let fType='',fPoint='',onlyOpen=false;
const DONE_KEY='ctb-done';
let done=new Set();
try{ done=new Set(JSON.parse(localStorage.getItem(DONE_KEY)||'[]')); }catch(e){}
function apply(){
  const kw=q.value.trim().toLowerCase();
  let n=0;
  for(const c of cards){
    const okKw=!kw||c.dataset.text.includes(kw);
    const okT=!fType||c.dataset.type===fType;
    const okP=!fPoint||c.dataset.point===fPoint;
    const okO=!onlyOpen||!done.has(c.dataset.id);
    const show=okKw&&okT&&okP&&okO;
    c.style.display=show?'':'none';
    if(show)n++;
  }
  document.getElementById('empty').style.display=n?'none':'block';
}
q.addEventListener('input',apply);
for(const ch of document.querySelectorAll('.chip[data-type],.chip[data-point]')){
  ch.addEventListener('click',()=>{
    const isType=ch.dataset.type!==undefined;
    const group=isType?document.querySelectorAll('.chip[data-type]'):document.querySelectorAll('.chip[data-point]');
    group.forEach(c=>c.classList.remove('on'));
    ch.classList.add('on');
    if(isType)fType=ch.dataset.type||'';else fPoint=ch.dataset.point||'';
    apply();
  });
}
function syncDone(){
  document.querySelectorAll('.card').forEach(c=>c.classList.toggle('done',done.has(c.dataset.id)));
  navItems.forEach(a=>a.classList.toggle('done',done.has(a.dataset.id)));
  document.getElementById('doneCount').textContent=done.size;
  try{ localStorage.setItem(DONE_KEY,JSON.stringify([...done])); }catch(e){}
}
document.querySelectorAll('input[data-done]').forEach(box=>{
  const id=box.dataset.done;
  box.checked=done.has(id);
  box.addEventListener('change',()=>{ box.checked?done.add(id):done.delete(id); syncDone(); apply(); });
});
document.getElementById('fold').addEventListener('click',e=>{
  onlyOpen=!onlyOpen;e.target.classList.toggle('on',onlyOpen);
  e.target.textContent=onlyOpen?'📖 显示全部':'📕 只看没掌握的';apply();
});
document.getElementById('allans').addEventListener('click',e=>{
  const anyClosed=[...document.querySelectorAll('details.ans')].some(d=>!d.open);
  document.querySelectorAll('details.ans').forEach(d=>d.open=anyClosed);
  e.target.textContent=anyClosed?'📕 收起全部答案':'📖 展开全部答案';
});
document.getElementById('theme').addEventListener('click',()=>{
  const d=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme',d?'':'dark');
  try{localStorage.setItem('ctb-theme',d?'':'dark');}catch(e){}
});
try{const t=localStorage.getItem('ctb-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}
const obs=new IntersectionObserver(es=>{
  es.forEach(e=>{ if(e.isIntersecting){
    navItems.forEach(a=>a.classList.toggle('active',a.dataset.id===e.target.dataset.id));
  }});
},{rootMargin:'-20% 0px -70% 0px'});
cards.forEach(c=>obs.observe(c));
syncDone();
</script>
</body></html>`;

fs.writeFileSync(OUT, html, 'utf8');

/* ---------------- 6. 报告 ---------------- */
console.log('网页构建完成');
console.log('  输出: C语言编程题库.html  （' + (html.length / 1024).toFixed(0) + ' KB）');
console.log('  章节: ' + chapters.length + ' 个 ｜ 题目: ' + allProblems.length + ' 题');
console.log('  题型: ' + [...types.entries()].map(([t, n]) => `${t} ${n}`).join(' ｜ '));
console.log('  知识点覆盖: ' + points.size + ' 个');
for (const [k, n] of [...points.entries()].sort()) console.log('    ' + k + ': ' + n + ' 题');
if (problems.length) { console.log('\n⚠ 需要修的问题:'); problems.forEach((p) => console.log('  - ' + p)); }
else console.log('  自检: 通过（编号唯一、题型与知识点齐全）');
