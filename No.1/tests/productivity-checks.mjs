import assert from "node:assert/strict";
import {readFile,writeFile,mkdir,readdir} from "node:fs/promises";
import path from "node:path";

// Runs in the existing isolated native application, never against a user's library.
export async function productivityChecks(c) {
  const {check,click,clickText,type,execute,wait,idle,menu,caretAtParagraphEnd,screenshot,data,qa,call}=c;
  const invoke=async(name,args={})=>{
    const result=await call("POST","/execute/async",{script:"const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({value})).catch(error=>done({error:String(error)}));",args:[name,args]});
    if(result.error)throw new Error(result.error);return result.value;
  };
  const select=async(label,value)=>execute("const el=document.querySelector('select[aria-label=\"'+arguments[0]+'\"]');if(!el)throw Error('missing select '+arguments[0]);el.value=arguments[1];el.dispatchEvent(new Event('change',{bubbles:true}));",label,value);
  const open=async name=>{await clickText(name,"span");await idle();};
  await check("4.2 properties preserve custom fields and update the live document",async()=>{
    await open("功能主笔记");await menu("笔记属性与标签");
    await type('input[aria-label="类型"]',"论文");await type('input[aria-label="状态"]',"未读");await type('input[aria-label="笔记标签"]',"光学, 方法");
    await clickText("保存属性","button");await wait(()=>execute("return !document.querySelector('[aria-label=\"笔记属性\"]')"),"properties did not save");await idle();
    const text=await readFile(path.join(data,"功能主笔记.md"),"utf8");assert.ok(text.includes("custom: 保留字段"));assert.ok(text.includes("未读"));assert.ok(text.includes("光学"));assert.ok(text.includes("原始正文"));
    assert.ok(await execute("return !!document.querySelector('[data-content-type=\"noteProperties\"]')"));
  });
  await check("4.2 quick search ranks titles and collections persist filters",async()=>{
    await click('button[title="快速打开与搜索 (Ctrl+P)"]');
    await type('input[aria-label="快速搜索关键词"]',"功能主笔记");
    await wait(()=>execute("return document.querySelector('.knowledge-entry strong')?.textContent==='功能主笔记'"),"title result missing");
    await type('input[aria-label="筛选标签"]',"光学");
    await execute("document.querySelector('[aria-label=\"快速打开与搜索\"] details').open=true");await type('input[aria-label="集合名称"]',"待读光学");await clickText("保存当前筛选","button");
    await clickText("表格","button");assert.ok(await execute("return !!document.querySelector('.knowledge-entry.table')"));await screenshot("knowledge-search");
    await click('button[aria-label="关闭快速打开与搜索"]');await wait(async()=>JSON.parse(await readFile(path.join(data,".workspace.json"),"utf8")).collections.some(c=>c.name==="待读光学"),"collection not saved");
    await clickText("智能集合","button");await select("选择智能集合",await execute("return [...document.querySelectorAll('select[aria-label=\"选择智能集合\"] option')].find(o=>o.textContent==='待读光学').value"));
    assert.equal(await execute("return document.querySelector('input[aria-label=\"筛选标签\"]').value"),"光学");await click('button[aria-label="关闭智能集合"]');
  });
  await check("4.2 backlinks navigate to the referencing paragraph",async()=>{
    await menu("笔记关联");await wait(()=>execute("return [...document.querySelectorAll('.knowledge-row strong')].some(el=>el.textContent==='关联来源')"),"backlink missing");
    await clickText("关联来源","strong");await idle();assert.ok(await execute("return document.querySelector('.note-tab[aria-selected=\"true\"]').textContent.includes('关联来源')"));
    await open("功能主笔记");
  });
  await check("4.2 link picker inserts navigable wiki links and heading references",async()=>{
    await caretAtParagraphEnd("left");await menu("插入笔记链接");await type('input[aria-label="快速搜索关键词"]',"关联目标");
    await wait(()=>execute("return !!document.querySelector('select[aria-label=\"关联目标的标题引用\"]')"),"heading choices missing");await select("关联目标的标题引用","具体方法");
    await wait(()=>execute("return !document.querySelector('[aria-label=\"插入笔记链接\"]')"),"link insertion did not finish");await click('button[title="保存两栏 (Ctrl+S)"]');await idle();
    assert.ok((await readFile(path.join(data,"功能主笔记.md"),"utf8")).includes("[[关联目标#具体方法|具体方法]]"));
    assert.ok((await readFile(path.join(data,"功能主笔记.md"),"utf8")).includes("# 功能主笔记\n"),"link insertion unexpectedly changed the heading");
    await click('a.note-link[title="关联目标#具体方法"]');await wait(()=>execute("return document.querySelector('.note-tab[aria-selected=\"true\"]')?.textContent.includes('关联目标')"),"link did not navigate");await idle();
    await click('button[aria-label="后退"]');await wait(()=>execute("return document.querySelector('.note-tab[aria-selected=\"true\"]')?.textContent.includes('功能主笔记')"),"back navigation did not restore the previous note");await idle();
  });
  await check("4.2 typing wiki brackets provides real editor suggestions",async()=>{
    await caretAtParagraphEnd("left");await type('[data-editor-pane="left"] [contenteditable="true"]'," [[关联目标");
    await wait(()=>execute("return [...document.querySelectorAll('[role=\"option\"],.bn-suggestion-menu-item')].some(el=>el.innerText.includes('关联目标'))"),"wiki suggestion menu did not open");
    await type('[data-editor-pane="left"] [contenteditable="true"]',"\uE007");await click('button[title="保存两栏 (Ctrl+S)"]');await idle();
    assert.ok((await readFile(path.join(data,"功能主笔记.md"),"utf8")).includes("[[关联目标"));
  });
  await check("4.2 templates create typed notes and save reusable fragments",async()=>{
    await menu("模板与内容片段");await type('input[aria-label="模板新笔记名称"]',"模板创建验收");await clickText("从模板新建笔记","button");await idle();
    await wait(async()=>{try{return (await readFile(path.join(data,"模板创建验收.md"),"utf8")).includes("研究问题");}catch{return false;}},"template note missing");
    const text=await readFile(path.join(data,"模板创建验收.md"),"utf8");assert.ok(text.includes("未读"));assert.ok(!text.includes("{{date}}"));
    await menu("模板与内容片段");await select("选择模板","builtin-check");await clickText("插入这个片段","button");await idle();
    await click('button[title="保存两栏 (Ctrl+S)"]');await idle();assert.ok((await readFile(path.join(data,"模板创建验收.md"),"utf8")).includes("检查清单"));
    await menu("模板与内容片段");await type('input[aria-label="保存模板名称"]',"我的实验片段");await clickText("将所选内容存为片段","button");
    await wait(async()=>JSON.parse(await readFile(path.join(data,".templates.json"),"utf8")).some(t=>t.name==="我的实验片段"&&t.kind==="snippet"),"custom fragment missing");
    await screenshot("templates");await click('button[aria-label="关闭模板与内容片段"]');await open("功能主笔记");
  });
  await check("4.2 renaming a note maintains backlinks and preserves source literals",async()=>{
    await open("关联目标");
    await execute("const row=[...document.querySelectorAll('.file-tree-row')].find(el=>el.dataset.treePath==='关联目标');row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:150,clientY:300}));");
    await clickText("✏️ 重命名");
    const input=await c.find("//h3[normalize-space(text())='重命名']/following-sibling::input","xpath");
    await call("POST","/element/"+input+"/value",{text:"\uE009a\uE000关联目标新名",value:[..."\uE009a\uE000关联目标新名"]});await clickText("确定","button");await idle();
    await wait(async()=>{try{await readFile(path.join(data,"关联目标新名.md"));return true;}catch{return false;}},"renamed note missing");
    const ref=await readFile(path.join(data,"功能主笔记.md"),"utf8");assert.ok(ref.includes("[[关联目标新名#具体方法|具体方法]]"));
    assert.ok((await readFile(path.join(data,"关联来源.md"),"utf8")).includes("`[[关联目标]]`"));await open("功能主笔记");
  });
  await check("4.2 autosave persists idle edits and clearly marks saved state",async()=>{
    await click('button[title="设置"]');await select("自动保存间隔","5");await clickText("完成","button");
    await caretAtParagraphEnd("left");await type('[data-editor-pane="left"] [contenteditable="true"]',"自动保存新正文");
    await wait(async()=>(await readFile(path.join(data,"功能主笔记.md"),"utf8")).includes("自动保存新正文"),"autosave did not persist",13000);
    assert.ok(await execute("return !document.querySelector('.note-tab[aria-selected=\"true\"] [style*=\"faad14\"]')"));
    await click('button[title="设置"]');await select("自动保存间隔","0");await clickText("完成","button");
  });
  await check("4.2 clean external changes refresh and dirty external changes retain edits",async()=>{
    const p=path.join(data,"功能主笔记.md"),saved=await readFile(p,"utf8");await writeFile(p,saved+"\n外部刷新验收\n");
    await wait(()=>execute("return document.querySelector('[data-editor-pane=\"left\"]').innerText.includes('外部刷新验收')"),"clean disk change not refreshed",11000);
    await caretAtParagraphEnd("left");await type('[data-editor-pane="left"] [contenteditable="true"]',"窗口独立修改");await writeFile(p,saved+"\n另一份磁盘修改\n");
    await wait(()=>execute("return document.querySelector('.external-change')?.innerText.includes('磁盘内容已被外部修改')"),"dirty external notice missing",11000);
    assert.ok(await execute("return document.querySelector('[data-editor-pane=\"left\"]').innerText.includes('窗口独立修改')"));await clickText("比较并处理","button");await clickText("采用磁盘版本","button");await idle();
    await wait(()=>execute("return !document.querySelector('[aria-label=\"处理外部修改\"]')&&!document.querySelector('.external-change')"),"conflict banner did not clear");
  });
  await check("4.2 native catalog reuses cached reads",async()=>{
    const first=await invoke("catalog_delta",{known:{},force:true});const known=Object.fromEntries(first.notes.map(n=>[n.path,n.stamp]));
    const second=await invoke("catalog_delta",{known,force:false});assert.equal(second.reread,0);assert.equal(second.notes.length,0);assert.equal(second.removed.length,0);
  });
  await check("4.2 complete backups verify and restore independently",async()=>{
    const dest=path.join(qa,"full-backups");await mkdir(dest,{recursive:true});
    await clickText("笔记库与备份","button");await wait(()=>execute("return document.querySelector('input[aria-label=\"当前笔记库\"]')?.value.includes('data')"),"library manager did not load");await click('button[aria-label="关闭笔记库与备份"]');
    const backup=await invoke("backup_library",{destination:dest});assert.ok(backup.files>5);
    const inspect=await invoke("inspect_library_backup",{path:backup.path});assert.equal(inspect.files,backup.files);
    const restored=await invoke("restore_library_backup",{source:backup.path,destination:dest});
    assert.equal(await readFile(path.join(restored.path,"功能主笔记.md"),"utf8"),await readFile(path.join(data,"功能主笔记.md"),"utf8"));assert.ok((await readdir(restored.path)).includes("assets"));assert.ok((await readdir(restored.path)).includes(".templates.json"));
    await writeFile(path.join(backup.path,"功能主笔记.md"),"corrupted test backup");await assert.rejects(()=>invoke("inspect_library_backup",{path:backup.path}),/校验失败/);
    await assert.rejects(()=>invoke("backup_library",{destination:data}),/源文件夹/);
  });
  await open("验收笔记A");
}

