// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Single instance check must happen before any Tauri initialization
    if !desk_lib::single_instance::acquire_lock() {
        return;
    }
    desk_lib::run();
}
