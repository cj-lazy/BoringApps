import { useState, useEffect, useRef } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import mermaid from "mermaid";
import ResizeHandle from "../components/ResizeHandle";

// Initialize Mermaid
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

export const mermaidBlockSchema = {
  type: "mermaid" as const,
  propSchema: {
    ...defaultProps,
    code: { default: "graph TD;\nA-->B;" },
    width: { default: 500 },
    height: { default: 300 },
  },
  content: "none" as const,
  toExternalHTML: (block: any) => {
    const div = document.createElement("div");
    div.className = "mermaid-export-data";
    div.dataset.code = block.props.code;
    div.innerText = `[流程图/思维导图]`;
    div.style.width = block.props.width + "px";
    div.style.height = block.props.height + "px";
    return { dom: div };
  }
};

export const MermaidBlock = createReactBlockSpec(mermaidBlockSchema, {
  render: ({ block, editor }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [code, setCode] = useState(block.props.code);
    const [size, setSize] = useState({ width: block.props.width, height: block.props.height });

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { setSize({ width: block.props.width, height: block.props.height }); }, [block.props.width, block.props.height]);

    useEffect(() => {
        if (containerRef.current && !isEditing) {
            containerRef.current.innerHTML = "";
            const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
            mermaid.render(id, code).then(({ svg }) => {
                if (containerRef.current) containerRef.current.innerHTML = svg;
            }).catch((_e) => {
                if (containerRef.current) containerRef.current.innerHTML = `<div style="color:red; font-size:12px; padding:10px;">语法错误</div>`;
            });
        }
    }, [code, isEditing]);

    const handleSaveCode = () => {
        editor.updateBlock(block, { props: { ...block.props, code: code } });
        setIsEditing(false);
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX; const startY = e.clientY;
        const startWidth = size.width; const startHeight = size.height;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(200, startWidth + (moveEvent.clientX - startX));
            const newHeight = Math.max(100, startHeight + (moveEvent.clientY - startY));
            setSize({ width: newWidth, height: newHeight });
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            const finalWidth = Math.max(200, startWidth + (upEvent.clientX - startX));
            const finalHeight = Math.max(100, startHeight + (upEvent.clientY - startY));
            editor.updateBlock(block, { props: { ...block.props, width: finalWidth, height: finalHeight } });
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    };

    return (
        <div className="mermaid-block-wrapper" style={{ margin: "10px 0", border: "1px solid #dee0e3", borderRadius: "8px", backgroundColor: "white", width: isEditing ? "100%" : `${size.width}px`, transition: isEditing ? "width 0.2s" : "none", position: "relative", maxWidth: "100%", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            <div className="export-exclude no-print" style={{ background: "#f5f6f7", padding: "5px 10px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#666", borderBottom: "1px solid #eee", borderTopLeftRadius: "8px", borderTopRightRadius: "8px" }}>
                <span style={{fontWeight: "bold", display:"flex", alignItems:"center", gap:"5px"}}>🧜‍♂️ 流程图</span>
                <button onClick={() => setIsEditing(!isEditing)} style={{ cursor: "pointer", border: "none", background: "transparent", color: "#1890ff" }}>{isEditing ? "预览" : "编辑"}</button>
            </div>
            {isEditing ? (
                <textarea ref={inputRef} value={code} onChange={(e) => setCode(e.target.value)} onBlur={handleSaveCode} style={{ width: "100%", height: "200px", padding: "10px", border: "none", fontFamily: "monospace", fontSize: "13px", resize: "vertical", outline: "none", background: "#fafafa" }} />
            ) : (
                <div ref={containerRef} style={{ padding: "10px", background: "white", height: `${size.height}px`, width: "100%", overflow: "auto", display: "flex", justifyContent: "center", alignItems: "center" }} onDoubleClick={() => setIsEditing(true)} />
            )}
            {!isEditing && <ResizeHandle onResizeStart={handleResizeStart} />}
        </div>
    );
  }
});
