import React from "react";

const ResizeHandle = ({ onResizeStart }: { onResizeStart: (e: React.MouseEvent) => void }) => (
    <div
        onMouseDown={onResizeStart}
        className="export-exclude no-print"
        title="拖动调整大小"
        style={{
            position: "absolute", bottom: "2px", right: "2px", width: "16px", height: "16px",
            cursor: "nwse-resize", zIndex: 10, display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
            background: "rgba(255,255,255,0.7)", borderRadius: "4px"
        }}
    >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M10 2L2 10H10V2Z" fill="#666"/>
        </svg>
    </div>
);

export default ResizeHandle;
