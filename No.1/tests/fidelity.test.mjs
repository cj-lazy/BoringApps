import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { parseNote, serializeNote } from "../src/utils/markdownNote.ts";
import { replaceNoteDocument } from "../src/utils/installNote.ts";
import { DocumentIndex } from "../src/utils/documentIndex.ts";
import { readFile } from "node:fs/promises";
import katex from "katex";
import { mathSpans } from "../src/utils/mathSyntax.ts";
import { legacyMathParts } from "../src/utils/legacyMath.ts";
import { latexToOfficeMath } from "../src/utils/wordMath.ts";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const key of ["window", "document", "DOMParser", "Element", "HTMLElement", "Node", "DocumentFragment"]) globalThis[key] = key === "window" ? dom.window : dom.window[key];
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs, createBlockSpec, defaultInlineContentSpecs, createInlineContentSpec } = await import("@blocknote/core");
const custom = (type, propSchema) => createBlockSpec({ type, propSchema, content: "none" }, { render: () => ({ dom: document.createElement("div") }) })();
const schema = BlockNoteSchema.create({ inlineContentSpecs: { ...defaultInlineContentSpecs,
  inlineMath: createInlineContentSpec({ type: "inlineMath", propSchema: { text: { default: "" }, display: { default: false } }, content: "none" }, { render: () => ({ dom: document.createElement("span") }) }),
}, blockSpecs: { ...defaultBlockSpecs,
  rawMarkdown: custom("rawMarkdown", { source: { default: "" } }),
  legacyMath: custom("legacyMath", { source: { default: "" } }),
  codeBlock: custom("codeBlock", { text: { default: "" }, language: { default: "text" }, width: { default: "100%" }, height: { default: 300 } }),
  latex: custom("latex", { text: { default: "" } }),
  mermaid: custom("mermaid", { code: { default: "" }, width: { default: 500 }, height: { default: 300 } }),
}});
const editor = BlockNoteEditor.create({ schema });
const allMath = value => {
  if (!value || typeof value !== "object") return [];
  if (value.type === "latex" || value.type === "inlineMath") return [value];
  return Object.values(value).flatMap(allMath);
};
const fence = String.fromCharCode(96);
const examples = [
  "\uFEFF---\r\ntitle: 测试\r\ncustom: [1, 2]\r\n---\r\n\r\n# 标题\r\n\r\n保留  两个空格。\r\n",
  "+++ \ntitle = 'TOML'\n+++\n\n## title\n",
  "> 引用\n>\n> - 第一层\n>   - 第二层 $a_b$\n\n尾段\n",
  "前面 $x_i^2$ 和 $$y$$ 后面。\n\n$$\n\\begin{aligned}x &= y \\\\\nz &= 2\\end{aligned}\n$$\n",
  fence.repeat(4) + "markdown\n" + fence.repeat(3) + "js\n  code()\n" + fence.repeat(3) + "\n" + fence.repeat(4) + "\n\n~~~python meta info\n  a = 1\n~~~\n",
  "![含括号](images/a(b).png \"图片标题\")\n\n[a][ref]\n\n[ref]: https://example.com/a_(b) \"title\"\n\n[^foot]: 注释\n\n脚注[^foot]\n",
  "<div onclick=\"bad()\"><script>alert(1)</script>HTML 原文</div>\n\n<!-- secret format -->\n",
  "| 一 | 二 |\n|:---|---:|\n| *格式* | [链接](https://example.com) |\n\n1. a\n2. b\n",
  "\n\n\n",
];
for (const [index, source] of examples.entries()) test("exact Markdown roundtrip fixture " + index, async () => {
  const blocks = await parseNote(editor, source);
  assert.equal(await serializeNote(editor, blocks), source);
  replaceNoteDocument(editor, blocks);
  assert.equal(await serializeNote(editor, structuredClone(editor.document)), source);
});
test("editing a heading preserves complex sibling source byte for byte", async () => {
  const preserved = "\r\n\r\n行内 $a_b$ 保持原样。\r\n\r\n> - 引用列表\r\n>   - 子项\r\n\r\n![a](x(y).png \"title\")\r\n";
  const blocks = await parseNote(editor, "# 原标题" + preserved);
  replaceNoteDocument(editor, blocks);
  editor.updateBlock(editor.document[0], { content: "新标题" });
  const saved = await serializeNote(editor, structuredClone(editor.document));
  assert.match(saved, /新标题/);
  assert.ok(saved.endsWith(preserved), saved);
});
test("a failed parse elsewhere does not replace the installed source mapping", async () => {
  const source = "# 标题\r\n\r\n原始文本  空格\r\n";
  replaceNoteDocument(editor, await parseNote(editor, source));
  await parseNote(editor, "# 未安装的其他笔记");
  assert.equal(await serializeNote(editor, structuredClone(editor.document)), source);
});
test("literal old placeholders and reference syntax are never confused with injected markers", async () => {
  const source = "@@CODE_BLOCK_ID_0@@\n\n![引用图片][img]\n\n[img]: local(a).png\n";
  assert.equal(await serializeNote(editor, await parseNote(editor, source)), source);
});
test("updated code containing triple backticks gets a longer valid fence", async () => {
  const blocks = await parseNote(editor, fence.repeat(3) + "text\nold\n" + fence.repeat(3));
  blocks[0].props.text = encodeURIComponent("code\n" + fence.repeat(3) + "\nmore");
  const saved = await serializeNote(editor, blocks);
  assert.ok(saved.startsWith(fence.repeat(4)));
  const reopened = await parseNote(editor, saved);
  assert.equal(decodeURIComponent(reopened[0].props.text), "code\n" + fence.repeat(3) + "\nmore");
});
test("incremental index only extracts changed text in a 10,000-block document", () => {
  const index = new DocumentIndex();
  const blocks = Array.from({ length: 10000 }, (_, id) => ({ id: String(id), type: "paragraph", content: [{ text: "原文" }] }));
  index.reset(blocks);
  assert.equal(index.characters, 20000);
  const before = index.textRecomputations;
  const edited = { ...blocks[5000], content: [{ text: "修改之后" }] };
  index.apply([{ type: "update", block: edited }], () => assert.fail("full traversal"));
  assert.equal(index.textRecomputations - before, 1);
  assert.equal(index.characters, 20002);
  assert.deepEqual(index.search("修改"), [{ blockId: "5000", text: "修改之后" }]);
});
test("index counts nested blocks once and removes nested content on deletion", () => {
  const index = new DocumentIndex();
  const block = { id: "parent", content: [{ text: "父" }], children: [{ id: "child", content: [{ text: "子" }] }] };
  index.reset([block]);
  assert.equal(index.characters, 2);
  index.apply([{ type: "delete", block }], () => []);
  assert.equal(index.characters, 0);
  assert.deepEqual(index.search("子"), []);
});

