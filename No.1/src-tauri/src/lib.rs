#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use percent_encoding::percent_decode_str;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Clone)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<FileNode>,
}

// === 📂 路径辅助函数 ===

fn get_data_dir() -> PathBuf {
    let exe_path = std::env::current_exe().expect("无法获取程序路径");
    let exe_dir = exe_path.parent().expect("无法获取程序目录");
    let data_dir = exe_dir.join("data");
    if !data_dir.exists() {
        let _ = fs::create_dir_all(&data_dir);
    }
    data_dir
}

fn get_assets_root() -> PathBuf {
    let p = get_data_dir().join("assets");
    if !p.exists() {
        let _ = fs::create_dir_all(&p);
    }
    p
}

fn get_trash_dir() -> PathBuf {
    let p = get_data_dir().join(".trash");
    if !p.exists() {
        let _ = fs::create_dir_all(&p);
    }
    p
}

fn parse_asset_url(url: &str) -> Result<String, String> {
    let prefixes = [
        "http://asset.localhost/",
        "https://asset.localhost/",
        "asset://localhost/",
        "asset://",
    ];
    let mut path_str = url;
    for prefix in prefixes {
        if url.starts_with(prefix) {
            path_str = &url[prefix.len()..];
            break;
        }
    }

    let decoded = percent_decode_str(path_str)
        .decode_utf8()
        .map(|s| s.to_string())
        .map_err(|e| e.to_string())?;

    Ok(decoded)
}

// === 🟢 Tauri 指令 ===

#[tauri::command]
fn open_file(url: String) -> Result<(), String> {
    let decoded_path = parse_asset_url(&url)?;
    let p = Path::new(&decoded_path);

    if !p.exists() {
        return Err(format!("文件不存在: {}", decoded_path));
    }
    open::that(p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_asset(url: String) -> Result<(), String> {
    let decoded_path = parse_asset_url(&url)?;
    let p = PathBuf::from(&decoded_path);
    let data_dir = get_data_dir();

    if p.exists() && p.is_file() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

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

            if name == "assets" || name == ".trash" || name.starts_with('.') {
                continue;
            }

            let is_dir = path.is_dir();
            if !is_dir && !name.ends_with(".md") {
                continue;
            }

            let display_name = if is_dir {
                name.clone()
            } else {
                path.file_stem().unwrap().to_string_lossy().to_string()
            };
            let mut next_rel = PathBuf::from(rel_path);
            next_rel.push(&name);

            let path_for_frontend = if is_dir {
                next_rel.to_string_lossy().to_string()
            } else {
                next_rel.with_extension("").to_string_lossy().to_string()
            }
            .replace("\\", "/");

            nodes.push(FileNode {
                name: display_name,
                path: path_for_frontend.clone(),
                is_dir,
                children: if is_dir {
                    scan_dir(base_dir, &next_rel)
                } else {
                    vec![]
                },
            });
        }
    }
    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    nodes
}

