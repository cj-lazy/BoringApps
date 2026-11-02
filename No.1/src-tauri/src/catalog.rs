use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::UNIX_EPOCH,
};

pub struct IndexedNote {
    pub path: String,
    pub source: String,
    pub lower: String,
    pub stamp: String,
    pub modified_ms: u64,
}
#[derive(Default)]
struct Cache {
    notes: BTreeMap<String, Arc<IndexedNote>>,
}
static CACHE: OnceLock<Mutex<HashMap<PathBuf, Cache>>> = OnceLock::new();
pub struct Snapshot {
    pub notes: Vec<Arc<IndexedNote>>,
    pub warnings: Vec<String>,
    pub reread: usize,
}

pub fn snapshot(root: &Path, force: bool) -> Result<Snapshot, String> {
    let canonical = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let mut caches = CACHE
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "索引不可用")?;
    let cache = caches.entry(canonical).or_default();
    let mut present = HashSet::new();
    let mut warnings = Vec::new();
    let mut reread = 0;
    fn walk(
        root: &Path,
        dir: &Path,
        cache: &mut Cache,
        present: &mut HashSet<String>,
        warnings: &mut Vec<String>,
        reread: &mut usize,
        force: bool,
    ) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if name.starts_with('.') || name.eq_ignore_ascii_case("assets") || kind.is_symlink() {
                continue;
            }
            let file = entry.path();
            crate::ensure_path_within(root, &file)?;
            if kind.is_dir() {
                walk(root, &file, cache, present, warnings, reread, force)?;
            } else if kind.is_file()
                && file
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("md"))
            {
                let path = file
                    .strip_prefix(root)
                    .map_err(|e| e.to_string())?
                    .with_extension("")
                    .to_string_lossy()
                    .replace('\\', "/");
                let metadata = entry.metadata().map_err(|e| e.to_string())?;
                let modified = metadata
                    .modified()
                    .map_err(|e| e.to_string())?
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default();
                let stamp = format!("{}:{}", modified.as_nanos(), metadata.len());
                present.insert(path.clone());
                if !force
                    && cache
                        .notes
                        .get(&path)
                        .is_some_and(|note| note.stamp == stamp)
                {
                    continue;
                }
                match fs::read_to_string(&file) {
                    Ok(source) => {
                        *reread += 1;
                        cache.notes.insert(
                            path.clone(),
                            Arc::new(IndexedNote {
                                path,
                                lower: source.to_lowercase(),
                                source,
                                stamp,
                                modified_ms: modified.as_millis() as u64,
                            }),
                        );
                    }
                    Err(error) => {
                        cache.notes.remove(&path);
                        warnings.push(format!("{path}: {error}"));
                    }
                }
            }
        }
        Ok(())
    }
    walk(
        root,
        root,
        cache,
        &mut present,
        &mut warnings,
        &mut reread,
        force,
    )?;
    cache.notes.retain(|path, _| present.contains(path));
    Ok(Snapshot {
        notes: cache.notes.values().cloned().collect(),
        warnings,
        reread,
    })
}
#[derive(Serialize)]
pub struct Record {
    path: String,
    source: String,
    stamp: String,
    modified_ms: u64,
}
#[derive(Serialize)]
pub struct Delta {
    root: String,
    notes: Vec<Record>,
    removed: Vec<String>,
    warnings: Vec<String>,
    reread: usize,
    total: usize,
}
#[tauri::command]
pub async fn catalog_delta(
    known: HashMap<String, String>,
    force: Option<bool>,
) -> Result<Delta, String> {
    let root = crate::get_data_dir();
    tauri::async_runtime::spawn_blocking(move || {
        let snapshot = snapshot(&root, force.unwrap_or(false))?;
        let present: HashSet<_> = snapshot.notes.iter().map(|n| n.path.as_str()).collect();
        let removed = known
            .keys()
            .filter(|p| !present.contains(p.as_str()))
            .cloned()
            .collect();
        let notes = snapshot
            .notes
            .iter()
            .filter(|n| known.get(&n.path) != Some(&n.stamp))
            .map(|n| Record {
                path: n.path.clone(),
                source: n.source.clone(),
                stamp: n.stamp.clone(),
                modified_ms: n.modified_ms,
            })
            .collect();
        Ok(Delta {
            root: root.to_string_lossy().to_string(),
            total: snapshot.notes.len(),
            notes,
            removed,
            warnings: snapshot.warnings,
            reread: snapshot.reread,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn incremental_index_reuses_reads_and_tracks_changes_and_deletes() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("中文.md"), "first").unwrap();
        assert_eq!(snapshot(dir.path(), false).unwrap().reread, 1);
        assert_eq!(snapshot(dir.path(), false).unwrap().reread, 0);
        fs::write(dir.path().join("中文.md"), "changed source").unwrap();
        let changed = snapshot(dir.path(), false).unwrap();
        assert_eq!(changed.reread, 1);
        assert_eq!(changed.notes[0].source, "changed source");
        assert_eq!(snapshot(dir.path(), true).unwrap().reread, 1);
        fs::remove_file(dir.path().join("中文.md")).unwrap();
        assert!(snapshot(dir.path(), false).unwrap().notes.is_empty());
    }
}