test("index reconciles a child moved out of a deleted subtree", () => {
  const index = new DocumentIndex();
  const child = { id: "child", content: [{ text: "保留" }] };
  const parent = { id: "parent", content: [{ text: "删除" }], children: [child] };
  index.reset([parent]);
  index.apply([{ type: "delete", block: parent }, { type: "move", block: child }], () => [child]);
  assert.equal(index.characters, 2);
  assert.deepEqual(index.search("保留"), [{ blockId: "child", text: "保留" }]);
});

test("editing the first block retains the UTF-8 BOM", async () => {
  replaceNoteDocument(editor, await parseNote(editor, "\uFEFF# 原标题\r\n\r\n尾段\r\n"));
  editor.updateBlock(editor.document[0], { content: "新标题" });
  const saved = await serializeNote(editor, structuredClone(editor.document));
  assert.ok(saved.startsWith("\uFEFF# 新标题"));
  assert.ok(saved.endsWith("\r\n\r\n尾段\r\n"));
});

test("custom blocks nested two levels deep do not lose source on save", async () => {
  const adapter = { blocksToMarkdownLossy: async () => "- item" };
  const text = await serializeNote(adapter, [{ type: "bulletListItem", content: [], children: [
    { type: "bulletListItem", content: [], children: [{ type: "latex", props: { text: encodeURIComponent("a_b+中文") } }] },
  ] }]);
  assert.ok(text.includes("a_b+中文"));
  assert.ok(!text.includes("%E4"));
});

