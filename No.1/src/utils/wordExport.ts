import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  ExternalHyperlink, ImportedXmlComponent, HeadingLevel, AlignmentType,
  WidthType, TableLayoutType, LevelFormat, BorderStyle, FootnoteReferenceRun,
  VerticalAlign,
} from "docx";
import { latexToOfficeMath } from "./wordMath.ts";
import { decodeMarkdownEntities, decodeMath, excludedInlineMathRanges, mathSpans, protectInlineMath } from "./mathSyntax.ts";
import type { MathSpan } from "./mathSyntax.ts";
import { legacyMathParts } from "./legacyMath.ts";

export interface WordImage { data: Uint8Array; type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number; }
export interface WordExportOptions {
  title: string;
  image: (url: string) => Promise<WordImage>;
  diagram: (code: string) => Promise<WordImage>;
}

const WIDTH = 9360;
const font = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "宋体", cs: "Calibri" };
const spacing = { before: 0, after: 120, line: 300 };
const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
const sourceOf = (block: any) => decodeMath(block.props?.source || "");
const safeLink = (url: string) => {
  // Word must not contain javascript/data hyperlinks or application commands.
  if (/^(?:javascript|data|vbscript):/i.test(url.trim())) throw new Error("导出内容包含不安全的链接");
  return url;
};

