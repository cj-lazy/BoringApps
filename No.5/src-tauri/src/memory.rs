use std::time::Duration;
use tauri::Manager;

// Direct FFI for memory management APIs
extern "system" {
    fn GetCurrentProcess() -> isize;
    fn EmptyWorkingSet(hProcess: isize) -> i32;
}

/// Spawn a background thread that periodically checks if all windows are closed
/// and, if so, calls EmptyWorkingSet to reduce physical RAM usage.
pub fn spawn_memory_optimizer(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(30));

            // Count open WebView2 windows
            let windows = app_handle.webview_windows();
            let webview_count = windows.len();

            if webview_count == 0 {
                // All windows closed — release working set to minimize physical RAM
                unsafe {
                    let process = GetCurrentProcess();
                    EmptyWorkingSet(process);
                }
            }
        }
    });
}

#[allow(dead_code)]
pub fn trigger_gc() {
    std::thread::spawn(|| {
        // Small delay to let the window cleanup complete
        std::thread::sleep(Duration::from_millis(500));
        unsafe {
            let process = GetCurrentProcess();
            EmptyWorkingSet(process);
        }
    });
}
