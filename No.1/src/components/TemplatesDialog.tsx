import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import { builtinTemplates, expandTemplate, type NoteTemplate } from "../utils/templates";
interface Capture { note: string; snippet: string; path: string; }
export default function TemplatesDialog({capture, onCreate, onInsert, onClose, readOnly}: {capture: Capture; onCreate: (name: string, source: string, origin: string) => Promise<void>; onInsert: (source: string, origin: string) => Promise<void>; onClose: () => void; readOnly: boolean}) {
  const [custom, setCustom] = useState<NoteTemplate[]>([]), [selected, setSelected] = useState(builtinTemplates[0].id);
  const [title, setTitle] = useState(""), [name, setName] = useState(""), [content, setContent] = useState(builtinTemplates[0].content);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [loaded, setLoaded] = useState(false);
  useEffect(() => { let cancelled = false; void invoke<NoteTemplate[]>("load_templates").then(items => { if (!cancelled) {setCustom(items); setLoaded(true);} }).catch(e => !cancelled && setError(String(e))).finally(() => !cancelled && setBusy(false)); return () => { cancelled = true; }; }, []);
  const all = [...builtinTemplates, ...custom], template = all.find(t => t.id === selected)!;
  const run = async (operation: () => Promise<void>) => { setBusy(true); setError(""); try { await operation(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  const persist = async (next: NoteTemplate[]) => { await invoke("save_templates", {templates: next}); setCustom(next); };
  return <Modal title="模板与内容片段" wide busy={busy} onClose={onClose}>
    {error && <p role="alert" className="error-text">{error}</p>}
    <select aria-label="选择模板" value={selected} onChange={e => { setSelected(e.target.value); const t = all.find(t => t.id === e.target.value)!; setContent(t.content); }}>
      {all.map(t => <option key={t.id} value={t.id}>{t.kind === "note" ? "整页 · " : "片段 · "}{t.name}{t.id.startsWith("builtin-") ? "（内置）" : ""}</option>)}
    </select>
    <label className="property-field">新笔记名称 / 标题<input aria-label="模板新笔记名称" placeholder="输入名称后可预览标题变量" value={title} onChange={e => setTitle(e.target.value)}/></label>
    <textarea className="template-source" aria-label="模板内容" spellCheck={false} value={content} onChange={e => setContent(e.target.value)}/>
    <details><summary>预览变量替换结果</summary><pre className="template-preview">{expandTemplate(content, title || "新笔记")}</pre></details>
    <p className="muted">支持 {"{{title}}"}、{"{{date}}"}、{"{{datetime}}"}。片段插入到打开模板窗口时的光标所在块之后。</p>
    <div className="option-row"><button className="primary" disabled={busy || !title.trim()} onClick={() => void run(async () => { await onCreate(title.trim(), expandTemplate(content, title.trim()), template.sourcePath); onClose(); })}>从模板新建笔记</button>
      <button disabled={busy || readOnly || !capture.path || template.kind !== "snippet"} onClick={() => void run(async () => { await onInsert(expandTemplate(content, capture.path.split("/").pop()!), template.sourcePath); onClose(); })}>插入这个片段</button></div>
    <hr/>
    <div className="option-row"><input aria-label="保存模板名称" placeholder="为自定义模板起名" value={name} onChange={e => setName(e.target.value)}/>
      {([ ["note", "将当前笔记存为模板", capture.note], ["snippet", "将所选内容存为片段", capture.snippet] ] as const).map(([kind, label, source]) => <button key={kind} disabled={busy || !loaded || !name.trim() || !source} onClick={() => void run(async () => { const t: NoteTemplate = {id: crypto.randomUUID(), name: name.trim(), kind, content: source, sourcePath: capture.path}; await persist([...custom, t]); setSelected(t.id); setContent(t.content); setName(""); })}>{label}</button>)}
      <button disabled={busy || !loaded || !name.trim()} onClick={() => void run(async () => { const t: NoteTemplate = {id: crypto.randomUUID(), name: name.trim(), kind: template.kind, content, sourcePath: template.sourcePath}; await persist([...custom, t]); setSelected(t.id); setName(""); })}>另存编辑后的模板</button>
      {!selected.startsWith("builtin-") && <button disabled={busy || !loaded} onClick={() => void run(async () => { await persist(custom.filter(t => t.id !== selected)); setSelected(builtinTemplates[0].id); setContent(builtinTemplates[0].content); })}>删除这个模板</button>}
    </div>
  </Modal>;
}
