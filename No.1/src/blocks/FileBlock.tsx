import { useState, useEffect, useRef } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { invoke } from "@tauri-apps/api/core";
import { getFileType } from "../utils/fileType";
import { runPreview, previewText } from "../utils/previewQueue";

export const fileBlockSchema = {
  type: "file" as const,
  propSchema: { ...defaultProps, name: { default: "Unknown File" }, url: { default: "" }, },
  content: "none" as const,
};

export const FileBlock = createReactBlockSpec(fileBlockSchema, {
  toExternalHTML: ({ block }) => <p><a href={block.props.url}>[附件: {block.props.name}]</a></p>,
  render: ({ block }) => {
    const { name, url } = block.props;
    const [preview, setPreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const host = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(typeof document !== "undefined" && document.documentElement.dataset.preparingPrint === "true");
    const fileType = getFileType(name || '');
    useEffect(() => {
      const prepare=()=>{setVisible(true);setIsExpanded(true);};
      window.addEventListener("prepare-note-print",prepare);
      return()=>window.removeEventListener("prepare-note-print",prepare);
    },[]);
    useEffect(() => {
      if (!host.current || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
      }, { rootMargin: "200px" });
      observer.observe(host.current); return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (!visible || !isExpanded) return;
      setPreview(null);
      setLoading(false);
      if (fileType === 'other') return;
      if (fileType === 'image') {
        setPreview(url);
        return;
      }
      // PDF: render first page as image
      if (fileType === 'pdf') {
        let cancelled = false;
        let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | undefined;
        let renderTask: import('pdfjs-dist').RenderTask | undefined;
        const releasePdf = () => {
          renderTask?.cancel();
          renderTask = undefined;
          const task = loadingTask;
          loadingTask = undefined;
          if (task) void task.destroy().catch(() => {});
        };
        setLoading(true);
        void runPreview(async () => {
          try {
            const [pdfjsLib, { default: pdfjsWorker }] = await Promise.all([
              import('pdfjs-dist'),
              import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
            ]);
            if (cancelled) return;
            pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
            loadingTask = pdfjsLib.getDocument({ url });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            if (cancelled) return;
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('no canvas context');
            renderTask = page.render({ canvas, canvasContext: ctx, viewport });
            await renderTask.promise;
            if (!cancelled) setPreview(canvas.toDataURL());
          } catch { if (!cancelled) setPreview(null); }
          finally { releasePdf(); if (!cancelled) setLoading(false); }
        });
        return () => { cancelled = true; releasePdf(); };
      }
      // Word docx: extract raw text via mammoth
      if (fileType === 'docx') {
        let cancelled = false;
        const controller = new AbortController();
        setLoading(true);
        void runPreview(async () => {
          try {
            const { default: mammoth } = await import("mammoth");
            if (cancelled) return;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error('无法读取附件');
            if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('附件过大，请打开原文件');
            const arrayBuffer = await response.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            if (!cancelled) setPreview(result.value.slice(0, 65536) + (result.value.length > 65536 ? '\n…请打开原文件查看全文。' : ''));
          } catch { if (!cancelled) setPreview(null); }
          finally { if (!cancelled) setLoading(false); }
        });
        return () => { cancelled = true; controller.abort(); };
      }
      // Text file: read full content
      let cancelled = false;
      const controller = new AbortController();
      setLoading(true);
      void runPreview(async () => {
        try {
          if (cancelled) return;
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('无法读取附件');
          const content = await previewText(response);
          if (!cancelled) setPreview(content);
        } catch { if (!cancelled) setPreview(null); }
        finally { if (!cancelled) setLoading(false); }
      });
      return () => { cancelled = true; controller.abort(); };
    }, [url, fileType, visible, isExpanded]);

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
      <div ref={host} className={"bn-file-block-content"} onDoubleClick={handleDbClick}
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
              <div style={{ padding: "12px", fontSize: "12px", color: "#bbb" }}>{visible?"无法预览，可双击打开原文件":"进入可视区域后加载预览"}</div>
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
              <div style={{ padding: "12px", fontSize: "12px", color: "#bbb" }}>{visible?"无法预览，可双击打开原文件":"进入可视区域后加载预览"}</div>
            )}
          </div>
        )}
      </div>
    );
  },
});
