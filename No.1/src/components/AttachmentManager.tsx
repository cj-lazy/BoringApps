import {useEffect,useMemo,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import Modal from "./Modal";
import TransferPanel from "./TransferPanel";
import {useTransfer} from "../hooks/useTransfer";
import {refreshKnowledge} from "../services/knowledgeService";
import {assetReferences,assetRepairChanges,type AssetReference} from "../utils/assetInventory";
import type {KnowledgeNote} from "../utils/knowledge";
import type {NoteChange} from "../utils/organizeNotes";
import type {ImportedAsset} from "../services/transfers";
interface Asset{path:string;bytes:number;sha256:string}
export default function AttachmentManager({beforeLoad,onApply,onOpen,onClose}:{beforeLoad:()=>Promise<void>;onApply:(changes:NoteChange[])=>Promise<void>;onOpen:(path:string,line:number)=>Promise<void>;onClose:()=>void}){
  const transfer=useTransfer(),[assets,setAssets]=useState<Asset[]>([]),[notes,setNotes]=useState<KnowledgeNote[]>([]),[refs,setRefs]=useState<AssetReference[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [tab,setTab]=useState("all"),[query,setQuery]=useState(""),[limit,setLimit]=useState(100),[replacements,setReplacements]=useState<Record<string,string>>({});
  const load=async()=>{setBusy(true);setError("");try{await beforeLoad();const n=await refreshKnowledge();setNotes(n);setRefs(await assetReferences(n));const a=await transfer.run("检查附件",({id,channel})=>invoke<Asset[]>("inspect_attachments",{jobId:id,onProgress:channel}));setAssets(a);}catch(e){setError(String(e));}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);
  const grouped=useMemo(()=>{const map=new Map<string,Asset[]>();for(const a of assets)map.set(a.sha256,[...(map.get(a.sha256)||[]),a]);return [...map.values()].filter(g=>g.length>1);},[assets]);
  const present=new Set(assets.map(a=>a.path)),missing=[...new Set(refs.map(r=>r.asset))].filter(p=>!present.has(p));
  const filtered=assets.filter(a=>a.path.toLowerCase().includes(query.toLowerCase()));
  const importReplacement=async(asset:string)=>{const path=await open({multiple:false,title:"选择替代附件"});if(typeof path!=="string")return;setBusy(true);setError("");try{const result=await transfer.run("导入替代附件",({id,channel})=>invoke<ImportedAsset>("import_asset_file",{source:path,jobId:id,onProgress:channel}));setAssets(old=>old.some(a=>a.path===result.url)?old:[...old,{path:result.url,bytes:result.bytes,sha256:result.url.split("/").pop()!.split(".")[0]}]);setReplacements(old=>({...old,[asset]:result.url}));}catch(e){setError(String(e));}finally{setBusy(false);}};
  const references=(asset:string)=>refs.filter(r=>r.asset===asset);
  return <><Modal title="附件管理" wide busy={busy} onClose={onClose}>
    {error&&<p role="alert" className="error-text">{error}</p>}{message&&<p role="status">{message}</p>}
    <div className="option-row"><button disabled={busy} onClick={()=>void load()}>重新检查</button><button aria-pressed={tab==="all"} onClick={()=>{setTab("all");setLimit(100);}}>全部 {assets.length}</button><button aria-pressed={tab==="duplicates"} onClick={()=>setTab("duplicates")}>重复 {grouped.length} 组</button><button aria-pressed={tab==="missing"} onClick={()=>setTab("missing")}>缺失 {missing.length}</button></div>
    <p className="muted">新导入的相同内容会复用已有文件。引用列表显示当前笔记；旧版本和恢复草稿继续保留自己的附件。</p>
    {tab==="all"&&<><input aria-label="筛选附件" placeholder="搜索附件路径…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(100);}}/>
      <div className="attachment-list">{filtered.slice(0,limit).map(a=><details key={a.path}><summary>{a.path} <small>{(a.bytes/1024).toFixed(1)} KB · {references(a.path).length} 处引用</small></summary>
        {references(a.path).map((r,i)=><button key={r.note+":"+i} disabled={busy} onClick={async()=>{try{await onOpen(r.note,r.line);onClose();}catch(e){setError(String(e));}}}>{r.note} · 第 {r.line} 行</button>)}
        {!references(a.path).length&&<small>当前笔记中未找到引用。</small>}
      </details>)}</div>{filtered.length>limit&&<button onClick={()=>setLimit(n=>n+100)}>再显示 100 个附件</button>}</>}
    {tab==="duplicates"&&<div className="attachment-list">{grouped.map(group=><section key={group[0].sha256}><strong>相同内容 · {(group[0].bytes/1024).toFixed(1)} KB</strong>{group.map(a=><p key={a.path}>{a.path} · {references(a.path).length} 处引用</p>)}</section>)}{!grouped.length&&!busy&&<p>未发现重复附件。</p>}</div>}
    {tab==="missing"&&<><datalist id="existing-assets">{assets.map(a=><option key={a.path}>{a.path}</option>)}</datalist><div className="attachment-list">{missing.map(asset=><section key={asset}><strong>{asset}</strong><small>{references(asset).length} 处引用</small><input aria-label={"替换附件："+asset} placeholder="选择已有附件路径，或导入替代文件" list="existing-assets" value={replacements[asset]||""} onChange={e=>setReplacements(old=>({...old,[asset]:e.target.value}))}/><button disabled={busy} onClick={()=>void importReplacement(asset)}>选择替代文件</button></section>)}</div>
      <button className="primary" disabled={busy||!Object.values(replacements).some(Boolean)} onClick={async()=>{setBusy(true);setError("");try{for(const value of Object.values(replacements).filter(Boolean))if(!present.has(value))throw new Error("请选择已存在的附件路径。");const changes=assetRepairChanges(notes,refs,replacements);await onApply(changes);const next=await refreshKnowledge();setNotes(next);setRefs(await assetReferences(next));setReplacements({});setMessage(`已修复 ${changes.length} 篇笔记，原文已备份。`);}catch(e){setError(String(e));}finally{setBusy(false);}}}>应用所选路径修复</button>{!missing.length&&!busy&&<p>当前附件链接完整。</p>}</>}
  </Modal>{transfer.state&&<TransferPanel state={transfer.state} onCancel={transfer.cancel}/>}</>;
}
