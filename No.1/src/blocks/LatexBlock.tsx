import { useState, useRef, useEffect } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { blockOwnText } from "../utils/blockText";
import MathPreview from "../components/MathPreview";
import { decodeMath } from "../utils/mathSyntax";

export const latexBlockSchema = {
    type: "latex" as const,
    propSchema: { ...defaultProps, text: { default: "" } },
    content: "none" as const,
};

export const LatexBlock = createReactBlockSpec(latexBlockSchema, {
    toExternalHTML: ({ block }) => <pre>{"$$\n" + blockOwnText(block) + "\n$$"}</pre>,
    render: ({ block, editor }) => {
      const [isEditing, setIsEditing] = useState(false);
      const [inputValue, setInputValue] = useState(() => decodeMath(block.props.text));
      const textAreaRef = useRef<HTMLTextAreaElement>(null);
      const cancelled = useRef(false);
      useEffect(() => { setInputValue(decodeMath(block.props.text)); }, [block.props.text]);
      useEffect(() => { if (isEditing && textAreaRef.current) textAreaRef.current.focus(); }, [isEditing]);
      const handleSave = () => {
        if (!cancelled.current && inputValue !== decodeMath(block.props.text)) editor.updateBlock(block, { props: { ...block.props, text: encodeURIComponent(inputValue) } });
        setIsEditing(false);
      };
      return <div contentEditable={false} style={{ padding: 10, margin: "5px 0" }}>
        {isEditing ? <div className="export-exclude no-print">
          <textarea ref={textAreaRef} aria-label="编辑独立公式" value={inputValue} onChange={event => setInputValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); }
              if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; setInputValue(decodeMath(block.props.text)); event.currentTarget.blur(); }
            }} onBlur={handleSave} placeholder="输入 LaTeX 公式..."
            style={{ width: "100%", minHeight: 80, padding: 10, fontFamily: "Consolas, monospace", fontSize: 14, borderRadius: 6, border: "2px solid #1890ff", boxSizing: "border-box" }} />
          <small>Enter 保存 · Shift+Enter 换行 · Esc 取消</small>
        </div> : <div title="点击编辑公式" role="button" tabIndex={0}
          onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
          onKeyDown={event => { if (event.key === "Enter" && editor.isEditable) { event.preventDefault(); cancelled.current = false; setIsEditing(true); } }}
          onClick={() => { if (editor.isEditable) { cancelled.current = false; setIsEditing(true); } }}
          style={{ minHeight: 40, cursor: editor.isEditable ? "pointer" : "text", textAlign: "center" }}>
          {inputValue ? <MathPreview text={inputValue} display /> : "点击输入 LaTeX 公式…"}
        </div>}
      </div>;
    },
});
