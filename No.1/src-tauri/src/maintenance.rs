use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub static STORAGE_MUTATION: Mutex<()> = Mutex::new(());
const DAY: u64 = 86400;
const KEEP_LATEST: usize = 10;

#[derive(Clone, Serialize, Deserialize)]
pub struct Candidate {
    pub path: String,
    pub kind: String,
    pub bytes: u64,
    pub modified_ms: u128,
    pub fingerprint: String,
    pub reason: String,
}
#[derive(Serialize)]
pub struct Preview {
    pub total_bytes: u64,
    pub backup_bytes: u64,
    pub asset_bytes: u64,
    pub trash_bytes: u64,
    pub reclaimable_bytes: u64,
    pub candidates: Vec<Candidate>,
}
#[derive(Serialize)]
pub struct CleanupResult {
    pub removed: usize,
    pub bytes: u64,
    pub errors: Vec<String>,
}
struct Entry {
    path: PathBuf,
    relative: PathBuf,
    bytes: u64,
    modified: SystemTime,
}

fn walk(root: &Path, dir: &Path, entries: &mut Vec<Entry>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        // Unknown references must fail closed, not be treated as unused.
        if kind.is_symlink() {
            return Err(format!(
                "发现链接目录或文件，请先处理后再清理: {}",
                path.display()
            ));
        }
        crate::ensure_path_within(root, &path)?;
        if kind.is_dir() {
            walk(root, &path, entries)?;
        } else if kind.is_file() {
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            entries.push(Entry {
                relative: path
                    .strip_prefix(root)
                    .map_err(|e| e.to_string())?
                    .to_path_buf(),
                path,
                bytes: metadata.len(),
                modified: metadata.modified().map_err(|e| e.to_string())?,
            });
        }
    }
    Ok(())
}
fn fingerprint(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 65536];
    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
