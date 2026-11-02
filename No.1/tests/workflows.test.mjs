import test from "node:test";
import assert from "node:assert/strict";
import {planReplacement} from "../src/utils/searchReplace.ts";
import {indexNote,planLinkRename} from "../src/utils/knowledge.ts";
import {noteTasks,toggleTask} from "../src/utils/noteTasks.ts";
import {referenceTargets,referenceExcerpt,planReference} from "../src/utils/noteReferences.ts";
import {parseWorkspace} from "../src/utils/workspace.ts";
import {bindingError,eventChord,bindingFor,commandForChord,parseCommandPreferences} from "../src/utils/commands.ts";
const note=(path,source)=>indexNote({path,source,stamp:"",modified_ms:0});
test("safe replace separates YAML, wiki destinations, aliases, math and Markdown URLs",async()=>{
  const source='---\r\ntags: [激光]\r\n---\r\n正文激光 [[激光#激光|激光别名]] ![[激光#激光|激光展示]] [激光](激光.md "激光标题") `激光` $激光$\r\n<!-- no1:anchor:激光 -->';
  const result=await planReplacement(source,"激光","光学");
  assert.equal(result.changes.length,5);assert.ok(result.content.includes('tags: [激光]'));assert.ok(result.content.includes('[[激光#激光|光学别名]]'));assert.ok(result.content.includes('![[激光#激光|光学展示]]'));assert.ok(result.content.includes('[光学](激光.md "光学标题")'));assert.ok(result.content.includes('`激光` $激光$'));
  const all=await planReplacement(source,"激光","光学",{code:true,math:true,links:true,properties:true});assert.ok(all.changes.length>result.changes.length);assert.ok(all.content.includes('tags: [光学]'));assert.ok(all.content.includes('[[光学#光学|光学别名]]'));assert.ok(all.content.includes('no1:anchor:激光'));
});
test("escaped Markdown destinations and labels never confuse replacement ranges",async()=>{
  const source='[a](a "a") [a](<a> "a") [a](a\\(b\\))';const p=await planReplacement(source,"a","z");assert.equal(p.content,'[z](a "z") [z](<a> "z") [z](a\\(b\\))');
});
test("task toggle preserves CRLF, nested markers and unrelated original text",async()=>{
  const source='---\r\ntags: [科研]\r\n---\r\n- [ ] 父任务\r\n  - [X] **子任务**\r\n\r\n`- [ ] 伪任务`\r\n';const tasks=await noteTasks([await note("任务",source)]);assert.equal(tasks.length,2);assert.deepEqual(tasks[0].tags,["科研"]);assert.equal(tasks[1].checked,true);assert.equal(toggleTask(tasks[0]).after,source.replace('[ ] 父任务','[x] 父任务'));assert.equal(toggleTask(tasks[1]).after,source.replace('[X] **子任务**','[ ] **子任务**'));
});
test("stable references survive heading edits and moved source notes",async()=>{
  const source='# 原标题\n\n内容甲\n\n## 子节\n\n内容乙\n\n# 下一章\n尾部';const target=(await referenceTargets(source))[0];const changes=planReference({path:"目的",source:"正文",offset:2},{path:"来源",source},target,true);const id=/no1:anchor:([^ ]+)/.exec(changes[0].after)[1];assert.ok(changes[1].after.includes('![[来源#^'+id+'|原标题]]'));
  const renamed=changes[0].after.replace('# 原标题','# 新标题');const excerpt=await referenceExcerpt(renamed,'^'+id);assert.ok(excerpt.source.includes('内容乙'));assert.ok(!excerpt.source.includes('下一章'));
  const indexed=await Promise.all([note("来源",renamed),note("目的",changes[1].after)]);const moved=planLinkRename(indexed,"来源","资料/来源",false);assert.ok(moved.find(c=>c.path==="目的").after.includes('![[资料/来源#^'+id));
});
test("same-note reference insertion and stable marker share one expected-source change",async()=>{
  const source='段落一\n\n段落二',targets=await referenceTargets(source);const changes=planReference({path:"同篇",source,offset:source.length},{path:"同篇",source},targets[0],false);assert.equal(changes.length,1);assert.equal(changes[0].before,source);assert.ok(changes[0].after.startsWith('<!-- no1:anchor:'));assert.ok(changes[0].after.includes('段落一\n\n段落二\n\n[[同篇#^'));
});
test("custom bindings detect conflicts, persist unbinding and validate toolbar settings",()=>{
  const defaults=parseCommandPreferences(null);assert.equal(commandForChord(eventChord({key:"Control",ctrlKey:true}),defaults),undefined);assert.equal(commandForChord("Ctrl+F",defaults),"find");assert.equal(commandForChord("T",defaults),undefined);
  const p=parseCommandPreferences({bindings:{save:"Ctrl+Alt+S",quick:""},toolbar:["tasks","bad","tasks","word"]});assert.equal(bindingFor("quick",p),"");assert.ok(bindingError("tasks","Ctrl+Alt+S",p));assert.ok(bindingError("save","Ctrl+V",p));assert.equal(eventChord({key:"s",ctrlKey:true,altKey:true,shiftKey:false,metaKey:false}),"Ctrl+Alt+S");assert.deepEqual(p.toolbar,["tasks","word"]);const w=parseWorkspace({commands:p,wordLayout:{paper:"A4",fontSize:12,lineHeight:1.5}});assert.deepEqual(w.commands,p);assert.equal(w.wordLayout.paper,"A4");
});
