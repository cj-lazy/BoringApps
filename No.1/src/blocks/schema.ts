import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { InlineMath } from "./InlineMath";
import { ImageBlock } from "./ImageBlock";
import { MermaidBlock } from "./MermaidBlock";
import { CodeBlock } from "./CodeBlock";
import { FileBlock } from "./FileBlock";
import { LatexBlock } from "./LatexBlock";
import { CalloutBlock } from "./CalloutBlock";
import { RawMarkdownBlock } from "./RawMarkdownBlock";
import { LegacyMathBlock } from "./LegacyMathBlock";

export const schema = BlockNoteSchema.create({
    inlineContentSpecs: { ...defaultInlineContentSpecs, inlineMath: InlineMath },
    blockSpecs: {
        ...defaultBlockSpecs,
        image: ImageBlock(),
        latex: LatexBlock(),
        codeBlock: CodeBlock(),
        file: FileBlock(),
        mermaid: MermaidBlock(),
        callout: CalloutBlock(),
        rawMarkdown: RawMarkdownBlock(),
        legacyMath: LegacyMathBlock(),
    }
});
