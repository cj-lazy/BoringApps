#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};

pub mod single_instance;
mod system_tray;
mod memory;
pub mod desktop_icons;
mod mouse_hook;
mod registry;

static USER_QUIT: AtomicBool = AtomicBool::new(false);

#[tauri::command] fn get_app_version() -> String { "1.0.0".into() }

#[tauri::command]
fn quit_application(app: tauri::AppHandle) {
    USER_QUIT.store(true, Ordering::SeqCst);
    mouse_hook::stop();
    single_instance::release_lock();
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let h = app.handle().clone();
            system_tray::create_tray(&h)?;
            mouse_hook::start(h.clone());
            memory::spawn_memory_optimizer(h.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_icons::toggle_desktop_icons,
            desktop_icons::get_desktop_icon_state,
            registry::set_autostart_state,
            registry::get_autostart_state,
            get_app_version,
            quit_application,
        ])
        .build(tauri::generate_context!())
        .expect("error building app")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !USER_QUIT.load(Ordering::SeqCst) { api.prevent_exit(); }
            }
        });
}