#[tauri::command]
fn load_note(path: String) -> Result<String, String> {
    let p = get_data_dir().join(format!("{}.md", path));
    if !p.exists() {
        return Ok("".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_note(path: String, content: String) -> Result<String, String> {
    let p = get_data_dir().join(format!("{}.md", path));
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(p, content).map_err(|e| e.to_string())?;
    Ok("保存成功".into())
}

#[tauri::command]
fn create_note(path: String) -> Result<(), String> {
    let p = get_data_dir().join(format!("{}.md", path));
    if p.exists() {
        return Err("文件已存在".into());
    }
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(p, "# ").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_folder(path: String) -> Result<(), String> {
    let target = get_data_dir().join(path);
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    Ok(())
}

// 🔥🔥 核心修改：删除笔记时，同时把 assets 里的资源文件夹移动到回收站
#[tauri::command]
fn delete_item(path: String, is_dir: bool) -> Result<(), String> {
    let data_dir = get_data_dir();
    let trash_dir = get_trash_dir();
    let assets_root = get_assets_root();

    let src_path = if is_dir {
        data_dir.join(&path)
    } else {
        data_dir.join(format!("{}.md", path))
    };

    if src_path.exists() {
        // 1. 准备回收站的文件名
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let file_stem = src_path.file_stem().unwrap().to_string_lossy();
        let extension = if is_dir {
            "".to_string()
        } else {
            format!(".{}", src_path.extension().unwrap().to_string_lossy())
        };
        // 格式: MyNote_123456.md
        let trash_name = format!("{}_{}{}", file_stem, timestamp, extension);
        let trash_path = trash_dir.join(&trash_name);

        // 2. 移动笔记文件/文件夹到回收站
        fs::rename(&src_path, &trash_path).map_err(|e| e.to_string())?;

        // 3. 🔥 检查并移动关联的 Assets 文件夹
        // 我们假设 assets 路径是 data/assets/{path}
        // 注意：path 参数包含了文件夹结构 (如 "folder/note")
        let src_asset_path = assets_root.join(&path);
        
        if src_asset_path.exists() {
            // 在回收站中给资源文件夹也起个名：MyNote_123456.md.assets
            // 这样删除时方便找，还原时也方便
            let trash_asset_name = format!("{}.assets", trash_name); 
            let trash_asset_path = trash_dir.join(&trash_asset_name);
            
            // 移动资源文件夹
            let _ = fs::rename(src_asset_path, trash_asset_path);
        }
    }
    Ok(())
}

#[tauri::command]
fn rename_item(old_path: String, new_path: String, is_dir: bool) -> Result<(), String> {
    let data_dir = get_data_dir();
    let assets_root = get_assets_root();

    let old_full = if is_dir {
        data_dir.join(&old_path)
    } else {
        data_dir.join(format!("{}.md", old_path))
    };
    let new_full = if is_dir {
        data_dir.join(&new_path)
    } else {
        data_dir.join(format!("{}.md", new_path))
    };

    if let Some(parent) = new_full.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::rename(old_full, new_full).map_err(|e| e.to_string())?;

    let old_asset = assets_root.join(&old_path);
    let new_asset = assets_root.join(&new_path);
    if old_asset.exists() {
        if let Some(parent) = new_asset.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::rename(old_asset, new_asset);
    }
    Ok(())
}

#[tauri::command]
fn save_image(file_name: String, payload: Vec<u8>, note_path: String) -> Result<String, String> {
    let assets_root = get_assets_root();
    let target_dir = assets_root.join(&note_path);
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }
    let p = target_dir.join(&file_name);
    fs::write(&p, payload).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

// === 🗑️ 回收站专用指令 ===

#[derive(Serialize)]
struct TrashItem {
    name: String,
    is_dir: bool,
    path: String,
}

#[tauri::command]
fn get_trash_items() -> Result<Vec<TrashItem>, String> {
    let trash_dir = get_trash_dir();
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&trash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            
            // 🔥 过滤掉我们自己生成的 .assets 后缀的文件夹
            // 这样前端就不会显示 "MyNote.md.assets" 这个奇怪的项
            if name.ends_with(".assets") {
                continue;
            }

            let is_dir = path.is_dir();
            items.push(TrashItem {
                name: name.clone(),
                is_dir,
                path: name,
            });
        }
    }
    Ok(items)
}

// 🔥 核心修改：清空回收站时，因为 assets 也在 .trash 文件夹里，
// fs::remove_dir_all(&trash_dir) 会一次性把笔记和对应的资源全删掉，无需额外逻辑。
#[tauri::command]
fn empty_trash() -> Result<(), String> {
    let trash_dir = get_trash_dir();
    if trash_dir.exists() {
        fs::remove_dir_all(&trash_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 🔥 核心修改：永久删除单个文件时，也要把对应的 assets 文件夹删掉
#[tauri::command]
fn delete_trash_item(file_name: String) -> Result<(), String> {
    let p = get_trash_dir().join(&file_name);
    
    // 尝试删除主文件
    if p.exists() {
        if p.is_dir() {
            fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
    }

    // 🔥 尝试删除关联的 assets 文件夹 (格式是 filename.assets)
    let p_assets = get_trash_dir().join(format!("{}.assets", file_name));
    if p_assets.exists() {
        let _ = fs::remove_dir_all(p_assets);
    }

    Ok(())
}

// 🔥 核心修改：还原文件时，尝试把 assets 文件夹也还原回去
#[tauri::command]
fn restore_trash_item(file_name: String) -> Result<(), String> {
    let trash_path = get_trash_dir().join(&file_name);
    let trash_asset_path = get_trash_dir().join(format!("{}.assets", file_name)); // 对应的资源
    let data_dir = get_data_dir();
    let assets_root = get_assets_root();

    if !trash_path.exists() {
        return Err("文件不存在".into());
    }

    // 解析原始文件名 (去除 _TIMESTAMP 后缀)
    let new_name = if let Some(idx) = file_name.rfind('_') {
        let (stem, rest) = file_name.split_at(idx);
        let ext = if let Some(dot_idx) = rest.find('.') {
            &rest[dot_idx..]
        } else {
            ""
        };
        format!("{}{}", stem, ext)
    } else {
        file_name.clone()
    };

    // 1. 还原笔记文件
    // 这里有个小问题：如果原文件是在子目录里的 (folder/note.md)，在回收站里我们丢失了 'folder' 信息。
    // 所以这里只能还原到根目录 (data/note.md)，或者还原为 "restored_note.md"。
    let target_path = data_dir.join(&new_name);
    let final_target = if target_path.exists() {
        data_dir.join(format!("restored_{}", new_name))
    } else {
        target_path
    };
    fs::rename(&trash_path, &final_target).map_err(|e| e.to_string())?;

    // 2. 🔥 还原 Assets 文件夹 (如果有)
    if trash_asset_path.exists() {
        // 计算还原后的文件名 (无后缀) 作为 asset 目录名
        let restored_stem = final_target.file_stem().unwrap().to_string_lossy();
        
        // 还原到 assets/restored_stem
        let target_asset_path = assets_root.join(restored_stem.to_string());
        
        // 如果目标 asset 目录已存在 (理论上不太可能，除非重名)，我们还是得处理一下覆盖或改名
        if target_asset_path.exists() {
             // 简单处理：覆盖或合并 (这里 fs::rename 目录如果非空可能会报错，先保持简单 rename)
             // 实际更稳妥是 copy or error，这里尝试直接覆盖
             let _ = fs::remove_dir_all(&target_asset_path);
        }
        let _ = fs::rename(trash_asset_path, target_asset_path);
    }

    Ok(())
}

#[cfg_attr(mobile, mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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
            delete_asset,
            get_trash_items,
            empty_trash,
            delete_trash_item,
            restore_trash_item
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}