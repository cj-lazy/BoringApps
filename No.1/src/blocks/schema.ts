import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { ImageBlock } from "./ImageBlock";
import { MermaidBlock } from "./MermaidBlock";
import { CodeBlock } from "./CodeBlock";
import { FileBlock } from "./FileBlock";
import { LatexBlock } from "./LatexBlock";
import { CalloutBlock } from "./CalloutBlock";

export const schema = BlockNoteSchema.create({
    blockSpecs: {
        ...defaultBlockSpecs,
        image: ImageBlock(),
        latex: LatexBlock(),
        codeBlock: CodeBlock(),
        file: FileBlock(),
        mermaid: MermaidBlock(),
        callout: CalloutBlock(),
    }
});
