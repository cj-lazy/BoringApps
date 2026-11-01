import { useState } from "react";
import Modal from "./Modal";
import DiffPreview from "./DiffPreview";
export interface Draft { id?:string;path:string;content:string;base_source:string;updated_ms:number; }
export default function RecoveryDialog({drafts,onRecover,onDiscard,onClose}:{drafts:Draft[];onRecover:(draft:Draft)=>Promise<void>;onDiscard:(draft:Draft)=>Promise<void>;onClose:()=>void}) {
  const [selected,setSelected]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const draft=drafts[Math.min(selected,drafts.length-1)];
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError("");try{await action();}catch(e){setError(String(e));}finally{setBusy(false);}};
  return <Modal title="恢复未保存草稿" onClose={onClose} wide busy={busy}>
    <p className="muted">发现上次未完成的编辑。恢复会先在编辑器中打开；磁盘内容发生变化时会保留两个版本。</p>
    {draft?<><select aria-label="选择草稿" disabled={busy} value={Math.min(selected,drafts.length-1)} onChange={e=>setSelected(Number(e.target.value))}>
      {drafts.map((item,index)=><option key={item.path+item.id} value={index}>{item.path} · {new Date(item.updated_ms).toLocaleString()}</option>)}
    </select><DiffPreview before={draft.base_source} after={draft.content}/>
    <footer><button disabled={busy} onClick={()=>void run(()=>onDiscard(draft))}>丢弃这份草稿</button><button disabled={busy} className="primary" onClick={()=>void run(()=>onRecover(draft))}>恢复这份草稿</button></footer></>:<p>所有草稿已处理。</p>}
    {error&&<p role="alert" className="error-text">{error}</p>}
  </Modal>;
}
