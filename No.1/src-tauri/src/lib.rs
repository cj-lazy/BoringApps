#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use percent_encoding::percent_decode_str;
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

mod attachments;
mod batch_notes;
mod capture;
mod catalog;
mod jobs;
mod library;
mod library_manager;
mod maintenance;
mod rename_links;
mod search;
mod storage;

#[derive(Serialize, Clone)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<FileNode>,
}

// === 📂 路径辅助函数 ===

fn get_data_dir() -> PathBuf {
    library_manager::root()
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

fn validate_relative_path(path: &str, label: &str) -> Result<PathBuf, String> {
    let relative = PathBuf::from(path);
    if relative.as_os_str().is_empty() {
        return Err(format!("{}不能为空", label));
    }

    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("{}包含非法路径片段", label));
    }
    for component in relative.components() {
        let name = component.as_os_str().to_string_lossy();
        if name.ends_with([' ', '.'])
            || name
                .chars()
                .any(|c| c.is_control() || r#"<>:"|?*"#.contains(c))
        {
            return Err(format!("{}包含非法文件名", label));
        }
        let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
        if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && matches!(stem.as_bytes()[3], b'1'..=b'9'))
        {
            return Err(format!("{}不能使用系统设备名", label));
        }
    }

    Ok(relative)
}

fn validate_data_relative_path(path: &str) -> Result<PathBuf, String> {
    let relative = validate_relative_path(path, "笔记路径")?;
    let first = relative
        .components()
        .next()
        .and_then(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy()),
            _ => None,
        })
        .unwrap_or_default();

    if first.eq_ignore_ascii_case("assets")
        || first.eq_ignore_ascii_case(".trash")
        || first.eq_ignore_ascii_case(".backups")
        || first.starts_with('.')
    {
        return Err("笔记路径不能使用系统保留目录".into());
    }

    Ok(relative)
}

fn ensure_path_within(root: &Path, candidate: &Path) -> Result<(), String> {
    let canonical_root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let mut existing_ancestor = candidate.to_path_buf();

    while !existing_ancestor.exists() {
        if !existing_ancestor.pop() {
            return Err("无法验证目标路径".into());
        }
    }

    let canonical_ancestor = fs::canonicalize(&existing_ancestor).map_err(|e| e.to_string())?;
    if !canonical_ancestor.starts_with(&canonical_root) {
        return Err("目标路径超出允许的目录范围".into());
    }

    Ok(())
}

fn safe_join(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let candidate = root.join(relative);
    ensure_path_within(root, &candidate)?;
    Ok(candidate)
}

fn data_note_path(path: &str) -> Result<PathBuf, String> {
    let relative = validate_data_relative_path(path)?;
    let mut note_path = relative.into_os_string();
    note_path.push(".md");
    safe_join(&get_data_dir(), &PathBuf::from(note_path))
}

fn data_item_path(path: &str, is_dir: bool) -> Result<PathBuf, String> {
    if is_dir {
        let relative = validate_data_relative_path(path)?;
        safe_join(&get_data_dir(), &relative)
    } else {
        data_note_path(path)
    }
}

fn asset_note_dir(note_path: &str) -> Result<PathBuf, String> {
    ensure_path_within(&get_data_dir(), &get_assets_root())?;
    let relative = validate_relative_path(note_path, "资源目录")?;
    safe_join(&get_assets_root(), &relative)
}

fn single_file_name(file_name: &str) -> Result<PathBuf, String> {
    let relative = validate_relative_path(file_name, "文件名")?;
    if relative.components().count() != 1 {
        return Err("文件名不能包含目录".into());
    }
    Ok(relative)
}

fn trash_item_path(file_name: &str) -> Result<PathBuf, String> {
    ensure_path_within(&get_data_dir(), &get_trash_dir())?;
    let relative = single_file_name(file_name)?;
    safe_join(&get_trash_dir(), &relative)
}