export async function exportWord(blocks: any[], options: WordExportOptions): Promise<Uint8Array> {
  const numbering: any[] = [];
  const footnotes: Record<string, { children: Paragraph[] }> = {};
  const footnoteIds = new Map<string, number>();
  const definitions = new Map<string, any>();
  const footnoteDefinitions = new Map<string, any>();
  const mathTokens = new Map<string, MathSpan>();
  const rawTrees = new Map<string, any>();
  const [{ unified }, parse, gfm, frontmatter] = await Promise.all([import("unified"), import("remark-parse"), import("remark-gfm"), import("remark-frontmatter")]);
  const parser = unified().use(parse.default).use(gfm.default).use(frontmatter.default, ["yaml", "toml"]);
  function parseRaw(source: string) {
    if (rawTrees.has(source)) return rawTrees.get(source);
    const excluded = excludedInlineMathRanges(parser.parse(source), 0).sort((a, b) => a.start - b.start);
    const ast: any = parser.parse(protectInlineMath(source, mathTokens, excluded));
    const refs = (node: any) => {
      if (node.type === "definition") definitions.set(node.identifier, node);
      if (node.type === "footnoteDefinition") footnoteDefinitions.set(node.identifier, node);
      node.children?.forEach(refs);
    };
    refs(ast); rawTrees.set(source, ast); return ast;
  }
  const collectSources = (items: any[]) => items.forEach(block => {
    if (block.type === "rawMarkdown") parseRaw(sourceOf(block));
    collectSources(block.children || []);
  });
  collectSources(blocks);

  function math(tex: string, display = false): any {
    try {
      // ImportedXmlComponent parses a document wrapper; the first child is oMath.
      const imported = ImportedXmlComponent.fromXmlString(latexToOfficeMath(tex, display));
      return (imported as any).root[0];
    } catch (error) { throw new Error(`公式“${tex.slice(0, 60)}”无法导出为 Word 原生公式：${String(error)}`); }
  }
  const para = (children: any[], extra: any = {}) => new Paragraph({ children, spacing, ...extra });
  const equation = (tex: string) => para([math(tex, true)], { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 } });
  function text(value: string, styles: any = {}): TextRun {
    return new TextRun({ text: value, font: styles.code ? "Consolas" : font,
      bold: !!styles.bold, italics: !!styles.italic, strike: !!styles.strike,
      underline: styles.underline ? {} : undefined, size: styles.code ? 20 : undefined });
  }
  const numbered = (depth: number, start = 1, bullet = false) => {
    const reference = "list-" + numbering.length;
    numbering.push({ reference, levels: Array.from({ length: 9 }, (_, level) => ({
      level, start: level === depth ? start : 1,
      format: bullet ? LevelFormat.BULLET : LevelFormat.DECIMAL,
      text: bullet ? ["•", "◦", "▪"][level % 3] : `%${level + 1}.`,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540 + level * 360, hanging: 270 }, spacing: { before: 0, after: 80, line: 300 } }, run: { font, size: 22 } },
    })) });
    return { reference, level: Math.min(8, depth) };
  };
  function plainWithMath(value: string, styles: any = {}): any[] {
    let cursor = 0;
    const output: any[] = [];
    for (const span of mathSpans(value)) {
      if (span.start > cursor) output.push(text(value.slice(cursor, span.start), styles));
      output.push(math(span.tex, span.display)); cursor = span.end;
    }
    if (cursor < value.length) output.push(text(value.slice(cursor), styles));
    return output;
  }
  async function image(url: string, width?: number): Promise<ImageRun> {
    const item = await options.image(url);
    const w = Math.max(1, Math.min(624, width || item.width));
    return new ImageRun({ type: item.type, data: item.data, transformation: { width: w, height: Math.max(1, w * item.height / item.width) } });
  }
  async function inline(items: any): Promise<any[]> {
    if (typeof items === "string") return [text(items)];
    const result: any[] = [];
    for (const item of items || []) {
      if (item.type === "inlineMath") result.push(math(decodeMath(item.props.text), item.props.display));
      else if (item.type === "link") result.push(new ExternalHyperlink({ link: safeLink(item.href), children: await inline(item.content) }));
      else if (typeof item.text === "string") result.push(...item.text.split("\n").flatMap((line: string, index: number) => [ ...(index ? [new TextRun({ break: 1 })] : []), text(line, item.styles) ]));
      else throw new Error(`尚不能导出此行内模块：${item.type}`);
    }
    return result;
  }
  async function astInline(nodes: any[], styles: any = {}): Promise<any[]> {
    const result: any[] = [];
    for (const node of nodes) {
      if (node.type === "text") {
        for (const part of node.value.split(/(BNMATH[a-f0-9]{32})/g).filter(Boolean)) {
          const span = mathTokens.get(part);
          result.push(span ? math(span.tex, span.display) : text(decodeMarkdownEntities(part), styles));
        }
      } else if (["strong", "emphasis", "delete"].includes(node.type)) {
        result.push(...await astInline(node.children, { ...styles, [node.type === "strong" ? "bold" : node.type === "emphasis" ? "italic" : "strike"]: true }));
      } else if (node.type === "inlineCode") result.push(text(node.value, { ...styles, code: true }));
      else if (node.type === "break") result.push(new TextRun({ break: 1 }));
      else if (node.type === "image" || node.type === "imageReference") {
        const ref = node.type === "image" ? node : definitions.get(node.identifier);
        if (!ref) throw new Error(`找不到图片引用：${node.identifier}`);
        result.push(await image(ref.url));
      } else if (node.type === "link" || node.type === "linkReference") {
        const ref = node.type === "link" ? node : definitions.get(node.identifier);
        if (!ref) throw new Error(`找不到链接引用：${node.identifier}`);
        result.push(new ExternalHyperlink({ link: safeLink(ref.url), children: await astInline(node.children, styles) }));
      } else if (node.type === "footnoteReference") {
        if (!footnoteDefinitions.has(node.identifier)) throw new Error(`找不到脚注：${node.identifier}`);
        if (!footnoteIds.has(node.identifier)) footnoteIds.set(node.identifier, footnoteIds.size + 1);
        result.push(new FootnoteReferenceRun(footnoteIds.get(node.identifier)!));
      } else if (node.type === "html") result.push(text(node.value));
      else throw new Error(`尚不能导出的 Markdown 行内结构：${node.type}`);
    }
    return result;
  }
  function code(value: string): Paragraph[] {
    return value.replace(/\r\n?/g, "\n").split("\n").map(line => para([new TextRun({ text: line || " ", font: "Consolas", size: 19 })],
      { style: "CodeBlock", spacing: { before: 0, after: 0, line: 260 }, shading: { fill: "F3F5F7" }, indent: { left: 120, right: 120 } }));
  }
  function table(rows: Paragraph[][][], columnWidths?: number[], header = true): Table {
    const count = Math.max(1, ...rows.map(row => row.length));
    const sourceWidths = Array.from({ length: count }, (_, index) => columnWidths?.[index] || 1);
    const total = sourceWidths.reduce((sum, value) => sum + value, 0);
    const widths = sourceWidths.map(value => Math.floor(value / total * WIDTH));
    widths[widths.length - 1] += WIDTH - widths.reduce((sum, value) => sum + value, 0);
    return new Table({ width: { size: WIDTH, type: WidthType.DXA }, indent: { size: 120, type: WidthType.DXA },
      layout: TableLayoutType.FIXED, columnWidths: widths, margins: { top: 80, bottom: 80, left: 120, right: 120 },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: rows.map((row, index) => new TableRow({ tableHeader: header && index === 0,
        children: Array.from({ length: count }, (_, cell) => new TableCell({ width: { size: widths[cell], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: header && index === 0 ? { fill: "E8EEF5" } : undefined,
          children: row[cell] || [para([])],
        })),
      })),
    });
  }
  async function astBlocks(nodes: any[], depth = 0): Promise<any[]> {
    const out: any[] = [];
    for (const node of nodes) {
      if (["definition", "footnoteDefinition"].includes(node.type)) continue;
      if (node.type === "paragraph" || node.type === "heading") {
        const lone = node.children.length === 1 && node.children[0].type === "text" ? mathTokens.get(node.children[0].value) : null;
        out.push(lone?.display ? equation(lone.tex) : para(await astInline(node.children), node.type === "heading" ? { heading: headingLevels[Math.min(node.depth, 6) - 1] } : {}));
      } else if (node.type === "list") {
        const list = numbered(Math.min(depth, 8), node.start ?? 1, !node.ordered);
        for (const item of node.children) {
          const first = item.children[0];
          const checked = typeof item.checked === "boolean" ? [text(item.checked ? "☑ " : "☐ ")] : [];
          out.push(para([...checked, ...await astInline(first?.type === "paragraph" ? first.children : [])], { numbering: list }));
          out.push(...await astBlocks(item.children.slice(first?.type === "paragraph" ? 1 : 0), depth + 1));
        }
      } else if (node.type === "blockquote") {
        out.push(...await astBlocks(node.children, depth + 1));
      } else if (node.type === "code") {
        if (node.lang === "mermaid") out.push(await diagram(node.value));
        else out.push(...code(node.value));
      } else if (node.type === "table") {
        const rows = await Promise.all(node.children.map((row: any) => Promise.all(row.children.map(async (cell: any, index: number) =>
          [para(await astInline(cell.children), { alignment: node.align?.[index] || AlignmentType.LEFT })]))));
        out.push(table(rows));
      } else if (node.type === "thematicBreak") out.push(para([], { border: { bottom: border } }));
      else if (["yaml", "toml"].includes(node.type)) out.push(...code(node.value));
      else if (node.type === "html") out.push(...code(node.value));
      else throw new Error(`尚不能导出的 Markdown 结构：${node.type}`);
    }
    return out;
  }
  async function diagram(value: string): Promise<Paragraph> {
    const item = await options.diagram(value);
    const width = Math.min(item.width, 624);
    return para([new ImageRun({ type: item.type, data: item.data, transformation: { width, height: width * item.height / item.width } })]);
  }
  async function convert(items: any[], depth = 0): Promise<any[]> {
    const out: any[] = [];
    let list: ReturnType<typeof numbered> | undefined;
    let listType = "";
    for (const block of items) {
      const props = block.props || {};
      const isList = ["numberedListItem", "bulletListItem", "checkListItem"].includes(block.type);
      if (!isList) { list = undefined; listType = ""; }
      if (isList) {
        if (!list || listType !== block.type || props.start !== undefined) list = numbered(Math.min(depth, 8), props.start ?? 1, block.type !== "numberedListItem");
        listType = block.type;
        out.push(para([...(block.type === "checkListItem" ? [text(props.checked ? "☑ " : "☐ ")] : []), ...await inline(block.content)], { numbering: list }));
      } else if (block.type === "latex") out.push(equation(decodeMath(props.text)));
      else if (block.type === "paragraph" || block.type === "heading" || block.type === "callout" || block.type === "quote") {
        const children = await inline(block.content);
        if (block.type === "callout" && props.title) children.unshift(text(props.title + " — ", { bold: true }));
        out.push(para(children, {
          ...(block.type === "heading" ? { heading: headingLevels[Math.max(0, Math.min(5, (props.level || 1) - 1))] } : {}),
          ...(block.type === "callout" || block.type === "quote" ? { indent: { left: 240 } } : {}),
          alignment: props.textAlignment || AlignmentType.LEFT,
        }));
      } else if (block.type === "codeBlock") out.push(...code(decodeMath(props.text)));
      else if (block.type === "mermaid") out.push(await diagram(props.code || ""));
      else if (block.type === "image") out.push(para([await image(props.url, Number(props.width) || undefined)]));
      else if (block.type === "file" || block.type === "audio" || block.type === "video") out.push(para([new ExternalHyperlink({ link: safeLink(props.url || ""), children: [text(props.name || "附件")] })]));
      else if (block.type === "table") {
        const rows = await Promise.all(block.content.rows.map((row: any) => Promise.all(row.cells.map(async (cell: any) =>
          [para(await inline(Array.isArray(cell) ? cell : cell.content), { alignment: cell.props?.textAlignment || AlignmentType.LEFT })]))));
        out.push(table(rows, block.content.columnWidths));
      } else if (block.type === "rawMarkdown") out.push(...await astBlocks(parseRaw(sourceOf(block)).children, depth));
      else if (block.type === "legacyMath") {
        const parts = legacyMathParts(sourceOf(block));
        if (!parts) throw new Error("旧版公式的结构已改变，请检查原文后再导出");
        out.push(para([text("旧版公式：缺失的数学符号仍须依据原始版本核对。", { italic: true })]));
        parts.forEach(part => out.push(part.kind === "math" ? equation(part.text) : para(plainWithMath(part.text))));
      } else if (block.type === "divider") out.push(para([], { border: { bottom: border } }));
      else throw new Error(`尚不能导出此模块：${block.type}。已取消导出，避免遗漏内容。`);
      if (block.children?.length) out.push(...await convert(block.children, depth + 1));
    }
    return out;
  }
  const children = await convert(blocks);
  for (const [identifier, id] of footnoteIds) {
    footnotes[id] = { children: await astBlocks(footnoteDefinitions.get(identifier).children) };
  }
  const document = new Document({ title: options.title, creator: "No.1", description: "Markdown 笔记导出", numbering: { config: numbering }, footnotes,
    styles: {
      default: { document: { run: { font, size: 22, color: "202124" }, paragraph: { spacing } } },
      paragraphStyles: [
        ...headingLevels.map((_, index) => ({ id: `Heading${index + 1}`, name: `Heading ${index + 1}`, basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font, size: [32, 26, 24, 23, 22, 22][index], color: "000000", bold: true },
          paragraph: { spacing: { before: [360, 280, 200, 160, 120, 120][index], after: [200, 140, 100, 100, 80, 80][index] }, keepNext: true, outlineLevel: index } })),
        { id: "CodeBlock", name: "Code Block", basedOn: "Normal", run: { font: "Consolas", size: 19 }, paragraph: { spacing: { before: 0, after: 0, line: 260 } } },
      ],
    },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 } } }, children: children.length ? children : [para([])] }],
  });
  return new Uint8Array(await (await Packer.toBlob(document)).arrayBuffer());
}
