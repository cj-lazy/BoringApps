use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

pub fn write_atomic(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("目标没有父目录")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut pending = NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    pending.write_all(content).map_err(|e| e.to_string())?;
    pending.as_file().sync_all().map_err(|e| e.to_string())?;
    pending.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn create_empty_note(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // A new note is an empty document, not a Markdown heading template.
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

pub fn save_with_backup(
    path: &Path,
    backup_dir: &Path,
    content: &str,
    expected_content: &str,
) -> Result<(), String> {
    let previous = fs::read_to_string(path)
        .map_err(|e| format!("无法读取原文件，已取消保存（文件可能已被移动或删除）: {e}"))?;
    if previous != expected_content {
        return Err("文件已被其他窗口或程序修改，已取消覆盖；编辑器中的修改仍然保留".into());
    }
    if content == previous {
        return Ok(());
    }

    let parent = path.parent().ok_or("笔记没有父目录")?;
    let mut pending = NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    pending
        .write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    pending.as_file().sync_all().map_err(|e| e.to_string())?;

    // Keep the exact pre-conversion Markdown. Failure to back it up aborts the save.
    fs::create_dir_all(backup_dir).map_err(|e| e.to_string())?;
    let mut backup = tempfile::Builder::new()
        .prefix("before-save-")
        .suffix(".md")
        .tempfile_in(backup_dir)
        .map_err(|e| e.to_string())?;
    backup
        .write_all(previous.as_bytes())
        .map_err(|e| e.to_string())?;
    backup.as_file().sync_all().map_err(|e| e.to_string())?;
    backup.keep().map_err(|e| e.to_string())?;

    // Check again after preparing the files, before atomically replacing the note.
    if fs::read_to_string(path).map_err(|e| e.to_string())? != previous {
        return Err("保存期间原文件发生变化，已取消覆盖".into());
    }
    pending.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_notes_are_empty_and_never_overwrite_existing_notes() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("子目录/新笔记.md");
        create_empty_note(&path).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"");
        fs::write(&path, "已有笔记").unwrap();
        assert!(create_empty_note(&path).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "已有笔记");
    }

    #[test]
    fn save_replaces_content_and_keeps_exact_original() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("中文.md");
        let backups = root.path().join("backups");
        fs::write(&path, "| a | b |\r\n|---|---|\r\n").unwrap();
        save_with_backup(&path, &backups, "new", "| a | b |\r\n|---|---|\r\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        let backup = fs::read_dir(backups)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(
            fs::read_to_string(backup).unwrap(),
            "| a | b |\r\n|---|---|\r\n"
        );
    }

    #[test]
    fn conflicts_and_missing_files_never_overwrite_or_recreate_notes() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("note.md");
        let backups = root.path().join("backups");
        fs::write(&path, "external edit").unwrap();
        assert!(save_with_backup(&path, &backups, "ours", "old").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "external edit");
        fs::remove_file(&path).unwrap();
        assert!(save_with_backup(&path, &backups, "ours", "old").is_err());
        assert!(!path.exists());
    }

    #[test]
    fn failed_backup_leaves_original_intact() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("note.md");
        let backups = root.path().join("not-a-directory");
        fs::write(&path, "old").unwrap();
        fs::write(&backups, "occupied").unwrap();
        assert!(save_with_backup(&path, &backups, "new", "old").is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "old");
    }

    #[test]
    fn unchanged_notes_do_not_create_backups() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("note.md");
        let backups = root.path().join("backups");
        fs::write(&path, "same").unwrap();
        save_with_backup(&path, &backups, "same", "same").unwrap();
        assert!(!backups.exists());
    }
}