if (process.env.QA_MARKDOWN) test("the technical Markdown sample roundtrips byte for byte without disk writes", async () => {
  const original = await readFile(process.env.QA_MARKDOWN);
  replaceNoteDocument(editor, await parseNote(editor, original.toString("utf8")));
  const serialized = Buffer.from(await serializeNote(editor, structuredClone(editor.document)), "utf8");
  assert.deepEqual(serialized, original);
  assert.deepEqual(await readFile(process.env.QA_MARKDOWN), original);
  const formulas = allMath(editor.document);
  assert.ok(formulas.filter(block => block.type === "latex").length >= 30);
  assert.ok(formulas.filter(block => block.type === "inlineMath").length >= 30);
  for (const formula of formulas) {
    const source = decodeURIComponent(formula.props.text);
    assert.doesNotThrow(() => katex.renderToString(source, { throwOnError: true, trust: false, strict: "ignore" }));
    assert.doesNotThrow(() => latexToOfficeMath(source, formula.type === "latex"), source);
  }
});

test("standard bracket display and parenthesized inline math render as math while source stays exact", async () => {
  const source = String.raw`时刻 \(t\) 的无人机系统表示为：

\[
\mathcal G_t=(\mathcal V_t,\mathcal E_t)
\]
`;
  const blocks = await parseNote(editor, source);
  assert.equal(blocks[1].type, "latex");
  assert.equal(decodeURIComponent(blocks[1].props.text), String.raw`\mathcal G_t=(\mathcal V_t,\mathcal E_t)`);
  assert.equal(allMath(blocks[0])[0].type, "inlineMath");
  replaceNoteDocument(editor, blocks);
  assert.equal(await serializeNote(editor, structuredClone(editor.document)), source);
});

test("the user's escaped HTML-space formula is repaired for display, not on disk", async () => {
  const source = String.raw`[\
&#x20;\mathcal G\_t=(\mathcal V\_t,\mathcal E\_t)\
&#x20;]`;
  const blocks = await parseNote(editor, source);
  assert.equal(blocks[0].type, "latex");
  assert.equal(decodeURIComponent(blocks[0].props.text), String.raw`\mathcal G_t=(\mathcal V_t,\mathcal E_t)`);
  replaceNoteDocument(editor, blocks);
  assert.equal(await serializeNote(editor, structuredClone(editor.document)), source);
  const mixed = await parseNote(editor, "系统表示为：\n" + source + "，其中是通信图。");
  assert.equal(allMath(mixed).length, 1);
  assert.equal(allMath(mixed)[0].props.display, true);
});

test("Markdown character references display as characters while source stays exact", async () => {
  const source = "test&#x20;after &amp; done\n";
  const blocks = await parseNote(editor, source);
  assert.equal(blocks[0].content.map(item => item.text || "").join(""), "test after & done");
  replaceNoteDocument(editor, blocks);
  assert.equal(await serializeNote(editor, structuredClone(editor.document)), source);
});

test("valid literal underscores, matrix row breaks and blank lines are not repaired away", async () => {
  const tex = String.raw`\begin{bmatrix}
1&0\\

0&1
\end{bmatrix}\quad UAV\_UUID`;
  const blocks = await parseNote(editor, "\\[\n" + tex + "\n\\]");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "latex");
  assert.equal(decodeURIComponent(blocks[0].props.text), tex);
  assert.doesNotThrow(() => katex.renderToString(tex, { throwOnError: true }));
});

test("inline math survives editing surrounding prose and reopening", async () => {
  replaceNoteDocument(editor, await parseNote(editor, String.raw`时刻 \(t\)，**距离 $x_i^2$**。`));
  editor.updateBlock(editor.document[0], { content: [{ type: "text", text: "修改：", styles: {} }, ...editor.document[0].content] });
  const saved = await serializeNote(editor, structuredClone(editor.document));
  assert.ok(saved.includes(String.raw`\(t\)`) && saved.includes(String.raw`\(x_i^2\)`), saved);
  const reopened = await parseNote(editor, saved);
  assert.deepEqual(allMath(reopened).map(block => decodeURIComponent(block.props.text)), ["t", "x_i^2"]);
});

