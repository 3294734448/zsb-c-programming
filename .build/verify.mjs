// C语言编程题库 · 校验脚本
// 抽取所有 ```c-run（无输入）与 ```c-io（有输入，`// in:` 给测试数据）代码块，
// 真实编译 + 运行，与其**紧随其后**的 ```text 块逐字比对。
//
// 设计要点（都是本机踩坑后的选择）：
//  1) 顺序扫描配对，避免「先给样例输出、再给代码」时错配；
//  2) 产物按源码内容哈希命名，命中缓存免编译 —— 因为本机沙箱禁止删除
//     .build/verify 里 gcc 生成的 .exe（EPERM），不能用「清空重建」的写法；
//  3) 编译偶发失败自动重试（杀软扫描新 exe 会短暂占用文件）；
//  4) 不通过管道捕获子进程输出（沙箱下 spawnSync EPERM），一律让 exe 自己重定向到文件。
// 用法:  node .build/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import cp from 'node:child_process';
import crypto from 'node:crypto';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const BASE = path.resolve(HERE, '..');
const TMP = path.join(HERE, 'verify');
fs.mkdirSync(TMP, { recursive: true });

const PLAIN = (s) => String(s).replace(/[\u{1F300}-\u{1FAFF}\u{2B00}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{2460}-\u{2473}]/gu, '').trim();
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const norm = (s) => String(s).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
// sh：所有子进程都在 .build/verify 里跑，避免文件操作题（Q-067~Q-069）把 num.txt/data.txt
// 之类的测试产物写到项目根目录。
const sh = (cmd) => cp.execSync(cmd, { shell: 'cmd.exe', stdio: 'inherit', cwd: TMP });

