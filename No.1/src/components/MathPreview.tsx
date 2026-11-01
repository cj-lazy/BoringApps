import { useMemo } from "react";
import katex from "katex";

export default function MathPreview({ text, display = false }: { text: string; display?: boolean }) {
  const result = useMemo(() => {
    try {
      return { html: katex.renderToString(text, { displayMode: display, throwOnError: true,
        trust: false, strict: "ignore", maxExpand: 1000, maxSize: 20, output: "htmlAndMathml" }) };
    } catch (error) { return { error: String(error) }; }
  }, [text, display]);
  return result.html
    ? <span data-math-preview="true" style={{ display: display ? "block" : "inline", overflowX: display ? "auto" : undefined }} dangerouslySetInnerHTML={{ __html: result.html }} />
    : <span className="math-preview-error" title={result.error} style={{ color: "#b54708", whiteSpace: "pre-wrap" }}>公式语法待修正：{text}</span>;
}