test("table cell math keeps table structure and remains searchable", async () => {
  const blocks = await parseNote(editor, String.raw`| 状态 | 模型 |
|---|---|
| 当前 | \(x_t\) |
`);
  assert.equal(blocks[0].type, "table");
  replaceNoteDocument(editor, blocks);
  const table = structuredClone(editor.document[0]);
  const math = allMath(table)[0]; math.props.text = encodeURIComponent("x_{t+1}");
  const saved = await serializeNote(editor, [table]);
  const reopened = await parseNote(editor, saved);
  assert.equal(reopened[0].content.rows.length, 2);
  assert.equal(reopened[0].content.rows[1].cells.length, 2);
  assert.equal(decodeURIComponent(allMath(reopened)[0].props.text), "x_{t+1}");
  const index = new DocumentIndex(); index.reset(reopened);
  assert.equal(index.search("x_{t+1}").length, 1);
});

test("literal escaped delimiters, code, HTML and currency are not turned into formulas", async () => {
  assert.equal(mathSpans("代码 " + fence + String.raw`\(t\)` + fence + " 和价格 $5 与 $10").length, 0);
  assert.equal(mathSpans(String.raw`\\(不是公式\\) 和 \$金额`).length, 0);
  const source = "~~~text\n\\[\nx_t\n\\]\n~~~\n\n<script>\n\\[\nx_t\n\\]\n</script>";
  assert.equal(allMath(await parseNote(editor, source)).length, 0);
  const link = await parseNote(editor, String.raw`[链接](https://example.com/a\(b\))`);
  assert.equal(allMath(link).length, 0);
});

test("numbered lists resume after a formula and keep their start when edited and reopened", async () => {
  const source = String.raw`### 5.3 匹配求解

1. 步骤一
2. 步骤二 \(a_i\)
3. 转换为公式：

\[
s_i=\exp(-c_i)
\]

4. 步骤四
5. 步骤五
6. 步骤六
7. 输出 \(P\)。
`;
  replaceNoteDocument(editor, await parseNote(editor, source));
  assert.equal(editor.document.some(block => block.type === "rawMarkdown"), false);
  const lists = editor.document.filter(block => block.type === "numberedListItem");
  assert.equal(lists.length, 7);
  assert.equal(lists[3].props.start, 4);
  assert.equal(await serializeNote(editor, structuredClone(editor.document)), source);
  editor.updateBlock(lists[3], { content: "修改步骤四" });
  const saved = await serializeNote(editor, structuredClone(editor.document));
  assert.match(saved, /^4\. 修改步骤四/m);
  assert.ok(saved.startsWith(source.slice(0, source.indexOf("4. 步骤四"))));
  const reopened = await parseNote(editor, saved);
  assert.equal(reopened.filter(block => block.type === "numberedListItem")[3].props.start, 4);
  assert.equal(reopened.filter(block => block.type === "numberedListItem").length, 7);
});

const legacyLines = ["$$", "x_1=1", "", "@@LATEX_ID_0@@", "",
  String.raw`\begin{aligned}`, "", "a &= b", "", "c &= d", "", String.raw`\end{aligned}`, "",
  "@@LATEX_ID_1@@", "", "说明：$t$", "", "$$", "", "z_1=3", "", "$$"];
const legacySource = legacyLines.map((line, index) => index === 0 || index === legacyLines.length - 1 ? line : line + "\\").join("\n");

test("old leaked placeholders preview as separate formulas without rewriting any source", async () => {
  replaceNoteDocument(editor, await parseNote(editor, "# 标题\r\n\r\n" + legacySource));
  const legacy = editor.document.find(block => block.type === "legacyMath");
  assert.ok(legacy);
  const parts = legacyMathParts(decodeURIComponent(legacy.props.source));
  assert.equal(parts.filter(part => part.kind === "math").length, 3);
  assert.ok(parts.some(part => part.kind === "text" && part.text.includes("说明：$t$")));
  assert.match(parts[1].text, /b \\\\\nc/);
  for (const part of parts.filter(part => part.kind === "math")) assert.doesNotThrow(() => katex.renderToString(part.text, { throwOnError: true }));
  assert.equal(await serializeNote(editor, structuredClone(editor.document)), "# 标题\r\n\r\n" + legacySource);
  editor.updateBlock(editor.document[0], { content: "改标题" });
  assert.ok((await serializeNote(editor, structuredClone(editor.document))).endsWith("\r\n\r\n" + legacySource));
  const index = new DocumentIndex(); index.reset(editor.document);
  assert.equal(index.search("x_1=1").length, 1);
});

