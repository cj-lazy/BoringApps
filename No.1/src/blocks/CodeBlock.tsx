import { useState, useEffect, useRef } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ResizeHandle from "../components/ResizeHandle";

export const codeBlockSchema = {
  type: "codeBlock" as const,
  propSchema: {
    ...defaultProps,
    text: { default: "" },
    language: { default: "cpp" },
    width: { default: "100%" },
    height: { default: 300 },
  },
  content: "none" as const,
  toExternalHTML: (block: any) => {
    const pre = document.createElement("pre");
    pre.style.backgroundColor = "#f0f0f0";
    const codeContent = block.props.text || "";
    const lang = block.props.language || "text";
    pre.innerText = `\`\`\`${lang}\n${codeContent}\n\`\`\``;
    return { dom: pre };
  }
};

export const CodeBlock = createReactBlockSpec(codeBlockSchema, {
  render: ({ block, editor }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [code, setCode] = useState(() => { try { return decodeURIComponent(block.props.text); } catch { return block.props.text; } });
    const [lang, setLang] = useState(block.props.language);
    const [copyStatus, setCopyStatus] = useState("复制");
    const [size, setSize] = useState({
        width: block.props.width === "100%" ? "100%" : parseInt(block.props.width as string),
        height: block.props.height
    });

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        try { const decoded = decodeURIComponent(block.props.text); if (decoded !== code) setCode(decoded); } catch { if (block.props.text !== code) setCode(block.props.text); }
        if (block.props.language !== lang) setLang(block.props.language);
        if (block.props.width !== size.width || block.props.height !== size.height) {
             setSize({
                width: block.props.width === "100%" ? "100%" : parseInt(block.props.width as string),
                height: block.props.height
            });
        }
    }, [block.props.text, block.props.language, block.props.width, block.props.height]);

    useEffect(() => { if (isEditing && textareaRef.current) { textareaRef.current.focus(); } }, [isEditing]);

    const handleSave = () => { editor.updateBlock(block, { props: { ...block.props, text: encodeURIComponent(code), language: lang } }); setIsEditing(false); };
    const handleCopy = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(code); setCopyStatus("已复制"); setTimeout(() => setCopyStatus("复制"), 2000); };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX; const startY = e.clientY;
        const currentW = typeof size.width === 'number' ? size.width : (e.currentTarget.parentElement?.offsetWidth || 600);
        const startWidth = currentW;
        const startHeight = size.height;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(300, startWidth + (moveEvent.clientX - startX));
            const newHeight = Math.max(100, startHeight + (moveEvent.clientY - startY));
            setSize({ width: newWidth, height: newHeight });
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            const finalWidth = Math.max(300, startWidth + (upEvent.clientX - startX));
            const finalHeight = Math.max(100, startHeight + (upEvent.clientY - startY));
            editor.updateBlock(block, { props: { ...block.props, width: finalWidth.toString(), height: finalHeight } });
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    };

    const languages = [ { value: "cpp", label: "C++" }, { value: "javascript", label: "JavaScript" }, { value: "typescript", label: "TypeScript" }, { value: "python", label: "Python" }, { value: "java", label: "Java" }, { value: "go", label: "Go" }, { value: "rust", label: "Rust" }, { value: "html", label: "HTML" }, { value: "css", label: "CSS" }, { value: "sql", label: "SQL" }, { value: "bash", label: "Bash" }, { value: "json", label: "JSON" }, { value: "markdown", label: "Markdown" }, { value: "mermaid", label: "Mermaid" } ];

    return (
      <div className="code-block-container" style={{ margin: "15px 0", borderRadius: "6px", border: `1px solid #dee0e3`, backgroundColor: "#ffffff", boxShadow: "0 2px 6px rgba(0,0,0,0.03)", fontFamily: 'Menlo, Monaco, "Courier New", monospace', overflow: "hidden", maxWidth: "100%", display: "flex", flexDirection: "column", position: "relative",
          width: typeof size.width === 'number' ? `${size.width}px` : size.width,
          height: `${size.height}px`
      }} onDoubleClick={(e) => e.stopPropagation()}>
        <div className="code-block-header export-exclude no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 12px", height: "34px", backgroundColor: "#f5f6f7", borderBottom: `1px solid #dee0e3`, userSelect: "none", fontSize: "12px", color: "#646a73", flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
             <span style={{ fontWeight: 600, color: "#333", fontFamily: "sans-serif" }}>代码块</span>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
             <select value={lang} onChange={(e) => { const newLang = e.target.value; setLang(newLang); editor.updateBlock(block, { props: { ...block.props, language: newLang } }); }} onClick={(e) => e.stopPropagation()} style={{ background: "transparent", border: "none", outline: "none", color: "#646a73", cursor: "pointer", fontWeight: 500, fontSize: "12px", fontFamily: "sans-serif", textAlign: "left" }}>
              {languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <span style={{ color: "#dee0e3", margin: "0 6px" }}>|</span>
            <button onClick={handleCopy} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#646a73", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", padding: "4px 6px", borderRadius: "4px", transition: "background 0.2s" }}><span>📄</span> <span style={{fontFamily: "sans-serif"}}>{copyStatus}</span></button>
          </div>
        </div>
        <div style={{ position: "relative", flex: 1, backgroundColor: "#ffffff", cursor: isEditing ? "text" : "default", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {isEditing ? (
            <textarea ref={textareaRef} value={code} onChange={(e) => setCode(e.target.value)} onBlur={handleSave} onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); const start = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; const val = e.currentTarget.value; e.currentTarget.value = val.substring(0, start) + "  " + val.substring(end); e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2; setCode(e.currentTarget.value); } if (e.key === 'Escape') handleSave(); }} spellCheck={false} style={{ flex: 1, height: "100%", width: "100%", padding: "12px", fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: "13px", lineHeight: "1.5", border: "none", outline: "none", backgroundColor: "#ffffff", color: "#333", resize: "none", whiteSpace: "pre", display: "block", overflow: "auto" }} />
          ) : (
            <div onClick={() => setIsEditing(true)} style={{ flex: 1, height: "100%", width: "100%", backgroundColor: "#ffffff", cursor: "text", overflow: "auto" }}>
              <SyntaxHighlighter language={block.props.language} style={vs} PreTag="div" customStyle={{ margin: 0, padding: "12px", backgroundColor: "transparent", fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: "13px", lineHeight: "1.5", overflow: "visible", height: "100%", boxSizing: "border-box" }} codeTagProps={{ style: { fontFamily: 'Menlo, Monaco, "Courier New", monospace', backgroundColor: "transparent" } }} showLineNumbers={true} lineNumberStyle={{ minWidth: "2.5em", paddingRight: "1em", color: "#ccc", textAlign: "right", borderRight: `1px solid #eee`, marginRight: "1em", fontFamily: "Consolas, monospace", fontSize: "12px", lineHeight: "1.5" }}>
                {code || " "}
              </SyntaxHighlighter>
              {!code && <div className="export-exclude no-print" style={{position:"absolute", top: 12, left: 60, color: "#ccc", pointerEvents:"none", fontFamily:"sans-serif", fontSize:"13px"}}>点击输入代码...</div>}
            </div>
          )}
        </div>
        {!isEditing && <ResizeHandle onResizeStart={handleResizeStart} />}
      </div>
    );
  }
});
