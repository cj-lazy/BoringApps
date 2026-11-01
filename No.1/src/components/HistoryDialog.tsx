import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import DiffPreview from "./DiffPreview";
interface Version { name:string;origin_path:string;modified_ms:number;bytes:number; }
export default function HistoryDialog({path,current,onRestore,onClose}:{path:string;current:string;onRestore:(content:string)=>Promise<void>;onClose:()=>void}) {
  const [versions,setVersions]=useState<Version[]>([]);const [selected,setSelected]=useState("");const [source,setSource]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const request=useRef(0);
  useEffect(()=>{let cancelled=false;void invoke<Version[]>("list_note_versions",{path}).then(value=>{if(!cancelled)setVersions(value);}).catch(e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;request.current++;};},[path]);
  const choose=async(key:string)=>{const id=++request.current;setSelected(key);setSource(null);setError("");const version=versions[Number(key)];if(key===""||!version)return;try{const text=await invoke<string>("read_note_version",{path,name:version.name,originPath:version.origin_path});if(id===request.current)setSource(text);}catch(e){if(id===request.current)setError(String(e));}};
  return <Modal title="历史版本" onClose={onClose} busy={busy} wide>
    <p className="muted">{path} · 绿色为恢复后新增，红色为移除；恢复前会备份当前内容。</p>
    <select aria-label="选择历史版本" value={selected} onChange={e=>void choose(e.target.value)} disabled={busy}>
      <option value="">{versions.length?"选择保存时间":"暂无历史版本"}</option>
      {versions.map((v,index)=><option key={v.origin_path+v.name} value={index}>{new Date(v.modified_ms).toLocaleString()} · {(v.bytes/1024).toFixed(1)} KB · {v.name.slice(12,20)}</option>)}
    </select>
    {source!==null&&<DiffPreview before={current} after={source}/>}
    {error&&<p role="alert" className="error-text">{error}</p>}
    <footer><button className="primary" disabled={source===null||busy||source===current} onClick={async()=>{setBusy(true);try{await onRestore(source!);onClose();}catch(e){setError(String(e));}finally{setBusy(false);}}}>恢复所选版本</button></footer>
  </Modal>;
}