test("legacy compatibility never guesses subscripts or treats code as damaged math", async () => {
  assert.equal(legacyMathParts(String.raw`\text{@@LATEX_ID_0@@}`), undefined);
  assert.equal(legacyMathParts("@@LATEX_ID_0@@\n@@LATEX_ID_1@@"), undefined);
  const parts = legacyMathParts(legacySource.replace("x_1=1", String.raw`mathbf{x}*{i}=a\_b`));
  assert.equal(parts[0].text, String.raw`mathbf{x}*{i}=a\_b`);
  const blocks = await parseNote(editor, ticksForTest(legacySource));
  assert.equal(blocks[0].type, "codeBlock");
  assert.equal(await serializeNote(editor, blocks), ticksForTest(legacySource));
});
function ticksForTest(source) { return "~~~text\n" + source + "\n~~~"; }

test("explicit legacy-source edits save verbatim and reopen in compatibility mode", async () => {
  const source = "# 标题\n\n" + legacySource + "\n\n尾段\n";
  replaceNoteDocument(editor, await parseNote(editor, source));
  const block = editor.document.find(block => block.type === "legacyMath");
  editor.updateBlock(block, { props: { source: encodeURIComponent(decodeURIComponent(block.props.source).replace("x_1=1", "x_1=2")) } });
  const saved = await serializeNote(editor, structuredClone(editor.document));
  assert.equal(saved, source.replace("x_1=1", "x_1=2"));
  const reopened = await parseNote(editor, saved);
  assert.equal(reopened.filter(block => block.type === "legacyMath").length, 1);
  assert.equal(legacyMathParts(decodeURIComponent(reopened.find(block => block.type === "legacyMath").props.source))[0].text, "x_1=2");
});

test("zero-based lists stay in source rather than being silently renumbered", async () => {
  const source = "0. 零\n1. 一\n";
  const blocks = await parseNote(editor, source);
  assert.equal(blocks[0].type, "rawMarkdown");
  assert.equal(await serializeNote(editor, blocks), source);
});

test("adjacent display and inline dollar formulas stay separate in long paragraphs", async () => {
  const source = String.raw`说明 $$x_1=1$$$$y_1=2$$$z_1=3$，后文 \(t\)。`;
  const blocks = await parseNote(editor, source);
  assert.deepEqual(allMath(blocks).map(block => decodeURIComponent(block.props.text)), ["x_1=1", "y_1=2", "z_1=3", "t"]);
  assert.equal(await serializeNote(editor, blocks), source);
});

if (process.env.QA_LEGACY_MARKDOWN) test("the old-format sample previews formulas and roundtrips without disk writes", async () => {
  const original = await readFile(process.env.QA_LEGACY_MARKDOWN);
  replaceNoteDocument(editor, await parseNote(editor, original.toString("utf8")));
  const legacy = editor.document.filter(block => block.type === "legacyMath");
  assert.equal(legacy.length, 1);
  const parts = legacyMathParts(decodeURIComponent(legacy[0].props.source));
  const formulas = parts.filter(part => part.kind === "math");
  assert.equal(formulas.length, 53);
  for (const part of formulas) {
    assert.doesNotThrow(() => katex.renderToString(part.text, { throwOnError: true, trust: false, strict: "ignore" }));
    assert.doesNotThrow(() => latexToOfficeMath(part.text, true), part.text);
  }
  assert.ok(allMath(editor.document).length >= 80);
  for (const formula of allMath(editor.document)) {
    const source = decodeURIComponent(formula.props.text);
    assert.doesNotThrow(() => katex.renderToString(source, { throwOnError: true, trust: false, strict: "ignore" }));
    assert.doesNotThrow(() => latexToOfficeMath(source, formula.type === "latex"), source);
  }
  assert.deepEqual(Buffer.from(await serializeNote(editor, structuredClone(editor.document)), "utf8"), original);
  assert.deepEqual(await readFile(process.env.QA_LEGACY_MARKDOWN), original);
});
