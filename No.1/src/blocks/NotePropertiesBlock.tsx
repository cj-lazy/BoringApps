import { createReactBlockSpec } from "@blocknote/react";
import { readProperties } from "../utils/noteProperties";
const decode = (text: string) => { try { return decodeURIComponent(text); } catch { return text; } };
export const NotePropertiesBlock = createReactBlockSpec({ type: "noteProperties", propSchema: {source: {default: ""}}, content: "none" }, {
  render: ({block}) => {
    const {properties, error} = readProperties(decode(block.props.source) + "\n");
    return <div className="note-properties-summary" contentEditable={false}><span>{error ? "属性格式待修正" : [properties.type, properties.status, ...properties.tags.map(t => "#" + t)].filter(Boolean).join(" · ") || "笔记属性"}</span>
      <button className="no-print" onClick={() => window.dispatchEvent(new CustomEvent("no1:properties"))}>查看属性</button></div>;
  },
  toExternalHTML: ({block}) => <pre>{decode(block.props.source)}</pre>,
});
