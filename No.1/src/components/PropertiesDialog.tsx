import { useState } from "react";
import Modal from "./Modal";
import { readProperties, writeProperties } from "../utils/noteProperties";
export default function PropertiesDialog({source, onSave, onClose, readOnly}: {source: string; onSave: (value: string) => Promise<void>; onClose: () => void; readOnly: boolean}) {
  const parsed = readProperties(source); const [value, setValue] = useState(parsed.properties), [tags, setTags] = useState(parsed.properties.tags.join(", "));
  const [busy, setBusy] = useState(false), [error, setError] = useState(parsed.error || "");
  return <Modal title="笔记属性" busy={busy} onClose={onClose}>
    <p className="muted">属性跟随 Markdown 文件保存，已有的自定义属性和正文会保留。</p>
    {error && <p role="alert" className="error-text">{error}</p>}
    {([ ["title", "显示标题"], ["type", "类型"], ["status", "状态"], ["source", "来源链接"], ["created", "创建日期"] ] as const).map(([key, label]) => <label className="property-field" key={key}>{label}<input aria-label={label} disabled={busy || readOnly || !!parsed.error} value={value[key]} onChange={e => setValue({...value, [key]: e.target.value})}/></label>)}
    <label className="property-field">标签（逗号分隔）<input aria-label="笔记标签" disabled={busy || readOnly || !!parsed.error} value={tags} onChange={e => setTags(e.target.value)}/></label>
    <footer><button onClick={onClose}>返回</button><button className="primary" disabled={busy || readOnly || !!parsed.error} onClick={async () => { setBusy(true); setError(""); try { await onSave(writeProperties(source, {...value, tags: [...new Set(tags.split(/[,，]/).map(t => t.trim().replace(/^#/, "")).filter(Boolean))]})); onClose(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>保存属性</button></footer>
  </Modal>;
}
