import type { BlockNoteEditor } from "@blocknote/core";
import { bindNoteSource } from "./markdownNote.ts";

// Loading a different file is not an edit. In particular, Undo must never put
// the previous note's contents into the newly opened file.
export function replaceNoteDocument(editor: BlockNoteEditor<any, any, any>, blocks: any[]): void {
  editor.transact(transaction => {
    transaction.setMeta("addToHistory", false);
    editor.replaceBlocks(editor.document, blocks.length ? blocks : [{ type: "paragraph", content: [] }]);
  });
  bindNoteSource(editor, blocks, editor.document);
}
