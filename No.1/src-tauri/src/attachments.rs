use crate::jobs::{Job, Progress};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashMap},
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::ipc::Channel;
use tempfile::NamedTempFile;
struct Upload {
    file: NamedTempFile,
    root: PathBuf,
    name: String,
    expected: u64,
    written: u64,
    hash: Sha256,
}
static UPLOADS: OnceLock<Mutex<HashMap<String, Upload>>> = OnceLock::new();
fn uploads() -> &'static Mutex<HashMap<String, Upload>> {
    UPLOADS.get_or_init(Default::default)
}
fn begin(root: &Path, name: String, size: u64) -> Result<(String, Upload), String> {
    crate::single_file_name(&name)?;
    let pending = root.join(".uploads");
    crate::ensure_path_within(root, &pending)?;
    fs::create_dir_all(&pending).map_err(|e| e.to_string())?;
    let file = tempfile::Builder::new()
        .prefix("no1-upload-")
        .suffix(".tmp")
        .tempfile_in(pending)
        .map_err(|e| e.to_string())?;
    let id = file
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();
    Ok((
        id,
        Upload {
            file,
            root: root.to_owned(),
            name,
            expected: size,
            written: 0,
            hash: Sha256::new(),
        },
    ))
}
fn append(upload: &mut Upload, offset: u64, bytes: &[u8]) -> Result<(), String> {
    if offset != upload.written
        || bytes.len() > 512 * 1024
        || offset.saturating_add(bytes.len() as u64) > upload.expected
    {
        return Err("附件分块顺序或大小不正确，请重新导入。".into());
    }
    upload.file.write_all(bytes).map_err(|e| e.to_string())?;
    upload.hash.update(bytes);
    upload.written += bytes.len() as u64;
    Ok(())
}
fn digest(path: &Path, job: Option<&Job>) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        if let Some(job) = job {
            job.check()?;
        }
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
#[derive(Serialize)]
pub struct Imported {
    pub url: String,
    pub reused: bool,
    pub bytes: u64,
}
fn finish(upload: Upload) -> Result<Imported, String> {
    if upload.written != upload.expected {
        return Err("附件尚未完整读取。".into());
    }
    upload
        .file
        .as_file()
        .sync_all()
        .map_err(|e| e.to_string())?;
    let hash = format!("{:x}", upload.hash.finalize());
    let shared = upload.root.join("assets/shared");
    crate::ensure_path_within(&upload.root, &shared)?;
    fs::create_dir_all(&shared).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(&shared).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_file()
            && entry.path().file_stem().is_some_and(|s| s == hash.as_str())
        {
            crate::ensure_path_within(&upload.root, &entry.path())?;
            if digest(&entry.path(), None)? == hash {
                return Ok(Imported {
                    url: format!("assets/shared/{}", entry.file_name().to_string_lossy()),
                    reused: true,
                    bytes: upload.written,
                });
            }
        }
    }
    let extension = Path::new(&upload.name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("bin")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(12)
        .collect::<String>()
        .to_lowercase();
    let name = format!(
        "{}.{}",
        hash,
        if extension.is_empty() {
            "bin"
        } else {
            &extension
        }
    );
    let path = shared.join(&name);
    // Content addresses are never overwritten, even if an existing file is damaged.
    upload
        .file
        .persist_noclobber(&path)
        .map_err(|e| format!("无法保存附件（现有同名文件保留）：{e}"))?;
    Ok(Imported {
        url: format!("assets/shared/{name}"),
        reused: false,
        bytes: upload.written,
    })
}
#[tauri::command]
pub fn begin_asset_upload(name: String, size: u64) -> Result<String, String> {
    let root = crate::get_data_dir();
    let (id, upload) = begin(&root, name, size)?;
    uploads()
        .lock()
        .map_err(|_| "导入状态不可用")?
        .insert(id.clone(), upload);
    Ok(id)
}
#[tauri::command]
pub fn append_asset_upload(id: String, offset: u64, payload: Vec<u8>) -> Result<(), String> {
    let root = crate::get_data_dir();
    let mut map = uploads().lock().map_err(|_| "导入状态不可用")?;
    let upload = map.get_mut(&id).ok_or("导入已取消或程序已重启。")?;
    if upload.root != root {
        return Err("笔记库已切换，导入已停止。".into());
    }
    append(upload, offset, &payload)
}
#[tauri::command]
pub fn finish_asset_upload(id: String) -> Result<Imported, String> {
    let _guard = crate::maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let upload = uploads()
        .lock()
        .map_err(|_| "导入状态不可用")?
        .remove(&id)
        .ok_or("导入不存在。")?;
    if upload.root != crate::get_data_dir() {
        return Err("笔记库已切换，导入已停止。".into());
    }
    finish(upload)
}
#[tauri::command]
pub fn cancel_asset_upload(id: String) -> Result<(), String> {
    uploads().lock().map_err(|_| "导入状态不可用")?.remove(&id);
    Ok(())
}

