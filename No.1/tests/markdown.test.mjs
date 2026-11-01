import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { blockToPlainText, blocksToPlainText } from "../src/utils/blockText.ts";
import { parseNote, serializeNote } from "../src/utils/markdownNote.ts";
import { replaceNoteDocument } from "../src/utils/installNote.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.DocumentFragment = dom.window.DocumentFragment;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const { BlockNoteEditor } = await import("@blocknote/core");
const editor = BlockNoteEditor.create();

test("real BlockNote tables are counted and searchable", async () => {
  const blocks = await parseNote(editor, "# 测试\r\n\r\n| 目标 | 无人机 |\r\n|---|---|\r\n| A-01 | 关联成功 |\r\n");
  const table = blocks.find(block => block.type === "table");
  assert.equal(table.content.type, "tableContent");
  assert.match(blockToPlainText(table), /关联成功/);
  assert.match(blocksToPlainText(blocks), /目标/);
  assert.doesNotThrow(() => blocksToPlainText(blocks).replace(/\s/g, "").length);
  const saved = await serializeNote(editor, blocks);
  const reloaded = await parseNote(editor, saved);
  assert.match(blocksToPlainText(reloaded), /A-01/);
  assert.equal(reloaded.filter(block => block.type === "table").length, 1);
});

test("text extraction handles links, table cells, nested lists and missing content", () => {
  const block = {
    content: { type: "tableContent", rows: [{ cells: [
      [{ type: "text", text: "普通格" }],
      { type: "tableCell", content: [{ type: "link", content: [{ text: "链接格" }] }] },
    ] }] },
    children: [{ content: [{ text: "子项" }] }],
  };
  assert.equal(blockToPlainText(block), "普通格\t链接格\n子项");
  for (const content of [undefined, null, {}, { type: "tableContent", rows: [null] }]) {
    assert.doesNotThrow(() => blockToPlainText({ content }));
  }
});

test("code indentation and full width survive both pane conversion rules", async () => {
  const fence = String.fromCharCode(96).repeat(3);
  const source = fence + "python|w=100%|h=300\r\n    print('hello')\r\n\r\n" + fence + "\r\n";
  const blocks = await parseNote(editor, source);
  const code = blocks.find(block => block.type === "codeBlock");
  assert.equal(code.props.width, "100%");
  assert.equal(decodeURIComponent(code.props.text), "    print('hello')\n");
  const saved = await serializeNote(editor, blocks);
  const reloaded = await parseNote(editor, saved);
  assert.equal(decodeURIComponent(reloaded[0].props.text), "    print('hello')\n");
});

for (const pendingRedo of [false, true]) test(`switching notes isolates ${pendingRedo ? "Redo" : "Undo"} history`, t => {
  const switchingEditor = BlockNoteEditor.create();
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  switchingEditor.mount(mount);
  t.after(() => { switchingEditor.unmount(); mount.remove(); });
  replaceNoteDocument(switchingEditor, [{ type: "paragraph", content: "First note" }]);
  switchingEditor.updateBlock(switchingEditor.document[0], { content: "Edited first note" });
  if (pendingRedo) assert.equal(switchingEditor.undo(), true);
  replaceNoteDocument(switchingEditor, [{ type: "paragraph", content: "Second note" }]);
  switchingEditor.redo();
  switchingEditor.undo();
  assert.equal(blocksToPlainText(switchingEditor.document), "Second note");
  switchingEditor.updateBlock(switchingEditor.document[0], { content: "Edited second note" });
  assert.equal(switchingEditor.undo(), true);
  assert.equal(blocksToPlainText(switchingEditor.document), "Second note");
});

test("lazy Mermaid still parses diagrams with strict security", async () => {
  const { getMermaid } = await import("../src/utils/mermaid.ts");
  const mermaid = await getMermaid();
  const result = await mermaid.parse("graph TD\n  A[输入] --> B[输出]");
  assert.equal(result.diagramType, "flowchart-v2");
  assert.equal(mermaid.mermaidAPI.getConfig().securityLevel, "strict");
});