export async function librarySwitchingChecks({check,execute,wait,clickText,click,idle,call,qa,screenshot}) {
  const invoke=async(name,args={})=>{
    const result=await call("POST","/execute/async",{script:"const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({value})).catch(error=>done({error:String(error)}));",args:[name,args]});
    if(result.error)throw new Error(result.error);return result.value;
  };
  await check("4.2 library switching isolates settings and recent-library UI restores the original",async()=>{
    const previous=await invoke("get_library_root"),other=path.join(qa,"independent-library");await mkdir(other,{recursive:true});
    await writeFile(path.join(other,"独立笔记.md"),"# 独立笔记\n\n另一个笔记库的正文\n");
    await writeFile(path.join(other,".workspace.json"),JSON.stringify({autosaveSeconds:15,tabs:["独立笔记"],activePath:"独立笔记",reading:{fontSize:20}}));
    await invoke("switch_library",{path:other});await execute("window.location.reload()");
    await wait(()=>execute("return document.querySelector('[data-editor-pane=\"left\"]')?.innerText.includes('另一个笔记库的正文')"),"second library did not restore its document",20000);await idle();
    assert.equal(await execute("return getComputedStyle(document.querySelector('.bn-editor')).fontSize"),"20px");
    await clickText("笔记库与备份","button");await wait(()=>execute("return !!document.querySelector('select[aria-label=\"最近使用的笔记库\"]')"),"recent libraries missing");
    await execute("const el=document.querySelector('select[aria-label=\"最近使用的笔记库\"]');el.value=arguments[0];el.dispatchEvent(new Event('change',{bubbles:true}));",previous);
    await wait(()=>execute("return document.querySelector('.library-location')?.title===arguments[0]",previous),"return to previous library failed",20000);
    if(await execute("return !!document.querySelector('[aria-label=\"恢复未保存草稿\"]')"))await click('button[aria-label="关闭恢复未保存草稿"]');
    await wait(()=>execute("return document.querySelector('[data-editor-pane=\"left\"]')?.innerText.includes('验收笔记A')"),"previous library lost its workspace",20000);
    assert.equal(await execute("return getComputedStyle(document.querySelector('.bn-editor')).fontSize"),"18px");
    assert.ok((await invoke("get_library_root")).includes("relocated"));
    const secondary=JSON.parse(await readFile(path.join(other,".workspace.json"),"utf8"));assert.equal(secondary.autosaveSeconds,15);
    await screenshot("library-switching");
  });
}
