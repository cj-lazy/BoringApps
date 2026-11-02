type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const contentToPlainText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(contentToPlainText).join("");
  if (!isRecord(content)) return "";
  if (content.type === "noteLink" && isRecord(content.props)) return String(content.props.label || content.props.target || "");

  if (content.type === "inlineMath" && isRecord(content.props) && typeof content.props.text === "string") {
    try { return decodeURIComponent(content.props.text); } catch { return content.props.text; }
  }

  if (typeof content.text === "string") return content.text;

  if (content.type === "tableContent" && Array.isArray(content.rows)) {
    return content.rows
      .map((row) => {
        if (!isRecord(row) || !Array.isArray(row.cells)) return "";
        return row.cells.map(contentToPlainText).join("\t");
      })
      .join("\n");
  }

  return contentToPlainText(content.content);
};

export const blockOwnText = (block: unknown): string => {
  if (!isRecord(block)) return "";
  if (isRecord(block.props)) {
    if (block.type === "rawMarkdown" || block.type === "legacyMath" || block.type === "latex" || block.type === "codeBlock") {
      const value = block.type === "rawMarkdown" || block.type === "legacyMath" ? block.props.source : block.props.text;
      if (typeof value === "string") { try { return decodeURIComponent(value); } catch { return value; } }
    }
    if (block.type === "mermaid" && typeof block.props.code === "string") return block.props.code;
  }
  return contentToPlainText(block.content);
};

export const blockToPlainText = (block: unknown): string => {
  if (!isRecord(block)) return "";

  const ownText = blockOwnText(block);
  const childText = Array.isArray(block.children)
    ? block.children.map(blockToPlainText).filter(Boolean).join("\n")
    : "";

  return [ownText, childText].filter(Boolean).join("\n");
};

export const blocksToPlainText = (blocks: readonly unknown[]): string =>
  blocks.map(blockToPlainText).filter(Boolean).join("\n");
