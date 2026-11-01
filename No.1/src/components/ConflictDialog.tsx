import { useState } from "react";
import Modal from "./Modal";
import DiffPreview from "./DiffPreview";
export interface Conflict { pane:"left"|"right";path:string;ours:string;disk:string; }
export default function ConflictDialog({conflict,onReload,onCopy,onClose}:{conflict:Conflict;onReload:()=>Promise<void>;onCopy:()=>Promise<void>;onClose:()=>void}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const run=async(action:()=>Promise<void>)=>{setBusy(true);try{await action();onClose();}catch(e){setError(String(e));}finally{setBusy(false);}};
  return <Modal title="处理外部修改" onClose={onClose} wide busy={busy}>
    <p>{conflict.path} 已在其他程序中修改。下方对比磁盘版本与当前编辑内容。</p>
    <DiffPreview before={conflict.disk} after={conflict.ours}/>
    <p className="muted">“采用磁盘版本”会先保留当前内容为恢复草稿；“另存为副本”会保留两份笔记。</p>
    {error&&<p role="alert" className="error-text">{error}</p>}
    <footer><button disabled={busy} onClick={()=>void run(onReload)}>采用磁盘版本</button><button className="primary" disabled={busy} onClick={()=>void run(onCopy)}>当前内容另存为副本</button></footer>
  </Modal>;
}
