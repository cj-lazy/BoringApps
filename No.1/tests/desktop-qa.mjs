import assert from "node:assert/strict";
import { mkdir, mkdtemp, copyFile, writeFile, readFile, utimes, access, cp, readdir } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import JSZip from "jszip";
import {productivityChecks,librarySwitchingChecks} from "./productivity-checks.mjs";
import {comfortChecks} from "./comfort-checks.mjs";
import {workflowChecks} from "./workflow-checks.mjs";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(path.join(project, "artifacts"), { recursive: true });
const qa = await mkdtemp(path.join(project, "artifacts", "desktop-qa-"));
const binary = path.join(qa, "portable-note.exe");
await copyFile(path.join(project, "src-tauri/target/release/portable-note.exe"), binary);
const data = path.join(qa, "data");
const readDraft=async name=>{const dir=path.join(data,".drafts",name);const files=await readdir(dir);return JSON.parse(await readFile(path.join(dir,files.find(file=>file.endsWith('.json'))),"utf8"));};
const assets = path.join(data, "assets", "验收附件");
await mkdir(assets, { recursive: true });
const assetUrl = name => "http://asset.localhost/" + encodeURIComponent(path.join(assets, name));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1sAAAAASUVORK5CYII=", "base64");
await writeFile(path.join(assets, "image.png"), png);
function minimalPdf() {
  const stream = "BT /F1 18 Tf 20 60 Td (PDF preview OK) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
  ];
  let text = "%PDF-1.4\n"; const offsets = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += index + 1 + " 0 obj\n" + object + "\nendobj\n"; });
  const xref = Buffer.byteLength(text);
  text += "xref\n0 6\n0000000000 65535 f \n" + offsets.map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("");
  text += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return text;
}
await writeFile(path.join(assets, "preview.pdf"), minimalPdf());
const zip = new JSZip();
zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word 附件预览成功</w:t></w:r></w:p></w:body></w:document>');
await writeFile(path.join(assets, "preview.docx"), await zip.generateAsync({ type: "nodebuffer" }));
await writeFile(path.join(assets, "text.txt"), "文本附件预览成功");
await writeFile(path.join(assets, "orphan.bin"), "disposable test orphan");
const old = new Date(Date.now() - 40 * 86400000);
await utimes(path.join(assets, "orphan.bin"), old, old);
const ticks = String.fromCharCode(96).repeat(3);
const originalA = "# 验收笔记A\n\n初始内容。\n\n| 项目 | 结果 |\n|---|---|\n| 表格搜索 | 关联成功 |\n\n行内 $a_b$ 与特殊语法原样保留。\n\ntest&#x20;\n\n$$\n1+1=2\n$$\n\n$$\n\\frac{a_1}{b^2}=\\sqrt{x},\\quad C=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\n$$\n\n" + ticks + "python\n    print('代码预览')\n" + ticks + "\n\n$$\nx^2+y^2=z^2\n$$\n\n" + ticks + "mermaid\ngraph TD\n  A[输入] --> B[输出]\n" + ticks
  + "\n\n![测试图](" + assetUrl("image.png") + ")\n\n"
  + ["preview.pdf", "preview.docx", "text.txt"].map(name => "[FILE:" + name + "](" + assetUrl(name) + ")").join("\n\n") + "\n";
