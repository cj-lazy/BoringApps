import { useState, useEffect } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { invoke } from "@tauri-apps/api/core";
import mammoth from "mammoth";
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getFileType } from "../utils/fileType";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const fileBlockSchema = {
  type: "file" as const,
  propSchema: { ...defaultProps, name: { default: "Unknown File" }, url: { default: "" }, },
  content: "none" as const,
  toExternalHTML: (block: any) => {
    const div = document.createElement("div");
    const link = document.createElement("a");
    link.href = block.props.url;
    link.innerText = `[附件: ${block.props.name}]`;
    link.style.color = "#1890ff";
    div.appendChild(link);
    return { dom: div };
  }
};

export const FileBlock = createReactBlockSpec(fileBlockSchema, {
  render: ({ block }) => {
    const { name, url } = block.props;
    const [preview, setPreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const fileType = getFileType(name || '');

    useEffect(() => {
      if (fileType === 'other') return;
      if (fileType === 'image') {
        setPreview(url);
        return;
      }
      // PDF: render first page as image
      if (fileType === 'pdf') {
        let cancelled = false;
        setLoading(true);
        (async () => {
          try {
            const pdf = await pdfjsLib.getDocument({ url }).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('no canvas context');
            await page.render({ canvas, canvasContext: ctx, viewport }).promise;
            if (!cancelled) setPreview(canvas.toDataURL());
          } catch { if (!cancelled) setPreview(null); }
          finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
      }
      // Word docx: extract raw text via mammoth
      if (fileType === 'docx') {
        let cancelled = false;
        setLoading(true);
        (async () => {
          try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            if (!cancelled) setPreview(result.value);
          } catch { if (!cancelled) setPreview(null); }
          finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
      }
      // Text file: read full content
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const response = await fetch(url);
          const content = await response.text();
          if (!cancelled) setPreview(content);
        } catch { if (!cancelled) setPreview(null); }
        finally { if (!cancelled) setLoading(false); }
      })();
      return () => { cancelled = true; };
    }, [url, fileType]);

    const handleDbClick = async (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      try { await invoke("open_file", { url: url }); }
      catch (err) { alert("无法打开文件: " + err); }
    };

    const iconMap: Record<string, string> = { image: '🖼️', text: '📝', docx: '📝', pdf: '📕', other: '📄' };

    const previewStyle: React.CSSProperties = {
      margin: 0, padding: "10px", fontSize: "11px", lineHeight: "1.5", color: "#555",
      whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "300px",
      overflowY: "auto", fontFamily: 'Menlo, Monaco, "Courier New", monospace'
    };

    return (
      <div className={"bn-file-block-content"} onDoubleClick={handleDbClick}
        style={{ display: "flex", flexDirection: "column", padding: "10px", margin: "5px 0",
          border: "1px solid #dee0e3", borderRadius: "8px", backgroundColor: "white",
          cursor: "pointer", userSelect: "none", transition: "all 0.2s", width: "100%",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f7f9fb"}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
        title="双击打开文件">

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: "24px", marginRight: "12px" }}>{iconMap[fileType] || '📄'}</div>
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {name || "未知文件"}
            </span>
            <span className="export-exclude no-print" style={{ fontSize: "11px", color: "#999" }}>
              双击调用系统程序打开
            </span>
          </div>
          {/* Toggle expand/collapse */}
          {fileType !== 'other' && (
            <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              className="export-exclude no-print"
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "12px", padding: "2px 6px", color: "#999", borderRadius: "4px" }}
              title={isExpanded ? "收起预览" : "展开预览"}>
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
        </div>

        {/* Preview area - collapsible */}
        {isExpanded && fileType === 'image' && preview && (
          <div style={{ marginTop: "8px", borderRadius: "6px", overflow: "hidden", border: "1px solid #f0f0f0" }}>
            <img src={preview} alt={name} style={{ maxWidth: "100%", maxHeight: "200px", display: "block", objectFit: "contain" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        {isExpanded && fileType === 'pdf' && (
          <div style={{ marginTop: "8px", borderRadius: "6px", overflow: "hidden", border: "1px solid #f0f0f0" }}>
            {loading ? (
              <div style={{ padding: "20px", fontSize: "12px", color: "#999", textAlign: "center" }}>解析 PDF 中...</div>
            ) : preview ? (
              <img src={preview} alt={name} style={{ maxWidth: "100%", maxHeight: "300px", display: "block", objectFit: "contain", cursor: "pointer" }}
                onClick={handleDbClick} title="双击打开原文件"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div style={{ padding: "12px", fontSize: "12px", color: "#bbb" }}>无法预览</div>
            )}
          </div>
        )}
        {isExpanded && (fileType === 'text' || fileType === 'docx') && (
          <div style={{ marginTop: "8px", borderRadius: "6px", overflow: "hidden", border: "1px solid #f0f0f0", backgroundColor: "#fafafa" }}>
            {loading ? (
              <div style={{ padding: "12px", fontSize: "12px", color: "#999" }}>
                {fileType === 'docx' ? '解析 Word 文档中...' : '加载预览中...'}
              </div>
            ) : preview ? (
              <pre style={previewStyle}>{preview}</pre>
            ) : (
              <div style={{ padding: "12px", fontSize: "12px", color: "#bbb" }}>无法预览</div>
            )}
          </div>
        )}
      </div>
    );
  },
});
