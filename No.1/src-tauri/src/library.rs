use super::{
    data_note_path, ensure_path_within, get_assets_root, get_data_dir, maintenance, safe_join,
    single_file_name, storage, validate_data_relative_path,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    id: String,
    name: String,
    kind: String,
    content: String,
    #[serde(default)]
    source_path: String,
}
#[tauri::command]
pub fn load_templates() -> Result<Vec<Template>, String> {
    let root = get_data_dir();
    let path = root.join(".templates.json");
    ensure_path_within(&root, &path)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("模板文件损坏，原文件已保留：{e}"))
}
#[tauri::command]
pub fn save_templates(templates: Vec<Template>) -> Result<(), String> {
    let _guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let mut ids = std::collections::HashSet::new();
    if templates.len() > 1000 {
        return Err("模板数量超过限制。".into());
    }
    for template in &templates {
        if template.id.is_empty()
            || !ids.insert(&template.id)
            || template.name.trim().is_empty()
            || !["note", "snippet"].contains(&template.kind.as_str())
        {
            return Err("模板名称、类型或编号无效。".into());
        }
    }
    let bytes = serde_json::to_vec_pretty(&templates).map_err(|e| e.to_string())?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("模板总大小超过 8 MB，请将大附件保留为链接。".into());
    }
    let root = get_data_dir();
    let path = root.join(".templates.json");
    ensure_path_within(&root, &path)?;
    if path.exists() {
        let old = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        ensure_path_within(&root, &root.join(".backups/templates"))?;
        storage::save_with_backup(
            &path,
            &root.join(".backups/templates"),
            std::str::from_utf8(&bytes).map_err(|e| e.to_string())?,
            &old,
        )
    } else {
        storage::write_atomic(&path, &bytes)
    }
}
fn private_path(root: &Path, area: &str, note: &str, suffix: &str) -> Result<PathBuf, String> {
    let base = root.join(area);
    ensure_path_within(root, &base)?;
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let rel = validate_data_relative_path(note)?;
    let mut name = rel.into_os_string();
    name.push(suffix);
    safe_join(&base, &PathBuf::from(name))
}

#[derive(Serialize, Deserialize)]
struct HistoryRename {
    old: String,
    new: String,
    directory: bool,
}
fn rename_log(root: &Path) -> Result<Vec<HistoryRename>, String> {
    let path = root.join(".history-renames.json");
    ensure_path_within(root, &path)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("历史版本路径记录损坏: {e}"))
}
pub(super) fn record_history_rename(
    root: &Path,
    old: &str,
    new: &str,
    directory: bool,
) -> Result<(), String> {
    validate_data_relative_path(old)?;
    validate_data_relative_path(new)?;
    let mut log = rename_log(root)?;
    log.push(HistoryRename {
        old: old.replace('\\', "/"),
        new: new.replace('\\', "/"),
        directory,
    });
    storage::write_atomic(
        &root.join(".history-renames.json"),
        &serde_json::to_vec(&log).map_err(|e| e.to_string())?,
    )
}
fn history_paths(root: &Path, path: &str) -> Result<Vec<String>, String> {
    validate_data_relative_path(path)?;
    let mut paths = std::collections::BTreeSet::from([path.replace('\\', "/")]);
    for rule in rename_log(root)?.into_iter().rev() {
        for candidate in paths.clone() {
            if candidate == rule.new
                || (rule.directory && candidate.starts_with(&(rule.new.clone() + "/")))
            {
                let previous = rule.old.clone() + &candidate[rule.new.len()..];
                validate_data_relative_path(&previous)?;
                paths.insert(previous);
            }
        }
    }
    Ok(paths.into_iter().collect())
}

#[tauri::command]
pub fn get_library_root() -> String {
    get_data_dir().to_string_lossy().to_string()
}

#[derive(Serialize)]
pub struct DiskState {
    stamp: String,
    content: Option<String>,
    missing: bool,
}
#[tauri::command]
pub fn note_disk_state(path: String, known_stamp: Option<String>) -> Result<DiskState, String> {
    let path = data_note_path(&path)?;
    let metadata = match fs::metadata(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DiskState {
                stamp: "missing".into(),
                content: None,
                missing: true,
            })
        }
        Err(error) => return Err(error.to_string()),
    };
    let modified = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let stamp = format!("{}:{}", modified.as_nanos(), metadata.len());
    let content = if known_stamp.as_ref() == Some(&stamp) {
        None
    } else {
        Some(fs::read_to_string(path).map_err(|e| e.to_string())?)
    };
    Ok(DiskState {
        stamp,
        content,
        missing: false,
    })
}

