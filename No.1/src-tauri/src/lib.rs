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

// 解析 asset URL 回到本地物理路径
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

    // 简单安全检查（根据需要启用）
    if !p.canonicalize().unwrap_or(p.clone()).starts_with(&data_dir.canonicalize().unwrap_or(data_dir.clone())) {
        // return Err("安全拒绝：禁止删除外部文件".into());
    }

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

#[tauri::command]
fn delete_item(path: String, is_dir: bool) -> Result<(), String> {
    let data_dir = get_data_dir();
    let trash_dir = get_trash_dir();

    let src_path = if is_dir {
        data_dir.join(&path)
    } else {
        data_dir.join(format!("{}.md", path))
    };

    if src_path.exists() {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let file_stem = src_path.file_stem().unwrap().to_string_lossy();
        let extension = if is_dir {
            "".to_string()
        } else {
            format!(".{}", src_path.extension().unwrap().to_string_lossy())
        };
        let trash_name = format!("{}_{}{}", file_stem, timestamp, extension);
        let trash_path = trash_dir.join(&trash_name);

        fs::rename(&src_path, &trash_path).map_err(|e| e.to_string())?;
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

#[tauri::command]
fn empty_trash() -> Result<(), String> {
    let trash_dir = get_trash_dir();
    if trash_dir.exists() {
        fs::remove_dir_all(&trash_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn delete_trash_item(file_name: String) -> Result<(), String> {
    let p = get_trash_dir().join(file_name);
    if p.exists() {
        if p.is_dir() {
            fs::remove_dir_all(p).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn restore_trash_item(file_name: String) -> Result<(), String> {
    let trash_path = get_trash_dir().join(&file_name);
    let data_dir = get_data_dir();
    if !trash_path.exists() {
        return Err("文件不存在".into());
    }

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

    let target_path = data_dir.join(&new_name);
    let final_target = if target_path.exists() {
        data_dir.join(format!("restored_{}", new_name))
    } else {
        target_path
    };

    fs::rename(trash_path, final_target).map_err(|e| e.to_string())?;
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