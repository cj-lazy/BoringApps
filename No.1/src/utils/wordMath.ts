import katex from "katex";

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (name: string, body: string) => `<m:${name}>${body}</m:${name}>`;
const prop = (name: string, value: string) => `<m:${name} m:val="${xml(value)}"/>`;

// Convert KaTeX's parsed MathML tree into Office Math, not an image or a text
// approximation. Unsupported constructs fail the export rather than disappear.
export function latexToOfficeMath(tex: string, display = false): string {
  const mathml = katex.renderToString(tex, { output: "mathml", displayMode: display,
    throwOnError: true, trust: false, strict: "ignore", maxExpand: 1000, maxSize: 20 });
  const doc = new DOMParser().parseFromString(mathml, "text/html");
  const math = doc.querySelector("math");
  if (!math) throw new Error("无法解析公式");
  return `<m:oMath xmlns:m="${MATH_NS}" xmlns:w="${WORD_NS}">${convert(math)}</m:oMath>`;
}

function run(text: string, variant?: string, normal = false): string {
  const script = variant?.includes("double-struck") ? "double-struck" : variant?.includes("script") ? "script"
    : variant?.includes("fraktur") ? "fraktur" : variant?.includes("sans-serif") ? "sans-serif"
    : variant === "monospace" ? "monospace" : "roman";
  const style = variant?.includes("bold") ? (variant.includes("italic") ? "bi" : "b")
    : variant === "normal" || normal ? "p" : variant?.includes("italic") ? "i" : undefined;
  return tag("r", tag("rPr", (normal ? "<m:nor/>" : "") + prop("scr", script) + (style ? prop("sty", style) : ""))
    + '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:eastAsia="宋体"/></w:rPr>'
    + `<m:t xml:space="preserve">${xml(text)}</m:t>`);
}

