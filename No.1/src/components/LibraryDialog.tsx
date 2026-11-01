import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import { portableMarkdown } from "../utils/markdownAssets";
interface Migration { path:string;before:string;after:string;count:number;missing:string[]; }
export default function LibraryDialog({beforeScan,onApply,onClose}:{beforeScan:()=>Promise<void>;onApply:(items:Migration[])=>Promise<void>;onClose:()=>void}) {
  const [items,setItems]=useState<Migration[]>([]);const [selected,setSelected]=useState(new Set<string>());const [busy,setBusy]=useState(false);const [message,setMessage]=useState("扫描会检查旧绝对链接和本地附件是否存在，不会自动改写笔记。");
  const scan=async()=>{setBusy(true);setSelected(new Set());try{
    await beforeScan();const tree=await invoke<any[]>("get_file_tree");const paths:string[]=[];const visit=(nodes:any[])=>nodes.forEach(n=>n.is_dir?visit(n.children):paths.push(n.path));visit(tree);
    const result:Migration[]=[];const existence=new Map<string,boolean>();
    for(const path of paths){const before=await invoke<string>("load_note",{path});const plan=await portableMarkdown(before);const missing=[...plan.unresolved];
      for(const relative of plan.assets){if(!existence.has(relative))existence.set(relative,await invoke<boolean>("asset_exists",{relative}));if(!existence.get(relative))missing.push(relative);}
      if(plan.replacements||missing.length)result.push({path,before,after:plan.source,count:plan.replacements,missing});
    }
    setItems(result);setMessage(result.length?`扫描完成，${result.length} 篇笔记需要核对。可选择迁移为相对路径；缺失附件仍需补回。`:"扫描完成，未发现需要迁移或缺失的本地附件链接。");
  }catch(e){setMessage("扫描未完成："+String(e));}finally{setBusy(false);}};
  return <Modal title="附件链接检查" onClose={onClose} wide busy={busy}>
    <p role="status">{message}</p><button disabled={busy} onClick={()=>void scan()}>{busy?"处理中…":"扫描笔记库"}</button>
    <div className="migration-list">{items.map(item=><label key={item.path}><input type="checkbox" disabled={busy||!item.count} checked={selected.has(item.path)} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(item.path);else next.delete(item.path);return next;})}/>
      <span><strong>{item.path}</strong><br/>{item.count} 个链接可迁移{item.missing.length>0&&<span className="error-text"><br/>需核对：{item.missing.join("；")}</span>}</span>
    </label>)}</div>
    <footer><small>迁移前会备份原文，并检查文件是否被外部修改。</small><button className="primary" disabled={busy||!selected.size} onClick={async()=>{setBusy(true);try{await onApply(items.filter(item=>selected.has(item.path)));setItems([]);setSelected(new Set());setMessage("迁移完成，可重新扫描核对结果。");}catch(e){setMessage("部分迁移未完成，请重新扫描。"+String(e));}finally{setBusy(false);}}}>迁移所选笔记</button></footer>
  </Modal>;
}