fn asset_path_from_url(url: &str) -> Result<PathBuf, String> {
    let decoded_path = parse_asset_url(url)?;
    let supplied = PathBuf::from(&decoded_path);
    let assets_root = get_assets_root();
    ensure_path_within(&get_data_dir(), &assets_root)?;
    let candidate = if supplied.is_absolute() {
        supplied
    } else if let Some(relative) = decoded_path.replace('\\', "/").strip_prefix("assets/") {
        assets_root.join(validate_relative_path(relative, "附件路径")?)
    } else {
        assets_root.join(supplied)
    };
    ensure_path_within(&assets_root, &candidate)?;
    Ok(candidate)
}

fn parse_asset_url(url: &str) -> Result<String, String> {
    let prefixes = [
        "http://asset.localhost/",
        "https://asset.localhost/",
        "asset://localhost/",
        "asset://",
    ];
    let mut path_str = None;
    for prefix in prefixes {
        if let Some(stripped) = url.strip_prefix(prefix) {
            path_str = Some(stripped);
            break;
        }
    }

    let Some(path_str) = path_str else {
        return Ok(url.to_string());
    };
    let decoded = percent_decode_str(path_str)
        .decode_utf8()
        .map(|s| s.to_string())
        .map_err(|e| e.to_string())?;

    Ok(decoded)
}

// === 🟢 Tauri 指令 ===

