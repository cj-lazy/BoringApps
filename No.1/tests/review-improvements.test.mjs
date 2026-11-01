import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { parseNote, serializeNote } from "../src/utils/markdownNote.ts";
import { replaceNoteDocument } from "../src/utils/installNote.ts";
import { configureAssetLinks, portableAssetPath, storedAssetUrl, resolveAssetUrl } from "../src/utils/assetLinks.ts";
import { portableMarkdown } from "../src/utils/markdownAssets.ts";
import { planReplacement } from "../src/utils/searchReplace.ts";
import { NoteSession } from "../src/utils/noteSession.ts";
import { parseWorkspace } from "../src/utils/workspace.ts";
import { previewText, runPreview } from "../src/utils/previewQueue.ts";
import { lineDiff } from "../src/utils/textDiff.ts";
import { pathToFileURL } from "node:url";
import path from "node:path";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

const dom=new JSDOM("<!doctype html><html><body></body></html>",{pretendToBeVisual:true});
for(const key of ["window","document","DOMParser","Element","HTMLElement","Node","DocumentFragment","NodeFilter"])
  globalThis[key]=key==="window"?dom.window:dom.window[key];
globalThis.getComputedStyle=dom.window.getComputedStyle;
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
await build({entryPoints:["src/blocks/schema.ts"],outdir:"artifacts/test-bundles",bundle:true,splitting:true,packages:"external",write:true,format:"esm",platform:"node",jsx:"automatic"});
const {schema}=await import(pathToFileURL(path.resolve("artifacts/test-bundles/schema.js")).href);
const {BlockNoteEditor}=await import("@blocknote/core");

