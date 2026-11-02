use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::Manager;

#[derive(Default, Serialize, Deserialize)]
struct Config {
    current: Option<PathBuf>,
    #[serde(default)]
    recent: Vec<PathBuf>,
}
struct State {
    root: PathBuf,
    lock: Option<File>,
    recent: Vec<PathBuf>,
    warning: Option<String>,
}
static STATE: OnceLock<Mutex<State>> = OnceLock::new();
fn friendly_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{unc}"))
    } else if let Some(drive) = text.strip_prefix(r"\\?\") {
        PathBuf::from(drive)
    } else {
        path.to_owned()
    }
}
fn config_path() -> PathBuf {
    std::env::current_exe()
        .expect("程序路径不可用")
        .parent()
        .unwrap()
        .join(".no1-libraries.json")
}
fn state() -> &'static Mutex<State> {
    STATE.get_or_init(|| {
        let default = std::env::current_exe()
            .expect("程序路径不可用")
            .parent()
            .unwrap()
            .join("data");
        let config: Config = fs::read(config_path())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let warning = config.current.as_ref().filter(|p| !p.is_dir()).map(|p| {
            format!(
                "上次的笔记库无法访问：{}；当前打开程序旁的 data。",
                p.display()
            )
        });
        let root = config
            .current
            .filter(|p| p.is_absolute() && p.is_dir())
            .unwrap_or(default);
        let _ = fs::create_dir_all(&root);
        let root = fs::canonicalize(&root)
            .map(|p| friendly_path(&p))
            .unwrap_or(root);
        Mutex::new(State {
            root,
            lock: None,
            recent: config.recent,
            warning,
        })
    })
}
pub fn root() -> PathBuf {
    state().lock().expect("笔记库状态不可用").root.clone()
}
fn acquire(root: &Path) -> Result<File, String> {
    let path = root.join(".no1.lock");
    crate::ensure_path_within(root, &path)?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.try_lock()
        .map_err(|_| "这个笔记库正由另一个 No.1 程序使用，请先关闭那个窗口。".to_string())?;
    Ok(file)
}
pub fn initialize() -> Result<(), String> {
    let mut state = state().lock().map_err(|_| "笔记库状态不可用")?;
    if state.lock.is_none() {
        state.lock = Some(acquire(&state.root)?);
    }
    crate::rename_links::recover(&state.root)?;
    crate::batch_notes::recover(&state.root)?;
    Ok(())
}
#[derive(Serialize)]
pub struct Status {
    root: String,
    recent: Vec<String>,
    warning: Option<String>,
}
#[tauri::command]
pub fn library_status() -> Result<Status, String> {
    let state = state().lock().map_err(|_| "笔记库状态不可用")?;
    Ok(Status {
        root: state.root.to_string_lossy().to_string(),
        recent: state
            .recent
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
        warning: state.warning.clone(),
    })
}
#[tauri::command]
pub fn switch_library(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let _mutation = crate::maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let requested = PathBuf::from(path);
    if !requested.is_absolute() || !requested.is_dir() {
        return Err("请选择已存在的笔记库文件夹。空文件夹也可以作为新笔记库。".into());
    }
    let root = friendly_path(&fs::canonicalize(requested).map_err(|e| e.to_string())?);
    let mut state = state().lock().map_err(|_| "笔记库状态不可用")?;
    if state.root == root {
        return Ok(());
    }
    let lock = acquire(&root)?;
    crate::rename_links::recover(&root)?;
    crate::batch_notes::recover(&root)?;
    let assets = root.join("assets");
    fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
    crate::ensure_path_within(&root, &assets)?;
    app.asset_protocol_scope()
        .allow_directory(&assets, true)
        .map_err(|e| e.to_string())?;
    let mut recent = vec![root.clone(), state.root.clone()];
    for path in &state.recent {
        if !recent.contains(path) {
            recent.push(path.clone());
        }
    }
    recent.truncate(12);
    crate::storage::write_atomic(
        &config_path(),
        &serde_json::to_vec_pretty(&Config {
            current: Some(root.clone()),
            recent: recent.clone(),
        })
        .map_err(|e| e.to_string())?,
    )?;
    // Keep the previous lock until selection has been persisted successfully.
    state.root = root;
    state.lock = Some(lock);
    state.recent = recent;
    state.warning = None;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
struct BackupFile {
    path: String,
    bytes: u64,
    sha256: String,
}
#[derive(Serialize, Deserialize)]
struct Manifest {
    format: String,
    version: u32,
    files: Vec<BackupFile>,
    directories: Vec<String>,
}
#[derive(Serialize)]
pub struct BackupResult {
    pub path: String,
    pub files: usize,
    pub bytes: u64,
}
fn digest(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let len = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if len == 0 {
            break;
        }
        hash.update(&buffer[..len]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn inventory(root: &Path) -> Result<Manifest, String> {
    fn walk(root: &Path, dir: &Path, manifest: &mut Manifest) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() {
                return Err(format!(
                    "备份包含链接文件或目录，请先移出笔记库：{}",
                    path.display()
                ));
            }
            crate::ensure_path_within(root, &path)?;
            let relative = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if relative == ".no1.lock" || relative == ".no1-backup.json" || relative == ".uploads" {
                continue;
            }
            if kind.is_dir() {
                manifest.directories.push(relative);
                walk(root, &path, manifest)?;
            } else if kind.is_file() {
                manifest.files.push(BackupFile {
                    path: relative,
                    bytes: entry.metadata().map_err(|e| e.to_string())?.len(),
                    sha256: digest(&path)?,
                });
            }
        }
        Ok(())
    }
    let mut manifest = Manifest {
        format: "no1-library-backup".into(),
        version: 1,
        files: vec![],
        directories: vec![],
    };
    walk(root, root, &mut manifest)?;
    manifest.files.sort_by(|a, b| a.path.cmp(&b.path));
    manifest.directories.sort();
    Ok(manifest)
}
fn read_verified(root: &Path) -> Result<Manifest, String> {
    let manifest_path = root.join(".no1-backup.json");
    crate::ensure_path_within(root, &manifest_path)?;
    let manifest: Manifest = serde_json::from_slice(
        &fs::read(manifest_path).map_err(|_| "所选目录不是 No.1 的完整备份（缺少清单）。")?,
    )
    .map_err(|e| format!("备份清单损坏：{e}"))?;
    if manifest.format != "no1-library-backup" || manifest.version != 1 {
        return Err("不支持这个备份格式。".into());
    }
    let mut paths = std::collections::HashSet::new();
    for path in manifest
        .directories
        .iter()
        .chain(manifest.files.iter().map(|f| &f.path))
    {
        let relative = crate::validate_relative_path(path, "备份条目")?;
        crate::safe_join(root, &relative)?;
        if path == ".no1.lock" || path == ".no1-backup.json" || !paths.insert(path.to_lowercase()) {
            return Err("备份清单存在重复或保留路径。".into());
        }
    }
    let actual = inventory(root)?;
    if actual.directories != manifest.directories || actual.files.len() != manifest.files.len() {
        return Err("备份目录与清单不符，已停止恢复。".into());
    }
    for file in &manifest.files {
        if !actual
            .files
            .iter()
            .any(|a| a.path == file.path && a.bytes == file.bytes && a.sha256 == file.sha256)
        {
            return Err(format!("备份校验失败：{}", file.path));
        }
    }
    Ok(manifest)
}
fn copy_verified(
    source: &Path,
    parent: &Path,
    manifest: &Manifest,
    prefix: &str,
) -> Result<BackupResult, String> {
    let parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
    let source = fs::canonicalize(source).map_err(|e| e.to_string())?;
    if parent.starts_with(&source) {
        return Err("目标位置不能位于源文件夹内。".into());
    }
    let stage = tempfile::Builder::new()
        .prefix(".no1-copy-")
        .tempdir_in(&parent)
        .map_err(|e| e.to_string())?;
    for dir in &manifest.directories {
        fs::create_dir_all(
            stage
                .path()
                .join(crate::validate_relative_path(dir, "备份目录")?),
        )
        .map_err(|e| e.to_string())?;
    }
    for file in &manifest.files {
        let relative = crate::validate_relative_path(&file.path, "备份文件")?;
        let from = crate::safe_join(&source, &relative)?;
        let to = stage.path().join(relative);
        if let Some(dir) = to.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::copy(from, &to).map_err(|e| e.to_string())?;
        if fs::metadata(&to).map_err(|e| e.to_string())?.len() != file.bytes
            || digest(&to)? != file.sha256
        {
            return Err(format!(
                "复制期间文件发生变化：{}；未生成不完整副本。",
                file.path
            ));
        }
    }
    if prefix == "backup" {
        let mut file =
            File::create(stage.path().join(".no1-backup.json")).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    let suffix = stage
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .trim_start_matches(".no1-copy-")
        .to_owned();
    let final_path = parent.join(format!("No1-{prefix}-{suffix}"));
    if final_path.exists() {
        return Err("目标文件夹已存在，已取消覆盖。".into());
    }
    // Atomic directory rename publishes a complete verified copy only.
    fs::rename(stage.path(), &final_path).map_err(|e| e.to_string())?;
    Ok(BackupResult {
        path: friendly_path(&final_path).to_string_lossy().to_string(),
        files: manifest.files.len(),
        bytes: manifest.files.iter().map(|f| f.bytes).sum(),
    })
}
#[tauri::command]
pub async fn backup_library(destination: String) -> Result<BackupResult, String> {
    let root = root();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = crate::maintenance::STORAGE_MUTATION
            .lock()
            .map_err(|_| "存储锁不可用")?;
        let manifest = inventory(&root)?;
        copy_verified(&root, Path::new(&destination), &manifest, "backup")
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn inspect_library_backup(path: String) -> Result<BackupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manifest = read_verified(Path::new(&path))?;
        Ok(BackupResult {
            path,
            files: manifest.files.len(),
            bytes: manifest.files.iter().map(|f| f.bytes).sum(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn restore_library_backup(
    source: String,
    destination: String,
) -> Result<BackupResult, String> {
    let active = root();
    tauri::async_runtime::spawn_blocking(move || {
        let parent = fs::canonicalize(&destination).map_err(|e| e.to_string())?;
        if parent.starts_with(fs::canonicalize(&active).map_err(|e| e.to_string())?) {
            return Err("请选择当前笔记库之外的恢复位置。".into());
        }
        let manifest = read_verified(Path::new(&source))?;
        copy_verified(Path::new(&source), &parent, &manifest, "restored")
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_library_lock_prevents_two_writers() {
        let root = tempfile::tempdir().unwrap();
        let lock = acquire(root.path()).unwrap();
        assert!(acquire(root.path()).is_err());
        drop(lock);
        assert!(acquire(root.path()).is_ok());
    }
    #[test]
    fn complete_backup_restores_assets_history_settings_and_empty_folders() {
        let source = tempfile::tempdir().unwrap();
        let destination = tempfile::tempdir().unwrap();
        fs::create_dir_all(source.path().join("assets/empty")).unwrap();
        fs::write(source.path().join("笔记.md"), "正文").unwrap();
        fs::write(source.path().join(".workspace.json"), "{}").unwrap();
        let manifest = inventory(source.path()).unwrap();
        let backup = copy_verified(source.path(), destination.path(), &manifest, "backup").unwrap();
        fs::write(
            Path::new(&backup.path).join(".no1-backup.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        let verified = read_verified(Path::new(&backup.path)).unwrap();
        let restored = copy_verified(
            Path::new(&backup.path),
            destination.path(),
            &verified,
            "restore",
        )
        .unwrap();
        assert!(Path::new(&restored.path).join("assets/empty").is_dir());
        assert_eq!(
            fs::read_to_string(Path::new(&restored.path).join("笔记.md")).unwrap(),
            "正文"
        );
        fs::write(Path::new(&backup.path).join("笔记.md"), "篡改").unwrap();
        assert!(read_verified(Path::new(&backup.path)).is_err());
        assert!(copy_verified(source.path(), source.path(), &manifest, "backup").is_err());
    }
}
