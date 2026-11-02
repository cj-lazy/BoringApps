import test from "node:test";
import assert from "node:assert/strict";
import {parseTabularClipboard,foldedBlockIds} from "../src/utils/editorComfort.ts";
import {flattenTree,visibleRange,filterTreeNodes} from "../src/utils/virtualTree.ts";
import {propertyChanges,mergeTagChanges,sortNotes} from "../src/utils/organizeNotes.ts";
import {indexNote} from "../src/utils/knowledge.ts";
import {assetReferences,assetRepairChanges} from "../src/utils/assetInventory.ts";
import {configureAssetLinks} from "../src/utils/assetLinks.ts";
import {uploadAsset} from "../src/services/transfers.ts";
const note=(path,source)=>indexNote({path,source,stamp:"1",modified_ms:1});
test("tabular paste handles quoted multiline cells, empty cells and Windows EOL",()=>{
  assert.deepEqual(parseTabularClipboard('A\tB\r\n"line1\nline2"\t"a""b"\r\n\tend\r\n'),[["A","B"],["line1\nline2",'a"b'],["","end"]]);
  assert.equal(parseTabularClipboard("ordinary prose, not a table"),null);assert.equal(parseTabularClipboard('a\tb\n"unfinished'),null);
  assert.deepEqual(parseTabularClipboard("a\tb\nc\t\td"),[["a","b",""],["c","","d"]]);
});
test("heading folding respects levels and never changes the source document",()=>{
  const blocks=[{id:"a",type:"heading",props:{level:1}},{id:"b",type:"paragraph"},{id:"c",type:"heading",props:{level:2}},{id:"d",type:"paragraph"},{id:"e",type:"heading",props:{level:1}}];
  const snapshot=JSON.stringify(blocks);assert.deepEqual(foldedBlockIds(blocks,new Set(["a"])),["b","c","d"]);assert.deepEqual(foldedBlockIds(blocks,new Set(["c"])),["d"]);assert.equal(JSON.stringify(blocks),snapshot);
});
test("a ten-thousand-file tree renders a bounded visible range",()=>{
  const nodes=Array.from({length:10000},(_,i)=>({name:"note"+i,path:"note"+i,is_dir:false,children:[]}));const rows=flattenTree(nodes,new Set());assert.equal(rows.length,10000);
  const range=visibleRange(10000,160000,600);assert.ok(range.end-range.start<=33);assert.ok(range.start>4000);
  const folders=[{name:"folder",path:"folder",is_dir:true,children:nodes}];assert.equal(flattenTree(folders,new Set()).length,1);assert.equal(flattenTree(folders,new Set(["folder"])).length,10001);
});
test("matching a folder keeps its children available to search and navigation",()=>{
  const tree=[{name:"项目",path:"项目",is_dir:true,children:[{name:"实验",path:"项目/实验",is_dir:false,children:[]}]}];
  assert.equal(filterTreeNodes(tree,"项目")[0].children.length,1);assert.equal(filterTreeNodes(tree,"实验")[0].children[0].name,"实验");assert.equal(filterTreeNodes(tree,"不存在").length,0);
});
test("batch properties and tag merging preserve formulas and unrelated YAML",async()=>{
  const n=await note("a","---\ncustom: preserve\ntags: [Old, Existing]\n---\n\n$$a_b$$\n");
  const changed=propertyChanges([n],{type:"实验",status:"完成",addTags:["new"],removeTags:["OLD"]});assert.equal(changed.length,1);assert.ok(changed[0].after.includes("custom: preserve"));assert.ok(changed[0].after.endsWith("$$a_b$$\n"));
  const merged=mergeTagChanges([n],"Old","existing");const next=await note("a",merged[0].after);assert.deepEqual(next.properties.tags,["Existing"]);
});
test("collection sorting is stable and handles numeric titles",async()=>{
  const notes=[await note("a","# 笔记10"),await note("b","# 笔记2")];assert.equal(sortNotes(notes,"title",false)[0].title,"笔记2");assert.equal(sortNotes(notes,"title",true)[0].title,"笔记10");assert.equal(sortNotes(notes,"relevance",false),notes);
});
test("attachment repair edits real Markdown destinations and preserves code examples",async()=>{
  configureAssetLinks("D:/lib",p=>p);
  const n=await note("a",'![image](assets/missing.png "assets/missing.png")\n\n`![example](assets/missing.png)`\n\n[FILE:doc](assets/a.docx)\n');
  const refs=await assetReferences([n]);assert.equal(refs.length,2);const changes=assetRepairChanges([n],refs,{"assets/missing.png":"assets/new.png"});assert.ok(changes[0].after.includes('](assets/new.png "assets/missing.png")'));assert.ok(changes[0].after.includes('`![example](assets/missing.png)`'));
});
test("large uploads transfer bounded chunks instead of materializing the whole file",async()=>{
  const calls=[];globalThis.window={__TAURI_INTERNALS__:{invoke:async(name,args)=>{calls.push({name,args});if(name==="begin_asset_upload")return "upload";if(name==="finish_asset_upload")return{url:"assets/shared/a.bin",reused:false,bytes:700000};}}};
  const file=new File([new Uint8Array(700000)],"large.bin");const progress=[];await uploadAsset(file,new AbortController().signal,p=>progress.push(p));
  const parts=calls.filter(c=>c.name==="append_asset_upload");assert.equal(parts.length,3);assert.ok(parts.every(c=>c.args.payload.length<=262144));assert.deepEqual(parts.map(c=>c.args.offset),[0,262144,524288]);assert.equal(progress.at(-1).completed,700000);
});
test("cancelled uploads discard pending files without committing an attachment",async()=>{
  const calls=[],controller=new AbortController();globalThis.window={__TAURI_INTERNALS__:{invoke:async(name)=>{calls.push(name);if(name==="begin_asset_upload"){controller.abort();return "upload";}}}};
  await assert.rejects(uploadAsset(new File(["body"],"a.txt"),controller.signal,()=>{}));assert.ok(calls.includes("cancel_asset_upload"));assert.ok(!calls.includes("finish_asset_upload"));
});
