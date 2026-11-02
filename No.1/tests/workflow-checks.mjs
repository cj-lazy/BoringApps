import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
export async function workflowChecks({check,click,clickText,type,execute,wait,idle,menu,caretAtParagraphEnd,screenshot,data}){
for(const name of ["工作流替换甲","工作流替换乙"])await writeFile(path.join(data,name+".md"),"---\ntags: [工作流替换词]\n---\n\n正文工作流替换词 [[工作流替换词#标题|工作流替换词别名]] `工作流替换词` $工作流替换词$\n");
await writeFile(path.join(data,"工作流任务.md"),"---\ntags: [工作流]\n---\n\n# 工作流任务\n\n- [ ] 工作流待办\n  - [x] 工作流已完成\n");
await writeFile(path.join(data,"工作流复杂内容.md"),"# 工作流复杂内容\n\n- 父列表\n  - 嵌套列表\n\n  列表第二段\n\n> 引用首段\n>\n> 引用第二段\n\n正文脚注[^a]\n\n[^a]: 脚注可视内容\n");
await writeFile(path.join(data,"工作流引用目的.md"),"# 工作流引用目的\n\n插入引用的位置\n");
await writeFile(path.join(data,"工作流引用来源.md"),"# 来源原标题\n\n引用正文第一版\n");
  await execute("window.dispatchEvent(new Event('focus'))");
  const open=async name=>{await clickText(name,"span");await idle();};
  const select=(label,value)=>execute("const el=document.querySelector('select[aria-label=\"'+arguments[0]+'\"]');el.value=arguments[1];el.dispatchEvent(new Event('change',{bubbles:true}));",label,value);
  await check("4.4 batch replacement protects properties, destinations, code and math",async()=>{
    await menu("Markdown 源码");await menu("块编辑视图");
    await click('button[title="全局搜索替换 (Ctrl+Shift+F)"]');await type('input[aria-label="全局搜索关键词"]',"工作流替换词");await type('#replacement',"替换完成");await clickText("预览全库替换","button");
    await wait(()=>execute("return document.querySelector('.batch-replacement')?.innerText.includes('共 2 篇')"),"batch replacement preview missing",30000);await screenshot("batch-replace");await clickText("确认替换所选 2 篇笔记","button");
    await wait(async()=>(await readFile(path.join(data,"工作流替换甲.md"),"utf8")).includes("正文替换完成"),"batch replacement not applied");
    const source=await readFile(path.join(data,"工作流替换甲.md"),"utf8");assert.ok(source.includes('tags: [工作流替换词]'));assert.ok(source.includes('[[工作流替换词#标题|替换完成别名]]'));assert.ok(source.includes('`工作流替换词`'));assert.ok(source.includes('$工作流替换词$'));await click('button[aria-label="关闭全局搜索与替换"]');
  });
  await check("4.4 command palette custom shortcut and toolbar settings persist",async()=>{
    await click('button[aria-label="命令面板"]');await type('input[aria-label="搜索命令"]',"快捷键与工具栏");await execute("document.querySelector('input[aria-label=\"搜索命令\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));");await wait(()=>execute("return !!document.querySelector('[aria-label=\"快捷键与工具栏\"]')"),"command settings did not open");
    await execute("document.querySelector('input[aria-label=\"任务汇总快捷键\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'t',ctrlKey:true,altKey:true,bubbles:true,cancelable:true}));");await click('input[aria-label="工具栏显示任务汇总"]');await screenshot("command-settings");await clickText("完成","button");
    await wait(async()=>{const workspace=JSON.parse(await readFile(path.join(data,".workspace.json"),"utf8"));return workspace.commands?.bindings?.tasks==="Ctrl+Alt+T"&&workspace.commands.toolbar.includes("tasks");},"command preferences not persisted");
    await execute("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'t',ctrlKey:true,altKey:true,bubbles:true,cancelable:true}));");await wait(()=>execute("return !!document.querySelector('[aria-label=\"任务汇总\"]')"),"custom task shortcut failed");await click('button[aria-label="关闭任务汇总"]');
  });
  await check("4.4 aggregated tasks filter and toggle the exact original checkbox",async()=>{
    await click('button[title="任务汇总"]');await type('input[aria-label="筛选任务或笔记"]',"工作流待办");await wait(()=>execute("return document.querySelector('.task-list')?.innerText.includes('工作流待办')"),"tasks missing");await select("任务标签","工作流");await click('input[aria-label="完成任务：工作流待办"]');
    await wait(async()=>(await readFile(path.join(data,"工作流任务.md"),"utf8")).includes('- [x] 工作流待办'),"task toggle not written");await select("任务完成状态","done");await wait(()=>execute("return document.querySelector('.task-list')?.innerText.includes('工作流待办')"),"done filter failed");await screenshot("tasks");await click('button[aria-label="关闭任务汇总"]');
    await menu("快捷键与工具栏");await clickText("恢复默认快捷键和工具栏","button");await clickText("完成","button");
  });
  await check("4.4 nested content and footnotes are visually editable and survive reopen",async()=>{
    await open("工作流复杂内容");assert.equal(await execute("return document.querySelectorAll('[data-editor-pane=\"left\"] [data-content-type=\"rawMarkdown\"]').length"),0);
    await execute("const el=document.querySelector('.footnote-block>div');el.closest('[contenteditable=\"true\"]').focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);");await type('[data-editor-pane="left"] [contenteditable="true"]',"桌面脚注修改");await click('button[title="保存两栏 (Ctrl+S)"]');await idle();
    assert.ok((await readFile(path.join(data,"工作流复杂内容.md"),"utf8")).includes("桌面脚注修改"));await open("工作流任务");await open("工作流复杂内容");assert.ok(await execute("return document.querySelector('.footnote-block')?.innerText.includes('桌面脚注修改')"));await screenshot("structured-editing");
  });
  await check("4.4 live stable section references survive renamed headings and refresh content",async()=>{
    await open("工作流引用目的");await caretAtParagraphEnd("left");await menu("插入段落引用");await wait(()=>execute("return [...document.querySelectorAll('select[aria-label=\"引用来源笔记\"] option')].some(o=>o.value==='工作流引用来源')"),"reference catalog not ready",30000);await select("引用来源笔记","工作流引用来源");await wait(()=>execute("return document.querySelector('.reference-targets')?.innerText.includes('来源原标题')"),"reference targets missing");await click('.reference-targets input[type="radio"]');await clickText("插入所选引用","button");
    await wait(()=>execute("return document.querySelector('.note-reference')?.innerText.includes('引用正文第一版')"),"live reference did not render");
    const sourceFile=path.join(data,"工作流引用来源.md"),before=await readFile(sourceFile,"utf8");assert.match(before,/<!-- no1:anchor:ref-/);await writeFile(sourceFile,before.replace('来源原标题','来源新标题').replace('引用正文第一版','引用正文第二版'));
    await execute("window.dispatchEvent(new Event('focus'))");await wait(()=>execute("return document.querySelector('.note-reference')?.innerText.includes('引用正文第二版')"),"live reference did not refresh",20000);await screenshot("live-reference");await click('.note-reference button');await wait(()=>execute("return document.querySelector('[data-editor-pane=\"left\"]')?.dataset.notePath==='工作流引用来源'"),"stable reference jump failed");
  });
  await check("4.4 Word research template controls persist and can be reset",async()=>{
    await menu("Word 排版模板");await clickText("学术报告","button");assert.equal(await execute("return document.querySelector('select[aria-label=\"Word 纸张\"]').value"),"A4");assert.equal(await execute("return document.querySelector('input[aria-label=\"西文字体\"]').value"),"Times New Roman");await screenshot("word-layout");await clickText("完成","button");
    await wait(async()=>JSON.parse(await readFile(path.join(data,".workspace.json"),"utf8")).wordLayout?.paper==="A4","Word layout not persisted");await menu("Word 排版模板");await clickText("标准笔记","button");await clickText("完成","button");
  });
  await open("验收笔记A");
}
