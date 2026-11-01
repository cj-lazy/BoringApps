import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";

const CALLOUT_STYLES: Record<string, { icon: string; bg: string; border: string; color: string }> = {
  info:    { icon: '💡', bg: '#eef5ff', border: '#4a90d9', color: '#1a3a5c' },
  warning: { icon: '⚠️', bg: '#fff8e6', border: '#f0a020', color: '#5c3a1a' },
  error:   { icon: '❌', bg: '#fff0f0', border: '#e04040', color: '#5c1a1a' },
  tip:     { icon: '💚', bg: '#f0fff0', border: '#40a040', color: '#1a3a1a' },
};

export const calloutBlockSchema = {
  type: "callout" as const,
  propSchema: {
    ...defaultProps,
    calloutType: { default: "info" },
    title: { default: "" },
  },
  content: "inline" as const,
};

export const CalloutBlock = createReactBlockSpec(calloutBlockSchema, {
  toExternalHTML: ({ block, contentRef }) => <aside>
    <strong>{block.props.title || block.props.calloutType}</strong><div ref={contentRef} />
  </aside>,
  render: ({ block, editor, contentRef }) => {
    const style = CALLOUT_STYLES[block.props.calloutType] || CALLOUT_STYLES.info;
    const types = Object.keys(CALLOUT_STYLES);

    return (
      <div className="callout-block-wrapper" style={{
        borderLeft: `4px solid ${style.border}`,
        background: style.bg,
        padding: "12px 16px",
        borderRadius: "6px",
        margin: "10px 0",
        color: style.color,
        position: "relative",
        width: "100%", minWidth:0,
      }}>
        <div className="export-exclude no-print" style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", fontSize: "13px", fontWeight: 600 }}>
          <span>{style.icon}</span>
          {editor.isEditable ? <input aria-label="提示框标题" placeholder="可选标题" value={block.props.title}
            onChange={event => editor.updateBlock(block, { props: { title: event.target.value } })}
            style={{ minWidth: 0, flex:1, width:"auto", border: 0, background: "transparent", color: "inherit" }} />
            : <span>{block.props.title || block.props.calloutType}</span>}
          <select
            aria-label="提示框类型" disabled={!editor.isEditable}
            value={block.props.calloutType}
            onChange={(e) => editor.updateBlock(block, { props: { ...block.props, calloutType: e.target.value } })}
            onClick={(e) => e.stopPropagation()}
            style={{ marginLeft: "auto", flexShrink:0, minWidth:90, fontSize: "11px", border: "1px solid #ddd", borderRadius: "4px", background: "white", padding: "2px 4px", cursor: "pointer", color: "#666" }}>
            {types.map(t => <option key={t} value={t}>{CALLOUT_STYLES[t].icon} {{info:"信息",warning:"警告",error:"错误",tip:"提示"}[t]}</option>)}
          </select>
        </div>
        <div style={{ fontSize: "inherit", lineHeight: "inherit" }} ref={contentRef} />
      </div>
    );
  }
});