#[tauri::command]
fn open_file(url: String) -> Result<(), String> {
    let p = asset_path_from_url(&url)?;

    if !p.exists() {
        return Err(format!("文件不存在: {}", p.display()));
    }
    open::that(&p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_asset(url: String) -> Result<(), String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let p = asset_path_from_url(&url)?;

    if p.exists() && p.is_file() {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn gc_unused_assets() -> Result<String, String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let assets_root = get_assets_root();
    ensure_path_within(&get_data_dir(), &assets_root)?;
    remove_empty_dirs(&assets_root);
    Ok("清理完成".into())
}

fn remove_empty_dirs(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if entry
                .file_type()
                .map(|kind| kind.is_symlink())
                .unwrap_or(true)
            {
                continue;
            }
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

    // Read order file if exists
    let order_path = full_path.join(".order.json");
    let order: Vec<String> = fs::read_to_string(&order_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    if let Ok(entries) = fs::read_dir(&full_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            if name == "assets"
                || name == ".trash"
                || name == ".order.json"
                || name.starts_with('.')
            {
                continue;
            }
            if entry
                .file_type()
                .map(|kind| kind.is_symlink())
                .unwrap_or(true)
            {
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

    // Sort by order file (items not in order go to end, sorted by name), dirs first
    let get_order_idx = |name: &str| order.iter().position(|o| o == name).unwrap_or(usize::MAX);
    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(get_order_idx(&a.name).cmp(&get_order_idx(&b.name)))
            .then(a.name.cmp(&b.name))
    });
    nodes
}

#[tauri::command]
fn load_note(path: String) -> Result<String, String> {
    let p = data_note_path(&path)?;
    if !p.exists() {
        return Err("笔记不存在，可能已被移动或删除".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_note(path: String, content: String, expected_content: String) -> Result<String, String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let p = data_note_path(&path)?;
    let backup_root = get_data_dir().join(".backups");
    ensure_path_within(&get_data_dir(), &backup_root)?;
    fs::create_dir_all(&backup_root).map_err(|e| e.to_string())?;
    let backup_dir = safe_join(&backup_root, &validate_data_relative_path(&path)?)?;
    storage::save_with_backup(&p, &backup_dir, &content, &expected_content)?;
    Ok("保存成功".into())
}

#[tauri::command]
fn create_note(path: String) -> Result<(), String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let p = data_note_path(&path)?;
    if p.exists() {
        return Err("文件已存在".into());
    }
    storage::create_empty_note(&p)
}

#[tauri::command]
fn create_folder(path: String) -> Result<(), String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let relative = validate_data_relative_path(&path)?;
    let target = safe_join(&get_data_dir(), &relative)?;
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_item(path: String, is_dir: bool) -> Result<(), String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let trash_dir = get_trash_dir();
    ensure_path_within(&get_data_dir(), &trash_dir)?;
    let src_path = data_item_path(&path, is_dir)?;
    if !src_path.exists() {
        return Err("文件不存在".into());
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let name = src_path.file_name().ok_or("无效文件名")?.to_string_lossy();
    let trash_name = format!("{}_{}", timestamp, name);
    let trash_path = safe_join(&trash_dir, &single_file_name(&trash_name)?)?;
    let metadata_path = trash_item_path(&format!(".{}.json", trash_name))?;
    let relative_source = src_path
        .strip_prefix(get_data_dir())
        .map_err(|e| e.to_string())?;
    let metadata = serde_json::to_vec(&relative_source.to_string_lossy().to_string())
        .map_err(|e| e.to_string())?;
    fs::write(&metadata_path, metadata).map_err(|e| e.to_string())?;
    if let Err(error) = fs::rename(&src_path, &trash_path) {
        let _ = fs::remove_file(metadata_path);
        return Err(error.to_string());
    }
    // Keep assets at their original URLs for undo, shared links and restoration.
    Ok(())
}

#[tauri::command]
fn rename_item(
    old_path: String,
    new_path: String,
    is_dir: bool,
    changes: Option<Vec<rename_links::TextChange>>,
) -> Result<(), String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    rename_links::rename(
        &get_data_dir(),
        old_path,
        new_path,
        is_dir,
        changes.unwrap_or_default(),
    )
}

#[tauri::command]
fn save_image(file_name: String, payload: Vec<u8>, note_path: String) -> Result<String, String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let target_dir = asset_note_dir(&note_path)?;
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }
    let p = safe_join(&target_dir, &single_file_name(&file_name)?)?;
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
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            if name.ends_with(".assets") || name.starts_with('.') {
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

#[tauri::command]
fn empty_trash() -> Result<(), String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let trash_dir = get_trash_dir();
    ensure_path_within(&get_data_dir(), &trash_dir)?;
    if trash_dir.exists() {
        fs::remove_dir_all(&trash_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn delete_trash_item(file_name: String) -> Result<(), String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let p = trash_item_path(&file_name)?;

    if p.exists() {
        if p.is_dir() {
            fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
    }

    let p_assets = trash_item_path(&format!("{}.assets", file_name))?;
    if p_assets.exists() {
        let _ = fs::remove_dir_all(p_assets);
    }

    let metadata = trash_item_path(&format!(".{}.json", file_name))?;
    if metadata.exists() {
        fs::remove_file(metadata).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn restore_trash_item(file_name: String) -> Result<(), String> {
    let _storage_guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let trash_path = trash_item_path(&file_name)?;
    let trash_asset_path = trash_item_path(&format!("{}.assets", file_name))?;
    let metadata_path = trash_item_path(&format!(".{}.json", file_name))?;
    let data_dir = get_data_dir();
    if !trash_path.exists() {
        return Err("文件不存在".into());
    }

    let relative = if metadata_path.exists() {
        let source: String =
            serde_json::from_str(&fs::read_to_string(&metadata_path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        validate_data_relative_path(&source)?
    } else {
        // Compatibility with trash entries created by older versions.
        let new_name = if let Some(idx) = file_name.rfind('_') {
            let (stem, rest) = file_name.split_at(idx);
            let ext = rest.find('.').map(|i| &rest[i..]).unwrap_or("");
            format!("{}{}", stem, ext)
        } else {
            file_name.clone()
        };
        validate_data_relative_path(&new_name)?
    };
    let target = safe_join(&data_dir, &relative)?;
    if target.exists() {
        return Err("原位置已有同名文件，请先移动或重命名该文件再恢复".into());
    }
    let legacy_assets = if trash_asset_path.exists() {
        let name = if trash_path.is_dir() {
            target.file_name()
        } else {
            target.file_stem()
        }
        .ok_or("无效资源目录名")?
        .to_string_lossy();
        let destination = asset_note_dir(&name)?;
        if destination.exists() {
            return Err("原资源目录已存在，已取消恢复以防覆盖附件".into());
        }
        Some(destination)
    } else {
        None
    };
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if let Some(destination) = &legacy_assets {
        fs::rename(&trash_asset_path, destination).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(&trash_path, &target) {
        if let Some(destination) = &legacy_assets {
            let _ = fs::rename(destination, &trash_asset_path);
        }
        return Err(error.to_string());
    }
    if metadata_path.exists() {
        let _ = fs::remove_file(metadata_path);
    }
    Ok(())
}

#[derive(Serialize, Clone)]
struct SearchMatch {
    path: String,
    line: usize,
    content: String,
}

#[tauri::command]
fn search_notes(query: String) -> Result<Vec<SearchMatch>, String> {
    let data_dir = get_data_dir();
    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchMatch> = Vec::new();

    fn search_dir(dir: &Path, query_lower: &str, results: &mut Vec<SearchMatch>, data_dir: &Path) {
        if results.len() >= 100 {
            return;
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if results.len() >= 100 {
                    return;
                }
                let path = entry.path();
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                if name == "assets" || name == ".trash" || name.starts_with('.') {
                    continue;
                }
                if entry
                    .file_type()
                    .map(|kind| kind.is_symlink())
                    .unwrap_or(true)
                {
                    continue;
                }
                if path.is_dir() {
                    search_dir(&path, query_lower, results, data_dir);
                } else if name.ends_with(".md") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        for (i, line) in content.lines().enumerate() {
                            if line.to_lowercase().contains(query_lower) {
                                let rel = path.strip_prefix(data_dir).unwrap_or(&path);
                                let frontend_path = rel
                                    .with_extension("")
                                    .to_string_lossy()
                                    .to_string()
                                    .replace("\\", "/");
                                results.push(SearchMatch {
                                    path: frontend_path,
                                    line: i + 1,
                                    content: line.to_string(),
                                });
                                if results.len() >= 100 {
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    search_dir(&data_dir, &query_lower, &mut results, &data_dir);
    Ok(results)
}

#[derive(Serialize)]
struct NoteInfo {
    path: String,
    size: u64,
    lines: usize,
    created: String,
    modified: String,
}

#[tauri::command]
fn get_note_info(path: String) -> Result<NoteInfo, String> {
    let p = data_note_path(&path)?;
    if !p.exists() {
        return Err("文件不存在".into());
    }
    let meta = p.metadata().map_err(|e| e.to_string())?;
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let lines = content.lines().count();
    let fmt = |t: std::time::SystemTime| -> String {
        let secs = t
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let dt = secs / 86400;
        let time = secs % 86400;
        let h = time / 3600;
        let m = (time % 3600) / 60;
        format!("day{} {:02}:{:02}", dt, h, m)
    };
    Ok(NoteInfo {
        path,
        size: meta.len(),
        lines,
        created: fmt(meta.created().unwrap_or(std::time::SystemTime::now())),
        modified: fmt(meta.modified().unwrap_or(std::time::SystemTime::now())),
    })
}

#[tauri::command]
async fn inspect_storage() -> Result<maintenance::Preview, String> {
    let root = get_data_dir();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = maintenance::STORAGE_MUTATION
            .lock()
            .map_err(|_| "存储锁不可用")?;
        maintenance::inspect(&root)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn cleanup_storage(
    selected: Vec<maintenance::Candidate>,
) -> Result<maintenance::CleanupResult, String> {
    let root = get_data_dir();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = maintenance::STORAGE_MUTATION
            .lock()
            .map_err(|_| "存储锁不可用")?;
        maintenance::clean(&root, selected)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Err(error) = library_manager::initialize() {
                app.dialog()
                    .message(&error)
                    .title("无法打开笔记库")
                    .blocking_show();
                return Err(std::io::Error::other(error).into());
            }
            let assets = get_assets_root();
            ensure_path_within(&get_data_dir(), &assets).map_err(std::io::Error::other)?;
            app.asset_protocol_scope().allow_directory(assets, true)?;
            capture::register_hotkey(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::get_library_root,
            library::note_disk_state,
            library::load_workspace,
            library::save_workspace,
            library::save_draft,
            library::clear_draft,
            library::list_drafts,
            library::list_note_versions,
            library::read_note_version,
            library::asset_exists,
            library::load_templates,
            library::save_templates,
            search::search_notes_page,
            catalog::catalog_delta,
            batch_notes::apply_note_changes,
            jobs::cancel_job,
            attachments::begin_asset_upload,
            attachments::append_asset_upload,
            attachments::finish_asset_upload,
            attachments::cancel_asset_upload,
            attachments::inspect_attachments,
            attachments::import_asset_file,
            attachments::export_note_package,
            capture::show_capture_window,
            capture::save_capture,
            capture::open_captured_note,
            capture::capture_hotkey_status,
            capture::ensure_daily_note,
            library_manager::library_status,
            library_manager::switch_library,
            library_manager::backup_library,
            library_manager::inspect_library_backup,
            library_manager::restore_library_backup,
            inspect_storage,
            cleanup_storage,
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
            restore_trash_item,
            search_notes,
            get_note_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_paths_accept_nested_unicode_names() {
        let path = validate_data_relative_path("项目/分布式多无人机").unwrap();
        assert_eq!(path, PathBuf::from("项目/分布式多无人机"));
    }

    #[test]
    fn relative_paths_reject_traversal_and_absolute_paths() {
        assert!(validate_data_relative_path("../outside").is_err());
        assert!(validate_data_relative_path("folder/../../outside").is_err());
        assert!(validate_data_relative_path(r"C:\Windows\system.ini").is_err());
        assert!(validate_data_relative_path(r"\\server\share\note").is_err());
    }

    #[test]
    fn data_paths_reject_reserved_directories() {
        assert!(validate_data_relative_path("assets/note").is_err());
        assert!(validate_data_relative_path(".trash/note").is_err());
        assert!(validate_data_relative_path(".backups/note").is_err());
    }

    #[test]
    fn uploaded_file_names_cannot_contain_directories() {
        assert!(single_file_name("image.png").is_ok());
        assert!(single_file_name("nested/image.png").is_err());
        assert!(single_file_name("../image.png").is_err());
    }

    #[test]
    fn windows_aliases_and_device_names_are_rejected() {
        for name in [
            "assets. /note",
            "file:stream",
            "NUL.txt",
            "COM1",
            "bad?name",
        ] {
            assert!(validate_data_relative_path(name).is_err(), "{name}");
        }
    }

    #[test]
    fn path_boundary_covers_missing_children_and_sibling_prefixes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("assets");
        let sibling = temp.path().join("assets-other");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&sibling).unwrap();
        assert!(ensure_path_within(&root, &root.join("new/image.png")).is_ok());
        assert!(ensure_path_within(&root, &sibling.join("new.png")).is_err());
    }

    #[test]
    fn asset_url_decoding_does_not_change_raw_file_names() {
        assert_eq!(
            parse_asset_url(r"C:\data\100%20.png").unwrap(),
            r"C:\data\100%20.png"
        );
        assert_eq!(
            parse_asset_url("http://asset.localhost/C%3A/data/%E4%B8%AD%E6%96%87.png").unwrap(),
            "C:/data/中文.png"
        );
    }
}
