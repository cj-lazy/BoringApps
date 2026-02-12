#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn get_db_path() -> String {
    let exe_path = env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let exe_dir = exe_path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let data_dir = exe_dir.join("考勤数据");

    if !data_dir.exists() {
        let _ = fs::create_dir_all(&data_dir);
    }

    let db_path = data_dir.join("attendance.db");
    format!("sqlite:{}", db_path.to_string_lossy())
}

fn main() {
    tauri::Builder::default()
        // 关键修改：务必初始化 fs 和 dialog 插件
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![get_db_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}