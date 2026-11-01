import { useRef, useState } from "react";
import { createReactInlineContentSpec } from "@blocknote/react";
import MathPreview from "../components/MathPreview";
import { decodeMath } from "../utils/mathSyntax";

export const InlineMath = createReactInlineContentSpec({
  type: "inlineMath", propSchema: { text: { default: "" }, display: { default: false } }, content: "none",
}, {
  render: ({ inlineContent, updateInlineContent, editor }) => {
    const [draft, setDraft] = useState<string | null>(null);
    const cancelled = useRef(false);
    const text = decodeMath(inlineContent.props.text);
    const edit = () => { if (editor.isEditable) { cancelled.current = false; setDraft(text); } };
    const save = () => {
      if (!cancelled.current && draft !== null && draft !== text) updateInlineContent({ type: "inlineMath", props: { ...inlineContent.props, text: encodeURIComponent(draft) } });
      setDraft(null);
    };
    return <span contentEditable={false}>
      {draft === null ? <span role="button" tabIndex={0} title="双击编辑行内公式" onDoubleClick={edit}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); edit(); } }} style={{ cursor: editor.isEditable ? "pointer" : "text" }}>
        <MathPreview text={text} display={inlineContent.props.display} />
      </span> : <input autoFocus aria-label="编辑行内公式" value={draft} onChange={event => setDraft(event.target.value)}
        onBlur={save} onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") return;
          event.stopPropagation();
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; event.currentTarget.blur(); }
        }}
        style={{ fontFamily: "Consolas, monospace", width: Math.max(8, Math.min(60, draft.length + 2)) + "ch", padding: 4, border: "1px solid #1677ff" }} />}
    </span>;
  },
  toExternalHTML: ({ inlineContent }) => <span>{"\\(" + decodeMath(inlineContent.props.text) + "\\)"}</span>,
});
