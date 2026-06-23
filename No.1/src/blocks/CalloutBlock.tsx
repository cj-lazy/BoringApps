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
  toExternalHTML: (block: any) => {
    const style = CALLOUT_STYLES[block.props.calloutType] || CALLOUT_STYLES.info;
    const div = document.createElement("div");
    div.style.borderLeft = `4px solid ${style.border}`;
    div.style.background = style.bg;
    div.style.padding = "10px 16px";
    div.style.borderRadius = "6px";
    div.style.margin = "10px 0";
    div.innerHTML = `<strong>${style.icon} ${block.props.title || ''}</strong><br>...</div>`;
    return { dom: div };
  }
};

export const CalloutBlock = createReactBlockSpec(calloutBlockSchema, {
  render: ({ block, editor }) => {
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
      }}>
        <div className="export-exclude no-print" style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", fontSize: "13px", fontWeight: 600 }}>
          <span>{style.icon}</span>
          {block.props.title ? (
            <span>{block.props.title}</span>
          ) : (
            <span style={{ color: "#999", fontStyle: "italic" }}>（可选标题）</span>
          )}
          <select
            value={block.props.calloutType}
            onChange={(e) => editor.updateBlock(block, { props: { ...block.props, calloutType: e.target.value } })}
            onClick={(e) => e.stopPropagation()}
            style={{ marginLeft: "auto", fontSize: "11px", border: "1px solid #ddd", borderRadius: "4px", background: "white", padding: "2px 4px", cursor: "pointer", color: "#666" }}>
            {types.map(t => <option key={t} value={t}>{CALLOUT_STYLES[t].icon} {t}</option>)}
          </select>
        </div>
        <div style={{ fontSize: "14px", lineHeight: 1.6 }} ref={(el) => {
          if (el && !el.hasAttribute('data-callout-setup')) {
            el.setAttribute('data-callout-setup', '1');
            // The BlockNote editor handles inline content rendering
          }
        }} />
      </div>
    );
  }
});