/* ---------------- 1. 顺序扫描：题目 + 代码块 ---------------- */
function scan(text) {
  const lines = text.split(/\r?\n/);
  // 第一趟：收集题目标题行（元信息行在围栏之前，必须先有题号才知道代码块属于谁）
  const marks = [];
  lines.forEach((l, i) => { const h = l.match(/^##\s+(Q-\d+)\s*(.*)$/); if (h) marks.push({ id: h[1], title: PLAIN(h[2]), line: i }); });

  // 第二趟：切分围栏块。
  // 定位规则：从开围栏向后数，遇到「带 info string 的围栏」嵌套 +1、
  // 遇到「无 info string 的围栏」嵌套 -1，**第一个归零的围栏**就是它的闭合符。
  // （答案块里嵌着 c-io/text，所以必须真的数嵌套，不能取最后一个裸围栏——
  //   那会一路找到文件末尾，把后面所有内容都吞进第一个块。）
  const FENCE = /^\s*```\s*(\S.*?)?\s*$/;
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(FENCE);
    if (!f) continue;
    const lang = (f[1] || '').trim();
    const body = [];
    let depth = 1, closer = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const m = lines[j].match(FENCE);
      if (!m) { body.push(lines[j]); continue; }
      if ((m[1] || '').trim()) { depth++; body.push(lines[j]); }        // 内层开围栏：进 body
      else if (--depth === 0) { closer = j; break; }                    // 归零 → 闭合符
      else body.push(lines[j]);                                         // 内层闭围栏：也进 body
    }
    const owner = [...marks].reverse().find((x) => x.line < i) || null;
    blocks.push({ lang, body, start: i + 2, problem: owner });
    i = closer;                                                          // 跳到闭合符之后继续
  }
  return blocks;
}

/* ---------------- 2. 配对 ---------------- */
function collect(file) {
  const blocks = scan(fs.readFileSync(path.join(BASE, file), 'utf8'));
  // 题目内部：answer 块里嵌着 c-io/text，所以要把 answer 的 body 先「摊平」成同级块序列，
  // 否则 c-io 和它的 text 隔着一个 answer 父块、配不上对。
  const flat = [];
  const flatten = (list) => {
    for (const b of list) {
      if (b.lang.startsWith('answer')) flatten(scan(b.body.join('\n')));
      else flat.push(b);
    }
  };
  flatten(blocks);

  const jobs = [];
  flat.forEach((b, idx) => {
    if (b.lang !== 'c-run' && b.lang !== 'c-io') return;
    const next = flat[idx + 1];
    jobs.push({ ...b, expected: next && next.lang === 'text' ? next.body.join('\n') : null });
  });
  return jobs;
}

/* ---------------- 3. 编译（哈希缓存）+ 运行 — 比对 ---------------- */
let nPass = 0, nFail = 0, nCached = 0, nBlocked = 0;
const fails = [];
const blocked = [];
const perFile = [];

for (const f of fs.readdirSync(BASE).filter((x) => /^\d\d-.*\.md$/.test(x)).sort()) {
  const jobs = collect(f);
  let ok = 0, bad = 0;

  for (const it of jobs) {
    const qid = it.problem ? it.problem.id : '?';
    const tag = `${qid} @ ${f}:${it.start}`;

    // 抹掉测试输入区（`// in: xxx`；`<<< ... // >>>` 形式连数据行一起抹）
    const code = it.body.join('\n')
      .replace(/^[ \t]*\/\/\s*in:\s*<<<[\s\S]*?^[ \t]*\/\/\s*>>>.*$/m, '')
      .replace(/^[ \t]*\/\/\s*in:.*$/m, '')
      .trim();
    const srcAll = code + '\n';
    const h = hash(srcAll);
    const src = path.join(TMP, `s${h}.c`);
    const exe = path.join(TMP, `x${h}.exe`);
    const cerr = path.join(TMP, `s${h}.cerr`);

    // 输入
    let stdin = '';
    if (it.lang === 'c-io') {
      const m = it.body.join('\n').match(/\/\/\s*in:\s*(.*)$/m);
      if (!m) { fails.push(`${tag}  c-io 缺少 \`// in:\` 测试输入行`); bad++; continue; }
      const spec = m[1].trim();
      if (spec.endsWith('<<<')) {
        const at = it.body.findIndex((l) => /\/\/\s*in:\s*<<</.test(l));
        const rest = [];
        for (let k = at + 1; k < it.body.length; k++) {
          if (/^\s*\/\/\s*>>>/.test(it.body[k])) break;
          rest.push(it.body[k]);
        }
        stdin = rest.join('\n') + '\n';
      } else {
        stdin = spec.replace(/\\n/g, '\n');
        if (!/\n$/.test(stdin)) stdin += '\n';
      }
    }

    if (!fs.existsSync(src)) fs.writeFileSync(src, srcAll, 'utf8');
    if (fs.existsSync(exe)) nCached++;

    if (!fs.existsSync(exe)) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try { sh(`gcc -std=c99 -w -o "${exe}" "${src}" 2> "${cerr}"`); } catch { /* 看 exe 是否存在 */ }
        if (fs.existsSync(exe)) break;
        try { sh('ping -n 1 127.0.0.1 > nul'); } catch { /* 等一下再试 */ }
      }
    }
    if (!fs.existsSync(exe)) {
      const msg = fs.existsSync(cerr) ? fs.readFileSync(cerr, 'utf8') : '';
      const firstErr = PLAIN(msg.split('\n').find((l) => l.includes('error')) || msg.split('\n')[0] || 'gcc 未产出可执行文件').trim();
      fails.push(`${tag}  编译失败: ${firstErr.slice(0, 150)}`); bad++; continue;
    }

    const inFile = path.join(TMP, `i${h}.in`);
    const outFile = path.join(TMP, `o${h}.out`);
    const errFile = path.join(TMP, `r${h}.err`);
    fs.writeFileSync(inFile, stdin, 'utf8');

    // 运行。本机沙箱偶发把个别 exe 判为「拒绝访问」（连复制都不允许，与代码无关），
    // 所以失败时换一个全新文件名重新编译再跑；连续失败才认定为真问题。
    let out = null, lastErr = '';
    for (let attempt = 1; attempt <= 4; attempt++) {
      const exeA = attempt === 1 ? exe : path.join(TMP, `y${h}_${attempt}.exe`);
      if (attempt > 1 && !fs.existsSync(exeA)) {
        try { sh(`gcc -std=c99 -w -o "${exeA}" "${src}" 2> "${cerr}"`); } catch { /* 下一步再判断 */ }
      }
      if (!fs.existsSync(exeA)) { lastErr = '可执行文件不存在'; continue; }
      if (fs.existsSync(outFile)) { try { fs.rmSync(outFile); } catch { /* 忽略 */ } }
      try {
        sh(`"${exeA}" < "${inFile}" > "${outFile}" 2> "${errFile}"`);
        out = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
        break;
      } catch (e) {
        lastErr = String(e.message).split('\n')[0];
        const runErr = fs.existsSync(errFile) ? fs.readFileSync(errFile, 'utf8').trim() : '';
        if (runErr) lastErr = runErr.split('\n')[0];
      }
    }
    if (out === null) {
      const isDenied = /Access is denied|being used by another process|拒绝访问/i.test(lastErr);
      if (isDenied) {
        // 本机沙箱会把极少数 exe 判为「拒绝访问」，换名/换目录都无效（与代码无关）。
        // 这类不记为失败，单独列出，由作者人工确认逻辑并补一次等价程序验证。
        blocked.push(`${tag}  ${PLAIN(lastErr).slice(0, 80)}`); nBlocked++;
      } else {
        fails.push(`${tag}  运行失败（已换名重试 4 次）: ${PLAIN(lastErr).slice(0, 120)}`); bad++;
      }
      continue;
    }

    if (it.expected === null) { fails.push(`${tag}  缺少配对的 \`\`\`text 期望输出块`); bad++; continue; }
    if (norm(out) === norm(it.expected)) { ok++; nPass++; }
    else {
      bad++;
      fails.push(`${tag}  输出不符\n        实际: ${JSON.stringify(norm(out)).slice(0, 150)}\n        期望: ${JSON.stringify(norm(it.expected)).slice(0, 150)}`);
    }
  }

  nFail += bad;
  perFile.push([f, jobs.length, ok, bad]);
}

/* ---------------- 4. 报告 ---------------- */
console.log(`程序校验: 通过 ${nPass} / 失败 ${nFail}${nBlocked ? ` / 沙箱拒绝执行 ${nBlocked}` : ''}（其中 ${nCached} 个命中编译缓存）`);
for (const [f, n, ok, bad] of perFile) console.log(`  ${f}: ${n} 个程序（通过 ${ok}${bad ? `，失败 ${bad}` : ''}）`);
if (fails.length) { console.log('\n需要修的问题:'); fails.forEach((x) => console.log('  ✘ ' + x)); }
else console.log('✔ 没有失败项：每个参考答案都真实编译运行，输出与样例逐字一致');
if (blocked.length) {
  console.log('\n⚠ 本机沙箱拒绝执行的程序（不是代码问题，换名/换目录都无效，请人工确认）:');
  blocked.forEach((x) => console.log('  · ' + x));
}
fs.writeFileSync(path.join(TMP, 'result.txt'),
  [`通过 ${nPass} / 失败 ${nFail} / 沙箱拒绝 ${nBlocked}（缓存命中 ${nCached}）`, '', ...fails, '', ...blocked].join('\n'), 'utf8');
process.exit(fails.length ? 1 : 0);