for(const calloutType of ["info","warning","error","tip"]) test("real Callout retains editable body, title and type: "+calloutType,async()=>{
  const editor=BlockNoteEditor.create({schema,initialContent:[{type:"callout",props:{title:"中文标题 <safe>",calloutType},content:[{type:"text",text:"保留正文",styles:{bold:true}},{type:"inlineMath",props:{text:encodeURIComponent("a_b")}}]}]});
  const markdown=await serializeNote(editor,editor.document);
  assert.match(markdown,/保留正文/);assert.ok(!markdown.includes("info⚠"));
  const blocks=await parseNote(editor,markdown);assert.equal(blocks[0].type,"callout");assert.equal(blocks[0].props.calloutType,calloutType);assert.equal(blocks[0].props.title,"中文标题 <safe>");
  assert.ok(blocks[0].content.some(c=>c.type==="inlineMath"));
  replaceNoteDocument(editor,blocks);editor.updateBlock(editor.document[0],{content:"修改后的正文"});
  const reopened=await parseNote(editor,await serializeNote(editor,editor.document));assert.equal(reopened[0].content[0].text,"修改后的正文");
});
test("complex alert blocks remain source instead of dropping nested content",async()=>{
  const editor=BlockNoteEditor.create({schema});const source="> [!WARNING] 标题\n>\n> - 子项\n> - 另一项\n";
  const blocks=await parseNote(editor,source);assert.equal(blocks[0].type,"rawMarkdown");assert.equal(await serializeNote(editor,blocks),source);
});
test("Windows CRLF lists keep all items numbered without rewriting source",async()=>{
  const source=(await readFile(new URL("./fixtures/technical.md",import.meta.url),"utf8")).replace(/\r?\n/g,"\r\n");
  const editor=BlockNoteEditor.create({schema});
  replaceNoteDocument(editor,await parseNote(editor,source));
  const lists=editor.document.filter(block=>block.type==="numberedListItem");
  assert.equal(lists.length,7);assert.equal(lists[3].props.start,4);
  assert.equal(await serializeNote(editor,editor.document),source);
  editor.updateBlock(lists[3],{content:"修改第四步"});
  const saved=await serializeNote(editor,editor.document);
  assert.ok(saved.includes("4. 修改第四步\r\n"));
  assert.ok(saved.includes("$$\r\ns_i=\\exp(-c_i)\r\n$$"));
  assert.equal((await parseNote(editor,saved)).filter(block=>block.type==="numberedListItem").length,7);
});
test("all actual custom blocks retain their data through save and reopen",async()=>{
  const editor=BlockNoteEditor.create({schema,initialContent:[
    {type:"latex",props:{text:encodeURIComponent("x_i^2")}},
    {type:"codeBlock",props:{text:encodeURIComponent("    print('中文')\n"),language:"python",width:"100%",height:240}},
    {type:"mermaid",props:{code:"graph TD\nA-->B",width:500,height:200}},
    {type:"image",props:{url:"https://example.com/p.png",name:"图片",width:400}},
    {type:"file",props:{url:"https://example.com/f.txt",name:"文件.txt"}},
    {type:"rawMarkdown",props:{source:encodeURIComponent("<!-- 保留原文 -->")}},
  ]});
  const md=await serializeNote(editor,editor.document);const blocks=await parseNote(editor,md);
  for(const type of ["latex","codeBlock","mermaid","image","file","rawMarkdown"])assert.ok(blocks.some(b=>b.type===type),type);
  assert.equal(decodeURIComponent(blocks.find(b=>b.type==="codeBlock").props.text),"    print('中文')\n");
});
test("portable assets resolve in a new library while untouched Markdown stays exact",async()=>{
  configureAssetLinks("E:/Moved/data",path=>"asset://"+encodeURIComponent(path));
  const old="http://asset.localhost/"+encodeURIComponent("D:\\Old\\data\\assets\\目录\\图片.png");
  assert.equal(portableAssetPath(old),"assets/目录/图片.png");assert.equal(storedAssetUrl(old),"assets/%E7%9B%AE%E5%BD%95/%E5%9B%BE%E7%89%87.png");
  const editor=BlockNoteEditor.create({schema});const source="![图片](<"+old+">)\r\n";
  const blocks=await parseNote(editor,source);assert.match(decodeURIComponent(blocks[0].props.url),/E:\/Moved\/data/);
  replaceNoteDocument(editor,blocks);assert.equal(await serializeNote(editor,editor.document),source);
  editor.updateBlock(editor.document[0],{props:{name:"新图片"}});
  const saved=await serializeNote(editor,editor.document);assert.ok(saved.includes("assets/"));assert.ok(!saved.includes("D%3A"));
  assert.match(decodeURIComponent(resolveAssetUrl("assets/a.txt")),/E:\/Moved\/data\/assets\/a.txt/);
});
test("asset normalization rejects traversal and preserves encoded literal percent",()=>{
  assert.equal(portableAssetPath("assets/%2e%2e/outside"),null);
  assert.equal(portableAssetPath("https://example.com/data/assets/image.png"),null);
  const url="http://asset.localhost/"+encodeURIComponent("D:/Old/data/assets/100%2F.txt");
  assert.equal(portableAssetPath(url),"assets/100%2F.txt");
});
test("migration rewrites only real destinations and supports reference definitions",async()=>{
  const old="http://asset.localhost/"+encodeURIComponent("D:/Old/data/assets/a.png");
  const code="`"+old+"`";const source="![a]("+old+")\n\n"+code+"\n\n[a][ref]\n\n[ref]: "+old;
  const plan=await portableMarkdown(source);assert.equal(plan.replacements,2);assert.ok(plan.source.includes(code));assert.deepEqual(plan.assets,["assets/a.png"]);
});
test("replacement protects formulas, code, HTML and link destinations by default",async()=>{
  const source="foo `foo` $foo$ \\(foo\\) [foo](https://example.com/foo)\n\n```text\nfoo\n```\n\n<div>foo</div>";
  const safe=await planReplacement(source,"foo","$&");assert.equal(safe.changes.length,2);assert.ok(safe.content.startsWith("$& `foo`"));assert.ok(safe.content.includes("https://example.com/foo"));
  const all=await planReplacement(source,"foo","bar",{code:true,math:true,links:true});assert.equal(all.changes.length,8);
});
test("incremental dirty checks touch a single block and Undo returns clean",()=>{
  const document=Array.from({length:10000},(_,i)=>({id:String(i),type:"paragraph",content:[{text:"text"}],children:[]}));
  const session=new NoteSession();session.open("note","source",document);
  document[5000]={...document[5000],content:[{text:"changed"}]};
  session.trackChanges([{type:"update",block:document[5000]}],()=>document);assert.equal(session.textComparisons,1);assert.equal(session.isDirty(document),true);
  document[5000]={...document[5000],content:[{text:"text"}]};session.trackChanges([{type:"update",block:document[5000]}],()=>document);assert.equal(session.isDirty(document),false);
});
test("source replacement remains dirty until its exact content is saved",async()=>{
  const session=new NoteSession();const old=[{id:"old",content:"old"}],next=[{id:"new",content:"draft"}];session.open("n","old",old);session.replaceDocument(next);assert.ok(session.isDirty(next));
  let written="";await session.save(next,async()=>"draft",async(_p,text)=>{written=text;});assert.equal(written,"draft");assert.equal(session.isDirty(next),false);
});
test("workspace restores portable state with validated ranges and paths",()=>{
  const value=parseWorkspace({tabs:["笔记","../outside",null],reading:{fontSize:999,lineHeight:NaN,width:100},scroll:{"笔记":120,"../x":3},splitRatio:NaN});
  assert.deepEqual(value.tabs,["笔记"]);assert.equal(value.reading.fontSize,24);assert.equal(value.reading.width,520);assert.equal(value.splitRatio,.5);assert.deepEqual(value.scroll,{"笔记":120});
});
test("preview queue limits concurrency even when work fails",async()=>{
  let current=0,max=0;const results=await Promise.allSettled(Array.from({length:8},(_,i)=>runPreview(async()=>{current++;max=Math.max(max,current);try{await new Promise(resolve=>setTimeout(resolve,5));if(i===3)throw Error("failed");return i;}finally{current--;}})));
  assert.equal(max,2);assert.equal(results.filter(r=>r.status==="fulfilled").length,7);
});
test("large text previews are bounded and clearly marked",async()=>{
  const text=await previewText(new Response("abc".repeat(50000)),1000);assert.ok(text.length<1100);assert.match(text,/预览已截断/);
});
test("line comparison preserves before and after content",()=>{
  const diff=lineDiff("a\nb\nc","a\nnew\nc");assert.deepEqual(diff.filter(l=>l.kind!=="add").map(l=>l.text),["a","b","c"]);assert.deepEqual(diff.filter(l=>l.kind!=="remove").map(l=>l.text),["a","new","c"]);
});
test("portable packages include source and every local attachment at relative paths",async()=>{
  await build({stdin:{contents:'export { notePackage } from "./src/services/exportService.ts"; export { configureAssetLinks } from "./src/utils/assetLinks.ts";',resolveDir:process.cwd()},outfile:"artifacts/test-bundles/package.js",bundle:true,packages:"external",format:"esm",platform:"node"});
  const packageModule=await import(pathToFileURL(path.resolve("artifacts/test-bundles/package.js")).href);
  packageModule.configureAssetLinks("E:/Moved/data",p=>"asset://"+encodeURIComponent(p));
  const originalFetch=globalThis.fetch;const fetched=[];
  globalThis.fetch=async url=>{fetched.push(decodeURIComponent(url));return new Response("attachment bytes");};
  try{
    const bytes=await packageModule.notePackage("![图](assets/%E4%B8%AD%E6%96%87/p.png)\n\n[FILE:f.txt](assets/f.txt)","笔记");
    const zip=await JSZip.loadAsync(bytes);assert.ok(zip.file("笔记.md"));assert.ok(zip.file("assets/中文/p.png"));assert.ok(zip.file("assets/f.txt"));
    assert.ok(fetched.every(url=>url.startsWith("asset://E:/Moved/data/assets/")));
  }finally{globalThis.fetch=originalFetch;}
});
