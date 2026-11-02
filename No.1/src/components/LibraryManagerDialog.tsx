import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import Modal from "./Modal";
interface Status {root: string; recent: string[]; warning: string | null}
interface Backup {path: string; files: number; bytes: number}
export default function LibraryManagerDialog({beforeAction, onSwitch, onClose}: {beforeAction: () => Promise<void>; onSwitch: (path: string) => Promise<void>; onClose: () => void}) {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [backup, setBackup] = useState<Backup | null>(null);
  useEffect(() => { void invoke<Status>("library_status").then(setStatus).catch(e => setError(String(e))); }, []);
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(""); setMessage(""); try { await work(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  const folder = async (title: string) => { const result = await open({directory: true, multiple: false, title}); return typeof result === "string" ? result : null; };
  return <Modal title="笔记库与备份" wide busy={busy} onClose={onClose}>
    <label className="property-field">当前笔记库<input aria-label="当前笔记库" readOnly value={status?.root || "正在读取…"}/></label>
    {status?.warning && <p className="error-text">{status.warning}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status">{message}</p>}
    {busy && <p role="status">正在处理，请等待完整校验结束…</p>}
    <div className="option-row"><button disabled={busy} onClick={() => void run(async () => { const path = await folder("打开笔记库：选择已有或空文件夹"); if (path) await onSwitch(path); })}>打开 / 新建笔记库</button>
      <button disabled={busy} onClick={() => void run(async () => { const destination = await folder("选择备份存放位置（笔记库之外）"); if (!destination) return; await beforeAction(); const result = await invoke<Backup>("backup_library", {destination}); setMessage(`备份已完成并校验：${result.files} 个文件，${(result.bytes / 1024 / 1024).toFixed(1)} MB。保存位置：${result.path}`); })}>备份整个笔记库</button></div>
    <p className="muted">备份会生成独立文件夹，包含笔记、附件、历史版本、模板和工作区设置。保留生成的校验清单，以便验证恢复。</p>
    {!!status?.recent.length && <label className="property-field">最近使用的笔记库<select aria-label="最近使用的笔记库" value="" disabled={busy} onChange={e => { if (e.target.value) void run(() => onSwitch(e.target.value)); }}><option value="">选择要打开的笔记库…</option>{status.recent.filter(p => p !== status.root).map(p => <option key={p} value={p}>{p}</option>)}</select></label>}
    <hr/><h3>恢复备份</h3>
    <button disabled={busy} onClick={() => void run(async () => { const path = await folder("选择 No.1 备份文件夹"); if (!path) return; const result = await invoke<Backup>("inspect_library_backup", {path}); setBackup(result); setMessage("校验通过。请选择恢复位置，将生成独立的新笔记库。"); })}>选择并检查备份</button>
    {backup && <><p>{backup.files} 个文件 · {(backup.bytes / 1024 / 1024).toFixed(1)} MB<br/>{backup.path}</p><button className="primary" disabled={busy} onClick={() => void run(async () => { const destination = await folder("选择恢复位置（当前笔记库之外）"); if (!destination) return; await beforeAction(); const result = await invoke<Backup>("restore_library_backup", {source: backup.path, destination}); setMessage("恢复完成：" + result.path + "。可通过“打开笔记库”选择这个文件夹。"); setBackup(null); })}>恢复为新的笔记库</button></>}
  </Modal>;
}
