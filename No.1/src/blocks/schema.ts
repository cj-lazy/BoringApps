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
import { NoteLink } from "./NoteLink";
import { NotePropertiesBlock } from "./NotePropertiesBlock";
import {FootnoteBlock,FootnoteRef} from "./Footnote";
import {NoteAnchor,NoteReference} from "./NoteReference";

export const schema = BlockNoteSchema.create({
    inlineContentSpecs: { ...defaultInlineContentSpecs, inlineMath: InlineMath, noteLink: NoteLink,footnoteRef:FootnoteRef },
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
        noteProperties: NotePropertiesBlock(),
        footnote:FootnoteBlock(),noteAnchor:NoteAnchor(),noteReference:NoteReference(),
    }
});