await writeFile(path.join(data, "验收笔记A.md"), originalA);
await writeFile(path.join(data, "验收笔记B.md"), "# 验收笔记B\n\n右侧初始内容。\n");
await writeFile(path.join(data,".workspace.json"),JSON.stringify({autosaveSeconds:0}));
await writeFile(path.join(data,"功能主笔记.md"),"---\ncustom: 保留字段\n---\n\n# 功能主笔记\n\n原始正文\n");
await writeFile(path.join(data,"关联目标.md"),"# 关联目标\n\n## 具体方法\n\n方法正文\n");
await writeFile(path.join(data,"关联来源.md"),"# 关联来源\n\n参考 [[功能主笔记]]。\n\n`[[关联目标]]`\n");
await writeFile(path.join(data,"折叠粘贴样本.md"),"# 折叠粘贴样本\n\n## 第一节\n\n第一节正文\n\n## 第二节\n\n第二节正文\n");
for(const name of ["批量样本甲","批量样本乙"])await writeFile(path.join(data,name+".md"),"---\ncustom: 保留\ntags: [旧标签]\n---\n\n# "+name+"\n\n$$a_b$$\n");
await writeFile(path.join(data,"附件修复样本.md"),"# 附件修复样本\n\n[FILE:缺失](assets/missing-comfort.txt)\n\n`[FILE:示例](assets/missing-comfort.txt)`\n");
await writeFile(path.join(assets,"旧重复一.txt"),"legacy duplicate");await writeFile(path.join(assets,"旧重复二.txt"),"legacy duplicate");
const formulaSource = String.raw`# 公式兼容

时刻 \(t\) 的无人机系统表示为：

\[
\mathcal G_t=(\mathcal V_t,\mathcal E_t)
\]

[\
&#x20;\mathcal G\_t=(\mathcal V\_t,\mathcal E\_t)\
&#x20;]

矩阵：

\[
\begin{bmatrix}
1&0\\
0&1
\end{bmatrix}
\]

字面下划线 \(UAV\_UUID\)，行内 $x_i^2$。
`;
await writeFile(path.join(data, "公式兼容.md"), formulaSource);
await writeFile(path.join(data, "不可信HTML.md"), '# 安全测试\n\n<div><script>window.__unsafeMarkdownExecuted=true</script><img src=x onerror="window.__unsafeMarkdownExecuted=true"></div>\n');
let sourceHash;
const sample = process.argv[2];
if (sample) {
  const bytes = await readFile(sample); sourceHash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path.join(data, "实测技术路线.md"), bytes);
}
const legacySample = process.argv[3];
let legacyHash;
if (legacySample) {
  const bytes = await readFile(legacySample); legacyHash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path.join(data, "实测旧版公式.md"), bytes);
}
// Additional isolated fixtures for the 4.1 workflows.
await writeFile(path.join(data,"提示框验收.md"),"> [!WARNING] 提醒标题\n> 初始提示正文 $a_b$\n");
await writeFile(path.join(data,"源码验收.md"),"# 源码验收\n\n原始源码正文\n");
await writeFile(path.join(data,"分页验收.md"),Array.from({length:120},(_,i)=>"分页关键词 "+(i+1)).join("\n\n"));
await writeFile(path.join(data,"替换保护.md"),"# 替换保护\n\nREPLACE_ME\n\n`REPLACE_ME`\n\n$REPLACE_ME$\n\n"+ticks+"text\nREPLACE_ME\n"+ticks+"\n\n[链接](https://example.com/REPLACE_ME)\n");
const movedImage="http://asset.localhost/"+encodeURIComponent("Z:\\Previous\\data\\assets\\验收附件\\image.png");
await writeFile(path.join(data,"搬迁验收.md"),"# 搬迁验收\n\n![旧路径图片]("+movedImage+")\n\n[FILE:text.txt](assets/%E9%AA%8C%E6%94%B6%E9%99%84%E4%BB%B6/text.txt)\n");
const draftBase="# 草稿验收\n\n磁盘原文\n",draftContent="# 草稿验收\n\n恢复草稿正文\n";
await writeFile(path.join(data,"草稿验收.md"),draftBase);await mkdir(path.join(data,".drafts"),{recursive:true});
await writeFile(path.join(data,".drafts","草稿验收.json"),JSON.stringify({path:"草稿验收",content:draftContent,base_source:draftBase,updated_ms:Date.now()}));
const freePort = () => new Promise(resolve => { const server = createServer(); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const port = await freePort(), nativePort = await freePort();
const driverVersions=(await readdir(path.join(project,".tools/edge"))).filter(name=>/^\d+\.\d+\.\d+\.\d+$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
const log = [];
const driver = spawn(process.env.QA_TAURI_DRIVER || path.join(project, ".tools/bin/tauri-driver.exe"), [
  "--port", String(port), "--native-port", String(nativePort),
  "--native-driver", process.env.QA_EDGE_DRIVER || path.join(project,".tools/edge",driverVersions[driverVersions.length-1]||"152.0.4191.53","msedgedriver.exe"),
], { cwd: qa, windowsHide: true, env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: path.join(qa, "webview-profile") } });
driver.stdout.on("data", data => log.push(String(data)));
driver.stderr.on("data", data => log.push(String(data)));
let session;
const base = "http://127.0.0.1:" + port;
async function request(method, route, body) {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result.value || result));
  return result.value;
}
const call = (method, route, body) => request(method, "/session/" + session + route, body);
const execute = (script, ...args) => call("POST", "/execute/sync", { script, args });
const wait = async (predicate, message, timeout = 15000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) { try { const value = await predicate(); if (value) return value; } catch (error) { last = error; } await new Promise(resolve => setTimeout(resolve, 150)); }
  throw new Error(message + (last ? ": " + last.message : ""));
};
const find = async (selector, using = "css selector") => {
  return wait(async()=>{const element = await call("POST", "/element", { using, value: selector });
    return element["element-6066-11e4-a52e-4f735466cecf"];},"element missing: "+selector);
};
const clickElement=async id=>{
  await execute("arguments[0].scrollIntoView({block:'center',behavior:'instant'});",{"element-6066-11e4-a52e-4f735466cecf":id});
  await wait(()=>call("GET","/element/"+id+"/enabled"),"control stayed disabled");
  return call("POST","/element/"+id+"/click",{});
};
const click = async selector => clickElement(await find(selector));
const clickText = async (text, tag = "*") => {
  let filtered=false;
  if(tag==="span"&&!await execute("return [...document.querySelectorAll('.file-tree-name')].some(el=>el.textContent.trim()===arguments[0]&&el.getClientRects().length)",text)){
    filtered=await execute("const input=document.querySelector('input[placeholder*=\"Ctrl+K\"]');if(!input)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,arguments[0]);input.dispatchEvent(new Event('input',{bubbles:true}));return true;",text);
  }
  await clickElement(await find("//" + tag + "[normalize-space(.)=" + JSON.stringify(text) + "]", "xpath"));
  if(filtered)await execute("const input=document.querySelector('input[placeholder*=\"Ctrl+K\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));");
};
const type = async (selector, text) => call("POST", "/element/" + await find(selector) + "/value", { text, value: [...text] });
const bodyText = () => execute("return document.body.innerText");
const idle = () => wait(() => execute("return !document.querySelector('[data-editor-pane][inert]')"), "editor stayed busy");
const caretAtParagraphEnd = pane => execute("const el=document.querySelector('[data-editor-pane=\"'+arguments[0]+'\"] [data-content-type=\"paragraph\"] .bn-inline-content');if(!el)throw Error('paragraph missing');el.closest('[contenteditable=\"true\"]').focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);", pane);
const modifier = (key, down) => call("POST", "/actions", { actions: [{ type: "key", id: "keyboard", actions: [{ type: down ? "keyDown" : "keyUp", value: key }] }] });
const results = [];
async function check(name, run) {
  const started = Date.now();
  try { await run(); results.push({ name, passed: true, ms: Date.now() - started }); console.log("PASS " + name); }
  catch (error) { results.push({ name, passed: false, error: String(error), ms: Date.now() - started }); console.error("FAIL " + name + ": " + error); throw error; }
}
async function screenshot(name) {
  const png = await call("GET", "/screenshot");
  await writeFile(path.join(qa, name + ".png"), Buffer.from(png, "base64"));
}
try {
  await wait(() => request("GET", "/status"), "driver not ready");
  const created = await request("POST", "/session", { capabilities: { alwaysMatch: { "tauri:options": { application: binary } } } });
  session = created.sessionId;
  await call("POST", "/window/rect", { width: 1280, height: 960, x: 20, y: 20 });
  await check("Native startup and CSP enabled", async () => {
    await wait(() => execute("return !!document.querySelector('.file-tree-name')"), "file tree missing");
    await execute("window.__qaLogs=[];const originalConsoleError=console.error.bind(console);console.error=(...values)=>{window.__qaLogs.push(values.map(v=>String(v)).join(' '));originalConsoleError(...values);};window.__qaErrors=[];window.__qaCsp=[];window.addEventListener('error',e=>window.__qaErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));document.addEventListener('securitypolicyviolation',e=>window.__qaCsp.push({directive:e.effectiveDirective,uri:e.blockedURI}));");
    await execute("const script=document.createElement('script');script.textContent='window.__qaInjectedScriptRan=true';document.body.appendChild(script);");
    await wait(() => execute("return window.__qaCsp.some(event=>event.directive.startsWith('script-src'))"), "inline script was not blocked");
    assert.equal(await execute("return !!window.__qaInjectedScriptRan"), false);
    await execute("window.__qaCsp=[]");
    assert.equal(await execute("return document.querySelector('.app-shell').dataset.rightEditor"),"false","right editor initialized during single-pane startup");
  });
  await check("Recovery drafts open safely and can be saved",async()=>{
    await wait(()=>execute("return !!document.querySelector('[aria-label=\"恢复未保存草稿\"]')"),"recovery dialog missing");
    await click('button[aria-label="关闭恢复未保存草稿"]');await clickText("草稿验收","span");await idle();await clickText("验收笔记A","span");await idle();
    await access(path.join(data,".drafts","草稿验收.json"));
    await click('summary[aria-label="更多笔记操作"]');await execute("[...document.querySelectorAll('.more-menu button')].find(el=>el.textContent.startsWith('恢复草稿')).click();");
    await clickText("恢复这份草稿","button");await idle();await click('button[aria-label="关闭恢复未保存草稿"]');
    await click('button[title="保存两栏 (Ctrl+S)"]');await idle();
    assert.equal(await readFile(path.join(data,"草稿验收.md"),"utf8"),draftContent);
    await assert.rejects(access(path.join(data,".drafts","草稿验收.json")));
  });
  await check("New notes are truly blank", async () => {
    await clickText("+ 笔记", "button");
    const input = await find("//h3[normalize-space(text())='新建笔记']/following-sibling::input", "xpath");
    await call("POST", "/element/" + input + "/value", { text: "空白新建", value: [..."空白新建"] });
    await clickText("确定", "button"); await idle();
    assert.equal(await readFile(path.join(data, "空白新建.md"), "utf8"), "");
    const state = await execute("const pane=document.querySelector('[data-editor-pane=\"left\"]');return {text:pane.querySelector('[contenteditable=\"true\"]')?.innerText||'',headings:pane.querySelectorAll('[data-content-type=\"heading\"]').length,paragraphs:pane.querySelectorAll('[data-content-type=\"paragraph\"]').length};");
    assert.equal(state.text.trim(), "");
    assert.equal(state.headings, 0);
    assert.ok(state.paragraphs >= 1);
    await clickText("验收笔记A", "span"); await idle();
  });
  await check("Markdown table, formulas, code and attachment previews", async () => {
    await clickText("验收笔记A", "span"); await idle();
    await wait(async () => (await bodyText()).includes("关联成功"), "table missing");
    for(const name of ["preview.pdf","preview.docx","text.txt"]){
      await execute("[...document.querySelectorAll('[data-content-type=\"file\"]')].find(el=>el.innerText.includes(arguments[0]))?.scrollIntoView({block:'center'});",name);
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    await wait(async () => (await bodyText()).includes("Word 附件预览成功") && (await bodyText()).includes("文本附件预览成功"), "attachments not rendered", 30000);
    await wait(() => execute("return document.querySelectorAll('[data-content-type=\"file\"] img[src^=\"data:image\"]').length>0"), "PDF preview missing", 30000);
    assert.equal(await execute("return document.querySelectorAll('.katex').length>0"), true);
    assert.equal(await execute("return document.querySelectorAll('[data-content-type=\"mermaid\"] svg').length>0"), true);
    await screenshot("editor-preview");
  });
  await check("Table search does not crash", async () => {
    await type('[data-editor-pane="left"] [contenteditable="true"]', "\uE009f\uE000");
    await wait(() => execute("return !!document.querySelector('#inline-search-input')"), "search not open");
    await type("#inline-search-input", "关联成功");
    await wait(async () => (await bodyText()).includes("1/1"), "search result missing");
    await type("#inline-search-input", "\uE00C");
  });
  await check("Reading and searching leave source unchanged", async () => {
    await idle();
    assert.equal(await readFile(path.join(data, "验收笔记A.md"), "utf8"), originalA);
  });
  await check("Chinese editing and saving preserve untouched source", async () => {
    await caretAtParagraphEnd("left");
    await type('[data-editor-pane="left"] [contenteditable="true"]', "中文输入验收");
    await click('button[title="保存两栏 (Ctrl+S)"]'); await idle();
    const saved = await readFile(path.join(data, "验收笔记A.md"), "utf8");
    assert.ok(saved.includes("中文输入验收"), saved.slice(0, 200));
    assert.ok(saved.endsWith(originalA.slice(originalA.indexOf("\n\n| 项目"))), "untouched source changed");
    await clickText("验收笔记B", "span"); await idle();
    await type('[data-editor-pane="left"] [contenteditable="true"]', "\uE009z\uE000");
    assert.ok(!(await execute("return document.querySelector('[data-editor-pane=\"left\"]').innerText")).includes("中文输入验收"));
    await clickText("验收笔记A", "span"); await idle();
  });
  await check("Split-pane editing and save before hiding", async () => {
    await click('button[title="双栏编辑"]'); await idle();
    await modifier("\uE009", true); await clickText("验收笔记B", "span"); await modifier("\uE009", false); await idle();
    await wait(() => execute("return !!document.querySelector('[data-editor-pane=\"right\"] [contenteditable=\"true\"]')"), "right pane did not load");
    await caretAtParagraphEnd("right");
    await type('[data-editor-pane="right"] [contenteditable="true"]', "右侧中文编辑");
    await click('button[title="退出双栏编辑"]'); await idle();
    assert.ok((await readFile(path.join(data, "验收笔记B.md"), "utf8")).includes("右侧中文编辑"));
  });
  await check("External-write conflicts retain edits and cancel navigation", async () => {
    const note = path.join(data, "验收笔记A.md");
    const saved = await readFile(note, "utf8");
    await writeFile(note, saved + "\n外部修改\n");
    await caretAtParagraphEnd("left");
    await type('[data-editor-pane="left"] [contenteditable="true"]', "冲突未保存");
    await clickText("验收笔记B", "span"); await idle();
    assert.ok((await execute("return document.querySelector('[data-editor-pane=\"left\"]').innerText")).includes("冲突未保存"));
    assert.equal(await readFile(note, "utf8"), saved + "\n外部修改\n");
    await writeFile(note, saved); // Only our disposable fixture: allow retry against the known baseline.
    if(await execute("return !!document.querySelector('[aria-label=\"处理外部修改\"]')"))await click('button[aria-label="关闭处理外部修改"]');
    await click('button[title="保存两栏 (Ctrl+S)"]'); await idle();
    assert.ok((await readFile(note, "utf8")).includes("冲突未保存"));
  });
  await check("Untrusted HTML stays inert source", async () => {
    await clickText("不可信HTML", "span"); await idle();
    assert.equal(await execute("return !!window.__unsafeMarkdownExecuted"), false);
    assert.ok(await execute("return document.querySelector('textarea[aria-label=\"Markdown 原文块\"]')?.value.includes('<script>')"));
  });
  if (sample) await check("Real technical Markdown opens without rewriting", async () => {
    await clickText("实测技术路线", "span"); await idle();
    await wait(() => execute("return document.querySelectorAll('[data-content-type=\"table\"]').length===2"), "original tables missing", 30000);
    assert.equal(createHash("sha256").update(await readFile(path.join(data, "实测技术路线.md"))).digest("hex"), sourceHash);
    await screenshot("technical-note");
    assert.ok(await execute("return document.querySelectorAll('[data-content-type=\"latex\"] .katex').length>=30 && document.querySelectorAll('[data-inline-content-type=\"inlineMath\"] .katex').length>=30"));
    assert.equal(await execute("return document.querySelectorAll('.math-preview-error').length"), 0);
    await execute("[...document.querySelectorAll('[data-content-type=\"latex\"]')].find(block=>block.querySelector('annotation')?.textContent.includes(arguments[0]))?.scrollIntoView({block:'center'});", String.raw`\mathcal G_t`);
    await wait(async () => !(await bodyText()).includes("加载失败:") && !(await bodyText()).includes("保存失败:"), "earlier conflict notifications did not clear");
    await screenshot("technical-formula");
  });
  if (sample) await check("Section 5.3 continues numbering 1-7 around its formula", async () => {
    const section = await execute("const blocks=[...document.querySelectorAll('[data-editor-pane=\"left\"] .bn-block-content')];const start=blocks.findIndex(b=>b.dataset.contentType==='heading'&&b.textContent.includes('5.3 匹配求解'));let end=blocks.findIndex((b,i)=>i>start&&b.dataset.contentType==='heading');if(end<0)end=blocks.length;const selected=blocks.slice(start,end);selected[0]?.scrollIntoView({block:'start'});return selected.map(b=>({type:b.dataset.contentType,index:b.dataset.index}));");
    assert.deepEqual(section.filter(block => block.type === "numberedListItem").map(block => block.index), ["1", "2", "3", "4", "5", "6", "7"]);
    assert.equal(section.some(block => block.type === "rawMarkdown"), false);
    assert.equal(section.filter(block => block.type === "latex").length, 1);
    await screenshot("continued-numbering");
  });
  if (legacySample) await check("Old-format note displays 53 recovered formulas and normal inline math", async () => {
    await clickText("实测旧版公式", "span"); await idle();
    await wait(() => execute("return document.querySelectorAll('[data-legacy-math-preview] > div > [data-math-preview]').length===53"), "legacy formulas not separated");
    assert.ok(await execute("return document.querySelectorAll('[data-inline-content-type=\"inlineMath\"] .katex').length>=80"));
    assert.equal(await execute("return document.querySelectorAll('.math-preview-error').length"), 0);
    assert.equal(await execute("return document.querySelector('[data-editor-pane=\"left\"]').innerText.includes('@@LATEX_ID_')"), false);
    await execute("document.querySelector('[data-content-type=\"legacyMath\"]').scrollIntoView({block:'start'});");
    await screenshot("legacy-formulas");
    assert.equal(createHash("sha256").update(await readFile(path.join(data, "实测旧版公式.md"))).digest("hex"), legacyHash);
  });
  if (legacySample) await check("Old-format source remains available, read-only in reading mode and exact on save", async () => {
    await clickText("查看/编辑旧版原文", "button");
    assert.ok(await execute("return document.querySelector('textarea[aria-label=\"旧版公式原文\"]').value.includes('@@LATEX_ID_51@@')"));
    await click('button[title="阅读模式"]'); await idle();
    // Switching editor modes remounts custom node views and closes local panels.
    await clickText("查看/编辑旧版原文", "button");
    assert.equal(await execute("return document.querySelector('textarea[aria-label=\"旧版公式原文\"]').readOnly"), true);
    await click('button[title="编辑模式"]'); await idle();
    if (await execute("return !!document.querySelector('textarea[aria-label=\"旧版公式原文\"]')")) await clickText("返回公式预览", "button");
    await click('button[title="保存两栏 (Ctrl+S)"]'); await idle();
    await clickText("验收笔记A", "span"); await idle();
    assert.equal(createHash("sha256").update(await readFile(path.join(data, "实测旧版公式.md"))).digest("hex"), legacyHash);
  });
  await check("Bracket, inline and escaped formulas display with real mathematical layout", async () => {
    await clickText("公式兼容", "span"); await idle();
    await wait(() => execute("return document.querySelectorAll('[data-content-type=\"latex\"] .katex').length===3"), "display formulas missing");
    assert.equal(await execute("return document.querySelectorAll('[data-inline-content-type=\"inlineMath\"] .katex').length"), 3);
    assert.equal(await execute("return document.querySelectorAll('.math-preview-error').length"), 0);
    assert.ok(await execute("return document.querySelectorAll('.katex .msupsub').length>=5"));
    assert.equal(await readFile(path.join(data, "公式兼容.md"), "utf8"), formulaSource);
    await screenshot("formula-preview");
  });
  await check("Display and inline formula edits save and reopen correctly", async () => {
    await click('[data-content-type="latex"] [title="点击编辑公式"]');
    await wait(() => execute("return !!document.querySelector('textarea[aria-label=\"编辑独立公式\"]')"), "display editor missing");
    await type('textarea[aria-label="编辑独立公式"]', "\uE009a\uE000" + String.raw`\mathcal G_{t+1}=(\mathcal V_t,\mathcal E_t)`);
    await click('button[title="保存两栏 (Ctrl+S)"]'); await idle();
    let saved = await readFile(path.join(data, "公式兼容.md"), "utf8");
    assert.ok(saved.includes(String.raw`\mathcal G_{t+1}`));
    assert.ok(saved.endsWith(formulaSource.slice(formulaSource.indexOf("\n\n[\\\n"))), "untouched legacy formula changed");
    await execute("document.querySelector('[data-inline-content-type=\"inlineMath\"] [title=\"双击编辑行内公式\"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));");
    await wait(() => execute("return !!document.querySelector('input[aria-label=\"编辑行内公式\"]')"), "inline editor missing");
    await type('input[aria-label="编辑行内公式"]', "\uE009a\uE000t+2\uE007");
    await click('button[title="保存两栏 (Ctrl+S)"]'); await idle();
    saved = await readFile(path.join(data, "公式兼容.md"), "utf8");
    assert.ok(saved.includes(String.raw`\(t+2\)`));
    await clickText("验收笔记B", "span"); await idle();
    await clickText("公式兼容", "span"); await idle();
    assert.ok(await execute("return [...document.querySelectorAll('annotation')].some(el=>el.textContent==='t+2')"));
    assert.equal(await execute("return document.querySelectorAll('.math-preview-error').length"), 0);
  });
  await check("Read mode displays formulas without opening their source editors", async () => {
    await click('button[title="阅读模式"]');
    await click('[data-content-type="latex"] [title="点击编辑公式"]');
    await execute("document.querySelector('[data-inline-content-type=\"inlineMath\"] [title=\"双击编辑行内公式\"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));");
    assert.equal(await execute("return document.querySelectorAll('[aria-label=\"编辑独立公式\"], [aria-label=\"编辑行内公式\"]').length"), 0);
    assert.ok(await execute("return document.querySelectorAll('.katex').length>=6"));
    await click('button[title="编辑模式"]');
    await clickText("验收笔记A","span");await idle();await click('button[title="阅读模式"]');
    assert.ok(await execute("return document.querySelector('select[aria-label=\"代码语言\"]')?.disabled"));
    assert.equal(await execute("return document.querySelectorAll('[title=\"拖动调整大小\"]').length"),0);
    await execute("document.querySelector('.code-block-container > div:nth-child(2) > div')?.click();document.querySelector('.mermaid-block-wrapper > div:nth-child(2)')?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));");
    assert.equal(await execute("return document.querySelectorAll('[data-content-type=\"codeBlock\"] textarea,[data-content-type=\"mermaid\"] textarea').length"),0);
    await click('button[title="编辑模式"]');
  });
  const menu=async(text,settle=true)=>{await click('summary[aria-label="更多笔记操作"]');await clickText(text,"button");if(settle)await idle();};
  await check("Callout editing survives save, reopen and reading mode",async()=>{
    await clickText("提示框验收","span");await idle();
    await wait(()=>execute("return document.querySelector('[data-content-type=\"callout\"]')?.innerText.includes('初始提示正文')"),"callout body missing");
    await execute("const el=document.querySelector('[data-content-type=\"callout\"] .bn-inline-content');const range=document.createRange();range.selectNodeContents(el);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);el.closest('[contenteditable=\"true\"]').focus();");
    await type('[data-editor-pane="left"] [contenteditable="true"]',"新增提示正文");await click('button[title="保存两栏 (Ctrl+S)"]');await idle();
    const saved=await readFile(path.join(data,"提示框验收.md"),"utf8");assert.ok(saved.includes("新增提示正文")&&saved.includes("[!WARNING]"));assert.ok(!saved.includes("info⚠"));
    await click('button[title="阅读模式"]');await wait(()=>execute("return !!document.querySelector('select[aria-label=\"提示框类型\"]')?.disabled"),"read-mode callout editable");
    await click('button[title="编辑模式"]');await clickText("源码验收","span");await idle();await clickText("提示框验收","span");await idle();
    assert.ok(await execute("return document.querySelector('[data-content-type=\"callout\"]').innerText.includes('新增提示正文')"));await screenshot("callout");
  });
  await check("Source editing saves exact Markdown and protects idle drafts",async()=>{
    await clickText("源码验收","span");await idle();await menu("Markdown 源码");
    const source="# 源码验收\n\n源码新增内容\n\n> [!TIP] 源码提示\n> 源码提示正文\n";
    await type('textarea[aria-label="Markdown 源码"]',"\uE009a\uE000"+source);
    await wait(async()=>(await readDraft("源码验收")).content===source,"idle recovery draft missing");
    await click('button[title="保存两栏 (Ctrl+S)"]');await idle();assert.equal(await readFile(path.join(data,"源码验收.md"),"utf8"),source);
    await menu("块编辑视图");assert.ok(await execute("return document.querySelector('[data-content-type=\"callout\"]')?.innerText.includes('源码提示正文')"));
  });
  await check("History previews changes and restores a selected version",async()=>{
    await menu("历史版本");await wait(()=>execute("return document.querySelector('select[aria-label=\"选择历史版本\"]')?.options.length>1"),"history missing");
    await execute("const el=document.querySelector('select[aria-label=\"选择历史版本\"]');el.selectedIndex=1;el.dispatchEvent(new Event('change',{bubbles:true}));");
    await wait(()=>execute("return document.querySelector('.diff-preview')?.innerText.includes('原始源码正文')"),"version comparison missing");
    await clickText("恢复所选版本","button");await idle();await wait(()=>execute("return !document.querySelector('[aria-label=\"历史版本\"]')"),"restore not completed");
    assert.ok((await readFile(path.join(data,"源码验收.md"),"utf8")).includes("原始源码正文"));
  });
  await check("Global search pages results and opens the selected block",async()=>{
    await click('button[title="全局搜索替换 (Ctrl+Shift+F)"]');await type('input[aria-label="全局搜索关键词"]',"分页关键词");await clickText("搜索","button");
    await wait(async()=>(await bodyText()).includes("已展示 100 条"),"first result page missing");await clickText("加载更多","button");
    await wait(async()=>(await bodyText()).includes("已展示 120 条"),"second page missing");
    await execute("[...document.querySelectorAll('.search-result')].find(el=>el.innerText.trim().endsWith('分页关键词 120')).click();");await idle();
    await wait(()=>execute("return document.querySelector('.search-hit')?.getAttribute('aria-label')?.includes('分页关键词 120')"),"search did not locate final block");
    await screenshot("search-location");
  });
  await check("Replace previews a diff and leaves code, math and URLs intact",async()=>{
    await click('button[title="全局搜索替换 (Ctrl+Shift+F)"]');await type('input[aria-label="全局搜索关键词"]',"REPLACE_ME");await clickText("搜索","button");
    await wait(()=>execute("return document.querySelectorAll('.search-file').length>0"),"replacement results missing");await type('#replacement',"替换完成");
    await clickText("预览替换","button");await wait(async()=>(await bodyText()).includes("预计替换 1 处"),"safe replacement count incorrect");
    await clickText("确认替换这篇笔记","button");await idle();await wait(()=>execute("return !document.querySelector('.diff-preview')"),"replace did not finish");
    const saved=await readFile(path.join(data,"替换保护.md"),"utf8");assert.ok(saved.includes("替换完成"));assert.ok(saved.includes("`REPLACE_ME`")&&saved.includes("$REPLACE_ME$")&&saved.includes("example.com/REPLACE_ME"));
    await click('button[aria-label="关闭全局搜索与替换"]');
  });
  await check("Right pane owns search and shared insertion commands",async()=>{
    await clickText("验收笔记A","span");await idle();await click('button[title="双栏编辑"]');await idle();
    await modifier("\uE009",true);await clickText("验收笔记B","span");await modifier("\uE009",false);await idle();
    await type('[data-editor-pane="right"] [contenteditable="true"]',"\uE009f\uE000");await wait(()=>execute("return !!document.querySelector('[data-editor-pane=\"right\"] #inline-search-input')"),"right search missing");
    await type('#inline-search-input',"右侧初始内容");await wait(()=>execute("return !!document.querySelector('[data-search-overlay]')"),"right search used left index");
    await type('#inline-search-input',"\uE00C");await menu("Markdown 源码");assert.ok(await execute("return !!document.querySelector('[data-editor-pane=\"right\"] .source-editor')"));await menu("块编辑视图");
    await screenshot("split-pane");await click('button[title="退出双栏编辑"]');await idle();
  });
  await check("Old attachment links migrate and a complete portable package exports",async()=>{
    await clickText("搬迁验收","span");await idle();await wait(()=>execute("const img=document.querySelector('[data-content-type=\"image\"] img');return img?.complete&&img.naturalWidth>0"),"relocated legacy image missing");
    await menu("检查附件链接");await clickText("扫描笔记库","button");await wait(async()=>(await bodyText()).includes("扫描完成"),"link scan not finished");
    await execute("[...document.querySelectorAll('.migration-list label')].find(el=>el.innerText.includes('搬迁验收')).querySelector('input').click();");await clickText("迁移所选笔记","button");await idle();
    await wait(async()=>(await bodyText()).includes("迁移完成"),"link migration failed");await click('button[aria-label="关闭附件链接检查"]');
    const saved=await readFile(path.join(data,"搬迁验收.md"),"utf8");assert.ok(!saved.includes("Z%3A")&&saved.includes("assets/"));
    await menu("导出笔记及附件包",false);const destination=path.join(qa,"portable-note.zip");
    await promisify(execFile)("powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass","-File",path.join(project,"tests/native-dialog.ps1"),"-Executable",binary,"-Action","Save","-Destination",destination],{windowsHide:true,timeout:30000});
    await wait(async()=>{try{await access(destination);return true;}catch{return false;}},"package not written");
    const exported=await JSZip.loadAsync(await readFile(destination));assert.ok(exported.file("搬迁验收.md"));assert.ok(exported.file("assets/验收附件/image.png")&&exported.file("assets/验收附件/text.txt"));
    assert.ok((await exported.file("搬迁验收.md").async("string")).includes("assets/"));
  });
  await check("Reading settings and compact layout remain usable",async()=>{
    await click('button[title="设置"]');await wait(()=>execute("return !!document.querySelector('[aria-label=\"阅读与外观设置\"]')"),"settings missing");
    await execute("const el=document.querySelector('input[aria-label=\"正文字号\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'18');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));");
    await clickText("完成","button");await wait(async()=>JSON.parse(await readFile(path.join(data,".workspace.json"),"utf8")).reading.fontSize===18,"settings were not saved inside library");
    await call("POST","/window/rect",{width:800,height:650,x:20,y:20});await screenshot("compact-layout");
    assert.ok(await execute("return [...document.querySelectorAll('.note-tab')].every(el=>el.getBoundingClientRect().width>=109)"));
    assert.ok(await execute("const host=document.querySelector('#tab-scroll').getBoundingClientRect(),tab=document.querySelector('.note-tab[aria-selected=\"true\"]').getBoundingClientRect();return tab.left>=host.left-1&&tab.right<=host.right+1"));
    assert.equal(await execute("return document.documentElement.scrollWidth>innerWidth+2"),false);
    await call("POST","/window/rect",{width:1280,height:960,x:20,y:20});
  });
  await check("Conflict actions retain both versions and preserve recoverable edits",async()=>{
    await clickText("源码验收","span");await idle();const note=path.join(data,"源码验收.md");
    let saved=await readFile(note,"utf8");await writeFile(note,saved+"\n副本测试外部修改\n");await caretAtParagraphEnd("left");await type('[data-editor-pane="left"] [contenteditable="true"]',"副本保留正文");
    await click('button[title="保存两栏 (Ctrl+S)"]');await idle();await wait(()=>execute("return !!document.querySelector('[aria-label=\"处理外部修改\"]')"),"conflict resolver missing");
    await clickText("当前内容另存为副本","button");await idle();await wait(()=>execute("return !document.querySelector('[aria-label=\"处理外部修改\"]')"),"copy resolution did not finish");
    const copies=(await readdir(data)).filter(name=>name.startsWith("源码验收（副本 "));assert.equal(copies.length,1);assert.ok((await readFile(path.join(data,copies[0]),"utf8")).includes("副本保留正文"));assert.ok(!(await readFile(note,"utf8")).includes("副本保留正文"));
    saved=await readFile(note,"utf8");await writeFile(note,saved+"\n采用磁盘版本测试\n");await caretAtParagraphEnd("left");await type('[data-editor-pane="left"] [contenteditable="true"]',"待恢复的冲突正文");
    await click('button[title="保存两栏 (Ctrl+S)"]');await idle();await clickText("采用磁盘版本","button");await idle();await wait(()=>execute("return !document.querySelector('[aria-label=\"处理外部修改\"]')"),"reload resolution did not finish");
    assert.ok(await execute("return document.querySelector('[data-editor-pane=\"left\"]').innerText.includes('采用磁盘版本测试')"));
    await click('summary[aria-label="更多笔记操作"]');await execute("[...document.querySelectorAll('.more-menu button')].find(el=>el.textContent.startsWith('恢复草稿')).click();");
    await wait(()=>execute("return document.querySelector('.diff-preview')?.innerText.includes('待恢复的冲突正文')"),"reloaded edits were not retained as a recovery draft");
    for(let count=0;count<5;count++){
      if(!await execute("return !![...document.querySelectorAll('[aria-label=\"恢复未保存草稿\"] button')].find(el=>el.textContent==='丢弃这份草稿')"))break;
      await clickText("丢弃这份草稿","button");await new Promise(resolve=>setTimeout(resolve,200));
    }
    await click('button[aria-label="关闭恢复未保存草稿"]');
  });
  await check("History remains accessible after renaming a note",async()=>{
    await execute("[...document.querySelectorAll('[role=\"treeitem\"]')].find(el=>el.querySelector('.file-tree-name')?.textContent==='源码验收').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:120,clientY:200}));");
    await clickText("✏️ 重命名");await type('[role="dialog"] input',"\uE009a\uE000源码改名验收");await clickText("确定","button");await idle();
    await menu("历史版本");await wait(()=>execute("return document.querySelector('select[aria-label=\"选择历史版本\"]')?.options.length>1"),"renamed history missing");
    await execute("const el=document.querySelector('select[aria-label=\"选择历史版本\"]');el.selectedIndex=1;el.dispatchEvent(new Event('change',{bubbles:true}));");
    await wait(()=>execute("return !!document.querySelector('.diff-preview')"),"renamed version could not be read");await click('button[aria-label="关闭历史版本"]');
  });
  await check("Cleanup preview, confirmation and protected attachments", async () => {
    await execute("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('容量管理')).click();");
    await wait(async () => (await bodyText()).includes("orphan.bin"), "orphan candidate missing");
    assert.equal(await execute("return [...document.querySelectorAll('[role=\"dialog\"] button')].find(button=>button.textContent==='永久删除所选文件').disabled"), true);
    await clickText("选择当前列表", "button");
    await execute("const labels=[...document.querySelectorAll('[role=\"dialog\"] label')];labels.find(label=>label.textContent.includes('我已核对')).querySelector('input').click();");
    await screenshot("cleanup-preview");
    await clickText("永久删除所选文件", "button");
    await wait(async () => (await bodyText()).includes("已永久删除 1 个文件"), "cleanup did not finish");
    await assert.rejects(access(path.join(assets, "orphan.bin")));
    await access(path.join(assets, "image.png")); await access(path.join(assets, "preview.pdf"));
    await click('button[aria-label="关闭容量管理"]');
    await clickText("验收笔记A", "span"); await idle();
  });
  await productivityChecks({check,click,clickText,type,execute,wait,idle,menu,caretAtParagraphEnd,screenshot,data,qa,call,find});
  await comfortChecks({check,click,clickText,type,execute,wait,idle,menu,caretAtParagraphEnd,screenshot,data,qa,call});
  await workflowChecks({check,click,clickText,type,execute,wait,idle,menu,caretAtParagraphEnd,screenshot,data});
  await screenshot("ready");
  await check("Word export through native save dialog", async () => {
    await click('button[title="导出为 Word"]');
    const destination = path.join(qa, "export.docx");
    await promisify(execFile)("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(project, "tests/native-dialog.ps1"), "-Executable", binary, "-Action", "Save", "-Destination", destination], { windowsHide: true, timeout: 30000 });
    await wait(async () => (await bodyText()).includes("公式可在 Word 中继续编辑"), "Word export did not finish");
    const docx = await JSZip.loadAsync(await readFile(destination));
    assert.ok(docx.file("word/document.xml"));
    assert.equal(docx.file("word/afchunk.mht"), null, "Word still uses the old HTML wrapper");
    const documentXml = await docx.file("word/document.xml").async("string");
    await writeFile(path.join(qa,"word-document.xml"), documentXml);
    assert.ok(documentXml.includes("关联成功") && documentXml.includes("中文输入验收"), "Word output lost body text or table");
    assert.ok(documentXml.includes("代码预览") && documentXml.includes("test"), "Word output lost code or text");
    assert.ok((documentXml.match(/<m:oMath[ >]/g) || []).length >= 4, "Word output lost native equations");
    assert.match(documentXml, /<m:f>/); assert.match(documentXml, /<m:rad>/); assert.match(documentXml, /<m:m>/);
    assert.ok(!documentXml.includes("$$") && !documentXml.includes("\\frac") && !documentXml.includes("x^2+y^2"), "Word retained Markdown formula source");
    const media = Object.keys(docx.files).filter(name => name.startsWith("word/media/") && !docx.files[name].dir);
    assert.ok(media.length >= 2, "Word diagram or normal image was not embedded");
    assert.ok(!documentXml.includes("无法预览") && !documentXml.includes("图表导出失败"));
  });
  await check("PDF print layout produces a valid PDF", async () => {
    await execute("window.dispatchEvent(new Event('prepare-note-print'));");
    await wait(async()=>(await bodyText()).includes("文本附件预览成功")&&(await bodyText()).includes("Word 附件预览成功"),"print previews not ready");
    const pdf = await call("POST", "/print", { background: true, shrinkToFit: true });
    const bytes = Buffer.from(pdf, "base64");
    assert.equal(bytes.subarray(0,5).toString(), "%PDF-");
    await writeFile(path.join(qa,"export.pdf"), bytes);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    try {
      const document = await loading.promise;
      let text = "";
      for (let page = 1; page <= document.numPages; page++) {
        const content = await (await document.getPage(page)).getTextContent();
        text += content.items.map(item => item.str || "").join("");
      }
      // Embedded Chinese fonts can extract CJK compatibility radicals rather
      // than their unified characters even when the rendered glyph is identical.
      text = text.normalize("NFKC");
      await writeFile(path.join(qa,"pdf-text.txt"), text);
      assert.ok(text.includes("关联成功") && text.includes("文本附件预览成功"), "PDF body or final attachment was clipped");
      assert.ok(text.includes("行内") && !text.includes("$a_b$") && text.includes("代码预览"), "PDF formula/code missing");
      assert.ok(!text.includes("导出 Word 成功") && !text.includes("加载失败"), "PDF contains transient notifications");
    } finally { await loading.destroy(); }
  });
  await check("Close failure keeps the window and unsaved content", async () => {
    const note = path.join(data, "验收笔记A.md");
    const saved = await readFile(note, "utf8");
    await caretAtParagraphEnd("left");
    await type('[data-editor-pane="left"] [contenteditable="true"]', "关闭保护验收");
    await writeFile(note, saved + "\n关闭时外部修改\n");
    await execute("window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'}).catch(error=>window.__qaErrors.push(String(error))); ");
    await wait(async () => (await bodyText()).includes("关闭失败"), "close failure was not shown");
    assert.ok((await bodyText()).includes("关闭保护验收"));
    assert.equal(await readFile(note, "utf8"), saved + "\n关闭时外部修改\n");
    await writeFile(note, saved);
  });
  const events = await execute("return {errors:window.__qaErrors,csp:window.__qaCsp}");
  await writeFile(path.join(qa, "browser-events.json"), JSON.stringify(events, null, 2));
  assert.deepEqual(events, { errors: [], csp: [] });
  await check("Close saves pending changes before destroying the window", async () => {
    await execute("window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'});");
    await wait(async () => (await readFile(path.join(data, "验收笔记A.md"), "utf8")).includes("关闭保护验收"), "close did not save pending content");
    await wait(async () => { try { await bodyText(); return false; } catch { return true; } }, "window did not close");
  });
  await check("Moving the complete library restores tabs, reading settings and local attachments",async()=>{
    try{await request("DELETE","/session/"+session);}catch{}session=undefined;
    const relocated=path.join(qa,"relocated");await mkdir(relocated,{recursive:true});
    const movedBinary=path.join(relocated,"portable-note.exe");await copyFile(binary,movedBinary);await cp(data,path.join(relocated,"data"),{recursive:true});
    const created=await request("POST","/session",{capabilities:{alwaysMatch:{"tauri:options":{application:movedBinary}}}});session=created.sessionId;
    await call("POST","/window/rect",{width:1280,height:960,x:20,y:20});
    await wait(()=>execute("return document.querySelector('[data-editor-pane=\"left\"]')?.innerText.includes('验收笔记A')"),"last active tab not restored");await idle();
    assert.equal(await execute("return getComputedStyle(document.querySelector('.bn-editor')).fontSize"),"18px");
    const url=await execute("return document.querySelector('[data-content-type=\"image\"] img')?.src");assert.ok(decodeURIComponent(url).replaceAll('\\','/').includes("/relocated/data/assets/"));
    await wait(()=>execute("const img=document.querySelector('[data-content-type=\"image\"] img');return img?.complete&&img.naturalWidth>0"),"moved attachment did not load");
    await screenshot("relocated-library");
  });
  await librarySwitchingChecks({check,execute,wait,clickText,click,idle,call,qa,screenshot});
} catch (error) {
  console.error(String(error));
  try{console.error("Console errors:",await execute("return window.__qaLogs"));}catch{}
  try { await screenshot("failure"); console.error((await bodyText()).slice(0,5000)); } catch {}
  process.exitCode = 1;
} finally {
  if (session) {
    try {
      const details = await execute("return {errors:window.__qaErrors,csp:window.__qaCsp}");
      if(Array.isArray(details.errors)&&Array.isArray(details.csp))await writeFile(path.join(qa, "browser-events.json"), JSON.stringify(details, null, 2));
    } catch {}
    try { await request("DELETE", "/session/" + session); } catch {}
  }
  driver.kill();
  if (sample) assert.equal(createHash("sha256").update(await readFile(sample)).digest("hex"), sourceHash, "Original sample changed");
  if (sample) assert.equal(createHash("sha256").update(await readFile(path.join(data, "实测技术路线.md"))).digest("hex"), sourceHash, "Unedited technical copy changed");
  if (legacySample) assert.equal(createHash("sha256").update(await readFile(legacySample)).digest("hex"), legacyHash, "Original legacy sample changed");
  if (legacySample) assert.equal(createHash("sha256").update(await readFile(path.join(data, "实测旧版公式.md"))).digest("hex"), legacyHash, "Unedited legacy copy changed");
  await writeFile(path.join(qa, "driver.log"), log.join(""));
  await writeFile(path.join(qa, "report.json"), JSON.stringify({ qa, results, originalSampleUnchanged: !!sample, originalLegacySampleUnchanged: !!legacySample }, null, 2));
  console.log("QA directory: " + qa);
}
