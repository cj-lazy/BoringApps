import { memo } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { getDefaultReactSlashMenuItems, SuggestionMenuController } from "@blocknote/react";
import { filterSuggestionItems } from "../utils/fileTree";

function insertOrReplaceBlock(editor: any, block: any) {
  const current = editor.getTextCursorPosition().block;
  if (Array.isArray(current.content) && !current.content.length) editor.replaceBlocks([current], [block]);
  else editor.insertBlocks([block], current, "after");
}
interface Props { editor: any; onChange: any; readOnly: boolean; busy: boolean; showDialog: (type: any, title: string, options?: any) => Promise<any>; source: string | null; onSourceChange: (text: string) => void; }
export default memo(function NoteEditor({ editor, onChange, readOnly, busy, showDialog, source, onSourceChange }: Props) {
  if (source !== null) return <><textarea autoFocus className="source-editor" aria-label="Markdown 源码" value={source} readOnly={readOnly || busy}
    onChange={event => onSourceChange(event.target.value)} spellCheck={false} /><pre className="source-print">{source}</pre></>;
  return <BlockNoteView editor={editor} onChange={onChange} theme="light" slashMenu={false} editable={!readOnly && !busy}>
                    <SuggestionMenuController triggerCharacter={"/"} getItems={async (query) => {
                        const defaultItems = getDefaultReactSlashMenuItems(editor);
                        const filteredDefaultItems = defaultItems.filter(i => i.title !== "Code Block");

                        const latexItem = {
                            title: "公式 (Math)",
                            onItemClick: () => {
                                const latexBlock = { type: "latex" as const, props: { text: "" } };
                                insertOrReplaceBlock(editor, latexBlock);
                            },
                            aliases: ["latex", "math", "formula", "gs"], group: "Media", icon: <div style={{fontWeight: "bold", fontSize: "16px"}}>∑</div>, subtext: "插入数学公式"
                        };
                        const codeItem = {
                            title: "代码块 (Code)",
                            onItemClick: () => {
                                const codeBlock = { type: "codeBlock" as const, props: { text: "", language: "cpp" } };
                                insertOrReplaceBlock(editor, codeBlock);
                            },
                            aliases: ["code", "c", "js", "ts"], group: "Basic", icon: <div style={{fontWeight: "bold", fontSize: "16px"}}>{`</>`}</div>, subtext: "插入代码块"
                        };
                        const mermaidItem = {
                            title: "流程图 (Mermaid)",
                            onItemClick: () => {
                                const mermaidBlock = { type: "mermaid" as const, props: { code: "graph TD;\nA-->B;" } };
                                insertOrReplaceBlock(editor, mermaidBlock);
                            },
                            aliases: ["flowchart", "mindmap", "graph", "mermaid"], group: "Media", icon: <div style={{fontWeight: "bold", fontSize: "16px"}}>🧜‍♂️</div>, subtext: "插入思维导图/流程图"
                        };
                        const customNumberedList = {
                            title: "自定义编号列表",
                            onItemClick: async () => {
                                const startStr = await showDialog('prompt', '自定义起始编号', { message: '请输入列表的起始数字：', defaultValue: '1' });
                                if (!startStr) return;
                                const startNum = parseInt(startStr);
                                if (isNaN(startNum) || startNum < 1) return;
                                const currentPos = editor.getTextCursorPosition();
                                const currentBlock = currentPos.block;
                                const listItem = { type: "numberedListItem" as const, props: { start: startNum }, content: [] };
                                // If cursor is in a list, insert empty paragraph first to break list grouping
                                const needSeparator = currentBlock.type === 'numberedListItem' || currentBlock.type === 'bulletListItem';
                                const blocks = needSeparator
                                    ? [{ type: "paragraph" as const, content: [] }, listItem]
                                    : [listItem];
                                const isEmpty = Array.isArray(currentBlock.content) && currentBlock.content.length === 0;
                                if (isEmpty) {
                                    editor.replaceBlocks([currentBlock], blocks);
                                } else {
                                    editor.insertBlocks(blocks, currentBlock, "after");
                                }
                            },
                            aliases: ["numbered", "customlist", "startnumber", "bh"], group: "Basic",
                            icon: <div style={{fontWeight: "bold", fontSize: "16px"}}>1️⃣</div>,
                            subtext: "从指定数字开始的编号列表"
                        };
                        const calloutItem = {
                            title: "提示框 (Callout)",
                            onItemClick: () => {
                                const calloutBlock = { type: "callout" as const, props: { calloutType: "info", title: "" }, content: [] };
                                insertOrReplaceBlock(editor, calloutBlock);
                            },
                            aliases: ["callout", "ts", "info", "warning", "error", "tip"], group: "Media",
                            icon: <div style={{fontWeight: "bold", fontSize: "16px"}}>💡</div>,
                            subtext: "插入彩色提示框（信息/警告/错误/提示）"
                        };
                        return filterSuggestionItems([...filteredDefaultItems, latexItem, codeItem, mermaidItem, customNumberedList, calloutItem], query);
                    }} />
  </BlockNoteView>;
});
