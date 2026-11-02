import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import JSZip from "jszip";
import { exportWord } from "../src/utils/wordExport.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Element = dom.window.Element;

const text = value => [{ type: "text", text: value, styles: {} }];
const formula = value => ({ type: "inlineMath", props: { text: encodeURIComponent(value), display: false } });
const noImage = async () => assert.fail("unexpected image request");

test("Word research template creates A4 styles, heading numbering, captions, fields and visual footnotes",async()=>{
  const {wordPresets}=await import("../src/utils/wordLayout.ts");
  const blocks=[{type:"heading",props:{level:1},content:text("报告标题")},{type:"heading",props:{level:2},content:text("研究方法")},{type:"paragraph",content:[...text("有脚注"),{type:"footnoteRef",props:{identifier:"a"}}]},{type:"footnote",props:{identifier:"a"},content:text("脚注正文"),children:[]},{type:"latex",props:{text:encodeURIComponent("x=1")}},{type:"image",props:{url:"fixture",name:"实验装置"}},{type:"noteAnchor",props:{identifier:"ref-123"}}];
  const bytes=await exportWord(blocks,{title:"模板验收",layout:wordPresets["学术报告"],image:async()=>({data:Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=","base64")),type:"png",width:1,height:1}),diagram:noImage});
  const zip=await JSZip.loadAsync(bytes),xml=await zip.file("word/document.xml").async("string"),styles=await zip.file("word/styles.xml").async("string"),footnotes=await zip.file("word/footnotes.xml").async("string");
  assert.match(xml,/w:w="11906"/);assert.match(xml,/w:h="16838"/);assert.match(styles,/Times New Roman/);assert.match(styles,/w:line="360"/);assert.match(styles,/w:sz w:val="24"/);assert.match(xml,/SEQ Figure/);assert.match(xml,/SEQ Equation/);assert.match(xml,/实验装置/);assert.match(xml,/w:numPr/);assert.match(footnotes,/脚注正文/);assert.ok(!xml.includes("ref-123"));assert.match(await zip.file("word/header1.xml").async("string"),/模板验收/);assert.match(await zip.file("word/footer1.xml").async("string"),/PAGE/);
});

test("Word export uses native Office equations and structural Word content", async () => {
  const blocks = [
    { type: "heading", props: { level: 1 }, content: text("测试标题"), children: [] },
    { type: "paragraph", props: {}, content: [{ type: "text", text: "行内 ", styles: {} }, formula("x_i^2"), { type: "text", text: " 公式", styles: {} }], children: [] },
    { type: "latex", props: { text: encodeURIComponent(String.raw`\frac{a_1}{b^2}=\sqrt{x}`) }, children: [] },
    { type: "latex", props: { text: encodeURIComponent(String.raw`\begin{bmatrix}1&2\\3&4\end{bmatrix}`) }, children: [] },
    { type: "numberedListItem", props: {}, content: text("第一项"), children: [] },
    { type: "numberedListItem", props: {}, content: text("第二项"), children: [] },
    { type: "codeBlock", props: { text: encodeURIComponent("int main() {\n  return 0;\n}"), language: "cpp" }, children: [] },
    { type: "table", content: { rows: [
      { cells: [[{ type: "text", text: "列一", styles: {} }], [{ type: "text", text: "列二", styles: {} }]] },
      { cells: [[formula("t_1")], [{ type: "text", text: "值", styles: {} }]] },
    ], columnWidths: [200, 400] }, props: {}, children: [] },
  ];
  const bytes = await exportWord(blocks, { title: "原生公式验收", image: noImage, diagram: noImage });
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml").async("string");
  const numberingXml = await zip.file("word/numbering.xml").async("string");
  const stylesXml = await zip.file("word/styles.xml").async("string");
  assert.equal(documentXml.includes("$$"), false);
  assert.equal(zip.file("word/afchunk.mht"), null);
  assert.match(documentXml, /<m:oMath[ >]/);
  assert.ok((documentXml.match(/<m:oMath[ >]/g) || []).length >= 4);
  assert.match(documentXml, /<m:f>/);
  assert.match(documentXml, /<m:rad>/);
  assert.match(documentXml, /<m:sSub>/);
  assert.match(documentXml, /<m:sSup>/);
  assert.match(documentXml, /<m:m>/);
  assert.match(documentXml, /<m:d>/);
  assert.doesNotMatch(documentXml, /```|language-cpp/);
  assert.match(documentXml, /int main\(\)/);
  assert.match(documentXml, /<w:tbl>/);
  assert.match(documentXml, /<w:vAlign w:val="center"\/>/);
  assert.doesNotMatch(documentXml, /<w:drawing>/);
  assert.match(numberingXml, /w:numFmt w:val="decimal"/);
  assert.match(stylesXml, /w:styleId="Heading1"/);
  assert.match(stylesXml, /w:styleId="Heading1"[\s\S]*?<w:color w:val="000000"\/>/);
  assert.match(documentXml, /w:tblBorders[\s\S]*?w:color="D9D9D9"/);
});

test("unsupported formula layout cancels instead of falling back to image or source", async () => {
  const blocks = [{ type: "latex", props: { text: encodeURIComponent(String.raw`\raisebox{1em}{x}`) }, children: [] }];
  await assert.rejects(() => exportWord(blocks, { title: "失败保护", image: noImage, diagram: noImage }), /无法导出为 Word 原生公式|不支持/);
});

test("empty notes export as a valid blank Word document", async () => {
  const bytes = await exportWord([{ type: "paragraph", props: {}, content: [], children: [] }], { title: "空白", image: noImage, diagram: noImage });
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("word/document.xml"));
});