#[derive(Serialize)]
pub struct Asset {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}
fn asset_files(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    crate::ensure_path_within(root, dir)?;
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            continue;
        }
        let path = entry.path();
        crate::ensure_path_within(root, &path)?;
        if kind.is_dir() {
            asset_files(root, &path, out)?;
        } else if kind.is_file() {
            out.push(path);
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn inspect_attachments(
    job_id: String,
    on_progress: Channel<Progress>,
) -> Result<Vec<Asset>, String> {
    let job = Job::begin(job_id)?;
    let root = crate::get_data_dir();
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = vec![];
        asset_files(&root, &root.join("assets"), &mut files)?;
        let total = files.len() as u64;
        let mut assets = vec![];
        for (index, path) in files.into_iter().enumerate() {
            job.check()?;
            let bytes = fs::metadata(&path).map_err(|e| e.to_string())?.len();
            let sha256 = digest(&path, Some(&job))?;
            let relative = path
                .strip_prefix(&root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let _ = on_progress.send(Progress {
                completed: index as u64 + 1,
                total,
                label: relative.clone(),
            });
            assets.push(Asset {
                path: relative,
                bytes,
                sha256,
            });
        }
        Ok(assets)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn import_asset_file(
    source: String,
    job_id: String,
    on_progress: Channel<Progress>,
) -> Result<Imported, String> {
    let job = Job::begin(job_id)?;
    let root = crate::get_data_dir();
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(source);
        if !path.is_absolute() || !path.is_file() {
            return Err("请选择已有文件。".into());
        }
        let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
        let name = path
            .file_name()
            .ok_or("附件名称无效")?
            .to_string_lossy()
            .to_string();
        let (_, mut upload) = begin(&root, name, size)?;
        let mut input = File::open(path).map_err(|e| e.to_string())?;
        let mut buffer = [0; 262144];
        loop {
            job.check()?;
            let count = input.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            let offset = upload.written;
            append(&mut upload, offset, &buffer[..count])?;
            let _ = on_progress.send(Progress {
                completed: upload.written,
                total: size,
                label: upload.name.clone(),
            });
        }
        job.check()?;
        let _guard = crate::maintenance::STORAGE_MUTATION
            .lock()
            .map_err(|_| "存储锁不可用")?;
        if root != crate::get_data_dir() {
            return Err("笔记库已切换，导入已停止。".into());
        }
        finish(upload)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn export_note_package(
    destination: String,
    name: String,
    source: String,
    assets: Vec<String>,
    job_id: String,
    on_progress: Channel<Progress>,
) -> Result<(), String> {
    let job = Job::begin(job_id)?;
    let root = crate::get_data_dir();
    tauri::async_runtime::spawn_blocking(move || {
        use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};
        let output = PathBuf::from(destination);
        if !output.is_absolute()
            || !output
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
        {
            return Err("请选择 ZIP 导出位置。".into());
        }
        let parent = output.parent().ok_or("导出位置无效")?;
        let mut temp = NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        let mut files = vec![];
        let mut total = source.len() as u64;
        for relative in assets.into_iter().collect::<BTreeSet<_>>() {
            let validated = crate::validate_relative_path(&relative, "附件路径")?;
            if !validated.starts_with("assets") {
                return Err("资料包只能包含笔记库附件。".into());
            }
            let path = crate::safe_join(&root, &validated)?;
            let size = fs::metadata(&path)
                .map_err(|e| format!("附件缺失，导出未覆盖原文件：{relative} ({e})"))?
                .len();
            total += size;
            files.push((relative, path));
        }
        {
            let mut zip = ZipWriter::new(temp.as_file_mut());
            let options =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            let file_name = crate::single_file_name(&(name + ".md"))?;
            zip.start_file(file_name.to_string_lossy().as_ref(), options)
                .map_err(|e| e.to_string())?;
            zip.write_all(source.as_bytes())
                .map_err(|e| e.to_string())?;
            let mut completed = source.len() as u64;
            let mut buffer = [0; 262144];
            for (relative, path) in files {
                job.check()?;
                zip.start_file(&relative, options.large_file(true))
                    .map_err(|e| e.to_string())?;
                let mut file = File::open(path).map_err(|e| e.to_string())?;
                loop {
                    job.check()?;
                    let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
                    if count == 0 {
                        break;
                    }
                    zip.write_all(&buffer[..count]).map_err(|e| e.to_string())?;
                    completed += count as u64;
                    let _ = on_progress.send(Progress {
                        completed,
                        total,
                        label: relative.clone(),
                    });
                }
            }
            zip.start_file("使用说明.txt", options)
                .map_err(|e| e.to_string())?;
            zip.write_all(
                "完整解压后打开 Markdown，保留 assets 目录。远程链接保持原样。\n".as_bytes(),
            )
            .map_err(|e| e.to_string())?;
            zip.finish().map_err(|e| e.to_string())?;
        }
        job.check()?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(output).map_err(|e| e.to_string())?;
        let _ = on_progress.send(Progress {
            completed: total,
            total,
            label: "完成".into(),
        });
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chunk_upload_checks_order_and_reuses_identical_bytes() {
        let root = tempfile::tempdir().unwrap();
        let (_, mut a) = begin(root.path(), "a.txt".into(), 3).unwrap();
        assert!(append(&mut a, 1, b"abc").is_err());
        append(&mut a, 0, b"abc").unwrap();
        let first = finish(a).unwrap();
        assert!(!first.reused);
        let (_, mut b) = begin(root.path(), "different.bin".into(), 3).unwrap();
        append(&mut b, 0, b"abc").unwrap();
        let second = finish(b).unwrap();
        assert!(second.reused);
        assert_eq!(first.url, second.url);
    }
    #[test]
    fn incomplete_upload_does_not_publish_attachment() {
        let root = tempfile::tempdir().unwrap();
        let (_, mut a) = begin(root.path(), "a.txt".into(), 3).unwrap();
        append(&mut a, 0, b"a").unwrap();
        assert!(finish(a).is_err());
        assert!(!root.path().join("assets/shared").exists());
    }
}
