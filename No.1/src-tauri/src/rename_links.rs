use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
#[derive(Serialize, Deserialize)]
pub struct TextChange {
    pub path: String,
    pub before: String,
    pub after: String,
}
#[derive(Serialize, Deserialize)]
struct Journal {
    old: String,
    new: String,
    directory: bool,
    changes: Vec<TextChange>,
    history: Option<String>,
}
fn item(root: &Path, path: &str, directory: bool) -> Result<PathBuf, String> {
    let mut relative = crate::validate_data_relative_path(path)?.into_os_string();
    if !directory {
        relative.push(".md");
    }
    crate::safe_join(root, &PathBuf::from(relative))
}
fn remap(path: &str, journal: &Journal) -> String {
    if path == journal.old || (journal.directory && path.starts_with(&(journal.old.clone() + "/")))
    {
        journal.new.clone() + &path[journal.old.len()..]
    } else {
        path.to_owned()
    }
}
fn rollback(root: &Path, journal: &Journal) -> Result<(), String> {
    let old = item(root, &journal.old, journal.directory)?;
    let new = item(root, &journal.new, journal.directory)?;
    let moved = match (old.exists(), new.exists()) {
        (true, false) => false,
        (false, true) => true,
        _ => {
            return Err(
                "重命名恢复位置存在歧义，请保留 .pending-rename.json 并检查原始文件。".into(),
            )
        }
    };
    for change in &journal.changes {
        let path = item(
            root,
            &if moved {
                remap(&change.path, journal)
            } else {
                change.path.clone()
            },
            false,
        )?;
        let current = fs::read_to_string(path).map_err(|e| e.to_string())?;
        if current != change.before && current != change.after {
            return Err(format!("{} 存在额外修改，已停止自动恢复。", change.path));
        }
    }
    for change in &journal.changes {
        let path = item(
            root,
            &if moved {
                remap(&change.path, journal)
            } else {
                change.path.clone()
            },
            false,
        )?;
        crate::storage::write_atomic(&path, change.before.as_bytes())?;
    }
    if moved {
        fs::rename(new, old).map_err(|e| e.to_string())?;
    }
    let history = root.join(".history-renames.json");
    crate::ensure_path_within(root, &history)?;
    if let Some(content) = &journal.history {
        crate::storage::write_atomic(&history, content.as_bytes())?;
    } else if history.exists() {
        fs::remove_file(history).map_err(|e| e.to_string())?;
    }
    fs::remove_file(root.join(".pending-rename.json")).map_err(|e| e.to_string())
}
pub fn recover(root: &Path) -> Result<(), String> {
    let path = root.join(".pending-rename.json");
    crate::ensure_path_within(root, &path)?;
    if !path.exists() {
        return Ok(());
    }
    let journal: Journal = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    rollback(root, &journal)
}
pub fn rename(
    root: &Path,
    old_path: String,
    new_path: String,
    directory: bool,
    changes: Vec<TextChange>,
) -> Result<(), String> {
    recover(root)?;
    let old = item(root, &old_path, directory)?;
    let new = item(root, &new_path, directory)?;
    if old == new {
        return Ok(());
    }
    if new.exists() {
        return Err("目标位置已有同名文件，已取消覆盖。".into());
    }
    if directory && new.starts_with(&old) {
        return Err("不能把文件夹移动到自身内部。".into());
    }
    let mut seen = std::collections::HashSet::new();
    for change in &changes {
        if !seen.insert(change.path.to_lowercase())
            || fs::read_to_string(item(root, &change.path, false)?).map_err(|e| e.to_string())?
                != change.before
        {
            return Err("引用笔记已被外部修改，请刷新后重新移动。".into());
        }
    }
    let history_path = root.join(".history-renames.json");
    crate::ensure_path_within(root, &history_path)?;
    let history = if history_path.exists() {
        Some(fs::read_to_string(history_path).map_err(|e| e.to_string())?)
    } else {
        None
    };
    let journal = Journal {
        old: old_path,
        new: new_path,
        directory,
        changes,
        history,
    };
    crate::storage::write_atomic(
        &root.join(".pending-rename.json"),
        &serde_json::to_vec(&journal).map_err(|e| e.to_string())?,
    )?;
    let result = (|| {
        if let Some(parent) = new.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::rename(old, new).map_err(|e| e.to_string())?;
        for change in &journal.changes {
            let path = remap(&change.path, &journal);
            let backup = root
                .join(".backups")
                .join(crate::validate_data_relative_path(&path)?);
            crate::ensure_path_within(root, &backup)?;
            crate::storage::save_with_backup(
                &item(root, &path, false)?,
                &backup,
                &change.after,
                &change.before,
            )?;
        }
        crate::library::record_history_rename(root, &journal.old, &journal.new, directory)?;
        fs::remove_file(root.join(".pending-rename.json")).map_err(|e| e.to_string())
    })();
    if let Err(error) = result {
        return match rollback(root, &journal) {
            Ok(()) => Err(format!("移动已回退：{error}")),
            Err(restore) => Err(format!(
                "移动未完成：{error}；自动恢复需要处理：{restore}。请保留笔记库与恢复记录。"
            )),
        };
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rename_updates_references_and_rejects_stale_plans() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("a.md"), "A").unwrap();
        fs::write(root.path().join("b.md"), "[[a]]").unwrap();
        let change = TextChange {
            path: "b".into(),
            before: "[[a]]".into(),
            after: "[[c]]".into(),
        };
        rename(root.path(), "a".into(), "c".into(), false, vec![change]).unwrap();
        assert!(root.path().join("c.md").exists());
        assert_eq!(
            fs::read_to_string(root.path().join("b.md")).unwrap(),
            "[[c]]"
        );
        let stale = TextChange {
            path: "b".into(),
            before: "stale".into(),
            after: "bad".into(),
        };
        assert!(rename(root.path(), "c".into(), "d".into(), false, vec![stale]).is_err());
        assert!(root.path().join("c.md").exists());
    }
    #[test]
    fn interrupted_rename_restores_paths_and_original_text() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("new.md"), "A").unwrap();
        fs::write(root.path().join("ref.md"), "[[new]]").unwrap();
        let journal = Journal {
            old: "old".into(),
            new: "new".into(),
            directory: false,
            history: None,
            changes: vec![TextChange {
                path: "ref".into(),
                before: "[[old]]".into(),
                after: "[[new]]".into(),
            }],
        };
        fs::write(
            root.path().join(".pending-rename.json"),
            serde_json::to_vec(&journal).unwrap(),
        )
        .unwrap();
        recover(root.path()).unwrap();
        assert!(root.path().join("old.md").exists());
        assert_eq!(
            fs::read_to_string(root.path().join("ref.md")).unwrap(),
            "[[old]]"
        );
    }
}
