// ==========================================
// 🛠️ 后端逻辑：资产管理与笔记系统
// ==========================================

use std::fs;
use std::path::{Path, PathBuf};
use serde::Serialize;
use percent_encoding::percent_decode_str;

#[derive(Serialize, Clone)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<FileNode>,
}

// === 📂 路径辅助函数 ===

// 获取数据根目录 (与 exe 同级的 data 文件夹)
fn get_data_dir() -> PathBuf {
    let exe_path = std::env::current_exe().expect("无法获取程序路径");
    let exe_dir = exe_path.parent().expect("无法获取程序目录");
    let data_dir = exe_dir.join("data");
    if !data_dir.exists() {
        let _ = fs::create_dir_all(&data_dir);
    }
    data_dir
}

// 获取资源目录 (data/assets)
fn get_assets_root() -> PathBuf {
    let p = get_data_dir().join("assets");
    if !p.exists() {
        let _ = fs::create_dir_all(&p);
    }
    p
}

// 解析 Tauri Asset URL 转换为本地物理路径
// 兼容不同版本的 Tauri 协议格式
fn parse_asset_url(url: &str) -> Result<String, String> {
    let prefixes = [
        "http://asset.localhost/", 
        "https://asset.localhost/", 
        "asset://localhost/",
        "asset://" // 针对某些版本的简化路径
    ];
    
    let mut path_str = url;

    for prefix in prefixes {
        if url.starts_with(prefix) {
            path_str = &url[prefix.len()..];
            break;
        }
    }

    // 处理百分比编码 (解决中文路径问题)
    percent_decode_str(path_str)
        .decode_utf8()
        .map(|s| s.to_string())
        .map_err(|e| e.to_string())
}

// === 🟢 Tauri 资产管理指令 ===

// 功能：根据 URL 打开物理文件 (双击预览功能)
#[tauri::command]
fn open_file(url: String) -> Result<(), String> {
    let decoded_path = parse_asset_url(&url)?;
    println!("尝试打开文件: {}", decoded_path);

    let p = Path::new(&decoded_path);
    if !p.exists() {
        return Err("文件不存在".into());
    }

    // 调用系统默认程序打开
    open::that(p).map_err(|e| e.to_string())?;
    Ok(())
}

// 功能：物理删除指定的资产文件 (前端保存时差集比对后的结果)
#[tauri::command]
fn delete_asset(url: String) -> Result<(), String> {
    let decoded_path = parse_asset_url(&url)?;
    let p = PathBuf::from(&decoded_path);
    
    // 🔒 安全检查：确保删除的文件路径在 data 目录下，防止目录穿越漏洞
    let data_dir = get_data_dir();
    if !p.canonicalize().unwrap_or(p.clone()).starts_with(&data_dir.canonicalize().unwrap_or(data_dir.clone())) {
        return Err("安全拒绝：禁止删除外部文件".into());
    }

    if p.exists() && p.is_file() {
        println!("🗑️ 正在物理删除孤儿文件: {:?}", p);
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 功能：清理资源库中的空文件夹 (避免笔记改名或删除后留下大量空目录)
#[tauri::command]
fn gc_unused_assets() -> Result<String, String> {
    let assets_root = get_assets_root();
    remove_empty_dirs(&assets_root);
    Ok("清理完成".into())
}

fn remove_empty_dirs(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                remove_empty_dirs(&path);
                // 只有文件夹为空时，remove_dir 才会成功
                let _ = fs::remove_dir(&path);
            }
        }
    }
}

// === 📝 笔记核心指令 ===

#[tauri::command]
fn get_file_tree() -> Result<Vec<FileNode>, String> {
    Ok(scan_dir(&get_data_dir(), Path::new("")))
}

