import { useEffect, useState } from "react";

export interface StorageCandidate { path: string; kind: string; bytes: number; modified_ms: number; fingerprint: string; reason: string; }
export interface StoragePreview { total_bytes: number; backup_bytes: number; asset_bytes: number; trash_bytes: number; reclaimable_bytes: number; candidates: StorageCandidate[]; }
export interface CleanupResult { removed: number; bytes: number; errors: string[]; }
const size = (bytes: number) => bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
interface Props {
  scan: () => Promise<StoragePreview | undefined>;
  clean: (selected: StorageCandidate[]) => Promise<CleanupResult | undefined>;
  onClose: () => void;
}
export default function StorageDialog({ scan, clean, onClose }: Props) {
  const [preview, setPreview] = useState<StoragePreview>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const rescan = async () => {
    setBusy(true); setConfirmed(false); setSelected(new Set());
    try { const next = await scan(); setPreview(next); if (!next) setMessage("扫描未完成，请查看错误提示后重试。"); }
    finally { setBusy(false); }
  };
  useEffect(() => { void rescan(); }, []);
  const visible = preview?.candidates.slice(0, 500) || [];
  const chosen = visible.filter(item => selected.has(item.path));
  const remove = async () => {
    if (!confirmed || !chosen.length) return;
    setBusy(true);
    try {
      const result = await clean(chosen);
      if (result) {
        await rescan();
        setMessage("已永久删除 " + result.removed + " 个文件，释放 " + size(result.bytes)
          + (result.errors.length ? "；部分文件未删除：" + result.errors.join("；") : "。"));
      } else setMessage("清理未完成，未确认的文件不会被删除。请重新扫描。");
    } finally { setBusy(false); setConfirmed(false); }
  };
  return <div className="no-print" role="dialog" aria-modal="true" aria-label="容量管理"
    style={{ position: "fixed", inset: 0, background: "#0006", zIndex: 2147483647, display: "grid", placeItems: "center" }}>
    <section style={{ width: "min(850px, 94vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 12, background: "white", borderRadius: 12, padding: 22, boxSizing: "border-box" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>容量管理</h2>
        <button disabled={busy} onClick={onClose} aria-label="关闭容量管理">关闭</button>
      </header>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "#555" }}>
        每篇笔记保留最新 10 份和最近 30 天的全部备份。附件需超过 7 天，且当前笔记、所有备份、恢复草稿、回收站均未发现引用才会列入候选。壁纸不参与清理。
      </p>
      {preview && <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <span>总占用 {size(preview.total_bytes)}</span><span>附件 {size(preview.asset_bytes)}</span>
        <span>备份 {size(preview.backup_bytes)}</span><span>回收站 {size(preview.trash_bytes)}</span>
        <strong>候选 {size(preview.reclaimable_bytes)}</strong>
      </div>}
      {message && <p role="status" style={{ margin: 0, color: "#975500", fontSize: 13 }}>{message}</p>}
      <div style={{ display: "flex", gap: 12 }}>
        <button disabled={busy} onClick={() => void rescan()}>重新扫描</button>
        <button disabled={busy || !visible.length} onClick={() => setSelected(new Set(visible.map(item => item.path)))}>选择当前列表</button>
        <button disabled={busy} onClick={() => setSelected(new Set())}>取消选择</button>
      </div>
      <div style={{ overflowY: "auto", minHeight: 120, border: "1px solid #ddd", borderRadius: 6 }}>
        {busy && <p style={{ padding: 12 }}>处理中，请稍候…</p>}
        {!busy && !visible.length && <p style={{ padding: 12 }}>没有符合安全清理条件的文件。</p>}
        {visible.map(item => <label key={item.path} style={{ display: "flex", gap: 10, padding: 10, borderBottom: "1px solid #eee", fontSize: 13 }}>
          <input type="checkbox" disabled={busy} checked={selected.has(item.path)} onChange={event => {
            const next = new Set(selected); if (event.target.checked) next.add(item.path); else next.delete(item.path); setSelected(next);
          }} />
          <span style={{ flex: 1, overflowWrap: "anywhere" }}>
            <strong>{item.path}</strong><br /><span style={{ color: "#777", fontSize: 12 }}>{item.reason} · {new Date(item.modified_ms).toLocaleString()}</span>
          </span><span>{size(item.bytes)}</span>
        </label>)}
      </div>
      {(preview?.candidates.length || 0) > 500 && <small>当前显示前 500 项，请清理后再次扫描。</small>}
      <label style={{ fontSize: 13, color: "#a32424" }}>
        <input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        我已核对候选文件，理解永久删除无法撤销（需要的内容请先另行备份）。
      </label>
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13 }}>已选 {chosen.length} 项 · {size(chosen.reduce((total, item) => total + item.bytes, 0))}</span>
        <button disabled={busy || !confirmed || !chosen.length} onClick={() => void remove()}
          style={{ color: "white", background: confirmed && chosen.length ? "#bc3434" : "#aaa", border: 0, borderRadius: 6, padding: "8px 16px" }}>永久删除所选文件</button>
      </footer>
    </section>
  </div>;
}
