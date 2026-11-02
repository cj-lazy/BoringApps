use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
static HOTKEY: AtomicBool = AtomicBool::new(false);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capture {
    pub mode: String,
    pub title: String,
    pub content: String,
    pub source: String,
    pub day: String,
    pub time: String,
}
#[derive(Serialize)]
pub struct SavedCapture {
    pub path: String,
}
fn valid_day(value: &str) -> bool {
    let parts: Vec<_> = value.split('-').collect();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return false;
    }
    let (Ok(year), Ok(month), Ok(day)) = (
        parts[0].parse::<u32>(),
        parts[1].parse::<u32>(),
        parts[2].parse::<u32>(),
    ) else {
        return false;
    };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    (1970..=9999).contains(&year) && day > 0 && day <= max
}
pub fn write(root: &Path, value: Capture) -> Result<SavedCapture, String> {
    if !valid_day(&value.day)
        || value.time.len() != 8
        || !value.time.bytes().enumerate().all(|(i, c)| {
            if i == 2 || i == 5 {
                c == b':'
            } else {
                c.is_ascii_digit()
            }
        })
    {
        return Err("记录时间无效。".into());
    }
    let time_parts: Vec<u32> = value
        .time
        .split(':')
        .filter_map(|p| p.parse().ok())
        .collect();
    if time_parts.len() != 3 || time_parts[0] > 23 || time_parts[1] > 59 || time_parts[2] > 59 {
        return Err("记录时间无效。".into());
    }
    if value.content.trim().is_empty() || value.content.len() > 2 * 1024 * 1024 {
        return Err("请输入记录内容（最多 2 MB）。".into());
    }
    if !value.source.is_empty()
        && (!value.source.starts_with("https://") && !value.source.starts_with("http://")
            || value.source.contains(['\r', '\n', '<', '>']))
    {
        return Err("来源请填写完整的 http 或 https 链接。".into());
    }
    let title = value.title.trim().replace(['\r', '\n'], " ");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let path = match value.mode.as_str() {
        "daily" => format!("日记/{}", value.day),
        "inbox" => format!("收件箱/{}-{}", value.day, now),
        _ => return Err("记录方式无效。".into()),
    };
    let relative = crate::validate_data_relative_path(&path)?;
    let mut file = relative.into_os_string();
    file.push(".md");
    let file = crate::safe_join(root, &std::path::PathBuf::from(file))?;
    let existing = if file.exists() {
        fs::read_to_string(&file).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let eol = if existing.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut content = existing.clone();
    if content.is_empty() {
        content = format!(
            "# {}{eol}",
            if value.mode == "daily" {
                value.day.clone()
            } else if title.is_empty() {
                "快速记录".into()
            } else {
                title.clone()
            }
        );
    }
    content.push_str(&format!(
        "{eol}## {}{}{eol}{eol}{}{eol}",
        value.time,
        if value.mode == "daily" && !title.is_empty() {
            format!(" · {title}")
        } else {
            String::new()
        },
        value
            .content
            .trim()
            .replace("\r\n", "\n")
            .replace('\n', eol)
    ));
    if !value.source.is_empty() {
        content.push_str(&format!("{eol}[来源](<{}>){eol}", value.source));
    }
    let backup = root
        .join(".backups")
        .join(crate::validate_data_relative_path(&path)?);
    crate::ensure_path_within(root, &backup)?;
    if !file.exists() {
        crate::storage::create_empty_note(&file)?;
    }
    crate::storage::save_with_backup(&file, &backup, &content, &existing)?;
    Ok(SavedCapture { path })
}
#[tauri::command]
pub fn save_capture(
    app: tauri::AppHandle,
    value: Capture,
    expected_root: String,
) -> Result<SavedCapture, String> {
    let _guard = crate::maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let root = crate::get_data_dir();
    if root.as_path() != Path::new(&expected_root) {
        return Err("笔记库已切换，请刷新记录窗口中的笔记库位置后重试；内容仍保留。".into());
    }
    let saved = write(&root, value)?;
    let _ = app.emit("note-captured", &saved);
    Ok(saved)
}
#[tauri::command]
pub async fn show_capture_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick-capture") {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "quick-capture",
        tauri::WebviewUrl::App("index.html?capture=1".into()),
    )
    .title("快速记录 · No.1")
    .inner_size(520., 540.)
    .min_inner_size(400., 420.)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn open_captured_note(app: tauri::AppHandle, path: String) -> Result<(), String> {
    crate::validate_data_relative_path(&path)?;
    app.emit("open-captured-note", path)
        .map_err(|e| e.to_string())?;
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
    Ok(())
}
#[tauri::command]
pub fn capture_hotkey_status() -> bool {
    HOTKEY.load(Ordering::Relaxed)
}
#[tauri::command]
pub fn ensure_daily_note(day: String) -> Result<String, String> {
    if !valid_day(&day) {
        return Err("日期无效。".into());
    }
    let _guard = crate::maintenance::STORAGE_MUTATION
        .lock()
        .map_err(|_| "存储锁不可用")?;
    let root = crate::get_data_dir();
    let path = format!("日记/{day}");
    let file = root.join(format!("{path}.md"));
    crate::ensure_path_within(&root, &file)?;
    if !file.exists() {
        crate::storage::create_empty_note(&file)?;
        crate::ensure_path_within(&root, &root.join(".backups").join(&path))?;
        crate::storage::save_with_backup(
            &file,
            &root.join(".backups").join(&path),
            &format!("---\ntype: 日记\ntags: [日记]\ncreated: '{day}'\n---\n\n# {day}\n\n"),
            "",
        )?;
    }
    Ok(path)
}
#[cfg(windows)]
pub fn register_hotkey(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use windows_sys::Win32::UI::{
            Input::KeyboardAndMouse::{
                RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
            },
            WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY},
        };
        // A thread-owned hotkey is released by Windows when this process exits.
        unsafe {
            if RegisterHotKey(
                std::ptr::null_mut(),
                1043,
                MOD_CONTROL | MOD_ALT | MOD_NOREPEAT,
                0x4e,
            ) == 0
            {
                return;
            }
            HOTKEY.store(true, Ordering::Relaxed);
            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                if message.message == WM_HOTKEY && message.wParam == 1043 {
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = show_capture_window(handle).await;
                    });
                }
            }
            UnregisterHotKey(std::ptr::null_mut(), 1043);
            HOTKEY.store(false, Ordering::Relaxed);
        }
    });
}
#[cfg(not(windows))]
pub fn register_hotkey(_app: tauri::AppHandle) {}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn daily_capture_appends_preserving_existing_math_and_eol() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("日记")).unwrap();
        fs::write(
            root.path().join("日记/2026-11-02.md"),
            "# 日记\r\n\r\n$$a_b$$\r\n",
        )
        .unwrap();
        let saved = write(
            root.path(),
            Capture {
                mode: "daily".into(),
                title: "记录".into(),
                content: "正文".into(),
                source: "https://example.com".into(),
                day: "2026-11-02".into(),
                time: "10:20:30".into(),
            },
        )
        .unwrap();
        assert_eq!(saved.path, "日记/2026-11-02");
        let text = fs::read_to_string(root.path().join("日记/2026-11-02.md")).unwrap();
        assert!(text.starts_with("# 日记\r\n\r\n$$a_b$$\r\n"));
        assert!(text.contains("10:20:30 · 记录\r\n"));
    }
    #[test]
    fn capture_dates_validate_leap_years() {
        assert!(!valid_day("2025-02-29"));
        assert!(valid_day("2024-02-29"));
        assert!(!valid_day("../2026-11-02"));
    }
}
