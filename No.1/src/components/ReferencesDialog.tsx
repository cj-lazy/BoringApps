import {useEffect,useState} from "react";
import Modal from "./Modal";
import {refreshKnowledge} from "../services/knowledgeService";
import type {KnowledgeNote} from "../utils/knowledge";
import {referenceTargets,planReference,type ReferenceTarget} from "../utils/noteReferences";
import type {NoteChange} from "../utils/organizeNotes";
export default function ReferencesDialog({destination,onApply,onClose}:{destination:{path:string;source:string;offset:number};onApply:(c:NoteChange[])=>Promise<void>;onClose:()=>void}){
  const [notes,setNotes]=useState<KnowledgeNote[]>([]),[path,setPath]=useState(""),[targets,setTargets]=useState<ReferenceTarget[]>([]),[chosen,setChosen]=useState(-1),[live,setLive]=useState(true),[query,setQuery]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(true);
  useEffect(()=>{void refreshKnowledge().then(setNotes).catch(e=>setError(String(e))).finally(()=>setBusy(false));},[]);
  useEffect(()=>{let active=true;setTargets([]);setChosen(-1);const note=notes.find(n=>n.path===path);if(note)void referenceTargets(note.source).then(t=>{if(active)setTargets(t);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[path,notes]);
  const note=notes.find(n=>n.path===path);
  return <Modal title="插入段落引用" onClose={onClose} wide busy={busy}><p>引用插入在当前块之后。目标会获得稳定标记；改标题后引用仍然有效。</p><input className="command-query" aria-label="筛选引用笔记" placeholder="搜索笔记名称…" value={query} onChange={e=>setQuery(e.target.value)}/><select disabled={busy} className="command-query" aria-label="引用来源笔记" value={path} onChange={e=>setPath(e.target.value)}><option value="">选择来源笔记</option>{notes.filter(n=>(n.title+n.path).includes(query)).map(n=><option key={n.path} value={n.path}>{n.path}</option>)}</select><div className="reference-targets">{targets.map((t,i)=><label key={t.start}><input type="radio" name="reference-target" checked={chosen===i} onChange={()=>setChosen(i)}/><span>{t.kind==="section"?"章节":"段落"} · L{t.line} · {t.label}</span></label>)}</div><label><input type="checkbox" checked={live} onChange={e=>setLive(e.target.checked)}/>实时显示原文内容（取消则插入跳转链接）</label>{error&&<p role="alert">{error}</p>}<footer><button className="primary" disabled={busy||!note||chosen<0} onClick={async()=>{setBusy(true);setError("");try{await onApply(planReference(destination,note!,targets[chosen],live));onClose();}catch(e){setError(String(e));}finally{setBusy(false);}}}>插入所选引用</button></footer></Modal>;
}
