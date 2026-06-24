use std::sync::Mutex;
use std::sync::LazyLock;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, IsWindowVisible, ShowWindow, SW_HIDE, SW_SHOW,
    GetClassNameW,
};
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::core::BOOL;
use windows::core::w;

static ICONS_VISIBLE: LazyLock<Mutex<bool>> = LazyLock::new(|| Mutex::new(true));

/// Find the SysListView32 window that holds desktop icons.
/// Primary path: Progman -> SHELLDLL_DefView -> SysListView32
fn find_sys_list_view_primary() -> Option<HWND> {
    unsafe {
        let progman: HWND = FindWindowW(w!("Progman"), None).ok()?;
        let def_view: HWND = FindWindowExW(Some(progman), None, w!("SHELLDLL_DefView"), None).ok()?;
        FindWindowExW(Some(def_view), None, w!("SysListView32"), None).ok()
    }
}

/// Fallback: EnumWindows to find WorkerW containing SHELLDLL_DefView.
/// This handles the case when Explorer uses a WorkerW to host the desktop.
fn find_sys_list_view_fallback() -> Option<HWND> {
    unsafe {
        let result: Mutex<Option<HWND>> = Mutex::new(None);
        let lparam: LPARAM = LPARAM(&result as *const Mutex<Option<HWND>> as isize);
        let _ = EnumWindows(Some(enum_worker_w_proc), lparam);

        let guard = result.lock().ok()?;
        let worker: HWND = (*guard)?;

        let def_view: HWND = FindWindowExW(Some(worker), None, w!("SHELLDLL_DefView"), None).ok()?;
        FindWindowExW(Some(def_view), None, w!("SysListView32"), None).ok()
    }
}

/// EnumWindows callback to find WorkerW that hosts desktop icons.
unsafe extern "system" fn enum_worker_w_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let result: &Mutex<Option<HWND>> = &*(lparam.0 as *const Mutex<Option<HWND>>);

    let mut class_buf: [u16; 64] = [0; 64];
    let len: i32 = GetClassNameW(hwnd, &mut class_buf);
    let class_name: String = String::from_utf16_lossy(&class_buf[..len as usize]);

    if class_name == "WorkerW" {
        // Check if this WorkerW has a SHELLDLL_DefView child
        if let Ok(_def_view) = FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None) {
            if let Ok(mut guard) = result.lock() {
                *guard = Some(hwnd);
                return BOOL(0); // Stop enumeration
            }
        }
    }
    BOOL(1) // Continue enumeration
}

/// Toggle desktop icon visibility. Returns new state (true = visible).
pub fn toggle() -> Result<bool, String> {
    let hwnd: HWND = find_sys_list_view_primary()
        .or_else(find_sys_list_view_fallback)
        .ok_or_else(|| "Cannot find desktop SysListView32 window".to_string())?;

    unsafe {
        let visible: bool = IsWindowVisible(hwnd).as_bool();
        let new_state: bool = !visible;

        let _ = ShowWindow(hwnd, if new_state { SW_SHOW } else { SW_HIDE });

        if let Ok(mut guard) = ICONS_VISIBLE.lock() {
            *guard = new_state;
        }

        Ok(new_state)
    }
}

/// Set desktop icons to a specific visibility state.
pub fn toggle_to(hidden: bool) -> Result<bool, String> {
    let hwnd: HWND = find_sys_list_view_primary()
        .or_else(find_sys_list_view_fallback)
        .ok_or_else(|| "Cannot find desktop SysListView32 window".to_string())?;

    unsafe {
        let new_state = !hidden;
        let _ = ShowWindow(hwnd, if new_state { SW_SHOW } else { SW_HIDE });

        if let Ok(mut guard) = ICONS_VISIBLE.lock() {
            *guard = new_state;
        }

        Ok(new_state)
    }
}

pub fn get_state() -> Result<bool, String> {
    ICONS_VISIBLE
        .lock()
        .map(|g| *g)
        .map_err(|e| format!("Lock error: {}", e))
}

// --- Tauri Commands ---

#[tauri::command]
pub fn toggle_desktop_icons() -> Result<bool, String> {
    toggle()
}

#[tauri::command]
pub fn get_desktop_icon_state() -> Result<bool, String> {
    get_state()
}