function convert(node: Element, inheritedVariant?: string): string {
  const name = node.localName;
  const children = Array.from(node.children);
  const variant = node.getAttribute("mathvariant") || inheritedVariant;
  const all = () => children.map(child => convert(child, variant)).join("");
  const child = (index: number) => children[index] ? convert(children[index], variant) : "";
  const arg = (name: string, index: number) => tag(name, child(index));
  const text = node.textContent || "";
  if (["annotation", "annotation-xml", "none", "mprescripts"].includes(name)) return "";
  if (["mi", "mn", "mo", "mtext", "ms"].includes(name)) return run(text, variant, name === "mtext" || name === "ms");
  if (name === "mspace") {
    const width = parseFloat(node.getAttribute("width") || "0");
    return width > 0 ? run(width >= 1 ? "\u2003" : "\u2009", "normal") : "";
  }
  if (["math", "semantics", "mstyle", "mtd"].includes(name)) return all();
  if (name === "mrow") {
    const first = children[0], last = children[children.length - 1];
    if (children.length >= 2 && first.localName === "mo" && last.localName === "mo"
      && first.getAttribute("fence") === "true" && last.getAttribute("fence") === "true") {
      return tag("d", tag("dPr", prop("begChr", first.textContent || "") + prop("endChr", last.textContent || "") + prop("grow", "1"))
        + tag("e", children.slice(1, -1).map(child => convert(child, variant)).join("")));
    }
    return all();
  }
  if (name === "mfrac") return tag("f", tag("fPr", prop("type", node.getAttribute("linethickness") === "0px" || node.getAttribute("linethickness") === "0" ? "noBar" : node.getAttribute("bevelled") === "true" ? "skw" : "bar")) + arg("num", 0) + arg("den", 1));
  if (name === "msqrt" || name === "mroot") return tag("rad", tag("radPr", prop("degHide", name === "msqrt" ? "1" : "0"))
    + tag("deg", name === "mroot" ? child(1) : "") + tag("e", name === "mroot" ? child(0) : all()));
  if (["msub", "msup", "msubsup"].includes(name)) {
    const kind = name === "msub" ? "sSub" : name === "msup" ? "sSup" : "sSubSup";
    return tag(kind, arg("e", 0) + (name !== "msup" ? arg("sub", 1) : "") + (name !== "msub" ? arg("sup", name === "msup" ? 1 : 2) : ""));
  }
  if (["mover", "munder", "munderover"].includes(name)) {
    const base = children[0];
    if (base?.localName === "mo" && /^[∑∏∐∫∬∭∮⋃⋂]$/.test(base.textContent || "")) {
      return tag("nary", tag("naryPr", prop("chr", base.textContent!) + prop("limLoc", "undOvr")
        + prop("subHide", name === "mover" ? "1" : "0") + prop("supHide", name === "munder" ? "1" : "0"))
        + tag("sub", name === "mover" ? "" : child(1)) + tag("sup", name === "munder" ? "" : child(name === "mover" ? 1 : 2)) + tag("e", ""));
    }
    if (name === "mover" && node.getAttribute("accent") === "true") {
      return tag("acc", tag("accPr", prop("chr", children[1]?.textContent || "̂")) + arg("e", 0));
    }
    if (name === "munder" && node.getAttribute("accentunder") === "true" && /[¯_‾―]/.test(children[1]?.textContent || "")) {
      return tag("bar", tag("barPr", prop("pos", "bot")) + arg("e", 0));
    }
    if (name === "munderover") return tag("limUpp", tag("e", tag("limLow", arg("e", 0) + arg("lim", 1))) + arg("lim", 2));
    return tag(name === "mover" ? "limUpp" : "limLow", arg("e", 0) + arg("lim", 1));
  }
  if (name === "mtable") {
    const columns = Math.max(1, ...children.map(row => row.children.length));
    const alignment = (node.getAttribute("columnalign") || "center").split(/\s+/);
    const properties = tag("mPr", tag("mcs", Array.from({ length: columns }, (_, index) => tag("mc", tag("mcPr", prop("count", "1")
      + prop("mcJc", ["left", "right", "center"].includes(alignment[index] || alignment[0]) ? alignment[index] || alignment[0] : "center")))).join("")));
    return tag("m", properties + children.map(row => {
      if (row.localName !== "mtr") throw new Error("暂不支持带标签的公式矩阵");
      return tag("mr", Array.from({ length: columns }, (_, index) => tag("e", row.children[index] ? convert(row.children[index], variant) : "")).join(""));
    }).join(""));
  }
  if (name === "mphantom") return tag("phant", tag("phantPr", prop("show", "0")) + tag("e", all()));
  if (name === "mpadded") {
    // KaTeX uses zero-width padding for overlap macros. Do not silently flatten them.
    const adjustsLayout = ["width", "height", "depth", "voffset", "lspace"].some(attr => {
      const value = node.getAttribute(attr);
      return value !== null && Math.abs(Number.parseFloat(value)) > 0;
    });
    if (adjustsLayout) throw new Error("公式含暂不支持的重叠排版，请调整后重试");
    return all();
  }
  if (name === "menclose") {
    const notation = node.getAttribute("notation") || "longdiv";
    if (notation === "box" || notation === "roundedbox") return tag("borderBox", tag("e", all()));
    const strikes: Record<string, string> = { updiagonalstrike: "strikeBLTR", downdiagonalstrike: "strikeTLBR", horizontalstrike: "strikeH", verticalstrike: "strikeV" };
    const tokens = notation.split(/\s+/);
    if (tokens.every(value => strikes[value])) return tag("borderBox", tag("borderBoxPr", ["hideTop", "hideBot", "hideLeft", "hideRight"].map(value => prop(value, "1")).join("") + tokens.map(value => prop(strikes[value], "1")).join("")) + tag("e", all()));
  }
  throw new Error(`暂不支持的公式结构：${name}。已取消导出，未将公式替换为图片或源码。`);
}
