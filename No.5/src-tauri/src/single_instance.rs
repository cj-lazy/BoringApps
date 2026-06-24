use std::sync::Mutex;
use std::sync::LazyLock;

static MUTEX_HANDLE: LazyLock<Mutex<Option<isize>>> = LazyLock::new(|| Mutex::new(None));

// Direct FFI declarations to avoid windows crate API path issues
extern "system" {
    fn CreateMutexW(
        lpMutexAttributes: *const std::ffi::c_void,
        bInitialOwner: i32,
        lpName: *const u16,
    ) -> isize;

    fn CloseHandle(hObject: isize) -> i32;

    fn ReleaseMutex(hMutex: isize) -> i32;
}

extern "system" {
    fn MessageBoxW(
        hWnd: isize,
        lpText: *const u16,
        lpCaption: *const u16,
        uType: u32,
    ) -> i32;
}

const MB_OK: u32 = 0x00000000;
const MB_ICONINFORMATION: u32 = 0x00000040;

/// Try to acquire the global single-instance mutex.
/// Returns true if this is the first instance, false if another instance is already running.
pub fn acquire_lock() -> bool {
    unsafe {
        let name: Vec<u16> = "Global\\DeskUniqueMutexLock\0"
            .encode_utf16()
            .collect();

        let handle = CreateMutexW(
            std::ptr::null(),
            1, // bInitialOwner = TRUE
            name.as_ptr(),
        );

        if handle == 0 {
            // Failed to create mutex — allow the app to run
            return true;
        }

        let already_exists = std::io::Error::last_os_error().raw_os_error() == Some(183); // ERROR_ALREADY_EXISTS

        if already_exists {
            CloseHandle(handle);
            show_already_running_message();
            return false;
        }

        // First instance — store the handle
        *MUTEX_HANDLE.lock().unwrap() = Some(handle);
        true
    }
}

/// Release the mutex on clean shutdown.
pub fn release_lock() {
    if let Ok(mut guard) = MUTEX_HANDLE.lock() {
        if let Some(handle) = guard.take() {
            unsafe {
                ReleaseMutex(handle);
                CloseHandle(handle);
            }
        }
    }
}

/// Show a message box informing the user that TinyBeauty is already running.
fn show_already_running_message() {
    unsafe {
        let text: Vec<u16> = "Desk is already running in the system tray.\nCheck the notification area for the tray icon.\0"
            .encode_utf16()
            .collect();
        let caption: Vec<u16> = "Desk\0".encode_utf16().collect();

        MessageBoxW(0, text.as_ptr(), caption.as_ptr(), MB_OK | MB_ICONINFORMATION);
    }
}
