import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

import "katex/dist/katex.min.css";
import { getDefaultReactSlashMenuItems, SuggestionMenuController } from "@blocknote/react";

import { asBlob } from "html-docx-js-typescript";

import mermaid from "mermaid";
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

import { filterSuggestionItems, sortFileTree } from "./utils/fileTree";
import { encodeSpacesInBlocks } from "./utils/encode";
import CustomDialog from "./components/CustomDialog";
import type { FileNode, TrashItem } from "./components/CustomDialog";
import { schema } from "./blocks/schema";

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface Tab { path: string; title: string; isDirty: boolean; }
function App() {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(-1);
  const currentFile = tabs[activeTabIndex]?.path ?? null;
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [status, setStatus] = useState("就绪");
  const [lastSaveTime, setLastSaveTime] = useState<string>("");

  // 🔥 目录状态与开关
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{path:string;line:number;content:string}[]>([]);
  const [searchReplace, setSearchReplace] = useState("");
  const [searching, setSearching] = useState(false);
  const [toasts, setToasts] = useState<{id:number; msg:string; type:'success'|'error'|'info'}[]>([]);
  const toastIdRef = useRef(0);
  const addToast = (msg: string, type: 'success'|'error'|'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, {id, msg, type}]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  };
  const [inlineSearch, setInlineSearch] = useState<{open:boolean; query:string; results:{blockId:string;text:string}[]; idx:number}>({open:false,query:'',results:[],idx:0});
  const [favPaths, setFavPaths] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("fav_paths")||"[]")));
  const [shortcutPanel, setShortcutPanel] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{x:number;y:number;node:FileNode}|null>(null);
  const [isReadMode, setIsReadMode] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const isLoadingRef = useRef(false);
  const isExitingRef = useRef(false);
  const [initialAssetUrls, setInitialAssetUrls] = useState<Set<string>>(new Set());

  const currentFileRef = useRef<string | null>(null);
  useEffect(() => { currentFileRef.current = currentFile; }, [currentFile]);

  const [bgImage, setBgImage] = useState<string | null>(localStorage.getItem("app_bg_image"));
  const [bgOpacity, setBgOpacity] = useState<number>(parseFloat(localStorage.getItem("app_bg_opacity") || "0.5"));
  const [bgBlur, setBgBlur] = useState<number>(parseInt(localStorage.getItem("app_bg_blur") || "0"));

  const [dialogState, setDialogState] = useState<{ 
      isOpen: boolean; type: any; title: string; message?: string; defaultValue?: string; 
      treeData?: FileNode[]; disabledPath?: string; trashItems?: TrashItem[]; 
      resolve: (value: any) => void; 
  }>({ isOpen: false, type: 'confirm', title: '', resolve: () => {} });

  const showDialog = (type: any, title: string, options: any = {}): Promise<any> => {
    return new Promise((resolve) => {
      setDialogState({ 
          isOpen: true, type, title, resolve: (val: any) => { setDialogState(prev => ({ ...prev, isOpen: false })); resolve(val); },
          ...options 
      });
    });
  };

  const getAllAssetUrls = (blocks: any[]): Set<string> => {
    const urls = new Set<string>();
    blocks.forEach((block: any) => {
      if (block.props && block.props.url) urls.add(block.props.url);
      if (block.children) getAllAssetUrls(block.children).forEach(u => urls.add(u));
    });
    return urls;
  };

  const uploadFile = async (file: File) => {
    if (!currentFileRef.current) { await showDialog('alert', '提示', { message: '请先在侧边栏选中一个笔记。' }); return ""; }
    try {
      setStatus("上传中...");
      const filename = `${new Date().getTime()}_${file.name}`;
      const payload = Array.from(new Uint8Array(await file.arrayBuffer()));
      const path = await invoke<string>("save_image", { fileName: filename, payload, notePath: currentFileRef.current });
      const assetUrl = convertFileSrc(path);
      setInitialAssetUrls(prev => new Set([...prev, assetUrl]));
      setStatus("文件已保存");
      return assetUrl;
    } catch (e) { console.error(e); await showDialog('alert', '上传失败', { message: `错误: ${e}` }); return ""; }
  };
  
  // 🔥 更新目录逻辑
  const updateTOC = (editor: any) => {
      const items: TOCItem[] = [];
      editor.document.forEach((block: any) => {
          if (block.type === "heading") {
              const text = Array.isArray(block.content) 
                  ? block.content.map((c: any) => c.text).join("") 
                  : "";
              if (text) {
                  items.push({
                      id: block.id,
                      text: text,
                      level: block.props.level
                  });
              }
          }
      });
      setToc(items);
  };

  const onEditorChange = () => {
      if (isExitingRef.current || isLoadingRef.current || !currentFileRef.current) return;
      updateTOC(editor);

      const idx = activeTabIndex;
      if (idx >= 0 && !tabs[idx].isDirty) {
          setTabs(prev => prev.map((t, i) => i === idx ? { ...t, isDirty: true } : t));
          setStatus("● 未保存");
      }

  };

  const editor = useCreateBlockNote({ 
      schema, 
      uploadFile,
  });

  const refreshTree = async () => { try { const tree = await invoke<FileNode[]>("get_file_tree"); setFileTree(tree); } catch (e) { console.error(e); } };

  const toggleFolder = (path: string) => { const newSet = new Set(expandedFolders); if (newSet.has(path)) newSet.delete(path); else newSet.add(path); setExpandedFolders(newSet); };
  
  const handleSelect = (node: FileNode) => { 
    if (node.is_dir) { toggleFolder(node.path); setSelectedFolder(node.path); } 
    else { loadNote(node.path); const parentPath = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : null; setSelectedFolder(parentPath); } 
  };
  
  const handleBackgroundClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) setSelectedFolder(null); };

  const saveCurrentNote = async () => {
    const fileToSave = currentFileRef.current;
    if (!fileToSave) return;
    setStatus("正在保存...");
    try {
      const currentBlocks = editor.document;
      const currentAssetUrls = getAllAssetUrls(currentBlocks);
      const deletedUrls = Array.from(initialAssetUrls).filter(url => !currentAssetUrls.has(url));
      for (const url of deletedUrls) { try { await invoke("delete_asset", { url }); } catch (err) { console.error(err); } }

      let finalMarkdown = "";
      let standardBlockBuffer: typeof currentBlocks = [];
      for (const block of currentBlocks) {
        if (block.type === "latex") {
            if (standardBlockBuffer.length > 0) { finalMarkdown += await editor.blocksToMarkdownLossy(encodeSpacesInBlocks(standardBlockBuffer)); standardBlockBuffer = []; }
            let decodedLatex = "";
            try { decodedLatex = decodeURIComponent(block.props.text); } catch { decodedLatex = block.props.text; }
            finalMarkdown += `\n$$\n${decodedLatex}\n$$\n`;
        } 
        else if (block.type === "codeBlock") {
            if (standardBlockBuffer.length > 0) { finalMarkdown += await editor.blocksToMarkdownLossy(encodeSpacesInBlocks(standardBlockBuffer)); standardBlockBuffer = []; }
            let textToSave = "";
            try { textToSave = decodeURIComponent(block.props.text); } catch { textToSave = block.props.text; }
            finalMarkdown += `\n\`\`\`${block.props.language}|w=${block.props.width}|h=${block.props.height}\n${textToSave}\n\`\`\`\n`;
        }
        else if (block.type === "mermaid") {
            if (standardBlockBuffer.length > 0) { finalMarkdown += await editor.blocksToMarkdownLossy(encodeSpacesInBlocks(standardBlockBuffer)); standardBlockBuffer = []; }
            finalMarkdown += `\n\`\`\`mermaid|w=${block.props.width}|h=${block.props.height}\n${block.props.code}\n\`\`\`\n`;
        }
        else if (block.type === "file") {
            if (standardBlockBuffer.length > 0) { finalMarkdown += await editor.blocksToMarkdownLossy(encodeSpacesInBlocks(standardBlockBuffer)); standardBlockBuffer = []; }
            finalMarkdown += `\n[FILE:${block.props.name}](${block.props.url})\n`;
        }
        else if (block.type === "image") {
            if (standardBlockBuffer.length > 0) { finalMarkdown += await editor.blocksToMarkdownLossy(encodeSpacesInBlocks(standardBlockBuffer)); standardBlockBuffer = []; }
            const width = block.props.width || 500;
            const name = block.props.name || "image";
            const safeName = name.replace(/\|/g, "_"); 
            finalMarkdown += `\n![${safeName}|w=${width}](${block.props.url})\n`;
        }
        else { standardBlockBuffer.push(block); }
      }
      if (standardBlockBuffer.length > 0) finalMarkdown += await editor.blocksToMarkdownLossy(encodeSpacesInBlocks(standardBlockBuffer));

      await invoke("save_note", { path: fileToSave, content: finalMarkdown });
      setInitialAssetUrls(currentAssetUrls);
      setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, isDirty: false } : t));
      setStatus("已保存");
      
      const now = new Date();
      setLastSaveTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
    } catch(e) { setStatus("保存失败"); console.error(e); }
  };

  const loadNote = async (path: string) => {
    // Save current tab if dirty before switching
    const curIdx = activeTabIndex;
    if (curIdx >= 0 && tabs[curIdx]?.isDirty) { await saveCurrentNote(); }
    setStatus(`加载 ${path}...`); isLoadingRef.current = true; 
    
    const now = new Date();
    setLastSaveTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);

    try { 
      let content = await invoke<string>("load_note", { path }); 
      
      const codeBlockMap = new Map();
      let blockIdCounter = 0;

      content = content.replace(/```(\S*?)(?:\|w=(\d+|100%)?\|h=(\d+)?)?\s*\n([\s\S]*?)```/g, (_match, langStr, w, h, code) => {
          const id = `@@CODE_BLOCK_ID_${blockIdCounter++}@@`;
          const lang = langStr || "text";
          const width = w ? (w === "100%" ? "100%" : parseInt(w)) : (lang === "mermaid" ? 500 : "100%");
          const height = h ? parseInt(h) : 300;
          
          if (lang === "mermaid") {
              codeBlockMap.set(id, { kind: "mermaid", code: code.trim(), width, height });
          } else {
              codeBlockMap.set(id, { kind: "code", lang, code: code.trim(), width, height });
          }
          return id;
      });

      content = content.replace(/\$\$\n([\s\S]*?)\n\$\$/g, (_match, formula) => {
          const id = `@@LATEX_ID_${blockIdCounter++}@@`;
          codeBlockMap.set(id, { kind: "latex", code: formula.trim() });
          return id;
      });

      content = content.replace(/!\[(.*?)\]\((.*?)\)/g, (_match, alt, url) => {
          let width = 500; 
          let name = alt;
          
          if (alt.includes("|w=")) {
              const parts = alt.split("|w=");
              name = parts[0];
              const wVal = parts[1];
              const parsedWidth = parseInt(wVal); 
              if (!isNaN(parsedWidth)) width = parsedWidth;
          }

          const id = `@@IMAGE_ID_${blockIdCounter++}@@`;
          codeBlockMap.set(id, { kind: "image", name, url, width });
          return id;
      });

      content = content.replace(/\[FILE:(.*?)\]\((.*?)\)/g, (_match, name, url) => {
        const id = `@@FILE_ID_${blockIdCounter++}@@`;
        codeBlockMap.set(id, { kind: "file", name: name, url: url });
        return id;
      });

      const rawBlocks = await editor.tryParseMarkdownToBlocks(content); 
      
      const processedBlocks = rawBlocks.map((block: any) => {
          if (block.type === "paragraph" && block.content && block.content.length === 1 && block.content[0].text) {
              const text = block.content[0].text.trim();
              if (codeBlockMap.has(text)) {
                  const data = codeBlockMap.get(text);
                  if (data.kind === "latex") {
                      return { type: "latex", props: { text: encodeURIComponent(data.code) }, content: [] };
                  } else if (data.kind === "code") {
                      return { type: "codeBlock", props: { text: encodeURIComponent(data.code), language: data.lang, width: data.width, height: data.height }, content: [] };
                  } else if (data.kind === "file") {
                      return { type: "file", props: { name: data.name, url: data.url }, content: [] };
                  } else if (data.kind === "mermaid") {
                      return { type: "mermaid", props: { code: data.code, width: data.width, height: data.height }, content: [] };
                  } 
                  else if (data.kind === "image") {
                      return { type: "image", props: { url: data.url, name: data.name, width: data.width }, content: [] };
                  }
              }
          }
          return block;
      });

      // Clean up &nbsp; placeholder used to preserve empty paragraphs
      const cleanNbsp = (blocks: any[]) => {
        for (const b of blocks) {
          if (b.type === 'paragraph' && Array.isArray(b.content) &&
              b.content.length === 1 && b.content[0].text === ' ') {
            b.content = [];
          }
          if (b.children) cleanNbsp(b.children);
        }
      };
      cleanNbsp(processedBlocks);

      editor.replaceBlocks(editor.document, processedBlocks.length === 0 ? [{ type: "paragraph", content: [] }] : processedBlocks);
      setInitialAssetUrls(getAllAssetUrls(processedBlocks));
      // Add or activate tab
      const title = path.includes("/") ? path.split("/").pop()! : path;
      setTabs(prev => {
        const existing = prev.findIndex(t => t.path === path);
        if (existing >= 0) { setActiveTabIndex(existing); return prev; }
        setActiveTabIndex(prev.length);
        return [...prev, { path, title, isDirty: false }];
      });
      updateTOC(editor);
      setStatus("已加载"); 
    } catch (e) { console.error(e); setStatus("加载失败"); } 
    finally { setTimeout(() => { isLoadingRef.current = false; }, 300); }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 's') { e.preventDefault(); saveCurrentNote(); }
      else if (mod && e.key === 'k') { e.preventDefault(); setIsSidebarOpen(true); setTimeout(() => sidebarSearchRef.current?.focus(), 100); }
      else if (mod && e.shiftKey && e.key === 'F') { e.preventDefault(); setSearchOpen(true); setSearchQuery(""); setSearchResults([]); }
      else if (mod && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        setInlineSearch(prev => ({...prev, open: true, query: '', results: [], idx: 0}));
        setTimeout(() => document.getElementById('inline-search-input')?.focus(), 50);
      }
      else if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); editor.redo(); }
      else if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); editor.undo(); }
      else if (mod && e.shiftKey && e.key === 'D') { e.preventDefault(); setIsFocusMode(prev => !prev); }
      else if (e.key === 'Escape') { setSearchOpen(false); setInlineSearch(prev=>({...prev, open: false})); setShortcutPanel(false); setCtxMenu(null); }
      else if (e.key === '?' && !mod && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setShortcutPanel(true); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, initialAssetUrls]);
  const silentGC = async () => { try { await invoke("gc_unused_assets"); } catch (e) { console.warn(e); } };
  useEffect(() => { refreshTree(); silentGC(); }, []);

  const filterNodes = (nodes: FileNode[], term: string): FileNode[] => {
    if (!term) return nodes;
    return nodes.map(node => {
      if (node.is_dir) { const children = filterNodes(node.children, term); if (children.length > 0 || node.name.toLowerCase().includes(term.toLowerCase())) return { ...node, children }; return null; }
      return node.name.toLowerCase().includes(term.toLowerCase()) ? node : null;
    }).filter(Boolean) as FileNode[];
  };

  const displayedTree = useMemo(() => {
      const filtered = filterNodes(fileTree, searchTerm);
      return sortFileTree(filtered);
  }, [fileTree, searchTerm]);
  
  const startResizing = useCallback(() => setIsResizing(true), []);
  const resize = useCallback((e: MouseEvent) => { if (isResizing) setSidebarWidth(Math.max(150, Math.min(e.clientX, 600))); }, [isResizing]);
  useEffect(() => { window.addEventListener("mousemove", resize); window.addEventListener("mouseup", () => setIsResizing(false)); return () => { window.removeEventListener("mousemove", resize); window.removeEventListener("mouseup", () => setIsResizing(false)); }; }, [resize]);
  useEffect(() => { const close = () => setCtxMenu(null); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, []);

  const handleMove = async (e: React.MouseEvent, node: FileNode) => { e.stopPropagation(); const currentParent = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : ""; const targetFolder = await showDialog('tree-select', '移动到...', { message: `选择 "${node.name}" 的新位置：`, defaultValue: currentParent, treeData: fileTree, disabledPath: node.is_dir ? node.path : undefined }); if (targetFolder === null || targetFolder === currentParent) return; const srcPath = node.path; const newPath = targetFolder ? `${targetFolder}/${node.name}` : node.name; try { await saveCurrentNote(); await invoke("rename_item", { oldPath: srcPath, newPath: newPath, isDir: node.is_dir }); await refreshTree(); if (currentFile === srcPath) { setTabs(prev => prev.map(t => t.path === srcPath ? { ...t, path: newPath, title: newPath.includes("/") ? newPath.split("/").pop()! : newPath } : t)); } } catch (err) { addToast("移动失败: " + err, 'error'); } };
  const closeTab = async (path: string) => {
    const idx = tabs.findIndex(t => t.path === path);
    if (idx < 0) return;
    if (idx === activeTabIndex && tabs[idx]?.isDirty) await saveCurrentNote();

    const nextTabs = tabs.filter((_, i) => i !== idx);
    if (nextTabs.length === 0) {
      setTabs([]);
      setActiveTabIndex(-1);
      editor.replaceBlocks(editor.document, []);
      setInitialAssetUrls(new Set());
    } else {
      setTabs(nextTabs);
      let newActiveIdx = activeTabIndex;
      if (idx === activeTabIndex) newActiveIdx = Math.min(idx, nextTabs.length - 1);
      else if (idx < activeTabIndex) newActiveIdx = activeTabIndex - 1;
      setActiveTabIndex(newActiveIdx);
      if (idx === activeTabIndex && nextTabs[newActiveIdx]) {
        loadNote(nextTabs[newActiveIdx].path);
      }
    }
  };

  const handleDelete = async (e: React.MouseEvent, path: string, is_dir: boolean) => { e.stopPropagation(); const confirmed = await showDialog('confirm', `删除`, { message: `确认要将 "${path}" 放入回收站吗？` }); if (!confirmed) return; try { if (currentFile === path || (currentFile && currentFile.startsWith(path + "/"))) { closeTab(path); editor.replaceBlocks(editor.document, []); setInitialAssetUrls(new Set()); } await invoke("delete_item", { path, isDir: is_dir }); await refreshTree(); } catch (err) { addToast("删除失败: " + err, 'error'); } };
  const handleRename = async (e: React.MouseEvent, node: FileNode) => { e.stopPropagation(); const newName = await showDialog('prompt', '重命名', { defaultValue: node.name }); if (!newName || newName === node.name) return; const parentDir = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : ""; const newPath = parentDir ? `${parentDir}/${newName}` : newName; try { await saveCurrentNote(); await invoke("rename_item", { oldPath: node.path, newPath: newPath, isDir: node.is_dir }); await refreshTree(); if (currentFile === node.path) { setTabs(prev => prev.map(t => t.path === node.path ? { ...t, path: newPath, title: newName } : t)); } } catch (err) { addToast("重命名失败: " + err, 'error'); } };
  const handleCreate = async (type: 'folder' | 'note') => { const name = await showDialog('prompt', type === 'folder' ? "新建文件夹" : "新建笔记", { message: "请输入名称：" }); if (!name) return; const basePath = selectedFolder ? `${selectedFolder}/${name}` : name; try { await saveCurrentNote(); if (type === 'folder') await invoke("create_folder", { path: basePath }); else { await invoke("create_note", { path: basePath }); await loadNote(basePath); } await refreshTree(); } catch (e) { addToast("创建失败: " + e, 'error'); } };
  const handleOpenSettings = () => showDialog('settings', '外观设置', { bgImage, bgOpacity, bgBlur, onSetBgImage: updateBgImage, onSetBgOpacity: (v: number) => { setBgOpacity(v); localStorage.setItem("app_bg_opacity", v.toString()); }, onSetBgBlur: (v: number) => { setBgBlur(v); localStorage.setItem("app_bg_blur", v.toString()); }, onClearBg: clearBg });

  const clearBg = async () => { if (bgImage) { try { await invoke("delete_asset", { url: bgImage }); } catch (e) { console.error("Delete bg failed", e); } } setBgImage(null); localStorage.removeItem("app_bg_image"); };
  const updateBgImage = async (file: File) => { try { const filename = `bg_${new Date().getTime()}_${file.name}`; const payload = Array.from(new Uint8Array(await file.arrayBuffer())); const path = await invoke<string>("save_image", { fileName: filename, payload, notePath: "wallpapers" }); setBgImage(path); localStorage.setItem("app_bg_image", path); } catch (e) { addToast("壁纸设置失败: " + e, 'error'); } };
  const handleOpenTrash = async () => { try { const items = await invoke<TrashItem[]>("get_trash_items"); await showDialog('trash', '回收站', { trashItems: items, onEmptyTrash: async () => { const confirmed = await showDialog('confirm', '清空回收站', { message: "确定清空回收站吗？此操作不可恢复。" }); if (confirmed) { await invoke("empty_trash"); } handleOpenTrash(); }, onRestore: async (path: string) => { await invoke("restore_trash_item", { fileName: path }); await refreshTree(); handleOpenTrash(); }, onDeleteForever: async (path: string) => { const confirmed = await showDialog('confirm', '永久删除', { message: `确定要永久删除 "${path}" 吗？此操作不可恢复。` }); if (confirmed) { await invoke("delete_trash_item", { fileName: path }); } handleOpenTrash(); } }); } catch(e) { addToast("打开回收站失败: " + e, 'error'); } };
  const showNodeMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault(); e.stopPropagation();
    const menuW = 170, menuH = 220;
    const x = Math.min(e.clientX, window.innerWidth - menuW);
    const y = Math.min(e.clientY, window.innerHeight - menuH);
    setCtxMenu({ x: Math.max(0, x), y: Math.max(0, y), node });
  };
  const handleShowInfo = async (node: FileNode) => {
    setCtxMenu(null);
    if (node.is_dir) { addToast("文件夹暂无详细信息", 'info'); return; }
    try {
      const info = await invoke<any>("get_note_info", { path: node.path });
      await showDialog('alert', '📋 详细信息', { message: `路径: ${info.path}\n行数: ${info.lines}\n大小: ${(info.size/1024).toFixed(1)} KB\n创建: ${info.created}\n修改: ${info.modified}` });
    } catch { addToast("获取信息失败", 'error'); }
  };
  const toggleFav = (path: string) => {
    setFavPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      localStorage.setItem("fav_paths", JSON.stringify([...next]));
      return next;
    });
    setCtxMenu(null);
  };

  const renderTree = (nodes: FileNode[], depth = 0) => nodes.map(node => {
    const isExpanded = expandedFolders.has(node.path) || searchTerm.length > 0;
    const isSelected = selectedFolder === node.path;
    const isFav = favPaths.has(node.path);
    return (
      <div key={node.path} onContextMenu={(e) => showNodeMenu(e, node)}>
        <div onClick={() => handleSelect(node)}
          style={{ padding: "5px 8px", paddingLeft: `${depth*14+8}px`, cursor:"pointer",
            background: currentFile===node.path?"#e6f7ff":(isSelected&&node.is_dir?"#f0f0f0":"transparent"),
            color: currentFile===node.path?"#1890ff":"#333", display:"flex", justifyContent:"space-between",
            alignItems:"center", fontSize:"13px", borderRadius:"4px", marginBottom:"1px", userSelect:"none" }}
          onMouseEnter={(e) => { if (currentFile!==node.path) e.currentTarget.style.background="#f5f5f5"; }}
          onMouseLeave={(e) => { if (currentFile!==node.path && !isSelected) e.currentTarget.style.background="transparent"; }}>
          <div style={{ display:"flex", alignItems:"center", overflow:"hidden", flex:1 }}>
            <span style={{ marginRight:"4px", fontSize:"10px", width:"14px", textAlign:"center", transform:isExpanded?"rotate(90deg)":"rotate(0deg)", transition:"transform 0.1s", color:"#999", visibility:node.is_dir?"visible":"hidden" }}
              onClick={(e) => { e.stopPropagation(); if(node.is_dir) toggleFolder(node.path); }}>▶</span>
            {isFav && <span style={{ fontSize:"11px", marginRight:"2px" }}>⭐</span>}
            <span style={{ marginRight:"5px", fontSize:"15px" }}>{node.is_dir?(isExpanded?"📂":"📁"):"📄"}</span>
            <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{node.name}</span>
          </div>
          <span onClick={(e) => showNodeMenu(e, node)}
            style={{ fontSize:"16px", cursor:"pointer", opacity:0.35, padding:"0 4px", borderRadius:"3px", lineHeight:1 }}
            onMouseEnter={(e) => e.currentTarget.style.opacity="0.8"}
            onMouseLeave={(e) => e.currentTarget.style.opacity="0.35"}
            title="更多操作">…</span>
        </div>
        {node.is_dir && isExpanded && (
          <div>{node.children&&node.children.length>0?renderTree(node.children,depth+1):
            <div style={{ paddingLeft:`${(depth+1)*14+30}px`, fontSize:"11px", color:"#ccc", padding:"3px 0" }}>(空)</div>}</div>
        )}
      </div>
    );
  });
  const handleExportPdf = () => { window.print(); };

  // 🔥 Word 导出逻辑
  const handleExportWord = async () => {
    if (!currentFile) return;
    setStatus("正在导出 Word...");
    
    try {
      const rawHtml = await editor.blocksToHTMLLossy(editor.document);
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, "text/html");

      doc.querySelectorAll('.export-exclude, .bn-block-drag-handle, .bn-side-menu').forEach(el => el.remove());

      // 1. 处理所有普通图片
      const images = doc.querySelectorAll('img');
      for (const img of Array.from(images)) {
          const src = img.getAttribute('src');
          // 🔥 优先读取我们写入的 width 属性
          const explicitWidth = img.getAttribute('width') || img.style.width;
          
          if (src) {
              try {
                  const imgObj = new Image();
                  imgObj.src = src;
                  await new Promise(resolve => {
                      if (imgObj.complete) resolve(true);
                      else { imgObj.onload = () => resolve(true); imgObj.onerror = () => resolve(false); }
                  });

                  if (explicitWidth && parseInt(explicitWidth) > 0) {
                       const w = parseInt(explicitWidth);
                       img.setAttribute('width', w.toString());
                       if (imgObj.naturalWidth > 0) {
                           const ratio = imgObj.naturalHeight / imgObj.naturalWidth;
                           img.setAttribute('height', Math.round(w * ratio).toString());
                       }
                  } else if (imgObj.naturalWidth > 0) {
                      img.setAttribute('width', imgObj.naturalWidth.toString());
                      img.setAttribute('height', imgObj.naturalHeight.toString());
                  }

                  const response = await fetch(src);
                  const blob = await response.blob();
                  const base64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                  });
                  img.setAttribute('src', base64);
              } catch (e) {
                  console.warn("Image export warning:", e);
              }
          }
      }

      // 2. 处理 Mermaid 图表
      const mermaidDivs = doc.querySelectorAll('.mermaid-export-data');
      if (mermaidDivs.length > 0) {
          const tempContainer = document.createElement('div');
          tempContainer.style.position = 'absolute';
          tempContainer.style.top = '-9999px';
          tempContainer.style.visibility = 'hidden';
          document.body.appendChild(tempContainer);

          for (const div of Array.from(mermaidDivs)) {
              const code = (div as HTMLElement).dataset.code;
              const targetWidth = parseInt((div as HTMLElement).style.width) || 600;

              if (code) {
                  try {
                    const id = `mermaid-export-${Math.random().toString(36).substr(2, 9)}`;
                    const { svg } = await mermaid.render(id, code);
                    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
                    const url = URL.createObjectURL(svgBlob);
                    
                    const img = new Image();
                    img.src = url;
                    await new Promise(r => img.onload = r);
                    
                    const canvas = document.createElement('canvas');
                    const scale = 2; 
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.scale(scale, scale);
                        ctx.drawImage(img, 0, 0);
                        const pngBase64 = canvas.toDataURL("image/png");
                        const newImg = document.createElement('img');
                        newImg.src = pngBase64;
                        newImg.width = targetWidth; 
                        div.replaceWith(newImg);
                    }
                    URL.revokeObjectURL(url);
                  } catch (err) {
                      console.error("Mermaid export failed", err);
                      div.innerHTML = `<p style="color:red">[图表导出失败]</p>`;
                  }
              }
          }
          document.body.removeChild(tempContainer);
      }

      const cleanedHtml = doc.body.innerHTML;

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Arial', sans-serif; line-height: 1.6; }
            img { max-width: 100%; height: auto; }
            pre { background: #f5f5f5; padding: 10px; border-radius: 6px; white-space: pre-wrap; font-family: monospace; }
            code { font-family: monospace; }
          </style>
        </head>
        <body>
          <h1 style="border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;">
            ${currentFile.split("/").pop()}
          </h1>
          ${cleanedHtml}
        </body>
        </html>
      `;

      const blob = await asBlob(fullHtml);
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const path = await save({
        defaultPath: `${currentFile.split("/").pop()}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }]
      });

      if (path) {
        await writeFile(path, uint8Array);
        setStatus("导出成功");
        addToast("导出 Word 成功！", 'success');
      }
    } catch (e) {
      console.error(e);
      setStatus("导出失败");
      addToast("导出 Word 失败: " + e, 'error');
    }
  };
  
  // 插入块的辅助函数
  const insertOrReplaceBlock = (editor: any, blockObj: any) => {
    const currentPos = editor.getTextCursorPosition();
    const currentBlock = currentPos.block;
    const isEmpty = Array.isArray(currentBlock.content) && currentBlock.content.length === 0;

    if (isEmpty) {
        editor.replaceBlocks([currentBlock], [blockObj]);
    } else {
        if (currentPos.prevBlock) {
             editor.insertBlocks([blockObj], currentBlock, "after");
        } else {
             editor.insertBlocks([blockObj], currentBlock, "after");
        }
    }
  };

  // 🔥 目录点击跳转逻辑
  const jumpToBlock = (id: string) => {
     const element = document.querySelector(`[data-id="${id}"]`);
     if (element) {
         element.scrollIntoView({ behavior: "smooth", block: "center" });
     }
  };

  return (
    <div style={{ height: "100vh", display: "flex", position: "relative" }}>
      <style>{`
        button[aria-label*="Download"], button[title*="Download"], [class*="bn-file-block"] [role="button"]:has(svg path[d*="M13 10"]), [class*="bn-image-block"] [role="button"]:has(svg path[d*="M13 10"]), [class*="bn-video-block"] [role="button"]:has(svg path[d*="M13 10"]) { display: none !important; }
        .bn-block-content .bn-block-content { background: transparent !important; padding: 0 !important; }
        [data-content-type="codeBlock"] { background: transparent !important; box-shadow: none !important; }
        pre, code, [class*="language-"] { background: transparent !important; background-color: transparent !important; text-shadow: none !important; }
        .bn-block-content { max-width: 100% !important; }
        .bn-block-content[data-content-type="numberedListItem"]::before, .bn-block-content[data-content-type="bulletListItem"]::before { user-select: none !important; }

        @media print {
          .no-print, .bn-side-menu, .bn-formatting-toolbar, button, .export-exclude { display: none !important; }
          html, body, #root, div[style*="height: 100vh"] {
            height: auto !important;
            overflow: visible !important;
            display: block !important;
          }
          .print-content { 
            position: static !important; 
            width: 100% !important; 
            height: auto !important; 
            overflow: visible !important; 
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .bn-block-content[data-placeholder]::before { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, backgroundImage: bgImage ? `url(${convertFileSrc(bgImage)})` : "none", backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#fff" }} className="no-print" />
      <CustomDialog {...dialogState} onConfirm={(val) => dialogState.resolve(val)} onCancel={() => dialogState.resolve(null)} bgImage={bgImage} bgOpacity={bgOpacity} bgBlur={bgBlur} onClearBg={clearBg} onSetBgImage={updateBgImage} onSetBgOpacity={(v) => { setBgOpacity(v); localStorage.setItem("app_bg_opacity", v.toString()); }} onSetBgBlur={(v) => { setBgBlur(v); localStorage.setItem("app_bg_blur", v.toString()); }} />

      {/* Global Search Panel (Ctrl+Shift+F) */}
      {searchOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "10vh", zIndex: 2147483646 }} onClick={() => setSearchOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "720px", maxHeight: "78vh", borderRadius: "14px", boxShadow: "0 24px 48px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", gap: "10px", padding: "18px 22px", borderBottom: "1px solid #f0f0f0", background: "#fafbfc" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#bbb", pointerEvents: "none" }}>🔎</span>
                <input autoFocus type="text" placeholder="搜索所有笔记内容..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Escape') { setSearchOpen(false); }
                    if (e.key === 'Enter') {
                      if (!searchQuery) return;
                      setSearching(true);
                      try { const results = await invoke<any[]>("search_notes", { query: searchQuery }); setSearchResults(results); }
                      catch (err) { console.error(err); }
                      finally { setSearching(false); }
                    }
                  }}
                  style={{ width: "100%", padding: "9px 12px 9px 32px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
                  onFocus={(e) => e.target.style.borderColor = "#1890ff"}
                  onBlur={(e) => e.target.style.borderColor = "#e0e0e0"} />
              </div>
              <button onClick={async () => {
                if (!searchQuery) return;
                setSearching(true);
                try { const results = await invoke<any[]>("search_notes", { query: searchQuery }); setSearchResults(results); }
                catch (err) { console.error(err); }
                finally { setSearching(false); }
              }} style={{ padding: "9px 20px", background: "#1890ff", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap" }}>搜索</button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ display: "flex", gap: "8px", padding: "8px 20px", borderBottom: "1px solid #eee", background: "#fafafa", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#999", whiteSpace: "nowrap" }}>替换为:</span>
                <input type="text" value={searchReplace} onChange={(e) => setSearchReplace(e.target.value)}
                  style={{ flex: 1, padding: "5px 10px", border: "1px solid #e0e0e0", borderRadius: "4px", fontSize: "13px", outline: "none" }} />
                <span style={{ fontSize: "11px", color: "#bbb", whiteSpace: "nowrap" }}>点击文件旁的按钮替换</span>
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
              {searching ? (
                <div style={{ padding: "60px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>搜索中...</div>
              ) : searchResults.length === 0 ? (
                <div style={{ padding: "60px", textAlign: "center", color: "#ccc", fontSize: "14px" }}>{searchQuery ? '没有找到匹配结果' : '输入关键词后按 Enter 开始搜索'}</div>
              ) : (
                (() => {
                  const grouped: Record<string, typeof searchResults> = {};
                  for (const r of searchResults) { (grouped[r.path] ??= []).push(r); }
                  return Object.entries(grouped).map(([path, items]) => (
                    <div key={path} style={{ marginBottom: "8px", border: "1px solid #f0f0f0", borderRadius: "8px", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "#fafbfc", borderBottom: "1px solid #f0f0f0" }}>
                        <div onClick={() => { loadNote(path); setSearchOpen(false); }}
                          style={{ fontWeight: 600, fontSize: "13px", color: "#1890ff", cursor: "pointer", flex: 1, borderRadius: "4px", padding: "2px 4px", margin: "-2px -4px" }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f0f5ff"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
                          📄 {path}
                        </div>
                        <span style={{ fontSize: "11px", color: "#999", marginRight: "8px" }}>{items.length} 处</span>
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          if (!searchReplace && !confirm('替换文本为空，将删除匹配内容。继续？')) return;
                          const content = await invoke<string>("load_note", { path });
                          let newContent = content;
                          let count = 0;
                          newContent = newContent.replace(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), () => { count++; return searchReplace; });
                          await invoke("save_note", { path, content: newContent });
                          addToast(`在「${path}」中替换了 ${count} 处`, 'success');
                          setSearchResults(prev => prev.filter(r => r.path !== path));
                        }}
                          style={{ padding: "3px 10px", background: "#fff", color: "#ff4d4f", border: "1px solid #ffccc7", borderRadius: "4px", cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#fff1f0"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>
                          替换
                        </button>
                      </div>
                      {items.map((r, i) => (
                        <div key={i} onClick={() => { loadNote(path); setSearchOpen(false); }}
                          style={{ padding: "3px 16px", cursor: "pointer", fontSize: "12px", color: "#555", display: "flex", gap: "8px", borderBottom: i < items.length - 1 ? "1px solid #fafafa" : "none" }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
                          <span style={{ color: "#bbb", minWidth: "28px", fontSize: "11px", fontFamily: "monospace" }}>L{r.line}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>{r.content}</span>
                        </div>
                      ))}
                    </div>
                  ));
                })()
              )}
            </div>
            <div style={{ padding: "8px 20px", borderTop: "1px solid #f0f0f0", fontSize: "11px", color: "#bbb", display: "flex", justifyContent: "space-between", background: "#fafbfc" }}>
              <span>{searchResults.length > 0 ? `共 ${searchResults.length} 条匹配` : ''}</span>
              <span>Esc 关闭</span>
            </div>
          </div>
        </div>
      )}

      {/* 侧边栏 */}
      {!isFocusMode && <>
      <div className="no-print" onClick={handleBackgroundClick} style={{ width: isSidebarOpen ? sidebarWidth : 0, borderRight: isSidebarOpen ? "1px solid rgba(0,0,0,0.1)" : "none", background: `rgba(249, 249, 249, ${Math.max(0.6, bgOpacity - 0.1)})`, backdropFilter: `blur(${bgBlur}px)`, display: "flex", flexDirection: "column", overflow: "hidden", transition: isResizing ? "none" : "width 0.2s", zIndex: 1 }}>
        <div style={{ padding: "14px 16px", fontWeight: 700, borderBottom: "1px solid #e8eaed", whiteSpace:"nowrap", display:"flex", justifyContent:"space-between", alignItems:"center", background: "#fafbfc", letterSpacing: "-0.3px" }}>
          <span style={{ fontSize: "14px", color: "#1a1a1a" }}>🗂️ No.1</span>
          <div style={{ display:"flex", gap:"2px" }}>
            <button onClick={() => setShortcutPanel(true)} title="快捷键 (?)"
              style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:"13px", color:"#999", padding:"4px 7px", borderRadius:"5px", transition:"all 0.15s", fontWeight:600 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#e8eaed"; e.currentTarget.style.color = "#555"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#999"; }}>?</button>
            <button onClick={handleOpenSettings} title="设置"
              style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:"15px", color:"#999", padding:"4px 7px", borderRadius:"5px", transition:"all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#e8eaed"; e.currentTarget.style.color = "#555"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#999"; }}>⚙️</button>
          </div>
        </div>
        {/* Favorites section */}
        {[...favPaths].length > 0 && (
          <div style={{ padding: "4px 8px", borderBottom: "1px solid rgba(0,0,0,0.05)", background: "#fefce8" }}>
            <div style={{ fontSize: "10px", color: "#b45309", fontWeight: 600, marginBottom: "2px", paddingLeft: "4px" }}>⭐ 收藏</div>
            {[...favPaths].map(p => (
              <div key={p} onClick={() => loadNote(p)}
                style={{ padding: "3px 8px", cursor: "pointer", fontSize: "12px", color: "#333", borderRadius: "4px", display: "flex", alignItems: "center", gap: "6px" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#fef3c7"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <span>📄</span><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p}</span>
                <span onClick={(e) => { e.stopPropagation(); toggleFav(p); }}
                  style={{ marginLeft:"auto", fontSize:"12px", opacity:0.5, cursor:"pointer" }}>✕</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "0 10px 10px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}><input ref={sidebarSearchRef} type="text" placeholder="🔍 搜索... (Ctrl+K)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const flat = filterNodes(fileTree, searchTerm).flatMap(n => n.is_dir ? [] : [n.path]);
                    if (flat.length >= 1) loadNote(flat[0]);
                  }
                }}
                style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "12px", boxSizing: "border-box", background: "rgba(255,255,255,0.8)" }} /></div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px 4px" }} onClick={handleBackgroundClick}>{renderTree(displayedTree)}</div>
        <div style={{ padding: "8px 16px", cursor:"pointer", borderTop: "1px solid #e8eaed", fontSize:"12px", color:"#888", display:"flex", alignItems:"center", gap:"6px", transition: "all 0.15s" }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          onClick={handleOpenTrash}><span>🗑️</span><span>回收站</span></div>
        <div style={{ padding: "8px 12px", borderTop: "1px solid #e8eaed", background: "#fafbfc" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={() => handleCreate('folder')}
              style={{ flex: 1, padding: "7px", border: "1px solid #e0e0e0", background: "white", borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "#666", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#1890ff"; e.currentTarget.style.color = "#1890ff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e0e0e0"; e.currentTarget.style.color = "#666"; }}>
              + 文件夹
            </button>
            <button onClick={() => handleCreate('note')}
              style={{ flex: 1, padding: "7px", border: "none", background: "#1890ff", color: "white", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 500, transition: "all 0.15s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#40a9ff"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#1890ff"}>
              + 笔记</button>
          </div>
        </div>
      </div>

      {isSidebarOpen && <div className="no-print" onMouseDown={startResizing} style={{ width: "4px", cursor: "col-resize", background: "transparent", zIndex: 10, marginLeft: "-2px" }} />}
      </>}
      
      {/* 主内容区域 */}
      <div className="print-content" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 1, position: "relative" }}>
        
        {/* Tab 栏 */}
        {!isFocusMode && tabs.length > 0 && (
          <div className="no-print" style={{ display: "flex", background: "#f8f9fa", borderBottom: "1px solid #e8eaed", overflowX: "auto", flexShrink: 0, padding: "0 4px" }}>
            {tabs.map((tab, i) => (
              <div key={tab.path} onClick={() => { if (i !== activeTabIndex) loadNote(tab.path); }}
                style={{
                  padding: "7px 14px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "7px",
                  whiteSpace: "nowrap", transition: "all 0.12s",
                  background: i === activeTabIndex ? "#fff" : "transparent",
                  color: i === activeTabIndex ? "#1890ff" : "#5f6368",
                  fontWeight: i === activeTabIndex ? 600 : 400,
                  borderBottom: i === activeTabIndex ? "2px solid #1890ff" : "2px solid transparent",
                  borderRight: "1px solid transparent",
                  borderRadius: "4px 4px 0 0", marginTop: "3px",
                  minWidth: 0
                }}
                onMouseEnter={(e) => { if (i !== activeTabIndex) { e.currentTarget.style.background = "#eef1f5"; e.currentTarget.style.color = "#333"; } }}
                onMouseLeave={(e) => { if (i !== activeTabIndex) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#5f6368"; } }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "130px" }}>{tab.title}</span>
                {tab.isDirty && <span style={{ color: "#faad14", fontSize: "11px" }}>●</span>}
                <span onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
                  style={{ fontSize: "13px", opacity: 0.35, cursor: "pointer", padding: "0 3px", borderRadius: "3px", lineHeight: 1 }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; e.currentTarget.style.background = "#e0e0e0"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.35"; e.currentTarget.style.background = "transparent"; }}
                  title="关闭">✕</span>
              </div>
            ))}
          </div>
        )}

        {/* 顶部栏 */}
        {!isFocusMode && <div className="no-print" style={{ padding: "10px 20px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", background: `rgba(255, 255, 255, ${bgOpacity})`, backdropFilter: `blur(${bgBlur}px)` }}>
          <div style={{display: 'flex', alignItems: 'center'}}>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ border: "none", background: "transparent", cursor: "pointer", marginRight: "8px", fontSize: "14px", color: "#888", width: "28px", height: "28px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f0f0f0"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >{isSidebarOpen ? "◀" : "▶"}</button>
            {/* 目录切换按钮 */}
            {currentFile && (
                <button
                    onClick={() => setIsTocOpen(!isTocOpen)}
                    title={isTocOpen ? "收起大纲" : "展开大纲"}
                    style={{
                        border: "1px solid #e0e0e0",
                        background: isTocOpen ? "#e6f7ff" : "white",
                        color: isTocOpen ? "#1890ff" : "#888",
                        cursor: "pointer", borderRadius: "6px", padding: "3px 10px",
                        fontSize: "12px", display: "flex", alignItems: "center", gap: "5px",
                        marginRight: "8px", transition: "all 0.15s"
                    }}
                >
                    <span>{isTocOpen ? "📖" : "📘"}</span>
                    <span>大纲</span>
                </button>
            )}
            {/* 全局搜索按钮 */}
            <button onClick={() => { setSearchOpen(true); setSearchQuery(""); setSearchResults([]); }}
              title="全局搜索替换 (Ctrl+Shift+F)"
              style={{ border: "1px solid #e0e0e0", background: "white", cursor: "pointer", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", color: "#888", display: "flex", alignItems: "center", gap: "5px", marginRight: "8px", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#1890ff"; e.currentTarget.style.color = "#1890ff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e0e0e0"; e.currentTarget.style.color = "#888"; }}>
              <span>🔎</span><span>搜索替换</span>
            </button>
            {/* 阅读模式 */}
            {currentFile && (
              <button onClick={() => setIsReadMode(!isReadMode)} title={isReadMode ? "编辑模式" : "阅读模式"}
                style={{ border: "1px solid #e0e0e0", background: isReadMode ? "#e6f7ff" : "white", cursor: "pointer", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", color: isReadMode ? "#1677ff" : "#888", display: "flex", alignItems: "center", gap: "5px", marginRight: "8px", transition: "all 0.15s" }}>
                <span>{isReadMode ? "✏️" : "📖"}</span>
              </button>
            )}
            {/* 聚焦模式 */}
            {currentFile && (
              <button onClick={() => setIsFocusMode(!isFocusMode)} title="聚焦模式 (Ctrl+Shift+D)"
                style={{ border: "1px solid #e0e0e0", background: isFocusMode ? "#e6f7ff" : "white", cursor: "pointer", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", color: isFocusMode ? "#1677ff" : "#888", display: "flex", alignItems: "center", gap: "5px", marginRight: "8px", transition: "all 0.15s" }}>
                <span>⛶</span>
              </button>
            )}
            {currentFile && (
                <span style={{ fontSize: "12px", color: "#999", transition: "opacity 0.3s" }}>
                    {lastSaveTime ? `上次保存: ${lastSaveTime}` : ""}
                </span>
            )}
          </div>
          
          <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
            <button onClick={() => editor.undo()} title="撤销 (Ctrl+Z)"
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "14px", color: "#888", padding: "2px 4px", borderRadius: "4px" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f0f0f0"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>↩</button>
            <button onClick={() => editor.redo()} title="重做 (Ctrl+Shift+Z)"
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "14px", color: "#888", padding: "2px 4px", borderRadius: "4px", marginRight: "4px" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f0f0f0"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>↪</button>
            <span style={{ fontSize: "12px", color: (activeTabIndex >= 0 && tabs[activeTabIndex]?.isDirty) ? "#faad14" : "#888", fontWeight: (activeTabIndex >= 0 && tabs[activeTabIndex]?.isDirty) ? "bold" : "normal" }}>{status}</span>
            {currentFile && (
              <div style={{ display: 'flex', gap: '5px', marginRight: '10px' }}>
                <button onClick={handleExportWord} title="导出为 Word" style={{ padding: "4px 8px", border: "1px solid #ddd", background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}><span>📝</span> Word</button>
                <button onClick={handleExportPdf} title="导出为 PDF" style={{ padding: "4px 8px", border: "1px solid #ddd", background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}><span>🖨️</span> PDF</button>
              </div>
            )}
            <button onClick={saveCurrentNote} title="保存 (Ctrl+S)" style={{ padding: "4px 10px", border: "1px solid #ddd", background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center" }}>💾 保存</button>
          </div>
        </div>}

        {/* 聚焦模式浮动退出按钮 */}
        {isFocusMode && (
          <div className="no-print" style={{ position: "absolute", top: "12px", right: "16px", zIndex: 100, display: "flex", gap: "6px" }}>
            <button onClick={() => setIsFocusMode(false)} title="退出聚焦 (Ctrl+Shift+D)"
              style={{ padding: "6px 12px", background: "rgba(0,0,0,0.06)", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", color: "#666", backdropFilter: "blur(8px)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.1)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.06)"}>✕ 退出聚焦</button>
          </div>
        )}

        {/* 内容容器：左侧目录 + 右侧编辑器 */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", background: `rgba(255, 255, 255, ${bgOpacity})`, backdropFilter: `blur(${bgBlur}px)` }}>
            
            {/* 左侧目录栏 (带平滑过渡动画) */}
            <div className="no-print" style={{ 
                width: (currentFile && isTocOpen) ? "200px" : "0px", 
                overflow: "hidden", // 隐藏超出内容
                opacity: (currentFile && isTocOpen) ? 1 : 0,
                padding: (currentFile && isTocOpen) ? "20px 10px" : "0px",
                borderRight: (currentFile && isTocOpen) ? "1px solid rgba(0,0,0,0.05)" : "none",
                flexShrink: 0,
                fontSize: "13px",
                color: "#555",
                transition: "width 0.3s ease, padding 0.3s ease, opacity 0.2s ease, border-right 0.3s", // 添加过渡动画
                whiteSpace: "nowrap" // 防止文字换行
            }}>
                <div style={{ fontWeight: "bold", marginBottom: "10px", paddingLeft: "5px", color: "#333", fontSize: "12px" }}>大纲</div>
                {toc.length === 0 ? (
                    <div style={{ paddingLeft: "5px", color: "#999", fontSize: "12px" }}>无标题</div>
                ) : (
                    toc.map((item) => (
                        <div 
                            key={item.id} 
                            onClick={() => jumpToBlock(item.id)}
                            title={item.text}
                            style={{ 
                                padding: "4px 8px", 
                                marginLeft: `${(item.level - 1) * 12}px`, 
                                cursor: "pointer",
                                borderRadius: "4px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                color: "#666",
                                transition: "background 0.1s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.04)"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                            {item.text}
                        </div>
                    ))
                )}
            </div>

            {/* 编辑器滚动区域 */}
            <div style={{
                flex: 1,
                overflow: "auto",
                padding: "40px 60px",
                paddingBottom: "50vh",
                transition: "padding 0.3s ease"
            }} onBlur={() => { if (activeTabIndex >= 0 && tabs[activeTabIndex]?.isDirty) saveCurrentNote(); }}>
              {/* Inline search bar (Ctrl+F) */}
              {inlineSearch.open && (
                <div className="no-print" style={{ marginBottom: "12px", display: "flex", gap: "8px", alignItems: "center", padding: "8px 12px", background: "#fafbfc", borderRadius: "8px", border: "1px solid #e0e0e0" }}>
                  <input id="inline-search-input" autoFocus type="text" placeholder="笔记内搜索..." value={inlineSearch.query}
                    onChange={(e) => {
                      const q = e.target.value;
                      const results: {blockId:string;text:string}[] = [];
                      editor.document.forEach((b:any) => {
                        const text = b.content?.map((c:any)=>c.text||'').join('') || '';
                        if (text.toLowerCase().includes(q.toLowerCase())) results.push({blockId:b.id, text});
                      });
                      setInlineSearch(prev=>({...prev, query: q, results, idx: results.length>0?0:-1}));
                    }}
                    onKeyDown={(e) => {
                      if (e.key==='Escape') setInlineSearch(prev=>({...prev,open:false}));
                      if (e.key==='Enter') {
                        const r = inlineSearch.results[inlineSearch.idx];
                        if (r) { const el = document.querySelector(`[data-id="${r.blockId}"]`); if (el) el.scrollIntoView({behavior:"smooth",block:"center"}); }
                        setInlineSearch(prev=>({...prev, idx: Math.min(prev.idx+1, prev.results.length-1)}));
                      }
                    }}
                    style={{ flex:1, padding:"6px 10px", border:"1px solid #e0e0e0", borderRadius:"6px", fontSize:"13px", outline:"none" }} />
                  <span style={{ fontSize:"12px", color:"#999", whiteSpace:"nowrap" }}>
                    {inlineSearch.results.length>0 ? `${inlineSearch.idx+1}/${inlineSearch.results.length}` : '无匹配'}
                  </span>
                  <button onClick={() => {
                    if (inlineSearch.results.length===0) return;
                    const ni = inlineSearch.idx>0 ? inlineSearch.idx-1 : inlineSearch.results.length-1;
                    setInlineSearch(prev=>({...prev, idx: ni}));
                    const r = inlineSearch.results[ni];
                    if (r) { const el = document.querySelector(`[data-id="${r.blockId}"]`); if (el) el.scrollIntoView({behavior:"smooth",block:"center"}); }
                  }} style={{ border:"1px solid #e0e0e0", background:"white", borderRadius:"4px", cursor:"pointer", padding:"4px 8px", fontSize:"12px" }}>↑</button>
                  <button onClick={() => {
                    if (inlineSearch.results.length===0) return;
                    const ni = (inlineSearch.idx+1) % inlineSearch.results.length;
                    setInlineSearch(prev=>({...prev, idx: ni}));
                    const r = inlineSearch.results[ni];
                    if (r) { const el = document.querySelector(`[data-id="${r.blockId}"]`); if (el) el.scrollIntoView({behavior:"smooth",block:"center"}); }
                  }} style={{ border:"1px solid #e0e0e0", background:"white", borderRadius:"4px", cursor:"pointer", padding:"4px 8px", fontSize:"12px" }}>↓</button>
                  <button onClick={() => setInlineSearch(prev=>({...prev, open:false}))} style={{ border:"none", background:"transparent", cursor:"pointer", fontSize:"14px", color:"#999" }}>✕</button>
                </div>
              )}
              {currentFile ? (
                 <BlockNoteView key={currentFile} editor={editor} onChange={onEditorChange} theme="light" slashMenu={false} editable={!isReadMode}>
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
                 </BlockNoteView>
              ) : (<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>选择或新建一个笔记</div>)}
            </div>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 2147483646, background: "white", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid #f0f0f0", minWidth: "160px", padding: "4px" }}
          onClick={(e) => e.stopPropagation()}>
          {!ctxMenu.node.is_dir && [
            { label: "📋 详细信息", action: () => handleShowInfo(ctxMenu.node) },
            { label: "⭐ " + (favPaths.has(ctxMenu.node.path)?"取消收藏":"收藏"), action: () => toggleFav(ctxMenu.node.path) },
          ].map(item => (
            <div key={item.label} onClick={item.action}
              style={{ padding: "8px 12px", fontSize: "13px", cursor: "pointer", borderRadius: "4px", color: "#333" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{item.label}</div>
          ))}
          {[
            { label: "✏️ 重命名", action: () => { setCtxMenu(null); handleRename({stopPropagation:()=>{}} as any, ctxMenu.node); } },
            { label: "➜ 移动到...", action: () => { setCtxMenu(null); handleMove({stopPropagation:()=>{}} as any, ctxMenu.node); } },
          ].map(item => (
            <div key={item.label} onClick={item.action}
              style={{ padding: "8px 12px", fontSize: "13px", cursor: "pointer", borderRadius: "4px", color: "#333" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{item.label}</div>
          ))}
          <div style={{ height: "1px", background: "#f0f0f0", margin: "2px 0" }} />
          <div onClick={() => { setCtxMenu(null); handleDelete({stopPropagation:()=>{}} as any, ctxMenu.node.path, ctxMenu.node.is_dir); }}
            style={{ padding: "8px 12px", fontSize: "13px", cursor: "pointer", borderRadius: "4px", color: "#ff4d4f" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#fff1f0"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>🗑️ 删除</div>
        </div>
      )}

      {/* Toast notifications */}
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 2147483647, display: "flex", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, pointerEvents: "auto",
            color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", animation: "toastIn 0.2s ease",
            background: t.type === 'error' ? '#ff4d4f' : t.type === 'success' ? '#52c41a' : '#1890ff'
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Shortcut panel (?) */}
      {shortcutPanel && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2147483647 }} onClick={() => setShortcutPanel(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "480px", borderRadius: "14px", boxShadow: "0 24px 48px rgba(0,0,0,0.18)", padding: "28px 32px" }}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: "16px" }}>⌨️ 快捷键</h3>
            {[
              ["Ctrl+S", "保存当前笔记"],
              ["Ctrl+K", "聚焦侧边栏搜索"],
              ["Ctrl+F", "笔记内搜索定位"],
              ["Ctrl+Shift+F", "全局搜索替换"],
              ["Ctrl+Shift+D", "聚焦模式"],
              ["Ctrl+Z", "撤销 / Ctrl+Shift+Z 重做"],
              ["[[", "Wiki 链接（插入笔记引用）"],
              ["Esc", "关闭当前面板"],
              ["?", "显示此快捷键面板"],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5f5f5", fontSize: "13px" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1890ff", fontSize: "12px" }}>{key}</span>
                <span style={{ color: "#666" }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;