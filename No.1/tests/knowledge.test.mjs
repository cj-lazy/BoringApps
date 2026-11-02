import test from "node:test";
import assert from "node:assert/strict";
import { readProperties, writeProperties } from "../src/utils/noteProperties.ts";
import { indexNote, filteredNotes, emptyFilter, resolveNoteLink, relativeNoteUrl, planLinkRename } from "../src/utils/knowledge.ts";
import { expandTemplate } from "../src/utils/templates.ts";
import { parseWorkspace } from "../src/utils/workspace.ts";
const note = (path, source, modified_ms=Date.now()) => indexNote({path, source, modified_ms, stamp:"test"});

test("properties preserve custom YAML, comments, BOM, CRLF and exact body",()=>{
  const source="\uFEFF---\r\n# keep this comment\r\ntype: 论文\r\ntags:\r\n  - 光学\r\ncustom:\r\n  nested: [1, 2]\r\n---\r\n\r\n# 标题\r\n\r\n$$\r\na_b\r\n$$\r\n";
  const read=readProperties(source);assert.equal(read.error,undefined);assert.deepEqual(read.properties.tags,["光学"]);
  assert.equal(writeProperties(source,read.properties),source);
  const changed=writeProperties(source,{...read.properties,status:"已读",tags:["光学","方法"]});
  assert.ok(changed.startsWith("\uFEFF---\r\n"));assert.ok(changed.includes("# keep this comment"));assert.ok(changed.includes("nested: [ 1, 2 ]")||changed.includes("nested: [1, 2]"));assert.ok(changed.endsWith(source.slice(source.indexOf("# 标题"))));
  assert.equal(readProperties(changed).properties.status,"已读");
});
test("malformed or duplicate YAML refuses an edit without flattening content",()=>{
  const source="---\ntags: [one\n---\n\nbody";assert.ok(readProperties(source).error);assert.throws(()=>writeProperties(source,{...readProperties(source).properties,title:"bad"}));
  assert.ok(readProperties("---\ntype: a\ntype: b\n---\n").error);
});
test("new properties keep Markdown body and round trip date-like values",()=>{
  const source="# 原文\n\n`literal`\n";const value={...readProperties(source).properties,created:"2026-11-02",title:"A: B",tags:["光学","材料"]};
  const next=writeProperties(source,value);assert.ok(next.endsWith(source));assert.deepEqual(readProperties(next).properties,value);
});
test("index ignores example links in code, YAML, HTML and formula source",async()=>{
  const source="---\nsource: '[[not-a-link]]'\n---\n\n# 标题\n\n[[目标#方法|查看方法]] 与 [标准](../目标.md#结果)\n\n`[[代码]]`\n\n```md\n[[围栏]]\n```\n\n<div>[[HTML]]</div>\n\n$[[公式]]$\n\n\\([[括号公式]]\\)\n";
  const n=await note("项目/记录",source);assert.equal(n.title,"标题");assert.deepEqual(n.links.map(l=>l.target),["目标#方法","../目标.md#结果"]);assert.equal(n.headings[0].line,5);
});
test("relative links and aliases resolve with safe paths and ambiguous names remain unresolved",async()=>{
  const notes=[await note("项目/记录","# 记录"),await note("目标","# 目标"),await note("甲/同名","# 同名"),await note("乙/同名","# 同名")];
  assert.deepEqual(resolveNoteLink("../%E7%9B%AE%E6%A0%87.md#方法","项目/记录",notes),{path:"目标",heading:"方法"});
  assert.equal(resolveNoteLink("同名","项目/记录",notes,true),null);
  assert.equal(resolveNoteLink("../../../目标.md","项目/记录",notes),null);
  assert.equal(resolveNoteLink("https://example.com/目标.md","项目/记录",notes),null);
  assert.equal(relativeNoteUrl("项目/记录","目标","方法"),"../%E7%9B%AE%E6%A0%87.md#%E6%96%B9%E6%B3%95");
});
test("rename plans update backlinks and outgoing relative links without changing literals",async()=>{
  const a=await note("目录/原名","# 原名\n\n[引用](../目标.md)\n\n`[[目录/原名]]`\n"),b=await note("记录","[[目录/原名#方法|方法]]\n\n[普通](目录/原名.md)\n"),c=await note("目标","# 目标");
  const changes=planLinkRename([a,b,c],"目录/原名","新目录/子目录/新名",false);
  assert.equal(changes.length,2);
  assert.ok(changes.find(x=>x.path==="记录").after.includes("[[新目录/子目录/新名#方法|方法]]"));
  assert.ok(changes.find(x=>x.path==="目录/原名").after.includes("../../%E7%9B%AE%E6%A0%87.md"));
  assert.ok(changes.find(x=>x.path==="目录/原名").after.includes("`[[目录/原名]]`"));
});
test("rename maintains reference-style Markdown definitions",async()=>{
  const n=await note("引用","[说明][id]\n\n[id]: 目标.md \"标题\"\n");const target=await note("目标","# 目标");
  const changes=planLinkRename([n,target],"目标","新目标",false);assert.equal(changes.length,1);assert.ok(changes[0].after.includes("[id]: %E6%96%B0%E7%9B%AE%E6%A0%87.md"));
});
test("renaming edits a destination rather than identical text in a link title",async()=>{
  const n=await note("引用",'[目标](目标.md "目标.md")\n\n[括号](目标\\(1\\).md)\n');
  const target=await note("目标","# 目标"),bracket=await note("目标(1)","# 括号");
  const changes=planLinkRename([n,target,bracket],"目标","新目标",false);assert.ok(changes[0].after.includes('"目标.md"'));
  assert.ok(changes[0].after.includes('](%E6%96%B0%E7%9B%AE%E6%A0%87.md'));
  const other=planLinkRename([n,target,bracket],"目标(1)","新括号",false);assert.equal(other.length,1);assert.ok(!other[0].after.includes("目标\\(1\\).md"));
});
test("filtered collections rank titles, respect exact tags and date bounds",async()=>{
  const a=await note("a","---\ntype: 论文\nstatus: 未读\ntags: [光学]\n---\n\n# 光谱\n",new Date("2026-11-02T12:00:00").getTime());
  const b=await note("b","# 其他\n\n光谱正文",a.modified_ms+1);
  assert.equal(filteredNotes([b,a],{...emptyFilter(),query:"光谱"})[0].path,"a");
  assert.deepEqual(filteredNotes([b,a],{...emptyFilter(),tag:"光学",type:"论文",status:"未读",after:"2026-11-02",before:"2026-11-02"}).map(n=>n.path),["a"]);
  assert.equal(filteredNotes([a],{...emptyFilter(),tag:"光"}).length,0);
});
test("workspace validates portable collections, recents and autosave preferences",()=>{
  const ws=parseWorkspace({autosaveSeconds:15,recent:["a","../escape","a"],collections:[{id:"c",name:"未读",filter:{status:"未读",query:123}}]});
  assert.equal(ws.autosaveSeconds,15);assert.deepEqual(ws.recent,["a"]);assert.equal(ws.collections[0].filter.status,"未读");assert.equal(ws.collections[0].filter.query,"");assert.equal(parseWorkspace({}).autosaveSeconds,5);
});
test("templates substitute only supported variables and keep formulas intact",()=>{
  const result=expandTemplate("# {{title}}\n{{date}}\n$$\\frac{{a}}{{b}}$$\n{{unknown}}","实验",new Date(2026,10,2,9,30));
  assert.ok(result.includes("2026-11-02"));assert.ok(result.includes("\\frac{{a}}{{b}}"));assert.ok(result.endsWith("{{unknown}}"));
});
