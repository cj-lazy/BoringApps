import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import DiffPreview from "./DiffPreview";
import { planReplacement, safeReplaceOptions, type ReplaceOptions } from "../utils/searchReplace";
import {refreshKnowledge} from "../services/knowledgeService";
import type {NoteChange} from "../utils/organizeNotes";
interface Hit { path:string;line:number;content:string; }
interface Page { matches:Hit[];has_more:boolean;offset:number;warnings:string[]; }
interface Preview { path:string;before:string;after:string;count:number; }
export default function SearchPanel({onClose,onOpen,beforeSearch,onReplace,onBatch}:{onClose:()=>void;onOpen:(hit:Hit,query:string)=>Promise<void>;beforeSearch:()=>Promise<void>;onReplace:(path:string,before:string,after:string)=>Promise<void>;onBatch:(changes:NoteChange[])=>Promise<void>}) {
  const [query,setQuery]=useState("");const [replacement,setReplacement]=useState("");const [hits,setHits]=useState<Hit[]>([]);
  const [state,setState]=useState<"idle"|"loading"|"done">("idle");const [more,setMore]=useState(false);
  const [error,setError]=useState("");const [options,setOptions]=useState<ReplaceOptions>(safeReplaceOptions);const [preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState(false);const request=useRef(0);
  const [batch,setBatch]=useState<Preview[]|null>(null);const [selected,setSelected]=useState<Set<string>>(new Set());
  const prepareBatch=async()=>{setBusy(true);setError("");try{await beforeSearch();const plans:Preview[]=[];for(const note of await refreshKnowledge()){const plan=await planReplacement(note.source,query,replacement,options);if(plan.changes.length)plans.push({path:note.path,before:note.source,after:plan.content,count:plan.changes.length});}setBatch(plans);setSelected(new Set(plans.map(p=>p.path)));}catch(e){setError(String(e));}finally{setBusy(false);}};
  const search=async(append=false)=>{
    if(!query.trim())return;const id=++request.current;setState("loading");setError("");setPreview(null);
    try{
      await beforeSearch();const page=await invoke<Page>("search_notes_page",{query,offset:append?hits.length:0});
      if(id!==request.current)return;setHits(old=>append?[...old,...page.matches]:page.matches);setMore(page.has_more);setState("done");
      if(page.warnings.length)setError("部分笔记未能读取："+page.warnings.join("；"));
    }catch(e){if(id===request.current){setError(String(e));setState("idle");}}
  };
  const prepare=async(path:string)=>{
    setBusy(true);setError("");try{
      await beforeSearch();const before=await invoke<string>("load_note",{path});const plan=await planReplacement(before,query,replacement,options);
      setPreview({path,before,after:plan.content,count:plan.changes.length});
    }catch(e){setError(String(e));}finally{setBusy(false);}
  };
  const groups=new Map<string,Hit[]>();for(const hit of hits)groups.set(hit.path,[...(groups.get(hit.path)||[]),hit]);
  return <Modal title="全局搜索与替换" onClose={onClose} wide busy={busy}>
    <form className="search-form" onSubmit={event=>{event.preventDefault();void search();}}>
      <input disabled={busy} autoFocus placeholder="搜索所有笔记内容…" aria-label="全局搜索关键词" value={query} onChange={event=>{request.current++;setQuery(event.target.value);setState("idle");setHits([]);setMore(false);setPreview(null);setBatch(null);}}/>
      <button className="primary" disabled={state==="loading"||busy||!query.trim()}>搜索</button>
    </form>
    <div className="search-form"><label htmlFor="replacement">替换为</label><input disabled={busy} id="replacement" value={replacement} onChange={e=>{setReplacement(e.target.value);setPreview(null);setBatch(null);}} placeholder="留空会删除匹配文字"/></div>
    <div className="option-row"><span>正文以外还包含：</span>{([["code","代码与 HTML"],["math","公式"],["links","链接目标"],["properties","笔记属性"]] as const).map(([key,label])=><label key={key}><input disabled={busy} type="checkbox" checked={!!options[key]} onChange={e=>{setOptions(old=>({...old,[key]:e.target.checked}));setPreview(null);setBatch(null);}}/>{label}</label>)}</div>
    <button disabled={busy||!query.trim()} onClick={()=>void prepareBatch()}>预览全库替换</button>
    {batch&&<div className="batch-replacement"><p>全库共 {batch.length} 篇可替换。提交前将检查每篇原文，遇到冲突会取消整批操作。</p>{batch.map(p=><details key={p.path}><summary><input disabled={busy} type="checkbox" aria-label={"替换 "+p.path} checked={selected.has(p.path)} onClick={e=>e.stopPropagation()} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(p.path);else next.delete(p.path);return next;})}/>{p.path} · {p.count} 处</summary><DiffPreview before={p.before} after={p.after}/></details>)}<footer><button disabled={busy} onClick={()=>setBatch(null)}>关闭批量预览</button><button className="primary" disabled={busy||!selected.size} onClick={async()=>{setBusy(true);try{await onBatch(batch.filter(p=>selected.has(p.path)));setBatch(null);await search();}catch(e){setError(String(e));}finally{setBusy(false);}}}>确认替换所选 {selected.size} 篇笔记</button></footer></div>}
    {error&&<p role="alert" className="error-text">{error}</p>}
    {preview?<>
      <p>{preview.path} · 预计替换 {preview.count} 处</p><DiffPreview before={preview.before} after={preview.after}/>
      <footer><button disabled={busy} onClick={()=>setPreview(null)}>返回结果</button><button className="primary" disabled={busy||!preview.count} onClick={async()=>{setBusy(true);try{await onReplace(preview.path,preview.before,preview.after);setPreview(null);await search();}catch(e){setError(String(e));}finally{setBusy(false);}}}>确认替换这篇笔记</button></footer>
    </>:<div className="search-results" aria-live="polite">
      {state==="idle"&&<p className="empty-state">输入关键词，按 Enter 搜索。</p>}
      {state==="loading"&&<p className="empty-state">正在搜索…</p>}
      {state==="done"&&!hits.length&&<p className="empty-state">没有找到匹配结果。</p>}
      {[...groups].map(([path,items])=><section className="search-file" key={path}>
        <header><strong>{path}</strong><button disabled={busy} onClick={()=>void prepare(path)}>预览替换</button></header>
        {items.map(hit=><button className="search-result" key={hit.line} onClick={async()=>{setBusy(true);try{await onOpen(hit,query);onClose();}catch(e){setError(String(e));}finally{setBusy(false);}}}><span>L{hit.line}</span><span>{hit.content}</span></button>)}
      </section>)}
      {state==="done"&&<footer><small>已展示 {hits.length} 条{more?"，还有更多结果":""}</small>{more&&<button onClick={()=>void search(true)}>加载更多</button>}</footer>}
    </div>}
  </Modal>;
}
