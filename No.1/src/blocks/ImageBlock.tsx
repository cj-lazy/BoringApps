import { useState, useEffect, useRef } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import ResizeHandle from "../components/ResizeHandle";

export const imageBlockSchema = {
    type: "image" as const,
    propSchema: {
        ...defaultProps,
        name: { default: "image" },
        url: { default: "" },
        width: { default: 500 },
        showPreview: { default: true }
    },
    content: "none" as const,
};

export const ImageBlock = createReactBlockSpec(imageBlockSchema, {
    toExternalHTML: ({ block }) => <img src={block.props.url} alt={block.props.name} width={block.props.width} />,
    render: ({ block, editor }) => {
        const [size, setSize] = useState({ width: block.props.width });
        const imgRef = useRef<HTMLImageElement>(null);

        useEffect(() => {
            if (block.props.width !== size.width) {
                setSize({ width: block.props.width });
            }
        }, [block.props.width]);

        const handleResizeStart = (e: React.MouseEvent) => {
            e.preventDefault(); e.stopPropagation();
            const startX = e.clientX;
            const startWidth = size.width;

            const onMouseMove = (moveEvent: MouseEvent) => {
                const newWidth = Math.max(100, startWidth + (moveEvent.clientX - startX));
                setSize({ width: newWidth });
            };

            const onMouseUp = (upEvent: MouseEvent) => {
                const finalWidth = Math.max(100, startWidth + (upEvent.clientX - startX));
                editor.updateBlock(block, { props: { ...block.props, width: finalWidth } });
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
            };

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        };

        return (
            <div className="bn-image-block" style={{ position: "relative", display: "inline-block", maxWidth: "100%", margin: "10px 0" }}>
                <img
                    ref={imgRef}
                    src={block.props.url}
                    alt={block.props.name}
                    draggable={false}
                    style={{
                        width: `${size.width}px`,
                        maxWidth: "100%",
                        height: "auto",
                        borderRadius: "4px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        display: "block"
                    }}
                />
                {editor.isEditable && <ResizeHandle onResizeStart={handleResizeStart} />}
            </div>
        );
    }
});
