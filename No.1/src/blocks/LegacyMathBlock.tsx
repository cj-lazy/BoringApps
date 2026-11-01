import { useMemo, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import MathPreview from "../components/MathPreview";
import { legacyMathParts } from "../utils/legacyMath";
import { decodeMath, mathSpans } from "../utils/mathSyntax";

function TextWithMath({ text }: { text: string }) {
  const spans = mathSpans(text);
  let cursor = 0;
  const parts = spans.flatMap((span, index) => {
    const before = text.slice(cursor, span.start);
    cursor = span.end;
    return [before, <MathPreview key={index} text={span.tex} display={span.display} />];
  });
  return <div style={{ whiteSpace: "pre-wrap" }}>{parts}{text.slice(cursor)}</div>;
}

// Keep the whole historical source as the editable value. A compatibility
// preview must never silently migrate or invent the user's mathematical data.
export const LegacyMathBlock = createReactBlockSpec({
  type: "legacyMath",
  propSchema: { source: { default: "" } },
  content: "none",
}, {
  render: ({ block, editor }) => {
    const source = decodeMath(block.props.source);
    const parts = useMemo(() => legacyMathParts(source), [source]);
    const [showSource, setShowSource] = useState(false);
    return <div contentEditable={false} style={{ padding: 10, margin: "8px 0", minWidth: 0, width: "100%" }}>
      <div className="no-print export-exclude" style={{ fontSize: 12, color: "#896020", marginBottom: 10 }}>
        旧版公式兼容预览 · 已拆分占位符与换行；原文未自动改写，缺失的符号仍需核对。
        <button type="button" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
          onClick={() => setShowSource(value => !value)} style={{ marginLeft: 8 }}>
          {showSource ? "返回公式预览" : "查看/编辑旧版原文"}
        </button>
      </div>
      {showSource && <textarea className="no-print export-exclude" aria-label="旧版公式原文" value={source}
        readOnly={!editor.isEditable} spellCheck={false} rows={16}
        onChange={event => editor.updateBlock(block, { props: { source: encodeURIComponent(event.target.value) } })}
        style={{ width: "100%", boxSizing: "border-box", fontFamily: "Consolas, monospace", lineHeight: 1.6 }} />}
      <div data-legacy-math-preview="true">
        {parts ? parts.map((part, index) => <div key={index} style={{ margin: "16px 0" }}>
          {part.kind === "math" ? <MathPreview text={part.text} display /> : <TextWithMath text={part.text} />}
        </div>) : <pre style={{ whiteSpace: "pre-wrap" }}>{source}</pre>}
      </div>
    </div>;
  },
  toExternalHTML: ({ block }) => <pre>{decodeMath(block.props.source)}</pre>,
});
