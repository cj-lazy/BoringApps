import { useState, useRef, useEffect } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import katex from "katex";

export const latexBlockSchema = {
    type: "latex" as const,
    propSchema: { ...defaultProps, text: { default: "" } },
    content: "none" as const,
    toExternalHTML: (block: any) => {
        const div = document.createElement("p");
        div.innerText = `$$\n${block.props.text}\n$$`;
        div.style.fontFamily = "Consolas, monospace";
        return { dom: div };
    }
};

export const LatexBlock = createReactBlockSpec(latexBlockSchema, {
    render: ({ block, editor }) => {
      const divRef = useRef<HTMLDivElement>(null);
      const [isEditing, setIsEditing] = useState(false);
      const [inputValue, setInputValue] = useState(() => { try { return decodeURIComponent(block.props.text); } catch { return block.props.text; } });
      const textAreaRef = useRef<HTMLTextAreaElement>(null);
      useEffect(() => { try { const decoded = decodeURIComponent(block.props.text); if (decoded !== inputValue) setInputValue(decoded); } catch { if (block.props.text !== inputValue) setInputValue(block.props.text); } }, [block.props.text]);
      useEffect(() => { if (isEditing && textAreaRef.current) textAreaRef.current.focus(); }, [isEditing]);
      useEffect(() => { if (!isEditing && divRef.current) { if (!inputValue) { divRef.current.innerText = "点击输入 LaTeX 公式..."; divRef.current.style.color = "#ccc"; } else { try { katex.render(inputValue, divRef.current, { throwOnError: false, displayMode: true, output: "html" }); divRef.current.style.color = "inherit"; } catch (e) { divRef.current.innerText = "⚠️ 公式错误"; } } } }, [inputValue, isEditing]);
      const handleSave = () => { editor.updateBlock(block, { props: { ...block.props, text: encodeURIComponent(inputValue) } }); setIsEditing(false); };
      return ( <div style={{ padding: "10px", margin: "5px 0", userSelect: "none" }}> {isEditing ? ( <div className="export-exclude no-print" style={{ display: "flex", flexDirection: "column", gap: "5px" }}> <textarea ref={textAreaRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); } if (e.key === "Escape") { setIsEditing(false); setInputValue(block.props.text); } }} onBlur={handleSave} placeholder="输入 LaTeX 公式..." style={{ width: "100%", minHeight: "80px", padding: "10px", fontFamily: "Consolas, Monaco, monospace", fontSize: "14px", borderRadius: "6px", border: "2px solid #1890ff", outline: "none", resize: "vertical", backgroundColor: "#f9f9f9" }} /> <div style={{fontSize: "12px", color: "#888"}}>按 Enter 保存</div> </div> ) : ( <div ref={divRef} onClick={() => setIsEditing(true)} style={{ minHeight: "40px", cursor: "pointer", padding: "10px", borderRadius: "6px", textAlign: "center" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.03)"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"} title="点击编辑公式" /> )} </div> );
    },
});
