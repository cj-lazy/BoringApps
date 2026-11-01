import { createReactBlockSpec } from "@blocknote/react";

const decode = (source: string) => { try { return decodeURIComponent(source); } catch { return source; } };

export const RawMarkdownBlock = createReactBlockSpec({
  type: "rawMarkdown",
  propSchema: { source: { default: "" } },
  content: "none",
}, {
  render: ({ block, editor }) => (
    <div style={{ border: "1px solid #d9e2ec", borderRadius: 6, padding: 10, margin: "8px 0" }}>
      <div className="no-print export-exclude" style={{ fontSize: 11, color: "#667788", marginBottom: 6 }}>
        Markdown 原文块 · 保留复杂公式、嵌套结构及特殊语法
      </div>
      <pre className="raw-markdown-print" style={{ display: "none", whiteSpace: "pre-wrap" }}>{decode(block.props.source)}</pre>
      <textarea className="no-print" aria-label="Markdown 原文块" value={decode(block.props.source)}
        readOnly={!editor.isEditable} spellCheck={false}
        onChange={event => editor.updateBlock(block, { props: { source: encodeURIComponent(event.target.value) } })}
        rows={Math.min(16, Math.max(2, decode(block.props.source).split("\n").length))}
        style={{ width: "100%", border: 0, outline: "none", resize: "vertical", fontFamily: "Consolas, monospace", fontSize: 13, lineHeight: 1.6, background: "transparent" }} />
    </div>
  ),
  toExternalHTML: ({ block }) => <pre>{decode(block.props.source)}</pre>,
});
