use crate::rename_links::TextChange;
use std::{
    fs,
    path::{Path, PathBuf},
};
fn note_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let mut relative = crate::validate_data_relative_path(path)?.into_os_string();
    relative.push(".md");
    crate::safe_join(root, &PathBuf::from(relative))
}
pub fn recover(root: &Path) -> Result<(), String> {
    let journal = root.join(".pending-batch.json");
    crate::ensure_path_within(root, &journal)?;
    if !journal.exists() {
        return Ok(());
    }
    let changes: Vec<TextChange> =
        serde_json::from_slice(&fs::read(&journal).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    for change in &changes {
        let current =
            fs::read_to_string(note_path(root, &change.path)?).map_err(|e| e.to_string())?;
        if current != change.before && current != change.after {
            return Err(format!(
                "批量整理中断，{} 有额外修改；恢复记录已保留。",
                change.path
            ));
        }
    }
    for change in changes {
        crate::storage::write_atomic(&note_path(root, &change.path)?, change.before.as_bytes())?;
    }
    fs::remove_file(journal).map_err(|e| e.to_string())
}
pub fn apply(root: &Path, changes: Vec<TextChange>) -> Result<usize, String> {
    recover(root)?;
    let changes: Vec<_> = changes
        .into_iter()
        .filter(|c| c.before != c.after)
        .collect();
    if changes.is_empty() {
        return Ok(0);
    }
    let mut paths = std::collections::HashSet::new();
    for change in &changes {
        if !paths.insert(change.path.to_lowercase()) {
            return Err("批量选择包含重复笔记。".into());
        }
        if fs::read_to_string(note_path(root, &change.path)?).map_err(|e| e.to_string())?
            != change.before
        {
            return Err(format!(
                "{} 已被外部修改，整批操作已取消，请刷新后重试。",
                change.path
            ));
        }
    }
    let journal = root.join(".pending-batch.json");
    crate::ensure_path_within(root, &journal)?;
    crate::storage::write_atomic(
        &journal,
        &serde_json::to_vec(&changes).map_err(|e| e.to_string())?,
    )?;
    let result = (|| {
        for change in &changes {
            let backups = root
                .join(".backups")
                .join(crate::validate_data_relative_path(&change.path)?);
            crate::ensure_path_within(root, &backups)?;
            crate::storage::save_with_backup(
                &note_path(root, &change.path)?,
                &backups,
                &change.after,
                &change.before,
            )?;
        }
        fs::remove_file(&journal).map_err(|e| e.to_string())
    })();
    if let Err(error) = result {
        return match recover(root) {
            Ok(()) => Err(format!("批量操作已回退：{error}")),
            Err(restore) => Err(format!("{error}；{restore}")),
        };
    }
    Ok(changes.len())
}
#[tauri::command]
pub async fn apply_note_changes(changes: Vec<TextChange>) -> Result<usize, String> {
    let root = crate::get_data_dir();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = crate::maintenance::STORAGE_MUTATION
            .lock()
            .map_err(|_| "存储锁不可用")?;
        apply(&root, changes)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn batch_conflict_preserves_every_original() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("a.md"), "a").unwrap();
        fs::write(root.path().join("b.md"), "external").unwrap();
        assert!(apply(
            root.path(),
            vec![
                TextChange {
                    path: "a".into(),
                    before: "a".into(),
                    after: "new".into()
                },
                TextChange {
                    path: "b".into(),
                    before: "b".into(),
                    after: "new".into()
                }
            ]
        )
        .is_err());
        assert_eq!(fs::read_to_string(root.path().join("a.md")).unwrap(), "a");
    }
    #[test]
    fn interrupted_batch_rolls_back_only_expected_versions() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("a.md"), "after").unwrap();
        let changes = vec![TextChange {
            path: "a".into(),
            before: "before".into(),
            after: "after".into(),
        }];
        fs::write(
            root.path().join(".pending-batch.json"),
            serde_json::to_vec(&changes).unwrap(),
        )
        .unwrap();
        recover(root.path()).unwrap();
        assert_eq!(
            fs::read_to_string(root.path().join("a.md")).unwrap(),
            "before"
        );
    }
}