#[tauri::command]
pub fn load_workspace() -> Result<serde_json::Value, String> {
    let root = get_data_dir();
    let path = root.join(".workspace.json");
    ensure_path_within(&root, &path)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let raw = fs::read(&path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&raw).map_err(|e| format!("工作区设置损坏，原文件已保留: {e}"))
}
#[tauri::command]
pub fn save_workspace(value: serde_json::Value) -> Result<(), String> {
    let _guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let bytes = serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("工作区设置过大".into());
    }
    let root = get_data_dir();
    let path = root.join(".workspace.json");
    ensure_path_within(&root, &path)?;
    if path.exists() {
        let old = fs::read(&path).map_err(|e| e.to_string())?;
        if serde_json::from_slice::<serde_json::Value>(&old).is_err() {
            let mut backup = tempfile::Builder::new()
                .prefix(".workspace-corrupt-")
                .suffix(".json")
                .tempfile_in(&root)
                .map_err(|e| e.to_string())?;
            use std::io::Write;
            backup.write_all(&old).map_err(|e| e.to_string())?;
            backup.as_file().sync_all().map_err(|e| e.to_string())?;
            backup.keep().map_err(|e| e.to_string())?;
        }
    }
    storage::write_atomic(&path, &bytes)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Draft {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub path: String,
    pub content: String,
    pub base_source: String,
    pub updated_ms: u64,
}
fn draft_path(root: &Path, path: &str, id: Option<&str>) -> Result<PathBuf, String> {
    if let Some(id) = id {
        if id.is_empty()
            || id.len() > 64
            || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err("无效草稿编号".into());
        }
        let dir = private_path(root, ".drafts", path, "")?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        safe_join(&dir, &single_file_name(&format!("{id}.json"))?)
    } else {
        private_path(root, ".drafts", path, ".json")
    }
}
#[tauri::command]
pub fn save_draft(
    path: String,
    content: String,
    base_source: String,
    draft_id: Option<String>,
) -> Result<(), String> {
    let _guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    data_note_path(&path)?;
    let target = draft_path(&get_data_dir(), &path, draft_id.as_deref())?;
    let draft = Draft {
        id: draft_id,
        path,
        content,
        base_source,
        updated_ms: now_ms(),
    };
    storage::write_atomic(
        &target,
        &serde_json::to_vec(&draft).map_err(|e| e.to_string())?,
    )
}
#[tauri::command]
pub fn clear_draft(path: String, draft_id: Option<String>) -> Result<(), String> {
    let _guard = maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let target = draft_path(&get_data_dir(), &path, draft_id.as_deref())?;
    if target.exists() {
        fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn collect_drafts(dir: &Path, out: &mut Vec<Draft>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            collect_drafts(&entry.path(), out)?;
        } else if entry.path().extension().is_some_and(|e| e == "json") {
            // A malformed draft must not prevent recovering other notes.
            if let Ok(draft) =
                serde_json::from_slice::<Draft>(&fs::read(entry.path()).map_err(|e| e.to_string())?)
            {
                if validate_data_relative_path(&draft.path).is_ok() {
                    out.push(draft);
                }
            }
        }
    }
    Ok(())
}
#[tauri::command]
pub fn list_drafts() -> Result<Vec<Draft>, String> {
    let root = get_data_dir();
    let dir = root.join(".drafts");
    ensure_path_within(&root, &dir)?;
    let mut out = vec![];
    collect_drafts(&dir, &mut out)?;
    out.sort_by_key(|d| std::cmp::Reverse(d.updated_ms));
    Ok(out)
}