fn normalized(text: &str) -> String {
    let mut decoded = text.to_owned();
    for _ in 0..3 {
        let next = percent_decode_str(&decoded)
            .decode_utf8_lossy()
            .into_owned();
        if next == decoded {
            break;
        }
        decoded = next;
    }
    let mut output = String::new();
    let mut rest = decoded.as_str();
    while let Some(index) = rest.find("&#") {
        output.push_str(&rest[..index]);
        rest = &rest[index..];
        if let Some(end) = rest.find(';').filter(|end| *end < 12) {
            let code = &rest[2..end];
            let value = if let Some(hex) = code.strip_prefix('x').or_else(|| code.strip_prefix('X'))
            {
                u32::from_str_radix(hex, 16).ok()
            } else {
                code.parse::<u32>().ok()
            };
            if let Some(character) = value.and_then(char::from_u32) {
                output.push(character);
                rest = &rest[end + 1..];
                continue;
            }
        }
        output.push('&');
        rest = &rest[1..];
    }
    output.push_str(rest);
    output
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace('\\', "")
        .to_lowercase()
}
fn old_enough(entry: &Entry, days: u64) -> bool {
    SystemTime::now()
        .duration_since(entry.modified)
        .unwrap_or_default()
        >= Duration::from_secs(days * DAY)
}
fn candidate(entry: &Entry, kind: &str, reason: &str) -> Result<Candidate, String> {
    Ok(Candidate {
        path: entry.relative.to_string_lossy().replace('\\', "/"),
        kind: kind.into(),
        bytes: entry.bytes,
        modified_ms: entry
            .modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        fingerprint: fingerprint(&entry.path)?,
        reason: reason.into(),
    })
}
pub fn inspect(root: &Path) -> Result<Preview, String> {
    let mut entries = Vec::new();
    walk(root, root, &mut entries)?;
    let mut preview = Preview {
        total_bytes: 0,
        backup_bytes: 0,
        asset_bytes: 0,
        trash_bytes: 0,
        reclaimable_bytes: 0,
        candidates: vec![],
    };
    let mut backup_groups: HashMap<PathBuf, Vec<&Entry>> = HashMap::new();
    let mut orphan_names: HashSet<String> = entries
        .iter()
        .filter(|entry| entry.relative.starts_with("assets"))
        .map(|entry| normalized(&entry.path.file_name().unwrap_or_default().to_string_lossy()))
        .collect();
    // Scan all Markdown, including backups, trash and Markdown attachments.
    // Basename matching is deliberately conservative: false positives keep files.
    for entry in &entries {
        preview.total_bytes += entry.bytes;
        if entry.relative.starts_with(".backups") {
            preview.backup_bytes += entry.bytes;
            if entry
                .path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .starts_with("before-save-")
                && entry
                    .path
                    .extension()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
            {
                backup_groups
                    .entry(entry.path.parent().unwrap().to_path_buf())
                    .or_default()
                    .push(entry);
            }
        }
        if entry.relative.starts_with("assets") {
            preview.asset_bytes += entry.bytes;
        }
        if entry.relative.starts_with(".trash") {
            preview.trash_bytes += entry.bytes;
        }
        if entry.relative.starts_with(".drafts")
            || entry
                .path
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        {
            let text = normalized(&fs::read_to_string(&entry.path).map_err(|e| {
                format!("无法检查引用，已取消清理: {} ({e})", entry.path.display())
            })?);
            orphan_names.retain(|name| !text.contains(name));
        }
    }
    for backups in backup_groups.values_mut() {
        backups.sort_by(|a, b| b.modified.cmp(&a.modified).then(a.path.cmp(&b.path)));
        for entry in backups
            .iter()
            .skip(KEEP_LATEST)
            .filter(|entry| old_enough(entry, 30))
        {
            preview.candidates.push(candidate(
                entry,
                "backup",
                "超过 30 天且不在此笔记最新 10 份备份中",
            )?);
        }
    }
    for entry in &entries {
        if !entry.relative.starts_with("assets")
            || entry
                .relative
                .starts_with(Path::new("assets").join("wallpapers"))
            || !old_enough(entry, 7)
        {
            continue;
        }
        let name = normalized(&entry.path.file_name().unwrap_or_default().to_string_lossy());
        if orphan_names.contains(&name) {
            preview.candidates.push(candidate(
                entry,
                "asset",
                "超过 7 天，当前笔记、备份和回收站均未发现引用",
            )?);
        }
    }
    preview.candidates.sort_by(|a, b| a.path.cmp(&b.path));
    preview.reclaimable_bytes = preview.candidates.iter().map(|item| item.bytes).sum();
    Ok(preview)
}
pub fn clean(root: &Path, selected: Vec<Candidate>) -> Result<CleanupResult, String> {
    // Re-scan on execution. Never trust client-supplied paths or a stale preview.
    let fresh = inspect(root)?;
    let allowed: HashMap<_, _> = fresh
        .candidates
        .iter()
        .map(|item| (item.path.as_str(), item))
        .collect();
    let mut seen = HashSet::new();
    for item in &selected {
        if !seen.insert(item.path.clone()) {
            return Err("选择包含重复文件".into());
        }
        let current = allowed
            .get(item.path.as_str())
            .ok_or("清理列表已变化，请重新扫描")?;
        if current.fingerprint != item.fingerprint
            || current.modified_ms != item.modified_ms
            || current.bytes != item.bytes
        {
            return Err("候选文件已被修改，请重新扫描".into());
        }
    }
    let mut result = CleanupResult {
        removed: 0,
        bytes: 0,
        errors: vec![],
    };
    for item in selected {
        let removal = (|| -> Result<(), String> {
            let relative = crate::validate_relative_path(&item.path, "清理路径")?;
            let path = crate::safe_join(root, &relative)?;
            // Report partial failures accurately, without losing earlier results.
            if fingerprint(&path)? != item.fingerprint {
                return Err("文件已变化，未删除".into());
            }
            fs::remove_file(path).map_err(|error| error.to_string())
        })();
        match removal {
            Ok(()) => {
                result.removed += 1;
                result.bytes += item.bytes;
            }
            Err(error) => result.errors.push(format!("{}: {error}", item.path)),
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn file(root: &Path, name: &str, content: &str, days: u64) -> PathBuf {
        let path = root.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, content).unwrap();
        fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_modified(SystemTime::now() - Duration::from_secs(days * DAY))
            .unwrap();
        path
    }
    #[test]
    fn references_in_backups_trash_and_encoded_names_are_protected() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        file(root, "assets/a/图_片.png", "image", 8);
        file(root, "assets/a/trash.png", "image", 8);
        file(root, "assets/a/orphan.png", "image", 8);
        file(root, "assets/a/recent.png", "image", 1);
        file(root, "assets/wallpapers/wall.png", "image", 50);
        file(
            root,
            ".backups/note/before-save-old.md",
            "![](%E5%9B%BE_%E7%89%87.png)",
            40,
        );
        file(root, ".trash/old.md", "![](trash.png)", 40);
        let preview = inspect(root).unwrap();
        assert_eq!(preview.candidates.len(), 1);
        assert_eq!(preview.candidates[0].path, "assets/a/orphan.png");
        assert!(root.join("assets/a/orphan.png").exists());
    }
    #[test]
    fn backup_retention_keeps_latest_ten_and_all_recent_versions() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        for index in 0..15 {
            file(
                root,
                &format!(".backups/note/before-save-{index}.md"),
                "original",
                35 + index,
            );
        }
        file(root, ".backups/note/before-save-recent.md", "new", 1);
        let preview = inspect(root).unwrap();
        assert_eq!(preview.candidates.len(), 6);
        let result = clean(root, preview.candidates).unwrap();
        assert_eq!(result.removed, 6);
        assert_eq!(
            fs::read_dir(root.join(".backups/note")).unwrap().count(),
            10
        );
    }
    #[test]
    fn stale_preview_and_new_references_abort_without_deleting() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let path = file(root, "assets/old.png", "old", 8);
        let selected = inspect(root).unwrap().candidates;
        file(root, "note.md", "![](old.png)", 0);
        assert!(clean(root, selected.clone()).is_err());
        assert!(path.exists());
        fs::remove_file(root.join("note.md")).unwrap();
        fs::write(&path, "changed").unwrap();
        assert!(clean(root, selected).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "changed");
    }
    #[test]
    fn caller_cannot_delete_arbitrary_files_or_notes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        file(root, "important.md", "keep", 80);
        let forged = Candidate {
            path: "../important.md".into(),
            kind: "asset".into(),
            bytes: 4,
            modified_ms: 0,
            fingerprint: "".into(),
            reason: "".into(),
        };
        assert!(clean(root, vec![forged]).is_err());
        assert!(root.join("important.md").exists());
    }
    #[test]
    fn reference_normalization_is_conservative() {
        assert_eq!(normalized("&#x56fe;\\_片.png"), "图_片.png");
        assert_eq!(normalized("%2520"), " ");
        assert_eq!(normalized("a&amp;b.png"), "a&b.png");
    }
}
