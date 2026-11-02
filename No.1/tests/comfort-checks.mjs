import assert from "node:assert/strict";
import {readFile,writeFile,mkdir,readdir} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import path from "node:path";
export async function comfortChecks(c){
  const {check,click,clickText,type,execute,wait,idle,menu,caretAtParagraphEnd,screenshot,data,qa,call}=c;
  const metrics={};
  const invoke=async(name,args={})=>{const r=await call("POST","/execute/async",{script:"const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({value})).catch(error=>done({error:String(error)}));",args:[name,args]});if(r.error)throw new Error(r.error);return r.value;};
  const select=(label,value)=>execute("const el=document.querySelector('select[aria-label=\"'+arguments[0]+'\"]');el.value=arguments[1];el.dispatchEvent(new Event('change',{bubbles:true}));",label,value);
  const open=async name=>{await clickText(name,"span");await idle();};
  await check("4.3 dark and system themes apply across the editor and dialogs",async()=>{
    await open("折叠粘贴样本");await click('button[title="设置"]');await select("界面主题","dark");await wait(()=>execute("return document.documentElement.dataset.theme==='dark'"),"dark theme not applied");await screenshot("dark-settings");await clickText("完成","button");
    assert.ok(await execute("return getComputedStyle(document.querySelector('.note-body')).backgroundColor!=='rgb(255, 255, 255)'"));await screenshot("dark-editor");
    await click('button[title="设置"]');await select("界面主题","system");await wait(()=>execute("return document.documentElement.dataset.theme===(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')"),"system theme not followed");await select("界面主题","light");await clickText("完成","button");
  });
  await check("4.3 heading folding is visual and paste creates a structured table",async()=>{
    const original=await readFile(path.join(data,"折叠粘贴样本.md"),"utf8");await click('button[aria-label="折叠章节：第一节"]');
    await wait(()=>execute("return ![...document.querySelectorAll('[data-editor-pane=\"left\"] [data-content-type=\"paragraph\"]')].find(el=>el.innerText.includes('第一节正文'))?.getClientRects().length"),"section did not collapse");
    await click('button[title="保存两栏 (Ctrl+S)"]');await idle();assert.equal(await readFile(path.join(data,"折叠粘贴样本.md"),"utf8"),original);
    await click('button[aria-label="展开章节：第一节"]');await caretAtParagraphEnd("left");
    await execute("const el=document.querySelector('[data-editor-pane=\"left\"] [contenteditable=true]');const data=new DataTransfer();data.setData('text/plain',arguments[0]);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));","参数\t数值\r\n能量\t2");
    await wait(()=>execute("return [...document.querySelectorAll('[data-content-type=\"table\"]')].some(el=>el.innerText.includes('能量'))"),"tabular paste did not create table");await click('button[title="保存两栏 (Ctrl+S)"]');await idle();assert.ok((await readFile(path.join(data,"折叠粘贴样本.md"),"utf8")).includes("能量"));
  });
  await check("4.3 bulk edits, tag merging and inline collection edits preserve source",async()=>{
    await clickText("智能集合","button");await type('input[aria-label="快速搜索关键词"]',"批量样本");await wait(()=>execute("return document.querySelectorAll('.knowledge-entry').length===2"),"batch fixture search missing");
    await execute("document.querySelector('details.batch-tools').open=true");await clickText("选择筛选结果（最多 1000 篇）","button");await type('input[aria-label="批量类型"]',"实验");await type('input[aria-label="批量状态"]',"完成");await type('input[aria-label="批量添加标签"]',"批量");await clickText("应用到所选 2 篇笔记","button");
    await wait(async()=>(await readFile(path.join(data,"批量样本乙.md"),"utf8")).includes("status: 完成"),"bulk edit did not finish");
    await type('input[aria-label="原标签"]',"旧标签");await type('input[aria-label="合并后的标签"]',"统一标签");await clickText("重命名 / 合并标签","button");await wait(async()=>!(await readFile(path.join(data,"批量样本甲.md"),"utf8")).includes("旧标签"),"tag merge failed");
    const text=await readFile(path.join(data,"批量样本甲.md"),"utf8");assert.ok(text.includes("custom: 保留"));assert.ok(text.includes("$$a_b$$"));
    await clickText("表格","button");await type('input[aria-label="批量样本甲的状态"]',"\uE009a\uE000归档\uE007");await wait(async()=>(await readFile(path.join(data,"批量样本甲.md"),"utf8")).includes("status: 归档"),"inline property edit failed");
    await select("笔记排序","title");await select("笔记分组","status");await execute("document.querySelector('[aria-label=\"智能集合\"] details:not(.batch-tools)').open=true");await type('input[aria-label="集合名称"]',"固定批量集合");await clickText("保存当前筛选","button");await clickText("固定到侧边栏","button");await screenshot("bulk-collections");await click('button[aria-label="关闭智能集合"]');
    await click('.pinned-collections button');await wait(()=>execute("return document.querySelector('select[aria-label=\"笔记分组\"]')?.value==='status'"),"pinned view not restored");assert.equal(await execute("return document.querySelector('select[aria-label=\"笔记排序\"]').value"),"title");await click('button[aria-label="关闭智能集合"]');
  });
  await check("4.3 duplicate attachments reuse content and a batch import is cancellable",async()=>{
    await open("折叠粘贴样本");await caretAtParagraphEnd("left");
    await execute("const data=new DataTransfer();data.items.add(new File(['shared fixture bytes'],'批量附件一.txt',{type:'text/plain'}));data.items.add(new File(['shared fixture bytes'],'批量附件二.txt',{type:'text/plain'}));document.querySelector('[data-editor-pane=\"left\"] [contenteditable=true]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));");
    await wait(async()=>(await readFile(path.join(data,"折叠粘贴样本.md"),"utf8")).includes("批量附件二.txt"),"batch import did not finish",20000);await idle();
    const source=await readFile(path.join(data,"折叠粘贴样本.md"),"utf8"),links=[...source.matchAll(/assets\/shared\/[^)>\s]+/g)].map(m=>m[0]);assert.equal(links.length,2);assert.equal(links[0],links[1]);metrics.sharedAsset=links[0];
    await execute("const data=new DataTransfer();data.items.add(new File([new Uint8Array(16*1024*1024)],'取消附件一.bin'));data.items.add(new File(['second'],'取消附件二.txt'));document.querySelector('[data-editor-pane=\"left\"] [contenteditable=true]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));");
    await wait(()=>execute("return !!document.querySelector('[aria-label=\"文件传输进度\"]')"),"upload progress missing");await click('[aria-label="文件传输进度"] button');await wait(()=>execute("return !document.querySelector('[aria-label=\"文件传输进度\"]')"),"upload did not cancel",20000);await idle();assert.ok(!(await readFile(path.join(data,"折叠粘贴样本.md"),"utf8")).includes("取消附件"));
    const pending=await readdir(path.join(data,".uploads"));assert.equal(pending.length,0);
  });
  await check("4.3 attachment references, duplicate inspection and missing-link repair work",async()=>{
    await click('.sidebar-attachments');await wait(()=>execute("return [...document.querySelectorAll('[aria-label=\"附件管理\"] button')].some(el=>el.textContent.startsWith('重复 ')&&!el.disabled)"),"attachment inspection unfinished",20000);
    await execute("[...document.querySelectorAll('[aria-label=\"附件管理\"] button')].find(el=>el.textContent.startsWith('重复 ')).click()");await wait(()=>execute("return document.querySelector('.attachment-list')?.innerText.includes('旧重复一.txt')"),"duplicate assets not recognized");
    await execute("[...document.querySelectorAll('[aria-label=\"附件管理\"] button')].find(el=>el.textContent.startsWith('缺失 ')).click()");await type('input[aria-label="替换附件：assets/missing-comfort.txt"]',metrics.sharedAsset);await clickText("应用所选路径修复","button");
    await wait(async()=>(await readFile(path.join(data,"附件修复样本.md"),"utf8")).includes(metrics.sharedAsset),"missing asset repair failed");assert.ok((await readFile(path.join(data,"附件修复样本.md"),"utf8")).includes('`[FILE:示例](assets/missing-comfort.txt)`'));await screenshot("attachment-manager");await click('button[aria-label="关闭附件管理"]');
  });
  await check("4.3 streaming package cancellation preserves an existing destination",async()=>{
    await writeFile(path.join(data,"assets","cancel-export.bin"),randomBytes(24*1024*1024));const dest=path.join(qa,"cancel-export.zip");await writeFile(dest,"original destination");
    const result=await call("POST","/execute/async",{script:"const done=arguments[arguments.length-1],id=crypto.randomUUID();let cancelled=false;const cb=window.__TAURI_INTERNALS__.transformCallback(raw=>{if(raw.message?.completed&&!cancelled){cancelled=true;window.__TAURI_INTERNALS__.invoke('cancel_job',{id});}});window.__TAURI_INTERNALS__.invoke('export_note_package',{destination:arguments[0],name:'取消验收',source:'# test',assets:['assets/cancel-export.bin'],jobId:id,onProgress:'__CHANNEL__:'+cb}).then(()=>done({ok:true})).catch(error=>done({cancelled:String(error)}));",args:[dest]});assert.match(result.cancelled,/取消/);assert.equal(await readFile(dest,"utf8"),"original destination");
  });
  await check("4.3 quick capture has its own small window and appends to daily notes",async()=>{
    const main=await call("GET","/window"),before=await call("GET","/window/handles");await click('button[title="快速记录 (Ctrl+Shift+N，全局 Ctrl+Alt+N)"]');
    const handles=await wait(async()=>{const h=await call("GET","/window/handles");return h.length>before.length?h:null;},"quick capture window did not open",20000);const other=handles.find(h=>!before.includes(h));await call("POST","/window",{handle:other});
    await wait(()=>execute("return !!document.querySelector('textarea[aria-label=\"快速记录正文\"]')"),"quick capture form missing");assert.equal(await execute("return !!document.querySelector('.bn-editor')"),false);
    await select("快速记录保存位置","daily");await type('input[aria-label="快速记录标题"]',"快速窗口验收");await type('textarea[aria-label="快速记录正文"]',"记录正文自动附带时间");await type('input[aria-label="资料来源链接"]',"https://example.com/source");await clickText("保存记录","button");await wait(()=>execute("return document.body.innerText.includes('已保存到')"),"capture did not save");await screenshot("quick-capture");await clickText("在笔记中查看","button");await call("POST","/window",{handle:main});
    await wait(()=>execute("return document.querySelector('[data-editor-pane=\"left\"]')?.innerText.includes('记录正文自动附带时间')"),"capture did not navigate to the main note",20000);await idle();
    const day=new Date().toLocaleDateString('sv-SE');const daily=await readFile(path.join(data,"日记",day+".md"),"utf8");assert.ok(daily.includes("https://example.com/source"));assert.ok(daily.includes("快速窗口验收"));metrics.globalCaptureHotkey=await invoke("capture_hotkey_status");
  });
  await check("4.3 large trees render only visible rows and performance measurements are recorded",async()=>{
    const dir=path.join(data,"性能样本");await mkdir(dir,{recursive:true});await Promise.all(Array.from({length:1000},(_,i)=>writeFile(path.join(dir,"性能笔记"+String(i).padStart(4,"0")+".md"),"# 性能笔记"+i+"\n\n正文\n")));
    await execute("window.dispatchEvent(new Event('focus'))");await type('input[placeholder*="Ctrl+K"]',"性能样本");
    await wait(()=>execute("return document.querySelector('.virtual-file-tree>div')?.style.height==='32032px'"),"large tree not loaded",20000);
    metrics.visibleTreeRows=await execute("return document.querySelectorAll('.file-tree-row').length");assert.ok(metrics.visibleTreeRows<50);
    await execute("const input=document.querySelector('input[placeholder*=\"Ctrl+K\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));");
    await open("折叠粘贴样本");await caretAtParagraphEnd("left");const started=performance.now();await type('[data-editor-pane="left"] [contenteditable="true"]',"性能输入验收");await wait(()=>execute("return document.querySelector('[data-editor-pane=\"left\"]').innerText.includes('性能输入验收')"),"input did not appear");metrics.inputDriverRoundTripMs=performance.now()-started;metrics.readyMs=await execute("return performance.getEntriesByName('no1-ready')[0]?.startTime");metrics.jsHeapBytes=await execute("return performance.memory?.usedJSHeapSize||null");await click('button[title="保存两栏 (Ctrl+S)"]');await idle();
    await writeFile(path.join(qa,"performance-4.3.json"),JSON.stringify(metrics,null,2));
  });
  await open("验收笔记A");
}
