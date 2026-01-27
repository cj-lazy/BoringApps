import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ==========================================
// 🎨 自定义弹窗组件
// ==========================================
interface FileNode { name: string; path: string; is_dir: boolean; children: FileNode[]; }

interface DialogProps {
  isOpen: boolean; 
  type: 'confirm' | 'prompt' | 'tree-select' | 'settings' | 'alert' | 'save-guard'; 
  title: string; 
  message?: string; 
  defaultValue?: string; 
  treeData?: FileNode[]; 
  disabledPath?: string;
  bgImage?: string | null;
  bgOpacity?: number;
  bgBlur?: number; 
  onSetBgImage?: (file: File) => void;
  onSetBgOpacity?: (val: number) => void;
  onSetBgBlur?: (val: number) => void; 
  onClearBg?: () => void;
  onConfirm: (value: any) => void; 
  onCancel: () => void;
}

const CustomDialog = ({ 
  isOpen, type, title, message, defaultValue, treeData, disabledPath, 
  bgImage, bgOpacity, bgBlur, onSetBgImage, onSetBgOpacity, onSetBgBlur, onClearBg,
  onConfirm, onCancel 
}: DialogProps) => {
  const [inputValue, setInputValue] = useState(defaultValue || "");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => { 
    if (isOpen) {
      setInputValue(defaultValue || "");
      setExpandedPaths(new Set());
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const renderDialogTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      if (!node.is_dir) return null;
      const isDisabled = disabledPath && (node.path === disabledPath || node.path.startsWith(disabledPath + "/"));
      const isExpanded = expandedPaths.has(node.path);
      const isSelected = inputValue === node.path;
      return (
        <div key={node.path}>
          <div style={{ padding: "6px 8px", paddingLeft: `${depth * 18 + 8}px`, cursor: isDisabled ? "not-allowed" : "pointer", background: isSelected ? "#e6f7ff" : "transparent", color: isDisabled ? "#ccc" : (isSelected ? "#1890ff" : "#333"), borderRadius: "4px", display: "flex", alignItems: "center", marginBottom: "1px", fontSize: "13px" }} onClick={() => { if (isDisabled) return; setInputValue(node.path); }}>
            <span style={{ marginRight: "6px", width: "12px", display: "inline-block", textAlign: "center", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.1s", cursor: "pointer", color: "#999" }} 
              onClick={(e) => { 
                e.stopPropagation(); 
                const newSet = new Set(expandedPaths); 
                if (newSet.has(node.path)) newSet.delete(node.path); else newSet.add(node.path); 
                setExpandedPaths(newSet); 
              }}>▶</span>
            <span style={{ marginRight: "4px" }}>{isExpanded ? "📂" : "📁"}</span><span>{node.name}</span>
          </div>
          {isExpanded && node.children && <div>{renderDialogTree(node.children, depth + 1)}</div>}
        </div>
      );
    });
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2147483647 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: type === 'settings' ? "400px" : "350px", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", padding: "24px", display:"flex", flexDirection:"column", maxHeight:"85vh", animation: "popIn 0.2s ease" }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: "18px", color: "#333", borderBottom: type==='settings'?"1px solid #eee":"none", paddingBottom: type==='settings'?"10px":"0" }}>{title}</h3>
        {message && <p style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#666", lineHeight: "1.5" }}>{message}</p>}
        {type === 'settings' && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "20px" }}>
            <div>
              <label style={{ display:"block", fontSize:"13px", fontWeight:"bold", marginBottom:"8px", color:"#555" }}>自定义背景图</label>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {bgImage ? (<div style={{ width: "60px", height: "40px", borderRadius: "4px", background: `url(${convertFileSrc(bgImage)}) center/cover`, border: "1px solid #ddd" }}></div>) : (<div style={{ width: "60px", height: "40px", borderRadius: "4px", background: "#f0f0f0", border: "1px dashed #ccc", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", color:"#999" }}>无</div>)}
                <input type="file" accept="image/*" id="bg-upload" style={{ display: "none" }} onChange={(e) => { if (e.target.files && e.target.files[0] && onSetBgImage) onSetBgImage(e.target.files[0]); }} />
                <button onClick={() => document.getElementById('bg-upload')?.click()} style={{ padding: "6px 12px", border: "1px solid #ddd", background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>选择图片...</button>
                {bgImage && <button onClick={onClearBg} style={{ padding: "6px 12px", border: "none", background: "#ff4d4f", color: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>清除</button>}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ fontSize:"13px", fontWeight:"bold", color:"#555" }}>白纸浓度 (Opacity)</label>
                <span style={{ fontSize:"12px", color:"#888" }}>{Math.round((bgOpacity || 0.5) * 100)}%</span>
              </div>
              <input type="range" min="0.05" max="1" step="0.05" value={bgOpacity} onChange={(e) => onSetBgOpacity && onSetBgOpacity(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#1890ff" }} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ fontSize:"13px", fontWeight:"bold", color:"#555" }}>毛玻璃模糊 (Blur)</label>
                <span style={{ fontSize:"12px", color:"#888" }}>{bgBlur} px</span>
              </div>
              <input type="range" min="0" max="20" step="1" value={bgBlur} onChange={(e) => onSetBgBlur && onSetBgBlur(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#1890ff" }} />
            </div>
          </div>
        )}
        {type === 'prompt' && <input autoFocus type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') onConfirm(inputValue); }} style={{ width: "100%", padding: "10px", marginBottom: "20px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />}
        {type === 'tree-select' && treeData && (
          <div style={{ flex: 1, overflowY: "auto", border: "1px solid #eee", borderRadius: "6px", padding: "5px", marginBottom: "20px", minHeight: "200px" }}>
            {renderDialogTree(treeData)}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button onClick={onCancel} style={{ padding: "8px 16px", border: "1px solid #ddd", borderRadius: "6px", background: "white", color: "#666", cursor: "pointer", fontSize: "14px" }}>取消</button>
          <button onClick={() => onConfirm(type === 'prompt' || type === 'tree-select' ? inputValue : true)} style={{ padding: "8px 16px", border: "none", borderRadius: "6px", background: "#1890ff", color: "white", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}>确定</button>
        </div>
      </div>
      <style>{`@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
};

// ==========================================
// 📦 主程序逻辑
// ==========================================

function App() {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [status, setStatus] = useState("就绪");
  
  const isDirtyRef = useRef(false);
  const isLoadingRef = useRef(false);
  const isExitingRef = useRef(false);
  
  // 🟢 追踪当前笔记中曾经出现过的所有资源 URL (包括加载时的和新上传的)
  const [initialAssetUrls, setInitialAssetUrls] = useState<Set<string>>(new Set()); 

  const currentFileRef = useRef<string | null>(null);
  useEffect(() => { currentFileRef.current = currentFile; }, [currentFile]);

  const [bgImage, setBgImage] = useState<string | null>(localStorage.getItem("app_bg_image"));
  const [bgOpacity, setBgOpacity] = useState<number>(parseFloat(localStorage.getItem("app_bg_opacity") || "0.5"));
  const [bgBlur, setBgBlur] = useState<number>(parseInt(localStorage.getItem("app_bg_blur") || "0"));

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean; type: 'confirm' | 'prompt' | 'tree-select' | 'settings' | 'alert' | 'save-guard'; 
    title: string; message?: string; defaultValue?: string; 
    treeData?: FileNode[]; disabledPath?: string; 
    resolve: (value: any) => void;
  }>({ isOpen: false, type: 'confirm', title: '', resolve: () => {} });

  const showDialog = (type: 'confirm' | 'prompt' | 'tree-select' | 'settings' | 'alert' | 'save-guard', title: string, message?: string, defaultValue?: string, treeData?: FileNode[], disabledPath?: string): Promise<any> => {
    return new Promise((resolve) => {
      setDialogState({ isOpen: true, type, title, message, defaultValue, treeData, disabledPath, resolve: (val: any) => { setDialogState(prev => ({ ...prev, isOpen: false })); resolve(val); } });
    });
  };

  // 🟢 辅助函数：从 BlockNote 节点中提取所有资源的 URL
  const getAllAssetUrls = (blocks: any[]): Set<string> => {
    const urls = new Set<string>();
    blocks.forEach((block: any) => {
      // 检查 image, video, file, audio 等含有 url 属性的 block
      if (block.props && block.props.url) {
        urls.add(block.props.url);
      }
      // 如果有子块，递归（虽然 BlockNote 目前媒体块通常没有子块，但为了严谨）
      if (block.content && Array.isArray(block.content)) {
        // inline content 暂不处理，媒体通常是 block 级别
      }
      if (block.children) {
        const childUrls = getAllAssetUrls(block.children);
        childUrls.forEach(u => urls.add(u));
      }
    });
    return urls;
  };

  const uploadFile = async (file: File) => {
    if (!currentFileRef.current) {
      await showDialog('alert', '提示', '请先在侧边栏选中一个笔记，然后再上传。');
      return "";
    }
    try {
      setStatus("上传中...");
      const filename = `${new Date().getTime()}_${file.name}`;
      const payload = Array.from(new Uint8Array(await file.arrayBuffer()));
      // 后端保存文件
      const path = await invoke<string>("save_image", { fileName: filename, payload, notePath: currentFileRef.current });
      const assetUrl = convertFileSrc(path);
      
      // 🟢 关键：新上传的文件也要加入追踪列表，否则如果用户上传后又删除了它并保存，程序不知道要删掉它
      setInitialAssetUrls(prev => new Set([...prev, assetUrl]));
      
      setStatus("文件已保存");
      return assetUrl;
    } catch (e) { 
      console.error(e); 
      await showDialog('alert', '上传失败', `错误信息: ${e}`);
      return ""; 
    }
  };
  
  const editor = useCreateBlockNote({ uploadFile });

  const refreshTree = async () => { try { const tree = await invoke<FileNode[]>("get_file_tree"); setFileTree(tree); } catch (e) { console.error(e); } };

  // 🟢 核心功能：保存时对比并执行物理删除
  const saveCurrentNote = async () => {
    const fileToSave = currentFileRef.current;
    if (!fileToSave) return;
    setStatus("正在保存...");
    try {
      const currentBlocks = editor.document;
      
      // 1. 扫描当前文档中实际存在的 URL
      const currentAssetUrls = getAllAssetUrls(currentBlocks);

      // 2. 找出被用户移除的资源：在 initialAssetUrls 中但不在 currentAssetUrls 中
      const deletedUrls = Array.from(initialAssetUrls).filter(url => !currentAssetUrls.has(url));
      
      // 3. 执行物理删除（调用后端指令）
      for (const url of deletedUrls) {
        console.log("检测到文件移除，执行物理删除:", url);
        try {
          // 注意：后端 delete_asset 需要能处理 convertFileSrc 转换后的 URL 
          // 或者在前端转换回原始路径传给后端
          await invoke("delete_asset", { url });
        } catch (err) {
          console.error("物理删除失败", err);
        }
      }

      // 4. 保存文档内容
      const content = await editor.blocksToMarkdownLossy(currentBlocks);
      await invoke("save_note", { path: fileToSave, content });
      
      // 5. 更新追踪基准：现在文档中的 URL 就是下次对比的基准
      setInitialAssetUrls(currentAssetUrls);
      isDirtyRef.current = false;
      setStatus("已保存");
    } catch(e) {
      setStatus("保存失败");
      console.error(e);
    }
  };

  const loadNote = async (path: string) => { 
    if (isDirtyRef.current) { await saveCurrentNote(); }
    setStatus(`加载 ${path}...`); 
    isLoadingRef.current = true; 
    try { 
      const content = await invoke<string>("load_note", { path }); 
      const blocks = await editor.tryParseMarkdownToBlocks(content); 
      editor.replaceBlocks(editor.document, blocks.length === 0 ? [{ type: "paragraph", content: [] }] : blocks); 
      
      // 🟢 加载笔记后，解析并记录当前所有存在的资产 URL 作为基准
      const assetUrls = getAllAssetUrls(blocks);
      setInitialAssetUrls(assetUrls);

      setCurrentFile(path); 
      isDirtyRef.current = false; 
      setStatus("已加载"); 
    } catch (e) { 
        console.error(e);
        setStatus("加载失败"); 
    } 
    finally {
      setTimeout(() => { isLoadingRef.current = false; }, 300);
    }
  };

  const onChange = async () => {
    if (isExitingRef.current || isLoadingRef.current || !currentFileRef.current) return;
    if (!isDirtyRef.current) {
        isDirtyRef.current = true;
        setStatus("● 未保存"); 
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { 
        e.preventDefault(); 
        saveCurrentNote(); 
      } 
    };
    
    const handleGlobalDblClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const contentBlock = target.closest('.bn-block-content');
      if (contentBlock && contentBlock.getAttribute('data-content-type') === 'file') {
        const outerBlock = target.closest('.bn-block-outer');
        const blockId = outerBlock?.getAttribute('data-id');
        if (blockId) {
          const block = editor.getBlock(blockId);
          if (block && block.type === 'file' && (block.props as any).url) {
            e.preventDefault();
            e.stopPropagation();
            try {
              await invoke("open_file", { url: (block.props as any).url });
            } catch (err) {
              console.error("双击打开失败:", err);
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("dblclick", handleGlobalDblClick, true);

    const setupCloseListener = async () => {
        const appWindow = getCurrentWindow();
        const unlisten = await appWindow.onCloseRequested(async (event) => {
            if (isExitingRef.current || !isDirtyRef.current) return;
            event.preventDefault(); 
            const choice = await showDialog('save-guard', '未保存的更改', '当前笔记有未保存的更改，是否保存？');
            if (choice === true) {
                await saveCurrentNote();
                isExitingRef.current = true;
                await appWindow.close();
            } else if (choice === 'discard') {
                isExitingRef.current = true;
                await appWindow.close();
            } 
        });
        return unlisten;
    };

    const unlistenPromise = setupCloseListener();

    return () => { 
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("dblclick", handleGlobalDblClick, true);
      unlistenPromise.then(unlisten => unlisten());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, initialAssetUrls]); // initialAssetUrls 变化时重新绑定逻辑

  const toggleFolder = (path: string) => { 
    const newSet = new Set(expandedFolders); 
    if (newSet.has(path)) newSet.delete(path); else newSet.add(path); 
    setExpandedFolders(newSet); 
    setSelectedFolder(path); 
  };

  const handleSelect = (node: FileNode) => { 
    if (node.is_dir) toggleFolder(node.path); 
    else { 
      loadNote(node.path); 
      const parentPath = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : null; 
      setSelectedFolder(parentPath); 
    } 
  };

  const silentGC = async () => { try { await invoke("gc_unused_assets"); } catch (e) { console.warn(e); } };

  const handleMove = async (e: React.MouseEvent, node: FileNode) => {
    e.stopPropagation();
    const currentParent = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : "";
    const targetFolder = await showDialog('tree-select', '移动到...', `选择 "${node.name}" 的新位置：`, currentParent, fileTree, node.is_dir ? node.path : undefined);
    if (targetFolder === null || targetFolder === currentParent) return;
    const srcPath = node.path; const srcName = node.name; const newPath = targetFolder ? `${targetFolder}/${srcName}` : srcName;
    try { await saveCurrentNote(); await invoke("rename_item", { oldPath: srcPath, newPath: newPath, isDir: node.is_dir }); await refreshTree(); if (currentFile === srcPath) setCurrentFile(newPath); } catch (err) { alert("移动失败: " + err); }
  };

  const handleDelete = async (e: React.MouseEvent, path: string, is_dir: boolean) => { 
    e.stopPropagation(); 
    const confirmed = await showDialog('confirm', `删除`, `确认要删除 "${path}" 吗？`); 
    if (!confirmed) return; 
    try { 
      if (currentFile === path || (currentFile && currentFile.startsWith(path + "/"))) { 
        setCurrentFile(null); 
        isDirtyRef.current = false; 
        editor.replaceBlocks(editor.document, []); 
        setInitialAssetUrls(new Set()); // 清空资产追踪
      } 
      await invoke("delete_item", { path: path, isDir: is_dir }); 
      await refreshTree(); 
      silentGC(); 
    } catch (err) { alert("删除失败: " + err); } 
  };

  const handleRename = async (e: React.MouseEvent, node: FileNode) => { e.stopPropagation(); const newName = await showDialog('prompt', '重命名', undefined, node.name); if (!newName || newName === node.name) return; const parentDir = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : ""; const newPath = parentDir ? `${parentDir}/${newName}` : newName; try { await saveCurrentNote(); await invoke("rename_item", { oldPath: node.path, newPath: newPath, isDir: node.is_dir }); await refreshTree(); if (currentFile === node.path) setCurrentFile(newPath); } catch (err) { alert("重命名失败: " + err); } };
  
  const handleCreate = async (type: 'folder' | 'note') => { 
    const title = type === 'folder' ? "新建文件夹" : "新建笔记"; 
    const name = await showDialog('prompt', title, "请输入名称："); 
    if (!name) return; 
    const basePath = selectedFolder ? `${selectedFolder}/${name}` : name; 
    try { 
      await saveCurrentNote(); 
      if (type === 'folder') { 
        await invoke("create_folder", { path: basePath }); 
      } else { 
        await invoke("create_note", { path: basePath }); 
        await loadNote(basePath); 
      } 
      await refreshTree(); 
    } catch (e) { alert("创建失败: " + e); } 
  };

  const handleOpenSettings = () => showDialog('settings', '外观设置');

  const updateBgImage = async (file: File) => {
    try {
      const filename = `bg_${new Date().getTime()}_${file.name}`;
      const payload = Array.from(new Uint8Array(await file.arrayBuffer()));
      const path = await invoke<string>("save_image", { fileName: filename, payload, notePath: "wallpapers" });
      setBgImage(path);
      localStorage.setItem("app_bg_image", path);
    } catch (e) { alert("壁纸设置失败: " + e); }
  };

  const updateBgOpacity = (val: number) => { setBgOpacity(val); localStorage.setItem("app_bg_opacity", val.toString()); };
  const updateBgBlur = (val: number) => { setBgBlur(val); localStorage.setItem("app_bg_blur", val.toString()); };
  const clearBg = () => { setBgImage(null); localStorage.removeItem("app_bg_image"); };

  useEffect(() => { refreshTree(); silentGC(); }, []);

  const filterNodes = (nodes: FileNode[], term: string): FileNode[] => { 
    if (!term) return nodes; 
    return nodes.map(node => { 
      if (node.is_dir) { 
        const children = filterNodes(node.children, term); 
        if (children.length > 0 || node.name.toLowerCase().includes(term.toLowerCase())) { 
          return { ...node, children }; 
        } 
        return null; 
      } 
      return node.name.toLowerCase().includes(term.toLowerCase()) ? node : null; 
    }).filter(Boolean) as FileNode[]; 
  };

  const displayedTree = useMemo(() => filterNodes(fileTree, searchTerm), [fileTree, searchTerm]);
  const startResizing = useCallback(() => setIsResizing(true), []);
  const stopResizing = useCallback(() => setIsResizing(false), []);
  const resize = useCallback((e: MouseEvent) => { if (isResizing) setSidebarWidth(Math.max(150, Math.min(e.clientX, 600))); }, [isResizing]);
  
  useEffect(() => { 
    window.addEventListener("mousemove", resize); 
    window.addEventListener("mouseup", stopResizing); 
    return () => { 
      window.removeEventListener("mousemove", resize); 
      window.removeEventListener("mouseup", stopResizing); 
    }; 
  }, [resize, stopResizing]);

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedFolders.has(node.path) || searchTerm.length > 0;
      return (
        <div key={node.path}>
          <div onClick={() => handleSelect(node)} style={{ padding: "6px 10px", paddingLeft: `${depth * 15 + 10}px`, cursor: "pointer", background: currentFile === node.path ? "#e6f7ff" : (selectedFolder === node.path && node.is_dir ? "#f0f0f0" : "transparent"), color: currentFile === node.path ? "#1890ff" : "#333", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px", borderRadius: "4px", marginBottom: "2px", userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center", overflow: "hidden", flex: 1 }}>
              <span style={{ marginRight: "4px", fontSize: "10px", width: "14px", textAlign: "center", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.1s ease", color: "#999" }} 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  toggleFolder(node.path); 
                }}>▶</span>
              <span style={{ marginRight: "6px", fontSize: "16px" }}>{node.is_dir ? (isExpanded ? "📂" : "📁") : "📄"}</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.name}</span>
            </div>
            <div style={{ display: "flex", gap: "2px" }}>
              <button onClick={(e) => handleMove(e, node)} title="移动" style={{ border:"none", background:"transparent", cursor:"pointer", opacity:0.4 }}>➜</button>
              <button onClick={(e) => handleRename(e, node)} title="重命名" style={{ border:"none", background:"transparent", cursor:"pointer", opacity:0.4 }}>✏️</button>
              <button onClick={(e) => handleDelete(e, node.path, node.is_dir)} title="删除" style={{ border:"none", background:"transparent", cursor:"pointer", opacity:0.4 }}>✕</button>
            </div>
          </div>
          {node.is_dir && isExpanded && (<div>{node.children && node.children.length > 0 ? renderTree(node.children, depth + 1) : <div style={{ paddingLeft: `${(depth + 1) * 15 + 30}px`, fontSize: "12px", color: "#ccc", padding: "4px 0" }}>(空)</div>}</div>)}
        </div>
      );
    });
  };

  return (
    <div style={{ height: "100vh", display: "flex", position: "relative" }}>
      {/* 🟢 全局 CSS 拦截隐藏下载按钮 */}
      <style>{`
        button[aria-label*="Download"], 
        button[title*="Download"],
        [class*="bn-file-block"] [role="button"]:has(svg path[d*="M13 10"]),
        [class*="bn-image-block"] [role="button"]:has(svg path[d*="M13 10"]),
        [class*="bn-video-block"] [role="button"]:has(svg path[d*="M13 10"]) { 
          display: none !important; 
        }
      `}</style>

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, backgroundImage: bgImage ? `url(${convertFileSrc(bgImage)})` : "none", backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#fff" }} />
      <CustomDialog 
        isOpen={dialogState.isOpen} type={dialogState.type} title={dialogState.title} message={dialogState.message} 
        defaultValue={dialogState.defaultValue} treeData={dialogState.treeData} disabledPath={dialogState.disabledPath} 
        bgImage={bgImage} bgOpacity={bgOpacity} bgBlur={bgBlur} onSetBgImage={updateBgImage} onSetBgOpacity={updateBgOpacity} 
        onSetBgBlur={updateBgBlur} onClearBg={clearBg} onConfirm={(val) => dialogState.resolve(val)} onCancel={() => dialogState.resolve(null)} 
      />
      
      <div style={{ width: isSidebarOpen ? sidebarWidth : 0, borderRight: isSidebarOpen ? "1px solid rgba(0,0,0,0.1)" : "none", background: `rgba(249, 249, 249, ${Math.max(0.6, bgOpacity - 0.1)})`, backdropFilter: `blur(${bgBlur}px)`, display: "flex", flexDirection: "column", overflow: "hidden", transition: isResizing ? "none" : "width 0.2s", zIndex: 1 }}>
        <div style={{ padding: "15px", fontWeight: "bold", borderBottom: "1px solid rgba(0,0,0,0.05)", whiteSpace:"nowrap", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>🗂️ 无聊的产品线No.1</span>
          <button onClick={handleOpenSettings} title="设置" style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:"16px", opacity: 0.6 }}>⚙️</button>
        </div>
        <div style={{ padding: "0 10px 10px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
          <input type="text" placeholder="🔍 搜索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "12px", boxSizing: "border-box", background: "rgba(255,255,255,0.8)" }} />
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "10px 0" }}>{renderTree(displayedTree)}</div>
        <div style={{ padding: "10px", borderTop: "1px solid rgba(0,0,0,0.05)", background: "rgba(255,255,255,0.4)" }}>
          <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
            <button onClick={() => handleCreate('folder')} style={{ flex: 1, padding: "8px", border: "1px solid #ddd", background: "rgba(255,255,255,0.8)", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>+ 文件夹</button>
            <button onClick={() => handleCreate('note')} style={{ flex: 1, padding: "8px", border: "none", background: "#1890ff", color: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>+ 笔记</button>
          </div>
        </div>
      </div>

      {isSidebarOpen && <div onMouseDown={startResizing} style={{ width: "4px", cursor: "col-resize", background: "transparent", zIndex: 10, marginLeft: "-2px" }} />}
      
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 1, position: "relative" }}>
        <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", background: `rgba(255, 255, 255, ${bgOpacity})`, backdropFilter: `blur(${bgBlur}px)` }}>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{isSidebarOpen ? "◀" : "▶"}</button>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <span style={{ fontSize: "12px", color: status === "● 未保存" ? "#faad14" : "#888", fontWeight: status === "● 未保存" ? "bold" : "normal" }}>{status}</span>
            <button onClick={saveCurrentNote} title="保存 (Ctrl+S)" style={{ padding: "4px 10px", border: "1px solid #ddd", background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center" }}>💾 保存</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "40px 60px", background: `rgba(255, 255, 255, ${bgOpacity})`, backdropFilter: `blur(${bgBlur}px)` }}>
          {currentFile ? <BlockNoteView key={currentFile} editor={editor} onChange={onChange} theme="light" /> : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>选择或新建一个笔记</div>}
        </div>
      </div>
    </div>
  );
}

export default App;