fn scan_dir(base_dir: &Path, rel_path: &Path) -> Vec<FileNode> {
    let full_path = base_dir.join(rel_path);
    let mut nodes = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&full_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            
            // 过滤掉内置的 assets 目录和非笔记文件
            if name == "assets" || name.starts_with('.') { continue; } 
            
            let is_dir = path.is_dir();
            if !is_dir && !name.ends_with(".md") { continue; }

            // 计算展示用的逻辑路径
            let display_name = if is_dir { name.clone() } else { path.file_stem().unwrap().to_string_lossy().to_string() };
            
            let mut next_rel = PathBuf::from(rel_path);
            next_rel.push(&name);
            // 存入前端的 path 不带 .md 后缀，方便处理
            let path_for_frontend = if is_dir {
                next_rel.to_string_lossy().to_string()
            } else {
                next_rel.with_extension("").to_string_lossy().to_string()
            }.replace("\\", "/");

            nodes.push(FileNode {
                name: display_name,
                path: path_for_frontend.clone(),
                is_dir,
                children: if is_dir { scan_dir(base_dir, &next_rel) } else { vec![] }
            });
        }
    }
    // 排序：文件夹在前，按字母顺序
    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    nodes
}

#[tauri::command]
fn load_note(path: String) -> Result<String, String> {
    let p = get_data_dir().join(format!("{}.md", path));
    if !p.exists() { return Ok("".into()); }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_note(path: String, content: String) -> Result<String, String> {
    let p = get_data_dir().join(format!("{}.md", path));
    if let Some(parent) = p.parent() { let _ = fs::create_dir_all(parent); }
    fs::write(p, content).map_err(|e| e.to_string())?;
    Ok("保存成功".into())
}

#[tauri::command]
fn create_note(path: String) -> Result<(), String> {
    let p = get_data_dir().join(format!("{}.md", path));
    if p.exists() { return Err("文件已存在".into()); }
    if let Some(parent) = p.parent() { let _ = fs::create_dir_all(parent); }
    fs::write(p, "# ").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_folder(path: String) -> Result<(), String> {
    let target = get_data_dir().join(path);
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_item(path: String, is_dir: bool) -> Result<(), String> {
    let data_dir = get_data_dir();
    let assets_root = get_assets_root();
    
    let target_path = if is_dir { data_dir.join(&path) } else { data_dir.join(format!("{}.md", path)) };
    
    if target_path.exists() {
        if is_dir {
            fs::remove_dir_all(&target_path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&target_path).map_err(|e| e.to_string())?;
        }
    }

    // 同时删除该笔记对应的整个资产子文件夹
    let asset_folder = assets_root.join(&path); 
    if asset_folder.exists() {
        let _ = fs::remove_dir_all(asset_folder);
    }
    
    Ok(())
}

#[tauri::command]
fn rename_item(old_path: String, new_path: String, is_dir: bool) -> Result<(), String> {
    let data_dir = get_data_dir();
    let assets_root = get_assets_root();
    
    let old_full = if is_dir { data_dir.join(&old_path) } else { data_dir.join(format!("{}.md", old_path)) };
    let new_full = if is_dir { data_dir.join(&new_path) } else { data_dir.join(format!("{}.md", new_path)) };
    
    if let Some(parent) = new_full.parent() { let _ = fs::create_dir_all(parent); }
    fs::rename(old_full, new_full).map_err(|e| e.to_string())?;
    
    // 同步重命名资源文件夹
    let old_asset = assets_root.join(&old_path);
    let new_asset = assets_root.join(&new_path);
    if old_asset.exists() {
        if let Some(parent) = new_asset.parent() { let _ = fs::create_dir_all(parent); }
        let _ = fs::rename(old_asset, new_asset);
    }
    Ok(())
}

#[tauri::command]
fn save_image(file_name: String, payload: Vec<u8>, note_path: String) -> Result<String, String> {
    let assets_root = get_assets_root();
    // note_path 是笔记的相对路径，例如 "Work/Meeting"
    let target_dir = assets_root.join(&note_path);
    if !target_dir.exists() { fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?; }
    
    let p = target_dir.join(&file_name);
    fs::write(&p, payload).map_err(|e| e.to_string())?;
    
    // 返回物理路径，前端会通过 convertFileSrc 转为 asset:// 协议
    Ok(p.to_string_lossy().to_string())
}

// === 🚀 运行入口 ===

#[cfg_attr(mobile, mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_file_tree, 
            load_note, 
            save_note, 
            create_note, 
            create_folder,
            delete_item, 
            rename_item, 
            save_image, 
            gc_unused_assets,
            open_file, 
            delete_asset
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}