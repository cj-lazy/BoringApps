import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export interface FileNode { name: string; path: string; is_dir: boolean; children: FileNode[]; }
export interface TrashItem { name: string; is_dir: boolean; path: string; }
export interface DialogProps {
  isOpen: boolean;
  type: 'confirm' | 'prompt' | 'tree-select' | 'settings' | 'alert' | 'save-guard' | 'trash';
  title: string; message?: string; defaultValue?: string;
  treeData?: FileNode[]; disabledPath?: string; trashItems?: TrashItem[];
  bgImage?: string | null; bgOpacity?: number; bgBlur?: number;
  onSetBgImage?: (file: File) => void;
  onSetBgOpacity?: (val: number) => void;
  onSetBgBlur?: (val: number) => void;
  onClearBg?: () => void;
  onEmptyTrash?: () => void;
  onRestore?: (name: string) => void;
  onDeleteForever?: (name: string) => void;
  onConfirm: (value: any) => void;
  onCancel: () => void;
}

const CustomDialog = (props: DialogProps) => {
  const { isOpen, type, title, message, defaultValue, treeData, disabledPath, trashItems, bgImage, bgOpacity, bgBlur, onConfirm, onCancel, onEmptyTrash, onRestore, onDeleteForever } = props;
  const [inputValue, setInputValue] = useState(defaultValue || "");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  useEffect(() => { if (isOpen) { setInputValue(defaultValue || ""); setExpandedPaths(new Set()); } }, [isOpen, defaultValue]);
  if (!isOpen) return null;

  const renderDialogTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      if (!node.is_dir) return null;
      const isDisabled = disabledPath && (node.path === disabledPath || node.path.startsWith(disabledPath + "/"));
      const isExpanded = expandedPaths.has(node.path);
      const isSelected = inputValue === node.path;
      return (
        <div key={node.path}>
          <div style={{ padding: "6px 8px", paddingLeft: `${depth * 18 + 8}px`, cursor: isDisabled ? "not-allowed" : "pointer", background: isSelected ? "#e6f7ff" : "transparent", color: isDisabled ? "#ccc" : (isSelected ? "#1890ff" : "#333"), borderRadius: "4px", display: "flex", alignItems: "center", marginBottom: "1px", fontSize: "13px" }}
            onClick={() => { if (isDisabled) return; setInputValue(node.path); }}>
            <span style={{ marginRight: "6px", width: "12px", display: "inline-block", textAlign: "center", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", cursor: "pointer", color: "#999" }}
              onClick={(e) => { e.stopPropagation(); const newSet = new Set(expandedPaths); if (newSet.has(node.path)) newSet.delete(node.path); else newSet.add(node.path); setExpandedPaths(newSet); }}>▶</span>
            <span style={{ marginRight: "4px" }}>{isExpanded ? "📂" : "📁"}</span>
            <span>{node.name}</span>
          </div>
          {isExpanded && node.children && <div>{renderDialogTree(node.children, depth + 1)}</div>}
        </div>
      );
    });
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2147483647 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: (type === 'settings' || type === 'trash') ? "500px" : "350px", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", padding: "24px", display: "flex", flexDirection: "column", maxHeight: "85vh", animation: "popIn 0.2s ease" }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: "18px", color: "#333", borderBottom: "1px solid #eee", paddingBottom: "10px", display: "flex", justifyContent: "space-between" }}>
          {title}
          {type === 'trash' && <button onClick={onEmptyTrash} style={{ fontSize: "12px", color: "#ff4d4f", background: "transparent", border: "none", cursor: "pointer" }}>🗑️ 清空所有</button>}
        </h3>
        {message && <p style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#666", lineHeight: "1.5" }}>{message}</p>}

        {/* Trash list */}
        {type === 'trash' && (
          <div style={{ flex: 1, overflowY: "auto", minHeight: "300px", border: "1px solid #f0f0f0", borderRadius: "6px", padding: "5px" }}>
            {trashItems && trashItems.length > 0 ? (
              trashItems.map(item => (
                <div key={item.path} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", borderBottom: "1px solid #f9f9f9", fontSize: "13px" }}>
                  <div style={{ display: "flex", alignItems: "center", overflow: "hidden" }}>
                    <span style={{ marginRight: "6px" }}>{item.is_dir ? "📂" : "📄"}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "250px" }} title={item.name}>{item.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => onRestore && onRestore(item.path)} style={{ color: "#1890ff", background: "transparent", border: "none", cursor: "pointer", fontSize: "12px" }}>还原</button>
                    <button onClick={() => onDeleteForever && onDeleteForever(item.path)} style={{ color: "#999", background: "transparent", border: "none", cursor: "pointer", fontSize: "12px" }}>❌</button>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "20px", textAlign: "center", color: "#ccc", fontSize: "13px" }}>回收站是空的</div>
            )}
          </div>
        )}

        {/* Settings panel */}
        {type === 'settings' && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "20px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "8px", color: "#555" }}>自定义背景图</label>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {bgImage ? (
                  <div style={{ width: "60px", height: "40px", borderRadius: "4px", background: `url(${convertFileSrc(bgImage)}) center/cover`, border: "1px solid #ddd" }}></div>
                ) : (
                  <div style={{ width: "60px", height: "40px", borderRadius: "4px", background: "#f0f0f0", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#999" }}>无</div>
                )}
                <input type="file" accept="image/*" id="bg-upload" style={{ display: "none" }} onChange={(e) => { if (e.target.files && e.target.files[0] && props.onSetBgImage) props.onSetBgImage(e.target.files[0]); }} />
                <button onClick={() => document.getElementById('bg-upload')?.click()} style={{ padding: "6px 12px", border: "1px solid #ddd", background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>选择图片...</button>
                {bgImage && <button onClick={props.onClearBg} style={{ padding: "6px 12px", border: "none", background: "#ff4d4f", color: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>清除</button>}
              </div>
            </div>
            <div><label style={{ fontSize: "13px", fontWeight: "bold", color: "#555" }}>白纸浓度: {Math.round((bgOpacity || 0.5) * 100)}%</label><input type="range" min="0.05" max="1" step="0.05" value={bgOpacity} onChange={(e) => props.onSetBgOpacity && props.onSetBgOpacity(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#1890ff" }} /></div>
            <div><label style={{ fontSize: "13px", fontWeight: "bold", color: "#555" }}>毛玻璃模糊: {bgBlur} px</label><input type="range" min="0" max="20" step="1" value={bgBlur} onChange={(e) => props.onSetBgBlur && props.onSetBgBlur(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#1890ff" }} /></div>
          </div>
        )}

        {/* Prompt input */}
        {type === 'prompt' && <input autoFocus type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(inputValue); }} style={{ width: "100%", padding: "10px", marginBottom: "20px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />}

        {/* Tree selector */}
        {type === 'tree-select' && treeData && (
          <div style={{ flex: 1, overflowY: "auto", border: "1px solid #eee", borderRadius: "6px", padding: "5px", marginBottom: "20px", minHeight: "200px" }}>
            <div onClick={() => setInputValue("")} style={{ padding: "6px 8px", paddingLeft: "8px", cursor: "pointer", background: inputValue === "" ? "#e6f7ff" : "transparent", color: inputValue === "" ? "#1890ff" : "#333", borderRadius: "4px", display: "flex", alignItems: "center", marginBottom: "1px", fontSize: "13px", fontWeight: "bold" }}>
              <span style={{ marginRight: "6px", width: "12px", textAlign: "center" }}>🏠</span>
              <span>根目录</span>
            </div>
            {renderDialogTree(treeData)}
          </div>
        )}

        {/* Footer buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
          {type !== 'trash' && <button onClick={onCancel} style={{ padding: "8px 16px", border: "1px solid #ddd", borderRadius: "6px", background: "white", color: "#666", cursor: "pointer", fontSize: "14px" }}>取消</button>}
          <button onClick={() => onConfirm(type === 'prompt' || type === 'tree-select' ? inputValue : true)} style={{ padding: "8px 16px", border: "none", borderRadius: "6px", background: "#1890ff", color: "white", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}>{type === 'trash' ? "关闭" : "确定"}</button>
        </div>
      </div>
      <style>{`@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
};

export default CustomDialog;