#[derive(Serialize)]
pub struct Version {
    pub name: String,
    pub origin_path: String,
    pub modified_ms: u64,
    pub bytes: u64,
}
#[tauri::command]
pub fn list_note_versions(path: String) -> Result<Vec<Version>, String> {
    let root = get_data_dir();
    let mut versions = vec![];
    for origin_path in history_paths(&root, &path)? {
        let dir = private_path(&root, ".backups", &origin_path, "")?;
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("before-save-") || !name.ends_with(".md") {
                continue;
            }
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            versions.push(Version {
                name,
                origin_path: origin_path.clone(),
                modified_ms: meta
                    .modified()
                    .unwrap_or(UNIX_EPOCH)
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                bytes: meta.len(),
            });
        }
    }
    versions.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms).then(b.name.cmp(&a.name)));
    Ok(versions)
}
#[tauri::command]
pub fn read_note_version(
    path: String,
    name: String,
    origin_path: Option<String>,
) -> Result<String, String> {
    let root = get_data_dir();
    let origin = origin_path.unwrap_or_else(|| path.clone());
    if !history_paths(&root, &path)?.contains(&origin) {
        return Err("版本不属于此笔记".into());
    }
    let dir = private_path(&root, ".backups", &origin, "")?;
    if !name.starts_with("before-save-") || !name.ends_with(".md") {
        return Err("无效版本".into());
    }
    let target = safe_join(&dir, &single_file_name(&name)?)?;
    fs::read_to_string(target).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn asset_exists(relative: String) -> Result<bool, String> {
    let path = relative
        .strip_prefix("assets/")
        .ok_or("附件必须位于 assets 内")?;
    let root = get_assets_root();
    let target = safe_join(&root, &super::validate_relative_path(path, "附件路径")?)?;
    Ok(target.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_follows_repeated_folder_and_note_renames() {
        let temp = tempfile::tempdir().unwrap();
        record_history_rename(temp.path(), "旧目录", "新目录", true).unwrap();
        record_history_rename(temp.path(), "新目录/笔记", "新目录/改名", false).unwrap();
        let paths = history_paths(temp.path(), "新目录/改名").unwrap();
        assert!(paths.contains(&"旧目录/笔记".to_string()));
        assert!(paths.contains(&"新目录/笔记".to_string()));
        assert!(!history_paths(temp.path(), "新目录相邻/笔记")
            .unwrap()
            .contains(&"旧目录相邻/笔记".to_string()));
        assert!(record_history_rename(temp.path(), "../outside", "note", false).is_err());
    }
    #[test]
    fn private_files_stay_in_the_library() {
        let temp = tempfile::tempdir().unwrap();
        assert!(private_path(temp.path(), ".drafts", "../outside", ".json").is_err());
        assert!(private_path(temp.path(), ".drafts", "目录/笔记", ".json")
            .unwrap()
            .starts_with(temp.path()));
    }
    #[test]
    fn drafts_round_trip_and_bad_entries_do_not_hide_recovery() {
        let temp = tempfile::tempdir().unwrap();
        let draft = Draft {
            id: None,
            path: "目录/笔记".into(),
            content: "恢复正文".into(),
            base_source: "原文".into(),
            updated_ms: 1,
        };
        let path = private_path(temp.path(), ".drafts", &draft.path, ".json").unwrap();
        storage::write_atomic(&path, &serde_json::to_vec(&draft).unwrap()).unwrap();
        fs::write(temp.path().join(".drafts/bad.json"), "broken").unwrap();
        let mut found = vec![];
        collect_drafts(&temp.path().join(".drafts"), &mut found).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].content, "恢复正文");
    }
    #[test]
    fn independent_sessions_do_not_replace_unrecovered_drafts() {
        let root = tempfile::tempdir().unwrap();
        for id in [None, Some("window-one"), Some("window-two")] {
            let draft = Draft {
                id: id.map(str::to_owned),
                path: "笔记".into(),
                content: format!("{id:?}"),
                base_source: "old".into(),
                updated_ms: 1,
            };
            storage::write_atomic(
                &draft_path(root.path(), "笔记", id).unwrap(),
                &serde_json::to_vec(&draft).unwrap(),
            )
            .unwrap();
        }
        fs::remove_file(draft_path(root.path(), "笔记", Some("window-two")).unwrap()).unwrap();
        let mut remaining = vec![];
        collect_drafts(&root.path().join(".drafts"), &mut remaining).unwrap();
        assert_eq!(remaining.len(), 2);
        assert!(draft_path(root.path(), "笔记", Some("../escape")).is_err());
    }
}
